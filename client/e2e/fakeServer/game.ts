// One fake game room (e2e only): a small, faithful slice of the Part A server, so the client can
// be driven through the flow specs with correctly shaped messages, role privacy (§A2 rule 2, §A9),
// the judge of BACKEND_SPEC §B9.3, fuel (§B10), crash and retry (§B8.2), lifelines (§B14.2), deck
// votes (§B8.5) and Latin-only subtitles (§B11).
//
// It is NOT the game. See client/INTEGRATION.md ("Not modelled by the fake") for what is missing:
// the script is 2 to 4 short actions per phase, glosses are "level 0/1 = all, else none",
// translations are a tagged echo of the subtitle, the deck is canned. The real server is the
// contract's judge; this only speaks its language.
import type {
  C2S,
  CinematicId,
  CinematicMsg,
  DevCmd,
  ErrorCode,
  GameState,
  Gender,
  Lang,
  ObjectState,
  PartType,
  PhaseNo,
  PlayerPublic,
  QuickLine,
  Radar,
  Role,
  RoomState,
  S2C,
  StationId,
  Status,
  UtteranceMsg,
  Verb,
} from "../../src/net/protocol";
import {
  actionResult,
  channel,
  cinematic,
  cinematicSkip,
  clickableIds,
  defaultObjects,
  deck,
  devState,
  errorMsg,
  flyerView,
  gameState,
  history,
  joined,
  manualCard,
  manualCardMsg,
  objectState,
  plain,
  pong,
  radar,
  roomState,
  segmentsFor,
  skipVotes,
  STATION_IDS,
  STATION_OF,
  STATIONS,
  type StationControl,
  targetOf,
  toast,
  translation,
  utterance,
  utteranceEcho,
  welcome,
  worldFor,
} from "./fixtures";
import { parseC2S } from "./parseC2S";
import { frameViolations, SECRET_PARAMS } from "./privacy";
import { subtitleText } from "./subtitles";

/** §A14 constants the fake honours. */
export const PRESS_DEBOUNCE_MS = 1200;
export const NEXT_ACTION_DELAY_MS = 1500;
export const WRONG_PENALTY_S = 10;
/** Fuel per phase (§A14: 150 / 150 / 180 s). */
export const FUEL_S: Record<PhaseNo, number> = { 1: 150, 2: 150, 3: 180 };
const LIFELINE_WINDOW = 3;

export interface FakeOptions {
  /** `welcome.mock_speech` / `room_state.mock_speech` (default true). */
  mock?: boolean;
  /** `welcome.dev_mode` (default true): dev commands, dev_state, say_text. */
  dev?: boolean;
  /** How long the fake bots wait before acting, ms (default 700). */
  botDelayMs?: number;
  /** Gap after a success before the next action, ms (default 1500, NEXT_ACTION_DELAY_MS). */
  nextActionMs?: number;
}

interface FakeStep {
  control: StationControl;
  verb: Verb;
  /** Presses / notches the step needs inside the debounce window. */
  count: number;
  /** Target of a toggle. */
  value?: "on" | "off";
}

interface FakeAction {
  id: string;
  phase: PhaseNo;
  steps: FakeStep[];
  ordered: boolean;
  /** A lamp lit (red, blinking) while the action is active. */
  lamp: string | null;
  /** The Tower's quick-say line: English, Hindi in Latin (hi_roman) and Devanagari. */
  say: { en: string; hi: string; deva: string };
  /** An `event` cinematic that runs at the start of the action (the action waits for it). */
  event?: CinematicId;
  /** An `in_phase` cinematic that runs after the action succeeds. */
  after?: CinematicId;
}

function control(id: string): StationControl {
  for (const list of Object.values(STATIONS)) {
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`fake script: ${id} is not in stations.json`);
}

/** The verb that completes a step on this part type (§A6). */
function verbFor(type: PartType): Verb {
  switch (type) {
    case "PushButton":
      return "press";
    case "ToggleSwitch":
      return "toggle";
    case "PullHandle":
      return "pull";
    case "UpDownLever":
    case "NotchLever":
      return "move_down";
    case "Lamp":
    case "FuelGauge":
    case "Screen":
      throw new Error(`fake script: ${type} is not clickable`);
    default:
      return assertNever(type);
  }
}

const step = (id: string, count = 1, value?: "on" | "off"): FakeStep => {
  const c = control(id);
  return { control: c, verb: verbFor(c.type), count, ...(value ? { value } : {}) };
};

const act = (
  id: string,
  phase: PhaseNo,
  steps: FakeStep[],
  lamp: string | null,
  say: FakeAction["say"],
  extra: Pick<FakeAction, "event" | "after"> & { ordered?: boolean } = {},
): FakeAction => ({
  id,
  phase,
  steps,
  ordered: extra.ordered ?? true,
  lamp,
  say,
  ...(extra.event ? { event: extra.event } : {}),
  ...(extra.after ? { after: extra.after } : {}),
});

/**
 * The fake script. Phase 1: a press, a pull, then an ordered two-button action that ends with
 * `p1_seat`. Phase 2: a pull, then a button pressed twice, then `p2_extinguish`. Phase 3: a
 * toggle, a press (then `p3_runway_reveal`), a lever that opens with `lightning_strike`, and a
 * pull that ends with `p3_touchdown`.
 */
export const SCRIPT: Record<PhaseNo, FakeAction[]> = {
  1: [
    act("P1_A1", 1, [step("OH_BTN_1")], "OH_MASTER_LAMP", {
      en: "Press button one",
      hi: "Ek number button dabao",
      deva: "एक नंबर बटन दबाओ",
    }),
    act("P1_A2", 1, [step("OH_HANDLE_3")], null, {
      en: "Pull lever three",
      hi: "Teen number lever kheencho",
      deva: "तीन नंबर लीवर खींचो",
    }),
    act(
      "P1_A3",
      1,
      [step("OH_BTN_2"), step("OH_BTN_3")],
      null,
      {
        en: "Press button two, then button three",
        hi: "Pehle do number, phir teen number button dabao",
        deva: "पहले दो नंबर, फिर तीन नंबर बटन दबाओ",
      },
      { after: "p1_seat" },
    ),
  ],
  2: [
    act("P2_B1", 2, [step("PD_FIRE_HANDLE_R")], "PD_FIRE_LAMP_R", {
      en: "Pull the red lever",
      hi: "Laal lever kheencho",
      deva: "लाल लीवर खींचो",
    }),
    act(
      "P2_B2",
      2,
      [step("PD_EXT_BTN", 2)],
      null,
      {
        en: "Press the fire button twice",
        hi: "Aag button do baar dabao",
        deva: "आग बटन दो बार दबाओ",
      },
      { after: "p2_extinguish" },
    ),
  ],
  3: [
    act("P3_C1", 3, [step("FP_LAND_SW", 1, "on")], null, {
      en: "Switch on the yellow switch",
      hi: "Peela switch chalu karo",
      deva: "पीला स्विच चालू करो",
    }),
    act(
      "P3_C2",
      3,
      [step("FP_BTN_3")],
      "FP_WARN_LAMP",
      {
        en: "Press button three",
        hi: "Teen number button dabao",
        deva: "तीन नंबर बटन दबाओ",
      },
      { after: "p3_runway_reveal" },
    ),
    act(
      "P3_C3",
      3,
      [step("FP_LEVER_2")],
      null,
      {
        en: "Move lever two down",
        hi: "Do number lever neeche karo",
        deva: "दो नंबर लीवर नीचे करो",
      },
      { event: "lightning_strike" },
    ),
    act(
      "P3_C4",
      3,
      [step("FP_BRAKE")],
      null,
      { en: "Pull the brake", hi: "Brake kheencho", deva: "ब्रेक खींचो" },
      { after: "p3_touchdown" },
    ),
  ],
};

