# Design — 15-minute reservation hold + embedded payment for website bookings

**Date:** 2026-07-22
**Delivery:** orchestrator (decomposed into the streams in §9).

Website bookings currently create a `pending` reservation, and the availability
engine counts only `confirmed` rows against inventory — so a `pending` booking
holds nothing and two guests can be mid-booking for the same night. This feature
makes a website booking **hold its rooms for 15 minutes** while the guest pays
the full amount via **embedded Stripe Checkout** on the reservation page. Paid →
confirmed; unpaid after 15 min → released (rooms freed).

## Decisions (confirmed with operator)

- **Amount:** full stay total (base + taxes) upfront.
- **Payment UX:** **Stripe Embedded Checkout** rendered on the reservation page.
- **Required:** payment is required to confirm a website booking.
- **Expired holds:** marked `released` (row kept for audit), not deleted.
- **Late-payment edge case:** if a payment lands after the hold was released and
  the dates are no longer available, **refund** it (handled, not ignored).

---

## 1. Holds count against inventory (the core change)

`availabilityForRange` (`apps/api/src/availability.ts`) today counts
`status='confirmed'`. Change it to count **confirmed OR an active hold**:

```
status = 'confirmed'
  OR (status = 'held' AND hold_expires_at > now())
```

Expired holds are ignored by this predicate, so inventory frees up the instant a
hold lapses — correctness is immediate and does not depend on the cleanup cron.

## 2. Data model

Migration (idempotent, `ADD COLUMN IF NOT EXISTS`), one change per numbered file:
- `reservations.hold_expires_at TIMESTAMPTZ` — when an unpaid hold lapses.
- `reservations.stripe_checkout_session_id TEXT` — links the Checkout Session
  back to the reservation for webhook confirmation.

Status domain (no DB CHECK constraint today — enforced by the Zod enum and app
logic; extend both): add **`held`** and **`released`**. `confirmed` / `cancelled`
/ `pending` unchanged. `ReservationStatusSchema` and the frontend `statusLabel`
gain the two new values (FR labels: `held` → "En attente de paiement", `released`
→ "Expirée").

## 3. Booking → payment flow

1. **Guest submits the booking form.** `POST /reservations` changes behavior:
   - Acquire a Postgres **advisory lock** (`pg_advisory_xact_lock`) for the
     duration of a transaction so the availability check and the held INSERT are
     atomic — two concurrent requests can't both hold the last room.
   - Re-check availability (holds-aware, §1). If unavailable → 409.
   - Insert a **`held`** reservation with `hold_expires_at = now() + 15 min`
     (`HOLD_MINUTES = 15`, a named constant).
   - Create a **Stripe Embedded Checkout Session** (`ui_mode='embedded'`,
     `mode='payment'`, itemized `line_items` = base + 3 taxes reusing the §Stream-
     itemization, `metadata.reservation_id`, `return_url`). Persist
     `stripe_checkout_session_id`.
   - Return `{ reservationId, clientSecret, holdExpiresAt }`.
   - If Stripe is not configured (`STRIPE_SECRET_KEY` unset) → 503 "Paiement
     temporairement indisponible" (payment is required, so no silent fallback).
2. **Reservation page** swaps the form for a **payment section**: the embedded
   Stripe checkout mounted from `clientSecret`, plus a live **countdown** derived
   from `holdExpiresAt` and the message *"Vos chambres sont réservées pendant 15
   minutes."* The countdown is cosmetic; `hold_expires_at` on the server is
   authoritative.
3. **Guest pays** → Stripe fires `checkout.session.completed`.
4. **Webhook** (`POST /api/webhooks/stripe`, extend the existing handler):
   - Find the reservation by `stripe_checkout_session_id` (or
     `metadata.reservation_id`).
   - **Re-check availability** for its dates, excluding this reservation's own
     hold. This runs on **every** payment, regardless of whether the hold is
     still active or was already `released` by the cron.
   - **Rooms available → confirm** (reclaim): `status='confirmed'`,
     `invoice_status='paid'`, `paid_at=now()`; enqueue the confirmation email
     (toggle-gated, as today). This is the path even for a payment that arrives
     after the hold was released, as long as the dates are still open.
   - **Rooms NOT available → refund** (the only refund case): the hold was
     released and the dates were retaken before payment cleared, so we cannot
     honor it — **refund** via `refundCheckoutSession`, set `status='released'`,
     log. The guest is not confirmed.
   - Idempotent: a re-delivered event must not double-confirm or double-refund
     (guard on current status / a `!= 'confirmed'` predicate).

## 4. Release mechanism

