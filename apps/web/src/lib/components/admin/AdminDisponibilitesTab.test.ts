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
  adminUpsertBlackout: vi.fn(),
  adminDeleteBlackout: vi.fn(),
  isError: (r: unknown): r is { error: string } =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as { error: unknown }).error === "string",
}));

const mockBlackouts = vi.mocked(api.adminBlackouts);
const mockUpsert = vi.mocked(api.adminUpsertBlackout);
const mockDelete = vi.mocked(api.adminDeleteBlackout);

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
    // Both rows have delete triggers keyed by date.
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

  it("requires two-step confirmation before deleting a row", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [ROW_A] });
    mockDelete.mockResolvedValue({ ok: true });
    const { findByTestId, getByTestId, queryByTestId } = render(
      AdminDisponibilitesTab,
      { props: { assignableRoomCount: 12 } },
    );

    await findByTestId("blackouts-table");

    // No confirm controls until the trigger is pressed.
    expect(queryByTestId("confirm-delete-2026-08-01")).toBeNull();
    await fireEvent.click(getByTestId("delete-blackout-2026-08-01"));
    expect(getByTestId("confirm-delete-2026-08-01")).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();

    await fireEvent.click(getByTestId("confirm-delete-2026-08-01"));
    expect(mockDelete).toHaveBeenCalledWith("2026-08-01");

    // Optimistic removal drops the row without a reload.
    await waitFor(() =>
      expect(queryByTestId("delete-blackout-2026-08-01")).toBeNull(),
    );
    expect(mockBlackouts).toHaveBeenCalledTimes(1);
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
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("upserts a blackout and flashes success", async () => {
    mockBlackouts
      .mockResolvedValueOnce({ blackouts: [] })
      .mockResolvedValueOnce({ blackouts: [ROW_B] });
    mockUpsert.mockResolvedValue({ blackout: ROW_B });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-date-input"), {
      target: { value: "2026-08-05" },
    });
    await fireEvent.input(getByTestId("blackout-rooms-input"), {
      target: { value: "3" },
    });
    await fireEvent.submit(getByTestId("add-blackout-form"));

    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith("2026-08-05", {
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
    mockUpsert.mockResolvedValue({ blackout: ROW_A });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-date-input"), {
      target: { value: "2026-08-01" },
    });
    // Rooms input left at its default; submit should send the seeded count.
    await fireEvent.submit(getByTestId("add-blackout-form"));

    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith("2026-08-01", {
        roomsBlocked: 12,
        note: null,
      }),
    );
  });

  it("surfaces a submit error and keeps the form", async () => {
    mockBlackouts.mockResolvedValue({ blackouts: [] });
    mockUpsert.mockResolvedValue({ error: "Date invalide" });

    const { findByTestId, getByTestId } = render(AdminDisponibilitesTab, {
      props: { assignableRoomCount: 12 },
    });
    await findByTestId("blackouts-table");

    await fireEvent.input(getByTestId("blackout-date-input"), {
      target: { value: "2026-08-01" },
    });
    await fireEvent.submit(getByTestId("add-blackout-form"));

    const err = await findByTestId("submit-error");
    expect(err.textContent).toContain("Date invalide");
    // A single load; no reload happened on failure.
    expect(mockBlackouts).toHaveBeenCalledTimes(1);
  });
});
