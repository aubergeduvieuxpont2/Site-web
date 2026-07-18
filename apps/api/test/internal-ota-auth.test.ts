import { describe, it, expect, vi } from "vitest";

// The /internal/ota-bookings route reads DB_CONN via the Neon serverless
// driver. Stub it so the authenticated path never touches a real database:
// every tagged-template query resolves to an empty result set, which drives
// the handler down its "duplicate/logged" branch and returns a 2xx.
vi.mock("@neondatabase/serverless", () => ({
  neon: () => async () => [],
}));

import { app } from "../src/index";
import { timingSafeEqual, checkSharedSecret } from "../src/auth/internalAuth";

const SECRET = "internal-ota-secret";
const env = { DB_CONN: "postgres://stub", INTERNAL_OTA_SECRET: SECRET } as any;

function post(headers: Record<string, string>, body: unknown) {
  return app.request(
    "http://localhost/internal/ota-bookings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("timingSafeEqual / checkSharedSecret", () => {
  it("matches equal strings and rejects mismatches", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("fails closed on an unset or empty configured secret", () => {
    expect(checkSharedSecret("anything", undefined)).toBe(false);
    expect(checkSharedSecret("anything", "")).toBe(false);
    expect(checkSharedSecret(null, "secret")).toBe(false);
    expect(checkSharedSecret(undefined, "secret")).toBe(false);
    expect(checkSharedSecret("secret", "secret")).toBe(true);
  });
});

describe("POST /internal/ota-bookings auth (T-API-001a / T-API-001b)", () => {
  it("returns 401 when the X-Internal-Auth header is absent", async () => {
    const res = await post({}, { status: "ignored", provider: "airbnb" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the X-Internal-Auth header is wrong", async () => {
    const res = await post({ "X-Internal-Auth": "nope" }, { status: "ignored", provider: "airbnb" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not read the body before the auth check (invalid JSON still 401s)", async () => {
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("processes the body with a matching X-Internal-Auth header (2xx)", async () => {
    const res = await post({ "X-Internal-Auth": SECRET }, { status: "ignored", provider: "airbnb", subject: "x" });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});
