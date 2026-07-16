# Admin taxes, invoices & per-user pricing

## Task

Deliver six admin/pricing capabilities on top of the just-merged public-site refresh
(migrations through `0014`, split-name + `room_count` reservation columns, shared
`auth.svelte.ts` store, `/ops/execute` + `/ops/enqueue` HubSpot paths):

1. **Fix "Invalid Date"** — the frontend `ReservationRow` type and the admin/profil
   tables read `check_in`/`check_out`/`guests`/`updated_at`, but the API returns
   `arrive`/`depart`/`people` (dates as `to_char(...,'YYYY-MM-DD')`, `null` for legacy
   rows). Align the type + tables, format with `Intl.DateTimeFormat("fr-CA")` using a
   date-only-safe parse (no UTC day-shift), render `—` for null dates.
2. **Room assignment** — a `reservation_room_assignments` join table keyed by
   `room_slug`; SQL `[arrive, depart)` overlap validation; a free-rooms-for-range
   endpoint; assign/unassign admin UI respecting `room_count`; null/invalid-date
   reservations ineligible with a French message.
3. **Tax settings** — `tps` (5), `tvq` (9.975), `accommodation_tax` (3.5) percent
   settings in the `settings` table, exposed in admin **and** public settings
   responses, validated non-negative (0 allowed).
4. **HubSpot invoice wiring** — an `invoice.create` outbox op; a shared unit-tested
   amount/tax helper; `POST /api/admin/reservations/:id/invoice`
   (`{ type, depositPercent? }`) computing the amount and enqueuing the op; an admin
   button.
5. **Admin user profile view** — a dedicated SPA route showing local fields + live
   HubSpot contact fetched by id, with graceful fallback and a back link.
6. **Per-user pricing** — nullable, mutually-exclusive `discount_percent` /
   `fixed_nightly_price` on `users`; server-computed `effectiveNightlyPrice`
   (fixed > discount > public) on `GET /api/auth/me`, threaded through
   `auth.svelte.ts` into price displays; invoice math resolves the user by
   case-insensitive email and uses their effective price.

## Schema Changes

All migrations idempotent, one schema change per numbered file, starting at `0015`.

### `apps/api/migrations/0015_users_pricing.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_percent    NUMERIC(5,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS fixed_nightly_price NUMERIC(10,2);
```
Both nullable; mutual exclusivity enforced in the API validator + admin UI (not a DB
constraint, to keep the migration trivially idempotent).

### `apps/api/migrations/0016_settings_taxes.sql`
```sql
INSERT INTO settings (key, value) VALUES
  ('tps',               '5'),
  ('tvq',               '9.975'),
  ('accommodation_tax', '3.5')
ON CONFLICT (key) DO NOTHING;
```

### `apps/api/migrations/0017_reservation_room_assignments.sql`
```sql
CREATE TABLE IF NOT EXISTS reservation_room_assignments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  room_slug      TEXT   NOT NULL REFERENCES rooms(slug)       ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, room_slug)
);
CREATE INDEX IF NOT EXISTS idx_rra_room_slug ON reservation_room_assignments (room_slug);
```

## API Types

```ts
// settings.ts — extended shapes (percent numbers, stored raw as TEXT)
interface AdminSettings  { nightlyPrice: number; contactEmail: string;
                           tps: number; tvq: number; accommodationTax: number; }
interface PublicSettings { nightlyPrice: number; contactEmail: string;
                           tps: number; tvq: number; accommodationTax: number;
                           publicRoomCount?: number; }

// SettingsUpdateSchema (zod) — taxes are decimals, non-negative (0 allowed):
//   tps, tvq, accommodationTax: z.coerce.number().min(0)
//   nightlyPrice keeps .int().positive(); contactEmail keeps .email()

