<script lang="ts">
  import type { Room } from "../content";
  import ImagePanel from "./ImagePanel.svelte";

  let { room }: { room: Room } = $props();
</script>

<article
  class="group flex h-full flex-col overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-surface-container-lowest transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-terracotta hover:shadow-[0_18px_40px_-24px_rgba(27,28,28,0.5)]"
  style="--color-surface-container-lowest:#ffffff"
>
  <ImagePanel
    seed={room.seed}
    code={room.code}
    ratio="16 / 11"
    alt={room.name}
    class="group"
  />

  <div class="flex flex-1 flex-col p-5 md:p-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <span class="tech-label text-ink-mute">{room.kind}</span>
        <h3
          class="mt-1.5 font-sans text-[1.4rem] font-semibold leading-tight tracking-[-0.01em] text-ink"
        >
          {room.name}
        </h3>
      </div>
      <span
        class="shrink-0 rounded-[var(--radius-blueprint)] bg-surface-3 px-2.5 py-1 font-mono text-[0.7rem] font-medium text-ink-soft"
      >
        {room.code}
      </span>
    </div>

    <p class="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">{room.blurb}</p>

    <dl
      class="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-blueprint)] border border-hairline-2 bg-hairline-2 text-center"
    >
      <div class="bg-surface px-2 py-3">
        <dt class="tech-label text-ink-mute">Capacité</dt>
        <dd class="mt-1 text-sm font-medium text-ink">{room.capacity}</dd>
      </div>
      <div class="bg-surface px-2 py-3">
        <dt class="tech-label text-ink-mute">Couchage</dt>
        <dd class="mt-1 text-sm font-medium text-ink">{room.beds}</dd>
      </div>
      <div class="bg-surface px-2 py-3">
        <dt class="tech-label text-ink-mute">Surface</dt>
        <dd class="mt-1 text-sm font-medium text-ink">{room.size}</dd>
      </div>
    </dl>

    <ul class="mt-5 space-y-2">
      {#each room.specs as spec (spec)}
        <li class="flex items-start gap-2.5 text-sm text-ink-soft">
          <span
            class="mt-[7px] h-1.5 w-1.5 shrink-0 bg-terracotta"
            aria-hidden="true"
          ></span>
          {spec}
        </li>
      {/each}
    </ul>

    <div
      class="mt-6 flex items-end justify-between border-t border-hairline-2 pt-4"
    >
      <div>
        <span class="tech-label text-ink-mute">Dès</span>
        <p class="font-sans text-2xl font-semibold tracking-[-0.01em] text-ink">
          {room.priceFrom} $<span class="text-sm font-normal text-ink-mute"
            >/nuit</span
          >
        </p>
      </div>
      <span
        class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-terracotta transition-transform duration-300 group-hover:translate-x-1"
      >
        Réserver →
      </span>
    </div>
  </div>
</article>