const OUTRO: Record<PhaseNo, CinematicId> = { 1: "p1_outro", 2: "p2_outro", 3: "landing" };
const INTRO: Record<PhaseNo, CinematicId> = { 1: "p1_intro", 2: "p2_intro", 3: "p3_intro" };
const NEXT_PHASE: Record<PhaseNo, PhaseNo | null> = { 1: 2, 2: 3, 3: null };

const CONTROL_BY_ID = new Map<string, { control: StationControl; station: StationId }>();
for (const station of STATION_IDS)
  for (const c of STATIONS[station]) CONTROL_BY_ID.set(c.id, { control: c, station });

/** §A6 verb ↔ part type. */
function verbOk(type: PartType, verb: Verb): boolean {
  switch (type) {
    case "PushButton":
      return verb === "press";
    case "ToggleSwitch":
      return verb === "toggle";
    case "PullHandle":
      return verb === "pull";
    case "UpDownLever":
    case "NotchLever":
      return verb === "move_down" || verb === "move_up";
    case "Lamp":
    case "FuelGauge":
    case "Screen":
      return false;
    default:
      return assertNever(type);
  }
}

interface Slot {
  id: string;
  token: string;
  name: string;
  role: Role;
  lang: Lang;
  gender: Gender;
  ready: boolean;
  conn: Conn | null;
}

/** The part of Playwright's `WebSocketRoute` the fake uses (the checker tests script a stand-in). */
export interface FakeSocket {
  onMessage(handler: (raw: string | Buffer) => void): void;
  onClose(handler: () => void): void;
  send(message: string): void;
}

interface Conn {
  id: number;
  ws: FakeSocket;
  slot: Slot | null;
}

interface StoredUtterance {
  msg: UtteranceMsg;
  /** The translation into the listener's language, in the listener's script (§B14.1). */
  translated: string;
  /** Roles that already spent a lifeline on this line (a repeat request is free, §B14.2). */
  lifelinedBy: Set<Role>;
}

interface Pending {
  step: number;
  object: string;
  verb: Verb;
  count: number;
  startState: ObjectState | undefined;
  /** Guards the debounce timer: only the last press's timer may finalize. */
  token: number;
}

/** The running action (B9.2 ActionRun). */
interface Run {
  action: FakeAction;
  done: boolean[];
  pending: Pending | null;
}

type DeckVote = "play_again" | "swap_roles";

export interface LoggedC2S {
  /** Which socket (1, 2, … in open order). */
  conn: number;
  role: Role | null;
  msg: C2S;
  at: number;
}
export interface LoggedS2C {
  conn: number;
  role: Role | null;
  msg: S2C;
  at: number;
}

const other = (r: Role): Role => (r === "flyer" ? "tower" : "flyer");

export class FakeGame {
  readonly code: string;
  private readonly opts: Required<FakeOptions>;
  /** Every parsed client → server message, in order. */
  readonly received: LoggedC2S[] = [];
  /** Every server → client message, in order. */
  readonly sent: LoggedS2C[] = [];
  /** Frames the client sent that break §A5/§A7 (they also get `error bad_message`). */
  readonly badFrames: string[] = [];
  /** Role-privacy breaches the fake caught itself about to make (must stay empty). */
  readonly violations: string[] = [];

  private conns = new Set<Conn>();
  private connSeq = 0;
  private slots: Slot[] = [];
  private nextId = 1;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private fuelTimer: ReturnType<typeof setInterval> | null = null;
  /** Bumped whenever the game freezes or restarts: older guarded timers become no-ops. */
  private gen = 0;
  private pendTok = 0;

