import { describe, it, expect, afterEach, vi } from "vitest";

// Per-test Neon stub, swapped via a hoisted holder (vi.mock is hoisted).
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";

const env = { DB_CONN: "postgres://stub" } as any;

const adminUser = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

// Build a Neon stub that authenticates as an admin and lets a caller supply
// extra query routing. Records every (q, vals) for assertions.
function makeAdminSql(extra?: (q: string, vals: unknown[]) => unknown[] | undefined) {
  const calls: { q: string; vals: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    calls.push({ q, vals });
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([adminUser]);
    }
    return Promise.resolve(extra?.(q, vals) ?? []);
  };
  return { sql, calls };
}

async function sha1Suffix(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return hex.slice(5);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("M8 — GET /api/messages is admin-gated", () => {
  it("401 without a session cookie", async () => {
    neonHolder.sql = makeAdminSql().sql;
    const res = await app.request("http://localhost/api/messages", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin session", async () => {
    neonHolder.sql = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("FROM sessions")) return Promise.resolve([{ ...adminUser, role: "guest" }]);
      return Promise.resolve([]);
    };
    const res = await app.request(
      "http://localhost/api/messages",
      { headers: { Cookie: "session=t" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("200 with message rows for an admin", async () => {
    neonHolder.sql = makeAdminSql((q) =>
      q.includes("FROM messages") ? [{ id: 1, body: "hello", created_at: "2026-01-01" }] : undefined,
    ).sql;
    const res = await app.request(
      "http://localhost/api/messages",
      { headers: { Cookie: "session=t" } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toHaveLength(1);
  });
});

describe("L4 — non-numeric :id params return 400 (not 500)", () => {
  it("returns 400 for a non-numeric admin user id", async () => {
    neonHolder.sql = makeAdminSql().sql;
    const res = await app.request(
      "http://localhost/api/admin/users/not-a-number",
      { headers: { Cookie: "session=t" } },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("L5 — reservation input bounds", () => {
  it("400 when the arrival date is in the past", async () => {
    // Empty settings => reservationsEnabled defaults to true, so the request
    // reaches the past-date guard in the handler.
    neonHolder.sql = () => Promise.resolve([]);
    const res = await app.request(
      "http://localhost/api/reservations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "9.9.9.9" },
        body: JSON.stringify({
          firstName: "A",
          lastName: "B",
          email: "a@b.com",
          checkIn: "2000-01-01",
          checkOut: "2000-01-05",
          guests: 2,
          roomCount: 2,
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("400 when roomCount exceeds the max", async () => {
    neonHolder.sql = () => Promise.resolve([]);
    const res = await app.request(
      "http://localhost/api/reservations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "9.9.9.9" },
        body: JSON.stringify({
          firstName: "A",
          lastName: "B",
          email: "a@b.com",
          checkIn: "2030-01-01",
          checkOut: "2030-01-05",
          guests: 2,
          roomCount: 21,
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe("L6 — admin reset-link minting is audited", () => {
  it("inserts an admin_audit row and returns the link", async () => {
    const { sql, calls } = makeAdminSql((q) =>
      q.includes("SELECT id FROM users") ? [{ id: 5 }] : undefined,
    );
    neonHolder.sql = sql;
    const res = await app.request(
      "http://localhost/api/admin/users/5/reset-link",
      { method: "POST", headers: { Cookie: "session=t" } },
      env,
    );
    expect(res.status).toBe(200);
    const audit = calls.find((c) => c.q.includes("INSERT INTO admin_audit"));
    expect(audit).toBeDefined();
    expect(audit!.q).toContain("reset_link_minted"); // action (SQL literal)
    expect(audit!.vals).toContain(adminUser.id); // admin_user_id (bound)
    expect(audit!.vals).toContain(5); // target_user_id (bound)
  });
});

describe("L2 — HIBP breached-password check on register", () => {
  it("rejects a known-breached password with a 400", async () => {
    const password = "correct-horse-battery-staple";
    const suffix = await sha1Suffix(password);
    // Return the exact suffix so the local comparison matches -> breached.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(`${suffix}:42\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`, { status: 200 })),
    );
    neonHolder.sql = () => Promise.resolve([]);
    const res = await app.request(
      "http://localhost/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "5.5.5.5" },
        body: JSON.stringify({ email: "breached@example.com", password }),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("fuite");
  });

  it("fails open and allows registration when the HIBP fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const state = { userInserted: false };
    neonHolder.sql = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO users")) {
        state.userInserted = true;
        return Promise.resolve([{ id: 42, email: "ok@example.com", name: null, role: "guest" }]);
      }
      return Promise.resolve([]);
    };
    const HUBSPOT = { fetch: vi.fn(async () => new Response("{}", { status: 202 })) };
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

    const res = await app.request(
      "http://localhost/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "6.6.6.6" },
        body: JSON.stringify({ email: "ok@example.com", password: "a-very-strong-passphrase-2026" }),
      },
      { ...env, HUBSPOT },
      ctx,
    );
    expect(res.status).toBe(201);
    expect(state.userInserted).toBe(true);
  });
});
