import { Hono, type Context } from "hono";
import type { ExportedHandler, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drainEmailOutbox, enqueueEmail } from "./emailOutbox";
import { buildReservationConfirmationData } from "./emailPayloads";
import { provisionOtaGuest, SITE_ORIGIN } from "./provisioning";
import { generateCode } from "./reservationCode";
import { enqueueReviewRequests } from "./reviewRequests";
import { hashPassword, verifyPassword, needsRehash } from "./auth/password";
import { isPasswordBreached } from "./auth/hibp";
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
  rateLimitAllow,
  isAccountLocked,
  recordLoginFailure,
  clearLoginFailures,
} from "./auth/rateLimit";
import { checkSharedSecret, INTERNAL_AUTH_HEADER } from "./auth/internalAuth";
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
import { createDashboardRouter } from "./dashboard";
import { createReviewsRouter } from "./reviews";
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
  // Shared secret presented to the HubSpot gateway on every /ops/* call.
  GATEWAY_AUTH_SECRET?: string;
  // Shared secret required from the email-ingest Worker on /internal/ota-bookings.
  INTERNAL_OTA_SECRET?: string;
  RESEND_API_KEY: string;
};

type MessageRow = {
  id: number;
  body: string;
  created_at: string;
};

type ReservationRow = {
  id: number;
  code: string | null;
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
  source?: string | null;
  external_ref?: string | null;
  user_id?: number | null;
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

const MessageRequestSchema = z.object({
  body: z.string().min(1, "body must be non-empty"),
});

// L2: shown when a submitted password is found in the HIBP breach corpus.
const BREACHED_PASSWORD_ERROR =
  "Ce mot de passe figure dans une fuite de données connue. Veuillez en choisir un autre.";

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
  // L5: upper bounds so a single request can't ask for an absurd room/guest
  // count. guests keeps `.catch(1)` (an out-of-range value clamps to 1 rather
  // than 400); roomCount rejects out-of-range with a 400.
  guests: z.coerce.number().int().min(1).max(50).catch(1),
  roomCount: z.coerce
    .number()
    .int()
    .min(1, "roomCount must be at least 1")
    .max(20, "roomCount must be at most 20"),
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
  password: z.string().min(12, "le mot de passe doit contenir au moins 12 caractères"),
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
  newPassword: z.string().min(12, "le mot de passe doit contenir au moins 12 caractères"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("email invalide"),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "token requis"),
  newPassword: z.string().min(12, "le mot de passe doit contenir au moins 12 caractères"),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1, "token requis"),
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

const BlackoutRangeCreateSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
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

// `assignable_room_count` is a cache derived from the number of public rooms.
// Recompute it from the rooms table and persist it into the settings row so the
// availability endpoint (which reads the row) and the admin UI stay in sync.
// Called after every room mutation and on settings load/save. Returns the count.
async function syncAssignableRoomCount(
  sql: NeonQueryFunction<any, any>
): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS count FROM rooms WHERE is_public = true
  `) as { count: number }[];
  const count = rows[0]?.count ?? 0;
  await sql`
    INSERT INTO settings (key, value) VALUES ('assignable_room_count', ${String(count)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  return count;
}

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

// L4: parse a `:id` path param as a positive integer. Non-numeric / overflow /
// non-positive values return null so the handler can answer 400 instead of
// letting a NaN or cast error surface as an unhandled 500.
function parseIdParam(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// L5: today's date as YYYY-MM-DD (UTC) for the "no arrival in the past" check.
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// M9 (anti-enumeration): a valid-format PBKDF2 hash we verify against when the
// email is UNKNOWN, so an unknown-email login spends the same PBKDF2 CPU as a
// found-user login — removing the timing side-channel that reveals which emails
// have accounts. Computed LAZILY on first login and memoized; it must NOT run at
// module load because Cloudflare Workers forbid async I/O / crypto in global
// scope (deploy validation error 10021). A fixed input is fine — the value only
// needs to be a valid-format hash the submitted password will not match.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  return (dummyHashPromise ??= hashPassword("verify-timing-equalizer-dummy-secret"));
}

// Insert a code, retrying up to 5 times on the rare uniqueness collision.
// Code generation lives in ./reservationCode (single source of truth, unit-tested).
async function insertReservationCode(
  sql: NeonQueryFunction<any, any>,
  reservationId: number
): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    try {
      const rows = (await sql`
        UPDATE reservations SET code = ${code} WHERE id = ${reservationId} AND code IS NULL
        RETURNING code
      `) as { code: string }[];
      if (rows[0]) return rows[0].code;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("unique") && !msg.includes("UNIQUE")) throw err;
    }
  }
  return null;
}

