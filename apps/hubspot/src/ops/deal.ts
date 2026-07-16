import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { resolveOrCreateContactByEmail } from "./contact";

export const DealCreateSchema = z.object({
  contactEmail: z.string().trim().min(1),
  dealname: z.string().trim().min(1),
  amount: z.number().optional(),
  arrive: z.string().optional(),
  depart: z.string().optional(),
  room: z.string().optional(),
  people: z.number().optional(),
  description: z.string().optional(),
  pipeline: z.string().optional(),
  dealstage: z.string().optional(),
  roomCount: z.number().optional(),
});

export type DealCreatePayload = z.infer<typeof DealCreateSchema>;

async function searchDealByDedupeKey(
  env: Env,
  dedupeKey: string
): Promise<string | null> {
  try {
    const dedupeProperty = "dedupe_key";
    const searchResult = (await hubspotFetch(
      env,
      `/crm/v3/objects/deals/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: dedupeProperty,
                  operator: "EQ",
                  value: dedupeKey,
                },
              ],
            },
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

async function ensureDealContactAssociation(
  env: Env,
  dealId: string,
  contactId: string
): Promise<void> {
  // The v4 single-association PUT expects a bare array body; failures propagate
  // so the outbox retries until the association exists.
  const ASSOCIATION_TYPE_DEAL_TO_CONTACT = 3;
  await hubspotFetch(
    env,
    `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
    {
      method: "PUT",
      body: JSON.stringify([
        { associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOCIATION_TYPE_DEAL_TO_CONTACT },
      ]),
    }
  );
}

export async function executeDealCreate(
  env: Env,
  payload: DealCreatePayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const contactId = await resolveOrCreateContactByEmail(env, payload.contactEmail);

  if (dedupeKey) {
    const existingId = await searchDealByDedupeKey(env, dedupeKey);
    if (existingId) {
      // A retried op may have created the deal but not the association.
      await ensureDealContactAssociation(env, existingId, contactId);
      return { ok: true, hubspotId: existingId };
    }
  }

  const properties: Record<string, unknown> = {
    dealname: payload.dealname,
    pipeline: payload.pipeline || env.HUBSPOT_PIPELINE_ID || "",
    dealstage: payload.dealstage || env.HUBSPOT_DEALSTAGE_ID || "",
  };

  if (payload.amount !== undefined) properties.amount = payload.amount;
  if (payload.arrive) properties.arrive_date = payload.arrive;
  if (payload.depart) properties.depart_date = payload.depart;
  if (payload.room) properties.room_type = payload.room;
  if (payload.people !== undefined) properties.number_of_guests = payload.people;
  if (payload.roomCount !== undefined) properties.number_of_rooms = payload.roomCount;
  if (payload.description) properties.description = payload.description;
  if (dedupeKey) properties.dedupe_key = dedupeKey;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/deals`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  })) as any;

  const dealId = createResult.id;

  await ensureDealContactAssociation(env, dealId, contactId);

  return { ok: true, hubspotId: dealId };
}
