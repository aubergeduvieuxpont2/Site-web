<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    adminReservationAssignments,
    adminFreeRooms,
    adminAssignRoom,
    adminUnassignRoom,
    isError,
  } from '$lib/api';

  interface Props {
    reservationId: number;
    arrive: string | null;
    depart: string | null;
    roomCount: number | null;
  }

  let { reservationId, arrive, depart, roomCount }: Props = $props();

  // ── State ───────────────────────────────────────────────────────────────
  let isOpen = $state(false);
  let loading = $state(false);
  let busySlug = $state<string | null>(null);
  let error = $state<string | null>(null);
  let assignments = $state<{ slug: string; name: string }[]>([]);
  let freeRooms = $state<{ slug: string; name: string }[]>([]);

  const roomNameCache = new Map<string, string>();

  let panelEl: HTMLDivElement | undefined;
  // The element focused when the drawer opened (the trigger). Focus returns
  // here on close, satisfying the dialog focus-management contract.
  let previouslyFocused: HTMLElement | null = null;

  // ── Derived ─────────────────────────────────────────────────────────────
  // Parse a "YYYY-MM-DD" string as a *local* calendar date (no UTC day-shift).
  function parseCalDate(s: string | null): Date | null {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const ineligible = $derived.by(() => {
    const a = parseCalDate(arrive);
    const d = parseCalDate(depart);
    return a === null || d === null || d.getTime() <= a.getTime();
  });

  const atCapacity = $derived(roomCount != null && assignments.length >= roomCount);
  const capacityLabel = $derived(`${assignments.length} / ${roomCount ?? '?'}`);

  // ── Open / close ────────────────────────────────────────────────────────
  async function open(): Promise<void> {
    if (isOpen) return;
    isOpen = true;
    error = null;
    previouslyFocused = document.activeElement as HTMLElement | null;
    await tick();
    panelEl?.focus();

    if (ineligible) return; // ineligible notice shown; no network calls

    loading = true;
    const [assignRes, freeRes] = await Promise.all([
      adminReservationAssignments(reservationId),
      adminFreeRooms(reservationId),
    ]);
    if (isError(assignRes) || isError(freeRes)) {
      error = 'Erreur lors du chargement des chambres.';
      loading = false;
      return;
    }
    freeRes.rooms.forEach((r) => roomNameCache.set(r.slug, r.name));
    freeRooms = freeRes.rooms;
    assignments = assignRes.assignments.map((a) => ({
      slug: a.room_slug,
      name: roomNameCache.get(a.room_slug) ?? a.room_slug,
    }));
    loading = false;
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    previouslyFocused?.focus();
  }

  // ── Mutations (optimistic, with rollback) ───────────────────────────────
  async function assignRoom(slug: string, name: string): Promise<void> {
    if (atCapacity || busySlug) return;
    busySlug = slug;
    error = null;
    freeRooms = freeRooms.filter((r) => r.slug !== slug);
    assignments = [...assignments, { slug, name }];
    const res = await adminAssignRoom(reservationId, slug);
    if (isError(res)) {
      assignments = assignments.filter((a) => a.slug !== slug);
      freeRooms = [...freeRooms, { slug, name }];
      error = res.error || "Impossible d'assigner la chambre. Veuillez réessayer.";
    }
    busySlug = null;
  }

  async function unassignRoom(slug: string): Promise<void> {
    if (busySlug) return;
    busySlug = slug;
    error = null;
    const name = assignments.find((a) => a.slug === slug)?.name ?? slug;
    assignments = assignments.filter((a) => a.slug !== slug);
    freeRooms = [...freeRooms, { slug, name }];
    const res = await adminUnassignRoom(reservationId, slug);
    if (isError(res)) {
      freeRooms = freeRooms.filter((r) => r.slug !== slug);
      assignments = [...assignments, { slug, name }];
      error = res.error || 'Impossible de retirer la chambre. Veuillez réessayer.';
    }
    busySlug = null;
  }

  // ── Keyboard: Escape + focus trap ───────────────────────────────────────
  function handleKeydown(e: KeyboardEvent): void {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab' || !panelEl) return;
    const focusable = Array.from(
      panelEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));

  // Move the drawer root out to <body> so it escapes table stacking contexts.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<!-- ── Trigger (rendered in the table action cell) ── -->
<button
  type="button"
  class="room-assignment-drawer__trigger"
  aria-label={`Gérer les chambres — réservation ${reservationId}`}
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  data-testid="rad-trigger"
  onclick={open}
>
  Chambres
</button>

<!-- ── Drawer root (portaled to <body>) ── -->
<div
  use:portal
  class="room-assignment-drawer"
  aria-hidden={!isOpen}
  data-testid="room-assignment-drawer"
>
  <!-- Backdrop -->
  <div
    class="room-assignment-drawer__backdrop"
    aria-hidden="true"
    data-testid="rad-backdrop"
    onclick={close}
  ></div>

  <!-- Panel -->
  <div
    bind:this={panelEl}
    class="room-assignment-drawer__panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby={`rad-title-${reservationId}`}
    tabindex="-1"
    data-testid="rad-panel"
  >
    <!-- ── Header ── -->
    <div class="room-assignment-drawer__header">
      <div class="room-assignment-drawer__header-left">
        <h2 id={`rad-title-${reservationId}`} class="room-assignment-drawer__title">
          Assignation des chambres
        </h2>
        <span
          class="room-assignment-drawer__capacity-badge"
          class:room-assignment-drawer__capacity-badge--full={atCapacity}
          aria-label={`${assignments.length} chambre(s) sur ${roomCount ?? '?'} assignée(s)`}
          data-testid="rad-capacity-badge"
        >{capacityLabel}</span>
      </div>
      <button
        type="button"
        class="room-assignment-drawer__close"
        aria-label="Fermer"
        data-testid="rad-close"
        onclick={close}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- ── Content ── -->
    <div class="room-assignment-drawer__content">
      <!-- Loading skeleton -->
      <div
        class="room-assignment-drawer__loading"
        aria-live="polite"
        aria-label="Chargement en cours…"
        data-testid="rad-loading"
        hidden={!loading || ineligible}
      >
        <div class="room-assignment-drawer__skeleton"></div>
        <div class="room-assignment-drawer__skeleton rad-sk--short"></div>
        <div class="room-assignment-drawer__skeleton"></div>
        <div class="room-assignment-drawer__skeleton rad-sk--short"></div>
      </div>

      <!-- Ineligibility notice -->
      <div
        class="room-assignment-drawer__ineligible"
        role="alert"
        data-testid="rad-ineligible"
        hidden={!ineligible}
      >
        <svg aria-hidden="true" class="room-assignment-drawer__notice-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" />
          <path d="M10 6v4.5M10 13v.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
        <p class="room-assignment-drawer__notice-text">
          Les dates de cette réservation sont manquantes ou invalides.
        </p>
      </div>

      <!-- Error banner -->
      <div
        class="room-assignment-drawer__error"
        role="alert"
        aria-live="assertive"
        data-testid="rad-error"
        hidden={!error}
      >
        <span class="room-assignment-drawer__error-text" data-testid="rad-error-text">{error}</span>
        <button
          type="button"
          class="room-assignment-drawer__error-dismiss"
          aria-label="Fermer l'erreur"
          data-testid="rad-error-dismiss"
          onclick={() => (error = null)}
        >✕</button>
      </div>

      <!-- ── Assigned rooms ── -->
      <section
        class="room-assignment-drawer__section"
        aria-labelledby={`rad-assigned-heading-${reservationId}`}
        data-testid="rad-assigned-section"
      >
        <h3 id={`rad-assigned-heading-${reservationId}`} class="room-assignment-drawer__section-heading">
          Chambres assignées
        </h3>

        <ul class="room-assignment-drawer__list" data-testid="rad-assigned-list" hidden={loading || ineligible}>
          {#each assignments as room (room.slug)}
            <li class="room-assignment-drawer__item" data-slug={room.slug} data-testid="rad-assigned-item">
              <span class="room-assignment-drawer__room-name" data-testid="rad-assigned-room-name">{room.name}</span>
              <button
                type="button"
                class="room-assignment-drawer__unassign-btn"
                aria-label={`Retirer la chambre ${room.name}`}
                aria-busy={busySlug === room.slug}
                disabled={busySlug !== null}
                data-testid="rad-unassign-btn"
                onclick={() => unassignRoom(room.slug)}
              >Retirer</button>
            </li>
          {/each}
        </ul>

        <p
          class="room-assignment-drawer__empty"
          aria-live="polite"
          data-testid="rad-assigned-empty"
          hidden={loading || ineligible || assignments.length > 0}
        >Aucune chambre assignée.</p>
      </section>

      <hr class="room-assignment-drawer__divider" aria-hidden="true" />

      <!-- ── Available rooms ── -->
      <section
        class="room-assignment-drawer__section"
        aria-labelledby={`rad-free-heading-${reservationId}`}
        data-testid="rad-free-section"
      >
        <h3 id={`rad-free-heading-${reservationId}`} class="room-assignment-drawer__section-heading">
          Chambres disponibles
        </h3>

        <p
          class="room-assignment-drawer__at-capacity"
          role="status"
          data-testid="rad-at-capacity"
          hidden={loading || ineligible || !atCapacity}
        >Nombre maximum de chambres atteint pour cette réservation.</p>

        <ul class="room-assignment-drawer__list" data-testid="rad-free-list" hidden={loading || ineligible}>
          {#each freeRooms as room (room.slug)}
            <li class="room-assignment-drawer__item" data-slug={room.slug} data-testid="rad-free-item">
              <span class="room-assignment-drawer__room-name" data-testid="rad-free-room-name">{room.name}</span>
              <button
                type="button"
                class="room-assignment-drawer__assign-btn"
                aria-label={`Assigner la chambre ${room.name}`}
                aria-busy={busySlug === room.slug}
                disabled={atCapacity || busySlug !== null}
                data-testid="rad-assign-btn"
                onclick={() => assignRoom(room.slug, room.name)}
              >Assigner</button>
            </li>
          {/each}
        </ul>

        <p
          class="room-assignment-drawer__empty"
          aria-live="polite"
          data-testid="rad-free-empty"
          hidden={loading || ineligible || freeRooms.length > 0}
        >Aucune chambre disponible pour ces dates.</p>
      </section>
    </div>
  </div>
</div>

<style>
  /* ════════════════════════════════════════════════
     room-assignment-drawer — scoped styles
     ════════════════════════════════════════════════ */
  .room-assignment-drawer {
    --rad-surface: #f4efe6;
    --rad-surface-raised: #ece7db;
    --rad-surface-sunken: #e0dad0;
    --rad-border: #c4baa8;
    --rad-border-strong: #9a8e7e;
    --rad-primary: #1b3b2a;
    --rad-primary-hover: #254f38;
    --rad-primary-text: #f4efe6;
    --rad-accent: #7b4628;
    --rad-accent-hover: #6a3a20;
    --rad-text: #1c1a17;
    --rad-text-muted: #695e51;
    --rad-text-faint: #9a8e7e;
    --rad-danger: #8a2828;
    --rad-warning: #7a5c12;
    --rad-warning-text: #3d2c06;
    display: contents;
  }

  .room-assignment-drawer[aria-hidden='true'] .room-assignment-drawer__backdrop,
  .room-assignment-drawer[aria-hidden='true'] .room-assignment-drawer__panel {
    pointer-events: none;
    visibility: hidden;
  }

  .room-assignment-drawer__backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(28, 26, 23, 0.48);
    backdrop-filter: blur(1px);
    -webkit-backdrop-filter: blur(1px);
    opacity: 0;
    transition: opacity 220ms ease;
  }

  .room-assignment-drawer:not([aria-hidden='true']) .room-assignment-drawer__backdrop {
    opacity: 1;
  }

  .room-assignment-drawer__panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    width: min(380px, 100vw);
    display: flex;
    flex-direction: column;
    background: var(--rad-surface);
    border-left: 1px solid var(--rad-border);
    box-shadow: -6px 0 32px rgba(28, 26, 23, 0.14);
    transform: translateX(100%);
    transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }

  .room-assignment-drawer__panel::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    opacity: 0.028;
  }

  .room-assignment-drawer:not([aria-hidden='true']) .room-assignment-drawer__panel {
    transform: translateX(0);
  }

  .room-assignment-drawer__header {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 16px 20px;
    background: var(--rad-primary);
    border-bottom: 1px solid rgba(196, 186, 168, 0.3);
  }

  .room-assignment-drawer__header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .room-assignment-drawer__title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 19px;
    font-weight: 500;
    line-height: 1.25;
    color: var(--rad-primary-text);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .room-assignment-drawer__capacity-badge {
    flex-shrink: 0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 2px;
    background: rgba(244, 239, 230, 0.14);
    color: var(--rad-primary-text);
    border: 1px solid rgba(244, 239, 230, 0.22);
    white-space: nowrap;
    letter-spacing: 0.04em;
  }

  .room-assignment-drawer__capacity-badge--full {
    background: var(--rad-warning);
    border-color: transparent;
    color: var(--rad-primary-text);
  }

  .room-assignment-drawer__close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid rgba(244, 239, 230, 0.22);
    border-radius: 4px;
    color: var(--rad-primary-text);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .room-assignment-drawer__close:hover {
    background: rgba(244, 239, 230, 0.12);
    border-color: rgba(244, 239, 230, 0.35);
  }

  .room-assignment-drawer__close:focus-visible {
    outline: 2px solid var(--rad-accent);
    outline-offset: 2px;
  }

  .room-assignment-drawer__content {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .room-assignment-drawer__loading {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .room-assignment-drawer__loading[hidden] {
    display: none;
  }

  .room-assignment-drawer__skeleton {
    height: 40px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--rad-surface-sunken) 25%,
      var(--rad-border) 50%,
      var(--rad-surface-sunken) 75%
    );
    background-size: 200% 100%;
    animation: rad-shimmer 1.5s infinite;
  }

  .room-assignment-drawer__skeleton.rad-sk--short {
    width: 55%;
    height: 24px;
    margin-bottom: 8px;
  }

  @keyframes rad-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .room-assignment-drawer__ineligible {
    margin: 24px 20px;
    padding: 14px 16px;
    background: var(--rad-surface-raised);
    border: 1px solid var(--rad-border);
    border-left: 3px solid var(--rad-warning);
    border-radius: 4px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .room-assignment-drawer__ineligible[hidden] {
    display: none;
  }

  .room-assignment-drawer__notice-icon {
    flex-shrink: 0;
    color: var(--rad-warning);
    margin-top: 1px;
  }

  .room-assignment-drawer__notice-text {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--rad-text);
    margin: 0;
  }

  .room-assignment-drawer__error {
    margin: 16px 20px 0;
    padding: 10px 12px;
    background: var(--rad-danger);
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }

  .room-assignment-drawer__error[hidden] {
    display: none;
  }

  .room-assignment-drawer__error-text {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #f4efe6;
  }

  .room-assignment-drawer__error-dismiss {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: rgba(244, 239, 230, 0.75);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 2px;
  }

  .room-assignment-drawer__error-dismiss:hover {
    color: #f4efe6;
  }

  .room-assignment-drawer__error-dismiss:focus-visible {
    outline: 2px solid rgba(244, 239, 230, 0.55);
    outline-offset: 2px;
  }

  .room-assignment-drawer__section {
    padding: 20px 20px 16px;
  }

  .room-assignment-drawer__section-heading {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--rad-text-muted);
    margin: 0 0 12px;
  }

  .room-assignment-drawer__divider {
    border: none;
    border-top: 1px solid var(--rad-border);
    margin: 0;
  }

  .room-assignment-drawer__at-capacity {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: var(--rad-warning-text);
    background: rgba(122, 92, 18, 0.08);
    border: 1px solid rgba(122, 92, 18, 0.22);
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 12px;
  }

  .room-assignment-drawer__at-capacity[hidden] {
    display: none;
  }

  .room-assignment-drawer__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .room-assignment-drawer__list[hidden] {
    display: none;
  }

  .room-assignment-drawer__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: var(--rad-surface-raised);
    border: 1px solid var(--rad-border);
    border-radius: 4px;
    transition: border-color 140ms ease, background 140ms ease;
  }

  .room-assignment-drawer__item:has(button[aria-busy='true']) {
    opacity: 0.65;
  }

  .room-assignment-drawer__room-name {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--rad-text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .room-assignment-drawer__empty {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    color: var(--rad-text-faint);
    font-style: italic;
    margin: 4px 0 0;
    padding: 8px 0;
  }

  .room-assignment-drawer__empty[hidden] {
    display: none;
  }

  .room-assignment-drawer__assign-btn {
    flex-shrink: 0;
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 4px 12px;
    background: var(--rad-primary);
    color: var(--rad-primary-text);
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease;
  }

  .room-assignment-drawer__assign-btn:hover:not(:disabled):not([aria-busy='true']) {
    background: var(--rad-primary-hover);
  }

  .room-assignment-drawer__assign-btn:focus-visible {
    outline: 2px solid var(--rad-accent);
    outline-offset: 2px;
  }

  .room-assignment-drawer__assign-btn:disabled,
  .room-assignment-drawer__assign-btn[aria-busy='true'] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .room-assignment-drawer__unassign-btn {
    flex-shrink: 0;
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 4px 12px;
    background: transparent;
    color: var(--rad-danger);
    border: 1px solid var(--rad-danger);
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease, color 150ms ease;
  }

  .room-assignment-drawer__unassign-btn:hover:not(:disabled):not([aria-busy='true']) {
    background: var(--rad-danger);
    color: #f4efe6;
  }

  .room-assignment-drawer__unassign-btn:focus-visible {
    outline: 2px solid var(--rad-accent);
    outline-offset: 2px;
  }

  .room-assignment-drawer__unassign-btn:disabled,
  .room-assignment-drawer__unassign-btn[aria-busy='true'] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .room-assignment-drawer__trigger {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    padding: 4px 10px;
    background: transparent;
    color: var(--rad-accent);
    border: 1px solid var(--rad-accent);
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms ease, color 150ms ease;
  }

  .room-assignment-drawer__trigger:hover {
    background: var(--rad-accent);
    color: #f4efe6;
  }

  .room-assignment-drawer__trigger:focus-visible {
    outline: 2px solid var(--rad-accent);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .room-assignment-drawer__panel {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 85dvh;
      border-left: none;
      border-top: 1px solid var(--rad-border);
      border-radius: 6px 6px 0 0;
      box-shadow: 0 -6px 32px rgba(28, 26, 23, 0.16);
      transform: translateY(100%);
    }

    .room-assignment-drawer:not([aria-hidden='true']) .room-assignment-drawer__panel {
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .room-assignment-drawer__panel,
    .room-assignment-drawer__backdrop {
      transition: none;
    }
  }
</style>
