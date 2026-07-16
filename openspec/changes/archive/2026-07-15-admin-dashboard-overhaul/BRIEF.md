# Understanding Brief

## Problem & Objective

Overhaul the admin dashboard and the guest user-workflow so that admins can manage
users and room visibility, guests carry richer persisted profile data that flows into
HubSpot as true upserts, and a complete (manually-delivered) password-reset mechanism
exists. The goal is a more capable operator console plus a self-serve-friendly account
experience — without introducing any email infrastructure.

## Scope

**In scope**

1. **Richer user profiles (persisted).** New nullable columns on `users`: `first_name`,
   `last_name`, `phone`, `company`, via idempotent `ALTER TABLE ... ADD COLUMN IF NOT
   EXISTS` in one migration. Keep and keep writing `users.name` as the derived full name
   (`"First Last"`) so every existing consumer (profile display, reservation prefill,
   `contact.upsert` name field) stays backward-compatible.
2. **HubSpot `contact.upsert` becomes a true upsert.** Create if absent, otherwise PATCH.
   Send only non-empty properties (never blank out an existing HubSpot value). Map
   `firstname`, `lastname`, `phone`, `company` to the standard HubSpot properties of the
   same names.
3. **Settings cleanup.** Remove `marketing_room_count` and `assignable_room_count` from
   the settings table usage, API, and admin UI. `GET /api/settings` returns only
   `nightlyPrice` and `contactEmail`. Public copy that used `marketingRoomCount` now uses
   the static `DEFAULTS.marketingRoomCount` constant (12) in `content.ts`.
4. **Room visibility (admin-controlled).** New table controlling which room cards render
   on `/chambres`. Public `GET /api/rooms` returns only `[{ slug, is_public }]`. Admin
   UI toggles visibility. This controls *card rendering only* — it does NOT drive any
   "12 chambres" count copy.
5. **Admin "Utilisateurs" tab.** List/manage users; includes the reset-link generator
   (`POST /api/admin/users/:id/reset-link`) returning a one-time URL the admin copies and
   delivers manually.
6. **Registration enqueues a HubSpot contact.** `POST /api/auth/register`
   (`apps/api/src/index.ts`), after inserting the user, enqueues a `contact.upsert` op to
   the HUBSPOT gateway via `http://hubspot/ops/enqueue` inside `c.executionCtx.waitUntil`,
   exactly like `POST /api/reservations` already does. Enqueue failure must never fail
   the registration response.
7. **Richer registration form.** The signup form on `/connexion` captures first name,
   last name, phone (optional), company/employer (optional) with French labels, and
   `RegisterSchema` validates them; these flow into the new `users` columns and into the
   registration `contact.upsert` payload.
8. **Profile page loses all HubSpot exposure.** Remove the synchronous HubSpot
   enrichment (`contact.get` / `deal.listByContact` read-through and the `hubspot`
   response field) from `GET /api/profile`, and remove all HubSpot display from
   `apps/web/src/routes/profil/+page.svelte`. Profile shows only user info + their
   reservations.
9. **Password change from the profile page.** Form with current password + new password
   (min 8) on `/profil` → new `POST /api/auth/password` (session-authed; verifies the
   current password with the existing `verifyPassword`, hashes with the existing PBKDF2
   `hashPassword` in `apps/api/src/auth/password.ts`).
10. **Admin role management.** In the Utilisateurs tab, an admin can promote a guest to
    admin and demote an admin back to guest via `POST /api/admin/users/:id/role`
    `{role: 'guest'|'admin'}` (admin-gated). An admin must NOT be able to change their
    own role (server-enforced 400/403, and the button is hidden for the current user).
11. **Admins have no profile page.** A logged-in admin navigating to `/profil` is
    redirected to `/admin`; the site header/account navigation shows the admin link
    instead of the profile link when `role === 'admin'`. Because admins lose `/profil`,
    the admin **Paramètres** tab gains the same change-password form (calling the same
    `POST /api/auth/password`).
12. **Password reset machinery (no email).**
   - `password_reset_tokens` table.
   - `/connexion` gains a "Mot de passe oublié ?" link revealing an inline email form
     (no new route for the request side) → `POST /api/auth/forgot`: always 200,
     rate-limited, no account enumeration, creates a token only if the account exists;
     UI shows the generic French confirmation message.
   - New `/reinitialisation` page reads the token from the query string, asks for the new
     password twice → `POST /api/auth/reset`, then links back to `/connexion`.
   - Reset tokens reuse `sha256hex` + `generateToken` from `apps/api/src/auth/session.ts`.

