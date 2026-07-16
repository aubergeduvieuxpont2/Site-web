# Admin Dashboard & User-Workflow Overhaul — REQUIREMENTS

## In Scope

### Functional Requirements

**Profiles & HubSpot**
- FR-1 (MUST) — `users` gains nullable `first_name`, `last_name`, `phone`, `company` via an
  idempotent `ADD COLUMN IF NOT EXISTS` migration. `name` is retained and still written as
  the derived `"First Last"` full name.
- FR-2 (MUST) — HubSpot `contact.upsert` is a true upsert: create if the email is absent,
  otherwise PATCH; only non-empty properties are sent (never blank an existing value);
  `firstname`, `lastname`, `phone`, `company` map to the standard HubSpot properties.
- FR-3 (MUST) — `POST /api/auth/register` enqueues one `contact.upsert` op via
  `http://hubspot/ops/enqueue` inside `c.executionCtx.waitUntil`; an enqueue failure MUST
  NOT fail the registration response.
- FR-4 (MUST) — The `/connexion` signup form captures first name, last name, phone
  (optional), company (optional) with French labels; these persist to the new columns and
  flow into the registration `contact.upsert` payload.
- FR-5 (MUST) — `GET /api/profile` no longer performs HubSpot enrichment and returns no
  `hubspot` field; the profile page renders no HubSpot-derived data.

**Settings & Rooms**
- FR-6 (MUST) — `marketing_room_count` and `assignable_room_count` are removed from the
  settings schema, API, and admin UI. `GET /api/settings` returns exactly
  `{ nightlyPrice, contactEmail }`. Marketing count copy uses static `DEFAULTS.marketingRoomCount`.
- FR-7 (MUST) — A `room_visibility` table (keyed by slug, `is_public BOOLEAN NOT NULL
  DEFAULT true`) is created and seeded with the 3 existing slugs. Public `GET /api/rooms`
  returns strictly `[{ slug, is_public }]`.
- FR-8 (MUST) — Admin-gated `GET /api/admin/rooms` and `POST /api/admin/rooms/:slug` let an
  admin toggle visibility. The public rooms page hides non-public cards and falls back to
  showing all rooms when `/api/rooms` is unreachable.

**Auth workflows**
- FR-9 (MUST) — `POST /api/auth/password` (session-authed) changes the password: verifies
  the current password with `verifyPassword`, stores `hashPassword(newPassword)` (min 8),
  French error messages. A change-password form exists on `/profil` AND in the admin
  Paramètres tab.
- FR-10 (MUST) — A `password_reset_tokens` table stores only SHA-256 token hashes, with a
  1-hour expiry and single-use (`used_at`) semantics.
- FR-11 (MUST) — `POST /api/auth/forgot` accepts an email, is rate-limited, creates a token
  only when the account exists, and ALWAYS returns an identical 200 response (no
  enumeration). `/connexion` shows a "Mot de passe oublié ?" inline form and the generic
  French confirmation message.
- FR-12 (MUST) — A `/reinitialisation` route reads the token from the query string, collects
  the new password twice, and calls `POST /api/auth/reset`, which validates+consumes the
  single-use token and invalidates all existing sessions for that user, then links to
  `/connexion`.

**Admin & navigation**
- FR-13 (MUST) — An admin "Utilisateurs" tab lists users (email, name, role, created_at) and
  supports search by email.
- FR-14 (MUST) — `POST /api/admin/users/:id/role` (`{role:'guest'|'admin'}`, admin-gated)
  promotes/demotes; the server refuses when an admin targets their own account and the UI
  hides the control for the current user.
- FR-15 (MUST) — `POST /api/admin/users/:id/reset-link` (admin-gated) returns a one-time
  `/reinitialisation?token=…` URL for manual delivery.
- FR-16 (MUST) — A logged-in admin visiting `/profil` is redirected to `/admin`; the nav
  shows the admin link instead of the profile link when `role === 'admin'`.
- FR-17 (MUST) — An admin "Chambres" tab renders each `ROOMS` entry as a card (name, code,
  capacity, blurb) with a "Publique" checkbox that saves immediately.
- FR-18 (SHOULD) — `apps/web/src/lib/api.ts` exposes typed client functions and types for
  every changed/added endpoint, with defensive id/param validation.

### Non-Functional Requirements

