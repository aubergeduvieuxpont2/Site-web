<script lang="ts">
  import { onMount } from "svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Seo from "$lib/components/Seo.svelte";

  // ── Types ──────────────────────────────────────────────────────────────────
  interface PublicReview {
    id: number;
    displayName: string;
    rating: number;
    body: string;
    staysCount: number;
    nightsTotal: number;
    createdAt: string;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let reviews = $state<PublicReview[]>([]);
  let averageRating = $state<number | null>(null);
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function stars(rating: number): string {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function starsPartial(avg: number): string {
    const full = Math.floor(avg);
    const half = avg - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function pluralSejours(n: number): string {
    return n === 1 ? "1 séjour" : `${n} séjours`;
  }

  function pluralNuits(n: number): string {
    return n === 1 ? "1 nuit" : `${n} nuits`;
  }

  // ── Load all approved reviews ──────────────────────────────────────────────
  onMount(async () => {
    try {
      const res = await fetch("/api/reviews", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        error = data.error ?? `Erreur ${res.status}`;
        return;
      }
      const data = await res.json();
      reviews = data.reviews ?? [];
      averageRating = data.averageRating ?? null;
      total = data.total ?? 0;
    } catch {
      error = "Réseau indisponible";
    } finally {
      loading = false;
    }
  });
</script>

<div class="page-avis" data-testid="page-avis">
  <!-- Header -->
  <div class="page-avis__header">
    <div class="page-avis__header-inner">
      <SectionLabel text="Avis des clients" showHairline={false} />
      <h1 class="page-avis__title" data-testid="avis-title">Témoignages</h1>

      {#if averageRating !== null && total > 0}
        <div class="page-avis__average" data-testid="avis-average">
          <span
            class="page-avis__average-stars"
            aria-label="Note moyenne : {averageRating.toFixed(1)} sur 5"
            data-testid="avis-average-stars"
          >
            {starsPartial(averageRating)}
          </span>
          <span class="page-avis__average-value" data-testid="avis-average-value">
            {averageRating.toFixed(1)}/5
          </span>
          <span class="page-avis__average-count" data-testid="avis-total">
            ({total} {total === 1 ? "avis" : "avis"})
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="page-avis__content">
    {#if loading}
      <div class="page-avis__loading" aria-busy="true" aria-label="Chargement des avis…" data-testid="avis-loading">
        <span class="page-avis__spinner" aria-hidden="true"></span>
      </div>
    {:else if error}
      <div class="page-avis__error" role="alert" data-testid="avis-error">
        {error}
      </div>
    {:else if reviews.length === 0}
      <div class="page-avis__empty" data-testid="avis-empty">
        <p>Aucun avis pour le moment. Revenez bientôt.</p>
      </div>
    {:else}
      <div class="page-avis__list" data-testid="avis-list">
        {#each reviews as review (review.id)}
          <article
            class="page-avis__card"
            data-testid="avis-card"
            aria-label="Avis de {review.displayName}"
          >
            <header class="page-avis__card-header">
              <span
                class="page-avis__card-stars"
                aria-label="Note : {review.rating} sur 5"
                data-testid="avis-card-stars"
              >
                {stars(review.rating)}
              </span>

              <div class="page-avis__card-meta">
                <span class="page-avis__card-name" data-testid="avis-card-name">
                  {review.displayName}
                </span>
                <span class="page-avis__card-meta-sep" aria-hidden="true">·</span>
                <span class="page-avis__card-stays" data-testid="avis-card-stays">
                  {pluralSejours(review.staysCount)}
                </span>
                <span class="page-avis__card-meta-sep" aria-hidden="true">·</span>
                <span class="page-avis__card-nights" data-testid="avis-card-nights">
                  {pluralNuits(review.nightsTotal)}
                </span>
                <span class="page-avis__card-meta-sep" aria-hidden="true">·</span>
                <time
                  class="page-avis__card-date"
                  datetime={review.createdAt}
                  data-testid="avis-card-date"
                >
                  {formatDate(review.createdAt)}
                </time>
              </div>
            </header>

            <p class="page-avis__card-body" data-testid="avis-card-body">
              {review.body}
            </p>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>

<Seo
  title="Avis des clients — Auberge du Vieux Pont"
  description="Lisez les témoignages de nos clients sur leur séjour à l'Auberge du Vieux Pont à Saint-Raymond."
  path="/avis"
/>

<style>
  /* ── Page layout ──────────────────────────────────────────────────────────── */
  .page-avis {
    min-height: 60vh;
  }

  /* ── Header ───────────────────────────────────────────────────────────────── */
  .page-avis__header {
    background-color: var(--color-surface, #f7f9fb);
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
    padding: var(--space-3xl, 4rem) var(--space-md, 1.25rem) var(--space-2xl, 2.5rem);
  }

  .page-avis__header-inner {
    max-width: 860px;
    margin-inline: auto;
  }

  .page-avis__title {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-weight: 300;
    font-size: clamp(36px, 5vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink, #191c1e);
    margin: var(--space-md, 1.25rem) 0 0;
  }

  /* ── Average rating ──────────────────────────────────────────────────────── */
  .page-avis__average {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm, 0.75rem);
    margin-top: var(--space-lg, 1.75rem);
  }

  .page-avis__average-stars {
    font-size: 22px;
    color: var(--color-secondary, #9d4300);
    letter-spacing: 2px;
  }

  .page-avis__average-value {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 20px;
    font-weight: 600;
    color: var(--color-ink, #191c1e);
  }

  .page-avis__average-count {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
    color: var(--color-ink-variant, #45464d);
  }

  /* ── Content area ─────────────────────────────────────────────────────────── */
  .page-avis__content {
    max-width: 860px;
    margin-inline: auto;
    padding: var(--space-2xl, 2.5rem) var(--space-md, 1.25rem) var(--space-3xl, 4rem);
  }

  /* ── Loading / error / empty ──────────────────────────────────────────────── */
  .page-avis__loading {
    display: flex;
    justify-content: center;
    padding: 60px;
  }

  .page-avis__spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-outline-variant, #c6c6cd);
    border-top-color: var(--color-secondary, #9d4300);
    border-radius: 50%;
    animation: avis-spin 0.7s linear infinite;
  }

  @keyframes avis-spin {
    to { transform: rotate(360deg); }
  }

  .page-avis__error {
    padding: 16px;
    background-color: #fce8e8;
    border: 1px solid var(--color-error, #ba1a1a);
    border-radius: 3px;
    color: var(--color-error, #ba1a1a);
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
  }

  .page-avis__empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--color-ink-variant, #45464d);
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 16px;
  }

  /* ── Review list ──────────────────────────────────────────────────────────── */
  .page-avis__list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid var(--color-outline-variant, #c6c6cd);
  }

  .page-avis__card {
    padding: var(--space-xl, 2rem) 0;
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
  }

  .page-avis__card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-md, 1.25rem);
    margin-bottom: var(--space-md, 1.25rem);
  }

  .page-avis__card-stars {
    font-size: 16px;
    color: var(--color-secondary, #9d4300);
    letter-spacing: 2px;
    flex-shrink: 0;
  }

  .page-avis__card-meta {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-mute, #76777d);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .page-avis__card-name {
    font-weight: 600;
    color: var(--color-ink, #191c1e);
    text-transform: none;
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
    letter-spacing: 0;
  }

  .page-avis__card-meta-sep {
    color: var(--color-outline-variant, #c6c6cd);
  }

  .page-avis__card-body {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-variant, #45464d);
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  /* ── Responsive ───────────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .page-avis__card-header {
      flex-direction: column;
      gap: var(--space-sm, 0.75rem);
    }

    .page-avis__card-meta {
      flex-wrap: wrap;
    }
  }
</style>
