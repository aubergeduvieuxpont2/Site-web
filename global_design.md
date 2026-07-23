## Global Design Strategy

This stream extends the site's established **"Industrial Zen"** language into the reservation payment flow — no new design vocabulary is introduced. The payment section and confirmation page inherit the cool-light `--color-surface` palette, IBM Plex type stack, terracotta/ember accent system, `tech-label` utility, and hairline structural borders already in use across the site.

**New visual treatments introduced:**
- **Hold-indicator strip** — a depleting progress bar beneath the countdown, cycling from `--color-ember` (plentiful time) → `--color-terracotta-bright` (under 3 min) → `--color-terracotta` (under 1 min), driven by a CSS custom property updated each second.
- **Countdown numeral block** — IBM Plex Mono at 2.5rem, centred, with `aria-live="polite"`. The numeral shifts colour class with the hold-indicator.
- **Stripe mount frame** — a pure-white container (`#ffffff`) with 1px `--color-hairline` border, `--radius-lg` corners, and a subtle 0 4px 16px shadow. Prevents the Stripe iframe from appearing to float on the grey surface.
- **Expired/misconfigured mute treatment** — the entire card desaturates to `--color-ink-mute`/`--color-surface-3` tones; a centred icon (SVG clock with slash) precedes the expired copy.
- **Confirmation success badge** — `--color-forest` (#1a5c2d) filled circle with a white checkmark SVG, reusing the forest/forest-surface tokens already present in the design system.

### Colour Palette

Entirely inherited — no new tokens required:

| Role | Token | Hex |
|---|---|---|
| surface | `--color-surface` | #f7f9fb |
| card surface | `--color-surface-container-lowest` | #ffffff |
| ink | `--color-ink` | #191c1e |
| ink-soft | `--color-ink-soft` | #45464d |
| ink-mute | `--color-ink-mute` | #76777d |
| hold/countdown (ample) | `--color-ember` | #ffb690 |
| hold/countdown (low) | `--color-terracotta-bright` | #fd761a |
| hold/countdown (urgent) | `--color-terracotta` | #9d4300 |
| expired mute | `--color-surface-3` + `--color-ink-mute` | #eceef0 / #76777d |
| success | `--color-forest` | #1a5c2d |
| success surface | `--color-forest-surface` | #d4ede0 |
| hairline | `--color-hairline-2` | #e0e3e5 |
| error | `--color-error` | #ba1a1a |

All foreground/background pairs meet WCAG AA (4.5:1) against their respective surfaces.

### Typography

Fully inherited from the design system:

- **Body / labels:** `--font-sans` (IBM Plex Sans, 400–700)
- **Countdown numerals / session ID:** `--font-mono` (IBM Plex Mono) — the `tech-label` utility handles uppercase mono labels; countdown numerals use mono at 2.5rem/bold
- **Heading scale:** h2 = 1.25rem/600 (matches existing form-card headings), h3 = 1rem/600
- **Tech labels:** `font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.6875rem; font-weight: 500` — reuse `.tech-label` utility

### Spacing

Fully inherited — `--space-xs` through `--space-2xl`. The payment card uses `--space-md` (1.25rem) internal padding matching the existing form card, with `--space-sm` (0.75rem) between the countdown and the Stripe mount frame.

### Accessibility

- Countdown region: `aria-live="polite"` + `aria-atomic="true"` so screen-readers announce the updated time without interrupting the user.
- Expired and misconfigured states: focus shifted programmatically to the state heading on transition (same pattern as the existing success heading `tabindex="-1"` + `bind:this` + `.focus()`).
- Stripe mount container: `aria-label="Stripe secure payment form"` on the outer wrapper; the Stripe iframe itself provides its own internal accessibility.
- Back-to-form button: `data-testid="payment-back"`, visible label from `contact.payment.backToForm` key, receives focus on expired/misconfigured state entry.
- Confirmation page: `data-testid="reservation-confirmee"`, session ID rendered as text content only (never `innerHTML`).
- All interactive elements reachable via Tab; `:focus-visible` ring from global stylesheet applies everywhere.
- Reduced-motion: the hold-indicator animation and countdown colour transitions respect `prefers-reduced-motion: reduce` via the global rule already in `app.css`.

### Security

- No `innerHTML` assignments — all dynamic values (`greetingName`, `sessionId`) use Svelte text interpolation (`{value}`) which escapes by default.
- `session_id` from the URL query string is displayed as text only, never rendered as HTML.
- `STRIPE_PUBLISHABLE_KEY` (starts `pk_`) is the only Stripe value in `apps/web`; the secret key and webhook secret must never appear in this package.
- CSP additions are scoped exactly to `https://js.stripe.com` (script-src) and `https://js.stripe.com https://*.stripe.com` (frame-src); no wildcards broadened beyond Stripe.

## Component Inventory

- component: stripe-dep
  description: Add @stripe/stripe-js to apps/web/package.json dependencies and document VITE_STRIPE_PUBLISHABLE_KEY in .dev.env.example
  inputs: none (file edits only)
  interactions: none
  kind: infra
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: stripe-loader
  description: New apps/web/src/lib/stripe.ts — exports STRIPE_PUBLISHABLE_KEY and getStripe() lazy loader; resolves null when key absent; single seam for test stubbing
  inputs: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  interactions: none (module, no UI)
  kind: module
  depends_on: [stripe-dep]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: api-types
  description: Update createReservation return type in apps/web/src/lib/api.ts to ReservationHoldResponse (reservationId, clientSecret, holdExpiresAt); add exported interface; leave request body/path/method unchanged
  inputs: existing api.ts, Stream 2 response contract
  interactions: none (type change only)
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: i18n-strings
  description: Add contact.payment.* (heading, holdMessage, countdownLabel, expiredTitle, expiredBody, backToForm, unavailable) and top-level confirmation.* (title, body, sessionLabel, backHome) to both fr.ts and en.ts with identical key sets
  inputs: existing message dictionaries
  interactions: none (data only)
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: 1

- component: contact-payment
  description: Extend apps/web/src/routes/contact/+page.svelte with the post-submit payment section — three visual states (paying/expired/misconfigured) within the existing page-contact__form-card; hold-indicator progress bar; IBM Plex Mono countdown at 2.5rem; Stripe embedded checkout mount/destroy lifecycle; fade transitions between states; all strings via t()
  inputs: createReservation result (reservationId, clientSecret, holdExpiresAt), getStripe(), STRIPE_PUBLISHABLE_KEY, i18n keys from contact.payment.*
  interactions: countdown tick every second; Stripe iframe mount/destroy on effect; expired state on remainingMs<=0; back-to-form button resets to idle
  kind: section
  depends_on: [stripe-loader, api-types, i18n-strings]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: reservation-confirmee
  description: New route apps/web/src/routes/reservation-confirmee/+page.svelte and +page.ts — success confirmation page; reads session_id query param via $page.url.searchParams; renders forest-green success badge with checkmark; confirmation.* i18n strings; backHome link to /; no API calls; prerender=false
  inputs: $page.url.searchParams.get("session_id"), confirmation.* i18n keys
  interactions: static display; backHome link navigation
  kind: page
  depends_on: [i18n-strings]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: csp-update
  description: Extend apps/web/src/hooks.server.ts CSP — add https://js.stripe.com to script-src; add frame-src https://js.stripe.com https://*.stripe.com; leave all other directives unchanged; update leading comment
  inputs: existing hooks.server.ts CSP array
  interactions: none
  kind: infra
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: test-csp
  description: Add CSP assertions to apps/web/src/hooks.server.test.ts — script-src contains https://js.stripe.com; frame-src directive present containing https://js.stripe.com and a Stripe wildcard; existing assertions preserved
  inputs: updated hooks.server.ts
  interactions: none (test)
  kind: test
  depends_on: [csp-update]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: test-payment
  description: Extend apps/web/src/routes/contact/page-contact.test.ts — vi.mock("$lib/stripe") with pk_test_x key and fake initEmbeddedCheckout returning mount/destroy spies; update createReservation mock to new shape; tests for payment section render, countdown, fake-timer expiry, mount/destroy lifecycle
  inputs: contact-payment component, stripe-loader module mock
  interactions: none (test)
  kind: test
  depends_on: [contact-payment, stripe-loader]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: test-confirmee
  description: New apps/web/src/routes/__tests__/page-reservation-confirmee.test.ts — stub $app/stores page with session_id URL; assert success copy and session id render; assert no api-client functions called
  inputs: reservation-confirmee component
  interactions: none (test)
  kind: test
  depends_on: [reservation-confirmee]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: test-i18n
  description: New apps/web/src/lib/__tests__/payment-i18n.test.ts — assert all specific new keys (contact.payment.* and confirmation.*) exist in both fr and en dictionaries
  inputs: updated fr.ts and en.ts
  interactions: none (test)
  kind: test
  depends_on: [i18n-strings]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none