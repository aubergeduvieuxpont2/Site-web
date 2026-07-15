<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import RoomCard from '$lib/components/RoomCard.svelte';
  import ImagePanel from '$lib/components/ImagePanel.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';
  import Contour from '$lib/components/Contour.svelte';
  import Button from '$lib/components/Button.svelte';
  import { reveal, revealStagger } from '$lib/motion';
  import { ROOMS, ATTRACTIONS } from '$lib/content';

  const NAV_SECTIONS = [
    { id: 'chambres', label: 'Chambres' },
    { id: 'attraits', label: 'Attraits' },
    { id: 'lieu', label: 'Le lieu' },
  ] as const;

  let activeSection = $state<string>('chambres');
  let sectionObserver: IntersectionObserver | undefined;

  onMount(() => {
    const sections = NAV_SECTIONS
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          activeSection = visible[0].target.id;
        }
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: 0 }
    );

    sections.forEach(el => sectionObserver!.observe(el));
  });

  onDestroy(() => {
    sectionObserver?.disconnect();
  });

  function scrollToSection(e: MouseEvent, id: string) {
    e.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    const TOP_OFFSET = 64 + 44;
    const y = target.getBoundingClientRect().top + window.scrollY - TOP_OFFSET;
    window.scrollTo({ top: y, behavior: 'smooth' });
    history.pushState(null, '', `#${id}`);
  }
</script>

