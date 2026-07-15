# Understanding Brief

## Problem & Objective

The operator wants to (1) **retheme** the Auberge du Vieux Pont marketing site to the
`design/Design_2` "Industrial Zen" language (cool Zen palette, IBM Plex Sans, subtle
scroll/hover animations + a hero shader) and (2) **migrate `apps/web` in place from a
Vite Svelte 5 SPA to SvelteKit** (Svelte 5 runes, `@sveltejs/adapter-cloudflare`,
Tailwind v4) so individual routes can choose SSG / SSR / CSR. Alongside the frontend, add
**email+password auth with Neon-backed sessions**, **admin + profile API surfaces**, two
**HubSpot read ops** for profile enrichment, and an **R2-backed `/img` route** — all while
keeping the existing worker names, www/a/b route topology, A/B deploy pipeline, and the
`apps/api` ↔ `apps/hubspot` service-binding contract intact. All URLs and UI text are French.

## Scope

**IN scope**

- **Framework migration** (`apps/web`): rewrite as SvelteKit + adapter-cloudflare +
  Tailwind v4. Replace the hand-rolled `src/lib/router.ts` / `App.svelte` SPA shell with
  SvelteKit routing. Preserve reusable components (`Nav`, `Footer`, `RoomCard`,
  `SectionLabel`, `ImagePanel`, `Button`, `Contour`, `Wordmark`) and structural CSS
  utilities (`tech-label`, hairlines, `reveal`), re-themed.
- **Re-theme** `app.css` to the Industrial Zen tokens (authoritative
  `design/Design_2/industrial_zen/DESIGN.md`): surface `#f7f9fb` family, primary `#000`,
  secondary `#9d4300` / secondary-container `#fd761a` orange accent, IBM Plex Sans type
  scale. Full-color imagery (drop the grayscale+terracotta duotone). Keep subtle scroll
  reveals, hover transitions, and the WebGL hero shader (`design/Design_2/shader/code.html`).
- **Pages & rendering modes** (French URLs + French UI):
  - `/` Accueil — SSG (`prerender = true`)
  - `/a-propos` À propos — SSG (route already exists as `About.svelte`)
  - `/le-site` Le site — SSG; **merge** inn + rooms + grounds + nearby attractions
    (today `Rooms.svelte` + `Attractions.svelte`) into one rich page with in-page anchor
    nav. **301-redirect** `/chambres → /le-site#chambres`, `/attraits → /le-site#attraits`.
  - `/contact` — SSR; form posts to existing `POST /api/reservations`.
  - `/connexion` — SSR; login **and** open guest registration.
  - `/profil` — CSR (`ssr = false`); authenticated; user info + reservations/CRM data.
  - `/admin` — CSR (`ssr = false`); admin-role only; reservations list/search/detail +
    `hubspot_outbox` management (list by status, view `last_error`, requeue failed→pending).
  - `/politiques`, `/confidentialite` — SSG, footer-linked only (today `Policy.svelte`).
  - Styled **404** consistent with the new design.
- **Auth (`apps/api`)**: new idempotent migrations `users` (id, email unique,
  password_hash, name, role text default `'guest'`, created_at) and `sessions` (token hash,
  user_id, expires_at, created_at); plus a seed migration that idempotently upserts
  `role='admin'` for `ADMIN_EMAIL`. Endpoints `POST /api/auth/register|login|logout`,
  `GET /api/auth/me`. PBKDF2 (SHA-256, ≥100k iters, per-user salt, `algo$iterations$salt$hash`,
  constant-time compare). HttpOnly + Secure + SameSite=Lax host-scoped cookies (no Domain).
  Admin role gates `/api/admin/*`. Stricter auth rate-limit budget (~10/15min per IP) on the
  existing in-memory per-isolate limiter.
- **API additions (`apps/api`)**: `/api/admin/reservations` (list/search),
  `/api/admin/outbox` (list by status), `POST /api/admin/outbox/:id/requeue` (failed→pending),
  `/api/profile` (own contact + reservations, enriched via gateway `/ops/execute`).
- **Gateway additions (`apps/hubspot`)**: read ops `contact.get` (by email) and
  `deal.listByContact` — added to the typed union, `EnvelopeSchema` enum, and `registry` map
  in `src/ops/registry.ts`, with new handler files, for profile enrichment.
- **R2 `/img`**: bind `IMG` r2_buckets (all envs) to the web Worker; serve `GET /img/<key>`
  from the SvelteKit server with `Cache-Control: public, max-age=31536000, immutable`;
  Picsum fallback when a key is missing; reference images as `/img/...` site-wide.
- **Quality gates**: `npm run typecheck` passes in all workspaces; existing vitest suites
  keep passing; new `apps/api` tests (PBKDF2 round-trip, session issue/validate/expiry,
  admin gating); CI verify job (typecheck + tests + build:web) green.

**OUT of scope**

- Auth on the a/b/dev concept surfaces — auth is **www-only**; splitter stays stateless.
- Durable/KV rate limiting (v1 keeps in-memory per-isolate).
- Schema changes to `reservations` (keep email-keyed linkage).
- Uploading the real R2 image assets (keys uploaded later; use descriptive names + document).
- `apps/ab-splitter` logic changes — it keeps forwarding via service bindings unchanged.

