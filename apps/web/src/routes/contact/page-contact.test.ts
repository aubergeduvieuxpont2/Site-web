import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";

// Partially mock the API module: keep the real `isError` type-guard (and every
// other export) but stub the two network calls the contact page makes. The
// `$lib/api` specifier and the relative `./api` used by the stores resolve to
// the same module, so this mock applies everywhere.
vi.mock("$lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/api")>();
  return {
    ...actual,
    getAvailability: vi.fn(),
    createReservation: vi.fn(),
  };
});

import Page from "./+page.svelte";
import { getAvailability } from "$lib/api";
import { settings } from "$lib/settings.svelte";
import { auth } from "$lib/auth.svelte";

const getAvailabilityMock = vi.mocked(getAvailability);

// The subset of settings the contact page reads; reset before every test so a
// mutation in one case never leaks into the next.
const SETTINGS_BASELINE = {
  nightlyPrice: 89,
  weeklyPrice: 560,
  reservationsEnabled: true,
  accommodationTax: 3.5,
  tps: 5,
  tvq: 9.975,
} as const;

function checkinInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#field-checkin")!;
}
function checkoutInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#field-checkout")!;
}

beforeEach(() => {
  Object.assign(settings, SETTINGS_BASELINE);
  auth.user = null;
  auth.loaded = true;
  getAvailabilityMock.mockReset();
  // Default: everything available. Individual tests override as needed.
  getAvailabilityMock.mockResolvedValue({
    nights: [],
    unavailableNights: [],
    allAvailable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("contact form — weekly rate", () => {
  it("shows the weekly-rate hint only once the stay reaches a full week", async () => {
    const { container, getByTestId, queryByTestId } = render(Page);

    // No dates → no hint.
    expect(queryByTestId("weekly-rate-hint")).toBeNull();

    await fireEvent.input(checkinInput(container), {
      target: { value: "2026-08-01" },
    });
    // 6 nights — still below the weekly threshold.
    await fireEvent.input(checkoutInput(container), {
      target: { value: "2026-08-07" },
    });
    expect(queryByTestId("weekly-rate-hint")).toBeNull();

    // 7 nights — weekly rate activates.
    await fireEvent.input(checkoutInput(container), {
      target: { value: "2026-08-08" },
    });
    const hint = getByTestId("weekly-rate-hint");
    expect(hint).toBeTruthy();
    const value = getByTestId("weekly-rate-value");
    // formatRate(560) renders as "560,00 $" (fr-CA); assert the digits + label.
    expect(value.textContent).toContain("560");
    expect(value.textContent).toContain("/semaine");
  });
});

describe("contact form — availability gating", () => {
  it("lists the blocked nights and disables submit when the range is unavailable", async () => {
    getAvailabilityMock.mockResolvedValue({
      nights: [],
      unavailableNights: ["2026-08-02", "2026-08-03"],
      allAvailable: false,
    });

    const { container, getByTestId } = render(Page);
    await fireEvent.input(checkinInput(container), {
      target: { value: "2026-08-01" },
    });
    await fireEvent.input(checkoutInput(container), {
      target: { value: "2026-08-05" },
    });

    await waitFor(
      () => expect(getByTestId("availability-warning")).toBeTruthy(),
      { timeout: 2000 },
    );

    const items = getByTestId("blocked-nights-list").querySelectorAll(
      "[data-testid='blocked-night']",
    );
    expect(items.length).toBe(2);
    // Rendered via formatDateOnly (fr-CA long date) — never the raw ISO string.
    expect(items[0].textContent).toContain("2026");
    expect(items[0].textContent).not.toBe("2026-08-02");

    const submit = getByTestId("contact-submit").querySelector<HTMLButtonElement>("button")!;
    expect(submit.disabled).toBe(true);
  });

  it("shows a soft notice but keeps submit enabled when the availability check errors", async () => {
    getAvailabilityMock.mockResolvedValue({ error: "réseau indisponible" });

    const { container, getByTestId } = render(Page);
    await fireEvent.input(checkinInput(container), {
      target: { value: "2026-08-01" },
    });
    await fireEvent.input(checkoutInput(container), {
      target: { value: "2026-08-05" },
    });

    await waitFor(
      () => expect(getByTestId("availability-error")).toBeTruthy(),
      { timeout: 2000 },
    );

    const submit = getByTestId("contact-submit").querySelector<HTMLButtonElement>("button")!;
    expect(submit.disabled).toBe(false);
  });
});

describe("contact form — maintenance toggle", () => {
  it("shows a maintenance notice and disables submit when reservations are off", () => {
    settings.reservationsEnabled = false;
    const { getByTestId } = render(Page);

    expect(getByTestId("maintenance-notice")).toBeTruthy();
    const submit = getByTestId("contact-submit").querySelector<HTMLButtonElement>("button")!;
    expect(submit.disabled).toBe(true);
  });

  it("has no maintenance notice and an enabled submit when reservations are on", () => {
    settings.reservationsEnabled = true;
    const { getByTestId, queryByTestId } = render(Page);

    expect(queryByTestId("maintenance-notice")).toBeNull();
    const submit = getByTestId("contact-submit").querySelector<HTMLButtonElement>("button")!;
    expect(submit.disabled).toBe(false);
  });
});

describe("contact form — checkout min", () => {
  it("sets the checkout picker min to the day after check-in", async () => {
    const { container } = render(Page);
    await fireEvent.input(checkinInput(container), {
      target: { value: "2026-08-01" },
    });
    expect(checkoutInput(container).getAttribute("min")).toBe("2026-08-02");
  });

  it("clears a checkout that is on or before the check-in date", async () => {
    const { container } = render(Page);
    const checkin = checkinInput(container);
    const checkout = checkoutInput(container);

    await fireEvent.input(checkin, { target: { value: "2026-08-10" } });
    await fireEvent.input(checkout, { target: { value: "2026-08-12" } });
    expect(checkout.value).toBe("2026-08-12");

    // Move check-in past the checkout — the $effect should clear the checkout.
    await fireEvent.input(checkin, { target: { value: "2026-08-15" } });
    await waitFor(() => expect(checkout.value).toBe(""));
  });
});
