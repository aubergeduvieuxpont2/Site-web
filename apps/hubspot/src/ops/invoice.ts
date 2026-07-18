import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { resolveOrCreateContactByEmail } from "./contact";
import { encodeIdSegment } from "./ids";

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
  // M13: ids are percent-encoded before interpolation into the path.
  await hubspotFetch(
    env,
    `/crm/v4/objects/invoices/${encodeIdSegment(invoiceId)}/associations/contacts/${encodeIdSegment(contactId)}`,
    {
      method: "PUT",
      body: JSON.stringify([
        { associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOCIATION_TYPE_INVOICE_TO_CONTACT },
      ]),
    }
  );
}

// Finding H5: search for an existing invoice by its dedupe key before creating
// one, mirroring deal.create. Without this every re-exec of the outbox row
// POSTed a brand-new invoice (financial duplicate).
async function searchInvoiceByDedupeKey(
  env: Env,
  dedupeKey: string
): Promise<string | null> {
  try {
    const searchResult = (await hubspotFetch(
      env,
      `/crm/v3/objects/invoices/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "dedupe_key", operator: "EQ", value: dedupeKey }] },
          ],
          limit: 1,
        }),
      }
    )) as any;
    if (searchResult?.results?.length > 0) {
      return searchResult.results[0].id;
    }
  } catch {
  }
  return null;
}

export async function executeInvoiceCreate(
  env: Env,
  payload: InvoiceCreatePayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const contactId = await resolveOrCreateContactByEmail(env, payload.contactEmail);

  if (dedupeKey) {
    const existingId = await searchInvoiceByDedupeKey(env, dedupeKey);
    if (existingId) {
      // A retried op may have created the invoice but not the association.
      await ensureInvoiceContactAssociation(env, existingId, contactId);
      return { ok: true, hubspotId: existingId };
    }
  }

  const properties: Record<string, unknown> = {
    hs_currency: payload.currency,
    amount: payload.amount,
    description: payload.description,
  };
  if (dedupeKey) properties.dedupe_key = dedupeKey;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/invoices`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  })) as any;

  const invoiceId = createResult.id;

  await ensureInvoiceContactAssociation(env, invoiceId, contactId);

  return { ok: true, hubspotId: invoiceId };
}
