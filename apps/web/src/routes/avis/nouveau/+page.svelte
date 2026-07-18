<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";
  import Seo from "$lib/components/Seo.svelte";

  // ── Types ──────────────────────────────────────────────────────────────────
  type ViewState = "loading" | "eligible" | "ineligible" | "submitted" | "error";

  // ── URL param ─────────────────────────────────────────────────────────────
  // Never rendered as HTML — only used in API calls and display copy. The code
  // is only ever placed in the request body; it is never interpolated into URLs
  // beyond the encoded query string already in the browser's address bar.
  const code = $derived($page.url.searchParams.get("code") ?? "");

  // ── State ──────────────────────────────────────────────────────────────────
  // Initialize from the raw store value (not via `code`) to avoid the
  // state_referenced_locally warning — the page URL doesn't change after mount.
  let viewState = $state<ViewState>(
    $page.url.searchParams.get("code") ? "loading" : "ineligible"
  );
  let firstName = $state<string | null>(null);

  // Form state
  let selectedRating = $state(0);
  let hoveredRating = $state(0);
  let body = $state("");
  let submitting = $state(false);
  let formError = $state<string | null>(null);

  // Accessibility: move focus to heading when state changes
  let outcomeHeading = $state<HTMLElement | null>(null);
  $effect(() => {
    if (viewState === "submitted" || viewState === "ineligible" || viewState === "error") {
      outcomeHeading?.focus();
    }
  });

  // ── Validation ────────────────────────────────────────────────────────────
  const bodyLength = $derived(body.length);
  const bodyValid = $derived(bodyLength >= 10 && bodyLength <= 2000);
  const canSubmit = $derived(selectedRating >= 1 && selectedRating <= 5 && bodyValid && !submitting);

  // ── Check eligibility on mount ─────────────────────────────────────────────
  onMount(async () => {
    if (!code) {
      viewState = "ineligible";
      return;
    }

    try {
      const params = new URLSearchParams({ code });
      const res = await fetch(`/api/reviews/eligibility?${params.toString()}`, {
        credentials: "include",
      });
      // Any non-2xx → generic ineligible (never leak reservation data)
      if (!res.ok) {
        viewState = "ineligible";
        return;
      }
      const data = await res.json();
      if (!data.eligible) {
        viewState = "ineligible";
        return;
      }
      firstName = data.firstName ?? null;
      viewState = "eligible";
    } catch {
      viewState = "error";
    }
  });

  // ── Submit review ─────────────────────────────────────────────────────────
  async function submitReview(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    formError = null;
    submitting = true;

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, rating: selectedRating, body: body.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        // All failures (conflict, validation, invalid code) → generic message.
        // Never leak whether the code was valid.
        formError = "Une erreur est survenue. Veuillez réessayer.";
        return;
      }
      if (data.ok) {
        viewState = "submitted";
      } else {
        formError = "Une erreur est survenue. Veuillez réessayer.";
      }
    } catch {
      formError = "Réseau indisponible. Veuillez réessayer.";
    } finally {
      submitting = false;
    }
  }

  // ── Star label helpers ────────────────────────────────────────────────────
  function starLabel(n: number): string {
    const labels = ["", "Passable", "Correct", "Bien", "Très bien", "Excellent"];
    return labels[n] ?? "";
  }

  const displayRating = $derived(hoveredRating || selectedRating);
</script>

