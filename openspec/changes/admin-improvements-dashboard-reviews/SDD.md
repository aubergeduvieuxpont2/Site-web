# System Design — Admin & Product Improvements

## System Overview

Site-web is a service-based Cloudflare monorepo. This change touches two
independently deployable services and their shared HTTP contract:

- **`apps/api`** (Hono Worker on Neon Postgres) — new admin dashboard endpoint,
  blackout-range endpoints, review lifecycle endpoints (public + admin),
  reservation-code generation on the two insert sites, a cron review-request
  pass, a new settings toggle, and four idempotent migrations (0037–0040).
- **`apps/web`** (Svelte 5 SPA) — admin tab-nav CSS fix, a shared `Modal.svelte`,
  a reorganized Paramètres tab, a compact reservations table + detail modal, a
  new Aperçu dashboard tab (new default), blackout-range pickers/grouping, an
  Avis moderation tab, a public `/avis/nouveau` submission page, a public
  `/avis` page, a homepage reviews strip, and a footer link.

The `apps/email-ingest` OTA insert path is read for reservation-code parity but
the code is generated in `apps/api` (the OTA insert lives in `apps/api/src/index.ts`).
The HubSpot service and the admin outbox tab are **out of scope**.

Delivery is single-branch, work ordered WS-A → WS-B → WS-C → WS-D with
per-stream commits. WS-A owns the `email_review_request_enabled` migration +
`settings.ts` wiring so the Paramètres card is self-contained (Key Decision 2a);
WS-D consumes the already-present toggle.

## Architecture Decisions

1. **Toggle coupling resolved in WS-A (option a).** The
   `email_review_request_enabled` seed migration (0037) and `settings.ts` schema
   wiring ship in WS-A, decoupling the Paramètres card from WS-D. WS-D only
   *reads* the toggle when the cron enqueues.
2. **Blackout ranges stay one-row-per-day.** Availability math
   (`availability.ts`) is untouched; the range endpoints are pure expansion
   (`generate_series` upsert) and range delete (`BETWEEN`). Grouping into range
   rows is display-only, computed client-side, so no schema or availability risk.
3. **Reservation code generated two ways.** Existing rows are backfilled
   SQL-side inside migration 0038 using only built-in `md5()` (no pgcrypto),
   correlated per row for uniqueness, then a unique index enforces it. New rows
   get a JS-generated `crypto.getRandomValues` Crockford code with
   retry-on-unique-violation, keeping the OTA `ON CONFLICT (source, external_ref)`
   dedupe intact.
4. **Masking + snapshots computed server-side at submission.** `display_name`
   ("Marie T.") and `stays_count`/`nights_total` are frozen into the `reviews`
   row at insert; the public endpoint never joins back to `reservations`
   identity, so raw guest data is never exposed.
5. **Shared Modal extraction before consumers.** `Modal.svelte` is extracted and
   `RoomAssignmentDrawer` refactored onto it *before* the reservation detail
   modal is built (both consume it), reducing duplicated focus-trap logic.
6. **No new dependencies.** Crockford base32 is hand-built on
   `crypto.getRandomValues`; no base32/nanoid library is added. Dashboard SQL is
   plain aggregates; no caching (admin-only, low traffic).
7. **Reuse the existing rate limiter and auth pattern.** New admin endpoints use
   the inline `getAuthUser` + `role==='admin'` check; public review endpoints
   reuse `rateLimitAllow('general:${ip}', 30, 15min)` keyed on `cf-connecting-ip`.
8. **Cron composes, not replaces.** The `scheduled` handler runs the new
   review-request enqueue pass alongside `drainEmailOutbox`, both under
   `ctx.waitUntil`; the dual export shape (`{fetch, scheduled}` + `export {app}`)
   is preserved for tests.

## Component Responsibilities

### Backend (`apps/api/src`)
- `settings.ts` — add `email_review_request_enabled` default + schema key.
- `dashboard.ts` (new) — `computeDashboard(sql, env)` aggregate queries.
- `reservationCode.ts` (new) — Crockford generator + insert-with-retry helper.
- `reviews.ts` (new) — masking, stay-snapshot, eligibility, list queries.
- `reviewRequests.ts` (new) — cron enqueue pass (dedupe via `review_requests` PK).
- `emailOutbox.ts` — map `review-request` → `email_review_request_enabled`.
- `index.ts` — new routes (dashboard, blackout ranges, reviews public+admin),
  `code` on both reservation inserts, review pass in `scheduled`.
