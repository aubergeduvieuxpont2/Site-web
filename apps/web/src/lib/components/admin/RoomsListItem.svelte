<script lang="ts">
  import RoomsForm from './RoomsForm.svelte';
  import type { RoomInput } from './RoomsForm.svelte';

  interface Room {
    slug: string;
    name: string;
    capacity: number;
    image_key: string | null;
    is_public: boolean;
  }

  let {
    room,
    onUpdate,
    onDelete,
  }: {
    room: Room;
    onUpdate: (slug: string, data: RoomInput) => Promise<void>;
    onDelete: (slug: string) => Promise<void>;
  } = $props();

  let editOpen      = $state(false);
  let confirmDelete = $state(false);
  let savePending   = $state(false);
  let deletePending = $state(false);
  let saveError     = $state<string | null>(null);
  let deleteError   = $state<string | null>(null);

  function toggleEdit() {
    editOpen = !editOpen;
    if (editOpen) confirmDelete = false;
    saveError = null;
  }

  async function handleUpdate(data: RoomInput) {
    savePending = true;
    saveError = null;
    try {
      await onUpdate(room.slug, data);
      editOpen = false;
    } catch (e: unknown) {
      saveError = e instanceof Error ? e.message : 'Une erreur est survenue.';
    } finally {
      savePending = false;
    }
  }

  function handleDeleteClick() {
    confirmDelete = true;
    editOpen = false;
    deleteError = null;
  }

  function handleDeleteCancel() {
    confirmDelete = false;
    deleteError = null;
  }

  async function handleDeleteConfirm() {
    deletePending = true;
    deleteError = null;
    try {
      await onDelete(room.slug);
      // Parent removes item; no further state change needed.
    } catch (e: unknown) {
      deleteError = e instanceof Error ? e.message : 'Suppression impossible.';
      confirmDelete = false;
      deletePending = false;
    }
  }

  // Raw R2 keys → French display names, matching the labels used in RoomsForm.
  const IMAGE_LABELS: Record<string, string> = {
    bedroom: 'Chambre',
    balcony: 'Balcon',
    'living-dining': 'Salon-salle à manger',
    lounge: 'Salon',
    dining: 'Salle à manger',
    kitchen: 'Cuisine',
    laundry: 'Buanderie',
    'bathroom-1': 'Salle de bain 1',
    'bathroom-2': 'Salle de bain 2',
    'bathroom-3': 'Salle de bain 3',
    'auberge-exterior': "Extérieur de l'auberge",
    'auberge-porch': "Porche de l'auberge",
    bridge: 'Pont',
    'village-river': 'Rivière du village',
  };
</script>

<article
  class="rooms-list-item"
  data-testid="rooms-list-item"
  data-slug={room.slug}
