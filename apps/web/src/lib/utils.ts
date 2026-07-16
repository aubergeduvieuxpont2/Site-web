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
