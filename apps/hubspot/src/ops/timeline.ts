import { z } from "zod";
import type { Env } from "../env";
import { hubspotFetch } from "../hubspotClient";

export const TimelineEventSchema = z.object({
  email: z.string().trim().min(1).email(),
  templateId: z.string().optional(),
  tokens: z.record(z.string(), z.string().or(z.number())).optional(),
});

export type TimelineEventPayload = z.infer<typeof TimelineEventSchema>;

export async function executeTimelineEvent(
  env: Env,
  payload: TimelineEventPayload,
  dedupeKey?: string
): Promise<{ ok: true; hubspotId: string }> {
  const templateId = payload.templateId || env.HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID || "";

  const body: Record<string, unknown> = {
    email: payload.email,
    templateId,
  };

  if (payload.tokens) {
    body.tokens = payload.tokens;
  }

  if (dedupeKey) {
    body.id = dedupeKey;
  }

  const createResult = (await hubspotFetch(
    env,
    `/crm/v3/timeline/events`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  )) as any;

  return { ok: true, hubspotId: createResult.id };
}
