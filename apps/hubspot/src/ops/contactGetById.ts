import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";
import { assertNumericId, encodeIdSegment } from "./ids";

export const ContactGetByIdSchema = z.object({
  // M13: object ids must be decimal strings; reject anything else at the input
  // boundary so a caller cannot tamper with the request path.
  contactId: z.string().regex(/^\d+$/),
});

export type ContactGetByIdPayload = z.infer<typeof ContactGetByIdSchema>;

export async function executeContactGetById(
  env: Env,
  payload: ContactGetByIdPayload,
  _dedupeKey?: string
): Promise<{ ok: true; hubspotId: string; data: Record<string, unknown> }> {
  // Re-validate on the execute path too (drain payloads are not re-parsed),
  // then encode as a single path segment.
  const contactId = encodeIdSegment(assertNumericId(payload.contactId, "contactId"));
  const result = (await hubspotFetch(
    env,
    `/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname,phone,company`,
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
