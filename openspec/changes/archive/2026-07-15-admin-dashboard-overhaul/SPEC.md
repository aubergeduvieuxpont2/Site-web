# Admin Dashboard & User-Workflow Overhaul — SPEC

## Task

Extend L'Auberge du Vieux Pont across its three services (Svelte 5 SPA `apps/web`,
Hono Worker API `apps/api`, HubSpot gateway `apps/hubspot`) so operators get a richer
admin console and guests get a fuller, self-serve account experience — **without any
email infrastructure** (reset links are produced by the API and delivered manually).

Twelve in-scope items (BRIEF.md), grouped:

1. **Richer persisted user profiles** — new nullable `users` columns `first_name`,
   `last_name`, `phone`, `company`; `users.name` stays the derived `"First Last"` full
   name for backward compatibility.
2. **HubSpot `contact.upsert` becomes a true upsert** — create if absent, else PATCH;
   send only non-empty properties (never blank an existing value); map `firstname`,
   `lastname`, `phone`, `company` standard HubSpot properties.
3. **Settings cleanup** — remove `marketing_room_count` / `assignable_room_count` from
   the settings API/UI; `GET /api/settings` returns exactly `{ nightlyPrice, contactEmail }`.
   Marketing count copy is driven by the static `DEFAULTS.marketingRoomCount` (12).
4. **Room visibility (admin-controlled)** — new table keyed by room slug; admin toggles
   which room cards render on the public rooms page; public `GET /api/rooms` returns
   strictly `[{ slug, is_public }]`.
5. **Admin "Utilisateurs" tab** — list/search users; promote/demote role; generate a
   manual one-time reset link.
6. **Registration enqueues a HubSpot contact** — `POST /api/auth/register` enqueues
   `contact.upsert` via `http://hubspot/ops/enqueue` inside `c.executionCtx.waitUntil`;
   enqueue failure never fails registration.
7. **Richer registration form** — `/connexion` signup captures first name, last name,
   phone (optional), company (optional).
8. **Profile loses all HubSpot exposure** — `GET /api/profile` drops the synchronous
   `contact.get`/`deal.listByContact` read-through and the `hubspot` field; the profile
   page renders only user info + reservations.
9. **Password change from profile** — `POST /api/auth/password` (session-authed).
10. **Admin role management** — `POST /api/admin/users/:id/role`; an admin cannot change
    their own role (server-enforced + UI-hidden).
11. **Admins have no profile page** — a logged-in admin visiting `/profil` is redirected
    to `/admin`; nav shows the admin link instead of the profile link for admins; the
    admin **Paramètres** tab gains the change-password form.
12. **Password reset machinery (no email)** — `password_reset_tokens` table;
    `POST /api/auth/forgot` (always 200, rate-limited, no enumeration); new
    `/reinitialisation` route; `POST /api/auth/reset` (single-use, expiring token;
    invalidates all sessions for that user).

## Schema Changes

Three new numbered, idempotent migrations in `apps/api/migrations/` (one concern each).

