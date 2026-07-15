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
vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
  logout: (...a: unknown[]) => logout(...a),
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
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: GUEST });
  getProfile.mockResolvedValue(profile());
  logout.mockResolvedValue({ ok: true });
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

  it("marks an admin with the admin badge and dashboard shortcut", async () => {
    getMe.mockResolvedValue({ user: ADMIN });
    getProfile.mockResolvedValue(profile({ user: ADMIN }));
    const { findByTestId } = render(Page);
    const badge = await findByTestId("profil-role-badge");
    expect(badge.textContent).toContain("Administrateur");
    expect(badge.className).toContain("profil__role-badge--admin");
    const link = await findByTestId("profil-admin-link");
    expect(link.getAttribute("href")).toBe("/admin");
    expect((await findByTestId("profil-role-label")).textContent).toContain("ADMINISTRATEUR");
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

describe("page-profil HubSpot enrichment", () => {
  it("shows the unavailable state when no contact and no deals", async () => {
    const { findByTestId } = render(Page);
    expect((await findByTestId("profil-hs-empty")).textContent).toContain("Données non disponibles");
  });

  it("renders contact properties and deals when present", async () => {
    getProfile.mockResolvedValue(
      profile({
        hubspot: {
          contact: { lifecyclestage: "customer", country: "Canada" },
          deals: [{ dealname: "Séjour août", amount: "450" }],
        },
      }),
    );
    const { findByTestId, getByTestId } = render(Page);
    expect(await findByTestId("profil-hs-grid")).toBeTruthy();
    expect(getByTestId("profil-hs-prop-lifecyclestage").textContent).toContain("customer");
    expect(getByTestId("profil-hs-deal-0").textContent).toContain("Séjour août");
  });

  it("renders HubSpot property values as text, never as HTML", async () => {
    getProfile.mockResolvedValue(
      profile({ hubspot: { contact: { note: "<img src=x onerror=alert(1)>" }, deals: [] } }),
    );
    const { findByTestId } = render(Page);
    const val = await findByTestId("profil-hs-prop-note");
    expect(val.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(val.querySelector("img")).toBeNull();
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
