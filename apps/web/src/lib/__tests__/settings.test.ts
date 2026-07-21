import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getPublicSettings, adminUpdateSettings } from "../api";
import type { PublicSettings, AdminSettings } from "../api";

// Pure function: mirrors the merge helper in settings.svelte.ts without importing
// from the .svelte module (which requires $state and breaks the test runner).
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
    ...(incoming.weeklyPrice !== undefined && {
      weeklyPrice: incoming.weeklyPrice,
    }),
    ...(incoming.reservationsEnabled !== undefined && {
      reservationsEnabled: incoming.reservationsEnabled,
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
            publicRoomCount: 8,
            tps: 5,
            tvq: 9.975,
            accommodationTax: 3.5,
          }),
        ),
      );

      const result = await getPublicSettings();
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
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
    it("sends POST request with all schema-required settings fields", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nightlyPrice: 99,
            weeklyPrice: 560,
            contactEmail: "new@example.com",
            contactPhone: "418 655-1212",
            assignableRoomCount: 12,
            tps: 5,
            tvq: 9.975,
            accommodationTax: 3.5,
            reservationsEnabled: true,
            emailConfirmationEnabled: false,
            emailPasswordResetEnabled: false,
            emailRoomAssignmentEnabled: false,
            emailWelcomeEnabled: false,
            emailReviewRequestEnabled: false,
          }),
        ),
      );

      const payload: AdminSettings = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "new@example.com",
        contactPhone: "418 655-1212",
        assignableRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
        reservationsEnabled: true,
        emailConfirmationEnabled: false,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: false,
        emailWelcomeEnabled: false,
        emailReviewRequestEnabled: false,
      };

      const result = await adminUpdateSettings(payload);

      expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );
      expect(result).not.toHaveProperty("error");
    });

    it("payload contains no marketingRoomCount key", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ nightlyPrice: 89 })),
      );

      const payload: AdminSettings = {
        nightlyPrice: 89,
        weeklyPrice: 560,
        contactEmail: "info@example.com",
        contactPhone: "418 655-1212",
        assignableRoomCount: 12,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
        reservationsEnabled: true,
        emailConfirmationEnabled: false,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: false,
        emailWelcomeEnabled: false,
        emailReviewRequestEnabled: false,
      };

      await adminUpdateSettings(payload);

      const callBody = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
      );
      expect(callBody).not.toHaveProperty("marketingRoomCount");
    });

    it("returns error on invalid request", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Invalid settings" }), { status: 400 }),
      );

      const payload: AdminSettings = {
        nightlyPrice: 0,
        weeklyPrice: 0,
        contactEmail: "invalid",
        contactPhone: "",
        assignableRoomCount: 0,
        tps: -1,
        tvq: 9.975,
        accommodationTax: 3.5,
        reservationsEnabled: true,
        emailConfirmationEnabled: false,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: false,
        emailWelcomeEnabled: false,
        emailReviewRequestEnabled: false,
      };

      const result = await adminUpdateSettings(payload);
      expect(result).toHaveProperty("error");
    });
  });
});

describe("INV-no-marketing-room-count — source-level invariants", () => {
  // These checks verify that the removed marketingRoomCount field has not
  // crept back into any of the three source files that previously carried it.
  // The backend no longer accepts or returns this key; any reintroduction would
  // cause the API to reject settings updates.

  it("content.ts DEFAULTS literal does not contain marketingRoomCount", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../content.ts"),
      "utf-8",
    );
    expect(src).not.toContain("marketingRoomCount");
  });

  it("settings.svelte.ts DEFAULTS and mergeSettings do not contain marketingRoomCount", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../settings.svelte.ts"),
      "utf-8",
    );
    expect(src).not.toContain("marketingRoomCount");
  });

  it("api.ts PublicSettings type does not contain marketingRoomCount", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../api.ts"),
      "utf-8",
    );
    // Neither the PublicSettings interface nor any helper should reference the
    // removed field; its presence would cause a type mismatch with the backend schema.
    expect(src).not.toContain("marketingRoomCount");
  });
});
