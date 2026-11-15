// Shared rules for the characters (§F9.8).

/** The Flyer character's eye position in the right seat (= FLYER_DEFAULT). */
export const FLYER_EYE = { x: 0.5, y: 1.3, z: 0.35 } as const;

/**
 * SPEC-ASSUMPTION: "first person" = the camera within 0.8 m of the Flyer's eye (the spec's 0.25 m
 * missed the tuned station shots, which lean up to 0.7 m from the seat, e.g. FRONT over the
 * yokes, and would have drawn the Flyer's own head into frame). Every third-person shot
 * (WIDE_INTERIOR at 1.2 m, the exterior shots) stays well outside it.
 */
export const FIRST_PERSON_RADIUS = 0.8;

export function isFirstPerson(p: { x: number; y: number; z: number }): boolean {
  const dx = p.x - FLYER_EYE.x;
  const dy = p.y - FLYER_EYE.y;
  const dz = p.z - FLYER_EYE.z;
  return dx * dx + dy * dy + dz * dz < FIRST_PERSON_RADIUS * FIRST_PERSON_RADIUS;
}

/** Character palette (§F9.8). */
export const SKIN_FLYER = "#E0AC69";
export const SKIN_PILOT = "#F1C27D";
export const NAVY = "#1F2A44";
export const OUTFIT = { male: "#2EC4B6", female: "#E07A5F" } as const;
export const OUTFIT_TRIM = { male: "#7EE0D6", female: "#F2E8D5" } as const;
export const HAIR = { male: "#3B2A20", female: "#2B1D16" } as const;
export const DENIM = "#2B3A55";
export const SHOE = "#1B1E26";
export const INK = "#1F1F1F";
