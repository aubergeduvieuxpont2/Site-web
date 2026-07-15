# HubSpot Gateway — Design Specification

## Task

Build a general-purpose **HubSpot gateway** Worker (`apps/hubspot`) that lets any
service in the monorepo push CRM records (contacts, deals, notes, list
membership, timeline events) into HubSpot **without holding the token, knowing
HubSpot's API, or handling its rate limits**. The gateway is reachable only over
an internal Cloudflare **service binding** (`HUBSPOT`) and its own cron trigger —
it has **no public route**. Delivery is made durable by a Postgres outbox table
(`hubspot_outbox`) drained every minute by the Worker's `scheduled()` handler.

The reservation flow (`POST /api/reservations` in `apps/api`) becomes the first
consumer: after a successful reservation INSERT it fire-and-forgets a
`contact.upsert` + `deal.create` enqueue through the `HUBSPOT` binding. A gateway
or HubSpot failure **must never change the reservation response**. The same
change tightens reservation validation (email format only) by adopting the
existing (currently unused) Zod `ReservationRequestSchema` through the project's
standard **`zod-validator` middleware** (`@hono/zod-validator`), supplying a
custom error hook that preserves the exact `400 { error }` contract.

Goals:
- New `apps/hubspot` Hono Worker mirroring `apps/ab-splitter` (internal + cron).
- Op envelope + op catalog v1 over a shared `hubspotFetch` client with normalized
  errors `{ ok:false, status, message }`.
- Durable outbox with atomic batch claim, exponential backoff, and terminal
  failure after permanent 4xx or 8 attempts.
- Deploy/dev/CI/test wiring so every workspace still passes `npm run typecheck`
  and a Vitest suite runs in CI.

Out of scope: inbound HubSpot webhooks / two-way sync, Cloudflare Queues, admin
UI for the outbox.

## Schema Changes

New table `hubspot_outbox` (single shared Neon DB, same as `apps/api`). Added as a
new idempotent migration `apps/api/migrations/0003_hubspot_outbox.sql` **and**
mirrored into `apps/api/schema.sql`. The migration runner (`apps/api/scripts/migrate.mjs`)
strips `--` comments and splits naively on `;`, so the SQL **MUST NOT** contain
embedded semicolons or dollar-quoted bodies. Two statements only (`CREATE TABLE
IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`):

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

`status` lifecycle: `pending` → `delivered` (success, `hubspot_id` recorded) or
`pending` → `failed` (permanent 4xx or `attempts >= 8`, `last_error` recorded).
No new columns on `reservations`.

## API Types

All types live in `apps/hubspot`. TypeScript / Zod shapes (design intent — the
builder authors the actual schemas):

### Op envelope (request body of `/ops/enqueue` and `/ops/execute`)

```ts
type OpEnvelope = {
  kind: "contact.upsert" | "deal.create" | "note.create"
      | "list.add" | "list.remove" | "timeline.event";
  payload: object;      // shape depends on kind (per-op Zod schema)
  dedupeKey?: string;   // optional idempotency handle
};
```

### Per-op payloads

```ts
type ContactUpsertPayload = { email: string; name?: string; phone?: string };

type DealCreatePayload = {
  contactEmail: string;           // resolved to a contact at execution time
  dealname: string;
  amount?: number;
  arrive?: string; depart?: string; room?: string; people?: number;
  description?: string;           // guest message
  pipeline?: string; dealstage?: string;   // fall back to HUBSPOT_* vars
};

type NoteCreatePayload = {
  body: string;
  contactEmail?: string;
  dealDedupeKey?: string;         // associate to a prior deal by its dedupeKey
};

type ListMembershipPayload = { listId: string; email: string };  // list.add / list.remove

type TimelineEventPayload = {
  email: string;
  templateId?: string;            // falls back to HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID
  tokens?: Record<string, string | number>;
};
```

### Responses

```ts
// POST /ops/enqueue  → 202
type EnqueueResponse = { id: string };            // outbox row id (BIGINT as string)

// POST /ops/execute  → 200 on success
type ExecuteOk = { ok: true; hubspotId?: string; data?: unknown };

// Normalized error (any route, non-2xx)
type NormalizedError = { ok: false; status: number; message: string };

// GET /health → 200 { ok:true } or non-200 NormalizedError
type HealthOk = { ok: true };
```

