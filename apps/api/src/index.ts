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
} from "./settings";

type Bindings = {
  DB_CONN: string;
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
    SELECT id, name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, message, created_at
    FROM reservations
    WHERE lower(email) = lower(${user.email})
    ORDER BY created_at DESC
  `) as ReservationRow[];

  return c.json({ user, reservations });
});

// Public rooms endpoint
app.get("/api/rooms", async (c) => {
  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`
    SELECT slug, is_public FROM room_visibility ORDER BY slug
  `) as RoomVisibilityRow[];

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
    SELECT slug, is_public FROM room_visibility ORDER BY slug
  `) as RoomVisibilityRow[];

  return c.json({ rooms });
});

app.post(
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
  zValidator("json", RoomVisibilitySchema),
  async (c) => {
    const slug = c.req.param("slug");
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`
      UPDATE room_visibility
      SET is_public = ${data.isPublic}, updated_at = now()
      WHERE slug = ${slug}
      RETURNING slug, is_public
    `) as RoomVisibilityRow[];

    if (rows.length === 0) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({ room: rows[0] });
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
