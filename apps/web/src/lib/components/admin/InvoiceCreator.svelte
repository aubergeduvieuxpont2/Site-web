<script module lang="ts">
  // Kept local so this component never hard-depends on api.ts (owned by another
  // task). Mirrors the InvoiceBreakdown wire shape returned by
  // POST /api/admin/reservations/:id/invoice.
  export type InvoiceBreakdown = {
    nights: number;
    roomCount: number;
    effectiveNightly: number;
    base: number;
    accommodationTax: number;
    tps: number;
    tvq: number;
    total: number;
    amount: number;
  };

  export type InvoiceType = "deposit" | "full";

  // The payload emitted to `onCreateInvoice`. `depositPercent` is present only
  // for deposit-mode invoices.
  export type InvoiceRequest = { type: InvoiceType; depositPercent?: number };

  // The callback resolves to either the success breakdown or an `{ error }`
  // shape (mirrors api.ts's discriminated-union convention). No fetch happens
  // inside this component — the parent wires the actual API client.
  export type InvoiceResult =
    | { ok: true; breakdown: InvoiceBreakdown; stripeInvoiceId?: string | null; hostedInvoiceUrl?: string | null }
    | { error: string };

  // Pure eligibility guard — exported for unit testing. A reservation can be
  // invoiced only when both dates are valid ISO YYYY-MM-DD calendar dates and
  // depart is strictly after arrive, and a room count is present.
  export function isInvoiceEligible(
    arrive: string | null,
    depart: string | null,
    roomCount: number | null,
  ): boolean {
    if (!arrive || !depart || roomCount == null) return false;
    const pat = /^\d{4}-\d{2}-\d{2}$/;
    if (!pat.test(arrive) || !pat.test(depart)) return false;
    return depart > arrive; // ISO YYYY-MM-DD strings compare lexicographically
  }
</script>

<script lang="ts">
  // ─── Props ───
  let {
    reservationId,
    arrive,
    depart,
    roomCount,
    onCreateInvoice,
    onClose,
  }: {
    reservationId: number;
    arrive: string | null;
    depart: string | null;
    roomCount: number | null;
    onCreateInvoice: (req: InvoiceRequest) => Promise<InvoiceResult>;
    onClose: () => void;
  } = $props();

  const eligible = $derived(isInvoiceEligible(arrive, depart, roomCount));

  // ─── Form state ───
  let type = $state<InvoiceType>("deposit");
  let depositPercent = $state<number>(30);
  let loading = $state(false);
  let apiError = $state<string | null>(null);
  let breakdown = $state<InvoiceBreakdown | null>(null);
  let breakdownExpanded = $state(true);
  let hostedInvoiceUrl = $state<string | null>(null);
  let stripeInvoiceId = $state<string | null>(null);

  // ─── Formatters (fr-CA, CAD) — all values pass through Intl, never string
  //     interpolation, so nothing user/server-controlled reaches the DOM raw. ───
  const currencyFmt = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const countFmt = new Intl.NumberFormat("fr-CA");

  function formatCurrency(amount: number): string {
    return currencyFmt.format(Number.isFinite(amount) ? amount : 0);
  }
  function formatCount(n: number): string {
    return countFmt.format(Number.isFinite(n) ? n : 0);
  }

  // Breakdown rows in ledger order. `count` cells use the UI font; `preTotal`
  // and `final` carry the divider / total-row styling.
  const rows = $derived(
    breakdown
      ? [
          { label: "Nuits", value: formatCount(breakdown.nights), count: true },
          { label: "Chambres", value: formatCount(breakdown.roomCount), count: true },
          { label: "Prix effectif / nuit", value: formatCurrency(breakdown.effectiveNightly) },
          { label: "Sous-total", value: formatCurrency(breakdown.base) },
          { label: "Taxe d'hébergement", value: formatCurrency(breakdown.accommodationTax) },
          { label: "TPS", value: formatCurrency(breakdown.tps) },
          { label: "TVQ", value: formatCurrency(breakdown.tvq) },
          { label: "Total", value: formatCurrency(breakdown.total), preTotal: true },
          { label: "Montant dû", value: formatCurrency(breakdown.amount), final: true },
        ]
      : [],
  );

  function resetDepositIfInvalid() {
    if (!Number.isFinite(depositPercent) || depositPercent < 1 || depositPercent > 100) {
      depositPercent = 30;
    }
  }

  function onTypeChange() {
    apiError = null;
  }

  async function handleConfirm() {
    apiError = null;

    if (
      type === "deposit" &&
      (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100)
    ) {
      apiError = "Le pourcentage doit être compris entre 1 et 100.";
      return;
    }

    const req: InvoiceRequest =
      type === "deposit" ? { type, depositPercent } : { type };

    loading = true;
    try {
      const res = await onCreateInvoice(req);
      if ("error" in res) {
        apiError = res.error || "Une erreur est survenue. Veuillez réessayer.";
        return;
      }
      breakdown = res.breakdown;
      breakdownExpanded = true;
      hostedInvoiceUrl = res.hostedInvoiceUrl ?? null;
      stripeInvoiceId = res.stripeInvoiceId ?? null;
    } catch {
      apiError = "Erreur de réseau. Vérifiez votre connexion et réessayez.";
    } finally {
      loading = false;
    }
  }

  function toggleBreakdown() {
    breakdownExpanded = !breakdownExpanded;
  }
