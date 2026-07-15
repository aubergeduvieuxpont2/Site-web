import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button from "../Button.svelte";

// @ts-ignore - testing-library/svelte type mismatch with Svelte 5 snippets
const textSnippet = (text: string) => createRawSnippet(() => text);

describe("Button", () => {
  describe("rendering as button element", () => {
    it("renders as <button> when href is not provided", () => {
      const { container } = render(Button, { props: { children: textSnippet("Click me") } });
      const button = container.querySelector("button[data-testid='button']");
      expect(button).toBeTruthy();
    });

    it("renders with default type='button'", () => {
      const { container } = render(Button, { props: { children: textSnippet("Click me") } });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.type).toBe("button");
    });

    it("renders with type='submit' when specified", () => {
      const { container } = render(Button, { props: { type: "submit", children: textSnippet("Submit") } });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.type).toBe("submit");
    });

    it("renders with default variant='primary'", () => {
      const { container } = render(Button, { props: { children: textSnippet("Primary") } });
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("button--primary");
    });
  });

  describe("rendering as link element", () => {
    it("renders as <a> when href is provided", () => {
      const { container } = render(Button, { props: { href: "/test", children: textSnippet("Link") } });
      const link = container.querySelector("a[data-testid='button-link']");
      expect(link).toBeTruthy();
    });

    it("renders link with correct href", () => {
      const { container } = render(Button, { props: { href: "/contact", children: textSnippet("Link") } });
      const link = container.querySelector("a") as HTMLAnchorElement;
      expect(link.href).toContain("/contact");
    });
  });

  describe("variants", () => {
    it("renders with primary variant", () => {
      const { container } = render(Button, {
        props: { variant: "primary", children: textSnippet("Primary") },
      });
      const button = container.querySelector(".button--primary");
      expect(button).toBeTruthy();
    });

    it("renders with secondary variant", () => {
      const { container } = render(Button, {
        props: { variant: "secondary", children: textSnippet("Secondary") },
      });
      const button = container.querySelector(".button--secondary");
      expect(button).toBeTruthy();
    });

    it("renders with action variant", () => {
      const { container } = render(Button, {
        props: { variant: "action", children: textSnippet("Action") },
      });
      const button = container.querySelector(".button--action");
      expect(button).toBeTruthy();
    });
  });

  describe("size modifier", () => {
    it("renders without size modifier by default (md)", () => {
      const { container } = render(Button, { props: { children: textSnippet("Default") } });
      const button = container.querySelector("button");
      expect(button?.className).not.toContain("button--sm");
    });

    it("renders with size='sm' modifier", () => {
      const { container } = render(Button, { props: { size: "sm", children: textSnippet("Small") } });
      const button = container.querySelector("button");
      expect(button?.className).toContain("button--sm");
    });

    it("does not add sm modifier when size='md'", () => {
      const { container } = render(Button, { props: { size: "md", children: textSnippet("Medium") } });
      const button = container.querySelector("button");
      expect(button?.className).not.toContain("button--sm");
    });
  });

  describe("disabled state", () => {
    it("sets disabled attribute on button element", () => {
      const { container } = render(Button, { props: { disabled: true, children: textSnippet("Disabled") } });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it("does not set disabled attribute by default", () => {
      const { container } = render(Button, { props: { children: textSnippet("Enabled") } });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("sets aria-disabled on disabled link", () => {
      const { container } = render(Button, {
        props: { href: "/test", disabled: true, children: textSnippet("Disabled Link") },
      });
      const link = container.querySelector("a");
      expect(link?.getAttribute("aria-disabled")).toBe("true");
    });

    it("sets tabindex='-1' on disabled link", () => {
      const { container } = render(Button, {
        props: { href: "/test", disabled: true, children: textSnippet("Disabled Link") },
      });
      const link = container.querySelector("a");
      expect(link?.getAttribute("tabindex")).toBe("-1");
    });

    it("does not set aria-disabled on enabled link", () => {
      const { container } = render(Button, {
        props: { href: "/test", disabled: false, children: textSnippet("Enabled Link") },
      });
      const link = container.querySelector("a");
      expect(link?.getAttribute("aria-disabled")).toBeNull();
    });

    it("sets aria-disabled on disabled button", () => {
      const { container } = render(Button, { props: { disabled: true, children: textSnippet("Disabled") } });
      const button = container.querySelector("button");
      expect(button?.getAttribute("aria-disabled")).toBe("true");
    });
  });

  describe("label element", () => {
    it("wraps children in .button__label span", () => {
      const { container } = render(Button, { props: { children: textSnippet("Label text") } });
      const label = container.querySelector(".button__label[data-testid='button-label']");
      expect(label).toBeTruthy();
      expect(label?.textContent).toBe("Label text");
    });

    it("renders label text correctly", () => {
      const { container } = render(Button, { props: { children: textSnippet("Réserver") } });
      const label = container.querySelector("[data-testid='button-label']");
      expect(label?.textContent).toBe("Réserver");
    });
  });

  describe("test IDs", () => {
    it("has data-testid='button' on button element", () => {
      const { container } = render(Button, { props: { children: textSnippet("Test") } });
      const button = container.querySelector("[data-testid='button']");
      expect(button?.tagName).toBe("BUTTON");
    });

    it("has data-testid='button-link' on link element", () => {
      const { container } = render(Button, { props: { href: "/test", children: textSnippet("Test") } });
      const link = container.querySelector("[data-testid='button-link']");
      expect(link?.tagName).toBe("A");
    });

    it("has data-testid='button-label' on label span", () => {
      const { container } = render(Button, { props: { children: textSnippet("Test") } });
      const label = container.querySelector("[data-testid='button-label']");
      expect(label).toBeTruthy();
    });
  });

  describe("CSS class application", () => {
    it("applies all button classes to button element", () => {
      const { container } = render(Button, {
        props: { variant: "primary", children: textSnippet("Test") },
      });
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("button--primary");
    });

    it("applies custom class via class prop", () => {
      const { container } = render(Button, {
        props: { class: "custom-class", children: textSnippet("Test") },
      });
      const button = container.querySelector("button");
      expect(button?.className).toContain("custom-class");
    });

    it("combines variant and size classes correctly", () => {
      const { container } = render(Button, {
        props: { variant: "action", size: "sm", children: textSnippet("Test") },
      });
      const button = container.querySelector("button");
      expect(button?.className).toContain("button");
      expect(button?.className).toContain("button--action");
      expect(button?.className).toContain("button--sm");
    });
  });

  describe("accessibility", () => {
    it("button is keyboard focusable by default", () => {
      const { container } = render(Button, { props: { children: textSnippet("Test") } });
      const button = container.querySelector("button") as HTMLButtonElement;
      expect(button.tabIndex).not.toBe(-1);
    });

    it("link is keyboard focusable by default", () => {
      const { container } = render(Button, { props: { href: "/test", children: textSnippet("Test") } });
      const link = container.querySelector("a") as HTMLAnchorElement;
      expect(link.getAttribute("tabindex")).not.toBe("-1");
    });

    it("disabled link is not keyboard focusable", () => {
      const { container } = render(Button, {
        props: { href: "/test", disabled: true, children: textSnippet("Test") },
      });
      const link = container.querySelector("a");
      expect(link?.getAttribute("tabindex")).toBe("-1");
    });
  });

  describe("text content", () => {
    it("displays text in French", () => {
      const { container } = render(Button, { props: { children: textSnippet("Réserver") } });
      expect(container.textContent).toContain("Réserver");
    });

    it("maintains text content across different variants", () => {
      const text = "Contact";
      const { container: container1 } = render(Button, {
        props: { variant: "primary", children: textSnippet(text) },
      });
      const { container: container2 } = render(Button, {
        props: { variant: "secondary", children: textSnippet(text) },
      });
      const { container: container3 } = render(Button, {
        props: { variant: "action", children: textSnippet(text) },
      });

      expect(container1.textContent).toContain(text);
      expect(container2.textContent).toContain(text);
      expect(container3.textContent).toContain(text);
    });
  });

  describe("touch target size", () => {
    it("has minimum height of 44px (from CSS custom properties)", () => {
      const { container } = render(Button, { props: { children: textSnippet("Test") } });
      const button = container.querySelector("button");
      const styles = window.getComputedStyle(button!);
      expect(styles.minHeight).toBe("44px");
    });
  });
});
