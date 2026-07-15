import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { resolveOrCreateContactByEmail } from "./contact";

export const NoteCreateSchema = z.object({
  body: z.string().min(1),
  contactEmail: z.string().trim().optional(),
  dealDedupeKey: z.string().optional(),
});

export type NoteCreatePayload = z.infer<typeof NoteCreateSchema>;

export async function executeNoteCreate(
  env: Env,
  payload: NoteCreatePayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const associations: Array<{ types: Array<{ associationCategory: string; associationTypeId: number }>; id: string }> = [];

  if (payload.contactEmail) {
    const contactId = await resolveOrCreateContactByEmail(env, payload.contactEmail);
    associations.push({
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }],
      id: contactId,
    });
  }

  if (payload.dealDedupeKey) {
    try {
      const dedupeProperty = "hs_dedup_reservation";
      const dealSearchResult = (await hubspotFetch(
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
                    value: payload.dealDedupeKey,
                  },
                ],
              },
            ],
            limit: 1,
          }),
        }
      )) as any;

      if (dealSearchResult?.results?.length > 0) {
        const dealId = dealSearchResult.results[0].id;
        associations.push({
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }],
          id: dealId,
        });
      }
    } catch {
    }
  }

  const properties: Record<string, unknown> = { hs_note_body: payload.body };
  if (dedupeKey) properties.hs_note_dedup_key = dedupeKey;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/notes`, {
    method: "POST",
    body: JSON.stringify({ properties, associations }),
  })) as any;

  return { ok: true, hubspotId: createResult.id };
}
