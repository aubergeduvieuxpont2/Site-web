import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

export const ContactGetByIdSchema = z.object({
  contactId: z.string().min(1),
});

export type ContactGetByIdPayload = z.infer<typeof ContactGetByIdSchema>;

export async function executeContactGetById(
  env: Env,
  payload: ContactGetByIdPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string; data: Record<string, unknown> }> {
  const result = (await hubspotFetch(
    env,
    `/crm/v3/objects/contacts/${payload.contactId}?properties=email,firstname,lastname,phone,company`,
    {
      method: "GET",
    }
  )) as any;

  if (!result || !result.id) {
    throw new Error(`Contact ${payload.contactId} not found`);
  }

  return {
    ok: true,
    hubspotId: result.id,
    data: result.properties || {},
  };
}
