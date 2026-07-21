import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/svelte";

import InvoiceCreator, {
  isInvoiceEligible,
  type InvoiceBreakdown,
  type InvoiceResult,
} from "../InvoiceCreator.svelte";

afterEach(() => cleanup());

const breakdown: InvoiceBreakdown = {
  nights: 3,
  roomCount: 2,
  effectiveNightly: 89,
  base: 534,
  accommodationTax: 21.36,
  tps: 27.77,
  tvq: 52.13,
  total: 635.26,
  amount: 190.58,
};

// Base eligible props; each test overrides what it needs.
function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    reservationId: 42,
    arrive: "2026-08-01",
    depart: "2026-08-04",
    roomCount: 2,
    onCreateInvoice: vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    ),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("isInvoiceEligible (pure guard)", () => {
  it("accepts two valid dates with depart after arrive and a room count", () => {
    expect(isInvoiceEligible("2026-08-01", "2026-08-04", 2)).toBe(true);
  });

  it("rejects a null arrive, depart, or room count", () => {
    expect(isInvoiceEligible(null, "2026-08-04", 2)).toBe(false);
    expect(isInvoiceEligible("2026-08-01", null, 2)).toBe(false);
    expect(isInvoiceEligible("2026-08-01", "2026-08-04", null)).toBe(false);
  });

  it("rejects malformed date strings", () => {
    expect(isInvoiceEligible("2026-8-1", "2026-08-04", 2)).toBe(false);
    expect(isInvoiceEligible("not-a-date", "2026-08-04", 2)).toBe(false);
  });

  it("rejects depart equal to or before arrive", () => {
    expect(isInvoiceEligible("2026-08-04", "2026-08-04", 2)).toBe(false);
    expect(isInvoiceEligible("2026-08-05", "2026-08-04", 2)).toBe(false);
  });

  it("accepts a room count of zero (present, not null)", () => {
    expect(isInvoiceEligible("2026-08-01", "2026-08-04", 0)).toBe(true);
  });
});

describe("InvoiceCreator — structure", () => {
  it("renders the region root with the French aria-label", () => {
    const { getByTestId } = render(InvoiceCreator, { props: baseProps() });
    const root = getByTestId("invoice-creator");
    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-label")).toBe("Créer une facture");
  });

  it("shows the form and hides the ineligibility notice when eligible", () => {
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps(),
    });
    expect(getByTestId("invoice-form")).toBeTruthy();
    expect(queryByTestId("invoice-ineligible")).toBeNull();
  });

  it("defaults to deposit mode with the percent input visible", () => {
    const { getByTestId } = render(InvoiceCreator, { props: baseProps() });
    const deposit = getByTestId("invoice-type-deposit") as HTMLInputElement;
    expect(deposit.checked).toBe(true);
    expect(getByTestId("invoice-deposit-row")).toBeTruthy();
    expect((getByTestId("invoice-deposit-percent") as HTMLInputElement).value).toBe("30");
  });
});

describe("InvoiceCreator — eligibility gate", () => {
  it("shows the ineligibility notice and no form when dates are missing", () => {
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps({ arrive: null }),
    });
    expect(getByTestId("invoice-ineligible")).toBeTruthy();
    expect(getByTestId("invoice-ineligible").getAttribute("role")).toBe("alert");
    expect(queryByTestId("invoice-form")).toBeNull();
  });

  it("shows the ineligibility notice when room count is null", () => {
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ roomCount: null }),
    });
    expect(getByTestId("invoice-ineligible")).toBeTruthy();
  });
});

describe("InvoiceCreator — type toggle", () => {
  it("hides the deposit row when full invoice is selected", async () => {
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps(),
    });
    await fireEvent.click(getByTestId("invoice-type-full"));
    expect(queryByTestId("invoice-deposit-row")).toBeNull();
  });

  it("brings the deposit row back when deposit is reselected", async () => {
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps(),
    });
    await fireEvent.click(getByTestId("invoice-type-full"));
    await fireEvent.click(getByTestId("invoice-type-deposit"));
    expect(queryByTestId("invoice-deposit-row")).toBeTruthy();
  });
});

