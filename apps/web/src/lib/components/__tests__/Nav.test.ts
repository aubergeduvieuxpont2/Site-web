import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
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
import { setUser, clearUser } from "$lib/auth.svelte";

afterEach(() => cleanup());

// Helper: stub global fetch so the onMount `/api/auth/me` call resolves with a
// given user (or no user). The component sets `user` from `data.user`.
function stubAuthMe(user: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: user != null,
        json: () => Promise.resolve(user != null ? { user } : {}),
      }),
    ),
  );
}

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

  describe("authenticated user link (role-based)", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });

    it("shows neither Admin nor Profil for an unauthenticated visitor", async () => {
      stubAuthMe(null);
      clearUser();
      const { queryByTestId } = render(Nav);
      // Allow the mocked fetch microtasks to settle.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(queryByTestId("nav-admin-link")).toBeNull();
      expect(queryByTestId("nav-profil-link")).toBeNull();
      expect(queryByTestId("nav-admin-link-mobile")).toBeNull();
      expect(queryByTestId("nav-profil-link-mobile")).toBeNull();
    });

    it("shows the Admin link (desktop + mobile) for an admin user", async () => {
      setUser({ id: 1, email: "admin@test.com", name: "Admin", role: "admin", locale: "fr" });
      const { queryByTestId } = render(Nav);

      const desktop = queryByTestId("nav-admin-link");
      expect(desktop).toBeTruthy();
      expect(desktop?.getAttribute("href")).toBe("/admin");
      const mobile = queryByTestId("nav-admin-link-mobile");
      expect(mobile).toBeTruthy();
      expect(mobile?.getAttribute("href")).toBe("/admin");

      // Guests' Profil link must be absent for admins.
      expect(queryByTestId("nav-profil-link")).toBeNull();
      expect(queryByTestId("nav-profil-link-mobile")).toBeNull();
    });

    it("shows the Profil link (desktop + mobile) for a guest user", async () => {
      setUser({ id: 2, email: "guest@test.com", name: "Guest", role: "guest", locale: "fr" });
      const { queryByTestId } = render(Nav);

      const desktop = queryByTestId("nav-profil-link");
      expect(desktop).toBeTruthy();
      expect(desktop?.getAttribute("href")).toBe("/profil");
      const mobile = queryByTestId("nav-profil-link-mobile");
      expect(mobile).toBeTruthy();
      expect(mobile?.getAttribute("href")).toBe("/profil");

      // Admin link must be absent for guests.
      expect(queryByTestId("nav-admin-link")).toBeNull();
      expect(queryByTestId("nav-admin-link-mobile")).toBeNull();
    });

    it("treats a guest user with profil link not admin", async () => {
      setUser({ id: 3, email: "guest2@test.com", name: "Guest2", role: "guest", locale: "fr" });
      const { queryByTestId } = render(Nav);
      const profil = queryByTestId("nav-profil-link");
      expect(profil).toBeTruthy();
      expect(queryByTestId("nav-admin-link")).toBeNull();
    });
  });

  describe("Connexion link gating", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });

    it("shows Connexion (desktop + mobile) for an unauthenticated visitor", async () => {
      clearUser();
      const { queryByTestId } = render(Nav);
      expect(queryByTestId("nav-connexion-link")).toBeTruthy();
      expect(queryByTestId("nav-connexion-link-mobile")).toBeTruthy();
    });

    it("hides Connexion (desktop + mobile) once a user is authenticated", async () => {
      setUser({ id: 1, email: "guest@test.com", name: "Guest", role: "guest", locale: "fr" });
      const { queryByTestId } = render(Nav);
      expect(queryByTestId("nav-connexion-link")).toBeNull();
      expect(queryByTestId("nav-connexion-link-mobile")).toBeNull();
    });
  });

  describe("logout button", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      clearUser();
    });

    it("hides logout (desktop + mobile) for an unauthenticated visitor", () => {
      clearUser();
      const { queryByTestId } = render(Nav);
      expect(queryByTestId("nav-logout")).toBeNull();
      expect(queryByTestId("nav-logout-mobile")).toBeNull();
    });

    it("shows logout (desktop + mobile) once a user is authenticated", () => {
      setUser({ id: 1, email: "guest@test.com", name: "Guest", role: "guest", locale: "fr" });
      const { queryByTestId } = render(Nav);

      const desktop = queryByTestId("nav-logout");
      expect(desktop).toBeTruthy();
      expect(desktop?.tagName).toBe("BUTTON");
      expect(desktop?.getAttribute("type")).toBe("button");
      expect(desktop?.getAttribute("aria-label")).toBe("Se déconnecter");

      const mobile = queryByTestId("nav-logout-mobile");
      expect(mobile).toBeTruthy();
      expect(mobile?.tagName).toBe("BUTTON");
      expect(mobile?.getAttribute("type")).toBe("button");
      expect(mobile?.getAttribute("aria-label")).toBe("Se déconnecter");
    });

    it("calls POST /api/auth/logout and clears the user on click", async () => {
      setUser({ id: 1, email: "guest@test.com", name: "Guest", role: "guest", locale: "fr" });
      const fetchMock = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { queryByTestId } = render(Nav);
      const button = queryByTestId("nav-logout") as HTMLButtonElement;
      await fireEvent.click(button);
      // Allow the awaited logout() promise + reactive update to settle.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toContain("/auth/logout");
      expect(init?.method).toBe("POST");
      // clearUser() ran → both logout buttons removed from the DOM.
      expect(queryByTestId("nav-logout")).toBeNull();
      expect(queryByTestId("nav-logout-mobile")).toBeNull();
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
