import { describe, it, expect } from "vitest";
import { buildReservationConfirmationData } from "../src/emailPayloads";
import { computeInvoice, nightsBetween } from "../src/pricing";
import { SETTINGS_DEFAULTS } from "../src/settings";
import { MANIFEST } from "../src/emails/manifest";

const ARRIVE = "2026-08-01";
const DEPART = "2026-08-03"; // 2 nights
const NIGHTS = nightsBetween(ARRIVE, DEPART);

const DEFAULT_RATES = {
  accommodationTax: SETTINGS_DEFAULTS.accommodation_tax,
  tps: SETTINGS_DEFAULTS.tps,
  tvq: SETTINGS_DEFAULTS.tvq,
};

function makeInvoice(nights: number, nightly: number, roomCount = 1) {
  return computeInvoice({
    nights,
    roomCount,
    effectiveNightly: nightly,
    weeklyRate: undefined,
    tps: SETTINGS_DEFAULTS.tps,
    tvq: SETTINGS_DEFAULTS.tvq,
    accommodationTax: SETTINGS_DEFAULTS.accommodation_tax,
    type: "full",
  });
}

function defaultInvoice() {
  return makeInvoice(NIGHTS, SETTINGS_DEFAULTS.nightly_price);
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

    const payload = buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES);

    expect(payload).not.toBeNull();
    const expectedInvoice = defaultInvoice();
    expect(payload!.subtotal).toBe(expectedInvoice.base);
    expect(payload!.tps).toBe(expectedInvoice.tps);
    expect(payload!.tvq).toBe(expectedInvoice.tvq);
    expect(payload!.accommodationTax).toBe(expectedInvoice.accommodationTax);
    expect(payload!.total).toBe(expectedInvoice.total);
    expect(payload!.nightlyPrice).toBe(expectedInvoice.effectiveNightly);
    expect(payload!.nights).toBe(expectedInvoice.nights);
  });

  it("threads rate values through to payload fields", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 42,
      name: "Jean Tremblay",
      arrive: ARRIVE,
      depart: DEPART,
      people: 2,
      room: "Chambre Rivière",
    };
    const rates = { accommodationTax: 3.5, tps: 5, tvq: 9.975 };

    const payload = buildReservationConfirmationData(reservation, invoice, rates);

    expect(payload).not.toBeNull();
    expect(payload!.accommodationTaxRate).toBe(3.5);
    expect(payload!.tpsRate).toBe(5);
    expect(payload!.tvqRate).toBe(9.975);
  });

  it("preserves rate values that differ from the defaults", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 99,
      name: "Test User",
      arrive: ARRIVE,
      depart: DEPART,
      people: 1,
      room: "Chambre Test",
    };
    const customRates = { accommodationTax: 4.0, tps: 6.0, tvq: 10.5 };

    const payload = buildReservationConfirmationData(reservation, invoice, customRates);

    expect(payload).not.toBeNull();
    expect(payload!.accommodationTaxRate).toBe(4.0);
    expect(payload!.tpsRate).toBe(6.0);
    expect(payload!.tvqRate).toBe(10.5);
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

    expect(buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES)).toBeNull();
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

    expect(buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES)).toBeNull();
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

    expect(buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES)).toBeNull();
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

    const payload = buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES);
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

    const payload = buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES);
    expect(payload).not.toBeNull();
    expect(payload!.roomLabel).toBe("Chambre Jardin");
  });

  // INV-input-rates-output-amounts: rate values in → rate labels out (not amounts)
  it("rate fields carry the percent values, not dollar amounts", () => {
    const invoice = makeInvoice(1, 89);
    const reservation = {
      id: 10,
      name: "Test",
      arrive: ARRIVE,
      depart: "2026-08-02",
      people: 1,
      room: null,
    };
    const payload = buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES);
    expect(payload).not.toBeNull();
    // rate fields are small percents, not dollar amounts
    expect(payload!.accommodationTaxRate).toBe(3.5);
    expect(payload!.tpsRate).toBe(5);
    expect(payload!.tvqRate).toBe(9.975);
    // dollar amounts are larger
    expect(payload!.subtotal).toBeGreaterThan(payload!.accommodationTaxRate);
    expect(payload!.total).toBeGreaterThan(payload!.tpsRate);
  });

  // INV-shape-preserved: all required manifest fields are present in the payload
  it("payload contains every field listed in the manifest requiredFields", () => {
    const invoice = defaultInvoice();
    const reservation = {
      id: 42,
      name: "Jean Tremblay",
      arrive: ARRIVE,
      depart: DEPART,
      people: 2,
      room: "Chambre Rivière",
    };
    const payload = buildReservationConfirmationData(reservation, invoice, DEFAULT_RATES);

    expect(payload).not.toBeNull();
    for (const field of MANIFEST["reservation-confirmation"].requiredFields) {
      expect(payload, `missing field: ${field}`).toHaveProperty(field);
    }
  });
});

