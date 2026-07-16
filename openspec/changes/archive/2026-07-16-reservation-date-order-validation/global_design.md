## Global Design Strategy

This change is surgical: one new inline error display and a `min` binding on an existing date input inside an already-styled Svelte form. The design goal is **seamless integration** — the new error state must feel like it was always there, consistent with the auberge's existing warm, hospitality-first aesthetic rather than introducing any new visual language.

**Aesthetic direction — Warm Provençal correction**: error messages read like a gentle note from the innkeeper, not a system alarm. The existing form already uses a `page-contact__field-error` class and a `role="alert"` / `aria-describedby` pattern (visible on the `firstName`, `lastName`, and `email` fields). This change must mirror that pattern exactly on the `checkOut` field, differing only in its trigger condition. The visual vocabulary is already set: the only design question is tone — and the answer is "warm terracotta, never harsh red".

### Colour Palette
- `primary`: #7c4a2d — warm chestnut, anchors the brand
- `surface`: #fdf8f2 — aged parchment, form background
- `surface-raised`: #f5ede0 — light terracotta wash, card/section background
- `border`: #d4b896 — warm sand, input borders
- `text`: #2c1a0e — deep espresso, all body copy
- `label`: #5a3e2b — mid-chestnut, form labels
- `error`: #b94a2c — terracotta red (contrast ratio ≥ 4.5:1 on `surface` and `surface-raised`)
- `error-surface`: #fdf0eb — blush wash, error message background tint
- `error-border`: #d4724a — warm ember, left-border accent on error block
- `success`: #3d6b47 — forest green
- `accent`: #7c4a2d

### Typography
- `font-family-display`: Cormorant Garamond, Georgia, serif — used for section headings
- `font-family-ui`: DM Sans, system-ui, sans-serif — used for labels, inputs, error messages
- `base-size`: 15px; `line-height`: 1.55
- `error-size`: 13px; `error-weight`: 500; `error-line-height`: 1.4

### Spacing
- `base unit`: 4px; scale: `xs`=4px `sm`=8px `md`=12px `lg`=16px `xl`=24px `2xl`=32px
- Error block: `margin-top: sm (8px)`, `padding: xs sm (4px 8px)`, left-border `3px solid error-border`

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) for `error` (#b94a2c) on `surface` (#fdf8f2) — verified
- `role="alert"` on error `<span>` so screen readers announce immediately on appearance
- `aria-describedby` on the checkout `<input>` pointing to the error span's `id` (`err-checkout`) when the error is present, `undefined` otherwise — matching the pattern at lines 206, 232, 261
- `min` attribute on checkout input constrains the native date-picker calendar to prevent selecting invalid dates before submission
- Error span uses `id="err-checkout"` and `data-testid="error-checkout"` for consistency with existing fields
- Svelte `fade` transition (`duration: 150`) on error appearance, matching the email field's transition at line 250
- Keyboard navigation: the date inputs remain in natural tab order; no new interactive elements are added

### Security
- No `innerHTML` — error message is a static French string rendered as text content inside a `<span>`
- The `min` attribute is derived from `form.checkIn`, a user-controlled string; it does not bypass the server-side `superRefine` check which remains the authoritative guard
- No eval, no dynamic code execution

## Component Inventory

- component: date-range-field
  description: Two-column responsive date-input row (arrivée + départ) inside the reservation form. The départ input gains a `min` attribute bound to the current arrivée value and an inline French error span (`role="alert"`) that appears when `fieldErrors.checkOut` is set — styled with a terracotta left-border accent and a Svelte `fade` transition, mirroring the existing `page-contact__field-error` pattern used on firstName/lastName/email.
  inputs: form.checkIn (string), form.checkOut (string), fieldErrors.checkOut (string | undefined)
  interactions: min attribute constrains the native date picker calendar; error span fades in/out reactively when fieldErrors.checkOut changes; no other interactions
  kind: field
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2