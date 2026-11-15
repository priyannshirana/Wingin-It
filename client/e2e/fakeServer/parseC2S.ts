// Checks a client → server text frame against §A7 field by field. The fake server answers
// anything else with `error bad_message`, so a malformed client message fails the specs.
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

const field = (v: object, key: string): unknown => Reflect.get(v, key);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.find((x) => x === v);
const optional = <T>(v: unknown, pick: (v: unknown) => T | undefined): T | undefined | null =>
  v === undefined ? undefined : (pick(v) ?? null);

function record(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = x;
  return out;
}

/** The typed message, or a reason string when the frame breaks §A5/§A7. */
export function parseC2S(raw: string): C2S | string {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return "not JSON";
  }
  if (typeof v !== "object" || v === null) return "not an object";
  if (raw.length > 8192) return "text frame over 8 KB";
  const type = field(v, "type");
  switch (type) {
    case "ping": {
      const client_ms = field(v, "client_ms");
      return typeof client_ms === "number" ? { type, client_ms } : "ping.client_ms";
    }
    case "join": {
      const name = field(v, "name");
      const role = oneOf(ROLES, field(v, "role"));
      const lang = oneOf(LANGS, field(v, "lang"));
      const gender = oneOf(GENDERS, field(v, "gender"));
      const token = field(v, "token");
      if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 16)
        return "join.name must be 1–16 characters";
      if (!role || !lang || !gender) return "join needs role, lang and gender";
      if (token !== undefined && typeof token !== "string") return "join.token";
      return token === undefined
        ? { type, name, role, lang, gender }
        : { type, name, role, lang, gender, token };
    }
    case "update_player": {
      const name = field(v, "name");
      const role = optional(field(v, "role"), (x) => oneOf(ROLES, x));
      const lang = optional(field(v, "lang"), (x) => oneOf(LANGS, x));
      const gender = optional(field(v, "gender"), (x) => oneOf(GENDERS, x));
      if (role === null || lang === null || gender === null) return "update_player field";
      if (name !== undefined && typeof name !== "string") return "update_player.name";
      return {
        type,
        ...(name !== undefined ? { name } : {}),
        ...(role ? { role } : {}),
        ...(lang ? { lang } : {}),
        ...(gender ? { gender } : {}),
      };
    }
    case "ready": {
      const ready = field(v, "ready");
      if (ready !== undefined && typeof ready !== "boolean") return "ready.ready";
      return ready === undefined ? { type } : { type, ready };
    }
    case "ptt_start":
    case "ptt_end":
    case "skip_cinematic":
    case "retry":
    case "play_again":
    case "swap_roles":
      return { type };
    case "say_text": {
      const text = field(v, "text");
      const lang = optional(field(v, "lang"), (x) => oneOf(LANGS, x));
      if (typeof text !== "string" || text.length > 300) return "say_text.text (max 300)";
      if (lang === null) return "say_text.lang";
      return lang ? { type, text, lang } : { type, text };
    }
    case "interact": {
      const object_id = field(v, "object_id");
      const verb = oneOf(VERBS, field(v, "verb"));
      if (typeof object_id !== "string" || !verb) return "interact needs object_id and verb";
      return { type, object_id, verb };
    }
    case "lifeline": {
      const utterance_id = field(v, "utterance_id");
      return typeof utterance_id === "string" ? { type, utterance_id } : "lifeline.utterance_id";
    }
    case "presenter": {
      const cmd = field(v, "cmd");
      return cmd === "next_action" || cmd === "next_phase" ? { type, cmd } : "presenter.cmd";
    }
    case "dev": {
      const cmd = oneOf(DEV_CMDS, field(v, "cmd"));
      const argsRaw = field(v, "args");
      const args = argsRaw === undefined ? undefined : record(argsRaw);
      if (!cmd) return "dev.cmd";
      if (argsRaw !== undefined && !args) return "dev.args must be an object";
      return args ? { type, cmd, args } : { type, cmd };
    }
    default:
      return `unknown type ${JSON.stringify(type)}`;
  }
}