// Review-request enqueue lives in ./reviewRequests (single source of truth,
// unit-tested; passes checkIn/checkOut so the email template renders dates).

const app = new Hono<{ Bindings: Bindings }>();

// Durable, cross-isolate general rate limiter: 30 requests / 15 min per IP.
// Backed by the Neon `rate_limits` table (migration 0033) so all isolates share
// one counter — the old in-memory Map let an attacker reset by hitting a fresh
// isolate. Keyed ONLY on cf-connecting-ip (never the spoofable x-forwarded-for);
// a missing IP still counts under a fixed "noip" bucket. Fails OPEN on DB error.
const rateLimitMiddleware = async (c: Context, next: () => Promise<void>) => {
  const ip = c.req.header("cf-connecting-ip") || "noip";
  const sql = neon((c.env as { DB_CONN: string }).DB_CONN);

  const allowed = await rateLimitAllow(sql, `general:${ip}`, 30, 15 * 60 * 1000, Date.now());
  if (!allowed) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

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

// M8: reading stored contact-form messages is admin-only (they were previously
// world-readable with no auth). POST below stays public (the contact form).
app.get("/api/messages", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

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

    // L5: dates are mandatory on this path. A date-less booking would otherwise
    // skip the availability gate below and land as a `pending` row that silently
    // oversells the property — so reject it with a 400.
    if (!data.checkIn || !data.checkOut) {
      return c.json({ error: "Les dates d'arrivée et de départ sont requises." }, 400);
    }

    // L5: no reservations that start in the past.
    if (data.checkIn < todayISODate()) {
      return c.json({ error: "La date d'arrivée ne peut pas être dans le passé." }, 400);
    }

    // Derived value for the NOT NULL `name` column; the split first/last are
    // persisted alongside it.
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ");

    const sql = neon(c.env.DB_CONN);

    // Check availability before inserting (dates are guaranteed present above).
    {
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
      RETURNING id, code, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, status, created_at
    `) as ReservationRow[];

    const created = rows[0];
    if (!created) {
      return c.json({ error: "Failed to create reservation" }, 500);
    }

    // Assign a human-facing code if the column exists and the row lacks one.
    if (created.code == null) {
      try {
        await insertReservationCode(sql, created.id);
      } catch (err) {
        console.error("reservation code assignment failed", err);
      }
    }

    c.executionCtx.waitUntil(
      (async () => {
        try {
          if (!created.arrive || !created.depart) return;
          const confirmSettingsRows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
          const confirmSettings = rowsToAdminSettings(confirmSettingsRows);
          const invoice = computeInvoice({
            nights: nightsBetween(created.arrive, created.depart),
            roomCount: created.room_count ?? 1,
            effectiveNightly: confirmSettings.nightlyPrice,
            weeklyRate: confirmSettings.weeklyPrice,
            tps: confirmSettings.tps,
            tvq: confirmSettings.tvq,
            accommodationTax: confirmSettings.accommodationTax,
            type: "full",
          });
          const data = buildReservationConfirmationData(created, invoice, {
            accommodationTax: confirmSettings.accommodationTax,
            tps: confirmSettings.tps,
            tvq: confirmSettings.tvq,
          });
          if (data) {
            await enqueueEmail(sql, {
              template: "reservation-confirmation",
              to: created.email,
              payload: data as unknown as Record<string, unknown>,
            });
          }
        } catch (err) {
          console.error("confirmation email enqueue failed", err);
        }
      })()
    );

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
        c.env.GATEWAY_AUTH_SECRET,
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

  // L5: bound `rooms` (an unbounded value drives an expensive availability query
  // and is never legitimate) and require valid, well-ordered dates.
  if (!checkIn || !checkOut || !Number.isInteger(rooms) || rooms < 1 || rooms > 20) {
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
  // Authenticate the service-binding caller BEFORE reading the body: an absent
  // or mismatched X-Internal-Auth fails closed with 401.
  if (!checkSharedSecret(c.req.header(INTERNAL_AUTH_HEADER), c.env.INTERNAL_OTA_SECRET)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
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

  // OTA bookings from known platforms are auto-confirmed; direct website bookings stay pending.
  const otaStatus = (d.source === "airbnb" || d.source === "expedia") ? "confirmed" : "pending";

  // ON CONFLICT against the partial unique index dedupes resent confirmations.
  const rows = (await sql`
    INSERT INTO reservations (name, first_name, last_name, email, phone, room, arrive, depart, people, room_count, message, source, external_ref, status)
    VALUES (${name}, ${d.firstName}, ${d.lastName}, ${d.guestEmail ?? ""}, ${d.phone}, ${d.listingName}, ${d.checkIn}, ${d.checkOut}, ${d.guests}, 1, ${message}, ${d.source}, ${d.externalRef}, ${otaStatus})
    ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
    RETURNING id, code
  `) as { id: number; code: string | null }[];

  const created = rows[0];
  if (!created) {
    await sql`
      INSERT INTO email_ingest_log (provider, status, subject)
      VALUES (${d.source}, 'duplicate', ${d.subject})
    `;
    return c.json({ ok: true, duplicate: true }, 200);
  }

  // Assign human-facing code if not already set (column may not exist yet on older deploys).
  if (created.code == null) {
    try {
      await insertReservationCode(sql, created.id);
    } catch (err) {
      console.error("ota reservation code assignment failed", err);
    }
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
      c.env.GATEWAY_AUTH_SECRET,
    )
  );

  if (d.guestEmail) {
    c.executionCtx.waitUntil(
      provisionOtaGuest(sql, {
        reservationId: created.id,
        guestEmail: d.guestEmail,
        firstName: d.firstName,
        lastName: d.lastName,
        externalRef: d.externalRef,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
      })
    );
  }

  return c.json({ reservationId: created.id }, 201);
});

// Auth routes
// Durably link a user's guest reservations to their account by matching the
// account email. Only claims UNCLAIMED rows (user_id IS NULL), so it can never
// reassign a reservation already owned by another account. Called at the trusted
// moments where the email is the account's own — registration, login, and (with
// the pre-change address) an email change. Profile reads then key strictly off
// user_id, which closes the email-reassignment IDOR: changing your email can no
// longer surface another person's bookings.
export async function linkGuestReservations(
  sql: NeonQueryFunction<any, any>,
  userId: number,
  email: string
): Promise<void> {
  await sql`
    UPDATE reservations SET user_id = ${userId}
    WHERE user_id IS NULL AND lower(email) = lower(${email})
  `;
}

app.post(
  "/api/auth/register",
  authRateLimiter,
  zValidator("json", RegisterSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    // L2: reject known-breached passwords (fails open if HIBP is unreachable).
    if (await isPasswordBreached(data.password)) {
      return c.json({ error: BREACHED_PASSWORD_ERROR }, 400);
    }

    // Derive name from firstName + lastName if not explicitly provided
    const derivedName =
      [data.firstName, data.lastName].filter(Boolean).join(" ") ||
      data.name ||
      null;

    try {
      const passwordHash = await hashPassword(data.password);
      const rows = (await sql`
        INSERT INTO users (email, password_hash, name, role, first_name, last_name, phone, company, email_verified)
        VALUES (${data.email}, ${passwordHash}, ${derivedName}, 'guest', ${data.firstName ?? null}, ${data.lastName ?? null}, ${data.phone ?? null}, ${data.company ?? null}, false)
        RETURNING id, email, name, role
      `) as User[];

      const user = rows[0];
      if (!user) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      // Do NOT auto-claim guest reservations here: the email is unproven until
      // the user confirms it (M4-residual). Linking happens on verify-email /
      // on login once email_verified is true.
      const token = await createSession(sql, user.id);

      // Send an email-verification link (24h). Best-effort — a failure here must
      // not block the 201; the account exists and can re-verify later.
      try {
        const rawToken = generateToken();
        const tokenHash = await sha256hex(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await sql`
          INSERT INTO email_verification_tokens (token_hash, user_id, purpose, expires_at)
          VALUES (${tokenHash}, ${user.id}, 'register', ${expiresAt})
        `;
        await enqueueEmail(sql, {
          template: "email-verification",
          to: data.email,
          payload: {
            firstName: data.firstName ?? derivedName ?? "client",
            verifyUrl: `${SITE_ORIGIN}/verification?token=${rawToken}`,
            expiryHours: 24,
          },
        });
      } catch (err) {
        console.error("email-verification enqueue failed", err);
      }

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
                headers: {
                  "Content-Type": "application/json",
                  "X-Internal-Auth": c.env.GATEWAY_AUTH_SECRET ?? "",
                },
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
        // M9 (anti-enumeration): keep the 409 status (the frontend/onboarding flow
        // in PR #45 branches on it), but return a GENERIC body that does not
        // confirm an account already exists. Mirroring the forgot-password
        // no-enumeration pattern (silent 200) was rejected: it would let a
        // duplicate registration appear to succeed and risk the guest-portal flow.
        return c.json({ error: "Inscription impossible." }, 409);
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
      SELECT id, email, password_hash, name, role, email_verified
      FROM users
      WHERE lower(email) = lower(${data.email})
    `) as (User & { password_hash: string; email_verified: boolean })[];

    const user = rows[0];

    // M9: unknown email — run a dummy verify against a constant valid-format hash
    // so the timing matches the found-user path (no user enumeration via timing).
    if (!user) {
      await verifyPassword(data.password, await getDummyHash());
      return c.json({ error: "Identifiants invalides" }, 401);
    }

    // M1: per-account lockout — too many recent failed logins → generic 429.
    // Checked before verifying the password so a locked account can't be probed.
    // All lockout DB calls are best-effort: if the login_failures table is
    // unavailable (e.g. migration 0033 not yet applied on deploy), we fail OPEN
    // so login never 500s — lockout simply doesn't engage until the DB is healthy.
    let locked = false;
    try {
      locked = await isAccountLocked(sql, data.email, Date.now(), 10, 15 * 60 * 1000);
    } catch {
      /* fail open */
    }
    if (locked) {
      return c.json({ error: "Identifiants invalides" }, 429);
    }

    if (!(await verifyPassword(data.password, user.password_hash))) {
      // Record the failure toward the per-account lockout, then generic 401.
      try {
        await recordLoginFailure(sql, data.email, Date.now());
      } catch {
        /* fail open */
      }
      return c.json({ error: "Identifiants invalides" }, 401);
    }

    // Successful login clears the account's failed-login history.
    try {
      await clearLoginFailures(sql, data.email);
    } catch {
      /* fail open */
    }

    // L1: transparently upgrade a hash minted with fewer than the current target
    // iterations now that we hold the plaintext. Best-effort — a failure here
    // must never block a valid login.
    if (needsRehash(user.password_hash)) {
      try {
        const upgraded = await hashPassword(data.password);
        await sql`UPDATE users SET password_hash = ${upgraded} WHERE id = ${user.id}`;
      } catch {
        /* best-effort */
      }
    }

    // Link any unclaimed guest reservations under this account's email so the
    // profile (which reads strictly by user_id) shows them without an email
    // match — but ONLY once the email is proven owned (M4-residual). An
    // unverified account still logs in; it just doesn't auto-claim yet.
    if (user.email_verified === true) {
      await linkGuestReservations(sql, user.id, user.email);
    }

    const token = await createSession(sql, user.id);
    const { password_hash, email_verified, ...safeUser } = user;
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
  authRateLimiter,
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

    // L2: reject known-breached passwords (fails open if HIBP is unreachable).
    if (await isPasswordBreached(data.newPassword)) {
      return c.json({ error: BREACHED_PASSWORD_ERROR }, 400);
    }

    const newHash = await hashPassword(data.newPassword);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;

    // M3: a password change must revoke every existing session (drop any attacker
    // who has an active cookie), then mint a fresh session for the acting user so
    // they stay logged in, re-setting the session cookie on the response.
    await invalidateUserSessions(sql, user.id);
    const token = await createSession(sql, user.id);

    return c.json({ ok: true }, 200, {
      "Set-Cookie": getSessionCookieHeader(token),
    });
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
      SELECT id, email, first_name, name FROM users WHERE lower(email) = lower(${data.email})
    `) as { id: number; email: string; first_name: string | null; name: string | null }[];

    const user = rows[0];
    if (user) {
      const rawToken = generateToken();
      const tokenHash = await sha256hex(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await sql`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
        VALUES (${tokenHash}, ${user.id}, ${expiresAt})
      `;

      try {
        await enqueueEmail(sql, {
          template: "password-reset",
          to: user.email,
          payload: {
            firstName: user.first_name ?? user.name ?? "client",
            resetUrl: `${SITE_ORIGIN}/reinitialisation?token=${rawToken}`,
            expiryHours: 1,
          },
        });
      } catch (err) {
        console.error("password-reset email enqueue failed", err);
      }
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

    // L2: reject known-breached passwords (fails open if HIBP is unreachable).
    if (await isPasswordBreached(data.newPassword)) {
      return c.json({ error: BREACHED_PASSWORD_ERROR }, 400);
    }

    const userId = rows[0].user_id;
    const newHash = await hashPassword(data.newPassword);

    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${userId}`;
    await sql`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = ${tokenHash}`;
    await invalidateUserSessions(sql, userId);

    return c.json({ ok: true });
  }
);

