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
  reviewRequestDelayDays: 0,
  reviewReminderDelayDays: 7,
  reviewSuppressionMonths: 6,
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

  it("renders the three review timing inputs", async () => {
    const { findByTestId } = render(AdminParametresTab);
    await findByTestId("input-review-request-delay");
    await findByTestId("input-review-reminder-delay");
    await findByTestId("input-review-suppression-months");
  });

  it("explains what 0 means for the reminder and the suppression window", async () => {
    const { findByTestId, container } = render(AdminParametresTab);
    // Wait for load so the fields (and their hints) are present.
    await findByTestId("input-review-reminder-delay");
    expect(container.textContent).toContain("0 = aucun rappel");
    expect(container.textContent).toContain("0 = aucune suppression");
  });

  it("round-trips the review timing settings from load through save", async () => {
    mockAdminGetSettings.mockResolvedValue({
      ...ADMIN_SETTINGS,
      reviewRequestDelayDays: 2,
      reviewReminderDelayDays: 10,
      reviewSuppressionMonths: 3,
    });
    mockAdminUpdateSettings.mockResolvedValue({
      ...ADMIN_SETTINGS,
      reviewRequestDelayDays: 2,
      reviewReminderDelayDays: 10,
      reviewSuppressionMonths: 3,
    });

    const { findByTestId } = render(AdminParametresTab);

    const requestDelayInput = (await findByTestId("input-review-request-delay")) as HTMLInputElement;
    const reminderDelayInput = (await findByTestId("input-review-reminder-delay")) as HTMLInputElement;
    const suppressionInput = (await findByTestId("input-review-suppression-months")) as HTMLInputElement;

    // Values loaded from the API must reach the bound inputs.
    expect(requestDelayInput.value).toBe("2");
    expect(reminderDelayInput.value).toBe("10");
    expect(suppressionInput.value).toBe("3");

    const saveBtn = await findByTestId("settings-save-btn");
    await fireEvent.click(saveBtn);

    await findByTestId("settings-saved");
    expect(mockAdminUpdateSettings).toHaveBeenCalledTimes(1);
    const payload = mockAdminUpdateSettings.mock.calls[0][0];
    expect(payload.reviewRequestDelayDays).toBe(2);
    expect(payload.reviewReminderDelayDays).toBe(10);
    expect(payload.reviewSuppressionMonths).toBe(3);
  });
});
