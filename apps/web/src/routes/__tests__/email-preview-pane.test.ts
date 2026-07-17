import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import EmailPreviewPane from "../admin/courriels/EmailPreviewPane.svelte";

// ---------------------------------------------------------------------------
// email-preview-pane: two-tab panel (HTML iframe + plain-text pre).
// Tests cover tab switching, prop binding, error banner, loading overlay,
// width CSS prop, and ARIA tab widget semantics.
// ---------------------------------------------------------------------------

function base(over: Record<string, unknown> = {}) {
  return {
    subject: "Bienvenue à l'Auberge",
    html: "<p>Bonjour</p>",
    text: "Bonjour",
    width: "desktop" as const,
    loading: false,
    error: null,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

// ── Root element ────────────────────────────────────────────────────────────

describe("email-preview-pane root", () => {
  it("renders the root element with data-testid", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    expect(getByTestId("email-preview-pane")).toBeTruthy();
  });
});

// ── Subject strip ───────────────────────────────────────────────────────────

describe("email-preview-pane subject", () => {
  it("renders the subject text", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    expect(getByTestId("preview-subject").textContent).toBe("Bienvenue à l'Auberge");
  });

  it("renders an empty subject when not provided", () => {
    const { getByTestId } = render(EmailPreviewPane, base({ subject: "" }));
    expect(getByTestId("preview-subject").textContent).toBe("");
  });
});

// ── Error banner ────────────────────────────────────────────────────────────

describe("email-preview-pane error banner", () => {
  it("is absent when error is null", () => {
    const { container } = render(EmailPreviewPane, base({ error: null }));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("appears and shows the error message when error is set", () => {
    const { container } = render(EmailPreviewPane, base({ error: "Erreur de rendu" }));
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain("Erreur de rendu");
  });
});

// ── Tab widget ──────────────────────────────────────────────────────────────

describe("email-preview-pane tabs", () => {
  it("defaults to the HTML tab being active", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    const htmlTab = getByTestId("html-tab");
    const textTab = getByTestId("text-tab");
    expect(htmlTab.getAttribute("aria-selected")).toBe("true");
    expect(textTab.getAttribute("aria-selected")).toBe("false");
  });

  it("HTML panel is visible by default; text panel is hidden", () => {
    const { container } = render(EmailPreviewPane, base());
    const htmlPanel = container.querySelector("#panel-html");
    const textPanel = container.querySelector("#panel-text");
    expect(htmlPanel?.hasAttribute("hidden")).toBe(false);
    expect(textPanel?.hasAttribute("hidden")).toBe(true);
  });

  it("switches to the text tab on click", async () => {
    const { getByTestId, container } = render(EmailPreviewPane, base());
    await fireEvent.click(getByTestId("text-tab"));
    expect(getByTestId("text-tab").getAttribute("aria-selected")).toBe("true");
    expect(getByTestId("html-tab").getAttribute("aria-selected")).toBe("false");
    expect(container.querySelector("#panel-text")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#panel-html")?.hasAttribute("hidden")).toBe(true);
  });

  it("switches back to the HTML tab on click", async () => {
    const { getByTestId, container } = render(EmailPreviewPane, base());
    await fireEvent.click(getByTestId("text-tab"));
    await fireEvent.click(getByTestId("html-tab"));
    expect(getByTestId("html-tab").getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("#panel-html")?.hasAttribute("hidden")).toBe(false);
  });

  it("active tab has tabindex 0; inactive tab has tabindex -1", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    expect(getByTestId("html-tab").getAttribute("tabindex")).toBe("0");
    expect(getByTestId("text-tab").getAttribute("tabindex")).toBe("-1");
  });

  it("tab strip has role tablist with accessible label", () => {
    const { container } = render(EmailPreviewPane, base());
    const strip = container.querySelector('[role="tablist"]');
    expect(strip).toBeTruthy();
    expect(strip?.getAttribute("aria-label")).toBeTruthy();
  });

  it("each panel is labelled by its tab", () => {
    const { container } = render(EmailPreviewPane, base());
    expect(container.querySelector("#panel-html")?.getAttribute("aria-labelledby")).toBe("tab-html");
    expect(container.querySelector("#panel-text")?.getAttribute("aria-labelledby")).toBe("tab-text");
  });
});

// ── Keyboard navigation ─────────────────────────────────────────────────────

describe("email-preview-pane keyboard navigation", () => {
  it("ArrowRight moves focus from html to text tab", async () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    await fireEvent.keyDown(getByTestId("html-tab"), { key: "ArrowRight" });
    expect(getByTestId("text-tab").getAttribute("aria-selected")).toBe("true");
  });

  it("ArrowLeft wraps from html tab back to text tab", async () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    await fireEvent.keyDown(getByTestId("html-tab"), { key: "ArrowLeft" });
    expect(getByTestId("text-tab").getAttribute("aria-selected")).toBe("true");
  });

  it("Home key activates the first tab", async () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    await fireEvent.click(getByTestId("text-tab"));
    await fireEvent.keyDown(getByTestId("text-tab"), { key: "Home" });
    expect(getByTestId("html-tab").getAttribute("aria-selected")).toBe("true");
  });

  it("End key activates the last tab", async () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    await fireEvent.keyDown(getByTestId("html-tab"), { key: "End" });
    expect(getByTestId("text-tab").getAttribute("aria-selected")).toBe("true");
  });
});

