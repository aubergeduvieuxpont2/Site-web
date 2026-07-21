<script lang="ts">
  import { onMount } from "svelte";
  import { getPublicReviews, isError, type PublicReview } from "$lib/api";
  import { t } from "$lib/i18n.svelte";

  // ── State ──────────────────────────────────────────────────────────────────
  let reviews = $state<PublicReview[]>([]);
  let loaded = $state(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function stars(rating: number): string {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function excerpt(body: string, max = 200): string {
    if (body.length <= max) return body;
    return body.slice(0, max).trimEnd() + "…";
  }

  function pluralSejours(n: number): string {
    if (n === 1) return t("avis.stayOne");
    return t("avis.stayMany", { n: String(n) });
  }

  function pluralNuits(n: number): string {
    if (n === 1) return t("avis.nightOne");
    return t("avis.nightMany", { n: String(n) });
  }

  // ── Mount: fetch up to 3 approved reviews ─────────────────────────────────
  onMount(async () => {
    const result = await getPublicReviews(3);
    if (!isError(result)) {
      reviews = result.reviews;
    }
    // silent on error — strip hides when unavailable
    loaded = true;
  });
</script>

<!-- Hidden when empty (both during load and when no approved reviews exist) -->
{#if loaded && reviews.length > 0}
  <section
    class="reviews-strip"
    aria-labelledby="reviews-strip-heading"
    data-testid="reviews-strip"
  >
    <div class="reviews-strip__inner">
      <!-- i18n TODO: needs its own dictionary key (suggested `avis.strip.heading`).
           `avis.heading` is "Témoignages" — the /avis page title — not this copy. -->
      <h2 id="reviews-strip-heading" class="reviews-strip__heading" data-testid="reviews-strip-heading">
        Ce que disent nos clients
      </h2>

      <div class="reviews-strip__grid" data-testid="reviews-strip-grid">
        {#each reviews as review (review.id)}
          <div class="reviews-strip__card" data-testid="review-strip-card">
            <span
              class="reviews-strip__stars"
              aria-label={t("avis.card.ratingLabel", { rating: String(review.rating) })}
              data-testid="review-strip-stars"
            >
              {stars(review.rating)}
            </span>

            <p class="reviews-strip__body" data-testid="review-strip-body">
              {excerpt(review.body)}
            </p>

            <p class="reviews-strip__byline" data-testid="review-strip-byline">
              {review.displayName}
              <span class="reviews-strip__byline-sep" aria-hidden="true">·</span>
              {pluralSejours(review.staysCount)}
              <span class="reviews-strip__byline-sep" aria-hidden="true">·</span>
              {pluralNuits(review.nightsTotal)}
            </p>
          </div>
        {/each}
      </div>

      <a href="/avis" class="reviews-strip__all-link" data-testid="reviews-strip-all-link">
        {t("avis.label")} →
      </a>
    </div>
  </section>
{/if}

<style>
  .reviews-strip {
    background-color: var(--color-surface-2, #f2f4f6);
    border-top: 1px solid var(--color-outline-variant, #c6c6cd);
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
    padding: var(--space-3xl, 4rem) var(--space-md, 1.25rem);
  }

  .reviews-strip__inner {
    max-width: 1280px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xl, 2.5rem);
  }

  .reviews-strip__heading {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-weight: 300;
    font-size: clamp(24px, 3vw, 36px);
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink, #191c1e);
    margin: 0;
    text-align: center;
  }

  /* ── Grid ─────────────────────────────────────────────────────────────────── */
  .reviews-strip__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-lg, 1.75rem);
    width: 100%;
  }

  @media (max-width: 900px) {
    .reviews-strip__grid {
      grid-template-columns: 1fr;
      max-width: 560px;
    }
  }

  /* ── Card ────────────────────────────────────────────────────────────────── */
  .reviews-strip__card {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 0.75rem);
    background-color: var(--color-surface, #f7f9fb);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: 3px;
    padding: var(--space-lg, 1.75rem);
  }

  .reviews-strip__stars {
    font-size: 16px;
    color: var(--color-secondary, #9d4300);
    letter-spacing: 2px;
  }

  .reviews-strip__body {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 15px;
    line-height: 1.6;
    color: var(--color-ink-variant, #45464d);
    margin: 0;
    flex: 1;
  }

  .reviews-strip__byline {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-mute, #76777d);
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .reviews-strip__byline-sep {
    color: var(--color-outline-variant, #c6c6cd);
  }

  /* ── "Voir tous" link ─────────────────────────────────────────────────────── */
  .reviews-strip__all-link {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
    font-weight: 500;
    color: var(--color-secondary, #9d4300);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    padding-inline: 4px;
  }

  .reviews-strip__all-link:hover {
    text-decoration: underline;
  }

  .reviews-strip__all-link:focus-visible {
    outline: 2px solid var(--color-secondary, #9d4300);
    outline-offset: 3px;
    border-radius: 2px;
  }
</style>
