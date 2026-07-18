# Tax · Bilingual · Settings UX · Status · Stripe · Config-refresh — Implementation Plan

> **For agentic workers / orchestrator:** This plan decomposes the spec
> `docs/superpowers/specs/2026-07-18-tax-bilingual-stripe-status-design.md` into
> six dependency-ordered work-streams for orchestrator delivery. Each stream is
> independently testable and gate-reviewable. Use TDD within each task.

**Goal:** Deliver six operator-requested changes to L'Auberge du Vieux Pont:
correct compounding tax with FP-robust half-up rounding, guest-facing FR/EN
bilingual site, a redesigned admin Settings tab, a fixed reservation-status list,
Stripe confirm-on-paid, and instant config refresh.

**Architecture:** Svelte 5 SPA (`apps/web`) + Hono/Neon-Postgres Worker
(`apps/api`) + bilingual email pipeline (`apps/api/src/emails`). Changes are
additive and migration-driven; HTTP boundary unchanged except new Stripe webhook
route and extended admin/reservation DTOs.

**Tech Stack:** Svelte 5 runes, Tailwind v4, Hono, `@neondatabase/serverless`,
Handlebars email templates, Stripe (hosted invoice + webhook), Vitest.

## Global Constraints

- Migrations idempotent, one change per numbered file in `apps/api/migrations/`;
  Postgres `ADD COLUMN IF NOT EXISTS`. Never add a column in both `schema.sql` and
  a migration in the same commit.
