<script lang="ts">
  import { page } from "$app/stores";
  import { resetPassword, isError } from "$lib/api";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";
  import Contour from "$lib/components/Contour.svelte";

  // The token is read from the URL query string, never rendered to the DOM as
  // HTML — it is only passed to the API client. No client-side validation: the
  // server is the sole authority on whether a token is valid/expired/used.
  const token = $derived($page.url.searchParams.get("token"));

  // Welcome variant — read-only from URL, never mutated after derivation. Only
  // gates display branches (heading/subhead/tag text + a class modifier); it is
  // never reflected into the DOM as raw HTML.
  const isWelcome = $derived($page.url.searchParams.get("welcome") === "1");

  type ViewState = "form" | "submitting" | "error" | "success";
  // A missing token can never yield a valid reset, so start in the error state.
  let viewState = $state<ViewState>($page.url.searchParams.get("token") ? "form" : "error");

  let newPassword = $state("");
  let confirmPassword = $state("");
  let formError = $state("");

  // Move keyboard focus to the success heading when the state flips, so screen
  // readers announce the confirmation instead of stranding focus on the button.
  let successHeading = $state<HTMLElement | null>(null);
  $effect(() => {
    if (viewState === "success") successHeading?.focus();
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (viewState === "submitting") return;

    formError = "";

    // Client-side checks are UX-only; the API enforces the same rules server-side.
    if (newPassword.length < 8) {
      formError = "Le mot de passe doit contenir au moins 8 caractères.";
      return;
    }
    if (newPassword !== confirmPassword) {
      formError = "Les mots de passe ne correspondent pas.";
      return;
    }
    if (!token) {
      viewState = "error";
      return;
    }

    viewState = "submitting";

    const result = await resetPassword(token, newPassword);

    if (isError(result)) {
      // A truly invalid/expired/used token is not a fixable form error — send the
      // user to the dedicated error panel. Anything else (transport, unexpected)
      // returns them to the form with an inline retry message.
      const msg = result.error ?? "";
      const isTokenError = msg.includes("invalide") || msg.includes("expiré");
      if (isTokenError) {
        viewState = "error";
      } else {
        viewState = "form";
        formError = msg || "Connexion impossible. Veuillez réessayer.";
      }
    } else {
      viewState = "success";
    }
  }
</script>

<main class="reinitialisation" data-testid="reinitialisation-page">
  <div class="reinitialisation__container">
    <SectionLabel text={isWelcome ? "Bienvenue" : "Réinitialisation"} showHairline={true} />

    {#if viewState === "form" || viewState === "submitting"}
      <section
        class="reinitialisation__card"
        class:reinitialisation__card--welcome={isWelcome}
        aria-labelledby="reset-heading"
        data-testid="reset-form-section"
        data-welcome={isWelcome ? "true" : "false"}
      >
        <header class="reinitialisation__card-header">
          <span
            class="reinitialisation__card-tag"
            class:reinitialisation__card-tag--welcome={isWelcome}
            aria-hidden="true"
            data-testid="reset-card-tag"
          >
            {isWelcome ? "BIENVENUE" : "PASS-RESET"}
          </span>
          <h1
            class="reinitialisation__heading"
            class:reinitialisation__heading--welcome={isWelcome}
            id="reset-heading"
            data-testid="reset-heading"
          >
            {isWelcome ? "Bienvenue !" : "Nouveau mot de passe"}
          </h1>
          <p class="reinitialisation__subhead" data-testid="reset-subhead">
            {isWelcome
              ? "Choisissez votre mot de passe pour accéder à votre espace client."
              : "Choisissez un mot de passe d'au moins 8 caractères."}
          </p>
        </header>

        <form
          class="reinitialisation__form"
          novalidate
          aria-label="Formulaire de réinitialisation de mot de passe"
          data-testid="reset-form"
          onsubmit={handleSubmit}
        >
          <div class="reinitialisation__field" data-testid="reset-new-password-field">
            <label class="reinitialisation__label" for="reset-new-password">
              Nouveau mot de passe
            </label>
            <input
              class="reinitialisation__input"
              id="reset-new-password"
              name="newPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              aria-required="true"
              aria-describedby="reset-password-hint reset-error-live"
              data-testid="reset-new-password"
              disabled={viewState === "submitting"}
              bind:value={newPassword}
            />
            <span class="reinitialisation__hint" id="reset-password-hint">
              8 caractères minimum
            </span>
          </div>

          <div class="reinitialisation__field" data-testid="reset-confirm-password-field">
            <label class="reinitialisation__label" for="reset-confirm-password">
              Confirmer le mot de passe
            </label>
            <input
              class="reinitialisation__input"
              id="reset-confirm-password"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              aria-required="true"
              aria-describedby="reset-error-live"
              data-testid="reset-confirm-password"
              disabled={viewState === "submitting"}
              bind:value={confirmPassword}
            />
          </div>

          <div
            class="reinitialisation__form-error"
            id="reset-error-live"
            role="alert"
            aria-live="assertive"
            data-testid="reset-form-error"
            data-visible={formError ? "true" : "false"}
          >
            {formError}
          </div>

          <Button type="submit" variant="primary" block={true} disabled={viewState === "submitting"}>
            {viewState === "submitting" ? "Envoi…" : "Réinitialiser le mot de passe"}
          </Button>
        </form>
      </section>
    {:else if viewState === "error"}
      <div class="reinitialisation__error-state" role="alert" data-testid="reset-error-state">
        <div class="reinitialisation__error-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
            <circle cx="20" cy="20" r="18.5" stroke="var(--color-error)" stroke-width="1.5" />
            <path d="M14 14 L26 26 M26 14 L14 26" stroke="var(--color-error)" stroke-width="1.5" stroke-linecap="square" />
          </svg>
        </div>
        <h1 class="reinitialisation__error-heading">Lien invalide ou expiré</h1>
        <p class="reinitialisation__error-body">
          Ce lien de réinitialisation n'est plus valide ou a déjà été utilisé. Demandez un nouveau
          lien à un administrateur.
        </p>
        <a href="/connexion" class="reinitialisation__back-link" data-testid="reset-back-to-login">
          Retour à la connexion
        </a>
      </div>
    {:else}
      <div class="reinitialisation__success-state" data-testid="reset-success-state">
        <div class="reinitialisation__success-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
            <circle cx="20" cy="20" r="18.5" stroke="var(--color-forest)" stroke-width="1.5" />
            <path d="M13 20.5 L18 25.5 L27 15" stroke="var(--color-forest)" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" />
          </svg>
        </div>
        <h1 class="reinitialisation__success-heading" tabindex="-1" bind:this={successHeading}>
          Mot de passe mis à jour
        </h1>
        <p class="reinitialisation__success-body">
          Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter
          avec vos nouveaux identifiants.
        </p>
        <Button href="/connexion" variant="secondary">Se connecter</Button>
      </div>
    {/if}

    <Contour />
  </div>
</main>

<style>
  /* ── Page shell ────────────────────────────────────────────── */
  .reinitialisation {
    min-height: 100dvh;
    padding-top: calc(64px + var(--space-2xl));
    padding-bottom: var(--space-3xl);
    background-color: var(--color-surface);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .reinitialisation__container {
    width: 100%;
    max-width: 480px;
    padding: 0 var(--space-md);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ── Card panel (form state) ────────────────────────────── */
  .reinitialisation__card {
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    position: relative;
    animation: reset-card-in 260ms cubic-bezier(0.33, 1, 0.68, 1) both;
  }

  .reinitialisation__card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: var(--space-2xl);
    background-color: var(--color-outline-variant);
    transition: background-color 250ms ease;
  }

  .reinitialisation__card:focus-within::before {
    background-color: var(--color-outline);
  }

  /* ── Welcome variant — forest accent bar (static in welcome mode) ── */
  .reinitialisation__card--welcome::before,
  .reinitialisation__card--welcome:focus-within::before {
    background-color: var(--color-forest);
    /* Longer bar to match the taller welcome header */
    height: calc(var(--space-2xl) + var(--space-sm));
    transition: none;
  }

  /* ── Welcome variant — tag label colour ──────────────────── */
  .reinitialisation__card-tag--welcome {
    color: var(--color-forest);
  }

  /* ── Welcome variant — serif heading for a warm arrival feel ── */
  .reinitialisation__heading--welcome {
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 400;
    letter-spacing: -0.015em;
    color: var(--color-forest);
  }

  @media (max-width: 479px) {
    .reinitialisation__heading--welcome {
      font-size: 22px;
    }
  }

  /* ── Card header ─────────────────────────────────────────── */
  .reinitialisation__card-header {
    padding: var(--space-lg) var(--space-lg) var(--space-md);
    border-bottom: 1px solid var(--color-outline-variant);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .reinitialisation__card-tag {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-ink-mute);
    display: block;
    user-select: none;
  }

  .reinitialisation__heading {
    font-family: var(--font-sans);
    font-size: 24px;
    font-weight: 400;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }

  .reinitialisation__subhead {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.55;
    color: var(--color-ink-mute);
    margin: 0;
  }

  /* ── Form ────────────────────────────────────────────────── */
  .reinitialisation__form {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .reinitialisation__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .reinitialisation__label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
  }

  .reinitialisation__input {
    font-family: var(--font-sans);
    font-size: 16px; /* prevents iOS auto-zoom on focus */
    font-weight: 400;
    line-height: 1;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    padding: 0 var(--space-md);
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .reinitialisation__input::placeholder {
    color: var(--color-outline);
  }

  .reinitialisation__input:hover {
    border-color: var(--color-outline);
  }

  .reinitialisation__input:focus-visible {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .reinitialisation__input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .reinitialisation__hint {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    color: var(--color-ink-mute);
    display: block;
  }

  /* ── Form-level error region ──────────────────────────── */
  .reinitialisation__form-error {
    display: none;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
    background-color: color-mix(in srgb, var(--color-error) 6%, transparent);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-error);
  }

  .reinitialisation__form-error[data-visible="true"] {
    display: block;
  }

  /* ── Button stretch ────────────────────────────────────── */
  .reinitialisation__form :global(.button) {
    width: 100%;
    justify-content: center;
    margin-top: var(--space-xs);
  }

  /* ── Error state ──────────────────────────────────────── */
  .reinitialisation__error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-2xl) var(--space-md);
    gap: var(--space-md);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid color-mix(in srgb, var(--color-error) 25%, transparent);
  }

  .reinitialisation__error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }

  .reinitialisation__error-heading {
    font-family: var(--font-sans);
    font-size: 20px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--color-error);
    margin: 0;
  }

  .reinitialisation__error-body {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: 0;
    max-width: 360px;
  }

  .reinitialisation__back-link {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--color-outline-variant);
    transition: text-decoration-color 150ms ease;
    margin-top: var(--space-xs);
  }

  .reinitialisation__back-link:hover {
    text-decoration-color: var(--color-ink);
  }

  .reinitialisation__back-link:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  /* ── Success state ────────────────────────────────────── */
  .reinitialisation__success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-2xl) var(--space-md);
    gap: var(--space-md);
    background-color: var(--color-forest-surface);
    border: 1px solid color-mix(in srgb, var(--color-forest) 25%, transparent);
  }

  .reinitialisation__success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    animation: reset-icon-in 300ms cubic-bezier(0.33, 1, 0.68, 1) both;
  }

  .reinitialisation__success-heading {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--color-forest);
    margin: 0;
  }

  .reinitialisation__success-heading:focus-visible {
    outline: 2px solid var(--color-forest);
    outline-offset: 4px;
  }

  .reinitialisation__success-body {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: 0;
    max-width: 360px;
  }

  @keyframes reset-card-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes reset-icon-in {
    from {
      opacity: 0;
      transform: scale(0.7);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Mobile ──────────────────────────────────────────── */
  @media (max-width: 479px) {
    .reinitialisation {
      padding-top: calc(56px + var(--space-xl));
    }

    .reinitialisation__container {
      padding: 0 var(--space-sm);
      gap: var(--space-md);
    }

    .reinitialisation__card-header,
    .reinitialisation__form {
      padding-left: var(--space-md);
      padding-right: var(--space-md);
    }

    .reinitialisation__heading {
      font-size: 20px;
    }

    .reinitialisation__success-state,
    .reinitialisation__error-state {
      padding: var(--space-xl) var(--space-md);
    }
  }

  /* ── Reduced motion ──────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .reinitialisation__card,
    .reinitialisation__success-icon {
      animation: none;
    }

    .reinitialisation__card::before,
    .reinitialisation__input {
      transition: none;
    }
  }
</style>

<svelte:head>
  <title>
    {isWelcome
      ? "Créez votre espace client — Auberge du Vieux Pont"
      : "Réinitialisation du mot de passe — Auberge du Vieux Pont"}
  </title>
</svelte:head>
