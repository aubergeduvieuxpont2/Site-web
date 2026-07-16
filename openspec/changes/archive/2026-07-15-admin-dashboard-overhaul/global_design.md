## Global Design Strategy

**Aesthetic direction: "Operator's Logbook"** — L'Auberge du Vieux Pont already speaks IBM Plex + charcoal + terracotta (Industrial Zen). The new admin surfaces lean into a second register of that language: the site-foreman's ledger, the dam-control room roster. Cool gray fieldstone surfaces, monospaced column headers stamped like asset tags, role badges die-cut like identity cards, and a single new semantic accent — **deep forest green** (#1a5c2d) — borrowed from the boreal work-site rather than the dinner table. Password forms are the opposite extreme: spare, ceremonial, signed-document calm. The one memorable moment: generating a password-reset link triggers a brief amber "wax-seal" reveal animation, making the admin feel they're handing over something official.

### Colour Palette

Extends the existing tokens — do NOT redefine them; add only the new ones listed below as CSS custom properties alongside the existing palette.

**Existing (reference, do not redeclare):**
- surface: `#f7f9fb` (`--color-surface`)
- ink: `#191c1e` (`--color-ink`)
- terracotta: `#9d4300` / bright `#fd761a` (`--color-terracotta` / `--color-terracotta-bright`)
- ember: `#ffb690` / pale `#ffdbca` (`--color-ember` / `--color-ember-pale`)
- charcoal: `#2d3133` (`--color-charcoal`)
- error: `#ba1a1a` (`--color-error`)
- hairline: `#c6c6cd` (`--color-hairline`)

**New tokens (admin + auth surfaces only):**
- `--color-forest: #1a5c2d` — success state, "public" room indicator, password-change success (WCAG AA on white: 7.1:1 ✓)
- `--color-forest-surface: #d4ede0` — success message background
- `--color-badge-admin-bg: #ffdbca` — admin role badge background (ember-pale)
- `--color-badge-admin-fg: #5c2400` — admin role badge text (on-secondary-container)
- `--color-badge-guest-bg: #e6e8ea` — guest role badge background (surface-4)
- `--color-badge-guest-fg: #45464d` — guest role badge text (ink-soft)
- `--color-toggle-on: #1a5c2d` — room visibility toggle ON state
- `--color-toggle-off: #c6c6cd` — room visibility toggle OFF state (outline-variant)
- `--color-url-surface: #eceef0` — copyable reset-link URL chip background (surface-3)

All new colours verified WCAG AA (4.5:1) against their respective surfaces.

### Typography

Inherits the existing IBM Plex family stack — do NOT load additional fonts.

- `--font-sans`: `"IBM Plex Sans"` — body, form labels, table cells, paragraph copy
- `--font-mono`: `"IBM Plex Mono"` — table column headers (11px/0.14em tracking, uppercase), role badges (11px/0.1em), copyable URLs (12px), `tech-label` utility class (already defined)
- `--font-serif`: `"IBM Plex Serif"` — success confirmation headings on `/reinitialisation` (the one place a warmer voice fits a human moment)

**Admin-specific type scale (within existing tokens):**
- table-header: 11px / `--font-mono` / uppercase / 0.14em letter-spacing / `--color-ink-mute`
- table-cell: 14px / `--font-sans` / `--color-ink`
- badge: 11px / `--font-mono` / 0.1em letter-spacing / uppercase
- url-chip: 12px / `--font-mono` / `--color-ink-soft`

### Spacing

Inherits the existing 8-point scale (`--space-xs` through `--space-4xl`) exactly. New patterns:
- table row vertical padding: `--space-sm` (0.75rem) top + bottom
- table cell horizontal padding: `--space-md` (1.25rem)
- badge padding: 3px 8px (intentionally tight — a die-cut feel)
- toggle gap from label: `--space-sm`
- password form max-width: 480px (centered)

### Accessibility

- Minimum contrast ratio: 4.5:1 (WCAG AA) — all new colour pairs verified above
- Touch targets: 44px minimum (existing `--btn-height`), toggle thumbs ≥ 44×44px
- Keyboard navigation:
  - `admin-utilisateurs-tab`: table rows are not interactive; action buttons (role toggle, generate link) are `<button>` elements with visible focus rings (2px solid `--color-terracotta` at 3px offset, matching existing Button component)
  - `admin-chambres-tab`: each visibility toggle is a `<button role="switch" aria-checked>` with descriptive `aria-label="Rendre [nom] publique"`
  - `connexion-form` accordion: "Mot de passe oublié ?" is a `<button>` that `aria-controls` the inline forgot-password panel; panel has `aria-hidden` when collapsed
  - Tab panels in admin: existing `role="tab"` / `role="tabpanel"` / `aria-selected` pattern extended for "Chambres" and "Utilisateurs"
  - `/reinitialisation`: `<main>` with `role="main"`, form inputs paired with visible `<label>`, error live region `role="alert"`
- Screen reader: role badges carry full text ("Administrateur" / "Invité"), not just visual chips; copyable URL chip includes a visually-hidden instruction ("Lien de réinitialisation — cliquer pour copier")
- No `innerHTML` assignments; all user-supplied content (search results, URLs, names) bound via Svelte `{expression}` (escaped by default)

### Security

- No `innerHTML` — all dynamic content via Svelte template bindings
- Reset link URL displayed in a read-only `<input readonly>` (not a rendered anchor) so the raw token is never navigable by click in the admin console
- `currentPassword` field uses `type="password"` with autocomplete `"current-password"`
- `newPassword` uses `autocomplete="new-password"`
- No client-side token validation — all auth decisions are server-enforced; UI only reflects API responses
- Search input debounced 300ms; no client-side SQL or filter logic

## Component Inventory

- component: nav-update
  description: Update Nav.svelte so logged-in admins see an "Admin" link to /admin instead of the "Profil" link, in both desktop and mobile menus; guests and unauthenticated users are unchanged.
  inputs: current user object (role field), active route
  interactions: link click navigation; no new toggle/dropdown states — same hamburger behavior
  kind: nav
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none

- component: connexion-form
  description: Extended /connexion page — register panel gains first name, last name (required implied by UX but optional schema), phone (optional), company/employer (optional) fields with French labels and testids; below the login form, a "Mot de passe oublié ?" button toggles an inline email-only panel with a smooth drawer-slide reveal; after forgot-password submit the button-area is replaced by a generic French confirmation message; all existing login/register states preserved.
  inputs: form field values, API error/success states, register() and forgotPassword() API clients
  interactions: field input, form submit (register / login / forgot-password), forgot-password accordion toggle, success/error state display
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: reinitialisation-page
  description: New /reinitialisation route (ssr=false, prerender=false). Reads token from URL search params. Three visual states — loading (spinner), invalid/expired ("Lien invalide ou expiré" in error styling + link back to /connexion), and valid (two-field form: new password + confirm, min 8). On success shows a confirmation in IBM Plex Serif with a link to /connexion. Industrial-Zen styling, SectionLabel/Button/Contour, centered single-column, max-width 480px, fully responsive.
  inputs: token (URL param), resetPassword() API client
  interactions: form submit, success/error state transitions
  kind: page
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: profil-change-password
  description: Update /profil page — remove the entire HubSpot display section and its state; add onMount admin redirect (goto("/admin") if role === "admin"); add a "Changer le mot de passe" section below reservations with current-password + new-password (min 8) fields, French error messages, and success confirmation; uses changePassword() client. Existing user info and reservations display unchanged.
  inputs: profile API response (no hubspot field), changePassword() client, user role
  interactions: change-password form submit, success/error state display, admin redirect on mount
  kind: page
  depends_on: [nav-update]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-parametres-tab
  description: Update the existing Paramètres tab within the admin page — remove the marketingRoomCount and assignableRoomCount fields, their state variables, and their form rows; keep nightlyPrice and contactEmail; add a "Changer le mot de passe" sub-section (current + new password, French error/success) that calls changePassword() via the same POST /api/auth/password used by the profil page. Tab label and aria attributes unchanged.
  inputs: adminSettings (two keys only), changePassword() client, save/error states
  interactions: settings save, password change submit with success/error display
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-chambres-tab
  description: New "Chambres" tab panel in the admin page. Fetches adminRooms() on tab activation. Renders each of the 3 ROOMS entries (name, code, capacity) as a horizontal card with a mechanical toggle switch (role="switch" aria-checked) controlling is_public. On toggle, calls adminSetRoomVisibility() optimistically and rolls back on error with a terracotta error message. "Publique" / "Masquée" label beside the toggle uses the forest/toggle-off colour tokens. Loading and error states.
  inputs: ROOMS content array, adminRooms() and adminSetRoomVisibility() clients, per-room visibility state
  interactions: toggle switch per room (optimistic update + rollback), tab activation triggers fetch
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: admin-utilisateurs-tab
  description: New "Utilisateurs" tab panel in the admin page. Debounced (300ms) email search input calls adminUsers() and renders results in a data table (columns — email, nom, rôle, inscrit le, actions). Role is shown as a badge chip (admin=ember/terracotta, guest=gray). For each row that is NOT the current user, a compact role toggle button ("Promouvoir" / "Rétrograder") calls adminSetUserRole(); for the current user the action column is blank. A "Générer un lien" button calls adminUserResetLink() and reveals the one-time URL in a read-only monospaced chip with a copy-to-clipboard button; the reveal uses a brief amber flash animation (the "wax-seal" moment). Empty state, loading skeleton rows, and error states included.
  inputs: current user id, adminUsers() client, adminSetUserRole() client, adminUserResetLink() client
  interactions: debounced search, role toggle per non-self row, generate-link per row (reveals copyable URL chip), clipboard copy
  kind: panel
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 3

- component: le-site-rooms
  description: Update the /le-site (chambres) page to fetch getRooms() on mount and filter the ROOMS array to only those slugs where is_public is true; on API error or missing slug entry, fall back to showing all rooms. The "12 chambres" marketing copy is unchanged and sourced from DEFAULTS.marketingRoomCount (static constant). No visible loading state for the filter — rooms render immediately from the static ROOMS array and update silently when the API responds.
  inputs: ROOMS content array, getRooms() client, DEFAULTS.marketingRoomCount
  interactions: none (display-only; visibility filter is invisible to users)
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: none