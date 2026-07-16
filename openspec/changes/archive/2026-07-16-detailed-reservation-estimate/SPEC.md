# Detailed Reservation Estimate — Tax Breakdown

## Task

The reservation form on the contact page (`apps/web/src/routes/contact/+page.svelte`)
currently shows a single-line "avant taxes" estimate: `nights × rooms × rate`. The
owner requires **price transparency**: the estimate must show a detailed, compounding
tax breakdown so a logged-in (or anonymous) guest sees exactly what will be charged.

Goals:
1. Add a pure, unit-testable helper `estimateStay()` to `apps/web/src/lib/utils.ts`
   that computes the compounding cascade (base → taxe d'hébergement → TPS → TVQ → total),
   rounding each line to cents so displayed lines sum exactly to the displayed total.
2. Replace the single-line estimate block on the contact page with a row-based
   breakdown driven by the live `$derived` inputs already present (`nights`, `rooms`,
   `nightlyRate`) and the tax rates already carried by the settings store.
3. Percent labels render the **actual configured rates** (fr-CA formatted), never
   hardcoded strings.

This is a **frontend-only** change. No API, no DB migration, no invoice-computation
changes.

## Schema Changes

None. No database schema is touched. The tax rates (`tps`, `tvq`, `accommodationTax`)
already exist on the public settings payload and in the settings store
(`apps/web/src/lib/settings.svelte.ts`, defaults `5`, `9.975`, `3.5`).

## API Types

No API request/response types change. The existing public settings shape (already in
`apps/web/src/lib/api.ts` `PublicSettings`) is consumed as-is:

```ts
type PublicSettings = {
  nightlyPrice: number;
  contactEmail: string;
  marketingRoomCount: number;
  publicRoomCount: number;
  tps: number;              // percent, e.g. 5
  tvq: number;              // percent, e.g. 9.975
  accommodationTax: number; // percent, e.g. 3.5
};
```

New **internal** helper types (not crossing the HTTP boundary), added in `utils.ts`:

```ts
export type StayTaxRates = {
  accommodationTax: number; // percent
  tps: number;              // percent
  tvq: number;              // percent
};

export type StayEstimate = {
  base: number;          // nights * rooms * nightlyRate, rounded to cents
  hebergementTax: number;// base * accommodationTax/100, rounded to cents
  tps: number;           // (base + hebergementTax) * tps/100, rounded to cents
  tvq: number;           // (base + hebergementTax + tps) * tvq/100, rounded to cents
  total: number;         // base + hebergementTax + tps + tvq
};

export function estimateStay(
  nights: number,
  rooms: number,
  nightlyRate: number,
  rates: StayTaxRates
): StayEstimate;
```

## Implementation Steps

### Step 1 — `apps/web/src/lib/utils.ts` (helper)

Add `StayTaxRates`, `StayEstimate` and the pure function `estimateStay` next to
`nightsBetween`. Rules:
- Compute a cents-rounding helper `round2(x) = Math.round(x * 100) / 100`.
- `base = round2(nights * rooms * nightlyRate)`.
- `hebergementTax = round2(base * rates.accommodationTax / 100)`.
- `tps = round2((base + hebergementTax) * rates.tps / 100)`.
- `tvq = round2((base + hebergementTax + tps) * rates.tvq / 100)` — **charged on the
  running total including previously charged taxes**, using the already-rounded
  intermediate values.
- `total = round2(base + hebergementTax + tps + tvq)` (sum of rounded lines).
- Guard non-finite / negative inputs to `0` (treat `nights<0`, `rooms<0`,
  `nightlyRate<0`, or `NaN` as `0` so the function never returns negative or NaN).
- Pure: no side effects, no store/DOM access. JSDoc comment matching the file's style.

### Step 2 — `apps/web/src/routes/contact/+page.svelte` (script)

- Import `estimateStay` (and its rate type) from `$lib/utils` alongside the existing
  `datesOutOfOrder, nightsBetween`.
- Replace `const estimateTotal = $derived(nights * rooms * nightlyRate)` with
  `const estimate = $derived(estimateStay(nights, rooms, nightlyRate, {
     accommodationTax: settings.accommodationTax, tps: settings.tps, tvq: settings.tvq }))`.
- Keep `estimateVisible = $derived(nights >= 1 && rooms >= 1)`.
- Add a fr-CA percent formatter (e.g. `formatPct(value)` via
  `Intl.NumberFormat("fr-CA", { maximumFractionDigits: 3 })`, suffixed with
  ` %`) so `3,5 %`, `5 %`, `9,975 %` render from live settings.
- Keep the existing `formatRate` currency formatter.

### Step 3 — `apps/web/src/routes/contact/+page.svelte` (markup)

Replace the single-line estimate `<div data-testid="contact-estimate">…</div>` body
(keep the wrapper `div`, its `data-testid="contact-estimate"`, `role="status"`,
`aria-live="polite"`, and the `transition:fade`) with aligned rows:
- `estimate-base` — label «Base (N nuit(s) × R chambre(s) × X,XX $)», amount `formatRate(estimate.base)`.
- `estimate-hebergement` — label «Taxe d'hébergement (3,5 %)» using `formatPct(settings.accommodationTax)`, amount `formatRate(estimate.hebergementTax)`.
- `estimate-tps` — label «TPS (5 %)» using `formatPct(settings.tps)`, amount `formatRate(estimate.tps)`.
- `estimate-tvq` — label «TVQ (9,975 %)» using `formatPct(settings.tvq)`, amount `formatRate(estimate.tvq)`.
- `estimate-total` — bolder «Total estimé», amount `formatRate(estimate.total)`.

Each row: label on the left, amount on the right (flex `justify-content: space-between`).

### Step 4 — `apps/web/src/routes/contact/+page.svelte` (styles)

Add row styling under the existing `.page-contact__estimate` scope: a `dl`-like or
flex-row layout (`display: flex; justify-content: space-between; gap`), tabular-nums
amounts, a bolder total row (reuse `.page-contact__estimate-total` weight). Ensure
rows do not overflow at `<= 400px` (allow label wrap, keep amount right-aligned).
Remove the now-unused single-line inline styling only if orphaned.

### Step 5 — `apps/web/src/lib/__tests__/utils.test.ts` (helper tests)

Add a describe block for `estimateStay`:
- Default rates, base 100 (nights 1, rooms 1, rate 100): expect
  `base 100`, `hebergementTax 3.5`, `tps 5.18`, `tvq 10.84`, `total 119.52`, and assert
  `round2(base+heberg+tps+tvq) === total`.
- Multi-night/multi-room: e.g. nights 2, rooms 3, rate 89 with default rates —
  assert lines sum to total.
- Zero rates `{accommodationTax:0, tps:0, tvq:0}`: total === base.
- Zero nights (or zero rooms): every field `0`.
- Negative/NaN inputs: every field `0` (never negative/NaN).

### Step 6 — `apps/web/src/routes/__tests__/page-contact.test.ts` (page tests)

Add/extend tests asserting:
- With valid ordered dates and `roomCount >= 1`, `contact-estimate` renders and contains
  `estimate-base`, `estimate-hebergement`, `estimate-tps`, `estimate-tvq`, `estimate-total`.
- Percent labels reflect the settings-store rates (e.g. contains `3,5 %` / `5 %` / `9,975 %`).
- Without a valid stay (no dates, or `roomCount < 1`), `contact-estimate` is absent.
- The rate line (`contact-rate-line`) still renders unchanged.

## Acceptance Criteria

1. `estimateStay` is exported from `apps/web/src/lib/utils.ts` and imported/used by
   `apps/web/src/routes/contact/+page.svelte`.
2. For inputs `nights=1, rooms=1, nightlyRate=100, {accommodationTax:3.5, tps:5, tvq:9.975}`,
   `estimateStay` returns `{ base:100, hebergementTax:3.5, tps:5.18, tvq:10.84, total:119.52 }`,
   and `Math.round((base+hebergementTax+tps+tvq)*100)/100 === total`.
3. For zero-rate input, `total === base`; for `nights=0` or `rooms=0`, every field is `0`;
   for negative or `NaN` inputs, every field is `0` (never negative/NaN).
4. On the contact page, when both dates are set, in order, and `roomCount >= 1`, the
   block `data-testid="contact-estimate"` renders and contains rows with
   `data-testid` values `estimate-base`, `estimate-hebergement`, `estimate-tps`,
   `estimate-tvq`, `estimate-total`.
5. The `estimate-hebergement`, `estimate-tps`, `estimate-tvq` labels render the
   configured percentages from the settings store in fr-CA formatting
   (`3,5 %`, `5 %`, `9,975 %` with the defaults), not hardcoded strings.
6. When dates are missing/reversed or `roomCount < 1`, `data-testid="contact-estimate"`
   is not rendered.
7. The estimate updates live as `checkIn`, `checkOut`, or `roomCount` change (Svelte 5 `$derived`).
8. `npm run typecheck` passes.
9. All existing vitest suites pass, plus the new `estimateStay` helper tests and the
   updated contact page tests.
10. `npm run build:web` passes.
11. No change to any API endpoint, `apps/api/src/pricing.ts`, the admin `InvoiceCreator`,
    or any page other than the contact page and the `utils.ts` helper (+ their tests).
