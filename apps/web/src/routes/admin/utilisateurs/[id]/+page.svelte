<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    getMe,
    adminGetUser,
    adminSetUserPricing,
    isError,
    type AdminUserDetail,
  } from '$lib/api';
  import { settings } from '$lib/settings.svelte';
  import UserPricingForm from '$lib/components/admin/UserPricingForm.svelte';
  import type {
    PricingRequest,
    PricingResult,
  } from '$lib/components/admin/UserPricingForm.svelte';

  // ─── State ───
  let loading = $state(true);
  let error = $state<string | null>(null);
  let user = $state<AdminUserDetail | null>(null);
  let hubspot = $state<Record<string, unknown> | null>(null);

  const id = $derived($page.params.id ?? '');

  // ─── Lifecycle ───
  onMount(async () => {
    // Admin gate — redirect non-admins silently.
    try {
      const me = await getMe();
      if (isError(me) || me.user.role !== 'admin') {
        goto('/');
        return;
      }
    } catch {
      goto('/');
      return;
    }

    // Load user profile. A HubSpot failure never blocks the local fields —
    // the API returns `hubspot: null` for that case.
    try {
      const res = await adminGetUser(id);
      if (isError(res)) {
        error = res.error || 'Impossible de charger le profil utilisateur.';
      } else {
        user = res.user;
        hubspot = res.hubspot;
      }
    } catch {
      error = 'Erreur de réseau. Vérifiez votre connexion et réessayez.';
    } finally {
      loading = false;
    }
  });

  // ─── Handlers ───
  async function handleSavePricing(body: PricingRequest): Promise<PricingResult> {
    const res = await adminSetUserPricing(id, body);
    if (isError(res)) return { error: res.error };
    // Reflect the new pricing on the local record without a full re-fetch.
    if (user) {
      user = {
        ...user,
        discount_percent: res.user.discount_percent ?? null,
        fixed_nightly_price: res.user.fixed_nightly_price ?? null,
      };
    }
    return { ok: true };
  }

  // ─── Date formatter (full timestamptz — no date-only UTC-shift risk) ───
  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat('fr-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(iso));
    } catch {
      return '—';
    }
  }
</script>

