import { describe, it, expect, vi } from "vitest";
import { resolveLocale } from "../src/emailLocale";

// Build a mock NeonQueryFunction that resolves to the given rows for any
// tagged-template call (the tag receives template strings and interpolated
// values, but for testing purposes we only care about the return value).
function makeSql(rows: { locale: string }[]) {
  return vi.fn().mockResolvedValue(rows) as any;
}

function makeBrokenSql() {
  return vi.fn().mockRejectedValue(new Error("db connection failed")) as any;
}

describe("resolveLocale — OP-Mail.resolveLocale", () => {
  // Happy path: numeric user id lookup
  it("returns en when the user row found by id carries locale en", async () => {
    const sql = makeSql([{ locale: "en" }]);
    expect(await resolveLocale(sql, 42)).toBe("en");
  });

  it("returns fr when the user row found by id carries locale fr", async () => {
    const sql = makeSql([{ locale: "fr" }]);
    expect(await resolveLocale(sql, 1)).toBe("fr");
  });

  // Happy path: email string lookup
  it("returns en when the user row found by email carries locale en", async () => {
    const sql = makeSql([{ locale: "en" }]);
    expect(await resolveLocale(sql, "guest@example.com")).toBe("en");
  });

  it("returns fr when the user row found by email carries locale fr", async () => {
    const sql = makeSql([{ locale: "fr" }]);
    expect(await resolveLocale(sql, "guest@example.com")).toBe("fr");
  });

  // INV-locale-valid: unrecognised stored value must fall back to fr
  it("returns fr when the stored locale is an unrecognised value such as de", async () => {
    const sql = makeSql([{ locale: "de" }]);
    expect(await resolveLocale(sql, 7)).toBe("fr");
  });

  it("returns fr when the stored locale is an empty string", async () => {
    const sql = makeSql([{ locale: "" }]);
    expect(await resolveLocale(sql, 7)).toBe("fr");
  });

  // INV-store-noop-safe equivalent on the server: no user found → fr fallback
  it("returns fr when no user row is found for the given id", async () => {
    const sql = makeSql([]);
    expect(await resolveLocale(sql, 999)).toBe("fr");
  });

  it("returns fr when no user row is found for the given email", async () => {
    const sql = makeSql([]);
    expect(await resolveLocale(sql, "unknown@example.com")).toBe("fr");
  });

  // Safe fr fallback on any database error
  it("returns fr when the database throws on an id lookup", async () => {
    const sql = makeBrokenSql();
    expect(await resolveLocale(sql, 1)).toBe("fr");
  });

  it("returns fr when the database throws on an email lookup", async () => {
    const sql = makeBrokenSql();
    expect(await resolveLocale(sql, "user@example.com")).toBe("fr");
  });

  // Selector type routing: numeric id uses the id branch
  it("invokes the sql function once for a numeric id selector", async () => {
    const sql = makeSql([{ locale: "fr" }]);
    await resolveLocale(sql, 5);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("invokes the sql function once for an email string selector", async () => {
    const sql = makeSql([{ locale: "fr" }]);
    await resolveLocale(sql, "a@b.com");
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
