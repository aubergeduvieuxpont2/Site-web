<script lang="ts">
  import { POLICIES } from "$lib/content";
  import { t } from "$lib/i18n.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Contour from "$lib/components/Contour.svelte";
  import Seo from "$lib/components/Seo.svelte";
  import { breadcrumbSchema } from "$lib/seo";

  function codeToKey(code: string): string {
    return code.replace('-', '').toLowerCase();
  }
</script>

<section class="page-politiques bg-surface">
  <!-- Header area with SectionLabel + page title -->
  <div class="header" data-testid="politiques-header">
    <SectionLabel text={t('politiques.label')} showHairline={true} />
    <h1 class="page-title">{t('politiques.heading')}</h1>
    <p class="lead-text">{t('politiques.lead')}</p>
  </div>

  <!-- Contour divider -->
  <Contour number="01" width="contained" />

  <!-- Content sections loop -->
  <div class="content-area">
    {#each POLICIES as section, idx (section.code)}
      <section class="policy-section" data-testid={`policy-section-${section.code}`}>
        <div class="section-head">
          <span class="section-code" aria-hidden="true">{section.code}</span>
          <h2 class="section-title">{t('policies.' + codeToKey(section.code) + '.title')}</h2>
        </div>
        <ul class="item-list">
          {#each section.items.map((_, idx) => idx) as i (i)}
            <li class="item" data-testid={`policy-item-${section.code}-${i}`}>
              <span class="bullet" aria-hidden="true"></span>
              <span class="item-text">{t('policies.' + codeToKey(section.code) + '.i' + i)}</span>
            </li>
          {/each}
        </ul>
        {#if idx < POLICIES.length - 1}
          <Contour width="contained" />
        {/if}
      </section>
    {/each}
  </div>
</section>

<style>
  .page-politiques {
    --space-section: var(--space-3xl);
    --space-item-gap: var(--space-md);
  }

  .page-politiques .header {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-2xl) var(--space-md);
  }

  @media (min-width: 768px) {
    .page-politiques .header {
      padding: var(--space-3xl) var(--space-lg);
    }
  }

  .page-politiques .page-title {
    font-family: var(--font-sans);
    font-size: 2rem;
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin-top: var(--space-lg);
  }

  @media (min-width: 768px) {
    .page-politiques .page-title {
      font-size: 2.8rem;
    }
  }

  .page-politiques .lead-text {
    font-family: var(--font-sans);
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin-top: var(--space-lg);
    max-width: 65ch;
  }

  .page-politiques .content-area {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 var(--space-md);
  }

  @media (min-width: 768px) {
    .page-politiques .content-area {
      padding: 0 var(--space-lg);
    }
  }

  .page-politiques .policy-section {
    border-top: 1px solid var(--color-outline-variant);
    padding-top: var(--space-2xl);
    margin-top: var(--space-2xl);
  }

  .page-politiques .policy-section:first-child {
    border-top: none;
    margin-top: var(--space-xl);
  }

  .page-politiques .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-md);
  }

  .page-politiques .section-code {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant);
    flex-shrink: 0;
  }

  .page-politiques .section-title {
    font-family: var(--font-sans);
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--color-ink);
  }

  .page-politiques .item-list {
    list-style: none;
    margin: var(--space-md) 0 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-politiques .item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
    max-width: 65ch;
  }

  .page-politiques .bullet {
    display: inline-block;
    width: 6px;
    height: 6px;
    background-color: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 0.5rem;
  }

  .page-politiques .item-text {
    font-family: var(--font-sans);
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
  }
</style>

<Seo
  title={t('politiques.seo.title')}
  description={t('politiques.seo.description')}
  path="/politiques"
  schema={[
    breadcrumbSchema([
      { name: t('nav.home'), path: "/" },
      { name: t('politiques.label'), path: "/politiques" },
    ]),
  ]}
/>
