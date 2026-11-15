// One fake game room (e2e only): just enough of the Part A server to drive the client through
// the flow specs with correctly shaped messages and role privacy (§A2 rule 2, §A9).
//
// It is NOT the game. The script is tiny (2 actions per phase, one step each, judged at once),
// Phase 2 keeps its fire on the right, glosses are "level 1 = all, else none", and translations
// are a tagged echo. The real server is the contract's judge; this only speaks its language.
import type { WebSocketRoute } from "@playwright/test";
import type {
  C2S,
  CinematicId,
  CinematicMsg,
  DevCmd,
  GameState,
  Gender,
  Lang,
  ObjectState,
  PhaseNo,
  PlayerPublic,
  QuickLine,
  Role,
  RoomState,
  S2C,
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
  STATION_OF,
  STATIONS,
  type StationControl,
  toast,
  translation,
  utterance,
  utteranceEcho,
  welcome,
  worldFor,
} from "./fixtures";
import { parseC2S } from "./parseC2S";

export interface FakeOptions {
  /** `welcome.mock_speech` / `room_state.mock_speech` (default true). */
  mock?: boolean;
  /** `welcome.dev_mode` (default true): dev commands, dev_state, say_text. */
  dev?: boolean;
  /** How long the fake bots wait before acting, ms (default 700). */
  botDelayMs?: number;
  /** Gap after a success before the next action, ms (default 600; the real server uses 1500). */
  nextActionMs?: number;
}

interface FakeAction {
  id: string;
  phase: PhaseNo;
  control: StationControl;
  verb: Verb;
  /** A lamp lit (red, blinking) while the action is active. */
  lamp: string | null;
  say: { en: string; hi: string };
}

