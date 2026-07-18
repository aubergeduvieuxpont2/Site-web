# Requirements — Admin & Product Improvements (Tasks 2–6)

## In Scope

### Functional Requirements

**Task 2 — Paramètres reorg + tab-nav (spec §1–2; net-new + fixture fix)**
- **FR-1 (MUST)** Hide the horizontal scrollbar on `.page-admin__tabs-inner`
  (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) while keeping
  `overflow-x: auto`; reduce tab padding ≤1280px so the full tab row fits at 1280px and
  1024px without overflow; remain scrollable and usable at 375px.
- **FR-2 (MUST)** Extract the inline settings panel into
  `AdminParametresTab.svelte` as five grouped cards in order (Tarification & taxes /
  Coordonnées / Réservations / Courriels automatiques / Sécurité) with ONE sticky save
  button; the password change keeps its own button and separate call.
- **FR-3 (MUST)** Surface the existing `emailReviewRequestEnabled` toggle in the Courriels
  card; do NOT re-add its API/schema/migration (already implemented).
- **FR-4 (MUST)** Update the API `settings.test.ts` fixtures so all 11 failing tests pass
  against the current `SettingsUpdateSchema` (the schema is the source of truth; add the
  missing required fields to fixtures). The schema must not be weakened.

**Task 3 — Blackout ranges (spec §4; drafted)**
- **FR-5 (MUST)** `POST /api/admin/blackouts/range` validates ISO dates,
  `startDate ≤ endDate`, span ≤ 366 days (400 otherwise) and expands to per-day
  `INSERT … ON CONFLICT (date) DO UPDATE` upserts; `DELETE …/blackouts/range?start=&end=`
  deletes all rows in span with the same validation. Both admin-gated.
- **FR-6 (MUST)** Existing single-day `PUT`/`DELETE /api/admin/blackouts/:date` endpoints
  and the `availability.ts` per-day math remain unchanged.
- **FR-7 (MUST)** `AdminDisponibilitesTab.svelte` has start + end date pickers (end
  defaults to start) and groups consecutive days with identical `rooms_blocked` and `note`
  into one range row with a single range delete; grouping is client-side display only.
- **FR-8 (MUST)** The 4 failing `AdminDisponibilitesTab.test.ts` tests pass and the 2
  Svelte warnings (`a11y_no_noninteractive_tabindex`, `state_referenced_locally`) are
  resolved.

**Task 4 — Dashboard "Aperçu" (spec §5; API drafted, UI not integrated)**
- **FR-9 (MUST)** `GET /api/admin/dashboard` (admin-gated) returns `guestsThisWeek`,
  `guestsLastWeek` (sum of `people` over confirmed reservations overlapping the respective
  Mon–Sun week), `next7Days` (7 `{date, available}` from `availabilityForRange`),
  `occupancy {currentMonth, previousMonth, sameMonthLastYear}` (confirmed room-nights ÷
  assignableRoomCount×nights, month-to-date + same-day-span comparisons, `null` when
  denominator 0), and `returningCustomers` (distinct guests keyed `user_id` else
  `lower(email)` with ≥2 confirmed reservations).
- **FR-10 (MUST)** `AdminApercuTab.svelte` is wired as the first tab "Aperçu" and the
  default `activeTab`; it renders stat cards + a 7-day availability strip and shows "—" for
  null occupancy ratios; Réservations becomes second.

**Task 5 — Reviews backend (spec §6a–c, §6e/§6f API; drafted)**
- **FR-11 (MUST)** `reservations.code` is `AVP-` + 6-char Crockford base32 (no `0 1 I O`),
  unique; existing rows backfilled SQL-side in an idempotent migration; new reservations
  from **both** website booking and OTA ingest get a code at insert via
  `crypto.getRandomValues` with collision retry.
- **FR-12 (MUST)** `reviews` and `review_requests` tables exist per spec §6b (one review
  per reservation, one request per reservation).
- **FR-13 (MUST)** `GET /api/reviews/eligibility?code` (rate-limited) returns
  `{eligible, firstName?, reason?}` — eligible only for a valid, departed, non-cancelled,
  un-reviewed code; generic responses (no data leak) otherwise.
- **FR-14 (MUST)** `POST /api/reviews {code, rating 1–5, body 10–2000}` creates a `pending`
  review with server-side masked `display_name` ("Marie T.", fallback first word of `name`)
  and snapshot `stays_count`/`nights_total`; returns 409 on repeat.
- **FR-15 (MUST)** `GET /api/reviews?limit` returns approved reviews only in the public
  shape; `GET /api/admin/reviews?status` (default pending, + `pendingCount`) and
  `PATCH /api/admin/reviews/:id {status}` (admin-gated, re-moderation allowed).
- **FR-16 (MUST)** The `scheduled` handler runs a review-request pass **before**
  `drainEmailOutbox`: confirmed reservations departed ≤3 days with an email, no
  `review_requests` row, no review → insert `review_requests` + `enqueueEmail
  ('review-request')` with link `${SITE_ORIGIN}/avis/nouveau?code=<code>`, gated by
  `email_review_request_enabled` and deduped by the request PK.

**Task 6 — Reviews frontend (spec §6d–f; drafted, admin tab not integrated)**
- **FR-17 (MUST)** `/avis/nouveau?code=…` (no login) validates eligibility on load, shows a
  1–5 star picker + textarea (10–2000), a thanks screen on submit, and a generic error
  state for invalid/ineligible codes.
