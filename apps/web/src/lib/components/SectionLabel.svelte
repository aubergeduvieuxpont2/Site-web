<script lang="ts">
  let {
    text = "",
    showHairline = true,
  }: {
    text: string;
    showHairline?: boolean;
  } = $props();
</script>

<div
  class="section-label {showHairline ? 'section-label--hairline' : ''}"
  data-testid="section-label"
>
  {#if showHairline}
    <hr class="section-label__rule" aria-hidden="true" data-testid="section-label-rule" />
  {/if}
  <span class="section-label__text" data-testid="section-label-text">
    {text}
  </span>
</div>

<style>
  .section-label {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm); /* 8px */
  }

  .section-label__rule {
    border: none;
    border-top: 1px solid var(--color-outline-variant);
    margin: 0;
    width: 100%;
  }

  .section-label__text {
    font-family: var(--font-mono); /* IBM Plex Mono */
    font-size: 11px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
  }

  .section-label:not(.section-label--hairline) .section-label__rule {
    display: none;
  }
</style>
