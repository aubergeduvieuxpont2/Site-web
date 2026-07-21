<script lang="ts">
  import { t } from "$lib/i18n.svelte";

  // `text` is an optional override; when omitted the banner shows the
  // translated default and follows the active locale. Derived rather than a
  // $props default so it stays reactive to both the prop and a locale switch.
  let { text }: { text?: string } = $props();
  const bannerText = $derived(text ?? t("contact.form.maintenanceNotice"));
</script>

<div
  class="maintenance-banner"
  role="status"
  aria-live="polite"
  data-testid="maintenance-banner"
>
  {bannerText}
</div>

<style>
  .maintenance-banner {
    width: 100%;
    padding: var(--space-md) var(--space-lg);
    background-color: var(--color-ember-pale);
    border-bottom: 1px solid var(--color-ember);
    color: var(--color-on-secondary-container);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.5;
    font-weight: 500;
    letter-spacing: 0.03em;
    text-align: center;
  }
</style>
