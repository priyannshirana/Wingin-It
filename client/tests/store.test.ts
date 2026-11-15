import { beforeEach, describe, expect, it } from "vitest";
import type { S2C } from "../src/net/protocol";
import { SUBTITLE_KEEP, useStore } from "../src/state/store";
import {
  actionResult,
  cinematic,
  deck,
  flyerView,
  gameState,
  manualCard,
  roomState,
  utterance,
  welcome,
} from "./fixtures/messages";

const receive = (msg: S2C) => useStore.getState().receive(msg);
const state = () => useStore.getState();

beforeEach(() => {
  useStore.getState().reset();
});

describe("store reducer (§F6)", () => {
  it("handshake: welcome, joined, room_state", () => {
    receive(welcome());
    expect(state().welcome?.mock_speech).toBe(true);
    receive({
      type: "joined",
      player_id: "p-flyer",
      token: "t",
      role: "flyer",
      lang: "en",
      gender: "female",
      name: "Flyer",
    });
    expect(state().me).toEqual({
      id: "p-flyer",
      role: "flyer",
      lang: "en",
      gender: "female",
      name: "Flyer",
    });
    receive(roomState());
    expect(state().room?.players).toHaveLength(2);
    expect(state().status).toBe("LOBBY");
  });

  it("follows my player's changes from room_state (update_player, swap_roles)", () => {
    receive({
      type: "joined",
      player_id: "p-flyer",
      token: "t",
      role: "flyer",
      lang: "en",
      gender: "female",
      name: "Flyer",
    });
    receive(
      roomState({
        players: [
          {
            id: "p-flyer",
            name: "Flyer",
            role: "tower",
            lang: "en",
            gender: "male",
            ready: false,
            connected: true,
            is_bot: false,
          },
        ],
      }),
    );
    expect(state().me).toMatchObject({ role: "tower", gender: "male" });
  });

  it("pong changes nothing (the clock lives in net/clock)", () => {
    const before = state();
    receive({ type: "pong", client_ms: 1, server_ms: 2 });
    expect(state().game).toBe(before.game);
  });

  it("game_state sets status and clears the crash on leaving CRASH", () => {
    receive({ type: "crash", phase: 1 });
    receive({ type: "retry_votes", roles: ["flyer"] });
    receive(gameState({ status: "CRASH" }));
    expect(state().crashed).toBe(true);
    expect(state().retryVotes).toEqual(["flyer"]);
    receive(gameState({ status: "PHASE_INTRO" }));
    expect(state().crashed).toBe(false);
    expect(state().retryVotes).toEqual([]);
    expect(state().status).toBe("PHASE_INTRO");
  });

  it("game_state LOBBY (abandon) resets the game", () => {
    receive(gameState());
    receive(flyerView());
    receive(utterance());
    receive(gameState({ status: "LOBBY" }));
    expect(state().game).toBeNull();
    expect(state().subtitles).toEqual([]);
    expect(state().flyer.station).toBeNull();
    expect(state().status).toBe("LOBBY");
  });

  it("flyer_view replaces the flyer slice wholesale", () => {
    receive(flyerView());
    expect(state().flyer.station).toBe("overhead");
    expect(state().flyer.interactive.has("OH_BTN_1")).toBe(true);
    receive(flyerView({ station: "pedestal", interactive: [], quick_replies: null }));
    expect(state().flyer.interactive.size).toBe(0);
    expect(state().flyer.quickReplies).toBeNull();
  });

  it("object_state updates one object; bounce bumps that part's tick", () => {
    receive(flyerView());
    receive({
      type: "object_state",
      object_id: "OH_SW_1",
      state: { kind: "toggle", value: "off" },
      bounce: false,
    });
    expect(state().flyer.objects.OH_SW_1).toEqual({ kind: "toggle", value: "off" });
    expect(state().bounceTick.OH_SW_1).toBeUndefined();
    receive({
      type: "object_state",
      object_id: "OH_SW_3",
      state: { kind: "toggle", value: "on" },
      bounce: true,
    });
    receive({
      type: "object_state",
      object_id: "OH_SW_3",
      state: { kind: "toggle", value: "on" },
      bounce: true,
    });
    expect(state().bounceTick.OH_SW_3).toBe(2);
    expect(state().flyer.objects.OH_SW_1).toEqual({ kind: "toggle", value: "off" });
  });

  it("manual_card sets and clears the card", () => {
    receive({ type: "manual_card", card: manualCard() });
    expect(state().card?.action_id).toBe("P1_A1");
    receive({ type: "manual_card", card: null });
    expect(state().card).toBeNull();
  });

  it("cinematic, skip_votes, cinematic_skip", () => {
    receive(cinematic());
    expect(state().cinematic).toMatchObject({ id: "p1_intro", skipped: false });
    receive({ type: "skip_votes", id: "p1_intro", roles: ["tower"] });
    expect(state().skipVotes).toEqual(["tower"]);
    receive({ type: "skip_votes", id: "prologue", roles: ["flyer", "tower"] }); // stale id
    expect(state().skipVotes).toEqual(["tower"]);
    receive({ type: "cinematic_skip", id: "p1_intro" });
    expect(state().cinematic?.skipped).toBe(true);
    receive(cinematic({ id: "p1_seat", duration_ms: 3000 }));
    expect(state().skipVotes).toEqual([]);
    expect(state().cinematic?.skipped).toBe(false);
  });

  it("talk: partial, echo, dropped", () => {
    receive({ type: "caption_partial", text: "red the" });
    expect(state().partial).toBe("red the");
    receive({ type: "utterance_echo", id: "u9", transcript_display: "Red! The red one!" });
    expect(state().partial).toBeNull();
    expect(state().echo?.text).toBe("Red! The red one!");
    receive({ type: "caption_partial", text: "uh" });
    receive({ type: "utterance_dropped", reason: "too_short" });
    expect(state().partial).toBeNull();
    expect(state().toasts.at(-1)?.key).toBe("toast.didnt_catch");
  });

  it("keeps the last 10 subtitles, newest last", () => {
    for (let i = 0; i < 14; i++) receive(utterance({ id: `u${i}` }));
    const ids = state().subtitles.map((u) => u.id);
    expect(ids).toHaveLength(SUBTITLE_KEEP);
    expect(ids[0]).toBe("u4");
    expect(ids.at(-1)).toBe("u13");
  });

  it("history replaces the subtitles on rejoin and restores revealed translations", () => {
    receive(utterance({ id: "old" }));
    receive({
      type: "history",
      utterances: [utterance({ id: "h1" }), { ...utterance({ id: "h2" }), translation: "लाल" }],
    });
    expect(state().subtitles.map((u) => u.id)).toEqual(["h1", "h2"]);
    expect(state().translations.h2).toEqual({ text: "लाल", openedAt: 0, pending: false });
  });

  it("translation opens the reveal", () => {
    receive({
      type: "translation",
      utterance_id: "u1",
      text: "Which light is on — red or blue?",
      lang: "en",
      lifelines_left: 2,
    });
    const tr = state().translations.u1;
    expect(tr?.pending).toBe(false);
    expect(tr?.openedAt).toBeGreaterThan(0);
  });

  it("action_result sets lastResult; success with row_index sets the stamp", () => {
    receive(actionResult({ success: false, reason: "wrong_object", fuel_delta: -10 }));
    expect(state().lastResult?.reason).toBe("wrong_object");
    expect(state().successStamp).toBeNull();
    receive(actionResult({ row_index: 1 }));
    expect(state().successStamp).toEqual({ action_id: "P1_A1", row_index: 1 });
  });

  it("fx queue, channel, toast", () => {
    receive({ type: "fx", effects: ["sfx:clunk", "fx:shake:0.5:0.3"] });
    expect(state().fx.at(-1)?.effects).toEqual(["sfx:clunk", "fx:shake:0.5:0.3"]);
    receive({ type: "channel", busy_by: "tower" });
    expect(state().channel).toBe("tower");
    receive({ type: "toast", kind: "crossover", key: "toast.crossover", params: { word: "laal" } });
    expect(state().toasts.at(-1)).toMatchObject({ key: "toast.crossover", kind: "crossover" });
  });

  it("deck and the late report", () => {
    receive(gameState({ status: "DECK" }));
    receive(deck());
    expect(state().deck?.report_pending).toBe(true);
    receive({ type: "deck_report", report: "Great flying!" });
    expect(state().deck).toMatchObject({ report: "Great flying!", report_pending: false });
    receive(gameState({ status: "PROLOGUE" })); // play again
    expect(state().deck).toBeNull();
  });

  it("errors map to toasts, not-found, role_taken and console (§F7.3)", () => {
    receive({ type: "error", code: "channel_busy", message: "busy" });
    expect(state().toasts.at(-1)?.key).toBe("toast.channel_busy");
    receive({ type: "error", code: "transcribe_failed", message: "x" });
    expect(state().toasts.at(-1)?.key).toBe("toast.didnt_catch");
    state().setJoiningRole("tower");
    receive({ type: "error", code: "role_taken", message: "taken" });
    expect(state().rejectedRoles).toEqual(["tower"]);
    const toasts = state().toasts.length;
    receive({ type: "error", code: "lifeline_not_available", message: "no" });
    expect(state().toasts).toHaveLength(toasts);
    receive({ type: "error", code: "room_not_found", message: "nope" });
    expect(state().fatal).toBe("not_found");
  });

  it("dev_state is stored as is", () => {
    receive({
      type: "dev_state",
      room: "TEST",
      status: "PLAYING",
      phase: 1,
      action_id: "P1_A1",
      seed: 42,
      vars: { MASTER_COLOR: "RED" },
      forced: {},
      expected: [{ object: "OH_BTN_1", verb: "press", count: 1, done: false }],
      unordered: false,
      pending: null,
      fuel_s: 150,
      bots: { flyer: false, tower: false },
      exposure: {},
      last_utterance: null,
      latencies_ms: [],
    });
    expect(state().dev?.vars.MASTER_COLOR).toBe("RED");
  });

  it("lifeline bookkeeping: pending → translation; translation_failed clears the spinner", () => {
    state().markLifelinePending("u1");
    expect(state().translations.u1?.pending).toBe(true);
    receive({ type: "error", code: "translation_failed", message: "x" });
    expect(state().translations.u1).toBeUndefined();
    expect(state().toasts.at(-1)?.key).toBe("toast.translation_failed");
    state().markLifelinePending("u2");
    receive({
      type: "translation",
      utterance_id: "u2",
      text: "लाल",
      lang: "hi",
      lifelines_left: 2,
    });
    expect(state().translations.u2).toMatchObject({ text: "लाल", pending: false });
    state().collapseTranslation("u2");
    expect(state().translations.u2?.openedAt).toBe(0);
    state().reopenTranslation("u2");
    expect(state().translations.u2?.openedAt).toBeGreaterThan(0);
  });

  it("UI channels: cues are idempotent booleans; flash and red pulse bump ids", () => {
    const before = state().cues;
    state().setCue("mayday_stamp", false);
    expect(state().cues).toBe(before); // no-op when unchanged
    state().setCue("mayday_stamp", true);
    expect(state().cues.mayday_stamp).toBe(true);
    state().clearCues();
    expect(state().cues).toEqual({});
    state().flash("#fff", 60);
    const first = state().flashFx?.id ?? 0;
    state().flash("#dfe8ff", 80, 0.4);
    expect(state().flashFx).toMatchObject({ color: "#dfe8ff", ms: 80, opacity: 0.4 });
    expect(state().flashFx?.id).toBeGreaterThan(first);
    state().redPulse();
    expect(state().redPulseId).toBe(1);
  });

  it("mic and settings setters merge patches", () => {
    state().setMic({ permission: "granted" });
    expect(state().mic).toEqual({ permission: "granted", level: 0, transmitting: false });
    state().setSettings({ muted: true });
    expect(state().settings.muted).toBe(true);
    expect(state().settings.volume).toBe(0.5);
  });

  it("crash survives a PAUSED hop: CRASH → PAUSED(from CRASH) → CRASH keeps crashed + votes", () => {
    receive({ type: "crash", phase: 2 });
    receive(gameState({ status: "CRASH", phase: 2 }));
    receive({ type: "retry_votes", roles: ["flyer"] });
    receive(gameState({ status: "PAUSED", paused_from: "CRASH", phase: 2 }));
    expect(state().crashed).toBe(true);
    expect(state().retryVotes).toEqual(["flyer"]);
    receive(gameState({ status: "CRASH", phase: 2 }));
    expect(state().crashed).toBe(true);
    expect(state().retryVotes).toEqual(["flyer"]);
    // a PAUSED hop out of PLAYING is not a crash
    receive(gameState({ status: "PAUSED", paused_from: "PLAYING" }));
    expect(state().crashed).toBe(false);
    expect(state().retryVotes).toEqual([]);
  });

  it("a rejoin snapshot in CRASH (no `crash` message) still shows the crash", () => {
    receive(welcome());
    receive(gameState({ status: "CRASH", phase: 1 }));
    expect(state().crashed).toBe(true);
  });

  it("leaveRoom forgets the room but keeps settings and the UI language", () => {
    state().setSettings({ volume: 0.2 });
    state().setUiLang("hi");
    receive({ type: "error", code: "room_not_found", message: "nope" });
    receive(gameState());
    state().leaveRoom();
    expect(state().fatal).toBeNull();
    expect(state().game).toBeNull();
    expect(state().me).toBeNull();
    expect(state().settings.volume).toBe(0.2);
    expect(state().uiLang).toBe("hi");
  });
});
