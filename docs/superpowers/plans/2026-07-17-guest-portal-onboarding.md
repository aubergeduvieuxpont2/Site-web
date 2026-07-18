# Outbound Email + OTA Guest Portal Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real outbound transactional email (Resend + retrying `email_outbox` + cron), four admin-toggleable email types, and auto-provisioned portal accounts for Expedia guests with a set-password welcome email.

**Architecture:** `enqueueEmail()` (toggle-gated) inserts `email_outbox` rows at four send points; a new cron `scheduled` handler on the API worker drains them — render precompiled Handlebars template → POST Resend → delivered/retry/failed, mirroring `apps/hubspot/src/outbox.ts` semantics. Expedia ingest provisions a linked user + 30-day set-password token. Profile gains an email-change endpoint that PATCHes the same HubSpot contact by stored ID.

**Tech Stack:** Cloudflare Workers, Hono, Neon Postgres, Zod, Handlebars (precompiled), Resend REST API, Vitest, Svelte 5.

**Spec:** `docs/superpowers/specs/2026-07-17-guest-portal-onboarding-design.md` — read before starting any task.

## Global Constraints

- Work in `/Users/ychasse/Downloads/wt-email-ingest` on branch `feature/guest-portal-onboarding`.
- Sender is exactly `Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>`; `Reply-To` = the live `contact_email` setting.
- The four toggles are settings keys `email_confirmation_enabled`, `email_password_reset_enabled`, `email_room_assignment_enabled`, `email_welcome_enabled` — stored as `'true'`/`'false'` strings, **default `'false'`**, admin-only (never in `PUBLIC_SETTING_KEYS`). Toggle checked at ENQUEUE time.
- Template↔toggle map: `reservation-confirmation`→confirmation, `password-reset`→password_reset, `room-assigned`→room_assignment, `ota-welcome`→welcome.
- Welcome set-password tokens: existing `password_reset_tokens` table, hashed via `sha256hex`, `expires_at = now() + 30 days`; ordinary reset tokens stay at 1 hour.
- No literal passwords in email. Welcome link: `https://www.aubergeduvieuxpont.ca/reinitialisation?token=<raw>&welcome=1`.
- Provisioning is Expedia-only in effect (gate: parsed booking has `guestEmail`); it must NEVER fail the booking path.
- Email backoff: base 30s, ×2 per attempt, cap 3600s, max 8 attempts → `failed`. Resend 429/5xx = transient, other 4xx = permanent.
- Migrations idempotent, one schema change per numbered file; next free numbers are **0026, 0027, 0028**. Migrate the dev DB before deploying (schema-changing PR rule).
- `RESEND_API_KEY` is already in the repo-root `.dev.env`; prod uses `wrangler secret put` (operator step).
- French-first copy; templates get both `fr` and `en` files (fr is what's sent this round).
- All existing suites must stay green (`npm test` at root = api + email-ingest + hubspot + web).

---

### Task 1: Migrations 0026–0028

**Files:**
- Create: `apps/api/migrations/0026_email_outbox.sql`, `apps/api/migrations/0027_email_toggle_settings.sql`, `apps/api/migrations/0028_reservations_user_id.sql`
- Modify: `apps/api/schema.sql` (append the same objects at the end, with `-- 0026/0027/0028` comment headers; the file is a stale reference — do NOT backfill unrelated missing objects)

**Interfaces:**
- Produces: `email_outbox` table, four settings seed rows, `reservations.user_id` — used by Tasks 3, 5, 9.

- [ ] **Step 1: Write the three migrations**

`apps/api/migrations/0026_email_outbox.sql`:

```sql
-- Outbound transactional email queue, drained by the API worker's cron.
-- Mirrors the hubspot_outbox lifecycle (pending -> delivered | failed).
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'fr',
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  provider_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_outbox_status_next_attempt
  ON email_outbox (status, next_attempt_at);
```

`apps/api/migrations/0027_email_toggle_settings.sql`:

```sql
-- Per-email-type kill switches, all OFF by default so the operator can
-- enable them one at a time from admin -> Parametres.
INSERT INTO settings (key, value) VALUES
  ('email_confirmation_enabled', 'false'),
  ('email_password_reset_enabled', 'false'),
  ('email_room_assignment_enabled', 'false'),
  ('email_welcome_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
```

`apps/api/migrations/0028_reservations_user_id.sql`:

```sql
-- Durable reservation -> portal-account link (email matching breaks the
-- moment a guest replaces their OTA relay address with their real email).
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reservations_user_id ON reservations (user_id);
```

- [ ] **Step 2: Append the same three blocks to `apps/api/schema.sql`** (each under a `-- 00XX_<name>` comment, matching how 0020 was appended).

- [ ] **Step 3: Apply twice (idempotency proof)**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm run db:migrate && npm run db:migrate
```

Expected: both runs end `Migrations complete.` with 0026–0028 applied each time.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/0026_email_outbox.sql apps/api/migrations/0027_email_toggle_settings.sql apps/api/migrations/0028_reservations_user_id.sql apps/api/schema.sql
git commit -m "feat(api): migrations 0026-0028 — email outbox, email toggles, reservations.user_id"
```

---

### Task 2: `ota-welcome` template

**Files:**
- Create: `apps/api/emails/templates/ota-welcome.fr.hbs`, `apps/api/emails/templates/ota-welcome.en.hbs`, `apps/api/emails/samples/ota-welcome.json`
- Modify: `apps/api/src/emails/templates.ts` (add `"ota-welcome"` to `TemplateKey` + `SAMPLES`), `apps/api/src/emails/manifest.ts` (add MANIFEST entry)
- Test: `apps/api/test/emails.test.ts` (extend)

**Interfaces:**
- Consumes: existing `renderEmail(key, locale, data)` from `apps/api/src/emails/render.ts`.
- Produces: template key `"ota-welcome"` with requiredFields `firstName, confirmationCode, checkIn, checkOut, setPasswordUrl` — enqueued by Task 9.

- [ ] **Step 1: Write the failing render test**

Append to `apps/api/test/emails.test.ts` (mirror the file's existing per-template test style — read one first):

```ts
describe("ota-welcome template", () => {
  const data = {
    firstName: "Marie",
    confirmationCode: "2511634261",
    checkIn: "2026-09-05",
    checkOut: "2026-09-06",
    setPasswordUrl: "https://www.aubergeduvieuxpont.ca/reinitialisation?token=abc&welcome=1",
  };

  it("renders French with the set-password link and reservation ref", () => {
    const out = renderEmail("ota-welcome", "fr", data);
    expect(out.subject).toContain("2511634261");
    expect(out.html).toContain("Marie");
    expect(out.html).toContain("reinitialisation?token=abc&amp;welcome=1");
    expect(out.text).toContain("2511634261");
  });

  it("renders English", () => {
    const out = renderEmail("ota-welcome", "en", data);
    expect(out.html).toContain("Set my password");
  });

  it("throws when a required field is missing", () => {
    const { setPasswordUrl, ...rest } = data;
    expect(() => renderEmail("ota-welcome", "fr", rest)).toThrow(/setPasswordUrl/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test -- test/emails.test.ts
```

Expected: FAIL (unknown template key / type error). Note: `pretest` re-runs the precompiler — that's how new .hbs files get picked up.

- [ ] **Step 3: Create the template files**

`apps/api/emails/templates/ota-welcome.fr.hbs` — BEFORE writing, open `apps/api/emails/templates/password-reset.fr.hbs` and reuse its exact button/link markup and CSS classes so the design matches; content:

```handlebars
<p>Bonjour {{firstName}},</p>
<p>
  Votre réservation Expedia <strong>#{{confirmationCode}}</strong>
  (du {{formatDate checkIn}} au {{formatDate checkOut}}) est enregistrée chez
  nous, à l'Auberge du Vieux Pont.
</p>
<p>
  Nous vous avons préparé un espace client : créez votre mot de passe pour
  consulter votre réservation et conserver votre profil pour vos prochains
  séjours — en réservant directement, vous obtenez toujours notre meilleur
  tarif.
</p>
<p><a href="{{setPasswordUrl}}" class="button">Créer mon mot de passe</a></p>
<p>Ce lien est valide 30 jours. Au plaisir de vous accueillir !</p>
```

`ota-welcome.en.hbs`: same structure — "Hello {{firstName}}", "Your Expedia reservation <strong>#{{confirmationCode}}</strong> ({{formatDate checkIn}} to {{formatDate checkOut}}) is on file at Auberge du Vieux Pont.", account paragraph, button text **"Set my password"**, "This link is valid for 30 days."

`apps/api/emails/samples/ota-welcome.json`:

```json
{
  "firstName": "Marie",
  "confirmationCode": "2511634261",
  "checkIn": "2026-09-05",
  "checkOut": "2026-09-06",
  "setPasswordUrl": "https://www.aubergeduvieuxpont.ca/reinitialisation?token=SAMPLE&welcome=1"
}
```

- [ ] **Step 4: Register the key**

In `apps/api/src/emails/templates.ts`: add `"ota-welcome"` to the `TemplateKey` union and `SAMPLES` (import the JSON like its neighbours). In `apps/api/src/emails/manifest.ts` add:

```ts
  "ota-welcome": {
    name: "Bienvenue OTA (Expedia)",
    subject: {
      fr: "Votre réservation #{{confirmationCode}} — créez votre espace client",
      en: "Your reservation #{{confirmationCode}} — set up your guest account",
    },
    sampleFile: "ota-welcome.json",
    requiredFields: ["firstName", "confirmationCode", "checkIn", "checkOut", "setPasswordUrl"],
  },
```

(Match the real `ManifestEntry` shape — if `subject` is a single string keyed elsewhere by locale, follow the file's existing pattern for bilingual subjects exactly.)

- [ ] **Step 5: Run to green + full emails suites**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test -- test/emails.test.ts test/emails-routes.test.ts && npm run typecheck
```

Expected: PASS (preview routes automatically include the new key).

- [ ] **Step 6: Commit**

```bash
git add apps/api/emails apps/api/src/emails apps/api/test/emails.test.ts
git commit -m "feat(api): ota-welcome bilingual email template"
```

---

### Task 3: `emailOutbox` module (enqueue + drain)

**Files:**
- Create: `apps/api/src/emailOutbox.ts`
- Modify: `apps/api/src/emails/routes.ts` (export the currently-private `contactContext` helper)
- Test: `apps/api/test/emailOutbox.test.ts`

**Interfaces:**
- Consumes: `renderEmail` (emails/render.ts), `contactContext(sql)` (emails/routes.ts — returns `{contactPhone, contactPhoneHref, contactEmail}` from live settings).
- Produces (used by Tasks 4, 7, 8, 9):
  - `async function enqueueEmail(sql: NeonSql, input: { template: EmailTemplate; to: string; locale?: "fr" | "en"; payload: Record<string, unknown> }): Promise<{ enqueued: boolean }>` — toggle-gated; `type EmailTemplate = "reservation-confirmation" | "password-reset" | "room-assigned" | "ota-welcome"`.
  - `async function drainEmailOutbox(env: { DB_CONN: string; RESEND_API_KEY: string }): Promise<{ delivered: number; retried: number; failed: number }>` — never throws.
  - Pure helpers exported for tests: `computeEmailBackoff(attempts: number): number` (seconds), `isTransientResendFailure(status: number): boolean`, `EMAIL_TOGGLE_KEYS: Record<EmailTemplate, string>`, `EMAIL_FROM`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/emailOutbox.test.ts` — mirror `apps/hubspot/test/outbox.test.ts`'s approach (`vi.doMock("@neondatabase/serverless", () => ({ neon: () => mockSql }))` with a tagged-template stub, plus `vi.stubGlobal("fetch", ...)` for Resend):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeEmailBackoff,
  isTransientResendFailure,
  EMAIL_TOGGLE_KEYS,
  EMAIL_FROM,
  enqueueEmail,
} from "../src/emailOutbox";

describe("computeEmailBackoff", () => {
  it("doubles from 30s and caps at 3600s", () => {
    expect(computeEmailBackoff(1)).toBe(30);
    expect(computeEmailBackoff(2)).toBe(60);
    expect(computeEmailBackoff(3)).toBe(120);
    expect(computeEmailBackoff(8)).toBe(3600);
    expect(computeEmailBackoff(20)).toBe(3600);
  });
});

describe("isTransientResendFailure", () => {
  it("treats 429 and 5xx as transient, other 4xx as permanent", () => {
    expect(isTransientResendFailure(429)).toBe(true);
    expect(isTransientResendFailure(500)).toBe(true);
    expect(isTransientResendFailure(503)).toBe(true);
    expect(isTransientResendFailure(400)).toBe(false);
    expect(isTransientResendFailure(422)).toBe(false);
  });
});

describe("EMAIL_TOGGLE_KEYS / EMAIL_FROM", () => {
  it("maps each template to its settings toggle", () => {
    expect(EMAIL_TOGGLE_KEYS).toEqual({
      "reservation-confirmation": "email_confirmation_enabled",
      "password-reset": "email_password_reset_enabled",
      "room-assigned": "email_room_assignment_enabled",
      "ota-welcome": "email_welcome_enabled",
    });
  });
  it("sends from the verified domain", () => {
    expect(EMAIL_FROM).toBe("Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>");
  });
});

describe("enqueueEmail", () => {
  function makeSql(toggleValue: string | null) {
    const calls: string[] = [];
    const sql = async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join("?");
      calls.push(q);
      if (q.includes("FROM settings")) {
        return toggleValue === null ? [] : [{ value: toggleValue }];
      }
      return [{ id: 1 }];
    };
    return { sql: sql as any, calls };
  }

  it("inserts a row when the toggle is on", async () => {
    const { sql, calls } = makeSql("true");
    const r = await enqueueEmail(sql, {
      template: "ota-welcome",
      to: "guest@example.com",
      payload: { firstName: "Marie" },
    });
    expect(r.enqueued).toBe(true);
    expect(calls.some((q) => q.includes("INSERT INTO email_outbox"))).toBe(true);
  });

  it("skips when the toggle is off or missing", async () => {
    for (const v of ["false", null] as const) {
      const { sql, calls } = makeSql(v);
      const r = await enqueueEmail(sql, {
        template: "password-reset",
        to: "guest@example.com",
        payload: {},
      });
      expect(r.enqueued).toBe(false);
      expect(calls.some((q) => q.includes("INSERT INTO email_outbox"))).toBe(false);
    }
  });
});
```

Then a drain test using module mocking (place BEFORE importing drain — use `vi.doMock` + dynamic import, exactly like `apps/hubspot/test/outbox.test.ts` structures its DB-function tests):

```ts
describe("drainEmailOutbox", () => {
  const rows = [
    {
      id: 7,
      to_email: "guest@example.com",
      template: "ota-welcome",
      locale: "fr",
      payload: {
        firstName: "Marie",
        confirmationCode: "2511634261",
        checkIn: "2026-09-05",
        checkOut: "2026-09-06",
        setPasswordUrl: "https://www.aubergeduvieuxpont.ca/reinitialisation?token=x&welcome=1",
      },
      attempts: 1,
    },
  ];
  let queries: string[];
  let mockSqlRows: unknown[];

  beforeEach(() => {
    queries = [];
    mockSqlRows = rows;
    vi.resetModules();
    vi.doMock("@neondatabase/serverless", () => ({
      neon: () => async (strings: TemplateStringsArray, ...vals: unknown[]) => {
        const q = strings.join("?");
        queries.push(q);
        if (q.includes("UPDATE email_outbox") && q.includes("RETURNING")) return mockSqlRows; // claim
        if (q.includes("FROM settings")) return [
          { key: "contact_email", value: "info@aubergeduvieuxpont.ca" },
          { key: "contact_phone", value: "418 655-1212" },
        ];
        return [];
      },
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@neondatabase/serverless");
  });

  it("renders, posts to Resend, marks delivered", async () => {
    const sent: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    }));
    const { drainEmailOutbox } = await import("../src/emailOutbox");
    const stats = await drainEmailOutbox({ DB_CONN: "postgres://x", RESEND_API_KEY: "re_key" });
    expect(stats.delivered).toBe(1);
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    expect(sent[0].body.from).toBe("Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>");
    expect(sent[0].body.to).toEqual(["guest@example.com"]);
    expect(sent[0].body.reply_to).toBe("info@aubergeduvieuxpont.ca");
    expect(sent[0].body.subject).toContain("2511634261");
    expect(sent[0].body.html).toContain("Marie");
    expect(queries.some((q) => q.includes("status = 'delivered'"))).toBe(true);
  });

  it("marks retry on 429 and failed on 422", async () => {
    for (const [status, marker] of [[429, "next_attempt_at"], [422, "status = 'failed'"]] as const) {
      queries = [];
      vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status })));
      vi.resetModules();
      const { drainEmailOutbox } = await import("../src/emailOutbox");
      await drainEmailOutbox({ DB_CONN: "postgres://x", RESEND_API_KEY: "re_key" });
      expect(queries.some((q) => q.includes(marker))).toBe(true);
    }
  });

  it("never throws even when everything is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("net down"); }));
    vi.resetModules();
    const { drainEmailOutbox } = await import("../src/emailOutbox");
    await expect(
      drainEmailOutbox({ DB_CONN: "postgres://x", RESEND_API_KEY: "re_key" }),
    ).resolves.toBeDefined();
  });
});
```

(Adapt the mock plumbing to what `apps/hubspot/test/outbox.test.ts` actually does — the assertions above are the contract; the mock mechanics should copy the proven pattern from that file.)

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/emailOutbox.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Export `contactContext` from `apps/api/src/emails/routes.ts`** (change its declaration to `export`; do not change behaviour).

- [ ] **Step 4: Implement `apps/api/src/emailOutbox.ts`**

```ts
import { neon } from "@neondatabase/serverless";
import { renderEmail } from "./emails";
import type { Locale, TemplateKey } from "./emails/templates";
import { contactContext } from "./emails/routes";

