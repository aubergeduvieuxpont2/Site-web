# Price Transparency & Admin Header Fix

## Task

Three independent, already-investigated UI fixes to the Svelte 5 SPA (`apps/web`).
No API, schema, or migration changes.

1. **FIX 1 — Admin user-detail header collides with the fixed global nav.** The
   global `Nav` (`apps/web/src/lib/components/Nav.svelte`) is `fixed inset-x-0
   top-0 z-50` and 64px tall. The admin user-detail page
   (`apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte`) has a
   `.user-profile-page__topbar` with `position: sticky; top: 0; z-index: 20` and no
   page-level top offset, so the topbar and content slide under the fixed nav and
   the two headers overlap. The admin dashboard (`apps/web/src/routes/admin/+page.svelte`)
   already solves this with `padding-top: 64px` on its page wrapper and `top: 64px`
   on its sticky topbar. Apply the identical treatment to the user-detail page.

2. **FIX 2 — Profile page must display the user's nightly rate.** In
   `apps/web/src/routes/profil/+page.svelte`, `getMe()` returns a user that
   INCLUDES `effectiveNightlyPrice`, but the code then overwrites `user` with
   `getProfile()`'s user, which does NOT include it. Preserve it on the merge, then
   render a rate row (label «Votre tarif», value `X,XX $ /nuit`) plus a «Tarif
   personnalisé» badge when the effective rate differs from the public rate.

3. **FIX 3 — Reservation page must state the price that will be charged.** In
   `apps/web/src/routes/contact/+page.svelte`, show the effective nightly rate the
   logged-in user will be charged (`auth.user?.effectiveNightlyPrice ??
   settings.nightlyPrice`) with the custom badge when applicable, and a
   live-updating cost estimate when the stay is valid. Nights math lives in a new
   pure exported `nightsBetween` helper in `apps/web/src/lib/utils.ts`.

## Schema Changes

None. No database schema, table, index, or migration changes.

## API Types (no changes)

No API endpoints are added or modified. The fixes rely on existing types only:

```ts
// $lib/api — existing, unchanged
interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "guest";
  effectiveNightlyPrice?: number; // present on GET /api/auth/me responses
}

// $lib/settings.svelte — existing reactive store
settings.nightlyPrice: number; // public fallback rate
```

New pure helper (frontend only, `$lib/utils`):

```ts
/** Whole nights between two YYYY-MM-DD strings.
 *  Returns 0 for empty/nullish/malformed input and for same-day or reversed
 *  ranges. Never negative. Local-date parsing (timezone-safe). */
export function nightsBetween(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): number;
```

## Implementation Steps

### Step 1 — `apps/web/src/lib/utils.ts` (add `nightsBetween`)
Add an exported pure helper next to `datesOutOfOrder`. Parse each `YYYY-MM-DD`
string with the same regex + local-`Date` construction used by `formatDateOnly`
(avoids UTC off-by-one). Return `0` when either input is empty/nullish or fails
the `^\d{4}-\d{2}-\d{2}` match. Compute the whole-day difference
`(checkOut − checkIn) / 86_400_000`, round it, and return `Math.max(0, diff)` so
same-day (`0`) and reversed ranges (negative → clamped to `0`) both yield `0`.

### Step 2 — `apps/web/src/lib/__tests__/utils.test.ts` (helper tests)
Add a `describe('nightsBetween')` block covering: multi-night (`'2026-08-01'` →
`'2026-08-05'` = 4), one night (= 1), month boundary (`'2026-01-31'` →
`'2026-02-02'` = 2), same-day (= 0), reversed (= 0), and empty/null/undefined/
malformed inputs (all = 0). Preserve existing tests in the file.

### Step 3 — `apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte` (nav offset)
In the `<style>` block, add `padding-top: 64px; /* fixed nav height */` to the
`.user-profile-page` rule and change `.user-profile-page__topbar` from `top: 0`
to `top: 64px; /* beneath fixed nav */`. Markup and script are untouched. No other
admin subpage uses `position: sticky` (only `/admin` and this route; `/admin` is
already fixed), so no further changes are required.

### Step 4 — `apps/web/src/routes/profil/+page.svelte` (rate row)
- Import the settings store: `import { settings } from "$lib/settings.svelte";`.
- On the profile merge (line ~77) preserve the rate:
  `user = { ...profileResult.user, effectiveNightlyPrice: meResult.user.effectiveNightlyPrice };`
  (capture the `getMe()` user in a scoped const so it is in reach at the merge
  site).
