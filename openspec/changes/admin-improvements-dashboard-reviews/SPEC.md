# Admin & Product Improvements — Tasks 2–6 (Paramètres, Ranges, Dashboard, Reviews)

## Task

Finish an in-flight feature batch on the Site-web monorepo (Svelte 5 SPA +
Hono/Cloudflare Workers API + Neon Postgres). **Task 1 is already landed and
green** (shared `Modal.svelte`, compact reservations table, `ReservationDetailModal`,
commits `70d9ab1`+`009d8ba`, 86 tests). This plan covers **Tasks 2–6**, which are
mostly **audit-and-fix of unverified draft code** left by salvage commit `e04b520`,
plus genuinely net-new Task 2 work and the missing admin-tab integration for the new
Aperçu and Avis tabs.

Authoritative source: `docs/superpowers/specs/2026-07-18-admin-improvements-design.md`
(§1–6) and its task breakdown
`docs/superpowers/plans/2026-07-18-admin-improvements-plan.md`.

**Verified starting state (grounded in the working tree):**

- The review-request toggle is **already wired on the API side**: `settings.ts`
  `SettingsUpdateSchema` already contains the full expanded field set including
  `emailReviewRequestEnabled`; migration `0037_settings_review_request_toggle.sql`
  seeds `email_review_request_enabled`. The API `settings.test.ts` has **11 failures**
  because the test *fixtures* omit now-required fields — fixture drift, not a schema
  bug. **Do not re-add the toggle API.**
- Migrations `0037–0040` and API modules `dashboard.ts`, `reviews.ts`,
  `reviewRequests.ts`, `reservationCode.ts` exist as drafts; blackout-range, dashboard,
  and review endpoints are drafted in `index.ts`.
- `AdminApercuTab.svelte` and `AdminAvisTab.svelte` exist but are **not referenced** in
  `admin/+page.svelte`; the `activeTab` union (lines 34–42) lacks `apercu`/`avis` and
  defaults to `"reservations"`.
- `AdminDisponibilitesTab.svelte` range rewrite exists with **4 failing tests** and 2
  Svelte warnings (`a11y_no_noninteractive_tabindex` ~line 270; `state_referenced_locally`
  on `assignableRoomCount` ~line 36).
- **11 web typecheck ERRORs**, all in test files: `AdminAvisTab.test.ts`,
  `page-avis.test.ts`, `page-avis-nouveau.test.ts` (unused bindings; `find`-on-tuple
  overload; possibly-undefined narrowing).

Do **not** regenerate drafts from scratch, do **not** renumber migrations, do **not**
regress the green Task-1 suites, do **not** touch the HubSpot outbox ("File HubSpot")
tab. Preserve the `index.ts` dual export (`export default { fetch, scheduled }` and
`export { app }`).

**Final gate:** whole-repo `npm run typecheck` clean and every Vitest suite green.

## Schema Changes

All four migrations already exist as drafts (numbered `0037–0040`). This task **audits
them for idempotency and correctness** — it does not add new numbers or renumber.

- **`0037_settings_review_request_toggle.sql`** — seed
  `('email_review_request_enabled', 'false')` via idempotent
  `INSERT … ON CONFLICT (key) DO NOTHING` (must not overwrite an existing value).
- **`0038_reservations_code.sql`** — `ALTER TABLE reservations ADD COLUMN IF NOT
  EXISTS code TEXT`; SQL-side backfill of existing rows with `AVP-` + 6 chars Crockford
  base32 (alphabet excludes ambiguous `0 1 I O`), **before** the unique index is
  created; `CREATE UNIQUE INDEX IF NOT EXISTS reservations_code_key ON reservations(code)`.
- **`0039_reviews.sql`** — `CREATE TABLE IF NOT EXISTS reviews` per spec §6b:
  `id` identity PK, `reservation_id BIGINT NOT NULL UNIQUE REFERENCES reservations(id)`,
  `rating INT CHECK (rating BETWEEN 1 AND 5)`, `body TEXT NOT NULL`,
  `status TEXT NOT NULL DEFAULT 'pending'`, `display_name TEXT NOT NULL`,
  `stays_count INT NOT NULL`, `nights_total INT NOT NULL`,
  `created_at TIMESTAMPTZ DEFAULT now()`, `moderated_at TIMESTAMPTZ`;
  `CREATE INDEX IF NOT EXISTS` on `(status, created_at DESC)`.
