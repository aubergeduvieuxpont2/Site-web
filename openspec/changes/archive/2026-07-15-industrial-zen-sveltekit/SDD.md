# System Design — Industrial Zen SvelteKit Migration

## System Overview

The application is a Cloudflare-hosted, service-based monorepo. This change reshapes the
frontend and extends two backend services while keeping the HTTP/service-binding contracts
between them intact.

- **`apps/web`** — migrates from a Vite Svelte 5 SPA (custom History-API router, static
  assets served by a Worker) to **SvelteKit** (Svelte 5 runes) built with
  `@sveltejs/adapter-cloudflare`. The build now emits a **Worker** (`.svelte-kit/cloudflare`)
  that owns routing and can render each route as SSG (`prerender = true`), SSR (default), or
  CSR (`ssr = false`). Styling stays Tailwind v4 but the `@theme` tokens are replaced with
  the **Industrial Zen** palette + IBM Plex Sans. A new `/img/[...key]` server route reads an
  R2 bucket. Worker names (`site-web-web`, `-a`, `-b`) and www/a/b routes/envs are unchanged;
  the A/B splitter forwards to the same SvelteKit build.
- **`apps/api`** — Hono Worker on Neon Postgres. Gains email+password auth (PBKDF2 via
  WebCrypto), Neon-backed sessions, admin + profile surfaces, and three new idempotent
  migrations (`users`, `sessions`, admin seed). Talks to the gateway over the existing
  `HUBSPOT` service binding.
- **`apps/hubspot`** — Hono gateway Worker. Gains two **read** ops (`contact.get`,
  `deal.listByContact`) wired through the strict typed registry (union + enum + map) for
  profile enrichment.
- **`apps/ab-splitter`** — unchanged; keeps forwarding via service bindings.

## Architecture Decisions

1. **SvelteKit + adapter-cloudflare replaces the static-assets Worker.** The adapter output
   becomes the Worker `main`; `not_found_handling: single-page-application` is removed
   because SvelteKit's Worker handles unmatched routes (including the styled `+error.svelte`).
   Per-route render mode is chosen by `+page(.server).ts` flags rather than a single SPA
   shell — this is the core enabler for SSG landing pages, SSR forms, and CSR authed views.
2. **French is authoritative** for URLs and all UI text (auth/error copy included). `/le-site`
   merges the former `/chambres` + `/attraits`; those paths become **301 redirects** to
   anchors on `/le-site` via prerendered `redirect(301, …)` loads.
3. **Auth = PBKDF2 (WebCrypto) + opaque cookie sessions in Neon.** No external dependency;
   Workers-native. The cookie carries a high-entropy opaque token; only its SHA-256 hash is
   stored, so a DB leak does not yield usable tokens. Cookies are HttpOnly + Secure +
   SameSite=Lax + host-scoped (no Domain) to bind them to `www` only.
4. **Email-keyed linkage, no schema change to `reservations`.** Profile and admin resolve a
   user's reservations by `lower(email)`; HubSpot enrichment uses the same email through the
   gateway. This matches the existing reservation→deal flow and avoids a migration on
   `reservations`.
5. **Admin bootstrap via seed migration**, not a login-time allowlist. `0006_admin_seed.sql`
   idempotently upserts `role='admin'` for `ADMIN_EMAIL` (substituted by the migration runner
   from `process.env`), keeping migrations the single source of truth. A manual `UPDATE`
   fallback is documented in-file.
6. **Two gateway read ops through the strict registry.** Because the registry is a typed
   union (`OpEnvelope.kind`), the `EnvelopeSchema` enum, and the `registry` map must be edited
   **together**; `OpHandler.execute` is widened with an optional `data?: unknown` so read ops
   can return payloads without breaking the write-op contract.
7. **`/img` from the SvelteKit server, not static assets.** A `[...key]` server route reads
   `platform.env.IMG` (R2), sets a one-year immutable cache header on hits, and falls back to
   Picsum on misses so the site renders before real assets are uploaded.
8. **Shader isolated to the landing hero**, lazy-initialised, paused offscreen via
   `IntersectionObserver`, with a static-gradient fallback under `prefers-reduced-motion` or
   when WebGL is unavailable — bounding its cost and honoring accessibility.
9. **Rate limiting stays in-memory per-isolate** (v1), with a **stricter** separate budget for
   `/api/auth/*` (~10/15 min per IP) layered on the existing 30/15 min limiter.

## Component Responsibilities

### `apps/web`
- `svelte.config.js` / `vite.config.ts` / `wrangler.jsonc` / `tsconfig.json` — SvelteKit +
  adapter-cloudflare build wiring; `IMG` R2 binding on all three envs; `main`/`assets` point
  at the adapter output.
- `src/app.html` / `src/app.css` / `src/app.d.ts` — HTML shell, Industrial Zen `@theme`
  tokens + retained structural utilities, and `App.Platform` typing (`env.IMG`).
