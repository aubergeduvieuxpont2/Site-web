import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import SectionLabel from "../SectionLabel.svelte";
// jsdom never receives the component's compiled <style> sheet (vitest does not
// process or inject Svelte component CSS), so getComputedStyle only reflects
// UA defaults. To test layout intent, we assert the root carries the styled
// class and that the component stylesheet declares the flex-column layout.
import componentSource from "../SectionLabel.svelte?raw";
const styleBlock = componentSource.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? "";
// First `.section-label { ... }` rule; longer selectors (.section-label__text,
// .section-label:not(...)) don't match because `{` must follow immediately.
const sectionLabelRule = styleBlock.match(/\.section-label\s*\{([^}]*)\}/)?.[1] ?? "";

describe("SectionLabel", () => {
  describe("rendering", () => {
    it("renders the root element with correct testid", () => {
      const { container } = render(SectionLabel, { props: { text: "Test Label" } });
      const root = container.querySelector("[data-testid='section-label']");
      expect(root).toBeTruthy();
    });

    it("renders the root element with correct class", () => {
      const { container } = render(SectionLabel, { props: { text: "Test Label" } });
      const root = container.querySelector(".section-label");
      expect(root).toBeTruthy();
    });

    it("renders text content in span with correct testid", () => {
      const { container } = render(SectionLabel, { props: { text: "About Section" } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan).toBeTruthy();
      expect(textSpan?.textContent).toBe("About Section");
    });

    it("renders text as block element", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const textSpan = container.querySelector(".section-label__text");
      expect(textSpan?.tagName).toBe("SPAN");
    });
  });

  describe("hairline rule rendering", () => {
    it("renders hairline rule by default when showHairline is not specified", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule).toBeTruthy();
      expect(rule?.tagName).toBe("HR");
    });

    it("renders hairline rule when showHairline=true", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule).toBeTruthy();
    });

    it("does not render hairline rule when showHairline=false", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: false },
      });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule).toBeFalsy();
    });

    it("applies section-label--hairline modifier class when showHairline=true", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const root = container.querySelector(".section-label");
      expect(root?.className).toContain("section-label--hairline");
    });

    it("does not apply section-label--hairline modifier when showHairline=false", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: false },
      });
      const root = container.querySelector(".section-label");
      expect(root?.className).not.toContain("section-label--hairline");
    });

    it("hairline rule has aria-hidden attribute", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule?.getAttribute("aria-hidden")).toBe("true");
    });

    it("hairline rule is an <hr> element", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const rule = container.querySelector(".section-label__rule");
      expect(rule?.tagName).toBe("HR");
    });
  });

  describe("text content", () => {
    it("renders provided text correctly", () => {
      const { container } = render(SectionLabel, { props: { text: "À Propos" } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan?.textContent).toBe("À Propos");
    });

    it("handles empty text string", () => {
      const { container } = render(SectionLabel, { props: { text: "" } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan?.textContent).toBe("");
    });

    it("handles long text content", () => {
      const longText = "This is a much longer section label text";
      const { container } = render(SectionLabel, { props: { text: longText } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan?.textContent).toBe(longText);
    });

    it("text span has correct class", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const textSpan = container.querySelector(".section-label__text");
      expect(textSpan).toBeTruthy();
    });
  });

  describe("CSS classes", () => {
    it("root element has section-label class", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const root = container.querySelector(".section-label");
      expect(root).toBeTruthy();
    });

    it("rule element has section-label__rule class", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const rule = container.querySelector(".section-label__rule");
      expect(rule).toBeTruthy();
    });

    it("text element has section-label__text class", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const text = container.querySelector(".section-label__text");
      expect(text).toBeTruthy();
    });
  });

  describe("DOM structure", () => {
    it("renders with flex column layout structure", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const root = container.querySelector(".section-label");
      const children = root?.children;
      // When showHairline=true, should have 2 children: hr and span
      expect(children?.length).toBe(2);
      expect(children?.[0]?.tagName).toBe("HR");
      expect(children?.[1]?.tagName).toBe("SPAN");
    });

    it("renders with only text span when showHairline=false", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: false },
      });
      const root = container.querySelector(".section-label");
      const children = root?.children;
      // When showHairline=false, should have 1 child: span
      expect(children?.length).toBe(1);
      expect(children?.[0]?.tagName).toBe("SPAN");
    });
  });

  describe("accessibility", () => {
    it("rule element has aria-hidden for decorative purposes", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: true },
      });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule?.getAttribute("aria-hidden")).toBe("true");
    });

    it("text content is accessible to screen readers", () => {
      const { container } = render(SectionLabel, { props: { text: "Important Section" } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan?.textContent).toBe("Important Section");
      // Verify no aria-hidden is applied to text
      expect(textSpan?.getAttribute("aria-hidden")).toBeNull();
    });
  });

  describe("props", () => {
    it("text prop is required and must be a string", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const textSpan = container.querySelector("[data-testid='section-label-text']");
      expect(textSpan?.textContent).toBe("Test");
    });

    it("showHairline prop defaults to true", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule).toBeTruthy();
    });

    it("showHairline prop can be set to false", () => {
      const { container } = render(SectionLabel, {
        props: { text: "Test", showHairline: false },
      });
      const rule = container.querySelector("[data-testid='section-label-rule']");
      expect(rule).toBeFalsy();
    });
  });

  describe("styling", () => {
    it("root has display: flex for layout", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const root = container.querySelector(".section-label");
      expect(root).toBeTruthy();
      expect(sectionLabelRule).toMatch(/display:\s*flex\b/);
    });

    it("root has flex-direction: column", () => {
      const { container } = render(SectionLabel, { props: { text: "Test" } });
      const root = container.querySelector(".section-label");
      expect(root).toBeTruthy();
      expect(sectionLabelRule).toMatch(/flex-direction:\s*column\b/);
    });
  });
});
