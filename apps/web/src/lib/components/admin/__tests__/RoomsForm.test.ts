import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/svelte";

import RoomsForm from "../RoomsForm.svelte";

// The component's emitted payload shape (mirrors the exported RoomInput type).
type RoomInput = {
  name: string;
  capacity: number;
  imageKey: string;
  isPublic: boolean;
};

afterEach(() => cleanup());

function noopSubmit(): Promise<void> {
  return Promise.resolve();
}

const filled: RoomInput = {
  name: "Chambre du quart",
  capacity: 3,
  imageKey: "bedroom",
  isPublic: false,
};

describe("RoomsForm", () => {
  describe("structure & mode", () => {
    it("renders the form root with the create-mode aria-label", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      const form = getByTestId("rooms-form");
      expect(form.tagName).toBe("FORM");
      expect(form.getAttribute("aria-label")).toBe("Ajouter une chambre");
    });

    it("switches the aria-label to edit mode when initialValues is set", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit, initialValues: filled },
      });
      expect(getByTestId("rooms-form").getAttribute("aria-label")).toBe(
        "Modifier la chambre",
      );
    });

    it("pre-fills every field from initialValues", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit, initialValues: filled },
      });
      expect((getByTestId("rooms-form-name") as HTMLInputElement).value).toBe(
        "Chambre du quart",
      );
      expect(
        (getByTestId("rooms-form-capacity") as HTMLInputElement).value,
      ).toBe("3");
      expect(
        (getByTestId("rooms-form-image-key") as HTMLSelectElement).value,
      ).toBe("bedroom");
      expect(
        (getByTestId("rooms-form-is-public") as HTMLInputElement).checked,
      ).toBe(false);
    });

    it("defaults isPublic to true and capacity to 1 in create mode", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      expect(
        (getByTestId("rooms-form-is-public") as HTMLInputElement).checked,
      ).toBe(true);
      expect(
        (getByTestId("rooms-form-capacity") as HTMLInputElement).value,
      ).toBe("1");
    });
  });

  describe("image select", () => {
    it("renders the placeholder + all 14 allow-listed image keys", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      const select = getByTestId("rooms-form-image-key") as HTMLSelectElement;
      // 14 keys + 1 empty placeholder
      expect(select.options.length).toBe(15);
      const values = Array.from(select.options).map((o) => o.value);
      expect(values[0]).toBe("");
      expect(values).toContain("bedroom");
      expect(values).toContain("village-river");
      expect(values).toContain("bathroom-3");
    });
  });

  describe("validation", () => {
    it("shows a French required error on blur of an empty name", async () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      await fireEvent.blur(getByTestId("rooms-form-name"));
      expect(getByTestId("rooms-form").textContent).toContain(
        "Le nom est requis.",
      );
    });

    it("shows a capacity error when capacity is below 1", async () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      const cap = getByTestId("rooms-form-capacity") as HTMLInputElement;
      await fireEvent.input(cap, { target: { value: "0" } });
      await fireEvent.blur(cap);
      expect(getByTestId("rooms-form").textContent).toContain(
        "La capacité doit être un entier supérieur à 0.",
      );
    });

    it("shows an image-key error when nothing is chosen on blur", async () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      await fireEvent.blur(getByTestId("rooms-form-image-key"));
      expect(getByTestId("rooms-form").textContent).toContain(
        "Veuillez choisir une clé d'image valide.",
      );
    });

    it("does not call onSubmit when the form is invalid", async () => {
      const onSubmit = vi.fn(noopSubmit);
      const { getByTestId } = render(RoomsForm, { props: { onSubmit } });
      await fireEvent.submit(getByTestId("rooms-form"));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("submission", () => {
    it("emits a trimmed, typed RoomInput payload on valid submit", async () => {
      const onSubmit = vi.fn(noopSubmit);
      const { getByTestId } = render(RoomsForm, { props: { onSubmit } });

      await fireEvent.input(getByTestId("rooms-form-name"), {
        target: { value: "  Le gîte familial  " },
      });
      await fireEvent.input(getByTestId("rooms-form-capacity"), {
        target: { value: "5" },
      });
      await fireEvent.change(getByTestId("rooms-form-image-key"), {
        target: { value: "balcony" },
      });
      await fireEvent.click(getByTestId("rooms-form-is-public")); // toggle to false

      await fireEvent.submit(getByTestId("rooms-form"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith({
        name: "Le gîte familial",
        capacity: 5,
        imageKey: "balcony",
        isPublic: false,
      });
    });
  });

  describe("loading & server error", () => {
    it("disables the submit button and shows a busy label when loading", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit, loading: true },
      });
      const btn = getByTestId("rooms-form-submit") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.textContent).toContain("Enregistrement…");
    });

    it("uses the provided submitLabel when not loading", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit, submitLabel: "Créer la chambre" },
      });
      expect(getByTestId("rooms-form-submit").textContent).toContain(
        "Créer la chambre",
      );
    });

    it("renders the server error banner only when error is set", () => {
      const { queryByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit },
      });
      expect(queryByTestId("rooms-form-server-error")).toBeNull();
    });

    it("shows the server error text when the error prop is present", () => {
      const { getByTestId } = render(RoomsForm, {
        props: { onSubmit: noopSubmit, error: "Ce slug existe déjà." },
      });
      const banner = getByTestId("rooms-form-server-error");
      expect(banner.getAttribute("role")).toBe("alert");
      expect(banner.textContent).toContain("Ce slug existe déjà.");
    });
  });
});
