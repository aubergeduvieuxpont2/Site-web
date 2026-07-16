import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { ProfileResponse, ReservationRow, User, ApiError } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the navigation + typed API modules. The profil page must reach the
// network only through the api-client helpers — never a raw fetch — so mocking
// the module fully isolates the component. `isError` keeps the real semantics
// so the component's success/error branching is exercised faithfully.
// ---------------------------------------------------------------------------
const goto = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("$app/navigation", () => ({
  goto: (...args: unknown[]) => goto(...args),
}));

const getMe = vi.fn();
const getProfile = vi.fn();
const logout = vi.fn();
const changePassword = vi.fn();
vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
  logout: (...a: unknown[]) => logout(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mocks are registered so the component binds to them.
import Page from "../profil/+page.svelte";

const GUEST: User = { id: 2, email: "guest@example.com", name: "Marie Guest", role: "guest" };
const ADMIN: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" };

function reservation(over: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id: 100,
    email: "jean@example.com",
    name: "Jean Tremblay",
    check_in: "2026-08-01",
    check_out: "2026-08-03",
    guests: 2,
    message: null,
    created_at: "2026-07-01T12:00:00.000Z",
    updated_at: "2026-07-01T12:00:00.000Z",
    ...over,
  };
}

function profile(over: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    user: GUEST,
    reservations: [],
    hubspot: { contact: null, deals: [] },
    ...over,
  };
}

beforeEach(() => {
  goto.mockClear();
  getMe.mockReset();
  getProfile.mockReset();
  logout.mockReset();
  changePassword.mockReset();
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: GUEST });
  getProfile.mockResolvedValue(profile());
  logout.mockResolvedValue({ ok: true });
  changePassword.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe("page-profil auth gate", () => {
  it("redirects to /connexion when getMe returns an error (unauthenticated)", async () => {
    getMe.mockResolvedValue({ error: "Non authentifié" });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/connexion"));
    // The profile is never fetched for an unauthenticated visitor.
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("redirects to /connexion on a network error without surfacing an error UI", async () => {
    getMe.mockResolvedValue({ error: "Réseau indisponible" });
    const { queryByTestId } = render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/connexion"));
    expect(queryByTestId("profil-error")).toBeNull();
  });

  it("fetches the profile once authenticated and renders the content", async () => {
    const { findByTestId } = render(Page);
    expect(await findByTestId("profil-content")).toBeTruthy();
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    expect(goto).not.toHaveBeenCalled();
  });
});

describe("page-profil error phase", () => {
  it("shows an error alert when the profile fetch fails", async () => {
    getProfile.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId } = render(Page);
    const err = await findByTestId("profil-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect((await findByTestId("profil-error-message")).textContent).toContain("Erreur 500");
  });

  it("renders the profile error message as text, never as HTML", async () => {
    getProfile.mockResolvedValue({ error: "<img src=x onerror=alert(1)>" });
    const { findByTestId } = render(Page);
    const msg = await findByTestId("profil-error-message");
    expect(msg.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(msg.querySelector("img")).toBeNull();
  });
});

describe("page-profil user card", () => {
  it("renders the guest identity and role badge", async () => {
    const { findByTestId, getByTestId } = render(Page);
    expect((await findByTestId("profil-title")).textContent).toContain("Marie Guest");
    expect(getByTestId("profil-user-email").textContent).toContain("guest@example.com");
    const badge = getByTestId("profil-role-badge");
    expect(badge.textContent).toContain("Invité");
    expect(badge.className).not.toContain("profil__role-badge--admin");
    // Guests never see the admin shortcut.
    expect(document.querySelector("[data-testid='profil-admin-link']")).toBeNull();
  });

  it("falls back to the email as the title when the name is null", async () => {
    getProfile.mockResolvedValue(profile({ user: { ...GUEST, name: null } }));
    const { findByTestId } = render(Page);
    expect((await findByTestId("profil-title")).textContent).toContain("guest@example.com");
  });

  it("redirects an admin to /admin and never fetches the guest profile", async () => {
    getMe.mockResolvedValue({ user: ADMIN });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/admin"));
    // Admins manage everything in /admin; the profil profile is never loaded.
    expect(getProfile).not.toHaveBeenCalled();
  });
});

describe("page-profil reservations", () => {
  it("shows the empty state when there are no reservations", async () => {
    const { findByTestId } = render(Page);
    expect((await findByTestId("profil-res-empty")).textContent).toContain("Aucune réservation");
  });

  it("renders a row per reservation and expands details on demand", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [reservation({ id: 1, message: "Arrivée tardive" }), reservation({ id: 2 })],
      }),
    );
    const { findByTestId, findAllByTestId, queryByTestId, getByTestId } = render(Page);
    const rows = await findAllByTestId(/profil-res-row-\d+/);
    expect(rows).toHaveLength(2);

    // Detail row is hidden until the expand toggle is pressed.
    expect(queryByTestId("profil-res-detail-0")).toBeNull();
    const toggle = await findByTestId("profil-res-expand-0");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(toggle);
    const detail = await findByTestId("profil-res-detail-0");
    expect(detail.textContent).toContain("Jean Tremblay");
    expect(detail.textContent).toContain("Arrivée tardive");
    expect(getByTestId("profil-res-expand-0").getAttribute("aria-expanded")).toBe("true");

    // Collapsing hides the detail again.
    await fireEvent.click(getByTestId("profil-res-expand-0"));
    await waitFor(() => expect(queryByTestId("profil-res-detail-0")).toBeNull());
  });

  it("renders reservation values as text, never as HTML", async () => {
    getProfile.mockResolvedValue(
      profile({ reservations: [reservation({ name: "<b>x</b>", message: "<script>1</script>" })] }),
    );
    const { findByTestId } = render(Page);
    await fireEvent.click(await findByTestId("profil-res-expand-0"));
    const detail = await findByTestId("profil-res-detail-0");
    expect(detail.textContent).toContain("<b>x</b>");
    expect(detail.querySelector("b")).toBeNull();
  });
});