export type EmailTemplate =
  | "reservation-confirmation"
  | "password-reset"
  | "room-assigned"
  | "ota-welcome";

export const EMAIL_TOGGLE_KEYS: Record<EmailTemplate, string> = {
  "reservation-confirmation": "email_confirmation_enabled",
  "password-reset": "email_password_reset_enabled",
  "room-assigned": "email_room_assignment_enabled",
  "ota-welcome": "email_welcome_enabled",
};

// From must live on the Resend-verified domain; the operator's own mailbox
// is used as Reply-To instead (fetched live from settings at drain time).
export const EMAIL_FROM = "Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>";

const MAX_ATTEMPTS = 8;

export function computeEmailBackoff(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

export function isTransientResendFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

type NeonSql = ReturnType<typeof neon>;

export async function enqueueEmail(
  sql: NeonSql,
  input: { template: EmailTemplate; to: string; locale?: Locale; payload: Record<string, unknown> },
): Promise<{ enqueued: boolean }> {
  const toggleKey = EMAIL_TOGGLE_KEYS[input.template];
  const rows = (await sql`SELECT value FROM settings WHERE key = ${toggleKey}`) as { value: string }[];
  if (rows[0]?.value !== "true") return { enqueued: false };
  await sql`
    INSERT INTO email_outbox (to_email, template, locale, payload)
    VALUES (${input.to}, ${input.template}, ${input.locale ?? "fr"}, ${JSON.stringify(input.payload)})
  `;
  return { enqueued: true };
}

type OutboxEmailRow = {
  id: number;
  to_email: string;
  template: string;
  locale: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export async function drainEmailOutbox(env: {
  DB_CONN: string;
  RESEND_API_KEY: string;
}): Promise<{ delivered: number; retried: number; failed: number }> {
  const stats = { delivered: 0, retried: 0, failed: 0 };
  try {
    const sql = neon(env.DB_CONN);
    // Claim: bump attempts up front so a crashed drain retries later.
    const batch = (await sql`
      UPDATE email_outbox
      SET attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY id
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_email, template, locale, payload, attempts
    `) as OutboxEmailRow[];
    if (batch.length === 0) return stats;

    const contact = await contactContext(sql);

    for (const row of batch) {
      try {
        const rendered = renderEmail(
          row.template as TemplateKey,
          (row.locale === "en" ? "en" : "fr") as Locale,
          { ...row.payload, ...contact },
        );
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: [row.to_email],
            reply_to: contact.contactEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { id?: string };
          await sql`
            UPDATE email_outbox
            SET status = 'delivered', provider_id = ${body.id ?? null}, last_error = NULL, updated_at = now()
            WHERE id = ${row.id}
          `;
          stats.delivered++;
        } else {
          const errText = (await res.text()).slice(0, 500);
          await markSendFailure(sql, row, `Resend ${res.status}: ${errText}`, isTransientResendFailure(res.status), stats);
        }
      } catch (err) {
        // Render errors are permanent (bad payload); network errors transient.
        const isRenderError = err instanceof Error && /Missing required field|Unknown template/i.test(err.message);
        await markSendFailure(sql, row, String(err).slice(0, 500), !isRenderError, stats);
      }
    }
  } catch (err) {
    console.error("email-outbox: drain failed", err);
  }
  return stats;
}

async function markSendFailure(
  sql: NeonSql,
  row: OutboxEmailRow,
  error: string,
  transient: boolean,
  stats: { retried: number; failed: number },
): Promise<void> {
  try {
    if (transient && row.attempts < MAX_ATTEMPTS) {
      const delay = computeEmailBackoff(row.attempts);
      await sql`
        UPDATE email_outbox
        SET last_error = ${error}, next_attempt_at = now() + make_interval(secs => ${delay}), updated_at = now()
        WHERE id = ${row.id}
      `;
      stats.retried++;
    } else {
      await sql`
        UPDATE email_outbox
        SET status = 'failed', last_error = ${error}, updated_at = now()
        WHERE id = ${row.id}
      `;
      stats.failed++;
    }
  } catch (err) {
    console.error("email-outbox: mark failure errored", err);
  }
}
```

- [ ] **Step 5: Run to green**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npx vitest run test/emailOutbox.test.ts && npm test && npm run typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/emailOutbox.ts apps/api/src/emails/routes.ts apps/api/test/emailOutbox.test.ts
git commit -m "feat(api): email outbox — toggle-gated enqueue + Resend drain with backoff"
```

---

### Task 4: Cron wiring (`scheduled` handler)

**Files:**
- Modify: `apps/api/wrangler.jsonc` (add triggers), `apps/api/src/index.ts` (Bindings + export shape)

**Interfaces:**
- Consumes: `drainEmailOutbox` (Task 3).
- Produces: API worker runs the drain every minute; `Bindings` gains `RESEND_API_KEY: string`.

- [ ] **Step 1: wrangler.jsonc** — add near the end (comment style matches file):

```jsonc
  // Drains the email_outbox every minute (Resend sends + retries).
  "triggers": { "crons": ["* * * * *"] },
```

- [ ] **Step 2: index.ts** — add `RESEND_API_KEY: string;` to the `Bindings` type; import `drainEmailOutbox` from `./emailOutbox`; replace the final `export default app;` with:

```ts
export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(drainEmailOutbox(env).then((s) => {
      if (s.delivered || s.retried || s.failed) console.log("email-outbox drain", JSON.stringify(s));
    }));
  },
} satisfies ExportedHandler<Bindings>;
```

(Check `apps/hubspot/src/index.ts`'s export for the exact idiom used there and match it.)

- [ ] **Step 3: Verify**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

Expected: PASS (export-shape change is type-checked; Hono routes unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/api/wrangler.jsonc apps/api/src/index.ts
git commit -m "feat(api): cron trigger drains the email outbox every minute"
```

---

### Task 5: Settings toggles (API)

**Files:**
- Modify: `apps/api/src/settings.ts`, `apps/api/src/index.ts` (admin settings POST handler writes 4 more rows)
- Test: `apps/api/test/settings.test.ts` (extend)

**Interfaces:**
- Produces: `AdminSettings` gains `emailConfirmationEnabled, emailPasswordResetEnabled, emailRoomAssignmentEnabled, emailWelcomeEnabled: boolean` (all default false); NOT public. Task 6 mirrors this in the web app.

- [ ] **Step 1: Failing tests** — append to `apps/api/test/settings.test.ts` (mirror existing reservationsEnabled cases):

```ts
describe("email toggles", () => {
  it("defaults all four to false", () => {
    const s = rowsToAdminSettings([]);
    expect(s.emailConfirmationEnabled).toBe(false);
    expect(s.emailPasswordResetEnabled).toBe(false);
    expect(s.emailRoomAssignmentEnabled).toBe(false);
    expect(s.emailWelcomeEnabled).toBe(false);
  });

  it("reads 'true' rows", () => {
    const s = rowsToAdminSettings([{ key: "email_welcome_enabled", value: "true" }]);
    expect(s.emailWelcomeEnabled).toBe(true);
    expect(s.emailConfirmationEnabled).toBe(false);
  });

  it("validates the four booleans in updates (accepts 'true'/'false' strings)", () => {
    const base = {
      nightlyPrice: 89, weeklyPrice: 560, contactEmail: "a@b.co", contactPhone: "418 555-0000",
      tps: 5, tvq: 9.975, accommodationTax: 3.5, assignableRoomCount: 12, reservationsEnabled: true,
      emailConfirmationEnabled: "true", emailPasswordResetEnabled: false,
      emailRoomAssignmentEnabled: "false", emailWelcomeEnabled: true,
    };
    const r = SettingsUpdateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.emailConfirmationEnabled).toBe(true);
      expect(r.data.emailRoomAssignmentEnabled).toBe(false);
    }
    expect(SettingsUpdateSchema.safeParse({ ...base, emailWelcomeEnabled: "maybe" }).success).toBe(false);
  });

  it("keeps the email toggles out of public settings", () => {
    const pub = toPublicSettings(rowsToAdminSettings([]));
    expect("emailWelcomeEnabled" in pub).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement in `apps/api/src/settings.ts`:
  - `SETTINGS_DEFAULTS`: add `email_confirmation_enabled: false, email_password_reset_enabled: false, email_room_assignment_enabled: false, email_welcome_enabled: false`.
  - `SettingsUpdateSchema`: four `z.preprocess(coerceBoolLoose, z.boolean())` fields (camelCase names above).
  - `AdminSettings`: the four booleans.
  - `rowsToAdminSettings`: read each via `parseBool(rowMap.get("email_..._enabled") ?? "false")`.
  - Do NOT touch `PUBLIC_SETTING_KEYS` or `PublicSettings`.
- In `apps/api/src/index.ts`, find the admin settings update handler (the one INSERTing `('reservations_enabled', ...)`) and add four more `(key, value)` pairs following its exact pattern: `${data.emailConfirmationEnabled ? "true" : "false"}` etc.

- [ ] **Step 3: Green + full suite + typecheck**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/settings.ts apps/api/src/index.ts apps/api/test/settings.test.ts
git commit -m "feat(api): four admin toggles for automated emails (default off)"
```

---

### Task 6: Settings toggles (web admin UI)

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`AdminSettings` interface), `apps/web/src/routes/admin/+page.svelte` (settings state defaults + a «Courriels automatiques» group of four toggles in the Paramètres panel)

**Interfaces:**
- Consumes: Task 5's `AdminSettings` shape.

- [ ] **Step 1:** `apps/web/src/lib/api.ts` — extend `AdminSettings` with the four booleans.

- [ ] **Step 2:** `apps/web/src/routes/admin/+page.svelte`:
  - Add the four fields (default `false`) to the `settings` `$state` object (~line 63).
  - In the Paramètres panel, after the existing `reservationsEnabled` toggle block (~line 940), add a sub-heading `<h3 class="page-admin__subheading">Courriels automatiques</h3>` (reuse whatever heading class the panel already uses — inspect nearby markup) and four copies of the existing toggle block pattern (`page-admin__field` + `page-admin__toggle` + label), bound to each field, with `data-testid`s `toggle-email-confirmation`, `toggle-email-password-reset`, `toggle-email-room-assignment`, `toggle-email-welcome` and labels:
    - «Confirmation de réservation» (Activé/Désactivé)
    - «Réinitialisation de mot de passe»
    - «Assignation de chambre (clé d'accès)»
    - «Bienvenue OTA (Expedia)»
  - `saveSettings` already posts the whole object — no change needed there.

- [ ] **Step 3: Verify**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm run typecheck && npm test --workspace apps/web && npm run build:web
```

Expected: green. The toggles inherit the existing responsive field layout (no fixed widths) — confirm the four blocks are structurally identical to the reservationsEnabled one.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/routes/admin/+page.svelte
git commit -m "feat(web): admin toggles for automated emails"
```

---

### Task 7: Send points — password reset + reservation confirmation

**Files:**
- Create: `apps/api/src/emailPayloads.ts`
- Modify: `apps/api/src/index.ts` (`POST /api/auth/forgot` ~line 690; `POST /api/reservations` handler)
- Test: `apps/api/test/emailPayloads.test.ts`

**Interfaces:**
- Consumes: `enqueueEmail` (Task 3), `nightsBetween`/`computeInvoice` (src/pricing.ts), `rowsToAdminSettings` (src/settings.ts).
- Produces: `buildReservationConfirmationData(reservation: {id: number; name: string; room: string | null; arrive: string | null; depart: string | null; people: number; room_count: number | null}, settings: AdminSettings, origin: string): Record<string, unknown> | null` — null when either date is missing (template requires pricing that needs nights).

- [ ] **Step 1: Failing tests** — `apps/api/test/emailPayloads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReservationConfirmationData } from "../src/emailPayloads";
import { rowsToAdminSettings } from "../src/settings";

const settings = rowsToAdminSettings([]); // defaults: nightly 89, tps 5, tvq 9.975, accom 3.5
const reservation = {
  id: 42, name: "Ada Lovelace", room: "Refuge du Rider",
  arrive: "2026-08-01", depart: "2026-08-03", people: 2, room_count: 1,
};

describe("buildReservationConfirmationData", () => {
  it("computes the compounding tax cascade for 2 nights at the default rate", () => {
    const d = buildReservationConfirmationData(reservation, settings, "https://www.aubergeduvieuxpont.ca")!;
    expect(d.confirmationCode).toBe("#42");
    expect(d.name).toBe("Ada Lovelace");
    expect(d.nights).toBe(2);
    expect(d.nightlyPrice).toBe(89);
    expect(d.subtotal).toBe(178);
    expect(d.accommodationTax).toBe(6.23);        // 178 * 3.5%
    expect(d.tps).toBe(9.21);                     // (178+6.23) * 5%
    expect(d.tvq).toBe(19.3);                     // (178+6.23+9.21) * 9.975%
    expect(d.total).toBe(212.74);
    expect(d.guests).toBe(2);
    expect(d.roomLabel).toBe("Refuge du Rider");
    expect(d.manageUrl).toBe("https://www.aubergeduvieuxpont.ca/profil");
    expect(d.checkIn).toBe("2026-08-01");
    expect(d.checkOut).toBe("2026-08-03");
  });

  it("returns null when dates are missing", () => {
    expect(buildReservationConfirmationData({ ...reservation, arrive: null }, settings, "x")).toBeNull();
    expect(buildReservationConfirmationData({ ...reservation, depart: null }, settings, "x")).toBeNull();
  });

  it("labels an unassigned room", () => {
    const d = buildReservationConfirmationData({ ...reservation, room: null }, settings, "x")!;
    expect(d.roomLabel).toBe("À déterminer");
  });
});
```

**IMPORTANT:** before finalizing the expected tax numbers, run the real `computeInvoice` in a scratch script with `{nights: 2, roomCount: 1, effectiveNightly: 89, tps: 5, tvq: 9.975, accommodationTax: 3.5, type: "final", weeklyRate: 560}` and use ITS outputs as the expected values (the weekly-rate rule from PR #40 may change `base` for ≥7-night stays only, but verify for 2 nights too). The test must assert what `computeInvoice` actually produces — the cascade percentages above are the design intent, not gospel.

- [ ] **Step 2: Run to verify failure**, then implement `apps/api/src/emailPayloads.ts`:

```ts
import { nightsBetween, computeInvoice } from "./pricing";
import type { AdminSettings } from "./settings";

// The reservation-confirmation template requires the full price breakdown;
// without both dates there is nothing to price, so we skip the email (null).
export function buildReservationConfirmationData(
  reservation: {
    id: number;
    name: string;
    room: string | null;
    arrive: string | null;
    depart: string | null;
    people: number;
    room_count: number | null;
  },
  settings: AdminSettings,
  origin: string,
): Record<string, unknown> | null {
  if (!reservation.arrive || !reservation.depart) return null;
  const nights = nightsBetween(reservation.arrive, reservation.depart);
  if (nights <= 0) return null;
  const invoice = computeInvoice({
    nights,
    roomCount: reservation.room_count ?? 1,
    effectiveNightly: settings.nightlyPrice,
    weeklyRate: settings.weeklyPrice,
    tps: settings.tps,
    tvq: settings.tvq,
    accommodationTax: settings.accommodationTax,
    type: "final",
  });
  return {
    confirmationCode: `#${reservation.id}`,
    name: reservation.name,
    checkIn: reservation.arrive,
    checkOut: reservation.depart,
    guests: reservation.people,
    roomLabel: reservation.room ?? "À déterminer",
    nightlyPrice: invoice.effectiveNightly,
    nights: invoice.nights,
    subtotal: invoice.base,
    accommodationTax: invoice.accommodationTax,
    tps: invoice.tps,
    tvq: invoice.tvq,
    total: invoice.total,
    manageUrl: `${origin}/profil`,
  };
}
```

(Match `ComputeInvoiceParams` exactly — read `apps/api/src/pricing.ts:71-102`; if `type: "final"` isn't a valid variant, use whatever the non-deposit variant is named.)

- [ ] **Step 3: Wire `POST /api/auth/forgot`** — in the branch where the token is inserted (user exists), after the INSERT add:

```ts
        const origin = new URL(c.req.url).origin;
        await enqueueEmail(sql, {
          template: "password-reset",
          to: user.email,
          payload: {
            firstName: user.first_name ?? user.name ?? "client",
            resetUrl: `${origin}/reinitialisation?token=${rawToken}`,
            expiryHours: 1,
          },
        });
```

(Fetch `first_name` in the handler's existing user SELECT if it isn't already selected. The response stays `{ ok: true }` always — no enumeration change.)

- [ ] **Step 4: Wire `POST /api/reservations`** — after the reservation insert succeeds (`created` exists) and BEFORE the existing HubSpot `waitUntil`, add a second fire-and-forget:

```ts
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const rows = (await sql`SELECT key, value FROM settings`) as { key: string; value: string }[];
          const settings = rowsToAdminSettings(rows);
          const data = buildReservationConfirmationData(created, settings, new URL(c.req.url).origin);
          if (data) {
            await enqueueEmail(sql, { template: "reservation-confirmation", to: created.email, payload: data });
          }
        } catch (err) {
          console.error("confirmation email enqueue failed", err);
        }
      })()
    );
