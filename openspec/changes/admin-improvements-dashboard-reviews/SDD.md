# System Design — Admin & Product Improvements (Tasks 2–6): closing the false green

## System Overview

Site-web is a service-based monorepo on Cloudflare: `apps/web` (Svelte 5 SPA) calls
`apps/api` (Hono Worker) over `/api/*`; the API reads Neon Postgres via the HTTP
`@neondatabase/serverless` driver (`DB_CONN` on `c.env`, no binding block). A cron
trigger drains `email_outbox` via Resend and, for this batch, first enqueues
review-request emails.

This change is **not** a feature build — the reviews and dashboard features are
already implemented and wired at HEAD (`79a1762`). It is a **verification and
hardening** change whose purpose is to make the passing test suite *mean* the
feature works, by adding the app-level route coverage the batch is missing, plus
small client-layer conformance. The scope was set by direct inspection of HEAD,
not by the incoming brief's route-count heuristic (see Architecture Decisions).

## Architecture Decisions

**AD-1 — Trust the running app over the route-count heuristic.** The brief inferred
"4 deleted, 2 never-wired endpoints" from `index.ts` route count 50→44. An
`app.request` probe against the exported `{ app }` shows all six review/dashboard
routes resolve (401/500, never 404); the control path returns 404. The drop is an
artifact of moving inline handlers into sub-router modules (`createReviewsRouter`,
`createDashboardRouter`) mounted with `app.route("/", …)`. Design proceeds from the
verified state: the routes exist and execute.

**AD-2 — Keep the sub-router mounting; do not convert to inline.** The task text
prefers inline handlers, but `createEmailsRouter` uses the identical
`app.route("/", …)` mount and is an accepted, tested part of the app. The
review/dashboard routers are already covered by module unit tests
(`reviews.test.ts`, `dashboard.test.ts`). Rewriting working, tested code into
inline form is churn with only downside — it is precisely the kind of large,
untested edit that let the previous team's regression through the gate. We keep the
routers and instead add the missing *contract* coverage.

**AD-3 — The real defect is a test-topology gap, not a wiring gap.** Because
`reviews.test.ts` drives `createReviewsRouter` directly and `dashboard.test.ts`
drives `getDashboardData` directly, no test would fail if the `app.route` mount
lines were deleted or broke. The fix is app-level integration tests that import the
real `app` and assert each route is reachable and correctly gated — the guard that
turns "suite green" into "feature reachable".

**AD-4 — Reuse the established integration-test harness.** `blackoutsRange.test.ts`
already integration-tests the range endpoints against `{ app }` using a `vi.hoisted`
`neon` mock with per-test SQL stubs (`makeAdminSql`/`makeGuestSql`/`makeAnonSql`).
The new tests copy this harness verbatim, so they are consistent, hermetic (no real
DB), and low-risk.

**AD-5 — Client-fn conformance is cosmetic and additive.** Adding
`reviewEligibility`/`publicReviews`/`adminReviews` to `api.ts` and re-pointing the
four components gives a typed contract and matches spec Task 6, but changes no
behavior. It is sequenced last and each component's existing tests must stay green.

**AD-6 — Migrations are audited, never renumbered.** 0037–0040 exist and are shaped
correctly (idempotent, one change each, backfill-before-UNIQUE). They are read and
confirmed, not rewritten, unless a concrete idempotency/backfill defect is found.

## Component Responsibilities

