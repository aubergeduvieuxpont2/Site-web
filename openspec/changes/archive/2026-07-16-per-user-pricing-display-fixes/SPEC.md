# Per-User Pricing Display Fixes

## Task

Three confirmed, independent display bugs in the per-user nightly-pricing feature, plus a small home-page design consolidation:

1. **NUMERIC-as-string breaks the admin pricing preview after refresh.** `users.discount_percent` and `users.fixed_nightly_price` are Postgres `NUMERIC` columns (migration 0015). The `@neondatabase/serverless` driver returns `NUMERIC` values as JSON **strings** (e.g. `"10.00"`), not numbers. `UserPricingForm.computeEffectivePrice()` / `validate()` gate on `Number.isFinite(...)`, which is `false` for a string, so after saving a discount and reloading the admin user-detail page the *Prix effectif* preview silently reverts to the public price even though the value persisted correctly.

2. **After login the site shows the public price until a hard reload.** `POST /api/auth/login` (and `/register`) returns the bare user row **without** `effectiveNightlyPrice`, and `connexion/+page.svelte` calls `setUser(result.user)`, so `auth.user.effectiveNightlyPrice` is `undefined` and `RoomCard` / `le-site` fall back to `settings.nightlyPrice` until a full reload triggers `loadAuth()` → `GET /api/auth/me` (which *does* compute `effectiveNightlyPrice`).

3. **Home page repeats the identical price on every RoomCard.** The three featured `RoomCard`s each render the same nightly price. Requirement: show the price **once** in the rooms section for a cleaner look.

**Goals:** normalize NUMERIC columns to real numbers at the API boundary; make `UserPricingForm` defensive against string props; source the post-login user from the single authoritative endpoint; consolidate the home-page price into one element. Surgical changes only — no migration, no field renames, no change to `resolveEffectiveNightly` precedence.

## Schema Changes

None. No migration. `users.discount_percent` and `users.fixed_nightly_price` remain `NUMERIC` (migration 0015). The fix is purely at the read/serialization boundary.

## API Types

No request/response field is renamed or added. The only change is the **runtime type** of two existing response fields:

- `discount_percent`: was serialized as `string | null` (e.g. `"10.00"`), now serialized as `number | null` (e.g. `10`).
- `fixed_nightly_price`: was serialized as `string | null`, now serialized as `number | null`.

Affected responses: `GET /api/auth/me` (via `effectiveNightlyPrice` computation), `GET /api/admin/users/:id`, `POST /api/admin/users/:id/pricing`, and the invoice endpoint's internal pricing lookup (near `index.ts:1084`).

Shared helper (new, exported from `apps/api/src/pricing.ts`):

```ts
// null/undefined pass through as null; any other value is coerced with Number().
export function toNumberOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}
```

Frontend `User.effectiveNightlyPrice?: number` (`apps/web/src/lib/api.ts`) is unchanged.

## Implementation Steps

### Step 1 — `apps/api/src/pricing.ts` (add shared helper)
Add and export `toNumberOrNull(v: unknown): number | null` returning `v == null ? null : Number(v)`. Placing it here (alongside `resolveEffectiveNightly`) keeps it importable by both `index.ts` and the API unit test. Do **not** change `resolveEffectiveNightly` logic.

### Step 2 — `apps/api/src/index.ts` (normalize at the boundary)
Import `toNumberOrNull` from `./pricing`. Apply it everywhere `discount_percent` / `fixed_nightly_price` rows are read or returned:
- `GET /api/auth/me` (line ~468–482): wrap `userRows[0]?.fixed_nightly_price` and `?.discount_percent` before passing to `resolveEffectiveNightly` so the computation always sees numbers.
- `GET /api/admin/users/:id` (line ~1145–1188): before `c.json`, map the returned row so `discount_percent` / `fixed_nightly_price` are numeric (not string) in the JSON response.
- `POST /api/admin/users/:id/pricing` (line ~1221–1246): same numeric mapping on the `RETURNING` row before `c.json({ user })`.
- Invoice endpoint pricing lookup (line ~1084–1097): wrap the two fields before `resolveEffectiveNightly`.
- `GET /api/admin/users` (list, line ~837) selects only `id, email, name, role, created_at` — **no pricing columns** — so it needs no change. Note this in a comment, do not add columns.

### Step 3 — `apps/web/src/lib/components/admin/UserPricingForm.svelte` (defensive coercion)
Coerce `initialDiscount` / `initialFixed` through `Number()` before seeding `$state`, preserving `null` → `null`. Seed `discountValue` / `fixedValue` and `initialPricingMode(...)` from the coerced values so a string prop like `"10.00"` yields a working preview even if a caller bypasses the API normalization. Keep behavior identical for numbers and `null`. No markup/style changes.

### Step 4 — `apps/web/src/routes/connexion/+page.svelte` (single source of truth)
Import `loadAuth` from `$lib/auth.svelte`. Replace **both** `setUser(result.user)` call sites (in `handleLogin` and `handleRegister`) with `await loadAuth()` so `auth.user` carries the freshly computed `effectiveNightlyPrice` before `goto("/profil")`. Remove the now-unused `setUser` import. Do **not** change the login/register API responses.

