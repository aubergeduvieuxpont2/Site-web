# Review-Request Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 3-day review-request window with configurable send timing, a response-gated reminder, a per-guest suppression window, and an admin-initiated manual send from the reservation detail modal.

**Architecture:** All scheduling stays in Postgres. `enqueueReviewRequests()` keeps its single call site in the Worker's `scheduled` handler and grows a second pass for reminders; eligibility is expressed as SQL comparing `now()` against a wall-clock local instant, so DST is Postgres's problem, not ours. Response state lives in two new nullable columns on `review_requests`, written by the public review handler. The manual send is a new admin route that reuses the same enqueue helper with the toggle forced off.

**Tech Stack:** Hono on Cloudflare Workers, Neon Postgres via `@neondatabase/serverless`, Zod validation, Handlebars email templates (precompiled), Svelte 5 (runes) + Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-review-request-lifecycle-design.md`

## Global Constraints

- Worktree: `/Users/ychasse/Downloads/wt-review-lifecycle`, branch `feat/review-request-lifecycle`. All edits happen here, never in the primary checkout.
- Send hour is `14` local; timezone is `America/Toronto`. Both are exported constants, never inlined as literals outside their definition.
- Settings keys are snake_case in the DB, camelCase in the API: `review_request_delay_days`/`reviewRequestDelayDays`, `review_reminder_delay_days`/`reviewReminderDelayDays`, `review_suppression_months`/`reviewSuppressionMonths`.
- Defaults: first-request delay `0` days, reminder delay `7` days, suppression `6` months. `0` disables the reminder and disables suppression respectively.
- None of the three new keys goes in `PUBLIC_SETTING_KEYS` — admin-only.
- Migrations: `ADD COLUMN IF NOT EXISTS` only; ALTERs and settings seeds live in separate files; do not touch `apps/api/schema.sql` in this branch.
- Every SQL value is interpolated through the tagged-template driver (`sql\`...\``), never string-concatenated.
- Run `npm run typecheck` from the repo root before each commit.

---

### Task 1: Migrations

**Files:**
- Create: `apps/api/migrations/0046_review_requests_lifecycle.sql`
- Create: `apps/api/migrations/0047_settings_review_timing.sql`

**Interfaces:**
- Produces: columns `review_requests.reminder_sent_at`, `review_requests.responded_at`; index `idx_reservations_email_lower`; settings rows `review_request_delay_days`, `review_reminder_delay_days`, `review_suppression_months`.

- [ ] **Step 1: Write the column migration**

`apps/api/migrations/0046_review_requests_lifecycle.sql`:

```sql
-- Review-request lifecycle: reminder + response tracking.
-- Both columns are nullable; existing rows are unaffected and the
-- currently-deployed API ignores them.
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE review_requests ADD COLUMN IF NOT EXISTS responded_at     TIMESTAMPTZ;

-- Supports the per-guest suppression subquery, which matches on lower(email).
CREATE INDEX IF NOT EXISTS idx_reservations_email_lower ON reservations (lower(email));
```

- [ ] **Step 2: Write the settings seed migration**

`apps/api/migrations/0047_settings_review_timing.sql`. Kept separate from the ALTERs so a failed column add cannot silently discard the seeds:

```sql
-- Operator-configurable review-request timing.
-- review_reminder_delay_days = 0 disables reminders.
-- review_suppression_months  = 0 disables per-guest suppression.
INSERT INTO settings (key, value) VALUES
  ('review_request_delay_days',  '0'),
  ('review_reminder_delay_days', '7'),
  ('review_suppression_months',  '6')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Verify both files are idempotent by inspection**

Confirm every statement is `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`. Do **not** run `npm run db:migrate` — `.dev.env`'s `DB_CONN` points at production Neon, and the deploy-ordering step at the end of this plan covers when to apply these.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/0046_review_requests_lifecycle.sql apps/api/migrations/0047_settings_review_timing.sql
git commit -m "feat(db): review-request reminder + response columns, timing settings"
```

---

### Task 2: Settings — defaults, validation, mapping

**Files:**
- Modify: `apps/api/src/settings.ts`
- Modify: `apps/api/src/index.ts` (the `POST /api/admin/settings` handler, the `Promise.all([...])` block around line 2698)
- Test: `apps/api/test/settings.test.ts`

**Interfaces:**
- Produces: `SETTINGS_DEFAULTS.review_request_delay_days` (`0`), `.review_reminder_delay_days` (`7`), `.review_suppression_months` (`6`); `AdminSettings.reviewRequestDelayDays`, `.reviewReminderDelayDays`, `.reviewSuppressionMonths`, all `number`.

- [ ] **Step 1: Write failing tests**

Append to `apps/api/test/settings.test.ts`:

```ts
describe("review timing settings", () => {
  it("defaults to 0 / 7 / 6 when no rows exist", () => {
    const s = rowsToAdminSettings([]);
    expect(s.reviewRequestDelayDays).toBe(0);
    expect(s.reviewReminderDelayDays).toBe(7);
    expect(s.reviewSuppressionMonths).toBe(6);
  });

  it("reads stored values", () => {
    const s = rowsToAdminSettings([
      { key: "review_request_delay_days", value: "2" },
      { key: "review_reminder_delay_days", value: "10" },
      { key: "review_suppression_months", value: "3" },
    ]);
    expect(s.reviewRequestDelayDays).toBe(2);
    expect(s.reviewReminderDelayDays).toBe(10);
    expect(s.reviewSuppressionMonths).toBe(3);
  });

  it("falls back to the default when a stored value is unparseable", () => {
    const s = rowsToAdminSettings([
      { key: "review_reminder_delay_days", value: "not-a-number" },
    ]);
    expect(s.reviewReminderDelayDays).toBe(7);
  });

  it("rejects negatives and non-integers", () => {
    expect(SettingsUpdateSchema.safeParse({ ...VALID_SETTINGS, reviewRequestDelayDays: -1 }).success).toBe(false);
    expect(SettingsUpdateSchema.safeParse({ ...VALID_SETTINGS, reviewSuppressionMonths: 1.5 }).success).toBe(false);
  });

  it("rejects values above the caps", () => {
    expect(SettingsUpdateSchema.safeParse({ ...VALID_SETTINGS, reviewRequestDelayDays: 366 }).success).toBe(false);
    expect(SettingsUpdateSchema.safeParse({ ...VALID_SETTINGS, reviewSuppressionMonths: 61 }).success).toBe(false);
  });

  it("accepts 0 for reminder and suppression", () => {
    expect(SettingsUpdateSchema.safeParse({ ...VALID_SETTINGS, reviewReminderDelayDays: 0, reviewSuppressionMonths: 0 }).success).toBe(true);
  });
});
```

