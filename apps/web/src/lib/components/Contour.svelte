<script lang="ts">
  /** Topographic contour field — the brand's recurring trail motif. */
  let {
    class: klass = "",
    stroke = "currentColor",
    rings = 11,
    opacity = 1,
  }: {
    class?: string;
    stroke?: string;
    rings?: number;
    opacity?: number;
  } = $props();

  const items = $derived(Array.from({ length: rings }, (_, i) => i));
</script>

<svg
  class={klass}
  viewBox="0 0 480 480"
  fill="none"
  aria-hidden="true"
  preserveAspectRatio="xMidYMid slice"
  style="opacity:{opacity}"
>
  {#each items as i (i)}
    <ellipse
      cx="248"
      cy="238"
      rx={26 + i * 19}
      ry={18 + i * 13.5}
      {stroke}
      stroke-width="1"
      transform="rotate({i * 3 - 8} 248 238)"
    />
  {/each}
  {#each items.slice(0, 6) as i (`b${i}`)}
    <ellipse
      cx="92"
      cy="402"
      rx={14 + i * 16}
      ry={10 + i * 11}
      {stroke}
      stroke-width="1"
      transform="rotate({-i * 4} 92 402)"
    />
  {/each}
</svg>