```

Add the imports (`enqueueEmail`, `buildReservationConfirmationData`; `rowsToAdminSettings` is already imported).

- [ ] **Step 5: Green + full suite**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/emailPayloads.ts apps/api/src/index.ts apps/api/test/emailPayloads.test.ts
git commit -m "feat(api): send password-reset and reservation-confirmation emails (toggle-gated)"
```

---

### Task 8: Send point — room-assigned email

**Files:**
- Modify: `apps/api/src/index.ts` (`POST /api/admin/reservations/:id/assignments`, after the successful INSERT ~line 1209-1215)

**Interfaces:**
- Consumes: `enqueueEmail` (Task 3); `room-assigned` template requires `name, roomLabel, checkIn, checkOut, passkeyEnabled` (+ optional `passkey`, `confirmationCode`).

- [ ] **Step 1: Add the hook** — after the assignment INSERT succeeds, before the 201 return:

```ts
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const resRows = (await sql`
            SELECT name, email, to_char(arrive, 'YYYY-MM-DD') AS arrive, to_char(depart, 'YYYY-MM-DD') AS depart
            FROM reservations WHERE id = ${reservationId}
          `) as { name: string; email: string; arrive: string | null; depart: string | null }[];
          const roomRows = (await sql`
            SELECT name, passkey_enabled, passkey FROM rooms WHERE slug = ${data.roomSlug}
          `) as { name: string; passkey_enabled: boolean; passkey: string | null }[];
          const r = resRows[0];
          const room = roomRows[0];
          // Airbnb-sourced reservations have an empty email — nothing to send to.
          if (!r || !room || !r.email) return;
          await enqueueEmail(sql, {
            template: "room-assigned",
            to: r.email,
            payload: {
              name: r.name,
              roomLabel: room.name,
              checkIn: r.arrive ?? "",
              checkOut: r.depart ?? "",
              passkeyEnabled: room.passkey_enabled && !!room.passkey,
              passkey: room.passkey ?? undefined,
              confirmationCode: `#${reservationId}`,
            },
          });
        } catch (err) {
          console.error("room-assigned email enqueue failed", err);
        }
      })()
    );
