# Requirements — Admin & Product Improvements (Tasks 2–6): real-green hardening

## In Scope

### Functional

- **FR-1 (MUST)** Add app-level integration tests (`apps/api/src/reviewsRoutes.test.ts`)
  that import the real `app` from `apps/api/src/index.ts` and drive every mounted
  reviews route via `app.request`: `GET /api/reviews/eligibility`, `POST /api/reviews`,
  `GET /api/reviews`, `GET /api/admin/reviews`, `PATCH /api/admin/reviews/:id`.
- **FR-2 (MUST)** Each of those routes MUST have a test asserting its mounted status
  is not 404 (a mount guard that fails if the route is unmounted).
- **FR-3 (MUST)** `GET /api/reviews/eligibility` tests MUST cover: missing `code` →
  400; unknown/cancelled/not-yet-departed/already-reviewed → 200 `{ eligible:false }`
  with no leaked reservation fields; eligible → 200 `{ eligible:true, firstName? }`.
- **FR-4 (MUST)** `POST /api/reviews` tests MUST cover: ineligible code → 400;
  invalid rating/body → 400; valid → 201; uniqueness-error repeat → 409.
- **FR-5 (MUST)** `GET /api/admin/reviews` and `PATCH /api/admin/reviews/:id` tests
  MUST cover admin gating: anon → 401, guest → 403, admin → 200; plus PATCH bad-id
  → 400 and no-row → 404.
- **FR-6 (MUST)** Add `apps/api/src/dashboardRoute.test.ts` asserting
  `GET /api/admin/dashboard`: anon → 401, guest → 403, admin → 200 with payload keys
  `guestsThisWeek`, `guestsLastWeek`, `next7Days`, `occupancy`
  (`currentMonth`/`previousMonth`/`sameMonthLastYear`), `returningCustomers`; and
  `occupancy.currentMonth === null` when `assignableRoomCount = 0`.
- **FR-7 (MUST)** Add `reviewEligibility`, `publicReviews`, `adminReviews` client
  fns (+ exported response types) to `apps/web/src/lib/api.ts`.
- **FR-8 (SHOULD)** Re-point `avis/+page.svelte`, `avis/nouveau/+page.svelte`,
  `ReviewsStrip.svelte`, and `AdminAvisTab.svelte` from inline `fetch` to the api.ts
  client fns (`reviewEligibility`, `publicReviews`, `submitReview`, `adminReviews`,
  `adminModerateReview`), preserving all existing behavior and test assertions.
- **FR-9 (MUST)** Verify (fix in place only on failure) the already-wired
  behaviors: `email_review_request_enabled` toggle end-to-end; blackout range
  endpoints + consecutive-day grouping; reservation-code generation at both insert
  sites; cron `enqueueReviewRequests` before `drainEmailOutbox` with the 3-day
  dedup window; migrations 0037–0040 idempotency.
- **FR-10 (MUST)** Verify 375 px responsiveness of every touched screen (admin
  tab-nav, AdminParametresTab, AdminApercuTab, AdminAvisTab, `/avis`,
  `/avis/nouveau`, ReviewsStrip).

### Non-Functional

- **NFR-1 (MUST)** Integration tests run without a live database — `neon` is stubbed
  via `vi.hoisted` + `vi.mock`, following `apps/api/src/blackoutsRange.test.ts`.
- **NFR-2 (MUST)** Whole-repo `npm run typecheck` exits 0.
- **NFR-3 (MUST)** Every vitest suite in `apps/api` and `apps/web` passes, including
  the new tests and the Task 1 suites; none skipped.
- **NFR-4 (SHOULD)** No net increase in flakiness or runtime beyond the new tests;
  public review endpoints stay rate-limited; admin endpoints stay `role==='admin'`
  gated.
- **NFR-5 (MUST)** Security posture unchanged: eligibility responses stay generic
  for invalid codes (no reservation-data leak); `display_name` stays server-masked;
  error boundary returns generic 500s.

### Constraints

- Sub-router mounting via `app.route("/", …)` is retained (matches the accepted
  `createEmailsRouter`); no inline conversion of `createReviewsRouter` /
  `createDashboardRouter`.
- Migrations stay numbered 0037–0040, idempotent, one schema change per file.
- Svelte 5 runes; French UI copy; Tailwind v4; Hono + `@neondatabase/serverless`
  over HTTP (`DB_CONN`, no binding block).
- Do not modify Task 1 artifacts or the HubSpot outbox tab.

## Out of Scope (Exclusions)

- Restoring/re-wiring or inlining the six review/dashboard routes — verified already
  mounted and functional at HEAD; no such work exists.
- New endpoints, new tables, new migrations, or schema changes.
- SMS review requests (schema-ready only); review replies, editing, or guest-side
  deletion.
- Historical occupancy charts beyond the three §5 ratios.
- Refactoring the remaining inline admin panels (outbox) out of the monolith.
- Task 1 rework and any HubSpot outbox changes.
- Running actual DB migrations or deploys (operational follow-up, not this change).

## Acceptance Criteria

1. `apps/api/src/reviewsRoutes.test.ts` exists, imports `{ app }` from
   `apps/api/src/index.ts`, and for each of the five reviews routes asserts a
   non-404 mounted status.
2. `GET /api/reviews/eligibility?code=UNKNOWN` → HTTP 200 body `{ "eligible": false }`
   with no reservation fields; no `code` → HTTP 400 (asserted in the test).
3. `POST /api/reviews` → 201 on a valid eligible submission, 409 on a
   uniqueness-error repeat, 400 on invalid rating/body or ineligible code
   (asserted in the test).
4. `GET /api/admin/reviews` and `PATCH /api/admin/reviews/:id` → 401 (anon),
   403 (guest), 200 (admin), with PATCH also 400 (bad id) and 404 (no row)
   (asserted in the test).
5. `apps/api/src/dashboardRoute.test.ts` asserts `GET /api/admin/dashboard`
   401/403/200 gating, the five payload keys, and `occupancy.currentMonth === null`
   when `assignableRoomCount = 0`.
6. `apps/web/src/lib/api.ts` exports `reviewEligibility`, `publicReviews`, and
   `adminReviews`; the four review components contain no `fetch("/api/reviews…"`
   calls (they use the client fns).
7. `apps/web/src/routes/admin/+page.svelte` default `activeTab` is `"apercu"`;
   "Aperçu" renders first and "Avis" (with a pending-count badge) renders after
   "Disponibilités".
8. Removing an `app.route` mount line for reviews or dashboard from `index.ts`
   causes at least one test in the new integration suites to fail.
9. `npm run typecheck` at the repo root exits 0.
10. `npm run test` in `apps/api` and `apps/web` reports all suites passing
    (including the two new suites and the Task 1 suites), none skipped.
