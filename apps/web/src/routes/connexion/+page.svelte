<script lang="ts">
  import { goto } from "$app/navigation";
  import { login, register, forgotPassword, isError } from "$lib/api";
  import { setUser } from "$lib/auth.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Button from "$lib/components/Button.svelte";

  // ── Login state ──
  let loginEmail = $state("");
  let loginPassword = $state("");
  let loginError = $state("");
  let loginStatus = $state<"idle" | "sending">("idle");

  // ── Forgot-password state ──
  let forgotOpen = $state(false);
  let forgotEmail = $state("");
  let forgotError = $state("");
  let forgotStatus = $state<"idle" | "sending">("idle");
  let forgotSent = $state(false);

  // ── Register state ──
  let regFirstName = $state("");
  let regLastName = $state("");
  let regEmail = $state("");
  let regPassword = $state("");
  let regPhone = $state("");
  let regCompany = $state("");
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
      // Update the shared auth store before navigating so the Nav renders the
      // authenticated state (Profil/Admin, logout) immediately — no reload.
      setUser(result.user);
      await goto("/profil");
    }
  }

  function toggleForgot() {
    forgotOpen = !forgotOpen;
    forgotError = "";
  }

  async function handleForgot(e: SubmitEvent) {
    e.preventDefault();
    if (forgotStatus === "sending") return;
    forgotError = "";
    forgotStatus = "sending";

    const result = await forgotPassword(forgotEmail.trim());

    // The API always returns 200 { ok: true } — it never reveals whether the
    // address exists (no user enumeration). Only a transport failure surfaces;
    // any success swaps the whole zone for a generic confirmation.
    if (isError(result)) {
      forgotError = "Connexion impossible. Veuillez réessayer.";
      forgotStatus = "idle";
    } else {
      forgotSent = true;
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

    const result = await register(regEmail, regPassword, {
      firstName: regFirstName.trim() || null,
      lastName: regLastName.trim() || null,
      phone: regPhone.trim() || null,
      company: regCompany.trim() || null,
    });

    if (isError(result)) {
      regError =
        result.error === "Réseau indisponible"
          ? "Connexion impossible. Veuillez réessayer."
          : result.error; // includes "Un compte existe déjà" (409)
      regStatus = "idle";
    } else {
      // Update the shared auth store before navigating so the Nav renders the
      // authenticated state (Profil/Admin, logout) immediately — no reload.
      setUser(result.user);
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

      <!-- ── FORGOT-PASSWORD ZONE ── -->
      {#if !forgotSent}
        <div class="connexion__forgot-zone">
          <button
            class="connexion__forgot-trigger"
            type="button"
            aria-expanded={forgotOpen}
            aria-controls="forgot-drawer"
            data-testid="forgot-toggle"
            onclick={toggleForgot}
          >
            <span class="connexion__forgot-chevron" aria-hidden="true">›</span>
            Mot de passe oublié ?
          </button>

          <!-- Drawer: grid-rows collapse trick; inert removes it from tab order
               and the a11y tree while hidden. -->
          <div
            class="connexion__forgot-drawer"
            class:is-open={forgotOpen}
            id="forgot-drawer"
            role="region"
            aria-label="Réinitialisation du mot de passe"
            inert={!forgotOpen}
          >
            <div class="connexion__forgot-drawer-inner">
              <form
                class="connexion__forgot-form"
                novalidate
                aria-label="Formulaire de réinitialisation"
                data-testid="forgot-form"
                onsubmit={handleForgot}
              >
                <div class="connexion__field">
                  <label class="connexion__label" for="forgot-email">
                    Votre adresse courriel
                  </label>
                  <input
                    class="connexion__input"
                    id="forgot-email"
                    type="email"
                    autocomplete="email"
                    aria-required="true"
                    data-testid="forgot-email"
                    bind:value={forgotEmail}
                    placeholder="vous@exemple.com"
                  />
                </div>

                <div
                  class="connexion__form-error"
                  role="alert"
                  aria-live="assertive"
                  data-testid="forgot-error"
                  data-visible={forgotError ? "true" : "false"}
                >
                  <span class="connexion__error-text">{forgotError}</span>
                </div>

                <div class="connexion__actions">
                  <Button type="submit" variant="primary" disabled={forgotStatus === "sending"}>
                    {forgotStatus === "sending" ? "Envoi…" : "Envoyer"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      {:else}
        <div class="connexion__forgot-success" data-testid="forgot-success">
          <span class="connexion__forgot-success-icon" aria-hidden="true">✓</span>
          <p class="connexion__forgot-success-text">
            Si cette adresse est associée à un compte, un administrateur pourra
            vous transmettre un lien de réinitialisation.
          </p>
        </div>
      {/if}
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
        <!-- Name row: first + last side-by-side on ≥480px -->
        <div class="connexion__name-row">
          <div class="connexion__field">
            <label class="connexion__label" for="reg-first-name">Prénom</label>
            <input
              class="connexion__input"
              id="reg-first-name"
              type="text"
              autocomplete="given-name"
              data-testid="register-first-name"
              bind:value={regFirstName}
              placeholder="Ada"
            />
          </div>
          <div class="connexion__field">
            <label class="connexion__label" for="reg-last-name">Nom de famille</label>
            <input
              class="connexion__input"
              id="reg-last-name"
              type="text"
              autocomplete="family-name"
              data-testid="register-last-name"
              bind:value={regLastName}
              placeholder="Lovelace"
            />
          </div>
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

        <div class="connexion__field">
          <label class="connexion__label" for="reg-phone">
            Téléphone
            <span class="connexion__field-optional" aria-label="optionnel">(optionnel)</span>
          </label>
          <input
            class="connexion__input"
            id="reg-phone"
            type="tel"
            autocomplete="tel"
            data-testid="register-phone"
            bind:value={regPhone}
            placeholder="+1 418 555-0100"
          />
        </div>

        <div class="connexion__field">
          <label class="connexion__label" for="reg-company">
            Employeur / entreprise
            <span class="connexion__field-optional" aria-label="optionnel">(optionnel)</span>
          </label>
          <input
            class="connexion__input"
            id="reg-company"
            type="text"
            autocomplete="organization"
            data-testid="register-company"
            bind:value={regCompany}
            placeholder="Hydro-Québec"
          />
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

  /* ── Name row (first + last name side-by-side) ── */
  .connexion__name-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  @media (max-width: 479px) {
    .connexion__name-row {
      grid-template-columns: 1fr;
      gap: var(--space-lg);
    }
  }

  /* ── Optional field label suffix ── */
  .connexion__field-optional {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    color: var(--color-outline);
    margin-left: var(--space-xs);
  }

  /* ── Forgot-password zone ── */
  .connexion__forgot-zone {
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-outline-variant);
  }

  /* Trigger — unstyled base, presented as a subdued text link. */
  .connexion__forgot-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    color: var(--color-ink-variant);
    text-decoration: underline;
    text-decoration-color: transparent;
    text-underline-offset: 3px;
    transition:
      color 150ms ease,
      text-decoration-color 150ms ease;
    min-height: 44px; /* 44px touch target */
  }

  .connexion__forgot-trigger:hover {
    color: var(--color-ink);
    text-decoration-color: var(--color-outline);
  }

  .connexion__forgot-trigger:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
    border-radius: 2px;
  }

  /* Chevron rotates 90° when the drawer is expanded. */
  .connexion__forgot-chevron {
    display: inline-block;
    font-style: normal;
    font-size: 16px;
    line-height: 1;
    transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .connexion__forgot-trigger[aria-expanded="true"] .connexion__forgot-chevron {
    transform: rotate(90deg);
  }

  /* ── Drawer: grid-rows collapse trick (0fr → 1fr) ── */
  .connexion__forgot-drawer {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1);
    margin-top: 0;
  }

  .connexion__forgot-drawer.is-open {
    grid-template-rows: 1fr;
    margin-top: var(--space-md);
  }

  /* min-height: 0 is required for the collapse to reach 0fr. */
  .connexion__forgot-drawer-inner {
    overflow: hidden;
    min-height: 0;
  }

  .connexion__forgot-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    padding-bottom: var(--space-xs);
  }

  /* ── Forgot-password success state ── */
  .connexion__forgot-success {
    margin-top: var(--space-lg);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-outline-variant);
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .connexion__forgot-success-icon {
    flex-shrink: 0;
    font-size: 16px;
    line-height: 1.5;
    color: var(--color-forest);
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .connexion__forgot-success-text {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-ink);
    margin: 0;
  }

  /* ── Reduced motion: kill the accent bar transition ── */
  @media (prefers-reduced-motion: reduce) {
    .connexion__panel::before,
    .connexion__input,
    .connexion__forgot-trigger,
    .connexion__forgot-chevron,
    .connexion__forgot-drawer {
      transition: none;
    }
    /* Instant show/hide instead of the collapse animation. */
    .connexion__forgot-drawer:not(.is-open) {
      display: none;
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
