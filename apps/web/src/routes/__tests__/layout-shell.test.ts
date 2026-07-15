import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Layout from "../+layout.svelte";

// afterNavigate must be a no-op outside a real SvelteKit navigation context.
vi.mock("$app/navigation", () => ({
  afterNavigate: () => {},
}));

// The composed Nav reads `$page.url.pathname`; the real store is uninitialized
// outside a request, so stub it with a minimal readable (see error-page.test.ts).
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: new URL("http://localhost/") });
      return () => {};
    },
  },
}));

// Nav and Footer read shared content constants; provide the minimum shape.
vi.mock("$lib/content", () => ({
  SITE: {
    name: "L'Auberge du Vieux Pont",
    established: "1898",
    phone: "418 655-1212",
    phoneHref: "tel:+14186551212",
    address: { street: "111, avenue Saint-Michel", city: "Saint-Raymond" },
  },
  NAV: [],
}));

// The layout and the composed Footer query `window.matchMedia` (reduced
// motion), which jsdom does not implement — stub it as in motion.test.ts.
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

/** A snippet that renders an identifiable child, so we can assert it lands in <main>. */
const children = createRawSnippet(() => ({
  render: () => `<p data-testid="child-content">Contenu de la page</p>`,
}));

describe("layout-shell (+layout.svelte)", () => {
  describe("skip link", () => {
    it("renders a skip link as the first focusable element", () => {
      const { getByTestId } = render(Layout, { props: { children } });
      const link = getByTestId("skip-link");
      expect(link).toBeTruthy();
      expect(link.tagName).toBe("A");
    });

    it("targets the main landmark via #main", () => {
      const { getByTestId } = render(Layout, { props: { children } });
      expect(getByTestId("skip-link").getAttribute("href")).toBe("#main");
    });
  });

  describe("main landmark", () => {
    it("renders a <main> with id=main", () => {
      const { getByTestId } = render(Layout, { props: { children } });
      const main = getByTestId("main-content");
      expect(main.tagName).toBe("MAIN");
      expect(main.getAttribute("id")).toBe("main");
    });

    it("renders the provided children inside <main>", () => {
      const { getByTestId } = render(Layout, { props: { children } });
      const child = getByTestId("child-content");
      expect(child).toBeTruthy();
      expect(getByTestId("main-content").contains(child)).toBe(true);
    });
  });

  describe("landmarks from composed components", () => {
    it("renders the Nav banner and Footer contentinfo", () => {
      const { container } = render(Layout, { props: { children } });
      expect(container.querySelector("header")).toBeTruthy();
      expect(container.querySelector("footer")).toBeTruthy();
    });
  });

  describe("document order", () => {
    it("places the skip link before the main content", () => {
      const { getByTestId } = render(Layout, { props: { children } });
      const link = getByTestId("skip-link");
      const main = getByTestId("main-content");
      // DOCUMENT_POSITION_FOLLOWING (4) => main comes after the skip link.
      expect(link.compareDocumentPosition(main) & 4).toBeTruthy();
    });
  });
});
