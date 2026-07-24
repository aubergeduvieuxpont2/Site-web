# Profile editing, logout redirect, two-step email change, and admin invoice links

**Date:** 2026-07-23
**Status:** Approved for implementation

## Overview

Four related changes to L'Auberge du Vieux Pont (SvelteKit web + Hono API on
Cloudflare, Neon Postgres):

1. Logging out redirects the user to the home page.
2. + 3. A unified self-service editable profile for every logged-in user (admin
   and guest alike): name, phone, company, structured home address, language
   preference, a password-reset button, and a reworked two-step email change.
4. Admin reservations expose a link to the Stripe hosted invoice (for invoices
   created from this change onward).

The screenshot referenced in the request is the profile page itself, so items 2
and 3 are a single feature: the same editable profile serves admins and standard
users. This does NOT add an admin-edits-other-users screen.

## Feature 1 — Logout redirects to home

- `apps/web/src/lib/components/Nav.svelte`: `handleLogout()` currently calls
  `logout()` then `clearUser()` and stops on the current page. After
  `clearUser()`, navigate to `/` using `goto` from `$app/navigation`. This one
  handler backs both the desktop and mobile logout buttons, so a single change
  covers both.
- The profil page already redirects to `/` on logout; leave it unchanged.

## Features 2 + 3 — Unified editable profile

### Data model

New idempotent migration adding structured home-address columns to `users`
(each nullable, using `ADD COLUMN IF NOT EXISTS`, one migration file):

- `address_street TEXT`
- `address_city TEXT`
- `address_province TEXT`
- `address_postal_code TEXT`

No other new columns are needed: `phone`, `company`, `first_name`, `last_name`,
`locale`, and `pending_email` already exist on `users`.

### API — read side

Extend `GET /api/profile` so the response includes the fields the profile page
must display and edit: `first_name`, `last_name`, `phone`, `company`, `locale`,
and the four address columns, in addition to what it already returns
(`id`, `email`, `name`, `role`, `hubspotContactId`). Keep field names consistent
with the existing camelCase API convention on the web client.

### API — write side (self-service contact update)

New authenticated endpoint that lets the logged-in user update their own contact
fields: `first_name`, `last_name`, `phone`, `company`, and the four address
columns. It MUST NOT change `email` (that has its own confirmed flow), `locale`
(its own endpoint already exists), `password`, or `role`. Validate and trim
inputs; treat empty strings as clearing a field to NULL. Return the updated
profile shape.

### Frontend — profile page

`apps/web/src/routes/profil/+page.svelte`:

- Display the contact fields and provide an inline edit form saving through the
  new update endpoint. Show a success confirmation on save and field-level
  validation errors on failure.
- Structured address inputs: street, city, province, postal code.
- Language preference: a selector (French / English) that persists through the
  existing locale endpoint and reflects the current locale.
- Password: remove the in-place change-password form and replace it with a
  single button, "Send me a reset link" (localized), that triggers the existing
  forgot-password email flow for the current user's email and shows a
  confirmation message. Do not reveal whether the address exists beyond the
  generic confirmation already used by the forgot flow.
- Email: keep an email-change control, wired to the reworked two-step flow below.
- All new UI must be bilingual (French default, English) using the existing i18n
  message dictionaries, and responsive on mobile.

## Two-step email change (old address confirms first)

Rework the existing `pending_email` / `email_verification_tokens` infrastructure
so the current address authorizes the change before the new address is contacted.

Flow:

1. The user requests an email change, supplying their current password and the
   new email. The server validates the password and that the new email is not
   already in use, stages the new email in `pending_email`, creates a token with
   a new purpose value meaning "authorize change from the current address", and
   sends a confirmation link to the CURRENT (old) email using a new
   `email-change-confirm` template. The new address is NOT contacted yet.
2. The user clicks the confirmation link from the old address. The server
   validates the authorize token, then creates a second token with the existing
   "change" purpose bound to the pending new email and sends the existing
   `email-verification` template to the NEW address. The authorize token is
   consumed. The response tells the client a verification link was sent to the
   new address.
3. The user clicks the verification link from the new address. The server
   finalizes: sets `email` to the pending value, clears `pending_email`, marks
   the email verified, and consumes the change token. This is the existing
   finalize behavior.

Notes:

- Reuse the existing `email_verification_tokens` table, the verify-email
  endpoint, and the `/verification` frontend route. Add the new authorize token
  purpose and branch on it in the verify handler: an authorize token issues the
  change token and emails the new address rather than finalizing.
- The new `email-change-confirm` template ships in French and English and is
  always sent (security-relevant), like the existing verification templates.
- The confirmation-to-old-address replaces the previous heads-up alert as the
  notification to the old address; the standalone alert send is no longer needed
  in this flow.
- Tokens expire consistent with the existing verification token lifetime and are
  single-use.
- Frontend messaging walks the user through both steps ("check your current
  inbox", then "check your new inbox").

## Feature 4 — Admin invoice links (new invoices only)

- New idempotent migration adding `hosted_invoice_url TEXT` to `reservations`.
- When an invoice is finalized for a reservation, persist the hosted invoice URL
  returned by the invoice-creation helper into the new column alongside the
  existing `stripe_invoice_id` / `invoice_status` writes.
- Include `hosted_invoice_url` in the `GET /api/admin/reservations` response.
- Frontend: in the admin reservation detail modal
  (`apps/web/src/lib/components/admin/ReservationDetailModal.svelte`), when a
  hosted invoice URL is present, render a "Voir la facture" link that opens it in
  a new tab (rel noopener). Reservations invoiced before this change have no
  stored URL and simply show no link.

## Testing

- Backend: unit/route tests for the profile update endpoint (allowed fields,
  rejection of email/role/password changes), the extended profile read, the
  two-step email-change flow (authorize token issues the change token and emails
  the new address; change token finalizes), and invoice-URL persistence + its
  presence in the admin reservations response.
- Frontend: component/route tests for the editable profile form, the
  password-reset button behavior, the language selector, the two-step email
  messaging, the Nav logout redirect to home, and the admin invoice link
  rendering (present when a URL exists, absent otherwise).
- Full typecheck clean; French/English i18n parity maintained.

## Non-goals

- No admin editing of other users' contact information (only self-service).
- No backfill of hosted invoice URLs for reservations invoiced before this
  change.
- No change to the password strength / HIBP checks or the reset-token flow
  itself beyond adding the profile trigger button.
