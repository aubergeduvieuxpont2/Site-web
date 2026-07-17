import { describe, it, expect } from "vitest";
import {
  SettingsUpdateSchema,
  PUBLIC_SETTING_KEYS,
  rowsToAdminSettings,
  toPublicSettings,
  withPublicRoomCount,
  SETTINGS_DEFAULTS,
} from "../src/settings";

// Canonical camelCase settings object used across the tests (6-key contract:
// nightlyPrice, contactEmail, contactPhone, tps, tvq, accommodationTax).
const DEFAULT_TAXES = { tps: 5, tvq: 9.975, accommodationTax: 3.5 };
const CONTACT_PHONE = "418 655-1212";
const CONTACT = { contactPhone: CONTACT_PHONE };
const SETTINGS_KEYS_SORTED = [
  "accommodationTax",
  "contactEmail",
  "contactPhone",
  "nightlyPrice",
  "tps",
  "tvq",
];

describe("Settings", () => {
  describe("SettingsUpdateSchema", () => {
    it("accepts a valid payload", () => {
      const valid = {
        nightlyPrice: 99,
        contactEmail: "test@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
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
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects zero price", () => {
      const invalid = {
        nightlyPrice: 0,
        contactEmail: "test@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const invalid = {
        nightlyPrice: 89,
        contactEmail: "not-an-email",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects payload missing nightlyPrice", () => {
      const invalid = {
        contactEmail: "admin@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects payload missing contactPhone", () => {
      const invalid = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects an empty contactPhone", () => {
      const invalid = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        contactPhone: "   ",
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("trims whitespace from contactPhone", () => {
      const payload = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        contactPhone: "  581 555-0199  ",
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactPhone).toBe("581 555-0199");
      }
    });

    it("rejects payload missing tax rates", () => {
      const invalid = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        ...CONTACT,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects a negative tax rate", () => {
      const invalid = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        tvq: -1,
      };
      const result = SettingsUpdateSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts a zero tax rate", () => {
      const valid = {
        nightlyPrice: 99,
        contactEmail: "admin@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        accommodationTax: 0,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("coerces numeric strings to numbers", () => {
      const stringPayload = {
        nightlyPrice: "99",
        contactEmail: "admin@example.com",
        contactPhone: CONTACT_PHONE,
        tps: "5",
        tvq: "9.975",
        accommodationTax: "3.5",
      };
      const result = SettingsUpdateSchema.safeParse(stringPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nightlyPrice).toBe(99);
        expect(result.data.tvq).toBe(9.975);
      }
    });

    it("trims whitespace from email", () => {
      const payload = {
        nightlyPrice: 99,
        contactEmail: "  admin@example.com  ",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactEmail).toBe("admin@example.com");
      }
    });
  });

  describe("PUBLIC_SETTING_KEYS", () => {
    it("contains price, email, phone and the three tax rates, never room counts", () => {
      expect(PUBLIC_SETTING_KEYS).toContain("nightly_price");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_email");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_phone");
      expect(PUBLIC_SETTING_KEYS).toContain("tps");
      expect(PUBLIC_SETTING_KEYS).toContain("tvq");
      expect(PUBLIC_SETTING_KEYS).toContain("accommodation_tax");
      expect(PUBLIC_SETTING_KEYS).not.toContain("marketing_room_count");
      expect(PUBLIC_SETTING_KEYS).not.toContain("assignable_room_count");
    });
  });

  describe("rowsToAdminSettings", () => {
    it("coerces numeric keys from strings", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
        { key: "contact_phone", value: CONTACT_PHONE },
        { key: "tps", value: "5" },
        { key: "tvq", value: "9.975" },
        { key: "accommodation_tax", value: "3.5" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      });
    });

    it("fills missing keys from defaults", () => {
      const rows = [{ key: "nightly_price", value: "100" }];
      const result = rowsToAdminSettings(rows);
      expect(result.nightlyPrice).toBe(100);
      expect(result.contactEmail).toBe("info@aubergeduvieuxpont.ca");
      expect(result.contactPhone).toBe(CONTACT_PHONE);
      expect(result.tps).toBe(5);
      expect(result.tvq).toBe(9.975);
      expect(result.accommodationTax).toBe(3.5);
    });

    it("handles empty rows array with all defaults", () => {
      const result = rowsToAdminSettings([]);
      expect(result).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@aubergeduvieuxpont.ca",
        ...CONTACT,
        ...DEFAULT_TAXES,
      });
    });
  });

  describe("toPublicSettings", () => {
    it("returns price, email, phone and tax rates", () => {
      const admin = {
        nightlyPrice: 89,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const result = toPublicSettings(admin);
      expect(result).toEqual(admin);
    });

    it("public and admin settings expose the same six keys", () => {
      const admin = {
        nightlyPrice: 99,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      };
      const pub = toPublicSettings(admin);
      expect(Object.keys(pub).sort()).toEqual(SETTINGS_KEYS_SORTED);
    });
  });

  describe("HTTP Endpoints - GET /api/settings (public)", () => {
    it("returns public settings from database", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
        { key: "contact_phone", value: CONTACT_PHONE },
        { key: "tps", value: "5" },
        { key: "tvq", value: "9.975" },
        { key: "accommodation_tax", value: "3.5" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);
      const publicSettings = toPublicSettings(adminSettings);

      expect(publicSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
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

      expect(Object.keys(publicSettings).sort()).toEqual(SETTINGS_KEYS_SORTED);
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
        contactPhone: SETTINGS_DEFAULTS.contact_phone,
        tps: SETTINGS_DEFAULTS.tps,
        tvq: SETTINGS_DEFAULTS.tvq,
        accommodationTax: SETTINGS_DEFAULTS.accommodation_tax,
      });
    });
  });

  describe("withPublicRoomCount", () => {
    const base = {
      nightlyPrice: 89,
      contactEmail: "info@example.com",
      ...CONTACT,
      ...DEFAULT_TAXES,
    };

    it("includes publicRoomCount when the count succeeds", () => {
      // data-test="api-settings-public-room-count"
      const result = withPublicRoomCount(base, 3);
      expect(result).toEqual({ ...base, publicRoomCount: 3 });
      expect(typeof result.publicRoomCount).toBe("number");
    });

    it("response shape includes all fields on success", () => {
      const result = withPublicRoomCount(base, 12);
      expect(Object.keys(result).sort()).toEqual(
        [...SETTINGS_KEYS_SORTED, "publicRoomCount"].sort(),
      );
    });

    it("preserves a zero count as a real value", () => {
      const result = withPublicRoomCount(base, 0);
      expect(result.publicRoomCount).toBe(0);
      expect(result).toHaveProperty("publicRoomCount");
    });

    it("omits publicRoomCount on simulated query error but stays valid", () => {
      const result = withPublicRoomCount(base, undefined);
      expect(result).not.toHaveProperty("publicRoomCount");
      // Still a valid response with the base fields.
      expect(result).toEqual(base);
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
    it("returns admin settings with the six keys", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toEqual({
        nightlyPrice: 99,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
      });
    });

    it("returns defaults for missing rows", () => {
      const adminSettings = rowsToAdminSettings([]);

      expect(adminSettings).toEqual({
        nightlyPrice: 89,
        contactEmail: "info@aubergeduvieuxpont.ca",
        ...CONTACT,
        ...DEFAULT_TAXES,
      });
    });
  });

  describe("Invariants", () => {
    it("INV-public-keys: public endpoint returns exactly the six settings keys", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(rows);
      const publicSettings = toPublicSettings(adminSettings);

      const publicKeys = Object.keys(publicSettings);
      expect(publicKeys.sort()).toEqual(SETTINGS_KEYS_SORTED);
      expect(publicKeys.length).toBe(6);
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
