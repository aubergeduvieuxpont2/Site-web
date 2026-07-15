# HubSpot Gateway — Requirements

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — A new workspace `apps/hubspot` MUST be a Hono Cloudflare
  Worker whose `wrangler.jsonc` has **no `routes`** and declares a cron trigger
  `["* * * * *"]`. It is reachable only via the `HUBSPOT` service binding and its
  cron.
- **FR-2 (MUST)** — The Worker's default export MUST expose both `fetch` (the Hono
  app) and `scheduled` (the cron drain).
- **FR-3 (MUST)** — `POST /ops/enqueue` MUST validate the op envelope
  `{ kind, payload, dedupeKey? }` with Zod, insert one `pending` `hubspot_outbox`
  row, and return `202 { id }`. Invalid envelopes MUST return a non-2xx
  `{ ok:false, status, message }` and insert no row.
- **FR-4 (MUST)** — `POST /ops/execute` MUST run the op synchronously and return
  `{ ok:true, hubspotId? }` on success or `{ ok:false, status, message }` on
  failure.
- **FR-5 (MUST)** — `GET /health` MUST verify token validity
  (`GET /account-info/v3/details`) and DB reachability (`SELECT 1`), returning
  `200 { ok:true }` on success or a non-200 `{ ok:false, status, message }`
  otherwise.
- **FR-6 (MUST)** — The op catalog v1 MUST implement `contact.upsert` (by email),
  `deal.create`, `note.create`, `list.add`, `list.remove`, and `timeline.event`,
  each as a mapper over a shared `hubspotFetch(env, path, init)` client that adds
  auth, JSON handling, and normalized errors.
- **FR-7 (MUST)** — `deal.create` MUST carry `contactEmail` (not a HubSpot id),
  resolve/create the contact by email at execution, create the deal, and
  associate deal→contact using HubSpot v4 HUBSPOT_DEFINED association type id 3.
  When `dedupeKey` is present it MUST search before creating (idempotent retry).
- **FR-8 (MUST)** — A `hubspot_outbox` table MUST be created by a new idempotent
  migration in `apps/api/migrations/` and mirrored into `apps/api/schema.sql`;
  both MUST use `CREATE TABLE/INDEX IF NOT EXISTS` and be safe to re-run. The
  migration MUST contain no embedded semicolons within a statement and no
  dollar-quoted bodies.
- **FR-9 (MUST)** — The cron drain MUST claim at most 25 due `pending` rows
  atomically via `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
  RETURNING`, execute each op, and mark rows `delivered` on success (recording
  `hubspot_id`).
- **FR-10 (MUST)** — On transient failure (429/5xx/network) with `attempts < 8`,
  the drain MUST keep the row `pending` and set `next_attempt_at` via exponential
  backoff, honoring `Retry-After` when present.
- **FR-11 (MUST)** — On a permanent 4xx or once `attempts >= 8`, the drain MUST
  set `status='failed'` with `last_error`; failed rows MUST NOT be re-claimed.
- **FR-12 (MUST)** — `apps/api` MUST gain a typed `Bindings` including
  `HUBSPOT: Fetcher`, and `apps/api/wrangler.jsonc` MUST declare a `services`
  block binding `HUBSPOT` → `site-web-hubspot`.
- **FR-13 (MUST)** — After a successful reservation INSERT, `POST /api/reservations`
  MUST enqueue `contact.upsert` + `deal.create` (`dedupeKey =
  "reservation-<id>"`) through the `HUBSPOT` binding, inside a single `try/catch`
  within `c.executionCtx.waitUntil(...)`. No gateway/HubSpot failure may change
  the reservation response.
- **FR-14 (MUST)** — The reservation handler MUST validate input with the
  `zod-validator` middleware (`zValidator("json", ReservationRequestSchema,
  hook)`) — never by parsing `c.req.json()` manually — and MUST read the
  validated data via `c.req.valid("json")`. A custom error `hook` MUST preserve
  the exact external contract (`201 { reservation }` on success, `400 { error }`
  on bad input, same trimming, null normalization, and `people` default 1), with
  the schema encoding those transforms; the only behavioral change is that
  `email` MUST be a valid email format.
- **FR-15 (MUST)** — `apps/hubspot` MUST include a Vitest suite (`"test": "vitest
  run"`) covering op mappers, outbox claim/backoff transitions, and error
  normalization, all with `fetch` stubbed.
- **FR-16 (MUST)** — `.github/workflows/deploy-prod.yml` MUST add a "Deploy
  HubSpot gateway" step (`working-directory: apps/hubspot`) immediately before the
  "Deploy API" step; no separate deploy workflow is added.
- **FR-17 (MUST)** — `.github/workflows/ci.yml`'s `verify` job MUST run
  `npm test --workspaces --if-present` after typecheck.
- **FR-18 (MUST)** — Root `package.json` MUST add `dev:hubspot` and
  `deploy:hubspot` scripts, and `.dev.env.example` MUST document `HUBSPOT_TOKEN`
  plus optional `HUBSPOT_PIPELINE_ID` / `HUBSPOT_DEALSTAGE_ID` /
  `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID`.
- **FR-19 (SHOULD)** — `note.create` SHOULD associate to a contact and/or deal
  (resolving `dealDedupeKey` by search, best-effort) and treat `dedupeKey` as
  best-effort idempotency.
