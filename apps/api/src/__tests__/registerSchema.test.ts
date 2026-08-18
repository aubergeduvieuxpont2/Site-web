// @vitest-environment node
import { describe, it, expect } from "vitest";
import { RegisterSchema } from "../index";

// Regression guard: the web form sends `phone: regPhone.trim() || null` for
// every blank optional field. `trimToNull` used `.optional()`, which accepts
// string | undefined but NOT null, so zod rejected the payload with
// "Invalid input: expected string, received null" — and registration was
// impossible unless the user filled in every optional field.
describe("RegisterSchema optional fields", () => {
  const base = { email: "a@b.co", password: "a-long-enough-password" };

  it("accepts explicit nulls, as the registration form sends them", () => {
    const r = RegisterSchema.safeParse({
      ...base,
      firstName: null,
      lastName: null,
      phone: null,
      company: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBeNull();
  });

  it("still accepts omitted fields", () => {
    expect(RegisterSchema.safeParse(base).success).toBe(true);
  });

  it("still normalises blank and padded strings to null", () => {
    const r = RegisterSchema.safeParse({ ...base, phone: "   ", company: " X " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeNull();
      expect(r.data.company).toBe("X");
    }
  });
});
