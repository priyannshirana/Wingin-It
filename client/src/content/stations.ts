// Typed access to content/stations.json (§B5.1) plus the grid → panel-face helpers (§F9.3).
// The JSON is validated once at module load, so a malformed layout fails loudly in dev and in
// tests instead of rendering a broken cockpit. This file and content/cinematics.ts are the only
// places allowed to import from the content folder alias (privacy rule §A2).
import rawStations from "@content/stations.json";
import type { ObjectState, PartType, PhaseNo, StationId } from "../net/protocol";
import { ContentError, readArray, readInt, readRecord, readString } from "./read";

export type PaletteName = "red" | "green" | "blue" | "yellow" | "white" | "grey";

export interface Localized {
  en: string;
  hi: string;
}

export interface ControlDef {
  id: string;
  type: PartType;
  label: string | null; // digits / arrows only (3D text can't shape Devanagari)
  color: PaletteName;
  row: number; // 0 = far/top edge of the panel
  col: number;
  span: number; // columns covered (default 1)
  rowspan: number; // rows covered (default 1)
  size: "normal" | "big";
  style: "mushroom" | "guarded" | null;
  default: ObjectState;
  manual_name: Localized;
}

/** Something a step can ask about (`find_out`); `members` get the "?" on the manual drawing. */
export interface StationPart {
  id: string;
  members: string[];
  name: Localized;
}

export interface StationDef {
  id: StationId;
  phase: PhaseNo;
  name: Localized;
  grid: { cols: number; rows: number };
  controls: ControlDef[];
  parts: StationPart[];
}

export interface StationsFile {
  version: number;
  palette: Record<PaletteName, string>;
  stations: StationDef[];
}

export const PART_TYPES: readonly PartType[] = [
  "PushButton",
  "ToggleSwitch",
  "PullHandle",
  "UpDownLever",
  "NotchLever",
  "Lamp",
  "FuelGauge",
  "Screen",
];

/** The `ObjectState.kind` each part type carries (§A6). */
export const STATE_KIND_FOR_PART: Record<PartType, ObjectState["kind"]> = {
  PushButton: "button",
  ToggleSwitch: "toggle",
  PullHandle: "handle",
  UpDownLever: "lever",
  NotchLever: "notch",
  Lamp: "lamp",
  FuelGauge: "gauge",
  Screen: "screen",
};

const PALETTE_NAMES: readonly PaletteName[] = ["red", "green", "blue", "yellow", "white", "grey"];
const STATION_IDS: readonly StationId[] = ["overhead", "pedestal", "front"];
const LAMP_COLORS = ["red", "green", "blue", "yellow"] as const;

function oneOf<const T extends string>(options: readonly T[], value: unknown, where: string): T {
  const hit = options.find((o) => o === value);
  if (hit === undefined) {
    throw new ContentError(`${where}: expected one of ${options.join("|")}, got ${String(value)}`);
  }
  return hit;
}

function readLocalized(value: unknown, where: string): Localized {
  const r = readRecord(value, where);
  return { en: readString(r.en, `${where}.en`), hi: readString(r.hi, `${where}.hi`) };
}

function readPhase(value: unknown, where: string): PhaseNo {
  if (value === 1 || value === 2 || value === 3) return value;
  throw new ContentError(`${where}: expected phase 1|2|3, got ${String(value)}`);
}

