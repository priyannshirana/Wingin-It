// A strict validator for client → server text frames (§A5, §A7, §A13, §A17). It is the judge the
// e2e specs use on what the client really sent, so it rejects instead of repairing: unknown
// keys, wrong types, out-of-range values, empty strings where the spec requires content, and
// frames over 8 KB (counted in bytes). A valid result is the message exactly as it was sent.
import type { C2S, DevCmd, Gender, Lang, Role, Verb } from "../../src/net/protocol";

const ROLES: readonly Role[] = ["flyer", "tower"];
const LANGS: readonly Lang[] = ["en", "hi"];
const GENDERS: readonly Gender[] = ["male", "female"];
const VERBS: readonly Verb[] = ["press", "toggle", "pull", "move_down", "move_up"];
const DEV_CMDS: readonly DevCmd[] = [
  "complete_action",
  "fail_action",
  "goto_phase",
  "set_seed",
  "add_fuel",
  "bots",
  "force",
  "skip_cinematic",
];

/** §A5: max text frame 8 KB. */
export const MAX_TEXT_FRAME_BYTES = 8192;
/** §A5: `say_text.text` max 300 characters. */
export const MAX_SAY_TEXT = 300;

const field = (v: object, key: string): unknown => Reflect.get(v, key);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.find((x) => x === v);

function record(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = x;
  return out;
}

/** The first key of `obj` that is not in `allowed`, if any. */
function extraKey(obj: object, allowed: readonly string[]): string | undefined {
  return Object.keys(obj).find((k) => !allowed.includes(k));
}

/** `join.name` / `update_player.name`: 1–16 characters after trimming (§A5). */
function validName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const n = Array.from(name.trim()).length;
  return n >= 1 && n <= 16;
}

/** The args object of a dev command, or a reason string. */
function devArgs(cmd: DevCmd, raw: unknown): Record<string, unknown> | undefined | string {
  const args = raw === undefined ? undefined : record(raw);
  if (raw !== undefined && !args) return "dev.args must be an object";
  const keys = args ? Object.keys(args) : [];
  const only = (allowed: readonly string[]): string | undefined => {
    const bad = args ? extraKey(args, allowed) : undefined;
    return bad === undefined ? undefined : `dev ${cmd}: unknown arg "${bad}"`;
  };
  switch (cmd) {
    case "complete_action":
    case "fail_action":
    case "skip_cinematic":
      return keys.length > 0 ? `dev ${cmd} takes no args` : args;
    case "goto_phase": {
      const p = args?.phase;
      if (p !== 1 && p !== 2 && p !== 3) return "dev goto_phase: args.phase must be 1, 2 or 3";
      return only(["phase"]) ?? args;
    }
    case "set_seed": {
      const seed = args?.seed;
      if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0)
        return "dev set_seed: args.seed must be a non-negative integer";
      return only(["seed"]) ?? args;
    }
    case "add_fuel": {
      const s = args?.seconds;
      if (args && "seconds" in args && (typeof s !== "number" || !Number.isFinite(s)))
        return "dev add_fuel: args.seconds must be a number";
      return only(["seconds"]) ?? args;
    }
    case "bots": {
      for (const k of ["flyer", "tower"])
        if (args && k in args && typeof args[k] !== "boolean")
          return `dev bots: args.${k} must be a boolean`;
      return only(["flyer", "tower"]) ?? args;
    }
    case "force": {
      const v = args?.var;
      const value = args?.value;
      if (typeof v !== "string" || v === "" || typeof value !== "string" || value === "")
        return "dev force: args.var and args.value must be non-empty strings";
      return only(["var", "value"]) ?? args;
    }
    default:
      return assertNever(cmd);
  }
}

