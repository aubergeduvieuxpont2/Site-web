// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import ImagePanel from "../ImagePanel.svelte";

function renderSSR(props: {
  imgKey: string;
  picsumSeed: string | number;
  alt: string;
  aspectRatio?: string;
  caption?: string;
}) {
  const result = render(ImagePanel, { props });
  const html = result.body;
  // Parse via regex since we're in node environment (no DOM)
  return { html };
}

describe("ImagePanel (SSR)", () => {
  describe("DOM structure", () => {
    it("renders a figure element", () => {
      const { html } = renderSSR({ imgKey: "chambre-1.jpg", picsumSeed: 42, alt: "Chambre 1" });
      expect(html).toMatch(/<figure/);
    });

    it("renders data-testid='image-panel' on figure", () => {
      const { html } = renderSSR({ imgKey: "chambre-1.jpg", picsumSeed: 42, alt: "Chambre 1" });
      expect(html).toContain('data-testid="image-panel"');
    });

    it("renders data-testid='image-panel-img' on img", () => {
      const { html } = renderSSR({ imgKey: "chambre-1.jpg", picsumSeed: 42, alt: "Chambre 1" });
      expect(html).toContain('data-testid="image-panel-img"');
    });

    it("renders data-testid='image-panel-caption' on figcaption", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 1, alt: "Test" });
      expect(html).toContain('data-testid="image-panel-caption"');
    });
  });

  describe("aspect ratio", () => {
    it("applies default aspect ratio 4/3 via inline style", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 1, alt: "Test" });
      expect(html).toContain("--aspect: 4/3");
    });

    it("applies custom aspectRatio via inline style", () => {
      const { html } = renderSSR({
        imgKey: "test.jpg",
        picsumSeed: 1,
        alt: "Test",
        aspectRatio: "16/9",
      });
      expect(html).toContain("--aspect: 16/9");
    });
  });

  describe("image src and attributes", () => {
    it("sets src to /img/<imgKey>", () => {
      const { html } = renderSSR({ imgKey: "chambre-lac.jpg", picsumSeed: 10, alt: "Chambre lac" });
      expect(html).toContain('src="/img/chambre-lac.jpg"');
    });

    it("sets alt attribute", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 1, alt: "Vue sur la rivière" });
      expect(html).toContain('alt="Vue sur la rivière"');
    });

    it("sets data-picsum-src with numeric seed", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 42, alt: "Test" });
      expect(html).toContain("https://picsum.photos/seed/42/1200/800");
    });

    it("sets data-picsum-src with string seed", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: "valley", alt: "Test" });
      expect(html).toContain("https://picsum.photos/seed/valley/1200/800");
    });

    it("renders loading=lazy", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 1, alt: "Test" });
      expect(html).toContain('loading="lazy"');
    });
  });

  describe("caption", () => {
    it("adds hidden attribute when caption is absent", () => {
      const { html } = renderSSR({ imgKey: "test.jpg", picsumSeed: 1, alt: "Test" });
      expect(html).toMatch(/image-panel-caption[^>]*hidden/);
    });

    it("omits hidden attribute when caption is provided", () => {
      const { html } = renderSSR({
        imgKey: "test.jpg",
        picsumSeed: 1,
        alt: "Test",
        caption: "Vue rivière",
      });
      const captionMatch = html.match(/data-testid="image-panel-caption"[^>]*/);
      expect(captionMatch?.[0]).not.toContain("hidden");
    });

    it("renders caption as escaped text (XSS-safe)", () => {
      const xss = '<script>alert("xss")</script>';
      const { html } = renderSSR({
        imgKey: "test.jpg",
        picsumSeed: 1,
        alt: "Test",
        caption: xss,
      });
      // Svelte escapes < to &lt; in text nodes — script tag is never parsed as a tag
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script>");
    });

    it("renders correct caption text", () => {
      const { html } = renderSSR({
        imgKey: "test.jpg",
        picsumSeed: 1,
        alt: "Test",
        caption: "Le Pont Tessier",
      });
      expect(html).toContain("Le Pont Tessier");
    });
  });
});
