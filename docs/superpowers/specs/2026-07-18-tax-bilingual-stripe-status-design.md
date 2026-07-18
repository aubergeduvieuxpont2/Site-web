# Design — Tax fix · Bilingual · Settings UX · Reservation status · Stripe confirm-on-paid · Config refresh

**Date:** 2026-07-18
**Branch base:** `admin-improvements-base`
**Delivery:** orchestrator, decomposed into the work-streams in §7.

This spec covers six changes requested for L'Auberge du Vieux Pont. A seventh
original request — "availability must consider blackout days" — was investigated
and **dropped**: blackout dates are already correctly enforced server-side
(`apps/api/src/availability.ts` LEFT JOINs `blackout_dates` and the reservation
POST gate rejects unavailable nights). No work needed there.

---

## 1. Tax cascade fix

### Current state
Two hand-synchronised implementations of an identical cascade:
- Frontend quote: `apps/web/src/lib/utils.ts` → `estimateStay()`
- API invoice/email: `apps/api/src/pricing.ts` → `computeInvoice()`

Both compute a **fully-compounding** cascade, each line rounded with
`round2(x) = Math.round(x*100)/100`.

### Bug
`round2` under-rounds because of floating point. `89 × 0.035 = 3.11499999…`,
so `Math.round(311.4999…) = 311 → 3.11`, when the true value `3.115` must round
**up** to `3.12`. This throws the total off by a cent (106.37 vs correct 106.38).

### Decision (confirmed with operator)
- **Keep the fully-compounding cascade**: `base → ×1.035 → ×1.05 → ×1.09975`.
  Equivalent to:
  - `hébergement = base × 3.5%`
  - `TPS        = (base + hébergement) × 5%`
  - `TVQ        = (base + hébergement + TPS) × 9.975%`  ← QST rate is **9.975%**
  - `total      = base + hébergement + TPS + TVQ`
- **Round each line to the cent as it is computed** (round-then-compound), honoring
  the operator's explicit instruction to round the hébergement line.
- **True half-up rounding (0.005 → up), robust to floating point.** Implement a
  `roundCents` that corrects the FP error (e.g. round on
  `Math.round((x + Number.EPSILON) * 100) / 100`, or scale/`Number.parseFloat`
  via integer cents) so exact half-cents always round up.

### Work
1. New shared module (single source of truth) with the cascade + `roundCents`.
   - Location: a package/module importable by both `apps/web` and `apps/api`.
     Preferred: `apps/api/src/pricing.ts` stays authoritative and a mirrored
     `apps/web/src/lib/tax.ts` re-implements the *same* `roundCents`+cascade, OR
     (better) a tiny shared file both import. Implementer picks the cleanest
     option that avoids drift; if a shared file is impractical across the two
     workspaces, keep two files but add a cross-checked test table so they cannot
     diverge.
2. Replace both `estimateStay` and `computeInvoice` internals to use it.
3. **Email templates**: `reservation-confirmation.*.hbs` and
   `invoice-receipt.*.hbs` currently hardcode `(3.5%)`, `(5%)`, `(9.975%)` label
   strings. Make the labels read the live rates from settings (like the contact
   form already does) so they never drift when an admin edits a rate.
4. Unit tests pinning worked examples: base **89 → total 106.38** (hébergement
   3.12), base **100 → total 119.52** (hébergement 3.50), plus a value that
   exercises the half-cent rounding.

### Acceptance
- Quote (contact form), invoice (admin), and confirmation email all agree to the
  cent for the same inputs.
- `89` nightly yields hébergement `3.12` and total `106.38` everywhere.
- Email rate labels reflect the current settings values.

---

## 2. Bilingual — guest-facing (French default, English via header toggle)

### Current state
No i18n in `apps/web`: every string is hardcoded French, in
`apps/web/src/lib/content.ts` plus inline literals across routes/components.
`<html lang="fr-CA">`. The **email pipeline is already bilingual-capable**
(`apps/api/src/emails/*` render fr/en) but `enqueueEmail` always defaults
`locale = "fr"` because nothing selects a per-user locale.

