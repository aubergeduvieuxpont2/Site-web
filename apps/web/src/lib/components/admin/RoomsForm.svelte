<script module lang="ts">
  // Kept local so this component never hard-depends on api.ts (owned by another
  // task). The shape is structural: `onSubmit` emits exactly this payload.
  export type RoomInput = {
    name: string;
    capacity: number;
    imageKey: string;
    isPublic: boolean;
    passkeyEnabled: boolean;
    passkey?: string;
  };
</script>

<script lang="ts">
  // Fixed R2 asset allow-list (lowercase, no extension). Hard-coding it here (a
  // <select> over these keys) means freetext image paths can never be submitted.
  // MUST stay in sync with ROOM_IMAGE_KEYS in apps/api/src/rooms.ts.
  const ALLOWED_IMAGE_KEYS = [
    "bedroom",
    "balcony",
    "living-dining",
    "lounge",
    "dining",
    "kitchen",
    "laundry",
    "bathroom-1",
    "bathroom-2",
    "bathroom-3",
    "auberge-exterior",
    "auberge-porch",
    "bridge",
    "village-river",
  ] as const;

  // Human labels for the <select>, in the same order as the keys above.
  const IMAGE_OPTIONS: { key: string; label: string }[] = [
    { key: "bedroom", label: "Chambre" },
    { key: "balcony", label: "Balcon" },
    { key: "living-dining", label: "Salon-salle à manger" },
    { key: "lounge", label: "Salon" },
    { key: "dining", label: "Salle à manger" },
    { key: "kitchen", label: "Cuisine" },
    { key: "laundry", label: "Buanderie" },
    { key: "bathroom-1", label: "Salle de bain 1" },
    { key: "bathroom-2", label: "Salle de bain 2" },
    { key: "bathroom-3", label: "Salle de bain 3" },
    { key: "auberge-exterior", label: "Extérieur de l'auberge" },
    { key: "auberge-porch", label: "Porche de l'auberge" },
    { key: "bridge", label: "Pont" },
    { key: "village-river", label: "Rivière du village" },
  ];

  // ─── Props ───
  let {
    initialValues = null,
    onSubmit,
    loading = false,
    error = null,
    submitLabel = "Enregistrer",
  }: {
    initialValues?: RoomInput | null;
    onSubmit: (data: RoomInput) => Promise<void>;
    loading?: boolean;
    error?: string | null;
    submitLabel?: string;
  } = $props();

  // ─── Form state ───
  let name = $state(initialValues?.name ?? "");
  let capacity = $state<number>(initialValues?.capacity ?? 1);
  let imageKey = $state(initialValues?.imageKey ?? "");
  let isPublic = $state(initialValues?.isPublic ?? true);
  let passkeyEnabled = $state(initialValues?.passkeyEnabled ?? false);
  let passkey = $state(initialValues?.passkey ?? "");

  // ─── Per-field validation errors (French) ───
  let nameError = $state("");
  let capacityError = $state("");
  let imageKeyError = $state("");
  let passkeyError = $state("");

  // Reset local state whenever the caller swaps `initialValues` (e.g. an inline
  // edit row is collapsed and re-opened for a different room). Tracking the
  // object reference is the correct Svelte 5 dependency here.
  $effect(() => {
    initialValues;
    name = initialValues?.name ?? "";
    capacity = initialValues?.capacity ?? 1;
    imageKey = initialValues?.imageKey ?? "";
    isPublic = initialValues?.isPublic ?? true;
    passkeyEnabled = initialValues?.passkeyEnabled ?? false;
    passkey = initialValues?.passkey ?? "";
    nameError = "";
    capacityError = "";
    imageKeyError = "";
    passkeyError = "";
  });

  function validateName() {
    nameError = name.trim().length === 0 ? "Le nom est requis." : "";
  }

  function validateCapacity() {
    const n = Number(capacity);
    capacityError =
      !Number.isInteger(n) || n < 1
        ? "La capacité doit être un entier supérieur à 0."
        : "";
  }

  function validateImageKey() {
    imageKeyError = !ALLOWED_IMAGE_KEYS.includes(imageKey as (typeof ALLOWED_IMAGE_KEYS)[number])
      ? "Veuillez choisir une clé d'image valide."
      : "";
  }

  function validatePasskey() {
    passkeyError =
      passkeyEnabled && passkey.trim().length === 0
        ? "La clé est requise lorsqu'elle est activée."
        : "";
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    // Run every validator, then read the results in the same synchronous frame.
    validateName();
    validateCapacity();
    validateImageKey();
    validatePasskey();
    if (nameError || capacityError || imageKeyError || passkeyError) return;

    await onSubmit({
      name: name.trim(),
      capacity: Number(capacity),
      imageKey,
      isPublic,
      passkeyEnabled,
      passkey: passkeyEnabled ? passkey.trim() : "",
    });
    // The parent owns the post-success reset (clear on create / collapse on
    // edit) via `initialValues` — we deliberately do not clear state here.
  }
