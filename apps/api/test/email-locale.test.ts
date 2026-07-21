import { describe, it, expect, vi } from "vitest";
import { resolveLocale } from "../src/emailLocale";
import { renderEmail } from "../src/emails/render";
import { SAMPLES } from "../src/emails/templates";

// resolveLocale accepts an sql tagged-template function and a selector that is
// either a numeric user id or an email address string. It returns the stored
// locale when the value is valid, otherwise falls back to the string fr.

describe("resolveLocale (OP-Mail.resolveLocale)", () => {
  it("returns en when the user record carries locale en (lookup by numeric id)", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "en" }]);
    const result = await resolveLocale(sql as any, 42);
    expect(result).toBe("en");
  });

  it("returns fr when the user record carries locale fr (lookup by numeric id)", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "fr" }]);
    const result = await resolveLocale(sql as any, 7);
    expect(result).toBe("fr");
  });

  it("returns en when the user record carries locale en (lookup by email string)", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "en" }]);
    const result = await resolveLocale(sql as any, "worker@example.com");
    expect(result).toBe("en");
  });

  it("returns fr when the user record carries locale fr (lookup by email string)", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "fr" }]);
    const result = await resolveLocale(sql as any, "ouvrier@example.com");
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when no user row is found for a numeric id", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const result = await resolveLocale(sql as any, 999);
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when no user row is found for an email string", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const result = await resolveLocale(sql as any, "unknown@example.com");
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when the stored locale is an unrecognized string", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "de" }]);
    const result = await resolveLocale(sql as any, 5);
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when the stored locale is an empty string", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "" }]);
    const result = await resolveLocale(sql as any, 5);
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when the sql call rejects", async () => {
    const sql = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    const result = await resolveLocale(sql as any, 1);
    expect(result).toBe("fr");
  });

  it("returns fr as a safe fallback when the stored locale field is null", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: null }]);
    const result = await resolveLocale(sql as any, 3);
    expect(result).toBe("fr");
  });

  it("the return value is always one of the strings fr or en (INV-locale-valid)", async () => {
    const cases = [
      [{ locale: "en" }],
      [{ locale: "fr" }],
      [],
      [{ locale: "xx" }],
      [{ locale: null }],
    ];
    for (const rows of cases) {
      const sql = vi.fn().mockResolvedValue(rows);
      const result = await resolveLocale(sql as any, 1);
      expect(["fr", "en"]).toContain(result);
    }
  });
});

// ── end-to-end locale selection for email templates ───────────────────────────

describe("email locale selection", () => {
  it("an en recipient resolves to locale en, which selects the en email template", async () => {
    // The user stored their preferred locale as en.
    const sql = vi.fn().mockResolvedValue([{ locale: "en" }]);
    const recipientLocale = await resolveLocale(sql as any, 42);

    expect(recipientLocale).toBe("en");

    // Rendering with that resolved locale produces English-language email content.
    const sample = SAMPLES["welcome"] as Record<string, unknown>;
    const rendered = renderEmail("welcome", recipientLocale, sample);

    // The rendered html must declare the en language attribute, confirming the
    // en template variant was selected rather than the default fr.
    expect(rendered.html).toContain('lang="en"');
  });

  it("a fr recipient resolves to locale fr, which selects the fr email template", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "fr" }]);
    const recipientLocale = await resolveLocale(sql as any, 7);

    expect(recipientLocale).toBe("fr");

    const sample = SAMPLES["welcome"] as Record<string, unknown>;
    const rendered = renderEmail("welcome", recipientLocale, sample);

    expect(rendered.html).toContain('lang="fr"');
  });

  it("an unknown recipient falls back to fr, which selects the fr email template", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const recipientLocale = await resolveLocale(sql as any, 9999);

    expect(recipientLocale).toBe("fr");

    const sample = SAMPLES["welcome"] as Record<string, unknown>;
    const rendered = renderEmail("welcome", recipientLocale, sample);

    expect(rendered.html).toContain('lang="fr"');
  });

  it("reservation-confirmation email renders English tax labels for an en recipient", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "en" }]);
    const recipientLocale = await resolveLocale(sql as any, 10);

    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const rendered = renderEmail("reservation-confirmation", recipientLocale, sample);

    expect(rendered.html).toContain("GST");
    expect(rendered.html).toContain("QST");
    expect(rendered.html).toContain("Lodging tax");
  });

  it("reservation-confirmation email renders French tax labels for a fr recipient", async () => {
    const sql = vi.fn().mockResolvedValue([{ locale: "fr" }]);
    const recipientLocale = await resolveLocale(sql as any, 11);

    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const rendered = renderEmail("reservation-confirmation", recipientLocale, sample);

    expect(rendered.html).toContain("TPS");
    expect(rendered.html).toContain("TVQ");
    expect(rendered.html).toContain("hébergement");
  });
});
