import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/svelte";

// ── Stub the SvelteKit `page` store: the verification page reads the `token`
//    query param from `$page.url.searchParams`. Mutating `mockUrl` before each
//    render exercises the token-present and token-missing branches. ──
let mockUrl = new URL("http://localhost/verification?token=tok-123");
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: mockUrl });
      return () => {};
    },
  },
}));

// ── Mock the API client. Re-implement `isError` faithfully so the page's
//    success/error branching is exercised honestly. ──
const verifyEmail = vi.fn((..._args: unknown[]) => Promise.resolve<unknown>(undefined));
vi.mock("$lib/api", () => ({
  verifyEmail: (...args: unknown[]) => verifyEmail(...args),
  isError: (r: unknown) =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string",
}));

import Page from "../verification/+page.svelte";

beforeEach(() => {
  verifyEmail.mockReset();
  mockUrl = new URL("http://localhost/verification?token=tok-123");
});

afterEach(() => cleanup());

describe("page-verification", () => {
  describe("token gating", () => {
    it("shows the error state immediately when the URL carries no token", async () => {
      mockUrl = new URL("http://localhost/verification");
      const { getByTestId, queryByTestId } = render(Page);
      const err = getByTestId("verify-error-state");
      expect(err).toBeTruthy();
      expect(err.getAttribute("role")).toBe("alert");
      expect(queryByTestId("verify-loading-state")).toBeNull();
      expect(verifyEmail).not.toHaveBeenCalled();
      expect(getByTestId("verify-back-to-login").getAttribute("href")).toBe("/connexion");
    });

    it("shows the loading state before verification resolves", async () => {
      // A pending promise pins the page in the loading state.
      verifyEmail.mockReturnValue(new Promise(() => {}));
      const { getByTestId } = render(Page);
      const loading = getByTestId("verify-loading-state");
      expect(loading).toBeTruthy();
      expect(loading.getAttribute("aria-busy")).toBe("true");
      expect(verifyEmail).toHaveBeenCalledWith("tok-123");
    });
  });

  describe("outcome", () => {
    it("shows the register success copy when purpose is 'register'", async () => {
      verifyEmail.mockResolvedValue({ ok: true, purpose: "register" });
      const { findByTestId } = render(Page);
      const body = await findByTestId("verify-success-body");
      expect(body.textContent).toContain("confirmée");
      expect(body.textContent).toContain("réservations");
    });

    it("shows the change success copy with the new address when purpose is 'change'", async () => {
      verifyEmail.mockResolvedValue({ ok: true, purpose: "change", email: "new@example.com" });
      const { findByTestId } = render(Page);
      const body = await findByTestId("verify-success-body");
      expect(body.textContent).toContain("nouvelle adresse");
      expect(body.textContent).toContain("new@example.com");
      expect(body.textContent).toContain("active");
    });

    it("routes an invalid/expired token to the error panel", async () => {
      verifyEmail.mockResolvedValue({ error: "Lien invalide ou expiré" });
      const { findByTestId, queryByTestId } = render(Page);
      const err = await findByTestId("verify-error-state");
      expect(err.textContent).toContain("Lien invalide ou expiré");
      await waitFor(() => expect(queryByTestId("verify-loading-state")).toBeNull());
    });

    it("routes a 409 now-taken conflict to the error panel", async () => {
      verifyEmail.mockResolvedValue({ error: "Cette adresse courriel est déjà utilisée." });
      const { findByTestId } = render(Page);
      expect(await findByTestId("verify-error-state")).toBeTruthy();
    });

    it("shows step-2 messaging for change_authorize: link sent to new address", async () => {
      // change_authorize = old address confirmed; now a change-token is issued and
      // emailed to the NEW address (INV-authorize-before-new: new address only
      // contacted after the old address token is consumed).
      verifyEmail.mockResolvedValue({
        ok: true,
        purpose: "change_authorize",
        email: "new@example.com",
      });
      const { findByTestId } = render(Page);
      const body = await findByTestId("verify-success-body");
      // Must tell the user a link was sent to the NEW address.
      expect(body.textContent).toContain("nouvelle adresse");
      expect(body.textContent).toContain("new@example.com");
      // Must guide them to finalise — not claim the change is done.
      expect(body.textContent).toContain("finaliser");
    });

    it("shows step-2 messaging for change_authorize even without email in payload", async () => {
      verifyEmail.mockResolvedValue({ ok: true, purpose: "change_authorize" });
      const { findByTestId } = render(Page);
      const body = await findByTestId("verify-success-body");
      expect(body.textContent).toContain("nouvelle adresse");
      expect(body.textContent).toContain("finaliser");
    });
  });
});
