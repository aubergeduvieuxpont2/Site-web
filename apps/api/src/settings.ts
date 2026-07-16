import { z } from "zod";

export const SETTINGS_DEFAULTS = {
  nightly_price: 89,
  contact_email: "info@aubergeduvieuxpont.ca",
  tps: 5,
  tvq: 9.975,
  accommodation_tax: 3.5,
} as const;

export const PUBLIC_SETTING_KEYS = [
  "nightly_price",
  "contact_email",
  "tps",
  "tvq",
  "accommodation_tax",
] as const;

export const SettingsUpdateSchema = z.object({
  nightlyPrice: z.coerce.number().int().positive(),
  contactEmail: z.string().trim().email(),
  tps: z.coerce.number().min(0),
  tvq: z.coerce.number().min(0),
  accommodationTax: z.coerce.number().min(0),
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
  tps: number;
  tvq: number;
  accommodationTax: number;
}

export interface PublicSettings {
  nightlyPrice: number;
  contactEmail: string;
  tps: number;
  tvq: number;
  accommodationTax: number;
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
    tps: parseFloat(
      rowMap.get("tps") ?? String(SETTINGS_DEFAULTS.tps)
    ),
    tvq: parseFloat(
      rowMap.get("tvq") ?? String(SETTINGS_DEFAULTS.tvq)
    ),
    accommodationTax: parseFloat(
      rowMap.get("accommodation_tax") ?? String(SETTINGS_DEFAULTS.accommodation_tax)
    ),
  };
}

export function toPublicSettings(admin: AdminSettings): PublicSettings {
  return {
    nightlyPrice: admin.nightlyPrice,
    contactEmail: admin.contactEmail,
    tps: admin.tps,
    tvq: admin.tvq,
    accommodationTax: admin.accommodationTax,
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