### `apps/api` binding type

```ts
type Bindings = {
  DB_CONN: string;
  HUBSPOT: Fetcher;   // Cloudflare service binding to site-web-hubspot
};
```

### Reservation contract (unchanged except email validation)

`ReservationRequestSchema` is adjusted so its parsed output matches today's
behavior: `name` required non-empty (trimmed); `email` now
`z.string().trim().min(1).email()`; `phone/room/arrive/depart/message` trim →
`null` when empty; `people` coerces to an int ≥ 1, default 1 (invalid/absent
values fall back to 1 via `.catch(1)`). It is applied with the `zod-validator`
middleware and a custom hook so success still returns `201 { reservation }` and
bad input still returns `400 { error }` (same shape), the only behavioral change
being email-format rejection:

```ts
import { zValidator } from "@hono/zod-validator";

const trimToNull = z.string().optional()
  .transform((v) => { const t = (v ?? "").trim(); return t.length > 0 ? t : null; });

const ReservationRequestSchema = z.object({
  name:    z.string().trim().min(1, "name is required"),
  email:   z.string().trim().min(1, "email is required").email("valid email is required"),
  phone:   trimToNull, room: trimToNull, arrive: trimToNull,
  depart:  trimToNull, message: trimToNull,
  people:  z.coerce.number().int().min(1).catch(1),
});

// Custom hook preserves the exact 400 { error } contract on validation failure.
const reservationHook = (result, c) =>
  result.success ? undefined
    : c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400);
```

## Implementation Steps

### Step 1 — `apps/hubspot/package.json`
New workspace `@site-web/hubspot` (`type: module`, private). Scripts: `dev`
(`wrangler dev --env-file ../../.dev.env`), `deploy` (`wrangler deploy`),
`typecheck` (`tsc --noEmit`), `test` (`vitest run`), `cf-typegen`. Dependencies:
`hono`, `zod`, `@neondatabase/serverless`. devDependencies: `wrangler`,
`typescript`, `@cloudflare/workers-types`, `vitest`. Pin versions to match the
existing workspaces.

### Step 2 — `apps/hubspot/tsconfig.json`
Mirror `apps/ab-splitter/tsconfig.json`. Add `"vitest/globals"` (or import
explicitly) so tests type-check; keep `include` covering `src/**/*.ts` and the
test directory.

### Step 3 — `apps/hubspot/wrangler.jsonc`
`name: "site-web-hubspot"`, `main: "src/index.ts"`, `compatibility_date` pinned
to match `apps/api` (`2025-06-16`), `compatibility_flags: ["nodejs_compat"]`,
`observability.enabled: true`. **No `routes`.** Add
`"triggers": { "crons": ["* * * * *"] }`. Add `"vars"` for `HUBSPOT_PIPELINE_ID`,
`HUBSPOT_DEALSTAGE_ID`, `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID` (empty-string
placeholders, documented as set per-environment). Document that `HUBSPOT_TOKEN`
and `DB_CONN` are secrets (dev via `.dev.env`).

### Step 4 — `apps/hubspot/vitest.config.ts`
Minimal Vitest config (node environment, globals enabled) so `vitest run`
discovers `test/**/*.test.ts`.

### Step 5 — `apps/hubspot/src/env.ts`
Export the `Env`/`Bindings` type for the Worker: `HUBSPOT_TOKEN`, `DB_CONN`
(secrets), `HUBSPOT_PIPELINE_ID?`, `HUBSPOT_DEALSTAGE_ID?`,
`HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID?` (vars).

### Step 6 — `apps/hubspot/src/hubspotClient.ts`
`hubspotFetch(env, path, init)` — prefixes `https://api.hubapi.com`, adds
`Authorization: Bearer ${env.HUBSPOT_TOKEN}` and JSON headers, parses the JSON
body, and returns either the parsed data or throws/returns a normalized
`{ ok:false, status, message }`. Provide a helper to classify a response as
`transient` (429 / 5xx / network error) vs `permanent` (other 4xx), and to read
the `Retry-After` header. This module must be pure enough to unit-test with a
stubbed global `fetch`.