</script>

<!-- svelte-ignore a11y_no_redundant_roles -->
<form
  class="rooms-form"
  role="form"
  aria-label={initialValues ? "Modifier la chambre" : "Ajouter une chambre"}
  data-testid="rooms-form"
  onsubmit={handleSubmit}
>
  <!-- Name -->
  <div class="page-admin__field">
    <label class="page-admin__field-label" for="rooms-form-name">Nom</label>
    <input
      class="page-admin__search-input rooms-form__input"
      class:rooms-form__input--error={!!nameError}
      id="rooms-form-name"
      type="text"
      name="name"
      bind:value={name}
      onblur={validateName}
      aria-describedby="rooms-form-name-error"
      aria-invalid={!!nameError}
      aria-required="true"
      autocomplete="off"
      data-testid="rooms-form-name"
    />
    <span
      class="rooms-form__field-error"
      id="rooms-form-name-error"
      role="alert"
      aria-live="polite">{nameError}</span
    >
  </div>

  <!-- Capacity -->
  <div class="page-admin__field">
    <label class="page-admin__field-label" for="rooms-form-capacity">Capacité</label>
    <input
      class="page-admin__search-input rooms-form__input rooms-form__input--number"
      class:rooms-form__input--error={!!capacityError}
      id="rooms-form-capacity"
      type="number"
      name="capacity"
      min="1"
      step="1"
      bind:value={capacity}
      onblur={validateCapacity}
      aria-describedby="rooms-form-capacity-error"
      aria-invalid={!!capacityError}
      aria-required="true"
      data-testid="rooms-form-capacity"
    />
    <span
      class="rooms-form__field-error"
      id="rooms-form-capacity-error"
      role="alert"
      aria-live="polite">{capacityError}</span
    >
  </div>

  <!-- Image key -->
  <div class="page-admin__field">
    <label class="page-admin__field-label" for="rooms-form-image-key">Image</label>
    <select
      class="page-admin__select rooms-form__select"
      class:rooms-form__input--error={!!imageKeyError}
      id="rooms-form-image-key"
      name="imageKey"
      bind:value={imageKey}
      onblur={validateImageKey}
      onchange={validateImageKey}
      aria-describedby="rooms-form-image-key-error"
      aria-invalid={!!imageKeyError}
      aria-required="true"
      data-testid="rooms-form-image-key"
    >
      <option value="">— choisir une image —</option>
      {#each IMAGE_OPTIONS as opt (opt.key)}
        <option value={opt.key}>{opt.label}</option>
      {/each}
    </select>
    <span
      class="rooms-form__field-error"
      id="rooms-form-image-key-error"
      role="alert"
      aria-live="polite">{imageKeyError}</span
    >
  </div>

  <!-- isPublic -->
  <div class="page-admin__field rooms-form__field--checkbox">
    <label class="rooms-form__checkbox-label" for="rooms-form-is-public">
      <input
        class="rooms-form__checkbox"
        id="rooms-form-is-public"
        type="checkbox"
        name="isPublic"
        bind:checked={isPublic}
        data-testid="rooms-form-is-public"
      />
      <span class="page-admin__field-label rooms-form__checkbox-text">Publique</span>
    </label>
  </div>

  <!-- passkeyEnabled -->
  <div class="page-admin__field rooms-form__field--checkbox">
    <label class="rooms-form__checkbox-label" for="rooms-form-passkey-enabled">
      <input
        class="rooms-form__checkbox"
        id="rooms-form-passkey-enabled"
        type="checkbox"
        name="passkeyEnabled"
        bind:checked={passkeyEnabled}
        onchange={validatePasskey}
        data-testid="rooms-form-passkey-enabled"
      />
      <span class="page-admin__field-label rooms-form__checkbox-text">Clé d'accès activée</span>
    </label>
  </div>

  <!-- passkey (only when enabled) -->
  {#if passkeyEnabled}
    <div class="page-admin__field">
      <label class="page-admin__field-label" for="rooms-form-passkey">Clé d'accès</label>
      <input
        class="page-admin__search-input rooms-form__input"
        class:rooms-form__input--error={!!passkeyError}
        id="rooms-form-passkey"
        type="text"
        name="passkey"
        bind:value={passkey}
        onblur={validatePasskey}
        aria-describedby="rooms-form-passkey-error"
        aria-invalid={!!passkeyError}
        aria-required="true"
        autocomplete="off"
        data-testid="rooms-form-passkey"
      />
      <span
        class="rooms-form__field-error"
        id="rooms-form-passkey-error"
        role="alert"
        aria-live="polite">{passkeyError}</span
      >
    </div>
  {/if}

  <!-- Server error -->
  {#if error}
    <div
      class="page-admin__error-banner rooms-form__server-error"
      role="alert"
      data-testid="rooms-form-server-error"
    >
      {error}
    </div>
  {/if}

  <!-- Actions -->
  <div class="rooms-form__actions">
    <button
      class="rooms-form__submit"
      type="submit"
      disabled={loading}
      aria-busy={loading}
      aria-label={loading ? "Enregistrement en cours…" : submitLabel}
      data-testid="rooms-form-submit"
    >
      {#if loading}
        <span class="rooms-form__spinner" aria-hidden="true"></span>
      {/if}
      <span class="rooms-form__submit-text">{loading ? "Enregistrement…" : submitLabel}</span>
    </button>
  </div>
</form>

<style>
  /* ─── Layout ─── */
  .rooms-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  /* ─── Field container + label (self-contained; page-admin styles are
     scoped to the admin route and do not reach this component) ─── */
  .page-admin__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .page-admin__field-label {
    display: block;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin-bottom: var(--space-xs);
  }

  /* ─── Text / number input base ─── */
  .page-admin__search-input {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
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

  .page-admin__search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .page-admin__search-input::placeholder {
    color: var(--color-outline);
  }

  /* ─── Select base ─── */
  .page-admin__select {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    height: 44px;
    padding: 0 var(--space-xl) 0 var(--space-md);
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2376777d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    transition: border-color 160ms ease;
  }

  .page-admin__select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  /* ─── Invalid field ring ─── */
  .rooms-form__input--error.page-admin__search-input,
  .rooms-form__input--error.page-admin__select {
    border-color: var(--color-error);
  }

  .rooms-form__input--error.page-admin__search-input:focus,
  .rooms-form__input--error.page-admin__select:focus {
    outline: none;
    border-color: var(--color-error);
    box-shadow: 0 0 0 1px var(--color-error);
  }

  /* ─── Per-field validation error text ─── */
  .rooms-form__field-error {
    display: block;
    min-height: 1.25em; /* reserve space so error appearing does not shift layout */
    margin-top: 2px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--color-error);
  }

  /* ─── Checkbox row ─── */
  .rooms-form__field--checkbox {
    padding-block: 2px;
  }

  .rooms-form__checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    cursor: pointer;
  }

  .rooms-form__checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--color-forest);
    cursor: pointer;
    flex-shrink: 0;
  }

  /* Neutralise the block + margin-bottom the label class sets, so the text
     lines up inline next to the checkbox. */
  .rooms-form__checkbox-text {
    display: inline;
    margin-bottom: 0;
  }

  /* ─── Server error banner ─── */
  .page-admin__error-banner {
    padding: var(--space-md);
    border: 1px solid var(--color-error);
    border-radius: var(--radius, 0.25rem);
    background-color: color-mix(in srgb, var(--color-error) 6%, var(--color-surface));
    color: var(--color-error);
  }

  .rooms-form__server-error {
    font-size: 14px;
  }

  /* ─── Submit row ─── */
  .rooms-form__actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-xs);
  }

  .rooms-form__submit {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    height: 36px;
    padding: 0 var(--space-md);
    min-width: 100px;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-on-secondary-container);
    background-color: var(--color-secondary-container);
    border: none;
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  .rooms-form__submit:hover:not(:disabled) {
    opacity: 0.88;
    transform: translateY(-1px);
  }

  .rooms-form__submit:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 2px;
  }

  .rooms-form__submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ─── Inline loading spinner ─── */
  .rooms-form__spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-on-secondary-container);
    border-top-color: transparent;
    border-radius: 50%;
    animation: rooms-form-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes rooms-form-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rooms-form__submit {
      transition: none;
    }
    .rooms-form__spinner {
      animation: none;
      border-top-color: var(--color-on-secondary-container);
      opacity: 0.55;
    }
  }
</style>
