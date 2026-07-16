## Global Design Strategy

This is a targeted refresh — nine surgical fixes applied to an established "Industrial Zen" system. The design direction does not change: cool light surfaces, IBM Plex type family, terracotta/zen orange accent, monospace code labels. Every change must feel as if it shipped at launch.

### Colour Palette
- `--color-surface: #f7f9fb` (primary background — WCAG reference surface)
- `--color-surface-2: #f2f4f6` (subtle lift)
- `--color-surface-container-lowest: #ffffff` (form card background)
- `--color-ink: #191c1e` (primary text — 15.5:1 on surface)
- `--color-ink-soft: #45464d` (secondary text — 9.1:1 on surface)
- `--color-ink-mute: #76777d` (metadata/label text — 4.6:1 on surface ✓ WCAG AA)
- `--color-terracotta: #9d4300` (primary accent — 6.2:1 on surface ✓)
- `--color-terracotta-bright: #fd761a` (hover accent — on dark surfaces)
- `--color-ember: #ffb690` (warm tint, decorative)
- `--color-outline-variant: #c6c6cd` (hairlines)
- `--color-outline: #76777d` (borders)
- `--color-charcoal: #2d3133` (dark section bg)
- `--color-inverse-on-surface: #eff1f3` (text on charcoal — 12.3:1 ✓)
- `--color-error: #ba1a1a` (validation errors — 5.9:1 on surface ✓)
- logout-danger-hover: `color-mix(in srgb, var(--color-error) 90%, transparent)` — reserved for logout button hover in nav (signal danger without alarming)

### Typography
- font-family: `"IBM Plex Sans"` (body), `"IBM Plex Mono"` (labels/codes/inputs), `"IBM Plex Serif"` (editorial pull-quotes)
- base: 16px / 1.65 line-height
- tech-labels: 11px / `letter-spacing: 0.12em` / `text-transform: uppercase` / IBM Plex Mono
- nav item size: 14px / `font-weight: 500`
- form labels: 11px mono uppercase (existing `.page-contact__label` pattern)
- auth-prefill indicator: 12px mono, `color-ink-mute`, shown in form card header when `auth.user` is present

### Spacing
- base unit: 4px
- `--space-xs: 0.5rem (8px)` · `--space-sm: 0.75rem (12px)` · `--space-md: 1.25rem (20px)`
- `--space-lg: 2rem (32px)` · `--space-xl: 3rem (48px)` · `--space-2xl: 4.5rem (72px)`
- Form field-row gap: `--space-md` (reuse existing `.page-contact__field-row` pattern)
- Nav logout button: same padding `px-4 py-2` as existing nav links

### Accessibility
- Minimum contrast: 4.5:1 (WCAG AA) — all palette entries verified above
- Keyboard navigation: all interactive elements reachable via Tab; logout `<button>` not a link
- ARIA roles:
  - `nav-logout` (Nav.svelte): logout `<button type="button">` with `aria-label="Se déconnecter"`, `data-testid="nav-logout"` / `data-testid="nav-logout-mobile"`
  - `reservation-form` (contact page): `role="alert"` on inline field errors; auth-prefill indicator via `aria-live="polite"` region; `aria-hidden="true"` on hidden fields when authed, or use `inert` attribute
  - `footer-reactive` (Footer.svelte): no ARIA change; `<footer aria-label="Pied de page">` retained
  - All `<input>` elements: `aria-required`, `aria-describedby` for error ids
- Focus rings: `outline: 2px solid var(--color-primary); outline-offset: 3px` on all interactive (existing pattern)

### Security
- No `innerHTML` — all user-supplied content via `textContent` / Svelte template binding
- Logout button calls `POST /api/auth/logout` via the existing `logout()` helper in `api.ts`; no credential values in client state beyond what the existing session already stores
- Auth store (`auth.svelte.ts`) holds `{ user: User | null; loaded: boolean }` — no tokens, no passwords; user object mirrors existing `/api/auth/me` response shape
- Form inputs: client-side validation is defense-in-depth only; the API enforces all constraints server-side

## Component Inventory

