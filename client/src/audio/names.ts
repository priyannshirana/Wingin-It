// Every sound name in §F16.4. Pure (no DOM, no store), so the offline render harness can load it.

/** Every recipe name in §F16.4. */
export type SfxName =
  | "alarm_master"
  | "fire_bell"
  | "warning_beep"
  | "click"
  | "clunk"
  | "chime"
  | "chime_soft"
  | "buzzer"
  | "boom"
  | "whoosh"
  | "engine_hum"
  | "static"
  | "rain"
  | "thunder"
  | "screech"
  | "squeal"
  | "snore"
  | "sparkle"
  | "low_fuel"
  | "radio_in"
  | "radio_out"
  | "fuel_hiss"
  | "motor_whirr"
  | "radio_crackle"
  | "music_sting"
  | "stamp"
  | "page_turn";

export const SFX_NAMES: readonly SfxName[] = [
  "alarm_master",
  "fire_bell",
  "warning_beep",
  "click",
  "clunk",
  "chime",
  "chime_soft",
  "buzzer",
  "boom",
  "whoosh",
  "engine_hum",
  "static",
  "rain",
  "thunder",
  "screech",
  "squeal",
  "snore",
  "sparkle",
  "low_fuel",
  "radio_in",
  "radio_out",
  "fuel_hiss",
  "motor_whirr",
  "radio_crackle",
  "music_sting",
  "stamp",
  "page_turn",
];

/** Parameters a running voice accepts through `sfx.setParam` (e.g. engine_hum pitch, static gain). */
export type SfxParam = "gain" | "pitch" | "wobble" | "mode";

export function isSfxName(value: string): value is SfxName {
  return (SFX_NAMES as readonly string[]).includes(value);
}
