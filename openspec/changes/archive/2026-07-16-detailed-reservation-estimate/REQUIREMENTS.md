# Requirements — Detailed Reservation Estimate

## In Scope

### Functional Requirements

- **FR-1 (MUST)** A pure function `estimateStay(nights, rooms, nightlyRate, rates)` MUST
  be exported from `apps/web/src/lib/utils.ts`, returning
  `{ base, hebergementTax, tps, tvq, total }`.
- **FR-2 (MUST)** The cascade MUST compound in this exact order, rounding each line to
  cents (`Math.round(x*100)/100`) before it feeds the next:
  1. `base = nights × rooms × nightlyRate`
  2. `hebergementTax = base × accommodationTax/100`
  3. `tps = (base + hebergementTax) × tps/100`
  4. `tvq = (base + hebergementTax + tps) × tvq/100` (TVQ compounds on the running total
     including previously charged taxes)
  5. `total = base + hebergementTax + tps + tvq`
- **FR-3 (MUST)** The helper's own rounded line outputs MUST sum exactly to its returned
  `total`.
- **FR-4 (MUST)** For `nights=0`, `rooms=0`, or any negative / `NaN` input, every returned
  field MUST be `0` (never negative, never `NaN`).
- **FR-5 (MUST)** The contact page (`apps/web/src/routes/contact/+page.svelte`) MUST
  replace the single-line "avant taxes" estimate with a row breakdown inside the existing
  block `data-testid="contact-estimate"`, rendering rows with `data-testid` values
  `estimate-base`, `estimate-hebergement`, `estimate-tps`, `estimate-tvq`, and
  `estimate-total`.
- **FR-6 (MUST)** The breakdown MUST remain gated by `nights >= 1 && rooms >= 1` and MUST
  update live (Svelte 5 `$derived`) as `checkIn`, `checkOut`, and `roomCount` change.
- **FR-7 (MUST)** Percent labels for hébergement, TPS, and TVQ MUST render the actual
  configured rates from the settings store in fr-CA formatting (e.g. `3,5 %`, `5 %`,
  `9,975 %`), not hardcoded strings.
- **FR-8 (MUST)** Currency amounts MUST use the existing `Intl.NumberFormat('fr-CA', {
  style:'currency', currency:'CAD' })` convention.
- **FR-9 (SHOULD)** The existing rate line (`contact-rate-line`, "Tarif … /nuit" with the
  "Tarif personnalisé" badge) SHOULD remain unchanged and continue to render.
- **FR-10 (MUST)** Unit tests MUST cover `estimateStay` (base-100 cascade equals
  base 100 / hébergement 3.50 / TPS 5.18 / TVQ 10.84 / total 119.52; sum-equals-total;
  zero-rate; zero-nights; negative/NaN). Page tests MUST assert the breakdown rows render
  with a valid stay and are absent without one.

### Non-Functional Requirements

- **NFR-1 (MUST)** `npm run typecheck` MUST pass.
- **NFR-2 (MUST)** `npm run build:web` MUST pass.
- **NFR-3 (MUST)** All existing vitest suites MUST continue to pass alongside the new tests.
- **NFR-4 (MUST)** The breakdown rows MUST NOT overflow at viewport widths `<= 400px`
  (label left, amount right).
- **NFR-5 (MUST)** `estimateStay` MUST be pure — no store access, no DOM, no I/O, no
  mutation of inputs.

## Out of Scope (Exclusions)

- No changes to any API endpoint or to `GET /api/settings`.
- No changes to `apps/api/src/pricing.ts` (`computeInvoice`) or the admin
  `InvoiceCreator` component.
- No database schema change or migration.
- No changes to the home page (`+page.svelte`), `le-site`, or any page other than the
  contact page.
- No change to the reservation submit payload (the estimate is display-only; it is not
  persisted or sent to the API).
- No new configurable settings (tax rates already exist).

## Acceptance Criteria

1. `estimateStay` is exported from `apps/web/src/lib/utils.ts` and used by the contact page.
2. `estimateStay(1, 1, 100, { accommodationTax: 3.5, tps: 5, tvq: 9.975 })` returns
   `{ base: 100, hebergementTax: 3.5, tps: 5.18, tvq: 10.84, total: 119.52 }` and its
   rounded lines sum to `total`.
3. Zero-rate input yields `total === base`; `nights=0`/`rooms=0` yields all-zero;
   negative/`NaN` input yields all-zero (never negative/NaN).
4. With valid ordered dates and `roomCount >= 1`, `data-testid="contact-estimate"`
   renders and contains `estimate-base`, `estimate-hebergement`, `estimate-tps`,
   `estimate-tvq`, `estimate-total`.
5. Hébergement/TPS/TVQ labels display the settings-store percentages in fr-CA format
   (`3,5 %`, `5 %`, `9,975 %` with defaults).
6. With missing/reversed dates or `roomCount < 1`, `data-testid="contact-estimate"` is
   not rendered.
7. `npm run typecheck`, `npm run build:web`, and all vitest suites (including the new
   helper and page tests) pass.
