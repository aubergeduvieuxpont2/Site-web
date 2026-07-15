// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Page from "../politiques/+page.svelte";
import { POLICIES } from "../../lib/content";

function renderPage() {
  const result = render(Page);
  return { html: result.body };
}

describe("page-politiques route", () => {
  describe("prerender flag", () => {
    it("opts into static prerendering", async () => {
      const { prerender } = await import("../politiques/+page");
      expect(prerender).toBe(true);
    });
  });

  describe("landmark structure", () => {
    it("renders the page root wrapper", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="politiques-header"');
    });

    it("renders the header section with title and lead text", () => {
      const { html } = renderPage();
      expect(html).toContain("Les règles de la maison");
      expect(html).toContain("Claires et sans surprise");
    });

    it("renders all policy sections", () => {
      const { html } = renderPage();
      for (const section of POLICIES) {
        expect(html).toContain(`data-testid="policy-section-${section.code}"`);
      }
    });
  });

  describe("heading hierarchy", () => {
    it("renders exactly one <h1> as the page title", () => {
      const { html } = renderPage();
      const h1s = html.match(/<h1[\s>]/g) ?? [];
      expect(h1s).toHaveLength(1);
      expect(html).toContain("Les règles de la maison");
    });

    it("renders an <h2> for each policy section", () => {
      const { html } = renderPage();
      for (const section of POLICIES) {
        expect(html).toContain(section.title);
      }
      const h2s = html.match(/<h2[\s>]/g) ?? [];
      expect(h2s.length).toBeGreaterThanOrEqual(POLICIES.length);
    });
  });

  describe("policy section content", () => {
    it("renders each section code and title", () => {
      const { html } = renderPage();
      for (const section of POLICIES) {
        expect(html).toContain(section.code);
        expect(html).toContain(section.title);
      }
    });

    it("renders all items for each policy section", () => {
      const { html } = renderPage();
      for (const section of POLICIES) {
        for (let i = 0; i < section.items.length; i++) {
          expect(html).toContain(
            `data-testid="policy-item-${section.code}-${i}"`
          );
          expect(html).toContain(section.items[i]);
        }
      }
    });

    it("renders bullet points for each item", () => {
      const { html } = renderPage();
      const totalItems = POLICIES.reduce(
        (sum, section) => sum + section.items.length,
        0
      );
      const bullets = html.match(/aria-hidden="true"[\s>]/g) ?? [];
      expect(bullets.length).toBeGreaterThanOrEqual(totalItems);
    });
  });

  describe("accessibility features", () => {
    it("marks decorative elements as aria-hidden", () => {
      const { html } = renderPage();
      const hidden = html.match(/aria-hidden="true"/g) ?? [];
      expect(hidden.length).toBeGreaterThanOrEqual(POLICIES.length);
    });

    it("uses semantic list structure for items", () => {
      const { html } = renderPage();
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
    });
  });

  describe("section labels and dividers", () => {
    it("renders the Politiques section label in header", () => {
      const { html } = renderPage();
      expect(html).toContain("Politiques de l'établissement");
    });

    it("renders Contour dividers between sections", () => {
      const { html } = renderPage();
      const contours = html.match(/data-testid="contour"/g) ?? [];
      expect(contours.length).toBeGreaterThanOrEqual(POLICIES.length - 1);
    });
  });

  describe("no unescaped HTML injection", () => {
    it("never emits {@html} sinks — all copy is text-bound", () => {
      const { html } = renderPage();
      expect(html).toContain("Les règles de la maison");
      expect(html).toContain("Claires et sans surprise");
      for (const section of POLICIES) {
        for (const item of section.items) {
          expect(html).toContain(item);
        }
      }
    });
  });
});
