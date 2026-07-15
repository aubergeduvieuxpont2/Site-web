import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";

// ── `$app/stores`: the page reads `$page.url.searchParams` to pre-fill the
// chambre. Replay a mutable URL so tests can exercise the `?chambre=` path. ──
let mockUrl = new URL("http://localhost/contact");
vi.mock("$app/stores", () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({ url: mockUrl });
      return () => {};
    },
  },
}));

// ── `$lib/motion`: `use:reveal` uses IntersectionObserver, which jsdom lacks.
// Stub it to an inert action so rendering never touches the real observer. ──
vi.mock("$lib/motion", () => ({
  reveal: () => ({ destroy() {} }),
}));

// ── `$lib/api`: the network boundary. `isError` mirrors the real guard so the
// page's success/error branching is exercised honestly. ──
const createReservation = vi.fn((..._args: unknown[]) => Promise.resolve<unknown>(undefined));
vi.mock("$lib/api", () => ({
  createReservation: (...args: unknown[]) => createReservation(...args),
  isError: (r: unknown) =>
    typeof r === "object" && r !== null && "error" in r && typeof (r as { error: unknown }).error === "string",
}));

import Page from "../contact/+page.svelte";

beforeEach(() => {
  createReservation.mockReset();
  mockUrl = new URL("http://localhost/contact");
});

afterEach(() => cleanup());

/** Fill the two required fields with valid values. */
async function fillRequired(getByTestId: (id: string) => HTMLElement) {
  await fireEvent.input(getByTestId("input-name"), { target: { value: "Ada Lovelace" } });
  await fireEvent.input(getByTestId("input-email"), { target: { value: "ada@example.com" } });
}

describe("page-contact", () => {
  describe("structure & accessibility", () => {
    it("mounts the page and reservation form", () => {
      const { getByTestId } = render(Page);
      expect(getByTestId("page-contact")).toBeTruthy();
      expect(getByTestId("contact-form")).toBeTruthy();
    });

    it("associates every input with a label", () => {
      const { getByTestId, container } = render(Page);
      for (const id of ["input-name", "input-email", "input-checkin", "input-checkout", "input-guests", "input-message"]) {
        const input = getByTestId(id);
        const forAttr = input.getAttribute("id");
        expect(forAttr).toBeTruthy();
        expect(container.querySelector(`label[for="${forAttr}"]`)).toBeTruthy();
      }
    });

    it("marks the required credential inputs as required", () => {
      const { getByTestId } = render(Page);
      expect(getByTestId("input-name").getAttribute("aria-required")).toBe("true");
      expect(getByTestId("input-email").getAttribute("aria-required")).toBe("true");
    });
  });

  describe("chambre pre-fill", () => {
    it("seeds the message from the ?chambre= query param", () => {
      mockUrl = new URL("http://localhost/contact?chambre=suite-du-pont");
      const { getByTestId } = render(Page);
      expect((getByTestId("input-message") as HTMLTextAreaElement).value).toContain("suite-du-pont");
    });

    it("leaves the message blank when no chambre is supplied", () => {
      const { getByTestId } = render(Page);
      expect((getByTestId("input-message") as HTMLTextAreaElement).value).toBe("");
    });
  });

  describe("client-side validation", () => {
    it("blocks submit and shows field errors when required fields are empty", async () => {
      const { getByTestId } = render(Page);
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();

      expect(createReservation).not.toHaveBeenCalled();
      expect(getByTestId("error-name")).toBeTruthy();
      expect(getByTestId("error-email")).toBeTruthy();
    });

    it("rejects a malformed email before any network call", async () => {
      const { getByTestId } = render(Page);
      await fireEvent.input(getByTestId("input-name"), { target: { value: "Ada" } });
      await fireEvent.input(getByTestId("input-email"), { target: { value: "not-an-email" } });
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();

      expect(createReservation).not.toHaveBeenCalled();
      expect(getByTestId("error-email").textContent).toContain("invalide");
    });
  });

  describe("submission", () => {
    it("sends trimmed values and shows the success panel on 201", async () => {
      createReservation.mockResolvedValue({ reservation: { id: 1 } });
      const { getByTestId, queryByTestId } = render(Page);

      await fireEvent.input(getByTestId("input-name"), { target: { value: "  Ada Lovelace  " } });
      await fireEvent.input(getByTestId("input-email"), { target: { value: "  ada@example.com  " } });
      await fireEvent.input(getByTestId("input-guests"), { target: { value: "3" } });
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();
      await tick();

      expect(createReservation).toHaveBeenCalledTimes(1);
      const payload = createReservation.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.name).toBe("Ada Lovelace");
      expect(payload.email).toBe("ada@example.com");
      expect(payload.guests).toBe(3);

      expect(getByTestId("contact-success")).toBeTruthy();
      // Personalised with the first name only.
      expect(getByTestId("contact-success").textContent).toContain("Ada");
      // The form is replaced by the confirmation.
      expect(queryByTestId("contact-form")).toBeNull();
    });

    it("normalises a guest count below 1 up to 1", async () => {
      createReservation.mockResolvedValue({ reservation: { id: 2 } });
      const { getByTestId } = render(Page);

      await fillRequired(getByTestId);
      await fireEvent.input(getByTestId("input-guests"), { target: { value: "0" } });
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();

      const payload = createReservation.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.guests).toBe(1);
    });

    it("shows the error banner and keeps the form on an API error", async () => {
      createReservation.mockResolvedValue({ error: "Requête invalide" });
      const { getByTestId } = render(Page);

      await fillRequired(getByTestId);
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();
      await tick();

      const banner = getByTestId("contact-error");
      expect(banner.getAttribute("role")).toBe("alert");
      expect(banner.textContent).toContain("Requête invalide");
      // Form remains available for a retry.
      expect(getByTestId("contact-form")).toBeTruthy();
    });

    it("does not include an empty message in the payload", async () => {
      createReservation.mockResolvedValue({ reservation: { id: 3 } });
      const { getByTestId } = render(Page);

      await fillRequired(getByTestId);
      await fireEvent.submit(getByTestId("contact-form"));
      await tick();

      const payload = createReservation.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.message).toBeUndefined();
    });
  });
});
