import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAirbnb } from "../src/parsers/airbnb";
import { htmlToText } from "../src/htmlToText";

const FIXTURES = join(__dirname, "fixtures");
const text = readFileSync(join(FIXTURES, "airbnb-confirmation.txt"), "utf8");
const html = readFileSync(join(FIXTURES, "airbnb-confirmation.html"), "utf8");
// Subject of the direct (unforwarded) Airbnb email:
const SUBJECT = "Réservation confirmée : Jean Tremblay arrive le 30 juil.";
// The fixture email was forwarded on 2026-07-17; year inference works from this.
const SENT_AT = new Date("2026-07-17T14:13:00Z");

describe("parseAirbnb", () => {
  it("parses the confirmation fixture (text part)", () => {
    const b = parseAirbnb(text, SUBJECT, SENT_AT);
    expect(b).toEqual({
      source: "airbnb",
      externalRef: "HM45MDTHZ4",
      firstName: "Jean",
      lastName: "Tremblay",
      guestEmail: null,
      phone: null,
      checkIn: "2026-07-30",
      checkOut: "2026-07-31",
      guests: 2,
      listingName: "Auberge du vieux pont",
    });
  });

  it("parses the same booking from the HTML part via htmlToText", () => {
    const b = parseAirbnb(htmlToText(html), SUBJECT, SENT_AT);
    expect(b).not.toBeNull();
    expect(b!.externalRef).toBe("HM45MDTHZ4");
    expect(b!.checkIn).toBe("2026-07-30");
    expect(b!.checkOut).toBe("2026-07-31");
    expect(b!.guests).toBe(2);
  });

  it("tolerates a FW: prefix on the subject", () => {
    const b = parseAirbnb(text, "FW: " + SUBJECT, SENT_AT);
    expect(b!.firstName).toBe("Jean");
    expect(b!.lastName).toBe("Tremblay");
  });

  it("handles a single-word guest name", () => {
    const b = parseAirbnb(text, "Réservation confirmée : Jean arrive le 30 juil.", SENT_AT);
    expect(b!.firstName).toBe("Jean");
    expect(b!.lastName).toBeNull();
  });

  it("rolls the year over when the stay crosses New Year", () => {
    const snippet = [
      "Arrivée",
      "",
      "lun. 28 déc.",
      "",
      "16:00",
      "Départ",
      "",
      "sam. 2 janv.",
      "",
      "10:00",
      "Voyageurs",
      "",
      "3 adultes",
      "",
      "Code de confirmation",
      "",
      "HMAAAA1111",
    ].join("\n");
    const b = parseAirbnb(snippet, "Réservation confirmée : Ada L arrive le 28 déc.", new Date("2026-12-20T00:00:00Z"));
    expect(b!.checkIn).toBe("2026-12-28");
    expect(b!.checkOut).toBe("2027-01-02");
  });

  it("infers next year when arrival month already passed", () => {
    const snippet = [
      "Arrivée",
      "",
      "mar. 3 févr.",
      "",
      "Départ",
      "",
      "jeu. 5 févr.",
      "",
      "Voyageurs",
      "",
      "1 adulte",
      "",
      "Code de confirmation",
      "",
      "HMBBBB2222",
    ].join("\n");
    const b = parseAirbnb(snippet, "Réservation confirmée : Ada L arrive le 3 févr.", new Date("2026-07-17T00:00:00Z"));
    expect(b!.checkIn).toBe("2027-02-03");
    expect(b!.checkOut).toBe("2027-02-05");
  });

  it("does not roll the year forward for an evening same-day booking (UTC crosses midnight)", () => {
    // Sent 2026-07-15 21:40 local (UTC-4) = 2026-07-16 01:40 UTC. Arrival is
    // literally the same day as the send, in property-local time; the 1-day
    // grace must keep the year at 2026 instead of treating "15 juil." as
    // already past and rolling to 2027.
    const snippet = [
      "Arrivée",
      "",
      "mer. 15 juil.",
      "",
      "16:00",
      "Départ",
      "",
      "jeu. 16 juil.",
      "",
      "10:00",
      "Voyageurs",
      "",
      "2 adultes",
      "",
      "Code de confirmation",
      "",
      "HMCCCC3333",
    ].join("\n");
    const b = parseAirbnb(
      snippet,
      "Réservation confirmée : Ada L arrive le 15 juil.",
      new Date("2026-07-15T21:40:00-04:00"),
    );
    expect(b!.checkIn).toBe("2026-07-15");
    expect(b!.checkOut).toBe("2026-07-16");
  });

  it("returns null when the confirmation code is missing", () => {
    expect(parseAirbnb("Arrivée\njeu. 30 juil.\nDépart\nven. 31 juil.", SUBJECT, SENT_AT)).toBeNull();
  });

  it("returns null when dates are missing", () => {
    expect(parseAirbnb("Code de confirmation\nHM45MDTHZ4", SUBJECT, SENT_AT)).toBeNull();
  });
});