The every-minute cron (`scheduled` handler in `apps/api/src/index.ts`) gains one
step, run alongside the outbox drain:

```
UPDATE reservations
SET status = 'released'
WHERE status = 'held' AND hold_expires_at < now()
```

Availability already ignores expired holds (§1), so this is housekeeping — it
keeps the admin list clean and gives released holds a terminal state.

## 5. Frontend

- **Reservation page** (`apps/web/src/routes/contact/+page.svelte`): after a
  successful `POST /reservations`, render the embedded-checkout payment section +
  countdown instead of the form. On completion Stripe redirects to `return_url`
  (a confirmation view) which shows success (the webhook does the authoritative
  confirm; the page reflects it).
- **States:** submitting → paying (embedded) → success (confirmation) → expired
  (hold lapsed before payment: "Votre réservation a expiré, veuillez recommencer").
- **i18n:** the site is bilingual — all new strings (payment section, countdown,
  confirmation, expired) go in the `fr`/`en` dictionaries with key parity.
- **Dependency:** add `@stripe/stripe-js` to `apps/web`; load Stripe with the
  publishable key.

## 6. Config & security

- **`VITE_STRIPE_PUBLISHABLE_KEY`** — public Stripe publishable key, safe in the
  frontend bundle (build-time env var; documented in `.dev.env.example` /
  frontend config). Per-mode (test/live).
- **CSP** (`apps/web/src/hooks.server.ts`): extend from `script-src 'self'` to
  allow Stripe — `script-src 'self' https://js.stripe.com`,
  `frame-src https://js.stripe.com https://*.stripe.com` (Embedded Checkout
  iframe). `connect-src 'self' https:` already permits `api.stripe.com`. This is
  the only security-surface change; scope it to Stripe domains exactly.

## 7. Stripe helpers (`apps/api/src/stripe.ts`)

- `createEmbeddedCheckoutSession(stripe, { customerEmail, lineItems, returnUrl,
  metadata })` → `{ sessionId, clientSecret }`. `ui_mode='embedded'`,
  `mode='payment'`, CAD, itemized `line_items` (base + taxes).
- `refundCheckoutSession(stripe, sessionId)` → resolve the session's payment
  intent and issue a full refund (late-payment edge case).
- Reuse `constructStripeEvent` for the webhook (unchanged).

## 8. Testing

- **Availability-with-holds:** an active hold reduces availability; an expired
  hold does not (unit test on `availabilityForRange`).
- **Booking endpoint:** creates a `held` row with `hold_expires_at`, creates a
  Checkout Session, returns `clientSecret`; concurrent-request atomicity (advisory
  lock) does not double-hold the last room; Stripe-unconfigured → 503.
- **Webhook confirm:** `checkout.session.completed` on an available hold →
  confirmed + email enqueued (toggle on); idempotent re-delivery.
- **Webhook late-payment, rooms still open:** payment on an already-`released`
  reservation whose dates are still available → **confirmed** (reclaimed), no
  refund.
- **Webhook late-payment, rooms gone:** payment on a `released` reservation whose
  dates were retaken → **refund** issued, stays `released`, not confirmed.
- **Cron release:** expired `held` → `released`; active `held` untouched.
- **Frontend:** payment-section states, countdown, expired-hold handling; i18n
  key parity for the new strings.

## 9. Delivery decomposition (orchestrator streams)

1. **Data model + availability + cron release** — migration, `held`/`released`
   status, holds-aware `availabilityForRange`, cron cleanup step. Foundational.
2. **Booking endpoint + Stripe Embedded Checkout Session + webhook confirm/refund**
   — the payment backend (depends on #1).
3. **Reservation-page embedded payment + countdown + CSP + config + i18n** — the
   frontend (depends on #2's response contract).

## 10. Cross-cutting constraints

- Migrations idempotent; secrets/keys out of `apps/web` except the **publishable**
  key (which is public by design).
- `npm run typecheck` green; `apps/web` + `apps/api` Vitest green; the Stripe
  param shapes (`ui_mode`, `client_secret`, refunds) are validated by typecheck
  against the real SDK types.
- Bilingual FR/EN with key parity for all new guest-facing strings.
- Fully responsive; the embedded payment section must work at mobile widths.

## 11. Operator TODO (external)

- Set `VITE_STRIPE_PUBLISHABLE_KEY` (test `pk_test_…`) for the web build; the live
  key before go-live.
- Verify the Stripe webhook endpoint is subscribed to `checkout.session.completed`
  (in addition to `invoice.paid`).
- Test the full flow with test card `4242…`; verify a hold expiry releases rooms.
