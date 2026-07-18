import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeEmailBackoff,
  isTransientResendFailure,
  EMAIL_FROM,
  EMAIL_TOGGLE_KEYS,
  enqueueEmail,
  drainEmailOutbox,
} from "../src/emailOutbox";

// ---------------------------------------------------------------------------
// Pure-helper tests
// ---------------------------------------------------------------------------

describe("computeEmailBackoff", () => {
  it("returns 30 for attempts=1", () => {
    expect(computeEmailBackoff(1)).toBe(30);
  });

  it("returns 60 for attempts=2", () => {
    expect(computeEmailBackoff(2)).toBe(60);
  });

  it("returns 3600 for attempts=8 (cap)", () => {
    expect(computeEmailBackoff(8)).toBe(3600);
  });

  it("caps at 3600 for very large attempts", () => {
    expect(computeEmailBackoff(100)).toBe(3600);
  });
});

describe("isTransientResendFailure", () => {
  it("returns true for 429", () => {
    expect(isTransientResendFailure(429)).toBe(true);
  });

  it("returns true for 500", () => {
    expect(isTransientResendFailure(500)).toBe(true);
  });

  it("returns true for 503", () => {
    expect(isTransientResendFailure(503)).toBe(true);
  });

  it("returns false for 400", () => {
    expect(isTransientResendFailure(400)).toBe(false);
  });

  it("returns false for 422", () => {
    expect(isTransientResendFailure(422)).toBe(false);
  });

  it("returns false for 200", () => {
    expect(isTransientResendFailure(200)).toBe(false);
  });
});

describe("EMAIL_FROM", () => {
  it("is set to the expected sender address", () => {
    expect(EMAIL_FROM).toBe(
      "Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>"
    );
  });
});

describe("EMAIL_TOGGLE_KEYS", () => {
  it("maps reservation-confirmation to email_confirmation_enabled", () => {
    expect(EMAIL_TOGGLE_KEYS["reservation-confirmation"]).toBe(
      "email_confirmation_enabled"
    );
  });

  it("maps password-reset to email_password_reset_enabled", () => {
    expect(EMAIL_TOGGLE_KEYS["password-reset"]).toBe(
      "email_password_reset_enabled"
    );
  });

  it("maps room-assigned to email_room_assignment_enabled", () => {
    expect(EMAIL_TOGGLE_KEYS["room-assigned"]).toBe(
      "email_room_assignment_enabled"
    );
  });

  it("maps ota-welcome to email_welcome_enabled", () => {
    expect(EMAIL_TOGGLE_KEYS["ota-welcome"]).toBe("email_welcome_enabled");
  });
});

// ---------------------------------------------------------------------------
// enqueueEmail — mock sql
// ---------------------------------------------------------------------------

function makeSql(...responses: unknown[][]) {
  let i = 0;
  return (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    const result = responses[i++] ?? [];
    return Promise.resolve(result);
  };
}

describe("enqueueEmail", () => {
  it("inserts a row when the toggle is 'true'", async () => {
    let insertCalled = false;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT value")) {
        return Promise.resolve([{ value: "true" }]);
      }
      if (query.includes("INSERT INTO email_outbox")) {
        insertCalled = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const result = await enqueueEmail(sql as any, {
      template: "ota-welcome",
      to: "guest@example.com",
      payload: { firstName: "Jean" },
    });

    expect(result.enqueued).toBe(true);
    expect(insertCalled).toBe(true);
  });

  it("skips insert when the toggle is 'false'", async () => {
    let insertCalled = false;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT value")) {
        return Promise.resolve([{ value: "false" }]);
      }
      if (query.includes("INSERT INTO email_outbox")) {
        insertCalled = true;
      }
      return Promise.resolve([]);
    };

    const result = await enqueueEmail(sql as any, {
      template: "ota-welcome",
      to: "guest@example.com",
      payload: {},
    });

    expect(result.enqueued).toBe(false);
    expect(insertCalled).toBe(false);
  });

  it("skips insert when the toggle row is missing", async () => {
    const sql = (_strings: TemplateStringsArray, ..._values: unknown[]) =>
      Promise.resolve([]);

    const result = await enqueueEmail(sql as any, {
      template: "ota-welcome",
      to: "guest@example.com",
      payload: {},
    });

    expect(result.enqueued).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// drainEmailOutbox — mock neon + fetch
// ---------------------------------------------------------------------------

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(),
}));

