import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueReviewRequests } from "../src/reviewRequests";

// ---------------------------------------------------------------------------
// Mock enqueueEmail from emailOutbox so we don't hit the settings toggle or DB
// from inside enqueueEmail itself. We control what it returns per test.
// ---------------------------------------------------------------------------

vi.mock("../src/emailOutbox", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    enqueueEmail: vi.fn(),
  };
});

vi.mock("../src/provisioning", () => ({
  SITE_ORIGIN: "https://www.aubergeduvieuxpont.ca",
}));

let mockEnqueueEmail: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await import("../src/emailOutbox");
  mockEnqueueEmail = mod.enqueueEmail as ReturnType<typeof vi.fn>;
  vi.clearAllMocks();
  mockEnqueueEmail.mockResolvedValue({ enqueued: true });
});

// ---------------------------------------------------------------------------
// Helper: build a tagged-template sql mock from a dispatcher function.
// The dispatcher receives the joined query string and the interpolated values.
// ---------------------------------------------------------------------------

function makeSql(script: (q: string, vals: unknown[]) => unknown[] | null) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("");
    const result = script(q, values);
    return Promise.resolve(result ?? []);
  };
}

// ---------------------------------------------------------------------------
// enqueueReviewRequests — cron handler
// ---------------------------------------------------------------------------

