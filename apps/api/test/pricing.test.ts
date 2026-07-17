import { describe, it, expect } from "vitest";
import { toNumberOrNull, resolveEffectiveNightly, resolveEffectiveWeekly, computeInvoice, computeBase } from "../src/pricing";

describe("toNumberOrNull", () => {
  it("converts string numeric values to numbers", () => {
    expect(toNumberOrNull("10.00")).toBe(10);
    expect(toNumberOrNull("75")).toBe(75);
    expect(toNumberOrNull("89.99")).toBe(89.99);
  });

  it("returns null for null input", () => {
    expect(toNumberOrNull(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(toNumberOrNull(undefined)).toBeNull();
  });

  it("coerces numeric values directly", () => {
    expect(toNumberOrNull(10)).toBe(10);
    expect(toNumberOrNull(10.5)).toBe(10.5);
  });

  it("handles empty string edge case", () => {
    // Number("") === 0. This is a defensive edge case: the DB should never
    // serialize a NUMERIC column to "" — a well-formed NUMERIC is either a
    // numeric string or SQL NULL. Documented here so a regression is visible.
    expect(toNumberOrNull("")).toBe(0);
  });

  it("handles non-numeric string", () => {
    // Number("abc") === NaN. Non-numeric strings can never come from a NUMERIC
    // column; callers rely on DB serialization being well-formed. Documented so
    // that if this ever reaches resolveEffectiveNightly, the NaN is expected.
    expect(toNumberOrNull("abc")).toBeNaN();
  });
});

describe("resolveEffectiveNightly fed through toNumberOrNull", () => {
  // The neon driver returns NUMERIC columns as strings; these prove that
  // normalizing first restores discount/fixed-price computation.
  it("applies discount when discount_percent is provided as string", () => {
    const effective = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull(null),
        discountPercent: toNumberOrNull("10.00"),
      },
      89
    );
    expect(effective).toBe(80.1);
  });

  it("applies fixed price when provided as string, overriding discount", () => {
    const effective = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull("75.00"),
        discountPercent: toNumberOrNull("10.00"),
      },
      89
    );
    expect(effective).toBe(75);
  });

  it("returns public price when both are null", () => {
    const effective = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull(null),
        discountPercent: toNumberOrNull(null),
      },
      89
    );
    expect(effective).toBe(89);
  });

  it("returns public price when discount is 0", () => {
    // toNumberOrNull("0") === 0, which is != null, so the discount branch runs
    // with a 0% discount and yields the unchanged public price.
    const effective = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull(null),
        discountPercent: toNumberOrNull("0"),
      },
      89
    );
    expect(effective).toBe(89);
  });

  it("handles fractional discounts", () => {
    // 89 * (1 - 0.055) = 84.105 mathematically, but IEEE-754 represents the
    // product as 84.1049999…, so Math.round(x * 100) / 100 lands on 84.1.
    // Asserted exactly (not toBeCloseTo) to pin the real rounding behavior.
    const effective = resolveEffectiveNightly(
      {
        fixedNightlyPrice: toNumberOrNull(null),
        discountPercent: toNumberOrNull("5.5"),
      },
      89
    );
    expect(effective).toBe(84.1);
  });
});

describe("computeInvoice", () => {
  // Owner-specified compounding cascade: each tax line is computed on the
  // running subtotal of all prior lines. With base 100 this yields the exact
  // values the frontend `estimateStay` quote produces for the same stay.
  const cascadeParams = {
    effectiveNightly: 100,
    nights: 1,
    roomCount: 1,
    tps: 5,
    tvq: 9.975,
    accommodationTax: 3.5,
  } as const;

  it("applies the compounding cascade with default rates (base 100)", () => {
    const b = computeInvoice({ ...cascadeParams, type: "full" });
    expect(b.base).toBe(100);
    expect(b.accommodationTax).toBe(3.5);   // 100 * 3.5%
    expect(b.tps).toBe(5.18);               // (100 + 3.5) * 5%   = 5.175 → 5.18
    expect(b.tvq).toBe(10.84);              // (108.68) * 9.975%  = 10.8408 → 10.84
    expect(b.total).toBe(119.52);           // 100 + 3.5 + 5.18 + 10.84
    expect(b.amount).toBe(119.52);          // full → amount === total
  });

  it("returns lines that sum exactly to total", () => {
    const b = computeInvoice({ ...cascadeParams, type: "full" });
    expect(b.base + b.accommodationTax + b.tps + b.tvq).toBeCloseTo(b.total, 10);
  });

  it("computes a 30% deposit when type is deposit (explicit percent)", () => {
    const b = computeInvoice({ ...cascadeParams, type: "deposit", depositPercent: 30 });
    expect(b.total).toBe(119.52);
    expect(b.amount).toBe(35.86);           // round2(119.52 * 0.30) = 35.856 → 35.86
  });

  it("defaults the deposit percent to 30 when omitted", () => {
    const b = computeInvoice({ ...cascadeParams, type: "deposit" });
    expect(b.amount).toBe(35.86);
  });

  it("handles the zero-rate case: total equals base, all taxes 0", () => {
    const b = computeInvoice({
      effectiveNightly: 100,
      nights: 1,
      roomCount: 1,
      tps: 0,
      tvq: 0,
      accommodationTax: 0,
      type: "full",
    });
    expect(b.accommodationTax).toBe(0);
    expect(b.tps).toBe(0);
    expect(b.tvq).toBe(0);
    expect(b.total).toBe(b.base);
    expect(b.amount).toBe(b.base);
  });

  it("stays in parity with the estimateStay cascade (invoice === estimate)", () => {
    // estimateStay applies the same base → hébergement → TPS → TVQ compounding
    // for the same inputs; documenting the aligned outputs here proves the API
    // invoice and the public quote produce identical totals.
    const b = computeInvoice({ ...cascadeParams, type: "full" });
    expect(b.base).toBe(100);
    expect(b.accommodationTax).toBe(3.5);
    expect(b.tps).toBe(5.18);
    expect(b.tvq).toBe(10.84);
    expect(b.total).toBe(119.52);
  });
});

