# Requirements — Price Transparency & Admin Header Fix

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — `apps/web/src/lib/utils.ts` MUST export a pure
  `nightsBetween(checkIn, checkOut)` helper returning the whole nights between two
  `YYYY-MM-DD` strings. It MUST return `0` for empty, nullish, or malformed input
  and for same-day or reversed ranges, MUST never return a negative number, and
  MUST parse dates as local calendar dates (timezone-safe).
- **FR-2 (MUST)** — The admin user-detail page
  (`apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte`) MUST render its
  sticky topbar pinned below the fixed 64px global nav: page root
  `padding-top: 64px` and `.user-profile-page__topbar { top: 64px }`. No other
  admin subpage may exhibit the overlap bug.
- **FR-3 (MUST)** — The profile page (`apps/web/src/routes/profil/+page.svelte`)
  MUST preserve `effectiveNightlyPrice` from `getMe` when merging `getProfile`'s
  user, and MUST display a «Votre tarif» row valued
  `(effectiveNightlyPrice ?? settings.nightlyPrice)` formatted `X,XX $ /nuit`
  (`data-testid="profil-user-rate"`).
- **FR-4 (MUST)** — The profile page MUST show a «Tarif personnalisé» badge
  (`data-testid="profil-rate-badge"`) if and only if `effectiveNightlyPrice != null`
  AND `effectiveNightlyPrice !== settings.nightlyPrice`.
- **FR-5 (MUST)** — The reservation form
  (`apps/web/src/routes/contact/+page.svelte`) MUST display a rate line
  (`data-testid="contact-rate-line"`) showing
  `auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice` as `X,XX $ /nuit`,
  with a «Tarif personnalisé» badge (`data-testid="contact-rate-badge"`) shown only
  when the effective rate differs from the public rate.
- **FR-6 (MUST)** — The reservation form MUST show a live-updating estimate
  (`data-testid="contact-estimate"`) if and only if `nights >= 1` AND
  `roomCount >= 1` (dates present, valid, and ordered), computed as
  `nights × roomCount × nightlyRate` and rendered «Estimation : N nuit(s) × R
  chambre(s) × X,XX $ = Y,YY $ (avant taxes)». It MUST live-update via Svelte 5
  `$derived` and MUST use `nightsBetween`.

### Non-Functional Requirements

- **NFR-1** — `npm run typecheck` and `npm run build:web` MUST exit 0.
- **NFR-2** — All existing vitest suites MUST continue to pass, plus the new
  helper, profil, and contact tests.
- **NFR-3** — New contact rate/estimate markup MUST have no horizontal overflow at
  ≤480px viewports.
- **NFR-4** — `nightsBetween` MUST use local-date parsing (no UTC off-by-one at day
  boundaries).
- **NFR-5** — New French UI copy and `X,XX $` currency formatting MUST match
  existing site conventions.

## Out of Scope (Exclusions)

- No changes to any API endpoint, request/response shape, or field name.
- No database schema changes and no migration.
- No changes to `resolveEffectiveNightly`'s discount/fixed precedence semantics.
- No changes to the home page (`apps/web/src/routes/+page.svelte`) or le-site page
  price displays.
- No changes to the login/register API responses or their auth flow (the profile
  merge handles preservation client-side).

## Acceptance Criteria

1. `nightsBetween('2026-08-01','2026-08-05') === 4`,
   `nightsBetween('2026-08-01','2026-08-02') === 1`,
   `nightsBetween('2026-01-31','2026-02-02') === 2`.
2. `nightsBetween('2026-08-01','2026-08-01') === 0` and
   `nightsBetween('2026-08-05','2026-08-01') === 0`.
3. `nightsBetween('', '2026-08-02')`, `nightsBetween('2026-08-01', null)`,
   `nightsBetween(undefined, undefined)`, and
   `nightsBetween('not-a-date','2026-08-02')` each `=== 0`.
4. `.user-profile-page` style contains `padding-top: 64px` and
   `.user-profile-page__topbar` contains `top: 64px`.
5. With `getMe` returning `effectiveNightlyPrice: 75` and `getProfile` omitting it,
   `data-testid="profil-user-rate"` renders and contains `75`.
6. `profil-rate-badge` is present when the effective rate (75) differs from
   `settings.nightlyPrice` (89) and absent when `effectiveNightlyPrice` is
   undefined (value falls back to the public rate).
7. `contact-rate-line` is always present with the rate; `contact-rate-badge` is
   present only when the effective rate differs from the public rate.
8. `contact-estimate` is absent with no dates, reversed/equal dates, or
   `roomCount < 1`, and present showing nights, room count, and total for valid
   ordered dates with `roomCount >= 1`.
9. `nightsBetween` is exported from `apps/web/src/lib/utils.ts` and used by
   `apps/web/src/routes/contact/+page.svelte`.
10. `npm run typecheck`, `npm run build:web`, and all vitest suites pass.
