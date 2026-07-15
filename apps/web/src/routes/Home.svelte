<script lang="ts">
  import { reveal, revealStagger, countUp } from "../lib/motion";
  import { ROOMS, AMENITIES, ATTRACTIONS, STATS, SITE } from "../lib/content";
  import Button from "../lib/components/Button.svelte";
  import Contour from "../lib/components/Contour.svelte";
  import ImagePanel from "../lib/components/ImagePanel.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";
  import RoomCard from "../lib/components/RoomCard.svelte";

  const pillars = [
    {
      code: "01",
      title: "Bâti pour les travailleurs",
      lead: "Logistique et repos",
      points: [
        "Petits-déjeuners matinaux adaptés aux horaires de quart.",
        "Chambres insonorisées pour un repos réparateur garanti.",
        "Tarifs contractuels avantageux pour les entreprises.",
      ],
      href: "/chambres",
      cta: "En savoir plus",
    },
    {
      code: "02",
      title: "Prêt pour le sentier",
      lead: "Équipement et transport",
      points: [
        "Stockage sécurisé pour vélos et équipements lourds.",
        "Stations de recharge dédiées pour vélos électriques.",
        "Accès direct et rapide aux sentiers régionaux.",
      ],
      href: "/attraits",
      cta: "Découvrir les installations",
    },
  ];

  const featuredRooms = ROOMS.slice(0, 3);
  const featuredAmenities = AMENITIES.slice(0, 6);
  const trail = ATTRACTIONS[0];
</script>

<!-- ===================== HERO ===================== -->
<section class="relative overflow-hidden bg-surface">
  <Contour
    class="pointer-events-none absolute -right-32 -top-24 h-[52rem] w-[52rem] text-outline/20"
  />
  <div
    class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-terracotta to-transparent"
  ></div>

  <div
    class="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-16 pt-32 md:px-10 md:pb-24 md:pt-40 lg:grid-cols-12 lg:gap-8"
  >
    <div class="lg:col-span-7">
      <div
        use:reveal={{ y: 14, duration: 0.6 }}
        class="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <span class="tech-label text-terracotta">N 46.9° · O 71.8°</span>
        <span class="h-px w-8 bg-hairline" aria-hidden="true"></span>
        <span class="tech-label text-ink-soft">{SITE.region}</span>
      </div>

      <h1
        use:reveal={{ y: 28, delay: 0.06, duration: 0.9 }}
        class="mt-7 max-w-3xl font-sans text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.03em] text-ink md:text-[5.4rem]"
      >
        L'utilité<br />rencontre le <span class="text-terracotta">refuge</span>.
      </h1>

      <p
        use:reveal={{ y: 20, delay: 0.16 }}
        class="mt-7 max-w-xl text-lg leading-relaxed text-ink-soft md:text-xl"
      >
        Un endroit pour déposer votre équipement, faire le plein avec des repas
        copieux et vous reposer sans compromis. Aux portes de la Vallée
        Bras-du-Nord.
      </p>

      <div
        use:reveal={{ y: 18, delay: 0.26 }}
        class="mt-9 flex flex-wrap items-center gap-3"
      >
        <Button href="/contact" variant="primary">Voir les disponibilités</Button>
        <Button href="/chambres" variant="secondary">Découvrir les chambres</Button>
      </div>

      <dl
        use:revealStagger={{ each: 0.08, y: 16 }}
        class="mt-14 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2"
      >
        <div class="bg-surface px-4 py-4">
          <dt class="tech-label text-ink-mute">Fondée</dt>
          <dd class="mt-1 font-sans text-xl font-semibold text-ink">
            {SITE.established}
          </dd>
        </div>
        <div class="bg-surface px-4 py-4">
          <dt class="tech-label text-ink-mute">Sentiers</dt>
          <dd class="mt-1 font-sans text-xl font-semibold text-ink">80 km</dd>
        </div>
        <div class="bg-surface px-4 py-4">
          <dt class="tech-label text-ink-mute">Vue</dt>
          <dd class="mt-1 font-sans text-xl font-semibold text-ink">Rivière</dd>
        </div>
      </dl>
    </div>

    <div use:reveal={{ x: 30, y: 0, delay: 0.2, duration: 1 }} class="lg:col-span-5">
      <div class="group relative">
        <ImagePanel
          imgKey="hero-bridge"
          picsumSeed="hero-bridge"
          aspectRatio="4 / 5"
          caption="Le vieux pont · Rivière Sainte-Anne"
          alt="Le vieux pont sur la rivière Sainte-Anne à Saint-Raymond"
        />
        <div
          class="absolute -bottom-5 -left-5 hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface px-5 py-4 shadow-[0_18px_40px_-24px_rgba(27,28,28,0.5)] sm:block"
        >
          <p class="tech-label text-terracotta">Auberge de jeunesse</p>
          <p class="mt-1 max-w-[12rem] text-sm text-ink-soft">
            Du dortoir d'équipe à la chambre privée insonorisée.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===================== PILLARS ===================== -->
