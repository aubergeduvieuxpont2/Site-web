<script module lang="ts">
  // Date-only-safe formatter — parses "YYYY-MM-DD" as a *local* calendar date
  // (no UTC day-shift) and renders it fr-CA, or "—" for null/invalid input.
  // Exported for unit testing. Never touches innerHTML; the returned value is a
  // primitive string from Intl.DateTimeFormat.
  const dateFmt = new Intl.DateTimeFormat("fr-CA");

  export function formatDateOnly(d: string | null | undefined): string {
    if (!d) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return "—";
    const local = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (Number.isNaN(local.getTime())) return "—";
    return dateFmt.format(local);
  }

  // Full name from split columns, falling back to the legacy `name`, then "—".
  export function displayNameOf(row: {
    first_name: string | null;
    last_name: string | null;
    name: string | null;
  }): string {
    if (row.first_name || row.last_name) {
      return [row.first_name, row.last_name].filter(Boolean).join(" ");
    }
    return row.name ?? "—";
  }

  const MESSAGE_LIMIT = 60;
  export function truncateMessage(message: string | null | undefined): string {
    if (!message) return "—";
    return message.length > MESSAGE_LIMIT
      ? message.slice(0, MESSAGE_LIMIT) + "…"
      : message;
  }

  // Human-readable French label for a reservation status. Returns one of three
  // fixed string literals — never interpolates caller data — so it is safe to
  // render directly. Null/undefined and any unknown value fall back to pending.
  export function statusLabel(status: string | null | undefined): string {
    if (status === "confirmed") return "Confirmé";
    if (status === "cancelled") return "Annulé";
    return "En attente";
  }
</script>

<script lang="ts">
  import type { ReservationRow } from "$lib/api";
  import RoomAssignmentDrawer from "./RoomAssignmentDrawer.svelte";
  import InvoiceCreator, {
    type InvoiceRequest,
    type InvoiceResult,
  } from "./InvoiceCreator.svelte";

  // ── Props ───────────────────────────────────────────────────────────────
  // The row is display-only data; `onCreateInvoice` is threaded through to the
  // InvoiceCreator so this component never performs a fetch itself.
  let {
    row,
    onCreateInvoice,
    onSetStatus,
  }: {
    row: ReservationRow;
    onCreateInvoice: (
      reservationId: number,
      req: InvoiceRequest,
    ) => Promise<InvoiceResult>;
    // Optional so existing callers compile unchanged; the component stays
    // fetch-free and optimistic — the parent owns the data update.
    onSetStatus?: (
      id: number,
      status: "pending" | "confirmed" | "cancelled",
    ) => void;
  } = $props();

  // ── Derived display values ──────────────────────────────────────────────
  const displayName = $derived(displayNameOf(row));
  const truncatedMessage = $derived(truncateMessage(row.message));

  // ── Panel state ─────────────────────────────────────────────────────────
  let factureOpen = $state(false);

  function toggleFacture() {
    factureOpen = !factureOpen;
  }
</script>

<tr
  class="reservation-table-row"
  data-testid="reservation-row"
  data-reservation-id={row.id}
