## Global Design Strategy

The site already uses **IBM Plex Sans** with a terracotta/ember palette and cool-blue surfaces. This design extends — not overrides — that system. The new motif is **"operational warmth"**: admin surfaces get a precision-instrument aesthetic (dark charcoal stat cards, monospace codes, tight data tables), while public review surfaces lean into the inn's identity (amber stars, warm surfaces, gentle serif headlines). The one unforgettable visual: the Aperçu dashboard's charcoal stat cards against the cool admin surface, with ember-amber numbers that feel like a well-read ledger — not a SaaS clone.

### Colour Palette
All tokens extend the existing `:root` design system; no existing token is redefined.

- `--color-surface: #f7f9fb` (existing — admin page background)
- `--color-surface-2: #f2f4f6` (existing — card/row backgrounds)
- `--color-surface-3: #eceef0` (existing — sunken inputs)
- `--color-ink: #191c1e` (existing — primary text, 14.8:1 on surface)
- `--color-ink-soft: #45464d` (existing — secondary text, 8.0:1 on surface)
- `--color-ink-mute: #76777d` (existing — muted/placeholder, 4.6:1 on surface ✓ AA)
- `--color-terracotta: #9d4300` (existing brand accent, 6.1:1 on surface ✓)
- `--color-terracotta-bright: #fd761a` (existing — hover/badge)
- `--color-ember: #ffb690` (existing — warm highlight)
- `--color-ember-pale: #ffdbca` (existing — warm tint backgrounds)
- `--color-charcoal: #2d3133` (existing — dark card surfaces for Aperçu)
- `--color-on-charcoal: #eff1f3` (existing — text on charcoal, 11.5:1 ✓)
- `--color-on-charcoal-soft: #c6c6cd` (existing — secondary text on charcoal, 7.2:1 ✓)
- `--color-hairline: #c6c6cd` (existing — borders)
- `--color-hairline-2: #e0e3e5` (existing — subtle dividers)
- NEW `--color-star: #9d4300` (reuse terracotta — amber star, 6.1:1 on surface ✓)
- NEW `--color-pending-badge-bg: #fd761a` (terracotta-bright on charcoal = 4.9:1 ✓)
- NEW `--color-pending-badge-text: #191c1e` (ink on ember-pale badge variant)
- NEW `--color-stat-number: #fd761a` (large display numerals on charcoal — decorative, AA not required at display size; on surface they use `--color-terracotta` for AA compliance)
- Status: confirmed=`#1a6e3c` (7.1:1 ✓), pending=`#7a5c00` (4.7:1 ✓), cancelled=`#76777d` (4.6:1 ✓), rejected=`#8b1a1a` (7.3:1 ✓)

### Typography
- **Primary**: `"IBM Plex Sans", "IBM Plex Sans Fallback", sans-serif` (existing webfont, already loaded — no new network requests)
- **Display / callout numbers**: `"Playfair Display", Georgia, "Times New Roman", serif` — used exclusively for: Aperçu dashboard stat figures, the `/avis` page average-rating header, and the `/avis/nouveau` page title. Load via `<link rel="preload">` using the variable-weight subset from Google Fonts (latin only, `wght@400..700`).
- **Monospace / codes**: `"IBM Plex Mono", "Courier New", monospace` — used for reservation codes (`AVP-XXXXXX`), dates in detail modal, occupancy ratios.
- Sizes: 11px label / 13px body-sm / 14px body / 16px body-lg / 20px h3 / 24px h2 / 32px h1 / 40px stat-display
- Line-height: 1.5 body, 1.3 headings, 1.0 stat numbers

### Spacing
- Base unit: 4px; scale: `xs`=4 `sm`=8 `md`=12 `lg`=16 `xl`=24 `2xl`=32 `3xl`=48 `4xl`=64

### Accessibility
- Minimum contrast ratio: 4.5:1 (WCAG AA) — all text tokens verified above
- Keyboard navigation: all interactive elements reachable via Tab; modal focus trap; row-as-button keyboard activation
- Focus indicator: `outline: 2px solid var(--color-terracotta); outline-offset: 2px` on all focused elements
- ARIA roles required:
  - `admin-tab-nav`: `role="tablist"` on `.page-admin__tabs-inner`; `role="tab"` + `aria-selected` on each button; `aria-controls` → corresponding panel id
  - `modal`: `role="dialog"` `aria-modal="true"` `aria-labelledby="modal-title"` on the container; `aria-label="Fermer"` on the close button
  - `reservation-table-row`: `role="row"` in table context; the clickable row wrapper uses `role="button"` `tabindex="0"` `aria-label="Voir les détails de [nom]"`; Actions cell `role="cell"` with buttons using `aria-label` including the guest name
  - `reservation-detail-modal`: inherits `modal` roles; each section (`role="region"` `aria-labelledby`) for Détails, Facture, Chambres
  - `admin-parametres-tab`: each card is a `<fieldset>` with `<legend>`; sticky save `type="submit"` with `aria-live="polite"` status message; toggles are `role="switch"` `aria-checked`
  - `admin-disponibilites-tab`: date pickers are `<input type="date">` with explicit `<label for>`; range list rows use `role="row"` in a `<table>`; delete buttons `aria-label="Supprimer la plage [dates]"`
  - `admin-apercu-tab`: `role="region"` `aria-label="Tableau de bord"` for the whole tab; each stat card `role="figure"` with `aria-label`; availability strip `role="img"` `aria-label="Disponibilité sur 7 jours"` with a visually-hidden text summary
  - `avis-nouveau-page`: star picker `role="radiogroup"` `aria-label="Note sur 5 étoiles"` with `role="radio"` on each star; textarea `aria-describedby` pointing to character-count; success state announced via `role="alert"`
  - `admin-avis-tab`: status filter `role="tablist"` with `role="tab"` + `aria-selected`; pending badge `aria-label="N avis en attente"` on the parent tab
  - `reviews-strip`: `role="region"` `aria-label="Avis de nos clients"`; star display `aria-label="[N] étoiles sur 5"`
  - `avis-page`: `<main>`; average rating heading with `aria-label`; list of reviews as `<article>` per review

