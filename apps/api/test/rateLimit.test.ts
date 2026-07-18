import { describe, it, expect } from "vitest";
import {
  checkAndIncrement,
  rateLimitAllow,
  recordLoginFailure,
  isAccountLocked,
  clearLoginFailures,
} from "../src/auth/rateLimit";

// A tagged-template stub backed by two in-memory Maps. It honours the ON CONFLICT
// increment semantics so a SECOND caller (a "different isolate") sharing the same
// store sees the accumulated count — exactly what the real Neon table provides.
function makeStubSql() {
  const rateLimits = new Map<string, number>(); // `${bucket}|${window}` -> count
  const loginFailures = new Map<string, number>(); // `${email}|${window}` -> count

  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join(" ");

    if (q.includes("INSERT INTO rate_limits")) {
      const [bucketKey, windowStart] = values as [string, number];
      const key = `${bucketKey}|${windowStart}`;
      const next = (rateLimits.get(key) ?? 0) + 1;
      rateLimits.set(key, next);
      return Promise.resolve([{ count: next }]);
    }

    if (q.includes("INSERT INTO login_failures")) {
      const [email, windowStart] = values as [string, number];
      const key = `${email}|${windowStart}`;
      const next = (loginFailures.get(key) ?? 0) + 1;
      loginFailures.set(key, next);
      return Promise.resolve([{ count: next }]);
    }

    if (q.includes("FROM login_failures") && q.includes("SUM")) {
      const [email, cutoff] = values as [string, number];
      let total = 0;
      for (const [key, count] of loginFailures) {
        const [e, ws] = key.split("|");
        if (e === email && Number(ws) > cutoff) total += count;
      }
      return Promise.resolve([{ total }]);
    }

    if (q.includes("DELETE FROM login_failures")) {
      const [email] = values as [string];
      for (const key of [...loginFailures.keys()]) {
        if (key.split("|")[0] === email) loginFailures.delete(key);
      }
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  }) as any;

  return { sql, rateLimits, loginFailures };
}

const WINDOW = 15 * 60 * 1000;

describe("durable rate limiter (M1)", () => {
  it("allows up to the limit then reports exceeded", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;

    // 30 requests are allowed (counts 1..30, none exceeded).
    for (let i = 0; i < 30; i++) {
      const r = await checkAndIncrement(sql, "general:1.2.3.4", 30, WINDOW, now);
      expect(r.exceeded).toBe(false);
    }
    // 31st request crosses the limit.
    const over = await checkAndIncrement(sql, "general:1.2.3.4", 30, WINDOW, now);
    expect(over.exceeded).toBe(true);
    expect(over.count).toBe(31);
  });

  it("shares the counter across isolates (same store, fresh call sites)", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;

    // "Isolate A" burns the whole budget.
    for (let i = 0; i < 30; i++) {
      await rateLimitAllow(sql, "general:9.9.9.9", 30, WINDOW, now);
    }
    // "Isolate B" is a completely separate call site but the durable store is
    // shared — so it immediately sees the limit as exhausted.
    const allowedOnB = await rateLimitAllow(sql, "general:9.9.9.9", 30, WINDOW, now);
    expect(allowedOnB).toBe(false);
  });

  it("keys on the IP-derived bucket: different IPs are independent", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;

    // Exhaust IP A.
    for (let i = 0; i < 30; i++) {
      await rateLimitAllow(sql, "general:1.1.1.1", 30, WINDOW, now);
    }
    expect(await rateLimitAllow(sql, "general:1.1.1.1", 30, WINDOW, now)).toBe(false);
    // A different cf-connecting-ip bucket is unaffected.
    expect(await rateLimitAllow(sql, "general:2.2.2.2", 30, WINDOW, now)).toBe(true);
  });

  it("counts a missing IP under the shared 'noip' bucket (never unlimited)", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 10; i++) {
      await rateLimitAllow(sql, "auth:noip", 10, WINDOW, now);
    }
    expect(await rateLimitAllow(sql, "auth:noip", 10, WINDOW, now)).toBe(false);
  });

  it("fails OPEN when the DB call throws (allows the request)", async () => {
    const throwingSql = (() => {
      throw new Error("db down");
    }) as any;
    const allowed = await rateLimitAllow(throwingSql, "general:1.2.3.4", 30, WINDOW, Date.now());
    expect(allowed).toBe(true);
  });

  it("locks an account after the failure threshold and resets on clear", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;
    const email = "victim@example.com";

    expect(await isAccountLocked(sql, email, now, 10, WINDOW)).toBe(false);

    for (let i = 0; i < 10; i++) {
      await recordLoginFailure(sql, email, now);
    }
    expect(await isAccountLocked(sql, email, now, 10, WINDOW)).toBe(true);

    // A successful login clears the history and unlocks the account.
    await clearLoginFailures(sql, email);
    expect(await isAccountLocked(sql, email, now, 10, WINDOW)).toBe(false);
  });

  it("normalizes the account email case for lockout", async () => {
    const { sql } = makeStubSql();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 10; i++) {
      await recordLoginFailure(sql, "Mixed@Case.com", now);
    }
    // Query with different casing still sees the same bucket.
    expect(await isAccountLocked(sql, "mixed@case.COM", now, 10, WINDOW)).toBe(true);
  });
});
