import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/svelte";

import UserPricingForm, {
  initialPricingMode,
  computeEffectivePrice,
  computeEffectiveWeekly,
  type PricingResult,
} from "../UserPricingForm.svelte";

afterEach(() => cleanup());

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    userId: 7,
    publicNightlyPrice: 89,
    publicWeeklyPrice: 490,
    initialDiscount: null,
    initialFixed: null,
    initialFixedWeekly: null,
    onSavePricing: vi.fn(async (): Promise<PricingResult> => ({ ok: true })),
    ...overrides,
  };
}

describe("initialPricingMode (pure)", () => {
  it("returns public when both columns are null", () => {
    expect(initialPricingMode(null, null)).toBe("public");
  });
  it("returns discount when only discount is set", () => {
    expect(initialPricingMode(10, null)).toBe("discount");
  });
  it("returns fixed when only fixed is set", () => {
    expect(initialPricingMode(null, 75)).toBe("fixed");
  });
  it("prefers fixed when both are set", () => {
    expect(initialPricingMode(10, 75)).toBe("fixed");
  });
  it("returns fixed when only the weekly fixed price is set", () => {
    expect(initialPricingMode(null, null, 490)).toBe("fixed");
  });
  it("still returns discount when only a discount is set and weekly is null", () => {
    expect(initialPricingMode(10, null, null)).toBe("discount");
  });
});

describe("computeEffectiveWeekly (pure)", () => {
  it("returns the public weekly price in public mode", () => {
    expect(computeEffectiveWeekly("public", 490, 0, 0)).toBe(490);
  });
  it("applies a percentage discount to the weekly price", () => {
    expect(computeEffectiveWeekly("discount", 500, 10, 0)).toBe(450);
    expect(computeEffectiveWeekly("discount", 490, 50, 0)).toBe(245);
  });
  it("returns the fixed weekly price in fixed mode", () => {
    expect(computeEffectiveWeekly("fixed", 490, 0, 420)).toBe(420);
  });
  it("falls back to the public weekly price for an out-of-range discount", () => {
    expect(computeEffectiveWeekly("discount", 490, -5, 0)).toBe(490);
    expect(computeEffectiveWeekly("discount", 490, 150, 0)).toBe(490);
  });
  it("falls back to the public weekly price for a negative fixed weekly value", () => {
    expect(computeEffectiveWeekly("fixed", 490, 0, -1)).toBe(490);
  });
  it("rounds to two decimals", () => {
    expect(computeEffectiveWeekly("discount", 490, 33.33, 0)).toBe(326.68);
  });
});

describe("computeEffectivePrice (pure)", () => {
  it("returns the public price in public mode", () => {
    expect(computeEffectivePrice("public", 89, 0, 0)).toBe(89);
  });
  it("applies a percentage discount", () => {
    expect(computeEffectivePrice("discount", 100, 10, 0)).toBe(90);
    expect(computeEffectivePrice("discount", 89, 50, 0)).toBe(44.5);
  });
  it("returns the fixed price in fixed mode", () => {
    expect(computeEffectivePrice("fixed", 89, 0, 60)).toBe(60);
  });
  it("falls back to public price for an out-of-range discount", () => {
    expect(computeEffectivePrice("discount", 89, -5, 0)).toBe(89);
    expect(computeEffectivePrice("discount", 89, 150, 0)).toBe(89);
  });
  it("falls back to public price for a negative fixed value", () => {
    expect(computeEffectivePrice("fixed", 89, 0, -1)).toBe(89);
  });
  it("rounds to two decimals", () => {
    expect(computeEffectivePrice("discount", 89, 33.33, 0)).toBe(59.34);
  });
});

