import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { neon } from "@neondatabase/serverless";
import type { Env } from "./env";
import { parseEnvelope, type ParseResult, executeOp, EnvelopeSchema } from "./ops/registry";
import { enqueue } from "./outbox";
import { hubspotFetch } from "./hubspotClient";
import { scheduled } from "./scheduled";

const app = new Hono<{ Bindings: Env }>();

const envelopeHook = (result: any, c: any) =>
  result.success ? undefined
    : c.json({ ok: false, status: 400, message: "Invalid request" }, 400);

app.post(
  "/ops/enqueue",
  zValidator("json", EnvelopeSchema, envelopeHook),
  async (c) => {
    const body = c.req.valid("json");

    const parseResult = parseEnvelope(body);
    if (!parseResult.success) {
      return c.json(parseResult.error, parseResult.error.status as any);
    }

    try {
      const id = await enqueue(c.env, parseResult.envelope);
      return c.json({ id }, 202);
    } catch {
      return c.json({ ok: false, status: 500, message: "Failed to enqueue" }, 500);
    }
  }
);

app.post(
  "/ops/execute",
  zValidator("json", EnvelopeSchema, envelopeHook),
  async (c) => {
    const body = c.req.valid("json");

    const parseResult = parseEnvelope(body);
    if (!parseResult.success) {
      return c.json(parseResult.error, parseResult.error.status as any);
    }

    try {
      const result = await executeOp(c.env, parseResult.envelope);
      if (result.ok) {
        return c.json({ ok: true, hubspotId: result.hubspotId }, 200);
      } else {
        return c.json(result, result.status as any);
      }
    } catch {
      return c.json({ ok: false, status: 500, message: "Operation failed" }, 500);
    }
  }
);

app.get("/health", async (c) => {
  try {
    await hubspotFetch(c.env, "/account-info/v3/details");
  } catch (err) {
    const message = typeof err === "object" && err !== null && "message" in err ? (err as any).message : "Token check failed";
    return c.json({ ok: false, status: 401, message }, 401);
  }

  try {
    const sql = neon(c.env.DB_CONN);
    await sql`SELECT 1`;
  } catch (err) {
    const message = "Database connection failed";
    return c.json({ ok: false, status: 503, message }, 503);
  }

  return c.json({ ok: true }, 200);
});

app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => scheduled(event, env, ctx),
};
