# Public-Site & Reservation-Flow Refresh — SDD

## System Overview

Three independently deployed Cloudflare services share one Neon Postgres database:

- **`apps/web`** — Svelte 5 SPA (SvelteKit static output on a Worker). Talks to the
  API over same-origin `/api/*` with `credentials: 'include'`. Holds two reactive
  `$state` stores in `src/lib`: `settings.svelte.ts` (existing) and a new
  `auth.svelte.ts`. This change adds the auth store, reworks the footer, homepage
  rooms section, and reservation form, and removes breakfast copy.
- **`apps/api`** — Hono Worker. Owns the reservation contract, the public settings
  response, and enqueues HubSpot ops via the `HUBSPOT` service binding. This change
  extends the reservation schema/insert (split name + room count + contract fix),
  adds a live public-room count to `GET /api/settings`, and adds two migrations.
- **`apps/hubspot`** — outbox Worker. Consumes enqueued ops. This change maps a new
  `roomCount` payload field to the `number_of_rooms` deal property; the
  `firstname`/`lastname` contact fields are already supported.

The HTTP boundary is the contract. Deploy order for the new fields: `apps/api` and
`apps/hubspot` before `apps/web`, so the new payload is accepted before it is sent.

## Architecture Decisions

- **Shared auth store first.** A `$state` store (`auth.svelte.ts`) mirrors the proven
  `settings.svelte.ts` pattern and becomes the single source of nav auth state,
  replacing `Nav.svelte`'s own `onMount` fetch. Changes 5 (prefill), 8 (reactive
  nav), and 9 (logout) all depend on it, so it is built first. `+layout.svelte`
  populates it once on mount via `loadAuth()`; `connexion` updates it on login;
  the logout button clears it — all without a page reload.
- **Footer visibility via reactive markup binding, not `classList`.** The root cause
  is Svelte CSS pruning: because `.footer--visible` was only ever added
  imperatively, the compiler treated `.footer.footer--visible { opacity: 1 }` as an
  unused selector and dropped it, leaving `opacity: 0` on every non-reduced-motion
  page. Binding `class:footer--visible={visible}` with a `$state` flag toggled by
  the IntersectionObserver both keeps the reveal animation and forces the compiler
  to retain the selector.
- **Live room count as a settings-response field, not a new setting.** The
  documented `marketing_room_count` setting does not exist server-side; the frontend
  value never updates today. Rather than add a stored setting, the count is computed
  live from `rooms WHERE is_public = true` and appended to the existing
  `GET /api/settings` payload as `publicRoomCount` — no extra round-trip, static
  `12` fallback preserved.
- **Fix the reservation contract while adding fields.** The frontend already sends
  `checkIn/checkOut/guests`, which the API silently drops (it reads
  `arrive/depart/people`). The schema is widened to accept the frontend keys and map
  them, so the previously lost dates/guests and the new split-name/room-count fields
  all persist in one coherent contract.
- **Keep a derived `name` on reservations.** `reservations.name` is `NOT NULL` and
  backs existing admin/profile views. New columns (`first_name`, `last_name`,
  `room_count`) are nullable; `name` is written as `"{first} {last}"`.
- **RoomCard becomes informational.** Removing only the per-room CTA (not the whole
  card) keeps the accommodation-types showcase while funnelling all bookings through
  the single global "Réserver" flow, matching the already-showcase `le-site#chambres`.

## Component Responsibilities

| Unit | Responsibility |
|---|---|
| `lib/auth.svelte.ts` (new) | Reactive `{ user, loaded }` store; `setUser`/`clearUser`/`loadAuth`. |
| `Nav.svelte` | Read `auth.user`; render Connexion vs Profil/Admin; logout button (desktop + mobile). |
| `+layout.svelte` | Call `loadAuth()` on mount beside `loadSettings()`. |
| `connexion/+page.svelte` | `setUser()` after successful login/register. |
| `Footer.svelte` | `visible` `$state` bound in markup; observer sets it true. |
| `content.ts` | Source of truth for room/amenity copy; drop breakfast; `DEFAULTS.publicRoomCount`. |
| `le-site/+page.svelte` | Remove breakfast line from the `Le lieu` copy. |
| `RoomCard.svelte` | Informational card; no CTA button. |
| `+page.svelte` | Rooms stat bound to `settings.publicRoomCount`. |
| `contact/+page.svelte` | Split name + room-count fields; logged-in prefill; new submit contract. |
| `lib/api.ts` | `PublicSettings.publicRoomCount`; `ReservationRow` new cols; `createReservation` new shape. |
| `lib/settings.svelte.ts` | Default + merge `publicRoomCount`. |
| `api/src/index.ts` | Reservation schema/insert/enqueue; `publicRoomCount` count in settings route. |
| `api/src/settings.ts` | `PublicSettings.publicRoomCount` type surface. |
| `api/migrations/0013,0014` | Nullable `first_name`/`last_name`/`room_count`. |
| `hubspot/src/ops/deal.ts` | `roomCount` → `number_of_rooms` deal property. |

