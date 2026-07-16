# SDD — Admin taxes, invoices & per-user pricing

## System Overview

Three independently-deployed Cloudflare Workers, unchanged in topology:

- **`apps/web`** — Svelte 5 SPA (adapter-cloudflare). Talks to the API only over
  same-origin `/api/*` with `credentials: "include"`. Adds one dynamic client-only
  route (`/admin/utilisateurs/[id]`) and edits to the admin dashboard, profil page,
  RoomCard, le-site, the users tab, the api client, and the settings/content stores.
- **`apps/api`** — Hono Worker on Neon Postgres (HTTP driver via `DB_CONN`). Gains
  three migrations, a shared pricing helper, an assignments helper, extended settings,
  and new admin endpoints (assignments, invoice, user detail, user pricing, effective
  price on `/auth/me`). Reaches the HubSpot gateway through the existing internal
  `HUBSPOT` service binding.
- **`apps/hubspot`** — Hono gateway Worker fronting the HubSpot CRM. Gains two ops
  (`invoice.create` for the outbox, `contact.getById` for synchronous reads) registered
  in the op registry. No new routes — `/ops/enqueue` and `/ops/execute` already exist.

The HTTP boundary is the contract: `apps/api` never imports `apps/hubspot`; it calls the
binding with the same JSON envelope shape (`{ kind, payload, dedupeKey? }`) used today.

## Architecture Decisions

- **AD-1 — Change 1 is a contract fix, not a date bug.** The API already returns
  `arrive`/`depart` (`to_char(...,'YYYY-MM-DD')`, `null` for legacy rows) and `people`.
  We correct the frontend `ReservationRow` type and the two tables that read it (admin,
  profil). `YYYY-MM-DD` fed to `new Date()` parses as UTC midnight and can display the
  previous day in `fr-CA`; a regex-parsed **local** `new Date(y, m-1, d)` avoids the
  shift. Null dates render `—`.
- **AD-2 — Assignment keyed by `room_slug`.** No numeric room id exists; `rooms.slug` is
  the stable key. Overlap uses the half-open rule `res.arrive < $depart AND res.depart >
  $arrive`, evaluated in SQL so the DB is the single source of truth (avoids read-modify
  races). A `UNIQUE(reservation_id, room_slug)` guards duplicate assignment on one
  reservation; the `room_count` cap is enforced in the handler.
- **AD-3 — Tax percents stored raw as TEXT.** The `settings` table is `TEXT` key/value;
  `9.975` round-trips losslessly as a string parsed with `parseFloat`. Taxes are
  non-negative decimals (0 allowed), so their zod rule is `.min(0)` — distinct from
  `nightly_price`'s `.int().positive()`.
- **AD-4 — Money math in one pure, unit-tested module (`pricing.ts`).** No compounding:
  `total = base + base·(tps+tvq)/100 + base·accommodation/100`. Deposit = `total ·
  depositPercent/100`, default `depositPercent = 30`. Rounding to 2 decimals happens in
  the helper so the endpoint and tests agree byte-for-byte.
- **AD-5 — Effective price precedence `fixed > discount > public`,** computed
  server-side in `resolveEffectiveNightly` and reused by both `/auth/me` and the invoice
  endpoint. The two pricing columns are mutually exclusive, enforced by the API
  validator and the admin UI (not a DB CHECK, to keep the migration trivially
  idempotent).
- **AD-6 — Invoice user resolution by email.** Reservations are not FK-linked to users;
  resolve `lower(reservations.email) = lower(users.email)`, fall back to public
  `nightly_price` when unmatched.
- **AD-7 — Two HubSpot paths, reused.** `contact.getById` runs **synchronously** via
  `/ops/execute` (a read the admin waits on); `invoice.create` is **enqueued** via
  `/ops/enqueue` so portal-side rejections (missing scopes/properties — explicitly out
  of scope) land in the outbox `failed` state and are requeuable later.
- **AD-8 — New profile route is client-only.** `ssr = false; prerender = false;` — it
  reads a session cookie and admin-only data that must never be prerendered, matching
  the existing `/profil` pattern under adapter-cloudflare's SPA fallback.

## Component Responsibilities

| Component | Responsibility |
|---|---|
| `migrations/0015–0017` | users pricing cols; tax setting seeds; assignments table + index |
| `api/src/settings.ts` | tax keys in defaults/public-keys; extended schema + shapes; parse |
| `api/src/pricing.ts` | pure `resolveEffectiveNightly`, `nightsBetween`, `computeInvoice` |
| `api/src/assignments.ts` | overlap check, free-rooms query, date-eligibility guard |
| `api/src/index.ts` | new endpoints; settings upserts; `/auth/me` effective price |
| `hubspot/src/ops/invoice.ts` | create HubSpot invoice (CAD) + contact association |
| `hubspot/src/ops/contactGetById.ts` | fetch a contact by id |
| `hubspot/src/ops/registry.ts` | register both new ops (union, enum, map) |
| `web/src/lib/api.ts` | corrected `ReservationRow`, extended shapes, new clients |
| `web/src/lib/settings.svelte.ts`, `content.ts` | tax defaults + merge |
| `web/routes/admin/+page.svelte` | fixed dates, assignment UI, invoice button, tax inputs |
| `web/routes/admin/utilisateurs/[id]/*` | user profile view + pricing editor |
| `web/routes/profil/+page.svelte` | corrected reservation fields |
| `web/lib/components/RoomCard.svelte`, `routes/le-site` | effective-price display |
| `web/lib/components/admin/AdminUtilisateursTab.svelte` | link rows to profile |

