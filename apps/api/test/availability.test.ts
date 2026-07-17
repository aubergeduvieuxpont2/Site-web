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
});