- `migrations/0037–0040` — toggle seed, reservation code, reviews, review_requests.

### Frontend (`apps/web/src`)
- `lib/components/Modal.svelte` (new) — portal/backdrop/focus-trap/Escape dialog.
- `lib/components/admin/AdminParametresTab.svelte` (new) — grouped settings cards.
- `lib/components/admin/AdminApercuTab.svelte` (new) — dashboard stat cards + strip.
- `lib/components/admin/AdminAvisTab.svelte` (new) — review moderation.
- `lib/components/admin/ReservationDetailModal.svelte` (new) — detail + Facture + Chambres.
- `lib/components/admin/ReservationTableRow.svelte` — compact columns, row-open.
- `lib/components/admin/RoomAssignmentDrawer.svelte` — refactor onto Modal.
- `lib/components/admin/AdminDisponibilitesTab.svelte` — range pickers + grouping.
- `lib/components/ReviewsStrip.svelte` (new) — homepage strip.
- `lib/components/Footer.svelte` — `/avis` link.
- `routes/admin/+page.svelte` — tab CSS fix, Aperçu default, Avis tab, wire tabs.
- `routes/avis/nouveau/+page.svelte` (new) — public submission.
- `routes/avis/+page.svelte` (new) — public approved list.
- `routes/+page.svelte` — render ReviewsStrip.
- `lib/api.ts` — new client fns + `AdminSettings.emailReviewRequestEnabled`.

## Data Flow

- **Dashboard:** admin loads Aperçu → `adminDashboard()` → `GET /api/admin/dashboard`
  → auth check → `computeDashboard` (week/occupancy aggregates + `availabilityForRange`)
  → JSON → stat cards + 7-day strip.
- **Blackout range:** admin submits start/end/rooms/note →
  `adminCreateBlackoutRange` → `POST …/blackouts/range` → validate + `generate_series`
  upsert → `{count}` → list reloads → client groups consecutive identical days.
- **Reservation code:** website/OTA booking → `insertWithCode` generates
  `AVP-XXXXXX`, inserts (retry on unique collision) → row persisted with code;
  migration 0038 pre-backfills all legacy rows.
- **Review request (cron):** `scheduled` → `enqueueReviewRequests` selects eligible
  departed reservations → insert `review_requests` → `enqueueEmail('review-request')`
  gated by `email_review_request_enabled` → outbox drained by same cron via Resend →
  email links `${SITE_ORIGIN}/avis/nouveau?code=<code>`.
- **Review submission:** guest opens `/avis/nouveau?code=` → `reviewEligibility` →
  star/textarea → `submitReview` → `POST /api/reviews` → recheck eligibility, mask
  name, snapshot stays/nights, insert `pending` (409 on repeat) → thanks screen.
- **Moderation:** admin Avis tab → `adminReviews(status)` → list + pendingCount →
  Approuver/Rejeter → `PATCH /api/admin/reviews/:id` → status + `moderated_at`.
- **Public display:** homepage/`/avis` → `getPublicReviews` → `GET /api/reviews`
  (approved only, masked) → strip (≤3, hidden when empty) / full list + average.

## Known Constraints

- **Migrations** must be idempotent and numbered strictly from 0037; each schema
  change in its own file; run before merge/deploy (house rule).
- **Backfill uniqueness:** 0038 must generate per-row-distinct codes before the
  unique index is created; the index creation is the safety net.
- **OTA dedupe preserved:** adding `code` must not break
  `ON CONFLICT (source, external_ref) DO NOTHING`.
- **No enumeration leak:** public review endpoints return generic responses for
  invalid codes and are rate-limited on `cf-connecting-ip`.
- **Export shape:** `index.ts` must keep `export default { fetch, scheduled }`
  and `export { app }`; tests drive routes via `app.request(url, init, env)`.
- **Responsiveness:** every touched screen must work at 375px (hard rule).
- **Scope fences:** do not touch the HubSpot service or the admin outbox tab;
  keep single-day blackout endpoints; French UI copy in existing admin style.
- **No SMS:** `review_requests.channel` is reserved but only `'email'` is used.
