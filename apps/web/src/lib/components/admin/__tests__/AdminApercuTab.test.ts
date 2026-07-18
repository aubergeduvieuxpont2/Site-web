/**
 * AdminApercuTab — the admin dashboard "Aperçu" panel (now the DEFAULT tab).
 *
 * The tab reaches the network only through the typed `adminGetDashboard` API
 * helper, so mocking `$lib/api` fully isolates its rendering behaviour. `isError`
 * keeps its real semantics so the success/error branch is exercised faithfully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import type { ApiError, DashboardResponse } from "$lib/api";

const adminGetDashboard = vi.fn();

vi.mock("$lib/api", () => ({
  adminGetDashboard: (...a: unknown[]) => adminGetDashboard(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import AdminApercuTab from "../AdminApercuTab.svelte";

function dashboard(over: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    guestsThisWeek: 5,
    guestsLastWeek: 3,
    next7Days: [
      { date: "2026-07-20", available: 4 },
      { date: "2026-07-21", available: 2 },
      { date: "2026-07-22", available: 0 },
      { date: "2026-07-23", available: 6 },
      { date: "2026-07-24", available: 1 },
      { date: "2026-07-25", available: 3 },
      { date: "2026-07-26", available: 5 },
    ],
    occupancy: { currentMonth: 0.62, previousMonth: 0.5, sameMonthLastYear: 0.4 },
    returningCustomers: 7,
    ...over,
  };
}

beforeEach(() => {
  adminGetDashboard.mockReset();
  adminGetDashboard.mockResolvedValue(dashboard());
});

afterEach(() => {
  cleanup();
});

// ── Stat cards ────────────────────────────────────────────────────────────────

describe("AdminApercuTab — stat cards", () => {
  it("renders the three stat cards from the dashboard payload", async () => {
    const { findByTestId } = render(AdminApercuTab);
    expect((await findByTestId("guests-this-week")).textContent?.trim()).toBe("5");
    expect((await findByTestId("occupancy-current")).textContent?.trim()).toBe("62 %");
    expect((await findByTestId("returning-customers")).textContent?.trim()).toBe("7");
  });

  it("calls adminGetDashboard once on mount", async () => {
    render(AdminApercuTab);
    // Wait for the async load to settle.
    await vi.waitFor(() => expect(adminGetDashboard).toHaveBeenCalledTimes(1));
  });
});

// ── Null occupancy ratios ───────────────────────────────────────────────────────

describe("AdminApercuTab — null occupancy", () => {
  it("renders — for a null occupancy ratio (zero-denominator period)", async () => {
    adminGetDashboard.mockResolvedValue(
      dashboard({
        occupancy: { currentMonth: null, previousMonth: null, sameMonthLastYear: null },
      }),
    );
    const { findByTestId } = render(AdminApercuTab);
    expect((await findByTestId("occupancy-current")).textContent?.trim()).toBe("—");
  });
});

// ── 7-day availability strip ────────────────────────────────────────────────────

describe("AdminApercuTab — 7-day availability strip", () => {
  it("renders one row per night (7 entries)", async () => {
    const { findAllByTestId } = render(AdminApercuTab);
    const rows = await findAllByTestId("avail-row");
    expect(rows).toHaveLength(7);
  });

  it("shows the empty message when there are no nights", async () => {
    adminGetDashboard.mockResolvedValue(dashboard({ next7Days: [] }));
    const { findByTestId, queryAllByTestId } = render(AdminApercuTab);
    await findByTestId("apercu-avail");
    expect(queryAllByTestId("avail-row")).toHaveLength(0);
  });
});

// ── Error state ─────────────────────────────────────────────────────────────────

describe("AdminApercuTab — error state", () => {
  it("shows an error banner when the API returns an error", async () => {
    adminGetDashboard.mockResolvedValue({ error: "Accès refusé" });
    const { findByTestId } = render(AdminApercuTab);
    const banner = await findByTestId("apercu-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("Accès refusé");
  });

  it("shows a network error message when the request throws", async () => {
    adminGetDashboard.mockRejectedValue(new Error("boom"));
    const { findByTestId } = render(AdminApercuTab);
    const banner = await findByTestId("apercu-error");
    expect(banner.textContent).toContain("Réseau indisponible");
  });
});
