import { describe, it, expect, vi } from "vitest";
import {
  createAndFinalizeInvoice,
  findOrCreateCustomer,
  createEmbeddedCheckoutSession,
  refundCheckoutSession,
} from "../src/stripe";

// Minimal Stripe stub capturing the calls createAndFinalizeInvoice makes, so we
// can assert the invoice item is ATTACHED to the created invoice (by id) — the
// regression that produced an empty $0 invoice with no description.
function makeStripeStub() {
  const calls: { invoiceItemsCreate: any[]; invoicesCreate: any[]; finalize: any[] } = {
    invoiceItemsCreate: [],
    invoicesCreate: [],
    finalize: [],
  };
  const stripe = {
    invoices: {
      create: vi.fn(async (args: any) => {
        calls.invoicesCreate.push(args);
        return { id: "in_test_123" };
      }),
      finalizeInvoice: vi.fn(async (id: string) => {
        calls.finalize.push(id);
        return { id, hosted_invoice_url: "https://invoice.stripe.com/i/test" };
      }),
    },
    invoiceItems: {
      create: vi.fn(async (args: any) => {
        calls.invoiceItemsCreate.push(args);
        return { id: "ii_test_123" };
      }),
    },
    customers: {
      list: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async () => ({ id: "cus_test_123" })),
    },
  };
  return { stripe: stripe as any, calls };
}

describe("createAndFinalizeInvoice", () => {
  it("attaches the line item to the created invoice by id (not a pending item)", async () => {
    const { stripe, calls } = makeStripeStub();

    const result = await createAndFinalizeInvoice(stripe, {
      customerId: "cus_test_123",
      lineItems: [{ description: "Facture - Réservation #8", amountCad: 106.38 }],
    });

    // Invoice created before the item, and the item carries the invoice id.
    expect(calls.invoicesCreate.length).toBe(1);
    expect(calls.invoiceItemsCreate.length).toBe(1);
    const item = calls.invoiceItemsCreate[0];
    expect(item.invoice).toBe("in_test_123");
    // Amount in cents, currency CAD, description preserved.
    expect(item.amount).toBe(10638);
    expect(item.currency).toBe("cad");
    expect(item.description).toBe("Facture - Réservation #8");
    // Finalized the same invoice; returns id + hosted url.
    expect(calls.finalize).toContain("in_test_123");
    expect(result.invoiceId).toBe("in_test_123");
    expect(result.hostedInvoiceUrl).toBe("https://invoice.stripe.com/i/test");
  });

  it("creates one Stripe line item per entry, each attached to the invoice", async () => {
    const { stripe, calls } = makeStripeStub();
    await createAndFinalizeInvoice(stripe, {
      customerId: "cus_x",
      lineItems: [
        { description: "Hébergement — 5 nuits", amountCad: 500 },
        { description: "Taxe d'hébergement (3.5 %)", amountCad: 17.5 },
        { description: "TPS (5 %)", amountCad: 25.88 },
        { description: "TVQ (9.975 %)", amountCad: 54.29 },
      ],
    });
    expect(calls.invoiceItemsCreate.length).toBe(4);
    // Every line attaches to the created invoice, in cents.
    expect(calls.invoiceItemsCreate.every((i: any) => i.invoice === "in_test_123")).toBe(true);
    expect(calls.invoiceItemsCreate.map((i: any) => i.amount)).toEqual([50000, 1750, 2588, 5429]);
    expect(calls.invoiceItemsCreate[2].description).toBe("TPS (5 %)");
  });

  it("rounds each line's CAD amount to whole cents", async () => {
    const { stripe, calls } = makeStripeStub();
    await createAndFinalizeInvoice(stripe, {
      customerId: "cus_x",
      lineItems: [{ description: "x", amountCad: 89.005 }],
    });
    expect(calls.invoiceItemsCreate[0].amount).toBe(8901);
  });

  it("applies the rendering template when a templateId is supplied", async () => {
    const { stripe, calls } = makeStripeStub();
    await createAndFinalizeInvoice(stripe, {
      customerId: "cus_x",
      lineItems: [{ description: "x", amountCad: 100 }],
      templateId: "inrtem_test_abc",
    });
    expect(calls.invoicesCreate[0].rendering).toEqual({ template: "inrtem_test_abc" });
  });

  it("omits rendering when no templateId is supplied", async () => {
    const { stripe, calls } = makeStripeStub();
    await createAndFinalizeInvoice(stripe, {
      customerId: "cus_x",
      lineItems: [{ description: "x", amountCad: 100 }],
    });
    expect(calls.invoicesCreate[0].rendering).toBeUndefined();
  });
});

