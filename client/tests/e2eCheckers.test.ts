// @vitest-environment node
// The e2e kit's checkers and its fake server are only worth anything if they fail when the
// contract is broken. This file holds the POSITIVE cases (a violation must be reported) and the
// negative ones (a legal frame must pass), so a checker that always said "ok" fails here.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { C2S, Lang, Role, S2C, Verb } from "../src/net/protocol";
import { FakeGame, PRESS_DEBOUNCE_MS } from "../e2e/fakeServer/game";
import { FakeRooms } from "../e2e/fakeServer/index";
import { parseC2S } from "../e2e/fakeServer/parseC2S";
import { frameViolations } from "../e2e/fakeServer/privacy";
import { romanize, subtitleText } from "../e2e/fakeServer/subtitles";
import { Wire, type TapSocket } from "../e2e/fakeServer/wire";

const DEVANAGARI = /[ऀ-ॿ]/;

// ---------------------------------------------------------------------------
// parseC2S: §A5 / §A7 / §A13
// ---------------------------------------------------------------------------

const j = (v: unknown): string => JSON.stringify(v);

describe("parseC2S rejects what breaks the contract", () => {
  const bad: [string, string, RegExp][] = [
    ["malformed JSON", "{", /not JSON/],
    ["a JSON array", "[]", /not an object/],
    ["a bare string", '"ping"', /not an object/],
    ["an unknown type", j({ type: "banana" }), /unknown type/],
    ["a missing type", j({ client_ms: 1 }), /unknown type/],
    ["ping without client_ms", j({ type: "ping" }), /client_ms/],
    [
      "an extra field on interact",
      j({ type: "interact", object_id: "OH_BTN_1", verb: "press", extra: 1 }),
      /unknown field "extra"/,
    ],
    [
      "an extra field on join",
      j({ type: "join", name: "A", role: "flyer", lang: "en", gender: "male", seat: 2 }),
      /unknown field "seat"/,
    ],
    ["an extra field on ready", j({ type: "ready", ready: true, now: 1 }), /unknown field/],
    ["an extra field on ptt_start", j({ type: "ptt_start", at: 1 }), /unknown field/],
    ["an interact with a bad verb", j({ type: "interact", object_id: "X", verb: "kick" }), /verb/],
    [
      "an interact with an empty object_id",
      j({ type: "interact", object_id: "", verb: "press" }),
      /object_id/,
    ],
    [
      "an empty join.token",
      j({ type: "join", name: "A", role: "flyer", lang: "en", gender: "male", token: "" }),
      /join\.token/,
    ],
    [
      "a join name over 16 characters",
      j({ type: "join", name: "x".repeat(17), role: "flyer", lang: "en", gender: "male" }),
      /join\.name/,
    ],
    [
      "a blank join name",
      j({ type: "join", name: "   ", role: "flyer", lang: "en", gender: "male" }),
      /join\.name/,
    ],
    [
      "a join without gender",
      j({ type: "join", name: "A", role: "flyer", lang: "en" }),
      /join needs/,
    ],
    ["an empty say_text.text", j({ type: "say_text", text: "" }), /must not be empty/],
    ["a blank say_text.text", j({ type: "say_text", text: "  " }), /must not be empty/],
    ["a say_text over 300 characters", j({ type: "say_text", text: "a".repeat(301) }), /300/],
    ["an empty update_player.name", j({ type: "update_player", name: "" }), /update_player\.name/],
    ["an update_player with a bad role", j({ type: "update_player", role: "pilot" }), /role/],
    ["a lifeline without an id", j({ type: "lifeline", utterance_id: "" }), /utterance_id/],
    ["a presenter with a bad cmd", j({ type: "presenter", cmd: "next_world" }), /presenter\.cmd/],
    ["a dev with an unknown cmd", j({ type: "dev", cmd: "explode" }), /dev\.cmd/],
    [
      "dev goto_phase with phase 'banana'",
      j({ type: "dev", cmd: "goto_phase", args: { phase: "banana" } }),
      /goto_phase/,
    ],
    [
      "dev goto_phase with phase 4",
      j({ type: "dev", cmd: "goto_phase", args: { phase: 4 } }),
      /goto_phase/,
    ],
    ["dev goto_phase without args", j({ type: "dev", cmd: "goto_phase" }), /goto_phase/],
    [
      "dev goto_phase with an extra arg",
      j({ type: "dev", cmd: "goto_phase", args: { phase: 2, fast: true } }),
      /unknown arg/,
    ],
    [
      "dev set_seed with a string seed",
      j({ type: "dev", cmd: "set_seed", args: { seed: "42" } }),
      /set_seed/,
    ],
    [
      "dev set_seed with a fractional seed",
      j({ type: "dev", cmd: "set_seed", args: { seed: 1.5 } }),
      /set_seed/,
    ],
    [
      "dev add_fuel with a string",
      j({ type: "dev", cmd: "add_fuel", args: { seconds: "60" } }),
      /add_fuel/,
    ],
    ["dev bots with a non-boolean", j({ type: "dev", cmd: "bots", args: { flyer: 1 } }), /bots/],
    [
      "dev bots with an unknown key",
      j({ type: "dev", cmd: "bots", args: { pilot: true } }),
      /unknown arg/,
    ],
    [
      "dev force without a value",
      j({ type: "dev", cmd: "force", args: { var: "FIRE_SIDE" } }),
      /force/,
    ],
    [
      "dev force with an empty var",
      j({ type: "dev", cmd: "force", args: { var: "", value: "LEFT" } }),
      /force/,
    ],
    [
      "dev skip_cinematic with args",
      j({ type: "dev", cmd: "skip_cinematic", args: { now: true } }),
      /takes no args/,
    ],
    [
      "dev with args that are not an object",
      j({ type: "dev", cmd: "add_fuel", args: 5 }),
      /args must be an object/,
    ],
    [
      "an extra top-level field on dev",
      j({ type: "dev", cmd: "complete_action", why: "x" }),
      /unknown field/,
    ],
  ];
  it.each(bad)("%s", (_name, raw, why) => {
    const r = parseC2S(raw);
    expect(typeof r).toBe("string");
    expect(r).toMatch(why);
  });

  it("measures the 8 KB limit in bytes, not characters", () => {
    // 3000 Devanagari characters are 9000 bytes: fewer than 8192 characters, more than 8192 bytes.
    const multibyte = j({ type: "dev", cmd: "force", args: { var: "V", value: "ह".repeat(3000) } });
    expect(multibyte.length).toBeLessThan(8192);
    expect(new TextEncoder().encode(multibyte).byteLength).toBeGreaterThan(8192);
    expect(parseC2S(multibyte)).toMatch(/8 KB/);
    // The same number of ASCII characters is legal.
    const ascii = j({ type: "dev", cmd: "force", args: { var: "V", value: "a".repeat(8000) } });
    expect(parseC2S(ascii)).toMatchObject({ type: "dev", cmd: "force" });
    // And one byte over is not.
    expect(
      parseC2S(j({ type: "dev", cmd: "force", args: { var: "V", value: "a".repeat(8200) } })),
    ).toMatch(/8 KB/);
  });

  it("counts say_text characters, not bytes", () => {
    expect(parseC2S(j({ type: "say_text", text: "ह".repeat(300) }))).toMatchObject({
      type: "say_text",
    });
  });
});

