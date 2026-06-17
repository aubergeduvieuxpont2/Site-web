import { Hono } from "hono";
import { cors } from "hono/cors";
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

const app = new Hono<{ Bindings: Bindings }>();

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

app.post("/api/messages", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const body = (payload as { body?: unknown } | null)?.body;
  if (typeof body !== "string" || body.trim().length === 0) {
    return c.json({ error: "`body` must be a non-empty string" }, 400);
  }

  const sql = neon(c.env.DB_CONN);
  // Values interpolated into the tagged template are sent as bound
  // parameters by the Neon driver — safe from SQL injection.
  const rows = (await sql`
    INSERT INTO messages (body)
    VALUES (${body.trim()})
    RETURNING id, body, created_at
  `) as MessageRow[];

  const created = rows[0];
  if (!created) {
    return c.json({ error: "Failed to create message" }, 500);
  }

  return c.json({ message: created }, 201);
});

// JSON 404 for unmatched routes.
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default app;
