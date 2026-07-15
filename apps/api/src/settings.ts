import { z } from "zod";

export const SETTINGS_DEFAULTS = {
  nightly_price: 89,
  contact_email: "info@aubergeduvieuxpont.ca",
  marketing_room_count: 12,
  assignable_room_count: 12,
} as const;

export const PUBLIC_SETTING_KEYS = [
  "nightly_price",
  "contact_email",
  "marketing_room_count",
] as const;

export const SettingsUpdateSchema = z.object({
  nightlyPrice: z.coerce.number().int().positive(),
  contactEmail: z.string().trim().email(),
  marketingRoomCount: z.coerce.number().int().positive(),
  assignableRoomCount: z.coerce.number().int().positive(),
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
  marketingRoomCount: number;
  assignableRoomCount: number;
}

export interface PublicSettings {
  nightlyPrice: number;
  contactEmail: string;
  marketingRoomCount: number;
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
    marketingRoomCount: parseInt(
      rowMap.get("marketing_room_count") ??
        String(SETTINGS_DEFAULTS.marketing_room_count),
      10
    ),
    assignableRoomCount: parseInt(
      rowMap.get("assignable_room_count") ??
        String(SETTINGS_DEFAULTS.assignable_room_count),
      10
    ),
  };
}

export function toPublicSettings(admin: AdminSettings): PublicSettings {
  return {
    nightlyPrice: admin.nightlyPrice,
    contactEmail: admin.contactEmail,
    marketingRoomCount: admin.marketingRoomCount,
  };
}