```

(Use the handler's actual local variable names for the reservation id and validated room slug — read the handler first; `data.roomSlug` may be named differently in `AssignRoomSchema`.)

- [ ] **Step 2: Verify + commit**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest/apps/api && npm test && npm run typecheck
git add apps/api/src/index.ts
git commit -m "feat(api): room-assigned email on admin room assignment (toggle-gated)"
```

---

### Task 9: OTA guest provisioning + welcome email

**Files:**
- Create: `apps/api/src/provisioning.ts`
- Modify: `apps/api/src/index.ts` (`/internal/ota-bookings` parsed branch, after the `'parsed'` log insert ~line 495), `apps/web/src/routes/reinitialisation/+page.svelte` (welcome copy)
- Test: `apps/api/test/provisioning.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (src/auth/password.ts), `generateToken`/`sha256hex` (src/auth/session.ts), `enqueueEmail` (Task 3), `reservations.user_id` (Task 1).
- Produces: `async function provisionOtaGuest(sql: NeonSql, input: { reservationId: number; guestEmail: string; firstName: string; lastName: string | null; externalRef: string; checkIn: string; checkOut: string }): Promise<void>` — never throws (all failures logged).

- [ ] **Step 1: Failing tests** — `apps/api/test/provisioning.test.ts`, using a scripted tagged-template sql mock (same style as Task 3's enqueue tests):

```ts
import { describe, it, expect } from "vitest";
import { provisionOtaGuest } from "../src/provisioning";