- **`0040_review_requests.sql`** — `CREATE TABLE IF NOT EXISTS review_requests`:
  `reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id)`,
  `channel TEXT NOT NULL DEFAULT 'email'`, `sent_at TIMESTAMPTZ DEFAULT now()`.

Invariants: one review per reservation (`UNIQUE(reservation_id)`); one request per
reservation (PK); reservation `code` globally unique. No dashboard/blackout schema
change — §4 expands into existing per-day `blackout_dates` rows; §5 is pure aggregate
SQL.

## API Types

Verify the drafted client/server contracts match these shapes (camelCase over HTTP;
client fns live in `apps/web/src/lib/api.ts`). Admin routes: inline `getAuthUser` +
`role === 'admin'`. Public review routes: `rateLimitAllow`.

```ts
// Settings — already implemented; fixtures must match this EXACT set (Step 1)
type AdminSettings = {
  nightlyPrice: number; weeklyPrice: number;
  contactEmail: string; contactPhone: string;
  tps: number; tvq: number; accommodationTax: number;
  assignableRoomCount: number;               // read-only, server-derived
  reservationsEnabled: boolean;
  emailConfirmationEnabled: boolean; emailPasswordResetEnabled: boolean;
  emailRoomAssignmentEnabled: boolean; emailWelcomeEnabled: boolean;
  emailReviewRequestEnabled: boolean;        // the new toggle (already in schema)
};

// Blackout ranges (§4)
// POST   /api/admin/blackouts/range  { startDate, endDate, roomsBlocked, note }
//   Validation: valid ISO dates, startDate <= endDate, span <= 366 days -> 400 otherwise
// DELETE /api/admin/blackouts/range?start=YYYY-MM-DD&end=YYYY-MM-DD

// Dashboard (§5) — GET /api/admin/dashboard
type AdminDashboard = {
  guestsThisWeek: number; guestsLastWeek: number;
  next7Days: { date: string; available: number }[];
  occupancy: { currentMonth: number | null; previousMonth: number | null; sameMonthLastYear: number | null };
  returningCustomers: number;
};

// Reviews (§6)
// GET   /api/reviews/eligibility?code=…  -> { eligible: boolean; firstName?: string; reason?: string }
// POST  /api/reviews  { code; rating: 1..5; body: string(10..2000) } -> 201 | 409 on repeat
// GET   /api/reviews?limit=…  -> approved only, public shape:
type PublicReview = { displayName: string; rating: number; body: string; staysCount: number; nightsTotal: number; createdAt: string };
// GET   /api/admin/reviews?status=pending|approved|rejected  -> admin shape (+ reservation code)
// PATCH /api/admin/reviews/:id  { status: 'approved' | 'rejected' } -> updated review
```

Error contracts: generic responses for invalid review codes (no data leak); `409` on
duplicate review submission; occupancy `null` when denominator 0 (UI renders "—");
range endpoints `400` on invalid/inverted/over-span dates.

## Component Hierarchy

```
admin/+page.svelte  (tab shell — activeTab union + tablist + render blocks)
├─ AdminApercuTab.svelte        [WIRE: new FIRST tab, default landing]
│    stat cards + 7-day availability strip ; adminDashboard()
├─ (Réservations — existing, now 2nd)
├─ AdminParametresTab.svelte    [NET-NEW: extract inline settings panel]
│    cards: Tarification & taxes / Coordonnées / Réservations /
│           Courriels automatiques (+emailReviewRequestEnabled) / Sécurité
│    one sticky save button ; password change keeps its own button
├─ AdminDisponibilitesTab.svelte [FIX: range pickers + grouped range rows]
├─ AdminAvisTab.svelte          [WIRE: tab after Disponibilités + pending badge]
│    status filter (default pending) ; Approuver / Rejeter
└─ (rooms / users / emails-ota — existing, untouched)

Public:
routes/+page.svelte  → ReviewsStrip.svelte   (≤3 approved, hidden when empty)
routes/avis/+page.svelte          (all approved newest-first, avg header)
routes/avis/nouveau/+page.svelte  (eligibility → star picker + textarea → thanks)
components/Footer.svelte          (link to /avis)
```

