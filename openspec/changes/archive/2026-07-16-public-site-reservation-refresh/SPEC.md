# Public-Site & Reservation-Flow Refresh — SPEC

## Task

Deliver nine targeted fixes to L'Auberge du Vieux Pont across three independently
deployed services — `apps/web` (Svelte 5 SPA), `apps/api` (Hono Worker on Neon
Postgres), `apps/hubspot` (HubSpot outbox Worker) — all against the shared Neon
database:

1. **Remove breakfast copy** from `content.ts` (`ROOMS[0]` blurb + description,
   amenity `A-04`) and `le-site/+page.svelte`; replace `A-04` with a truthful
   non-breakfast amenity so the 4-item homepage amenity slice stays full.
2. **Fix footer visibility** — the CITQ `#304542` footer is pruned to `opacity: 0`
   because `.footer--visible` is toggled imperatively and Svelte drops the unused
   selector. Drive visibility from reactive state bound in markup.
3. **Live public room count** — expose the live count of `is_public = true` rooms
   as `publicRoomCount` on `GET /api/settings`; the homepage rooms stat reads it,
   with a static `12` fallback when the API is unreachable.
4. **Rework "Nos chambres" showcase** — remove the per-room "Réserver" button from
   `RoomCard.svelte`; the homepage keeps photos/descriptions plus the existing
   single global CTA (`/le-site#chambres` + hero/closing "Réserver").
5. **Logged-in prefill** — hide Prénom/Nom/Courriel on the reservation form when a
   session user is present, deriving those values from the shared auth store.
6. **Split name → Prénom / Nom** — form, API schema/insert, a new idempotent
   migration adding nullable `first_name`/`last_name` to `reservations`, and a
   `contact.upsert` payload carrying `firstname`/`lastname`. A derived combined
   `name` continues to satisfy the `NOT NULL` column.
7. **Number of rooms field** — required integer "Nombre de chambres" (min 1) on the
   form; validated in the API; stored on `reservations` via its own migration;
   passed through `deal.create` and mapped to the HubSpot deal property
   `number_of_rooms`.
8. **Reactive nav auth state** — a shared Svelte auth store (mirroring
   `settings.svelte.ts`) that `Nav.svelte` reads; login updates it so the menu
   switches to Profil/Admin with no refresh.
9. **Logout control** — a visible logout button in desktop and mobile nav that
   calls `POST /api/auth/logout`, clears the store, and reverts to logged-out
   without a full page reload.

Cross-cutting: also fix the reservation request-contract mismatch — the frontend
sends `name/checkIn/checkOut/guests` but the API expects `arrive/depart/people`,
so dates and guest count are silently dropped today. Align the contract so all
fields (new and existing) persist end to end. Never stage/commit `.svelte-kit/`
or `.codegraph/codegraph.db`.

## Schema Changes

All migrations idempotent, one per numbered file, `ADD COLUMN IF NOT EXISTS`.
Existing `reservations` columns (`name NOT NULL`, `email NOT NULL`, `phone`,
`room`, `arrive DATE`, `depart DATE`, `people INT NOT NULL DEFAULT 1`, `message`,
`created_at`) are preserved; `name` stays populated with a derived value.

### `apps/api/migrations/0013_reservations_split_name.sql`
```
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS first_name TEXT;  -- nullable
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS last_name  TEXT;  -- nullable
```

### `apps/api/migrations/0014_reservations_room_count.sql`
```
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS room_count INTEGER;  -- nullable
```

### `apps/api/schema.sql`
Add the three columns (`first_name TEXT`, `last_name TEXT`, `room_count INTEGER`)
to the `reservations` definition so the reference schema matches the migrations.

No new table for the room count (change 3) — it is computed live from the
existing `rooms` table (`SELECT count(*) … WHERE is_public = true`).

## API Types

### Reservation request (`apps/api/src/index.ts` — `ReservationRequestSchema`)
```ts
{
  firstName: string;          // required, trimmed, min 1
  lastName:  string;          // required, trimmed, min 1
  email:     string;          // required, valid email
  phone?:    string | null;   // trimToNull
  room?:     string | null;   // trimToNull
  checkIn?:  string | null;   // mapped to `arrive` (trimToNull)
  checkOut?: string | null;   // mapped to `depart` (trimToNull)
  guests:    number;          // coerced int min 1, default 1 (mapped to `people`)
  roomCount: number;          // required, coerced int, min 1  (Nombre de chambres)
  message?:  string | null;   // trimToNull
}
```
Server derives `name = [firstName, lastName].filter(Boolean).join(" ")` for the
`NOT NULL` column. Response shape (`reservation`) is unchanged aside from the new
`first_name`, `last_name`, `room_count` fields being included.

