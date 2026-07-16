# Invoice Cascade Alignment — System Design

## System Overview

Two independently-deployed Cloudflare services share a single tax convention. The
frontend SPA (`apps/web`) shows a public **estimate** for a stay via the pure helper
`estimateStay` in `apps/web/src/lib/utils.ts`. The backend Hono Worker (`apps/api`)
computes the authoritative **invoice** via `computeInvoice` in
`apps/api/src/pricing.ts`, called from the admin-gated
`POST /api/admin/reservations/:id/invoice` endpoint, then enqueues a HubSpot invoice
op with the resulting `amount`.

These two computations have diverged: `estimateStay` compounds the taxes (hébergement
first on base, TPS on base + hébergement, TVQ on base + hébergement + TPS), while
`computeInvoice` applies a flat `lodgingTax = base × (tps + tvq)/100` plus a flat
hébergement. This change makes `computeInvoice` mirror the `estimateStay` cascade
exactly, and threads the newly-separated `tps`/`tvq` breakdown fields through the API
type, the web client type, and the admin `InvoiceCreator` component.

## Architecture Decisions

- **AD-1 — Cascade lives server-side, unchanged shape at the endpoint.** The endpoint
  request/response envelope (`{ ok, breakdown }`) is preserved; only the `breakdown`
  object's tax fields change. This keeps the HTTP contract stable and avoids touching
  admin page wiring beyond the breakdown type.
- **AD-2 — `lodgingTax` becomes two fields, not a renamed one.** Splitting into `tps`
  and `tvq` is what makes the invoice transparent (four tax-line rows) and lets the
  compounding be verified line by line. There is no back-compat alias; every consumer
  (`api.ts`, `InvoiceCreator.svelte`) is updated in the same change.
- **AD-3 — Per-line rounding at each cascade step.** Each line rounds to cents with
  `Math.round(x * 100) / 100` *before* feeding the next line, identical to
  `estimateStay`. This guarantees the displayed lines sum exactly to the displayed
  total and that invoice and estimate agree to the cent.
- **AD-4 — No new props on `InvoiceCreator`.** The component has no tax-rate inputs
  today; adding them widens the surface for no functional gain. Tax rows render
  without percent labels, consistent with existing props.
- **AD-5 — Parity is guarded by a test, not shared code.** The two services deploy
  independently and cannot import each other; a parity test in the API suite pins the
  numeric agreement with `estimateStay`'s documented outputs.

## Component Responsibilities

| Component | Responsibility | Change |
|---|---|---|
| `apps/api/src/pricing.ts` | `computeInvoice` + `InvoiceBreakdown` type | Rewrite to cascade; `lodgingTax` → `tps` + `tvq` |
| `apps/api/src/index.ts` | Invoice endpoint; reads settings, calls `computeInvoice`, enqueues HubSpot op | No call-site change; returns new breakdown shape |
| `apps/web/src/lib/api.ts` | Client `InvoiceBreakdown` type + `adminCreateInvoice` | Update type only |
| `apps/web/src/lib/components/admin/InvoiceCreator.svelte` | Renders the breakdown ledger | Local type update + four cascade rows |
| `apps/api/test/pricing.test.ts` | Unit tests for pricing helpers | Add `computeInvoice` cascade/deposit/zero/parity tests |
| `apps/web/.../__tests__/InvoiceCreator.test.ts` | Component tests | Update fixture + row assertions |

## Data Flow

1. Admin submits the invoice form in `InvoiceCreator.svelte` → parent calls
   `adminCreateInvoice(reservationId, type, depositPercent?)` (`api.ts`).
2. `POST /api/admin/reservations/:id/invoice` (`index.ts`): validates the reservation,
   resolves `effectiveNightly` (`resolveEffectiveNightly`), reads `nights`
   (`nightsBetween`), and loads `tps`/`tvq`/`accommodationTax` rates from the
   `settings` table via `rowsToAdminSettings`.
3. `computeInvoice({ effectiveNightly, nights, roomCount, tps, tvq, accommodationTax, type, depositPercent })`
   returns the cascaded `InvoiceBreakdown`.
4. The Worker enqueues the HubSpot `invoice.create` op with `breakdown.amount`, then
   responds `{ ok: true, breakdown }`.
5. `InvoiceCreator.svelte` renders the ledger rows: Nuits, Chambres, Prix effectif /
   nuit, Sous-total, Taxe d'hébergement, TPS, TVQ, Total, Montant dû.

## Known Constraints

- **No shared module across services.** `apps/web` and `apps/api` are separate
  workspaces/deployables; the cascade logic is duplicated (helper vs. `computeInvoice`)
  and kept in sync by a parity test rather than code reuse.
- **Floating-point rounding is intentional and pinned.** Tests assert exact rounded
  values (e.g. `5.175 → 5.18`, `9.975%` of `108.68 → 10.84`), matching JS IEEE-754
  behavior; do not switch to `toBeCloseTo`.
- **No migration / no settings change.** Rates already live in the `settings` table
  with defaults (tps 5, tvq 9.975, accommodation_tax 3.5).
- **Out of scope:** the frontend `estimateStay` helper and contact page are untouched;
  the HubSpot enqueue payload shape is unchanged aside from `amount` reflecting the new
  total.
