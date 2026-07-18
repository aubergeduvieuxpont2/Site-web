# System Design — Admin & Product Improvements (Tasks 2–6)

## System Overview

Site-web is a service-based monorepo deployed on Cloudflare:

- `apps/web` — Svelte 5 + Vite SPA (Tailwind v4), served by a static-assets Worker.
  Talks to the API over HTTP (`/api/*`). Admin UI lives under
  `src/routes/admin/+page.svelte` (a ~1900-line tab-shell monolith) with extracted tab
  components under `src/lib/components/admin/`.
- `apps/api` — Hono Worker backed by Neon Postgres (`@neondatabase/serverless` over HTTP;
  connection string is `c.env.DB_CONN`, no binding block). Exposes the HTTP API and a
  `scheduled` cron handler that drains `email_outbox` via Resend.
- `apps/email-ingest` — Email Worker that parses OTA (Airbnb/Expedia) confirmations and
  inserts reservations through the shared insert path.

This change is a **continuation** of an in-flight batch. Task 1 (shared modal + compact
reservations table) is already merged and green. Tasks 2–6 exist largely as **unverified
draft code** from salvage commit `e04b520`; the remaining work is *audit → fix → verify*
plus net-new Task 2 (Paramètres extraction, tab-nav CSS) and the missing admin-tab wiring
for the Aperçu and Avis tabs. The HTTP boundary is the contract; the two services deploy
independently.

## Architecture Decisions

1. **Audit-and-fix, not rewrite.** The salvaged drafts and migrations are largely
   coherent. Treat existing code as the baseline and fix to spec, to avoid regressing
   already-wired integrations. Regenerate a file only when it is fundamentally wrong.
2. **Schema is the source of truth for settings; fixtures follow.** `SettingsUpdateSchema`
   already encodes the full expanded field set (five email toggles, positive-int prices,
   required `contactPhone`, non-negative taxes, `emailReviewRequestEnabled`). The 11 API
   `settings.test.ts` failures are stale fixtures missing required fields — fix the
   fixtures, never weaken the schema.
3. **Blackout ranges are a UI/endpoint convenience over unchanged per-day storage.** The
   `blackout_dates` table (one row per day) and the availability math in `availability.ts`
   stay untouched. The range endpoints expand `[startDate, endDate]` into per-day
   `INSERT … ON CONFLICT (date) DO UPDATE` upserts in one batched statement; range grouping
   in the UI is display-only, computed client-side.
4. **Reservation code is a human-facing key added non-destructively.** `AVP-` + 6-char
   Crockford base32 (alphabet excludes ambiguous `0 1 I O`). Existing rows are backfilled
   SQL-side inside the migration *before* the unique index is enforced; new rows get a code
   from `crypto.getRandomValues` with retry-on-collision at **both** insert sites (website
   booking + OTA ingest). The code keys the entire review flow.
5. **Reviews are moderated and masked server-side.** Guest identity is never exposed
   publicly: `display_name` is masked ("Marie T.", fallback first word of `name`) at
   submission, and `stays_count`/`nights_total` are snapshotted at submission from confirmed
   departed stays. Public `GET /api/reviews` returns approved rows only. One review per
   reservation via `UNIQUE(reservation_id)` → `409` on repeat.
6. **Email-only review requests, cron-driven, toggle-gated.** The existing `review-request`
   Resend template is enqueued by a new pass in the `scheduled` handler that runs **before**
   `drainEmailOutbox`, gated by `email_review_request_enabled` (default false) and deduped
   by the `review_requests` PK. A `channel` column reserves future SMS.
7. **New tabs are wired into the existing monolith, not a router change.** Aperçu and Avis
   are added to the `activeTab` union and the tablist in `admin/+page.svelte`; Aperçu
   becomes the default landing tab. No new admin middleware — endpoints reuse the inline
   `getAuthUser` + `role === 'admin'` pattern; public endpoints reuse `rateLimitAllow`.

## Component Responsibilities

**Frontend (`apps/web`)**
- `routes/admin/+page.svelte` — tab shell: owns `activeTab` (default `"apercu"`), the
  tablist (order Aperçu · Réservations · … · Disponibilités · Avis · …), the tab-nav CSS
  fix, and the render blocks that mount each tab component.
- `components/admin/AdminParametresTab.svelte` (net-new) — grouped settings cards, one
  sticky save, separate password button; surfaces `emailReviewRequestEnabled`.
- `components/admin/AdminApercuTab.svelte` (wire) — stat cards + 7-day availability strip;
  renders "—" for null occupancy ratios.
- `components/admin/AdminDisponibilitesTab.svelte` (fix) — range pickers, grouped range
  rows, range delete; resolves the a11y + `state_referenced_locally` warnings.
- `components/admin/AdminAvisTab.svelte` (wire) — status-filtered moderation list,
  Approuver/Rejeter, pending-count badge.
