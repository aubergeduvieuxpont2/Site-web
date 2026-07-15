<script lang="ts">
  import { reveal, revealStagger } from "../lib/motion";
  import { ROOMS, SITE } from "../lib/content";
  import Button from "../lib/components/Button.svelte";
  import Contour from "../lib/components/Contour.svelte";
  import PageHeader from "../lib/components/PageHeader.svelte";
  import RoomCard from "../lib/components/RoomCard.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";

  // What every room includes, no exception.
  const included = [
    {
      code: "INC-01",
      title: "WiFi gratuit",
      text: "Fibre dans tout le bâtiment. Assez solide pour le télétravail comme pour le streaming après le sentier.",
    },
    {
      code: "INC-02",
      title: "Stationnement gratuit",
      text: "Espace large pour pick-up, remorque à vélos et van. Aucun frais, aucune réservation.",
    },
    {
      code: "INC-03",
      title: "Cuisine partagée",
      text: "Cuisine complète en accès libre. Frigo, cuisinière et tout le nécessaire pour cuisiner en gang.",
    },
    {
      code: "INC-04",
      title: "Buanderie",
      text: "Laveuse et sécheuse sur place pour le linge boueux et les vêtements de travail.",
    },
    {
      code: "INC-05",
      title: "Lavage de vélo",
      text: "Accès à la station de lavage et au coin d'atelier. On rince, on graisse, on repart à neuf.",
    },
    {
      code: "INC-06",
      title: "La rivière à deux pas",
      text: "Vue ou accès direct à la rivière Sainte-Anne. Trempette, pause ou point de départ.",
    },
  ];

  // Réserver en trois temps.
  const steps = [
    {
      code: "01",
      title: "Choisissez votre formule",
      text: "Dortoir d'équipe, chambre du quart, refuge du rider ou gîte familial. Repérez ce qui colle à votre nuit.",
    },
    {
      code: "02",
      title: "Appelez ou écrivez-nous",
      text: "Un coup de fil ou un courriel suffit. On confirme les disponibilités et on calcule les tarifs de groupe.",
    },
    {
      code: "03",
      title: "Confirmez et roulez",
      text: "On bloque votre chambre, vous arrivez quand ça vous chante. Ententes entreprise et chantier sur demande.",
    },
  ];
</script>

<PageHeader
  code="01"
  kicker="Hébergement · Saint-Raymond"
  title="Des chambres taillées pour le travail et le sentier."
  lead="Du dortoir d'équipe à la chambre privée insonorisée — toutes avec accès à la rivière Sainte-Anne et au stockage sécurisé."
>
  {#snippet children()}
    <div class="flex flex-wrap items-center gap-3">
      <Button href="/contact" variant="primary">Vérifier les disponibilités</Button>
      <Button href={SITE.phoneHref} variant="secondary">{SITE.phone}</Button>
    </div>
  {/snippet}
</PageHeader>

<!-- ===================== ROOMS GRID ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="max-w-2xl">
        <SectionLabel text="4 formules" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Quatre façons de poser votre sac.
        </h2>
      </div>
      <Button href="/contact" variant="ghost">Demander une réservation →</Button>
    </div>

    <div
      use:revealStagger={{ each: 0.1, y: 26 }}
      class="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {#each ROOMS as room (room.id)}
        <RoomCard {room} />
      {/each}
    </div>
  </div>
</section>

<!-- ===================== INCLUDED IN EVERY ROOM ===================== -->
<section class="border-y border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="max-w-2xl">
      <SectionLabel text="Inclus partout" />
      <h2
        use:reveal={{ y: 20, delay: 0.05 }}
        class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
      >
        Inclus dans toutes les chambres.
      </h2>
      <p use:reveal={{ y: 18, delay: 0.12 }} class="mt-6 text-lg text-ink-soft">
        Pas de suppléments cachés, pas de petits caractères. Ce qui suit vient
        avec chaque nuit, peu importe la formule.
      </p>
    </div>

    <div
      use:revealStagger={{ each: 0.06, y: 22 }}
      class="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      {#each included as item (item.code)}
        <div
          class="group flex flex-col bg-surface-2 p-7 transition-colors duration-300 hover:bg-surface"
        >
          <div class="flex items-center justify-between">
            <span
              class="flex h-11 w-11 items-center justify-center rounded-[var(--radius-blueprint)] border border-hairline bg-surface text-terracotta transition-colors duration-300 group-hover:border-terracotta"
            >
              <span class="h-2.5 w-2.5 bg-terracotta" aria-hidden="true"></span>
            </span>
            <span class="font-mono text-[0.65rem] text-ink-mute">{item.code}</span>
          </div>
          <h3 class="mt-5 font-sans text-lg font-semibold text-ink">
            {item.title}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-soft">{item.text}</p>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== HOW TO BOOK ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="max-w-2xl">
        <SectionLabel text="Comment réserver" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Réserver, en trois temps.
        </h2>
      </div>
      <p
        use:reveal={{ y: 18, delay: 0.1 }}
        class="max-w-sm text-base text-ink-soft md:text-right"
      >
        Tarifs de groupe et ententes entreprise disponibles pour les équipes,
        les chantiers et les pelotons.
      </p>
    </div>

    <div
      use:revealStagger={{ each: 0.1, y: 24 }}
      class="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2 md:grid-cols-3"
    >
      {#each steps as step (step.code)}
        <div class="flex flex-col bg-surface p-8 md:p-10">
          <span class="font-mono text-4xl font-semibold text-terracotta/30"
            >{step.code}</span
          >
          <h3
            class="mt-5 font-sans text-xl font-semibold tracking-[-0.01em] text-ink md:text-2xl"
          >
            {step.title}
          </h3>
          <p class="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
            {step.text}
          </p>
        </div>
      {/each}
    </div>

    <div use:reveal={{ y: 18, delay: 0.1 }} class="mt-10 flex flex-wrap items-center gap-3">
      <Button href="/contact" variant="primary">Demander une réservation</Button>
      <Button href={SITE.phoneHref} variant="ghost">Appeler le {SITE.phone} →</Button>
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
      <span class="tech-label text-white/70">Groupes & entreprises</span>
      <h2
        class="mt-4 font-sans text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[3.6rem]"
      >
        Une équipe à loger ?
      </h2>
      <p class="mt-5 max-w-lg text-lg text-white/85">
        Crew de chantier ou peloton de fin de semaine — on bloque les chambres
        qu'il vous faut et on ajuste les tarifs. Un appel suffit.
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
