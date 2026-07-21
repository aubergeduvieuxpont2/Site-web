export interface TaxBreakdownInput {
  base: number;           // dollars, cents-rounded subtotal
  accommodationTax: number; // RATE percent, e.g. 3.5
  tps: number;            // RATE percent, e.g. 5
  tvq: number;            // RATE percent, e.g. 9.975
}

export interface TaxBreakdown {
  base: number;           // AMOUNT (passthrough)
  accommodationTax: number; // AMOUNT = roundCents(base * rate/100)
  tps: number;            // AMOUNT = roundCents((base+accommodationTax) * rate/100)
  tvq: number;            // AMOUNT = roundCents((base+accommodationTax+tps) * rate/100)
  total: number;          // AMOUNT = roundCents(base+accommodationTax+tps+tvq)
}

/**
 * Half-up rounding to the cent, FP-robust across magnitudes.
 * Uses a relative epsilon (scaled to the magnitude of x*100) to correct
 * IEEE 754 drift where x*100 lands just below the .5 boundary.
 * Returns 0 for non-finite inputs (NaN, ±Infinity).
 */
export function roundCents(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const cents = x * 100;
  return Math.floor(cents + 0.5 + Math.abs(cents) * Number.EPSILON) / 100;
}

/**
 * Compounding tax cascade: each line is computed on the running subtotal of
 * all prior lines. Input keys are rates in percent; output keys are amounts in
 * dollars (invariant: INV-input-rates-output-amounts).
 */
export function computeTaxBreakdown(input: TaxBreakdownInput): TaxBreakdown {
  const { base } = input;
  const accommodationTax = roundCents(base * input.accommodationTax / 100);
  const tps = roundCents((base + accommodationTax) * input.tps / 100);
  const tvq = roundCents((base + accommodationTax + tps) * input.tvq / 100);
  const total = roundCents(base + accommodationTax + tps + tvq);
  return { base, accommodationTax, tps, tvq, total };
}
