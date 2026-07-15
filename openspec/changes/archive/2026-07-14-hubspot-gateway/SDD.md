# HubSpot Gateway — System Design Document

## System Overview

The HubSpot gateway is a fourth Cloudflare Worker in the `site-web` monorepo
(`apps/hubspot`), sitting between the monorepo's services and HubSpot CRM. It
centralizes the HubSpot token, API knowledge, and rate-limit handling behind a
small internal HTTP interface exposed **only** over a Cloudflare service binding
(`HUBSPOT`) — it has no public route. Durability comes from a Postgres outbox
table (`hubspot_outbox`) in the same Neon database already used by `apps/api`;
the Worker's own `scheduled()` cron (`* * * * *`) drains it.

```
apps/
  web/          Svelte SPA (unchanged)
  api/          Hono API  ── HUBSPOT service binding ──▶  apps/hubspot
  ab-splitter/  A/B splitter (unchanged; binding precedent)
  hubspot/      NEW: HubSpot gateway (internal + cron)
                     │
                     ├─ hubspotFetch ──▶ api.hubapi.com (HubSpot CRM)
                     └─ Neon Postgres  (shared DB_CONN): hubspot_outbox
```

Two delivery paths share one op catalog:
- **Durable** (`POST /ops/enqueue`) → insert an outbox row (`202 { id }`), the
  cron drain delivers it eventually with retries.
- **Synchronous** (`POST /ops/execute`) → run the op against HubSpot now and
  return the normalized result.

The reservation flow is the first consumer and uses the durable path
fire-and-forget so a HubSpot outage never affects guests.

## Architecture Decisions

- **Internal-only Worker (no routes).** Following `apps/ab-splitter`, the gateway
  is invoked via a service binding, not a hostname. `wrangler.jsonc` omits
  `routes` and adds `triggers.crons`. This keeps the HubSpot token off any public
  surface and out of every other Worker.
- **Single default export with `fetch` + `scheduled`.** One module backs both the
  binding (HTTP) and the cron (drain), matching how Cloudflare dispatches to a
  Worker's two entrypoints.
- **DB outbox instead of Cloudflare Queues.** Provides at-least-once durability
  without a paid-plan dependency. The shared Neon DB avoids provisioning a second
  datastore; the outbox is a single table with a partial index on due `pending`
  rows.
- **Atomic batch claim with `FOR UPDATE SKIP LOCKED`.** A single
  `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`
  guarantees two concurrent drains never double-claim a row, even though the cron
  fires every minute and could overlap.
- **Order-insensitive ops via email resolution.** `deal.create` carries
  `contactEmail` (not a HubSpot contact id) and resolves/creates the contact at
  execution time, then associates deal→contact with HubSpot v4 HUBSPOT_DEFINED
  association **type id 3**. Enqueued ops therefore need no cross-op id passing
  and can execute in any order or be retried independently.
- **Idempotency by dedupeKey + natural keys.** `contact.upsert` is naturally
  idempotent on email; `deal.create` stores `dedupeKey` in a deal property and
  searches before creating on retry; `timeline.event` uses `dedupeKey` as the
  HubSpot event id; list ops are naturally idempotent.
- **Reservation enqueue fully isolated.** The two-op enqueue is wrapped in one
  `try/catch` inside `c.executionCtx.waitUntil(...)`, after the `201` response is
  produced, so no gateway/HubSpot failure can escape into the reservation
  response.
- **Validation via `zod-validator` middleware with a custom error hook.** The
  reservation handler adopts the project-standard `zValidator("json",
  ReservationRequestSchema, hook)` middleware (the same pattern `/api/messages`
  already uses), satisfying the Hono rule that route handlers must validate via
  `zod-validator` and never parse `c.req.json()` manually. The exact external
  contract is preserved by (a) encoding trimming, empty→`null` normalization, and
  `people` default/clamp-to-1 **in the schema** (`z.string().trim()`, a
  `trimToNull` transform, `z.coerce.number().int().min(1).catch(1)`), and (b) a
  custom hook `(result, c) => c.json({ error }, 400)` that reproduces the exact
  `400 { error }` shape on failure. The only behavioral change is that `email`
  gains format validation.
- **Deploy ordering enforced in-job.** A "Deploy HubSpot gateway" step is added to
  `deploy-prod.yml` immediately before "Deploy API" (no separate workflow), so the
  `HUBSPOT` binding target exists before the API that references it deploys.
- **Migration kept split-safe.** The runner strips `--` comments and splits on
  `;`; the outbox migration uses only two plain `CREATE ... IF NOT EXISTS`
  statements — no embedded semicolons, no dollar-quoted bodies.

## Component Responsibilities

