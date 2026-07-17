<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    adminRooms,
    adminCreateRoom,
    adminUpdateRoom,
    adminDeleteRoom,
    isError,
  } from '$lib/api';
  import type { Room, RoomInput } from '$lib/api';
  import RoomsForm from './RoomsForm.svelte';
  import RoomsListItem from './RoomsListItem.svelte';

  let rooms = $state<Room[]>([]);
  let loading = $state(true);
  let globalError = $state<string | null>(null);
  let showCreate = $state(false);
  let creating = $state(false);
  let createError = $state<string | null>(null);
  let createFlash = $state(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let errorTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const res = await adminRooms();
    if (isError(res)) {
      globalError = 'Impossible de charger les chambres. Veuillez réessayer.';
    } else {
      rooms = res.rooms;
    }
    loading = false;
  });

  onDestroy(() => {
    clearTimeout(flashTimer);
    clearTimeout(errorTimer);
  });

  // Create: optimistic prepend on success, flash confirmation, collapse form.
  // Errors surface inline below the form via `createError`; the form is not
  // collapsed so the operator can correct and retry.
  async function handleCreate(data: RoomInput): Promise<void> {
    creating = true;
    createError = null;
    try {
      const res = await adminCreateRoom(data);
      if (isError(res)) {
        createError = res.error;
        return;
      }
      rooms = [res.room, ...rooms];
      showCreate = false;
      createFlash = true;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        createFlash = false;
      }, 4000);
    } finally {
      creating = false;
    }
  }

  // Update: optimistically patch the single row, then reconcile with the
  // server record. On failure we restore the snapshot and re-throw so the
  // child RoomsListItem surfaces its own inline save error.
  async function handleUpdate(slug: string, data: RoomInput): Promise<void> {
    const idx = rooms.findIndex((r) => r.slug === slug);
    if (idx === -1) return;
    const snapshot = rooms[idx];
    rooms = rooms.map((r) =>
      r.slug === slug
        ? {
            ...r,
            name: data.name,
            capacity: data.capacity,
            image_key: data.imageKey,
            is_public: data.isPublic,
            passkey_enabled: data.passkeyEnabled,
            passkey: data.passkeyEnabled ? (data.passkey ?? "") : null,
          }
        : r,
    );
    const res = await adminUpdateRoom(slug, data);
    if (isError(res)) {
      rooms = rooms.map((r) => (r.slug === slug ? snapshot : r));
      throw new Error(res.error);
    }
    rooms = rooms.map((r) => (r.slug === slug ? res.room : r));
  }

  // Delete: optimistically drop the row; on failure restore the whole list and
  // surface a transient global error (auto-clears after 6s).
  async function handleDelete(slug: string): Promise<void> {
    const snapshot = [...rooms];
    rooms = rooms.filter((r) => r.slug !== slug);
    const res = await adminDeleteRoom(slug);
    if (isError(res)) {
      rooms = snapshot;
      globalError = 'Erreur lors de la suppression. La liste a été restaurée.';
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        globalError = null;
      }, 6000);
      throw new Error(res.error);
    }
  }

  function toggleCreate() {
    showCreate = !showCreate;
    if (showCreate) createError = null;
  }
</script>

<div
  class="admin-chambres-tab"
  role="region"
  aria-label="Gestion des chambres"
  data-testid="admin-chambres-tab"
