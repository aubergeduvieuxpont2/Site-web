import { describe, it, expect } from "vitest";
import { formatDateOnly, datesOutOfOrder, nightsBetween, estimateStay } from "$lib/utils";

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

describe("datesOutOfOrder", () => {
  it("returns false when both dates are empty (optional)", () => {
    expect(datesOutOfOrder("", "")).toBe(false);
  });

  it("returns false when only the check-in is present", () => {
    expect(datesOutOfOrder("2026-08-10", "")).toBe(false);
  });

  it("returns false when only the check-out is present", () => {
    expect(datesOutOfOrder("", "2026-08-10")).toBe(false);
  });

  it("returns false for null / undefined inputs", () => {
    expect(datesOutOfOrder(null, null)).toBe(false);
    expect(datesOutOfOrder(undefined, undefined)).toBe(false);
  });

  it("returns true for equal dates (departure not after arrival)", () => {
    expect(datesOutOfOrder("2026-08-10", "2026-08-10")).toBe(true);
  });

  it("returns true when check-out is before check-in", () => {
    expect(datesOutOfOrder("2026-08-10", "2026-08-09")).toBe(true);
  });

  it("returns false when check-out is after check-in", () => {
    expect(datesOutOfOrder("2026-08-10", "2026-08-11")).toBe(false);
  });
});

describe("nightsBetween", () => {
  it("counts a multi-night stay", () => {
    expect(nightsBetween("2026-08-01", "2026-08-05")).toBe(4);
  });

  it("counts a single night", () => {
    expect(nightsBetween("2026-08-01", "2026-08-02")).toBe(1);
  });

  it("counts across a month boundary", () => {
    expect(nightsBetween("2026-01-31", "2026-02-02")).toBe(2);
  });

  it("returns 0 for a same-day stay", () => {
    expect(nightsBetween("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("returns 0 for reversed dates (never negative)", () => {
    expect(nightsBetween("2026-08-05", "2026-08-01")).toBe(0);
  });

  it("returns 0 for an empty check-in", () => {
    expect(nightsBetween("", "2026-08-02")).toBe(0);
  });

  it("returns 0 for a null check-out", () => {
    expect(nightsBetween("2026-08-01", null)).toBe(0);
  });

  it("returns 0 when both inputs are undefined", () => {
    expect(nightsBetween(undefined, undefined)).toBe(0);
  });

  it("returns 0 for a malformed check-in", () => {
    expect(nightsBetween("not-a-date", "2026-08-02")).toBe(0);
  });

  it("returns 0 for a malformed check-out", () => {
    expect(nightsBetween("2026-08-01", "invalid")).toBe(0);
  });
});

const DEFAULT_RATES = { accommodationTax: 3.5, tps: 5, tvq: 9.975 };

describe("estimateStay", () => {
  it("returns correct breakdown for 1 night, 1 room, $100, default rates", () => {
    const e = estimateStay(1, 1, 100, DEFAULT_RATES);
    expect(e.base).toBe(100);
    expect(e.hebergementTax).toBe(3.5);
    expect(e.tps).toBe(5.18);
    expect(e.tvq).toBe(10.84);
    expect(e.total).toBe(119.52);
    expect(Math.round((e.base + e.hebergementTax + e.tps + e.tvq) * 100) / 100).toBe(e.total);
  });

  it("lines sum exactly to total for multi-night/multi-room (nights 2, rooms 3, rate 89)", () => {
    const e = estimateStay(2, 3, 89, DEFAULT_RATES);
    const summed = Math.round((e.base + e.hebergementTax + e.tps + e.tvq) * 100) / 100;
    expect(summed).toBe(e.total);
    expect(e.base).toBe(Math.round(2 * 3 * 89 * 100) / 100);
  });

  it("returns total === base when all tax rates are zero", () => {
    const e = estimateStay(2, 1, 89, { accommodationTax: 0, tps: 0, tvq: 0 });
    expect(e.hebergementTax).toBe(0);
    expect(e.tps).toBe(0);
    expect(e.tvq).toBe(0);
    expect(e.total).toBe(e.base);
  });

  it("returns all zeros for zero nights", () => {
    const e = estimateStay(0, 2, 89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for zero rooms", () => {
    const e = estimateStay(3, 0, 89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for negative nights", () => {
    const e = estimateStay(-1, 2, 89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for negative rooms", () => {
    const e = estimateStay(2, -1, 89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for negative nightlyRate", () => {
    const e = estimateStay(2, 1, -89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for NaN nights", () => {
    const e = estimateStay(NaN, 1, 89, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });

  it("returns all zeros for NaN nightlyRate", () => {
    const e = estimateStay(1, 1, NaN, DEFAULT_RATES);
    expect(e).toEqual({ base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 });
  });
});
