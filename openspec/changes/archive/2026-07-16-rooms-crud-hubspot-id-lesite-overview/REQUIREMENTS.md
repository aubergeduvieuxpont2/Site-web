# Rooms CRUD · HubSpot Contact ID · "Le Site" Overview — REQUIREMENTS

## In Scope

### Functional Requirements

- **FR-1 (MUST) — Outbox rename.** All `outbox` table references in
  `apps/api/src/index.ts` (`GET /api/admin/outbox` list + `POST /api/admin/outbox/:id/requeue`)
  MUST target `hubspot_outbox`. `GET /api/admin/outbox` on an empty table MUST return
  `200 { rows: [] }`.
- **FR-2 (MUST) — Rooms schema.** A new idempotent migration `0011_rooms.sql` MUST create a
  `rooms` table (`slug` TEXT PK, `name` TEXT, `capacity` INTEGER, `image_key` TEXT,
  `is_public` BOOLEAN, `created_at`/`updated_at` TIMESTAMPTZ) and seed the 3 existing rooms
  with capacities 2/2/5 using `ON CONFLICT DO NOTHING`. It MUST NOT drop `room_visibility`.
- **FR-3 (MUST) — Rooms admin API.** Admin-gated `GET /api/admin/rooms`, `POST
  /api/admin/rooms`, `PUT /api/admin/rooms/:slug`, `DELETE /api/admin/rooms/:slug` MUST
  exist, each returning 401 without a session and 403 for a non-admin. Create MUST derive
  the slug from the name and return 409 on a duplicate slug; update/delete MUST return 404
  for an unknown slug.
- **FR-4 (MUST) — Rooms validation.** Create/update MUST reject an empty name, a capacity
  below 1, and an `imageKey` not in `ROOM_IMAGE_KEYS`, each with a `400` and a French
  message.
- **FR-5 (MUST) — Public rooms.** `GET /api/rooms` MUST remain public and return public
  rooms carrying `slug`, `name`, `capacity`, and `image_key`.
- **FR-6 (MUST) — Rooms admin UI.** The rooms tab of `admin/+page.svelte` MUST let an admin
  list, create, edit (including visibility), and delete rooms, with the image key chosen
  from a `<select>` over `ROOM_IMAGE_KEYS`. Copy is French; layout responsive.
- **FR-7 (MUST) — Users hubspot column.** A new idempotent migration
  `0012_users_hubspot_contact_id.sql` MUST add `hubspot_contact_id TEXT` to `users` via
  `ADD COLUMN IF NOT EXISTS`, in its own file with no other statements.
- **FR-8 (MUST) — Link on delivery.** On a successful `contact.upsert` delivery, the system
  MUST set the matching user's `hubspot_contact_id` (matched case-insensitively by payload
  email); it MUST no-op when no user matches and MUST NOT fail delivery on error.
- **FR-9 (SHOULD) — Prefer stored id.** `executeContactUpsert` SHOULD skip the email search
  and PATCH directly when `payload.contactId` is present, returning that id.
- **FR-10 (MUST) — Profile exposes id.** `GET /api/profile` MUST return the user's
  `hubspotContactId` (value or `null`).
- **FR-11 (MUST) — Hide Connexion.** `Nav.svelte` MUST render the "Connexion" link (desktop
  and mobile) only when no session user is present; Profil/Admin links are unchanged.
- **FR-12 (MUST) — Le-site overview.** `/le-site` MUST replace the `RoomCard` grid at
  `#chambres` with a property overview built from a static `PROPERTY_AREAS` constant,
  rendering all 14 R2 keys through `ImagePanel` / `/img/{key}`, with no `RoomCard`. It MUST
  keep the `#chambres` anchor, the flat settings price, the "assigned on arrival" copy, the
  Attraits and Le lieu sections, and the `/contact` CTA.
- **FR-13 (MUST) — Redirect preserved.** `/chambres` MUST continue to redirect (301) to
  `/le-site#chambres`.
- **FR-14 (MUST) — Client + schema sync.** `apps/web/src/lib/api.ts` MUST expose the new
  `Room`/`RoomInput` types and CRUD clients and drop `RoomVisibility`; `schema.sql` MUST
  document the new table and column; all `room_visibility` query references MUST be retired
  from `apps/api/src`.

### Non-Functional Requirements

- **NFR-1 — Typecheck.** `npm run typecheck` MUST pass for `apps/web`, `apps/api`, and
  `apps/hubspot`.