If `VALID_SETTINGS` does not already exist in that file, define it at the top as a complete valid payload (every field in `SettingsUpdateSchema`) and reuse it. Add the three new fields to it.

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/api && npx vitest run test/settings.test.ts`
Expected: FAIL — `reviewRequestDelayDays` is `undefined`.

- [ ] **Step 3: Add the defaults**

In `apps/api/src/settings.ts`, extend `SETTINGS_DEFAULTS` (after `email_review_request_enabled: false,`):

```ts
  review_request_delay_days: 0,
  review_reminder_delay_days: 7,
  review_suppression_months: 6,
```

- [ ] **Step 4: Add schema validation**

Extend `SettingsUpdateSchema` (after `emailReviewRequestEnabled`):

```ts
  reviewRequestDelayDays: z.coerce.number().int().min(0).max(365),
  reviewReminderDelayDays: z.coerce.number().int().min(0).max(365),
  reviewSuppressionMonths: z.coerce.number().int().min(0).max(60),
```

- [ ] **Step 5: Add the row mapping**

In `rowsToAdminSettings`, after `emailReviewRequestEnabled`. `parseInt` returns `NaN` for unparseable text, so guard with a helper defined just above the function:

```ts
// settings values are TEXT; fall back to the default when a row is absent or
// holds something that is not an integer.
function intSetting(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}
```

```ts
    reviewRequestDelayDays: intSetting(
      rowMap.get("review_request_delay_days"),
      SETTINGS_DEFAULTS.review_request_delay_days
    ),
    reviewReminderDelayDays: intSetting(
      rowMap.get("review_reminder_delay_days"),
      SETTINGS_DEFAULTS.review_reminder_delay_days
    ),
    reviewSuppressionMonths: intSetting(
      rowMap.get("review_suppression_months"),
      SETTINGS_DEFAULTS.review_suppression_months
    ),
