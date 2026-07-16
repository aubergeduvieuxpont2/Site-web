<script lang="ts">
  import HeroShader from '$lib/components/HeroShader.svelte';
  import RoomCard from '$lib/components/RoomCard.svelte';
  import ImagePanel from '$lib/components/ImagePanel.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Contour from '$lib/components/Contour.svelte';
  import Button from '$lib/components/Button.svelte';
  import { ROOMS, AMENITIES, STATS } from '$lib/content';
  import { settings } from '$lib/settings.svelte';
  import { auth } from '$lib/auth.svelte';
  import { reveal, countUp } from '$lib/motion';

  const featuredRooms = ROOMS.slice(0, 3);

  // Build stats with the rooms count from settings. $derived (not a plain
  // const) because loadSettings() resolves after mount; the year keeps its
  // digits unlocalized so countUp doesn't render "1 972".
  const renderedStats = $derived([
    STATS[0],
    { ...STATS[1], localize: false },
    { ...STATS[2], value: settings.publicRoomCount },
    STATS[3],
  ]);
</script>

<div class="page-accueil" data-testid="page-accueil">

  <!-- ── HERO ─────────────────────────────────────────────── -->
  <section
    class="page-accueil__hero"
    aria-labelledby="hero-heading"
    data-testid="hero-section"
  >
    <div class="page-accueil__hero-shader-wrap">
      <HeroShader />
    </div>

    <div class="page-accueil__hero-content">
      <p class="page-accueil__hero-eyebrow">Saint-Raymond · Portneuf · Québec</p>
      <h1 id="hero-heading" class="page-accueil__hero-heading">L'art de recevoir</h1>
      <p class="page-accueil__hero-sub">
        Une auberge de caractère pour les travailleurs de terrain — foresterie et secteur hydroélectrique.
      </p>
      <div class="page-accueil__hero-ctas" data-testid="hero-ctas">
        <div data-testid="hero-cta-reserver">
          <Button variant="action" href="/contact">Réserver</Button>
        </div>
        <div data-testid="hero-cta-lesite">
          <Button variant="secondary" href="/le-site">Le site</Button>
        </div>
      </div>
    </div>

    <div class="page-accueil__hero-scroll" aria-hidden="true">
      <span class="page-accueil__hero-scroll-label">Défiler</span>
      <div class="page-accueil__hero-scroll-line"></div>
    </div>
  </section>

  <!-- ── STATS STRIP ───────────────────────────────────────── -->
  <section
    class="page-accueil__stats"
    aria-label="Chiffres clés"
    data-testid="stats-section"
  >
    <div class="page-accueil__stats-inner">
      {#each renderedStats as stat, i (`${stat.label}-${stat.value}`)}
        <div
          class="page-accueil__stat"
          data-testid="stat-item"
          use:reveal={{ y: 12, delay: i * 0.08 }}
        >
          <div class="page-accueil__stat-value">
            <span class="sr-only">{`${stat.value}${stat.suffix}`}</span>
            <span
              class="page-accueil__stat-number"
              data-testid="stat-number"
              aria-hidden="true"
              use:countUp={{ to: stat.value, localize: stat.localize ?? true }}
            >{stat.value}</span>
            <span class="page-accueil__stat-suffix" aria-hidden="true">{stat.suffix}</span>
          </div>
          <span class="page-accueil__stat-label">{stat.label}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── DIVIDER 01 ────────────────────────────────────────── -->
  <div class="page-accueil__divider">
    <Contour number="01" width="full" />
  </div>

  <!-- ── FEATURED ROOMS ───────────────────────────────────── -->
  <section
    class="page-accueil__rooms"
    aria-labelledby="rooms-heading"
    data-testid="rooms-section"
  >
    <SectionLabel text="Nos chambres" showHairline={false} />
    <h2 id="rooms-heading" class="page-accueil__h2" use:reveal>
      Des espaces pensés pour vous
    </h2>

    <div class="page-accueil__price-display" aria-label="Prix par nuit">
      <span class="page-accueil__price-amount" data-testid="price-amount"
        ><span class="page-accueil__price-number"
          >${(auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice).toFixed(2)}</span
        ><span class="page-accueil__price-unit"> /nuit</span
      ></span>
      {#if auth.user?.effectiveNightlyPrice != null && auth.user.effectiveNightlyPrice !== settings.nightlyPrice}
        <span class="page-accueil__price-badge" data-testid="custom-pricing-badge">Tarif personnalisé</span>
      {/if}
    </div>

    <div class="page-accueil__rooms-grid" data-testid="rooms-grid">
      {#each featuredRooms as room, i}
        <div use:reveal={{ y: 20, delay: i * 0.1 }}>
          <RoomCard {room} />
        </div>
      {/each}
    </div>

    <div class="page-accueil__rooms-more" data-testid="rooms-more" use:reveal={{ y: 8 }}>
      <Button variant="secondary" href="/le-site#chambres">Voir toutes les chambres</Button>
    </div>
  </section>

  <!-- ── DIVIDER 02 ────────────────────────────────────────── -->
  <div class="page-accueil__divider">
    <Contour number="02" width="full" />
  </div>

  <!-- ── AMENITIES ────────────────────────────────────────── -->
  <section
    class="page-accueil__amenities"
    aria-labelledby="amenities-heading"
    data-testid="amenities-section"
  >
    <div class="page-accueil__amenities-inner">
      <div class="page-accueil__amenities-image" use:reveal={{ x: -20, duration: 0.7 }}>
        <ImagePanel
          imgKey="living-dining.jpg"
          picsumSeed={10}
          alt="Intérieur de l'Auberge du Vieux Pont"
          aspectRatio="4/3"
        />
      </div>

      <div class="page-accueil__amenities-text" use:reveal={{ x: 20, duration: 0.7 }}>
        <SectionLabel text="L'expérience" showHairline={false} />
        <h2 id="amenities-heading" class="page-accueil__h2">Fait pour ceux qui bougent</h2>

        <p class="page-accueil__amenities-body">
          L'Auberge du Vieux Pont a été conçue pour les travailleurs de terrain. Stockage sécurisé,
          recharge d'outils et de radios, salle de séchage — tout est là pour que vous déposiez
          vos affaires et repartiez reposés.
        </p>

        <ul class="page-accueil__amenities-list" role="list">
          {#each AMENITIES.slice(0, 4) as amenity}
            <li class="page-accueil__amenity-item" data-testid="amenity-item">
              <span class="page-accueil__amenity-code" aria-hidden="true">
                {amenity.code}
              </span>
              <span class="page-accueil__amenity-title">{amenity.title}</span>
            </li>
          {/each}
        </ul>

        <Button variant="primary" href="/le-site">Découvrir le site</Button>
      </div>
    </div>
  </section>

  <!-- ── DIVIDER 03 ────────────────────────────────────────── -->
  <div class="page-accueil__divider">
    <Contour number="03" width="full" />
  </div>

  <!-- ── CLOSING CTA ──────────────────────────────────────── -->
  <section
    class="page-accueil__cta"
    aria-labelledby="cta-heading"
    data-testid="cta-section"
  >
    <div class="page-accueil__cta-inner" use:reveal={{ y: 16 }}>
      <SectionLabel text="Réservation" showHairline={false} />
      <h2 id="cta-heading" class="page-accueil__cta-heading">Planifiez votre séjour</h2>
      <p class="page-accueil__cta-body">
        Groupes, équipes, travailleurs de quart — on a la chambre qu'il vous faut.
        Réservez directement par formulaire, sans intermédiaire.
      </p>
      <div data-testid="cta-reserver">
        <Button variant="action" href="/contact">Réserver maintenant</Button>
      </div>
    </div>
  </section>

</div>

<style>
  /* ═══════════════════════════════════════════════════
     HERO SECTION
  ═══════════════════════════════════════════════════ */
  .page-accueil__hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: var(--color-surface);
    overflow: hidden;
  }

  .page-accueil__hero-shader-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .page-accueil__hero-content {
    position: relative;
    max-width: 860px;
    text-align: center;
    padding: var(--space-3xl) var(--space-md);
    z-index: 1;
  }

  .page-accueil__hero-eyebrow {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin: 0;
  }

  .page-accueil__hero-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(48px, 8vw, 80px);
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: var(--space-lg) 0 0;
  }

  .page-accueil__hero-sub {
    font-family: var(--font-sans);
    font-size: clamp(18px, 2.5vw, 24px);
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-ink-variant);
    margin: var(--space-md) 0 0;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
  }

  .page-accueil__hero-ctas {
    display: flex;
    gap: var(--space-lg);
    justify-content: center;
    margin-top: var(--space-2xl);
  }

  .page-accueil__hero-scroll {
    position: absolute;
    bottom: var(--space-2xl);
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
  }

  .page-accueil__hero-scroll-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
    margin-bottom: var(--space-md);
  }

  .page-accueil__hero-scroll-line {
    width: 1px;
    height: 24px;
    background-color: var(--color-ink-variant);
    margin-inline: auto;
    animation: pulse-scroll 1.4s ease-in-out infinite;
  }

  @keyframes pulse-scroll {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* ═══════════════════════════════════════════════════
     STATS STRIP
  ═══════════════════════════════════════════════════ */
  .page-accueil__stats {
    background-color: var(--color-surface);
    border-top: 1px solid var(--color-outline-variant);
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .page-accueil__stats-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding: var(--space-lg) var(--space-md);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
  }

  .page-accueil__stat {
    padding: var(--space-lg) var(--space-md);
    border-right: 1px solid var(--color-outline-variant);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: center;
  }

  .page-accueil__stat:last-child {
    border-right: none;
  }

  .page-accueil__stat-value {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-xs);
  }

  .page-accueil__stat-number {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(32px, 4vw, 48px);
    line-height: 1;
    color: var(--color-ink);
  }

  .page-accueil__stat-suffix {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink-variant);
  }

  .page-accueil__stat-label {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    color: var(--color-ink-variant);
    text-align: center;
  }

  /* ═══════════════════════════════════════════════════
     DIVIDERS
  ═══════════════════════════════════════════════════ */
  .page-accueil__divider {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-md);
    width: 100%;
    box-sizing: border-box;
  }

  /* ═══════════════════════════════════════════════════
     SHARED SECTION HEADING
  ═══════════════════════════════════════════════════ */
  .page-accueil__h2 {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.1;
    letter-spacing: -0.015em;
    color: var(--color-ink);
    margin: var(--space-md) 0 0;
  }

  /* ═══════════════════════════════════════════════════
     ROOMS
  ═══════════════════════════════════════════════════ */
  .page-accueil__rooms {
    max-width: 1280px;
    margin-inline: auto;
    padding: 0 var(--space-md) var(--space-3xl);
  }

  /* ── Price display ───────────────────────────────────────────────────── */
  .page-accueil__price-display {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm, 0.75rem);
    margin-top: var(--space-md, 1.25rem);
  }

  .page-accueil__price-amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    line-height: 1.2;
  }

  .page-accueil__price-number {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-tertiary, #9d4300);
    letter-spacing: 0;
  }

  .page-accueil__price-unit {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-ink-muted, #76777d);
    letter-spacing: 0;
  }

  .page-accueil__price-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background-color: var(--color-ember-pale, #ffdbca);
    color: var(--color-tertiary, #9d4300);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: 2px;
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  /* Narrow-viewport guard: flex-wrap already handles wrapping; clamp
     the number so it never pushes past the viewport edge at 320px. */
  @media (max-width: 360px) {
    .page-accueil__price-number {
      font-size: 18px;
    }
  }

  .page-accueil__rooms-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg);
    margin-top: var(--space-2xl);
  }

  .page-accueil__rooms-more {
    margin-top: var(--space-2xl);
    display: flex;
    justify-content: center;
  }

  /* ═══════════════════════════════════════════════════
     AMENITIES
  ═══════════════════════════════════════════════════ */
  .page-accueil__amenities {
    max-width: 1280px;
    margin-inline: auto;
    padding: 0 var(--space-md) var(--space-3xl);
  }

  .page-accueil__amenities-inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3xl);
    align-items: center;
  }

  .page-accueil__amenities-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-accueil__amenities-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-variant);
  }

  .page-accueil__amenities-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--color-outline-variant);
  }

  .page-accueil__amenity-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-outline-variant);
    min-height: 44px;
  }

  .page-accueil__amenity-code {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-secondary);
    min-width: 44px;
    flex-shrink: 0;
  }

  .page-accueil__amenity-title {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-ink);
  }

  /* ═══════════════════════════════════════════════════
     CLOSING CTA PANEL
  ═══════════════════════════════════════════════════ */
  .page-accueil__cta {
    background: var(--color-inverse-surface);
    padding: var(--space-3xl) var(--space-md);
  }

  .page-accueil__cta-inner {
    max-width: 720px;
    margin-inline: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
  }

  .page-accueil__cta :global(.section-label__text) {
    color: var(--color-inverse-on-surface);
    opacity: 0.5;
  }

  .page-accueil__cta-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.1;
    letter-spacing: -0.015em;
    color: var(--color-inverse-on-surface);
    margin: 0;
  }

  .page-accueil__cta-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-inverse-on-surface);
    opacity: 0.75;
    margin: 0;
  }

  /* ═══════════════════════════════════════════════════
     RESPONSIVE
  ═══════════════════════════════════════════════════ */
  @media (max-width: 1024px) {
    .page-accueil__rooms-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .page-accueil__amenities-inner {
      grid-template-columns: 1fr;
      gap: var(--space-2xl);
    }

    .page-accueil__amenities-image {
      order: -1;
    }
  }

  @media (max-width: 680px) {
    .page-accueil__stats-inner {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-lg);
    }

    .page-accueil__stat {
      border-right: none;
      border-bottom: 1px solid var(--color-outline-variant);
      padding-block: var(--space-lg);
      padding-inline: var(--space-md);
    }

    .page-accueil__stat:last-child {
      border-bottom: none;
    }

    .page-accueil__stat:nth-child(2n) {
      border-right: none;
    }

    .page-accueil__rooms-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 400px) {
    .page-accueil__hero-ctas {
      flex-direction: column;
      align-items: stretch;
    }

    .page-accueil__stats-inner {
      grid-template-columns: 1fr;
    }
  }
</style>

<svelte:head>
  <title>Auberge du Vieux Pont — hébergement pour travailleurs de terrain</title>
</svelte:head>
