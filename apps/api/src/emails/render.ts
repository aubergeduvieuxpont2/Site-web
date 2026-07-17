import { BASE, PARTIALS, TEMPLATES } from "./precompiled";
import type { Locale, TemplateKey } from "./templates";
import { MANIFEST } from "./manifest";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Contact details rendered in the shared footer. Callers (e.g. the preview
// route, and the future send path) override these with the live `settings`
// values; the defaults keep the footer populated when they aren't provided.
export const EMAIL_DEFAULTS = {
  contactPhone: "418 655-1212",
  contactPhoneHref: "tel:+14186551212",
  contactEmail: "info@aubergeduvieuxpont.ca",
} as const;

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

// Per-locale template helpers. Passed to each render call rather than registered
// globally, so concurrent requests for different locales never race.
function makeHelpers(locale: Locale) {
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return {
    formatDate(value: string) {
      try {
        const [y, m, d] = value.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return new Intl.DateTimeFormat(tag, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(date);
      } catch {
        return value;
      }
    },
    money(value: number) {
      try {
        return new Intl.NumberFormat(tag, { style: "currency", currency: "CAD" }).format(value);
      } catch {
        return `$${value.toFixed(2)}`;
      }
    },
  };
}

// Subjects use only `{{field}}` placeholders (no helpers/blocks), so plain string
// substitution renders them — no Handlebars.compile, no runtime code generation
// (which Cloudflare Workers forbid).
function renderSubject(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value == null ? "" : String(value);
  });
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

  const dataWithLocale = { ...EMAIL_DEFAULTS, ...data, locale };

  // Render the precompiled base with per-call helpers + locale partials. The
  // partials are precompiled template delegates (functions), never strings, so
  // handlebars/runtime interprets them without generating any code at runtime.
  const html = BASE(dataWithLocale, {
    helpers: makeHelpers(locale),
    partials: {
      header: PARTIALS[locale].header,
      footer: PARTIALS[locale].footer,
      body: TEMPLATES[key][locale],
    },
  });

  const subject = renderSubject(entry.subject[locale], dataWithLocale);
  const text = htmlToText(html);

  return { subject, html, text };
}
