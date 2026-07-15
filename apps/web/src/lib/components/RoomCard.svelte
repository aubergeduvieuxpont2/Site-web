<script lang="ts">
  import ImagePanel from './ImagePanel.svelte';
  import Button from './Button.svelte';
  import { settings } from '../settings.svelte';

  let { room } = $props<{
    room: {
      name: string;
      description: string;
      imgKey: string;
      picsumSeed: number;
    };
  }>();

  const contactHref = "/contact";
  const priceLabel = $derived(`${settings.nightlyPrice} $/nuit`);
</script>

<article class="room-card" data-testid="room-card">
  <div class="room-card__image">
    <ImagePanel
      imgKey={room.imgKey}
      picsumSeed={room.picsumSeed}
      alt={room.name}
      aspectRatio="4/3"
    />
  </div>

  <div class="room-card__body">
    <span class="room-card__price" data-testid="room-card-price">
      {priceLabel}
    </span>

    <h3 class="room-card__name" data-testid="room-card-name">
      {room.name}
    </h3>

    <p class="room-card__description" data-testid="room-card-description">
      {room.description}
    </p>

    <div class="room-card__cta" data-testid="room-card-cta">
      <Button variant="secondary" href={contactHref}>Réserver</Button>
    </div>
  </div>
</article>

<style>
  .room-card {
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-container-lowest, #ffffff);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius-lg, 0.5rem);
    overflow: hidden;
    transition:
      transform 320ms cubic-bezier(0.33, 1, 0.68, 1),
      border-color 200ms ease,
      box-shadow 320ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .room-card:hover {
    transform: translateY(-4px);
    border-color: var(--color-outline, #76777d);
    box-shadow: 0 8px 32px rgba(25, 28, 30, 0.08);
  }

  /* Propagate image scale when hovering the card body area */
  .room-card:hover :global(.image-panel__img) {
    transform: scale(1.02);
  }

  @media (prefers-reduced-motion: reduce) {
    .room-card {
      transition: border-color 150ms ease;
    }

    .room-card:hover {
      transform: none;
      box-shadow: none;
    }

    .room-card:hover :global(.image-panel__img) {
      transform: none;
    }
  }

  .room-card__image {
    flex-shrink: 0;
    overflow: hidden;
  }

  .room-card__body {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: var(--space-lg, 24px);
    gap: var(--space-sm, 8px);
  }

  .room-card__price {
    font-family: var(--font-mono, "IBM Plex Mono", "Fira Code", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
  }

  .room-card__name {
    font-family: var(--font-sans, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif);
    font-size: 20px;
    font-weight: 400;
    line-height: 1.3;
    color: var(--color-ink, #191c1e);
    margin: 0;
  }

  .room-card__description {
    font-family: var(--font-sans, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant, #45464d);
    margin: 0;
    flex: 1;
  }

  .room-card__cta {
    margin-top: var(--space-md, 16px);
  }
</style>