### Step 5 — `apps/web/src/lib/components/RoomCard.svelte` (remove per-card price)
Remove the price block: the `.room-card-effective-price` wrapper, `.price-display` markup with `data-testid="price-amount"`, and the `custom-pricing-badge` markup, plus their `displayPrice` / `showCustomBadge` `$derived` values and the now-unused `settings` / `auth` imports. Remove the associated CSS (`.room-card-effective-price`, `.price-display`, `.price-amount`, `.price-label`, `.custom-pricing-badge`). Keep the image, name, and description intact.

### Step 6 — `apps/web/src/routes/+page.svelte` (single price display)
Import `auth` from `$lib/settings`' sibling `$lib/auth.svelte` (and keep the existing `settings` import). Add one price display in the rooms section next to the `Nos chambres` heading, mirroring RoomCard's former logic:
- amount: `(auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice).toFixed(2)` prefixed with `$` and a `/nuit` label;
- badge `Tarif personnalisé` shown only when `auth.user?.effectiveNightlyPrice != null && auth.user.effectiveNightlyPrice !== settings.nightlyPrice`.
Use a single `data-testid="price-amount"` element and `data-testid="custom-pricing-badge"` for the badge. Match the Industrial Zen styling (reference `page-le-site__price` at `le-site/+page.svelte:~117`). Must be responsive on narrow viewports (no overflow at ≤400px).

### Step 7 — `apps/api/test/settings.test.ts` or a new API test (numeric mapping)
Add unit coverage that `toNumberOrNull` maps `"10.00" → 10`, `"75" → 75`, `null → null`, `undefined → null`, and that `resolveEffectiveNightly` fed through it yields the discounted/fixed price (proving string inputs no longer defeat the computation). Prefer a small focused test file (e.g. `apps/api/test/pricing.test.ts`).

### Step 8 — `apps/web/src/lib/components/admin/__tests__/UserPricingForm.test.ts` (string-prop preview)
Add cases: `initialPricingMode('10.00' as any, null)` resolves to `discount`; `computeEffectivePrice('discount', 89, 10, 0)` returns `80.10`; and (integration) the component seeded with `initialDiscount={"10.00"}` renders a discounted `upf-preview-amount` (not the public price).

### Step 9 — `apps/web/src/lib/components/__tests__/RoomCard.test.ts` (removed price block)
Update the existing `price display` describe block: assert the card no longer renders `data-testid="price-amount"`, `/nuit`, `89.00`, or `custom-pricing-badge`. Keep the image / name / description assertions.

### Step 10 — `apps/web/src/routes/__tests__/page-accueil.test.ts` (single price on page)
Add/adjust assertions: the rendered home page contains **exactly one** `data-testid="price-amount"`, shows `$89.00 /nuit` by default (anonymous), and does **not** render `custom-pricing-badge` when no user is set. Cover the personalized fallback: with no `auth.user`, the public price is shown.

## Acceptance Criteria

1. `apps/api/src/pricing.ts` exports `toNumberOrNull` such that `toNumberOrNull("10.00") === 10`, `toNumberOrNull(null) === null`, and `toNumberOrNull(undefined) === null`.
2. `GET /api/admin/users/:id` and `POST /api/admin/users/:id/pricing` return `discount_percent` and `fixed_nightly_price` as JSON numbers (or `null`), never as strings — verified by the API unit test.
3. `GET /api/auth/me` computes `effectiveNightlyPrice` correctly when the DB row's `discount_percent` arrives as the string `"10.00"` (e.g. public 89 → effective `80.10`), verified through `resolveEffectiveNightly(toNumberOrNull(...))`.
4. `UserPricingForm` seeded with `initialDiscount="10.00"` renders a discounted `upf-preview-amount` (not the public price); `computeEffectivePrice("discount", 89, 10, 0) === 80.10`.
5. `connexion/+page.svelte` calls `await loadAuth()` (not `setUser(result.user)`) in both `handleLogin` and `handleRegister`; `setUser` is no longer imported there.
6. `RoomCard.svelte` renders no `data-testid="price-amount"`, no `/nuit` text, no `89.00`, and no `custom-pricing-badge`; RoomCard tests asserting those are updated and pass.
7. The home page (`/`) renders exactly one element with `data-testid="price-amount"` showing `$89.00` and a `/nuit` label by default, and renders `custom-pricing-badge` only when `auth.user.effectiveNightlyPrice` is set and differs from `settings.nightlyPrice`.
8. The home-page price display does not overflow horizontally at a 320px viewport width.
9. `npm run typecheck`, all API and web vitest suites (including the new/updated tests), and `npm run build:web` all pass.
10. No database migration file is added; no API response field is renamed; `resolveEffectiveNightly` precedence (fixed wins over discount) is unchanged.
