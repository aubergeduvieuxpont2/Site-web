import { animate, inView, stagger } from "motion";

const EASE = [0.33, 1, 0.68, 1] as const;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

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
  const { y = 16, x = 0, delay = 0, duration = 0.6, amount = 0.1 } = params;

  if (prefersReducedMotion()) {
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
    y = 16,
    duration = 0.6,
    each = 0.08,
    amount = 0.1,
    selector = ":scope > *",
  } = params;

  const children = Array.from(
    node.querySelectorAll<HTMLElement>(selector),
  );

  if (prefersReducedMotion()) {
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
  params: {
    to: number;
    from?: number;
    duration?: number;
    suffix?: string;
    prefix?: string;
    localize?: boolean;
  },
) {
  const { to, from = 0, duration = 1.6, suffix = "", prefix = "", localize = true } = params;
  // localize: false for values like years, where "1 972" would be wrong.
  const fmt = (n: number) => (localize ? n.toLocaleString("fr-CA") : String(n));

  if (prefersReducedMotion()) {
    node.textContent = `${prefix}${fmt(to)}${suffix}`;
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
          node.textContent = `${prefix}${fmt(Math.round(value))}${suffix}`;
        },
      });
    },
    { amount: 0.6 },
  );

  return { destroy: () => stop() };
}
