# System Design — Per-User Pricing Display Fixes

## System Overview

Two independently-deployed Cloudflare Workers form the system: `apps/api` (Hono + Neon Postgres over HTTP) and `apps/web` (Svelte 5 SPA static assets). Per-user nightly pricing is stored on the `users` table as two mutually-exclusive `NUMERIC` columns (`discount_percent`, `fixed_nightly_price`) and resolved to an effective price by the pure `resolveEffectiveNightly()` helper in `apps/api/src/pricing.ts`.

This change touches three seams:
- **API serialization boundary** — normalize `NUMERIC`-as-string to real numbers before values enter `resolveEffectiveNightly` or a JSON response.
- **Frontend auth hydration** — after login/register, hydrate `auth.user` from the one endpoint that computes `effectiveNightlyPrice` (`GET /api/auth/me`), instead of the bare login response.
- **Home-page presentation** — move the nightly price from three repeated `RoomCard`s to a single display in the rooms section.

No schema, no new endpoint, no field rename. The HTTP contract is unchanged in shape; only the runtime JSON type of two fields is corrected (string → number).

## Architecture Decisions

- **Normalize at the boundary, not in the consumer.** The root cause is the Neon driver returning `NUMERIC` as strings. A single `toNumberOrNull()` helper applied at every read/return site fixes every consumer (admin preview, `resolveEffectiveNightly`, invoice math) at once, and keeps `resolveEffectiveNightly`'s `!= null` / arithmetic semantics untouched. Chosen over patching each frontend consumer with `Number()` (which would leave the invoice path and future callers exposed).
- **Helper lives in `pricing.ts`.** Co-locating `toNumberOrNull` with `resolveEffectiveNightly` makes it unit-testable in the API test suite and importable by `index.ts` without a new module.
- **Defensive coercion in `UserPricingForm` too (belt-and-suspenders).** Even with the API fixed, the component coerces `initialDiscount`/`initialFixed` through `Number()` so a stray string prop cannot silently blank the preview. Low cost, removes an entire class of regression.
- **`loadAuth()` as the single source of truth post-login.** Rather than duplicate `effectiveNightlyPrice` computation into the login/register API responses (two more places to keep in sync with `resolveEffectiveNightly`), the client re-fetches `GET /api/auth/me`, which already computes it. One authoritative code path.
- **Single home-page price, RoomCard becomes pure presentation.** `RoomCard` is used only on the home page, so removing its price block has no other blast radius. The price moves next to the section heading, matching the existing `page-le-site__price` single-price pattern for visual consistency.

## Component Responsibilities

| Component | Responsibility after change |
|---|---|
| `apps/api/src/pricing.ts` | Adds `toNumberOrNull`; `resolveEffectiveNightly` unchanged. |
| `apps/api/src/index.ts` | Applies `toNumberOrNull` at `/api/auth/me`, `/api/admin/users/:id`, `POST .../pricing`, and the invoice pricing lookup; returns numeric JSON. |
| `UserPricingForm.svelte` | Coerces string/number/null props to number/null before seeding preview state. |
| `connexion/+page.svelte` | Hydrates `auth.user` via `await loadAuth()` after login and register. |
| `auth.svelte.ts` | Unchanged; `loadAuth()` remains the authoritative session loader. |
| `RoomCard.svelte` | Renders image + name + description only; no price. |
| `routes/+page.svelte` | Renders one price display (amount + `/nuit` + optional `Tarif personnalisé` badge) in the rooms section. |

## Data Flow

**Admin saves a discount, then reloads (Problem 1):**
```
Admin POST /pricing {discountPercent:10}
  → UPDATE users ... RETURNING → row.discount_percent = "10.00" (NUMERIC-as-string)
  → toNumberOrNull → 10  → c.json({user:{discount_percent:10}})
Reload → GET /api/admin/users/:id → toNumberOrNull → 10
  → UserPricingForm initialDiscount=10 → Number.isFinite(10)=true → preview shows discounted price ✓
```

**User logs in (Problem 2):**
```
POST /api/auth/login → {user:{...}}  (no effectiveNightlyPrice)
  → connexion: await loadAuth() → GET /api/auth/me
      → SELECT discount_percent → "10.00" → toNumberOrNull → 10
      → resolveEffectiveNightly({discountPercent:10}, 89) → 80.10
      → setUser({...user, effectiveNightlyPrice:80.10})
  → goto('/profil') → RoomCard / le-site / home price show 80.10 immediately ✓
```

**Home page render (Problem 3):**
```
+page.svelte rooms section:
  amount = (auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice).toFixed(2)
  badge  = auth.user?.effectiveNightlyPrice != null
           && auth.user.effectiveNightlyPrice !== settings.nightlyPrice
  → one price-amount element; three RoomCards render no price ✓
```

## Known Constraints

- **No migration.** The columns stay `NUMERIC`; only serialization changes. A DB migration to change the column type is explicitly out of scope and would be riskier.
- **`resolveEffectiveNightly` semantics frozen.** Fixed price wins over discount; rounding to cents preserved. `toNumberOrNull` must not alter these — it only converts inputs.
- **No field renames.** `discount_percent` / `fixed_nightly_price` (snake_case DB/JSON) and `discountPercent` / `fixedNightlyPrice` (camelCase request body) keep their names.
- **`Number("")` pitfall.** `toNumberOrNull` treats only `null`/`undefined` as null; empty string would become `0`. DB `NUMERIC` never returns `""`, so this is acceptable, but the helper is documented to expect DB values, not arbitrary user input.
- **Reduced-motion & responsive.** The new home-page price must respect existing responsive breakpoints (≤400px) and not introduce horizontal overflow.
- **French UI copy.** New/changed strings (`/nuit`, `Tarif personnalisé`) reuse the exact existing wording.
