## Global Design Strategy

This is an **extension** of an existing refined, warm-auberge aesthetic — not a new direction. The estimate breakdown must feel native to the form card: same tokens, same rhythm, same mono/sans pairing. The design metaphor is a **refined tax receipt** embedded inline — trustworthy, legible, and warm rather than cold-administrative.

Key differentiator: the three tax rows are visually subordinate to the base (slightly softer ink, same left margin) so guests read the cascade naturally — base → taxes stacking on top → bold conclusive total. A thin ember-warm hairline above the total echoes the site's `--color-ember` success accent and signals "summation".

### Colour Palette
- surface: `var(--color-surface)` — page background (light)
- surface-container-low: `var(--color-surface-container-low, #f2f4f6)` — estimate panel fill
- surface-container-lowest: `var(--color-surface-container-lowest)` — form card fill
- border: `var(--color-outline-variant, #c6c6cd)` — row separators and panel border
- text-primary: `var(--color-ink, #191c1e)` — base row label and total
- text-secondary: `var(--color-ink-soft)` — tax row labels
- text-muted: `var(--color-ink-mute, var(--color-ink-soft))` — percent badges / footnotes
- accent-total-rule: `var(--color-ember)` — 2px rule above the total row (warm summation signal)
- accent-focus: `var(--color-terracotta)` — focus ring (unchanged from existing)

### Typography
- Label font: `var(--font-mono)` — 12px, normal weight, for tax row labels (matches `page-contact__hour-row dt`)
- Amount font: `var(--font-mono)` — 13px, `font-variant-numeric: tabular-nums` (right-aligned)
- Base row label: `var(--font-sans)` — 13px, normal weight, `var(--color-ink)` (slightly more prominent than tax sub-rows)
- Total label: `var(--font-sans)` — 14px, weight 600, `var(--color-ink)` (conclusive)
- Total amount: `var(--font-mono)` — 16px, weight 600, `font-variant-numeric: tabular-nums` (matches existing `.page-contact__estimate-total`)

### Spacing
- Inherits site scale — `--space-xs`=4px `--space-sm`=8px `--space-md`=12px `--space-lg`=16px
- Panel padding: `var(--space-md) var(--space-lg)` (unchanged from existing `.page-contact__estimate`)
- Row padding: `var(--space-sm) 0` (matches `page-contact__hour-row`)
- Row gap: 0 (borders provide rhythm)
- Total row top-margin: 0; uses `border-top: 2px solid var(--color-ember)` as separator

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) — `var(--color-ink-soft)` on `--color-surface-container-low` must meet this; percent labels use ink-soft only when site tokens are WCAG-compliant (verified by existing usage)
- `role="status"` and `aria-live="polite"` on the outer wrapper — already present, preserved
- `data-testid` on every row for test assertions
- Amount column right-aligned via flex, not visually-only floats — screen-reader traversal order: label then amount
- `<dl>`/`<dt>`/`<dd>` semantics — `<dt>` for label, `<dd>` for amount — matches the existing `page-contact__hours` pattern and provides machine-readable label/value pairs
- No color-only differentiation — total row uses weight AND ember rule, not color alone

### Security
- No innerHTML — all values via Svelte text interpolation (`{}`)
- All amounts computed by the pure `estimateStay()` helper; no eval, no dynamic code
- `formatRate` and `formatPct` use `Intl` APIs, no string concatenation into DOM

## Component Inventory

- component: estimate-helper
  description: Pure TypeScript function estimateStay() and its types (StayTaxRates, StayEstimate) added to apps/web/src/lib/utils.ts, plus vitest unit tests in apps/web/src/lib/__tests__/utils.test.ts covering rounding, zero-rate, zero-night, and negative/NaN guards
  inputs: nights (number), rooms (number), nightlyRate (number), rates (StayTaxRates)
  interactions: none — pure function, no side effects
  kind: utility
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none

- component: estimate-breakdown
  description: Replaces the single-line estimate block in apps/web/src/routes/contact/+page.svelte with a dl-based five-row breakdown (base, hébergement tax, TPS, TVQ, total) driven by $derived estimateStay(); adds formatPct() fr-CA percent formatter; styles extend .page-contact__estimate with row flex layout, tabular-nums amounts, ember-ruled total; also adds/extends page-contact.test.ts assertions for all five data-testid rows and percent label content
  inputs: $derived estimate (StayEstimate), settings.accommodationTax, settings.tps, settings.tvq, nights, rooms, nightlyRate (all already in scope as $derived)
  interactions: updates live on checkIn / checkOut / roomCount change via Svelte 5 $derived; fades in/out via existing transition:fade when estimateVisible changes
  kind: section
  depends_on: [estimate-helper]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2