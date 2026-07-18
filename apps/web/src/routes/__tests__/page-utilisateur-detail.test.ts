import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import type { AdminUserDetail, ApiError } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock SvelteKit navigation + the `page` store (route param `id`). The page
// reads `$page.params.id`; a minimal readable is enough. Same pattern as
// page-reinitialisation.test.ts / error-page.test.ts.
// ---------------------------------------------------------------------------
const goto = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock("$app/navigation", () => ({
  goto: (...args: unknown[]) => goto(...args),
}));

let mockParams: Record<string, string> = { id: "7" };
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ params: mockParams });
      return () => {};
    },
  },
}));

// The settings store is a plain reactive object; stub it so the component reads
// a deterministic public price without touching the network.
vi.mock("$lib/settings.svelte", () => ({
  settings: { nightlyPrice: 89, contactEmail: "x@y.z", marketingRoomCount: 12, publicRoomCount: 12 },
}));

// ---------------------------------------------------------------------------
// Mock the typed API client. `isError` keeps real semantics so the page's
// success/error branching is exercised faithfully.
// ---------------------------------------------------------------------------
const getMe = vi.fn();
const adminGetUser = vi.fn();
const adminSetUserPricing = vi.fn();
vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  adminGetUser: (...a: unknown[]) => adminGetUser(...a),
  adminSetUserPricing: (...a: unknown[]) => adminSetUserPricing(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as ApiError).error === "string",
}));

// Import AFTER the mocks are registered so the component binds to them.
import Page from "../admin/utilisateurs/[id]/+page.svelte";

const ADMIN = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" as const };

function detail(over: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 7,
    email: "jean@example.com",
    name: "Jean Tremblay",
    role: "guest",
    first_name: "Jean",
    last_name: "Tremblay",
    phone: "418-555-0100",
    company: "Auberge Inc.",
    created_at: "2026-07-01T12:00:00.000Z",
    hubspot_contact_id: "hs-42",
    discount_percent: null,
    fixed_nightly_price: null,
    fixed_weekly_price: null,
    ...over,
  };
}

beforeEach(() => {
  mockParams = { id: "7" };
  goto.mockClear();
  getMe.mockReset();
  adminGetUser.mockReset();
  adminSetUserPricing.mockReset();
  getMe.mockResolvedValue({ user: ADMIN });
  adminGetUser.mockResolvedValue({ user: detail(), hubspot: null });
  adminSetUserPricing.mockResolvedValue({ user: detail() });
});

afterEach(() => {
  cleanup();
});

describe("page-utilisateur-detail auth gate", () => {
  it("redirects non-admins to / and never fetches the user", async () => {
    getMe.mockResolvedValue({ user: { ...ADMIN, role: "guest" } });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(adminGetUser).not.toHaveBeenCalled();
  });

  it("redirects to / when getMe returns an error (unauthenticated)", async () => {
    getMe.mockResolvedValue({ error: "Non authentifié" });
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(adminGetUser).not.toHaveBeenCalled();
  });

  it("redirects to / when getMe throws (network failure)", async () => {
    getMe.mockRejectedValue(new Error("boom"));
    render(Page);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(adminGetUser).not.toHaveBeenCalled();
  });
});

describe("page-utilisateur-detail content", () => {
  it("fetches the user by the route param id", async () => {
    const { findByTestId } = render(Page);
    await findByTestId("local-fields-card");
    expect(adminGetUser).toHaveBeenCalledWith("7");
  });

  it("renders local fields and the email in the topbar title", async () => {
    const { findByTestId } = render(Page);
    const title = await findByTestId("topbar-title");
    expect(title.textContent).toContain("jean@example.com");
    const nameRow = await findByTestId("user-field-name");
    expect(nameRow.textContent).toContain("Jean Tremblay");
    const phoneRow = await findByTestId("user-field-phone");
    expect(phoneRow.textContent).toContain("418-555-0100");
    const hsIdRow = await findByTestId("user-field-hubspot-id");
    expect(hsIdRow.textContent).toContain("hs-42");
  });

  it("falls back to `name` when first/last are absent, and — for null fields", async () => {
    adminGetUser.mockResolvedValue({
      user: detail({ first_name: null, last_name: null, name: "Alias Only", phone: null, company: null }),
      hubspot: null,
    });
    const { findByTestId } = render(Page);
    const nameRow = await findByTestId("user-field-name");
    expect(nameRow.textContent).toContain("Alias Only");
    const phoneRow = await findByTestId("user-field-phone");
    expect(phoneRow.textContent).toContain("—");
  });

  it("renders the role badge with the French label", async () => {
    adminGetUser.mockResolvedValue({ user: detail({ role: "admin" }), hubspot: null });
    const { findByTestId } = render(Page);
    const roleRow = await findByTestId("user-field-role");
    expect(roleRow.textContent).toContain("Administrateur");
  });

  it("has a back link pointing at /admin", async () => {
    const { findByTestId } = render(Page);
    const back = await findByTestId("back-link");
    expect(back.getAttribute("href")).toBe("/admin");
  });
});

describe("page-utilisateur-detail HubSpot card", () => {
  it("shows the empty state when hubspot is null", async () => {
    adminGetUser.mockResolvedValue({ user: detail(), hubspot: null });
    const { findByTestId, queryByTestId } = render(Page);
    await findByTestId("hubspot-empty");
    expect(queryByTestId("hubspot-properties-table")).toBeNull();
  });

  it("renders a properties table when hubspot data is present", async () => {
    adminGetUser.mockResolvedValue({
      user: detail(),
      hubspot: { email: "jean@example.com", lifecyclestage: "customer" },
    });
    const { findByTestId } = render(Page);
    const table = await findByTestId("hubspot-properties-table");
    expect(table).toBeTruthy();
    expect((await findByTestId("hubspot-prop-email")).textContent).toContain(
      "jean@example.com",
    );
    expect((await findByTestId("hubspot-prop-lifecyclestage")).textContent).toContain(
      "customer",
    );
  });
});

describe("page-utilisateur-detail error state", () => {
  it("shows the error message when adminGetUser returns an error", async () => {
    adminGetUser.mockResolvedValue({ error: "Utilisateur introuvable" });
    const { findByTestId } = render(Page);
    const err = await findByTestId("error-message");
    expect(err.textContent).toContain("Utilisateur introuvable");
    expect(err.getAttribute("role")).toBe("alert");
  });

  it("shows a network error message when adminGetUser throws", async () => {
    adminGetUser.mockRejectedValue(new Error("offline"));
    const { findByTestId } = render(Page);
    const err = await findByTestId("error-message");
    expect(err.textContent).toContain("réseau");
  });
});
