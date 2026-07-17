# Configurable phone + room pass-keys + room-assignment email

**Date:** 2026-07-17
**Status:** Approved

## Goal

Three related operator-facing capabilities for L'Auberge du Vieux Pont:

1. **Configurable phone number** — manage the public phone number from the admin
   dashboard (like `contact_email`), driving both the website and the email footer.
2. **Room pass-keys** — a per-room pass-key with an enable/disable toggle; when
   enabled the pass-key is a mandatory field.
3. **Room-assignment email template** — a new bilingual email that shows the room
   pass-key when the room has one enabled, or otherwise tells the guest to use the
   key left in the door.

## Decisions (from brainstorming)

- **Room-assignment email is template + preview only.** Email *sending*
  infrastructure (Mailtrap + triggers) remains deferred to the separate sending
  spec; the 6 existing emails are preview-only today and this becomes the 7th.
  Actually dispatching the email on assignment (and gathering guest data at the
  assignment endpoint) is **out of scope**.
- **Phone reaches the emails too.** `contact_phone` drives the website *and* the
  email footer. The email render path receives `contactPhone`/`contactPhoneHref`;
  a built-in `EMAIL_DEFAULTS` keeps the footer populated when they aren't passed.
- **Pass-key is per-room and admin-only.** Public `GET /api/rooms` never returns
  the pass-key; only admin `GET /api/admin/rooms` includes it.
- **Pass-key enabled ⇒ pass-key required** (non-empty), enforced in the API zod
  schema and in the admin form.
- **Phone validation is lenient** — a trimmed non-empty string (no strict
  Québec-format regex), since operators may enter various display formats.

## Architecture notes (current `main`)

- **Settings** live in a generic key/value `settings` table; `apps/api/src/settings.ts`
  owns `SETTINGS_DEFAULTS`, `PUBLIC_SETTING_KEYS`, `SettingsUpdateSchema`,
  `AdminSettings`/`PublicSettings` interfaces, `rowsToAdminSettings`, and
  `toPublicSettings`. Today's keys: `nightly_price`, `contact_email`, `tps`,
  `tvq`, `accommodation_tax`. `GET /api/settings` is public; `GET/POST
  /api/admin/settings` are admin-gated and upsert one row per key.
- **Rooms:** `rooms(slug PK, name, capacity, image_key, is_public, created_at,
  updated_at)`. Public `GET /api/rooms` returns a bare array filtered to
  `is_public=true`; admin `GET /api/admin/rooms` returns `{rooms:[…]}` with all
  rooms. `RoomCreateSchema`/`RoomUpdateSchema` in `apps/api/src/rooms.ts`; slug is
  derived server-side. Admin form is `apps/web/src/lib/components/admin/RoomsForm.svelte`
  (+ `RoomsListItem`, `AdminChambresTab`).
