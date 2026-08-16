# Review-Request Lifecycle — Design Spec

**Date:** 2026-08-16
**Status:** Approved by operator (design review 2026-08-16)
**Delivery:** Single feature branch, implemented directly (no orchestrator split).

Reworks how guest feedback requests are sent. Today a cron fires one email per
reservation inside a fixed 3-day window after departure, with no reminder, no
response tracking, no per-guest suppression, and no way for an admin to send
one by hand. This design adds all four, and makes the three intervals operator-
configurable.

---

## Context (as-built facts this design relies on)

- `apps/api/src/reviewRequests.ts` exports `enqueueReviewRequests(sql)`. It is
  called from exactly one place: the Worker's `scheduled` handler in
  `apps/api/src/index.ts` (before `releaseExpiredHolds` and
  `drainEmailOutbox`), on the `* * * * *` cron in `apps/api/wrangler.jsonc`.
- Eligibility today: `status = 'confirmed'`, `depart BETWEEN CURRENT_DATE - 3
  days AND CURRENT_DATE`, non-empty `email`, non-null `code`, no row in
  `review_requests`, no row in `reviews`.
- `review_requests` (migration `0040`): `reservation_id BIGINT PRIMARY KEY
  REFERENCES reservations(id)`, `channel TEXT NOT NULL DEFAULT 'email'`,
  `sent_at TIMESTAMPTZ NOT NULL DEFAULT now()`. The PK is the dedupe: once a
  row exists the cron can never re-send.
- `reviews` (migration `0039`): `reservation_id BIGINT NOT NULL UNIQUE`,
  `rating`, `body`, `status` (default `'pending'`), `display_name`,
  `stays_count`, `nights_total`, `created_at`, `moderated_at`. Rows are
  inserted in `apps/api/src/reviews.ts` (the public submission handler).
- The toggle `email_review_request_enabled` is checked **first** in
  `enqueueReviewRequests`, before any `review_requests` row is written, so that
  disabling emails does not burn dedupe slots.
- `enqueueEmail()` in `apps/api/src/emailOutbox.ts` maps each template to a
  settings toggle via `EMAIL_TOGGLE_KEYS`, except templates in `ALWAYS_SEND`
  (`email-verification`, `email-change-alert`). `review-request` is
  toggle-gated. There is currently **no** way to bypass a toggle.
- **No timezone handling exists anywhere in the API.** `reviewRequests.ts` and
  `reviews.ts` are the only files touching dates and both use bare
  `CURRENT_DATE`, which on Neon is UTC.
- `settings` values are stored as TEXT. `SETTINGS_DEFAULTS`,
  `PUBLIC_SETTING_KEYS` and the Zod `SettingsUpdateSchema` all live in
  `apps/api/src/settings.ts`; the admin UI is
  `apps/web/src/lib/components/admin/AdminParametresTab.svelte`.
- Admin reservation actions follow a route convention:
  `/api/admin/reservations/:id/status`, `/invoice`, `/assignments`,
  `/free-rooms`. `GET /api/admin/reservations` is a single flat `SELECT` over
  `reservations` returning `ReservationRow[]`.
- `apps/web/src/lib/components/admin/ReservationDetailModal.svelte` has an
  actions row; `data-testid="btn-facture"` is the reference pattern for an
  action button with an expanding panel.
- Email templates are registered in `apps/api/src/emails/manifest.ts`
  (`TEMPLATE_KEYS`, per-template `name`/`subject`/`sampleFile`/
  `requiredFields`), with Handlebars sources compiled into
  `apps/api/src/emails/precompiled.ts` by `apps/api/scripts/precompile-emails.mjs`
  (wired as the `pretest` script).
