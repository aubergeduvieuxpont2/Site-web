import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import type { User, ApiError, RoomVisibility } from "$lib/api";
import { ROOMS } from "$lib/content";

// ---------------------------------------------------------------------------
// Mock the typed API client. The admin page reaches the network only through
// these helpers, so a full module mock isolates the Chambres tab's behaviour.
// `isError` keeps its real semantics so success/error branching is exercised
// faithfully. `ROOMS` is intentionally NOT mocked — the tab merges live
// visibility onto the real static content array.
// ---------------------------------------------------------------------------
const getMe = vi.fn();
const adminReservations = vi.fn();
const adminOutbox = vi.fn();
const requeueOutbox = vi.fn();
const adminGetSettings = vi.fn();
const adminUpdateSettings = vi.fn();
const changePassword = vi.fn();
const adminRooms = vi.fn();
const adminSetRoomVisibility = vi.fn();

vi.mock("$lib/api", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  adminReservations: (...a: unknown[]) => adminReservations(...a),
  adminOutbox: (...a: unknown[]) => adminOutbox(...a),
  requeueOutbox: (...a: unknown[]) => requeueOutbox(...a),
  adminGetSettings: (...a: unknown[]) => adminGetSettings(...a),
  adminUpdateSettings: (...a: unknown[]) => adminUpdateSettings(...a),
  changePassword: (...a: unknown[]) => changePassword(...a),
  adminRooms: (...a: unknown[]) => adminRooms(...a),
  adminSetRoomVisibility: (...a: unknown[]) => adminSetRoomVisibility(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import Page from "../admin/+page.svelte";

const ADMIN: User = { id: 1, email: "admin@example.com", name: "Admin", role: "admin" };

function allPublic(): RoomVisibility[] {
  return ROOMS.map((r) => ({ slug: r.slug, is_public: true }));
}

beforeEach(() => {
  getMe.mockReset();
  adminReservations.mockReset();
  adminOutbox.mockReset();
  requeueOutbox.mockReset();
  adminGetSettings.mockReset();
  adminUpdateSettings.mockReset();
  changePassword.mockReset();
  adminRooms.mockReset();
  adminSetRoomVisibility.mockReset();

  getMe.mockResolvedValue({ user: ADMIN });
  adminReservations.mockResolvedValue({ reservations: [] });
  adminOutbox.mockResolvedValue({ rows: [] });
  adminGetSettings.mockResolvedValue({
    nightlyPrice: 89,
    contactEmail: "info@aubergeduvieuxpont.ca",
    marketingRoomCount: 12,
    assignableRoomCount: 12,
  });
  adminRooms.mockResolvedValue({ rooms: allPublic() });
  adminSetRoomVisibility.mockImplementation((slug: string, isPublic: boolean) =>
    Promise.resolve({ room: { slug, is_public: isPublic } }),
  );
});

afterEach(() => {
  cleanup();
});

async function openChambres(getByTestId: (id: string) => HTMLElement, findByTestId: (id: string) => Promise<HTMLElement>) {
  await findByTestId("panel-reservations");
  await fireEvent.click(getByTestId("tab-rooms"));
}

describe("admin-chambres-tab activation", () => {
  it("fetches rooms only after the Chambres tab is activated", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await findByTestId("panel-reservations");
    expect(adminRooms).not.toHaveBeenCalled();

    await fireEvent.click(getByTestId("tab-rooms"));
    await waitFor(() => expect(adminRooms).toHaveBeenCalledTimes(1));
    expect(await findByTestId("chambres-list")).toBeTruthy();
  });

  it("renders one card per ROOMS entry with name, code and capacity", async () => {
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    await findByTestId("chambres-list");

    for (const room of ROOMS) {
      expect(await findByTestId(`chambre-card-${room.slug}`)).toBeTruthy();
      expect(getByTestId(`chambre-name-${room.slug}`).textContent).toContain(room.name);
      expect(getByTestId(`chambre-code-${room.slug}`).textContent).toContain(room.code);
      expect(getByTestId(`chambre-capacity-${room.slug}`).textContent).toContain(room.capacity);
    }
  });
});

describe("admin-chambres-tab visibility state", () => {
  it("reflects is_public from the API on the toggle and label", async () => {
    const hidden = ROOMS[0].slug;
    adminRooms.mockResolvedValue({
      rooms: ROOMS.map((r) => ({ slug: r.slug, is_public: r.slug !== hidden })),
    });
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    await findByTestId("chambres-list");

    const toggle = getByTestId(`toggle-${hidden}`);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(getByTestId(`chambre-visibility-${hidden}`).textContent).toContain("Masquée");

    const publicSlug = ROOMS[1].slug;
    expect(getByTestId(`toggle-${publicSlug}`).getAttribute("aria-checked")).toBe("true");
    expect(getByTestId(`chambre-visibility-${publicSlug}`).textContent).toContain("Publique");
  });

  it("defaults a room missing from the API to public", async () => {
    // Only return a row for the first room; the others must default to public.
    adminRooms.mockResolvedValue({ rooms: [{ slug: ROOMS[0].slug, is_public: false }] });
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    await findByTestId("chambres-list");

    expect(getByTestId(`toggle-${ROOMS[0].slug}`).getAttribute("aria-checked")).toBe("false");
    expect(getByTestId(`toggle-${ROOMS[1].slug}`).getAttribute("aria-checked")).toBe("true");
  });
});

describe("admin-chambres-tab toggle (optimistic + rollback)", () => {
  it("optimistically hides a room and persists via adminSetRoomVisibility", async () => {
    const slug = ROOMS[0].slug;
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    const toggle = await findByTestId(`toggle-${slug}`);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    await fireEvent.click(toggle);
    expect(adminSetRoomVisibility).toHaveBeenCalledWith(slug, false);
    await waitFor(() =>
      expect(getByTestId(`toggle-${slug}`).getAttribute("aria-checked")).toBe("false"),
    );
    expect(getByTestId(`chambre-visibility-${slug}`).textContent).toContain("Masquée");
    // No error surfaced on success.
    expect(getByTestId(`chambre-error-${slug}`).textContent?.trim()).toBe("");
  });

  it("rolls back and shows an error when the update fails", async () => {
    const slug = ROOMS[0].slug;
    adminSetRoomVisibility.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    const toggle = await findByTestId(`toggle-${slug}`);

    await fireEvent.click(toggle);
    await waitFor(() => expect(adminSetRoomVisibility).toHaveBeenCalled());
    // Reverted to the previous (public) state.
    await waitFor(() =>
      expect(getByTestId(`toggle-${slug}`).getAttribute("aria-checked")).toBe("true"),
    );
    const err = getByTestId(`chambre-error-${slug}`);
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Impossible de modifier la visibilité");
  });

  it("ignores a second toggle while one is already in flight", async () => {
    const slug = ROOMS[0].slug;
    let resolve!: (v: { room: RoomVisibility }) => void;
    adminSetRoomVisibility.mockImplementation(
      () => new Promise<{ room: RoomVisibility }>((r) => (resolve = r)),
    );
    const { findByTestId, getByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);
    const toggle = await findByTestId(`toggle-${slug}`);

    await fireEvent.click(toggle);
    await fireEvent.click(toggle); // in-flight — must be ignored
    expect(adminSetRoomVisibility).toHaveBeenCalledTimes(1);

    resolve({ room: { slug, is_public: false } });
    await waitFor(() =>
      expect(getByTestId(`toggle-${slug}`).getAttribute("aria-checked")).toBe("false"),
    );
  });
});

describe("admin-chambres-tab error state", () => {
  it("surfaces a fetch error when adminRooms fails", async () => {
    adminRooms.mockResolvedValue({ error: "Erreur 500" });
    const { findByTestId, getByTestId, queryByTestId } = render(Page);
    await openChambres(getByTestId, findByTestId);

    const err = await findByTestId("chambres-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("Impossible de charger les chambres");
    expect(queryByTestId("chambres-list")).toBeNull();
  });
});

describe("admin-chambres-tab ARIA tab semantics", () => {
  it("exposes the tab as a switch-list panel and toggles aria-selected", async () => {
    const { findByTestId, getByTestId } = render(Page);
    const tab = await findByTestId("tab-rooms");
    expect(tab.getAttribute("aria-controls")).toBe("panel-rooms");
    expect(tab.getAttribute("aria-selected")).toBe("false");

    await fireEvent.click(tab);
    await waitFor(() => expect(getByTestId("tab-rooms").getAttribute("aria-selected")).toBe("true"));
    const firstToggle = getByTestId(`toggle-${ROOMS[0].slug}`);
    expect(firstToggle.getAttribute("role")).toBe("switch");
  });
});
