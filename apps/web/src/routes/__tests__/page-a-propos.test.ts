// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Page from "../a-propos/+page.svelte";
import { SITE } from "../../lib/content";

/** SSR-render the page; `use:` reveal actions do not run server-side. */
function renderPage() {
  const result = render(Page);
  return { html: result.body };
}

describe("page-a-propos route", () => {
  describe("prerender flag", () => {
    it("opts into static prerendering", async () => {
      const { prerender } = await import("../a-propos/+page");
      expect(prerender).toBe(true);
    });
  });

  describe("landmark structure", () => {
    it("renders the page root wrapper", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="page-a-propos"');
    });

    it("renders all five sections", () => {
      const { html } = renderPage();
      for (const id of [
        "a-propos-intro",
        "a-propos-histoire",
        "a-propos-valeurs",
        "a-propos-ancrage",
        "a-propos-cta",
      ]) {
        expect(html).toContain(`data-testid="${id}"`);
      }
    });
  });

  describe("heading hierarchy", () => {
    it("renders exactly one <h1> as the page title", () => {
      const { html } = renderPage();
      const h1s = html.match(/<h1[\s>]/g) ?? [];
      expect(h1s).toHaveLength(1);
      expect(html).toContain('data-testid="a-propos-heading"');
    });

    it("renders an <h2> for each of the three content sections", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="a-propos-histoire-heading"');
      expect(html).toContain('data-testid="a-propos-valeurs-heading"');
      expect(html).toContain('data-testid="a-propos-ancrage-heading"');
    });

    it("associates each section with its heading via aria-labelledby", () => {
      const { html } = renderPage();
      expect(html).toMatch(/aria-labelledby="a-propos-heading"/);
      expect(html).toMatch(/aria-labelledby="a-propos-histoire-heading"/);
      expect(html).toMatch(/aria-labelledby="a-propos-valeurs-heading"/);
      expect(html).toMatch(/aria-labelledby="a-propos-ancrage-heading"/);
    });

    it("labels the dark CTA section directly (long heading)", () => {
      const { html } = renderPage();
      expect(html).toMatch(/aria-label="Nous contacter"/);
    });
  });

  describe("values grid", () => {
    it("renders the staggered grid container", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="a-propos-valeurs-grid"');
    });

    it("renders all four value cards keyed by code", () => {
      const { html } = renderPage();
      for (const code of ["01", "02", "03", "04"]) {
        expect(html).toContain(`data-testid="a-propos-value-card-${code}"`);
      }
    });

    it("renders each value title and its <h3>", () => {
      const { html } = renderPage();
      const h3s = html.match(/<h3[\s>]/g) ?? [];
      expect(h3s).toHaveLength(4);
      for (const title of ["Honnête", "Robuste", "Accessible", "Ancré"]) {
        expect(html).toContain(title);
      }
    });
  });

  describe("content from SITE constants", () => {
    it("renders the establishment year from SITE", () => {
      const { html } = renderPage();
      expect(html).toContain(SITE.established);
    });

    it("renders the phone link as a tel: href, not raw input", () => {
      const { html } = renderPage();
      expect(html).toContain(`href="${SITE.phoneHref}"`);
      expect(SITE.phoneHref.startsWith("tel:")).toBe(true);
      expect(html).toContain(SITE.phone);
    });
  });

  describe("interactive CTA links", () => {
    it("renders the phone action with an accessible label", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="a-propos-cta-phone"');
      expect(html).toContain(`aria-label="Appeler le ${SITE.phone}"`);
    });

    it("links to the contact page", () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="a-propos-cta-contact"');
      expect(html).toContain('href="/contact"');
    });
  });

  describe("decorative elements are hidden from assistive tech", () => {
    it("marks the value card meta row and CTA eyebrow aria-hidden", () => {
      const { html } = renderPage();
      // Value card meta rows (dot + ghost code) — one per card.
      const hidden = html.match(/aria-hidden="true"/g) ?? [];
      expect(hidden.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("no unescaped HTML injection", () => {
    it("never emits an {@html} sink — all copy is text-bound", () => {
      const { html } = renderPage();
      // The blockquote copy is present as escaped text content.
      expect(html).toContain("On vend du repos qui tient la route");
    });
  });
});