  private status: Status = "LOBBY";
  private pausedFrom: Status | null = null;
  private phase: 0 | PhaseNo = 0;
  private actionIndex = -1;
  private completed = 0;
  private active = false;
  private run: Run | null = null;
  /** The next action (or the outro) waiting for its gap, so a resume can restart the gap. */
  private nextTarget: number | "outro" | null = null;
  private fuel = FUEL_S[1];
  /** The fuel clock is running (PLAYING); it only drains while no cinematic runs either. */
  private fuelOn = false;
  private attempts: Record<PhaseNo, number> = { 1: 1, 2: 1, 3: 1 };
  private lifelines: Record<Role, number> = { flyer: 3, tower: 3 };
  private objects: Record<string, ObjectState> = defaultObjects();
  private interactive: string[] = [];
  private lastWrong: { id: string; count: number } | null = null;
  private seed = 0;
  private forced: Record<string, string> = {};
  private bots = { flyer: false, tower: false };
  private cin: {
    msg: CinematicMsg;
    then: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private votes = new Set<Role>();
  private retryVotes = new Set<Role>();
  /** Each player's one current deck vote (§B8.5). */
  private deckVotes = new Map<Role, DeckVote>();
  private utterances: StoredUtterance[] = [];
  private busy: Role | null = null;

  constructor(code: string, opts: FakeOptions = {}) {
    this.code = code;
    this.opts = {
      mock: opts.mock ?? true,
      dev: opts.dev ?? true,
      botDelayMs: opts.botDelayMs ?? 700,
      nextActionMs: opts.nextActionMs ?? NEXT_ACTION_DELAY_MS,
    };
  }

  // -------------------------------------------------------------------------
  // Introspection for specs
  // -------------------------------------------------------------------------

  /** Client messages of one type (optionally from one role). */
  sentBy<T extends C2S["type"]>(type: T, role?: Role): Extract<C2S, { type: T }>[] {
    const out: Extract<C2S, { type: T }>[] = [];
    for (const r of this.received) {
      if (role && r.role !== role) continue;
      const m = r.msg;
      if (isType(m, type)) out.push(m);
    }
    return out;
  }

  /** Server messages of one type delivered to one role. */
  deliveredTo<T extends S2C["type"]>(type: T, role: Role): Extract<S2C, { type: T }>[] {
    const out: Extract<S2C, { type: T }>[] = [];
    for (const r of this.sent) {
      if (r.role !== role) continue;
      const m = r.msg;
      if (isType(m, type)) out.push(m);
    }
    return out;
  }

  /** `GET /api/rooms/{code}` (§A4). */
  info(): { exists: boolean; status: Status; roles_taken: Role[]; demo: boolean } {
    return {
      exists: true,
      status: this.status,
      roles_taken: this.slots.map((s) => s.role),
      demo: false,
    };
  }

  get currentAction(): string | null {
    return this.currentDef()?.id ?? null;
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.stopFuel();
  }

  // -------------------------------------------------------------------------
  // Sockets
  // -------------------------------------------------------------------------

  attach(ws: FakeSocket): void {
    const conn: Conn = { id: ++this.connSeq, ws, slot: null };
    this.conns.add(conn);
    ws.onMessage((raw) => {
      if (typeof raw !== "string") return; // audio frames: mock rooms have no PTT
      const parsed = parseC2S(raw);
      if (typeof parsed === "string") {
        this.badFrames.push(`${parsed}: ${raw}`);
        this.to(conn, errorMsg("bad_message", parsed));
        return;
      }
      const role = conn.slot?.role ?? (parsed.type === "join" ? parsed.role : null);
      this.received.push({ conn: conn.id, role, msg: parsed, at: Date.now() });
      this.handle(conn, parsed);
    });
    ws.onClose(() => this.onClose(conn));
    this.to(
      conn,
      welcome({ room_code: this.code, mock_speech: this.opts.mock, dev_mode: this.opts.dev }),
    );
    this.to(conn, this.roomState());
  }

  private onClose(conn: Conn): void {
    this.conns.delete(conn);
    const slot = conn.slot;
    if (!slot || slot.conn !== conn) return;
    slot.conn = null;
    if (this.status === "LOBBY" || this.status === "DECK") {
      this.broadcastRoom();
      return;
    }
    if (this.status !== "PAUSED") {
      // §B8.4: freeze every timer, drop partial press counts, release the radio.
      this.pausedFrom = this.status;
      this.status = "PAUSED";
      this.gen += 1;
      if (this.run) this.run.pending = null;
      if (this.busy === slot.role) {
        this.busy = null;
        this.toAll(channel(null));
      }
    }
    this.broadcastRoom();
    this.broadcastGame();
    this.toRole(other(slot.role), toast("toast.partner_left", { name: slot.name }, "warning"));
  }

  private to(conn: Conn, msg: S2C): void {
    const role = conn.slot?.role ?? null;
    const bad = frameViolations(role, msg.type, msg, this.opts.dev);
    if (bad.length > 0) {
      this.violations.push(...bad);
      return;
    }
    this.sent.push({ conn: conn.id, role, msg, at: Date.now() });
    conn.ws.send(JSON.stringify(msg));
  }

  private toRole(role: Role, msg: S2C): void {
    const conn = this.slotOf(role)?.conn;
    if (conn) this.to(conn, msg);
  }

  private toAll(msg: S2C): void {
    for (const conn of this.conns) this.to(conn, msg);
  }

  private slotOf(role: Role): Slot | undefined {
    return this.slots.find((s) => s.role === role);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** A timer that dies when the game pauses, crashes or restarts (§B8.4: `gen` freezes timers). */
  private laterG(ms: number, fn: () => void): void {
    const gen = this.gen;
    this.later(ms, () => {
      if (gen === this.gen) fn();
    });
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  private players(): PlayerPublic[] {
    return this.slots.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      lang: s.lang,
      gender: s.gender,
      ready: s.ready,
      connected: s.conn !== null,
      is_bot: false,
    }));
  }

  private roomState(): RoomState {
    const both = this.slotOf("flyer") && this.slotOf("tower");
    const same = both && this.slotOf("flyer")?.lang === this.slotOf("tower")?.lang;
    const ready = this.slots.length === 2 && this.slots.every((s) => s.ready);
    return roomState({
      code: this.code,
      status: this.status,
      mock_speech: this.opts.mock,
      players: this.players(),
      can_start: Boolean(both) && !same && ready,
      block_reason: !both ? "missing_player" : same ? "same_language" : !ready ? "not_ready" : null,
      // §B8.5: the roles whose current vote is play_again.
      play_again_votes: [...this.deckVotes].filter(([, v]) => v === "play_again").map(([r]) => r),
    });
  }

  /** §B8.3 radar table (the client animates the in-cinematic changes; this is the end state). */
  private radarNow(total: number): Radar {
    const progress = total === 0 ? 0 : this.completed / total;
    const n = this.phase;
    const landed = this.status === "ENDING" || this.status === "DECK";
    if (landed || (n === 3 && this.status === "PHASE_OUTRO"))
      return radar({ blip: "green", runway: true, landed: true, progress });
    if (n === 1) {
      if (this.status === "PHASE_OUTRO") return radar({ blip: "green", progress });
      return this.completed === 0
        ? radar({ blip: "red", icon: "mayday", progress })
        : radar({ blip: "amber", progress });
    }
    if (n === 2) {
      if (this.status === "PHASE_OUTRO") return radar({ blip: "amber", storm: true, progress });
      return this.completed < total
        ? radar({ blip: "red", icon: "fire", progress })
        : radar({ blip: "amber", icon: "smoke", progress });
    }
    if (n === 3)
      return radar({ blip: "amber", storm: true, runway: true, glide_path: true, progress });
    return radar({ blip: "green" });
  }

  private draining(): boolean {
    return this.fuelOn && this.status === "PLAYING" && this.cin === null;
  }

  private game(): GameState {
    const action = this.currentDef();
    const total = this.phase === 0 ? 0 : SCRIPT[this.phase].length;
    const phaseKey: PhaseNo = this.phase === 0 ? 1 : this.phase;
    return gameState({
      status: this.status,
      paused_from: this.status === "PAUSED" ? this.pausedFrom : null,
      phase: this.phase,
      signal_level: this.phase,
      action_index: action ? this.actionIndex : -1,
      completed: this.completed,
      total_actions: total,
      action_id: action?.id ?? null,
      action_active: this.active,
      input_locked: this.cin !== null,
      fuel_s: Math.round(this.fuel * 10) / 10,
      fuel_max_s: FUEL_S[phaseKey],
      fuel_draining: this.draining(),
      lifelines: { ...this.lifelines },
      lifelines_enabled: this.phase === 3 && this.status === "PLAYING",
      attempt: this.attempts[phaseKey],
      radar: this.radarNow(total),
    });
  }

