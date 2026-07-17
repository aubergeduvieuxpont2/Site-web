import { describe, it, expect } from "vitest";
import { RoomCreateSchema, RoomUpdateSchema } from "../src/rooms";

const base = { name: "Chambre Test", capacity: 2, imageKey: "bedroom", isPublic: true } as const;

describe("Room pass-key validation", () => {
  it("accepts the toggle disabled with no pass-key", () => {
    const r = RoomCreateSchema.safeParse({ ...base, passkeyEnabled: false });
    expect(r.success).toBe(true);
  });

  it("accepts the toggle enabled with a pass-key", () => {
    const r = RoomCreateSchema.safeParse({ ...base, passkeyEnabled: true, passkey: "4921" });
    expect(r.success).toBe(true);
  });

  it("rejects the toggle enabled with a missing pass-key", () => {
    const r = RoomCreateSchema.safeParse({ ...base, passkeyEnabled: true });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toContain("passkey");
    }
  });

  it("rejects the toggle enabled with a blank pass-key", () => {
    const r = RoomCreateSchema.safeParse({ ...base, passkeyEnabled: true, passkey: "   " });
    expect(r.success).toBe(false);
  });

  it("trims the pass-key", () => {
    const r = RoomCreateSchema.safeParse({ ...base, passkeyEnabled: true, passkey: "  4921  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.passkey).toBe("4921");
    }
  });

  it("RoomUpdateSchema enforces the same rule", () => {
    expect(RoomUpdateSchema.safeParse({ ...base, passkeyEnabled: true }).success).toBe(false);
    expect(RoomUpdateSchema.safeParse({ ...base, passkeyEnabled: false }).success).toBe(true);
  });
});
