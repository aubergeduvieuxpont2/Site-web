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
    children: Snippet;
    /** Forwarded as data-testid on the backdrop element. */
    backdropTestid?: string;
  }

  let { open, onClose, labelId, panelClass = '', children, backdropTestid }: Props = $props();

  let panelEl: HTMLElement | undefined;
  // Captured just before we steal focus; restored when the dialog closes.
  let previouslyFocused: HTMLElement | null = null;

  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      tick().then(() => panelEl?.focus());
    } else {
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (!open) return;
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
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div use:portal class="modal-host" aria-hidden={!open}>
  <!-- Backdrop — click anywhere outside the dialog to close -->
  <div
    class="modal-host__backdrop"
    aria-hidden="true"
    data-testid={backdropTestid}
    onclick={onClose}
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
  >
    {@render children()}
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
