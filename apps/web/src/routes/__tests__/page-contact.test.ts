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
