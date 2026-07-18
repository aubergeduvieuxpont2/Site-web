# Admin & Product Improvements — Implementation Plan

Executes `docs/superpowers/specs/2026-07-18-admin-improvements-design.md` (the
spec — authoritative for every requirement; read the section named in your
task). Branch: `agent/20260718-111917` in worktree
`/Users/ychasse/Downloads/wt-admin-improvements`.

## Global Constraints

- **Salvaged draft files exist** (committed in `wip: salvage orchestrator team
  partial output`): migrations 0037–0040, `apps/api/src/{dashboard,reservationCode,reviews,reviewRequests}.ts`,
  `apps/web/src/lib/components/Modal.svelte`, `ReviewsStrip.svelte`,
  `admin/{AdminApercuTab,AdminAvisTab,ReservationDetailModal}.svelte`,
  `apps/web/src/routes/avis/`, and several tests. They were produced by an
  aborted pipeline and are **unverified drafts**: audit against the spec,
  fix or rewrite freely, but do not assume they work. No wiring into
  existing files was done — that wiring is the bulk of each task.
- Migrations: idempotent (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`), one schema change per numbered file; numbers
  0037–0040 are already claimed by the salvaged files — audit them, don't
  renumber.
- All UI fully responsive including 375 px (hard rule). French UI copy
  matching existing admin style.
- Admin endpoints use the existing inline `getAuthUser` + `role==='admin'`
  pattern in `apps/api/src/index.ts` (no new middleware).
- Public endpoints reuse the existing `rateLimitAllow` helper.
- Do not touch the HubSpot outbox tab; keep existing single-day blackout
  endpoints working; do not break any existing test.
- Verification per task: `npm run typecheck` (repo root) + the workspace's
  vitest suites relevant to the change. Run from the worktree root.
- Commit per task on the current branch; message style
  `feat(admin): …` / `feat(api): …` matching repo history.

## Task 1: Shared Modal + compact reservations table + detail modal (spec §3)

- Audit salvaged `apps/web/src/lib/components/Modal.svelte` and
  `apps/web/src/lib/components/admin/ReservationDetailModal.svelte` against
  spec §3; fix or rewrite. `Modal.svelte` must provide: portal to `<body>`,
  backdrop, `role="dialog"` + `aria-modal`, focus trap, Escape-to-close,
  focus-return-to-trigger — extracted from the reference implementation in
  `RoomAssignmentDrawer.svelte` (836 lines; its portal/focus code is the
  house pattern).
- Refactor `RoomAssignmentDrawer.svelte` to consume `Modal.svelte` (behavior
  unchanged: trigger button + drawer dialog).
- `ReservationTableRow.svelte`: reduce columns to Nom · Arrivée · Départ ·
  Chambres (`room_count`) · Statut · Actions (update header row in
  `apps/web/src/routes/admin/+page.svelte` to match). Remove Courriel,
  Téléphone, Pers., Message columns.
- Row click (and Enter/Space on the focusable row) opens
  `ReservationDetailModal` showing: full name, email, phone, people, message,
  source + external_ref, created_at, status, plus the Facture panel
  (`InvoiceCreator`) and the Chambres assignment (RoomAssignmentDrawer
  trigger) — both move OUT of the row/expanding-row into the modal.
- Confirmer/Annuler buttons stay in the row's Actions cell and use
  `event.stopPropagation()` — they must never open the modal and must remain
  clickable at all times.
- Reservation `code` (added in Task 5) may not exist yet: render the code
  field in the modal only when the row has a `code` value (typed optional in
  `apps/web/src/lib/api.ts` `ReservationRow`).
- Tests: component tests for Modal (focus trap, Escape, backdrop),
  row (action click does not open modal; row click does), following the
  existing `@testing-library/svelte` patterns in
  `apps/web/src/lib/components/**/__tests__/`.

## Task 2: Tab-nav scrollbar + Paramètres cards + review-email toggle (spec §1, §2)

- `.page-admin__tabs-inner` in `apps/web/src/routes/admin/+page.svelte`:
  hide the scrollbar (`scrollbar-width: none` + `::-webkit-scrollbar
  { display: none }`) while keeping `overflow-x: auto`; reduce tab padding
  at ≤1280px so the full row (current tabs + future Aperçu/Avis + Courriels
  link) fits without overflow at 1280 and 1024 px.
- Extract the inline settings panel (~lines 722–1116 of `+page.svelte`) into
  `apps/web/src/lib/components/admin/AdminParametresTab.svelte` with grouped
  cards in this order: **Tarification & taxes** (nightlyPrice, weeklyPrice,
  tps, tvq, accommodationTax) · **Coordonnées** (contactEmail, contactPhone)
  · **Réservations** (reservationsEnabled toggle, read-only
  assignableRoomCount) · **Courriels automatiques** (4 existing toggles +
  new `emailReviewRequestEnabled`) · **Sécurité** (password change with its
  own button). ONE save button (sticky on scroll) for all settings via
  existing `adminUpdateSettings`; every existing field keeps its exact
  behavior.
- Backend for the new toggle (spec Key Decision: ship it here so the card is
  self-contained): audit salvaged migration
  `apps/api/migrations/0037_settings_review_request_toggle.sql` (seed
  `email_review_request_enabled` = `'false'`, idempotent
  `ON CONFLICT DO NOTHING`); wire the key through `apps/api/src/settings.ts`,
  the admin settings GET/POST handlers in `index.ts`, and the
  `AdminSettings` type + `adminUpdateSettings` in `apps/web/src/lib/api.ts`,
  exactly parallel to the existing 4 `email_*_enabled` toggles.
- Tests: extend the existing settings API tests for the new key; component
  test that the card renders groups and save submits all values.

## Task 3: Blackout date ranges (spec §4)

- API (`apps/api/src/index.ts`, next to existing blackout endpoints ~2054):
  `POST /api/admin/blackouts/range` body
  `{ startDate, endDate, roomsBlocked, note }` — validate ISO dates,
  `startDate ≤ endDate`, span ≤ 366 days; expand to per-day
  `INSERT … ON CONFLICT (date) DO UPDATE` in one batched statement.
  `DELETE /api/admin/blackouts/range?start=…&end=…` — same validation,
  deletes rows in span. Existing single-day PUT/DELETE stay untouched.
- UI `AdminDisponibilitesTab.svelte`: form gains start + end date pickers
  (end defaults to start ⇒ single day still one action); submits via new
  client fns in `api.ts` (`adminUpsertBlackoutRange`,
  `adminDeleteBlackoutRange`). The list groups **consecutive** days having
  identical `rooms_blocked` AND identical `note` into one display row
  ("2026-08-12 → 2026-08-18 · 12 chambres · note") with a single delete
  calling the range delete. Grouping is client-side display logic only.
- Tests: API validation + expansion edge cases (1-day span, 366-day cap,
  inverted dates, overlap-with-existing upsert); grouping unit cases
  (adjacent identical, adjacent differing note, gap splits group) extending
  `AdminDisponibilitesTab.test.ts`.

## Task 4: Dashboard API + Aperçu tab as default (spec §5)

- Audit salvaged `apps/api/src/dashboard.ts` + `dashboard.test.ts` against
  spec §5, fix/rewrite; wire `GET /api/admin/dashboard` (admin-gated,
  inline auth pattern) into `index.ts`. Payload: `guestsThisWeek`,
  `guestsLastWeek` (sum of `people`, confirmed reservations overlapping the
  Mon–Sun week); `next7Days` `[{date, available}]` via existing
  `availabilityForRange`; `occupancy` `{currentMonth, previousMonth,
  sameMonthLastYear}` = confirmed occupied room-nights ÷
  (assignableRoomCount × nights), current month month-to-date, comparisons
  over the same day-span, `null` when denominator 0; `returningCustomers`
  = distinct guests (`user_id` else `lower(email)`) with ≥2 confirmed
  reservations.
- Audit salvaged `AdminApercuTab.svelte`; wire as new FIRST tab "Aperçu" in
  `+page.svelte` and make it the default `activeTab`. Stat cards (guests
  with vs-last-week delta, occupancy M/M and Y/Y percentages, returning
  count) + 7-day availability strip (day, free rooms, visual bar). Null
  ratios render "—". Client fn `adminDashboard()` in `api.ts`.
- Tests: dashboard aggregates on fixture reservations (overlap edges,
  zero denominators, email-vs-user_id keying); tab renders + is default.

## Task 5: Reviews backend — code, tables, API, cron (spec §6a–§6c, §6e API, §6f API)

- Audit salvaged migrations `0038_reservations_code.sql`,
  `0039_reviews.sql`, `0040_review_requests.sql` and modules
  `reservationCode.ts`, `reviews.ts`, `reviewRequests.ts` (+ their tests)
  against spec §6; fix or rewrite. Requirements: `code TEXT UNIQUE` on
  reservations, `AVP-` + 6-char Crockford base32 (no 0/O/1/I), SQL-side
  backfill of existing rows inside the idempotent migration (backfill before
  enforcing uniqueness); JS generation with `crypto.getRandomValues` +
  retry-on-collision at BOTH insert sites in `index.ts` (website booking and
  OTA ingest). `reviews` / `review_requests` tables exactly per spec §6b
  (one review per reservation via UNIQUE, `channel` default `'email'`).
- Endpoints in `index.ts`:
  `GET /api/reviews/eligibility?code=…` → `{eligible, firstName?, reason?}`
  (valid code + departed + not cancelled + no existing review; generic
  responses for invalid codes, rate-limited);
  `POST /api/reviews` `{code, rating 1–5, body 10–2000}` → pending review
  with server-side snapshot fields: `display_name` masked (first name +
  last-initial "Marie T.", fallback first word of `name`), `stays_count` /
  `nights_total` from confirmed reservations with `depart ≤ today` keyed by
  `user_id` else `lower(email)`; repeat submit → 409;
  `GET /api/reviews?limit=…` → approved only, public shape
  `{displayName, rating, body, staysCount, nightsTotal, createdAt}`;
  `GET /api/admin/reviews?status=…` + `PATCH /api/admin/reviews/:id`
  `{status: approved|rejected}` (re-moderation allowed), admin-gated.
- Cron: in the `scheduled` handler (which currently calls
  `drainEmailOutbox`), add a pass BEFORE the drain: confirmed reservations
  with email, `depart` within the last 3 days, no `review_requests` row, no
  review → insert `review_requests` + `enqueueEmail` the existing
  `review-request` template (add `review-request →
  email_review_request_enabled` to `EMAIL_TOGGLE_KEYS` in `emailOutbox.ts`;
  the toggle was seeded in Task 2). Link:
  `${SITE_ORIGIN}/avis/nouveau?code=<code>` (SITE_ORIGIN from
  `provisioning.ts`).
- Tests per spec §Error-handling: code generation/uniqueness + backfill
  idempotency, eligibility rules, masking, snapshot math (multi-stay),
  moderation transitions, cron window dedupe, 409 on repeat.

## Task 6: Reviews frontend — public pages, homepage strip, admin Avis tab (spec §6d–§6f)

- Audit salvaged `apps/web/src/routes/avis/` pages, `ReviewsStrip.svelte`,
  `AdminAvisTab.svelte` (+ tests); fix or rewrite; add client fns in
  `api.ts` (`reviewEligibility`, `submitReview`, `publicReviews`,
  `adminReviews`, `adminModerateReview`).
- `/avis/nouveau?code=…` (no login): validates eligibility on load; 1–5
  star picker + textarea (10–2000 chars) + submit → thanks screen; generic
  error state for invalid/ineligible codes. French copy.
- `/avis`: all approved reviews newest-first, average-rating header, each
  entry "«…» — Marie T. · N séjours · M nuits" + stay date; footer link to
  `/avis` in the site footer component.
- Homepage strip: ≤3 most recent approved reviews (stars, excerpt, masked
  name + séjours/nuits); entire section hidden when none.
- Admin tab **Avis** in `+page.svelte` after Disponibilités, pending-count
  badge in the tab label; list filtered by status (default pending) showing
  rating, body, display_name, stays/nights, reservation code, date;
  Approuver/Rejeter buttons; badge count refreshes after moderation.
- All pages responsive at 375 px. Tests: eligibility flow states, submit
  success + error, strip hidden-when-empty, moderation actions update list.