<section class="border-y border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="grid gap-10 md:grid-cols-2 md:gap-px md:overflow-hidden md:rounded-[var(--radius-blueprint)] md:border md:border-hairline-2 md:bg-hairline-2">
      {#each pillars as pillar (pillar.code)}
        <div
          use:reveal={{ y: 24 }}
          class="bg-surface-2 md:p-10"
        >
          <div class="flex items-baseline gap-3">
            <span class="font-mono text-3xl font-semibold text-terracotta/30"
              >{pillar.code}</span
            >
            <span class="tech-label text-ink-soft">{pillar.lead}</span>
          </div>
          <h2
            class="mt-4 font-sans text-3xl font-semibold tracking-[-0.01em] text-ink md:text-[2.4rem]"
          >
            {pillar.title}
          </h2>
          <ul class="mt-7 space-y-4">
            {#each pillar.points as point (point)}
              <li class="flex items-start gap-3.5 border-b border-hairline-2 pb-4">
                <svg
                  class="mt-0.5 h-5 w-5 shrink-0 text-terracotta"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="1" y="1" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5" />
                  <path d="M5.5 10.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span class="text-ink-soft">{point}</span>
              </li>
            {/each}
          </ul>
          <div class="mt-7">
            <Button href={pillar.href} variant="ghost">{pillar.cta} →</Button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== STATS ===================== -->
<section class="bg-charcoal text-on-charcoal">
  <div
    use:revealStagger={{ each: 0.1, y: 18 }}
    class="mx-auto grid max-w-[1280px] grid-cols-2 gap-px overflow-hidden border-x border-charcoal-2 bg-charcoal-2 px-0 md:grid-cols-4"
  >
    {#each STATS as stat (stat.label)}
      <div class="bg-charcoal px-6 py-12 text-center md:py-16">
        <p
          class="font-sans text-[2.6rem] font-semibold tracking-[-0.02em] text-ember md:text-6xl"
          use:countUp={{ to: stat.value, suffix: stat.suffix }}
        >
          {stat.value}{stat.suffix}
        </p>
        <p class="mt-2 text-sm text-on-charcoal-soft">{stat.label}</p>
      </div>
    {/each}
  </div>
</section>

<!-- ===================== AMENITIES ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="max-w-2xl">
        <SectionLabel text="Services & installations" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Tout l'équipement pour rouler, bosser et récupérer.
        </h2>
      </div>
      <Button href="/chambres" variant="ghost">Voir les chambres →</Button>
    </div>

    <div
      use:revealStagger={{ each: 0.06, y: 22 }}
      class="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      {#each featuredAmenities as amenity (amenity.code)}
        <div
          class="group flex flex-col bg-surface p-7 transition-colors duration-300 hover:bg-surface-2"
        >
          <div class="flex items-center justify-between">
            <span
              class="flex h-11 w-11 items-center justify-center rounded-[var(--radius-blueprint)] border border-hairline bg-surface-2 text-terracotta transition-colors duration-300 group-hover:border-terracotta"
            >
              <span class="h-2.5 w-2.5 bg-terracotta" aria-hidden="true"></span>
            </span>
            <span class="font-mono text-[0.65rem] text-ink-mute">{amenity.code}</span>
          </div>
          <h3 class="mt-5 font-sans text-lg font-semibold text-ink">
            {amenity.title}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-soft">{amenity.text}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== ROOMS PREVIEW ===================== -->
<section class="border-t border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="max-w-2xl">
        <SectionLabel text="Hébergement" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Quatre formules. Zéro compromis sur le repos.
        </h2>
      </div>
      <Button href="/chambres" variant="secondary">Toutes les chambres</Button>
    </div>

    <div
      use:revealStagger={{ each: 0.1, y: 26 }}
      class="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {#each featuredRooms as room (room.id)}
        <RoomCard {room} />
      {/each}
    </div>
  </div>
</section>

<!-- ===================== TRAIL FEATURE ===================== -->
<section class="relative overflow-hidden bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <div use:reveal={{ x: -24, y: 0 }} class="group order-2 lg:order-1">
        <ImagePanel
          imgKey={trail.seed}
          picsumSeed={trail.seed}
          aspectRatio="3 / 2"
          caption={trail.category}
          alt={trail.name}
        />
      </div>
      <div class="order-1 lg:order-2">
        <SectionLabel text="Le terrain de jeu" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.04] tracking-[-0.02em] text-ink md:text-[3.4rem]"
        >
          {trail.name}, à {trail.distance}.
        </h2>
        <p use:reveal={{ y: 18, delay: 0.12 }} class="mt-6 max-w-lg text-lg text-ink-soft">
          {trail.text} On stocke, on lave et on recharge sur place — vous n'avez
          qu'à rouler.
        </p>
        <div
          use:reveal={{ y: 16, delay: 0.18 }}
          class="mt-8 flex flex-wrap gap-2"
        >
          {#each ["VTT", "Randonnée", "Canyoning", "Via ferrata"] as tag (tag)}
            <span
              class="rounded-[var(--radius-blueprint)] border border-hairline px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink-soft"
              >{tag}</span
            >
          {/each}
        </div>
        <div class="mt-9">
          <Button href="/attraits" variant="primary">Explorer les attraits</Button>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===================== CTA ===================== -->
<section class="relative overflow-hidden bg-terracotta text-white">
  <Contour
    class="pointer-events-none absolute -left-24 -bottom-32 h-[44rem] w-[44rem] text-white/15"
  />
  <div
    class="relative mx-auto flex max-w-[1280px] flex-col items-start gap-10 px-5 py-20 md:flex-row md:items-center md:justify-between md:px-10 md:py-28"
  >
    <div use:reveal={{ y: 22 }} class="max-w-2xl">
      <span class="tech-label text-white/70">Réservation</span>
      <h2
        class="mt-4 font-sans text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[3.6rem]"
      >
        Posez votre sac. On s'occupe du reste.
      </h2>
      <p class="mt-5 max-w-lg text-lg text-white/85">
        Appelez-nous ou écrivez-nous pour vérifier les disponibilités et les
        tarifs de groupe.
      </p>
    </div>
    <div use:reveal={{ y: 20, delay: 0.1 }} class="flex shrink-0 flex-col gap-4">
      <a
        href={SITE.phoneHref}
        class="font-sans text-3xl font-semibold tracking-[-0.01em] text-white transition-opacity hover:opacity-80 md:text-4xl"
        >{SITE.phone}</a
      >
      <a
        href="/contact"
        class="inline-flex items-center justify-center gap-2 rounded-[var(--radius-blueprint)] bg-white px-7 py-4 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-terracotta transition-transform duration-300 hover:-translate-y-0.5"
        >Demander une réservation</a
      >
    </div>
  </div>
</section>
