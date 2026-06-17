<script lang="ts">
  import { reveal, revealStagger, countUp } from "../lib/motion";
  import { ATTRACTIONS, SITE } from "../lib/content";
  import Button from "../lib/components/Button.svelte";
  import Contour from "../lib/components/Contour.svelte";
  import PageHeader from "../lib/components/PageHeader.svelte";
  import ImagePanel from "../lib/components/ImagePanel.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";

  // Spec band — key facts about the playground.
  const specs = [
    { value: 80, suffix: " km", label: "de sentiers VTT" },
    { value: 2, suffix: " km", label: "de votre lit" },
    { value: 6, suffix: "", label: "attraits majeurs" },
    { value: 4, suffix: "", label: "saisons de glisse" },
  ];

  // Trail-difficulty markers — the IMBA/FQSC colour code, mapped from the
  // grade string. Each marker is a colour + a shape, rendered as small spans.
  type Marker = { color: string; shape: "circle" | "square" | "diamond" };

  function gradeMarkers(grade: string): Marker[] {
    const g = grade.toLowerCase();
    const out: Marker[] = [];
    if (g.includes("tous niveaux"))
      out.push({ color: "#b5562f", shape: "circle" }); // terracotta
    if (g.includes("facile")) out.push({ color: "#3a7d34", shape: "circle" });
    if (g.includes("intermédiaire"))
      out.push({ color: "#2f6fb0", shape: "square" });
    if (g.includes("expert")) out.push({ color: "#1b1c1c", shape: "diamond" });
    // Fallback so a marker always renders.
    if (out.length === 0) out.push({ color: "#3a7d34", shape: "circle" });
    return out;
  }

  const seasons = [
    {
      code: "PR",
      title: "Printemps boueux",
      text: "La fonte gorge les single tracks. Bottes crottées, sourires larges — la station de lavage tourne à plein régime.",
    },
    {
      code: "ÉT",
      title: "Été flow",
      text: "Terrain sec et rapide. Les 80 km roulent au mieux, du flow roulant aux descentes techniques du Shannahan.",
    },
    {
      code: "AU",
      title: "Automne couleurs",
      text: "L'érablière s'embrase, l'air se rafraîchit, la garnotte tient ferme. La plus belle fenêtre pour grimper la via ferrata.",
    },
  ];
</script>

<PageHeader
  code="02"
  kicker="Le terrain de jeu · Vallée Bras-du-Nord"
  title="Plus de 80 km de sentiers, à 2 km de votre lit."
  lead="VTT primé, randonnée, canyoning et via ferrata. Rincez l'équipement, rechargez la batterie, recommencez demain."
