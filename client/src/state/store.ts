// The one zustand store (§F6). `receive(msg)` is a reducer over every S2C message; side
// effects (socket sends, sounds, camera) live in subscribers, so the reducer stays testable.
import { create } from "zustand";
import { DEV } from "../config";
import { browserLang, ERROR_REACTIONS, type StringKey, type StringParams } from "../i18n/strings";
import type {
  ActionResult,
  CinematicMsg,
  DeckMsg,
  DevState,
  Gender,
  GameState,
  Lang,
  ManualCard,
  ObjectState,
  QuickLine,
  Role,
  RoomState,
  S2C,
  Segment,
  StationId,
  Status,
  Toast,
  Welcome,
  World,
} from "../net/protocol";
import { assertNever } from "../util/assertNever";

export interface Me {
  id: string;
  role: Role;
  lang: Lang;
  gender: Gender;
  name: string;
}

export interface FlyerSlice {
  station: StationId | null;
  interactive: Set<string>;
  objects: Record<string, ObjectState>;
  world: World | null;
  quickReplies: QuickLine[] | null;
}

export interface SubtitleItem {
  id: string;
  segments: Segment[];
  speaker_role: Role;
  speaker_name: string;
  level: number;
  lifeline_available: boolean;
  at: number;
}

export interface ToastItem {
  id: number;
  kind: Toast["kind"];
  key: StringKey;
  params: StringParams;
  at: number;
}

export interface TranslationItem {
  text: string;
  openedAt: number; // 0 = collapsed (re-open with "show")
  pending: boolean;
}

/** What the title card shows (§F14.1): a phase title + signal line, or a single string. */
export type TitleCardSpec =
  | { kind: "phase"; phase: 1 | 2 | 3 }
  | {
      kind: "text";
      key: StringKey;
      params?: StringParams;
      lines?: { key: StringKey; params?: StringParams }[];
    };

/**
 * Named 2D cinematic beats (§F14.4, §F12.6, §F15) that timelines switch on and off through
 * `setCue`. Components read their cue as a boolean, so seeking and skipping stay exact.
 */
export type CueName =
  | "radar_boot" // rings draw in, sweep starts
  | "mayday_stamp"
  | "landed_stamp"
  | "manual_open" // cover opens
  | "manual_close"
  | "dots_green" // p1_outro: progress dots turn green
  | "autopilot_banner"
  | "screen_shake" // CSS screen shake (p2_intro)
  | "fire_icon"
  | "smoke_icon"
  | "storm_in"
  | "subtitle_glitch"
  | "lifeline_dots_pop"
  | "glide_draw" // runway icon + glide path draw on
  | "runway_pulse"
  | "radar_flicker"
  | "blip_touchdown"
  | "confetti"
  | "dawn_warm"
  | "blip_spiral"
  | "poof"
  | "fade_cream" // ending: fade to cream
  | "fade_black" // prologue: full-screen black (0.4 s fade in and out)
  | "fade_dim" // prologue: dimmed frame behind the take-control card
  | "tower_window_takeoff" // §F12.7: the Tower window is open on this shot
  | "tower_window_landing"
  | "tower_window_crash";

/** A one-shot full-screen DOM flash (§F10.1 `flash(color, ms)`). */
export interface FlashFx {
  id: number;
  color: string;
  ms: number;
  opacity: number;
}

export interface Settings {
  volume: number;
  muted: boolean;
  sendDevanagari: boolean;
  showDevPanel: boolean;
  /** Free-look mouse sensitivity, degrees per pixel (§F10.3). */
  sensitivity: number;
}

/** The Flyer's free-look mode (§F10.3); see scene/freeLookHead.ts. */
export type LookMode = "off" | "enter" | "look" | "interact";