## Data Flow

### Auth state
`+layout.svelte` mount → `loadAuth()` → `GET /api/auth/me` → `setUser`/`clearUser`
→ `Nav.svelte` re-renders from `auth.user`. Login: `connexion` → `POST /api/auth/login`
→ `setUser(user)` → nav updates. Logout: nav button → `POST /api/auth/logout`
→ `clearUser()` → nav reverts. No route reload in any path.

### Reservation submit
`contact/+page.svelte` collects `firstName/lastName/email` (or derives them from
`auth.user` when logged in) + `checkIn/checkOut/guests/roomCount/message` →
`createReservation()` → `POST /api/reservations`. API validates, derives `name`,
`INSERT … RETURNING`, then `waitUntil` enqueues `contact.upsert`
(`{ email, firstname, lastname }`) and `deal.create` (`{ …, roomCount }`) to the
HubSpot Worker. HubSpot maps `roomCount → number_of_rooms` on the deal.

### Public settings / room count
`+layout.svelte` mount → `loadSettings()` → `GET /api/settings` → API reads the
`settings` rows AND `count(*) FROM rooms WHERE is_public = true` → returns
`{ nightlyPrice, contactEmail, marketingRoomCount?, publicRoomCount }` → merged into
the `settings` store → homepage rooms stat reflects the live count.

## Error Handling & Recovery

- **Settings count failure:** the `count(*)` is defensive — on any DB error the route
  still returns the base settings (omitting/ defaulting `publicRoomCount`), never a
  500; the frontend keeps its static `12`.
- **API unreachable:** `getPublicSettings()`/`getMe()` return `{ error }`; stores keep
  defaults (`settings` = 89/12, `auth.user` = null → logged-out nav). Footer/copy are
  static and unaffected.
- **HubSpot enqueue failure:** wrapped in `try/catch` inside `waitUntil` — never
  blocks the 201 reservation response. Retries are the outbox Worker's job.
- **Validation:** reservation `roomCount < 1` or missing first/last → 400 via the
  existing `reservationHook` (first issue message). Client mirrors the required-field
  checks for fast feedback but the server is authoritative.
- **Migration re-runs:** all `ADD COLUMN IF NOT EXISTS`, applied in order on every
  `db:migrate`; safe and idempotent.

## Performance & Scalability

- The added `count(*)` on `rooms` (a tiny table, ~3 rows) runs once per public
  settings fetch — negligible; no index needed. No extra network round-trip because
  it rides the existing `GET /api/settings` call already made on layout mount.
- Auth store removes a redundant `Nav.svelte` fetch: the shell now fetches `/auth/me`
  once (layout) instead of once in the layout loader plus once in the Nav.
- No new N+1s; reservation insert stays a single statement.

## Security Analysis

- **No new auth surface.** Logout reuses the existing `POST /api/auth/logout`
  (clears HttpOnly cookie server-side); the store only mirrors state and never holds
  a token. The JS layer still never reads the cookie.
- **Session-derived prefill.** Logged-in name/email come from the already-authenticated
  `auth.user` (populated from `/api/auth/me`); the server remains the authority for
  who the reservation is attributed to and may fall back to the session user.
- **Input validation.** New fields go through Zod (`firstName`/`lastName` trimmed
  min 1, `roomCount` coerced int min 1); values are parameterized into SQL via the
  Neon tagged-template driver — no interpolation, no injection vector. `roomCount`
  and names flow to HubSpot as typed properties, not raw query fragments.
- **CORS/rate-limit unchanged.** The reservation route keeps `rateLimitMiddleware`
  and the existing allow-list CORS.
- **No secrets in the frontend.** The auth store holds only the public `User` shape
  (id/email/name/role), same as today's Nav.

## Deployment Model

- **DB:** run `npm run db:migrate` against `DB_CONN` to apply `0013` and `0014`
  before deploying the API that reads/writes the new columns.
- **Order:** deploy `apps/api` and `apps/hubspot` (accept the new payload fields)
  before `apps/web` (start sending them). Each service deploys independently via its
  own `wrangler`.
- **Out of band:** the HubSpot portal must have a `number_of_rooms` deal property and
  `firstname`/`lastname` contact properties for the sent values to land — out of
  scope for this change, noted for operators.
- **Hygiene:** `.svelte-kit/` and `.codegraph/codegraph.db` are never staged or
  committed.
