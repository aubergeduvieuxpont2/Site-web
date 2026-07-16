# Public-Site & Reservation-Flow Refresh — REQUIREMENTS

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — Remove all breakfast copy ("petit-déjeuner", "déjeuner servi/
  prêt") from `content.ts` (`ROOMS[0]` blurb + description) and
  `le-site/+page.svelte`. Self-serve kitchen/meal copy that is not breakfast stays.
- **FR-2 (MUST)** — Replace amenity `A-04` (breakfast) with a truthful non-breakfast
  amenity, keeping code `A-04` so the homepage 4-item amenity slice stays full.
- **FR-3 (MUST)** — The footer (with `CITQ #304542`) MUST render visible at the bottom
  of every page on mobile and desktop under normal (non-reduced-motion) rendering,
  driven by reactive state bound in markup (`class:footer--visible`), with the reveal
  animation preserved.
- **FR-4 (MUST)** — `GET /api/settings` MUST include a numeric `publicRoomCount` equal
  to the live count of `rooms` where `is_public = true`.
- **FR-5 (MUST)** — The homepage rooms stat MUST display `settings.publicRoomCount`,
  falling back to the static `12` when the API is unreachable.
- **FR-6 (MUST)** — `RoomCard.svelte` MUST NOT render a per-room "Réserver" button;
  the homepage keeps the images/descriptions and a single global reservation CTA.
- **FR-7 (MUST)** — The reservation form MUST replace the single "Nom" field with
  required "Prénom" and "Nom" fields, and MUST add a required integer "Nombre de
  chambres" (min 1) field.
- **FR-8 (MUST)** — When a session user is present, the reservation form MUST hide the
  Prénom/Nom/Courriel fields and derive those values from the shared auth store; the
  reservation MUST still submit and be attributed to the user. Logged out, all three
  fields MUST be shown.
- **FR-9 (MUST)** — The API `ReservationRequestSchema` MUST accept `firstName`,
  `lastName`, `roomCount`, and map the frontend `checkIn`/`checkOut`/`guests` to
  `arrive`/`depart`/`people`. `roomCount` MUST be required and `>= 1`.
- **FR-10 (MUST)** — The reservation INSERT MUST persist `first_name`, `last_name`,
  `room_count`, and the mapped `arrive`/`depart`/`people`; `name` MUST be written as
  the derived `"{firstName} {lastName}"` (NOT NULL preserved).
- **FR-11 (MUST)** — The reservation route's `contact.upsert` enqueue MUST send
  `firstname`/`lastname` (not a combined `name`); its `deal.create` enqueue MUST send
  `roomCount`.
- **FR-12 (MUST)** — `DealCreateSchema` MUST accept `roomCount`, and `executeDealCreate`
  MUST set the HubSpot deal property `number_of_rooms` (no `hs_` prefix) when present.
- **FR-13 (MUST)** — A shared Svelte auth store (`auth.svelte.ts`) MUST be the single
  source of nav auth state; `Nav.svelte` MUST read it instead of its own
  `onMount` fetch. After login, the nav MUST switch to Profil/Admin with no page reload.
- **FR-14 (MUST)** — A logout control MUST exist in both the desktop nav and the mobile
  menu; it MUST call `POST /api/auth/logout`, clear the auth store, and revert the nav
  to logged-out state without a full page reload.
- **FR-15 (MUST)** — Add idempotent migrations `0013_reservations_split_name.sql`
  (nullable `first_name`, `last_name`) and `0014_reservations_room_count.sql`
  (nullable `room_count`), each in its own file, and update `schema.sql`.
- **FR-16 (SHOULD)** — Update/extend the Vitest suites (content, footer, RoomCard,
  homepage stat, nav/logout, contact form, reservation schema, settings, deal mapping)
  to cover the above.
- **FR-17 (MAY)** — Surface `room_count` in the admin reservations view.

### Non-Functional Requirements

- **NFR-1** — `npm run typecheck` passes across all workspaces; `npm run build:web`
  succeeds.
- **NFR-2** — The full Vitest suite (web + api + hubspot) is green.
- **NFR-3** — All database migrations are idempotent (`ADD COLUMN IF NOT EXISTS`) and
  safe to re-run in order.
- **NFR-4** — The reworked form (Prénom/Nom row, Nombre de chambres) and the nav
  (logout in desktop + mobile) are responsive with no horizontal overflow at 375px.
- **NFR-5** — All new/updated copy is in French and consistent with the Industrial-Zen
  voice.
- **NFR-6** — The public settings endpoint never returns a 500 due to the room count;
  it degrades to the base settings.
- **NFR-7** — Reservation input is validated server-side and parameterized into SQL;
  no injection surface is introduced.

## Out of Scope (Exclusions)

- Creating the HubSpot `number_of_rooms` deal property or confirming
  `firstname`/`lastname` contact properties in the portal (operational follow-up).
- Any redesign of the reservation flow beyond the split-name, room-count, prefill,
  and contract-fix changes described here.
- Changing pricing or settings semantics (`nightly_price`, `contact_email` unchanged);
  no new stored setting for the room count.
- Reworking `le-site#chambres` (already showcase-style) beyond the breakfast-copy line.
- Touching `apps/ab-splitter`.
- Any `DROP`/destructive migration; new columns are additive and nullable.
- Staging or committing `.svelte-kit/` or `.codegraph/codegraph.db`.

## Acceptance Criteria

1. No "petit-déjeuner" / "déjeuner servi" / "déjeuner prêt" occurs in `content.ts` or
   `le-site/+page.svelte`; `AMENITIES` still has 8 entries and `A-04` is non-breakfast.
2. `Footer.svelte` root `<footer>` carries `footer--visible` via a markup binding in a
   non-reduced-motion render; the `opacity: 1` selector is retained; `CITQ #304542`
   renders.
3. `GET /api/settings` returns numeric `publicRoomCount` = count of public rooms; the
   homepage rooms stat binds to `settings.publicRoomCount`; fallback stays `12`.
4. `RoomCard.svelte` renders no "Réserver" button and no `room-card-cta` test id.
5. `POST /api/reservations` with `{ firstName, lastName, email, checkIn, checkOut,
   guests, roomCount, message }` returns 201, persists `first_name`/`last_name`/
   `room_count`/`arrive`/`depart`/`people`, and sets `name = "{firstName} {lastName}"`.
6. `POST /api/reservations` with `roomCount` missing or `< 1` returns 400.
7. The reservation route enqueues `contact.upsert` with `firstname`/`lastname` and
   `deal.create` with `roomCount`; `executeDealCreate` sets `number_of_rooms`.
8. Logged out, the form shows Prénom/Nom/Courriel; logged in (`auth.user` set), those
   three are hidden and submit still sends the user's name/email.
9. After login on `/connexion`, the nav shows Profil/Admin and hides Connexion with no
   reload; a logout control in desktop and mobile (`nav-logout`, `nav-logout-mobile`)
   logs out, clears the store, and reverts the nav without a reload.
10. `0013_reservations_split_name.sql` and `0014_reservations_room_count.sql` contain
    only `ADD COLUMN IF NOT EXISTS` and are re-run safe; `schema.sql` lists the three
    new columns.
11. `npm run typecheck` and the full Vitest suite pass.
