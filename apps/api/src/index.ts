import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { hashPassword, verifyPassword } from "./auth/password";
import {
  createSession,
  validateSession,
  deleteSession,
  getSessionCookieHeader,
  getClearSessionCookieHeader,
  type User,
} from "./auth/session";
import { authRateLimiter } from "./auth/middleware";
import {
  SettingsUpdateSchema,
  settingsHook,
  rowsToAdminSettings,
  toPublicSettings,
} from "./settings";

type Bindings = {
  // Neon Postgres connection string. In dev it is loaded from the repo-root
  // `.dev.env` (via `wrangler dev --env-file`); in production set it with
  // `wrangler secret put DB_CONN`.
  DB_CONN: string;
  // Internal service binding to the HubSpot gateway Worker.
  HUBSPOT: Fetcher;
  ADMIN_EMAIL: string;
};

type MessageRow = {
  id: number;
  body: string;
  created_at: string;
};

type ReservationRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  room: string | null;
  arrive: string | null;
  depart: string | null;
  people: number;
  message: string | null;
  created_at: string;
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

const ReservationRequestSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z
    .string()
    .trim()
    .min(1, "email is required")
    .email("valid email is required"),
  phone: trimToNull,
  room: trimToNull,
  arrive: trimToNull,
  depart: trimToNull,
  message: trimToNull,
  people: z.coerce.number().int().min(1).catch(1),
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
});

const LoginSchema = z.object({
  email: z.string().trim().min(1, "email requis"),
  password: z.string().min(1, "mot de passe requis"),
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

// CORS for the API surface.
// The SPA is served same-origin (www.aubergeduvieuxpont.ca/* → web Worker,
// /api/* → this Worker), so we scope CORS to that origin rather than "*".
// Add more origins to this array if other front-ends need to call the API.
const ALLOWED_ORIGINS = [
  "https://www.aubergeduvieuxpont.ca",
  // A/B concept-testing surfaces (served same-origin, so this is defensive).
  "https://dev.aubergeduvieuxpont.ca",
  "https://a.aubergeduvieuxpont.ca",
  "https://b.aubergeduvieuxpont.ca",
];
app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
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
  zValidator("json", ReservationRequestSchema, reservationHook),
  async (c) => {
    const data = c.req.valid("json");

    const sql = neon(c.env.DB_CONN);
    const rows = (await sql`
      INSERT INTO reservations (name, email, phone, room, arrive, depart, people, message)
      VALUES (${data.name}, ${data.email}, ${data.phone}, ${data.room}, ${data.arrive}, ${data.depart}, ${data.people}, ${data.message})
      RETURNING id, name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, message, created_at
    `) as ReservationRow[];

    const created = rows[0];
    if (!created) {
      return c.json({ error: "Failed to create reservation" }, 500);
    }

    c.executionCtx.waitUntil(
      (async () => {
        try {
          await c.env.HUBSPOT.fetch(
            new Request("http://hubspot/ops/enqueue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: "contact.upsert",
                payload: { email: data.email, name: data.name },
              }),
            })
          );

          await c.env.HUBSPOT.fetch(
            new Request("http://hubspot/ops/enqueue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: "deal.create",
                payload: {
                  contactEmail: data.email,
                  dealname: `Reservation #${created.id}`,
                  arrive: data.arrive || undefined,
                  depart: data.depart || undefined,
                  room: data.room || undefined,
                  people: data.people || undefined,
                  description: data.message || undefined,
                },
                dedupeKey: `reservation-${created.id}`,
              }),
            })
          );
        } catch {
        }
      })()
    );

    return c.json({ reservation: created }, 201);
  }
);

// Auth routes
app.post(
  "/api/auth/register",
  authRateLimiter,
  zValidator("json", RegisterSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    try {
      const passwordHash = await hashPassword(data.password);
      const rows = (await sql`
        INSERT INTO users (email, password_hash, name, role)
        VALUES (${data.email}, ${passwordHash}, ${data.name}, 'guest')
        RETURNING id, email, name, role
      `) as User[];

      const user = rows[0];
      if (!user) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      const token = await createSession(sql, user.id);
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
    return c.json({ error: "Unauthorized" }, 401);
  }
  return c.json({ user });
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

// Profile route (requires auth, enriched with HubSpot data)
app.get("/api/profile", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const sql = neon(c.env.DB_CONN);
  const reservations = (await sql`
    SELECT id, name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, message, created_at
    FROM reservations
    WHERE lower(email) = lower(${user.email})
    ORDER BY created_at DESC
  `) as ReservationRow[];

  let hubspot: { contact: unknown; deals: unknown[] } = { contact: null, deals: [] };
  try {
    const contactRes = await c.env.HUBSPOT.fetch(
      new Request("http://hubspot/ops/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "contact.get",
          payload: { email: user.email },
        }),
      })
    );
    const contactData = (await contactRes.json()) as any;
    if (contactData.ok && contactData.data) {
      hubspot.contact = contactData.data;
    }

    const dealsRes = await c.env.HUBSPOT.fetch(
      new Request("http://hubspot/ops/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "deal.listByContact",
          payload: { email: user.email },
        }),
      })
    );
    const dealsData = (await dealsRes.json()) as any;
    if (dealsData.ok && Array.isArray(dealsData.data)) {
      hubspot.deals = dealsData.data;
    }
  } catch {
    // Degrade gracefully if HubSpot is unreachable
  }

  return c.json({ user, reservations, hubspot });
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
    SELECT id, name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, message, created_at
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
    rows = (await sql`SELECT * FROM outbox ORDER BY updated_at DESC`) as OutboxRow[];
  } else {
    rows = (await sql`SELECT * FROM outbox WHERE status = ${status} ORDER BY updated_at DESC`) as OutboxRow[];
  }

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
    SELECT * FROM outbox WHERE id = ${id} AND status = 'failed'
  `) as OutboxRow[];

  if (rows.length === 0) {
    const existing = (await sql`SELECT * FROM outbox WHERE id = ${id}`) as OutboxRow[];
    if (existing.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ row: existing[0] }, 200);
  }

  const updated = (await sql`
    UPDATE outbox
    SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = now()
    WHERE id = ${id}
    RETURNING *
  `) as OutboxRow[];

  return c.json({ row: updated[0] }, 200);
});

// Public settings endpoint
app.get("/api/settings", async (c) => {
  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];

  const adminSettings = rowsToAdminSettings(rows);
  const publicSettings = toPublicSettings(adminSettings);

  return c.json(publicSettings);
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
      sql`INSERT INTO settings (key, value) VALUES ('contact_email', ${data.contactEmail}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('marketing_room_count', ${data.marketingRoomCount.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('assignable_room_count', ${data.assignableRoomCount.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    ]);

    const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
    const adminSettings = rowsToAdminSettings(rows);

    return c.json(adminSettings);
  }
);

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default app;
