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
const changeProfileEmail = vi.fn();
vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
  logout: (...a: unknown[]) => logout(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  changeProfileEmail: (...a: unknown[]) => changeProfileEmail(...a),
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
    name: "Jean Tremblay",
    first_name: "Jean",
    last_name: "Tremblay",
    email: "jean@example.com",
    phone: null,
    room: null,
    arrive: "2026-08-01",
    depart: "2026-08-03",
    people: 2,
    room_count: null,
    message: null,
    created_at: "2026-07-01T12:00:00.000Z",
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
  changeProfileEmail.mockReset();
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: GUEST });
  getProfile.mockResolvedValue(profile());
  logout.mockResolvedValue({ ok: true });
  changePassword.mockResolvedValue({ ok: true });
  changeProfileEmail.mockResolvedValue({ user: { ...GUEST, email: "new@example.com" } });
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
    expect((await findByTestId("empty-state")).textContent).toContain("Aucune réservation");
  });

  it("renders a row per reservation with corrected field names", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [
          reservation({ id: 1, arrive: "2026-08-01", depart: "2026-08-03", people: 2 }),
          reservation({ id: 2, arrive: "2026-09-10", depart: "2026-09-15", people: 3 }),
        ],
      }),
    );
    const { findAllByTestId } = render(Page);
    const rows = await findAllByTestId(/reservation-row-\d+/);
    expect(rows).toHaveLength(2);
  });

  it("formats arrive and depart dates in fr-CA locale", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [reservation({ id: 1, arrive: "2026-08-01", depart: "2026-08-03" })],
      }),
    );
    const { findAllByTestId } = render(Page);
    const arriveCells = await findAllByTestId("cell-arrive");
    const departCells = await findAllByTestId("cell-depart");
    // "2026-08-01" → "1 août 2026" in fr-CA
    expect(arriveCells[0].textContent).toContain("août");
    expect(departCells[0].textContent).toContain("août");
  });

  it("renders — for null arrive and depart dates", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [reservation({ id: 1, arrive: null, depart: null })],
      }),
    );
    const { findAllByTestId } = render(Page);
    const arriveCells = await findAllByTestId("cell-arrive");
    const departCells = await findAllByTestId("cell-depart");
    expect(arriveCells[0].textContent).toBe("—");
    expect(departCells[0].textContent).toBe("—");
  });

  it("renders room slug when present, — when null", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [
          reservation({ id: 1, room: "chambre-bleue" }),
          reservation({ id: 2, room: null }),
        ],
      }),
    );
    const { findAllByTestId } = render(Page);
    const roomCells = await findAllByTestId("cell-room");
    expect(roomCells[0].textContent).toBe("chambre-bleue");
    expect(roomCells[1].textContent).toBe("—");
  });

  it("renders people count", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [reservation({ id: 1, people: 4 })],
      }),
    );
    const { findAllByTestId } = render(Page);
    const peopleCells = await findAllByTestId("cell-people");
    expect(peopleCells[0].textContent).toBe("4");
  });

  it("renders reservation data as text, never as HTML", async () => {
    getProfile.mockResolvedValue(
      profile({
        reservations: [reservation({ id: 1, room: "<b>x</b>" })],
      }),
    );
    const { findAllByTestId } = render(Page);
    const roomCells = await findAllByTestId("cell-room");
    expect(roomCells[0].textContent).toContain("<b>x</b>");
    expect(roomCells[0].querySelector("b")).toBeNull();
  });

  it("table is display-only — no expand buttons", async () => {
    getProfile.mockResolvedValue(
      profile({ reservations: [reservation({ id: 1 })] }),
    );
    const { queryAllByTestId, findByTestId } = render(Page);
    await findByTestId("profil-reservation-table");
    expect(queryAllByTestId(/profil-res-expand-/)).toHaveLength(0);
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

describe("page-profil change email", () => {
  async function fillAndSubmit(
    findByTestId: (id: string) => Promise<HTMLElement>,
    newEmail: string,
    password: string,
  ): Promise<void> {
    const em = (await findByTestId("profil-email-new-input")) as HTMLInputElement;
    const pw = (await findByTestId("profil-email-password-input")) as HTMLInputElement;
    await fireEvent.input(em, { target: { value: newEmail } });
    await fireEvent.input(pw, { target: { value: password } });
    await fireEvent.submit(await findByTestId("profil-email-form"));
  }

  it("renders the change-email form with both fields and current address", async () => {
    const utils = render(Page);
    expect(await utils.findByTestId("profil-email-heading")).toBeTruthy();
    expect(await utils.findByTestId("profil-email-new-input")).toBeTruthy();
    expect(await utils.findByTestId("profil-email-password-input")).toBeTruthy();
    expect((await utils.findByTestId("profil-email-current")).textContent).toContain(
      "guest@example.com",
    );
  });

  it("submits valid input, shows success, updates displayed email, and clears fields", async () => {
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "new@example.com", "current-pass");
    await waitFor(() =>
      expect(changeProfileEmail).toHaveBeenCalledWith("new@example.com", "current-pass"),
    );
    const ok = await utils.findByTestId("profil-email-success");
    expect(ok.getAttribute("role")).toBe("status");
    expect(ok.textContent).toContain("Adresse courriel modifiée avec succès");
    // Displayed email + current-address hint reflect the new address.
    expect((await utils.findByTestId("profil-user-email")).textContent).toContain(
      "new@example.com",
    );
    expect((await utils.findByTestId("profil-email-current")).textContent).toContain(
      "new@example.com",
    );
    const em = (await utils.findByTestId("profil-email-new-input")) as HTMLInputElement;
    const pw = (await utils.findByTestId("profil-email-password-input")) as HTMLInputElement;
    expect(em.value).toBe("");
    expect(pw.value).toBe("");
  });

  it("surfaces a 401 password error and does not show success", async () => {
    changeProfileEmail.mockResolvedValue({ error: "Mot de passe actuel incorrect." });
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "new@example.com", "wrong-pass");
    const err = await utils.findByTestId("profil-email-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Mot de passe actuel incorrect.");
    expect(utils.queryByTestId("profil-email-success")).toBeNull();
  });

  it("surfaces a 409 conflict message", async () => {
    changeProfileEmail.mockResolvedValue({
      error: "Cette adresse courriel est déjà utilisée.",
    });
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "taken@example.com", "current-pass");
    const err = await utils.findByTestId("profil-email-error");
    expect(err.textContent).toContain("Cette adresse courriel est déjà utilisée.");
  });

  it("renders the API error as text, never as HTML", async () => {
    changeProfileEmail.mockResolvedValue({ error: "<img src=x onerror=alert(1)>" });
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "new@example.com", "current-pass");
    const err = await utils.findByTestId("profil-email-error");
    expect(err.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(err.querySelector("img")).toBeNull();
  });
});