describe("parseC2S accepts every legal message exactly as sent", () => {
  const good: C2S[] = [
    { type: "ping", client_ms: 12345.5 },
    { type: "join", name: " Asha ", role: "tower", lang: "hi", gender: "female" },
    { type: "join", name: "Ravi", role: "flyer", lang: "en", gender: "male", token: "tok-1" },
    { type: "update_player" },
    { type: "update_player", name: "Ravi", role: "flyer", lang: "hi", gender: "male" },
    { type: "ready" },
    { type: "ready", ready: false },
    { type: "ptt_start" },
    { type: "ptt_end" },
    { type: "say_text", text: "Press button one" },
    { type: "say_text", text: "एक", lang: "hi" },
    { type: "interact", object_id: "OH_BTN_1", verb: "press" },
    { type: "lifeline", utterance_id: "u1" },
    { type: "skip_cinematic" },
    { type: "retry" },
    { type: "play_again" },
    { type: "swap_roles" },
    { type: "presenter", cmd: "next_action" },
    { type: "presenter", cmd: "next_phase" },
    { type: "dev", cmd: "complete_action" },
    { type: "dev", cmd: "fail_action" },
    { type: "dev", cmd: "skip_cinematic" },
    { type: "dev", cmd: "goto_phase", args: { phase: 3 } },
    { type: "dev", cmd: "set_seed", args: { seed: 42 } },
    { type: "dev", cmd: "add_fuel" },
    { type: "dev", cmd: "add_fuel", args: { seconds: 60 } },
    { type: "dev", cmd: "bots", args: { flyer: true } },
    { type: "dev", cmd: "bots", args: { flyer: false, tower: true } },
    { type: "dev", cmd: "force", args: { var: "FIRE_SIDE", value: "LEFT" } },
  ];
  it.each(good.map((m) => [m.type + (("cmd" in m && m.cmd) || ""), m] as const))(
    "%s",
    (_n, msg) => {
      expect(parseC2S(j(msg))).toEqual(msg);
    },
  );
});

// ---------------------------------------------------------------------------
// Privacy: §A2 rule 2, §A9
// ---------------------------------------------------------------------------

describe("frameViolations reports every §A9 breach", () => {
  const breaches: [string, Role | null, string, unknown, RegExp][] = [
    [
      "the Tower gets flyer_view",
      "tower",
      "flyer_view",
      { type: "flyer_view" },
      /tower received flyer_view/,
    ],
    [
      "the Tower gets object_state",
      "tower",
      "object_state",
      { type: "object_state" },
      /tower received object_state/,
    ],
    [
      "a Tower cinematic carries fire_side",
      "tower",
      "cinematic",
      { type: "cinematic", id: "p2_intro", params: { retry: false, fire_side: "left" } },
      /fire_side/,
    ],
    [
      "a Tower cinematic carries stopped_side",
      "tower",
      "cinematic",
      { type: "cinematic", id: "p2_outro", params: { stopped_side: "right" } },
      /stopped_side/,
    ],
    [
      "a Tower cinematic carries damaged_side",
      "tower",
      "cinematic",
      { type: "cinematic", id: "landing", params: { damaged_side: "right" } },
      /damaged_side/,
    ],
    [
      "a fire side hides in a Tower game_state",
      "tower",
      "game_state",
      { type: "game_state", radar: { fire_side: "left" } },
      /carrying "fire_side"/,
    ],
    [
      "a rolled FIRE_SIDE reaches the Tower outside dev_state",
      "tower",
      "toast",
      { type: "toast", params: { FIRE_SIDE: "LEFT" } },
      /carrying "FIRE_SIDE"/,
    ],
    [
      "the Tower gets a Flyer sfx",
      "tower",
      "fx",
      { type: "fx", effects: ["sfx:clunk"] },
      /fx sfx:clunk/,
    ],
    [
      "the Tower gets a Flyer shake",
      "tower",
      "fx",
      { type: "fx", effects: ["tower:ok", "fx:shake:1:1"] },
      /fx fx:shake/,
    ],
    [
      "the Flyer gets manual_card",
      "flyer",
      "manual_card",
      { type: "manual_card", card: null },
      /flyer received manual_card/,
    ],
    [
      "the Flyer's action_result carries used",
      "flyer",
      "action_result",
      { type: "action_result", success: false, used: { object_id: "A" } },
      /carries used/,
    ],
    [
      "the Flyer's action_result carries row_index",
      "flyer",
      "action_result",
      { type: "action_result", success: true, row_index: 0 },
      /carries row_index/,
    ],
    [
      "the Flyer gets a tower: fx",
      "flyer",
      "fx",
      { type: "fx", effects: ["sfx:chime", "tower:stamp"] },
      /fx tower:stamp/,
    ],
    ["the Flyer gets an unknown fx", "flyer", "fx", { type: "fx", effects: ["stamp"] }, /fx stamp/],
    [
      "the Flyer gets quick_say lines",
      "flyer",
      "flyer_view",
      { type: "flyer_view", extra: { quick_say: {} } },
      /quick_say/,
    ],
    [
      "an unjoined socket gets flyer_view",
      null,
      "flyer_view",
      { type: "flyer_view" },
      /unjoined socket received flyer_view/,
    ],
    [
      "an unjoined socket gets manual_card",
      null,
      "manual_card",
      { type: "manual_card" },
      /unjoined/,
    ],
  ];
  it.each(breaches)("%s", (_n, role, type, data, why) => {
    const found = frameViolations(role, type, data, true);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toMatch(why);
  });

  it("dev_state without welcome.dev_mode is a breach, with it is not", () => {
    expect(
      frameViolations("tower", "dev_state", { vars: { FIRE_SIDE: "LEFT" } }, false),
    ).toHaveLength(1);
    expect(frameViolations("tower", "dev_state", { vars: { FIRE_SIDE: "LEFT" } }, true)).toEqual(
      [],
    );
  });
});

