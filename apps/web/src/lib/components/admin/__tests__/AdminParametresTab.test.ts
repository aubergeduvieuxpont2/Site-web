import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { AdminSettings, ApiError } from "$lib/api";

// Spy for the public settings refresher — the component imports it as
// `loadSettings as refreshPublicSettings` from $lib/settings.svelte.
const mockRefreshPublicSettings = vi.fn();

vi.mock("$lib/settings.svelte", () => ({
  settings: {
    nightlyPrice: 89,
    contactEmail: "info@aubergeduvieuxpont.ca",
    contactPhone: "418 655-1212",
    publicRoomCount: 12,
    tps: 5,
    tvq: 9.975,
    accommodationTax: 3.5,
    weeklyPrice: 560,
    reservationsEnabled: true,
  },
  mergeSettings: vi.fn(),
  loadSettings: (...args: unknown[]) => mockRefreshPublicSettings(...args),
}));

// Mock the API client; keep real isError narrowing so the component's
// success/error branching is exercised faithfully.
const mockAdminGetSettings = vi.fn();
const mockAdminUpdateSettings = vi.fn();
const mockChangePassword = vi.fn();

vi.mock("$lib/api", () => ({
  adminGetSettings: (...args: unknown[]) => mockAdminGetSettings(...args),
  adminUpdateSettings: (...args: unknown[]) => mockAdminUpdateSettings(...args),
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as ApiError).error === "string",
}));

// Import the component AFTER mocks so it binds to the mocked modules.
import AdminParametresTab from "../AdminParametresTab.svelte";

const ADMIN_SETTINGS: AdminSettings = {
  nightlyPrice: 89,
  weeklyPrice: 560,
  contactEmail: "info@aubergeduvieuxpont.ca",
  contactPhone: "418 655-1212",
  tps: 5,
  tvq: 9.975,
  accommodationTax: 3.5,
  assignableRoomCount: 12,
  reservationsEnabled: true,
  emailConfirmationEnabled: false,
  emailPasswordResetEnabled: false,
  emailRoomAssignmentEnabled: false,
  emailWelcomeEnabled: false,
  emailReviewRequestEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockAdminGetSettings.mockResolvedValue(ADMIN_SETTINGS);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

describe("AdminParametresTab", () => {
  it("appelle le rafraîchissement des paramètres publics après une sauvegarde réussie", async () => {
    mockAdminUpdateSettings.mockResolvedValue(ADMIN_SETTINGS);
    mockRefreshPublicSettings.mockResolvedValue(undefined);

    const { findByTestId } = render(AdminParametresTab);

    // Wait for the initial load to complete before attempting a save.
    const saveBtn = await findByTestId("settings-save-btn");
    await fireEvent.click(saveBtn);

    await findByTestId("settings-saved");
    expect(mockAdminUpdateSettings).toHaveBeenCalledTimes(1);
    expect(mockRefreshPublicSettings).toHaveBeenCalledTimes(1);

    // Ordering: the save must complete (adminUpdateSettings) before the public
    // refresher fires at the post-save seam.
    expect(mockAdminUpdateSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mockRefreshPublicSettings.mock.invocationCallOrder[0],
    );
  });

  it("affiche le succès de la sauvegarde même si le rafraîchissement public échoue", async () => {
    mockAdminUpdateSettings.mockResolvedValue(ADMIN_SETTINGS);
    // The public refresher rejects; the component must absorb the rejection so it
    // cannot flip saveError or revert the saved state.
    mockRefreshPublicSettings.mockRejectedValue(new Error("Réseau indisponible"));

    const { findByTestId, queryByTestId } = render(AdminParametresTab);

    const saveBtn = await findByTestId("settings-save-btn");
    await fireEvent.click(saveBtn);

    // Confirm the refresher was reached (the seam was executed) before verifying
    // that its rejected promise did not pollute the save UI.
    await waitFor(() => expect(mockRefreshPublicSettings).toHaveBeenCalledTimes(1));

    // The French success banner must still be visible despite the rejected refresh.
    await findByTestId("settings-saved");

    // No save error must surface — INV-success-authoritative must hold.
    expect(queryByTestId("params-save-error")).toBeNull();
  });
});
