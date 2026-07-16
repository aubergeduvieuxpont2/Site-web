import { z } from "zod";

export const SETTINGS_DEFAULTS = {
  nightly_price: 89,
  contact_email: "info@aubergeduvieuxpont.ca",
} as const;

export const PUBLIC_SETTING_KEYS = [
  "nightly_price",
  "contact_email",
] as const;

export const SettingsUpdateSchema = z.object({
  nightlyPrice: z.coerce.number().int().positive(),
  contactEmail: z.string().trim().email(),
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
  contactEmail: string;
}

export interface PublicSettings {
  nightlyPrice: number;
  contactEmail: string;
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
    contactEmail:
      rowMap.get("contact_email") ?? SETTINGS_DEFAULTS.contact_email,
  };
}

export function toPublicSettings(admin: AdminSettings): PublicSettings {
  return {
    nightlyPrice: admin.nightlyPrice,
    contactEmail: admin.contactEmail,
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
