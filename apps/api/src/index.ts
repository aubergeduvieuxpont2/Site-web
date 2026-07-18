import { Hono, type Context } from "hono";
import type { ExportedHandler, ScheduledEvent, ExecutionContext } from "@cloudflare/workers-types";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { drainEmailOutbox } from "./emailOutbox";
import { hashPassword, verifyPassword } from "./auth/password";
import {
  createSession,
  validateSession,
  deleteSession,
  getSessionCookieHeader,
  getClearSessionCookieHeader,
  generateToken,
  sha256hex,
  invalidateUserSessions,
  type User,
} from "./auth/session";
import { authRateLimiter } from "./auth/middleware";
import {
  SettingsUpdateSchema,
  settingsHook,
  rowsToAdminSettings,
  toPublicSettings,
  withPublicRoomCount,
  parseBool,
} from "./settings";
import { availabilityForRange } from "./availability";
import { createEmailsRouter } from "./emails";
import {
  buildReservationHubspotOps,
  enqueueHubspotOps,
  OtaParsedSchema,
  OtaFailureSchema,
} from "./ota";
import type { RoomRow, PublicRoomRow } from "./rooms";
import {
  RoomCreateSchema,
  RoomUpdateSchema,
  ROOM_IMAGE_KEYS,
  slugify,
} from "./rooms";
import {
  resolveEffectiveNightly,
  resolveEffectiveWeekly,
  nightsBetween,
  computeInvoice,
  toNumberOrNull,
  type InvoiceBreakdown,
} from "./pricing";
import {
  AssignRoomSchema,
  reservationDatesValid,
  freeRoomsForRange,
  isRoomFreeForRange,
} from "./assignments";

type Bindings = {
  DB_CONN: string;
  HUBSPOT: Fetcher;
  ADMIN_EMAIL: string;
  RESEND_API_KEY: string;
};

type MessageRow = {
  id: number;
  body: string;
  created_at: string;
};

type ReservationRow = {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  room: string | null;
  arrive: string | null;
  depart: string | null;
  people: number;
  room_count: number | null;
  message: string | null;
  created_at: string;
  status?: "pending" | "confirmed" | "cancelled";
};

type BlackoutRow = {
  date: string;
  rooms_blocked: number;
  note: string | null;
  created_at: string;
};

export interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  role: "guest" | "admin";
  created_at: string;
}

type RoomVisibilityRow = {
  slug: string;
  is_public: boolean;
};

const MessageRequestSchema = z.object({
  body: z.string().min(1, "body must be non-empty"),
});

const trimToNull = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  });

export const ReservationRequestSchema = z.object({
  firstName: z.string().trim().min(1, "first name is required"),
  lastName: z.string().trim().min(1, "last name is required"),
  email: z
    .string()
    .trim()
    .min(1, "email is required")
    .email("valid email is required"),
  phone: trimToNull,
  room: trimToNull,
  // Accepted under the frontend's names; mapped to the arrive/depart/people
  // columns in the handler.
  checkIn: trimToNull,
  checkOut: trimToNull,
  message: trimToNull,
  guests: z.coerce.number().int().min(1).catch(1),
  roomCount: z.coerce.number().int().min(1, "roomCount must be at least 1"),
}).superRefine((data, ctx) => {
  // Dates stay optional: only enforce ordering when BOTH are present.
  if (data.checkIn == null || data.checkOut == null) return;
  if (!reservationDatesValid(data.checkIn, data.checkOut)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkOut"],
      message: "La date de départ doit être postérieure à la date d'arrivée.",
    });
  }
});

const reservationHook = (result: any, c: any) =>
  result.success
    ? undefined
    : c.json(
        {
          error:
            result.error.issues[0]?.message ?? "Invalid request",
        },
        400
      );

const RegisterSchema = z.object({
  email: z.string().trim().email("email invalide"),
  password: z.string().min(8, "le mot de passe doit contenir au moins 8 caractères"),
  name: trimToNull,
  firstName: trimToNull,
  lastName: trimToNull,
  phone: trimToNull,
  company: trimToNull,
});

const LoginSchema = z.object({
  email: z.string().trim().min(1, "email requis"),
  password: z.string().min(1, "mot de passe requis"),
});

const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, "mot de passe actuel requis"),
  newPassword: z.string().min(8, "le mot de passe doit contenir au moins 8 caractères"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("email invalide"),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "token requis"),
  newPassword: z.string().min(8, "le mot de passe doit contenir au moins 8 caractères"),
});

const RoomVisibilitySchema = z.object({
  isPublic: z.boolean(),
});

const RoleSchema = z.object({
  role: z.enum(["guest", "admin"]),
});

const ReservationStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled"]),
});

const BlackoutUpsertSchema = z.object({
  roomsBlocked: z.coerce.number().int().min(0),
  note: z.string().trim().nullable().optional(),
});

export const ProfileEmailSchema = z.object({
  newEmail: z.string().trim().email("email invalide"),
  currentPassword: z.string().min(1, "mot de passe requis"),
});

