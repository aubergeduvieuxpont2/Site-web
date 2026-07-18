import { roundCents, computeTaxBreakdown } from './tax';

/**
 * Formats a YYYY-MM-DD date string as a French-Canadian locale date.
 * Parses as a local calendar date (avoids UTC midnight → previous-day shift).
 * Returns "—" for null, undefined, or unparseable input.
 */
export function formatDateOnly(date: string | null | undefined): string {
  if (!date) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return "—";
  try {
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Intl.DateTimeFormat("fr-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(local);
  } catch {
    return "—";
  }
}

/**
 * Whole number of nights between two YYYY-MM-DD dates (checkOut − checkIn).
 * Parses each string as a local calendar date (avoids UTC midnight → previous-day
 * shift), matching {@link formatDateOnly}. Returns 0 for any nullish, empty, or
 * malformed input, for same-day stays, and for reversed ranges — never negative.
 */
export function nightsBetween(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): number {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = re.exec((checkIn ?? "").trim());
  const b = re.exec((checkOut ?? "").trim());
  if (!a || !b) return 0;
  const from = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const to = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * True when both dates are present and checkOut is NOT strictly after checkIn.
 * Optional dates stay valid: returns false if either input is empty/nullish.
 * Uses lexicographic comparison, which is chronologically correct for
 * zero-padded YYYY-MM-DD strings.
 */
export function datesOutOfOrder(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): boolean {
  const from = (checkIn ?? "").trim();
  const to = (checkOut ?? "").trim();
  if (!from || !to) return false;
  return to <= from;
}

export type StayTaxRates = {
  accommodationTax: number; // percent, e.g. 3.5
  tps: number;              // percent, e.g. 5
  tvq: number;              // percent, e.g. 9.975
};

export type StayEstimate = {
  base: number;           // per-room weekly-block subtotal × rooms, rounded to cents
  hebergementTax: number; // base × accommodationTax/100, rounded to cents
  tps: number;            // (base + hebergementTax) × tps/100, rounded to cents
  tvq: number;            // (base + hebergementTax + tps) × tvq/100, rounded to cents
  total: number;          // sum of all rounded lines
};

/**
 * Computes a compounding tax cascade for a stay estimate.
 *
 * The base applies the shared weekly-block rule (identical to
 * `apps/api/src/pricing.ts::computeBase`): stays of 7+ nights bill whole weeks at
 * `weeklyRate` plus the remainder at `nightlyRate`; shorter stays bill nightly.
 * `weeklyRate` defaults to `nightlyRate * 7` so a caller that omits it gets the
 * plain nightly behaviour unchanged.
 *
 * Each tax line is independently rounded to cents; the total is the sum of the
 * rounded lines. Non-finite, NaN, or negative inputs for
 * nights/rooms/nightlyRate/weeklyRate return all zeros.
 */
export function estimateStay(
  nights: number,
  rooms: number,
  nightlyRate: number,
  rates: StayTaxRates,
  weeklyRate: number = nightlyRate * 7
): StayEstimate {
  const zero: StayEstimate = { base: 0, hebergementTax: 0, tps: 0, tvq: 0, total: 0 };
  if (
    !isFinite(nights) || nights < 0 ||
    !isFinite(rooms) || rooms < 0 ||
    !isFinite(nightlyRate) || nightlyRate < 0 ||
    !isFinite(weeklyRate) || weeklyRate < 0
  ) {
    return zero;
  }

  const perRoom =
    nights >= 7
      ? Math.floor(nights / 7) * weeklyRate + (nights % 7) * nightlyRate
      : nights * nightlyRate;
  const base = roundCents(perRoom * rooms);

  const breakdown = computeTaxBreakdown({
    base,
    accommodationTax: rates.accommodationTax,
    tps: rates.tps,
    tvq: rates.tvq,
  });

  return {
    base: breakdown.base,
    hebergementTax: breakdown.accommodationTax,
    tps: breakdown.tps,
    tvq: breakdown.tvq,
    total: breakdown.total,
  };
}