<div class="user-profile-page" data-testid="user-profile-page">
  <!-- ① Sticky topbar -->
  <div class="user-profile-page__topbar" data-testid="profile-topbar">
    <a
      href="/admin"
      class="user-profile-page__back-link"
      data-testid="back-link"
      aria-label="Retour à la liste des utilisateurs"
    >
      <svg
        class="user-profile-page__back-arrow"
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M9 2L4 7l5 5"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      Utilisateurs
    </a>

    {#if user}
      <h1 class="user-profile-page__topbar-title" data-testid="topbar-title">
        {user.email}
      </h1>
    {:else if loading}
      <div class="user-profile-page__topbar-title-skel" aria-hidden="true"></div>
    {/if}
  </div>

  <!-- ② Loading skeleton -->
  {#if loading}
    <div
      class="user-profile-page__skeleton"
      data-testid="loading-skeleton"
      aria-busy="true"
      aria-label="Chargement du profil utilisateur"
    >
      <div class="user-profile-page__skel-grid">
        <div class="user-profile-page__skel-card"></div>
        <div class="user-profile-page__skel-card"></div>
      </div>
      <div class="user-profile-page__skel-pricing"></div>
    </div>

    <!-- ③ Error state -->
  {:else if error}
    <div
      class="user-profile-page__error-wrap"
      data-testid="error-message"
      role="alert"
      aria-live="assertive"
    >
      <p class="user-profile-page__error-text">{error}</p>
      <a href="/admin" class="user-profile-page__error-back-link"
        >← Retour aux utilisateurs</a
      >
    </div>

    <!-- ④ Main content -->
  {:else if user}
    <div class="user-profile-page__content">
      <div class="user-profile-page__grid">
        <!-- Left: Local fields card -->
        <section
          class="user-profile-page__card"
          data-testid="local-fields-card"
          aria-labelledby="local-fields-heading"
        >
          <h2 class="user-profile-page__card-heading" id="local-fields-heading">
            Profil local
          </h2>

          <dl class="user-profile-page__dl">
            <div class="user-profile-page__dl-row" data-testid="user-field-email">
              <dt class="user-profile-page__dl-label">Courriel</dt>
              <dd class="user-profile-page__dl-value">{user.email}</dd>
            </div>

            <div class="user-profile-page__dl-row" data-testid="user-field-name">
              <dt class="user-profile-page__dl-label">Nom</dt>
              <dd class="user-profile-page__dl-value">
                {#if user.first_name || user.last_name}
                  {[user.first_name, user.last_name].filter(Boolean).join(' ')}
                {:else}
                  {user.name ?? '—'}
                {/if}
              </dd>
            </div>

            <div class="user-profile-page__dl-row" data-testid="user-field-phone">
              <dt class="user-profile-page__dl-label">Téléphone</dt>
              <dd class="user-profile-page__dl-value">{user.phone ?? '—'}</dd>
            </div>

            <div class="user-profile-page__dl-row" data-testid="user-field-company">
              <dt class="user-profile-page__dl-label">Entreprise</dt>
              <dd class="user-profile-page__dl-value">{user.company ?? '—'}</dd>
            </div>

            <div class="user-profile-page__dl-row" data-testid="user-field-role">
              <dt class="user-profile-page__dl-label">Rôle</dt>
              <dd class="user-profile-page__dl-value">
                <span
                  class="user-profile-page__role-badge user-profile-page__role-badge--{user.role}"
                  aria-label={user.role === 'admin' ? 'Administrateur' : 'Invité'}
                >
                  {user.role === 'admin' ? 'Administrateur' : 'Invité'}
                </span>
              </dd>
            </div>

            <div
              class="user-profile-page__dl-row"
              data-testid="user-field-created-at"
            >
              <dt class="user-profile-page__dl-label">Inscrit le</dt>
              <dd
                class="user-profile-page__dl-value user-profile-page__dl-value--mono"
              >
                {formatDate(user.created_at)}
              </dd>
            </div>

            <div
              class="user-profile-page__dl-row"
              data-testid="user-field-hubspot-id"
            >
              <dt class="user-profile-page__dl-label">HubSpot ID</dt>
              <dd
                class="user-profile-page__dl-value user-profile-page__dl-value--mono"
              >
                {user.hubspot_contact_id ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        <!-- Right: HubSpot card -->
        <section
          class="user-profile-page__card"
          data-testid="hubspot-card"
          aria-labelledby="hubspot-heading"
        >
          <h2 class="user-profile-page__card-heading" id="hubspot-heading">
            HubSpot
          </h2>

          {#if hubspot && Object.keys(hubspot).length > 0}
            <div class="user-profile-page__hubspot-scroll">
              <table
                class="user-profile-page__hubspot-table"
                data-testid="hubspot-properties-table"
              >
                <thead>
                  <tr>
                    <th scope="col" class="user-profile-page__ht-head">Propriété</th>
                    <th scope="col" class="user-profile-page__ht-head">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {#each Object.entries(hubspot) as [key, value] (key)}
                    <tr
                      class="user-profile-page__ht-row"
                      data-testid="hubspot-prop-{key}"
                    >
                      <td class="user-profile-page__ht-key">{key}</td>
                      <td class="user-profile-page__ht-val">
                        {value != null ? String(value) : '—'}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="user-profile-page__hs-empty" data-testid="hubspot-empty">
              <div class="user-profile-page__hs-empty-icon" aria-hidden="true">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-dasharray="3 3"
                  />
                  <path
                    d="M11 16h10M16 11v10"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    opacity="0.4"
                  />
                </svg>
              </div>
              <p class="user-profile-page__hs-empty-title">Aucune donnée HubSpot</p>
              <p class="user-profile-page__hs-empty-desc">
                Aucun identifiant HubSpot n'est associé à ce compte, ou les données
                sont actuellement inaccessibles.
              </p>
            </div>
          {/if}
        </section>
      </div>

      <!-- Below grid: pricing form card -->
      <section
        class="user-profile-page__card user-profile-page__card--pricing"
        data-testid="pricing-card"
        aria-labelledby="pricing-section-heading"
      >
        <h2
          class="user-profile-page__card-heading user-profile-page__card-heading--sr"
          id="pricing-section-heading"
        >
          Tarification
        </h2>
        <UserPricingForm
          userId={user.id}
          publicNightlyPrice={settings.nightlyPrice}
          initialDiscount={user.discount_percent ?? null}
          initialFixed={user.fixed_nightly_price ?? null}
          onSavePricing={handleSavePricing}
        />
      </section>
    </div>
  {/if}
</div>

<style>
  .user-profile-page {
    --upp-surface: #f4efe6;
    --upp-surface-raised: #ece7db;
    --upp-surface-sunken: #e0dad0;
    --upp-border: #c4baa8;
    --upp-border-strong: #9a8e7e;
    --upp-primary: #1b3b2a;
    --upp-primary-hover: #254f38;
    --upp-primary-text: #f4efe6;
    --upp-accent: #7b4628;
    --upp-accent-hover: #6a3a20;
    --upp-text: #1c1a17;
    --upp-text-muted: #695e51;
    --upp-text-faint: #9a8e7e;
    --upp-danger: #8a2828;
    --upp-danger-text: #3d0a0a;

    min-height: 100vh;
    padding-top: 64px; /* clear the fixed 64px global nav */
    background: var(--upp-surface);
    font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: var(--upp-text);
  }

  /* ── Topbar ── */
  .user-profile-page__topbar {
    position: sticky;
    top: 64px; /* sit beneath the fixed 64px global nav */
    z-index: 20;
    background: var(--upp-primary);
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 24px;
    box-shadow: 0 2px 10px rgba(27, 59, 42, 0.35);
  }

  .user-profile-page__back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--upp-primary-text);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 5px 8px;
    border-radius: 2px;
    flex-shrink: 0;
    transition: background 0.12s ease;
    white-space: nowrap;
  }
  .user-profile-page__back-link:hover {
    background: var(--upp-primary-hover);
  }
  .user-profile-page__back-link:focus-visible {
    outline: 2px solid var(--upp-accent);
    outline-offset: 2px;
  }

  .user-profile-page__back-arrow {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .user-profile-page__topbar-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 19px;
    font-weight: 500;
    color: var(--upp-primary-text);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.92;
  }

  .user-profile-page__topbar-title-skel {
    width: 220px;
    height: 18px;
    border-radius: 2px;
    background: rgba(244, 239, 230, 0.15);
    animation: upp-pulse 1.5s ease-in-out infinite;
  }

  /* ── Content wrapper ── */
  .user-profile-page__content {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 16px 56px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Two-column grid ── */
  .user-profile-page__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  @media (min-width: 640px) {
    .user-profile-page__grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* ── Card shell ── */
  .user-profile-page__card {
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")
        center / 200px 200px,
      var(--upp-surface-raised);
    border: 1px solid var(--upp-border);
    border-radius: 4px;
    padding: 20px 24px;
  }

  .user-profile-page__card-heading {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 19px;
    font-weight: 500;
    color: var(--upp-primary);
    margin: 0 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--upp-border);
    line-height: 1.25;
  }

  .user-profile-page__card-heading--sr {
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

  /* ── Definition list ── */
  .user-profile-page__dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .user-profile-page__dl-row {
    display: grid;
    grid-template-columns: 130px 1fr;
    column-gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid var(--upp-border);
    align-items: baseline;
  }
  .user-profile-page__dl-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .user-profile-page__dl-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--upp-text-muted);
    padding-top: 1px;
  }

  .user-profile-page__dl-value {
    margin: 0;
    font-size: 14px;
    color: var(--upp-text);
    word-break: break-word;
    line-height: 1.45;
  }

  .user-profile-page__dl-value--mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    letter-spacing: 0.01em;
  }

  @media (max-width: 480px) {
    .user-profile-page__dl-row {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }

  /* ── Role badge ── */
  .user-profile-page__role-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 2px;
    line-height: 1.5;
    border: 1px solid var(--upp-border);
    background: var(--upp-surface-sunken);
    color: var(--upp-text-muted);
  }
  .user-profile-page__role-badge--admin {
    background: var(--upp-primary);
    color: var(--upp-primary-text);
    border-color: var(--upp-primary);
  }

  /* ── HubSpot table ── */
  .user-profile-page__hubspot-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -4px;
    padding: 0 4px;
  }

  .user-profile-page__hubspot-table {
    width: 100%;
    min-width: 260px;
    border-collapse: collapse;
    font-size: 14px;
  }

  .user-profile-page__ht-head {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--upp-text-muted);
    padding: 4px 8px 7px 0;
    border-bottom: 1px solid var(--upp-border-strong);
    text-align: left;
    white-space: nowrap;
  }

  .user-profile-page__ht-row {
    border-bottom: 1px solid var(--upp-border);
  }
  .user-profile-page__ht-row:last-child {
    border-bottom: none;
  }
  .user-profile-page__ht-row:nth-child(even) {
    background: var(--upp-surface-sunken);
  }

  .user-profile-page__ht-key {
    padding: 7px 12px 7px 0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    color: var(--upp-text-muted);
    vertical-align: top;
    white-space: nowrap;
    width: 42%;
  }

  .user-profile-page__ht-val {
    padding: 7px 0;
    color: var(--upp-text);
    vertical-align: top;
    word-break: break-word;
  }

  /* ── HubSpot empty state ── */
  .user-profile-page__hs-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 28px 16px;
    gap: 10px;
  }

  .user-profile-page__hs-empty-icon {
    color: var(--upp-text-faint);
    opacity: 0.6;
  }

  .user-profile-page__hs-empty-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 16px;
    font-weight: 500;
    color: var(--upp-text-muted);
    margin: 0;
  }

  .user-profile-page__hs-empty-desc {
    font-size: 13px;
    color: var(--upp-text-faint);
    margin: 0;
    max-width: 260px;
    line-height: 1.5;
  }

  /* ── Loading skeleton ── */
  .user-profile-page__skeleton {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .user-profile-page__skel-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  @media (min-width: 640px) {
    .user-profile-page__skel-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .user-profile-page__skel-card {
    height: 300px;
    background: var(--upp-surface-raised);
    border: 1px solid var(--upp-border);
    border-radius: 4px;
    animation: upp-pulse 1.5s ease-in-out infinite;
  }

  .user-profile-page__skel-pricing {
    height: 240px;
    background: var(--upp-surface-raised);
    border: 1px solid var(--upp-border);
    border-radius: 4px;
    animation: upp-pulse 1.5s ease-in-out infinite;
    animation-delay: 0.15s;
  }

  @keyframes upp-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .user-profile-page__topbar-title-skel,
    .user-profile-page__skel-card,
    .user-profile-page__skel-pricing {
      animation: none;
      opacity: 0.6;
    }
  }

  /* ── Error state ── */
  .user-profile-page__error-wrap {
    max-width: 480px;
    margin: 48px auto 0;
    padding: 28px 24px;
    background: var(--upp-surface-raised);
    border: 1px solid var(--upp-border);
    border-radius: 4px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .user-profile-page__error-text {
    margin: 0;
    font-size: 14px;
    color: var(--upp-danger-text);
    background: color-mix(in srgb, var(--upp-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--upp-danger) 20%, transparent);
    border-radius: 2px;
    padding: 8px 16px;
    width: 100%;
    box-sizing: border-box;
  }

  .user-profile-page__error-back-link {
    color: var(--upp-accent);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    padding: 4px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--upp-accent) 30%, transparent);
  }
  .user-profile-page__error-back-link:hover {
    color: var(--upp-accent-hover);
    border-color: var(--upp-accent-hover);
  }
  .user-profile-page__error-back-link:focus-visible {
    outline: 2px solid var(--upp-accent);
    outline-offset: 2px;
  }
</style>

<svelte:head>
  <title>Profil utilisateur — Auberge du Vieux Pont</title>
</svelte:head>
