# Booking-Model Simplification + Admin-Configurable Settings

## Task

The L'Auberge du Vieux Pont marketing site (`apps/web` Svelte 5 SPA + `apps/api` Hono
Worker on Neon Postgres) misrepresents the real operating model. Nine operator
requirements must be satisfied:

1. **No room selection** — guests cannot pick a room; `RoomCard` "Réserver" links to
   `/contact` with no `?chambre=` query; the contact page drops its chambre-prefill
   effect and all "chambre souhaitée" wording. Rooms may still be shown as illustrative
   examples.
2. **No dormitory** — remove the `dortoir-equipe` room and every dortoir/dormitory
   mention in copy and tests.
3. **Single flat nightly price, admin-configurable** — one price everywhere (remove
   per-room `priceFrom`/`pricePerNight` display); stored server-side; default **89 $**.
4. **Configurable contact email** — default `info@aubergeduvieuxpont.ca`, replacing the
   hardcoded `aubergeduvieuxpont@hotmail.com`.
5. **12 rooms, admin-configurable, two notions** — (a) marketing count shown on the
   site (default 12, public) and (b) assignable capacity (operational, default 12,
   admin-only, never public).
6. **CITQ number in footer** — `CITQ #304542` visible on every page (non-configurable).
7. **Generic hydro-worker phrasing** — replace every "Hydro-Québec" mention in web copy.
8. **New tagline** — "no luxury, functional comforts".
9. **Remove 24/7 monitoring claims** — reword "surveillé jour et nuit" / "stockage
   surveillé".

The four volatile business facts (nightly price, contact email, marketing room count,
assignable capacity) become editable from the existing admin panel and persist in a new
Postgres `settings` table. The SPA renders configured values with the `content.ts`
constants as graceful fallback when the API is unreachable.

Constraints: French (Québec) copy; design system, layout, responsiveness, and stable
`data-testid`s preserved; migrations idempotent; frontend secret-free; `npm run
typecheck`, `npm run build:web`, and the full vitest suite pass. New branch off `main`;
no deploy.

## Schema Changes

New migration **`apps/api/migrations/0007_settings.sql`** (idempotent):

```sql
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('nightly_price',          '89'),
  ('contact_email',          'info@aubergeduvieuxpont.ca'),
  ('marketing_room_count',   '12'),
  ('assignable_room_count',  '12')
ON CONFLICT (key) DO NOTHING;
```

- Key/value shape (matches the idempotency convention; new settings need no schema
  churn). Values stored as `TEXT`; numeric keys are coerced at the API boundary.
- Re-running the migration is a no-op (`IF NOT EXISTS` + `ON CONFLICT DO NOTHING`).

## API Types

New module **`apps/api/src/settings.ts`**:

```ts
export const SETTINGS_DEFAULTS = {
  nightly_price: 89,
  contact_email: "info@aubergeduvieuxpont.ca",
  marketing_room_count: 12,
  assignable_room_count: 12,
} as const;

// Keys exposed on the PUBLIC endpoint. assignable_room_count is intentionally absent.
export const PUBLIC_SETTING_KEYS = [
  "nightly_price",
  "contact_email",
  "marketing_room_count",
] as const;

// Validation for the admin update body (all four required).
export const SettingsUpdateSchema = z.object({
  nightlyPrice:        z.coerce.number().int().positive(),
  contactEmail:        z.string().trim().email(),
  marketingRoomCount:  z.coerce.number().int().positive(),
  assignableRoomCount: z.coerce.number().int().positive(),
});
```

Response shapes (also declared in `apps/web/src/lib/api.ts`):

```ts
interface PublicSettings  { nightlyPrice: number; contactEmail: string; marketingRoomCount: number }
interface AdminSettings   extends PublicSettings { assignableRoomCount: number }
```

Endpoints (added to `apps/api/src/index.ts`):

| Method | Path                   | Auth   | Body / Query | Success | Errors |
|--------|------------------------|--------|--------------|---------|--------|
| GET    | `/api/settings`        | public | —            | `200 PublicSettings` | — (falls back to defaults on missing rows) |
| GET    | `/api/admin/settings`  | admin  | —            | `200 AdminSettings`  | `401` no session, `403` non-admin |
| POST   | `/api/admin/settings`  | admin  | `AdminSettings` JSON | `200 AdminSettings` | `400` invalid body, `401`, `403` |

- Admin routes replicate the inline `getAuthUser(c)` → `role === "admin"` gate used by
  the existing `/api/admin/*` routes (`401` unauthenticated, `403` non-admin).
