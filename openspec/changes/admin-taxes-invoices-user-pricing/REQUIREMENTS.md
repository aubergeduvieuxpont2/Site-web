# Requirements — Admin taxes, invoices & per-user pricing

## In Scope

### Functional Requirements

**Change 1 — Fix "Invalid Date"**
- **FR-1.1 (MUST)** The frontend `ReservationRow` type MUST match the API contract:
  `arrive`/`depart` (`"YYYY-MM-DD" | null`), `people`, `room_count`, `first_name`,
  `last_name`; it MUST NOT declare `check_in`/`check_out`/`guests`/`updated_at`.
- **FR-1.2 (MUST)** The admin and profil reservation tables MUST format `arrive`/
  `depart`/`created_at` with `Intl.DateTimeFormat("fr-CA")` via a date-only-safe parse
  that displays the exact stored calendar day (no UTC day-shift).
- **FR-1.3 (MUST)** A null `arrive`/`depart` MUST render as `—`.
- **FR-1.4 (MUST)** A regression test MUST assert a real localized date for a populated
  row and `—` for a null-date row, failing if the field-name mismatch returns.

**Change 2 — Room assignment**
- **FR-2.1 (MUST)** A migration MUST create `reservation_room_assignments`
  (`reservation_id` BIGINT FK, `room_slug` TEXT FK → `rooms.slug`,
  `UNIQUE(reservation_id, room_slug)`), idempotently.
- **FR-2.2 (MUST)** Assigning a room MUST be rejected (409, French) when the same
  `room_slug` is on another reservation whose `[arrive, depart)` overlaps
  (`arrive < depart' AND depart > arrive'`).
- **FR-2.3 (MUST)** A free-rooms-for-range endpoint MUST return rooms with no
  overlapping assignment for the reservation's dates.
- **FR-2.4 (MUST)** Assign/unassign endpoints MUST exist and be admin-gated; assignment
  MUST NOT exceed the reservation's `room_count` (409, French).
- **FR-2.5 (MUST)** Reservations with null/invalid dates or `depart <= arrive` MUST be
  ineligible for assignment/free-rooms with a clear French message (422).
- **FR-2.6 (SHOULD)** The admin reservations UI SHOULD let an admin view current
  assignments and assign/unassign from the free-rooms list.

**Change 3 — Tax settings**
- **FR-3.1 (MUST)** `tps` (5), `tvq` (9.975), `accommodation_tax` (3.5) MUST be seeded
  in `settings` and exposed via both `GET /api/settings` and `GET /api/admin/settings`.
- **FR-3.2 (MUST)** `POST /api/admin/settings` MUST accept and persist the three taxes,
  validating them as non-negative numbers (0 allowed, decimals allowed).
- **FR-3.3 (MUST)** A negative tax value MUST be rejected (400).
- **FR-3.4 (SHOULD)** The Paramètres UI SHOULD provide numeric inputs for the three
  taxes with non-negative client validation.

**Change 4 — HubSpot invoice wiring**
- **FR-4.1 (MUST)** `apps/hubspot` MUST register an `invoice.create` op posting to
  `crm/v3/objects/invoices` with `hs_currency=CAD`, an amount, a description, and a
  contact association.
- **FR-4.2 (MUST)** `POST /api/admin/reservations/:id/invoice` (admin-gated) with
  `{ type: "deposit" | "full", depositPercent? }` MUST compute
  `base = effective_nightly × nights × room_count`, add `base·(tps+tvq)` and
  accommodation tax on the lodging subtotal (no compounding), default
  `depositPercent = 30` for deposits, and enqueue an `invoice.create` op.
- **FR-4.3 (MUST)** The endpoint MUST return 422 (French) when the reservation has
  missing/invalid dates or a null `room_count`.
- **FR-4.4 (MUST)** The amount/tax computation MUST live in a shared, unit-tested
  `apps/api` helper.
- **FR-4.5 (MUST)** A rejected `invoice.create` op MUST land in the outbox `failed`
  state (requeuable), never breaking the admin response.
- **FR-4.6 (SHOULD)** The admin reservations UI SHOULD expose a deposit/full invoice
  button.

**Change 5 — Admin user profile view**
- **FR-5.1 (MUST)** A dedicated SPA route (`/admin/utilisateurs/:id`, client-only) MUST
  show all local user fields with a back link to the Utilisateurs tab.
- **FR-5.2 (MUST)** It MUST fetch live HubSpot contact data by id through the gateway's
  synchronous `/ops/execute` `contact.getById`.
- **FR-5.3 (MUST)** When `hubspot_contact_id` is null or the fetch fails, it MUST show
  `"Aucune donnée HubSpot"` without blocking or failing the local-fields view (never a
  5xx from the API for the HubSpot half).
- **FR-5.4 (SHOULD)** The Utilisateurs tab SHOULD link each user row to their profile.

**Change 6 — Per-user pricing**
- **FR-6.1 (MUST)** `users` MUST gain nullable `discount_percent` and
  `fixed_nightly_price` columns (migration `0015`+).
- **FR-6.2 (MUST)** The two columns MUST be mutually exclusive, enforced by the API
  validator and the admin UI.
