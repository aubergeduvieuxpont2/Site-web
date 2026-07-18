<script lang="ts">
  import { onMount } from 'svelte';
  import { adminBlackouts, adminUpsertBlackoutRange, adminDeleteBlackoutRange, isError } from '$lib/api';
  import type { BlackoutRow } from '$lib/api';

  interface Props {
    assignableRoomCount: number;
  }

  let { assignableRoomCount }: Props = $props();

  // ── Grouped range type (display-only; storage stays per-day) ─────────────
  interface BlackoutRange {
    startDate: string;
    endDate: string;
    rooms_blocked: number;
    note: string | null;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let blackouts = $state<BlackoutRow[]>([]);
  let loading = $state(true);
  let globalError = $state<string | null>(null);

  // Grouping is pure display: consecutive days with same rooms_blocked+note →
  // one range row. Availability math in availability.ts is untouched.
  let groupedRanges = $derived(groupBlackouts(blackouts));

  // Two-step inline delete confirmation, keyed by range boundaries
  let confirmingRange = $state<{ start: string; end: string } | null>(null);
  let deletingRange = $state<{ start: string; end: string } | null>(null);

  // Range add/upsert form
  let formStartDate = $state('');
  let formEndDate = $state('');
  // svelte-ignore state_referenced_locally
  let formRoomsBlocked: number = $state(assignableRoomCount);
  let formNote = $state('');
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let submitFlash = $state<string | false>(false);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  // Auto-clamp end date behind start date
  $effect(() => {
    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      formEndDate = formStartDate;
    }
  });

  // ── Date formatter (timezone-safe fr-CA, mirrors ReservationTableRow) ──────
  const dateFmt = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium' });

  function formatDate(dateStr: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(local.getTime())) return dateStr;
    return dateFmt.format(local);
  }

  function formatRange(r: BlackoutRange): string {
    if (r.startDate === r.endDate) return formatDate(r.startDate);
    return `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`;
  }

  // ── Grouping logic ────────────────────────────────────────────────────────
  function addOneDay(dateStr: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function groupBlackouts(rows: BlackoutRow[]): BlackoutRange[] {
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const ranges: BlackoutRange[] = [];
    let cur: BlackoutRange = {
      startDate: sorted[0].date,
      endDate: sorted[0].date,
      rooms_blocked: sorted[0].rooms_blocked,
      note: sorted[0].note,
    };
    for (let i = 1; i < sorted.length; i++) {
      const row = sorted[i];
      if (
        addOneDay(cur.endDate) === row.date &&
        row.rooms_blocked === cur.rooms_blocked &&
        row.note === cur.note
      ) {
        cur.endDate = row.date;
      } else {
        ranges.push(cur);
        cur = {
          startDate: row.date,
          endDate: row.date,
          rooms_blocked: row.rooms_blocked,
          note: row.note,
        };
      }
    }
    ranges.push(cur);
    return ranges;
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async function load(): Promise<void> {
    loading = true;
    globalError = null;
    const res = await adminBlackouts();
    loading = false;
    if (isError(res)) {
      globalError = res.error;
    } else {
      blackouts = res.blackouts;
    }
  }

  onMount(() => {
    load();
    return () => clearTimeout(flashTimer);
  });

  // ── Range submit ──────────────────────────────────────────────────────────
  async function handleSubmit(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!formStartDate) return;
    const endDate = formEndDate || formStartDate;
    if (endDate < formStartDate) {
      submitError = 'La date de fin doit être ≥ à la date de début.';
      return;
    }
    const rooms = Number(formRoomsBlocked);
    if (!Number.isFinite(rooms) || rooms < 0) return;

    submitting = true;
    submitError = null;
    const res = await adminUpsertBlackoutRange({
      startDate: formStartDate,
      endDate,
      roomsBlocked: rooms,
      note: formNote.trim() || null,
    });
    submitting = false;

    if (isError(res)) {
      submitError = res.error;
      return;
    }

    const count = (res as { count: number }).count;
    formStartDate = '';
    formEndDate = '';
    formRoomsBlocked = assignableRoomCount;
    formNote = '';
    submitFlash = count === 1 ? '1 date enregistrée.' : `${count} dates enregistrées.`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      submitFlash = false;
    }, 3000);
    await load();
  }

  // ── Range delete ──────────────────────────────────────────────────────────
  async function handleDeleteRange(start: string, end: string): Promise<void> {
    confirmingRange = null;
    deletingRange = { start, end };
    const res = await adminDeleteBlackoutRange(start, end);
    deletingRange = null;

    if (isError(res)) {
      globalError = res.error;
    } else {
      await load();
    }
  }
