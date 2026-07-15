import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";

type Bindings = {
  // Neon Postgres connection string. In dev it is loaded from the repo-root
  // `.dev.env` (via `wrangler dev --env-file`); in production set it with
  // `wrangler secret put DB_CONN`.
  DB_CONN: string;
  // Internal service binding to the HubSpot gateway Worker.
  HUBSPOT: Fetcher;
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

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default app;