- NFR-1 (MUST) — All three migrations are idempotent and re-runnable
  (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`),
  one concern per numbered file (0008 users columns, 0009 room visibility, 0010 reset tokens).
- NFR-2 (MUST) — `npm run typecheck` passes for `apps/web`, `apps/api`, `apps/hubspot`;
  `npm test --workspace apps/api` and `--workspace apps/hubspot` pass; the full `apps/web`
  vitest suite passes; `npm run build:web` succeeds; existing tests stay green.
- NFR-3 (MUST) — No user enumeration on `/api/auth/forgot`; reset tokens hashed at rest,
  single-use, 1-hour TTL; successful reset invalidates all of the user's sessions.
- NFR-4 (MUST) — Reset-token and forgot endpoints are rate-limited (reuse `authRateLimiter`).
- NFR-5 (MUST) — All new UI is fully responsive (mobile ≤640px + desktop), in French
  (Québec), using SectionLabel/Contour/Button and the existing Industrial-Zen Tailwind v4
  tokens; new inputs meet the 44px touch-target convention.
- NFR-6 (MUST) — Frontend stays secret-free; `DB_CONN` and HubSpot token remain Worker-only.
- NFR-7 (SHOULD) — Registration latency is unaffected by HubSpot (enqueue off the response
  path); the profile endpoint no longer depends on the HubSpot gateway.

### Constraints

- C-1 — Follow existing patterns exactly: inline admin gating (`getAuthUser` → 401/403);
  `zValidator` with French messages and auth-before-validation on POST admin routes; outbox
  enqueue via `waitUntil`; Svelte 5 runes; client-rendered auth-gated pages (`ssr=false`,
  `prerender=false`).
- C-2 — Reuse `hashPassword`/`verifyPassword` and `sha256hex`/`generateToken`; do not add new
  crypto or a new session mechanism.
- C-3 — Removing settings keys is code-only; no destructive/down migration.
- C-4 — Grep-safety: room slugs (e.g. `refuge-rider`) and internal HubSpot identifiers in
  `apps/api`/`apps/hubspot` code MUST remain; only the profile endpoint/page stops exposing
  HubSpot data. No mass rename.
- C-5 — SDD.ir.yaml: quote scalars starting with a backtick or containing `?`; TASK scope
  entries reference only `R-*`/`T-*`/`OP-*` ids.
- C-6 — Third-party surface is unchanged: Neon `@neondatabase/serverless`, Hono,
  `@hono/zod-validator`, Svelte 5, Tailwind v4. No new dependency, binding, secret, or
  `compatibility_date` bump.

## Out of Scope (Exclusions)

- OOS-1 — The pre-existing reservation field-name mismatch (`arrive/depart/people` vs
  `check_in/check_out/guests`). Do not touch it.
- OOS-2 — Any email/transactional integration (HubSpot email or otherwise). Reset-link
  delivery is manual only.
- OOS-3 — Deriving `marketingRoomCount` from the count of public rooms. Marketing count stays
  a static constant.
- OOS-4 — Renaming internal HubSpot identifiers elsewhere in the API/gateway.
- OOS-5 — Deploying to Cloudflare. Work stays on a branch off `main`.
- OOS-6 — Any change to the reservation creation flow beyond what FR-5 (profile) requires.

## Acceptance Criteria

- AC-1 — Migrations 0008–0010 apply cleanly and are no-ops on a second run; existing users
  with only `name` still authenticate and appear correctly.
- AC-2 — `GET /api/settings` body keys are exactly `contactEmail` + `nightlyPrice`;
  `GET /api/admin/settings` returns the same two keys; the admin Paramètres tab shows no
  room-count fields.
- AC-3 — `GET /api/rooms` returns an array whose elements have exactly `slug` + `is_public`.
  Toggling a room non-public via the admin Chambres tab hides that card on the rooms page;
  an unreachable `/api/rooms` shows all cards.
- AC-4 — Registering with first/last/phone/company persists all four columns + a derived
  `name`, and enqueues exactly one `contact.upsert`; a forced enqueue throw still returns 201.
- AC-5 — `contact.upsert` creates a contact with all mapped properties for a new email and
  PATCHes without sending empty properties for an existing email.
- AC-6 — `GET /api/profile` has no `hubspot` key; the profile DOM contains no HubSpot section.
- AC-7 — Password change: correct current password → success + new password logs in; wrong
  current password → 400 French error; unauthenticated → 401.
- AC-8 — `POST /api/auth/forgot` returns 200 with a byte-identical body for existing and
  non-existing emails and returns 429 past the rate limit.
- AC-9 — A valid reset token sets the new password, is single-use (second use → 400
  `"Lien invalide ou expiré"`), and invalidates all of that user's sessions; expired tokens
  return the same 400.
- AC-10 — Admin can promote/demote another user; self-target returns 400 with the row
  unchanged; the UI hides the control for the current user.
- AC-11 — An admin-generated reset link opens `/reinitialisation` and lets the user set a
  working password.
- AC-12 — A logged-in admin visiting `/profil` lands on `/admin`; the nav shows an "Admin"
  link (not "Profil") for admins; the admin Paramètres tab has a working change-password form.
- AC-13 — `npm run typecheck` (all three workspaces), `npm test` (api + hubspot), the web
  vitest suite, and `npm run build:web` all pass.
- AC-14 — Grep confirms room slugs and internal HubSpot identifiers still present in
  `apps/api`/`apps/hubspot`; only profile stopped exposing HubSpot data.
