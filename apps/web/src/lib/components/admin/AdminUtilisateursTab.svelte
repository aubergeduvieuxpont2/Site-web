<script lang="ts">
  import { onMount } from "svelte";
  import {
    adminUsers,
    adminSetUserRole,
    adminUserResetLink,
    isError,
    type AdminUserRow,
  } from "$lib/api";

  // The id of the currently-authenticated admin. Role controls are hidden for
  // this user so an admin can never change their own role from the UI (the
  // server enforces the same rule independently).
  let { currentUserId }: { currentUserId: number } = $props();

  // ─── State ───
  let searchQuery = $state("");
  let users = $state<AdminUserRow[]>([]);
  let loading = $state(false);
  let globalError = $state<string | null>(null);

  // Per-user-id maps keyed by user id.
  let roleLoading = $state<Record<number, boolean>>({});
  let linkLoading = $state<Record<number, boolean>>({});
  let rowErrors = $state<Record<number, string | null>>({});
  let rowLinks = $state<Record<number, string | null>>({});
  let copied = $state<Record<number, boolean>>({});

  // Read-only URL inputs, for the clipboard fallback (select-on-copy-failure).
  let urlInputs = $state<Record<number, HTMLInputElement>>({});

  let debounceTimer: ReturnType<typeof setTimeout>;
  let copyTimers: Record<number, ReturnType<typeof setTimeout>> = {};

  const isSelf = (id: number) => id === currentUserId;
  const isEmpty = $derived(!loading && users.length === 0 && globalError === null);

  // ─── Fetch ───
  async function fetchUsers(q = "") {
    loading = true;
    globalError = null;
    const res = await adminUsers(q.trim() || undefined);
    loading = false;
    if (isError(res)) {
      globalError = "Erreur lors du chargement des utilisateurs.";
      users = [];
    } else {
      users = res.users;
    }
  }

  function onSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchUsers(searchQuery), 300);
  }

  // ─── Formatting (output goes into escaped {expr} bindings) ───
  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat("fr-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(iso));
    } catch {
      return "—";
    }
  }

  const roleText = (role: AdminUserRow["role"]) =>
    role === "admin" ? "Administrateur" : "Invité";

  // ─── Role toggle ───
  async function handleRoleToggle(user: AdminUserRow) {
    const id = user.id;
    const newRole = user.role === "admin" ? "guest" : "admin";
    roleLoading = { ...roleLoading, [id]: true };
    rowErrors = { ...rowErrors, [id]: null };

    const res = await adminSetUserRole(id, newRole);
    roleLoading = { ...roleLoading, [id]: false };

    if (isError(res)) {
      rowErrors = { ...rowErrors, [id]: res.error };
    } else {
      users = users.map((u) => (u.id === id ? res.user : u));
    }
  }

  // ─── Generate reset link ───
  async function handleGenerateLink(id: number) {
    linkLoading = { ...linkLoading, [id]: true };
    rowErrors = { ...rowErrors, [id]: null };

    const res = await adminUserResetLink(id);
    linkLoading = { ...linkLoading, [id]: false };

    if (isError(res)) {
      rowErrors = { ...rowErrors, [id]: res.error };
    } else {
      rowLinks = { ...rowLinks, [id]: res.url };
    }
  }

  // ─── Copy to clipboard ───
  async function handleCopy(id: number) {
    const url = rowLinks[id];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copied = { ...copied, [id]: true };
      clearTimeout(copyTimers[id]);
      copyTimers[id] = setTimeout(() => {
        copied = { ...copied, [id]: false };
      }, 1500);
    } catch {
      urlInputs[id]?.select();
    }
  }

  onMount(() => {
    fetchUsers("");
  });
</script>

<!-- A <section> is a valid, semantically apt container for a tab panel; the
     Svelte a11y linter is conservative about the tabpanel role here. -->
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section
  class="admin-utilisateurs-tab"
  data-testid="admin-utilisateurs-tab"
  role="tabpanel"
  aria-labelledby="tab-utilisateurs"
