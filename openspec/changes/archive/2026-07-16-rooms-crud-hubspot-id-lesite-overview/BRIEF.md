# Understanding Brief

## Problem & Objective

The Auberge du Vieux Pont site needs five discrete fixes/features that together correct
two live bugs (admin outbox 500, "Connexion" shown while logged in), turn rooms into
operator-managed internal inventory (they are never customer-selectable), link users to
their HubSpot contact IDs, and replace the misleading named-room public listing with a
real-estate-style property overview. The overarching aim: an honest public site plus a
working, complete admin backend, with the whole test suite and typecheck green.

## Scope

**IN scope**

1. **Outbox 500 (bug):** rename `outbox` → `hubspot_outbox` at all four query sites in
   `apps/api/src/index.ts` (~585, 597, 599, 618, 622, 630 — GET list and requeue routes).
   Add a test asserting `GET /api/admin/outbox` returns 200 with `rows: []` on an empty
   table. Confirmed: `hubspot_outbox` is the real table (schema.sql:28, migration 0003);
   the frontend `OutboxRow` shape already matches its columns.
2. **Rooms CRUD (feature):** new numbered idempotent migration adding a real `rooms`
   table (PK, `name TEXT`, `capacity INTEGER`, `image_key TEXT`, `is_public BOOLEAN`,
   `created_at`/`updated_at`), seeding the 3 existing rooms `ON CONFLICT DO NOTHING`,
   replacing `room_visibility`. Full admin-gated API (GET list, POST create, PUT/PATCH
   update, DELETE) following the existing `getAuthUser` + `role === 'admin'` pattern.
   `GET /api/rooms` (public) keeps working, returning public rooms with name/capacity/image.
   Full CRUD admin UI in the rooms tab of `apps/web/src/routes/admin/+page.svelte`.
3. **HubSpot contact ID on users (feature):** idempotent migration
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT` (own file, no
   bundled seeds). On successful contact-upsert delivery, persist the returned `hubspotId`
   onto the matching `users` row (match by payload email; no-op if no user matches).
   Prefer a stored `hubspot_contact_id` over email search when reading the contact for
   the profile page.
4. **Hide "Connexion" when logged in (bug):** in `apps/web/src/lib/components/Nav.svelte`,
   render "Connexion" only when `user` is null, in both desktop (~85–92) and mobile
   (~196–202) menus; keep Profil/Admin as today. Update `Nav.test.ts`.
5. **"Le Site" redesign (feature):** replace the named-rooms `#chambres` section (RoomCard
   grid over static `ROOMS`) with a real-estate-style property overview grouping the
   provided R2 photos by area (dining/kitchen, lounge/living, a representative bedroom,
   bathrooms, laundry, outdoors), all through `ImagePanel` / `/img/{key}`. Keep the flat
   settings price, the "assigned on arrival" copy (:108–109), Attraits, Le lieu, and the
   `/contact` CTA. Keep `/chambres` → `/le-site#…` redirect working (retarget anchor if
   `#chambres` is renamed). Fully responsive, no horizontal overflow at 375px.

**OUT of scope**

- Footer / CITQ (already correct in prod — do not touch).
- Auth/session infrastructure changes (reuse existing cookie + `/api/auth/me` + gating).
- Customer-facing room selection (rooms are internal inventory; the public site no longer
  lists individual rooms).

## Success Criteria

- `GET /api/admin/outbox` and the requeue route return 200 (no `relation "outbox" does not
  exist`); the admin "File HubSpot" tab loads; new test passes with `rows: []` on empty.
- Admin can create, list, edit (incl. visibility), and delete rooms; validation rejects
  empty name, non-positive capacity, and image keys failing `validateKey`. `GET /api/rooms`
  still returns public rooms.
- After a contact upsert delivers, the matching user row carries the HubSpot id; the profile
  contact read uses the stored id when present instead of re-searching by email.
- Nav shows no "Connexion" link for a logged-in user (desktop + mobile); guests still see it.
- `/le-site` shows a property overview (no per-room "Réserver" buttons), renders correctly
  at 375px with no horizontal overflow, retains price/attraits/lieu/CTA and the redirect.
- `npm run typecheck` passes and the full Vitest suite is green.

## Key Decisions