  private broadcastRoom(): void {
    this.toAll(this.roomState());
  }

  private broadcastGame(): void {
    this.toAll(this.game());
    this.broadcastDev();
  }

  private broadcastDev(): void {
    if (!this.opts.dev) return;
    const action = this.currentDef();
    const run = this.run;
    const expected =
      action && run && this.status === "PLAYING"
        ? action.steps.map((s, i) => ({
            object: s.control.id,
            verb: s.verb,
            ...(s.value ? { value: s.value } : {}),
            ...(s.count > 1 ? { count: s.count } : {}),
            done: run.done[i] === true,
          }))
        : [];
    this.toAll(
      devState({
        room: this.code,
        status: this.status,
        phase: this.phase,
        action_id: action?.id ?? null,
        seed: this.seed,
        vars: this.phase >= 2 ? { FIRE_SIDE: "RIGHT" } : {},
        forced: { ...this.forced },
        expected,
        unordered: Boolean(run && !run.action.ordered && run.action.steps.length > 1),
        pending: run?.pending ? { object: run.pending.object, count: run.pending.count } : null,
        fuel_s: Math.round(this.fuel * 10) / 10,
        bots: { ...this.bots },
      }),
    );
  }

  private flyerQuickReplies(): QuickLine[] {
    // §B (flyer_examples): the Flyer's own language, text = hi_roman | en, alt_text = Devanagari.
    return this.slotOf("flyer")?.lang === "hi"
      ? [
          { label: "Haan", text: "haan", alt_text: "हाँ" },
          { label: "Laal", text: "laal", alt_text: "लाल" },
        ]
      : [
          { label: "Yes", text: "yes" },
          { label: "Red", text: "red" },
        ];
  }

  private sendFlyerView(): void {
    const station = this.phase === 0 ? null : STATION_OF[this.phase];
    const quick: QuickLine[] | null =
      this.opts.mock && this.currentDef() && this.active ? this.flyerQuickReplies() : null;
    this.toRole(
      "flyer",
      flyerView({
        station: this.status === "PLAYING" || this.status === "PAUSED" ? station : null,
        interactive: this.interactive,
        objects: { ...this.objects },
        world: this.worldNow(),
        quick_replies: quick,
      }),
    );
  }

  private worldNow() {
    if (this.status === "ENDING" || this.status === "DECK") return worldFor(4);
    return worldFor(this.phase);
  }

  private sendCard(lastWrong = false): void {
    const action = this.currentDef();
    const tower = this.slotOf("tower");
    if (!tower) return;
    if (!action || (this.status !== "PLAYING" && this.status !== "PAUSED")) {
      this.toRole("tower", manualCardMsg(null));
      return;
    }
    const total = SCRIPT[action.phase].length;
    // §B (quick_say): text = hi_roman (Hindi Tower) or en; alt_text = the Devanagari line.
    const say = action.say[tower.lang];
    const quick: QuickLine = {
      label: say,
      text: say,
      ...(tower.lang === "hi" ? { alt_text: action.say.deva } : {}),
    };
    this.toRole(
      "tower",
      manualCardMsg(
        manualCard({
          action_id: action.id,
          index: this.actionIndex,
          total,
          phase: action.phase,
          lang: tower.lang,
          steps: action.steps,
          ordered: action.ordered,
          ...(this.opts.mock ? { quick } : {}),
          lastWrong:
            lastWrong && this.lastWrong
              ? { label: [plain(this.lastWrong.id)], count: this.lastWrong.count }
              : null,
        }),
      ),
    );
  }

