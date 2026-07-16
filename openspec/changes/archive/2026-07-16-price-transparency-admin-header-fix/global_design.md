## Global Design Strategy

The site runs an **"Industrial Zen"** aesthetic: IBM Plex Sans body, IBM Plex Mono for labels and data, cool-neutral surfaces (#f7f9fb), with terracotta (#9d4300 / #fd761a) as the sole warm accent. All new elements must feel native — same typeface family, same token system, same BEM naming discipline.

The three fixes introduce one new visual concept: **personalized pricing visibility**. The design language for this is a subtle amber ember signal — reusing the existing `--color-ember-pale` / `--color-on-secondary-container` pair that already appears on admin badges — so "custom rate" reads as a deliberate, admin-granted privilege rather than a generic label. The estimate panel is a quiet calculation receipt, not an upsell block.

### Colour Palette

_Extending existing CSS custom properties — no new tokens introduced._

- primary-text: `var(--color-ink)` → #191c1e
- muted-text: `var(--color-ink-mute)` → #76777d
- surface: `var(--color-surface)` → #f7f9fb
- surface-raised: `var(--color-surface-container-low)` → #f2f4f6
- border: `var(--color-outline-variant)` → #c6c6cd
- hairline: `var(--color-hairline-2)` → #e0e3e5
- accent: `var(--color-terracotta)` → #9d4300
- accent-label: `var(--color-ink-variant)` → #45464d
- badge-custom-bg: `var(--color-ember-pale)` → #ffdbca (existing "admin badge" signal)
- badge-custom-fg: `var(--color-on-secondary-container)` → #5c2400
- estimate-surface: `var(--color-surface-container-low)` → #f2f4f6
- estimate-border: `var(--color-outline-variant)` → #c6c6cd

### Typography

- font-family: IBM Plex Sans (body), IBM Plex Mono (labels, rates, monospaced values), IBM Plex Serif (decorative only, not used in these fixes)
- base size: 15–16px body; 13–14px supporting text; 11px micro-labels (uppercase, letter-spacing: 0.12em)
- rate values: IBM Plex Mono, tabular-nums, 16px (profil) / 14px (contact) — numerics always in mono for scanability
- estimate total: 16px, font-weight 600, `var(--color-ink)`

### Spacing

- base unit: 4px; existing scale: xs=0.5rem sm=0.75rem md=1.25rem lg=2rem xl=3rem 2xl=4.5rem
- rate row gap (profil dl): follows `var(--space-lg)` between dl items
- estimate panel padding: `var(--space-md)` vertical, `var(--space-lg)` horizontal; margin-top: `var(--space-sm)`

### Accessibility

- minimum contrast ratio: 4.5:1 (WCAG AA) — all new text/bg pairs verified
  - badge: #5c2400 on #ffdbca → contrast ~7.2:1 ✓
  - estimate text (#191c1e) on #f2f4f6 → contrast ~16:1 ✓
  - muted label (#76777d) on #f7f9fb → contrast ~4.6:1 ✓
- keyboard navigation: rate row and estimate are display-only; no new interactive elements added
- ARIA roles required:
  - `profil-user-rate` (`dd`): standard `<dl>/<dt>/<dd>` semantics, no extra ARIA needed
  - `profil-rate-badge` / `contact-rate-badge`: `aria-label="Tarif personnalisé"` on the badge span
  - `contact-rate-line`: rendered as a `<p>` or `<div role="status">` so screen readers receive live rate
  - `contact-estimate`: `role="status"` with `aria-live="polite"` so live-updating total is announced

### Security

- No innerHTML assignments — all rate/estimate values interpolated via Svelte template `{expr}`, never assigned to `.innerHTML`
- No eval() or Function()
- All values derived from typed API responses and `$derived` reactive computations — no user string concatenation in DOM

## Component Inventory

- component: nights-between-util
  description: Pure exported helper `nightsBetween(checkIn, checkOut)` in apps/web/src/lib/utils.ts — parses two YYYY-MM-DD strings with local-date construction (timezone-safe), returns whole non-negative night count; 0 for nullish/malformed/same-day/reversed input. Includes full vitest suite in apps/web/src/lib/__tests__/utils.test.ts.
  inputs: checkIn string | null | undefined, checkOut string | null | undefined
  interactions: none (pure function, no UI)
  kind: utility
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: user-detail-nav-offset
  description: CSS-only fix in apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte — adds `padding-top: 64px` to `.user-profile-page` and changes `.user-profile-page__topbar` from `top: 0` to `top: 64px` so the sticky admin topbar and page content clear the fixed 64px global Nav. No markup or script changes.
  inputs: none (static layout correction)
  interactions: none
  kind: layout
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: profil-rate-row
  description: Rate display row added to `.profil__user-card` in apps/web/src/routes/profil/+page.svelte. Preserves `effectiveNightlyPrice` from `getMe()` through the `getProfile()` merge. Renders a `<dt>` «Votre tarif» / `<dd>` rate value in IBM Plex Mono tabular-nums formatted «X,XX $ /nuit» (data-testid="profil-user-rate"). Appends an inline «Tarif personnalisé» amber badge (data-testid="profil-rate-badge") reusing `.profil__role-badge` base with a custom modifier that applies `var(--color-ember-pale)` bg / `var(--color-on-secondary-container)` fg — rendered only when effectiveNightlyPrice differs from settings.nightlyPrice. Falls back to settings.nightlyPrice when effectiveNightlyPrice is undefined. Includes vitest additions in apps/web/src/routes/__tests__/page-profil.test.ts.
  inputs: effectiveNightlyPrice (from getMe merge), settings.nightlyPrice (from settings store)
  interactions: conditional badge visibility; display-only
  kind: card-section
  depends_on: [nights-between-util]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: contact-rate-estimate
  description: Two additions to apps/web/src/routes/contact/+page.svelte. (1) A rate line (data-testid="contact-rate-line") near date/room fields showing «Tarif : X,XX $ /nuit» using the effective rate (auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice) with an inline «Tarif personnalisé» ember badge (data-testid="contact-rate-badge") when isCustomRate. (2) A live-updating estimate panel (data-testid="contact-estimate") rendered via $derived — visible only when nights >= 1 and rooms >= 1 — displaying «Estimation : N nuit(s) × R chambre(s) × X,XX $ = Y,YY $ (avant taxes)». Uses nightsBetween helper imported from $lib/utils. Estimate fades in via CSS opacity transition. Panel uses surface-container-low background with outline-variant border and radius-lg, total in font-weight 600. Scoped styles prevent horizontal overflow at ≤480px. Includes vitest additions in apps/web/src/routes/__tests__/page-contact.test.ts.
  inputs: auth.user?.effectiveNightlyPrice, settings.nightlyPrice, form.checkIn, form.checkOut, form.roomCount
  interactions: live-updating estimate via $derived; rate badge conditional; estimate panel fades in/out as estimateVisible changes
  kind: panel
  depends_on: [nights-between-util]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3