### Step 7 — `apps/hubspot/src/ops/contact.ts`
`contact.upsert` mapper: Zod payload schema + a function that upserts a contact
keyed by email (search / `GET ?idProperty=email`, then `PATCH`, else `POST` to
`/crm/v3/objects/contacts`). Returns `{ hubspotId }`. Export a reusable
`resolveOrCreateContactByEmail(env, email, extra?)` used by `deal.create`.

### Step 8 — `apps/hubspot/src/ops/deal.ts`
`deal.create` mapper: Zod payload schema + a function that (a) if `dedupeKey`
present, searches deals by the stored dedupe property and returns the existing
id if found (idempotent retry); (b) resolves the contact by `contactEmail`
(reusing Step 7, upserting a minimal contact if absent); (c) creates the deal via
`POST /crm/v3/objects/deals` with pipeline/dealstage from payload or
`HUBSPOT_*` vars and the dedupe property set; (d) creates a HubSpot **v4**
deal→contact association using HUBSPOT_DEFINED type **id 3**. Returns
`{ hubspotId }`. No cross-op id passing.

### Step 9 — `apps/hubspot/src/ops/note.ts`
`note.create` mapper: Zod payload schema + create a note engagement
(`/crm/v3/objects/notes`) associated to contact and/or deal (`dealDedupeKey`
resolved by search, best-effort). `dedupeKey` best-effort.

### Step 10 — `apps/hubspot/src/ops/list.ts`
`list.add` / `list.remove` mappers: Zod payload schemas + add/remove static-list
membership by email (`/crm/v3/lists/{listId}/memberships/add|remove`). Natural
idempotency.

### Step 11 — `apps/hubspot/src/ops/timeline.ts`
`timeline.event` mapper: Zod payload schema + create a custom timeline event
(`/crm/v3/timeline/events`) using `templateId` (or
`HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID`); set the HubSpot event `id` = `dedupeKey`
when present.

### Step 12 — `apps/hubspot/src/ops/registry.ts`
The op registry + envelope Zod schema. Maps each `kind` → `{ payloadSchema,
execute(env, payload, dedupeKey) }`. Export `parseEnvelope(body)` (validates
`kind` + dispatches to the right payload schema) and `executeOp(env, envelope)`
returning `{ ok:true, hubspotId? } | { ok:false, status, message }`.

### Step 13 — `apps/hubspot/src/outbox.ts`
Outbox data access (Neon over `DB_CONN`):
- `enqueue(env, envelope)` → INSERT one row (`status='pending'`), `RETURNING id`.
- `claimBatch(env, limit=25)` → **atomic** claim: `UPDATE hubspot_outbox SET
  attempts = attempts + 1, updated_at = now() WHERE id IN (SELECT id FROM
  hubspot_outbox WHERE status='pending' AND next_attempt_at <= now() ORDER BY
  next_attempt_at ASC LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING *`.
- `markDelivered(env, id, hubspotId)` → `status='delivered'`, set `hubspot_id`.
- `markRetry(env, id, attempts, error, retryAfterSeconds?)` → compute
  `next_attempt_at` via exponential backoff (base delay × 2^(attempts-1),
  capped), honoring `Retry-After` when larger; keep `status='pending'`, set
  `last_error`.
- `markFailed(env, id, error)` → `status='failed'`, set `last_error`.
Export a pure `computeBackoff(attempts, retryAfterSeconds?)` helper for unit
tests.

### Step 13 — (kept in Step 13 file) drain policy helper
Within `outbox.ts` (or a small `drainPolicy.ts`), a pure function
`classifyFailure(status)` → `"transient" | "permanent"`, and the terminal rule:
after a claimed attempt, if success → delivered; else if permanent 4xx OR
`attempts >= 8` → failed; else → retry with backoff.

### Step 14 — `apps/hubspot/src/scheduled.ts`
`scheduled()` cron drain: claim a batch (25), execute each op via
`executeOp`, and apply the transition (delivered / retry / failed) per Step 13.
Wrap each op independently so one failure does not abort the batch.

### Step 15 — `apps/hubspot/src/index.ts`
Hono app with:
- `POST /ops/enqueue` — validate envelope, `enqueue`, return `202 { id }`.
- `POST /ops/execute` — validate envelope, `executeOp`, return the normalized
  result (`200 { ok:true, ... }` or non-2xx `{ ok:false, status, message }`).
