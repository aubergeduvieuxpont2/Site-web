/**
 * ReservationDetailModal — WS-A.
 *
 * Opened by clicking a compact reservation row. Shows the full detail (email,
 * phone, people, message, source/external_ref, created_at, status) plus the
 * Facture panel (InvoiceCreator) and the Chambres assignment (RoomAssignment-
 * Drawer trigger) that were moved out of the row. The modal portals to <body>,
 * so tests query the whole document via `screen`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import type { ApiError, ReservationRow } from "$lib/api";

// RoomAssignmentDrawer (rendered inside the modal) reaches the network only
// through these helpers; mocking the module keeps the modal test hermetic.
vi.mock("$lib/api", () => ({
  adminReservationAssignments: vi.fn().mockResolvedValue({ assignments: [] }),
  adminFreeRooms: vi.fn().mockResolvedValue({ rooms: [] }),
  adminAssignRoom: vi.fn(),
  adminUnassignRoom: vi.fn(),
  isError: (r: unknown): r is ApiError =>
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    typeof (r as ApiError).error === "string",
}));

import ReservationDetailModal from "../ReservationDetailModal.svelte";

afterEach(() => cleanup());

function baseRow(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    id: 7,
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
    message: "Bonjour, une question.",
    status: "pending",
    created_at: "2026-07-01T12:00:00.000Z",
    source: "airbnb",
    external_ref: "HMABC123",
    ...overrides,
  };
}

function props(overrides: Partial<ReservationRow> = {}) {
  return {
    open: true,
    row: baseRow(overrides),
    onClose: vi.fn(),
    onCreateInvoice: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("ReservationDetailModal", () => {
  it("renders no dialog content when closed", () => {
    render(ReservationDetailModal, { props: { ...props(), open: false } });
    expect(screen.queryByTestId("reservation-detail-modal")).toBeNull();
  });

  it("renders the full reservation detail when open", () => {
    render(ReservationDetailModal, { props: props() });
    expect(screen.getByTestId("rdm-title").textContent?.trim()).toBe("Marie Tremblay");
    expect(screen.getByTestId("rdm-email").textContent).toContain("marie@example.ca");
    expect(screen.getByTestId("rdm-phone").textContent?.trim()).toBe("418-555-0100");
    expect(screen.getByTestId("rdm-people").textContent?.trim()).toBe("3");
    expect(screen.getByTestId("rdm-message").textContent?.trim()).toBe(
      "Bonjour, une question.",
    );
    expect(screen.getByTestId("rdm-source").textContent?.trim()).toBe("airbnb");
    expect(screen.getByTestId("rdm-external-ref").textContent?.trim()).toBe("HMABC123");
    expect(screen.getByTestId("rdm-status").textContent?.trim()).toBe("En attente");
    expect(screen.getByTestId("rdm-arrive").textContent?.trim()).toBe("2026-08-01");
    expect(screen.getByTestId("rdm-depart").textContent?.trim()).toBe("2026-08-03");
  });

  it("renders the code only when the row has one", () => {
    const { unmount } = render(ReservationDetailModal, { props: props() });
    expect(screen.queryByTestId("rdm-code")).toBeNull();
    unmount();

    render(ReservationDetailModal, { props: props({ code: "AVP-ABC123" }) });
    expect(screen.getByTestId("rdm-code").textContent?.trim()).toBe("AVP-ABC123");
  });

  it("omits optional fields that are absent", () => {
    render(ReservationDetailModal, {
      props: props({ phone: null, message: null, source: null, external_ref: null }),
    });
    expect(screen.queryByTestId("rdm-phone")).toBeNull();
    expect(screen.queryByTestId("rdm-message")).toBeNull();
    expect(screen.queryByTestId("rdm-source")).toBeNull();
    expect(screen.queryByTestId("rdm-external-ref")).toBeNull();
  });

  it("hosts the Chambres assignment trigger and the Facture panel", async () => {
    const onCreateInvoice = vi.fn();
    render(ReservationDetailModal, { props: { ...props(), onCreateInvoice } });

    // Chambres assignment trigger (from RoomAssignmentDrawer) is present.
    expect(screen.getByTestId("rad-trigger")).toBeTruthy();

    // Facture panel is collapsed until its button is pressed.
    expect(screen.queryByTestId("panel-row-facture")).toBeNull();
    await fireEvent.click(screen.getByTestId("btn-facture"));
    expect(screen.getByTestId("panel-row-facture")).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const onClose = vi.fn();
    render(ReservationDetailModal, { props: { ...props(), onClose } });
    await fireEvent.click(screen.getByTestId("rdm-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── Stripe / invoice status fields (Stream 3) ──

  it("shows the invoice status badge with 'Ouverte' when invoice_status is open", () => {
    render(ReservationDetailModal, { props: props({ invoice_status: "open" }) });
    const badge = screen.getByTestId("rdm-invoice-badge");
    expect(badge.textContent?.trim()).toBe("Ouverte");
    expect(badge.className).toContain("rdm__invoice-badge--open");
  });

  it("shows the invoice status badge with 'Payée' when invoice_status is paid", () => {
    render(ReservationDetailModal, { props: props({ invoice_status: "paid" }) });
    const badge = screen.getByTestId("rdm-invoice-badge");
    expect(badge.textContent?.trim()).toBe("Payée");
    expect(badge.className).toContain("rdm__invoice-badge--paid");
  });

  it("shows the invoice status badge with 'Échec du paiement' when invoice_status is payment_failed", () => {
    render(ReservationDetailModal, { props: props({ invoice_status: "payment_failed" }) });
    const badge = screen.getByTestId("rdm-invoice-badge");
    expect(badge.textContent?.trim()).toBe("Échec du paiement");
    expect(badge.className).toContain("rdm__invoice-badge--payment_failed");
  });

  it("omits the invoice status section when invoice_status is null or absent", () => {
    render(ReservationDetailModal, { props: props({ invoice_status: null }) });
    expect(screen.queryByTestId("rdm-invoice-status")).toBeNull();
    expect(screen.queryByTestId("rdm-invoice-badge")).toBeNull();
  });

  it("shows the paid_at timestamp when present", () => {
    render(ReservationDetailModal, {
      props: props({ paid_at: "2026-08-15T14:30:00.000Z" }),
    });
    expect(screen.getByTestId("rdm-paid-at")).toBeTruthy();
    // The formatted date must contain at least the year
    expect(screen.getByTestId("rdm-paid-at").textContent).toContain("2026");
  });

  it("omits the paid_at row when paid_at is null", () => {
    render(ReservationDetailModal, { props: props({ paid_at: null }) });
    expect(screen.queryByTestId("rdm-paid-at")).toBeNull();
  });

  it("shows the stripe_invoice_id when present", () => {
    render(ReservationDetailModal, {
      props: props({ stripe_invoice_id: "in_test_abc123" }),
    });
    expect(screen.getByTestId("rdm-stripe-invoice-id").textContent).toContain(
      "in_test_abc123",
    );
  });

  it("omits the stripe_invoice_id row when absent", () => {
    render(ReservationDetailModal, {
      props: props({ stripe_invoice_id: null }),
    });
    expect(screen.queryByTestId("rdm-stripe-invoice-id")).toBeNull();
  });

  it("a confirmed + paid row shows both the confirmed status and paid invoice badge", () => {
    render(ReservationDetailModal, {
      props: props({ status: "confirmed", invoice_status: "paid", paid_at: "2026-08-15T14:30:00.000Z" }),
    });
    expect(screen.getByTestId("rdm-status").textContent?.trim()).toBe("Confirmé");
    expect(screen.getByTestId("rdm-invoice-badge").textContent?.trim()).toBe("Payée");
    expect(screen.getByTestId("rdm-paid-at")).toBeTruthy();
  });
});
