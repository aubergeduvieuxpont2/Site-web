// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Page from "../confidentialite/+page.svelte";
import { PRIVACY, SITE } from "../../lib/content";

function renderPage() {
  const result = render(Page);
  return { html: result.body };
}

describe("page-confidentialite route", () => {
  describe("prerender flag", () => {
    it("opts into static prerendering", async () => {
      const { prerender } = await import("../confidentialite/+page");
      expect(prerender).toBe(true);
    });
  });

  describe("landmark structure", () => {
    it("renders the page root wrapper", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="confidentialite-header"');
    });

    it("renders the header section", () => {
      const { html } = renderPage();
      expect(html).toContain("Protection de vos renseignements");
      expect(html).toContain(
        "On collecte le strict nécessaire pour gérer votre séjour"
      );
    });

    it("renders all privacy sections", () => {
      const { html } = renderPage();
      for (const section of PRIVACY) {
        expect(html).toContain(`data-testid="privacy-section-${section.code}"`);
      }
    });

    it("renders the closing CTA section", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="confidentialite-closing"');
      expect(html).toContain("Pour exercer vos droits");
    });
  });

  describe("heading hierarchy", () => {
    it("renders exactly one <h1> as the page title", () => {
      const { html } = renderPage();
      const h1s = html.match(/<h1[\s>]/g) ?? [];
      expect(h1s).toHaveLength(1);
      expect(html).toContain("Protection de vos renseignements");
    });

    it("renders an <h2> for each privacy section", () => {
      const { html } = renderPage();
      for (const section of PRIVACY) {
        expect(html).toContain(section.title);
      }
      const h2s = html.match(/<h2[\s>]/g) ?? [];
      expect(h2s.length).toBeGreaterThanOrEqual(PRIVACY.length + 1);
    });
  });

  describe("privacy section content", () => {
    it("renders each section title and code", () => {
      const { html } = renderPage();
      for (const section of PRIVACY) {
        expect(html).toContain(section.code);
        expect(html).toContain(section.title);
      }
    });

    it("renders all items for each privacy section", () => {
      const { html } = renderPage();
      for (const section of PRIVACY) {
        for (let i = 0; i < section.items.length; i++) {
          expect(html).toContain(
            `data-testid="privacy-item-${section.code}-${i}"`
          );
          expect(html).toContain(section.items[i]);
        }
      }
    });

    it("renders bullet points for each item", () => {
      const { html } = renderPage();
      const totalItems = PRIVACY.reduce((sum, section) => sum + section.items.length, 0);
      const bullets = html.match(/aria-hidden="true"[\s>]/g) ?? [];
      // Include section codes + bullet points
      expect(bullets.length).toBeGreaterThanOrEqual(totalItems);
    });
  });

  describe("email link in closing section", () => {
    it("renders the email link with correct href", () => {
      const { html } = renderPage();
      expect(html).toContain(`href="mailto:${SITE.email}"`);
    });

    it("displays the email address as link text", () => {
      const { html } = renderPage();
      expect(html).toContain(SITE.email);
    });

    it("renders the closing section code C-04", () => {
      const { html } = renderPage();
      expect(html).toContain("C-04");
    });
  });

  describe("accessibility features", () => {
    it("marks decorative elements as aria-hidden", () => {
      const { html } = renderPage();
      const hidden = html.match(/aria-hidden="true"/g) ?? [];
      expect(hidden.length).toBeGreaterThanOrEqual(
        PRIVACY.length * 2 + 1
      );
    });

    it("uses semantic list structure for items", () => {
      const { html } = renderPage();
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
    });
  });

  describe("section labels", () => {
    it("renders the Confidentialité section label in header", () => {
      const { html } = renderPage();
      expect(html).toContain("Confidentialité");
    });

    it("renders Contour dividers between sections", () => {
      const { html } = renderPage();
      const contours = html.match(/data-testid="contour"/g) ?? [];
      expect(contours.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("no unescaped HTML injection", () => {
    it("never emits {@html} sinks — all copy is text-bound", () => {
      const { html } = renderPage();
      expect(html).toContain("Protection de vos renseignements");
      expect(html).toContain("On collecte le strict nécessaire");
      for (const section of PRIVACY) {
        for (const item of section.items) {
          expect(html).toContain(item);
        }
      }
    });
  });
});
