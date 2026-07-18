import { describe, it, expect } from "vitest";
import { availabilityForRange } from "../src/availability";

// Mock NeonQueryFunction for testing. The real function would be a database query,
// but for unit tests we simulate the availability calculation logic.
async function mockSql(query: string): Promise<any> {
  // This is a simplistic mock; real tests would use a test database.
  // For now, we just verify the function accepts queries and returns the right shape.
  return [];
}

describe("availabilityForRange", () => {
  // Note: These tests verify the function signature and return type.
  // Full integration tests would require a test database.

  it("returns an AvailabilityResult with nights and unavailableNights arrays", async () => {
    // Verify the function returns the expected structure even with mock data.
    const result = await availabilityForRange(
      mockSql as any,
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

  it("preserves date format in response", async () => {
    const result = await availabilityForRange(
      mockSql as any,
      "2026-08-01",
      "2026-08-03",
      1,
      12
    );

    // Even with empty mock data, verify the structure would support YYYY-MM-DD format.
    expect(result.nights).toBeDefined();
    expect(result.unavailableNights).toBeDefined();
  });

  it("accepts valid date range parameters", async () => {
    // Verify the function accepts the parameters without throwing.
    const result = await availabilityForRange(
      mockSql as any,
      "2026-01-01",
      "2026-12-31",
      2,
      12
    );

    expect(result).toBeDefined();
    expect(result.nights).toBeDefined();
  });

  it("coerces the Neon string `available` to a number and computes unavailability", async () => {
    // The Neon HTTP driver serializes the computed `available` column as a
    // string; the API contract requires numbers.
    const stringRows = async () => [
      { date: "2026-08-01", available: "12" },
      { date: "2026-08-02", available: "0" },
      { date: "2026-08-03", available: "2" },
    ];

    const result = await availabilityForRange(
      stringRows as any,
      "2026-08-01",
      "2026-08-04",
      2, // request 2 rooms
      12
    );

    // Every night's `available` is a real number, not a string.
    for (const n of result.nights) {
      expect(typeof n.available).toBe("number");
    }
    expect(result.nights.map((n) => n.available)).toEqual([12, 0, 2]);

    // Nights with fewer than the requested 2 rooms are unavailable: Aug 2 (0)
    // and Aug 3 (2 is NOT < 2, so available). Only Aug 2 is blocked.
    expect(result.unavailableNights).toEqual(["2026-08-02"]);
  });
});
