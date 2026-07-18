import { describe, it, expect } from "vitest";
import { buildReservationConfirmationData } from "../src/emailPayloads";
import { computeInvoice, nightsBetween } from "../src/pricing";
import { SETTINGS_DEFAULTS } from "../src/settings";

// Same default settings the API falls back to (see rowsToAdminSettings): a
// 2-night, single-room reservation priced at the default nightly rate, taxed
// with the default compounding cascade (accommodationTax -> tps -> tvq).
const ARRIVE = "2026-08-01";
const DEPART = "2026-08-03"; // 2 nights
const NIGHTS = nightsBetween(ARRIVE, DEPART);

function defaultInvoice() {
  return computeInvoice({
    nights: NIGHTS,
    roomCount: 1,
    effectiveNightly: SETTINGS_DEFAULTS.nightly_price,
    weeklyRate: undefined,
    tps: SETTINGS_DEFAULTS.tps,
    tvq: SETTINGS_DEFAULTS.tvq,
    accommodationTax: SETTINGS_DEFAULTS.accommodation_tax,
    type: "full",
  });
}

describe("buildReservationConfirmationData", () => {
  it("mirrors a direct computeInvoice call for a 2-night reservation with default settings", () => {
    expect(NIGHTS).toBe(2);

    const invoice = defaultInvoice();
    const reservation = {
      id: 42,
      name: "Jean Tremblay",
      arrive: ARRIVE,
      depart: DEPART,
      people: 2,
      room: "Chambre Rivière",
    };

    const payload = buildReservationConfirmationData(reservation, invoice);

    expect(payload).not.toBeNull();
    // Don't hardcode the cascade numbers: assert equality against a fresh,
    // independent computeInvoice call with the same params.
    const expectedInvoice = defaultInvoice();
    expect(payload!.subtotal).toBe(expectedInvoice.base);
    expect(payload!.tps).toBe(expectedInvoice.tps);
    expect(payload!.tvq).toBe(expectedInvoice.tvq);
    expect(payload!.accommodationTax).toBe(expectedInvoice.accommodationTax);
    expect(payload!.total).toBe(expectedInvoice.total);
    expect(payload!.nightlyPrice).toBe(expectedInvoice.effectiveNightly);
    expect(payload!.nights).toBe(expectedInvoice.nights);
  });

  it("returns null when arrive is missing", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 1,
      name: "Sans Date",
      arrive: null,
      depart: DEPART,
      people: 1,
      room: null,
    };

    expect(buildReservationConfirmationData(reservation, invoice)).toBeNull();
  });

  it("returns null when depart is missing", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 2,
      name: "Sans Date",
      arrive: ARRIVE,
      depart: null,
      people: 1,
      room: null,
    };

    expect(buildReservationConfirmationData(reservation, invoice)).toBeNull();
  });

  it("returns null when both dates are missing", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 3,
      name: "Sans Date",
      arrive: null,
      depart: null,
      people: 1,
      room: null,
    };

    expect(buildReservationConfirmationData(reservation, invoice)).toBeNull();
  });

  it("falls back roomLabel to 'À déterminer' when room is null", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 4,
      name: "Marie Dubois",
      arrive: ARRIVE,
      depart: DEPART,
      people: 1,
      room: null,
    };

    const payload = buildReservationConfirmationData(reservation, invoice);
    expect(payload).not.toBeNull();
    expect(payload!.roomLabel).toBe("À déterminer");
  });

  it("uses the reservation's room as roomLabel when present", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 5,
      name: "Marie Dubois",
      arrive: ARRIVE,
      depart: DEPART,
      people: 1,
      room: "Chambre Jardin",
    };

    const payload = buildReservationConfirmationData(reservation, invoice);
    expect(payload).not.toBeNull();
    expect(payload!.roomLabel).toBe("Chambre Jardin");
  });
});