- `GET /health` — token check (`GET /account-info/v3/details`) + DB check
  (`SELECT 1`); return `200 { ok:true }` or non-200 `{ ok:false, status, message }`.
Default export exposes **both** `fetch` (the Hono app) and `scheduled` (Step 14)
so one module serves the binding and the cron.

### Step 16 — `apps/hubspot/test/ops.test.ts`
Vitest: op mappers (envelope → HubSpot request shape) with global `fetch`
stubbed — assert method/path/body for `contact.upsert`, `deal.create` (search →
resolve contact → create + association id 3), `note.create`, list ops,
`timeline.event`, and error normalization for a non-2xx response.

### Step 17 — `apps/hubspot/test/outbox.test.ts`
Vitest: outbox state transitions — `computeBackoff` growth + `Retry-After`
override; `classifyFailure` transient vs permanent; the terminal rule (delivered
on success; failed on permanent 4xx; failed at `attempts >= 8`; retry otherwise),
with the Neon client stubbed.

### Step 18 — `apps/api/migrations/0003_hubspot_outbox.sql`
Add the two-statement idempotent migration from **Schema Changes** (no embedded
semicolons, no dollar-quoting).

### Step 19 — `apps/api/schema.sql`
Append the `hubspot_outbox` table + partial index (mirror of Step 18) so the
canonical schema stays in sync. Idempotent `IF NOT EXISTS` both places.

### Step 20 — `apps/api/wrangler.jsonc`
Add a `"services"` block binding `HUBSPOT` → service `site-web-hubspot`
(following the `ab-splitter` precedent). Nothing else changes.

### Step 21 — `apps/api/src/index.ts`
- Extend `Bindings` with `HUBSPOT: Fetcher`.
- **Replace the reservation handler's manual `c.req.json()` parsing with the
  `zod-validator` middleware** — satisfying the project Hono rule that route
  handlers must use `zod-validator` middleware and never parse `c.req.json()`
  manually without validation (the `/api/messages` route already follows this
  pattern with `zValidator("json", MessageRequestSchema)`):
  - Rewrite `ReservationRequestSchema` (see "Reservation contract" in API Types)
    so the **schema itself** encodes trimming, empty-string→`null`
    normalization, email-format validation, and `people` default/clamp to 1.
  - Register the middleware in the route chain **after** `rateLimitMiddleware`:
    `zValidator("json", ReservationRequestSchema, reservationHook)`, where
    `reservationHook(result, c)` returns
    `c.json({ error: result.error.issues[0]?.message ?? "Invalid request" }, 400)`
    on `!result.success` — **preserving the exact `400 { error }` shape**. The
    default `zValidator` malformed-JSON path also yields a 400.
  - Read the validated, normalized values with `const data = c.req.valid("json")`
    and pass them straight into the existing INSERT. The `201 { reservation }`
    and `500 { error }` responses are unchanged; the only behavioral change is
    that a malformed `email` now returns `400 { error }`.
- After a successful INSERT, wrap a **single** two-op enqueue
  (`contact.upsert` + `deal.create` with `dedupeKey = "reservation-<id>"`) in
  one `try/catch` inside `c.executionCtx.waitUntil(...)`, calling
  `c.env.HUBSPOT.fetch(new Request("http://hubspot/ops/enqueue", {...}))` per op.
  Any error is swallowed — the reservation response is already returned.

### Step 22 — `.github/workflows/deploy-prod.yml`
Add a `"Deploy HubSpot gateway"` step (`npx wrangler deploy`,
`working-directory: apps/hubspot`) **immediately before** the "Deploy API" step,
so the `HUBSPOT` binding resolves when `apps/api` deploys. Do **not** create a
separate deploy workflow.

### Step 23 — `.github/workflows/ci.yml`
Add `- name: Test (all workspaces)` running `npm test --workspaces --if-present`
in the `verify` job **after** the typecheck step.

### Step 24 — root `package.json`
Add scripts `dev:hubspot` (`npm run dev --workspace apps/hubspot`),
`deploy:hubspot` (`npm run deploy --workspace apps/hubspot`), and a root `test`
(`npm test --workspaces --if-present`). Keep existing scripts intact.

