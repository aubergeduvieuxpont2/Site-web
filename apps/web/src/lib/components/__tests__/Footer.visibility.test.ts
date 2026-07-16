// @vitest-environment jsdom
//
// Regression coverage for the pruned-selector bug (SPEC change 2 / criterion #3):
// footer visibility must be driven by reactive state bound in markup
// (`class:footer--visible={visible}`), NOT an imperative `classList.add()`. With
// the imperative version the compiler pruned `.footer--visible` as an unused
// selector and the footer stayed at `opacity: 0`. Mounting the component in a DOM
// runs `onMount`, which sets `visible = true` (reduced-motion branch), and the
// reactive binding adds the class.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import Footer from "../Footer.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Footer (reactive visibility)", () => {
  it("starts without footer--visible and adds it once mounted (reduced-motion)", async () => {
    // Force the reduced-motion branch so visibility flips synchronously inside
    // onMount without depending on IntersectionObserver.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      })),
    );

    const { container } = render(Footer);
    const footer = container.querySelector('[data-testid="footer"]');
    expect(footer).toBeTruthy();

    // Let onMount + the reactive state update flush.
    await tick();

    expect(footer?.classList.contains("footer")).toBe(true);
    expect(footer?.classList.contains("footer--visible")).toBe(true);
  });

  it("keeps the CITQ number reachable in the reactive markup", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      })),
    );

    const { container } = render(Footer);
    await tick();

    expect(container.querySelector('[data-testid="footer-citq"]')?.textContent).toContain(
      "CITQ #304542",
    );
  });
});
