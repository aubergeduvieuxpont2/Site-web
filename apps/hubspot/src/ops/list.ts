import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

export const ListAddSchema = z.object({
  listId: z.string().min(1),
  email: z.string().trim().min(1).email(),
});

export const ListRemoveSchema = z.object({
  listId: z.string().min(1),
  email: z.string().trim().min(1).email(),
});

export type ListMembershipPayload = z.infer<typeof ListAddSchema>;

export async function executeListAdd(
  env: Env,
  payload: ListMembershipPayload,
  _dedupeKey?: string
): Promise<{ ok: true }> {
  await hubspotFetch(
    env,
    `/crm/v3/lists/${encodeURIComponent(payload.listId)}/memberships/add`,
    {
      method: "POST",
      body: JSON.stringify({ emails: [payload.email] }),
    }
  );

  return { ok: true };
}

export async function executeListRemove(
  env: Env,
  payload: ListMembershipPayload,
  _dedupeKey?: string
): Promise<{ ok: true }> {
  await hubspotFetch(
    env,
    `/crm/v3/lists/${encodeURIComponent(payload.listId)}/memberships/remove`,
    {
      method: "POST",
      body: JSON.stringify({ emails: [payload.email] }),
    }
  );

  return { ok: true };
}
