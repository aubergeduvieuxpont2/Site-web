# Outbound email + OTA guest portal onboarding

**Date:** 2026-07-17
**Status:** Approved

## Goal

1. Give the platform real outbound transactional email (Resend), wiring the
   existing bilingual templates, with every email type individually
   toggleable from the admin.
2. Auto-provision a portal account for Expedia guests at ingest time and
   send them a set-password welcome email, so they can manage their stay and
   we capture their real email address for future direct bookings.

Airbnb bookings are explicitly excluded from onboarding: their emails
contain no guest address to write to.

## Decisions (from brainstorming)

- **Scope:** pieces 1+2 only. Guest self-service date changes (needs the
  availability engine merged in PR #40) and guest door codes (needs a
  per-reservation code model) are future projects.
- **Provider:** Resend (free tier 3k/month), called over HTTPS from the API
  worker.
- **Delivery mechanism:** DB-backed `email_outbox` drained by a cron on the
  API worker — the `hubspot_outbox` pattern. No fire-and-forget sends: the
  welcome email is the guest's only key to the portal.
- **All four email types toggleable** from admin → Paramètres, **default
  off** (`email_confirmation_enabled`, `email_password_reset_enabled`,
  `email_room_assignment_enabled`, `email_welcome_enabled`). Toggle checked
  at enqueue time; off → the email is silently skipped (and for password
  reset, today's manual-link behaviour remains).
- **Credential:** no literal temp password. The welcome email carries a
  one-time **set-password link** (existing `password_reset_tokens` table,
  hashed token, **30-day expiry** for welcome tokens vs. the short expiry
  used by ordinary resets), landing on the existing `/reinitialisation`
  page with welcome wording.
- **HubSpot email capture:** when a guest changes their email in the
  profile, push the new address to the SAME HubSpot contact by stored
  `hubspot_contact_id` (new `contact.updateById` op) — never create a
  duplicate contact.

## Architecture

```
POST /api/reservations ──┐
forgot-password ─────────┤  enqueueEmail(sql, {template, to, locale, payload})
admin room-assign ───────┤     └─ checks settings toggle, inserts email_outbox row
/internal/ota-bookings ──┘
                                cron (* * * * *, API worker scheduled handler)
                                  └─ drainEmailOutbox: claim batch → render
                                     precompiled Handlebars template → POST
                                     https://api.resend.com/emails → mark
                                     delivered / retry (backoff) / failed
```

Sender: `Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>`;
`Reply-To:` the `contact_email` setting. (From must live on the verified
domain — the operator's hotmail cannot be the From address.)

OTA onboarding flow (inside the existing `/internal/ota-bookings` parsed
branch, after the reservation insert succeeds, Expedia only — i.e. when
`guestEmail` is present):

```
find user by lower(email)
  none  → INSERT user (email=relay, first/last from booking, role guest,
          random unusable password hash)
  found → reuse
UPDATE reservations SET user_id = <user>
mint set-password token (sha256 hash stored, expires_at = now() + 30 days)
enqueueEmail welcome (toggle-gated) with link:
  https://www.aubergeduvieuxpont.ca/reinitialisation?token=<raw>&welcome=1
```

Duplicate OTA emails cannot double-provision: the dedupe short-circuit
returns before this block. Toggle off → account + link still created
silently; only the email is skipped.

## Components

### 1. Migrations (idempotent, next free numbers after 0025)

- `email_outbox`: `id` PK, `to_email` TEXT NOT NULL, `template` TEXT NOT
  NULL, `locale` TEXT NOT NULL DEFAULT 'fr', `payload` JSONB NOT NULL
  DEFAULT '{}', `status` TEXT NOT NULL DEFAULT 'pending'
  (pending|delivered|failed), `attempts` INT NOT NULL DEFAULT 0,
  `next_attempt_at` TIMESTAMPTZ NOT NULL DEFAULT now(), `last_error` TEXT,
  `provider_id` TEXT, `created_at`/`updated_at` TIMESTAMPTZ. Index on
  `(status, next_attempt_at)`.
- Settings seeds: the four toggle keys, value `'false'`,
  `ON CONFLICT DO NOTHING`.
- `reservations.user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`
  (+ index).

### 2. `apps/api/src/emailOutbox.ts`

- `enqueueEmail(sql, {template, to, locale, payload})` — reads the
  template's toggle from `settings`; off → returns `{skipped: true}`; on →
  inserts the row. Template names: `reservation-confirmation`,
  `password-reset`, `room-assignment`, `ota-welcome`.
- `drainEmailOutbox(env)` — claims due pending rows
  (`FOR UPDATE SKIP LOCKED`, batch ≤10), renders via the precompiled
  template registry, POSTs Resend (`Authorization: Bearer RESEND_API_KEY`),
  then `delivered` (store Resend id) / retry with exponential backoff (base
  30s, cap 1h, max 8 attempts → `failed`). 4xx from Resend = permanent
  (`failed`), 429/5xx = transient. Mirrors `apps/hubspot/src/outbox.ts`
  semantics.
- API `wrangler.jsonc` gains `"triggers": {"crons": ["* * * * *"]}` and the
  worker exports a `scheduled` handler calling `drainEmailOutbox`.

### 3. Send-point wiring

| Trigger | Template | Notes |
|---|---|---|
| `POST /api/reservations` 201 | `reservation-confirmation` | existing template; payload from the reservation + tax estimate fields it already expects |
| `POST /api/auth/forgot-password` | `password-reset` | token flow already exists; email carries the reset link; toggle off → behaviour unchanged (admin manual links) |
| admin room assignment | `room-assignment` | existing template incl. pass-key when the room has one enabled |
| `/internal/ota-bookings` (Expedia) | `ota-welcome` | new template |

### 4. `ota-welcome` template (new, bilingual like the others)

`apps/api/emails/ota-welcome.{fr,en}.hbs` (matching the existing template
file convention), precompiled by the existing script. Content: greeting by
first name, "your Expedia reservation #<ref> for <dates> is in our system",
button "Créer mon mot de passe / Set my password" → the set-password link,
sentence explaining they can manage their stay and save their profile for
future direct bookings (better rates messaging kept factual). Locale: `fr`
default (Expedia bookings for a Québec property; the template pair exists
if we later detect language).

### 5. OTA account provisioning (in `apps/api`, called from the internal route)

`provisionOtaGuest(sql, {reservationId, guestEmail, firstName, lastName})`:
find-or-create user, link `reservations.user_id`, mint welcome token,
enqueue `ota-welcome`. Never throws into the booking path — provisioning
failure is logged (`console.error`) and the reservation stays created.
Welcome tokens reuse `password_reset_tokens` with `expires_at = now() +
interval '30 days'`. `/reinitialisation` already consumes tokens; it gains
a `welcome=1` query param for copy only ("Bienvenue ! Choisissez votre mot
de passe" instead of reset wording).

### 6. Profile: email change + HubSpot capture

- `GET /api/profile` reservation matching becomes
  `WHERE user_id = <id> OR lower(email) = lower(<user.email>)`.
- New `POST /api/profile/email` `{newEmail, currentPassword}`: verifies the
  password, enforces case-insensitive uniqueness, updates `users.email`,
  and — when `hubspot_contact_id` is set — enqueues HubSpot
  `contact.updateById` `{id, properties: {email: newEmail}}` via the
  existing HUBSPOT binding. Sessions remain valid (session references
  user id, not email).
- `apps/hubspot`: new op kind `contact.updateById` (Zod payload
  `{id: string, properties: record}`) → PATCH
  `/crm/v3/objects/contacts/{id}`.
- Profile page UI: email field + current-password field + save, following
  the existing profile form patterns; French copy explains why ("recevez
  vos confirmations à votre adresse personnelle").

### 7. Admin settings toggles

- `GET/POST /api/admin/settings` extended with the four booleans
  (settings rows store `'true'`/`'false'`).
- Paramètres tab: a "Courriels automatiques" group with four checkboxes.

## Error handling

| Failure | Behaviour |
|---|---|
| Resend down / 5xx / 429 | outbox retry with backoff, up to 8 attempts |
| Resend 4xx (bad address etc.) | row `failed` with provider error stored |
| Toggle off | enqueue skipped; everything else proceeds |
| Provisioning throws | logged; reservation + ingest log unaffected |
| Welcome link expired | «mot de passe oublié» with the relay address mints a fresh token (relay addresses stay alive through the stay window) |
| Email change to a taken address | 409 with French message |
| HubSpot update fails | outbox retry semantics as today, best-effort |

## Testing

- `emailOutbox` unit tests: toggle gating, claim/render/deliver with a
  mocked fetch, backoff/permanent-failure classification.
- Provisioning tests: create vs reuse user, `user_id` linked, token row
  minted with 30-day expiry, welcome enqueue gated by toggle, dedupe path
  provisions nothing.
- Profile email change: password required, uniqueness, HubSpot op enqueued
  only when `hubspot_contact_id` present.
- `contact.updateById` op test in `apps/hubspot`.
- Existing suites stay green.

## Operator setup (manual)

1. Create a Resend account; add + verify `aubergeduvieuxpont.ca` (Resend
   shows the DNS records; add them in the Cloudflare dashboard).
2. `cd apps/api && npx wrangler secret put RESEND_API_KEY`.
3. Apply migrations before deploy (schema-changing PR rule).
4. After deploy: enable toggles one at a time in admin → Paramètres,
   test each email type (welcome can be tested with a DEV_SENDER Expedia
   forward), watch `email_outbox` for failures.

## Out of scope

- Guest self-service date changes (next project; availability engine now on
  main via PR #40).
- Guest-managed door codes (needs per-reservation code model).
- Airbnb onboarding (no guest email exists).
- Marketing email / list management (transactional only).
- Language detection per guest (templates are bilingual-ready; fr default).
