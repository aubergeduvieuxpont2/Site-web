<script lang="ts">
  import type { Snippet } from "svelte";
  import { reveal } from "../motion";
  import Contour from "./Contour.svelte";

  let {
    code,
    kicker,
    title,
    lead = undefined,
    children = undefined,
  }: {
    code: string;
    kicker: string;
    title: string;
    lead?: string;
    children?: Snippet;
  } = $props();
</script>

<header class="relative overflow-hidden border-b border-hairline-2 bg-surface-2">
  <Contour
    class="pointer-events-none absolute -right-24 -top-28 h-[34rem] w-[34rem] text-outline/15"
  />
  <div
    class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-terracotta via-hairline to-transparent"
  ></div>

  <div class="mx-auto max-w-[1280px] px-5 pb-16 pt-28 md:px-10 md:pb-24 md:pt-36">
    <div class="flex items-center gap-3" use:reveal={{ y: 12, duration: 0.5 }}>
      <span class="tech-label text-terracotta">{code}</span>
      <span class="h-px w-10 bg-hairline" aria-hidden="true"></span>
      <span class="tech-label text-ink-soft">{kicker}</span>
    </div>

    <h1
      use:reveal={{ y: 26, delay: 0.08 }}
      class="mt-6 max-w-4xl font-sans text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.02em] text-ink md:text-[4.25rem]"
    >
      {title}
    </h1>

    {#if lead}
      <p
        use:reveal={{ y: 20, delay: 0.16 }}
        class="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft md:text-xl"
      >
        {lead}
      </p>
    {/if}

    {#if children}
      <div use:reveal={{ y: 18, delay: 0.24 }} class="mt-9">
        {@render children()}
      </div>
    {/if}
  </div>
</header>