// Verify email (single-use token). Closes M4-residual + M10: proves ownership of
// an email before an account may auto-claim guest reservations, and confirms an
// email change at the new address before it takes effect. Generic errors only —
// no account enumeration.
app.post(
  "/api/auth/verify-email",
  authRateLimiter,
  zValidator("json", VerifyEmailSchema, authHook),
  async (c) => {
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const tokenHash = await sha256hex(data.token);

    const rows = (await sql`
      SELECT user_id, purpose, new_email
      FROM email_verification_tokens
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > now()
    `) as { user_id: number; purpose: string; new_email: string | null }[];

    const row = rows[0];
    if (!row) {
      return c.json({ error: "Lien invalide ou expiré." }, 400);
    }

    if (row.purpose === "register") {
      // Fetch the account's own (already-owned) email to link reservations by.
      const userRows = (await sql`
        SELECT email FROM users WHERE id = ${row.user_id}
      `) as { email: string }[];
      const email = userRows[0]?.email;
      if (!email) {
        return c.json({ error: "Lien invalide ou expiré." }, 400);
      }

      await sql`UPDATE users SET email_verified = true WHERE id = ${row.user_id}`;
      await linkGuestReservations(sql, row.user_id, email);
      await sql`UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = ${tokenHash}`;

      return c.json({ ok: true, purpose: "register" }, 200);
    }

    if (row.purpose === "change") {
      const newEmail = row.new_email;
      if (!newEmail) {
        return c.json({ error: "Lien invalide ou expiré." }, 400);
      }

      // Re-check uniqueness: another account may have claimed this address since
      // the change was requested. Leave pending_email intact so the user can
      // retry after resolving the conflict.
      const taken = (await sql`
        SELECT id FROM users WHERE lower(email) = lower(${newEmail}) AND id != ${row.user_id}
      `) as { id: number }[];
      if (taken.length > 0) {
        return c.json({ error: "Cette adresse courriel est déjà utilisée." }, 409);
      }

      const userRows = (await sql`
        SELECT hubspot_contact_id FROM users WHERE id = ${row.user_id}
      `) as { hubspot_contact_id: string | null }[];
      const hubspotContactId = userRows[0]?.hubspot_contact_id ?? null;

      await sql`
        UPDATE users
        SET email = ${newEmail}, pending_email = NULL, email_verified = true
        WHERE id = ${row.user_id}
      `;
      await linkGuestReservations(sql, row.user_id, newEmail);
      await sql`UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = ${tokenHash}`;

      // Fire-and-forget HubSpot email update (mirrors the previous inline sync,
      // carrying the Batch-1 shared secret so /ops/enqueue does not 401).
      if (hubspotContactId) {
        c.executionCtx.waitUntil(
          (async () => {
            try {
              await c.env.HUBSPOT.fetch(
                new Request("http://hubspot/ops/enqueue", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Internal-Auth": c.env.GATEWAY_AUTH_SECRET ?? "",
                  },
                  body: JSON.stringify({
                    kind: "contact.updateById",
                    payload: { contactId: hubspotContactId, properties: { email: newEmail } },
                    dedupeKey: `user-${row.user_id}-email-${newEmail.toLowerCase()}`,
                  }),
                })
              );
            } catch (err) {
              console.error("HubSpot contact update error:", err);
            }
          })()
        );
      }

      return c.json({ ok: true, purpose: "change", email: newEmail }, 200);
    }

    // Unknown purpose — treat as invalid, no enumeration.
    return c.json({ error: "Lien invalide ou expiré." }, 400);
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
    WHERE user_id = ${user.id}
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
  authRateLimiter,
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
      SELECT password_hash, first_name FROM users WHERE id = ${user.id}
    `) as { password_hash: string; first_name: string | null }[];

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

    // Do NOT change the email yet (M10): stage it as pending_email and require
    // the new address to be confirmed before it takes effect. The actual
    // UPDATE users SET email, reservation re-link and HubSpot sync all happen
    // in POST /api/auth/verify-email once the new address is proven owned.
    const firstName = userRow[0].first_name ?? user.name ?? "client";

    await sql`
      UPDATE users SET pending_email = ${newEmail} WHERE id = ${user.id}
    `;

    // Best-effort: a mail-enqueue failure must not 500 the request. The pending
    // change is recorded and can be re-triggered.
    try {
      const rawToken = generateToken();
      const tokenHash = await sha256hex(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await sql`
        INSERT INTO email_verification_tokens (token_hash, user_id, purpose, new_email, expires_at)
        VALUES (${tokenHash}, ${user.id}, 'change', ${newEmail}, ${expiresAt})
      `;
      // Confirmation link to the NEW address…
      await enqueueEmail(sql, {
        template: "email-verification",
        to: newEmail,
        payload: {
          firstName,
          verifyUrl: `${SITE_ORIGIN}/verification?token=${rawToken}`,
          expiryHours: 24,
        },
      });
      // …and an alert to the OLD address so a hijacked session can't silently
      // move the account's email.
      await enqueueEmail(sql, {
        template: "email-change-alert",
        to: user.email,
        payload: { firstName, newEmail },
      });
    } catch (err) {
      console.error("email-change verification enqueue failed", err);
    }

    return c.json({ ok: true, pending: true }, 200);
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
    SELECT id, code, name, first_name, last_name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, room_count, message, status, source, external_ref, user_id, created_at
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
  const id = parseIdParam(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid id" }, 400);

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

      // Keep the derived public-room count (assignable_room_count) in sync.
      await syncAssignableRoomCount(sql);

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

    // is_public may have changed; refresh the derived public-room count.
    await syncAssignableRoomCount(sql);

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

    // A public room may have been removed; refresh the derived count.
    await syncAssignableRoomCount(sql);

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

    const targetId = parseIdParam(c.req.param("id"));
    if (targetId === null) return c.json({ error: "Invalid id" }, 400);
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

  const targetId = parseIdParam(c.req.param("id"));
  if (targetId === null) return c.json({ error: "Invalid id" }, 400);
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

  // L6: audit trail — minting a live reset link is a sensitive admin action.
  // Best-effort so a missing audit table can never break link minting.
  try {
    await sql`
      INSERT INTO admin_audit (admin_user_id, action, target_user_id)
      VALUES (${admin.id}, 'reset_link_minted', ${targetId})
    `;
  } catch (err) {
    console.error("admin_audit_insert_failed", err instanceof Error ? err.name : "unknown");
  }

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

  const reservationId = parseIdParam(c.req.param("id"));
  if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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

  const reservationId = parseIdParam(c.req.param("id"));
  if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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
    const reservationId = parseIdParam(c.req.param("id"));
    if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const resRows = (await sql`
              SELECT name, email, to_char(arrive, 'YYYY-MM-DD') AS arrive, to_char(depart, 'YYYY-MM-DD') AS depart
              FROM reservations WHERE id = ${reservationId}
            `) as { name: string; email: string; arrive: string | null; depart: string | null }[];
            const roomRows = (await sql`
              SELECT name, passkey_enabled, passkey FROM rooms WHERE slug = ${data.roomSlug}
            `) as { name: string; passkey_enabled: boolean; passkey: string | null }[];
            const r = resRows[0];
            const room = roomRows[0];
            // Airbnb-sourced reservations have an empty email — nothing to send to.
            if (!r || !room || !r.email) return;
            await enqueueEmail(sql, {
              template: "room-assigned",
              to: r.email,
              payload: {
                name: r.name,
                roomLabel: room.name,
                checkIn: r.arrive ?? "",
                checkOut: r.depart ?? "",
                passkeyEnabled: room.passkey_enabled && !!room.passkey,
                passkey: room.passkey ?? undefined,
                confirmationCode: `#${reservationId}`,
              },
            });
          } catch (err) {
            console.error("room-assigned email enqueue failed", err);
          }
        })()
      );

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

  const reservationId = parseIdParam(c.req.param("id"));
  if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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
    const reservationId = parseIdParam(c.req.param("id"));
    if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Auth": c.env.GATEWAY_AUTH_SECRET ?? "",
        },
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

  const targetId = parseIdParam(c.req.param("id"));
  if (targetId === null) return c.json({ error: "Invalid id" }, 400);
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
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Auth": c.env.GATEWAY_AUTH_SECRET ?? "",
          },
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
    const targetId = parseIdParam(c.req.param("id"));
    if (targetId === null) return c.json({ error: "Invalid id" }, 400);
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
    const reservationId = parseIdParam(c.req.param("id"));
    if (reservationId === null) return c.json({ error: "Invalid id" }, 400);
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

