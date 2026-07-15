import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Wordmark from "../Wordmark.svelte";

describe("Wordmark", () => {
  describe("rendering", () => {
    it("renders as SVG element", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg?.tagName).toBe("svg");
    });

    it("has correct viewBox", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("viewBox")).toBe("0 0 200 50");
    });
  });

  describe("accessibility", () => {
    it("has role='img'", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("role")).toBe("img");
    });

    it("has aria-label with brand name", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-label")).toBe("Auberge du Vieux Pont");
    });

    it("has data-testid", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("[data-testid='wordmark']");
      expect(svg).toBeTruthy();
    });
  });

  describe("size variants", () => {
    it("renders with default size 'md'", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--md");
    });

    it("renders with size='sm'", () => {
      const { container } = render(Wordmark, { props: { size: "sm" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--sm");
    });

    it("renders with size='md'", () => {
      const { container } = render(Wordmark, { props: { size: "md" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--md");
    });

    it("renders with size='lg'", () => {
      const { container } = render(Wordmark, { props: { size: "lg" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--lg");
    });

    it("does not contain other size classes when size='sm'", () => {
      const { container } = render(Wordmark, { props: { size: "sm" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).not.toContain("wordmark--md");
      expect(svg?.className.baseVal).not.toContain("wordmark--lg");
    });
  });

  describe("variant (color) switching", () => {
    it("renders with default variant 'dark'", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--dark");
    });

    it("renders with variant='dark'", () => {
      const { container } = render(Wordmark, { props: { variant: "dark" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--dark");
    });

    it("renders with variant='light'", () => {
      const { container } = render(Wordmark, { props: { variant: "light" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark--light");
    });

    it("does not contain other variant classes when variant='light'", () => {
      const { container } = render(Wordmark, { props: { variant: "light" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).not.toContain("wordmark--dark");
    });
  });

  describe("CSS classes", () => {
    it("always has class 'wordmark'", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("wordmark");
    });

    it("combines all class modifiers", () => {
      const { container } = render(Wordmark, {
        props: { size: "lg", variant: "light" },
      });
      const svg = container.querySelector("svg");
      const classes = svg?.className.baseVal || "";
      expect(classes).toContain("wordmark");
      expect(classes).toContain("wordmark--lg");
      expect(classes).toContain("wordmark--light");
    });

    it("accepts custom class prop", () => {
      const { container } = render(Wordmark, { props: { class: "custom-brand" } });
      const svg = container.querySelector("svg");
      expect(svg?.className.baseVal).toContain("custom-brand");
    });

    it("merges custom class with modifiers", () => {
      const { container } = render(Wordmark, {
        props: { size: "sm", class: "header-logo" },
      });
      const svg = container.querySelector("svg");
      const classes = svg?.className.baseVal || "";
      expect(classes).toContain("wordmark");
      expect(classes).toContain("wordmark--sm");
      expect(classes).toContain("header-logo");
    });
  });

  describe("SVG content", () => {
    it("contains text element with 'AUBERGE'", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const firstText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("AUBERGE")
      );
      expect(firstText).toBeTruthy();
      expect((firstText as SVGTextElement)?.textContent).toBe("AUBERGE");
    });

    it("contains text element with 'DU VIEUX PONT'", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const secondText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("DU VIEUX PONT")
      );
      expect(secondText).toBeTruthy();
      expect((secondText as SVGTextElement)?.textContent).toBe("DU VIEUX PONT");
    });

    it("has two text elements", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      expect(textElements.length).toBe(2);
    });

    it("contains a separator line (rect)", () => {
      const { container } = render(Wordmark);
      const rects = container.querySelectorAll("rect");
      expect(rects.length).toBeGreaterThan(0);
      const separatorRect = Array.from(rects).find((rect) => {
        const y = (rect as SVGRectElement).getAttribute("y");
        return y === "28";
      });
      expect(separatorRect).toBeTruthy();
    });

    it("first text has SemiBold weight (600)", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const firstText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("AUBERGE")
      );
      expect((firstText as SVGTextElement)?.getAttribute("font-weight")).toBe("600");
    });

    it("second text has Light weight (300)", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const secondText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("DU VIEUX PONT")
      );
      expect((secondText as SVGTextElement)?.getAttribute("font-weight")).toBe("300");
    });
  });

  describe("SVG attributes", () => {
    it("uses fill='currentColor'", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("fill")).toBe("currentColor");
    });

    it("text elements use fill='currentColor'", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      textElements.forEach((text) => {
        expect(text.getAttribute("fill")).toBe("currentColor");
      });
    });

    it("xmlns is correctly set", () => {
      const { container } = render(Wordmark);
      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    });
  });

  describe("prop combinations", () => {
    it("works with all size and variant combinations", () => {
      const sizes = ["sm", "md", "lg"] as const;
      const variants = ["dark", "light"] as const;

      sizes.forEach((size) => {
        variants.forEach((variant) => {
          const { container } = render(Wordmark, {
            props: { size, variant },
          });
          const svg = container.querySelector("svg");
          expect(svg).toBeTruthy();
          expect(svg?.className.baseVal).toContain(`wordmark--${size}`);
          expect(svg?.className.baseVal).toContain(`wordmark--${variant}`);
        });
      });
    });
  });

  describe("typographic details", () => {
    it("first text has letter-spacing for tracked caps", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const firstText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("AUBERGE")
      );
      expect((firstText as SVGTextElement)?.getAttribute("letter-spacing")).toBe("0.12em");
    });

    it("second text has letter-spacing for subtitle", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      const secondText = Array.from(textElements).find((el) =>
        (el as SVGTextElement).textContent?.includes("DU VIEUX PONT")
      );
      expect((secondText as SVGTextElement)?.getAttribute("letter-spacing")).toBe("0.10em");
    });

    it("uses IBM Plex Sans font", () => {
      const { container } = render(Wordmark);
      const textElements = container.querySelectorAll("text");
      textElements.forEach((text) => {
        const fontFamily = (text as SVGTextElement).getAttribute("font-family");
        expect(fontFamily).toContain("IBM Plex Sans");
      });
    });
  });
});
