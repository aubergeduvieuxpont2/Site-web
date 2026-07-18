import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./emailOutbox", () => ({ enqueueEmail: vi.fn() }));
vi.mock("./provisioning", () => ({ SITE_ORIGIN: "https://test.auberge.example.com" }));

import { enqueueEmail } from "./emailOutbox";
import { enqueueReviewRequests } from "./reviewRequests";

const mockEnqueueEmail = vi.mocked(enqueueEmail);

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ── Toggle disabled ───────────────────────────────────────────────────────────

describe("enqueueReviewRequests — toggle disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { enqueued: 0 } when the toggle is off", async () => {
    const sql = makeSql([[{ value: "false" }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
  });

  it("does not query reservations when the toggle is off", async () => {
    const sql = makeSql([[{ value: "false" }]]);
    await enqueueReviewRequests(sql as any);
    // Only the toggle SELECT should have run
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("does not call enqueueEmail when the toggle is off", async () => {
    const sql = makeSql([[{ value: "false" }]]);
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
    const sql = makeSql([[{ value: "true " }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
  });
});

// ── Toggle enabled, no eligible reservations ──────────────────────────────────

describe("enqueueReviewRequests — toggle enabled, no eligible reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("returns { enqueued: 0 } when there are no reservations matching the window", async () => {
    const sql = makeSql([
      [{ value: "true" }], // toggle
      [],                   // no eligible reservations
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});

// ── Toggle enabled, happy path ────────────────────────────────────────────────

describe("enqueueReviewRequests — toggle enabled, one eligible reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("enqueues one review-request email and returns { enqueued: 1 }", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [], // INSERT review_requests
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
  });

  it("calls enqueueEmail with the review-request template", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.template).toBe("review-request");
  });

  it("sends the review email to the reservation's email address", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [{ ...RESERVATION, email: "jean@example.com" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.to).toBe("jean@example.com");
  });

  it("includes a reviewUrl with the reservation code in the payload", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.reviewUrl).toContain("AVP-ABCDEF");
    expect(call.payload.reviewUrl).toContain("/avis/nouveau");
  });

  it("includes the site origin in the reviewUrl", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.reviewUrl).toContain("https://test.auberge.example.com");
  });

  it("includes the guest's first name in the payload", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("Marie");
  });

  it("falls back to the first word of name when first_name is null", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [{ ...RESERVATION, first_name: null, name: "Robert Gagnon" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("Robert");
  });

  it("falls back to 'client' when both first_name and name are empty", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [{ ...RESERVATION, first_name: null, name: "" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const call = mockEnqueueEmail.mock.calls[0][1];
    expect(call.payload.firstName).toBe("client");
  });

  it("includes checkIn and checkOut dates in the email payload", async () => {
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
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
      [{ value: "true" }],
      [RESERVATION],
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
      .mockImplementationOnce(() => Promise.resolve([{ value: "true" }])) // toggle
      .mockImplementationOnce(() => Promise.resolve([RESERVATION]))        // reservations
      .mockImplementationOnce(() => {                                       // INSERT review_requests
        callOrder.push("insert");
        return Promise.resolve([]);
      });

    mockEnqueueEmail.mockImplementation(async () => {
      callOrder.push("enqueueEmail");
      return { enqueued: true };
    });

    await enqueueReviewRequests(sql as any);

    expect(callOrder).toEqual(["insert", "enqueueEmail"]);
  });
});

// ── Toggle enabled, multiple eligible reservations ────────────────────────────

describe("enqueueReviewRequests — multiple eligible reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("enqueues one email per eligible reservation", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "a@example.com", code: "AVP-AAAAAA" };
    const res2 = { ...RESERVATION, id: 2, email: "b@example.com", code: "AVP-BBBBBB" };
    const sql = makeSql([
      [{ value: "true" }],
      [res1, res2],
      [], // INSERT for res1
      [], // INSERT for res2
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(2);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(2);
  });

  it("counts only reservations where enqueueEmail returns { enqueued: true }", async () => {
    const res1 = { ...RESERVATION, id: 1, email: "a@example.com", code: "AVP-AAAAAA" };
    const res2 = { ...RESERVATION, id: 2, email: "b@example.com", code: "AVP-BBBBBB" };
    const sql = makeSql([
      [{ value: "true" }],
      [res1, res2],
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

// ── Cron dedupe window ────────────────────────────────────────────────────────

describe("enqueueReviewRequests — cron-window dedupe (INV-one-request-per-reservation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
  });

  it("skips reservations already in review_requests (SQL NOT EXISTS filters them out)", async () => {
    // The SQL query already excludes reservations with review_requests rows.
    // Simulated here by the reservation not appearing in the query result.
    const sql = makeSql([
      [{ value: "true" }],
      [], // no eligible reservations (all filtered by NOT EXISTS)
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(0);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("uses ON CONFLICT DO NOTHING to handle concurrent cron runs safely", async () => {
    // The INSERT uses ON CONFLICT DO NOTHING — verify the sql call is made
    // (deduplication at DB level; the enqueueEmail call still runs after insert)
    const sql = makeSql([
      [{ value: "true" }],
      [RESERVATION],
      [], // INSERT review_requests (no-op on conflict in real DB, returns [] here)
    ]);
    const result = await enqueueReviewRequests(sql as any);
    // Even though the INSERT was a no-op (or not — we can't tell in JS unit test),
    // the function still continues and calls enqueueEmail
    expect(sql).toHaveBeenCalledTimes(3); // toggle + reservations + INSERT
    expect(result.enqueued).toBe(1);
  });
});
