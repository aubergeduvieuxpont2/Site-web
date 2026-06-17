<script lang="ts">
  import Contour from "./Contour.svelte";

  /**
   * Duotone image panel. Uses a deterministic Lorem Picsum photo unified
   * into the brand palette with a terracotta/charcoal duotone wash, over a
   * structural charcoal fallback so it always reads as an intentional panel
   * even if the photo fails to load. Drop real photos into /public and pass
   * `src` to override.
   */
  let {
    seed,
    src = undefined,
    alt = "",
    label = "",
    code = "",
    ratio = "4 / 3",
    class: klass = "",
  }: {
    seed: string;
    src?: string;
    alt?: string;
    label?: string;
    code?: string;
    ratio?: string;
    class?: string;
  } = $props();

  const resolved = $derived(
    src ?? `https://picsum.photos/seed/avp-${seed}/1000/800`,
  );
  let failed = $state(false);
</script>

<figure
  class="grain relative overflow-hidden rounded-[var(--radius-blueprint)] bg-charcoal {klass}"
  style="aspect-ratio:{ratio}"
>
  {#if !failed}
    <img
      src={resolved}
      {alt}
      loading="lazy"
      onerror={() => (failed = true)}
      class="duotone absolute inset-0 h-full w-full scale-[1.02] object-cover transition-transform duration-[1.2s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
    />
  {/if}

  <!-- duotone washes -->
  <div class="absolute inset-0 bg-terracotta/30 mix-blend-multiply"></div>
  <div
    class="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/10 to-transparent"
  ></div>
  <Contour
    class="absolute -right-10 -top-10 h-48 w-48 text-ember/20"
    rings={7}
  />
  <span class="grain-overlay"></span>

  {#if code}
    <span
      class="tech-label absolute right-3 top-3 text-on-charcoal/70"
      style="writing-mode:vertical-rl">{code}</span
    >
  {/if}
  {#if label}
    <figcaption
      class="tech-label absolute bottom-3 left-3 text-on-charcoal/85"
    >
      {label}
    </figcaption>
  {/if}
</figure>
