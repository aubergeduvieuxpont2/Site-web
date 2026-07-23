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
const forgotPassword = vi.fn();
const changeProfileEmail = vi.fn();
const updateLocale = vi.fn();
const updateContactProfile = vi.fn();
vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
  logout: (...a: unknown[]) => logout(...a),
  forgotPassword: (...a: unknown[]) => forgotPassword(...a),
  changeProfileEmail: (...a: unknown[]) => changeProfileEmail(...a),
  updateLocale: (...a: unknown[]) => updateLocale(...a),
  updateContactProfile: (...a: unknown[]) => updateContactProfile(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mocks are registered so the component binds to them.
import Page from "../profil/+page.svelte";

const GUEST: User = { id: 2, email: "guest@example.com", name: "Marie Guest", role: "guest", locale: "fr" };
const ADMIN: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin", locale: "fr" };

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
  forgotPassword.mockReset();
  changeProfileEmail.mockReset();
  updateLocale.mockReset();
  updateContactProfile.mockReset();
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: GUEST });
  getProfile.mockResolvedValue(profile());
  logout.mockResolvedValue({ ok: true });
  forgotPassword.mockResolvedValue({ ok: true });
  changeProfileEmail.mockResolvedValue({ ok: true, pending: true });
  updateLocale.mockResolvedValue({ ok: true, locale: "fr" as const });
  updateContactProfile.mockResolvedValue({ user: GUEST });
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

  it("loads the profile page for an admin and shows the admin dashboard shortcut", async () => {
    getMe.mockResolvedValue({ user: ADMIN });
    getProfile.mockResolvedValue(profile({ user: ADMIN }));
    const { findByTestId, queryByTestId } = render(Page);
    // Admins see the full profile — no redirect to /admin.
    expect(await findByTestId("profil-content")).toBeTruthy();
    // Profile IS fetched — admin uses the same unified page.
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    // Admin shortcut link is present.
    const adminLink = await findByTestId("profil-admin-link");
    expect(adminLink.getAttribute("href")).toBe("/admin");
    // No accidental redirect to /admin.
    expect(goto).not.toHaveBeenCalledWith("/admin");
    // Guest-only profil-role-badge still renders but with admin label.
    const badge = queryByTestId("profil-role-badge");
    expect(badge?.textContent).toContain("Administrateur");
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

describe("page-profil password reset", () => {
  it("renders the password reset button (not an old two-field form)", async () => {
    const utils = render(Page);
    expect(await utils.findByTestId("profil-pwd-heading")).toBeTruthy();
    const btn = await utils.findByTestId("profil-pwd-reset-btn");
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
    // The old two-field password-change form must no longer exist.
    expect(utils.queryByTestId("profil-pwd-form")).toBeNull();
    expect(utils.queryByTestId("profil-pwd-current-input")).toBeNull();
    expect(utils.queryByTestId("profil-pwd-new-input")).toBeNull();
  });

  it("clicking the reset button calls forgotPassword with the current user email", async () => {
    const utils = render(Page);
    await fireEvent.click(await utils.findByTestId("profil-pwd-reset-btn"));
    await waitFor(() =>
      expect(forgotPassword).toHaveBeenCalledWith("guest@example.com"),
    );
  });

  it("shows the generic success message after clicking — button disappears", async () => {
    const utils = render(Page);
    await fireEvent.click(await utils.findByTestId("profil-pwd-reset-btn"));
    const ok = await utils.findByTestId("profil-pwd-reset-success");
    expect(ok.getAttribute("role")).toBe("status");
    expect(ok.textContent).toContain("réinitialisation");
    // Button is hidden after success (fire-and-forget single-click UX).
    await waitFor(() =>
      expect(utils.queryByTestId("profil-pwd-reset-btn")).toBeNull(),
    );
  });

  it("shows success even when forgotPassword returns an error (INV-no-enumeration)", async () => {
    // The server always responds 200; client never reveals whether address exists.
    forgotPassword.mockResolvedValue({ error: "quelconque" });
    const utils = render(Page);
    await fireEvent.click(await utils.findByTestId("profil-pwd-reset-btn"));
    const ok = await utils.findByTestId("profil-pwd-reset-success");
    expect(ok.getAttribute("role")).toBe("status");
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

  it("submits valid input, shows the pending-confirmation notice, and clears fields", async () => {
    const utils = render(Page);
    await fillAndSubmit(utils.findByTestId, "new@example.com", "current-pass");
    await waitFor(() =>
      expect(changeProfileEmail).toHaveBeenCalledWith("new@example.com", "current-pass"),
    );
    const ok = await utils.findByTestId("profil-email-success");
    expect(ok.getAttribute("role")).toBe("status");
    // Step 1 done: confirmation link sent to the CURRENT (old) address.
    expect(ok.textContent).toContain("adresse actuelle");
    // The change is pending — the displayed email + current-address hint must
    // NOT switch to the new address until the link is followed.
    expect((await utils.findByTestId("profil-user-email")).textContent).toContain(
      "guest@example.com",
    );
    expect((await utils.findByTestId("profil-email-current")).textContent).toContain(
      "guest@example.com",
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

// ── Contact info (OP-Profile.updateContact) ───────────────────────────────

describe("page-profil contact section", () => {
  const RICH_GUEST: User = {
    ...GUEST,
    first_name: "Marie",
    last_name: "Dupont",
    phone: "418-555-0001",
    company: "ACME Corp",
    address_street: "123 Rue Principale",
    address_city: "Saint-Raymond",
    address_province: "QC",
    address_postal_code: "G3L 1A1",
  };

  it("renders contact fields in display mode by default", async () => {
    getProfile.mockResolvedValue(profile({ user: RICH_GUEST }));
    const utils = render(Page);
    expect(await utils.findByTestId("profil-contact-display")).toBeTruthy();
    expect((await utils.findByTestId("profil-contact-firstName")).textContent).toBe("Marie");
    expect((await utils.findByTestId("profil-contact-lastName")).textContent).toBe("Dupont");
    expect((await utils.findByTestId("profil-contact-phone")).textContent).toBe("418-555-0001");
    expect((await utils.findByTestId("profil-contact-company")).textContent).toBe("ACME Corp");
    expect((await utils.findByTestId("profil-contact-addressStreet")).textContent).toBe(
      "123 Rue Principale",
    );
    // Edit form not visible in display mode.
    expect(utils.queryByTestId("profil-contact-form")).toBeNull();
  });

  it("shows — for null contact fields in display mode", async () => {
    const utils = render(Page);
    expect((await utils.findByTestId("profil-contact-firstName")).textContent).toBe("—");
    expect((await utils.findByTestId("profil-contact-phone")).textContent).toBe("—");
    expect((await utils.findByTestId("profil-contact-addressStreet")).textContent).toBe("—");
    expect((await utils.findByTestId("profil-contact-addressCity")).textContent).toBe("—");
    expect((await utils.findByTestId("profil-contact-addressPostalCode")).textContent).toBe("—");
  });

  it("clicking Edit opens the inline edit form and hides display mode", async () => {
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    expect(await utils.findByTestId("profil-contact-form")).toBeTruthy();
    expect(utils.queryByTestId("profil-contact-display")).toBeNull();
  });

  it("clicking Cancel returns to display mode without calling the API", async () => {
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    await utils.findByTestId("profil-contact-form");
    await fireEvent.click(utils.getByTestId("profil-contact-cancel-btn"));
    expect(await utils.findByTestId("profil-contact-display")).toBeTruthy();
    expect(utils.queryByTestId("profil-contact-form")).toBeNull();
    expect(updateContactProfile).not.toHaveBeenCalled();
  });

  it("edit form renders all eight contact fields including address", async () => {
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    expect(await utils.findByTestId("profil-edit-firstName")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-lastName")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-phone")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-company")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-addressStreet")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-addressCity")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-addressProvince")).toBeTruthy();
    expect(await utils.findByTestId("profil-edit-addressPostalCode")).toBeTruthy();
  });

  it("submitting the form calls updateContactProfile with trimmed values", async () => {
    const updatedUser: User = { ...GUEST, first_name: "Jean", last_name: "Martin" };
    updateContactProfile.mockResolvedValue({ user: updatedUser });

    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));

    const firstInput = (await utils.findByTestId("profil-edit-firstName")) as HTMLInputElement;
    await fireEvent.input(firstInput, { target: { value: "  Jean  " } });
    const lastInput = (await utils.findByTestId("profil-edit-lastName")) as HTMLInputElement;
    await fireEvent.input(lastInput, { target: { value: "Martin" } });

    await fireEvent.submit(utils.getByTestId("profil-contact-form"));

    await waitFor(() =>
      expect(updateContactProfile).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Jean", lastName: "Martin" }),
      ),
    );
    // Returns to display mode on success.
    expect(await utils.findByTestId("profil-contact-display")).toBeTruthy();
    expect(utils.queryByTestId("profil-contact-form")).toBeNull();
  });

  it("shows success confirmation after a successful save", async () => {
    updateContactProfile.mockResolvedValue({ user: GUEST });
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    await fireEvent.submit(await utils.findByTestId("profil-contact-form"));
    const ok = await utils.findByTestId("profil-contact-success");
    expect(ok.getAttribute("role")).toBe("status");
    expect(ok.textContent).toContain("mis à jour");
  });

  it("shows API error in the form and stays in edit mode on failure", async () => {
    updateContactProfile.mockResolvedValue({ error: "Erreur de mise à jour." });
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    await fireEvent.submit(await utils.findByTestId("profil-contact-form"));
    const err = await utils.findByTestId("profil-contact-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Erreur de mise à jour.");
    // Stays in edit mode.
    expect(utils.queryByTestId("profil-contact-form")).toBeTruthy();
  });

  it("renders error message as text, never as HTML (XSS guard)", async () => {
    updateContactProfile.mockResolvedValue({ error: "<img src=x onerror=alert(1)>" });
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    await fireEvent.submit(await utils.findByTestId("profil-contact-form"));
    const err = await utils.findByTestId("profil-contact-error");
    expect(err.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(err.querySelector("img")).toBeNull();
  });

  it("empty string inputs are sent as null (clear the field)", async () => {
    updateContactProfile.mockResolvedValue({ user: GUEST });
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    // All fields start empty → trim → null.
    await fireEvent.submit(await utils.findByTestId("profil-contact-form"));
    await waitFor(() =>
      expect(updateContactProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: null,
          lastName: null,
          phone: null,
          company: null,
          addressStreet: null,
        }),
      ),
    );
  });

  it("INV-contact-whitelist: updateContactProfile is never called with email, role, or locale", async () => {
    updateContactProfile.mockResolvedValue({ user: GUEST });
    const utils = render(Page);
    await utils.findByTestId("profil-contact-display");
    await fireEvent.click(utils.getByTestId("profil-contact-edit-btn"));
    await fireEvent.submit(await utils.findByTestId("profil-contact-form"));
    await waitFor(() => expect(updateContactProfile).toHaveBeenCalledTimes(1));
    const [arg] = updateContactProfile.mock.calls[0] as [Record<string, unknown>];
    expect(arg).not.toHaveProperty("email");
    expect(arg).not.toHaveProperty("role");
    expect(arg).not.toHaveProperty("locale");
    expect(arg).not.toHaveProperty("password");
  });
});

// ── Language (locale) selector ────────────────────────────────────────────

describe("page-profil locale selector", () => {
  it("renders the language selector with FR and EN buttons", async () => {
    const utils = render(Page);
    expect(await utils.findByTestId("profil-locale-selector")).toBeTruthy();
    expect(await utils.findByTestId("profil-locale-fr")).toBeTruthy();
    expect(await utils.findByTestId("profil-locale-en")).toBeTruthy();
  });

  it("FR button has aria-pressed=true by default (default locale is fr)", async () => {
    const utils = render(Page);
    const frBtn = await utils.findByTestId("profil-locale-fr");
    expect(frBtn.getAttribute("aria-pressed")).toBe("true");
    const enBtn = await utils.findByTestId("profil-locale-en");
    expect(enBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking EN calls updateLocale with 'en'", async () => {
    const utils = render(Page);
    await fireEvent.click(await utils.findByTestId("profil-locale-en"));
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith("en"),
    );
  });

  it("clicking FR calls updateLocale with 'fr'", async () => {
    const utils = render(Page);
    await fireEvent.click(await utils.findByTestId("profil-locale-fr"));
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith("fr"),
    );
  });
});

// ── Two-step email change messaging ──────────────────────────────────────

describe("page-profil two-step email hint (INV-authorize-before-new)", () => {
  it("shows step-1 hint explaining a link goes to the current address", async () => {
    const utils = render(Page);
    const hint = await utils.findByTestId("profil-email-step-hint");
    // Hint must mention the OLD address authorizing the change (INV-authorize-before-new).
    expect(hint.textContent).toContain("adresse actuelle");
    expect(hint.textContent).toContain("autoriser");
  });

  it("success banner after step-1 says link was sent to current address, not new address", async () => {
    const utils = render(Page);
    const em = (await utils.findByTestId("profil-email-new-input")) as HTMLInputElement;
    const pw = (await utils.findByTestId("profil-email-password-input")) as HTMLInputElement;
    await fireEvent.input(em, { target: { value: "new@example.com" } });
    await fireEvent.input(pw, { target: { value: "pass" } });
    await fireEvent.submit(await utils.findByTestId("profil-email-form"));
    const ok = await utils.findByTestId("profil-email-success");
    // Step 1 success: link sent to old address, NOT to new address yet.
    expect(ok.textContent).toContain("adresse actuelle");
    // The new address must NOT appear in the success message (INV-authorize-before-new).
    expect(ok.textContent).not.toContain("new@example.com");
  });
});
