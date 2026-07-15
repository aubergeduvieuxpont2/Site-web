# Industrial Zen — SvelteKit Migration + Auth/Admin/Profile

## Task

Migrate `apps/web` **in place** from a hand-rolled Vite Svelte 5 SPA to **SvelteKit**
(Svelte 5 runes) using `@sveltejs/adapter-cloudflare` and Tailwind v4, and retheme the
Auberge du Vieux Pont marketing site to the **Industrial Zen** design language
(`design/Design_2/industrial_zen/DESIGN.md`: cool Zen palette, IBM Plex Sans, full-color
imagery, subtle scroll/hover animations, a lazy WebGL hero shader). Per-route rendering
modes (SSG / SSR / CSR) are selected via `+page(.server).ts` flags. Alongside the
frontend, add **email+password auth** with Neon-backed sessions, **admin** and **profile**
API surfaces, **two HubSpot read ops** (`contact.get`, `deal.listByContact`) for profile
enrichment, and an **R2-backed `/img/<key>`** SvelteKit server route. Worker names
(`site-web-web`, `-a`, `-b`), the www/a/b route topology + envs, the A/B deploy pipeline,
and the `apps/api ↔ apps/hubspot` service-binding contract are all preserved. All URLs and
UI text are **French**.

## Schema Changes

Three new **idempotent** migrations in `apps/api/migrations/` (runner splits on `;`, so
**no embedded semicolons and no dollar-quoted bodies**; each statement is a single
`CREATE`/`INSERT`/`UPDATE`). Mirror all three into `apps/api/schema.sql`.

### `0004_users.sql` — `users`
| column | type | notes |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | |
| `email` | `TEXT NOT NULL` | unique via index below |
| `password_hash` | `TEXT NOT NULL` | `pbkdf2$iterations$saltB64$hashB64` |
| `name` | `TEXT` | nullable |
| `role` | `TEXT NOT NULL DEFAULT 'guest'` | `'guest'` \| `'admin'` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

- `CREATE TABLE IF NOT EXISTS users (...)`
- `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email))` (case-insensitive uniqueness).

### `0005_sessions.sql` — `sessions`
| column | type | notes |
|---|---|---|
| `token_hash` | `TEXT PRIMARY KEY` | SHA-256 hex of the opaque cookie token |
| `user_id` | `BIGINT NOT NULL REFERENCES users(id)` | |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

- `CREATE TABLE IF NOT EXISTS sessions (...)`
- `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`.

### `0006_admin_seed.sql` — admin bootstrap
- Idempotent upsert of the admin role for the `ADMIN_EMAIL` var, expressed as a single
  statement with no semicolons. Because the migration runner does not template env vars,
  seed by literal-safe SQL that no-ops when the user does not yet exist:
  `UPDATE users SET role = 'admin' WHERE lower(email) = lower(current_setting('app.admin_email', true))`
  is **not** available (no GUC). Instead the runner is extended minimally: this file uses
  the sentinel `:ADMIN_EMAIL` which `scripts/migrate.mjs` substitutes from `process.env`
  before splitting on `;` (documented). The statement is:
  `UPDATE users SET role = 'admin' WHERE lower(email) = lower(':ADMIN_EMAIL')`.
- A leading SQL comment documents the manual fallback:
  `-- Manual fallback: UPDATE users SET role='admin' WHERE lower(email)=lower('you@example.com');`

## API Types

All request/response bodies are JSON. Error shape is the existing `{ "error": string }`
(400/401/403/429/500). Cookie `session` is HttpOnly, Secure, SameSite=Lax, Path=/, no
Domain.

### Auth (`apps/api`)
```ts
// POST /api/auth/register  -> 201 { user } + Set-Cookie: session
type RegisterRequest = { email: string; password: string; name?: string | null };
// POST /api/auth/login     -> 200 { user } + Set-Cookie: session
type LoginRequest = { email: string; password: string };
// POST /api/auth/logout    -> 200 { ok: true } + Set-Cookie clearing session
// GET  /api/auth/me        -> 200 { user } | 401 { error }
type User = { id: number; email: string; name: string | null; role: "guest" | "admin" };
```
- `RegisterRequest`: `email` trimmed + `.email()` validated; `password` min length 8;
  `name` `trimToNull`. Duplicate email → 409 `{ error: "Un compte existe déjà" }`.
