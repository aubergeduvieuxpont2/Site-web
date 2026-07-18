import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseExpedia } from "../src/parsers/expedia";
import { htmlToText } from "../src/htmlToText";

const FIXTURES = join(__dirname, "fixtures");
const text = readFileSync(join(FIXTURES, "expedia-new-booking.txt"), "utf8");
const html = readFileSync(join(FIXTURES, "expedia-new-booking.html"), "utf8");
const SUBJECT = "Expedia - New Booking - Arriving on 5 Sep 2026";

describe("parseExpedia", () => {
  it("parses the new-booking fixture (text part)", () => {
    const b = parseExpedia(text, SUBJECT);
    expect(b).toEqual({
      source: "expedia",
      externalRef: "2511634261",
      firstName: "Marie",
      lastName: "Gagnon",
      guestEmail: "ntvrowuydj@m.expediapartnercentral.com",
      phone: "1 1111111111",
      checkIn: "2026-09-05",
      checkOut: "2026-09-06",
      guests: 2,
      listingName: "Economy Double Room, River View - Standard",
    });
  });

  it("parses the Gmail-forward plaintext (bold labels rendered as *asterisks*)", () => {
    // Gmail regenerates text/plain on forward and renders <b> as markdown-style
    // '*' markers, landing between labels and values: "*Reservation ID: *251...",
    // "*Guest:\n*Marie Gagnon". Real production failure 2026-07-17.
    const gmailText = readFileSync(join(FIXTURES, "expedia-new-booking-gmail.txt"), "utf8");
    const b = parseExpedia(gmailText, "Fwd: FW: " + SUBJECT);
    expect(b).toEqual({
      source: "expedia",
      externalRef: "2511634261",
      firstName: "Marie",
      lastName: "Gagnon",
      guestEmail: "ntvrowuydj@m.expediapartnercentral.com",
      phone: "1 1111111111",
      checkIn: "2026-09-05",
      checkOut: "2026-09-06",
      guests: 2,
      listingName: "Economy Double Room, River View - Standard",
    });
  });

  it("parses the HTML part via htmlToText to the same reservation", () => {
    const b = parseExpedia(htmlToText(html), SUBJECT);
    expect(b).not.toBeNull();
    expect(b!.externalRef).toBe("2511634261");
    expect(b!.checkIn).toBe("2026-09-05");
    expect(b!.checkOut).toBe("2026-09-06");
    expect(b!.guestEmail).toBe("ntvrowuydj@m.expediapartnercentral.com");
  });

  it("adds kids to the guest count", () => {
    const modified = text.replace(/2\s+0\s+1\r?\n/, "2       2       1\n");
    const b = parseExpedia(modified, SUBJECT);
    expect(b!.guests).toBe(4);
  });

  it("survives a missing phone / guest email", () => {
    const noEmail = text.replace(/Guest Email:.*\r?\n/, "");
    const b = parseExpedia(noEmail, SUBJECT);
    expect(b).not.toBeNull();
    expect(b!.guestEmail).toBeNull();
  });

  it("returns null without a Reservation ID", () => {
    expect(parseExpedia(text.replace(/Reservation ID:\s*\d+/i, ""), SUBJECT)).toBeNull();
  });

  it("returns null without the check-in/check-out row", () => {
    expect(parseExpedia("Reservation ID: 123456\nGuest: A B", SUBJECT)).toBeNull();
  });

  it("returns quickly on an adversarial phone run with no trailing marker (no ReDoS)", () => {
    // A long run of digits/spaces/parens on the pre-"Guest Email" line where the
    // marker never follows: the old unbounded `[\d ()+-]{6,}\s*\n\s*Guest Email`
    // would backtrack catastrophically. Build a valid reservation so the parser
    // reaches the phone scan, then append the malicious run.
    const evil =
      "Reservation ID: 2511634261\n" +
      "Guest: Marie Gagnon\n" +
      "Sep 5, 2026     Sep 6, 2026     2       0\n" +
      "\n1 " +
      "1 ()+-".repeat(20000) +
      "\n(no marker here)\n";
    const start = Date.now();
    const b = parseExpedia(evil, SUBJECT);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    // Reservation still parses; the unterminated run must NOT be mis-captured.
    expect(b).not.toBeNull();
    expect(b!.externalRef).toBe("2511634261");
    expect(b!.phone).toBeNull();
  });
});
