import { describe, it, expect } from "vitest";
import { renderEmail } from "../src/emails/render";
import type { TemplateKey } from "../src/emails/templates";
import { SAMPLES } from "../src/emails/templates";

const TEMPLATE_KEYS: TemplateKey[] = [
  "welcome",
  "password-reset",
  "reservation-confirmation",
  "reservation-cancellation",
  "invoice-receipt",
  "review-request",
];

describe("renderEmail", () => {
  describe("returns non-empty subject, html, text for all templates", () => {
    for (const key of TEMPLATE_KEYS) {
      for (const locale of ["fr", "en"] as const) {
        it(`${key} + ${locale}`, () => {
          const sample = SAMPLES[key] as Record<string, unknown>;
          const result = renderEmail(key, locale, sample);

          expect(result.subject).toBeTruthy();
          expect(typeof result.subject).toBe("string");
          expect(result.subject.length).toBeGreaterThan(0);

          expect(result.html).toBeTruthy();
          expect(typeof result.html).toBe("string");
          expect(result.html.length).toBeGreaterThan(0);

          expect(result.text).toBeTruthy();
          expect(typeof result.text).toBe("string");
          expect(result.text.length).toBeGreaterThan(0);
        });
      }
    }
  });

  it("reservation-confirmation subject interpolates confirmationCode", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "fr", sample);
    expect(result.subject).toContain("RES-2026-0042");
  });

  it("reservation-cancellation subject interpolates confirmationCode", () => {
    const sample = SAMPLES["reservation-cancellation"] as Record<string, unknown>;
    const result = renderEmail("reservation-cancellation", "fr", sample);
    expect(result.subject).toContain("RES-2026-0043");
  });

  it("invoice-receipt subject interpolates invoiceNumber", () => {
    const sample = SAMPLES["invoice-receipt"] as Record<string, unknown>;
    const result = renderEmail("invoice-receipt", "fr", sample);
    expect(result.subject).toContain("INV-2026-0001");
  });

  it("money helper formats FR nightly price as '89,00 $'", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "fr", sample);
    // Intl.NumberFormat uses non-breaking space (U+00A0) after the number
    expect(result.html).toContain("89,00 $");
  });

  it("money helper formats EN nightly price as '$89.00'", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "en", sample);
    expect(result.html).toContain("$89.00");
  });

  it("formatDate renders FR check-in as '14 août 2026'", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "fr", sample);
    expect(result.html).toContain("14 août 2026");
  });

  it("formatDate renders EN check-in as 'August 14, 2026'", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "en", sample);
    expect(result.html).toContain("August 14, 2026");
  });

  it("throws Error with field name when required field missing", () => {
    expect(() => {
      renderEmail("reservation-confirmation", "fr", { confirmationCode: "RES-001" });
    }).toThrow("Missing required field: name");
  });

  it("throws Error for unknown template", () => {
    expect(() => {
      renderEmail("unknown" as TemplateKey, "fr", {});
    }).toThrow("Unknown template: unknown");
  });
});
