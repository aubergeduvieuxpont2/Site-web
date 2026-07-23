import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";

// Stub the Stripe browser SDK loader so no real script is fetched and no real
// iframe is mounted. All components import Stripe only through $lib/stripe
// (INV-single-stripe-seam), so mocking that module is the only seam needed.
vi.mock("$lib/stripe", () => {
  const mockCheckout = {
    mount: vi.fn(),
    destroy: vi.fn(),
  };
  const mockStripe = {
    initEmbeddedCheckout: vi.fn().mockResolvedValue(mockCheckout),
  };
  return {
    STRIPE_PUBLISHABLE_KEY: "pk_test_mock_key",
    getStripe: vi.fn().mockResolvedValue(mockStripe),
  };
});

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
import { getAvailability, createReservation } from "$lib/api";
import { settings } from "$lib/settings.svelte";
import { auth } from "$lib/auth.svelte";

const getAvailabilityMock = vi.mocked(getAvailability);
const createReservationMock = vi.mocked(createReservation);

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
function firstNameInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#field-first-name")!;
}
function lastNameInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#field-last-name")!;
}
function emailInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#field-email")!;
}

/** Fill identity fields and submit the form, returning after the submit fires. */
async function fillAndSubmit(container: HTMLElement): Promise<void> {
  await fireEvent.input(firstNameInput(container), {
    target: { value: "Marie" },
  });
  await fireEvent.input(lastNameInput(container), {
    target: { value: "Dupont" },
  });
  await fireEvent.input(emailInput(container), {
    target: { value: "marie@example.com" },
  });
  const form = container.querySelector<HTMLFormElement>("[data-testid='contact-form']")!;
  await fireEvent.submit(form);
}

beforeEach(() => {
  Object.assign(settings, SETTINGS_BASELINE);
  auth.user = null;
  auth.loaded = true;
  getAvailabilityMock.mockReset();
  createReservationMock.mockReset();
  // Default: everything available.
  getAvailabilityMock.mockResolvedValue({
    nights: [],
    unavailableNights: [],
    allAvailable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

describe("contact form — payment flow", () => {
  it("shows the payment section with hold notice when the API returns a clientSecret", async () => {
    // holdExpiresAt 15 minutes in the future so the countdown shows positive time.
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    createReservationMock.mockResolvedValue({
      reservationId: 42,
      clientSecret: "cs_test_stripe_secret",
      holdExpiresAt,
    });

    const { container, getByTestId, queryByTestId } = render(Page);

    await fillAndSubmit(container);

    // Payment section should replace the form.
    await waitFor(() => expect(getByTestId("contact-payment")).toBeTruthy(), {
      timeout: 3000,
    });

    // The booking form is no longer in the DOM.
    expect(queryByTestId("contact-form")).toBeNull();

    // Hold notice and countdown are rendered.
    expect(getByTestId("payment-hold-notice")).toBeTruthy();
    expect(getByTestId("payment-countdown")).toBeTruthy();

    // The checkout container exists (Stripe mounts into it).
    expect(getByTestId("embedded-checkout")).toBeTruthy();
  });

  it("shows the expired state when the countdown reaches zero", async () => {
    vi.useFakeTimers();

    // holdExpiresAt 2 seconds in fake-time from now so the first tick fires
    // and then the interval fires quickly.
    const holdExpiresAt = new Date(Date.now() + 2000).toISOString();
    createReservationMock.mockResolvedValue({
      reservationId: 7,
      clientSecret: "cs_test_expire_me",
      holdExpiresAt,
    });

    const { container, getByTestId, queryByTestId } = render(Page);

    await fillAndSubmit(container);

    // Advance fake timers to let the createReservation promise resolve and
    // Svelte re-render into the paying state.
    await vi.advanceTimersByTimeAsync(50);

    await waitFor(() => expect(getByTestId("contact-payment")).toBeTruthy(), {
      timeout: 3000,
    });

    // Advance past the hold expiry (2 000 ms) so the interval fires and the
    // countdown reaches zero.
    await vi.advanceTimersByTimeAsync(2500);

    // Svelte should have transitioned to the expired state.
    await waitFor(() => expect(getByTestId("payment-expired")).toBeTruthy(), {
      timeout: 3000,
    });

    // The payment section is gone.
    expect(queryByTestId("contact-payment")).toBeNull();

    vi.useRealTimers();
  });

  it("shows the misconfig state when getStripe returns null", async () => {
    // Override getStripe to return null for this test only.
    const { getStripe } = await import("$lib/stripe");
    vi.mocked(getStripe).mockResolvedValueOnce(null);

    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    createReservationMock.mockResolvedValue({
      reservationId: 3,
      clientSecret: "cs_test_no_stripe",
      holdExpiresAt,
    });

    const { container, getByTestId, queryByTestId } = render(Page);

    await fillAndSubmit(container);

    await waitFor(() => expect(getByTestId("payment-misconfigured")).toBeTruthy(), {
      timeout: 3000,
    });

    // Neither paying nor form should be visible.
    expect(queryByTestId("contact-payment")).toBeNull();
    expect(queryByTestId("contact-form")).toBeNull();
  });

  it("shows the form again after clicking the back button from the expired state", async () => {
    vi.useFakeTimers();

    // Use a hold that expires immediately (in the past).
    const holdExpiresAt = new Date(Date.now() - 1).toISOString();
    createReservationMock.mockResolvedValue({
      reservationId: 5,
      clientSecret: "cs_test_already_expired",
      holdExpiresAt,
    });

    const { container, getByTestId } = render(Page);

    await fillAndSubmit(container);
    await vi.advanceTimersByTimeAsync(50);

    await waitFor(() => expect(getByTestId("payment-expired")).toBeTruthy(), {
      timeout: 3000,
    });

    // Click the back button to return to the form.
    const backBtn = getByTestId("payment-expired").querySelector("button")!;
    await fireEvent.click(backBtn);

    await waitFor(() => expect(getByTestId("contact-form")).toBeTruthy(), {
      timeout: 3000,
    });

    vi.useRealTimers();
  });
});