## Implementation Steps

### Step 1 — `apps/api/test/settings.test.ts` (fix 11 fixture failures)

Confirm `SettingsUpdateSchema` is the intended source of truth (it is — it matches spec
§2/§6: positive-int prices, `contactPhone` required, taxes `>= 0`, `reservationsEnabled`
boolean, five email toggles). Update every failing fixture payload and every GET-endpoint
expectation to include the full field set:
`nightlyPrice, weeklyPrice, contactEmail, contactPhone, tps, tvq, accommodationTax,
assignableRoomCount, reservationsEnabled, emailConfirmationEnabled,
emailPasswordResetEnabled, emailRoomAssignmentEnabled, emailWelcomeEnabled,
emailReviewRequestEnabled`. Do not weaken the schema. Drive `settings.test.ts` to 46/46.

### Step 2 — `apps/web/src/routes/admin/+page.svelte` (tab-nav scrollbar, §1)

On `.page-admin__tabs-inner` (CSS ~line 1306): keep `overflow-x: auto`; add
`scrollbar-width: none;` and a `.page-admin__tabs-inner::-webkit-scrollbar { display:
none; }` rule. Add a `@media (max-width: 1280px)` block reducing tab horizontal padding
so the full row (Aperçu · Réservations · … · Avis + Courriels link) fits without
overflow at 1280 and 1024px. Preserve mobile scrollability and 44px min touch targets at
375px.

### Step 3 — `apps/web/src/lib/components/admin/AdminParametresTab.svelte` (NET-NEW, §2)

Create the component. Extract the inline settings panel (the `activeTab === "settings"`
block, ≈ lines 722–1116 of `+page.svelte`) into grouped visual cards in this order:
**Tarification & taxes** (nightlyPrice, weeklyPrice, tps, tvq, accommodationTax) ·
**Coordonnées** (contactEmail, contactPhone) · **Réservations** (reservationsEnabled
toggle, read-only derived assignableRoomCount) · **Courriels automatiques** (the 4
existing toggles + `emailReviewRequestEnabled`) · **Sécurité** (current + new password
with its own "Changer" button). ONE sticky save button submits all settings via the
existing `adminUpdateSettings`; the password change stays a separate call. Preserve every
existing field's exact validation, behavior, and success/error messaging. French copy
matching existing admin style. Responsive: cards stack to one column at 375px.

### Step 4 — `apps/web/src/routes/admin/+page.svelte` (settings extraction wiring)

Replace the inline settings markup with `<AdminParametresTab … />`, passing the props/
state it needs (settings values, save handler, password handler). Remove the now-dead
inline markup and any now-unused local state. Keep behavior identical.

### Step 5 — `apps/web/src/lib/components/admin/AdminApercuTab.svelte` + wiring (§5)

Audit the drafted component against spec §5. Wire it into `+page.svelte`: add `"apercu"`
to the `activeTab` union as the **first** option and set it as the **default**
(`$state<…>("apercu")`); add the tab button as the **first** tab ("Aperçu"); add its
render block; move Réservations to second. Render stat cards (this-week guests + vs-last-week
delta; occupancy current-month/previous-month/same-month-last-year as percentages;
returning-customer count) and a 7-day availability strip (day, free rooms, visual bar).
Null occupancy ratios render "—". Fully responsive (cards → single column at 375px).
Add/confirm `adminDashboard()` in `api.ts`.

### Step 6 — `apps/api/src/dashboard.ts` + `GET /api/admin/dashboard` (§5, audit)

Verify the aggregate SQL/logic matches spec §5: `guestsThisWeek`/`guestsLastWeek` = sum
of `people` over **confirmed** reservations overlapping the Mon–Sun week (overlap = any
night in the week); `next7Days` via existing `availabilityForRange` (today→+6);
`occupancy` = confirmed occupied room-nights ÷ (assignableRoomCount × nights), current
month **month-to-date**, comparison periods over the same day-span, `null` when
denominator 0; `returningCustomers` = distinct guests (`user_id` else `lower(email)`)
with ≥2 confirmed reservations. Confirm the endpoint is admin-gated (inline `getAuthUser`
+ `role === 'admin'`). Fix `dashboard.test.ts` to assert overlap edges, zero-denominator
→ null, and email-vs-user_id keying.