## Success Criteria

- Every route renders in its specified mode (verify prerendered HTML for SSG routes, live
  server render for SSR, client-only shell for `/profil` and `/admin`).
- Site is **fully responsive** desktop + mobile: fluid layouts, sensible breakpoints,
  ≥44px touch targets, **no horizontal overflow**; persistent header nav + working mobile
  menu; Connexion/Profil in public nav (Profil only when logged in).
- `/chambres` and `/attraits` return 301 to the correct `/le-site` anchors.
- A guest can register, log in, see `/profil` (own info + reservations enriched from
  HubSpot); an admin can reach `/admin`, search reservations, and requeue a failed outbox
  row to pending; a non-admin is denied `/api/admin/*`.
- `/contact` still creates a reservation → HubSpot contact upsert + deal via the gateway.
- `/img/<key>` serves R2 bytes with immutable caching and Picsum-falls-back on miss.
- Animations are subtle, performant, and **disabled under `prefers-reduced-motion`**
  (static gradient fallback for the shader; also when WebGL is unavailable).
- Worker names (`site-web-web`, `-a`, `-b`) and www/a/b topology + envs unchanged; `IMG`
  bound on all three; A/B pipeline deploys the same SvelteKit build to both variants.
- `npm run typecheck`, all vitest suites (incl. new auth/admin tests), and CI verify pass.

## Key Decisions

- **French is authoritative** for URLs and all UI (including auth/error text).
- **SvelteKit rendering per route** via `+page.ts`/`+page.server.ts` export flags
  (`prerender`, `ssr`); adapter-cloudflare so the built Worker replaces the static-assets
  Worker. `not_found_handling: single-page-application` in wrangler will be superseded by
  the adapter's Worker — confirm the build output/wrangler `main` wiring during planning.
- **Email-keyed profile/reservation linkage** — no FK on `reservations`; `/profile`
  resolves reservations and HubSpot enrichment (`contact.get` + `deal.listByContact`) by the
  session user's email, matching the existing reservation→deal flow.
- **Admin bootstrap via seed migration** reading `ADMIN_EMAIL` (idempotent upsert of
  `role='admin'`; documented manual `UPDATE` fallback in a comment) — migrations remain the
  single source of truth, no login-time allowlist branch.
- **PBKDF2 via WebCrypto** (Workers-native, no deps): SHA-256, ≥100k iterations, per-user
  salt, stored `algo$iterations$salt$hash`, constant-time compare.
- **Cookies**: HttpOnly, Secure, SameSite=Lax, host-scoped (no Domain attribute).
- **Shader on the landing hero only**, lazy-init, paused offscreen via IntersectionObserver,
  static gradient fallback under reduced-motion / no-WebGL.
- **Two new gateway read ops** wired through all three registry sites (union type, enum, map)
  — the registry is a strict typed union, so partial edits will fail typecheck.
- **`/img` served from the SvelteKit server route** (not static assets) reading `IMG`.
- **`app.css` token replacement**, keeping structural utilities (`tech-label`, hairlines,
  `reveal`) that already fit the blueprint/technical-stamping aesthetic.

## Recommendations Adopted

All eight Round-1 recommendations were accepted by the operator, and should guide the SPEC:

1. `DESIGN.md` authoritative → clean token replacement in `app.css`, retheme components,
   keep structural utilities.
2. Reservations/profile keyed by email; enrich via gateway by the same email.
3. Admin bootstrap through an `ADMIN_EMAIL` seed migration (idempotent), manual fallback documented.
4. PBKDF2 (SHA-256, ≥100k iters, per-user salt, `algo$iterations$salt$hash`, constant-time).
5. `/img/<key>` from the SvelteKit server via `IMG`, immutable cache, Picsum fallback on miss.
6. Auth scoped to **www**; `/connexion`, `/profil`, `/admin` `ssr=false`/not linked on a/b/dev;
   splitter stays stateless.
7. Shader on the landing hero only — lazy, offscreen-paused, reduced-motion/no-WebGL fallback.
8. New `apps/api` vitest suite: PBKDF2 round-trip, session issue/validate/expiry, admin gating.

## Anticipated Next Steps

- **R2 assets**: upload real images to the `img` bucket under the documented key list
  (e.g. `hero.jpg`, `chambre-1.jpg`, …); until then Picsum placeholders render.
- **Secrets/vars**: set `ADMIN_EMAIL` (var) on `apps/api` before running the seed migration
  in prod; confirm `DB_CONN` reachable by the new auth queries.
- **Migrations**: run `npm run db:migrate` to create `users` / `sessions` and apply the
  admin seed (idempotent, safe to re-run) before first auth use.
- **Deploy sequencing**: deploy `apps/hubspot` (new read ops) and `apps/api` (new endpoints)
  before/with `apps/web` so `/profil` and `/admin` have live backends; then A/B deploy web to
  `-a`/`-b` and promote to www.
- **CI**: ensure the verify job includes the new `apps/api` tests and `build:web` under the
  SvelteKit build; watch that the SvelteKit adapter build output replaces the old
  static-assets Worker without breaking the www/a/b wrangler envs.
- **Verification pass**: manual responsive/mobile-overflow check, 301 redirect check, and a
  reduced-motion check across the animated sections.
