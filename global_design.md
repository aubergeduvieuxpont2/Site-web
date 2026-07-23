## Global Design Strategy

**Aesthetic Direction: "Auberge Raffinée" — Provincial Heritage Meets Payment Trust**

The Auberge du Vieux-Pont context — a heritage inn on a Quebec river — dictates the visual and architectural language: aged stone, cedar warmth, hand-crafted precision. For a payment backend, the dominant virtue is *trust*. Every design decision (colour, type, spacing) answers: does this feel like a place someone would hand their credit card to? The answer should be an unambiguous yes: warm but meticulous, artisanal but correct to the cent.

The unforgettable quality: **brass-on-linen typography** paired with **deep cedar green** — like the brass placard on an old inn door. No gradients, no glow. Weight and stillness.

### Colour Palette
- `--color-surface`: #F7F4EF (aged linen — warm white, evokes trust)
- `--color-surface-raised`: #FFFFFF (pure white for elevated cards)
- `--color-surface-deep`: #EDE8DF (pressed linen — table rows, alt rows)
- `--color-primary`: #3B5E4B (cedar green — WCAG AA on linen: 4.9:1 ✓)
- `--color-primary-dark`: #2D4A3E (deep cedar — hover states)
- `--color-accent`: #B5874A (aged brass — decorative only, large text only)
- `--color-accent-text`: #7A5530 (darkened brass for body text — WCAG AA on linen: 5.3:1 ✓)
- `--color-text`: #1E1E1C (near-black, warm — primary text)
- `--color-text-muted`: #6B6560 (warm ash — secondary text, WCAG AA: 5.1:1 ✓)
- `--color-border`: #D4C9B8 (warm stone — dividers, input borders)
- `--color-error`: #9B2335 (claret — payment errors, 409/503)
- `--color-success`: #2E7D52 (forest — confirmed status)
- `--color-held`: #7A5530 (brass-text — held/pending status)
- `--color-released`: #6B6560 (ash — released/expired status)

### Typography
- `--font-display`: 'Cormorant Garamond', Georgia, serif — for headings, status labels, inn identity; French baroque elegance
- `--font-body`: 'Jost', 'Trebuchet MS', sans-serif — clean modern legibility for all body text and UI
- `--font-mono`: 'DM Mono', 'Courier New', monospace — reservation IDs, session IDs, amounts, timestamps
- `base-size`: 15px; `line-height`: 1.65
- `h1`: 28px / Cormorant Garamond 500; `h2`: 20px; `h3`: 16px Jost 600
- `label`: 11px Jost 700 uppercase letter-spacing 0.08em (brass-text colour)

### Spacing
- base unit: 4px
- scale: xs=4px sm=8px md=12px lg=16px xl=24px 2xl=32px 3xl=48px 4xl=64px
- border-radius: 2px (panels), 4px (inputs, buttons) — heritage precision, not soft consumer product

### Accessibility
- Minimum contrast ratio: 4.5:1 (WCAG AA) — all palette entries verified above
- Keyboard navigation: all interactive elements Tab-reachable; focus ring `outline: 2px solid var(--color-primary)` offset 2px
- Payment form landmarks: `role="main"` wrapping payment region, `role="status"` for hold countdown, `aria-live="polite"` for availability messages
- Error states: `role="alert"` for 409/503 responses; errors announced immediately
- Stripe embedded checkout iframe: preserve Stripe's own accessibility, do not suppress focus within the frame
- Stream 3 contract: the embedded Stripe checkout mounts inside a labelled container `aria-label="Paiement sécurisé"` with `lang="fr"` on the document

### Security
- No `innerHTML` assignments in any glue code — use `textContent` or `createTextNode`
- The `clientSecret` received from this stream's API must never be logged, stored in `localStorage`, or appended to any URL — Stream 3 must pass it only to `stripe.initEmbeddedCheckout()`
- `holdExpiresAt` is display-only; never re-submit it to the server
- Stripe's `return_url` includes `{CHECKOUT_SESSION_ID}` (Stripe replaces this); ensure it is treated as a template literal at the API layer, never interpolated from user input
- CSP concern for Stream 3: `frame-src https://js.stripe.com` and `connect-src https://api.stripe.com` must be added — this is an explicit cross-stream contract

## Component Inventory