- Migration house style is multiple `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  per file (see `0041_reservations_stripe.sql`, `0044_users_address.sql`),
  with settings seeds kept in their own file (`0037`).

## Decisions taken with the operator

1. **Send timing is a fixed local hour, not a UTC boundary.** Bare
   `CURRENT_DATE` would fire the "departure day" email at 00:00 UTC — 20:00 EDT
   the *previous* evening, while the guest is still in the room. Emails go at
   **14:00 America/Toronto**.
2. **All three intervals are operator-configurable** from the Paramètres tab:
   first-request delay, reminder delay, and the per-guest suppression window.
3. The 14:00 send hour itself stays a code constant. Not a knob the operator
   asked for; promoting it later is a one-line change.
4. **Manual send overrides everything except an existing response.** An admin
   clicking the button is the operator expressing intent, so it ignores the
   toggle, the timing, and the suppression window.

---

## 1. Settings

Three new keys, added to `SETTINGS_DEFAULTS` and `SettingsUpdateSchema`. All
are **admin-only** — none joins `PUBLIC_SETTING_KEYS`.

| key | API field | default | meaning |
|---|---|---|---|
| `review_request_delay_days` | `reviewRequestDelayDays` | `0` | days after departure for the first email (0 = day of checkout) |
| `review_reminder_delay_days` | `reviewReminderDelayDays` | `7` | days after the *first email* for the reminder; **0 disables reminders** |
| `review_suppression_months` | `reviewSuppressionMonths` | `6` | per-guest dead zone; **0 disables suppression** |

Validation: `z.coerce.number().int()`, `.min(0)`, with `.max(365)` on the two
day fields and `.max(60)` on the months field. Reads coerce via
`Number(...)` with a fallback to the default when the row is missing or
unparseable, matching how the existing numeric settings are read in
`apps/api/src/settings.ts`.

`email_review_request_enabled` is unchanged and still gates everything the
cron does.

## 2. Timing model

Both passes compare against a wall-clock local instant, computed in SQL so DST
is handled by Postgres rather than by us:

```sql
((r.depart + make_interval(days => :delay))::timestamp
   + make_interval(hours => 14)) AT TIME ZONE 'America/Toronto' <= now()
```

`AT TIME ZONE` applied to a `timestamp` (no zone) yields a `timestamptz`,
interpreting the wall time in the named zone — so the expression means "14:00
local on departure-day + delay", correct on both sides of a DST boundary.

`REVIEW_SEND_HOUR_LOCAL = 14` and `REVIEW_TIMEZONE = 'America/Toronto'` are
exported constants in `reviewRequests.ts`.

**Catch-up bound.** The old `BETWEEN CURRENT_DATE - 3 days` window is replaced
by a lower bound on the same expression, so a cron that was down still catches
up but cannot fire requests for long-past stays:

```sql
AND ((r.depart + make_interval(days => :delay))::timestamp
       + make_interval(hours => 14)) AT TIME ZONE 'America/Toronto'
    > now() - INTERVAL '7 days'
```

Seven days rather than three: with a configurable delay the old three-day
window was too tight to be a safety net.

## 3. Schema

**`0046_review_requests_lifecycle.sql`**

```sql
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS responded_at     TIMESTAMPTZ;

-- Supports the per-guest suppression subquery in §5a.
CREATE INDEX IF NOT EXISTS idx_reservations_email_lower ON reservations (lower(email));
```

**`0047_settings_review_timing.sql`** — the three seed rows, split from the
ALTERs so a failed column add cannot silently drop the seeds:

```sql
INSERT INTO settings (key, value) VALUES
  ('review_request_delay_days',  '0'),
  ('review_reminder_delay_days', '7'),
  ('review_suppression_months',  '6')
ON CONFLICT (key) DO NOTHING;
```

Both files are idempotent and safe to re-run. Neither column is added to
`apps/api/schema.sql` in the same commit — a fresh database runs `schema.sql`
first, so declaring a column in both places makes the `ALTER` fail as a
duplicate. Folding them into `schema.sql` is a follow-up commit, after the
migration has been applied remotely.

No `guest_email` column: the suppression lookup joins `reservations` instead,
so there is no denormalized copy of the email to drift.

## 4. Response tracking

`responded_at` on `review_requests` records that the guest actually left
feedback. It is set in `apps/api/src/reviews.ts`, in the same handler that
inserts the review:

```sql
UPDATE review_requests SET responded_at = now()
WHERE reservation_id = ${reservationId} AND responded_at IS NULL
```

A guest who reviews without ever having been asked (they hold a valid `code`)
simply no-ops the update — no row, nothing to set. The `AND responded_at IS
NULL` guard keeps the first response's timestamp if the statement is ever
reached twice.

`responded_at` is the single source of truth for "did they answer": it
suppresses the reminder, blocks manual resend, and drives the admin UI state.

## 5. Cron — two passes

`enqueueReviewRequests` keeps its name and its position in the `scheduled`
handler, and gains a second pass. Both passes return counts:
`{ enqueued, reminded }`.

The toggle check stays first and now short-circuits **both** passes, preserving
the existing property that a disabled toggle writes no rows at all.

### 5a. First request

All of today's conditions, with the `BETWEEN` window replaced by §2's timing
expression, plus per-guest suppression:

```sql
AND (:months = 0 OR NOT EXISTS (
      SELECT 1 FROM review_requests rr2
      JOIN reservations r2 ON r2.id = rr2.reservation_id
      WHERE lower(r2.email) = lower(r.email)
        AND rr2.sent_at > now() - make_interval(months => :months)
    ))
