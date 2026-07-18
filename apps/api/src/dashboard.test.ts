import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  toISODate,
  occupancyRatio,
  weekBounds,
  getDashboardData,
} from "./dashboard";

// Hoist mock before any imports that resolve it
vi.mock("./availability", () => ({
  availabilityForRange: vi.fn(),
}));

import { availabilityForRange } from "./availability";
const mockAvailability = vi.mocked(availabilityForRange);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Creates a NeonQueryFunction mock that returns successive responses in order.
 * Works as a tagged template literal (sql`...`) because that is just a
 * function call with (TemplateStringsArray, ...values).
 */
function makeSql(responses: unknown[][]): NeonQueryFunction<any, any> {
  let callIndex = 0;
  return ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.resolve(
      responses[callIndex++] ?? []
    )) as unknown as NeonQueryFunction<any, any>;
}

// Default 7-night stub used in getDashboardData tests
const STUB_7_NIGHTS = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-07-${String(18 + i).padStart(2, "0")}`,
  available: 12,
}));

// ─────────────────────────────────────────────────────────────────────────────

describe("toISODate", () => {
  it("formats a UTC midnight date", () => {
    expect(toISODate(new Date("2026-07-18T00:00:00Z"))).toBe("2026-07-18");
  });

  it("formats a UTC noon date (time does not bleed into next day)", () => {
    expect(toISODate(new Date("2026-07-18T12:00:00Z"))).toBe("2026-07-18");
  });

  it("formats end-of-month correctly", () => {
    expect(toISODate(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01-31");
  });

  it("is anchored to UTC, not the local offset", () => {
    // Regardless of the host machine's timezone, UTC date must be 2026-01-01
    expect(toISODate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("occupancyRatio", () => {
  it("computes a simple ratio (6 / (2×5) = 0.6)", () => {
    expect(occupancyRatio("6", 2, 5)).toBe(0.6);
  });

  it("rounds to 3 decimal places (1 / 3 ≈ 0.333)", () => {
    expect(occupancyRatio("1", 3, 1)).toBe(0.333);
  });

  it("returns 0 when room_nights is '0'", () => {
    expect(occupancyRatio("0", 5, 30)).toBe(0);
  });

  it("returns null when rooms is 0 (zero denominator)", () => {
    expect(occupancyRatio("10", 0, 5)).toBeNull();
  });

  it("returns null when days is 0 (zero denominator)", () => {
    expect(occupancyRatio("10", 5, 0)).toBeNull();
  });

  it("returns null when both rooms and days are 0", () => {
    expect(occupancyRatio("10", 0, 0)).toBeNull();
  });

  it("treats null roomNights as 0 → ratio is 0", () => {
    expect(occupancyRatio(null, 5, 30)).toBe(0);
  });

  it("treats undefined roomNights as 0 → ratio is 0", () => {
    expect(occupancyRatio(undefined, 5, 30)).toBe(0);
  });

  it("handles full occupancy (ratio = 1.000)", () => {
    // 12 rooms × 31 days = 372
    expect(occupancyRatio("372", 12, 31)).toBe(1);
  });

  it("does not clamp above 1 (overbooking scenario passes through)", () => {
    // 400 > 372 → ratio > 1
    expect(occupancyRatio("400", 12, 31)).toBeGreaterThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("weekBounds", () => {
  // Reference: July 11 2026 = Saturday (doomsday check: 4/4, 6/6, 8/8 all Sat)
  // July 13 2026 = Monday ✓, July 18 2026 = Saturday ✓

  it("Saturday (July 18): thisMonday=Jul 13, thisSunday=Jul 19, lastMonday=Jul 6, lastSunday=Jul 12", () => {
    const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(
      new Date("2026-07-18T12:00:00Z")
    );
    expect(toISODate(thisMonday)).toBe("2026-07-13");
    expect(toISODate(thisSunday)).toBe("2026-07-19");
    expect(toISODate(lastMonday)).toBe("2026-07-06");
    expect(toISODate(lastSunday)).toBe("2026-07-12");
  });

  it("Monday (July 13): thisMonday == today", () => {
    const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(
      new Date("2026-07-13T12:00:00Z")
    );
    expect(toISODate(thisMonday)).toBe("2026-07-13");
    expect(toISODate(thisSunday)).toBe("2026-07-19");
    expect(toISODate(lastMonday)).toBe("2026-07-06");
    expect(toISODate(lastSunday)).toBe("2026-07-12");
  });

  it("Sunday (July 19): belongs to the same Mon–Sun week as July 13", () => {
    const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(
      new Date("2026-07-19T12:00:00Z")
    );
    expect(toISODate(thisMonday)).toBe("2026-07-13");
    expect(toISODate(thisSunday)).toBe("2026-07-19");
    expect(toISODate(lastMonday)).toBe("2026-07-06");
    expect(toISODate(lastSunday)).toBe("2026-07-12");
  });

  it("Wednesday (July 15): daysToMonday=2, thisMonday=Jul 13", () => {
    const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(
      new Date("2026-07-15T12:00:00Z")
    );
    expect(toISODate(thisMonday)).toBe("2026-07-13");
    expect(toISODate(thisSunday)).toBe("2026-07-19");
    expect(toISODate(lastMonday)).toBe("2026-07-06");
    expect(toISODate(lastSunday)).toBe("2026-07-12");
  });

  it("cross-month: Monday Aug 3 — lastWeek spans into July", () => {
    const { thisMonday, thisSunday, lastMonday, lastSunday } = weekBounds(
      new Date("2026-08-03T12:00:00Z")
    );
    expect(toISODate(thisMonday)).toBe("2026-08-03");
    expect(toISODate(thisSunday)).toBe("2026-08-09");
    expect(toISODate(lastMonday)).toBe("2026-07-27");
    expect(toISODate(lastSunday)).toBe("2026-08-02");
  });

  it("thisMonday and lastSunday are exactly 1 day apart", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const { thisMonday, lastSunday } = weekBounds(now);
    const diffMs = thisMonday.getTime() - lastSunday.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(1);
  });

  it("thisMonday is always UTC midnight", () => {
    const { thisMonday } = weekBounds(new Date("2026-07-18T23:59:59Z"));
    expect(thisMonday.getUTCHours()).toBe(0);
    expect(thisMonday.getUTCMinutes()).toBe(0);
    expect(thisMonday.getUTCSeconds()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("getDashboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAvailability.mockResolvedValue({
      nights: STUB_7_NIGHTS,
      unavailableNights: [],
    });
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns all required output fields", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "25", last_week: "18" }],
      [{ room_nights: "60" }],
      [{ room_nights: "45" }],
      [{ room_nights: "30" }],
      [{ count: "7" }],
    ]);

    const result = await getDashboardData(sql, 12, now);

    expect(result).toMatchObject({
      guestsThisWeek: 25,
      guestsLastWeek: 18,
      returningCustomers: 7,
      next7Days: expect.any(Array),
      occupancy: {
        currentMonth: expect.anything(),
        previousMonth: expect.anything(),
        sameMonthLastYear: expect.anything(),
      },
    });
  });

  it("maps guest counts from SQL numeric strings", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "100", last_week: "85" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "3" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.guestsThisWeek).toBe(100);
    expect(result.guestsLastWeek).toBe(85);
  });

  // ── Occupancy ratio computation ─────────────────────────────────────────────

  it("computes occupancy ratios from fixture room-nights (July 18: dayOfMonth=18)", async () => {
    // denominator = 12 rooms × 18 days = 216
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: "108" }], // 108 / 216 = 0.5
      [{ room_nights: "54" }],  // 54  / 216 = 0.25
      [{ room_nights: "216" }], // 216 / 216 = 1.0
      [{ count: "0" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.occupancy.currentMonth).toBe(0.5);
    expect(result.occupancy.previousMonth).toBe(0.25);
    expect(result.occupancy.sameMonthLastYear).toBe(1);
  });

  it("uses dayOfMonth=1 for occupancy denominator on the 1st of the month", async () => {
    // denominator = 12 rooms × 1 day = 12
    const now = new Date("2026-08-01T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: "6" }], // 6 / 12 = 0.5
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);
    mockAvailability.mockResolvedValueOnce({
      nights: [{ date: "2026-08-01", available: 12 }],
      unavailableNights: [],
    });

    const result = await getDashboardData(sql, 12, now);
    expect(result.occupancy.currentMonth).toBe(0.5);
  });

  // ── Zero assignableRoomCount → null occupancy ───────────────────────────────

  it("returns null occupancy ratios when assignableRoomCount is 0", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "5", last_week: "3" }],
      [{ room_nights: "10" }],
      [{ room_nights: "8" }],
      [{ room_nights: "6" }],
      [{ count: "2" }],
    ]);

    const result = await getDashboardData(sql, 0, now);
    expect(result.occupancy.currentMonth).toBeNull();
    expect(result.occupancy.previousMonth).toBeNull();
    expect(result.occupancy.sameMonthLastYear).toBeNull();
  });

  // ── Null / missing aggregates ───────────────────────────────────────────────

  it("coerces null SQL aggregates to 0 for guest counts", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: null, last_week: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.guestsThisWeek).toBe(0);
    expect(result.guestsLastWeek).toBe(0);
  });

  it("handles empty result rows (no rows returned at all)", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([[], [], [], [], []]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.guestsThisWeek).toBe(0);
    expect(result.guestsLastWeek).toBe(0);
    expect(result.returningCustomers).toBe(0);
  });

  it("coerces null room_nights to null occupancy ratio", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    // room_nights: null → occupancyRatio(null, 12, 18) → 0 (not null, because denom ≠ 0)
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    // null roomNights with valid rooms/days → ratio is 0, not null
    expect(result.occupancy.currentMonth).toBe(0);
    expect(result.occupancy.previousMonth).toBe(0);
    expect(result.occupancy.sameMonthLastYear).toBe(0);
  });

  // ── availabilityForRange integration ───────────────────────────────────────

  it("calls availabilityForRange with today and today+7", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    await getDashboardData(sql, 12, now);

    expect(mockAvailability).toHaveBeenCalledWith(
      expect.anything(), // sql
      "2026-07-18",      // today
      "2026-07-25",      // today + 7
      1,                 // minimum rooms threshold for the query
      12                 // assignableRoomCount
    );
  });

  it("passes the availability nights through as next7Days", async () => {
    const customNights = [
      { date: "2026-07-18", available: 3 },
      { date: "2026-07-19", available: 0 },
      { date: "2026-07-20", available: 12 },
    ];
    mockAvailability.mockResolvedValueOnce({
      nights: customNights,
      unavailableNights: ["2026-07-19"],
    });

    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.next7Days).toEqual(customNights);
  });

  it("passes assignableRoomCount to availabilityForRange", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    await getDashboardData(sql, 8, now); // 8 rooms, not 12

    expect(mockAvailability).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      1,
      8 // ← must be 8
    );
  });

  // ── `now` parameter is honoured (no system clock dependency) ───────────────

  it("uses the supplied `now` date rather than system time", async () => {
    // Pinned to a specific Monday so week bounds are deterministic
    const now = new Date("2026-01-05T00:00:00Z"); // Monday Jan 5
    const sql = makeSql([
      [{ this_week: "10", last_week: "5" }],
      [{ room_nights: "20" }],
      [{ room_nights: "18" }],
      [{ room_nights: "12" }],
      [{ count: "3" }],
    ]);
    mockAvailability.mockResolvedValueOnce({
      nights: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-01-${String(5 + i).padStart(2, "0")}`,
        available: 12,
      })),
      unavailableNights: [],
    });

    const result = await getDashboardData(sql, 12, now);
    expect(result.guestsThisWeek).toBe(10);
    expect(result.guestsLastWeek).toBe(5);
    expect(result.returningCustomers).toBe(3);
  });

  // ── Returning customers ─────────────────────────────────────────────────────

  it("returns 0 returning customers when count is '0'", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.returningCustomers).toBe(0);
  });

  it("converts returningCustomers count string to a number", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ room_nights: null }],
      [{ count: "42" }],
    ]);

    const result = await getDashboardData(sql, 12, now);
    expect(result.returningCustomers).toBe(42);
    expect(typeof result.returningCustomers).toBe("number");
  });

  // ── Month-boundary edge cases ───────────────────────────────────────────────

  it("handles January (previous month wraps to December of previous year)", async () => {
    // Jan 15, 2026: prev month = Dec 2025 (31 days), same day span = 15 days
    const now = new Date("2026-01-15T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: "90" }],  // 90 / (12×15) = 0.5
      [{ room_nights: "45" }],  // 45 / (12×15) = 0.25
      [{ room_nights: "180" }], // 180/ (12×15) = 1.0
      [{ count: "1" }],
    ]);
    mockAvailability.mockResolvedValueOnce({
      nights: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-01-${String(15 + i).padStart(2, "0")}`,
        available: 12,
      })),
      unavailableNights: [],
    });

    const result = await getDashboardData(sql, 12, now);
    expect(result.occupancy.currentMonth).toBe(0.5);
    expect(result.occupancy.previousMonth).toBe(0.25);
    expect(result.occupancy.sameMonthLastYear).toBe(1);
  });

  it("caps previous-month day-span for February (March 31 → prevDayOfMonth=28)", async () => {
    // March 31, 2026: prev month = Feb 2026, Feb has 28 days → prevDayOfMonth = min(31,28) = 28
    const now = new Date("2026-03-31T12:00:00Z");
    const sql = makeSql([
      [{ this_week: "0", last_week: "0" }],
      [{ room_nights: "186" }], // 186 / (12×31) = 186/372 = 0.5
      [{ room_nights: "168" }], // 168 / (12×28) = 168/336 = 0.5
      [{ room_nights: null }],
      [{ count: "0" }],
    ]);
    mockAvailability.mockResolvedValueOnce({
      nights: [{ date: "2026-03-31", available: 12 }],
      unavailableNights: [],
    });

    const result = await getDashboardData(sql, 12, now);
    expect(result.occupancy.currentMonth).toBe(0.5);   // 186/(12×31)
    expect(result.occupancy.previousMonth).toBe(0.5);  // 168/(12×28) — not 12×31
    expect(result.occupancy.sameMonthLastYear).toBe(0); // null room_nights → 0
  });
});
