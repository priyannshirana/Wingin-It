import { PALETTE, type PaletteName } from "../../content/stations";

const PALETTE_NAMES = new Set<string>(["red", "green", "blue", "yellow", "white", "grey"]);
const isPaletteName = (c: string): c is PaletteName => PALETTE_NAMES.has(c);

/**
 * Flat color only where it carries meaning (§F12.3): red / green / blue / yellow controls are
 * filled with their palette color; white and grey controls stay white paper.
 */
export function meaningfulFill(color: string): string | null {
  if (!isPaletteName(color) || color === "white" || color === "grey") return null;
  return PALETTE[color];
}
