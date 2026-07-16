import { z } from "zod";

export type RoomRow = {
  slug: string;
  name: string;
  capacity: number;
  image_key: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

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

export const RoomCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  capacity: z.number().int().min(1, "capacity must be at least 1"),
  imageKey: z.enum(ROOM_IMAGE_KEYS),
  isPublic: z.boolean(),
});

export const RoomUpdateSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  capacity: z.number().int().min(1, "capacity must be at least 1"),
  imageKey: z.enum(ROOM_IMAGE_KEYS),
  isPublic: z.boolean(),
});

export type RoomCreateInput = z.infer<typeof RoomCreateSchema>;
export type RoomUpdateInput = z.infer<typeof RoomUpdateSchema>;
