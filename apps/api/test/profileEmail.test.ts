import { describe, it, expect } from "vitest";
import { ProfileEmailSchema } from "../src/index";

describe("ProfileEmailSchema", () => {
  it("accepts a valid payload and trims the email", () => {
    const result = ProfileEmailSchema.safeParse({
      newEmail: "  new@example.com  ",
      currentPassword: "hunter2",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newEmail).toBe("new@example.com");
      expect(result.data.currentPassword).toBe("hunter2");
    }
  });

  it("rejects an invalid email", () => {
    const result = ProfileEmailSchema.safeParse({
      newEmail: "not-an-email",
      currentPassword: "hunter2",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing @ in the email", () => {
    const result = ProfileEmailSchema.safeParse({
      newEmail: "new.example.com",
      currentPassword: "hunter2",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty currentPassword", () => {
    const result = ProfileEmailSchema.safeParse({
      newEmail: "new@example.com",
      currentPassword: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing currentPassword", () => {
    const result = ProfileEmailSchema.safeParse({
      newEmail: "new@example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing newEmail", () => {
    const result = ProfileEmailSchema.safeParse({
      currentPassword: "hunter2",
    });

    expect(result.success).toBe(false);
  });
});
