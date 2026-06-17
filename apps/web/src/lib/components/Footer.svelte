<script lang="ts">
  import { link } from "../router";
  import { NAV, SITE } from "../content";
  import Wordmark from "./Wordmark.svelte";
  import Contour from "./Contour.svelte";

  const marquee = ["ROULER", "TRAVAILLER", "DORMIR", "RECOMMENCER"];
  const year = 2026;

  const legal = [
    { label: "Mentions légales", href: "/politique#mentions" },
    { label: "Politique de confidentialité", href: "/politique#confidentialite" },
    { label: "Conditions de séjour", href: "/politique" },
  ];
</script>

<!-- Marquee strip -->
<div class="overflow-hidden border-y border-charcoal-2 bg-terracotta">
  <div class="flex animate-[marquee_28s_linear_infinite] whitespace-nowrap py-3">
    {#each Array(3) as _, g (g)}
      <div class="flex shrink-0 items-center">
        {#each marquee as word (word + g)}
          <span
            class="mx-6 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-white"
            >{word}</span
          >
          <span class="text-ember/70">✕</span>
        {/each}
      </div>
    {/each}
  </div>
</div>

<footer
  class="relative overflow-hidden bg-charcoal text-on-charcoal"
>
  <Contour
    class="pointer-events-none absolute -left-20 bottom-0 h-[30rem] w-[30rem] text-on-charcoal/[0.06]"
  />

  <div class="relative mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-20">
    <div class="grid gap-12 md:grid-cols-12">
      <div class="md:col-span-5">
        <div class="flex items-center gap-3">
          <Wordmark class="h-11 w-11 text-ember" />
          <div>
            <p class="font-sans text-lg font-semibold tracking-[-0.01em]">
              L'Auberge du Vieux Pont
            </p>
            <p class="tech-label text-on-charcoal-soft">
              EST. {SITE.established}
            </p>
          </div>
        </div>
        <p class="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-on-charcoal-soft">
          {SITE.tagline} Un point d'ancrage pour les travailleurs et les riders, au pied de la Vallée Bras-du-Nord.
        </p>
      </div>

      <div class="md:col-span-3">
        <p class="tech-label text-ember">Navigation</p>
        <ul class="mt-5 space-y-3">
          {#each NAV as item (item.href)}
            <li>
              <a
                href={item.href}
                use:link
                class="group inline-flex items-center gap-2 text-on-charcoal transition-colors hover:text-ember"
              >
                <span class="font-mono text-[0.6rem] text-on-charcoal-soft"
                  >{item.code}</span
                >
                {item.label}
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div class="md:col-span-4">
        <p class="tech-label text-ember">Coordonnées</p>
        <address class="mt-5 space-y-4 not-italic">
          <p class="text-on-charcoal-soft">
            {SITE.address.street}<br />
            {SITE.address.city}, {SITE.address.province} {SITE.address.postal}<br
            />
            {SITE.address.country}
          </p>
          <p class="flex flex-col gap-1">
            <a
              href={SITE.phoneHref}
              class="font-mono text-lg text-on-charcoal transition-colors hover:text-ember"
              >{SITE.phone}</a
            >
            <a
              href={"mailto:" + SITE.email}
              class="text-sm text-on-charcoal-soft transition-colors hover:text-ember"
              >{SITE.email}</a
            >
          </p>
        </address>
      </div>
    </div>

    <div
      class="mt-14 flex flex-col gap-4 border-t border-charcoal-2 pt-6 text-sm md:flex-row md:items-center md:justify-between"
    >
      <p class="text-on-charcoal-soft">
        © {year} {SITE.name}. Tous droits réservés.
      </p>
      <ul class="flex flex-wrap gap-x-6 gap-y-2">
        {#each legal as item (item.href)}
          <li>
            <a
              href={item.href}
              use:link
              class="text-on-charcoal-soft underline decoration-charcoal-2 underline-offset-4 transition-colors hover:text-ember hover:decoration-ember"
              >{item.label}</a
            >
          </li>
        {/each}
      </ul>
    </div>
  </div>
</footer>

<style>
  @keyframes marquee {
    to {
      transform: translateX(-33.333%);
    }
  }
</style>
