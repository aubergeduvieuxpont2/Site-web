<script lang="ts">
  import { reveal, revealStagger } from '$lib/motion';
  import { SITE, phoneToHref } from '$lib/content';
  import { settings } from '$lib/settings.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { breadcrumbSchema } from '$lib/seo';
  import Contour from '$lib/components/Contour.svelte';
  import ImagePanel from '$lib/components/ImagePanel.svelte';
  import SectionLabel from '$lib/components/SectionLabel.svelte';

  const values = [
    { code: '01', title: 'Honnête', text: "On dit les choses comme elles sont. Pas de promesses gonflées, pas de frais cachés. Le prix affiché, c'est le prix payé." },
    { code: '02', title: 'Robuste', text: "Bâti pour durer. Planchers de béton, casiers d'acier, murs qui encaissent les bottes pleines de boue sans broncher." },
    { code: '03', title: 'Accessible', text: "Un tarif unique pour tous. Confort et repos pour chaque travailleur, peu importe le budget. Le repos n'est pas un luxe réservé." },
    { code: '04', title: 'Ancré', text: "Saint-Raymond, c'est chez nous depuis 1972. On connaît la rivière, les chantiers et le monde qui y travaille." },
  ];

  // Configured contact phone with graceful fallback to the static default.
  const phoneDisplay = $derived(settings.contactPhone || SITE.phone);
  const phoneHref = $derived(phoneToHref(settings.contactPhone));
</script>

