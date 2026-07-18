# Admin & Product Improvements — Design Spec

**Date:** 2026-07-18
**Status:** Approved by operator (design review 2026-07-18)
**Delivery:** Orchestrator pipeline, split into independent work streams.

Six improvements to the Site-web admin area and public site: tab-nav scrollbar
fix, Paramètres UX reorg, compact reservations table with detail modal,
blocked-date ranges, an admin dashboard, and a moderated guest-review system.

---

## Context (as-built facts this design relies on)

- `apps/web/src/routes/admin/+page.svelte` is a ~1900-line monolith; the
  reservations, outbox (File HubSpot) and settings panels are inline; rooms,
  users, disponibilités and emails-ota are extracted components under
  `$lib/components/admin/`.
- Tab nav: `.page-admin__tabs-inner` uses `flex-wrap: nowrap; overflow-x: auto`
  → visible horizontal scrollbar (the reported bug). "Courriels" is a separate
  `<a>` link, not a tab.
- `blackout_dates` table: `date DATE PRIMARY KEY, rooms_blocked INT, note TEXT`
  — one row per day. API: `GET /api/admin/blackouts`,
  `PUT /api/admin/blackouts/:date` (upsert), `DELETE /api/admin/blackouts/:date`.
  Availability math in `apps/api/src/availability.ts` reads per-day rows.
- `reservations` has **no human-facing reservation number** — only internal
  `id` and OTA-only `external_ref`. Columns include `name, first_name,
  last_name, email, phone, arrive, depart, people, room_count, message, source,
  external_ref, status (pending|confirmed|cancelled), user_id, created_at`.
- Email: `email_outbox` table drained by the API worker cron via Resend;
  `enqueueEmail()` gates each template on a `settings` toggle unless in
  `ALWAYS_SEND`. A bilingual `review-request` template already exists in
  `apps/api/src/emails/templates.ts` but is never enqueued.
- No SMS integration exists. No dashboard/stats queries exist. No reusable
  modal component exists — `RoomAssignmentDrawer.svelte` contains the reference
  portal/backdrop/focus-trap/Escape implementation.

## Decisions taken with the operator

1. Review requests: **email only** for now (Resend outbox); schema keeps a
   `channel` column so SMS can be added later without rework.
2. Approved reviews display on a **homepage strip + dedicated `/avis` page**.
3. The new dashboard tab ("Aperçu") becomes the **default landing tab** of
   `/admin`; Réservations moves to second.
4. Paramètres reorg: **grouped cards with a single save button** (no sub-tabs);
   password change keeps its own button.

---

## 1. Tab-nav scrollbar fix

Keep `overflow-x: auto` (still needed on mobile) but hide the scrollbar:
`scrollbar-width: none` (Firefox) + `::-webkit-scrollbar { display: none }`
on `.page-admin__tabs-inner`. Reduce tab padding at ≤1280px so the full row
(8 tabs + Courriels link after the dashboard lands) fits without overflow on
desktop. Verify at 1280px, 1024px and 375px widths.

## 2. Paramètres tab — grouped cards, one save

Extract the inline settings panel into
`$lib/components/admin/AdminParametresTab.svelte`. Layout: visual cards, in
order:

| Card | Fields |
|---|---|
| Tarification & taxes | nightlyPrice, weeklyPrice, tps, tvq, accommodationTax |
| Coordonnées | contactEmail, contactPhone |
| Réservations | reservationsEnabled toggle, assignableRoomCount (read-only, derived) |
| Courriels automatiques | 4 existing toggles + new `emailReviewRequestEnabled` |
| Sécurité | current + new password, its own "Changer" button |

One save button (sticky on scroll) submits all settings via the existing
`adminUpdateSettings`; password change stays a separate call. No API changes
except the new toggle key (see §6). Behavior of every existing field is
unchanged.

## 3. Compact reservations table + detail modal