</script>

<div
  class="invoice-creator"
  role="region"
  aria-label="Créer une facture"
  data-testid="invoice-creator"
  data-reservation-id={reservationId}
>
  <!-- Panel header -->
  <div class="invoice-creator__header">
    <h3 class="invoice-creator__title" id="ic-heading">Facturation</h3>
    <button
      class="invoice-creator__close"
      type="button"
      aria-label="Fermer le panneau de facturation"
      data-testid="invoice-creator-close"
      onclick={onClose}
    >
      ✕
    </button>
  </div>

  {#if !eligible}
    <!-- Ineligibility notice — null/invalid dates or null room_count -->
    <div class="invoice-creator__ineligible" role="alert" data-testid="invoice-ineligible">
      <span class="invoice-creator__ineligible-icon" aria-hidden="true">⚠</span>
      <p class="invoice-creator__ineligible-text">
        Réservation incomplète : dates ou nombre de chambres manquants.
      </p>
    </div>
  {:else}
    <!-- Form -->
    <div class="invoice-creator__form" data-testid="invoice-form">
      <!-- Type segmented radio -->
      <fieldset class="invoice-creator__type-group" data-testid="invoice-type-group">
        <legend class="invoice-creator__type-legend">Type de facturation</legend>
        <div class="invoice-creator__radio-row" role="group">
          <label class="invoice-creator__radio-label" data-testid="invoice-type-deposit-label">
            <input
              class="invoice-creator__radio-input"
              type="radio"
              name="ic-type"
              value="deposit"
              bind:group={type}
              onchange={onTypeChange}
              disabled={loading}
              data-testid="invoice-type-deposit"
            />
            <span class="invoice-creator__radio-pill">Acompte</span>
          </label>

          <label class="invoice-creator__radio-label" data-testid="invoice-type-full-label">
            <input
              class="invoice-creator__radio-input"
              type="radio"
              name="ic-type"
              value="full"
              bind:group={type}
              onchange={onTypeChange}
              disabled={loading}
              data-testid="invoice-type-full"
            />
            <span class="invoice-creator__radio-pill">Facture complète</span>
          </label>
        </div>
      </fieldset>

      <!-- Deposit % — visible only when type === "deposit" -->
      {#if type === "deposit"}
        <div class="invoice-creator__deposit-row" data-testid="invoice-deposit-row">
          <label class="invoice-creator__deposit-label" for="ic-deposit-pct">
            Pourcentage d'acompte
          </label>
          <div class="invoice-creator__deposit-wrap">
            <input
              class="invoice-creator__deposit-input"
              type="number"
              id="ic-deposit-pct"
              name="depositPercent"
              min="1"
              max="100"
              step="1"
              bind:value={depositPercent}
              onblur={resetDepositIfInvalid}
              disabled={loading}
              aria-describedby="ic-deposit-hint"
              data-testid="invoice-deposit-percent"
            />
            <span class="invoice-creator__deposit-suffix" aria-hidden="true">%</span>
          </div>
          <p class="invoice-creator__deposit-hint" id="ic-deposit-hint">
            Valeur entre 1 et 100
          </p>
        </div>
      {/if}

      <!-- API / validation error -->
      {#if apiError}
        <div
          class="invoice-creator__api-error"
          role="alert"
          aria-live="assertive"
          data-testid="invoice-api-error"
        >
          <p class="invoice-creator__api-error-text">{apiError}</p>
        </div>
      {/if}

      <!-- Confirm -->
      <div class="invoice-creator__actions">
        <button
          class="invoice-creator__confirm"
          type="button"
          data-testid="invoice-confirm"
          onclick={handleConfirm}
          disabled={loading}
          aria-busy={loading}
        >
          {#if loading}
            <span class="invoice-creator__confirm-spinner" aria-hidden="true">
              <span class="invoice-creator__spinner-dot"></span>
              <span class="invoice-creator__spinner-dot"></span>
              <span class="invoice-creator__spinner-dot"></span>
            </span>
          {:else}
            <span class="invoice-creator__confirm-label">Créer la facture</span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Stripe hosted invoice link — shown after creation -->
    {#if hostedInvoiceUrl}
      <div class="invoice-creator__stripe-link-row" data-testid="invoice-stripe-link-row">
        <a
          class="invoice-creator__stripe-link"
          href={hostedInvoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="invoice-stripe-link"
        >
          Voir la facture Stripe
          <span class="invoice-creator__stripe-link-icon" aria-hidden="true">↗</span>
        </a>
        {#if stripeInvoiceId}
          <span class="invoice-creator__stripe-id" data-testid="invoice-stripe-id">{stripeInvoiceId}</span>
        {/if}
      </div>
    {/if}

    <!-- Breakdown — revealed after a successful call -->
    {#if breakdown}
      <div class="invoice-creator__breakdown-section" data-testid="invoice-breakdown-section">
        <button
          class="invoice-creator__breakdown-toggle"
          type="button"
          aria-expanded={breakdownExpanded}
          aria-controls="ic-breakdown-body"
          data-testid="invoice-breakdown-toggle"
          onclick={toggleBreakdown}
        >
          <span class="invoice-creator__breakdown-toggle-label">Détail de la facture</span>
          <span class="invoice-creator__breakdown-chevron" aria-hidden="true">▲</span>
        </button>

        {#if breakdownExpanded}
          <div
            class="invoice-creator__breakdown-body"
            id="ic-breakdown-body"
            data-testid="invoice-breakdown-body"
          >
            <table class="invoice-creator__breakdown-table">
              <caption class="invoice-creator__sr-only">Détail de la facture</caption>
              <tbody data-testid="invoice-breakdown-tbody">
                {#each rows as row (row.label)}
                  <tr
                    class:invoice-creator__breakdown-row--pre-total={row.preTotal}
                    class:invoice-creator__breakdown-row--total={row.final}
                  >
                    <td class="ic-cell-label">{row.label}</td>
                    <td class="ic-cell-value" class:ic-cell-value--count={row.count}>
                      {row.value}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* ── Custom property bridge (falls back to raw palette when globals absent) ── */
  .invoice-creator {
    --ic-surface: var(--surface-raised, #ece7db);
    --ic-surface-sunken: var(--surface-sunken, #e0dad0);
    --ic-surface-page: var(--surface, #f4efe6);
    --ic-border: var(--border, #c4baa8);
    --ic-border-strong: var(--border-strong, #9a8e7e);
    --ic-primary: var(--primary, #1b3b2a);
    --ic-primary-text: var(--primary-text, #f4efe6);
    --ic-accent: var(--accent, #7b4628);
    --ic-accent-hover: var(--accent-hover, #6a3a20);
    --ic-text: var(--text, #1c1a17);
    --ic-text-muted: var(--text-muted, #695e51);
    --ic-text-faint: var(--text-faint, #9a8e7e);
    --ic-danger: var(--danger, #8a2828);
    --ic-danger-text: var(--danger-text, #3d0a0a);

    background: var(--ic-surface);
    border: 1px solid var(--ic-border);
    border-radius: 4px;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    color: var(--ic-text);
    width: 100%;
    max-width: 400px;
    overflow: hidden;

    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }

  /* ── Header ── */
  .invoice-creator__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: var(--ic-primary);
    color: var(--ic-primary-text);
  }

  .invoice-creator__title {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.25;
    margin: 0;
    color: inherit;
    letter-spacing: 0.01em;
  }

  .invoice-creator__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--ic-primary-text);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .invoice-creator__close:hover {
    background: rgba(244, 239, 230, 0.12);
    border-color: rgba(244, 239, 230, 0.25);
  }

  .invoice-creator__close:focus-visible {
    outline: 2px solid var(--ic-accent);
    outline-offset: 2px;
  }

  /* ── Ineligibility notice ── */
  .invoice-creator__ineligible {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 16px;
    background: #fdf4f4;
    border-top: 2px solid var(--ic-danger);
    color: var(--ic-danger-text);
  }

  .invoice-creator__ineligible-icon {
    font-size: 14px;
    line-height: 1.5;
    flex-shrink: 0;
    color: var(--ic-danger);
  }

  .invoice-creator__ineligible-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ic-danger);
  }

  /* ── Form body ── */
  .invoice-creator__form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* ── Type segmented radio ── */
  .invoice-creator__type-group {
    border: none;
    margin: 0;
    padding: 0;
  }

  .invoice-creator__type-legend {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ic-text-muted);
    margin-bottom: 8px;
    display: block;
    width: 100%;
  }

  .invoice-creator__radio-row {
    display: flex;
    gap: 0;
    border: 1px solid var(--ic-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .invoice-creator__radio-label {
    flex: 1;
    display: block;
    cursor: pointer;
    position: relative;
  }

  .invoice-creator__radio-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .invoice-creator__radio-pill {
    display: block;
    padding: 7px 12px;
    text-align: center;
    font-size: 13px;
    font-weight: 500;
    color: var(--ic-text-muted);
    background: var(--ic-surface-sunken);
    border-right: 1px solid var(--ic-border);
    transition:
      background 120ms ease,
      color 120ms ease;
    user-select: none;
    white-space: nowrap;
  }

  .invoice-creator__radio-label:last-child .invoice-creator__radio-pill {
    border-right: none;
  }

  .invoice-creator__radio-label:hover .invoice-creator__radio-pill {
    background: var(--ic-surface);
    color: var(--ic-text);
  }

  .invoice-creator__radio-input:checked + .invoice-creator__radio-pill {
    background: var(--ic-primary);
    color: var(--ic-primary-text);
    font-weight: 600;
  }

  .invoice-creator__radio-input:focus-visible + .invoice-creator__radio-pill {
    outline: 2px solid var(--ic-accent);
    outline-offset: -2px;
  }

  /* ── Deposit % row ── */
  .invoice-creator__deposit-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .invoice-creator__deposit-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ic-text-muted);
  }

  .invoice-creator__deposit-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--ic-border);
    border-radius: 2px;
    background: var(--ic-surface-page);
    overflow: hidden;
    max-width: 120px;
    transition: border-color 120ms ease;
  }

  .invoice-creator__deposit-wrap:focus-within {
    border-color: var(--ic-border-strong);
    outline: 2px solid var(--ic-accent);
    outline-offset: 1px;
  }

  .invoice-creator__deposit-input {
    flex: 1;
    min-width: 0;
    padding: 7px 8px;
    border: none;
    background: transparent;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 14px;
    color: var(--ic-text);
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .invoice-creator__deposit-input::-webkit-inner-spin-button,
  .invoice-creator__deposit-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .invoice-creator__deposit-input:focus {
    outline: none;
  }

  .invoice-creator__deposit-suffix {
    padding: 0 10px 0 6px;
    font-size: 14px;
    color: var(--ic-text-muted);
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    line-height: 1;
  }

  .invoice-creator__deposit-hint {
    margin: 0;
    font-size: 11px;
    color: var(--ic-text-faint);
    line-height: 1.4;
  }

  /* ── API error ── */
  .invoice-creator__api-error {
    padding: 10px 12px;
    background: #fdf4f4;
    border: 1px solid var(--ic-danger);
    border-radius: 2px;
    color: var(--ic-danger);
  }

  .invoice-creator__api-error-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }

  /* ── Actions ── */
  .invoice-creator__actions {
    display: flex;
    justify-content: flex-end;
  }

  .invoice-creator__confirm {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 20px;
    background: var(--ic-accent);
    color: var(--ic-primary-text);
    border: none;
    border-radius: 2px;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease;
    min-width: 140px;
  }

  .invoice-creator__confirm:hover:not(:disabled) {
    background: var(--ic-accent-hover);
  }

  .invoice-creator__confirm:focus-visible {
    outline: 2px solid var(--ic-accent);
    outline-offset: 2px;
  }

  .invoice-creator__confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ── Spinner dots ── */
  .invoice-creator__confirm-spinner {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }

  .invoice-creator__spinner-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: ic-dot-blink 1.2s ease-in-out infinite;
  }

  .invoice-creator__spinner-dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .invoice-creator__spinner-dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes ic-dot-blink {
    0%,
    80%,
    100% {
      opacity: 0.2;
    }
    40% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .invoice-creator__spinner-dot {
      animation: none;
      opacity: 0.6;
    }
  }

  /* ── Stripe hosted link row ── */
  .invoice-creator__stripe-link-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 16px;
    background: var(--ic-surface-sunken);
    border-top: 1px solid var(--ic-border);
  }

  .invoice-creator__stripe-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ic-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    word-break: break-all;
  }

  .invoice-creator__stripe-link:hover {
    color: var(--ic-accent-hover);
  }

  .invoice-creator__stripe-link:focus-visible {
    outline: 2px solid var(--ic-accent);
    outline-offset: 2px;
    border-radius: 2px;
  }

  .invoice-creator__stripe-link-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .invoice-creator__stripe-id {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    color: var(--ic-text-faint);
    letter-spacing: 0.04em;
    word-break: break-all;
  }

  /* ── Breakdown section ── */
  .invoice-creator__breakdown-section {
    border-top: 1px solid var(--ic-border);
  }

  .invoice-creator__breakdown-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 16px;
    background: var(--ic-surface-sunken);
    border: none;
    border-bottom: 1px solid var(--ic-border);
    cursor: pointer;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ic-text-muted);
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .invoice-creator__breakdown-toggle:hover {
    background: var(--ic-border);
    color: var(--ic-text);
  }

  .invoice-creator__breakdown-toggle:focus-visible {
    outline: 2px solid var(--ic-accent);
    outline-offset: -2px;
  }

  .invoice-creator__breakdown-chevron {
    font-size: 10px;
    transition: transform 200ms ease;
    display: inline-block;
  }

  .invoice-creator__breakdown-toggle[aria-expanded="false"] .invoice-creator__breakdown-chevron {
    transform: rotate(180deg);
  }

  /* ── Breakdown table — ledger style ── */
  .invoice-creator__breakdown-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .invoice-creator__breakdown-table tr {
    border-bottom: 1px solid var(--ic-border);
  }

  .invoice-creator__breakdown-table tr:nth-child(even) {
    background: var(--ic-surface-sunken);
  }

  .invoice-creator__breakdown-table tr:last-child {
    border-bottom: none;
  }

  .invoice-creator__breakdown-row--pre-total {
    border-top: 2px solid var(--ic-border-strong) !important;
  }

  .invoice-creator__breakdown-row--total {
    background: var(--ic-primary) !important;
    border-top: 2px solid var(--ic-primary) !important;
  }

  .invoice-creator__breakdown-row--total .ic-cell-label,
  .invoice-creator__breakdown-row--total .ic-cell-value {
    color: var(--ic-primary-text) !important;
    font-weight: 700;
  }

  .ic-cell-label {
    padding: 8px 12px 8px 16px;
    color: var(--ic-text-muted);
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    line-height: 1.4;
  }

  .ic-cell-value {
    padding: 8px 16px 8px 12px;
    text-align: right;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 13px;
    color: var(--ic-text);
    line-height: 1.4;
    white-space: nowrap;
  }

  .ic-cell-value--count {
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-weight: 600;
  }

  /* ── Screen-reader utility ── */
  .invoice-creator__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ── Responsive — full-width at ≤640px ── */
  @media (max-width: 640px) {
    .invoice-creator {
      max-width: 100%;
      border-radius: 0;
    }
  }
</style>
