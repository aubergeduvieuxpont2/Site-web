import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
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
  const { results } = await c.env.DB.prepare(
    "SELECT id, body, created_at FROM messages ORDER BY id DESC LIMIT 100",
  ).all<MessageRow>();

  return c.json({ messages: results });
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

  const created = await c.env.DB.prepare(
    "INSERT INTO messages (body) VALUES (?) RETURNING id, body, created_at",
  )
    .bind(body.trim())
    .first<MessageRow>();

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
