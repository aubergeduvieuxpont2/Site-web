import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, within } from "@testing-library/svelte";
import { tick } from "svelte";

// ── Stub the SvelteKit `page` store: the reset page reads the `token` query
//    param from `$page.url.searchParams`. Mutating `mockUrl` before each render
//    lets us exercise the token-present and token-missing branches. Same
//    minimal-readable pattern as error-page.test.ts / Nav.test.ts. ──
let mockUrl = new URL("http://localhost/reinitialisation?token=tok-123");
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: mockUrl });
      return () => {};
    },
  },
}));

// ── Mock the API client. Re-implement `isError` faithfully so the page's
//    error/success branching is exercised honestly. ──
const resetPassword = vi.fn((..._args: unknown[]) => Promise.resolve<unknown>(undefined));
vi.mock("$lib/api", () => ({
  resetPassword: (...args: unknown[]) => resetPassword(...args),
  isError: (r: unknown) =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string",
}));

import Page from "../reinitialisation/+page.svelte";

/** The submit button lives inside the form (Button hardcodes data-testid="button"). */
function submitButton(container: HTMLElement): HTMLButtonElement {
  const form = within(container).getByTestId("reset-form");
  return within(form).getByRole("button") as HTMLButtonElement;
}

/** Fill both password fields with the given values. */
async function fillPasswords(getByTestId: (id: string) => HTMLElement, pw: string, confirm = pw) {
  await fireEvent.input(getByTestId("reset-new-password"), { target: { value: pw } });
  await fireEvent.input(getByTestId("reset-confirm-password"), { target: { value: confirm } });
}

beforeEach(() => {
  resetPassword.mockReset();
  mockUrl = new URL("http://localhost/reinitialisation?token=tok-123");
});

afterEach(() => cleanup());

