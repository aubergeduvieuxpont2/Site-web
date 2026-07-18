## Global Design Strategy

The Auberge du Vieux Pont admin and review UIs operate within an established **"Industrial Zen"** design language — cool off-white surfaces (#f7f9fb), warm terracotta/orange accent (#fd761a / #9d4300), and IBM Plex as the exclusive typeface family. All new components extend this system; they do not override it.

The one design decision that elevates the new work above generic: **IBM Plex Serif** (already loaded) is used for large display numerals — dashboard stat counts, average review ratings. This creates an editorial weight contrast against the IBM Plex Sans UI shell without introducing a foreign font. Think hotel ledger meets operations dashboard.

Admin additions (Aperçu, Paramètres, Avis tabs) feel like a well-run boutique back-office: data-dense but unhurried, with generous card padding and deliberate whitespace. Public review surfaces (/avis, /avis/nouveau, ReviewsStrip) are warm and human — parchment-warm card backgrounds, italic serif body text, terracotta star fills.

### Colour Palette
All values reference existing CSS custom properties from `apps/web/src/app.css @theme`.

**Surfaces (existing tokens):**
- `--color-surface`: #f7f9fb — page background
- `--color-surface-2`: #f2f4f6 — card wells, table stripes
- `--color-surface-3`: #eceef0 — inputs, inline chips
- Admin warm surface: #f4efe6 — warm beige for admin tab bodies (existing usage pattern)

**Ink (existing tokens):**
- `--color-ink`: #191c1e — primary text
- `--color-ink-soft`: #45464d — secondary text
- `--color-ink-mute`: #76777d — captions, placeholders
- `--color-outline-variant`: #c6c6cd — borders, dividers
- `--color-hairline`: #c6c6cd — table lines

**Accent (existing tokens):**
- `--color-terracotta`: #9d4300 — primary action, links
- `--color-terracotta-bright`: #fd761a — hover state, star fill, active badges
- `--color-ember`: #ffb690 — light tint backgrounds (pending badge)
- `--color-ember-pale`: #ffdbca — very light tint (admin badge bg)

**Semantic (existing + derived):**
- `--color-forest`: #1a5c2d — "approved", positive availability, toggle-on
- `--color-forest-surface`: #d4ede0 — approved card tint, availability bars at ≥50%
- `--color-error`: #ba1a1a — destructive actions, rejected state
- Pending: use `--color-ember-pale` bg + `--color-terracotta` text
- Rejected: use `#fde8e8` bg + `--color-error` text (derive inline)

**New token (one addition):**
- `--color-star`: #fd761a — alias for star fill (= `--color-terracotta-bright`); define in component scope

### Typography
All from the existing IBM Plex family (self-hosted):

- **Display numerals** (stat cards, avg rating): `"IBM Plex Serif"`, weight 700, size 2.5rem–3.5rem — creates editorial weight for big numbers
- **UI body**: `"IBM Plex Sans"`, weight 400/500/600, 0.875rem–1rem — existing baseline
- **Monospace** (reservation codes, dates, availability counts): `"IBM Plex Mono"`, weight 400, 0.8125rem
- **Review body text**: `"IBM Plex Serif"`, weight 400, 1rem, `font-style: italic` — makes reviews feel human and quotation-like

### Spacing
Existing scale from `@theme`:
- `--space-xs`: 0.5rem (8px)
- `--space-sm`: 0.75rem (12px)
- `--space-md`: 1.25rem (20px)
- `--space-lg`: 2rem (32px)
- `--space-xl`: 3rem (48px)
- `--space-2xl`: 4.5rem (72px)

Card padding: `--space-md` (20px). Section gap between cards: `--space-lg` (32px). Tab body padding: `--space-md` sides.

### Accessibility
- Minimum contrast ratio: 4.5:1 (WCAG AA) — terracotta #9d4300 on white: 5.74:1 ✓; ink #191c1e on surface #f7f9fb: 16.4:1 ✓
- All interactive elements (tab buttons, filter pills, star picker inputs, approve/reject buttons) reachable via Tab; all buttons have visible `:focus-visible` ring using `outline: 2px solid var(--color-terracotta); outline-offset: 2px`
- ARIA roles required:
  - `admin-tab-nav`: `role="tablist"` on tab container; `role="tab"` + `aria-selected` + `aria-controls` on each tab button; pending badge uses `aria-label="N avis en attente"`
  - `admin-apercu-tab`: `role="region" aria-label="Aperçu"` on root; stat cards use `<dl>/<dt>/<dd>` structure for screen-reader semantics; availability strip `role="list"` with each day as `role="listitem"`
  - `admin-parametres-tab`: `role="region" aria-label="Paramètres"` on root; each settings card is a `<section>` with `<h2>`; toggles are `<input type="checkbox" role="switch">`
  - `admin-disponibilites-tab`: `role="group"` on range picker pair with `aria-labelledby`; grouped range table `role="table"` with `role="row"`, `role="rowheader"`, `role="cell"`
  - `admin-avis-tab`: `role="region" aria-label="Avis clients"` on root; status filter is `role="tablist"` with `role="tab"` + `aria-selected`; review list is `role="list"`
  - `reviews-strip`: `role="region" aria-label="Avis clients"` on section; `role="list"` for card row
  - `avis-page`: `<h1>` for avg rating display; review list `role="list"`, each card `role="listitem"`
  - `avis-nouveau-page`: star picker uses `<fieldset>/<legend>` with `role="radiogroup"`; each star is `<input type="radio">`; textarea has explicit `<label>`; error state has `role="alert"`
- Mobile touch targets: 44px minimum height for all interactive controls; tab buttons at 375px use reduced padding but maintain height
- No auto-playing animation; `prefers-reduced-motion: reduce` collapses any transitions to 0ms

### Security
- No `innerHTML` assignments — use Svelte's `{text}` binding (auto-escaped) or explicit `textContent`
- Review body text rendered via Svelte text interpolation, never raw HTML — XSS-safe by construction
- Reservation codes are server-generated and only echoed; never eval'd or DOM-parsed
- Form inputs use `maxlength` attributes matching server-side schema limits (body: 2000 chars)
- Admin moderation actions use `fetch` with explicit `method: 'PATCH'` — no URL manipulation of action

## Component Inventory

- component: admin-tab-nav
  description: Tab shell modifications — hide scrollbar at ≥1024px, compress tab padding at 1280px/1024px, add apercu as first tab (default) and avis tab with pending-count badge; activeTab union extended to include 'apercu' | 'avis'
  inputs: activeTab state, pendingReviewCount number
  interactions: tab button click switches activeTab; badge reflects pending review count from adminReviews API
  kind: nav
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: admin-apercu-tab
  description: Dashboard panel with 4 stat cards (guests this week with delta vs last week, current-month occupancy %, returning customer count) and a 7-day availability strip showing free rooms per day as a labeled bar; null occupancy renders "—"; fully responsive single column at 375px
  inputs: adminDashboard() API response — guestsThisWeek, guestsLastWeek, next7Days array, occupancy object, returningCustomers
  interactions: display-only; refresh on tab activation
  kind: panel
  depends_on: [admin-tab-nav]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 3

- component: admin-parametres-tab
  description: NET-NEW settings panel with five grouped cards in order — Tarification & taxes (nightlyPrice, weeklyPrice, tps, tvq, accommodationTax), Coordonnées (contactEmail, contactPhone), Réservations (reservationsEnabled toggle + read-only assignableRoomCount), Courriels automatiques (5 email toggles including emailReviewRequestEnabled), Sécurité (current + new password with its own Changer button); one sticky save button for all settings via adminUpdateSettings; responsive stack at 375px
  inputs: all AdminSettings fields; adminUpdateSettings handler; password change handler
  interactions: field edits update local state; sticky save submits all settings; password card has its own submit; success/error toast messaging preserved from existing implementation
  kind: panel
  depends_on: [admin-tab-nav]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-disponibilites-tab
  description: Fix existing component — range date pickers (start + end, end defaults to start for single-day), calling adminUpsertBlackoutRange; range list groups consecutive days with identical rooms_blocked and note into one row with a single range-delete action (adminDeleteBlackoutRange); fixes a11y_no_noninteractive_tabindex warning and state_referenced_locally warning on assignableRoomCount
  inputs: blackout_dates array from API; assignableRoomCount (via $derived); start/end date picker values
  interactions: submit range form; delete range row (expands to per-day batch delete); date end defaults to start on start change
  kind: panel
  depends_on: [admin-tab-nav]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-avis-tab
  description: Review moderation panel with status filter pills (pending default, approved, rejected), review cards showing displayName, rating, body, staysCount, nightsTotal, createdAt, plus reservation code; Approuver and Rejeter buttons call adminModerateReview and refresh the pending badge count in admin-tab-nav
  inputs: adminReviews(status) API response; adminModerateReview handler; pendingCount binding
  interactions: filter pill click changes status filter and reloads list; Approuver/Rejeter buttons patch review status and decrement/update badge
  kind: panel
  depends_on: [admin-tab-nav]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: reviews-strip
  description: Public homepage section showing up to 3 approved reviews as cards with display name, terracotta star fill rating, italic serif body excerpt, and stay stats caption; section is entirely hidden (display:none) when no approved reviews exist; links to /avis for more
  inputs: publicReviews() API response (≤3 items)
  interactions: display-only; link to /avis page
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: avis-page
  description: Public page listing all approved reviews newest-first with an average-rating header (large IBM Plex Serif Bold numeral + filled stars + review count); each review card shows displayName, rating, italic serif body, staysCount/nightsTotal caption in monospace; empty state when no approved reviews
  inputs: publicReviews() API response (all approved); computed averageRating
  interactions: display-only; footer link from /avis
  kind: page
  depends_on: [reviews-strip]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: avis-nouveau-page
  description: Multi-step public review submission page — (1) eligibility check on load from ?code= query param, generic error state for invalid/ineligible codes; (2) star picker (1–5, implemented as radio inputs in a fieldset, large 48px terracotta fill on select/hover) + textarea (10–2000 chars with live count); (3) thanks screen after successful POST; no login required
  inputs: ?code= URL param; reviewEligibility() and submitReview() API calls
  interactions: star radio selection; textarea input with character count; submit button with loading state; error and thanks screens as separate view states
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: footer-avis-link
  description: Add /avis hyperlink to the existing Footer.svelte nav — a single anchor in the existing footer link row, French label "Avis clients", no visual change to footer layout
  inputs: none (static link)
  interactions: navigation link to /avis
  kind: nav
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none