import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EMAIL_TOGGLE_KEYS,
  ALWAYS_SEND,
  computeEmailBackoff,
  isTransientResendFailure,
  enqueueEmail,
  MAX_ATTEMPTS,
  type EmailTemplate,
} from "./emailOutbox";

// ── EMAIL_TOGGLE_KEYS ─────────────────────────────────────────────────────────

describe("EMAIL_TOGGLE_KEYS", () => {
  it("maps reservation-confirmation to the correct settings key", () => {
    expect(EMAIL_TOGGLE_KEYS["reservation-confirmation"]).toBe(
      "email_confirmation_enabled"
    );
  });

  it("maps password-reset to the correct settings key", () => {
    expect(EMAIL_TOGGLE_KEYS["password-reset"]).toBe(
      "email_password_reset_enabled"
    );
  });

  it("maps room-assigned to the correct settings key", () => {
    expect(EMAIL_TOGGLE_KEYS["room-assigned"]).toBe(
      "email_room_assignment_enabled"
    );
  });

  it("maps ota-welcome to the correct settings key", () => {
    expect(EMAIL_TOGGLE_KEYS["ota-welcome"]).toBe("email_welcome_enabled");
  });

  it("maps review-request to email_review_request_enabled", () => {
    expect(EMAIL_TOGGLE_KEYS["review-request"]).toBe(
      "email_review_request_enabled"
    );
  });

  it("does not include email-verification (ALWAYS_SEND, not toggled)", () => {
    expect("email-verification" in EMAIL_TOGGLE_KEYS).toBe(false);
  });

  it("does not include email-change-alert (ALWAYS_SEND, not toggled)", () => {
    expect("email-change-alert" in EMAIL_TOGGLE_KEYS).toBe(false);
  });
});

// ── ALWAYS_SEND ───────────────────────────────────────────────────────────────

describe("ALWAYS_SEND", () => {
  it("includes email-verification", () => {
    expect(ALWAYS_SEND.has("email-verification")).toBe(true);
  });

  it("includes email-change-alert", () => {
    expect(ALWAYS_SEND.has("email-change-alert")).toBe(true);
  });

  it("does NOT include review-request", () => {
    expect(ALWAYS_SEND.has("review-request")).toBe(false);
  });

  it("does NOT include reservation-confirmation", () => {
    expect(ALWAYS_SEND.has("reservation-confirmation")).toBe(false);
  });

  it("does NOT include password-reset", () => {
    expect(ALWAYS_SEND.has("password-reset")).toBe(false);
  });
});

// ── MAX_ATTEMPTS ──────────────────────────────────────────────────────────────

describe("MAX_ATTEMPTS", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(MAX_ATTEMPTS)).toBe(true);
    expect(MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it("is 8", () => {
    expect(MAX_ATTEMPTS).toBe(8);
  });
});

// ── computeEmailBackoff ───────────────────────────────────────────────────────

describe("computeEmailBackoff", () => {
  it("returns 30 seconds on attempt 1 (base delay)", () => {
    expect(computeEmailBackoff(1)).toBe(30);
  });

  it("doubles each attempt: attempt 2 → 60s", () => {
    expect(computeEmailBackoff(2)).toBe(60);
  });

  it("doubles each attempt: attempt 3 → 120s", () => {
    expect(computeEmailBackoff(3)).toBe(120);
  });

  it("doubles each attempt: attempt 4 → 240s", () => {
    expect(computeEmailBackoff(4)).toBe(240);
  });

  it("caps at 3600s (1 hour)", () => {
    expect(computeEmailBackoff(10)).toBe(3600);
    expect(computeEmailBackoff(100)).toBe(3600);
  });

  it("never exceeds 3600", () => {
    for (let i = 1; i <= 20; i++) {
      expect(computeEmailBackoff(i)).toBeLessThanOrEqual(3600);
    }
  });

  it("is strictly increasing until the cap", () => {
    let prev = 0;
    for (let i = 1; i <= 8; i++) {
      const delay = computeEmailBackoff(i);
      if (delay < 3600) {
        expect(delay).toBeGreaterThan(prev);
      }
      prev = delay;
    }
  });
});

// ── isTransientResendFailure ──────────────────────────────────────────────────

