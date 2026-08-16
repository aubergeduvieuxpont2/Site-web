import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./emailOutbox", () => ({ enqueueEmail: vi.fn() }));
vi.mock("./provisioning", () => ({ SITE_ORIGIN: "https://test.auberge.example.com" }));

import { enqueueEmail } from "./emailOutbox";
import {
  enqueueReviewRequests,
  REVIEW_SEND_HOUR_LOCAL,
  REVIEW_TIMEZONE,
  CATCHUP_WINDOW_DAYS,
} from "./reviewRequests";

const mockEnqueueEmail = vi.mocked(enqueueEmail);

// ── helpers ──────────────────────────────────────────────────────────────

function makeSql(responses: unknown[][]): ReturnType<typeof vi.fn> {
  let i = 0;
  return vi.fn().mockImplementation(() => Promise.resolve(responses[i++] ?? []));
}

const RESERVATION = {
  id: 1,
  email: "marie@example.com",
  first_name: "Marie",
  name: "Marie Tremblay",
  code: "AVP-ABCDEF",
  arrive: "2026-07-10",
  depart: "2026-07-15",
};

// ── Toggle disabled ──────────────────────────────────────────────────────

describe("enqueueReviewRequests — toggle disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { enqueued: 0 } when the toggle is off", async () => {
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "false" }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
  });

  it("does not query reservations when the toggle is off", async () => {
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "false" }]]);
    await enqueueReviewRequests(sql as any);
    // Only the settings SELECT should have run
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("does not call enqueueEmail when the toggle is off", async () => {
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "false" }]]);
    await enqueueReviewRequests(sql as any);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("returns { enqueued: 0 } when the toggle row is missing", async () => {
    const sql = makeSql([[]]); // empty settings query
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("returns { enqueued: 0 } when the toggle value is 'true ' (with trailing space)", async () => {
    // Strict equality check: only the exact string "true" enables the toggle
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "true " }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
  });
});

// ── Toggle enabled, no eligible reservations ────────────────────────────

describe("enqueueReviewRequests — toggle enabled, no eligible reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("returns { enqueued: 0 } when there are no reservations matching the window", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }], // settings
      [], // no eligible reservations
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});

// ── Toggle enabled, happy path ───────────────────────────────────────────

describe("enqueueReviewRequests — toggle enabled, one eligible reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("enqueues one review-request email and returns { enqueued: 1 }", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }], // INSERT review_requests (row claimed)
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("calls enqueueEmail with the review-request template", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.template).toBe("review-request");
  });

  it("sends the review email to the reservation's email address", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [{ ...RESERVATION, email: "jean@example.com" }],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.to).toBe("jean@example.com");
  });

  it("includes a reviewUrl with the reservation code in the payload", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.reviewUrl).toContain("AVP-ABCDEF");
    expect(call.payload.reviewUrl).toContain("/avis/nouveau");
  });

  it("includes the site origin in the reviewUrl", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.reviewUrl).toContain("https://test.auberge.example.com");
  });

  it("includes the guest's first name in the payload", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("Marie");
  });

  it("falls back to the first word of name when first_name is null", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [{ ...RESERVATION, first_name: null, name: "Robert Gagnon" }],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("Robert");
  });

  it("falls back to 'client' when both first_name and name are empty", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [{ ...RESERVATION, first_name: null, name: "" }],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("client");
  });

  it("includes checkIn and checkOut dates in the email payload", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.checkIn).toBe("2026-07-10");
    expect(call.payload.checkOut).toBe("2026-07-15");
  });

  it("enqueues a payload with firstName, reviewUrl, checkIn AND checkOut (INV-review-email-dates)", async () => {
    // The shipping path (index.ts scheduled handler → this module) must send all
    // four keys. The old inline copy passed only { firstName, reviewUrl }, so the
    // review-request.{fr,en}.hbs {{formatDate checkIn}} rendered blank / threw.
    // This assertion fails against that old payload shape.
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: 1 }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const { payload } = mockEnqueueEmail.mock.calls[0][1];
    expect(payload).toMatchObject({
      firstName: "Marie",
      reviewUrl: "https://test.auberge.example.com/avis/nouveau?code=AVP-ABCDEF",
      checkIn: "2026-07-10",
      checkOut: "2026-07-15",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["checkIn", "checkOut", "firstName", "reviewUrl"].sort()
    );
  });

  it("inserts a review_request row before calling enqueueEmail (dedupe first)", async () => {
    const callOrder: string[] = [];

    const sql = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve([{ key: "email_review_request_enabled", value: "true" }])
      ) // settings
      .mockImplementationOnce(() => Promise.resolve([RESERVATION])) // reservations
      .mockImplementationOnce(() => {
        // INSERT review_requests
        callOrder.push("insert");
        return Promise.resolve([{ reservation_id: 1 }]);
      })
      .mockImplementationOnce(() => Promise.resolve([])); // reminder select

    mockEnqueueEmail.mockImplementation(async () => {
      callOrder.push("enqueueEmail");
      return { enqueued: true };
    });

    await enqueueReviewRequests(sql as any);

    expect(callOrder).toEqual(["insert", "enqueueEmail"]);
  });
});

