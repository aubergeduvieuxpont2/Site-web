# Understanding Brief

## Problem & Objective

L'Auberge du Vieux Pont's admin team needs a working operational back-office: reservations
currently render "Invalid Date", rooms can't be assigned, Québec taxes aren't configurable,
there is no invoicing path, user profiles are shallow, and every guest sees the same price.
The objective is to deliver six related admin/pricing capabilities on top of the just-merged
"public site & reservation flow refresh" (reservations split-name + room_count columns, shared
`auth.svelte.ts` store, migrations through 0014) so admins can manage reservations end-to-end
and offer per-user pricing, with HubSpot invoicing wired far enough to enqueue real ops.

## Scope

**In scope (six changes):**

1. **Fix Invalid Date** — align the frontend `ReservationRow` type and admin table to the
   API's real contract (`arrive`/`depart`/`people`, no `check_in`/`check_out`/`guests`/
   `updated_at`), format with `Intl.DateTimeFormat("fr-CA")`, render `—` for null dates, and
   add a regression test (real date for a populated row, `—` for a null-date row).
2. **Room assignment** — idempotent migration `reservation_room_assignments (reservation_id
   BIGINT, room_slug TEXT FK → rooms.slug, UNIQUE(reservation_id, room_slug))`; SQL overlap
   validation (a room may be assigned once per night: reject if the same `room_slug` is on
   another reservation whose `[arrive, depart)` overlaps); a "rooms free for this date range"
   endpoint; admin UI to assign/unassign rooms on the reservation (respecting `room_count`).
3. **Tax settings** — add `tps` (5), `tvq` (9.975), `accommodation_tax` (3.5) as percent
   numbers to the `settings` table + `settings.ts`; expose in `GET`/`POST /api/admin/settings`
   AND in public `GET /api/settings`; validate as non-negative numbers (0 allowed).
4. **HubSpot invoice wiring (initial)** — new `invoice.create` outbox op in `apps/hubspot`
   (`crm/v3/objects/invoices`, `hs_currency=CAD`, amount, description, contact association);
   `POST /api/admin/reservations/:id/invoice` with body `{ type: "deposit" | "full",
   depositPercent? }` computing amount from effective nightly × nights × room_count + taxes,
   enqueued via the outbox; admin UI button to create a deposit/full invoice.
5. **Admin user profile view** — dedicated SPA route (e.g. `/admin/utilisateurs/:id`) showing
   all local fields + live HubSpot contact data fetched by id through the `HUBSPOT` binding's
   synchronous `/ops/execute` (`contact.getById`), with a back link to the Utilisateurs tab.
6. **Per-user pricing** — nullable, mutually-exclusive `discount_percent` / `fixed_nightly_price`
   columns on `users`; server-computed `effectiveNightlyPrice` (fixed > discount > public)
   exposed on `GET /api/auth/me` and threaded through `auth.svelte.ts` into all price displays;
   the invoice math (change 4) resolves the reservation user by case-insensitive email match
   and uses their effective price, falling back to public `nightly_price`.

**Out of scope:** HubSpot portal-side setup (scopes, invoice object permissions/properties) —
the invoice op must fail gracefully into the outbox `failed` state; tax-inclusive public price
display (public prices stay tax-exclusive; taxes surface only in admin invoice math);
resurrecting the vestigial `marketing_room_count`/`assignable_room_count` settings.

## Success Criteria

- Admin dashboard shows valid, localized fr-CA dates for every reservation, `—` for null dates;
  the regression test fails if the field-name mismatch returns.
- An admin can assign N rooms to a reservation and cannot double-book a room whose nights
  overlap another reservation; the "free rooms" list reflects availability for the date range;
  reservations with null/invalid dates (or `depart <= arrive`) are ineligible with a clear
  French message.
- Paramètres exposes TPS/TVQ/hébergement; values persist, appear in both admin and public
  settings responses, and reject negative input.
- `POST .../invoice` computes `base = effective_nightly × nights × room_count`, adds
  `base·(tps+tvq)` and accommodation tax on the lodging subtotal (no compounding), defaults
  `depositPercent = 30` for deposits, rejects missing/invalid dates or null `room_count` with a
  422-style error, and enqueues an `invoice.create` op (landing in `failed` if HubSpot rejects).
