import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
const read = () => fs.readFileSync(pageFile, "utf-8");

describe("page-contact", () => {
  describe("no chambre prefill", () => {
    it("placeholder does not contain chambre text", () => {
      const content = read();
      expect(content).toContain("placeholder=");
      expect(content).not.toContain("chambre souhaitée");
      expect(content).toMatch(/placeholder="[^"]*Demandes spéciales[^"]*"/);
    });

    it("has no ?chambre= query param handling", () => {
      const content = read();
      expect(content).not.toContain("chambreParam");
      expect(content).not.toContain("?chambre=");
    });
  });

  describe("contact email from settings", () => {
    it("renders contact email from settings store", () => {
      const content = read();
      expect(content).toContain("settings.contactEmail");
      expect(content).toContain("DEFAULTS.contactEmail");
    });

    it("uses no hardcoded hotmail address", () => {
      expect(read()).not.toContain("hotmail");
    });
  });

  describe("split-name + rooms-count fields", () => {
    it("replaces the single name field with Prénom + Nom inputs", () => {
      const content = read();
      expect(content).toContain('data-testid="input-first-name"');
      expect(content).toContain('data-testid="input-last-name"');
      // The single combined name input is gone.
      expect(content).not.toContain('data-testid="input-name"');
    });

    it("adds a required Nombre de chambres number input", () => {
      const content = read();
      expect(content).toContain('data-testid="input-rooms"');
      expect(content).toContain("bind:value={form.roomCount}");
      // Number input with a min of 1.
      expect(content).toMatch(/id="field-rooms"[\s\S]*?min="1"/);
    });

    it("keeps the existing date / guests / message inputs", () => {
      const content = read();
      ["input-email", "input-checkin", "input-checkout", "input-guests", "input-message"].forEach(
        (testid) => expect(content).toContain(`data-testid="${testid}"`)
      );
    });
  });

  describe("logged-in prefill", () => {
    it("reads the shared auth store", () => {
      const content = read();
      expect(content).toContain('from "$lib/auth.svelte"');
      expect(content).toContain("auth.user");
    });

    it("hides the identity fields and shows an identity indicator when logged in", () => {
      const content = read();
      expect(content).toContain("loggedIn");
      expect(content).toContain('data-testid="contact-identity"');
      // The identity inputs live in the logged-out branch.
      expect(content).toMatch(/\{#if loggedIn\}[\s\S]*\{:else\}[\s\S]*input-first-name/);
    });
  });

  describe("submit payload contract", () => {
    it("calls createReservation with the new key shape", () => {
      const content = read();
      expect(content).toContain("createReservation");
      ["firstName:", "lastName:", "email:", "checkIn:", "checkOut:", "guests:", "roomCount:"].forEach(
        (key) => expect(content).toContain(key)
      );
    });
  });

  describe("date-order validation", () => {
    it("imports the datesOutOfOrder helper from utils", () => {
      const content = read();
      expect(content).toContain("datesOutOfOrder");
      expect(content).toContain('from "$lib/utils"');
    });

    it("sets checkOut error when the dates are out of order", () => {
      const content = read();
      expect(content).toContain("datesOutOfOrder(form.checkIn, form.checkOut)");
      expect(content).toContain(
        "La date de départ doit être postérieure à la date d'arrivée."
      );
    });

    it("constrains the checkout picker with a min bound to check-in", () => {
      const content = read();
      expect(content).toContain("min={form.checkIn || undefined}");
    });

    it("renders the checkOut field error with alert + aria wiring", () => {
      const content = read();
      expect(content).toContain('data-testid="error-checkout"');
      expect(content).toContain('id="err-checkout"');
      expect(content).toContain(
        'aria-describedby={fieldErrors.checkOut ? "err-checkout" : undefined}'
      );
      expect(content).toMatch(/data-testid="error-checkout"[\s\S]*?role="alert"|role="alert"[\s\S]*?data-testid="error-checkout"/);
    });
  });

  describe("rate line + estimate panel", () => {
    it("imports the nightsBetween helper from utils", () => {
      const content = read();
      expect(content).toContain("nightsBetween");
      expect(content).toContain('from "$lib/utils"');
    });

    it("derives the effective nightly rate from auth then settings", () => {
      const content = read();
      expect(content).toContain(
        "auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice"
      );
    });

    it("flags a custom rate only when it differs from the public price", () => {
      const content = read();
      expect(content).toContain("isCustomRate");
      expect(content).toContain("auth.user?.effectiveNightlyPrice != null");
      expect(content).toContain(
        "auth.user.effectiveNightlyPrice !== settings.nightlyPrice"
      );
    });

    it("renders an always-present rate line with a live region", () => {
      const content = read();
      expect(content).toContain('data-testid="contact-rate-line"');
      expect(content).toMatch(
        /data-testid="contact-rate-line"[\s\S]*?aria-live="polite"/
      );
      expect(content).toContain("formatRate(nightlyRate)");
    });

    it("shows the custom-rate badge only when isCustomRate", () => {
      const content = read();
      expect(content).toContain('data-testid="contact-rate-badge"');
      expect(content).toContain('aria-label="Tarif personnalisé"');
      expect(content).toMatch(
        /\{#if isCustomRate\}[\s\S]*?data-testid="contact-rate-badge"/
      );
    });

    it("renders the estimate panel only when nights and rooms are set", () => {
      const content = read();
      expect(content).toContain("const estimateVisible = $derived(nights >= 1 && rooms >= 1)");
      expect(content).toMatch(
        /\{#if estimateVisible\}[\s\S]*?data-testid="contact-estimate"/
      );
    });

    it("computes the estimate using estimateStay with tax breakdown", () => {
      const content = read();
      expect(content).toContain("estimateStay");
      expect(content).toContain("const estimate = $derived(");
      expect(content).toContain("settings.accommodationTax");
      expect(content).toContain("settings.tps");
      expect(content).toContain("settings.tvq");
      expect(content).toContain("formatRate(estimate.total)");
      expect(content).not.toContain("estimateTotal");
      expect(content).not.toContain("(avant taxes)");
    });

    it("renders five breakdown rows with data-testid attributes", () => {
      const content = read();
      expect(content).toContain('data-testid="estimate-base"');
      expect(content).toContain('data-testid="estimate-hebergement"');
      expect(content).toContain('data-testid="estimate-tps"');
      expect(content).toContain('data-testid="estimate-tvq"');
      expect(content).toContain('data-testid="estimate-total"');
    });

    it("uses dl/dt/dd semantics for the estimate breakdown", () => {
      const content = read();
      expect(content).toContain("<dl ");
      expect(content).toContain("<dt ");
      expect(content).toContain("<dd ");
      expect(content).toContain("Total estimé");
    });

    it("renders percent labels using formatPct for each tax row", () => {
      const content = read();
      expect(content).toContain("formatPct(settings.accommodationTax)");
      expect(content).toContain("formatPct(settings.tps)");
      expect(content).toContain("formatPct(settings.tvq)");
    });

    it("defines formatPct using Intl.NumberFormat with fr-CA locale", () => {
      const content = read();
      expect(content).toContain("function formatPct");
      expect(content).toContain('new Intl.NumberFormat("fr-CA"');
      expect(content).toContain("maximumFractionDigits: 3");
    });

    it("formats currency with fr-CA CAD via Intl.NumberFormat", () => {
      const content = read();
      expect(content).toContain('new Intl.NumberFormat("fr-CA"');
      expect(content).toContain('currency: "CAD"');
    });

    it("does not assign any innerHTML for rate/estimate values", () => {
      expect(read()).not.toContain("innerHTML");
    });

    it("guards rooms against negative or fractional input", () => {
      const content = read();
      expect(content).toContain(
        "const rooms = $derived(Math.max(0, Math.trunc(Number(form.roomCount) || 0)))"
      );
    });
  });

  describe("form structure", () => {
    it("renders contact form with page-contact testid", () => {
      const content = read();
      expect(content).toContain('data-testid="page-contact"');
      expect(content).toContain('data-testid="contact-form"');
    });
  });

  describe("accessibility", () => {
    it("marks identity inputs as required", () => {
      expect(read()).toContain("aria-required");
    });

    it("has labels for all inputs", () => {
      const content = read();
      expect(content).toContain("<label");
      expect(content).toContain("for=");
    });
  });
});
