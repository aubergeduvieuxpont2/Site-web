import { describe, it, expect } from "vitest";
import { availabilityForRange } from "../src/availability";

// Creates a mock sql tagged-template function that returns reservations on the
// first call and blackouts on the second call, matching availabilityForRange's
// two-query fetch order.
function makeMockSql(reservations: any[], blackouts: any[]) {
  let callCount = 0;
  return async (..._args: any[]) => {
    callCount++;
    return callCount === 1 ? reservations : blackouts;
  };
}

// Empty mock — returns an empty array for every sql call.
async function emptyMockSql(..._args: any[]) {
  return [];
}

describe("availabilityForRange", () => {
  it("returns an AvailabilityResult with nights and unavailableNights arrays", async () => {
    const result = await availabilityForRange(
      emptyMockSql as any,
      "2026-08-01",
      "2026-08-05",
      1,
      12
    );

    expect(result).toHaveProperty("nights");
    expect(result).toHaveProperty("unavailableNights");
    expect(Array.isArray(result.nights)).toBe(true);
    expect(Array.isArray(result.unavailableNights)).toBe(true);
  });

  it("generates one night entry per calendar day in the half-open range", async () => {
    const result = await availabilityForRange(
      emptyMockSql as any,
      "2026-08-01",
      "2026-08-04",
      1,
      12
    );

    expect(result.nights).toHaveLength(3);
    expect(result.nights.map((n) => n.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("returns numbers (not strings) for every night's available count", async () => {
    const result = await availabilityForRange(
      emptyMockSql as any,
      "2026-08-01",
      "2026-08-04",
      1,
      12
    );

    for (const n of result.nights) {
      expect(typeof n.available).toBe("number");
    }
  });

  it("accepts valid date range parameters without throwing", async () => {
    const result = await availabilityForRange(
      emptyMockSql as any,
      "2026-01-01",
      "2026-12-31",
      2,
      12
    );

    expect(result).toBeDefined();
    expect(result.nights).toBeDefined();
  });

  it("an active hold reduces availability by one for every night it covers when room_count is not provided", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "held", hold_expires_at: futureExpiry }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(11);
    expect(result.nights[1].available).toBe(11);
  });

  it("an active hold reduces availability by its room_count for every night it covers", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "held", room_count: 3, hold_expires_at: futureExpiry }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(9);
    expect(result.nights[1].available).toBe(9);
  });

  it("an expired hold does not reduce availability", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "held", hold_expires_at: pastExpiry }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(12);
    expect(result.nights[1].available).toBe(12);
  });

  it("a confirmed reservation reduces availability", async () => {
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "confirmed", hold_expires_at: null }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(11);
    expect(result.nights[1].available).toBe(11);
  });

  it("a confirmed reservation with room_count greater than one reduces availability by that room_count", async () => {
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "confirmed", room_count: 4, hold_expires_at: null }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(8);
    expect(result.nights[1].available).toBe(8);
  });

  it("multiple active reservations each reduce availability by one", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = await availabilityForRange(
      makeMockSql(
        [
          { arrive: "2026-08-01", depart: "2026-08-02", status: "confirmed", hold_expires_at: null },
          { arrive: "2026-08-01", depart: "2026-08-02", status: "held", hold_expires_at: futureExpiry },
        ],
        []
      ) as any,
      "2026-08-01",
      "2026-08-02",
      1,
      12
    );

    expect(result.nights[0].available).toBe(10);
  });

  it("blackout rooms_blocked subtracts from availability", async () => {
    const result = await availabilityForRange(
      makeMockSql([], [{ date: "2026-08-01", rooms_blocked: "3" }]) as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    expect(result.nights[0].available).toBe(9);  // 12 - 3 blocked
    expect(result.nights[1].available).toBe(12); // no blackout on Aug 2
  });

  it("blackout rooms_blocked coerces string values from Neon to numbers", async () => {
    // The Neon HTTP driver can return numeric columns as strings; verify coercion.
    const result = await availabilityForRange(
      makeMockSql([], [{ date: "2026-08-01", rooms_blocked: "5" }]) as any,
      "2026-08-01",
      "2026-08-02",
      1,
      12
    );

    expect(result.nights[0].available).toBe(7);
    expect(typeof result.nights[0].available).toBe("number");
  });

  it("arrive-inclusive boundary: reservation covers its arrive date", async () => {
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-02", depart: "2026-08-04", status: "confirmed", hold_expires_at: null }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-05",
      1,
      12
    );

    expect(result.nights[0].available).toBe(12); // Aug 1 — before arrive
    expect(result.nights[1].available).toBe(11); // Aug 2 — arrive-inclusive
    expect(result.nights[2].available).toBe(11); // Aug 3 — mid-stay
    expect(result.nights[3].available).toBe(12); // Aug 4 — depart-exclusive
  });

  it("depart-exclusive boundary: reservation does not cover its depart date", async () => {
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-01", depart: "2026-08-03", status: "confirmed", hold_expires_at: null }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-04",
      1,
      12
    );

    expect(result.nights[0].available).toBe(11); // Aug 1 — covered
    expect(result.nights[1].available).toBe(11); // Aug 2 — covered
    expect(result.nights[2].available).toBe(12); // Aug 3 — depart-exclusive, free
  });

  it("availability is floored at zero when over-subscribed", async () => {
    const result = await availabilityForRange(
      makeMockSql([], [{ date: "2026-08-01", rooms_blocked: "20" }]) as any,
      "2026-08-01",
      "2026-08-02",
      1,
      12
    );

    expect(result.nights[0].available).toBe(0);
  });

  it("a night is unavailable when its available count is below the requested rooms", async () => {
    const result = await availabilityForRange(
      makeMockSql(
        [{ arrive: "2026-08-02", depart: "2026-08-03", status: "confirmed", hold_expires_at: null }],
        []
      ) as any,
      "2026-08-01",
      "2026-08-04",
      12, // requesting all 12 rooms
      12
    );

    // Aug 1 and Aug 3: available = 12, OK for 12-room request.
    // Aug 2: available = 11, not enough for 12 rooms → unavailable.
    expect(result.unavailableNights).toEqual(["2026-08-02"]);
  });
});
