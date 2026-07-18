import { z } from "zod";

export const SETTINGS_DEFAULTS = {
  nightly_price: 89,
  weekly_price: 560,
  contact_email: "info@aubergeduvieuxpont.ca",
  contact_phone: "418 655-1212",
  tps: 5,
  tvq: 9.975,
  accommodation_tax: 3.5,
  assignable_room_count: 12,
  reservations_enabled: true,
  email_confirmation_enabled: false,
  email_password_reset_enabled: false,
  email_room_assignment_enabled: false,
  email_welcome_enabled: false,
} as const;

export const PUBLIC_SETTING_KEYS = [
  "nightly_price",
  "weekly_price",
  "contact_email",
  "contact_phone",
  "tps",
  "tvq",
  "accommodation_tax",
  "reservations_enabled",
] as const;

export function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  throw new Error(`Invalid boolean value: ${v}`);
}

// Non-throwing coercion for Zod's preprocess: normalize known boolean-ish
// strings but pass anything else through unchanged so `z.boolean()` reports a
// proper validation issue instead of throwing out of `safeParse` (e.g. when the
// field is absent from the payload).
function coerceBoolLoose(v: unknown): unknown {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  return v;
}

export const SettingsUpdateSchema = z.object({
  nightlyPrice: z.coerce.number().int().positive(),
  weeklyPrice: z.coerce.number().int().positive(),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(1, "Le numéro de téléphone est requis"),
  tps: z.coerce.number().min(0),
  tvq: z.coerce.number().min(0),
  accommodationTax: z.coerce.number().min(0),
  // Server-derived from the number of public rooms; accepted (and ignored) here
  // so the read-only field the admin UI still submits doesn't fail validation,
  // and allowed to be 0 when no rooms are public.
  assignableRoomCount: z.coerce.number().int().nonnegative(),
  reservationsEnabled: z.preprocess(coerceBoolLoose, z.boolean()),
  emailConfirmationEnabled: z.preprocess(coerceBoolLoose, z.boolean()),
  emailPasswordResetEnabled: z.preprocess(coerceBoolLoose, z.boolean()),
  emailRoomAssignmentEnabled: z.preprocess(coerceBoolLoose, z.boolean()),
  emailWelcomeEnabled: z.preprocess(coerceBoolLoose, z.boolean()),
});

export const settingsHook = (result: any, c: any) =>
  result.success
    ? undefined
    : c.json(
        {
          error:
            result.error.issues[0]?.message ?? "Invalid request",
        },
        400
      );

export interface AdminSettings {
  nightlyPrice: number;
  weeklyPrice: number;
  contactEmail: string;
  contactPhone: string;
  tps: number;
  tvq: number;
  accommodationTax: number;
  assignableRoomCount: number;
  reservationsEnabled: boolean;
  emailConfirmationEnabled: boolean;
  emailPasswordResetEnabled: boolean;
  emailRoomAssignmentEnabled: boolean;
  emailWelcomeEnabled: boolean;
}

export interface PublicSettings {
  nightlyPrice: number;
  weeklyPrice: number;
  contactEmail: string;
  contactPhone: string;
  tps: number;
  tvq: number;
  accommodationTax: number;
  reservationsEnabled: boolean;
  // Live count of publicly-visible rooms. Optional: omitted from the response
  // when the count query fails so the endpoint never 500s and the frontend
  // fallback (DEFAULTS.publicRoomCount) can take over.
  publicRoomCount?: number;
}

export function rowsToAdminSettings(
  rows: { key: string; value: string }[]
): AdminSettings {
  const rowMap = new Map(rows.map((r) => [r.key, r.value]));

  return {
    nightlyPrice: parseInt(
      rowMap.get("nightly_price") ?? String(SETTINGS_DEFAULTS.nightly_price),
      10
    ),
    weeklyPrice: parseInt(
      rowMap.get("weekly_price") ?? String(SETTINGS_DEFAULTS.weekly_price),
      10
    ),
    contactEmail:
      rowMap.get("contact_email") ?? SETTINGS_DEFAULTS.contact_email,
    contactPhone:
      rowMap.get("contact_phone") ?? SETTINGS_DEFAULTS.contact_phone,
    tps: parseFloat(
      rowMap.get("tps") ?? String(SETTINGS_DEFAULTS.tps)
    ),
    tvq: parseFloat(
      rowMap.get("tvq") ?? String(SETTINGS_DEFAULTS.tvq)
    ),
    accommodationTax: parseFloat(
      rowMap.get("accommodation_tax") ?? String(SETTINGS_DEFAULTS.accommodation_tax)
    ),
    assignableRoomCount: parseInt(
      rowMap.get("assignable_room_count") ?? String(SETTINGS_DEFAULTS.assignable_room_count),
      10
    ),
    reservationsEnabled: parseBool(
      rowMap.get("reservations_enabled") ?? String(SETTINGS_DEFAULTS.reservations_enabled)
    ),
    emailConfirmationEnabled: parseBool(
      rowMap.get("email_confirmation_enabled") ?? "false"
    ),
    emailPasswordResetEnabled: parseBool(
      rowMap.get("email_password_reset_enabled") ?? "false"
    ),
    emailRoomAssignmentEnabled: parseBool(
      rowMap.get("email_room_assignment_enabled") ?? "false"
    ),
    emailWelcomeEnabled: parseBool(
      rowMap.get("email_welcome_enabled") ?? "false"
    ),
  };
}

export function toPublicSettings(admin: AdminSettings): PublicSettings {
  return {
    nightlyPrice: admin.nightlyPrice,
    weeklyPrice: admin.weeklyPrice,
    contactEmail: admin.contactEmail,
    contactPhone: admin.contactPhone,
    tps: admin.tps,
    tvq: admin.tvq,
    accommodationTax: admin.accommodationTax,
    reservationsEnabled: admin.reservationsEnabled,
  };
}

// Merge the live public-room count into the public settings response.
// When `count` is undefined (the count query failed) the field is omitted
// entirely so the response stays valid and the frontend fallback applies.
export function withPublicRoomCount(
  publicSettings: PublicSettings,
  count: number | undefined
): PublicSettings {
  return {
    ...publicSettings,
    ...(count !== undefined && { publicRoomCount: count }),
  };
}