**Shared component first:** extract the portal/backdrop/focus-trap/Escape/
focus-return logic from `RoomAssignmentDrawer.svelte` into
`$lib/components/Modal.svelte` (slot-based, `role="dialog"`, portaled to
`<body>`). `RoomAssignmentDrawer` is refactored to use it.

**Table** (`ReservationTableRow.svelte`): columns reduced to
**Nom · Arrivée · Départ · Chambres · Statut · Actions**. Removed from the
table: Courriel, Téléphone, Pers., Message.

**Row click** opens the detail modal showing: reservation code (§6), full
name, email, phone, people, message, source + external_ref, created_at, status
— plus the **Facture** panel (`InvoiceCreator`) and **Chambres** assignment
(the drawer trigger) which move out of the row into the modal.

**Actions stay clickable at all times:** the Confirmer/Annuler buttons remain
in the row's Actions cell and call `event.stopPropagation()` so they never
open the modal. Row gets `cursor: pointer` and keyboard access
(Enter/Space opens modal; the row is focusable).

## 4. Blocked-date ranges

Storage stays one-row-per-day (availability logic untouched).

- **API:** new `POST /api/admin/blackouts/range` with body
  `{ startDate, endDate, roomsBlocked, note }`. Validates
  `startDate ≤ endDate`, span ≤ 366 days; expands to per-day upserts in one
  batched statement (`INSERT … ON CONFLICT (date) DO UPDATE`). New
  `DELETE /api/admin/blackouts/range?start=…&end=…` deletes all rows in the
  span. Existing single-day endpoints remain.
- **UI** (`AdminDisponibilitesTab.svelte`): the form gets start-date and
  end-date pickers (end defaults to start for a single day). The list groups
  consecutive days with identical `rooms_blocked` and `note` into one range
  row ("12 → 18 août · 12 chambres · note") with a single delete (calls the
  range delete). Grouping is display-only, computed client-side.

## 5. Admin dashboard — "Aperçu" (new default tab)

**API:** `GET /api/admin/dashboard` (admin-gated) returns one JSON payload:

- `guestsThisWeek`, `guestsLastWeek` — sum of `people` over **confirmed**
  reservations overlapping each Monday–Sunday week (overlap = any night of the
  stay falls in the week).
- `next7Days` — array of `{ date, available }` from the existing
  `availabilityForRange` (today → today+6).
- `occupancy` — `{ currentMonth, previousMonth, sameMonthLastYear }`, each a
  ratio: confirmed occupied room-nights ÷ (assignableRoomCount × nights in
  period), current month computed month-to-date, comparison periods computed
  over the same day-span. Ratio is null when the denominator is 0.
- `returningCustomers` — count of distinct guests (keyed by `user_id` when
  set, else `lower(email)`) with ≥ 2 confirmed reservations, all-time.

All computed in a handful of SQL aggregates; no schema change; no caching
(admin-only, low traffic).

**UI:** new `AdminApercuTab.svelte`, default `activeTab`. Stat cards
(this-week guests with vs-last-week delta, occupancy M/M and Y/Y as
percentages with deltas, returning-customer count) + a 7-day availability
strip (day, free-room count, visual bar). Fully responsive: cards wrap to a
single column on mobile.

## 6. Guest reviews with moderation

### 6a. Prerequisite — human-facing reservation code

Migration adds `code TEXT UNIQUE` to `reservations`: format
`AVP-XXXXXX` where `XXXXXX` is 6 chars of crockford-base32 (no 0/O/1/I),
generated server-side with retry-on-collision. Backfill all existing rows in
the same migration (SQL-side generation). New reservations (website + OTA
ingest) get a code at insert. The code appears in the admin detail modal (§3)
and keys the review flow. It is added to reservation-confirmation email
payloads where convenient but that is not a hard requirement of this spec.

### 6b. Data model