### `0008_users_profile_fields.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company    TEXT;
```
All nullable. `name` remains and is still written (`"First Last"`).

### `0009_room_visibility.sql`
```sql
CREATE TABLE IF NOT EXISTS room_visibility (
  slug       TEXT PRIMARY KEY,
  is_public  BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO room_visibility (slug) VALUES
  ('chambre-quart'),
  ('refuge-rider'),
  ('gite-familial')
ON CONFLICT (slug) DO NOTHING;
```

### `0010_password_reset_tokens.sql`
```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);
```
Token is stored only as its SHA-256 hash (via existing `sha256hex`); TTL 1 hour;
single-use enforced by `used_at IS NULL AND expires_at > now()`.

**No destructive migration** for the removed settings keys — the rows may remain; the
code simply stops reading/writing them.

## API Types

All request bodies validated with `zValidator` + a French `authHook`/`settingsHook`;
auth gating runs BEFORE body validation on POST admin routes (401/403 before schema 400).

### Auth / registration
```ts
// RegisterSchema (apps/api/src/index.ts) — extended
{
  email: string (email, "email invalide"),
  password: string (min 8, "le mot de passe doit contenir au moins 8 caractères"),
  firstName?: string|null (trimToNull),
  lastName?: string|null (trimToNull),
  phone?: string|null (trimToNull),
  company?: string|null (trimToNull),
  name?: string|null   // legacy; if absent, derived server-side from first+last
}
// Response 201: { user: User }, Set-Cookie session
```
`name` is computed server-side as `[firstName, lastName].filter(Boolean).join(" ")` when
non-empty, else the posted `name`, else null. The registration `contact.upsert` payload
carries `{ email, name, firstname, lastname, phone, company }` (non-empty only).

### Password change
```ts
// POST /api/auth/password  (session-authed)
// PasswordChangeSchema
{ currentPassword: string (min 1), newPassword: string (min 8, French msg) }
// 200 { ok: true } | 400 { error } (French) | 401 unauthenticated
```

### Forgot / reset
```ts
// POST /api/auth/forgot   { email: string }
//   → ALWAYS 200 { ok: true } (generic; no enumeration); rate-limited (authRateLimiter)
// POST /api/auth/reset     { token: string, newPassword: string (min 8) }
//   → 200 { ok: true } | 400 { error: "Lien invalide ou expiré" }
//   consumes token (used_at=now()), invalidates all sessions for the user.
```

### Public rooms
```ts
// GET /api/rooms  → RoomVisibility[]  strictly [{ slug: string, is_public: boolean }]
```

### Admin rooms
```ts
// GET  /api/admin/rooms            → { rooms: [{ slug, is_public }] }   (admin-gated)
// POST /api/admin/rooms/:slug      body { isPublic: boolean }
//   → 200 { room: { slug, is_public } } | 404 unknown slug
```

### Admin users
```ts
export interface AdminUserRow {
  id: number; email: string; name: string | null;
  role: "guest" | "admin"; created_at: string;
}
// GET  /api/admin/users?q=<email>   → { users: AdminUserRow[] }   (admin-gated, ILIKE email)
// POST /api/admin/users/:id/role    body { role: "guest" | "admin" }
//   → 200 { user: AdminUserRow } | 400 { error } (own account) | 404
// POST /api/admin/users/:id/reset-link
//   → 200 { url: string } (one-time /reinitialisation?token=… link) | 404
```

### Settings (trimmed)
```ts
// apps/api/src/settings.ts
SettingsUpdateSchema = { nightlyPrice: int>0, contactEmail: email }
interface AdminSettings  { nightlyPrice: number; contactEmail: string }
interface PublicSettings { nightlyPrice: number; contactEmail: string }
// GET /api/settings and GET/POST /api/admin/settings all use these two keys only.
```

### Profile (trimmed)
```ts
// GET /api/profile → { user: User, reservations: ReservationRow[] }   // no `hubspot`
```

### HubSpot `ContactUpsertSchema` (extended)
```ts
{ email, name?, firstname?, lastname?, phone?, company? }  // all trimmed, optional except email
```

## Implementation Steps

### Step 1 — `apps/api/migrations/0008_users_profile_fields.sql`
Create the migration adding the four nullable columns (idempotent `ADD COLUMN IF NOT EXISTS`).

### Step 2 — `apps/api/migrations/0009_room_visibility.sql`
Create the `room_visibility` table + seed the 3 existing slugs (`ON CONFLICT DO NOTHING`).

### Step 3 — `apps/api/migrations/0010_password_reset_tokens.sql`
Create the `password_reset_tokens` table + index (idempotent).

### Step 4 — `apps/api/src/auth/session.ts`
Export the currently-private `sha256hex` and `generateToken` (change to `export function`).
Add `invalidateUserSessions(sql, userId)` → `DELETE FROM sessions WHERE user_id = ${userId}`.
Preserve all existing signatures/behavior.

### Step 5 — `apps/api/src/settings.ts`
Remove `marketing_room_count` / `assignable_room_count` from `SETTINGS_DEFAULTS`,
`PUBLIC_SETTING_KEYS`, `SettingsUpdateSchema`, `AdminSettings`, `PublicSettings`,
`rowsToAdminSettings`, `toPublicSettings`. Both interfaces become `{ nightlyPrice, contactEmail }`.

### Step 6 — `apps/api/src/settings.ts` tests → `apps/api/test/settings.test.ts`
Update every assertion to the two-key shape; drop room-count cases; keep the
"public omits nothing extra" invariant re-expressed for two keys.

### Step 7 — `apps/hubspot/src/ops/contact.ts`
Extend `ContactUpsertSchema` with optional `firstname`, `lastname`, `company` (and keep
`name`, `phone`). Rewrite `executeContactUpsert` to a **true upsert**: search by email;
if found, PATCH `/crm/v3/objects/contacts/{id}` with only non-empty mapped properties; if
absent, POST create with the same non-empty properties. Map `name`→`firstname` only when
`firstname` absent (backward compat). Never include empty-string properties.

### Step 8 — `apps/hubspot/test/ops.test.ts`
Add cases: create path sets firstname/lastname/phone/company; update path PATCHes and
omits empty properties (no blanking); existing contact.upsert cases stay green.

### Step 9 — `apps/api/src/index.ts` — register
Extend `RegisterSchema`; derive `name`; INSERT the new columns
(`first_name, last_name, phone, company`); enqueue `contact.upsert` via
`c.env.HUBSPOT.fetch("http://hubspot/ops/enqueue", …)` inside `c.executionCtx.waitUntil`
with try/catch (never fail registration). Duplicate-email path unchanged (409).

### Step 10 — `apps/api/src/index.ts` — profile
Delete the HubSpot enrichment block and the `hubspot` field; return `{ user, reservations }`.

### Step 11 — `apps/api/src/index.ts` — password change
Add `PasswordChangeSchema` + `POST /api/auth/password`: `getAuthUser` → 401; load
`password_hash`; `verifyPassword(currentPassword)` → 400 `"Mot de passe actuel incorrect"`;
`hashPassword(newPassword)`; UPDATE. French messages.

### Step 12 — `apps/api/src/index.ts` — forgot / reset
`POST /api/auth/forgot` (behind `authRateLimiter`): look up user by lower(email); if found,
create a reset token (`generateToken` → store `sha256hex`, `expires_at = now()+1h`); ALWAYS
return 200 `{ ok: true }` regardless. `POST /api/auth/reset`: hash token, select unused +
unexpired row; on miss → 400 `"Lien invalide ou expiré"`; else `hashPassword(newPassword)`,
UPDATE user, set `used_at = now()`, `invalidateUserSessions(user_id)`.

### Step 13 — `apps/api/src/index.ts` — public + admin rooms
`GET /api/rooms` → `SELECT slug, is_public FROM room_visibility ORDER BY slug` returned as
`[{ slug, is_public }]`. `GET /api/admin/rooms` (admin-gated) same rows under `{ rooms }`.
`POST /api/admin/rooms/:slug` (admin-gated, `RoomVisibilitySchema { isPublic: boolean }`):
`UPDATE … SET is_public = ${isPublic} WHERE slug = ${slug} RETURNING …`; 404 if no row.

### Step 14 — `apps/api/src/index.ts` — admin users
`GET /api/admin/users?q=` (admin-gated): `SELECT id, email, name, role, created_at FROM
users WHERE email ILIKE '%q%' ORDER BY created_at DESC LIMIT 200`.
`POST /api/admin/users/:id/role` (admin-gated, `RoleSchema { role: enum guest|admin }`):
reject when `Number(id) === user.id` → 400 `"Vous ne pouvez pas modifier votre propre rôle"`;
UPDATE; 404 if missing. `POST /api/admin/users/:id/reset-link` (admin-gated): create reset
token for that user; build `url` from request origin `…/reinitialisation?token=<raw>`; 404
if user missing.

### Step 15 — `apps/api/test/*` — API unit tests
Add/extend tests: register enqueue + derived name (mock HUBSPOT fetcher); profile has no
`hubspot`; password change (wrong/right current); forgot always-200 + no-enumeration; reset
single-use + session invalidation; admin rooms gating + toggle; admin users gating, self-role
refusal, reset-link generation. Follow the existing `admin-gating.test.ts` mock-context style.

### Step 16 — `apps/web/src/lib/api.ts`
Update `User` (add optional `first_name`/`last_name`/`phone`/`company`? — keep `User` minimal;
add `AdminUserRow`). Drop `marketingRoomCount`/`assignableRoomCount` from `PublicSettings`/
`AdminSettings`. Drop `hubspot` from `ProfileResponse`. Extend `register(...)` to accept the
new fields. Add clients: `changePassword`, `forgotPassword`, `resetPassword`, `getRooms`,
`adminRooms`, `adminSetRoomVisibility`, `adminUsers`, `adminSetUserRole`, `adminUserResetLink`.
All path params validated defensively (as `requeueOutbox` does).

### Step 17 — `apps/web/src/lib/settings.svelte.ts` (+ `__tests__/settings.test.ts`)
Remove `marketingRoomCount` from `DEFAULTS`, `PublicSettings` usage, and `mergeSettings`.
Update the co-located test.

### Step 18 — `apps/web/src/routes/+page.svelte`
Replace `{ ...STATS[2], value: settings.marketingRoomCount }` with
`{ ...STATS[2], value: DEFAULTS.marketingRoomCount }` (import `DEFAULTS` from content);
keep the 4-stat layout and testids.

### Step 19 — `apps/web/src/lib/components/Nav.svelte`
When `user?.role === "admin"`, render an "Admin" link to `/admin` instead of the "Profil"
link (both desktop + mobile menus). Guests keep the "Profil" link. Non-logged-in unchanged.

### Step 20 — `apps/web/src/routes/connexion/+page.svelte`
Register form: add first name, last name, phone (optional), company (optional) fields with
French labels + testids; pass them to `register(...)`. Add a "Mot de passe oublié ?" toggle
in the login panel revealing an inline email form → `forgotPassword`; after submit show the
generic French message. Keep the neutral login-error behavior.

### Step 21 — `apps/web/src/routes/reinitialisation/+page.svelte` + `+page.ts`
New client-rendered route (`ssr=false`, `prerender=false`). Read `token` from
`$page.url.searchParams`; ask new password twice (min 8, must match); `resetPassword(token,
newPassword)`; on success show confirmation + link back to `/connexion`; on failure show
`"Lien invalide ou expiré"`. Industrial-Zen styling, SectionLabel/Button, responsive.

### Step 22 — `apps/web/src/routes/profil/+page.svelte`
Remove the entire HubSpot section + `hubspot` state and its `getProfile().hubspot` read.
Redirect admins: in `onMount`, if `me.user.role === "admin"` → `goto("/admin")`. Add a
"Changer le mot de passe" section (current + new password, min 8) → `changePassword`, with
success/French-error states + testids.

### Step 23 — `apps/web/src/routes/admin/+page.svelte`
- Extend tab union + `order` arrays with `"rooms"` and `"users"`; add the two `role="tab"`
  buttons ("Chambres", "Utilisateurs") following the ARIA-tabs pattern + keyboard nav.
- **Paramètres**: remove the marketing/assignable room-count fields, state, and validation;
  keep price + email. Add a change-password form (current + new) → `changePassword`.
- **Chambres panel**: fetch `adminRooms`; render each `ROOMS` entry (name, code, capacity,
  blurb) with a "Publique" checkbox bound to visibility; on change call
  `adminSetRoomVisibility(slug, isPublic)` (optimistic, rollback on error).
- **Utilisateurs panel**: search-by-email input (debounced) → `adminUsers`; table (email,
  name, role, created_at); role promote/demote control hidden for the current user; a
  "Générer un lien" button → `adminUserResetLink` that reveals the copyable URL.

### Step 24 — `apps/web/src/routes/le-site/+page.svelte`
Fetch `getRooms()` on mount; filter `ROOMS` to those whose slug is public; on API failure
(or missing slug) show all rooms (graceful fallback). Marketing "12 chambres" copy unchanged.

### Step 25 — Web co-located tests
Update/add vitest: connexion richer register + forgot toggle; reinitialisation flow;
profil no-HubSpot + change-password + admin redirect; admin Chambres/Utilisateurs tabs +
Paramètres change-password + removed room-count fields; Nav admin-vs-profil link; le-site
visibility filter. Keep all existing tests green.

## Acceptance Criteria

1. `npm run typecheck --workspace apps/web`, `--workspace apps/api`, and
   `--workspace apps/hubspot` all exit 0.
2. `npm test --workspace apps/api` and `npm test --workspace apps/hubspot` pass; the full
   `apps/web` vitest suite passes.
3. `npm run build:web` succeeds.
4. Re-running every migration (0008–0010) is a no-op the second time (idempotent).
5. `GET /api/settings` returns a body whose keys are exactly `["contactEmail","nightlyPrice"]`
   (no room-count keys). `GET /api/admin/settings` returns the same two keys.
6. `GET /api/rooms` returns an array whose every element has exactly the keys `slug` and
   `is_public` and nothing else.
7. `POST /api/admin/rooms/:slug` with `{isPublic:false}` as admin flips the row; a
   non-admin/unauthenticated caller gets 403/401. `/le-site` (rooms) hides a card whose slug
   is non-public and shows all cards when `/api/rooms` errors.
8. Registering a new account (a) inserts `first_name/last_name/phone/company` and a derived
   `name`, and (b) enqueues one `contact.upsert` row via the HUBSPOT fetcher; a thrown
   enqueue still returns 201 with the user.
9. `contact.upsert` for a NEW email creates a contact with `firstname/lastname/phone/company`;
   for an EXISTING email it PATCHes and sends no empty-valued property.
10. `GET /api/profile` response has no `hubspot` key; the profile page renders no
    HubSpot-derived DOM.
11. `POST /api/auth/password` with the correct current password (session-authed) returns
    `{ok:true}` and the new password logs in; a wrong current password returns 400 with a
    French message; unauthenticated returns 401.
12. `POST /api/auth/forgot` returns 200 `{ok:true}` and an identical body whether or not the
    email exists, and is subject to the auth rate limiter (429 past the limit).
13. `POST /api/auth/reset` with a valid unused token sets the new password, marks the token
    used, and deletes all sessions for that user; re-using the same token returns 400
    `"Lien invalide ou expiré"`; an expired token returns the same 400.
14. `POST /api/admin/users/:id/role` as admin promotes/demotes another user; targeting the
    caller's own id returns 400 and does not change the row; the UI hides the control for the
    current user.
15. `POST /api/admin/users/:id/reset-link` as admin returns a `/reinitialisation?token=…` URL
    that, opened in the new route, lets the user set a password and log in.
16. A logged-in admin navigating to `/profil` ends on `/admin`; the nav shows an "Admin"
    link (not "Profil") for admins; the admin Paramètres tab contains a working
    change-password form.
17. Grep-safety: room slugs (`refuge-rider`, etc.) and internal HubSpot identifiers in
    `apps/api`/`apps/hubspot` still exist; only `GET /api/profile` and the profile page stop
    exposing HubSpot data.
18. All new UI (tabs, cards, forms, `/reinitialisation`) renders correctly at mobile
    (≤640px) and desktop widths, in French, using SectionLabel/Contour/Button + existing
    Industrial-Zen tokens.
