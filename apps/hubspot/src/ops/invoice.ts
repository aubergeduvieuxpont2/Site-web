import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { resolveOrCreateContactByEmail } from "./contact";

export const InvoiceCreateSchema = z.object({
  contactEmail: z.string().trim().min(1),
  amount: z.number().min(0),
  description: z.string().trim().min(1),
  currency: z.string().default("CAD"),
});

export type InvoiceCreatePayload = z.infer<typeof InvoiceCreateSchema>;

async function ensureInvoiceContactAssociation(
  env: Env,
  invoiceId: string,
  contactId: string
): Promise<void> {
  const ASSOCIATION_TYPE_INVOICE_TO_CONTACT = 349;
  await hubspotFetch(
    env,
    `/crm/v4/objects/invoices/${invoiceId}/associations/contacts/${contactId}`,
    {
      method: "PUT",
      body: JSON.stringify([
        { associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOCIATION_TYPE_INVOICE_TO_CONTACT },
      ]),
    }
  );
}

export async function executeInvoiceCreate(
  env: Env,
  payload: InvoiceCreatePayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const contactId = await resolveOrCreateContactByEmail(env, payload.contactEmail);

  const properties: Record<string, unknown> = {
    hs_currency: payload.currency,
    amount: payload.amount,
    description: payload.description,
  };

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/invoices`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  })) as any;

  const invoiceId = createResult.id;

  await ensureInvoiceContactAssociation(env, invoiceId, contactId);

  return { ok: true, hubspotId: invoiceId };
}