describe("frameViolations lets legal frames through", () => {
  const fine: [string, Role | null, string, unknown][] = [
    [
      "Tower row_index on success",
      "tower",
      "action_result",
      { type: "action_result", success: true, row_index: 1 },
    ],
    [
      "Tower used on failure",
      "tower",
      "action_result",
      {
        type: "action_result",
        success: false,
        used: { object_id: "A", label: [], verb: "press", count: 1 },
      },
    ],
    [
      "Tower cinematic without secrets",
      "tower",
      "cinematic",
      { type: "cinematic", params: { retry: true } },
    ],
    [
      "Flyer cinematic with all secrets",
      "flyer",
      "cinematic",
      { type: "cinematic", params: { fire_side: "left", damaged_side: "right" } },
    ],
    [
      "Tower tower:/both: fx",
      "tower",
      "fx",
      { type: "fx", effects: ["tower:stamp", "both:signal_flash"] },
    ],
    [
      "Flyer sfx/fx/both fx",
      "flyer",
      "fx",
      {
        type: "fx",
        effects: ["sfx:clunk", "sfx_stop:fire_bell", "fx:yaw:left", "both:static_dip"],
      },
    ],
    ["Flyer flyer_view", "flyer", "flyer_view", { type: "flyer_view", quick_replies: [] }],
    [
      "Tower manual_card with quick_say",
      "tower",
      "manual_card",
      { type: "manual_card", card: { quick_say: null, rows: [] } },
    ],
    ["spectator room_state", null, "room_state", { type: "room_state" }],
  ];
  it.each(fine)("%s", (_n, role, type, data) => {
    expect(frameViolations(role, type, data, true)).toEqual([]);
  });
});

/** A scripted socket for the wire tap. */
function scriptedSocket(url: string) {
  let sent: (f: { payload: string | Buffer }) => void = () => undefined;
  let received: (f: { payload: string | Buffer }) => void = () => undefined;
  const sock: TapSocket = {
    url,
    onSent: (cb) => (sent = cb),
    onReceived: (cb) => (received = cb),
  };
  return {
    sock,
    send: (v: unknown) => sent({ payload: typeof v === "string" ? v : j(v) }),
    recv: (v: unknown) => received({ payload: j(v) }),
  };
}

