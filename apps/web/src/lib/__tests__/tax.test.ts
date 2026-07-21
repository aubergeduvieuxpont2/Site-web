import { describe, it, expect } from "vitest";
import { roundCents, computeTaxBreakdown } from "$lib/tax";

const DEFAULT_RATES = { accommodationTax: 3.5, tps: 5, tvq: 9.975 };

describe("roundCents", () => {
  it("rounds a whole-cent value unchanged", () => {
    expect(roundCents(1.50)).toBe(1.50);
    expect(roundCents(100)).toBe(100);
  });

  it("rounds down when fractional cents < 0.5", () => {
    expect(roundCents(1.004)).toBe(1.00);
    expect(roundCents(1.014)).toBe(1.01);
  });

  it("rounds up when fractional cents > 0.5", () => {
    expect(roundCents(1.006)).toBe(1.01);
    expect(roundCents(1.009)).toBe(1.01);
  });

  it("half-up: exact 0.005 rounds UP", () => {
    expect(roundCents(0.005)).toBe(0.01);
  });

  it("half-up: exact 1.005 rounds UP (FP-robust)", () => {
    // 1.005 * 100 = 100.49999... in IEEE 754 — bare Math.round fails here
    expect(roundCents(1.005)).toBe(1.01);
  });

  it("half-up: exact 2.005 rounds UP", () => {
    expect(roundCents(2.005)).toBe(2.01);
  });

  it("rounds 3.115 up to 3.12 (89 × 3.5% FP case)", () => {
    // 3.115 is not exactly representable in IEEE 754; relative epsilon corrects drift
    expect(roundCents(3.115)).toBe(3.12);
  });

  it("rounds 5.175 up to 5.18 (103.5 × 5% FP case)", () => {
    expect(roundCents(5.175)).toBe(5.18);
  });

  it("returns 0 for NaN", () => {
    expect(roundCents(NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(roundCents(Infinity)).toBe(0);
  });

  it("returns 0 for -Infinity", () => {
    expect(roundCents(-Infinity)).toBe(0);
  });
});

describe("computeTaxBreakdown", () => {
  it("base 89 → hébergement 3.12, total 106.38", () => {
    const result = computeTaxBreakdown({ base: 89, ...DEFAULT_RATES });
    expect(result.base).toBe(89);
    expect(result.accommodationTax).toBe(3.12);
    // tps = roundCents(92.12 * 0.05) = roundCents(4.606) = 4.61
    expect(result.tps).toBe(4.61);
    // tvq = roundCents(96.73 * 9.975 / 100) = roundCents(9.648...) = 9.65
    expect(result.tvq).toBe(9.65);
    expect(result.total).toBe(106.38);
  });

  it("base 100 → hébergement 3.50, total 119.52", () => {
    const result = computeTaxBreakdown({ base: 100, ...DEFAULT_RATES });
    expect(result.base).toBe(100);
    expect(result.accommodationTax).toBe(3.50);
    // tps = roundCents(103.5 * 0.05) = roundCents(5.175) = 5.18
    expect(result.tps).toBe(5.18);
    // tvq = roundCents(108.68 * 9.975 / 100) = roundCents(10.8408...) = 10.84
    expect(result.tvq).toBe(10.84);
    expect(result.total).toBe(119.52);
  });

  it("passthrough: output.base equals input.base", () => {
    const result = computeTaxBreakdown({ base: 200, ...DEFAULT_RATES });
    expect(result.base).toBe(200);
  });

  it("total equals sum of all rounded lines", () => {
    const r = computeTaxBreakdown({ base: 89, ...DEFAULT_RATES });
    const summed = roundCents(r.base + r.accommodationTax + r.tps + r.tvq);
    expect(r.total).toBe(summed);
  });

  it("compounding: tps base includes accommodationTax", () => {
    // If tps were on base alone: 100 * 0.05 = 5.00
    // Compounding: (100 + 3.50) * 0.05 = 5.175 → 5.18
    const r = computeTaxBreakdown({ base: 100, ...DEFAULT_RATES });
    expect(r.tps).toBeGreaterThan(5.00);
    expect(r.tps).toBe(5.18);
  });

  it("compounding: tvq base includes accommodationTax and tps", () => {
    // Non-compounding tvq on base 100 alone: 100 * 9.975/100 = 9.975 → 9.98
    // Compounding: 108.68 * 9.975/100 = 10.84
    const r = computeTaxBreakdown({ base: 100, ...DEFAULT_RATES });
    expect(r.tvq).toBeGreaterThan(9.98);
    expect(r.tvq).toBe(10.84);
  });

  it("zero rates yield base === total", () => {
    const r = computeTaxBreakdown({ base: 89, accommodationTax: 0, tps: 0, tvq: 0 });
    expect(r.accommodationTax).toBe(0);
    expect(r.tps).toBe(0);
    expect(r.tvq).toBe(0);
    expect(r.total).toBe(89);
  });
});