const authHook = (result: any, c: any) =>
  result.success
    ? undefined
    : c.json(
        {
          error:
            result.error.issues[0]?.message ?? "Invalid request",
        },
        400
      );

type OutboxRow = {
  id: number;
  kind: string;
  status: string;
  attempts: number;
  dedupe_key: string | null;
  last_error: string | null;
  hubspot_id: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
};

type SettingsRow = {
  key: string;
  value: string;
  updated_at: string;
};

function getSessionToken(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.trim().indexOf("=");
    if (eq === -1) continue;
    const k = part.trim().slice(0, eq);
    const v = part.trim().slice(eq + 1);
    if (k === "session" && v) return v;
  }
  return null;
}

async function getAuthUser(c: Context<{ Bindings: Bindings }>): Promise<User | null> {
  const token = getSessionToken(c.req.header("Cookie") || "");
  if (!token) return null;
  const sql = neon(c.env.DB_CONN);
  return validateSession(sql, token);
}

const app = new Hono<{ Bindings: Bindings }>();

// Simple in-memory rate limiter: 30 requests per 15 minutes per IP
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const rateLimitMiddleware = async (c: Context, next: () => Promise<void>) => {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "anonymous";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = 30;

  let record = requestCounts.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    requestCounts.set(ip, record);
  }

  if (record.count >= limit) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  record.count++;
  await next();
};

const ALLOWED_ORIGINS = [
  "https://www.aubergeduvieuxpont.ca",
  "https://dev.aubergeduvieuxpont.ca",
  "https://a.aubergeduvieuxpont.ca",
  "https://b.aubergeduvieuxpont.ca",
];
app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/api/health", (c) => {
  return c.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/messages", async (c) => {
  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`
    SELECT id, body, created_at
    FROM messages
    ORDER BY id DESC
    LIMIT 100
  `) as MessageRow[];

  return c.json({ messages: rows });
});

app.post(
  "/api/messages",
  rateLimitMiddleware,
  zValidator("json", MessageRequestSchema),
  async (c) => {
    const data = c.req.valid("json");

    const sql = neon(c.env.DB_CONN);
    const rows = (await sql`
      INSERT INTO messages (body)
      VALUES (${data.body.trim()})
      RETURNING id, body, created_at
    `) as MessageRow[];

    const created = rows[0];
    if (!created) {
      return c.json({ error: "Failed to create message" }, 500);
    }

    return c.json({ message: created }, 201);
  }
);

app.post(
  "/api/reservations",
  rateLimitMiddleware,
  async (c, next) => {
    const sql = neon(c.env.DB_CONN);
    const settingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
    const adminSettings = rowsToAdminSettings(settingsRows);

    if (!adminSettings.reservationsEnabled) {
      return c.json({ error: "Les réservations sont temporairement désactivées." }, 503);
    }

    await next();
  },
  zValidator("json", ReservationRequestSchema, reservationHook),
  async (c) => {
    const data = c.req.valid("json");

    // Derived value for the NOT NULL `name` column; the split first/last are
    // persisted alongside it.
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ");

    const sql = neon(c.env.DB_CONN);

    // Check availability before inserting
    if (data.checkIn && data.checkOut) {
      const settingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
      const adminSettings = rowsToAdminSettings(settingsRows);

      const availability = await availabilityForRange(
        sql,
        data.checkIn,
        data.checkOut,
        data.roomCount,
        adminSettings.assignableRoomCount
      );

      if (availability.unavailableNights.length > 0) {
        return c.json({ error: "Ces dates ne sont plus disponibles." }, 409);
      }
    }

    const rows = (await sql`
      INSERT INTO reservations (name, first_name, last_name, email, phone, room, arrive, depart, people, room_count, message, status)
      VALUES (${name}, ${data.firstName}, ${data.lastName}, ${data.email}, ${data.phone}, ${data.room}, ${data.checkIn}, ${data.checkOut}, ${data.guests}, ${data.roomCount}, ${data.message}, 'pending')
      RETURNING id, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, status, created_at
    `) as ReservationRow[];

    const created = rows[0];
    if (!created) {
      return c.json({ error: "Failed to create reservation" }, 500);
    }

    c.executionCtx.waitUntil(
      enqueueHubspotOps(
        c.env.HUBSPOT,
        buildReservationHubspotOps({
          reservationId: created.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          room: data.room,
          guests: data.guests,
          roomCount: data.roomCount,
          description: data.message,
        }),
      )
    );

    return c.json({ reservation: created }, 201);
  }
);

// Public availability endpoint
app.get("/api/availability", rateLimitMiddleware, async (c) => {
  const checkIn = c.req.query("checkIn");
  const checkOut = c.req.query("checkOut");
  const rooms = Number(c.req.query("rooms"));

  if (!checkIn || !checkOut || rooms < 1) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  if (!reservationDatesValid(checkIn, checkOut)) {
    return c.json({ error: "Invalid date range" }, 400);
  }

  const sql = neon(c.env.DB_CONN);
  const settingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
  const adminSettings = rowsToAdminSettings(settingsRows);

  const availability = await availabilityForRange(
    sql,
    checkIn,
    checkOut,
    rooms,
    adminSettings.assignableRoomCount
  );

  return c.json({
    nights: availability.nights,
    unavailableNights: availability.unavailableNights,
    allAvailable: availability.unavailableNights.length === 0,
  });
});