### Decision (confirmed)
- **Lightweight custom i18n** (Option A) — no new dependency.
- **Coverage: guest-facing only.** Public marketing pages, reservation/contact
  flow, guest portal, `connexion`/registration, and emails. **Admin panel stays
  French.**
- **French is the default** for first-time visitors; English available via toggle.
- **Claude authors the English; operator reviews.**

### Design
- A `locale` rune store (`apps/web/src/lib/i18n.svelte.ts`) holding `"fr" | "en"`,
  plus a `t(key, params?)` helper reading from `fr`/`en` message dictionaries.
- Messages extracted from `content.ts` + inline guest-facing strings into keyed
  `fr`/`en` maps (organised by page/section).
- **FR/EN toggle in the header, top-right.** Flips the store; persists to a
  cookie **and** `localStorage`. Sets `<html lang>` accordingly.
- New **`users.locale`** column (migration, `TEXT NOT NULL DEFAULT 'fr'`).
  Captured at registration (add to `RegisterSchema` + INSERT) and updated when a
  logged-in user flips the toggle. On login, the store initialises from
  `users.locale`.
- **Email locale**: senders pass the recipient's `users.locale` to `enqueueEmail`
  so guests receive mail in their language. (Pipeline already supports `en`.)
- Key-parity unit test: `fr` and `en` dictionaries must have identical key sets.

### Acceptance
- Header toggle switches all guest-facing copy between FR and EN with no reload;
  choice survives navigation and refresh.
- A user who registered/selected EN receives EN transactional emails.
- Admin panel unaffected (remains French).
- Key-parity test passes.

---

## 3. Settings (Paramètres) UX redesign

### Current state
The live settings UI is a flat inline block in
`apps/web/src/routes/admin/+page.svelte` (`panel-settings`, ~763–1065): one field
after another, no grouping. A **polished, card-based `AdminParametresTab.svelte`
already exists but is dead code** (never imported) — grouped cards (Tarification &
taxes / Coordonnées / Réservations / Courriels / Sécurité), sticky save bar,
per-field error state, a 5th email toggle.

### Decision
- **Adopt and polish `AdminParametresTab.svelte`**, wire it into
  `admin/+page.svelte` replacing the inline block (matching the other tabs which
  are all extracted components).
