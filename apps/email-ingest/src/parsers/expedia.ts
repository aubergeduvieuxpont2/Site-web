import type { ParsedBooking } from "./types";

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "Sep 5, 2026"
const EN_DATE = /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;

function isoFrom(mon: string, day: string, year: string): string | null {
  const month = EN_MONTHS[mon.toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseExpedia(bodyText: string, _subject: string): ParsedBooking | null {
  // Strip markdown-style bold markers: Gmail regenerates text/plain on
  // forward and renders <b> as '*', which lands between labels and values
  // ("*Reservation ID: *2511634261", "*Guest:\n*Marie Gagnon").
  const body = bodyText.normalize("NFC").replace(/\*/g, "");

  const id = body.match(/Reservation ID:?\s*(\d{6,})/i)?.[1] ?? null;
  if (!id) return null;

  // "Guest: Marie Gagnon  Booked on: ..." — name runs until a double space,
  // a "Booked on" label, or end of line.
  const guest = body.match(/Guest:\s*([^\n]+?)(?:\s{2,}|\s+Booked on\b|\n|$)/i)?.[1]?.trim() ?? null;
  if (!guest) return null;
  const nameParts = guest.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  // The row under the Check-In/Check-Out/Adults/Kids header:
  // "Sep 5, 2026     Sep 6, 2026     2       0       1"
  const row = body.match(
    new RegExp(`${EN_DATE.source}\\s+${EN_DATE.source}\\s+(\\d+)\\s+(\\d+)`),
  );
  if (!row) return null;
  const checkIn = isoFrom(row[1], row[2], row[3]);
  const checkOut = isoFrom(row[4], row[5], row[6]);
  if (!checkIn || !checkOut) return null;
  const guests = (parseInt(row[7], 10) || 0) + (parseInt(row[8], 10) || 0) || 1;

  const guestEmail = body.match(/Guest Email:\s*([^\s<>]+@[^\s<>]+)/i)?.[1] ?? null;
  // Guest phone appears as a bare digit line between the Guest and
  // Guest Email lines; best-effort.
  const phone = body.match(/\n\s*(\d[\d ()+-]{6,})\s*\n\s*Guest Email/i)?.[1]?.trim() ?? null;
  const listingName = body.match(/Room Type Name:\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  return {
    source: "expedia",
    externalRef: id,
    firstName,
    lastName,
    guestEmail,
    phone,
    checkIn,
    checkOut,
    guests,
    listingName,
  };
}
