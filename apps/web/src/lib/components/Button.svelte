<script lang="ts">
  import type { Snippet } from "svelte";
  import { link } from "../router";

  let {
    href = undefined,
    type = "button",
    variant = "primary",
    block = false,
    class: klass = "",
    onclick = undefined,
    children,
  }: {
    href?: string;
    type?: "button" | "submit";
    variant?: "primary" | "secondary" | "ghost";
    block?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const base =
    "group inline-flex items-center justify-center gap-2.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none";

  const variants = {
    primary:
      "rounded-[var(--radius-blueprint)] bg-terracotta px-6 py-3.5 text-white hover:bg-terracotta-bright hover:-translate-y-0.5 active:translate-y-0",
    secondary:
      "rounded-[var(--radius-blueprint)] border-2 border-ink px-6 py-3 text-ink hover:bg-ink hover:text-surface",
    ghost:
      "px-1 py-1 text-ink underline decoration-1 underline-offset-[6px] decoration-hairline hover:decoration-terracotta hover:text-terracotta",
  } as const;

  const cls = $derived(
    `${base} ${variants[variant]} ${block ? "w-full" : ""} ${klass}`,
  );
</script>

{#if href}
  <a {href} use:link class={cls} {onclick}>{@render children()}</a>
{:else}
  <button {type} class={cls} {onclick}>{@render children()}</button>
{/if}