- **FR-18 (MUST)** `/avis` lists all approved reviews newest-first with an average-rating
  header; the homepage `ReviewsStrip` shows ≤3 approved reviews and is hidden when empty;
  the footer links to `/avis`.
- **FR-19 (MUST)** `AdminAvisTab.svelte` is wired after Disponibilités with a pending-count
  badge; status filter defaults to pending; Approuver/Rejeter moderate and refresh the
  badge.
- **FR-20 (MUST)** The 11 web typecheck errors in `AdminAvisTab.test.ts`,
  `page-avis.test.ts`, `page-avis-nouveau.test.ts` are fixed.

### Non-Functional Requirements
- **NFR-1 (MUST)** Whole-repo `npm run typecheck` exits 0 with no ERROR lines; all Vitest
  suites in `apps/api` and `apps/web` pass, including the Task-1 suites (Modal,
  ReservationTableRow, ReservationDetailModal, RoomAssignmentDrawer, page-admin).
- **NFR-2 (MUST)** Every touched screen is usable and correct at 375px width; French UI
  copy matches existing admin/site tone.
- **NFR-3 (MUST)** All migrations are idempotent; re-running the migration runner is a
  no-op.
- **NFR-4 (SHOULD)** Public review endpoints are rate-limited via `rateLimitAllow`; invalid
  codes never leak reservation data.
- **NFR-5 (MUST)** Admin endpoints are gated by inline `getAuthUser` + `role === 'admin'`;
  no new middleware.

### Constraints
- Migrations `0037–0040` are already claimed — audit, do not renumber; one schema change
  per numbered file.
- Do not touch the HubSpot outbox ("File HubSpot") tab.
- Preserve `apps/api/src/index.ts` exports: `export default { fetch, scheduled }` and
  `export { app }`.
- Audit-and-fix the salvaged drafts; do not regenerate from scratch or regress already-wired
  integrations.
- `DB_CONN` is a `c.env` var/secret (no binding block); tests use the existing recorder-based
  Neon stub.

## Out of Scope (Exclusions)
- SMS review requests (schema reserves `channel` only).
- Review replies, editing, or guest-side deletion.
- Occupancy charts or historical analytics beyond the three §5 ratios.
- Extracting the remaining inline outbox panel from the admin monolith.
- Renumbering migrations 0037–0040 or altering `blackout_dates` storage / availability math.
- Re-doing Task 1 (shared Modal, compact table, detail modal) — already landed and green.
- Re-adding the `emailReviewRequestEnabled` API/schema/migration (already implemented).

## Acceptance Criteria
1. `npm run typecheck` (repo root) exits 0 with no ERROR lines; the 2
   AdminDisponibilitesTab warnings and all 11 review-test ERRORs are gone.
2. `cd apps/api && npx vitest run test/settings.test.ts` → 46 passed, 0 failed.
3. `npx vitest run` in `apps/web` and `apps/api` → every suite passes, Task-1 suites still
   green.
4. The Paramètres tab renders five grouped cards in order with ONE save button and a
   separate password button; `emailReviewRequestEnabled` round-trips (POST then GET) and is
   absent from public `GET /api/settings`.
5. `activeTab` defaults to `"apercu"`; the tab row is Aperçu (first) · Réservations · … ·
   Disponibilités · Avis (with pending badge) · … ; the badge decreases after moderation.
6. `.page-admin__tabs-inner` shows no visible scrollbar at ≥1024px, fits the full row at
   1280px and 1024px, and stays scrollable at 375px.
7. `GET /api/admin/dashboard` returns the full payload; occupancy fields are `null` when the
   denominator is 0 and render "—"; the endpoint is admin-gated (401/403 otherwise).
8. `POST /api/admin/blackouts/range` returns 400 for inverted dates or span >366; a valid
   3-day range creates 3 per-day rows; the list groups 3 consecutive identical days into one
   deletable range row; single-day endpoints still work.
9. Every reservation has a unique `code` matching
   `^AVP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`; both website and OTA inserts assign a code;
   migration 0038 is idempotent.
10. `GET /api/reviews/eligibility?code=<invalid>` returns a generic ineligible response with
    no reservation data; `POST /api/reviews` twice for the same code returns 409; stored
    `display_name` is masked ("Marie T.").
11. `GET /api/reviews` returns approved reviews only (newest-first) with `averageRating`; the
    homepage strip shows ≤3 and is hidden when none; `/avis` has an average-rating header and
    is linked from the footer.
12. `/avis/nouveau?code=…` (no login) validates eligibility, submits a 1–5 star + textarea
    (10–2000) review, and shows a thanks screen; invalid codes show a generic error state.
13. With `email_review_request_enabled` true, the `scheduled` handler enqueues one
    `review-request` email per eligible reservation (confirmed, departed ≤3d, has email, no
    request, no review), inserts a `review_requests` row, and does not re-enqueue on a
    subsequent run; with the toggle false, none are enqueued.
14. All touched screens are usable at 375px width.
15. The HubSpot outbox tab and migration numbering (0037–0040) are unchanged; the `index.ts`
    default export exposes both `fetch` and `scheduled`, and `export { app }` remains.