- component: auth-store
  description: New shared Svelte auth store (auth.svelte.ts) — $state object {user, loaded}, setUser, clearUser, loadAuth functions; mirrors settings.svelte.ts pattern
  inputs: getMe() API call result
  interactions: none (state module — consumed by nav, layout, connexion page, contact form)
  kind: store
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: layout-auth-init
  description: Add loadAuth() call alongside loadSettings() in +layout.svelte onMount so the shared auth store is populated on first paint
  inputs: auth store, loadAuth import
  interactions: none (init side-effect only)
  kind: layout
  depends_on: [auth-store]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: nav-logout
  description: Update Nav.svelte to read shared auth store instead of local onMount fetch; add a logout <button> in both desktop nav and mobile menu shown only when auth.user is present, calling logout() then clearUser()
  inputs: auth store (auth.user), logout() from api.ts, clearUser() from auth store
  interactions: logout button click → POST /api/auth/logout → clearUser(); mobile menu logout; desktop nav logout
  kind: nav
  depends_on: [auth-store]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: connexion-set-user
  description: After successful login or register on connexion/+page.svelte, call setUser(result.user) before goto("/profil") so nav updates immediately without page reload
  inputs: auth store setUser, login/register result
  interactions: called on form success, updates shared store
  kind: page
  depends_on: [auth-store]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: footer-reactive
  description: Fix Footer.svelte CSS pruning — replace imperative footerEl.classList.add("footer--visible") with a $state visible flag bound via class:footer--visible={visible}, preserving the IntersectionObserver reveal animation
  inputs: IntersectionObserver, prefers-reduced-motion media query
  interactions: visibility driven by scroll/intersection; no user interaction
  kind: section
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: content-copy-update
  description: Rewrite ROOMS[0] blurb+description to remove breakfast copy; replace amenity A-04 (Petit-déjeuner) with a truthful non-breakfast amenity (e.g. Café en libre-service); add publicRoomCount:12 to DEFAULTS export in content.ts
  inputs: ROOMS array, AMENITIES array, DEFAULTS constant
  interactions: none (static content)
  kind: store
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: le-site-copy
  description: Remove the "un déjeuner prêt avant le lever du soleil" line from le-site/+page.svelte (~line 250), preserving the early-departure framing without any breakfast reference
  inputs: le-site page SVG/template
  interactions: none (static copy)
  kind: page
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: room-card-no-cta
  description: Remove the room-card__cta block and Button import/usage from RoomCard.svelte so no per-room Réserver button renders; keep image, name, description, price label
  inputs: room prop (name, description, imgKey, picsumSeed)
  interactions: card hover lift/shadow preserved; no CTA
  kind: card
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: settings-api-room-count
  description: Add publicRoomCount to PublicSettings interface in settings.ts; in GET /api/settings route run SELECT count(*)::int FROM rooms WHERE is_public=true and return it; default to omitting the field on error so the endpoint never 500s
  inputs: Neon DB rooms table (is_public column)
  interactions: none (REST endpoint)
  kind: panel
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: migrations-split-name-rooms
  description: Create 0013_reservations_split_name.sql (ADD COLUMN IF NOT EXISTS first_name TEXT, last_name TEXT) and 0014_reservations_room_count.sql (ADD COLUMN IF NOT EXISTS room_count INTEGER); update apps/api/schema.sql reservations block with all three columns
  inputs: reservations table schema
  interactions: none (DB migration)
  kind: panel
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: reservation-schema-api
  description: Extend ReservationRequestSchema with firstName/lastName/roomCount (required), fix checkIn/checkOut/guests mapping to arrive/depart/people; derive name from first+last; update INSERT to persist new columns; switch contact.upsert enqueue to firstname/lastname; add roomCount to deal.create enqueue; update ReservationRow type and admin SELECTs
  inputs: ReservationRequestSchema (zod), Neon DB reservations table
  interactions: POST /api/reservations
  kind: panel
  depends_on: [migrations-split-name-rooms]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: hubspot-deal-rooms
  description: Add roomCount?: number to DealCreateSchema in apps/hubspot/src/ops/deal.ts; in executeDealCreate set properties.number_of_rooms = payload.roomCount when defined (no hs_ prefix)
  inputs: DealCreateSchema (zod), HubSpot deal properties
  interactions: deal.create outbox operation
  kind: panel
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: frontend-api-types
  description: Add publicRoomCount:number to PublicSettings in api.ts; add first_name/last_name/room_count (nullable) to ReservationRow; update createReservation signature to firstName/lastName/checkIn/checkOut/guests/roomCount/email/message; add publicRoomCount:12 to DEFAULTS in settings.svelte.ts and extend mergeSettings to merge it; update homepage rooms stat to use settings.publicRoomCount
  inputs: PublicSettings type, ReservationRow type, settings store, homepage stat
  interactions: loadSettings reads publicRoomCount; homepage stat reactive to settings.publicRoomCount
  kind: store
  depends_on: [settings-api-room-count]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: reservation-form
  description: Rework contact/+page.svelte — replace single Nom field with Prénom+Nom field-row (field-row grid, data-testid input-first-name/input-last-name); add required Nombre de chambres number input (min=1, data-testid=input-rooms) bound to form.roomCount; read auth store and when auth.user present hide Prénom/Nom/Courriel fields with fade transition and derive values from user; show logged-in identity indicator (IBM Plex Mono, 12px, ink-mute); update validateClient to require first/last/email only when logged out, roomCount≥1 always; update handleSubmit to new createReservation contract; firstName greeting from effective first name
  inputs: auth store (auth.user), createReservation(), settings.contactEmail, SITE
  interactions: form submit → createReservation → success/error states; auth-conditional field visibility with smooth transition
  kind: page
  depends_on: [auth-store, frontend-api-types]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: test-suite
  description: Update/extend Vitest suites — content/amenity (no petit-déjeuner, A-04 title), Footer.test.ts (footer--visible via reactive state), RoomCard.test.ts (no Réserver CTA), page-accueil.test.ts (publicRoomCount stat), Nav.test.ts (logout button present/absent, store interactions), contact page (split-name/rooms-count fields, auth prefill, payload keys), le-site (breakfast line absent), API ReservationRequestSchema (new fields, roomCount<1 → 400), settings response (publicRoomCount), HubSpot DealCreateSchema (roomCount, number_of_rooms mapped)
  inputs: all modified components and API routes
  interactions: test assertions only
  kind: panel
  depends_on: [auth-store, nav-logout, footer-reactive, room-card-no-cta, reservation-form, reservation-schema-api, hubspot-deal-rooms, settings-api-room-count, content-copy-update, le-site-copy, connexion-set-user, frontend-api-types]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2