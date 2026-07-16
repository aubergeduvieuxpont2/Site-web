export interface InvoiceBreakdown {
  nights: number;
  roomCount: number;
  effectiveNightly: number;
  base: number;
  lodgingTax: number;
  accommodationTax: number;
  total: number;
  amount: number;
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

export function nightsBetween(arrive: string, depart: string): number {
  const arriveDate = parseDate(arrive);
  const departDate = parseDate(depart);
  if (!arriveDate || !departDate) return 0;
  const nights = Math.floor(
    (departDate.getTime() - arriveDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, nights);
}

function parseDate(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
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
}

export function computeInvoice(params: ComputeInvoiceParams): InvoiceBreakdown {
  const base = Math.round(params.effectiveNightly * params.nights * params.roomCount * 100) / 100;
  const lodgingTax = Math.round(base * (params.tps + params.tvq) / 100 * 100) / 100;
  const accommodationTaxAmount = Math.round(base * params.accommodationTax / 100 * 100) / 100;
  const total = Math.round((base + lodgingTax + accommodationTaxAmount) * 100) / 100;

  let amount = total;
  if (params.type === "deposit") {
    const depositPct = params.depositPercent ?? 30;
    amount = Math.round(total * depositPct / 100 * 100) / 100;
  }

  return {
    nights: params.nights,
    roomCount: params.roomCount,
    effectiveNightly: params.effectiveNightly,
    base,
    lodgingTax,
    accommodationTax: accommodationTaxAmount,
    total,
    amount,
  };
}