/** The typed message, or a reason string when the frame breaks §A5/§A7. */
export function parseC2S(raw: string): C2S | string {
  if (new TextEncoder().encode(raw).byteLength > MAX_TEXT_FRAME_BYTES)
    return "text frame over 8 KB";
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return "not JSON";
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "not an object";
  const type = field(v, "type");
  const keys = (...allowed: string[]): string | undefined => {
    const bad = extraKey(v, ["type", ...allowed]);
    return bad === undefined ? undefined : `${String(type)}: unknown field "${bad}"`;
  };
  switch (type) {
    case "ping": {
      const client_ms = field(v, "client_ms");
      if (typeof client_ms !== "number" || !Number.isFinite(client_ms)) return "ping.client_ms";
      return keys("client_ms") ?? { type, client_ms };
    }
    case "join": {
      const name = field(v, "name");
      const role = oneOf(ROLES, field(v, "role"));
      const lang = oneOf(LANGS, field(v, "lang"));
      const gender = oneOf(GENDERS, field(v, "gender"));
      const token = field(v, "token");
      if (!validName(name)) return "join.name must be 1–16 characters";
      if (!role || !lang || !gender) return "join needs role, lang and gender";
      if (token !== undefined && (typeof token !== "string" || token === ""))
        return "join.token must be a non-empty string when present";
      const bad = keys("name", "role", "lang", "gender", "token");
      if (bad) return bad;
      return token === undefined
        ? { type, name, role, lang, gender }
        : { type, name, role, lang, gender, token };
    }
    case "update_player": {
      const name = field(v, "name");
      const roleRaw = field(v, "role");
      const langRaw = field(v, "lang");
      const genderRaw = field(v, "gender");
      const role = oneOf(ROLES, roleRaw);
      const lang = oneOf(LANGS, langRaw);
      const gender = oneOf(GENDERS, genderRaw);
      if (roleRaw !== undefined && !role) return "update_player.role";
      if (langRaw !== undefined && !lang) return "update_player.lang";
      if (genderRaw !== undefined && !gender) return "update_player.gender";
      if (name !== undefined && !validName(name))
        return "update_player.name must be 1–16 characters";
      return (
        keys("name", "role", "lang", "gender") ?? {
          type,
          ...(name !== undefined ? { name } : {}),
          ...(role ? { role } : {}),
          ...(lang ? { lang } : {}),
          ...(gender ? { gender } : {}),
        }
      );
    }
    case "ready": {
      const ready = field(v, "ready");
      if (ready !== undefined && typeof ready !== "boolean") return "ready.ready";
      return keys("ready") ?? (ready === undefined ? { type } : { type, ready });
    }
    case "ptt_start":
    case "ptt_end":
    case "skip_cinematic":
    case "retry":
    case "play_again":
    case "swap_roles":
      return keys() ?? { type };
    case "say_text": {
      const text = field(v, "text");
      const langRaw = field(v, "lang");
      const lang = oneOf(LANGS, langRaw);
      if (typeof text !== "string" || text.trim() === "") return "say_text.text must not be empty";
      if (Array.from(text).length > MAX_SAY_TEXT) return "say_text.text over 300 characters";
      if (langRaw !== undefined && !lang) return "say_text.lang";
      return keys("text", "lang") ?? (lang ? { type, text, lang } : { type, text });
    }
    case "interact": {
      const object_id = field(v, "object_id");
      const verb = oneOf(VERBS, field(v, "verb"));
      if (typeof object_id !== "string" || object_id === "" || !verb)
        return "interact needs object_id and verb";
      return keys("object_id", "verb") ?? { type, object_id, verb };
    }
    case "lifeline": {
      const utterance_id = field(v, "utterance_id");
      if (typeof utterance_id !== "string" || utterance_id === "") return "lifeline.utterance_id";
      return keys("utterance_id") ?? { type, utterance_id };
    }
    case "presenter": {
      const cmd = field(v, "cmd");
      if (cmd !== "next_action" && cmd !== "next_phase") return "presenter.cmd";
      return keys("cmd") ?? { type, cmd };
    }
    case "dev": {
      const cmd = oneOf(DEV_CMDS, field(v, "cmd"));
      if (!cmd) return "dev.cmd";
      const bad = keys("cmd", "args");
      if (bad) return bad;
      const args = devArgs(cmd, field(v, "args"));
      if (typeof args === "string") return args;
      return args ? { type, cmd, args } : { type, cmd };
    }
    default:
      return `unknown type ${JSON.stringify(type)}`;
  }
}

function assertNever(x: never): never {
  throw new Error(`unhandled ${JSON.stringify(x)}`);
}