```

Add the same three fields to the `AdminSettings` interface as `number`. Do **not** add them to `toPublicSettings` or `PUBLIC_SETTING_KEYS`.

- [ ] **Step 6: Persist them on save**

In `apps/api/src/index.ts`, add three entries to the `Promise.all([...])` in the settings POST handler, matching the surrounding style:

```ts
      sql`INSERT INTO settings (key, value) VALUES ('review_request_delay_days', ${data.reviewRequestDelayDays.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('review_reminder_delay_days', ${data.reviewReminderDelayDays.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      sql`INSERT INTO settings (key, value) VALUES ('review_suppression_months', ${data.reviewSuppressionMonths.toString()}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
```

- [ ] **Step 7: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run test/settings.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/settings.ts apps/api/src/index.ts apps/api/test/settings.test.ts
git commit -m "feat(api): configurable review-request timing settings"
```

---

### Task 3: `review-reminder` template + `review-request` room-line fix

**Files:**
- Create: `apps/api/emails/templates/review-reminder.fr.hbs`
- Create: `apps/api/emails/templates/review-reminder.en.hbs`
- Create: `apps/api/emails/samples/review-reminder.json`
- Modify: `apps/api/emails/templates/review-request.fr.hbs` (delete line 8)
- Modify: `apps/api/emails/templates/review-request.en.hbs` (delete line 8)
- Modify: `apps/api/emails/samples/review-request.json` (drop `roomLabel`)
- Modify: `apps/api/scripts/precompile-emails.mjs` (`KEYS`)
- Modify: `apps/api/src/emails/manifest.ts`
- Modify: `apps/api/src/emails/templates.ts`
- Modify: `apps/api/src/emailOutbox.ts` (`EmailTemplate`, `EMAIL_TOGGLE_KEYS`)
- Regenerate: `apps/api/src/emails/precompiled.ts`

**Interfaces:**
- Produces: template key `"review-reminder"`, usable as `EmailTemplate`. Payload is identical to `review-request`: `{ firstName, checkIn, checkOut, reviewUrl }`.

- [ ] **Step 1: Fix the blank room line in `review-request`**

Delete this line from **both** `apps/api/emails/templates/review-request.fr.hbs` and `review-request.en.hbs` (line 8 in each):

```hbs
  <p style="margin: 0 0 10px 0;"><strong>Chambre :</strong> {{roomLabel}}</p>
```

(the `.en.hbs` line reads `<strong>Room:</strong>`). `reviewRequests.ts` never supplied `roomLabel`, so this rendered as a bare label with no value in every live send. Leave the dates line below it intact.

Remove `"roomLabel": "Chambre Montagne",` from `apps/api/emails/samples/review-request.json`.

- [ ] **Step 2: Write the French reminder template**

`apps/api/emails/templates/review-reminder.fr.hbs`:

```hbs
<p>Bonjour {{firstName}},</p>

<p>Nous vous avons écrit il y a quelques jours au sujet de votre séjour à L'Auberge du Vieux Pont, du {{formatDate checkIn}} au {{formatDate checkOut}}.</p>

<p>Si vous avez un moment, votre avis nous serait très utile. Cela ne prend qu'une minute.</p>

<p style="text-align: center; margin: 20px 0;">
  <a href="{{reviewUrl}}" style="display: inline-block; padding: 12px 30px; background-color: #9d4300; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Laisser un avis</a>
</p>

<p>Si vous avez déjà répondu, merci — vous pouvez ignorer ce message.</p>

<p>Cordialement,<br/>
L'équipe du Vieux Pont</p>
```

- [ ] **Step 3: Write the English reminder template**

`apps/api/emails/templates/review-reminder.en.hbs`:

```hbs
<p>Hello {{firstName}},</p>

<p>We wrote to you a few days ago about your stay at L'Auberge du Vieux Pont, from {{formatDate checkIn}} to {{formatDate checkOut}}.</p>

<p>If you have a moment, we would really value your feedback. It only takes a minute.</p>

<p style="text-align: center; margin: 20px 0;">
  <a href="{{reviewUrl}}" style="display: inline-block; padding: 12px 30px; background-color: #9d4300; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Leave a review</a>
</p>

<p>If you have already replied, thank you — please ignore this message.</p>

<p>Best regards,<br/>
The Vieux Pont team</p>
```

- [ ] **Step 4: Write the sample payload**

`apps/api/emails/samples/review-reminder.json`:

```json
{
  "firstName": "Claude",
  "checkIn": "2026-07-14",
  "checkOut": "2026-07-16",
  "reviewUrl": "https://www.aubergeduvieuxpont.ca/avis/nouveau?code=AVP-ABCDEF"
}
```

- [ ] **Step 5: Register the template**

In `apps/api/scripts/precompile-emails.mjs`, add `"review-reminder",` to `KEYS` immediately after `"review-request",`.

In `apps/api/src/emails/manifest.ts`, add after the `review-request` entry, and drop `"roomLabel"` from `review-request`'s own `requiredFields`:

```ts
  "review-reminder": {
    name: { fr: "Rappel d'avis", en: "Review Reminder" },
    subject: {
      fr: "Un mot sur votre séjour ?",
      en: "A word about your stay?",
    },
    sampleFile: "review-reminder.json",
    requiredFields: ["firstName", "checkIn", "checkOut", "reviewUrl"],
  },
```

Add `"review-reminder",` to `TEMPLATE_KEYS` after `"review-request",`.

In `apps/api/src/emails/templates.ts`, import the sample and register it, mirroring `review-request`:

```ts
import reviewReminderSample from "../../emails/samples/review-reminder.json";
```

add `| "review-reminder"` to the local template-key union, and `"review-reminder": reviewReminderSample,` to the samples registry.

In `apps/api/src/emailOutbox.ts`, add `| "review-reminder"` to the `EmailTemplate` union and map it to the **same** toggle:

```ts
  "review-reminder": "email_review_request_enabled",
```

- [ ] **Step 6: Regenerate precompiled templates**

Run: `cd apps/api && npm run precompile:emails`
Expected: prints a `Precompiled N templates` line with N four higher than before (two new locales × … the script counts `KEYS.length * 2 + 5`, so N increases by 2).

- [ ] **Step 7: Run the email test suite**

Run: `cd apps/api && npx vitest run`
Expected: PASS. Any manifest/template-registry test that asserts a template count or key list will need its expectation updated to include `review-reminder`; update the expectation, not the source.

- [ ] **Step 8: Commit**

```bash
git add apps/api/emails apps/api/scripts/precompile-emails.mjs apps/api/src/emails apps/api/src/emailOutbox.ts
git commit -m "feat(email): review-reminder template; fix blank room line in review-request"
```

---

### Task 4: `enqueueEmail({ force })`

**Files:**
- Modify: `apps/api/src/emailOutbox.ts`
- Test: `apps/api/src/emailOutbox.test.ts`

**Interfaces:**
- Produces: `enqueueEmail(sql, { template, to, locale?, payload, force? })`. `force: true` skips the `EMAIL_TOGGLE_KEYS` check only.

- [ ] **Step 1: Write failing tests**

Append to `apps/api/src/emailOutbox.test.ts`, following the mocking style already used there:

```ts
describe("enqueueEmail force", () => {
  it("does not enqueue a toggle-gated template when the toggle is off", async () => {
    const sql = makeSql([[{ value: "false" }]]);
    const r = await enqueueEmail(sql as any, {
      template: "review-request",
      to: "a@b.com",
      payload: {},
    });
    expect(r.enqueued).toBe(false);
  });

  it("enqueues when force is true even though the toggle is off", async () => {
    const sql = makeSql([[]]);
    const r = await enqueueEmail(sql as any, {
      template: "review-request",
      to: "a@b.com",
      payload: {},
      force: true,
    });
    expect(r.enqueued).toBe(true);
  });

  it("does not read the settings table at all when force is true", async () => {
    const sql = makeSql([[]]);
    await enqueueEmail(sql as any, {
      template: "review-request",
      to: "a@b.com",
      payload: {},
      force: true,
    });
    // Only the INSERT should have run — no toggle SELECT.
    expect(sql).toHaveBeenCalledTimes(1);
  });
});
```

Reuse the file's existing `makeSql` helper; if it has none, copy the one from `apps/api/src/reviewRequests.test.ts`.

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/api && npx vitest run src/emailOutbox.test.ts -t force`
Expected: FAIL — `force` is not accepted and the toggle SELECT still runs.

- [ ] **Step 3: Implement**

In `enqueueEmail`'s input type add:

```ts
    /**
     * Admin-initiated send: bypasses the per-template settings toggle in
     * EMAIL_TOGGLE_KEYS. Does NOT affect ALWAYS_SEND, retries, or backoff.
     * Only pass this from an admin-authenticated route.
     */
    force?: boolean;
```

Destructure `force = false` alongside the other fields, and change the guard:

```ts
  // Security-critical templates always send; the other four are opt-in gated.
  // `force` is the admin override — see the field docs above.
  if (!force && !ALWAYS_SEND.has(template)) {
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run src/emailOutbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/emailOutbox.ts apps/api/src/emailOutbox.test.ts
git commit -m "feat(api): enqueueEmail force option for admin-initiated sends"
```

---

### Task 5: Cron rework — timing, suppression, reminder pass

**Files:**
- Modify: `apps/api/src/reviewRequests.ts`
- Modify: `apps/api/src/index.ts` (the `scheduled` handler, ~line 2956)
- Test: `apps/api/src/reviewRequests.test.ts`

**Interfaces:**
- Consumes: settings keys from Task 1/2; `enqueueEmail` from Task 4; template key `"review-reminder"` from Task 3.
- Produces: `enqueueReviewRequests(sql): Promise<{ enqueued: number; reminded: number }>`; exported constants `REVIEW_SEND_HOUR_LOCAL = 14`, `REVIEW_TIMEZONE = "America/Toronto"`.

- [ ] **Step 1: Write failing tests**

The existing tests drive a mocked `sql` that returns queued responses in order. The new implementation issues, in order: (1) one settings SELECT, (2) the first-request SELECT, (3) per row: an INSERT then an enqueue, (4) the reminder SELECT, (5) per row: an UPDATE then an enqueue. Update the existing suites' response arrays to account for the extra reminder SELECT, then append:

```ts
describe("enqueueReviewRequests — settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns { enqueued: 0, reminded: 0 } when the toggle is off", async () => {
    const sql = makeSql([[{ key: "email_review_request_enabled", value: "false" }]]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result).toEqual({ enqueued: 0, reminded: 0 });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("skips the reminder pass when the reminder delay is 0", async () => {
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "0" },
      ],
      [], // first-request select: no rows
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.reminded).toBe(0);
    // toggle select + first-request select only; no reminder select
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

describe("enqueueReviewRequests — reminder pass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enqueues a review-reminder for a due, unanswered request", async () => {
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "7" },
      ],
      [],            // first-request select
      [RESERVATION], // reminder select
      [],            // UPDATE reminder_sent_at
    ]);
    const result = await enqueueReviewRequests(sql as any);
    expect(result.reminded).toBe(1);
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      sql,
      expect.objectContaining({ template: "review-reminder", to: RESERVATION.email })
    );
  });

  it("stamps reminder_sent_at before enqueuing", async () => {
    mockEnqueueEmail.mockResolvedValue({ enqueued: true });
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_reminder_delay_days", value: "7" },
      ],
      [],
      [RESERVATION],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const updateCallIndex = sql.mock.calls.findIndex((c: any[]) =>
      String(c[0]).includes("reminder_sent_at = now()")
    );
    expect(updateCallIndex).toBeGreaterThan(-1);
    expect(mockEnqueueEmail).toHaveBeenCalled();
  });
});

