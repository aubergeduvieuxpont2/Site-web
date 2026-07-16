## Global Design Strategy

The five changes span two visual contexts: an **admin operator's interface** (rooms CRUD) and a **public editorial surface** (le-site property overview). Both extend the existing "Industrial Zen" vocabulary — IBM Plex family, terracotta accent, cool light surfaces, mono uppercase labels — without inventing new aesthetic territory.

**Admin rooms CRUD**: "Manifeste d'inventaire" — a workshop clipboard. Rooms are listed as equipment entries, not marketing cards. The create form sits above the list in a slightly elevated inset; inline edit expands within the row without a modal. Image keys are chosen from a styled `<select>` that mirrors the existing admin `page-admin__select` pattern. Visibility is a clear badge (`Publique` / `Masquée`) following the existing forest/gray tokens.

**Property overview (le-site #chambres)**: "Relevé de terrain" (land survey) — real-estate editorial with honest industrial photography. Each named area (Repas & cuisine, Salon, Chambre, Salle de bain, Buanderie, Extérieur) anchors a grouped ImagePanel sequence. Layout rhythm varies: single-image areas use a 2-column editorial split (photo 60 % / text 40 %), three-image areas use an equal 3-column grid, the 5-image Extérieur area leads with a full-width panel then a 2×2 thumbnail block. No per-room pricing, no "Réserver" buttons. The flat nightly price is stated once in the section intro, plainly.

**Nav (conditional Connexion)**: minimal surgical edit — no aesthetic change, pure conditional logic.

---

### Colour Palette

All tokens resolved from `apps/web/src/app.css` `@theme` block:

| Role | Token | Resolved value |
|---|---|---|
| Page surface | `--color-surface` | `#f7f9fb` |
| Card / form surface | `--color-surface-container-lowest` | `#ffffff` |
| Elevated card | `--color-surface-container-low` | `#f2f4f6` |
| Deep surface | `--color-surface-container` | `#eceef0` |
| Primary text | `--color-ink` | `#191c1e` |
| Secondary text | `--color-ink-soft` | `#45464d` |
| Muted text | `--color-ink-mute` | `#76777d` |
| Border (quiet) | `--color-outline-variant` | `#c6c6cd` |
| Border (strong) | `--color-outline` | `#76777d` |
| Hairline | `--color-hairline-2` | `#e0e3e5` |
| Accent (terracotta) | `--color-terracotta` | `#9d4300` |
| Accent bright | `--color-terracotta-bright` | `#fd761a` |
| Button fill | `--color-secondary-container` | `#fd761a` |
| Button text | `--color-on-secondary-container` | `#5c2400` |
| Public badge / toggle-on | `--color-forest` / `--color-toggle-on` | `#1a5c2d` |
| Public badge surface | `--color-forest-surface` | `#d4ede0` |
| Error | `--color-error` | `#ba1a1a` |
| Inverse surface (captions) | `--color-inverse-surface` | `#2d3133` |
| Focus ring | global `outline: 2px solid var(--color-terracotta)` | `#9d4300` |

### Typography

| Role | Font | Size | Weight | Treatment |
|---|---|---|---|---|
| Body / headings | IBM Plex Sans (`--font-sans`) | 14–48px | 300–600 | Section headings weight-300, tracking -0.01em |
| Labels / codes | IBM Plex Mono (`--font-mono`) | 10–13px | 400–500 | All-caps, letter-spacing 0.10–0.18em |
| Editorial heading (property overview) | IBM Plex Sans | `clamp(32px,5vw,48px)` | 300 | Same as existing `page-le-site__heading` |
| Area label | IBM Plex Mono | 11px | 400 | Uppercase, 0.14em tracking — via `SectionLabel` component |
| Image caption (ImagePanel) | IBM Plex Mono | 11px | 400 | Uppercase, over dark scrim, inverse-on-surface |
| Admin field label | IBM Plex Mono | 11px | 400 | Uppercase, 0.12em — matches `.page-admin__field-label` |

### Spacing

Follows existing `--space-*` scale from `app.css`:

| Token | Value | Use |
|---|---|---|
| `--space-xs` | 0.5 rem (8 px) | Icon gaps, tight inline gaps |
| `--space-sm` | 0.75 rem (12 px) | Compact row padding |
| `--space-md` | 1.25 rem (20 px) | Form fields, card padding |
| `--space-lg` | 2 rem (32 px) | Column gaps, section gap |
| `--space-xl` | 3 rem (48 px) | Horizontal page padding |
| `--space-2xl` | 4.5 rem (72 px) | Section padding |
| `--space-3xl` | 6 rem (96 px) | Major section block padding |

Property-overview area blocks are separated by `var(--space-3xl)` on desktop, `var(--space-2xl)` at ≤640 px.

### Accessibility

- Minimum contrast: 4.5 : 1 (WCAG AA) — all text meets this against respective surfaces (verified against resolved hex values above).
- Keyboard navigation: every interactive element (buttons, inputs, selects, checkboxes) reachable via Tab; rooms-list-item inline edit toggle uses `<button>`; delete confirm uses `<button>` pair.
- ARIA roles required:
  - `rooms-form`: `role="form"` with `aria-label="Ajouter une chambre"` / `"Modifier la chambre"` depending on mode; each field uses `aria-describedby` pointing to its error span; `aria-invalid` when invalid.
  - `rooms-list-item`: edit expand uses `aria-expanded` on the trigger button; delete confirm uses `role="dialog"` or inline `aria-live="polite"` announce; visibility badge uses `role="status"`.
  - `admin-chambres-tab`: region `role="region"` with `aria-label="Gestion des chambres"`; error/loading states use `aria-live="polite"` and `role="alert"`.
  - `nav-connexion-gate`: no new roles — existing Nav ARIA is preserved; the hidden link is simply not rendered.
  - `property-overview`: `role="region"` with `aria-label="Aperçu de la propriété"` on the section; each area block is `<article>` or a labelled `<div>`; ImagePanel `alt` text is descriptive French.
- `prefers-reduced-motion`: all transitions guarded with existing `@media (prefers-reduced-motion: reduce)` pattern from app.css.

### Security

- No `innerHTML` assignments anywhere; all dynamic values via Svelte reactive bindings (`bind:value`) or text interpolation (`{expr}`).
- Room name and capacity inputs are validated both client-side (before submit) and server-side (zod schema); no raw SQL string interpolation from user input.
- `imageKey` is constrained to a hard-coded `<select>` over `ROOM_IMAGE_KEYS` — freetext image paths are not accepted.
- Delete confirmation requires an explicit second click (inline confirm state), preventing accidental destructive actions.
- No secrets or tokens are handled in any of these components; API calls use `credentials: "include"` for cookie-based session auth only.

---

## Component Inventory

- component: rooms-form
  description: Reusable create/edit room form — name text input, capacity number input, imageKey `<select>` over ROOM_IMAGE_KEYS (14 options), isPublic checkbox, submit button. Used for both "create" (empty initial values) and "inline edit" (pre-filled). Emits a typed `RoomInput` payload via an `onSubmit` callback prop. Shows per-field validation errors in French (nom requis, capacité > 0, clé d'image invalide). Uses `.page-admin__field`, `.page-admin__field-label`, `.page-admin__search-input`, `.page-admin__select` CSS conventions from the admin design system.
  inputs: initialValues (RoomInput | null), onSubmit((data: RoomInput) => Promise<void>), loading (boolean), error (string | null), submitLabel (string)
  interactions: field blur triggers local validation; submit disables button and shows inline spinner; server error surfaces below submit button; success clears the form (create mode) or collapses row (edit mode)
  kind: form
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: rooms-list-item
  description: Single room row in the admin rooms list. Displays name, slug (mono badge), capacity, image_key, and a visibility status badge (`Publique` in forest-green / `Masquée` in gray). Has a "Modifier" button that toggles an inline-expanded `rooms-form` for editing. Has a "Supprimer" button that transitions to an inline confirm state ("Confirmer?" + "Annuler") before calling onDelete. Pending states (saving edit / deleting) disable controls and show a small inline spinner. Layout: row flex with name/meta left, controls right; edit form expands below the row inside the same card.
  inputs: room (Room), onUpdate((slug: string, data: RoomInput) => Promise<void>), onDelete((slug: string) => Promise<void>)
  interactions: "Modifier" click expands/collapses rooms-form pre-filled with room data; "Supprimer" click reveals confirm/cancel pair; confirm triggers deletion with loading state then removal from list; edit submit calls onUpdate, collapses on success
  kind: panel
  depends_on: [rooms-form]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-chambres-tab
  description: Full rooms CRUD tab panel, replacing the previous visibility-only toggle list. Self-contained: loads rooms from `adminRooms()` on mount, orchestrates `adminCreateRoom`, `adminUpdateRoom`, `adminDeleteRoom` calls. Layout — two vertical zones: (1) "Ajouter une chambre" create section (collapsible or always-visible form using rooms-form), (2) rooms list (rooms-list-item entries with loading/error/empty states). Loading: mono-uppercase spinner. Error: left-border error banner (reuse `.page-admin__error-banner`). Empty: centered "Aucune chambre." message. Create success: optimistic append + flash confirmation. Delete: optimistic removal with rollback on error. File path: `apps/web/src/lib/components/admin/AdminChambresTab.svelte`, imported into `apps/web/src/routes/admin/+page.svelte` replacing the inline chambres panel logic.
  inputs: (no props — self-loading)
  interactions: mount → load list; create form submit → POST → optimistic prepend to list; list item edit → PUT → optimistic update; list item delete → DELETE → optimistic remove with rollback; all errors surface inline per-operation
  kind: panel
  depends_on: [rooms-form, rooms-list-item]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: nav-connexion-gate
  description: Minimal in-place edit to `apps/web/src/lib/components/Nav.svelte`. Wrap the desktop "Connexion" `<a>` (lines ~85–92) in `{#if !user}…{/if}` and the mobile "Connexion" `<a>` (lines ~196–202) in `{#if !user}…{/if}`. No new component file; no aesthetic change. The Profil/Admin blocks already sit inside `{#if user}` — leave those untouched. Update `Nav.test.ts` to assert Connexion is absent when user is set (desktop + mobile) and present when null.
  inputs: user reactive state (already present — set by `/api/auth/me` fetch in onMount)
  interactions: Connexion link not rendered when user is authenticated; Profil/Admin links rendered as today
  kind: nav
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none

- component: property-overview
  description: Replacement for the `#chambres` RoomCard grid in `apps/web/src/routes/le-site/+page.svelte`. Preserves `id="chambres"`, `data-testid="section-chambres"`, `<Contour number="01">`, and `<SectionLabel text="Hébergement" />`. Intro paragraph retains "assigned on arrival" copy and states the flat nightly price (loaded from API, falling back to `DEFAULTS.nightlyPrice`). Maps `PROPERTY_AREAS` from `content.ts` — 6 areas, 14 R2 image keys total — through area blocks with varied grid layouts: (a) single-image areas use `.page-le-site__area-editorial` 2-column split (photo 60 % left, area label + blurb 40 % right; alternating side for salon/chambre/buanderie); (b) 3-image areas (Repas & cuisine, Salle de bain) use `.page-le-site__area-grid--3` equal-column grid with 4/3 ImagePanel per cell; (c) 5-image Extérieur area uses a `.page-le-site__area-lead` full-width 16/6 panel then `.page-le-site__area-grid--2` 2×2 grid for remaining 4 images. All ImagePanels receive descriptive French `alt` text and a French mono `caption`. `revealStagger` applied per-area image group. Fully responsive: all grids collapse to 1-column at ≤640 px; editorial splits stack (image above, text below) at ≤768 px. No horizontal overflow at 375 px — images use `width: 100%; overflow: hidden` on their container, no fixed widths.
  inputs: PROPERTY_AREAS (static constant from content.ts), nightlyPrice (loaded from GET /api/settings, fallback DEFAULTS.nightlyPrice), reveal / revealStagger directives, ImagePanel / SectionLabel / Contour / Button components
  interactions: scroll-reveal animations per area image group; no interactive elements within the section itself; `/contact` CTA Button retained at section bottom (variant="action")
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 3