## Global Design Strategy

Auberge du Vieux Pont speaks in **IBM Plex** (sans + mono) with a Material-adjacent token system — clean, technical, warmly bilingual. The three new pieces are additions to existing pages and must feel indistinguishable from the surrounding UI. The single creative moment is the OTA welcome variant: when a first-time Expedia guest arrives to create their account, the reinitialisation card should radiate warmth rather than bureaucracy — a forest-green left-border accent, a changed tag label ("BIENVENUE" vs "PASS-RESET"), and a subhead that says «espace client» rather than «minimum 8 caractères».

No new fonts. No new colour values. Every reference is a `var(--token)` already in scope.

### Colour Palette
- primary: `var(--color-primary)` — interactive focus ring
- surface: `var(--color-surface)` — page background
- surface-raised: `var(--color-surface-container-lowest)` — card/input background (#ffffff)
- border: `var(--color-outline-variant)` — default borders (#c6c6cd)
- text: `var(--color-ink)` — #191c1e
- text-secondary: `var(--color-ink-variant)` — #45464d
- text-muted: `var(--color-ink-mute)` / `var(--color-ink-soft)`
- action: `var(--color-secondary-container)` — #fd761a terracotta-orange (buttons, active toggles via `.page-admin__requeue-btn`)
- action-text: `var(--color-on-secondary-container)` — #ffffff
- toggle-on: `var(--color-forest)` — #1a5c2d (checked state, existing `.page-admin__toggle:checked`)
- success-surface: `var(--color-forest-surface)` — #d4ede0
- focus-ring: `var(--color-terracotta)` — #9d4300 (profil page focus rings)
- error: `var(--color-error)`

### Typography
- sans: `var(--font-sans)` — IBM Plex Sans; headings weight 300, body weight 400
- mono: `var(--font-mono)` — IBM Plex Mono; field labels, badges, `text-transform: uppercase; letter-spacing: 0.12em`
- serif: `var(--font-serif)` — for warm/celebratory headings (welcome state heading)
- base size: 14–16px; line-height: 1.5–1.65

### Spacing
- base unit: 4px; scale: xs=4px sm=8px md=16px lg=24px xl=40px 2xl=64px 3xl=96px
- all references via `var(--space-*)` tokens

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) — existing token set is calibrated for this; no new colours needed
- keyboard navigation: all interactive elements reachable via Tab; toggle inputs are native `<input type="checkbox">` (inherently focusable) with min 44×44px touch target
- ARIA roles required:
  - admin-email-toggles: each `<input type="checkbox">` has `aria-label`; associated `<label for="">` wires the text label; the existing settings-saved `role="status"` covers the save confirmation
  - welcome-onboarding-variant: heading swap is purely textual — no new ARIA needed; existing `id="reset-heading"` + `aria-labelledby` wiring remains correct; the welcome `$derived` bool must not mutate reactive state after render
  - profil-email-form: `<form>` with `aria-label="Changer l'adresse courriel"`; `role="alert"` on error feedback; `role="status"` on success feedback; each field labeled via `<label for="">`; `autocomplete="email"` on new-email input; `autocomplete="current-password"` on password input

### Security
- No `innerHTML` — use Svelte text bindings (`{variable}`) for all user-supplied/API-returned values
- No `eval()` or `Function()`
- URL param `?welcome=1` must only branch display logic, never be reflected as HTML
- The `?token=` query param must only be passed to the API client, never rendered to DOM
- Email change: current password must be sent over HTTPS in the request body; never stored post-call; new email validated `type="email"` client-side + server-side
- On 409 conflict the response body `{ error: "…" }` is bound with `{emailError}` (textContent), not innerHTML

## Component Inventory
- component: admin-email-toggles
  description: Four email-automation boolean toggles added to the "Paramètres" settings panel in admin/+page.svelte, grouped under a new "Courriels automatiques" h3 sub-section placed after the existing reservationsEnabled toggle. Reuses the exact existing .page-admin__toggle-wrap / .page-admin__toggle / .page-admin__toggle-label markup. Builder must also extend AdminSettings in api.ts with the four boolean fields (default false) and seed them in the settings $state block; the four fields are included in the existing saveSettings() → adminUpdateSettings() call without a new handler.
  inputs: settings.emailConfirmationEnabled, settings.emailPasswordResetEnabled, settings.emailRoomAssignmentEnabled, settings.emailWelcomeEnabled (bound booleans in the existing settings state)
  interactions: toggle checked state is sent as part of the existing saveSettings() flow; no new action handler required
  kind: section
  depends_on: []
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: 1

- component: welcome-onboarding-variant
  description: Conditional heading/subhead swap on reinitialisation/+page.svelte activated when ?welcome=1 is in the URL. Derives `isWelcome` from $page.url.searchParams. When true, the card-tag reads "BIENVENUE" (styled with var(--color-forest) instead of var(--color-ink-mute)), the h1 reads "Bienvenue !", and the subhead reads "Choisissez votre mot de passe pour accéder à votre espace client." The reinitialisation__card::before left-border accent switches from var(--color-outline-variant) to var(--color-forest) in welcome mode, giving the card a warm arrival feel without changing any form mechanics. Also updates the <title> to "Créez votre espace client — Auberge du Vieux Pont" when welcome=1.
  inputs: $page.url.searchParams.get("welcome") — "1" activates the variant; viewState (existing) controls form/error/success panels unchanged
  interactions: display-only variant; form, validation, submit flow are entirely unchanged
  kind: section
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-sonnet-4-6
  ralph: 2

- component: profil-email-form
  description: Email-change form added to profil/+page.svelte after the existing change-password section, separated by a .profil__hairline divider. Uses a <section aria-labelledby="profil-email-heading"> wrapper with the same .profil__section--pwd max-width (480px). The form (data-testid="profil-email-form") mirrors .profil__pwd-form exactly: .profil__pwd-field / .profil__pwd-label / .profil__pwd-input / .profil__pwd-feedback classes with identical states. Shows current email as a small .profil__pwd-hint line under the section heading. Fields: "Nouvelle adresse courriel" (type=email, autocomplete=email) and "Mot de passe actuel" (type=password, autocomplete=current-password). 200 → updates user.email, clears fields, shows success. 401 → password error. 409 → "Cette adresse courriel est déjà utilisée." 400 → validation message. Builder must also add changeProfileEmail(newEmail, currentPassword) to api.ts.
  inputs: user.email (read-only display); emailNew, emailPassword (bound state); emailError, emailSuccess (feedback state)
  interactions: form submit → changeProfileEmail() → discriminated union handled with isError(); success mutates user.email for instant display update
  kind: form
  depends_on: [admin-email-toggles]
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2