import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import type { NormalizedError } from "../hubspotClient";

export const ContactGetSchema = z.object({
  email: z.string().trim().min(1).email(),
});

export type ContactGetPayload = z.infer<typeof ContactGetSchema>;

export async function executeContactGet(
  env: Env,
  payload: ContactGetPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId?: string; data?: unknown } | NormalizedError> {
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
    return { ok: false, status: 404, message: "Contact not found" };
  }

  const contact = searchResult.results[0];
  return { ok: true, hubspotId: contact.id, data: contact.properties ?? contact };
}
