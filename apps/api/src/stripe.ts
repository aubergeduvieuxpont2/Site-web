import Stripe from "stripe";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
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

export async function createAndFinalizeInvoice(
  stripe: Stripe,
  opts: {
    customerId: string;
    amountCad: number;
    description: string;
    // Optional Stripe invoice *rendering* template id (`inrtem_…`). When set,
    // the generated invoice uses that template's layout/branding. Must belong to
    // the same Stripe account AND mode (test/live) as the API key, so it is
    // supplied per-environment via config rather than hardcoded.
    templateId?: string;
  }
): Promise<{ invoiceId: string; hostedInvoiceUrl: string | null }> {
  // Create the invoice FIRST, then attach the line item to it by id. Creating a
  // "pending" invoice item (no `invoice` param) and relying on invoices.create
  // to sweep it in does NOT work on current Stripe API versions — the invoice
  // comes out empty ($0, no description). Attaching explicitly is deterministic.
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    collection_method: "send_invoice",
    days_until_due: 30,
    ...(opts.templateId ? { rendering: { template: opts.templateId } } : {}),
  });

  await stripe.invoiceItems.create({
    customer: opts.customerId,
    invoice: invoice.id,
    amount: Math.round(opts.amountCad * 100),
    currency: "cad",
    description: opts.description,
  });

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
