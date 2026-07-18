# Admin & Product Improvements — Tasks 2–6: Convert "false green" to real green

## Task

Finish and **genuinely verify** Tasks 2–6 of the committed batch
(`docs/superpowers/plans/2026-07-18-admin-improvements-plan.md`, spec authority
`docs/superpowers/specs/2026-07-18-admin-improvements-design.md`) on the Site-web
monorepo (Svelte 5 SPA + Hono/Cloudflare Workers API + Neon Postgres). Task 1 is
landed and green and must not regress.

### Verified starting state (supersedes the stale "deleted endpoints" premise)

The incoming task brief asserts four reviews/dashboard endpoints were **deleted**
and two were **never wired**, based on the `index.ts` route count dropping 50→44
between `abbf474` and HEAD (`79a1762`). **Direct verification proves this premise
is inaccurate at the current HEAD.** The prior team did not delete the routes — it
moved them from inline `app.get(...)` handlers into the extracted, unit-tested
modules `apps/api/src/reviews.ts` (`createReviewsRouter`) and
`apps/api/src/dashboard.ts` (`createDashboardRouter`), then mounted them with
`app.route("/", …)` at `index.ts:2407` and `:2409` — the **same accepted pattern**
as the working `createEmailsRouter` at `:2410`. The 50→44 delta is purely an
artifact of a `grep 'app.(get|post|…)('` on the main app, which does not see routes
registered on a sub-router.

An app-level probe (`app.request(...)` against `{ app }` from `index.ts`) confirms
**all six routes resolve and execute**:

| Method + path | Observed status | Meaning |
|---|---|---|
| `GET /api/admin/dashboard` | 401 | mounted; admin auth ran (no session) |
| `GET /api/reviews` | 500 | mounted; handler ran, hit stub DB |
| `GET /api/reviews/eligibility?code=x` | 500 | mounted; handler ran |
| `GET /api/admin/reviews` | 401 | mounted; admin auth ran |
| `POST /api/reviews` | 500 | mounted; handler ran |
| `PATCH /api/admin/reviews/:id` | 401 | mounted; admin auth ran |
| `GET /api/nonexistent-xyz` (control) | 404 | genuinely unmounted |

**Consequence for scope.** There is nothing to "restore" or "re-wire". Converting
the functional, module-tested sub-routers back to inline handlers would be pure
churn that re-introduces exactly the regression risk that got the prior team
rejected, and is therefore **explicitly out of scope**. The batch's true unmet
goal — the reason the "green" is hollow — is that **the reviews/dashboard routes
have no test that drives the mounted `app`**: `reviews.test.ts` instantiates
`createReviewsRouter` directly and `dashboard.test.ts` calls `getDashboardData`
directly, so a future unmount (or a broken `app.route` mount) would not fail any
test. This plan closes that gap and completes the remaining low-risk conformance.

### What this plan delivers

1. **Anti-regression guard (primary):** app-level integration tests that import
   `{ app }` and drive every reviews/dashboard route via `app.request`, following
   the existing `apps/api/src/blackoutsRange.test.ts` pattern (hoisted `neon`
   mock + per-test SQL stub). These tests FAIL if any route becomes unmounted,
   loses its auth gate, or changes contract.
2. **api.ts conformance (low-risk):** add the three missing thin client fns named
   in spec Task 6 (`reviewEligibility`, `publicReviews`, `adminReviews`) and route
   the public/admin review components through them + `submitReview` instead of
   inline `fetch`.
3. **Verification, not rebuild:** confirm (and only fix in place if a defect is
   found) the already-wired email toggle, blackout ranges + grouping, reservation
   code generation at both insert sites, cron review-request pass ordering, and
   migration idempotency; and confirm 375 px responsiveness of every touched
   screen (hard rule).

## Schema Changes

**No new schema changes.** Migrations `0037_settings_review_request_toggle.sql`,
`0038_reservations_code.sql`, `0039_reviews.sql`, `0040_review_requests.sql`
already exist and are audited here (not renumbered, not modified unless a defect
is proven). For reference, the tables the integration tests assert against:

- `reservations.code TEXT UNIQUE` — `AVP-` + 6 chars Crockford base32 (no `0/O/1/I`),
  SQL-backfilled before the UNIQUE constraint is enforced.
- `reviews(id, reservation_id UNIQUE, rating 1–5, body, status
  pending|approved|rejected, display_name, stays_count, nights_total, created_at,
  moderated_at)`.
- `review_requests(reservation_id PK, channel default 'email', sent_at)`.
- `settings` row `email_review_request_enabled` default `'false'`.

Verification requirement (no edit unless failing): each migration uses
`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `INSERT … ON CONFLICT
DO NOTHING|UPDATE`, one schema change per numbered file, backfill-before-unique.

## API Types (existing contracts the integration tests pin)

```ts
// GET /api/admin/dashboard  (admin-gated)
interface DashboardResponse {
  guestsThisWeek: number;
  guestsLastWeek: number;
  next7Days: { date: string; available: number }[];
  occupancy: {
    currentMonth: number | null;      // null when denominator 0
    previousMonth: number | null;
    sameMonthLastYear: number | null;
  };
  returningCustomers: number;
}

// GET /api/reviews/eligibility?code=…  (public, rate-limited)
type EligibilityResponse = { eligible: boolean; firstName?: string };
// invalid/ineligible/absent-review codes → { eligible: false } (no data leak)
// missing code → 400 { error }

// POST /api/reviews  { code, rating: 1–5, body: 10–2000 }  (public, rate-limited)
// → 201 { ok: true } | 400 { error } (ineligible/validation) | 409 { error } (repeat)

// GET /api/reviews?limit=…  (public)
interface PublicReviewsResponse {
  reviews: { id: number; displayName: string; rating: number; body: string;
             staysCount: number; nightsTotal: number; createdAt: string }[];
  averageRating: number | null;
  total: number;
}

// GET /api/admin/reviews?status=pending|approved|rejected  (admin-gated)
interface AdminReviewsResponse {
  reviews: { id: number; reservation_id: number; rating: number; body: string;
             status: string; display_name: string; stays_count: number;
             nights_total: number; created_at: string; moderated_at: string | null;
             reservation_code: string | null }[];
  pendingCount: number;
}

// PATCH /api/admin/reviews/:id  { status: 'approved' | 'rejected' }  (admin-gated)
// → 200 { review } | 400 (bad id/body) | 404 (missing) | 401/403 (auth)
```

New client fns to add in `apps/web/src/lib/api.ts` (thin wrappers over the above,
mirroring existing `submitReview` / `adminModerateReview` / `adminGetDashboard`):
`reviewEligibility(code: string)`, `publicReviews(limit?: number)`,
`adminReviews(status?: 'pending'|'approved'|'rejected')`.

## Component Hierarchy

No new components. Existing wired components are re-pointed at api.ts client fns:

```
routes/admin/+page.svelte            (already: activeTab default 'apercu', 'avis' tab + badge)
  ├─ AdminApercuTab.svelte           → adminGetDashboard()          [verify only]
  ├─ AdminParametresTab.svelte       → adminUpdateSettings()        [verify only]
  ├─ AdminDisponibilitesTab.svelte   → adminUpsert/DeleteBlackoutRange() [verify only]
  └─ AdminAvisTab.svelte             → adminReviews() + adminModerateReview()  [re-point]