vi.mock("../src/emails/routes", () => ({
  contactContext: vi.fn().mockResolvedValue({
    contactPhone: "418 655-1212",
    contactPhoneHref: "tel:+14186551212",
    contactEmail: "info@aubergeduvieuxpont.ca",
  }),
}));

describe("drainEmailOutbox", () => {
  let mockNeon: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("@neondatabase/serverless");
    mockNeon = mod.neon as ReturnType<typeof vi.fn>;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("marks row delivered and returns {delivered: 1} on Resend 200", async () => {
    const rows = [
      {
        id: 1,
        to_email: "guest@example.com",
        template: "ota-welcome",
        locale: "fr",
        payload: {
          firstName: "Sophie",
          confirmationCode: "EXP-001",
          checkIn: "2026-09-05",
          checkOut: "2026-09-08",
          setPasswordUrl: "https://example.com/reset?token=abc",
        },
        attempts: 0,
      },
    ];

    let updateCalled = false;
    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT id")) return Promise.resolve(rows);
      if (query.includes("UPDATE email_outbox") && query.includes("delivered")) {
        updateCalled = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(mockSql);

    vi.mocked(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ id: "resend-abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await drainEmailOutbox({
      DB_CONN: "postgres://test",
      RESEND_API_KEY: "re_test_key",
    });

    expect(result.delivered).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(0);
    expect(updateCalled).toBe(true);
  });

  it("sets next_attempt_at on Resend 429 (retry path)", async () => {
    const rows = [
      {
        id: 2,
        to_email: "guest@example.com",
        template: "ota-welcome",
        locale: "fr",
        payload: {
          firstName: "Marie",
          confirmationCode: "EXP-002",
          checkIn: "2026-09-10",
          checkOut: "2026-09-12",
          setPasswordUrl: "https://example.com/reset?token=xyz",
        },
        attempts: 0,
      },
    ];

    let retryUpdateCalled = false;
    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT id")) return Promise.resolve(rows);
      if (
        query.includes("UPDATE email_outbox") &&
        query.includes("next_attempt_at")
      ) {
        retryUpdateCalled = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(mockSql);

    vi.mocked(global.fetch as any).mockResolvedValue(
      new Response("Too Many Requests", {
        status: 429,
      })
    );

    const result = await drainEmailOutbox({
      DB_CONN: "postgres://test",
      RESEND_API_KEY: "re_test_key",
    });

    expect(result.retried).toBe(1);
    expect(result.delivered).toBe(0);
    expect(retryUpdateCalled).toBe(true);
  });

  it("marks row failed on Resend 422 (permanent failure)", async () => {
    const rows = [
      {
        id: 3,
        to_email: "bad@example.com",
        template: "ota-welcome",
        locale: "fr",
        payload: {
          firstName: "Paul",
          confirmationCode: "EXP-003",
          checkIn: "2026-09-15",
          checkOut: "2026-09-17",
          setPasswordUrl: "https://example.com/reset?token=zzz",
        },
        attempts: 0,
      },
    ];

    let failedUpdateCalled = false;
    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT id")) return Promise.resolve(rows);
      if (
        query.includes("UPDATE email_outbox") &&
        query.includes("'failed'")
      ) {
        failedUpdateCalled = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(mockSql);

    vi.mocked(global.fetch as any).mockResolvedValue(
      new Response("Unprocessable Entity", { status: 422 })
    );

    const result = await drainEmailOutbox({
      DB_CONN: "postgres://test",
      RESEND_API_KEY: "re_test_key",
    });

    expect(result.failed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(failedUpdateCalled).toBe(true);
  });

  it("resolves without throwing when a network error is thrown", async () => {
    const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("");
      if (query.includes("SELECT id"))
        return Promise.resolve([
          {
            id: 4,
            to_email: "test@example.com",
            template: "ota-welcome",
            locale: "fr",
            payload: {
              firstName: "Luc",
              confirmationCode: "EXP-004",
              checkIn: "2026-09-20",
              checkOut: "2026-09-22",
              setPasswordUrl: "https://example.com/reset?token=qrs",
            },
            attempts: 0,
          },
        ]);
      return Promise.resolve([]);
    };
    mockNeon.mockReturnValue(mockSql);

    vi.mocked(global.fetch as any).mockRejectedValue(
      new Error("Network failure")
    );

    await expect(
      drainEmailOutbox({ DB_CONN: "postgres://test", RESEND_API_KEY: "re_test_key" })
    ).resolves.toBeDefined();
  });
});
