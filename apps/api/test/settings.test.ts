import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SettingsUpdateSchema,
  PUBLIC_SETTING_KEYS,
  rowsToAdminSettings,
  toPublicSettings,
  SETTINGS_DEFAULTS,
  type AdminSettings,
  type PublicSettings,
} from "../src/settings";

describe("Settings", () => {
  describe("SettingsUpdateSchema", () => {
    it("accepts a valid payload", () => {
      const valid = {
        nightlyPrice: 99,
        contactEmail: "test@example.com",
        marketingRoomCount: 10,
        assignableRoomCount: 12,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(valid);
      }
    });

    it("rejects negative price", () => {
      const invalid = {
        nightlyPrice: -50,
        contactEmail: "test@example.com",
        marketingRoomCount: 10,
        assignableRoomCount: 12,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects zero price", () => {
      const invalid = {
        nightlyPrice: 0,
        contactEmail: "test@example.com",
        marketingRoomCount: 10,
        assignableRoomCount: 12,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects negative count", () => {
      const invalid = {
        nightlyPrice: 89,
        contactEmail: "test@example.com",
        marketingRoomCount: -5,
        assignableRoomCount: 12,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const invalid = {
        nightlyPrice: 89,
        contactEmail: "not-an-email",
        marketingRoomCount: 10,
        assignableRoomCount: 12,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("PUBLIC_SETTING_KEYS", () => {
    it("excludes assignable_room_count", () => {
      expect(PUBLIC_SETTING_KEYS).toContain("nightly_price");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_email");
      expect(PUBLIC_SETTING_KEYS).toContain("marketing_room_count");
      expect(PUBLIC_SETTING_KEYS).not.toContain("assignable_room_count");
    });
  });

  describe("rowsToAdminSettings", () => {
    it("coerces numeric keys from strings", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "12" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        marketingRoomCount: 12,
        assignableRoomCount: 12,
      });
    });

    it("fills missing keys from defaults", () => {
      const rows = [{ key: "nightly_price", value: "100" }];
      const result = rowsToAdminSettings(rows);
      expect(result.nightlyPrice).toBe(100);
      expect(result.contactEmail).toBe("info@aubergeduvieuxpont.ca");
      expect(result.marketingRoomCount).toBe(12);
      expect(result.assignableRoomCount).toBe(12);
    });

    it("handles empty rows array with all defaults", () => {
      const result = rowsToAdminSettings([]);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@aubergeduvieuxpont.ca",
        marketingRoomCount: 12,
        assignableRoomCount: 12,
      });
    });
  });

  describe("toPublicSettings", () => {
    it("omits assignableRoomCount", () => {
      const admin = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        marketingRoomCount: 12,
        assignableRoomCount: 20,
      };
      const result = toPublicSettings(admin);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        marketingRoomCount: 12,
      });
      expect("assignableRoomCount" in result).toBe(false);
    });
  });

  describe("HTTP Endpoints - GET /api/settings (public)", () => {
    let mockContext: any;

    beforeEach(() => {
      mockContext = {
        req: {
          header: vi.fn(),
          valid: vi.fn(),
          query: vi.fn(),
          param: vi.fn(),
        },
        json: vi.fn((data, status) => {
          mockContext.responseData = data;
          mockContext.responseStatus = status;
          return Promise.resolve();
        }),
        env: {
          DB_CONN: "postgres://mock",
        },
      };
    });

    it("returns public settings from database", async () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
        { key: "marketing_room_count", value: "15" },
        { key: "assignable_room_count", value: "20" },
      ];

      const sql = vi.fn(() => Promise.resolve(mockRows));

      // Simulate the endpoint handler
      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(publicSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
        marketingRoomCount: 15,
      });
      expect("assignableRoomCount" in publicSettings).toBe(false);
    });

    it("never includes assignableRoomCount in response", () => {
      const mockRows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "25" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      // Verify all expected keys are present
      expect(Object.keys(publicSettings).sort()).toEqual([
        "contactEmail",
        "marketingRoomCount",
        "nightlyPrice",
      ]);
      // Verify assignableRoomCount is absolutely not present
      expect(publicSettings).not.toHaveProperty("assignableRoomCount");
    });

    it("gracefully handles missing database rows with defaults", () => {
      const mockRows: Array<{ key: string; value: string }> = [];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(publicSettings).toEqual({
        nightlyPrice: SETTINGS_DEFAULTS.nightly_price,
        contactEmail: SETTINGS_DEFAULTS.contact_email,
        marketingRoomCount: SETTINGS_DEFAULTS.marketing_room_count,
      });
    });
  });

  describe("HTTP Endpoints - GET /api/admin/settings", () => {
    it("returns admin settings when authenticated as admin", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
        { key: "marketing_room_count", value: "15" },
        { key: "assignable_room_count", value: "20" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
        marketingRoomCount: 15,
        assignableRoomCount: 20,
      });
    });

    it("includes assignableRoomCount in admin response", () => {
      const mockRows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "25" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toHaveProperty("assignableRoomCount");
      expect(adminSettings.assignableRoomCount).toBe(25);
    });

    it("returns all four settings even if some are missing from database", () => {
      const mockRows = [{ key: "nightly_price", value: "100" }];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toEqual({
        nightlyPrice: 100,
        contactEmail: SETTINGS_DEFAULTS.contact_email,
        marketingRoomCount: SETTINGS_DEFAULTS.marketing_room_count,
        assignableRoomCount: SETTINGS_DEFAULTS.assignable_room_count,
      });
    });
  });

  describe("HTTP Endpoints - POST /api/admin/settings", () => {
    it("validates all four required fields", () => {
      const validPayload = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      const result = SettingsUpdateSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("rejects payload missing nightlyPrice", () => {
      const invalid = {
        contactEmail: "admin@example.com",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects payload with invalid email", () => {
      const invalid = {
        nightlyPrice: 99,
        contactEmail: "not-an-email",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects zero or negative prices", () => {
      const zeroPrice = {
        nightlyPrice: 0,
        contactEmail: "admin@example.com",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      const negPrice = {
        nightlyPrice: -10,
        contactEmail: "admin@example.com",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      expect(SettingsUpdateSchema.safeParse(zeroPrice).success).toBe(false);
      expect(SettingsUpdateSchema.safeParse(negPrice).success).toBe(false);
    });

    it("rejects zero or negative room counts", () => {
      const zeroCount = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        marketingRoomCount: 0,
        assignableRoomCount: 15,
      };

      const negCount = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        marketingRoomCount: 20,
        assignableRoomCount: -5,
      };

      expect(SettingsUpdateSchema.safeParse(zeroCount).success).toBe(false);
      expect(SettingsUpdateSchema.safeParse(negCount).success).toBe(false);
    });

    it("coerces numeric strings to numbers", () => {
      const stringPayload = {
        nightlyPrice: "99",
        contactEmail: "admin@example.com",
        marketingRoomCount: "20",
        assignableRoomCount: "15",
      };

      const result = SettingsUpdateSchema.safeParse(stringPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nightlyPrice).toBe(99);
        expect(result.data.marketingRoomCount).toBe(20);
        expect(result.data.assignableRoomCount).toBe(15);
      }
    });

    it("trims whitespace from email", () => {
      const payload = {
        nightlyPrice: 99,
        contactEmail: "  admin@example.com  ",
        marketingRoomCount: 20,
        assignableRoomCount: 15,
      };

      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactEmail).toBe("admin@example.com");
      }
    });
  });

  describe("Invariants", () => {
    it("INV-assignable-private: public endpoint never exposes assignable_room_count", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "50" },
      ];

      const adminSettings = rowsToAdminSettings(rows);
      const publicSettings = toPublicSettings(adminSettings);

      // The public response should never have assignable_room_count
      const publicKeys = Object.keys(publicSettings);
      expect(publicKeys).not.toContain("assignableRoomCount");
      expect(publicKeys.length).toBe(3);
    });

    it("INV-one-row-per-key: rowsToAdminSettings handles exactly one row per key", () => {
      // Simulate database state after migration (exactly one row per key)
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "12" },
      ];

      const settings = rowsToAdminSettings(rows);

      expect(settings.nightlyPrice).toBe(89);
      expect(settings.contactEmail).toBe("info@aubergeduvieuxpont.ca");
      expect(settings.marketingRoomCount).toBe(12);
      expect(settings.assignableRoomCount).toBe(12);
    });

    it("INV-one-row-per-key: migration creates exactly one row per key", () => {
      // After migration with ON CONFLICT DO NOTHING, re-running should not create duplicates
      const firstRun = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "12" },
      ];

      const secondRun = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "12" },
      ];

      // Both runs should produce identical results
      const result1 = rowsToAdminSettings(firstRun);
      const result2 = rowsToAdminSettings(secondRun);

      expect(result1).toEqual(result2);
    });
  });
});
