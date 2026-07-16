## Global Design Strategy

This task is a financial-logic alignment with a minimal UI surface: one ledger table in `InvoiceCreator.svelte` gains two separated tax rows (TPS, TVQ) in place of a combined row. The visual design is already fully established — warm parchment inn aesthetic with Cormorant Garamond / Jost / JetBrains Mono typography — and the new rows must slot in invisibly, reusing existing ledger markup with zero CSS changes. The design strategy is therefore **surgical consistency**: every deliverable must feel like it was always there.

### Colour Palette
- primary: #1b3b2a (deep forest green, header background)
- surface: #f4efe6 (warm parchment, page background)
- surface-raised: #ece7db (card/panel surface)
- surface-sunken: #e0dad0 (alternating row / sunken inputs)
- border: #c4baa8
- border-strong: #9a8e7e
- text: #1c1a17
- text-muted: #695e51
- text-faint: #9a8e7e
- accent: #7b4628 (terracotta, CTA buttons)
- accent-hover: #6a3a20
- danger: #8a2828
- primary-text: #f4efe6

### Typography
- display: "Cormorant Garamond", Georgia, serif — headings, panel titles
- body: "Jost", ui-sans-serif, system-ui, sans-serif — labels, controls, UI copy
- mono: "JetBrains Mono", ui-monospace, monospace — all numeric/currency values
- base size: 13–14px; line-height: 1.4–1.6
- ledger label: 13px Jost, color text-muted; ledger value: 13px JetBrains Mono, text-align right

### Spacing
- base unit: 4px; scale: xs=4px sm=8px md=12px lg=16px xl=24px
- ledger cell padding: 8px 12px (label) / 8px 16px (value) — unchanged from existing

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA); all existing colour pairs meet this
- keyboard navigation: all interactive elements reachable via Tab; breakdown toggle uses `aria-expanded`
- ARIA roles for affected components:
  - `invoice-creator-breakdown`: `role="region"` with `aria-label="Créer une facture"` (existing); `<table>` with `<caption>` for screen-reader; each `<tr>` identified by row label text
  - New TPS / TVQ rows use identical `<tr><td class="ic-cell-label">...</td><td class="ic-cell-value">...</td></tr>` markup — no new ARIA needed

### Security
- All currency values pass through `Intl.NumberFormat` (`formatCurrency`) before DOM insertion — no raw server values reach innerHTML
- No `innerHTML` assignments; no `eval()` or `Function()`
- `lodgingTax` removal must be complete: no residual reads from server-supplied `breakdown` object

## Component Inventory

- component: compute-invoice-cascade
  description: Rewrite computeInvoice in pricing.ts to the exact compounding cascade (base → accommodationTax → tps → tvq → total), update InvoiceBreakdown interface to replace lodgingTax with tps + tvq
  inputs: ComputeInvoiceParams (effectiveNightly, nights, roomCount, tps, tvq, accommodationTax, type, depositPercent)
  interactions: pure function, no UI; financial correctness is the only criterion
  kind: panel
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 2

- component: invoice-type-sync
  description: Update InvoiceBreakdown interface in apps/web/src/lib/api.ts to mirror the API change — remove lodgingTax, add tps and tvq in the correct field order
  inputs: updated InvoiceBreakdown wire shape from the API
  interactions: type-only change; no runtime behaviour
  kind: panel
  depends_on: [compute-invoice-cascade]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: 1

- component: invoice-creator-breakdown
  description: Update InvoiceCreator.svelte — remove lodgingTax from local InvoiceBreakdown type, update the rows derived array to emit four separate cascade rows (Taxe d'hébergement, TPS, TVQ each as individual ledger rows) reusing existing ic-cell-label/ic-cell-value markup with no CSS changes
  inputs: updated InvoiceBreakdown shape (tps, tvq, accommodationTax); no new props
  interactions: display-only; breakdown toggle and confirm flow unchanged
  kind: panel
  depends_on: [invoice-type-sync]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: pricing-tests
  description: New describe("computeInvoice") block in apps/api/test/pricing.test.ts covering cascade correctness, line-sum invariant, deposit rounding, zero-rate edge case, and parity with estimateStay
  inputs: computeInvoice import; exact expected values from SPEC (accommodationTax=3.5, tps=5.18, tvq=10.84, total=119.52, deposit amount=35.86)
  interactions: vitest test suite; no UI
  kind: panel
  depends_on: [compute-invoice-cascade]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 2

- component: invoice-creator-tests
  description: Update breakdown fixture in apps/web/src/lib/components/admin/__tests__/InvoiceCreator.test.ts — remove lodgingTax, add tps/tvq; extend test to assert TPS, TVQ, Taxe d'hébergement rows are present and TPS + TVQ row is absent
  inputs: updated InvoiceBreakdown fixture; existing test harness (vitest + @testing-library/svelte)
  interactions: vitest test suite; no UI
  kind: panel
  depends_on: [invoice-creator-breakdown]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1