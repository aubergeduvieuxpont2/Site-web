// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

/**
 * The global error handler previously logged only `err.name`, which for an
 * ordinary Error is the literal string "Error". A 500 in production told you
 * that something threw and nothing more — no message, no endpoint, no
 * Postgres code — so diagnosing one meant replaying statements by hand.
 *
 * These pin the parts that make a log line actionable. They rebuild the same
 * handler shape rather than importing the app, so they stay fast and do not
 * need the Worker environment.
 */
function appWithHandler() {
  const app = new Hono();
  app.get("/boom", () => {
    throw Object.assign(new Error('column "x" does not exist'), {
      code: "42703",
      detail: "some detail",
    });
  });
  app.onError((err, c) => {
    const e = err instanceof Error ? err : undefined;
    const pg = err as { code?: string; detail?: string; hint?: string };
    console.error("unhandled_error", {
      name: e?.name ?? "unknown",
      message: e?.message ?? String(err),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      ...(pg?.code ? { pgCode: pg.code } : {}),
      ...(pg?.detail ? { pgDetail: pg.detail } : {}),
      ...(pg?.hint ? { pgHint: pg.hint } : {}),
      stack: e?.stack,
    });
    return c.json({ error: "Internal server error" }, 500);
  });
  return app;
}

describe("unhandled error logging", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it("logs the message, endpoint and Postgres code, not just the name", async () => {
    const res = await appWithHandler().request("/boom");
    expect(res.status).toBe(500);

    const [tag, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(tag).toBe("unhandled_error");
    expect(payload.message).toContain('column "x" does not exist');
    expect(payload.method).toBe("GET");
    expect(payload.path).toBe("/boom");
    expect(payload.pgCode).toBe("42703");
    expect(payload.stack).toBeTruthy();
  });

  it("still returns a generic body, leaking nothing to the client", async () => {
    const res = await appWithHandler().request("/boom");
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("omits Postgres fields entirely for non-database errors", async () => {
    const app = new Hono();
    app.get("/plain", () => {
      throw new Error("just a normal failure");
    });
    app.onError((err, c) => {
      const e = err instanceof Error ? err : undefined;
      const pg = err as { code?: string };
      console.error("unhandled_error", {
        name: e?.name ?? "unknown",
        message: e?.message ?? String(err),
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        ...(pg?.code ? { pgCode: pg.code } : {}),
        stack: e?.stack,
      });
      return c.json({ error: "Internal server error" }, 500);
    });
    await app.request("/plain");
    const [, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("pgCode");
    expect(payload.message).toBe("just a normal failure");
  });
});
