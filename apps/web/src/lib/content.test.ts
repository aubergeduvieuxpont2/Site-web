import { describe, it, expect } from "vitest";
import { ROOMS, AMENITIES, DEFAULTS } from "./content";

describe("content updates", () => {
  it("ROOMS[0] has no breakfast copy", () => {
    const room = ROOMS[0];
    expect(room.blurb).not.toMatch(
      /petit-déjeuner|déjeuner servi|déjeuner prêt/i
    );
    expect(room.description).not.toMatch(
      /petit-déjeuner|déjeuner servi|déjeuner prêt/i
    );
  });

  it("A-04 amenity is coffee, not breakfast", () => {
    const a04 = AMENITIES.find((a) => a.code === "A-04");
    expect(a04?.title).toBe("Café en libre-service");
    expect(a04?.text).not.toMatch(/petit-déjeuner|breakfast/i);
  });

  it("AMENITIES count unchanged", () => {
    expect(AMENITIES).toHaveLength(8);
  });

  it("DEFAULTS includes publicRoomCount", () => {
    expect(DEFAULTS.publicRoomCount).toBe(12);
  });

  it("ROOMS[0] blurb matches specification", () => {
    const room = ROOMS[0];
    expect(room.blurb).toBe(
      "La chambre idéale pour les travailleurs de quart de nuit."
    );
  });

  it("ROOMS[0] description mentions quiet rest without breakfast", () => {
    const room = ROOMS[0];
    expect(room.description).toContain("repos ininterrompu");
    expect(room.description).toContain("quart de travail");
    expect(room.description).toContain("insonorisation");
  });

  it("A-04 amenity title is exactly as specified", () => {
    const a04 = AMENITIES.find((a) => a.code === "A-04");
    expect(a04?.title).toBe("Café en libre-service");
    expect(a04?.text).toBe("Accès à du café disponible à toute heure.");
  });
});
