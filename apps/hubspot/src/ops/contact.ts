import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

export const ContactUpsertSchema = z.object({
  email: z.string().trim().min(1),
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export type ContactUpsertPayload = z.infer<typeof ContactUpsertSchema>;

export async function resolveOrCreateContactByEmail(
  env: Env,
  email: string,
  extra?: { name?: string; phone?: string }
): Promise<string> {
  try {
    const searchResult = (await hubspotFetch(
      env,
      `/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "EQ",
                  value: email,
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

  const properties: Record<string, string> = { email };
  if (extra?.name) properties.firstname = extra.name;
  if (extra?.phone) properties.phone = extra.phone;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/contacts`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  })) as any;

  return createResult.id;
}

export async function executeContactUpsert(
  env: Env,
  payload: ContactUpsertPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const contactId = await resolveOrCreateContactByEmail(env, payload.email, {
    name: payload.name,
    phone: payload.phone,
  });

  return { ok: true, hubspotId: contactId };
}
