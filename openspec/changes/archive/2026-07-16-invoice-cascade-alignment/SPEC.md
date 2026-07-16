# Invoice Cascade Alignment

## Task

The public reservation estimate (`apps/web/src/lib/utils.ts` → `estimateStay`) applies
an owner-specified **compounding** tax cascade, while the admin invoice
(`apps/api/src/pricing.ts` → `computeInvoice`) still uses an **old flat** model. For
the same stay the invoice therefore totals slightly less than the quoted estimate.

Rework `computeInvoice` to the exact cascade so the API invoice and the frontend
estimate produce identical totals, and surface the newly separated tax lines
(TPS and TVQ) through the API type, the web client type, and the admin
`InvoiceCreator` breakdown display.

**The cascade (each line rounded to cents with `Math.round(x * 100) / 100`):**

1. `base` = `effectiveNightly × nights × roomCount`
2. `accommodationTax` (taxe d'hébergement) = `base × accommodationTax% / 100`
3. `tps` = `(base + accommodationTax) × tps% / 100`
4. `tvq` = `(base + accommodationTax + tps) × tvq% / 100` — TVQ base **includes** the TPS line
5. `total` = `base + accommodationTax + tps + tvq`

Deposit logic is unchanged: for `type: "deposit"`, `amount = round2(total × depositPercent / 100)`,
`depositPercent` default `30`; for `type: "full"`, `amount = total`.

## Schema Changes

None. No database migration. The `settings` table already stores `tps`, `tvq`, and
`accommodation_tax`, and the invoice endpoint already reads them via
`rowsToAdminSettings`.

## API Types

### `InvoiceBreakdown` (before → after)

The combined `lodgingTax` field is **replaced** by separate `tps` and `tvq` fields.
`accommodationTax` is retained (the hébergement line, now computed first on base).

```ts
// BEFORE
interface InvoiceBreakdown {
  nights: number;
  roomCount: number;
  effectiveNightly: number;
  base: number;
  lodgingTax: number;        // removed
  accommodationTax: number;
  total: number;
  amount: number;
}

// AFTER
interface InvoiceBreakdown {
  nights: number;
  roomCount: number;
  effectiveNightly: number;
  base: number;
  accommodationTax: number;  // taxe d'hébergement, base × accommodationTax% / 100
  tps: number;               // (base + accommodationTax) × tps% / 100
  tvq: number;               // (base + accommodationTax + tps) × tvq% / 100
  total: number;             // base + accommodationTax + tps + tvq
  amount: number;            // total, or round2(total × depositPercent/100) for deposits
}
```

`ComputeInvoiceParams` is **unchanged** (already carries `tps`, `tvq`,
`accommodationTax` rate percentages, `type`, `depositPercent`).

### Endpoint contract (unchanged shape)

`POST /api/admin/reservations/:id/invoice` — request body `{ type, depositPercent? }`
and the top-level response envelope `{ ok: true, breakdown }` are unchanged. Only the
`breakdown` object's tax fields change (`lodgingTax` → `tps` + `tvq`).

## Implementation Steps

### Step 1 — `apps/api/src/pricing.ts`

- Update the `InvoiceBreakdown` interface: remove `lodgingTax`, add `tps` and `tvq`
  (field order: `base`, `accommodationTax`, `tps`, `tvq`, `total`, `amount`).
- Rewrite `computeInvoice` body to the cascade, rounding each line to cents:
  - `base = round2(effectiveNightly * nights * roomCount)`
  - `accommodationTax = round2(base * params.accommodationTax / 100)`
  - `tps = round2((base + accommodationTax) * params.tps / 100)`
  - `tvq = round2((base + accommodationTax + tps) * params.tvq / 100)`
  - `total = round2(base + accommodationTax + tps + tvq)`
- Deposit branch unchanged: `amount = round2(total * (depositPercent ?? 30) / 100)`
  when `type === "deposit"`, else `amount = total`.
- Return `{ nights, roomCount, effectiveNightly, base, accommodationTax, tps, tvq, total, amount }`.
- Keep using the existing `Math.round(x * 100) / 100` idiom (may extract a small
  local `round2` for readability); do not introduce new dependencies.

### Step 2 — `apps/api/src/index.ts`

- The invoice endpoint already passes `tps`, `tvq`, `accommodationTax` rates into
  `computeInvoice` and returns `{ ok: true, breakdown }`. No call-site parameter
  change is needed; the returned `breakdown` now carries `tps`/`tvq` instead of
  `lodgingTax`. Confirm no other code in the file reads `breakdown.lodgingTax`.
- The HubSpot enqueue payload continues to use `breakdown.amount`; the amount now
  reflects the cascaded total. No payload-shape change.

### Step 3 — `apps/web/src/lib/api.ts`

- Update the client `InvoiceBreakdown` interface to mirror the API: remove
  `lodgingTax`, add `tps` and `tvq` in the same field order.
- No change to `adminCreateInvoice` signature or the request/response envelope.

### Step 4 — `apps/web/src/lib/components/admin/InvoiceCreator.svelte`

- Update the local `InvoiceBreakdown` type (module script) to match: remove
  `lodgingTax`, add `tps` and `tvq`.
- In the `rows` derived array, replace the single `{ label: "TPS + TVQ", value: lodgingTax }`
  row plus the existing `Taxe d'hébergement` row with four cascade-ordered rows after
  `Sous-total` (base):
  - `Sous-total` → `formatCurrency(breakdown.base)` (unchanged)
  - `Taxe d'hébergement` → `formatCurrency(breakdown.accommodationTax)`
  - `TPS` → `formatCurrency(breakdown.tps)`
  - `TVQ` → `formatCurrency(breakdown.tvq)`
  - `Total` (preTotal) and `Montant dû` (final) unchanged.
- Percent labels: the component has no tax-rate props today. Keep it simple and
  consistent with existing props — render the labels **without** percentages
  (`TPS`, `TVQ`, `Taxe d'hébergement`). Do **not** add new props.
- No CSS/style changes required; the new rows reuse the existing ledger row markup.

### Step 5 — `apps/api/test/pricing.test.ts`

- Import `computeInvoice` from `../src/pricing`.
- Add a `describe("computeInvoice")` block asserting:
  - Cascade with default rates and `base = 100` (effectiveNightly 100, nights 1,
    roomCount 1, tps 5, tvq 9.975, accommodationTax 3.5, type "full"):
    `accommodationTax === 3.5`, `tps === 5.18`, `tvq === 10.84`, `total === 119.52`,
    `amount === 119.52`.
  - The returned lines sum exactly to `total`
    (`base + accommodationTax + tps + tvq === total`).
  - Deposit: same params with `type: "deposit"`, `depositPercent: 30` →
    `amount === 35.86` (`round2(119.52 * 0.30)`); default deposit (omit
    `depositPercent`) also yields `35.86`.
  - Zero-rate case: `tps 0`, `tvq 0`, `accommodationTax 0` → `total === base`,
    and `tps`, `tvq`, `accommodationTax` all `0`.
  - Parity: assert the cascade outputs equal the values `estimateStay` would produce
    for the same inputs (base 100, hébergement 3.5, tps 5.18, tvq 10.84, total 119.52),
    documenting that invoice and estimate stay in sync.

### Step 6 — `apps/web/src/lib/components/admin/__tests__/InvoiceCreator.test.ts`

- Update the `breakdown` fixture: remove `lodgingTax`, add `tps` and `tvq`
  (any internally consistent cascade; the existing test only asserts `amount`
  formatting, so keep `amount` a valid number).
- Extend the breakdown-render test to assert the tbody contains `TPS`, `TVQ`, and
  `Taxe d'hébergement` rows and no longer contains `TPS + TVQ`.

## Acceptance Criteria

1. `npm run typecheck` exits 0 across all workspaces.
2. `computeInvoice({ effectiveNightly: 100, nights: 1, roomCount: 1, tps: 5, tvq: 9.975, accommodationTax: 3.5, type: "full" })` returns `accommodationTax === 3.5`, `tps === 5.18`, `tvq === 10.84`, `total === 119.52`, and `amount === 119.52`.
3. For the same params with `type: "deposit"` and `depositPercent: 30` (or omitted), `computeInvoice(...).amount === 35.86`.
4. With `tps: 0, tvq: 0, accommodationTax: 0`, `computeInvoice(...).total` equals `base` and `tps`, `tvq`, `accommodationTax` are all `0`.
5. In every `computeInvoice` result, `base + accommodationTax + tps + tvq === total`.
6. The `InvoiceBreakdown` interface in `apps/api/src/pricing.ts` and in `apps/web/src/lib/api.ts` contains fields `tps` and `tvq` and does **not** contain `lodgingTax`.
7. `InvoiceCreator.svelte` renders separate `TPS`, `TVQ`, and `Taxe d'hébergement` breakdown rows (no `TPS + TVQ` row) after a successful invoice creation.
8. `npm run build:web` completes successfully.
9. All existing and new vitest suites pass, including `apps/api/test/pricing.test.ts` (computeInvoice cascade, deposit, zero-rate, parity) and the updated `InvoiceCreator` breakdown test.
