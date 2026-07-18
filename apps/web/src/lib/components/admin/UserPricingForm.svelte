<script module lang="ts">
  // Kept local so this component never hard-depends on api.ts (owned by another
  // task). Mirrors the body accepted by POST /api/admin/users/:id/pricing.
  export type PricingMode = "public" | "discount" | "fixed";

  // Exactly one pricing strategy is active at a time; the inactive columns are
  // always nulled so mutual exclusivity is enforced on the wire, not just in the
  // UI. In fixed mode both the nightly and weekly fixed prices travel together.
  export type PricingRequest = {
    discountPercent: number | null;
    fixedNightlyPrice: number | null;
    fixedWeeklyPrice: number | null;
  };

  // The callback resolves to success or an `{ error }` shape (mirrors api.ts's
  // discriminated-union convention). No fetch happens inside this component —
  // the parent wires the actual API client.
  export type PricingResult = { ok: true } | { error: string };

  // Pure: derive the starting mode from the stored DB columns. Fixed wins if
  // both a fixed and a discount value are somehow set (defensive — the API keeps
  // them exclusive). A stored weekly-only fixed price still counts as fixed mode
  // even when the nightly column is null.
  export function initialPricingMode(
    discount: number | null,
    fixed: number | null,
    fixedWeekly?: number | null,
  ): PricingMode {
    if (fixed != null || fixedWeekly != null) return "fixed";
    if (discount != null) return "discount";
    return "public";
  }

  // Pure: compute the effective nightly price for a given mode + inputs.
  // Invalid inputs fall back to the public price so the preview never shows
  // a nonsensical amount. Exported for unit testing.
  export function computeEffectivePrice(
    mode: PricingMode,
    publicPrice: number,
    discount: number,
    fixed: number,
  ): number {
    if (mode === "discount" && Number.isFinite(discount) && discount >= 0 && discount <= 100) {
      return Math.round(publicPrice * (1 - discount / 100) * 100) / 100;
    }
    if (mode === "fixed" && Number.isFinite(fixed) && fixed >= 0) {
      return fixed;
    }
    return publicPrice;
  }

  // Pure: compute the effective weekly (7+ nights) price. Mirrors the nightly
  // rule and the server-side `resolveEffectiveWeekly` resolution — a discount is
  // applied to the public weekly rate, a fixed weekly amount overrides it, and
  // anything invalid falls back to the public weekly price. Exported for tests.
  export function computeEffectiveWeekly(
    mode: PricingMode,
    publicWeekly: number,
    discount: number,
    fixedWeekly: number,
  ): number {
    if (mode === "discount" && Number.isFinite(discount) && discount >= 0 && discount <= 100) {
      return Math.round(publicWeekly * (1 - discount / 100) * 100) / 100;
    }
    if (mode === "fixed" && Number.isFinite(fixedWeekly) && fixedWeekly >= 0) {
      return fixedWeekly;
    }
    return publicWeekly;
  }
</script>