describe("page-profil rate row", () => {
  it("renders profil-user-rate with the effectiveNightlyPrice from getMe when getProfile omits it", async () => {
    getMe.mockResolvedValue({ user: { ...GUEST, effectiveNightlyPrice: 75 } });
    getProfile.mockResolvedValue(profile()); // GUEST has no effectiveNightlyPrice
    const { findByTestId } = render(Page);
    const rateEl = await findByTestId("profil-user-rate");
    expect(rateEl.textContent).toContain("75");
  });

  it("shows profil-rate-badge when effectiveNightlyPrice (75) differs from settings.nightlyPrice (89)", async () => {
    getMe.mockResolvedValue({ user: { ...GUEST, effectiveNightlyPrice: 75 } });
    getProfile.mockResolvedValue(profile());
    const { findByTestId } = render(Page);
    await findByTestId("profil-user-rate");
    const badge = await findByTestId("profil-rate-badge");
    expect(badge).toBeTruthy();
    expect(badge.getAttribute("aria-label")).toBe("Tarif personnalisé");
  });

  it("hides profil-rate-badge and falls back to settings.nightlyPrice when effectiveNightlyPrice is undefined", async () => {
    // Default GUEST has no effectiveNightlyPrice.
    getMe.mockResolvedValue({ user: GUEST });
    getProfile.mockResolvedValue(profile());
    const { findByTestId, queryByTestId } = render(Page);
    const rateEl = await findByTestId("profil-user-rate");
    // Falls back to default settings.nightlyPrice = 89.
    expect(rateEl.textContent).toContain("89");
    expect(queryByTestId("profil-rate-badge")).toBeNull();
  });

  it("hides profil-rate-badge when effectiveNightlyPrice equals settings.nightlyPrice", async () => {
    getMe.mockResolvedValue({ user: { ...GUEST, effectiveNightlyPrice: 89 } });
    getProfile.mockResolvedValue(profile());
    const { findByTestId, queryByTestId } = render(Page);
    await findByTestId("profil-user-rate");
    expect(queryByTestId("profil-rate-badge")).toBeNull();
  });

  it("renders the rate as text, never as HTML", async () => {
    getMe.mockResolvedValue({ user: { ...GUEST, effectiveNightlyPrice: 75 } });
    getProfile.mockResolvedValue(profile());
    const { findByTestId } = render(Page);
    const rateEl = await findByTestId("profil-user-rate");
    expect(rateEl.querySelector("script")).toBeNull();
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
