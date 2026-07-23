import { describe, it, expect, vi } from "vitest";
import { createAndFinalizeInvoice, findOrCreateCustomer } from "../src/stripe";

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