### Security
- No `innerHTML` assignments — use `textContent`, Svelte's `{expression}` interpolation, or `@html` only on server-sanitized content
- No `eval()` or `Function()`
- All user-supplied review body content escaped by Svelte's default templating (no `@html`)
- Reservation codes displayed with `{code}`, never injected raw
- Rating numbers validated `1..5` before rendering star loops (prevents `Array(NaN)`)

## Component Inventory

- component: admin-tab-nav
  description: Admin page tab navigation bar — CSS-only fix to hide horizontal scrollbar while preserving mobile scroll; padding reduction at ≤1280px so all tabs + Courriels link fit without overflow; pending-count badge on Avis tab when added in WS-D
  inputs: activeTab (string), tabs array with optional badge counts, Courriels link href
  interactions: tab button clicks to switch active tab; keyboard Tab/Enter/Space navigation
  kind: nav
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: modal
  description: Shared base modal — portaled to `<body>` via the existing `portal` action; role="dialog" aria-modal="true"; backdrop click-to-close; Escape key close; Tab focus trap over visible focusable children; restores focus to the previously focused element on close. Props: open, onclose, title?, size? (sm/md/lg). Children slot. Visual: clean white card, slight drop shadow, rounded-lg corners, header with title and ×-button.
  inputs: open (boolean), onclose (callback), title (string, optional), size ('sm'|'md'|'lg', default 'md')
  interactions: backdrop click → close; Escape keydown → close; Tab wraps inside modal; close button click
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: room-assignment-drawer
  description: Existing RoomAssignmentDrawer.svelte refactored to use Modal as its shell — replace inline portal/backdrop/focus-trap/Escape with `<Modal open={open} onclose={onclose} title="Assigner les chambres" size="lg">`. All existing props, Zod validation, and assignment logic preserved verbatim. All existing RoomAssignmentDrawer.test.ts assertions must pass unchanged.
  inputs: existing props (reservation, rooms, onclose, open)
  interactions: room selection form, save action — identical to current behavior
  kind: panel
  depends_on: [modal]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: reservation-table-row
  description: Compact reservations table row reduced to 6 columns — Nom · Arrivée · Départ · Chambres · Statut · Actions. Row is focusable (tabindex="0" role="button") with pointer cursor; click and Enter/Space fire onopen(reservation). Confirmer/Annuler remain in the Actions cell and call event.stopPropagation() (and on keydown) to never bubble to the row handler. Status badge uses existing status colour tokens. Removed columns: Courriel, Téléphone, Pers., Message.
  inputs: reservation object, onopen callback, onConfirm callback, onCancel callback
  interactions: row click/Enter/Space → onopen; Confirmer button (stopPropagation); Annuler button (stopPropagation)
  kind: card
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: reservation-detail-modal
  description: Full reservation detail modal built on Modal.svelte (size="lg"). Displays reservation code (IBM Plex Mono, terracotta, prominent), full name, email, phone, people count, message, source+external_ref, created_at, status. Below details: collapsible Facture section (hosts InvoiceCreator) and Chambres section (hosts the RoomAssignmentDrawer trigger button). Three-column grid on desktop, single column on mobile. Code is the hero element — visually distinct at the top of the modal.
  inputs: reservation (full object including code), open (boolean), onclose callback
  interactions: open/close Facture accordion; trigger RoomAssignmentDrawer; close modal
  kind: panel
  depends_on: [modal, room-assignment-drawer]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: admin-parametres-tab
  description: Settings tab extracted into AdminParametresTab.svelte as five grouped <fieldset> cards in order — (1) Tarification & taxes (nightlyPrice, weeklyPrice, tps, tvq, accommodationTax); (2) Coordonnées (contactEmail, contactPhone); (3) Réservations (reservationsEnabled toggle, assignableRoomCount read-only); (4) Courriels automatiques (4 existing email toggles + new emailReviewRequestEnabled); (5) Sécurité (current/new password with its own "Changer" button). One sticky bottom save button submits all non-password settings via adminUpdateSettings. Password change stays a separate call inside card 5. Every existing field behavior preserved. Toggles use role="switch" aria-checked pattern.
  inputs: adminSettings object, loading state, onSave callback, onChangePassword callback
  interactions: text inputs, number inputs, toggle switches, sticky save click, password change click; all fields validation mirrors existing behavior
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: admin-disponibilites-tab
  description: Updated AdminDisponibilitesTab.svelte with range-aware create/delete. Create form gains a start-date picker and end-date picker (end defaults to start value on change; validated start ≤ end, span ≤366). Submit calls adminCreateBlackoutRange. List display groups consecutive days with identical rooms_blocked and note into a single range row ("12 → 18 août · 12 chambres · note") computed client-side; non-consecutive or differing days remain separate rows. Range row delete calls adminDeleteBlackoutRange(start, end); single-day row delete calls existing single-day endpoint. All existing single-day behavior and availability math unchanged.
  inputs: blackout dates array (sorted), assignableRoomCount
  interactions: start/end date pickers, create range form submit, delete row (single-day or range), loading states
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: admin-apercu-tab
  description: New AdminApercuTab.svelte — default landing tab. Layout top-to-bottom: (a) stat card row — guests this week (large Playfair Display number, "vs semaine dernière" delta with ▲/▼ arrow in terracotta/mute); (b) occupancy card row — currentMonth, previousMonth, sameMonthLastYear as percentages each with a delta, "—" for null; (c) returning-customers stat card; (d) 7-day availability strip — 7 day columns (day label + date, free-room bar, available count), bars fill proportionally to available/assignableRoomCount. Charcoal (#2d3133) card backgrounds with on-charcoal text for the stat cards; availability strip on surface-2 with terracotta fill bars. Wraps to single column at 375px.
  inputs: DashboardResponse (guestsThisWeek, guestsLastWeek, next7Days, occupancy, returningCustomers), assignableRoomCount for strip scale
  interactions: none (read-only display); data fetched on mount via adminDashboard()
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: avis-nouveau-page
  description: Public /avis/nouveau page. Reads ?code= query param; calls reviewEligibility on mount — shows generic error screen for invalid/ineligible codes. For eligible guests: greeting "Bonjour [firstName]", 1–5 interactive star picker (role="radiogroup"; each star is a radio input visually styled as a filled/hollow star icon in terracotta; keyboard-selectable), textarea (10–2000 chars with live character counter), submit button. On success: thank-you screen with confirmation message. On 409: "Vous avez déjà soumis un avis." All error states generic (no reservation data leak). No login required. Warm surface-2 card on surface background. Playfair Display for the page heading.
  inputs: URL search params (?code=)
  interactions: star selection (keyboard + click), textarea input, form submit, loading states, success/error state transitions
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: admin-avis-tab
  description: New AdminAvisTab.svelte — admin review moderation. Status filter tabs at top (Pending/Approuvés/Rejetés/Tous, default Pending) with a pending-count badge on the parent nav tab. Review list: each row shows star rating (compact 1–5 display), display_name, excerpt of body (expandable), staysCount/nightsTotal, reservation code (monospace), created_at, and Approuver/Rejeter action buttons. Re-moderation allowed (buttons toggle based on current status). PATCH /api/admin/reviews/:id on action. Empty state per filter.
  inputs: AdminReviewsResponse, status filter state
  interactions: status filter tab switch, Approuver button, Rejeter button, body expand/collapse, loading states
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: reviews-strip
  description: Public homepage reviews strip — renders up to 3 most-recent approved reviews as horizontal cards (wraps on mobile). Each card: star display (filled stars in --color-star), body excerpt (2 lines clamped), "Marie T. · 3 séjours · 12 nuits" attribution line in ink-mute. Renders nothing (no wrapper, no empty state) when reviews array is empty — controlled by parent. Warm ember-pale (#ffdbca) tint on card background to evoke hospitality warmth, distinct from the admin surface. Section heading "Ce que disent nos clients" in Playfair Display.
  inputs: reviews (PublicReview[], max 3), averageRating (number | null)
  interactions: none (display only)
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: avis-page
  description: Public /avis page — all approved reviews, newest first. Header section: average star rating displayed as a large Playfair Display number + star row + "(N avis)" in ink-soft. Reviews in a 2-column grid (single column mobile). Each card identical to reviews-strip card style but full body (no clamping). Responsive at 375px. Consistent with site's existing public page styles (surface background, IBM Plex Sans body text).
  inputs: PublicReviewsResponse (reviews, averageRating, total) fetched on load
  interactions: none (display only)
  kind: page
  depends_on: [reviews-strip]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: footer-update
  description: Minor update to Footer.svelte — add a "/avis" navigation link ("Avis clients") in the appropriate existing nav list. Match existing footer link style exactly. No layout changes.
  inputs: existing footer props (unchanged)
  interactions: navigation link
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none