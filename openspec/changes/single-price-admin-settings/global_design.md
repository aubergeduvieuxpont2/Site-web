## Global Design Strategy

The L'Auberge du Vieux Pont site uses an established **Industrial Zen** aesthetic — warm off-white surfaces, IBM Plex type family, terracotta/rust accents, grain overlays, and monospace data labels. This task is an incremental content and settings-layer addition, not a redesign. All new components must feel native to this existing system. The one genuinely new UI surface (the admin Paramètres tab) follows the exact ARIA-tabs pattern already present in the admin panel. The only visual novelty is the CITQ certification line in the footer, rendered in IBM Plex Mono to feel like a registration stamp.

### Colour Palette
- surface: #fafaf8 (warm off-white, base background)
- surface-raised: #f5f4f2 (card / input background)
- charcoal: #1a1a18 (dark section backgrounds)
- ink: #2d2d2a (body text, primary labels)
- muted: #7a786f (secondary labels, placeholders)
- accent: #c4603a (terracotta — CTAs, active tab underline, focus rings)
- border: #e0ddd8 (hairline borders)
- border-dark: #3a3a36 (borders on dark surfaces)
- success: #4a7c59 (save-confirmed badge)
- error: #b04040 (API error banner)

### Typography
- font-family body: "IBM Plex Sans", sans-serif
- font-family display: "IBM Plex Serif", serif (section headings, hero)
- font-family mono: "IBM Plex Mono", monospace (prices, testids, CITQ badge, input labels)
- base size: 16px; line-height: 1.6
- heading sizes: h1=2.5rem h2=1.75rem h3=1.125rem
- label/mono: 0.75rem uppercase tracking-widest (tech-label class)

### Spacing
- base unit: 4px; xs=4px sm=8px md=16px lg=24px xl=40px 2xl=64px 3xl=96px

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) on surface #fafaf8
- keyboard navigation: all interactive elements (tab buttons, form inputs, save button, email link) reachable via Tab; focus ring accent #c4603a outline-offset 2px
- ARIA roles required:
  - admin-settings-tab: extends existing `role="tablist"` / `role="tab"` / `role="tabpanel"` pattern; `aria-selected` on active tab; `aria-controls` points to `panel-settings`; `aria-labelledby` on panel points to tab id
  - admin-settings-tab inputs: `<label>` elements with `for` wired to input `id`; required `aria-required="true"`; validation errors announced via `aria-describedby`
  - footer-citq: plain `<p>` or `<span>` in copyright strip — no ARIA role needed; `data-testid="footer-citq"` for test hooks
  - room-card: existing `data-testid` attributes preserved; `href="/contact"` is an anchor, no additional role
  - contact-page: `<textarea>` placeholder text does not rely on placeholder alone for instruction (label retained); no ARIA change needed beyond placeholder text update

### Security
- No innerHTML assignments — use textContent or Svelte template bindings
- Admin settings inputs: client-side validation (positive integer, valid email) before POST; server enforces via zValidator + Zod; never trust client validation alone
- Contact email rendered as `<a href="mailto:…">` via settings store value — value sourced from authenticated admin endpoint, not user input, so escaping is for defence-in-depth only
- No secrets or assignableRoomCount ever rendered in public page output

## Component Inventory

- component: db-migration
  description: Idempotent SQL migration 0007_settings.sql — creates settings table and seeds four default rows with ON CONFLICT DO NOTHING
  inputs: none (static SQL file)
  interactions: none
  kind: backend
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: settings-api
  description: Backend settings module (apps/api/src/settings.ts) with SETTINGS_DEFAULTS, PUBLIC_SETTING_KEYS, SettingsUpdateSchema, rowsToAdminSettings, toPublicSettings, settingsHook; plus three new routes on apps/api/src/index.ts — GET /api/settings (public), GET /api/admin/settings (admin-gated), POST /api/admin/settings (admin-gated, zValidator-validated upsert)
  inputs: Postgres rows from settings table; SettingsUpdateSchema-validated JSON body on POST
  interactions: auth gate (getAuthUser → role===admin); zValidator with custom settingsHook; INSERT … ON CONFLICT upsert
  kind: backend
  depends_on: [db-migration]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: content-copy
  description: Pure copy/constant updates to apps/web/src/lib/content.ts — remove dortoir-equipe room, remove priceFrom/pricePerNight from Room type and remaining rooms, update SITE.tagline/email/add citq, reword AMENITIES A-01 and A-08, update STATS (beds stat → rooms stat, reword storage label), reword POLICIES P-05 and PRIVACY C-03, replace all Hydro-Québec mentions, export DEFAULTS object
  inputs: existing content.ts constants
  interactions: none (static module)
  kind: content
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: 1

