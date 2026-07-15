# Understanding Brief

## Problem & Objective

The monorepo needs to push CRM data (contacts, deals, notes, list membership,
timeline events) into HubSpot without any service holding HubSpot's token,
knowing its API, or handling its rate limits. The objective is a general-purpose
HubSpot gateway Worker (`apps/hubspot`) with a durable outbox, exposed only
internally via a Cloudflare service binding, with the reservation flow
(`POST /api/reservations`) as its first consumer — implemented exactly as the
approved design doc `docs/superpowers/specs/2026-07-14-hubspot-gateway-design.md`
specifies, refined by the Round 1 answers.

## Scope

**In scope**
- New workspace `apps/hubspot` (Hono Worker, mirrors `apps/api`; the closest
  structural mirror for the internal/service-bound + `services` pattern is
  `apps/ab-splitter`). Not internet-exposed: **no `routes`** in its
  `wrangler.jsonc`; a cron trigger `* * * * *` and a `scheduled()` handler only.
- Secrets on the hubspot Worker: `HUBSPOT_TOKEN`, `DB_CONN` (same Neon DB as
  `apps/api`, loaded in dev via `wrangler dev --env-file ../../.dev.env`).
  Vars: `HUBSPOT_PIPELINE_ID`, `HUBSPOT_DEALSTAGE_ID`,
  `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID`.
- HTTP interface over the binding, JSON + Zod-validated envelope
  `{ kind, payload, dedupeKey? }`: `POST /ops/enqueue` (insert outbox row →
  `202 { id }`), `POST /ops/execute` (run synchronously → normalized result),
  `GET /health`. Normalized errors `{ ok:false, status, message }`.
- Op catalog v1 (each a small mapper over a shared `hubspotFetch(env, path, init)`
  client): `contact.upsert` (by email), `deal.create`, `note.create`,
  `list.add`/`list.remove`, `timeline.event`.
- Durable outbox: new idempotent migration in `apps/api/migrations/` creating
  `hubspot_outbox` + the partial index, mirrored into `apps/api/schema.sql`.
- Cron drain: atomic batch claim (25), execute, backoff/failure transitions.
- First consumer changes in `apps/api`: fire-and-forget enqueue of two ops after
  a successful reservation INSERT, via a new `HUBSPOT` service binding; plus the
  reservation handler adopting Zod validation (email-format tightening only).
- Deploy + dev + CI wiring, and Vitest unit tests in `apps/hubspot`.

**Out of scope (v1)**
- Inbound HubSpot webhooks / two-way sync.
- Cloudflare Queues (the DB outbox provides durability without a paid plan).
- Admin UI for the outbox (SQL inspection suffices).

## Success Criteria

- `apps/hubspot` deploys as a Worker with **no public route**; it is reachable
  only through the `HUBSPOT` service binding and its own cron.
- `npm run typecheck` passes for **every** workspace (including the new one).
- `apps/hubspot` Vitest suite passes and runs in CI: op mappers (envelope →
  HubSpot request shape), outbox claim/backoff state transitions, and error
  normalization, all with `fetch` stubbed. CI's `verify` job runs
  `npm test --workspaces --if-present` after typecheck.
- `npm run db:migrate` creates `hubspot_outbox` idempotently (re-runnable; no
  duplicate-object errors), and `schema.sql` reflects the same table/index.
- `POST /ops/enqueue` returns `202 { id }` and persists a `pending` row;
  `POST /ops/execute` returns a normalized result or `{ ok:false, status, message }`;
  `GET /health` returns non-200 with the normalized error shape when the token is
  missing/invalid or the DB is unreachable, using
  `GET https://api.hubapi.com/account-info/v3/details` + `SELECT 1`.
- The cron drain moves due `pending` rows to `delivered` on success, applies
  exponential backoff (honoring `Retry-After`) on transient failures, and marks
  rows `failed` with `last_error` on permanent 4xx or after 8 attempts.
- `POST /api/reservations` still returns the identical `201 { reservation }` on
  success and `400 { error }` on bad input; a valid reservation now enqueues
  `contact.upsert` + `deal.create`, and **no gateway/HubSpot failure ever changes
  the reservation response**. Invalid email format now returns 400.

## Key Decisions

- **Deploy ordering enforced in-job (supersedes the design doc's
  `deploy-hubspot.yml`).** There is no `deploy-api.yml`; add a
  "Deploy HubSpot gateway" step (`npx wrangler deploy`, `working-directory:
  apps/hubspot`) to `.github/workflows/deploy-prod.yml` **immediately before**
  the "Deploy API" step. Do not create a separate deploy workflow. This
  guarantees the `HUBSPOT` binding resolves when `apps/api` deploys.
