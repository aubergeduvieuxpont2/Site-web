import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub the Neon driver so /ops/enqueue and /health never touch a real DB:
// tagged-template queries resolve to a single fake row.
vi.mock("@neondatabase/serverless", () => ({
  neon: () => async () => [{ id: 1 }],
}));

import { app } from "../src/index";
import { timingSafeEqual, checkSharedSecret } from "../src/auth";

const SECRET = "gateway-secret";

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    HUBSPOT_TOKEN: "token",
    DB_CONN: "postgres://stub",
    GATEWAY_AUTH_SECRET: SECRET,
    ...overrides,
  } as any;
}

const validEnvelope = { kind: "contact.upsert", payload: { email: "a@b.co" } };

function opsRequest(path: string, headers: Record<string, string>, env: any) {
  return app.request(
    `http://localhost${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(validEnvelope),
    },
    env,
  );
}

describe("timingSafeEqual / checkSharedSecret", () => {
  it("compares correctly and fails closed on empty secret", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
    expect(timingSafeEqual("secret", "secrer")).toBe(false);
    expect(timingSafeEqual("a", "ab")).toBe(false);
    expect(checkSharedSecret("x", undefined)).toBe(false);
    expect(checkSharedSecret("x", "")).toBe(false);
    expect(checkSharedSecret(null, SECRET)).toBe(false);
    expect(checkSharedSecret(SECRET, SECRET)).toBe(true);
  });
});

describe("/ops/* shared-secret gate (T-GW-001a / T-GW-001b)", () => {
  it("401s /ops/enqueue with a missing header", async () => {
    const res = await opsRequest("/ops/enqueue", {}, baseEnv());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, status: 401, message: "Unauthorized" });
  });

  it("401s /ops/execute with a wrong header", async () => {
    const res = await opsRequest("/ops/execute", { "X-Internal-Auth": "wrong" }, baseEnv());
    expect(res.status).toBe(401);
  });

  it("fails closed when the configured secret is empty", async () => {
    const res = await opsRequest("/ops/enqueue", { "X-Internal-Auth": "" }, baseEnv({ GATEWAY_AUTH_SECRET: "" }));
    expect(res.status).toBe(401);
  });

  it("passes through /ops/enqueue (non-401) with the correct header", async () => {
    const res = await opsRequest("/ops/enqueue", { "X-Internal-Auth": SECRET }, baseEnv());
    expect(res.status).not.toBe(401);
  });
});

describe("/health does not leak token or DB error text (T-GW-002a)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 {status:ok} when token + DB checks pass", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ portalId: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await app.request("http://localhost/health", {}, baseEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 {status:degraded} with no error detail on token failure", async () => {
    (global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ message: "secret-token-leaked-here" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const res = await app.request("http://localhost/health", {}, baseEnv({ HUBSPOT_TOKEN: "super-secret-token" }));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "degraded" });
    expect(text).not.toContain("secret-token-leaked-here");
    expect(text).not.toContain("super-secret-token");
  });
});