| Component | Responsibility in this change |
|---|---|
| `apps/api/src/index.ts` | No change expected. Hosts the `app.route` mounts (`:2407`, `:2409`, `:2410`), `getAuthUser`, reservation-code assignment at both insert sites, and the `scheduled` handler (`enqueueReviewRequests` before `drainEmailOutbox`). Edited only if a verification uncovers a defect. |
| `apps/api/src/reviews.ts` | Logic source (unchanged): `createReviewsRouter` (6 routes), `maskDisplayName`, `computeGuestStats`. |
| `apps/api/src/dashboard.ts` | Logic source (unchanged): `createDashboardRouter`, `getDashboardData`, `occupancyRatio` (null-safe). |
| `apps/api/src/reviewsRoutes.test.ts` (NEW) | App-level contract test for all 5 mounted review routes: mount guard, auth gating, eligibility generic responses, submit 201→409, moderation transitions. |
| `apps/api/src/dashboardRoute.test.ts` (NEW) | App-level contract test for `GET /api/admin/dashboard`: auth gating, payload shape, null-safe occupancy. |
| `apps/web/src/lib/api.ts` | Add `reviewEligibility`, `publicReviews`, `adminReviews` (+ response types). |
| `avis/+page.svelte`, `avis/nouveau/+page.svelte`, `ReviewsStrip.svelte`, `AdminAvisTab.svelte` | Re-point inline `fetch` at the client fns; existing tests updated to mock the api module. |
| `AdminApercuTab`, `AdminParametresTab`, `AdminDisponibilitesTab`, `Footer` | Verify-only: default tab, grouped cards + single sticky save, range grouping, footer link; 375 px responsiveness. |

## Data Flow

**Review submission (public):** `/avis/nouveau?code=…` → `reviewEligibility(code)`
→ `GET /api/reviews/eligibility` (rate-limited) → generic `{eligible}` → star +
textarea → `submitReview({code,rating,body})` → `POST /api/reviews` → handler masks
`display_name`, snapshots `stays_count`/`nights_total` (guest keyed `user_id` else
`lower(email)`), inserts `pending` review (UNIQUE(reservation_id) → 409 on repeat)
→ thanks screen.

**Moderation (admin):** AdminAvisTab → `adminReviews(status)` →
`GET /api/admin/reviews` (getAuthUser + role==='admin') → list + `pendingCount`
badge → Approuver/Rejeter → `adminModerateReview(id,status)` →
`PATCH /api/admin/reviews/:id` (re-moderation allowed) → badge refresh.

**Public display:** homepage `ReviewsStrip` → `publicReviews(3)` and `/avis` →
`publicReviews()` → `GET /api/reviews` (approved only) → masked shape +
`averageRating`; strip hidden when empty.

**Dashboard:** AdminApercuTab (default tab) → `adminGetDashboard()` →
`GET /api/admin/dashboard` → `getDashboardData` (Mon–Sun guest sums, `next7Days`
via `availabilityForRange`, three null-safe occupancy ratios, returning-customers
count) → stat cards + 7-day strip; "—" for null ratios.

**Request cron:** `scheduled` → `enqueueReviewRequests` (confirmed reservations
departed ≤ 3 days, has email, no `review_requests` row, no review → insert request
+ `enqueueEmail('review-request')` gated by `email_review_request_enabled`, link
`${SITE_ORIGIN}/avis/nouveau?code=…`) → `drainEmailOutbox`.

**Test data flow:** integration tests replace `neon` with a per-test SQL stub; the
`app` runs its real routing/auth/handler code against stubbed query results — the
route topology and auth gates are exercised for real; only the DB is faked.

## Known Constraints

- Integration tests must not require a live DB: stub `@neondatabase/serverless` via
  `vi.hoisted` before `import { app }` (hoisting order matters).
- Auth in stubs hinges on the session query text (`FROM sessions … JOIN users`);
  stubs must return the ADMIN/GUEST user for that query to exercise 401/403/200.
- `POST`/`PATCH` bodies go through `zValidator`; tests must send valid/invalid JSON
  with `content-type: application/json` to hit 201/400/409 paths.
- Migrations 0037–0040 stay numbered as-is; any migration edit must remain
  idempotent and single-change.
- All touched UI verified at 375 px (hard rule); French copy preserved.
- Do not touch the HubSpot outbox tab or Task 1 artifacts (Modal, compact
  reservations table, ReservationDetailModal, RoomAssignmentDrawer, page-admin).
- Deploy prerequisite (operational, not code): `npm run db:migrate` must run
  against `DB_CONN` before the reviews feature functions in any environment, and
  the operator must enable `email_review_request_enabled` (default false) for
  review-request emails to send.
