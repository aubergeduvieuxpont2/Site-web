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
});

export type DealCreatePayload = z.infer<typeof DealCreateSchema>;

async function searchDealByDedupeKey(
  env: Env,
  dedupeKey: string
): Promise<string | null> {
  try {
    const dedupeProperty = "hs_dedup_reservation";
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

export async function executeDealCreate(
  env: Env,
  payload: DealCreatePayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  if (dedupeKey) {
    const existingId = await searchDealByDedupeKey(env, dedupeKey);
    if (existingId) {
      return { ok: true, hubspotId: existingId };
    }
  }

  const contactId = await resolveOrCreateContactByEmail(env, payload.contactEmail);

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
  if (payload.description) properties.description = payload.description;
  if (dedupeKey) properties.hs_dedup_reservation = dedupeKey;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/deals`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  })) as any;

  const dealId = createResult.id;

  try {
    const ASSOCIATION_TYPE_DEAL_TO_CONTACT = 3;
    await hubspotFetch(
      env,
      `/crm/v4/objects/deals/${dealId}/associations/contacts/${contactId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ASSOCIATION_TYPE_DEAL_TO_CONTACT }],
        }),
      }
    );
  } catch {
  }

  return { ok: true, hubspotId: dealId };
}
