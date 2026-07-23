<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    getMe,
    getProfile,
    logout,
    changeProfileEmail,
    forgotPassword,
    updateLocale,
    updateContactProfile,
    isError,
  } from "$lib/api";
  import type { User, ReservationRow } from "$lib/api";
  import ProfilReservationTable from "$lib/components/ProfilReservationTable.svelte";
  import { settings } from "$lib/settings.svelte";
  import { t, locale, setLocale } from "$lib/i18n.svelte";

  // ── State ────────────────────────────────────────────────────────────
  type Phase = "loading" | "loaded" | "error";

  let phase = $state<Phase>("loading");
  let errorMessage = $state("");
  let user = $state<User | null>(null);
  let reservations = $state<ReservationRow[]>([]);

  // Guard against a double logout click.
  let loggingOut = $state(false);

  // ── Rate display ─────────────────────────────────────────────────────
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

  // ── Contact edit state ────────────────────────────────────────────────
  let contactEditing = $state(false);
  let contactSubmitting = $state(false);
  let contactError = $state<string | null>(null);
  let contactSuccess = $state(false);
  let editFirstName = $state("");
  let editLastName = $state("");
  let editPhone = $state("");
  let editCompany = $state("");
  let editAddressStreet = $state("");
  let editAddressCity = $state("");
  let editAddressProvince = $state("");
  let editAddressPostalCode = $state("");

  function startContactEdit() {
    editFirstName = user?.first_name ?? "";
    editLastName = user?.last_name ?? "";
    editPhone = user?.phone ?? "";
    editCompany = user?.company ?? "";
    editAddressStreet = user?.address_street ?? "";
    editAddressCity = user?.address_city ?? "";
    editAddressProvince = user?.address_province ?? "";
    editAddressPostalCode = user?.address_postal_code ?? "";
    contactEditing = true;
    contactError = null;
    contactSuccess = false;
  }

  function cancelContactEdit() {
    contactEditing = false;
    contactError = null;
  }

  async function handleContactSave(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (contactSubmitting) return;
    contactError = null;
    contactSubmitting = true;
    const result = await updateContactProfile({
      firstName: editFirstName.trim() || null,
      lastName: editLastName.trim() || null,
      phone: editPhone.trim() || null,
      company: editCompany.trim() || null,
      addressStreet: editAddressStreet.trim() || null,
      addressCity: editAddressCity.trim() || null,
      addressProvince: editAddressProvince.trim() || null,
      addressPostalCode: editAddressPostalCode.trim() || null,
    });
    contactSubmitting = false;
    if (isError(result)) {
      contactError = result.error;
      return;
    }
    // Merge updated fields; preserve effectiveNightlyPrice from getMe.
    user = { ...user!, ...result.user, effectiveNightlyPrice: user!.effectiveNightlyPrice };
    contactSuccess = true;
    contactEditing = false;
  }

  // ── Locale (language preference) ──────────────────────────────────────
  async function handleLocaleChange(newLocale: "fr" | "en") {
    setLocale(newLocale);
    if (user) {
      const result = await updateLocale(newLocale);
      if (!isError(result)) {
        user = { ...user, locale: newLocale };
      }
    }
  }

  // ── Password reset ────────────────────────────────────────────────────
  let pwdResetSending = $state(false);
  let pwdResetDone = $state(false);

  async function handlePasswordReset(): Promise<void> {
    if (pwdResetSending || pwdResetDone) return;
    pwdResetSending = true;
    // Fire-and-forget: never reveal whether the address has an account.
    await forgotPassword(user!.email);
    pwdResetSending = false;
    pwdResetDone = true;
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
      emailError = result.error;
      return;
    }

    // Step 1 complete: link sent to the current (old) address.
    // Do NOT update user.email — it only changes after the full two-step flow.
    emailSuccess = true;
    emailNew = "";
    emailPassword = "";
  }

  // ── Mount: auth gate → profile fetch ─────────────────────────────────
  onMount(async () => {
    const meResult = await getMe();
    if (isError(meResult)) {
      await goto("/connexion");
      return;
    }
    const meUser = meResult.user;
    user = meUser;

    const profileResult = await getProfile();
    if (isError(profileResult)) {
      errorMessage = profileResult.error;
      phase = "error";
      return;
    }

    // Merge: profileResult.user carries all contact fields; meUser carries
    // effectiveNightlyPrice, which getProfile() does not return.
    user = { ...profileResult.user, effectiveNightlyPrice: meUser.effectiveNightlyPrice };
    reservations = profileResult.reservations;
    phase = "loaded";
  });

  // ── Logout ───────────────────────────────────────────────────────────
  async function handleLogout(): Promise<void> {
    if (loggingOut) return;
    loggingOut = true;
    await logout();
    await goto("/");
  }
