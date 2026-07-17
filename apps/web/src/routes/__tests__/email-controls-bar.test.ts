import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, within, cleanup } from "@testing-library/svelte";
import EmailControlsBar from "../admin/courriels/EmailControlsBar.svelte";

// ---------------------------------------------------------------------------
// email-controls-bar is a pure presentational component: it takes props and
// emits typed values through callback props (never raw DOM events). These
// tests exercise the callback contract, the active-state reflection via
// aria-pressed, and the loading disable behaviour. Assertions use native DOM
// APIs (getAttribute / .disabled) — the suite sets up no jest-dom matchers.
// ---------------------------------------------------------------------------

interface Template {
  key: string;
  name: { fr: string; en: string };
}

const TEMPLATES: Template[] = [
  { key: "reservation_confirmed", name: { fr: "Réservation confirmée", en: "Booking confirmed" } },
  { key: "reservation_cancelled", name: { fr: "Réservation annulée", en: "Booking cancelled" } },
];

function base(over: Record<string, unknown> = {}) {
  return {
    templates: TEMPLATES,
    selectedKey: "reservation_confirmed",
    selectedLocale: "fr" as const,
    selectedWidth: "desktop" as const,
    loading: false,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe("email-controls-bar template picker", () => {
  it("renders one option per template with localized labels", () => {
    const { getByTestId } = render(EmailControlsBar, base());
    const picker = getByTestId("template-picker") as HTMLSelectElement;
    const options = Array.from(picker.options);
    expect(options).toHaveLength(2);
    // French labels shown for the fr locale.
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "Réservation confirmée",
      "Réservation annulée",
    ]);
  });

  it("shows English labels when the locale is en", () => {
    const { getByTestId } = render(EmailControlsBar, base({ selectedLocale: "en" }));
    const picker = getByTestId("template-picker") as HTMLSelectElement;
    expect(Array.from(picker.options).map((o) => o.textContent?.trim())).toEqual([
      "Booking confirmed",
      "Booking cancelled",
    ]);
  });

  it("marks the selectedKey option as selected", () => {
    const { getByTestId } = render(EmailControlsBar, base({ selectedKey: "reservation_cancelled" }));
    const picker = getByTestId("template-picker") as HTMLSelectElement;
    expect(picker.value).toBe("reservation_cancelled");
  });

  it("emits the chosen key through onTemplateChange on change", async () => {
    const onTemplateChange = vi.fn();
    const { getByTestId } = render(EmailControlsBar, base({ onTemplateChange }));
    const picker = getByTestId("template-picker") as HTMLSelectElement;
    await fireEvent.change(picker, { target: { value: "reservation_cancelled" } });
    expect(onTemplateChange).toHaveBeenCalledWith("reservation_cancelled");
  });

  it("renders no options when the template list is empty", () => {
    const { getByTestId } = render(EmailControlsBar, base({ templates: [], selectedKey: "" }));
    const picker = getByTestId("template-picker") as HTMLSelectElement;
    expect(picker.options).toHaveLength(0);
  });
});

describe("email-controls-bar locale toggle", () => {
  it("reflects the active locale via aria-pressed", () => {
    const { getByTestId } = render(EmailControlsBar, base({ selectedLocale: "fr" }));
    const group = getByTestId("locale-toggle");
    const fr = within(group).getByText("FR");
    const en = within(group).getByText("EN");
    expect(fr.getAttribute("aria-pressed")).toBe("true");
    expect(en.getAttribute("aria-pressed")).toBe("false");
  });

  it("emits 'fr' when the FR button is clicked", async () => {
    const onLocaleChange = vi.fn();
    const { getByTestId } = render(EmailControlsBar, base({ selectedLocale: "en", onLocaleChange }));
    const fr = within(getByTestId("locale-toggle")).getByText("FR");
    await fireEvent.click(fr);
    expect(onLocaleChange).toHaveBeenCalledWith("fr");
  });

  it("emits 'en' when the EN button is clicked", async () => {
    const onLocaleChange = vi.fn();
    const { getByTestId } = render(EmailControlsBar, base({ onLocaleChange }));
    const en = within(getByTestId("locale-toggle")).getByText("EN");
    await fireEvent.click(en);
    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });

  it("exposes the group semantics for assistive tech", () => {
    const { getByTestId } = render(EmailControlsBar, base());
    const group = getByTestId("locale-toggle");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-labelledby")).toBe("ecb-locale-label");
  });
});

describe("email-controls-bar width toggle", () => {
  it("reflects the active width via aria-pressed", () => {
    const { getByTestId } = render(EmailControlsBar, base({ selectedWidth: "mobile" }));
    const group = getByTestId("width-toggle");
    expect(within(group).getByText("BUREAU").getAttribute("aria-pressed")).toBe("false");
    expect(within(group).getByText("MOBILE").getAttribute("aria-pressed")).toBe("true");
  });

  it("emits 'desktop' when the BUREAU button is clicked", async () => {
    const onWidthChange = vi.fn();
    const { getByTestId } = render(EmailControlsBar, base({ selectedWidth: "mobile", onWidthChange }));
    await fireEvent.click(within(getByTestId("width-toggle")).getByText("BUREAU"));
    expect(onWidthChange).toHaveBeenCalledWith("desktop");
  });

  it("emits 'mobile' when the MOBILE button is clicked", async () => {
    const onWidthChange = vi.fn();
    const { getByTestId } = render(EmailControlsBar, base({ onWidthChange }));
    await fireEvent.click(within(getByTestId("width-toggle")).getByText("MOBILE"));
    expect(onWidthChange).toHaveBeenCalledWith("mobile");
  });
});

describe("email-controls-bar loading state", () => {
  it("disables every interactive control while loading", () => {
    const { getByTestId } = render(EmailControlsBar, base({ loading: true }));
    expect((getByTestId("template-picker") as HTMLSelectElement).disabled).toBe(true);
    for (const label of ["FR", "EN"]) {
      const btn = within(getByTestId("locale-toggle")).getByText(label) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    }
    for (const label of ["BUREAU", "MOBILE"]) {
      const btn = within(getByTestId("width-toggle")).getByText(label) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    }
  });

  it("leaves controls enabled when not loading", () => {
    const { getByTestId } = render(EmailControlsBar, base({ loading: false }));
    expect((getByTestId("template-picker") as HTMLSelectElement).disabled).toBe(false);
    expect(
      (within(getByTestId("locale-toggle")).getByText("FR") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
