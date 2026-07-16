# Invoice Cascade Alignment — Requirements

## In Scope

### Functional Requirements

- **FR-1 (MUST)** `computeInvoice` MUST compute `base = round2(effectiveNightly ×
  nights × roomCount)` where `round2(x) = Math.round(x × 100) / 100`.
- **FR-2 (MUST)** `computeInvoice` MUST compute the taxe d'hébergement first, on base:
  `accommodationTax = round2(base × accommodationTax% / 100)`.
- **FR-3 (MUST)** `computeInvoice` MUST compute `tps = round2((base + accommodationTax)
  × tps% / 100)` — TPS base includes the hébergement line.
- **FR-4 (MUST)** `computeInvoice` MUST compute `tvq = round2((base + accommodationTax
  + tps) × tvq% / 100)` — TVQ base includes both the hébergement line and the TPS line.
- **FR-5 (MUST)** `computeInvoice` MUST compute `total = round2(base + accommodationTax
  + tps + tvq)`, such that the rounded lines sum exactly to `total`.
- **FR-6 (MUST)** For `type: "deposit"`, `amount = round2(total × depositPercent / 100)`
  with `depositPercent` defaulting to `30`; for `type: "full"`, `amount = total`.
- **FR-7 (MUST)** The `InvoiceBreakdown` type in `apps/api/src/pricing.ts` MUST expose
  `{ nights, roomCount, effectiveNightly, base, accommodationTax, tps, tvq, total,
  amount }` and MUST NOT contain `lodgingTax`.
- **FR-8 (MUST)** The client `InvoiceBreakdown` type in `apps/web/src/lib/api.ts` MUST
  mirror the API type (contains `tps` and `tvq`, not `lodgingTax`).
- **FR-9 (MUST)** `InvoiceCreator.svelte` MUST render, after a successful invoice, the
  breakdown rows in cascade order: Sous-total, Taxe d'hébergement, TPS, TVQ, Total,
  Montant dû — with separate TPS and TVQ rows (no combined `TPS + TVQ` row).
- **FR-10 (MUST)** The invoice endpoint (`apps/api/src/index.ts`) MUST keep its
  request/response envelope (`{ ok: true, breakdown }`) and continue enqueuing the
  HubSpot op with `breakdown.amount`.
- **FR-11 (SHOULD)** A parity test SHOULD assert that `computeInvoice`'s outputs match
  the frontend `estimateStay` cascade for the same inputs, so the two remain in sync.

### Non-Functional Requirements

- **NFR-1** Rounding is deterministic and pinned to JS IEEE-754 semantics; tests assert
  exact rounded values (not approximate).
- **NFR-2** No new runtime dependencies; the change is pure arithmetic and type edits.
- **NFR-3** The HTTP contract stays backward-shaped at the envelope level; only the
  `breakdown` tax fields change.

## Out of Scope (Exclusions)

- No change to the frontend `estimateStay` helper (`apps/web/src/lib/utils.ts`) or the
  contact/reservation page.
- No change to the admin settings model, the `settings` table, or any migration.
- No change to the HubSpot enqueue payload shape (only `amount` naturally reflects the
  new total).
- No change to `ComputeInvoiceParams` (rate percentages, type, depositPercent unchanged).
- No new props on `InvoiceCreator`; percent labels are not rendered on tax rows.

## Acceptance Criteria

1. `npm run typecheck` exits 0 across all workspaces.
2. `computeInvoice({ effectiveNightly: 100, nights: 1, roomCount: 1, tps: 5, tvq: 9.975, accommodationTax: 3.5, type: "full" })` returns `accommodationTax === 3.5`, `tps === 5.18`, `tvq === 10.84`, `total === 119.52`, `amount === 119.52`.
3. The same params with `type: "deposit"`, `depositPercent: 30` (or omitted) yield `amount === 35.86`.
4. With `tps: 0, tvq: 0, accommodationTax: 0`, `computeInvoice(...).total === base` and `tps === 0`, `tvq === 0`, `accommodationTax === 0`.
5. For every `computeInvoice` result, `base + accommodationTax + tps + tvq === total`.
6. `grep` of `apps/api/src/pricing.ts` and `apps/web/src/lib/api.ts` shows `tps` and `tvq` in `InvoiceBreakdown` and no `lodgingTax`.
7. After a successful invoice, the `InvoiceCreator` breakdown tbody contains the text `TPS`, `TVQ`, and `Taxe d'hébergement`, and does not contain `TPS + TVQ`.
8. `npm run build:web` completes successfully.
9. All vitest suites pass, including the new `computeInvoice` cascade/deposit/zero-rate/parity tests and the updated `InvoiceCreator` breakdown test.
