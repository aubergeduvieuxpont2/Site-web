import type { Context, Next } from "hono";
import { neon } from "@neondatabase/serverless";
import { validateSession } from "./session";
import type { User } from "./session";
import { rateLimitAllow } from "./rateLimit";

type ContextWithUser = Context & {
  user?: User;
};

export async function requireAuth(c: ContextWithUser, next: Next): Promise<void> {
  const cookieHeader = c.req.header("Cookie") || "";
  const sessionToken = extractSessionToken(cookieHeader);

  if (!sessionToken) {
    c.json({ error: "Unauthorized" }, 401);
    return;
  }

  const sql = (c as any).get("sql");
  if (!sql) {
    c.json({ error: "Internal server error" }, 500);
    return;
  }

  const user = await validateSession(sql, sessionToken);
  if (!user) {
    c.json({ error: "Unauthorized" }, 401);
    return;
  }

  c.user = user;
  await next();
}

export async function requireAdmin(c: ContextWithUser, next: Next): Promise<void> {
  const cookieHeader = c.req.header("Cookie") || "";
  const sessionToken = extractSessionToken(cookieHeader);

  if (!sessionToken) {
    c.json({ error: "Unauthorized" }, 401);
    return;
  }

  const sql = (c as any).get("sql");
  if (!sql) {
    c.json({ error: "Internal server error" }, 500);
    return;
  }

  const user = await validateSession(sql, sessionToken);
  if (!user) {
    c.json({ error: "Unauthorized" }, 401);
    return;
  }

  if (user.role !== "admin") {
    c.json({ error: "Forbidden" }, 403);
    return;
  }

  c.user = user;
  await next();
}

function extractSessionToken(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "session" && value) {
      return value;
    }
  }
  return null;
}

// Rate limiter for auth endpoints (stricter than the general limiter): durable,
// Neon-backed, shared across all Worker isolates. 10 requests / 15 min per IP.
//
// Keyed ONLY on cf-connecting-ip (Cloudflare-populated, unspoofable). We never
// trust x-forwarded-for. When cf-connecting-ip is absent we still rate-limit
// under a single fixed "noip" bucket (no unlimited fallback). The DB round-trip
// per request is the accepted tradeoff; rateLimitAllow fails OPEN on DB errors.
export async function authRateLimiter(c: Context, next: Next): Promise<Response | void> {
  const ip = c.req.header("cf-connecting-ip") || "noip";
  const sql = neon((c.env as { DB_CONN: string }).DB_CONN);

  const allowed = await rateLimitAllow(sql, `auth:${ip}`, 10, 15 * 60 * 1000, Date.now());
  if (!allowed) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  await next();
}