### Frontend `createReservation` (`apps/web/src/lib/api.ts`)
```ts
createReservation(data: {
  firstName: string;
  lastName: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  roomCount: number;
  message?: string;
}): Promise<{ reservation: ReservationRow } | ApiError>
```
The keys sent MUST match the API schema (`checkIn`/`checkOut`/`guests`/`roomCount`
plus `firstName`/`lastName`). `ReservationRow` gains `first_name`, `last_name`,
`room_count` (nullable).

### Public settings (`GET /api/settings`)
```ts
PublicSettings {
  nightlyPrice: number;
  contactEmail: string;
  marketingRoomCount: number;   // retained static default (12)
  publicRoomCount: number;      // NEW — live count of is_public rooms; 12 fallback
}
```

### HubSpot deal (`apps/hubspot/src/ops/deal.ts` — `DealCreateSchema`)
```ts
{ …existing…, roomCount?: number }   // maps to deal property `number_of_rooms`
```
The `deal.create` enqueue in the API passes `roomCount: data.roomCount`.

### HubSpot contact upsert (reservations route enqueue)
Payload changes from `{ email, name }` to
`{ email, firstname: data.firstName, lastname: data.lastName }`
(`ContactUpsertSchema` already accepts `firstname`/`lastname`).

### Shared auth store (`apps/web/src/lib/auth.svelte.ts` — NEW)
```ts
export const auth = $state<{ user: User | null; loaded: boolean }>(
  { user: null, loaded: false }
);
export function setUser(user: User | null): void;   // sets user + loaded=true
export function clearUser(): void;                   // user=null, loaded=true
export async function loadAuth(): Promise<void>;     // getMe() → setUser/clearUser
```

## Component Hierarchy

```
+layout.svelte  (calls loadAuth() on mount, next to loadSettings())
├── Nav.svelte              — reads auth.user; renders Connexion vs Profil/Admin +
│                             a logout Button in desktop nav AND mobile menu
├── <main> children …
│    ├── routes/+page.svelte        — rooms stat → settings.publicRoomCount;
│    │      └── RoomCard.svelte      — per-room "Réserver" CTA REMOVED
│    ├── routes/contact/+page.svelte — Prénom/Nom split, Nombre de chambres,
│    │                                 logged-in prefill (hide name/email)
│    ├── routes/connexion/+page.svelte — setUser(...) after login/register
│    └── routes/le-site/+page.svelte — breakfast line removed
└── Footer.svelte           — visible={$state} bound via class:footer--visible
```

## Implementation Steps

### Step 1 — `apps/web/src/lib/auth.svelte.ts` (NEW)
Create the shared auth store mirroring `settings.svelte.ts`: a `$state` object
`{ user: User | null, loaded: boolean }`, plus `setUser`, `clearUser`, and
`loadAuth()` which calls `getMe()` and stores the user (or null on error), always
setting `loaded = true`. Import `User`/`getMe`/`isError` from `$lib/api`.

### Step 2 — `apps/web/src/lib/components/Nav.svelte`
- Replace the local `user = $state(...)` + `onMount` `fetch('/api/auth/me')` with a
  read of the shared store (`auth.user`). Keep the scroll listener in `onMount`.
- Guard all `#if user` blocks on `auth.user`.
- Add a logout **button** (not a link) in the desktop nav and in the mobile menu,
  shown only when `auth.user` is present, labelled "Déconnexion", with
  `data-testid="nav-logout"` (desktop) and `data-testid="nav-logout-mobile"`.
  Its handler calls `logout()` then `clearUser()`; no full page reload.

### Step 3 — `apps/web/src/routes/+layout.svelte`
In the existing `onMount`, call `loadAuth()` alongside `loadSettings()` so the
store is populated on first paint (the Nav no longer self-fetches).

### Step 4 — `apps/web/src/routes/connexion/+page.svelte`
After a successful `login(...)` and after a successful `register(...)`, call
`setUser(result.user)` before `goto("/profil")` so the nav updates immediately.