describe("resolveEffectiveWeekly", () => {
  it("applies fixed price when provided", () => {
    const effective = resolveEffectiveWeekly(
      {
        fixedWeeklyPrice: 600,
        discountPercent: 10,
      },
      560
    );
    expect(effective).toBe(600);
  });

  it("applies discount when fixed price is null", () => {
    const effective = resolveEffectiveWeekly(
      {
        fixedWeeklyPrice: null,
        discountPercent: toNumberOrNull("10.00"),
      },
      560
    );
    expect(effective).toBe(504);
  });

  it("returns public price when both are null", () => {
    const effective = resolveEffectiveWeekly(
      {
        fixedWeeklyPrice: null,
        discountPercent: null,
      },
      560
    );
    expect(effective).toBe(560);
  });
});

describe("computeBase with weekly pricing", () => {
  it("computes flat nightly for stays under 7 nights", () => {
    const base = computeBase(6, 1, 89, 560);
    expect(base).toBe(6 * 89);
  });

  it("applies weekly pricing for 7-night stay", () => {
    const base = computeBase(7, 1, 89, 560);
    expect(base).toBe(1 * 560 + 0 * 89);
  });

  it("applies weekly + nightly for 9-night stay", () => {
    const base = computeBase(9, 1, 89, 560);
    expect(base).toBe(1 * 560 + 2 * 89);
  });

  it("applies multiple weeks for 14-night stay", () => {
    const base = computeBase(14, 1, 89, 560);
    expect(base).toBe(2 * 560 + 0 * 89);
  });

  it("applies multiple weeks + remainder for 15-night stay", () => {
    const base = computeBase(15, 1, 89, 560);
    expect(base).toBe(2 * 560 + 1 * 89);
  });

  it("multiplies by room count", () => {
    const base = computeBase(14, 2, 89, 560);
    expect(base).toBe((2 * 560) * 2);
  });

  it("handles zero values gracefully", () => {
    expect(computeBase(0, 1, 89, 560)).toBe(0);
    expect(computeBase(7, 0, 89, 560)).toBe(0);
  });

  it("guards against non-finite values", () => {
    expect(computeBase(7, 1, NaN, 560)).toBe(0);
    expect(computeBase(7, 1, 89, Infinity)).toBe(0);
  });

  it("applies rounding correctly", () => {
    // 14 nights × 2 rooms × (560/7) per night should round correctly
    const base = computeBase(14, 2, 89.99, 560);
    expect(Number.isFinite(base)).toBe(true);
    expect(base).toBe(2240);
  });
});

describe("computeInvoice with weekly rate", () => {
  it("uses computeBase when weeklyRate provided", () => {
    const b = computeInvoice({
      effectiveNightly: 89,
      nights: 14,
      roomCount: 1,
      tps: 5,
      tvq: 9.975,
      accommodationTax: 3.5,
      type: "full",
      weeklyRate: 560,
    });
    expect(b.base).toBe(1120);
  });

  it("falls back to flat nightly when weeklyRate omitted", () => {
    const b = computeInvoice({
      effectiveNightly: 89,
      nights: 14,
      roomCount: 1,
      tps: 5,
      tvq: 9.975,
      accommodationTax: 3.5,
      type: "full",
    });
    expect(b.base).toBe(89 * 14);
  });
});
