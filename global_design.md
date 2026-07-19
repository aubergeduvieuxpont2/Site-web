## Global Design Strategy

The Auberge du Vieux Pont site runs **Industrial Zen** — IBM Plex Sans/Mono typography, cool light surfaces, terracotta accent, hairline borders, and mono route-codes as decorative navigation markers. Stream 4 introduces no new aesthetic direction: it wires an i18n layer beneath the existing design and adds one new visual element — the **FR · EN locale toggle** — that must read as native to the nav header.

The toggle is the only genuinely designed artefact in this stream. Everything else is infrastructure plumbing or string-substitution. The toggle design decision: two `font-mono` text buttons (`FR` and `EN`) separated by a hairline slash (`/`), rendered at the same scale as the nav's existing mono codes (`text-[0.65rem] tracking-widest`). Active locale renders in `text-terracotta` (#9d4300) with a 1 px bottom border; inactive renders in `text-ink-soft` (#45464d, 7.7:1 on surface). No pill, no flag, no dropdown — purely typographic. At 360 px the two two-character labels plus slash never overflow.

### Colour Palette
All tokens already exist in `app.css` `@theme`. No new tokens needed; the toggle consumes existing ones:
- surface: #f7f9fb (`--color-surface`)
- ink: #191c1e (`--color-ink`)
- ink-soft: #45464d (`--color-ink-soft`) — inactive toggle label; 7.7:1 on surface ✓ WCAG AA
- ink-mute: #76777d (`--color-ink-mute`) — separator; decorative only
- terracotta: #9d4300 (`--color-terracotta`) — active toggle label; 5.5:1 on surface ✓ WCAG AA
- outline-variant: #c6c6cd (`--color-outline-variant`) — hairline separator `/`
- hairline-2: #e0e3e5 (`--color-hairline-2`) — card and section borders
- error: #ba1a1a (`--color-error`) — existing

### Typography
Inherits existing system verbatim:
- body: `IBM Plex Sans` (variable 400–700), `font-sans`
- mono/label: `IBM Plex Mono`, `font-mono` — used for nav codes and the FR/EN toggle
- toggle sizing: `text-[0.65rem] tracking-[0.15em] uppercase font-mono` (matches existing nav mono codes)
- base: 16px body, line-height 1.5; no changes

### Spacing
Inherits existing scale (`--space-xs` through `--space-xl`). Toggle padding: `px-1.5 py-0.5` matching nav code elements.

### Accessibility
- minimum contrast: 4.5:1 (WCAG AA); toggle active 5.5:1, toggle inactive 7.7:1
- keyboard navigation: all toggle buttons reachable via Tab; activated by Enter/Space
- ARIA roles required:
  - locale-toggle: `role="group"` with `aria-label="Langue / Language"` wrapping two `<button>` elements; active button has `aria-pressed="true"`, inactive has `aria-pressed="false"`
  - nav-header-i18n: existing `role="banner"` on `<header>` unchanged; toggle placed inside the landmark before the auth controls
  - root-layout-init: `lang` attribute on `<html>` element set and updated by the locale store setter (`document.documentElement.lang = locale`)
  - footer-shared-i18n: existing `role="contentinfo"` retained; translated aria-labels via `t()` calls
  - guest-routes-*: existing `<main>` landmark retained; no structural ARIA changes, only string substitution

### Security
- Translated strings are Svelte text nodes — never `{@html …}`; no innerHTML
- `t()` interpolation slots are caller-defined; user input is never passed as a message key
- Cookie write is always the literal string `'fr'` or `'en'` — no injection vector
- `localStorage.setItem('locale', …)` receives only the validated enum value, never raw input

## Component Inventory