- The update body is validated with `zValidator("json", SettingsUpdateSchema,
  settingsHook)` and a custom hook returning `{ error }` at `400` — never manual
  `c.req.json()` (repo rule `[[hono-zvalidator-rule]]`).
- `POST` (not `PUT`) is used so the update fits the existing CORS `allowMethods`
  (`GET`, `POST`, `OPTIONS`).
- The update performs `INSERT … ON CONFLICT (key) DO UPDATE SET value = …,
  updated_at = now()` for each of the four keys, then returns the persisted values.

## Component Hierarchy

```
+layout.svelte  (calls loadSettings() on client mount → hydrates the shared store)
  ├─ Nav
  ├─ <page>
  │    ├─ +page.svelte (Accueil): STATS rooms-stat uses settings.marketingRoomCount
  │    ├─ le-site/+page.svelte: rooms shown via RoomCard; heading/intro reworded
  │    ├─ a-propos/+page.svelte: value-card + hydro copy reworded
  │    ├─ contact/+page.svelte: no chambre prefill; renders settings.contactEmail
  │    └─ admin/+page.svelte: new "Paramètres" tab (load/save 4 settings)
  │         └─ RoomCard.svelte: CTA → /contact (no query); flat price from settings
  └─ Footer.svelte: CITQ #304542 line (data-testid="footer-citq")

Shared:
  lib/content.ts          — copy constants + DEFAULTS + SITE.citq (source of fallbacks)
  lib/settings.svelte.ts  — reactive $state store + loadSettings() + pure mergeSettings()
  lib/api.ts              — PublicSettings/AdminSettings types + 3 typed fetch helpers
```

## Implementation Steps

### Step 1 — `apps/api/migrations/0007_settings.sql`
Create the idempotent `settings` table + seed the four default rows exactly as in
**Schema Changes**. One statement per logical change; safe to re-run.

### Step 2 — `apps/api/src/settings.ts`
New module exporting `SETTINGS_DEFAULTS`, `PUBLIC_SETTING_KEYS`, `SettingsUpdateSchema`
(zod), and two pure mappers:
- `rowsToAdminSettings(rows: {key,value}[]): AdminSettings` — coerces numeric keys,
  fills any missing key from `SETTINGS_DEFAULTS`.
- `toPublicSettings(admin: AdminSettings): PublicSettings` — projects only the three
  public keys (drops `assignableRoomCount`).
Also export the custom `settingsHook` for zValidator (returns `{ error: firstIssue }` at
`400`).

### Step 3 — `apps/api/src/index.ts`
Add the three routes from **API Types**:
- `GET /api/settings` — read all keys, map via `rowsToAdminSettings` then
  `toPublicSettings`; return defaults for any missing row.
- `GET /api/admin/settings` — admin-gated; return full `AdminSettings`.
- `POST /api/admin/settings` — admin-gated; `zValidator("json",
  SettingsUpdateSchema, settingsHook)`; upsert all four keys; return persisted
  `AdminSettings`.
Do not alter existing routes.

### Step 4 — `apps/api/test/settings.test.ts`
Unit-test `apps/api/src/settings.ts`:
- `SettingsUpdateSchema` accepts a valid payload; rejects negative/zero price, negative
  counts, and an invalid email.
- `PUBLIC_SETTING_KEYS` excludes `assignable_room_count`.
- `rowsToAdminSettings` fills missing keys from defaults and coerces numerics.
- `toPublicSettings` omits `assignableRoomCount`.

### Step 5 — `apps/web/src/lib/content.ts`
- Update the header comment: replace "Hydro-Québec teams" with generic hydro wording.
- `SITE.tagline` → `"Pas de luxe — tout le confort fonctionnel."`
- `SITE.email` → `"info@aubergeduvieuxpont.ca"`.
- Add `SITE.citq: "304542"` (non-configurable).
- Export `DEFAULTS = { nightlyPrice: 89, contactEmail: "info@aubergeduvieuxpont.ca",
  marketingRoomCount: 12 }`.
- Remove the `dortoir-equipe` room from `ROOMS` (leaves 3 rooms). Remove `priceFrom`
  and `pricePerNight` from the `Room` type and every remaining room entry.
