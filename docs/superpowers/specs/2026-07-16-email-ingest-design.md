# Email-ingest worker: OTA booking emails → reservations + HubSpot

**Date:** 2026-07-16
**Status:** Approved

## Goal

Receive Airbnb and Expedia booking-confirmation emails, parse the booking
details, create the reservation in Site-web, sync the guest to HubSpot, and
forward every original email to `aubergeduvieuxpont2@hotmail.com`.

## Decisions (from brainstorming)

- **Intake:** the notification/contact email in Airbnb and Expedia host
  settings will be changed to `bookings@aubergeduvieuxpont.ca`, routed to the
  worker via Cloudflare Email Routing.
- **Forwarding:** every email is forwarded to `aubergeduvieuxpont2@hotmail.com`
  (must be verified as an Email Routing destination), regardless of parse
  outcome, and before any parsing runs.
- **Parse failures:** logged to a table visible in the admin; nothing is
  silently lost. Cancellations/guest messages are out of scope (forwarded
  only).
- **Room mapping:** the OTA listing name is stored as text in the existing
  `reservations.room` field; the operator assigns the actual room manually in
  the admin, same as website reservations.
- **Guest emails:** OTA relay addresses (e.g. `abc123@guest.airbnb.com`) are
  used as-is for the HubSpot contact.
- **Parsing:** deterministic per-provider parsers built against real sample
  emails supplied by the operator (fixtures committed with personal data
  scrubbed). No LLM parsing.
- **Airbnb trigger:** only «Réservation confirmée» emails create a
  reservation. Pending «demande de réservation» (accept/decline) emails are
  recognized but logged as `ignored` and forwarded only.

## Parsing facts (from real samples in `email-reservations-examples/`)

The samples are forwards (from the operator's sister), so the outer
headers/top are not representative; parsers must key off the **body content**,
and provider detection in production uses the direct sender
(`automated@airbnb.com`, `booknotif@expedia.com`).

**Airbnb «Réservation confirmée»** (French — host account language):
- Full guest name in subject («Réservation confirmée : Yashwin Singh arrive
  le 30 juil.») and body; split into first/last on first space.
- Confirmation code in a «Code de confirmation» section (`HM45MDTHZ4`), also
  present in `hosting/reservations/details/<CODE>` URLs as fallback.
- Dates as «jeu. 30 juil.» under «Arrivée»/«Départ» — **no year anywhere**;
  infer year from the email's Date header: next occurrence of that day/month
  on or after the sent date (a checkOut earlier in the calendar than checkIn
  rolls into the next year). French month abbreviations (janv., févr., mars,
  avr., mai, juin, juil., août, sept., oct., nov., déc.).
- Guests: «2 adultes» under «Voyageurs».
- **No guest email or phone in the email at all** → reservation stored with
  empty email, HubSpot sync skipped entirely for Airbnb (nothing to sync).
- Listing name («Auberge du vieux pont») → `room` text field.

**Expedia "New Booking"** (English): subject
`Expedia - New Booking - Arriving on 5 Sep 2026`; body has
`Reservation ID: 2511634261`, `Guest: Dominique Sanon`, phone, relay
`Guest Email: ...@m.expediapartnercentral.com`, `Room Type Name`, a
Check-In/Check-Out/Adults/Kids table (`Sep 5, 2026` format), and
`Total Cost`. `NotificationType: BookingReserve` distinguishes new bookings
from modify/cancel notifications (which are logged `ignored`).

## Architecture

New service `apps/email-ingest`: a Cloudflare Worker with **no HTTP routes**,
only an `email()` handler bound to `bookings@aubergeduvieuxpont.ca`. It talks
to the existing API over a service binding (`API` → `site-web-api`), matching
the repo's service-binding pattern (API → HubSpot). The database remains
owned solely by `apps/api`; the email worker is stateless.

```
Airbnb/Expedia ──email──▶ bookings@ ──Email Routing──▶ email-ingest worker
                                                        │ 1. forward original → hotmail
                                                        │ 2. detect provider, parse
                                                        ▼ 3. service binding
                                              apps/api  POST /internal/ota-bookings
                                                        │ dedupe → insert reservation
                                                        │ enqueue HubSpot (existing flow)
                                                        ▼ write email_ingest_log row
```

Rejected alternatives: direct DB access from the email worker (duplicates
schema/HubSpot ownership); Cloudflare Queue between receipt and processing
(Email Routing already retries on handler failure; volume is tiny).

## Components

### 1. `apps/email-ingest` (new Worker)

`email(message, env, ctx)` handler:

1. `message.forward("aubergeduvieuxpont2@hotmail.com")` — always first. If
   the forward itself throws, let the handler fail so Cloudflare retries
   delivery.
2. Identify provider from the sender domain (`airbnb.com` /
   `expedia.com` / `expediagroup.com`). Unknown sender → stop (forward only).
3. Run the provider's parser over the message body (HTML preferred, text
   fallback) to extract:
   `{ source, confirmationCode, firstName, lastName, guestEmail, phone?,
   checkIn, checkOut, guests, listingName }`.