type Q = { q: string; vals: unknown[] };

function makeSql(script: (q: string, vals: unknown[]) => unknown[] | undefined) {
  const calls: Q[] = [];
  const sql = async (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join("$");
    calls.push({ q, vals });
    return script(q, vals) ?? [];
  };
  return { sql: sql as any, calls };
}

const input = {
  reservationId: 10,
  guestEmail: "relay@m.expediapartnercentral.com",
  firstName: "Marie",
  lastName: "Gagnon",
  externalRef: "2511634261",
  checkIn: "2026-09-05",
  checkOut: "2026-09-06",
};

describe("provisionOtaGuest", () => {
  it("creates the user, links the reservation, mints a 30-day token, enqueues welcome", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return []; // no existing user
      if (q.includes("INSERT INTO users")) return [{ id: 77 }];
      if (q.includes("FROM settings")) return [{ value: "true" }]; // toggle on
      return [];
    });
    await provisionOtaGuest(sql, input);
    const inserts = calls.map((c) => c.q);
    expect(inserts.some((q) => q.includes("INSERT INTO users"))).toBe(true);
    const link = calls.find((c) => c.q.includes("UPDATE reservations") && c.q.includes("user_id"));
    expect(link).toBeDefined();
    expect(link!.vals).toContain(77);
    expect(link!.vals).toContain(10);
    const token = calls.find((c) => c.q.includes("INSERT INTO password_reset_tokens"));
    expect(token).toBeDefined();
    expect(token!.q).toContain("30 days");
    const outbox = calls.find((c) => c.q.includes("INSERT INTO email_outbox"));
    expect(outbox).toBeDefined();
    const payload = JSON.parse(String(outbox!.vals.find((v) => typeof v === "string" && String(v).includes("setPasswordUrl"))));
    expect(payload.setPasswordUrl).toMatch(/^https:\/\/www\.aubergeduvieuxpont\.ca\/reinitialisation\?token=[0-9a-f]{64}&welcome=1$/);
    expect(payload.confirmationCode).toBe("2511634261");
    expect(payload.firstName).toBe("Marie");
  });

  it("reuses an existing user and still links + mints", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return [{ id: 5 }];
      if (q.includes("FROM settings")) return [{ value: "true" }];
      return [];
    });
    await provisionOtaGuest(sql, input);
    expect(calls.some((c) => c.q.includes("INSERT INTO users"))).toBe(false);
    const link = calls.find((c) => c.q.includes("UPDATE reservations"));
    expect(link!.vals).toContain(5);
  });

  it("skips the email when the toggle is off but still provisions", async () => {
    const { sql, calls } = makeSql((q) => {
      if (q.includes("SELECT id") && q.includes("FROM users")) return [{ id: 5 }];
      if (q.includes("FROM settings")) return [{ value: "false" }];
      return [];
    });
    await provisionOtaGuest(sql, input);
    expect(calls.some((c) => c.q.includes("UPDATE reservations"))).toBe(true);
    expect(calls.some((c) => c.q.includes("INSERT INTO password_reset_tokens"))).toBe(true);
    expect(calls.some((c) => c.q.includes("INSERT INTO email_outbox"))).toBe(false);
  });

  it("never throws when the DB errors", async () => {
    const sql = (async () => { throw new Error("db down"); }) as any;
    await expect(provisionOtaGuest(sql, input)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement `apps/api/src/provisioning.ts`:

```ts
import { hashPassword } from "./auth/password";
import { generateToken, sha256hex } from "./auth/session";
import { enqueueEmail } from "./emailOutbox";

const SITE_ORIGIN = "https://www.aubergeduvieuxpont.ca";

type NeonSql = (strings: TemplateStringsArray, ...vals: unknown[]) => Promise<unknown>;

/**
 * Find-or-create a portal account for an OTA guest, link the reservation,
 * and (toggle permitting) send the set-password welcome email. Best-effort:
 * the booking must never fail because provisioning did, so every error is
 * swallowed after logging.
 */
export async function provisionOtaGuest(
  sql: NeonSql,
  input: {
    reservationId: number;
    guestEmail: string;
    firstName: string;
    lastName: string | null;
    externalRef: string;
    checkIn: string;
    checkOut: string;
  },
): Promise<void> {
  try {
    const existing = (await sql`
      SELECT id FROM users WHERE lower(email) = lower(${input.guestEmail})
    `) as { id: number }[];

    let userId = existing[0]?.id;
    if (!userId) {
      const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
      // Unusable random password: the guest sets their real one via the link.
      const passwordHash = await hashPassword(generateToken());
      const created = (await sql`
        INSERT INTO users (email, password_hash, name, role, first_name, last_name)
        VALUES (${input.guestEmail}, ${passwordHash}, ${name}, 'guest', ${input.firstName}, ${input.lastName})
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as { id: number }[];
      userId = created[0]?.id;
      if (!userId) return; // raced with another insert; next email re-links
    }

    await sql`UPDATE reservations SET user_id = ${userId} WHERE id = ${input.reservationId}`;

    const rawToken = generateToken();
    const tokenHash = await sha256hex(rawToken);
    await sql`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (${tokenHash}, ${userId}, now() + interval '30 days')
    `;

    await enqueueEmail(sql as never, {
      template: "ota-welcome",
      to: input.guestEmail,
      payload: {
        firstName: input.firstName,
        confirmationCode: input.externalRef,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        setPasswordUrl: `${SITE_ORIGIN}/reinitialisation?token=${rawToken}&welcome=1`,
      },
    });
  } catch (err) {
    console.error("ota provisioning failed (reservation kept)", err);
  }
}
```

- [ ] **Step 3: Hook into `/internal/ota-bookings`** — in `apps/api/src/index.ts`, right after the `email_ingest_log ... 'parsed'` INSERT (and alongside the existing HubSpot `waitUntil`), add:

```ts
  if (d.guestEmail) {
    c.executionCtx.waitUntil(
      provisionOtaGuest(sql, {
        reservationId: created.id,
        guestEmail: d.guestEmail,
        firstName: d.firstName,
        lastName: d.lastName,
        externalRef: d.externalRef,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
      })
    );
  }