<div class="page-nouveau-avis" data-testid="page-nouveau-avis">
  <div class="page-nouveau-avis__container">

    {#if viewState === "loading"}
      <!-- Loading skeleton while checking eligibility -->
      <div
        class="page-nouveau-avis__loading"
        aria-busy="true"
        aria-label="Vérification en cours…"
        data-testid="nouveau-avis-loading"
      >
        <span class="page-nouveau-avis__spinner" aria-hidden="true"></span>
        <p class="page-nouveau-avis__loading-text">Vérification en cours…</p>
      </div>

    {:else if viewState === "eligible"}
      <!-- Review form -->
      <div data-testid="nouveau-avis-form-wrap">
        <SectionLabel text="Avis" showHairline={false} />
        <h1 class="page-nouveau-avis__title" data-testid="nouveau-avis-title">
          {firstName ? `Merci, ${firstName} !` : "Partagez votre expérience"}
        </h1>
        <p class="page-nouveau-avis__subtitle">
          Votre avis aide d'autres clients à mieux choisir.
        </p>

        <form
          class="page-nouveau-avis__form"
          onsubmit={submitReview}
          novalidate
          data-testid="nouveau-avis-form"
        >
          <!-- Star picker -->
          <div class="page-nouveau-avis__field" data-testid="star-picker-wrap">
            <fieldset class="page-nouveau-avis__stars-fieldset">
              <legend class="page-nouveau-avis__label">
                Note <span class="page-nouveau-avis__required" aria-hidden="true">*</span>
              </legend>

              <div
                class="page-nouveau-avis__stars"
                role="group"
                aria-label="Sélectionnez une note de 1 à 5 étoiles"
              >
                {#each [1, 2, 3, 4, 5] as n}
                  <button
                    type="button"
                    class="page-nouveau-avis__star {displayRating >= n ? 'page-nouveau-avis__star--filled' : ''}"
                    aria-label="{n} étoile{n > 1 ? 's' : ''} — {starLabel(n)}"
                    aria-pressed={selectedRating === n}
                    onmouseover={() => { hoveredRating = n; }}
                    onfocus={() => { hoveredRating = n; }}
                    onmouseout={() => { hoveredRating = 0; }}
                    onblur={() => { hoveredRating = 0; }}
                    onclick={() => { selectedRating = n; }}
                    data-testid="star-btn-{n}"
                  >
                    ★
                  </button>
                {/each}
              </div>

              {#if displayRating > 0}
                <p class="page-nouveau-avis__star-label" aria-live="polite" data-testid="star-label-text">
                  {starLabel(displayRating)}
                </p>
              {/if}
            </fieldset>
          </div>

          <!-- Textarea -->
          <div class="page-nouveau-avis__field" data-testid="body-field-wrap">
            <label class="page-nouveau-avis__label" for="review-body">
              Votre commentaire
              <span class="page-nouveau-avis__required" aria-hidden="true">*</span>
            </label>
            <textarea
              id="review-body"
              class="page-nouveau-avis__textarea"
              bind:value={body}
              rows={6}
              minlength={10}
              maxlength={2000}
              placeholder="Décrivez votre séjour… (10 à 2000 caractères)"
              aria-describedby="review-body-count"
              required
              data-testid="review-body-textarea"
            ></textarea>
            <p
              id="review-body-count"
              class="page-nouveau-avis__char-count {bodyLength > 2000 ? 'page-nouveau-avis__char-count--over' : ''}"
              aria-live="polite"
              data-testid="review-body-count"
            >
              {bodyLength}/2000
            </p>
          </div>

          <!-- Form-level error -->
          {#if formError}
            <div class="page-nouveau-avis__form-error" role="alert" data-testid="nouveau-avis-form-error">
              {formError}
            </div>
          {/if}

          <!-- Submit -->
          <div class="page-nouveau-avis__submit-row">
            <Button
              variant="action"
              type="submit"
              disabled={!canSubmit}
            >
              {submitting ? "Envoi…" : "Soumettre mon avis"}
            </Button>
          </div>
        </form>
      </div>

    {:else if viewState === "submitted"}
      <!-- Thank you screen -->
      <div
        class="page-nouveau-avis__outcome"
        data-testid="nouveau-avis-submitted"
      >
        <div
          class="page-nouveau-avis__outcome-icon page-nouveau-avis__outcome-icon--success"
          aria-hidden="true"
        >
          ✓
        </div>
        <h1
          class="page-nouveau-avis__outcome-heading"
          tabindex="-1"
          bind:this={outcomeHeading}
          data-testid="nouveau-avis-thanks-heading"
        >
          Merci pour votre avis !
        </h1>
        <p class="page-nouveau-avis__outcome-body" data-testid="nouveau-avis-thanks-body">
          Votre témoignage sera examiné et publié prochainement.
        </p>
        <Button variant="secondary" href="/">Retour à l'accueil</Button>
      </div>

    {:else}
      <!-- Ineligible or generic error — same generic display to prevent data leaks -->
      <div
        class="page-nouveau-avis__outcome"
        data-testid="nouveau-avis-ineligible"
      >
        <h1
          class="page-nouveau-avis__outcome-heading"
          tabindex="-1"
          bind:this={outcomeHeading}
          data-testid="nouveau-avis-ineligible-heading"
        >
          Lien invalide
        </h1>
        <p class="page-nouveau-avis__outcome-body" data-testid="nouveau-avis-ineligible-body">
          Ce lien n'est pas valide ou a déjà été utilisé. Si vous pensez qu'il s'agit
          d'une erreur, contactez-nous.
        </p>
        <Button variant="secondary" href="/">Retour à l'accueil</Button>
      </div>
    {/if}

  </div>
</div>

<Seo
  title="Laisser un avis — Auberge du Vieux Pont"
  description="Partagez votre expérience à l'Auberge du Vieux Pont."
  path="/avis/nouveau"
/>

<style>
  /* ── Container ──────────────────────────────────────────────────────────── */
  .page-nouveau-avis {
    min-height: 70vh;
    padding: var(--space-3xl, 4rem) var(--space-md, 1.25rem);
    background-color: var(--color-surface, #f7f9fb);
  }

  .page-nouveau-avis__container {
    max-width: 600px;
    margin-inline: auto;
  }

  /* ── Title / subtitle ───────────────────────────────────────────────────── */
  .page-nouveau-avis__title {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-weight: 300;
    font-size: clamp(28px, 4vw, 40px);
    line-height: 1.1;
    letter-spacing: -0.015em;
    color: var(--color-ink, #191c1e);
    margin: var(--space-md, 1.25rem) 0 0;
  }

  .page-nouveau-avis__subtitle {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-ink-variant, #45464d);
    margin: var(--space-sm, 0.75rem) 0 0;
  }

  /* ── Form ───────────────────────────────────────────────────────────────── */
  .page-nouveau-avis__form {
    margin-top: var(--space-2xl, 2.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--space-xl, 2rem);
  }

  .page-nouveau-avis__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 0.75rem);
  }

  .page-nouveau-avis__label {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-variant, #45464d);
    display: block;
  }

  .page-nouveau-avis__required {
    color: var(--color-error, #ba1a1a);
    margin-left: 2px;
  }

  /* ── Star fieldset ──────────────────────────────────────────────────────── */
  .page-nouveau-avis__stars-fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }

  .page-nouveau-avis__stars-fieldset legend {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-variant, #45464d);
    margin-bottom: var(--space-sm, 0.75rem);
  }

  .page-nouveau-avis__stars {
    display: flex;
    gap: 4px;
  }

  .page-nouveau-avis__star {
    background: none;
    border: none;
    padding: 4px;
    font-size: 32px;
    color: var(--color-outline-variant, #c6c6cd);
    cursor: pointer;
    line-height: 1;
    transition: color 80ms ease, transform 80ms ease;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
  }

  .page-nouveau-avis__star--filled {
    color: var(--color-secondary, #9d4300);
  }

  .page-nouveau-avis__star:hover,
  .page-nouveau-avis__star:focus-visible {
    transform: scale(1.1);
    color: var(--color-secondary, #9d4300);
  }

  .page-nouveau-avis__star:focus-visible {
    outline: 2px solid var(--color-secondary, #9d4300);
    outline-offset: 2px;
  }

  .page-nouveau-avis__star-label {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 13px;
    color: var(--color-ink-variant, #45464d);
    margin: 4px 0 0;
    min-height: 20px;
  }

  /* ── Textarea ───────────────────────────────────────────────────────────── */
  .page-nouveau-avis__textarea {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-ink, #191c1e);
    background-color: var(--color-surface-container-lowest, #ffffff);
    border: 1.5px solid var(--color-outline-variant, #c6c6cd);
    border-radius: 3px;
    padding: var(--space-md, 1.25rem);
    width: 100%;
    resize: vertical;
    box-sizing: border-box;
    transition: border-color 120ms ease;
  }

  .page-nouveau-avis__textarea:focus {
    outline: none;
    border-color: var(--color-ink, #191c1e);
  }

  .page-nouveau-avis__char-count {
    font-family: var(--font-mono, "IBM Plex Mono", ui-monospace, monospace);
    font-size: 11px;
    color: var(--color-ink-mute, #76777d);
    text-align: right;
    margin: 0;
  }

  .page-nouveau-avis__char-count--over {
    color: var(--color-error, #ba1a1a);
  }

  /* ── Form error ─────────────────────────────────────────────────────────── */
  .page-nouveau-avis__form-error {
    padding: 12px 16px;
    background-color: #fce8e8;
    border: 1px solid var(--color-error, #ba1a1a);
    border-radius: 3px;
    color: var(--color-error, #ba1a1a);
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 14px;
  }

  /* ── Submit row ─────────────────────────────────────────────────────────── */
  .page-nouveau-avis__submit-row {
    display: flex;
    justify-content: flex-start;
  }

  /* ── Loading state ──────────────────────────────────────────────────────── */
  .page-nouveau-avis__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg, 1.75rem);
    padding: 60px 20px;
  }

  .page-nouveau-avis__spinner {
    display: inline-block;
    width: 28px;
    height: 28px;
    border: 2px solid var(--color-outline-variant, #c6c6cd);
    border-top-color: var(--color-secondary, #9d4300);
    border-radius: 50%;
    animation: nouveau-spin 0.7s linear infinite;
  }

  @keyframes nouveau-spin {
    to { transform: rotate(360deg); }
  }

  .page-nouveau-avis__loading-text {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 15px;
    color: var(--color-ink-variant, #45464d);
    margin: 0;
  }

  /* ── Outcome screens (submitted / ineligible) ───────────────────────────── */
  .page-nouveau-avis__outcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-lg, 1.75rem);
    padding: var(--space-3xl, 4rem) 0;
  }

  .page-nouveau-avis__outcome-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
  }

  .page-nouveau-avis__outcome-icon--success {
    background-color: var(--color-forest-surface, #d4ede0);
    color: var(--color-forest, #1a5c2d);
  }

  .page-nouveau-avis__outcome-heading {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-weight: 300;
    font-size: clamp(26px, 4vw, 36px);
    line-height: 1.1;
    letter-spacing: -0.015em;
    color: var(--color-ink, #191c1e);
    margin: 0;
  }

  .page-nouveau-avis__outcome-heading:focus {
    outline: none;
  }

  .page-nouveau-avis__outcome-body {
    font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, sans-serif);
    font-size: 15px;
    line-height: 1.6;
    color: var(--color-ink-variant, #45464d);
    margin: 0;
    max-width: 440px;
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .page-nouveau-avis {
      padding: var(--space-2xl, 2.5rem) var(--space-md, 1.25rem);
    }

    .page-nouveau-avis__star {
      font-size: 28px;
      min-width: 40px;
    }

    .page-nouveau-avis__stars {
      gap: 2px;
    }
  }

  @media (max-width: 375px) {
    .page-nouveau-avis__star {
      font-size: 24px;
      min-width: 44px;
      padding: 6px 2px;
    }
  }
</style>
