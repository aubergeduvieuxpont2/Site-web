import Stripe from "stripe";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export interface EmbeddedCheckoutSessionOptions {
  email: string;
  lineItems: { description: string; amountCad: number }[];
  returnUrl: string;
  metadata: Record<string, string | number>;
}

export async function createEmbeddedCheckoutSession(
  stripe: Stripe,
  options: EmbeddedCheckoutSessionOptions
): Promise<{ sessionId: string; clientSecret: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (stripe.checkout.sessions.create as any)({
    ui_mode: "embedded",
    mode: "payment",
    customer_email: options.email,
    line_items: options.lineItems.map((item) => ({
      price_data: {
        currency: "cad",
        product_data: {
          name: item.description,
        },
        unit_amount: Math.round(item.amountCad * 100),
      },
      quantity: 1,
    })),
    return_url: options.returnUrl,
    metadata: options.metadata,
  });

  const clientSecret = session.client_secret;
  if (!clientSecret) {
    throw new Error("Failed to create embedded checkout session: missing client_secret");
  }

  return {
    sessionId: session.id,
    clientSecret,
  };
}

export async function refundCheckoutSession(
  stripe: Stripe,
  sessionId: string
): Promise<Stripe.Refund> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    throw new Error("Checkout session has no payment intent");
  }

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
  });

  return refund;
}

export async function findOrCreateCustomer(
  stripe: Stripe,
  email: string
): Promise<string> {
  const list = await stripe.customers.list({ email, limit: 1 });
  if (list.data.length > 0) return list.data[0].id;
  const customer = await stripe.customers.create({ email });
  return customer.id;
}

export interface InvoiceLineItem {
  description: string;
  amountCad: number;
}

export async function createAndFinalizeInvoice(
  stripe: Stripe,
  opts: {
    customerId: string;
    // One Stripe line item per entry, so the hosted invoice/PDF shows the base
    // and each tax on its own row (rather than a single opaque total).
    lineItems: InvoiceLineItem[];
    // Optional Stripe invoice *rendering* template id (`inrtem_…`). When set,
    // the generated invoice uses that template's layout/branding. Must belong to
    // the same Stripe account AND mode (test/live) as the API key, so it is
    // supplied per-environment via config rather than hardcoded.
    templateId?: string;
  }
): Promise<{ invoiceId: string; hostedInvoiceUrl: string | null }> {
  // Create the invoice FIRST, then attach each line item to it by id. Creating
  // "pending" invoice items (no `invoice` param) and relying on invoices.create
  // to sweep them in does NOT work on current Stripe API versions — the invoice
  // comes out empty ($0, no lines). Attaching explicitly is deterministic.
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    collection_method: "send_invoice",
    days_until_due: 30,
    ...(opts.templateId ? { rendering: { template: opts.templateId } } : {}),
  });

  for (const line of opts.lineItems) {
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      invoice: invoice.id,
      amount: Math.round(line.amountCad * 100),
      currency: "cad",
      description: line.description,
    });
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

  return {
    invoiceId: finalized.id,
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
  };
}

export async function constructStripeEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  webhookSecret: string
): Promise<Stripe.Event> {
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  return stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    webhookSecret,
    undefined,
    cryptoProvider
  );
}
