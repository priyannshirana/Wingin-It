// Procedural sound engine (§F16.4). FINAL PUBLIC API — M3c fills in the bodies (buses, recipes,
// loops, ducking). Everything else in the client only calls these functions.
//
//   master (volume × mute; default 0.5)
//    ├─ sfxBus      one-shots                         gain 1.0
//    ├─ ambienceBus loops (engine, rain, static, …)   gain 1.0, ducked to 0.5 while the radio is busy
//    └─ radioBus    radio_in / radio_out              gain 0.6

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

let ctx: AudioContext | null = null;

/** The one shared AudioContext (created lazily; resumed on a user gesture). */
export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

/** Resume the context from a user gesture (lobby click, Ready, "Click to enable sound"). */
export async function unlockAudio(): Promise<void> {
  const c = getAudioContext();
  if (c.state !== "running") await c.resume();
}

/** True once the context is running (hides the "Click to enable sound" chip). */
export function audioUnlocked(): boolean {
  return ctx?.state === "running";
}

export const sfx = {
  /** Play a one-shot recipe. */
  play(name: SfxName): void {
    void name; // M3c
  },
  /** Start or stop a looping recipe (idempotent). */
  loop(name: SfxName, on: boolean): void {
    void name;
    void on; // M3c
  },
  /** Change a parameter of a running voice. */
  setParam(name: SfxName, key: SfxParam, value: number | string): void {
    void name;
    void key;
    void value; // M3c
  },
};

/** Master volume 0..1 (the Settings slider; default 0.5). */
export function setMasterVolume(volume: number): void {
  void volume; // M3c
}

export function setMuted(muted: boolean): void {
  void muted; // M3c
}

/** Ambience bus → 0.5× while anyone holds the radio channel (150 ms ramp), back to 1 after. */
export function duckAmbience(on: boolean): void {
  void on; // M3c
}
