<script lang="ts">
  import { PRIVACY, SITE } from "$lib/content";
  import { t } from "$lib/i18n.svelte";
  import { settings } from "$lib/settings.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Contour from "$lib/components/Contour.svelte";
  import Seo from "$lib/components/Seo.svelte";
  import { breadcrumbSchema } from "$lib/seo";

  // Replace the static SITE.email in any translated item text with the
  // admin-configured address so the page never shows a stale one.
  function withConfiguredEmail(item: string): string {
    return item.replace(SITE.email, settings.contactEmail || SITE.email);
  }
</script>

<section class="page-confidentialite bg-surface">
  <!-- Header area with SectionLabel + page title -->
  <div class="header" data-testid="confidentialite-header">
    <SectionLabel text={t('confidentialite.sectionLabel')} showHairline={true} />
    <h1 class="page-title">{t('confidentialite.heading')}</h1>
    <p class="lead-text">{t('confidentialite.lead')}</p>
  </div>

  <!-- Contour divider -->
  <Contour number="01" width="contained" />

  <!-- Content sections loop -->
  <div class="content-area">
    {#each PRIVACY as section (section.code)}
      <section class="policy-section" data-testid={`privacy-section-${section.code}`}>
        <div class="section-head">
          <span class="section-code" aria-hidden="true">{section.code}</span>
          <h2 class="section-title">{t('privacy.' + section.code + '.title')}</h2>
        </div>
        <ul class="item-list">
          {#each section.items.map((_, i) => i) as idx (idx)}
            <li class="item" data-testid={`privacy-item-${section.code}-${idx}`}>
              <span class="bullet" aria-hidden="true"></span>
              <span class="item-text">{withConfiguredEmail(t('privacy.' + section.code + '.items.' + idx))}</span>
            </li>
          {/each}
        </ul>
        <Contour width="contained" />
      </section>
    {/each}
  </div>

  <!-- Closing CTA section -->
  <div class="closing-strip" data-testid="confidentialite-closing">
    <span class="section-code">C-04</span>
    <h2 class="closing-title">{t('confidentialite.closing.title')}</h2>
    <p class="closing-text">{t('confidentialite.closing.text')}</p>
    <a href={`mailto:${SITE.email}`} class="email-link">
      {SITE.email}
    </a>
  </div>
</section>

<style>
  .page-confidentialite {
    --space-section: var(--space-3xl);
    --space-item-gap: var(--space-md);
  }

  .page-confidentialite .header {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-md);
  }

  @media (min-width: 768px) {
    .page-confidentialite .header {
      padding: var(--space-3xl) var(--space-lg);
    }
  }

  .page-confidentialite .page-title {
    font-family: var(--font-sans);
    font-size: 2rem;
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin-top: var(--space-lg);
  }

  @media (min-width: 768px) {
    .page-confidentialite .page-title {
      font-size: 2.8rem;
    }
  }

  .page-confidentialite .lead-text {
    font-family: var(--font-sans);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin-top: var(--space-lg);
    max-width: 65ch;
  }

  .page-confidentialite .content-area {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 var(--space-md);
  }

  @media (min-width: 768px) {
    .page-confidentialite .content-area {
      padding: 0 var(--space-lg);
    }
  }

  .page-confidentialite .policy-section {
    border-top: 1px solid var(--color-outline-variant);
    padding-top: var(--space-2xl);
    margin-top: var(--space-2xl);
  }

  .page-confidentialite .policy-section:first-child {
    border-top: none;
    margin-top: var(--space-xl);
  }

  .page-confidentialite .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
  }

  .page-confidentialite .section-code {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant);
    flex-shrink: 0;
  }

  .page-confidentialite .section-title {
    font-family: var(--font-sans);
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--color-ink);
  }

  .page-confidentialite .item-list {
    list-style: none;
    margin: var(--space-md) 0 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-confidentialite .item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    max-width: 65ch;
  }

  .page-confidentialite .bullet {
    display: inline-block;
    width: 6px;
    height: 6px;
    background-color: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 0.5rem;
  }

  .page-confidentialite .item-text {
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
  }

  .page-confidentialite .closing-strip {
    max-width: 1100px;
    margin: var(--space-3xl) auto 0;
    padding: var(--space-2xl) var(--space-md);
    border-top: 1px solid var(--color-outline-variant);
  }

  @media (min-width: 768px) {
    .page-confidentialite .closing-strip {
      padding: var(--space-2xl) var(--space-lg);
    }
  }

  .page-confidentialite .closing-title {
    font-family: var(--font-sans);
    font-size: 1.5rem;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin-top: var(--space-md);
  }

  .page-confidentialite .closing-text {
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin-top: var(--space-sm);
    max-width: 65ch;
  }

  .page-confidentialite .email-link {
    display: inline-block;
    font-family: var(--font-sans);
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
    text-decoration-color: var(--color-outline);
    margin-top: var(--space-lg);
    transition: color 150ms ease, text-decoration-color 150ms ease;
  }

  .page-confidentialite .email-link:hover {
    color: var(--color-secondary);
    text-decoration-color: var(--color-secondary);
  }

  .page-confidentialite .email-link:focus {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-confidentialite .email-link {
      transition: none;
    }
  }
</style>

<Seo
  title={t('confidentialite.seo.title')}
  description={t('confidentialite.seo.description')}
  path="/confidentialite"
  schema={[
    breadcrumbSchema([
      { name: t('nav.home'), path: "/" },
      { name: t('confidentialite.sectionLabel'), path: "/confidentialite" },
    ]),
  ]}
/>
