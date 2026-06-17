<script lang="ts">
  import Button from "../lib/components/Button.svelte";
  import Contour from "../lib/components/Contour.svelte";
</script>

<section
  class="relative flex min-h-screen items-center overflow-hidden bg-surface"
>
  <Contour
    class="pointer-events-none absolute -right-20 top-10 h-[40rem] w-[40rem] text-outline/15"
  />
  <div class="mx-auto max-w-[1280px] px-5 py-32 md:px-10">
    <span class="tech-label text-terracotta">Erreur · 404</span>
    <h1
      class="mt-6 max-w-3xl font-sans text-[3rem] font-semibold leading-[1.02] tracking-[-0.02em] text-ink md:text-[5rem]"
    >
      Hors-piste.
    </h1>
    <p class="mt-6 max-w-xl text-lg text-ink-soft">
      Ce sentier n'existe pas sur notre carte. Revenez au point de départ et
      reprenez la route.
    </p>
    <div class="mt-9">
      <Button href="/" variant="primary">Retour à l'accueil</Button>
    </div>
  </div>
</section>
