import type { Context, Next } from "hono";
import { validateSession } from "./session";
import type { User } from "./session";

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

// Rate limiter for auth endpoints (stricter than general limiter)
const authLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function authRateLimiter(c: Context, next: Next): Promise<void> {
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "anonymous";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const limit = 10; // 10 requests per 15 minutes

  let record = authLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    authLimitMap.set(ip, record);
  }

  if (record.count >= limit) {
    c.json({ error: "Rate limit exceeded" }, 429);
    return;
  }

  record.count++;
  await next();
}
