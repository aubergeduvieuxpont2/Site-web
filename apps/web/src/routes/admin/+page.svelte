<script lang="ts">
  import { onMount } from "svelte";
  import SectionLabel from "$lib/components/SectionLabel.svelte";
  import Contour from "$lib/components/Contour.svelte";
  import Button from "$lib/components/Button.svelte";
  import {
    getMe,
    adminReservations,
    adminOutbox,
    requeueOutbox,
    adminGetSettings,
    adminUpdateSettings,
    isError,
    type AdminSettings,
  } from "$lib/api";
  import type { ReservationRow, OutboxRow } from "$lib/api";

  // ─── Auth state ───
  let loading = $state(true);
  let denied = $state(false);

  // ─── Tab state ───
  let activeTab = $state<"reservations" | "outbox" | "settings">("reservations");

  // ─── Reservations ───
  let searchQuery = $state("");
  let reservations = $state<ReservationRow[]>([]);
  let reservationsLoading = $state(false);
  let reservationsError = $state<string | null>(null);
  let searchTimer: ReturnType<typeof setTimeout>;

  // ─── Outbox ───
  let statusFilter = $state<"all" | "pending" | "failed" | "done">("all");
  let outboxRows = $state<OutboxRow[]>([]);
  let outboxLoading = $state(false);
  let outboxError = $state<string | null>(null);
  let expandedErrors = $state(new Set<number>());
  let requeueingIds = $state(new Set<number>());

  // ─── Settings ───
  let settingsLoading = $state(false);
  let settingsError = $state<string | null>(null);
  let settingsSaved = $state(false);
  let settingsSaving = $state(false);
  let settings = $state<AdminSettings>({
    nightlyPrice: 89,
    contactEmail: "info@aubergeduvieuxpont.ca",
    marketingRoomCount: 12,
    assignableRoomCount: 12,
  });
  let settingsErrors = $state<Partial<Record<keyof AdminSettings, string>>>({});

  // ─── Helpers ───
  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function statusLabel(s: string): string {
    return (
      ({ pending: "En attente", failed: "Échoué", done: "Terminé" } as Record<string, string>)[s] ??
      s
    );
  }

  // ─── Data loaders ───
  async function loadReservations(q?: string) {
    reservationsLoading = true;
    reservationsError = null;
    const res = await adminReservations(q);
    reservationsLoading = false;
    if (isError(res)) {
      reservationsError = res.error;
    } else {
      reservations = res.reservations;
    }
  }

  async function loadOutbox(status: typeof statusFilter) {
    outboxLoading = true;
    outboxError = null;
    const res = await adminOutbox(status === "all" ? undefined : status);
    outboxLoading = false;
    if (isError(res)) {
      outboxError = res.error;
    } else {
      outboxRows = res.rows;
    }
  }

  async function loadSettings() {
    settingsLoading = true;
    settingsError = null;
    const res = await adminGetSettings();
    settingsLoading = false;
    if (isError(res)) {
      settingsError = res.error;
    } else {
      settings = res;
    }
  }

  async function saveSettings() {
    settingsSaving = true;
    settingsSaved = false;
    settingsError = null;
    settingsErrors = {};

    const errors: Partial<Record<keyof AdminSettings, string>> = {};
    if (!Number.isInteger(settings.nightlyPrice) || settings.nightlyPrice <= 0) {
      errors.nightlyPrice = "Prix doit être un entier positif";
    }
    if (!settings.contactEmail || !settings.contactEmail.includes("@")) {
      errors.contactEmail = "Courriel invalide";
    }
    if (!Number.isInteger(settings.marketingRoomCount) || settings.marketingRoomCount <= 0) {
      errors.marketingRoomCount = "Le nombre doit être positif";
    }
    if (!Number.isInteger(settings.assignableRoomCount) || settings.assignableRoomCount <= 0) {
      errors.assignableRoomCount = "La capacité doit être positive";
    }

    if (Object.keys(errors).length > 0) {
      settingsErrors = errors;
      settingsSaving = false;
      return;
    }

    const res = await adminUpdateSettings(settings);
    settingsSaving = false;

    if (isError(res)) {
      settingsError = res.error;
    } else {
      settings = res;
      settingsSaved = true;
      setTimeout(() => {
        settingsSaved = false;
      }, 3000);
    }
  }

  // ─── Debounced search ───
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadReservations(searchQuery.trim() || undefined);
    }, 300);
  }

  // ─── Tab keyboard nav (ARIA tabs pattern) ───
  function onTablistKeydown(e: KeyboardEvent) {
    const order = ["reservations", "outbox", "settings"] as const;
    const idx = order.indexOf(activeTab);
    let next = idx;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = (idx + 1) % order.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = (idx - 1 + order.length) % order.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = order.length - 1;
    } else {
      return;
    }
    activeTab = order[next];
    (document.getElementById(`tab-${order[next]}`) as HTMLElement | null)?.focus();
  }

  // ─── Error toggle ───
  function toggleError(id: number) {
    const s = new Set(expandedErrors);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    expandedErrors = s;
  }

  // ─── Requeue with optimistic update ───
  async function requeue(row: OutboxRow) {
    if (requeueingIds.has(row.id)) return;

    const snapshot = outboxRows.slice(); // rollback snapshot

    // Optimistic: immediately flip to pending
    outboxRows = outboxRows.map((r) =>
      r.id === row.id
        ? {
            ...r,
            status: "pending" as const,
            attempts: 0,
            last_error: null,
            next_attempt_at: new Date(0).toISOString(),
          }
        : r,
    );

    requeueingIds = new Set([...requeueingIds, row.id]);

    const res = await requeueOutbox(row.id);

    const ids = new Set(requeueingIds);
    ids.delete(row.id);
    requeueingIds = ids;

    if (isError(res)) {
      outboxRows = snapshot; // rollback
    } else {
      outboxRows = outboxRows.map((r) => (r.id === row.id ? res.row : r));
    }
  }

  // ─── Reactive data reload when tab changes ───
  $effect(() => {
    if (activeTab === "outbox") {
      loadOutbox(statusFilter);
    } else if (activeTab === "settings") {
      loadSettings();
    }
  });

  // ─── Mount: auth gate ───
  onMount(async () => {
    const me = await getMe();
    if (isError(me) || me.user.role !== "admin") {
      denied = true;
      loading = false;
      return;
    }
    loading = false;
    loadReservations();
  });