// api.ts (frontend) — corrected reservation row (mirrors the API contract):
interface ReservationRow {
  id: number; name: string;
  first_name: string | null; last_name: string | null;
  email: string; phone: string | null; room: string | null;
  arrive: string | null; depart: string | null;   // "YYYY-MM-DD" | null
  people: number; room_count: number | null;
  message: string | null; created_at: string;
}

// User (frontend + /api/auth/me) gains:
interface User { /* …existing… */ effectiveNightlyPrice?: number; }

// Room assignment
// GET  /api/admin/reservations/:id/assignments        -> { assignments: { room_slug: string }[] }
// GET  /api/admin/reservations/:id/free-rooms         -> { rooms: { slug: string; name: string }[] }
//        422 { error } when the reservation has null/invalid dates or depart <= arrive
// POST /api/admin/reservations/:id/assignments  { roomSlug } -> 201 { assignment } | 409 { error } | 422 { error }
// DELETE /api/admin/reservations/:id/assignments/:roomSlug   -> 200 { ok: true } | 404 { error }

// Invoice
// POST /api/admin/reservations/:id/invoice  { type: "deposit" | "full"; depositPercent?: number }
//   -> 200 { ok: true; breakdown: InvoiceBreakdown } | 422 { error }
interface InvoiceBreakdown {
  nights: number; roomCount: number; effectiveNightly: number;
  base: number; lodgingTax: number; accommodationTax: number;
  total: number; amount: number;   // amount = total, or total*depositPercent/100 for deposits
}

// invoice.create outbox payload (apps/hubspot):
//   { contactEmail: string; amount: number; description: string; currency?: "CAD" }

// Admin user profile
// GET  /api/admin/users/:id  -> { user: AdminUserDetail; hubspot: Record<string,unknown> | null }
// POST /api/admin/users/:id/pricing  { discountPercent?: number|null; fixedNightlyPrice?: number|null }
//   mutually exclusive; -> 200 { user } | 400 { error }