- `components/ReviewsStrip.svelte` + `routes/+page.svelte` — homepage strip (≤3 approved,
  hidden when empty).
- `routes/avis/+page.svelte`, `routes/avis/nouveau/+page.svelte` — public review list +
  submission flow (no login).
- `components/Footer.svelte` — `/avis` link.
- `lib/api.ts` — typed client fns: `adminDashboard`, `adminUpsertBlackoutRange`,
  `adminDeleteBlackoutRange`, `reviewEligibility`, `submitReview`, `publicReviews`,
  `adminReviews`, `adminModerateReview`; `AdminSettings.emailReviewRequestEnabled`;
  optional `ReservationRow.code`.

**Backend (`apps/api`)**
- `src/settings.ts` — `SettingsUpdateSchema` + `AdminSettings` (already includes the new
  toggle). Owns the correctness that fixtures must match.
- `src/dashboard.ts` — aggregate SQL for the dashboard payload; null-safe occupancy.
- `src/reservationCode.ts` — code generation + collision retry.
- `src/reviews.ts` — masking, snapshot math, eligibility, list queries.
- `src/reviewRequests.ts` / `src/emailOutbox.ts` — cron review-request pass;
  `EMAIL_TOGGLE_KEYS["review-request"] = "email_review_request_enabled"`.
- `src/index.ts` — route wiring: blackout-range endpoints, dashboard endpoint, review
  endpoints (public + admin), code generation at the website insert site, and the
  `scheduled` review-request pass ordered before `drainEmailOutbox`. Preserves the dual
  export.
- `migrations/0037–0040` — idempotent schema for the toggle, code, reviews, review_requests.

## Data Flow

- **Settings save:** Paramètres cards → `adminUpdateSettings(AdminSettings)` →
  `POST /api/admin/settings` (validated by `SettingsUpdateSchema`) → `settings` upserts →
  GET reflects persisted toggle values. Password change is a separate call.
- **Blackout range:** form pickers → `adminUpsertBlackoutRange` → `POST …/blackouts/range`
  → validate span → batched per-day upsert into `blackout_dates` → list reload → client-
  side grouping into range rows → range delete → `DELETE …/blackouts/range` → per-day
  delete. `availability.ts` reads the same per-day rows unchanged.
- **Dashboard:** Aperçu mount → `adminDashboard()` → `GET /api/admin/dashboard`
  (admin-gated) → `computeDashboard` runs week-overlap sums, `availabilityForRange` for the
  next 7 days, occupancy ratios (null when denominator 0), returning-customer count → stat
  cards + strip; null ratios render "—".
- **Review request (cron):** `scheduled` → review-request pass (confirmed, departed ≤3d,
  has email, no request, no review) → insert `review_requests` + `enqueueEmail
  ('review-request')` gated by toggle → `drainEmailOutbox` → Resend sends link
  `${SITE_ORIGIN}/avis/nouveau?code=<code>`.
- **Review submission (public):** `/avis/nouveau?code` → `GET /api/reviews/eligibility`
  (rate-limited, generic on invalid) → star + textarea → `POST /api/reviews` → mask name,
  snapshot stays/nights, insert `pending` (409 on repeat) → thanks screen.
- **Moderation + display:** admin Avis tab → `GET /api/admin/reviews?status=pending` +
  `PATCH /api/admin/reviews/:id` → approved rows surface via `GET /api/reviews` on the
  homepage strip and `/avis`.

## Known Constraints

- **Migrations must be idempotent** (`CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT
  EXISTS`), one schema change per numbered file; numbers `0037–0040` are already claimed —
  audit, do not renumber. The runner applies every file in order on each run.
- **No `DB_CONN` binding block** — the Neon connection string is a `c.env` var/secret; code
  and tests use the existing recorder-based Neon stub.
- **Responsive at 375px is a hard rule** for every touched screen (Paramètres cards,
  Aperçu, Avis, `/avis`, `/avis/nouveau`). French UI copy matching existing admin style.
- **Do not regress Task-1 suites** (Modal, ReservationTableRow, ReservationDetailModal,
  RoomAssignmentDrawer, page-admin) and do not touch the HubSpot outbox ("File HubSpot")
  tab.
- **Preserve `apps/api/src/index.ts` exports:** `export default { fetch, scheduled }` and
  `export { app }` (used by tests).
- Admin endpoints use inline `getAuthUser` + `role === 'admin'` (no new middleware); public
  endpoints use `rateLimitAllow`.
- Reviews are email-only (schema reserves `channel` for future SMS); no review replies,
  editing, or guest-side deletion; no occupancy charts beyond the three ratios.
- **Deployment:** the two Workers deploy independently (`deploy:api`, `deploy:web`); run
  `npm run db:migrate` against `DB_CONN` before deploy (0037–0040 add columns/tables and
  backfill codes). Enable the review-request toggle in production only when ready.