### Step 25 — `.dev.env.example`
Document `HUBSPOT_TOKEN=` and the optional `HUBSPOT_PIPELINE_ID`,
`HUBSPOT_DEALSTAGE_ID`, `HUBSPOT_TIMELINE_EVENT_TEMPLATE_ID`, noting the hubspot
`dev` script loads the same `.dev.env`.

## Acceptance Criteria

1. `npm run typecheck` completes with **0 errors** across every workspace,
   including the new `apps/hubspot`.
2. `npm test --workspaces --if-present` runs the `apps/hubspot` Vitest suite and
   it passes; workspaces without a `test` script are skipped (no failure).
3. `apps/hubspot/wrangler.jsonc` contains **no `routes` key**, contains
   `triggers.crons` equal to `["* * * * *"]`, and `apps/hubspot/src/index.ts`'s
   default export has both a `fetch` and a `scheduled` property.
4. `apps/api/migrations/0003_hubspot_outbox.sql` exists, contains exactly the
   `CREATE TABLE IF NOT EXISTS hubspot_outbox` and `CREATE INDEX IF NOT EXISTS
   hubspot_outbox_due_idx` statements, has **no** embedded semicolons inside a
   statement body and **no** dollar-quoted blocks, and re-running the file
   produces no duplicate-object error.
5. `apps/api/schema.sql` contains the same `hubspot_outbox` table and
   `hubspot_outbox_due_idx` partial index (`WHERE status = 'pending'`).
6. `POST /ops/enqueue` with a valid envelope returns HTTP **202** and a JSON body
   `{ id }`, and a `hubspot_outbox` row with `status='pending'` is inserted.
7. `POST /ops/enqueue` with an invalid envelope (unknown `kind` or payload
   failing its Zod schema) returns a non-2xx `{ ok:false, status, message }` and
   inserts **no** row.
8. `POST /ops/execute` returns `{ ok:true, ... }` on success and, on a HubSpot
   non-2xx, returns `{ ok:false, status, message }` with `status` reflecting the
   upstream status (unit-tested with `fetch` stubbed).
9. `GET /health` returns **200 `{ ok:true }`** when the token and DB checks pass,
   and a non-200 `{ ok:false, status, message }` when the token is missing/invalid
   or the DB is unreachable.
10. The cron drain claims at most 25 due `pending` rows via a single
    `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`
    statement; on success a row becomes `delivered` with `hubspot_id` set.
11. On a transient failure (429/5xx/network) a claimed row stays `pending` with
    `attempts` incremented and `next_attempt_at` in the future (honoring
    `Retry-After` when present); the `computeBackoff` unit test shows the delay
    grows with `attempts`.
12. A claimed row becomes `failed` with `last_error` set on a permanent 4xx, or
    once `attempts >= 8`; failed rows are not re-claimed by `claimBatch`.
13. `POST /api/reservations`'s handler validates input with the `zod-validator`
    middleware (`zValidator("json", ReservationRequestSchema, hook)`) and reads
    data via `c.req.valid("json")` — no manual `c.req.json()` parsing. With a
    valid body it returns **201 `{ reservation }`** with the identical shape as
    before; with a malformed body (missing name/email or invalid email format) it
    returns **400 `{ error }`**, preserving trimming, empty→null normalization,
    and `people` defaulting to 1.
14. A valid reservation triggers exactly two enqueue calls through the `HUBSPOT`
    binding (`contact.upsert` and `deal.create` with `dedupeKey ==
    "reservation-<id>"`), issued inside `c.executionCtx.waitUntil`. When the
    `HUBSPOT` binding throws, the reservation response is still **201** and
    unchanged (verified by stubbing the binding to reject).
15. `.github/workflows/deploy-prod.yml` has a "Deploy HubSpot gateway" step with
    `working-directory: apps/hubspot` positioned immediately before the
    "Deploy API" step; no separate `deploy-hubspot.yml` file is added.
16. `.github/workflows/ci.yml`'s `verify` job runs `npm test --workspaces
    --if-present` after the typecheck step.
17. Root `package.json` exposes `dev:hubspot` and `deploy:hubspot` scripts, and
    `.dev.env.example` documents `HUBSPOT_TOKEN` plus the three optional
    `HUBSPOT_*` vars.
