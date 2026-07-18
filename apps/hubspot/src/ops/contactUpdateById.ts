import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { assertNumericId, encodeIdSegment } from "./ids";

// M14: only these contact properties may be written through this op. A caller
// must not be able to set arbitrary HubSpot properties (e.g. lifecycle stage,
// owner, custom internal fields) via a free-form property map.
export const WRITABLE_CONTACT_KEYS = ["email", "firstname", "lastname", "phone"] as const;

export const ContactUpdateByIdSchema = z.object({
  // M13: object ids must be decimal strings.
  contactId: z.string().regex(/^\d+$/),
  // M14: allow-list writable keys. A strict object permits any subset of the
  // allowed keys and rejects any unknown property name.
  properties: z
    .object({
      email: z.string().optional(),
      firstname: z.string().optional(),
      lastname: z.string().optional(),
      phone: z.string().optional(),
    })
    .strict(),
});

export type ContactUpdateByIdPayload = z.infer<typeof ContactUpdateByIdSchema>;

export async function executeContactUpdateById(
  env: Env,
  payload: ContactUpdateByIdPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const contactId = encodeIdSegment(assertNumericId(payload.contactId, "contactId"));

  // Defense in depth for the drain path (payloads from the DB are not re-parsed
  // through the schema): strip any key that is not in the allow-list.
  const writable = new Set<string>(WRITABLE_CONTACT_KEYS);
  const properties: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.properties)) {
    if (writable.has(key)) properties[key] = value;
  }

  const result = (await hubspotFetch(
    env,
    `/crm/v3/objects/contacts/${contactId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ properties }),
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
