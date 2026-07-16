import { describe, it, expect } from "vitest";
import { toNumberOrNull, resolveEffectiveNightly } from "../src/pricing";

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