- Fix the dead `marketingRoomCount` field (in state, no input) — either render an
  input or remove it from state; render it (it's a real public setting).
- Apply the **frontend-design skill** for the visual pass: clear card hierarchy,
  spacing, mobile-responsive (verify narrow viewport), accessible labels/errors,
  a satisfying save affordance.

### Acceptance
- Settings tab renders the card-based component; all existing fields present and
  functional (nightly/weekly price, contact email/phone, TPS/TVQ/hébergement,
  read-only assignable count, marketing room count, reservations toggle, all
  email toggles, password change).
- No horizontal overflow at mobile widths; existing settings tests still pass
  (update `data-testid` references if markup moves).

---

## 4. Reservation status — fix the real mismatch

### Root cause (confirmed via code map)
Status **values** are consistent (`pending | confirmed | cancelled`) across DB,
API, and frontend. The bug is **data loss**: the admin list query
`apps/api/src/index.ts:1335` does **not** `SELECT status` (nor `source`, `code`,
`external_ref`). So `row.status` is `undefined` for every listed row →
`statusLabel(undefined)` always renders "En attente", and both action buttons
always show. The PATCH endpoint returns status and the UI updates optimistically,
but a reload loses it.

### Work
- Add `status`, `source`, `code`, `external_ref` (and `user_id` if useful) to the
  admin list SELECT and the row DTO.
- Frontend already handles these values; ensure `ReservationTableRow` reflects
  true status (badge + which action buttons render).

### Acceptance
- Reservations list shows correct status badges after reload; confirmed rows show
  as "Confirmé", cancelled as "Annulé".
- Source (Airbnb/Expedia/website) available to the row for §5 logic.

---

## 5. Reservation actions + Stripe confirm-on-paid

### 5a. Icons
Replace the **Confirmer/Annuler text buttons with icons** in
`apps/web/src/lib/components/admin/ReservationTableRow.svelte:149–171`. Keep the
existing `aria-label`s and `data-testid`s for accessibility/tests.

### 5b. OTA auto-confirm
OTA inserts (`apps/api/src/index.ts:649`) currently omit status → default
`pending`. Change so **`source in ('airbnb','expedia')` inserts as `confirmed`**
(these are already-paid bookings from the OTA).

### 5c. Direct bookings: confirm-on-paid via Stripe
Direct (`source = 'website'`) bookings stay `pending` until the invoice is paid.
**Payment moves to Stripe** (HubSpot Payments is US-only and cannot report a
reliable paid status for a Canadian business; HubSpot stays as-is for CRM/contact
sync only).

Flow:
1. Admin generates the bill for a reservation → API creates a **Stripe hosted
   invoice / Payment Link** for the computed total (reuse the shared tax module),
   stores `stripe_invoice_id` (+ `invoice_status`) on the reservation.
2. A **Stripe webhook endpoint** (new API route, **signature-verified** with the
   webhook signing secret) receives `checkout.session.completed` / `invoice.paid`.
3. On paid: set reservation `status = 'confirmed'`, record `paid_at`, update
   `invoice_status`.
4. OTA bookings never need this (already confirmed).

Config/secrets (Worker secrets on `apps/api`): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`. Build/verify in **test mode** (Stripe CLI `stripe listen`
/ `stripe trigger` fires real webhook events, so item #5 is provable end-to-end
without real money). Operator supplies live keys when going live.

Schema: migration adding `stripe_invoice_id TEXT`, `invoice_status TEXT`,
`paid_at TIMESTAMPTZ` to `reservations` (idempotent `ADD COLUMN IF NOT EXISTS`).

### Acceptance
- Confirm/Cancel render as icons; still keyboard-accessible; tests updated.
- New Airbnb/Expedia reservation lands as `confirmed`.
- In Stripe test mode, paying the generated invoice flips the reservation to
  `confirmed` with `paid_at` set, via the verified webhook.
- HubSpot contact pipeline unchanged.

---

## 6. Instant config refresh

### Current state
`apps/web/src/routes/+layout.svelte` re-fetches the public settings store on
`onMount` **and every `afterNavigate`**, so "navigate away and back" already
reflects config edits without a hard refresh. Gap: after an **admin save**, the
public store isn't refreshed in the same session until the next navigation; and
some settings-derived views should be audited.

### Work
- After a successful admin `saveSettings`, also invoke the **public settings
  store's `loadSettings()`** so maintenance banner / prices update in-session.
- **Audit every settings-derived consumer** (prices on home/le-site, contact
  info, maintenance toggle, room counts) to confirm none require a full page
  reload — navigation refresh must be sufficient everywhere.

### Acceptance
- Editing a setting in admin and navigating (or saving) reflects the new value
  without a hard browser refresh, everywhere it's shown.

---

## 7. Delivery decomposition (orchestrator work-streams)

Ordered for dependencies (tax/shared module first — others touch pricing):

1. **Tax + shared module** (§1) — foundational; unblocks invoice/email accuracy.
2. **Reservation status + list query + icons + OTA auto-confirm** (§4, §5a, §5b).
3. **Stripe confirm-on-paid** (§5c) — depends on #1 (total) and #2 (status/source).
4. **Bilingual guest-facing** (§2) — large, mostly independent stream.
5. **Settings UX redesign** (§3) — independent; frontend-design pass.
6. **Instant config refresh** (§6) — small; touches settings save + layout.

### Cross-cutting constraints
- **Migrations idempotent**, one change per numbered file in
  `apps/api/migrations/` (`ADD COLUMN IF NOT EXISTS`). New columns: `users.locale`;
  `reservations.stripe_invoice_id/invoice_status/paid_at`.
- Keep secrets out of `apps/web`. Stripe keys are Worker secrets on `apps/api`.
- Fully responsive; verify narrow viewport for the settings redesign and header
  toggle.
- `npm run typecheck` and the test suites must stay green.

### External dependencies / operator TODO
- **Stripe account** + test keys to build/verify; live keys as Worker secrets
  before production billing.
- English copy review.
