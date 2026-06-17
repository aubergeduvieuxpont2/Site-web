<script lang="ts">
  import { reveal, revealStagger, countUp } from "../lib/motion";
  import { SITE, STATS } from "../lib/content";
  import Contour from "../lib/components/Contour.svelte";
  import ImagePanel from "../lib/components/ImagePanel.svelte";
  import PageHeader from "../lib/components/PageHeader.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";

  const values = [
    {
      code: "01",
      title: "Honnête",
      text: "On dit les choses comme elles sont. Pas de promesses gonflées, pas de frais cachés. Le prix affiché, c'est le prix payé.",
    },
    {
      code: "02",
      title: "Robuste",
      text: "Bâti pour durer. Planchers de béton, casiers d'acier, murs qui encaissent les bottes pleines de boue sans broncher.",
    },
    {
      code: "03",
      title: "Accessible",
      text: "Du dortoir à 39 $ à la chambre privée, il y a une place pour chaque budget. Le repos n'est pas un luxe réservé.",
    },
    {
      code: "04",
      title: "Ancré",
      text: "Saint-Raymond, c'est chez nous depuis 1972. On connaît la rivière, les sentiers et le monde qui les fréquente.",
    },
  ];
</script>

<!-- ===================== HEADER ===================== -->
<PageHeader
  code="03"
  kicker="Notre histoire · Est. 1972"
  title="Bâti pour ceux qui ne reculent devant rien."
  lead="Depuis un demi-siècle, l'Auberge du Vieux Pont loge les travailleurs, les pêcheurs et, aujourd'hui, les riders. Même promesse : un repos honnête, sans flafla."
/>

<!-- ===================== ORIGIN STORY ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
      <div use:reveal={{ x: -24, y: 0 }} class="lg:col-span-5">
        <ImagePanel
          seed="oldbridge"
          ratio="4 / 5"
          code="EST · 1972"
          label="Le Pont Tessier"
          alt="Le vieux pont Tessier sur la rivière Sainte-Anne"
        />
      </div>

      <div class="lg:col-span-7">
        <SectionLabel code="ORIG" label="D'où l'on vient" />

        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 max-w-2xl font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Une maison plantée au bord de la rivière.
        </h2>

        <div class="mt-7 max-w-xl space-y-5 text-lg leading-relaxed text-ink-soft">
          <p use:reveal={{ y: 18, delay: 0.1 }}>
            Tout commence près du vieux pont Tessier, là où la rivière
            Sainte-Anne taille son chemin dans la roche de Portneuf. En 1972, la
            bâtisse ouvre ses portes pour loger ceux qui travaillaient fort :
            bûcherons, gens de chantier, pêcheurs venus tester l'eau froide au
            petit matin.
          </p>
          <p use:reveal={{ y: 18, delay: 0.15 }}>
            On n'a jamais cherché à impressionner. On a cherché à dépanner. Un
            lit propre, un repas chaud, un toit solide quand la journée finissait
            tard et que la suivante commençait tôt. C'est devenu notre réputation
            — et on ne l'a pas lâchée depuis.
          </p>
          <p use:reveal={{ y: 18, delay: 0.2 }}>
            Avec les années, le monde a changé de bottes. La Vallée Bras-du-Nord
            a tracé ses 80 km de sentiers, et les riders ont remplacé une partie
            des équipes de chantier. On a ajouté des casiers à vélos, une station
            de lavage, des bornes de recharge. Mais l'esprit, lui, n'a pas
            bougé d'un pouce.
          </p>
        </div>

        <figure use:reveal={{ y: 22, delay: 0.26 }} class="mt-10">
          <blockquote
            class="border-l-2 border-terracotta pl-6 font-serif text-2xl italic leading-snug tracking-[-0.01em] text-ink md:text-3xl"
          >
            « On ne vend pas du luxe. On vend du repos qui tient la route. »
          </blockquote>
          <figcaption class="mt-4 pl-6 tech-label text-ink-mute">
            La maison · depuis 1972
          </figcaption>
        </figure>
      </div>
    </div>
  </div>
</section>

<!-- ===================== VALUES ===================== -->
<section class="border-y border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="max-w-2xl">
      <SectionLabel code="ADN" label="Nos principes" />
      <h2
        use:reveal={{ y: 20, delay: 0.05 }}
        class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
      >
        Quatre principes qui ne se négocient pas.
      </h2>
    </div>

    <div
      use:revealStagger={{ each: 0.08, y: 22 }}
      class="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
    >
      {#each values as value (value.code)}
        <div
          class="flex flex-col rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface p-7"
        >
          <div class="flex items-center justify-between">
            <span class="h-2.5 w-2.5 bg-terracotta" aria-hidden="true"></span>
            <span class="font-mono text-2xl font-semibold text-terracotta/30"
              >{value.code}</span
            >
          </div>
          <h3 class="mt-6 font-sans text-xl font-semibold tracking-[-0.01em] text-ink">
            {value.title}
          </h3>
          <p class="mt-3 text-sm leading-relaxed text-ink-soft">{value.text}</p>
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

<!-- ===================== ANCHORING ===================== -->
<section class="relative overflow-hidden bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <div class="order-1">
        <SectionLabel code="ICI" label="Ce qu'on défend" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.04] tracking-[-0.02em] text-ink md:text-[3.4rem]"
        >
          Ancrés à Saint-Raymond, les pieds dans la rivière.
        </h2>
        <div class="mt-6 max-w-lg space-y-5 text-lg leading-relaxed text-ink-soft">
          <p use:reveal={{ y: 18, delay: 0.1 }}>
            On n'est pas une chaîne. On est une auberge de Portneuf, tenue par
            du monde d'ici, à deux pas des sentiers et de l'eau. La rivière
            Sainte-Anne coule sous nos fenêtres ; le réseau de la Vallée
            Bras-du-Nord commence presque dans la cour.
          </p>
          <p use:reveal={{ y: 18, delay: 0.15 }}>
            Ça veut dire des conseils qui valent quelque chose, des horaires qui
            collent à la vraie vie, et l'assurance qu'on comprend ce que c'est
            qu'une longue journée — qu'elle se passe sur un chantier ou sur un
            single track.
          </p>
        </div>
        <div use:reveal={{ y: 16, delay: 0.2 }} class="mt-8 flex flex-wrap gap-2">
          {#each ["Saint-Raymond", "Portneuf", "Vue rivière", "Sentiers à 2 km"] as tag (tag)}
            <span
              class="rounded-[var(--radius-blueprint)] border border-hairline px-3 py-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-ink-soft"
              >{tag}</span
            >
          {/each}
        </div>
      </div>

      <div use:reveal={{ x: 24, y: 0 }} class="order-2">
        <ImagePanel
          seed="village"
          ratio="3 / 2"
          code="LOC · 03"
          label="Saint-Raymond · Portneuf"
          alt="Le village de Saint-Raymond le long de la rivière Sainte-Anne"
        />
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
      <span class="tech-label text-white/70">Visite</span>
      <h2
        class="mt-4 font-sans text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[3.6rem]"
      >
        Venez voir par vous-même.
      </h2>
      <p class="mt-5 max-w-lg text-lg text-white/85">
        Le mieux pour comprendre ce qu'on est, c'est de pousser la porte.
        Appelez-nous ou écrivez-nous — on vous attend au bord du pont.
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
        >Nous joindre</a
      >
    </div>
  </div>
</section>