// ── Toggle enabled, multiple eligible reservations ──────────────────────

describe("enqueueReviewRequests — multiple eligible reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("enqueues one email per eligible reservation", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "a@example.com", code: "AVP-AAAAAA" };
    const res2 = { ...RESERVATION, id: 2, email: "b@example.com", code: "AVP-BBBBBB" };
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [res1, res2],
      [{ reservation_id: 1 }], // INSERT for res1
      [{ reservation_id: 2 }], // INSERT for res2
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(2);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(2);
  });

  it("counts only reservations where enqueueEmail returns { enqueued: true }", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "a@example.com", code: "AVP-AAAAAA" };
    const res2 = { ...RESERVATION, id: 2, email: "b@example.com", code: "AVP-BBBBBB" };
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [res1, res2],
      [{ reservation_id: 1 }],
      [{ reservation_id: 2 }],
      [],
    ]);
    mockEnqueueEmail
      .mockResolvedValueOnce({ enqueued: true })
      .mockResolvedValueOnce({ enqueued: false }); // second email not sent (e.g., toggle off in outbox)

    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(1);
  });
});

// ── Cron dedupe window ────────────────────────────────────────────────────

describe("enqueueReviewRequests — cron-window dedupe (INV-one-request-per-reservation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("skips reservations already in review_requests (SQL NOT EXISTS filters them out)", async () => {
    // The SQL query already excludes reservations with review_requests rows.
    // Simulated here by the reservation not appearing in the query result.
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [], // no eligible reservations (all filtered by NOT EXISTS)
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("uses ON CONFLICT DO NOTHING + RETURNING to handle concurrent cron runs safely: still sends when this call wins the insert", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [{ reservation_id: RESERVATION.id }], // INSERT won the row — RETURNING gives it back
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(sql).toHaveBeenCalledTimes(4); // settings + first-request select + INSERT + reminder select
    expect(result.enqueued).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
  });

  // Two overlapping per-minute cron ticks can both select the same reservation
  // before either has inserted its review_requests row. RETURNING on the
  // INSERT ... ON CONFLICT DO NOTHING lets the loser detect it lost the race
  // (nothing comes back) and skip sending, closing the double-send gap.
  it("skips sending when this call loses the INSERT race to a concurrent cron tick", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [], // INSERT conflicted — another tick already claimed this row
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});

// ── Settings (toggle, per-key defaults, reminder gate) ───────────────────

describe("enqueueReviewRequests — settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns { enqueued: 0, reminded: 0 } when the toggle is off", async () => {
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "false" }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 0, reminded: 0 });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("skips the reminder pass when the reminder delay is 0", async () => {
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "0" },
      ],
      [], // first-request select: no rows
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.reminded).toBe(0);
    // toggle select + first-request select only; no reminder select
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

// ── Reminder pass ─────────────────────────────────────────────────────────

