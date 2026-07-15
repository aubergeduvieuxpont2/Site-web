<script lang="ts">
  type Size = 'sm' | 'md' | 'lg';
  type Variant = 'dark' | 'light';

  let {
    size = 'md',
    variant = 'dark',
    class: klass = '',
  }: {
    size?: Size;
    variant?: Variant;
    class?: string;
  } = $props();

  const wordmarkClasses = $derived(`wordmark wordmark--${size} wordmark--${variant} ${klass}`.trim());
</script>

<svg
  class={wordmarkClasses}
  viewBox="0 0 200 50"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="Auberge du Vieux Pont"
  data-testid="wordmark"
  fill="currentColor"
>
  <!-- Line 1: industrial stamp — SemiBold tracked caps -->
  <text
    x="0"
    y="21"
    font-family="'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
    font-weight="600"
    font-size="18"
    letter-spacing="0.12em"
    fill="currentColor"
  >AUBERGE</text>

  <!-- Blueprint hairline separator -->
  <rect x="0" y="28" width="200" height="0.75" fill="currentColor" opacity="0.3" />

  <!-- Line 2: zen breath — Light weight, subtitle cadence -->
  <text
    x="0"
    y="45"
    font-family="'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
    font-weight="300"
    font-size="13"
    letter-spacing="0.10em"
    fill="currentColor"
  >DU VIEUX PONT</text>
</svg>

<style>
  :global(.wordmark) {
    display: block;
    flex-shrink: 0;
    color: var(--color-primary);
  }

  :global(.wordmark--light) {
    color: var(--color-on-primary);
  }

  :global(.wordmark--dark) {
    color: var(--color-primary);
  }

  :global(.wordmark--sm) {
    width: 112px;
  }

  :global(.wordmark--md) {
    width: 148px;
  }

  :global(.wordmark--lg) {
    width: 200px;
  }

  :global(.wordmark text) {
    dominant-baseline: auto;
    text-rendering: optimizeLegibility;
  }
</style>
