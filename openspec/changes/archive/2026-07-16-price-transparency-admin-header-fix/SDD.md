# System Design Document — Price Transparency & Admin Header Fix

## System Overview

Three front-end-only fixes in the `apps/web` Svelte 5 SPA. All work is confined to
the frontend: one pure TypeScript helper, three `.svelte` route components, and
three vitest suites. The backend Hono Worker (`apps/api`) and Neon Postgres schema
are untouched. The HTTP contract is consumed as-is: `getMe`, `getProfile`, the
`settings` store (`nightlyPrice`), and the `auth` store
(`auth.user.effectiveNightlyPrice`) already exist and carry the needed data.

The three fixes are independent (no shared runtime state) and only `nightsBetween`
is a shared new artifact — authored once in `$lib/utils` and consumed by the
contact page. The admin-header fix is CSS-only; the profil and contact fixes add
display logic plus a data merge on the profile page.

## Architecture Decisions

- **Preserve `effectiveNightlyPrice` by merge, not by API change.** `getProfile`
  intentionally returns a narrower user shape; changing it is out of scope. The
  profile page already has `getMe`'s richer user in hand, so it merges the field
  back in (`{ ...profileResult.user, effectiveNightlyPrice: meUser.effectiveNightlyPrice }`).
  This keeps the HTTP contract stable and the fix surgical. (ST-01)
- **Nights math in a pure exported helper.** `nightsBetween` lives in
  `$lib/utils` next to `datesOutOfOrder`, isolating calendar math for unit testing
  and reuse and keeping components thin. It reuses the proven local-date parsing
  from `formatDateOnly` to avoid a UTC midnight off-by-one. (ST-02)
- **Svelte 5 `$derived` for all contact-page display values.** Rate, custom-rate
  flag, nights, rooms, gating, and total are `$derived`, matching the file's
  existing rune-based reactivity and giving live updates with no manual
  subscriptions. (ST-03)
- **Copy the admin dashboard's nav-offset treatment.** The user-detail page gets
  `padding-top: 64px` on its root and `top: 64px` on its sticky topbar — the exact,
  proven pattern already in `/admin`. Grep confirms only these two admin routes use
  `position: sticky`, so no other subpage needs the fix. (ST-04)
- **Single fallback rule everywhere.** `effectiveNightlyPrice ??
  settings.nightlyPrice` with badge-when-differs is used on both profil and
  contact, matching the home page for predictable site-wide behavior. (ST-05,
  invariant INV-rate-fallback)

## Component Responsibilities

| File | Responsibility |
|---|---|
| `apps/web/src/lib/utils.ts` | Owns `nightsBetween` — pure, timezone-safe, non-negative whole-night count. |
| `apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte` | CSS-only: page root `padding-top: 64px`, topbar `top: 64px`. |
| `apps/web/src/routes/profil/+page.svelte` | Merge-preserve `effectiveNightlyPrice`; render «Votre tarif» row + conditional custom badge. |
| `apps/web/src/routes/contact/+page.svelte` | Render effective rate line + conditional badge; live estimate gated on valid stay; consume `nightsBetween`. |
| `apps/web/src/lib/__tests__/utils.test.ts` | Unit-test `nightsBetween` across valid, boundary, and malformed inputs. |
| `apps/web/src/routes/__tests__/page-profil.test.ts` | Assert rate row renders with merge-preserved rate; badge gating. |
| `apps/web/src/routes/__tests__/page-contact.test.ts` | Assert rate line always present; estimate appears only for a valid stay. |

## Data Flow

**Profil rate (FIX 2):**
```
onMount → getMe() ──► meUser { …, effectiveNightlyPrice }
                        │ (auth gate; admin redirect)
        → getProfile() ──► profileUser { … (no rate) }, reservations
                        │
   merge: user = { ...profileUser, effectiveNightlyPrice: meUser.effectiveNightlyPrice }
                        │
   render: rate = user.effectiveNightlyPrice ?? settings.nightlyPrice
           badge iff rate != null && rate !== settings.nightlyPrice
```

**Contact rate + estimate (FIX 3):**
```
auth.user, settings (stores) ─┐
form.checkIn/checkOut/roomCount ─┤
                                 ▼
  nightlyRate  = auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice   ($derived)
  nights       = nightsBetween(form.checkIn, form.checkOut)                  ($derived)
  rooms        = max(0, trunc(roomCount))                                    ($derived)
  visible      = nights >= 1 && rooms >= 1                                   ($derived)
  total        = nights * rooms * nightlyRate                                ($derived)
                                 ▼
  render rate line (always) + badge (iff custom) + estimate (iff visible)
```

**Admin header (FIX 1):** pure CSS; no runtime data. The fixed 64px `Nav` overlays
the viewport top; the page reserves 64px and pins its sticky topbar at `top: 64px`.

## Known Constraints

- **No API/schema/migration changes.** The profile fix must work entirely from the
  data already returned by `getMe` and `getProfile`.
- **Timezone safety.** `nightsBetween` must use local-date parsing (regex +
  `new Date(y, m-1, d)`), never `Date.parse` on the raw string, to avoid a UTC
  off-by-one at day boundaries.
- **Responsive.** The new contact rate/estimate markup must not introduce
  horizontal overflow at ≤480px viewports.
- **French UI copy.** New strings («Votre tarif», «Tarif : … /nuit», «Tarif
  personnalisé», «Estimation : … (avant taxes)») match the existing French copy and
  `X,XX $` formatting convention.
- **Out of scope, must not change:** home page (`+page.svelte`) and le-site price
  displays; any API endpoint; `resolveEffectiveNightly` precedence semantics.
- **Verification gates:** `npm run typecheck`, `npm run build:web`, and all vitest
  suites must pass with the added tests.
