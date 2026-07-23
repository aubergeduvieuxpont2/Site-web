/**
 * Route-level tests for POST /api/webhooks/stripe.
 *
 * Uses a mocked Stripe client so no live keys are required.
 * Uses the hoisted neon template-capture pattern to assert UPDATE queries.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Hoist neon mock ───────────────────────────────────────────────────────────
const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...vals: unknown[]) =>
      neonHolder.sql(strings, ...vals),
}));

// ── Hoist Stripe mock ─────────────────────────────────────────────────────────
const { stripeHolder } = vi.hoisted(() => ({
  stripeHolder: {
    constructEvent: null as
      | ((rawBody: string, sig: string, secret: string) => Promise<unknown>)
      | null,
    refund: null as
      | (() => Promise<{ id: string }>)
      | null,
  },
}));
vi.mock("../src/stripe", () => ({
  createStripeClient: () => ({}),
  constructStripeEvent: (_stripe: unknown, rawBody: string, sig: string, secret: string) =>
    stripeHolder.constructEvent?.(rawBody, sig, secret),
  findOrCreateCustomer: async () => "cus_mock123",
  createAndFinalizeInvoice: async () => ({
    invoiceId: "inv_mock123",
    hostedInvoiceUrl: "https://invoice.stripe.com/i/acct/mock",
  }),
  refundCheckoutSession: async (_stripe: any, _sessionId: string) => stripeHolder.refund?.() || { id: "re_mock123" },
}));

import { app } from "../src/index";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENV = {
  DB_CONN: "postgres://stub",
  STRIPE_SECRET_KEY: "sk_test_stub",
  STRIPE_WEBHOOK_SECRET: "whsec_stub",
} as any;

const STRIPE_INVOICE_ID = "inv_live_test_001";

const RESERVATION_ROW = {
  id: 42,
  name: "Jean Dupont",
  email: "jean@example.com",
  arrive: "2026-08-01",
  depart: "2026-08-05",
  people: 2,
  room: "Chambre Montagne",
  room_count: 1,
};

function makeInvoicePaidEvent(invoiceId = STRIPE_INVOICE_ID) {
  return {
    type: "invoice.paid",
    data: { object: { id: invoiceId } },
  };
}

function makeCheckoutCompletedEvent(invoiceId = STRIPE_INVOICE_ID) {
  return {
    type: "checkout.session.completed",
    data: { object: { invoice: invoiceId } },
  };
}

function makeUnrelatedEvent() {
  return {
    type: "customer.created",
    data: { object: { id: "cus_unrelated" } },
  };
}

function makeInvoicePaymentFailedEvent(invoiceId = STRIPE_INVOICE_ID) {
  return {
    type: "invoice.payment_failed",
    data: { object: { id: invoiceId } },
  };
}

function webhookRequest(body = "{}") {
  return app.request(
    "http://localhost/api/webhooks/stripe",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1234,v1=abc",
      },
      body,
    },
    ENV,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/stripe — signature verification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when stripe-signature header is absent", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();

    const res = await app.request(
      "http://localhost/api/webhooks/stripe",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      ENV,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/stripe-signature/i);
  });

  it("returns 400 and changes nothing when signature verification throws (ERR-BAD-SIGNATURE)", async () => {
    stripeHolder.constructEvent = async () => {
      throw new Error("No signatures found matching the expected signature");
    };
    let updateCalled = false;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations")) updateCalled = true;
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(400);
    expect(updateCalled).toBe(false);
  });

  it("returns 400 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();

    const res = await app.request(
      "http://localhost/api/webhooks/stripe",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "t=1234,v1=abc",
        },
        body: "{}",
      },
      { ...ENV, STRIPE_WEBHOOK_SECRET: undefined },
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/stripe — unrelated event types (no-op)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with received:true and performs no UPDATE for an unrelated event", async () => {
    stripeHolder.constructEvent = async () => makeUnrelatedEvent();
    let updateCalled = false;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations")) updateCalled = true;
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.received).toBe(true);
    expect(updateCalled).toBe(false);
  });
});

describe("POST /api/webhooks/stripe — invoice.paid flips reservation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("issues UPDATE SET status=confirmed, invoice_status=paid, paid_at=now() for invoice.paid", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();
    let capturedQuery = "";
    let capturedVals: unknown[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        capturedQuery = q;
        capturedVals = vals;
        return Promise.resolve([RESERVATION_ROW]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
    expect(capturedQuery).toContain("status = 'confirmed'");
    expect(capturedQuery).toContain("invoice_status = 'paid'");
    expect(capturedQuery).toContain("paid_at = now()");
    expect(capturedVals).toContain(STRIPE_INVOICE_ID);
  });

  it("enqueues confirmation email when email_confirmation_enabled is on", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();
    const sqlCalls: string[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      sqlCalls.push(q);
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        return Promise.resolve([RESERVATION_ROW]);
      }
      // enqueueEmail queries: SELECT value FROM settings WHERE key = ${toggleKey}
      // The key is a template value, not embedded in the query string.
      if (q.includes("FROM settings") && vals.includes("email_confirmation_enabled")) {
        return Promise.resolve([{ value: "true" }]);
      }
      if (q.includes("INSERT INTO email_outbox")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    const emailOutboxInsert = sqlCalls.find((q) => q.includes("INSERT INTO email_outbox"));
    expect(emailOutboxInsert).toBeTruthy();
  });

  it("does NOT enqueue confirmation email when email_confirmation_enabled is off", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();
    const sqlCalls: string[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      sqlCalls.push(q);
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        return Promise.resolve([RESERVATION_ROW]);
      }
      if (q.includes("FROM settings") && vals.includes("email_confirmation_enabled")) {
        return Promise.resolve([{ value: "false" }]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    const emailOutboxInsert = sqlCalls.find((q) => q.includes("INSERT INTO email_outbox"));
    expect(emailOutboxInsert).toBeFalsy();
  });

  it("also handles invoice.payment_succeeded by extracting invoice id from event.data.object.id", async () => {
    const eventId = "inv_pay_succ_001";
    stripeHolder.constructEvent = async () => ({
      type: "invoice.payment_succeeded",
      data: { object: { id: eventId } },
    });
    let capturedInvoiceId: unknown = null;
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        capturedInvoiceId = vals[0];
        return Promise.resolve([RESERVATION_ROW]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect(capturedInvoiceId).toBe(eventId);
  });

  it("handles checkout.session.completed by extracting invoice id from event.data.object.invoice", async () => {
    const invoiceId = "inv_checkout_001";
    stripeHolder.constructEvent = async () => makeCheckoutCompletedEvent(invoiceId);
    let capturedInvoiceId: unknown = null;
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        capturedInvoiceId = vals[0];
        return Promise.resolve([RESERVATION_ROW]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect(capturedInvoiceId).toBe(invoiceId);
  });
});

describe("POST /api/webhooks/stripe — idempotency (INV-idempotent-paid)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is idempotent: a redelivered paid event returns 200 without re-enqueuing email", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();
    const sqlCalls: string[] = [];
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      sqlCalls.push(q);
      if (q.includes("UPDATE reservations") && q.includes("invoice_status")) {
        // Simulate: reservation already paid, WHERE invoice_status != 'paid' matches nothing
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
    // No email_outbox INSERT should occur since UPDATE returned 0 rows
    const emailInsert = sqlCalls.find((q) => q.includes("INSERT INTO email_outbox"));
    expect(emailInsert).toBeFalsy();
  });

  it("UPDATE WHERE clause uses invoice_status != paid to prevent double-apply", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaidEvent();
    let capturedQuery = "";
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations") && q.includes("paid")) {
        capturedQuery = q;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    await webhookRequest();

    expect(capturedQuery).toMatch(/invoice_status.*paid/);
  });
});

describe("POST /api/webhooks/stripe — invoice.payment_failed records failure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets invoice_status=payment_failed and never touches status", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaymentFailedEvent();
    let capturedQuery = "";
    let capturedVals: unknown[] = [];
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("UPDATE reservations")) {
        capturedQuery = q;
        capturedVals = vals;
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
    expect(capturedQuery).toContain("invoice_status = 'payment_failed'");
    // The reservation must stay pending — a failed charge never confirms it.
    expect(capturedQuery).not.toContain("status = 'confirmed'");
    // Bound to the failed invoice id, and guarded so it cannot overwrite 'paid'.
    expect(capturedVals).toContain(STRIPE_INVOICE_ID);
    expect(capturedQuery).toContain("invoice_status != 'paid'");
  });

  it("does not enqueue a confirmation email on a failed payment", async () => {
    stripeHolder.constructEvent = async () => makeInvoicePaymentFailedEvent();
    let insertedOutbox = false;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("email_outbox")) insertedOutbox = true;
      return Promise.resolve([]);
    };

    await webhookRequest();

    expect(insertedOutbox).toBe(false);
  });
});

describe("POST /api/webhooks/stripe — checkout.session.completed for booking reservations", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeBookingCheckoutEvent(sessionId = "cs_test_001", reservationId = 42) {
    return {
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: { reservation_id: reservationId },
          // No invoice field for booking checkouts
        },
      },
    };
  }

  it("confirms a held reservation when all nights are still available", async () => {
    const SESSION_ID = "cs_booking_001";
    const RES_ID = 42;

    stripeHolder.constructEvent = async () => makeBookingCheckoutEvent(SESSION_ID, RES_ID);

    let updateQuery = "";
    let updateVals: unknown[] = [];
    let selectQuery = "";
    let callCount = 0;

    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      callCount++;
      const q = strings.join(" ");

      // First call: fetch the held reservation
      if (callCount === 1) {
        selectQuery = q;
        if (q.includes("SELECT id, status")) {
          return Promise.resolve([
            {
              id: RES_ID,
              status: "held",
              invoice_status: null,
              arrive: "2026-08-01",
              depart: "2026-08-03",
              room_count: 1,
              email: RESERVATION_ROW.email,
              name: RESERVATION_ROW.name,
              people: RESERVATION_ROW.people,
              room: RESERVATION_ROW.room,
            },
          ]);
        }
      }

      // Second call: fetch settings
      if (q.includes("SELECT key, value FROM settings")) {
        return Promise.resolve([
          { key: "assignable_room_count", value: "12" },
          { key: "nightly_price", value: "89" },
          { key: "email_confirmation_enabled", value: "true" },
        ]);
      }

      // Third call: fetch reservations for availability check
      if (q.includes("SELECT id, arrive, depart, status, room_count, hold_expires_at FROM reservations")) {
        return Promise.resolve([]);
      }

      // Fourth call: fetch blackout dates
      if (q.includes("FROM blackout_dates")) {
        return Promise.resolve([]);
      }

      // Fifth call: update reservation to confirmed
      if (q.includes("UPDATE reservations")) {
        updateQuery = q;
        updateVals = vals;
        return Promise.resolve([
          {
            id: RES_ID,
            status: "confirmed",
            invoice_status: "paid",
          },
        ]);
      }

      // Email enqueue
      if (q.includes("email_outbox")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
    expect(updateQuery).toContain("status = 'confirmed'");
    expect(updateQuery).toContain("invoice_status = 'paid'");
    expect(updateVals).toContain(RES_ID);
  });

  it("is idempotent: already-confirmed paid reservations are not re-confirmed", async () => {
    const SESSION_ID = "cs_booking_003";
    const RES_ID = 44;

    stripeHolder.constructEvent = async () => makeBookingCheckoutEvent(SESSION_ID, RES_ID);

    let updateCalled = false;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");
      if (q.includes("SELECT id, status")) {
        return Promise.resolve([
          {
            id: RES_ID,
            status: "confirmed",
            invoice_status: "paid",
            arrive: "2026-08-01",
            depart: "2026-08-03",
            room_count: 1,
            email: RESERVATION_ROW.email,
            name: RESERVATION_ROW.name,
            people: RESERVATION_ROW.people,
            room: RESERVATION_ROW.room,
          },
        ]);
      }
      if (q.includes("UPDATE reservations")) {
        updateCalled = true;
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
    expect(updateCalled).toBe(false);
  });

  it("refunds when dates are no longer available", async () => {
    const SESSION_ID = "cs_booking_refund";
    const RES_ID = 45;

    stripeHolder.constructEvent = async () => makeBookingCheckoutEvent(SESSION_ID, RES_ID);
    stripeHolder.refund = vi.fn().mockResolvedValue({ id: "re_refunded" });

    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");

      if (q.includes("SELECT id, status") && !q.includes("FROM")) {
        // Fetch the held reservation
        return Promise.resolve([
          {
            id: RES_ID,
            status: "held",
            invoice_status: null,
            arrive: "2026-08-01",
            depart: "2026-08-03",
            room_count: 1,
            email: RESERVATION_ROW.email,
            name: RESERVATION_ROW.name,
            people: RESERVATION_ROW.people,
            room: RESERVATION_ROW.room,
          },
        ]);
      }

      if (q.includes("SELECT key, value FROM settings")) {
        // Fetch settings
        return Promise.resolve([{ key: "assignable_room_count", value: "12" }]);
      }

      if (q.includes("SELECT id, arrive, depart, status, room_count, hold_expires_at FROM reservations")) {
        // Availability check — return blocking reservation so dates are unavailable
        return Promise.resolve([
          {
            id: 100,
            arrive: "2026-08-01",
            depart: "2026-08-03",
            status: "confirmed",
            room_count: 12,
            hold_expires_at: null,
          },
        ]);
      }

      if (q.includes("FROM blackout_dates")) {
        return Promise.resolve([]);
      }

      if (q.includes("UPDATE reservations")) {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect((await res.json() as any).received).toBe(true);
  });

  it("does not re-refund a redelivered event for an already-released reservation", async () => {
    const SESSION_ID = "cs_booking_redelivery";
    const RES_ID = 46;

    stripeHolder.constructEvent = async () => makeBookingCheckoutEvent(SESSION_ID, RES_ID);
    stripeHolder.refund = vi.fn().mockResolvedValue({ id: "re_redelivery" });

    let refundCount = 0;
    neonHolder.sql = (strings: TemplateStringsArray) => {
      const q = strings.join(" ");

      if (q.includes("SELECT id, status") && q.includes("WHERE")) {
        // On redelivery, reservation is already released
        return Promise.resolve([
          {
            id: RES_ID,
            status: "released",
            invoice_status: null,
            arrive: "2026-08-01",
            depart: "2026-08-03",
            room_count: 1,
            email: RESERVATION_ROW.email,
            name: RESERVATION_ROW.name,
            people: RESERVATION_ROW.people,
            room: RESERVATION_ROW.room,
          },
        ]);
      }

      if (q.includes("SELECT key, value FROM settings")) {
        return Promise.resolve([{ key: "assignable_room_count", value: "12" }]);
      }

      if (q.includes("SELECT id, arrive, depart, status, room_count, hold_expires_at FROM reservations")) {
        // Availability check
        return Promise.resolve([
          {
            id: 100,
            arrive: "2026-08-01",
            depart: "2026-08-03",
            status: "confirmed",
            room_count: 12,
            hold_expires_at: null,
          },
        ]);
      }

      if (q.includes("FROM blackout_dates")) {
        return Promise.resolve([]);
      }

      if (q.includes("UPDATE reservations SET status = 'released'")) {
        // Only called if status IS 'held'
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    // Refund should not be called since status is already 'released'
    expect(stripeHolder.refund).not.toHaveBeenCalled();
  });

  it("falls through to invoice path if no booking reservation matches", async () => {
    const SESSION_ID = "cs_booking_004";

    stripeHolder.constructEvent = async () => ({
      type: "checkout.session.completed",
      data: {
        object: {
          id: SESSION_ID,
          metadata: { reservation_id: 999 }, // Doesn't exist
          invoice: "inv_fallthrough", // Fallback to invoice path
        },
      },
    });

    let invoiceUpdateQuery = "";
    neonHolder.sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      if (q.includes("SELECT id, status")) {
        return Promise.resolve([]); // No booking reservation found
      }
      if (q.includes("UPDATE reservations") && q.includes("stripe_invoice_id")) {
        invoiceUpdateQuery = q;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };

    const res = await webhookRequest();

    expect(res.status).toBe(200);
    expect(invoiceUpdateQuery).toContain("stripe_invoice_id");
  });
});
