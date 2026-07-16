## Global Design Strategy

This is a **surgical bug-fix and consolidation** task on an existing "Industrial Zen" design system — the palette, typography, spacing, and motion are already defined and authoritative. The work is (a) removing price markup from `RoomCard`, (b) adding a single consolidated price display to the home-page rooms section header, (c) logic-only patches to `UserPricingForm` and `connexion`, and (d) backend + test coverage. The visual design task is narrow: produce one new element (`home-price-display`) that is indistinguishable from the surrounding Industrial Zen language.

### Colour Palette
- primary: #191c1e (ink — WCAG AAA on all surfaces)
- surface: #f7f9fb (cool light ground)
- surface-2: #f2f4f6 (card background)
- surface-3: #eceef0 (sunken)
- border: #c6c6cd (hairline / outline-variant)
- text: #191c1e (ink)
- text-soft: #45464d (ink-soft)
- text-muted: #76777d (ink-mute)
- accent: #9d4300 (terracotta — primary accent)
- accent-bright: #fd761a (hover / strong)
- ember: #ffb690 (badge background warm)
- ember-pale: #ffdbca (badge background light)
- charcoal: #2d3133 (dark surface — CTA panels)
- charcoal-on: #eff1f3 (text on dark)
- error: #ba1a1a

### Typography
- font-sans: IBM Plex Sans, IBM Plex Sans Fallback, ui-sans-serif (body, UI)
- font-mono: IBM Plex Mono, ui-monospace (technical labels, numbers, price amounts)
- font-serif: IBM Plex Serif, ui-serif (admin card headers — Cormorant Garamond used in UserPricingForm)
- base size: 16px; line-height: 1.65
- tech-label utility: mono, uppercase, letter-spacing 0.18em, 11px, weight 500
- price display: IBM Plex Mono, 20px, weight 600, color terracotta #9d4300
- badge: IBM Plex Mono or IBM Plex Sans, 11px, uppercase, letter-spacing 0.06em

### Spacing
- base unit: 4px
- xs: 0.5rem (8px)
- sm: 0.75rem (12px)
- md: 1.25rem (20px)
- lg: 2rem (32px)
- xl: 3rem (48px)
- 2xl: 4.5rem (72px)
- 3xl: 6rem (96px)

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) — all token combinations verified against existing palette
- keyboard navigation: all interactive elements reachable via Tab; focus ring uses `outline: 2px solid var(--color-terracotta)` at 2px offset
- ARIA roles required:
  - home-price-display: `aria-label="Prix par nuit"` on the price container; `data-testid="price-amount"` on the amount `<span>`; `data-testid="custom-pricing-badge"` on the conditional badge
  - room-card-cleanup: no new ARIA — existing `article[data-testid="room-card"]`, `data-testid="room-card-name"`, `data-testid="room-card-description"` are preserved
  - user-pricing-form-coercion: no markup change; existing `role="group"`, `role="status"`, `aria-live="polite"` preserved intact
  - connexion-auth-fix: no markup change
  - test files: no ARIA requirements

### Security
- No innerHTML assignments — textContent / Svelte template interpolation only
- No eval() or dynamic Function()
- Price amounts rendered via `{value.toFixed(2)}` — not innerHTML
- `toNumberOrNull` helper uses `Number()` coercion, not `eval` or `parseFloat` with side-effects

## Component Inventory