// Cross-check tax table — pinned values that must agree with apps/web tax tests
describe("cross-check tax table (via computeInvoice + buildReservationConfirmationData)", () => {
  it("base 89 → hébergement 3.12 / total 106.38", () => {
    const invoice = makeInvoice(1, 89);
    expect(invoice.base).toBe(89);
    expect(invoice.accommodationTax).toBe(3.12);
    expect(invoice.total).toBe(106.38);

    const payload = buildReservationConfirmationData(
      { id: 1, name: "Test", arrive: ARRIVE, depart: "2026-08-02", people: 1, room: null },
      invoice,
      DEFAULT_RATES
    );
    expect(payload).not.toBeNull();
    expect(payload!.subtotal).toBe(89);
    expect(payload!.accommodationTax).toBe(3.12);
    expect(payload!.total).toBe(106.38);
  });

  it("base 100 → hébergement 3.50 / total 119.52", () => {
    const invoice = makeInvoice(1, 100);
    expect(invoice.base).toBe(100);
    expect(invoice.accommodationTax).toBe(3.5);
    expect(invoice.total).toBe(119.52);

    const payload = buildReservationConfirmationData(
      { id: 1, name: "Test", arrive: ARRIVE, depart: "2026-08-02", people: 1, room: null },
      invoice,
      DEFAULT_RATES
    );
    expect(payload).not.toBeNull();
    expect(payload!.subtotal).toBe(100);
    expect(payload!.accommodationTax).toBe(3.5);
    expect(payload!.total).toBe(119.52);
  });

  it("2 nights × 89 (base 178) → hébergement 6.23 / total 212.74", () => {
    // 2-night scenario used by the default tests above, pinned explicitly
    const invoice = makeInvoice(2, 89);
    expect(invoice.base).toBe(178);
    expect(invoice.accommodationTax).toBe(6.23);
    expect(invoice.total).toBe(212.74);
  });
});

// Manifest field assertions — INV-shape-preserved for email labels
describe("manifest requiredFields include live-rate label fields", () => {
  it("reservation-confirmation includes accommodationTaxRate", () => {
    expect(MANIFEST["reservation-confirmation"].requiredFields).toContain("accommodationTaxRate");
  });

  it("reservation-confirmation includes tpsRate", () => {
    expect(MANIFEST["reservation-confirmation"].requiredFields).toContain("tpsRate");
  });

  it("reservation-confirmation includes tvqRate", () => {
    expect(MANIFEST["reservation-confirmation"].requiredFields).toContain("tvqRate");
  });

  it("invoice-receipt includes accommodationTaxRate", () => {
    expect(MANIFEST["invoice-receipt"].requiredFields).toContain("accommodationTaxRate");
  });

  it("invoice-receipt includes tpsRate", () => {
    expect(MANIFEST["invoice-receipt"].requiredFields).toContain("tpsRate");
  });

  it("invoice-receipt includes tvqRate", () => {
    expect(MANIFEST["invoice-receipt"].requiredFields).toContain("tvqRate");
  });
});
