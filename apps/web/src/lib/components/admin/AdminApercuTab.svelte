<script lang="ts">
  import { onMount } from "svelte";
  import { adminGetDashboard, isError } from "$lib/api";
  import type { DashboardResponse } from "$lib/api";

  // ── State ──────────────────────────────────────────────────────────────────
  let data = $state<DashboardResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pct(ratio: number | null): string {
    if (ratio === null) return "—";
    return `${Math.round(ratio * 100)} %`;
  }

  function delta(current: number | null, previous: number | null): string {
    if (current === null || previous === null) return "";
    const diff = Math.round((current - previous) * 100);
    if (diff === 0) return "";
    return diff > 0 ? `+${diff} pp` : `${diff} pp`;
  }

  function deltaGuests(current: number, previous: number): string {
    const diff = current - previous;
    if (diff === 0) return "";
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  function deltaSign(current: number | null, previous: number | null): "positive" | "negative" | "neutral" {
    if (current === null || previous === null) return "neutral";
    if (current > previous) return "positive";
    if (current < previous) return "negative";
    return "neutral";
  }

  function deltaGuestSign(current: number, previous: number): "positive" | "negative" | "neutral" {
    if (current > previous) return "positive";
    if (current < previous) return "negative";
    return "neutral";
  }

  function formatShortDate(iso: string): string {
    try {
      const d = new Date(iso + "T12:00:00Z");
      return d.toLocaleDateString("fr-CA", { weekday: "short", month: "numeric", day: "numeric" });
    } catch {
      return iso;
    }
  }

  function barWidth(available: number, max: number): number {
    if (max === 0) return 0;
    return Math.round((available / max) * 100);
  }

  function availabilityLabel(available: number): string {
    if (available === 0) return "Complet";
    if (available === 1) return "1 chambre libre";
    return `${available} chambres libres`;
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function loadDashboard() {
    loading = true;
    error = null;
    try {
      const result = await adminGetDashboard();
      if (isError(result)) {
        error = result.error;
        return;
      }
      data = result;
    } catch {
      error = "Réseau indisponible";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadDashboard();
  });
</script>

<div class="apercu" data-testid="admin-apercu-tab">

  <!-- Error banner -->
  {#if error}
    <div class="apercu__error" role="alert" data-testid="apercu-error">
      {error}
    </div>
  {/if}

  <!-- Loading skeleton -->
  {#if loading}
    <div class="apercu__loading" aria-busy="true" aria-label="Chargement du tableau de bord…" data-testid="apercu-loading">
      <span class="apercu__spinner" aria-hidden="true"></span>
      <span class="apercu__loading-text">Chargement…</span>
    </div>
  {:else if data}
    <!-- ── Stat cards ──────────────────────────────────────────────────────── -->
    <div class="apercu__cards" data-testid="apercu-cards">

      <!-- Clients cette semaine -->
      <div class="apercu__card" data-testid="card-guests-week">
        <p class="apercu__card-label">Clients cette semaine</p>
        <p class="apercu__card-value" data-testid="guests-this-week">{data.guestsThisWeek}</p>
        {#if deltaGuests(data.guestsThisWeek, data.guestsLastWeek)}
          <p
            class="apercu__card-delta apercu__card-delta--{deltaGuestSign(data.guestsThisWeek, data.guestsLastWeek)}"
            data-testid="guests-delta"
          >
            {deltaGuests(data.guestsThisWeek, data.guestsLastWeek)} vs sem. précédente
          </p>
        {:else}
          <p class="apercu__card-delta apercu__card-delta--neutral" data-testid="guests-delta">
            Sem. précédente : {data.guestsLastWeek}
          </p>
        {/if}
      </div>

      <!-- Taux d'occupation — mois courant -->
      <div class="apercu__card" data-testid="card-occupancy-current">
        <p class="apercu__card-label">Occupation (mois courant)</p>
        <p class="apercu__card-value" data-testid="occupancy-current">{pct(data.occupancy.currentMonth)}</p>
        {#if delta(data.occupancy.currentMonth, data.occupancy.previousMonth)}
          <p
            class="apercu__card-delta apercu__card-delta--{deltaSign(data.occupancy.currentMonth, data.occupancy.previousMonth)}"
            data-testid="occupancy-mom-delta"
          >
            {delta(data.occupancy.currentMonth, data.occupancy.previousMonth)} vs mois précédent
          </p>
        {:else}
          <p class="apercu__card-delta apercu__card-delta--neutral" data-testid="occupancy-mom-delta">
            Mois précédent : {pct(data.occupancy.previousMonth)}
          </p>
        {/if}
        {#if delta(data.occupancy.currentMonth, data.occupancy.sameMonthLastYear)}
          <p
            class="apercu__card-delta apercu__card-delta--{deltaSign(data.occupancy.currentMonth, data.occupancy.sameMonthLastYear)}"
            data-testid="occupancy-yoy-delta"
          >
            {delta(data.occupancy.currentMonth, data.occupancy.sameMonthLastYear)} vs même mois l'an dernier
          </p>
        {:else}
          <p class="apercu__card-delta apercu__card-delta--neutral" data-testid="occupancy-yoy-delta">
            Même mois an dernier : {pct(data.occupancy.sameMonthLastYear)}
          </p>
        {/if}
      </div>

      <!-- Clients fidèles -->
      <div class="apercu__card" data-testid="card-returning">
        <p class="apercu__card-label">Clients fidèles</p>
        <p class="apercu__card-value" data-testid="returning-customers">{data.returningCustomers}</p>
        <p class="apercu__card-delta apercu__card-delta--neutral">
          Avec ≥ 2 séjours confirmés
        </p>
      </div>
    </div>

    <!-- ── 7-day availability strip ──────────────────────────────────────── -->
    <section class="apercu__avail" aria-labelledby="apercu-avail-title" data-testid="apercu-avail">
      <h2 class="apercu__section-title" id="apercu-avail-title">
        Disponibilité — 7 prochains jours
      </h2>

      {#if data.next7Days.length === 0}
        <p class="apercu__avail-empty">Aucune donnée disponible.</p>
      {:else}
        {@const maxAvail = Math.max(...data.next7Days.map((n) => n.available), 1)}
        <div class="apercu__avail-list" role="list" aria-label="Disponibilité par jour">
          {#each data.next7Days as night (night.date)}
            {@const width = barWidth(night.available, maxAvail)}
            <div
              class="apercu__avail-row"
              role="listitem"
              data-testid="avail-row"
              aria-label="{formatShortDate(night.date)} : {availabilityLabel(night.available)}"
            >
              <span class="apercu__avail-date" aria-hidden="true">
                {formatShortDate(night.date)}
              </span>
              <span class="apercu__avail-bar-wrap" aria-hidden="true">
                <span
                  class="apercu__avail-bar {night.available === 0 ? 'apercu__avail-bar--full' : ''}"
                  style="width: {width}%"
                ></span>
              </span>
              <span class="apercu__avail-count" aria-hidden="true">
                {night.available === 0 ? "Complet" : night.available}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .apercu {
    --surface: #f4efe6;
    --surface-alt: #e0dad0;
    --surface-raised: #ece7db;
    --border: #c4baa8;
    --border-strong: #9a8e7e;
    --text: #1c1a17;
    --text-muted: #695e51;
    --accent: #7b4628;
    --accent-hover: #6a3a20;
    --forest: #1a5c2d;
    --forest-surface: #d4ede0;
    --warn: #7a5c00;
    --warn-surface: #fff3cc;
    --error: #ba1a1a;
    --error-surface: #fce8e8;
    --focus-ring: #7b4628;
    --font-ui: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    --font-mono: "IBM Plex Mono", ui-monospace, monospace;

    padding: 24px;
    min-height: 200px;
  }

  /* ── Error banner ─────────────────────────────────────────────────────────── */
  .apercu__error {
    padding: 10px 14px;
    background-color: var(--error-surface);
    border: 1px solid var(--error);
    border-radius: 2px;
    color: var(--error);
    font-family: var(--font-ui);
    font-size: 13px;
    margin-bottom: 20px;
  }

  /* ── Loading ──────────────────────────────────────────────────────────────── */
  .apercu__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 60px 20px;
  }

  .apercu__spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .apercu__loading-text {
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text-muted);
  }

  /* ── Stat cards ───────────────────────────────────────────────────────────── */
  .apercu__cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .apercu__card {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .apercu__card-label {
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0;
  }

  .apercu__card-value {
    font-family: var(--font-mono);
    font-size: 32px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
    margin: 4px 0 2px;
  }

  .apercu__card-delta {
    font-family: var(--font-ui);
    font-size: 12px;
    margin: 0;
    line-height: 1.4;
  }

  .apercu__card-delta--positive {
    color: var(--forest);
  }

  .apercu__card-delta--negative {
    color: var(--error);
  }

  .apercu__card-delta--neutral {
    color: var(--text-muted);
  }

  /* ── Availability strip ───────────────────────────────────────────────────── */
  .apercu__section-title {
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 14px;
  }

  .apercu__avail {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 18px 20px;
  }

  .apercu__avail-empty {
    font-family: var(--font-ui);
    font-size: 14px;
    color: var(--text-muted);
    text-align: center;
    padding: 20px 0;
    margin: 0;
  }

  .apercu__avail-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .apercu__avail-row {
    display: grid;
    grid-template-columns: 100px 1fr 52px;
    align-items: center;
    gap: 10px;
    min-height: 28px;
  }

  .apercu__avail-date {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .apercu__avail-bar-wrap {
    height: 14px;
    background-color: var(--surface-alt);
    border-radius: 2px;
    overflow: hidden;
    min-width: 0;
  }

  .apercu__avail-bar {
    display: block;
    height: 100%;
    background-color: var(--forest);
    border-radius: 2px;
    transition: width 200ms ease;
    min-width: 2px;
  }

  .apercu__avail-bar--full {
    background-color: var(--error);
    width: 100% !important;
    min-width: unset;
  }

  .apercu__avail-count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }

  /* ── Responsive ───────────────────────────────────────────────────────────── */
  @media (max-width: 900px) {
    .apercu__cards {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 600px) {
    .apercu {
      padding: 16px;
    }

    .apercu__cards {
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 24px;
    }

    .apercu__card {
      padding: 14px 16px;
    }

    .apercu__card-value {
      font-size: 28px;
    }

    .apercu__avail {
      padding: 14px 16px;
    }

    .apercu__avail-row {
      grid-template-columns: 80px 1fr 44px;
      gap: 8px;
    }

    .apercu__avail-date {
      font-size: 11px;
    }
  }

  /* 375px hard-rule: single-column, bar still visible */
  @media (max-width: 400px) {
    .apercu__avail-row {
      grid-template-columns: 72px 1fr 40px;
      gap: 6px;
    }

    .apercu__avail-date {
      font-size: 10px;
    }

    .apercu__avail-count {
      font-size: 11px;
    }
  }
</style>