// Internal endpoint for the email-ingest Worker (service binding only).
// Not under /api/* on purpose: the Worker's routes only cover /api/*, so this
// path is unreachable from the internet — same isolation model as the
// route-less HubSpot gateway.
app.post("/internal/ota-bookings", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const status = (raw as { status?: unknown } | null)?.status;
  const sql = neon(c.env.DB_CONN);

  if (status === "parse_failed" || status === "ignored") {
    const parsed = OtaFailureSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }
    const d = parsed.data;
    await sql`
      INSERT INTO email_ingest_log (provider, status, subject, error)
      VALUES (${d.provider}, ${d.status}, ${d.subject}, ${d.error})
    `;
    return c.json({ ok: true }, 202);
  }

  const parsed = OtaParsedSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  }
  const d = parsed.data;
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ");
  const providerLabel = d.source === "airbnb" ? "Airbnb" : "Expedia";
  const message = `Réservation ${providerLabel} #${d.externalRef}`;

  // ON CONFLICT against the partial unique index dedupes resent confirmations.
  const rows = (await sql`
    INSERT INTO reservations (name, first_name, last_name, email, phone, room, arrive, depart, people, room_count, message, source, external_ref)
    VALUES (${name}, ${d.firstName}, ${d.lastName}, ${d.guestEmail ?? ""}, ${d.phone}, ${d.listingName}, ${d.checkIn}, ${d.checkOut}, ${d.guests}, 1, ${message}, ${d.source}, ${d.externalRef})
    ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
    RETURNING id
  `) as { id: number }[];

  const created = rows[0];
  if (!created) {
    await sql`
      INSERT INTO email_ingest_log (provider, status, subject)
      VALUES (${d.source}, 'duplicate', ${d.subject})
    `;
    return c.json({ ok: true, duplicate: true }, 200);
  }

  await sql`
    INSERT INTO email_ingest_log (provider, status, reservation_id, subject)
    VALUES (${d.source}, 'parsed', ${created.id}, ${d.subject})
  `;

  c.executionCtx.waitUntil(
    enqueueHubspotOps(
      c.env.HUBSPOT,
      buildReservationHubspotOps({
        reservationId: created.id,
        email: d.guestEmail,
        firstName: d.firstName,
        lastName: d.lastName,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        room: d.listingName,
        guests: d.guests,
        roomCount: 1,
        description: message,
      }),
    )
  );

  return c.json({ reservationId: created.id }, 201);
});