<div class="page-a-propos" data-testid="page-a-propos">

  <!-- ── INTRO ── -->
  <section
    class="page-a-propos__intro"
    data-testid="a-propos-intro"
    aria-labelledby="a-propos-heading"
  >
    <div class="page-a-propos__inner">
      <SectionLabel text="À propos · Est. {SITE.established}" showHairline={false} />
      <h1
        id="a-propos-heading"
        class="page-a-propos__display"
        use:reveal={{ y: 20, delay: 0.05 }}
        data-testid="a-propos-heading"
      >
        Bâti pour ceux qui ne reculent devant rien.
      </h1>
      <p
        class="page-a-propos__lead"
        use:reveal={{ y: 16, delay: 0.12 }}
        data-testid="a-propos-lead"
      >
        Depuis un demi-siècle, l'Auberge du Vieux Pont loge les travailleurs, les pêcheurs
        et les équipes de terrain d'aujourd'hui. Même promesse&nbsp;: un repos honnête, sans flafla.
      </p>
    </div>
  </section>

  <div class="page-a-propos__contour-wrap">
    <Contour number="01" width="contained" />
  </div>

  <!-- ── HISTOIRE ── -->
  <section
    class="page-a-propos__histoire"
    data-testid="a-propos-histoire"
    aria-labelledby="a-propos-histoire-heading"
  >
    <div class="page-a-propos__inner">
      <div class="page-a-propos__histoire-grid">

        <!-- Text column — left on desktop, top on mobile -->
        <div class="page-a-propos__histoire-text">
          <SectionLabel text="D'où l'on vient" />
          <h2
            id="a-propos-histoire-heading"
            class="page-a-propos__section-heading"
            use:reveal={{ y: 20, delay: 0.05 }}
            data-testid="a-propos-histoire-heading"
          >
            Une maison plantée au bord de la rivière.
          </h2>
          <div class="page-a-propos__body-stack">
            <p use:reveal={{ y: 18, delay: 0.10 }}>
              Tout commence près du vieux pont Tessier, là où la rivière Sainte-Anne taille
              son chemin dans la roche de Portneuf. En {SITE.established}, la bâtisse ouvre
              ses portes pour loger ceux qui travaillaient fort&nbsp;: bûcherons, gens de
              chantier, pêcheurs venus tester l'eau froide au petit matin.
            </p>
            <p use:reveal={{ y: 18, delay: 0.15 }}>
              On n'a jamais cherché à impressionner. On a cherché à dépanner. Un lit propre,
              un repas chaud, un toit solide quand la journée finissait tard et que la
              suivante commençait tôt. C'est devenu notre réputation — et on ne l'a pas lâchée
              depuis.
            </p>
            <p use:reveal={{ y: 18, delay: 0.20 }}>
              Avec les années, le monde a changé de bottes. La foresterie s'est mécanisée et
              les chantiers du secteur hydroélectrique se sont développés partout en Portneuf. On a ajouté un séchage
              pour vêtements de travail, des bornes de recharge pour outils et radios, un local
              sécurisé renforcé. Mais l'esprit, lui, n'a pas bougé d'un pouce.
            </p>
          </div>
          <figure
            class="page-a-propos__quote"
            use:reveal={{ y: 22, delay: 0.26 }}
            data-testid="a-propos-quote"
          >
            <blockquote class="page-a-propos__blockquote">
              « On ne vend pas du luxe. On vend du repos qui tient la route. »
            </blockquote>
            <figcaption class="page-a-propos__quote-caption">
              La maison · depuis {SITE.established}
            </figcaption>
          </figure>
        </div>

        <!-- Image column — right on desktop, bottom on mobile -->
        <div
          class="page-a-propos__histoire-media"
          use:reveal={{ y: 0, x: 24, delay: 0.08 }}
        >
          <ImagePanel
            imgKey="bridge.jpg"
            picsumSeed={88}
            aspectRatio="4/5"
            caption="Le Pont Tessier, Saint-Raymond"
            alt="Le vieux pont Tessier sur la rivière Sainte-Anne en automne"
          />
        </div>

      </div>
    </div>
  </section>

  <div class="page-a-propos__contour-wrap">
    <Contour number="02" width="contained" />
  </div>

  <!-- ── VALEURS ── -->
  <section
    class="page-a-propos__valeurs"
    data-testid="a-propos-valeurs"
    aria-labelledby="a-propos-valeurs-heading"
  >
    <div class="page-a-propos__inner">
      <div class="page-a-propos__valeurs-header">
        <SectionLabel text="Nos principes" />
        <h2
          id="a-propos-valeurs-heading"
          class="page-a-propos__section-heading"
          use:reveal={{ y: 20, delay: 0.05 }}
          data-testid="a-propos-valeurs-heading"
        >
          Quatre principes qui ne se négocient pas.
        </h2>
      </div>
      <div
        class="page-a-propos__valeurs-grid"
        use:revealStagger={{ each: 0.08, y: 22 }}
        data-testid="a-propos-valeurs-grid"
      >
        {#each values as value (value.code)}
          <article
            class="page-a-propos__value-card"
            data-testid="a-propos-value-card-{value.code}"
          >
            <div class="page-a-propos__value-card-top" aria-hidden="true">
              <span class="page-a-propos__value-dot"></span>
              <span class="page-a-propos__value-code">{value.code}</span>
            </div>
            <h3 class="page-a-propos__value-title">{value.title}</h3>
            <p class="page-a-propos__value-text">{value.text}</p>
          </article>
        {/each}
      </div>
    </div>
  </section>

  <div class="page-a-propos__contour-wrap">
    <Contour number="03" width="contained" />
  </div>

  <!-- ── ANCRAGE (alternating: image left, text right) ── -->
  <section
    class="page-a-propos__ancrage"
    data-testid="a-propos-ancrage"
    aria-labelledby="a-propos-ancrage-heading"
  >
    <div class="page-a-propos__inner">
      <div class="page-a-propos__ancrage-grid">

        <!-- Image column — left on desktop, top on mobile -->
        <div
          class="page-a-propos__ancrage-media"
          use:reveal={{ y: 0, x: -24, delay: 0.08 }}
        >
          <ImagePanel
            imgKey="village-river.jpg"
            picsumSeed={33}
            aspectRatio="3/2"
            caption="Saint-Raymond · Portneuf"
            alt="Le village de Saint-Raymond le long de la rivière Sainte-Anne"
          />
        </div>

        <!-- Text column — right on desktop, bottom on mobile -->
        <div class="page-a-propos__ancrage-text">
          <SectionLabel text="Ce qu'on défend" />
          <h2
            id="a-propos-ancrage-heading"
            class="page-a-propos__section-heading"
            use:reveal={{ y: 20, delay: 0.05 }}
            data-testid="a-propos-ancrage-heading"
          >
            Ancrés à Saint-Raymond, les pieds dans la rivière.
          </h2>
          <div class="page-a-propos__body-stack">
            <p use:reveal={{ y: 18, delay: 0.10 }}>
              On n'est pas une chaîne. On est une auberge de Portneuf, tenue par du monde
              d'ici, à deux pas des chantiers forestiers et des lignes du réseau hydroélectrique. La rivière
              Sainte-Anne coule sous nos fenêtres&nbsp;; les principaux sites de travail sont
              à moins de 30 minutes.
            </p>
            <p use:reveal={{ y: 18, delay: 0.15 }}>
              Ça veut dire des conseils qui valent quelque chose, des horaires qui collent à
              la vraie vie, et l'assurance qu'on comprend ce que c'est qu'une longue
              journée de chantier — réelle et épuisante.
            </p>
          </div>
          <div
            class="page-a-propos__tags"
            use:reveal={{ y: 16, delay: 0.20 }}
            data-testid="a-propos-tags"
          >
            {#each ['Saint-Raymond', 'Portneuf', 'Vue rivière', 'Foresterie'] as tag (tag)}
              <span class="page-a-propos__tag">{tag}</span>
            {/each}
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ── CTA (dark inverse surface) ── -->
  <section
    class="page-a-propos__cta"
    data-testid="a-propos-cta"
    aria-label="Nous contacter"
  >
    <div class="page-a-propos__inner page-a-propos__cta-layout">
      <div use:reveal={{ y: 22 }} class="page-a-propos__cta-copy">
        <!-- Raw span instead of SectionLabel to avoid :global overrides on dark bg -->
        <span class="page-a-propos__cta-eyebrow" aria-hidden="true">Visite</span>
        <h2
          class="page-a-propos__cta-heading"
          data-testid="a-propos-cta-heading"
        >
          Venez voir par vous-même.
        </h2>
        <p class="page-a-propos__cta-lead">
          Le mieux pour comprendre ce qu'on est, c'est de pousser la porte.
          Appelez-nous ou écrivez-nous — on vous attend au bord du pont.
        </p>
      </div>
      <div
        use:reveal={{ y: 20, delay: 0.10 }}
        class="page-a-propos__cta-actions"
      >
        <a
          href={phoneHref}
          class="page-a-propos__cta-phone"
          data-testid="a-propos-cta-phone"
          aria-label="Appeler le {phoneDisplay}"
        >
          {phoneDisplay}
        </a>
        <a
          href="/contact"
          class="page-a-propos__cta-link"
          data-testid="a-propos-cta-contact"
        >
          Nous joindre
        </a>
      </div>
    </div>
  </section>

</div>

<style>
  /* ── Root ── */
  .page-a-propos {
    background-color: var(--color-surface);
  }

  /* ── Shared inner container ── */
  .page-a-propos__inner {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-xl); /* 40px */
  }

  @media (max-width: 767px) {
    .page-a-propos__inner {
      padding-inline: var(--space-md); /* 16px */
    }
  }

  /* ── Contour divider wrapper ── */
  .page-a-propos__contour-wrap {
    max-width: calc(1280px + 2 * var(--space-xl));
    margin-inline: auto;
    padding-inline: var(--space-xl);
  }

  @media (max-width: 767px) {
    .page-a-propos__contour-wrap {
      padding-inline: var(--space-md);
    }
  }

  /* ─────────────── INTRO ─────────────── */
  .page-a-propos__intro {
    padding-top: calc(var(--space-4xl) + var(--space-xl)); /* ~168px; clears fixed nav */
    padding-bottom: var(--space-3xl);
  }

  @media (max-width: 767px) {
    .page-a-propos__intro {
      padding-top: var(--space-4xl); /* 128px */
      padding-bottom: var(--space-2xl);
    }
  }

  .page-a-propos__display {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(2.5rem, 5vw, 5rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    max-width: 820px;
    margin: var(--space-lg) 0 0;
  }

  .page-a-propos__lead {
    font-family: var(--font-sans);
    font-size: 1.125rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    max-width: 600px;
    margin: var(--space-lg) 0 0;
  }

  /* ─────────────── SECTION HEADING (shared) ─────────────── */
  .page-a-propos__section-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(1.75rem, 3vw, 3rem);
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: var(--space-lg) 0 0;
    max-width: 520px;
  }

  /* ─────────────── BODY PARAGRAPHS (shared) ─────────────── */
  .page-a-propos__body-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
    max-width: 560px;
  }

  .page-a-propos__body-stack p {
    font-family: var(--font-sans);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
  }

  /* ─────────────── HISTOIRE ─────────────── */
  .page-a-propos__histoire {
    padding-block: var(--space-3xl);
  }

  .page-a-propos__histoire-grid {
    display: grid;
    grid-template-columns: 7fr 5fr;
    gap: var(--space-2xl);
    align-items: start;
  }

  @media (max-width: 1023px) {
    .page-a-propos__histoire-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Blockquote pull-quote */
  .page-a-propos__quote {
    margin: var(--space-xl) 0 0;
  }

  .page-a-propos__blockquote {
    font-family: var(--font-sans);
    font-size: 1.25rem;
    font-weight: 300;
    font-style: italic;
    line-height: 1.4;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    border-left: 2px solid var(--color-secondary-container); /* #fd761a orange fill accent */
    padding-left: var(--space-lg);
    margin: 0;
  }

  .page-a-propos__quote-caption {
    display: block;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin-top: var(--space-md);
    padding-left: var(--space-lg);
  }

  /* ─────────────── VALEURS ─────────────── */
  .page-a-propos__valeurs {
    background-color: var(--color-surface-container-low); /* #f2f4f6 */
    border-top: 1px solid var(--color-outline-variant);
    border-bottom: 1px solid var(--color-outline-variant);
    padding-block: var(--space-3xl);
  }

  .page-a-propos__valeurs-header {
    max-width: 620px;
    margin-bottom: var(--space-2xl);
  }

  .page-a-propos__valeurs-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-lg);
  }

  @media (max-width: 1023px) {
    .page-a-propos__valeurs-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 599px) {
    .page-a-propos__valeurs-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Value card */
  .page-a-propos__value-card {
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-container-lowest); /* #ffffff */
    border: 1px solid var(--color-outline-variant);
    padding: var(--space-xl);
  }

  .page-a-propos__value-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xl);
  }

  .page-a-propos__value-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    background-color: var(--color-secondary-container); /* orange dot */
  }

  .page-a-propos__value-code {
    font-family: var(--font-mono);
    font-size: 1.5rem;
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--color-outline-variant); /* muted ghost number */
    line-height: 1;
    user-select: none;
  }

  .page-a-propos__value-title {
    font-family: var(--font-sans);
    font-size: 1.125rem;
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0 0 var(--space-md);
  }

  .page-a-propos__value-text {
    font-family: var(--font-sans);
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
  }

  /* ─────────────── ANCRAGE ─────────────── */
  .page-a-propos__ancrage {
    padding-block: var(--space-3xl);
  }

  .page-a-propos__ancrage-grid {
    display: grid;
    grid-template-columns: 5fr 7fr;
    gap: var(--space-2xl);
    align-items: center;
  }

  @media (max-width: 1023px) {
    .page-a-propos__ancrage-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Location tags */
  .page-a-propos__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-xl);
  }

  .page-a-propos__tag {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    border: 1px solid var(--color-outline-variant);
    padding: var(--space-xs) var(--space-md);
    min-height: 32px;
  }

  /* ─────────────── CTA (dark section) ─────────────── */
  .page-a-propos__cta {
    background-color: var(--color-inverse-surface); /* #2d3133 */
    padding-block: var(--space-3xl);
  }

  .page-a-propos__cta-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xl);
  }

  @media (min-width: 768px) {
    .page-a-propos__cta-layout {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }

  .page-a-propos__cta-copy {
    max-width: 600px;
  }

  .page-a-propos__cta-eyebrow {
    display: block;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(240, 241, 243, 0.55); /* --color-inverse-on-surface at reduced opacity */
    margin-bottom: var(--space-md);
  }

  .page-a-propos__cta-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-inverse-on-surface); /* #f0f1f3 */
    margin: 0;
  }

  .page-a-propos__cta-lead {
    font-family: var(--font-sans);
    font-size: 1.0625rem;
    font-weight: 400;
    line-height: 1.65;
    color: rgba(240, 241, 243, 0.75);
    margin: var(--space-lg) 0 0;
    max-width: 460px;
  }

  .page-a-propos__cta-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    flex-shrink: 0;
  }

  .page-a-propos__cta-phone {
    font-family: var(--font-sans);
    font-size: 2.25rem;
    font-weight: 300;
    letter-spacing: -0.01em;
    color: var(--color-inverse-on-surface);
    text-decoration: none;
    transition: opacity 200ms ease;
  }

  .page-a-propos__cta-phone:hover {
    opacity: 0.75;
  }

  .page-a-propos__cta-phone:focus-visible {
    outline: 2px solid var(--color-inverse-on-surface);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-a-propos__cta-phone {
      transition: none;
    }
  }

  .page-a-propos__cta-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: var(--space-md) var(--space-xl);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
    background-color: var(--color-secondary-container); /* #fd761a orange fill */
    color: var(--color-on-secondary-container); /* white */
    transition: transform 300ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .page-a-propos__cta-link:hover {
    transform: translateY(-2px);
  }

  .page-a-propos__cta-link:focus-visible {
    outline: 2px solid var(--color-inverse-on-surface);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-a-propos__cta-link {
      transition: none;
    }
    .page-a-propos__cta-link:hover {
      transform: none;
    }
  }
</style>

<Seo
  title="À propos — Auberge du Vieux Pont"
  description="L'Auberge du Vieux Pont à Saint-Raymond depuis 1972 — un hébergement pensé pour les équipes de foresterie et du secteur hydroélectrique de Portneuf."
  path="/a-propos"
  schema={[
    breadcrumbSchema([
      { name: 'Accueil', path: '/' },
      { name: 'À propos', path: '/a-propos' },
    ]),
  ]}
/>