```

Import `provisionOtaGuest` at the top.

- [ ] **Step 4: Welcome copy on `/reinitialisation`** — in `apps/web/src/routes/reinitialisation/+page.svelte`, read `welcome` from the query string next to `token`; when `welcome === "1"`, swap the page heading/intro to welcome wording («Bienvenue ! / Choisissez votre mot de passe pour accéder à votre espace client.») while leaving the form, validation, and error/success states untouched.

- [ ] **Step 5: Green + full verify**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm test && npm run typecheck && npm run build:web
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/provisioning.ts apps/api/src/index.ts apps/api/test/provisioning.test.ts apps/web/src/routes/reinitialisation/+page.svelte
git commit -m "feat: auto-provision portal accounts for Expedia guests with set-password welcome email"
```

---

### Task 10: Profile email change + HubSpot `contact.updateById`

**Files:**
- Modify: `apps/api/src/index.ts` (GET /api/profile matching; new POST /api/profile/email), `apps/hubspot/src/ops/registry.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/routes/profil/+page.svelte`
- Create: `apps/hubspot/src/ops/contactUpdateById.ts`
- Test: `apps/hubspot/test/ops.test.ts` (extend), `apps/api/test/auth.test.ts` or new `apps/api/test/profileEmail.test.ts` for the schema

