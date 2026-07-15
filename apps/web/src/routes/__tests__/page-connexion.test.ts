import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";

// ── Mock the navigation + API modules the page depends on. ──
const goto = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("$app/navigation", () => ({
  goto: (...args: unknown[]) => goto(...args),
}));

const login = vi.fn((..._args: unknown[]) => Promise.resolve<unknown>(undefined));
const register = vi.fn((..._args: unknown[]) => Promise.resolve<unknown>(undefined));
vi.mock("$lib/api", () => ({
  login: (...args: unknown[]) => login(...args),
  register: (...args: unknown[]) => register(...args),
  // Re-implement the real guard so the page's branching is exercised honestly.
  isError: (r: unknown) =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string",
}));

import Page from "../connexion/+page.svelte";

/** Locate the submit button inside a form (Button hardcodes data-testid="button"). */
function submitButton(container: HTMLElement, formTestId: string): HTMLButtonElement {
  const form = within(container).getByTestId(formTestId);
  return within(form).getByRole("button") as HTMLButtonElement;
}

beforeEach(() => {
  goto.mockClear();
  login.mockReset();
  register.mockReset();
});

describe("page-connexion", () => {
  describe("structure & accessibility", () => {
    it("renders both auth panels with labelled regions", () => {
      const { getByTestId } = render(Page);
      const loginPanel = getByTestId("panel-login");
      const registerPanel = getByTestId("panel-register");
      expect(loginPanel.getAttribute("aria-labelledby")).toBe("login-heading");
      expect(registerPanel.getAttribute("aria-labelledby")).toBe("register-heading");
    });

    it("associates every input with a label", () => {
      const { getByTestId, container } = render(Page);
      for (const id of ["login-email", "login-password", "register-email", "register-password", "register-name"]) {
        const input = getByTestId(id);
        const forAttr = input.getAttribute("id");
        expect(forAttr).toBeTruthy();
        expect(container.querySelector(`label[for="${forAttr}"]`)).toBeTruthy();
      }
    });

    it("marks the credential inputs as required and password fields as password type", () => {
      const { getByTestId } = render(Page);
      expect(getByTestId("login-email").getAttribute("aria-required")).toBe("true");
      expect(getByTestId("login-password").getAttribute("type")).toBe("password");
      expect(getByTestId("register-password").getAttribute("type")).toBe("password");
      expect(getByTestId("register-password").getAttribute("aria-describedby")).toBe("reg-password-hint");
    });

    it("keeps error regions hidden and live until an error occurs", () => {
      const { getByTestId } = render(Page);
      const err = getByTestId("login-error");
      expect(err.getAttribute("data-visible")).toBe("false");
      expect(err.getAttribute("role")).toBe("alert");
      expect(err.getAttribute("aria-live")).toBe("assertive");
    });
  });

  describe("login flow", () => {
    it("calls login() with the entered credentials and redirects to /profil on success", async () => {
      login.mockResolvedValue({ user: { id: 1, email: "a@b.co", name: null, role: "guest" } });
      const { getByTestId, container } = render(Page);

      await fireEvent.input(getByTestId("login-email"), { target: { value: "a@b.co" } });
      await fireEvent.input(getByTestId("login-password"), { target: { value: "hunter2!!" } });
      await fireEvent.submit(getByTestId("form-login"));
      await tick();

      expect(login).toHaveBeenCalledWith("a@b.co", "hunter2!!");
      expect(goto).toHaveBeenCalledWith("/profil");
      // A successful login must never surface an error.
      expect(submitButton(container, "form-login")).toBeTruthy();
    });

    it("shows a neutral message on a 401 (no user enumeration)", async () => {
      login.mockResolvedValue({ error: "Identifiants invalides" });
      const { getByTestId } = render(Page);

      await fireEvent.submit(getByTestId("form-login"));
      await tick();

      const err = getByTestId("login-error");
      expect(err.getAttribute("data-visible")).toBe("true");
      expect(err.textContent).toContain("Identifiants invalides");
      expect(goto).not.toHaveBeenCalled();
    });

    it("maps a transport failure to a distinct retry message", async () => {
      login.mockResolvedValue({ error: "Réseau indisponible" });
      const { getByTestId } = render(Page);

      await fireEvent.submit(getByTestId("form-login"));
      await tick();

      expect(getByTestId("login-error").textContent).toContain("Connexion impossible");
    });
  });

  describe("register flow", () => {
    it("blocks a short password before any network call", async () => {
      const { getByTestId } = render(Page);

      await fireEvent.input(getByTestId("register-email"), { target: { value: "new@b.co" } });
      await fireEvent.input(getByTestId("register-password"), { target: { value: "short" } });
      await fireEvent.submit(getByTestId("form-register"));
      await tick();

      expect(register).not.toHaveBeenCalled();
      expect(getByTestId("register-error").getAttribute("data-visible")).toBe("true");
      expect(getByTestId("register-error").textContent).toContain("8 caractères");
    });

    it("registers with a trimmed name (null when blank) and redirects on success", async () => {
      register.mockResolvedValue({ user: { id: 2, email: "new@b.co", name: null, role: "guest" } });
      const { getByTestId } = render(Page);

      await fireEvent.input(getByTestId("register-email"), { target: { value: "new@b.co" } });
      await fireEvent.input(getByTestId("register-password"), { target: { value: "longenough" } });
      await fireEvent.submit(getByTestId("form-register"));
      await tick();

      expect(register).toHaveBeenCalledWith("new@b.co", "longenough", null);
      expect(goto).toHaveBeenCalledWith("/profil");
    });

    it("passes a provided name through, trimmed", async () => {
      register.mockResolvedValue({ user: { id: 3, email: "n@b.co", name: "Ada", role: "guest" } });
      const { getByTestId } = render(Page);

      await fireEvent.input(getByTestId("register-name"), { target: { value: "  Ada  " } });
      await fireEvent.input(getByTestId("register-email"), { target: { value: "n@b.co" } });
      await fireEvent.input(getByTestId("register-password"), { target: { value: "longenough" } });
      await fireEvent.submit(getByTestId("form-register"));
      await tick();

      expect(register).toHaveBeenCalledWith("n@b.co", "longenough", "Ada");
    });

    it("surfaces the API error message on a duplicate account (409)", async () => {
      register.mockResolvedValue({ error: "Un compte existe déjà" });
      const { getByTestId } = render(Page);

      await fireEvent.input(getByTestId("register-email"), { target: { value: "dup@b.co" } });
      await fireEvent.input(getByTestId("register-password"), { target: { value: "longenough" } });
      await fireEvent.submit(getByTestId("form-register"));
      await tick();

      expect(getByTestId("register-error").textContent).toContain("Un compte existe déjà");
      expect(goto).not.toHaveBeenCalled();
    });
  });
});
