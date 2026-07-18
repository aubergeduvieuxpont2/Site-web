<script lang="ts">
  import { onMount } from 'svelte';
  import { adminEmailIngest, isError } from '$lib/api';
  import type { EmailIngestRow } from '$lib/api';

  let rows = $state<EmailIngestRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const STATUS_LABELS: Record<string, string> = {
    parsed: 'Réservation créée',
    parse_failed: 'Échec d’analyse',
    duplicate: 'Doublon ignoré',
    ignored: 'Sans réservation',
  };

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' });
  }

  onMount(async () => {
    const res = await adminEmailIngest();
    if (isError(res)) {
      error = res.error;
    } else {
      rows = res.rows;
    }
    loading = false;
  });
</script>

<div class="ota-log" data-testid="emails-ota-tab">
  <p class="ota-log__intro">
    Courriels de réservation reçus à bookings@aubergeduvieuxpont.ca (Airbnb et
    Expedia). Chaque courriel est aussi transféré à la boîte de secours.
  </p>

  {#if loading}
    <p class="ota-log__state" aria-live="polite">Chargement…</p>
  {:else if error}
    <p class="ota-log__state ota-log__state--error" role="alert">{error}</p>
  {:else if rows.length === 0}
    <p class="ota-log__state">Aucun courriel traité pour l'instant.</p>
  {:else}
    <div class="ota-log__scroll">
      <table class="ota-log__table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Source</th>
            <th scope="col">Statut</th>
            <th scope="col">Sujet</th>
            <th scope="col">Réservation</th>
            <th scope="col">Erreur</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              <td>{fmtDate(row.created_at)}</td>
              <td class="ota-log__provider">{row.provider ?? '—'}</td>
              <td>
                <span class="ota-log__status ota-log__status--{row.status}">
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              </td>
              <td class="ota-log__subject">{row.subject ?? '—'}</td>
              <td>{row.reservation_id != null ? `#${row.reservation_id}` : '—'}</td>
              <td class="ota-log__error">{row.error ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .ota-log__intro {
    margin: 0 0 1rem;
    color: var(--color-ink-mute);
    font-size: 0.9rem;
    max-width: 60ch;
  }
  .ota-log__state {
    margin: 1rem 0;
    color: var(--color-ink-mute);
  }
  .ota-log__state--error {
    color: var(--color-error);
  }
  /* Wide table scrolls inside its own container — the page never overflows. */
  .ota-log__scroll {
    overflow-x: auto;
  }
  .ota-log__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    min-width: 640px;
  }
  .ota-log__table th,
  .ota-log__table td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-hairline-2);
    vertical-align: top;
  }
  .ota-log__provider {
    text-transform: capitalize;
  }
  .ota-log__subject,
  .ota-log__error {
    max-width: 28ch;
    overflow-wrap: anywhere;
  }
  .ota-log__status {
    white-space: nowrap;
  }
  .ota-log__status--parse_failed {
    color: var(--color-error);
    font-weight: 600;
  }
  .ota-log__status--parsed {
    color: var(--color-forest);
  }
</style>
