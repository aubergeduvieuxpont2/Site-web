<script lang="ts">
  import { reveal } from "../lib/motion";
  import { POLICIES, PRIVACY, SITE } from "../lib/content";
  import PageHeader from "../lib/components/PageHeader.svelte";
  import Button from "../lib/components/Button.svelte";
  import SectionLabel from "../lib/components/SectionLabel.svelte";

  // In-page index — plain hash anchors (NOT router links).
  const toc = [
    { id: "sejour", code: "A", label: "Conditions de séjour" },
    { id: "mentions", code: "B", label: "Mentions légales" },
    { id: "confidentialite", code: "C", label: "Politique de confidentialité" },
  ];

  const updated = "juin 2026";
</script>

<PageHeader
  code="05"
  kicker="Conditions & confidentialité"
  title="Les règles de la maison."
  lead="Claires et sans surprise — comme tout le reste ici. Conditions de séjour, mentions légales et protection de vos renseignements."
/>

<!-- ===================== POLICY DOCUMENT ===================== -->
<section class="bg-surface">
  <div class="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-24">
    <div class="grid gap-12 lg:grid-cols-3 lg:gap-16">
      <!-- LEFT — table of contents / index card -->
      <aside class="lg:sticky lg:top-28 h-max">
        <nav
          use:reveal={{ y: 18 }}
          class="rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface p-6"
          aria-label="Sommaire"
        >
          <span class="tech-label text-terracotta">Sommaire</span>
          <ul class="mt-5 space-y-px">
            {#each toc as item (item.id)}
              <li>
                <a
                  href={`#${item.id}`}
                  class="group flex items-baseline gap-3 border-t border-hairline-2 py-3 transition-colors first:border-t-0 first:pt-0 hover:text-terracotta"
                >
                  <span
                    class="shrink-0 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-terracotta"
                    >{item.code}</span
                  >
                  <span class="text-sm font-medium leading-snug text-ink transition-colors group-hover:text-terracotta"
                    >{item.label}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      </aside>

      <!-- RIGHT — content blocks -->
      <div class="lg:col-span-2">
        <p
          use:reveal={{ y: 12 }}
          class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-ink-mute"
        >
          Dernière mise à jour : {updated}
        </p>

        <!-- ===== A · Conditions de séjour ===== -->
        <div id="sejour" class="scroll-mt-28 mt-10">
          <SectionLabel code="A" label="Conditions de séjour" />
          <h2
            use:reveal={{ y: 20, delay: 0.05 }}
            class="mt-5 max-w-[65ch] font-sans text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.02em] text-ink md:text-[2.6rem]"
          >
            Conditions de séjour
          </h2>
          <p
            use:reveal={{ y: 16, delay: 0.1 }}
            class="mt-4 max-w-[65ch] text-base leading-relaxed text-ink-soft"
          >
            Ce qu'on attend de vous, et ce que vous pouvez attendre de nous.
            Lisez-les une fois, on n'y revient plus.
          </p>

          {#each POLICIES as section (section.code)}
            <div
              use:reveal={{ y: 18 }}
              class="mt-8 border-t border-hairline-2 pt-8"
            >
              <div class="flex items-baseline gap-4">
                <span
                  class="shrink-0 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-terracotta"
                  >{section.code}</span
                >
                <h3 class="font-sans text-xl font-semibold tracking-[-0.01em] text-ink">
                  {section.title}
                </h3>
              </div>
              <ul class="mt-4 space-y-3 pl-[3.1rem]">
                {#each section.items as item, i (i)}
                  <li class="flex items-start gap-3 max-w-[65ch]">
                    <span
                      class="mt-[0.5rem] h-1.5 w-1.5 shrink-0 bg-terracotta"
                      aria-hidden="true"
                    ></span>
                    <span class="text-[0.95rem] leading-relaxed text-ink-soft"
                      >{item}</span
                    >
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>

        <!-- ===== B · Mentions légales ===== -->
        <div id="mentions" class="scroll-mt-28 mt-16 border-t border-hairline-2 pt-16">
          <SectionLabel code="B" label="Mentions légales" />
          <h2
            use:reveal={{ y: 20, delay: 0.05 }}
            class="mt-5 max-w-[65ch] font-sans text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.02em] text-ink md:text-[2.6rem]"
          >
            Mentions légales
          </h2>

          <dl class="mt-8 space-y-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2">
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Éditeur du site</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                {SITE.name}
              </dd>
            </div>
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Adresse</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                {SITE.address.street}, {SITE.address.city} ({SITE.address.province}) {SITE.address.postal}, {SITE.address.country}
              </dd>
            </div>
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Contact</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                <a href={SITE.phoneHref} class="transition-colors hover:text-terracotta">{SITE.phone}</a>
                · <a href={`mailto:${SITE.email}`} class="transition-colors hover:text-terracotta">{SITE.email}</a>
              </dd>
            </div>
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Hébergement</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                Site hébergé par Cloudflare, Inc. — 101 Townsend Street, San Francisco, CA 94107, États-Unis.
              </dd>
            </div>
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Propriété intellectuelle</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                L'ensemble du contenu de ce site (textes, marque, mise en page) est © {SITE.name}. Toute reproduction sans autorisation est interdite.
              </dd>
            </div>
            <div class="bg-surface px-5 py-4">
              <dt class="tech-label text-ink-mute">Photos</dt>
              <dd class="mt-1.5 text-[0.95rem] leading-relaxed text-ink">
                Les images présentées sont illustratives et peuvent différer des lieux et chambres réservés.
              </dd>
            </div>
          </dl>
        </div>

        <!-- ===== C · Politique de confidentialité ===== -->
        <div
          id="confidentialite"
          class="scroll-mt-28 mt-16 border-t border-hairline-2 pt-16"
        >
          <SectionLabel code="C" label="Politique de confidentialité" />
          <h2
            use:reveal={{ y: 20, delay: 0.05 }}
            class="mt-5 max-w-[65ch] font-sans text-[1.9rem] font-semibold leading-[1.08] tracking-[-0.02em] text-ink md:text-[2.6rem]"
          >
            Protection de vos renseignements
          </h2>
          <p
            use:reveal={{ y: 16, delay: 0.1 }}
            class="mt-4 max-w-[65ch] text-base leading-relaxed text-ink-soft"
          >
            On collecte le strict nécessaire pour gérer votre séjour, rien de
            plus. Conforme à la loi québécoise.
          </p>

          {#each PRIVACY as section (section.code)}
            <div
              use:reveal={{ y: 18 }}
              class="mt-8 border-t border-hairline-2 pt-8"
            >
              <div class="flex items-baseline gap-4">
                <span
                  class="shrink-0 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-terracotta"
                  >{section.code}</span
                >
                <h3 class="font-sans text-xl font-semibold tracking-[-0.01em] text-ink">
                  {section.title}
                </h3>
              </div>
              <ul class="mt-4 space-y-3 pl-[3.1rem]">
                {#each section.items as item, i (i)}
                  <li class="flex items-start gap-3 max-w-[65ch]">
                    <span
                      class="mt-[0.5rem] h-1.5 w-1.5 shrink-0 bg-terracotta"
                      aria-hidden="true"
                    ></span>
                    <span class="text-[0.95rem] leading-relaxed text-ink-soft"
                      >{item}</span
                    >
                  </li>
                {/each}
              </ul>
            </div>
          {/each}

          <p
            use:reveal={{ y: 14 }}
            class="mt-8 max-w-[65ch] border-t border-hairline-2 pt-8 text-[0.95rem] leading-relaxed text-ink-soft"
          >
            Pour exercer vos droits d'accès, de rectification ou de suppression,
            écrivez-nous à
            <a
              href={`mailto:${SITE.email}`}
              class="font-medium text-ink underline decoration-1 underline-offset-[4px] decoration-hairline transition-colors hover:text-terracotta hover:decoration-terracotta"
              >{SITE.email}</a
            >.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===================== CLOSING STRIP ===================== -->
<section class="border-t border-hairline-2 bg-surface-2">
  <div class="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-20">
    <div
      use:reveal={{ y: 18 }}
      class="flex flex-col items-start gap-6 rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-2 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10"
    >
      <div class="max-w-[65ch]">
        <span class="tech-label text-terracotta">Besoin d'une précision</span>
        <h2
          class="mt-3 font-sans text-2xl font-semibold tracking-[-0.01em] text-ink md:text-3xl"
        >
          Une question sur nos conditions&nbsp;?
        </h2>
        <p class="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
          On répond en personne, sans détour. Appelez ou écrivez-nous.
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-start gap-4 md:items-end">
        <a
          href={SITE.phoneHref}
          class="font-sans text-2xl font-semibold tracking-[-0.01em] text-ink transition-colors hover:text-terracotta md:text-3xl"
          >{SITE.phone}</a
        >
        <Button href="/contact" variant="secondary">Nous écrire</Button>
      </div>
    </div>
  </div>
</section>
