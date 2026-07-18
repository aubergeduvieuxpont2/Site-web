# Email-Ingest Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Cloudflare Email Worker (`apps/email-ingest`) that receives Airbnb/Expedia booking emails at `bookings@aubergeduvieuxpont.ca`, forwards every original to `aubergeduvieuxpont2@hotmail.com`, parses confirmed bookings, and creates reservations (+ HubSpot sync) through a new internal API endpoint, with an admin-visible ingest log.

**Architecture:** Email Routing → `email()` handler in a route-less Worker → service binding `API` → `POST /internal/ota-bookings` on `site-web-api` (unreachable publicly because the API's routes only cover `/api/*`) → Postgres insert + existing HubSpot outbox enqueue. Deterministic parsers built from real fixtures in `email-reservations-examples/`.

**Tech Stack:** Cloudflare Workers, TypeScript, Hono (API side), Zod, `postal-mime` (MIME parsing in the email worker), Neon Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-email-ingest-design.md` — read it before starting any task.

## Global Constraints

- Work in `/Users/ychasse/Downloads/wt-email-ingest` on branch `feature/email-ingest`. All commands below run from that repo root unless stated otherwise.
- Migrations are idempotent (`IF NOT EXISTS` everywhere) and numbered; ours is `0020_ota_reservations.sql` (0018/0019 already taken).
- The forward destination is `aubergeduvieuxpont2@hotmail.com`; the intake address is `bookings@aubergeduvieuxpont.ca`.
- `email()` handler ordering is a hard rule: `message.forward(...)` FIRST; after a successful forward the handler must never throw.
- Airbnb: only «Réservation confirmée» emails create reservations; pending requests → `ignored`. Airbnb gives no guest email → reservation `email` column stores `''` and ALL HubSpot enqueues are skipped.
- Fixtures are scrubbed: forwarder identity replaced (`isabellemenard24@hotmail.com` → `forwarder@example.com`, names → `Forwarder`), guest names replaced (`Yashwin Singh` → `Jean Tremblay`, `Dominique Sanon` → `Marie Gagnon`), `ychasse01@gmail.com` → `owner@example.com`.
- New web UI must be responsive (no horizontal overflow on mobile; tables scroll inside their own container).
- Run `npm install` once at the start (new workspace deps): `cd /Users/ychasse/Downloads/wt-email-ingest && npm install`.

---

### Task 1: Migration 0020 — OTA columns + email_ingest_log

**Files:**
- Create: `apps/api/migrations/0020_ota_reservations.sql`
- Modify: `apps/api/schema.sql` (append the same objects)

**Interfaces:**
- Produces: `reservations.source TEXT NOT NULL DEFAULT 'website'`, `reservations.external_ref TEXT`, partial unique index `reservations_source_external_ref`, table `email_ingest_log` — used by Tasks 3 and 4.

- [ ] **Step 1: Write the migration**

Create `apps/api/migrations/0020_ota_reservations.sql`:

```sql
-- OTA (Airbnb/Expedia) email-ingest support.
-- source: where the reservation came from ('website' | 'airbnb' | 'expedia').
-- external_ref: the OTA confirmation code / reservation id, used for dedupe.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS reservations_source_external_ref
  ON reservations (source, external_ref)
  WHERE external_ref IS NOT NULL;

-- One row per processed booking-relevant email (parsed | parse_failed | duplicate | ignored).
CREATE TABLE IF NOT EXISTS email_ingest_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT,
  status TEXT NOT NULL,
  reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL,
  subject TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_ingest_log_created_at ON email_ingest_log (created_at DESC);
```

- [ ] **Step 2: Append the same objects to `apps/api/schema.sql`**

Open `apps/api/schema.sql` and append the exact SQL block from Step 1 at the end of the file (with a `-- 0020_ota_reservations` comment header, matching how the file accumulates prior migrations — read the tail of the file and follow its existing comment style).

- [ ] **Step 3: Apply and verify idempotency**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm run db:migrate && npm run db:migrate
```

Expected: both runs succeed (second run proves idempotency). If `.dev.env` is missing, skip this step and note it in the commit message — the migration runs at deploy time.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/0020_ota_reservations.sql apps/api/schema.sql
git commit -m "feat(api): migration 0020 — reservation source/external_ref + email_ingest_log"
```

---

### Task 2: Shared HubSpot ops builder + refactor public reservation route

**Files:**
- Create: `apps/api/src/ota.ts`
- Modify: `apps/api/src/index.ts:305-373` (the `POST /api/reservations` handler)
- Test: `apps/api/test/ota.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (from `apps/api/src/ota.ts`, used by Task 3):
  - `type HubspotOp = { kind: string; payload: Record<string, unknown>; dedupeKey?: string }`
  - `function buildReservationHubspotOps(input: ReservationSyncInput): HubspotOp[]`
  - `type ReservationSyncInput = { reservationId: number; email: string | null; firstName: string; lastName: string | null; checkIn: string | null; checkOut: string | null; room: string | null; guests: number; roomCount: number | null; description: string | null }`
  - `async function enqueueHubspotOps(hubspot: Fetcher, ops: HubspotOp[]): Promise<void>` (never throws)

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/ota.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildReservationHubspotOps, enqueueHubspotOps } from "../src/ota";

describe("buildReservationHubspotOps", () => {
  const base = {
    reservationId: 42,
    email: "guest@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    checkIn: "2026-08-01",
    checkOut: "2026-08-03",
    room: "Refuge du Rider",
    guests: 2,
    roomCount: 1,
    description: "Merci",
  };

  it("builds a contact.upsert and a deduped deal.create", () => {
    const ops = buildReservationHubspotOps(base);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      kind: "contact.upsert",
      payload: { email: "guest@example.com", firstname: "Ada", lastname: "Lovelace" },
    });
    expect(ops[1].kind).toBe("deal.create");
    expect(ops[1].dedupeKey).toBe("reservation-42");
    expect(ops[1].payload).toEqual({
      contactEmail: "guest@example.com",
      dealname: "Reservation #42",
      arrive: "2026-08-01",
      depart: "2026-08-03",
      room: "Refuge du Rider",
      people: 2,
      roomCount: 1,
      description: "Merci",
    });
  });

  it("omits null optional fields from the deal payload", () => {
    const ops = buildReservationHubspotOps({
      ...base,
      checkIn: null,
      checkOut: null,
      room: null,
      description: null,
      roomCount: null,
    });
    expect(ops[1].payload).toEqual({
      contactEmail: "guest@example.com",
      dealname: "Reservation #42",
      people: 2,
    });
  });

  it("returns no ops when there is no guest email (Airbnb case)", () => {
    expect(buildReservationHubspotOps({ ...base, email: null })).toEqual([]);
    expect(buildReservationHubspotOps({ ...base, email: "" })).toEqual([]);
  });
});

