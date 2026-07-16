# Requirements — Per-User Pricing Display Fixes

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — The API MUST expose a `toNumberOrNull(v)` helper (in `apps/api/src/pricing.ts`) that returns `null` for `null`/`undefined` and `Number(v)` otherwise.
- **FR-2 (MUST)** — `GET /api/admin/users/:id` MUST return `discount_percent` and `fixed_nightly_price` as JSON numbers (or `null`), never as strings.
- **FR-3 (MUST)** — `POST /api/admin/users/:id/pricing` MUST return `discount_percent` and `fixed_nightly_price` as JSON numbers (or `null`) in its response `user`.
- **FR-4 (MUST)** — `GET /api/auth/me` MUST compute `effectiveNightlyPrice` correctly when the DB row's pricing columns arrive as strings (e.g. `"10.00"`), by normalizing before `resolveEffectiveNightly`.
- **FR-5 (MUST)** — The invoice endpoint's pricing lookup MUST normalize `discount_percent`/`fixed_nightly_price` before `resolveEffectiveNightly`, so invoice totals are unaffected by the string driver behavior.
- **FR-6 (MUST)** — `UserPricingForm` MUST coerce `initialDiscount`/`initialFixed` through `Number()` (preserving `null`) before seeding preview state, so a string prop still yields a correct `Prix effectif` preview after refresh.
- **FR-7 (MUST)** — `connexion/+page.svelte` MUST hydrate `auth.user` via `await loadAuth()` in both `handleLogin` and `handleRegister`, so `effectiveNightlyPrice` is present before navigation (no hard reload needed).
- **FR-8 (MUST)** — `RoomCard.svelte` MUST NOT render any nightly price, `/nuit` label, or `Tarif personnalisé` badge.
- **FR-9 (MUST)** — The home page MUST render the nightly price exactly once, in the rooms section, showing `(auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice)` formatted to 2 decimals with a `/nuit` label.
- **FR-10 (MUST)** — The home-page price MUST show a `Tarif personnalisé` badge only when `auth.user.effectiveNightlyPrice != null` and it differs from `settings.nightlyPrice`.
- **FR-11 (SHOULD)** — The home-page price display SHOULD match the existing Industrial Zen styling used by `page-le-site__price`.

### Non-Functional Requirements

- **NFR-1 (MUST)** — No database migration is added; the `users` pricing columns remain `NUMERIC`.
- **NFR-2 (MUST)** — No API request/response field is renamed; only the runtime JSON type of two fields is corrected (string → number).
- **NFR-3 (MUST)** — `resolveEffectiveNightly` precedence (fixed price wins over discount) and cent-rounding are unchanged.
- **NFR-4 (MUST)** — The home-page price display is responsive and does not overflow horizontally at 320px viewport width.
- **NFR-5 (MUST)** — All new/changed French UI copy reuses existing wording (`/nuit`, `Tarif personnalisé`).
- **NFR-6 (MUST)** — `npm run typecheck`, all API + web vitest suites, and `npm run build:web` pass.

### Constraints

- Neon `@neondatabase/serverless` driver returns `NUMERIC` columns as JSON strings — the root cause being corrected at the serialization boundary.
- Svelte 5 runes (`$state`, `$derived`, `$props`) — coercion must happen before/at state seeding.
- `RoomCard` is used only on the home page; removing its price block has no other consumer.
- Existing test suites (`RoomCard.test.ts`, `page-accueil.test.ts`, `UserPricingForm.test.ts`) must be updated in lockstep, not left asserting removed markup.

## Out of Scope (Exclusions)

- Changing the `users.discount_percent` / `fixed_nightly_price` column types via migration.
- Adding `effectiveNightlyPrice` to the login/register API responses (intentionally avoided — `loadAuth()` is the single source of truth).
- Any change to `resolveEffectiveNightly` discount/fixed precedence or rounding.
- Renaming API fields or the request-body camelCase keys.
- Changes to `le-site` price display (it already reads `auth.user?.effectiveNightlyPrice`), beyond benefiting from the boundary fix.
- Rate limiting, auth flow, or any unrelated security/refactor work.

## Acceptance Criteria

1. `toNumberOrNull("10.00") === 10`, `toNumberOrNull("75") === 75`, `toNumberOrNull(null) === null`, `toNumberOrNull(undefined) === null`.
2. An API unit test confirms `GET /api/admin/users/:id` and `POST .../pricing` response mapping yields numeric `discount_percent`/`fixed_nightly_price`.
3. `resolveEffectiveNightly(toNumberOrNull("10.00")-normalized pricing, 89)` returns `80.10`.
4. `UserPricingForm` seeded with `initialDiscount="10.00"` renders a discounted `upf-preview-amount`; `computeEffectivePrice("discount", 89, 10, 0) === 80.10`.
5. `connexion/+page.svelte` source calls `await loadAuth()` in both handlers and does not import/use `setUser`.
6. `RoomCard` SSR output contains no `data-testid="price-amount"`, no `/nuit`, no `89.00`, no `custom-pricing-badge`; updated RoomCard tests pass.
7. Home page SSR output contains exactly one `data-testid="price-amount"` with `$89.00` and a `/nuit` label by default, and no `custom-pricing-badge` for an anonymous visitor.
8. The home-page price display does not overflow horizontally at 320px.
9. `npm run typecheck`, all vitest suites, and `npm run build:web` pass with the new/updated tests.
10. `git status` shows no new file under `apps/api/migrations/`.