// Auth routes
app.post(
  "/api/auth/register",
  authRateLimiter,
  zValidator("json", RegisterSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    // Derive name from firstName + lastName if not explicitly provided
    const derivedName =
      [data.firstName, data.lastName].filter(Boolean).join(" ") ||
      data.name ||
      null;

    try {
      const passwordHash = await hashPassword(data.password);
      const rows = (await sql`
        INSERT INTO users (email, password_hash, name, role, first_name, last_name, phone, company)
        VALUES (${data.email}, ${passwordHash}, ${derivedName}, 'guest', ${data.firstName ?? null}, ${data.lastName ?? null}, ${data.phone ?? null}, ${data.company ?? null})
        RETURNING id, email, name, role
      `) as User[];

      const user = rows[0];
      if (!user) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      const token = await createSession(sql, user.id);

      // Enqueue HubSpot contact upsert (fire-and-forget; failure never blocks registration)
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const contactPayload: Record<string, string> = { email: data.email };
            if (derivedName) contactPayload.name = derivedName;
            if (data.firstName) contactPayload.firstname = data.firstName;
            if (data.lastName) contactPayload.lastname = data.lastName;
            if (data.phone) contactPayload.phone = data.phone;
            if (data.company) contactPayload.company = data.company;

            await c.env.HUBSPOT.fetch(
              new Request("http://hubspot/ops/enqueue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kind: "contact.upsert",
                  payload: contactPayload,
                }),
              })
            );
          } catch {}
        })()
      );

      return c.json({ user }, 201, {
        "Set-Cookie": getSessionCookieHeader(token),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("duplicate") || message.includes("UNIQUE")) {
        return c.json({ error: "Un compte existe déjà" }, 409);
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

app.post(
  "/api/auth/login",
  authRateLimiter,
  zValidator("json", LoginSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      SELECT id, email, password_hash, name, role
      FROM users
      WHERE lower(email) = lower(${data.email})
    `) as (User & { password_hash: string })[];

    const user = rows[0];
    if (!user || !(await verifyPassword(data.password, user.password_hash))) {
      return c.json({ error: "Identifiants invalides" }, 401);
    }

    const token = await createSession(sql, user.id);
    const { password_hash, ...safeUser } = user;
    return c.json({ user: safeUser }, 200, {
      "Set-Cookie": getSessionCookieHeader(token),
    });
  }
);

app.get("/api/auth/me", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    // 200 rather than 401: this endpoint is polled on every page view and an
    // anonymous visitor is not an error (a 401 logs a console error in every
    // logged-out browser session).
    return c.json({ user: null });
  }

  const sql = neon(c.env.DB_CONN);
  const userRows = (await sql`
    SELECT discount_percent, fixed_nightly_price, fixed_weekly_price FROM users WHERE id = ${user.id}
  `) as { discount_percent: number | null; fixed_nightly_price: number | null; fixed_weekly_price: number | null }[];

  const settingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
  const adminSettings = rowsToAdminSettings(settingsRows);

  const effectiveNightlyPrice = resolveEffectiveNightly(
    {
      fixedNightlyPrice: toNumberOrNull(userRows[0]?.fixed_nightly_price),
      discountPercent: toNumberOrNull(userRows[0]?.discount_percent),
    },
    adminSettings.nightlyPrice
  );

  const effectiveWeeklyPrice = resolveEffectiveWeekly(
    {
      fixedWeeklyPrice: toNumberOrNull(userRows[0]?.fixed_weekly_price),
      discountPercent: toNumberOrNull(userRows[0]?.discount_percent),
    },
    adminSettings.weeklyPrice
  );

  return c.json({ user: { ...user, effectiveNightlyPrice, effectiveWeeklyPrice } });
});

app.post("/api/auth/logout", async (c) => {
  const token = getSessionToken(c.req.header("Cookie") || "");
  if (token) {
    const sql = neon(c.env.DB_CONN);
    await deleteSession(sql, token);
  }
  return c.json({ ok: true }, 200, {
    "Set-Cookie": getClearSessionCookieHeader(),
  });
});

// Password change (session-authed)
app.post(
  "/api/auth/password",
  zValidator("json", PasswordChangeSchema, authHook),
  async (c) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      SELECT password_hash FROM users WHERE id = ${user.id}
    `) as { password_hash: string }[];

    const row = rows[0];
    if (!row || !(await verifyPassword(data.currentPassword, row.password_hash))) {
      return c.json({ error: "Mot de passe actuel incorrect" }, 400);
    }

    const newHash = await hashPassword(data.newPassword);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;

    return c.json({ ok: true });
  }
);

// Forgot password (always 200, rate-limited, no enumeration)
app.post(
  "/api/auth/forgot",
  authRateLimiter,
  zValidator("json", ForgotPasswordSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      SELECT id FROM users WHERE lower(email) = lower(${data.email})
    `) as { id: number }[];

    if (rows[0]) {
      const rawToken = generateToken();
      const tokenHash = await sha256hex(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await sql`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
        VALUES (${tokenHash}, ${rows[0].id}, ${expiresAt})
      `;
    }

    return c.json({ ok: true });
  }
);

// Reset password (consumes token, invalidates sessions)
app.post(
  "/api/auth/reset",
  authRateLimiter,
  zValidator("json", ResetPasswordSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const tokenHash = await sha256hex(data.token);

    const rows = (await sql`
      SELECT user_id FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > now()
    `) as { user_id: number }[];

    if (!rows[0]) {
      return c.json({ error: "Lien invalide ou expiré" }, 400);
    }

    const userId = rows[0].user_id;
    const newHash = await hashPassword(data.newPassword);

    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${userId}`;
    await sql`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = ${tokenHash}`;
    await invalidateUserSessions(sql, userId);

    return c.json({ ok: true });
  }
);

// Profile route (no HubSpot enrichment)
app.get("/api/profile", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const sql = neon(c.env.DB_CONN);
  const reservations = (await sql`
    SELECT id, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, created_at
    FROM reservations
    WHERE user_id = ${user.id} OR lower(email) = lower(${user.email})
    ORDER BY created_at DESC
  `) as ReservationRow[];

  const userResponse = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hubspotContactId: user.hubspot_contact_id || null,
  };

  return c.json({ user: userResponse, reservations });
});

app.post(
  "/api/profile/email",
  zValidator("json", ProfileEmailSchema, authHook),
  async (c) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { newEmail, currentPassword } = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    // Verify password
    const userRow = (await sql`
      SELECT password_hash FROM users WHERE id = ${user.id}
    `) as { password_hash: string }[];

    if (userRow.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    const passwordValid = await verifyPassword(currentPassword, userRow[0].password_hash);
    if (!passwordValid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    // Check if email is already taken by another user
    const existing = (await sql`
      SELECT id FROM users WHERE lower(email) = lower(${newEmail}) AND id != ${user.id}
    `) as { id: number }[];

    if (existing.length > 0) {
      return c.json({ error: "Cette adresse courriel est déjà utilisée." }, 409);
    }

    // Update the user's email
    await sql`
      UPDATE users SET email = ${newEmail}, updated_at = now()
      WHERE id = ${user.id}
    `;

    // Fire-and-forget HubSpot update if hubspot_contact_id is set
    if (user.hubspot_contact_id) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const hubspotRes = await c.env.HUBSPOT.fetch("http://internal/ops/contact.updateById", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: user.hubspot_contact_id,
                properties: { email: newEmail },
              }),
            });
            if (!hubspotRes.ok) {
              console.error("HubSpot contact update failed:", hubspotRes.status);
            }
          } catch (err) {
            console.error("HubSpot contact update error:", err);
          }
        })()
      );
    }

    const updatedUserResponse = {
      id: user.id,
      email: newEmail,
      name: user.name,
      role: user.role,
      hubspotContactId: user.hubspot_contact_id || null,
    };

    return c.json({ user: updatedUserResponse }, 200);
  }
);

