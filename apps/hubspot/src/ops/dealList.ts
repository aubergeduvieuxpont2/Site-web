import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import type { NormalizedError } from "../hubspotClient";

export const DealListByContactSchema = z.object({
  email: z.string().trim().min(1).email(),
});

export type DealListByContactPayload = z.infer<typeof DealListByContactSchema>;

export async function executeDealListByContact(
  env: Env,
  payload: DealListByContactPayload,
  _dedupeKey?: string
): Promise<{ ok: true; data?: unknown } | NormalizedError> {
  const searchResult = (await hubspotFetch(env, `/crm/v3/objects/contacts/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: payload.email }],
        },
      ],
      limit: 1,
    }),
  })) as any;

  if (!searchResult?.results?.length) {
    return { ok: true, data: [] };
  }

  const contactId = searchResult.results[0].id;

  const assocResult = (await hubspotFetch(
    env,
    `/crm/v4/objects/contacts/${contactId}/associations/deals`,
  )) as any;

  const dealRefs: Array<{ toObjectId: string }> = assocResult?.results ?? [];

  if (!dealRefs.length) {
    return { ok: true, data: [] };
  }

  const batchResult = (await hubspotFetch(env, `/crm/v3/objects/deals/batch/read`, {
    method: "POST",
    body: JSON.stringify({
      inputs: dealRefs.map((r) => ({ id: r.toObjectId })),
      properties: ["dealname", "amount", "dealstage", "closedate"],
    }),
  })) as any;

  return { ok: true, data: batchResult?.results ?? [] };
}
