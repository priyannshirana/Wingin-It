// DOM hooks into the rest of the Tower screen. The cue layer never edits those components; it
// finds them by their test ids and animates them with GSAP (reverted on unmount), so a cue that
// switches off always leaves the element exactly as React rendered it.

export const TOWER_ROOT = '[data-screen="tower"]';
export const RADAR = '[data-testid="radar"]';
export const BLIP = '[data-testid="blip"]';
export const SUBTITLES = '[data-testid="subtitles"]';
export const LIFELINES = '[data-testid="lifelines"]';
export const LIFELINE_DOT = '[data-testid="lifeline-dot"]';

/** The blip's r=6 core circle: its centre is the blip position (the bbox includes the label). */
export const BLIP_CORE = '[data-testid="blip"] > circle[r="6"]';
/** Radar.tsx's own icon groups (fire / smoke / mayday) under the blip. */
export const BLIP_ICONS = '[data-testid="blip"] > g:not([data-fx])';
/** Radar.tsx's runway rectangle and dashed glide path. */
export const REAL_RUNWAY = '[data-testid="radar"] rect[fill="#F2E8D5"]:not([data-fx])';
export const REAL_GLIDE = '[data-testid="radar"] line[stroke-dasharray="5 5"]:not([data-fx])';

/** The radar's SVG coordinate system (Radar.tsx: a 280 × 280 viewBox, disc radius 136). */
export const RADAR_SIZE = 280;
export const RADAR_C = RADAR_SIZE / 2;
export const RADAR_R = RADAR_C - 4;
/** Radar.tsx's route end (the runway) and its rotation; mirrored, Radar.tsx stays untouched. */
export const RUNWAY = { x: 215, y: 70, rotate: 35 };
/** Radar.tsx's storm blobs (final positions), so the drift-in lands where the real ones sit. */
export const STORM_BLOBS = [
  { cx: 95, cy: 120, r: 30 },
  { cx: 180, cy: 150, r: 38 },
  { cx: 150, cy: 85, r: 26 },
  { cx: 120, cy: 200, r: 32 },
] as const;
/** Radar.tsx's flame path (the fire icon). */
export const FLAME_PATH = "M0 -12 C 7 -4 8 2 0 8 C -8 2 -7 -4 -2 -9 C -2 -4 2 -3 0 -12 Z";
/** Radar.tsx's smoke puffs (in the smoke group, translated by (0, −22)). */
export const SMOKE_PUFFS = [
  { cx: -6, cy: 0, r: 6 },
  { cx: 3, cy: -4, r: 7 },
  { cx: 9, cy: 2, r: 5 },
] as const;

/** Hides the elements matched by `selector` while mounted (an SVG/HTML `<style>` rule). */
export const hideRule = (selector: string) => `${selector} { opacity: 0 !important; }`;

/** Small deterministic PRNG, so particles look the same on every screen and every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The center of `el` in the radar's viewBox units, or the disc center if it can't be measured. */
export function radarPoint(svg: Element, el: Element | null): { x: number; y: number } {
  const box = svg.getBoundingClientRect();
  if (!el || box.width <= 0) return { x: RADAR_C, y: RADAR_C };
  const r = el.getBoundingClientRect();
  const k = RADAR_SIZE / box.width;
  return {
    x: (r.left + r.width / 2 - box.left) * k,
    y: (r.top + r.height / 2 - box.top) * k,
  };
}
