# SDD — Detailed Reservation Estimate

## System Overview

The web frontend (`apps/web`, Svelte 5 SPA) renders a reservation form on the contact
page. The form already derives a nightly rate (`auth.user?.effectiveNightlyPrice ??
settings.nightlyPrice`), a night count (`nightsBetween`), and a room count. The public
settings store (`$lib/settings.svelte`) already carries the three configured tax rates
(`tps`, `tvq`, `accommodationTax`), refreshed from `GET /api/settings`.

This change adds a pure computation helper and replaces the single-line estimate with a
compounding tax breakdown. Nothing crosses the HTTP boundary; the API and database are
untouched. The only new logic is deterministic arithmetic in a shared util plus
presentation in one Svelte component.

## Architecture Decisions

- **Pure helper in `utils.ts`, not inline in the component.** Keeps the cascade
  unit-testable in isolation (mirrors the existing `nightsBetween` / `datesOutOfOrder`
  pattern) and avoids duplicating rounding rules in markup.
- **Round each cascade step to cents.** `round2(x) = Math.round(x*100)/100` applied at
  every line, and each subsequent tax is computed from the already-rounded running
  total. This guarantees the displayed lines sum exactly to the displayed total (no
  penny drift), matching the owner's worked example (5.175 → 5.18; TVQ on 108.68).
- **Reuse the existing settings store as the source of tax rates.** The percent labels
  bind to `settings.accommodationTax/tps/tvq` and format with `Intl.NumberFormat`
  (`fr-CA`) so relabeling is automatic when an admin changes a rate. No hardcoded
  percent strings.
- **Preserve existing gating and reactivity.** The `estimateVisible` predicate
  (`nights >= 1 && rooms >= 1`) and the `transition:fade` wrapper stay; only the block's
  inner content and the derived value change from a scalar total to a `StayEstimate`
  object. Svelte 5 `$derived` keeps it live.
- **Keep the wrapper `data-testid="contact-estimate"`** for backward-compatible tests;
  add per-line testids for the new rows.
- **Defensive input guarding.** `estimateStay` coerces negative / `NaN` inputs to `0` so
  transient form states (empty date, cleared room field) never render negative or `NaN`
  amounts.

## Component Responsibilities

- `apps/web/src/lib/utils.ts`
  - `estimateStay(nights, rooms, nightlyRate, rates)` — pure cascade; returns
    `{ base, hebergementTax, tps, tvq, total }`, each rounded to cents. No side effects.
  - Exposes `StayTaxRates` and `StayEstimate` types.
- `apps/web/src/routes/contact/+page.svelte`
  - `estimate = $derived(estimateStay(nights, rooms, nightlyRate, {…settings rates}))`.
  - `formatRate` (existing CAD currency) + new `formatPct` (fr-CA percent) formatters.
  - Renders the breakdown rows with per-line testids inside the existing estimate block.
  - Owns the row/total CSS, including the `<= 400px` responsive rules.
- `apps/web/src/lib/settings.svelte.ts` — unchanged; read-only source of tax rates.
- Tests: `apps/web/src/lib/__tests__/utils.test.ts` (helper),
  `apps/web/src/routes/__tests__/page-contact.test.ts` (page rendering & gating).

## Data Flow

1. On load, `loadSettings()` populates `settings` from `GET /api/settings` (existing).
2. User edits `checkIn`, `checkOut`, `roomCount` → `nights`, `rooms` recompute via
   existing `$derived`.
3. `nightlyRate` derives from the auth store / settings (existing).
4. `estimate = $derived(estimateStay(nights, rooms, nightlyRate, { accommodationTax,
   tps, tvq }))` recomputes on any input change.
5. When `estimateVisible` (`nights >= 1 && rooms >= 1`), the breakdown block renders the
   five rows from `estimate`; percent labels format live from `settings`.
6. No network call, no persistence — purely reactive client-side computation.

## Known Constraints

- **Frontend-only.** No changes to `apps/api`, `apps/api/src/pricing.ts`
  (`computeInvoice`), the admin `InvoiceCreator`, or any other page. No DB migration.
- The estimate is an **indicative pre-tax-inclusive estimate**, not a persisted quote;
  it is not written back to the reservation payload (submit payload unchanged).
- Tax cascade order is fixed by the owner: hébergement → TPS → TVQ, TVQ compounding on
  the running total including previously charged taxes.
- Rounding is per-line to cents; the total is the sum of rounded lines (may differ by up
  to a cent from an unrounded single-shot computation — intentional, for display
  consistency).
- Rate values come from a public, admin-configurable settings row; the component must
  not assume the defaults (5 / 9.975 / 3.5) and must render whatever the store holds.
- Must remain responsive and non-overflowing at viewport widths `<= 400px`.