### Step 5 — `apps/web/src/lib/components/Footer.svelte`
- Add `let visible = $state(false)`.
- In the `$effect`, set `visible = true` (instead of `footerEl.classList.add(...)`)
  for both the reduced-motion branch and the IntersectionObserver branch.
- Bind `class:footer--visible={visible}` on the `<footer>` element and remove the
  `svelte-ignore css_unused_selector` comment. The `.footer.footer--visible {
  opacity: 1 }` rule is now referenced in markup and retained by the compiler.

### Step 6 — `apps/web/src/lib/content.ts`
- `ROOMS[0]` (`La Chambre du Quart`): rewrite `blurb` and `description` to drop
  "un petit-déjeuner servi avant l'aube", keeping the sound-proofing / shift-worker
  framing.
- Amenity `A-04`: replace title "Petit-déjeuner matinal" / breakfast text with a
  truthful non-breakfast amenity (e.g. "Café en libre-service" / "Accès cuisine"),
  keeping code `A-04` and a suitable `icon`.
- Add `publicRoomCount: 12` to the exported `DEFAULTS` constant.

### Step 7 — `apps/web/src/routes/le-site/+page.svelte`
Rewrite the `Le lieu` paragraph (currently line ~248-251) to remove "un déjeuner
prêt avant le lever du soleil", preserving the early-departure framing without
breakfast.

### Step 8 — `apps/web/src/lib/components/RoomCard.svelte`
Remove the `room-card__cta` block and the `Button` import/usage so no per-room
"Réserver" button renders. Keep the image, name, description, and price label.

### Step 9 — `apps/api/src/settings.ts`
Add `publicRoomCount` to the `PublicSettings` interface. Add an optional argument
or a small helper so the route can inject the live count; do not read it from the
`settings` table (it is computed). Keep `marketingRoomCount` untouched here (it
lives only frontend-side).

### Step 10 — `apps/api/src/index.ts` — public settings route
In `GET /api/settings`, after building `publicSettings`, run
`SELECT count(*)::int AS n FROM rooms WHERE is_public = true`, and return
`{ ...publicSettings, publicRoomCount: n }`. On any error counting, omit the field
or default so the endpoint never 500s from the count.

### Step 11 — `apps/api/src/index.ts` — reservation route
- Extend `ReservationRequestSchema`: add required `firstName`, `lastName`, required
  `roomCount` (coerce int min 1); accept `checkIn`/`checkOut` (map to `arrive`/
  `depart`); keep `guests` mapping to `people` (coerce int min 1, default 1).
- Derive `name` from first+last for the `NOT NULL` column.
- Update the INSERT to persist `first_name`, `last_name`, `room_count` and the
  correctly mapped `arrive`/`depart`/`people`; add the new columns to `RETURNING`.
- Change the `contact.upsert` enqueue payload to
  `{ email, firstname: firstName, lastname: lastName }`.
- Add `roomCount` to the `deal.create` enqueue payload.
- Update the `ReservationRow` server type + admin/profile SELECTs to include the
  new columns (nullable).

### Step 12 — `apps/web/src/lib/api.ts`
- Add `publicRoomCount: number` to `PublicSettings`.
- Add `first_name`, `last_name`, `room_count` (nullable) to `ReservationRow`.
- Change `createReservation` signature (Step: API Types) to send
  `firstName`/`lastName`/`email`/`checkIn`/`checkOut`/`guests`/`roomCount`/`message`.

### Step 13 — `apps/web/src/lib/settings.svelte.ts`
- Add `publicRoomCount: 12` to `DEFAULTS`.
- Extend `mergeSettings` to merge `publicRoomCount` when present in `incoming`.

### Step 14 — `apps/web/src/routes/+page.svelte`
Change the rooms stat (`renderedStats[2]`) to use `settings.publicRoomCount`
instead of `settings.marketingRoomCount`.

### Step 15 — `apps/web/src/routes/contact/+page.svelte`
- Replace the single `name` field with a Prénom + Nom row (`data-testid`
  `input-first-name` / `input-last-name`), reusing the existing `field-row` layout.
- Add a required "Nombre de chambres" number input (`min="1"`,
  `data-testid="input-rooms"`) bound to `form.roomCount` (default 1).
- Read the shared auth store: when `auth.user` is present, hide the Prénom/Nom/
  Courriel fields and derive those values from the user (split `user.name` into
  first/last; email from `user.email`) for the submit payload.
