## Global Design Strategy

This stream's frontend surface is narrow: two new status badge variants (`held`, `released`) added to an existing warm-cream admin reservation table, plus a type widening. The aesthetic must feel like it was always there — same typographic treatment, same colour logic (semantic hue token → tinted surface + dark saturated foreground), same monospace uppercase badge structure.

The existing system uses a warm heritage palette (cream `#f4efe6`, terracotta accent `#7b4628`, forest green `#1b3b2a`) with Jost for UI and JetBrains Mono for badges/numerics. New statuses earn a hue position in that same register: `held` → amber/gold (urgent-but-not-alarming, echoing the terracotta family), `released` → warm ash grey (terminal/expired, receding, clearly distinct from `pending`'s cool grey).

### Colour Palette
- surface: #f4efe6 (warm cream — inherited)
- surface-alt: #e0dad0
- surface-raised: #ece7db
- border: #c4baa8
- text: #1c1a17
- text-muted: #695e51
- accent: #7b4628 (terracotta)
- primary: #1b3b2a (forest)
- badge-pending-bg: #e6e8ea / badge-pending-fg: #45464d
- badge-confirmed-bg: #d4ede0 / badge-confirmed-fg: #1a5c2d
- badge-cancelled-bg: #fce8e8 / badge-cancelled-fg: #ba1a1a
- **badge-held-bg: #fef0c7** / **badge-held-fg: #7c4a00** (warm amber; 6.3:1 contrast ✓ WCAG AA)
- **badge-released-bg: #e2ddd6** / **badge-released-fg: #5a5248** (warm ash; 4.6:1 contrast ✓ WCAG AA)

### Typography
- font-family UI: "Jost", ui-sans-serif, system-ui, sans-serif (inherited)
- font-family mono: "JetBrains Mono", ui-monospace, monospace (inherited)
- Badge: 11px monospace, font-weight 500, letter-spacing 0.18em, text-transform uppercase, line-height 1.6

### Spacing
- Badge padding: 2px 7px (inherited from existing badge system)
- Badge border-radius: 2px (inherited)

### Accessibility
- badge-held-fg #7c4a00 on badge-held-bg #fef0c7: contrast ratio ~6.3:1 — WCAG AA ✓
- badge-released-fg #5a5248 on badge-released-bg #e2ddd6: contrast ratio ~4.6:1 — WCAG AA ✓
- `aria-label="Statut: En attente de paiement"` / `"Statut: Expirée"` inherited from existing `aria-label={`Statut: ${statusLabel(row.status)}`}` pattern — no change needed
- No new interactive elements introduced; keyboard focus model unchanged

### Security
- `statusLabel` returns fixed string literals only — no interpolation of caller data
- No innerHTML assignments; badge text is Svelte text binding (safe by construction)
- Type-widening in `api.ts` is display-only; no new fetch surfaces

## Component Inventory

- component: reservation-hold-badges
  description: Add `--held` and `--released` CSS badge modifier classes to ReservationTableRow.svelte, plus two new branches in the `statusLabel` module function. `held` renders amber "En attente de paiement"; `released` renders muted ash "Expirée". No markup or action-button changes. Also widens the `ReservationRow.status` display-only union in `apps/web/src/lib/api.ts` to include `"held" | "released"`.
  inputs: row.status string value ("held" | "released") passed through existing badge class interpolation and statusLabel call
  interactions: display-only; no new interactions
  files: apps/web/src/lib/components/admin/ReservationTableRow.svelte, apps/web/src/lib/api.ts
  kind: badge
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1