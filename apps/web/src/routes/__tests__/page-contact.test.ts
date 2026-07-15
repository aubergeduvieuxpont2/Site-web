import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("page-contact", () => {
  describe("no chambre prefill", () => {
    it("placeholder does not contain chambre text", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).toContain("placeholder=");
      expect(content).not.toContain("chambre souhaitée");
      expect(content).toMatch(/placeholder="[^"]*Demandes spéciales[^"]*"/);
    });

    it("has no ?chambre= query param handling", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      // Should not have chambreParam or seeded state for room selection
      expect(content).not.toContain("chambreParam");
      expect(content).not.toContain("?chambre=");
    });
  });

  describe("contact email from settings", () => {
    it("renders contact email from settings store", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).toContain("settings.contactEmail");
      expect(content).toContain("DEFAULTS.contactEmail");
    });

    it("uses no hardcoded hotmail address", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).not.toContain("hotmail");
    });
  });

  describe("form structure", () => {
    it("has required form inputs with testids", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      const testids = [
        "input-name",
        "input-email",
        "input-checkin",
        "input-checkout",
        "input-guests",
        "input-message",
      ];

      testids.forEach((testid) => {
        expect(content).toContain(`data-testid="${testid}"`);
      });
    });

    it("renders contact form with page-contact testid", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).toContain('data-testid="page-contact"');
      expect(content).toContain('data-testid="contact-form"');
    });
  });

  describe("accessibility", () => {
    it("marks name and email inputs as required", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).toContain("aria-required");
    });

    it("has labels for all inputs", () => {
      const pageFile = path.resolve(__dirname, "../contact/+page.svelte");
      const content = fs.readFileSync(pageFile, "utf-8");

      expect(content).toContain("<label");
      expect(content).toContain("for=");
    });
  });
});
