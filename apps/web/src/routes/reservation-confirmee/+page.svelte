<script lang="ts">
  import { page } from "$app/stores";
  import { t } from "$lib/i18n.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";
  import Contour from "$lib/components/Contour.svelte";
  import Seo from "$lib/components/Seo.svelte";

  // Read the Stripe session_id from the query string for display only.
  // The webhook is the authoritative source of truth for confirmation state.
  const sessionId = $derived($page.url.searchParams.get("session_id"));
</script>

<Seo
  title={t('confirmation.title')}
  description={t('confirmation.body')}
  path="/reservation-confirmee"
/>

<main class="confirmee" data-testid="reservation-confirmee">
  <div class="confirmee__container">
    <SectionLabel text={t('confirmation.title')} showHairline={true} />

    <div class="confirmee__card" role="status" aria-live="polite">
      <div class="confirmee__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
          <circle cx="24" cy="24" r="22.5" stroke="var(--color-forest)" stroke-width="1.5" />
          <path d="M15 24.5 L21 30.5 L33 18" stroke="var(--color-forest)" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" />
        </svg>
      </div>

      <h1 class="confirmee__heading">
        {t('confirmation.title')}
      </h1>

      <p class="confirmee__body">
        {t('confirmation.body')}
      </p>

      {#if sessionId}
        <p class="confirmee__ref">
          <span>{t('confirmation.sessionLabel', { session_id: sessionId })}</span>
        </p>
      {/if}
    </div>

    <div class="confirmee__actions">
      <Button href="/" variant="secondary">
        {t('confirmation.backHome')}
      </Button>
    </div>

    <Contour />
  </div>
</main>

<style>
  .confirmee {
    min-height: 100dvh;
    padding-top: calc(64px + var(--space-2xl));
    padding-bottom: var(--space-3xl);
    background-color: var(--color-surface);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .confirmee__container {
    width: 100%;
    max-width: 560px;
    padding: 0 var(--space-md);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .confirmee__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl) var(--space-lg);
    background-color: var(--color-surface-raised, var(--color-surface));
    border: 1px solid var(--color-border);
    border-radius: 4px;
    text-align: center;
  }

  .confirmee__icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirmee__heading {
    font-size: var(--text-2xl, 1.5rem);
    font-weight: 600;
    color: var(--color-heading);
    margin: 0;
  }

  .confirmee__body {
    font-size: var(--text-base, 1rem);
    color: var(--color-body);
    margin: 0;
    line-height: 1.6;
  }

  .confirmee__ref {
    font-size: var(--text-sm, 0.875rem);
    color: var(--color-muted);
    margin: 0;
    word-break: break-all;
  }

  .confirmee__actions {
    display: flex;
    justify-content: center;
  }
</style>
