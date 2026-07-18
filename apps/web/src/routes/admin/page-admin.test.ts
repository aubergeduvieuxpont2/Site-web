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

  it("seeds weeklyPrice and reservationsEnabled in the settings state", () => {
    expect(src).toContain("weeklyPrice: 560");
    expect(src).toContain("reservationsEnabled: true");
  });

  it("extends the tab keyboard-nav order with disponibilites", () => {
    // The order array drives arrow/Home/End focus routing.
    const order = src.slice(src.indexOf("const order = ["));
    expect(order).toContain('"disponibilites"');
  });
});

describe("admin page — settings fields", () => {
  it("renders the weekly-price input and its error hook", () => {
    expect(src).toContain('data-testid="input-weekly-price"');
    expect(src).toContain("bind:value={settings.weeklyPrice}");
    expect(src).toContain('data-testid="error-weekly-price"');
  });

  it("renders the assignable-rooms field read-only (derived from public rooms)", () => {
    expect(src).toContain('data-testid="input-assignable-rooms"');
    // Derived value: displayed via value=, never two-way bound or editable.
    expect(src).toContain("value={settings.assignableRoomCount}");
    expect(src).toContain("readonly");
    expect(src).not.toContain("bind:value={settings.assignableRoomCount}");
    // No validation/error hook — the field can't be authored by the user.
    expect(src).not.toContain('data-testid="error-assignable-rooms"');
  });

  it("renders the reservations-enabled toggle bound to state", () => {
    expect(src).toContain('data-testid="toggle-reservations-enabled"');
    expect(src).toContain("bind:checked={settings.reservationsEnabled}");
    expect(src).toContain('type="checkbox"');
  });

  it("validates weeklyPrice as a positive integer and does not validate the derived room count", () => {
    expect(src).toContain("errors.weeklyPrice");
    expect(src).toContain("Number.isInteger(weeklyPrice)");
    // assignableRoomCount is server-derived: no client-side validation.
    expect(src).not.toContain("errors.assignableRoomCount");
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
    expect(src).toContain(
      "<AdminDisponibilitesTab assignableRoomCount={settings.assignableRoomCount ?? 12} />",
    );
  });
});

describe("admin page — reservations status column", () => {
  it("adds the Statut column header", () => {
    expect(src).toContain("<th scope=\"col\">Statut</th>");
  });

  it("bumps the empty-state colspan from 9 to 10", () => {
    expect(src).toContain('colspan="10"');
    expect(src).not.toContain('colspan="9"');
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
