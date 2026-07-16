import { describe, it, expect } from "vitest";
import {
  SettingsUpdateSchema,
  PUBLIC_SETTING_KEYS,
  rowsToAdminSettings,
  toPublicSettings,
  withPublicRoomCount,
  SETTINGS_DEFAULTS,
} from "../src/settings";

describe("Settings", () => {
  describe("SettingsUpdateSchema", () => {
    it("accepts a valid payload", () => {
      const valid = {
        nightlyPrice: 99,
        contactEmail: "test@example.com",
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
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects zero price", () => {
      const invalid = {
        nightlyPrice: 0,
        contactEmail: "test@example.com",
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const invalid = {
        nightlyPrice: 89,
        contactEmail: "not-an-email",
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects payload missing nightlyPrice", () => {
      const invalid = {
        contactEmail: "admin@example.com",
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("coerces numeric strings to numbers", () => {
      const stringPayload = {
        nightlyPrice: "99",
        contactEmail: "admin@example.com",
      };
      const result = SettingsUpdateSchema.safeParse(stringPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nightlyPrice).toBe(99);
      }
    });

    it("trims whitespace from email", () => {
      const payload = {
        nightlyPrice: 99,
        contactEmail: "  admin@example.com  ",
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactEmail).toBe("admin@example.com");
      }
    });
  });

  describe("PUBLIC_SETTING_KEYS", () => {
    it("contains exactly nightly_price and contact_email", () => {
      expect(PUBLIC_SETTING_KEYS).toContain("nightly_price");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_email");
      expect(PUBLIC_SETTING_KEYS).not.toContain("marketing_room_count");
      expect(PUBLIC_SETTING_KEYS).not.toContain("assignable_room_count");
    });
  });

  describe("rowsToAdminSettings", () => {
    it("coerces numeric keys from strings", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
      });
    });

    it("fills missing keys from defaults", () => {
      const rows = [{ key: "nightly_price", value: "100" }];
      const result = rowsToAdminSettings(rows);
      expect(result.nightlyPrice).toBe(100);
      expect(result.contactEmail).toBe("info@aubergeduvieuxpont.ca");
    });

    it("handles empty rows array with all defaults", () => {
      const result = rowsToAdminSettings([]);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@aubergeduvieuxpont.ca",
      });
    });
  });

  describe("toPublicSettings", () => {
    it("returns exactly nightlyPrice and contactEmail", () => {
      const admin = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
      };
      const result = toPublicSettings(admin);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
      });
    });

    it("public and admin settings have the same two keys", () => {
      const admin = {
        nightlyPrice: 99,
        contactEmail: "info@example.com",
      };
      const pub = toPublicSettings(admin);
      expect(Object.keys(pub).sort()).toEqual(["contactEmail", "nightlyPrice"]);
    });
  });

  describe("HTTP Endpoints - GET /api/settings (public)", () => {
    it("returns public settings from database", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(publicSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
      });
    });

    it("never includes room count keys in response", () => {
      const mockRows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
        { key: "marketing_room_count", value: "12" },
        { key: "assignable_room_count", value: "25" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(Object.keys(publicSettings).sort()).toEqual([
        "contactEmail",
        "nightlyPrice",
      ]);
      expect(publicSettings).not.toHaveProperty("marketingRoomCount");
      expect(publicSettings).not.toHaveProperty("assignableRoomCount");
    });

    it("gracefully handles missing database rows with defaults", () => {
      const mockRows: Array<{ key: string; value: string }> = [];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(publicSettings).toEqual({
        nightlyPrice: SETTINGS_DEFAULTS.nightly_price,
        contactEmail: SETTINGS_DEFAULTS.contact_email,
      });
    });
  });

  describe("withPublicRoomCount", () => {
    const base = { nightlyPrice: 89, contactEmail: "info@example.com" };

    it("includes publicRoomCount when the count succeeds", () => {
      // data-test="api-settings-public-room-count"
      const result = withPublicRoomCount(base, 3);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        publicRoomCount: 3,
      });
      expect(typeof result.publicRoomCount).toBe("number");
    });

    it("response shape includes all fields on success", () => {
      const result = withPublicRoomCount(base, 12);
      expect(Object.keys(result).sort()).toEqual([
        "contactEmail",
        "nightlyPrice",
        "publicRoomCount",
      ]);
    });

    it("preserves a zero count as a real value", () => {
      const result = withPublicRoomCount(base, 0);
      expect(result.publicRoomCount).toBe(0);
      expect(result).toHaveProperty("publicRoomCount");
    });

    it("omits publicRoomCount on simulated query error but stays valid", () => {
      const result = withPublicRoomCount(base, undefined);
      expect(result).not.toHaveProperty("publicRoomCount");
      // Still a valid response with the three base fields.
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
      });
      // Serialisable JSON — no undefined leaks into the payload.
      expect(JSON.parse(JSON.stringify(result))).toEqual(base);
    });

    it("does not mutate the input settings object", () => {
      const input = { ...base };
      withPublicRoomCount(input, 5);
      expect(input).toEqual(base);
      expect(input).not.toHaveProperty("publicRoomCount");
    });
  });

  describe("HTTP Endpoints - GET /api/admin/settings", () => {
    it("returns admin settings with two keys", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
      });
    });

    it("returns defaults for missing rows", () => {
      const adminSettings = rowsToAdminSettings([]);

      expect(adminSettings).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@aubergeduvieuxpont.ca",
      });
    });
  });

  describe("Invariants", () => {
    it("INV-two-key: public endpoint returns exactly two keys", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(rows);
      const publicSettings = toPublicSettings(adminSettings);

      const publicKeys = Object.keys(publicSettings);
      expect(publicKeys.sort()).toEqual(["contactEmail", "nightlyPrice"]);
      expect(publicKeys.length).toBe(2);
    });

    it("INV-one-row-per-key: rowsToAdminSettings is idempotent", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
      ];

      const result1 = rowsToAdminSettings(rows);
      const result2 = rowsToAdminSettings(rows);

      expect(result1).toEqual(result2);
    });
  });
});