```

Matching is on `lower(email)`, which covers OTA bookings that have no
`user_id`. An index on `lower(email)` over `reservations` is added in `0046`
to keep the correlated subquery cheap:

```sql
CREATE INDEX IF NOT EXISTS idx_reservations_email_lower ON reservations (lower(email));
```

As today, the dedupe row is inserted **before** the email is enqueued, with
`ON CONFLICT (reservation_id) DO NOTHING`.

### 5b. Reminder

A second query over reservations that already have a request:

```sql
WHERE rr.reminder_sent_at IS NULL
  AND rr.responded_at    IS NULL
  AND rr.sent_at + make_interval(days => :reminderDelay) <= now()
  AND NOT EXISTS (SELECT 1 FROM reviews rv WHERE rv.reservation_id = rr.reservation_id)
```

Skipped entirely when `review_reminder_delay_days = 0`. `reminder_sent_at` is
stamped before the enqueue, mirroring the first pass, so a mid-loop failure
cannot produce a duplicate reminder.

The reminder is **exempt from the suppression window** — it belongs to the same
conversation as a request already sent, and suppressing it would strand guests
who were asked once and never followed up.

The `NOT EXISTS (reviews)` check is redundant with `responded_at IS NULL` in
normal operation, but covers reviews created before this migration (which have
no `responded_at` backfill).

## 6. Manual send

`POST /api/admin/reservations/:id/review-request`, admin-gated exactly like
the neighbouring `/status` and `/invoice` routes (401 unauthenticated, 403
non-admin).

| Condition | Response |
|---|---|
| Reservation not found | `404 { error: "Reservation not found" }` |
| No email, or no `code` | `400` with a message naming the missing field |
| `responded_at` already set | `409 { error: "Guest already left a review" }` |
| Otherwise | `200 { sent: true, sentAt, resent }` |

It ignores the toggle, the timing expression, and the suppression window. It
does **not** ignore `responded_at` — resending to someone who already answered
is pure noise.

On resend (a `review_requests` row exists but `responded_at` is null) it
overwrites `sent_at = now()` and clears `reminder_sent_at`, restarting the
reminder clock so the follow-up lands a configured interval after the *latest*
send.

Reservation status is not checked: an admin may legitimately want feedback on a
reservation the cron would skip.

### 6a. Toggle bypass

`enqueueEmail()` currently has no way to send a toggle-gated template while its
toggle is off. It gains one option:

```ts
force?: boolean;  // admin-initiated send; bypasses EMAIL_TOGGLE_KEYS
```

`force` bypasses only the settings toggle. It does not touch `ALWAYS_SEND`,
retry, or backoff behaviour. The only caller passing `force: true` is the
manual-send route, where the request is already admin-authenticated.

This is a deliberate hole in an operator kill switch and is called out here so
it is a reviewed decision rather than an accident.

## 7. Admin UI

### 7a. Reservation detail modal

`ReservationDetailModal.svelte` gains an action button beside `btn-facture`
(`data-testid="btn-review-request"`), with four states:

| State | Label | Action |
|---|---|---|
| No request, has email + code | *Demander un avis* | POST |
| Sent, no response | *Demande envoyée le \<date\>* + *Renvoyer* | POST (resend) |
| Reminder sent, no response | *Rappel envoyé le \<date\>* + *Renvoyer* | POST (resend) |
| Responded | *Avis reçu le \<date\>* | none (disabled) |

Disabled with a visible reason when `email` or `code` is missing, so the `400`
is never reachable through the UI.

This requires request state on the row, so `GET /api/admin/reservations` gains
a `LEFT JOIN review_requests rr ON rr.reservation_id = r.id` and three
`to_char(...)`-formatted fields — `review_sent_at`, `review_reminder_sent_at`,
`review_responded_at` — following the existing `paid_at` formatting. The list
query gains a table alias, which it currently lacks.

### 7b. Paramètres tab

Three numeric inputs in the existing reviews/email block of
`AdminParametresTab.svelte`, saved by the tab's single existing save button.
Each carries help text stating what `0` means for that field.

## 8. Template work

New bilingual `review-reminder` template: manifest entry (`name`, `subject`,
`sampleFile`, `requiredFields`), fr/en Handlebars sources, a sample JSON,
addition to `TEMPLATE_KEYS`, the `EmailTemplate` union in `emailOutbox.ts`, and
`EMAIL_TOGGLE_KEYS` mapped to the **same** `email_review_request_enabled` key —
one switch controls both emails. `precompiled.ts` is regenerated via
`npm run precompile:emails`.

Its payload matches `review-request` (`firstName`, `checkIn`, `checkOut`,
`reviewUrl`) so the two share an enqueue helper.

**Existing inconsistency fixed:** the manifest declares `roomLabel` in
`review-request`'s `requiredFields`, but `reviewRequests.ts` has never sent it.
This is harmless today because `requiredFields` drives only admin preview, not
delivery — but copying the pattern into `review-reminder` would spread it.
`roomLabel` is dropped from `requiredFields`, since the template body does not
reference it.

## Non-goals

- SMS. The `channel` column stays `'email'`.
- Making the 14:00 send hour or the timezone configurable.
- Backfilling `responded_at` for reviews submitted before this change.
- Bulk "send requests to all past guests" tooling.
- Changing review moderation, public display, or the `/avis/nouveau` flow.
- Per-guest opt-out / unsubscribe (worth doing, but it is its own design).

## Error handling & testing

- **API unit** (`apps/api/src/reviewRequests.test.ts`, extended): first-send
  timing at the local-hour boundary; DST correctness across both March and
  November transitions; catch-up lower bound; suppression hit and miss,
  including case-insensitive email matching and `months = 0` disabling it;
  reminder fires, is skipped when `responded_at` is set, and is skipped when
  the delay is `0`; toggle short-circuits both passes and writes no rows.
- **API route**: the four manual-send outcomes, admin gating (401/403), resend
  clearing `reminder_sent_at`, and `force` bypassing a disabled toggle.
- **API settings**: the three new keys round-trip, reject negatives and
  non-integers, and clamp at their maxima.
- **Web**: the four button states, the disabled-with-reason case, and the three
  Paramètres inputs saving with the rest of the form.
- Failures inside either cron pass are logged and skipped per-row; one bad
  reservation must not abort the batch or block `drainEmailOutbox`.

## Delivery plan

Single branch `feat/review-request-lifecycle`, TDD per task:

1. Migrations `0046`, `0047`
2. Settings: defaults, schema, read/write, admin UI inputs
3. `review-reminder` template + manifest fix + precompile
4. `enqueueEmail({ force })`
5. Cron rework: timing, suppression, reminder pass
6. `responded_at` write in `reviews.ts`
7. Manual-send endpoint
8. Admin list `LEFT JOIN` + modal button

Steps 1–4 are independent of each other; 5–8 depend on 1–4.

**Deploy order matters — apply the migrations to prod BEFORE merging.**
Merging auto-fires `deploy-prod`, which deploys the new API *before*
`db:migrate` runs. The new code's `SELECT`s reference `reminder_sent_at` and
`responded_at`, so merging first would 500 the admin reservations list until
the migration caught up — exactly the failure hit by PR #35. Both migrations
are additive and idempotent, so the currently-deployed API ignores the new
columns: run `npm run db:migrate` against prod first, then merge.
