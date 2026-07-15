import type { Env } from "./env";
import { claimBatch, markDelivered, markRetry, markFailed, classifyFailure } from "./outbox";
import { executeOp } from "./ops/registry";
import type { OpEnvelope } from "./ops/registry";

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
        await markFailed(env, row.id.toString(), errorMsg);
        stats.failed++;
      }
    }
  } catch (err) {
  }

  return stats;
}