- Clicking a user opens their profile with local fields + live HubSpot data (or "Aucune donnée
  HubSpot" when `hubspot_contact_id` is null or the fetch fails, without blocking local fields).
- A user with custom pricing sees their effective nightly price across the room showcase and
  reservation flow; their invoices use that effective price.
- All new admin UI is responsive (mobile + desktop); no `.svelte-kit/` or `.codegraph/codegraph.db`
  is staged/committed.

## Key Decisions

- **Change 1 is a contract mismatch, not a date bug.** API returns `arrive`/`depart` (dates
  via `to_char(...,'YYYY-MM-DD')`, null for legacy rows) and `people`; the frontend type/table
  read `check_in`/`check_out`/`guests`/`updated_at`, so `new Date(undefined)` → "Invalid Date".
  Fix the type + table field names; null dates come back as SQL null → render `—`.
  (Note for the Planner: `YYYY-MM-DD` strings passed to `new Date(...)` parse as UTC midnight
  and can shift a day in local fr-CA formatting — prefer a date-only-safe format so the
  displayed day matches the stored date.)
- **Assignment keyed by `room_slug`** (no numeric room id); overlap check in SQL with the
  half-open `[arrive, depart)` rule (`arrive < $depart AND depart > $arrive`).
- **Two HubSpot paths already exist:** `/ops/execute` (synchronous, for `contact.getById` read)
  and `/ops/enqueue` (outbox, for `invoice.create`). Reuse both; add ops under
  `apps/hubspot/src/ops/`; the API enqueues via `c.env.HUBSPOT.fetch("http://hubspot/ops/enqueue")`.
- **Tax math:** percent numbers stored raw (5, 9.975, 3.5); `total = base + base·(tps+tvq) +
  accommodation`; no compounding.
- **Effective price precedence:** `fixed_nightly_price > discount_percent > public nightly_price`;
  mutual exclusivity enforced in both API validator and admin UI.
- **Invoice user resolution:** case-insensitive `reservations.email` → `users.email`; fall back
  to public `nightly_price` when no user matches.
- **Profile presentation:** dedicated SPA route with back link (not modal/expanding row).
- **Migrations start at `0015`,** one schema change per numbered file, all idempotent
  (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Suggested split:
  `0015_users_pricing.sql`, `0016_settings_taxes.sql` (or seed via settings defaults),
  `0017_reservation_room_assignments.sql` — Planner to finalize ordering.

## Recommendations Adopted

- **Change 1:** Align `ReservationRow` + admin table to `arrive`/`depart`/`people`, format with
  `Intl.DateTimeFormat("fr-CA")`, `—` for null, add the null-safe regression test.
- **Change 2:** `reservation_room_assignments` join table with SQL overlap check + "free rooms"
  endpoint; block ineligible (null/invalid dates, `depart <= arrive`) with a French message.
- **Change 3:** Extend the live `settings.ts` module + `AdminSettings`/`PublicSettings` shapes
  with `tps`/`tvq`/`accommodationTax`; do not resurrect the vestigial room-count settings.
- **Change 4:** Put the amount/tax computation in a shared, unit-tested `apps/api` helper reused
  by the invoice endpoint (and future price display); keep the HubSpot call minimal and let the
  outbox retry/fail-state handle portal rejections.
- **Change 5:** `contact.getById` synchronous read via `/ops/execute`; graceful "Aucune donnée
  HubSpot" when id is null or fetch fails, never blocking the local-fields view.
- **Change 6:** Nullable mutually-exclusive `discount_percent`/`fixed_nightly_price` on `users`;
  compute `effectiveNightlyPrice` server-side, expose on `/api/auth/me`, thread through
  `auth.svelte.ts` so `RoomCard`/reservation flow read it; enforce exclusivity in API + UI.
- **General:** Reuse the existing responsive admin patterns (`max-width:640px` breakpoint,
  horizontal-scroll table); never stage `.svelte-kit/` or `.codegraph/codegraph.db`.

## Anticipated Next Steps

- **HubSpot portal configuration** (the deferred half of change 4): grant invoice scopes/
  permissions and define required invoice properties, then requeue `invoice.create` ops that
  landed in the outbox `failed` state (the `/api/admin/outbox/:id/requeue` path already exists).
- **Tax-inclusive display / quote endpoint:** once taxes are in settings, a future change can
  surface tax-inclusive totals to guests (a shared quote helper is worth designing now).
- **Migration/deploy sequencing:** run `npm run db:migrate` before deploying the API so the new
  columns/tables exist; deploy API before web so the frontend's new contract is served.
- **Backfill consideration:** legacy reservations with null dates remain unassignable/
  un-invoiceable by design — the operator may want a later data-cleanup pass to populate them.
- **Regression coverage:** beyond the change-1 test, consider tests for overlap rejection,
  tax math, and effective-price precedence so these invariants can't silently regress.
