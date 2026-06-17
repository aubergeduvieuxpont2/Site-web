import { animate, inView, stagger } from "motion";

const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const EASE = [0.16, 1, 0.3, 1] as const;

type RevealParams = {
  y?: number;
  x?: number;
  delay?: number;
  duration?: number;
  amount?: number;
};

/**
 * Reveal a single element when it scrolls into view.
 * Usage: <div use:reveal={{ y: 28, delay: 0.1 }}>
 */
export function reveal(node: HTMLElement, params: RevealParams = {}) {
  const { y = 24, x = 0, delay = 0, duration = 0.8, amount = 0.1 } = params;

  if (prefersReduced) {
    node.style.opacity = "1";
    return {};
  }

  node.style.opacity = "0";
  const stop = inView(
    node,
    () => {
      animate(
        node,
        { opacity: [0, 1], x: [x, 0], y: [y, 0] },
        { duration, delay, ease: EASE },
      );
    },
    { amount },
  );

  return { destroy: () => stop() };
}

type StaggerParams = {
  y?: number;
  duration?: number;
  each?: number;
  amount?: number;
  selector?: string;
};

/**
 * Reveal the direct children of a container with a stagger.
 * Usage: <ul use:revealStagger={{ each: 0.07 }}>
 */
export function revealStagger(node: HTMLElement, params: StaggerParams = {}) {
  const {
    y = 22,
    duration = 0.7,
    each = 0.08,
    amount = 0.1,
    selector = ":scope > *",
  } = params;

  const children = Array.from(
    node.querySelectorAll<HTMLElement>(selector),
  );

  if (prefersReduced) {
    children.forEach((child) => (child.style.opacity = "1"));
    return {};
  }

  children.forEach((child) => (child.style.opacity = "0"));

  const stop = inView(
    node,
    () => {
      animate(
        children,
        { opacity: [0, 1], y: [y, 0] },
        { duration, delay: stagger(each), ease: EASE },
      );
    },
    { amount },
  );

  return { destroy: () => stop() };
}

/**
 * Count a numeric value up when it enters view.
 * Usage: <span use:countUp={{ to: 1200, suffix: " m" }}>
 */
export function countUp(
  node: HTMLElement,
  params: { to: number; from?: number; duration?: number; suffix?: string; prefix?: string },
) {
  const { to, from = 0, duration = 1.6, suffix = "", prefix = "" } = params;

  if (prefersReduced) {
    node.textContent = `${prefix}${to}${suffix}`;
    return {};
  }

  node.textContent = `${prefix}${from}${suffix}`;
  const stop = inView(
    node,
    () => {
      animate(from, to, {
        duration,
        ease: EASE,
        onUpdate: (value) => {
          node.textContent = `${prefix}${Math.round(value).toLocaleString("fr-CA")}${suffix}`;
        },
      });
    },
    { amount: 0.6 },
  );

  return { destroy: () => stop() };
}
