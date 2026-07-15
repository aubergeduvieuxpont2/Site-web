<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let {
    imgKey,
    picsumSeed,
    alt,
    aspectRatio = '4/3',
    caption,
  }: {
    imgKey: string;
    picsumSeed: string | number;
    alt: string;
    aspectRatio?: string;
    caption?: string;
  } = $props();

  let el: HTMLElement | undefined = $state();
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!el) return;

    const img = el.querySelector('[data-testid="image-panel-img"]') as HTMLImageElement | null;

    if (img) {
      img.addEventListener('error', () => {
        const fallback = img.dataset.picsumSrc;
        if (fallback && img.src !== fallback) {
          img.src = fallback;
        }
      });
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el!.classList.add('is-revealed');
            observer!.unobserve(el!);
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
  });

  onDestroy(() => {
    observer?.disconnect();
  });
</script>

<figure
  class="image-panel"
  style="--aspect: {aspectRatio}"
  data-testid="image-panel"
  bind:this={el}
>
  <div class="image-panel__clip">
    <img
      class="image-panel__img"
      src="/img/{imgKey}"
      {alt}
      loading="lazy"
      data-picsum-src="https://picsum.photos/seed/{picsumSeed}/1200/800"
      data-testid="image-panel-img"
    />
  </div>
  <figcaption
    class="image-panel__caption"
    data-testid="image-panel-caption"
    hidden={!caption}
  >
    {caption ?? ''}
  </figcaption>
</figure>

<style>
  .image-panel {
    --aspect: 4/3;
    display: block;
    position: relative;
    aspect-ratio: var(--aspect);
    margin: 0;
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 600ms cubic-bezier(0.33, 1, 0.68, 1),
      transform 600ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  /* :global needed because class is added dynamically via JS */
  .image-panel:global(.is-revealed) {
    opacity: 1;
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .image-panel {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }

  .image-panel__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .image-panel__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 500ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .image-panel:hover .image-panel__img {
    transform: scale(1.02);
  }

  @media (prefers-reduced-motion: reduce) {
    .image-panel__img {
      transition: none;
    }

    .image-panel:hover .image-panel__img {
      transform: none;
    }
  }

  .image-panel__caption {
    position: absolute;
    bottom: 0;
    left: 0;
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    line-height: 1.4;
    color: var(--color-inverse-on-surface, #f0f1f3);
    background-color: rgba(45, 49, 51, 0.7);
    background-color: color-mix(in srgb, var(--color-inverse-surface, #2d3133) 70%, transparent);
    max-width: 75%;
  }

  .image-panel__caption[hidden] {
    display: none;
  }
</style>
