<script lang="ts">
  import { onMount } from "svelte";
  import { adminGetSettings, adminUpdateSettings, changePassword, isError } from "$lib/api";
  import type { AdminSettings } from "$lib/api";

  // Parent binds this to pass the server-derived count to AdminDisponibilitesTab.
  let { assignableRoomCount = $bindable(12) }: { assignableRoomCount?: number } = $props();

  // Local settings shape — matches SettingsUpdateSchema exactly.
  type LocalSettings = {
    nightlyPrice: number;
    weeklyPrice: number;
    contactEmail: string;
    contactPhone: string;
    tps: number;
    tvq: number;
    accommodationTax: number;
    reservationsEnabled: boolean;
    emailConfirmationEnabled: boolean;
    emailPasswordResetEnabled: boolean;
    emailRoomAssignmentEnabled: boolean;
    emailWelcomeEnabled: boolean;
    emailReviewRequestEnabled: boolean;
  };

  const DEFAULTS: LocalSettings = {
    nightlyPrice: 89,
    weeklyPrice: 560,
    contactEmail: "info@aubergeduvieuxpont.ca",
    contactPhone: "418 655-1212",
    tps: 5,
    tvq: 9.975,
    accommodationTax: 3.5,
    reservationsEnabled: true,
    emailConfirmationEnabled: false,
    emailPasswordResetEnabled: false,
    emailRoomAssignmentEnabled: false,
    emailWelcomeEnabled: false,
    emailReviewRequestEnabled: false,
  };

  // ── Settings state ──────────────────────────────────────────────────────────
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let saveError = $state<string | null>(null);
  let saved = $state(false);
  let saving = $state(false);
  let s = $state<LocalSettings>({ ...DEFAULTS });
  let fieldErrors = $state<Partial<Record<keyof LocalSettings, string>>>({});

  // ── Password state ──────────────────────────────────────────────────────────
  let pwCurrent = $state("");
  let pwNew = $state("");
  let pwChanging = $state(false);
  let pwError = $state<string | null>(null);
  let pwSuccess = $state(false);
  let pwTimer: ReturnType<typeof setTimeout>;

  // ── Tax validation ──────────────────────────────────────────────────────────
  const TAX_KEYS = ["tps", "tvq", "accommodationTax"] as const;
  type TaxKey = (typeof TAX_KEYS)[number];

  function taxError(value: number | null | undefined): string | null {
    if (value === null || value === undefined || Number.isNaN(value)) return "Valeur invalide.";
    if (value < 0) return "La valeur ne peut pas être négative.";
    return null;
  }

  function validateTaxField(key: TaxKey) {
    const next = { ...fieldErrors };
    const err = taxError(s[key]);
    if (err) next[key] = err;
    else delete next[key];
    fieldErrors = next;
  }

  function mergeFromApi(res: AdminSettings) {
    s = {
      nightlyPrice: res.nightlyPrice,
      weeklyPrice: res.weeklyPrice ?? DEFAULTS.weeklyPrice,
      contactEmail: res.contactEmail,
      contactPhone: res.contactPhone,
      tps: res.tps,
      tvq: res.tvq,
      accommodationTax: res.accommodationTax,
      reservationsEnabled: res.reservationsEnabled ?? DEFAULTS.reservationsEnabled,
      emailConfirmationEnabled: res.emailConfirmationEnabled,
      emailPasswordResetEnabled: res.emailPasswordResetEnabled,
      emailRoomAssignmentEnabled: res.emailRoomAssignmentEnabled,
      emailWelcomeEnabled: res.emailWelcomeEnabled,
      emailReviewRequestEnabled: res.emailReviewRequestEnabled ?? false,
    };
    assignableRoomCount = res.assignableRoomCount;
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  async function loadSettings() {
    loading = true;
    loadError = null;
    const res = await adminGetSettings();
    loading = false;
    if (isError(res)) {
      loadError = res.error;
    } else {
      mergeFromApi(res);
    }
  }

  // ── Save (all settings except password) ────────────────────────────────────
  async function saveSettings() {
    saving = true;
    saved = false;
    saveError = null;
    fieldErrors = {};

    const errs: Partial<Record<keyof LocalSettings, string>> = {};
    if (!Number.isInteger(s.nightlyPrice) || s.nightlyPrice <= 0) {
      errs.nightlyPrice = "Prix doit être un entier positif";
    }
    if (!Number.isInteger(s.weeklyPrice) || s.weeklyPrice <= 0) {
      errs.weeklyPrice = "Prix doit être un entier positif";
    }
    if (!s.contactEmail || !s.contactEmail.includes("@")) {
      errs.contactEmail = "Courriel invalide";
    }
    if (!s.contactPhone || !s.contactPhone.trim()) {
      errs.contactPhone = "Téléphone requis";
    }
    for (const key of TAX_KEYS) {
      const err = taxError(s[key]);
      if (err) errs[key] = err;
    }

    if (Object.keys(errs).length > 0) {
      fieldErrors = errs;
      saving = false;
      return;
    }

    // Build payload with exactly the keys that SettingsUpdateSchema validates — no extras.
    const payload = {
      nightlyPrice: s.nightlyPrice,
      weeklyPrice: s.weeklyPrice,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      tps: s.tps,
      tvq: s.tvq,
      accommodationTax: s.accommodationTax,
      assignableRoomCount,
      reservationsEnabled: s.reservationsEnabled,
      emailConfirmationEnabled: s.emailConfirmationEnabled,
      emailPasswordResetEnabled: s.emailPasswordResetEnabled,
      emailRoomAssignmentEnabled: s.emailRoomAssignmentEnabled,
      emailWelcomeEnabled: s.emailWelcomeEnabled,
      emailReviewRequestEnabled: s.emailReviewRequestEnabled,
    } as unknown as AdminSettings;

    const res = await adminUpdateSettings(payload);
    saving = false;

    if (isError(res)) {
      saveError = res.error;
    } else {
      mergeFromApi(res);
      saved = true;
      setTimeout(() => { saved = false; }, 3000);
      // POST-SAVE SEAM: add public-settings store refresh here once the config-refresh stream lands.
    }
  }

  // ── Password change ─────────────────────────────────────────────────────────
  async function changePasswordInPanel() {
    pwError = null;
    pwSuccess = false;
    if (!pwCurrent) {
      pwError = "Veuillez saisir votre mot de passe actuel.";
      return;
    }
    if (pwNew.length < 8) {
      pwError = "Le nouveau mot de passe doit contenir au moins 8 caractères.";
      return;
    }
    pwChanging = true;
    const res = await changePassword(pwCurrent, pwNew);
    pwChanging = false;
    if (isError(res)) {
      pwError = res.error;
    } else {
      pwSuccess = true;
      pwCurrent = "";
      pwNew = "";
      clearTimeout(pwTimer);
      pwTimer = setTimeout(() => { pwSuccess = false; }, 5000);
    }
  }

  onMount(() => {
    loadSettings();
  });
</script>

<div class="params-tab" data-testid="admin-params-tab">
  {#if loading}
    <div class="params-tab__loading" aria-busy="true" aria-label="Chargement des paramètres…">
      <span class="params-tab__spinner" aria-hidden="true"></span>
    </div>
  {:else if loadError}
    <div class="params-tab__error-banner" role="alert" data-testid="params-error">{loadError}</div>
  {/if}

  {#if !loading}
    <!-- Screen-reader heading for the overall settings section; tabs and cards provide visual structure. -->
    <h2 class="params-tab__sr-only" id="settings-heading">Paramètres</h2>
    <!-- ── Card: Tarification & taxes ── -->
    <section class="params-tab__card" aria-labelledby="card-tarification">
      <h2 class="params-tab__card-title" id="card-tarification">Tarification &amp; taxes</h2>
      <div class="params-tab__fields">

        <div class="params-tab__field">
          <label class="params-tab__label" for="input-nightly-price">Prix par nuit ($)</label>
          <input
            id="input-nightly-price"
            type="number"
            min="1"
            bind:value={s.nightlyPrice}
            class="params-tab__input params-tab__input--num"
            data-testid="input-nightly-price"
            aria-invalid={!!fieldErrors.nightlyPrice}
            aria-describedby={fieldErrors.nightlyPrice ? "err-nightly-price" : undefined}
          />
          {#if fieldErrors.nightlyPrice}
            <span id="err-nightly-price" class="params-tab__field-error" role="alert" data-testid="error-nightly-price">{fieldErrors.nightlyPrice}</span>
          {/if}
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-weekly-price">Prix hebdomadaire ($)</label>
          <input
            id="pt-weekly-price"
            type="number"
            min="1"
            bind:value={s.weeklyPrice}
            class="params-tab__input params-tab__input--num"
            data-testid="input-weekly-price"
            aria-invalid={!!fieldErrors.weeklyPrice}
            aria-describedby={fieldErrors.weeklyPrice ? "err-weekly-price" : undefined}
          />
          {#if fieldErrors.weeklyPrice}
            <span id="err-weekly-price" class="params-tab__field-error" role="alert" data-testid="error-weekly-price">{fieldErrors.weeklyPrice}</span>
          {/if}
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-tps">TPS (%)</label>
          <input
            id="pt-tps"
            type="number"
            step="0.001"
            min="0"
            bind:value={s.tps}
            oninput={() => validateTaxField("tps")}
            class="params-tab__input params-tab__input--num"
            data-testid="tps-input"
            aria-invalid={!!fieldErrors.tps}
            aria-describedby="pt-tps-error"
          />
          <span id="pt-tps-error" class="params-tab__field-error" role="alert" aria-live="polite" data-testid="tps-error">{fieldErrors.tps ?? ""}</span>
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-tvq">TVQ (%)</label>
          <input
            id="pt-tvq"
            type="number"
            step="0.001"
            min="0"
            bind:value={s.tvq}
            oninput={() => validateTaxField("tvq")}
            class="params-tab__input params-tab__input--num"
            data-testid="tvq-input"
            aria-invalid={!!fieldErrors.tvq}
            aria-describedby="pt-tvq-error"
          />
          <span id="pt-tvq-error" class="params-tab__field-error" role="alert" aria-live="polite" data-testid="tvq-error">{fieldErrors.tvq ?? ""}</span>
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-accommodation-tax">Taxe d'hébergement (%)</label>
          <input
            id="pt-accommodation-tax"
            type="number"
            step="0.001"
            min="0"
            bind:value={s.accommodationTax}
            oninput={() => validateTaxField("accommodationTax")}
            class="params-tab__input params-tab__input--num"
            data-testid="accommodation-tax-input"
            aria-invalid={!!fieldErrors.accommodationTax}
            aria-describedby="pt-accommodation-tax-error"
          />
          <span id="pt-accommodation-tax-error" class="params-tab__field-error" role="alert" aria-live="polite" data-testid="accommodation-tax-error">{fieldErrors.accommodationTax ?? ""}</span>
        </div>

      </div>
    </section>

    <!-- ── Card: Coordonnées ── -->
    <section class="params-tab__card" aria-labelledby="card-coordonnees">
      <h2 class="params-tab__card-title" id="card-coordonnees">Coordonnées</h2>
      <div class="params-tab__fields">

        <div class="params-tab__field">
          <label class="params-tab__label" for="input-contact-email">Courriel de contact</label>
          <input
            id="input-contact-email"
            type="email"
            bind:value={s.contactEmail}
            class="params-tab__input"
            data-testid="input-contact-email"
            aria-invalid={!!fieldErrors.contactEmail}
            aria-describedby={fieldErrors.contactEmail ? "err-contact-email" : undefined}
          />
          {#if fieldErrors.contactEmail}
            <span id="err-contact-email" class="params-tab__field-error" role="alert" data-testid="error-contact-email">{fieldErrors.contactEmail}</span>
          {/if}
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-contact-phone">Téléphone</label>
          <input
            id="pt-contact-phone"
            type="text"
            bind:value={s.contactPhone}
            class="params-tab__input"
            data-testid="input-contact-phone"
            aria-invalid={!!fieldErrors.contactPhone}
            aria-describedby={fieldErrors.contactPhone ? "err-contact-phone" : undefined}
          />
          {#if fieldErrors.contactPhone}
            <span id="err-contact-phone" class="params-tab__field-error" role="alert" data-testid="error-contact-phone">{fieldErrors.contactPhone}</span>
          {/if}
        </div>

      </div>
    </section>

    <!-- ── Card: Réservations ── -->
    <section class="params-tab__card" aria-labelledby="card-reservations">
      <h2 class="params-tab__card-title" id="card-reservations">Réservations</h2>
      <div class="params-tab__fields">

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-reservations-enabled">Réservations actives</label>
          <div class="params-tab__toggle-row">
            <input
              id="pt-reservations-enabled"
              type="checkbox"
              bind:checked={s.reservationsEnabled}
              class="params-tab__toggle"
              data-testid="toggle-reservations-enabled"
              aria-label="Activer ou désactiver les réservations"
            />
            <span class="params-tab__toggle-label" aria-hidden="true">
              {s.reservationsEnabled ? "Activées" : "En pause (maintenance)"}
            </span>
          </div>
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-assignable-rooms">
            Chambres disponibles à l'attribution
            <span class="params-tab__hint">(calculé automatiquement — nombre de chambres publiques)</span>
          </label>
          <input
            id="pt-assignable-rooms"
            type="number"
            value={assignableRoomCount}
            readonly
            aria-readonly="true"
            tabindex="-1"
            class="params-tab__input params-tab__input--num params-tab__input--readonly"
            data-testid="input-assignable-rooms"
          />
        </div>

      </div>
    </section>

    <!-- ── Card: Courriels automatiques ── -->
    <section class="params-tab__card" aria-labelledby="card-emails">
      <h2 class="params-tab__card-title" id="card-emails">Courriels automatiques</h2>
      <div class="params-tab__toggles">

        <div class="params-tab__toggle-row">
          <input
            type="checkbox"
            id="pt-email-confirmation"
            class="params-tab__toggle"
            bind:checked={s.emailConfirmationEnabled}
            aria-label="Envoyer une confirmation de réservation par courriel"
            data-testid="toggle-email-confirmation"
          />
          <label for="pt-email-confirmation" class="params-tab__toggle-label">
            Confirmation de réservation
          </label>
        </div>

        <div class="params-tab__toggle-row">
          <input
            type="checkbox"
            id="pt-email-password-reset"
            class="params-tab__toggle"
            bind:checked={s.emailPasswordResetEnabled}
            aria-label="Envoyer un lien de réinitialisation de mot de passe par courriel"
            data-testid="toggle-email-password-reset"
          />
          <label for="pt-email-password-reset" class="params-tab__toggle-label">
            Réinitialisation de mot de passe
          </label>
        </div>

        <div class="params-tab__toggle-row">
          <input
            type="checkbox"
            id="pt-email-room-assignment"
            class="params-tab__toggle"
            bind:checked={s.emailRoomAssignmentEnabled}
            aria-label="Envoyer une notification d'assignation de chambre par courriel"
            data-testid="toggle-email-room-assignment"
          />
          <label for="pt-email-room-assignment" class="params-tab__toggle-label">
            Assignation de chambre
          </label>
        </div>

        <div class="params-tab__toggle-row">
          <input
            type="checkbox"
            id="pt-email-welcome"
            class="params-tab__toggle"
            bind:checked={s.emailWelcomeEnabled}
            aria-label="Envoyer un courriel de bienvenue aux nouveaux clients OTA"
            data-testid="toggle-email-welcome"
          />
          <label for="pt-email-welcome" class="params-tab__toggle-label">
            Bienvenue (OTA)
          </label>
        </div>

        <div class="params-tab__toggle-row">
          <input
            type="checkbox"
            id="pt-email-review-request"
            class="params-tab__toggle"
            bind:checked={s.emailReviewRequestEnabled}
            aria-label="Envoyer une demande d'avis après le séjour"
            data-testid="toggle-email-review-request"
          />
          <label for="pt-email-review-request" class="params-tab__toggle-label">
            Demande d'avis après séjour
          </label>
        </div>

      </div>
    </section>

    <!-- ── Sticky save bar (all cards above share one button) ── -->
    <div class="params-tab__save-bar" data-testid="params-save-bar">
      {#if saveError}
        <span class="params-tab__save-error" role="alert" data-testid="params-save-error">{saveError}</span>
      {:else if saved}
        <span class="params-tab__save-success" role="status" data-testid="settings-saved">
          Paramètres enregistrés.
        </span>
      {/if}
      <button
        type="button"
        class="params-tab__btn"
        class:params-tab__btn--has-error={!!saveError}
        onclick={saveSettings}
        disabled={saving}
        aria-label="Enregistrer les paramètres"
        data-testid="settings-save-btn"
      >
        {#if saving}
          <span class="params-tab__btn-spinner" aria-hidden="true"></span>
          Enregistrement…
        {:else}
          Enregistrer
        {/if}
      </button>
    </div>

    <!-- ── Divider ── -->
    <hr class="params-tab__divider" aria-hidden="true" />

    <!-- ── Card: Sécurité — password change keeps its own button ── -->
    <section class="params-tab__card" aria-labelledby="card-securite">
      <h2 class="params-tab__card-title" id="card-securite">Sécurité</h2>
      <div class="params-tab__fields">

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-current-password">Mot de passe actuel</label>
          <input
            id="pt-current-password"
            type="password"
            autocomplete="current-password"
            bind:value={pwCurrent}
            class="params-tab__input"
            data-testid="input-current-password"
            aria-invalid={!!pwError}
            aria-describedby={pwError ? "pt-pw-error" : undefined}
          />
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-new-password">
            Nouveau mot de passe
            <span class="params-tab__hint">(minimum 8 caractères)</span>
          </label>
          <input
            id="pt-new-password"
            type="password"
            autocomplete="new-password"
            bind:value={pwNew}
            class="params-tab__input"
            data-testid="input-new-password"
            aria-invalid={!!pwError}
            aria-describedby={pwError ? "pt-pw-error" : undefined}
          />
        </div>

        {#if pwError}
          <div id="pt-pw-error" class="params-tab__error-banner" role="alert" data-testid="pw-error">{pwError}</div>
        {/if}

        {#if pwSuccess}
          <div class="params-tab__pw-success" role="status" data-testid="pw-success">Mot de passe mis à jour.</div>
        {/if}

        <button
          type="button"
          class="params-tab__btn"
          onclick={changePasswordInPanel}
          disabled={pwChanging}
          aria-label="Enregistrer le nouveau mot de passe"
          data-testid="pw-change-btn"
        >
          {#if pwChanging}
            <span class="params-tab__btn-spinner" aria-hidden="true"></span>
            Enregistrement…
          {:else}
            Mettre à jour
          {/if}
        </button>

      </div>
    </section>
  {/if}
</div>

<style>
  /* ─── Screen-reader-only utility ─── */
  .params-tab__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    padding: 0;
  }

  /* ─── Shell ─── */
  .params-tab {
    --pt-surface: var(--color-surface-container-lowest, #fafaf8);
    --pt-border: var(--color-outline-variant, #c8c5be);
    --pt-ink: var(--color-ink, #1c1a17);
    --pt-ink-soft: var(--color-ink-variant, #695e51);
    --pt-error: var(--color-error, #ba1a1a);
    --pt-forest: #1a5c2d;
    --pt-forest-surface: #d4ede0;
    --pt-primary: var(--color-primary, #7b4628);
    --pt-secondary-bg: var(--color-secondary-container, #e8ddd5);
    --pt-secondary-ink: var(--color-on-secondary-container, #4a2c1a);

    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 640px;
    width: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
  }

  /* ─── Loading ─── */
  .params-tab__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 0;
  }

  .params-tab__spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--pt-border);
    border-top-color: var(--pt-ink);
    border-radius: 50%;
    animation: pt-spin 700ms linear infinite;
  }

  @keyframes pt-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .params-tab__spinner { animation: none; opacity: 0.6; }
  }

  /* ─── Error banner ─── */
  .params-tab__error-banner {
    padding: 12px 16px;
    border: 1px solid var(--pt-error);
    border-radius: 4px;
    background-color: color-mix(in srgb, var(--pt-error) 6%, white);
    font-size: 14px;
    color: var(--pt-error);
  }

  /* ─── Card ─── */
  .params-tab__card {
    background-color: var(--pt-surface);
    border: 1px solid var(--pt-border);
    border-radius: 4px;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    width: 100%;
    overflow: hidden;
  }

  .params-tab__card-title {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--pt-ink-soft);
    margin: 0;
  }

  /* ─── Fields ─── */
  .params-tab__fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .params-tab__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .params-tab__label {
    display: block;
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--pt-ink-soft);
  }

  .params-tab__hint {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--pt-ink-soft);
    margin-left: 4px;
  }

  .params-tab__input {
    appearance: none;
    -webkit-appearance: none;
    width: 280px;
    max-width: 100%;
    height: 44px;
    padding: 0 14px;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 14px;
    color: var(--pt-ink);
    background-color: white;
    border: 1px solid var(--pt-border);
    border-radius: 4px;
    transition: border-color 160ms ease;
    box-sizing: border-box;
  }

  .params-tab__input:focus {
    outline: none;
    border-color: var(--pt-primary);
    box-shadow: 0 0 0 1px var(--pt-primary);
  }

  .params-tab__input--num {
    width: 200px;
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }

  .params-tab__input--num[type="number"]::-webkit-outer-spin-button,
  .params-tab__input--num[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .params-tab__input--num[type="number"] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .params-tab__input--readonly {
    background-color: color-mix(in srgb, var(--pt-border) 20%, white);
    color: var(--pt-ink-soft);
    cursor: default;
  }

  .params-tab__field-error {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 12px;
    color: var(--pt-error);
  }

  /* ─── Toggles (email card) ─── */
  .params-tab__toggles {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .params-tab__toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .params-tab__toggle {
    position: relative;
    width: 44px;
    height: 24px;
    min-width: 44px;
    appearance: none;
    -webkit-appearance: none;
    background-color: var(--pt-border);
    border-radius: 12px;
    cursor: pointer;
    transition: background-color 180ms ease;
    flex-shrink: 0;
  }

  .params-tab__toggle:checked {
    background-color: var(--pt-forest);
  }

  .params-tab__toggle::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background-color: #fff;
    border-radius: 50%;
    transition: transform 180ms cubic-bezier(0.33, 1, 0.68, 1);
    pointer-events: none;
  }

  .params-tab__toggle:checked::after {
    transform: translateX(20px);
  }

  .params-tab__toggle:focus-visible {
    outline: 2px solid var(--pt-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .params-tab__toggle,
    .params-tab__toggle::after {
      transition: none;
    }
  }

  .params-tab__toggle-label {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 14px;
    color: var(--pt-ink-soft);
    line-height: 1.4;
  }

  /* ─── Sticky save bar ─── */
  .params-tab__save-bar {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 0;
    background-color: color-mix(in srgb, var(--color-surface, white) 95%, transparent);
    backdrop-filter: blur(4px);
    z-index: 1;
  }

  .params-tab__save-success {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--pt-forest);
    padding: 10px 14px;
    background-color: var(--pt-forest-surface);
    border-radius: 4px;
  }

  .params-tab__save-error {
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 13px;
    color: var(--pt-error);
    padding: 10px 14px;
    background-color: color-mix(in srgb, var(--pt-error) 6%, white);
    border: 1px solid color-mix(in srgb, var(--pt-error) 30%, white);
    border-radius: 4px;
    flex: 1;
    min-width: 0;
  }

  /* ─── Button ─── */
  .params-tab__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0 20px;
    min-width: 120px;
    font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--pt-secondary-ink);
    background-color: var(--pt-secondary-bg);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: opacity 160ms ease, transform 160ms cubic-bezier(0.33, 1, 0.68, 1);
    flex-shrink: 0;
    touch-action: manipulation;
  }

  .params-tab__btn--has-error {
    background-color: color-mix(in srgb, var(--pt-error) 12%, white);
    color: var(--pt-error);
  }

  .params-tab__btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .params-tab__btn:not(:disabled):hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }
  }

  .params-tab__btn:focus-visible {
    outline: 2px solid var(--pt-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .params-tab__btn { transition: none; }
    .params-tab__btn:hover { transform: none; }
  }

  .params-tab__btn-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: pt-spin 700ms linear infinite;
    margin-right: 6px;
    vertical-align: middle;
  }

  /* ─── Divider ─── */
  .params-tab__divider {
    border: none;
    border-top: 1px solid var(--color-hairline, var(--pt-border));
    margin: 0;
  }

  /* ─── Password success ─── */
  .params-tab__pw-success {
    padding: 12px 16px;
    background-color: var(--pt-forest-surface);
    border-radius: 4px;
    font-size: 14px;
    color: var(--pt-forest);
  }

  /* ─── Responsive ─── */
  @media (max-width: 640px) {
    .params-tab__card {
      padding: 16px;
    }

    .params-tab__input {
      width: 100%;
    }

    .params-tab__input--num {
      width: 100%;
    }
  }

  /* 375px hard-rule: full width, no overflow */
  @media (max-width: 400px) {
    .params-tab {
      gap: 16px;
    }

    .params-tab__card {
      padding: 14px;
    }

    .params-tab__save-bar {
      flex-direction: column;
      align-items: flex-start;
    }

    .params-tab__btn {
      width: 100%;
    }

    .params-tab__save-error {
      width: 100%;
    }
  }
</style>
