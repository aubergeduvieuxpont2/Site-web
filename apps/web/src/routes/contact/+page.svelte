<script lang="ts">
  import { fade } from "svelte/transition";
  import { reveal } from "$lib/motion";
  import { createReservation, isError, getAvailability } from "$lib/api";
  import { SITE, phoneToHref } from "$lib/content";
  import { settings } from "$lib/settings.svelte";
  import {
    datesOutOfOrder,
    nightsBetween,
    estimateStay,
    formatDateOnly,
  } from "$lib/utils";
  import { DEFAULTS } from "$lib/content";
  import Seo from "$lib/components/Seo.svelte";
  import { breadcrumbSchema } from "$lib/seo";
  import { auth } from "$lib/auth.svelte";
  import Button from "$lib/components/Button.svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import { t, locale } from "$lib/i18n.svelte";
  import { getStripe } from "$lib/stripe";

  // Minimal interface for the mounted checkout (avoids importing Stripe types directly).
  interface EmbeddedCheckoutInstance {
    mount(container: HTMLElement): void;
    destroy(): void;
  }

  // Shape returned by the updated POST /api/reservations endpoint.
  interface ReservationHoldResponse {
    reservationId: number;
    clientSecret: string;
    holdExpiresAt: string;
  }

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

  type Status = "idle" | "sending" | "paying" | "expired" | "error" | "misconfigured";
  let status = $state<Status>("idle");
  let errorMsg = $state("");

  // Payment-flow state
  let clientSecret = $state("");
  let holdExpiresAt = $state("");
  let secondsLeft = $state(0);
  // Container element for Stripe Embedded Checkout (bound via bind:this).
  let checkoutEl = $state<HTMLDivElement | null>(null);

  // Configured contact phone with graceful fallback to the static default.
  const phoneDisplay = $derived(settings.contactPhone || SITE.phone);
  const phoneHref = $derived(phoneToHref(settings.contactPhone));

  // Lightweight required-field errors, shown only after a submit attempt.
  let fieldErrors = $state<{
    firstName?: string;
    lastName?: string;
    email?: string;
    roomCount?: string;
    checkOut?: string;
  }>({});

  const loggedIn = $derived(!!auth.user);

  const nightlyRate = $derived(
    auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice
  );
  const isCustomRate = $derived(
    auth.user?.effectiveNightlyPrice != null &&
      auth.user.effectiveNightlyPrice !== settings.nightlyPrice
  );
  const weeklyRate = $derived(
    auth.user?.effectiveWeeklyPrice ?? settings.weeklyPrice ?? 560
  );
  const nights = $derived(nightsBetween(form.checkIn, form.checkOut));
  const rooms = $derived(Math.max(0, Math.trunc(Number(form.roomCount) || 0)));
  const estimateVisible = $derived(nights >= 1 && rooms >= 1);
  const estimate = $derived(
    estimateStay(
      nights,
      rooms,
      nightlyRate,
      {
        accommodationTax: settings.accommodationTax,
        tps: settings.tps,
        tvq: settings.tvq,
      },
      weeklyRate
    )
  );

  const minCheckOut = $derived.by((): string => {
    if (!form.checkIn) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.checkIn);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  });

  $effect(() => {
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) {
      form.checkOut = "";
    }
  });

  // ── Availability ─────────────────────────────────────────────────
  type AvailStatus = "idle" | "loading" | "available" | "unavailable" | "error";
  let availabilityStatus = $state<AvailStatus>("idle");
  let unavailableNights = $state<string[]>([]);

  $effect(() => {
    const ci = form.checkIn;
    const co = form.checkOut;
    const rc = Math.max(1, Math.trunc(Number(form.roomCount) || 1));

    if (!ci || !co || co <= ci) {
      availabilityStatus = "idle";
      unavailableNights = [];
      return;
    }

    availabilityStatus = "loading";
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await getAvailability(ci, co, rc);
      if (cancelled) return;
      if (isError(result)) {
        availabilityStatus = "error";
        unavailableNights = [];
      } else {
        unavailableNights = result.unavailableNights;
        availabilityStatus = result.allAvailable ? "available" : "unavailable";
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  const submitDisabled = $derived(
    status === "sending" ||
      !settings.reservationsEnabled ||
      availabilityStatus === "unavailable" ||
      availabilityStatus === "loading"
  );

  // ── Countdown timer ───────────────────────────────────────────────
  // Ticks every second while in paying state. Transitions to expired when
  // the remaining time reaches zero (the server hold is authoritative; this
  // countdown is cosmetic and indicates urgency to the guest).
  $effect(() => {
    if (status !== "paying" || !holdExpiresAt) return;
    const expireMs = new Date(holdExpiresAt).getTime();
    const tick = () => {
      const ms = expireMs - Date.now();
      secondsLeft = Math.max(0, Math.ceil(ms / 1000));
      if (secondsLeft === 0) status = "expired";
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  });

  // ── Stripe Embedded Checkout mount/unmount ────────────────────────
  // Lazily loads the Stripe SDK (only when clientSecret is present) and
  // mounts the embedded checkout into the container element.
  // INV-no-dangling-iframe: the cleanup function always destroys the instance
  // on every exit from the paying state (expiry, teardown, or navigation).
  $effect(() => {
    if (status !== "paying" || !clientSecret || !checkoutEl) return;
    let alive = true;
    let instance: EmbeddedCheckoutInstance | null = null;

    (async () => {
      const stripe = await getStripe();
      if (!alive) return;
      if (!stripe) {
        status = "misconfigured";
        return;
      }
      // stripe.initEmbeddedCheckout is typed via the Stripe type from $lib/stripe.
      const co = await (stripe as unknown as {
        initEmbeddedCheckout(opts: { clientSecret: string }): Promise<EmbeddedCheckoutInstance>;
      }).initEmbeddedCheckout({ clientSecret });
      if (!alive) {
        co.destroy();
        return;
      }
      instance = co;
      co.mount(checkoutEl!);
    })();

    return () => {
      alive = false;
      instance?.destroy();
    };
  });

  function formatRate(value: number): string {
    return new Intl.NumberFormat(locale.current === 'en' ? 'en-CA' : 'fr-CA', {
      style: "currency",
      currency: "CAD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatPct(value: number): string {
    return (
      new Intl.NumberFormat(locale.current === 'en' ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 3 }).format(value) + " %"
    );
  }

  function splitName(full: string | null | undefined): {
    first: string;
    last: string;
  } {
    const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    const [first, ...rest] = parts;
    return { first, last: rest.join(" ") || first };
  }

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

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateClient(): boolean {
    const errors: typeof fieldErrors = {};
    if (!loggedIn) {
      if (!form.firstName.trim()) errors.firstName = t('contact.errors.firstNameRequired');
      if (!form.lastName.trim()) errors.lastName = t('contact.errors.lastNameRequired');
      if (!form.email.trim()) errors.email = t('contact.errors.emailRequired');
      else if (!EMAIL_RE.test(form.email.trim()))
        errors.email = t('contact.errors.emailInvalid');
    }
    if (!(Number(form.roomCount) >= 1))
      errors.roomCount = t('contact.errors.roomCountRequired');
    if (datesOutOfOrder(form.checkIn, form.checkOut))
      errors.checkOut = t('contact.errors.checkOutOrder');
    fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  /** Reset back to the booking form (from expired or misconfigured states). */
  function resetToForm() {
    status = "idle";
    clientSecret = "";
    holdExpiresAt = "";
    secondsLeft = 0;
    errorMsg = "";
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitDisabled) return;
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
      // Cast to the updated contract shape (api.ts updated by Stream 3 build).
      const data = result as unknown as ReservationHoldResponse;
      if (!data.clientSecret) {
        status = "misconfigured";
      } else {
        clientSecret = data.clientSecret;
        holdExpiresAt = data.holdExpiresAt;
        status = "paying";
      }
    }
  }
</script>

<div class="page-contact" data-testid="page-contact">
  <!-- ── HERO ─────────────────────────────────────────────── -->
  <section class="page-contact__hero">
    <div class="page-contact__hero-inner">
      <SectionLabel text={t('contact.hero.sectionLabel')} showHairline={true} />
      <h1 class="page-contact__title">{t('contact.hero.title')}</h1>
      <p class="page-contact__lead">
        {t('contact.hero.lead')}
      </p>
    </div>
  </section>

  <!-- ── BODY ─────────────────────────────────────────────── -->
  <section class="page-contact__body">
    <div class="page-contact__body-inner">
      <!-- ── FORM COLUMN ── -->
      <div class="page-contact__form-col" use:reveal>
        <div class="page-contact__form-card">

          {#if status === "paying"}
            <!-- ── PAYMENT STATE ── -->
            <div class="page-contact__payment" data-testid="contact-payment">
              <h2 class="page-contact__payment-heading">
                {t('contact.payment.heading')}
              </h2>
              <div
                class="page-contact__hold-notice"
                data-testid="payment-hold-notice"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p class="page-contact__hold-message">
                  {t('contact.payment.holdMessage')}
                </p>
                <p class="page-contact__countdown" data-testid="payment-countdown">
                  {t('contact.payment.countdownLabel', { minutes: String(Math.floor(secondsLeft / 60)).padStart(2, '0'), seconds: String(secondsLeft % 60).padStart(2, '0') })}
                </p>
              </div>
              <!-- Stripe Embedded Checkout mounts here (INV-no-dangling-iframe). -->
              <div
                class="page-contact__checkout-container"
                data-testid="embedded-checkout"
                bind:this={checkoutEl}
              ></div>
            </div>

          {:else if status === "expired"}
            <!-- ── EXPIRED STATE ── -->
            <div class="page-contact__expired" data-testid="payment-expired">
              <div class="page-contact__expired-badge" aria-hidden="true"></div>
              <h2 class="page-contact__expired-heading">
                {t('contact.payment.expiredTitle')}
              </h2>
              <p class="page-contact__expired-body">
                {t('contact.payment.expiredBody')}
              </p>
              <div class="page-contact__expired-actions">
                <button
                  class="page-contact__back-btn"
                  type="button"
                  onclick={resetToForm}
                  data-testid="payment-back"
                >
                  {t('contact.payment.backToForm')}
                </button>
              </div>
            </div>

          {:else if status === "misconfigured"}
            <!-- ── MISSING-CONFIGURATION STATE ── -->
            <div class="page-contact__misconfigured" data-testid="payment-misconfigured">
              <p class="page-contact__misconfigured-body">
                {t('contact.payment.unavailable')}
              </p>
              <div class="page-contact__misconfigured-cta">
                <span class="page-contact__tech-label">{t('contact.success.urgentLabel')}</span>
                <a class="page-contact__phone-link" href={phoneHref}>{phoneDisplay}</a>
              </div>
              <div class="page-contact__misconfigured-back">
                <button
                  class="page-contact__back-btn page-contact__back-btn--secondary"
                  type="button"
                  onclick={resetToForm}
                >
                  {t('contact.payment.backToForm')}
                </button>
              </div>
            </div>

          {:else}
            <!-- ── FORM STATE (idle / sending / error) ── -->
            <div class="page-contact__form-header">
              <SectionLabel text={t('contact.form.sectionLabel')} />
              <p class="page-contact__form-desc">
                {t('contact.form.desc')}
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
                <div
                  class="page-contact__identity"
                  data-testid="contact-identity"
                  aria-live="polite"
                  transition:fade={{ duration: 150 }}
                >
                  <span class="page-contact__identity-label"
                    >{t('contact.form.identityLabel')}</span
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
                      {t('contact.form.firstName')}<span class="page-contact__required" aria-hidden="true"> *</span>
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
                      {t('contact.form.lastName')}<span class="page-contact__required" aria-hidden="true"> *</span>
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
                    {t('contact.form.email')}<span class="page-contact__required" aria-hidden="true"> *</span>
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
                  <label class="page-contact__label" for="field-checkin">{t('contact.form.checkIn')}</label>
                  <input
                    class="page-contact__input"
                    id="field-checkin"
                    type="date"
                    data-testid="input-checkin"
                    bind:value={form.checkIn}
                  />
                </div>
                <div class="page-contact__field">
                  <label class="page-contact__label" for="field-checkout">{t('contact.form.checkOut')}</label>
                  <input
                    class="page-contact__input"
                    id="field-checkout"
                    type="date"
                    min={minCheckOut || undefined}
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
                  <label class="page-contact__label" for="field-guests">{t('contact.form.guests')}</label>
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
                    {t('contact.form.roomCount')}<span class="page-contact__required" aria-hidden="true"> *</span>
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

              <!-- Rate line — always rendered while the form is visible -->
              <div
                class="page-contact__rate-line"
                data-testid="contact-rate-line"
                role="status"
                aria-live="polite"
              >
                <span class="page-contact__rate-label">{t('contact.form.rateLabel')}</span>
                <span class="page-contact__rate-value">{formatRate(nightlyRate)} {t('contact.form.rateUnit')}</span>
                {#if isCustomRate}
                  <span
                    class="page-contact__rate-badge"
                    data-testid="contact-rate-badge"
                    aria-label={t('contact.form.customRateAriaLabel')}
                  >{t('contact.form.customRateBadge')}</span>
                {/if}
              </div>

              <!-- Weekly-rate hint — shown once the stay reaches a full week -->
              {#if nights >= 7}
                <div
                  class="page-contact__weekly-hint"
                  data-testid="weekly-rate-hint"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span class="page-contact__tech-label">{t('contact.form.weeklyRateLabel')}</span>
                  <span
                    class="page-contact__weekly-rate"
                    data-testid="weekly-rate-value"
                  >
                    {formatRate(weeklyRate)} {t('contact.form.weeklyRateUnit')}
                  </span>
                </div>
              {/if}

              <!-- Estimate panel — fades in when nights ≥ 1 and rooms ≥ 1 -->
              {#if estimateVisible}
                <div
                  class="page-contact__estimate"
                  data-testid="contact-estimate"
                  role="status"
                  aria-live="polite"
                  transition:fade={{ duration: 200 }}
                >
                  <dl class="page-contact__estimate-rows">
                    <div class="page-contact__estimate-row" data-testid="estimate-base">
                      <dt class="page-contact__estimate-label">
                        {t('contact.estimate.base', { nights: String(nights), rooms: String(rooms), rate: formatRate(nightlyRate) })}
                      </dt>
                      <dd class="page-contact__estimate-amount">{formatRate(estimate.base)}</dd>
                    </div>

                    <div class="page-contact__estimate-row" data-testid="estimate-hebergement">
                      <dt class="page-contact__estimate-label page-contact__estimate-label--tax">
                        {t('contact.estimate.hebergement', { pct: formatPct(settings.accommodationTax) })}
                      </dt>
                      <dd class="page-contact__estimate-amount page-contact__estimate-amount--tax">{formatRate(estimate.hebergementTax)}</dd>
                    </div>

                    <div class="page-contact__estimate-row" data-testid="estimate-tps">
                      <dt class="page-contact__estimate-label page-contact__estimate-label--tax">
                        {t('contact.estimate.tps', { pct: formatPct(settings.tps) })}
                      </dt>
                      <dd class="page-contact__estimate-amount page-contact__estimate-amount--tax">{formatRate(estimate.tps)}</dd>
                    </div>

                    <div class="page-contact__estimate-row" data-testid="estimate-tvq">
                      <dt class="page-contact__estimate-label page-contact__estimate-label--tax">
                        {t('contact.estimate.tvq', { pct: formatPct(settings.tvq) })}
                      </dt>
                      <dd class="page-contact__estimate-amount page-contact__estimate-amount--tax">{formatRate(estimate.tvq)}</dd>
                    </div>

                    <div class="page-contact__estimate-row page-contact__estimate-row--total" data-testid="estimate-total">
                      <dt class="page-contact__estimate-label page-contact__estimate-label--total">
                        {t('contact.estimate.total')}
                      </dt>
                      <dd class="page-contact__estimate-amount page-contact__estimate-total">{formatRate(estimate.total)}</dd>
                    </div>
                  </dl>
                </div>
              {/if}

              <!-- Availability: blocked-nights warning (hard-blocks submit) -->
              {#if availabilityStatus === "unavailable"}
                <div
                  class="page-contact__avail-warning"
                  role="alert"
                  data-testid="availability-warning"
                  aria-atomic="true"
                  aria-live="assertive"
                >
                  <p class="page-contact__avail-title">
                    {t('contact.availability.unavailableTitle')}
                  </p>
                  <ul
                    class="page-contact__avail-nights"
                    data-testid="blocked-nights-list"
                  >
                    {#each unavailableNights as night (night)}
                      <li data-testid="blocked-night">{formatDateOnly(night)}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <!-- Availability: soft error (submit still allowed; server re-checks) -->
              {#if availabilityStatus === "error"}
                <div
                  class="page-contact__avail-soft"
                  role="status"
                  data-testid="availability-error"
                  aria-live="polite"
                >
                  {t('contact.availability.error')}
                </div>
              {/if}

              <!-- Message -->
              <div class="page-contact__field">
                <label class="page-contact__label" for="field-message">{t('contact.form.message')}</label>
                <textarea
                  class="page-contact__input page-contact__input--textarea"
                  id="field-message"
                  rows="4"
                  data-testid="input-message"
                  placeholder={t('contact.form.messagePlaceholder')}
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
                    {t('contact.form.errorCallout')}
                    <a class="page-contact__error-phone" href={phoneHref}>{phoneDisplay}</a>
                  </span>
                </div>
              {/if}

              <!-- Maintenance notice — reservations globally paused -->
              {#if !settings.reservationsEnabled}
                <div
                  class="page-contact__maintenance-notice"
                  role="status"
                  data-testid="maintenance-notice"
                  aria-live="polite"
                >
                  {t('contact.form.maintenanceNotice')}
                </div>
              {/if}

              <!-- Submit -->
              <div class="page-contact__submit" data-testid="contact-submit">
                <Button type="submit" variant="action" disabled={submitDisabled}>
                  <span class="page-contact__submit-inner" aria-live="polite">
                    {#if status === "sending"}
                      <span class="page-contact__spinner" aria-hidden="true"></span>
                      {t('contact.form.sending')}
                    {:else}
                      {t('contact.form.submit')}
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
          <SectionLabel text={t('contact.info.coordonnees')} />
          <address class="page-contact__address">
            <span>{SITE.address.street}</span>
            <span>{SITE.address.city}, {SITE.address.province}</span>
            <span>{SITE.address.postal}</span>
          </address>
        </div>

        <hr class="page-contact__divider" aria-hidden="true" />

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">{t('contact.info.telephone')}</span>
          <a class="page-contact__phone-link" href={phoneHref}>{phoneDisplay}</a>
        </div>

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">{t('contact.info.courriel')}</span>
          <a class="page-contact__email-link" href="mailto:{settings.contactEmail || DEFAULTS.contactEmail}">{settings.contactEmail || DEFAULTS.contactEmail}</a>
        </div>

        <hr class="page-contact__divider" aria-hidden="true" />

        <div class="page-contact__info-section">
          <span class="page-contact__tech-label">{t('contact.info.horaires')}</span>
          <dl class="page-contact__hours">
            <div class="page-contact__hour-row">
              <dt>{t('contact.hours.checkIn.label')}</dt>
              <dd>{t('contact.hours.checkIn.value')}</dd>
            </div>
            <div class="page-contact__hour-row">
              <dt>{t('contact.hours.checkOut.label')}</dt>
              <dd>{t('contact.hours.checkOut.value')}</dd>
            </div>
            <div class="page-contact__hour-row">
              <dt>{t('contact.hours.reception.label')}</dt>
              <dd>{t('contact.hours.reception.value')}</dd>
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
        {t('contact.strip.text')}
      </p>
      <a class="page-contact__strip-phone" href={phoneHref}>{phoneDisplay}</a>
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

  /* ── Rate line ────────────────────────────────────────── */
  .page-contact__rate-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm);
    column-gap: var(--space-md);
  }

  .page-contact__rate-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-mute, #76777d);
  }

  .page-contact__rate-value {
    font-family: var(--font-mono);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink, #191c1e);
  }

  .page-contact__rate-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-xs, 0.5rem);
    background-color: var(--color-ember-pale, #ffdbca);
    border: 1px solid rgba(92, 36, 0, 0.22);
    border-radius: 2px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5c2400;
    white-space: nowrap;
  }

  /* ── Estimate panel ───────────────────────────────────── */
  .page-contact__estimate {
    background-color: var(--color-surface-container-low, #f2f4f6);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius-lg);
    padding: var(--space-md) var(--space-lg);
    margin-top: var(--space-sm);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.65;
    color: var(--color-ink, #191c1e);
    overflow-wrap: break-word;
  }

  .page-contact__estimate-total {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-ink, #191c1e);
  }

  .page-contact__estimate-rows {
    margin: 0;
    padding: 0;
  }

  .page-contact__estimate-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
  }

  .page-contact__estimate-row:last-child {
    border-bottom: none;
  }

  .page-contact__estimate-row--total {
    border-top: 2px solid var(--color-ember);
    border-bottom: none;
  }

  .page-contact__estimate-label {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 400;
    color: var(--color-ink, #191c1e);
    flex: 1;
    min-width: 0;
    margin: 0;
  }

  .page-contact__estimate-label--tax {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-soft);
  }

  .page-contact__estimate-label--total {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-ink, #191c1e);
  }

  .page-contact__estimate-amount {
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink, #191c1e);
    text-align: right;
    flex-shrink: 0;
    margin: 0;
  }

  .page-contact__estimate-amount--tax {
    color: var(--color-ink-soft);
  }

  @media (max-width: 480px) {
    .page-contact__estimate {
      font-size: 13px;
      padding: var(--space-sm) var(--space-md);
      word-break: break-word;
    }

    .page-contact__estimate-total {
      font-size: 14px;
    }

    .page-contact__estimate-label--tax {
      font-size: 11px;
    }

    .page-contact__estimate-amount {
      font-size: 12px;
    }
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

  /* ── Payment section ──────────────────────────────────── */
  .page-contact__payment {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-contact__payment-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(1.5rem, 3vw, 2rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: 0;
  }

  .page-contact__hold-notice {
    background-color: var(--color-surface-container-low, #f2f4f6);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: var(--space-md) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .page-contact__hold-message {
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-ink-soft);
    margin: 0;
  }

  .page-contact__countdown {
    font-family: var(--font-mono);
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--color-ink);
    letter-spacing: 0.04em;
    margin: 0;
  }

  /* The Stripe iframe fills the container; no min-height needed since Stripe
     sizes the iframe to its own content. overflow:hidden prevents horizontal
     bleed at mobile widths (INV-no-dangling-iframe / responsive requirement). */
  .page-contact__checkout-container {
    width: 100%;
    overflow: hidden;
  }

  /* ── Expired state ────────────────────────────────────── */
  .page-contact__expired {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-contact__expired-badge {
    width: 40px;
    height: 4px;
    background-color: var(--color-error, #ba1a1a);
    border-radius: 2px;
    margin-bottom: var(--space-xs);
  }

  .page-contact__expired-heading {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(1.5rem, 3vw, 2rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: 0;
  }

  .page-contact__expired-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-soft);
    max-width: 48ch;
    margin: 0;
  }

  .page-contact__expired-actions {
    margin-top: var(--space-sm);
  }

  /* ── Missing-configuration state ─────────────────────── */
  .page-contact__misconfigured {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .page-contact__misconfigured-body {
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-soft);
    max-width: 48ch;
    margin: 0;
  }

  .page-contact__misconfigured-cta {
    background-color: var(--color-surface-2);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: var(--space-md) var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .page-contact__misconfigured-back {
    margin-top: var(--space-xs);
  }

  /* ── Back / restart button ────────────────────────────── */
  .page-contact__back-btn {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-ink);
    background: transparent;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius);
    padding: 10px var(--space-lg);
    cursor: pointer;
    transition:
      border-color 150ms ease,
      color 150ms ease;
  }

  .page-contact__back-btn:hover {
    border-color: var(--color-outline);
    color: var(--color-terracotta);
  }

  .page-contact__back-btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
    border-radius: 2px;
  }

  .page-contact__back-btn--secondary {
    font-size: 12px;
    opacity: 0.75;
  }

  /* ── Weekly-rate hint ─────────────────────────────────── */
  .page-contact__weekly-hint {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    background: var(--color-forest-surface, #d4ede0);
    border: 1px solid var(--color-forest, #1a5c2d);
    border-radius: 4px;
    margin-top: var(--space-xs);
    transition: opacity 180ms ease;
  }

  .page-contact__weekly-rate {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-forest, #1a5c2d);
    letter-spacing: 0.04em;
  }

  /* ── Availability panels ──────────────────────────────── */
  .page-contact__avail-warning,
  .page-contact__avail-soft {
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    margin-top: var(--space-sm);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
  }

  .page-contact__avail-warning {
    background: #fce8e8;
    border: 1px solid var(--color-error, #ba1a1a);
    color: var(--color-error, #ba1a1a);
  }

  .page-contact__avail-title {
    font-weight: 600;
    margin: 0 0 var(--space-xs) 0;
    color: var(--color-error, #ba1a1a);
  }

  .page-contact__avail-nights {
    margin: 0;
    padding-left: var(--space-md);
    list-style: disc;
  }

  .page-contact__avail-nights li {
    line-height: 1.7;
    color: var(--color-error, #ba1a1a);
  }

  .page-contact__avail-soft {
    background: var(--color-surface-2);
    border: 1px solid var(--color-hairline, var(--color-outline-variant));
    color: var(--color-ink-soft);
  }

  /* ── Maintenance notice ───────────────────────────────── */
  .page-contact__maintenance-notice {
    padding: var(--space-sm) var(--space-md);
    background: var(--color-ember-pale, #ffdbca);
    border: 1px solid var(--color-ember, #ffb690);
    border-radius: 4px;
    color: var(--color-on-secondary-container, #5c2400);
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: var(--space-sm);
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
  title={t('contact.seo.title')}
  description={t('contact.seo.description')}
  path="/contact"
  schema={[
    breadcrumbSchema([
      { name: t('nav.home'), path: '/' },
      { name: t('nav.contact'), path: '/contact' },
    ]),
  ]}
/>
