import type { ParsedBooking } from "./types";

// Airbnb host-notification emails are in the host account's language (French
// here). Dates carry no year anywhere ("jeu. 30 juil.") — infer it from the
// email's sent date: the next occurrence of that day/month.
const FR_MONTHS: Record<string, number> = {
  janv: 1,
  févr: 2,
  fevr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8,
  aout: 8,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
  dec: 12,
};
const MONTH_ALT = Object.keys(FR_MONTHS).join("|");

// "jeu. 30 juil." / "1er août" — day number then month token.
const DATE_TOKEN = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTH_ALT})\\.?`, "iu");

function findDate(bodyText: string, label: string): { day: number; month: number } | null {
  // The label ("Arrivée"/"Départ") is followed (possibly across blank lines
  // and a weekday abbreviation) by the date token.
  const section = new RegExp(`${label}\\s*\\n+\\s*(?:[a-zéû]+\\.?\\s+)?${DATE_TOKEN.source}`, "iu");
  const m = bodyText.match(section);
  if (!m) return null;
  const month = FR_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return { day: parseInt(m[1], 10), month };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseAirbnb(bodyText: string, subject: string, sentAt: Date): ParsedBooking | null {
  const subj = subject.normalize("NFC");
  const body = bodyText.normalize("NFC");

  // Guest name from the subject: "Réservation confirmée : Jean Tremblay arrive le 30 juil."
  const nameMatch = subj.match(/réservation confirmée\s*:\s*(.+?)\s+arrive\b/i);
  if (!nameMatch) return null;
  const nameParts = nameMatch[1].trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  // Confirmation code: dedicated section, else any reservation-details URL.
  const code =
    body.match(/code de confirmation\s*\n+\s*([A-Z0-9]{8,12})\b/i)?.[1] ??
    body.match(/reservations\/details\/([A-Z0-9]{8,12})\b/i)?.[1] ??
    null;
  if (!code) return null;

  const arrive = findDate(body, "Arrivée");
  const depart = findDate(body, "Départ");
  if (!arrive || !depart) return null;

  // Year inference: candidate in the sent year; if that day/month is already
  // past at send time, it's next year. checkOut before checkIn rolls again.
  const sentY = sentAt.getUTCFullYear();
  const sentOrd = (sentAt.getUTCMonth() + 1) * 100 + sentAt.getUTCDate();
  let inY = sentY;
  if (arrive.month * 100 + arrive.day < sentOrd) inY++;
  let outY = inY;
  if (depart.month * 100 + depart.day < arrive.month * 100 + arrive.day) outY++;

  // Count must be on the same line as its unit ("2 adultes"); a bare \s+
  // also matches across the blank-line gap up to the "Voyageurs" section
  // header itself (e.g. the "00" in the preceding "10:00" departure time),
  // so restrict the gap to same-line whitespace only.
  const guests = parseInt(body.match(/(\d+)[ \t]+(?:adultes?|voyageurs?)\b/i)?.[1] ?? "1", 10) || 1;

  // Listing name: the line right before the "Chambre" room-type line.
  // Fixtures are CRLF-terminated, so a stray \r can sit between blank-line
  // \n's; exclude \r from the capture and allow \s* padding around the \n+
  // so the gap still matches with either line-ending style.
  const listing = body.match(/([^\r\n\[\]<>]{3,80})\s*\n+\s*Chambre\b/)?.[1]?.trim() ?? null;

  return {
    source: "airbnb",
    externalRef: code.toUpperCase(),
    firstName,
    lastName,
    guestEmail: null,
    phone: null,
    checkIn: toIso(inY, arrive.month, arrive.day),
    checkOut: toIso(outY, depart.month, depart.day),
    guests,
    listingName: listing,
  };
}
