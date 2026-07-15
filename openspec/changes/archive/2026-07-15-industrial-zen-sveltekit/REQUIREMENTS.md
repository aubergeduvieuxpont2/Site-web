# Requirements — Industrial Zen SvelteKit Migration

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — `apps/web` is migrated **in place** to SvelteKit (Svelte 5 runes) with
  `@sveltejs/adapter-cloudflare` and Tailwind v4; the hand-rolled `router.ts`/`App.svelte`
  SPA shell is removed in favor of SvelteKit file-based routing and a `+layout.svelte` shell.
- **FR-2 (MUST)** — `app.css` uses the Industrial Zen tokens from
  `design/Design_2/industrial_zen/DESIGN.md` (surface `#f7f9fb` family, primary `#000`,
  secondary `#9d4300`/container `#fd761a`, IBM Plex Sans type scale); imagery is full-color;
  structural utilities `tech-label`, `hairline`, `reveal` are retained (retuned).
- **FR-3 (MUST)** — Routes render in their specified modes: `/` (SSG), `/a-propos` (SSG),
  `/le-site` (SSG, merges rooms+grounds+attractions with in-page anchor nav), `/contact`
  (SSR), `/connexion` (SSR), `/profil` (CSR, authed), `/admin` (CSR, admin-only),
  `/politiques` (SSG), `/confidentialite` (SSG), plus a styled 404.
- **FR-4 (MUST)** — `GET /chambres` → **301** `/le-site#chambres`; `GET /attraits` → **301**
  `/le-site#attraits`.
- **FR-5 (MUST)** — Persistent header nav + working mobile menu (≥44px touch targets); public
  nav shows Connexion always and Profil only when authenticated.
- **FR-6 (MUST)** — `apps/api` provides `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`; registration is **open** guest registration;
  sessions are Neon-backed; cookies are HttpOnly + Secure + SameSite=Lax + host-scoped.
- **FR-7 (MUST)** — Passwords are hashed with **PBKDF2** (SHA-256, ≥100,000 iterations,
  per-user salt), stored as `pbkdf2$iterations$salt$hash`, verified in constant time.
- **FR-8 (MUST)** — Idempotent migrations create `users` and `sessions`; a seed migration
  idempotently upserts `role='admin'` for `ADMIN_EMAIL`; `/api/admin/*` is admin-gated.
- **FR-9 (MUST)** — `apps/api` provides `GET /api/admin/reservations` (list/search),
  `GET /api/admin/outbox` (list by status), `POST /api/admin/outbox/:id/requeue`
  (failed→pending), and `GET /api/profile` (own reservations by email + HubSpot enrichment).
- **FR-10 (MUST)** — `apps/hubspot` adds read ops `contact.get` and `deal.listByContact`
  across the typed union, `EnvelopeSchema` enum, and `registry` map, with handler files and
  tests; `OpHandler.execute` return is widened with an optional `data`.
- **FR-11 (MUST)** — An `IMG` R2 binding is present on all three web envs; `GET /img/<key>`
  serves R2 bytes with `Cache-Control: public, max-age=31536000, immutable` and falls back to
  Picsum on a miss; images are referenced as `/img/...` site-wide (documented key list).
- **FR-12 (MUST)** — `/contact` still creates a reservation via `POST /api/reservations`
  (unchanged external contract), which still enqueues `contact.upsert` + `deal.create`.
- **FR-13 (SHOULD)** — A landing-hero WebGL shader (adapted from
  `design/Design_2/shader/code.html`) initialises lazily, pauses offscreen, and falls back to
  a static gradient under `prefers-reduced-motion` or when WebGL is unavailable.
- **FR-14 (SHOULD)** — Subtle scroll reveals and hover transitions are preserved and disabled
  under `prefers-reduced-motion`.
- **FR-15 (MUST)** — New `apps/api` vitest suite covers PBKDF2 round-trip, session
  issue/validate/expiry, and admin gating; existing 57 `apps/hubspot` tests keep passing plus
  the new gateway op tests.

### Non-Functional Requirements

- **NFR-1 (Performance)** — SSG routes serve prerendered HTML; the hero shader is lazy and
  offscreen-paused; `/img` hits carry a one-year immutable cache. No horizontal overflow at
  360px–1440px.
- **NFR-2 (Security)** — Opaque session tokens stored only as SHA-256 hashes; constant-time
  password compare; cookies HttpOnly/Secure/SameSite=Lax/host-scoped; login errors do not
  distinguish unknown-email from wrong-password; `/api/admin/*` denies non-admins; stricter
  auth rate limit (~10/15 min per IP).
- **NFR-3 (Availability)** — Profile HubSpot enrichment degrades gracefully (contact `null`,
  deals `[]`) on gateway failure without failing the endpoint.
