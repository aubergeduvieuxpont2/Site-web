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

const SECRET = "test-ota-secret";
const env = { DB_CONN: "postgres://stub", INTERNAL_OTA_SECRET: SECRET } as any;
// Provide a no-op ExecutionContext so c.executionCtx.waitUntil() does not throw
// when the handler reaches the HubSpot / provisioning fire-and-forget branches.
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

/** Minimal valid OtaParsedSchema body for the given source. */
function makeOtaBody(source: "airbnb" | "expedia", externalRef = "EXT-001") {
  return {
    status: "parsed" as const,
    source,
    externalRef,
    subject: "Booking Confirmation",
    firstName: "Jane",
    lastName: "Doe",
    guestEmail: "jane@example.com",
    phone: null,
    listingName: "Suite Panorama",
    checkIn: "2026-09-01",
    checkOut: "2026-09-03",
    guests: 2,
  };
}

function postOta(body: unknown) {
  return app.request(
    "http://localhost/internal/ota-bookings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Auth": SECRET,
      },
      body: JSON.stringify(body),
    },
    env,
    ctx,
  );
}

/**
 * Returns a SQL mock that:
 *  - captures the first INSERT INTO reservations … VALUES … call (column list
 *    + bound values) for assertion
 *  - returns a fake created row so the handler continues past the duplicate check
 *  - returns [] for all other queries (code-assign UPDATE, logging INSERT, etc.)
 */
function makeCaptureSql() {
  let capturedSql: string | null = null;
  let capturedValues: unknown[] | null = null;

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join(" ");
    if (q.includes("INSERT INTO reservations") && q.includes("VALUES")) {
      capturedSql = q;
      capturedValues = values;
      return Promise.resolve([{ id: 42, code: null }]);
    }
    return Promise.resolve([]);
  };

  return {
    sql,
    getCapturedSql: () => capturedSql,
    getCapturedValues: () => capturedValues,
  };
}

describe("OTA auto-confirm — OP-Reservation.otaCreate", () => {
  describe("airbnb source → status = 'confirmed'", () => {
    it("returns 201 for a valid airbnb booking", async () => {
      const { sql } = makeCaptureSql();
      neonHolder.sql = sql;
      const res = await postOta(makeOtaBody("airbnb"));
      expect(res.status).toBe(201);
    });

    it("INSERT includes the status column in the column list", async () => {
      const { sql, getCapturedSql } = makeCaptureSql();
      neonHolder.sql = sql;
      await postOta(makeOtaBody("airbnb"));
      expect(getCapturedSql()).toMatch(/\bstatus\b/);
    });

    it("passes 'confirmed' as a bound value for airbnb bookings", async () => {
      const { sql, getCapturedValues } = makeCaptureSql();
      neonHolder.sql = sql;
      await postOta(makeOtaBody("airbnb"));
      expect(getCapturedValues()).toContain("confirmed");
    });
  });

  describe("expedia source → status = 'confirmed'", () => {
    it("returns 201 for a valid expedia booking", async () => {
      const { sql } = makeCaptureSql();
      neonHolder.sql = sql;
      const res = await postOta(makeOtaBody("expedia"));
      expect(res.status).toBe(201);
    });

    it("INSERT includes the status column in the column list", async () => {
      const { sql, getCapturedSql } = makeCaptureSql();
      neonHolder.sql = sql;
      await postOta(makeOtaBody("expedia"));
      expect(getCapturedSql()).toMatch(/\bstatus\b/);
    });

    it("passes 'confirmed' as a bound value for expedia bookings", async () => {
      const { sql, getCapturedValues } = makeCaptureSql();
      neonHolder.sql = sql;
      await postOta(makeOtaBody("expedia"));
      expect(getCapturedValues()).toContain("confirmed");
    });
  });

  it("returns ok + duplicate:true when ON CONFLICT fires (no rows returned)", async () => {
    // INSERT … ON CONFLICT DO NOTHING returns [] → duplicate path.
    neonHolder.sql = () => Promise.resolve([]);
    const res = await postOta(makeOtaBody("airbnb", "DUPE-001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
  });

  it("returns 400 for a body that fails OtaParsedSchema validation", async () => {
    neonHolder.sql = () => Promise.resolve([]);
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Auth": SECRET,
        },
        // Missing required fields (externalRef, checkIn, etc.)
        body: JSON.stringify({ status: "parsed", source: "airbnb" }),
      },
      env,
      ctx,
    );
    expect(res.status).toBe(400);
  });
});