```sql
CREATE TABLE reviews (
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

CREATE TABLE review_requests (
  reservation_id BIGINT PRIMARY KEY REFERENCES reservations(id),
  channel TEXT NOT NULL DEFAULT 'email',    -- future: 'sms'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`UNIQUE(reservation_id)` enforces one review per stay. `stays_count` /
`nights_total` are computed at submission time (guest keyed by the
reservation's `user_id`, else `lower(email)`): number of confirmed
reservations with `depart ≤ today`, and total nights across them — this
accounts for multiple stays. Masking (`display_name`) is applied server-side
at submission: first name + last-initial ("Marie T."); fallback to the
first word of `name`. Raw guest identity is never exposed publicly.

### 6c. Request flow (email, cron-driven)

In the existing worker `scheduled` handler: select confirmed reservations
whose `depart` is in the past N days window (N = 3, so a downed cron catches
up) with an email, no row in `review_requests`, and no existing review. For
each: insert into `review_requests` then `enqueueEmail()` with the existing
`review-request` template, gated by new settings toggle
`email_review_request_enabled` (default `'false'`, exposed in Paramètres §2).
The template's link is `https://<site>/avis/nouveau?code=<code>`.

### 6d. Submission (public)

- `GET /api/reviews/eligibility?code=…` → `{ eligible, firstName?, reason? }`
  (valid code, stay departed, not cancelled, no existing review). Rate-limited
  like other public endpoints; responses for invalid codes are generic (no
  reservation-data leak).
- `POST /api/reviews` `{ code, rating, body }` → creates the `pending` review,
  computing snapshot fields. Body length 10–2000 chars.
- **Page** `/avis/nouveau?code=…`: validates eligibility, shows a 1–5 star
  picker + textarea, thanks screen on submit. Works without login.

### 6e. Moderation (admin)

New admin tab **Avis** (after Disponibilités) with a pending-count badge in
the tab label. Lists reviews by status filter (default: pending) showing
rating, body, display_name, stays/nights, reservation code, date.
Actions: Approuver / Rejeter (`PATCH /api/admin/reviews/:id` with
`{status}`); re-moderation allowed (approved ↔ rejected).

### 6f. Public display

- `GET /api/reviews?limit=…` → approved reviews only:
  `{ displayName, rating, body, staysCount, nightsTotal, createdAt }`.
- **Homepage strip**: up to 3 most recent approved reviews (stars, excerpt,
  "Marie T. · 3 séjours · 12 nuits"); hidden entirely when none.
- **`/avis` page**: all approved reviews, newest first, with average rating
  header; linked from the site footer. Both fully responsive.

---

## Non-goals

- SMS sending (schema-ready only).
- Review replies, editing, or guest-side deletion.
- Historical occupancy charts beyond the three ratios in §5.
- Refactoring the remaining inline panels (outbox) out of the admin monolith.

## Error handling & testing

- Range endpoints validate dates and span; per-day expansion is transactional.
- Dashboard SQL returns nulls rather than dividing by zero; UI renders "—".
- Review submission is idempotent-safe (unique constraint → 409 on repeat).
- Vitest coverage in `apps/api` for: code generation/backfill uniqueness,
  range expansion + grouping edge cases (adjacent vs. overlapping), dashboard
  aggregates (fixture reservations), eligibility rules, masking, snapshot
  stays/nights math, moderation transitions, cron request-window dedupe.
- Frontend: verify narrow-viewport behavior for every touched screen
  (hard rule); modal focus trap + Escape + action-button stopPropagation.

## Delivery plan (orchestrator)

Independent work streams, each its own branch/PR:

1. **WS-A — Admin UX**: §1 scrollbar, §2 Paramètres extraction/reorg,
   §3 Modal extraction + compact reservations table. (Pure frontend.)
2. **WS-B — Blackout ranges**: §4 API + UI. (Small, independent.)
3. **WS-C — Dashboard**: §5 API + Aperçu tab; depends on WS-A only for tab
   ordering (trivial merge).
4. **WS-D — Reviews**: §6 migrations + API + cron + public pages + admin tab;
   the largest stream; includes the reservation-code migration.

Migrations are numbered sequentially (next free: 0037) and must be idempotent
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Schema-changing
PRs are migrated before merge/deploy per house rule.
