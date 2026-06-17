<script lang="ts">
  import type { Component } from "svelte";
  import { path } from "./lib/router";
  import Nav from "./lib/components/Nav.svelte";
  import Footer from "./lib/components/Footer.svelte";
  import Home from "./routes/Home.svelte";
  import Rooms from "./routes/Rooms.svelte";
  import Attractions from "./routes/Attractions.svelte";
  import About from "./routes/About.svelte";
  import Contact from "./routes/Contact.svelte";
  import Policy from "./routes/Policy.svelte";
  import NotFound from "./routes/NotFound.svelte";

  const routes: Record<string, Component> = {
    "/": Home,
    "/chambres": Rooms,
    "/attraits": Attractions,
    "/a-propos": About,
    "/contact": Contact,
    "/politique": Policy,
  };

  const Current = $derived(routes[$path] ?? NotFound);
</script>

<Nav />

<main id="main">
  {#key $path}
    <div class="page-enter">
      <Current />
    </div>
  {/key}
</main>

<Footer />

<style>
  @keyframes page-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .page-enter {
    animation: page-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .page-enter {
      animation: none;
    }
  }
</style>