**Out of scope**

- The pre-existing reservation field-name mismatch — explicitly do not touch it.
- Any email/transactional integration (HubSpot email or otherwise). Delivery of reset
  links is manual only.
- Deriving `marketingRoomCount` from the count of public rooms.

## Success Criteria

- An admin can open the **Utilisateurs** tab, see users, and generate a working one-time
  reset link that, when opened at `/reinitialisation`, lets the guest set a new password
  and log in.
- Guest profile fields (first/last/phone/company) persist across sessions and appear as
  the correct standard properties on the matching HubSpot contact after a create *and*
  after an update (non-empty-only, no blanking).
- `GET /api/settings` returns exactly `{ nightlyPrice, contactEmail }`; no room-count
  keys remain in settings API/UI. `/chambres` still shows the "12 chambres" narrative
  from the static constant.
- Admin room-visibility toggles change which cards render on `/chambres`; public
  `/api/rooms` returns only `[{ slug, is_public }]`.
- `POST /api/auth/forgot` returns 200 and the same generic message whether or not the
  account exists (no enumeration), and is rate-limited.
- All migrations are idempotent and re-runnable; existing users with only `name` still work.
- Registering a new account creates/updates the matching HubSpot contact through the
  outbox (visible as a `contact.upsert` row), and a failed enqueue never breaks signup.
- `GET /api/profile` no longer returns a `hubspot` field and the profile page renders no
  HubSpot-derived data (internal identifiers elsewhere in the API/gateway code are fine
  and expected to remain).
- A logged-in guest can change their password from `/profil` (wrong current password →
  French error; success → new password works on next login).
- An admin can promote/demote other users but the role controls are refused
  server-side for their own account; a logged-in admin visiting `/profil` lands on
  `/admin`; the admin Paramètres tab contains a working change-password form.
- All new UI (tabs, cards, forms) is fully responsive on mobile and desktop, in French,
  using the existing SectionLabel/Contour/Button components and Industrial Zen styling.
- `apps/web/src/lib/api.ts` client functions and types are updated for every endpoint
  change; unit tests cover new/changed endpoints and ops; existing tests stay green;
  typecheck passes for all three workspaces.

## Key Decisions

- **Three new numbered migration files, one concern each** (repo convention):
  `0008` users columns, `0009` rooms visibility, `0010` password_reset_tokens.
- **`name` stays the source of truth for display/HubSpot name**, derived from the new
  first/last fields — additive, not a replacement, to preserve backward compatibility.
- **Reuse existing crypto/session/admin-gating primitives** rather than adding new ones:
  `sha256hex`, `generateToken`, and the inline `if (user.role !== "admin")` gate.
- **Manual-only reset delivery**; the API produces the link, humans deliver it. No email
  provider, no enumeration surface.
- **Marketing count is a static constant**, decoupled from both the settings table and
  the room-visibility table.

## Recommendations Adopted

- Reuse `sha256hex` and session token primitives for reset tokens (planner should hash
  reset tokens at rest, store only the hash, mark single-use + expiring).
- Copy the existing inline admin-gating pattern for all new `/api/admin/*` routes.
- Public `/api/rooms` shape strictly `[{ slug, is_public }]`.
- One-concern-per-file migrations (three files).
- Treat the pre-existing reservation field-name mismatch as out of scope.

## Anticipated Next Steps

- **Backfill/seed:** the rooms-visibility table needs seeding for the existing 3 room
  slugs so `/chambres` renders unchanged on first deploy; confirm default `is_public`.
- **Reset token hardening:** decide token TTL, single-use enforcement, and the rate-limit
  window/strategy for `/api/auth/forgot` (per-IP and/or per-email).
- **Admin UI wiring:** the new Utilisateurs tab and room-visibility controls need to fit
  the existing admin dashboard shell and its auth-gated fetch pattern.
- **Follow-up email delivery:** if the auberge later wants automated reset emails, this
  change leaves a clean seam (token machinery done) to add a provider without reworking
  the flow.
- **Deploy order:** run `npm run db:migrate` before deploying the API so new columns/tables
  exist; frontend deploy can follow.
