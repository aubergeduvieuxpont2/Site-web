import type { Env } from "./env";
import { claimBatch, markDelivered, markRetry, markFailed, classifyFailure } from "./outbox";
import { executeOp } from "./ops/registry";
import type { OpEnvelope } from "./ops/registry";
import { linkContactToUser } from "./userLink";

export interface DrainStats {
  delivered: number;
  retried: number;
  failed: number;
}

export async function scheduled(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext
): Promise<DrainStats> {
  const stats: DrainStats = { delivered: 0, retried: 0, failed: 0 };

  try {
    const batch = await claimBatch(env, 25);

    for (const row of batch) {
      try {
        const envelope: OpEnvelope = {
          kind: row.kind as any,
          payload: row.payload,
          dedupeKey: row.dedupe_key || undefined,
        };

        const result = await executeOp(env, envelope);

        if (result.ok) {
          await markDelivered(env, row.id.toString(), result.hubspotId || "");
          if (row.kind === "contact.upsert" && result.hubspotId) {
            const payload = row.payload as any;
            if (payload?.email) {
              await linkContactToUser(env, payload.email, result.hubspotId);
            }
          }
          stats.delivered++;
        } else {
          const failure = classifyFailure(result.status);
          if (failure === "permanent" || row.attempts >= 8) {
            await markFailed(env, row.id.toString(), result.message);
            stats.failed++;
          } else {
            const errorMessage = `[${result.status}] ${result.message}`;
            await markRetry(env, row.id.toString(), row.attempts, errorMessage, (result as any).retryAfterSeconds);
            stats.retried++;
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        // Observability without PII: a stable code + the row id only. Never log
        // payload contents (emails/names/note bodies).
        console.error("hubspot_drain_row_error", {
          code: "OP_EXECUTE_THREW",
          rowId: row.id.toString(),
          errorName: err instanceof Error ? err.name : "Unknown",
        });
        await markFailed(env, row.id.toString(), errorMsg);
        stats.failed++;
      }
    }
  } catch (err) {
    // The whole drain failed (e.g. claimBatch could not reach the DB). Surface
    // a stable code so the failure is observable; log no PII and no error body.
    console.error("hubspot_drain_fatal", {
      code: "DRAIN_FATAL",
      errorName: err instanceof Error ? err.name : "Unknown",
    });
  }

  return stats;
}