### Step 7 — `apps/api/src/index.ts` blackout-range endpoints (§4, audit)

Verify `POST /api/admin/blackouts/range` (~line 2362; body `{ startDate, endDate,
roomsBlocked, note }`) validates ISO dates, `startDate ≤ endDate`, span ≤ 366 days, then
expands to per-day `INSERT … ON CONFLICT (date) DO UPDATE` upserts in one batched
statement; and `DELETE /api/admin/blackouts/range?start=…&end=…` (~line 2397) deletes all
rows in span with the same validation. Existing single-day `PUT`/`DELETE
/api/admin/blackouts/:date` remain untouched. Both admin-gated.

### Step 8 — `apps/web/src/lib/components/admin/AdminDisponibilitesTab.svelte` (§4, fix)

Fix the 4 failing `AdminDisponibilitesTab.test.ts` tests and the 2 Svelte warnings: the
`a11y_no_noninteractive_tabindex` (~line 270 — give the element an interactive role or
drop the tabindex) and `state_referenced_locally` on `assignableRoomCount` (~line 36 —
wrap in `$derived`/closure). Form has start + end date pickers (end defaults to start ⇒
single day = one action) calling `adminUpsertBlackoutRange`; the list groups
**consecutive** days with identical `rooms_blocked` **and** `note` into one range row with
a single range delete (`adminDeleteBlackoutRange`). Grouping is client-side display only.
Add the two client fns to `api.ts` if missing.

### Step 9 — `apps/api` reviews backend audit (§6a–c, §6e/§6f API)

Audit and fix to spec:
- `reservationCode.ts`: `AVP-` + 6-char Crockford base32 (exclude `0 1 I O`),
  `crypto.getRandomValues`, retry-on-collision. Confirm the code is generated at **both**
  insert sites — website booking (`index.ts`) and OTA ingest — not just one.
- `reviews.ts` / endpoints in `index.ts`: `GET /api/reviews/eligibility?code` (valid code
  + departed + not cancelled + no existing review; **generic** responses for invalid
  codes; `rateLimitAllow`); `POST /api/reviews` (`rating` 1–5, `body` 10–2000; server-side
  `display_name` masking "Marie T." with first-word-of-`name` fallback; snapshot
  `stays_count`/`nights_total` from confirmed departed stays keyed by `user_id` else
  `lower(email)`; `409` on repeat via unique constraint); `GET /api/reviews?limit`
  (approved only, public shape); `GET /api/admin/reviews?status` and
  `PATCH /api/admin/reviews/:id { status }` (admin-gated, re-moderation allowed).
- `emailOutbox.ts`: confirm `EMAIL_TOGGLE_KEYS` maps
  `review-request → email_review_request_enabled`.
- `scheduled` handler: a review-request pass runs **before** `drainEmailOutbox` —
  confirmed reservations departed within last 3 days, has email, no `review_requests` row,
  no review → insert `review_requests` + `enqueueEmail('review-request', …)` with link
  `${SITE_ORIGIN}/avis/nouveau?code=<code>`.
Fix/extend the API vitest suites (code gen + backfill idempotency, eligibility rules,
masking, snapshot multi-stay math, moderation transitions, cron dedupe, 409 repeat).

### Step 10 — reviews frontend audit + Avis tab wiring (§6d–f)

- Audit `routes/avis/nouveau/+page.svelte` (eligibility-on-load, 1–5 star picker,
  textarea 10–2000, thanks screen, generic error state, no login), `routes/avis/+page.svelte`
  (approved newest-first + average-rating header), `ReviewsStrip.svelte` (≤3 approved,
  hidden when empty) on the homepage, and the `Footer.svelte` `/avis` link.
- Wire `AdminAvisTab.svelte` into `+page.svelte`: add `"avis"` to the `activeTab` union,
  tab button **after Disponibilités** with a **pending-count badge** in the label, render
  block; status filter defaults to `pending`; Approuver/Rejeter call `adminModerateReview`
  and refresh the badge count.
- Add/confirm client fns in `api.ts`: `reviewEligibility`, `submitReview`, `publicReviews`,
  `adminReviews`, `adminModerateReview`.

### Step 11 — Typecheck-error fixes + full gate

