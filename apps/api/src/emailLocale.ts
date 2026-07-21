import type { NeonQueryFunction } from "@neondatabase/serverless";

type Locale = "fr" | "en";

function validateLocale(value: unknown): Locale {
  return value === "en" ? "en" : "fr";
}

/**
 * Resolves the preferred email locale for a recipient.
 * Pass a numeric user id to look up by primary key, or an email string to
 * look up by address. Returns "fr" when the user is not found, the stored
 * locale is absent, or any DB error occurs (safe fr fallback invariant).
 */
export async function resolveLocale(
  sql: NeonQueryFunction<any, any>,
  selector: number | string
): Promise<Locale> {
  try {
    let rows: { locale: string }[];
    if (typeof selector === "number") {
      rows = (await sql`
        SELECT locale FROM users WHERE id = ${selector}
      `) as { locale: string }[];
    } else {
      rows = (await sql`
        SELECT locale FROM users WHERE lower(email) = lower(${selector})
      `) as { locale: string }[];
    }
    return validateLocale(rows[0]?.locale);
  } catch {
    return "fr";
  }
}
