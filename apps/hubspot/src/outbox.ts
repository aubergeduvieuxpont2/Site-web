import { neon } from "@neondatabase/serverless";
import type { Env } from "./env";
import type { OpEnvelope } from "./ops/registry";

export interface OutboxRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  hubspot_id: string | null;
  created_at: string;
  updated_at: string;
}

export function computeBackoff(attempts: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds) {
    return Math.max(retryAfterSeconds, computeExponentialBackoff(attempts));
  }
  return computeExponentialBackoff(attempts);
}

function computeExponentialBackoff(attempts: number): number {
  const baseDelay = 5;
  const maxDelay = 600;
  const delay = baseDelay * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(delay, maxDelay);
}

export function classifyFailure(status: number): "transient" | "permanent" {
  if (status === 429 || (status >= 500 && status < 600)) {
    return "transient";
  }
  if (status >= 400 && status < 500) {
    return "permanent";
  }
  return "transient";
}

export async function enqueue(
  env: Env,
  envelope: OpEnvelope
): Promise<string> {
  const sql = neon(env.DB_CONN);
  const rows = await sql`
    INSERT INTO hubspot_outbox (kind, payload, dedupe_key)
    VALUES (${envelope.kind}, ${JSON.stringify(envelope.payload)}, ${envelope.dedupeKey || null})
    RETURNING id
  `;
  return rows[0].id.toString();
}

export async function claimBatch(env: Env, limit: number = 25): Promise<OutboxRow[]> {
  const sql = neon(env.DB_CONN);
  const rows = await sql`
    UPDATE hubspot_outbox
    SET attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM hubspot_outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows as OutboxRow[];
}

export async function markDelivered(
  env: Env,
  id: string,
  hubspotId: string
): Promise<void> {
  const sql = neon(env.DB_CONN);
  await sql`
    UPDATE hubspot_outbox
    SET status = 'delivered', hubspot_id = ${hubspotId}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markRetry(
  env: Env,
  id: string,
  attempts: number,
  error: string,
  retryAfterSeconds?: number
): Promise<void> {
  const backoffSeconds = computeBackoff(attempts, retryAfterSeconds);
  const sql = neon(env.DB_CONN);

  const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

  await sql`
    UPDATE hubspot_outbox
    SET status = 'pending', next_attempt_at = ${nextAttemptAt}, last_error = ${error}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function markFailed(
  env: Env,
  id: string,
  error: string
): Promise<void> {
  const sql = neon(env.DB_CONN);
  await sql`
    UPDATE hubspot_outbox
    SET status = 'failed', last_error = ${error}, updated_at = now()
    WHERE id = ${id}
  `;
}
