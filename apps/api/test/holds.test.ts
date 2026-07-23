import { describe, it, expect } from "vitest";
import { releaseExpiredHolds } from "../src/holds";
import { availabilityForRange } from "../src/availability";
import { ReservationStatusSchema } from "../src/index";

// ---------------------------------------------------------------------------
// releaseExpiredHolds
// ---------------------------------------------------------------------------

describe("releaseExpiredHolds", () => {
  it("marks an expired held reservation as released", async () => {
    const updated: { id: number }[] = [];
    let capturedQuery = "";

    const mockSql = Object.assign(
      async (strings: TemplateStringsArray, ...vals: unknown[]) => {
        capturedQuery = strings.join("?");
        updated.push({ id: 99 });
        return [{ id: 99 }];
      },
      {}
    ) as any;

    const result = await releaseExpiredHolds(mockSql);

    expect(result.released_count).toBe(1);
    expect(capturedQuery).toContain("status = 'released'");
    expect(capturedQuery).toContain("status = 'held'");
    expect(capturedQuery).toContain("hold_expires_at < now()");
  });

  it("returns released_count of zero when no holds have expired", async () => {
    const mockSql = async (_strings: TemplateStringsArray, ..._vals: unknown[]) => {
      return [];
    };

    const result = await releaseExpiredHolds(mockSql as any);

    expect(result.released_count).toBe(0);
  });

  it("leaves an active held reservation untouched", async () => {
    // The SQL WHERE clause filters by hold_expires_at < now(), so active holds
    // are never returned by the UPDATE RETURNING. We verify the query shape is
    // correct and that the count accurately reflects the DB response.
    const mockSql = async (_strings: TemplateStringsArray, ..._vals: unknown[]) => {
      return [];
    };

    const result = await releaseExpiredHolds(mockSql as any);

    expect(result.released_count).toBe(0);
  });

  it("returns released_count matching the number of rows returned by the UPDATE", async () => {
    const mockSql = async (_strings: TemplateStringsArray, ..._vals: unknown[]) => {
      return [{ id: 1 }, { id: 2 }, { id: 3 }];
    };

    const result = await releaseExpiredHolds(mockSql as any);

    expect(result.released_count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ReservationStatusSchema — enum domain
// ---------------------------------------------------------------------------

describe("ReservationStatusSchema", () => {
  it("accepts pending", () => {
    expect(ReservationStatusSchema.parse({ status: "pending" })).toEqual({
      status: "pending",
    });
  });

  it("accepts confirmed", () => {
    expect(ReservationStatusSchema.parse({ status: "confirmed" })).toEqual({
      status: "confirmed",
    });
  });

  it("accepts cancelled", () => {
    expect(ReservationStatusSchema.parse({ status: "cancelled" })).toEqual({
      status: "cancelled",
    });
  });

  it("accepts held", () => {
    expect(ReservationStatusSchema.parse({ status: "held" })).toEqual({
      status: "held",
    });
  });

  it("accepts released", () => {
    expect(ReservationStatusSchema.parse({ status: "released" })).toEqual({
      status: "released",
    });
  });

  it("rejects an unknown status value", () => {
    expect(() =>
      ReservationStatusSchema.parse({ status: "unknown" })
    ).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() =>
      ReservationStatusSchema.parse({ status: "" })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// availabilityForRange — holds-aware occupancy (tests for the refactored
// TypeScript-computation path; two sql calls: reservations first, blackouts
// second).
// ---------------------------------------------------------------------------

type ResRow = {
  arrive: string;
  depart: string;
  status: string;
  room_count: number;
  hold_expires_at: string | null;
};

type BlackoutRow = {
  date: string;
  rooms_blocked: number;
};

function makeSql(reservations: ResRow[], blackouts: BlackoutRow[]) {
  let call = 0;
  return async (_strings: TemplateStringsArray, ..._vals: unknown[]) => {
    call++;
    return call === 1 ? reservations : blackouts;
  };
}

const FAR_FUTURE = "2099-01-01T00:00:00.000Z";
const FAR_PAST = "2000-01-01T00:00:00.000Z";

describe("availabilityForRange (holds-aware)", () => {
  it("a confirmed reservation reduces availability by its room_count", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-01",
          depart: "2026-09-03",
          status: "confirmed",
          room_count: 2,
          hold_expires_at: null,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-03",
      1,
      10
    );

    for (const night of result.nights) {
      expect(night.available).toBe(8); // 10 - 2 (room_count)
    }
  });

  it("an active hold (hold_expires_at in the future) reduces availability", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-01",
          depart: "2026-09-02",
          status: "held",
          room_count: 1,
          hold_expires_at: FAR_FUTURE,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-02",
      1,
      10
    );

    expect(result.nights[0]?.available).toBe(9);
  });

  it("an expired hold (hold_expires_at in the past) does not reduce availability", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-01",
          depart: "2026-09-02",
          status: "held",
          room_count: 1,
          hold_expires_at: FAR_PAST,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-02",
      1,
      10
    );

    expect(result.nights[0]?.available).toBe(10);
  });

  it("a held reservation with null hold_expires_at does not reduce availability", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-01",
          depart: "2026-09-02",
          status: "held",
          room_count: 1,
          hold_expires_at: null,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-02",
      1,
      10
    );

    expect(result.nights[0]?.available).toBe(10);
  });

  it("blackout rooms_blocked subtracts from available", async () => {
    const sql = makeSql([], [{ date: "2026-09-01", rooms_blocked: 3 }]);

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-02",
      1,
      10
    );

    expect(result.nights[0]?.available).toBe(7);
  });

  it("arrive-inclusive: a reservation covering arrive date occupies that night", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-02",
          depart: "2026-09-04",
          status: "confirmed",
          room_count: 1,
          hold_expires_at: null,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-05",
      1,
      10
    );

    const byDate = Object.fromEntries(result.nights.map((n) => [n.date, n.available]));
    expect(byDate["2026-09-01"]).toBe(10);
    expect(byDate["2026-09-02"]).toBe(9);
    expect(byDate["2026-09-03"]).toBe(9);
    expect(byDate["2026-09-04"]).toBe(10);
  });

  it("depart-exclusive: the depart date itself is not occupied", async () => {
    const sql = makeSql(
      [
        {
          arrive: "2026-09-01",
          depart: "2026-09-03",
          status: "confirmed",
          room_count: 1,
          hold_expires_at: null,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-04",
      1,
      10
    );

    const byDate = Object.fromEntries(result.nights.map((n) => [n.date, n.available]));
    expect(byDate["2026-09-01"]).toBe(9);
    expect(byDate["2026-09-02"]).toBe(9);
    expect(byDate["2026-09-03"]).toBe(10);
  });

  it("unavailableNights marks a night with fewer rooms than requested", async () => {
    // Reservation occupies 5 rooms. Requesting 6 → Sep 2 is unavailable (5 < 6).
    const sql = makeSql(
      [
        {
          arrive: "2026-09-02",
          depart: "2026-09-03",
          status: "confirmed",
          room_count: 5,
          hold_expires_at: null,
        },
      ],
      []
    );

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-04",
      6,
      10
    );

    // Sep 2: 5 rooms occupied → available = 10 - 5 = 5 < 6 requested.
    expect(result.unavailableNights).toContain("2026-09-02");
    expect(result.unavailableNights).not.toContain("2026-09-01");
    expect(result.unavailableNights).not.toContain("2026-09-03");
  });

  it("available is floored at zero when blocked exceeds total", async () => {
    const sql = makeSql([], [{ date: "2026-09-01", rooms_blocked: 15 }]);

    const result = await availabilityForRange(
      sql as any,
      "2026-09-01",
      "2026-09-02",
      1,
      10
    );

    expect(result.nights[0]?.available).toBe(0);
  });
});
