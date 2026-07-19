## Global Design Strategy

This stream is a targeted enhancement within an already-defined warm-hospitality admin design language. The palette, typography, and spacing are inherited from the existing `ReservationTableRow.svelte` design system — no new design tokens are introduced. The goal is to replace wordy text-label buttons with precise artisan stamp-mark icons that feel native to the existing language: parchment backgrounds, forest green for affirmative actions, terracotta for focus rings, and error red for destructive actions. Icon buttons should read like hand-tool impressions — compact, intentional, and quiet.

### Colour Palette
- surface: #f4efe6 (parchment — inherited row background)
- surface-alt: #e0dad0 (even-row stripe)
- surface-raised: #ece7db (hover row bg)
- border: #c4baa8 / border-strong: #9a8e7e
- text: #1c1a17 / text-muted: #695e51
- color-forest: #1a5c2d (confirm button ink + badge fg)
- color-forest-surface: #d4ede0 (confirm button hover fill)
- color-error: #ba1a1a (cancel button ink + badge fg)
- color-error-surface: #fce8e8 (cancel button hover fill)
- accent / focus-ring: #7b4628 (terracotta — all `:focus-visible` outlines)
- badge-pending: bg #e6e8ea / fg #45464d
- badge-confirmed: bg #d4ede0 / fg #1a5c2d
- badge-cancelled: bg #fce8e8 / fg #ba1a1a

### Typography
- font-family UI: "Jost", ui-sans-serif, system-ui, sans-serif
- font-family mono: "JetBrains Mono", ui-monospace, monospace
- base size: 14px; line-height: 1.4
- badge: 11px, letter-spacing 0.18em, uppercase, monospace

### Spacing
- base unit: 4px; scale: xs=4px sm=6px md=8px lg=10px xl=12px 2xl=16px 3xl=24px
- icon button: 28×28px hit target, padding 6px around a 14–16px SVG icon
- action gap: 6px between confirm and cancel buttons

### Icon Specification
- SVG viewBox="0 0 14 14", intrinsic width/height 14px
- stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
- aria-hidden="true" focusable="false" on every `<svg>`
- Confirm (checkmark): `M 2 7.5 L 5.5 11 L 12 3` — classic asymmetric sweep, heavier descender
- Cancel (X): `M 2.5 2.5 L 11.5 11.5 M 11.5 2.5 L 2.5 11.5` — precise diagonal cross
- Button container: 28×28px, border 1.5px solid, border-radius 2px, outline style → fill-on-hover; no text-transform or letter-spacing (icon-only)

### Accessibility
- minimum contrast ratio: 4.5:1 WCAG AA (forest #1a5c2d on #d4ede0 = 5.2:1; error #ba1a1a on #fce8e8 = 4.6:1; both pass)
- keyboard navigation: all buttons reachable via Tab; `:focus-visible` ring 2px solid #7b4628, offset 2px
- ARIA roles required:
  - each `<button>` keeps its existing `aria-label` ("Confirmer la réservation" / "Annuler la réservation"); the SVG is decorative and must carry `aria-hidden="true"` since the label is on the parent button
  - `role="group"` + `aria-label` on the actions wrapper div is unchanged
  - per-status `{#if}` visibility guards unchanged — only the applicable button renders in the DOM
- no visible text node inside either button (icon-only)

### Security
- No innerHTML — SVG is static markup in the template, not dynamically injected
- No eval() or Function() usage
- No user-supplied content rendered in icon buttons — purely decorative, statically authored SVG

## Component Inventory

- component: reservation-action-icons
  description: Inline-SVG icon action buttons (confirm=checkmark, cancel=X) within the ReservationTableRow actions cell, replacing the existing text-label buttons. Preserves aria-label, data-testid, per-status visibility guards, setStatus handlers, and stopPropagation. Button sizing adjusted to 28×28px square hit target; existing --color-forest and --color-error tokens drive ink and hover-fill colours unchanged.
  inputs: row.status (drives per-{#if} guard), onSetStatus callback, row.id
  interactions: click → setStatus(e, "confirmed" | "cancelled") with stopPropagation; focus-visible ring on keyboard nav; hover fills button bg with forest-surface or error-surface
  kind: button
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2