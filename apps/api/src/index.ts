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

const ReservationRequestSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().min(1, "email is required"),
  phone: z.string().optional().default(""),
  room: z.string().optional().default(""),
  arrive: z.string().optional().default(""),
  depart: z.string().optional().default(""),
  people: z.coerce.number().int().min(1).optional().default(1),
  message: z.string().optional().default(""),
});

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
// Starter default allows all origins ("*"). For production, replace "*" with
// your frontend origin, e.g. origin: "https://your-site.example.com".
app.use(
  "/api/*",
  cors({
    origin: "*",
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
  async (c) => {
    let data: any;
    try {
      data = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Defensive read and trim required fields
    const nameRaw = typeof data.name === "string" ? data.name : "";
    const emailRaw = typeof data.email === "string" ? data.email : "";
    const name = nameRaw.trim();
    const email = emailRaw.trim();

    if (!name || !email) {
      return c.json({ error: "name and email are required" }, 400);
    }

    // Normalize optional string fields: trim, convert empty to null
    const normalizeString = (val: any): string | null => {
      if (typeof val !== "string") return null;
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const phone = normalizeString(data.phone);
    const room = normalizeString(data.room);
    const arrive = normalizeString(data.arrive);
    const depart = normalizeString(data.depart);
    const message = normalizeString(data.message);

    // Coerce people to positive integer, default to 1 if invalid
    let people = 1;
    if (typeof data.people === "number") {
      if (Number.isFinite(data.people)) {
        const num = Math.floor(data.people);
        if (num >= 1) people = num;
      }
    } else if (typeof data.people === "string") {
      const num = parseInt(data.people, 10);
      if (Number.isFinite(num) && num >= 1) people = num;
    }

    const sql = neon(c.env.DB_CONN);
    const rows = (await sql`
      INSERT INTO reservations (name, email, phone, room, arrive, depart, people, message)
      VALUES (${name}, ${email}, ${phone}, ${room}, ${arrive}, ${depart}, ${people}, ${message})
      RETURNING id, name, email, phone, room, to_char(arrive, 'YYYY-MM-DD') as arrive, to_char(depart, 'YYYY-MM-DD') as depart, people, message, created_at
    `) as ReservationRow[];

    const created = rows[0];
    if (!created) {
      return c.json({ error: "Failed to create reservation" }, 500);
    }

    return c.json({ reservation: created }, 201);
  }
);

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default app;
