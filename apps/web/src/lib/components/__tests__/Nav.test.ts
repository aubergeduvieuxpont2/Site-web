import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";

// Nav reads `$page.url.pathname` from the SvelteKit `page` store. Outside a
// real request that store is uninitialized (`url` is undefined), so we stub
// `$app/stores` with a minimal readable — same pattern as error-page.test.ts.
// jsdom's location defaults to "/", which the active-link test relies on.
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: new URL("http://localhost/") });
      return () => {};
    },
  },
}));

import Nav from "../Nav.svelte";
import { NAV, SITE } from "$lib/content";

afterEach(() => cleanup());

describe("Nav", () => {
  describe("structure", () => {
    it("renders a fixed banner header", () => {
      const { container } = render(Nav);
      const header = container.querySelector("header");
      expect(header).toBeTruthy();
      expect(header?.tagName).toBe("HEADER");
    });

    it("renders the brand link to home with the site name label", () => {
      const { container } = render(Nav);
      const brand = container.querySelector('a[aria-label="' + SITE.name + '"]');
      expect(brand).toBeTruthy();
      expect(brand?.getAttribute("href")).toBe("/");
    });

    it("includes the Wordmark brand component", () => {
      const { container } = render(Nav);
      const wordmark = container.querySelector('[data-testid="wordmark"]');
      expect(wordmark).toBeTruthy();
    });

    it("renders desktop and mobile navigation landmarks", () => {
      const { container } = render(Nav);
      const navs = container.querySelectorAll("nav");
      // One desktop nav + one mobile nav.
      expect(navs.length).toBe(2);
    });
  });

  describe("navigation links", () => {
    it("renders every NAV link with the correct href in each menu", () => {
      const { container } = render(Nav);
      for (const item of NAV) {
        const links = container.querySelectorAll(`a[href="${item.href}"]`);
        // Present in both the desktop and mobile menus.
        expect(links.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("renders the label and register code for each NAV link", () => {
      const { getAllByText } = render(Nav);
      for (const item of NAV) {
        expect(getAllByText(item.label).length).toBeGreaterThanOrEqual(1);
        expect(getAllByText(item.code).length).toBeGreaterThanOrEqual(1);
      }
    });

    it("marks the current route as active (Accueil at '/')", () => {
      // jsdom location defaults to path "/".
      const { container } = render(Nav);
      // The active desktop link carries an underline marker (aria-hidden span).
      const homeLink = container.querySelector('nav a[href="/"]');
      expect(homeLink).toBeTruthy();
      const marker = homeLink?.querySelector('[aria-hidden="true"]');
      expect(marker).toBeTruthy();
    });
  });

  describe("call-to-action", () => {
    it("renders a Réserver link pointing at /contact", () => {
      const { getAllByText } = render(Nav);
      const cta = getAllByText(/Réserver/);
      expect(cta.length).toBeGreaterThanOrEqual(1);
      cta.forEach((el: HTMLElement) => {
        const anchor = el.closest("a");
        expect(anchor?.getAttribute("href")).toBe("/contact");
      });
    });

    it("renders the phone link using the site tel: href", () => {
      const { container } = render(Nav);
      const phone = container.querySelector(`a[href="${SITE.phoneHref}"]`);
      expect(phone).toBeTruthy();
      expect(phone?.getAttribute("href")).toBe(SITE.phoneHref);
    });
  });

  describe("mobile menu toggle", () => {
    it("is collapsed by default with aria-expanded false", () => {
      const { container } = render(Nav);
      const toggle = container.querySelector("button[aria-expanded]");
      expect(toggle).toBeTruthy();
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");
      expect(toggle?.getAttribute("aria-label")).toBe("Ouvrir le menu");
    });

    it("expands and updates aria state when clicked", async () => {
      const { container } = render(Nav);
      const toggle = container.querySelector(
        "button[aria-expanded]",
      ) as HTMLButtonElement;

      await fireEvent.click(toggle);

      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(toggle.getAttribute("aria-label")).toBe("Fermer le menu");
    });

    it("collapses again on a second click", async () => {
      const { container } = render(Nav);
      const toggle = container.querySelector(
        "button[aria-expanded]",
      ) as HTMLButtonElement;

      await fireEvent.click(toggle);
      await fireEvent.click(toggle);

      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-label")).toBe("Ouvrir le menu");
    });
  });

  describe("accessibility", () => {
    it("brand link exposes an accessible name via aria-label", () => {
      const { container } = render(Nav);
      const brand = container.querySelector('a[href="/"][aria-label]');
      expect(brand?.getAttribute("aria-label")).toBe(SITE.name);
    });

    it("toggle button always has an accessible label", () => {
      const { container } = render(Nav);
      const toggle = container.querySelector("button[aria-expanded]");
      expect(toggle?.getAttribute("aria-label")).toBeTruthy();
    });
  });
});
