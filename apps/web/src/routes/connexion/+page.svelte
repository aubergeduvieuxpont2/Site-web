<script lang="ts">
  import { goto } from "$app/navigation";
  import { login, register, isError } from "$lib/api";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";

  // ── Login state ──
  let loginEmail = $state("");
  let loginPassword = $state("");
  let loginError = $state("");
  let loginStatus = $state<"idle" | "sending">("idle");

  // ── Register state ──
  let regName = $state("");
  let regEmail = $state("");
  let regPassword = $state("");
  let regError = $state("");
  let regStatus = $state<"idle" | "sending">("idle");

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    if (loginStatus === "sending") return;
    loginError = "";
    loginStatus = "sending";

    const result = await login(loginEmail, loginPassword);

    if (isError(result)) {
      // Never discriminate between "unknown email" and "wrong password" — that
      // would allow user enumeration. Every auth failure maps to one neutral
      // message; only a transport failure is surfaced distinctly.
      loginError =
        result.error === "Réseau indisponible"
          ? "Connexion impossible. Veuillez réessayer."
          : "Identifiants invalides";
      loginStatus = "idle";
    } else {
      await goto("/profil");
    }
  }

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();
    if (regStatus === "sending") return;
    regError = "";

    // Client-side length check before hitting the network. The API enforces the
    // same rule server-side; this is only a fast-fail for UX.
    if (regPassword.length < 8) {
      regError = "Le mot de passe doit contenir au moins 8 caractères.";
      return;
    }

    regStatus = "sending";

    const result = await register(regEmail, regPassword, regName.trim() || null);

    if (isError(result)) {
      regError =
        result.error === "Réseau indisponible"
          ? "Connexion impossible. Veuillez réessayer."
          : result.error; // includes "Un compte existe déjà" (409)
      regStatus = "idle";
    } else {
      await goto("/profil");
    }
  }
</script>

<div class="connexion">
  <div class="connexion__page-header">
    <SectionLabel text="Connexion" showHairline={true} />
    <h1 class="connexion__display">Espace client</h1>
    <p class="connexion__lead">Accédez à vos réservations ou créez votre espace.</p>
  </div>

  <div class="connexion__panels">
    <!-- ── LOGIN PANEL ── -->
    <section class="connexion__panel" aria-labelledby="login-heading" data-testid="panel-login">
      <header class="connexion__panel-header">
        <span class="connexion__panel-tag" aria-hidden="true">AUTH-01</span>
        <h2 class="connexion__panel-heading" id="login-heading">Se connecter</h2>
      </header>

      <form
        class="connexion__form"
        id="login-form"
        novalidate
        aria-label="Formulaire de connexion"
        data-testid="form-login"
        onsubmit={handleLogin}
      >
        <div class="connexion__field">
          <label class="connexion__label" for="login-email">Courriel</label>
          <input
            class="connexion__input"
            id="login-email"
            type="email"
            autocomplete="email"
            aria-required="true"
            data-testid="login-email"
            bind:value={loginEmail}
            placeholder="vous@exemple.com"
          />
        </div>

        <div class="connexion__field">
          <label class="connexion__label" for="login-password">Mot de passe</label>
          <input
            class="connexion__input"
            id="login-password"
            type="password"
            autocomplete="current-password"
            aria-required="true"
            data-testid="login-password"
            bind:value={loginPassword}
          />
        </div>

        <div
          class="connexion__form-error"
          role="alert"
          aria-live="assertive"
          data-testid="login-error"
          data-visible={loginError ? "true" : "false"}
        >
          <span class="connexion__error-text">{loginError}</span>
        </div>

        <div class="connexion__actions">
          <Button type="submit" variant="primary" disabled={loginStatus === "sending"}>
            {loginStatus === "sending" ? "Connexion…" : "Se connecter"}
          </Button>
        </div>
      </form>
    </section>

    <!-- ── REGISTER PANEL ── -->
    <section
      class="connexion__panel"
      aria-labelledby="register-heading"
      data-testid="panel-register"
    >
      <header class="connexion__panel-header">
        <span class="connexion__panel-tag" aria-hidden="true">AUTH-02</span>
        <h2 class="connexion__panel-heading" id="register-heading">Créer un compte</h2>
      </header>

      <form
        class="connexion__form"
        id="register-form"
        novalidate
        aria-label="Formulaire d'inscription"
        data-testid="form-register"
        onsubmit={handleRegister}
      >
        <div class="connexion__field">
          <label class="connexion__label" for="reg-name">Nom (optionnel)</label>
          <input
            class="connexion__input"
            id="reg-name"
            type="text"
            autocomplete="name"
            data-testid="register-name"
            bind:value={regName}
            placeholder="Votre nom"
          />
        </div>

        <div class="connexion__field">
          <label class="connexion__label" for="reg-email">Courriel</label>
          <input
            class="connexion__input"
            id="reg-email"
            type="email"
            autocomplete="email"
            aria-required="true"
            data-testid="register-email"
            bind:value={regEmail}
            placeholder="vous@exemple.com"
          />
        </div>

        <div class="connexion__field">
          <label class="connexion__label" for="reg-password">Mot de passe</label>
          <input
            class="connexion__input"
            id="reg-password"
            type="password"
            autocomplete="new-password"
            aria-required="true"
            aria-describedby="reg-password-hint"
            data-testid="register-password"
            bind:value={regPassword}
          />
          <span class="connexion__field-hint" id="reg-password-hint">
            8 caractères minimum
          </span>
        </div>

        <div
          class="connexion__form-error"
          role="alert"
          aria-live="assertive"
          data-testid="register-error"
          data-visible={regError ? "true" : "false"}
        >
          <span class="connexion__error-text">{regError}</span>
        </div>

        <div class="connexion__actions">
          <Button type="submit" variant="action" disabled={regStatus === "sending"}>
            {regStatus === "sending" ? "Création…" : "Créer mon compte"}
          </Button>
        </div>
      </form>
    </section>
  </div>
