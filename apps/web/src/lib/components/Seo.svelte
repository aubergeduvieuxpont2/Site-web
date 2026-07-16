<script lang="ts">
  /**
   * Per-page head: title, unique meta description, canonical URL, Open Graph +
   * Twitter cards, and any JSON-LD structured data. Rendering this in a page's
   * markup (not just `<svelte:head><title>`) is what gives each route its own
   * crawlable, shareable, machine-readable metadata.
   *
   * `path` is passed explicitly (rather than read from a store) so the output
   * is deterministic under prerender and trivially unit-testable.
   */
  import { SITE } from "$lib/content";
  import { canonical, OG_IMAGE, type JsonLd } from "$lib/seo";

  let {
    title,
    description,
    path,
    image = OG_IMAGE,
    noindex = false,
    schema = [],
  }: {
    title: string;
    description: string;
    path: string;
    image?: string;
    noindex?: boolean;
    schema?: JsonLd[];
  } = $props();

  const url = $derived(canonical(path));

  // Serialize JSON-LD safely for inlining inside a script element: escaping
  // the "less-than" character prevents a closing-tag sequence in any string
  // from terminating the tag early. split/join avoids a regex literal that the
  // Svelte script parser mis-tokenizes.
  const LT = String.fromCharCode(60);
  function ld(data: JsonLd): string {
    return JSON.stringify(data).split(LT).join("\\u003c");
  }
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />
  {#if noindex}
    <meta name="robots" content="noindex, follow" />
  {/if}

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE.name} />
  <meta property="og:locale" content="fr_CA" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={image} />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />

  <!-- Structured data -->
  {#each schema as data}
    {@html `${LT}script type="application/ld+json">${ld(data)}${LT}/script>`}
  {/each}
</svelte:head>