// Public rooms endpoint
app.get("/api/rooms", async (c) => {
  const sql = neon(c.env.DB_CONN);
  // Public endpoint: never selects/returns the pass-key (a door/lock code).
  const rows = (await sql`
    SELECT slug, name, capacity, image_key, is_public
    FROM rooms
    WHERE is_public = true
    ORDER BY slug
  `) as PublicRoomRow[];

  return c.json(rows);
});

// Admin routes (require admin role)
app.get("/api/admin/reservations", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const q = c.req.query("q") || "";
  const limit = Math.min(parseInt(c.req.query("limit") || "100") || 100, 200);

  const reservations = (await sql`
    SELECT id, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, created_at
    FROM reservations
    WHERE name ILIKE ${"%" + q + "%"} OR email ILIKE ${"%" + q + "%"}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as ReservationRow[];

  return c.json({ reservations });
});

app.get("/api/admin/outbox", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const status = c.req.query("status") || "all";

  let rows: OutboxRow[];
  if (status === "all") {
    rows = (await sql`SELECT * FROM hubspot_outbox ORDER BY updated_at DESC`) as OutboxRow[];
  } else {
    rows = (await sql`SELECT * FROM hubspot_outbox WHERE status = ${status} ORDER BY updated_at DESC`) as OutboxRow[];
  }

  return c.json({ rows });
});

type EmailIngestLogRow = {
  id: number;
  provider: string | null;
  status: string;
  reservation_id: number | null;
  subject: string | null;
  error: string | null;
  created_at: string;
};

app.get("/api/admin/email-ingest", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`
    SELECT id, provider, status, reservation_id, subject, error, created_at
    FROM email_ingest_log
    ORDER BY created_at DESC
    LIMIT 100
  `) as EmailIngestLogRow[];

  return c.json({ rows });
});

app.post("/api/admin/outbox/:id/requeue", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const id = c.req.param("id");

  const rows = (await sql`
    SELECT * FROM hubspot_outbox WHERE id = ${id} AND status = 'failed'
  `) as OutboxRow[];

  if (rows.length === 0) {
    const existing = (await sql`SELECT * FROM hubspot_outbox WHERE id = ${id}`) as OutboxRow[];
    if (existing.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ row: existing[0] }, 200);
  }

  const updated = (await sql`
    UPDATE hubspot_outbox
    SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as OutboxRow[];

  return c.json({ row: updated[0] }, 200);
});

// Admin rooms endpoints
app.get("/api/admin/rooms", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const rooms = (await sql`
    SELECT slug, name, capacity, image_key, is_public, passkey_enabled, passkey, created_at, updated_at
    FROM rooms
    ORDER BY slug
  `) as RoomRow[];

  return c.json({ rooms });
});

app.post(
  "/api/admin/rooms",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", RoomCreateSchema),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);
    const slug = slugify(data.name);

    try {
      const rows = (await sql`
        INSERT INTO rooms (slug, name, capacity, image_key, is_public, passkey_enabled, passkey, created_at, updated_at)
        VALUES (${slug}, ${data.name}, ${data.capacity}, ${data.imageKey}, ${data.isPublic}, ${data.passkeyEnabled}, ${data.passkey ?? null}, now(), now())
        RETURNING slug, name, capacity, image_key, is_public, passkey_enabled, passkey, created_at, updated_at
      `) as RoomRow[];

      return c.json({ room: rows[0] }, 201);
    } catch (error: any) {
      if (error.message?.includes("unique") || error.message?.includes("duplicate")) {
        return c.json({ error: "A room with this slug already exists" }, 409);
      }
      throw error;
    }
  }
);

app.put(
  "/api/admin/rooms/:slug",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", RoomUpdateSchema),
  async (c) => {
    const slug = c.req.param("slug");
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      UPDATE rooms
      SET name = ${data.name}, capacity = ${data.capacity}, image_key = ${data.imageKey}, is_public = ${data.isPublic}, passkey_enabled = ${data.passkeyEnabled}, passkey = ${data.passkey ?? null}, updated_at = now()
      WHERE slug = ${slug}
      RETURNING slug, name, capacity, image_key, is_public, passkey_enabled, passkey, created_at, updated_at
    `) as RoomRow[];

    if (rows.length === 0) {
      return c.json({ error: "Room not found" }, 404);
    }

    return c.json({ room: rows[0] });
  }
);

app.delete(
  "/api/admin/rooms/:slug",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  async (c) => {
    const slug = c.req.param("slug");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      DELETE FROM rooms
      WHERE slug = ${slug}
      RETURNING slug
    `) as { slug: string }[];

    if (rows.length === 0) {
      return c.json({ error: "Room not found" }, 404);
    }

    return c.json({ ok: true });
  }
);

