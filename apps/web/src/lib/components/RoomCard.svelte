<script lang="ts">
  import ImagePanel from './ImagePanel.svelte';
  import { settings } from '../settings.svelte';
  import { auth } from '../auth.svelte';

  let { room } = $props<{
    room: {
      name: string;
      description: string;
      imgKey: string;
      picsumSeed: number;
    };
  }>();

  let displayPrice = $derived(
    (auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice).toFixed(2)
  );

  let showCustomBadge = $derived(
    auth.user?.effectiveNightlyPrice != null &&
    auth.user.effectiveNightlyPrice !== settings.nightlyPrice
  );
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
    <div class="room-card-effective-price">
      <div class="price-display">
        <span class="price-amount" data-testid="price-amount">${displayPrice}</span>
        <span class="price-label">/nuit</span>
      </div>
      {#if showCustomBadge}
        <div class="custom-pricing-badge" data-testid="custom-pricing-badge">
          Tarif personnalisé
        </div>
      {/if}
    </div>

    <h3 class="room-card__name" data-testid="room-card-name">
      {room.name}
    </h3>

    <p class="room-card__description" data-testid="room-card-description">
      {room.description}
    </p>
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

  /* ── Effective price display ─────────────────────────────────────────── */
  .room-card-effective-price {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }

  .price-display {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .price-amount {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-accent, #7B4628);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    line-height: 1.2;
  }

  .price-label {
    font-size: 13px;
    color: var(--color-text-muted, #695E51);
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.02em;
  }

  .custom-pricing-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    background-color: var(--color-surface-sunken, #E0DAD0);
    border: 1px solid var(--color-border, #C4BAA8);
    border-radius: 2px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted, #695E51);
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.03em;
    text-transform: uppercase;
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
</style>