- **FR-6.3 (MUST)** `GET /api/auth/me` MUST expose a server-computed
  `effectiveNightlyPrice` with precedence `fixed_nightly_price > discount_percent >
  public nightly_price`.
- **FR-6.4 (MUST)** The effective price MUST thread through `auth.svelte.ts` into the
  RoomCard and le-site price displays for a logged-in user.
- **FR-6.5 (MUST)** The invoice math MUST resolve the reservation user by
  case-insensitive email and use their effective price, falling back to public
  `nightly_price` when unmatched.
- **FR-6.6 (SHOULD)** The admin user profile SHOULD allow editing the two pricing fields
  (mutually exclusive) via an admin endpoint.

### Non-Functional Requirements

- **NFR-1 (MUST)** All migrations MUST be idempotent (`IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`) — one schema change per numbered file starting at `0015`.
- **NFR-2 (MUST)** All new admin UI MUST be responsive (usable at ≤640px: full-width
  inputs, horizontally scrollable tables), reusing existing admin patterns.
- **NFR-3 (MUST)** All user-facing copy MUST be French (Québec).
- **NFR-4 (MUST)** `npm run typecheck` MUST pass across all workspaces.
- **NFR-5 (MUST)** No secrets may enter `apps/web`; PII endpoints stay admin-gated; SQL
  stays parameterized.
- **NFR-6 (MUST)** `.svelte-kit/` and `.codegraph/codegraph.db` MUST NOT be staged or
  committed.
- **NFR-7 (SHOULD)** Money math SHOULD round to 2 decimals consistently between the
  endpoint and its unit tests.

### Constraints

- **C-1** Backend: Hono on Cloudflare Workers; Neon Postgres via the `@neondatabase/
  serverless` HTTP driver (`DB_CONN` var, no binding block).
- **C-2** `apps/api` reaches HubSpot only via the internal `HUBSPOT` service binding
  (`http://hubspot/ops/{enqueue,execute}`); no direct HubSpot calls from the API.
- **C-3** Frontend: Svelte 5 runes + adapter-cloudflare SPA; dynamic auth-gated routes
  are client-only (`ssr=false; prerender=false`).
- **C-4** `settings` values are `TEXT`; numeric settings are parsed on read.
- **C-5** Reservations are not FK-linked to users; user resolution is by email.
- **C-6** HubSpot portal invoice scopes/properties are not configured yet; the op must
  fail gracefully into the outbox.

## Out of Scope (Exclusions)

- HubSpot portal-side setup (invoice scopes, object permissions/properties) and
  requeuing of `failed` ops after that setup.
- Tax-inclusive public price display or a guest quote endpoint (public prices remain
  tax-exclusive; a shared quote helper is a future step).
- Resurrecting or removing the vestigial `marketing_room_count` /
  `assignable_room_count` settings and their residual frontend fields.
- Backfilling legacy null-date reservations to make them assignable/invoiceable.
- A DB-level CHECK constraint for pricing mutual exclusivity (enforced in app layer).
- Linking reservations to users by foreign key.

## Acceptance Criteria

- **AC-1** `GET /api/settings` and `GET /api/admin/settings` return numeric `tps`,
  `tvq`, `accommodationTax`; posting `{tps:0, tvq:9.975, accommodationTax:3.5,
  nightlyPrice:89, contactEmail:"a@b.ca"}` persists them (200) and a negative tax → 400.
- **AC-2** The admin reservations table shows a populated `arrive` as its exact stored
  fr-CA day (no off-by-one) and `—` for null; the regression test fails if the type
  reverts to `check_in`/`check_out`/`guests`.
- **AC-3** `POST /api/admin/reservations/:id/assignments {roomSlug}` → 201 for a free
  room, 409 when the room's nights overlap another reservation, 422 for a null/invalid
  or `depart<=arrive` reservation; `GET …/free-rooms` excludes overlapping rooms.
- **AC-4** For `arrive=2026-08-01`, `depart=2026-08-03`, `room_count=2`,
  effective nightly `89`, `tps=5`, `tvq=9.975`, `accommodation_tax=3.5`,
  `POST …/invoice {type:"deposit"}` returns `base=356`, `lodgingTax=53.31`,
  `accommodationTax=12.46`, `total=421.77`, `amount=126.53`, and enqueues one
  `invoice.create` row; a reservation with null dates or null `room_count` → 422.
- **AC-5** `GET /api/admin/users/:id` returns local fields plus `hubspot` when the id
  resolves and `hubspot: null` (never 5xx) otherwise; the profile route renders
  `"Aucune donnée HubSpot"` in the null case and a working back link.
- **AC-6** A user with `fixed_nightly_price=70` shows `effectiveNightlyPrice=70` on
  `/api/auth/me` and in the RoomCard/le-site price; a user with `discount_percent=10`
  shows `80.10`; that effective price drives their invoice amount; posting both pricing
  fields to `POST /api/admin/users/:id/pricing` → 400.
- **AC-7** The `apps/hubspot` registry parses `invoice.create` and `contact.getById`
  envelopes; an `invoice.create` op rejected by HubSpot lands in the outbox `failed`
  state.
- **AC-8** `npm run typecheck` passes; new admin UI is usable at ≤640px; no
  `.svelte-kit/` or `.codegraph/codegraph.db` is staged/committed.