**Interfaces:**
- Produces: `POST /api/profile/email` `{newEmail, currentPassword}` → 200 `{user}` | 400 | 401 | 409 `{error: "Cette adresse courriel est déjà utilisée."}`; HubSpot op kind `contact.updateById` payload `{contactId: string, properties: Record<string, string>}`; web helper `changeProfileEmail(newEmail: string, currentPassword: string)`.

- [ ] **Step 1: HubSpot op (TDD)** — append to `apps/hubspot/test/ops.test.ts` (mirror the contact.getById executor test: mock global fetch):

```ts
describe("contact.updateById", () => {
  it("validates payload", () => {
    expect(ContactUpdateByIdSchema.safeParse({ contactId: "123", properties: { email: "a@b.co" } }).success).toBe(true);
    expect(ContactUpdateByIdSchema.safeParse({ contactId: "", properties: {} }).success).toBe(false);
    expect(parseEnvelope({ kind: "contact.updateById", payload: { contactId: "1", properties: { email: "a@b.co" } } }).ok).toBe(true);
  });

  it("PATCHes the contact", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "123", properties: { email: "new@b.co" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await executeContactUpdateById(mockEnv, { contactId: "123", properties: { email: "new@b.co" } });
    expect(r.ok).toBe(true);
    expect(r.hubspotId).toBe("123");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/crm/v3/objects/contacts/123");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ properties: { email: "new@b.co" } });
    vi.unstubAllGlobals();
  });
});
```

Implement `apps/hubspot/src/ops/contactUpdateById.ts`:

```ts
import { z } from "zod";
import { hubspotFetch } from "../hubspotClient";
import type { Env } from "../env";

export const ContactUpdateByIdSchema = z.object({
  contactId: z.string().min(1),
  properties: z.record(z.string(), z.string()).refine((p) => Object.keys(p).length > 0, "properties required"),
});
export type ContactUpdateByIdPayload = z.infer<typeof ContactUpdateByIdSchema>;

export async function executeContactUpdateById(
  env: Env,
  payload: ContactUpdateByIdPayload,
  _dedupeKey?: string,
): Promise<{ ok: true; hubspotId: string }> {
  const result = (await hubspotFetch(env, `/crm/v3/objects/contacts/${payload.contactId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: payload.properties }),
  })) as { id?: string };
  if (!result || !result.id) throw new Error(`Contact ${payload.contactId} update returned no id`);
  return { ok: true, hubspotId: result.id };
}
```

Register in `registry.ts`: add `"contact.updateById"` to both kind unions, import, and add the registry entry following `contact.getById`'s exact pattern. Run `cd apps/hubspot && npm test && npm run typecheck` → green.

- [ ] **Step 2: API endpoint** — in `apps/api/src/index.ts`, after the `GET /api/profile` handler:

First change the profile reservations query (GET /api/profile) to:

```ts
    WHERE user_id = ${user.id} OR lower(email) = lower(${user.email})