<div class="page-le-site" data-testid="page-le-site">

  <!-- Sticky in-page nav -->
  <nav
    class="page-le-site__inpage-nav"
    aria-label="Sur cette page"
    data-testid="inpage-nav"
  >
    <div class="page-le-site__inpage-inner">
      {#each NAV_SECTIONS as section}
        <a
          class="page-le-site__inpage-link"
          href="#{section.id}"
          aria-current={activeSection === section.id ? 'true' : undefined}
          onclick={(e) => scrollToSection(e, section.id)}
          data-testid="inpage-link-{section.id}"
        >
          {section.label}
        </a>
      {/each}
    </div>
  </nav>

  <!-- ── CHAMBRES ────────────────────────────────────── -->
  <section id="chambres" class="page-le-site__section" data-testid="section-chambres">
    <div class="page-le-site__section-inner">
      <Contour number="01" width="contained" />
      <SectionLabel text="Hébergement" />
      <h2 class="page-le-site__heading" use:reveal={{ y: 20, delay: 0.05 }}>
        Nos chambres
      </h2>
      <p class="page-le-site__intro" use:reveal={{ y: 16, delay: 0.1 }}>
        Chaque chambre est calibrée pour ceux qui arrivent couverts de boue et repartent reposés.
        Les chambres sont assignées à votre arrivée selon les besoins de votre équipe.
      </p>
      <div class="page-le-site__rooms-grid" data-testid="rooms-grid" use:revealStagger={{ y: 24, each: 0.07 }}>
        {#each ROOMS as room}
          <RoomCard {room} />
        {/each}
      </div>
    </div>
  </section>

  <div class="page-le-site__divider">
    <Contour width="full" />
  </div>

  <!-- ── ATTRAITS ─────────────────────────────────────── -->
  <section id="attraits" class="page-le-site__section" data-testid="section-attraits">
    <div class="page-le-site__section-inner">
      <Contour number="02" width="contained" />
      <SectionLabel text="Attraits" />
      <h2 class="page-le-site__heading" use:reveal={{ y: 20, delay: 0.05 }}>
        Aux alentours
      </h2>
      <div class="page-le-site__attraits-grid" data-testid="attraits-grid" use:revealStagger={{ y: 20, each: 0.06 }}>
        {#each ATTRACTIONS as attr}
          <article class="page-le-site__attrait" data-testid="attrait-card">
            <div class="page-le-site__attrait-meta">
              <span class="page-le-site__attrait-code" aria-hidden="true">{attr.code}</span>
              <span class="page-le-site__attrait-dist">{attr.distance}</span>
              <span class="page-le-site__attrait-grade">{attr.grade}</span>
            </div>
            <h3 class="page-le-site__attrait-name">{attr.name}</h3>
            <span class="page-le-site__attrait-cat">{attr.category}</span>
            <p class="page-le-site__attrait-text">{attr.text}</p>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <div class="page-le-site__divider">
    <Contour width="full" />
  </div>

  <!-- ── LE LIEU ──────────────────────────────────────── -->
  <section id="lieu" class="page-le-site__section page-le-site__section--lieu" data-testid="section-lieu">
    <div class="page-le-site__section-inner">
      <Contour number="03" width="contained" />
      <SectionLabel text="Le lieu" />
      <div class="page-le-site__lieu-editorial">
        <div class="page-le-site__lieu-text" use:reveal={{ y: 20, delay: 0.05 }}>
          <h2 class="page-le-site__heading">
            Un vieux pont sur la Sainte-Anne
          </h2>
          <p class="page-le-site__body">
            Depuis 1972, l'Auberge du Vieux Pont domine la rivière Sainte-Anne au cœur de
            Saint-Raymond. Pierre, bois, fer forgé — les matériaux parlent d'eux-mêmes.
            À proximité des principaux chantiers forestiers et des lignes du réseau hydroélectrique de Portneuf.
          </p>
          <p class="page-le-site__body">
            Un endroit calibré pour ceux qui partent tôt et rentrent tard, avec du béton qu'on
            lave à grande eau et un déjeuner prêt avant le lever du soleil.
          </p>
          <Button variant="secondary" href="/contact">Nous contacter</Button>
        </div>
        <div class="page-le-site__lieu-image" use:reveal={{ y: 16, delay: 0.12 }}>
          <ImagePanel
            imgKey="auberge-exterior.jpg"
            picsumSeed={33}
            alt="Vue extérieure de l'Auberge du Vieux Pont sur la rivière Sainte-Anne"
            aspectRatio="3/2"
          />
        </div>
      </div>
    </div>
    <div class="page-le-site__grounds-strip" aria-hidden="true">
      <ImagePanel
        imgKey="village-river.jpg"
        picsumSeed={55}
        alt=""
        aspectRatio="16/5"
        caption="Le pont et la Sainte-Anne · Saint-Raymond, Portneuf"
      />
    </div>
  </section>

  <!-- ── CTA ─────────────────────────────────────────── -->
  <div class="page-le-site__cta-strip" data-testid="cta-strip">
    <div class="page-le-site__cta-inner">
      <SectionLabel text="Réservation" />
      <h2 class="page-le-site__cta-heading" use:reveal={{ y: 16 }}>
        Prêt à réserver?
      </h2>
      <p class="page-le-site__cta-body" use:reveal={{ y: 12, delay: 0.06 }}>
        Envoyez-nous votre demande — nous confirmons sous 24 h et adaptons l'hébergement
        à la taille de votre équipe.
      </p>
      <Button variant="action" href="/contact">Réserver maintenant</Button>
    </div>
  </div>

</div>

<style>
  /* ── Page shell ──────────────────────────────────────────────────────── */
  .page-le-site {
    background-color: var(--color-surface);
    padding-top: 64px;
  }

  /* ── Sticky in-page nav ──────────────────────────────────────────────── */
  .page-le-site__inpage-nav {
    position: sticky;
    top: 64px;
    z-index: 30;
    background-color: var(--color-surface);
    border-bottom: 1px solid var(--color-outline-variant);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  .page-le-site__inpage-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-xl);
    display: flex;
    gap: var(--space-xl);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .page-le-site__inpage-inner::-webkit-scrollbar { display: none; }

  .page-le-site__inpage-link {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--color-ink-variant);
    padding-block: var(--space-md);
    white-space: nowrap;
    flex-shrink: 0;
    position: relative;
    transition: color 200ms ease;
    min-height: 44px;
    display: flex;
    align-items: center;
  }

  .page-le-site__inpage-link::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--color-ink);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 240ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .page-le-site__inpage-link:hover {
    color: var(--color-ink);
  }

  .page-le-site__inpage-link[aria-current="true"] {
    color: var(--color-ink);
  }
  .page-le-site__inpage-link[aria-current="true"]::after {
    transform: scaleX(1);
  }

  .page-le-site__inpage-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-le-site__inpage-link::after { transition: none; }
    .page-le-site__inpage-link { transition: none; }
  }

  @media (max-width: 640px) {
    .page-le-site__inpage-inner {
      padding-inline: var(--space-md);
      gap: var(--space-lg);
    }
  }

  /* ── Shared section layout ───────────────────────────────────────────── */
  .page-le-site__section {
    padding-block: var(--space-3xl);
  }

  .page-le-site__section-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-le-site__heading {
    font-family: var(--font-sans);
    font-size: clamp(32px, 5vw, 48px);
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }

  .page-le-site__intro,
  .page-le-site__body {
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
    max-width: 68ch;
  }

  /* ── Divider between top-level sections ─────────────────────────────── */
  .page-le-site__divider {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-xl);
  }

  /* ── Rooms grid ──────────────────────────────────────────────────────── */
  .page-le-site__rooms-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg);
  }

  @media (max-width: 1024px) {
    .page-le-site__rooms-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 600px) {
    .page-le-site__rooms-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ── Attractions grid ────────────────────────────────────────────────── */
  .page-le-site__attraits-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
  }

  @media (max-width: 1024px) {
    .page-le-site__attraits-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 600px) {
    .page-le-site__attraits-grid {
      grid-template-columns: 1fr;
    }
  }

  .page-le-site__attrait {
    padding: var(--space-lg);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }

  .page-le-site__attrait:hover {
    border-color: var(--color-outline);
    box-shadow: 0 4px 16px rgba(25, 28, 30, 0.06);
  }

  @media (prefers-reduced-motion: reduce) {
    .page-le-site__attrait { transition: none; }
    .page-le-site__attrait:hover { box-shadow: none; }
  }

  .page-le-site__attrait-meta {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .page-le-site__attrait-code,
  .page-le-site__attrait-dist,
  .page-le-site__attrait-grade {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant);
  }

  .page-le-site__attrait-dist {
    color: var(--color-secondary);
  }

  .page-le-site__attrait-name {
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 400;
    line-height: 1.3;
    color: var(--color-ink);
    margin: 0;
  }

  .page-le-site__attrait-cat {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    color: var(--color-ink-variant);
  }

  .page-le-site__attrait-text {
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
    flex: 1;
  }

  /* ── Le lieu editorial ───────────────────────────────────────────────── */
  .page-le-site__section--lieu .page-le-site__section-inner {
    gap: var(--space-xl);
  }

  .page-le-site__lieu-editorial {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2xl);
    align-items: start;
  }

  .page-le-site__lieu-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  @media (max-width: 768px) {
    .page-le-site__lieu-editorial {
      grid-template-columns: 1fr;
      gap: var(--space-xl);
    }
  }

  /* ── Full-bleed grounds strip ────────────────────────────────────────── */
  .page-le-site__grounds-strip {
    width: 100%;
    overflow: hidden;
    margin-top: var(--space-xl);
  }

  /* ── CTA strip ───────────────────────────────────────────────────────── */
  .page-le-site__cta-strip {
    background-color: var(--color-surface-container-low);
    border-top: 1px solid var(--color-outline-variant);
    padding-block: var(--space-3xl);
  }

  .page-le-site__cta-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    align-items: flex-start;
  }

  .page-le-site__cta-heading {
    font-family: var(--font-sans);
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }

  .page-le-site__cta-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
    max-width: 56ch;
  }

  @media (max-width: 640px) {
    .page-le-site__section {
      padding-block: var(--space-2xl);
    }
    .page-le-site__section-inner,
    .page-le-site__divider,
    .page-le-site__cta-inner {
      padding-inline: var(--space-md);
    }
    .page-le-site__cta-strip {
      padding-block: var(--space-2xl);
    }
  }
</style>