describe("enqueueReviewRequests — SQL shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the local send hour rather than CURRENT_DATE", async () => {
    const sql = makeSql([
      [{ key: "email_review_request_enabled", value: "true" }],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const firstSelect = String(sql.mock.calls[1][0]);
    expect(firstSelect).toContain("AT TIME ZONE");
    expect(firstSelect).not.toContain("BETWEEN");
  });

  it("includes the suppression subquery", async () => {
    const sql = makeSql([
      [
        { key: "email_review_request_enabled", value: "true" },
        { key: "review_suppression_months", value: "6" },
      ],
      [],
    ]);
    await enqueueReviewRequests(sql as any);
    const firstSelect = String(sql.mock.calls[1][0]);
    expect(firstSelect).toContain("lower(r2.email)");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/api && npx vitest run src/reviewRequests.test.ts`
Expected: FAIL — the result shape lacks `reminded` and the SQL still uses `BETWEEN`.

- [ ] **Step 3: Implement the settings read and constants**

At the top of `apps/api/src/reviewRequests.ts`:

```ts
// Review emails go out at a fixed wall-clock hour in the auberge's local zone.
// Bare CURRENT_DATE would be UTC, which lands at 20:00 the previous evening in
// Quebec — while the guest is still in the room.
export const REVIEW_SEND_HOUR_LOCAL = 14;
export const REVIEW_TIMEZONE = "America/Toronto";

// A cron that was down should still catch up, but must not fire requests for
// long-past stays.
const CATCHUP_WINDOW_DAYS = 7;
```

Replace the toggle-only SELECT with one that reads all four keys at once:

```ts
  const settingRows = (await sql`
    SELECT key, value FROM settings
    WHERE key IN (
      'email_review_request_enabled',
      'review_request_delay_days',
      'review_reminder_delay_days',
      'review_suppression_months'
    )
  `) as { key: string; value: string }[];

  const setting = (k: string) => settingRows.find((r) => r.key === k)?.value;
  const intSetting = (k: string, fallback: number) => {
    const n = parseInt(setting(k) ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };

  if (setting("email_review_request_enabled") !== "true") {
    return { enqueued: 0, reminded: 0 };
  }

  const delayDays = intSetting("review_request_delay_days", 0);
  const reminderDelayDays = intSetting("review_reminder_delay_days", 7);
  const suppressionMonths = intSetting("review_suppression_months", 6);
```

- [ ] **Step 4: Implement the first-request pass**

Replace the `depart BETWEEN ...` predicate. The whole `WHERE` becomes:

```ts
  const reservations = (await sql`
    SELECT r.id, r.email, r.first_name, r.name, r.code,
           to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
           to_char(r.depart, 'YYYY-MM-DD')  AS depart
    FROM reservations r
    WHERE r.status = 'confirmed'
      AND r.email IS NOT NULL AND r.email <> ''
      AND r.code IS NOT NULL
      AND ((r.depart + make_interval(days => ${delayDays}))::timestamp
             + make_interval(hours => ${REVIEW_SEND_HOUR_LOCAL}))
          AT TIME ZONE ${REVIEW_TIMEZONE} <= now()
      AND ((r.depart + make_interval(days => ${delayDays}))::timestamp
             + make_interval(hours => ${REVIEW_SEND_HOUR_LOCAL}))
          AT TIME ZONE ${REVIEW_TIMEZONE} > now() - make_interval(days => ${CATCHUP_WINDOW_DAYS})
      AND NOT EXISTS (
        SELECT 1 FROM review_requests rr WHERE rr.reservation_id = r.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM reviews rv WHERE rv.reservation_id = r.id
      )
      AND (${suppressionMonths} = 0 OR NOT EXISTS (
        SELECT 1 FROM review_requests rr2
        JOIN reservations r2 ON r2.id = rr2.reservation_id
        WHERE lower(r2.email) = lower(r.email)
          AND rr2.sent_at > now() - make_interval(months => ${suppressionMonths})
      ))
    ORDER BY r.depart DESC
  `) as ReservationForReview[];
```

Extract the existing inline row type into a named `ReservationForReview` interface at module scope so the reminder pass can reuse it. The per-row body (dedupe INSERT, `firstName` fallback, `reviewUrl`, `enqueueEmail`) is unchanged apart from `template: "review-request"` staying explicit.

- [ ] **Step 5: Implement the reminder pass**

After the first loop, before the return:

```ts
  let reminded = 0;

  if (reminderDelayDays > 0) {
    const dueReminders = (await sql`
      SELECT r.id, r.email, r.first_name, r.name, r.code,
             to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
             to_char(r.depart, 'YYYY-MM-DD')  AS depart
      FROM review_requests rr
      JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.reminder_sent_at IS NULL
        AND rr.responded_at IS NULL
        AND rr.sent_at + make_interval(days => ${reminderDelayDays}) <= now()
        AND r.email IS NOT NULL AND r.email <> ''
        AND r.code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM reviews rv WHERE rv.reservation_id = rr.reservation_id
        )
      ORDER BY rr.sent_at ASC
    `) as ReservationForReview[];

    for (const res of dueReminders) {
      // Stamp first, mirroring the first pass: a failure mid-loop must not
      // leave the row eligible for a duplicate reminder.
      await sql`
        UPDATE review_requests SET reminder_sent_at = now()
        WHERE reservation_id = ${res.id} AND reminder_sent_at IS NULL
      `;

      const result = await enqueueEmail(sql, {
        template: "review-reminder",
        to: res.email,
        payload: buildReviewPayload(res),
      });

      if (result.enqueued) reminded++;
    }
  }

  return { enqueued, reminded };
```

Factor the payload construction used by both passes into one helper at module scope:

```ts
function buildReviewPayload(res: ReservationForReview) {
  const firstName =
    res.first_name?.trim() ||
    (res.name ?? "").trim().split(/\s+/)[0] ||
    "client";

  return {
    firstName,
    checkIn: res.arrive ?? "",
    checkOut: res.depart ?? "",
    reviewUrl: `${SITE_ORIGIN}/avis/nouveau?code=${res.code}`,
  };
}
```

Use it in the first pass too, replacing the inline construction.

The reminder deliberately has no suppression check — it belongs to the same conversation as a request already sent.

- [ ] **Step 6: Update the scheduled handler's log/return**

In `apps/api/src/index.ts`, the `scheduled` handler already ignores the return value; leave the call as-is. Confirm the comment above it still reads correctly now that there are two passes, and update it to say "review-request and reminder emails".

- [ ] **Step 7: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run src/reviewRequests.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reviewRequests.ts apps/api/src/index.ts apps/api/src/reviewRequests.test.ts
git commit -m "feat(api): local-hour review timing, per-guest suppression, reminder pass"
```

---

### Task 6: Write `responded_at` when a review is submitted

**Files:**
- Modify: `apps/api/src/reviews.ts` (the `INSERT INTO reviews` handler, ~line 195)
- Test: `apps/api/src/reviews.test.ts`

**Interfaces:**
- Consumes: `review_requests.responded_at` from Task 1.

- [ ] **Step 1: Write a failing test**

Append to `apps/api/src/reviewsRoutes.test.ts` — that is the route-level suite
(it drives the exported `app` from `index.ts` through the hoisted `neonHolder`
neon mock; `reviews.test.ts` covers `maskDisplayName`/`computeGuestStats`
internals only). Reuse the file's existing `neonHolder`, `ENV` and
`PAST_DEPART` fixtures:

```ts
it("stamps responded_at on the matching review_requests row", async () => {
  const statements: string[] = [];
  neonHolder.sql = (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    statements.push(text);
    // The handler's first query looks up the reservation by code.
    if (text.includes("FROM reservations r") && text.includes("WHERE r.code")) {
      return Promise.resolve([
        {
          id: 42,
          first_name: "Marie",
          last_name: "Tremblay",
          name: "Marie Tremblay",
          email: "marie@example.com",
          user_id: null,
          status: "confirmed",
          depart: PAST_DEPART,
        },
      ]);
    }
    return Promise.resolve([]);
  };

  const res = await app.request(
    "/api/reviews",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "AVP-ABCDEF", rating: 5, body: "Superbe séjour, merci." }),
    },
    ENV,
  );

  expect(res.status).toBe(201);
  const update = statements.find((s) => s.includes("UPDATE review_requests"));
  expect(update).toBeDefined();
  expect(update).toContain("responded_at = now()");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/api && npx vitest run src/reviews.test.ts -t responded_at`
Expected: FAIL — no such statement is issued.

- [ ] **Step 3: Implement**

Immediately after the `INSERT INTO reviews` try/catch succeeds, and before `return c.json({ ok: true }, 201);`:

```ts
      // Record that this guest answered, so the cron's reminder pass skips
      // them and the admin UI can show the response. A guest who reviews
      // without ever being asked simply has no row to update.
      await sql`
        UPDATE review_requests
        SET responded_at = now()
        WHERE reservation_id = ${reservation.id} AND responded_at IS NULL
      `;
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run src/reviews.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reviews.ts apps/api/src/reviews.test.ts
git commit -m "feat(api): record responded_at when a guest submits a review"
```

---

### Task 7: Manual-send endpoint

**Files:**
- Modify: `apps/api/src/index.ts` (register beside the other `/api/admin/reservations/:id/*` routes)
- Test: `apps/api/src/__tests__/adminReviewRequest.test.ts` (create)

**Interfaces:**
- Consumes: `enqueueEmail({ force: true })` from Task 4; `buildReviewPayload` exported from `reviewRequests.ts` in Task 5 (add `export` to it).
- Produces: `POST /api/admin/reservations/:id/review-request` → `200 { sent: true, sentAt: string, resent: boolean }`.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/__tests__/adminReviewRequest.test.ts`. It uses the same
hoisted-neon-mock + `app.request(...)` shape as `reviewsRoutes.test.ts`, plus
that suite's admin-session fixture (`ADMIN_USER`) for authentication. Mock
`enqueueEmail` so the toggle bypass is observable:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { neonHolder } = vi.hoisted(() => ({
  neonHolder: { sql: (() => Promise.resolve([])) as any },
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      neonHolder.sql(strings, ...values),
}));
vi.mock("../emailOutbox", async (orig) => ({
  ...(await orig<typeof import("../emailOutbox")>()),
  enqueueEmail: vi.fn().mockResolvedValue({ enqueued: true }),
}));

import { app } from "../index";
import { enqueueEmail } from "../emailOutbox";

const ENV = { DB_CONN: "postgres://stub" } as any;
const mockEnqueueEmail = vi.mocked(enqueueEmail);

const RESERVATION = {
  id: 42,
  email: "marie@example.com",
  first_name: "Marie",
  name: "Marie Tremblay",
  code: "AVP-ABCDEF",
  arrive: "2026-07-10",
  depart: "2026-07-15",
  has_request: false,
  responded_at: null,
};

// Returns the recorded statement texts so assertions can inspect them.
function stubDb(row: Record<string, unknown> | null) {
  const statements: string[] = [];
  neonHolder.sql = (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    statements.push(text);
    if (text.includes("LEFT JOIN review_requests")) {
      return Promise.resolve(row ? [row] : []);
    }
    return Promise.resolve([]);
  };
  return statements;
}

function post(id = 42, asAdmin = true) {
  return app.request(
    `/api/admin/reservations/${id}/review-request`,
    { method: "POST", headers: asAdmin ? adminAuthHeaders() : {} },
    ENV,
  );
}
```

`adminAuthHeaders()` is the helper the neighbouring admin-route tests already
use to mint an admin session; import it rather than reimplementing it.

```ts
describe("POST /api/admin/reservations/:id/review-request", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    stubDb(RESERVATION);
    expect((await post(42, false)).status).toBe(401);
  });

  it("returns 404 when the reservation does not exist", async () => {
    stubDb(null);
    expect((await post()).status).toBe(404);
  });

  it("returns 400 when the reservation has no email", async () => {
    stubDb({ ...RESERVATION, email: "" });
    expect((await post()).status).toBe(400);
  });

  it("returns 400 when the reservation has no code", async () => {
    stubDb({ ...RESERVATION, code: null });
    expect((await post()).status).toBe(400);
  });

  it("returns 409 when the guest already responded", async () => {
    stubDb({ ...RESERVATION, has_request: true, responded_at: "2026-08-03T12:00:00Z" });
    expect((await post()).status).toBe(409);
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("sends with force:true so a disabled toggle does not block it", async () => {
    stubDb(RESERVATION);
    expect((await post()).status).toBe(200);
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ template: "review-request", force: true }),
    );
  });

  it("clears reminder_sent_at on resend", async () => {
    const statements = stubDb({ ...RESERVATION, has_request: true });
    await post();
    const upsert = statements.find((s) => s.includes("INSERT INTO review_requests"));
    expect(upsert).toContain("reminder_sent_at = NULL");
  });

  it("reports resent:false for a first send and true for a resend", async () => {
    stubDb(RESERVATION);
    expect(await (await post()).json()).toMatchObject({ sent: true, resent: false });

    stubDb({ ...RESERVATION, has_request: true });
    expect(await (await post()).json()).toMatchObject({ sent: true, resent: true });
  });
});
```

Add a `403` case in the same shape as the `401` one, using the suite's
non-admin session fixture.

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/api && npx vitest run src/__tests__/adminReviewRequest.test.ts`
Expected: FAIL — route returns 404 for every case.

- [ ] **Step 3: Implement the route**

Register next to the existing `/api/admin/reservations/:id/status` route:

```ts
// Admin-initiated review request. Deliberately ignores the send-timing
// settings, the per-guest suppression window, and the email toggle — an admin
// pressing this button IS the operator expressing intent. It does not ignore
// `responded_at`: re-asking someone who already answered is pure noise.
app.post("/api/admin/reservations/:id/review-request", async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const reservationId = parseIdParam(c.req.param("id"));
  if (reservationId === null) return c.json({ error: "Invalid id" }, 400);

  const sql = neon(c.env.DB_CONN);

  const rows = (await sql`
    SELECT r.id, r.email, r.first_name, r.name, r.code,
           to_char(r.arrive, 'YYYY-MM-DD') AS arrive,
           to_char(r.depart, 'YYYY-MM-DD')  AS depart,
           rr.reservation_id IS NOT NULL AS has_request,
           rr.responded_at
    FROM reservations r
    LEFT JOIN review_requests rr ON rr.reservation_id = r.id
    WHERE r.id = ${reservationId}
    LIMIT 1
  `) as (ReservationForReview & {
    has_request: boolean;
    responded_at: string | null;
  })[];

  const res = rows[0];
  if (!res) return c.json({ error: "Reservation not found" }, 404);
  if (!res.email) return c.json({ error: "Cette réservation n'a pas de courriel" }, 400);
  if (!res.code) return c.json({ error: "Cette réservation n'a pas de code" }, 400);
  if (res.responded_at) {
    return c.json({ error: "Le client a déjà laissé un avis" }, 409);
  }

  const resent = res.has_request;

  // Upsert restarts the reminder clock from this send.
  await sql`
    INSERT INTO review_requests (reservation_id, channel, sent_at)
    VALUES (${res.id}, 'email', now())
    ON CONFLICT (reservation_id)
    DO UPDATE SET sent_at = now(), reminder_sent_at = NULL
  `;

  await enqueueEmail(sql, {
    template: "review-request",
    to: res.email,
    payload: buildReviewPayload(res),
    force: true,
  });

  return c.json({ sent: true, sentAt: new Date().toISOString(), resent });
});
```

Import `buildReviewPayload` and the `ReservationForReview` type from `./reviewRequests`, exporting both there.

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run src/__tests__/adminReviewRequest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/reviewRequests.ts apps/api/src/__tests__/adminReviewRequest.test.ts
git commit -m "feat(api): admin-initiated review request endpoint"
```

---

### Task 8: Expose request state on the admin reservations list

**Files:**
- Modify: `apps/api/src/index.ts` (`GET /api/admin/reservations`, ~line 1628)
- Modify: `apps/web/src/lib/api.ts` (`ReservationRow`, new client function)
- Test: `apps/api/src/adminReservations.test.ts`

**Interfaces:**
- Produces: `ReservationRow.review_sent_at`, `.review_reminder_sent_at`, `.review_responded_at`, all `string | null | undefined`; `adminSendReviewRequest(id)`.

- [ ] **Step 1: Write a failing test**

```ts
it("includes review-request state on each row", async () => {
  // drive GET /api/admin/reservations with a stubbed sql returning a row that
  // has review_sent_at set, and assert the field survives into the response
  expect(body.reservations[0]).toHaveProperty("review_sent_at");
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/api && npx vitest run src/adminReservations.test.ts -t "review-request state"`
Expected: FAIL.

- [ ] **Step 3: Add the join**

The current query selects unaliased columns from `reservations`. Alias the table and add the join:

```ts
  const reservations = (await sql`
    SELECT r.id, r.code, r.name, r.first_name, r.last_name, r.email, r.phone, r.room,
           to_char(r.arrive, 'YYYY-MM-DD') as arrive,
           to_char(r.depart, 'YYYY-MM-DD') as depart,
           r.people, r.room_count, r.message, r.status, r.source, r.external_ref,
           r.user_id, r.stripe_invoice_id, r.invoice_status, r.hosted_invoice_url,
           to_char(r.paid_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as paid_at,
           r.created_at,
           to_char(rr.sent_at,          'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_sent_at,
           to_char(rr.reminder_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_reminder_sent_at,
           to_char(rr.responded_at,     'YYYY-MM-DD"T"HH24:MI:SS"Z"') as review_responded_at
    FROM reservations r
    LEFT JOIN review_requests rr ON rr.reservation_id = r.id
    WHERE r.name ILIKE ${"%" + q + "%"} OR r.email ILIKE ${"%" + q + "%"}
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `) as ReservationRow[];
```

Every previously-unqualified column is now `r.`-prefixed — verify none was missed, or the query will fail at runtime rather than at typecheck.

- [ ] **Step 4: Extend the web type and add the client function**

In `apps/web/src/lib/api.ts`, add to `ReservationRow`:

```ts
  /** Review-request lifecycle (migration 0046); null when never requested. */
  review_sent_at?: string | null;
  review_reminder_sent_at?: string | null;
  review_responded_at?: string | null;
```

And, following `adminSetReservationStatus`:

```ts
// POST /admin/reservations/:id/review-request — admin-initiated feedback
// request. Bypasses the send-timing settings and the email toggle server-side.
export async function adminSendReviewRequest(
  id: number,
): Promise<{ sent: true; sentAt: string; resent: boolean } | ApiError> {
  const safeId = Math.trunc(id);
  if (!Number.isInteger(safeId) || safeId <= 0) {
    return { error: "Identifiant invalide" };
  }
  return fetchJson<{ sent: true; sentAt: string; resent: boolean }>(
    `/admin/reservations/${encodeURIComponent(String(safeId))}/review-request`,
    { method: "POST" },
  );
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd apps/api && npx vitest run` and `cd apps/web && npx vitest run src/lib`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/adminReservations.test.ts apps/web/src/lib/api.ts
git commit -m "feat(api): expose review-request state on admin reservations list"
```

---

### Task 9: Admin UI — modal button

**Files:**
- Modify: `apps/web/src/lib/components/admin/ReservationDetailModal.svelte`
- Modify: `apps/web/src/routes/admin/+page.svelte` (pass the new prop)
- Test: `apps/web/src/lib/components/admin/__tests__/ReservationDetailModal.test.ts`

**Interfaces:**
- Consumes: `ReservationRow.review_*` fields and `adminSendReviewRequest` from Task 8.
- Produces: new required prop `onSendReviewRequest: (reservationId: number) => Promise<{ sent: true; sentAt: string; resent: boolean } | { error: string }>`.

- [ ] **Step 1: Write failing tests**

```ts
it("offers to request a review when none was ever sent", () => {
  const html = renderModal({ ...ROW, review_sent_at: null });
  expect(html).toContain('data-testid="btn-review-request"');
  expect(html).toContain("Demander un avis");
});

it("shows the sent date and a resend action once requested", () => {
  const html = renderModal({ ...ROW, review_sent_at: "2026-08-01T18:00:00Z" });
  expect(html).toContain("Demande envoyée");
  expect(html).toContain('data-testid="btn-review-resend"');
});

it("shows the reminder date when a reminder went out", () => {
  const html = renderModal({ ...ROW, review_sent_at: "2026-08-01T18:00:00Z", review_reminder_sent_at: "2026-08-08T18:00:00Z" });
  expect(html).toContain("Rappel envoyé");
});

it("shows the response and offers no resend once answered", () => {
  const html = renderModal({ ...ROW, review_sent_at: "2026-08-01T18:00:00Z", review_responded_at: "2026-08-03T12:00:00Z" });
  expect(html).toContain("Avis reçu");
  expect(html).not.toContain('data-testid="btn-review-resend"');
});

it("disables the action with a reason when the reservation has no email", () => {
  const html = renderModal({ ...ROW, email: "" });
  expect(html).toContain("disabled");
  expect(html).toContain("courriel");
});

it("disables the action with a reason when the reservation has no code", () => {
  const html = renderModal({ ...ROW, code: null });
  expect(html).toContain("disabled");
  expect(html).toContain("code");
});
```

`renderModal` and `ROW` are the render helper and row fixture the test file already defines — reuse them rather than adding a second harness.

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/web && npx vitest run src/lib/components/admin/__tests__/ReservationDetailModal.test.ts`
Expected: FAIL — no such testid.

- [ ] **Step 3: Implement**

Add to `Props` and destructuring:

```ts
    onSendReviewRequest: (
      reservationId: number,
    ) => Promise<{ sent: true; sentAt: string; resent: boolean } | { error: string }>;
```

Add state and a derived status, next to `factureOpen`:

```ts
  let reviewBusy = $state(false);
  let reviewError = $state('');
  let reviewSentAt = $state<string | null>(null);

  // Server value, overridden locally after a successful send so the button
  // reflects the new state without refetching the whole list.
  const sentAt = $derived(reviewSentAt ?? row?.review_sent_at ?? null);
  const respondedAt = $derived(row?.review_responded_at ?? null);
  const reminderAt = $derived(row?.review_reminder_sent_at ?? null);
  const reviewBlockedReason = $derived(
    !row ? '' : !row.email ? "Aucun courriel au dossier" : !row.code ? "Aucun code de réservation" : '',
  );

  $effect(() => {
    if (!open) {
      reviewBusy = false;
      reviewError = '';
      reviewSentAt = null;
    }
  });

  async function sendReviewRequest() {
    if (!row || reviewBusy) return;
    reviewBusy = true;
    reviewError = '';
    const result = await onSendReviewRequest(row.id);
    reviewBusy = false;
    if ('error' in result) {
      reviewError = result.error;
      return;
    }
    reviewSentAt = result.sentAt;
  }
```

Add a section after the Facture section, mirroring its markup conventions:

```svelte
        <hr class="rdm__divider" aria-hidden="true" />

        <section class="rdm__section" aria-labelledby="rdm-avis-heading">
          <h3 id="rdm-avis-heading" class="rdm__section-heading">Avis</h3>

          {#if respondedAt}
            <p class="rdm__review-state" data-testid="rdm-review-state">
              Avis reçu le {formatDateTime(respondedAt)}
            </p>
          {:else}
            {#if sentAt}
              <p class="rdm__review-state" data-testid="rdm-review-state">
                Demande envoyée le {formatDateTime(sentAt)}
                {#if reminderAt}<br />Rappel envoyé le {formatDateTime(reminderAt)}{/if}
              </p>
            {/if}

            <button
              type="button"
              class="rdm__facture-btn"
              data-testid={sentAt ? 'btn-review-resend' : 'btn-review-request'}
              disabled={reviewBusy || reviewBlockedReason !== ''}
              onclick={sendReviewRequest}
            >
              {reviewBusy ? 'Envoi…' : sentAt ? 'Renvoyer la demande' : 'Demander un avis'}
            </button>

            {#if reviewBlockedReason}
              <p class="rdm__review-blocked" data-testid="rdm-review-blocked">{reviewBlockedReason}</p>
            {/if}
          {/if}

          {#if reviewError}
            <p class="rdm__review-error" role="alert" data-testid="rdm-review-error">{reviewError}</p>
          {/if}
        </section>
```

Add `.rdm__review-state`, `.rdm__review-blocked` and `.rdm__review-error` to the component's `<style>` block, following the existing muted/error colour variables used elsewhere in the file.

- [ ] **Step 4: Wire the prop at the call site**

In `apps/web/src/routes/admin/+page.svelte`, import `adminSendReviewRequest` from `$lib/api` and pass `onSendReviewRequest={(id) => adminSendReviewRequest(id)}` to `<ReservationDetailModal ... />`. After a successful send, refetch the reservations list so `review_sent_at` is authoritative on next open.

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd apps/web && npx vitest run src/lib/components/admin/__tests__/ReservationDetailModal.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/admin/ReservationDetailModal.svelte apps/web/src/routes/admin/+page.svelte apps/web/src/lib/components/admin/__tests__/ReservationDetailModal.test.ts
git commit -m "feat(web): manual review-request action in reservation detail modal"
```

---

### Task 10: Admin UI — Paramètres inputs

**Files:**
- Modify: `apps/web/src/lib/components/admin/AdminParametresTab.svelte`
- Modify: `apps/web/src/lib/settings.svelte.ts` (if it mirrors the admin settings shape)
- Test: `apps/web/src/lib/components/admin/__tests__/AdminParametresTab.test.ts`

**Interfaces:**
- Consumes: `reviewRequestDelayDays`, `reviewReminderDelayDays`, `reviewSuppressionMonths` from Task 2.

- [ ] **Step 1: Write failing tests**

```ts
it("renders the three review timing inputs", () => {
  const html = render();
  expect(html).toContain('data-testid="input-review-request-delay"');
  expect(html).toContain('data-testid="input-review-reminder-delay"');
  expect(html).toContain('data-testid="input-review-suppression-months"');
});

it("explains what 0 means for the reminder and the suppression window", () => {
  const html = render();
  expect(html).toContain("0 = aucun rappel");
  expect(html).toContain("0 = aucune suppression");
});
```

- [ ] **Step 2: Run and verify they fail**

Run: `cd apps/web && npx vitest run src/lib/components/admin/__tests__/AdminParametresTab.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Immediately after the `pt-email-review-request` toggle row's closing `</div>`, inside the same card:

```svelte
        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-review-request-delay">
            Délai avant la demande d'avis (jours)
            <span class="params-tab__hint">(0 = le jour du départ, à 14 h)</span>
          </label>
          <input
            id="pt-review-request-delay"
            type="number"
            min="0"
            max="365"
            bind:value={s.reviewRequestDelayDays}
            class="params-tab__input params-tab__input--num"
            data-testid="input-review-request-delay"
          />
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-review-reminder-delay">
            Délai avant le rappel (jours)
            <span class="params-tab__hint">(compté depuis la première demande — 0 = aucun rappel)</span>
          </label>
          <input
            id="pt-review-reminder-delay"
            type="number"
            min="0"
            max="365"
            bind:value={s.reviewReminderDelayDays}
            class="params-tab__input params-tab__input--num"
            data-testid="input-review-reminder-delay"
          />
        </div>

        <div class="params-tab__field">
          <label class="params-tab__label" for="pt-review-suppression-months">
            Ne pas redemander avant (mois)
            <span class="params-tab__hint">(un client qui revient n'est pas resollicité — 0 = aucune suppression)</span>
          </label>
          <input
            id="pt-review-suppression-months"
            type="number"
            min="0"
            max="60"
            bind:value={s.reviewSuppressionMonths}
            class="params-tab__input params-tab__input--num"
            data-testid="input-review-suppression-months"
          />
        </div>
```

These are the component's real class names, copied from the nightly-price field
at `AdminParametresTab.svelte:221-236` and the `params-tab__hint` span already
used at lines 374 and 521. No new CSS is needed.

- [ ] **Step 4: Run and verify they pass**

Run: `cd apps/web && npx vitest run src/lib/components/admin/__tests__/AdminParametresTab.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/admin/AdminParametresTab.svelte apps/web/src/lib/components/admin/__tests__/AdminParametresTab.test.ts
git commit -m "feat(web): review timing inputs in Paramètres"
```

---

### Task 11: Full verification

**Files:** none modified unless a failure is found.

- [ ] **Step 1: Typecheck the whole repo**

Run: `npm run typecheck`
Expected: 0 errors. Pre-existing `state_referenced_locally` and `css_unused_selector` warnings are acceptable; no new ones in touched files.

- [ ] **Step 2: Run the API suite**

Run: `cd apps/api && npx vitest run`
Expected: all pass.

- [ ] **Step 3: Run the web suite**

Run: `cd apps/web && npx vitest run`
Expected: all pass.

- [ ] **Step 4: Build the web app**

Run: `npm run build:web`
Expected: clean build.

- [ ] **Step 5: Dry-run the Worker bundle**

Run: `cd apps/api && npx wrangler deploy --dry-run`
Expected: bundles without error, and the template count in the precompile output reflects `review-reminder`.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "test: verification fixes for review-request lifecycle"
```

---

## Deployment (operator, after review)

Order matters — this is the failure PR #35 hit.

1. **Apply migrations to production first**, while the old API is still live. Both are additive and idempotent, so the deployed code ignores the new columns:
   ```bash
   npm run db:migrate
   ```
2. Merge the PR. Merging auto-fires `deploy-prod`.
3. In `/admin` → Paramètres, set the three intervals, then enable **Demande d'avis après séjour** if it should start sending.

The toggle stays off by default, so nothing is emailed until step 3 — the cron will write no `review_requests` rows in the meantime, preserving the catch-up window.
