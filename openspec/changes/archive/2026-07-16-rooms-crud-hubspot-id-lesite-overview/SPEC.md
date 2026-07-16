# Rooms CRUD · HubSpot Contact ID · "Le Site" Overview — SPEC

## Task

Deliver five discrete changes to L'Auberge du Vieux Pont across three services
(`apps/api` Hono Worker, `apps/hubspot` gateway Worker, `apps/web` Svelte 5 SPA),
all against the shared Neon Postgres database:

1. **Outbox 500 (bug).** The admin "File HubSpot" tab 500s because
   `apps/api/src/index.ts` queries a non-existent `outbox` table; the real table is
   `hubspot_outbox` (schema.sql:28, migration 0003). Rename every `outbox` reference in
   the two admin routes and prove an empty table returns `200 { rows: [] }`.
2. **Rooms CRUD (feature).** Replace the thin `room_visibility` table with a real
   `rooms` inventory table (slug PK, name, capacity, image_key, is_public, timestamps),
   seeded with the 3 existing rooms. Add a full admin-gated CRUD API and a full CRUD
   admin UI; keep the public `GET /api/rooms` contract.
3. **HubSpot contact id on users (feature).** Add `users.hubspot_contact_id`. When a
   `contact.upsert` op delivers, persist the returned HubSpot id onto the matching user
   (by email, best-effort). Prefer a stored contact id over an email search when
   available, and expose it on `GET /api/profile`.
4. **Hide "Connexion" when logged in (bug).** In `Nav.svelte`, render the "Connexion"
   link (desktop + mobile) only when no session user is present.
5. **"Le Site" redesign (feature).** Replace the named-room `RoomCard` grid at
   `#chambres` with a real-estate-style property overview grouped by area, driven by a
   new static `PROPERTY_AREAS` constant and rendered through `ImagePanel` / `/img/{key}`.

Cross-cutting: idempotent one-per-file migrations, updated `schema.sql`, updated
`apps/web/src/lib/api.ts` types/clients, retired `room_visibility` code references (no
DROP migration), French copy, Industrial Zen visual language, `npm run typecheck` and the
full Vitest suite green across all three workspaces.

The machine-addressable specification lives in `SDD.ir.yaml` (reused verbatim); this SPEC
is the human-readable companion.

## Schema Changes

Two new idempotent migrations, each in its own numbered file. `schema.sql` is updated to
document both. Next free numbers are 0011 and 0012 (existing runs through 0010).

### `apps/api/migrations/0011_rooms.sql`

```sql
CREATE TABLE IF NOT EXISTS rooms (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 1,
  image_key   TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO rooms (slug, name, capacity, image_key, is_public) VALUES
  ('chambre-quart', '<seed name from content.ts>', 2, 'bedroom', true),
  ('refuge-rider',  '<seed name from content.ts>', 2, 'bedroom', true),
  ('gite-familial', '<seed name from content.ts>', 5, 'bedroom', true)
ON CONFLICT (slug) DO NOTHING;
```

- Capacities are the **maximum occupancy** implied by the current string labels:
  `chambre-quart` → 2, `refuge-rider` → 2, `gite-familial` → 5.
- Seed names/slugs are taken verbatim from the existing `ROOMS` constant in
  `content.ts` (the implementer reads that file and substitutes the exact names/slugs).
- Non-destructive: `room_visibility` is **not** dropped.