export function parseObjectState(value: unknown, where: string): ObjectState {
  const r = readRecord(value, where);
  const kind = r.kind;
  switch (kind) {
    case "button":
      return { kind };
    case "gauge":
      return { kind };
    case "toggle":
      return { kind, value: oneOf(["on", "off"], r.value, `${where}.value`) };
    case "handle":
      return { kind, value: oneOf(["in", "out"], r.value, `${where}.value`) };
    case "lever":
      return { kind, value: oneOf(["up", "down"], r.value, `${where}.value`) };
    case "notch": {
      const v = r.value;
      if (v === 0 || v === 1 || v === 2) return { kind, value: v };
      throw new ContentError(`${where}.value: expected notch 0|1|2, got ${String(v)}`);
    }
    case "lamp": {
      const color = r.color === null ? null : oneOf(LAMP_COLORS, r.color, `${where}.color`);
      if (typeof r.blinking !== "boolean" || typeof r.attention !== "boolean") {
        throw new ContentError(`${where}: lamp needs boolean blinking and attention`);
      }
      return { kind, color, blinking: r.blinking, attention: r.attention };
    }
    case "screen":
      if (typeof r.on !== "boolean") throw new ContentError(`${where}.on: expected boolean`);
      return { kind, on: r.on };
    default:
      throw new ContentError(`${where}.kind: unknown object state kind ${String(kind)}`);
  }
}

function readControl(value: unknown, where: string, grid: StationDef["grid"]): ControlDef {
  const r = readRecord(value, where);
  const id = readString(r.id, `${where}.id`);
  const at = `${where} (${id})`;
  const type = oneOf(PART_TYPES, r.type, `${at}.type`);
  const label = r.label === null ? null : readString(r.label, `${at}.label`);
  const span = r.span === undefined ? 1 : readInt(r.span, `${at}.span`);
  const rowspan = r.rowspan === undefined ? 1 : readInt(r.rowspan, `${at}.rowspan`);
  const row = readInt(r.row, `${at}.row`);
  const col = readInt(r.col, `${at}.col`);
  if (span < 1 || rowspan < 1 || row < 0 || col < 0) {
    throw new ContentError(`${at}: row/col must be >= 0 and span/rowspan >= 1`);
  }
  if (col + span > grid.cols || row + rowspan > grid.rows) {
    throw new ContentError(`${at}: cell (${row},${col}) span ${span}x${rowspan} leaves the grid`);
  }
  const state = parseObjectState(r.default, `${at}.default`);
  if (state.kind !== STATE_KIND_FOR_PART[type]) {
    throw new ContentError(`${at}: ${type} needs a "${STATE_KIND_FOR_PART[type]}" default`);
  }
  return {
    id,
    type,
    label,
    color: oneOf(PALETTE_NAMES, r.color, `${at}.color`),
    row,
    col,
    span,
    rowspan,
    size: r.size === undefined ? "normal" : oneOf(["normal", "big"], r.size, `${at}.size`),
    style: r.style === undefined ? null : oneOf(["mushroom", "guarded"], r.style, `${at}.style`),
    default: state,
    manual_name: readLocalized(r.manual_name, `${at}.manual_name`),
  };
}

function readStation(value: unknown, where: string): StationDef {
  const r = readRecord(value, where);
  const id = oneOf(STATION_IDS, r.id, `${where}.id`);
  const at = `stations.${id}`;
  const g = readRecord(r.grid, `${at}.grid`);
  const grid = {
    cols: readInt(g.cols, `${at}.grid.cols`),
    rows: readInt(g.rows, `${at}.grid.rows`),
  };
  const controls = readArray(r.controls, `${at}.controls`).map((c, i) =>
    readControl(c, `${at}.controls[${i}]`, grid),
  );
  const ids = new Set(controls.map((c) => c.id));
  const parts = readArray(r.parts ?? [], `${at}.parts`).map((p, i): StationPart => {
    const pr = readRecord(p, `${at}.parts[${i}]`);
    const members = readArray(pr.members, `${at}.parts[${i}].members`).map((m, j) =>
      readString(m, `${at}.parts[${i}].members[${j}]`),
    );
    for (const m of members) {
      if (!ids.has(m)) throw new ContentError(`${at}.parts[${i}]: unknown member ${m}`);
    }
    return {
      id: readString(pr.id, `${at}.parts[${i}].id`),
      members,
      name: readLocalized(pr.name, `${at}.parts[${i}].name`),
    };
  });
  return {
    id,
    phase: readPhase(r.phase, `${at}.phase`),
    name: readLocalized(r.name, `${at}.name`),
    grid,
    controls,
    parts,
  };
}