// ── iframe binding ──────────────────────────────────────────────────────────

describe("email-preview-pane iframe", () => {
  it("sets srcdoc to the html prop", () => {
    const { getByTestId } = render(EmailPreviewPane, base({ html: "<h1>Test</h1>" }));
    const iframe = getByTestId("email-preview-iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("srcdoc")).toBe("<h1>Test</h1>");
  });

  it("has a sandbox attribute", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    const iframe = getByTestId("email-preview-iframe");
    expect(iframe.hasAttribute("sandbox")).toBe(true);
    // sandbox must NOT grant scripts or same-origin access
    const val = iframe.getAttribute("sandbox") ?? "";
    expect(val).not.toContain("allow-scripts");
    expect(val).not.toContain("allow-same-origin");
  });

  it("has an accessible title", () => {
    const { getByTestId } = render(EmailPreviewPane, base());
    expect(getByTestId("email-preview-iframe").getAttribute("title")).toBeTruthy();
  });
});

// ── Plain-text panel ────────────────────────────────────────────────────────

describe("email-preview-pane plain-text", () => {
  it("renders plain text in the pre element", async () => {
    const { container, getByTestId } = render(EmailPreviewPane, base({ text: "Hello world" }));
    await fireEvent.click(getByTestId("text-tab"));
    const pre = container.querySelector(".email-preview-pane__plaintext");
    expect(pre?.textContent).toBe("Hello world");
  });

  it("pre has tabindex 0 for keyboard scroll access", () => {
    const { container } = render(EmailPreviewPane, base());
    const pre = container.querySelector(".email-preview-pane__plaintext");
    expect(pre?.getAttribute("tabindex")).toBe("0");
  });

  it("pre has an accessible aria-label", () => {
    const { container } = render(EmailPreviewPane, base());
    const pre = container.querySelector(".email-preview-pane__plaintext");
    expect(pre?.getAttribute("aria-label")).toBeTruthy();
  });
});

// ── Loading state ───────────────────────────────────────────────────────────

describe("email-preview-pane loading", () => {
  it("shows spinner overlay when loading is true", () => {
    const { container } = render(EmailPreviewPane, base({ loading: true }));
    expect(container.querySelector(".email-preview-pane__overlay")).toBeTruthy();
    expect(container.querySelector(".email-preview-pane__spinner")).toBeTruthy();
  });

  it("hides spinner overlay when loading is false", () => {
    const { container } = render(EmailPreviewPane, base({ loading: false }));
    expect(container.querySelector(".email-preview-pane__overlay")).toBeNull();
  });

  it("sets aria-busy on the HTML panel while loading", () => {
    const { container } = render(EmailPreviewPane, base({ loading: true }));
    const htmlPanel = container.querySelector("#panel-html");
    expect(htmlPanel?.getAttribute("aria-busy")).toBe("true");
  });

  it("clears aria-busy on the HTML panel when not loading", () => {
    const { container } = render(EmailPreviewPane, base({ loading: false }));
    const htmlPanel = container.querySelector("#panel-html");
    // aria-busy should be "false" or absent
    const val = htmlPanel?.getAttribute("aria-busy");
    expect(val === "false" || val === null).toBe(true);
  });
});

// ── Width prop ──────────────────────────────────────────────────────────────

describe("email-preview-pane width", () => {
  it("sets --preview-max-width to 600px for desktop", () => {
    const { container } = render(EmailPreviewPane, base({ width: "desktop" }));
    const window = container.querySelector(".email-preview-pane__paper-window") as HTMLElement;
    expect(window?.style.getPropertyValue("--preview-max-width")).toBe("600px");
  });

  it("sets --preview-max-width to 375px for mobile", () => {
    const { container } = render(EmailPreviewPane, base({ width: "mobile" }));
    const window = container.querySelector(".email-preview-pane__paper-window") as HTMLElement;
    expect(window?.style.getPropertyValue("--preview-max-width")).toBe("375px");
  });
});
