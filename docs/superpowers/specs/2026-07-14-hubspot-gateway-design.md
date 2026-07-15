# HubSpot Gateway — Design

**Date:** 2026-07-14
**Status:** Approved

## Purpose

A general-purpose middle layer between this application and HubSpot CRM. Any
service in the monorepo can create/update CRM records (contacts, deals, notes,
list membership, timeline events) without knowing HubSpot's API, holding its
token, or handling its rate limits. The reservation flow is the first consumer.

## Topology

New Cloudflare Worker: **`apps/hubspot`** (Hono, mirroring `apps/api`).

- **Not internet-exposed.** No routes or custom domains in its `wrangler.jsonc`.
  It is reachable only through a Cloudflare **service binding** (`HUBSPOT`)
  declared in `apps/api/wrangler.jsonc`, plus its own cron trigger.
- **Secrets** (set via `wrangler secret put`, dev via repo-root `.dev.env`):
  - `HUBSPOT_TOKEN` — HubSpot private-app access token.
  - `DB_CONN` — same Neon Postgres database as `apps/api` (for the outbox).
- **Vars** (in `wrangler.jsonc`, optional per-op):
  - `HUBSPOT_PIPELINE_ID`, `HUBSPOT_DEALSTAGE_ID` — defaults for `deal.create`.
  - `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID` — required only for `timeline.event`.

## Interface (HTTP over the service binding)

All bodies are JSON. An **op envelope** is:

```json
{ "kind": "<op kind>", "payload": { ... }, "dedupeKey": "optional-string" }
```

| Route | Semantics |
|---|---|
| `POST /ops/enqueue` | Durable path. Validates the envelope, inserts one `hubspot_outbox` row, returns `202 { id }`. Delivery is guaranteed eventually (cron drain). |
| `POST /ops/execute` | Synchronous path. Executes the op against HubSpot immediately and returns the normalized result. For callers that need the HubSpot ID/record now. |
| `GET /health` | Verifies token validity (cheap HubSpot call) and DB reachability. |

Errors are normalized: `{ ok: false, status, message }`. Envelope validation
uses Zod (one schema per op kind).

## Op catalog (v1)

| Kind | HubSpot action | Idempotency |
|---|---|---|
| `contact.upsert` | Create-or-update contact keyed by email | Natural (email key) |
| `deal.create` | Create deal, associate to contact | `dedupeKey` stored in a deal property; search before create on retry |
| `note.create` | Create note engagement, associate to contact and/or deal | `dedupeKey` best-effort |
| `list.add` / `list.remove` | Static list membership | Natural |
| `timeline.event` | Custom timeline event (needs template ID) | HubSpot event `id` = `dedupeKey` |

Each op is a small mapper module over a shared `hubspotFetch(env, path, init)`
client that adds auth, JSON handling, and error normalization.

## Outbox (durable delivery)

New idempotent migration in `apps/api/migrations/` (single shared DB; existing
runner `npm run db:migrate` applies it):

```sql
CREATE TABLE IF NOT EXISTS hubspot_outbox (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  dedupe_key      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  hubspot_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hubspot_outbox_due_idx
  ON hubspot_outbox (next_attempt_at) WHERE status = 'pending';
```

**Cron drain** (`* * * * *` on the hubspot Worker, `scheduled()` handler):

1. Claim a batch (e.g. 25) of `pending` rows with `next_attempt_at <= now()`,
   oldest first, using `UPDATE ... RETURNING` so concurrent runs don't
   double-claim.
2. Execute each op. Success → `status = 'delivered'`, record `hubspot_id`.
3. Transient failure (429 / 5xx / network) → increment `attempts`, set
   `next_attempt_at` via exponential backoff (honor `Retry-After` on 429).
4. After 8 attempts, or on permanent 4xx (validation/auth) → `status = 'failed'`
   with `last_error` kept for inspection. Failed rows are never retried
   automatically but remain queryable.

## First consumer: reservations

In `apps/api` `POST /api/reservations`, after the INSERT succeeds:

```
c.executionCtx.waitUntil(enqueue two ops via HUBSPOT binding)
```

- `contact.upsert` — name, email, phone.
- `deal.create` — `dedupeKey = "reservation-<id>"`; properties carry arrive /
  depart / room / party size; the guest message goes in as the deal description
  (a `note.create` can replace this later if richer formatting is wanted).

A gateway or HubSpot failure never fails the reservation response.

**Targeted improvement in the same change:** the reservations handler starts
using its existing (currently unused) Zod `ReservationRequestSchema`, adding
email format validation before data reaches Postgres or the CRM.

## Deploy & dev

- New GitHub Actions workflow `deploy-hubspot.yml` mirroring `deploy-api.yml`
  (same account/token conventions; Node 22).
- Ordering: deploy `apps/hubspot` once **before** the `apps/api` change that
  adds the `HUBSPOT` service binding, or the api deploy fails to resolve it.
- Local dev: run `wrangler dev` for both workers (root scripts `dev:api`,
  `dev:hubspot`); wrangler resolves service bindings between concurrent dev
  sessions automatically. Both load `.dev.env`.

## Testing

- Vitest unit tests in `apps/hubspot`: op mappers (envelope → HubSpot request
  shape), outbox claim/backoff state transitions, error normalization —
  HubSpot API mocked via fetch stubs.
- `npm run typecheck` covers the new workspace.
- Manual end-to-end against a HubSpot sandbox/test token before production.

## Out of scope (v1)

- Inbound HubSpot webhooks / two-way sync.
- Cloudflare Queues (outbox covers durability without a paid-plan dependency).
- Admin UI for the outbox (SQL inspection is sufficient for now).