describe("isTransientResendFailure", () => {
  it("returns true for 429 (rate limited)", () => {
    expect(isTransientResendFailure(429)).toBe(true);
  });

  it("returns true for 500 (server error)", () => {
    expect(isTransientResendFailure(500)).toBe(true);
  });

  it("returns true for 502", () => {
    expect(isTransientResendFailure(502)).toBe(true);
  });

  it("returns true for 503", () => {
    expect(isTransientResendFailure(503)).toBe(true);
  });

  it("returns true for 599 (top of server error range)", () => {
    expect(isTransientResendFailure(599)).toBe(true);
  });

  it("returns false for 200 (success)", () => {
    expect(isTransientResendFailure(200)).toBe(false);
  });

  it("returns false for 201 (created)", () => {
    expect(isTransientResendFailure(201)).toBe(false);
  });

  it("returns false for 400 (bad request — permanent failure)", () => {
    expect(isTransientResendFailure(400)).toBe(false);
  });

  it("returns false for 401 (unauthorized — permanent)", () => {
    expect(isTransientResendFailure(401)).toBe(false);
  });

  it("returns false for 403 (forbidden — permanent)", () => {
    expect(isTransientResendFailure(403)).toBe(false);
  });

  it("returns false for 404 (not found — permanent)", () => {
    expect(isTransientResendFailure(404)).toBe(false);
  });

  it("returns false for 422 (unprocessable — permanent)", () => {
    expect(isTransientResendFailure(422)).toBe(false);
  });
});

// ── enqueueEmail ──────────────────────────────────────────────────────────────

describe("enqueueEmail", () => {
  let mockSql: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSql = vi.fn();
  });

  // ── Toggle-gated templates ─────────────────────────────────────────────────

  it("returns enqueued:false when review-request toggle is disabled", async () => {
    mockSql.mockResolvedValue([{ value: "false" }]);
    const result = await enqueueEmail(mockSql as any, {
      template: "review-request",
      to: "guest@example.com",
      payload: { firstName: "Marie" },
    });
    expect(result.enqueued).toBe(false);
    expect(mockSql).toHaveBeenCalledTimes(1); // only the SELECT, no INSERT
  });

  it("returns enqueued:false when review-request toggle row is missing", async () => {
    mockSql.mockResolvedValue([]); // no settings row
    const result = await enqueueEmail(mockSql as any, {
      template: "review-request",
      to: "guest@example.com",
      payload: {},
    });
    expect(result.enqueued).toBe(false);
  });

  it("inserts into email_outbox and returns enqueued:true when review-request toggle is enabled", async () => {
    mockSql
      .mockResolvedValueOnce([{ value: "true" }]) // toggle SELECT
      .mockResolvedValueOnce([]);                 // INSERT
    const result = await enqueueEmail(mockSql as any, {
      template: "review-request",
      to: "guest@example.com",
      payload: { firstName: "Marie", reviewUrl: "https://example.com/avis/nouveau?code=AVP-ABCDEF" },
    });
    expect(result.enqueued).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(2); // SELECT + INSERT
  });

  it("checks the correct toggle key for reservation-confirmation", async () => {
    mockSql.mockResolvedValue([{ value: "true" }]);
    await enqueueEmail(mockSql as any, {
      template: "reservation-confirmation",
      to: "guest@example.com",
      payload: {},
    });
    // The first sql call should query the confirmation toggle key
    const firstCallArgs = mockSql.mock.calls[0];
    expect(firstCallArgs[1]).toBe("email_confirmation_enabled");
  });

  it("checks email_review_request_enabled key for review-request", async () => {
    mockSql.mockResolvedValue([{ value: "false" }]);
    await enqueueEmail(mockSql as any, {
      template: "review-request",
      to: "guest@example.com",
      payload: {},
    });
    const firstCallArgs = mockSql.mock.calls[0];
    expect(firstCallArgs[1]).toBe("email_review_request_enabled");
  });

  // ── ALWAYS_SEND templates bypass the toggle ────────────────────────────────

  it("bypasses the toggle for email-verification and always enqueues", async () => {
    mockSql.mockResolvedValue([]); // INSERT succeeds (no SELECT called)
    const result = await enqueueEmail(mockSql as any, {
      template: "email-verification",
      to: "guest@example.com",
      payload: { token: "abc123" },
    });
    expect(result.enqueued).toBe(true);
    // Only one SQL call: the INSERT (no toggle SELECT)
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("bypasses the toggle for email-change-alert and always enqueues", async () => {
    mockSql.mockResolvedValue([]);
    const result = await enqueueEmail(mockSql as any, {
      template: "email-change-alert",
      to: "guest@example.com",
      payload: {},
    });
    expect(result.enqueued).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  // ── Default locale ─────────────────────────────────────────────────────────

  it("defaults locale to fr when not specified", async () => {
    mockSql.mockResolvedValue([]);
    await enqueueEmail(mockSql as any, {
      template: "email-verification",
      to: "guest@example.com",
      payload: {},
    });
    // The INSERT call should pass locale "fr"
    const insertCallArgs = mockSql.mock.calls[0];
    // Interpolated values: [to, template, locale, payload]
    expect(insertCallArgs[3]).toBe("fr");
  });

  it("uses the specified locale when provided", async () => {
    mockSql.mockResolvedValue([]);
    await enqueueEmail(mockSql as any, {
      template: "email-verification",
      to: "guest@example.com",
      locale: "en",
      payload: {},
    });
    const insertCallArgs = mockSql.mock.calls[0];
    expect(insertCallArgs[3]).toBe("en");
  });
});