- component: db-migration-locale
  description: Single idempotent SQL file (0042_users_locale.sql) adding locale column (text NOT NULL DEFAULT 'fr') to users via ADD COLUMN IF NOT EXISTS
  inputs: none (static SQL)
  interactions: none
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: email-locale-helper
  description: Async function in apps/api/src/emailLocale.ts that resolves a recipient's stored locale by numeric user id or lower-cased email string; returns 'fr' on any missing row, unexpected value, or query error — pure read, no side effects
  inputs: neon sql client; user id (number) or email (string)
  interactions: single SQL SELECT on users table
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: i18n-store
  description: Reactive locale rune store (apps/web/src/lib/i18n.svelte.ts) exposing the active locale, a t() translate helper with dot-key lookup and percent-delimited token interpolation, cookie+localStorage persistence, html lang setter, auth-user initializer, and SSR/jsdom guards that make every document/storage access a no-op when globals are absent
  inputs: cookie or localStorage persisted value on init; authenticated user locale; dot-key string plus optional interpolation map
  interactions: get and set locale rune; write cookie and localStorage; set document.documentElement.lang
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: message-dictionaries
  description: French (apps/web/src/lib/messages/fr.ts) and English (apps/web/src/lib/messages/en.ts) message dictionaries with identical dot-key sets covering every guest-facing display string from content.ts and all in-scope guest routes and shared components; English authored accurately; percent-delimited interpolation placeholders used where a value must be embedded
  inputs: full survey of content.ts display strings and inline strings across all guest routes and shared components
  interactions: none (static plain-object exports)
  kind: module
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: content-refactor
  description: Refactor apps/web/src/lib/content.ts to remove guest-facing display strings that have moved into the message dictionaries; retain only structural fields — ids, codes, hrefs, image keys, seeds, coordinates, numeric defaults, SITE.email, SITE.citq, NAV structure — and expose stable arrays that page components combine with translated copy keyed by id or code
  inputs: existing content.ts; message-dictionaries key inventory
  interactions: none (static module)
  kind: module
  depends_on: [message-dictionaries]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: api-locale-endpoint
  description: All locale-related changes to apps/api/src/index.ts — register validation schema gains locale (enum 'fr'|'en', default 'fr'), INSERT persists it; login and session SELECT and return locale; new auth-gated POST /api/profile/locale validates, writes, and returns ok+locale (400 on bad value, 401 unauthenticated); plus email locale threading at all six enqueue call sites using the emailLocale helper
  inputs: email-locale-helper; existing Hono routes and zod/valibot schemas; neon sql client
  interactions: POST /api/auth/register, POST /api/auth/login, GET /api/session, POST /api/profile/locale, six email enqueue call sites
  kind: module
  depends_on: [email-locale-helper]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: api-client-locale
  description: Extend apps/web/src/lib/api.ts — add optional locale to the User interface; extend the register helper to send locale in the request body; add a postLocale() helper calling POST /api/profile/locale; on auth load success initialize the locale store from the returned user.locale field
  inputs: i18n-store setLocaleFromUser helper; existing User interface and register/session functions in api.ts
  interactions: POST /api/auth/register (extended body), POST /api/profile/locale (new), GET /api/session (reads locale field)
  kind: module
  depends_on: [i18n-store]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: locale-toggle
  description: Standalone FR / EN toggle component — two font-mono uppercase text buttons (text-[0.65rem] tracking-[0.15em]) separated by a hairline slash in outline-variant; active locale in text-terracotta with 1px bottom border, inactive in text-ink-soft; 150ms color transition; fires i18n-store locale setter, persists to cookie/localStorage, and calls postLocale() when a user is logged in; anonymous flips stay client-side only; fits at 360px viewport with no overflow; role=group with aria-label="Langue / Language"; each button has aria-pressed
  inputs: current locale from i18n-store; auth state (user logged in or anonymous); postLocale() from api-client-locale
  interactions: click or keyboard-activate FR or EN to set locale and persist
  kind: button
  depends_on: [i18n-store, api-client-locale]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: root-layout-init
  description: Wire locale initialization into apps/web/src/app.html and apps/web/src/routes/+layout.svelte — call initLocale() before first paint so the active locale is known before rendering; after auth resolves call setLocaleFromUser() when a user is present; keep existing settings load and per-navigation refresh behavior intact; translate the skip-link text via t()
  inputs: i18n-store initLocale() and setLocaleFromUser(); auth load result in layout.svelte
  interactions: reads cookie/localStorage on mount; sets html lang attribute; calls setLocaleFromUser on auth resolve
  kind: layout
  depends_on: [i18n-store, api-client-locale]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: nav-header-i18n
  description: Convert apps/web/src/lib/components/Nav.svelte hardcoded French strings to t() calls and place the locale-toggle component in the top-right of both the desktop nav bar and the mobile menu; must remain responsive at 360px with no horizontal overflow; existing mobile menu toggle behavior and data-testid attributes unchanged
  inputs: t() helper; locale-toggle component; existing Nav.svelte structure including desktop flex row and mobile overlay
  interactions: existing mobile menu open/close; locale-toggle click inside nav
  kind: nav
  depends_on: [locale-toggle, message-dictionaries, root-layout-init]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: footer-shared-i18n
  description: Convert apps/web/src/lib/components/Footer.svelte, ReviewsStrip.svelte, ProfilReservationTable.svelte, and MaintenanceBanner.svelte — replace every hardcoded French display string and aria-label with t() calls; leave data-testid attributes, structural classnames, and hrefs unchanged
  inputs: t() helper; message-dictionaries; existing component files
  interactions: no interaction changes — string substitution only
  kind: section
  depends_on: [message-dictionaries, root-layout-init]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: guest-routes-home-info
  description: Convert the home (/), le-site, and a-propos routes — replace every guest-visible hardcoded French string with t() calls; combine translated copy with structural arrays from content.ts using item ids or codes as keys
  inputs: t() helper; content.ts structural arrays; message-dictionaries
  interactions: no interaction changes — string substitution only
  kind: page
  depends_on: [message-dictionaries, content-refactor, root-layout-init]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: guest-routes-contact-reservation
  description: Convert contact and its reservation flow routes — translate form labels, placeholders, button text, validation messages, and confirmation copy via t(); leave data-testid, field name attributes, and form action hrefs unchanged
  inputs: t() helper; content.ts structural data; message-dictionaries
  interactions: no interaction changes — string substitution only
  kind: page
  depends_on: [message-dictionaries, content-refactor, root-layout-init]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: guest-routes-auth
  description: Convert connexion and registration form routes — translate all visible strings via t(); thread the selected locale from the i18n store into the register API call via api-client-locale's extended register function; leave structural fields, data-testid, and field names unchanged
  inputs: t() helper; api-client-locale register function; message-dictionaries
  interactions: register form submit now sends locale in request body
  kind: page
  depends_on: [message-dictionaries, content-refactor, root-layout-init, api-client-locale]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: guest-routes-profile
  description: Convert profil, guest portal, reinitialisation, and verification routes — translate all guest-visible strings and aria labels via t(); leave data-testid attributes and structural markup unchanged
  inputs: t() helper; content.ts structural data; message-dictionaries
  interactions: no interaction changes — string substitution only
  kind: page
  depends_on: [message-dictionaries, content-refactor, root-layout-init]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: guest-routes-legal
  description: Convert avis, avis/nouveau, confidentialite, and politiques routes — translate all guest-visible strings via t(); leave structural markup, data-testid, and hrefs unchanged
  inputs: t() helper; content.ts structural data; message-dictionaries
  interactions: no interaction changes — string substitution only
  kind: page
  depends_on: [message-dictionaries, content-refactor, root-layout-init]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1

- component: i18n-tests
  description: Vitest tests covering five scenarios — (1) key-parity: flatten fr and en to sorted dot-key arrays and assert identical; (2) interpolation: percent-delimited token renders supplied value with no leftover tokens; (3) locale-persistence: setting English writes 'en' to cookie and localStorage and sets html lang to 'en'; (4) register-with-locale: POST /api/auth/register with locale 'en' persists 'en' on the users row; (5) email-locale: a user with stored locale 'en' causes the enqueue call to receive locale 'en'
  inputs: message-dictionaries; i18n-store; api-locale-endpoint; email-locale-helper; api-client-locale
  interactions: test-only; Vitest + jsdom for frontend, Vitest for backend
  kind: module
  depends_on: [message-dictionaries, i18n-store, api-locale-endpoint, email-locale-helper, api-client-locale]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: 1