</div>

<style>
  /* ── Page shell ── */
  .connexion {
    min-height: 100dvh;
    padding-top: calc(64px + var(--space-3xl)); /* clear fixed Nav */
    padding-bottom: var(--space-3xl);
    background-color: var(--color-surface);
  }

  /* ── Page header ── */
  .connexion__page-header {
    max-width: 1100px;
    margin: 0 auto var(--space-2xl);
    padding: 0 var(--space-xl);
  }

  .connexion__display {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(2.5rem, 6vw, 4rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: var(--space-md) 0 var(--space-sm);
  }

  .connexion__lead {
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
    max-width: 480px;
  }

  /* ── Two-panel grid ── */
  .connexion__panels {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 var(--space-xl);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xl);
    align-items: start;
  }

  @media (max-width: 767px) {
    .connexion__panels {
      grid-template-columns: 1fr;
      gap: var(--space-2xl);
      padding: 0 var(--space-md);
    }
  }

  /* ── Panel card ── */
  .connexion__panel {
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    padding: var(--space-2xl);
    position: relative;
  }

  /* Blueprint left-edge accent: thin vertical bar top-left. */
  .connexion__panel::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: var(--space-2xl);
    background-color: var(--color-outline-variant);
    transition: background-color 300ms ease;
  }

  /* Active accent when the user is interacting with this panel. */
  .connexion__panel:focus-within::before {
    background-color: var(--color-secondary-container); /* forge orange */
  }

  @media (max-width: 767px) {
    .connexion__panel {
      padding: var(--space-xl) var(--space-lg);
    }
  }

  /* ── Panel header ── */
  .connexion__panel-header {
    margin-bottom: var(--space-xl);
    padding-bottom: var(--space-lg);
    border-bottom: 1px solid var(--color-outline-variant);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .connexion__panel-tag {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
  }

  .connexion__panel-heading {
    font-family: var(--font-sans);
    font-size: 24px;
    font-weight: 400;
    line-height: 1.3;
    color: var(--color-ink);
    margin: 0;
  }

  /* ── Form ── */
  .connexion__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ── Field ── */
  .connexion__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .connexion__label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    display: block;
  }

  .connexion__input {
    font-family: var(--font-sans);
    font-size: 16px; /* prevent iOS zoom on focus */
    font-weight: 400;
    line-height: 1;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: 0 var(--space-md);
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .connexion__input::placeholder {
    color: var(--color-outline);
  }

  .connexion__input:hover {
    border-color: var(--color-outline);
  }

  .connexion__input:focus-visible {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 12%, transparent);
  }

  .connexion__input[aria-invalid="true"] {
    border-color: var(--color-error);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-error) 10%, transparent);
  }

  /* ── Field hint (password strength note) ── */
  .connexion__field-hint {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    color: var(--color-ink-variant);
    display: block;
  }

  /* ── Form-level error region ── */
  .connexion__form-error {
    display: none; /* hidden when empty — data-visible toggles it */
    padding: var(--space-md);
    border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
    background-color: color-mix(in srgb, var(--color-error) 6%, transparent);
  }

  .connexion__form-error[data-visible="true"] {
    display: block;
  }

  .connexion__error-text {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-error);
    display: block;
  }

  /* ── Actions row ── */
  .connexion__actions {
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  /* Stretch the submit button to full panel width. */
  .connexion__actions :global(.button) {
    width: 100%;
    justify-content: center;
  }

  /* ── Reduced motion: kill the accent bar transition ── */
  @media (prefers-reduced-motion: reduce) {
    .connexion__panel::before,
    .connexion__input {
      transition: none;
    }
  }

  /* ── Responsive padding scaling ── */
  @media (max-width: 479px) {
    .connexion {
      padding-top: calc(56px + var(--space-2xl));
    }
    .connexion__page-header {
      padding: 0 var(--space-md);
    }
  }
</style>
