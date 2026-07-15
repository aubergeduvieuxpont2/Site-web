import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import ErrorPage from "../+error.svelte";

// `+error.svelte` reads the SvelteKit `page` store. Outside a real request that
// store is unavailable, so we stub `$app/stores` with a minimal readable that
// replays whatever `mockPageValue` holds at subscribe time. Mutating it before
// each render lets us exercise different HTTP statuses.
let mockPageValue: { status: number; error: { message: string } | null } = {
  status: 404,
  error: { message: "Not Found" },
};

vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run(mockPageValue);
      return () => {};
    },
  },
}));

afterEach(() => {
  cleanup();
  mockPageValue = { status: 404, error: { message: "Not Found" } };
});

describe("error-page (+error.svelte)", () => {
  describe("error code", () => {
    it("renders the HTTP status from the page store", () => {
      mockPageValue = { status: 404, error: { message: "Not Found" } };
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-code").textContent?.trim()).toBe("404");
    });

    it("renders a non-404 status verbatim", () => {
      mockPageValue = { status: 500, error: { message: "Boom" } };
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-code").textContent?.trim()).toBe("500");
    });

    it("uses an <h1> for the error code (heading semantics)", () => {
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-code").tagName).toBe("H1");
    });
  });

  describe("error message", () => {
    it("shows the 'introuvable' message for a 404", () => {
      mockPageValue = { status: 404, error: { message: "Not Found" } };
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-message").textContent?.trim()).toBe(
        "Cette page est introuvable.",
      );
    });

    it("shows the generic message for any non-404 status", () => {
      mockPageValue = { status: 500, error: { message: "Boom" } };
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-message").textContent?.trim()).toBe(
        "Une erreur est survenue.",
      );
    });

    it("does not leak the raw error.message into the UI", () => {
      mockPageValue = {
        status: 500,
        error: { message: "DB_CONN=postgres://secret@host" },
      };
      const { container } = render(ErrorPage);
      expect(container.textContent).not.toContain("secret");
    });
  });

  describe("home link", () => {
    it("renders a link back to the home page", () => {
      const { getByTestId } = render(ErrorPage);
      const link = getByTestId("home-link").querySelector("a");
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe("/");
    });

    it("labels the home link in French", () => {
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("home-link").textContent).toContain("Accueil");
    });

    it("renders the home link as a secondary button", () => {
      const { getByTestId } = render(ErrorPage);
      const link = getByTestId("home-link").querySelector("a");
      expect(link?.className).toContain("button--secondary");
    });
  });

  describe("layout integration", () => {
    it("does NOT render a nested <main> (the layout shell owns that landmark)", () => {
      const { container } = render(ErrorPage);
      expect(container.querySelector("main")).toBeNull();
    });

    it("marks the decorative dividers as aria-hidden", () => {
      const { container } = render(ErrorPage);
      const dividers = container.querySelectorAll(".error-page__divider");
      expect(dividers.length).toBe(2);
      dividers.forEach((d: Element) =>
        expect(d.getAttribute("aria-hidden")).toBe("true"),
      );
    });

    it("exposes the required test hooks", () => {
      const { getByTestId } = render(ErrorPage);
      expect(getByTestId("error-code")).toBeTruthy();
      expect(getByTestId("error-message")).toBeTruthy();
      expect(getByTestId("home-link")).toBeTruthy();
    });
  });
});
