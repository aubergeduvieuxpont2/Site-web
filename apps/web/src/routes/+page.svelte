<script lang="ts">
  import HeroShader from '$lib/components/HeroShader.svelte';
  import RoomCard from '$lib/components/RoomCard.svelte';
  import ImagePanel from '$lib/components/ImagePanel.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Contour from '$lib/components/Contour.svelte';
  import Button from '$lib/components/Button.svelte';
  import { ROOMS, AMENITIES, STATS } from '$lib/content';
  import { reveal, countUp } from '$lib/motion';

  const featuredRooms = ROOMS.slice(0, 3);
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
        Une auberge de caractère pour travailleurs de terrain et aventuriers du plein air.
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
      {#each STATS as stat, i}
        <div
          class="page-accueil__stat"
          data-testid="stat-item"
          use:reveal={{ y: 12, delay: i * 0.08 }}
        >
          <div
            class="page-accueil__stat-value"
            aria-label="{stat.value}{stat.suffix}"
          >
            <span
              class="page-accueil__stat-number"
              data-testid="stat-number"
              aria-hidden="true"
              use:countUp={{ to: stat.value }}
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
          imgKey="le-site-1.jpg"
          picsumSeed={10}
          alt="Intérieur de l'Auberge du Vieux Pont"
          aspectRatio="4/3"
        />
      </div>

      <div class="page-accueil__amenities-text" use:reveal={{ x: 20, duration: 0.7 }}>
        <SectionLabel text="L'expérience" showHairline={false} />
        <h2 id="amenities-heading" class="page-accueil__h2">Fait pour ceux qui bougent</h2>

        <p class="page-accueil__amenities-body">
          L'Auberge du Vieux Pont a été conçue pour les travailleurs de terrain et les
          aventuriers du plein air. Stockage sécurisé, recharge e-bike, station de lavage
          — tout est là pour que vous déposiez les outils et récupériez pour demain.
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
        Groupes, travailleurs, cyclistes — on a la chambre qu'il vous faut.
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
     HERO
  ═══════════════════════════════════════════════════ */
  .page-accueil__hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--color-surface);
  }

  .page-accueil__hero-shader-wrap {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .page-accueil__hero-shader-wrap :global(.hero-shader),
  .page-accueil__hero-shader-wrap :global(.hero-shader__canvas),
  .page-accueil__hero-shader-wrap :global(.hero-shader__fallback) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .page-accueil__hero-content {
    position: relative;
    z-index: 1;
    text-align: center;
    max-width: 900px;
    padding: var(--space-xl) var(--space-md);
  }

  .page-accueil__hero-eyebrow {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin: 0 0 var(--space-xl);
  }

  .page-accueil__hero-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(52px, 8.5vw, 96px);
    line-height: 1.04;
    letter-spacing: -0.025em;
    color: var(--color-ink);
    margin: 0 0 var(--space-lg);
  }

  .page-accueil__hero-sub {
    font-family: var(--font-sans);
    font-weight: 400;
    font-size: 18px;
    line-height: 1.6;
    color: var(--color-ink-variant);
    max-width: 500px;
    margin: 0 auto var(--space-xl);
  }

  .page-accueil__hero-ctas {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    justify-content: center;
  }

  .page-accueil__hero-scroll {
    position: absolute;
    bottom: var(--space-xl);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-xs);
  }

  .page-accueil__hero-scroll-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    opacity: 0.7;
  }

  .page-accueil__hero-scroll-line {
    width: 1px;
    height: 44px;
    background: var(--color-outline-variant);
    animation: scrollDrop 2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
    transform-origin: top center;
  }

  @keyframes scrollDrop {
    0%   { opacity: 0; transform: scaleY(0); }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { opacity: 0; transform: scaleY(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-accueil__hero-scroll-line {
      animation: none;
      opacity: 0.4;
      transform: none;
    }
  }

  /* ═══════════════════════════════════════════════════
     STATS STRIP
  ═══════════════════════════════════════════════════ */
  .page-accueil__stats {
    background: var(--color-surface-container-low);
    border-block: 1px solid var(--color-outline-variant);
    padding: var(--space-3xl) var(--space-md);
  }

  .page-accueil__stats-inner {
    max-width: 1100px;
    margin-inline: auto;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-xl);
  }

  .page-accueil__stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    text-align: center;
    border-right: 1px solid var(--color-outline-variant);
    padding-inline: var(--space-lg);
  }

  .page-accueil__stat:last-child {
    border-right: none;
  }

  .page-accueil__stat-value {
    display: flex;
    align-items: baseline;
    gap: 2px;
  }

  .page-accueil__stat-number {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(40px, 5vw, 60px);
    line-height: 1;
    letter-spacing: -0.025em;
    color: var(--color-ink);
    font-variant-numeric: tabular-nums;
  }

  .page-accueil__stat-suffix {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(22px, 3vw, 34px);
    line-height: 1;
    color: var(--color-ink);
  }

  .page-accueil__stat-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
  }

  /* ═══════════════════════════════════════════════════
     CONTOUR DIVIDERS
  ═══════════════════════════════════════════════════ */
  .page-accueil__divider {
    padding-inline: var(--space-md);
    padding-block: var(--space-xl);
    max-width: 1280px;
    margin-inline: auto;
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
