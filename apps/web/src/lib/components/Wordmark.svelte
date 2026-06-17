<script lang="ts">
  /** Brand glyph: a stylized old stone bridge (le vieux pont) arch + river. */
  let { class: klass = "" }: { class?: string } = $props();
</script>

<svg
  class={klass}
  viewBox="0 0 48 48"
  fill="none"
  aria-hidden="true"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    x="1.5"
    y="1.5"
    width="45"
    height="45"
    rx="4"
    stroke="currentColor"
    stroke-width="1.5"
    opacity="0.25"
  />
  <!-- deck -->
  <path d="M6 19h36" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  <!-- main arch -->
  <path
    d="M9 30a15 9 0 0 1 30 0"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
  />
  <!-- piers -->
  <path d="M9 19v11M39 19v11M24 19v4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
  <!-- water lines -->
  <path d="M7 37h12M21 37h6M29 37h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55" />
  <path d="M7 41h8M19 41h10M33 41h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3" />
</svg>
