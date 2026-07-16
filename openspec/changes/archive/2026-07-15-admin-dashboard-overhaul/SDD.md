# Admin Dashboard & User-Workflow Overhaul — SDD

## System Overview

Three independently-deployed Cloudflare Workers over one Neon Postgres database:

- **`apps/web`** — Svelte 5 SPA (static assets via a Worker). Client-only auth-gated pages
  (`/admin`, `/profil`, `/reinitialisation`) fetch `/api/*` same-origin with the HttpOnly
  `session` cookie. No secrets.
- **`apps/api`** — Hono Worker. Owns users, sessions, reservations, settings, room
  visibility, password-reset tokens. Reaches Neon via `@neondatabase/serverless` using
  `c.env.DB_CONN`. Talks to the HubSpot gateway through the `HUBSPOT` service binding
  (`c.env.HUBSPOT.fetch("http://hubspot/…")`).
- **`apps/hubspot`** — Hono gateway Worker. Owns the durable `hubspot_outbox` and all
  HubSpot CRM calls. Two entry points used here: `POST /ops/enqueue` (durable, async) and
  the op registry that executes `contact.upsert`.

This change adds no new service and no new external dependency. It adds three migrations,
several API routes, one gateway op behavior change, one new web route, and admin/profile UI.

## Architecture Decisions

- **AD-1 — Reuse existing crypto/session primitives.** Reset tokens reuse `generateToken`
  (32-byte hex) and `sha256hex` from `apps/api/src/auth/session.ts`; passwords reuse the
  PBKDF2 `hashPassword`/`verifyPassword`. These two functions are promoted from
  file-private to `export` rather than duplicated. No new crypto is introduced.
- **AD-2 — Store only token hashes at rest.** `password_reset_tokens.token_hash` is the
  SHA-256 of the raw token; the raw token appears only in the returned URL and never in the
  DB — mirroring the sessions table design.
- **AD-3 — Inline admin gating, copied verbatim.** Every new `/api/admin/*` route uses the
  existing pattern (`getAuthUser` → 401 if none → 403 if `role !== "admin"`). POST routes
  that also validate a body run the auth check in a `(c, next)` middleware BEFORE
  `zValidator`, so unauthenticated callers get 401, not schema 400 (as `/api/admin/settings`
  already does).
- **AD-4 — No account enumeration on forgot.** `POST /api/auth/forgot` performs the lookup
  and token creation conditionally but always returns the identical 200 body; it sits behind
  the stricter `authRateLimiter`. The UI shows one generic confirmation message.
- **AD-5 — `name` stays the display/HubSpot source of truth.** New first/last columns are
  additive; `name` is derived (`"First Last"`) and still written on register, keeping every
  existing consumer (profile display, reservation prefill, `contact.upsert` name) working.
- **AD-6 — Room visibility controls rendering only.** The marketing "12 chambres" count is a
  static `DEFAULTS.marketingRoomCount` constant, decoupled from both the settings table and
  the room-visibility table. Public `/api/rooms` is strictly `[{ slug, is_public }]` so the
  client joins visibility onto the static `ROOMS` array itself.
- **AD-7 — True upsert, non-destructive.** `contact.upsert` searches by email, then PATCHes
  an existing contact or POSTs a new one, sending only non-empty properties so an update
  never blanks a value already in HubSpot.
- **AD-8 — Manual reset delivery.** The API only produces reset URLs (self-serve forgot flow
  and admin-generated links). No email/transactional provider is integrated; the token
  machinery leaves a clean seam for one later.
- **AD-9 — Settings key removal is non-destructive.** The two room-count keys are dropped
  from code only; existing rows may linger harmlessly. No down-migration.

## Component Responsibilities

