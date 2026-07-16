<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getMe, getProfile, logout, changePassword, isError } from "$lib/api";
  import type { User, ReservationRow } from "$lib/api";

  // ── State ────────────────────────────────────────────────────────────
  type Phase = "loading" | "loaded" | "error";

  let phase = $state<Phase>("loading");
  let errorMessage = $state("");
  let user = $state<User | null>(null);
  let reservations = $state<ReservationRow[]>([]);

  // Which reservation row is expanded (by id), or null.
  let expandedId = $state<number | null>(null);

  // Guard against a double logout click.
  let loggingOut = $state(false);

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
      pwdError = "Le nouveau mot de passe doit contenir au moins 8 caractères.";
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

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Format an ISO date string in French-Canadian locale. The result is only
   * ever placed into the DOM via a Svelte text binding (auto-escaped), never
   * interpolated into markup.
   */
  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function toggleRow(id: number): void {
    expandedId = expandedId === id ? null : id;
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
    user = meResult.user;

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

    user = profileResult.user;
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
      aria-label="Chargement du profil…"
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
      <span class="profil__tech-label">ERREUR</span>
      <p class="profil__error-msg" data-testid="profil-error-message">{errorMessage}</p>
      <a href="/" class="button button--secondary">← Accueil</a>
    </div>
  {:else if user}
    <!-- PHASE: loaded -->
    <div class="profil__content" data-testid="profil-content">
      <!-- ── Page header ── -->
      <header class="profil__page-header">
        <span class="profil__tech-label" data-testid="profil-role-label">
          PROFIL — {user.role === "admin" ? "ADMINISTRATEUR" : "INVITÉ"}
        </span>
        <div class="profil__page-header-row">
          <h1 class="profil__title" data-testid="profil-title">
            {user.name ?? user.email}
          </h1>
          <button
            class="button button--secondary profil__logout-btn"
            type="button"
            aria-label="Se déconnecter"
            data-testid="profil-logout-btn"
            disabled={loggingOut}
            onclick={handleLogout}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── User info card ── -->
      <section class="profil__section" aria-labelledby="profil-user-heading">
        <h2 id="profil-user-heading" class="profil__section-heading" data-testid="profil-user-heading">
          Informations
        </h2>
        <div class="profil__user-card" data-testid="profil-user-card">
          <dl class="profil__user-dl">
            <div class="profil__user-field">
              <dt class="profil__user-dt">Nom</dt>
              <dd class="profil__user-dd" data-testid="profil-user-name">{user.name ?? "—"}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">Courriel</dt>
              <dd class="profil__user-dd" data-testid="profil-user-email">{user.email}</dd>
            </div>
            <div class="profil__user-field">
              <dt class="profil__user-dt">Rôle</dt>
              <dd class="profil__user-dd">
                <span
                  class="profil__role-badge {user.role === 'admin'
                    ? 'profil__role-badge--admin'
                    : ''}"
                  data-testid="profil-role-badge"
                >
                  {user.role === "admin" ? "Administrateur" : "Invité"}
                </span>
              </dd>
            </div>
          </dl>
          {#if user.role === "admin"}
            <a
              href="/admin"
              class="button button--action profil__admin-link"
              data-testid="profil-admin-link"
            >
              Tableau de bord →
            </a>
          {/if}
        </div>
      </section>

      <div class="profil__hairline" role="separator" aria-hidden="true"></div>

      <!-- ── Reservations ── -->
      <section class="profil__section" aria-labelledby="profil-res-heading">
        <h2 id="profil-res-heading" class="profil__section-heading" data-testid="profil-res-heading">
          Mes réservations
        </h2>

        {#if reservations.length === 0}
          <p class="profil__empty" data-testid="profil-res-empty">
            Aucune réservation pour l'instant.
          </p>
        {:else}
          <div class="profil__table-wrap" role="region" aria-label="Liste des réservations">
            <table class="profil__table" data-testid="profil-res-table">
              <thead>
                <tr>
                  <th scope="col" class="profil__th">Arrivée</th>
                  <th scope="col" class="profil__th">Départ</th>
                  <th scope="col" class="profil__th">Pers.</th>
                  <th scope="col" class="profil__th"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {#each reservations as row, i (row.id)}
                  <tr
                    class="profil__res-row {expandedId === row.id ? 'profil__res-row--open' : ''}"
                    data-testid="profil-res-row-{i}"
                  >
                    <td class="profil__td">{formatDate(row.check_in)}</td>
                    <td class="profil__td">{formatDate(row.check_out)}</td>
                    <td class="profil__td">{row.guests}</td>
                    <td class="profil__td profil__td--action">
                      <button
                        class="profil__expand-btn"
                        type="button"
                        aria-expanded={expandedId === row.id}
                        aria-controls="profil-res-detail-{row.id}"
                        aria-label="{expandedId === row.id
                          ? 'Masquer'
                          : 'Afficher'} les détails du séjour du {formatDate(row.check_in)}"
                        data-testid="profil-res-expand-{i}"
                        onclick={() => toggleRow(row.id)}
                      >
                        {expandedId === row.id ? "↑" : "↓"}
                      </button>
                    </td>
                  </tr>
                  {#if expandedId === row.id}
                    <tr
                      id="profil-res-detail-{row.id}"
                      class="profil__res-detail"
                      data-testid="profil-res-detail-{i}"
                    >
                      <td colspan="4" class="profil__res-detail-cell">
                        <dl class="profil__res-detail-dl">
                          <div class="profil__res-detail-field">
                            <dt>Nom</dt>
                            <dd>{row.name}</dd>
                          </div>
                          <div class="profil__res-detail-field">
                            <dt>Courriel</dt>
                            <dd>{row.email}</dd>
                          </div>
                          {#if row.message}
                            <div class="profil__res-detail-field profil__res-detail-field--full">
                              <dt>Message</dt>
                              <dd>{row.message}</dd>
                            </div>
                          {/if}
                          <div class="profil__res-detail-field">
                            <dt>Créée le</dt>
                            <dd>{formatDate(row.created_at)}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
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
          Changer le mot de passe
        </h2>

        <form
          class="profil__pwd-form"
          data-testid="profil-pwd-form"
          onsubmit={handlePasswordChange}
          novalidate
        >
          <div class="profil__pwd-field">
            <label class="profil__pwd-label" for="profil-pwd-current">
              Mot de passe actuel
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
              Nouveau mot de passe
              <span class="profil__pwd-hint" aria-hidden="true">(8 caractères minimum)</span>
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
              Mot de passe modifié avec succès.
            </div>
          {/if}

          <div class="profil__pwd-actions">
            <button
              class="button button--action"
              type="submit"
              disabled={pwdSubmitting}
              aria-label="Modifier le mot de passe"
              data-testid="profil-pwd-submit"
            >
              {pwdSubmitting ? "Modification…" : "Modifier le mot de passe"}
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

  .profil__admin-link {
    align-self: flex-start;
    flex-shrink: 0;
  }

  .profil__logout-btn {
    flex-shrink: 0;
  }

  /* ── Empty state ── */
  .profil__empty {
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--color-ink-variant, #45464d);
    line-height: 1.65;
    margin: 0;
    padding: var(--space-xl, 40px) 0;
  }

  /* ── Reservations table ── */
  .profil__table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius-lg, 0.5rem);
    background-color: var(--color-surface-container-lowest, #ffffff);
  }

  .profil__table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-sans);
    font-size: 15px;
  }

  .profil__th {
    padding: var(--space-md, 16px) var(--space-lg, 24px);
    text-align: left;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
    background-color: var(--color-surface-container-low, #f2f4f6);
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
    white-space: nowrap;
  }

  .profil__td {
    padding: var(--space-md, 16px) var(--space-lg, 24px);
    color: var(--color-ink, #191c1e);
    line-height: 1.4;
    vertical-align: middle;
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
  }

  .profil__res-row:last-of-type .profil__td {
    border-bottom: none;
  }

  @media (hover: hover) {
    .profil__res-row:hover .profil__td {
      background-color: var(--color-surface-container-low, #f2f4f6);
    }
  }

  .profil__res-row--open .profil__td {
    background-color: var(--color-surface-container-low, #f2f4f6);
  }

  .profil__td--action {
    width: 56px;
    text-align: center;
  }

  /* ── Expand button ── */
  .profil__expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--color-outline-variant, #c6c6cd);
    border-radius: var(--radius, 0.25rem);
    background: transparent;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--color-ink-variant, #45464d);
    transition:
      background-color 150ms ease,
      border-color 150ms ease;
  }

  .profil__expand-btn:hover {
    background-color: var(--color-surface-container, #eceef0);
    border-color: var(--color-outline, #76777d);
  }

  .profil__expand-btn:focus-visible {
    outline: 2px solid var(--color-primary, #000000);
    outline-offset: 3px;
  }

  /* ── Expanded detail row ── */
  .profil__res-detail-cell {
    padding: var(--space-lg, 24px) var(--space-lg, 24px);
    background-color: var(--color-surface-container-low, #f2f4f6);
    border-bottom: 1px solid var(--color-outline-variant, #c6c6cd);
  }

  .profil__res-detail-dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-md, 16px);
  }

  .profil__res-detail-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profil__res-detail-field--full {
    grid-column: 1 / -1;
  }

  .profil__res-detail-field dt {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-ink-variant, #45464d);
  }

  .profil__res-detail-field dd {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink, #191c1e);
    margin: 0;
    line-height: 1.5;
    word-break: break-word;
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

  /* ── Hidden utility (screen-reader only) ── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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

    .profil__expand-btn {
      transition: none;
    }
  }
</style>
