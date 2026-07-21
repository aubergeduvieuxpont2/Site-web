<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { verifyEmail, isError } from "$lib/api";
  import { t } from "$lib/i18n.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";
  import Contour from "$lib/components/Contour.svelte";

  // The token is read from the URL query string, never rendered to the DOM as
  // HTML — it is only passed to the API client. No client-side validation: the
  // server is the sole authority on whether a token is valid/expired/used.
  const token = $derived($page.url.searchParams.get("token"));

  type ViewState = "loading" | "success" | "error";
  // A missing token can never yield a valid confirmation, so start in the error
  // state; a present token starts loading and is verified on mount.
  let viewState = $state<ViewState>(
    $page.url.searchParams.get("token") ? "loading" : "error",
  );

  // Which flow the confirmed token belonged to, plus the confirmed address when
  // the API reports one. Both only drive display copy — never reflected as HTML.
  let purpose = $state<"register" | "change" | null>(null);
  let confirmedEmail = $state<string | null>(null);

  // Move keyboard focus to the outcome heading when the state resolves, so
  // screen readers announce it instead of stranding focus at the top of the page.
  let outcomeHeading = $state<HTMLElement | null>(null);
  $effect(() => {
    if (viewState === "success" || viewState === "error") outcomeHeading?.focus();
  });

  onMount(async () => {
    if (!token) {
      viewState = "error";
      return;
    }

    const result = await verifyEmail(token);

    if (isError(result)) {
      // Any failure — invalid/expired (400) or a now-taken address (409) — lands
      // on the single error panel; the server's decision is final.
      viewState = "error";
      return;
    }

    purpose = result.purpose;
    confirmedEmail = result.email ?? null;
    viewState = "success";
  });
</script>

<main class="verification" data-testid="verification-page">
  <div class="verification__container">
    <SectionLabel text={t('verification.label')} showHairline={true} />

    {#if viewState === "loading"}
      <div class="verification__loading-state" data-testid="verify-loading-state" aria-busy="true">
        <div class="verification__spinner" aria-hidden="true"></div>
        <p class="verification__loading-body" role="status" aria-live="polite">
          {t('verification.loading')}
        </p>
      </div>
    {:else if viewState === "success"}
      <div class="verification__success-state" data-testid="verify-success-state">
        <div class="verification__success-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
            <circle cx="20" cy="20" r="18.5" stroke="var(--color-forest)" stroke-width="1.5" />
            <path d="M13 20.5 L18 25.5 L27 15" stroke="var(--color-forest)" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" />
          </svg>
        </div>
        <h1 class="verification__success-heading" tabindex="-1" bind:this={outcomeHeading}>
          {t('verification.success.heading')}
        </h1>
        <p class="verification__success-body" data-testid="verify-success-body">
          {#if purpose === "change"}
            {t('verification.success.bodyChange', { email: confirmedEmail ? ` (${confirmedEmail})` : '' })}
          {:else}
            {t('verification.success.bodyRegister')}
          {/if}
        </p>
        <Button href="/profil" variant="secondary">{t('verification.success.cta')}</Button>
      </div>
    {:else}
      <div class="verification__error-state" role="alert" data-testid="verify-error-state">
        <div class="verification__error-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
            <circle cx="20" cy="20" r="18.5" stroke="var(--color-error)" stroke-width="1.5" />
            <path d="M14 14 L26 26 M26 14 L14 26" stroke="var(--color-error)" stroke-width="1.5" stroke-linecap="square" />
          </svg>
        </div>
        <h1 class="verification__error-heading" tabindex="-1" bind:this={outcomeHeading}>
          {t('verification.error.heading')}
        </h1>
        <p class="verification__error-body">
          {t('verification.error.body')}
        </p>
        <a href="/connexion" class="verification__back-link" data-testid="verify-back-to-login">
          {t('verification.error.backLink')}
        </a>
      </div>
    {/if}

    <Contour />
  </div>
</main>

<style>
  /* ── Page shell ────────────────────────────────────────────── */
  .verification {
    min-height: 100dvh;
    padding-top: calc(64px + var(--space-2xl));
    padding-bottom: var(--space-3xl);
    background-color: var(--color-surface);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .verification__container {
    width: 100%;
    max-width: 480px;
    padding: 0 var(--space-md);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ── Loading state ────────────────────────────────────────── */
  .verification__loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-2xl) var(--space-md);
    gap: var(--space-md);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
  }

  .verification__spinner {
    width: 32px;
    height: 32px;
    border: 2px solid var(--color-outline-variant);
    border-top-color: var(--color-forest);
    border-radius: 50%;
    animation: verify-spin 700ms linear infinite;
  }

  .verification__loading-body {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: 0;
    max-width: 360px;
  }

  /* ── Success state ────────────────────────────────────────── */
  .verification__success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-2xl) var(--space-md);
    gap: var(--space-md);
    background-color: var(--color-forest-surface);
    border: 1px solid color-mix(in srgb, var(--color-forest) 25%, transparent);
  }

  .verification__success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    animation: verify-icon-in 300ms cubic-bezier(0.33, 1, 0.68, 1) both;
  }

  .verification__success-heading {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--color-forest);
    margin: 0;
  }

  .verification__success-heading:focus-visible {
    outline: 2px solid var(--color-forest);
    outline-offset: 4px;
  }

  .verification__success-body {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: 0;
    max-width: 360px;
  }

  /* ── Error state ──────────────────────────────────────────── */
  .verification__error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-2xl) var(--space-md);
    gap: var(--space-md);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
  }

  .verification__error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }

  .verification__error-heading {
    font-family: var(--font-sans);
    font-size: 20px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--color-error);
    margin: 0;
  }

  .verification__error-heading:focus-visible {
    outline: 2px solid var(--color-error);
    outline-offset: 4px;
  }

  .verification__error-body {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: 0;
    max-width: 360px;
  }

  .verification__back-link {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--color-outline-variant);
    transition: text-decoration-color 150ms ease;
    margin-top: var(--space-xs);
  }

  .verification__back-link:hover {
    text-decoration-color: var(--color-ink);
  }

  .verification__back-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  @keyframes verify-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes verify-icon-in {
    from {
      opacity: 0;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Mobile ──────────────────────────────────────────────── */
  @media (max-width: 479px) {
    .verification {
      padding-top: calc(56px + var(--space-xl));
    }

    .verification__container {
      padding: 0 var(--space-sm);
      gap: var(--space-md);
    }

    .verification__loading-state,
    .verification__success-state,
    .verification__error-state {
      padding: var(--space-xl) var(--space-md);
    }
  }

  /* ── Reduced motion ──────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .verification__spinner {
      animation-duration: 1400ms;
    }

    .verification__success-icon {
      animation: none;
    }
  }
</style>

<svelte:head>
  <title>{t('verification.pageTitle')}</title>
</svelte:head>
