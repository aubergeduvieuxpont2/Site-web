import { describe, it, expect } from "vitest";
import {
  SettingsUpdateSchema,
  PUBLIC_SETTING_KEYS,
  rowsToAdminSettings,
  toPublicSettings,
  withPublicRoomCount,
  SETTINGS_DEFAULTS,
  parseBool,
} from "../src/settings";

// Canonical camelCase settings object used across the tests (8-key public contract:
// nightlyPrice, weeklyPrice, contactEmail, contactPhone, tps, tvq, accommodationTax, reservationsEnabled).
const DEFAULT_TAXES = { tps: 5, tvq: 9.975, accommodationTax: 3.5 };
const CONTACT_PHONE = "418 655-1212";
const CONTACT = { contactPhone: CONTACT_PHONE };
// All four email-toggle fields are required by SettingsUpdateSchema (see C1);
// every "valid payload" fixture below must carry them.
const EMAIL_TOGGLES_ALL_FALSE = {
  emailConfirmationEnabled: false,
  emailPasswordResetEnabled: false,
  emailRoomAssignmentEnabled: false,
  emailWelcomeEnabled: false,
};
// The remaining required settings a valid update must carry beyond the
// price / email / phone / tax fields the individual assertions vary.
const EXTRA_REQUIRED = {
  weeklyPrice: 560,
  assignableRoomCount: 12,
  reservationsEnabled: true,
  ...EMAIL_TOGGLES_ALL_FALSE,
};
const SETTINGS_KEYS_SORTED = [
  "accommodationTax",
  "contactEmail",
  "contactPhone",
  "nightlyPrice",
  "reservationsEnabled",
  "tps",
  "tvq",
  "weeklyPrice",
];

