import Handlebars from "handlebars";
import { BASE, PARTIALS, TEMPLATES, SAMPLES, type Locale, type TemplateKey } from "./templates";
import { MANIFEST } from "./manifest";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

export function renderEmail(key: TemplateKey, locale: Locale, data: Record<string, unknown>): RenderedEmail {
  const entry = MANIFEST[key];
  if (!entry) {
    throw new Error(`Unknown template: ${key}`);
  }

  for (const field of entry.requiredFields) {
    if (!(field in data)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const hb = Handlebars.create();

  hb.registerHelper("formatDate", (value: string) => {
    try {
      const [y, m, d] = value.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const fmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return fmt.format(date);
    } catch {
      return value;
    }
  });

  hb.registerHelper("money", (value: number) => {
    try {
      const fmt = new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
        style: "currency",
        currency: "CAD",
      });
      return fmt.format(value);
    } catch {
      return `$${value.toFixed(2)}`;
    }
  });

  hb.registerPartial({
    header: PARTIALS[locale].header,
    footer: PARTIALS[locale].footer,
    body: TEMPLATES[key][locale],
  });

  const dataWithLocale = { ...data, locale };
  const html = hb.compile(BASE)(dataWithLocale);
  const subject = hb.compile(entry.subject[locale])(dataWithLocale);
  const text = htmlToText(html);

  return { subject, html, text };
}
