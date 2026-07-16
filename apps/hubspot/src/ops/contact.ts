import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

const trimmedOptional = z.string().trim().optional();

export const ContactUpsertSchema = z.object({
  email: z.string().trim().min(1),
  name: trimmedOptional,
  phone: trimmedOptional,
  firstname: trimmedOptional,
  lastname: trimmedOptional,
  company: trimmedOptional,
  contactId: trimmedOptional,
});

export type ContactUpsertPayload = z.infer<typeof ContactUpsertSchema>;

function getFirstname(payload: ContactUpsertPayload): string | undefined {
  if (payload.firstname) return payload.firstname;
  if (payload.name) return payload.name;
  return undefined;
}

function buildCreateProperties(payload: ContactUpsertPayload): Record<string, string> {
  const props: Record<string, string> = { email: payload.email };
  const fn = getFirstname(payload);
  if (fn) props.firstname = fn;
  if (payload.lastname) props.lastname = payload.lastname;
  if (payload.phone) props.phone = payload.phone;
  if (payload.company) props.company = payload.company;
  return props;
}

function buildUpdateProperties(payload: ContactUpsertPayload): Record<string, string> {
  const props: Record<string, string> = {};
  const fn = getFirstname(payload);
  if (fn) props.firstname = fn;
  if (payload.lastname) props.lastname = payload.lastname;
  if (payload.phone) props.phone = payload.phone;
  if (payload.company) props.company = payload.company;
  return props;
}

export async function resolveOrCreateContactByEmail(
  env: Env,
  email: string,
  extra?: { name?: string; phone?: string; firstname?: string; lastname?: string; company?: string }
): Promise<string> {
  let existingId: string | null = null;
  try {
    const searchResult = (await hubspotFetch(
      env,
      `/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
          ],
          limit: 1,
        }),
      }
    )) as any;
    if (searchResult?.results?.length > 0) {
      existingId = searchResult.results[0].id;
    }
  } catch {}

  if (existingId) {
    return existingId;
  }

  const properties: Record<string, string> = { email };
  const fn = extra?.firstname || extra?.name;
  if (fn) properties.firstname = fn;
  if (extra?.lastname) properties.lastname = extra.lastname;
  if (extra?.phone) properties.phone = extra.phone;
  if (extra?.company) properties.company = extra.company;

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
  let existingId: string | null = payload.contactId || null;

  if (!existingId) {
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
                    value: payload.email,
                  },
                ],
              },
            ],
            limit: 1,
          }),
        }
      )) as any;

      if (searchResult?.results?.length > 0) {
        existingId = searchResult.results[0].id;
      }
    } catch {}
  }

  if (existingId) {
    const updateProps = buildUpdateProperties(payload);
    if (Object.keys(updateProps).length > 0) {
      await hubspotFetch(env, `/crm/v3/objects/contacts/${existingId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: updateProps }),
      });
    }
    return { ok: true, hubspotId: existingId };
  }

  const createProps = buildCreateProperties(payload);
  const createResult = (await hubspotFetch(env, `/crm/v3/objects/contacts`, {
    method: "POST",
    body: JSON.stringify({ properties: createProps }),
  })) as any;

  return { ok: true, hubspotId: createResult.id };
}