describe("Settings", () => {
  describe("parseBool", () => {
    it("converts 'true' string to boolean true", () => {
      expect(parseBool("true")).toBe(true);
      expect(parseBool("TRUE")).toBe(true);
      expect(parseBool("True")).toBe(true);
    });

    it("converts 'false' string to boolean false", () => {
      expect(parseBool("false")).toBe(false);
      expect(parseBool("FALSE")).toBe(false);
      expect(parseBool("False")).toBe(false);
    });

    it("converts '1' to boolean true", () => {
      expect(parseBool("1")).toBe(true);
    });

    it("converts '0' to boolean false", () => {
      expect(parseBool("0")).toBe(false);
    });

    it("passes through boolean values", () => {
      expect(parseBool(true)).toBe(true);
      expect(parseBool(false)).toBe(false);
    });

    it("throws on invalid string", () => {
      expect(() => parseBool("maybe")).toThrow();
      expect(() => parseBool("yes")).toThrow();
    });

    it("throws on other types", () => {
      expect(() => parseBool(1)).toThrow();
      expect(() => parseBool(null as any)).toThrow();
    });
  });

  describe("SettingsUpdateSchema", () => {
    it("accepts a valid payload with new fields", () => {
      const valid = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "test@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 12,
        reservationsEnabled: true,
        ...EMAIL_TOGGLES_ALL_FALSE,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(valid);
      }
    });

    it("accepts a valid payload", () => {
      const valid = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "test@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 12,
        reservationsEnabled: true,
        ...EMAIL_TOGGLES_ALL_FALSE,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(valid);
      }
    });

    it("accepts assignableRoomCount of 0 (no public rooms; server-derived)", () => {
      const valid = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "test@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 0,
        reservationsEnabled: true,
        ...EMAIL_TOGGLES_ALL_FALSE,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
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
        ...EXTRA_REQUIRED,
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
        ...EXTRA_REQUIRED,
        accommodationTax: 0,
      };
      const result = SettingsUpdateSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("coerces numeric strings to numbers", () => {
      const stringPayload = {
        nightlyPrice: "99",
        weeklyPrice: "560",
        contactEmail: "admin@example.com",
        contactPhone: CONTACT_PHONE,
        tps: "5",
        tvq: "9.975",
        accommodationTax: "3.5",
        assignableRoomCount: "12",
        reservationsEnabled: "true",
        ...EMAIL_TOGGLES_ALL_FALSE,
      };
      const result = SettingsUpdateSchema.safeParse(stringPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nightlyPrice).toBe(99);
        expect(result.data.weeklyPrice).toBe(560);
        expect(result.data.tvq).toBe(9.975);
        expect(result.data.assignableRoomCount).toBe(12);
        expect(result.data.reservationsEnabled).toBe(true);
      }
    });

    it("accepts reservationsEnabled as 'false' string", () => {
      const payload = {
        nightlyPrice: "99",
        weeklyPrice: "560",
        contactEmail: "admin@example.com",
        contactPhone: CONTACT_PHONE,
        tps: "5",
        tvq: "9.975",
        accommodationTax: "3.5",
        assignableRoomCount: "12",
        reservationsEnabled: "false",
        ...EMAIL_TOGGLES_ALL_FALSE,
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reservationsEnabled).toBe(false);
      }
    });

    it("trims whitespace from email", () => {
      const payload = {
        nightlyPrice: 99,
        contactEmail: "  admin@example.com  ",
        ...CONTACT,
        ...DEFAULT_TAXES,
        ...EXTRA_REQUIRED,
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactEmail).toBe("admin@example.com");
      }
    });
  });

  describe("PUBLIC_SETTING_KEYS", () => {
    it("contains price, email, phone, tax rates, weekly_price, and reservations_enabled", () => {
      expect(PUBLIC_SETTING_KEYS).toContain("nightly_price");
      expect(PUBLIC_SETTING_KEYS).toContain("weekly_price");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_email");
      expect(PUBLIC_SETTING_KEYS).toContain("contact_phone");
      expect(PUBLIC_SETTING_KEYS).toContain("tps");
      expect(PUBLIC_SETTING_KEYS).toContain("tvq");
      expect(PUBLIC_SETTING_KEYS).toContain("accommodation_tax");
      expect(PUBLIC_SETTING_KEYS).toContain("reservations_enabled");
      expect(PUBLIC_SETTING_KEYS).not.toContain("marketing_room_count");
      expect(PUBLIC_SETTING_KEYS).not.toContain("assignable_room_count");
    });
  });

  describe("rowsToAdminSettings", () => {
    it("coerces numeric keys from strings including new settings", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "weekly_price", value: "560" },
        { key: "contact_email", value: "info@example.com" },
        { key: "contact_phone", value: CONTACT_PHONE },
        { key: "tps", value: "5" },
        { key: "tvq", value: "9.975" },
        { key: "accommodation_tax", value: "3.5" },
        { key: "assignable_room_count", value: "12" },
        { key: "reservations_enabled", value: "true" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result.nightlyPrice).toBe(89);
      expect(result.weeklyPrice).toBe(560);
      expect(result.assignableRoomCount).toBe(12);
      expect(result.reservationsEnabled).toBe(true);
    });

    it("fills missing keys from defaults", () => {
      const rows = [{ key: "nightly_price", value: "100" }];
      const result = rowsToAdminSettings(rows);
      expect(result.nightlyPrice).toBe(100);
      expect(result.weeklyPrice).toBe(560);
      expect(result.assignableRoomCount).toBe(12);
      expect(result.reservationsEnabled).toBe(true);
      expect(result.contactEmail).toBe("info@aubergeduvieuxpont.ca");
    });

    it("handles empty rows array with all defaults", () => {
      const result = rowsToAdminSettings([]);
      expect(result.nightlyPrice).toBe(89);
      expect(result.weeklyPrice).toBe(560);
      expect(result.assignableRoomCount).toBe(12);
      expect(result.reservationsEnabled).toBe(true);
    });

    it("parses reservations_enabled='false' correctly", () => {
      const rows = [
        { key: "reservations_enabled", value: "false" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result.reservationsEnabled).toBe(false);
    });
  });

  describe("toPublicSettings", () => {
    it("includes weekly price and reservations enabled", () => {
      const admin = {
        nightlyPrice: 89,
        weeklyPrice: 560,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 12,
        reservationsEnabled: true,
      };
      const result = toPublicSettings(admin);
      expect(result.weeklyPrice).toBe(560);
      expect(result.reservationsEnabled).toBe(true);
      expect(result).not.toHaveProperty("assignableRoomCount");
    });

    it("omits assignableRoomCount from public response", () => {
      const admin = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 25,
        reservationsEnabled: false,
      };
      const pub = toPublicSettings(admin);
      expect(pub).not.toHaveProperty("assignableRoomCount");
      expect(pub.reservationsEnabled).toBe(false);
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
        weeklyPrice: 560,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        reservationsEnabled: true,
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
        weeklyPrice: SETTINGS_DEFAULTS.weekly_price,
        contactEmail: SETTINGS_DEFAULTS.contact_email,
        contactPhone: SETTINGS_DEFAULTS.contact_phone,
        tps: SETTINGS_DEFAULTS.tps,
        tvq: SETTINGS_DEFAULTS.tvq,
        accommodationTax: SETTINGS_DEFAULTS.accommodation_tax,
        reservationsEnabled: SETTINGS_DEFAULTS.reservations_enabled,
      });
    });
  });

  describe("withPublicRoomCount", () => {
    const base = {
      nightlyPrice: 89,
      weeklyPrice: 560,
      contactEmail: "info@example.com",
      ...CONTACT,
      ...DEFAULT_TAXES,
      reservationsEnabled: true,
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
    const EMAIL_TOGGLE_DEFAULTS = {
      emailConfirmationEnabled: false,
      emailPasswordResetEnabled: false,
      emailRoomAssignmentEnabled: false,
      emailWelcomeEnabled: false,
    };

    it("returns admin settings with all keys", () => {
      const mockRows = [
        { key: "nightly_price", value: "99" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(mockRows);

      expect(adminSettings).toEqual({
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "info@example.com",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 12,
        reservationsEnabled: true,
        ...EMAIL_TOGGLE_DEFAULTS,
      });
    });

    it("returns defaults for missing rows", () => {
      const adminSettings = rowsToAdminSettings([]);

      expect(adminSettings).toEqual({
        nightlyPrice: 89,
        weeklyPrice: 560,
        contactEmail: "info@aubergeduvieuxpont.ca",
        ...CONTACT,
        ...DEFAULT_TAXES,
        assignableRoomCount: 12,
        reservationsEnabled: true,
        ...EMAIL_TOGGLE_DEFAULTS,
      });
    });

    it("defaults all four email toggles to false when rows are empty", () => {
      const result = rowsToAdminSettings([]);
      expect(result.emailConfirmationEnabled).toBe(false);
      expect(result.emailPasswordResetEnabled).toBe(false);
      expect(result.emailRoomAssignmentEnabled).toBe(false);
      expect(result.emailWelcomeEnabled).toBe(false);
    });

    it("parses email toggle 'true' rows correctly", () => {
      const rows = [
        { key: "email_confirmation_enabled", value: "true" },
        { key: "email_welcome_enabled", value: "true" },
      ];
      const result = rowsToAdminSettings(rows);
      expect(result.emailConfirmationEnabled).toBe(true);
      expect(result.emailWelcomeEnabled).toBe(true);
      expect(result.emailPasswordResetEnabled).toBe(false);
      expect(result.emailRoomAssignmentEnabled).toBe(false);
    });

    it("email toggle keys are absent from toPublicSettings", () => {
      const admin = rowsToAdminSettings([]);
      const pub = toPublicSettings(admin);
      expect(pub).not.toHaveProperty("emailConfirmationEnabled");
      expect(pub).not.toHaveProperty("emailPasswordResetEnabled");
      expect(pub).not.toHaveProperty("emailRoomAssignmentEnabled");
      expect(pub).not.toHaveProperty("emailWelcomeEnabled");
    });

    it("SettingsUpdateSchema accepts boolean email toggle fields", () => {
      const payload = {
        nightlyPrice: 99,
        weeklyPrice: 560,
        contactEmail: "admin@example.com",
        contactPhone: CONTACT_PHONE,
        tps: 5,
        tvq: 9.975,
        accommodationTax: 3.5,
        assignableRoomCount: 12,
        reservationsEnabled: true,
        emailConfirmationEnabled: true,
        emailPasswordResetEnabled: false,
        emailRoomAssignmentEnabled: "true",
        emailWelcomeEnabled: "false",
      };
      const result = SettingsUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.emailConfirmationEnabled).toBe(true);
        expect(result.data.emailPasswordResetEnabled).toBe(false);
        expect(result.data.emailRoomAssignmentEnabled).toBe(true);
        expect(result.data.emailWelcomeEnabled).toBe(false);
      }
    });
  });

  describe("Invariants", () => {
    it("INV-public-keys: public endpoint returns exactly the eight settings keys", () => {
      const rows = [
        { key: "nightly_price", value: "89" },
        { key: "contact_email", value: "info@example.com" },
      ];

      const adminSettings = rowsToAdminSettings(rows);
      const publicSettings = toPublicSettings(adminSettings);

      const publicKeys = Object.keys(publicSettings);
      expect(publicKeys.sort()).toEqual(SETTINGS_KEYS_SORTED);
      expect(publicKeys.length).toBe(8);
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