### Backend (`apps/api`)
- `migrations/0008–0010` — schema (users columns, room_visibility, password_reset_tokens).
- `src/auth/session.ts` — export `sha256hex`/`generateToken`; add `invalidateUserSessions`.
- `src/settings.ts` — two-key settings model (price, email) end-to-end.
- `src/index.ts` — register (enqueue + derived name + new columns), trimmed profile, password
  change, forgot/reset, public/admin rooms, admin users (list/role/reset-link).

### Gateway (`apps/hubspot`)
- `src/ops/contact.ts` — extended `ContactUpsertSchema`; true create-or-PATCH upsert with
  non-empty-only property mapping (`firstname`/`lastname`/`phone`/`company`).

### Frontend (`apps/web`)
- `lib/api.ts` — typed clients + types for every endpoint change.
- `lib/settings.svelte.ts` — two-key public settings loader.
- `lib/components/Nav.svelte` — admin-vs-profil account link.
- `routes/+page.svelte` — marketing count from static `DEFAULTS`.
- `routes/connexion/+page.svelte` — richer register form + forgot toggle.
- `routes/reinitialisation/+page.svelte` (+`.ts`) — token-driven reset page.
- `routes/profil/+page.svelte` — no HubSpot, change-password, admin redirect.
- `routes/admin/+page.svelte` — Chambres + Utilisateurs tabs; Paramètres trimmed + password.
- `routes/le-site/+page.svelte` — filter room cards by visibility with fallback.

## Data Flow

**Registration → HubSpot.** Browser POST `/api/auth/register` → API validates, derives
`name`, INSERTs user (+ new columns), creates session, returns 201 with `Set-Cookie`.
Concurrently, inside `c.executionCtx.waitUntil`, the API POSTs `contact.upsert` to
`http://hubspot/ops/enqueue`; the gateway inserts a `hubspot_outbox` row; the scheduled
drainer later executes the true upsert against HubSpot. A thrown enqueue is swallowed.

**Password change.** Browser POST `/api/auth/password` (cookie) → `getAuthUser` → verify
current → hash new → UPDATE `users`. 401/400 on failure.

**Forgot → reset.** POST `/api/auth/forgot` (rate-limited) → conditional token insert →
uniform 200. Admin alternately POSTs `/api/admin/users/:id/reset-link` → returns a
`/reinitialisation?token=…` URL. Browser opens `/reinitialisation`, POSTs `/api/auth/reset`
→ token validated (unused + unexpired) → password UPDATE → `used_at=now()` →
`invalidateUserSessions(user_id)`. Any invalid/expired/used token → uniform 400.

**Room visibility.** Admin toggles a checkbox → POST `/api/admin/rooms/:slug` updates the
row. Public `/le-site` GETs `/api/rooms`, joins `is_public` onto static `ROOMS`, renders
only public cards (all cards on fetch error).

**Admin role change.** Admin POSTs `/api/admin/users/:id/role`; server refuses self-target
(400) else UPDATEs and returns the row.

## Error Handling & Recovery

- **Enqueue failure (registration):** caught in `waitUntil`; registration still 201. The
  contact is simply not queued — acceptable, matches reservations behavior.
- **HubSpot upsert failure (drainer):** existing outbox retry/backoff + admin requeue UI
  already handle this; unchanged.
- **DB unreachable (public reads):** `/api/settings` and `/api/rooms` clients fall back to
  static defaults / show-all rooms so the marketing site still renders.
- **Invalid/expired/used reset token:** single uniform 400 `"Lien invalide ou expiré"` — no
  distinction that would leak token state.
- **Self-role change / unknown user / unknown slug:** explicit 400/404 with French messages;
  UI also hides the self-role control defensively.
- **Auth on POST admin routes:** 401/403 returned before body validation to avoid leaking
  schema details to unauthenticated callers.

## Performance & Scalability

- Traffic is low (a rural auberge); all queries are single-row or small-table scans.
  `room_visibility` (3 rows) and `settings` (2 keys) are trivially small. `password_reset_
  tokens` is indexed by `user_id` and primarily queried by primary-key `token_hash`.
