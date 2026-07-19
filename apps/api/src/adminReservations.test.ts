/**
 * Route-level tests for:
 *   - GET /api/admin/reservations  (OP-Reservation.listAdmin)
 *   - POST /internal/ota-bookings  (OP-Reservation.otaCreate)
 *
 * Follows the mocked-neon pattern from dashboardRoute.test.ts: drive the
 * exported `app` directly so a route deletion causes a 404 and the test fails
 * (enforces INV-route-mounted).
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

const ENV = { DB_CONN: "postgres://stub", INTERNAL_OTA_SECRET: "test-secret" } as any;

// Hono's app.request() requires an executionCtx when the handler calls
// c.executionCtx.waitUntil() — pass a no-op stub as the fourth argument.
const EXEC_CTX = {
  waitUntil: (_p: Promise<any>) => {},
  passThroughOnException: () => {},
} as any;

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

// ── Reservation row fixture (as returned from DB) ─────────────────────────────

const RESERVATION_ROW = {
  id: 42,
  code: "AVP-ABCDEF",
  name: "Jean Dupont",
  first_name: "Jean",
  last_name: "Dupont",
  email: "jean@example.com",
  phone: null,
  room: "Chambre Montagne",
  arrive: "2026-08-01",
  depart: "2026-08-05",
  people: 2,
  room_count: 1,
  message: null,
  created_at: "2026-07-19T12:00:00.000Z",
  status: "confirmed",
  source: "airbnb",
  external_ref: "HM123456789",
  user_id: 7,
};

// ── OTA body fixtures ─────────────────────────────────────────────────────────

const AIRBNB_BODY = {
  status: "parsed",
  source: "airbnb",
  externalRef: "HM123456789",
  subject: "Reservation confirmed",
  firstName: "Jean",
  lastName: "Dupont",
  guestEmail: null,
  phone: null,
  checkIn: "2026-08-01",
  checkOut: "2026-08-05",
  guests: 2,
  listingName: "Chambre Montagne",
};

const EXPEDIA_BODY = {
  status: "parsed",
  source: "expedia",
  externalRef: "EXP987654321",
  subject: "Booking confirmation",
  firstName: "Marie",
  lastName: "Tremblay",
  guestEmail: "marie@example.com",
  phone: "+15141234567",
  checkIn: "2026-09-10",
  checkOut: "2026-09-14",
  guests: 3,
  listingName: "Chambre Rivière",
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

function makeAdminSql(extra?: (q: string, vals: unknown[]) => unknown[] | undefined) {
  return (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join(" ");
    if (q.includes("FROM sessions") && q.includes("JOIN users")) {
      return Promise.resolve([ADMIN_USER]);
    }
    const r = extra?.(q, vals);
    return Promise.resolve(r ?? []);
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/reservations — OP-Reservation.listAdmin
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/reservations (OP-Reservation.listAdmin)", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Authentication / authorisation ────────────────────────────────────────

  it("returns 401 (not 404) when no session cookie — route is mounted", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request("http://localhost/api/admin/reservations", {}, ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as a non-admin user", async () => {
    neonHolder.sql = makeGuestSql();
    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );
    expect(res.status).toBe(403);
  });

  // ── SQL projection — SELECT includes status & source (INV-dto-additive-optional) ──

  it("issues a SELECT that includes the status column (INV-status-domain)", async () => {
    let capturedQuery = "";
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) {
        capturedQuery = q;
        return [RESERVATION_ROW];
      }
      return undefined;
    });

    await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    expect(capturedQuery).toContain("status");
  });

  it("issues a SELECT that includes the source column", async () => {
    let capturedQuery = "";
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) {
        capturedQuery = q;
        return [RESERVATION_ROW];
      }
      return undefined;
    });

    await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    expect(capturedQuery).toContain("source");
  });

  it("issues a SELECT that includes external_ref and user_id", async () => {
    let capturedQuery = "";
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) {
        capturedQuery = q;
        return [RESERVATION_ROW];
      }
      return undefined;
    });

    await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    expect(capturedQuery).toContain("external_ref");
    expect(capturedQuery).toContain("user_id");
  });

  // ── Payload shape — rows carry status/source/external_ref/user_id ─────────

  it("returns 200 with a reservations array for an admin", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return [RESERVATION_ROW];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.reservations)).toBe(true);
  });

  it("rows in the response carry status field with its DB value", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return [RESERVATION_ROW];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    const body = (await res.json()) as any;
    expect(body.reservations[0].status).toBe("confirmed");
  });

  it("rows in the response carry source field with its DB value", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return [RESERVATION_ROW];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    const body = (await res.json()) as any;
    expect(body.reservations[0].source).toBe("airbnb");
  });

  it("rows carry external_ref, user_id, and code from the DB", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return [RESERVATION_ROW];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    const body = (await res.json()) as any;
    const row = body.reservations[0];
    expect(row.external_ref).toBe("HM123456789");
    expect(row.user_id).toBe(7);
    expect(row.code).toBe("AVP-ABCDEF");
  });

  it("returns an empty array when no reservations match the query", async () => {
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return [];
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations?q=nomatch",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    const body = (await res.json()) as any;
    expect(body.reservations).toEqual([]);
  });

  it("preserves all status domain values (pending/confirmed/cancelled)", async () => {
    const rows = [
      { ...RESERVATION_ROW, id: 1, status: "pending", source: null, external_ref: null, user_id: null },
      { ...RESERVATION_ROW, id: 2, status: "confirmed", source: "expedia", external_ref: "EXP1" },
      { ...RESERVATION_ROW, id: 3, status: "cancelled", source: "airbnb", external_ref: "HM2" },
    ];
    neonHolder.sql = makeAdminSql((q) => {
      if (q.includes("FROM reservations")) return rows;
      return undefined;
    });

    const res = await app.request(
      "http://localhost/api/admin/reservations",
      { headers: { Cookie: "session=t" } },
      ENV,
    );

    const body = (await res.json()) as any;
    const statuses = body.reservations.map((r: any) => r.status);
    expect(statuses).toEqual(["pending", "confirmed", "cancelled"]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /internal/ota-bookings — OP-Reservation.otaCreate
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /internal/ota-bookings (OP-Reservation.otaCreate)", () => {
  beforeEach(() => vi.clearAllMocks());

  const OTA_HEADERS = {
    "Content-Type": "application/json",
    "X-Internal-Auth": "test-secret",
  };

  // ── Authentication ────────────────────────────────────────────────────────

  it("returns 401 (not 404) when X-Internal-Auth header is absent — route is mounted", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(AIRBNB_BODY),
      },
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-Internal-Auth value does not match the configured secret", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Auth": "wrong-secret" },
        body: JSON.stringify(AIRBNB_BODY),
      },
      ENV,
    );
    expect(res.status).toBe(401);
  });

  // ── Bad request ───────────────────────────────────────────────────────────

  it("returns 400 when body is not valid JSON (ERR-BADREQUEST)", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Auth": "test-secret" },
        body: "not json{{{",
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when body fails OtaParsedSchema validation (missing required field)", async () => {
    neonHolder.sql = makeAnonSql();
    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      {
        method: "POST",
        headers: OTA_HEADERS,
        body: JSON.stringify({ status: "parsed", source: "airbnb" /* missing required fields */ }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });

  // ── OTA auto-confirm: airbnb → status='confirmed' ─────────────────────────

  it("INSERTs status='confirmed' for an airbnb booking (INV-status-domain not widened)", async () => {
    let insertedStatus: unknown = undefined;

    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO reservations") && q.includes("status")) {
        // status is the last template variable in the VALUES list
        insertedStatus = vals[vals.length - 1];
        return Promise.resolve([{ id: 1, code: null }]);
      }
      // Absorb all follow-up queries (code assignment, email_ingest_log, etc.)
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: OTA_HEADERS, body: JSON.stringify(AIRBNB_BODY) },
      ENV,
      EXEC_CTX,
    );

    expect(res.status).toBe(201);
    expect(insertedStatus).toBe("confirmed");
  });

  // ── OTA auto-confirm: expedia → status='confirmed' ────────────────────────

  it("INSERTs status='confirmed' for an expedia booking", async () => {
    let insertedStatus: unknown = undefined;

    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO reservations") && q.includes("status")) {
        insertedStatus = vals[vals.length - 1];
        return Promise.resolve([{ id: 2, code: null }]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: OTA_HEADERS, body: JSON.stringify(EXPEDIA_BODY) },
      ENV,
      EXEC_CTX,
    );

    expect(res.status).toBe(201);
    expect(insertedStatus).toBe("confirmed");
  });

  // ── Duplicate detection ───────────────────────────────────────────────────

  it("returns { ok: true, duplicate: true } when ON CONFLICT returns no rows", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO reservations") && q.includes("status")) {
        // ON CONFLICT DO NOTHING → returns empty rows array
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: OTA_HEADERS, body: JSON.stringify(AIRBNB_BODY) },
      ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(true);
  });

  // ── Response shape on success ─────────────────────────────────────────────

  it("returns 201 with reservationId on a fresh airbnb booking", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO reservations") && q.includes("status")) {
        return Promise.resolve([{ id: 99, code: null }]);
      }
      return Promise.resolve([]);
    };

    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: OTA_HEADERS, body: JSON.stringify(AIRBNB_BODY) },
      ENV,
      EXEC_CTX,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.reservationId).toBe(99);
  });

  // ── parse_failed / ignored status logging ────────────────────────────────

  it("returns 202 for a parse_failed status body (failure log path)", async () => {
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("INSERT INTO email_ingest_log")) return Promise.resolve([]);
      return Promise.resolve([]);
    };

    const failureBody = {
      status: "parse_failed",
      provider: "airbnb",
      subject: "Failed email",
      error: "Could not parse dates",
    };

    const res = await app.request(
      "http://localhost/internal/ota-bookings",
      { method: "POST", headers: OTA_HEADERS, body: JSON.stringify(failureBody) },
      ENV,
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });
});