export interface StoreState {
  // connection
  conn: "connecting" | "open" | "reconnecting";
  welcome: Welcome | null;
  me: Me | null;
  room: RoomState | null;
  /** Latest status from either `room_state` or `game_state`. */
  status: Status;
  fatal: "not_found" | null;
  /** Roles the server refused with `role_taken` for this tab. */
  rejectedRoles: Role[];
  /** The role this tab last sent `join` for (set by the socket). */
  joiningRole: Role | null;
  // game
  game: GameState | null;
  flyer: FlyerSlice;
  /** Incremented on `object_state` with `bounce: true`: the part springs back. */
  bounceTick: Record<string, number>;
  card: ManualCard | null;
  lastResult: (ActionResult & { at: number }) | null;
  successStamp: { action_id: string; row_index: number } | null;
  cinematic: (CinematicMsg & { skipped: boolean }) | null;
  /** True while a local timeline is playing (set by the runner). */
  cinePlaying: boolean;
  skipVotes: Role[];
  retryVotes: Role[];
  crashed: boolean;
  channel: Role | null;
  // talk
  partial: string | null;
  echo: { text: string; at: number } | null;
  subtitles: SubtitleItem[];
  // phase 3
  translations: Record<string, TranslationItem>;
  // end
  deck: DeckMsg | null;
  // misc
  toasts: ToastItem[];
  fx: { id: number; effects: string[] }[];
  dev: DevState | null;
  settings: Settings;
  mic: { permission: "unknown" | "granted" | "denied"; level: number; transmitting: boolean };
  /** UI language before joining (home page switch). */
  uiLang: Lang;
  titleCard: TitleCardSpec | null;
  /** 2D cinematic beats currently on (§F14.4). */
  cues: Partial<Record<CueName, boolean>>;
  /** Latest full-screen flash; Overlays plays it once per id. */
  flashFx: FlashFx | null;
  /** Incremented for every red wrong-action vignette pulse (§F15). */
  redPulseId: number;
  /** Free look (§F10.3): the current mode and how often each mode was entered (HUD hint). */
  look: { mode: LookMode; uses: { look: number; interact: number } };
}