- **Capacity string → integer (seed data).** Current `ROOMS` capacities are strings
  ("1 à 2", "Jusqu'à 5"). Seed the new INTEGER column with the **maximum occupancy** each
  implies: `chambre-quart` → 2, `refuge-rider` → 2, `gite-familial` → 5. (Planner to
  confirm; max-occupancy is the operationally meaningful number for inventory.)
- **`rooms` PK = `slug` (TEXT).** Preserves the existing `POST /api/admin/rooms/:slug`
  URL shape, the `GET /api/rooms` slug contract, and the frontend visibility map keyed by
  slug. On **create**, derive the slug from the name (slugified, lowercased, deduped) or
  accept an explicit slug field — recommend slugify-from-name with validation, since admins
  shouldn't hand-craft slugs. Seed rooms keep their existing slugs.
- **`image_key` validation shares `/img` rules.** Validate `image_key` with the same logic
  as `apps/web/src/routes/img/utils.ts` `validateKey` (no `..`, no leading `/`, no `\`, no
  whitespace/space/dash; lowercased). The admin picks from the known R2 key list (bedroom,
  balcony, living-dining, lounge, dining, kitchen, laundry, bathroom-1..3, auberge-exterior,
  auberge-porch, bridge, village-river — all `.jpg`); a `<select>` is safer than a free-text
  field and guarantees valid keys.
- **`room_visibility` → `rooms` is a replacement, not a coexistence.** New table in its own
  numbered migration; the old table's `is_public` semantics carry forward via the seed
  defaults (all public). No data migration is needed since the 3 slugs are re-seeded.
- **Item 5 imagery source = a static content array, not the DB.** The public property
  overview is editorial/marketing content grouped by area with fixed R2 keys and French
  captions; model it as a new `PROPERTY_AREAS` (or similar) constant in `content.ts` rather
  than the internal `rooms` inventory. This keeps the public page decoupled from admin
  inventory (which no longer maps 1:1 to what customers see).
- **`ROOMS` array fate.** Once `#chambres` no longer renders RoomCards, the static `ROOMS`
  array and `RoomCard` become unused on the public site. Trim `ROOMS` to whatever le-site
  still needs (likely nothing) and delete `RoomCard` only if no other consumer remains
  (grep first); otherwise leave it. Room *content* now lives in the DB (item 2).

## Recommendations Adopted

- Wrap the outbox handlers' queries defensively is optional, but at minimum the rename must
  land; keep the fix minimal (rename only) plus the empty-table test.
- Use an image-key `<select>` (not free text) in the rooms admin UI to make invalid keys
  unrepresentable and match the fixed R2 asset set.
- Persist `hubspot_contact_id` inside the existing delivery path (`scheduled.ts` calls
  `markDelivered` at :33) — either extend `markDelivered` or add a sibling write that reads
  the op payload email and updates `users`; only contact-upsert ops carry an email, so gate
  on `row.kind`.
- For le-site, reuse existing primitives (`ImagePanel`, `SectionLabel`, `Contour`, `Button`,
  `reveal`/`revealStagger`) and the established `page-le-site__*` CSS conventions so the
  Industrial Zen language and the responsive `<=640px`/`375px` handling stay consistent.

## Anticipated Next Steps

- **Run `npm run db:migrate`** against `DB_CONN` after adding the two new migrations (rooms
  table, users column). Both must be idempotent and each in its own numbered file.
- **Update `schema.sql`** (the canonical reference) to reflect the new `rooms` table and the
  `users.hubspot_contact_id` column so the documented schema stays truthful.
- **Backfill (optional):** existing users won't have `hubspot_contact_id` until their next
  contact-upsert delivery; profile reads must still fall back to email search when the
  column is null.
- **Update `apps/web/src/lib/api.ts`** room types/functions to match the richer `rooms`
  payload (name/capacity/image) and the new admin CRUD endpoints.
- **Retire `room_visibility`** references (types like `RoomVisibilityRow`, `RoomVisibilitySchema`)
  once the new table lands; verify no route or test still queries the old table.
- **Test coverage to add/adjust:** empty-outbox 200 test; rooms CRUD + validation tests;
  hubspot ops test for user linking and stored-id preference; `Nav.test.ts` for the hidden
  "Connexion"; both le-site route tests for the new property-overview structure.
