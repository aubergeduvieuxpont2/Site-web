/**
 * Route-level tests for:
 *   - POST /api/admin/reservations/:id/review-request
 *
 * Follows the mocked-neon pattern from adminReservations.test.ts: drive the
 * exported `app` directly so a route deletion causes a 404 and the test fails
 * (enforces INV-route-mounted).
 *
 * Focus: the route must not re-solicit a guest who already left a review.
 * `responded_at` on review_requests is only backfilled going forward
 * (migration 0046) — a guest who reviewed before that migration ran has a
 * row in `reviews` (present since migration 0039) but no `responded_at`
 * stamp, so the route must also check `reviews` directly.
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

import { app } from "./index";

const ENV = { DB_CONN: "postgres://stub" } as any;

const ADMIN_USER = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

const RESERVATION_ROW = {
  id: 42,
  email: "jean@example.com",
  first_name: "Jean",
  name: "Jean Dupont",
  code: "AVP-ABCDEF",
  arrive: "2026-07-10",
  depart: "2026-07-15",
  has_request: false,
  responded_at: null as string | null,
  has_review: false,
};

function makeAdminSql(reservationRow: Record<string, unknown> | null) {
  return (strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }
    if (q.includes("FROM reservations r") && q.includes("LEFT JOIN review_requests")) {
      return Promise.resolve(reservationRow ? [reservationRow] : []);
    }
    return Promise.resolve([]);
  };
}

describe("POST /api/admin/reservations/:id/review-request (route-mounted)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when no session cookie — route is mounted", async () => {
    neonHolder.sql = () => Promise.resolve([]);
    const res = await app.request(
      "http://localhost/api/admin/reservations/42/review-request",
      { method: "POST" },
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the reservation does not exist", async () => {
    neonHolder.sql = makeAdminSql(null);
    const res = await app.request(
      "http://localhost/api/admin/reservations/42/review-request",
      { method: "POST", headers: { Cookie: "session=t" } },
      ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when responded_at is already stamped", async () => {
    neonHolder.sql = makeAdminSql({
      ...RESERVATION_ROW,
      responded_at: "2026-07-20T14:00:00Z",
    });
    const res = await app.request(
      "http://localhost/api/admin/reservations/42/review-request",
      { method: "POST", headers: { Cookie: "session=t" } },
      ENV,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Le client a déjà laissé un avis");
  });

  // Regression test for the fix: a review submitted before migration 0046
  // (or via any path that left responded_at unset) must still block a resend.
  it("returns 409 when a review exists even though responded_at was never backfilled", async () => {
    neonHolder.sql = makeAdminSql({
      ...RESERVATION_ROW,
      responded_at: null,
      has_review: true,
    });
    const res = await app.request(
      "http://localhost/api/admin/reservations/42/review-request",
      { method: "POST", headers: { Cookie: "session=t" } },
      ENV,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Le client a déjà laissé un avis");
  });

  it("succeeds when neither responded_at nor a review exists", async () => {
    neonHolder.sql = makeAdminSql({ ...RESERVATION_ROW });
    const res = await app.request(
      "http://localhost/api/admin/reservations/42/review-request",
      { method: "POST", headers: { Cookie: "session=t" } },
      ENV,
    );
    expect(res.status).toBe(200);
  });
});