</script>

<div class="profil" data-testid="profil-page">
  {#if phase === "loading"}
    <!-- PHASE: loading -->
    <div
      class="profil__skeleton"
      aria-label={t('profil.loading.ariaLabel')}
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
      <span class="profil__tech-label">{t('profil.error.label')}</span>
      <p class="profil__error-msg" data-testid="profil-error-message">{errorMessage}</p>
      <a href="/" class="button button--secondary">{t('profil.error.backHome')}</a>
    </div>
  {:else if user}
    <!-- PHASE: loaded -->
    <div class="profil__content" data-testid="profil-content">
      <!-- ── Page header ── -->
      <header class="profil__page-header">
        <span class="profil__tech-label" data-testid="profil-role-label">
          {t('nav.profil').toUpperCase()} — {(user.role === "admin"
            ? t('profil.role.admin')
            : t('profil.role.guest')).toUpperCase()}
        </span>
        <div class="profil__page-header-row">
          <h1 class="profil__title" data-testid="profil-title">
            {user.name ?? user.email}
          </h1>
          <button
            class="button button--secondary profil__logout-btn"
            type="button"
            aria-label={t('profil.logout.ariaLabel')}
            data-testid="profil-logout-btn"
            disabled={loggingOut}
            onclick={handleLogout}
          >
            {t('profil.logout.text')}
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
              <dt class="profil__user-dt">{t('profil.fields.name')}</dt>
              <dd class="profil__user-dd" data-testid="profil-user-name">{user.name ?? "—"}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.fields.email')}</dt>
              <dd class="profil__user-dd" data-testid="profil-user-email">{user.email}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.fields.role')}</dt>
              <dd class="profil__user-dd">
                <span
                  class="profil__role-badge {user.role === 'admin'
                    ? 'profil__role-badge--admin'
                    : ''}"
                  data-testid="profil-role-badge"
                >
                  {user.role === "admin" ? t('profil.role.admin') : t('profil.role.guest')}
                </span>
              </dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">{t('profil.fields.rate')}</dt>
              <dd
                class="profil__user-dd profil__user-dd--rate"
                data-testid="profil-user-rate"
              >
                <span class="profil__rate-value">
                  {formattedRate}&nbsp;{t('profil.rate.unit')}
                </span>
                {#if isCustomRate}
                  <span
                    class="profil__role-badge profil__role-badge--custom"
                    aria-label={t('profil.rate.customAriaLabel')}
                    data-testid="profil-rate-badge"
                  >
                    {t('profil.rate.custom')}
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
              {t('profil.admin.link')}
            </a>
          {/if}
        </div>
      </section>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── Contact info ── -->
      <section class="profil__section" aria-labelledby="profil-contact-heading" data-testid="profil-contact-section">
        <h2 id="profil-contact-heading" class="profil__section-heading" data-testid="profil-contact-heading">
          {t('profil.contact.heading')}
        </h2>

        {#if !contactEditing}
          <!-- Display mode -->
          <div class="profil__user-card" data-testid="profil-contact-display">
            <dl class="profil__user-dl">
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.firstName')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-firstName">{user.first_name ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.lastName')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-lastName">{user.last_name ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.phone')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-phone">{user.phone ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.company')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-company">{user.company ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.addressStreet')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-addressStreet">{user.address_street ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.addressCity')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-addressCity">{user.address_city ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.addressProvince')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-addressProvince">{user.address_province ?? "—"}</dd>
              </div>
              <div class="profil__user-field">
                <dt class="profil__user-dt">{t('profil.fields.addressPostalCode')}</dt>
                <dd class="profil__user-dd" data-testid="profil-contact-addressPostalCode">{user.address_postal_code ?? "—"}</dd>
              </div>
            </dl>
            <button
              type="button"
              class="button button--secondary profil__contact-edit-btn"
              data-testid="profil-contact-edit-btn"
              onclick={startContactEdit}
            >
              {t('profil.contact.edit')}
            </button>
          </div>

          {#if contactSuccess}
            <div
              class="profil__pwd-feedback profil__pwd-feedback--success profil__contact-feedback"
              role="status"
              data-testid="profil-contact-success"
            >
              {t('profil.contact.success')}
            </div>
          {/if}
        {:else}
          <!-- Edit mode -->
          <form
            class="profil__contact-form"
            data-testid="profil-contact-form"
            onsubmit={handleContactSave}
            novalidate
          >
            <div class="profil__contact-grid">
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-firstName">
                  {t('profil.fields.firstName')}
                </label>
                <input
                  id="profil-edit-firstName"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="given-name"
                  disabled={contactSubmitting}
                  bind:value={editFirstName}
                  data-testid="profil-edit-firstName"
                />
              </div>
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-lastName">
                  {t('profil.fields.lastName')}
                </label>
                <input
                  id="profil-edit-lastName"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="family-name"
                  disabled={contactSubmitting}
                  bind:value={editLastName}
                  data-testid="profil-edit-lastName"
                />
              </div>
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-phone">
                  {t('profil.fields.phone')}
                </label>
                <input
                  id="profil-edit-phone"
                  class="profil__pwd-input"
                  type="tel"
                  autocomplete="tel"
                  disabled={contactSubmitting}
                  bind:value={editPhone}
                  data-testid="profil-edit-phone"
                />
              </div>
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-company">
                  {t('profil.fields.company')}
                </label>
                <input
                  id="profil-edit-company"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="organization"
                  disabled={contactSubmitting}
                  bind:value={editCompany}
                  data-testid="profil-edit-company"
                />
              </div>
            </div>

            <div class="profil__pwd-field">
              <label class="profil__pwd-label" for="profil-edit-addressStreet">
                {t('profil.fields.addressStreet')}
              </label>
              <input
                id="profil-edit-addressStreet"
                class="profil__pwd-input"
                type="text"
                autocomplete="street-address"
                disabled={contactSubmitting}
                bind:value={editAddressStreet}
                data-testid="profil-edit-addressStreet"
              />
            </div>

            <div class="profil__contact-grid">
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-addressCity">
                  {t('profil.fields.addressCity')}
                </label>
                <input
                  id="profil-edit-addressCity"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="address-level2"
                  disabled={contactSubmitting}
                  bind:value={editAddressCity}
                  data-testid="profil-edit-addressCity"
                />
              </div>
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-addressProvince">
                  {t('profil.fields.addressProvince')}
                </label>
                <input
                  id="profil-edit-addressProvince"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="address-level1"
                  disabled={contactSubmitting}
                  bind:value={editAddressProvince}
                  data-testid="profil-edit-addressProvince"
                />
              </div>
              <div class="profil__pwd-field">
                <label class="profil__pwd-label" for="profil-edit-addressPostalCode">
                  {t('profil.fields.addressPostalCode')}
                </label>
                <input
                  id="profil-edit-addressPostalCode"
                  class="profil__pwd-input"
                  type="text"
                  autocomplete="postal-code"
                  disabled={contactSubmitting}
                  bind:value={editAddressPostalCode}
                  data-testid="profil-edit-addressPostalCode"
                />
              </div>
            </div>

            {#if contactError}
              <div
                class="profil__pwd-feedback profil__pwd-feedback--error"
                role="alert"
                data-testid="profil-contact-error"
              >
                {contactError}
              </div>
            {/if}

            <div class="profil__pwd-actions">
              <button
                class="button button--action"
                type="submit"
                disabled={contactSubmitting}
                data-testid="profil-contact-save-btn"
              >
                {contactSubmitting ? t('profil.contact.saving') : t('profil.contact.save')}
              </button>
              <button
                class="button button--secondary"
                type="button"
                disabled={contactSubmitting}
                data-testid="profil-contact-cancel-btn"
                onclick={cancelContactEdit}
              >
                {t('profil.contact.cancel')}
              </button>
            </div>
          </form>
        {/if}

        <!-- Language preference (always visible) -->
        <div class="profil__locale-section" data-testid="profil-locale-selector">
          <span class="profil__user-dt profil__locale-label">{t('profil.locale.heading')}</span>
          <div class="profil__locale-btns">
            <button
              type="button"
              class="profil__locale-btn {locale.current === 'fr' ? 'profil__locale-btn--active' : ''}"
              aria-pressed={locale.current === 'fr'}
              data-testid="profil-locale-fr"
              onclick={() => handleLocaleChange('fr')}
            >{t('profil.locale.fr')}</button>
            <button
              type="button"
              class="profil__locale-btn {locale.current === 'en' ? 'profil__locale-btn--active' : ''}"
              aria-pressed={locale.current === 'en'}
              data-testid="profil-locale-en"
              onclick={() => handleLocaleChange('en')}
            >{t('profil.locale.en')}</button>
          </div>
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

      <!-- ── Password reset ── -->
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

        {#if !pwdResetDone}
          <button
            class="button button--secondary"
            type="button"
            disabled={pwdResetSending}
            data-testid="profil-pwd-reset-btn"
            onclick={handlePasswordReset}
          >
            {pwdResetSending ? t('profil.password.resetSending') : t('profil.password.resetBtn')}
          </button>
        {:else}
          <div
            class="profil__pwd-feedback profil__pwd-feedback--success"
            role="status"
            data-testid="profil-pwd-reset-success"
          >
            {t('profil.password.resetSuccess')}
          </div>
        {/if}
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
          {t('profil.email.heading')}
        </h2>

        <p
          class="profil__email-current profil__pwd-hint"
          data-testid="profil-email-current"
        >
          {t('profil.email.currentPrefix')}{user.email}
        </p>

        <p class="profil__pwd-hint profil__email-step-hint" data-testid="profil-email-step-hint">
          {t('profil.email.step1Hint')}
        </p>

        <form
          class="profil__pwd-form"
          data-testid="profil-email-form"
          aria-label={t('profil.email.formAriaLabel')}
          onsubmit={handleEmailChange}
          novalidate
        >
          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-email-new">
              {t('profil.email.new')}
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
              {t('profil.email.success')}
            </div>
          {/if}

          <div class="profil__pwd-actions">
            <button
              class="button button--action"
              type="submit"
              disabled={emailSubmitting}
              aria-label={t('profil.email.submitAriaLabel')}
              data-testid="profil-email-submit"
            >
              {emailSubmitting ? t('profil.email.submitting') : t('profil.email.submit')}
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

  /* ── Contact edit button ── */
  .profil__contact-edit-btn {
    align-self: flex-start;
    flex-shrink: 0;
  }

  .profil__contact-feedback {
    margin-top: var(--space-md, 16px);
  }

  /* ── Contact form ── */
  .profil__contact-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 24px);
    max-width: 720px;
  }

  .profil__contact-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-lg, 24px);
  }

  /* ── Language selector ── */
  .profil__locale-section {
    display: flex;
    align-items: center;
    gap: var(--space-md, 16px);
    margin-top: var(--space-xl, 40px);
    flex-wrap: wrap;
  }

  .profil__locale-label {
    display: inline;
    margin-bottom: 0;
  }

  .profil__locale-btns {
    display: flex;
    gap: var(--space-xs, 4px);
  }

  .profil__locale-btn {
    padding: 6px 16px;
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius, 0.25rem);
    background-color: var(--color-surface-container-lowest, #ffffff);
    font-family: var(--font-mono, "IBM Plex Mono", monospace);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--color-ink-variant, #45464d);
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .profil__locale-btn--active {
    background-color: var(--color-ink, #191c1e);
    border-color: var(--color-ink, #191c1e);
    color: var(--color-surface, #f7f9fb);
  }

  .profil__locale-btn:not(.profil__locale-btn--active):hover {
    background-color: var(--color-surface-container, #eceef0);
    border-color: var(--color-ink-variant, #45464d);
  }

  .profil__locale-btn:focus-visible {
    outline: 2px solid var(--color-primary, #000000);
    outline-offset: 3px;
  }

  /* ── Change-password / email section ── */
  .profil__section--pwd {
    max-width: 480px;
  }

  .profil__pwd-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 24px);
  }

  .profil__email-current {
    display: block;
    margin-top: calc(-1 * var(--space-sm, 8px));
    margin-bottom: var(--space-md, 16px);
  }

  .profil__email-step-hint {
    display: block;
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

  /* ── Button (local scoped copy of the shared .button system) ── */
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

    .profil__admin-link,
    .profil__contact-edit-btn {
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

    .profil__contact-form {
      max-width: 100%;
    }

    .profil__contact-grid {
      grid-template-columns: 1fr;
    }

    .profil__pwd-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .profil__pwd-actions .button {
      justify-content: center;
      width: 100%;
    }

    .profil__locale-section {
      flex-direction: column;
      align-items: flex-start;
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
  <title>{t('profil.seo.title')}</title>
</svelte:head>