>
  <!-- ── Primary row: meta left, controls right ── -->
  <div class="rooms-list-item__row">

    <!-- Meta column -->
    <div class="rooms-list-item__meta">
      <div class="rooms-list-item__meta-top">
        <span class="rooms-list-item__name" data-testid="rooms-list-item-name">
          {room.name}
        </span>
        <span class="rooms-list-item__slug" data-testid="rooms-list-item-slug">
          {room.slug}
        </span>
      </div>
      <div class="rooms-list-item__meta-bottom">
        <span class="rooms-list-item__capacity" data-testid="rooms-list-item-capacity">
          {room.capacity} pers.
        </span>
        <span class="rooms-list-item__sep" aria-hidden="true">·</span>
        <span class="rooms-list-item__image-key" data-testid="rooms-list-item-image-key">
          {room.image_key ? (IMAGE_LABELS[room.image_key] ?? room.image_key) : '—'}
        </span>
        <span
          class="rooms-list-item__badge"
          class:rooms-list-item__badge--public={room.is_public}
          class:rooms-list-item__badge--hidden={!room.is_public}
          role="status"
          data-testid="rooms-list-item-badge"
        >
          {room.is_public ? 'Publique' : 'Masquée'}
        </span>
      </div>
    </div>

    <!-- Controls column -->
    <div class="rooms-list-item__controls">
      <!-- Modifier toggle -->
      <button
        class="rooms-list-item__btn rooms-list-item__btn--edit"
        class:rooms-list-item__btn--active={editOpen}
        type="button"
        aria-expanded={editOpen}
        aria-controls="rooms-list-item-edit-{room.slug}"
        aria-label={editOpen ? 'Fermer le formulaire de modification' : 'Modifier la chambre'}
        aria-busy={savePending}
        disabled={savePending || deletePending}
        onclick={toggleEdit}
        data-testid="rooms-list-item-edit-btn"
      >
        {#if savePending}
          <span class="rooms-list-item__spinner" aria-hidden="true"></span>
        {/if}
        <span>{editOpen ? 'Fermer' : 'Modifier'}</span>
      </button>

      <!-- Delete zone -->
      <div class="rooms-list-item__delete-zone">
        {#if !confirmDelete}
          <button
            class="rooms-list-item__btn rooms-list-item__btn--delete"
            type="button"
            aria-label="Supprimer la chambre"
            disabled={savePending || deletePending || editOpen}
            onclick={handleDeleteClick}
            data-testid="rooms-list-item-delete-btn"
          >
            Supprimer
          </button>
        {:else}
          <div
            class="rooms-list-item__confirm"
            role="group"
            aria-label="Confirmer la suppression"
            data-testid="rooms-list-item-confirm-zone"
          >
            <span class="rooms-list-item__confirm-prompt" aria-live="polite">
              Confirmer ?
            </span>
            <button
              class="rooms-list-item__btn rooms-list-item__btn--confirm-yes"
              type="button"
              aria-label="Confirmer la suppression définitive de la chambre"
              aria-busy={deletePending}
              disabled={deletePending}
              onclick={handleDeleteConfirm}
              data-testid="rooms-list-item-confirm-yes"
            >
              {#if deletePending}
                <span class="rooms-list-item__spinner" aria-hidden="true"></span>
              {/if}
              <span>{deletePending ? '…' : 'Oui'}</span>
            </button>
            <button
              class="rooms-list-item__btn rooms-list-item__btn--confirm-cancel"
              type="button"
              aria-label="Annuler la suppression"
              disabled={deletePending}
              onclick={handleDeleteCancel}
              data-testid="rooms-list-item-confirm-cancel"
            >
              Annuler
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Delete error bar (outside controls so it spans full width) -->
  {#if deleteError}
    <div
      class="rooms-list-item__status-bar rooms-list-item__status-bar--error"
      role="alert"
      data-testid="rooms-list-item-delete-error"
    >
      {deleteError}
    </div>
  {/if}

  <!-- Inline edit panel -->
  {#if editOpen}
    <div
      id="rooms-list-item-edit-{room.slug}"
      class="rooms-list-item__edit-panel"
      data-testid="rooms-list-item-edit-panel"
    >
      <RoomsForm
        initialValues={{
          name: room.name,
          capacity: room.capacity,
          imageKey: room.image_key ?? '',
          isPublic: room.is_public,
        }}
        onSubmit={handleUpdate}
        loading={savePending}
        error={saveError}
        submitLabel="Enregistrer les modifications"
      />
    </div>
  {/if}
</article>

<style>
  /* ── Card wrapper ── */
  .rooms-list-item {
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius, 0.25rem);
    overflow: hidden;
  }

  /* ── Primary row ── */
  .rooms-list-item__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-lg);
    padding: var(--space-md);
  }

  /* ── Meta column ── */
  .rooms-list-item__meta {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .rooms-list-item__meta-top {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .rooms-list-item__name {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-ink);
  }

  .rooms-list-item__slug {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--color-ink-mute);
    background-color: var(--color-surface-container);
    border: 1px solid var(--color-outline-variant);
    border-radius: 2px;
    padding: 1px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .rooms-list-item__meta-bottom {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;
  }

  .rooms-list-item__sep {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-outline-variant);
    user-select: none;
  }

  .rooms-list-item__capacity {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--color-ink-soft);
  }

  .rooms-list-item__image-key {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--color-ink-mute);
  }

  /* ── Visibility badge ── */
  .rooms-list-item__badge {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 2px;
    white-space: nowrap;
  }

  .rooms-list-item__badge--public {
    background-color: var(--color-forest-surface);
    color: var(--color-forest);
  }

  .rooms-list-item__badge--hidden {
    background-color: var(--color-surface-container);
    color: var(--color-ink-mute);
  }

  /* ── Controls column ── */
  .rooms-list-item__controls {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  /* ── Button base ── */
  .rooms-list-item__btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    height: 32px;
    padding: 0 var(--space-sm);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-radius: var(--radius, 0.25rem);
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color 0.14s ease,
      border-color 0.14s ease,
      color 0.14s ease,
      opacity 0.14s ease;
  }

  .rooms-list-item__btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 2px;
  }

  .rooms-list-item__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Edit button: ghost outline */
  .rooms-list-item__btn--edit {
    background-color: transparent;
    border-color: var(--color-outline-variant);
    color: var(--color-ink-soft);
  }

  .rooms-list-item__btn--edit:hover:not(:disabled) {
    background-color: var(--color-surface-container-low);
    border-color: var(--color-outline);
  }

  /* Edit button active state (form open) */
  .rooms-list-item__btn--active {
    border-color: var(--color-terracotta);
    color: var(--color-terracotta);
    background-color: color-mix(in srgb, var(--color-terracotta) 6%, transparent);
  }

  /* Delete button: muted, reveals danger on hover */
  .rooms-list-item__btn--delete {
    background-color: transparent;
    border-color: transparent;
    color: var(--color-ink-mute);
  }

  .rooms-list-item__btn--delete:hover:not(:disabled) {
    color: var(--color-error);
    border-color: color-mix(in srgb, var(--color-error) 35%, transparent);
    background-color: color-mix(in srgb, var(--color-error) 6%, transparent);
  }

  /* ── Confirm zone ── */
  .rooms-list-item__delete-zone {
    display: flex;
    align-items: center;
  }

  .rooms-list-item__confirm {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  .rooms-list-item__confirm-prompt {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-error);
    white-space: nowrap;
  }

  .rooms-list-item__btn--confirm-yes {
    background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
    border-color: var(--color-error);
    color: var(--color-error);
  }

  .rooms-list-item__btn--confirm-yes:hover:not(:disabled) {
    background-color: var(--color-error);
    color: var(--color-surface-container-lowest);
  }

  .rooms-list-item__btn--confirm-cancel {
    background-color: transparent;
    border-color: var(--color-outline-variant);
    color: var(--color-ink-mute);
  }

  .rooms-list-item__btn--confirm-cancel:hover:not(:disabled) {
    background-color: var(--color-surface-container-low);
    border-color: var(--color-outline);
  }

  /* ── Status bar (full-width error below row) ── */
  .rooms-list-item__status-bar {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    padding: var(--space-xs) var(--space-md);
  }

  .rooms-list-item__status-bar--error {
    color: var(--color-error);
    background-color: color-mix(in srgb, var(--color-error) 5%, var(--color-surface));
    border-top: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
  }

  /* ── Edit panel ── */
  .rooms-list-item__edit-panel {
    border-top: 1px solid var(--color-hairline-2);
    padding: var(--space-md);
    background-color: var(--color-surface-container-low);
  }

  /* ── Inline spinner ── */
  .rooms-list-item__spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: rooms-list-item-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes rooms-list-item-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .rooms-list-item__row {
      flex-direction: column;
      gap: var(--space-sm);
    }

    .rooms-list-item__controls {
      width: 100%;
      flex-wrap: wrap;
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .rooms-list-item__btn {
      transition: none;
    }
    .rooms-list-item__spinner {
      animation: none;
      border-top-color: currentColor;
      opacity: 0.55;
    }
  }
</style>