- `AMENITIES` A-01: drop "surveillé jour et nuit" (e.g. "Local verrouillé pour
  équipement et outils lourds."). A-08: replace "lignes d'Hydro-Québec" with "lignes du
  réseau hydroélectrique".
- `STATS`: replace the `32 lits — du dortoir à la chambre privée` entry with a
  marketing-count rooms stat `{ value: 12, suffix: " chambres", label: "…" }`; reword
  the `24 h — stockage surveillé` label to drop the surveillance claim (e.g. "stockage
  sécurisé"). Keep exactly four stats.
- `POLICIES` P-05: reword the "Animaux acceptés dans les dortoirs…" item to remove
  "dortoirs".
- `PRIVACY` C-03: replace `aubergeduvieuxpont@hotmail.com` with
  `info@aubergeduvieuxpont.ca`.

### Step 6 — `apps/web/src/lib/api.ts`
Add `PublicSettings` and `AdminSettings` interfaces and three helpers:
`getPublicSettings()` → `GET /settings`; `adminGetSettings()` → `GET /admin/settings`;
`adminUpdateSettings(data: AdminSettings)` → `POST /admin/settings` (JSON body). Each
returns `T | ApiError` via the existing `fetchJson`.

### Step 7 — `apps/web/src/lib/settings.svelte.ts`
New reactive store (`.svelte.ts` for runes):
- `export const settings = $state({ nightlyPrice, contactEmail, marketingRoomCount })`
  seeded from `DEFAULTS`.
- `export function mergeSettings(current, incoming): typeof settings` — pure reducer
  that overlays defined incoming values (used by the loader and unit-testable).
- `export async function loadSettings()` — calls `getPublicSettings()`; on success
  overlays the store via `mergeSettings`; on `ApiError` leaves defaults intact.

### Step 8 — `apps/web/src/lib/components/RoomCard.svelte`
- `contactHref` → constant `"/contact"` (remove the `?chambre=` query and `slug` from
  the prop type usage).
- Remove `pricePerNight` from the prop type; render the flat price from the settings
  store: `priceLabel = `${settings.nightlyPrice} $/nuit``. Keep the
  `data-testid="room-card-price"` element and all other testids.

### Step 9 — `apps/web/src/lib/components/Footer.svelte`
Add a non-configurable line rendering `CITQ #{SITE.citq}` with
`data-testid="footer-citq"` (e.g. inside the copyright strip), visible on every page.

### Step 10 — `apps/web/src/routes/+layout.svelte`
In the existing `onMount`, call `loadSettings()` (client-only) so the shared store
hydrates once for the whole shell. Failure is silent (defaults remain).

### Step 11 — `apps/web/src/routes/contact/+page.svelte`
- Remove `chambreParam`, the `seeded` state, and the `$effect` that seeds
  `"Chambre souhaitée : …"`.
- Change the message textarea placeholder to drop "chambre souhaitée".
- Render the contact email from the settings store (`settings.contactEmail`) in the
  info column (both the visible text and the `mailto:` href), falling back to the
  default.

### Step 12 — `apps/web/src/routes/+page.svelte`
- Hero sub-heading: replace "Hydro-Québec" with generic hydro wording (e.g.
  "foresterie et secteur hydroélectrique").
- Build the rendered stats so the rooms-count stat's value comes from
  `settings.marketingRoomCount` (default 12); keep four `stat-item`s.

### Step 13 — `apps/web/src/routes/le-site/+page.svelte`
- Heading "Nos chambres et dortoirs" → "Nos chambres".
- Rework the intro paragraph to remove the dorm/"couchette de chantier" implication and
  reflect rooms assigned at arrival.
- "lignes Hydro-Québec de Portneuf" → "lignes du réseau hydroélectrique de Portneuf".

### Step 14 — `apps/web/src/routes/a-propos/+page.svelte`
- Value card "Accessible" text "Du dortoir à 39 $ à la chambre privée…" → reworded to
  remove the dortoir and per-room price (single flat price, comfort-for-every-worker).
- Both "Hydro-Québec" mentions (histoire paragraph + ancrage paragraph) → generic hydro
  wording ("le secteur hydroélectrique" / "des lignes du réseau hydroélectrique").

### Step 15 — `apps/web/src/routes/admin/+page.svelte`
Add a "Paramètres" tab following the existing ARIA-tabs pattern:
- Extend the tab order array to `["reservations", "outbox", "settings"]`; add
  `<button role="tab" id="tab-settings" … data-testid="tab-settings">Paramètres</button>`
  and a `role="tabpanel"` `id="panel-settings"` `data-testid="panel-settings"`.
- On first activation, call `adminGetSettings()` to populate inputs; show a loading and
  error state consistent with the other panels.
- Inputs (each with a label + `data-testid`): nightly price
  (`input-nightly-price`), contact email (`input-contact-email`), marketing room count
  (`input-marketing-rooms`), assignable capacity (`input-assignable-rooms`), and a save
  button (`settings-save-btn`). Client-side guard: positive integers + valid email.
- Save calls `adminUpdateSettings(...)`; on success reflect persisted values and show a
  confirmation; on error show the error banner.

### Step 16 — Update existing co-located vitest tests
- `apps/web/src/lib/components/__tests__/RoomCard.test.ts` — replace the dortoir mock
  name/price/`imgKey`; assert CTA href is exactly `/contact` (no `?chambre=`); assert
  the flat price `89 $/nuit`; drop the `?chambre=` and per-room-price cases.
- `apps/web/src/routes/__tests__/page-contact.test.ts` — remove the "chambre pre-fill"
  seed test(s); assert the placeholder no longer says "chambre souhaitée".
- `apps/web/src/routes/le-site/__tests__/page-le-site.test.ts` — expect 3 room cards;
  heading "Nos chambres"; no "dortoirs".
- `apps/web/src/routes/__tests__/page-accueil.test.ts` — update stat-label/suffix
  assertions (rooms stat, reworded storage label); hero hydro copy; still four stats.
- `apps/web/src/routes/__tests__/page-a-propos.test.ts` — update any dortoir/`39`/
  Hydro-Québec copy assertions.
- `apps/web/src/lib/components/__tests__/Footer.test.ts` — assert
  `data-testid="footer-citq"` renders `CITQ #304542`.

### Step 17 — New frontend tests
- `apps/web/src/lib/__tests__/settings.test.ts` — test `mergeSettings` (overlay +
  fallback) and `getPublicSettings`/`adminUpdateSettings` request shape via the stubbed
  `fetch` pattern used in `lib/api.test.ts`.
- `apps/web/src/routes/__tests__/page-admin-settings.test.ts` — SSR-render the admin
  page and assert the `tab-settings`/`panel-settings` and the four input testids exist.

### Step 18 — `CLAUDE.md`
Document the new `settings` table, the four keys, the public-vs-admin read boundary, and
the 89 $ default (so the next contributor knows where these business facts live).

## Acceptance Criteria

1. **No room selection:** SSR-rendering `RoomCard` produces a CTA whose `href` is exactly
   `/contact` (the string `?chambre=` appears nowhere in the output).
2. **Contact page prefill removed:** `apps/web/src/routes/contact/+page.svelte` contains
   no `?chambre` read and no "Chambre souhaitée" text; the message placeholder does not
   contain "chambre souhaitée".
3. **No dortoir:** `grep -ri "dortoir" apps/web/src` returns no product-copy match in
   `content.ts`, `+page.svelte` files, or their non-`.svelte-kit` sources; `ROOMS` has no
   entry with `id: "dortoir-equipe"`.
4. **Single price rendered:** SSR-rendering `RoomCard` for any room shows `89 $/nuit`
   (the default), and no `priceFrom`/`pricePerNight` value is rendered per room.
5. **Public settings endpoint:** `GET /api/settings` returns a JSON body with keys
   `nightlyPrice`, `contactEmail`, `marketingRoomCount` and NO `assignableRoomCount`.
6. **Admin gate:** `GET /api/admin/settings` and `POST /api/admin/settings` return `401`
   with no session and `403` for a non-admin user; a valid admin `POST` with a bad body
   (negative price or invalid email) returns `400`.
7. **Settings persist:** after a valid admin `POST /api/admin/settings`, a subsequent
   `GET /api/settings` reflects the updated public values.
8. **Configurable email:** `grep -ri "hotmail" apps/web/src` returns no match; the
   contact page renders `settings.contactEmail` (default `info@aubergeduvieuxpont.ca`).
9. **Two room-count notions:** the admin "Paramètres" panel exposes both a marketing
   count input (`input-marketing-rooms`) and an assignable-capacity input
   (`input-assignable-rooms`); only the marketing count appears in `GET /api/settings`.
10. **Marketing count drives copy:** the Accueil stats strip renders exactly four
    `stat-item`s, one of which shows the marketing room count (default `12`) with a
    "chambres" suffix.
11. **CITQ footer:** the Footer renders an element `data-testid="footer-citq"` containing
    the text `CITQ #304542`, present on every page via `+layout.svelte`.
12. **Generic hydro copy:** `grep -r "Hydro-Québec" apps/web/src` returns no match in
    product copy (`content.ts`, `+page.svelte` files).
13. **Tagline:** `SITE.tagline` conveys "no luxury, functional comforts" and no longer
    equals "L'utilité industrielle rencontre l'hospitalité rurale."
14. **No monitoring claims:** `grep -rE "surveillé jour et nuit|stockage surveillé"
    apps/web/src` returns no match.
15. **Green build:** `npm run typecheck`, `npm run build:web`, and the full vitest suite
    (web + api) all pass.
16. **Idempotent migration:** applying `0007_settings.sql` twice succeeds with no error
    and leaves exactly one row per settings key.