>
  <!-- ── Create zone ─────────────────────────────── -->
  <div class="admin-chambres-tab__create-zone">
    <div class="admin-chambres-tab__create-header">
      <span class="admin-chambres-tab__zone-label">Ajouter une chambre</span>
      <button
        class="admin-chambres-tab__toggle-btn"
        type="button"
        aria-expanded={showCreate}
        aria-controls="act-create-panel"
        aria-label={showCreate
          ? 'Fermer le formulaire de création'
          : 'Ouvrir le formulaire de création'}
        onclick={toggleCreate}
        data-testid="toggle-create-form"
      >
        <span aria-hidden="true">{showCreate ? '−' : '+'}</span>
      </button>
    </div>

    {#if showCreate}
      <div
        id="act-create-panel"
        class="admin-chambres-tab__create-panel"
        data-testid="create-form-panel"
      >
        <RoomsForm
          initialValues={null}
          onSubmit={handleCreate}
          loading={creating}
          error={createError}
          submitLabel="Créer la chambre"
        />
      </div>
    {/if}

    {#if createFlash}
      <div
        class="admin-chambres-tab__flash"
        role="status"
        aria-live="polite"
        data-testid="create-success-banner"
      >
        Chambre créée avec succès.
      </div>
    {/if}
  </div>

  <!-- ── Global error (load / delete rollback) ───── -->
  {#if globalError}
    <div
      class="page-admin__error-banner admin-chambres-tab__error-banner"
      role="alert"
      data-testid="global-error-banner"
    >
      {globalError}
    </div>
  {/if}

  <!-- ── List zone ────────────────────────────────── -->
  <div class="admin-chambres-tab__list-zone">
    <div class="admin-chambres-tab__list-header">
      <span class="admin-chambres-tab__zone-label">Chambres</span>
      {#if !loading}
        <span
          class="admin-chambres-tab__count"
          aria-live="polite"
          data-testid="rooms-count"
        >
          {rooms.length}
          {rooms.length === 1 ? 'chambre' : 'chambres'}
        </span>
      {/if}
    </div>

    {#if loading}
      <div
        class="admin-chambres-tab__loading"
        aria-live="polite"
        aria-label="Chargement des chambres en cours"
        data-testid="loading-state"
      >
        <span class="admin-chambres-tab__spinner" aria-hidden="true">CHARGEMENT…</span>
      </div>
    {:else if rooms.length === 0 && !globalError}
      <div class="admin-chambres-tab__empty" data-testid="empty-state">
        <span>Aucune chambre.</span>
      </div>
    {:else}
      <ul
        class="admin-chambres-tab__list"
        aria-label="Liste des chambres"
        data-testid="rooms-list"
      >
        {#each rooms as room (room.slug)}
          <li class="admin-chambres-tab__list-item">
            <RoomsListItem {room} onUpdate={handleUpdate} onDelete={handleDelete} />
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .admin-chambres-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ── Zone label (mono uppercase) ─────────────────── */
  .admin-chambres-tab__zone-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-ink-mute);
  }

  /* ── Create zone ─────────────────────────────────── */
  .admin-chambres-tab__create-zone {
    background: var(--color-surface-container-low);
    border: 1px solid var(--color-hairline-2);
    border-radius: 4px;
    overflow: hidden;
  }

  .admin-chambres-tab__create-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
  }

  .admin-chambres-tab__toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-outline-variant);
    border-radius: 50%;
    background: var(--color-surface-container-lowest);
    color: var(--color-terracotta);
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 400;
    line-height: 1;
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .admin-chambres-tab__toggle-btn:hover {
    background: var(--color-surface-container);
    border-color: var(--color-outline);
  }

  .admin-chambres-tab__toggle-btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 2px;
  }

  .admin-chambres-tab__create-panel {
    border-top: 1px solid var(--color-hairline-2);
    padding: var(--space-md);
    background: var(--color-surface-container-lowest);
  }

  /* ── Flash confirmation ───────────────────────────── */
  .admin-chambres-tab__flash {
    padding: var(--space-xs) var(--space-md);
    background: var(--color-forest-surface);
    border-top: 1px solid var(--color-hairline-2);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-forest);
  }

  /* ── Global error banner ─────────────────────────── */
  .admin-chambres-tab__error-banner {
    padding: var(--space-md);
    border: 1px solid var(--color-error);
    border-left-width: 4px;
    border-radius: var(--radius, 0.25rem);
    background-color: color-mix(in srgb, var(--color-error) 6%, var(--color-surface));
    color: var(--color-error);
    animation: act-fadein 180ms ease;
  }

  @keyframes act-fadein {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── List zone ───────────────────────────────────── */
  .admin-chambres-tab__list-zone {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .admin-chambres-tab__list-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--color-hairline-2);
  }

  .admin-chambres-tab__count {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--color-ink-mute);
  }

  /* ── Loading ─────────────────────────────────────── */
  .admin-chambres-tab__loading {
    display: flex;
    justify-content: center;
    padding: var(--space-lg) 0;
  }

  .admin-chambres-tab__spinner {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-ink-mute);
    animation: act-pulse 1.4s ease-in-out infinite;
  }

  @keyframes act-pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  /* ── Empty ───────────────────────────────────────── */
  .admin-chambres-tab__empty {
    display: flex;
    justify-content: center;
    padding: var(--space-lg) 0;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--color-ink-mute);
  }

  /* ── List ─────────────────────────────────────────── */
  .admin-chambres-tab__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-chambres-tab__toggle-btn {
      transition: none;
    }
    .admin-chambres-tab__error-banner {
      animation: none;
    }
    .admin-chambres-tab__spinner {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
