import { getPublicSettings, type PublicSettings } from "./api";

const DEFAULTS: PublicSettings = {
  nightlyPrice: 89,
  contactEmail: "info@aubergeduvieuxpont.ca",
  contactPhone: "418 655-1212",
  marketingRoomCount: 12,
  publicRoomCount: 12,
  tps: 5,
  tvq: 9.975,
  accommodationTax: 3.5,
  weeklyPrice: 560,
  reservationsEnabled: true,
};

export const settings = $state({ ...DEFAULTS });

export function mergeSettings(
  current: PublicSettings,
  incoming: Partial<PublicSettings>
): PublicSettings {
  return {
    ...current,
    ...(incoming.nightlyPrice !== undefined && {
      nightlyPrice: incoming.nightlyPrice,
    }),
    ...(incoming.contactEmail !== undefined && {
      contactEmail: incoming.contactEmail,
    }),
    ...(incoming.contactPhone !== undefined && {
      contactPhone: incoming.contactPhone,
    }),
    ...(incoming.marketingRoomCount !== undefined && {
      marketingRoomCount: incoming.marketingRoomCount,
    }),
    ...(incoming.publicRoomCount !== undefined && {
      publicRoomCount: incoming.publicRoomCount,
    }),
    ...(incoming.tps !== undefined && {
      tps: incoming.tps,
    }),
    ...(incoming.tvq !== undefined && {
      tvq: incoming.tvq,
    }),
    ...(incoming.accommodationTax !== undefined && {
      accommodationTax: incoming.accommodationTax,
    }),
    ...(incoming.weeklyPrice !== undefined && {
      weeklyPrice: incoming.weeklyPrice,
    }),
    ...(incoming.reservationsEnabled !== undefined && {
      reservationsEnabled: incoming.reservationsEnabled,
    }),
  };
}

export async function loadSettings(): Promise<void> {
  const result = await getPublicSettings();
  if (!("error" in result)) {
    Object.assign(settings, mergeSettings(settings, result));
  }
}