- component: availability-excluder
  description: >
    Add optional `excludeReservationId` (number) parameter to `availabilityForRange`
    in `apps/api/src/availability.ts`. Add `id` field to `ReservationRow` interface.
    Skip the named reservation's hold when computing occupancy — so the webhook
    re-check does not count a reservation's own hold against itself.
  inputs: existing availabilityForRange signature; new optional 5th param; ReservationRow interface
  interactions: pure function — no side effects; two callers unaffected when param omitted
  kind: module
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: stripe-checkout-helper
  description: >
    Add `createEmbeddedCheckoutSession(stripe, options)` to `apps/api/src/stripe.ts`.
    Maps French line items to Stripe `price_data` entries in CAD cents (multiply by 100,
    round to nearest integer). Creates session with `ui_mode='embedded'`, `mode='payment'`,
    `customer_email`, `return_url`, `metadata`. Returns `{ id, clientSecret }`.
    Must typecheck against installed Stripe SDK types for `ui_mode` and `client_secret`.
  inputs: Stripe client instance, guest email, line items array [{description, amount}], return_url, metadata {reservation_id}
  interactions: async call to Stripe API; no DB access
  kind: service
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: stripe-refund-helper
  description: >
    Add `refundCheckoutSession(stripe, sessionId)` to `apps/api/src/stripe.ts`.
    Retrieves the Checkout session, resolves `payment_intent` (string or expanded object),
    issues a full refund via `stripe.refunds.create({ payment_intent })`.
    Guards against missing payment_intent with a descriptive thrown error.
    Returns the Stripe refund object.
  inputs: Stripe client instance, checkout session id string
  interactions: async; two Stripe API calls (retrieve session, create refund)
  kind: service
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 1

- component: hold-booking-handler
  description: >
    Rework `POST /api/reservations` handler in `apps/api/src/index.ts`.
    Adds `HOLD_MINUTES = 15` module-level constant.
    Order of operations: (1) existing date validations; (2) 503 on missing STRIPE_SECRET_KEY
    BEFORE any write; (3) TS availabilityForRange pre-check → 409; (4) atomic guarded-insert
    CTE with pg_advisory_xact_lock + holds-aware occupancy SQL + conditional INSERT RETURNING;
    → 409 if no row returned; (5) reservation code assignment; (6) computeInvoice with
    type='full' + flat public settings → four French line items; (7) createEmbeddedCheckoutSession;
    (8) persist stripe_checkout_session_id; (9) return 201 {reservationId,clientSecret,holdExpiresAt};
    (10) compensation: if Stripe throws → release held row → 503.
    Removes old pending-insert + confirmation-email waitUntil block.
  inputs: ReservationRequestSchema validated body, c.env (DB_CONN, STRIPE_SECRET_KEY, settings), neon sql tag
  interactions: DB write (INSERT), DB update (UPDATE for session id), Stripe API call, settings load
  kind: handler
  depends_on: [availability-excluder, stripe-checkout-helper, stripe-refund-helper]
  designer_model: claude-sonnet-4-6
  builder_model: claude-fable-5
  ralph: 3

- component: webhook-booking-branch
  description: >
    Extend `POST /api/webhooks/stripe` in `apps/api/src/index.ts` with a booking branch
    for `checkout.session.completed`. Branch selected first: match by metadata.reservation_id
    or stripe_checkout_session_id. Falls through to existing invoice.paid path if no match.
    Idempotency guard: no-op if already confirmed+paid. Re-checks availability via
    availabilityForRange with excludeReservationId. If available: confirms, sets invoice_status='paid',
    paid_at=now(), enqueues confirmation email. If unavailable: refundCheckoutSession, sets
    status='released'. Guards refund against redelivery. Returns {received:true}.
    Existing invoice.paid / invoice.payment_succeeded / invoice.payment_failed paths untouched.
  inputs: verified Stripe event (checkout.session.completed), DB_CONN, STRIPE_SECRET_KEY, neon sql tag
  interactions: DB read (SELECT reservation), DB write (UPDATE status/invoice_status/paid_at), Stripe refund API, enqueueEmail
  kind: handler
  depends_on: [availability-excluder, stripe-refund-helper, stripe-checkout-helper]
  designer_model: claude-sonnet-4-6
  builder_model: claude-fable-5
  ralph: 3

- component: payment-tests
  description: >
    Unit/integration tests under `apps/api/test` and `apps/api/src` for all Stream 2 surfaces.
    Mocks: neon sql tagged template, Stripe client, enqueueEmail. Test cases:
    POST /reservations — available dates → 201 {clientSecret,reservationId,holdExpiresAt} + held row;
    unavailable night → 409 no insert; STRIPE_SECRET_KEY unset → 503 no held row; Stripe throws
    → 503 + released row.
    createEmbeddedCheckoutSession — correct price_data CAD cents, ui_mode=embedded, returns clientSecret.
    refundCheckoutSession — retrieves session, resolves payment_intent, calls refunds.create.
    availabilityForRange with excludeReservationId — excluded hold not counted; without param, counted.
    Webhook — held+available → confirmed+paid+email; held+unavailable → refund+released; redelivered → no-op.
    Parity test — SQL guard and TS availabilityForRange agree on shared fixture (same occupancy decision).
  inputs: all Stream 2 modules; Vitest; mock factories for sql/stripe/enqueueEmail
  interactions: none (unit/integration, no live DB or Stripe)
  kind: test
  depends_on: [hold-booking-handler, webhook-booking-branch, availability-excluder, stripe-checkout-helper, stripe-refund-helper]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2