## Data Flow

**Fix dates:** admin/profil table → `formatDateOnly(row.arrive)` → local-parsed
`Intl.DateTimeFormat("fr-CA")` → cell (or `—`).

**Assign room:** admin panel → `POST …/assignments {roomSlug}` → handler loads
reservation dates → `reservationDatesValid` (422 if not) → `isRoomFreeForRange` SQL
(409 if overlap) → `room_count` cap check (409) → `INSERT … RETURNING` → UI refresh.

**Free rooms:** admin panel opens → `GET …/free-rooms` → eligibility guard (422) →
`SELECT rooms … WHERE NOT EXISTS (overlapping assignment)` → list.

**Invoice:** admin clicks Facture → `POST …/invoice {type, depositPercent?}` → load
reservation (422 on missing dates/room_count) → resolve user email → effective price →
read tax settings → `computeInvoice` → enqueue `invoice.create` via `HUBSPOT` binding →
`{ ok, breakdown }`. Scheduled outbox worker later delivers or fails the op.

**Effective price:** login/session → `GET /api/auth/me` → query pricing cols + settings
`nightly_price` → `resolveEffectiveNightly` → `user.effectiveNightlyPrice` → `loadAuth`
→ `auth.user` → RoomCard/le-site derive the shown price.

**User profile:** route mount → admin-gate `getMe` → `GET /api/admin/users/:id` →
local fields always; if `hubspot_contact_id` → `/ops/execute contact.getById` (try/catch
→ `hubspot: null` on failure) → render, fallback `"Aucune donnée HubSpot"`.

## Error Handling & Recovery

- **Auth/role:** every new admin endpoint reuses the inline `getAuthUser` → 401/403
  guard; body validation runs after auth so unauthenticated callers never see schema
  detail.
- **Validation:** zod hooks return `400 { error }` with the first issue message
  (French where user-facing). Ineligible reservations → `422 { error }` (French).
  Overlap / room-count cap → `409 { error }` (French). Both-pricing-fields → `400`.
- **HubSpot read (`contact.getById`):** wrapped in try/catch; any throw/non-2xx →
  `hubspot: null`. Local fields are fetched first and returned regardless.
- **HubSpot write (`invoice.create`):** enqueued fire-and-forgettably; the endpoint
  returns success on enqueue. The gateway's outbox classifies 4xx as permanent →
  `failed` (requeuable), 429/5xx as transient → exponential backoff. Enqueue failures in
  the API are swallowed like the existing reservation-enqueue path (never block the
  admin response) but logged.
- **Migrations:** idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`); safe to re-run;
  applied in numeric order by `scripts/migrate.mjs`.

## Performance & Scalability

Admin-only, low-QPS surface. Overlap and free-room queries are single indexed SQL
statements (`idx_rra_room_slug`, PK on reservations/rooms); the assignment set per
reservation is tiny. `/auth/me` adds one indexed lookup + one small settings scan per
call — negligible. `pricing.ts` is pure arithmetic. HubSpot invoice creation is async via
the outbox, so it never sits in the request path. No new caching needed; the SPA already
caches public settings in the reactive store.

## Security Analysis

- **AuthZ:** all `/api/admin/*` additions are admin-gated identically to existing admin
  routes; the profile route also client-gates but the server is authoritative.
- **Injection:** all SQL uses the neon tagged-template parameterization; `:id`/`:roomSlug`
  path params are numeric-validated / `encodeURIComponent`-encoded client-side and bound
  server-side. Overlap query interpolates only bound values.
- **Data exposure:** `GET /api/admin/users/:id` returns PII (email/phone/company/HubSpot)
  only to admins. Public `/api/settings` exposes taxes intentionally (needed later for
  quotes) but never pricing columns or `assignable`/`marketing` counts.
- **Secrets:** no new secrets; `DB_CONN` stays a Worker var; the HubSpot token lives only
  in the gateway Worker. The frontend gains no secrets.
- **Abuse:** invoice creation is admin-only and idempotent by `dedupeKey`
  (`invoice-{id}-{type}`), preventing duplicate HubSpot invoices on double-click/retry.

## Deployment Model

1. `npm run db:migrate` (applies `0015`→`0017` against `DB_CONN`) **before** deploying
   the API, so the new columns/table exist.
2. `npm run deploy:api` — new endpoints + effective price. Deploy **before** web so the
   corrected reservation contract and effective price are served when the new SPA loads.
3. `npm run deploy:web` — corrected tables, assignment/invoice UI, tax inputs, profile
   route.
4. HubSpot portal setup (invoice scopes/properties) is **deferred**; until done,
   `invoice.create` ops land in the outbox `failed` state and are requeuable via the
   existing `/api/admin/outbox/:id/requeue` path.

## Known Constraints

- Legacy reservations with null dates remain unassignable and un-invoiceable **by
  design** (422); a later backfill may populate them.
- Public guest prices stay tax-exclusive; taxes surface only in admin invoice math.
- The vestigial `marketing_room_count` / `assignable_room_count` settings and the
  frontend's residual `marketingRoomCount`/`assignableRoomCount` fields are **not**
  resurrected or removed by this change (out of scope) — new code neither depends on nor
  deletes them.
- `apps/api` and `apps/hubspot` share no code; the two new op kinds must be kept in sync
  by string contract only.