describe("enqueueHubspotOps", () => {
  it("POSTs each op to /ops/enqueue on the binding", async () => {
    const calls: Request[] = [];
    const fetcher = { fetch: vi.fn(async (req: Request) => { calls.push(req); return new Response("{}", { status: 202 }); }) } as any;
    await enqueueHubspotOps(fetcher, buildReservationHubspotOps({
      reservationId: 1, email: "a@b.co", firstName: "A", lastName: null,
      checkIn: null, checkOut: null, room: null, guests: 1, roomCount: 1, description: null,
    }));
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("http://hubspot/ops/enqueue");
    expect(calls[0].method).toBe("POST");
    const body = await calls[0].json();
    expect(body.kind).toBe("contact.upsert");
  });

  it("swallows fetch errors", async () => {
    const fetcher = { fetch: vi.fn(async () => { throw new Error("down"); }) } as any;
    await expect(
      enqueueHubspotOps(fetcher, [{ kind: "contact.upsert", payload: { email: "a@b.co" } }]),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/ota.test.ts
```

Expected: FAIL — `Cannot find module '../src/ota'`.

- [ ] **Step 3: Implement `apps/api/src/ota.ts`**

```ts
/**
 * OTA (Airbnb/Expedia) email-ingest support shared by the public reservation
 * route and the internal /internal/ota-bookings endpoint.
 */

export type HubspotOp = {
  kind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
};

export type ReservationSyncInput = {
  reservationId: number;
  email: string | null;
  firstName: string;
  lastName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  room: string | null;
  guests: number;
  roomCount: number | null;
  description: string | null;
};

// A reservation with no usable guest email (Airbnb confirmations carry none)
// has nothing to sync: contact.upsert needs an email and deal.create resolves
// its contact by email.
export function buildReservationHubspotOps(input: ReservationSyncInput): HubspotOp[] {
  if (!input.email) return [];
  const deal: Record<string, unknown> = {
    contactEmail: input.email,
    dealname: `Reservation #${input.reservationId}`,
  };
  if (input.checkIn) deal.arrive = input.checkIn;
  if (input.checkOut) deal.depart = input.checkOut;
  if (input.room) deal.room = input.room;
  if (input.guests) deal.people = input.guests;
  if (input.roomCount != null) deal.roomCount = input.roomCount;
  if (input.description) deal.description = input.description;
  return [
    {
      kind: "contact.upsert",
      payload: {
        email: input.email,
        firstname: input.firstName,
        ...(input.lastName ? { lastname: input.lastName } : {}),
      },
    },
    { kind: "deal.create", payload: deal, dedupeKey: `reservation-${input.reservationId}` },
  ];
}

export async function enqueueHubspotOps(hubspot: Fetcher, ops: HubspotOp[]): Promise<void> {
  try {
    for (const op of ops) {
      await hubspot.fetch(
        new Request("http://hubspot/ops/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op),
        }),
      );
    }
  } catch {
    // Best-effort, same policy as the existing reservation route: HubSpot
    // delivery failures must never fail the booking.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/ota.test.ts
```

Expected: PASS (all 5).

- [ ] **Step 5: Refactor `POST /api/reservations` to use the helpers**

In `apps/api/src/index.ts`, add to the imports near the other `./` imports:

```ts
import { buildReservationHubspotOps, enqueueHubspotOps } from "./ota";
```

Then replace the entire `c.executionCtx.waitUntil(...)` block inside the `POST /api/reservations` handler (currently lines ~328-369, the block with two inline `c.env.HUBSPOT.fetch` calls) with:

```ts
    c.executionCtx.waitUntil(
      enqueueHubspotOps(
        c.env.HUBSPOT,
        buildReservationHubspotOps({
          reservationId: created.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          checkIn: data.checkIn,
          checkOut: data.checkOut,
          room: data.room,
          guests: data.guests,
          roomCount: data.roomCount,
          description: data.message,
        }),
      )
    );
```

- [ ] **Step 6: Run the full API test suite + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

Expected: all existing tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ota.ts apps/api/src/index.ts apps/api/test/ota.test.ts
git commit -m "refactor(api): extract reservation HubSpot enqueue into shared ota helpers"
```

---

### Task 3: Internal endpoint `POST /internal/ota-bookings`

**Files:**
- Modify: `apps/api/src/ota.ts` (add schemas)
- Modify: `apps/api/src/index.ts` (add route just after the `POST /api/reservations` handler)
- Test: `apps/api/test/ota.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 columns/table, Task 2 helpers, `reservationDatesValid` from `apps/api/src/assignments.ts`.
- Produces (used by Task 8's worker): endpoint contract —
  - Body `{ status: "parsed", source: "airbnb"|"expedia", externalRef, subject?, firstName, lastName?, guestEmail?, phone?, checkIn: "YYYY-MM-DD", checkOut: "YYYY-MM-DD", guests?, listingName? }` → 201 `{ reservationId }`, or 200 `{ ok, duplicate: true }`.
  - Body `{ status: "parse_failed"|"ignored", provider, subject?, error? }` → 202 `{ ok: true }`.
  - Invalid body → 400 `{ error }`.
- Produces (from `ota.ts`, used by tests): `OtaParsedSchema`, `OtaFailureSchema`.

- [ ] **Step 1: Write the failing schema tests**

Append to `apps/api/test/ota.test.ts`:

```ts
import { OtaParsedSchema, OtaFailureSchema } from "../src/ota";

describe("OtaParsedSchema", () => {
  const parsed = {
    status: "parsed",
    source: "expedia",
    externalRef: "2511634261",
    subject: "Expedia - New Booking - Arriving on 5 Sep 2026",
    firstName: "Marie",
    lastName: "Gagnon",
    guestEmail: "abc@m.expediapartnercentral.com",
    phone: "1 1111111111",
    checkIn: "2026-09-05",
    checkOut: "2026-09-06",
    guests: 2,
    listingName: "Economy Double Room, River View - Standard",
  };

  it("accepts a full Expedia payload", () => {
    const r = OtaParsedSchema.safeParse(parsed);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guestEmail).toBe("abc@m.expediapartnercentral.com");
  });

  it("accepts an Airbnb payload without email/phone/lastName", () => {
    const r = OtaParsedSchema.safeParse({
      status: "parsed",
      source: "airbnb",
      externalRef: "HM45MDTHZ4",
      firstName: "Jean",
      checkIn: "2026-07-30",
      checkOut: "2026-07-31",
      guests: 2,
      listingName: "Auberge du vieux pont",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guestEmail).toBeNull();
      expect(r.data.lastName).toBeNull();
      expect(r.data.subject).toBe("");
    }
  });

  it("rejects checkOut on or before checkIn", () => {
    expect(OtaParsedSchema.safeParse({ ...parsed, checkOut: "2026-09-05" }).success).toBe(false);
    expect(OtaParsedSchema.safeParse({ ...parsed, checkOut: "2026-09-04" }).success).toBe(false);
  });

  it("rejects a malformed date and a missing externalRef", () => {
    expect(OtaParsedSchema.safeParse({ ...parsed, checkIn: "Sep 5, 2026" }).success).toBe(false);
    expect(OtaParsedSchema.safeParse({ ...parsed, externalRef: " " }).success).toBe(false);
  });

  it("defaults invalid guests to 1", () => {
    const r = OtaParsedSchema.safeParse({ ...parsed, guests: "abc" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.guests).toBe(1);
  });
});

describe("OtaFailureSchema", () => {
  it("accepts parse_failed and ignored reports", () => {
    expect(
      OtaFailureSchema.safeParse({ status: "parse_failed", provider: "airbnb", subject: "x", error: "no code" }).success,
    ).toBe(true);
    const r = OtaFailureSchema.safeParse({ status: "ignored", provider: "expedia" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.subject).toBe("");
      expect(r.data.error).toBeNull();
    }
  });

  it("rejects an unknown provider", () => {
    expect(OtaFailureSchema.safeParse({ status: "ignored", provider: "booking.com" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/ota.test.ts
```

Expected: FAIL — `OtaParsedSchema` is not exported.

- [ ] **Step 3: Add the schemas to `apps/api/src/ota.ts`**

Add at the top:

```ts
import { z } from "zod";
import { reservationDatesValid } from "./assignments";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const trimToNull = z
  .string()
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  });

export const OtaParsedSchema = z
  .object({
    status: z.literal("parsed"),
    source: z.enum(["airbnb", "expedia"]),
    externalRef: z.string().trim().min(1),
    subject: z.string().optional().default(""),
    firstName: z.string().trim().min(1),
    lastName: trimToNull,
    guestEmail: z.string().trim().email().nullish().transform((v) => v ?? null),
    phone: trimToNull,
    checkIn: z.string().regex(DATE_RE),
    checkOut: z.string().regex(DATE_RE),
    guests: z.coerce.number().int().min(1).catch(1),
    listingName: trimToNull,
  })
  .superRefine((d, ctx) => {
    if (!reservationDatesValid(d.checkIn, d.checkOut)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message: "checkOut must be after checkIn",
      });
    }
  });

export const OtaFailureSchema = z.object({
  status: z.enum(["parse_failed", "ignored"]),
  provider: z.enum(["airbnb", "expedia"]),
  subject: z.string().optional().default(""),
  error: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

export type OtaParsed = z.infer<typeof OtaParsedSchema>;
```

- [ ] **Step 4: Run to verify the schema tests pass**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/ota.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add the route to `apps/api/src/index.ts`**

Extend the ota import line to:

```ts
import {
  buildReservationHubspotOps,
  enqueueHubspotOps,
  OtaParsedSchema,
  OtaFailureSchema,
} from "./ota";
```

Insert directly AFTER the closing `);` of the `POST /api/reservations` handler:

```ts
// Internal endpoint for the email-ingest Worker (service binding only).
// Not under /api/* on purpose: the Worker's routes only cover /api/*, so this
// path is unreachable from the internet — same isolation model as the
// route-less HubSpot gateway.
app.post("/internal/ota-bookings", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const status = (raw as { status?: unknown } | null)?.status;
  const sql = neon(c.env.DB_CONN);

  if (status === "parse_failed" || status === "ignored") {
    const parsed = OtaFailureSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    }
    const d = parsed.data;
    await sql`
      INSERT INTO email_ingest_log (provider, status, subject, error)
      VALUES (${d.provider}, ${d.status}, ${d.subject}, ${d.error})
    `;
    return c.json({ ok: true }, 202);
  }

  const parsed = OtaParsedSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  }
  const d = parsed.data;
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ");
  const providerLabel = d.source === "airbnb" ? "Airbnb" : "Expedia";
  const message = `Réservation ${providerLabel} #${d.externalRef}`;

  // ON CONFLICT against the partial unique index dedupes resent confirmations.
  const rows = (await sql`
    INSERT INTO reservations (name, first_name, last_name, email, phone, room, arrive, depart, people, room_count, message, source, external_ref)
    VALUES (${name}, ${d.firstName}, ${d.lastName}, ${d.guestEmail ?? ""}, ${d.phone}, ${d.listingName}, ${d.checkIn}, ${d.checkOut}, ${d.guests}, 1, ${message}, ${d.source}, ${d.externalRef})
    ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
    RETURNING id
  `) as { id: number }[];

  const created = rows[0];
  if (!created) {
    await sql`
      INSERT INTO email_ingest_log (provider, status, subject)
      VALUES (${d.source}, 'duplicate', ${d.subject})
    `;
    return c.json({ ok: true, duplicate: true }, 200);
  }

  await sql`
    INSERT INTO email_ingest_log (provider, status, reservation_id, subject)
    VALUES (${d.source}, 'parsed', ${created.id}, ${d.subject})
  `;

  c.executionCtx.waitUntil(
    enqueueHubspotOps(
      c.env.HUBSPOT,
      buildReservationHubspotOps({
        reservationId: created.id,
        email: d.guestEmail,
        firstName: d.firstName,
        lastName: d.lastName,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        room: d.listingName,
        guests: d.guests,
        roomCount: 1,
        description: message,
      }),
    )
  );

  return c.json({ reservationId: created.id }, 201);
});
```

- [ ] **Step 6: Full suite + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ota.ts apps/api/src/index.ts apps/api/test/ota.test.ts
git commit -m "feat(api): internal /internal/ota-bookings endpoint with dedupe + ingest log"
```

---

### Task 4: Admin endpoint `GET /api/admin/email-ingest`

**Files:**
- Modify: `apps/api/src/index.ts` (add route next to `GET /api/admin/outbox`, ~line 664)

**Interfaces:**
- Produces (used by Task 9): `GET /api/admin/email-ingest` → 200 `{ rows: EmailIngestRow[] }` where a row is `{ id, provider, status, reservation_id, subject, error, created_at }`; 401/403 like other admin routes.

- [ ] **Step 1: Add the route**

In `apps/api/src/index.ts`, after the `GET /api/admin/outbox` handler's closing `});`, add:

```ts
type EmailIngestLogRow = {
  id: number;
  provider: string | null;
  status: string;
  reservation_id: number | null;
  subject: string | null;
  error: string | null;
  created_at: string;
};

app.get("/api/admin/email-ingest", async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sql = neon(c.env.DB_CONN);
  const rows = (await sql`
    SELECT id, provider, status, reservation_id, subject, error, created_at
    FROM email_ingest_log
    ORDER BY created_at DESC
    LIMIT 100
  `) as EmailIngestLogRow[];

  return c.json({ rows });
});
```

- [ ] **Step 2: Suite + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

Expected: PASS (this route follows the manually-gated pattern of the neighbouring admin routes, which have no route-level tests; gating logic itself is covered by `test/admin-gating.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): admin email-ingest log endpoint"
```

---

### Task 5: Scaffold `apps/email-ingest` + classify + htmlToText

**Files:**
- Create: `apps/email-ingest/package.json`, `apps/email-ingest/tsconfig.json`, `apps/email-ingest/vitest.config.ts`, `apps/email-ingest/wrangler.jsonc`, `apps/email-ingest/src/types.ts`, `apps/email-ingest/src/classify.ts`, `apps/email-ingest/src/htmlToText.ts`
- Test: `apps/email-ingest/test/classify.test.ts`, `apps/email-ingest/test/htmlToText.test.ts`

**Interfaces:**
- Produces (used by Tasks 6-8):
  - `type Classification = { kind: "booking"; provider: "airbnb" | "expedia" } | { kind: "ignored"; provider: "airbnb" | "expedia"; reason: string } | { kind: "unknown" }`
  - `function classify(fromAddress: string, subject: string): Classification`
  - `function htmlToText(html: string): string`
  - `type Env = { API: Fetcher; FORWARD_TO: string }`

- [ ] **Step 1: Scaffold config files**

`apps/email-ingest/package.json`:

```json
{
  "name": "@site-web/email-ingest",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "cf-typegen": "wrangler types",
    "test": "vitest run"
  },
  "dependencies": {
    "postal-mime": "^2.3.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250607.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8",
    "wrangler": "^4.19.1"
  }
}
```

`apps/email-ingest/tsconfig.json` — copy `apps/hubspot/tsconfig.json` verbatim (same compiler options, `include: ["src/**/*.ts", "test/**/*.ts"]`).

`apps/email-ingest/vitest.config.ts` — copy `apps/hubspot/vitest.config.ts` verbatim (`globals: true`, `environment: "node"`).

`apps/email-ingest/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "site-web-email-ingest",
  "main": "src/index.ts",
  "compatibility_date": "2025-06-16",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },

  // Email-ingest Worker — receives bookings@aubergeduvieuxpont.ca via a
  // Cloudflare Email Routing rule (configured in the dashboard, see README).
  // No HTTP routes: the only entry point is the email() handler.

  // Every message is forwarded here before parsing. The address must be a
  // VERIFIED Email Routing destination on the zone or forward() rejects.
  "vars": { "FORWARD_TO": "aubergeduvieuxpont2@hotmail.com" },

  "services": [{ "binding": "API", "service": "site-web-api" }]
}
```

`apps/email-ingest/src/types.ts`:

```ts
export type Env = {
  API: Fetcher;
  FORWARD_TO: string;
};
```

- [ ] **Step 2: Install workspace deps**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm install
```

Expected: succeeds, `postal-mime` appears in `node_modules`.

- [ ] **Step 3: Write the failing classify tests**

`apps/email-ingest/test/classify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classify } from "../src/classify";

describe("classify", () => {
  it("recognizes an Airbnb confirmation as a booking", () => {
    expect(
      classify("automated@airbnb.com", "Réservation confirmée : Jean Tremblay arrive le 30 juil."),
    ).toEqual({ kind: "booking", provider: "airbnb" });
  });

  it("tolerates a forward prefix in the subject", () => {
    expect(
      classify("automated@airbnb.com", "FW: Réservation confirmée : Jean Tremblay arrive le 30 juil."),
    ).toEqual({ kind: "booking", provider: "airbnb" });
  });

  it("ignores an Airbnb pending request", () => {
    const c = classify(
      "automated@airbnb.com",
      "En attente : demande de réservation concernant l'annonce Auberge du vieux pont pour 30–31 juil. 2026",
    );
    expect(c.kind).toBe("ignored");
    if (c.kind === "ignored") expect(c.provider).toBe("airbnb");
  });

  it("recognizes an Expedia new booking", () => {
    expect(classify("booknotif@expedia.com", "Expedia - New Booking - Arriving on 5 Sep 2026")).toEqual({
      kind: "booking",
      provider: "expedia",
    });
  });

  it("ignores Expedia modifications/cancellations", () => {
    expect(classify("booknotif@expedia.com", "Expedia - Cancelled Booking - 2511634261").kind).toBe("ignored");
    expect(classify("booknotif@expedia.com", "Expedia - Modified Booking - 2511634261").kind).toBe("ignored");
  });

  it("matches expediagroup.com and subdomain senders", () => {
    expect(classify("booknotif@mail.expediagroup.com", "Expedia - New Booking - Arriving on 5 Sep 2026").kind).toBe(
      "booking",
    );
    expect(classify("express@mail.airbnb.com", "Réservation confirmée : X arrive le 1 août").kind).toBe("booking");
  });

  it("returns unknown for anything else, including lookalike domains", () => {
    expect(classify("newsletter@example.com", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
    expect(classify("automated@airbnb.com.evil.io", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
    expect(classify("notairbnb.com@gmail.com", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/classify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `apps/email-ingest/src/classify.ts`**

```ts
export type Classification =
  | { kind: "booking"; provider: "airbnb" | "expedia" }
  | { kind: "ignored"; provider: "airbnb" | "expedia"; reason: string }
  | { kind: "unknown" };

// Anchored on the end of the address so lookalike domains
// (airbnb.com.evil.io) and local-part tricks don't match.
const AIRBNB_SENDER = /@(?:[a-z0-9-]+\.)*airbnb\.(?:com|ca)$/;
const EXPEDIA_SENDER = /@(?:[a-z0-9-]+\.)*(?:expedia|expediagroup|expediamail|expediapartnercentral)\.com$/;

export function classify(fromAddress: string, subject: string): Classification {
  const addr = fromAddress.trim().toLowerCase();
  const subj = subject.normalize("NFC");

  if (AIRBNB_SENDER.test(addr)) {
    if (/réservation confirmée/i.test(subj)) return { kind: "booking", provider: "airbnb" };
    return { kind: "ignored", provider: "airbnb", reason: subj.trim() || "non-booking airbnb email" };
  }
  if (EXPEDIA_SENDER.test(addr)) {
    if (/new booking/i.test(subj)) return { kind: "booking", provider: "expedia" };
    return { kind: "ignored", provider: "expedia", reason: subj.trim() || "non-booking expedia email" };
  }
  return { kind: "unknown" };
}
```

- [ ] **Step 6: Run classify tests**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/classify.test.ts
```

Expected: PASS.

- [ ] **Step 7: Write the failing htmlToText tests**

`apps/email-ingest/test/htmlToText.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { htmlToText } from "../src/htmlToText";

describe("htmlToText", () => {
  it("strips tags, keeps block boundaries as newlines", () => {
    const text = htmlToText("<div><p>Code de confirmation</p><p>HM45MDTHZ4</p></div>");
    expect(text).toContain("Code de confirmation\n");
    expect(text).toContain("HM45MDTHZ4");
    expect(text).not.toContain("<");
  });

  it("drops style/script content entirely", () => {
    const text = htmlToText("<style>.a{color:red}</style><script>var x=1;</script><p>Arrivée</p>");
    expect(text).not.toContain("color");
    expect(text).not.toContain("var x");
    expect(text).toContain("Arrivée");
  });

  it("decodes common and numeric entities", () => {
    expect(htmlToText("<p>D&eacute;part &amp; Arriv&#233;e&nbsp;!</p>")).toContain("Départ & Arrivée !");
  });

  it("converts <br> and table cells to line breaks", () => {
    const text = htmlToText("<td>Check-In</td><td>Sep 5, 2026</td><br>next");
    expect(text).toMatch(/Check-In\s*\n/);
    expect(text).toMatch(/Sep 5, 2026\s*\n/);
  });
});
```

- [ ] **Step 8: Run to verify failure, then implement `apps/email-ingest/src/htmlToText.ts`**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/htmlToText.test.ts
```

Expected: FAIL. Then:

```ts
/**
 * Minimal HTML→text for OTA notification emails: enough structure (line
 * breaks at block boundaries) for the line-oriented parsers, no DOM needed.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  icirc: "î",
  ecirc: "ê",
  acirc: "â",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|td|th|tr|li|h[1-6]|table|section|header|footer)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

- [ ] **Step 9: Run both test files + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npm test && npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/email-ingest package-lock.json
git commit -m "feat(email-ingest): scaffold worker — classify senders, htmlToText"
```

---

### Task 6: Fixtures + Airbnb parser

**Files:**
- Create: `apps/email-ingest/test/fixtures/` (5 files, generated by script below)
- Create: `apps/email-ingest/src/parsers/types.ts`, `apps/email-ingest/src/parsers/airbnb.ts`
- Test: `apps/email-ingest/test/airbnb.test.ts`

**Interfaces:**
- Consumes: `htmlToText` (Task 5).
- Produces (used by Tasks 7-8, mirrors the Task 3 endpoint contract):

```ts
export type ParsedBooking = {
  source: "airbnb" | "expedia";
  externalRef: string;
  firstName: string;
  lastName: string | null;
  guestEmail: string | null;
  phone: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  listingName: string | null;
};
```

  - `function parseAirbnb(bodyText: string, subject: string, sentAt: Date): ParsedBooking | null`

- [ ] **Step 1: Generate scrubbed fixtures from the real samples**

The raw samples live in the PRIMARY checkout at `/Users/ychasse/Downloads/Site-web/email-reservations-examples/` (untracked). Run:

```bash
mkdir -p /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest/test/fixtures
python3 - <<'EOF'
import email, email.policy, pathlib

SRC = pathlib.Path("/Users/ychasse/Downloads/Site-web/email-reservations-examples")
DST = pathlib.Path("/Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest/test/fixtures")

SCRUB = [
    ("isabellemenard24@hotmail.com", "forwarder@example.com"),
    ("isabelle ménard", "Forwarder"),
    ("Isabelle Ménard", "Forwarder"),
    ("ychasse01@gmail.com", "owner@example.com"),
    ("Yashwin Singh", "Jean Tremblay"),
    ("Yashwin", "Jean"),
    ("Dominique Sanon", "Marie Gagnon"),
]

def scrub(s):
    for a, b in SCRUB:
        s = s.replace(a, b)
    return s

FILES = {
    "Airbnb_reservation_confirmation.eml": "airbnb-confirmation",
    "Airbnb.eml": "airbnb-request",
    "Expedia.eml": "expedia-new-booking",
}
for src_name, base in FILES.items():
    msg = email.message_from_bytes((SRC / src_name).read_bytes(), policy=email.policy.default)
    for part in msg.walk():
        if part.is_multipart():
            continue
        ct = part.get_content_type()
        if ct == "text/plain":
            (DST / f"{base}.txt").write_text(scrub(part.get_content()))
        elif ct == "html" or ct == "text/html":
            if base != "airbnb-request":  # request fixture: text only, it's just an "ignored" case
                (DST / f"{base}.html").write_text(scrub(part.get_content()))
print(sorted(p.name for p in DST.iterdir()))
EOF
```

Expected output: `['airbnb-confirmation.html', 'airbnb-confirmation.txt', 'airbnb-request.txt', 'expedia-new-booking.html', 'expedia-new-booking.txt']`

Then verify no personal data survived:

```bash
grep -ril "isabelle\|ychasse\|yashwin\|sanon" /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest/test/fixtures/ || echo CLEAN
```

Expected: `CLEAN`.

- [ ] **Step 2: Create `apps/email-ingest/src/parsers/types.ts`**

```ts
export type ParsedBooking = {
  source: "airbnb" | "expedia";
  externalRef: string;
  firstName: string;
  lastName: string | null;
  guestEmail: string | null;
  phone: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  listingName: string | null;
};
```

- [ ] **Step 3: Write the failing Airbnb parser tests**

`apps/email-ingest/test/airbnb.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAirbnb } from "../src/parsers/airbnb";
import { htmlToText } from "../src/htmlToText";

const FIXTURES = join(__dirname, "fixtures");
const text = readFileSync(join(FIXTURES, "airbnb-confirmation.txt"), "utf8");
const html = readFileSync(join(FIXTURES, "airbnb-confirmation.html"), "utf8");
// Subject of the direct (unforwarded) Airbnb email:
const SUBJECT = "Réservation confirmée : Jean Tremblay arrive le 30 juil.";
// The fixture email was forwarded on 2026-07-17; year inference works from this.
const SENT_AT = new Date("2026-07-17T14:13:00Z");

describe("parseAirbnb", () => {
  it("parses the confirmation fixture (text part)", () => {
    const b = parseAirbnb(text, SUBJECT, SENT_AT);
    expect(b).toEqual({
      source: "airbnb",
      externalRef: "HM45MDTHZ4",
      firstName: "Jean",
      lastName: "Tremblay",
      guestEmail: null,
      phone: null,
      checkIn: "2026-07-30",
      checkOut: "2026-07-31",
      guests: 2,
      listingName: "Auberge du vieux pont",
    });
  });

  it("parses the same booking from the HTML part via htmlToText", () => {
    const b = parseAirbnb(htmlToText(html), SUBJECT, SENT_AT);
    expect(b).not.toBeNull();
    expect(b!.externalRef).toBe("HM45MDTHZ4");
    expect(b!.checkIn).toBe("2026-07-30");
    expect(b!.checkOut).toBe("2026-07-31");
    expect(b!.guests).toBe(2);
  });

  it("tolerates a FW: prefix on the subject", () => {
    const b = parseAirbnb(text, "FW: " + SUBJECT, SENT_AT);
    expect(b!.firstName).toBe("Jean");
    expect(b!.lastName).toBe("Tremblay");
  });

  it("handles a single-word guest name", () => {
    const b = parseAirbnb(text, "Réservation confirmée : Jean arrive le 30 juil.", SENT_AT);
    expect(b!.firstName).toBe("Jean");
    expect(b!.lastName).toBeNull();
  });

  it("rolls the year over when the stay crosses New Year", () => {
    const snippet = [
      "Arrivée",
      "",
      "lun. 28 déc.",
      "",
      "16:00",
      "Départ",
      "",
      "sam. 2 janv.",
      "",
      "10:00",
      "Voyageurs",
      "",
      "3 adultes",
      "",
      "Code de confirmation",
      "",
      "HMAAAA1111",
    ].join("\n");
    const b = parseAirbnb(snippet, "Réservation confirmée : Ada L arrive le 28 déc.", new Date("2026-12-20T00:00:00Z"));
    expect(b!.checkIn).toBe("2026-12-28");
    expect(b!.checkOut).toBe("2027-01-02");
  });

  it("infers next year when arrival month already passed", () => {
    const snippet = [
      "Arrivée",
      "",
      "mar. 3 févr.",
      "",
      "Départ",
      "",
      "jeu. 5 févr.",
      "",
      "Voyageurs",
      "",
      "1 adulte",
      "",
      "Code de confirmation",
      "",
      "HMBBBB2222",
    ].join("\n");
    const b = parseAirbnb(snippet, "Réservation confirmée : Ada L arrive le 3 févr.", new Date("2026-07-17T00:00:00Z"));
    expect(b!.checkIn).toBe("2027-02-03");
    expect(b!.checkOut).toBe("2027-02-05");
  });

  it("returns null when the confirmation code is missing", () => {
    expect(parseAirbnb("Arrivée\njeu. 30 juil.\nDépart\nven. 31 juil.", SUBJECT, SENT_AT)).toBeNull();
  });

  it("returns null when dates are missing", () => {
    expect(parseAirbnb("Code de confirmation\nHM45MDTHZ4", SUBJECT, SENT_AT)).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/airbnb.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `apps/email-ingest/src/parsers/airbnb.ts`**

```ts
import type { ParsedBooking } from "./types";

// Airbnb host-notification emails are in the host account's language (French
// here). Dates carry no year anywhere ("jeu. 30 juil.") — infer it from the
// email's sent date: the next occurrence of that day/month.
const FR_MONTHS: Record<string, number> = {
  janv: 1,
  févr: 2,
  fevr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8,
  aout: 8,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
  dec: 12,
};
const MONTH_ALT = Object.keys(FR_MONTHS).join("|");

// "jeu. 30 juil." / "1er août" — day number then month token.
const DATE_TOKEN = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTH_ALT})\\.?`, "iu");

function findDate(bodyText: string, label: string): { day: number; month: number } | null {
  // The label ("Arrivée"/"Départ") is followed (possibly across blank lines
  // and a weekday abbreviation) by the date token.
  const section = new RegExp(`${label}\\s*\\n+\\s*(?:[a-zéû]+\\.?\\s+)?${DATE_TOKEN.source}`, "iu");
  const m = bodyText.match(section);
  if (!m) return null;
  const month = FR_MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return { day: parseInt(m[1], 10), month };
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseAirbnb(bodyText: string, subject: string, sentAt: Date): ParsedBooking | null {
  const subj = subject.normalize("NFC");
  const body = bodyText.normalize("NFC");

  // Guest name from the subject: "Réservation confirmée : Jean Tremblay arrive le 30 juil."
  const nameMatch = subj.match(/réservation confirmée\s*:\s*(.+?)\s+arrive\b/i);
  if (!nameMatch) return null;
  const nameParts = nameMatch[1].trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  // Confirmation code: dedicated section, else any reservation-details URL.
  const code =
    body.match(/code de confirmation\s*\n+\s*([A-Z0-9]{8,12})\b/i)?.[1] ??
    body.match(/reservations\/details\/([A-Z0-9]{8,12})\b/i)?.[1] ??
    null;
  if (!code) return null;

  const arrive = findDate(body, "Arrivée");
  const depart = findDate(body, "Départ");
  if (!arrive || !depart) return null;

  // Year inference: candidate in the sent year; if that day/month is already
  // past at send time, it's next year. checkOut before checkIn rolls again.
  const sentY = sentAt.getUTCFullYear();
  const sentOrd = (sentAt.getUTCMonth() + 1) * 100 + sentAt.getUTCDate();
  let inY = sentY;
  if (arrive.month * 100 + arrive.day < sentOrd) inY++;
  let outY = inY;
  if (depart.month * 100 + depart.day < arrive.month * 100 + arrive.day) outY++;

  const guests = parseInt(body.match(/(\d+)\s+(?:adultes?|voyageurs?)\b/i)?.[1] ?? "1", 10) || 1;

  // Listing name: the line right before the "Chambre" room-type line.
  const listing = body.match(/([^\n\[\]<>]{3,80})\n+Chambre\b/)?.[1]?.trim() ?? null;

  return {
    source: "airbnb",
    externalRef: code.toUpperCase(),
    firstName,
    lastName,
    guestEmail: null,
    phone: null,
    checkIn: toIso(inY, arrive.month, arrive.day),
    checkOut: toIso(outY, depart.month, depart.day),
    guests,
    listingName: listing,
  };
}
```

- [ ] **Step 6: Run tests until green**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/airbnb.test.ts
```

Expected: PASS. If the fixture assertions fail, debug against the actual fixture content (print the regex context) — adjust the REGEXES, not the fixture, and keep the synthetic-snippet tests passing.

- [ ] **Step 7: Full workspace suite + typecheck, then commit**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npm test && npm run typecheck
git add apps/email-ingest/test/fixtures apps/email-ingest/src/parsers apps/email-ingest/test/airbnb.test.ts
git commit -m "feat(email-ingest): Airbnb confirmation parser + scrubbed real fixtures"
```

---

### Task 7: Expedia parser

**Files:**
- Create: `apps/email-ingest/src/parsers/expedia.ts`
- Test: `apps/email-ingest/test/expedia.test.ts`

**Interfaces:**
- Consumes: `ParsedBooking` (Task 6), fixtures (Task 6), `htmlToText` (Task 5).
- Produces (used by Task 8): `function parseExpedia(bodyText: string, subject: string): ParsedBooking | null`

- [ ] **Step 1: Write the failing tests**

`apps/email-ingest/test/expedia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseExpedia } from "../src/parsers/expedia";
import { htmlToText } from "../src/htmlToText";

const FIXTURES = join(__dirname, "fixtures");
const text = readFileSync(join(FIXTURES, "expedia-new-booking.txt"), "utf8");
const html = readFileSync(join(FIXTURES, "expedia-new-booking.html"), "utf8");
const SUBJECT = "Expedia - New Booking - Arriving on 5 Sep 2026";

describe("parseExpedia", () => {
  it("parses the new-booking fixture (text part)", () => {
    const b = parseExpedia(text, SUBJECT);
    expect(b).toEqual({
      source: "expedia",
      externalRef: "2511634261",
      firstName: "Marie",
      lastName: "Gagnon",
      guestEmail: "ntvrowuydj@m.expediapartnercentral.com",
      phone: "1 1111111111",
      checkIn: "2026-09-05",
      checkOut: "2026-09-06",
      guests: 2,
      listingName: "Economy Double Room, River View - Standard",
    });
  });

  it("parses the HTML part via htmlToText to the same reservation", () => {
    const b = parseExpedia(htmlToText(html), SUBJECT);
    expect(b).not.toBeNull();
    expect(b!.externalRef).toBe("2511634261");
    expect(b!.checkIn).toBe("2026-09-05");
    expect(b!.checkOut).toBe("2026-09-06");
    expect(b!.guestEmail).toBe("ntvrowuydj@m.expediapartnercentral.com");
  });

  it("adds kids to the guest count", () => {
    const modified = text.replace(/2\s+0\s+1\n/, "2       2       1\n");
    const b = parseExpedia(modified, SUBJECT);
    expect(b!.guests).toBe(4);
  });

  it("survives a missing phone / guest email", () => {
    const noEmail = text.replace(/Guest Email:.*\n/, "");
    const b = parseExpedia(noEmail, SUBJECT);
    expect(b).not.toBeNull();
    expect(b!.guestEmail).toBeNull();
  });

  it("returns null without a Reservation ID", () => {
    expect(parseExpedia(text.replace(/Reservation ID:\s*\d+/i, ""), SUBJECT)).toBeNull();
  });

  it("returns null without the check-in/check-out row", () => {
    expect(parseExpedia("Reservation ID: 99\nGuest: A B", SUBJECT)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/expedia.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/email-ingest/src/parsers/expedia.ts`**

```ts
import type { ParsedBooking } from "./types";

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "Sep 5, 2026"
const EN_DATE = /([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/;

function isoFrom(mon: string, day: string, year: string): string | null {
  const month = EN_MONTHS[mon.toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseExpedia(bodyText: string, _subject: string): ParsedBooking | null {
  const body = bodyText.normalize("NFC");

  const id = body.match(/Reservation ID:?\s*(\d{6,})/i)?.[1] ?? null;
  if (!id) return null;

  // "Guest: Marie Gagnon  Booked on: ..." — name runs until a double space,
  // a "Booked on" label, or end of line.
  const guest = body.match(/Guest:\s*([^\n]+?)(?:\s{2,}|\s+Booked on\b|\n|$)/i)?.[1]?.trim() ?? null;
  if (!guest) return null;
  const nameParts = guest.split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  // The row under the Check-In/Check-Out/Adults/Kids header:
  // "Sep 5, 2026     Sep 6, 2026     2       0       1"
  const row = body.match(
    new RegExp(`${EN_DATE.source}\\s+${EN_DATE.source}\\s+(\\d+)\\s+(\\d+)`),
  );
  if (!row) return null;
  const checkIn = isoFrom(row[1], row[2], row[3]);
  const checkOut = isoFrom(row[4], row[5], row[6]);
  if (!checkIn || !checkOut) return null;
  const guests = (parseInt(row[7], 10) || 0) + (parseInt(row[8], 10) || 0) || 1;

  const guestEmail = body.match(/Guest Email:\s*([^\s<>]+@[^\s<>]+)/i)?.[1] ?? null;
  // Guest phone appears as a bare digit line between the Guest and
  // Guest Email lines; best-effort.
  const phone = body.match(/\n\s*(\d[\d ()+-]{6,})\s*\n\s*Guest Email/i)?.[1]?.trim() ?? null;
  const listingName = body.match(/Room Type Name:\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  return {
    source: "expedia",
    externalRef: id,
    firstName,
    lastName,
    guestEmail,
    phone,
    checkIn,
    checkOut,
    guests,
    listingName,
  };
}
```

- [ ] **Step 4: Run tests until green, then full suite + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/expedia.test.ts && npm test && npm run typecheck
```

Expected: PASS. Same rule as Task 6: adjust regexes to the fixture, never the fixture to the regexes.

- [ ] **Step 5: Commit**

```bash
git add apps/email-ingest/src/parsers/expedia.ts apps/email-ingest/test/expedia.test.ts
git commit -m "feat(email-ingest): Expedia new-booking parser"
```

---

### Task 8: The `email()` handler

**Files:**
- Create: `apps/email-ingest/src/index.ts`
- Test: `apps/email-ingest/test/handler.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5-7; `postal-mime`; the Task 3 endpoint contract.
- Produces: `handleEmail(message, env)` (exported for tests) and the default `{ email }` export Cloudflare invokes.

- [ ] **Step 1: Write the failing handler tests**

`apps/email-ingest/test/handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEmail } from "../src/index";

const FIXTURES = join(__dirname, "fixtures");

function rawEmail(from: string, subject: string, textBody: string): Uint8Array {
  // Minimal RFC 5322 message; postal-mime handles UTF-8 8bit bodies.
  const msg = [
    `From: Airbnb <${from}>`,
    `To: bookings@aubergeduvieuxpont.ca`,
    `Subject: ${subject}`,
    `Date: Fri, 17 Jul 2026 10:13:00 -0400`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    textBody,
  ].join("\r\n");
  return new TextEncoder().encode(msg);
}

function makeMessage(from: string, subject: string, textBody: string) {
  const raw = rawEmail(from, subject, textBody);
  return {
    from,
    to: "bookings@aubergeduvieuxpont.ca",
    raw: new Response(raw).body!, // ReadableStream, like the runtime provides
    rawSize: raw.byteLength,
    headers: new Headers(),
    forward: vi.fn(async () => {}),
    setReject: vi.fn(),
    reply: vi.fn(async () => {}),
  } as any;
}

function makeEnv() {
  const calls: { url: string; body: any }[] = [];
  const env = {
    FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
    API: {
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const bodyText =
          typeof input !== "string" && input instanceof Request
            ? await input.clone().text()
            : String(init?.body ?? "");
        calls.push({ url, body: JSON.parse(bodyText) });
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }),
    },
  } as any;
  return { env, calls };
}

const airbnbText = readFileSync(join(FIXTURES, "airbnb-confirmation.txt"), "utf8");

describe("handleEmail", () => {
  it("forwards first, then posts a parsed Airbnb booking to the API", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);

    expect(message.forward).toHaveBeenCalledWith("aubergeduvieuxpont2@hotmail.com");
    expect(message.forward.mock.invocationCallOrder[0]).toBeLessThan(
      (env.API.fetch as any).mock.invocationCallOrder[0],
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://api/internal/ota-bookings");
    expect(calls[0].body.status).toBe("parsed");
    expect(calls[0].body.source).toBe("airbnb");
    expect(calls[0].body.externalRef).toBe("HM45MDTHZ4");
    expect(calls[0].body.firstName).toBe("Jean");
  });

  it("posts ignored for an Airbnb pending request", async () => {
    const requestText = readFileSync(join(FIXTURES, "airbnb-request.txt"), "utf8");
    const message = makeMessage(
      "automated@airbnb.com",
      "En attente : demande de réservation concernant l'annonce Auberge du vieux pont pour 30–31 juil. 2026",
      requestText,
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.forward).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.status).toBe("ignored");
    expect(calls[0].body.provider).toBe("airbnb");
  });

  it("posts parse_failed when a booking email cannot be parsed", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      "corps inattendu sans aucun des champs habituels",
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.status).toBe("parse_failed");
    expect(calls[0].body.provider).toBe("airbnb");
  });

  it("only forwards unknown senders — no API call", async () => {
    const message = makeMessage("news@example.com", "Promo", "hello");
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.forward).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("never throws after a successful forward, even if the API is down", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const env = {
      FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
      API: { fetch: vi.fn(async () => { throw new Error("binding down"); }) },
    } as any;
    await expect(handleEmail(message, env)).resolves.toBeUndefined();
    expect(message.forward).toHaveBeenCalled();
  });

  it("propagates a forward failure so Cloudflare retries delivery", async () => {
    const message = makeMessage("automated@airbnb.com", "x", "y");
    message.forward = vi.fn(async () => { throw new Error("not verified"); });
    const { env, calls } = makeEnv();
    await expect(handleEmail(message, env)).rejects.toThrow("not verified");
    expect(calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npx vitest run test/handler.test.ts
```

Expected: FAIL — `handleEmail` not found.

- [ ] **Step 3: Implement `apps/email-ingest/src/index.ts`**

```ts
import PostalMime from "postal-mime";
import { classify } from "./classify";
import { htmlToText } from "./htmlToText";
import { parseAirbnb } from "./parsers/airbnb";
import { parseExpedia } from "./parsers/expedia";
import type { Env } from "./types";

/**
 * Ordering is deliberate and load-bearing:
 *  1. forward() FIRST — the operator's mailbox copy must never depend on
 *     parsing. If forward() itself fails we let the error propagate so
 *     Cloudflare retries/bounces the delivery.
 *  2. After a successful forward, never throw: a retried delivery would
 *     forward a duplicate. Parse/API problems are logged (worker logs +
 *     email_ingest_log via the API when reachable) instead.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  await message.forward(env.FORWARD_TO);

  try {
    const parsed = await PostalMime.parse(message.raw);
    const from = parsed.from?.address ?? message.from;
    const subject = (parsed.subject ?? "").normalize("NFC");

    const cls = classify(from, subject);
    if (cls.kind === "unknown") return;

    let body: Record<string, unknown>;
    if (cls.kind === "ignored") {
      body = { status: "ignored", provider: cls.provider, subject, error: cls.reason };
    } else {
      const text = parsed.text?.trim() ? parsed.text : htmlToText(parsed.html ?? "");
      const sentAt = parsed.date ? new Date(parsed.date) : new Date();
      const booking =
        cls.provider === "airbnb" ? parseAirbnb(text, subject, sentAt) : parseExpedia(text, subject);
      body = booking
        ? { ...booking, status: "parsed", subject }
        : { status: "parse_failed", provider: cls.provider, subject, error: "parser returned null" };
    }

    const res = await env.API.fetch("http://api/internal/ota-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("email-ingest: API rejected ingest", res.status, await res.text());
    }
  } catch (err) {
    console.error("email-ingest: processing failed (email was forwarded)", err);
  }
}

export default {
  email: (message, env) => handleEmail(message, env),
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run all worker tests + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/email-ingest && npm test && npm run typecheck
```

Expected: PASS. If `ForwardableEmailMessage` is missing from types, confirm `@cloudflare/workers-types` is in `tsconfig.json` `types` (it is, via the copied config).

- [ ] **Step 5: Commit**

```bash
git add apps/email-ingest/src/index.ts apps/email-ingest/test/handler.test.ts
git commit -m "feat(email-ingest): email handler — forward-first, parse, post to internal API"
```

---

### Task 9: Admin UI — «Emails OTA» tab

**Files:**
- Modify: `apps/web/src/lib/api.ts` (add type + helper)
- Create: `apps/web/src/lib/components/admin/AdminEmailsOtaTab.svelte`
- Modify: `apps/web/src/routes/admin/+page.svelte` (tab union at line ~30, `order` array at ~239, tab button after the Utilisateurs button ~431, panel after the Utilisateurs panel ~941, import at ~7)

**Interfaces:**
- Consumes: Task 4 endpoint.
- Produces: user-visible admin tab; `adminEmailIngest(): Promise<{ rows: EmailIngestRow[] } | ApiError>` in `$lib/api`.

- [ ] **Step 1: Add the API helper**

In `apps/web/src/lib/api.ts`, next to `adminOutbox` (~line 334), add:

```ts
export interface EmailIngestRow {
  id: number;
  provider: string | null;
  status: "parsed" | "parse_failed" | "duplicate" | "ignored" | string;
  reservation_id: number | null;
  subject: string | null;
  error: string | null;
  created_at: string;
}

export async function adminEmailIngest(): Promise<{ rows: EmailIngestRow[] } | ApiError> {
  return fetchJson<{ rows: EmailIngestRow[] }>("/admin/email-ingest");
}
```

- [ ] **Step 2: Create `apps/web/src/lib/components/admin/AdminEmailsOtaTab.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { adminEmailIngest, isError } from '$lib/api';
  import type { EmailIngestRow } from '$lib/api';

  let rows = $state<EmailIngestRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const STATUS_LABELS: Record<string, string> = {
    parsed: 'Réservation créée',
    parse_failed: 'Échec d’analyse',
    duplicate: 'Doublon ignoré',
    ignored: 'Sans réservation',
  };

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' });
  }

  onMount(async () => {
    const res = await adminEmailIngest();
    if (isError(res)) {
      error = res.error;
    } else {
      rows = res.rows;
    }
    loading = false;
  });
</script>

<div class="ota-log" data-testid="emails-ota-tab">
  <p class="ota-log__intro">
    Courriels de réservation reçus à bookings@aubergeduvieuxpont.ca (Airbnb et
    Expedia). Chaque courriel est aussi transféré à la boîte de secours.
  </p>

  {#if loading}
    <p class="ota-log__state" aria-live="polite">Chargement…</p>
  {:else if error}
    <p class="ota-log__state ota-log__state--error" role="alert">{error}</p>
  {:else if rows.length === 0}
    <p class="ota-log__state">Aucun courriel traité pour l'instant.</p>
  {:else}
    <div class="ota-log__scroll">
      <table class="ota-log__table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Source</th>
            <th scope="col">Statut</th>
            <th scope="col">Sujet</th>
            <th scope="col">Réservation</th>
            <th scope="col">Erreur</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              <td>{fmtDate(row.created_at)}</td>
              <td class="ota-log__provider">{row.provider ?? '—'}</td>
              <td>
                <span class="ota-log__status ota-log__status--{row.status}">
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              </td>
              <td class="ota-log__subject">{row.subject ?? '—'}</td>
              <td>{row.reservation_id != null ? `#${row.reservation_id}` : '—'}</td>
              <td class="ota-log__error">{row.error ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .ota-log__intro {
    margin: 0 0 1rem;
    color: var(--color-text-muted, #6b7280);
    font-size: 0.9rem;
    max-width: 60ch;
  }
  .ota-log__state {
    margin: 1rem 0;
    color: var(--color-text-muted, #6b7280);
  }
  .ota-log__state--error {
    color: #b91c1c;
  }
  /* Wide table scrolls inside its own container — the page never overflows. */
  .ota-log__scroll {
    overflow-x: auto;
  }
  .ota-log__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    min-width: 640px;
  }
  .ota-log__table th,
  .ota-log__table td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    vertical-align: top;
  }
  .ota-log__provider {
    text-transform: capitalize;
  }
  .ota-log__subject,
  .ota-log__error {
    max-width: 28ch;
    overflow-wrap: anywhere;
  }
  .ota-log__status {
    white-space: nowrap;
  }
  .ota-log__status--parse_failed {
    color: #b91c1c;
    font-weight: 600;
  }
  .ota-log__status--parsed {
    color: #15803d;
  }
</style>
```

(Match surrounding conventions: if other admin components use different CSS-variable names for muted text/borders, reuse those instead of the fallbacks above — check `AdminChambresTab.svelte`'s `<style>` block and copy its color tokens.)

- [ ] **Step 3: Wire the tab into `apps/web/src/routes/admin/+page.svelte`**

Five small edits:

1. Import (after the `AdminChambresTab` import, line ~7):

```ts
  import AdminEmailsOtaTab from "$lib/components/admin/AdminEmailsOtaTab.svelte";
```

2. Tab-state union (line ~30) becomes:

```ts
  let activeTab = $state<"reservations" | "outbox" | "settings" | "rooms" | "users" | "emails-ota">("reservations");
```

3. Keyboard-nav order (line ~239) becomes:

```ts
    const order = ["reservations", "outbox", "settings", "rooms", "users", "emails-ota"] as const;
```

4. Tab button — insert after the closing `</button>` of the Utilisateurs tab (line ~431), inside the same `role="tablist"` div:

```svelte
            <button
              role="tab"
              id="tab-emails-ota"
              aria-controls="panel-emails-ota"
              aria-selected={activeTab === "emails-ota"}
              tabindex={activeTab === "emails-ota" ? 0 : -1}
              class="page-admin__tab {activeTab === 'emails-ota' ? 'page-admin__tab--active' : ''}"
              onclick={() => {
                activeTab = "emails-ota";
              }}
              onkeydown={onTablistKeydown}
              data-testid="tab-emails-ota"
            >
              Emails OTA
            </button>
```

**Focus-management caveat:** `onTablistKeydown` focuses `tab-${order[next]}`; with the id `tab-emails-ota` and order entry `"emails-ota"` this lines up — keep both spellings identical.

5. Panel — insert after the closing `</div>` of the Utilisateurs panel (line ~941), before the final `</div>{/if}`:

```svelte
      <!-- Emails OTA panel -->
      <div
        role="tabpanel"
        id="panel-emails-ota"
        aria-labelledby="tab-emails-ota"
        hidden={activeTab !== "emails-ota"}
        data-testid="panel-emails-ota"
      >
        <div class="page-admin__panel-inner">
          {#if activeTab === "emails-ota"}
            <AdminEmailsOtaTab />
          {/if}
        </div>
      </div>
```

- [ ] **Step 4: Typecheck + web tests + build**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm run typecheck && npm test --workspace apps/web && npm run build:web
```

Expected: PASS / build succeeds. (The tab is data-driven UI over an admin endpoint; typecheck + existing web test suite + build is the verification bar used by the other admin tabs.)

- [ ] **Step 5: Verify narrow viewport (frontend hard rule)**

Run `npm run dev:web` briefly and check the admin page at a ~375px viewport (or use browser devtools): the new tab button wraps/scrolls within the existing tab bar and the table scrolls inside `.ota-log__scroll` with no page-level horizontal overflow. (The tab bar already handles overflow for 5 tabs; confirm 6 still behaves.) If the API isn't running locally, the tab must render its error state gracefully — that's acceptable for this check; layout is what's being verified.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/components/admin/AdminEmailsOtaTab.svelte apps/web/src/routes/admin/+page.svelte
git commit -m "feat(web): admin Emails OTA tab — ingest log visibility"
```

---

### Task 10: Root wiring, docs, ops runbook, final verification

**Files:**
- Modify: `package.json` (root — scripts)
- Modify: `CLAUDE.md` (architecture section)
- Create: `apps/email-ingest/README.md`

- [ ] **Step 1: Root scripts**

In root `package.json` `scripts`, after the hubspot entries add:

```json
    "dev:email-ingest": "npm run dev --workspace apps/email-ingest",
    "deploy:email-ingest": "npm run deploy --workspace apps/email-ingest",
```

- [ ] **Step 2: CLAUDE.md architecture note**

In `CLAUDE.md`, update the architecture tree to include:

```
  email-ingest/  Email Worker: receives OTA booking emails (bookings@) via
                 Cloudflare Email Routing, forwards the original, parses
                 Airbnb/Expedia confirmations and posts them to the API's
                 internal /internal/ota-bookings endpoint (service binding).
```

Also add one bullet under the architecture notes: reservations now carry `source`/`external_ref` (dedupe), and `email_ingest_log` records every processed OTA email (admin tab «Emails OTA»).

- [ ] **Step 3: `apps/email-ingest/README.md` — ops runbook**

```markdown
# email-ingest

Cloudflare Email Worker: `bookings@aubergeduvieuxpont.ca` → forward to the
backup mailbox → parse Airbnb/Expedia booking confirmations → create the
reservation (+ HubSpot sync) through the API's internal endpoint.

## One-time Cloudflare setup (dashboard, manual)

1. **Enable Email Routing** on the `aubergeduvieuxpont.ca` zone
   (Email → Email Routing → enable; this adds MX/SPF records — check no other
   mail service uses the apex domain first).
2. **Verify the destination address**: add `aubergeduvieuxpont2@hotmail.com`
   as a destination and click the verification email it receives.
   `message.forward()` to an unverified address fails (the handler then lets
   Cloudflare retry, so nothing is lost — but nothing is delivered either).
3. Deploy this worker: `npm run deploy:email-ingest` (root).
4. **Create the routing rule**: custom address `bookings@aubergeduvieuxpont.ca`
   → action *Send to Worker* → `site-web-email-ingest`.
5. **Point the OTAs at it**: change the notification/contact email to
   `bookings@aubergeduvieuxpont.ca` in Airbnb host settings and Expedia
   Partner Central.
6. Test: resend/forward a booking confirmation to `bookings@…` and check the
   admin «Emails OTA» tab plus the backup mailbox.

## Behaviour

- Every email is forwarded to `FORWARD_TO` (wrangler var) BEFORE parsing.
- Airbnb: only «Réservation confirmée» creates a reservation (no guest email
  in these emails → no HubSpot sync). Pending requests are logged `ignored`.
- Expedia: "New Booking" creates a reservation with the relay guest email
  (synced to HubSpot). Modify/cancel notifications are logged `ignored`.
- Dedupe: `(source, external_ref)` unique — resent confirmations log
  `duplicate` and change nothing.
- Parse failures are logged `parse_failed` and visible in the admin; the
  email is still in the backup mailbox.
```

- [ ] **Step 4: Full-repo verification**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm test && npm run typecheck && npm run build:web
```

Expected: every workspace green, build OK.

- [ ] **Step 5: Commit**

```bash
git add package.json CLAUDE.md apps/email-ingest/README.md
git commit -m "chore: wire email-ingest workspace — scripts, docs, ops runbook"
```

---

### Post-plan (not tasks — release checklist for the operator/session)

1. Push branch, open PR to `main` (include the README runbook in the description).
2. After merge: `npm run db:migrate` against prod `DB_CONN`, `npm run deploy:api`, `npm run deploy:web`, `npm run deploy:email-ingest` (prod deploys use the aubergeduvieuxpont.ca CF account via `CLOUDFLARE_API_TOKEN` — see memory `prod-deploy-account`).
3. Walk the README's one-time Cloudflare Email Routing setup (dashboard steps only the operator can click).
4. Change the notification email in Airbnb + Expedia host settings.
5. End-to-end test with a resent confirmation email.
