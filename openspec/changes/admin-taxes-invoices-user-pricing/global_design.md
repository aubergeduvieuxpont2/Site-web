## Global Design Strategy

**Aesthetic Direction — "Registre du Vieux Pont"**

This is an admin back-office for a Québec inn. The interface should feel like a well-crafted physical ledger: warm parchment surfaces, forest-green structural chrome, copper-amber accents. Tables carry the precision of hand-ruled ledger paper; forms feel like completing a considered registration card. The one thing an admin will remember: the warmth — this doesn't feel like generic SaaS, it feels like L'Auberge itself.

A subtle CSS noise grain on surface panels adds tactile depth without visual noise.

---

### Colour Palette

```
surface:          #F4EFE6   warm parchment (page bg)
surface-raised:   #ECE7DB   card/panel bg
surface-sunken:   #E0DAD0   table alternate row / input bg
border:           #C4BAA8   warm taupe ruling line
border-strong:    #9A8E7E   dividers, focused outlines
primary:          #1B3B2A   deep forest green (nav chrome, headers)
primary-hover:    #254F38
primary-text:     #F4EFE6   text on primary bg (WCAG AAA on #1B3B2A)
accent:           #7B4628   copper/terracotta (CTAs, links, highlights)
accent-hover:     #6A3A20
text:             #1C1A17   near-black warm (main body)
text-muted:       #695E51   supporting/secondary text
text-faint:       #9A8E7E   placeholder, disabled
success:          #2C5A3D   deep green badge bg  (text: #F4EFE6)
success-text:     #0D3320
warning:          #7A5C12   amber/gold badge bg
warning-text:     #3D2C06
danger:           #8A2828   terracotta-red badge bg
danger-text:      #3D0A0A
info:             #1C4468   deep slate-blue badge bg
info-text:        #0A1E30
```