- Update `validateClient` to require first/last/email only when logged out, and
  `roomCount >= 1` always.
- Update `handleSubmit` to call the new `createReservation` contract; set the
  success `firstName` greeting from the effective first name.

### Step 16 — `apps/hubspot/src/ops/deal.ts`
Add `roomCount: z.number().optional()` to `DealCreateSchema`; in
`executeDealCreate`, set `properties.number_of_rooms = payload.roomCount` when
defined (no `hs_` prefix).

### Step 17 — Migrations & schema
Create `0013_reservations_split_name.sql` and `0014_reservations_room_count.sql`
(Schema Changes above); update `apps/api/schema.sql` `reservations` block.

### Step 18 — Tests
Update/extend Vitest suites:
- `apps/web` content/amenity tests: assert no "petit-déjeuner"/"déjeuner servi" in
  `ROOMS`/`AMENITIES`; assert `A-04` new title.
- `Footer.test.ts`: assert the footer becomes visible (has `footer--visible`).
- `RoomCard.test.ts`: assert no "Réserver" CTA is rendered.
- `page-accueil.test.ts`: rooms stat reflects `publicRoomCount`.
- `Nav.test.ts`: logout button present when authed (desktop + mobile), invokes
  logout + clears store; Connexion hidden when authed.
- `contact` page test: split-name + rooms-count fields; prefill hides name/email
  when authed; payload keys correct.
- `le-site` page test: breakfast line removed.
- API: `ReservationRequestSchema` accepts new fields and rejects `roomCount < 1`;
  `settings` response includes `publicRoomCount`.
- HubSpot: `DealCreateSchema` accepts `roomCount`; `number_of_rooms` mapped.

## Acceptance Criteria

1. `grep -ri "petit-déjeuner" apps/web/src/lib/content.ts apps/web/src/routes/le-site/+page.svelte` returns no matches, and no "déjeuner servi" / "déjeuner prêt" copy remains in those files.
2. `AMENITIES` still has 8 entries; the entry with code `A-04` no longer mentions breakfast, and the homepage renders 4 amenity items (`amenity-item`).
3. In a non-reduced-motion render, `Footer.svelte` ends with the `footer--visible` class on its root `<footer>` (bound in markup) and the `.footer.footer--visible { opacity: 1 }` selector is retained; `CITQ #304542` text is present.
4. `GET /api/settings` returns a JSON body including a numeric `publicRoomCount` equal to the count of `rooms` rows with `is_public = true`; when the fetch fails the frontend `settings.publicRoomCount` remains `12`.
5. The homepage rooms stat value is bound to `settings.publicRoomCount` (not `marketingRoomCount`).
6. `RoomCard.svelte` renders no element containing the text "Réserver" and no `room-card-cta` test id; the homepage still exposes exactly one global reservation CTA path via `/le-site#chambres` and the hero/closing "Réserver" buttons.
7. Posting to `/api/reservations` with `{ firstName, lastName, email, checkIn, checkOut, guests, roomCount, message }` returns 201 and persists `first_name`, `last_name`, `room_count`, and the mapped `arrive`/`depart`/`people`; `name` equals `"{firstName} {lastName}"`.
8. `POST /api/reservations` with `roomCount` omitted or `< 1` returns 400.
9. The reservation route enqueues a `contact.upsert` op whose payload carries `firstname` and `lastname` (not a combined `name`), and a `deal.create` op whose payload carries `roomCount`; `executeDealCreate` sets `properties.number_of_rooms`.
10. On the reservation form, when `auth.user` is null the Prénom, Nom, and Courriel inputs are present; when `auth.user` is set they are hidden and the submit still sends the user's name/email.
11. After a successful login on `/connexion`, the nav shows Profil (or Admin) and hides Connexion with no page reload (store-driven).
12. A logout control exists in both the desktop nav and the mobile menu (`nav-logout`, `nav-logout-mobile`); clicking it calls `POST /api/auth/logout`, clears the auth store, and the nav reverts to showing Connexion without a full page reload.
13. `apps/api/migrations/0013_reservations_split_name.sql` and `0014_reservations_room_count.sql` each contain only `ADD COLUMN IF NOT EXISTS` statements and are safe to re-run; `schema.sql` lists `first_name`, `last_name`, `room_count`.
14. `npm run typecheck` passes and the full Vitest suite (web + api + hubspot) is green.
