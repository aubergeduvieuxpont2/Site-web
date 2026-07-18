// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Footer from "../Footer.svelte";
import { SITE } from "$lib/content";

function renderFooter() {
  const result = render(Footer);
  return { html: result.body };
}

describe("Footer (SSR)", () => {
  describe("rendering", () => {
    it("renders footer element", () => {
      const { html } = renderFooter();
      expect(html).toMatch(/<footer/);
    });

    it("renders semantic footer landmark with aria-label", () => {
      const { html } = renderFooter();
      expect(html).toContain('aria-label="Pied de page"');
    });

    it("has footer data-testid", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer"');
    });
  });

  describe("brand column", () => {
    it("renders footer__brand section with testid", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-brand"');
    });

    it("renders address element with testid", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-address"');
    });

    it("displays the site tagline", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-tagline"');
      expect(html).toContain(SITE.tagline);
    });
  });

  describe("contact information", () => {
    it("displays street address", () => {
      const { html } = renderFooter();
      expect(html).toContain("111, avenue Saint-Michel");
      expect(html).toContain('data-testid="footer-address-street"');
    });

    it("displays city", () => {
      const { html } = renderFooter();
      expect(html).toContain("Saint-Raymond");
      expect(html).toContain('data-testid="footer-address-city"');
    });

    it("phone link has correct tel: href", () => {
      const { html } = renderFooter();
      expect(html).toContain('href="tel:+14186551212"');
      expect(html).toContain('data-testid="footer-phone"');
    });

    it("phone link displays formatted phone number", () => {
      const { html } = renderFooter();
      expect(html).toContain(">418 655-1212<");
    });
  });

  describe("footer navigation", () => {
    it("renders footer__nav section", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-nav"');
    });

    it("has avis link with correct href", () => {
      const { html } = renderFooter();
      expect(html).toContain('href="/avis"');
      expect(html).toContain('data-testid="footer-link-avis"');
    });

    it("avis link has correct text", () => {
      const { html } = renderFooter();
      expect(html).toContain("Avis des clients");
    });

    it("has politiques link with correct href", () => {
      const { html } = renderFooter();
      expect(html).toContain('href="/politiques"');
      expect(html).toContain('data-testid="footer-link-politiques"');
    });

    it("has confidentialite link with correct href", () => {
      const { html } = renderFooter();
      expect(html).toContain('href="/confidentialite"');
      expect(html).toContain('data-testid="footer-link-confidentialite"');
    });

    it("politiques link has correct text", () => {
      const { html } = renderFooter();
      expect(html).toContain("Politiques de l'établissement");
    });

    it("confidentialite link has correct text", () => {
      const { html } = renderFooter();
      expect(html).toContain("Politique de confidentialité");
    });
  });

  describe("copyright section", () => {
    it("renders footer__copy section", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-copy"');
    });

    it("includes copyright symbol", () => {
      const { html } = renderFooter();
      expect(html).toContain("©");
    });

    it("includes current year in copyright", () => {
      const { html } = renderFooter();
      const currentYear = new Date().getFullYear();
      expect(html).toContain(String(currentYear));
    });

    it("includes site name in copyright", () => {
      const { html } = renderFooter();
      expect(html).toContain("L'Auberge du Vieux Pont");
    });

    it("includes rights reserved text", () => {
      const { html } = renderFooter();
      expect(html).toContain("Tous droits réservés");
    });

    it("renders CITQ number with correct testid", () => {
      const { html } = renderFooter();
      expect(html).toContain('data-testid="footer-citq"');
      expect(html).toContain("CITQ #304542");
    });
  });

  describe("data structure integrity", () => {
    it("has all required data-testid attributes", () => {
      const { html } = renderFooter();
      const testids = [
        "footer",
        "footer-brand",
        "footer-address",
        "footer-address-street",
        "footer-address-city",
        "footer-phone",
        "footer-nav",
        "footer-link-avis",
        "footer-link-politiques",
        "footer-link-confidentialite",
        "footer-copy",
        "footer-copy-text",
        "footer-citq",
      ];
      testids.forEach((testid) => {
        expect(html).toContain(`data-testid="${testid}"`);
      });
    });
  });
});