export interface StoreActions {
  receive: (msg: S2C) => void;
  setConn: (conn: StoreState["conn"]) => void;
  setJoiningRole: (role: Role | null) => void;
  setUiLang: (lang: Lang) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setTitleCard: (card: TitleCardSpec | null) => void;
  setCinePlaying: (playing: boolean) => void;
  setCue: (cue: CueName, on: boolean) => void;
  clearCues: () => void;
  flash: (color: string, ms: number, opacity?: number) => void;
  redPulse: () => void;
  setLookMode: (mode: LookMode) => void;
  setMic: (patch: Partial<StoreState["mic"]>) => void;
  /** Phase 3: a lifeline was requested for this utterance (spinner until `translation`). */
  markLifelinePending: (utteranceId: string) => void;
  /** Re-open a revealed translation for free (client-side, §F13). */
  reopenTranslation: (utteranceId: string) => void;
  /** Collapse a revealed translation to its "show" link after TRANSLATION_REVEAL_MS. */
  collapseTranslation: (utteranceId: string) => void;
  pushToast: (key: StringKey, params?: StringParams, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  /** Leaving a room (another room, or home): forget everything except settings + UI language. */
  leaveRoom: () => void;
  /** Test helper: back to the initial state. */
  reset: () => void;
}

export type Store = StoreState & StoreActions;

const SETTINGS_KEY = "wingin:settings";
export const SUBTITLE_KEEP = 10;
const TOAST_KEEP = 5;
const FX_KEEP = 20;

const DEFAULT_SETTINGS: Settings = {
  volume: 0.5,
  muted: false,
  sendDevanagari: false,
  showDevPanel: false,
  sensitivity: 0.15,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
    const p: Record<string, unknown> = { ...parsed };
    return {
      volume:
        typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULT_SETTINGS.volume,
      muted: typeof p.muted === "boolean" ? p.muted : DEFAULT_SETTINGS.muted,
      sendDevanagari:
        typeof p.sendDevanagari === "boolean" ? p.sendDevanagari : DEFAULT_SETTINGS.sendDevanagari,
      showDevPanel:
        typeof p.showDevPanel === "boolean" ? p.showDevPanel : DEFAULT_SETTINGS.showDevPanel,
      sensitivity:
        typeof p.sensitivity === "number" && Number.isFinite(p.sensitivity)
          ? Math.min(0.4, Math.max(0.05, p.sensitivity))
          : DEFAULT_SETTINGS.sensitivity,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage disabled (private mode): settings just don't persist
  }
}

const EMPTY_FLYER: FlyerSlice = {
  station: null,
  interactive: new Set(),
  objects: {},
  world: null,
  quickReplies: null,
};

/** Everything that belongs to one game (cleared when the room drops back to LOBBY). */
function gameReset(): Pick<
  StoreState,
  | "game"
  | "flyer"
  | "bounceTick"
  | "card"
  | "lastResult"
  | "successStamp"
  | "cinematic"
  | "skipVotes"
  | "retryVotes"
  | "crashed"
  | "partial"
  | "echo"
  | "subtitles"
  | "translations"
  | "deck"
  | "titleCard"
  | "cues"
> {
  return {
    game: null,
    flyer: EMPTY_FLYER,
    bounceTick: {},
    card: null,
    lastResult: null,
    successStamp: null,
    cinematic: null,
    skipVotes: [],
    retryVotes: [],
    crashed: false,
    partial: null,
    echo: null,
    subtitles: [],
    translations: {},
    deck: null,
    titleCard: null,
    cues: {},
  };
}

function initialState(): StoreState {
  return {
    conn: "connecting",
    welcome: null,
    me: null,
    room: null,
    status: "LOBBY",
    fatal: null,
    rejectedRoles: [],
    joiningRole: null,
    ...gameReset(),
    cinePlaying: false,
    channel: null,
    toasts: [],
    fx: [],
    dev: null,
    settings: loadSettings(),
    mic: { permission: "unknown", level: 0, transmitting: false },
    uiLang: browserLang(),
    flashFx: null,
    redPulseId: 0,
    look: { mode: "off", uses: { look: 0, interact: 0 } },
  };
}

let nextToastId = 1;
let nextFxId = 1;

function withToast(
  s: StoreState,
  key: StringKey,
  params: StringParams = {},
  kind: Toast["kind"] = "info",
): Pick<StoreState, "toasts"> {
  const item: ToastItem = { id: nextToastId++, kind, key, params, at: Date.now() };
  return { toasts: [...s.toasts, item].slice(-TOAST_KEEP) };
}

function withoutPending(t: Record<string, TranslationItem>): Record<string, TranslationItem> {
  const out: Record<string, TranslationItem> = {};
  for (const [id, item] of Object.entries(t)) if (!item.pending) out[id] = item;
  return out;
}

let nextFlashId = 1;

/** The pure reducer: next partial state for one server message. */
export function reduce(s: StoreState, msg: S2C): Partial<StoreState> {
  switch (msg.type) {
    case "welcome":
      return { welcome: msg, fatal: null };
    case "pong":
      return {}; // the clock is updated by the socket (net/clock.ts)
    case "joined":
      return {
        me: {
          id: msg.player_id,
          role: msg.role,
          lang: msg.lang,
          gender: msg.gender,
          name: msg.name,
        },
        rejectedRoles: [],
        joiningRole: null,
      };
    case "room_state": {
      const mine = s.me ? msg.players.find((p) => p.id === s.me?.id) : undefined;
      const me =
        s.me && mine
          ? { ...s.me, role: mine.role, lang: mine.lang, gender: mine.gender, name: mine.name }
          : s.me;
      const backToLobby = msg.status === "LOBBY" && s.status !== "LOBBY";
      return {
        room: msg,
        me,
        status: msg.status,
        ...(backToLobby ? gameReset() : {}),
      };
    }
    case "game_state": {
      if (msg.status === "LOBBY") return { ...gameReset(), status: "LOBBY" };
      // Derived from the status, so a rejoin snapshot or a PAUSED hop never loses the crash.
      const crashed =
        msg.status === "CRASH" || (msg.status === "PAUSED" && msg.paused_from === "CRASH");
      return {
        game: msg,
        status: msg.status,
        crashed,
        retryVotes: crashed ? s.retryVotes : [],
        deck: msg.status === "DECK" ? s.deck : null,
      };
    }
    case "flyer_view":
      return {
        flyer: {
          station: msg.station,
          interactive: new Set(msg.interactive),
          objects: msg.objects,
          world: msg.world,
          quickReplies: msg.quick_replies,
        },
      };
    case "object_state":
      return {
        flyer: { ...s.flyer, objects: { ...s.flyer.objects, [msg.object_id]: msg.state } },
        bounceTick: msg.bounce
          ? { ...s.bounceTick, [msg.object_id]: (s.bounceTick[msg.object_id] ?? 0) + 1 }
          : s.bounceTick,
      };
    case "manual_card":
      return { card: msg.card };
    case "cinematic":
      return { cinematic: { ...msg, skipped: false }, skipVotes: [] };
    case "cinematic_skip":
      return s.cinematic && s.cinematic.id === msg.id
        ? { cinematic: { ...s.cinematic, skipped: true } }
        : {};
    case "skip_votes":
      return s.cinematic && s.cinematic.id === msg.id ? { skipVotes: msg.roles } : {};
    case "caption_partial":
      return { partial: msg.text };
    case "utterance": {
      const item: SubtitleItem = {
        id: msg.id,
        segments: msg.segments,
        speaker_role: msg.speaker_role,
        speaker_name: msg.speaker_name,
        level: msg.level,
        lifeline_available: msg.lifeline_available,
        at: Date.now(),
      };
      return { subtitles: [...s.subtitles, item].slice(-SUBTITLE_KEEP) };
    }
    case "utterance_echo":
      return { echo: { text: msg.transcript_display, at: Date.now() }, partial: null };
    case "utterance_dropped":
      return { partial: null, ...withToast(s, "toast.didnt_catch", {}, "warning") };
    case "history": {
      const translations: Record<string, TranslationItem> = { ...s.translations };
      for (const u of msg.utterances) {
        if (u.translation !== undefined) {
          translations[u.id] = { text: u.translation, openedAt: 0, pending: false };
        }
      }
      return {
        subtitles: msg.utterances
          .map((u): SubtitleItem => ({
            id: u.id,
            segments: u.segments,
            speaker_role: u.speaker_role,
            speaker_name: u.speaker_name,
            level: u.level,
            lifeline_available: u.lifeline_available,
            at: Date.now(),
          }))
          .slice(-SUBTITLE_KEEP),
        translations,
      };
    }
    case "translation":
      return {
        translations: {
          ...s.translations,
          [msg.utterance_id]: { text: msg.text, openedAt: Date.now(), pending: false },
        },
      };
    case "action_result":
      return {
        lastResult: { ...msg, at: Date.now() },
        successStamp:
          msg.success && msg.row_index !== undefined
            ? { action_id: msg.action_id, row_index: msg.row_index }
            : s.successStamp,
      };
    case "fx":
      return { fx: [...s.fx, { id: nextFxId++, effects: msg.effects }].slice(-FX_KEEP) };
    case "channel":
      return { channel: msg.busy_by };
    case "toast":
      return withToast(s, msg.key, msg.params, msg.kind);
    case "crash":
      return { crashed: true };
    case "retry_votes":
      return { retryVotes: msg.roles };
    case "deck":
      return { deck: msg };
    case "deck_report":
      return s.deck ? { deck: { ...s.deck, report: msg.report, report_pending: false } } : {};
    case "error": {
      const reaction = ERROR_REACTIONS[msg.code];
      switch (reaction.kind) {
        case "toast": {
          // A failed / refused lifeline clears its spinner; the dot is not spent (§F13).
          const clearPending =
            msg.code === "translation_failed" || msg.code === "no_lifelines"
              ? { translations: withoutPending(s.translations) }
              : {};
          return { ...withToast(s, reaction.key, {}, "error"), ...clearPending };
        }
        case "not_found":
          return { fatal: "not_found" };
        case "role_taken":
          return s.joiningRole && !s.rejectedRoles.includes(s.joiningRole)
            ? { rejectedRoles: [...s.rejectedRoles, s.joiningRole], joiningRole: null }
            : { joiningRole: null };
        case "silent":
          return {};
        case "console":
          console.warn(`[wingin] server error ${msg.code}: ${msg.message}`);
          return DEV || s.welcome?.dev_mode
            ? withToast(s, "toast.info", { text: `${msg.code}: ${msg.message}` }, "error")
            : {};
        default:
          return assertNever(reaction);
      }
    }
    case "dev_state":
      return { dev: msg };
    default:
      return assertNever(msg);
  }
}

export const useStore = create<Store>()((set) => ({
  ...initialState(),
  receive: (msg) => set((s) => reduce(s, msg)),
  setConn: (conn) => set({ conn }),
  setJoiningRole: (joiningRole) => set({ joiningRole }),
  setUiLang: (uiLang) => set({ uiLang }),
  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { settings };
    }),
  setTitleCard: (titleCard) => set({ titleCard }),
  setCinePlaying: (cinePlaying) => set({ cinePlaying }),
  setLookMode: (mode) =>
    set((s) => {
      if (s.look.mode === mode) return {};
      const uses = { ...s.look.uses };
      if (mode === "look" || mode === "interact") uses[mode] += 1;
      return { look: { mode, uses } };
    }),
  setCue: (cue, on) =>
    set((s) => (Boolean(s.cues[cue]) === on ? {} : { cues: { ...s.cues, [cue]: on } })),
  clearCues: () => set({ cues: {} }),
  flash: (color, ms, opacity = 1) => set({ flashFx: { id: nextFlashId++, color, ms, opacity } }),
  redPulse: () => set((s) => ({ redPulseId: s.redPulseId + 1 })),
  setMic: (patch) => set((s) => ({ mic: { ...s.mic, ...patch } })),
  markLifelinePending: (id) =>
    set((s) => ({
      translations: { ...s.translations, [id]: { text: "", openedAt: 0, pending: true } },
    })),
  reopenTranslation: (id) =>
    set((s) => {
      const item = s.translations[id];
      return item && !item.pending
        ? { translations: { ...s.translations, [id]: { ...item, openedAt: Date.now() } } }
        : {};
    }),
  collapseTranslation: (id) =>
    set((s) => {
      const item = s.translations[id];
      return item && item.openedAt !== 0
        ? { translations: { ...s.translations, [id]: { ...item, openedAt: 0 } } }
        : {};
    }),
  pushToast: (key, params, kind) => set((s) => withToast(s, key, params, kind)),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  leaveRoom: () => set((s) => ({ ...initialState(), settings: s.settings, uiLang: s.uiLang })),
  reset: () => set(initialState()),
}));