- component: settings-client
  description: New apps/web/src/lib/settings.svelte.ts reactive store seeded from DEFAULTS; mergeSettings() pure reducer; loadSettings() async loader calling GET /api/settings; plus PublicSettings/AdminSettings interfaces and three typed fetch helpers (getPublicSettings, adminGetSettings, adminUpdateSettings) added to apps/web/src/lib/api.ts
  inputs: DEFAULTS from content.ts; fetch response from /api/settings
  interactions: loadSettings() overlays store on success; on ApiError leaves defaults intact
  kind: lib
  depends_on: [content-copy]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: room-card
  description: Updated RoomCard.svelte — contactHref hardcoded to "/contact" (no ?chambre= query); pricePerNight prop removed; flat price label reads settings.nightlyPrice from the settings store; all existing data-testids preserved including data-testid="room-card-price"
  inputs: Room object (minus pricePerNight); settings.nightlyPrice from store
  interactions: hover effects unchanged; CTA links to /contact with no query string
  kind: card
  depends_on: [settings-client, content-copy]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: footer-citq
  description: Footer.svelte updated to render a "CITQ #304542" certification line using SITE.citq constant, displayed in IBM Plex Mono at 0.7rem in the copyright strip; data-testid="footer-citq" on the containing element; styled as a muted registration-stamp line below the copyright text
  inputs: SITE.citq from content.ts
  interactions: none (static display)
  kind: section
  depends_on: [content-copy]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: layout-loader
  description: +layout.svelte updated to call loadSettings() inside the existing onMount (client-only); failure is silent (defaults remain); no visual change to layout
  inputs: loadSettings() from settings-client
  interactions: fires once on client mount; populates shared settings store
  kind: layout
  depends_on: [settings-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: accueil-page
  description: +page.svelte home page — hero sub-heading replaces "Hydro-Québec" with generic hydro wording; rooms-count stat value bound to settings.marketingRoomCount (default 12) with " chambres" suffix; four stat-items preserved; all data-testids for stat-item/stat-number retained
  inputs: settings.marketingRoomCount from store; STATS from content.ts (updated)
  interactions: count-up animation unchanged; reactive to settings store value
  kind: page
  depends_on: [settings-client, content-copy]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: contact-page
  description: contact/+page.svelte — remove chambreParam state, seeded state, and the $effect that seeds "Chambre souhaitée : …"; update message textarea placeholder to remove "chambre souhaitée" wording; render settings.contactEmail in the info column (visible text + mailto: href)
  inputs: settings.contactEmail from store
  interactions: no chambre prefill; email link opens mailto: with configured address
  kind: page
  depends_on: [settings-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: le-site-page
  description: le-site/+page.svelte — heading "Nos chambres et dortoirs" → "Nos chambres"; intro paragraph reworded to remove dorm/couchette implications and reflect rooms assigned at arrival; "lignes Hydro-Québec de Portneuf" → "lignes du réseau hydroélectrique de Portneuf"; RoomCard list now renders 3 rooms (no dortoir)
  inputs: ROOMS from content.ts (3 rooms after dortoir removal); updated copy
  interactions: unchanged (card grid display)
  kind: page
  depends_on: [content-copy, room-card]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: 1

- component: a-propos-page
  description: a-propos/+page.svelte — value card "Accessible" text reworded from "Du dortoir à 39 $ …" to single flat-price comfort framing; both Hydro-Québec mentions (histoire + ancrage paragraphs, lines ~84 and ~206) replaced with generic hydroelectric wording
  inputs: updated copy (no dynamic store deps — price shown generically, not bound)
  interactions: unchanged reveal animations
  kind: page
  depends_on: [content-copy]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: 1

- component: admin-settings-tab
  description: New "Paramètres" tab added to admin/+page.svelte following the existing ARIA-tabs pattern — tab button (data-testid="tab-settings", role="tab", id="tab-settings") and panel (data-testid="panel-settings", role="tabpanel", id="panel-settings"); on first activation calls adminGetSettings() to populate four inputs (nightly price, contact email, marketing rooms, assignable capacity) each with label + data-testid (input-nightly-price, input-contact-email, input-marketing-rooms, input-assignable-rooms); save button (settings-save-btn) calls adminUpdateSettings; shows loading spinner, inline validation errors, success confirmation, and error banner consistent with existing admin panel styles; uses IBM Plex Mono labels, surface-raised input backgrounds, terracotta accent on save button
  inputs: AdminSettings from adminGetSettings(); form state (4 fields); save/load/error states
  interactions: tab click activates panel; first activation triggers GET; save triggers POST with client-side guard (positive integers, valid email); success reflects persisted values with confirmation; error shows banner
  kind: panel
  depends_on: [settings-client, settings-api]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: web-test-updates
  description: Update existing co-located vitest tests — RoomCard.test.ts (remove dortoir fixture, assert CTA href="/contact", assert "89 $/nuit", drop ?chambre= cases); page-contact.test.ts (remove chambre prefill test, assert placeholder change); page-le-site.test.ts (expect 3 cards, heading "Nos chambres"); page-accueil.test.ts (rooms stat label/suffix, hydro hero copy, four stat-items); page-a-propos.test.ts (dortoir/39/Hydro-Québec copy assertions); Footer.test.ts (assert data-testid="footer-citq" contains "CITQ #304542"); plus new tests — settings.test.ts (mergeSettings overlay+fallback, getPublicSettings request shape); page-admin-settings.test.ts (SSR-render admin, assert tab-settings/panel-settings and four input testids)
  inputs: updated component implementations; vitest + @testing-library/svelte
  interactions: none (pure test assertions)
  kind: test
  depends_on: [room-card, footer-citq, accueil-page, contact-page, le-site-page, a-propos-page, admin-settings-tab, settings-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: api-unit-tests
  description: New apps/api/test/settings.test.ts — unit tests for SettingsUpdateSchema (valid payload accepted; negative/zero price rejected; negative counts rejected; invalid email rejected); PUBLIC_SETTING_KEYS excludes assignable_room_count; rowsToAdminSettings fills missing keys from SETTINGS_DEFAULTS and coerces numerics; toPublicSettings omits assignableRoomCount
  inputs: settings.ts exports; vitest
  interactions: none (pure unit assertions)
  kind: test
  depends_on: [settings-api]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1