routes/avis/+page.svelte             → publicReviews()              [re-point]
routes/avis/nouveau/+page.svelte     → reviewEligibility() + submitReview()    [re-point]
lib/components/ReviewsStrip.svelte   → publicReviews(3)             [re-point]
lib/components/Footer.svelte         (already: /avis link)          [verify only]
```

## Implementation Steps

### Step 1 — `apps/api/src/reviewsRoutes.test.ts` (NEW)

App-level integration test for the reviews routes. Copy the harness from
`apps/api/src/blackoutsRange.test.ts`: `vi.hoisted` + `vi.mock('@neondatabase/serverless')`
neon holder, `import { app } from './index'`, per-test SQL stubs
(`makeAdminSql`/`makeGuestSql`/`makeAnonSql` returning an ADMIN/GUEST user for the
`FROM sessions … JOIN users` query, routing other queries to a fixture callback).
Assert:
- **Mount guard:** for each `[method, path]` in the reviews set, the response
  status is NOT 404 (proves the route is mounted; fails on unmount).
- `GET /api/reviews/eligibility` — missing `code` → 400; unknown/cancelled/not-yet-
  departed/already-reviewed code → 200 `{ eligible: false }` (generic, no leaked
  fields); valid departed no-review → 200 `{ eligible: true, firstName? }`.
- `POST /api/reviews` — ineligible code → 400; rating out of 1–5 or body <10/>2000
  → 400; valid → 201 `{ ok: true }`; a second insert whose stub throws a
  `unique`-message error → 409.
- `GET /api/reviews` — 200 with `{ reviews: [public shape], averageRating, total }`;
  only `status='approved'` rows are queried (assert the SQL contains
  `status = 'approved'`).
- `GET /api/admin/reviews` — anon → 401, guest → 403, admin → 200
  `{ reviews, pendingCount }`.
- `PATCH /api/admin/reviews/:id` — anon → 401, guest → 403, non-numeric id → 400,
  no row updated → 404, admin approve/reject → 200 `{ review }`.

### Step 2 — `apps/api/src/dashboardRoute.test.ts` (NEW)

App-level integration test for `GET /api/admin/dashboard` using the same harness.
Assert: anon → 401; guest → 403; admin → 200 with a body containing keys
`guestsThisWeek`, `guestsLastWeek`, `next7Days` (array), `occupancy` with
`currentMonth`/`previousMonth`/`sameMonthLastYear`, `returningCustomers`; and that
`occupancy.currentMonth` is `null` when the settings stub yields
`assignableRoomCount = 0` (null-safe ratio). Include the mount-guard assertion
(status ≠ 404). (Deep aggregate math stays covered by the existing
`dashboard.test.ts`; this test only pins the mounted contract.)

### Step 3 — `apps/web/src/lib/api.ts`

Add three client fns beside the existing review fns, each using the shared
`fetchJson`/error convention already in the file:
- `reviewEligibility(code)` → `GET /api/reviews/eligibility?code=…` → `EligibilityResponse | ApiError`.
- `publicReviews(limit?)` → `GET /api/reviews?limit=…` → `PublicReviewsResponse | ApiError`.
- `adminReviews(status?)` → `GET /api/admin/reviews?status=…` → `AdminReviewsResponse | ApiError`.
Export the three response types. Do not alter existing fns.

### Step 4 — Re-point components at the client fns

Replace inline `fetch` with the new/existing client fns (no behavior change):
- `apps/web/src/routes/avis/nouveau/+page.svelte`: eligibility check → `reviewEligibility`;
  submit → `submitReview`.
- `apps/web/src/routes/avis/+page.svelte`: list load → `publicReviews`.
- `apps/web/src/lib/components/ReviewsStrip.svelte`: load → `publicReviews(3)`.
- `apps/web/src/lib/components/admin/AdminAvisTab.svelte`: list → `adminReviews`;
  moderation → `adminModerateReview` (if still inline).
Update each component's existing `__tests__` to mock the api.ts module fn instead
of `global.fetch` where the test asserted on the fetch call; keep all current
assertions (loading/empty/error/success states) green.

### Step 5 — Verification & full-gate (fix in place only if a check fails)

Confirm the already-wired behavior; touch code only if a verification fails:
- Migrations 0037–0040 idempotent (IF NOT EXISTS / ON CONFLICT; backfill before
  UNIQUE); numbered as-is.
- `EMAIL_TOGGLE_KEYS['review-request'] === 'email_review_request_enabled'`,
  `settings.ts` default `false`, `api.ts` `AdminSettings.emailReviewRequestEnabled`,
  Paramètres "Courriels automatiques" card exposes the toggle.
- Reservation code assigned at both insert sites (`index.ts` ~:553 website booking,
  ~:708 OTA ingest) via `generateReservationCode` + collision retry.
- `scheduled` runs `enqueueReviewRequests` BEFORE `drainEmailOutbox`
  (`index.ts:2434–2435`); request window = departed ≤ 3 days, deduped via
  `review_requests` + no existing review; link `${SITE_ORIGIN}/avis/nouveau?code=…`.
- Blackout range `POST/DELETE /api/admin/blackouts/range` + `AdminDisponibilitesTab`
  consecutive-day grouping (already covered by `blackoutsRange.test.ts`).
- Responsive at **375 px** (plus 1024 / 1280) for: admin tab-nav (scrollbar hidden,
  full row + Courriels link fits at desktop), AdminParametresTab cards + single
  sticky save, AdminApercuTab stat cards + 7-day strip ("—" for null ratios),
  AdminAvisTab, `/avis`, `/avis/nouveau`, ReviewsStrip.
- Final gate: whole-repo `npm run typecheck` clean AND every vitest suite green in
  `apps/api` and `apps/web`, including the new Step 1–2 integration tests and the
  Task 1 suites (Modal, ReservationTableRow, ReservationDetailModal,
  RoomAssignmentDrawer, page-admin).

## Acceptance Criteria

1. A new test file `apps/api/src/reviewsRoutes.test.ts` imports the real `app` from
   `apps/api/src/index.ts` and, for each of `GET /api/reviews/eligibility`,
   `POST /api/reviews`, `GET /api/reviews`, `GET /api/admin/reviews`, and
   `PATCH /api/admin/reviews/:id`, asserts the mounted response status is not 404.
2. In `reviewsRoutes.test.ts`: `GET /api/reviews/eligibility?code=UNKNOWN` returns
   HTTP 200 with body `{ "eligible": false }` and no `firstName`/reservation fields;
   `GET /api/reviews/eligibility` with no `code` returns HTTP 400.
3. In `reviewsRoutes.test.ts`: `POST /api/reviews` with a valid eligible code and
   `{ rating: 5, body: <≥10 chars> }` returns HTTP 201; a repeat submit whose DB
   stub raises a uniqueness error returns HTTP 409; `rating: 6` or a 3-char body
   returns HTTP 400.
4. In `reviewsRoutes.test.ts`: `GET /api/admin/reviews` returns HTTP 401 with no
   session, HTTP 403 for a guest session, and HTTP 200 with a JSON body containing
   `reviews` (array) and `pendingCount` (number) for an admin session;
   `PATCH /api/admin/reviews/:id` returns 401/403 for anon/guest and HTTP 200 with
   a `review` object for an admin approving an existing id.
5. A new test file `apps/api/src/dashboardRoute.test.ts` asserts
   `GET /api/admin/dashboard` returns 401 (anon), 403 (guest), and 200 (admin) with
   a body containing `guestsThisWeek`, `guestsLastWeek`, `next7Days`, `occupancy`
   (`currentMonth`/`previousMonth`/`sameMonthLastYear`), and `returningCustomers`;
   with `assignableRoomCount = 0`, `occupancy.currentMonth === null`.
6. `apps/web/src/lib/api.ts` exports `reviewEligibility`, `publicReviews`, and
   `adminReviews`; a grep for `fetch("/api/reviews` under
   `apps/web/src/routes/avis` and `apps/web/src/lib/components/ReviewsStrip.svelte`
   returns no matches (components call the client fns, not inline `fetch`).
7. `apps/web/src/routes/admin/+page.svelte` default `activeTab` is `"apercu"` and
   the tab list renders "Aperçu" first and an "Avis" tab (with a pending-count
   badge) after "Disponibilités".
8. Whole-repo `npm run typecheck` exits 0.
9. `npm run test` (vitest) in `apps/api` and `apps/web` reports every suite passing,
   including `reviewsRoutes.test.ts`, `dashboardRoute.test.ts`, and the Task 1
   suites; no suite is skipped.
10. If any route from Acceptance Criteria 1 is unmounted (e.g. an `app.route` mount
    line is removed from `index.ts`), at least one test in `reviewsRoutes.test.ts`
    or `dashboardRoute.test.ts` fails.
