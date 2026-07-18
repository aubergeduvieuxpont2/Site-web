# Admin & Product Improvements — Dashboard, Reviews, Ranges, UX

## Task

Implement six operator-approved improvements to the Site-web admin area and
public site (Svelte 5 + Hono/Cloudflare + Neon Postgres monorepo), per the
authoritative design spec `docs/superpowers/specs/2026-07-18-admin-improvements-design.md`:

1. **§1 Tab-nav scrollbar fix** — hide the horizontal scrollbar on the admin
   tab nav while keeping mobile scrollability; fit the row at desktop widths.
2. **§2 Paramètres reorg** — extract the inline settings panel into
   `AdminParametresTab.svelte` as grouped cards with one sticky save button
   (password change keeps its own button).
3. **§3 Compact reservations table + detail modal** — extract a shared
   `Modal.svelte` from `RoomAssignmentDrawer.svelte`; reduce the table to
   Nom·Arrivée·Départ·Chambres·Statut·Actions; row-click opens a detail modal;
   Confirmer/Annuler stay in-row with `stopPropagation`.
4. **§4 Blackout ranges** — new range create/delete endpoints expanding to
   per-day rows (span ≤366d); UI start/end pickers; list groups consecutive
   identical days into range rows.
5. **§5 Dashboard "Aperçu"** — new admin-gated `GET /api/admin/dashboard`; new
   default landing tab with stat cards + 7-day availability strip.
6. **§6 Moderated guest reviews** — reservation `code` migration + generation;
   `reviews`/`review_requests` tables; cron review-request enqueue gated by a
   new `email_review_request_enabled` toggle; public eligibility/submit
   endpoints + `/avis/nouveau` page; admin **Avis** moderation tab; public
   `GET /api/reviews` → homepage strip + `/avis` page + footer link.

Delivery is single-branch, work ordered **WS-A → WS-B → WS-C → WS-D** with
per-stream commits. Per Key Decision 2 option (a), the
`email_review_request_enabled` settings migration + `settings.ts` wiring ship
inside WS-A so the Paramètres card is self-contained; WS-D consumes it.

Constraints (hard rules): migrations start at **0037**, each schema change in
its own numbered idempotent file (`CREATE TABLE IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`); all touched UI fully
responsive incl. **375px**; French UI copy matching existing admin style; keep
existing single-day blackout endpoints working; do **not** touch the HubSpot
outbox ("File HubSpot") tab; keep every existing test green; preserve the
`index.ts` dual export (`export default { fetch, scheduled }` **and**
`export { app }`).

## Schema Changes

All migrations idempotent; numbered sequentially from 0037 (existing max is
0036). One schema change per file.

### `apps/api/migrations/0037_settings_review_request_toggle.sql` (WS-A)
Seed the new email toggle so the Paramètres card is self-contained.
```sql
INSERT INTO settings (key, value)
VALUES ('email_review_request_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
```

### `apps/api/migrations/0038_reservations_code.sql` (WS-D)
Add a human-facing reservation code, backfill all existing rows SQL-side, then
enforce uniqueness. Alphabet = Crockford base32 excluding visually ambiguous
`0 1 I O`: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars). Format `AVP-XXXXXX`.
```sql
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill rows lacking a code. Per-row randomness is forced by correlating on
-- r.id and random(); each of 6 positions maps an md5 byte into the 32-char
-- alphabet. Uses only built-in md5() (no pgcrypto dependency).
UPDATE reservations r
SET code = 'AVP-' || (
  SELECT string_agg(
    substr(
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      1 + (('x' || substr(md5(r.id::text || '-' || gs::text || '-' || random()::text), gs * 2 - 1, 2))::bit(8)::int % 32),
      1
    ),
    '' ORDER BY gs
  )
  FROM generate_series(1, 6) gs
)
WHERE code IS NULL;

-- Enforce uniqueness (idempotent). If the backfill ever produced a collision,
-- this index creation fails loudly rather than silently corrupting the flow.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_code_key ON reservations (code);
```

### `apps/api/migrations/0039_reviews.sql` (WS-D)
```sql
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL UNIQUE REFERENCES reservations(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  display_name TEXT NOT NULL,               -- pre-masked at submission, e.g. "Marie T."
  stays_count INT NOT NULL,                 -- snapshot at submission
  nights_total INT NOT NULL,                -- snapshot at submission
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reviews_status_created_idx ON reviews (status, created_at DESC);
```

