<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";
  import Nav from "$lib/components/Nav.svelte";
  import Footer from "$lib/components/Footer.svelte";

  // The shell only needs the children snippet. The authenticated user loaded in
  // `+layout.ts` is surfaced as `data.user` for child routes (profil, admin);
  // the Nav derives its own view state, so it takes no props here.
  let { children }: { children: import("svelte").Snippet } = $props();

  let mainEl: HTMLElement | undefined = $state();
  let prefersReducedMotion = false;

  function triggerEnter() {
    if (prefersReducedMotion || !mainEl) return;
    // Remove first so the animation can re-run on every client navigation.
    mainEl.classList.remove("layout-shell__main--entering");
    void mainEl.offsetWidth; // force reflow so the browser restarts @keyframes
    mainEl.classList.add("layout-shell__main--entering");
  }

  onMount(() => {
    prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    triggerEnter();
  });

  // onMount covers the initial hard load; afterNavigate covers every
  // subsequent client-side route change. Together they cover all entries.
  afterNavigate(() => {
    triggerEnter();
  });
</script>

<a href="#main" class="layout-shell__skip-link" data-testid="skip-link">
  Passer au contenu principal
</a>

<Nav />

<main
  id="main"
  class="layout-shell__main"
  data-testid="main-content"
  bind:this={mainEl}
>
  {@render children()}
</main>

<Footer />

<style>
  /* Off-screen (not display:none) so it stays in the tab order and is the
     first focusable element on the page. */
  .layout-shell__skip-link {
    position: absolute;
    top: -200%;
    left: 1rem;
    z-index: 60; /* above the fixed Nav (z-50) */
    padding: 0.5rem 1rem;
    background: var(--color-ink);
    color: #fff;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-decoration: none;
    border-radius: var(--radius-blueprint);
    transition: top 0.12s ease;
    white-space: nowrap;
  }

  .layout-shell__skip-link:focus-visible {
    top: 1rem;
    outline: 2px solid #fff;
    outline-offset: 3px;
  }

  .layout-shell__main {
    min-height: 100dvh;
    /* No padding-top: the Nav is fixed and each page manages its own offset. */
  }

  @keyframes shell-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Belt-and-suspenders with the JS guard: the animation is never defined
     under reduced-motion, so it can never fire even if the class is applied. */
  @media (prefers-reduced-motion: no-preference) {
    .layout-shell__main--entering {
      animation: shell-enter 400ms cubic-bezier(0.33, 1, 0.68, 1) both;
    }
  }
</style>
