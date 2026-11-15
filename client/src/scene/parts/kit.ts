// Shared constants for the toy parts (§F9.4).
import type { ControlDef } from "../../content/stations";
import { PALETTE } from "../../content/stations";

export const DEG = Math.PI / 180;
export const OUTLINE = "#1b1d24";
export const OUTLINE_W = 0.004;
export const BEZEL = "#3D4352";
export const SLOT = "#1B1E26";
export const LAMP_OFF = "#3A3D46";
export const LABEL_DARK = "#111111"; // on light caps
export const LABEL_LIGHT = "#F5F5F5"; // on dark panels
export const LABEL_SIZE = 0.028;
export const FONT_URL = "/fonts/Baloo2-Bold.ttf";
export const ROUGHNESS = 0.55;
export const HOVER_LIFT = 0.25;

export interface PartProps {
  control: ControlDef;
}

export const colorOf = (control: Pick<ControlDef, "color">): string => PALETTE[control.color];
