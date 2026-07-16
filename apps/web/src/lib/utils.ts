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
