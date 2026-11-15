// §A2 rule 2 and the §A9 "who receives what" table as one pure check per server frame. Used by
// the wire tap (real server), by the fake server on its own output, and by the checker tests.
import type { Role } from "../../src/net/protocol";

/** Server frames that only a joined, role-bearing player may ever get. */
const PRIVATE_TYPES = new Set(["flyer_view", "object_state", "manual_card"]);
/** Cinematic params the Tower must never see (§A10). */
export const SECRET_PARAMS = ["fire_side", "stopped_side", "damaged_side"];
/** Keys that would leak the Flyer's hidden world to the Tower, anywhere in a frame. */
const TOWER_FORBIDDEN_KEYS = [...SECRET_PARAMS, "FIRE_SIDE"];
/** Keys that would leak the Tower's manual to the Flyer, anywhere in a frame. */
const FLYER_FORBIDDEN_KEYS = ["quick_say", "rows", "find_out", "known_from"];
/** `fx` effect prefixes per role (§A9, §A12). */
const FLYER_FX = ["sfx:", "sfx_stop:", "fx:", "both:"];
const TOWER_FX = ["tower:", "both:"];

const field = (v: unknown, key: string): unknown =>
  typeof v === "object" && v !== null ? Reflect.get(v, key) : undefined;

/** Whether `key` appears as an object key anywhere inside `v`. */
export function hasKey(v: unknown, key: string): boolean {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return v.some((x) => hasKey(x, key));
  return Object.entries(v).some(([k, x]) => k === key || hasKey(x, key));
}

function effectsOf(v: unknown): string[] {
  const effects = field(v, "effects");
  return Array.isArray(effects) ? effects.filter((e): e is string => typeof e === "string") : [];
}

/**
 * What is wrong with one server → client frame delivered to `role` (null = a socket that has
 * not joined). `devMode` = the room's `welcome.dev_mode`. Empty = fine.
 */
export function frameViolations(
  role: Role | null,
  type: string,
  data: unknown,
  devMode: boolean,
): string[] {
  const out: string[] = [];
  const who = role ?? "an unjoined socket";
  if (type === "dev_state" && !devMode)
    out.push(`${who} received dev_state although welcome.dev_mode is not true`);
  if (role === null && PRIVATE_TYPES.has(type)) out.push(`${who} received ${type}`);

  if (role === "tower") {
    if (type === "flyer_view" || type === "object_state") out.push(`tower received ${type}`);
    // dev_state breaks privacy on purpose (§A2 rule 2); nothing else may carry rolled values.
    if (type !== "dev_state")
      for (const k of TOWER_FORBIDDEN_KEYS)
        if (hasKey(data, k)) out.push(`tower received ${type} carrying "${k}"`);
    if (type === "cinematic") {
      const params = field(data, "params");
      for (const k of SECRET_PARAMS)
        if (typeof params === "object" && params !== null && k in params)
          out.push(`tower cinematic carries ${k}`);
    }
    if (type === "fx")
      for (const e of effectsOf(data))
        if (!TOWER_FX.some((p) => e.startsWith(p))) out.push(`tower received fx ${e}`);
  }

  if (role === "flyer") {
    if (type === "manual_card") out.push("flyer received manual_card");
    for (const k of FLYER_FORBIDDEN_KEYS)
      if (hasKey(data, k)) out.push(`flyer received ${type} carrying "${k}"`);
    if (type === "action_result")
      for (const k of ["row_index", "used"])
        if (typeof data === "object" && data !== null && k in data)
          out.push(`flyer action_result carries ${k}`);
    if (type === "fx")
      for (const e of effectsOf(data))
        if (!FLYER_FX.some((p) => e.startsWith(p))) out.push(`flyer received fx ${e}`);
  }
  return out;
}