### `apps/api/migrations/0040_review_requests.sql` (WS-D)
```sql
CREATE TABLE IF NOT EXISTS review_requests (
  reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id),
  channel TEXT NOT NULL DEFAULT 'email',    -- future: 'sms'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No other schema changes. `blackout_dates` storage is unchanged (§4 expands to
existing per-day rows). Dashboard (§5) adds no schema.

## API Types

All requests are JSON over `/api/*`; admin routes require an authenticated
`role === 'admin'` user (inline `getAuthUser` + role check, existing pattern).
Public review routes are rate-limited via the existing `rateLimitAllow`
(`general:${ip}`, 30/15min, keyed on `cf-connecting-ip`).

### §4 Blackout ranges
```ts
// POST /api/admin/blackouts/range   (admin)
interface BlackoutRangeCreateBody {
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD", >= startDate, span <= 366 days
  roomsBlocked: number; // int >= 0
  note?: string | null;
}
interface BlackoutRangeCreateResponse { count: number; } // days upserted
// 400 { error } on bad dates / span > 366; span inclusive of both ends.

// DELETE /api/admin/blackouts/range?start=YYYY-MM-DD&end=YYYY-MM-DD   (admin)
interface BlackoutRangeDeleteResponse { deleted: number; }
```

### §5 Dashboard
```ts
// GET /api/admin/dashboard   (admin)
interface DashboardResponse {
  guestsThisWeek: number;   // sum(people) confirmed, overlapping current Mon–Sun week
  guestsLastWeek: number;   // sum(people) confirmed, overlapping previous Mon–Sun week
  next7Days: { date: string; available: number }[]; // today .. today+6
  occupancy: {
    currentMonth: number | null;      // ratio 0..1, null when denominator 0
    previousMonth: number | null;
    sameMonthLastYear: number | null;
  };
  returningCustomers: number; // distinct guests with >= 2 confirmed reservations
}
```

### §6 Reviews — public
```ts
// GET /api/reviews/eligibility?code=AVP-XXXXXX   (public, rate-limited)
interface EligibilityResponse {
  eligible: boolean;
  firstName?: string; // only when eligible
  reason?: string;    // generic when not eligible; never leaks reservation data
}

// POST /api/reviews   (public, rate-limited)
interface ReviewSubmitBody { code: string; rating: number; body: string; } // rating 1..5, body 10..2000 chars
interface ReviewSubmitResponse { ok: true; }
// 400 generic on invalid/ineligible code; 409 { error } on repeat (unique reservation_id)

// GET /api/reviews?limit=N   (public) — approved only, newest first, default limit 20, max 50
interface PublicReview {
  displayName: string; rating: number; body: string;
  staysCount: number; nightsTotal: number; createdAt: string;
}
interface PublicReviewsResponse { reviews: PublicReview[]; averageRating: number | null; total: number; }
```

### §6 Reviews — admin
```ts
// GET /api/admin/reviews?status=pending|approved|rejected|all   (admin), default pending
interface AdminReview {
  id: number; reservationId: number; reservationCode: string;
  rating: number; body: string; status: string;
  displayName: string; staysCount: number; nightsTotal: number;
  createdAt: string; moderatedAt: string | null;
}
interface AdminReviewsResponse { reviews: AdminReview[]; pendingCount: number; }

// PATCH /api/admin/reviews/:id   (admin)
interface ReviewModerateBody { status: 'approved' | 'rejected'; } // re-moderation allowed
interface ReviewModerateResponse { review: AdminReview; }
```

### §2/§6 Settings toggle (WS-A wiring)
Add `emailReviewRequestEnabled: boolean` to `AdminSettings` /
`SettingsUpdateSchema`; add `email_review_request_enabled: false` to
`SETTINGS_DEFAULTS`. Not added to `PUBLIC_SETTING_KEYS`.

## Implementation Steps

### Step 1 — WS-A settings toggle backend (self-contained)
- `apps/api/migrations/0037_settings_review_request_toggle.sql`: seed as above.
- `apps/api/src/settings.ts`: add `email_review_request_enabled: false` to
  `SETTINGS_DEFAULTS`; add `emailReviewRequestEnabled: z.preprocess(coerceBoolLoose, z.boolean())`
  to `SettingsUpdateSchema`. Admin GET/POST settings handlers already map every
  key generically — verify the new key round-trips.
- `apps/web/src/lib/api.ts`: add `emailReviewRequestEnabled: boolean` to the
  `AdminSettings` type.

### Step 2 — WS-A §1 tab-nav scrollbar
- `apps/web/src/routes/admin/+page.svelte`: on `.page-admin__tabs-inner` add
  `scrollbar-width: none;` and `&::-webkit-scrollbar { display: none; }`; keep
  `overflow-x: auto`. Add a `@media (max-width: 1280px)` rule reducing tab
  button horizontal padding so all tabs + the Courriels link fit without
  overflow at 1280/1024px. Do not change mobile scroll behavior.

### Step 3 — WS-A §3 shared Modal.svelte
- New `apps/web/src/lib/components/Modal.svelte`: slot-based `role="dialog"`
  `aria-modal="true"`, portaled to `<body>` (reuse the `portal` action),
  backdrop click-to-close, `Escape` closes, focus trap over visible focusable
  elements, focus-return to the previously focused element on close. Props:
  `open`, `onclose`, `title?`, `size?`; children slot. Extract this logic
  verbatim from `RoomAssignmentDrawer.svelte` (lines ~123–200).

### Step 4 — WS-A §3 refactor RoomAssignmentDrawer onto Modal
- `apps/web/src/lib/components/admin/RoomAssignmentDrawer.svelte`: replace its
  inline portal/backdrop/focus-trap/Escape with `<Modal>`; keep all existing
  props, behavior, and assignment logic identical. All existing
  `RoomAssignmentDrawer.test.ts` assertions must still pass.

### Step 5 — WS-A §3 compact reservations table + detail modal
- `apps/web/src/lib/components/admin/ReservationTableRow.svelte`: reduce visible
  columns to **Nom · Arrivée · Départ · Chambres · Statut · Actions**. Remove
  Courriel, Téléphone, Pers., Message from the row. Row is focusable
  (`tabindex="0"`, `role="button"`), `cursor: pointer`; click and Enter/Space
  emit an `onopen(row)` event. Confirmer/Annuler stay in the Actions cell and
  call `event.stopPropagation()` (and `stopPropagation` on keydown) so they
  never open the modal.
- New `apps/web/src/lib/components/admin/ReservationDetailModal.svelte`: built on
  `Modal.svelte`; shows reservation `code`, full name, email, phone, people,
  message, source + external_ref, created_at, status, and hosts the **Facture**
  panel (`InvoiceCreator`) and **Chambres** assignment (`RoomAssignmentDrawer`
  trigger) moved out of the row.
- `apps/web/src/routes/admin/+page.svelte`: wire row `onopen` → open the detail
  modal for the selected reservation.

### Step 6 — WS-A §2 Paramètres extraction/reorg
- New `apps/web/src/lib/components/admin/AdminParametresTab.svelte`: move the
  inline settings panel (`+page.svelte` ~723–1116) here as grouped cards in
  order — **Tarification & taxes** (nightlyPrice, weeklyPrice, tps, tvq,
  accommodationTax); **Coordonnées** (contactEmail, contactPhone);
  **Réservations** (reservationsEnabled, assignableRoomCount read-only);
  **Courriels automatiques** (the 4 existing toggles + new
  `emailReviewRequestEnabled`); **Sécurité** (current/new password with its own
  "Changer" button). One sticky save button submits all settings via
  `adminUpdateSettings`; password change stays a separate call. Every existing
  field behaves exactly as before.
- `apps/web/src/routes/admin/+page.svelte`: replace the inline settings panel
  with `<AdminParametresTab>`.

### Step 7 — WS-B §4 blackout range endpoints
- `apps/api/src/index.ts`: add `POST /api/admin/blackouts/range` (admin,
  `zValidator`): validate `startDate ≤ endDate` and span ≤ 366 days; expand to
  per-day rows with a single batched `INSERT ... SELECT generate_series(...)
  ... ON CONFLICT (date) DO UPDATE SET rooms_blocked=..., note=..., created_at=now()`;
  return `{ count }`. Add `DELETE /api/admin/blackouts/range?start=&end=`
  (admin): validate both dates, `DELETE FROM blackout_dates WHERE date BETWEEN
  start AND end`, return `{ deleted }`. Keep the existing single-day GET/PUT/DELETE
  endpoints untouched.

### Step 8 — WS-B §4 blackout range UI
- `apps/web/src/lib/api.ts`: add `adminCreateBlackoutRange(body)` and
  `adminDeleteBlackoutRange(start, end)`.
- `apps/web/src/lib/components/admin/AdminDisponibilitesTab.svelte`: the create
  form gains start-date and end-date pickers (end defaults to start); submit
  calls the range endpoint. The list groups consecutive days with identical
  `rooms_blocked` and `note` into one range row ("12 → 18 août · 12 chambres ·
  note") with a single delete calling the range delete. Grouping is display-only,
  computed client-side; single-day rows still render.

### Step 9 — WS-C §5 dashboard backend
- New `apps/api/src/dashboard.ts`: `computeDashboard(sql, env)` returning the
  `DashboardResponse`. Weeks are Monday–Sunday via `date_trunc('week', ...)`.
  Guest sums count confirmed reservations overlapping the week
  (`arrive < weekEnd AND depart > weekStart`, sum `people`). `next7Days` reuses
  `availabilityForRange(sql, today, today+7d, 1, assignableRoomCount)` mapping
  `nights → { date, available }`. Occupancy numerator = SUM over confirmed
  reservations of `COALESCE(room_count,1) * overlap_nights` within each period;
  denominator = `assignableRoomCount × nights_in_period`; ratio `null` when
  denominator is 0. currentMonth is month-to-date; previousMonth and
  sameMonthLastYear use the same day-span. `returningCustomers` = count of
  distinct `COALESCE(user_id::text, lower(email))` with ≥ 2 confirmed
  reservations.
- `apps/api/src/index.ts`: add `GET /api/admin/dashboard` (admin) → `computeDashboard`.

### Step 10 — WS-C §5 dashboard UI + default tab
- `apps/web/src/lib/api.ts`: add `adminDashboard()`.
- New `apps/web/src/lib/components/admin/AdminApercuTab.svelte`: stat cards
  (guests this week with vs-last-week delta; occupancy M/M and Y/Y as
  percentages with deltas, "—" when null; returning-customer count) + a 7-day
  availability strip (day, free-room count, visual bar). Cards wrap to one
  column on mobile (375px verified).
- `apps/web/src/routes/admin/+page.svelte`: add `"apercu"` to `activeTab`, make
  it the **default**; add the Aperçu tab first, Réservations second; render
  `<AdminApercuTab>`.

### Step 11 — WS-D §6a reservation code generation (JS inserts)
- New `apps/api/src/reservationCode.ts`: `generateReservationCode()` using
  `crypto.getRandomValues` over the 32-char alphabet →
  `'AVP-' + 6 chars`; `insertWithCode(sql, buildInsert)` helper that retries on
  unique-violation of `code` (few attempts).
- `apps/api/src/index.ts`: add `code` to the website-booking INSERT (~459) and
  the OTA-ingest INSERT (~600, `ON CONFLICT (source, external_ref) DO NOTHING`);
  generate via the helper with collision retry. Preserve existing dedupe behavior.

### Step 12 — WS-D §6 reviews backend helpers
- New `apps/api/src/reviews.ts`: `maskDisplayName(firstName, lastName, name)` →
  "Marie T." (fallback: first word of `name`); `computeStaySnapshot(sql, guestKey)`
  → `{ staysCount, nightsTotal }` from confirmed reservations with `depart ≤
  today` keyed by `user_id` else `lower(email)`; `reviewEligibility(sql, code)`;
  and query helpers for admin/public review lists.

### Step 13 — WS-D §6d/§6e/§6f review endpoints
- `apps/api/src/index.ts`:
  - `GET /api/reviews/eligibility?code=` (public, rate-limited) → generic on
    invalid/ineligible codes.
  - `POST /api/reviews` (public, rate-limited, `zValidator`): validate rating
    1–5 and body 10–2000; recompute eligibility; insert `pending` review with
    masked `display_name` + snapshot; 409 on unique conflict.
  - `GET /api/reviews?limit=` (public) → approved only + `averageRating`.
  - `GET /api/admin/reviews?status=` (admin) → list + `pendingCount`.
  - `PATCH /api/admin/reviews/:id` (admin) → set `status`, `moderated_at=now()`.

### Step 14 — WS-D §6c cron review-request pass
- `apps/api/src/emailOutbox.ts`: add
  `"review-request": "email_review_request_enabled"` to `EMAIL_TOGGLE_KEYS`.
- New `apps/api/src/reviewRequests.ts` (or in `emailOutbox.ts`):
  `enqueueReviewRequests(sql)` selects confirmed reservations with `depart`
  within the last 3 days, having an email, no `review_requests` row and no
  existing review; inserts `review_requests` then `enqueueEmail('review-request',
  …)` with `reviewUrl = ${SITE_ORIGIN}/avis/nouveau?code=<code>` and existing
  payload fields (firstName, checkIn, checkOut, roomLabel). Dedupe via the
  `review_requests` PK.
- `apps/api/src/index.ts` `scheduled`: call the review-request pass alongside
  `drainEmailOutbox` (both under `ctx.waitUntil`). Preserve the dual export.

### Step 15 — WS-D §6d public /avis/nouveau page
- `apps/web/src/lib/api.ts`: add `reviewEligibility(code)`, `submitReview(body)`,
  `getPublicReviews(limit?)`.
- New `apps/web/src/routes/avis/nouveau/+page.svelte`: reads `?code=`, calls
  eligibility, shows a 1–5 star picker + textarea, thanks screen on submit;
  generic error UI for invalid codes; works without login; responsive at 375px.

### Step 16 — WS-D §6e admin Avis tab
- New `apps/web/src/lib/components/admin/AdminAvisTab.svelte`: status filter
  (default pending), lists rating/body/displayName/stays·nights/code/date with
  Approuver/Rejeter actions (`PATCH /api/admin/reviews/:id`).
- `apps/web/src/lib/api.ts`: add `adminReviews(status?)`, `adminModerateReview(id, status)`.
- `apps/web/src/routes/admin/+page.svelte`: add `"avis"` to `activeTab`, tab
  after Disponibilités with a pending-count badge in the label.

### Step 17 — WS-D §6f public display (homepage strip + /avis + footer)
- New `apps/web/src/lib/components/ReviewsStrip.svelte`: up to 3 most-recent
  approved reviews (stars, excerpt, "Marie T. · 3 séjours · 12 nuits"); renders
  nothing when empty.
- `apps/web/src/routes/+page.svelte`: fetch `getPublicReviews(3)` and render
  `<ReviewsStrip>` (hidden when none).
- New `apps/web/src/routes/avis/+page.svelte`: all approved reviews newest-first
  with an average-rating header; responsive.
- `apps/web/src/lib/components/Footer.svelte`: add a `/avis` link.

### Step 18 — Tests (per spec §"Error handling & testing")
- `apps/api/test`: reservation code generation/backfill uniqueness; blackout
  range expansion + span validation; dashboard aggregates on fixtures
  (null-safe occupancy); review eligibility rules; masking; stays/nights
  snapshot math; moderation transitions; cron request-window dedupe; settings
  toggle round-trip. Use the existing recorder-based Neon stub.
- `apps/web`: extend `AdminDisponibilitesTab.test.ts` for range grouping
  (adjacent vs. overlapping); `Modal.svelte` focus-trap/Escape/focus-return;
  `ReservationTableRow` compact columns + action `stopPropagation` + row-open;
  `AdminParametresTab` cards + single save; `AdminApercuTab` "—" rendering;
  `AdminAvisTab` approve/reject; `ReviewsStrip` hidden-when-empty; avis pages.
- Verify narrow-viewport (375px) behavior for every touched screen.

## Acceptance Criteria

1. The `.page-admin__tabs-inner` element renders no visible scrollbar (has
   `scrollbar-width: none` and a `::-webkit-scrollbar { display:none }` rule)
   and the full tab row + Courriels link fits without horizontal overflow at
   1280px and 1024px; it remains horizontally scrollable at 375px.
2. `GET /api/admin/settings` and `POST /api/admin/settings` round-trip
   `emailReviewRequestEnabled`; it is absent from `GET /api/settings` (public).
   Migration 0037 is idempotent (re-running the runner is a no-op).
3. `AdminParametresTab.svelte` renders exactly five grouped cards in the
   specified order; one save button persists all settings via
   `adminUpdateSettings`; the password change uses a separate button/call; all
   existing settings tests remain green.
4. `Modal.svelte` exists, is portaled to `<body>` with `role="dialog"`
   `aria-modal="true"`, traps Tab focus, closes on Escape and backdrop click,
   and returns focus to the previously focused element on close.
   `RoomAssignmentDrawer` uses `Modal` and its existing tests pass.
5. The reservations table shows only Nom·Arrivée·Départ·Chambres·Statut·Actions.
   Clicking a row (or Enter/Space on the focused row) opens the detail modal
   containing the reservation code, removed fields, Facture panel, and Chambres
   assignment. Clicking Confirmer or Annuler does **not** open the modal
   (`stopPropagation`), and the status change still fires.
6. `POST /api/admin/blackouts/range` with `{startDate,endDate,roomsBlocked,note}`
   creates one `blackout_dates` row per inclusive day and returns `{count}`
   equal to the span length; `startDate>endDate` or span >366 returns 400;
   `DELETE /api/admin/blackouts/range?start=&end=` removes exactly those rows and
   returns `{deleted}`. The existing single-day GET/PUT/DELETE endpoints behave
   unchanged and availability math is unaffected.
7. The AdminDisponibilitesTab list groups consecutive days with identical
   `rooms_blocked` and `note` into a single range row and renders non-consecutive
   or differing days as separate rows; a range row's delete calls the range
   delete endpoint.
8. `GET /api/admin/dashboard` (admin only; 401/403 otherwise) returns
   `guestsThisWeek`, `guestsLastWeek` (sum of `people` over confirmed
   reservations overlapping the respective Monday–Sunday week), `next7Days` as 7
   `{date, available}` entries from today, `occupancy` with three ratios that are
   `null` when the denominator is 0, and `returningCustomers` = count of distinct
   guests (keyed `user_id` else `lower(email)`) with ≥2 confirmed reservations.
9. The Aperçu tab is the default `activeTab`, renders the stat cards and 7-day
   strip, shows "—" for null occupancy, and wraps to a single column at 375px;
   Réservations is the second tab.
10. Every reservation row (existing backfilled + new website + new OTA insert)
    has a unique `code` matching `^AVP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`;
    the `reservations_code_key` unique index exists. Migration 0038 is idempotent.
11. `GET /api/reviews/eligibility?code=` returns `{eligible:true, firstName}` for
    a valid, departed, non-cancelled, un-reviewed code and a generic
    `{eligible:false, reason}` (no reservation data) otherwise.
    `POST /api/reviews` with valid `{code,rating(1–5),body(10–2000)}` creates a
    `pending` review with a masked `display_name` ("Marie T.") and snapshot
    `stays_count`/`nights_total`; a repeat submission for the same reservation
    returns 409.
12. `GET /api/admin/reviews` (admin) lists reviews filtered by `status`
    (default pending) with a `pendingCount`; `PATCH /api/admin/reviews/:id`
    with `{status:'approved'|'rejected'}` updates status and `moderated_at`, and
    permits re-moderation.
13. With `email_review_request_enabled` true, the `scheduled` handler enqueues a
    `review-request` email (via `enqueueEmail`) for each confirmed reservation
    departed within the last 3 days that has an email, no `review_requests` row,
    and no existing review; it inserts a `review_requests` row and does not
    re-enqueue on a subsequent run (dedupe). With the toggle false, none are
    enqueued. The email link is `${SITE_ORIGIN}/avis/nouveau?code=<code>`.
14. `GET /api/reviews` returns only approved reviews (newest first) with
    `averageRating`; the homepage renders `ReviewsStrip` with ≤3 reviews and
    renders nothing when there are none; `/avis` lists all approved reviews with
    an average-rating header and is linked from the footer.
15. `npm run typecheck` passes across all workspaces; all pre-existing and new
    `apps/api` and `apps/web` Vitest suites pass; the `apps/api/src/index.ts`
    default export still exposes both `fetch` and `scheduled`, and `export { app }`
    remains for tests.
