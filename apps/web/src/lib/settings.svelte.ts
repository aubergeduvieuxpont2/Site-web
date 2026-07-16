import { getPublicSettings, type PublicSettings } from "./api";

const DEFAULTS: PublicSettings = {
  nightlyPrice: 89,
  contactEmail: "info@aubergeduvieuxpont.ca",
  marketingRoomCount: 12,
  publicRoomCount: 12,
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
    ...(incoming.marketingRoomCount !== undefined && {
      marketingRoomCount: incoming.marketingRoomCount,
    }),
    ...(incoming.publicRoomCount !== undefined && {
      publicRoomCount: incoming.publicRoomCount,
    }),
  };
}

export async function loadSettings(): Promise<void> {
  const result = await getPublicSettings();
  if (!("error" in result)) {
    Object.assign(settings, mergeSettings(settings, result));
  }
}
