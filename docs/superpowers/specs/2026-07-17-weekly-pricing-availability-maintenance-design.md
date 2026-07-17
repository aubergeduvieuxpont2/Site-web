# Weekly Pricing + Availability-Aware Reservations + Maintenance Toggle

**Date:** 2026-07-17
**Status:** Approved for implementation (orchestrator)
**Repo:** Site-web (Cloudflare monorepo — `apps/web` Svelte 5 SPA, `apps/api` Hono Worker on Neon Postgres)

## Summary

Three user-requested capabilities plus one date-validation fix, grouped into four
workstreams:

- **A — Weekly price:** a configurable weekly rate that auto-applies to stays of
  7+ nights (per-week block + nightly remainder), including per-user custom weekly rates.
- **B — Availability model:** a real per-night availability calculation (hybrid:
  confirmed reservations + admin blackout dates) so the site never accepts a booking
  for nights that are full, and surfaces *which* nights are unavailable.
- **C — Reservation flow:** availability-gated public reservation form + admin
  confirm/cancel workflow + admin blackout management, plus a strict `depart > arrive`
  date fix.
- **D — Maintenance toggle:** a settings switch that disables all reservation entry
  (UI + API) and shows a site-wide maintenance banner.

All migrations are idempotent, one change per numbered file (`0020`–`0024`). TDD
throughout (existing suites: 128 API tests, 854 web tests) — every new behavior lands
with a test, every fixed behavior lands with a regression test.

---

## Current-state facts (verified)

- **Settings** = TEXT key-value table (`settings`), read via `settings.ts`
  (`SETTINGS_DEFAULTS`, `PUBLIC_SETTING_KEYS`, `rowsToAdminSettings`, `toPublicSettings`)
  and mutated via `SettingsUpdateSchema` + `POST /api/admin/settings`. Currently persisted
  keys: `nightly_price`, `contact_email`, `contact_phone`, `tps`, `tvq`, `accommodation_tax`.
- `marketing_room_count` and `assignable_room_count` are **seeded in the DB but orphaned
  server-side** — `settings.ts` never reads or writes them. `publicRoomCount` (a live
  `COUNT(*)` of public rooms) replaced the marketing count on the public endpoint.
- **Pricing** = one global `nightly_price`, optionally overridden per user via
  `users.discount_percent` **or** `users.fixed_nightly_price` (mutually exclusive).
  Tax cascade duplicated in backend `pricing.ts::computeInvoice` and frontend
  `utils.ts::estimateStay`. `toNumberOrNull` coerces Postgres NUMERIC-as-string.
- **Reservations** (`reservations` table): free-text `room` (no FK), nullable `arrive`/`depart`
  DATE, `people`, `room_count`, no status column. `POST /api/reservations` inserts a row
  and fires HubSpot outbox events; **it blocks no inventory**.
- **Availability today** exists only as a derived view of *admin-assigned* rooms
  (`reservation_room_assignments` + `freeRoomsForRange`/`isRoomFreeForRange` in
  `assignments.ts`). Public bookings never assign rooms. There is **no** calendar,
  inventory, or blackout table.
- **Date validation:** `reservationDatesValid` (server) and `datesOutOfOrder` (client)
  already use strict `>`, but the contact form's checkout input uses `min={form.checkIn}`,
  which *permits selecting the same day* (rejected only on submit).

---

## Workstream A — Weekly price

### Data / settings
- New global setting `weekly_price` (integer, positive; **default `560`**).
  - `apps/api/src/settings.ts`: add to `SETTINGS_DEFAULTS`, `PUBLIC_SETTING_KEYS`,
    `SettingsUpdateSchema` (`weeklyPrice: z.coerce.number().int().positive()`),
    `rowsToAdminSettings`, `toPublicSettings`, and the `POST /api/admin/settings` upsert list.
  - Migration `0020_settings_weekly_price.sql`: `INSERT ... ('weekly_price','560') ON CONFLICT DO NOTHING`.
