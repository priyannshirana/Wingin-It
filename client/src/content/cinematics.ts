// Typed access to content/cinematics.json (§A10). The GSAP timelines must have exactly these
// durations; the server sends the authoritative `duration_ms` in each `cinematic` message.
import rawCinematics from "@content/cinematics.json";
import type { CinematicId } from "../net/protocol";
import { ContentError, readInt, readRecord } from "./read";

export type CinematicKind = "state" | "in_phase" | "event";

export interface CinematicDef {
  kind: CinematicKind;
  duration_ms: number;
  demo_duration_ms: number | null;
  retry_duration_ms: number | null;
  skippable: boolean;
}

export interface CinematicsFile {
  lead_ms: number;
  cinematics: Record<CinematicId, CinematicDef>;
}

/** Every `CinematicId`, in play order. */
export const CINEMATIC_IDS: readonly CinematicId[] = [
  "prologue",
  "p1_intro",
  "p1_seat",
  "p1_outro",
  "p2_intro",
  "p2_extinguish",
  "p2_outro",
  "p3_intro",
  "lightning_strike",
  "p3_runway_reveal",
  "p3_touchdown",
  "landing",
  "ending",
  "crash",
];

const KINDS: readonly CinematicKind[] = ["state", "in_phase", "event"];

function readDef(value: unknown, where: string): CinematicDef {
  const r = readRecord(value, where);
  const kind = KINDS.find((k) => k === r.kind);
  if (kind === undefined) throw new ContentError(`${where}.kind: unknown ${String(r.kind)}`);
  if (typeof r.skippable !== "boolean") throw new ContentError(`${where}.skippable: boolean`);
  const optional = (v: unknown, key: string) =>
    v === undefined ? null : readInt(v, `${where}.${key}`);
  return {
    kind,
    duration_ms: readInt(r.duration_ms, `${where}.duration_ms`),
    demo_duration_ms: optional(r.demo_duration_ms, "demo_duration_ms"),
    retry_duration_ms: optional(r.retry_duration_ms, "retry_duration_ms"),
    skippable: r.skippable,
  };
}

/** Validates the raw JSON shape. Exported for tests; the app uses `CINEMATICS_FILE`. */
export function parseCinematicsFile(value: unknown): CinematicsFile {
  const r = readRecord(value, "cinematics.json");
  const all = readRecord(r.cinematics, "cinematics");
  const known = new Set<string>(CINEMATIC_IDS);
  for (const key of Object.keys(all)) {
    if (!known.has(key)) throw new ContentError(`cinematics: unknown id ${key}`);
  }
  const entries = CINEMATIC_IDS.map((id) => [id, readDef(all[id], `cinematics.${id}`)] as const);
  const cinematics = Object.fromEntries(entries);
  return {
    lead_ms: readInt(r.lead_ms, "lead_ms"),
    cinematics: {
      prologue: pick(cinematics, "prologue"),
      p1_intro: pick(cinematics, "p1_intro"),
      p1_seat: pick(cinematics, "p1_seat"),
      p1_outro: pick(cinematics, "p1_outro"),
      p2_intro: pick(cinematics, "p2_intro"),
      p2_extinguish: pick(cinematics, "p2_extinguish"),
      p2_outro: pick(cinematics, "p2_outro"),
      p3_intro: pick(cinematics, "p3_intro"),
      lightning_strike: pick(cinematics, "lightning_strike"),
      p3_runway_reveal: pick(cinematics, "p3_runway_reveal"),
      p3_touchdown: pick(cinematics, "p3_touchdown"),
      landing: pick(cinematics, "landing"),
      ending: pick(cinematics, "ending"),
      crash: pick(cinematics, "crash"),
    },
  };
}

function pick(defs: Partial<Record<CinematicId, CinematicDef>>, id: CinematicId): CinematicDef {
  const def = defs[id];
  if (!def) throw new ContentError(`cinematics: missing ${id}`);
  return def;
}

export const CINEMATICS_FILE: CinematicsFile = parseCinematicsFile(rawCinematics);

/** The local duration for a timeline variant (demo / retry), in ms. */
export function cinematicDurationMs(
  id: CinematicId,
  variant: { demo?: boolean; retry?: boolean } = {},
): number {
  const def = CINEMATICS_FILE.cinematics[id];
  if (variant.retry && def.retry_duration_ms !== null) return def.retry_duration_ms;
  if (variant.demo && def.demo_duration_ms !== null) return def.demo_duration_ms;
  return def.duration_ms;
}