function control(id: string): StationControl {
  for (const list of Object.values(STATIONS)) {
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  throw new Error(`fake script: ${id} is not in stations.json`);
}

function verbFor(c: StationControl): Verb {
  switch (c.type) {
    case "PushButton":
      return "press";
    case "ToggleSwitch":
      return "toggle";
    case "PullHandle":
      return "pull";
    case "UpDownLever":
    case "NotchLever":
      return "move_down";
    default:
      throw new Error(`fake script: ${c.id} is not clickable`);
  }
}

const act = (
  id: string,
  phase: PhaseNo,
  object: string,
  lamp: string | null,
  say: FakeAction["say"],
): FakeAction => {
  const c = control(object);
  return { id, phase, control: c, verb: verbFor(c), lamp, say };
};

/** The fake script: two one-step actions per phase. */
export const SCRIPT: Record<PhaseNo, FakeAction[]> = {
  1: [
    act("P1_A1", 1, "OH_BTN_1", "OH_MASTER_LAMP", {
      en: "Press button one",
      hi: "Ek number button dabao",
    }),
    act("P1_A2", 1, "OH_HANDLE_3", null, {
      en: "Pull lever three",
      hi: "Teen number lever kheencho",
    }),
  ],
  2: [
    act("P2_B1", 2, "PD_FIRE_HANDLE_R", "PD_FIRE_LAMP_R", {
      en: "Pull the red lever",
      hi: "Laal lever kheencho",
    }),
    act("P2_B2", 2, "PD_EXT_BTN", null, { en: "Press the fire button", hi: "Aag button dabao" }),
  ],
  3: [
    act("P3_C1", 3, "FP_LAND_SW", null, {
      en: "Switch on the yellow switch",
      hi: "Peela switch chalu karo",
    }),
    act("P3_C2", 3, "FP_BTN_3", "FP_WARN_LAMP", {
      en: "Press button three",
      hi: "Teen number button dabao",
    }),
  ],
};

const OUTRO: Record<PhaseNo, CinematicId> = { 1: "p1_outro", 2: "p2_outro", 3: "landing" };
const INTRO: Record<PhaseNo, CinematicId> = { 1: "p1_intro", 2: "p2_intro", 3: "p3_intro" };
const NEXT_PHASE: Record<PhaseNo, PhaseNo | null> = { 1: 2, 2: 3, 3: null };
/** Flyer-only cinematic params (never sent to the Tower, §A10). */
const SECRET_PARAMS = new Set(["fire_side", "stopped_side", "damaged_side"]);

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

interface Conn {
  id: number;
  ws: WebSocketRoute;
  slot: Slot | null;
}

interface StoredUtterance {
  msg: UtteranceMsg;
  /** The translation into the listener's language (kept for lifelines and history). */
  translated: string;
  decoded: boolean;
}

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
  /** Frames the client sent that break §A7 (they also get `error bad_message`). */
  readonly badFrames: string[] = [];
  /** Role-privacy breaches the fake caught itself about to make (must stay empty). */
  readonly violations: string[] = [];

  private conns = new Set<Conn>();
  private connSeq = 0;
  private slots: Slot[] = [];
  private nextId = 1;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private fuelTimer: ReturnType<typeof setInterval> | null = null;

  private status: Status = "LOBBY";
  private pausedFrom: Status | null = null;
  private phase: 0 | PhaseNo = 0;
  private actionIndex = -1;
  private completed = 0;
  private active = false;
  private fuel = 150;
  private lifelines: Record<Role, number> = { flyer: 3, tower: 3 };
  private objects: Record<string, ObjectState> = defaultObjects();
  private interactive: string[] = [];
  private wrongCount = 0;
  private seed = 0;
  private forced: Record<string, string> = {};
  private bots = { flyer: false, tower: false };
  private cin: {
    msg: CinematicMsg;
    then: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private votes = new Set<Role>();
  private playAgain = new Set<Role>();
  private swap = new Set<Role>();
  private utterances: StoredUtterance[] = [];
  private busy: Role | null = null;

  constructor(code: string, opts: FakeOptions = {}) {
    this.code = code;
    this.opts = {
      mock: opts.mock ?? true,
      dev: opts.dev ?? true,
      botDelayMs: opts.botDelayMs ?? 700,
      nextActionMs: opts.nextActionMs ?? 600,
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

  attach(ws: WebSocketRoute): void {
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
      this.pausedFrom = this.status;
      this.status = "PAUSED";
      this.stopFuel();
    }
    this.broadcastRoom();
    this.broadcastGame();
    this.toRole(other(slot.role), toast("toast.partner_left", { name: slot.name }, "warning"));
  }

  private to(conn: Conn, msg: S2C): void {
    const role = conn.slot?.role ?? null;
    if (role === "tower" && (msg.type === "flyer_view" || msg.type === "object_state")) {
      this.violations.push(`tower would get ${msg.type}`);
      return;
    }
    if (role === "flyer" && msg.type === "manual_card") {
      this.violations.push("flyer would get manual_card");
      return;
    }
    if (role === "tower" && msg.type === "cinematic") {
      const leaked = Object.keys(msg.params).filter((k) => SECRET_PARAMS.has(k));
      if (leaked.length > 0) this.violations.push(`tower cinematic params ${leaked.join(",")}`);
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
      play_again_votes: [...this.playAgain],
    });
  }

  private game(): GameState {
    const action = this.currentDef();
    const total = this.phase === 0 ? 0 : SCRIPT[this.phase].length;
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
      fuel_max_s: 150,
      fuel_draining: this.fuelTimer !== null,
      lifelines: { ...this.lifelines },
      lifelines_enabled: this.phase === 3 && this.status === "PLAYING",
      radar: radar({
        blip: this.phase === 0 ? "green" : "amber",
        icon: this.phase === 1 ? "mayday" : this.phase === 2 ? "fire" : null,
        storm: this.phase === 3,
        runway: this.phase === 3,
        progress: total === 0 ? 0 : this.completed / total,
        landed: this.status === "ENDING" || this.status === "DECK",
      }),
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
    const expected =
      action && this.status === "PLAYING"
        ? [{ object: action.control.id, verb: action.verb, done: !this.active }]
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
        fuel_s: Math.round(this.fuel * 10) / 10,
        bots: { ...this.bots },
      }),
    );
  }

  private sendFlyerView(): void {
    const station = this.phase === 0 ? null : STATION_OF[this.phase];
    const action = this.currentDef();
    const quick: QuickLine[] | null =
      this.opts.mock && action && this.active
        ? [
            { label: "Yes", text: "yes" },
            { label: "Red", text: "red" },
          ]
        : null;
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
    this.toRole(
      "tower",
      manualCardMsg(
        manualCard({
          action_id: action.id,
          index: this.actionIndex,
          total,
          phase: action.phase,
          lang: tower.lang,
          control: action.control,
          verb: action.verb,
          quick: this.opts.mock
            ? { label: action.say[tower.lang], text: action.say.hi, alt_text: action.say.hi }
            : undefined,
          lastWrong: lastWrong
            ? { label: [plain(this.lastWrongId ?? "?")], count: this.wrongCount }
            : null,
        }),
      ),
    );
  }

  private lastWrongId: string | null = null;

  /** The rejoin snapshot (§A5): game_state, flyer_view | manual_card, history, cinematic, channel, deck. */
  private snapshot(conn: Conn): void {
    const slot = conn.slot;
    if (!slot) return;
    this.to(conn, this.game());
    if (slot.role === "flyer") this.sendFlyerView();
    else this.sendCard(this.wrongCount > 0);
    this.to(
      conn,
      history(
        this.utterances
          .filter((u) => u.msg.speaker_role !== slot.role)
          .slice(-5)
          .map((u) => (u.decoded ? { ...u.msg, translation: u.translated } : u.msg)),
      ),
    );
    if (this.cin) this.to(conn, this.cinFor(slot.role, this.cin.msg));
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
      case "interact":
        if (slot.role !== "flyer") return this.to(conn, errorMsg("not_your_role"));
        if (!this.active || this.cin || !this.interactive.includes(msg.object_id))
          return this.to(conn, errorMsg("not_allowed_now"));
        this.judge(msg.object_id, msg.verb);
        return;
      case "lifeline":
        this.lifeline(conn, slot, msg.utterance_id);
        return;
      case "skip_cinematic":
        this.vote(slot.role);
        return;
      case "retry":
        return this.to(conn, errorMsg("not_allowed_now")); // the fake never crashes
      case "play_again":
      case "swap_roles":
        if (this.status !== "DECK") return this.to(conn, errorMsg("not_allowed_now"));
        (msg.type === "play_again" ? this.playAgain : this.swap).add(slot.role);
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
      // §A16: a cinematic running at the disconnect is completed instantly on rejoin.
      const { then, timer } = this.cin;
      clearTimeout(timer);
      this.timers.delete(timer);
      this.cin = null;
      then();
    } else if (this.status === "PLAYING" && this.active) {
      this.startFuel();
    }
    this.broadcastGame();
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------

  private startGame(): void {
    this.playAgain.clear();
    this.swap.clear();
    this.utterances = [];
    this.lifelines = { flyer: 3, tower: 3 };
    this.objects = defaultObjects();
    this.phase = 0;
    this.status = "PROLOGUE";
    this.broadcastRoom();
    this.broadcastGame();
    this.play("prologue", {}, () => this.enterIntro(1));
  }

  private enterIntro(n: PhaseNo): void {
    this.stopFuel();
    this.active = false;
    this.actionIndex = -1;
    this.completed = 0;
    this.phase = n;
    this.status = "PHASE_INTRO";
    this.toRole("tower", manualCardMsg(null));
    this.broadcastGame();
    const params: CinematicMsg["params"] = { retry: false };
    if (n === 2) params.fire_side = "right";
    if (n === 3) params.damaged_side = "right";
    this.play(INTRO[n], params, () => this.enterPlaying(n));
  }

  private enterPlaying(n: PhaseNo): void {
    this.status = "PLAYING";
    this.phase = n;
    this.fuel = 150;
    this.wrongCount = 0;
    if (n === 3) this.lifelines = { flyer: 3, tower: 3 };
    for (const c of STATIONS[STATION_OF[n]]) this.objects[c.id] = c.default;
    this.interactive = [];
    this.sendFlyerView();
    this.broadcastGame();
    this.later(150, () => this.activate(0));
  }

  private currentDef(): FakeAction | undefined {
    if (this.phase === 0 || this.actionIndex < 0) return undefined;
    return SCRIPT[this.phase][this.actionIndex];
  }

  private activate(i: number): void {
    if (this.phase === 0 || this.status !== "PLAYING") return;
    const action = SCRIPT[this.phase][i];
    if (!action) return;
    this.actionIndex = i;
    this.active = true;
    this.wrongCount = 0;
    if (action.lamp) {
      const lamp: ObjectState = { kind: "lamp", color: "red", blinking: true, attention: true };
      this.objects[action.lamp] = lamp;
      this.toRole("flyer", objectState(action.lamp, lamp, false));
    }
    this.interactive = clickableIds(STATION_OF[action.phase]);
    this.sendFlyerView();
    this.sendCard();
    this.startFuel();
    this.broadcastGame();
    this.botsAct();
  }

  private botsAct(): void {
    const action = this.currentDef();
    if (!action || !this.active) return;
    const id = action.id;
    if (this.bots.tower) {
      this.later(this.opts.botDelayMs, () => {
        const lang = this.slotOf("tower")?.lang ?? "hi";
        if (this.currentDef()?.id === id && this.active) this.say("tower", action.say[lang], lang);
      });
    }
    if (this.bots.flyer) {
      this.later(this.opts.botDelayMs * 2, () => {
        if (this.currentDef()?.id === id && this.active && !this.cin)
          this.judge(action.control.id, action.verb);
      });
    }
  }

  private judge(objectId: string, verb: Verb): void {
    const action = this.currentDef();
    if (!action) return;
    const before = this.objects[objectId];
    if (objectId === action.control.id && verb === action.verb) {
      const after = nextState(before, verb);
      if (after) this.objects[objectId] = after;
      this.toRole("flyer", objectState(objectId, after ?? { kind: "button" }, false));
      this.succeed(action, null);
      return;
    }
    this.fail(action, objectId, verb, "wrong_object");
  }

  private succeed(action: FakeAction, reason: "dev" | null): void {
    this.active = false;
    this.completed += 1;
    this.stopFuel();
    const base = actionResult({
      action_id: action.id,
      success: true,
      reason,
      completed_steps: 1,
      total_steps: 1,
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
    const phase = action.phase;
    const next = this.actionIndex + 1;
    this.later(this.opts.nextActionMs, () => {
      if (this.phase !== phase || this.status !== "PLAYING") return;
      if (next < SCRIPT[phase].length) this.activate(next);
      else this.enterOutro(phase);
    });
  }

  private fail(
    action: FakeAction,
    objectId: string,
    verb: Verb,
    reason: "wrong_object" | "dev",
  ): void {
    const unchanged = this.objects[objectId];
    if (unchanged && reason !== "dev") this.toRole("flyer", objectState(objectId, unchanged, true));
    this.fuel = Math.max(0, this.fuel - 10);
    this.wrongCount += 1;
    this.lastWrongId = objectId;
    const base = actionResult({
      action_id: action.id,
      success: false,
      reason,
      fuel_delta: -10,
      completed_steps: 0,
      total_steps: 1,
    });
    this.toRole("flyer", base);
    this.toRole("tower", {
      ...base,
      used: { object_id: objectId, label: [plain(objectId)], verb, count: 1 },
    });
    this.sendCard(true);
    this.broadcastGame();
  }

  private enterOutro(n: PhaseNo): void {
    this.status = "PHASE_OUTRO";
    this.actionIndex = -1;
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

  private sendDeck(slot: Slot): void {
    const partner = this.slotOf(other(slot.role));
    if (!partner) return;
    this.toRole(
      slot.role,
      deck(slot.lang, { name: partner.name, lang: partner.lang, gender: partner.gender }),
    );
  }

  private checkDeckVotes(): void {
    if (this.playAgain.size === 2) {
      this.seed += 1;
      this.startGame();
      return;
    }
    if (this.swap.size === 2) {
      // §A16: LOBBY with roles swapped, languages kept, not ready; `joined` re-keys each tab.
      this.swap.clear();
      this.playAgain.clear();
      for (const s of this.slots) {
        s.role = other(s.role);
        s.ready = false;
      }
      this.status = "LOBBY";
      this.phase = 0;
      this.actionIndex = -1;
      for (const s of this.slots) {
        const p = this.players().find((x) => x.id === s.id);
        if (s.conn && p) this.to(s.conn, joined(p, s.token));
      }
      this.broadcastRoom();
    }
  }

  // -------------------------------------------------------------------------
  // Cinematics
  // -------------------------------------------------------------------------

  private cinFor(role: Role, msg: CinematicMsg): CinematicMsg {
    if (role === "flyer") return msg;
    const params: CinematicMsg["params"] = {};
    for (const [k, v] of Object.entries(msg.params)) if (!SECRET_PARAMS.has(k)) params[k] = v;
    return { ...msg, params };
  }

  private play(id: CinematicId, params: CinematicMsg["params"], then: () => void): void {
    const msg = cinematic(id, params);
    this.votes.clear();
    const timer = setTimeout(() => this.finishCinematic(id), msg.duration_ms + 300);
    this.timers.add(timer);
    this.cin = { msg, then, timer };
    this.broadcastGame(); // input_locked: true
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
    const msg = utterance({
      id,
      speaker_role: role,
      speaker_name: speaker.name,
      lang,
      segments: segmentsFor(text, level, listener?.lang ?? "en"),
      level,
      lifeline_available: this.phase === 3 && this.status === "PLAYING",
      created_at_ms: Date.now(),
    });
    const into = listener?.lang ?? "en";
    // Translations are in the listener's own script (§A2 rule 3).
    const translated = into === "hi" ? `अनुवाद: ${text}` : `Translation: ${text}`;
    this.utterances.push({ msg, translated, decoded: false });
    this.toRole(other(role), msg);
    this.toRole(role, utteranceEcho(id, text));
  }

  private lifeline(conn: Conn, slot: Slot, id: string): void {
    if (this.phase !== 3 || this.status !== "PLAYING")
      return this.to(conn, errorMsg("lifeline_not_available"));
    const window = this.utterances.filter((u) => u.msg.speaker_role !== slot.role).slice(-3);
    const u = window.find((x) => x.msg.id === id);
    if (!u) return this.to(conn, errorMsg("lifeline_not_available"));
    if (this.lifelines[slot.role] <= 0) return this.to(conn, errorMsg("no_lifelines"));
    this.lifelines[slot.role] -= 1;
    u.decoded = true;
    this.to(conn, translation(id, u.translated, slot.lang, this.lifelines[slot.role]));
    this.broadcastGame();
  }

  // -------------------------------------------------------------------------
  // Fuel
  // -------------------------------------------------------------------------

  private startFuel(): void {
    if (this.fuelTimer) return;
    this.fuelTimer = setInterval(() => {
      this.fuel = Math.max(1, this.fuel - 1); // the fake never crashes
      this.broadcastGame();
    }, 1000);
  }

  private stopFuel(): void {
    if (this.fuelTimer) clearInterval(this.fuelTimer);
    this.fuelTimer = null;
  }

  // -------------------------------------------------------------------------
  // Dev Mode (§A7 DevCmd)
  // -------------------------------------------------------------------------

  private dev(cmd: DevCmd, args: Record<string, unknown>): void {
    switch (cmd) {
      case "complete_action": {
        const a = this.currentDef();
        if (a && this.active && !this.cin) this.succeed(a, "dev");
        return;
      }
      case "fail_action": {
        const a = this.currentDef();
        if (a && this.active && !this.cin) this.fail(a, a.control.id, a.verb, "dev");
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

/** The state after a correct verb (the fake's tiny rule engine). */
function nextState(state: ObjectState | undefined, verb: Verb): ObjectState | undefined {
  if (!state) return state;
  switch (state.kind) {
    case "toggle":
      return { kind: "toggle", value: state.value === "on" ? "off" : "on" };
    case "handle":
      return verb === "pull" ? { kind: "handle", value: "out" } : state;
    case "lever":
      return { kind: "lever", value: verb === "move_down" ? "down" : "up" };
    case "notch":
      return { kind: "notch", value: verb === "move_down" ? 2 : 0 };
    default:
      return state;
  }
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
