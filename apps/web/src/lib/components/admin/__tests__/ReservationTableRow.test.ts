/**
 * ReservationTableRow — WS-A compact spec.
 *
 * The row is reduced to: Nom · Arrivée · Départ · Chambres · Statut · Actions.
 * Fields removed from the row (email, phone, people, message) move to
 * ReservationDetailModal. Row click opens the detail modal; status action
 * buttons must stopPropagation so they never trigger the row click.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import * as fs from "fs";
import * as path from "path";

import ReservationTableRow, {
  formatDateOnly,
  displayNameOf,
  statusLabel,
} from "../ReservationTableRow.svelte";
import type { ReservationRow } from "$lib/api";

afterEach(() => cleanup());

// ── Source-level checks (WS-A) ──────────────────────────────────────────────

const rowSrc = fs.readFileSync(
  path.resolve(__dirname, "../ReservationTableRow.svelte"),
  "utf-8",
);

describe("ReservationTableRow — source invariants (WS-A)", () => {
  it("does not contain raw innerHTML or {@html}", () => {
    expect(rowSrc).not.toContain("innerHTML");
    expect(rowSrc).not.toContain("{@html");
  });

  it("exports formatDateOnly, displayNameOf, statusLabel", () => {
    expect(rowSrc).toContain("export function formatDateOnly");
    expect(rowSrc).toContain("export function displayNameOf");
    expect(rowSrc).toContain("export function statusLabel");
  });

  it("no longer ships the removed truncateMessage helper (Message column dropped)", () => {
    expect(rowSrc).not.toContain("truncateMessage");
  });

  it("defines a CSS badge class for held (amber payment-pending)", () => {
    expect(rowSrc).toContain("status-badge--held");
  });

  it("defines a CSS badge class for released (muted purple expired)", () => {
    expect(rowSrc).toContain("status-badge--released");
  });

  it("does not add held or released to the admin onSetStatus union (system-only transitions)", () => {
    // The onSetStatus type must remain restricted to the three admin-settable statuses.
    // A union that included held or released would permit admin clients to set
    // system-only statuses from the UI, violating INV-status-domain.
    expect(rowSrc).toContain('"pending" | "confirmed" | "cancelled"');
    expect(rowSrc).not.toMatch(/onSetStatus.*held/);
    expect(rowSrc).not.toMatch(/onSetStatus.*released/);
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe("formatDateOnly", () => {
  it("formats a valid YYYY-MM-DD as its exact calendar day (no UTC shift)", () => {
    expect(formatDateOnly("2026-08-01")).toBe("2026-08-01");
    expect(formatDateOnly("2026-01-31")).toBe("2026-01-31");
  });

  it("returns — for null, undefined, or malformed input", () => {
    expect(formatDateOnly(null)).toBe("—");
    expect(formatDateOnly(undefined)).toBe("—");
    expect(formatDateOnly("2026-8-1")).toBe("—");
    expect(formatDateOnly("not-a-date")).toBe("—");
  });
});

describe("displayNameOf", () => {
  it("joins first and last name when present", () => {
    expect(
      displayNameOf({ first_name: "Marie", last_name: "Tremblay", name: "X" }),
    ).toBe("Marie Tremblay");
  });

  it("uses a single provided name part", () => {
    expect(
      displayNameOf({ first_name: "Marie", last_name: null, name: "X" }),
    ).toBe("Marie");
  });

  it("falls back to legacy name, then —", () => {
    expect(
      displayNameOf({ first_name: null, last_name: null, name: "Legacy" }),
    ).toBe("Legacy");
    expect(
      displayNameOf({ first_name: null, last_name: null, name: null }),
    ).toBe("—");
  });
});

describe("statusLabel", () => {
  it("maps each known status to its French label", () => {
    expect(statusLabel("confirmed")).toBe("Confirmé");
    expect(statusLabel("cancelled")).toBe("Annulé");
    expect(statusLabel("pending")).toBe("En attente");
  });

  it("maps held to the French payment-pending label", () => {
    expect(statusLabel("held")).toBe("En attente de paiement");
  });

  it("maps released to the French expired-hold label", () => {
    expect(statusLabel("released")).toBe("Expirée");
  });

  it("defaults to En attente for null, undefined, or unknown values", () => {
    expect(statusLabel(null)).toBe("En attente");
    expect(statusLabel(undefined)).toBe("En attente");
    expect(statusLabel("bogus")).toBe("En attente");
  });
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

function baseRow(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id: 7,
    code: "AVP-ABC123",
    name: "Ancien Nom",
    first_name: "Marie",
    last_name: "Tremblay",
    email: "marie@example.ca",
    phone: "418-555-0100",
    room: null,
    arrive: "2026-08-01",
    depart: "2026-08-03",
    people: 3,
    room_count: 2,
    message: "Bonjour",
    status: "pending",
    created_at: "2026-07-01",
    ...overrides,
  };
}

function props(rowOverrides: Partial<ReservationRow> = {}) {
  return {
    row: baseRow(rowOverrides),
    onSetStatus: vi.fn(),
  };
}

// ── Compact row cells (WS-A spec: Nom · Arrivée · Départ · Chambres · Statut · Actions) ──

describe("ReservationTableRow — compact cells", () => {
  it("renders the reservation row with its id", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("reservation-row").getAttribute("data-reservation-id")).toBe("7");
  });

  it("renders the guest display name", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("row-name").textContent?.trim()).toBe("Marie Tremblay");
  });

  it("renders the arrive and depart dates", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("row-arrive").textContent?.trim()).toBe("2026-08-01");
    expect(getByTestId("row-depart").textContent?.trim()).toBe("2026-08-03");
  });

  it("renders — for null dates", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ arrive: null, depart: null }),
    });
    expect(getByTestId("row-arrive").textContent?.trim()).toBe("—");
    expect(getByTestId("row-depart").textContent?.trim()).toBe("—");
  });

  it("renders the room count", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("row-room-count").textContent?.trim()).toBe("2");
  });

  it("renders — for null room_count", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ room_count: null }),
    });
    expect(getByTestId("row-room-count").textContent?.trim()).toBe("—");
  });
});

// ── Status cell ──────────────────────────────────────────────────────────────

describe("ReservationTableRow — status cell", () => {
  it("renders the pending badge and both action buttons by default", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("En attente");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--pending",
    );
    expect(badge.getAttribute("aria-label")).toBe("Statut: En attente");
    expect(getByTestId("btn-status-confirm")).not.toBeNull();
    expect(getByTestId("btn-status-cancel")).not.toBeNull();
  });

  it("treats a null status as pending", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: null }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("En attente");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--pending",
    );
  });

  it("hides Confirmer when already confirmed", () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props({ status: "confirmed" }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("Confirmé");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--confirmed",
    );
    expect(queryByTestId("btn-status-confirm")).toBeNull();
    expect(getByTestId("btn-status-cancel")).not.toBeNull();
  });

  it("hides Annuler when already cancelled", () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props({ status: "cancelled" }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("Annulé");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--cancelled",
    );
    expect(getByTestId("btn-status-confirm")).not.toBeNull();
    expect(queryByTestId("btn-status-cancel")).toBeNull();
  });

  it("renders the held badge with the amber payment-pending style and both action buttons", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "held" }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("En attente de paiement");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--held",
    );
    expect(badge.getAttribute("aria-label")).toBe("Statut: En attente de paiement");
    expect(getByTestId("btn-status-confirm")).not.toBeNull();
    expect(getByTestId("btn-status-cancel")).not.toBeNull();
  });

  it("renders the released badge with the muted purple expired style and both action buttons", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "released" }),
    });
    const badge = getByTestId("row-status-badge");
    expect(badge.textContent?.trim()).toBe("Expirée");
    expect(badge.className).toContain(
      "reservation-table-row__status-badge--released",
    );
    expect(badge.getAttribute("aria-label")).toBe("Statut: Expirée");
    expect(getByTestId("btn-status-confirm")).not.toBeNull();
    expect(getByTestId("btn-status-cancel")).not.toBeNull();
  });

  it("invokes onSetStatus with the row id and target status", async () => {
    const onSetStatus = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: {
        row: baseRow({ status: "pending" }),
        onSetStatus,
      },
    });

    await fireEvent.click(getByTestId("btn-status-confirm"));
    expect(onSetStatus).toHaveBeenCalledWith(7, "confirmed");

    await fireEvent.click(getByTestId("btn-status-cancel"));
    expect(onSetStatus).toHaveBeenCalledWith(7, "cancelled");
  });

  it("does not throw when onSetStatus is omitted (optional callback)", async () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: {
        row: baseRow({ status: "pending" }),
      },
    });
    await fireEvent.click(getByTestId("btn-status-confirm"));
    // No assertion needed — the optional-chained call must be a no-op, not a throw.
  });
});

// ── stopPropagation — action buttons must not bubble to row click ─────────────

describe("ReservationTableRow — action button stopPropagation (WS-A)", () => {
  it("status confirm button does not propagate click to the row", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: {
        ...props({ status: "pending" }),
        onOpenDetail,
      },
    });
    await fireEvent.click(getByTestId("btn-status-confirm"));
    // Row-level handler must NOT fire — the action button consumed the event.
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it("status cancel button does not propagate click to the row", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: {
        ...props({ status: "pending" }),
        onOpenDetail,
      },
    });
    await fireEvent.click(getByTestId("btn-status-cancel"));
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it("clicking the row body (not a button) fires onOpenDetail", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: {
        ...props(),
        onOpenDetail,
      },
    });
    await fireEvent.click(getByTestId("row-name"));
    expect(onOpenDetail).toHaveBeenCalledWith(7);
  });
});

// ── Keyboard activation — row vs. action buttons ─────────────────────────────

describe("ReservationTableRow — keyboard activation (WS-A)", () => {
  it("Enter and Space on the row itself open the detail modal", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: { ...props(), onOpenDetail },
    });
    const row = getByTestId("reservation-row");

    await fireEvent.keyDown(row, { key: "Enter" });
    expect(onOpenDetail).toHaveBeenCalledWith(7);

    await fireEvent.keyDown(row, { key: " " });
    expect(onOpenDetail).toHaveBeenCalledTimes(2);
  });

  it("Enter on an action button neither opens the modal nor cancels the button's activation", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: { ...props({ status: "pending" }), onOpenDetail },
    });

    // The keydown bubbles from the button up to the <tr>; the row handler must
    // ignore it. fireEvent returns false when preventDefault was called — the
    // row must NOT preventDefault, or the button's native Enter activation
    // (the status change) would be silently dropped.
    const notCancelled = await fireEvent.keyDown(
      getByTestId("btn-status-confirm"),
      { key: "Enter" },
    );
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });

  it("Space on an action button neither opens the modal nor cancels the button's activation", async () => {
    const onOpenDetail = vi.fn();
    const { getByTestId } = render(ReservationTableRow, {
      props: { ...props({ status: "pending" }), onOpenDetail },
    });
    const notCancelled = await fireEvent.keyDown(
      getByTestId("btn-status-cancel"),
      { key: " " },
    );
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });
});

// ── Icon buttons — SVG presence and a11y ─────────────────────────────────────

describe("ReservationTableRow — icon buttons (SVG)", () => {
  it("confirm button contains an <svg> with aria-hidden", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    const btn = getByTestId("btn-status-confirm");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  it("cancel button contains an <svg> with aria-hidden", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    const btn = getByTestId("btn-status-cancel");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  it("confirm button keeps its accessible aria-label", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    expect(getByTestId("btn-status-confirm").getAttribute("aria-label")).toBe(
      "Confirmer la réservation",
    );
  });

  it("cancel button keeps its accessible aria-label", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    expect(getByTestId("btn-status-cancel").getAttribute("aria-label")).toBe(
      "Annuler la réservation",
    );
  });

  it("per-status visibility: pending shows both icon buttons", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "pending" }),
    });
    expect(getByTestId("btn-status-confirm").querySelector("svg")).not.toBeNull();
    expect(getByTestId("btn-status-cancel").querySelector("svg")).not.toBeNull();
  });

  it("per-status visibility: confirmed hides confirm icon, shows cancel icon", () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props({ status: "confirmed" }),
    });
    expect(queryByTestId("btn-status-confirm")).toBeNull();
    expect(getByTestId("btn-status-cancel").querySelector("svg")).not.toBeNull();
  });

  it("per-status visibility: cancelled shows confirm icon, hides cancel icon", () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props({ status: "cancelled" }),
    });
    expect(getByTestId("btn-status-confirm").querySelector("svg")).not.toBeNull();
    expect(queryByTestId("btn-status-cancel")).toBeNull();
  });

  it("per-status visibility: held shows both action buttons (system-only status, no UI suppression)", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "held" }),
    });
    expect(getByTestId("btn-status-confirm").querySelector("svg")).not.toBeNull();
    expect(getByTestId("btn-status-cancel").querySelector("svg")).not.toBeNull();
  });

  it("per-status visibility: released shows both action buttons (system-only status, no UI suppression)", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ status: "released" }),
    });
    expect(getByTestId("btn-status-confirm").querySelector("svg")).not.toBeNull();
    expect(getByTestId("btn-status-cancel").querySelector("svg")).not.toBeNull();
  });
});