### `apps/api/migrations/0012_users_hubspot_contact_id.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT;
```

Own file, no bundled seeds.

## API Types

TypeScript shapes (camelCase over the wire for admin write bodies; snake_case row
columns on read, matching existing conventions).

```ts
// apps/api/src/rooms.ts — server row + validation
type RoomRow = {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

// Fixed R2 asset allow-list (lowercase, no extension) used for validation + the admin select
const ROOM_IMAGE_KEYS = [
  "bedroom", "balcony", "living-dining", "lounge", "dining", "kitchen",
  "laundry", "bathroom-1", "bathroom-2", "bathroom-3",
  "auberge-exterior", "auberge-porch", "bridge", "village-river",
] as const;

// zod: create body
const RoomCreateSchema = z.object({
  name: z.string().trim().min(1),
  capacity: z.number().int().min(1),
  imageKey: z.enum(ROOM_IMAGE_KEYS),
  isPublic: z.boolean(),
});
// update body: same fields (slug taken from the path param)
```

```ts
// apps/web/src/lib/api.ts — client types
export interface Room {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
}
export interface RoomInput {
  name: string;
  capacity: number;
  imageKey: string;
  isPublic: boolean;
}
```

Endpoint contracts (per `SDD.ir.yaml` API section):

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/rooms` | public | `200` array of public rooms `{slug,name,capacity,image_key,is_public}` | — |
| GET | `/api/admin/rooms` | admin | `200 { rooms: Room[] }` | 401, 403 |
| POST | `/api/admin/rooms` | admin | `201 { room: Room }` | 401, 403, 400, 409 |
| PUT | `/api/admin/rooms/:slug` | admin | `200 { room: Room }` | 401, 403, 400, 404 |
| DELETE | `/api/admin/rooms/:slug` | admin | `200 { ok: true }` | 401, 403, 404 |
| GET | `/api/admin/outbox` | admin | `200 { rows: OutboxRow[] }` | 401, 403 |
| GET | `/api/profile` | session | `200 { user: {…, hubspotContactId}, reservations }` | 401 |

Error bodies keep the existing `{ error: string }` shape; validation messages are French.

## Component Hierarchy

```
apps/web/src/routes/admin/+page.svelte        (existing admin shell; rooms tab)
  └─ Rooms tab (rewritten)
       ├─ create form: name <input>, capacity <input type=number>,
       │    image_key <select over ROOM_IMAGE_KEYS>, is_public <checkbox>, submit
       ├─ rooms list: one row per room (name, slug, capacity, image_key, visibility)
       │    ├─ edit control (inline form reusing the same fields)
       │    └─ delete control (confirm)
       └─ error / loading / empty states (French copy)

apps/web/src/lib/components/Nav.svelte          (edited)
  ├─ desktop nav: Connexion <a> wrapped in {#if !user}
  └─ mobile nav:  Connexion <a> wrapped in {#if !user}

apps/web/src/routes/le-site/+page.svelte        (rewritten #chambres section)
  └─ <section id="chambres">  (anchor preserved)
       └─ PROPERTY_AREAS.map(area) → area block
            ├─ SectionLabel / heading (French)
            └─ ImagePanel per image key → /img/{key}
  (Attraits, Le lieu sections, flat price copy, /contact CTA all retained)

apps/web/src/lib/content.ts                     (edited)
  └─ export const PROPERTY_AREAS  (new static constant, 14 R2 keys grouped by area)
```

`ImagePanel`, `SectionLabel`, `Contour`, `Button`, `reveal`/`revealStagger` are reused;
no new shared primitives.

## Implementation Steps

### Step 1 — `apps/api/src/index.ts` (outbox rename)
Rename `outbox` → `hubspot_outbox` at every query site in `GET /api/admin/outbox`
(the two `SELECT * FROM outbox …` at ~597/599) and in `POST /api/admin/outbox/:id/requeue`
(the `SELECT … WHERE id … status='failed'`, the `SELECT … WHERE id`, and the `UPDATE … SET`
at ~618/622/630). No other logic changes. Grep to confirm zero remaining bare `outbox`
table references.

### Step 2 — `apps/api/migrations/0011_rooms.sql`
Create the idempotent `rooms` migration exactly as in **Schema Changes** (CREATE TABLE IF
NOT EXISTS + seed `ON CONFLICT DO NOTHING`). Confirm seed names/slugs against `content.ts`.

### Step 3 — `apps/api/migrations/0012_users_hubspot_contact_id.sql`
Create the idempotent `ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT` migration in its
own file with no other statements.

### Step 4 — `apps/api/schema.sql`
Add the canonical `rooms` table definition and the `users.hubspot_contact_id` column so the
documented schema stays truthful. (Non-destructive; `room_visibility` stays documented.)

### Step 5 — `apps/api/src/rooms.ts` (new)
Export `ROOM_IMAGE_KEYS`, a `slugify(name)` helper (lowercase, strip accents, spaces →
`-`, collapse repeats, strip leading/trailing `-`), the `RoomRow` type, and the
`RoomCreateSchema`/`RoomUpdateSchema` zod schemas. Validation of `imageKey` is by
membership in `ROOM_IMAGE_KEYS` (per STATE ST-02 — the `img/utils.ts` `validateKey` regex
rejects dashes, which real keys use, so an allow-list is stricter and matches the admin
`<select>`).

### Step 6 — `apps/api/src/index.ts` (rooms API)
- Rewrite public `GET /api/rooms` to `SELECT slug, name, capacity, image_key, is_public
  FROM rooms WHERE is_public = true ORDER BY slug` and return the array.
- Rewrite `GET /api/admin/rooms` to select all rooms → `{ rooms }`.
- Replace the single `POST /api/admin/rooms/:slug` visibility toggle with:
  - `POST /api/admin/rooms` — admin-gated, `zValidator("json", RoomCreateSchema)`; derive
    `slug = slugify(name)`; `INSERT … RETURNING *`; on unique-violation return `409`; on
    success `201 { room }`.
  - `PUT /api/admin/rooms/:slug` — admin-gated, `RoomUpdateSchema`; `UPDATE … WHERE slug`
    `RETURNING *`; empty result → `404`; else `200 { room }`.
  - `DELETE /api/admin/rooms/:slug` — admin-gated; `DELETE … WHERE slug RETURNING slug`;
    empty result → `404`; else `200 { ok: true }`.
- Remove the `RoomVisibilityRow` type and `RoomVisibilitySchema`; introduce `RoomRow`.
  All admin routes keep the existing `getAuthUser` → 401/403 inline gate.

### Step 7 — `apps/api/src/index.ts` (profile hubspot id)
Extend the `GET /api/profile` user query to select `hubspot_contact_id` and return it on
the user object as `hubspotContactId` (value or `null`). No new external call.

### Step 8 — `apps/hubspot/src/userLink.ts` (new)
Export `async function linkContactToUser(env, email, hubspotId)`: `UPDATE users SET
hubspot_contact_id = ${hubspotId} WHERE lower(email) = lower(${email})`. No-op when no row
matches (case-insensitive, per INV-link-by-email). Uses the same Neon driver + `DB_CONN`
pattern as the API. Wrap in try/catch so linking never throws into the delivery loop.

### Step 9 — `apps/hubspot/src/scheduled.ts`
After a successful `markDelivered`, if `row.kind === "contact.upsert"`, read the payload
email and call `linkContactToUser(env, email, result.hubspotId)` best-effort (guarded; a
failure must not fail delivery or change `stats`).

### Step 10 — `apps/hubspot/src/ops/contact.ts`
Add an optional `contactId` to `ContactUpsertSchema`. In `executeContactUpsert`, when
`payload.contactId` is present, skip the email search and PATCH
`/crm/v3/objects/contacts/{contactId}` with the update properties, returning
`{ ok: true, hubspotId: payload.contactId }` (per R-HSID-003).

### Step 11 — `apps/web/src/lib/api.ts`
Replace `RoomVisibility` type and its clients (`getRooms`, `adminRooms`,
`adminSetRoomVisibility`) with: `Room`/`RoomInput` types; `getRooms(): Promise<Room[]>`;
`adminRooms(): Promise<{ rooms: Room[] }>`; `adminCreateRoom(input)`,
`adminUpdateRoom(slug, input)`, `adminDeleteRoom(slug)`. Add `hubspotContactId` to the
profile `User`/response type. Keep `encodeURIComponent(slug)` path safety.

### Step 12 — `apps/web/src/lib/components/Nav.svelte`
Wrap the desktop Connexion `<a>` (~85–92) and the mobile Connexion `<a>` (~196–202) each in
`{#if !user}`. Leave Profil/Admin blocks unchanged.

### Step 13 — `apps/web/src/lib/content.ts`
Add `export const PROPERTY_AREAS` — an ordered array of area groups, each
`{ id, label, blurb, images: { key, caption }[] }`, covering dining/kitchen, lounge/living,
a representative bedroom, bathrooms, laundry, and outdoors, using exactly the 14 R2 keys
(`dining`, `kitchen`, `lounge`, `living-dining`, `bedroom`, `bathroom-1..3`, `laundry`,
`auberge-exterior`, `auberge-porch`, `balcony`, `bridge`, `village-river`) with French
captions. Trim/retain `ROOMS` per usage (grep first; delete `RoomCard` only if no consumer
remains).

### Step 14 — `apps/web/src/routes/le-site/+page.svelte`
Replace the `#chambres` `RoomCard` grid (and the `getRooms`/visibility filter wiring bound
to it) with a property overview that maps `PROPERTY_AREAS` through `ImagePanel` /
`/img/{key}`. Preserve the `id="chambres"` anchor and `data-testid="section-chambres"`, the
flat settings price, the "assigned on arrival" copy, the Attraits and Le lieu sections, and
the `/contact` CTA. Fully responsive; no horizontal overflow at 375px (reuse
`page-le-site__*` conventions and existing `<=640px` handling).

### Step 15 — Tests
- `apps/api/test/outbox.test.ts` — `GET /api/admin/outbox` on empty `hubspot_outbox`
  returns `200 { rows: [] }`.
- `apps/api/test/rooms.test.ts` — CRUD happy paths + slug derivation; validation (empty
  name 400, capacity 0 400, bad imageKey 400, duplicate slug 409); 401/403 gating;
  `GET /api/rooms` public shape.
- `apps/hubspot/test/` — `linkContactToUser` sets id on match / no-ops on miss;
  `executeContactUpsert` prefers `payload.contactId` (no search, PATCHes that id).
- `Nav.test.ts` — Connexion present when `user` null; absent (desktop + mobile) when set.
- le-site route tests — property overview renders (14 keys via ImagePanel), no RoomCard,
  `#chambres` present, Attraits/Le lieu/CTA retained; chambres redirect still targets
  `/le-site#chambres`.

### Step 16 — Verify
`npm run typecheck` and the full Vitest suite green across `apps/web`, `apps/api`,
`apps/hubspot`. Grep confirms no remaining `room_visibility` query or bare `outbox` table
reference in `apps/api/src`.

## Acceptance Criteria

1. `GET /api/admin/outbox` against an empty `hubspot_outbox` table returns HTTP 200 with
   body `{ rows: [] }` (no `relation "outbox" does not exist` error); grep shows zero bare
   `outbox` table references remain in `apps/api/src/index.ts`.
2. `POST /api/admin/rooms` as an admin with `{name:"Suite Test",capacity:3,imageKey:"lounge",isPublic:true}`
   returns 201 and a room whose `slug` equals `slugify("Suite Test")` (`suite-test`); a
   subsequent `GET /api/admin/rooms` includes it.
3. `PUT /api/admin/rooms/{existing-slug}` with a valid body returns 200 and the updated
   room; `PUT /api/admin/rooms/does-not-exist` returns 404.
4. `DELETE /api/admin/rooms/{existing-slug}` returns `200 { ok: true }`;
   `DELETE /api/admin/rooms/does-not-exist` returns 404.
5. `POST /api/admin/rooms` returns 400 for an empty `name`, 400 for `capacity: 0`, 400 for
   an `imageKey` not in `ROOM_IMAGE_KEYS`, and 409 for a duplicate slug.
6. Every `/api/admin/rooms*` route returns 401 with no session and 403 with a guest session.
7. `GET /api/rooms` (no auth) returns 200 with an array of public rooms, each carrying
   `slug`, `name`, `capacity`, and `image_key`.
8. Migration `0011_rooms.sql` uses `CREATE TABLE IF NOT EXISTS` and `ON CONFLICT DO NOTHING`
   and seeds capacities 2/2/5; migration `0012_users_hubspot_contact_id.sql` contains only
   `ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT`; both re-run cleanly.
9. Calling `linkContactToUser(env, <existing-user-email>, "H1")` sets that user's
   `hubspot_contact_id` to `"H1"`; calling it with an unmatched email changes no rows.
10. `executeContactUpsert` with `payload.contactId` set issues no search request, PATCHes
    that contact id, and returns `{ ok: true, hubspotId: <that id> }`.
11. `GET /api/profile` for an authenticated user returns `user.hubspotContactId` (its stored
    value or `null`).
12. `Nav.svelte` renders a "Connexion" link when `user` is null and renders **no**
    "Connexion" link in either the desktop or mobile menu when `user` is set; Profil/Admin
    links behave as before.
13. `/le-site` renders the property-overview `#chambres` section with all 14 R2 keys via
    `ImagePanel`, contains no `RoomCard`, retains the flat price, "assigned on arrival"
    copy, Attraits, Le lieu, and the `/contact` CTA, and has no horizontal overflow at 375px.
14. `/chambres` still redirects (301) to `/le-site#chambres`.
15. `npm run typecheck` passes and the full Vitest suite is green across all three
    workspaces; no `room_visibility` query remains in `apps/api/src`.
