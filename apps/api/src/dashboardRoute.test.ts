/**
 * Route-level integration tests for GET /api/admin/dashboard.
 *
 * These tests instantiate the exported `app` from index.ts (not the router in
 * isolation), so a deletion of the app.route() call in index.ts will cause
 * every test here to receive 404 and fail — enforcing INV-route-mounted.
 *
 * Unit-level tests for getDashboardData helpers live in dashboard.test.ts.
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

// Mock availability so the dashboard handler doesn't need real SQL for it.
vi.mock("./availability", () => ({
  availabilityForRange: vi.fn(),
}));

import { availabilityForRange } from "./availability";
import { app } from "./index";

const mockAvailability = vi.mocked(availabilityForRange);

const ENV = { DB_CONN: "postgres://stub" } as any;

// ── Fixture users ─────────────────────────────────────────────────────────────

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

// ── SQL mock helpers ──────────────────────────────────────────────────────────

function makeAnonSql() {
  return () => Promise.resolve([]);
}

function makeGuestSql() {
  return (strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([GUEST_USER]);
    }
    return Promise.resolve([]);
  };
}

/**
 * SQL mock for a fully-authenticated admin fetching the dashboard.
 * Routes each query by content; extra() is called for unmatched queries.
 */
function makeAdminDashboardSql(opts?: {
  assignableRoomCount?: number;
  roomNights?: string | null;
  thisWeek?: string;
  lastWeek?: string;
  returningCount?: string;
}) {
  const {
    assignableRoomCount = 12,
    roomNights = "60",
    thisWeek = "5",
    lastWeek = "3",
    returningCount = "2",
  } = opts ?? {};

  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");

    // 1. Session validation
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }

    // 2. Settings lookup (for assignableRoomCount)
    if (q.includes("FROM settings")) {
      return Promise.resolve([
        { key: "assignable_room_count", value: String(assignableRoomCount) },
      ]);
    }

    // 3. Week guests aggregate
    if (q.includes("this_week") || q.includes("last_week")) {
      return Promise.resolve([{ this_week: thisWeek, last_week: lastWeek }]);
    }

    // 4. Occupancy queries (three of them, all have "room_nights")
    if (q.includes("room_nights")) {
      return Promise.resolve([{ room_nights: roomNights }]);
    }

    // 5. Returning customers
    if (q.includes("guest_key")) {
      return Promise.resolve([{ count: returningCount }]);
    }

    return Promise.resolve([]);
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/dashboard (INV-route-mounted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAvailability.mockResolvedValue({ nights: [], unavailableNights: [] });
  });

  // ── Authentication / authorisation ─────────────────────────────────────────

  it("returns 401 (not 404) when no session cookie is present — route is mounted", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      {},
      ENV
    );
    // 401 proves the route matched; 404 would mean it was deleted.
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as a non-admin user", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    expect(res.status).toBe(403);
  });

  // ── Happy path — payload shape (spec §5) ───────────────────────────────────

  it("returns 200 with all required top-level fields for an admin", async () => {
    neonHolder.sql = makeAdminDashboardSql();
    mockAvailability.mockResolvedValue({
      nights: [
        { date: "2026-07-18", available: 12 },
        { date: "2026-07-19", available: 10 },
      ],
      unavailableNights: [],
    });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body).toHaveProperty("guestsThisWeek");
    expect(body).toHaveProperty("guestsLastWeek");
    expect(body).toHaveProperty("next7Days");
    expect(body).toHaveProperty("occupancy");
    expect(body).toHaveProperty("returningCustomers");
  });

  it("returns integer guest counts from SQL aggregates", async () => {
    neonHolder.sql = makeAdminDashboardSql({ thisWeek: "25", lastWeek: "18" });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.guestsThisWeek).toBe(25);
    expect(body.guestsLastWeek).toBe(18);
  });

  it("returns next7Days array from availabilityForRange", async () => {
    neonHolder.sql = makeAdminDashboardSql();
    const stub = [
      { date: "2026-07-18", available: 8 },
      { date: "2026-07-19", available: 5 },
    ];
    mockAvailability.mockResolvedValue({ nights: stub, unavailableNights: [] });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.next7Days).toEqual(stub);
  });

  it("returns returningCustomers as a number", async () => {
    neonHolder.sql = makeAdminDashboardSql({ returningCount: "7" });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.returningCustomers).toBe(7);
    expect(typeof body.returningCustomers).toBe("number");
  });

  // ── occupancy shape (spec §5 — null-safe ratios) ──────────────────────────

  it("returns occupancy with three ratio fields", async () => {
    neonHolder.sql = makeAdminDashboardSql();

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.occupancy).toHaveProperty("currentMonth");
    expect(body.occupancy).toHaveProperty("previousMonth");
    expect(body.occupancy).toHaveProperty("sameMonthLastYear");
  });

  it("returns null occupancy ratios (not 0) when assignableRoomCount is 0 (spec §5 null-safe)", async () => {
    neonHolder.sql = makeAdminDashboardSql({ assignableRoomCount: 0, roomNights: "50" });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    expect(body.occupancy.currentMonth).toBeNull();
    expect(body.occupancy.previousMonth).toBeNull();
    expect(body.occupancy.sameMonthLastYear).toBeNull();
  });

  it("returns numeric occupancy ratios when rooms > 0 and room_nights > 0", async () => {
    neonHolder.sql = makeAdminDashboardSql({ assignableRoomCount: 12, roomNights: "60" });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    // All ratios should be numeric (non-null) when rooms > 0
    expect(typeof body.occupancy.currentMonth).toBe("number");
    expect(typeof body.occupancy.previousMonth).toBe("number");
    expect(typeof body.occupancy.sameMonthLastYear).toBe("number");
  });

  it("returns occupancy ratio of 0 (not null) when room_nights is null but rooms > 0", async () => {
    neonHolder.sql = makeAdminDashboardSql({ assignableRoomCount: 12, roomNights: null });

    const res = await app.request(
      "http://localhost/api/admin/dashboard",
      { headers: { Cookie: "session=t" } },
      ENV
    );
    const body = (await res.json()) as any;
    // null room_nights with valid denominator → ratio 0, not null
    expect(body.occupancy.currentMonth).toBe(0);
  });
});
