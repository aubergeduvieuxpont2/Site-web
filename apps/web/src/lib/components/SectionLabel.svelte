<script lang="ts">
  import { reveal } from "../motion";

  let {
    code = "",
    label = "",
    align = "left",
  }: {
    code?: string;
    label?: string;
    align?: "left" | "center";
  } = $props();
</script>

<div
  use:reveal={{ y: 14, duration: 0.6 }}
  class="flex items-center gap-3 {align === 'center' ? 'justify-center' : ''}"
>
  {#if code}
    <span class="tech-label text-terracotta">{code}</span>
    <span class="h-px w-8 bg-hairline" aria-hidden="true"></span>
  {/if}
  <span class="tech-label text-ink-soft">{label}</span>
</div>
