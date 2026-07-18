import { Hono, type Context } from "hono";
import { neon } from "@neondatabase/serverless";
import type { User } from "../auth/session";
import { renderEmail, EMAIL_DEFAULTS } from "./render";
import { MANIFEST, isTemplateKey, isLocale } from "./manifest";
import { SAMPLES } from "./templates";

type Bindings = { DB_CONN: string; HUBSPOT: Fetcher; ADMIN_EMAIL: string; RESEND_API_KEY: string };

// Build the footer contact context from the live `settings` values, falling
// back to EMAIL_DEFAULTS if the query fails so a preview never 500s.
function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return EMAIL_DEFAULTS.contactPhoneHref;
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
}

export async function contactContext(dbConn: string | undefined) {
  if (!dbConn) return { ...EMAIL_DEFAULTS };
  try {
    const sql = neon(dbConn);
    const rows = (await sql`
      SELECT key, value FROM settings WHERE key IN ('contact_phone', 'contact_email')
    `) as { key: string; value: string }[];
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const contactPhone = map.get("contact_phone") ?? EMAIL_DEFAULTS.contactPhone;
    const contactEmail = map.get("contact_email") ?? EMAIL_DEFAULTS.contactEmail;
    return { contactPhone, contactPhoneHref: telHref(contactPhone), contactEmail };
  } catch {
    return { ...EMAIL_DEFAULTS };
  }
}

export function createEmailsRouter(deps: { authenticate: (c: Context<{ Bindings: Bindings }>) => Promise<User | null> }) {
  const router = new Hono<{ Bindings: Bindings }>();

  router.get("/api/admin/emails/templates", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const templates = Object.entries(MANIFEST).map(([key, entry]) => ({
      key,
      name: entry.name,
      subject: entry.subject,
    }));

    return c.json({ templates });
  });

  router.get("/api/admin/emails/preview", async (c) => {
    const user = await deps.authenticate(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const templateParam = c.req.query("template");
    const localeParam = c.req.query("locale");

    if (!isTemplateKey(templateParam)) {
      return c.json({ error: "Invalid template" }, 400);
    }
    if (!isLocale(localeParam)) {
      return c.json({ error: "Invalid locale" }, 400);
    }

    try {
      const sample = SAMPLES[templateParam] as Record<string, unknown>;
      const contact = await contactContext(c.env?.DB_CONN);
      const rendered = renderEmail(templateParam, localeParam, { ...sample, ...contact });
      return c.json(rendered);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