| Component | File | Responsibility |
|---|---|---|
| Worker entry | `apps/hubspot/src/index.ts` | Hono app (`/ops/enqueue`, `/ops/execute`, `/health`) + default export exposing `fetch` and `scheduled`. |
| Env types | `apps/hubspot/src/env.ts` | `Env` (`HUBSPOT_TOKEN`, `DB_CONN`, optional `HUBSPOT_*` vars). |
| HubSpot client | `apps/hubspot/src/hubspotClient.ts` | `hubspotFetch(env, path, init)`: auth, JSON, error normalization; transient/permanent classification; `Retry-After` parsing. |
| Op registry | `apps/hubspot/src/ops/registry.ts` | Envelope Zod schema; `parseEnvelope`, `executeOp`; dispatch by `kind`. |
| Op mappers | `apps/hubspot/src/ops/{contact,deal,note,list,timeline}.ts` | Per-op payload schema + mapper to HubSpot request(s). |
| Outbox | `apps/hubspot/src/outbox.ts` | `enqueue`, `claimBatch`, `markDelivered/markRetry/markFailed`, pure `computeBackoff` + `classifyFailure`. |
| Cron drain | `apps/hubspot/src/scheduled.ts` | Claim batch → execute → transition each row. |
| Tests | `apps/hubspot/test/*.test.ts` | Op mappers, outbox transitions, error normalization (fetch/Neon stubbed). |
| Migration | `apps/api/migrations/0003_hubspot_outbox.sql` | Idempotent `hubspot_outbox` table + partial index. |
| Canonical schema | `apps/api/schema.sql` | Mirror of the outbox table/index. |
| API binding | `apps/api/wrangler.jsonc` | `services` block: `HUBSPOT` → `site-web-hubspot`. |
| API consumer | `apps/api/src/index.ts` | Typed `Bindings.HUBSPOT`; reservation `zValidator` middleware (+ custom error hook) + isolated enqueue. |
| Deploy/CI | `.github/workflows/{deploy-prod,ci}.yml` | Hubspot deploy step before API; `npm test --workspaces` in CI. |
| Scripts/env | root `package.json`, `.dev.env.example` | `dev:hubspot`/`deploy:hubspot`; documented `HUBSPOT_*` vars. |

## Data Flow

### Durable enqueue (reservation path)
1. `POST /api/reservations` validates via the `zValidator("json",
   ReservationRequestSchema, hook)` middleware; the hook returns `400 { error }`
   on failure. The handler reads validated data with `c.req.valid("json")`.
2. On success, INSERT into `reservations`, build `201 { reservation }`.
3. `c.executionCtx.waitUntil(async () => { try { … } catch {} })`: two
   `c.env.HUBSPOT.fetch("http://hubspot/ops/enqueue", { POST envelope })` calls —
   `contact.upsert` and `deal.create` (`dedupeKey = "reservation-<id>"`).
4. Gateway `POST /ops/enqueue` validates the envelope and INSERTs a `pending`
   `hubspot_outbox` row, returns `202 { id }` (ignored by the caller).
5. The `201` reservation response returns regardless of steps 3–4 outcomes.

### Cron drain (every minute)
1. `scheduled()` calls `claimBatch(env, 25)`: one `UPDATE ... WHERE id IN (SELECT
   … WHERE status='pending' AND next_attempt_at <= now() ORDER BY next_attempt_at
   LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING *`, incrementing `attempts`.
2. For each claimed row: `executeOp(env, { kind, payload, dedupeKey })`.
3. Success → `markDelivered(id, hubspotId)`.
4. Transient failure (429/5xx/network) and `attempts < 8` → `markRetry` with
   `computeBackoff(attempts, retryAfter)`; row stays `pending`.
5. Permanent 4xx **or** `attempts >= 8` → `markFailed(id, last_error)`.

### Synchronous execute
`POST /ops/execute` → `parseEnvelope` → `executeOp` → `200 { ok:true, hubspotId? }`
or non-2xx `{ ok:false, status, message }`.

### Health
`GET /health` → `GET https://api.hubapi.com/account-info/v3/details` (token) +
`SELECT 1` (DB). Both ok → `200 { ok:true }`; else non-200
`{ ok:false, status, message }`.

## Known Constraints

- **Migration runner is naive.** `apps/api/scripts/migrate.mjs` strips `--`
  comments and splits on `;`. The outbox migration must stay to two plain
  statements with no embedded semicolons or dollar-quoting, or it will be split
  incorrectly.
- **Deploy ordering is load-bearing.** The `apps/api` `HUBSPOT` binding only
  resolves if `site-web-hubspot` already exists; the in-job step order (hubspot
  before API) in `deploy-prod.yml` is what guarantees this on the shared push.
- **BIGINT ids surface as strings.** Neon returns `BIGINT` `id` values as strings
  over HTTP; the enqueue response type is `{ id: string }`.
- **Shared DB, same `DB_CONN`.** The gateway reuses the pooled Neon connection
  string; no new datastore and no Cloudflare binding block for it (plain
  var/secret on `c.env`).
- **At-least-once delivery.** The outbox guarantees delivery is attempted, not
  exactly-once; op idempotency (dedupeKey/natural keys) absorbs duplicate
  attempts. Failed rows are never auto-retried and must be inspected/requeued via
  SQL.
- **No secrets in committed config.** `HUBSPOT_TOKEN` and `DB_CONN` are Worker
  secrets (dev via gitignored `.dev.env`); only non-secret `HUBSPOT_*` vars live
  in `wrangler.jsonc`.
- **`nodejs_compat` + pinned `compatibility_date`.** The new Worker matches
  `apps/api`'s compatibility settings; bump deliberately only.
