import { writable } from "svelte/store";

/**
 * Minimal History-API router for a Vite SPA (Svelte 5).
 * The Cloudflare Worker serves index.html for all paths (SPA fallback),
 * so clean URLs like /chambres work on hard refresh too.
 */
function createPath() {
  const initial =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const store = writable(initial);

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => store.set(window.location.pathname));
  }

  function navigate(to: string) {
    if (typeof window === "undefined") return;
    if (to === window.location.pathname) {
      window.scrollTo({ top: 0 });
      return;
    }
    window.history.pushState({}, "", to);
    store.set(to);
    window.scrollTo({ top: 0 });
  }

  return { subscribe: store.subscribe, navigate };
}

export const path = createPath();

export function navigate(to: string) {
  path.navigate(to);
}

/** Svelte action: intercept internal <a href> clicks for client-side nav. */
export function link(node: HTMLAnchorElement) {
  function onClick(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const href = node.getAttribute("href") ?? "";
    if (
      !href ||
      href.startsWith("http") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      node.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  }

  node.addEventListener("click", onClick);
  return {
    destroy() {
      node.removeEventListener("click", onClick);
    },
  };
}