</script>

<div class="page-admin">
  {#if loading}
    <div class="page-admin__loading" aria-label="Chargement…" aria-live="polite" data-testid="admin-loading">
      <span class="page-admin__spinner" aria-hidden="true"></span>
    </div>
  {:else if denied}
    <div class="page-admin__denied" role="main" data-testid="admin-denied">
      <div class="page-admin__denied-inner">
        <SectionLabel text="Accès refusé" />
        <h1 class="page-admin__denied-title">Zone réservée</h1>
        <p class="page-admin__denied-msg" data-testid="denied-msg">
          Vous n'avez pas les droits d'accès à cette section.
        </p>
        <Button href="/" variant="secondary">← Accueil</Button>
      </div>
    </div>
  {:else}
    <div class="page-admin__content">
      <header class="page-admin__header">
        <div class="page-admin__header-inner">
          <SectionLabel text="Administration" />
          <h1 class="page-admin__title">Tableau de bord</h1>
        </div>
      </header>

      <Contour />

      <!-- Tab bar -->
      <div class="page-admin__tabs-wrap">
        <div class="page-admin__tabs-inner">
          <div role="tablist" aria-label="Sections de l'administration" class="page-admin__tablist">
            <button
              role="tab"
              id="tab-reservations"
              aria-controls="panel-reservations"
              aria-selected={activeTab === "reservations"}
              tabindex={activeTab === "reservations" ? 0 : -1}
              class="page-admin__tab {activeTab === 'reservations' ? 'page-admin__tab--active' : ''}"
              onclick={() => {
                activeTab = "reservations";
              }}
              onkeydown={onTablistKeydown}
              data-testid="tab-reservations"
            >
              Réservations
            </button>
            <button
              role="tab"
              id="tab-outbox"
              aria-controls="panel-outbox"
              aria-selected={activeTab === "outbox"}
              tabindex={activeTab === "outbox" ? 0 : -1}
              class="page-admin__tab {activeTab === 'outbox' ? 'page-admin__tab--active' : ''}"
              onclick={() => {
                activeTab = "outbox";
              }}
              onkeydown={onTablistKeydown}
              data-testid="tab-outbox"
            >
              File HubSpot
            </button>
            <button
              role="tab"
              id="tab-settings"
              aria-controls="panel-settings"
              aria-selected={activeTab === "settings"}
              tabindex={activeTab === "settings" ? 0 : -1}
              class="page-admin__tab {activeTab === 'settings' ? 'page-admin__tab--active' : ''}"
              onclick={() => {
                activeTab = "settings";
              }}
              onkeydown={onTablistKeydown}
              data-testid="tab-settings"
            >
              Paramètres
            </button>
          </div>
        </div>
      </div>

      <!-- Réservations panel -->
      <div
        role="tabpanel"
        id="panel-reservations"
        aria-labelledby="tab-reservations"
        hidden={activeTab !== "reservations"}
        data-testid="panel-reservations"
      >
        <div class="page-admin__panel-inner">
          <div class="page-admin__toolbar">
            <div class="page-admin__search-wrap">
              <label for="search-reservations" class="page-admin__field-label"> Rechercher </label>
              <div class="page-admin__input-wrap">
                <input
                  id="search-reservations"
                  type="search"
                  bind:value={searchQuery}
                  oninput={onSearchInput}
                  placeholder="Nom ou courriel…"
                  class="page-admin__search-input"
                  aria-label="Rechercher par nom ou courriel"
                  data-testid="search-input"
                />
                {#if reservationsLoading}
                  <span class="page-admin__field-spinner" aria-hidden="true"></span>
                {/if}
              </div>
            </div>
            <p class="page-admin__count" aria-live="polite" data-testid="reservations-count">
              {reservations.length} réservation{reservations.length !== 1 ? "s" : ""}
            </p>
          </div>

          {#if reservationsError}
            <div class="page-admin__error-banner" role="alert" data-testid="reservations-error">
              {reservationsError}
            </div>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- Focusable so keyboard users can scroll the wide table (labelled region). -->
            <div
              class="page-admin__table-scroll"
              tabindex="0"
              role="region"
              aria-label="Tableau des réservations"
            >
              <table class="page-admin__table" data-testid="reservations-table">
                <thead>
                  <tr>
                    <th scope="col">Nom</th>
                    <th scope="col">Courriel</th>
                    <th scope="col">Arrivée</th>
                    <th scope="col">Départ</th>
                    <th scope="col">Pers.</th>
                    <th scope="col">Créée le</th>
                  </tr>
                </thead>
                <tbody>
                  {#if reservations.length === 0 && !reservationsLoading}
                    <tr>
                      <td colspan="6" class="page-admin__empty">Aucune réservation trouvée.</td>
                    </tr>
                  {:else}
                    {#each reservations as row (row.id)}
                      <tr class="page-admin__row" data-testid="reservation-row">
                        <td>{row.name}</td>
                        <td class="page-admin__email">{row.email}</td>
                        <td class="page-admin__date">{formatDate(row.check_in)}</td>
                        <td class="page-admin__date">{formatDate(row.check_out)}</td>
                        <td class="page-admin__num">{row.guests}</td>
                        <td class="page-admin__date">{formatDate(row.created_at)}</td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- File HubSpot panel -->
      <div
        role="tabpanel"
        id="panel-outbox"
        aria-labelledby="tab-outbox"
        hidden={activeTab !== "outbox"}
        data-testid="panel-outbox"
      >
        <div class="page-admin__panel-inner">
          <div class="page-admin__toolbar">
            <div class="page-admin__filter-wrap">
              <label for="status-filter" class="page-admin__field-label"> Statut </label>
              <select
                id="status-filter"
                bind:value={statusFilter}
                class="page-admin__select"
                data-testid="status-filter"
              >
                <option value="all">Tous</option>
                <option value="pending">En attente</option>
                <option value="failed">Échoué</option>
                <option value="done">Terminé</option>
              </select>
            </div>
            <p class="page-admin__count" aria-live="polite" data-testid="outbox-count">
              {outboxRows.length} entrée{outboxRows.length !== 1 ? "s" : ""}
            </p>
          </div>

          {#if outboxError}
            <div class="page-admin__error-banner" role="alert" data-testid="outbox-error">
              {outboxError}
            </div>
          {:else}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- Focusable so keyboard users can scroll the wide table (labelled region). -->
            <div
              class="page-admin__table-scroll"
              tabindex="0"
              role="region"
              aria-label="File d'attente HubSpot"
            >
              <table class="page-admin__table" data-testid="outbox-table">
                <thead>
                  <tr>
                    <th scope="col">Opération</th>
                    <th scope="col">Statut</th>
                    <th scope="col">Tentatives</th>
                    <th scope="col">Prochaine tentative</th>
                    <th scope="col">Dernière erreur</th>
                    <th scope="col"><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {#if outboxRows.length === 0 && !outboxLoading}
                    <tr>
                      <td colspan="6" class="page-admin__empty">Aucune entrée trouvée.</td>
                    </tr>
                  {:else}
                    {#each outboxRows as row (row.id)}
                      <tr
                        class="page-admin__row page-admin__row--{row.status}"
                        data-testid="outbox-row"
                        data-status={row.status}
                      >
                        <td><span class="page-admin__mono">{row.kind}</span></td>
                        <td>
                          <span
                            class="page-admin__badge page-admin__badge--{row.status}"
                            role="status"
                            data-testid="status-badge"
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td class="page-admin__num">{row.attempts}</td>
                        <td class="page-admin__date">{formatDate(row.next_attempt_at)}</td>
                        <td class="page-admin__error-cell">
                          {#if row.last_error}
                            <button
                              type="button"
                              class="page-admin__err-toggle"
                              aria-expanded={expandedErrors.has(row.id)}
                              aria-controls="error-{row.id}"
                              onclick={() => toggleError(row.id)}
                              data-testid="error-toggle"
                            >
                              {expandedErrors.has(row.id) ? "Masquer" : "Voir l'erreur"}
                            </button>
                            {#if expandedErrors.has(row.id)}
                              <div
                                id="error-{row.id}"
                                class="page-admin__err-detail"
                                data-testid="error-detail"
                              >
                                <pre class="page-admin__err-pre">{row.last_error}</pre>
                              </div>
                            {/if}
                          {:else}
                            <span class="page-admin__no-error" aria-label="Aucune erreur">—</span>
                          {/if}
                        </td>
                        <td class="page-admin__actions">
                          {#if row.status === "failed"}
                            <button
                              type="button"
                              class="page-admin__requeue-btn"
                              disabled={requeueingIds.has(row.id)}
                              aria-label="Relancer l'opération {row.kind} (id {row.id})"
                              onclick={() => requeue(row)}
                              data-testid="requeue-btn"
                            >
                              {requeueingIds.has(row.id) ? "…" : "Relancer"}
                            </button>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      </div>

      <!-- Settings panel -->
      <div
        role="tabpanel"
        id="panel-settings"
        aria-labelledby="tab-settings"
        hidden={activeTab !== "settings"}
        data-testid="panel-settings"
      >
        <div class="page-admin__panel-inner">
          {#if settingsLoading}
            <div class="page-admin__spinner" aria-hidden="true"></div>
          {:else if settingsError}
            <div class="page-admin__error-banner" role="alert" data-testid="settings-error">
              {settingsError}
            </div>
          {:else}
            <div class="page-admin__settings-form">
              <div class="page-admin__field">
                <label class="page-admin__field-label" for="input-nightly-price">
                  Prix par nuit ($)
                </label>
                <input
                  id="input-nightly-price"
                  type="number"
                  min="1"
                  bind:value={settings.nightlyPrice}
                  class="page-admin__search-input"
                  data-testid="input-nightly-price"
                />
                {#if settingsErrors.nightlyPrice}
                  <span class="page-admin__field-error" role="alert" data-testid="error-nightly-price">{settingsErrors.nightlyPrice}</span>
                {/if}
              </div>

              <div class="page-admin__field">
                <label class="page-admin__field-label" for="input-contact-email">
                  Courriel de contact
                </label>
                <input
                  id="input-contact-email"
                  type="email"
                  bind:value={settings.contactEmail}
                  class="page-admin__search-input"
                  data-testid="input-contact-email"
                />
                {#if settingsErrors.contactEmail}
                  <span class="page-admin__field-error" role="alert" data-testid="error-contact-email">{settingsErrors.contactEmail}</span>
                {/if}
              </div>

              <div class="page-admin__field">
                <label class="page-admin__field-label" for="input-marketing-rooms">
                  Chambres affichées (marketing)
                </label>
                <input
                  id="input-marketing-rooms"
                  type="number"
                  min="1"
                  bind:value={settings.marketingRoomCount}
                  class="page-admin__search-input"
                  data-testid="input-marketing-rooms"
                />
                {#if settingsErrors.marketingRoomCount}
                  <span class="page-admin__field-error" role="alert" data-testid="error-marketing-rooms">{settingsErrors.marketingRoomCount}</span>
                {/if}
              </div>

              <div class="page-admin__field">
                <label class="page-admin__field-label" for="input-assignable-rooms">
                  Capacité assignable (opérations)
                </label>
                <input
                  id="input-assignable-rooms"
                  type="number"
                  min="1"
                  bind:value={settings.assignableRoomCount}
                  class="page-admin__search-input"
                  data-testid="input-assignable-rooms"
                />
                {#if settingsErrors.assignableRoomCount}
                  <span class="page-admin__field-error" role="alert" data-testid="error-assignable-rooms">{settingsErrors.assignableRoomCount}</span>
                {/if}
              </div>

              {#if settingsSaved}
                <div class="page-admin__success-message" role="status" data-testid="settings-saved">
                  Paramètres enregistrés.
                </div>
              {/if}

              <button
                class="page-admin__requeue-btn"
                onclick={saveSettings}
                disabled={settingsSaving}
                data-testid="settings-save-btn"
              >
                {#if settingsSaving}
                  <span class="page-admin__spinner" aria-hidden="true"></span>
                  Enregistrement…
                {:else}
                  Enregistrer
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ─── Page shell ─── */
  .page-admin {
    min-height: 100dvh;
    background-color: var(--color-surface);
    font-family: var(--font-sans);
  }

  /* ─── Loading state ─── */
  .page-admin__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 30dvh;
  }

  .page-admin__spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-outline-variant);
    border-top-color: var(--color-ink);
    border-radius: 50%;
    animation: admin-spin 700ms linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-admin__spinner {
      animation: none;
      border-top-color: var(--color-ink-variant);
      opacity: 0.6;
    }
  }

  @keyframes admin-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ─── Denied state ─── */
  .page-admin__denied {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100dvh - 64px);
    padding: var(--space-2xl) var(--space-md);
    padding-top: calc(64px + var(--space-2xl));
  }

  .page-admin__denied-inner {
    max-width: 480px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .page-admin__denied-title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(36px, 6vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--color-ink);
    margin: 0;
  }

  .page-admin__denied-msg {
    font-size: 16px;
    line-height: 1.65;
    color: var(--color-ink-variant);
    margin: 0;
  }

  /* ─── Content layout ─── */
  .page-admin__content {
    padding-top: 64px; /* fixed nav height */
  }

  /* ─── Header ─── */
  .page-admin__header {
    padding: var(--space-2xl) var(--space-md) var(--space-xl);
  }

  .page-admin__header-inner {
    max-width: 1280px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .page-admin__title {
    font-family: var(--font-sans);
    font-weight: 300;
    font-size: clamp(32px, 5vw, 48px);
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }

  /* ─── Tab bar ─── */
  .page-admin__tabs-wrap {
    border-bottom: 1px solid var(--color-outline-variant);
    position: sticky;
    top: 64px; /* beneath fixed nav */
    z-index: 10;
    background-color: var(--color-surface);
  }

  .page-admin__tabs-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding-inline: var(--space-md);
  }

  .page-admin__tablist {
    display: flex;
    gap: 0;
  }

  .page-admin__tab {
    position: relative;
    padding: var(--space-md) var(--space-lg);
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    background: transparent;
    border: none;
    cursor: pointer;
    min-height: 44px;
    transition: color 160ms ease;
  }

  .page-admin__tab::after {
    content: "";
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--color-secondary-container);
    transform: scaleX(0);
    transition: transform 200ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .page-admin__tab--active {
    color: var(--color-ink);
  }

  .page-admin__tab--active::after {
    transform: scaleX(1);
  }

  @media (hover: hover) {
    .page-admin__tab:not(.page-admin__tab--active):hover {
      color: var(--color-ink);
    }
  }

  .page-admin__tab:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-admin__tab::after,
    .page-admin__tab {
      transition: none;
    }
  }

  /* ─── Panel ─── */
  .page-admin__panel-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding: var(--space-xl) var(--space-md) var(--space-3xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  /* ─── Toolbar (search / filter row) ─── */
  .page-admin__toolbar {
    display: flex;
    align-items: flex-end;
    gap: var(--space-lg);
    flex-wrap: wrap;
  }

  .page-admin__field-label {
    display: block;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin-bottom: var(--space-xs);
  }

  .page-admin__input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .page-admin__search-input {
    appearance: none;
    -webkit-appearance: none;
    width: 280px;
    max-width: 100%;
    height: 44px;
    padding: 0 var(--space-md);
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius, 0.25rem);
    transition: border-color 160ms ease;
  }

  .page-admin__search-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .page-admin__search-input::placeholder {
    color: var(--color-outline);
  }

  .page-admin__field-spinner {
    position: absolute;
    right: 12px;
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--color-outline-variant);
    border-top-color: var(--color-ink-variant);
    border-radius: 50%;
    animation: admin-spin 700ms linear infinite;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-admin__field-spinner {
      animation: none;
      opacity: 0.5;
    }
  }

  .page-admin__select {
    appearance: none;
    -webkit-appearance: none;
    height: 44px;
    padding: 0 var(--space-xl) 0 var(--space-md);
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    background-color: var(--color-surface-container-lowest);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2376777d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    min-width: 160px;
    transition: border-color 160ms ease;
  }

  .page-admin__select:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  .page-admin__count {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    margin: 0;
    margin-left: auto;
    align-self: flex-end;
    padding-bottom: 13px; /* align baseline with inputs */
  }

  /* ─── Error banner ─── */
  .page-admin__error-banner {
    padding: var(--space-md);
    border: 1px solid var(--color-error);
    border-radius: var(--radius, 0.25rem);
    background-color: color-mix(in srgb, var(--color-error) 6%, var(--color-surface));
    font-size: 14px;
    color: var(--color-error);
  }

  /* ─── Table ─── */
  .page-admin__table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--color-outline-variant);
    border-radius: var(--radius-lg, 0.5rem);
  }

  .page-admin__table-scroll:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .page-admin__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    color: var(--color-ink);
  }

  .page-admin__table thead tr {
    border-bottom: 1px solid var(--color-outline-variant);
    background-color: var(--color-surface-container-low);
  }

  .page-admin__table th {
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    text-align: left;
    white-space: nowrap;
  }

  .page-admin__table td {
    padding: var(--space-sm) var(--space-md);
    vertical-align: top;
    border-bottom: 1px solid var(--color-outline-variant);
    line-height: 1.5;
  }

  .page-admin__table tbody tr:last-child td {
    border-bottom: none;
  }

  @media (hover: hover) {
    .page-admin__row:hover td {
      background-color: var(--color-surface-container-low);
    }
  }

  .page-admin__empty {
    text-align: center;
    color: var(--color-ink-variant);
    padding: var(--space-2xl) var(--space-md) !important;
    font-size: 14px;
  }

  /* ─── Table cell helpers ─── */
  .page-admin__mono {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--color-ink-variant);
  }

  .page-admin__email {
    color: var(--color-ink-variant);
    font-size: 13px;
  }

  .page-admin__date {
    color: var(--color-ink-variant);
    font-size: 13px;
    white-space: nowrap;
  }

  .page-admin__num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-variant);
  }

  /* ─── Status badge ─── */
  .page-admin__badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 100px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 400;
    white-space: nowrap;
  }

  .page-admin__badge--pending {
    color: var(--color-ink-variant);
    background-color: var(--color-surface-container);
    border: 1px solid var(--color-outline-variant);
  }

  .page-admin__badge--failed {
    color: #ffffff;
    background-color: var(--color-error);
    border: 1px solid var(--color-error);
  }

  .page-admin__badge--done {
    color: var(--color-ink);
    background-color: var(--color-surface-container-high);
    border: 1px solid var(--color-outline-variant);
  }

  /* ─── Error expand ─── */
  .page-admin__error-cell {
    max-width: 260px;
  }

  .page-admin__err-toggle {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-secondary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    min-height: 28px;
  }

  .page-admin__err-toggle:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
    border-radius: 2px;
  }

  .page-admin__err-detail {
    margin-top: var(--space-xs);
    padding: var(--space-sm);
    background-color: var(--color-inverse-surface);
    border-radius: var(--radius, 0.25rem);
    max-width: 400px;
  }

  .page-admin__err-pre {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-inverse-on-surface);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
    line-height: 1.5;
  }

  .page-admin__no-error {
    color: var(--color-outline);
  }

  /* ─── Requeue button ─── */
  .page-admin__actions {
    white-space: nowrap;
    text-align: right;
  }

  .page-admin__requeue-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 var(--space-md);
    min-width: 80px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-on-secondary-container);
    background-color: var(--color-secondary-container);
    border: none;
    border-radius: var(--radius, 0.25rem);
    cursor: pointer;
    transition:
      opacity 160ms ease,
      transform 160ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  .page-admin__requeue-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    .page-admin__requeue-btn:not(:disabled):hover {
      opacity: 0.88;
      transform: translateY(-1px);
    }
  }

  .page-admin__requeue-btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .page-admin__requeue-btn,
    .page-admin__tab,
    .page-admin__search-input,
    .page-admin__select {
      transition: none;
    }
    .page-admin__requeue-btn:hover {
      transform: none;
    }
  }

  /* ─── Settings Form ─── */
  .page-admin__settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    max-width: 600px;
  }

  .page-admin__field {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .page-admin__success-message {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-ink-variant);
    padding: var(--space-md);
    background-color: var(--color-surface-container-low);
    border-radius: var(--radius);
  }

  /* ─── Screen-reader only utility ─── */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ─── Responsive ─── */
  @media (max-width: 640px) {
    .page-admin__header {
      padding: var(--space-xl) var(--space-md) var(--space-lg);
    }

    .page-admin__search-input {
      width: 100%;
    }

    .page-admin__toolbar {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .page-admin__count {
      margin-left: 0;
      padding-bottom: 0;
      align-self: auto;
    }

    .page-admin__table th,
    .page-admin__table td {
      padding: var(--space-xs) var(--space-sm);
    }

    .page-admin__err-detail {
      max-width: calc(100vw - var(--space-2xl));
    }
  }
</style>