- **FR-20 (SHOULD)** — `timeline.event` SHOULD set the HubSpot event `id` =
  `dedupeKey` when present and fall back to `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID`.

### Non-Functional Requirements

- **NFR-1 (MUST)** — `npm run typecheck` MUST pass with 0 errors across every
  workspace, including `apps/hubspot`.
- **NFR-2 (MUST)** — The `apps/hubspot` Vitest suite MUST pass under `npm test
  --workspaces --if-present`; workspaces without a `test` script are skipped.
- **NFR-3 (MUST)** — Secrets (`HUBSPOT_TOKEN`, `DB_CONN`) MUST live only as Worker
  secrets / gitignored `.dev.env`; only non-secret `HUBSPOT_*` vars may appear in
  `wrangler.jsonc`.
- **NFR-4 (MUST)** — The outbox migration and `schema.sql` mirror MUST be
  idempotent (re-runnable without duplicate-object errors).
- **NFR-5 (SHOULD)** — The atomic claim MUST tolerate overlapping cron runs
  without double-claiming (`FOR UPDATE SKIP LOCKED`).
- **NFR-6 (SHOULD)** — Delivery is at-least-once; op idempotency (dedupeKey /
  natural keys) SHOULD absorb duplicate attempts.
- **NFR-7 (MUST)** — The new Worker MUST pin `compatibility_date` and use
  `nodejs_compat` consistent with `apps/api`.

## Out of Scope (Exclusions)

- Inbound HubSpot webhooks or two-way sync.
- Cloudflare Queues (the DB outbox provides durability without a paid plan).
- Admin UI for the outbox (SQL inspection suffices).
- Automatic retry/requeue of `failed` outbox rows.
- Any change to the reservation response shape beyond email-format validation.
- New columns on the `reservations` table.
- Provisioning the HubSpot private app / setting production secrets (operational,
  not code).

## Acceptance Criteria

1. `npm run typecheck` completes with 0 errors across all workspaces including
   `apps/hubspot`.
2. `npm test --workspaces --if-present` runs the `apps/hubspot` Vitest suite and
   it passes; workspaces without a `test` script are skipped without failure.
3. `apps/hubspot/wrangler.jsonc` has no `routes` key and has `triggers.crons`
   equal to `["* * * * *"]`; `apps/hubspot/src/index.ts`'s default export has both
   `fetch` and `scheduled` properties.
4. `apps/api/migrations/0003_hubspot_outbox.sql` exists with exactly a
   `CREATE TABLE IF NOT EXISTS hubspot_outbox` and a `CREATE INDEX IF NOT EXISTS
   hubspot_outbox_due_idx ... WHERE status = 'pending'`, no embedded semicolons in
   a statement body, no dollar-quoting, and is safe to re-run.
5. `apps/api/schema.sql` contains the same `hubspot_outbox` table and partial
   index.
6. `POST /ops/enqueue` with a valid envelope returns 202 `{ id }` and persists a
   `pending` row; with an invalid envelope returns non-2xx `{ ok:false, status,
   message }` and persists no row.
7. `POST /ops/execute` returns `{ ok:true, ... }` on success and `{ ok:false,
   status, message }` (status mirroring the upstream) on a HubSpot non-2xx, as
   shown by a unit test with `fetch` stubbed.
8. `GET /health` returns 200 `{ ok:true }` when token+DB checks pass and a
   non-200 `{ ok:false, status, message }` when the token is missing/invalid or
   the DB is unreachable.
9. The cron drain claims ≤25 due `pending` rows via a single `UPDATE ... FOR
   UPDATE SKIP LOCKED ... RETURNING`; a delivered row has `status='delivered'` and
   `hubspot_id` set.
10. A unit test shows `computeBackoff` grows with `attempts` and honors
    `Retry-After`; a transient failure keeps the row `pending` with `attempts`
    incremented and `next_attempt_at` in the future.
11. A claimed row becomes `failed` with `last_error` on a permanent 4xx or once
    `attempts >= 8`, and `claimBatch` does not re-claim `failed` rows.
12. `POST /api/reservations`'s handler uses the `zod-validator` middleware
    (`zValidator("json", ReservationRequestSchema, hook)`) with no manual
    `c.req.json()` parsing, and returns 201 `{ reservation }` (identical shape)
    for a valid body and 400 `{ error }` for a missing name/email or invalid
    email format.
13. A valid reservation issues exactly two `HUBSPOT` binding enqueue calls
    (`contact.upsert` and `deal.create` with `dedupeKey == "reservation-<id>"`)
    inside `c.executionCtx.waitUntil`; when the binding rejects, the reservation
    response is still 201 and unchanged.
14. `deploy-prod.yml` has a "Deploy HubSpot gateway" step
    (`working-directory: apps/hubspot`) immediately before "Deploy API"; no
    separate `deploy-hubspot.yml` exists.
15. `ci.yml`'s `verify` job runs `npm test --workspaces --if-present` after
    typecheck.
16. Root `package.json` exposes `dev:hubspot` and `deploy:hubspot`; `.dev.env.example`
    documents `HUBSPOT_TOKEN` and the three optional `HUBSPOT_*` vars.
