# Transactional email templates + admin preview (bilingual, Handlebars)

**Date:** 2026-07-16
**Status:** Approved

## Goal

Build the foundation for automated transactional emails (to be sent via
Mailtrap): a modular, brand-styled **Handlebars** template system with shared
header/footer, **bilingual** (French + English) copy, committed **test-data
JSON** per template, and an **admin page** to preview each assembled template
with its test data.

This spec covers the **templates + render engine + admin preview** only.
Mailtrap sending, trigger wiring, the reviews table, and the first-party review
page are **explicitly deferred to a follow-up "sending" spec** (see §8). The
render engine is built so the eventual send path calls the identical
`renderEmail`.

## Decisions (from brainstorming)

- **Scope:** templates + Handlebars engine + shared partials + test JSON +
  admin preview page now; Mailtrap send + trigger wiring later.
- **Language:** bilingual **FR + EN**. The engine takes a `locale`; the preview
  page has an FR/EN toggle. *How locale is chosen at send time* (a per-user or
  per-reservation language column) is a sending-spec concern.
- **Architecture:** Approach A — templates are **API-owned**, rendered
  **server-side** by the API worker; the admin preview calls an API endpoint
  and shows the rendered HTML in a sandboxed iframe. One render path, reused by
  future sending. (Rejected: client-side SPA render — throwaway, duplicates
  templates; a shared `packages/emails/` workspace — YAGNI, single consumer.)
- **Bilingual files:** **separate `.hbs` file per locale** sharing
  `header`/`footer` partials (not one template + i18n-strings JSON) — each
  language's copy reads naturally.
- **Review flow:** the review-request email links to a **first-party** review
  page; the reviews table + form + endpoint + token issuance are deferred. This
  template renders a sample review URL from test data.
- **Plain text:** auto-derived from the HTML now (keeps us at 12 template files,
  not 24); hand-written `.txt` templates deferred.
- **Templates folder:** `apps/api/emails/` (sibling to `src/`).

## Templates in scope (6 emails × 2 locales = 12 files)

1. Registration welcome
2. Password reset
3. Reservation confirmation
4. Reservation cancellation
5. Invoice receipt
6. Review request

## Architecture

Everything lives in `apps/api`. The API worker owns rendering because it will
also own sending. The admin preview page (in `apps/web`) is a thin client that
calls an admin-gated API endpoint and displays the returned HTML in an iframe.

```
Admin browser ──GET /api/admin/emails/preview?template=&locale=──▶ apps/api
                                                                    │ renderEmail(key, locale, sampleData)
                                                                    │   Handlebars: base + header/footer/body partials
                                                                    ▼ { subject, html, text }
Admin preview page  ◀── JSON ── renders subject + <iframe srcdoc=html>

(future sending spec)  event ──▶ enqueue ──▶ renderEmail(...) ──▶ Mailtrap
                                              ^^^^^^^^^^^^ identical call
```

## Components

### 1. Templates folder — `apps/api/emails/`

```
apps/api/emails/
  base.hbs                    # shared HTML shell (doctype + 600px table layout),
                              #   references {{> header}} {{> body}} {{> footer}}
  partials/
    header.fr.hbs  header.en.hbs      # terracotta masthead / wordmark
    footer.fr.hbs  footer.en.hbs      # address, CITQ #304542, contact, legal line
  templates/                  # 6 emails × 2 locales
    welcome.fr.hbs                     welcome.en.hbs
    password-reset.fr.hbs              password-reset.en.hbs
    reservation-confirmation.fr.hbs    reservation-confirmation.en.hbs
    reservation-cancellation.fr.hbs    reservation-cancellation.en.hbs
    invoice-receipt.fr.hbs             invoice-receipt.en.hbs
    review-request.fr.hbs              review-request.en.hbs
  samples/                    # one locale-agnostic test-data JSON per email
    welcome.json  password-reset.json  reservation-confirmation.json
    reservation-cancellation.json  invoice-receipt.json  review-request.json
```

- `base.hbs` is shared across **all** templates and **both** locales. Only the
  `header`/`footer` partials and the `body` template swap by locale — the HTML
  shell (doctype, table shell, width, background) exists in exactly one place.
- **Email-safe styling:** `base.hbs` + partials **rebuild** the brand as a
  **600px table layout with inline styles** — terracotta `#9d4300`, charcoal
  `#2d3133`, surfaces (`#f7f9fb`), IBM Plex → **Arial/Helvetica** fallback (custom
  web fonts barely render in mail clients). `app.css` is **not** reused (mail
  clients strip `<link>`, CSS variables, and most `<style>`). Result looks like
  the site; the CSS is independent by necessity.
- **Sample data is locale-agnostic**: raw values (`checkIn: "2026-08-14"`,
  `total: 267.5`, `firstName: "Marie"`). The per-locale template + formatting
  helpers produce localized output, so one sample file drives both previews.

### 2. Render engine — `apps/api/src/emails/`

```
apps/api/src/emails/
  render.ts     # renderEmail(key, locale, data) -> { subject, html, text }
  manifest.ts   # registry: key -> { name:{fr,en}, subject:{fr,en}, sampleFile, requiredFields }
  templates.ts  # explicit imports of .hbs/.json text modules -> key→string maps
  routes.ts     # admin endpoints, mounted from index.ts (keeps index.ts thin)
```

**Types**

