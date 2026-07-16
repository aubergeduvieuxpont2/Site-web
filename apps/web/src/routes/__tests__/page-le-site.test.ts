import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/svelte";
import type { ApiError, RoomVisibility } from "$lib/api";
import { ROOMS } from "$lib/content";

// ---------------------------------------------------------------------------
// The le-site page reaches the network only through getRooms(). Mock that
// helper so the silent visibility filter can be exercised deterministically.
// `isError` keeps its real semantics so the success/error branching in the
// component runs faithfully. `ROOMS` is NOT mocked — the filter narrows the
// real static content array.
// ---------------------------------------------------------------------------
const getRooms = vi.fn();

vi.mock("$lib/api", () => ({
  getRooms: (...a: unknown[]) => getRooms(...a),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as ApiError).error === "string",
}));

// Import AFTER the mock is registered so the component binds to the mock.
import Page from "../le-site/+page.svelte";

function rows(overrides: Record<string, boolean> = {}): RoomVisibility[] {
  return ROOMS.map((r) => ({ slug: r.slug, is_public: overrides[r.slug] ?? true }));
}

function cardCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-testid="room-card"]').length;
}

beforeEach(() => {
  getRooms.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("le-site-rooms visibility filter", () => {
  it("renders every ROOMS entry initially (prerender-safe state)", async () => {
    // getRooms never resolves — the grid must still show the full static list.
    getRooms.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(Page);
    expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length);
  });

  it("hides rooms whose is_public is false after getRooms resolves", async () => {
    const hidden = ROOMS[0].slug;
    getRooms.mockResolvedValue(rows({ [hidden]: false }));
    const { getByTestId } = render(Page);

    await waitFor(() => expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length - 1));
    const names = getByTestId("rooms-grid").textContent ?? "";
    expect(names).not.toContain(ROOMS[0].name);
    expect(names).toContain(ROOMS[1].name);
  });

  it("shows all rooms when getRooms returns an error", async () => {
    getRooms.mockResolvedValue({ error: "Réseau indisponible" });
    const { getByTestId } = render(Page);

    await waitFor(() => expect(getRooms).toHaveBeenCalled());
    expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length);
  });

  it("shows all rooms when the API returns an empty list", async () => {
    getRooms.mockResolvedValue([]);
    const { getByTestId } = render(Page);

    await waitFor(() => expect(getRooms).toHaveBeenCalled());
    expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length);
  });

  it("shows all rooms when every API slug is absent from ROOMS", async () => {
    getRooms.mockResolvedValue([{ slug: "unknown-slug", is_public: false }]);
    const { getByTestId } = render(Page);

    await waitFor(() => expect(getRooms).toHaveBeenCalled());
    expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length);
  });

  it("falls back to the full list when every room is masked", async () => {
    const allHidden = Object.fromEntries(ROOMS.map((r) => [r.slug, false]));
    getRooms.mockResolvedValue(rows(allHidden));
    const { getByTestId } = render(Page);

    // Zero-length guard: an all-masked payload must not empty the grid.
    await waitFor(() => expect(getRooms).toHaveBeenCalled());
    expect(cardCount(getByTestId("rooms-grid"))).toBe(ROOMS.length);
  });
});