- **`deal.create` carries `contactEmail`, not a HubSpot contact id.** At
  execution the op resolves the contact by email (search; upsert a minimal
  contact if absent) and creates the deal with a HubSpot v4 association
  deal→contact (HUBSPOT_DEFINED type id 3). This keeps enqueued ops independent
  and order-insensitive — no cross-op id passing.
- **Reservation validation via `schema.safeParse()` inside the existing
  handler**, not `zValidator` middleware — preserving the exact external
  contract (same 400 status, `{ error }` shape, trimming/null-normalization,
  `people` defaults to 1). The `ReservationRequestSchema` is adjusted to encode
  current trimming/default behavior; the only behavioral change is
  `email` → `z.string().email()`. The `201` shape is unchanged.
- **Reservation enqueue fully isolated.** Wrap the whole two-op enqueue in a
  single `try/catch` inside the `c.executionCtx.waitUntil(...)` promise so no
  failure can escape to the response.
- **Atomic outbox claim** via a single `UPDATE ... SET status/claim-fields ...
  WHERE id IN (SELECT ... WHERE status='pending' AND next_attempt_at <= now()
  ORDER BY next_attempt_at ... LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING`.
- **Schema mirrored** into both `apps/api/schema.sql` and the new migration;
  both use `CREATE TABLE/INDEX IF NOT EXISTS` so they are safe to re-run.
- **Typed `Bindings`/`Env` in `apps/api`** extended with `HUBSPOT: Fetcher`
  (plus a matching `services` block in `apps/api/wrangler.jsonc`, following the
  `ab-splitter` precedent).
- **`/health`** uses `account-info/v3/details` + `SELECT 1` as the low-cost
  token/DB checks.

## Recommendations Adopted

All six Round 1 recommendations were accepted by the operator and should be
prioritized by the Planner:
1. Enforce deploy ordering in-job in `deploy-prod.yml` (hubspot step before API).
2. Update `.dev.env.example` with `HUBSPOT_TOKEN` and the optional `HUBSPOT_*`
   vars (documenting that the hubspot `dev` script loads the same `.dev.env`).
3. Fully isolate the reservation enqueue in a `try/catch` inside `waitUntil`.
4. Atomic outbox claim via `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
   LOCKED) RETURNING`.
5. Mirror `hubspot_outbox` into `apps/api/schema.sql` (idempotent both places).
6. Add a dedicated typed `Bindings`/`Env` in `apps/api` including
   `HUBSPOT: Fetcher`.

Additional planning notes surfaced during exploration:
- Add `dev:hubspot` / `deploy:hubspot` (and a `test` convention) to the root
  `package.json` scripts, matching the existing workspace-scoped script style.
- `apps/hubspot` needs Vitest added to devDependencies plus a `"test": "vitest
  run"` script; the root `test` step relies on `--if-present` so workspaces
  without a `test` script are skipped.
- The migration runner (`scripts/migrate.mjs`) strips `--` comments and splits
  naively on `;`. Keep the `hubspot_outbox` migration free of embedded
  semicolons and dollar-quoted bodies (the design's SQL already is).
- The hubspot Worker's default export must expose both `fetch` (the Hono app)
  and `scheduled` (the cron drain) so one module serves the binding and the cron.

## Anticipated Next Steps

- **Provision HubSpot:** create a private app, capture `HUBSPOT_TOKEN`, and set
  the pipeline/dealstage/timeline-template IDs. Set the Worker secrets
  (`wrangler secret put HUBSPOT_TOKEN` and `DB_CONN` in `apps/hubspot`) and add
  them to local `.dev.env`.
- **First deploy is ordering-sensitive:** because `deploy-prod.yml` runs
  `typecheck` before any deploy, the `apps/api` change adding the `HUBSPOT`
  binding and the new `apps/hubspot` Worker land in the same push; the in-job
  step ordering (hubspot before API) is what makes the binding resolve.
- **Run `npm run db:migrate`** once to create `hubspot_outbox` before the gateway
  drains anything in production.
- **Manual end-to-end** against a HubSpot sandbox/test token before trusting
  production (per the design doc's testing section).
- **Operability:** failed outbox rows are never auto-retried — plan a way to
  inspect/requeue them (SQL for now). Future consumers can reuse the same
  enqueue/execute interface; `note.create` may later replace the deal-description
  message per the design doc's note.
