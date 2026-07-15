## Global Design Strategy

**Concept: "Blueprint Breathes"**

The Auberge du Vieux Pont site should feel like a master architect's field book: precise hairlines, technical sectioning, structured grid logic — but each page inhales deeply with generous negative space, slow reveals, and vivid full-color imagery. The tension is intentional and unforgettable. Cold limestone precision meets warm human hospitality. The single thing a visitor will remember: `#fd761a` forge-orange burning against a cool `#f7f9fb` surface — a lit hearth inside a stone vault.

No gradients on white. No purple. No Inter. IBM Plex Sans is the entire typographic system — the rare grotesque that reads simultaneously as technical manual and crafted object. Light (300) weights at large scale deliver the Zen breath; uppercase tracked SemiBold (600) delivers the industrial stamp. IBM Plex Mono appears exclusively for `tech-label` metadata — room numbers, section codes, register marks.

---

### Colour Palette
- `--color-surface: #f7f9fb` — cool limestone, site background
- `--color-surface-container-lowest: #ffffff` — card faces, input fields
- `--color-surface-container-low: #f2f4f6` — subtle tint panels, alternating rows
- `--color-surface-container: #eceef0` — hover surfaces, inactive chips
- `--color-surface-container-high: #e6e8ea` — elevated panels
- `--color-surface-container-highest: #e0e3e5` — deep dividers, skeleton fills
- `--color-ink: #191c1e` — primary text (near-black, cool undertone) — 17.5:1 on surface ✓
- `--color-ink-variant: #45464d` — secondary text, captions, labels — 8.6:1 on surface ✓
- `--color-primary: #000000` — primary button fill, wordmark
- `--color-on-primary: #ffffff` — text on primary fill
- `--color-secondary: #9d4300` — rust/deep terracotta, secondary text accents — 5.8:1 on surface ✓
- `--color-secondary-container: #fd761a` — action button fill, forge orange (fill only, never text on white)
- `--color-on-secondary-container: #ffffff` — text on orange fill
- `--color-outline: #76777d` — borders, hairlines — 4.6:1 on surface ✓
- `--color-outline-variant: #c6c6cd` — subtle dividers, input default border
- `--color-error: #ba1a1a` — error states, validation — 5.9:1 on surface ✓
- `--color-inverse-surface: #2d3133` — dark tooltip/overlay backgrounds
- `--color-inverse-on-surface: #f0f1f3` — text on dark overlays

Orange (`#fd761a`) is used exclusively as **fill**. It never appears as foreground text on a light background (insufficient contrast). All other foreground/background pairs maintain WCAG AA 4.5:1 minimum.

---

### Typography
- `--font-sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif` — primary system
- `--font-mono: "IBM Plex Mono", "Fira Code", ui-monospace, monospace` — tech-labels only
- **Hero / display**: IBM Plex Sans Light 300, 64–96px, line-height 1.05, letter-spacing -0.02em
- **Section h2**: IBM Plex Sans Light 300, 40–48px, line-height 1.1, letter-spacing -0.01em
- **Sub-heading h3**: IBM Plex Sans Regular 400, 24px, line-height 1.3
- **Body**: IBM Plex Sans Regular 400, 16px, line-height 1.65
- **Tech-label**: IBM Plex Mono Regular 400, 11px, uppercase, letter-spacing 0.12em, `--color-ink-variant`
- **Nav links**: IBM Plex Sans SemiBold 600, 13px, uppercase, letter-spacing 0.08em
- **Button**: IBM Plex Sans SemiBold 600, 13px, uppercase, letter-spacing 0.06em
- **Caption / metadata**: IBM Plex Sans Regular 400, 13px, `--color-ink-variant`

Google Fonts import: `IBM+Plex+Sans:wght@300;400;600` + `IBM+Plex+Mono:wght@400`.

---

### Spacing
- Base unit: 4px
- `--space-xs: 4px`
- `--space-sm: 8px`
- `--space-md: 16px`
- `--space-lg: 24px`
- `--space-xl: 40px`
- `--space-2xl: 64px`
- `--space-3xl: 96px`
- `--space-4xl: 128px`
- Section vertical rhythm: `--space-3xl` (desktop) / `--space-2xl` (mobile)
- Content max-width: 1280px outer / 1100px text column
- Grid: 12-column, 24px gutter (desktop); 4-column, 16px margin (mobile)