</script>

<div
  class="admin-disponibilites-tab"
  role="region"
  aria-label="Dates bloquées"
  data-testid="admin-disponibilites-tab"
>
  <!-- ── Global error ─────────────────────────────── -->
  {#if globalError}
    <div
      class="admin-disponibilites-tab__error-banner"
      role="alert"
      data-testid="global-error"
    >
      {globalError}
    </div>
  {/if}

  <!-- ── Submit flash ─────────────────────────────── -->
  {#if submitFlash}
    <div
      class="admin-disponibilites-tab__flash"
      role="status"
      aria-live="polite"
      data-testid="submit-success"
    >
      {submitFlash}
    </div>
  {/if}

  <!-- ── Loading ──────────────────────────────────── -->
  {#if loading}
    <div
      class="admin-disponibilites-tab__spinner"
      role="status"
      aria-label="Chargement…"
    >
      <span class="admin-disponibilites-tab__spin" aria-hidden="true"></span>
    </div>
  {:else}
    <!-- ── Range list ──────────────────────────────── -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="admin-disponibilites-tab__table-scroll"
      role="region"
      aria-label="Tableau des plages bloquées"
      tabindex="0"
    >
      <table
        class="admin-disponibilites-tab__table"
        data-testid="blackouts-table"
      >
        <thead>
          <tr>
            <th scope="col">Plage</th>
            <th scope="col">Chambres bloquées</th>
            <th scope="col">Note</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#if groupedRanges.length === 0}
            <tr>
              <td colspan="4" class="admin-disponibilites-tab__empty">
                Aucune date bloquée.
              </td>
            </tr>
          {:else}
            {#each groupedRanges as range (range.startDate)}
              {@const isConfirming =
                confirmingRange?.start === range.startDate &&
                confirmingRange?.end === range.endDate}
              {@const isDeleting =
                deletingRange?.start === range.startDate &&
                deletingRange?.end === range.endDate}
              <tr class="admin-disponibilites-tab__row">
                <td class="admin-disponibilites-tab__cell-date">
                  {formatRange(range)}
                </td>
                <td class="admin-disponibilites-tab__cell-rooms">
                  {range.rooms_blocked}
                </td>
                <td class="admin-disponibilites-tab__cell-note">
                  {range.note ?? '—'}
                </td>
                <td class="admin-disponibilites-tab__cell-actions">
                  {#if isConfirming}
                    <span class="admin-disponibilites-tab__confirm-prompt">
                      Confirmer&nbsp;?
                    </span>
                    <button
                      class="admin-disponibilites-tab__btn--danger"
                      type="button"
                      aria-label="Confirmer la suppression de {formatRange(range)}"
                      data-testid="confirm-delete-{range.startDate}"
                      disabled={isDeleting}
                      onclick={() => handleDeleteRange(range.startDate, range.endDate)}
                    >
                      Oui
                    </button>
                    <button
                      class="admin-disponibilites-tab__btn--ghost"
                      type="button"
                      aria-label="Annuler la suppression"
                      data-testid="cancel-delete-{range.startDate}"
                      onclick={() => (confirmingRange = null)}
                    >
                      Non
                    </button>
                  {:else}
                    <button
                      class="admin-disponibilites-tab__btn--danger-ghost"
                      type="button"
                      aria-label="Supprimer la plage {formatRange(range)}"
                      data-testid="delete-blackout-{range.startDate}"
                      disabled={isDeleting}
                      onclick={() =>
                        (confirmingRange = {
                          start: range.startDate,
                          end: range.endDate,
                        })}
                    >
                      Supprimer
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <hr class="admin-disponibilites-tab__divider" />

    <!-- ── Range add form ──────────────────────────── -->
    <div class="admin-disponibilites-tab__form-zone">
      <div class="admin-disponibilites-tab__zone-label">
        Ajouter / modifier une plage
      </div>
      <form
        class="admin-disponibilites-tab__form"
        data-testid="add-blackout-form"
        onsubmit={handleSubmit}
      >
        <div class="admin-disponibilites-tab__dates-row">
          <div class="admin-disponibilites-tab__field">
            <label
              for="blackout-start"
              class="admin-disponibilites-tab__field-label"
            >
              Date de début
            </label>
            <input
              id="blackout-start"
              class="admin-disponibilites-tab__input"
              type="date"
              required
              bind:value={formStartDate}
              data-testid="blackout-start-input"
            />
          </div>

          <div class="admin-disponibilites-tab__field">
            <label
              for="blackout-end"
              class="admin-disponibilites-tab__field-label"
            >
              Date de fin
              <span class="admin-disponibilites-tab__optional">
                (défaut&nbsp;: même jour)
              </span>
            </label>
            <input
              id="blackout-end"
              class="admin-disponibilites-tab__input"
              type="date"
              min={formStartDate || undefined}
              bind:value={formEndDate}
              data-testid="blackout-end-input"
            />
          </div>
        </div>

        <div class="admin-disponibilites-tab__field">
          <label
            for="blackout-rooms"
            class="admin-disponibilites-tab__field-label"
          >
            Chambres bloquées
          </label>
          <input
            id="blackout-rooms"
            class="admin-disponibilites-tab__input"
            type="number"
            min="0"
            required
            bind:value={formRoomsBlocked}
            data-testid="blackout-rooms-input"
          />
        </div>

        <div class="admin-disponibilites-tab__field">
          <label
            for="blackout-note"
            class="admin-disponibilites-tab__field-label"
          >
            Note
            <span class="admin-disponibilites-tab__optional">(optionnelle)</span>
          </label>
          <textarea
            id="blackout-note"
            class="admin-disponibilites-tab__textarea"
            rows="2"
            bind:value={formNote}
            data-testid="blackout-note-input"
          ></textarea>
        </div>

        {#if submitError}
          <div
            class="admin-disponibilites-tab__error-banner"
            role="alert"
            data-testid="submit-error"
          >
            {submitError}
          </div>
        {/if}

        <button
          class="admin-disponibilites-tab__submit-btn"
          type="submit"
          disabled={submitting || !formStartDate}
          data-testid="add-blackout-submit"
        >
          {#if submitting}
            <span
              class="admin-disponibilites-tab__btn-spin"
              aria-hidden="true"
            ></span>
            Enregistrement…
          {:else}
            Enregistrer
          {/if}
        </button>
      </form>
    </div>
  {/if}
</div>

<style>
  /* ── Root ─────────────────────────────────────────────── */
  .admin-disponibilites-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    font-family: var(--font-sans);
  }

  /* ── Zone label (mono uppercase — matches AdminChambresTab pattern) ── */
  .admin-disponibilites-tab__zone-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-ink-mute);
    margin-bottom: var(--space-sm);
  }

  /* ── Error banner ──────────────────────────────────────── */
  .admin-disponibilites-tab__error-banner {
    padding: var(--space-md);
    border: 1px solid var(--color-error);
    border-left-width: 4px;
    border-radius: var(--radius, 0.25rem);
    background-color: color-mix(in srgb, var(--color-error) 6%, var(--color-surface));
    color: var(--color-error);
    font-size: 14px;
    animation: adt-fadein 180ms ease;
  }

  /* ── Flash / success ───────────────────────────────────── */
  .admin-disponibilites-tab__flash {
    padding: var(--space-xs) var(--space-md);
    background: var(--color-forest-surface);
    border-radius: var(--radius, 0.25rem);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-forest);
    animation: adt-fadein 180ms ease;
  }

  /* ── Loading spinner ───────────────────────────────────── */
  .admin-disponibilites-tab__spinner {
    display: flex;
    justify-content: center;
    padding: var(--space-lg) 0;
  }

  .admin-disponibilites-tab__spin {
    display: block;
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-outline-variant);
    border-top-color: var(--color-ink);
    border-radius: 50%;
    animation: adt-spin 700ms linear infinite;
  }

  /* ── Scrollable table wrapper ──────────────────────────── */
  .admin-disponibilites-tab__table-scroll {
    overflow-x: auto;
    border: 1px solid var(--color-hairline);
    border-radius: var(--radius, 0.25rem);
  }

  .admin-disponibilites-tab__table-scroll:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* ── Table ─────────────────────────────────────────────── */
  .admin-disponibilites-tab__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .admin-disponibilites-tab__table thead tr {
    border-bottom: 1px solid var(--color-hairline);
    background-color: var(--color-surface-container-low);
  }

  .admin-disponibilites-tab__table thead th {
    padding: var(--space-xs) var(--space-md);
    text-align: left;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    white-space: nowrap;
  }

  .admin-disponibilites-tab__row {
    border-bottom: 1px solid var(--color-hairline-2);
    transition: background 160ms ease;
  }

  .admin-disponibilites-tab__row:last-child {
    border-bottom: none;
  }

  @media (hover: hover) {
    .admin-disponibilites-tab__row:hover {
      background-color: var(--color-surface-container-low);
    }
  }

  .admin-disponibilites-tab__table tbody td {
    padding: var(--space-xs) var(--space-md);
    vertical-align: middle;
  }

  .admin-disponibilites-tab__cell-date {
    font-weight: 500;
    color: var(--color-ink);
    white-space: nowrap;
  }

  .admin-disponibilites-tab__cell-rooms {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--color-ink-variant);
    font-variant-numeric: tabular-nums;
  }

  .admin-disponibilites-tab__cell-note {
    color: var(--color-ink-variant);
    font-size: 13px;
    max-width: 280px;
  }

  .admin-disponibilites-tab__cell-actions {
    text-align: right;
    white-space: nowrap;
  }

  .admin-disponibilites-tab__confirm-prompt {
    font-size: 12px;
    color: var(--color-ink-variant);
    margin-right: var(--space-xs);
  }

  .admin-disponibilites-tab__empty {
    text-align: center;
    color: var(--color-ink-variant);
    padding: var(--space-2xl) var(--space-md);
    font-size: 14px;
  }

  /* ── Inline action buttons ─────────────────────────────── */
  .admin-disponibilites-tab__btn--danger-ghost,
  .admin-disponibilites-tab__btn--danger,
  .admin-disponibilites-tab__btn--ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 0 var(--space-sm);
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: var(--radius, 0.25rem);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;
  }

  .admin-disponibilites-tab__btn--danger-ghost:disabled,
  .admin-disponibilites-tab__btn--danger:disabled,
  .admin-disponibilites-tab__btn--ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .admin-disponibilites-tab__btn--danger-ghost:focus-visible,
  .admin-disponibilites-tab__btn--danger:focus-visible,
  .admin-disponibilites-tab__btn--ghost:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Ghost danger — initial delete trigger */
  .admin-disponibilites-tab__btn--danger-ghost {
    background: transparent;
    color: var(--color-error);
    border-color: var(--color-error);
  }

  @media (hover: hover) {
    .admin-disponibilites-tab__btn--danger-ghost:not(:disabled):hover {
      background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
    }
  }

  /* Filled danger — confirm yes */
  .admin-disponibilites-tab__btn--danger {
    background: var(--color-error);
    color: #ffffff;
    border-color: var(--color-error);
    margin-right: 4px;
  }

  @media (hover: hover) {
    .admin-disponibilites-tab__btn--danger:not(:disabled):hover {
      opacity: 0.88;
    }
  }

  /* Ghost neutral — cancel */
  .admin-disponibilites-tab__btn--ghost {
    background: transparent;
    color: var(--color-ink-variant);
    border-color: var(--color-outline-variant);
  }

  @media (hover: hover) {
    .admin-disponibilites-tab__btn--ghost:not(:disabled):hover {
      background-color: var(--color-surface-container-low);
    }
  }

  /* ── Divider ────────────────────────────────────────────── */
  .admin-disponibilites-tab__divider {
    border: none;
    border-top: 1px solid var(--color-hairline);
    margin: 0;
  }

  /* ── Add form ───────────────────────────────────────────── */
  .admin-disponibilites-tab__form-zone {
    display: flex;
    flex-direction: column;
  }

  .admin-disponibilites-tab__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: 520px;
  }

  /* ── Date-range row: two pickers side-by-side, wrap on narrow ── */
  .admin-disponibilites-tab__dates-row {
    display: flex;
    flex-direction: row;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .admin-disponibilites-tab__dates-row .admin-disponibilites-tab__field {
    flex: 1 1 180px;
    min-width: 0;
  }

  .admin-disponibilites-tab__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .admin-disponibilites-tab__field-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
  }

  .admin-disponibilites-tab__optional {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--color-ink-mute);
  }

  /* Inputs — mirrors .page-admin__search-input */
  .admin-disponibilites-tab__input,
  .admin-disponibilites-tab__textarea {
    appearance: none;
    -webkit-appearance: none;
    height: 44px;
    padding: 0 var(--space-md);
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius, 0.25rem);
    transition: border-color 160ms ease;
  }

  .admin-disponibilites-tab__input:focus,
  .admin-disponibilites-tab__textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .admin-disponibilites-tab__input[type='date'] {
    width: 100%;
    max-width: 220px;
  }

  .admin-disponibilites-tab__input[type='number'] {
    width: 160px;
    max-width: 100%;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* Hide native spinners on number input */
  .admin-disponibilites-tab__input[type='number']::-webkit-outer-spin-button,
  .admin-disponibilites-tab__input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .admin-disponibilites-tab__input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .admin-disponibilites-tab__textarea {
    height: auto;
    padding: var(--space-xs) var(--space-md);
    resize: vertical;
    min-height: 72px;
  }

  /* ── Submit button — mirrors .page-admin__requeue-btn ───── */
  .admin-disponibilites-tab__submit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 var(--space-md);
    min-width: 120px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-on-secondary-container);
    background-color: var(--color-secondary-container);
    border: none;
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    align-self: flex-start;
    transition: opacity 160ms ease, transform 160ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .admin-disponibilites-tab__submit-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .admin-disponibilites-tab__submit-btn:not(:disabled):hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }
  }

  .admin-disponibilites-tab__submit-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  .admin-disponibilites-tab__btn-spin {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: adt-spin 700ms linear infinite;
    margin-right: var(--space-xs);
    vertical-align: middle;
  }

  /* ── Animations ─────────────────────────────────────────── */
  @keyframes adt-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes adt-fadein {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Reduced motion ─────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .admin-disponibilites-tab__spin,
    .admin-disponibilites-tab__btn-spin {
      animation: none;
      opacity: 0.6;
    }

    .admin-disponibilites-tab__submit-btn,
    .admin-disponibilites-tab__row,
    .admin-disponibilites-tab__btn--danger-ghost,
    .admin-disponibilites-tab__btn--danger,
    .admin-disponibilites-tab__btn--ghost {
      transition: none;
    }

    .admin-disponibilites-tab__submit-btn:hover {
      transform: none;
    }
  }

  /* ── Screen reader only ─────────────────────────────────── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ── Responsive ─────────────────────────────────────────── */
  @media (max-width: 640px) {
    .admin-disponibilites-tab__input[type='date'] {
      max-width: 100%;
    }

    .admin-disponibilites-tab__input[type='number'] {
      width: 100%;
    }

    .admin-disponibilites-tab__form {
      max-width: 100%;
    }

    .admin-disponibilites-tab__dates-row {
      flex-direction: column;
    }

    .admin-disponibilites-tab__dates-row .admin-disponibilites-tab__field {
      flex: none;
    }
  }
</style>
