<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getMe,
    adminEmailTemplates,
    adminEmailPreview,
    isError,
    type EmailTemplateSummary,
    type EmailPreview,
  } from '$lib/api';
  import EmailControlsBar from './EmailControlsBar.svelte';
  import EmailPreviewPane from './EmailPreviewPane.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Button from '$lib/components/Button.svelte';

  // ─── Auth state ───
  let loading = $state(true);
  let denied = $state(false);

  // ─── Template list ───
  let templates = $state<EmailTemplateSummary[]>([]);
  let loadingTemplates = $state(false);

  // ─── Controls state ───
  let selectedKey = $state('');
  let selectedLocale = $state<'fr' | 'en'>('fr');
  let selectedWidth = $state<'desktop' | 'mobile'>('desktop');

  // ─── Preview state ───
  let preview = $state<EmailPreview>({ subject: '', html: '', text: '' });
  let loadingPreview = $state(false);
  let previewError = $state<string | null>(null);

  // ─── Fetch preview for the current key + locale ───
  async function fetchPreview(): Promise<void> {
    if (!selectedKey) return;
    loadingPreview = true;
    previewError = null;
    const result = await adminEmailPreview(selectedKey, selectedLocale);
    loadingPreview = false;
    if (isError(result)) {
      previewError = result.error;
    } else {
      preview = result;
    }
  }

  // ─── Callback handlers for EmailControlsBar ───
  async function handleTemplateChange(key: string): Promise<void> {
    selectedKey = key;
    await fetchPreview();
  }

  async function handleLocaleChange(locale: 'fr' | 'en'): Promise<void> {
    selectedLocale = locale;
    await fetchPreview();
  }

  function handleWidthChange(width: 'desktop' | 'mobile'): void {
    // Width is purely a visual constraint on the iframe — no re-fetch needed.
    selectedWidth = width;
  }

  // ─── Mount: auth gate → template list → initial preview ───
  onMount(async () => {
    const me = await getMe();
    if (isError(me) || me.user.role !== 'admin') {
      denied = true;
      loading = false;
      return;
    }
    loading = false;

    loadingTemplates = true;
    const result = await adminEmailTemplates();
    loadingTemplates = false;

    if (isError(result)) {
      previewError = result.error;
      return;
    }

    templates = result.templates;
    if (templates.length > 0) {
      selectedKey = templates[0].key;
      await fetchPreview();
    }
  });
</script>

<svelte:head>
  <title>Courriels — Administration — Auberge du Vieux Pont</title>
</svelte:head>

<div class="courriels-page">
  {#if loading}
    <div
      class="courriels-page__loading"
      aria-live="polite"
      aria-label="Chargement…"
      data-testid="courriels-loading"
    >
      <span class="courriels-page__spinner" aria-hidden="true"></span>
    </div>
  {:else if denied}
    <div class="courriels-page__denied" role="main" data-testid="courriels-denied">
      <div class="courriels-page__denied-inner">
        <SectionLabel text="Accès refusé" />
        <h1 class="courriels-page__denied-title">Zone réservée</h1>
        <p class="courriels-page__denied-msg" data-testid="denied-msg">
          Vous n'avez pas les droits d'accès à cette section.
        </p>
        <Button href="/" variant="secondary">← Accueil</Button>
      </div>
    </div>
  {:else}
    <div class="courriels-page__main" data-testid="courriels-main">
      <header class="courriels-page__header">
        <div class="courriels-page__header-inner">
          <a class="courriels-page__back" href="/admin" data-testid="back-link">
            ← Administration
          </a>
          <h1 class="courriels-page__title">Courriels — Administration</h1>
        </div>
      </header>

      <div class="courriels-page__body">
        <div class="courriels-page__controls-wrap">
          <EmailControlsBar
            {templates}
            {selectedKey}
            {selectedLocale}
            {selectedWidth}
            loading={loadingTemplates || loadingPreview}
            onTemplateChange={handleTemplateChange}
            onLocaleChange={handleLocaleChange}
            onWidthChange={handleWidthChange}
          />
        </div>

        <div class="courriels-page__preview-wrap">
          <EmailPreviewPane
            subject={preview.subject}
            html={preview.html}
            text={preview.text}
            width={selectedWidth}
            loading={loadingPreview}
            error={previewError}
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* All scoped to .courriels-page — no globals */

  /* ─── Page shell ─── */
  .courriels-page {
    min-height: 100dvh;
    background-color: var(--color-surface);
    font-family: var(--font-sans);
  }

  /* ─── Loading state ─── */
  .courriels-page__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 30dvh;
  }

  .courriels-page__spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-outline-variant);
    border-top-color: var(--color-ink);
    border-radius: 50%;
    animation: cp-spin 700ms linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .courriels-page__spinner {
      animation: none;
      border-top-color: var(--color-ink-variant);
      opacity: 0.6;
    }
  }

  @keyframes cp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ─── Denied state (mirrors .page-admin__denied exactly) ─── */
  .courriels-page__denied {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100dvh - 64px);
    padding: var(--space-2xl) var(--space-md);
    padding-top: calc(64px + var(--space-2xl));
  }

  .courriels-page__denied-inner {
    max-width: 480px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .courriels-page__denied-title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(36px, 6vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: 0;
  }

  .courriels-page__denied-msg {
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
  }

  /* ─── Main content ─── */
  .courriels-page__main {
    padding-top: 64px; /* fixed nav height */
  }

  /* ─── Header ─── */
  .courriels-page__header {
    padding: var(--space-xl) var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .courriels-page__header-inner {
    max-width: 1280px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .courriels-page__back {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    text-decoration: none;
    padding: 2px 0;
    border-radius: 2px;
    transition: color 120ms ease;
  }

  .courriels-page__back:hover {
    color: var(--color-ink);
  }

  .courriels-page__back:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
    color: var(--color-ink);
  }

  .courriels-page__title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(28px, 4vw, 40px);
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }

  /* ─── Body layout ─── */
  .courriels-page__body {
    max-width: 1280px;
    margin-inline: auto;
    padding: var(--space-xl) var(--space-md) var(--space-3xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* Controls wrap: EmailControlsBar is full-width, self-contained */
  .courriels-page__controls-wrap {
    border: 1px solid var(--color-outline-variant);
    border-radius: 8px;
    overflow: hidden;
  }

  /* Preview wrap: EmailPreviewPane fills remaining width */
  .courriels-page__preview-wrap {
    min-width: 0;
  }

  /* ─── Responsive ─── */
  @media (max-width: 640px) {
    .courriels-page__header {
      padding: var(--space-lg) var(--space-md) var(--space-md);
    }

    .courriels-page__body {
      padding: var(--space-lg) var(--space-md) var(--space-2xl);
      gap: var(--space-md);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .courriels-page__back {
      transition: none;
    }
  }
</style>