- `LoginRequest`: invalid credentials → 401 `{ error: "Identifiants invalides" }`
  (same message for unknown email and bad password — no user enumeration).

### Admin (`apps/api`, all require `role === 'admin'`; else 401/403)
```ts
// GET  /api/admin/reservations?q=<search>&limit=<n>  -> 200 { reservations: ReservationRow[] }
// GET  /api/admin/outbox?status=<pending|failed|done|all> -> 200 { rows: OutboxRow[] }
// POST /api/admin/outbox/:id/requeue                 -> 200 { row: OutboxRow } | 404
type OutboxRow = {
  id: number; kind: string; status: string; attempts: number;
  dedupe_key: string | null; last_error: string | null; hubspot_id: string | null;
  next_attempt_at: string; created_at: string; updated_at: string;
};
```
- `?q` matches `name`/`email` case-insensitively (`ILIKE`), `limit` defaults 100 (cap 200).
- Requeue only transitions `status='failed'` → `'pending'`, resets `attempts=0`,
  `next_attempt_at=now()`, `last_error=NULL`; non-failed rows return the row unchanged.

### Profile (`apps/api`, requires any authenticated session)
```ts
// GET /api/profile -> 200 { user, reservations, hubspot }
type ProfileResponse = {
  user: User;
  reservations: ReservationRow[];                 // WHERE lower(email)=lower(user.email)
  hubspot: { contact: unknown | null; deals: unknown[] }; // null/[] on gateway failure
};
```
- Enrichment calls the gateway via the `HUBSPOT` binding `POST /ops/execute` with
  `contact.get` then `deal.listByContact` (both keyed by `user.email`); any gateway error
  degrades to `contact: null` / `deals: []` and never fails the endpoint (200 always when
  authenticated).

### Gateway read ops (`apps/hubspot`)
```ts
// contact.get       payload: { email: string }
// deal.listByContact payload: { email: string }
type ExecuteResult = { ok: true; hubspotId?: string; data?: unknown } | NormalizedError;
```
- `contact.get` → search contact by email; `data` = contact properties (or `ok:false 404`
  normalized error when absent). `deal.listByContact` → resolve contact by email, list
  associated deals; `data` = array of deal objects (empty array when none). The
  `OpHandler.execute` return type gains an optional `data?: unknown`.

## Implementation Steps

> Grouped by concern; each step is a single file (small pieces). Do **not** write code in
> unrelated files. Preserve exported component names/props unless a step says otherwise.

### A. Framework & build config (`apps/web`)

### Step 1 — `apps/web/package.json`
Add deps `@sveltejs/kit`, `@sveltejs/adapter-cloudflare`; keep `@sveltejs/vite-plugin-svelte`,
`svelte`, `tailwindcss`, `@tailwindcss/vite`, `vite`, `wrangler`, `typescript`, `svelte-check`.
Add devDep `vitest` + `@sveltejs/kit` sync. Scripts: `dev` → `vite dev`,
`build` → `vite build`, `preview` → `vite preview`, `typecheck` → `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`,
`deploy` → `wrangler deploy`. Remove references to the SPA `dist` build.

### Step 2 — `apps/web/svelte.config.js`
Use `@sveltejs/adapter-cloudflare`; keep `vitePreprocess()`. No custom `kit.files` overrides
needed (default `src/routes`).

### Step 3 — `apps/web/vite.config.ts`
Replace the `svelte()` plugin with `sveltekit()` (`@sveltejs/kit/vite`) plus `tailwindcss()`.
Keep the `/api` dev proxy to `http://localhost:8787`. Drop the `build.outDir: dist` override
(SvelteKit/adapter owns output).

### Step 4 — `apps/web/tsconfig.json`
`extends: "./.svelte-kit/tsconfig.json"`; keep `strict`, `moduleResolution: bundler`. Remove
`include` globs that conflict with the generated config.