// Admin users endpoints
app.get("/api/admin/users", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const q = c.req.query("q") || "";

  // No NUMERIC normalization needed here: this list selects no pricing columns
  // (discount_percent / fixed_nightly_price), so there are no string-typed
  // numerics to coerce. See toNumberOrNull call sites on the detail endpoints.
  const users = (await sql`
    SELECT id, email, name, role, created_at
    FROM users
    WHERE email ILIKE ${"%" + q + "%"}
    ORDER BY created_at DESC
    LIMIT 200
  `) as AdminUserRow[];

  return c.json({ users });
});

app.post(
  "/api/admin/users/:id/role",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", RoleSchema),
  async (c) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const targetId = Number(c.req.param("id"));
    if (targetId === user.id) {
      return c.json({ error: "Vous ne pouvez pas modifier votre propre rôle" }, 400);
    }

    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      UPDATE users
      SET role = ${data.role}
      WHERE id = ${targetId}
      RETURNING id, email, name, role, created_at
    `) as AdminUserRow[];

    if (rows.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ user: rows[0] });
  }
);

app.post("/api/admin/users/:id/reset-link", async (c) => {
  const admin = await getAuthUser(c);
  if (!admin) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (admin.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetId = Number(c.req.param("id"));
  const sql = neon(c.env.DB_CONN);

  const rows = (await sql`
    SELECT id FROM users WHERE id = ${targetId}
  `) as { id: number }[];

  if (!rows[0]) {
    return c.json({ error: "Not found" }, 404);
  }

  const rawToken = generateToken();
  const tokenHash = await sha256hex(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${targetId}, ${expiresAt})
  `;

  const origin = new URL(c.req.url).origin;
  const url = `${origin}/reinitialisation?token=${rawToken}`;

  return c.json({ url });
});

// Room assignment endpoints
app.get("/api/admin/reservations/:id/assignments", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const reservationId = Number(c.req.param("id"));
  const sql = neon(c.env.DB_CONN);

  const assignments = (await sql`
    SELECT room_slug FROM reservation_room_assignments WHERE reservation_id = ${reservationId}
  `) as { room_slug: string }[];

  return c.json({ assignments });
});

app.get("/api/admin/reservations/:id/free-rooms", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const reservationId = Number(c.req.param("id"));
  const sql = neon(c.env.DB_CONN);

  const res = (await sql`
    SELECT to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart
    FROM reservations WHERE id = ${reservationId}
  `) as { arrive: string | null; depart: string | null }[];

  if (!res[0] || !reservationDatesValid(res[0].arrive, res[0].depart)) {
    return c.json({ error: "Réservation incomplète : dates ou nombre de chambres manquants." }, 422);
  }

  const rooms = await freeRoomsForRange(sql, res[0].arrive!, res[0].depart!, reservationId);
  return c.json({ rooms });
});

app.post(
  "/api/admin/reservations/:id/assignments",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", AssignRoomSchema),
  async (c) => {
    const reservationId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const res = (await sql`
      SELECT to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, room_count
      FROM reservations WHERE id = ${reservationId}
    `) as { arrive: string | null; depart: string | null; room_count: number | null }[];

    if (!res[0] || !reservationDatesValid(res[0].arrive, res[0].depart) || res[0].room_count === null) {
      return c.json({ error: "Réservation incomplète : dates ou nombre de chambres manquants." }, 422);
    }

    const assignmentCount = (await sql`
      SELECT COUNT(*) as count FROM reservation_room_assignments WHERE reservation_id = ${reservationId}
    `) as { count: number }[];

    if (assignmentCount[0].count >= res[0].room_count) {
      return c.json({ error: "Nombre de chambres atteint pour cette réservation." }, 409);
    }

    const isFree = await isRoomFreeForRange(sql, data.roomSlug, res[0].arrive!, res[0].depart!, reservationId);
    if (!isFree) {
      return c.json({ error: "Cette chambre est déjà réservée pour ces dates." }, 409);
    }

    try {
      const assignment = (await sql`
        INSERT INTO reservation_room_assignments (reservation_id, room_slug)
        VALUES (${reservationId}, ${data.roomSlug})
        RETURNING id, reservation_id, room_slug, created_at
      `) as { id: number; reservation_id: number; room_slug: string; created_at: string }[];

      return c.json({ assignment: assignment[0] }, 201);
    } catch {
      return c.json({ error: "Impossible de créer l'assignation." }, 409);
    }
  }
);

app.delete("/api/admin/reservations/:id/assignments/:roomSlug", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const reservationId = Number(c.req.param("id"));
  const roomSlug = c.req.param("roomSlug");
  const sql = neon(c.env.DB_CONN);

  const deleted = (await sql`
    DELETE FROM reservation_room_assignments
    WHERE reservation_id = ${reservationId} AND room_slug = ${roomSlug}
    RETURNING id
  `) as { id: number }[];

  if (deleted.length === 0) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ ok: true });
});