All text/surface pairs tested at ≥ 4.5:1 (WCAG AA). `primary` (#1B3B2A) on `surface` (#F4EFE6): ~9.8:1. `accent` (#7B4628) on `surface`: ~5.2:1. `text` (#1C1A17) on `surface`: ~14:1.

---

### Typography

```
display:  "Cormorant Garamond", Georgia, serif
          — French-editorial character; used for page/section headings
ui:       "Jost", ui-sans-serif, system-ui, sans-serif
          — clean geometric warmth; all body, labels, table data
mono:     "JetBrains Mono", ui-monospace, monospace
          — IDs, codes, monetary amounts, dates-as-strings

base:       15px / 1.55  (ui)
heading h1: 24px / 1.2   (display, weight 500)
heading h2: 19px / 1.25  (display, weight 500)
heading h3: 15px / 1.4   (ui, weight 600, letter-spacing +0.03em UPPERCASE)
data cell:  14px / 1.4   (ui or mono for numeric columns)
label:      12px / 1.4   (ui, weight 600, UPPERCASE, letter-spacing +0.06em)
```

---

### Spacing

```
base unit: 4px
xs:   4px   (internal chip padding, tiny gaps)
sm:   8px   (input padding-y, icon gaps)
md:  16px   (card padding, form row gap)
lg:  24px   (section gap, panel padding)
xl:  40px   (page section spacing)
2xl: 64px   (hero/page top margin)

border-radius: 2px (inputs, badges) / 4px (cards, panels) / 6px (drawers)
```

---

### Accessibility

- Minimum contrast: 4.5:1 (WCAG AA) everywhere; `text` on `surface` exceeds 14:1
- All interactive elements keyboard-reachable via Tab; focus ring: 2px solid `accent`, 2px offset
- ARIA roles:
  - `room-assignment-drawer`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
  - `invoice-creator`: `role="dialog"` or inline `role="region"` with `aria-label="Créer une facture"`
  - `user-pricing-form`: `role="group"` wrapping the mutually-exclusive radio+input pairs
  - `reservation-table-row`: parent `<table>` uses `role="grid"`; action buttons have `aria-label` with reservation context
  - `user-profile-page`: landmark regions (`<main>`, `<section aria-labelledby>`)
  - Status badges: `role="status"` or `aria-label` on icon-only indicators
- `<button>` elements for all actions — no `div`/`span` click handlers
- French `lang="fr-CA"` already on `<html>`; new content in FR throughout

---

### Security

- No `innerHTML` — use Svelte's `{text}` binding (auto-escaped); never `{@html untrusted}`
- HubSpot contact data displayed via text binding only; no HTML properties rendered
- Amount/breakdown values rendered as formatted numbers via `Intl.NumberFormat`, not string interpolation
- Form submissions use typed Zod-validated bodies; client-side validation is UX only

---

## Component Inventory

- component: room-assignment-drawer
  description: |
    Slide-in drawer panel on a reservation row. Lists current room assignments with
    unassign buttons, then a free-rooms list (filtered by the reservation's date range)
    with assign buttons. Shows a French ineligibility message ("Les dates de cette
    réservation sont manquantes ou invalides") when dates are null/invalid or
    depart ≤ arrive. Respects room_count cap with a capacity badge.
  inputs: reservation id, arrive, depart, room_count; async: GET …/assignments, GET …/free-rooms, POST/DELETE …/assignments/:slug
  interactions: open/close via trigger button on row; assign room (POST); unassign (DELETE); disabled states during fetch; optimistic list update
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: invoice-creator
  description: |
    Inline action panel (expands below the reservation row or as a small popover).
    Radio toggle: "Acompte (30 %)" / "Facture complète". Deposit-mode exposes a
    % input (default 30). On confirm: calls POST …/invoice, then shows a collapsible
    InvoiceBreakdown table (nuits, chambres, prix effectif, base, TPS, TVQ, taxe
    hébergement, total, montant). Error state for 422 (missing dates / room_count).
  inputs: reservation id, arrive, depart, room_count (for client-side eligibility guard); async: POST /api/admin/reservations/:id/invoice
  interactions: toggle type radio; depositPercent input (visible only for deposit mode); confirm button → loading → breakdown reveal or error; collapse/re-open breakdown
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: tax-settings-fields
  description: |
    Three numeric input rows added to the existing Paramètres admin panel: TPS (%),
    TVQ (%), and Taxe d'hébergement (%). Labels in French with "(%)". Accepts
    decimals (step="0.001"), rejects negatives client-side. Slots into the existing
    saveSettings form alongside nightlyPrice and contactEmail.
  inputs: settings.tps, settings.tvq, settings.accommodationTax (two-way bound); on-change validation (≥ 0)
  interactions: numeric input with decimal support; validation error inline below each field; dirty-flag triggers the existing Save button
  kind: form
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: reservation-table-row
  description: |
    Corrected admin reservations table row. Fields: name (first_name + last_name or
    name fallback), email, phone, people, arrive (formatDateOnly → fr-CA, "—" for
    null), depart (same), room_count, message truncated. Action cell: trigger for
    room-assignment-drawer and invoice-creator. formatDateOnly parses YYYY-MM-DD as
    local calendar date (no UTC shift).
  inputs: ReservationRow (corrected shape: arrive, depart, people, room_count, first_name, last_name)
  interactions: "Chambres" button → opens room-assignment-drawer; "Facture" button → opens invoice-creator; responsive horizontal scroll at ≤640px
  kind: row
  depends_on: [room-assignment-drawer, invoice-creator]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: user-pricing-form
  description: |
    Mutually exclusive pricing section within the admin user profile. Three radio
    states: "Prix public" (no custom), "Remise (%)", "Prix fixe ($/nuit)". Selecting
    a mode shows its numeric input. Selecting "Prix public" clears both DB columns.
    Saving calls POST /api/admin/users/:id/pricing. Shows current effectiveNightlyPrice
    as a computed preview badge.
  inputs: user.discount_percent, user.fixed_nightly_price, public nightlyPrice (from settings); async: POST /api/admin/users/:id/pricing
  interactions: radio toggle between 3 modes; conditional numeric input; save button → loading → success toast or error; mutual-exclusivity enforced (only one value sent, other nulled)
  kind: form
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: user-profile-page
  description: |
    Dedicated SPA route /admin/utilisateurs/:id. onMount admin-gate then adminGetUser.
    Two-column layout at ≥640px, single-column mobile. Left: local user fields card
    (email, name, phone, company, role, dates, HubSpot contact ID). Right: HubSpot
    live data card (properties table from /ops/execute contact.getById) or
    "Aucune donnée HubSpot" placeholder with explanation. Below both: user-pricing-form
    card. Sticky top back link "← Utilisateurs" to /admin (Utilisateurs tab anchor).
  inputs: route param id; async: adminGetUser → { user: AdminUserDetail, hubspot: Record | null }
  interactions: back link navigation; user-pricing-form interaction; loading skeleton while fetching; HubSpot card graceful null state never blocks local fields
  kind: page
  depends_on: [user-pricing-form]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: utilisateurs-row
  description: |
    Updated row in AdminUtilisateursTab. User email rendered as an anchor
    (<a href="/admin/utilisateurs/{id}">email</a>) styled as the accent copper link.
    Existing role badge and password-reset-link action remain intact. Role filter and
    column layout unchanged.
  inputs: User row data (id, email, name, role, created_at)
  interactions: click email → navigate to user profile page; existing role/actions unchanged
  kind: row
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: profil-reservation-table
  description: |
    Guest-facing /profil page reservation table updated to the corrected ReservationRow
    fields. arrive/depart formatted with the same date-only-safe formatDateOnly helper
    (fr-CA locale, "—" for null). people column replaces guests. No action columns.
  inputs: ReservationRow[] (corrected shape)
  interactions: display-only; horizontal scroll at ≤640px
  kind: panel
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: room-card-effective-price
  description: |
    Updated RoomCard.svelte and le-site/+page.svelte price display. Reads
    auth.user?.effectiveNightlyPrice ?? settings.nightlyPrice for the displayed
    amount. When a custom price is active (effectiveNightlyPrice differs from public),
    shows a subtle "Tarif personnalisé" chip below the price so the user sees their
    benefit without the original price shown.
  inputs: auth store (user.effectiveNightlyPrice), settings store (nightlyPrice)
  interactions: display-only; reactive to auth state changes (login/logout updates price shown)
  kind: card
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1