- **NFR-4 (Compatibility)** — Worker names `site-web-web`/`-a`/`-b` and www/a/b routes+envs
  unchanged; the A/B pipeline deploys the same SvelteKit build to both variants; the
  `apps/api ↔ apps/hubspot` service-binding contract is preserved.
- **NFR-5 (Quality gate)** — `npm run typecheck` passes in all workspaces; all vitest suites
  pass; CI `verify` (typecheck + tests + `build:web`) is green.

### Constraints

- Migration runner splits on `;`: no embedded semicolons / dollar-quoting in migration files.
- WebCrypto-only crypto (no new crypto dependency) on Cloudflare Workers.
- Rate limiting remains in-memory per-isolate (no KV/durable store) for v1.
- No schema change to `reservations`; profile/admin linkage is by email.
- The gateway registry is a strict typed union — union/enum/map edited together.
- SvelteKit adapter output must match `wrangler.jsonc` `main`/`assets`; `not_found_handling`
  removed.
- Generated `SDD.ir.yaml` must be strictly valid YAML: quote scalars like `"string?"` and
  `"Type[]"` inside flow mappings; task scopes reference only defined IDs (never bare section
  names like `NFR`/`DATA`).

## Out of Scope (Exclusions)

- Auth on the a/b/dev concept surfaces — auth is **www-only**; the splitter stays stateless.
- Durable/KV-backed rate limiting.
- Any schema change to `reservations` (keep email-keyed linkage).
- Uploading real R2 image assets (keys documented; Picsum placeholders until uploaded).
- `apps/ab-splitter` logic changes (keeps forwarding via service bindings unchanged).
- Inbound HubSpot webhooks, Cloudflare Queues, and any HubSpot ops beyond the two new read
  ops.

## Acceptance Criteria

1. `npm run typecheck` passes in `apps/web`, `apps/api`, and `apps/hubspot`.
2. `npm test --workspaces --if-present` passes: 57 existing `apps/hubspot` tests + new
   gateway op tests + new `apps/api` auth/session/admin-gating tests.
3. `npm run build:web` builds a SvelteKit `adapter-cloudflare` Worker; `apps/web`
   `wrangler.jsonc` `main`/`assets` reference that output and omit
   `not_found_handling: single-page-application`.
4. `/`, `/a-propos`, `/le-site`, `/politiques`, `/confidentialite` are prerendered (SSG);
   `/contact`, `/connexion` render server-side (SSR); `/profil`, `/admin` export `ssr = false`.
5. `GET /chambres` → 301 `/le-site#chambres`; `GET /attraits` → 301 `/le-site#attraits`.
6. `POST /api/auth/register` (new email) → 201 + `session` cookie
   (HttpOnly/Secure/SameSite=Lax/no Domain) + `{ user, role:"guest" }`; duplicate → 409.
7. `POST /api/auth/login` valid → 200 + cookie; invalid → 401 with identical message for
   unknown-email vs wrong-password.
8. `GET /api/auth/me` → 200 `{ user }` with a valid cookie, 401 without; after
   `POST /api/auth/logout` the cookie is cleared and `me` returns 401.
9. Password hashes match `pbkdf2$<iterations≥100000>$<salt>$<hash>`; `verifyPassword` is true
   for the right password and false otherwise; a valid session validates before `expires_at`
   and is rejected after; unknown tokens are rejected.
10. `GET /api/profile` (guest) → 200 `{ user, reservations, hubspot }` with reservations
    matched by `lower(email)`; on gateway failure `hubspot.contact` is `null`,
    `hubspot.deals` is `[]`, status still 200.
11. `GET /api/admin/reservations`, `GET /api/admin/outbox`, `POST /api/admin/outbox/:id/requeue`
    → 200 for admin, 403 for guest / 401 for anonymous; `?q=` filters by name/email; requeue
    flips a `failed` row to `pending` (attempts 0, `last_error` NULL) and returns it.
12. Gateway `POST /ops/execute` `contact.get` returns `{ ok:true, data }` when present and a
    normalized `{ ok:false, status:404 }` when absent; `deal.listByContact` returns
    `{ ok:true, data:[] }` when the contact has no deals.
13. `POST /api/reservations` still returns 201 `{ reservation }`, keeps the 400 `{ error }`
    validation shape, and still enqueues `contact.upsert` + `deal.create`.
14. `GET /img/<key>` returns R2 bytes with `Cache-Control: public, max-age=31536000, immutable`
    on a hit and a Picsum placeholder on a miss.
15. No horizontal overflow at 360px–1440px; persistent nav + working mobile menu with ≥44px
    touch targets; Connexion always in nav, Profil only when authenticated.
16. Under `prefers-reduced-motion: reduce` (or no WebGL) all animations are disabled and the
    hero shows the static gradient fallback.
17. Worker names `site-web-web`/`-a`/`-b` and www/a/b routes+envs are unchanged and `IMG` is
    bound on all three web envs.