```ts
type Locale = 'fr' | 'en';
type TemplateKey =
  | 'welcome' | 'password-reset' | 'reservation-confirmation'
  | 'reservation-cancellation' | 'invoice-receipt' | 'review-request';

interface RenderedEmail { subject: string; html: string; text: string; }

function renderEmail(key: TemplateKey, locale: Locale, data: Record<string, unknown>): RenderedEmail;
```

**`renderEmail` steps**

1. Look up the manifest entry; **validate `requiredFields`** against `data` —
   throw a clear error naming the first missing field (harmless with committed
   samples; the guard pays off when real send-data is wired later).
2. Create a fresh `Handlebars.create()` env (no cross-locale partial bleed).
3. Register helpers:
   - `formatDate` — `Intl.DateTimeFormat` (fr → "14 août 2026", en →
     "August 14, 2026").
   - `money` — `Intl.NumberFormat` (fr → "89,00 $", en → "$89.00").
   - built-in `{{#each}}` for invoice line items.
4. Register the locale `header`/`footer` partials and the locale template as the
   `body` partial; compile and render `base` with `data` → HTML.
5. Compile the manifest `subject[locale]` string with the same `data` (subjects
   interpolate, e.g. `Votre réservation #{{confirmationCode}}`).
6. `text` — auto-derive a plain-text alternative from the HTML (strip tags,
   preserve link URLs).

**Bundling into the Worker.** Workers have no filesystem, so templates must be
bundled. `apps/api/wrangler.jsonc` gets a `rules` entry treating `**/*.hbs` as
**Text** modules; `templates.ts` does explicit
`import welcomeFr from "../../emails/templates/welcome.fr.hbs"` (native JSON
imports for samples) and assembles the key→string maps. Real `.hbs` files,
compiled at request time — 17 tiny templates, trivial cost.

### 3. API endpoints — admin-gated (reuse `requireAdmin`)

- `GET /api/admin/emails/templates`
  → `[{ key, name:{fr,en}, subject:{fr,en} }]` for the preview picker.
- `GET /api/admin/emails/preview?template=<key>&locale=<fr|en>`
  → renders with the committed sample JSON, returns `{ subject, html, text }`.

Both return `401` without an admin session (existing guard). Unknown
`template`/`locale` → `400`. Missing required field in a sample → `500` with the
field name (dev-time guard). Routes live in `apps/api/src/emails/routes.ts`,
mounted from `index.ts` (which is already 1359 lines — modularize like
`settings.ts`/`rooms.ts`).

### 4. Admin preview page — `apps/web/src/routes/admin/courriels/`

- `+page.svelte` + `+page.ts`, guarded by the existing admin route pattern
  (mirrors `/admin/utilisateurs`), linked from the admin dashboard.
- Controls: template picker (localized names) + **FR/EN toggle** +
  **desktop/mobile width toggle** for the preview.
- Main pane: the **subject line**, then the rendered email inside a sandboxed
  `<iframe srcdoc={html}>` (isolates email CSS from the SPA), plus a tab to view
  the plain-text version.
- **Fully responsive** (project hard rule): on narrow viewports the picker
  collapses above the preview; the width toggle lets the operator eyeball how
  each email renders on a phone.

## Test data (samples) — representative fields

| Template | Key fields (locale-agnostic) |
|---|---|
| welcome | `firstName`, `email`, `loginUrl` |
| password-reset | `firstName`, `resetUrl`, `expiryHours` |
| reservation-confirmation | `confirmationCode`, `name`, `checkIn`, `checkOut`, `guests`, `roomLabel`, `nightlyPrice`, `nights`, `total`, `manageUrl` |
| reservation-cancellation | `confirmationCode`, `name`, `checkIn`, `checkOut`, `contactEmail` |
| invoice-receipt | `invoiceNumber`, `name`, `checkIn`, `checkOut`, `lineItems[]`, `subtotal`, `accommodationTax`, `tps`, `tvq`, `total`, `paymentDate` |
| review-request | `firstName`, `checkIn`, `checkOut`, `roomLabel`, `reviewUrl` |

Invoice tax fields mirror the existing cascade (TPS 5 %, TVQ 9.975 %,
accommodation tax 3.50 $ from `DEFAULTS` / `settings`).

## Error handling

| Case | Behaviour |
|---|---|
| Unknown template key / locale | `400` |
| No admin session | `401` (existing `requireAdmin`) |
| Missing required field in data | engine throws; endpoint → `500` naming the field |
| Handlebars compile error | surfaced as `500`; caught in tests via committed samples |

## Testing (this spec)

- `renderEmail` unit tests: every key × locale renders; subject interpolates;
  output contains expected tokens; `money`/`formatDate` differ correctly between
  fr/en; a missing required field throws.
- Endpoint tests: preview returns `{subject,html,text}` for a known template;
  `401` without admin; `400` on bad key/locale.
- Web: light test that the page fetches templates and mounts the iframe.

## Out of scope — follow-up "sending" spec

- **Mailtrap integration** — Email Sending API token vs SMTP decided there.
- **Email outbox** table mirroring `hubspot_outbox` (durable retry via cron).
- **Wiring the 6 triggers**: registration → welcome; reset endpoint → reset;
  `POST /api/reservations` → confirmation; cancellation flow → cancellation;
  invoice generation → receipt; post-checkout → review request.
- **Reviews table + first-party `/avis` page + submission endpoint + token
  issuance** (feeds on-site social proof).
- **Per-user / per-reservation locale column** to pick the send language.
- Unsubscribe / transactional-vs-marketing handling.
