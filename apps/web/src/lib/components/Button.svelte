<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "primary",
    href = undefined,
    disabled = false,
    type = "button",
    size = "md",
    block = false,
    children,
    class: klass = "",
  }: {
    variant?: "primary" | "secondary" | "action" | "ghost";
    href?: string;
    disabled?: boolean;
    type?: "button" | "submit";
    size?: "md" | "sm";
    block?: boolean;
    children: Snippet;
    class?: string;
  } = $props();

  const buttonClass = ["button", `button--${variant}`, size === "sm" ? "button--sm" : "", block ? "button--block" : "", klass]
    .filter(Boolean)
    .join(" ");

  const tag = href ? "a" : "button";
</script>

{#if tag === "a"}
  <a
    {href}
    class={buttonClass}
    aria-disabled={disabled ? "true" : undefined}
    tabindex={disabled ? -1 : undefined}
    data-testid="button-link"
  >
    <span class="button__label" data-testid="button-label">{@render children()}</span>
  </a>
{:else}
  <button
    {type}
    {disabled}
    class={buttonClass}
    aria-disabled={disabled ? "true" : undefined}
    data-testid="button"
  >
    <span class="button__label" data-testid="button-label">{@render children()}</span>
  </button>
{/if}

<style>
  /* ─── Custom properties (consumed from global tokens) ─── */
  :global(.button) {
    --btn-height: 44px;
    --btn-px: 24px;
    --btn-font-size: 13px;
    --btn-tracking: 0.06em;
    --btn-radius: var(--radius, 0.25rem);
    --btn-transition-duration: 180ms;
  }

  /* ─── Base ─── */
  :global(.button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--btn-height);
    min-width: var(--btn-height); /* touch target floor */
    padding: 0 var(--btn-px);
    border: 1px solid transparent;
    border-radius: var(--btn-radius);
    cursor: pointer;
    text-decoration: none;
    user-select: none;
    position: relative;
    /* typography */
    font-family: var(--font-sans, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif);
    font-size: var(--btn-font-size);
    font-weight: 600;
    line-height: 1;
    letter-spacing: var(--btn-tracking);
    text-transform: uppercase;
    white-space: nowrap;
    /* animation */
    transition:
      transform var(--btn-transition-duration) cubic-bezier(0.33, 1, 0.68, 1),
      background-color var(--btn-transition-duration) ease,
      border-color var(--btn-transition-duration) ease,
      opacity var(--btn-transition-duration) ease;
    will-change: transform;
  }

  /* ─── Label span ─── */
  :global(.button__label) {
    pointer-events: none;
  }

  /* ─── Variants ─── */
  :global(.button--primary) {
    background-color: var(--color-primary, #000000);
    color: var(--color-on-primary, #ffffff);
    border-color: var(--color-primary, #000000);
  }

  :global(.button--secondary) {
    background-color: transparent;
    color: var(--color-primary, #000000);
    border-color: var(--color-primary, #000000);
  }

  :global(.button--action) {
    background-color: var(--color-secondary-container, #fd761a);
    color: var(--color-on-secondary-container, #ffffff);
    border-color: var(--color-secondary-container, #fd761a);
  }

  :global(.button--ghost) {
    background-color: transparent;
    color: var(--color-primary, #000000);
    border-color: transparent;
  }

  /* ─── Size modifier ─── */
  :global(.button--sm) {
    --btn-height: 44px; /* touch floor maintained */
    --btn-px: 16px;
    --btn-font-size: 11px;
    --btn-tracking: 0.08em;
  }

  /* ─── Block modifier ─── */
  :global(.button--block) {
    display: flex;
    width: 100%;
  }

  /* ─── Hover (lift) — skipped under reduced-motion ─── */
  @media (hover: hover) {
    :global(.button:not(:disabled):not([aria-disabled="true"]):hover) {
      transform: translateY(-2px);
    }

    :global(.button--secondary:not(:disabled):not([aria-disabled="true"]):hover) {
      background-color: var(--color-surface-container, #eceef0);
    }
  }

  /* ─── Focus ring ─── */
  :global(.button:focus-visible) {
    outline: 2px solid var(--color-primary, #000000);
    outline-offset: 3px;
  }

  /* ─── Active (press feedback) ─── */
  :global(.button:not(:disabled):not([aria-disabled="true"]):active) {
    transform: translateY(0);
  }

  /* ─── Disabled ─── */
  :global(.button:disabled),
  :global(.button[aria-disabled="true"]) {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* ─── Reduced motion ─── */
  @media (prefers-reduced-motion: reduce) {
    :global(.button) {
      transition: opacity var(--btn-transition-duration) ease;
      will-change: auto;
    }

    :global(.button:hover) {
      transform: none;
    }
  }
</style>
