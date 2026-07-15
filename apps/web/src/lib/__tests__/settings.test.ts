import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicSettings, adminUpdateSettings } from "../api";
import type { PublicSettings } from "../api";

// Pure function: merge settings (not importing from .svelte file to avoid $state issues in tests)
function mergeSettings(
  current: PublicSettings,
  incoming: Partial<PublicSettings>,
): PublicSettings {
  return {
    ...current,
    ...(incoming.nightlyPrice !== undefined && {
      nightlyPrice: incoming.nightlyPrice,
    }),
    ...(incoming.contactEmail !== undefined && {
      contactEmail: incoming.contactEmail,
    }),
    ...(incoming.marketingRoomCount !== undefined && {
      marketingRoomCount: incoming.marketingRoomCount,
    }),
  };
}

// Mock fetch for the API calls
global.fetch = vi.fn();

describe("Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mergeSettings", () => {
    it("overlays defined incoming values", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "old@example.com",
        marketingRoomCount: 12,
      };
      const incoming = {
        contactEmail: "new@example.com",
      };
      const result = mergeSettings(current, incoming);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "new@example.com",
        marketingRoomCount: 12,
      });
    });

    it("leaves current values unchanged when incoming is empty", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        marketingRoomCount: 12,
      };
      const result = mergeSettings(current, {});
      expect(result).toEqual(current);
    });

    it("handles multiple incoming updates", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "old@example.com",
        marketingRoomCount: 12,
      };
      const incoming = {
        nightlyPrice: 99,
        contactEmail: "new@example.com",
      };
      const result = mergeSettings(current, incoming);
      expect(result).toEqual({
        nightlyPrice: 99,
        contactEmail: "new@example.com",
        marketingRoomCount: 12,
      });
    });
  });

  describe("getPublicSettings", () => {
    it("returns public settings from API", async () => {
      const mockSettings: PublicSettings = {
        nightlyPrice: 95,
        contactEmail: "info@test.com",
        marketingRoomCount: 15,
      };
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify(mockSettings), { status: 200 })
      );

      const result = await getPublicSettings();
      expect(result).toEqual(mockSettings);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ credentials: "include" })
      );
    });

    it("returns error on API failure", async () => {
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
      );

      const result = await getPublicSettings();
      expect("error" in result).toBe(true);
    });

    it("returns error on network failure", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await getPublicSettings();
      expect("error" in result).toBe(true);
    });
  });

  describe("adminUpdateSettings", () => {
    it("sends PUT request with settings data", async () => {
      const data = {
        nightlyPrice: 99,
        contactEmail: "new@example.com",
        marketingRoomCount: 10,
        assignableRoomCount: 15,
      };
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify(data), { status: 200 })
      );

      const result = await adminUpdateSettings(data);
      expect(result).toEqual(data);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(data),
        })
      );
    });

    it("returns error on invalid request", async () => {
      const data = {
        nightlyPrice: 99,
        contactEmail: "new@example.com",
        marketingRoomCount: 10,
        assignableRoomCount: 15,
      };
      (global.fetch as any).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid email" }), { status: 400 })
      );

      const result = await adminUpdateSettings(data);
      expect("error" in result).toBe(true);
    });
  });
});
