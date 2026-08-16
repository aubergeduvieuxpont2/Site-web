/**
 * Route-level tests for:
 *   POST /api/admin/reservations/:id/review-request
 *
 * An admin pressing this button IS the operator expressing intent, so the
 * route deliberately bypasses the send-timing settings, the per-guest
 * suppression window, and the email_review_request_enabled toggle (via
 * enqueueEmail's `force` flag). It does NOT bypass `responded_at`: re-asking
 * a guest who already left a review is pure noise.
 *
 * Follows the mocked-neon + app.request() pattern from reviewsRoutes.test.ts
 * so a route deletion causes a 404 and the test fails (INV-route-mounted).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoist neon mock before any module resolution ──────────────────────────────
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      neonHolder.sql(strings, ...values),
}));
vi.mock("../emailOutbox", async (orig) => ({
  ...(await orig<typeof import("../emailOutbox")>()),
  enqueueEmail: vi.fn().mockResolvedValue({ enqueued: true }),
}));

import { app } from "../index";
import { enqueueEmail } from "../emailOutbox";

const ENV = { DB_CONN: "postgres://stub" } as any;
const mockEnqueueEmail = vi.mocked(enqueueEmail);

// ── Fixture users (same shape as reviewsRoutes.test.ts) ────────────────────────
const ADMIN_USER = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

const GUEST_USER = {
  id: 2,
  email: "guest@example.com",
  name: "Guest",
  role: "guest",
  hubspot_contact_id: null,
};

const ADMIN_HEADERS = { Cookie: "session=t" };

const RESERVATION = {
  id: 42,
  email: "marie@example.com",
  first_name: "Marie",
  name: "Marie Tremblay",
  code: "AVP-ABCDEF",
  arrive: "2026-07-10",
  depart: "2026-07-15",
  has_request: false,
  responded_at: null,
};

/**
 * Stubs the session-lookup query (routed to `sessionUser`) and the
 * reservation + review_requests lookup query (routed to `row`). Returns the
 * recorded statement texts so assertions can inspect the upsert SQL.
 */
function stubDb(
  row: Record<string, unknown> | null,
  sessionUser: typeof ADMIN_USER | typeof GUEST_USER | null = ADMIN_USER
) {
  const statements: string[] = [];
  neonHolder.sql = (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    statements.push(text);
    if (text.includes("FROM sessions") && text.includes("JOIN users")) {
      return Promise.resolve(sessionUser ? [sessionUser] : []);
    }
    if (text.includes("LEFT JOIN review_requests")) {
      return Promise.resolve(row ? [row] : []);
    }
    return Promise.resolve([]);
  };
  return statements;
}

function post(id: number | string = RESERVATION.id, headers: Record<string, string> = ADMIN_HEADERS) {
  return app.request(
    `/api/admin/reservations/${id}/review-request`,
    { method: "POST", headers },
    ENV
  );
}

describe("POST /api/admin/reservations/:id/review-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    stubDb(RESERVATION);
    const res = await post(RESERVATION.id, {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    stubDb(RESERVATION, GUEST_USER);
    const res = await post();
    expect(res.status).toBe(403);
  });

  it("returns 404 when the reservation does not exist", async () => {
    stubDb(null);
    const res = await post();
    expect(res.status).toBe(404);
  });

  it("returns 400 when the reservation has no email", async () => {
    stubDb({ ...RESERVATION, email: "" });
    const res = await post();
    expect(res.status).toBe(400);
  });

  it("returns 400 when the reservation has no code", async () => {
    stubDb({ ...RESERVATION, code: null });
    const res = await post();
    expect(res.status).toBe(400);
  });

  it("returns 409 when the guest already responded", async () => {
    stubDb({ ...RESERVATION, has_request: true, responded_at: "2026-08-03T12:00:00Z" });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("sends with force:true so a disabled toggle does not block it", async () => {
    stubDb(RESERVATION);
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ template: "review-request", force: true })
    );
  });

  it("clears reminder_sent_at on resend", async () => {
    const statements = stubDb({ ...RESERVATION, has_request: true });
    await post();
    const upsert = statements.find((s) => s.includes("INSERT INTO review_requests"));
    expect(upsert).toContain("reminder_sent_at = NULL");
  });

  it("reports resent:false for a first send and true for a resend", async () => {
    stubDb(RESERVATION);
    expect(await (await post()).json()).toMatchObject({ sent: true, resent: false });

    stubDb({ ...RESERVATION, has_request: true });
    expect(await (await post()).json()).toMatchObject({ sent: true, resent: true });
  });
});