<script lang="ts">
  // ─── Props ───
  let {
    userId,
    publicNightlyPrice,
    // Optional with a sensible fallback so a caller that hasn't yet wired the
    // weekly rate still renders (mirrors the settings `weeklyPrice` default).
    publicWeeklyPrice = 560,
    initialDiscount = null,
    initialFixed = null,
    initialFixedWeekly = null,
    onSavePricing,
  }: {
    userId: number | string;
    publicNightlyPrice: number;
    publicWeeklyPrice?: number;
    initialDiscount?: number | string | null;
    initialFixed?: number | string | null;
    initialFixedWeekly?: number | string | null;
    onSavePricing: (body: PricingRequest) => Promise<PricingResult>;
  } = $props();

  // ─── Defensive coercion (props → numbers, preserving null) ───
  // A caller may hand us string values straight from an API response that
  // bypassed backend normalization (e.g. Postgres NUMERIC serialized as a
  // string). Coerce through Number() so the preview and initial mode compute
  // correctly, while keeping `null`/`undefined` as `null`.
  const coercedDiscount = initialDiscount == null ? null : Number(initialDiscount);
  const coercedFixed = initialFixed == null ? null : Number(initialFixed);
  const coercedFixedWeekly = initialFixedWeekly == null ? null : Number(initialFixedWeekly);

  // ─── Form state (initialised once from props) ───
  let mode = $state<PricingMode>(
    initialPricingMode(coercedDiscount, coercedFixed, coercedFixedWeekly),
  );
  let discountValue = $state<number>(coercedDiscount ?? 0);
  let fixedValue = $state<number>(coercedFixed ?? 0);
  let fixedWeeklyValue = $state<number>(coercedFixedWeekly ?? 0);
  let dirty = $state(false);
  let loading = $state(false);
  let discountError = $state<string | null>(null);
  let fixedError = $state<string | null>(null);
  let fixedWeeklyError = $state<string | null>(null);
  let status = $state<{ state: "success" | "error"; msg: string } | null>(null);

  // ─── Live effective-price preview ───
  const effective = $derived(
    computeEffectivePrice(mode, publicNightlyPrice, discountValue, fixedValue),
  );
  const effectiveWeekly = $derived(
    computeEffectiveWeekly(mode, publicWeeklyPrice, discountValue, fixedWeeklyValue),
  );

  const currencyFmt = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  });

  const previewText = $derived(
    currencyFmt.format(Number.isFinite(effective) ? effective : publicNightlyPrice) + " /nuit",
  );
  const weeklyPreviewText = $derived(
    currencyFmt.format(Number.isFinite(effectiveWeekly) ? effectiveWeekly : publicWeeklyPrice) +
      " /semaine",
  );

  // ─── Handlers ───
  function onModeChange() {
    dirty = true;
    status = null;
  }

  function onDiscountInput() {
    discountError = null;
    dirty = true;
    status = null;
  }

  function onFixedInput() {
    fixedError = null;
    dirty = true;
    status = null;
  }

  function onFixedWeeklyInput() {
    fixedWeeklyError = null;
    dirty = true;
    status = null;
  }

  function validate(): boolean {
    discountError = null;
    fixedError = null;
    fixedWeeklyError = null;
    if (mode === "discount") {
      if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 100) {
        discountError = "La remise doit être comprise entre 0 et 100 %.";
        return false;
      }
    } else if (mode === "fixed") {
      if (!Number.isFinite(fixedValue) || fixedValue < 0) {
        fixedError = "Le prix fixe doit être un montant positif.";
        return false;
      }
      if (!Number.isFinite(fixedWeeklyValue) || fixedWeeklyValue < 0) {
        fixedWeeklyError = "Le prix hebdomadaire doit être un montant positif.";
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    if (!validate()) return;
    status = null;

    // Mutual exclusivity: only the active mode's column is sent; the other is
    // explicitly nulled so the server clears it.
    const body: PricingRequest = {
      discountPercent: mode === "discount" ? discountValue : null,
      fixedNightlyPrice: mode === "fixed" ? fixedValue : null,
      fixedWeeklyPrice: mode === "fixed" ? fixedWeeklyValue : null,
    };

    loading = true;
    try {
      const res = await onSavePricing(body);
      if ("error" in res) {
        status = { state: "error", msg: res.error || "Une erreur est survenue. Veuillez réessayer." };
        return;
      }
      dirty = false;
      status = { state: "success", msg: "Tarification enregistrée." };
    } catch {
      status = { state: "error", msg: "Erreur de réseau. Vérifiez votre connexion et réessayez." };
    } finally {
      loading = false;
    }
  }
</script>

<section
  class="user-pricing-form"
  role="group"
  aria-labelledby="upf-title"
  data-testid="user-pricing-form"
  data-user-id={userId}
>
  <!-- Header: title + live effective-price preview -->
  <header class="upf-header">
    <h3 class="upf-title" id="upf-title">Tarification</h3>
    <div class="upf-preview-badge" role="status" aria-label="Prix effectif actuel" data-testid="upf-preview-badge">
      <div class="upf-preview-col">
        <span class="upf-preview-label">Nuit</span>
        <span class="upf-preview-amount" data-testid="upf-preview-amount">{previewText}</span>
      </div>
      <span class="upf-preview-sep" aria-hidden="true"></span>
      <div class="upf-preview-col">
        <span class="upf-preview-label">Semaine (7+ nuits)</span>
        <span class="upf-preview-amount" data-testid="upf-preview-weekly-amount">{weeklyPreviewText}</span>
      </div>
    </div>
  </header>

  <!-- Radio mode selector -->
  <fieldset class="upf-fieldset" data-testid="upf-mode-fieldset">
    <legend class="upf-legend">Mode de tarification</legend>

    <label class="upf-radio-label" data-testid="upf-mode-public-label">
      <input
        class="upf-radio"
        type="radio"
        name="upf-pricing-mode"
        value="public"
        bind:group={mode}
        onchange={onModeChange}
        disabled={loading}
        data-testid="upf-mode-public"
      />
      <span class="upf-radio-pip" aria-hidden="true"></span>
      <span class="upf-radio-body">
        <span class="upf-radio-text">Prix public</span>
        <span class="upf-radio-desc">Aucun tarif personnalisé — le prix courant s'applique</span>
      </span>
    </label>

    <label class="upf-radio-label" data-testid="upf-mode-discount-label">
      <input
        class="upf-radio"
        type="radio"
        name="upf-pricing-mode"
        value="discount"
        bind:group={mode}
        onchange={onModeChange}
        disabled={loading}
        data-testid="upf-mode-discount"
      />
      <span class="upf-radio-pip" aria-hidden="true"></span>
      <span class="upf-radio-body">
        <span class="upf-radio-text">Remise (%)</span>
        <span class="upf-radio-desc">Réduction en pourcentage appliquée au prix public</span>
      </span>
    </label>

    <label class="upf-radio-label" data-testid="upf-mode-fixed-label">
      <input
        class="upf-radio"
        type="radio"
        name="upf-pricing-mode"
        value="fixed"
        bind:group={mode}
        onchange={onModeChange}
        disabled={loading}
        data-testid="upf-mode-fixed"
      />
      <span class="upf-radio-pip" aria-hidden="true"></span>
      <span class="upf-radio-body">
        <span class="upf-radio-text">Prix fixe ($/nuit)</span>
        <span class="upf-radio-desc">Montant fixe par nuit, indépendant du prix public</span>
      </span>
    </label>
  </fieldset>

  <!-- Conditional input panel — shown when mode ≠ "public" -->
  {#if mode !== "public"}
    <div class="upf-input-panel" data-testid="upf-input-panel">
      {#if mode === "discount"}
        <div class="upf-input-row" data-testid="upf-discount-row">
          <label class="upf-input-label" for="upf-discount-input">Remise</label>
          <div class="upf-input-wrapper">
            <input
              class="upf-input"
              type="number"
              id="upf-discount-input"
              data-testid="upf-discount-input"
              min="0"
              max="100"
              step="0.01"
              placeholder="ex : 10"
              bind:value={discountValue}
              oninput={onDiscountInput}
              disabled={loading}
              aria-describedby="upf-discount-hint upf-discount-error"
            />
            <span class="upf-input-suffix" aria-hidden="true">%</span>
          </div>
          <span class="upf-input-hint" id="upf-discount-hint">Entre 0 et 100</span>
          {#if discountError}
            <span class="upf-input-error" id="upf-discount-error" role="alert" data-testid="upf-discount-error">
              {discountError}
            </span>
          {/if}
        </div>
      {/if}

      {#if mode === "fixed"}
        <div class="upf-input-row" data-testid="upf-fixed-row">
          <label class="upf-input-label" for="upf-fixed-input">Prix par nuit</label>
          <div class="upf-input-wrapper">
            <span class="upf-input-prefix" aria-hidden="true">$</span>
            <input
              class="upf-input upf-input--prefixed"
              type="number"
              id="upf-fixed-input"
              data-testid="upf-fixed-input"
              min="0"
              step="0.01"
              placeholder="ex : 75"
              bind:value={fixedValue}
              oninput={onFixedInput}
              disabled={loading}
              aria-describedby="upf-fixed-hint upf-fixed-error"
            />
            <span class="upf-input-suffix" aria-hidden="true">$/nuit</span>
          </div>
          <span class="upf-input-hint" id="upf-fixed-hint">Montant en dollars canadiens</span>
          {#if fixedError}
            <span class="upf-input-error" id="upf-fixed-error" role="alert" data-testid="upf-fixed-error">
              {fixedError}
            </span>
          {/if}
        </div>

        <div class="upf-input-row upf-input-row--sep" data-testid="upf-fixed-weekly-row">
          <label class="upf-input-label" for="upf-fixed-weekly-input">Prix par semaine (7+ nuits)</label>
          <div class="upf-input-wrapper">
            <span class="upf-input-prefix" aria-hidden="true">$</span>
            <input
              class="upf-input upf-input--prefixed"
              type="number"
              id="upf-fixed-weekly-input"
              data-testid="upf-fixed-weekly-input"
              min="0"
              step="0.01"
              placeholder="ex : 490"
              bind:value={fixedWeeklyValue}
              oninput={onFixedWeeklyInput}
              disabled={loading}
              aria-describedby="upf-fixed-weekly-hint upf-fixed-weekly-error"
            />
            <span class="upf-input-suffix" aria-hidden="true">$/sem.</span>
          </div>
          <span class="upf-input-hint" id="upf-fixed-weekly-hint">
            Tarif hebdomadaire pour séjours de 7 nuits et plus
          </span>
          {#if fixedWeeklyError}
            <span
              class="upf-input-error"
              id="upf-fixed-weekly-error"
              role="alert"
              data-testid="upf-fixed-weekly-error"
            >
              {fixedWeeklyError}
            </span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer: save action + status -->
  <footer class="upf-footer">
    <button
      class="upf-save-btn"
      type="button"
      data-testid="upf-save-btn"
      aria-label="Enregistrer la tarification"
      aria-busy={loading}
      disabled={!dirty || loading}
      onclick={handleSave}
    >
      <span class="upf-save-label">{loading ? "Enregistrement…" : "Enregistrer"}</span>
      {#if loading}
        <span class="upf-save-spinner" aria-hidden="true"></span>
      {/if}
    </button>

    {#if status}
      <p class="upf-status" role="status" aria-live="polite" data-testid="upf-status" data-state={status.state}>
        {status.msg}
      </p>
    {/if}
  </footer>
</section>

<style>
  /* ── Token layer ── */
  .user-pricing-form {
    --upf-surface: var(--surface, #f4efe6);
    --upf-surface-raised: var(--surface-raised, #ece7db);
    --upf-surface-sunken: var(--surface-sunken, #e0dad0);
    --upf-border: var(--border, #c4baa8);
    --upf-border-strong: var(--border-strong, #9a8e7e);
    --upf-primary: var(--primary, #1b3b2a);
    --upf-primary-text: var(--primary-text, #f4efe6);
    --upf-accent: var(--accent, #7b4628);
    --upf-accent-hover: var(--accent-hover, #6a3a20);
    --upf-text: var(--text, #1c1a17);
    --upf-text-muted: var(--text-muted, #695e51);
    --upf-text-faint: var(--text-faint, #9a8e7e);
    --upf-success: var(--success, #2c5a3d);
    --upf-success-text: var(--success-text, #0d3320);
    --upf-danger: var(--danger, #8a2828);
    --upf-danger-text: var(--danger-text, #3d0a0a);

    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")
        center / 200px 200px,
      var(--upf-surface-raised);
    border: 1px solid var(--upf-border);
    border-radius: 4px;
    padding: 24px;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    color: var(--upf-text);
    font-size: 15px;
    line-height: 1.55;
  }

  /* ── Header ── */
  .upf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 20px;
  }

  .upf-title {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 19px;
    font-weight: 500;
    line-height: 1.25;
    color: var(--upf-primary);
    margin: 0;
  }

  /* ── Dual preview badge layout ── */
  .upf-preview-badge {
    display: inline-flex;
    align-items: stretch;
    gap: 0;
    background: var(--upf-primary);
    color: var(--upf-primary-text);
    border-radius: 2px;
    overflow: hidden;
  }

  .upf-preview-col {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 14px;
  }

  .upf-preview-sep {
    width: 1px;
    background: rgba(255, 255, 255, 0.15);
    flex-shrink: 0;
    align-self: stretch;
  }

  .upf-preview-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .upf-preview-amount {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 14px;
    font-weight: 500;
  }

  /* ── Radio fieldset ── */
  .upf-fieldset {
    border: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .upf-legend {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--upf-text-muted);
    margin-bottom: 12px;
    padding: 0;
    float: left;
    width: 100%;
  }

  .upf-radio-label {
    display: grid;
    grid-template-columns: 20px 1fr;
    align-items: start;
    column-gap: 12px;
    padding: 12px 14px;
    background: var(--upf-surface);
    border: 1px solid var(--upf-border);
    border-radius: 4px;
    cursor: pointer;
    transition:
      border-color 0.12s ease,
      background 0.12s ease;
    position: relative;
  }

  .upf-radio-label:hover {
    border-color: var(--upf-border-strong);
    background: var(--upf-surface-raised);
  }

  .upf-radio-label:has(.upf-radio:checked) {
    border-color: var(--upf-accent);
    background: var(--upf-surface-raised);
  }

  .upf-radio {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .upf-radio-pip {
    width: 16px;
    height: 16px;
    border: 2px solid var(--upf-border-strong);
    border-radius: 50%;
    background: var(--upf-surface);
    margin-top: 3px;
    flex-shrink: 0;
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;
  }

  .upf-radio-label:has(.upf-radio:checked) .upf-radio-pip {
    border-color: var(--upf-accent);
    background: var(--upf-accent);
    box-shadow: inset 0 0 0 3px var(--upf-surface-raised);
  }

  .upf-radio-label:has(.upf-radio:focus-visible) .upf-radio-pip {
    outline: 2px solid var(--upf-accent);
    outline-offset: 2px;
  }

  .upf-radio-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .upf-radio-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--upf-text);
    line-height: 1.3;
  }

  .upf-radio-desc {
    font-size: 12px;
    color: var(--upf-text-muted);
    line-height: 1.4;
  }

  /* ── Conditional input panel ── */
  .upf-input-panel {
    margin-top: 4px;
    background: var(--upf-surface-sunken);
    border: 1px solid var(--upf-border);
    border-radius: 4px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .upf-input-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Weekly input row separator ── */
  .upf-input-row--sep {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--upf-border);
  }

  .upf-input-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--upf-text-muted);
  }

  .upf-input-wrapper {
    display: inline-flex;
    align-items: stretch;
    background: var(--upf-surface);
    border: 1px solid var(--upf-border);
    border-radius: 2px;
    max-width: 220px;
    overflow: hidden;
    transition:
      border-color 0.12s,
      box-shadow 0.12s;
  }

  .upf-input-wrapper:focus-within {
    border-color: var(--upf-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--upf-accent) 25%, transparent);
  }

  .upf-input-prefix,
  .upf-input-suffix {
    display: flex;
    align-items: center;
    padding: 0 9px;
    background: var(--upf-surface-raised);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 13px;
    color: var(--upf-text-muted);
    white-space: nowrap;
    user-select: none;
  }

  .upf-input-prefix {
    border-right: 1px solid var(--upf-border);
  }
  .upf-input-suffix {
    border-left: 1px solid var(--upf-border);
  }

  .upf-input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: none;
    background: transparent;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 14px;
    color: var(--upf-text);
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .upf-input::-webkit-outer-spin-button,
  .upf-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .upf-input:focus {
    outline: none;
  }

  .upf-input-hint {
    font-size: 11px;
    color: var(--upf-text-faint);
    line-height: 1.4;
  }

  .upf-input-error {
    display: block;
    font-size: 12px;
    color: var(--upf-danger-text);
    background: color-mix(in srgb, var(--upf-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--upf-danger) 20%, transparent);
    border-radius: 2px;
    padding: 4px 8px;
    line-height: 1.4;
  }

  /* ── Footer ── */
  .upf-footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--upf-border);
  }

  .upf-save-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--upf-accent);
    color: var(--upf-primary-text);
    border: none;
    border-radius: 2px;
    padding: 9px 22px;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .upf-save-btn:hover:not(:disabled) {
    background: var(--upf-accent-hover);
  }

  .upf-save-btn:focus-visible {
    outline: 2px solid var(--upf-accent);
    outline-offset: 2px;
  }

  .upf-save-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @keyframes upf-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .upf-save-spinner {
    display: block;
    width: 13px;
    height: 13px;
    border: 2px solid rgba(244, 239, 230, 0.35);
    border-top-color: var(--upf-primary-text);
    border-radius: 50%;
    animation: upf-spin 0.65s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .upf-save-spinner {
      animation: none;
    }
  }

  .upf-status {
    display: block;
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    padding: 6px 12px;
    border-radius: 2px;
  }

  .upf-status[data-state="success"] {
    color: var(--upf-success-text);
    background: color-mix(in srgb, var(--upf-success) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--upf-success) 25%, transparent);
  }

  .upf-status[data-state="error"] {
    color: var(--upf-danger-text);
    background: color-mix(in srgb, var(--upf-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--upf-danger) 20%, transparent);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .user-pricing-form {
      padding: 16px;
    }
    .upf-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .upf-input-wrapper {
      max-width: 100%;
      width: 100%;
    }
    .upf-footer {
      flex-direction: column;
      align-items: stretch;
    }
    .upf-save-btn {
      justify-content: center;
    }
  }
</style>