describe("InvoiceCreator — confirm", () => {
  it("calls onCreateInvoice with the deposit payload including percent", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() =>
      expect(onCreateInvoice).toHaveBeenCalledWith({
        type: "deposit",
        depositPercent: 30,
      }),
    );
  });

  it("sends a full payload with no depositPercent in full mode", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-type-full"));
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() =>
      expect(onCreateInvoice).toHaveBeenCalledWith({ type: "full" }),
    );
  });

  it("blocks the call and shows an error for an out-of-range percent", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    const pct = getByTestId("invoice-deposit-percent") as HTMLInputElement;
    await fireEvent.input(pct, { target: { value: "150" } });
    await fireEvent.click(getByTestId("invoice-confirm"));
    expect(onCreateInvoice).not.toHaveBeenCalled();
    expect(getByTestId("invoice-api-error").textContent).toContain("1 et 100");
  });

  it("renders the API error message returned by the server (422)", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ error: "Dates manquantes" }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() =>
      expect(getByTestId("invoice-api-error").textContent).toContain(
        "Dates manquantes",
      ),
    );
  });

  it("surfaces a network error when the callback rejects", async () => {
    const onCreateInvoice = vi.fn(async (): Promise<InvoiceResult> => {
      throw new Error("boom");
    });
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() =>
      expect(getByTestId("invoice-api-error").textContent).toContain("réseau"),
    );
  });
});

describe("InvoiceCreator — breakdown", () => {
  it("reveals the breakdown table with formatted amounts after success", async () => {
    const { getByTestId } = render(InvoiceCreator, { props: baseProps() });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-breakdown-section"));

    const tbody = getByTestId("invoice-breakdown-tbody");
    expect(tbody.textContent).toContain("Nuits");
    expect(tbody.textContent).toContain("Montant dû");
    // fr-CA currency uses a non-breaking space + "$"; assert the digits + $.
    expect(tbody.textContent).toMatch(/190,58/);
    expect(tbody.textContent).toContain("$");
  });

  it("renders separate TPS, TVQ, and Taxe d'hébergement rows", async () => {
    const { getByTestId } = render(InvoiceCreator, { props: baseProps() });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-breakdown-tbody"));

    const tbody = getByTestId("invoice-breakdown-tbody");
    const labels = Array.from(tbody.querySelectorAll("td.ic-cell-label")).map(
      (td) => td.textContent?.trim(),
    );
    expect(labels).toContain("TPS");
    expect(labels).toContain("TVQ");
    expect(labels).toContain("Taxe d'hébergement");
    expect(labels).not.toContain("TPS + TVQ");
  });

  it("collapses and re-expands the breakdown body via the toggle", async () => {
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps(),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-breakdown-body"));

    const toggle = getByTestId("invoice-breakdown-toggle");
    await fireEvent.click(toggle);
    expect(queryByTestId("invoice-breakdown-body")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(toggle);
    expect(getByTestId("invoice-breakdown-body")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("InvoiceCreator — close", () => {
  it("invokes onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onClose }),
    });
    await fireEvent.click(getByTestId("invoice-creator-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("InvoiceCreator — Stripe hosted invoice link", () => {
  it("shows the Stripe link row when hostedInvoiceUrl is returned", async () => {
    const url = "https://invoice.stripe.com/i/acct_test/test_abc";
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({
        ok: true,
        breakdown,
        hostedInvoiceUrl: url,
        stripeInvoiceId: "in_test_abc",
      }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-stripe-link-row"));

    const link = getByTestId("invoice-stripe-link") as HTMLAnchorElement;
    expect(link.href).toBe(url);
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
  });

  it("shows the stripe invoice id alongside the link", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({
        ok: true,
        breakdown,
        hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_test/test_xyz",
        stripeInvoiceId: "in_test_xyz",
      }),
    );
    const { getByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-stripe-id"));
    expect(getByTestId("invoice-stripe-id").textContent?.trim()).toBe("in_test_xyz");
  });

  it("hides the Stripe link row when hostedInvoiceUrl is null", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({
        ok: true,
        breakdown,
        hostedInvoiceUrl: null,
        stripeInvoiceId: null,
      }),
    );
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    // Breakdown section appears, but no stripe link
    await waitFor(() => getByTestId("invoice-breakdown-section"));
    expect(queryByTestId("invoice-stripe-link-row")).toBeNull();
  });

  it("hides the Stripe link row when hostedInvoiceUrl is absent from result", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    );
    const { getByTestId, queryByTestId } = render(InvoiceCreator, {
      props: baseProps({ onCreateInvoice }),
    });
    await fireEvent.click(getByTestId("invoice-confirm"));
    await waitFor(() => getByTestId("invoice-breakdown-section"));
    expect(queryByTestId("invoice-stripe-link-row")).toBeNull();
  });
});
