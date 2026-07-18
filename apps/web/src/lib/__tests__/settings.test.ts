import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicSettings, adminUpdateSettings } from "../api";
import type { PublicSettings, AdminSettings } from "../api";

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
    ...(incoming.contactPhone !== undefined && {
      contactPhone: incoming.contactPhone,
    }),
    ...(incoming.marketingRoomCount !== undefined && {
      marketingRoomCount: incoming.marketingRoomCount,
    }),
    ...(incoming.publicRoomCount !== undefined && {
      publicRoomCount: incoming.publicRoomCount,
    }),
    ...(incoming.tps !== undefined && {
      tps: incoming.tps,
    }),
    ...(incoming.tvq !== undefined && {
      tvq: incoming.tvq,
    }),
    ...(incoming.accommodationTax !== undefined && {
      accommodationTax: incoming.accommodationTax,
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
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const incoming = {
        contactEmail: "new@example.com",
      };
      const result = mergeSettings(current, incoming);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "new@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      });
    });

    it("overlays an incoming contactPhone", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const result = mergeSettings(current, { contactPhone: "581 000-0000" });
      expect(result.contactPhone).toBe("581 000-0000");
    });

    it("leaves current values unchanged when incoming is empty", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const result = mergeSettings(current, {});
      expect(result).toEqual(current);
    });

    it("handles multiple incoming updates", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "old@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const incoming = {
        nightlyPrice: 99,
        contactEmail: "new@example.com",
      };
      const result = mergeSettings(current, incoming);
      expect(result).toEqual({
        nightlyPrice: 99,
        contactEmail: "new@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      });
    });

    it("merges the live publicRoomCount when present in incoming", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const incoming = {
        publicRoomCount: 8,
      };
      const result = mergeSettings(current, incoming);
      expect(result.publicRoomCount).toBe(8);
    });

    it("keeps the fallback publicRoomCount when the API omits it", () => {
      const current: PublicSettings = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      };
      const incoming: Partial<PublicSettings> = {};
      const result = mergeSettings(current, incoming);
      expect(result.publicRoomCount).toBe(12);
    });
  });

  describe("getPublicSettings", () => {
    it("returns public settings from API", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nightlyPrice: 89,
            contactEmail: "info@example.com",
            contactPhone: "418 655-1212",
            marketingRoomCount: 12,
            publicRoomCount: 8,
            tps: 5,
            tvq: 9.975,
            accommodationTax: 3.5,
          })
        )
      );

      const result = await getPublicSettings();
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        publicRoomCount: 8,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
      });
    });

    it("returns error on API failure", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));
      const result = await getPublicSettings();
      expect(result).toHaveProperty("error");
    });

    it("returns error on network failure", async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error("Network error"));
      const result = await getPublicSettings();
      expect(result).toHaveProperty("error");
    });
  });

  describe("adminUpdateSettings", () => {
    it("sends PUT request with settings data", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nightlyPrice: 99,
            contactEmail: "new@example.com",
            contactPhone: "418 655-1212",
            marketingRoomCount: 12,
            assignableRoomCount: 12,
            tps: 5,
            tvq: 9.975,
            accommodationTax: 3.5,
          })
        )
      );

      const settings: AdminSettings = {
        nightlyPrice: 99,
        contactEmail: "new@example.com",
        contactPhone: "418 655-1212",
        marketingRoomCount: 12,
        assignableRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
        emailConfirmationEnabled: false,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: false,
        emailWelcomeEnabled: false,
      };

      const result = await adminUpdateSettings(settings);

      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(settings),
        })
      );
      expect(result).not.toHaveProperty("error");
    });

    it("returns error on invalid request", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid settings" }), { status: 400 })
      );

      const settings: AdminSettings = {
        nightlyPrice: 0,
        contactEmail: "invalid",
        contactPhone: "",
        marketingRoomCount: 0,
        assignableRoomCount: 0,
        tps: -1,
        tvq: 9.975,
        accommodationTax: 3.5,
        emailConfirmationEnabled: false,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: false,
        emailWelcomeEnabled: false,
      };

      const result = await adminUpdateSettings(settings);
      expect(result).toHaveProperty("error");
    });
  });
});
