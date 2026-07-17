import { z } from "zod";

export type RoomRow = {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
  passkey_enabled: boolean;
  passkey: string | null;
  created_at: string;
  updated_at: string;
};

// Public room shape — never exposes the pass-key (a door/lock code).
export type PublicRoomRow = Omit<RoomRow, "passkey" | "passkey_enabled" | "created_at" | "updated_at">;

export const ROOM_IMAGE_KEYS = [
  "bedroom",
  "balcony",
  "living-dining",
  "lounge",
  "dining",
  "kitchen",
  "laundry",
  "bathroom-1",
  "bathroom-2",
  "bathroom-3",
  "auberge-exterior",
  "auberge-porch",
  "bridge",
  "village-river",
] as const;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

const roomShape = {
  name: z.string().trim().min(1, "name is required"),
  capacity: z.number().int().min(1, "capacity must be at least 1"),
  imageKey: z.enum(ROOM_IMAGE_KEYS),
  isPublic: z.boolean(),
  // Pass-key (door/lock code). When the toggle is enabled the code is mandatory.
  passkeyEnabled: z.boolean(),
  passkey: z.string().trim().optional(),
};

// When passkeyEnabled is true, passkey must be a non-empty string.
function requirePasskeyWhenEnabled(
  data: { passkeyEnabled: boolean; passkey?: string },
  ctx: z.RefinementCtx
) {
  if (data.passkeyEnabled && !data.passkey) {
    ctx.addIssue({
      code: "custom",
      path: ["passkey"],
      message: "La clé est requise lorsqu'elle est activée.",
    });
  }
}

export const RoomCreateSchema = z.object(roomShape).superRefine(requirePasskeyWhenEnabled);
export const RoomUpdateSchema = z.object(roomShape).superRefine(requirePasskeyWhenEnabled);

export type RoomCreateInput = z.infer<typeof RoomCreateSchema>;
export type RoomUpdateInput = z.infer<typeof RoomUpdateSchema>;
