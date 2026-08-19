// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

/**
 * The register handler's catch discarded the error: anything that was not a
 * duplicate returned a bare 500 with nothing logged. Because it never
 * propagated, app.onError could not see it either — so a registration failure
 * was invisible in production even after the global handler was improved.
 *
 * These pin the shape of that catch. They rebuild it rather than importing the
 * app so they stay fast and need no Worker environment.
 */
function handlerWith(thrown: unknown) {
  const app = new Hono();
  app.post("/register", async (c) => {
    try {
      throw thrown;
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const e = err instanceof Error ? err : undefined;
      const pg = err as { code?: string; detail?: string; hint?: string };
      console.error("register_failed", {
        name: e?.name ?? "unknown",
        message: message || String(err),
        ...(pg?.code ? { pgCode: pg.code } : {}),
        ...(pg?.detail ? { pgDetail: pg.detail } : {}),
        ...(pg?.hint ? { pgHint: pg.hint } : {}),
        stack: e?.stack,
      });
      if (message.includes("duplicate") || message.includes("UNIQUE")) {
        return c.json({ error: "Inscription impossible." }, 409);
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  });
  return app;
}

describe("register failure logging", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it("logs the underlying error instead of discarding it", async () => {
    const err = Object.assign(new Error('relation "users" does not exist'), {
      code: "42P01",
    });
    const res = await handlerWith(err).request("/register", { method: "POST" });

    expect(res.status).toBe(500);
    const [tag, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(tag).toBe("register_failed");
    expect(payload.message).toContain('relation "users" does not exist');
    expect(payload.pgCode).toBe("42P01");
    expect(payload.stack).toBeTruthy();
  });

  it("still returns the generic body, leaking nothing to the client", async () => {
    const res = await handlerWith(new Error("anything")).request("/register", { method: "POST" });
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });

  it("logs duplicates too, while keeping the non-enumerating 409", async () => {
    const res = await handlerWith(new Error("duplicate key value")).request("/register", {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Inscription impossible." });
    expect(spy).toHaveBeenCalled();
  });
});
