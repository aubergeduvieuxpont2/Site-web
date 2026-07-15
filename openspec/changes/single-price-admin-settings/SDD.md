# System Design — Single Price + Admin-Configurable Settings

## System Overview

Two independently deployed Cloudflare Workers over an HTTP contract:

- **`apps/web`** — Svelte 5 SPA (SvelteKit, static adapter) served by a Worker. Marketing
  pages are prerendered/SSR with `content.ts` constants baked in; the client hydrates
  configurable business facts (price, contact email, marketing room count) from the API.
- **`apps/api`** — Hono Worker backed by Neon Postgres via `@neondatabase/serverless`
  (`DB_CONN` on `c.env`). Owns the new `settings` table and its three endpoints.

This change adds a **settings substrate**: a key/value `settings` table, a public read
endpoint, an admin read/write pair, a client-side reactive store with default fallback,
and an admin UI tab. All other changes are copy/content edits in the SPA.

The design keeps `content.ts` as the single source of default (fallback) values so the
site renders correctly even when the API is unreachable or before hydration completes.

## Architecture Decisions

- **Key/value table over typed columns.** `settings(key TEXT PRIMARY KEY, value TEXT,
  updated_at TIMESTAMPTZ)` matches the repo's idempotency convention (`CREATE TABLE IF
  NOT EXISTS` + `INSERT … ON CONFLICT DO NOTHING`) and lets future settings be added
  without a schema migration. Numeric values are stored as text and coerced at the API
  boundary with zod.
- **Public/admin read split.** `GET /api/settings` exposes only the three site-facing
  keys (`nightly_price`, `contact_email`, `marketing_room_count`). The operational
  `assignable_room_count` is readable/writable only through the admin-gated endpoints, so
  capacity held back is never leaked to the public.
- **POST for updates (not PUT).** The existing CORS block allows `GET`, `POST`, `OPTIONS`
  only. Using `POST /api/admin/settings` avoids widening CORS and matches the other
  mutating admin routes.
- **zValidator + custom hook.** The update body is validated by
  `zValidator("json", SettingsUpdateSchema, settingsHook)`, never manual `c.req.json()`,
  preserving the repo's bespoke `{ error }` 400 shape (`[[hono-zvalidator-rule]]`).
- **Inline admin gate.** Settings admin routes reuse the established inline
  `getAuthUser(c)` → `role === "admin"` pattern (`401`/`403`) rather than introducing new
  middleware, staying consistent with `/api/admin/reservations` and `/api/admin/outbox`.
- **Reactive store in a `.svelte.ts` module.** `lib/settings.svelte.ts` holds a `$state`
  object seeded from `DEFAULTS`; `loadSettings()` runs once from `+layout.svelte`
  `onMount`. A pure `mergeSettings()` reducer carries the overlay logic so it is unit
  testable without a DOM/runtime.
- **Defaults live in `content.ts`.** Constants remain the fallback source of truth; the
  store overlays configured values on top. Prerendered HTML shows defaults, then the
  client hydrates configured values — with defaults as the graceful fallback on failure.
- **Flat price sourced in `RoomCard`.** Rather than threading a price prop through every
  page, `RoomCard` reads `settings.nightlyPrice` directly, so all price displays update
  together and per-room price data is deleted.

## Component Responsibilities

| Component | Responsibility |
|---|---|
| `migrations/0007_settings.sql` | Create + seed the `settings` table idempotently |
| `apps/api/src/settings.ts` | Defaults, public-key list, zod update schema, pure row↔object mappers, zValidator hook |
| `apps/api/src/index.ts` | Wire `GET /api/settings`, `GET /api/admin/settings`, `POST /api/admin/settings` |
| `lib/content.ts` | Copy constants, `SITE.citq`, `DEFAULTS`; dortoir/hydro/monitoring purge |
| `lib/api.ts` | `PublicSettings`/`AdminSettings` types + three typed fetch helpers |
| `lib/settings.svelte.ts` | Reactive `$state` store, `mergeSettings()`, `loadSettings()` |
| `RoomCard.svelte` | `/contact` CTA (no query); flat price from the store |
| `Footer.svelte` | Static `CITQ #304542` line (every page via layout) |
| `+layout.svelte` | Kick off `loadSettings()` on client mount |
| `contact/+page.svelte` | Drop chambre prefill; render configured email |
| `+page.svelte` / `le-site` / `a-propos` | Copy edits; stats driven by marketing count |
| `admin/+page.svelte` | "Paramètres" tab: load/validate/save the four settings |

## Data Flow

**Public page render (price / email / marketing count)**
1. Prerender/SSR emits HTML using `content.ts` `DEFAULTS` (e.g. `89 $/nuit`, `12`).
2. On client mount, `+layout.svelte` calls `loadSettings()` →
   `getPublicSettings()` → `GET /api/settings`.
3. API reads the `settings` rows, coerces via `rowsToAdminSettings`, projects with
   `toPublicSettings`, returns `{ nightlyPrice, contactEmail, marketingRoomCount }`.
4. `mergeSettings` overlays the store; components (RoomCard price, Accueil stat, contact
   email) reactively re-render with configured values.
5. On network/parse failure the store keeps defaults — no visible breakage.

**Admin edit**
1. Admin opens the "Paramètres" tab → `adminGetSettings()` → `GET /api/admin/settings`
   (gated) → inputs populated with all four values.
2. Admin edits + saves → client guards (positive ints, valid email) →
   `adminUpdateSettings()` → `POST /api/admin/settings`.
3. API gate (`401`/`403`) → `zValidator` (`400` on bad body) → upsert each key
   (`ON CONFLICT DO UPDATE`) → return persisted `AdminSettings`.
4. Next public `GET /api/settings` (e.g. on reload) reflects the change.

## Known Constraints

- **No live-DB tests.** The api test suite unit-tests modules (password, middleware),
  not full HTTP handlers against Postgres. Settings coverage therefore targets the pure
  `apps/api/src/settings.ts` module (schema, mappers, public-key boundary); route
  wiring is verified by `typecheck`/`build` and the acceptance greps. Admin-gate
  behavior is already covered by the existing middleware tests and the inline pattern.
- **Migration must be applied before the site reads settings.** Until `0007_settings.sql`
  runs against `DB_CONN`, `GET /api/settings` returns defaults (rows absent → mapper
  fills from `SETTINGS_DEFAULTS`), so the site still renders correctly.
- **Runes module extension.** The store must be `settings.svelte.ts` (not `.ts`) for
  `$state` to compile; the pure `mergeSettings` reducer is what the unit test exercises.
- **Testid & layout stability.** The four-stat layout, `room-card-price`,
  `stat-item`/`stat-number`, `tab-*`, and `footer-*` testids are preserved; new testids
  are additive (`footer-citq`, `tab-settings`, `panel-settings`, the four inputs).
- **Frontend stays secret-free.** Settings live in Postgres; no new env vars or bindings.
- **No deploy in this change.** Operator sets production values in the admin panel and
  runs `db:migrate` + `deploy:*` after review.