- New per-user column `users.fixed_weekly_price NUMERIC(10,2)` (nullable).
  - Migration `0021_users_fixed_weekly_price.sql`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS fixed_weekly_price NUMERIC(10,2);`

### Pricing math
Weekly-block rule, applied to the **base** before the tax cascade, then `× roomCount`:
```
if nights >= 7:  base_per_room = floor(nights/7)*weeklyRate + (nights % 7)*nightlyRate
else:            base_per_room = nights * nightlyRate
base = base_per_room * roomCount
```
- `apps/api/src/pricing.ts`:
  - `resolveEffectiveWeekly(userPricing, publicWeekly, publicNightly)` mirrors
    `resolveEffectiveNightly`: `fixed_weekly_price` wins; else apply `discount_percent`
    to `publicWeekly`; else `publicWeekly`. (Discount applies to **both** nightly and weekly.)
  - Add a shared `computeBase(nights, roomCount, nightlyRate, weeklyRate)` helper used by
    `computeInvoice`. `ComputeInvoiceParams` gains `weeklyRate`.
- `apps/web/src/lib/utils.ts`: `estimateStay` gains a `weeklyRate` param and the same
  weekly-block logic (keep the two implementations behaviorally identical; cover with tests
  that assert parity on the same inputs).

### Per-user pricing UI + API
- `POST /api/admin/users/:id/pricing` body gains `fixedWeeklyPrice?: number|null`
  (Zod `≥0`). Rule: `fixed_weekly_price` is only meaningful in **fixed** mode; reject it
  when a `discount_percent` is being set (keep discount/fixed mutually exclusive; within
  fixed mode, `fixed_weekly_price` is optional and independent of `fixed_nightly_price`).
- Session-user + reservation-context endpoints return `effectiveWeeklyPrice` alongside
  `effectiveNightlyPrice`.
- `apps/web/src/lib/components/admin/UserPricingForm.svelte`: add a fixed-weekly input
  (shown in fixed mode), extend `computeEffectivePrice`/preview to show both rates, extend
  `validate()` and the request body.

### Reservation form display
- `apps/web/src/routes/contact/+page.svelte`: derive `weeklyRate` from
  `auth.user?.effectiveWeeklyPrice ?? settings.weeklyPrice`; pass to `estimateStay`;
  show a weekly-rate line and a small hint when the weekly rate is active (nights ≥ 7).

---

## Workstream B — Availability model (hybrid)

### Schema
- Migration `0022_reservations_status.sql`:
  ```sql
  ALTER TABLE reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
  -- Backfill existing rows to 'confirmed' (they are real bookings that consume availability).
  UPDATE reservations SET status = 'confirmed' WHERE status = 'pending' AND created_at < now();
  ```
  (Split ALTER and UPDATE into two statements in the same file; both idempotent-safe.)
  Allowed values enforced in application code: `pending` | `confirmed` | `cancelled`.
- Migration `0023_blackout_dates.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS blackout_dates (
    date          DATE PRIMARY KEY,
    rooms_blocked INTEGER NOT NULL,   -- number of rooms unavailable that night
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
  A "full close" is `rooms_blocked = assignable_room_count` (or greater). Availability
  clamps at 0, so over-blocking is safe.

### Wire in `assignable_room_count`
`settings.ts` starts reading/writing `assignable_room_count` (admin-only, per the CLAUDE.md
contract — it stays out of the public payload). Availability math depends on it.
`AdminSettings` already types `assignableRoomCount`; add it to `SettingsUpdateSchema`
(`z.coerce.number().int().positive()`), `rowsToAdminSettings`, and the admin upsert list.

### Availability calculation — `apps/api/src/availability.ts` (new module)
Per night `d` (half-open range `[arrive, depart)`):
```
occupied(d)  = SUM(room_count) FROM reservations
               WHERE status = 'confirmed' AND arrive <= d AND depart > d
blocked(d)   = COALESCE((SELECT rooms_blocked FROM blackout_dates WHERE date = d), 0)
available(d) = max(0, assignable_room_count - occupied(d) - blocked(d))
```
A night is **unavailable for a request of `R` rooms** when `available(d) < R`.
Provide `availabilityForRange(sql, checkIn, checkOut, rooms, assignableRoomCount)` returning
`{ nights: [{ date, available }], unavailableNights: string[] }`. Use a single set-returning
query (`generate_series`) joined to reservation counts + blackout, not a per-night loop.

### Public endpoint
`GET /api/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&rooms=N`
- Validates dates (strict `depart > arrive`) and `rooms >= 1`.
- Reads `assignable_room_count` from settings.
- Returns `{ nights, unavailableNights, allAvailable: boolean }`.
- No auth; rate-limited like other public reads.

---

## Workstream C — Reservation flow

### Availability-gated contact form
`apps/web/src/routes/contact/+page.svelte`:
- On `checkIn`/`checkOut`/`roomCount` change (debounced), call
  `getAvailability(checkIn, checkOut, roomCount)` (new client in `api.ts`).
- If `unavailableNights` non-empty: render a warning listing the blocked nights
  (formatted, localized FR) and **disable submit** until the range is clear.
- Loading/empty/error states: on availability-check error, do **not** hard-block —
  show a soft notice and allow submit (server re-checks). On any unavailable night,
  hard-block. Submit is enabled only when dates valid **and** `allAvailable`.

### Server defense-in-depth
`POST /api/reservations`:
- After schema validation, when both dates present, recompute availability for the
  requested `roomCount`. If not fully available → **409** with message
  « Ces dates ne sont plus disponibles. » (localized). Prevents API-direct overbooking.
- New public reservations insert with `status = 'pending'`.

### Strict date fix
- Contact form checkout input: `min` = **day after** `form.checkIn` (compute
  `checkIn + 1 day`; clear/adjust `checkOut` if it becomes `<= checkIn`).
- Add regression tests: `datesOutOfOrder(d, d)` is `true`; `reservationDatesValid(d, d)`
  is `false`; API rejects equal dates with the existing 400 message.

### Admin confirm/cancel workflow
- New endpoint `PATCH /api/admin/reservations/:id/status` (admin-gated) — body
  `{ status: 'pending'|'confirmed'|'cancelled' }` (Zod enum). Updates the row.
- `apps/web/src/lib/components/admin/ReservationTableRow.svelte`: status badge +
  confirm/cancel actions (optimistic update via a new `adminSetReservationStatus` client).
- Only `confirmed` reservations consume availability (per Workstream B math).

### Admin blackout management
- New endpoints (admin-gated):
  - `GET /api/admin/blackouts` → list.
  - `PUT /api/admin/blackouts/:date` → upsert `{ roomsBlocked, note? }`.
  - `DELETE /api/admin/blackouts/:date`.
- New admin tab **« Disponibilités »** (`apps/web/src/routes/admin/+page.svelte` +
  a `AdminDisponibilitesTab.svelte` component): list existing blackout dates, add a date
  with rooms-blocked (default = assignable room count = fully closed), remove a date.
  Client wrappers in `api.ts`.

---

## Workstream D — Maintenance toggle

- New global setting `reservations_enabled` (boolean stored as `'true'`/`'false'`;
  **default `true`**), exposed on the **public** `/api/settings` as `reservationsEnabled`.
  - `settings.ts`: add to defaults, public keys, `SettingsUpdateSchema`
    (`reservationsEnabled: z.coerce.boolean()` — parse `'true'`/`'false'`/`'1'`/`'0'`
    robustly via a small helper), `rowsToAdminSettings`, `toPublicSettings`, admin upsert.
  - Migration `0024_settings_reservations_enabled.sql`:
    `INSERT ... ('reservations_enabled','true') ON CONFLICT DO NOTHING`.
    *(Renumber if 0024 is taken at implementation time — one change per file, in order.)*
- **Admin toggle** in *Paramètres* (checkbox/switch bound to `settings.reservationsEnabled`).
- **When OFF:**
  - `apps/web/src/routes/+page.svelte`: hero + section « Réserver » buttons disabled
    (render disabled `Button`, not a link).
  - `apps/web/src/routes/contact/+page.svelte`: submit disabled + inline notice.
  - **Site-wide banner** component (`MaintenanceBanner.svelte`) rendered from the root
    layout when `!settings.reservationsEnabled`: « Réservations en pause — maintenance en cours ».
  - `POST /api/reservations` returns **503** « Les réservations sont temporairement
    désactivées. » when `reservations_enabled` is false. (Checked before availability.)

---

## Cross-cutting

### Public settings payload additions
`GET /api/settings` (and `PublicSettings` type in `api.ts` + `content.ts` DEFAULTS + the
settings store) gain:
- `weeklyPrice: number` (default 560)
- `reservationsEnabled: boolean` (default true)

`assignable_room_count` stays **admin-only** (not added to the public payload).

### Ordering / precedence in `POST /api/reservations`
1. Maintenance check → 503 if disabled.
2. Schema validation (incl. strict date rule) → 400.
3. Availability check → 409 if not fully available.
4. Insert (`status='pending'`) + HubSpot outbox.

### Migrations recap (idempotent, one change each)
- `0020_settings_weekly_price.sql`
- `0021_users_fixed_weekly_price.sql`
- `0022_reservations_status.sql`
- `0023_blackout_dates.sql`
- `0024_settings_reservations_enabled.sql`

**Deploy note (from memory):** migrate schema-changing PRs **before** merging/deploying to
avoid the deploy-before-migrate 500 seen in PR #35.

### Testing
- Backend (`apps/api`): unit tests for `resolveEffectiveWeekly`, `computeBase`/weekly-block
  math, `availabilityForRange` (empty, partial, full, blackout, cancelled-ignored,
  confirmed-counts), and integration tests for `/api/availability`,
  `PATCH /api/admin/reservations/:id/status`, blackout CRUD, `/api/reservations` 503/409/400
  paths, and settings round-trip incl. new keys.
- Frontend (`apps/web`): `estimateStay` weekly parity + boundary (6/7/8/14 nights);
  `datesOutOfOrder` equal-date regression; contact-form availability gating (blocked-nights
  render + submit disabled); maintenance banner + disabled buttons; UserPricingForm weekly.
- Assert backend/frontend pricing parity on shared fixtures.

### Out of scope (YAGNI)
- Per-room (vs per-count) availability granularity.
- Automatic room assignment at booking time.
- Reworking `reservation_room_assignments` (kept as-is for admin room assignment).
- Configurable maintenance-banner text (fixed FR string for now).