- Add a `dl`/`dt`/`dd` field to `.profil__user-card` matching the existing rows:
  `dt` = «Votre tarif», `dd` = `(effectiveNightlyPrice ?? settings.nightlyPrice)`
  formatted `X,XX $ /nuit`, with `data-testid="profil-user-rate"`. Append a
  «Tarif personnalisé» badge (`data-testid="profil-rate-badge"`, reuse
  `.profil__role-badge` styling) rendered only when `effectiveNightlyPrice != null
  && effectiveNightlyPrice !== settings.nightlyPrice`.

### Step 5 — `apps/web/src/routes/__tests__/page-profil.test.ts` (profil tests)
Add tests: (a) mock `getMe` → user with `effectiveNightlyPrice: 75`, `getProfile`
→ user WITHOUT it; assert `profil-user-rate` renders and contains `75`, proving
the merge preserves the rate. (b) with `effectiveNightlyPrice 75` vs
`settings.nightlyPrice 89`, assert `profil-rate-badge` present; with
`effectiveNightlyPrice` undefined, assert badge absent and value falls back to the
public rate. Preserve existing tests.

### Step 6 — `apps/web/src/routes/contact/+page.svelte` (rate line + estimate)
- Import `nightsBetween` from `$lib/utils` (alongside the existing
  `datesOutOfOrder` import).
- Add `$derived` values: `nightlyRate = auth.user?.effectiveNightlyPrice ??
  settings.nightlyPrice`; `isCustomRate = auth.user?.effectiveNightlyPrice != null
  && auth.user.effectiveNightlyPrice !== settings.nightlyPrice`;
  `nights = nightsBetween(form.checkIn, form.checkOut)`;
  `rooms = Math.max(0, Math.trunc(Number(form.roomCount) || 0))`;
  `estimateVisible = nights >= 1 && rooms >= 1`;
  `estimateTotal = nights * rooms * nightlyRate`.
- Render a rate line near the date/room fields: «Tarif : X,XX $ /nuit»
  (`data-testid="contact-rate-line"`) with a «Tarif personnalisé» badge
  (`data-testid="contact-rate-badge"`) shown only when `isCustomRate`.
- Render the estimate only when `estimateVisible`
  (`data-testid="contact-estimate"`): «Estimation : N nuit(s) × R chambre(s) ×
  X,XX $ = Y,YY $ (avant taxes)». Format currency with `Intl.NumberFormat('fr-CA',
  { style: 'currency', currency: 'CAD' })` or the existing `X,XX $` convention.
  Live-updates via `$derived`. Add scoped styles that avoid horizontal overflow at
  ≤480px.

### Step 7 — `apps/web/src/routes/__tests__/page-contact.test.ts` (contact tests)
Add tests: (a) `contact-rate-line` always present with the rate; badge present
only when the effective rate differs from public. (b) estimate absent with no
dates, reversed/equal dates, or `roomCount < 1`. (c) with valid ordered dates
(e.g. 2 nights) and `roomCount 2`, `contact-estimate` present showing nights,
rooms, and total. Preserve existing tests.

## Acceptance Criteria

1. `nightsBetween('2026-08-01','2026-08-05')` returns `4`;
   `nightsBetween('2026-08-01','2026-08-02')` returns `1`;
   `nightsBetween('2026-01-31','2026-02-02')` returns `2`.
2. `nightsBetween('2026-08-01','2026-08-01')` and
   `nightsBetween('2026-08-05','2026-08-01')` both return `0`.
3. `nightsBetween('', '2026-08-02')`, `nightsBetween('2026-08-01', null)`,
   `nightsBetween(undefined, undefined)`, and `nightsBetween('not-a-date',
   '2026-08-02')` all return `0`.
4. `.user-profile-page` style block contains `padding-top: 64px` and
   `.user-profile-page__topbar` contains `top: 64px`.
5. On the profile page, when `getMe` returns `effectiveNightlyPrice: 75` and
   `getProfile` omits it, an element with `data-testid="profil-user-rate"` renders
   and contains `75`.
6. `profil-rate-badge` renders when the effective rate (75) differs from
   `settings.nightlyPrice` (89) and is absent when `effectiveNightlyPrice` is
   undefined (value falls back to the public rate).
7. The contact page renders `data-testid="contact-rate-line"` containing the
   nightly rate; `contact-rate-badge` renders only when the effective rate differs
   from the public rate.
8. `data-testid="contact-estimate"` is absent with no dates, with reversed/equal
   dates, or with `roomCount < 1`, and is present showing nights, room count, and
   total for valid ordered dates with `roomCount >= 1`.
9. `nightsBetween` is exported from `apps/web/src/lib/utils.ts` and imported/used
   by `apps/web/src/routes/contact/+page.svelte`.
10. `npm run typecheck`, `npm run build:web`, and all vitest suites (existing +
    new) pass.