- `src/routes/+layout.svelte` — Nav + `<main>` + Footer shell (replaces `App.svelte`).
- Route pages — Accueil `/` (SSG), `/a-propos` (SSG), `/le-site` (SSG, merged),
  `/chambres` + `/attraits` (301), `/contact` (SSR), `/connexion` (SSR), `/profil` (CSR),
  `/admin` (CSR), `/politiques` + `/confidentialite` (SSG), `+error.svelte` (styled 404).
- `src/routes/img/[...key]/+server.ts` — R2 image proxy with immutable caching + Picsum
  fallback.
- `src/lib/components/*` — retheme; `HeroShader.svelte` (new WebGL hero); `ImagePanel` now
  full-color and `/img/<key>`-sourced.
- `src/lib/motion.ts` — reveal/stagger/countUp actions, reduced-motion-safe.
- `src/lib/content.ts` — content constants + updated NAV + documented image keys.
- `src/lib/api.ts` — same-origin `/api/*` client (credentials-included).

### `apps/api`
- `migrations/0004_users.sql`, `0005_sessions.sql`, `0006_admin_seed.sql` + `schema.sql`
  mirror — schema + admin seed.
- `scripts/migrate.mjs` — adds `:ADMIN_EMAIL` substitution before the `;` split.
- `src/auth/password.ts` — PBKDF2 hash/verify (constant-time).
- `src/auth/session.ts` — session create/validate/delete + cookie helpers.
- `src/auth/middleware.ts` — `requireAuth`, `requireAdmin`, stricter auth rate limiter.
- `src/index.ts` — auth/admin/profile routes; `Bindings` gains `ADMIN_EMAIL`.
- `vitest.config.ts` + `test/*` — PBKDF2, session lifecycle, admin gating.

### `apps/hubspot`
- `src/ops/contactGet.ts`, `src/ops/dealList.ts` — read-op handlers.
- `src/ops/registry.ts` — union + enum + map wiring (+ widened `execute` return).
- `test/ops.test.ts` — new op tests.

## Data Flow

1. **SSG page (e.g. `/le-site`)** — prerendered at `build:web`; the SvelteKit Worker serves
   static HTML; client hydration runs reveal animations (reduced-motion-safe).
2. **Contact (SSR)** — `/contact` renders server-side; the form POSTs to `/api/reservations`;
   the API inserts the row and, in `waitUntil`, enqueues `contact.upsert` + `deal.create` on
   the gateway (unchanged). Response is the existing `{ reservation }`.
3. **Register/Login** — browser → `POST /api/auth/register|login` → API validates, PBKDF2
   hash/verify against `users`, `createSession` inserts a hashed token into `sessions`, and
   sets the `session` cookie. `GET /api/auth/me` validates the cookie each call.
4. **Profile (CSR)** — `/profil` shell loads client-side, calls `GET /api/profile` with the
   cookie. The API validates the session, selects reservations by `lower(email)`, and calls
   the gateway `POST /ops/execute` twice (`contact.get`, `deal.listByContact`) keyed by the
   user's email; gateway failures degrade to `null`/`[]` without failing the response.
5. **Admin (CSR)** — `/admin` shell calls `GET /api/admin/*` behind `requireAdmin`; requeue
   POSTs flip a `failed` outbox row to `pending`, picked up by the gateway cron drain.
6. **Image request** — `GET /img/<key>` → SvelteKit server reads `platform.env.IMG`; hit →
   bytes + immutable cache; miss → Picsum placeholder.

## Known Constraints

- **Migration runner splits on `;`** — every migration statement must be single, with **no
  embedded semicolons and no dollar-quoted bodies**. The admin seed uses a `:ADMIN_EMAIL`
  sentinel substituted before the split; a missing env var makes it a safe no-op.
- **Adapter output vs. wrangler wiring** — `main`/`assets` must match the adapter's output
  directory (`.svelte-kit/cloudflare`) and `not_found_handling` must be dropped; all three
  web envs (www/a/b) must carry identical `main`/`assets`/`IMG`.
- **Strict typed registry** — partial edits to the gateway op union/enum/map fail typecheck;
  all three sites plus the `execute` return type change together.
- **In-memory rate limiting** is per-isolate and resets on cold start (accepted for v1; no KV
  or durable limiter).
- **No `reservations` schema change** — linkage is by email; unauthenticated reservations
  remain supported and simply won't appear under a profile unless the email matches.
- **Auth is www-only** — `/connexion`, `/profil`, `/admin` are not linked on a/b/dev and the
  splitter stays stateless; the shared build simply doesn't surface them there.
- **R2 assets not uploaded in this change** — Picsum placeholders render until real keys
  (`hero.jpg`, `chambre-1..4.jpg`, `attrait-*.jpg`, …) are uploaded to the `img` bucket.
- **Secrets/vars** — `ADMIN_EMAIL` must be set on `apps/api` before the seed migration in
  prod; `DB_CONN` must be reachable by the new auth queries.
