<script module lang="ts">
  // Stack of currently-OPEN Modal instances, shared across every Modal in the
  // app (nested modals: e.g. the RoomAssignmentDrawer's Modal opens inside the
  // ReservationDetailModal's). Escape and backdrop clicks only act on the
  // topmost instance so each press/click closes exactly one layer.
  const openStack: symbol[] = [];
</script>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    /** id of the element that labels the dialog (aria-labelledby). */
    labelId?: string;
    /**
     * CSS class added to the panel div (portaled to <body>).
     * Use :global() in the consuming component to style it —
     * the panel is outside the scoped style tree.
     */
    panelClass?: string;
    children?: Snippet;
    /** Forwarded as data-testid on the backdrop element (default "modal-backdrop"). */
    backdropTestid?: string;
    /**
     * Forwarded as data-testid on the dialog panel (default "modal-dialog").
     * Nested/stacked modals must pass distinct values so a query for
     * data-testid="modal-dialog" never matches two panels at once.
     */
    dialogTestid?: string;
  }

  let {
    open,
    onClose,
    labelId,
    panelClass = '',
    children,
    backdropTestid = 'modal-backdrop',
    dialogTestid = 'modal-dialog',
  }: Props = $props();

  let panelEl: HTMLElement | undefined;
  // Captured just before we steal focus; restored when the dialog closes.
  let previouslyFocused: HTMLElement | null = null;

  // ── Modal stack membership ───────────────────────────────────────────────
  const stackToken = Symbol('modal');

  function isTopmost(): boolean {
    return openStack[openStack.length - 1] === stackToken;
  }

  function leaveStack(): void {
    const i = openStack.indexOf(stackToken);
    if (i !== -1) openStack.splice(i, 1);
  }

  $effect(() => {
    if (open) {
      openStack.push(stackToken);
      previouslyFocused = document.activeElement as HTMLElement | null;
      tick().then(() => panelEl?.focus());
    } else {
      leaveStack();
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  });

  function onBackdropClick(): void {
    // Ignore clicks on a backdrop that sits under another open modal.
    if (isTopmost()) onClose();
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Only the topmost open modal handles keys — nested modals close (and
    // trap focus) one layer at a time.
    if (!open || !isTopmost()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelEl) return;
    const focusable = Array.from(
      panelEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
          'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === panelEl);
    if (focusable.length === 0) {
      e.preventDefault();
      panelEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelEl)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    // A modal unmounted while open must free its stack slot, or the next
    // modal underneath would never become topmost.
    leaveStack();
  });
</script>

<div use:portal class="modal-host" aria-hidden={!open}>
  <!-- Backdrop — click anywhere outside the dialog to close -->
  <div
    class="modal-host__backdrop"
    aria-hidden="true"
    data-testid={backdropTestid}
    onclick={onBackdropClick}
  ></div>

  <!-- Panel — the actual dialog element; visual styles via panelClass + :global() in consumer -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={panelEl}
    class="modal-host__panel{panelClass ? ' ' + panelClass : ''}"
    role="dialog"
    aria-modal="true"
    aria-labelledby={labelId}
    tabindex="-1"
    data-testid={dialogTestid}
  >
    {#if children}{@render children()}{/if}
  </div>
</div>

<style>
  .modal-host {
    display: contents;
  }

  .modal-host[aria-hidden='true'] .modal-host__backdrop,
  .modal-host[aria-hidden='true'] .modal-host__panel {
    pointer-events: none;
    visibility: hidden;
  }

  .modal-host__backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(28, 26, 23, 0.48);
    backdrop-filter: blur(1px);
    -webkit-backdrop-filter: blur(1px);
    opacity: 0;
    transition: opacity 220ms ease;
  }

  .modal-host:not([aria-hidden='true']) .modal-host__backdrop {
    opacity: 1;
  }

  /* Base panel: position + stacking only; visual styles set by consumer via panelClass. */
  .modal-host__panel {
    position: fixed;
    z-index: 50;
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-host__backdrop {
      transition: none;
    }
  }
</style>
