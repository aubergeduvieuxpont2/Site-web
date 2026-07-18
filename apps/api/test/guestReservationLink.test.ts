import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { linkGuestReservations } from "../src/index";

// Records the tagged-template SQL a call emits (same shape as provisioning.test.ts).
function makeSql() {
  const calls: { q: string; vals: unknown[] }[] = [];
  const sql = async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    calls.push({ q: strings.join("$"), vals });
    return [] as unknown[];
  };
  return { sql: sql as any, calls };
}

describe("linkGuestReservations", () => {
  it("claims only UNCLAIMED reservations matching the email, keyed to the user", async () => {
    const { sql, calls } = makeSql();
    await linkGuestReservations(sql, 42, "Guest@Example.com");

    expect(calls).toHaveLength(1);
    const { q, vals } = calls[0];
    expect(q).toContain("UPDATE reservations SET user_id");
    // Must never reassign a reservation already owned by another account.
    expect(q).toContain("user_id IS NULL");
    // Case-insensitive email match.
    expect(q).toContain("lower(email) = lower(");
    expect(vals).toContain(42);
    expect(vals).toContain("Guest@Example.com");
  });
});

// Regression guard for the IDOR: GET /api/profile must key reservations off the
// durable user_id link only. The old `OR lower(email) = lower(${user.email})`
// branch let an authenticated user change their email to one a guest booked
// under and read that guest's reservations.
describe("GET /api/profile reservation query", () => {
  it("selects reservations strictly by user_id, with no email fallback", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "src", "index.ts"), "utf8");

    const start = src.indexOf('app.get("/api/profile"');
    expect(start).toBeGreaterThan(-1);
    const handler = src.slice(start, start + 900);

    expect(handler).toContain("FROM reservations");
    expect(handler).toContain("WHERE user_id = ${user.id}");
    // No email-based reservation match anywhere in the profile handler.
    expect(handler).not.toContain("lower(email)");
  });
});