// Invoice endpoint
app.post(
  "/api/admin/reservations/:id/invoice",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator(
    "json",
    z.object({
      type: z.enum(["deposit", "full"]),
      depositPercent: z.coerce.number().optional(),
    })
  ),
  async (c) => {
    const reservationId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const res = (await sql`
      SELECT email, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, room_count
      FROM reservations WHERE id = ${reservationId}
    `) as { email: string; arrive: string | null; depart: string | null; room_count: number | null }[];

    if (!res[0] || !reservationDatesValid(res[0].arrive, res[0].depart) || res[0].room_count === null) {
      return c.json({ error: "Réservation incomplète : dates ou nombre de chambres manquants." }, 422);
    }

    const userRows = (await sql`
      SELECT discount_percent, fixed_nightly_price, fixed_weekly_price FROM users WHERE lower(email) = lower(${res[0].email})
    `) as { discount_percent: number | null; fixed_nightly_price: number | null; fixed_weekly_price: number | null }[];

    const settingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
    const adminSettings = rowsToAdminSettings(settingsRows);

    const effectiveNightly = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull(userRows[0]?.fixed_nightly_price),
        discountPercent: toNumberOrNull(userRows[0]?.discount_percent),
      },
      adminSettings.nightlyPrice
    );

    const effectiveWeekly = resolveEffectiveWeekly(
      {
        fixedWeeklyPrice: toNumberOrNull(userRows[0]?.fixed_weekly_price),
        discountPercent: toNumberOrNull(userRows[0]?.discount_percent),
      },
      adminSettings.weeklyPrice
    );

    const nights = nightsBetween(res[0].arrive!, res[0].depart!);

    const breakdown = computeInvoice({
      effectiveNightly,
      nights,
      roomCount: res[0].room_count,
      tps: adminSettings.tps,
      tvq: adminSettings.tvq,
      accommodationTax: adminSettings.accommodationTax,
      type: data.type,
      depositPercent: data.depositPercent,
      weeklyRate: effectiveWeekly,
    });

    await c.env.HUBSPOT.fetch(
      new Request("http://hubspot/ops/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "invoice.create",
          payload: {
            contactEmail: res[0].email,
            amount: breakdown.amount,
            description: `Facture - Réservation #${reservationId}`,
            currency: "CAD",
          },
          dedupeKey: `invoice-${reservationId}-${data.type}`,
        }),
      })
    );

    return c.json({ ok: true, breakdown });
  }
);

// Admin user detail endpoint
app.get("/api/admin/users/:id", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetId = Number(c.req.param("id"));
  const sql = neon(c.env.DB_CONN);

  const userRows = (await sql`
    SELECT id, email, name, role, first_name, last_name, phone, company, created_at, hubspot_contact_id, discount_percent, fixed_nightly_price, fixed_weekly_price
    FROM users WHERE id = ${targetId}
  `) as {
    id: number;
    email: string;
    name: string | null;
    role: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    company: string | null;
    created_at: string;
    hubspot_contact_id: string | null;
    discount_percent: number | null;
    fixed_nightly_price: number | null;
    fixed_weekly_price: number | null;
  }[];

  if (!userRows[0]) {
    return c.json({ error: "Not found" }, 404);
  }

  let hubspot = null;
  if (userRows[0].hubspot_contact_id) {
    try {
      const hsResult = await c.env.HUBSPOT.fetch(
        new Request("http://hubspot/ops/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "contact.getById",
            payload: { contactId: userRows[0].hubspot_contact_id },
          }),
        })
      );
      if (hsResult.ok) {
        const hsData = (await hsResult.json()) as any;
        hubspot = hsData.data || null;
      }
    } catch {
    }
  }

  const targetUser = {
    ...userRows[0],
    discount_percent: toNumberOrNull(userRows[0].discount_percent),
    fixed_nightly_price: toNumberOrNull(userRows[0].fixed_nightly_price),
    fixed_weekly_price: toNumberOrNull(userRows[0].fixed_weekly_price),
  };

  return c.json({ user: targetUser, hubspot });
});

// User pricing endpoint
app.post(
  "/api/admin/users/:id/pricing",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator(
    "json",
    z.object({
      discountPercent: z.coerce.number().min(0).max(100).nullable().optional(),
      fixedNightlyPrice: z.coerce.number().min(0).nullable().optional(),
      fixedWeeklyPrice: z.coerce.number().min(0).nullable().optional(),
    })
  ),
  async (c) => {
    const targetId = Number(c.req.param("id"));
    const data = c.req.valid("json");

    if (data.discountPercent != null && (data.fixedNightlyPrice != null || data.fixedWeeklyPrice != null)) {
      return c.json({ error: "Un seul mode de tarification est permis." }, 400);
    }

    const sql = neon(c.env.DB_CONN);

    const updated = (await sql`
      UPDATE users
      SET discount_percent = ${data.discountPercent === undefined ? null : data.discountPercent},
          fixed_nightly_price = ${data.fixedNightlyPrice === undefined ? null : data.fixedNightlyPrice},
          fixed_weekly_price = ${data.fixedWeeklyPrice === undefined ? null : data.fixedWeeklyPrice}
      WHERE id = ${targetId}
      RETURNING id, email, name, role, first_name, last_name, phone, company, created_at, hubspot_contact_id, discount_percent, fixed_nightly_price, fixed_weekly_price
    `) as {
      id: number;
      email: string;
      name: string | null;
      role: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      company: string | null;
      created_at: string;
      hubspot_contact_id: string | null;
      discount_percent: number | null;
      fixed_nightly_price: number | null;
      fixed_weekly_price: number | null;
    }[];

    if (!updated[0]) {
      return c.json({ error: "Not found" }, 404);
    }

    const user = {
      ...updated[0],
      discount_percent: toNumberOrNull(updated[0].discount_percent),
      fixed_nightly_price: toNumberOrNull(updated[0].fixed_nightly_price),
      fixed_weekly_price: toNumberOrNull(updated[0].fixed_weekly_price),
    };

    return c.json({ user });
  }
);

