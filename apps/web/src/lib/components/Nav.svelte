<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { NAV, SITE } from "../content";
  import Wordmark from "./Wordmark.svelte";

  let scrolled = $state(false);
  let open = $state(false);
  let user = $state(null as any | null);

  onMount(() => {
    const onScroll = () => (scrolled = window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
      })
      .then((data) => {
        if (data?.user) user = data.user;
      })
      .catch(() => {});

    return () => window.removeEventListener("scroll", onScroll);
  });

  // Close the mobile menu whenever the route changes.
  $effect(() => {
    void $page.url.pathname;
    open = false;
  });

  const isActive = (href: string, current: string) =>
    href === "/" ? current === "/" : current.startsWith(href);
</script>

<header
  class="fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] {scrolled ||
  open
    ? 'border-b border-hairline-2 bg-surface/90 backdrop-blur-md'
    : 'border-b border-transparent bg-transparent'}"
>
  <div
    class="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-3.5 md:px-10"
  >
    <a href="/" class="flex items-center gap-3" aria-label={SITE.name}>
      <Wordmark class="h-9 w-9 text-terracotta" />
      <span class="hidden leading-none sm:block">
        <span
          class="block font-sans text-[0.95rem] font-semibold tracking-[-0.01em] text-ink"
          >L'Auberge du Vieux Pont</span
        >
        <span class="tech-label mt-0.5 block text-ink-mute"
          >EST. {SITE.established} · Saint-Raymond</span
        >
      </span>
    </a>

    <nav class="hidden items-center gap-1 lg:flex">
      {#each NAV as item (item.href)}
        <a
          href={item.href}
          class="group relative flex items-center gap-2 px-4 py-2 transition-colors"
        >
          <span
            class="font-mono text-[0.6rem] {isActive(item.href, $page.url.pathname)
              ? 'text-terracotta'
              : 'text-ink-mute'}">{item.code}</span
          >
          <span
            class="text-sm font-medium {isActive(item.href, $page.url.pathname)
              ? 'text-terracotta'
              : 'text-ink hover:text-terracotta'} transition-colors"
            >{item.label}</span
          >
          {#if isActive(item.href, $page.url.pathname)}
            <span
              class="absolute inset-x-3 -bottom-px h-[3px] bg-terracotta"
              aria-hidden="true"
            ></span>
          {/if}
        </a>
      {/each}
      {#if !user}
        <a
          href="/connexion"
          data-testid="nav-connexion-link"
          class="group relative flex items-center gap-2 px-4 py-2 transition-colors"
        >
          <span class="text-sm font-medium text-ink hover:text-terracotta transition-colors"
            >Connexion</span
          >
        </a>
      {/if}
      {#if user}
        {#if user.role === "admin"}
          <a
            href="/admin"
            data-testid="nav-admin-link"
            class="group relative flex items-center gap-2 px-4 py-2 transition-colors"
          >
            <span
              class="text-sm font-medium {isActive('/admin', $page.url.pathname)
                ? 'text-terracotta'
                : 'text-ink hover:text-terracotta'} transition-colors"
              >Admin</span
            >
            {#if isActive('/admin', $page.url.pathname)}
              <span
                class="absolute inset-x-3 -bottom-px h-[3px] bg-terracotta"
                aria-hidden="true"
              ></span>
            {/if}
          </a>
        {:else}
          <a
            href="/profil"
            data-testid="nav-profil-link"
            class="group relative flex items-center gap-2 px-4 py-2 transition-colors"
          >
            <span
              class="text-sm font-medium {isActive('/profil', $page.url.pathname)
                ? 'text-terracotta'
                : 'text-ink hover:text-terracotta'} transition-colors"
              >Profil</span
            >
            {#if isActive('/profil', $page.url.pathname)}
              <span
                class="absolute inset-x-3 -bottom-px h-[3px] bg-terracotta"
                aria-hidden="true"
              ></span>
            {/if}
          </a>
        {/if}
      {/if}
    </nav>

    <div class="flex items-center gap-3">
      <a
        href={SITE.phoneHref}
        class="tech-label hidden text-ink-soft transition-colors hover:text-terracotta xl:block"
        >{SITE.phone}</a
      >
      <a
        href="/contact"
        class="hidden rounded-[var(--radius-blueprint)] bg-terracotta px-5 py-2.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-terracotta-bright md:inline-flex"
        >Réserver</a
      >

      <button
        class="flex h-11 w-11 flex-col items-center justify-center gap-[5px] lg:hidden"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        onclick={() => (open = !open)}
      >
        <span
          class="h-[2px] w-6 bg-ink transition-all duration-300 {open
            ? 'translate-y-[7px] rotate-45'
            : ''}"
        ></span>
        <span
          class="h-[2px] w-6 bg-ink transition-all duration-300 {open
            ? 'opacity-0'
            : ''}"
        ></span>
        <span
          class="h-[2px] w-6 bg-ink transition-all duration-300 {open
            ? '-translate-y-[7px] -rotate-45'
            : ''}"
        ></span>
      </button>
    </div>
  </div>

  <!-- Mobile menu -->
  <div
    class="overflow-hidden border-t border-hairline-2 bg-surface transition-[max-height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden {open
      ? 'max-h-[28rem]'
      : 'max-h-0 border-t-transparent'}"
  >
    <nav class="flex flex-col px-5 py-3">
      {#each NAV as item (item.href)}
        <a
          href={item.href}
          class="flex items-center justify-between border-b border-hairline-2 py-4 last:border-b-0"
        >
          <span class="flex items-center gap-3">
            <span class="font-mono text-[0.65rem] text-terracotta">{item.code}</span>
            <span
              class="text-lg font-medium {isActive(item.href, $page.url.pathname)
                ? 'text-terracotta'
                : 'text-ink'}">{item.label}</span
            >
          </span>
          <span class="text-ink-mute">→</span>
        </a>
      {/each}
      {#if !user}
        <a
          href="/connexion"
          data-testid="nav-connexion-link-mobile"
          class="flex items-center justify-between border-b border-hairline-2 py-4"
        >
          <span class="text-lg font-medium text-ink">Connexion</span>
          <span class="text-ink-mute">→</span>
        </a>
      {/if}
      {#if user}
        {#if user.role === "admin"}
          <a
            href="/admin"
            data-testid="nav-admin-link-mobile"
            class="flex items-center justify-between border-b border-hairline-2 py-4 last:border-b-0"
          >
            <span
              class="text-lg font-medium {isActive('/admin', $page.url.pathname)
                ? 'text-terracotta'
                : 'text-ink'}"
              >Admin</span
            >
            <span class="text-ink-mute">→</span>
          </a>
        {:else}
          <a
            href="/profil"
            data-testid="nav-profil-link-mobile"
            class="flex items-center justify-between border-b border-hairline-2 py-4 last:border-b-0"
          >
            <span
              class="text-lg font-medium {isActive('/profil', $page.url.pathname)
                ? 'text-terracotta'
                : 'text-ink'}"
              >Profil</span
            >
            <span class="text-ink-mute">→</span>
          </a>
        {/if}
      {/if}
      <a
        href="/contact"
        class="mt-4 rounded-[var(--radius-blueprint)] bg-terracotta px-5 py-3.5 text-center font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white"
        >Réserver une chambre</a
      >
    </nav>
  </div>
</header>