```

Then add the schema next to the other auth schemas:

```ts
const ProfileEmailSchema = z.object({
  newEmail: z.string().trim().email("adresse courriel invalide"),
  currentPassword: z.string().min(1, "mot de passe requis"),
});
```

And the route:

```ts
app.post(
  "/api/profile/email",
  authRateLimiter,
  zValidator("json", ProfileEmailSchema, authHook),
  async (c) => {
    const user = await getAuthUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const data = c.req.valid("json");
    const sql = neon(c.env.DB_CONN);

    const rows = (await sql`SELECT password_hash, hubspot_contact_id FROM users WHERE id = ${user.id}`) as {
      password_hash: string;
      hubspot_contact_id: string | null;
    }[];
    const row = rows[0];
    if (!row || !(await verifyPassword(data.currentPassword, row.password_hash))) {
      return c.json({ error: "Mot de passe incorrect" }, 401);
    }

    const taken = (await sql`
      SELECT id FROM users WHERE lower(email) = lower(${data.newEmail}) AND id <> ${user.id}
    `) as { id: number }[];
    if (taken.length > 0) {
      return c.json({ error: "Cette adresse courriel est déjà utilisée." }, 409);
    }

    const updated = (await sql`
      UPDATE users SET email = ${data.newEmail} WHERE id = ${user.id}
      RETURNING id, email, name, role, hubspot_contact_id
    `) as { id: number; email: string; name: string | null; role: string; hubspot_contact_id: string | null }[];

    // Real-email capture: update the SAME HubSpot contact, never a new one.
    if (row.hubspot_contact_id) {
      c.executionCtx.waitUntil(
        (async () => {
          try {
            await c.env.HUBSPOT.fetch(
              new Request("http://hubspot/ops/enqueue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kind: "contact.updateById",
                  payload: { contactId: row.hubspot_contact_id, properties: { email: data.newEmail } },
                  dedupeKey: `user-${user.id}-email-${data.newEmail.toLowerCase()}`,
                }),
              })
            );
          } catch {}
        })()
      );
    }

    const u = updated[0];
    return c.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, hubspotContactId: u.hubspot_contact_id } });
  }
);
```

Export `ProfileEmailSchema` from index.ts (like `ReservationRequestSchema`) and create `apps/api/test/profileEmail.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ProfileEmailSchema } from "../src/index";

describe("ProfileEmailSchema", () => {
  it("accepts a valid payload", () => {
    const r = ProfileEmailSchema.safeParse({ newEmail: "  marie@example.com ", currentPassword: "s3cret!!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newEmail).toBe("marie@example.com");
  });

  it("rejects an invalid email", () => {
    expect(ProfileEmailSchema.safeParse({ newEmail: "nope", currentPassword: "x" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(ProfileEmailSchema.safeParse({ newEmail: "a@b.co", currentPassword: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Web** — `apps/web/src/lib/api.ts`:

```ts
export async function changeProfileEmail(
  newEmail: string,
  currentPassword: string,
): Promise<{ user: User } | ApiError> {
  return fetchJson<{ user: User }>("/profile/email", {
    method: "POST",
    body: JSON.stringify({ newEmail, currentPassword }),
  });
}
```

(Match `changePassword`'s exact fetchJson invocation style — headers/content-type come from the shared helper.)

`apps/web/src/routes/profil/+page.svelte`: below the read-only info block, add an «Adresse courriel» form modeled exactly on the existing change-password form (same classes, error/success flash pattern): fields `newEmail` (type email) + `currentPassword`, French intro line «Remplacez l'adresse Expedia par votre adresse personnelle pour recevoir vos confirmations.», submit calls `changeProfileEmail`, on success updates the displayed user email and shows the flash. `data-testid="profil-email-form"`.

- [ ] **Step 4: Full verification**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm test && npm run typecheck && npm run build:web
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/test apps/hubspot/src apps/hubspot/test apps/web/src/lib/api.ts apps/web/src/routes/profil/+page.svelte
git commit -m "feat: profile email change with HubSpot contact.updateById capture"
```

---

### Task 11: Docs + final verification

**Files:**
- Modify: `CLAUDE.md` (Configurable Settings section: the four toggle keys; architecture note: email_outbox + cron), `apps/email-ingest/README.md` (Behaviour: Expedia bookings also provision a portal account + welcome email when the toggle is on)
- Create: `apps/api/EMAILS.md` (short ops runbook)

- [ ] **Step 1: `apps/api/EMAILS.md`**:

```markdown
# Outbound email (Resend)

- Queue: `email_outbox` table, drained every minute by the API worker cron.
- Sender: `Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>`; Reply-To = the
  `contact_email` setting.
- Each email type has an admin toggle (admin → Paramètres → Courriels
  automatiques), default OFF: confirmation, password reset, room assignment,
  OTA welcome. Toggles are checked when the email is enqueued.
- Failures retry with backoff (30s → 1h, 8 attempts) then mark `failed` with
  the provider error in `last_error`.

## One-time setup

1. Resend account → add domain `aubergeduvieuxpont.ca` → add the DNS records
   Resend shows (Cloudflare dashboard) → wait for Verified.
2. `cd apps/api && npx wrangler secret put RESEND_API_KEY` (local dev reads it
   from the repo-root `.dev.env`).
3. Apply migrations BEFORE deploying (`npm run db:migrate`).
4. Enable toggles one at a time and test each type; watch
   `SELECT * FROM email_outbox ORDER BY id DESC` for failures.
```

- [ ] **Step 2: CLAUDE.md + email-ingest README** edits per Files above (one short paragraph each; keep to facts implemented).

- [ ] **Step 3: Full-repo verification**

```bash
cd /Users/ychasse/Downloads/wt-email-ingest && npm test && npm run typecheck && npm run build:web
```

Expected: every workspace green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/api/EMAILS.md apps/email-ingest/README.md
git commit -m "docs: outbound email runbook + architecture notes"
```

---

### Post-plan (release checklist — controller/operator)

1. Push branch, open PR, merge after CI.
2. Migrations were already applied to the shared DB in Task 1 (single Neon DB); re-run `npm run db:migrate` if the branch sat for long.
3. Set the prod secret: `cd apps/api && npx wrangler secret put RESEND_API_KEY` (same key as `.dev.env`, or a prod-specific one).
4. Operator: verify the Resend domain (DNS records) BEFORE enabling any toggle.
5. Deploy happens via CI on merge. Then enable toggles one at a time: test password reset (own account), website confirmation (test reservation), welcome (DEV_SENDER Expedia forward — full loop: account created, email received at the relay/test address, set-password link works), room assignment.
6. Watch `email_outbox` and the Resend dashboard for the first sends.
