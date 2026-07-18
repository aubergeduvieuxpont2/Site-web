<script lang="ts">
  // Presentational, fetch-free status strip shown when reservations are paused.
  // The single optional `text` prop defaults to the fixed FR maintenance string.
  let {
    text = "Réservations en pause — maintenance en cours.",
  }: { text?: string } = $props();
</script>

<div
  class="maintenance-banner"
  role="status"
  aria-live="polite"
  data-testid="maintenance-banner"
>
  {text}
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
