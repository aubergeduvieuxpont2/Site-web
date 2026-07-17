<script lang="ts">
  interface Template {
    key: string;
    name: { fr: string; en: string };
  }

  let {
    templates = [],
    selectedKey = '',
    selectedLocale = 'fr',
    selectedWidth = 'desktop',
    loading = false,
    onTemplateChange,
    onLocaleChange,
    onWidthChange,
  }: {
    templates: Template[];
    selectedKey: string;
    selectedLocale: 'fr' | 'en';
    selectedWidth: 'desktop' | 'mobile';
    loading: boolean;
    onTemplateChange?: (key: string) => void;
    onLocaleChange?: (locale: 'fr' | 'en') => void;
    onWidthChange?: (width: 'desktop' | 'mobile') => void;
  } = $props();

  function handleTemplateChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    onTemplateChange?.(select.value);
  }
</script>

<div class="email-controls-bar">

  <!-- Template Picker -->
  <div class="ecb-group ecb-group--grow">
    <label class="ecb-label" for="ecb-template-select">MODÈLE</label>
    <select
      id="ecb-template-select"
      class="ecb-select"
      disabled={loading}
      onchange={handleTemplateChange}
      data-testid="template-picker"
    >
      {#each templates as tpl}
        <option value={tpl.key} selected={tpl.key === selectedKey}>
          {selectedLocale === 'fr' ? tpl.name.fr : tpl.name.en}
        </option>
      {/each}
    </select>
  </div>

  <!-- Locale Toggle -->
  <div class="ecb-group">
    <span class="ecb-label" id="ecb-locale-label">LANGUE</span>
    <div
      class="ecb-toggle"
      role="group"
      aria-labelledby="ecb-locale-label"
      data-testid="locale-toggle"
    >
      <button
        type="button"
        class="ecb-toggle-btn"
        class:ecb-toggle-btn--active={selectedLocale === 'fr'}
        aria-pressed={selectedLocale === 'fr'}
        disabled={loading}
        onclick={() => onLocaleChange?.('fr')}
      >FR</button>
      <button
        type="button"
        class="ecb-toggle-btn"
        class:ecb-toggle-btn--active={selectedLocale === 'en'}
        aria-pressed={selectedLocale === 'en'}
        disabled={loading}
        onclick={() => onLocaleChange?.('en')}
      >EN</button>
    </div>
  </div>

  <!-- Width Toggle -->
  <div class="ecb-group">
    <span class="ecb-label" id="ecb-width-label">AFFICHAGE</span>
    <div
      class="ecb-toggle"
      role="group"
      aria-labelledby="ecb-width-label"
      data-testid="width-toggle"
    >
      <button
        type="button"
        class="ecb-toggle-btn ecb-toggle-btn--wide"
        class:ecb-toggle-btn--active={selectedWidth === 'desktop'}
        aria-pressed={selectedWidth === 'desktop'}
        disabled={loading}
        onclick={() => onWidthChange?.('desktop')}
        aria-label="Affichage bureau"
      >BUREAU</button>
      <button
        type="button"
        class="ecb-toggle-btn ecb-toggle-btn--wide"
        class:ecb-toggle-btn--active={selectedWidth === 'mobile'}
        aria-pressed={selectedWidth === 'mobile'}
        disabled={loading}
        onclick={() => onWidthChange?.('mobile')}
        aria-label="Affichage mobile"
      >MOBILE</button>
    </div>
  </div>

</div>

<style>
  /* Scoped to .email-controls-bar — no globals */

  .email-controls-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-sm) var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface-container-low);
    border-bottom: 1px solid var(--color-outline-variant);
  }

  /* ── Group ──────────────────────────────────────── */

  .ecb-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ecb-group--grow {
    flex: 1 1 200px;
    min-width: 180px;
  }

  /* ── Label (matches .tech-label utility) ─────────── */

  .ecb-label {
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant);
    line-height: 1;
    user-select: none;
  }

  /* ── Select ──────────────────────────────────────── */

  .ecb-select {
    appearance: none;
    -webkit-appearance: none;
    background-color: var(--color-surface-container-lowest);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpolygon points='3,5 13,5 8,11' fill='%2345464d'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 14px;
    border: 1px solid var(--color-outline-variant);
    border-radius: 6px;
    color: var(--color-ink);
    font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif;
    font-size: 14px;
    height: 44px;
    padding: 0 32px 0 var(--space-sm);
    cursor: pointer;
    width: 100%;
    transition: border-color 120ms ease;
  }

  .ecb-select:hover:not(:disabled) {
    border-color: var(--color-ink-variant);
  }

  .ecb-select:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 1px;
    border-color: var(--color-terracotta);
  }

  .ecb-select:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  /* ── Segmented Toggle ────────────────────────────── */

  .ecb-toggle {
    display: flex;
    border: 1px solid var(--color-outline-variant);
    border-radius: 6px;
    overflow: hidden;
    background: var(--color-surface-container-lowest);
  }

  .ecb-toggle-btn {
    appearance: none;
    background: transparent;
    border: none;
    border-right: 1px solid var(--color-outline-variant);
    color: var(--color-ink-variant);
    cursor: pointer;
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-height: 44px;
    min-width: 44px;
    padding: 0 var(--space-sm);
    transition: background-color 120ms ease, color 120ms ease;
    white-space: nowrap;
  }

  .ecb-toggle-btn--wide {
    padding: 0 var(--space-md);
  }

  .ecb-toggle-btn:last-child {
    border-right: none;
  }

  .ecb-toggle-btn:hover:not(:disabled):not(.ecb-toggle-btn--active) {
    background-color: color-mix(in srgb, var(--color-surface-container-low) 60%, transparent);
    color: var(--color-ink);
  }

  .ecb-toggle-btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: -2px;
    position: relative;
    z-index: 1;
  }

  .ecb-toggle-btn--active {
    background-color: var(--color-secondary-container);
    color: var(--color-on-secondary-container);
  }

  .ecb-toggle-btn--active:hover {
    background-color: color-mix(in srgb, var(--color-secondary-container) 85%, black);
  }

  .ecb-toggle-btn:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  /* ── Responsive: narrow viewports ────────────────── */

  @media (max-width: 640px) {
    .email-controls-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .ecb-group--grow {
      flex: none;
      width: 100%;
    }

    .ecb-select {
      width: 100%;
    }
  }
</style>