  /** The rejoin snapshot (§A5): game_state, flyer_view | manual_card, history, cinematic, channel, deck. */
  private snapshot(conn: Conn): void {
    const slot = conn.slot;
    if (!slot) return;
    this.to(conn, this.game());
    if (slot.role === "flyer") this.sendFlyerView();
    else this.sendCard(this.lastWrong !== null);
    this.to(
      conn,
      history(
        this.utterances
          .filter((u) => u.msg.speaker_role !== slot.role)
          .slice(-5)
          .map((u) =>
            u.lifelinedBy.has(slot.role) ? { ...u.msg, translation: u.translated } : u.msg,
          ),
      ),
    );
    if (this.cin) this.to(conn, this.cinFor(slot.role, this.cin.msg));
    if (this.status === "CRASH" && this.phase !== 0) {
      this.to(conn, { type: "crash", phase: this.phase });
      this.to(conn, { type: "retry_votes", roles: [...this.retryVotes] });
    }
    this.to(conn, channel(this.busy));
    if (this.status === "DECK") this.sendDeck(slot);
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  private handle(conn: Conn, msg: C2S): void {
    if (msg.type === "ping") {
      this.to(conn, pong(msg.client_ms));
      return;
    }
    if (msg.type === "join") {
      this.join(conn, msg);
      return;
    }
    const slot = conn.slot;
    if (!slot) {
      this.to(conn, errorMsg("not_joined"));
      return;
    }
    switch (msg.type) {
      case "update_player":
        if (this.status !== "LOBBY") return this.to(conn, errorMsg("not_allowed_now"));
        if (msg.role && msg.role !== slot.role && this.slotOf(msg.role))
          return this.to(conn, errorMsg("role_taken"));
        Object.assign(slot, {
          ...(msg.name ? { name: msg.name.trim() } : {}),
          ...(msg.role ? { role: msg.role } : {}),
          ...(msg.lang ? { lang: msg.lang } : {}),
          ...(msg.gender ? { gender: msg.gender } : {}),
        });
        this.broadcastRoom();
        return;
      case "ready":
        if (this.status !== "LOBBY") return this.to(conn, errorMsg("not_allowed_now"));
        slot.ready = msg.ready ?? true;
        this.broadcastRoom();
        if (this.roomState().can_start) this.startGame();
        return;
      case "ptt_start":
        if (this.busy && this.busy !== slot.role) return this.to(conn, errorMsg("channel_busy"));
        this.busy = slot.role;
        this.toAll(channel(this.busy));
        return;
      case "ptt_end":
        if (this.busy === slot.role) {
          this.busy = null;
          this.toAll(channel(null));
        }
        return;
      case "say_text":
        if (!this.opts.mock && !this.opts.dev) return this.to(conn, errorMsg("mock_only"));
        this.say(slot.role, msg.text, msg.lang ?? slot.lang);
        return;
      case "interact": {
        if (slot.role !== "flyer") return this.to(conn, errorMsg("not_your_role"));
        const err = this.interact(msg.object_id, msg.verb);
        if (err) this.to(conn, errorMsg(err));
        return;
      }
      case "lifeline":
        this.lifeline(conn, slot, msg.utterance_id);
        return;
      case "skip_cinematic":
        this.vote(slot.role);
        return;
      case "retry":
        if (this.status !== "CRASH") return this.to(conn, errorMsg("not_allowed_now"));
        this.retryVote(slot.role);
        return;
      case "play_again":
      case "swap_roles":
        if (this.status !== "DECK") return this.to(conn, errorMsg("not_allowed_now"));
        // §B8.5: one current vote per player; a later vote replaces the earlier one.
        this.deckVotes.set(slot.role, msg.type);
        this.broadcastRoom();
        this.checkDeckVotes();
        return;
      case "presenter":
        return this.to(conn, errorMsg("demo_only"));
      case "dev":
        if (!this.opts.dev) return this.to(conn, errorMsg("dev_disabled"));
        this.dev(msg.cmd, msg.args ?? {});
        return;
      default:
        return assertNever(msg);
    }
  }

  private join(conn: Conn, msg: Extract<C2S, { type: "join" }>): void {
    const byToken = msg.token ? this.slots.find((s) => s.token === msg.token) : undefined;
    let slot = byToken;
    if (!slot) {
      const holder = this.slotOf(msg.role);
      if (holder && holder.conn) return this.to(conn, errorMsg("role_taken"));
      if (holder) {
        // Dev Mode: a token-less join for a disconnected role takes it over (§A5).
        if (!this.opts.dev) return this.to(conn, errorMsg("role_taken"));
        slot = holder;
      } else {
        if (this.slots.length >= 2) return this.to(conn, errorMsg("room_full"));
        slot = {
          id: `p${this.nextId++}`,
          token: `tok-${this.code}-${this.nextId}-${Math.random().toString(36).slice(2, 8)}`,
          name: msg.name.trim(),
          role: msg.role,
          lang: msg.lang,
          gender: msg.gender,
          ready: false,
          conn: null,
        };
        this.slots.push(slot);
      }
    }
    if (slot.conn && slot.conn !== conn) slot.conn.slot = null;
    slot.conn = conn;
    conn.slot = slot;
    const me = this.players().find((p) => p.id === slot.id);
    if (me) this.to(conn, joined(me, slot.token));
    this.broadcastRoom();
    if (this.status === "PAUSED" && this.slots.every((s) => s.conn)) this.resume(slot);
    if (this.status !== "LOBBY") this.snapshot(conn);
  }

  private resume(back: Slot): void {
    this.status = this.pausedFrom ?? "PLAYING";
    this.pausedFrom = null;
    this.toRole(other(back.role), toast("toast.partner_back", { name: back.name }, "info"));
    if (this.cin) {
      // §B8.4: a cinematic running at the disconnect is completed instantly on resume.
      const { then, timer } = this.cin;
      clearTimeout(timer);
      this.timers.delete(timer);
      this.cin = null;
      then();
    } else if (this.status === "PLAYING") {
      if (this.active) this.botsAct();
      // A pending gap restarts in full.
      else if (this.nextTarget !== null) this.scheduleNext(this.nextTarget, this.opts.nextActionMs);
    }
    this.broadcastGame();
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------

  private startGame(): void {
    this.deckVotes.clear();
    this.utterances = [];
    this.lifelines = { flyer: 3, tower: 3 };
    this.attempts = { 1: 1, 2: 1, 3: 1 };
    this.objects = defaultObjects();
    this.phase = 0;
    this.run = null;
    this.fuelOn = false;
    this.status = "PROLOGUE";
    this.broadcastRoom();
    this.broadcastGame();
    this.play("prologue", {}, () => this.enterIntro(1));
  }

  private enterIntro(n: PhaseNo, retry = false): void {
    this.gen += 1;
    this.stopFuel();
    this.active = false;
    this.run = null;
    this.nextTarget = null;
    this.actionIndex = -1;
    this.completed = 0;
    this.phase = n;
    this.status = "PHASE_INTRO";
    this.toRole("tower", manualCardMsg(null));
    this.broadcastGame();
    const params: CinematicMsg["params"] = { retry };
    if (n === 2) params.fire_side = "right";
    if (n === 3) params.damaged_side = "right";
    this.play(INTRO[n], params, () => this.enterPlaying(n));
  }

  private enterPlaying(n: PhaseNo): void {
    this.status = "PLAYING";
    this.phase = n;
    this.fuel = FUEL_S[n];
    this.lastWrong = null;
    this.lifelines = { flyer: 3, tower: 3 };
    for (const c of STATIONS[STATION_OF[n]]) this.objects[c.id] = c.default;
    this.interactive = [];
    this.sendFlyerView();
    this.startFuel();
    this.broadcastGame();
    this.scheduleNext(0, 150);
  }

  private currentDef(): FakeAction | undefined {
    if (this.phase === 0 || this.actionIndex < 0) return undefined;
    return SCRIPT[this.phase][this.actionIndex];
  }

  /** Activate action `target` (or enter the outro) after `delay` ms; frozen by pause/crash. */
  private scheduleNext(target: number | "outro", delay: number): void {
    this.nextTarget = target;
    const phase = this.phase;
    this.laterG(delay, () => {
      if (this.phase !== phase || this.status !== "PLAYING") return;
      this.nextTarget = null;
      if (target === "outro") this.enterOutro(phase === 0 ? 1 : phase);
      else this.activate(target);
    });
  }

  private activate(i: number): void {
    if (this.phase === 0 || this.status !== "PLAYING") return;
    const action = SCRIPT[this.phase][i];
    if (!action) return;
    this.actionIndex = i;
    this.run = { action, done: action.steps.map(() => false), pending: null };
    this.active = false;
    this.lastWrong = null;
    const open = (): void => {
      this.active = true;
      if (action.lamp) {
        const lamp: ObjectState = { kind: "lamp", color: "red", blinking: true, attention: true };
        this.objects[action.lamp] = lamp;
        this.toRole("flyer", objectState(action.lamp, lamp, false));
      }
      this.interactive = clickableIds(STATION_OF[action.phase]);
      this.sendFlyerView();
      this.sendCard();
      this.broadcastGame();
      this.botsAct();
    };
    if (action.event) {
      // §B8.2: an `event` cinematic opens the action; it stays inactive until the event ends.
      this.interactive = [];
      this.sendFlyerView();
      this.sendCard();
      this.broadcastGame();
      this.play(action.event, {}, open);
    } else {
      open();
    }
  }

  private botsAct(): void {
    const action = this.currentDef();
    const run = this.run;
    if (!action || !run || !this.active) return;
    const id = action.id;
    if (this.bots.tower) {
      this.laterG(this.opts.botDelayMs, () => {
        const lang = this.slotOf("tower")?.lang ?? "hi";
        if (this.currentDef()?.id === id && this.active) this.say("tower", action.say[lang], lang);
      });
    }
    if (this.bots.flyer) {
      // The bot Flyer clicks like a player: every step in order, presses 250 ms apart.
      let at = this.opts.botDelayMs * 2;
      action.steps.forEach((s, i) => {
        if (run.done[i]) return;
        for (let k = 0; k < s.count; k++) {
          this.laterG(at, () => {
            if (this.currentDef()?.id === id && this.active && !this.cin)
              this.interact(s.control.id, s.verb);
          });
          at += 250;
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // The judge (BACKEND_SPEC §B9.3)
  // -------------------------------------------------------------------------

  /** A control's bounce: state unchanged, the client's optimistic motion springs back. */
  private bounce(objectId: string): void {
    const state = this.objects[objectId];
    if (state) this.toRole("flyer", objectState(objectId, state, true));
  }

  /** Returns the error code to send, or null. Ignored clicks answer with a bounce and no penalty. */
  private interact(objectId: string, verb: Verb): ErrorCode | null {
    const found = CONTROL_BY_ID.get(objectId);
    if (!found) return "bad_message";
    return this.interactChecked(found, objectId, verb);
  }

  private interactChecked(
    found: { control: StationControl; station: StationId },
    objectId: string,
    verb: Verb,
  ): ErrorCode | null {
    if (isFixed(found.control.type)) return "bad_message";
    const run = this.run;
    // Inactive, the 1.5 s gap, a cinematic, another station: ignored without penalty (§B9.3).
    if (
      this.status !== "PLAYING" ||
      this.cin ||
      !run ||
      !this.active ||
      this.phase === 0 ||
      found.station !== STATION_OF[this.phase]
    ) {
      this.bounce(objectId);
      return null;
    }
    if (!verbOk(found.control.type, verb)) return "bad_message";

    // A pending count on a different object finalizes first; the new click is still judged.
    if (run.pending && run.pending.object !== objectId) this.finalizePending(run);
    if (this.run !== run || !this.active) return null; // the finalize crashed the plane

    const steps = run.action.steps;
    const open = steps.map((_, i) => i).filter((i) => !run.done[i]);
    const candidates = run.action.ordered ? open.slice(0, 1) : open;
    const match = candidates.find((i) => steps[i]?.control.id === objectId);
    const target = match === undefined ? undefined : steps[match];
    if (match === undefined || !target) {
      const reason = open.some((i) => steps[i]?.control.id === objectId)
        ? "wrong_order"
        : "wrong_object";
      this.wrong(reason, objectId, verb, 1);
      return null;
    }

    const state = this.objects[objectId];
    switch (found.control.type) {
      case "PushButton":
        this.toRole("flyer", objectState(objectId, { kind: "button" }, false));
        this.count(run, match, objectId, verb);
        return null;
      case "NotchLever": {
        if (verb === "move_up") return this.wrong("wrong_direction", objectId, verb, 1);
        if (state?.kind !== "notch" || state.value === 2)
          return this.wrong("wrong_count", objectId, verb, 1);
        const next: ObjectState = { kind: "notch", value: state.value === 0 ? 1 : 2 };
        this.count(run, match, objectId, verb);
        this.objects[objectId] = next;
        this.toRole("flyer", objectState(objectId, next, false)); // visible immediately
        return null;
      }
      case "ToggleSwitch": {
        const next: ObjectState = {
          kind: "toggle",
          value: state?.kind === "toggle" && state.value === "on" ? "off" : "on",
        };
        if (next.value === target.value) {
          this.objects[objectId] = next;
          this.toRole("flyer", objectState(objectId, next, false));
          this.stepDone(run, match);
        } else {
          this.wrong("wrong_direction", objectId, verb, 1);
        }
        return null;
      }
      case "PullHandle": {
        if (state?.kind === "handle" && state.value === "out") {
          this.bounce(objectId); // already pulled: no penalty
          return null;
        }
        const next: ObjectState = { kind: "handle", value: "out" };
        this.objects[objectId] = next;
        this.toRole("flyer", objectState(objectId, next, false));
        this.stepDone(run, match);
        return null;
      }
      case "UpDownLever": {
        if (
          verb === "move_down" &&
          state?.kind === "lever" &&
          state.value === "up" &&
          target.verb === "move_down"
        ) {
          const next: ObjectState = { kind: "lever", value: "down" };
          this.objects[objectId] = next;
          this.toRole("flyer", objectState(objectId, next, false));
          this.stepDone(run, match);
        } else {
          this.wrong("wrong_direction", objectId, verb, 1);
        }
        return null;
      }
      default:
        return "bad_message";
    }
  }

  /** Count one press / notch; the count finalizes PRESS_DEBOUNCE_MS after the last one. */
  private count(run: Run, match: number, objectId: string, verb: Verb): void {
    const token = ++this.pendTok;
    if (run.pending && run.pending.step === match) {
      run.pending.count += 1;
      run.pending.token = token;
    } else {
      run.pending = {
        step: match,
        object: objectId,
        verb,
        count: 1,
        startState: this.objects[objectId],
        token,
      };
    }
    this.broadcastDev();
    this.laterG(PRESS_DEBOUNCE_MS, () => {
      if (this.run === run && run.pending?.token === token) this.finalizePending(run);
    });
  }

  /** §B9.3 finalize_pending: equal to the step's count = done, otherwise a wrong action. */
  private finalizePending(run: Run): boolean {
    const p = run.pending;
    if (!p) return true;
    run.pending = null;
    const expected = run.action.steps[p.step];
    if (expected && p.count === expected.count) {
      this.stepDone(run, p.step);
      return true;
    }
    if (p.startState && p.startState.kind === "notch") this.objects[p.object] = p.startState;
    this.wrong("wrong_count", p.object, p.verb, p.count);
    return false;
  }

  private stepDone(run: Run, i: number): void {
    run.done[i] = true;
    run.pending = null;
    if (run.done.every(Boolean)) this.succeed(null);
    else this.broadcastDev();
  }

  private succeed(reason: "dev" | null): void {
    const run = this.run;
    if (!run) return;
    const action = run.action;
    this.active = false;
    this.completed += 1;
    const base = actionResult({
      action_id: action.id,
      success: true,
      reason,
      completed_steps: action.steps.length,
      total_steps: action.steps.length,
    });
    this.toRole("flyer", base);
    this.toRole("tower", { ...base, row_index: 0 });
    if (action.lamp) {
      const off: ObjectState = { kind: "lamp", color: null, blinking: false, attention: false };
      this.objects[action.lamp] = off;
      this.toRole("flyer", objectState(action.lamp, off, false));
    }
    this.toRole("flyer", { type: "fx", effects: ["sfx:chime_soft"] });
    this.interactive = [];
    this.sendFlyerView();
    this.broadcastGame();
    const target: number | "outro" =
      this.actionIndex + 1 < SCRIPT[action.phase].length ? this.actionIndex + 1 : "outro";
    if (action.after) {
      // §B8.2: the in-phase cinematic is the pause; the next action follows 500 ms after it.
      const params: CinematicMsg["params"] =
        action.after === "p2_extinguish" ? { fire_side: "right" } : {};
      this.nextTarget = target;
      this.play(action.after, params, () => {
        this.sendFlyerView();
        this.scheduleNext(target, 500);
      });
    } else {
      this.scheduleNext(target, this.opts.nextActionMs);
    }
  }

  /** §B9.3 wrong(): -10 s, bounce, `action_result` (the Tower also gets `used`), card, state. */
  private wrong(
    reason: "wrong_object" | "wrong_count" | "wrong_direction" | "wrong_order",
    objectId: string,
    verb: Verb,
    count: number,
  ): null {
    const run = this.run;
    if (!run) return null;
    run.pending = null;
    this.lastWrong = { id: objectId, count };
    this.fuel = Math.max(0, this.fuel - WRONG_PENALTY_S);
    this.bounce(objectId);
    const base = actionResult({
      action_id: run.action.id,
      success: false,
      reason,
      fuel_delta: -WRONG_PENALTY_S,
      completed_steps: run.done.filter(Boolean).length,
      total_steps: run.action.steps.length,
    });
    this.toRole("flyer", base);
    this.toRole("tower", {
      ...base,
      used: { object_id: objectId, label: [plain(objectId)], verb, count },
    });
    this.sendCard(true);
    this.broadcastGame();
    if (this.fuel <= 0) this.onFuelEmpty();
    return null;
  }

  private enterOutro(n: PhaseNo): void {
    this.gen += 1;
    this.stopFuel();
    this.status = "PHASE_OUTRO";
    this.active = false;
    this.actionIndex = -1;
    this.nextTarget = null;
    this.toRole("tower", manualCardMsg(null));
    this.broadcastGame();
    const params: CinematicMsg["params"] = {};
    if (n === 2) params.stopped_side = "right";
    if (n === 3) params.damaged_side = "right";
    const next = NEXT_PHASE[n];
    this.play(OUTRO[n], params, () => (next ? this.enterIntro(next) : this.enterEnding()));
  }

  private enterEnding(): void {
    this.status = "ENDING";
    this.broadcastGame();
    this.play("ending", { fuel_left_s: Math.round(this.fuel), total_time_s: 180 }, () => {
      this.status = "DECK";
      this.broadcastRoom();
      this.broadcastGame();
      for (const s of this.slots) this.sendDeck(s);
    });
  }

  /** §B8.2 on_fuel_empty: CRASH, `crash`, the 5 s `crash` cinematic, then wait for Retry. */
  private onFuelEmpty(): void {
    if (this.status !== "PLAYING" || this.phase === 0) return;
    this.gen += 1;
    this.stopFuel();
    this.active = false;
    this.interactive = [];
    this.nextTarget = null;
    this.status = "CRASH";
    this.retryVotes.clear();
    this.toRole("tower", manualCardMsg(null));
    this.toAll({ type: "crash", phase: this.phase });
    this.sendFlyerView();
    this.play("crash", {}, () => undefined); // no automatic end: the state stays CRASH
    this.toAll({ type: "retry_votes", roles: [] });
    // Bots vote at once (after a beat, so the cinematic starts first).
    this.laterG(this.opts.botDelayMs, () => {
      if (this.bots.flyer) this.retryVote("flyer");
      if (this.bots.tower) this.retryVote("tower");
    });
  }

  private retryVote(role: Role): void {
    if (this.status !== "CRASH" || this.phase === 0) return;
    this.retryVotes.add(role);
    this.toAll({ type: "retry_votes", roles: [...this.retryVotes] });
    if (this.retryVotes.size < 2) return;
    // §B8.2: attempts[phase] += 1, lifelines reset, back to PHASE_INTRO(n) with retry:true.
    const n = this.phase;
    this.retryVotes.clear();
    if (this.cin) {
      clearTimeout(this.cin.timer);
      this.timers.delete(this.cin.timer);
      this.cin = null;
    }
    this.attempts[n] += 1;
    this.enterIntro(n, true);
  }

  private sendDeck(slot: Slot): void {
    const partner = this.slotOf(other(slot.role));
    if (!partner) return;
    this.toRole(
      slot.role,
      deck(slot.lang, { name: partner.name, lang: partner.lang, gender: partner.gender }),
    );
  }

  /** §B8.5: act only when both players' current votes are the same. */
  private checkDeckVotes(): void {
    if (this.deckVotes.size < 2) return;
    const [a, b] = [...this.deckVotes.values()];
    if (a !== b) return; // mismatched votes just wait
    if (a === "play_again") {
      this.seed += 1;
      this.startGame();
      return;
    }
    // swap_roles: roles swapped, languages and genders kept, not ready → LOBBY. `joined` re-keys.
    this.deckVotes.clear();
    for (const s of this.slots) {
      s.role = other(s.role);
      s.ready = false;
    }
    this.status = "LOBBY";
    this.phase = 0;
    this.actionIndex = -1;
    this.run = null;
    for (const s of this.slots) {
      const p = this.players().find((x) => x.id === s.id);
      if (s.conn && p) this.to(s.conn, joined(p, s.token));
    }
    this.broadcastRoom();
  }

  // -------------------------------------------------------------------------
  // Cinematics
  // -------------------------------------------------------------------------

  private cinFor(role: Role, msg: CinematicMsg): CinematicMsg {
    if (role === "flyer") return msg;
    const params: CinematicMsg["params"] = {};
    for (const [k, v] of Object.entries(msg.params)) if (!SECRET_PARAMS.includes(k)) params[k] = v;
    return { ...msg, params };
  }

  private play(id: CinematicId, params: CinematicMsg["params"], then: () => void): void {
    const msg = cinematic(id, params);
    this.votes.clear();
    const timer = setTimeout(() => this.finishCinematic(id), msg.duration_ms + 300);
    this.timers.add(timer);
    this.cin = { msg, then, timer };
    this.broadcastGame(); // input_locked: true, fuel paused
    for (const s of this.slots) this.toRole(s.role, this.cinFor(s.role, msg));
    // Bots vote to skip at once (§A10); give the timeline a moment on screen first.
    if (id !== "crash" && (this.bots.flyer || this.bots.tower)) {
      this.later(this.opts.botDelayMs, () => {
        if (this.cin?.msg !== msg) return;
        if (this.bots.flyer) this.vote("flyer");
        if (this.bots.tower) this.vote("tower");
      });
    }
  }

  private vote(role: Role): void {
    const c = this.cin;
    if (!c || c.msg.id === "crash") return;
    this.votes.add(role);
    this.toAll(skipVotes(c.msg.id, [...this.votes]));
    if (this.votes.size === 2) this.skip();
  }

  private skip(): void {
    const c = this.cin;
    if (!c) return;
    this.toAll(cinematicSkip(c.msg.id));
    this.finishCinematic(c.msg.id);
  }

  private finishCinematic(id: CinematicId): void {
    const c = this.cin;
    if (!c || c.msg.id !== id || this.status === "PAUSED") return;
    clearTimeout(c.timer);
    this.timers.delete(c.timer);
    this.cin = null;
    this.votes.clear();
    c.then();
    // The fuel clock resumes (cin === null); the end state reaches both screens.
    this.broadcastGame();
  }

  // -------------------------------------------------------------------------
  // Talk and lifelines
  // -------------------------------------------------------------------------

  private say(role: Role, text: string, lang: Lang): void {
    const speaker = this.slotOf(role);
    const listener = this.slotOf(other(role));
    if (!speaker) return;
    const id = `u${this.utterances.length + 1}-${Date.now() % 100000}`;
    const level = this.phase === 0 ? 0 : this.phase;
    // §A2 rule 3 / §B11.3: subtitles are Latin; Devanagari is romanized, never echoed.
    const display = subtitleText(text, lang);
    const msg = utterance({
      id,
      speaker_role: role,
      speaker_name: speaker.name,
      lang,
      segments: segmentsFor(display, level, listener?.lang ?? "en"),
      level,
      lifeline_available: this.phase === 3 && this.status === "PLAYING",
      created_at_ms: Date.now(),
    });
    const into = listener?.lang ?? "en";
    // Translations are in the listener's own script (§A2 rule 3, §B14.1): Devanagari into Hindi.
    const translated = into === "hi" ? `अनुवाद: ${display}` : `Translation: ${display}`;
    this.utterances.push({ msg, translated, lifelinedBy: new Set() });
    this.toRole(other(role), msg);
    this.toRole(role, utteranceEcho(id, display));
  }

  /** §B14.2, in the spec's order. */
  private lifeline(conn: Conn, slot: Slot, id: string): void {
    if (this.phase !== 3 || this.status !== "PLAYING")
      return this.to(conn, errorMsg("lifeline_not_available"));
    const window = this.utterances
      .filter((u) => u.msg.speaker_role !== slot.role)
      .slice(-LIFELINE_WINDOW);
    const u = window.find((x) => x.msg.id === id);
    if (!u) return this.to(conn, errorMsg("lifeline_not_available"));
    // A repeat request on a line this player already decoded is free and comes BEFORE the
    // no_lifelines check (the "show" link).
    if (u.lifelinedBy.has(slot.role)) {
      this.to(conn, translation(id, u.translated, slot.lang, this.lifelines[slot.role]));
      return;
    }
    if (this.lifelines[slot.role] <= 0) return this.to(conn, errorMsg("no_lifelines"));
    this.lifelines[slot.role] -= 1;
    u.lifelinedBy.add(slot.role);
    this.to(conn, translation(id, u.translated, slot.lang, this.lifelines[slot.role]));
    this.broadcastGame();
  }

  // -------------------------------------------------------------------------
  // Fuel (BACKEND_SPEC §B10)
  // -------------------------------------------------------------------------

  /** Start the clock: 1 s ticks while PLAYING (the gap included), not in cinematics or PAUSED. */
  private startFuel(): void {
    this.fuelOn = true;
    if (this.fuelTimer) return;
    this.fuelTimer = setInterval(() => {
      if (!this.draining()) return;
      this.fuel = Math.max(0, this.fuel - 1);
      if (this.fuel <= 0) this.onFuelEmpty();
      else this.broadcastGame();
    }, 1000);
  }

  private stopFuel(): void {
    this.fuelOn = false;
    if (this.fuelTimer) clearInterval(this.fuelTimer);
    this.fuelTimer = null;
  }

  // -------------------------------------------------------------------------
  // Dev Mode (§A7 DevCmd)
  // -------------------------------------------------------------------------

  private dev(cmd: DevCmd, args: Record<string, unknown>): void {
    switch (cmd) {
      case "complete_action": {
        // §B9.3: every expected object to its target state, then the success path.
        const run = this.run;
        if (!run || !this.active || this.cin || this.status !== "PLAYING") return;
        run.pending = null;
        run.action.steps.forEach((s, i) => {
          if (run.done[i]) return;
          const target = targetOf(s.control, s.verb, s.value);
          this.objects[s.control.id] = target;
          this.toRole("flyer", objectState(s.control.id, target, false));
          run.done[i] = true;
        });
        this.succeed("dev");
        return;
      }
      case "fail_action": {
        // §B9.3: wrong("wrong_object") with `used` = the first expected object.
        const run = this.run;
        if (!run || !this.active || this.cin || this.status !== "PLAYING") return;
        const i = run.done.findIndex((d) => !d);
        const s = run.action.steps[i < 0 ? 0 : i];
        if (s) this.wrong("wrong_object", s.control.id, s.verb, 1);
        return;
      }
      case "goto_phase": {
        const p = args.phase;
        if (p !== 1 && p !== 2 && p !== 3) return;
        if (this.cin) {
          clearTimeout(this.cin.timer);
          this.timers.delete(this.cin.timer);
          this.cin = null;
        }
        for (const t of this.timers) clearTimeout(t);
        this.timers.clear();
        this.retryVotes.clear();
        this.enterIntro(p);
        return;
      }
      case "skip_cinematic":
        this.skip();
        return;
      case "set_seed":
        if (typeof args.seed === "number") this.seed = args.seed;
        this.broadcastDev();
        return;
      case "add_fuel":
        this.fuel += typeof args.seconds === "number" ? args.seconds : 60;
        this.broadcastGame();
        return;
      case "bots":
        if (typeof args.flyer === "boolean") this.bots.flyer = args.flyer;
        if (typeof args.tower === "boolean") this.bots.tower = args.tower;
        this.broadcastDev();
        if (this.cin && (this.bots.flyer || this.bots.tower)) {
          if (this.bots.flyer) this.vote("flyer");
          if (this.bots.tower) this.vote("tower");
        } else {
          this.botsAct();
        }
        return;
      case "force":
        if (typeof args.var === "string" && typeof args.value === "string")
          this.forced[args.var] = args.value;
        this.broadcastDev();
        return;
      default:
        assertNever(cmd);
    }
  }
}

function isFixed(type: PartType): boolean {
  return type === "Lamp" || type === "FuelGauge" || type === "Screen";
}

function isType<M extends { type: string }, T extends M["type"]>(
  m: M,
  type: T,
): m is Extract<M, { type: T }> {
  return m.type === type;
}

function assertNever(x: never): never {
  throw new Error(`unhandled ${JSON.stringify(x)}`);
}
