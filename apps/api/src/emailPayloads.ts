import type { InvoiceBreakdown } from "./pricing";

export interface ReservationConfirmationPayload {
  confirmationCode: string;
  name: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  roomLabel: string;
  nightlyPrice: number;
  nights: number;
  subtotal: number;
  accommodationTax: number;
  tps: number;
  tvq: number;
  total: number;
  manageUrl: string;
  accommodationTaxRate: number;
  tpsRate: number;
  tvqRate: number;
}

export function buildReservationConfirmationData(
  reservation: {
    id?: number;
    name: string;
    arrive: string | null;
    depart: string | null;
    people: number;
    room: string | null;
  },
  invoice: InvoiceBreakdown,
  rates: { accommodationTax: number; tps: number; tvq: number }
): ReservationConfirmationPayload | null {
  if (!reservation.arrive || !reservation.depart) {
    return null;
  }

  const confirmationCode = `RES-${new Date().getFullYear()}-${String(reservation.id || 0).padStart(4, "0")}`;
  const roomLabel = reservation.room || "À déterminer";

  return {
    confirmationCode,
    name: reservation.name,
    checkIn: reservation.arrive,
    checkOut: reservation.depart,
    guests: reservation.people,
    roomLabel,
    nightlyPrice: invoice.effectiveNightly,
    nights: invoice.nights,
    subtotal: invoice.base,
    accommodationTax: invoice.accommodationTax,
    tps: invoice.tps,
    tvq: invoice.tvq,
    total: invoice.total,
    manageUrl: `https://www.aubergeduvieuxpont.ca/profil?reservation=${reservation.id}`,
    accommodationTaxRate: rates.accommodationTax,
    tpsRate: rates.tps,
    tvqRate: rates.tvq,
  };
}