### Step 5 — `apps/web/wrangler.jsonc`
Point `main` at the adapter Worker output (`.svelte-kit/cloudflare/_worker.js`) and set
`assets.directory` to `.svelte-kit/cloudflare` with `binding` per adapter docs; **remove**
`not_found_handling: single-page-application` (the SvelteKit Worker owns routing). Keep
`name: site-web-web` and the www route. Add `r2_buckets: [{ binding: "IMG", bucket_name: "img" }]`
to the top-level env **and** to `env.a` (`site-web-web-a`, a.route) and `env.b`
(`site-web-web-b`, b.route) — all three envs get the same `main`, `assets`, and `IMG` binding.

### Step 6 — `apps/web/src/app.html`
Create the SvelteKit HTML shell (replaces `index.html`): `<html lang="fr-CA">`, viewport,
description, `theme-color` `#f7f9fb`, favicon, IBM Plex Sans font `<link>` (drop Mono/Serif
unless still used), `%sveltekit.head%` and `<body ...>%sveltekit.body%</body>`. Delete
`index.html` and `src/main.ts` (mounting is SvelteKit's job).

### Step 7 — `apps/web/src/app.d.ts`
Declare the `App.Platform` interface exposing `env.IMG: R2Bucket` (and other bindings) so
`+server.ts` routes are typed. Include `App.Error`/`App.Locals` stubs as needed.

### Step 8 — `apps/web/src/app.css`
Replace the Industrial-Hospitality `@theme` tokens with **Industrial Zen** tokens from
`DESIGN.md`: `--color-surface:#f7f9fb`, surface-container ladder
(`#ffffff`/`#f2f4f6`/`#eceef0`/`#e6e8ea`/`#e0e3e5`), `--color-ink:#191c1e`,
`--color-ink-variant:#45464d`, `--color-primary:#000000`, `--color-on-primary:#ffffff`,
`--color-secondary:#9d4300`, `--color-secondary-container:#fd761a`,
`--color-outline:#76777d`, `--color-outline-variant:#c6c6cd`, `--color-error:#ba1a1a`,
inverse-surface `#2d3133`. Set `--font-sans:"IBM Plex Sans",...` as the primary family.
Radii: `--radius-sm:0.125rem`, `--radius:0.25rem` (buttons/inputs), `--radius-lg:0.5rem`
(cards). **Keep** structural utilities `tech-label` (retune to IBM Plex Sans uppercase +
tracking), `hairline` (1px `outline-variant`), and `reveal`/`will-reveal`. **Remove** the
grayscale+terracotta `duotone`/`grain` treatments (imagery is now full-color). Base layer
sets `font-family: var(--font-sans)` and background `--color-surface`.

### B. Routing shell & shared UI (`apps/web/src/routes`, `src/lib`)

### Step 9 — `apps/web/src/routes/+layout.svelte`
App shell replacing `App.svelte`: render `Nav` + `<main id="main">{@render children()}</main>`
+ `Footer`. Use `$props()` runes (`let { children } = $props()`). Keep the subtle page-enter
reveal but gate it on `prefers-reduced-motion`.

### Step 10 — `apps/web/src/routes/+layout.ts`
Export shared defaults if any (e.g. `export const prerender = false` baseline). Per-route
files override with `prerender = true` where SSG is required.

### Step 11 — `apps/web/src/lib/router.ts` (delete) + `src/lib/nav.ts` (new, optional)
Delete the hand-rolled History-API router (`router.ts`) and its `link` action; SvelteKit's
`<a>` + client router replace them. If a `NAV` list helper is needed, keep it in
`content.ts`. Update every component importing `{ link }`/`{ navigate }`/`$path` to use
plain `<a href>` and `$app/stores`/`$app/navigation` where active state is needed.

### Step 12 — `apps/web/src/lib/components/Nav.svelte`
Retheme to Zen tokens. Persistent fixed header with wordmark + desktop nav + working mobile
menu (hamburger toggle, ≥44px touch targets, closes on navigation). Links: Accueil (`/`),
Le site (`/le-site`), À propos (`/a-propos`), Contact (`/contact`), **Connexion**
(`/connexion`) — and **Profil** (`/profil`) shown only when authenticated (derive from a
lightweight `GET /api/auth/me` check in the layout or a store). Active link via
`$app/stores` `page.url.pathname`.

### Step 13 — `apps/web/src/lib/components/Footer.svelte`
Retheme; footer-only links to `/politiques` and `/confidentialite`; keep address/contact.

### Step 14 — `apps/web/src/lib/components/{Button,RoomCard,SectionLabel,ImagePanel,PageHeader,Contour,Wordmark}.svelte`
Retheme each to Zen tokens (one step per file when built): full-color imagery in
`ImagePanel` (drop duotone/grain; `/img/<key>` src with Picsum fallback), buttons per
DESIGN (primary = slate/black bg white text; secondary = transparent + 1px border; action =
`secondary-container` orange). Preserve public props. `ImagePanel` `src` now points at
`/img/<key>` keys.

### Step 15 — `apps/web/src/lib/components/HeroShader.svelte` (new)
Encapsulate the WebGL hero shader adapted from `design/Design_2/shader/code.html`: a
`<canvas>` filling the hero, lazy-initialised, **paused offscreen** via `IntersectionObserver`,
cancelled on destroy. Render a **static CSS gradient fallback** (Zen surface tones) when
WebGL is unavailable **or** `prefers-reduced-motion: reduce` matches (do not create the GL
context in that case). Used **only** on the landing hero.

### Step 16 — `apps/web/src/lib/motion.ts`
Keep `reveal`, `revealStagger`, `countUp` actions; ensure all short-circuit under
`prefers-reduced-motion`. Retune easing/opacity to the Zen aesthetic (subtle).

### Step 17 — `apps/web/src/lib/content.ts`
Keep the content constants (`SITE`, `NAV`, `ROOMS`, `AMENITIES`, `ATTRACTIONS`, `STATS`,
`POLICIES`, `PRIVACY`). Update `NAV` to the new French routes (`/le-site` replaces
`/chambres`+`/attraits`; add `/connexion`). Replace Picsum `seed` usage with documented
`/img/<key>` keys (e.g. `hero.jpg`, `chambre-1.jpg`…`chambre-4.jpg`, `attrait-*.jpg`,
`le-site-*.jpg`) — keep a `seed` fallback field for Picsum.

### Step 18 — `apps/web/src/lib/api.ts` (new)
Typed `fetch` helpers for the browser (and SSR `event.fetch`): `getMe()`, `login()`,
`register()`, `logout()`, `getProfile()`, `adminReservations()`, `adminOutbox()`,
`requeueOutbox()`, `createReservation()`. All hit same-origin `/api/*`, send
`credentials: 'include'`, and surface `{ error }` messages.

### C. Pages (French URLs, per-route render modes)

### Step 19 — `apps/web/src/routes/+page.svelte` + `+page.ts` (Accueil, SSG)
`export const prerender = true`. Port `Home.svelte` content, add the `HeroShader` hero,
featured rooms/amenities/stats/CTAs, all re-themed and responsive.

### Step 20 — `apps/web/src/routes/a-propos/+page.svelte` + `+page.ts` (SSG)
`prerender = true`. Port `About.svelte`.

### Step 21 — `apps/web/src/routes/le-site/+page.svelte` + `+page.ts` (SSG, merged)
`prerender = true`. **Merge** `Rooms.svelte` + `Attractions.svelte` (+ inn/grounds intro)
into one page with in-page anchor nav and sections `id="chambres"`, `id="attraits"`
(plus grounds). Uses `ROOMS`, `AMENITIES`, `ATTRACTIONS`.

### Step 22 — `apps/web/src/routes/chambres/+page.ts` + `apps/web/src/routes/attraits/+page.ts` (301 redirects)
Each exports a `load` that throws `redirect(301, '/le-site#chambres')` /
`redirect(301, '/le-site#attraits')`. Mark `prerender = true` so the redirect is emitted at
build time and honored by the Worker.

### Step 23 — `apps/web/src/routes/contact/+page.svelte` + `+page.ts` (SSR)
No prerender (SSR default). Retheme `Contact.svelte`; form POSTs to `POST /api/reservations`
via `api.ts` (`createReservation`), preserving the existing external contract (400
`{ error }` messages, success 201). Show success/error states.

### Step 24 — `apps/web/src/routes/connexion/+page.svelte` + `+page.ts` (SSR)
SSR. Combined **login** + **open guest registration** forms (French labels/errors). On
success, redirect to `/profil`. Uses `api.ts` `login`/`register`.

### Step 25 — `apps/web/src/routes/profil/+page.svelte` + `+page.ts` (CSR)
`export const ssr = false`. Client-only: on mount call `getMe()`; if unauthenticated,
redirect to `/connexion`. Render user info + own reservations + HubSpot-enriched
contact/deals from `GET /api/profile`.

### Step 26 — `apps/web/src/routes/admin/+page.svelte` + `+page.ts` (CSR, admin-only)
`export const ssr = false`. Client-only: `getMe()`; if `role !== 'admin'` show a denied
state / redirect. Reservations list + search box (`?q=`); outbox list filterable by status,
showing `last_error`, with a **Requeue** action (failed→pending) calling
`POST /api/admin/outbox/:id/requeue`.

### Step 27 — `apps/web/src/routes/politiques/+page.svelte` + `+page.ts` and `confidentialite/+page.svelte` + `+page.ts` (SSG)
`prerender = true`. Port `Policy.svelte` split into the two footer-linked pages using
`POLICIES` / `PRIVACY`.

### Step 28 — `apps/web/src/routes/+error.svelte` (styled 404)
Themed error page consistent with the new design; friendly French copy + link home.

### Step 29 — `apps/web/src/routes/img/[...key]/+server.ts` (R2)
`GET` handler reading `platform.env.IMG`. On hit, stream the object with
`Cache-Control: public, max-age=31536000, immutable` and the stored content-type. On miss,
**302/proxy to Picsum** (`https://picsum.photos/seed/<key>/1200/800`) or fetch-and-return so
placeholders render until real assets are uploaded. `export const prerender = false`.

### D. Backend auth/session (`apps/api`)

### Step 30 — `apps/api/migrations/0004_users.sql`, `0005_sessions.sql`, `0006_admin_seed.sql`
Author the three migrations per **Schema Changes** (idempotent, no embedded `;`, no
dollar-quoting). One file each.

### Step 31 — `apps/api/schema.sql`
Mirror the `users`, `sessions`, and admin-seed changes into the reference schema.

### Step 32 — `apps/api/scripts/migrate.mjs`
Minimal extension: before splitting a file on `;`, substitute the `:ADMIN_EMAIL` sentinel
with `process.env.ADMIN_EMAIL` (SQL-escaping single quotes); a missing `ADMIN_EMAIL` makes
the seed a harmless no-op `UPDATE ... WHERE lower(email)=lower('')`. Document the behavior in
a comment. Keep existing discovery/sort/split semantics for all other files.

### Step 33 — `apps/api/src/auth/password.ts` (new)
WebCrypto **PBKDF2** (SHA-256, ≥100,000 iterations, 16-byte per-user salt). `hashPassword`
returns `pbkdf2$<iterations>$<saltB64>$<hashB64>`. `verifyPassword(password, stored)` parses
the fields and does a **constant-time** compare of the derived bytes.

### Step 34 — `apps/api/src/auth/session.ts` (new)
`createSession(sql, userId, ttlDays=30)` → generate a high-entropy opaque token
(`crypto.getRandomValues`), store `sha256hex(token)` + `user_id` + `expires_at`, return the
raw token. `validateSession(sql, token)` → look up by hash, reject if expired, return the
joined `User` or `null`. `deleteSession(sql, token)`. Cookie helpers set/clear the `session`
cookie (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, `Max-Age` = ttl).

### Step 35 — `apps/api/src/auth/middleware.ts` (new)
`requireAuth` (401 when no valid session, attaches `user` to context) and `requireAdmin`
(403 when `role !== 'admin'`). A stricter in-memory rate limiter (~10 requests / 15 min per
IP), separate budget from the existing 30/15min limiter, applied to `/api/auth/*`.

### Step 36 — `apps/api/src/index.ts` (routes)
Wire new routes with `zValidator('json', …, hook)` reusing the `{ error }` hook shape:
`POST /api/auth/register|login|logout`, `GET /api/auth/me`; `GET /api/admin/reservations`,
`GET /api/admin/outbox`, `POST /api/admin/outbox/:id/requeue` (behind `requireAdmin`);
`GET /api/profile` (behind `requireAuth`, enrich via `HUBSPOT` binding `/ops/execute`
`contact.get` + `deal.listByContact`, degrade gracefully). Extend `Bindings` with
`ADMIN_EMAIL: string`. Apply the stricter auth limiter to `/api/auth/*`. Do **not** change
the existing `/api/messages` or `/api/reservations` behavior; add the four www/a/b/dev
origins already present to CORS if new methods needed (keep GET/POST/OPTIONS).

### Step 37 — `apps/api/wrangler.jsonc`
Add `"vars": { "ADMIN_EMAIL": "" }` (documented; set per-env in prod) and keep the `HUBSPOT`
service binding + routes untouched.

### E. Backend tests (`apps/api`)

### Step 38 — `apps/api/package.json` + `apps/api/vitest.config.ts`
Add `vitest` devDep and `"test": "vitest run"`. Add a `vitest.config.ts` (node/worker
environment consistent with the hubspot suite).

### Step 39 — `apps/api/test/auth.test.ts` (new)
PBKDF2 round-trip (hash→verify true; wrong password false; constant-time path exercised);
stored-format shape assertion. Fetch/DB stubbed.

### Step 40 — `apps/api/test/session.test.ts` (new)
Session issue → validate → expiry (expired token rejected; unknown token rejected), with the
`neon` SQL client stubbed.

### Step 41 — `apps/api/test/admin-gating.test.ts` (new)
`requireAdmin` denies guests/anonymous (403/401) and allows admins on `/api/admin/*`; profile
route requires auth. Gateway `fetch` and SQL stubbed.

### F. Gateway read ops (`apps/hubspot`)

### Step 42 — `apps/hubspot/src/ops/contactGet.ts` (new)
`ContactGetSchema = { email }`. `executeContactGet(env, payload)` searches the contact by
email; returns `{ ok: true, hubspotId, data: properties }` or the normalized 404 when
absent, via `hubspotFetch`.

### Step 43 — `apps/hubspot/src/ops/dealList.ts` (new)
`DealListByContactSchema = { email }`. `executeDealListByContact(env, payload)` resolves the
contact by email then lists associated deals (v4 associations id 3), returning
`{ ok: true, data: deals[] }` (empty array when none).

### Step 44 — `apps/hubspot/src/ops/registry.ts` (edit all three sites)
Add `"contact.get"` and `"deal.listByContact"` to (1) the `OpEnvelope.kind` **union**,
(2) the `EnvelopeSchema` `z.enum([...])`, and (3) the `registry` map (with `payloadSchema` +
`execute`). Widen `OpHandler.execute` return to
`{ ok: true; hubspotId?: string; data?: unknown } | NormalizedError`. Edit **all three**
sites together — the registry is a strict typed union and partial edits fail typecheck.

### Step 45 — `apps/hubspot/test/ops.test.ts` (extend)
Add tests for `contact.get` (found → data; missing → normalized 404) and
`deal.listByContact` (deals present → array; none → empty array), fetch stubbed in the
existing pattern. Keep all 57 existing tests passing.

### G. Docs, scripts, CI

### Step 46 — `.dev.env.example`
Document `ADMIN_EMAIL=` (admin bootstrap seed) with a comment that it must be set before
`db:migrate` in prod; note `DB_CONN` is used by the new auth queries.

### Step 47 — root `package.json`
Verify `dev:web`/`build:web`/`deploy:web` still work under SvelteKit (`build:web` →
`npm run build --workspace apps/web`). Confirm `test` runs `apps/api` + `apps/hubspot`
suites (`--workspaces --if-present`). No new scripts strictly required.

### Step 48 — `.github/workflows/ci.yml` and `deploy-prod.yml`
CI `verify` already runs typecheck + `npm test --workspaces` + `build:web` — confirm it
covers the new `apps/api` tests and the SvelteKit `build:web`. In `deploy-prod.yml`, keep
the deploy order (HubSpot → API → web → splitter); web deploy now ships the SvelteKit adapter
Worker. Document that `IMG` bucket + `ADMIN_EMAIL` var must exist before deploy.

## Acceptance Criteria

1. `npm run typecheck` passes in **all** workspaces (`apps/web`, `apps/api`, `apps/hubspot`).
2. `npm test --workspaces --if-present` passes: the existing 57 `apps/hubspot` tests plus the
   new `apps/hubspot` `contact.get`/`deal.listByContact` tests and the new `apps/api`
   auth/session/admin-gating tests.
3. `npm run build:web` produces a SvelteKit `adapter-cloudflare` Worker build; `apps/web`
   `wrangler.jsonc` `main`/`assets` point at that output and no longer set
   `not_found_handling: single-page-application`.
4. Prerendered HTML exists for `/`, `/a-propos`, `/le-site`, `/politiques`,
   `/confidentialite` (SSG); `/contact` and `/connexion` render server-side (SSR);
   `/profil` and `/admin` export `ssr = false` (client-only shell).
5. `GET /chambres` returns **301** to `/le-site#chambres` and `GET /attraits` returns **301**
   to `/le-site#attraits`.
6. `POST /api/auth/register` with a new email returns 201, a `session` cookie
   (HttpOnly, Secure, SameSite=Lax, no Domain), and `{ user }` with `role:"guest"`; a
   duplicate email returns 409.
7. `POST /api/auth/login` with valid credentials returns 200 + `session` cookie; invalid
   credentials return 401 with an identical message for unknown-email and wrong-password.
8. `GET /api/auth/me` returns 200 `{ user }` with a valid cookie and 401 without.
9. `POST /api/auth/logout` clears the cookie and subsequent `GET /api/auth/me` returns 401.
10. Password hashes are stored as `pbkdf2$<iterations>$<salt>$<hash>` with iterations
    ≥100,000; `verifyPassword` returns true for the correct password and false otherwise.
11. A valid session validates before `expires_at` and is rejected after; unknown tokens are
    rejected.
12. `GET /api/profile` with a guest session returns 200 `{ user, reservations, hubspot }`
    where `reservations` are the rows whose email matches the session user (case-insensitive);
    when the gateway is unreachable, `hubspot.contact` is `null` and `hubspot.deals` is `[]`
    and the status is still 200.
13. `GET /api/admin/reservations`, `GET /api/admin/outbox`, and
    `POST /api/admin/outbox/:id/requeue` return 200 for an admin session and 403 (401 when
    anonymous) for a guest. `?q=` filters reservations by name/email; requeue transitions a
    `failed` row to `pending` (attempts 0, `last_error` NULL) and returns the updated row.
14. The gateway `POST /ops/execute` accepts `contact.get` and `deal.listByContact`: a present
    contact returns `{ ok: true, data }`; a missing contact returns a normalized
    `{ ok: false, status: 404 }`; `deal.listByContact` returns `{ ok: true, data: [] }` when
    the contact has no deals.
15. `POST /api/reservations` still returns 201 with the existing `{ reservation }` shape and
    still enqueues `contact.upsert` + `deal.create` on the gateway (unchanged external
    contract, including the 400 `{ error }` validation shape).
16. `GET /img/<key>` returns R2 bytes with `Cache-Control: public, max-age=31536000, immutable`
    on a hit and a Picsum placeholder on a miss.
17. The site is fully responsive: no horizontal overflow at 360px–1440px, persistent header
    nav, a working mobile menu with ≥44px touch targets; Connexion is in the public nav and
    Profil appears only when authenticated.
18. All animations (scroll reveals, hover transitions, hero shader) are disabled under
    `prefers-reduced-motion: reduce`; the hero shows the static gradient fallback under
    reduced-motion or when WebGL is unavailable.
19. Worker names `site-web-web` / `-a` / `-b` and the www/a/b routes + envs are unchanged, and
    the `IMG` R2 binding is present on all three web envs.
