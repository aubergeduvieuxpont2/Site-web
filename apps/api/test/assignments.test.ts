import { describe, it, expect } from "vitest";
import { reservationDatesValid } from "../src/assignments";
import { nightsBetween } from "../src/pricing";

// Regression: the neon driver returns Postgres DATE columns as JS Date objects
// (not "YYYY-MM-DD" strings). Passing those into the date helpers must not
// throw (it caused a 500 on POST /api/admin/reservations/:id/assignments) and
// must produce the same answers as the string form.
describe("date helpers accept Date objects from the neon driver", () => {
  const arrive = new Date(2026, 6, 18); // 2026-07-18 local
  const depart = new Date(2026, 6, 20); // 2026-07-20 local

  it("reservationDatesValid(Date, Date) does not throw and validates order", () => {
    expect(reservationDatesValid(arrive as any, depart as any)).toBe(true);
    expect(reservationDatesValid(depart as any, arrive as any)).toBe(false);
    expect(reservationDatesValid(arrive as any, arrive as any)).toBe(false);
  });

  it("reservationDatesValid rejects an invalid Date", () => {
    expect(reservationDatesValid(new Date("nonsense") as any, depart as any)).toBe(false);
  });

  it("nightsBetween(Date, Date) does not throw and counts nights", () => {
    expect(nightsBetween(arrive as any, depart as any)).toBe(2);
  });

  it("string form still works", () => {
    expect(reservationDatesValid("2026-07-18", "2026-07-20")).toBe(true);
    expect(reservationDatesValid("2026-07-20", "2026-07-18")).toBe(false);
    expect(nightsBetween("2026-07-18", "2026-07-20")).toBe(2);
  });
});
