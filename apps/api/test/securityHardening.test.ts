import { describe, it, expect, beforeEach, vi } from "vitest";

// Spy on verifyPassword while keeping the real implementation, so the M9
// "unknown email still runs verifyPassword" timing path can be asserted.
const { verifyPasswordSpy } = vi.hoisted(() => ({ verifyPasswordSpy: vi.fn() }));

vi.mock("../src/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/password")>();
  return {
    ...actual,
    verifyPassword: (password: string, stored: string) => {
      verifyPasswordSpy(password, stored);
      return actual.verifyPassword(password, stored);
    },
  };
});

// Swap the Neon stub per test via a holder (vi.mock is hoisted).
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (...args: any[]) => neonHolder.sql(...args),
}));

import { app } from "../src/index";
import { hashPassword } from "../src/auth/password";

const env = { DB_CONN: "postgres://stub" } as any;

beforeEach(() => {
  verifyPasswordSpy.mockClear();
  // The password-change handler now runs an HIBP breach check (global fetch).
  // Stub it so tests never hit the network; a non-200 makes the check fail open
  // (treated as "not breached"), which is the behaviour under test here.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 500 })),
  );
});

describe("M9 — login user-enumeration hardening", () => {
  it("runs verifyPassword even for an unknown email (timing path) and returns generic 401", async () => {
    neonHolder.sql = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO rate_limits")) return Promise.resolve([{ count: 1 }]);
      if (q.includes("FROM login_failures")) return Promise.resolve([{ total: 0 }]);
      // Unknown email: the users lookup returns no rows.
      if (q.includes("FROM users")) return Promise.resolve([]);
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4" },
        body: JSON.stringify({ email: "nobody@example.com", password: "whatever123" }),
      },
      env,
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Identifiants invalides" });
    // The dummy verify ran, so timing matches the found-user path.
    expect(verifyPasswordSpy).toHaveBeenCalled();
  });
});

describe("M3 — password change invalidates other sessions", () => {
  it("deletes existing sessions, mints a fresh one, and re-sets the cookie", async () => {
    const currentHash = await hashPassword("current-pw-123");
    const state = { invalidated: false, sessionCreated: false };

    neonHolder.sql = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join(" ");
      // validateSession (getAuthUser) — return the acting user.
      if (q.includes("FROM sessions") && q.includes("JOIN users")) {
        return Promise.resolve([
          { id: 42, email: "u@example.com", name: "U", role: "guest", hubspot_contact_id: null },
        ]);
      }
      if (q.includes("SELECT password_hash FROM users")) {
        return Promise.resolve([{ password_hash: currentHash }]);
      }
      if (q.includes("DELETE FROM sessions")) {
        state.invalidated = true; // invalidateUserSessions called
        return Promise.resolve([]);
      }
      if (q.includes("INSERT INTO sessions")) {
        state.sessionCreated = true; // fresh session minted
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/api/auth/password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "session=sometoken" },
        body: JSON.stringify({ currentPassword: "current-pw-123", newPassword: "new-password-456" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(state.invalidated).toBe(true);
    expect(state.sessionCreated).toBe(true);
    const setCookie = res.headers.get("Set-Cookie") || "";
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });
});
