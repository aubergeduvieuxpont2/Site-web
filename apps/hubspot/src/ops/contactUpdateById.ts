import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

export const ContactUpdateByIdSchema = z.object({
  contactId: z.string().min(1),
  properties: z.record(z.string()),
});

export type ContactUpdateByIdPayload = z.infer<typeof ContactUpdateByIdSchema>;

export async function executeContactUpdateById(
  env: Env,
  payload: ContactUpdateByIdPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const result = (await hubspotFetch(
    env,
    `/crm/v3/objects/contacts/${payload.contactId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties: payload.properties }),
    }
  )) as any;

  if (!result || !result.id) {
    throw new Error(`Failed to update contact ${payload.contactId}`);
  }

  return {
    ok: true,
    hubspotId: result.id,
  };
}