describe("page-profil change password", () => {
  async function fillAndSubmit(
    findByTestId: (id: string) => Promise<HTMLElement>,
    current: string,
    next: string,
  ): Promise<void> {
    const cur = (await findByTestId("profil-pwd-current-input")) as HTMLInputElement;
    const nw = (await findByTestId("profil-pwd-new-input")) as HTMLInputElement;
    await fireEvent.input(cur, { target: { value: current } });
    await fireEvent.input(nw, { target: { value: next } });
    await fireEvent.submit(await findByTestId("profil-pwd-form"));
  }

  it("renders the change-password form with both fields once loaded", async () => {
    const utils = render(Page);
    expect(await utils.findByTestId("profil-pwd-heading")).toBeTruthy();
    expect(await utils.findByTestId("profil-pwd-current-input")).toBeTruthy();
    expect(await utils.findByTestId("profil-pwd-new-input")).toBeTruthy();
    // The removed HubSpot section leaves no trace.
    expect(utils.queryByTestId("profil-hs-heading")).toBeNull();
  });

  it("rejects a too-short new password client-side without calling the API", async () => {
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "current-pass", "short");
    const err = await utils.findByTestId("profil-pwd-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("au moins 8 caractères");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("submits valid input and shows a success confirmation", async () => {
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "current-pass", "brand-new-pass");
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith("current-pass", "brand-new-pass"),
    );
    const ok = await utils.findByTestId("profil-pwd-success");
    expect(ok.getAttribute("role")).toBe("status");
    expect(ok.textContent).toContain("Mot de passe modifié avec succès");
    // Fields are cleared on success.
    const cur = (await utils.findByTestId("profil-pwd-current-input")) as HTMLInputElement;
    const nw = (await utils.findByTestId("profil-pwd-new-input")) as HTMLInputElement;
    expect(cur.value).toBe("");
    expect(nw.value).toBe("");
  });

  it("surfaces the API error and does not show success", async () => {
    changePassword.mockResolvedValue({ error: "Mot de passe actuel incorrect." });
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "wrong-pass", "brand-new-pass");
    const err = await utils.findByTestId("profil-pwd-error");
    expect(err.textContent).toContain("Mot de passe actuel incorrect.");
    expect(utils.queryByTestId("profil-pwd-success")).toBeNull();
  });

  it("renders the API error as text, never as HTML", async () => {
    changePassword.mockResolvedValue({ error: "<img src=x onerror=alert(1)>" });
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "current-pass", "brand-new-pass");
    const err = await utils.findByTestId("profil-pwd-error");
    expect(err.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(err.querySelector("img")).toBeNull();
  });
});

describe("page-profil logout", () => {
  it("calls logout then redirects home", async () => {
    const { findByTestId } = render(Page);
    const btn = await findByTestId("profil-logout-btn");
    await fireEvent.click(btn);
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  });

  it("still redirects home when logout errors (best-effort)", async () => {
    logout.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId } = render(Page);
    await fireEvent.click(await findByTestId("profil-logout-btn"));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  });
});