---

### Accessibility
- Minimum contrast ratio: 4.5:1 (WCAG AA); all pairs verified above
- Keyboard navigation: all interactive elements reachable via Tab; visible focus ring (`outline: 2px solid var(--color-primary); outline-offset: 3px`) — no `outline: none` without a custom replacement
- Touch targets: ≥44×44px on all buttons, nav links, and interactive cards
- ARIA roles required:
  - `nav`: `role="banner"` on `<header>`, `role="navigation"` + `aria-label="Navigation principale"` on `<nav>`. Mobile toggle: `aria-expanded`, `aria-controls`. Active link: `aria-current="page"`.
  - `hero-shader`: `<canvas aria-hidden="true">` (decorative); static gradient fallback `<div>` carries `role="img" aria-label="Vue de l'auberge"`
  - `room-card`: `<article>` with meaningful `<h3>` heading; image `alt` required
  - `page-le-site` in-page nav: `role="navigation" aria-label="Sur cette page"`; `aria-current="true"` on active anchor
  - `page-admin` search: `<label>` associated with search input; results region `aria-live="polite"`
  - `page-admin` outbox: requeue `<button>` has accessible label; status badge has `role="status"`
  - `error-page`: `role="main"`, `<h1>` describing the error
- `prefers-reduced-motion: reduce`: all reveal animations, shader, and hover transforms disable; hero shows static gradient; page transitions become instant
- Every `<img>` has meaningful `alt`; decorative images carry `alt=""`
- Form inputs: every `<input>` has an associated `<label>`; errors associated via `aria-describedby`

---

### Security
- No `innerHTML` assignments — Svelte `{text}` binding auto-escapes; `{@html}` only on verified-safe static constants
- No `eval()` or `new Function()`
- Form submissions use typed `api.ts` helpers — no raw string interpolation in `fetch`
- `credentials: 'include'` in `api.ts`; `session` cookie is HttpOnly — never readable in JS
- `img-route` key sanitized to reject `..` path traversal before passing to `platform.env.IMG.get()`
- Content Security Policy headers recommended at Worker level (out of scope for this change; noted for follow-up)

---

## Component Inventory

- component: wordmark
  description: SVG brand wordmark "Auberge du Vieux Pont" — primary logotype used in the nav header and footer. Size-controlled via prop; monochrome (primary black default, white variant for dark surfaces). No interactive behaviour.
  inputs: size (sm|md|lg), variant (dark|light)
  interactions: none
  kind: brand
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: button
  description: Three-variant button — primary (black fill, white text), secondary (transparent + 1px outline border), action (forge-orange `--color-secondary-container` fill, white text). Renders as `<button>` or `<a>` via `href` prop. IBM Plex Sans SemiBold 600, uppercase, ≥44px touch target. Hover lift (translateY -2px), focus ring, disabled opacity.
  inputs: variant (primary|secondary|action), href, disabled, type, size (sm|md)
  interactions: hover lift (-2px translateY), focus ring (2px primary offset 3px), disabled state
  kind: button
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: section-label
  description: Technical section identifier — IBM Plex Mono, 11px, uppercase, 0.12em tracking, `--color-ink-variant`. Optional leading 1px hairline rule in `--color-outline-variant`. Categorises sections with the blueprint/industrial-stamping aesthetic. Used before every section heading.
  inputs: text, showHairline (boolean)
  interactions: none
  kind: label
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: contour
  description: Decorative structural divider — a thin 1px ruled line with an optional numbered register mark (e.g. "01", "02") rendered in IBM Plex Mono at the left edge. Evokes blueprint registration marks. Rendered as a positioned `<div>` with an `<hr>`-like rule; numbers are decorative (`aria-hidden`).
  inputs: number (optional string), width (full|contained)
  interactions: none
  kind: decoration
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: image-panel
  description: Full-color image panel — no duotone/grain. Loads `/img/<key>` (R2 via the img-route) with a `https://picsum.photos/seed/<picsumSeed>/1200/800` fallback `src`. `object-fit: cover`, aspect-ratio controlled via prop. Optional caption overlay (tech-label style, bottom-left, `--color-inverse-surface` bg at 70% opacity). Subtle 1.02 scale on hover (disabled under `prefers-reduced-motion`). Scroll-reveal on entry.
  inputs: imgKey (string, e.g. "chambre-1.jpg"), picsumSeed (number), alt (string), aspectRatio (string, e.g. "4/3"), caption (optional)
  interactions: hover scale 1.02, scroll reveal (translate + fade)
  kind: media
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: hero-shader
  description: WebGL hero canvas encapsulating the adapted `design/Design_2/shader/code.html` shader. Fills the hero section, lazy-initialised on mount, paused offscreen via `IntersectionObserver`, cancelled on `onDestroy`. Renders a static CSS gradient fallback (`linear-gradient` of Zen surface tones `#e0e3e5` → `#f7f9fb` → `#ffffff`) when `prefers-reduced-motion: reduce` matches OR WebGL context creation fails (do not attempt context in reduced-motion). Used only on the landing hero. Canvas is `aria-hidden="true"`.
  inputs: none (self-contained)
  interactions: auto-pause when scrolled out of viewport, destroy on page leave
  kind: visual
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 3

