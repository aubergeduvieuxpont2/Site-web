import { enqueueEmail } from "./emailOutbox";
import { SITE_ORIGIN } from "./provisioning";
import { intSetting } from "./settings";

// Review emails go out at a fixed wall-clock hour in the auberge's local zone.
// Bare CURRENT_DATE would be UTC, which lands at 20:00 the previous evening in
// Quebec — while the guest is still in the room.
export const REVIEW_SEND_HOUR_LOCAL = 14;
export const REVIEW_TIMEZONE = "America/Toronto";

// A cron that was down should still catch up, but must not fire requests for
// long-past stays.
export const CATCHUP_WINDOW_DAYS = 7;

export interface ReservationForReview {
  id: number;
  email: string;
  first_name: string | null;
  name: string;
  code: string;
  arrive: string | null;
  depart: string | null;
}

export function buildReviewPayload(res: ReservationForReview) {
  const firstName =
    res.first_name?.trim() ||
    (res.name ?? "").trim().split(/\s+/)[0] ||
    "client";

  return {
    firstName,
    checkIn: res.arrive ?? "",
    checkOut: res.depart ?? "",
    reviewUrl: `${SITE_ORIGIN}/avis/nouveau?code=${res.code}`,
  };
}

// Enqueue review-request emails for confirmed reservations whose departure day
// (plus a configurable delay), evaluated at a fixed local wall-clock hour, has
// passed — then follow up with a reminder for guests who have not yet
// responded.
//
// Settings read once up front (the reminder and suppression settings use a
// "0 means disabled" sentinel; review_request_delay_days does not):
//   - review_request_delay_days:  days after depart before the first email (0 = depart day)
//   - review_reminder_delay_days: days after the first email before a reminder; 0 disables the reminder pass entirely
//   - review_suppression_months:  months to avoid re-asking the same email address; 0 disables suppression
//
// Prerequisites per row (first pass):
//   - status = 'confirmed'
//   - depart + delay, evaluated at REVIEW_SEND_HOUR_LOCAL in REVIEW_TIMEZONE, has passed but is within the catch-up window
//   - email column is non-empty
//   - no existing row in review_requests (INV-request-dedupe)
//   - no existing row in reviews (guest already submitted)
//   - reservations.code is set (INV-code-format; rows without a code are skipped)
//   - the guest's email has not received a review request within the suppression window
//
// The toggle (email_review_request_enabled) is checked first: if disabled, no
// rows are written and the function returns early for BOTH passes. This
// preserves the catch-up window for when the toggle is later enabled.
//
// The reminder pass deliberately skips the suppression check — it belongs to
// the same conversation as a request already sent, not a fresh ask.
//
// Called from the worker's `scheduled` handler alongside drainEmailOutbox.
export async function enqueueReviewRequests(
  sql: (...args: any[]) => any
): Promise<{ enqueued: number; reminded: number }> {
  // Check the toggle before touching review_requests rows so we do not burn
  // the dedupe slot for reservations when emailing is disabled.
  const settingRows = (await sql`
    SELECT key, value FROM settings
    WHERE key IN (
      'email_review_request_enabled',
      'review_request_delay_days',
      'review_reminder_delay_days',
      'review_suppression_months'
    )
  `) as { key: string; value: string }[];

  const setting = (k: string) => settingRows.find((r) => r.key === k)?.value;

  if (setting("email_review_request_enabled") !== "true") {
    return { enqueued: 0, reminded: 0 };
  }

  const delayDays = intSetting(setting("review_request_delay_days"), 0);
  const reminderDelayDays = intSetting(setting("review_reminder_delay_days"), 7);
  const suppressionMonths = intSetting(setting("review_suppression_months"), 6);

  const reservations = (await sql`
    SELECT r.id, r.email, r.first_name, r.name, r.code,
           to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
           to_char(r.depart, 'YYYY-MM-DD')  AS depart
    FROM reservations r
    WHERE r.status = 'confirmed'
      AND r.email IS NOT NULL AND r.email <> ''
      AND r.code IS NOT NULL
      AND ((r.depart + make_interval(days => ${delayDays}))::timestamp
            + make_interval(hours => ${REVIEW_SEND_HOUR_LOCAL}))
          AT TIME ZONE ${REVIEW_TIMEZONE} <= now()
      AND ((r.depart + make_interval(days => ${delayDays}))::timestamp
            + make_interval(hours => ${REVIEW_SEND_HOUR_LOCAL}))
          AT TIME ZONE ${REVIEW_TIMEZONE} > now() - make_interval(days => ${CATCHUP_WINDOW_DAYS})
      AND NOT EXISTS (
        SELECT 1 FROM review_requests rr WHERE rr.reservation_id = r.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM reviews rv WHERE rv.reservation_id = r.id
      )
      AND (${suppressionMonths} = 0 OR NOT EXISTS (
        SELECT 1 FROM review_requests rr2
        JOIN reservations r2 ON r2.id = rr2.reservation_id
        WHERE lower(r2.email) = lower(r.email)
          AND rr2.sent_at > now() - make_interval(months => ${suppressionMonths})
      ))
    ORDER BY r.depart DESC
  `) as ReservationForReview[];

  let enqueued = 0;

  // Per-run guard: the suppression subquery above only sees review_requests
  // rows that existed before this run started, so two reservations for the
  // same guest whose send times both land inside the catch-up window would
  // otherwise both pass it and both get emailed in this same run.
  const seenEmails = new Set<string>();

  for (const res of reservations) {
    const emailKey = res.email.toLowerCase();
    if (suppressionMonths > 0 && seenEmails.has(emailKey)) continue;
    seenEmails.add(emailKey);

    // A failing row (bad payload, transient DB error, etc.) must not abort
    // the whole batch — log it and move on to the next reservation.
    try {
      // Insert the dedupe row first (ON CONFLICT DO NOTHING is idempotent).
      // RETURNING lets us tell whether *this* call won the row: on a
      // per-minute cron, two overlapping ticks can both select the same
      // reservation before either has inserted, so without this check both
      // would go on to send the email.
      const claimed = (await sql`
        INSERT INTO review_requests (reservation_id, channel, sent_at)
        VALUES (${res.id}, 'email', now())
        ON CONFLICT (reservation_id) DO NOTHING
        RETURNING reservation_id
      `) as { reservation_id: number }[];
      if (claimed.length === 0) continue;

      const result = await enqueueEmail(sql, {
        template: "review-request",
        to: res.email,
        payload: buildReviewPayload(res),
      });

      if (result.enqueued) enqueued++;
    } catch (err) {
      console.error("review_request_enqueue_failed", res.id, err);
    }
  }

  let reminded = 0;

  if (reminderDelayDays > 0) {
    const dueReminders = (await sql`
      SELECT r.id, r.email, r.first_name, r.name, r.code,
             to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
             to_char(r.depart, 'YYYY-MM-DD')  AS depart
      FROM review_requests rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE r.status = 'confirmed'
        AND rr.reminder_sent_at IS NULL
        AND rr.responded_at IS NULL
        AND rr.sent_at + make_interval(days => ${reminderDelayDays}) <= now()
        AND rr.sent_at > now() - make_interval(days => ${reminderDelayDays + CATCHUP_WINDOW_DAYS})
        AND r.email IS NOT NULL AND r.email <> ''
        AND r.code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM reviews rv WHERE rv.reservation_id = rr.reservation_id
        )
      ORDER BY rr.sent_at ASC
    `) as ReservationForReview[];

    for (const res of dueReminders) {
      // A failing row must not abort the whole reminder pass — log it and
      // move on to the next reservation.
      try {
        // Stamp first, mirroring the first pass: a failure mid-loop must not
        // leave the row eligible for a duplicate reminder. RETURNING lets us
        // tell whether *this* call won the claim: on a per-minute cron, two
        // overlapping ticks can both select the same due reminder before
        // either has stamped it, so without this check both would send.
        const claimed = (await sql`
          UPDATE review_requests SET reminder_sent_at = now()
          WHERE reservation_id = ${res.id} AND reminder_sent_at IS NULL
          RETURNING reservation_id
        `) as { reservation_id: number }[];
        if (claimed.length === 0) continue;

        const result = await enqueueEmail(sql, {
          template: "review-reminder",
          to: res.email,
          payload: buildReviewPayload(res),
        });

        if (result.enqueued) reminded++;
      } catch (err) {
        console.error("review_reminder_enqueue_failed", res.id, err);
      }
    }
  }

  return { enqueued, reminded };
}
