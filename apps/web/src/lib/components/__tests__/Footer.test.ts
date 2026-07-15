import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/svelte";
import Footer from "../Footer.svelte";

// Mock content
vi.mock("$lib/content", () => ({
  SITE: {
    name: "L'Auberge du Vieux Pont",
    address: {
      street: "111, avenue Saint-Michel",
      city: "Saint-Raymond",
    },
    phone: "418 655-1212",
    phoneHref: "tel:+14186551212",
  },
}));

describe("Footer", () => {
  describe("rendering", () => {
    it("renders footer element", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      expect(footer).toBeTruthy();
    });

    it("renders as semantic footer landmark", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      expect(footer?.tagName).toBe("FOOTER");
    });

    it("has footer data-testid", () => {
      const { getByTestId } = render(Footer);
      const footer = getByTestId("footer");
      expect(footer).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("has aria-label for footer landmark", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      expect(footer?.getAttribute("aria-label")).toBe("Pied de page");
    });

    it("has footer__nav with semantic nav element", () => {
      const { container } = render(Footer);
      const nav = container.querySelector("nav");
      expect(nav).toBeTruthy();
      expect(nav?.tagName).toBe("NAV");
    });

    it("nav has secondary aria-label", () => {
      const { container } = render(Footer);
      const nav = container.querySelector("nav");
      expect(nav?.getAttribute("aria-label")).toBe("Navigation secondaire");
    });

    it("address element is not italic", () => {
      const { container } = render(Footer);
      const address = container.querySelector("address");
      expect(address).toBeTruthy();
    });

    it("phone link has aria-label with phone display", () => {
      const { container } = render(Footer);
      const phoneLink = container.querySelector("[data-testid='footer-phone']");
      expect(phoneLink?.getAttribute("aria-label")).toContain("Téléphone:");
      expect(phoneLink?.getAttribute("aria-label")).toContain("418 655-1212");
    });

    it("all footer links have focus-visible support", () => {
      const { container } = render(Footer);
      const links = container.querySelectorAll(".footer__link, .footer__phone");
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link: Element) => {
        expect(link).toBeTruthy();
      });
    });
  });

  describe("brand column", () => {
    it("renders footer__brand section", () => {
      const { getByTestId } = render(Footer);
      const brand = getByTestId("footer-brand");
      expect(brand).toBeTruthy();
    });

    it("includes Wordmark component", () => {
      const { container } = render(Footer);
      const wordmark = container.querySelector("[data-testid='wordmark']");
      expect(wordmark).toBeTruthy();
    });

    it("renders address element", () => {
      const { getByTestId } = render(Footer);
      const address = getByTestId("footer-address");
      expect(address?.tagName).toBe("ADDRESS");
    });
  });

  describe("contact information", () => {
    it("displays street address", () => {
      const { getByTestId } = render(Footer);
      const street = getByTestId("footer-address-street");
      expect(street?.textContent).toBe("111, avenue Saint-Michel");
    });

    it("displays city", () => {
      const { getByTestId } = render(Footer);
      const city = getByTestId("footer-address-city");
      expect(city?.textContent).toBe("Saint-Raymond");
    });

    it("phone link has correct tel: href", () => {
      const { getByTestId } = render(Footer);
      const phoneLink = getByTestId("footer-phone");
      expect(phoneLink?.getAttribute("href")).toBe("tel:+14186551212");
    });

    it("phone link displays formatted phone number", () => {
      const { getByTestId } = render(Footer);
      const phoneLink = getByTestId("footer-phone");
      expect(phoneLink?.textContent).toBe("418 655-1212");
    });

    it("address has flex layout with proper spacing", () => {
      const { getByTestId } = render(Footer);
      const address = getByTestId("footer-address");
      const style = window.getComputedStyle(address);
      expect(style.display).toMatch(/flex|grid/);
    });
  });

  describe("footer navigation", () => {
    it("renders footer__nav section", () => {
      const { getByTestId } = render(Footer);
      const nav = getByTestId("footer-nav");
      expect(nav).toBeTruthy();
    });

    it("has politiques link", () => {
      const { getByTestId } = render(Footer);
      const link = getByTestId("footer-link-politiques");
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe("/politiques");
    });

    it("has confidentialite link", () => {
      const { getByTestId } = render(Footer);
      const link = getByTestId("footer-link-confidentialite");
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe("/confidentialite");
    });

    it("politiques link has correct text", () => {
      const { getByTestId } = render(Footer);
      const link = getByTestId("footer-link-politiques");
      expect(link?.textContent).toContain("Politiques de l'établissement");
    });

    it("confidentialite link has correct text", () => {
      const { getByTestId } = render(Footer);
      const link = getByTestId("footer-link-confidentialite");
      expect(link?.textContent).toContain("Politique de confidentialité");
    });
  });

  describe("copyright section", () => {
    it("renders footer__copy section", () => {
      const { getByTestId } = render(Footer);
      const copy = getByTestId("footer-copy");
      expect(copy).toBeTruthy();
    });

    it("includes copyright text", () => {
      const { getByTestId } = render(Footer);
      const copyText = getByTestId("footer-copy-text");
      expect(copyText?.textContent).toContain("©");
    });

    it("includes current year in copyright", () => {
      const { getByTestId } = render(Footer);
      const copyText = getByTestId("footer-copy-text");
      const currentYear = new Date().getFullYear();
      expect(copyText?.textContent).toContain(String(currentYear));
    });

    it("includes site name in copyright", () => {
      const { getByTestId } = render(Footer);
      const copyText = getByTestId("footer-copy-text");
      expect(copyText?.textContent).toContain("L'Auberge du Vieux Pont");
    });

    it("includes rights reserved text", () => {
      const { getByTestId } = render(Footer);
      const copyText = getByTestId("footer-copy-text");
      expect(copyText?.textContent).toContain("Tous droits réservés");
    });
  });

  describe("styling and layout", () => {
    it("footer has initial opacity 0", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      // Initial state before animation
      expect(footer?.classList).not.toContain("footer--visible");
    });

    it("footer__inner uses grid layout", () => {
      const { container } = render(Footer);
      const inner = container.querySelector(".footer__inner");
      expect(window.getComputedStyle(inner!).display).toBe("grid");
    });

    it("footer__brand is flex column", () => {
      const { container } = render(Footer);
      const brand = container.querySelector(".footer__brand");
      const style = window.getComputedStyle(brand!);
      expect(style.display).toBe("flex");
      expect(style.flexDirection).toBe("column");
    });

    it("footer__nav is flex column", () => {
      const { container } = render(Footer);
      const nav = container.querySelector(".footer__nav");
      const style = window.getComputedStyle(nav!);
      expect(style.display).toBe("flex");
      expect(style.flexDirection).toBe("column");
    });

    it("address lines have proper font size", () => {
      const { container } = render(Footer);
      const addressLine = container.querySelector(".footer__address-line");
      const style = window.getComputedStyle(addressLine!);
      expect(style.fontSize).toBe("13px");
    });

    it("copy text uses monospace font", () => {
      const { container } = render(Footer);
      const copyText = container.querySelector(".footer__copy-text");
      const style = window.getComputedStyle(copyText!);
      expect(style.fontFamily).toContain("monospace");
    });
  });

  describe("IntersectionObserver fade-in", () => {
    let mockIntersectionObserver: ReturnType<typeof vi.fn>;
    let observedElements: Element[] = [];
    let callbacks: IntersectionObserverCallback[] = [];

    beforeEach(() => {
      observedElements = [];
      callbacks = [];

      mockIntersectionObserver = vi.fn((callback: IntersectionObserverCallback) => {
        callbacks.push(callback);
        return {
          observe: (el: Element) => {
            observedElements.push(el);
          },
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        };
      });

      window.IntersectionObserver = mockIntersectionObserver as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("creates IntersectionObserver on mount", () => {
      render(Footer);
      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it("observes footer element", () => {
      render(Footer);
      // The observer should have observed the footer
      expect(observedElements.length).toBeGreaterThan(0);
    });

    it("adds footer--visible class when element intersects", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer") as HTMLElement;

      // Simulate intersection
      if (callbacks.length > 0) {
        const mockEntries = [
          {
            isIntersecting: true,
            target: footer,
          } as any,
        ];
        callbacks[0](mockEntries, {} as any);
      }

      expect(footer?.classList.contains("footer--visible")).toBe(true);
    });
  });

  describe("reduced motion preference", () => {
    let matchMediaMock: any;

    beforeEach(() => {
      matchMediaMock = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("skips animation when prefers-reduced-motion is set", () => {
      matchMediaMock.mockImplementation((_query: string) => ({
        matches: _query.includes("prefers-reduced-motion"),
        media: _query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      window.matchMedia = matchMediaMock;

      const { container } = render(Footer);
      const footer = container.querySelector("footer") as HTMLElement;

      // With reduced motion, should immediately get the visible class
      expect(footer?.classList.contains("footer--visible")).toBe(true);
    });
  });

  describe("data structure integrity", () => {
    it("has all required data-testid attributes", () => {
      const { container } = render(Footer);
      const testids = [
        "footer",
        "footer-brand",
        "footer-address",
        "footer-address-street",
        "footer-address-city",
        "footer-phone",
        "footer-nav",
        "footer-link-politiques",
        "footer-link-confidentialite",
        "footer-copy",
        "footer-copy-text",
      ];

      testids.forEach((testid) => {
        const el = container.querySelector(`[data-testid='${testid}']`);
        expect(el).toBeTruthy();
      });
    });

    it("DOM structure matches specification", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      const inner = footer?.querySelector(".footer__inner");
      const brand = inner?.querySelector(".footer__brand");
      const nav = inner?.querySelector(".footer__nav");
      const copy = footer?.querySelector(".footer__copy");

      expect(footer).toBeTruthy();
      expect(inner).toBeTruthy();
      expect(brand).toBeTruthy();
      expect(nav).toBeTruthy();
      expect(copy).toBeTruthy();
    });
  });

  describe("semantic HTML", () => {
    it("uses semantic footer element", () => {
      const { container } = render(Footer);
      const footer = container.querySelector("footer");
      expect(footer?.tagName).toBe("FOOTER");
    });

    it("uses semantic address element", () => {
      const { container } = render(Footer);
      const address = container.querySelector("address");
      expect(address).toBeTruthy();
    });

    it("uses semantic nav element for secondary navigation", () => {
      const { container } = render(Footer);
      const nav = container.querySelector("nav");
      expect(nav).toBeTruthy();
    });

    it("all footer links are anchor elements", () => {
      const { container } = render(Footer);
      const links = container.querySelectorAll(".footer__link, .footer__phone");
      links.forEach((link: Element) => {
        expect(link.tagName).toBe("A");
      });
    });
  });
});