- Registration's HubSpot enqueue is off the response path (`waitUntil`), so signup latency
  is unaffected. Removing the synchronous HubSpot read-through from `/api/profile` makes the
  profile strictly faster and removes a cross-Worker dependency from that hot path.
- `authRateLimiter` (10 / 15 min / IP, in-memory per isolate) throttles `/api/auth/forgot`
  brute-force. Reset tokens expire in 1 hour and are single-use.

## Security Analysis

- **Threat: user enumeration via forgot.** Mitigated by uniform 200 + generic UI message +
  rate limiting (AD-4).
- **Threat: reset-token theft / reuse.** Only the hash is stored; tokens expire in 1h, are
  single-use (`used_at`), and a successful reset invalidates all of that user's sessions.
- **Threat: privilege escalation via role endpoint.** Admin-gated; server refuses
  self-modification; role is validated to the `guest|admin` enum only.
- **Threat: admin routes reachable unauthenticated.** All new `/api/admin/*` reuse the
  proven inline gate; POST routes gate before validation.
- **Threat: PII leakage.** Profile no longer proxies HubSpot data to the client. New
  `users` columns are returned only to the owning session (profile) and to admins
  (Utilisateurs list) — never on public endpoints. `/api/rooms` returns no PII.
- **Threat: SQL injection / path injection.** All queries use tagged-template parameter
  binding; `:slug`/`:id` path params are bound, and client helpers validate ids/encode
  params (as `requeueOutbox` does).
- **Secrets:** unchanged — `DB_CONN` and HubSpot token live only in the Workers; the SPA
  stays secret-free.

## Deployment Model

1. `npm run db:migrate` applies `0008`, `0009`, `0010` (idempotent, safe to re-run) against
   `DB_CONN` — run BEFORE deploying the API so new columns/tables exist.
2. `npm run deploy:api` (routes + settings + contact-upsert consumers).
   Deploy `apps/hubspot` if its `contact.upsert` change ships as a separate Worker.
3. `npm run deploy:web`.
No new Worker bindings, secrets, or `compatibility_date` bumps. Work happens on a branch off
`main`; no deploy is performed as part of this change.

## Known Constraints

- **No email infrastructure.** Reset links are produced by the API and delivered manually
  (self-serve forgot flow shows only a generic message; admins copy a generated URL). No
  transactional/email provider may be integrated.
- **Reuse-only crypto/session.** Reset tokens must reuse `generateToken` + `sha256hex`, and
  password hashing must reuse the PBKDF2 `hashPassword`/`verifyPassword`. No new crypto,
  session mechanism, or third-party dependency (Neon `@neondatabase/serverless`, Hono,
  `@hono/zod-validator`, Svelte 5, Tailwind v4 stay pinned).
- **Idempotent, one-concern migrations.** `0008` (users columns), `0009` (room visibility),
  `0010` (reset tokens) must each be re-runnable (`ADD COLUMN IF NOT EXISTS`,
  `CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`). Removing the two
  settings keys is code-only — no destructive/down migration.
- **Grep-safety / no mass rename.** Room slugs (e.g. `refuge-rider`) and internal HubSpot
  identifiers in `apps/api`/`apps/hubspot` MUST remain; only `GET /api/profile` and the
  profile page stop exposing HubSpot data.
- **`name` backward compatibility.** `users.name` stays the derived display/HubSpot source
  of truth; the new first/last/phone/company columns are additive and nullable so existing
  `name`-only users keep working.
- **Public shapes are strict.** `GET /api/settings` returns exactly `{ nightlyPrice,
  contactEmail }`; `GET /api/rooms` returns exactly `[{ slug, is_public }]`; neither exposes
  PII or secrets. The marketing "12 chambres" count stays a static constant, decoupled from
  both the settings and room-visibility tables.
- **Out of scope.** The pre-existing reservation field-name mismatch, any deploy to
  Cloudflare, and deriving the marketing count from public-room count are all excluded.
