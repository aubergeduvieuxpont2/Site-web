import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const pageFile = path.resolve(__dirname, "../reservation-confirmee/+page.svelte");
const pageTsFile = path.resolve(__dirname, "../reservation-confirmee/+page.ts");
const read = () => fs.readFileSync(pageFile, "utf-8");

const frFile = path.resolve(__dirname, "../../lib/messages/fr.ts");
const enFile = path.resolve(__dirname, "../../lib/messages/en.ts");
const readFr = () => fs.readFileSync(frFile, "utf-8");
const readEn = () => fs.readFileSync(enFile, "utf-8");

describe("page-reservation-confirmee", () => {
  describe("page config", () => {
    it("disables prerender", () => {
      const config = fs.readFileSync(pageTsFile, "utf-8");
      expect(config).toContain("prerender = false");
    });
  });

  describe("success copy", () => {
    it("renders the page with data-testid reservation-confirmee", () => {
      expect(read()).toContain('data-testid="reservation-confirmee"');
    });

    it("reads session_id from the URL query string", () => {
      expect(read()).toContain("session_id");
      expect(read()).toContain("searchParams.get");
    });

    it("shows the session reference when sessionId is present", () => {
      const content = read();
      expect(content).toContain("confirmation.sessionLabel");
      expect(content).toContain("{#if sessionId}");
    });

    it("uses the t() helper from i18n for all copy", () => {
      const content = read();
      expect(content).toContain("from \"$lib/i18n.svelte\"");
      expect(content).toMatch(/t\('confirmation\./);
    });

    it("uses the page store from $app/stores to read URL params", () => {
      expect(read()).toContain('from "$app/stores"');
      expect(read()).toContain("$page");
    });

    it("has a Button linking back to the home page", () => {
      expect(read()).toContain('href="/"');
      expect(read()).toContain("confirmation.backHome");
    });

    it("includes a Seo component", () => {
      expect(read()).toContain("import Seo from");
      expect(read()).toContain("<Seo");
    });
  });

  describe("i18n key parity", () => {
    it("fr dictionary has the confirmation namespace", () => {
      expect(readFr()).toContain("confirmation:");
    });

    it("en dictionary has the confirmation namespace", () => {
      expect(readEn()).toContain("confirmation:");
    });

    it("fr dictionary has confirmation.title", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("title:");
    });

    it("en dictionary has confirmation.title", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("title:");
    });

    it("fr dictionary has confirmation.body", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("body:");
    });

    it("en dictionary has confirmation.body", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("body:");
    });

    it("fr dictionary has confirmation.sessionLabel with percent interpolation", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("sessionLabel:");
      expect(nsBlock).toContain("%session_id%");
    });

    it("en dictionary has confirmation.sessionLabel with percent interpolation", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("sessionLabel:");
      expect(nsBlock).toContain("%session_id%");
    });

    it("fr dictionary has confirmation.backHome", () => {
      const frContent = readFr();
      const nsStart = frContent.indexOf("confirmation:");
      const nsEnd = frContent.indexOf("};", nsStart);
      const nsBlock = frContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("backHome:");
    });

    it("en dictionary has confirmation.backHome", () => {
      const enContent = readEn();
      const nsStart = enContent.indexOf("confirmation:");
      const nsEnd = enContent.indexOf("};", nsStart);
      const nsBlock = enContent.slice(nsStart, nsEnd);
      expect(nsBlock).toContain("backHome:");
    });

    it("fr dictionary has the correct contact.payment keys", () => {
      const frContent = readFr();
      expect(frContent).toContain("payment:");
      const paymentStart = frContent.indexOf("payment:");
      const paymentBlock = frContent.slice(paymentStart, paymentStart + 700);
      expect(paymentBlock).toContain("heading:");
      expect(paymentBlock).toContain("holdMessage:");
      expect(paymentBlock).toContain("countdownLabel:");
      expect(paymentBlock).toContain("expiredTitle:");
      expect(paymentBlock).toContain("expiredBody:");
      expect(paymentBlock).toContain("backToForm:");
      expect(paymentBlock).toContain("unavailable:");
    });

    it("en dictionary has the correct contact.payment keys", () => {
      const enContent = readEn();
      expect(enContent).toContain("payment:");
      const paymentStart = enContent.indexOf("payment:");
      const paymentBlock = enContent.slice(paymentStart, paymentStart + 700);
      expect(paymentBlock).toContain("heading:");
      expect(paymentBlock).toContain("holdMessage:");
      expect(paymentBlock).toContain("countdownLabel:");
      expect(paymentBlock).toContain("expiredTitle:");
      expect(paymentBlock).toContain("expiredBody:");
      expect(paymentBlock).toContain("backToForm:");
      expect(paymentBlock).toContain("unavailable:");
    });

    it("fr payment.countdownLabel uses percent interpolation for minutes and seconds", () => {
      expect(readFr()).toContain("%minutes%");
      expect(readFr()).toContain("%seconds%");
    });

    it("en payment.countdownLabel uses percent interpolation for minutes and seconds", () => {
      expect(readEn()).toContain("%minutes%");
      expect(readEn()).toContain("%seconds%");
    });
  });
});