describe("UserPricingForm — structure", () => {
  it("renders the group root with the French aria-labelledby", () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    const root = getByTestId("user-pricing-form");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby")).toBe("upf-title");
  });

  it("has three radio modes in the fieldset", () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    const fs = getByTestId("upf-mode-fieldset");
    expect(fs.querySelectorAll("input[type=radio]").length).toBe(3);
  });

  it("defaults to public mode with no input panel", () => {
    const { getByTestId, queryByTestId } = render(UserPricingForm, { props: baseProps() });
    expect((getByTestId("upf-mode-public") as HTMLInputElement).checked).toBe(true);
    expect(queryByTestId("upf-input-panel")).toBeNull();
  });

  it("shows the effective price preview reflecting the public price", () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    expect(getByTestId("upf-preview-amount").textContent).toMatch(/89/);
    expect(getByTestId("upf-preview-amount").textContent).toContain("$");
  });

  it("shows a dual preview with the public weekly price", () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    expect(getByTestId("upf-preview-badge")).toBeTruthy();
    expect(getByTestId("upf-preview-weekly-amount").textContent).toMatch(/490/);
    expect(getByTestId("upf-preview-weekly-amount").textContent).toContain("$");
  });
});

describe("UserPricingForm — weekly pricing", () => {
  it("starts in fixed mode when only initialFixedWeekly is provided", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialFixed: null, initialFixedWeekly: 420 }),
    });
    expect((getByTestId("upf-mode-fixed") as HTMLInputElement).checked).toBe(true);
    expect((getByTestId("upf-fixed-weekly-input") as HTMLInputElement).value).toBe("420");
  });

  it("shows the weekly row only in fixed mode", async () => {
    const { getByTestId, queryByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    expect(queryByTestId("upf-fixed-weekly-row")).toBeNull();
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    expect(getByTestId("upf-fixed-weekly-row")).toBeTruthy();
  });

  it("recomputes the weekly preview from a fixed weekly input", async () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    await fireEvent.input(getByTestId("upf-fixed-weekly-input"), { target: { value: "300" } });
    await waitFor(() =>
      expect(getByTestId("upf-preview-weekly-amount").textContent).toMatch(/300/),
    );
  });

  it("reflects a discount in the weekly preview (490 − 10% = 441)", async () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "10" } });
    await waitFor(() =>
      expect(getByTestId("upf-preview-weekly-amount").textContent).toMatch(/441/),
    );
  });

  it("blocks save and shows an error for a negative weekly price", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    await fireEvent.input(getByTestId("upf-fixed-input"), { target: { value: "75" } });
    await fireEvent.input(getByTestId("upf-fixed-weekly-input"), { target: { value: "-5" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    expect(onSavePricing).not.toHaveBeenCalled();
    expect(getByTestId("upf-fixed-weekly-error").textContent).toContain("positif");
  });
});

describe("UserPricingForm — initial mode from props", () => {
  it("starts in discount mode when initialDiscount is provided", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialDiscount: 15 }),
    });
    expect((getByTestId("upf-mode-discount") as HTMLInputElement).checked).toBe(true);
    expect(getByTestId("upf-discount-row")).toBeTruthy();
    expect((getByTestId("upf-discount-input") as HTMLInputElement).value).toBe("15");
  });

  it("starts in fixed mode when initialFixed is provided", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialFixed: 60 }),
    });
    expect((getByTestId("upf-mode-fixed") as HTMLInputElement).checked).toBe(true);
    expect((getByTestId("upf-fixed-input") as HTMLInputElement).value).toBe("60");
  });
});

describe("UserPricingForm — string prop coercion", () => {
  it("derives discount mode from a string discount prop", () => {
    expect(initialPricingMode("10.00" as unknown as number, null)).toBe("discount");
  });

  it("computes a discounted effective price (89 − 10% = 80.10)", () => {
    expect(computeEffectivePrice("discount", 89, 10, 0)).toBe(80.1);
  });

  it("renders a discounted preview when seeded with a string discount prop", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialDiscount: "10.00", publicNightlyPrice: 89 }),
    });
    expect((getByTestId("upf-mode-discount") as HTMLInputElement).checked).toBe(true);
    // 89 − 10% = 80.10, not the public 89.00
    expect(getByTestId("upf-preview-amount").textContent).toMatch(/80[.,]10/);
    expect(getByTestId("upf-preview-amount").textContent).not.toMatch(/89[.,]00/);
  });

  it("renders a fixed preview when seeded with a string fixed prop", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialFixed: "75.5", publicNightlyPrice: 89 }),
    });
    expect((getByTestId("upf-mode-fixed") as HTMLInputElement).checked).toBe(true);
    expect(getByTestId("upf-preview-amount").textContent).toMatch(/75[.,]50/);
  });

  it("keeps public mode for null props", () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialDiscount: null, initialFixed: null }),
    });
    expect((getByTestId("upf-mode-public") as HTMLInputElement).checked).toBe(true);
  });
});

