import { describe, it, expect } from "vitest";
import { RegisterSchema } from "../src/index";

// Base payload satisfying all required RegisterSchema fields except locale.
const base = {
  email: "guest@example.com",
  password: "securepassword123!",
};

describe("RegisterSchema locale field (OP-Register.withLocale)", () => {
  it("accepts a valid payload without locale and defaults the locale to fr", () => {
    const result = RegisterSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  it("accepts locale fr explicitly and preserves it", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "fr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  it("accepts locale en and preserves it", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "en" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("en");
    }
  });

  it("rejects an unrecognized locale string (ERR-BADLOCALE: locale es is not fr or en)", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "es" });
    expect(result.success).toBe(false);
  });

  it("rejects a locale of de (ERR-BADLOCALE: de is not a valid locale)", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "de" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string as locale (ERR-BADLOCALE)", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a numeric locale value (ERR-BADLOCALE)", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: 1 });
    expect(result.success).toBe(false);
  });

  it("rejects null as the locale value (ERR-BADLOCALE)", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: null });
    expect(result.success).toBe(false);
  });

  it("still requires a valid email when locale is provided", () => {
    const result = RegisterSchema.safeParse({ ...base, email: "not-an-email", locale: "en" });
    expect(result.success).toBe(false);
  });

  it("still requires a password meeting the minimum length when locale is provided", () => {
    const result = RegisterSchema.safeParse({ ...base, password: "short", locale: "en" });
    expect(result.success).toBe(false);
  });

  it("locale field is present in the parsed output (INV-locale-valid: locale is always fr or en)", () => {
    const fr = RegisterSchema.safeParse({ ...base, locale: "fr" });
    const en = RegisterSchema.safeParse({ ...base, locale: "en" });
    const def = RegisterSchema.safeParse(base);

    if (fr.success) expect(["fr", "en"]).toContain(fr.data.locale);
    if (en.success) expect(["fr", "en"]).toContain(en.data.locale);
    if (def.success) expect(["fr", "en"]).toContain(def.data.locale);
  });
});
