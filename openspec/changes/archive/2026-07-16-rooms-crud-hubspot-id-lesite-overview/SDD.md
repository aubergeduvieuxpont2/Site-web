# Rooms CRUD · HubSpot Contact ID · "Le Site" Overview — SDD

## System Overview

Three independently deployable Cloudflare Workers share one Neon Postgres database:

- **`apps/api`** — Hono Worker, the HTTP API (`/api/*`), reaching Neon over HTTP with the
  `@neondatabase/serverless` driver via `c.env.DB_CONN`. Owns the schema/migrations and
  admin gating.
- **`apps/hubspot`** — gateway Worker that drains a `hubspot_outbox` queue on a schedule,
  executing ops against the HubSpot CRM API and (new) writing back the contact id to the
  shared `users` table.
- **`apps/web`** — Svelte 5 + Vite static SPA served by a Worker; calls `/api/*` over HTTP
  with `credentials: "include"` for the session cookie. Holds no secrets.

This change touches all three services and the database, but each change is small and the
HTTP boundary between services is unchanged in shape (only table names, columns, room
payloads, and one optional op field move).

## Architecture Decisions

- **AD-1 · `rooms` replaces `room_visibility` (non-destructive).** The old table stays in
  the database (no DROP migration, per CLAUDE.md idempotent/non-destructive convention);
  all code references move to `rooms`. The 3 slugs are re-seeded so no data migration is
  needed (STATE ST-03).
- **AD-2 · `slug` TEXT PK, derived server-side.** Preserves the `/api/admin/rooms/:slug`
  and `GET /api/rooms` slug contracts. On create, `slug = slugify(name)`; admins never
  hand-craft slugs (STATE ST-01).
- **AD-3 · image-key allow-list, not `validateKey`.** `image_key` is validated against a
  fixed `ROOM_IMAGE_KEYS` list. The existing `img/utils.ts` `validateKey` regex rejects
  dashes (`/[\s -]/`), which most real R2 keys contain, so it cannot be reused here; the
  allow-list is stricter and drives the admin `<select>`, making invalid keys
  unrepresentable (STATE ST-02).
- **AD-4 · HubSpot link is best-effort in the delivery path.** `linkContactToUser` runs
  after `markDelivered`, gated on `kind === "contact.upsert"`, wrapped so a failure never
  fails delivery or perturbs `DrainStats` (STATE ST-04).
- **AD-5 · le-site imagery is static editorial content.** The public overview is a
  `PROPERTY_AREAS` constant in `content.ts`, decoupled from the internal `rooms` inventory,
  which no longer maps 1:1 to what customers see (STATE ST-06).
- **AD-6 · `#chambres` anchor preserved.** The section id is unchanged so the
  `/chambres → /le-site#chambres` redirect and in-page nav keep working without extra
  changes (STATE ST-05).
- **AD-7 · Outbox fix is a pure rename.** Only the table name is wrong; the frontend
  `OutboxRow` shape already matches `hubspot_outbox` columns, so the minimal fix is a
  rename plus a regression test.

## Component Responsibilities

| Component | Responsibility |
|---|---|
| `migrations/0011_rooms.sql` | Create `rooms`, seed 3 rooms idempotently |
| `migrations/0012_users_hubspot_contact_id.sql` | Add `users.hubspot_contact_id` idempotently |
| `apps/api/schema.sql` | Canonical documentation of both changes |
| `apps/api/src/rooms.ts` | `ROOM_IMAGE_KEYS`, `slugify`, `RoomRow`, zod schemas |
| `apps/api/src/index.ts` | Outbox rename; rooms CRUD routes (public + admin); profile hubspot id |
| `apps/hubspot/src/userLink.ts` | `linkContactToUser(env, email, hubspotId)` best-effort write |
| `apps/hubspot/src/scheduled.ts` | Call `linkContactToUser` after delivery of `contact.upsert` |
| `apps/hubspot/src/ops/contact.ts` | Prefer `payload.contactId` over email search |
| `apps/web/src/lib/api.ts` | `Room`/`RoomInput` types, CRUD clients, `hubspotContactId` on profile |
| `apps/web/.../admin/+page.svelte` | Rooms tab CRUD UI (create/list/edit/delete + image select) |
| `apps/web/.../components/Nav.svelte` | Hide Connexion when `user` present |
| `apps/web/src/lib/content.ts` | `PROPERTY_AREAS` constant; trim `ROOMS`/`RoomCard` |
| `apps/web/.../le-site/+page.svelte` | Property-overview `#chambres` section |

## Data Flow

