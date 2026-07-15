<script lang="ts">
  let {
    number,
    width = "full",
    class: klass = "",
  }: {
    number?: string;
    width?: "full" | "contained";
    class?: string;
  } = $props();
</script>

<div class="contour contour--{width} {klass}" data-testid="contour">
  {#if number}
    <span class="contour__number" aria-hidden="true" data-testid="contour-number">{number}</span>
  {/if}
  <div class="contour__rule" aria-hidden="true" data-testid="contour-rule"></div>
</div>

<style>
  .contour {
    display: flex;
    align-items: center;
    gap: var(--space-md, 16px);
    width: 100%;
  }

  .contour--contained {
    max-width: 1100px;
    margin-inline: auto;
  }

  .contour__number {
    font-family: var(--font-mono, "IBM Plex Mono", "Fira Code", ui-monospace, monospace);
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant, #45464d);
    flex-shrink: 0;
    user-select: none;
    position: relative;
    top: -0.5px;
  }

  .contour__rule {
    flex: 1 1 0%;
    height: 1px;
    background-color: var(--color-outline-variant, #c6c6cd);
  }
</style>
