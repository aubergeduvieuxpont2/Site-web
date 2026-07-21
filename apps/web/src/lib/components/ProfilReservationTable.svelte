<script lang="ts">
  import { formatDateOnly } from "$lib/utils";
  import type { ReservationRow } from "$lib/api";
  import { t } from "$lib/i18n.svelte";

  let { reservations = [] }: { reservations: ReservationRow[] } = $props();
</script>

<div class="profil-reservation-table" data-testid="profil-reservation-table">
  <table role="grid" aria-label={t("profil.reservations_aria")}>
    <thead>
      <tr>
        <th scope="col" data-testid="col-arrive">{t("profil.col.arrive")}</th>
        <th scope="col" data-testid="col-depart">{t("profil.col.depart")}</th>
        <th scope="col" data-testid="col-people">{t("profil.col.people")}</th>
        <th scope="col" data-testid="col-room">{t("profil.col.room")}</th>
      </tr>
    </thead>
    <tbody>
      {#each reservations as res, idx (res.id)}
        <tr data-testid="reservation-row-{idx}">
          <td data-testid="cell-arrive">{formatDateOnly(res.arrive)}</td>
          <td data-testid="cell-depart">{formatDateOnly(res.depart)}</td>
          <td data-testid="cell-people">{res.people}</td>
          <td data-testid="cell-room">{res.room ?? "—"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if reservations.length === 0}
    <p class="profil-reservation-table__empty" data-testid="empty-state">
      {t("profil.empty")}
    </p>
  {/if}
</div>

<style>
  .profil-reservation-table {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .profil-reservation-table table {
    width: 100%;
    border-collapse: collapse;
    background-color: var(--surface-raised, #ece7db);
    border: 1px solid var(--border, #c4baa8);
    border-radius: 4px;
    font-family: "Jost", ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: var(--text, #1c1a17);
  }

  .profil-reservation-table thead {
    background-color: var(--primary, #1b3b2a);
    color: var(--primary-text, #f4efe6);
  }

  .profil-reservation-table th {
    padding: 8px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-strong, #9a8e7e);
  }

  .profil-reservation-table tbody tr {
    border-bottom: 1px solid var(--border, #c4baa8);
    transition: background-color 0.15s ease-out;
  }

  .profil-reservation-table tbody tr:nth-child(even) {
    background-color: var(--surface-sunken, #e0dad0);
  }

  .profil-reservation-table tbody tr:hover {
    background-color: var(--surface-raised, #ece7db);
  }

  .profil-reservation-table td {
    padding: 12px 16px;
    vertical-align: middle;
  }

  .profil-reservation-table__empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--text-muted, #695e51);
    font-style: italic;
  }

  @media (max-width: 640px) {
    .profil-reservation-table {
      min-width: 100%;
      border: 1px solid var(--border, #c4baa8);
    }

    .profil-reservation-table table {
      min-width: 500px;
    }
  }
</style>
