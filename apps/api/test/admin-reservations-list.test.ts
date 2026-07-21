import { describe, it, expect, vi } from "vitest";

// Mutable holder so individual tests can swap the SQL implementation without
// re-importing the module (vi.mock is hoisted before imports).
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      neonHolder.sql(strings, ...vals),
}));

import { app } from "../src/index";

const env = { DB_CONN: "postgres://stub" } as any;

const ADMIN_USER = {
  id: 1,
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  hubspot_contact_id: null,
};

/** E-Reservation fixture that includes all fields added in Stream 2. */
const FAKE_RESERVATION = {
  id: 7,
  code: "RES-2026-007",
  name: "Jane Doe",
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  phone: null,
  room: "Suite Panorama",
  arrive: "2026-09-01",
  depart: "2026-09-03",
  people: 2,
  room_count: 1,
  message: "Réservation Airbnb #EXT-001",
  created_at: "2026-07-01T00:00:00.000Z",
  status: "confirmed",
  source: "airbnb",
  external_ref: "EXT-001",
  user_id: null,
};

/**
 * SQL mock that authenticates as an admin for session queries and optionally
 * calls `extra` for other queries (same pattern as apiHardening.test.ts).
 * Records every (q, vals) pair for SQL-content assertions.
 */
function makeAdminSql(
  extra?: (q: string, vals: unknown[]) => unknown[] | undefined,
) {
  const calls: { q: string; vals: unknown[] }[] = [];

  const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    calls.push({ q, vals });
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }
    return Promise.resolve(extra?.(q, vals) ?? []);
  };

  return { sql, calls };
}

function get(path: string, headers: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, { headers }, env);
}

describe("GET /api/admin/reservations — OP-Reservation.listAdmin", () => {
  it("returns 401 when no session cookie is present", async () => {
    neonHolder.sql = makeAdminSql().sql;
    const res = await get("/api/admin/reservations");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when the session belongs to a non-admin user", async () => {
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("FROM sessions")) {
        return Promise.resolve([{ ...ADMIN_USER, role: "guest" }]);
      }
      return Promise.resolve([]);
    };
    const res = await get("/api/admin/reservations", { Cookie: "session=t" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 200 with a reservations array for an authenticated admin", async () => {
    const { sql } = makeAdminSql((q) =>
      q.includes("FROM reservations") ? [FAKE_RESERVATION] : undefined,
    );
    neonHolder.sql = sql;
    const res = await get("/api/admin/reservations", { Cookie: "session=t" });
    expect(res.status).toBe(200);
    const body = await res.json() as { reservations: unknown[] };
    expect(Array.isArray(body.reservations)).toBe(true);
  });

  it("SELECT query includes status, source, code, external_ref, and user_id", async () => {
    const { sql, calls } = makeAdminSql((q) =>
      q.includes("FROM reservations") ? [FAKE_RESERVATION] : undefined,
    );
    neonHolder.sql = sql;
    await get("/api/admin/reservations", { Cookie: "session=t" });

    const reservationsCall = calls.find(
      ({ q }) => q.includes("FROM reservations"),
    );
    expect(reservationsCall).toBeDefined();
    const q = reservationsCall!.q;
    expect(q).toMatch(/\bstatus\b/);
    expect(q).toMatch(/\bsource\b/);
    expect(q).toMatch(/\bcode\b/);
    expect(q).toMatch(/\bexternal_ref\b/);
    expect(q).toMatch(/\buser_id\b/);
  });

  it("response rows carry status, source, code, external_ref, and user_id (E-Reservation contract)", async () => {
    const { sql } = makeAdminSql((q) =>
      q.includes("FROM reservations") ? [FAKE_RESERVATION] : undefined,
    );
    neonHolder.sql = sql;
    const res = await get("/api/admin/reservations", { Cookie: "session=t" });
    expect(res.status).toBe(200);
    const { reservations } = await res.json() as { reservations: typeof FAKE_RESERVATION[] };
    const row = reservations[0];
    expect(row).toHaveProperty("status", "confirmed");
    expect(row).toHaveProperty("source", "airbnb");
    expect(row).toHaveProperty("code", "RES-2026-007");
    expect(row).toHaveProperty("external_ref", "EXT-001");
    expect(row).toHaveProperty("user_id", null);
  });

  it("passes the q search term as an ILIKE pattern in the bound values", async () => {
    const { sql, calls } = makeAdminSql((q) =>
      q.includes("FROM reservations") ? [] : undefined,
    );
    neonHolder.sql = sql;
    await get("/api/admin/reservations?q=jane", { Cookie: "session=t" });

    const reservationsCall = calls.find(({ q }) => q.includes("FROM reservations"));
    expect(reservationsCall).toBeDefined();
    const ilikeBound = reservationsCall!.vals.some(
      (v) => typeof v === "string" && v.includes("jane"),
    );
    expect(ilikeBound).toBe(true);
  });

  it("honours the limit query param (capped at 200)", async () => {
    const { sql, calls } = makeAdminSql((q) =>
      q.includes("FROM reservations") ? [] : undefined,
    );
    neonHolder.sql = sql;
    await get("/api/admin/reservations?limit=50", { Cookie: "session=t" });

    const reservationsCall = calls.find(({ q }) => q.includes("FROM reservations"));
    expect(reservationsCall).toBeDefined();
    expect(reservationsCall!.vals).toContain(50);
  });
});