>
  {#snippet children()}
    <Button href="/chambres" variant="primary">Réserver votre base de camp</Button>
  {/snippet}
</PageHeader>

<!-- ===================== SPEC BAND ===================== -->
<section class="bg-charcoal text-on-charcoal">
  <div
    use:revealStagger={{ each: 0.1, y: 18 }}
    class="mx-auto grid max-w-[1280px] grid-cols-2 gap-px overflow-hidden border-x border-charcoal-2 bg-charcoal-2 md:grid-cols-4"
  >
    {#each specs as spec (spec.label)}
      <div class="bg-charcoal px-6 py-12 text-center md:py-16">
        <p
          class="font-sans text-[2.6rem] font-semibold tracking-[-0.02em] text-ember md:text-6xl"
          use:countUp={{ to: spec.value, suffix: spec.suffix }}
        >
          {spec.value}{spec.suffix}
        </p>
        <p class="mt-2 text-sm text-on-charcoal-soft">{spec.label}</p>
      </div>
    {/each}
  </div>
</section>

<!-- ===================== ATTRACTIONS GRID ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div class="max-w-2xl">
        <SectionLabel code="MAP" label="Les attraits" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Six terrains de jeu, une seule base de camp.
        </h2>
      </div>
      <Button href="/contact" variant="ghost">Planifier votre sortie →</Button>
    </div>

    <div
      use:revealStagger={{ each: 0.08, y: 26 }}
      class="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {#each ATTRACTIONS as a (a.code)}
        <article
          class="group flex h-full flex-col overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-container-lowest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-terracotta hover:shadow-[0_18px_40px_-24px_rgba(27,28,28,0.5)]"
          style="--color-surface-container-lowest:#ffffff"
        >
          <ImagePanel
            seed={a.seed}
            code={a.code}
            label={a.category}
            ratio="4 / 3"
            alt={a.name}
            class="group"
          />

          <div class="flex flex-1 flex-col p-5 md:p-6">
            <h3
              class="font-sans text-xl font-semibold leading-tight tracking-[-0.01em] text-ink"
            >
              {a.name}
            </h3>
            <span class="tech-label mt-1.5 block text-ink-mute">{a.category}</span>

            <p class="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
              {a.text}
            </p>

            <div
              class="mt-auto grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2 pt-px"
              style="margin-top:1.25rem"
            >
              <div class="bg-surface px-3 py-3">
                <dt class="tech-label text-ink-mute">Distance</dt>
                <dd class="mt-1 text-sm font-medium text-ink">{a.distance}</dd>
              </div>
              <div class="bg-surface px-3 py-3">
                <dt class="tech-label text-ink-mute">Niveau</dt>
                <dd class="mt-1 flex items-center gap-2">
                  <span class="flex shrink-0 items-center gap-1" aria-hidden="true">
                    {#each gradeMarkers(a.grade) as m, i (i)}
                      {#if m.shape === "circle"}
                        <span
                          class="inline-block h-2.5 w-2.5 rounded-full"
                          style="background:{m.color}"
                        ></span>
                      {:else if m.shape === "square"}
                        <span
                          class="inline-block h-2.5 w-2.5"
                          style="background:{m.color}"
                        ></span>
                      {:else}
                        <span
                          class="inline-block h-2.5 w-2.5 rotate-45"
                          style="background:{m.color}"
                        ></span>
                      {/if}
                    {/each}
                  </span>
                  <span class="font-mono text-[0.72rem] leading-tight text-ink"
                    >{a.grade}</span
                  >
                </dd>
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- ===================== SEASONS ===================== -->
<section class="relative overflow-hidden border-t border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-20 md:px-10 md:py-28">
    <div class="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <div use:reveal={{ x: -24, y: 0 }} class="group order-2 lg:order-1">
        <ImagePanel
          seed="season"
          ratio="3 / 2"
          code="CAL · 02"
          label="Ce qu'on roule · au fil de l'année"
          alt="Les sentiers de la Vallée Bras-du-Nord au fil des saisons"
        />
      </div>

      <div class="order-1 lg:order-2">
        <SectionLabel code="CAL" label="Quand venir" />
        <h2
          use:reveal={{ y: 20, delay: 0.05 }}
          class="mt-5 font-sans text-[2.2rem] font-semibold leading-[1.04] tracking-[-0.02em] text-ink md:text-[3.2rem]"
        >
          Quatre saisons. Une seule règle&nbsp;: on rince avant de rentrer.
        </h2>
        <p
          use:reveal={{ y: 18, delay: 0.12 }}
          class="mt-6 max-w-lg font-serif text-xl italic leading-relaxed text-ink-soft"
        >
          « De la sloche d'avril aux feux d'octobre, le terrain change — la base
          de camp, jamais. »
        </p>

        <ul
          use:revealStagger={{ each: 0.08, y: 16 }}
          class="mt-9 space-y-4"
        >
          {#each seasons as season (season.code)}
            <li
              class="flex items-start gap-4 border-b border-hairline-2 pb-4"
            >
              <span
                class="mt-0.5 shrink-0 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-terracotta"
                >{season.code}</span
              >
              <div>
                <h3 class="font-sans text-base font-semibold text-ink">
                  {season.title}
                </h3>
                <p class="mt-1 text-sm leading-relaxed text-ink-soft">
                  {season.text}
                </p>
              </div>
            </li>
          {/each}
        </ul>

        <div class="mt-9">
          <Button href="/chambres" variant="secondary">Réserver une nuitée</Button>
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
      <span class="tech-label text-white/70">Le sentier appelle</span>
      <h2
        class="mt-4 font-sans text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.02em] md:text-[3.6rem]"
      >
        Le sentier vous attend.
      </h2>
      <p class="mt-5 max-w-lg text-lg text-white/85">
        Réservez votre base de camp, on garde l'équipement au sec et la cafetière
        prête avant l'aube.
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
