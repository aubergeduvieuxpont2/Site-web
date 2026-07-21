import { describe, it, expect } from "vitest";
import { RegisterSchema, LocaleSchema } from "../src/index";

// ---------------------------------------------------------------------------
// OP-Register.withLocale — locale field on the register schema
// ---------------------------------------------------------------------------

describe("RegisterSchema locale field — OP-Register.withLocale", () => {
  const base = {
    email: "guest@example.com",
    password: "SecurePassword123!",
  };

  // Happy path: explicit fr locale
  it("accepts locale fr and stores it as fr", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "fr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  // Happy path: explicit en locale
  it("accepts locale en and stores it as en", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "en" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("en");
    }
  });

  // Happy path: locale omitted — must default to fr
  it("defaults locale to fr when the field is absent", () => {
    const result = RegisterSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  // ERR-BADLOCALE: invalid locale value rejected
  it("rejects locale de with a validation error matching ERR-BADLOCALE", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "de" });
    expect(result.success).toBe(false);
  });

  it("rejects locale es with a validation error", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "es" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string locale", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a numeric locale value", () => {
    const result = RegisterSchema.safeParse({ ...base, locale: 1 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OP-Locale.update — LocaleSchema used by the PATCH /api/auth/locale endpoint
// ---------------------------------------------------------------------------

describe("LocaleSchema — OP-Locale.update input validation", () => {
  // Happy path
  it("accepts the value fr", () => {
    const result = LocaleSchema.safeParse({ locale: "fr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("fr");
    }
  });

  it("accepts the value en", () => {
    const result = LocaleSchema.safeParse({ locale: "en" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("en");
    }
  });

  // ERR-BADLOCALE: any value that is not fr or en is rejected
  it("rejects the value de, triggering ERR-BADLOCALE", () => {
    const result = LocaleSchema.safeParse({ locale: "de" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = LocaleSchema.safeParse({ locale: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing locale field", () => {
    const result = LocaleSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null as the locale value", () => {
    const result = LocaleSchema.safeParse({ locale: null });
    expect(result.success).toBe(false);
  });

  it("rejects a numeric value such as 1", () => {
    const result = LocaleSchema.safeParse({ locale: 1 });
    expect(result.success).toBe(false);
  });

  // INV-locale-valid: the only two valid values are fr and en
  it("confirms that fr and en are the complete set of accepted values", () => {
    expect(LocaleSchema.safeParse({ locale: "fr" }).success).toBe(true);
    expect(LocaleSchema.safeParse({ locale: "en" }).success).toBe(true);
    for (const bad of ["FR", "EN", "fr ", " en", "french", "english", "both"]) {
      expect(LocaleSchema.safeParse({ locale: bad }).success).toBe(false);
    }
  });
});