- component: api-numeric-normalizer
  description: Add `toNumberOrNull` helper to `apps/api/src/pricing.ts` and apply it at every DB-read boundary in `index.ts` where `discount_percent` or `fixed_nightly_price` are serialized — ensuring `GET /api/auth/me`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/pricing`, and the invoice pricing lookup all return numbers (not strings) for those two columns.
  inputs: Postgres NUMERIC column values (`string | null` from the driver), `null`, `undefined`
  interactions: none (API boundary only — no UI)
  kind: api
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: user-pricing-form-coercion
  description: Defensive coercion in `apps/web/src/lib/components/admin/UserPricingForm.svelte` — coerce `initialDiscount` / `initialFixed` through `Number()` (preserving `null → null`) before seeding `$state` and calling `initialPricingMode`, so that a string prop like `"10.00"` yields a working preview. No markup or style changes.
  inputs: `initialDiscount?: number | string | null`, `initialFixed?: number | string | null`
  interactions: none (logic-only patch)
  kind: panel
  depends_on: [api-numeric-normalizer]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: connexion-auth-fix
  description: In `apps/web/src/routes/connexion/+page.svelte`, replace both `setUser(result.user)` call sites (in `handleLogin` and `handleRegister`) with `await loadAuth()`, and remove the now-unused `setUser` import — so `auth.user` carries a freshly computed `effectiveNightlyPrice` before navigating to `/profil`.
  inputs: result of `POST /api/auth/login` or `POST /api/auth/register`
  interactions: none (no markup change; auth state flows into `auth.user` reactive store)
  kind: page
  depends_on: [api-numeric-normalizer]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: room-card-cleanup
  description: Remove the price block from `apps/web/src/lib/components/RoomCard.svelte` — delete `.room-card-effective-price`, `.price-display`, `.price-amount`, `.price-label`, `.custom-pricing-badge` markup and their associated `$derived` values (`displayPrice`, `showCustomBadge`) plus the `settings` and `auth` imports. Remove the corresponding CSS rules. Keep image, name, and description intact.
  inputs: `room: { name, description, imgKey, picsumSeed }`
  interactions: hover lift / image scale (preserved)
  kind: card
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: home-price-display
  description: Single consolidated price display added to the rooms section of `apps/web/src/routes/+page.svelte`, positioned between the `<h2>` and the rooms grid. Shows `$XX.XX /nuit` using IBM Plex Mono for the amount and a muted IBM Plex Sans `/nuit` label; includes a `Tarif personnalisé` badge (ember-pale background, terracotta text, 1px hairline border, mono uppercase) visible only when `auth.user?.effectiveNightlyPrice` differs from `settings.nightlyPrice`. Mirrors the Industrial Zen price language from `page-le-site__price` but as a standalone block element. Must not overflow at ≤320px.
  inputs: `auth.user?.effectiveNightlyPrice` (number | undefined), `settings.nightlyPrice` (number)
  interactions: purely reactive display; no user interaction
  kind: section
  depends_on: [room-card-cleanup]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: api-unit-tests
  description: New `apps/api/test/pricing.test.ts` with focused unit tests for `toNumberOrNull` (string→number, integer-string, null, undefined) and for `resolveEffectiveNightly` fed through `toNumberOrNull` to prove string inputs no longer defeat discount/fixed-price computation.
  inputs: `toNumberOrNull`, `resolveEffectiveNightly` from `apps/api/src/pricing.ts`
  interactions: none (test file)
  kind: test
  depends_on: [api-numeric-normalizer]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: user-pricing-form-tests
  description: Update `apps/web/src/lib/components/admin/__tests__/UserPricingForm.test.ts` — add cases for `initialPricingMode("10.00" as any, null) → "discount"`, `computeEffectivePrice("discount", 89, 10, 0) === 80.10`, and an integration case where the component seeded with `initialDiscount={"10.00"}` renders a discounted `upf-preview-amount` (not the public price).
  inputs: `initialPricingMode`, `computeEffectivePrice`, `UserPricingForm` component
  interactions: none (test file)
  kind: test
  depends_on: [user-pricing-form-coercion]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: room-card-tests
  description: Update `apps/web/src/lib/components/__tests__/RoomCard.test.ts` — assert the card no longer renders `data-testid="price-amount"`, `/nuit` text, `89.00`, or `custom-pricing-badge`; keep image / name / description assertions.
  inputs: updated `RoomCard.svelte`
  interactions: none (test file)
  kind: test
  depends_on: [room-card-cleanup]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: home-page-price-tests
  description: Add/adjust assertions in `apps/web/src/routes/__tests__/page-accueil.test.ts` — exactly one `data-testid="price-amount"` on the home page, showing `$89.00 /nuit` for anonymous visitors, no `custom-pricing-badge` when no `auth.user` is set; cover the personalized fallback path.
  inputs: updated `+page.svelte` (home), `home-price-display`
  interactions: none (test file)
  kind: test
  depends_on: [home-price-display]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none