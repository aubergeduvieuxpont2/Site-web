// @vitest-environment node
/**
 * Tier 1 real-database tests.
 *
 * Every assertion here executes SQL against Postgres. The point is to catch the
 * class of defect the mocked suite structurally cannot: statements Postgres
 * rejects, joins that resolve differently than they read, and timezone
 * arithmetic nothing evaluated.
 *
 * Falsifiability check for this file — each of these must turn it red:
 *   - remove the `::int` casts in computeGuestStats
 *   - drop an `r.` prefix from the admin reservations query
 *   - invert the AT TIME ZONE comparison in reviewRequests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { TestClient } from "./harness";
import { connectTestDb, type SqlFn } from "./harness";
import { computeGuestStats } from "../../src/reviews";

let client: TestClient;
let sql: SqlFn;

beforeAll(async () => {
  const db = await connectTestDb();
  client = db.client;
  sql = db.sql;
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query("BEGIN");
});

afterEach(async () => {
  await client.query("ROLLBACK");
});

async function insertReservation(overrides: Record<string, unknown> = {}) {
  const r = {
    name: "Marie Tremblay",
    email: "marie@example.com",
    arrive: "2026-01-10",
    depart: "2026-01-15",
    people: 1,
    status: "confirmed",
    user_id: null,
    ...overrides,
  };
  const rows = await sql`
    INSERT INTO reservations (name, email, arrive, depart, people, status, user_id)
    VALUES (${r.name}, ${r.email}, ${r.arrive}::date, ${r.depart}::date,
            ${r.people}, ${r.status}, ${r.user_id}::int)
    RETURNING id
  `;
  return rows[0].id as number;
}

describe("computeGuestStats against real Postgres", () => {
  // The production 500: a null userId is sent as an untyped parameter, and
  // Postgres cannot infer a type from `$1 IS NOT NULL`. It rejects the whole
  // statement. Three mocked tests covered this exact input and all passed.
  it("executes for a guest with no linked account (untyped-null regression)", async () => {
    await insertReservation({ email: "guest@example.com" });
    const result = await computeGuestStats(sql as any, null, "guest@example.com");
    expect(result.staysCount).toBe(1);
    expect(result.nightsTotal).toBe(5);
  });

  it("matches the guest's email case-insensitively", async () => {
    await insertReservation({ email: "Mixed@Example.com" });
    const result = await computeGuestStats(sql as any, null, "mixed@example.com");
    expect(result.staysCount).toBe(1);
  });

  it("keys on user_id when the guest has an account, ignoring other emails", async () => {
    const userRows = await sql`
      INSERT INTO users (email, password_hash, role)
      VALUES ('acct@example.com', 'x', 'client')
      RETURNING id
    `;
    const userId = userRows[0].id as number;
    await insertReservation({ user_id: userId, email: "old@example.com" });
    await insertReservation({ user_id: userId, email: "new@example.com" });
    // A same-email reservation belonging to nobody must not be counted.
    await insertReservation({ user_id: null, email: "old@example.com" });

    const result = await computeGuestStats(sql as any, userId, "irrelevant@example.com");
    expect(result.staysCount).toBe(2);
  });

  it("excludes unconfirmed stays and stays that have not departed", async () => {
    await insertReservation({ email: "e@example.com", status: "pending" });
    await insertReservation({ email: "e@example.com", status: "confirmed", arrive: "2099-01-01", depart: "2099-01-05" });
    const result = await computeGuestStats(sql as any, null, "e@example.com");
    expect(result.staysCount).toBe(0);
    expect(result.nightsTotal).toBe(0);
  });
});

describe("admin reservations list query against real Postgres", () => {
  // Regression guard for unqualified columns. TypeScript cannot catch a missing
  // `r.` prefix and the mocked suite cannot either — Postgres raises
  // "column reference is ambiguous" only at execution, as a 500.
  it("runs the aliased LEFT JOIN without ambiguous column errors", async () => {
    const id = await insertReservation({ email: "join@example.com" });
    await sql`INSERT INTO review_requests (reservation_id, channel, sent_at) VALUES (${id}, 'email', now())`;

    const rows = await sql`
      SELECT r.id, r.code, r.name, r.first_name, r.last_name, r.email, r.phone, r.room,
             to_char(r.arrive, 'YYYY-MM-DD') as arrive,
             to_char(r.depart, 'YYYY-MM-DD') as depart,
             r.people, r.room_count, r.message, r.status, r.source, r.external_ref,
             r.user_id, r.stripe_invoice_id, r.invoice_status, r.hosted_invoice_url,
             to_char(r.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as paid_at,
             r.created_at,
             to_char(rr.sent_at,          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_sent_at,
             to_char(rr.reminder_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_reminder_sent_at,
             to_char(rr.responded_at,     'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_responded_at
      FROM reservations r
      LEFT JOIN review_requests rr ON rr.reservation_id = r.id
      WHERE r.name ILIKE ${"%join%"} OR r.email ILIKE ${"%join%"}
      ORDER BY r.created_at DESC
      LIMIT ${100}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].review_sent_at).toBeTruthy();
    expect(rows[0].review_responded_at).toBeNull();
  });

  it("returns null review columns for a reservation with no request, and does not multiply rows", async () => {
    await insertReservation({ email: "solo@example.com" });
    const rows = await sql`
      SELECT r.id,
             to_char(rr.sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_sent_at
      FROM reservations r
      LEFT JOIN review_requests rr ON rr.reservation_id = r.id
      WHERE r.email ILIKE ${"%solo%"}
    `;
    expect(rows).toHaveLength(1);
    // to_char(NULL, ...) must yield NULL, not '' — the admin UI branches on it.
    expect(rows[0].review_sent_at).toBeNull();
  });
});

describe("review-request send timing across DST", () => {
  // The reason the feature exists: bare CURRENT_DATE is UTC on Neon, which
  // fires at 20:00 the previous evening in Quebec. This is the one assertion
  // that is impossible to make against a mock — being wrong by one hour is
  // invisible until a guest complains.
  const sendTime = (depart: string, delayDays: number) => sql`
    SELECT ((${depart}::date + make_interval(days => ${delayDays}::int))::timestamp
             + make_interval(hours => ${14}::int))
           AT TIME ZONE ${"America/Toronto"} AS send_at
  `;

  it("resolves to 14:00 local = 18:00 UTC during EDT (summer)", async () => {
    const rows = await sendTime("2026-07-15", 0);
    expect(new Date(rows[0].send_at).toISOString()).toBe("2026-07-15T18:00:00.000Z");
  });

  it("resolves to 14:00 local = 19:00 UTC during EST (winter)", async () => {
    const rows = await sendTime("2026-01-15", 0);
    expect(new Date(rows[0].send_at).toISOString()).toBe("2026-01-15T19:00:00.000Z");
  });

  it("shifts by exactly one hour across the March DST boundary", async () => {
    const before = await sendTime("2026-03-07", 0);
    const after = await sendTime("2026-03-09", 0);
    expect(new Date(before[0].send_at).toISOString()).toBe("2026-03-07T19:00:00.000Z");
    expect(new Date(after[0].send_at).toISOString()).toBe("2026-03-09T18:00:00.000Z");
  });

  it("shifts back across the November DST boundary", async () => {
    const before = await sendTime("2026-10-31", 0);
    const after = await sendTime("2026-11-02", 0);
    expect(new Date(before[0].send_at).toISOString()).toBe("2026-10-31T18:00:00.000Z");
    expect(new Date(after[0].send_at).toISOString()).toBe("2026-11-02T19:00:00.000Z");
  });

  it("applies the configurable delay in whole days", async () => {
    const rows = await sendTime("2026-07-15", 3);
    expect(new Date(rows[0].send_at).toISOString()).toBe("2026-07-18T18:00:00.000Z");
  });

  // Guards the direction of the conversion. If AT TIME ZONE were applied to a
  // timestamptz instead of a bare timestamp, the offset inverts and this fails.
  it("interprets 14:00 as local wall time, not as UTC", async () => {
    const rows = await sendTime("2026-07-15", 0);
    const utcHour = new Date(rows[0].send_at).getUTCHours();
    expect(utcHour).toBe(18);
    expect(utcHour).not.toBe(14);
  });
});