**Rooms CRUD (admin).** Admin UI → `POST/PUT/DELETE /api/admin/rooms[/:slug]` with
`credentials:"include"` → Hono route: `getAuthUser` (401 if none, 403 if not admin) →
`zValidator` (400 on invalid) → Neon SQL (`INSERT`/`UPDATE`/`DELETE … RETURNING`) → `409`
on unique-violation (create), `404` on empty result (update/delete) → JSON row back to UI,
which re-fetches the list.

**Rooms read (public).** Visitor → `GET /api/rooms` → `SELECT … FROM rooms WHERE is_public`
→ array. (le-site no longer depends on this for its overview; the overview is static.)

**HubSpot link write.** Cron → `scheduled()` → `claimBatch` → `executeOp` → on
`result.ok`, `markDelivered`; if `kind === "contact.upsert"`, `linkContactToUser(env,
payload.email, result.hubspotId)` runs `UPDATE users SET hubspot_contact_id WHERE
lower(email)=lower(email)` (best-effort). Next `contact.upsert` may carry
`payload.contactId`, in which case `executeContactUpsert` PATCHes directly with no search.

**Profile read.** Authenticated user → `GET /api/profile` → user query now selects
`hubspot_contact_id`, returned as `hubspotContactId` (value or null).

**Outbox read.** Admin → `GET /api/admin/outbox` → `SELECT * FROM hubspot_outbox …` →
`{ rows }` (empty array when the table is empty; 200, not 500).

## Error Handling & Recovery

- **Auth:** every admin route returns `401` (no session) / `403` (non-admin) before any DB
  work, matching the established inline pattern; the frontend surfaces the error string.
- **Validation:** `zValidator` returns `400` with a French message for empty name,
  capacity < 1, or an `imageKey` outside `ROOM_IMAGE_KEYS`.
- **Conflict / not-found:** create maps a unique-violation to `409`; update/delete map an
  empty `RETURNING` set to `404`.
- **HubSpot linking:** wrapped in try/catch; a DB error there is swallowed so delivery still
  counts as delivered. No-match email is a silent no-op (0 rows).
- **Migrations:** `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, and
  `ADD COLUMN IF NOT EXISTS` make both files safe to re-run.
- **Frontend:** API clients keep returning the `Success | { error }` discriminated union;
  the UI renders error/loading/empty states.

## Performance & Scalability

Low-volume operator tooling and a static marketing page — no new hot paths. The `rooms`
table is tiny (single-digit rows) with a PK index; queries are point/scan over that PK.
`linkContactToUser` adds at most one indexed `UPDATE` per delivered `contact.upsert` and
runs off the request path (cron). The le-site overview is static content with images served
via the existing `/img/{key}` R2 proxy (already cache-friendly); lazy-loading images keeps
the page light at 375px. No caching strategy changes.

## Security Analysis

- **AuthZ:** all rooms mutations and the outbox/profile reads reuse `getAuthUser` + role
  checks; no route is loosened. Public `GET /api/rooms` exposes only non-sensitive
  marketing fields and only `is_public` rows.
- **Injection:** all SQL uses the Neon tagged-template parameterization; `slug` is derived
  by `slugify` (character-restricted) and `image_key` is constrained to an allow-list, so
  no user-controlled string reaches an interpolated identifier.
- **Path safety:** admin clients keep `encodeURIComponent(slug)` in the URL.
- **Secrets:** `DB_CONN` and the HubSpot token stay in Workers; `apps/web` gains no secret.
  `linkContactToUser` runs only in the hubspot Worker with its own `DB_CONN`.
- **Data protection:** `hubspot_contact_id` is a non-sensitive CRM id; it is returned only
  to the authenticated owner via `/api/profile`.

## Deployment Model

Two Workers redeploy (`deploy:api`, and `deploy:web`; `apps/hubspot` deploys on its own
pipeline) plus a DB migration step. Order: (1) `npm run db:migrate` applies `0011` and
`0012` against `DB_CONN` (idempotent, re-runnable); (2) deploy `apps/api`; (3) deploy the
hubspot gateway; (4) deploy `apps/web`. Because migrations are additive and non-destructive
and the outbox fix is a rename, old and new code coexist safely during rollout. No new
Cloudflare bindings, secrets, or config files are introduced.

## Known Constraints

- Seed room names/slugs must exactly match the existing `content.ts` `ROOMS` entries; the
  implementer reads that file rather than inventing names.
- Capacity is stored as INTEGER max-occupancy (2/2/5); the former free-text labels are not
  preserved on the public site.
- `room_visibility` remains in the database (only code references are retired); a future
  cleanup migration is out of scope.
- Existing users have `hubspot_contact_id = NULL` until their next `contact.upsert`
  delivery; profile/contact reads must tolerate null (fall back to email search where a
  contact lookup exists).
- `ROOM_IMAGE_KEYS` must stay in sync with the real R2 asset set; adding a photo means
  extending the list.
