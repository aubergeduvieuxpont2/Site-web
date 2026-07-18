import { describe, it, expect, beforeEach, vi } from "vitest";

// Per-test Neon stub, swapped via a hoisted holder (vi.mock is hoisted to the
// top of the module before any imports are resolved).
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

// ─── Fixture users ────────────────────────────────────────────────────────────

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

// ─── SQL mock factories ───────────────────────────────────────────────────────

// Returns admin user for session lookups; routes other queries to `extra`.
function makeAdminSql(
  extra?: (q: string, vals: unknown[]) => unknown[] | undefined
) {
  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }
    const r = extra?.(q, vals);
    return Promise.resolve(r ?? []);
  };
}

// Returns a guest user for session lookups (used to test 403 paths).
function makeGuestSql() {
  return (strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([GUEST_USER]);
    }
    return Promise.resolve([]);
  };
}

// No session data at all — unauthenticated.
function makeAnonSql() {
  return () => Promise.resolve([]);
}

// ─── Request helpers ──────────────────────────────────────────────────────────

const ADMIN_JSON_HEADERS = {
  Cookie: "session=t",
  "Content-Type": "application/json",
};

const ADMIN_HEADERS = { Cookie: "session=t" };

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/admin/blackouts/range — OP-Blackout.upsertRange
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/admin/blackouts/range (OP-Blackout.upsertRange)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Authentication / authorisation ─────────────────────────────────────────

  it("returns 401 when no session cookie is present", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-07", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as a non-admin user", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-07", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(403);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns 200 { count: 1 } for a single-day range (startDate === endDate)", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({
          startDate: "2026-08-01",
          endDate: "2026-08-01",
          roomsBlocked: 12,
          note: "Fête nationale",
        }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(1);
  });

  it("returns { count: 7 } for a 7-day range", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-07", roomsBlocked: 6 }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(7);
  });

  it("INV-perday-storage: count equals the inclusive day count of the range", async () => {
    // Aug 1–31 = 31 days inclusive
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-31", roomsBlocked: 4 }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(31);
  });

  it("accepts the maximum 366-day span (leap year Jan 1 – Dec 31)", async () => {
    // 2028 is a leap year: Dec 31 – Jan 1 = 365 diff days → spanDays = 366 ≤ 366 (allowed)
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2028-01-01", endDate: "2028-12-31", roomsBlocked: 1 }),
      },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(366);
  });

  it("accepts a null note", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-09-01", endDate: "2026-09-03", roomsBlocked: 12, note: null }),
      },
      ENV
    );
    expect(res.status).toBe(200);
  });

  it("accepts an omitted note field", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-09-01", endDate: "2026-09-05", roomsBlocked: 8 }),
      },
      ENV
    );
    expect(res.status).toBe(200);
  });

  it("accepts roomsBlocked: 0 (close property entirely)", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-09-01", endDate: "2026-09-01", roomsBlocked: 0 }),
      },
      ENV
    );
    expect(res.status).toBe(200);
  });

  // ── ERR-BADRANGE ────────────────────────────────────────────────────────────

  it("ERR-BADRANGE: returns 400 when startDate > endDate (inverted range)", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-07", endDate: "2026-08-01", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when span exceeds 366 days", async () => {
    // 2027-01-02 – 2026-01-01 = 366 days diff → spanDays = 367 > 366
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-01-01", endDate: "2027-01-02", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when startDate is not ISO YYYY-MM-DD format", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "01/08/2026", endDate: "2026-08-07", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when endDate is not ISO YYYY-MM-DD format", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "Aug 7 2026", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when startDate is missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ endDate: "2026-08-07", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when endDate is missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", roomsBlocked: 12 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when roomsBlocked is missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-07" }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when roomsBlocked is negative", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      {
        method: "POST",
        headers: ADMIN_JSON_HEADERS,
        body: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-07", roomsBlocked: -1 }),
      },
      ENV
    );
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/admin/blackouts/range — OP-Blackout.deleteRange
// ══════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/admin/blackouts/range (OP-Blackout.deleteRange)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Authentication / authorisation ─────────────────────────────────────────

  it("returns 401 when no session cookie is present", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-01&end=2026-08-07",
      { method: "DELETE" },
      ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as a non-admin user", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-01&end=2026-08-07",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(403);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns { deleted: 3 } when 3 rows are removed", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("DELETE FROM blackout_dates")) {
        return [{ date: "2026-08-01" }, { date: "2026-08-02" }, { date: "2026-08-03" }];
      }
    });
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-01&end=2026-08-03",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.deleted).toBe(3);
  });

  it("returns { deleted: 0 } when no rows match the range", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("DELETE FROM blackout_dates")) return [];
    });
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2030-01-01&end=2030-01-31",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.deleted).toBe(0);
  });

  it("returns { deleted: 1 } for a single-day range", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("DELETE FROM blackout_dates")) return [{ date: "2026-08-15" }];
    });
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-15&end=2026-08-15",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.deleted).toBe(1);
  });

  it("response has a numeric deleted field (not a string)", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("DELETE FROM blackout_dates")) return [{ date: "2026-09-01" }];
    });
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-09-01&end=2026-09-01",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    const body = (await res.json()) as any;
    expect(typeof body.deleted).toBe("number");
  });

  // ── ERR-BADRANGE ────────────────────────────────────────────────────────────

  it("ERR-BADRANGE: returns 400 when start param is missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?end=2026-08-07",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when end param is missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-01",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when both params are missing", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when start is not ISO YYYY-MM-DD format", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=08-01-2026&end=2026-08-07",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when end is not ISO YYYY-MM-DD format", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-01&end=2026-8-7",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });

  it("ERR-BADRANGE: returns 400 when start > end (inverted range)", async () => {
    neonHolder.sql = makeAdminSql();
    const res = await app.request(
      "http://localhost/api/admin/blackouts/range?start=2026-08-07&end=2026-08-01",
      { method: "DELETE", headers: ADMIN_HEADERS },
      ENV
    );
    expect(res.status).toBe(400);
  });
});
