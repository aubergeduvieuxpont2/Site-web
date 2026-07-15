import { z } from "zod";
import type { Env } from "../env";
import { ContactUpsertSchema, executeContactUpsert } from "./contact";
import { DealCreateSchema, executeDealCreate } from "./deal";
import { NoteCreateSchema, executeNoteCreate } from "./note";
import { ListAddSchema, ListRemoveSchema, executeListAdd, executeListRemove } from "./list";
import { TimelineEventSchema, executeTimelineEvent } from "./timeline";
import type { NormalizedError } from "../hubspotClient";

export type OpEnvelope = {
  kind: "contact.upsert" | "deal.create" | "note.create" | "list.add" | "list.remove" | "timeline.event";
  payload: unknown;
  dedupeKey?: string;
};

export type ParseResult =
  | { success: true; envelope: OpEnvelope }
  | { success: false; error: NormalizedError };

export const EnvelopeSchema = z.object({
  kind: z.enum(["contact.upsert", "deal.create", "note.create", "list.add", "list.remove", "timeline.event"]),
  payload: z.unknown(),
  dedupeKey: z.string().optional(),
});

type OpHandler = {
  payloadSchema: z.ZodType<unknown>;
  execute: (env: Env, payload: unknown, dedupeKey?: string) => Promise<{ ok: true; hubspotId?: string } | NormalizedError>;
};

const registry: Record<string, OpHandler> = {
  "contact.upsert": {
    payloadSchema: ContactUpsertSchema,
    execute: (env, payload, dedupeKey) => executeContactUpsert(env, payload as any, dedupeKey),
  },
  "deal.create": {
    payloadSchema: DealCreateSchema,
    execute: (env, payload, dedupeKey) => executeDealCreate(env, payload as any, dedupeKey),
  },
  "note.create": {
    payloadSchema: NoteCreateSchema,
    execute: (env, payload, dedupeKey) => executeNoteCreate(env, payload as any, dedupeKey),
  },
  "list.add": {
    payloadSchema: ListAddSchema,
    execute: (env, payload, dedupeKey) => executeListAdd(env, payload as any, dedupeKey),
  },
  "list.remove": {
    payloadSchema: ListRemoveSchema,
    execute: (env, payload, dedupeKey) => executeListRemove(env, payload as any, dedupeKey),
  },
  "timeline.event": {
    payloadSchema: TimelineEventSchema,
    execute: (env, payload, dedupeKey) => executeTimelineEvent(env, payload as any, dedupeKey),
  },
};

export function parseEnvelope(body: unknown): ParseResult {
  try {
    const parsed = EnvelopeSchema.parse(body);
    const handler = registry[parsed.kind];
    if (!handler) {
      return {
        success: false,
        error: { ok: false, status: 400, message: `Unknown operation kind: ${parsed.kind}` },
      };
    }

    const payloadResult = handler.payloadSchema.safeParse(parsed.payload);
    if (!payloadResult.success) {
      return {
        success: false,
        error: {
          ok: false,
          status: 400,
          message: `Invalid payload for ${parsed.kind}: ${payloadResult.error.issues[0]?.message || "unknown error"}`,
        },
      };
    }

    return {
      success: true,
      envelope: {
        kind: parsed.kind,
        payload: payloadResult.data,
        dedupeKey: parsed.dedupeKey,
      } as OpEnvelope,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid envelope";
    return {
      success: false,
      error: { ok: false, status: 400, message },
    };
  }
}

export async function executeOp(
  env: Env,
  envelope: OpEnvelope
): Promise<{ ok: true; hubspotId?: string } | NormalizedError> {
  try {
    const handler = registry[envelope.kind];
    if (!handler) {
      return { ok: false, status: 400, message: `Unknown operation kind: ${envelope.kind}` };
    }

    const result = await handler.execute(env, envelope.payload, envelope.dedupeKey);
    return result;
  } catch (err) {
    if (typeof err === "object" && err !== null && "ok" in err && !err.ok) {
      const normalizedErr = err as NormalizedError;
      return normalizedErr;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, status: 500, message };
  }
}
