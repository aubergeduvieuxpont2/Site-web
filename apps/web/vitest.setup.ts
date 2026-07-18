import { expect, afterEach, vi } from "vitest";

// Polyfill IntersectionObserver for jsdom
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
} as any;

// Polyfill ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

// Polyfill Element.animate for jsdom — Svelte transitions (fade/fly) call it
// when components mount/unmount. jsdom has no Web Animations API, so return a
// minimal Animation-like stub whose finished promise resolves immediately.
if (typeof Element !== "undefined" && !Element.prototype.animate) {
  Element.prototype.animate = function animate() {
    return {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      reverse() {},
      addEventListener() {},
      removeEventListener() {},
      onfinish: null,
      oncancel: null,
    } as unknown as Animation;
  };
}