>
  <!-- Search bar -->
  <div class="admin-utilisateurs-tab__search-bar">
    <label for="users-email-search" class="admin-utilisateurs-tab__search-label">
      Rechercher par courriel
    </label>
    <input
      type="search"
      id="users-email-search"
      class="admin-utilisateurs-tab__search-input"
      data-testid="users-search-input"
      placeholder="ex: marie@example.com"
      autocomplete="off"
      aria-label="Rechercher un utilisateur par adresse courriel"
      bind:value={searchQuery}
      oninput={onSearchInput}
    />
  </div>

  <!-- Global error -->
  {#if globalError}
    <div
      class="admin-utilisateurs-tab__global-error"
      data-testid="users-global-error"
      role="alert"
      aria-live="assertive"
    >
      <span class="admin-utilisateurs-tab__global-error-msg">{globalError}</span>
    </div>
  {/if}

  <!-- Table region -->
  <div
    class="admin-utilisateurs-tab__table-wrap"
    role="region"
    aria-label="Liste des utilisateurs"
  >
    <table class="admin-utilisateurs-tab__table" data-testid="users-table">
      <thead>
        <tr>
          <th scope="col" class="admin-utilisateurs-tab__th">Courriel</th>
          <th scope="col" class="admin-utilisateurs-tab__th">Nom</th>
          <th scope="col" class="admin-utilisateurs-tab__th">Rôle</th>
          <th scope="col" class="admin-utilisateurs-tab__th">Inscrit le</th>
          <th
            scope="col"
            class="admin-utilisateurs-tab__th admin-utilisateurs-tab__th--actions"
          >
            Actions
          </th>
        </tr>
      </thead>

      <tbody data-testid="users-tbody">
        {#if loading}
          {#each [0, 1, 2] as i (i)}
            <tr
              class="admin-utilisateurs-tab__skeleton-row"
              aria-hidden="true"
              data-testid="users-skeleton-row"
            >
              <td class="admin-utilisateurs-tab__td">
                <div class="admin-utilisateurs-tab__skel admin-utilisateurs-tab__skel--long"></div>
              </td>
              <td class="admin-utilisateurs-tab__td">
                <div class="admin-utilisateurs-tab__skel admin-utilisateurs-tab__skel--mid"></div>
              </td>
              <td class="admin-utilisateurs-tab__td">
                <div class="admin-utilisateurs-tab__skel admin-utilisateurs-tab__skel--badge"></div>
              </td>
              <td class="admin-utilisateurs-tab__td">
                <div class="admin-utilisateurs-tab__skel admin-utilisateurs-tab__skel--short"></div>
              </td>
              <td class="admin-utilisateurs-tab__td admin-utilisateurs-tab__td--actions">
                <div class="admin-utilisateurs-tab__skel admin-utilisateurs-tab__skel--btn"></div>
              </td>
            </tr>
          {/each}
        {:else}
          {#each users as user (user.id)}
            <tr class="admin-utilisateurs-tab__row" data-testid="users-row-{user.id}">
              <!-- Email -->
              <td class="admin-utilisateurs-tab__td" data-testid="users-cell-email-{user.id}">
                {user.email}
              </td>

              <!-- Nom -->
              <td
                class="admin-utilisateurs-tab__td admin-utilisateurs-tab__td--muted"
                data-testid="users-cell-name-{user.id}"
              >
                {user.name ?? "—"}
              </td>

              <!-- Rôle badge -->
              <td class="admin-utilisateurs-tab__td" data-testid="users-cell-role-{user.id}">
                <span
                  class="admin-utilisateurs-tab__badge admin-utilisateurs-tab__badge--{user.role}"
                  aria-label={roleText(user.role)}
                >
                  {roleText(user.role)}
                </span>
              </td>

              <!-- Inscrit le -->
              <td
                class="admin-utilisateurs-tab__td admin-utilisateurs-tab__td--mono"
                data-testid="users-cell-date-{user.id}"
              >
                {formatDate(user.created_at)}
              </td>

              <!-- Actions -->
              <td
                class="admin-utilisateurs-tab__td admin-utilisateurs-tab__td--actions"
                data-testid="users-cell-actions-{user.id}"
              >
                {#if !isSelf(user.id)}
                  <div
                    class="admin-utilisateurs-tab__actions-stack"
                    data-testid="users-actions-stack-{user.id}"
                  >
                    <div class="admin-utilisateurs-tab__btn-row">
                      <button
                        type="button"
                        class="admin-utilisateurs-tab__role-btn"
                        data-testid="users-role-btn-{user.id}"
                        aria-label={user.role === "admin"
                          ? "Rétrograder au rôle invité"
                          : "Promouvoir au rôle administrateur"}
                        aria-busy={roleLoading[user.id] ?? false}
                        disabled={roleLoading[user.id] ?? false}
                        onclick={() => handleRoleToggle(user)}
                      >
                        {user.role === "admin" ? "Rétrograder" : "Promouvoir"}
                      </button>

                      <button
                        type="button"
                        class="admin-utilisateurs-tab__link-btn"
                        data-testid="users-link-btn-{user.id}"
                        aria-label="Générer un lien de réinitialisation pour cet utilisateur"
                        aria-busy={linkLoading[user.id] ?? false}
                        disabled={linkLoading[user.id] ?? false}
                        onclick={() => handleGenerateLink(user.id)}
                      >
                        Générer un lien
                      </button>
                    </div>

                    {#if rowErrors[user.id]}
                      <span
                        class="admin-utilisateurs-tab__row-error"
                        data-testid="users-row-error-{user.id}"
                        role="alert"
                        aria-live="polite"
                      >
                        {rowErrors[user.id]}
                      </span>
                    {/if}

                    {#if rowLinks[user.id]}
                      <div
                        class="admin-utilisateurs-tab__url-chip"
                        data-testid="users-url-chip-{user.id}"
                      >
                        <span
                          class="admin-utilisateurs-tab__url-sr-hint"
                          id="url-hint-{user.id}"
                        >
                          Lien de réinitialisation — cliquer pour copier
                        </span>
                        <input
                          type="text"
                          class="admin-utilisateurs-tab__url-input"
                          data-testid="users-url-input-{user.id}"
                          readonly
                          value={rowLinks[user.id]}
                          aria-label="Lien de réinitialisation"
                          aria-describedby="url-hint-{user.id}"
                          tabindex="0"
                          bind:this={urlInputs[user.id]}
                        />
                        <button
                          type="button"
                          class="admin-utilisateurs-tab__copy-btn {copied[user.id]
                            ? 'is-copied'
                            : ''}"
                          data-testid="users-copy-btn-{user.id}"
                          aria-label="Copier le lien de réinitialisation"
                          onclick={() => handleCopy(user.id)}
                        >
                          <svg
                            class="admin-utilisateurs-tab__copy-icon"
                            aria-hidden="true"
                            width="13"
                            height="13"
                            viewBox="0 0 13 13"
                            fill="none"
                          >
                            <rect
                              x="4"
                              y="4"
                              width="8"
                              height="8"
                              rx="1.5"
                              stroke="currentColor"
                              stroke-width="1.25"
                            />
                            <path
                              d="M2.5 9H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5"
                              stroke="currentColor"
                              stroke-width="1.25"
                              stroke-linecap="round"
                            />
                          </svg>
                          <span
                            class="admin-utilisateurs-tab__copy-label"
                            data-testid="users-copy-label-{user.id}"
                          >
                            {copied[user.id] ? "Copié !" : "Copier"}
                          </span>
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Empty state -->
  {#if isEmpty}
    <div class="admin-utilisateurs-tab__empty" data-testid="users-empty" role="status">
      <p class="admin-utilisateurs-tab__empty-msg">Aucun utilisateur trouvé.</p>
    </div>
  {/if}
</section>

<style>
  /* ─── Layout ─── */
  .admin-utilisateurs-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md) 0;
  }

  /* ─── Search bar ─── */
  .admin-utilisateurs-tab__search-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 380px;
  }

  .admin-utilisateurs-tab__search-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--color-ink-mute);
  }

  .admin-utilisateurs-tab__search-input {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    background: var(--color-surface);
    border: 1px solid var(--color-hairline);
    border-radius: 4px;
    padding: 9px var(--space-sm);
    width: 100%;
    min-height: 44px;
    outline: none;
    transition: border-color 0.15s ease;
    appearance: none;
    -webkit-appearance: none;
  }

  .admin-utilisateurs-tab__search-input:focus {
    border-color: var(--color-terracotta);
    box-shadow: 0 0 0 3px rgba(157, 67, 0, 0.12);
  }

  /* ─── Global error ─── */
  .admin-utilisateurs-tab__global-error {
    background: rgba(186, 26, 26, 0.07);
    border: 1px solid var(--color-error);
    border-radius: 4px;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-error);
  }

  /* ─── Table wrap ─── */
  .admin-utilisateurs-tab__table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-hairline);
    border-radius: 6px;
    background: var(--color-surface);
    -webkit-overflow-scrolling: touch;
  }

  /* ─── Table base ─── */
  .admin-utilisateurs-tab__table {
    width: 100%;
    min-width: 600px;
    border-collapse: collapse;
    table-layout: fixed;
  }

  /* ─── Table header ─── */
  .admin-utilisateurs-tab__th {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 500;
    color: rgba(247, 249, 251, 0.72);
    background: var(--color-charcoal);
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    white-space: nowrap;
    border-bottom: 2px solid rgba(0, 0, 0, 0.25);
    position: sticky;
    top: 0;
  }

  .admin-utilisateurs-tab__th--actions {
    text-align: right;
    width: 260px;
  }

  /* ─── Table rows & cells ─── */
  .admin-utilisateurs-tab__row {
    border-bottom: 1px solid var(--color-hairline);
    transition: background-color 0.1s ease;
  }

  .admin-utilisateurs-tab__row:last-child {
    border-bottom: none;
  }

  .admin-utilisateurs-tab__row:hover {
    background-color: rgba(198, 198, 205, 0.1);
  }

  .admin-utilisateurs-tab__td {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink);
    padding: var(--space-sm) var(--space-md);
    vertical-align: top;
    word-break: break-word;
  }

  .admin-utilisateurs-tab__td--muted {
    color: var(--color-ink-soft);
  }

  .admin-utilisateurs-tab__td--mono {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-ink-soft);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .admin-utilisateurs-tab__td--actions {
    text-align: right;
    vertical-align: top;
    width: 260px;
  }

  /* ─── Role badges ─── */
  .admin-utilisateurs-tab__badge {
    display: inline-flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 2px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .admin-utilisateurs-tab__badge--admin {
    background: var(--color-badge-admin-bg);
    color: var(--color-badge-admin-fg);
  }

  .admin-utilisateurs-tab__badge--guest {
    background: var(--color-badge-guest-bg);
    color: var(--color-badge-guest-fg);
  }

  /* ─── Actions layout ─── */
  .admin-utilisateurs-tab__actions-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .admin-utilisateurs-tab__btn-row {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  /* ─── Role + link buttons ─── */
  .admin-utilisateurs-tab__role-btn,
  .admin-utilisateurs-tab__link-btn {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    color: var(--color-ink);
    background: transparent;
    border: 1px solid var(--color-hairline);
    border-radius: 3px;
    padding: 4px 10px;
    min-height: 28px;
    min-width: 44px;
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease,
      color 0.12s ease;
    white-space: nowrap;
  }

  .admin-utilisateurs-tab__role-btn:hover:not(:disabled),
  .admin-utilisateurs-tab__link-btn:hover:not(:disabled) {
    background: var(--color-ember-pale);
    border-color: var(--color-terracotta);
    color: var(--color-terracotta);
  }

  .admin-utilisateurs-tab__role-btn:focus-visible,
  .admin-utilisateurs-tab__link-btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
  }

  .admin-utilisateurs-tab__role-btn:disabled,
  .admin-utilisateurs-tab__link-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* ─── Per-row error ─── */
  .admin-utilisateurs-tab__row-error {
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--color-terracotta);
    text-align: right;
  }

  /* ─── URL chip (wax-seal reveal) ─── */
  .admin-utilisateurs-tab__url-sr-hint {
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

  .admin-utilisateurs-tab__url-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    border-radius: 3px;
    padding: 2px;
    animation: wax-seal-reveal 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }

  @keyframes wax-seal-reveal {
    0% {
      background-color: var(--color-ember);
      opacity: 0;
      transform: scale(0.97) translateY(-2px);
    }
    20% {
      background-color: var(--color-ember);
      opacity: 1;
      transform: scale(1.015) translateY(0);
    }
    55% {
      background-color: var(--color-ember-pale);
      transform: scale(1);
    }
    100% {
      background-color: transparent;
      transform: scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-utilisateurs-tab__url-chip {
      animation: none;
    }
  }

  .admin-utilisateurs-tab__url-input {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-ink);
    background: var(--color-url-surface);
    border: 1px solid var(--color-hairline);
    border-radius: 3px;
    padding: 4px 7px;
    flex: 1;
    min-width: 0;
    max-width: 160px;
    cursor: text;
    outline: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: all;
  }

  .admin-utilisateurs-tab__url-input:focus {
    border-color: var(--color-terracotta);
    box-shadow: 0 0 0 2px rgba(157, 67, 0, 0.1);
  }

  .admin-utilisateurs-tab__copy-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 500;
    color: var(--color-ink);
    background: var(--color-url-surface);
    border: 1px solid var(--color-hairline);
    border-radius: 3px;
    padding: 4px 8px;
    min-height: 28px;
    min-width: 44px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background-color 0.12s,
      color 0.12s,
      border-color 0.12s;
  }

  .admin-utilisateurs-tab__copy-btn:hover {
    background: var(--color-ember-pale);
    border-color: var(--color-terracotta);
    color: var(--color-terracotta);
  }

  .admin-utilisateurs-tab__copy-btn:focus-visible {
    outline: 2px solid var(--color-terracotta);
    outline-offset: 3px;
  }

  .admin-utilisateurs-tab__copy-btn.is-copied {
    color: var(--color-forest);
    border-color: var(--color-forest);
    background: var(--color-forest-surface);
  }

  .admin-utilisateurs-tab__copy-icon {
    flex-shrink: 0;
  }

  /* ─── Skeleton shimmer ─── */
  .admin-utilisateurs-tab__skel {
    height: 13px;
    border-radius: 3px;
    background: linear-gradient(
      90deg,
      var(--color-hairline) 25%,
      rgba(198, 198, 205, 0.35) 50%,
      var(--color-hairline) 75%
    );
    background-size: 200% 100%;
    animation: skel-shimmer 1.5s ease-in-out infinite;
  }

  .admin-utilisateurs-tab__skel--long {
    width: 80%;
  }
  .admin-utilisateurs-tab__skel--mid {
    width: 55%;
  }
  .admin-utilisateurs-tab__skel--short {
    width: 40%;
  }
  .admin-utilisateurs-tab__skel--badge {
    width: 72px;
    height: 20px;
    border-radius: 2px;
  }
  .admin-utilisateurs-tab__skel--btn {
    width: 90px;
    height: 24px;
    border-radius: 3px;
    margin-left: auto;
  }

  @keyframes skel-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .admin-utilisateurs-tab__skel {
      animation: none;
    }
  }

  .admin-utilisateurs-tab__skeleton-row {
    border-bottom: 1px solid var(--color-hairline);
  }

  /* ─── Empty state ─── */
  .admin-utilisateurs-tab__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl) var(--space-md);
    border: 1px dashed var(--color-hairline);
    border-radius: 6px;
    background: rgba(198, 198, 205, 0.04);
  }

  .admin-utilisateurs-tab__empty-msg {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--color-ink-soft);
    margin: 0;
  }

  /* ─── Responsive (≤640px) ─── */
  @media (max-width: 640px) {
    .admin-utilisateurs-tab__search-bar {
      max-width: 100%;
    }

    .admin-utilisateurs-tab__th--actions,
    .admin-utilisateurs-tab__td--actions {
      text-align: left;
      width: auto;
    }

    .admin-utilisateurs-tab__actions-stack {
      align-items: flex-start;
    }

    .admin-utilisateurs-tab__btn-row {
      justify-content: flex-start;
    }

    .admin-utilisateurs-tab__url-input {
      max-width: 140px;
    }
  }
</style>