// Range endpoints must be registered BEFORE /:date so Hono's router matches
// the static segment "range" instead of treating it as a date param.
app.post(
  "/api/admin/blackouts/range",
  async (c, next) => {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    await next();
  },
  zValidator("json", BlackoutRangeCreateSchema),
  async (c) => {
    const data = c.req.valid("json");
    if (data.startDate > data.endDate) {
      return c.json({ error: "startDate doit être ≤ endDate" }, 400);
    }
    // Span check: endDate - startDate <= 366 days.
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (spanDays > 366) {
      return c.json({ error: "La plage ne peut dépasser 366 jours" }, 400);
    }

    const sql = neon(c.env.DB_CONN);
    await sql`
      INSERT INTO blackout_dates (date, rooms_blocked, note)
      SELECT
        generate_series(${data.startDate}::date, ${data.endDate}::date, '1 day'::interval)::date,
        ${data.roomsBlocked},
        ${data.note ?? null}
      ON CONFLICT (date) DO UPDATE SET rooms_blocked = EXCLUDED.rooms_blocked, note = EXCLUDED.note, created_at = now()
    `;

    return c.json({ count: spanDays });
  }
);

app.delete("/api/admin/blackouts/range", async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const start = c.req.query("start");
  const end = c.req.query("end");

  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return c.json({ error: "Paramètre start invalide (YYYY-MM-DD attendu)" }, 400);
  }
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return c.json({ error: "Paramètre end invalide (YYYY-MM-DD attendu)" }, 400);
  }
  if (start > end) {
    return c.json({ error: "start doit être ≤ end" }, 400);
  }

  const sql = neon(c.env.DB_CONN);
  const deleted = (await sql`
    DELETE FROM blackout_dates
    WHERE date >= ${start}::date AND date <= ${end}::date
    RETURNING date
  `) as { date: string }[];

  return c.json({ deleted: deleted.length });
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
  // Refresh the derived public-room count before reading so the read-only field
  // always reflects the current rooms table (self-heals any drift).
  await syncAssignableRoomCount(sql);
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
      sql`INSERT INTO settings (key, value) VALUES ('reservations_enabled', ${data.reservationsEnabled ? 'true' : 'false'}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('email_confirmation_enabled', ${data.emailConfirmationEnabled ? "true" : "false"}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('email_password_reset_enabled', ${data.emailPasswordResetEnabled ? "true" : "false"}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('email_room_assignment_enabled', ${data.emailRoomAssignmentEnabled ? "true" : "false"}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('email_welcome_enabled', ${data.emailWelcomeEnabled ? "true" : "false"}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('email_review_request_enabled', ${data.emailReviewRequestEnabled ? "true" : "false"}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    ]);

    // `assignable_room_count` is derived, never taken from the request body:
    // recompute it from the rooms table so it always equals the public-room count.
    await syncAssignableRoomCount(sql);

    const rows = (await sql`SELECT key, value FROM settings`) as SettingsRow[];
    const adminSettings = rowsToAdminSettings(rows);

    return c.json(adminSettings);
  }
);

// Dashboard, reviews, and email routes (admin-gated + public-rate-limited).
// These routers are extracted into testable modules; wired here so the running
// app uses the same code that is covered by the unit tests.
// Cast: getAuthUser only reads c.env.DB_CONN; the narrower Bindings in the
// module deps are structurally compatible at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.route("/", createDashboardRouter({ authenticate: getAuthUser as any }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.route("/", createReviewsRouter({ authenticate: getAuthUser as any }));
app.route("/", createEmailsRouter({ authenticate: getAuthUser }));

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// L4: global error boundary. Any handler that throws (e.g. an unexpected DB
// error) returns a generic JSON 500 — never a raw message or stack trace, which
// could leak SQL, connection strings, or PII. The error name is logged for ops.
app.onError((err, c) => {
  console.error("unhandled_error", err instanceof Error ? err.name : "unknown");
  return c.json({ error: "Internal server error" }, 500);
});

// Named export of the Hono app for tests that drive routes via `app.request`.
export { app };

export default {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    // Enqueue review-request emails first so the drain pass picks them up in
    // the same cron invocation (spec §6c: "BEFORE drainEmailOutbox").
    ctx.waitUntil((async () => {
      await enqueueReviewRequests(neon(env.DB_CONN));
      await drainEmailOutbox(env);
    })());
  },
} satisfies ExportedHandler<Bindings>;
