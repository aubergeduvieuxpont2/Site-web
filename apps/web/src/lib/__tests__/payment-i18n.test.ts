import { describe, it, expect } from "vitest";
import { fr } from "../messages/fr";
import { en } from "../messages/en";

const CONTACT_PAYMENT_KEYS = [
  "heading",
  "holdMessage",
  "countdownLabel",
  "expiredTitle",
  "expiredBody",
  "backToForm",
  "unavailable",
] as const;

const CONFIRMATION_KEYS = ["title", "body", "sessionLabel", "backHome"] as const;

describe("payment i18n keys (TASK-i18n)", () => {
  describe("contact.payment keys present in fr dictionary", () => {
    for (const key of CONTACT_PAYMENT_KEYS) {
      it(`fr.contact.payment.${key} is a non-empty string`, () => {
        const value = fr.contact.payment[key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    }
  });

  describe("contact.payment keys present in en dictionary", () => {
    for (const key of CONTACT_PAYMENT_KEYS) {
      it(`en.contact.payment.${key} is a non-empty string`, () => {
        const value = en.contact.payment[key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    }
  });

  describe("confirmation keys present in fr dictionary", () => {
    for (const key of CONFIRMATION_KEYS) {
      it(`fr.confirmation.${key} is a non-empty string`, () => {
        const value = fr.confirmation[key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    }
  });

  describe("confirmation keys present in en dictionary", () => {
    for (const key of CONFIRMATION_KEYS) {
      it(`en.confirmation.${key} is a non-empty string`, () => {
        const value = en.confirmation[key];
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    }
  });

  describe("percent-delimited interpolation placeholders", () => {
    it("fr countdownLabel contains %minutes% and %seconds%", () => {
      expect(fr.contact.payment.countdownLabel).toContain("%minutes%");
      expect(fr.contact.payment.countdownLabel).toContain("%seconds%");
    });

    it("en countdownLabel contains %minutes% and %seconds%", () => {
      expect(en.contact.payment.countdownLabel).toContain("%minutes%");
      expect(en.contact.payment.countdownLabel).toContain("%seconds%");
    });

    it("fr sessionLabel contains %session_id%", () => {
      expect(fr.confirmation.sessionLabel).toContain("%session_id%");
    });

    it("en sessionLabel contains %session_id%", () => {
      expect(en.confirmation.sessionLabel).toContain("%session_id%");
    });
  });

  describe("key parity between fr and en for new namespaces", () => {
    it("contact.payment has identical keys in fr and en", () => {
      const frPaymentKeys = Object.keys(fr.contact.payment).sort();
      const enPaymentKeys = Object.keys(en.contact.payment).sort();
      expect(frPaymentKeys).toEqual(enPaymentKeys);
    });

    it("confirmation has identical keys in fr and en", () => {
      const frKeys = Object.keys(fr.confirmation).sort();
      const enKeys = Object.keys(en.confirmation).sort();
      expect(frKeys).toEqual(enKeys);
    });
  });
});
