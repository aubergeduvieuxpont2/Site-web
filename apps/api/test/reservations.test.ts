import { describe, it, expect } from "vitest";
import { ReservationRequestSchema } from "../src/index";

// The reservation request contract: the frontend sends
// firstName/lastName/email/checkIn/checkOut/guests/roomCount/message and the
// server maps checkIn/checkOut/guests to the arrive/depart/people columns and
// derives `name` from first + last. roomCount is required (min 1).
describe("ReservationRequestSchema", () => {
  const base = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    checkIn: "2026-08-01",
    checkOut: "2026-08-03",
    guests: 2,
    roomCount: 3,
    message: "Merci",
  };

  it("accepts a full valid payload with the new fields", () => {
    const result = ReservationRequestSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Ada");
      expect(result.data.lastName).toBe("Lovelace");
      expect(result.data.roomCount).toBe(3);
      expect(result.data.guests).toBe(2);
      expect(result.data.checkIn).toBe("2026-08-01");
      expect(result.data.checkOut).toBe("2026-08-03");
    }
  });

  it("coerces a numeric-string roomCount", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      roomCount: "4",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roomCount).toBe(4);
  });

  it("rejects roomCount below 1", () => {
    const result = ReservationRequestSchema.safeParse({ ...base, roomCount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a roomCount above the max (L5)", () => {
    const result = ReservationRequestSchema.safeParse({ ...base, roomCount: 21 });
    expect(result.success).toBe(false);
  });

  it("clamps an out-of-range guests count to 1 (L5)", () => {
    const result = ReservationRequestSchema.safeParse({ ...base, guests: 999 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.guests).toBe(1);
  });

  it("rejects an omitted roomCount", () => {
    const { roomCount, ...withoutRoomCount } = base;
    const result = ReservationRequestSchema.safeParse(withoutRoomCount);
    expect(result.success).toBe(false);
  });

  it("requires firstName and lastName", () => {
    expect(
      ReservationRequestSchema.safeParse({ ...base, firstName: "" }).success
    ).toBe(false);
    expect(
      ReservationRequestSchema.safeParse({ ...base, lastName: "" }).success
    ).toBe(false);
  });

  it("requires a valid email", () => {
    expect(
      ReservationRequestSchema.safeParse({ ...base, email: "nope" }).success
    ).toBe(false);
  });

  it("defaults an invalid guests count to 1", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      guests: "abc",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.guests).toBe(1);
  });

  it("maps optional checkIn/checkOut to null when blank", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      checkIn: "",
      checkOut: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checkIn).toBeNull();
      expect(result.data.checkOut).toBeNull();
    }
  });

  const ORDER_MESSAGE =
    "La date de départ doit être postérieure à la date d'arrivée.";

  it("rejects equal check-in and check-out dates", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      checkIn: "2026-08-10",
      checkOut: "2026-08-10",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(ORDER_MESSAGE);
      expect(result.error.issues[0].path).toEqual(["checkOut"]);
    }
  });

  it("rejects a check-out date before the check-in date", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      checkIn: "2026-08-10",
      checkOut: "2026-08-09",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(ORDER_MESSAGE);
      expect(result.error.issues[0].path).toEqual(["checkOut"]);
    }
  });

  it("accepts a check-out date after the check-in date", () => {
    const result = ReservationRequestSchema.safeParse({
      ...base,
      checkIn: "2026-08-10",
      checkOut: "2026-08-11",
    });
    expect(result.success).toBe(true);
  });

  it("accepts when both dates are omitted", () => {
    const { checkIn, checkOut, ...withoutDates } = base;
    const result = ReservationRequestSchema.safeParse(withoutDates);
    expect(result.success).toBe(true);
  });

  it("accepts when only one date is present", () => {
    expect(
      ReservationRequestSchema.safeParse({
        ...base,
        checkIn: "2026-08-10",
        checkOut: "",
      }).success
    ).toBe(true);
    expect(
      ReservationRequestSchema.safeParse({
        ...base,
        checkIn: "",
        checkOut: "2026-08-10",
      }).success
    ).toBe(true);
  });
});
