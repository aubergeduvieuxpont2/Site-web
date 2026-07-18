<script lang="ts">
  import { onMount } from "svelte";
  import { adminListReviews, adminModerateReview, isError, type AdminReview } from "$lib/api";

  // ── Props ──────────────────────────────────────────────────────────────────
  // Parent binds pendingCount to display the badge in the tab label.
  let { pendingCount = $bindable(0) }: { pendingCount?: number } = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let filter = $state<"pending" | "approved" | "rejected">("pending");
  let reviews = $state<AdminReview[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let moderatingIds = $state(new Set<number>());

  // ── Helpers ────────────────────────────────────────────────────────────────
  function stars(rating: number): string {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "short",
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

  function filterLabel(f: typeof filter): string {
    if (f === "pending") return "En attente";
    if (f === "approved") return "Approuvés";
    return "Rejetés";
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function loadReviews() {
    loading = true;
    error = null;
    const result = await adminListReviews(filter);
    if (isError(result)) {
      error = result.error;
    } else {
      reviews = result.reviews;
      pendingCount = result.pendingCount;
    }
    loading = false;
  }

  async function moderate(id: number, status: "approved" | "rejected") {
    if (moderatingIds.has(id)) return;
    moderatingIds = new Set([...moderatingIds, id]);
    try {
      const result = await adminModerateReview(id, status);
      if (isError(result)) {
        error = result.error;
      } else {
        // Update the row in-place, then reload for badge accuracy
        reviews = reviews.map((r) => (r.id === id ? result.review : r));
        await loadReviews();
      }
    } finally {
      const ids = new Set(moderatingIds);
      ids.delete(id);
      moderatingIds = ids;
    }
  }

  // ── Effects ────────────────────────────────────────────────────────────────
  $effect(() => {
    // Re-load when filter changes (filter is a reactive dependency)
    void filter;
    loadReviews();
  });

  onMount(() => {
    loadReviews();
  });
</script>

<div class="avis-tab" data-testid="admin-avis-tab">
  <!-- Filter bar -->
  <div class="avis-tab__filters" role="group" aria-label="Filtrer par statut">
    {#each (["pending", "approved", "rejected"] as const) as f}
      <button
        class="avis-tab__filter-btn {filter === f ? 'avis-tab__filter-btn--active' : ''}"
        type="button"
        aria-pressed={filter === f}
        onclick={() => { filter = f; }}
        data-testid="filter-{f}"
      >
        {filterLabel(f)}
        {#if f === "pending" && pendingCount > 0}
          <span class="avis-tab__badge" aria-label="{pendingCount} en attente">
            {pendingCount}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="avis-tab__error" role="alert" data-testid="avis-error">
      {error}
    </div>
  {/if}

  <!-- Loading state -->
  {#if loading}
    <div class="avis-tab__loading" aria-busy="true" aria-label="Chargement des avis…" data-testid="avis-loading">
      <span class="avis-tab__spinner" aria-hidden="true"></span>
    </div>
  {:else if reviews.length === 0}
    <div class="avis-tab__empty" data-testid="avis-empty">
      Aucun avis {filterLabel(filter).toLowerCase()} pour le moment.
    </div>
  {:else}
    <!-- Review list -->
    <div class="avis-tab__list" data-testid="avis-list">
      {#each reviews as review (review.id)}
        <div
          class="avis-tab__card avis-tab__card--{review.status}"
          data-testid="review-card"
          data-review-id={review.id}
        >
          <!-- Header row: stars + meta -->
          <div class="avis-tab__card-header">
            <span
              class="avis-tab__stars"
              aria-label="Note : {review.rating} sur 5"
              data-testid="review-rating"
            >
              {stars(review.rating)}
            </span>

            <span class="avis-tab__meta" data-testid="review-meta">
              <span class="avis-tab__display-name" data-testid="review-display-name">
                {review.display_name}
              </span>
              <span class="avis-tab__separator" aria-hidden="true">·</span>
              <span class="avis-tab__stays" data-testid="review-stays">
                {pluralSejours(review.stays_count)} · {pluralNuits(review.nights_total)}
              </span>
              {#if review.reservation_code}
                <span class="avis-tab__separator" aria-hidden="true">·</span>
                <span class="avis-tab__code" data-testid="review-code">
                  {review.reservation_code}
                </span>
              {/if}
              <span class="avis-tab__separator" aria-hidden="true">·</span>
              <span class="avis-tab__date" data-testid="review-date">
                {formatDate(review.created_at)}
              </span>
            </span>
          </div>

          <!-- Body -->
          <p class="avis-tab__body" data-testid="review-body">{review.body}</p>

          <!-- Actions -->
          <div class="avis-tab__actions" role="group" aria-label="Modérer cet avis">
            {#if review.status !== "approved"}
              <button
                class="avis-tab__btn avis-tab__btn--approve"
                type="button"
                disabled={moderatingIds.has(review.id)}
                aria-busy={moderatingIds.has(review.id)}
                onclick={() => moderate(review.id, "approved")}
                data-testid="btn-approuver"
              >
                {moderatingIds.has(review.id) ? "…" : "Approuver"}
              </button>
            {/if}
            {#if review.status !== "rejected"}
              <button
                class="avis-tab__btn avis-tab__btn--reject"
                type="button"
                disabled={moderatingIds.has(review.id)}
                aria-busy={moderatingIds.has(review.id)}
                onclick={() => moderate(review.id, "rejected")}
                data-testid="btn-rejeter"
              >
                {moderatingIds.has(review.id) ? "…" : "Rejeter"}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .avis-tab {
    --surface: #f4efe6;
    --surface-alt: #e0dad0;
    --surface-raised: #ece7db;
    --border: #c4baa8;
    --border-strong: #9a8e7e;
    --text: #1c1a17;
    --text-muted: #695e51;
    --accent: #7b4628;
    --accent-hover: #6a3a20;
    --forest: #1a5c2d;
    --forest-surface: #d4ede0;
    --error: #ba1a1a;
    --error-surface: #fce8e8;
    --focus-ring: #7b4628;
    --font-ui: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    --font-mono: "IBM Plex Mono", ui-monospace, monospace;

    padding: 24px;
    min-height: 200px;
  }

  /* ── Filter bar ─────────────────────────────────────────────────────────── */
  .avis-tab__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }

  .avis-tab__filter-btn {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 2px;
    border: 1.5px solid var(--border);
    background-color: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: border-color 100ms ease, background-color 100ms ease, color 100ms ease;
    min-height: 36px;
  }

  .avis-tab__filter-btn:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }

  .avis-tab__filter-btn--active {
    border-color: var(--accent);
    background-color: var(--accent);
    color: #f4efe6;
  }

  .avis-tab__filter-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .avis-tab__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background-color: var(--error);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
  }

  /* ── Error banner ────────────────────────────────────────────────────────── */
  .avis-tab__error {
    padding: 10px 14px;
    background-color: var(--error-surface);
    border: 1px solid var(--error);
    border-radius: 2px;
    color: var(--error);
    font-family: var(--font-ui);
    font-size: 13px;
    margin-bottom: 16px;
  }

  /* ── Loading ─────────────────────────────────────────────────────────────── */
  .avis-tab__loading {
    display: flex;
    justify-content: center;
    padding: 40px;
  }

  .avis-tab__spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Empty state ─────────────────────────────────────────────────────────── */
  .avis-tab__empty {
    font-family: var(--font-ui);
    font-size: 14px;
    color: var(--text-muted);
    text-align: center;
    padding: 40px 20px;
  }

  /* ── Review list ─────────────────────────────────────────────────────────── */
  .avis-tab__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .avis-tab__card {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 16px;
  }

  .avis-tab__card--approved {
    border-left: 3px solid var(--forest);
  }

  .avis-tab__card--rejected {
    border-left: 3px solid var(--error);
    opacity: 0.7;
  }

  .avis-tab__card--pending {
    border-left: 3px solid var(--accent);
  }

  .avis-tab__card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 10px;
  }

  .avis-tab__stars {
    font-size: 14px;
    color: var(--accent);
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  .avis-tab__meta {
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .avis-tab__display-name {
    font-weight: 500;
    color: var(--text);
  }

  .avis-tab__separator {
    color: var(--border-strong);
  }

  .avis-tab__code {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .avis-tab__date {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  /* ── Review body ─────────────────────────────────────────────────────────── */
  .avis-tab__body {
    font-family: var(--font-ui);
    font-size: 14px;
    line-height: 1.55;
    color: var(--text);
    margin: 0 0 12px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }

  /* ── Actions ─────────────────────────────────────────────────────────────── */
  .avis-tab__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .avis-tab__btn {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 5px 12px;
    border-radius: 2px;
    border: 1.5px solid transparent;
    cursor: pointer;
    min-height: 32px;
    transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
  }

  .avis-tab__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .avis-tab__btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .avis-tab__btn--approve {
    background-color: transparent;
    border-color: var(--forest);
    color: var(--forest);
  }

  .avis-tab__btn--approve:hover:not(:disabled) {
    background-color: var(--forest-surface);
  }

  .avis-tab__btn--reject {
    background-color: transparent;
    border-color: var(--error);
    color: var(--error);
  }

  .avis-tab__btn--reject:hover:not(:disabled) {
    background-color: var(--error-surface);
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .avis-tab {
      padding: 16px;
    }

    .avis-tab__card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .avis-tab__filters {
      gap: 6px;
    }

    .avis-tab__filter-btn {
      font-size: 12px;
      padding: 5px 10px;
    }
  }
</style>
