import { roundCents, computeTaxBreakdown } from './tax';

export interface InvoiceBreakdown {
  nights: number;
  roomCount: number;
  effectiveNightly: number;
  base: number;
  accommodationTax: number;  // taxe d'hébergement, base × accommodationTax% / 100
  tps: number;               // (base + accommodationTax) × tps% / 100
  tvq: number;               // (base + accommodationTax + tps) × tvq% / 100
  total: number;             // base + accommodationTax + tps + tvq
  amount: number;            // total, or round2(total × depositPercent/100) for deposits
}

// The neon driver returns Postgres NUMERIC columns (discount_percent,
// fixed_nightly_price) as JSON strings (e.g. "10.00"). Number.isFinite("10.00")
// is false, which silently defeats discount/fixed-price logic downstream. Apply
// this at every DB-read boundary so those columns leave the API as numbers.
export function toNumberOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function resolveEffectiveNightly(
  userPricing: { fixedNightlyPrice?: number | null; discountPercent?: number | null },
  publicPrice: number
): number {
  if (userPricing.fixedNightlyPrice != null) {
    return Math.round(userPricing.fixedNightlyPrice * 100) / 100;
  }
  if (userPricing.discountPercent != null) {
    const discounted = publicPrice * (1 - userPricing.discountPercent / 100);
    return Math.round(discounted * 100) / 100;
  }
  return Math.round(publicPrice * 100) / 100;
}

export function resolveEffectiveWeekly(
  userPricing: { fixedWeeklyPrice?: number | null; discountPercent?: number | null },
  publicPrice: number
): number {
  if (userPricing.fixedWeeklyPrice != null) {
    return Math.round(userPricing.fixedWeeklyPrice * 100) / 100;
  }
  if (userPricing.discountPercent != null) {
    const discounted = publicPrice * (1 - userPricing.discountPercent / 100);
    return Math.round(discounted * 100) / 100;
  }
  return Math.round(publicPrice * 100) / 100;
}

export function nightsBetween(arrive: string | Date, depart: string | Date): number {
  const arriveDate = parseDate(arrive);
  const departDate = parseDate(depart);
  if (!arriveDate || !departDate) return 0;
  const nights = Math.floor(
    (departDate.getTime() - arriveDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, nights);
}

// The neon driver returns Postgres DATE columns as JS Date objects; accept
// both forms so a raw (non-to_char) SELECT can never throw here.
function parseDate(date: string | Date): Date | null {
  if (date instanceof Date) {
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

export function computeBase(
  nights: number,
  roomCount: number,
  nightlyRate: number,
  weeklyRate: number
): number {
  if (!Number.isFinite(nightlyRate) || !Number.isFinite(weeklyRate)) {
    return 0;
  }
  if (nights < 0 || roomCount < 0) {
    return 0;
  }
  const perRoom = nights >= 7
    ? Math.floor(nights / 7) * weeklyRate + (nights % 7) * nightlyRate
    : nights * nightlyRate;
  return roundCents(perRoom * roomCount);
}

export interface ComputeInvoiceParams {
  effectiveNightly: number;
  nights: number;
  roomCount: number;
  tps: number;
  tvq: number;
  accommodationTax: number;
  type: "deposit" | "full";
  depositPercent?: number;
  weeklyRate?: number;
}

export function computeInvoice(params: ComputeInvoiceParams): InvoiceBreakdown {
  const base = params.weeklyRate !== undefined
    ? computeBase(params.nights, params.roomCount, params.effectiveNightly, params.weeklyRate)
    : roundCents(params.effectiveNightly * params.nights * params.roomCount);

  const breakdown = computeTaxBreakdown({
    base,
    accommodationTax: params.accommodationTax,
    tps: params.tps,
    tvq: params.tvq,
  });

  const amount = params.type === "deposit"
    ? roundCents(breakdown.total * (params.depositPercent ?? 30) / 100)
    : breakdown.total;

  return {
    nights: params.nights,
    roomCount: params.roomCount,
    effectiveNightly: params.effectiveNightly,
    base: breakdown.base,
    accommodationTax: breakdown.accommodationTax,
    tps: breakdown.tps,
    tvq: breakdown.tvq,
    total: breakdown.total,
    amount,
  };
}
