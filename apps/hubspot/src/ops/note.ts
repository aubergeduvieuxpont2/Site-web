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

// HubSpot renders hs_note_body as rich text/HTML in the CRM UI. Note bodies can
// originate from unauthenticated OTA emails, so the body is treated as untrusted
// (finding M16): strip control characters, cap the length, and HTML-escape so
// no markup/script can be injected into the CRM note.
const NOTE_BODY_MAX = 20000;

function sanitizeNoteBody(raw: string): string {
  // Drop C0/C1 control chars except tab (\t), newline (\n), carriage return (\r).
  const stripped = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const capped = stripped.length > NOTE_BODY_MAX ? stripped.slice(0, NOTE_BODY_MAX) : stripped;
  return capped
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Finding H5: return an existing note when one already carries this dedupe key,
// so a re-executed outbox row does not create a duplicate CRM note.
async function searchNoteByDedupeKey(
  env: Env,
  dedupeKey: string
): Promise<string | null> {
  try {
    const searchResult = (await hubspotFetch(
      env,
      `/crm/v3/objects/notes/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "hs_note_dedup_key", operator: "EQ", value: dedupeKey }] },
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

export async function executeNoteCreate(
  env: Env,
  payload: NoteCreatePayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  if (dedupeKey) {
    const existingId = await searchNoteByDedupeKey(env, dedupeKey);
    if (existingId) {
      return { ok: true, hubspotId: existingId };
    }
  }

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
      const dedupeProperty = "dedupe_key";
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

  const properties: Record<string, unknown> = { hs_note_body: sanitizeNoteBody(payload.body) };
  if (dedupeKey) properties.hs_note_dedup_key = dedupeKey;

  const createResult = (await hubspotFetch(env, `/crm/v3/objects/notes`, {
    method: "POST",
    body: JSON.stringify({ properties, associations }),
  })) as any;

  return { ok: true, hubspotId: createResult.id };
}