- **Emails are precompiled** (PR #33): `apps/api/scripts/precompile-emails.mjs`
  reads the `.hbs` files listed by its `KEYS` array and generates
  `apps/api/src/emails/precompiled.ts` (`Handlebars.template(spec)`), rendered via
  `handlebars/runtime` — **no runtime `compile()`/`new Function`** (Workers forbid
  it). Adding/altering any `.hbs` requires regenerating `precompiled.ts`
  (`npm run precompile:emails`; also runs via `pretest` and the wrangler
  `build.command`). `render.ts` merges `{...data, locale}`; `manifest.ts` holds the
  per-key `requiredFields`; `templates.ts` holds the `TemplateKey` union + `SAMPLES`.

## Component 1 — Configurable phone (`contact_phone`)

**Migration** `apps/api/migrations/0018_settings_contact_phone.sql` (idempotent;
use the next free number if 0018 is taken):
`INSERT INTO settings (key, value) VALUES ('contact_phone', '418 655-1212') ON CONFLICT (key) DO NOTHING;`

**API (`apps/api/src/settings.ts`):** add `contact_phone` to `SETTINGS_DEFAULTS`
and `PUBLIC_SETTING_KEYS`; add `contactPhone: z.string().trim().min(1)` to
`SettingsUpdateSchema`; add `contactPhone` to `AdminSettings` + `PublicSettings`;
map it in `rowsToAdminSettings` and `toPublicSettings`. In `index.ts`
`POST /api/admin/settings`, add the `contact_phone` upsert. Public response shape
gains `contactPhone`.

**Web:** mirror `contactPhone` in `apps/web/src/lib/api.ts` (`AdminSettings`,
`PublicSettings`) and add a field to the admin settings form
(`routes/admin/+page.svelte`). Consume the value from the public-settings store
with `SITE.phone`/`SITE.phoneHref` as fallback in `Footer.svelte`, `Nav.svelte`,
`routes/contact/+page.svelte`, `routes/a-propos/+page.svelte`, and `lib/seo.ts`
(JSON-LD `telephone`). `content.ts` keeps the current number as the fallback
default. Derive the `tel:` href by stripping non-digits from the configured value.

**Known limitation:** the static `llms.txt` asset can't be dynamic — it keeps the
default number, and its assertion in `static-assets.test.ts` stays.

## Component 2 — Room pass-key

**Migration** `apps/api/migrations/0019_rooms_passkey.sql` (idempotent):
```
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS passkey_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS passkey TEXT;
```

**API (`apps/api/src/rooms.ts`):** extend both schemas with
`passkeyEnabled: z.boolean()` and `passkey: z.string().trim().optional()`, plus a
`.superRefine`/`.refine`: when `passkeyEnabled` is true, `passkey` must be a
non-empty string (else a 400 with a clear message). `index.ts` `POST`/`PUT`
include `passkey_enabled` and `passkey` in the INSERT/UPDATE.

**Security:** public `GET /api/rooms` MUST NOT select or return `passkey` (nor
needs `passkey_enabled`). Admin `GET /api/admin/rooms` returns both. Ensure the
public serialization explicitly omits the pass-key even if the row is selected.

**Web (`RoomsForm.svelte`):** add a `passkeyEnabled` checkbox (mirroring the
`isPublic` pattern); when checked, reveal a mandatory `passkey` text input with a
French blur/submit validator ("La clé est requise lorsqu'elle est activée."). Add
both to the emitted `RoomInput`, and mirror through `RoomsListItem.svelte`,
`AdminChambresTab.svelte`, and the `api.ts` room types.

## Component 3 — Room-assignment email (`room-assigned`)

**Files:** `emails/templates/room-assigned.fr.hbs` + `.en.hbs`,
`emails/samples/room-assigned.json`. Wiring: add `"room-assigned"` to the `KEYS`
array in `scripts/precompile-emails.mjs`, to the `TemplateKey` union + `SAMPLES` in
`templates.ts`, and a `MANIFEST["room-assigned"]` entry (+ `TEMPLATE_KEYS`) in
`manifest.ts`. Regenerate `precompiled.ts`.

**Conditional content** (Handlebars, precompiled — `{{#if}}` is supported):
```
{{#if passkeyEnabled}}
  <p>Le code d'accès de votre chambre est : <strong>{{passkey}}</strong></p>
{{else}}
  <p>Veuillez utiliser la clé qui se trouve dans la porte de votre chambre.</p>
{{/if}}
```
EN mirrors ("Your room access code is…" / "Please use the key located in your
room door.").

**Manifest `requiredFields`:** `["name", "roomLabel", "checkIn", "checkOut",
"passkeyEnabled"]`. `passkey` is referenced only inside `{{#if passkeyEnabled}}`,
so it is **not** a hard-required field (avoids `renderEmail` throwing when a room
has no pass-key).

**Sample `room-assigned.json`:** `passkeyEnabled: true` with a sample `passkey`
(e.g. "4921") so the preview shows the pass-key path; the door-key branch is
covered by tests. Include `name`, `roomLabel`, `checkIn`, `checkOut`,
`confirmationCode`.

## Component 4 — Configurable phone in the email footer

**`emails/partials/footer.fr.hbs` + `footer.en.hbs`:** replace the hard-coded
number with `<a href="{{contactPhoneHref}}">{{contactPhone}}</a>` (and use
`{{contactEmail}}` for the address while here, for consistency).

**`render.ts`:** define `EMAIL_DEFAULTS = { contactPhone: "418 655-1212",
contactPhoneHref: "tel:+14186551212", contactEmail: "info@aubergeduvieuxpont.ca" }`
and render with `{ ...EMAIL_DEFAULTS, ...data, locale }` so the footer is always
populated (unit tests and any caller that omits contact info still render the
default). Regenerate `precompiled.ts` after the footer change.

**`routes.ts` preview:** fetch `contact_phone`/`contact_email` from the `settings`
table (the route already has `c.env.DB_CONN`), compute `contactPhoneHref` from the
digits, and pass `{ contactPhone, contactPhoneHref, contactEmail }` into
`renderEmail` alongside the sample so previews reflect the configured values.

## Testing

- **Settings:** `contact_phone` present in public + admin responses; update
  validates (rejects empty); upsert persists.
- **Rooms:** `passkeyEnabled=true` without `passkey` → 400; with `passkey` → ok;
  `passkeyEnabled=false` with empty passkey → ok; public `GET /api/rooms` response
  contains no `passkey`; admin response includes it.
- **Email:** `room-assigned` renders for both locales; with `passkeyEnabled:true`
  the passkey appears and the door text does not; with `passkeyEnabled:false` the
  door text appears and no passkey; footer shows an injected `contactPhone` when
  provided and the default when not.
- **Web:** `RoomsForm` reveals + requires the passkey field only when the toggle
  is on. Update phone-pinning tests (`Footer`, `Nav`, `seo`, `a-propos`,
  `layout-shell`) for the settings-driven value with fallback.

## Out of scope (deferred to the sending spec)

- Actually sending the room-assignment email on assignment.
- Extending `POST /api/admin/reservations/:id/assignments` to gather guest
  name/email for a send payload.
- Any Mailtrap / outbox / trigger wiring.