- component: motion-lib
  description: Svelte action library in `src/lib/motion.ts` — `reveal` (IntersectionObserver, opacity 0→1 + translateY 16px→0, 600ms `cubic-bezier(0.33, 1, 0.68, 1)`), `revealStagger` (delay by `data-index` attribute), `countUp` (number animation on entry). All short-circuit immediately when `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. Not a visual component — shared Svelte action module.
  inputs: Svelte action params (delay, duration, threshold)
  interactions: none (library)
  kind: lib
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: api-client
  description: Typed browser+SSR fetch helpers in `src/lib/api.ts` — `getMe()`, `login()`, `register()`, `logout()`, `getProfile()`, `adminReservations(q?, limit?)`, `adminOutbox(status?)`, `requeueOutbox(id)`, `createReservation(data)`. All same-origin `/api/*` with `credentials: 'include'`. Non-2xx responses surface `{ error: string }`. Not a visual component — shared typed module. Build risk is HIGH: credential handling, auth cookie flows, and data sent to auth endpoints must be implemented correctly.
  inputs: function-specific typed arguments per helper
  interactions: none (library)
  kind: lib
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: img-route
  description: SvelteKit server route `src/routes/img/[...key]/+server.ts`. GET handler — reads `key` from params, sanitizes it (reject `..` traversal), calls `platform.env.IMG.get(key)`. On R2 hit: streams the object body with `Cache-Control: public, max-age=31536000, immutable` and the stored content-type. On miss: 302-redirect to `https://picsum.photos/seed/<sanitized-key>/1200/800`. `export const prerender = false`. Build risk is MEDIUM: URL parameter → R2 access, path traversal sanitization required.
  inputs: URL params key, platform.env.IMG (R2Bucket)
  interactions: none (server route)
  kind: server-route
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: nav
  description: Persistent fixed header — wordmark left; desktop nav links right (Accueil `/`, Le site `/le-site`, À propos `/a-propos`, Contact `/contact`, Connexion `/connexion`; Profil `/profil` shown only when `user` prop is non-null). Hamburger toggle for mobile menu (full-screen overlay, ≥44px targets, closes on link click or Escape). Active route via `$app/stores page.url.pathname`. Background: `--color-surface` at 96% opacity + `backdrop-filter: blur(8px)`. Hover: hairline underline draws left→right. `aria-expanded` on mobile toggle.
  inputs: user (User|null), currentPath (derived from page store internally)
  interactions: mobile menu open/close, active link highlight, hover underline animation
  kind: nav
  depends_on: [wordmark]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: footer
  description: Site footer — two-column layout desktop (left: wordmark + address + phone; right: footer-only nav `/politiques`, `/confidentialite`), single-column mobile. 1px `--color-outline-variant` hairline top border. IBM Plex Sans Regular 13px, `--color-ink-variant` for secondary text. French copy throughout (from `SITE` constants in `content.ts`). Subtle fade-in on first scroll to bottom.
  inputs: none (reads from SITE constants)
  interactions: link clicks only
  kind: footer
  depends_on: [wordmark, section-label]
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: room-card
  description: Accommodation listing card — `<article>` with ImagePanel (4:3 crop), room name in `<h3>` (IBM Plex Sans Regular 400, 20px), brief description in body text, price/nuit in tech-label style, and a secondary Button linking to `/contact?chambre=<slug>`. Hover: card lifts 4px (translateY -4px), hairline border transitions from `--color-outline-variant` to `--color-outline`. Used in a CSS grid (3-up desktop, 2-up tablet, 1-up mobile).
  inputs: room { name, description, pricePerNight, imgKey, picsumSeed, slug }
  interactions: hover lift, image scale, button → contact page
  kind: card
  depends_on: [image-panel, button, section-label]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: layout-shell
  description: SvelteKit root `+layout.svelte` — renders Nav + `<main id="main">{@render children()}</main>` + Footer. Contains a skip-to-main-content anchor. Fetches `getMe()` (from api-client) in `+layout.ts` load function to pass the authenticated `user` prop to Nav. Page-enter animation (translateY 8px → 0, opacity 0→1, 400ms) gated on `prefers-reduced-motion`.
  inputs: children (Svelte snippet), data.user from layout load function
  interactions: page-enter animation, skip-nav link
  kind: layout
  depends_on: [nav, footer]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none

- component: page-accueil
  description: Home page (SSG, `prerender = true`). Full-viewport hero with HeroShader canvas behind a large Light-300 display heading ("L'art de recevoir") and two CTAs (Button action "Réserver" → /contact, Button secondary "Le site" → /le-site). Stats strip below hero (3–4 numbers with countUp animation, tech-label descriptions). Featured rooms grid (RoomCard × 3). Amenities section (ImagePanel left + body text right, reversed on mobile). Closing full-bleed CTA panel. Contour dividers between major sections. All reveal animations gated on reduced-motion.
  inputs: ROOMS, AMENITIES, STATS from content.ts
  interactions: hero CTAs, room cards, shader canvas, scroll reveal animations, countUp
  kind: page
  depends_on: [layout-shell, hero-shader, room-card, image-panel, section-label, contour, button]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 3

- component: page-a-propos
  description: À propos page (SSG, `prerender = true`). Two-column editorial layout — large text column left, ImagePanel right — alternating on mobile. SectionLabel "À propos" + history of the auberge, philosophy, team section. Staggered reveal animations. Uses SITE constants. Pure SSG, no API calls.
  inputs: SITE content constants from content.ts
  interactions: scroll reveals
  kind: page
  depends_on: [layout-shell, image-panel, section-label, contour]
  designer_model: claude-sonnet-4-6
  builder_model: claude-haiku-4-5-20251001
  ralph: 2

- component: page-le-site
  description: Le site page (SSG, `prerender = true`) — merged rooms, attractions, and grounds. Sticky in-page anchor nav below the main header (anchors: `#chambres`, `#attraits`, `#lieu`) with active section highlight via IntersectionObserver. Rooms section: SectionLabel + RoomCard grid; must contain `id="chambres"`. Attraits section: card/list layout from ATTRACTIONS constants; must contain `id="attraits"`. Grounds: full-bleed ImagePanel strip. Contour markers between sections.
  inputs: ROOMS, ATTRACTIONS, AMENITIES from content.ts
  interactions: sticky in-page nav active highlight (IntersectionObserver), scroll reveals, room card interactions
  kind: page
  depends_on: [layout-shell, room-card, image-panel, section-label, contour, button]
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 3

- component: redirect-chambres
  description: Prerendered 301 redirect — `src/routes/chambres/+page.ts` exports `prerender = true` and a `load` function that `throw redirect(301, '/le-site#chambres')`. No `+page.svelte` visual output needed. Trivial routing logic only.
  inputs: none
  interactions: none (server redirect)
  kind: server-route
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: redirect-attraits
  description: Prerendered 301 redirect — `src/routes/attraits/+page.ts` exports `prerender = true` and a `load` function that `throw redirect(301, '/le-site#attraits')`. No `+page.svelte` visual output needed. Trivial routing logic only.
  inputs: none
  interactions: none (server redirect)
  kind: server-route
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: page-contact
  description: Contact page (SSR, no prerender). Reservation inquiry form — French labels: Nom, Courriel, Date d'arrivée, Date de départ, Nombre de personnes, Message. POSTs to `POST /api/reservations` via `api-client` `createReservation`. Inline field-level errors (from 400 `{ error }`) and a success confirmation state rendered without page reload. Input focus state: 2px `--color-primary` border. Build risk MEDIUM: form data → API call, validation display, user-supplied input.
  inputs: form fields (name, email, checkIn, checkOut, guests, message)
  interactions: field focus/blur states, form submit with spinner, success/error UI states
  kind: page
  depends_on: [layout-shell, button, section-label]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: page-connexion
  description: Connexion page (SSR). Two adjacent panels desktop / stacked mobile: "Se connecter" (Courriel + Mot de passe) and "Créer un compte" (Nom + Courriel + Mot de passe ≥8 chars, open registration). Each panel has its own submit and inline error display. Login 401 → "Identifiants invalides" (identical for unknown email and wrong password — no user enumeration). Register 409 → "Un compte existe déjà". On success redirect to `/profil`. Build risk HIGH: auth credential submission, error messages must not leak user existence.
  inputs: login form (email, password), register form (name, email, password)
  interactions: form field validation, submit → redirect or error, panel visual toggle (desktop tab feel)
  kind: page
  depends_on: [layout-shell, button, section-label]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: page-profil
  description: Profil page (CSR, `ssr = false`). On mount: `getMe()` — if 401 redirect to `/connexion`. Then `GET /api/profile` for `{ user, reservations, hubspot }`. Three sections: user info card (name, email, role badge), reservations table (check-in date, guests, status; row expand for details), HubSpot enrichment panel (contact properties + deals list; "Données non disponibles" on null/empty). Logout button → `logout()` then redirect to `/`. Loading and error skeleton states. Build risk HIGH: auth gate on client, session validation, profile data including third-party enrichment.
  inputs: API-fetched profile data
  interactions: logout, reservation row expand/collapse, loading/error states
  kind: page
  depends_on: [layout-shell, button, section-label, contour]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: page-admin
  description: Admin page (CSR, `ssr = false`). On mount: `getMe()` — if `role !== 'admin'` display a denied state (not redirect, to avoid timing attacks). Two tabs — "Réservations" (table with debounced `?q=` search by name/email) and "File HubSpot" (outbox table, status dropdown filter all/pending/failed/done, `last_error` in expandable tooltip, Requeue button on `failed` rows with optimistic status update → `POST /api/admin/outbox/:id/requeue`). Admin operations mutate data; build risk HIGH: admin-role gating, mutation endpoint calls, optimistic update correctness.
  inputs: reservations from /api/admin/reservations, outbox rows from /api/admin/outbox
  interactions: tab switch, search input (300ms debounce), status filter select, requeue button (optimistic update), row expand
  kind: page
  depends_on: [layout-shell, button, section-label, contour]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: page-politiques
  description: Politiques page (SSG, `prerender = true`). Clean editorial layout — SectionLabel "Politiques de l'établissement", section headings and body text from `POLICIES` content constants. No interactive elements. Footer-linked only (not in main nav).
  inputs: POLICIES from content.ts
  interactions: none
  kind: page
  depends_on: [layout-shell, section-label, contour]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: page-confidentialite
  description: Confidentialité page (SSG, `prerender = true`). Same editorial layout as page-politiques but using `PRIVACY` content constants. Footer-linked only.
  inputs: PRIVACY from content.ts
  interactions: none
  kind: page
  depends_on: [layout-shell, section-label, contour]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none

- component: error-page
  description: Styled `+error.svelte` for 404 and other errors. Full-height centered layout — large Light-300 error code (e.g. "404"), French friendly message ("Cette page est introuvable."), secondary Button "← Accueil" → `/`. Consistent Industrial Zen aesthetic: no heavy illustration, just type and hairline geometry. `role="main"`, `<h1>` describing the error state.
  inputs: $page.status, $page.error.message
  interactions: button → / link
  kind: page
  depends_on: [layout-shell, button, section-label]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-haiku-4-5-20251001
  ralph: none