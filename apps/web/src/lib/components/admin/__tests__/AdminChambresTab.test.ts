import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { Room, RoomInput, ApiError } from "$lib/api";

// ---------------------------------------------------------------------------
// Mock the typed API client. The panel must reach the network only through
// these helpers — never a raw fetch — so mocking the module fully isolates the
// orchestration logic (optimistic prepend/remove, rollback, flash). `isError`
// keeps its real semantics so the success/error branching is faithful.
// ---------------------------------------------------------------------------
const adminRooms = vi.fn();
const adminCreateRoom = vi.fn();
const adminUpdateRoom = vi.fn();
const adminDeleteRoom = vi.fn();

vi.mock("$lib/api", () => ({
  adminRooms: (...a: unknown[]) => adminRooms(...a),
  adminCreateRoom: (...a: unknown[]) => adminCreateRoom(...a),
  adminUpdateRoom: (...a: unknown[]) => adminUpdateRoom(...a),
  adminDeleteRoom: (...a: unknown[]) => adminDeleteRoom(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import AdminChambresTab from "../AdminChambresTab.svelte";

function room(over: Partial<Room> = {}): Room {
  return {
    slug: "chambre-du-quart",
    name: "Chambre du quart",
    capacity: 3,
    image_key: "bedroom",
    is_public: true,
    passkey_enabled: false,
    passkey: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  adminRooms.mockResolvedValue({ rooms: [room()] });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

// Fill and submit the create form (assumes the create panel is open).
async function submitCreateForm(
  getByTestId: (id: string) => HTMLElement,
  values: Partial<RoomInput> = {},
) {
  await fireEvent.input(getByTestId("rooms-form-name"), {
    target: { value: values.name ?? "Suite Test" },
  });
  await fireEvent.input(getByTestId("rooms-form-capacity"), {
    target: { value: String(values.capacity ?? 2) },
  });
  await fireEvent.change(getByTestId("rooms-form-image-key"), {
    target: { value: values.imageKey ?? "lounge" },
  });
  await fireEvent.submit(getByTestId("rooms-form"));
}

describe("AdminChambresTab", () => {
  it("renders the region root with correct ARIA", async () => {
    const { getByTestId } = render(AdminChambresTab);
    const root = getByTestId("admin-chambres-tab");
    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-label")).toBe("Gestion des chambres");
  });

  it("shows the loading state before the fetch resolves", () => {
    // Never-resolving fetch keeps the component in its loading branch.
    adminRooms.mockReturnValue(new Promise(() => {}));
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    expect(getByTestId("loading-state")).toBeTruthy();
    expect(queryByTestId("rooms-list")).toBeNull();
  });

  it("fetches rooms on mount and renders the list + count", async () => {
    const { getByTestId } = render(AdminChambresTab);
    await waitFor(() => expect(adminRooms).toHaveBeenCalledTimes(1));
    await waitFor(() => getByTestId("rooms-list"));
    expect(getByTestId("rooms-count").textContent).toContain("1");
    expect(getByTestId("rooms-list").querySelectorAll("li").length).toBe(1);
  });

  it("renders the empty state when no rooms exist", async () => {
    adminRooms.mockResolvedValue({ rooms: [] });
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("empty-state"));
    expect(getByTestId("empty-state").textContent).toContain("Aucune chambre.");
    expect(queryByTestId("rooms-list")).toBeNull();
  });

  it("surfaces a global error when the load fails and hides the empty state", async () => {
    adminRooms.mockResolvedValue({ error: "Erreur 500" });
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("global-error-banner"));
    expect(getByTestId("global-error-banner").getAttribute("role")).toBe("alert");
    // A load failure must NOT masquerade as "Aucune chambre."
    expect(queryByTestId("empty-state")).toBeNull();
  });

  it("toggles the create form and reflects aria-expanded", async () => {
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    const toggle = getByTestId("toggle-create-form");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(queryByTestId("create-form-panel")).toBeNull();

    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(getByTestId("create-form-panel")).toBeTruthy();

    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(queryByTestId("create-form-panel")).toBeNull();
  });

  it("creates a room: optimistic prepend, form collapse, flash banner", async () => {
    const created = room({ slug: "suite-test", name: "Suite Test", capacity: 2, image_key: "lounge" });
    adminCreateRoom.mockResolvedValue({ room: created });

    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("toggle-create-form"));
    await submitCreateForm(getByTestId);

    await waitFor(() =>
      expect(adminCreateRoom).toHaveBeenCalledWith({
        name: "Suite Test",
        capacity: 2,
        imageKey: "lounge",
        isPublic: true,
        passkeyEnabled: false,
        passkey: "",
      }),
    );

    // New room prepended → two rows, new one first.
    await waitFor(() => {
      const items = getByTestId("rooms-list").querySelectorAll("li");
      expect(items.length).toBe(2);
    });
    const firstName = getByTestId("rooms-list")
      .querySelectorAll('[data-testid="rooms-list-item-name"]')[0];
    expect(firstName.textContent).toContain("Suite Test");

    // Form collapsed, flash shown, count updated.
    expect(queryByTestId("create-form-panel")).toBeNull();
    expect(getByTestId("create-success-banner")).toBeTruthy();
    expect(getByTestId("rooms-count").textContent).toContain("2");
  });

  it("clears the flash banner after 4s", async () => {
    adminCreateRoom.mockResolvedValue({ room: room({ slug: "suite-test", name: "Suite Test" }) });
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("toggle-create-form"));
    await submitCreateForm(getByTestId);
    await waitFor(() => getByTestId("create-success-banner"));

    vi.advanceTimersByTime(4000);
    await waitFor(() => expect(queryByTestId("create-success-banner")).toBeNull());
  });

  it("surfaces the create error inline and does not prepend a row", async () => {
    adminCreateRoom.mockResolvedValue({ error: "Un nom identique existe déjà." });
    const { getByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("toggle-create-form"));
    await submitCreateForm(getByTestId);

    await waitFor(() =>
      expect(getByTestId("rooms-form-server-error").textContent).toContain(
        "Un nom identique existe déjà.",
      ),
    );
    // Form stays open, no row added.
    expect(getByTestId("create-form-panel")).toBeTruthy();
    expect(getByTestId("rooms-list").querySelectorAll("li").length).toBe(1);
  });

  it("deletes a room optimistically on confirm", async () => {
    adminDeleteRoom.mockResolvedValue({ ok: true });
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
    await fireEvent.click(getByTestId("rooms-list-item-confirm-yes"));

    await waitFor(() => expect(adminDeleteRoom).toHaveBeenCalledWith("chambre-du-quart"));
    // Row removed → list gone, empty state shown.
    await waitFor(() => expect(queryByTestId("rooms-list")).toBeNull());
    expect(getByTestId("empty-state")).toBeTruthy();
  });

  it("rolls back and shows a global error when delete fails", async () => {
    adminDeleteRoom.mockResolvedValue({ error: "Erreur 500" });
    const { getByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
    await fireEvent.click(getByTestId("rooms-list-item-confirm-yes"));

    await waitFor(() => expect(adminDeleteRoom).toHaveBeenCalled());
    // List restored + global error surfaced.
    await waitFor(() => getByTestId("global-error-banner"));
    expect(getByTestId("rooms-list").querySelectorAll("li").length).toBe(1);
  });

  it("auto-clears the delete global error after 6s", async () => {
    adminDeleteRoom.mockResolvedValue({ error: "Erreur 500" });
    const { getByTestId, queryByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
    await fireEvent.click(getByTestId("rooms-list-item-confirm-yes"));
    await waitFor(() => getByTestId("global-error-banner"));

    vi.advanceTimersByTime(6000);
    await waitFor(() => expect(queryByTestId("global-error-banner")).toBeNull());
  });

  it("updates a room and reconciles with the server record", async () => {
    const updated = room({ name: "Chambre rénovée", capacity: 4 });
    adminUpdateRoom.mockResolvedValue({ room: updated });
    const { getByTestId } = render(AdminChambresTab);
    await waitFor(() => getByTestId("rooms-list"));

    await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
    await waitFor(() => getByTestId("rooms-list-item-edit-panel"));
    await fireEvent.input(getByTestId("rooms-form-name"), {
      target: { value: "Chambre rénovée" },
    });
    await fireEvent.input(getByTestId("rooms-form-capacity"), {
      target: { value: "4" },
    });
    await fireEvent.submit(getByTestId("rooms-form"));

    await waitFor(() =>
      expect(adminUpdateRoom).toHaveBeenCalledWith("chambre-du-quart", {
        name: "Chambre rénovée",
        capacity: 4,
        imageKey: "bedroom",
        isPublic: true,
        passkeyEnabled: false,
        passkey: "",
      }),
    );
    await waitFor(() =>
      expect(getByTestId("rooms-list-item-name").textContent).toContain("Chambre rénovée"),
    );
  });
});
