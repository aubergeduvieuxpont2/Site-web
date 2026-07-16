import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/svelte";

import RoomsListItem from "../RoomsListItem.svelte";

type Room = {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
};

afterEach(() => cleanup());

const publicRoom: Room = {
  slug: "chambre-du-quart",
  name: "Chambre du quart",
  capacity: 3,
  image_key: "bedroom",
  is_public: true,
};

const hiddenRoom: Room = {
  slug: "chambre-masquee",
  name: "Chambre masquée",
  capacity: 2,
  image_key: null,
  is_public: false,
};

function noopUpdate(): Promise<void> {
  return Promise.resolve();
}

function noopDelete(): Promise<void> {
  return Promise.resolve();
}

function renderItem(room: Room, overrides: Partial<{
  onUpdate: (slug: string, data: unknown) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
}> = {}) {
  return render(RoomsListItem, {
    props: {
      room,
      onUpdate: overrides.onUpdate ?? noopUpdate,
      onDelete: overrides.onDelete ?? noopDelete,
    },
  });
}

describe("RoomsListItem", () => {
  describe("meta rendering", () => {
    it("renders the root article carrying the slug", () => {
      const { getByTestId } = renderItem(publicRoom);
      const root = getByTestId("rooms-list-item");
      expect(root.tagName).toBe("ARTICLE");
      expect(root.getAttribute("data-slug")).toBe("chambre-du-quart");
    });

    it("renders name, slug and capacity", () => {
      const { getByTestId } = renderItem(publicRoom);
      expect(getByTestId("rooms-list-item-name").textContent).toContain(
        "Chambre du quart",
      );
      expect(getByTestId("rooms-list-item-slug").textContent).toContain(
        "chambre-du-quart",
      );
      expect(getByTestId("rooms-list-item-capacity").textContent).toContain(
        "3 pers.",
      );
    });

    it("maps a known image key to its French label", () => {
      const { getByTestId } = renderItem(publicRoom);
      expect(getByTestId("rooms-list-item-image-key").textContent).toContain(
        "Chambre",
      );
    });

    it("renders an em-dash when the image key is null", () => {
      const { getByTestId } = renderItem(hiddenRoom);
      expect(getByTestId("rooms-list-item-image-key").textContent).toContain(
        "—",
      );
    });

    it("shows the 'Publique' badge for a public room", () => {
      const { getByTestId } = renderItem(publicRoom);
      const badge = getByTestId("rooms-list-item-badge");
      expect(badge.textContent).toContain("Publique");
      expect(badge.className).toContain("rooms-list-item__badge--public");
      expect(badge.getAttribute("role")).toBe("status");
    });

    it("shows the 'Masquée' badge for a hidden room", () => {
      const { getByTestId } = renderItem(hiddenRoom);
      const badge = getByTestId("rooms-list-item-badge");
      expect(badge.textContent).toContain("Masquée");
      expect(badge.className).toContain("rooms-list-item__badge--hidden");
    });
  });

  describe("edit toggle", () => {
    it("does not render the edit panel initially", () => {
      const { queryByTestId } = renderItem(publicRoom);
      expect(queryByTestId("rooms-list-item-edit-panel")).toBeNull();
    });

    it("opens the edit panel with a pre-filled form on click", async () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      const btn = getByTestId("rooms-list-item-edit-btn");
      expect(btn.getAttribute("aria-expanded")).toBe("false");

      await fireEvent.click(btn);

      expect(getByTestId("rooms-list-item-edit-btn").getAttribute("aria-expanded")).toBe(
        "true",
      );
      const panel = queryByTestId("rooms-list-item-edit-panel");
      expect(panel).not.toBeNull();
      // RoomsForm pre-fills from the room data.
      expect((getByTestId("rooms-form-name") as HTMLInputElement).value).toBe(
        "Chambre du quart",
      );
    });

    it("collapses the edit panel on a second click", async () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
      expect(queryByTestId("rooms-list-item-edit-panel")).not.toBeNull();
      await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
      expect(queryByTestId("rooms-list-item-edit-panel")).toBeNull();
    });

    it("calls onUpdate with the slug and payload on edit submit, then collapses", async () => {
      const onUpdate = vi.fn(noopUpdate);
      const { getByTestId, queryByTestId } = renderItem(publicRoom, { onUpdate });

      await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
      await fireEvent.submit(getByTestId("rooms-form"));

      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(onUpdate).toHaveBeenCalledWith("chambre-du-quart", {
        name: "Chambre du quart",
        capacity: 3,
        imageKey: "bedroom",
        isPublic: true,
      });
      await waitFor(() =>
        expect(queryByTestId("rooms-list-item-edit-panel")).toBeNull(),
      );
    });

    it("surfaces a save error and keeps the panel open when onUpdate rejects", async () => {
      const onUpdate = vi.fn(() => Promise.reject(new Error("Ce slug existe déjà.")));
      const { getByTestId, queryByTestId } = renderItem(publicRoom, { onUpdate });

      await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
      await fireEvent.submit(getByTestId("rooms-form"));

      await waitFor(() =>
        expect(getByTestId("rooms-form-server-error").textContent).toContain(
          "Ce slug existe déjà.",
        ),
      );
      expect(queryByTestId("rooms-list-item-edit-panel")).not.toBeNull();
    });
  });

  describe("delete flow", () => {
    it("shows the delete button and no confirm zone initially", () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      expect(getByTestId("rooms-list-item-delete-btn")).toBeTruthy();
      expect(queryByTestId("rooms-list-item-confirm-zone")).toBeNull();
    });

    it("reveals the confirm zone after clicking delete", async () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
      expect(queryByTestId("rooms-list-item-confirm-zone")).not.toBeNull();
      expect(queryByTestId("rooms-list-item-delete-btn")).toBeNull();
    });

    it("returns to the delete button when cancel is clicked", async () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
      await fireEvent.click(getByTestId("rooms-list-item-confirm-cancel"));
      expect(queryByTestId("rooms-list-item-confirm-zone")).toBeNull();
      expect(queryByTestId("rooms-list-item-delete-btn")).not.toBeNull();
    });

    it("calls onDelete with the slug when confirmed", async () => {
      const onDelete = vi.fn(noopDelete);
      const { getByTestId } = renderItem(publicRoom, { onDelete });
      await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
      await fireEvent.click(getByTestId("rooms-list-item-confirm-yes"));
      await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
      expect(onDelete).toHaveBeenCalledWith("chambre-du-quart");
    });

    it("shows an error bar and resets confirm when onDelete rejects", async () => {
      const onDelete = vi.fn(() => Promise.reject(new Error("Suppression impossible.")));
      const { getByTestId, queryByTestId } = renderItem(publicRoom, { onDelete });
      await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
      await fireEvent.click(getByTestId("rooms-list-item-confirm-yes"));

      await waitFor(() =>
        expect(getByTestId("rooms-list-item-delete-error").textContent).toContain(
          "Suppression impossible.",
        ),
      );
      // Confirm zone collapses back to the delete button so the user can retry.
      expect(queryByTestId("rooms-list-item-confirm-zone")).toBeNull();
      expect(queryByTestId("rooms-list-item-delete-btn")).not.toBeNull();
    });

    it("collapses an open edit panel when delete is initiated", async () => {
      const { getByTestId, queryByTestId } = renderItem(publicRoom);
      await fireEvent.click(getByTestId("rooms-list-item-edit-btn"));
      expect(queryByTestId("rooms-list-item-edit-panel")).not.toBeNull();
      await fireEvent.click(getByTestId("rooms-list-item-delete-btn"));
      expect(queryByTestId("rooms-list-item-edit-panel")).toBeNull();
      expect(queryByTestId("rooms-list-item-confirm-zone")).not.toBeNull();
    });
  });
});
