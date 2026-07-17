<script lang="ts">
  let {
    subject = '',
    html = '',
    text = '',
    width = 'desktop',
    loading = false,
    error = null,
  }: {
    subject?: string;
    html?: string;
    text?: string;
    width?: 'desktop' | 'mobile';
    loading?: boolean;
    error?: string | null;
  } = $props();

  let activeTab = $state<'html' | 'text'>('html');

  const tabs: Array<{ id: 'html' | 'text'; label: string; panel: string }> = [
    { id: 'html', label: 'Aperçu HTML', panel: 'panel-html' },
    { id: 'text', label: 'Texte brut', panel: 'panel-text' },
  ];

  function activateTab(id: 'html' | 'text') {
    activeTab = id;
  }

  function handleKeydown(e: KeyboardEvent, id: 'html' | 'text') {
    const idx = tabs.findIndex((t) => t.id === id);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      activeTab = tabs[next].id;
      const tabEl = document.getElementById(`tab-${tabs[next].id}`);
      tabEl?.focus();
    }
  }

  let maxWidth = $derived(width === 'mobile' ? '375px' : '600px');
</script>

<div class="email-preview-pane" data-testid="email-preview-pane">

  <!-- Subject header strip -->
  <div class="email-preview-pane__subject-row">
    <span class="email-preview-pane__subject-label tech-label" aria-hidden="true">Objet</span>
    <span class="email-preview-pane__subject-value" data-testid="preview-subject">{subject}</span>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="email-preview-pane__error" role="alert">
      <svg class="email-preview-pane__error-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span class="email-preview-pane__error-text">{error}</span>
    </div>
  {/if}

  <!-- Tab strip -->
  <div class="email-preview-pane__tab-strip" role="tablist" aria-label="Format d'aperçu">
    {#each tabs as tab}
      <button
        class="email-preview-pane__tab"
        role="tab"
        id="tab-{tab.id}"
        aria-selected={activeTab === tab.id}
        aria-controls="panel-{tab.id}"
        tabindex={activeTab === tab.id ? 0 : -1}
        data-testid="{tab.id}-tab"
        onclick={() => activateTab(tab.id)}
        onkeydown={(e) => handleKeydown(e, tab.id)}
      >{tab.label}</button>
    {/each}
  </div>

  <!-- HTML tab panel -->
  <div
    class="email-preview-pane__panel email-preview-pane__panel--html"
    role="tabpanel"
    id="panel-html"
    aria-labelledby="tab-html"
    aria-busy={loading}
    hidden={activeTab !== 'html' || undefined}
  >
    <!-- Spinner overlay -->
    {#if loading}
      <div class="email-preview-pane__overlay" aria-hidden="true">
        <div class="email-preview-pane__spinner"></div>
      </div>
    {/if}

    <div class="email-preview-pane__paper-outer">
      <div class="email-preview-pane__paper-window" style="--preview-max-width: {maxWidth}">
        <iframe
          class="email-preview-pane__iframe"
          title="Aperçu du courriel"
          sandbox=""
          srcdoc={html}
          data-testid="email-preview-iframe"
        ></iframe>
      </div>
    </div>
  </div>

  <!-- Plain-text tab panel -->
  <div
    class="email-preview-pane__panel email-preview-pane__panel--text"
    role="tabpanel"
    id="panel-text"
    aria-labelledby="tab-text"
    hidden={activeTab !== 'text' || undefined}
  >
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre
      class="email-preview-pane__plaintext"
      aria-label="Corps du courriel en texte brut"
      tabindex="0"
    >{text}</pre>
  </div>

</div>

<style>
  /* ── Container ─────────────────────────────────────────────────────── */
  .email-preview-pane {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-outline-variant);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-surface);
    min-width: 0;
  }

  /* ── Subject strip ──────────────────────────────────────────────────── */
  .email-preview-pane__subject-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--color-surface-container-low);
    border-bottom: 1px solid var(--color-outline-variant);
    min-height: 44px;
    flex-wrap: wrap;
  }

  .email-preview-pane__subject-label {
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant);
    flex-shrink: 0;
    line-height: 1.4;
    padding-block: 0.2em;
  }

  .email-preview-pane__subject-value {
    font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: var(--color-ink);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
  }

  /* ── Error banner ───────────────────────────────────────────────────── */
  .email-preview-pane__error {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: #fff2f0;
    border-bottom: 1px solid var(--color-error);
    color: var(--color-error);
    font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 500;
  }

  .email-preview-pane__error-icon {
    flex-shrink: 0;
    color: var(--color-error);
  }

  /* ── Tab strip ──────────────────────────────────────────────────────── */
  .email-preview-pane__tab-strip {
    display: flex;
    background: var(--color-surface-container-low);
    border-bottom: 1px solid var(--color-outline-variant);
    padding-inline: var(--space-md);
    gap: 0;
  }

  .email-preview-pane__tab {
    font-family: "IBM Plex Sans", Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-sm) var(--space-md);
    cursor: pointer;
    min-height: 44px;
    position: relative;
    top: 1px;
    transition: color 0.12s, border-color 0.12s;
  }

  .email-preview-pane__tab:hover {
    color: var(--color-ink);
  }

  .email-preview-pane__tab:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .email-preview-pane__tab[aria-selected="true"] {
    color: var(--color-terracotta);
    border-bottom-color: var(--color-terracotta);
  }

  /* ── Shared panel ───────────────────────────────────────────────────── */
  .email-preview-pane__panel { min-height: 400px; }
  .email-preview-pane__panel[hidden] { display: none; }

  /* ── HTML panel ─────────────────────────────────────────────────────── */
  .email-preview-pane__panel--html {
    position: relative;
    background: var(--color-surface);
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* Spinner overlay */
  .email-preview-pane__overlay {
    position: absolute;
    inset: 0;
    background: rgba(247, 249, 251, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: inherit;
  }

  .email-preview-pane__spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-outline-variant);
    border-top-color: var(--color-terracotta);
    border-radius: 50%;
    animation: epp-spin 0.75s linear infinite;
  }

  @keyframes epp-spin {
    to { transform: rotate(360deg); }
  }

  /* Paper outer: fills the panel, centers the window */
  .email-preview-pane__paper-outer {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  /* Paper window: the physical "proof sheet" */
  .email-preview-pane__paper-window {
    width: 100%;
    max-width: var(--preview-max-width, 600px);
    background: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: 4px;
    box-shadow:
      inset 0 2px 6px rgba(25, 28, 30, 0.06),
      0 1px 3px rgba(25, 28, 30, 0.08);
    overflow: hidden;
    transition: max-width 0.2s ease;
  }

  .email-preview-pane__iframe {
    display: block;
    width: 100%;
    min-height: 560px;
    height: auto;
    border: none;
    background: var(--color-surface-container-lowest);
  }

  /* ── Plain-text panel ───────────────────────────────────────────────── */
  .email-preview-pane__panel--text {
    background: var(--color-charcoal);
    padding: var(--space-lg);
  }

  .email-preview-pane__plaintext {
    font-family: "IBM Plex Mono", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-on-charcoal);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
    outline: none;
  }

  .email-preview-pane__plaintext:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 4px;
    border-radius: 2px;
  }
</style>