Fix the 11 web typecheck errors in `AdminAvisTab.test.ts`, `page-avis.test.ts`,
`page-avis-nouveau.test.ts` (remove unused `url`/`waitFor` bindings; fix the `find`-on-
tuple overload — type the destructured pair or use an index signature; narrow
possibly-undefined `patchCall`/`lastCall` with guards). Then run whole-repo
`npm run typecheck` and all Vitest suites; drive every failure to zero without regressing
Task-1 suites (Modal, ReservationTableRow, ReservationDetailModal, RoomAssignmentDrawer,
page-admin). Optional polish: `dialogTestid` override to avoid duplicate `data-testid`
when modals stack.

## Acceptance Criteria

1. `npm run typecheck` at repo root exits 0 with no ERROR lines; the 2
   AdminDisponibilitesTab warnings and all 11 review-test ERRORs are gone (unrelated
   pre-existing warnings from other files may remain).
2. `cd apps/api && npx vitest run test/settings.test.ts` reports 46 passed, 0 failed.
3. `npx vitest run` in both `apps/web` and `apps/api` reports every suite passing,
   including the Task-1 suites (Modal, ReservationTableRow, ReservationDetailModal,
   RoomAssignmentDrawer, page-admin) still green.
4. `AdminParametresTab.svelte` exists; the admin Paramètres tab renders five grouped cards
   in the specified order with ONE save button; the password card has its own "Changer"
   button; saving submits all settings and the `emailReviewRequestEnabled` toggle
   round-trips (POST then GET reflects the value); it is absent from public `GET /api/settings`.
5. In `admin/+page.svelte`, `activeTab` defaults to `"apercu"`; the tab row shows Aperçu
   (first) · Réservations · … · Disponibilités · Avis · … ; the Avis tab label shows a
   pending-count badge that decreases after Approuver/Rejeter.
6. `.page-admin__tabs-inner` shows no visible scrollbar at ≥1024px yet remains
   horizontally scrollable at 375px; the full tab row fits without overflow at 1280px and
   1024px.
7. `GET /api/admin/dashboard` returns `guestsThisWeek`, `guestsLastWeek`, `next7Days`
   (7 entries), `occupancy {currentMonth, previousMonth, sameMonthLastYear}`,
   `returningCustomers`; occupancy fields are `null` when the denominator is 0 and the
   Aperçu tab renders "—" for them; it is admin-gated (401/403 otherwise).
8. `POST /api/admin/blackouts/range` with `startDate > endDate` or span > 366 days returns
   400; a valid 3-day range creates 3 per-day rows; the Disponibilités list groups 3
   consecutive identical days into one range row deletable in one action; the single-day
   PUT/DELETE endpoints still work and availability math is unaffected.
9. Every existing reservation has a unique `code` matching
   `^AVP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` after migration; new reservations from
   both website booking and OTA ingest receive a code at insert; migration 0038 is
   idempotent.
10. `GET /api/reviews/eligibility?code=<invalid>` returns a generic ineligible response
    with no reservation data; `POST /api/reviews` twice for the same code returns 409 the
    second time; `display_name` is stored masked ("Marie T.").
11. `GET /api/reviews` returns only approved reviews (newest first) in the public shape
    with an `averageRating`; the homepage strip shows ≤3 approved reviews and is entirely
    hidden when none exist; `/avis` lists approved reviews newest-first with an
    average-rating header; the footer links to `/avis`.
12. `/avis/nouveau?code=…` (no login) validates eligibility on load, submits a 1–5 star +
    textarea (10–2000 chars) review, and shows a thanks screen; invalid/ineligible codes
    show a generic error state.
13. With `email_review_request_enabled` true, the `scheduled` handler enqueues a
    `review-request` email for each confirmed reservation departed within the last 3 days
    that has an email, no `review_requests` row, and no review; it inserts a
    `review_requests` row and does not re-enqueue on a subsequent run; with the toggle
    false, none are enqueued.
14. All touched screens (Paramètres cards, Aperçu, Avis admin tab, `/avis`, `/avis/nouveau`)
    are usable at 375px width.
15. The HubSpot outbox tab and migration numbering (0037–0040) are unchanged; the
    `index.ts` default export still exposes both `fetch` and `scheduled`, and
    `export { app }` remains.
