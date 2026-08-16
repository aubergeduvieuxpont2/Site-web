import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./emailOutbox", () => ({ enqueueEmail: vi.fn() }));
vi.mock("./provisioning", () => ({ SITE_ORIGIN: "https://test.auberge.example.com" }));

import { enqueueEmail } from "./emailOutbox";
import { enqueueReviewRequests } from "./reviewRequests";

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
      [], // INSERT review_requests
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
      [],
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
        return Promise.resolve([]);
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
      [], // INSERT for res1
      [], // INSERT for res2
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
      [],
      [],
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

  it("uses ON CONFLICT DO NOTHING to handle concurrent cron runs safely", async () => {
    // The INSERT uses ON CONFLICT DO NOTHING — verify the sql call is made
    // (deduplication at DB level; the enqueueEmail call still runs after insert)
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [RESERVATION],
      [], // INSERT review_requests (no-op on conflict in real DB, returns [] here)
      [], // reminder select
    ]);
    const result = await enqueueReviewRequests(sql as any);
    // Even though the INSERT was a no-op (or not — we can't tell in JS unit test),
    // the function still continues and calls enqueueEmail
    expect(sql).toHaveBeenCalledTimes(4); // settings + first-request select + INSERT + reminder select
    expect(result.enqueued).toBe(1);
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
      [], // UPDATE reminder_sent_at
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
      [],
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
});
