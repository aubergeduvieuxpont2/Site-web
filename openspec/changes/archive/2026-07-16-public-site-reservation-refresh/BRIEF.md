# Understanding Brief

## Problem & Objective

The public site and reservation flow for L'Auberge du Vieux Pont (Svelte 5 SPA in
`apps/web`, Hono Worker API in `apps/api`, HubSpot outbox Worker in `apps/hubspot`,
Neon Postgres) contains stale/misleading copy, a broken (invisible) legally-required
footer, a room-selection UX that contradicts how rooms are actually assigned, and an
incomplete auth UX. The objective is nine targeted fixes that make the marketing copy
truthful, restore the CITQ footer, align the reservation form and its downstream HubSpot
mapping with the real work-crew booking model (split name, room count, session prefill),
and make nav auth state reactive with a real logout.

## Scope

**IN scope** — grouped by change:

1. **Remove breakfast copy.** Concrete locations found:
   - `apps/web/src/lib/content.ts`: `ROOMS[0]` (`La Chambre du Quart`) `blurb` **and**
     `description` (both contain "un petit-déjeuner servi avant l'aube"); `AMENITIES`
     entry `A-04` (`title: "Petit-déjeuner matinal"`, `text: "Service avant l'aube…"`).
   - `apps/web/src/routes/le-site/+page.svelte:250` ("un déjeuner prêt avant le lever du
     soleil").
   - Kitchen/meal copy that is *self-serve* and NOT breakfast (e.g. `PROPERTY_AREAS`
     `repas-cuisine` "souper d'équipe / boîte à lunch", amenity `A-07` "Cuisine partagée")
     stays — only breakfast/"petit-déjeuner"/"déjeuner servi" is removed. Amenity `A-04`
     should be replaced with a truthful non-breakfast amenity or dropped (see Decisions).
   - Update any tests asserting the removed strings (e.g. amenity/content tests).

2. **Fix footer visibility.** Root cause identified (see Key Decisions). Footer with
   `CITQ #304542` (`apps/web/src/lib/components/Footer.svelte`) must render visible at the
   bottom of every page, responsively, with animation preserved where possible.

3. **Live public room count.** Replace the static `marketing_room_count` value used for the
   homepage rooms stat with the live count of `is_public = true` rows in the `rooms` table,
   surfaced through a public API response, with a static fallback when the API is unreachable.

4. **Rework "Nos chambres" showcase.** Homepage `apps/web/src/routes/+page.svelte` room grid
   uses `RoomCard.svelte`, which renders a per-room "Réserver" button (and per-room price).
   Remove the per-room RÉSERVER buttons; keep photos/descriptions as an informational
   accommodation-types showcase; rely on a single global "Réserver" CTA to the reservation
   form. Apply the same to any "toutes les chambres" surface (note: `/chambres` already
   301-redirects to `/le-site#chambres`, and the `le-site` `#chambres` section is *already*
   showcase-style with one global CTA and no per-room buttons — so this change is
   concentrated on the homepage + `RoomCard`).

5. **Logged-in prefill.** On the reservation form (`apps/web/src/routes/contact/+page.svelte`)
   hide the Nom/Courriel fields when authenticated and derive those values from the session/
   user profile (server-side or via the shared session store from change 8).

6. **Split name into Prénom / Nom (HubSpot firstname/lastname).**
   - Reservation form: replace the single "Nom" field with "Prénom" + "Nom".
   - API `ReservationRequestSchema` + insert (`apps/api/src/index.ts`).
   - New idempotent numbered migration (`apps/api/migrations/0013_*.sql`) adding
     `first_name` / `last_name` to `reservations` (`ADD COLUMN IF NOT EXISTS`).
   - HubSpot `contact.upsert` payload from the reservations route must send
     `firstname`/`lastname` (today it sends `{ email, name }`); the `apps/hubspot`
     `ContactUpsertSchema`/handler already supports `firstname`/`lastname`.
   - Users table already stores split names (`first_name`/`last_name`, migration 0008) —
     no combined-name split needed there; the existing `name` column stays as a derived
     display value.

7. **Number of rooms field.** Required integer "Nombre de chambres" (min 1) on the form;
   validate in `ReservationRequestSchema`; store on `reservations` (same or additional
   idempotent numbered migration); pass through the `deal.create` enqueue in
   `apps/api/src/index.ts`; add to `DealCreateSchema` and map to HubSpot deal property
   `number_of_rooms` in `apps/hubspot/src/ops/deal.ts` (no `hs_` prefix; portal property
   creation is out of scope).

8. **Reactive nav auth state.** Introduce a shared Svelte auth store (mirroring the existing
   `settings.svelte.ts` `$state` pattern) that `Nav.svelte` reads instead of its own
   `onMount` `fetch('/api/auth/me')`; the login flow (`connexion/+page.svelte`) updates the
   store so the menu switches from "Connexion" to Profil/Admin immediately, no refresh.

9. **Logout control.** Add a visible logout button in both the desktop nav and the mobile
   menu (`Nav.svelte`) that calls `POST /api/auth/logout` (helper `logout()` already in
   `apps/web/src/lib/api.ts`), clears the shared auth store, and reverts to logged-out state
   without a page refresh.

**OUT of scope:** creating the HubSpot `number_of_rooms` portal property; redesigning the
reservation flow beyond these fields; changing pricing/settings semantics; touching
`apps/ab-splitter`. Never stage/commit `.svelte-kit/` or `.codegraph/codegraph.db`.

## Success Criteria

- No occurrence of "petit-déjeuner" / "déjeuner servi" / breakfast remains in rendered site
  copy or content data; the test suite passes with updated assertions.
- The footer (with `CITQ #304542`) is visibly rendered at the bottom of every page on both
  mobile and desktop, in a normal (non-reduced-motion) browser.
- The homepage rooms stat shows the live count of public rooms from the API, and falls back
  to a sensible static number when the API is unreachable.
- The homepage "Nos chambres" section shows accommodation types with no per-room RÉSERVER
  buttons and a single global "Réserver" CTA; the same holds on `/le-site#chambres`.
- Logged in, the reservation form does not ask for name/email and still submits a reservation
  correctly attributed to the user; logged out, it asks for Prénom, Nom, Courriel.
- A reservation submitted with Prénom/Nom/Nombre de chambres persists those columns, and the
  HubSpot `contact.upsert` carries `firstname`/`lastname` while `deal.create` carries
  `number_of_rooms`.
- After login, the nav updates to Profil/Admin immediately; a logout control in desktop and
  mobile menus logs the user out and reverts the nav — both without a full page reload.
- All migrations are idempotent, each in its own numbered file; typecheck and build pass.

## Key Decisions

- **Footer root cause = Svelte CSS pruning, not layout.** `Footer.svelte` initializes
  `opacity: 0` and adds the class `footer--visible` imperatively via
  `footerEl.classList.add(...)` from an `IntersectionObserver`. Because that class never
  appears literally in the component markup, the Svelte compiler treats `.footer.footer--visible`
  as an unused selector and **prunes `opacity: 1` out of the emitted CSS** (the
  `svelte-ignore css_unused_selector` comment silences the warning but does not stop the
  prune). Net effect: the footer stays at `opacity: 0` on every page except under
  `prefers-reduced-motion` (which has a separate always-on rule). Preferred fix: drive
  visibility from reactive state bound in markup (e.g. `class:footer--visible={visible}`
  with an `$state` flag toggled by the observer) so the selector is retained, or make the
  rule `:global`, or simply remove the opacity gate. Any option must keep the footer visible
  and stay responsive.
- **Live room count source (change 3).** Prefer counting `is_public` rooms server-side and
  exposing it as an extra field. `GET /api/rooms` already returns only public rooms, so the
  frontend can use `rooms.length`; alternatively add `publicRoomCount` to `GET /api/settings`.
  Recommend adding it to the public settings response (single fetch already made on load via
  `loadSettings()`), keeping the current static `12` as fallback. Note: the documented
  `marketing_room_count` / `assignable_room_count` settings do **not** exist in
  `apps/api/src/settings.ts` (only `nightly_price` + `contact_email`); the frontend's
  `settings.marketingRoomCount` therefore never updates from the API today — so this change
  also closes that latent gap rather than extending a live setting.
- **Reservation persistence bug (context for 6 & 7).** The frontend `createReservation` sends
  `{ name, email, checkIn, checkOut, guests, message }`, but the API schema expects
  `arrive`/`depart`/`people`; the mismatched keys are dropped and `people` always falls back
  to `1`. While wiring the new Prénom/Nom + Nombre de chambres fields, align the request
  contract so the new fields (and, recommended, the existing dates/guests) actually persist.
- **Keep `reservations.name` populated.** `reservations.name` is `NOT NULL`. When splitting
  into `first_name`/`last_name`, continue writing a derived combined `name` (e.g.
  `"{first} {last}"`) so existing admin reservation views and the NOT NULL constraint keep
  working; add the new columns as nullable.
- **Session prefill mechanism (change 5).** Derive the logged-in user's name/email from the
  shared auth store introduced in change 8 (client prefill + hide fields); the API may also
  fall back to the session user when authenticated. The auth store is the shared dependency
  tying changes 5, 8, and 9 together and should be built first.
- **Amenity A-04.** Removing the breakfast amenity leaves a 4-item amenity slice used on the
  homepage; replace `A-04` with a truthful amenity (e.g. accès cuisine / café en libre-service)
  rather than leaving a gap, to preserve the layout.

## Recommendations Adopted

- Build the shared auth store first; it unblocks changes 5, 8, and 9 and mirrors the proven
  `settings.svelte.ts` `$state` pattern already in the codebase.
- Fix the footer by binding visibility to reactive state in markup (not imperative
  `classList`), which both fixes the prune and keeps the reveal animation.
- Expose the live public-room count as an added field on the existing public settings
  response to avoid a second network round-trip, with the current `12` as static fallback.
- Concentrate the "Nos chambres" rework on the homepage + `RoomCard` (remove per-room CTA);
  leave `le-site#chambres`, which is already showcase-style, as the reference pattern.
- Correct the reservation request contract so the newly added fields — and the previously
  dropped dates/guests — persist end to end.
- Keep a derived combined `name` on reservations to satisfy `NOT NULL` and existing views.

## Anticipated Next Steps

- Run `npm run db:migrate` against `DB_CONN` after adding the new numbered migration(s), and
  deploy `apps/api` and `apps/hubspot` before `apps/web` so the new payload fields are
  accepted.
- Create the `number_of_rooms` custom deal property (and confirm `firstname`/`lastname`
  contact properties) in the HubSpot portal — out of scope here but required for the sent
  values to land.
- Update/extend the Vitest suite for content copy, footer visibility, the reworked room
  section, the split-name + rooms-count form, and the reactive nav/logout behavior.
- Verify responsiveness of the changed form (Prénom/Nom row, Nombre de chambres) and nav
  (logout in desktop + mobile) at mobile and desktop breakpoints.
- Consider surfacing `number_of_rooms` in the admin reservations view for operational use.
