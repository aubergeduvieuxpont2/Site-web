/**
 * Modal.svelte — WS-A shared modal component.
 *
 * Extracted from RoomAssignmentDrawer's portal/focus-trap/Escape logic.
 * Snippet-based, portals to <body>, role="dialog", manages focus return.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import * as fs from "fs";
import * as path from "path";

import Modal from "../Modal.svelte";

const MODAL_PATH = path.resolve(__dirname, "../Modal.svelte");
const src = fs.readFileSync(MODAL_PATH, "utf-8");

afterEach(() => cleanup());

// A minimal snippet with a single focusable button so behavioral tests have
// dialog content. `createRawSnippet` is the public API for building a Snippet
// outside a .svelte template.
function bodySnippet() {
  return createRawSnippet(() => ({
    render: () => `<button type="button" data-testid="modal-child-btn">OK</button>`,
  }));
}

// ── Source-level checks ──────────────────────────────────────────────────────

describe("Modal.svelte — source structure", () => {
  it("has role=dialog on the modal panel element", () => {
    expect(src).toContain('role="dialog"');
  });

  it("sets aria-modal=true", () => {
    expect(src).toContain("aria-modal");
  });

  it("accepts a label for aria-labelledby / aria-label", () => {
    const hasLabelledBy = src.includes("aria-labelledby");
    const hasLabel = src.includes("aria-label");
    expect(hasLabelledBy || hasLabel).toBe(true);
  });

  it("closes on Escape keydown", () => {
    const hasEscape =
      src.includes('"Escape"') || src.includes("'Escape'") || src.includes("`Escape`");
    expect(hasEscape).toBe(true);
  });

  it("renders a backdrop element with a default testid for click-to-close", () => {
    expect(src).toContain("modal-backdrop");
  });

  it("closes when the backdrop is clicked", () => {
    const hasOnClick = src.includes("onclick") || src.includes("on:click");
    expect(hasOnClick).toBe(true);
  });

  it("does not inject raw HTML", () => {
    expect(src).not.toContain("{@html");
    expect(src).not.toContain("innerHTML");
  });

  it("exposes an onClose prop", () => {
    expect(src).toContain("onClose");
  });

  it("portals content to document body", () => {
    const hasPortal = src.includes("document.body") || src.includes("portal");
    expect(hasPortal).toBe(true);
  });

  it("traps focus within the modal (Tab handling over focusable elements)", () => {
    const hasFocusTrap =
      src.includes('"Tab"') ||
      src.includes("'Tab'") ||
      src.includes("querySelectorAll") ||
      src.includes("focusable");
    expect(hasFocusTrap).toBe(true);
  });

  it("returns focus to the previously-focused element on close", () => {
    expect(src).toContain("previouslyFocused");
  });
});

// ── Behavioral tests ─────────────────────────────────────────────────────────

describe("Modal.svelte — behavior", () => {
  it("renders children inside a role=dialog panel", () => {
    const { getByTestId } = render(Modal, {
      props: { open: true, onClose: vi.fn(), children: bodySnippet() },
    });
    const dialog = getByTestId("modal-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(getByTestId("modal-child-btn")).not.toBeNull();
  });

  it("does not throw when rendered without children", () => {
    expect(() =>
      render(Modal, { props: { open: true, onClose: vi.fn() } }),
    ).not.toThrow();
  });

  it("moves focus to the dialog panel when opened", async () => {
    const { getByTestId } = render(Modal, {
      props: { open: true, onClose: vi.fn(), children: bodySnippet() },
    });
    await tick();
    await tick();
    expect(document.activeElement).toBe(getByTestId("modal-dialog"));
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(Modal, { props: { open: true, onClose, children: bodySnippet() } });
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when closed", async () => {
    const onClose = vi.fn();
    render(Modal, { props: { open: false, onClose, children: bodySnippet() } });
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(Modal, {
      props: { open: true, onClose, children: bodySnippet() },
    });
    await fireEvent.click(getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forwards a custom backdrop testid", () => {
    const { getByTestId } = render(Modal, {
      props: {
        open: true,
        onClose: vi.fn(),
        backdropTestid: "rad-backdrop",
        children: bodySnippet(),
      },
    });
    expect(getByTestId("rad-backdrop")).not.toBeNull();
  });
});

// ── Nested modals (modal stack) ──────────────────────────────────────────────
// The detail modal hosts the RoomAssignmentDrawer, which owns its own Modal —
// so two Modals can be open at once. Escape and backdrop clicks must only act
// on the TOPMOST open modal: one Escape press closes one layer, not both.

describe("Modal.svelte — nested modals close one layer at a time", () => {
  it("Escape closes only the topmost modal, then the next Escape closes the outer one", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    render(Modal, {
      props: {
        open: true,
        onClose: outerClose,
        backdropTestid: "outer-backdrop",
        children: bodySnippet(),
      },
    });
    // Mounted after the outer modal → topmost.
    const inner = render(Modal, {
      props: {
        open: true,
        onClose: innerClose,
        backdropTestid: "inner-backdrop",
        children: bodySnippet(),
      },
    });
    await tick();

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();

    // The consumer reacts to onClose by flipping `open` — simulate that.
    await inner.rerender({ open: false });
    await tick();

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(outerClose).toHaveBeenCalledTimes(1);
    expect(innerClose).toHaveBeenCalledTimes(1);
  });

  it("backdrop clicks only close the topmost modal", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    const outer = render(Modal, {
      props: {
        open: true,
        onClose: outerClose,
        backdropTestid: "outer-backdrop",
        children: bodySnippet(),
      },
    });
    render(Modal, {
      props: {
        open: true,
        onClose: innerClose,
        backdropTestid: "inner-backdrop",
        children: bodySnippet(),
      },
    });
    await tick();

    // Clicking the OUTER backdrop while the inner modal is on top is a no-op.
    await fireEvent.click(outer.getByTestId("outer-backdrop"));
    expect(outerClose).not.toHaveBeenCalled();
    expect(innerClose).not.toHaveBeenCalled();
  });

  it("a modal unmounted while open leaves the remaining modal responsive to Escape", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();

    render(Modal, {
      props: {
        open: true,
        onClose: outerClose,
        children: bodySnippet(),
      },
    });
    const inner = render(Modal, {
      props: {
        open: true,
        onClose: innerClose,
        backdropTestid: "inner-backdrop",
        children: bodySnippet(),
      },
    });
    await tick();

    inner.unmount();
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(outerClose).toHaveBeenCalledTimes(1);
    expect(innerClose).not.toHaveBeenCalled();
  });
});