// Admin reservation status update endpoint
app.patch(
  "/api/admin/reservations/:id/status",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", ReservationStatusSchema),
  async (c) => {
    const reservationId = Number(c.req.param("id"));
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      UPDATE reservations
      SET status = ${data.status}
      WHERE id = ${reservationId}
      RETURNING id, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, status, created_at
    `) as ReservationRow[];

    if (rows.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ reservation: rows[0] });
  }
);

// Admin blackout endpoints
app.get("/api/admin/blackouts", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`
    SELECT to_char(date, 'YYYY-MM-DD') as date, rooms_blocked, note, created_at
    FROM blackout_dates
    ORDER BY date
  `) as { date: string; rooms_blocked: number; note: string | null; created_at: string }[];

  return c.json({ blackouts: rows });
});

app.put(
  "/api/admin/blackouts/:date",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", BlackoutUpsertSchema),
  async (c) => {
    const date = c.req.param("date");
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return c.json({ error: "Invalid date format" }, 400);
    }

    const rows = (await sql`
      INSERT INTO blackout_dates (date, rooms_blocked, note)
      VALUES (${date}::date, ${data.roomsBlocked}, ${data.note || null})
      ON CONFLICT (date) DO UPDATE SET rooms_blocked = ${data.roomsBlocked}, note = ${data.note || null}, created_at = now()
      RETURNING to_char(date, 'YYYY-MM-DD') as date, rooms_blocked, note, created_at
    `) as { date: string; rooms_blocked: number; note: string | null; created_at: string }[];

    return c.json({ blackout: rows[0] });
  }
);

app.delete(
  "/api/admin/blackouts/:date",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  async (c) => {
    const date = c.req.param("date");
    const sql = neon(c.env.DB_CONN);

    // Validate date format
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return c.json({ error: "Invalid date format" }, 400);
    }

    const rows = (await sql`
      DELETE FROM blackout_dates
      WHERE date = ${date}::date
      RETURNING date
    `) as { date: string }[];

    if (rows.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ ok: true });
  }
);

// Public settings endpoint
app.get("/api/settings", async (c) => {
  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];

  const adminSettings = rowsToAdminSettings(rows);
  const publicSettings = toPublicSettings(adminSettings);

  // Live count of publicly-visible rooms. On any failure (missing column,
  // db error) we omit the field so the endpoint never 500s; the frontend
  // falls back to DEFAULTS.publicRoomCount.
  let publicRoomCount: number | undefined;
  try {
    const countRows = (await sql`
      SELECT count(*)::int AS count FROM rooms WHERE is_public = true
    `) as { count: number }[];
    publicRoomCount = countRows[0]?.count ?? 0;
  } catch (err) {
    console.error("Failed to count public rooms:", err);
  }

  return c.json(withPublicRoomCount(publicSettings, publicRoomCount));
});

// Admin settings read endpoint
app.get("/api/admin/settings", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];

  const adminSettings = rowsToAdminSettings(rows);

  return c.json(adminSettings);
});

// Admin settings update endpoint.
// Auth runs BEFORE body validation so unauthenticated callers get a 401
// instead of schema details in a 400.
app.post(
  "/api/admin/settings",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  },
  zValidator("json", SettingsUpdateSchema, settingsHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    await Promise.all([
      sql`INSERT INTO settings (key, value) VALUES ('nightly_price', ${data.nightlyPrice.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('weekly_price', ${data.weeklyPrice.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('contact_email', ${data.contactEmail}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('contact_phone', ${data.contactPhone}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('tps', ${data.tps.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('tvq', ${data.tvq.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('accommodation_tax', ${data.accommodationTax.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('assignable_room_count', ${data.assignableRoomCount.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('reservations_enabled', ${data.reservationsEnabled ? 'true' : 'false'}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    ]);

    const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
    const adminSettings = rowsToAdminSettings(rows);

    return c.json(adminSettings);
  }
);

// Email routes (admin-gated)
app.route("/", createEmailsRouter({ authenticate: getAuthUser }));

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(drainEmailOutbox(env));
  },
} satisfies ExportedHandler<Bindings>;
