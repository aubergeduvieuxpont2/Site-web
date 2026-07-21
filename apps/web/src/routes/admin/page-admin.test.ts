// @vitest-environment node
//
// Source-level checks for the admin-page-enhancements element. The admin page
// renders its tabs/panels only after an onMount auth gate resolves, which does
// not run under SSR — so behavioural coverage of the child pieces lives in their
// own component tests (ReservationTableRow.test.ts, AdminDisponibilitesTab.test.ts)
// and the new API client in api.test.ts. Here we lock the wiring the page adds:
// the three new settings fields, the Disponibilités tab/panel, the Statut column,
// the status handler, and the security invariants (no innerHTML / {@html}).
import { describe, it, expect, beforeAll } from "vitest";

let src: string;

beforeAll(async () => {
  const raw = await import("./+page.svelte?raw");
  src = (raw as { default: string }).default;
});

describe("admin page — imports & wiring", () => {
  it("imports the AdminDisponibilitesTab component", () => {
    expect(src).toContain(
      'import AdminDisponibilitesTab from "$lib/components/admin/AdminDisponibilitesTab.svelte"',
    );
  });

  it("imports adminSetReservationStatus from the api client", () => {
    expect(src).toContain("adminSetReservationStatus");
  });

  it("extends the activeTab union with 'disponibilites'", () => {
    // The literal must appear inside the $state union declaration.
    expect(src).toMatch(/activeTab = \$state</);
    expect(src).toContain('"disponibilites"');
  });

  it("keeps assignableRoomCount in page scope so AdminDisponibilitesTab can consume it", () => {
    // Settings live in AdminParametresTab; the page owns only the bound count.
    expect(src).toContain("assignableRoomCount");
    expect(src).toContain("AdminParametresTab");
  });

  it("extends the tab keyboard-nav order with disponibilites", () => {
    // The order array drives arrow/Home/End focus routing.
    const order = src.slice(src.indexOf("const order = ["));
    expect(order).toContain('"disponibilites"');
  });
});

describe("admin page — settings delegation", () => {
  it("delegates all settings fields to AdminParametresTab, not inline in the page", () => {
    // Settings state and fields now live inside AdminParametresTab. The page
    // renders only the component shell in panel-settings and binds assignableRoomCount.
    expect(src).toContain("AdminParametresTab");
    expect(src).toContain("bind:assignableRoomCount");
    // Individual field testids must NOT appear in the page — they live in the component.
    expect(src).not.toContain('data-testid="input-weekly-price"');
    expect(src).not.toContain('data-testid="input-assignable-rooms"');
    expect(src).not.toContain('data-testid="toggle-reservations-enabled"');
  });
});

describe("admin page — Disponibilités tab & panel", () => {
  it("renders the Disponibilités tab button with ARIA wiring", () => {
    expect(src).toContain('data-testid="tab-disponibilites"');
    expect(src).toContain('id="tab-disponibilites"');
    expect(src).toContain('aria-controls="panel-disponibilites"');
    expect(src).toContain('aria-selected={activeTab === "disponibilites"}');
  });

  it("renders the Disponibilités tabpanel that lazily mounts the tab", () => {
    expect(src).toContain('data-testid="panel-disponibilites"');
    expect(src).toContain('aria-labelledby="tab-disponibilites"');
    expect(src).toContain('hidden={activeTab !== "disponibilites"}');
    expect(src).toContain('{#if activeTab === "disponibilites"}');
    // The page binds the server-derived count via the Svelte shorthand prop syntax.
    expect(src).toContain("AdminDisponibilitesTab");
    expect(src).toContain("assignableRoomCount");
  });
});

describe("admin page — reservations status column", () => {
  it("keeps the Statut column header", () => {
    expect(src).toContain("<th scope=\"col\">Statut</th>");
  });

  it("uses the compact 6-column set (Nom · Arrivée · Départ · Chambres · Statut · Actions)", () => {
    for (const col of ["Nom", "Arrivée", "Départ", "Chambres", "Statut", "Actions"]) {
      expect(src).toContain(`<th scope="col">${col}</th>`);
    }
    // Detail-only fields must no longer have column headers.
    expect(src).not.toContain('<th scope="col">Courriel</th>');
    expect(src).not.toContain('<th scope="col">Téléphone</th>');
    expect(src).not.toContain('<th scope="col">Pers.</th>');
    expect(src).not.toContain('<th scope="col">Message</th>');
  });

  it("sets the empty-state colspan to 6 to match the compact columns", () => {
    expect(src).toContain('colspan="6"');
    expect(src).not.toContain('colspan="10"');
  });

  it("opens the detail modal from each row via onOpenDetail", () => {
    expect(src).toContain("onOpenDetail={openDetail}");
    expect(src).toContain("<ReservationDetailModal");
  });

  it("threads onSetStatus={handleSetStatus} into each row", () => {
    expect(src).toContain("onSetStatus={handleSetStatus}");
  });

  it("defines an optimistic handleSetStatus with rollback on error", () => {
    expect(src).toContain("async function handleSetStatus(");
    expect(src).toContain("const snapshot = reservations.slice()");
    expect(src).toContain("adminSetReservationStatus(id, status)");
    expect(src).toContain("reservations = snapshot"); // rollback
  });
});

describe("admin page — security invariants", () => {
  it("assigns no innerHTML and injects no raw HTML", () => {
    expect(src).not.toContain("innerHTML");
    expect(src).not.toContain("{@html");
  });
});
