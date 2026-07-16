import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { ApiError } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the typed API client. The drawer must reach the network only through
// these helpers — never a raw fetch — so mocking the module fully isolates the
// open/load orchestration and the optimistic assign/unassign + rollback logic.
// `isError` keeps its real semantics so success/error branching is faithful.
//
// The drawer portals its root to <body>, so tests query via `screen` (whole
// document) rather than the render container, which the portal escapes.
// ---------------------------------------------------------------------------
const adminReservationAssignments = vi.fn();
const adminFreeRooms = vi.fn();
const adminAssignRoom = vi.fn();
const adminUnassignRoom = vi.fn();

vi.mock("$lib/api", () => ({
  adminReservationAssignments: (...a: unknown[]) => adminReservationAssignments(...a),
  adminFreeRooms: (...a: unknown[]) => adminFreeRooms(...a),
  adminAssignRoom: (...a: unknown[]) => adminAssignRoom(...a),
  adminUnassignRoom: (...a: unknown[]) => adminUnassignRoom(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import RoomAssignmentDrawer from "../RoomAssignmentDrawer.svelte";

interface DrawerProps {
  reservationId: number;
  arrive: string | null;
  depart: string | null;
  roomCount: number | null;
}

const VALID: DrawerProps = {
  reservationId: 7,
  arrive: "2026-08-01",
  depart: "2026-08-03",
  roomCount: 2,
};

function seed(
  assignments: { room_slug: string }[] = [],
  rooms: { slug: string; name: string }[] = [],
) {
  adminReservationAssignments.mockResolvedValue({ assignments });
  adminFreeRooms.mockResolvedValue({ rooms });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed([], []);
});

afterEach(() => cleanup());

async function open(props: DrawerProps = VALID) {
  render(RoomAssignmentDrawer, { props });
  await fireEvent.click(screen.getByTestId("rad-trigger"));
}

describe("RoomAssignmentDrawer", () => {
  it("renders a trigger that is collapsed initially", () => {
    render(RoomAssignmentDrawer, { props: VALID });
    expect(screen.getByTestId("rad-trigger").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("room-assignment-drawer").getAttribute("aria-hidden")).toBe("true");
  });

  it("opens on trigger click and loads assignments + free rooms", async () => {
    // The free-rooms endpoint excludes rooms already assigned; the assigned
    // room's display name is resolved from the cache the free-rooms call seeds
    // — falling back to the slug when absent (chambre-a is not in the free set).
    seed([{ room_slug: "chambre-a" }], [{ slug: "chambre-b", name: "Chambre B" }]);
    await open();

    expect(screen.getByTestId("room-assignment-drawer").getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByTestId("rad-trigger").getAttribute("aria-expanded")).toBe("true");
    expect(adminReservationAssignments).toHaveBeenCalledWith(7);
    expect(adminFreeRooms).toHaveBeenCalledWith(7);

    await waitFor(() =>
      expect(screen.getByTestId("rad-assigned-room-name").textContent).toBe("chambre-a"),
    );
    const free = await screen.findAllByTestId("rad-free-item");
    expect(free).toHaveLength(1); // only chambre-b free
    expect(screen.getByTestId("rad-free-room-name").textContent).toBe("Chambre B");
    expect(screen.getByTestId("rad-capacity-badge").textContent).toBe("1 / 2");
  });

  it("shows the ineligibility notice and makes NO network calls for invalid dates", async () => {
    await open({ ...VALID, arrive: null, depart: null });
    expect(screen.getByTestId("rad-ineligible").hasAttribute("hidden")).toBe(false);
    expect(adminReservationAssignments).not.toHaveBeenCalled();
    expect(adminFreeRooms).not.toHaveBeenCalled();
  });

  it("treats depart <= arrive as ineligible", async () => {
    await open({ ...VALID, arrive: "2026-08-03", depart: "2026-08-01" });
    expect(screen.getByTestId("rad-ineligible").hasAttribute("hidden")).toBe(false);
    expect(adminFreeRooms).not.toHaveBeenCalled();
  });

  it("optimistically assigns a room and calls the API", async () => {
    seed([], [{ slug: "chambre-b", name: "Chambre B" }]);
    adminAssignRoom.mockResolvedValue({ assignment: { room_slug: "chambre-b" } });
    await open();

    await fireEvent.click(await screen.findByTestId("rad-assign-btn"));
    await waitFor(() => expect(screen.getByTestId("rad-assigned-item")).toBeTruthy());
    expect(adminAssignRoom).toHaveBeenCalledWith(7, "chambre-b");
    expect(screen.getByTestId("rad-assigned-room-name").textContent).toBe("Chambre B");
  });

  it("rolls back and surfaces the server error when assign fails", async () => {
    seed([], [{ slug: "chambre-b", name: "Chambre B" }]);
    adminAssignRoom.mockResolvedValue({ error: "Cette chambre est déjà réservée pour ces dates." });
    await open();

    await fireEvent.click(await screen.findByTestId("rad-assign-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("rad-error-text").textContent).toBe(
        "Cette chambre est déjà réservée pour ces dates.",
      ),
    );
    // Rolled back: no assigned item, room returned to the free list.
    expect(screen.queryByTestId("rad-assigned-item")).toBeNull();
    expect(screen.getByTestId("rad-free-item")).toBeTruthy();
  });

  it("optimistically unassigns a room and calls the API", async () => {
    seed([{ room_slug: "chambre-a" }], []);
    adminUnassignRoom.mockResolvedValue({ ok: true });
    await open();

    await fireEvent.click(await screen.findByTestId("rad-unassign-btn"));
    await waitFor(() => expect(screen.queryByTestId("rad-assigned-item")).toBeNull());
    expect(adminUnassignRoom).toHaveBeenCalledWith(7, "chambre-a");
  });

  it("disables assign buttons at capacity and shows the notice", async () => {
    seed(
      [{ room_slug: "chambre-a" }, { room_slug: "chambre-b" }],
      [{ slug: "chambre-c", name: "C" }],
    );
    await open({ ...VALID, roomCount: 2 });

    await waitFor(() => expect(screen.getByTestId("rad-capacity-badge").textContent).toBe("2 / 2"));
    expect(screen.getByTestId("rad-at-capacity").hasAttribute("hidden")).toBe(false);
    const assignBtn = await screen.findByTestId("rad-assign-btn");
    expect((assignBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes on Escape and on backdrop click, returning aria state", async () => {
    await open();
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("room-assignment-drawer").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("rad-trigger").getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(screen.getByTestId("rad-trigger"));
    await fireEvent.click(screen.getByTestId("rad-backdrop"));
    expect(screen.getByTestId("room-assignment-drawer").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a load error when the API fails", async () => {
    adminReservationAssignments.mockResolvedValue({ error: "boom" });
    adminFreeRooms.mockResolvedValue({ rooms: [] });
    await open();
    await waitFor(() =>
      expect(screen.getByTestId("rad-error-text").textContent).toBe(
        "Erreur lors du chargement des chambres.",
      ),
    );
  });

  it("dismisses the error banner via the dismiss button", async () => {
    adminReservationAssignments.mockResolvedValue({ error: "boom" });
    await open();
    await waitFor(() => expect(screen.getByTestId("rad-error").hasAttribute("hidden")).toBe(false));
    await fireEvent.click(screen.getByTestId("rad-error-dismiss"));
    expect(screen.getByTestId("rad-error").hasAttribute("hidden")).toBe(true);
  });
});