describe("enqueueReviewRequests", () => {
  it("returns { enqueued: 0 } immediately when toggle is disabled", async () => {
    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "false" }];
      return [];
    });

    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 0 });
    // enqueueEmail must never be called when the toggle is off
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("returns { enqueued: 0 } when toggle row is missing", async () => {
    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return []; // row absent
      return [];
    });

    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 0 });
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("returns { enqueued: 0 } when toggle is enabled but no eligible reservations", async () => {
    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return []; // no eligible rows
      return [];
    });

    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 0 });
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("enqueues an email for each eligible reservation", async () => {
    const reservations = [
      {
        id: 10,
        email: "guest1@example.com",
        first_name: "Marie",
        name: "Marie T.",
        code: "AVP-ABCDE2",
        arrive: "2025-07-10",
        depart: "2025-07-13",
      },
      {
        id: 11,
        email: "guest2@example.com",
        first_name: "Jean",
        name: "Jean B.",
        code: "AVP-FGH345",
        arrive: "2025-07-11",
        depart: "2025-07-14",
      },
    ];

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return reservations;
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 2 });
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(2);
  });

  it("passes review-request template and correct reviewUrl to enqueueEmail", async () => {
    const reservation = {
      id: 20,
      email: "alice@example.com",
      first_name: "Alice",
      name: "Alice Dupont",
      code: "AVP-RSTUVW",
      arrive: "2025-08-01",
      depart: "2025-08-04",
    };

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return [reservation];
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    await enqueueReviewRequests(sql as any);

    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        template: "review-request",
        to: "alice@example.com",
        payload: expect.objectContaining({
          firstName: "Alice",
          reviewUrl: "https://www.aubergeduvieuxpont.ca/avis/nouveau?code=AVP-RSTUVW",
        }),
      })
    );
  });

  it("builds reviewUrl with the correct code from the reservation", async () => {
    const reservation = {
      id: 30,
      email: "bob@example.com",
      first_name: null,
      name: "Bob Martin",
      code: "AVP-XYZABC",
      arrive: "2025-09-01",
      depart: "2025-09-03",
    };

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return [reservation];
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    await enqueueReviewRequests(sql as any);

    const call = mockEnqueueEmail.mock.calls[0];
    const payload = call[1].payload;
    expect(payload.reviewUrl).toContain("AVP-XYZABC");
    expect(payload.reviewUrl).toContain("/avis/nouveau?code=");
  });

  it("uses first word of name as firstName fallback when first_name is null", async () => {
    const reservation = {
      id: 40,
      email: "carol@example.com",
      first_name: null,
      name: "Carol Lemieux",
      code: "AVP-MNPQRS",
      arrive: "2025-10-01",
      depart: "2025-10-05",
    };

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return [reservation];
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    await enqueueReviewRequests(sql as any);

    const call = mockEnqueueEmail.mock.calls[0];
    expect(call[1].payload.firstName).toBe("Carol");
  });

  it("uses 'client' as firstName when name is completely empty", async () => {
    const reservation = {
      id: 50,
      email: "anon@example.com",
      first_name: null,
      name: "",
      code: "AVP-TUVWXY",
      arrive: "2025-11-01",
      depart: "2025-11-03",
    };

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return [reservation];
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    await enqueueReviewRequests(sql as any);

    const call = mockEnqueueEmail.mock.calls[0];
    expect(call[1].payload.firstName).toBe("client");
  });

  it("INV-request-dedupe: inserts review_requests row before calling enqueueEmail", async () => {
    const callOrder: string[] = [];

    const reservation = {
      id: 60,
      email: "dedup@example.com",
      first_name: "Test",
      name: "Test User",
      code: "AVP-DEDUPE3",
      arrive: "2025-07-20",
      depart: "2025-07-22",
    };

    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("");
      if (q.includes("email_review_request_enabled")) return Promise.resolve([{ value: "true" }]);
      if (q.includes("FROM reservations")) return Promise.resolve([reservation]);
      if (q.includes("INSERT INTO review_requests")) {
        callOrder.push("insert_request");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    mockEnqueueEmail.mockImplementation(async () => {
      callOrder.push("enqueue_email");
      return { enqueued: true };
    });

    await enqueueReviewRequests(sql as any);

    // dedupe row must be inserted before emailing
    expect(callOrder.indexOf("insert_request")).toBeLessThan(
      callOrder.indexOf("enqueue_email")
    );
  });

  it("INV-request-dedupe: counts only reservations with enqueued=true toward result", async () => {
    const reservations = [
      { id: 70, email: "a@example.com", first_name: "A", name: "A", code: "AVP-AAAAAA", arrive: "2025-07-01", depart: "2025-07-03" },
      { id: 71, email: "b@example.com", first_name: "B", name: "B", code: "AVP-BBBBBB", arrive: "2025-07-02", depart: "2025-07-04" },
      { id: 72, email: "c@example.com", first_name: "C", name: "C", code: "AVP-CCCCCC", arrive: "2025-07-03", depart: "2025-07-05" },
    ];

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return reservations;
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    // Only first two enqueueEmail calls succeed
    mockEnqueueEmail
      .mockResolvedValueOnce({ enqueued: true })
      .mockResolvedValueOnce({ enqueued: true })
      .mockResolvedValueOnce({ enqueued: false });

    const result = await enqueueReviewRequests(sql as any);
    expect(result.enqueued).toBe(2);
  });

  it("does not write review_requests when toggle is off (preserves 3-day window)", async () => {
    let requestInserted = false;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const q = strings.join("");
      if (q.includes("email_review_request_enabled")) return Promise.resolve([{ value: "false" }]);
      if (q.includes("INSERT INTO review_requests")) {
        requestInserted = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    await enqueueReviewRequests(sql as any);
    expect(requestInserted).toBe(false);
  });

  it("includes correct checkIn and checkOut in the email payload", async () => {
    const reservation = {
      id: 80,
      email: "dates@example.com",
      first_name: "Date",
      name: "Date Test",
      code: "AVP-DATXYZ",
      arrive: "2025-12-20",
      depart: "2025-12-25",
    };

    const sql = makeSql((q) => {
      if (q.includes("email_review_request_enabled")) return [{ value: "true" }];
      if (q.includes("FROM reservations")) return [reservation];
      if (q.includes("INSERT INTO review_requests")) return [];
      return [];
    });

    await enqueueReviewRequests(sql as any);

    const call = mockEnqueueEmail.mock.calls[0];
    expect(call[1].payload.checkIn).toBe("2025-12-20");
    expect(call[1].payload.checkOut).toBe("2025-12-25");
  });
});

// ---------------------------------------------------------------------------
// EMAIL_TOGGLE_KEYS — review-request toggle registration
// ---------------------------------------------------------------------------

describe("EMAIL_TOGGLE_KEYS (review-request)", () => {
  it("maps review-request to email_review_request_enabled", async () => {
    // The mock preserves all real exports via importOriginal (see vi.mock above).
    const { EMAIL_TOGGLE_KEYS } = await import("../src/emailOutbox");
    expect(EMAIL_TOGGLE_KEYS["review-request"]).toBe("email_review_request_enabled");
  });
});