describe("findOrCreateCustomer", () => {
  it("reuses an existing customer matched by email", async () => {
    const { stripe } = makeStripeStub();
    stripe.customers.list = vi.fn(async () => ({ data: [{ id: "cus_existing" }] }));
    const id = await findOrCreateCustomer(stripe, "guest@example.com");
    expect(id).toBe("cus_existing");
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it("creates a customer when none exists", async () => {
    const { stripe } = makeStripeStub();
    const id = await findOrCreateCustomer(stripe, "new@example.com");
    expect(id).toBe("cus_test_123");
    expect(stripe.customers.create).toHaveBeenCalledWith({ email: "new@example.com" });
  });
});

describe("createEmbeddedCheckoutSession", () => {
  it("creates a session with ui_mode embedded and mode payment", async () => {
    const createSpy = vi.fn(async () => ({
      id: "cs_test_001",
      client_secret: "cs_test_001_secret",
    }));
    const stripe = {
      checkout: { sessions: { create: createSpy } },
    } as any;

    const result = await createEmbeddedCheckoutSession(stripe, {
      email: "guest@example.com",
      lineItems: [{ description: "Hébergement", amountCad: 500 }],
      returnUrl: "https://example.com/confirmation",
      metadata: { reservation_id: 42 },
    });

    expect(createSpy).toHaveBeenCalled();
    const args = createSpy.mock.calls[0][0];
    expect(args.ui_mode).toBe("embedded");
    expect(args.mode).toBe("payment");
    expect(args.customer_email).toBe("guest@example.com");
    expect(args.return_url).toBe("https://example.com/confirmation");
    expect(args.metadata.reservation_id).toBe(42);
    expect(result.sessionId).toBe("cs_test_001");
    expect(result.clientSecret).toBe("cs_test_001_secret");
  });

  it("converts line item amounts to integer cents in CAD", async () => {
    const createSpy = vi.fn(async () => ({
      id: "cs_test_002",
      client_secret: "cs_test_002_secret",
    }));
    const stripe = { checkout: { sessions: { create: createSpy } } } as any;

    await createEmbeddedCheckoutSession(stripe, {
      email: "guest@example.com",
      lineItems: [
        { description: "Hébergement", amountCad: 500 },
        { description: "Taxe d'hébergement", amountCad: 17.5 },
        { description: "TPS", amountCad: 25.88 },
      ],
      returnUrl: "https://example.com/confirmation",
      metadata: {},
    });

    const args = createSpy.mock.calls[0][0];
    const amounts = args.line_items.map((item: any) => item.price_data.unit_amount);
    expect(amounts).toEqual([50000, 1750, 2588]);
  });

  it("sets one line item per input item with quantity 1", async () => {
    const createSpy = vi.fn(async () => ({
      id: "cs_test_003",
      client_secret: "cs_test_003_secret",
    }));
    const stripe = { checkout: { sessions: { create: createSpy } } } as any;

    await createEmbeddedCheckoutSession(stripe, {
      email: "guest@example.com",
      lineItems: [
        { description: "Hébergement", amountCad: 500 },
        { description: "Taxe d'hébergement", amountCad: 17.5 },
      ],
      returnUrl: "https://example.com/confirmation",
      metadata: {},
    });

    const args = createSpy.mock.calls[0][0];
    expect(args.line_items.length).toBe(2);
    expect(args.line_items.every((item: any) => item.quantity === 1)).toBe(true);
  });

  it("throws when client_secret is missing from the session", async () => {
    const createSpy = vi.fn(async () => ({
      id: "cs_test_004",
      // No client_secret
    }));
    const stripe = { checkout: { sessions: { create: createSpy } } } as any;

    await expect(
      createEmbeddedCheckoutSession(stripe, {
        email: "guest@example.com",
        lineItems: [{ description: "Hébergement", amountCad: 500 }],
        returnUrl: "https://example.com/confirmation",
        metadata: {},
      })
    ).rejects.toThrow(/client_secret/);
  });
});

describe("refundCheckoutSession", () => {
  it("retrieves the session and issues a full refund against its payment intent", async () => {
    const retrieveSpy = vi.fn(async () => ({
      id: "cs_test_001",
      payment_intent: "pi_test_001",
    }));
    const refundSpy = vi.fn(async () => ({ id: "re_test_001" }));
    const stripe = {
      checkout: { sessions: { retrieve: retrieveSpy } },
      refunds: { create: refundSpy },
    } as any;

    const result = await refundCheckoutSession(stripe, "cs_test_001");

    expect(retrieveSpy).toHaveBeenCalledWith("cs_test_001");
    expect(refundSpy).toHaveBeenCalledWith({ payment_intent: "pi_test_001" });
    expect(result.id).toBe("re_test_001");
  });

  it("handles payment_intent as an expanded object", async () => {
    const retrieveSpy = vi.fn(async () => ({
      id: "cs_test_002",
      payment_intent: { id: "pi_test_002", object: "payment_intent" },
    }));
    const refundSpy = vi.fn(async () => ({ id: "re_test_002" }));
    const stripe = {
      checkout: { sessions: { retrieve: retrieveSpy } },
      refunds: { create: refundSpy },
    } as any;

    await refundCheckoutSession(stripe, "cs_test_002");

    expect(refundSpy).toHaveBeenCalledWith({ payment_intent: "pi_test_002" });
  });

  it("throws when payment_intent is missing", async () => {
    const retrieveSpy = vi.fn(async () => ({
      id: "cs_test_003",
      // No payment_intent
    }));
    const stripe = {
      checkout: { sessions: { retrieve: retrieveSpy } },
      refunds: { create: vi.fn() },
    } as any;

    await expect(refundCheckoutSession(stripe, "cs_test_003")).rejects.toThrow(/payment intent/i);
  });
});