describe("UserPricingForm — mode toggle", () => {
  it("shows the discount row when discount is selected", async () => {
    const { getByTestId, queryByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    expect(getByTestId("upf-input-panel")).toBeTruthy();
    expect(getByTestId("upf-discount-row")).toBeTruthy();
    expect(queryByTestId("upf-fixed-row")).toBeNull();
  });

  it("shows the fixed row when fixed is selected", async () => {
    const { getByTestId, queryByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    expect(getByTestId("upf-fixed-row")).toBeTruthy();
    expect(queryByTestId("upf-discount-row")).toBeNull();
  });

  it("hides the input panel again when public is reselected", async () => {
    const { getByTestId, queryByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.click(getByTestId("upf-mode-public"));
    expect(queryByTestId("upf-input-panel")).toBeNull();
  });
});

describe("UserPricingForm — preview updates", () => {
  it("recomputes the preview as the discount changes", async () => {
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ publicNightlyPrice: 100 }),
    });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "10" } });
    await waitFor(() => expect(getByTestId("upf-preview-amount").textContent).toMatch(/90/));
  });
});

describe("UserPricingForm — save", () => {
  it("disables save until a change is made", () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    expect((getByTestId("upf-save-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends a nulled body in public mode", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, {
      props: baseProps({ initialDiscount: 10, onSavePricing }),
    });
    await fireEvent.click(getByTestId("upf-mode-public"));
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() =>
      expect(onSavePricing).toHaveBeenCalledWith({
        discountPercent: null,
        fixedNightlyPrice: null,
        fixedWeeklyPrice: null,
      }),
    );
  });

  it("sends only the discount column in discount mode", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "20" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() =>
      expect(onSavePricing).toHaveBeenCalledWith({
        discountPercent: 20,
        fixedNightlyPrice: null,
        fixedWeeklyPrice: null,
      }),
    );
  });

  it("sends both fixed columns in fixed mode", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    await fireEvent.input(getByTestId("upf-fixed-input"), { target: { value: "75" } });
    await fireEvent.input(getByTestId("upf-fixed-weekly-input"), { target: { value: "450" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() =>
      expect(onSavePricing).toHaveBeenCalledWith({
        discountPercent: null,
        fixedNightlyPrice: 75,
        fixedWeeklyPrice: 450,
      }),
    );
  });

  it("blocks save and shows an error for an out-of-range discount", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "150" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    expect(onSavePricing).not.toHaveBeenCalled();
    expect(getByTestId("upf-discount-error").textContent).toContain("0 et 100");
  });

  it("blocks save and shows an error for a negative fixed price", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ ok: true }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-fixed"));
    await fireEvent.input(getByTestId("upf-fixed-input"), { target: { value: "-5" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    expect(onSavePricing).not.toHaveBeenCalled();
    expect(getByTestId("upf-fixed-error").textContent).toContain("positif");
  });

  it("shows a success status after a successful save", async () => {
    const { getByTestId } = render(UserPricingForm, { props: baseProps() });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "10" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() => {
      const status = getByTestId("upf-status");
      expect(status.getAttribute("data-state")).toBe("success");
      expect(status.textContent).toContain("enregistrée");
    });
  });

  it("shows the server error message returned by the callback", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => ({ error: "Refusé" }));
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "10" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() => {
      const status = getByTestId("upf-status");
      expect(status.getAttribute("data-state")).toBe("error");
      expect(status.textContent).toContain("Refusé");
    });
  });

  it("surfaces a network error when the callback rejects", async () => {
    const onSavePricing = vi.fn(async (): Promise<PricingResult> => {
      throw new Error("boom");
    });
    const { getByTestId } = render(UserPricingForm, { props: baseProps({ onSavePricing }) });
    await fireEvent.click(getByTestId("upf-mode-discount"));
    await fireEvent.input(getByTestId("upf-discount-input"), { target: { value: "10" } });
    await fireEvent.click(getByTestId("upf-save-btn"));
    await waitFor(() =>
      expect(getByTestId("upf-status").textContent).toContain("réseau"),
    );
  });
});