4. POST the outcome to `env.API.fetch("http://api/internal/ota-bookings")`:
   parsed payload, or `{ status: "parse_failed", provider, subject, error }`.
5. After a successful forward, the handler never throws — a parse or API
   failure must not bounce/retry mail (the forward would duplicate). Failures
   are logged via the internal endpoint (best-effort) and `console.error`.

Parsers live in `apps/email-ingest/src/parsers/{airbnb,expedia}.ts`, each a
pure function `(html, text, subject) → ParsedBooking | null`, unit-tested
against scrubbed fixtures in `apps/email-ingest/test/fixtures/`.

`wrangler.jsonc`: name `site-web-email-ingest`, no routes, service binding
`API` → `site-web-api`.

### 2. `apps/api` changes

**Migration `0020_ota_reservations.sql`** (idempotent; 0018/0019 taken by
phone-config and room-passkey work merged since this spec was drafted):

- `ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'website';`
- `ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_ref TEXT;`
- `CREATE UNIQUE INDEX IF NOT EXISTS reservations_source_external_ref ON
  reservations (source, external_ref) WHERE external_ref IS NOT NULL;`
- `CREATE TABLE IF NOT EXISTS email_ingest_log (id BIGINT GENERATED ALWAYS AS
  IDENTITY PRIMARY KEY, provider TEXT, status TEXT NOT NULL, -- parsed |
  parse_failed | duplicate | ignored
  reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL,
  subject TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`

**`POST /internal/ota-bookings`** — new route mounted outside `/api/*`. The
API worker's routes only cover `/api/*`, so `/internal/*` is unreachable from
the internet and only reachable via the service binding (same isolation as the
HubSpot gateway's route-less worker). Behaviour:

- `status: "parse_failed"` body → insert `email_ingest_log` row, return 202.
- Parsed booking → dedupe on `(source, external_ref)`; existing row → log
  `duplicate`, return 200 without creating anything.
- Otherwise insert the reservation (`name` from first+last, listing name into
  `room`, `message` = "Réservation {Airbnb|Expedia} #CODE",
  `source`/`external_ref` set), then fire the **existing** HubSpot enqueues
  exactly as `POST /api/reservations` does: `contact.upsert`
  ({email, firstname, lastname}) and `deal.create` with
  `dedupeKey: "reservation-<id>"`; the deal description includes the source.
  When the parsed booking has no guest email (Airbnb), the reservation is
  stored with an empty email and **both HubSpot enqueues are skipped**.
  Log a `parsed` row with the reservation id. Return 201.
- Recognized-but-ignored emails (Airbnb pending request, Expedia
  modify/cancel) → insert an `ignored` log row, return 202.
- Zod-validated body; dates must be valid and `checkOut > checkIn`;
  `guestEmail` optional.

The shared reservation-insert + HubSpot-enqueue logic is extracted into a
helper reused by both the public route and the internal route (no copy-paste).

**`GET /api/admin/email-ingest`** — admin-gated (`requireAdmin`), returns the
most recent ~100 `email_ingest_log` rows.

### 3. `apps/web` changes

Minimal admin visibility: an "Emails OTA" section/tab in the existing admin
page listing the ingest log (date, provider, status, subject, linked
reservation id, error). Read-only. Responsive like the rest of the admin.

## Error handling summary

| Failure | Behaviour |
|---|---|
| Forward fails | Handler throws → Cloudflare retries the delivery |
| Unknown sender | Forward only, no log |
| Parse failure | Forwarded; `parse_failed` logged; visible in admin |
| Duplicate confirmation code | Forwarded; `duplicate` logged; no new reservation |
| API/DB unreachable | Forwarded; error only in worker logs (best-effort log) |
| HubSpot enqueue fails | Same as today: swallowed; outbox/cron retries handle delivery |

## Testing

- Parser unit tests against the real (scrubbed) fixtures derived from
  `email-reservations-examples/` (Airbnb confirmation, Airbnb pending request
  → ignored, Expedia new booking).
- Internal endpoint tests: validation, dedupe, log rows, HubSpot enqueue calls.
- Existing `POST /api/reservations` tests keep passing (shared helper refactor).

## Manual setup (operator, documented in PR)

1. Enable Email Routing on the `aubergeduvieuxpont.ca` zone (adds MX records —
   verify no existing mail service on the apex domain conflicts).
2. Verify `aubergeduvieuxpont2@hotmail.com` as a destination address.
3. Create routing rule: `bookings@aubergeduvieuxpont.ca` → worker
   `site-web-email-ingest`.
4. Change the notification email in Airbnb and Expedia host settings to
   `bookings@aubergeduvieuxpont.ca`.
5. Send a test booking (or resend a confirmation) and check the admin log.

## Out of scope

- Cancellation/modification emails (forwarded only; future: reservation status
  column).
- Auto room assignment from listing names.
- iCal/calendar sync with OTAs (separate project; requires inventory model).
- Parsing real guest emails from relay addresses.
