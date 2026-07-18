import { enqueueEmail } from "./emailOutbox";
import { SITE_ORIGIN } from "./provisioning";

// Enqueue review-request emails for confirmed reservations departed in the
// last N days (N = 3 so a briefly-downed cron catches up without re-sending).
//
// Prerequisites per row:
//   - status = 'confirmed'
//   - depart between today-3 and today (inclusive)
//   - email column is non-empty
//   - no existing row in review_requests (INV-request-dedupe)
//   - no existing row in reviews (guest already submitted)
//   - reservations.code is set (INV-code-format; rows without a code are skipped)
//
// The toggle (email_review_request_enabled) is checked first: if disabled,
// no review_requests rows are created and the function returns early. This
// preserves the 3-day catch-up window for when the toggle is later enabled.
//
// Called from the worker's `scheduled` handler alongside drainEmailOutbox.
export async function enqueueReviewRequests(
  sql: (...args: any[]) => any
): Promise<{ enqueued: number }> {
  // Check toggle before touching review_requests rows so we do not burn
  // the dedupe slot for reservations when emailing is disabled.
  const toggleRows = (await sql`
    SELECT value FROM settings WHERE key = 'email_review_request_enabled' LIMIT 1
  `) as { value: string }[];
  if (toggleRows[0]?.value !== "true") return { enqueued: 0 };

  const reservations = (await sql`
    SELECT r.id, r.email, r.first_name, r.name, r.code,
           to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
           to_char(r.depart, 'YYYY-MM-DD')  AS depart
    FROM reservations r
    WHERE r.status = 'confirmed'
      AND r.email IS NOT NULL AND r.email <> ''
      AND r.depart BETWEEN (CURRENT_DATE - INTERVAL '3 days') AND CURRENT_DATE
      AND r.code IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM review_requests rr WHERE rr.reservation_id = r.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM reviews rv WHERE rv.reservation_id = r.id
      )
    ORDER BY r.depart DESC
  `) as {
    id: number;
    email: string;
    first_name: string | null;
    name: string;
    code: string;
    arrive: string | null;
    depart: string | null;
  }[];

  let enqueued = 0;

  for (const res of reservations) {
    // Insert the dedupe row first (ON CONFLICT DO NOTHING is idempotent).
    await sql`
      INSERT INTO review_requests (reservation_id, channel, sent_at)
      VALUES (${res.id}, 'email', now())
      ON CONFLICT (reservation_id) DO NOTHING
    `;

    const firstName =
      res.first_name?.trim() ||
      (res.name ?? "").trim().split(/\s+/)[0] ||
      "client";

    const reviewUrl = `${SITE_ORIGIN}/avis/nouveau?code=${res.code}`;

    const result = await enqueueEmail(sql, {
      template: "review-request",
      to: res.email,
      payload: {
        firstName,
        checkIn: res.arrive ?? "",
        checkOut: res.depart ?? "",
        reviewUrl,
      },
    });

    if (result.enqueued) enqueued++;
  }

  return { enqueued };
}