describe("page-reinitialisation", () => {
  describe("initial state (token gating)", () => {
    it("renders the form when a token is present in the URL", () => {
      const { getByTestId, queryByTestId } = render(Page);
      expect(getByTestId("reset-form-section")).toBeTruthy();
      expect(queryByTestId("reset-error-state")).toBeNull();
      expect(queryByTestId("reset-success-state")).toBeNull();
    });

    it("shows the error state immediately when the URL carries no token", () => {
      mockUrl = new URL("http://localhost/reinitialisation");
      const { getByTestId, queryByTestId } = render(Page);
      const err = getByTestId("reset-error-state");
      expect(err).toBeTruthy();
      expect(err.getAttribute("role")).toBe("alert");
      expect(queryByTestId("reset-form-section")).toBeNull();
      expect(getByTestId("reset-back-to-login").getAttribute("href")).toBe("/connexion");
    });
  });

  describe("structure & accessibility", () => {
    it("associates every input with a visible label and marks it required", () => {
      const { getByTestId, container } = render(Page);
      for (const id of ["reset-new-password", "reset-confirm-password"]) {
        const input = getByTestId(id);
        const forAttr = input.getAttribute("id");
        expect(forAttr).toBeTruthy();
        expect(container.querySelector(`label[for="${forAttr}"]`)).toBeTruthy();
        expect(input.getAttribute("type")).toBe("password");
        expect(input.getAttribute("aria-required")).toBe("true");
        expect(input.getAttribute("autocomplete")).toBe("new-password");
      }
    });

    it("keeps the error region hidden and live until an error occurs", () => {
      const { getByTestId } = render(Page);
      const err = getByTestId("reset-form-error");
      expect(err.getAttribute("data-visible")).toBe("false");
      expect(err.getAttribute("role")).toBe("alert");
      expect(err.getAttribute("aria-live")).toBe("assertive");
    });
  });

  describe("client-side validation", () => {
    it("blocks a short password before any network call", async () => {
      const { getByTestId } = render(Page);
      await fillPasswords(getByTestId, "short");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(resetPassword).not.toHaveBeenCalled();
      const err = getByTestId("reset-form-error");
      expect(err.getAttribute("data-visible")).toBe("true");
      expect(err.textContent).toContain("8 caractères");
    });

    it("blocks mismatched passwords before any network call", async () => {
      const { getByTestId } = render(Page);
      await fillPasswords(getByTestId, "longenough", "different1");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(resetPassword).not.toHaveBeenCalled();
      expect(getByTestId("reset-form-error").textContent).toContain("ne correspondent pas");
    });
  });

  describe("welcome variant (?welcome=1)", () => {
    it("renders default reset copy when welcome is absent", () => {
      const { getByTestId } = render(Page);
      const section = getByTestId("reset-form-section");
      expect(section.getAttribute("data-welcome")).toBe("false");
      expect(getByTestId("reset-card-tag").textContent).toContain("PASS-RESET");
      expect(getByTestId("reset-heading").textContent).toContain("Nouveau mot de passe");
      expect(getByTestId("reset-subhead").textContent).toContain("8 caractères");
      expect(document.title).toContain("Réinitialisation du mot de passe");
    });

    it("swaps tag, heading and subhead copy when welcome=1", () => {
      mockUrl = new URL("http://localhost/reinitialisation?token=tok-123&welcome=1");
      const { getByTestId } = render(Page);
      const section = getByTestId("reset-form-section");
      expect(section.getAttribute("data-welcome")).toBe("true");
      expect(getByTestId("reset-card-tag").textContent).toContain("BIENVENUE");
      expect(getByTestId("reset-heading").textContent).toContain("Bienvenue !");
      expect(getByTestId("reset-subhead").textContent).toContain("espace client");
    });

    it("updates the document title in welcome mode", () => {
      mockUrl = new URL("http://localhost/reinitialisation?token=tok-123&welcome=1");
      render(Page);
      expect(document.title).toContain("Créez votre espace client");
    });

    it("keeps the heading id + aria-labelledby wiring intact in welcome mode", () => {
      mockUrl = new URL("http://localhost/reinitialisation?token=tok-123&welcome=1");
      const { getByTestId } = render(Page);
      expect(getByTestId("reset-heading").getAttribute("id")).toBe("reset-heading");
      expect(getByTestId("reset-form-section").getAttribute("aria-labelledby")).toBe("reset-heading");
      // The tag remains hidden from assistive tech; the h1 is the sole heading.
      expect(getByTestId("reset-card-tag").getAttribute("aria-hidden")).toBe("true");
    });

    it("does not treat other welcome values as active", () => {
      mockUrl = new URL("http://localhost/reinitialisation?token=tok-123&welcome=true");
      const { getByTestId } = render(Page);
      expect(getByTestId("reset-form-section").getAttribute("data-welcome")).toBe("false");
      expect(getByTestId("reset-heading").textContent).toContain("Nouveau mot de passe");
    });

    it("leaves the submit flow unchanged in welcome mode", async () => {
      mockUrl = new URL("http://localhost/reinitialisation?token=tok-123&welcome=1");
      resetPassword.mockResolvedValue({ ok: true });
      const { getByTestId } = render(Page);

      await fillPasswords(getByTestId, "longenough");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(resetPassword).toHaveBeenCalledWith("tok-123", "longenough");
      expect(getByTestId("reset-success-state")).toBeTruthy();
    });
  });

  describe("submit flow", () => {
    it("calls resetPassword() with the token and new password, then shows success", async () => {
      resetPassword.mockResolvedValue({ ok: true });
      const { getByTestId, queryByTestId } = render(Page);

      await fillPasswords(getByTestId, "longenough");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(resetPassword).toHaveBeenCalledWith("tok-123", "longenough");
      expect(getByTestId("reset-success-state")).toBeTruthy();
      expect(getByTestId("reset-success-state").textContent).toContain("mis à jour");
      expect(queryByTestId("reset-form-section")).toBeNull();
      expect(getByTestId("button-link").getAttribute("href")).toBe("/connexion");
    });

    it("routes an invalid/expired token to the dedicated error panel", async () => {
      resetPassword.mockResolvedValue({ error: "Lien invalide ou expiré" });
      const { getByTestId, queryByTestId } = render(Page);

      await fillPasswords(getByTestId, "longenough");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(getByTestId("reset-error-state")).toBeTruthy();
      expect(queryByTestId("reset-form-section")).toBeNull();
    });

    it("keeps a transport failure inline on the form for retry", async () => {
      resetPassword.mockResolvedValue({ error: "Réseau indisponible" });
      const { getByTestId, queryByTestId } = render(Page);

      await fillPasswords(getByTestId, "longenough");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      expect(queryByTestId("reset-error-state")).toBeNull();
      const err = getByTestId("reset-form-error");
      expect(err.getAttribute("data-visible")).toBe("true");
      expect(err.textContent).toContain("Réseau indisponible");
    });

    it("disables the submit button and swaps its label while submitting", async () => {
      // A pending promise pins the page in the 'submitting' state.
      let resolve!: (v: unknown) => void;
      resetPassword.mockReturnValue(new Promise((r) => (resolve = r)));
      const { getByTestId, container } = render(Page);

      await fillPasswords(getByTestId, "longenough");
      await fireEvent.submit(getByTestId("reset-form"));
      await tick();

      const btn = submitButton(container);
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain("Envoi");
      expect(getByTestId("reset-new-password").hasAttribute("disabled")).toBe(true);

      resolve({ ok: true });
    });
  });
});
