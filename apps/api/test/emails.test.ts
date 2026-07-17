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

  // Regression: Cloudflare Workers' isolate forbids runtime code generation
  // ("Code generation from strings disallowed"). Handlebars.compile() uses
  // `new Function`, so the previous compile-at-render implementation crashed in
  // production. Trap the Function constructor to simulate that ban in Node: the
  // precompiled render path must produce a full email without any codegen.
  it("renders without runtime code generation (Workers-safe: no new Function/eval)", () => {
    const OriginalFunction = globalThis.Function;
    function Trap(): never {
      throw new Error("Code generation from strings disallowed for this context");
    }
    Trap.prototype = OriginalFunction.prototype;
    globalThis.Function = Trap as unknown as FunctionConstructor;
    try {
      // The old Handlebars.compile() path threw here (new Function). The
      // precompiled path renders a full email using only pre-baked functions.
      // (The trap also disables Intl, so we assert codegen-independent output —
      // Intl-formatted values are covered by the other tests.)
      const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
      const result = renderEmail("reservation-confirmation", "fr", sample);
      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html.length).toBeGreaterThan(500);
      expect(result.subject).toContain("RES-2026-0042");
    } finally {
      globalThis.Function = OriginalFunction;
    }
  });

  // Tax transparency: the reservation confirmation must show the full compounding
  // tax cascade (hébergement → TPS → TVQ) and a tax-inclusive total, not a bare
  // pre-tax amount labelled "total".
  it("reservation-confirmation FR shows the tax cascade and a taxes-included total", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "fr", sample);
    expect(result.html).toContain("Sous-total");
    expect(result.html).toContain("Taxe d'hébergement (3.5%)");
    expect(result.html).toContain("TPS (5%)");
    expect(result.html).toContain("TVQ (9.975%)");
    expect(result.html).toContain("Total (taxes incluses)");
    expect(result.html).toContain("425,47"); // tax-inclusive total (FR uses NBSP before $)
  });

  it("reservation-confirmation EN shows the tax cascade and a taxes-included total", () => {
    const sample = SAMPLES["reservation-confirmation"] as Record<string, unknown>;
    const result = renderEmail("reservation-confirmation", "en", sample);
    expect(result.html).toContain("Subtotal");
    expect(result.html).toContain("Lodging tax (3.5%)");
    expect(result.html).toContain("GST (5%)");
    expect(result.html).toContain("QST (9.975%)");
    expect(result.html).toContain("Total (taxes included)");
    expect(result.html).toContain("$425.47");
  });

  it("reservation-confirmation requires the tax fields", () => {
    expect(() => {
      renderEmail("reservation-confirmation", "fr", {
        confirmationCode: "RES-001",
        name: "Test",
        checkIn: "2026-08-14",
        checkOut: "2026-08-16",
        guests: 1,
        roomLabel: "Chambre",
        nightlyPrice: 89,
        nights: 2,
      });
    }).toThrow("Missing required field: subtotal");
  });

  // Mobile-first: the shared shell must be fluid (max-width, not a fixed 600px
  // width attribute) so emails never force horizontal scrolling on phones.
  it("renders a fluid, mobile-safe layout (no fixed 600px width)", () => {
    const sample = SAMPLES["welcome"] as Record<string, unknown>;
    const result = renderEmail("welcome", "fr", sample);
    expect(result.html).toContain("max-width: 600px");
    expect(result.html).toContain("@media only screen and (max-width: 600px)");
    expect(result.html).not.toContain('width="600"');
  });

  it("sets the html lang attribute from the locale", () => {
    const sample = SAMPLES["welcome"] as Record<string, unknown>;
    expect(renderEmail("welcome", "fr", sample).html).toContain('<html lang="fr">');
    expect(renderEmail("welcome", "en", sample).html).toContain('<html lang="en">');
  });
});
