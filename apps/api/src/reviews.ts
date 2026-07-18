import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { rateLimitAllow } from "./auth/rateLimit";
import type { User } from "./auth/session";

type Bindings = { DB_CONN: string };

// INV-masked-identity: raw guest name is never returned publicly.
// Produces "Marie T." from first_name + last_name; falls back to the first
// word of the composite `name` column when split names are unavailable.
export function maskDisplayName(
  firstName: string | null,
  lastName: string | null,
  name: string
): string {
  const fn = firstName?.trim() ?? "";
  if (fn) {
    const lastInitial = lastName?.trim().charAt(0).toUpperCase() ?? "";
    return lastInitial ? `${fn} ${lastInitial}.` : fn;
  }
  const firstWord = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return firstWord || (name ?? "").trim();
}

// Compute stays_count and nights_total snapshot at submission time.
// Guest key: user_id when set, else lower(email). Counts only confirmed
// reservations with depart ≤ today (including the stay being reviewed).
export async function computeGuestStats(
  sql: (...args: any[]) => any,
  userId: number | null,
  email: string
): Promise<{ staysCount: number; nightsTotal: number }> {
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS stays_count,
      COALESCE(SUM(depart - arrive), 0)::int AS nights_total
    FROM reservations
    WHERE status = 'confirmed'
      AND depart <= CURRENT_DATE
      AND (
        (${userId} IS NOT NULL AND user_id = ${userId})
        OR (${userId} IS NULL AND lower(email) = lower(${email}))
      )
  `) as { stays_count: number; nights_total: number }[];
  const row = rows[0];
  return {
    staysCount: row?.stays_count ?? 0,
    nightsTotal: row?.nights_total ?? 0,
  };
}

const ReviewSubmitSchema = z.object({
  code: z.string().min(1, "code requis"),
  rating: z.coerce.number().int().min(1, "La note doit être entre 1 et 5").max(5, "La note doit être entre 1 et 5"),
  body: z
    .string()
    .min(10, "L'avis doit contenir au moins 10 caractères")
    .max(2000, "L'avis ne peut pas dépasser 2000 caractères"),
});

const ReviewModerateSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const validationHook = (result: any, c: any) =>
  result.success
    ? undefined
    : c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);

function parseIdParam(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function createReviewsRouter(deps: {
  authenticate: (c: Context<{ Bindings: Bindings }>) => Promise<User | null>;
}) {
  const router = new Hono<{ Bindings: Bindings }>();

  // Shared rate-limit middleware for public review endpoints.
  // Reuses the general bucket (30 req / 15 min per IP) per auth.rateLimit pattern.
  const publicRateLimit = async (c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) => {
    const ip = c.req.header("cf-connecting-ip") || "noip";
    const sql = neon(c.env.DB_CONN);
    const allowed = await rateLimitAllow(sql, `general:${ip}`, 30, 15 * 60 * 1000, Date.now());
    if (!allowed) return c.json({ error: "Rate limit exceeded" }, 429);
    await next();
  };

  // GET /api/reviews/eligibility?code=...
  // ERR-GENERIC (400 / false): invalid code, cancelled, not yet departed, already reviewed.
  // All failure paths return { eligible: false } — no data leak about which check failed.
  router.get("/api/reviews/eligibility", publicRateLimit, async (c) => {
    const code = c.req.query("code");
    if (!code) return c.json({ error: "Code requis" }, 400);

    const sql = neon(c.env.DB_CONN);
    const today = new Date().toISOString().slice(0, 10);

    const rows = (await sql`
      SELECT r.id, r.first_name, r.name, r.status,
             to_char(r.depart, 'YYYY-MM-DD') AS depart
      FROM reservations r
      WHERE r.code = ${code}
      LIMIT 1
    `) as {
      id: number;
      first_name: string | null;
      name: string;
      status: string;
      depart: string | null;
    }[];

    const reservation = rows[0];
    if (
      !reservation ||
      reservation.status === "cancelled" ||
      !reservation.depart ||
      reservation.depart > today
    ) {
      return c.json({ eligible: false });
    }

    const existing = (await sql`
      SELECT id FROM reviews WHERE reservation_id = ${reservation.id} LIMIT 1
    `) as { id: number }[];
    if (existing.length > 0) {
      return c.json({ eligible: false });
    }

    const firstName =
      reservation.first_name?.trim() ||
      (reservation.name ?? "").trim().split(/\s+/)[0] ||
      undefined;

    return c.json({ eligible: true, ...(firstName ? { firstName } : {}) });
  });

  // POST /api/reviews — public submission (rate-limited).
  // ERR-GENERIC (400): ineligible code.
  // ERR-CONFLICT (409): review already exists for this reservation.
  router.post(
    "/api/reviews",
    publicRateLimit,
    zValidator("json", ReviewSubmitSchema, validationHook),
    async (c) => {
      const data = c.req.valid("json");
      const sql = neon(c.env.DB_CONN);
      const today = new Date().toISOString().slice(0, 10);

      const rows = (await sql`
        SELECT r.id, r.first_name, r.last_name, r.name, r.email, r.user_id,
               r.status, to_char(r.depart, 'YYYY-MM-DD') AS depart
        FROM reservations r
        WHERE r.code = ${data.code}
        LIMIT 1
      `) as {
        id: number;
        first_name: string | null;
        last_name: string | null;
        name: string;
        email: string;
        user_id: number | null;
        status: string;
        depart: string | null;
      }[];

      const reservation = rows[0];
      if (
        !reservation ||
        reservation.status === "cancelled" ||
        !reservation.depart ||
        reservation.depart > today
      ) {
        return c.json({ error: "Code invalide ou séjour non éligible" }, 400);
      }

      const displayName = maskDisplayName(
        reservation.first_name,
        reservation.last_name,
        reservation.name
      );

      const { staysCount, nightsTotal } = await computeGuestStats(
        sql,
        reservation.user_id,
        reservation.email
      );

      try {
        await sql`
          INSERT INTO reviews (reservation_id, rating, body, status, display_name, stays_count, nights_total)
          VALUES (${reservation.id}, ${data.rating}, ${data.body}, 'pending', ${displayName}, ${staysCount}, ${nightsTotal})
        `;
      } catch (err: any) {
        const msg: string = err?.message ?? "";
        if (msg.includes("unique") || msg.includes("UNIQUE")) {
          return c.json({ error: "Un avis existe déjà pour cette réservation" }, 409);
        }
        throw err;
      }

      return c.json({ ok: true }, 201);
    }
  );

  // GET /api/reviews — public list of approved reviews.
  // Returns averageRating rounded to 1 decimal, or null when no reviews exist.
  // Rate-limited (parity with /api/reviews/eligibility and POST /api/reviews).
  router.get("/api/reviews", publicRateLimit, async (c) => {
    const rawLimit = c.req.query("limit");
    const limit = Math.min(Math.max(parseInt(rawLimit || "3") || 3, 1), 100);
    const sql = neon(c.env.DB_CONN);

    const reviews = (await sql`
      SELECT id, display_name, rating, body, stays_count, nights_total, created_at
      FROM reviews
      WHERE status = 'approved'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as {
      id: number;
      display_name: string;
      rating: number;
      body: string;
      stays_count: number;
      nights_total: number;
      created_at: string;
    }[];

    const aggRows = (await sql`
      SELECT COUNT(*)::int AS total, AVG(rating) AS avg_rating
      FROM reviews
      WHERE status = 'approved'
    `) as { total: number; avg_rating: string | null }[];

    const total = aggRows[0]?.total ?? 0;
    const rawAvg = aggRows[0]?.avg_rating;
    const averageRating =
      rawAvg !== null && rawAvg !== undefined
        ? Math.round(parseFloat(rawAvg) * 10) / 10
        : null;

    return c.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        rating: r.rating,
        body: r.body,
        staysCount: r.stays_count,
        nightsTotal: r.nights_total,
        createdAt: r.created_at,
      })),
      averageRating,
      total,
    });
  });

  // GET /api/admin/reviews?status=pending|approved|rejected
  // Returns reviews filtered by status plus the always-current pendingCount for the badge.
  router.get("/api/admin/reviews", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

    const status = c.req.query("status") || "pending";
    const sql = neon(c.env.DB_CONN);

    const reviews = (await sql`
      SELECT rv.id, rv.reservation_id, rv.rating, rv.body, rv.status,
             rv.display_name, rv.stays_count, rv.nights_total,
             rv.created_at, rv.moderated_at,
             res.code AS reservation_code
      FROM reviews rv
      JOIN reservations res ON res.id = rv.reservation_id
      WHERE rv.status = ${status}
      ORDER BY rv.created_at DESC
      LIMIT 200
    `) as {
      id: number;
      reservation_id: number;
      rating: number;
      body: string;
      status: string;
      display_name: string;
      stays_count: number;
      nights_total: number;
      created_at: string;
      moderated_at: string | null;
      reservation_code: string | null;
    }[];

    const pendingRows = (await sql`
      SELECT COUNT(*)::int AS count FROM reviews WHERE status = 'pending'
    `) as { count: number }[];
    const pendingCount = pendingRows[0]?.count ?? 0;

    return c.json({ reviews, pendingCount });
  });

  // PATCH /api/admin/reviews/:id — approve or reject a review (re-moderation allowed).
  router.patch(
    "/api/admin/reviews/:id",
    async (c, next) => {
      const user = await deps.authenticate(c);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
      await next();
    },
    zValidator("json", ReviewModerateSchema, validationHook),
    async (c) => {
      const id = parseIdParam(c.req.param("id"));
      if (id === null) return c.json({ error: "Invalid id" }, 400);
      const data = c.req.valid("json");
      const sql = neon(c.env.DB_CONN);

      const rows = (await sql`
        UPDATE reviews
        SET status = ${data.status}, moderated_at = now()
        WHERE id = ${id}
        RETURNING id, reservation_id, rating, body, status, display_name,
                  stays_count, nights_total, created_at, moderated_at
      `) as {
        id: number;
        reservation_id: number;
        rating: number;
        body: string;
        status: string;
        display_name: string;
        stays_count: number;
        nights_total: number;
        created_at: string;
        moderated_at: string;
      }[];

      if (rows.length === 0) return c.json({ error: "Not found" }, 404);

      return c.json({ review: rows[0] });
    }
  );

  return router;
}