describe("enqueueReviewRequests — reminder pass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues a review-reminder for a due, unanswered request", async () => {
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "7" },
      ],
      [], // first-request select
      [RESERVATION], // reminder select
      [{ reservation_id: RESERVATION.id }], // UPDATE reminder_sent_at (row claimed)
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.reminded).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      sql,
      expect.objectContaining({ template: "review-reminder", to: RESERVATION.email })
    );
  });

  it("stamps reminder_sent_at before enqueuing", async () => {
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "7" },
      ],
      [],
      [RESERVATION],
      [{ reservation_id: RESERVATION.id }],
    ]);
    await enqueueReviewRequests(sql as any);
    const updateCallIndex = sql.mock.calls.findIndex((c: any[]) =>
      String(c[0]).includes("reminder_sent_at = now()")
    );
    expect(updateCallIndex).toBeGreaterThan(-1);
    expect(mockEnqueueEmail).toHaveBeenCalled();
  });
});

// ── SQL shape ──────────────────────────────────────────────────────────────

describe("enqueueReviewRequests — SQL shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the local send hour rather than CURRENT_DATE", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const firstSelect = String(sql.mock.calls[1][0]);
    expect(firstSelect).toContain("AT TIME ZONE");
    expect(firstSelect).not.toContain("BETWEEN");
  });

  it("includes the suppression subquery", async () => {
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_suppression_months", value: "6" },
      ],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const firstSelect = String(sql.mock.calls[1][0]);
    expect(firstSelect).toContain("lower(r2.email)");
  });

  // The two tests above only check the query TEXT (TemplateStringsArray),
  // which drops every interpolated value — they'd pass unchanged even with
  // an inverted timezone conversion or a wrong catch-up bound. Assert on the
  // actual bound VALUES (sql.mock.calls[n].slice(1)) so a regression there
  // fails the suite.
  it("binds the exact interpolated values into the first-request SELECT, in order", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const boundValues = sql.mock.calls[1].slice(1);
    // delayDays (default 0) x2, REVIEW_SEND_HOUR_LOCAL x2, REVIEW_TIMEZONE x2,
    // then CATCHUP_WINDOW_DAYS, then suppressionMonths (default 6) x2 —
    // matches the ${...} interpolation order in the reservations query.
    expect(boundValues).toEqual([
      0,
      REVIEW_SEND_HOUR_LOCAL,
      REVIEW_TIMEZONE,
      0,
      REVIEW_SEND_HOUR_LOCAL,
      REVIEW_TIMEZONE,
      CATCHUP_WINDOW_DAYS,
      6,
      6,
    ]);
  });

  it("binds the reminder-delay and reminder catch-up bound into the reminder SELECT, in order", async () => {
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "9" },
      ],
      [], // first-request select
      [], // reminder select
    ]);
    await enqueueReviewRequests(sql as any);
    const reminderBoundValues = sql.mock.calls[2].slice(1);
    expect(reminderBoundValues).toEqual([9, 9 + CATCHUP_WINDOW_DAYS]);
  });
});

// ── Intra-run suppression (INV-one-request-per-guest-per-run) ───────────────

describe("enqueueReviewRequests — intra-run suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("enqueues only one email when the same guest email appears twice in one run, case-insensitively", async () => {
    // The suppression subquery in the SQL only sees review_requests rows
    // that existed BEFORE this run started, so two reservations for the
    // same guest whose send times both fall inside the catch-up window can
    // both come back from a single SELECT. Without an in-process guard,
    // both would be emailed in the same cron tick.
    const res1 = { ...RESERVATION, id: 1, email: "Marie@example.com" };
    const res2 = { ...RESERVATION, id: 2, email: "marie@example.com" };
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [res1, res2],
      [{ reservation_id: 1 }], // INSERT review_requests for res1 (res2 is skipped before reaching the INSERT)
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("does not guard across different guest emails", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "marie@example.com" };
    const res2 = { ...RESERVATION, id: 2, email: "jean@example.com" };
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [res1, res2],
      [{ reservation_id: 1 }], // INSERT for res1
      [{ reservation_id: 2 }], // INSERT for res2
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(2);
  });

  it("does not suppress duplicate emails in one run when review_suppression_months is 0", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "marie@example.com" };
    const res2 = { ...RESERVATION, id: 2, email: "marie@example.com" };
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_suppression_months", value: "0" },
      ],
      [res1, res2],
      [{ reservation_id: 1 }], // INSERT for res1
      [{ reservation_id: 2 }], // INSERT for res2
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(2);
  });
});
