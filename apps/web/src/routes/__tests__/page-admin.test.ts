import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { ReservationRow, OutboxRow, User, ApiError, AdminSettings } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the typed API client. The admin page must reach the network only
// through these helpers — never a raw fetch — so mocking the module fully
// isolates the component's behaviour. `isError` keeps the real semantics so
// the component's success/error branching is exercised faithfully.
// ---------------------------------------------------------------------------
const getMe = vi.fn();
const adminReservations = vi.fn();
const adminOutbox = vi.fn();
const requeueOutbox = vi.fn();
const adminGetSettings = vi.fn();
const adminUpdateSettings = vi.fn();
const changePassword = vi.fn();
const adminGetDashboard = vi.fn();

vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  adminReservations: (...a: unknown[]) => adminReservations(...a),
  adminOutbox: (...a: unknown[]) => adminOutbox(...a),
  requeueOutbox: (...a: unknown[]) => requeueOutbox(...a),
  adminGetSettings: (...a: unknown[]) => adminGetSettings(...a),
  adminUpdateSettings: (...a: unknown[]) => adminUpdateSettings(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  adminGetDashboard: (...a: unknown[]) => adminGetDashboard(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import Page from "../admin/+page.svelte";

const ADMIN: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin", locale: "fr" };
const GUEST: User = { id: 2, email: "guest@example.com", name: "Guest", role: "guest", locale: "fr" };

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

function adminSettings(over: Partial<AdminSettings> = {}): AdminSettings {
  return {
    nightlyPrice: 89,
    weeklyPrice: 560,
    contactEmail: "info@aubergeduvieuxpont.ca",
    contactPhone: "418 655-1212",
    marketingRoomCount: 12,
    assignableRoomCount: 12,
    tps: 5,
    tvq: 9.975,
    accommodationTax: 3.5,
    reservationsEnabled: true,
    emailConfirmationEnabled: false,
    emailPasswordResetEnabled: false,
    emailRoomAssignmentEnabled: false,
    emailWelcomeEnabled: false,
    ...over,
  };
}

function outbox(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: 500,
    kind: "contact.upsert",
    status: "failed",
    attempts: 3,
    dedupe_key: null,
    last_error: "HubSpot 429 rate limited",
    hubspot_id: null,
    next_attempt_at: "2026-07-02T09:00:00.000Z",
    created_at: "2026-07-01T09:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  getMe.mockReset();
  adminReservations.mockReset();
  adminOutbox.mockReset();
  requeueOutbox.mockReset();
  adminGetSettings.mockReset();
  adminUpdateSettings.mockReset();
  changePassword.mockReset();
  adminGetDashboard.mockReset();
  // Sensible defaults; individual tests override.
  getMe.mockResolvedValue({ user: ADMIN });
  adminGetDashboard.mockResolvedValue({
    guestsThisWeek: 4,
    guestsLastWeek: 2,
    next7Days: [],
    occupancy: { currentMonth: 0.5, previousMonth: 0.4, sameMonthLastYear: null },
    returningCustomers: 3,
  });
  adminReservations.mockResolvedValue({ reservations: [reservation()] });
  adminOutbox.mockResolvedValue({ rows: [outbox()] });
  requeueOutbox.mockResolvedValue({ row: outbox({ status: "pending", attempts: 0, last_error: null }) });
  adminGetSettings.mockResolvedValue(adminSettings());
  adminUpdateSettings.mockImplementation(async (s: AdminSettings) => s);
  changePassword.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe("page-admin auth gate", () => {
  it("shows a denied state (not a redirect) for a non-admin user", async () => {
    getMe.mockResolvedValue({ user: GUEST });
    const { findByTestId, queryByTestId } = render(Page);

    expect(await findByTestId("admin-denied")).toBeTruthy();
    expect(await findByTestId("denied-msg")).toBeTruthy();
    // No admin data is ever requested for a non-admin.
    expect(adminReservations).not.toHaveBeenCalled();
    expect(queryByTestId("panel-reservations")).toBeNull();
  });

  it("shows the denied state when getMe returns an error (unauthenticated)", async () => {
    getMe.mockResolvedValue({ error: "Non authentifié" });
    const { findByTestId } = render(Page);
    expect(await findByTestId("admin-denied")).toBeTruthy();
    expect(adminReservations).not.toHaveBeenCalled();
  });

  it("renders the dashboard and loads reservations for an admin", async () => {
    const { findByTestId } = render(Page);
    expect(await findByTestId("panel-reservations")).toBeTruthy();
    await waitFor(() => expect(adminReservations).toHaveBeenCalledTimes(1));
    expect(await findByTestId("reservations-table")).toBeTruthy();
  });
});

describe("page-admin reservations", () => {
  it("renders a row per reservation and a live count", async () => {
    adminReservations.mockResolvedValue({
      reservations: [reservation({ id: 1 }), reservation({ id: 2, name: "Marie" })],
    });
    const { findByTestId, findAllByTestId } = render(Page);
    const rows = await findAllByTestId("reservation-row");
    expect(rows).toHaveLength(2);
    const count = await findByTestId("reservations-count");
    expect(count.textContent).toContain("2");
  });

  it("surfaces an error banner when the reservations request fails", async () => {
    adminReservations.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId } = render(Page);
    const banner = await findByTestId("reservations-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("Erreur 500");
  });

  it("debounces the search input and queries by the trimmed term", async () => {
    vi.useFakeTimers();
    try {
      const { findByTestId, getByTestId } = render(Page);
      // Flush onMount (getMe + initial load) under fake timers.
      await vi.waitFor(() => expect(adminReservations).toHaveBeenCalledTimes(1));
      const input = getByTestId("search-input") as HTMLInputElement;
      await fireEvent.input(input, { target: { value: "  Jean  " } });
      // Not yet — still within the 300ms debounce window.
      expect(adminReservations).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(300);
      await vi.waitFor(() => expect(adminReservations).toHaveBeenCalledTimes(2));
      expect(adminReservations).toHaveBeenLastCalledWith("Jean");
      await findByTestId("reservations-table");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("page-admin outbox tab", () => {
  it("loads the outbox only after switching to its tab", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await findByTestId("panel-reservations");
    expect(adminOutbox).not.toHaveBeenCalled();

    await fireEvent.click(getByTestId("tab-outbox"));
    await waitFor(() => expect(adminOutbox).toHaveBeenCalledTimes(1));
    expect(await findByTestId("outbox-table")).toBeTruthy();
  });

  it("reloads the outbox when the status filter changes", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    await waitFor(() => expect(adminOutbox).toHaveBeenCalledTimes(1));

    await fireEvent.change(getByTestId("status-filter"), { target: { value: "failed" } });
    await waitFor(() => expect(adminOutbox).toHaveBeenLastCalledWith("failed"));
  });

  it("expands and collapses the last_error detail", async () => {
    const { findByTestId, queryByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    const toggle = await findByTestId("error-toggle");
    expect(queryByTestId("error-detail")).toBeNull();

    await fireEvent.click(toggle);
    const detail = await findByTestId("error-detail");
    expect(detail.textContent).toContain("HubSpot 429 rate limited");
    expect(getByTestId("error-toggle").getAttribute("aria-expanded")).toBe("true");

    await fireEvent.click(getByTestId("error-toggle"));
    await waitFor(() => expect(queryByTestId("error-detail")).toBeNull());
  });

  it("renders the last_error as text content, never as HTML", async () => {
    adminOutbox.mockResolvedValue({
      rows: [outbox({ last_error: "<img src=x onerror=alert(1)>" })],
    });
    const { findByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    await fireEvent.click(await findByTestId("error-toggle"));
    const detail = await findByTestId("error-detail");
    // The payload appears verbatim as text; no <img> element is created.
    expect(detail.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(detail.querySelector("img")).toBeNull();
  });
});

describe("page-admin requeue (optimistic update)", () => {
  it("optimistically flips a failed row to pending and calls requeueOutbox", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    const btn = await findByTestId("requeue-btn");

    await fireEvent.click(btn);
    expect(requeueOutbox).toHaveBeenCalledWith(500);
    await waitFor(() => {
      expect(getByTestId("outbox-row").getAttribute("data-status")).toBe("pending");
    });
    // A pending row no longer offers a requeue action.
    await waitFor(() => expect(document.querySelector("[data-testid='requeue-btn']")).toBeNull());
  });

  it("rolls back to failed when the requeue request errors", async () => {
    requeueOutbox.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    await fireEvent.click(await findByTestId("requeue-btn"));

    await waitFor(() => expect(requeueOutbox).toHaveBeenCalled());
    await waitFor(() => {
      expect(getByTestId("outbox-row").getAttribute("data-status")).toBe("failed");
    });
  });

  it("only renders a requeue button for failed rows", async () => {
    adminOutbox.mockResolvedValue({
      rows: [outbox({ id: 1, status: "done" }), outbox({ id: 2, status: "pending" })],
    });
    const { findByTestId, queryByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-outbox"));
    await findByTestId("outbox-table");
    expect(queryByTestId("requeue-btn")).toBeNull();
  });
});

describe("page-admin default tab", () => {
  it("opens on the Aperçu tab/panel by default (not Réservations)", async () => {
    const { findByTestId, getByTestId } = render(Page);
    const apercuTab = await findByTestId("tab-apercu");
    // Aperçu is the selected tab on first render.
    expect(apercuTab.getAttribute("aria-selected")).toBe("true");
    // Its panel is the visible one; every other panel is hidden.
    expect(getByTestId("panel-apercu").hasAttribute("hidden")).toBe(false);
    expect(getByTestId("panel-reservations").hasAttribute("hidden")).toBe(true);
    // And the Aperçu tab content actually mounts (lazy {#if activeTab}).
    expect(await findByTestId("admin-apercu-tab")).toBeTruthy();
  });
});

describe("page-admin ARIA tab semantics", () => {
  it("marks the active tab with aria-selected and roving tabindex", async () => {
    const { findByTestId, getByTestId } = render(Page);
    const apercuTab = await findByTestId("tab-apercu");
    expect(apercuTab.getAttribute("aria-selected")).toBe("true");
    expect(apercuTab.getAttribute("tabindex")).toBe("0");
    expect(getByTestId("tab-reservations").getAttribute("tabindex")).toBe("-1");

    await fireEvent.click(getByTestId("tab-outbox"));
    await waitFor(() => {
      expect(getByTestId("tab-outbox").getAttribute("aria-selected")).toBe("true");
      expect(getByTestId("tab-apercu").getAttribute("aria-selected")).toBe("false");
    });
  });

  it("moves between tabs with ArrowRight/ArrowLeft", async () => {
    const { findByTestId, getByTestId } = render(Page);
    const apercuTab = await findByTestId("tab-apercu");
    await fireEvent.keyDown(apercuTab, { key: "ArrowRight" });
    await waitFor(() =>
      expect(getByTestId("tab-reservations").getAttribute("aria-selected")).toBe("true"),
    );
    await fireEvent.keyDown(getByTestId("tab-reservations"), { key: "ArrowLeft" });
    await waitFor(() =>
      expect(getByTestId("tab-apercu").getAttribute("aria-selected")).toBe("true"),
    );
  });
});

describe("page-admin tax settings fields", () => {
  it("renders the three tax inputs seeded from the loaded settings", async () => {
    adminGetSettings.mockResolvedValue(
      adminSettings({ tps: 5, tvq: 9.975, accommodationTax: 3.5 }),
    );
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-settings"));
    await waitFor(() => expect(adminGetSettings).toHaveBeenCalled());
    await findByTestId("tps-input");

    expect((getByTestId("tps-input") as HTMLInputElement).value).toBe("5");
    expect((getByTestId("tvq-input") as HTMLInputElement).value).toBe("9.975");
    expect((getByTestId("accommodation-tax-input") as HTMLInputElement).value).toBe("3.5");
  });

  it("shows a French error and blocks save for a negative tax rate", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-settings"));
    await waitFor(() => expect(adminGetSettings).toHaveBeenCalled());
    await findByTestId("tps-input");

    await fireEvent.input(getByTestId("tvq-input"), { target: { value: "-1" } });
    await waitFor(() =>
      expect(getByTestId("tvq-error").textContent).toContain("ne peut pas être négative"),
    );

    await fireEvent.click(getByTestId("settings-save-btn"));
    // A blocked save never reaches the API.
    expect(adminUpdateSettings).not.toHaveBeenCalled();
  });

  it("accepts zero and decimal tax rates and persists them", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-settings"));
    await waitFor(() => expect(adminGetSettings).toHaveBeenCalled());
    await findByTestId("tps-input");

    await fireEvent.input(getByTestId("tps-input"), { target: { value: "0" } });
    await fireEvent.input(getByTestId("tvq-input"), { target: { value: "9.975" } });
    await fireEvent.input(getByTestId("accommodation-tax-input"), { target: { value: "3.5" } });

    await fireEvent.click(getByTestId("settings-save-btn"));

    await waitFor(() => expect(adminUpdateSettings).toHaveBeenCalledTimes(1));
    const sent = adminUpdateSettings.mock.calls[0][0] as AdminSettings;
    expect(sent.tps).toBe(0);
    expect(sent.tvq).toBe(9.975);
    expect(sent.accommodationTax).toBe(3.5);
    // No lingering validation errors after a clean save.
    expect(getByTestId("tps-error").textContent).toBe("");
  });
});

describe("page-admin contact phone", () => {
  it("seeds the phone input from settings and includes it in the save payload", async () => {
    adminGetSettings.mockResolvedValue(adminSettings({ contactPhone: "581 222-3333" }));
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-settings"));
    await waitFor(() => expect(adminGetSettings).toHaveBeenCalled());
    const input = (await findByTestId("input-contact-phone")) as HTMLInputElement;
    expect(input.value).toBe("581 222-3333");

    await fireEvent.click(getByTestId("settings-save-btn"));
    await waitFor(() => expect(adminUpdateSettings).toHaveBeenCalledTimes(1));
    const sent = adminUpdateSettings.mock.calls[0][0] as AdminSettings;
    expect(sent.contactPhone).toBe("581 222-3333");
  });

  it("blocks save with a French error when the phone is empty", async () => {
    adminGetSettings.mockResolvedValue(adminSettings({ contactPhone: "" }));
    const { findByTestId, getByTestId } = render(Page);
    await fireEvent.click(await findByTestId("tab-settings"));
    await waitFor(() => expect(adminGetSettings).toHaveBeenCalled());
    await findByTestId("input-contact-phone");

    await fireEvent.click(getByTestId("settings-save-btn"));
    expect(adminUpdateSettings).not.toHaveBeenCalled();
    expect(getByTestId("error-contact-phone").textContent).toContain("Téléphone requis");
  });
});

describe("page-admin courriels nav link", () => {
  it("renders a link to the email preview page for an admin", async () => {
    const { findByTestId } = render(Page);
    const link = await findByTestId("courriels-nav-link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/admin/courriels");
    expect(link.textContent?.trim()).toBe("Courriels");
  });

  it("keeps the link outside the tablist ARIA region", async () => {
    const { findByTestId, getByRole } = render(Page);
    const link = await findByTestId("courriels-nav-link");
    const tablist = getByRole("tablist");
    // The link must not be a descendant of the tablist — it is a separate
    // navigation affordance, not a tab, so it must not pollute the tab set.
    expect(tablist.contains(link)).toBe(false);
    expect(link.getAttribute("role")).toBeNull();
  });

  it("is not shown to a denied (non-admin) user", async () => {
    getMe.mockResolvedValue({ user: GUEST });
    const { findByTestId, queryByTestId } = render(Page);
    await findByTestId("admin-denied");
    expect(queryByTestId("courriels-nav-link")).toBeNull();
  });
});
