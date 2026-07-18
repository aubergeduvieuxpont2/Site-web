import { describe, it, expect, beforeEach, vi } from "vitest";

// Swap the Neon stub per test via a holder (vi.mock is hoisted). Queries are
// routed by their SQL text so these flows never touch a real database.
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";
import { hashPassword } from "../src/auth/password";

const env = { DB_CONN: "postgres://stub" } as any;

// Records every tagged-template query so a test can assert what SQL ran.
function recorder(route: (q: string, vals: unknown[]) => unknown[]) {
  const calls: { q: string; vals: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    calls.push({ q, vals });
    return Promise.resolve(route(q, vals));
  };
  return { sql, calls };
}

function makeCtx(tasks: Promise<unknown>[]) {
  return {
    waitUntil: (p: Promise<unknown>) => tasks.push(p),
    passThroughOnException: () => {},
  } as any;
}

beforeEach(() => {
  // HIBP breach check on register calls global fetch; a non-200 fails open.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
describe("POST /api/auth/register", () => {
  it("does NOT link reservations, enqueues an email-verification email, and inserts a register token", async () => {
    const { sql, calls } = recorder((q) => {
      if (q.includes("INSERT INTO users")) {
        return [{ id: 42, email: "new@example.com", name: "New User", role: "guest" }];
      }
      return [];
    });
    neonHolder.sql = sql;

    const HUBSPOT = { fetch: vi.fn(async () => new Response("{}", { status: 202 })) };
    const tasks: Promise<unknown>[] = [];

    const res = await app.request(
      "http://localhost/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "9.9.9.9" },
        body: JSON.stringify({
          email: "new@example.com",
          password: "a-very-strong-passphrase-2026",
          firstName: "New",
          lastName: "User",
        }),
      },
      { ...env, HUBSPOT },
      makeCtx(tasks),
    );
    await Promise.all(tasks);

    expect(res.status).toBe(201);

    // New account is created unverified.
    const insertUser = calls.find((c) => c.q.includes("INSERT INTO users"));
    expect(insertUser).toBeDefined();
    expect(insertUser!.q).toContain("email_verified");
    // email_verified is written as a SQL literal `false`, not a bound value.
    expect(insertUser!.q).toContain("false");

    // No auto-claim of guest reservations at registration.
    expect(calls.some((c) => c.q.includes("UPDATE reservations SET user_id"))).toBe(false);

    // A register-purpose verification token is inserted.
    const token = calls.find((c) => c.q.includes("INSERT INTO email_verification_tokens"));
    expect(token).toBeDefined();
    expect(token!.q).toContain("'register'");
    expect(token!.vals).toContain(42);

    // An email-verification email is enqueued (bypasses the toggle gate).
    const enqueue = calls.find(
      (c) => c.q.includes("INSERT INTO email_outbox") && c.vals.includes("email-verification"),
    );
    expect(enqueue).toBeDefined();
    expect(enqueue!.vals).toContain("new@example.com");
  });
});

// ---------------------------------------------------------------------------
// verify-email — register
// ---------------------------------------------------------------------------
describe("POST /api/auth/verify-email (register)", () => {
  it("marks the user verified, links reservations, and consumes the token", async () => {
    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM email_verification_tokens")) {
        return [{ user_id: 42, purpose: "register", new_email: null }];
      }
      if (q.includes("SELECT email FROM users")) {
        return [{ email: "owner@example.com" }];
      }
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/auth/verify-email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.1" },
        body: JSON.stringify({ token: "raw-token" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, purpose: "register" });

    expect(calls.some((c) => c.q.includes("UPDATE users SET email_verified = true"))).toBe(true);
    // Reservations linked to the account's own (now-proven) email.
    const link = calls.find((c) => c.q.includes("UPDATE reservations SET user_id"));
    expect(link).toBeDefined();
    expect(link!.vals).toContain("owner@example.com");
    // Token consumed single-use.
    expect(calls.some((c) => c.q.includes("SET used_at = now()"))).toBe(true);
  });

  it("returns 400 for an invalid / expired token", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("FROM email_verification_tokens")) return Promise.resolve([]);
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/api/auth/verify-email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.2" },
        body: JSON.stringify({ token: "bogus" }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 when the new email was taken before a change is confirmed", async () => {
    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM email_verification_tokens")) {
        return [{ user_id: 7, purpose: "change", new_email: "taken@example.com" }];
      }
      if (q.includes("lower(email)")) return [{ id: 99 }]; // someone else already owns it
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/auth/verify-email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.3" },
        body: JSON.stringify({ token: "raw-token" }),
      },
      env,
    );

    expect(res.status).toBe(409);
    // pending_email must be left intact — no promotion happened.
    expect(calls.some((c) => c.q.includes("UPDATE users") && c.q.includes("SET email ="))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Login — links only when verified
// ---------------------------------------------------------------------------
describe("POST /api/auth/login reservation linking", () => {
  async function login(emailVerified: boolean) {
    const passwordHash = await hashPassword("correct-horse-battery");
    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM login_failures")) return [{ total: 0 }];
      if (q.includes("FROM users")) {
        return [
          {
            id: 5,
            email: "guest@example.com",
            password_hash: passwordHash,
            name: "Guest",
            role: "guest",
            email_verified: emailVerified,
          },
        ];
      }
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "2.2.2.2" },
        body: JSON.stringify({ email: "guest@example.com", password: "correct-horse-battery" }),
      },
      env,
    );
    return { res, calls };
  }

  it("links reservations when email_verified is true", async () => {
    const { res, calls } = await login(true);
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.q.includes("UPDATE reservations SET user_id"))).toBe(true);
  });

  it("does NOT link reservations when email_verified is false", async () => {
    const { res, calls } = await login(false);
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.q.includes("UPDATE reservations SET user_id"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Email change — stages pending_email, does not update email
// ---------------------------------------------------------------------------
describe("POST /api/profile/email", () => {
  it("stages pending_email, enqueues verify-to-new + alert-to-old, and does NOT change the email", async () => {
    const passwordHash = await hashPassword("hunter2hunter2");
    const sessionUser = {
      id: 7,
      email: "old@example.com",
      name: "Old Name",
      role: "guest",
      hubspot_contact_id: null,
    };

    const { sql, calls } = recorder((q) => {
      if (q.includes("FROM sessions") && q.includes("JOIN users")) return [sessionUser];
      if (q.includes("password_hash")) return [{ password_hash: passwordHash, first_name: "Old" }];
      if (q.includes("lower(email)")) return []; // new email free
      return [];
    });
    neonHolder.sql = sql;

    const res = await app.request(
      "http://localhost/api/profile/email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=abc123",
          "cf-connecting-ip": "3.3.3.3",
        },
        body: JSON.stringify({ newEmail: "new@example.com", currentPassword: "hunter2hunter2" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });

    // pending_email staged; the live email column is NOT touched.
    expect(calls.some((c) => c.q.includes("SET pending_email"))).toBe(true);
    expect(calls.some((c) => c.q.includes("UPDATE users") && c.q.includes("SET email ="))).toBe(false);

    // A change-purpose token is inserted with the new email.
    const token = calls.find((c) => c.q.includes("INSERT INTO email_verification_tokens"));
    expect(token).toBeDefined();
    expect(token!.q).toContain("'change'");
    expect(token!.vals).toContain("new@example.com");

    // Verification email to the NEW address.
    const verify = calls.find(
      (c) => c.q.includes("INSERT INTO email_outbox") && c.vals.includes("email-verification"),
    );
    expect(verify).toBeDefined();
    expect(verify!.vals).toContain("new@example.com");

    // Alert email to the OLD address.
    const alert = calls.find(
      (c) => c.q.includes("INSERT INTO email_outbox") && c.vals.includes("email-change-alert"),
    );
    expect(alert).toBeDefined();
    expect(alert!.vals).toContain("old@example.com");
  });
});
