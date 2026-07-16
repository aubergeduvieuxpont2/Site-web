import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";

import ReservationTableRow, {
  formatDateOnly,
  displayNameOf,
  truncateMessage,
} from "../ReservationTableRow.svelte";
import type { InvoiceResult } from "../InvoiceCreator.svelte";
import type { ReservationRow } from "$lib/api";

afterEach(() => cleanup());

const breakdown = {
  nights: 2,
  roomCount: 2,
  effectiveNightly: 89,
  base: 356,
  accommodationTax: 12.46,
  tps: 18.42,
  tvq: 34.89,
  total: 421.77,
  amount: 126.53,
};

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
    message: "Bonjour",
    created_at: "2026-07-01",
    ...overrides,
  };
}

function props(rowOverrides: Partial<ReservationRow> = {}) {
  return {
    row: baseRow(rowOverrides),
    onCreateInvoice: vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    ),
  };
}

// ── Pure helpers ────────────────────────────────────────────────────────────
describe("formatDateOnly", () => {
  it("formats a valid YYYY-MM-DD as its exact calendar day (no UTC shift)", () => {
    // fr-CA renders ISO-like YYYY-MM-DD; the day must not drift.
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

describe("truncateMessage", () => {
  it("returns — for empty message", () => {
    expect(truncateMessage(null)).toBe("—");
    expect(truncateMessage("")).toBe("—");
  });

  it("truncates messages longer than 60 chars with an ellipsis", () => {
    const long = "a".repeat(80);
    const out = truncateMessage(long);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(61); // 60 chars + ellipsis
  });

  it("leaves short messages intact", () => {
    expect(truncateMessage("Bonjour")).toBe("Bonjour");
  });
});

// ── Rendering ────────────────────────────────────────────────────────────────
describe("ReservationTableRow — cells", () => {
  it("renders the split name, email, and phone", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("row-name").textContent?.trim()).toBe("Marie Tremblay");
    expect(getByTestId("row-email").textContent?.trim()).toBe(
      "marie@example.ca",
    );
    expect(getByTestId("row-phone").textContent?.trim()).toBe("418-555-0100");
  });

  it("renders — for a null phone", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ phone: null }),
    });
    expect(getByTestId("row-phone").textContent?.trim()).toBe("—");
  });

  it("renders people, arrive, depart, and room_count", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("row-people").textContent?.trim()).toBe("3");
    expect(getByTestId("row-arrive").textContent?.trim()).toBe("2026-08-01");
    expect(getByTestId("row-depart").textContent?.trim()).toBe("2026-08-03");
    expect(getByTestId("row-room-count").textContent?.trim()).toBe("2");
  });

  it("renders — for null dates and null room_count", () => {
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ arrive: null, depart: null, room_count: null }),
    });
    expect(getByTestId("row-arrive").textContent?.trim()).toBe("—");
    expect(getByTestId("row-depart").textContent?.trim()).toBe("—");
    expect(getByTestId("row-room-count").textContent?.trim()).toBe("—");
  });

  it("truncates a long message and exposes the full text via title", () => {
    const long = "x".repeat(100);
    const { getByTestId } = render(ReservationTableRow, {
      props: props({ message: long }),
    });
    const el = getByTestId("row-message");
    expect(el.textContent?.trim().endsWith("…")).toBe(true);
    expect(el.getAttribute("title")).toBe(long);
  });

  it("carries the reservation id on the row for locating", () => {
    const { getByTestId } = render(ReservationTableRow, { props: props() });
    expect(getByTestId("reservation-row").getAttribute("data-reservation-id")).toBe(
      "7",
    );
  });
});

describe("ReservationTableRow — invoice panel toggle", () => {
  it("opens the InvoiceCreator panel when Facture is clicked", async () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props(),
    });
    expect(queryByTestId("panel-row-facture")).toBeNull();

    const btn = getByTestId("btn-facture");
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    await fireEvent.click(btn);

    expect(queryByTestId("panel-row-facture")).not.toBeNull();
    expect(getByTestId("invoice-creator")).not.toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the panel again on a second click", async () => {
    const { getByTestId, queryByTestId } = render(ReservationTableRow, {
      props: props(),
    });
    const btn = getByTestId("btn-facture");
    await fireEvent.click(btn);
    expect(queryByTestId("panel-row-facture")).not.toBeNull();
    await fireEvent.click(btn);
    expect(queryByTestId("panel-row-facture")).toBeNull();
  });

  it("threads the reservation id into the onCreateInvoice callback", async () => {
    const onCreateInvoice = vi.fn(
      async (): Promise<InvoiceResult> => ({ ok: true, breakdown }),
    );
    const { getByTestId } = render(ReservationTableRow, {
      props: { row: baseRow(), onCreateInvoice },
    });
    await fireEvent.click(getByTestId("btn-facture"));
    await fireEvent.click(getByTestId("invoice-confirm"));

    expect(onCreateInvoice).toHaveBeenCalledWith(7, {
      type: "deposit",
      depositPercent: 30,
    });
  });
});
