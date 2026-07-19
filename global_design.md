## Global Design Strategy

This is an admin back-office for a French-Canadian inn (Auberge du Vieux Pont). The Stripe stream adds financial state — paid/open badges, hosted-invoice links — to an existing admin UI. The aesthetic is **refined ledger**: warm parchment ground, aged-brass accent, deep-forest-green for "paid", amber for "pending". Evokes a well-kept accounts book rather than a cold fintech dashboard. Typography pairs Playfair Display (headers, amounts) with DM Sans (body, labels) and JetBrains Mono for invoice IDs and timestamps.

### Colour Palette
- `--surface`: `#FAF7F2` (warm parchment, page ground)
- `--surface-raised`: `#F0EBE3` (card/modal background)
- `--surface-inset`: `#E8E0D4` (input/table row fill)
- `--border`: `#C8BAA8` (warm grey-brown rule)
- `--text`: `#1E1610` (near-black warm brown)
- `--text-muted`: `#6B5A47` (secondary labels)
- `--accent`: `#8B5E1A` (aged brass — primary CTAs, links)
- `--accent-hover`: `#6E4912` (darker brass on hover)
- `--paid`: `#1A5C3A` (deep forest green — confirmed paid)
- `--paid-bg`: `#E6F4EE` (green tint badge background)
- `--paid-border`: `#A3D4BC` (green badge border)
- `--open`: `#9A5C12` (amber-brown — invoice open / pending)
- `--open-bg`: `#FEF3E2` (amber tint badge background)
- `--open-border`: `#F2C97A` (amber badge border)
- `--danger`: `#8C2020` (error / destructive)
- `--link-external`: `#1B4E8A` (distinct blue for external Stripe link)

### Typography
- `--font-display`: `'Playfair Display', Georgia, serif` — headings, amounts, modal titles
- `--font-body`: `'DM Sans', 'Helvetica Neue', sans-serif` — labels, body text, buttons
- `--font-mono`: `'JetBrains Mono', 'Fira Code', ui-monospace, monospace` — invoice IDs, timestamps, currency figures
- base size: `14px`; line-height: `1.6`
- h1: `20px` Playfair Display 600; h2: `16px` Playfair Display 500; label: `12px` DM Sans 500 uppercase tracking

### Spacing
- base unit: `4px`
- xs: `4px` · sm: `8px` · md: `12px` · lg: `16px` · xl: `24px` · 2xl: `32px`

### Accessibility
- Minimum contrast ratio: 4.5:1 (WCAG AA) — all text colours validated against their background
- `--paid` `#1A5C3A` on `--paid-bg` `#E6F4EE` → ratio 7.2:1 ✓
- `--open` `#9A5C12` on `--open-bg` `#FEF3E2` → ratio 5.1:1 ✓
- `--accent` `#8B5E1A` on `--surface` `#FAF7F2` → ratio 5.4:1 ✓
- Keyboard navigation: all interactive elements (invoice link, copy button) reachable via Tab; focus ring uses `outline: 2px solid var(--accent)`
- ARIA roles required:
  - `payment-status-badge`: `role="status"` with `aria-label` describing paid/open state; `aria-live="polite"` when status can update in-place
  - `invoice-creator` link: `<a>` with `aria-label="Voir la facture Stripe (nouvel onglet)"` and `target="_blank" rel="noopener noreferrer"`
  - Loading states: `aria-busy="true"` on the submit button while Stripe call is in-flight
  - Error states: `role="alert"` on error message containers

### Security
- No `innerHTML` assignments — use `textContent` or sanitized interpolation only
- External Stripe URL rendered as `href` on an `<a>` element; never via `window.location` redirect or `eval`
- `hostedInvoiceUrl` from API response used only as `href` attribute value; the frontend never constructs Stripe URLs itself
- No Stripe secret keys in `apps/web` — the hosted-invoice URL is a safe public link returned from the backend
- `rel="noopener noreferrer"` on all `target="_blank"` links to prevent opener access

## Component Inventory

- component: invoice-stripe-link
  description: After a successful invoice creation, renders the Stripe hosted-invoice URL as a distinct external link with a receipt icon. Shows a subtle animated reveal (fade + slide-up) on appearance. Handles null/missing URL gracefully with a fallback note. Styled with external-link accent colour distinct from the primary brass accent.
  inputs: hostedInvoiceUrl (string | null), stripeInvoiceId (string | null), isVisible (boolean — only renders post-success)
  interactions: click opens URL in new tab; no state mutation. Optional copy-to-clipboard action for the invoice ID shown in monospace.
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: payment-status-badge
  description: Inline badge that shows the reservation's payment state. Three states — null (no badge), 'open' (amber "Facturé — en attente" pill), 'paid' (green "Payé" pill with formatted paid_at date). Fits inside ReservationDetailModal without layout disruption. The paid variant includes a small checkmark icon and the paid date in monospace.
  inputs: invoice_status (string | null), paid_at (string | null)
  interactions: display-only; no clicks. paid_at formatted to locale French Canadian date string.
  kind: card
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: invoice-creator-extended
  description: Extension of the existing InvoiceCreator.svelte that integrates the invoice-stripe-link into the post-success state. Updates the local InvoiceResult type to include optional stripeInvoiceId / hostedInvoiceUrl. Manages display sequencing — breakdown table shows first, then Stripe link appears below with a brief delay for visual hierarchy.
  inputs: reservation id, existing invoice props; new: stripeInvoiceId, hostedInvoiceUrl from API response
  interactions: form submit → loading → success (breakdown + Stripe link appear); error path unchanged
  kind: panel
  depends_on: [invoice-stripe-link]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: reservation-detail-modal-extended
  description: Extension of ReservationDetailModal.svelte that embeds the payment-status-badge in the detail view. Badge slots in after the existing status field, before the action buttons. No layout rework — additive placement only.
  inputs: row (ReservationRow with optional invoice_status, paid_at)
  interactions: display-only addition; existing modal actions unchanged
  kind: panel
  depends_on: [payment-status-badge]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1