>
  <td class="reservation-table-row__cell reservation-table-row__cell--name">
    <span class="reservation-table-row__name" data-testid="row-name">
      {displayName}
    </span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--email">
    <span class="reservation-table-row__email" data-testid="row-email">
      {row.email}
    </span>
  </td>

  <td class="reservation-table-row__cell">
    <span data-testid="row-phone">{row.phone ?? "—"}</span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--numeric">
    <span class="reservation-table-row__mono" data-testid="row-people">
      {row.people}
    </span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--numeric">
    <span class="reservation-table-row__mono" data-testid="row-arrive">
      {formatDateOnly(row.arrive)}
    </span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--numeric">
    <span class="reservation-table-row__mono" data-testid="row-depart">
      {formatDateOnly(row.depart)}
    </span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--numeric">
    <span class="reservation-table-row__mono" data-testid="row-room-count">
      {row.room_count ?? "—"}
    </span>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--message">
    <span
      class="reservation-table-row__message"
      data-testid="row-message"
      title={row.message ?? ""}
      aria-label={row.message ? "Message : " + row.message : "Aucun message"}
    >
      {truncatedMessage}
    </span>
  </td>

  <td
    class="reservation-table-row__cell reservation-table-row__cell--status"
    data-testid="row-status-cell"
  >
    <span
      class="reservation-table-row__status-badge reservation-table-row__status-badge--{row.status ??
        'pending'}"
      data-testid="row-status-badge"
      aria-label={`Statut: ${statusLabel(row.status)}`}
    >
      {statusLabel(row.status)}
    </span>

    <div
      class="reservation-table-row__status-actions"
      role="group"
      aria-label="Changer le statut"
    >
      {#if (row.status ?? "pending") !== "confirmed"}
        <button
          class="reservation-table-row__btn reservation-table-row__btn--status-confirm"
          type="button"
          data-testid="btn-status-confirm"
          aria-label="Confirmer la réservation"
          onclick={() => onSetStatus?.(row.id, "confirmed")}
        >
          Confirmer
        </button>
      {/if}

      {#if (row.status ?? "pending") !== "cancelled"}
        <button
          class="reservation-table-row__btn reservation-table-row__btn--status-cancel"
          type="button"
          data-testid="btn-status-cancel"
          aria-label="Annuler la réservation"
          onclick={() => onSetStatus?.(row.id, "cancelled")}
        >
          Annuler
        </button>
      {/if}
    </div>
  </td>

  <td class="reservation-table-row__cell reservation-table-row__cell--actions">
    <div
      class="reservation-table-row__actions"
      role="group"
      aria-label={`Actions pour ${displayName}`}
    >
      <!-- RoomAssignmentDrawer renders its own "Chambres" trigger and portals
           its drawer to <body>, so it is dropped in directly. -->
      <RoomAssignmentDrawer
        reservationId={row.id}
        arrive={row.arrive}
        depart={row.depart}
        roomCount={row.room_count}
      />

      <button
        class="reservation-table-row__btn reservation-table-row__btn--facture"
        data-testid="btn-facture"
        type="button"
        aria-label={`Créer une facture pour ${displayName}`}
        aria-expanded={factureOpen}
        aria-haspopup="true"
        onclick={toggleFacture}
      >
        Facture
      </button>
    </div>
  </td>
</tr>

{#if factureOpen}
  <tr class="reservation-table-row__panel-row" data-testid="panel-row-facture">
    <td colspan="10" class="reservation-table-row__panel-cell">
      <InvoiceCreator
        reservationId={row.id}
        arrive={row.arrive}
        depart={row.depart}
        roomCount={row.room_count}
        onCreateInvoice={(req) => onCreateInvoice(row.id, req)}
        onClose={() => (factureOpen = false)}
      />
    </td>
  </tr>
{/if}

<style>
  .reservation-table-row {
    --surface: #f4efe6;
    --surface-alt: #e0dad0;
    --surface-raised: #ece7db;
    --border: #c4baa8;
    --border-strong: #9a8e7e;
    --primary: #1b3b2a;
    --accent: #7b4628;
    --accent-hover: #6a3a20;
    --text: #1c1a17;
    --text-muted: #695e51;
    --primary-text: #f4efe6;
    --focus-ring: #7b4628;

    --font-ui: "Jost", ui-sans-serif, system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, monospace;
  }

  .reservation-table-row:nth-child(even) {
    background-color: var(--surface-alt);
  }
  .reservation-table-row:nth-child(odd) {
    background-color: var(--surface);
  }
  .reservation-table-row:hover {
    background-color: var(--surface-raised);
    transition: background-color 80ms ease;
  }

  .reservation-table-row__cell {
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.4;
    color: var(--text);
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    vertical-align: middle;
  }

  .reservation-table-row__cell--numeric {
    text-align: right;
  }

  .reservation-table-row__mono {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-muted);
  }

  .reservation-table-row__name {
    font-weight: 500;
    color: var(--text);
  }

  .reservation-table-row__email {
    color: var(--text-muted);
    font-size: 13px;
  }

  .reservation-table-row__cell--message {
    max-width: 200px;
    white-space: nowrap;
  }
  .reservation-table-row__message {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
    font-size: 13px;
    cursor: default;
  }

  .reservation-table-row__cell--actions {
    padding: 8px 12px;
    text-align: right;
  }

  .reservation-table-row__actions {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .reservation-table-row__btn {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 2px;
    border: 1.5px solid transparent;
    cursor: pointer;
    transition:
      background-color 100ms ease,
      border-color 100ms ease,
      color 100ms ease;
    white-space: nowrap;
  }

  .reservation-table-row__btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .reservation-table-row__btn--facture {
    background-color: var(--accent);
    border-color: var(--accent);
    color: var(--primary-text);
  }
  .reservation-table-row__btn--facture:hover {
    background-color: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .reservation-table-row__btn--facture[aria-expanded="true"] {
    background-color: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .reservation-table-row__panel-row {
    background-color: var(--surface-raised);
  }

  .reservation-table-row__panel-cell {
    padding: 0;
    border-bottom: 2px solid var(--border-strong);
  }

  /* ── Status cell ─────────────────────────────────────────────────── */
  .reservation-table-row__cell--status {
    padding: 8px 12px;
    white-space: nowrap;
    vertical-align: middle;
  }

  .reservation-table-row__status-badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
    line-height: 1.6;
    white-space: nowrap;
  }

  /* pending — grey neutral */
  .reservation-table-row__status-badge--pending {
    background-color: var(--color-badge-guest-bg, #e6e8ea);
    color: var(--color-badge-guest-fg, #45464d);
  }

  /* confirmed — forest green */
  .reservation-table-row__status-badge--confirmed {
    background-color: var(--color-forest-surface, #d4ede0);
    color: var(--color-forest, #1a5c2d);
  }

  /* cancelled — error red */
  .reservation-table-row__status-badge--cancelled {
    background-color: #fce8e8;
    color: var(--color-error, #ba1a1a);
  }

  /* ── Status action buttons ───────────────────────────────────────── */
  .reservation-table-row__status-actions {
    display: inline-flex;
    gap: 4px;
    margin-top: 5px;
    align-items: center;
  }

  .reservation-table-row__btn--status-confirm {
    background-color: transparent;
    border-color: var(--color-forest, #1a5c2d);
    color: var(--color-forest, #1a5c2d);
  }
  .reservation-table-row__btn--status-confirm:hover {
    background-color: var(--color-forest-surface, #d4ede0);
  }

  .reservation-table-row__btn--status-cancel {
    background-color: transparent;
    border-color: var(--color-error, #ba1a1a);
    color: var(--color-error, #ba1a1a);
  }
  .reservation-table-row__btn--status-cancel:hover {
    background-color: #fce8e8;
  }

  .reservation-table-row__btn--status-confirm:focus-visible,
  .reservation-table-row__btn--status-cancel:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
