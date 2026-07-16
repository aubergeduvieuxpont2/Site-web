<script lang="ts">
  import { fade } from "svelte/transition";
  import { reveal } from "$lib/motion";
  import { createReservation, isError } from "$lib/api";
  import { SITE } from "$lib/content";
  import { settings } from "$lib/settings.svelte";
  import { datesOutOfOrder } from "$lib/utils";
  import { DEFAULTS } from "$lib/content";
  import Seo from "$lib/components/Seo.svelte";
  import { breadcrumbSchema } from "$lib/seo";
  import { auth } from "$lib/auth.svelte";
  import Button from "$lib/components/Button.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";

  let form = $state({
    firstName: "",
    lastName: "",
    email: "",
    checkIn: "",
    checkOut: "",
    guests: 1,
    roomCount: 1,
    message: "",
  });

  type Status = "idle" | "sending" | "sent" | "error";
  let status = $state<Status>("idle");
  let errorMsg = $state("");
  let greetingName = $state("");

  // Lightweight required-field errors, shown only after a submit attempt.
  let fieldErrors = $state<{
    firstName?: string;
    lastName?: string;
    email?: string;
    roomCount?: string;
    checkOut?: string;
  }>({});

  // When a session user is present, the identity fields are hidden and their
  // values are derived from the store instead of the form.
  const loggedIn = $derived(!!auth.user);

  function splitName(full: string | null | undefined): {
    first: string;
    last: string;
  } {
    const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    const [first, ...rest] = parts;
    return { first, last: rest.join(" ") || first };
  }

  // The effective identity used for the submit payload: the session user when
  // logged in, the trimmed form fields otherwise.
  const effective = $derived.by(() => {
    if (auth.user) {
      const { first, last } = splitName(auth.user.name);
      return { firstName: first, lastName: last, email: auth.user.email };
    }
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
    };
  });

  // On success, move keyboard focus to the confirmation heading.
  let successHeading = $state<HTMLHeadingElement | null>(null);
  $effect(() => {
    if (status === "sent") successHeading?.focus();
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateClient(): boolean {
    const errors: typeof fieldErrors = {};
    // Identity fields are only required when logged out — otherwise they come
    // from the session user.
    if (!loggedIn) {
      if (!form.firstName.trim()) errors.firstName = "Le prénom est requis.";
      if (!form.lastName.trim()) errors.lastName = "Le nom est requis.";
      if (!form.email.trim()) errors.email = "Le courriel est requis.";
      else if (!EMAIL_RE.test(form.email.trim()))
        errors.email = "Courriel invalide.";
    }
    if (!(Number(form.roomCount) >= 1))
      errors.roomCount = "Au moins une chambre est requise.";
    if (datesOutOfOrder(form.checkIn, form.checkOut))
      errors.checkOut =
        "La date de départ doit être postérieure à la date d'arrivée.";
    fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (status === "sending") return;
    if (!validateClient()) return;

    status = "sending";
    errorMsg = "";

    const eff = effective;
    const result = await createReservation({
      firstName: eff.firstName,
      lastName: eff.lastName,
      email: eff.email,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guests: Math.max(1, Math.trunc(Number(form.guests) || 1)),
      roomCount: Math.max(1, Math.trunc(Number(form.roomCount) || 1)),
      message: form.message.trim() || undefined,
    });

    if (isError(result)) {
      status = "error";
      errorMsg = result.error;
    } else {
      greetingName = eff.firstName || "merci";
      status = "sent";
    }
  }
</script>

<div class="page-contact" data-testid="page-contact">
  <!-- ── HERO ─────────────────────────────────────────────── -->
  <section class="page-contact__hero">
    <div class="page-contact__hero-inner">
      <SectionLabel text="Réservation & contact" showHairline={true} />
      <h1 class="page-contact__title">Écrivez-nous</h1>
      <p class="page-contact__lead">
        Envoyez votre demande de réservation ou vos questions. Nous répondons à
        chaque message&nbsp;; pour une réponse immédiate, appelez-nous.
      </p>
    </div>
  </section>

  <!-- ── BODY ─────────────────────────────────────────────── -->
  <section class="page-contact__body">
    <div class="page-contact__body-inner">
      <!-- ── FORM COLUMN ── -->
      <div class="page-contact__form-col" use:reveal>
        <div class="page-contact__form-card">
          {#if status === "sent"}
            <div class="page-contact__success" data-testid="contact-success">
              <div class="page-contact__success-badge" aria-hidden="true"></div>
              <h2
                class="page-contact__success-title"
                tabindex="-1"
                bind:this={successHeading}
              >
                C'est noté, {greetingName}.
              </h2>
              <p class="page-contact__success-body">
                Votre demande est enregistrée. Nous vous répondrons par courriel
                sous peu pour confirmer les détails de votre séjour.
              </p>
              <div class="page-contact__success-cta">
                <span class="page-contact__tech-label">Une question pressante&nbsp;?</span>
                <a class="page-contact__phone-link" href={SITE.phoneHref}>{SITE.phone}</a>
              </div>
            </div>
          {:else}
            <div class="page-contact__form-header">
              <SectionLabel text="Demande de réservation" />
              <p class="page-contact__form-desc">
                Les champs marqués d'un astérisque sont requis. Les dates et le
                nombre de personnes nous aident à préparer votre arrivée.
              </p>
            </div>

            <form
              class="page-contact__form"
              novalidate
              onsubmit={handleSubmit}
              aria-describedby="form-error-region"
              data-testid="contact-form"
            >
              {#if loggedIn}
                <!-- Logged-in identity: name/email derived from the session -->
                <div
                  class="page-contact__identity"
                  data-testid="contact-identity"
                  aria-live="polite"
                  transition:fade={{ duration: 150 }}
                >
                  <span class="page-contact__identity-label"
                    >Réservation au nom de</span
                  >
                  <span class="page-contact__identity-value">
                    {effective.firstName}
                    {effective.lastName} · {effective.email}
                  </span>
                </div>
              {:else}
                <!-- Prénom / Nom -->
                <div
                  class="page-contact__field-row"
                  transition:fade={{ duration: 150 }}
                >
                  <div class="page-contact__field">
                    <label class="page-contact__label" for="field-first-name">
                      Prénom<span class="page-contact__required" aria-hidden="true"> *</span>
                    </label>
                    <input
                      class="page-contact__input"
                      id="field-first-name"
                      type="text"
                      required
                      autocomplete="given-name"
                      aria-required="true"
                      aria-describedby={fieldErrors.firstName ? "err-first-name" : undefined}
                      data-testid="input-first-name"
                      bind:value={form.firstName}
                    />
                    {#if fieldErrors.firstName}
                      <span
                        class="page-contact__field-error"
                        id="err-first-name"
                        role="alert"
                        data-testid="error-first-name"
                      >
                        {fieldErrors.firstName}
                      </span>
                    {/if}
                  </div>
                  <div class="page-contact__field">
                    <label class="page-contact__label" for="field-last-name">
                      Nom<span class="page-contact__required" aria-hidden="true"> *</span>
                    </label>
                    <input
                      class="page-contact__input"
                      id="field-last-name"
                      type="text"
                      required
                      autocomplete="family-name"
                      aria-required="true"
                      aria-describedby={fieldErrors.lastName ? "err-last-name" : undefined}
                      data-testid="input-last-name"
                      bind:value={form.lastName}
                    />
                    {#if fieldErrors.lastName}
                      <span
                        class="page-contact__field-error"
                        id="err-last-name"
                        role="alert"
                        data-testid="error-last-name"
                      >
                        {fieldErrors.lastName}
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- Courriel -->
                <div class="page-contact__field" transition:fade={{ duration: 150 }}>
                  <label class="page-contact__label" for="field-email">
                    Courriel<span class="page-contact__required" aria-hidden="true"> *</span>
                  </label>
                  <input
                    class="page-contact__input"
                    id="field-email"
                    type="email"
                    required
                    autocomplete="email"
                    aria-required="true"
                    aria-describedby={fieldErrors.email ? "err-email" : undefined}
                    data-testid="input-email"
                    bind:value={form.email}
                  />
                  {#if fieldErrors.email}
                    <span
                      class="page-contact__field-error"
                      id="err-email"
                      role="alert"
                      data-testid="error-email"
                    >
                      {fieldErrors.email}
                    </span>
                  {/if}
                </div>
              {/if}

              <!-- Dates -->
              <div class="page-contact__field-row">
                <div class="page-contact__field">
                  <label class="page-contact__label" for="field-checkin">Date d'arrivée</label>
                  <input
                    class="page-contact__input"
                    id="field-checkin"
                    type="date"
                    data-testid="input-checkin"
                    bind:value={form.checkIn}
                  />
                </div>
                <div class="page-contact__field">
                  <label class="page-contact__label" for="field-checkout">Date de départ</label>
                  <input
                    class="page-contact__input"
                    id="field-checkout"
                    type="date"
                    min={form.checkIn || undefined}
                    aria-describedby={fieldErrors.checkOut ? "err-checkout" : undefined}
                    data-testid="input-checkout"
                    bind:value={form.checkOut}
                  />
                  {#if fieldErrors.checkOut}
                    <span
                      transition:fade={{ duration: 150 }}
                      class="page-contact__field-error"
                      id="err-checkout"
                      role="alert"
                      data-testid="error-checkout"
                    >
                      {fieldErrors.checkOut}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Personnes + Nombre de chambres -->
              <div class="page-contact__field-row">
                <div class="page-contact__field">
                  <label class="page-contact__label" for="field-guests">Nombre de personnes</label>
                  <input
                    class="page-contact__input"
                    id="field-guests"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    data-testid="input-guests"
                    bind:value={form.guests}
                  />
                </div>
                <div class="page-contact__field">
                  <label class="page-contact__label" for="field-rooms">
                    Nombre de chambres<span class="page-contact__required" aria-hidden="true"> *</span>
                  </label>
                  <input
                    class="page-contact__input"
                    id="field-rooms"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    required
                    aria-required="true"
                    aria-describedby={fieldErrors.roomCount ? "err-rooms" : undefined}
                    data-testid="input-rooms"
                    bind:value={form.roomCount}
                  />
                  {#if fieldErrors.roomCount}
                    <span
                      class="page-contact__field-error"
                      id="err-rooms"
                      role="alert"
                      data-testid="error-rooms"
                    >
                      {fieldErrors.roomCount}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Message -->
              <div class="page-contact__field">
                <label class="page-contact__label" for="field-message">Message</label>
                <textarea
                  class="page-contact__input page-contact__input--textarea"
                  id="field-message"
                  rows="4"
                  data-testid="input-message"
                  placeholder="Demandes spéciales, horaires, besoins particuliers…"
                  bind:value={form.message}
                ></textarea>
              </div>

              <!-- API error banner -->
              {#if status === "error"}
                <div
                  class="page-contact__error-banner"
                  id="form-error-region"
                  role="alert"
                  data-testid="contact-error"
                >
                  <span class="page-contact__error-msg">{errorMsg}</span>
                  <span>
                    En attendant, appelez-nous&nbsp;:
                    <a class="page-contact__error-phone" href={SITE.phoneHref}>{SITE.phone}</a>
                  </span>
                </div>
              {/if}

              <!-- Submit -->
              <div class="page-contact__submit">
                <Button type="submit" variant="action" disabled={status === "sending"}>
                  <span class="page-contact__submit-inner" aria-live="polite">
                    {#if status === "sending"}
                      <span class="page-contact__spinner" aria-hidden="true"></span>
                      Envoi en cours…
                    {:else}
                      Envoyer la demande
                    {/if}
                  </span>
                </Button>
              </div>
            </form>
          {/if}
        </div>
      </div>

      <!-- ── INFO COLUMN ── -->
      <div class="page-contact__info-col" use:reveal={{ delay: 0.14 }}>
        <div class="page-contact__info-section">
          <SectionLabel text="Coordonnées" />
          <address class="page-contact__address">
            <span>{SITE.address.street}</span>
            <span>{SITE.address.city}, {SITE.address.province}</span>
            <span>{SITE.address.postal}</span>
          </address>
        </div>

        <hr class="page-contact__divider" aria-hidden="true" />

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">Téléphone</span>
          <a class="page-contact__phone-link" href={SITE.phoneHref}>{SITE.phone}</a>
        </div>

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">Courriel</span>
          <a class="page-contact__email-link" href="mailto:{settings.contactEmail || DEFAULTS.contactEmail}">{settings.contactEmail || DEFAULTS.contactEmail}</a>
        </div>

        <hr class="page-contact__divider" aria-hidden="true" />

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">Horaires</span>
          <dl class="page-contact__hours">
            <div class="page-contact__hour-row">
              <dt>Arrivée</dt>
              <dd>dès 15 h</dd>
            </div>
            <div class="page-contact__hour-row">
              <dt>Départ</dt>
              <dd>avant 11 h</dd>
            </div>
            <div class="page-contact__hour-row">
              <dt>Réception</dt>
              <dd>7 h – 22 h</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PHONE CTA STRIP ──────────────────────────────────── -->
  <section class="page-contact__strip">
    <div class="page-contact__strip-inner">
      <p class="page-contact__strip-text">
        Préférez-vous la voix&nbsp;? Notre équipe répond du matin au soir.
      </p>
      <a class="page-contact__strip-phone" href={SITE.phoneHref}>{SITE.phone}</a>
    </div>
  </section>
</div>

<style>
  /* ── Layout shell ─────────────────────────────────────── */
  .page-contact {
    background-color: var(--color-surface);
    color: var(--color-ink);
  }

  /* ── Hero header ──────────────────────────────────────── */
  .page-contact__hero {
    border-bottom: 1px solid var(--color-outline-variant);
    padding: var(--space-3xl) 0 var(--space-2xl);
  }

  .page-contact__hero-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--space-xl);
  }

  .page-contact__title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(2.5rem, 6vw, 4rem);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: var(--space-md) 0 0;
  }

  .page-contact__lead {
    font-family: var(--font-sans);
    font-size: 18px;
    font-weight: 400;
    line-height: 1.65;
    color: var(--color-ink-soft);
    max-width: 52ch;
    margin: var(--space-md) 0 0;
  }

  /* ── Body: two-col grid ───────────────────────────────── */
  .page-contact__body {
    padding: var(--space-3xl) 0;
  }

  .page-contact__body-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--space-xl);
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2xl);
  }

  @media (min-width: 1024px) {
    .page-contact__body-inner {
      grid-template-columns: 3fr 2fr;
      align-items: start;
    }
  }

  /* ── Form card ────────────────────────────────────────── */
  .page-contact__form-card {
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
  }

  .page-contact__form-header {
    margin-bottom: var(--space-lg);
  }

  .page-contact__form-desc {
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-ink-soft);
    margin: var(--space-sm) 0 0;
  }

  /* ── Form fields ──────────────────────────────────────── */
  .page-contact__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-top: var(--space-xl);
  }

  .page-contact__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .page-contact__field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
  }

  @media (max-width: 480px) {
    .page-contact__field-row {
      grid-template-columns: 1fr;
    }
  }

  .page-contact__label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-soft);
    display: block;
  }

  .page-contact__required {
    color: var(--color-terracotta);
  }

  .page-contact__input {
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: 10px var(--space-md);
    min-height: 44px;
    width: 100%;
    outline: none;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
    -webkit-appearance: none;
    appearance: none;
  }

  .page-contact__input:focus {
    border-color: var(--color-terracotta);
    box-shadow: 0 0 0 2px var(--color-terracotta);
  }

  .page-contact__input:hover:not(:focus) {
    border-color: var(--color-outline);
  }

  .page-contact__input--textarea {
    min-height: 112px;
    resize: vertical;
    line-height: 1.65;
    padding-top: var(--space-md);
  }

  /* ── Logged-in identity indicator ─────────────────────── */
  .page-contact__identity {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-md);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    background-color: var(--color-surface-2);
  }

  .page-contact__identity-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-mute, var(--color-ink-soft));
  }

  .page-contact__identity-value {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-mute, var(--color-ink-soft));
    word-break: break-word;
  }

  /* ── Field-level errors ───────────────────────────────── */
  .page-contact__field-error {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--color-error);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }

  /* ── Form-level error banner ──────────────────────────── */
  .page-contact__error-banner {
    background-color: color-mix(in srgb, var(--color-error) 6%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-error) 35%, transparent);
    border-radius: var(--radius);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .page-contact__error-msg {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-error);
    display: block;
  }

  .page-contact__error-banner > *:not(.page-contact__error-msg) {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--color-ink-soft);
  }

  .page-contact__error-phone {
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-weight: 400;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .page-contact__error-phone:hover {
    color: var(--color-terracotta);
  }

  /* ── Submit area ──────────────────────────────────────── */
  .page-contact__submit {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-xs);
  }

  .page-contact__submit-inner {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* ── Spinner ──────────────────────────────────────────── */
  .page-contact__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: pc-spin 650ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes pc-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-contact__spinner {
      animation: none;
      opacity: 0.6;
    }
  }

  /* ── Success state ────────────────────────────────────── */
  .page-contact__success {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-contact__success-title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: 0;
    outline: none;
  }

  .page-contact__success-title:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 4px;
    border-radius: 2px;
  }

  .page-contact__success-badge {
    width: 40px;
    height: 4px;
    background-color: var(--color-ember);
    border-radius: 2px;
    margin-bottom: var(--space-xs);
  }

  .page-contact__success-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-soft);
    max-width: 48ch;
    margin: 0;
  }

  .page-contact__success-cta {
    background-color: var(--color-surface-2);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: var(--space-md) var(--space-lg);
    margin-top: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* ── Info column ──────────────────────────────────────── */
  .page-contact__info-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-contact__info-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .page-contact__divider {
    border: none;
    border-top: 1px solid var(--color-outline-variant);
    margin: 0;
  }

  .page-contact__tech-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-soft);
    display: block;
  }

  .page-contact__address {
    font-family: var(--font-sans);
    font-size: 15px;
    font-style: normal;
    line-height: 1.8;
    color: var(--color-ink);
    display: flex;
    flex-direction: column;
  }

  .page-contact__phone-link {
    font-family: var(--font-mono);
    font-size: 22px;
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    text-decoration: none;
    transition: color 150ms ease;
  }

  .page-contact__phone-link:hover {
    color: var(--color-terracotta);
  }

  .page-contact__phone-link:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
    border-radius: 2px;
  }

  .page-contact__email-link {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink-soft);
    text-decoration: underline;
    text-decoration-color: var(--color-outline-variant);
    text-underline-offset: 4px;
    word-break: break-all;
    transition:
      color 150ms ease,
      text-decoration-color 150ms ease;
  }

  .page-contact__email-link:hover {
    color: var(--color-terracotta);
    text-decoration-color: var(--color-terracotta);
  }

  .page-contact__email-link:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
    border-radius: 2px;
  }

  /* ── Hours ────────────────────────────────────────────── */
  .page-contact__hours {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
  }

  .page-contact__hour-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-outline-variant);
  }

  .page-contact__hour-row:last-child {
    border-bottom: none;
  }

  .page-contact__hour-row dt {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-soft);
  }

  .page-contact__hour-row dd {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink);
    margin: 0;
  }

  /* ── Phone CTA strip ──────────────────────────────────── */
  .page-contact__strip {
    background-color: var(--color-charcoal);
    color: var(--color-inverse-on-surface);
    border-top: 1px solid var(--color-outline-variant);
  }

  .page-contact__strip-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    align-items: flex-start;
  }

  @media (min-width: 768px) {
    .page-contact__strip-inner {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }

  .page-contact__strip-text {
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--color-inverse-on-surface);
    opacity: 0.8;
    margin: 0;
    max-width: 40ch;
  }

  .page-contact__strip-phone {
    font-family: var(--font-mono);
    font-size: clamp(1.25rem, 3vw, 1.75rem);
    font-weight: 400;
    color: var(--color-inverse-on-surface);
    text-decoration: none;
    transition: opacity 150ms ease;
    white-space: nowrap;
  }

  .page-contact__strip-phone:hover {
    opacity: 0.75;
  }

  .page-contact__strip-phone:focus-visible {
    outline: 2px solid var(--color-ember);
    outline-offset: 3px;
    border-radius: 2px;
  }

  /* ── Mobile padding adjustments ───────────────────────── */
  @media (max-width: 767px) {
    .page-contact__hero-inner,
    .page-contact__body-inner {
      padding: 0 var(--space-md);
    }

    .page-contact__hero {
      padding: var(--space-2xl) 0 var(--space-xl);
    }

    .page-contact__form-card {
      padding: var(--space-xl) var(--space-lg);
    }

    .page-contact__strip-inner {
      padding: var(--space-lg) var(--space-md);
    }
  }
</style>

<Seo
  title="Contact — Auberge du Vieux Pont"
  description="Contactez L'Auberge du Vieux Pont à Saint-Raymond : réservations, tarifs d'entreprise et demandes d'information. Téléphone 418 655-1212."
  path="/contact"
  schema={[
    breadcrumbSchema([
      { name: "Accueil", path: "/" },
      { name: "Contact", path: "/contact" },
    ]),
  ]}
/>
