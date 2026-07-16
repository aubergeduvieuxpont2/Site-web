import { describe, it, expect } from "vitest";
import { formatDateOnly } from "$lib/utils";

describe("formatDateOnly", () => {
  it("formats a YYYY-MM-DD string in fr-CA locale", () => {
    const result = formatDateOnly("2026-08-01");
    expect(result).toContain("août");
    expect(result).toContain("2026");
    expect(result).toContain("1");
  });

  it("does not shift the day for August 1 (no UTC midnight issue)", () => {
    // In UTC-5 (ET), new Date("2026-08-01") is July 31 at 19:00 — would shift.
    // formatDateOnly parses local calendar date instead.
    const result = formatDateOnly("2026-08-01");
    expect(result).toContain("1");
    expect(result).not.toContain("31");
  });

  it("returns — for null", () => {
    expect(formatDateOnly(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatDateOnly(undefined)).toBe("—");
  });

  it("returns — for empty string", () => {
    expect(formatDateOnly("")).toBe("—");
  });

  it("returns — for an unparseable string", () => {
    expect(formatDateOnly("not-a-date")).toBe("—");
  });

  it("formats December correctly (end-of-year boundary)", () => {
    const result = formatDateOnly("2026-12-31");
    expect(result).toContain("décembre");
    expect(result).toContain("31");
    expect(result).toContain("2026");
  });
});
