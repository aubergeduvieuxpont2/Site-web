import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminDisponibilitesTab from "./AdminDisponibilitesTab.svelte";
import * as api from "$lib/api";
import type { BlackoutRow } from "$lib/api";

// Mock the API client: the component must stay fetch-free and drive purely from
// these injected results. `isError` keeps its real narrowing behaviour so the
// component's success/error branching is exercised faithfully.
vi.mock("$lib/api", () => ({
  adminBlackouts: vi.fn(),
  adminUpsertBlackoutRange: vi.fn(),
  adminDeleteBlackoutRange: vi.fn(),
  isError: (r: unknown): r is { error: string } =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as { error: unknown }).error === "string",
}));

const mockBlackouts = vi.mocked(api.adminBlackouts);
const mockUpsertRange = vi.mocked(api.adminUpsertBlackoutRange);
const mockDeleteRange = vi.mocked(api.adminDeleteBlackoutRange);

const ROW_A: BlackoutRow = {
  date: "2026-08-01",
  rooms_blocked: 12,
  note: "Fermeture complète",
  created_at: "2026-07-01T00:00:00.000Z",
};
const ROW_B: BlackoutRow = {
  date: "2026-08-05",
  rooms_blocked: 3,
  note: null,
  created_at: "2026-07-02T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminDisponibilitesTab", () => {
  it("loads and renders blackout rows on mount", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [ROW_A, ROW_B] });
    const { getByTestId, findByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });

    await findByTestId("blackouts-table");
    expect(mockBlackouts).toHaveBeenCalledTimes(1);
    // Both rows have delete triggers keyed by startDate (= date for single-day rows).
    expect(getByTestId("delete-blackout-2026-08-01")).toBeTruthy();
    expect(getByTestId("delete-blackout-2026-08-05")).toBeTruthy();
    // Nullable note renders the em-dash placeholder, never raw markup.
    expect(getByTestId("admin-disponibilites-tab").textContent).toContain("—");
  });

  it("shows the empty state when there are no blackouts", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [] });
    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });

    await findByTestId("blackouts-table");
    expect(getByTestId("admin-disponibilites-tab").textContent).toContain(
      "Aucune date bloquée.",
    );
  });

  it("surfaces a global error when the list fails to load", async () => {
    mockBlackouts.mockResolvedValue({ error: "Accès refusé" });
    const { findByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });

    const banner = await findByTestId("global-error");
    expect(banner.textContent).toContain("Accès refusé");
  });

  it("requires two-step confirmation before deleting a range", async () => {
    mockBlackouts
      .mockResolvedValueOnce({ blackouts: [ROW_A] })
      .mockResolvedValueOnce({ blackouts: [] });
    mockDeleteRange.mockResolvedValue({ deleted: 1 });
    const { findByTestId, getByTestId, queryByTestId } = render(
      AdminDisponibilitesTab,
      { props: { assignableRoomCount: 12 } },
    );

    await findByTestId("blackouts-table");

    // No confirm controls until the trigger is pressed.
    expect(queryByTestId("confirm-delete-2026-08-01")).toBeNull();
    await fireEvent.click(getByTestId("delete-blackout-2026-08-01"));
    expect(getByTestId("confirm-delete-2026-08-01")).toBeTruthy();
    expect(mockDeleteRange).not.toHaveBeenCalled();

    // Confirm fires the range delete with start=end for a single-day row.
    await fireEvent.click(getByTestId("confirm-delete-2026-08-01"));
    expect(mockDeleteRange).toHaveBeenCalledWith("2026-08-01", "2026-08-01");

    // After delete the list reloads; second load returns empty so row disappears.
    await waitFor(() =>
      expect(queryByTestId("delete-blackout-2026-08-01")).toBeNull(),
    );
    expect(mockBlackouts).toHaveBeenCalledTimes(2);
  });

  it("cancels the delete prompt without calling the API", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [ROW_A] });
    const { findByTestId, getByTestId, queryByTestId } = render(
      AdminDisponibilitesTab,
      { props: { assignableRoomCount: 12 } },
    );

    await findByTestId("blackouts-table");
    await fireEvent.click(getByTestId("delete-blackout-2026-08-01"));
    await fireEvent.click(getByTestId("cancel-delete-2026-08-01"));

    expect(queryByTestId("confirm-delete-2026-08-01")).toBeNull();
    expect(getByTestId("delete-blackout-2026-08-01")).toBeTruthy();
    expect(mockDeleteRange).not.toHaveBeenCalled();
  });

  it("upserts a blackout range and flashes success", async () => {
    mockBlackouts
      .mockResolvedValueOnce({ blackouts: [] })
      .mockResolvedValueOnce({ blackouts: [ROW_B] });
    mockUpsertRange.mockResolvedValue({ count: 1 });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-start-input"), {
      target: { value: "2026-08-05" },
    });
    await fireEvent.input(getByTestId("blackout-rooms-input"), {
      target: { value: "3" },
    });
    await fireEvent.submit(getByTestId("add-blackout-form"));

    await waitFor(() =>
      expect(mockUpsertRange).toHaveBeenCalledWith({
        startDate: "2026-08-05",
        endDate: "2026-08-05",
        roomsBlocked: 3,
        note: null,
      }),
    );
    // Success flash + reload.
    await findByTestId("submit-success");
    expect(mockBlackouts).toHaveBeenCalledTimes(2);
  });

  it("defaults rooms-blocked to assignableRoomCount for a full closure", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [] });
    mockUpsertRange.mockResolvedValue({ count: 1 });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-start-input"), {
      target: { value: "2026-08-01" },
    });
    // Rooms input left at its default; submit should send the seeded count.
    await fireEvent.submit(getByTestId("add-blackout-form"));

    await waitFor(() =>
      expect(mockUpsertRange).toHaveBeenCalledWith({
        startDate: "2026-08-01",
        endDate: "2026-08-01",
        roomsBlocked: 12,
        note: null,
      }),
    );
  });

  it("surfaces a submit error and keeps the form", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [] });
    mockUpsertRange.mockResolvedValue({ error: "Date invalide" });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-start-input"), {
      target: { value: "2026-08-01" },
    });
    await fireEvent.submit(getByTestId("add-blackout-form"));

    const err = await findByTestId("submit-error");
    expect(err.textContent).toContain("Date invalide");
    // A single load; no reload happened on failure.
    expect(mockBlackouts).toHaveBeenCalledTimes(1);
  });

  describe("grouping — consecutive days", () => {
    it("merges consecutive days with identical rooms_blocked+note into one range row", async () => {
      mockBlackouts.mockResolvedValue({
        blackouts: [
          { date: "2026-09-01", rooms_blocked: 12, note: "Congé", created_at: "2026-07-01T00:00:00.000Z" },
          { date: "2026-09-02", rooms_blocked: 12, note: "Congé", created_at: "2026-07-01T00:00:00.000Z" },
          { date: "2026-09-03", rooms_blocked: 12, note: "Congé", created_at: "2026-07-01T00:00:00.000Z" },
        ],
      });
      const { findByTestId, queryByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });

      await findByTestId("blackouts-table");
      // One range row keyed by startDate.
      expect(queryByTestId("delete-blackout-2026-09-01")).toBeTruthy();
      // No separate rows for the interior days.
      expect(queryByTestId("delete-blackout-2026-09-02")).toBeNull();
      expect(queryByTestId("delete-blackout-2026-09-03")).toBeNull();
    });

    it("keeps separate rows when adjacent days have differing note", async () => {
      mockBlackouts.mockResolvedValue({
        blackouts: [
          { date: "2026-09-01", rooms_blocked: 12, note: "Congé A", created_at: "2026-07-01T00:00:00.000Z" },
          { date: "2026-09-02", rooms_blocked: 12, note: "Congé B", created_at: "2026-07-01T00:00:00.000Z" },
        ],
      });
      const { findByTestId, queryByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });

      await findByTestId("blackouts-table");
      expect(queryByTestId("delete-blackout-2026-09-01")).toBeTruthy();
      expect(queryByTestId("delete-blackout-2026-09-02")).toBeTruthy();
    });

    it("splits into separate rows when there is a gap between dates", async () => {
      mockBlackouts.mockResolvedValue({
        blackouts: [
          { date: "2026-09-01", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
          // 2026-09-02 is missing (gap)
          { date: "2026-09-03", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
        ],
      });
      const { findByTestId, queryByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });

      await findByTestId("blackouts-table");
      expect(queryByTestId("delete-blackout-2026-09-01")).toBeTruthy();
      expect(queryByTestId("delete-blackout-2026-09-03")).toBeTruthy();
    });

    it("calls range delete with the full start+end span for a multi-day group", async () => {
      mockBlackouts
        .mockResolvedValueOnce({
          blackouts: [
            { date: "2026-09-01", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
            { date: "2026-09-02", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
            { date: "2026-09-03", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
          ],
        })
        .mockResolvedValueOnce({ blackouts: [] });
      mockDeleteRange.mockResolvedValue({ deleted: 3 });

      const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });
      await findByTestId("blackouts-table");

      await fireEvent.click(getByTestId("delete-blackout-2026-09-01"));
      await fireEvent.click(getByTestId("confirm-delete-2026-09-01"));

      await waitFor(() =>
        expect(mockDeleteRange).toHaveBeenCalledWith("2026-09-01", "2026-09-03"),
      );
    });

    it("merges consecutive days when both have null note and same rooms_blocked", async () => {
      mockBlackouts.mockResolvedValue({
        blackouts: [
          { date: "2026-10-01", rooms_blocked: 6, note: null, created_at: "2026-07-01T00:00:00.000Z" },
          { date: "2026-10-02", rooms_blocked: 6, note: null, created_at: "2026-07-01T00:00:00.000Z" },
        ],
      });
      const { findByTestId, queryByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });

      await findByTestId("blackouts-table");
      expect(queryByTestId("delete-blackout-2026-10-01")).toBeTruthy();
      // Interior day must not produce a separate row.
      expect(queryByTestId("delete-blackout-2026-10-02")).toBeNull();
    });

    it("keeps separate rows when adjacent days have differing rooms_blocked", async () => {
      mockBlackouts.mockResolvedValue({
        blackouts: [
          { date: "2026-10-05", rooms_blocked: 12, note: null, created_at: "2026-07-01T00:00:00.000Z" },
          { date: "2026-10-06", rooms_blocked: 6, note: null, created_at: "2026-07-01T00:00:00.000Z" },
        ],
      });
      const { findByTestId, queryByTestId } = render(AdminDisponibilitesTab, {
        props: { assignableRoomCount: 12 },
      });

      await findByTestId("blackouts-table");
      expect(queryByTestId("delete-blackout-2026-10-05")).toBeTruthy();
      expect(queryByTestId("delete-blackout-2026-10-06")).toBeTruthy();
    });
  });

  it("shows a global error when the range delete API returns an error", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [ROW_A] });
    mockDeleteRange.mockResolvedValue({ error: "Erreur réseau" });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });

    await findByTestId("blackouts-table");
    await fireEvent.click(getByTestId("delete-blackout-2026-08-01"));
    await fireEvent.click(getByTestId("confirm-delete-2026-08-01"));

    const banner = await findByTestId("global-error");
    expect(banner.textContent).toContain("Erreur réseau");
    // On delete failure the list must not reload.
    expect(mockBlackouts).toHaveBeenCalledTimes(1);
  });

  it("upserts a multi-day range and shows plural count in the flash", async () => {
    mockBlackouts
      .mockResolvedValueOnce({ blackouts: [] })
      .mockResolvedValueOnce({ blackouts: [] });
    mockUpsertRange.mockResolvedValue({ count: 3 });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-start-input"), {
      target: { value: "2026-11-01" },
    });
    await fireEvent.input(getByTestId("blackout-end-input"), {
      target: { value: "2026-11-03" },
    });
    await fireEvent.input(getByTestId("blackout-rooms-input"), {
      target: { value: "5" },
    });
    await fireEvent.submit(getByTestId("add-blackout-form"));

    await waitFor(() =>
      expect(mockUpsertRange).toHaveBeenCalledWith({
        startDate: "2026-11-01",
        endDate: "2026-11-03",
        roomsBlocked: 5,
        note: null,
      }),
    );
    const flash = await findByTestId("submit-success");
    expect(flash.textContent).toContain("3 dates");
  });
});