- No secrets in `apps/web`. Stripe keys (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`) are `apps/api` Worker secrets only.
- Fully responsive; verify narrow viewport for the Settings redesign and header
  language toggle. No horizontal overflow on mobile.
- `npm run typecheck` green; existing Vitest suites in `apps/web` and `apps/api`
  stay green (update `data-testid` refs when markup moves).
- Tax rates are runtime settings (`tps`, `tvq`, `accommodation_tax`), not
  hardcoded — except email-label rendering which must now read them live.
- Guest-facing i18n only; the admin panel stays French.

---

## Stream 1 — Tax cascade + shared rounding module (foundational)

**Files:**
- Create: `apps/api/src/tax.ts` (authoritative cascade + `roundCents`)
- Modify: `apps/api/src/pricing.ts` (`computeInvoice` uses `apps/api/src/tax.ts`)
- Create/Modify: `apps/web/src/lib/tax.ts` (mirror of cascade + `roundCents`)
- Modify: `apps/web/src/lib/utils.ts` (`estimateStay` uses `apps/web/src/lib/tax.ts`)
- Modify: `apps/api/emails/templates/reservation-confirmation.fr.hbs` +
  `.en.hbs`, `invoice-receipt.fr.hbs` + `.en.hbs` (rate labels → live values)
- Modify: `apps/api/src/emailPayloads.ts` (pass rate values into template data)
- Modify: `apps/api/src/emails/manifest.ts` (declare new rate-label fields)
- Regenerate: `apps/api/src/emails/precompiled.ts` (Workers codegen ban — must use
  the existing precompile build step, never runtime `Handlebars.compile`)
- Test: `apps/api/src/__tests__/tax.test.ts`, `apps/web/src/lib/__tests__/tax.test.ts`

**Interfaces — Produces:**
- `roundCents(x: number): number` — true half-up to the cent, FP-robust
  (`Math.round((x + Number.EPSILON) * 100) / 100` or integer-cents equivalent).
- `computeTaxBreakdown({ base, accommodationTax, tps, tvq }): { base, accommodationTax, tps, tvq, total }`
  where each line is `roundCents`-rounded, computed as:
  `accommodationTax = roundCents(base * accommodationTax/100)`,
  `tps = roundCents((base + accommodationTax) * tps/100)`,
  `tvq = roundCents((base + accommodationTax + tps) * tvq/100)`,
  `total = roundCents(base + accommodationTax + tps + tvq)`. Rates in **percent**.

**Acceptance:**
- Table tests pin: base `89` → hébergement `3.12`, total `106.38`; base `100` →
  hébergement `3.50`, total `119.52`; a half-cent case rounds up.
- `estimateStay` and `computeInvoice` produce identical breakdowns for identical
  inputs (shared cascade; keep both files if a cross-workspace shared file is
  impractical, but a `tax.test.ts` in each asserts the same table).
- Confirmation/invoice emails print the **current** TPS/TVQ/hébergement % (edit a
  rate in settings → label updates), not hardcoded `3.5%/5%/9.975%`.
- TVQ rate is **9.975%**.

---

## Stream 2 — Reservation status list fix + icons + OTA auto-confirm

**Files:**
- Modify: `apps/api/src/index.ts:1335` (admin list SELECT: add `status`, `source`,
  `code`, `external_ref`; extend row DTO)
- Modify: `apps/api/src/index.ts:649` (OTA insert sets `status='confirmed'` for
  `source in ('airbnb','expedia')`)
- Modify: `apps/web/src/lib/api.ts` (reservation list row type: add fields)
- Modify: `apps/web/src/lib/components/admin/ReservationTableRow.svelte:149-171`
  (Confirmer/Annuler → icon buttons; keep `aria-label` + `data-testid`)
- Test: `apps/api` route test for the list payload includes status/source;
  `apps/web` component test for icon buttons + correct button visibility per
  status; OTA-insert test asserts `confirmed`.

**Interfaces — Consumes:** none from Stream 1.
**Produces:** list rows now carry `status`, `source`, `code`, `external_ref` —
Stream 3 relies on `source` and `status`.

**Acceptance:**
- After reload, admin reservations list shows correct badges (Confirmé/Annulé/En
  attente) and renders only the applicable action button.
- New Airbnb/Expedia reservation persists as `confirmed`.
- Confirm/Cancel are icons, keyboard-accessible; tests green.

---

## Stream 3 — Stripe confirm-on-paid (direct bookings)

**Files:**
- Create: `apps/api/migrations/00NN_reservations_stripe.sql`
  (`ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT`, `invoice_status TEXT`,
  `paid_at TIMESTAMPTZ`)
- Create: `apps/api/src/stripe.ts` (create hosted invoice / Payment Link; verify
  webhook signature)
- Modify: `apps/api/src/index.ts` (admin "generate bill" path → create Stripe
  invoice, store `stripe_invoice_id`/`invoice_status`; new
  `POST /api/stripe/webhook` route, signature-verified, flips reservation to
  `confirmed` + `paid_at` on `checkout.session.completed`/`invoice.paid`)
- Modify: `apps/web/src/lib/components/admin/InvoiceCreator.svelte` /
  `ReservationDetailModal.svelte` (surface Stripe invoice link + paid state)
- Test: `apps/api` webhook test (valid signature → status flips; invalid
  signature → 400; wrong event → no-op); uses the Stripe total from Stream 1.

**Interfaces — Consumes:** `computeTaxBreakdown` (Stream 1) for the invoice total;
`source`/`status` (Stream 2).

**Acceptance:**
- In Stripe **test mode** (`stripe listen` / `stripe trigger`), paying the
  generated invoice flips the reservation to `confirmed` with `paid_at` set via
  the verified webhook.
- Invalid webhook signature rejected. HubSpot contact pipeline untouched.
- Secrets read from `apps/api` env only.

---

## Stream 4 — Guest-facing bilingual (FR default, EN toggle)

**Files:**
- Create: `apps/web/src/lib/i18n.svelte.ts` (`locale` rune store; `t(key,params?)`;
  cookie + localStorage persistence; sets `<html lang>`)
- Create: `apps/web/src/lib/messages/fr.ts`, `apps/web/src/lib/messages/en.ts`
  (keyed dictionaries extracted from `content.ts` + inline guest-facing strings)
- Modify: guest-facing routes/components (home, le-site, contact/reservation,
  guest portal, connexion/registration, header/footer) to call `t(...)`
- Modify: header component — add FR/EN toggle **top-right**
- Create: `apps/api/migrations/00NN_users_locale.sql`
  (`ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'fr'`)
- Modify: `apps/api/src/index.ts` (`RegisterSchema` + register INSERT capture
  `locale`; expose on auth/me; endpoint to update locale)
- Modify: `apps/web/src/lib/api.ts` (`register()` sends locale; auth carries it)
- Modify: email senders in `apps/api/src/index.ts` to pass `users.locale` to
  `enqueueEmail` (pipeline already renders `en`)
- Test: key-parity test (`fr`/`en` identical key sets); toggle persistence test;
  register-with-locale test; email-locale test (EN user → EN template selected).

**Interfaces — Consumes:** none.
**Produces:** `t`, `locale` store; `users.locale`.

**Acceptance:**
- Header toggle switches all guest-facing copy FR↔EN with no reload; survives
  navigation and refresh; admin stays French.
- EN-registered/selected user receives EN transactional emails.
- Key-parity test passes; `<html lang>` updates.

---

## Stream 5 — Settings (Paramètres) UX redesign

**Files:**
- Modify: `apps/web/src/lib/components/admin/AdminParametresTab.svelte` (polish:
  card hierarchy, spacing, mobile-responsive, accessible labels/errors, save
  affordance; render the currently-dead `marketingRoomCount` input)
- Modify: `apps/web/src/routes/admin/+page.svelte` (import + render
  `AdminParametresTab` in `panel-settings`; remove the inline flat block ~763-1065
  and its now-redundant state/handlers)
- Test: update `apps/web/src/routes/__tests__/page-admin-settings.test.ts` for the
  new component/testids; add a mobile-width no-overflow assertion.

**Interfaces — Consumes:** none (uses existing `adminGetSettings`/`adminUpdateSettings`).

**Acceptance:**
- Settings tab renders card-based component; all fields present and functional;
  password-change still works; no horizontal overflow at mobile widths; tests green.
- Apply the **frontend-design skill** for the visual pass.

---

## Stream 6 — Instant config refresh

**Files:**
- Modify: `apps/web/src/lib/components/admin/AdminParametresTab.svelte` (after a
  successful save, also call the public store's `loadSettings()` from
  `apps/web/src/lib/settings.svelte.ts`)
- Verify/Modify: settings-derived consumers (home, le-site, contact, maintenance
  banner in `+layout.svelte`) refresh on `afterNavigate` — fix any that require a
  hard reload.
- Test: after admin save, public `settings` store reflects new value without full
  reload (unit/integration).

**Interfaces — Consumes:** Stream 5's component.

**Acceptance:**
- Editing a setting in admin and saving (or navigating) reflects the new value
  everywhere it's shown, without a browser refresh.

---

## Dependency order for the orchestrator

1. **Stream 1** (tax/shared) — first; Stream 3 needs the total.
2. **Stream 2** (status/icons/OTA) — needs nothing; unblocks Stream 3's source/status.
3. **Stream 3** (Stripe) — after 1 & 2.
4. **Stream 4** (bilingual) — parallel, independent.
5. **Stream 5** (settings UX) — parallel, independent.
6. **Stream 6** (config refresh) — after Stream 5 (touches its component).

Streams 4 and 5 can run in parallel with 1–3. Stream 6 follows 5.

## Self-review — spec coverage

- §1 Tax → Stream 1 ✓  · §2 Bilingual → Stream 4 ✓  · §3 Settings UX → Stream 5 ✓
- §4 Status mismatch → Stream 2 ✓  · §5a icons → Stream 2 ✓  · §5b OTA → Stream 2 ✓
- §5c Stripe → Stream 3 ✓  · §6 Config refresh → Stream 6 ✓
- Blackout (dropped) → no task, intentional ✓

## Operator TODO (external)
- Stripe account + test keys to build/verify; live keys as `apps/api` Worker
  secrets before production billing.
- Review English copy.
- Run new migrations (`users.locale`, `reservations` Stripe columns) against
  `DB_CONN` before deploy.