// contact.getById outbox/execute payload (apps/hubspot): { contactId: string }
```

## Implementation Steps

### Step 1 — `apps/api/migrations/0015_users_pricing.sql`
Create the file with the two `ADD COLUMN IF NOT EXISTS` statements above.

### Step 2 — `apps/api/migrations/0016_settings_taxes.sql`
Create the file seeding `tps`/`tvq`/`accommodation_tax` with `ON CONFLICT DO NOTHING`.

### Step 3 — `apps/api/migrations/0017_reservation_room_assignments.sql`
Create the join-table + index file above.

### Step 4 — `apps/api/src/settings.ts`
Add `tps`/`tvq`/`accommodation_tax` to `SETTINGS_DEFAULTS` and `PUBLIC_SETTING_KEYS`.
Extend `SettingsUpdateSchema` with `tps`, `tvq`, `accommodationTax`
(`z.coerce.number().min(0)`). Extend `AdminSettings` + `PublicSettings` interfaces.
Parse the three raw values with `parseFloat` in `rowsToAdminSettings`; carry them in
`toPublicSettings`. Leave `withPublicRoomCount` untouched.

### Step 5 — `apps/api/src/pricing.ts` (new, shared, unit-tested)
Pure helpers, no DB access:
- `resolveEffectiveNightly({ fixedNightlyPrice, discountPercent }, publicPrice): number`
  — `fixed_nightly_price` if non-null; else `publicPrice*(1-discount/100)` if
  `discount_percent` non-null; else `publicPrice`. Rounds to 2 decimals.
- `nightsBetween(arrive: string, depart: string): number` — date-only-safe diff of two
  `YYYY-MM-DD` strings (parse as local calendar dates), `>= 0`.
- `computeInvoice({ effectiveNightly, nights, roomCount, tps, tvq, accommodationTax,
  type, depositPercent }): InvoiceBreakdown` — `base = effectiveNightly*nights*roomCount`;
  `lodgingTax = base*(tps+tvq)/100`; `accommodationTax = base*accommodationTax/100`
  (no compounding); `total = base + lodgingTax + accommodationTax`;
  `amount = type === "deposit" ? total*depositPercent/100 : total`. All money rounded to
  2 decimals.

### Step 6 — `apps/api/src/assignments.ts` (new)
Zod `AssignRoomSchema { roomSlug: string.min(1) }`. Helper
`isRoomFreeForRange(sql, roomSlug, arrive, depart, excludeReservationId): Promise<boolean>`
using `res.arrive < $depart AND res.depart > $arrive`. Helper
`freeRoomsForRange(sql, arrive, depart, excludeReservationId)` returning
`{ slug, name }[]` via the `NOT EXISTS` overlap query. Helper
`reservationDatesValid(arrive, depart): boolean` (both non-null, valid `YYYY-MM-DD`,
`depart > arrive`).

### Step 7 — `apps/api/src/index.ts` — settings persistence
In `POST /api/admin/settings`, add three upserts for `tps`/`tvq`/`accommodation_tax`
alongside the existing two (`ON CONFLICT (key) DO UPDATE`). Both settings read
endpoints already `SELECT key, value FROM settings`, so no read change is needed.

### Step 8 — `apps/api/src/index.ts` — room assignment endpoints
Add admin-gated (reuse the inline auth/role guard pattern):
`GET /api/admin/reservations/:id/assignments`,
`GET /api/admin/reservations/:id/free-rooms` (422 French error when the reservation's
dates are ineligible), `POST /api/admin/reservations/:id/assignments` (422 ineligible;
409 `"Cette chambre est déjà réservée pour ces dates."` on overlap; enforce
`room_count` cap → 409 `"Nombre de chambres atteint pour cette réservation."`),
`DELETE /api/admin/reservations/:id/assignments/:roomSlug`.

### Step 9 — `apps/api/src/index.ts` — `GET /api/auth/me` effective price
After loading the session user, query `discount_percent, fixed_nightly_price` for the
user and `nightly_price` from settings, compute `effectiveNightlyPrice` via
`resolveEffectiveNightly`, and include it on the returned `user` object.

### Step 10 — `apps/api/src/index.ts` — invoice endpoint
`POST /api/admin/reservations/:id/invoice` (admin-gated). Load the reservation; if
`arrive`/`depart` are null/invalid or `room_count` is null → 422
`"Réservation incomplète : dates ou nombre de chambres manquants."`. Resolve the user
by `lower(reservations.email) = lower(users.email)`; compute their
`effectiveNightlyPrice` (fallback to public `nightly_price`). Read tax settings, run
`computeInvoice`, then enqueue `invoice.create` via
`c.env.HUBSPOT.fetch("http://hubspot/ops/enqueue", …)` with `dedupeKey`
`invoice-${id}-${type}` and a French `description`. Return `{ ok: true, breakdown }`.

### Step 11 — `apps/api/src/index.ts` — admin user detail endpoint
`GET /api/admin/users/:id` (admin-gated): return local fields (id, email, name, role,
first_name, last_name, phone, company, created_at, hubspot_contact_id,
discount_percent, fixed_nightly_price). When `hubspot_contact_id` is non-null, call
`/ops/execute` with `{ kind: "contact.getById", payload: { contactId } }` inside a
try/catch; on any failure or null id set `hubspot: null` (never block local fields).

### Step 12 — `apps/api/src/index.ts` — user pricing endpoint
`POST /api/admin/users/:id/pricing` (admin-gated). Zod body
`{ discountPercent: z.coerce.number().min(0).max(100).nullable().optional(),
fixedNightlyPrice: z.coerce.number().min(0).nullable().optional() }`; reject with 400
`"Un seul mode de tarification est permis."` when both are non-null. Persist: set the
provided field, `NULL` the other. Return the updated local user.

### Step 13 — `apps/hubspot/src/ops/invoice.ts` (new)
`InvoiceCreateSchema { contactEmail, amount: number, description: string,
currency: default "CAD" }`. `executeInvoiceCreate` — `resolveOrCreateContactByEmail`,
`POST /crm/v3/objects/invoices` with `properties { hs_currency: "CAD",
hs_invoice_amount/amount, description }`, then associate the invoice to the contact
(v4 association PUT, same pattern as `deal.ts`). Return `{ ok: true, hubspotId }`.
Errors propagate so the outbox lands the op in `failed` on portal rejection.

### Step 14 — `apps/hubspot/src/ops/contactGetById.ts` (new)
`ContactGetByIdSchema { contactId: z.string().min(1) }`. `executeContactGetById` —
`GET /crm/v3/objects/contacts/{id}?properties=email,firstname,lastname,phone,company`;
404 `NormalizedError` when not found; else `{ ok: true, hubspotId: id, data: properties }`.

### Step 15 — `apps/hubspot/src/ops/registry.ts`
Add `"invoice.create"` and `"contact.getById"` to the `OpEnvelope` kind union, the
`EnvelopeSchema` enum, and the `registry` map (wiring the two new executors + schemas).

### Step 16 — `apps/web/src/lib/api.ts` — types + clients
Replace `ReservationRow` with the corrected shape (Step's API Types). Add
`effectiveNightlyPrice?` to `User`. Add `tps`/`tvq`/`accommodationTax` to
`PublicSettings` and `AdminSettings`. Add client fns: `adminReservationAssignments`,
`adminFreeRooms`, `adminAssignRoom`, `adminUnassignRoom`, `adminCreateInvoice`,
`adminGetUser`, `adminSetUserPricing` (all path-safe, mirroring existing helpers).

### Step 17 — `apps/web/src/lib/settings.svelte.ts` + `content.ts`
Add `tps`/`tvq`/`accommodationTax` to `DEFAULTS` and to `mergeSettings`. Add the same
three defaults to `content.ts` `DEFAULTS` for offline fallback.

### Step 18 — `apps/web/src/routes/admin/+page.svelte` — reservations table
Add a date-only-safe `formatDateOnly(d: string | null)` (regex-parse `YYYY-MM-DD` →
local `new Date(y, m-1, d)` → `Intl.DateTimeFormat("fr-CA")`; `—` for null/invalid).
Change the row cells to `row.arrive`/`row.depart` via `formatDateOnly`, and
`row.people`. Add an "Actions" column with an assign-rooms control (opens a panel
listing free rooms + current assignments, calling the assignment clients) and a
"Facture" button group (deposit/full → `adminCreateInvoice`). Reuse existing table +
`max-width:640px` responsive patterns.

### Step 19 — `apps/web/src/routes/admin/+page.svelte` — tax settings inputs
In the Paramètres panel add three numeric inputs (TPS %, TVQ %, Taxe d'hébergement %)
bound to `settings.tps/tvq/accommodationTax`, with non-negative client validation
(reject `< 0`; allow `0` and decimals). Extend `saveSettings` validation + payload.

### Step 20 — `apps/web/src/routes/profil/+page.svelte`
Update the reservation table to the corrected fields (`arrive`/`depart`/`people`) with
the same date-only-safe formatter and `—` fallback.

### Step 21 — `apps/web/src/lib/components/RoomCard.svelte` + le-site price display
Compute the shown price as `auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice`
(import the `auth` store). Apply the same precedence anywhere `settings.nightlyPrice`
is rendered as a guest-facing price (`le-site/+page.svelte`).

### Step 22 — `apps/web/src/routes/admin/utilisateurs/[id]/+page.svelte` + `+page.ts` (new)
`+page.ts`: `export const ssr = false; export const prerender = false;`. Page: onMount
admin-gate (`getMe`), call `adminGetUser(id)`, render local fields, the live HubSpot
block or `"Aucune donnée HubSpot"` fallback, an editable mutually-exclusive pricing
form (`adminSetUserPricing`), and a back link to the Utilisateurs tab (`/admin`). Reuse
admin page styles + `max-width:640px` responsive rules.

### Step 23 — `apps/web/src/lib/components/admin/AdminUtilisateursTab.svelte`
Make each user's email a link to `/admin/utilisateurs/{id}` (anchor or `goto`), keeping
the existing role/reset-link actions intact.

### Step 24 — Tests
- `apps/web/src/routes/__tests__/page-admin.test.ts` (or a new admin-reservations
  test): a populated-date row renders the localized fr-CA date (the exact stored day,
  no off-by-one), and a null-date row renders `—`. Fails if the field-name mismatch
  returns.
- `apps/api/test/pricing.test.ts` (new): `resolveEffectiveNightly` precedence
  (fixed > discount > public); `nightsBetween` date-only correctness; `computeInvoice`
  base/lodging/accommodation/total + deposit default 30 %, no compounding.
- `apps/api/test/settings.test.ts`: `SettingsUpdateSchema` accepts `tps/tvq/
  accommodationTax` incl. `0` and `9.975`, rejects negatives; `rowsToAdminSettings`
  parses the tax rows.
- `apps/hubspot/test/ops.test.ts`: registry parses `invoice.create` +
  `contact.getById` envelopes.

## Acceptance Criteria

1. `GET /api/settings` and `GET /api/admin/settings` include numeric `tps`, `tvq`,
   `accommodationTax`; `POST /api/admin/settings` with `{tps:0, tvq:9.975,
   accommodationTax:3.5, nightlyPrice:89, contactEmail:"a@b.ca"}` returns 200 with those
   values persisted, and a negative tax returns 400.
2. The admin reservations table renders a populated `arrive` date as its exact stored
   calendar day formatted `fr-CA` (no day-shift) and renders `—` for a null date; the
   regression test fails if the row type reverts to `check_in`/`check_out`/`guests`.
3. `POST /api/admin/reservations/:id/assignments {roomSlug}` succeeds (201) for a free
   room and returns 409 when that `room_slug` is already assigned to another reservation
   whose `[arrive, depart)` overlaps; `GET …/free-rooms` omits overlapping rooms; a
   reservation with null dates or `depart <= arrive` returns 422 with a French message.
4. `POST /api/admin/reservations/:id/invoice {type:"deposit"}` on a reservation with
   `arrive=2026-08-01`, `depart=2026-08-03`, `room_count=2`, effective nightly `89`,
   `tps=5`, `tvq=9.975`, `accommodation_tax=3.5` returns
   `base = 89*2*2 = 356`, `lodgingTax = 356*0.14975 = 53.31`,
   `accommodationTax = 356*0.035 = 12.46`, `total = 421.77`, `amount = 126.53`
   (30 % of total), and enqueues an `invoice.create` outbox row; missing dates or null
   `room_count` returns 422.
5. `GET /api/admin/users/:id` returns the local user fields plus a `hubspot` object when
   `hubspot_contact_id` resolves, and `hubspot: null` (never a 5xx) when the id is null
   or the `/ops/execute` fetch fails; the profile route shows `"Aucune donnée HubSpot"`
   in that case and a working back link.
6. A user with `fixed_nightly_price=70` (or `discount_percent=10`) has
   `effectiveNightlyPrice` of `70` (resp. `80.10`) on `GET /api/auth/me`; the RoomCard
   and le-site price show that value while logged in; that same effective price drives
   their invoice amount. Setting both pricing fields via
   `POST /api/admin/users/:id/pricing` returns 400.
7. `apps/hubspot` registry accepts `invoice.create` and `contact.getById` envelopes; an
   `invoice.create` op whose HubSpot call is rejected lands in the outbox `failed`
   state (requeuable via the existing path).
8. All new admin UI is usable at ≤640px (inputs full-width, tables horizontally
   scrollable); `npm run typecheck` passes; no `.svelte-kit/` or
   `.codegraph/codegraph.db` is staged or committed.
