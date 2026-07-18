# Email Operations Runbook

This document describes how to set up and manage outbound email via the Resend API and the database-backed `email_outbox` queue.

## Setup

### 1. Create Resend account and domain

1. Sign up at [Resend](https://resend.com)
2. Add a sending domain (e.g., `no-reply@aubergeduvieuxpont.ca`)
3. Verify DNS records per Resend's instructions (MX, SPF, DKIM)
4. Once verified, obtain the API key

### 2. Store the API key as a Worker secret

```bash
cd apps/api
npx wrangler secret put RESEND_API_KEY
# Paste the API key when prompted
```

### 3. Run migrations

The three email-related migrations must be applied to the database:

```bash
npm run db:migrate
```

This creates:
- `email_outbox` table (the queue of pending emails)
- `email_toggle_settings` (four seed rows for feature flags, all off by default)
- `reservations.user_id` column (links OTA reservations to portal user accounts)

### 4. Enable email toggles in Admin settings

Navigate to `/admin` and enable the email features you want:
- **Confirmation emails**: Sent immediately after a reservation is created
- **Password reset emails**: Sent when a user requests a password reset
- **Room assignment emails**: Sent when an admin assigns a room to a reservation
- **Welcome emails (OTA)**: Sent when provisioning a guest account for an Expedia guest

## Architecture

### Queue-based delivery

All outbound emails are **asynchronous**. When an event triggers an email (e.g., new reservation), the system:
1. Inserts a row into `email_outbox` with status `pending`
2. Returns a response to the user immediately
3. A **cron trigger** (`* * * * *` — every minute) drains the queue by:
   - Fetching up to 10 pending rows (using `FOR UPDATE SKIP LOCKED`)
   - Rendering each email template with injected data
   - Calling the Resend API
   - Updating the row status to `delivered`, `failed`, or scheduling a retry

### Retry logic

Emails use exponential backoff with a cap:
- 1st attempt: 30 seconds
- 2nd attempt: 60 seconds
- 3rd attempt: 120 seconds
- ...
- Capped at 3600 seconds (1 hour)

Transient failures (429 Too Many Requests, 5xx) trigger a retry; permanent failures (4xx except 429) mark the row `failed`.

## Monitoring

### Check pending emails

```sql
-- Pending emails (oldest first)
SELECT id, to_email, template, locale, status, attempts, next_attempt_at
FROM email_outbox
WHERE status = 'pending'
ORDER BY next_attempt_at;

-- Failed emails
SELECT id, to_email, template, last_error, created_at
FROM email_outbox
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;

-- Delivery success rate (last 24 hours)
SELECT
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER ()) as pct
FROM email_outbox
WHERE updated_at > now() - interval '24 hours'
GROUP BY status;
```

### Manually retry a failed email

```sql
UPDATE email_outbox
SET status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    last_error = NULL
WHERE id = <email_id>;
```

## Templates

Four transactional email templates are included:

| Template | Trigger | Locale Support |
|---|---|---|
| `reservation-confirmation` | New reservation | fr, en |
| `password-reset` | Password reset request | fr, en |
| `room-assigned` | Admin assigns room | fr, en |
| `ota-welcome` | OTA guest provision | en |

Each template renders with injected footer contact info (`contactPhone`, `contactEmail`) from the API's settings endpoint.

## OTA Guest Provisioning

When an Expedia booking email arrives:
1. The email-ingest Worker parses it and POSTs to `/internal/ota-bookings`
2. If `email_welcome_enabled` is `true`, the API provisions a guest account:
   - Creates a user (or reuses existing if email matches)
   - Links the reservation to the user via `user_id`
   - Mints a 30-day password-reset token
   - Enqueues a welcome email with set-password link
3. The guest receives an email inviting them to set their password and access their portal

## Profile Email Change

Guests (and admins) can update their email via `POST /api/profile/email`:

```bash
curl -X POST https://api.aubergeduvieuxpont.ca/api/profile/email \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<session_token>" \
  -d '{
    "newEmail": "new@example.com",
    "currentPassword": "password"
  }'
```

If the user has a HubSpot contact ID, the API fire-and-forgets an update to HubSpot to keep the contact email in sync.

## Troubleshooting

### "RESEND_API_KEY not found"
The secret was not set. Run `npx wrangler secret put RESEND_API_KEY` in `apps/api`.

### "Transient error, will retry"
Resend is temporarily unavailable (429 or 5xx). The email will retry automatically.

### "HTTP 422: Invalid email"
The `to_email` field in `email_outbox` is malformed. Check the reservation email or the enqueue payload.

### Cron not draining the queue
Verify that `wrangler.jsonc` includes the cron trigger:
```json
"triggers": { "crons": ["* * * * *"] }
```

If the file is correct, the deployment may have missed the cron binding. Redeploy:
```bash
npm run deploy:api
```

## Development / Local testing

When running locally (`npm run dev:api`), the cron handler is not triggered automatically. To test email logic:

1. Insert a test row into `email_outbox`:
```sql
INSERT INTO email_outbox (to_email, template, locale, payload, status)
VALUES (
  'test@example.com',
  'ota-welcome',
  'en',
  '{"firstName":"Test","confirmationCode":"EXP-001","checkIn":"2026-09-05","checkOut":"2026-09-08","setPasswordUrl":"https://example.com/reset?token=abc123&welcome=1"}',
  'pending'
);
```

2. Call the drain function manually:
```javascript
import { drainEmailOutbox } from "./src/emailOutbox";
const result = await drainEmailOutbox({
  DB_CONN: process.env.DB_CONN!,
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
});
console.log(result); // { delivered: 1, retried: 0, failed: 0 }
```

3. Check the email in Resend's dashboard or the recipient's mailbox.