- **NFR-2 — Tests.** The full Vitest suite MUST be green across all three workspaces,
  including the new outbox, rooms, hubspot-link, Nav, and le-site tests.
- **NFR-3 — Responsive.** `/le-site` and the admin rooms UI MUST render with no horizontal
  overflow at 375px.
- **NFR-4 — Security.** Rooms mutations MUST stay admin-gated; SQL MUST remain
  parameterized; no secret may enter `apps/web`; the HubSpot link write MUST be
  best-effort and case-insensitive by email.
- **NFR-5 — Reliability.** Both migrations MUST be idempotent and re-runnable; HubSpot
  linking MUST never fail an outbox delivery.
- **NFR-6 — Visual language.** New UI MUST follow the existing Industrial Zen conventions
  (`page-le-site__*`, `ImagePanel`, `SectionLabel`, `Contour`, `Button`,
  `reveal`/`revealStagger`) and use French copy.

### Constraints

- Neon Postgres reached over HTTP via `c.env.DB_CONN`; no Cloudflare binding for it.
- Migrations are one-per-file, numbered, idempotent, non-destructive (CLAUDE.md).
- Seed room names/slugs must match the existing `content.ts` `ROOMS` entries exactly.
- `ROOM_IMAGE_KEYS` is the fixed R2 asset set; `image_key` cannot reuse `img/utils.ts`
  `validateKey` (its regex rejects the dashes real keys use).
- Three services deploy independently; the HTTP boundary is the contract.

## Out of Scope (Exclusions)

- Dropping or migrating data out of `room_visibility` (retire code references only).
- Footer / CITQ changes (already correct in production).
- Auth/session infrastructure changes (reuse the cookie + `/api/auth/me` + gating).
- Customer-facing room selection or per-room booking (rooms are internal inventory).
- Backfilling `hubspot_contact_id` for existing users (populated on next delivery).
- Any new dependency, build-config, or Cloudflare binding change.

## Acceptance Criteria

1. `GET /api/admin/outbox` on an empty `hubspot_outbox` table returns `200 { rows: [] }`;
   no bare `outbox` table reference remains in `apps/api/src/index.ts`.
2. `POST /api/admin/rooms` (admin) with `{name:"Suite Test",capacity:3,imageKey:"lounge",isPublic:true}`
   returns 201 with `room.slug === "suite-test"`; `GET /api/admin/rooms` then includes it.
3. `PUT /api/admin/rooms/{existing}` returns 200 with the updated room; unknown slug → 404.
4. `DELETE /api/admin/rooms/{existing}` returns `200 { ok: true }`; unknown slug → 404.
5. `POST /api/admin/rooms` returns 400 for empty name, 400 for `capacity:0`, 400 for an
   `imageKey` outside `ROOM_IMAGE_KEYS`, and 409 for a duplicate slug.
6. Every `/api/admin/rooms*` route returns 401 without a session and 403 for a guest.
7. `GET /api/rooms` (no auth) returns 200 with public rooms each carrying `slug`, `name`,
   `capacity`, `image_key`.
8. `0011_rooms.sql` uses `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` seeding
   capacities 2/2/5; `0012_users_hubspot_contact_id.sql` contains only
   `ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT`; both re-run without error.
9. `linkContactToUser(env, <existing-user-email>, "H1")` sets that user's
   `hubspot_contact_id` to `"H1"`; an unmatched email changes 0 rows.
10. `executeContactUpsert` with `payload.contactId` set issues no search request, PATCHes
    that id, and returns `{ ok: true, hubspotId: <that id> }`.
11. `GET /api/profile` for an authenticated user returns `user.hubspotContactId` (value or
    `null`).
12. `Nav.svelte` shows a "Connexion" link when `user` is null and shows none in either the
    desktop or mobile menu when `user` is set; Profil/Admin unchanged.
13. `/le-site` shows the property-overview `#chambres` section with all 14 R2 keys via
    `ImagePanel`, no `RoomCard`, retaining flat price, "assigned on arrival" copy, Attraits,
    Le lieu, and the `/contact` CTA, with no horizontal overflow at 375px.
14. `/chambres` redirects (301) to `/le-site#chambres`.
15. `npm run typecheck` passes and the full Vitest suite is green across all three
    workspaces; no `room_visibility` query remains in `apps/api/src`.