describe("Wire (real-mode tap)", () => {
  const join = (role: Role) => ({ type: "join", name: "A", role, lang: "en", gender: "male" });

  it("reports a Flyer-only frame that reached a Tower socket", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    s.send(join("tower"));
    s.recv({ type: "flyer_view" });
    expect(wire.privacyViolations("ABCD")).toEqual(["tower received flyer_view"]);
  });

  it("attributes frames from before the join once the role is known", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    // Before `join`: the socket has no role, so the frame is held against whoever joins on it.
    s.recv({ type: "welcome", dev_mode: true });
    s.recv({ type: "object_state", object_id: "OH_BTN_1" });
    s.send(join("tower"));
    expect(wire.privacyViolations("ABCD").join()).toMatch(/tower received object_state/);
    expect(wire.received("ABCD", "welcome", "tower")).toHaveLength(1);
  });

  it("flags private frames on a socket that never joins", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    s.recv({ type: "manual_card", card: null });
    expect(wire.privacyViolations("ABCD").join()).toMatch(/unjoined socket received manual_card/);
  });

  it("follows a role swap: frames after the new `joined` belong to the new role", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    s.send(join("flyer"));
    s.recv({ type: "flyer_view" });
    expect(wire.privacyViolations("ABCD")).toEqual([]);
    s.recv({ type: "joined", role: "tower" });
    s.recv({ type: "flyer_view" });
    expect(wire.privacyViolations("ABCD")).toEqual(["tower received flyer_view"]);
  });

  it("records an extra-field frame as bad and keeps it out of sent()", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    s.send(join("flyer"));
    s.send({ type: "interact", object_id: "OH_BTN_1", verb: "press", extra: 1 });
    s.send({ type: "interact", object_id: "OH_BTN_1", verb: "press" });
    expect(wire.badFrames).toHaveLength(1);
    expect(wire.badFrames[0]).toMatch(/unknown field "extra"/);
    expect(wire.sent("ABCD", "interact", "flyer")).toEqual([
      { type: "interact", object_id: "OH_BTN_1", verb: "press" },
    ]);
  });

  it("records malformed JSON text frames as bad", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/ws/ABCD");
    wire.tapSocket(s.sock);
    s.send("{not json");
    expect(wire.badFrames.join()).toMatch(/not JSON/);
  });

  it("ignores Vite's HMR socket", () => {
    const wire = new Wire(null);
    const s = scriptedSocket("ws://x/?token=abc");
    wire.tapSocket(s.sock);
    s.recv({ type: "flyer_view" });
    expect(wire.frames("ABCD")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The fake server against the spec (BACKEND_SPEC §B8–§B14)
// ---------------------------------------------------------------------------

class Sock {
  private handler: (raw: string | Buffer) => void = () => undefined;
  onMessage(h: (raw: string | Buffer) => void): void {
    this.handler = h;
  }
  onClose(): void {
    /* never closes in these tests */
  }
  send(): void {
    /* the game logs what it sends */
  }
  client(msg: C2S | string): void {
    this.handler(typeof msg === "string" ? msg : j(msg));
  }
}

class Player {
  readonly sock = new Sock();
  readonly game: FakeGame;
  readonly role: Role;
  constructor(game: FakeGame, role: Role, lang: Lang) {
    this.game = game;
    this.role = role;
    game.attach(this.sock);
    this.send({ type: "join", name: role, role, lang, gender: "female" });
  }
  send(msg: C2S | string): void {
    this.sock.client(msg);
  }
  interact(object_id: string, verb: Verb = "press"): void {
    this.send({ type: "interact", object_id, verb });
  }
  dev(cmd: Extract<C2S, { type: "dev" }>["cmd"], args?: Record<string, unknown>): void {
    this.send(args ? { type: "dev", cmd, args } : { type: "dev", cmd });
  }
  say(text: string): void {
    this.send({ type: "say_text", text });
  }
  /** Everything this role was sent after `mark`. */
  since(mark: number): S2C[] {
    return this.game.sent
      .slice(mark)
      .filter((r) => r.role === this.role)
      .map((r) => r.msg);
  }
  get got(): S2C[] {
    return this.since(0);
  }
}

interface Room {
  game: FakeGame;
  flyer: Player;
  tower: Player;
}

const live: FakeGame[] = [];
afterEach(() => {
  for (const g of live.splice(0)) g.dispose();
  vi.useRealTimers();
});

function room(towerLang: Lang = "hi"): Room {
  vi.useFakeTimers();
  const game = new FakeGame("ZZZZ", { botDelayMs: 100 });
  live.push(game);
  const flyer = new Player(game, "flyer", towerLang === "hi" ? "en" : "hi");
  const tower = new Player(game, "tower", towerLang);
  return { game, flyer, tower };
}

const mark = (r: Room): number => r.game.sent.length;
const lastGame = (r: Room) => r.game.deliveredTo("game_state", "flyer").at(-1);
const errors = (msgs: S2C[]) => msgs.flatMap((m) => (m.type === "error" ? [m.code] : []));
const results = (msgs: S2C[]) => msgs.flatMap((m) => (m.type === "action_result" ? [m] : []));
const cinematics = (msgs: S2C[]) => msgs.flatMap((m) => (m.type === "cinematic" ? [m] : []));

/** Both ready; the prologue is running. */
function startGame(towerLang: Lang = "hi"): Room {
  const r = room(towerLang);
  r.flyer.send({ type: "ready" });
  r.tower.send({ type: "ready" });
  expect(lastGame(r)?.status).toBe("PROLOGUE");
  return r;
}

/** Skip cinematics and wait out gaps until an action is open (and not behind an event). */
function untilActive(r: Room): void {
  for (let i = 0; i < 60; i++) {
    const g = lastGame(r);
    if (g?.status === "PLAYING" && g.action_active) return;
    if (g?.input_locked) r.tower.dev("skip_cinematic");
    vi.advanceTimersByTime(400);
  }
  throw new Error(`never reached an active action (${JSON.stringify(lastGame(r))})`);
}

function toAction(towerLang: Lang = "hi"): Room {
  const r = startGame(towerLang);
  untilActive(r);
  expect(lastGame(r)?.action_id).toBe("P1_A1");
  return r;
}

/** Dev-complete the open action and open the next one. */
function nextAction(r: Room): void {
  r.tower.dev("complete_action");
  vi.advanceTimersByTime(100);
  untilActive(r);
}

function toPhase(r: Room, n: 1 | 2 | 3): void {
  r.tower.dev("goto_phase", { phase: n });
  untilActive(r);
}

describe("fake server: the judge (§B9.3)", () => {
  it("ignores clicks in a cinematic, in the gap, on another station: a bounce, no error, no penalty", () => {
    const r = startGame();
    // A cinematic is running (the prologue).
    let m = mark(r);
    r.flyer.interact("OH_BTN_1");
    expect(r.flyer.since(m)).toEqual([
      { type: "object_state", object_id: "OH_BTN_1", state: { kind: "button" }, bounce: true },
    ]);
    untilActive(r);
    const fuel = lastGame(r)?.fuel_s;
    // Another station (the pedestal) while Phase 1 is active.
    m = mark(r);
    r.flyer.interact("PD_EXT_BTN");
    expect(errors(r.flyer.since(m))).toEqual([]);
    expect(results(r.flyer.since(m))).toEqual([]);
    expect(r.flyer.since(m)).toContainEqual(
      expect.objectContaining({ type: "object_state", bounce: true }),
    );
    expect(results(r.tower.since(m))).toEqual([]);
    expect(lastGame(r)?.fuel_s).toBe(fuel);
    // The gap after a success.
    r.tower.dev("complete_action");
    expect(lastGame(r)?.action_active).toBe(false);
    m = mark(r);
    r.flyer.interact("OH_BTN_1");
    expect(errors(r.flyer.since(m))).toEqual([]);
    expect(results(r.flyer.since(m))).toEqual([]);
    expect(r.flyer.since(m)).toContainEqual(
      expect.objectContaining({ type: "object_state", bounce: true }),
    );
    expect(r.game.violations).toEqual([]);
  });

  it("answers an interact with a verb the part can't take with bad_message, a lamp too", () => {
    const r = toAction();
    let m = mark(r);
    r.flyer.interact("OH_BTN_1", "toggle");
    expect(errors(r.flyer.since(m))).toEqual(["bad_message"]);
    m = mark(r);
    r.flyer.interact("OH_MASTER_LAMP");
    expect(errors(r.flyer.since(m))).toEqual(["bad_message"]);
    m = mark(r);
    r.flyer.interact("NOPE");
    expect(errors(r.flyer.since(m))).toEqual(["bad_message"]);
  });

  it("only the Flyer may interact", () => {
    const r = toAction();
    const m = mark(r);
    r.tower.interact("OH_BTN_1");
    expect(errors(r.tower.since(m))).toEqual(["not_your_role"]);
  });

  it("wrong_object: -10 s, bounce, both get action_result, only the Tower gets `used`", () => {
    const r = toAction();
    const fuel = lastGame(r)?.fuel_s ?? 0;
    const m = mark(r);
    r.flyer.interact("OH_BTN_BLUE");
    const [fly] = results(r.flyer.since(m));
    const [tow] = results(r.tower.since(m));
    expect(fly).toMatchObject({ success: false, reason: "wrong_object", fuel_delta: -10 });
    expect(fly).not.toHaveProperty("used");
    expect(tow).toMatchObject({
      reason: "wrong_object",
      used: { object_id: "OH_BTN_BLUE", verb: "press", count: 1 },
    });
    expect(r.flyer.since(m)).toContainEqual({
      type: "object_state",
      object_id: "OH_BTN_BLUE",
      state: { kind: "button" },
      bounce: true,
    });
    expect(lastGame(r)?.fuel_s).toBe(fuel - 10);
    // The Tower's manual carries last_wrong.
    const card = r.tower.since(m).flatMap((x) => (x.type === "manual_card" ? [x.card] : []));
    expect(card.at(-1)?.last_wrong).toMatchObject({ count: 1 });
  });

  it("a single press is counted until the 1200 ms debounce, measured from the last press", () => {
    const r = toAction();
    const m = mark(r);
    r.flyer.interact("OH_BTN_1");
    vi.advanceTimersByTime(PRESS_DEBOUNCE_MS - 1);
    expect(results(r.flyer.since(m))).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(results(r.flyer.since(m))).toEqual([
      expect.objectContaining({ success: true, completed_steps: 1, total_steps: 1 }),
    ]);
    // row_index is Tower-only and success-only.
    expect(results(r.tower.since(m))[0]).toMatchObject({ success: true, row_index: 0 });
    expect(results(r.flyer.since(m))[0]).not.toHaveProperty("row_index");
  });

  it("wrong_count: the wrong number of presses is judged at the debounce, with used.count", () => {
    const r = toAction();
    toPhase(r, 2);
    nextAction(r); // B1 done, B2 (press the fire button twice) open
    expect(lastGame(r)?.action_id).toBe("P2_B2");
    let m = mark(r);
    r.flyer.interact("PD_EXT_BTN");
    vi.advanceTimersByTime(PRESS_DEBOUNCE_MS - 1);
    expect(results(r.tower.since(m))).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(results(r.tower.since(m))[0]).toMatchObject({
      success: false,
      reason: "wrong_count",
      used: { object_id: "PD_EXT_BTN", count: 1 },
    });
    // Two presses 1000 ms apart (inside the window) count as 2; the timer restarts at the last.
    m = mark(r);
    r.flyer.interact("PD_EXT_BTN");
    vi.advanceTimersByTime(1000);
    r.flyer.interact("PD_EXT_BTN");
    vi.advanceTimersByTime(PRESS_DEBOUNCE_MS - 1);
    expect(results(r.flyer.since(m))).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(results(r.flyer.since(m))[0]).toMatchObject({ success: true });
  });

  it("wrong_order, and a different object finalizes the pending count at once", () => {
    const r = toAction();
    nextAction(r); // A2
    nextAction(r); // A3: press button two, then button three (ordered)
    expect(lastGame(r)?.action_id).toBe("P1_A3");
    let m = mark(r);
    r.flyer.interact("OH_BTN_3"); // the second step first
    expect(results(r.tower.since(m))[0]).toMatchObject({ reason: "wrong_order", fuel_delta: -10 });
    m = mark(r);
    r.flyer.interact("OH_BTN_2");
    r.flyer.interact("OH_BTN_3"); // finalizes BTN_2 (1 == 1) immediately, then counts BTN_3
    vi.advanceTimersByTime(PRESS_DEBOUNCE_MS - 1);
    expect(results(r.flyer.since(m))).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(results(r.flyer.since(m))[0]).toMatchObject({
      success: true,
      completed_steps: 2,
      total_steps: 2,
    });
    // In-phase cinematic after P1_A3 (p1_seat), then the outro; the world keeps up.
    expect(cinematics(r.flyer.since(m)).map((c) => c.id)).toContain("p1_seat");
  });

  it("wrong_direction on a lever, and the right move completes it (Phase 3)", () => {
    const r = toAction();
    toPhase(r, 3);
    nextAction(r); // C1 done
    nextAction(r); // C2 done, p3_runway_reveal skipped, C3 opens behind lightning_strike
    expect(lastGame(r)?.action_id).toBe("P3_C3");
    let m = mark(r);
    r.flyer.interact("FP_LEVER_2", "move_up");
    expect(results(r.tower.since(m))[0]).toMatchObject({ reason: "wrong_direction" });
    m = mark(r);
    r.flyer.interact("FP_LEVER_2", "move_down");
    expect(r.flyer.since(m)).toContainEqual({
      type: "object_state",
      object_id: "FP_LEVER_2",
      state: { kind: "lever", value: "down" },
      bounce: false,
    });
    expect(results(r.flyer.since(m))[0]).toMatchObject({ success: true });
  });

  it("the lightning_strike event keeps the action inactive until it ends", () => {
    const r = toAction();
    toPhase(r, 3);
    nextAction(r);
    r.tower.dev("complete_action"); // C2 -> runway reveal
    vi.advanceTimersByTime(100);
    const m = mark(r);
    for (
      let i = 0;
      i < 20 && !cinematics(r.flyer.since(m)).some((c) => c.id === "lightning_strike");
      i++
    ) {
      if (lastGame(r)?.input_locked) r.tower.dev("skip_cinematic");
      vi.advanceTimersByTime(300);
    }
    expect(cinematics(r.flyer.since(m)).map((c) => c.id)).toContain("lightning_strike");
    expect(lastGame(r)).toMatchObject({
      action_id: "P3_C3",
      action_active: false,
      input_locked: true,
    });
    r.tower.dev("skip_cinematic");
    expect(lastGame(r)).toMatchObject({ action_active: true, input_locked: false });
  });

  it("dev fail_action is wrong_object with `used` = the first expected object", () => {
    const r = toAction();
    const fuel = lastGame(r)?.fuel_s ?? 0;
    const m = mark(r);
    r.tower.dev("fail_action");
    expect(results(r.flyer.since(m))[0]).toMatchObject({ success: false, reason: "wrong_object" });
    expect(results(r.flyer.since(m))[0]).not.toHaveProperty("used");
    expect(results(r.tower.since(m))[0]).toMatchObject({
      reason: "wrong_object",
      used: { object_id: "OH_BTN_1", verb: "press", count: 1 },
    });
    expect(lastGame(r)?.fuel_s).toBe(fuel - 10);
  });

  it("dev complete_action puts every expected control in its target state, reason dev", () => {
    const r = toAction();
    nextAction(r); // A2 (pull lever three)
    const m = mark(r);
    r.tower.dev("complete_action");
    expect(r.flyer.since(m)).toContainEqual({
      type: "object_state",
      object_id: "OH_HANDLE_3",
      state: { kind: "handle", value: "out" },
      bounce: false,
    });
    expect(results(r.flyer.since(m))[0]).toMatchObject({ success: true, reason: "dev" });
  });
});

describe("fake server: fuel, crash and retry (§B10, §B8.2)", () => {
  it("has 150 / 150 / 180 s per phase and matching fuel_max_s", () => {
    const r = toAction();
    expect(lastGame(r)).toMatchObject({ fuel_s: 150, fuel_max_s: 150 });
    toPhase(r, 2);
    expect(lastGame(r)).toMatchObject({ fuel_s: 150, fuel_max_s: 150 });
    toPhase(r, 3);
    expect(lastGame(r)).toMatchObject({ fuel_s: 180, fuel_max_s: 180 });
  });

  it("drains during the gap and not during an in-phase cinematic", () => {
    const r = toAction();
    r.tower.dev("complete_action"); // the 1.5 s gap starts
    const before = lastGame(r)?.fuel_s ?? 0;
    vi.advanceTimersByTime(1000);
    expect(lastGame(r)).toMatchObject({ fuel_draining: true });
    expect(lastGame(r)?.fuel_s).toBe(before - 1);
    nextAction(r); // A2
    nextAction(r); // A3
    r.tower.dev("complete_action"); // p1_seat starts
    vi.advanceTimersByTime(300);
    expect(lastGame(r)).toMatchObject({ input_locked: true, fuel_draining: false });
    const frozen = lastGame(r)?.fuel_s;
    vi.advanceTimersByTime(2000);
    expect(lastGame(r)?.fuel_s).toBe(frozen);
  });

  it("crashes at 0: crash, the 5 s crash cinematic (not skippable), retry votes, retry", () => {
    const r = toAction();
    r.tower.dev("add_fuel", { seconds: -146 });
    expect(lastGame(r)?.fuel_s).toBe(4);
    const m = mark(r);
    vi.advanceTimersByTime(4100);
    expect(lastGame(r)).toMatchObject({ status: "CRASH", fuel_s: 0 });
    for (const p of [r.flyer, r.tower])
      expect(p.since(m)).toContainEqual({ type: "crash", phase: 1 });
    expect(cinematics(r.flyer.since(m)).at(-1)).toMatchObject({ id: "crash", duration_ms: 5000 });
    // Not skippable by votes.
    const m2 = mark(r);
    r.flyer.send({ type: "skip_cinematic" });
    r.tower.send({ type: "skip_cinematic" });
    expect(r.flyer.since(m2).filter((x) => x.type === "cinematic_skip")).toEqual([]);
    // Retry: one vote waits, both go back to p1_intro with retry:true (3200 ms).
    r.flyer.send({ type: "retry" });
    expect(lastGame(r)?.status).toBe("CRASH");
    expect(r.game.deliveredTo("retry_votes", "tower").at(-1)).toEqual({
      type: "retry_votes",
      roles: ["flyer"],
    });
    const m3 = mark(r);
    r.tower.send({ type: "retry" });
    expect(lastGame(r)).toMatchObject({ status: "PHASE_INTRO", phase: 1, attempt: 2 });
    expect(cinematics(r.tower.since(m3))[0]).toMatchObject({
      id: "p1_intro",
      duration_ms: 3200,
      params: { retry: true },
    });
    untilActive(r);
    expect(lastGame(r)).toMatchObject({ fuel_s: 150, lifelines: { flyer: 3, tower: 3 } });
    expect(r.game.violations).toEqual([]);
  });

  it("a wrong action that takes the last fuel also crashes", () => {
    const r = toAction();
    r.tower.dev("add_fuel", { seconds: -145 });
    r.flyer.interact("OH_BTN_BLUE");
    expect(lastGame(r)).toMatchObject({ status: "CRASH", fuel_s: 0 });
  });

  it("retry outside CRASH is refused", () => {
    const r = toAction();
    const m = mark(r);
    r.flyer.send({ type: "retry" });
    expect(errors(r.flyer.since(m))).toEqual(["not_allowed_now"]);
  });
});

describe("fake server: lifelines (§B14.2)", () => {
  it("a repeat request is free and answered before the no_lifelines check", () => {
    const r = toAction();
    toPhase(r, 3);
    const lines = ["Teen number button dabao", "Laal lever kheencho", "Ek number button dabao"];
    for (const l of lines) r.tower.say(l);
    const ids = r.game.deliveredTo("utterance", "flyer").map((u) => u.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) r.flyer.send({ type: "lifeline", utterance_id: id });
    expect(r.game.deliveredTo("translation", "flyer").map((t) => t.lifelines_left)).toEqual([
      2, 1, 0,
    ]);
    expect(lastGame(r)?.lifelines.flyer).toBe(0);

    // At 0 lifelines, asking for a line already decoded still returns its translation.
    const m = mark(r);
    r.flyer.send({ type: "lifeline", utterance_id: ids[1] ?? "" });
    expect(errors(r.flyer.since(m))).toEqual([]);
    expect(r.flyer.since(m)).toEqual([
      expect.objectContaining({ type: "translation", utterance_id: ids[1], lifelines_left: 0 }),
    ]);
    expect(lastGame(r)?.lifelines.flyer).toBe(0);

    // A fresh line at 0 is refused; a line pushed out of the last 3 is not available.
    r.tower.say("Haan, neela");
    const fresh = r.game.deliveredTo("utterance", "flyer").at(-1)?.id ?? "";
    const m2 = mark(r);
    r.flyer.send({ type: "lifeline", utterance_id: fresh });
    r.flyer.send({ type: "lifeline", utterance_id: ids[0] ?? "" });
    expect(errors(r.flyer.since(m2))).toEqual(["no_lifelines", "lifeline_not_available"]);
  });

  it("translates into the listener's script and only in Phase 3", () => {
    const r = toAction();
    r.tower.say("Press button one");
    const early = r.game.deliveredTo("utterance", "flyer").at(-1)?.id ?? "";
    const m = mark(r);
    r.flyer.send({ type: "lifeline", utterance_id: early });
    expect(errors(r.flyer.since(m))).toEqual(["lifeline_not_available"]);
    toPhase(r, 3);
    r.flyer.say("Press button three");
    const id = r.game.deliveredTo("utterance", "tower").at(-1)?.id ?? "";
    r.tower.send({ type: "lifeline", utterance_id: id });
    expect(r.game.deliveredTo("translation", "tower").at(-1)?.text).toMatch(DEVANAGARI); // Tower is Hindi
    r.tower.say("Laal lever kheencho");
    const id2 = r.game.deliveredTo("utterance", "flyer").at(-1)?.id ?? "";
    r.flyer.send({ type: "lifeline", utterance_id: id2 });
    expect(r.game.deliveredTo("translation", "flyer").at(-1)?.text).not.toMatch(DEVANAGARI); // Flyer is English
  });
});

describe("fake server: Latin-only subtitles and quick-say (§A2 rule 3, §B11, §A8)", () => {
  it("romanizes Devanagari input in segments and in the speaker's echo", () => {
    const r = startGame();
    r.tower.say("एक नंबर बटन दबाओ।");
    const [u] = r.game.deliveredTo("utterance", "flyer");
    const text = (u?.segments ?? []).map((s) => s.text).join("");
    expect(text).toBe("Ek number button dabao.");
    expect(text).not.toMatch(DEVANAGARI);
    for (const s of u?.segments ?? []) {
      expect(s.text).not.toMatch(DEVANAGARI);
      expect(s.gloss ?? "").not.toMatch(DEVANAGARI);
    }
    const echo = r.game.deliveredTo("utterance_echo", "tower").at(-1);
    expect(echo?.transcript_display).toBe("Ek number button dabao.");
  });

  it("holds in the other pairing too (Flyer Hindi, Tower English)", () => {
    const r = startGame("en");
    r.flyer.say("लाल लीवर खींचो");
    const [u] = r.game.deliveredTo("utterance", "tower");
    expect((u?.segments ?? []).map((s) => s.text).join("")).toBe("Laal lever kheencho");
    // An English listener's translation of it is English, never Devanagari.
    toPhase(r, 3);
    r.flyer.say("लाल लीवर खींचो");
    const id = r.game.deliveredTo("utterance", "tower").at(-1)?.id ?? "";
    r.tower.send({ type: "lifeline", utterance_id: id });
    expect(r.game.deliveredTo("translation", "tower").at(-1)?.text).not.toMatch(DEVANAGARI);
  });

  it("romanizes with the Hinglish fallback", () => {
    expect(romanize("नमस्ते")).toBe("namaste");
    expect(romanize("विमान")).toBe("vimaan");
    expect(romanize("उतार")).toBe("utaar");
    expect(romanize("ज़मीन")).toBe("zameen");
    expect(romanize("लाल")).toBe("laal");
    expect(subtitleText("3 button dabao", "hi")).toBe("Teen button dabao");
    expect(subtitleText("३ button", "en")).toBe("Three button");
    expect(subtitleText("hello. world", "en")).toBe("Hello. World");
  });

  it("quick-say: text is hi_roman for a Hindi Tower with the Devanagari line as alt_text", () => {
    const r = toAction("hi");
    const card = r.game.deliveredTo("manual_card", "tower").at(-1)?.card;
    expect(card?.quick_say?.say).toEqual({
      label: "Ek number button dabao",
      text: "Ek number button dabao",
      alt_text: "एक नंबर बटन दबाओ",
    });
  });

  it("quick-say: text is English for an English Tower, with no Devanagari alt_text", () => {
    const r = toAction("en");
    const say = r.game.deliveredTo("manual_card", "tower").at(-1)?.card?.quick_say?.say;
    expect(say).toEqual({ label: "Press button one", text: "Press button one" });
    expect(say).not.toHaveProperty("alt_text");
  });

  it("quick_replies are in the Flyer's own language", () => {
    const hi = toAction("en"); // Flyer Hindi
    expect(hi.game.deliveredTo("flyer_view", "flyer").at(-1)?.quick_replies?.[0]).toMatchObject({
      text: "haan",
      alt_text: "हाँ",
    });
    const en = toAction("hi");
    expect(en.game.deliveredTo("flyer_view", "flyer").at(-1)?.quick_replies?.[0]).toMatchObject({
      text: "yes",
    });
  });
});

describe("fake server: deck votes (§B8.5)", () => {
  function toDeck(): Room {
    const r = toAction();
    for (let i = 0; i < 400 && lastGame(r)?.status !== "DECK"; i++) {
      r.tower.dev("skip_cinematic");
      r.tower.dev("complete_action");
      vi.advanceTimersByTime(700);
    }
    expect(lastGame(r)?.status).toBe("DECK");
    return r;
  }
  const votes = (r: Room) => r.game.deliveredTo("room_state", "tower").at(-1)?.play_again_votes;

  it("one current vote per player: a later vote replaces the earlier", () => {
    const r = toDeck();
    r.flyer.send({ type: "play_again" });
    expect(votes(r)).toEqual(["flyer"]);
    r.flyer.send({ type: "swap_roles" });
    expect(votes(r)).toEqual([]);
    expect(lastGame(r)?.status).toBe("DECK");
    // Matching swap votes act: roles swap, languages kept, LOBBY, `joined` re-sent.
    const m = mark(r);
    r.tower.send({ type: "swap_roles" });
    const state = r.game.deliveredTo("room_state", "tower").at(-1);
    expect(state?.status).toBe("LOBBY");
    expect(state?.players.map((p) => [p.role, p.lang, p.ready]).sort()).toEqual([
      ["flyer", "hi", false],
      ["tower", "en", false],
    ]);
    const rejoined = r.game.sent
      .slice(m)
      .map((x) => x.msg)
      .flatMap((x) => (x.type === "joined" ? [[x.role, x.lang]] : []))
      .sort();
    expect(rejoined).toEqual([
      ["flyer", "hi"],
      ["tower", "en"],
    ]);
  });

  it("mismatched votes wait; matching play_again starts a new game", () => {
    const r = toDeck();
    r.flyer.send({ type: "play_again" });
    r.tower.send({ type: "swap_roles" });
    expect(lastGame(r)?.status).toBe("DECK");
    expect(votes(r)).toEqual(["flyer"]);
    r.tower.send({ type: "play_again" });
    expect(lastGame(r)?.status).toBe("PROLOGUE");
    expect(votes(r)).toEqual([]);
  });
});

describe("fake server: privacy of its own output", () => {
  it("a whole scripted game leaves no §A9 breach on the wire it logged", () => {
    vi.useFakeTimers();
    const rooms = new FakeRooms({ botDelayMs: 100 });
    const game = rooms.room("QQQQ");
    live.push(game);
    const flyer = new Player(game, "flyer", "en");
    const tower = new Player(game, "tower", "hi");
    flyer.send({ type: "ready" });
    tower.send({ type: "ready" });
    for (let i = 0; i < 500; i++) {
      tower.dev("skip_cinematic");
      tower.dev("complete_action");
      tower.say("एक नंबर बटन दबाओ");
      vi.advanceTimersByTime(700);
      if (game.deliveredTo("game_state", "tower").at(-1)?.status === "DECK") break;
    }
    flyer.interact("OH_BTN_BLUE");
    expect(game.deliveredTo("game_state", "tower").at(-1)?.status).toBe("DECK");
    const wire = new Wire(rooms);
    expect(wire.privacyViolations("QQQQ")).toEqual([]);
    expect(game.violations).toEqual([]);
    expect(game.badFrames).toEqual([]);
    // The Tower's frames really contain the cinematics, results and card the checks looked at.
    expect(wire.received("QQQQ", "cinematic", "tower").length).toBeGreaterThan(5);
    expect(wire.received("QQQQ", "manual_card", "tower").length).toBeGreaterThan(0);
    expect(wire.received("QQQQ", "flyer_view", "flyer").length).toBeGreaterThan(0);
  });

  it("answers a frame that breaks §A7 with bad_message and logs it", () => {
    const r = toAction();
    const m = mark(r);
    r.flyer.send(j({ type: "interact", object_id: "OH_BTN_1", verb: "press", extra: 1 }));
    expect(errors(r.flyer.since(m))).toEqual(["bad_message"]);
    expect(r.game.badFrames).toHaveLength(1);
    expect(results(r.flyer.since(m))).toEqual([]);
  });
});