/** Validates the raw JSON shape. Exported for tests; the app uses `STATIONS_FILE`. */
export function parseStationsFile(value: unknown): StationsFile {
  const r = readRecord(value, "stations.json");
  const p = readRecord(r.palette, "palette");
  const palette: Record<PaletteName, string> = {
    red: readString(p.red, "palette.red"),
    green: readString(p.green, "palette.green"),
    blue: readString(p.blue, "palette.blue"),
    yellow: readString(p.yellow, "palette.yellow"),
    white: readString(p.white, "palette.white"),
    grey: readString(p.grey, "palette.grey"),
  };
  const stations = readArray(r.stations, "stations").map((s, i) =>
    readStation(s, `stations[${i}]`),
  );
  for (const id of STATION_IDS) {
    if (!stations.some((s) => s.id === id)) throw new ContentError(`stations: missing ${id}`);
  }
  const seen = new Set<string>();
  for (const c of stations.flatMap((s) => s.controls)) {
    if (seen.has(c.id)) throw new ContentError(`stations: duplicate control id ${c.id}`);
    seen.add(c.id);
  }
  return { version: readInt(r.version, "version"), palette, stations };
}

export const STATIONS_FILE: StationsFile = parseStationsFile(rawStations);
export const PALETTE: Readonly<Record<PaletteName, string>> = STATIONS_FILE.palette;

export function getStation(id: StationId): StationDef {
  const station = STATIONS_FILE.stations.find((s) => s.id === id);
  if (!station) throw new ContentError(`stations: missing ${id}`); // unreachable after parsing
  return station;
}

const CONTROL_INDEX: ReadonlyMap<string, { station: StationDef; control: ControlDef }> = new Map(
  STATIONS_FILE.stations.flatMap((station) =>
    station.controls.map((control) => [control.id, { station, control }] as const),
  ),
);

export function findControl(
  objectId: string,
): { station: StationDef; control: ControlDef } | undefined {
  return CONTROL_INDEX.get(objectId);
}

// ---------------------------------------------------------------------------
// §F9.3 Station placement: each station's local XY plane is its panel face (+Z = face normal).
// ---------------------------------------------------------------------------

export type Vec3 = readonly [number, number, number];

export interface StationFace {
  center: Vec3; // face center in cockpit space (m)
  size: readonly [number, number]; // face width × height (m)
  target: Vec3; // the face normal points here (`group.lookAt(target)`)
}

export const STATION_FACES: Readonly<Record<StationId, StationFace>> = {
  overhead: { center: [0, 1.95, -0.25], size: [1.2, 0.6], target: [0.3, 0.9, 0.7] },
  pedestal: { center: [0, 0.78, -0.45], size: [0.5, 0.7], target: [0.3, 1.9, 0.2] },
  front: { center: [0, 0.975, -0.95], size: [2.0, 0.35], target: [0.3, 1.25, 0.8] },
};

/** Cell pitch = face size / grid (overhead 0.171 × 0.15, pedestal 0.125 × 0.175, front 0.25 × 0.117). */
export function cellPitch(station: StationDef): { x: number; y: number } {
  const [w, h] = STATION_FACES[station.id].size;
  return { x: w / station.grid.cols, y: h / station.grid.rows };
}

/** Grid cell → local position on the panel face (§F9.3). Row 0 is the far/top edge. */
export function controlLocalPosition(
  station: StationDef,
  control: Pick<ControlDef, "row" | "col" | "span" | "rowspan">,
): { x: number; y: number; z: number } {
  const pitch = cellPitch(station);
  const { cols, rows } = station.grid;
  return {
    x: (control.col + control.span / 2 - cols / 2) * pitch.x,
    y: (rows / 2 - control.row - control.rowspan / 2) * pitch.y,
    z: 0,
  };
}
