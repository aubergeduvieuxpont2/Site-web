<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getMe, getProfile, logout, changePassword, changeProfileEmail, isError } from "$lib/api";
  import type { User, ReservationRow } from "$lib/api";
  import ProfilReservationTable from "$lib/components/ProfilReservationTable.svelte";
  import { settings } from "$lib/settings.svelte";
  import { t, locale } from "$lib/i18n.svelte";

  // ── State ────────────────────────────────────────────────────────────
  type Phase = "loading" | "loaded" | "error";

  let phase = $state<Phase>("loading");
  let errorMessage = $state("");
  let user = $state<User | null>(null);
  let reservations = $state<ReservationRow[]>([]);

  // Guard against a double logout click.
  let loggingOut = $state(false);

  // ── Rate display ─────────────────────────────────────────────────────
  // `effectiveNightlyPrice` comes from getMe(); getProfile() may omit it, so
  // the onMount merge preserves it. Falls back to the public nightly price.
  const displayRate = $derived(user?.effectiveNightlyPrice ?? settings.nightlyPrice);
  const isCustomRate = $derived(
    user?.effectiveNightlyPrice != null &&
      user.effectiveNightlyPrice !== settings.nightlyPrice,
  );
  const formattedRate = $derived(
    new Intl.NumberFormat(locale.current === 'en' ? 'en-CA' : 'fr-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(displayRate),
  );

  // ── Change password state ─────────────────────────────────────────────
  let currentPassword = $state("");
  let newPassword = $state("");
  let pwdSubmitting = $state(false);
  let pwdError = $state<string | null>(null);
  let pwdSuccess = $state(false);

  async function handlePasswordChange(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (pwdSubmitting) return;

    pwdError = null;
    pwdSuccess = false;

    if (newPassword.length < 8) {
      pwdError = t('profil.password.errorMinLength');
      return;
    }

    pwdSubmitting = true;
    const result = await changePassword(currentPassword, newPassword);
    pwdSubmitting = false;

    if (isError(result)) {
      pwdError = result.error;
      return;
    }

    pwdSuccess = true;
    currentPassword = "";
    newPassword = "";
  }

  // ── Change email state ────────────────────────────────────────────────
  let emailNew = $state("");
  let emailPassword = $state("");
  let emailSubmitting = $state(false);
  let emailError = $state<string | null>(null);
  let emailSuccess = $state(false);

  async function handleEmailChange(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (emailSubmitting) return;

    emailError = null;
    emailSuccess = false;
    emailSubmitting = true;

    const result = await changeProfileEmail(emailNew, emailPassword);
    emailSubmitting = false;

    if (isError(result)) {
      emailError = result.error; // text binding — never innerHTML
      return;
    }

    // The change is pending confirmation — the address does NOT switch yet, so
    // we deliberately leave the displayed `user.email` untouched. It updates only
    // after the guest follows the link sent to the new address.
    emailSuccess = true;
    emailNew = "";
    emailPassword = "";
  }

  // ── Mount: auth gate → profile fetch ─────────────────────────────────
  onMount(async () => {
    // Step 1 — auth gate. Any error (401 or network) redirects to login; we
    // never surface an error here, so the profile is unreachable unauthenticated.
    const meResult = await getMe();
    if (isError(meResult)) {
      await goto("/connexion");
      return;
    }
    const meUser = meResult.user;
    user = meUser;

    // Admin redirect — admins manage settings in /admin, not here.
    if (user.role === "admin") {
      await goto("/admin");
      return;
    }

    // Step 2 — full profile (reservations).
    const profileResult = await getProfile();
    if (isError(profileResult)) {
      errorMessage = profileResult.error;
      phase = "error";
      return;
    }

    // Merge: profileResult.user carries reservation-related fields; meUser
    // carries effectiveNightlyPrice, which getProfile() does not return.
    user = { ...profileResult.user, effectiveNightlyPrice: meUser.effectiveNightlyPrice };
    reservations = profileResult.reservations;
    phase = "loaded";
  });

  // ── Logout ───────────────────────────────────────────────────────────
  async function handleLogout(): Promise<void> {
    if (loggingOut) return;
    loggingOut = true;
    // Best-effort: the cookie is cleared server-side; ignore transport errors.
    await logout();
    await goto("/");
  }
</script>

<div class="profil" data-testid="profil-page">
  {#if phase === "loading"}
    <!-- PHASE: loading -->
    <div
      class="profil__skeleton"
      aria-label={t('profil.loading')}
      role="status"
      data-testid="profil-skeleton"
    >
      <div class="profil__skeleton-header"></div>
      <div class="profil__skeleton-card"></div>
      <div class="profil__skeleton-row"></div>
      <div class="profil__skeleton-row profil__skeleton-row--short"></div>
      <div class="profil__skeleton-row"></div>
    </div>
  {:else if phase === "error"}
    <!-- PHASE: error (network / unexpected) -->
    <div class="profil__error" role="alert" data-testid="profil-error">
      <span class="profil__tech-label">{t('profil.errorLabel')}</span>
      <p class="profil__error-msg" data-testid="profil-error-message">{errorMessage}</p>
      <a href="/" class="button button--secondary">{t('profil.backHome')}</a>
    </div>
  {:else if user}
    <!-- PHASE: loaded -->
    <div class="profil__content" data-testid="profil-content">
      <!-- ── Page header ── -->
      <header class="profil__page-header">
        <span class="profil__tech-label" data-testid="profil-role-label">
          {user.role === "admin" ? t('profil.roleLabelAdmin') : t('profil.roleLabelGuest')}
        </span>
        <div class="profil__page-header-row">
          <h1 class="profil__title" data-testid="profil-title">
            {user.name ?? user.email}
          </h1>
          <button
            class="button button--secondary profil__logout-btn"
            type="button"
            aria-label={t('profil.logoutAriaLabel')}
            data-testid="profil-logout-btn"
            disabled={loggingOut}
            onclick={handleLogout}
          >
            {t('profil.logout')}
          </button>
        </div>
      </header>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── User info card ── -->
      <section class="profil__section" aria-labelledby="profil-user-heading">
        <h2 id="profil-user-heading" class="profil__section-heading" data-testid="profil-user-heading">
          {t('profil.info.heading')}
        </h2>
        <div class="profil__user-card" data-testid="profil-user-card">
          <dl class="profil__user-dl">
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.info.name')}</dt>
              <dd class="profil__user-dd" data-testid="profil-user-name">{user.name ?? "—"}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.info.email')}</dt>
              <dd class="profil__user-dd" data-testid="profil-user-email">{user.email}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.info.role')}</dt>
              <dd class="profil__user-dd">
                <span
                  class="profil__role-badge {user.role === 'admin'
                    ? 'profil__role-badge--admin'
                    : ''}"
                  data-testid="profil-role-badge"
                >
                  {user.role === "admin" ? t('profil.info.adminRole') : t('profil.info.guestRole')}
                </span>
              </dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.info.rate')}</dt>
              <dd
                class="profil__user-dd profil__user-dd--rate"
                data-testid="profil-user-rate"
              >
                <span class="profil__rate-value">
                  {formattedRate}&nbsp;{t('profil.info.rateUnit')}
                </span>
                {#if isCustomRate}
                  <span
                    class="profil__role-badge profil__role-badge--custom"
                    aria-label={t('profil.info.customRate')}
                    data-testid="profil-rate-badge"
                  >
                    {t('profil.info.customRate')}
                  </span>
                {/if}
              </dd>
            </div>
          </dl>
          {#if user.role === "admin"}
            <a
              href="/admin"
              class="button button--action profil__admin-link"
              data-testid="profil-admin-link"
            >
              {t('profil.info.adminDashboard')}
            </a>
          {/if}
        </div>
      </section>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── Reservations ── -->
      <section class="profil__section" aria-labelledby="profil-res-heading">
        <h2 id="profil-res-heading" class="profil__section-heading" data-testid="profil-res-heading">
          {t('profil.reservations.heading')}
        </h2>

        <ProfilReservationTable {reservations} />
      </section>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── Change password ── -->
      <section
        class="profil__section profil__section--pwd"
        aria-labelledby="profil-pwd-heading"
      >
        <h2
          id="profil-pwd-heading"
          class="profil__section-heading"
          data-testid="profil-pwd-heading"
        >
          {t('profil.password.heading')}
        </h2>

        <form
          class="profil__pwd-form"
          data-testid="profil-pwd-form"
          onsubmit={handlePasswordChange}
          novalidate
        >
          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-pwd-current">
              {t('profil.password.current')}
            </label>
            <input
              id="profil-pwd-current"
              class="profil__pwd-input"
              type="password"
              autocomplete="current-password"
              required
              disabled={pwdSubmitting}
              bind:value={currentPassword}
              data-testid="profil-pwd-current-input"
            />
          </div>

          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-pwd-new">
              {t('profil.password.new')}
              <span class="profil__pwd-hint" aria-hidden="true">({t('profil.password.hint')})</span>
            </label>
            <input
              id="profil-pwd-new"
              class="profil__pwd-input"
              type="password"
              autocomplete="new-password"
              minlength="8"
              required
              disabled={pwdSubmitting}
              bind:value={newPassword}
              data-testid="profil-pwd-new-input"
            />
          </div>

          {#if pwdError}
            <div
              class="profil__pwd-feedback profil__pwd-feedback--error"
              role="alert"
              data-testid="profil-pwd-error"
            >
              {pwdError}
            </div>
          {/if}

          {#if pwdSuccess}
            <div
              class="profil__pwd-feedback profil__pwd-feedback--success"
              role="status"
              data-testid="profil-pwd-success"
            >
              {t('profil.password.success')}
            </div>
          {/if}

          <div class="profil__pwd-actions">
            <button
              class="button button--action"
              type="submit"
              disabled={pwdSubmitting}
              aria-label={t('profil.password.submitAriaLabel')}
              data-testid="profil-pwd-submit"
            >
              {pwdSubmitting ? t('profil.password.submitting') : t('profil.password.submit')}
            </button>
          </div>
        </form>
      </section>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── Change email ── -->
      <section
        class="profil__section profil__section--pwd"
        aria-labelledby="profil-email-heading"
      >
        <h2
          id="profil-email-heading"
          class="profil__section-heading"
          data-testid="profil-email-heading"
        >
          {t('profil.emailChange.heading')}
        </h2>

        <p
          class="profil__email-current profil__pwd-hint"
          data-testid="profil-email-current"
        >
          {t('profil.emailChange.currentLabel', { email: user.email })}
        </p>

        <form
          class="profil__pwd-form"
          data-testid="profil-email-form"
          aria-label={t('profil.emailChange.formAriaLabel')}
          onsubmit={handleEmailChange}
          novalidate
        >
          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-email-new">
              {t('profil.emailChange.newLabel')}
            </label>
            <input
              id="profil-email-new"
              class="profil__pwd-input"
              type="email"
              autocomplete="email"
              required
              disabled={emailSubmitting}
              bind:value={emailNew}
              data-testid="profil-email-new-input"
            />
          </div>

          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-email-password">
              {t('profil.password.current')}
            </label>
            <input
              id="profil-email-password"
              class="profil__pwd-input"
              type="password"
              autocomplete="current-password"
              required
              disabled={emailSubmitting}
              bind:value={emailPassword}
              data-testid="profil-email-password-input"
            />
          </div>

          {#if emailError}
            <div
              class="profil__pwd-feedback profil__pwd-feedback--error"
              role="alert"
              data-testid="profil-email-error"
            >
              {emailError}
            </div>
          {/if}

          {#if emailSuccess}
            <div
              class="profil__pwd-feedback profil__pwd-feedback--success"
              role="status"
              data-testid="profil-email-success"
            >
              {t('profil.emailChange.success')}
            </div>
          {/if}

          <div class="profil__pwd-actions">
            <button
              class="button button--action"
              type="submit"
              disabled={emailSubmitting}
              aria-label={t('profil.emailChange.submitAriaLabel')}
              data-testid="profil-email-submit"
            >
              {emailSubmitting ? t('profil.emailChange.submitting') : t('profil.emailChange.submit')}
            </button>
          </div>
        </form>
      </section>
    </div>
    <!-- /.profil__content -->
  {/if}
</div>

<style>
  /* ── Layout ── */
  .profil {
    min-height: 100dvh;
    padding-top: 80px; /* fixed nav offset */
    background-color: var(--color-surface, #f7f9fb);
    font-family: var(--font-sans, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif);
  }

  .profil__content {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-2xl, 64px) var(--space-lg, 24px) var(--space-3xl, 96px);
  }

  /* ── Page header ── */
  .profil__page-header {
    margin-bottom: var(--space-xl, 40px);
  }

  .profil__page-header-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-lg, 24px);
    flex-wrap: wrap;
    margin-top: var(--space-sm, 8px);
  }

  .profil__title {
    font-family: var(--font-sans);
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 300;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink, #191c1e);
    margin: 0;
  }

  /* ── Tech label (mono) ── */
  .profil__tech-label {
    display: block;
    font-family: var(--font-mono, "IBM Plex Mono", "Fira Code", ui-monospace, monospace);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
    margin-bottom: var(--space-sm, 8px);
  }

  /* ── Hairline ── */
  .profil__hairline {
    width: 100%;
    height: 1px;
    background-color: var(--color-outline-variant, #c6c6cd);
    margin: var(--space-xl, 40px) 0;
  }

  /* ── Sections ── */
  .profil__section {
    margin-bottom: 0;
  }

  .profil__section-heading {
    font-family: var(--font-sans);
    font-size: clamp(20px, 3vw, 32px);
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink, #191c1e);
    margin: 0 0 var(--space-lg, 24px);
  }

  /* ── User card ── */
  .profil__user-card {
    background-color: var(--color-surface-container-lowest, #ffffff);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius-lg, 0.5rem);
    padding: var(--space-xl, 40px);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-xl, 40px);
    flex-wrap: wrap;
  }

  .profil__user-dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-lg, 24px);
    flex: 1;
  }

  .profil__user-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .profil__user-dt {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
  }

  .profil__user-dd {
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 400;
    color: var(--color-ink, #191c1e);
    margin: 0;
    line-height: 1.4;
    word-break: break-all;
  }

  /* ── Role badge ── */
  .profil__role-badge {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 var(--space-sm, 8px);
    background-color: var(--color-surface-container, #eceef0);
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: 2px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-ink-variant, #45464d);
  }

  .profil__role-badge--admin {
    background-color: var(--color-secondary-container, #fd761a);
    border-color: var(--color-secondary-container, #fd761a);
    color: var(--color-on-secondary-container, #ffffff);
  }

  /* ── Rate row ── */
  .profil__user-dd--rate {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-sm, 8px);
    margin: 0;
  }

  .profil__rate-value {
    font-family: var(--font-mono, "IBM Plex Mono", "Fira Code", ui-monospace, monospace);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink, #191c1e);
  }

  /* Custom rate badge — ember amber signal (admin-granted privilege). */
  .profil__role-badge--custom {
    background-color: var(--color-ember-pale, #ffdbca);
    border-color: var(--color-ember-pale, #ffdbca);
    color: var(--color-on-secondary-container, #5c2400);
  }

  .profil__admin-link {
    align-self: flex-start;
    flex-shrink: 0;
  }

  .profil__logout-btn {
    flex-shrink: 0;
  }

  /* ── Change-password section ── */
  .profil__section--pwd {
    max-width: 480px;
  }

  .profil__pwd-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 24px);
  }

  /* Current-email hint — reuses .profil__pwd-hint type/colour tokens;
     block display + margin anchor it between heading and form. */
  .profil__email-current {
    display: block;
    margin-top: calc(-1 * var(--space-sm, 8px));
    margin-bottom: var(--space-lg, 24px);
  }

  .profil__pwd-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
  }

  .profil__pwd-label {
    font-family: var(--font-mono, "IBM Plex Mono", monospace);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profil__pwd-hint {
    font-family: var(--font-sans, "IBM Plex Sans", sans-serif);
    font-size: 12px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-ink-variant, #45464d);
    opacity: 0.75;
  }

  .profil__pwd-input {
    display: block;
    width: 100%;
    height: 44px;
    padding: 0 var(--space-md, 16px);
    border: 1px solid var(--color-hairline, #c6c6cd);
    border-radius: var(--radius, 0.25rem);
    background-color: var(--color-surface-container-lowest, #ffffff);
    font-family: var(--font-sans, "IBM Plex Sans", sans-serif);
    font-size: 15px;
    color: var(--color-ink, #191c1e);
    transition: border-color 150ms ease;
    box-sizing: border-box;
  }

  .profil__pwd-input:focus {
    outline: 2px solid var(--color-terracotta, #9d4300);
    outline-offset: 3px;
    border-color: var(--color-terracotta, #9d4300);
  }

  .profil__pwd-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--color-surface-container, #eceef0);
  }

  .profil__pwd-feedback {
    padding: var(--space-sm, 12px) var(--space-md, 16px);
    border-radius: var(--radius, 0.25rem);
    font-family: var(--font-sans, "IBM Plex Sans", sans-serif);
    font-size: 14px;
    line-height: 1.5;
  }

  .profil__pwd-feedback--error {
    background-color: color-mix(in srgb, var(--color-error, #ba1a1a) 10%, white);
    border: 1px solid color-mix(in srgb, var(--color-error, #ba1a1a) 40%, white);
    color: var(--color-error, #ba1a1a);
  }

  .profil__pwd-feedback--success {
    background-color: var(--color-forest-surface, #d4ede0);
    border: 1px solid color-mix(in srgb, var(--color-forest, #1a5c2d) 40%, white);
    color: var(--color-forest, #1a5c2d);
  }

  .profil__pwd-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md, 16px);
    padding-top: var(--space-xs, 4px);
  }

  /* ── Skeleton loading ── */
  .profil__skeleton {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-2xl, 64px) var(--space-lg, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 24px);
  }

  .profil__skeleton-header {
    height: 56px;
    width: 40%;
    border-radius: var(--radius, 0.25rem);
    background: var(--color-surface-container-highest, #e0e3e5);
    animation: profil-shimmer 1.4s ease-in-out infinite;
  }

  .profil__skeleton-card {
    height: 140px;
    border-radius: var(--radius-lg, 0.5rem);
    background: var(--color-surface-container-highest, #e0e3e5);
    animation: profil-shimmer 1.4s ease-in-out infinite 0.1s;
  }

  .profil__skeleton-row {
    height: 48px;
    border-radius: var(--radius, 0.25rem);
    background: var(--color-surface-container-high, #e6e8ea);
    animation: profil-shimmer 1.4s ease-in-out infinite 0.2s;
  }

  .profil__skeleton-row--short {
    width: 60%;
    animation-delay: 0.3s;
  }

  @keyframes profil-shimmer {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* ── Error state ── */
  .profil__error {
    max-width: 600px;
    margin: var(--space-3xl, 96px) auto;
    padding: var(--space-lg, 24px);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md, 16px);
  }

  .profil__error-msg {
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--color-ink-variant, #45464d);
    line-height: 1.65;
    margin: 0;
  }

  /* ── Button (local scoped copy of the shared .button system) ──
     The shared styles live in Button.svelte's :global block, which only loads
     on routes that render a Button instance. This page uses raw <a>/<button>
     elements (to keep design test hooks and to attach an onclick handler), so
     the base + variants used here are declared locally and scoped to .profil. */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    min-width: 44px;
    padding: 0 24px;
    border: 1px solid transparent;
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    text-decoration: none;
    user-select: none;
    font-family: var(--font-sans, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    transition:
      transform 180ms cubic-bezier(0.33, 1, 0.68, 1),
      background-color 180ms ease,
      border-color 180ms ease,
      opacity 180ms ease;
  }

  .button--secondary {
    background-color: transparent;
    color: var(--color-primary, #000000);
    border-color: var(--color-primary, #000000);
  }

  .button--action {
    background-color: var(--color-secondary-container, #fd761a);
    color: var(--color-on-secondary-container, #ffffff);
    border-color: var(--color-secondary-container, #fd761a);
  }

  @media (hover: hover) {
    .button:not(:disabled):hover {
      transform: translateY(-2px);
    }

    .button--secondary:not(:disabled):hover {
      background-color: var(--color-surface-container, #eceef0);
    }
  }

  .button:focus-visible {
    outline: 2px solid var(--color-primary, #000000);
    outline-offset: 3px;
  }

  .button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .button {
      transition: opacity 180ms ease;
    }

    .button:hover {
      transform: none;
    }
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .profil__user-card {
      flex-direction: column;
    }

    .profil__admin-link {
      align-self: stretch;
      justify-content: center;
    }

    .profil__page-header-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .profil__logout-btn {
      align-self: flex-start;
    }

    .profil__section--pwd {
      max-width: 100%;
    }

    .profil__pwd-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .profil__pwd-actions .button {
      justify-content: center;
      width: 100%;
    }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .profil__skeleton-header,
    .profil__skeleton-card,
    .profil__skeleton-row {
      animation: none;
      opacity: 0.7;
    }
  }
</style>

<svelte:head>
  <title>{t('profil.pageTitle')}</title>
</svelte:head>
