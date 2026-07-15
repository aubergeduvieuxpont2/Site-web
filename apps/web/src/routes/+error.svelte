<script lang="ts">
  import { page } from "$app/stores";
  import Button from "$lib/components/Button.svelte";

  // SvelteKit renders this inside the root +layout.svelte, which already owns the
  // `<main id="main">` landmark. We therefore do NOT emit a second <main> here —
  // that would create a duplicate landmark. The <h1> carries the error semantics
  // required by the design (role="main" is provided one level up by the shell).
</script>

<div class="error-page" data-testid="error-page">
  <!-- Decorative blueprint registration hairlines (top / bottom). -->
  <span
    class="error-page__divider error-page__divider--top"
    aria-hidden="true"
  ></span>

  <div class="error-page__content">
    <h1 class="error-page__code" data-testid="error-code">{$page.status}</h1>

    <p class="error-page__message" data-testid="error-message">
      {#if $page.status === 404}
        Cette page est introuvable.
      {:else}
        Une erreur est survenue.
      {/if}
    </p>

    <div class="error-page__action" data-testid="home-link">
      <Button href="/" variant="secondary">← Accueil</Button>
    </div>
  </div>

  <span
    class="error-page__divider error-page__divider--bottom"
    aria-hidden="true"
  ></span>
</div>

<style>
  .error-page {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    padding: 6rem 1.5rem;
    background-color: var(--color-surface);
    color: var(--color-ink);
    text-align: center;
  }

  .error-page__divider {
    position: absolute;
    width: 40px;
    height: 1px;
    background-color: var(--color-hairline-2);
  }

  .error-page__divider--top {
    top: 4rem;
  }

  .error-page__divider--bottom {
    bottom: 4rem;
  }

  .error-page__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    max-width: 600px;
  }

  /* Hero-scale Light-300 error code — the "Zen breath" of the design system. */
  .error-page__code {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 96px;
    font-weight: 300;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
  }

  .error-page__message {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
  }

  .error-page__action {
    margin-top: 0.5rem;
  }

  @media (max-width: 640px) {
    .error-page {
      padding: 4rem 1rem;
    }

    .error-page__code {
      font-size: 64px;
    }

    .error-page__message {
      font-size: 16px;
    }

    .error-page__divider {
      width: 30px;
    }

    .error-page__divider--top {
      top: 2.5rem;
    }

    .error-page__divider--bottom {
      bottom: 2.5rem;
    }
  }
</style>
