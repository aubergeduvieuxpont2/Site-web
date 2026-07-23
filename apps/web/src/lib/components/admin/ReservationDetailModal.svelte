<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import RoomAssignmentDrawer from './RoomAssignmentDrawer.svelte';
  import InvoiceCreator, {
    type InvoiceRequest,
    type InvoiceResult,
  } from './InvoiceCreator.svelte';
  import type { ReservationRow } from '$lib/api';
  import { formatDateOnly, displayNameOf, statusLabel } from './ReservationTableRow.svelte';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    open: boolean;
    // Nullable so the parent can keep the modal mounted (for focus return)
    // while no reservation is selected; content only renders when open && row.
    row: ReservationRow | null;
    onClose: () => void;
    onCreateInvoice: (reservationId: number, req: InvoiceRequest) => Promise<InvoiceResult>;
  }

  let { open, row, onClose, onCreateInvoice }: Props = $props();

  let factureOpen = $state(false);

  const displayName = $derived(row ? displayNameOf(row) : '');

  // Reset the Facture panel whenever the modal is dismissed so re-opening for
  // another reservation starts collapsed.
  $effect(() => {
    if (!open) factureOpen = false;
  });

  function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('fr-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
</script>

<Modal {open} {onClose} labelId="rdm-title" backdropTestid="rdm-backdrop">
  {#if open && row}
    <!-- Modal.svelte provides the role="dialog"/aria-modal/focus-trap wrapper;
         this panel is the visible, styled surface inside it. -->
    <div class="rdm__panel" data-testid="reservation-detail-modal">
      <!-- Header -->
      <div class="rdm__header">
        <div class="rdm__header-left">
          <h2 id="rdm-title" class="rdm__title" data-testid="rdm-title">
            {displayName}
          </h2>
          {#if row.code}
            <span class="rdm__code" data-testid="rdm-code">{row.code}</span>
          {/if}
        </div>
        <button
          type="button"
          class="rdm__close"
          aria-label="Fermer le détail de réservation"
          data-testid="rdm-close"
          onclick={onClose}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="rdm__body">

        <!-- ── Info section ── -->
        <section class="rdm__section" aria-label="Informations de réservation">
          <dl class="rdm__dl">
            <div class="rdm__dl-row">
              <dt class="rdm__dt">Statut</dt>
              <dd class="rdm__dd">
                <span
                  class="rdm__status-badge rdm__status-badge--{row.status ?? 'pending'}"
                  data-testid="rdm-status"
                >
                  {statusLabel(row.status)}
                </span>
              </dd>
            </div>

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Courriel</dt>
              <dd class="rdm__dd" data-testid="rdm-email">
                <a class="rdm__email-link" href="mailto:{row.email}">{row.email}</a>
              </dd>
            </div>

            {#if row.phone}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Téléphone</dt>
                <dd class="rdm__dd" data-testid="rdm-phone">{row.phone}</dd>
              </div>
            {/if}

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Arrivée</dt>
              <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-arrive">{formatDateOnly(row.arrive)}</dd>
            </div>

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Départ</dt>
              <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-depart">{formatDateOnly(row.depart)}</dd>
            </div>

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Personnes</dt>
              <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-people">{row.people}</dd>
            </div>

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Chambres demandées</dt>
              <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-room-count">{row.room_count ?? '—'}</dd>
            </div>

            {#if row.message}
              <div class="rdm__dl-row rdm__dl-row--block">
                <dt class="rdm__dt">Message</dt>
                <dd class="rdm__dd rdm__dd--message" data-testid="rdm-message">{row.message}</dd>
              </div>
            {/if}

            {#if row.source}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Source</dt>
                <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-source">{row.source}</dd>
              </div>
            {/if}

            {#if row.external_ref}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Référence externe</dt>
                <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-external-ref">{row.external_ref}</dd>
              </div>
            {/if}

            <div class="rdm__dl-row">
              <dt class="rdm__dt">Créé le</dt>
              <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-created-at">
                {formatDateTime(row.created_at)}
              </dd>
            </div>

            {#if row.invoice_status}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Statut facture</dt>
                <dd class="rdm__dd" data-testid="rdm-invoice-status">
                  <span
                    class="rdm__invoice-badge rdm__invoice-badge--{row.invoice_status}"
                    data-testid="rdm-invoice-badge"
                  >
                    {row.invoice_status === 'paid' ? 'Payée' : row.invoice_status === 'open' ? 'Ouverte' : row.invoice_status === 'payment_failed' ? 'Échec du paiement' : row.invoice_status}
                  </span>
                </dd>
              </div>
            {/if}

            {#if row.paid_at}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Payée le</dt>
                <dd class="rdm__dd rdm__dd--mono" data-testid="rdm-paid-at">
                  {formatDateTime(row.paid_at)}
                </dd>
              </div>
            {/if}

            {#if row.stripe_invoice_id}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Facture Stripe</dt>
                <dd class="rdm__dd" data-testid="rdm-stripe-invoice-id">
                  <span class="rdm__dd--mono">{row.stripe_invoice_id}</span>
                </dd>
              </div>
            {/if}

            {#if row.hosted_invoice_url}
              <div class="rdm__dl-row">
                <dt class="rdm__dt">Lien facture</dt>
                <dd class="rdm__dd">
                  <a
                    href={row.hosted_invoice_url}
                    class="rdm__invoice-link"
                    target="_blank"
                    rel="noopener"
                    aria-label={t('admin.invoiceLinkAriaLabel')}
                    data-testid="rdm-hosted-invoice-url"
                  >{t('admin.invoiceLink')}</a>
                </dd>
              </div>
            {/if}
          </dl>
        </section>

        <hr class="rdm__divider" aria-hidden="true" />

        <!-- ── Chambres section ── -->
        <section class="rdm__section" aria-labelledby="rdm-rooms-heading">
          <h3 id="rdm-rooms-heading" class="rdm__section-heading">Chambres</h3>
          <RoomAssignmentDrawer
            reservationId={row.id}
            arrive={row.arrive}
            depart={row.depart}
            roomCount={row.room_count}
          />
        </section>

        <hr class="rdm__divider" aria-hidden="true" />

        <!-- ── Facture section ── -->
        <section class="rdm__section" aria-labelledby="rdm-facture-heading">
          <h3 id="rdm-facture-heading" class="rdm__section-heading">Facture</h3>
          <button
            type="button"
            class="rdm__facture-btn"
            aria-expanded={factureOpen}
            aria-controls="rdm-facture-panel"
            data-testid="btn-facture"
            onclick={() => (factureOpen = !factureOpen)}
          >
            {factureOpen ? 'Masquer la facture' : 'Créer / afficher une facture'}
          </button>

          {#if factureOpen}
            <div id="rdm-facture-panel" data-testid="panel-row-facture">
              <InvoiceCreator
                reservationId={row.id}
                arrive={row.arrive}
                depart={row.depart}
                roomCount={row.room_count}
                onCreateInvoice={(req) => onCreateInvoice(row.id, req)}
                onClose={() => (factureOpen = false)}
              />
            </div>
          {/if}
        </section>

      </div>
    </div>
  {/if}
</Modal>

<style>
  /* ════════════════════════════════════════════════
     Reservation Detail Modal (rdm)
     Centered overlay; z-index above the tab nav.
     ════════════════════════════════════════════════ */
  .rdm__panel {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    /* Centre on tablet/desktop; full-screen on mobile */
    margin: auto;
    width: min(680px, 100vw);
    max-height: min(90dvh, 100dvh);
    background: #f4efe6;
    border-radius: 6px;
    box-shadow: 0 8px 48px rgba(28, 26, 23, 0.22);
    overflow: hidden;
    outline: none;
  }

  @media (max-width: 640px) {
    .rdm__panel {
      border-radius: 0;
      max-height: 100dvh;
    }
  }

  /* ── Header ── */
  .rdm__header {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 24px 16px;
    background: #1b3b2a;
    border-bottom: 1px solid rgba(196, 186, 168, 0.3);
  }

  .rdm__header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .rdm__title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 22px;
    font-weight: 500;
    line-height: 1.2;
    color: #f4efe6;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rdm__code {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: rgba(244, 239, 230, 0.65);
  }

  .rdm__close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid rgba(244, 239, 230, 0.22);
    border-radius: 4px;
    color: #f4efe6;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .rdm__close:hover {
    background: rgba(244, 239, 230, 0.12);
  }

  .rdm__close:focus-visible {
    outline: 2px solid #7b4628;
    outline-offset: 2px;
  }

  /* ── Body ── */
  .rdm__body {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* ── Section ── */
  .rdm__section {
    padding: 20px 24px;
  }

  .rdm__section-heading {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #695e51;
    margin: 0 0 14px;
  }

  .rdm__divider {
    border: none;
    border-top: 1px solid #c4baa8;
    margin: 0;
  }

  /* ── Definition list ── */
  .rdm__dl {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin: 0;
    padding: 0;
  }

  .rdm__dl-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .rdm__dl-row--block {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .rdm__dt {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #695e51;
    white-space: nowrap;
    min-width: 160px;
    flex-shrink: 0;
  }

  .rdm__dd {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    color: #1c1a17;
    margin: 0;
    word-break: break-word;
  }

  .rdm__dd--mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    color: #695e51;
  }

  .rdm__dd--message {
    font-size: 14px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .rdm__email-link {
    color: #1b3b2a;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .rdm__email-link:focus-visible {
    outline: 2px solid #7b4628;
    outline-offset: 2px;
    border-radius: 2px;
  }

  .rdm__invoice-link {
    color: #7b4628;
    text-decoration: underline;
    text-underline-offset: 2px;
    font-size: 13px;
    font-weight: 600;
  }

  .rdm__invoice-link:hover {
    color: #6a3a20;
  }

  .rdm__invoice-link:focus-visible {
    outline: 2px solid #7b4628;
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* ── Status badge ── */
  .rdm__status-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 2px;
  }

  .rdm__status-badge--pending {
    background: #e6e8ea;
    color: #45464d;
  }

  .rdm__status-badge--confirmed {
    background: #d4ede0;
    color: #1a5c2d;
  }

  .rdm__status-badge--cancelled {
    background: #fce8e8;
    color: #ba1a1a;
  }

  /* ── Invoice status badge ── */
  .rdm__invoice-badge {
    display: inline-block;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 2px;
  }

  .rdm__invoice-badge--open {
    background: #fff8e6;
    color: #7a5c00;
  }

  .rdm__invoice-badge--paid {
    background: #d4ede0;
    color: #1a5c2d;
  }

  .rdm__invoice-badge--payment_failed {
    background: #fbe4e4;
    color: #8a1c1c;
  }

  /* ── Facture button ── */
  .rdm__facture-btn {
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 6px 14px;
    background: #7b4628;
    color: #f4efe6;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .rdm__facture-btn:hover {
    background: #6a3a20;
  }

  .rdm__facture-btn:focus-visible {
    outline: 2px solid #7b4628;
    outline-offset: 3px;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .rdm__dt {
      min-width: 120px;
    }

    .rdm__section {
      padding: 16px;
    }

    .rdm__header {
      padding: 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rdm__close,
    .rdm__facture-btn {
      transition: none;
    }
  }
</style>
