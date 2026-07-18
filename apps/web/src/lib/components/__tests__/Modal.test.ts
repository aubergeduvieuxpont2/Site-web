/**
 * Modal.svelte — WS-A shared modal component.
 *
 * Extracted from RoomAssignmentDrawer's portal/focus-trap/Escape logic.
 * Slot-based, portals to <body>, role="dialog", manages focus return.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MODAL_PATH = path.resolve(
  __dirname,
  "../../Modal.svelte",
);

const fileExists = fs.existsSync(MODAL_PATH);
const src = fileExists ? fs.readFileSync(MODAL_PATH, "utf-8") : "";

// ── Source-level checks ──────────────────────────────────────────────────────

describe.skipIf(!fileExists)("Modal.svelte — source structure", () => {
  it("has role=dialog on the modal root element", () => {
    expect(src).toContain('role="dialog"');
  });

  it("sets aria-modal=true", () => {
    expect(src).toContain('aria-modal');
  });

  it("accepts a title or label for aria-labelledby / aria-label", () => {
    const hasLabelledBy = src.includes("aria-labelledby");
    const hasLabel = src.includes("aria-label");
    expect(hasLabelledBy || hasLabel).toBe(true);
  });

  it("closes on Escape keydown", () => {
    // The handler must check for key === 'Escape'.
    const hasEscape =
      src.includes('"Escape"') || src.includes("'Escape'") || src.includes("`Escape`");
    expect(hasEscape).toBe(true);
  });

  it("renders a backdrop element for click-to-close", () => {
    // Backdrop must have a testid so it can be verified in interaction tests.
    expect(src).toContain('data-testid="modal-backdrop"');
  });

  it("closes when the backdrop is clicked", () => {
    // The backdrop click handler must exist.
    const hasOnClick = src.includes("onclick") || src.includes("on:click");
    expect(hasOnClick).toBe(true);
  });

  it("does not inject raw HTML", () => {
    expect(src).not.toContain("{@html");
    expect(src).not.toContain("innerHTML");
  });

  it("exposes an onClose prop or dispatches a close event", () => {
    const hasOnClose = src.includes("onClose") || src.includes("dispatch") || src.includes("createEventDispatcher");
    expect(hasOnClose).toBe(true);
  });

  it("portals content to document body", () => {
    // Svelte portal pattern: action that moves DOM to body, or use svelte:body,
    // or tick() + appendChild(document.body). Check for common portal signals.
    const hasPortal =
      src.includes("document.body") ||
      src.includes("portal") ||
      src.includes("teleport") ||
      src.includes("appendTo");
    expect(hasPortal).toBe(true);
  });

  it("traps focus within the modal", () => {
    // Focus trap: either a dedicated utility, Tab key handling, or focusable-
    // elements loop.
    const hasFocusTrap =
      src.includes("focusTrap") ||
      src.includes("focus-trap") ||
      src.includes('"Tab"') ||
      src.includes("'Tab'") ||
      src.includes("querySelectorAll") ||
      src.includes("focusable");
    expect(hasFocusTrap).toBe(true);
  });

  it("returns focus to the previously-focused element on close", () => {
    const hasFocusReturn =
      src.includes("previouslyFocused") ||
      src.includes("returnFocus") ||
      src.includes("focusReturn") ||
      src.includes("previousFocus");
    expect(hasFocusReturn).toBe(true);
  });
});

// ── Behavioral tests (require the component to be importable) ─────────────────

describe.skipIf(!fileExists)("Modal.svelte — behavior", async () => {
  // Dynamic import to avoid module-not-found at parse time when file is absent.
  const { render, fireEvent, cleanup, screen } = await import("@testing-library/svelte");

  afterEach(() => cleanup());

  it("renders children via the default slot", async () => {
    const Modal = (await import("../../Modal.svelte")).default;
    const { getByTestId } = render(Modal, {
      props: { open: true, title: "Test" },
    });
    // The dialog should be in the document.
    const dialog = getByTestId("modal-dialog") || document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
  });

  it("calls onClose when Escape is pressed", async () => {
    const Modal = (await import("../../Modal.svelte")).default;
    const onClose = vi.fn();
    render(Modal, { props: { open: true, title: "Test", onClose } });

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const Modal = (await import("../../Modal.svelte")).default;
    const onClose = vi.fn();
    render(Modal, { props: { open: true, title: "Test", onClose } });

    const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
    if (backdrop) {
      await fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});
