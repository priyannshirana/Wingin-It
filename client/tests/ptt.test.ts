// §F16.3 push-to-talk: buffer until granted then pre-roll first, Space repeat / inputs ignored,
// ptt_end always sent on release, no PTT in mock rooms, auto-end at 12 s, discard on busy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { C2S } from "../src/net/protocol";
import { useStore } from "../src/state/store";
import { roomState, welcome } from "./fixtures/messages";

const sent: C2S[] = [];
const audio: ArrayBuffer[] = [];
let chunkListener: ((c: ArrayBuffer) => void) | null = null;
const PRE = [new ArrayBuffer(3200), new ArrayBuffer(3200)];

vi.mock("../src/net/socket", () => ({
  send: (msg: C2S) => sent.push(msg),
  currentSocket: () => ({ sendAudio: (c: ArrayBuffer) => audio.push(c) }),
}));

vi.mock("../src/audio/mic", () => ({
  initMic: vi.fn(() => Promise.resolve()),
  micReady: () => true,
  preroll: () => [...PRE],
  onChunk: (l: (c: ArrayBuffer) => void) => {
    chunkListener = l;
    return () => {
      chunkListener = null;
    };
  },
}));

const { installPttKeys, pttEnd, pttStart, resetPttForTests, RELEASE_GRACE_MS } =
  await import("../src/audio/ptt");

const chunk = () => new ArrayBuffer(3200);
const types = () => sent.filter((m) => m.type !== "ping").map((m) => m.type);

function joinAs(role: "flyer" | "tower", mock = false) {
  const s = useStore.getState();
  s.receive(welcome({ mock_speech: mock }));
  s.receive({
    type: "joined",
    player_id: role === "flyer" ? "p-flyer" : "p-tower",
    token: "tok",
    role,
    lang: "en",
    gender: "female",
    name: "Me",
  });
  s.receive(roomState({ mock_speech: mock, status: "PLAYING" }));
  s.setConn("open");
}

const grant = (role: "flyer" | "tower" | null) =>
  useStore.getState().receive({ type: "channel", busy_by: role });

function key(type: "keydown" | "keyup", init: KeyboardEventInit = {}, target?: EventTarget) {
  const e = new KeyboardEvent(type, {
    code: "Space",
    key: " ",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  (target ?? window).dispatchEvent(e);
  return e;
}

beforeEach(() => {
  useStore.getState().reset();
  sent.length = 0;
  audio.length = 0;
  chunkListener = null;
  resetPttForTests();
});

afterEach(() => {
  resetPttForTests();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("push-to-talk", () => {
  it("buffers until the channel is granted, then sends the pre-roll first", () => {
    joinAs("flyer");
    pttStart("pointer");
    expect(types()).toEqual(["ptt_start"]);
    expect(useStore.getState().mic.transmitting).toBe(true);

    const a = chunk();
    const b = chunk();
    chunkListener?.(a);
    chunkListener?.(b);
    expect(audio).toEqual([]); // nothing streams before the grant

    grant("flyer");
    expect(audio).toEqual([PRE[0], PRE[1], a, b]);
    expect(audio.every((c) => c.byteLength === 3200)).toBe(true);

    const c = chunk();
    chunkListener?.(c);
    expect(audio[4]).toBe(c); // then live

    pttEnd("pointer");
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    expect(useStore.getState().mic.transmitting).toBe(false);
    chunkListener?.(chunk());
    expect(audio).toHaveLength(5); // nothing after release
  });

  it("Space starts and stops; key repeat is ignored; preventDefault stops the scroll", () => {
    joinAs("flyer");
    const off = installPttKeys();
    const down = key("keydown");
    expect(down.defaultPrevented).toBe(true);
    key("keydown", { repeat: true });
    key("keydown", { repeat: true });
    expect(types()).toEqual(["ptt_start"]);
    grant("flyer");
    const up = key("keyup");
    expect(up.defaultPrevented).toBe(true);
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    off();
  });

  it("ignores Space typed into inputs, textareas and contenteditable", () => {
    joinAs("tower");
    const off = installPttKeys();
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(input, area, editable);
    for (const el of [input, area, editable]) {
      const e = key("keydown", {}, el);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(types()).toEqual([]);
    off();
  });

  it("always sends ptt_end, even for a hold released before the grant", () => {
    joinAs("flyer");
    pttStart("key");
    const a = chunk();
    chunkListener?.(a); // recorded while held
    pttEnd("key"); // released before the grant
    expect(types()).toEqual(["ptt_start"]);
    chunkListener?.(chunk()); // recorded after the release: must never be sent
    grant("flyer");
    expect(audio).toEqual([PRE[0], PRE[1], a]);
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
  });

  it("a stale grant is never reused: release → re-press → null → flyer", () => {
    joinAs("flyer");
    pttStart("key");
    grant("flyer");
    pttEnd("key");
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    // store.channel is still "flyer": the server's release hasn't arrived yet.
    pttStart("key");
    expect(types()).toEqual(["ptt_start", "ptt_end", "ptt_start"]);
    const b = chunk();
    chunkListener?.(b);
    expect(audio).toEqual([PRE[0], PRE[1]]); // nothing streamed on the stale value
    grant(null); // the release of the first transmission
    expect(useStore.getState().mic.transmitting).toBe(true); // still waiting, not aborted
    grant("flyer"); // the fresh grant for the second one
    expect(audio).toEqual([PRE[0], PRE[1], PRE[0], PRE[1], b]);
    pttEnd("key");
    expect(types()).toEqual(["ptt_start", "ptt_end", "ptt_start", "ptt_end"]);
  });

  it("a server release while streaming closes our side with exactly one ptt_end", () => {
    joinAs("flyer");
    pttStart("key");
    grant("flyer");
    grant(null);
    expect(useStore.getState().mic.transmitting).toBe(false);
    pttEnd("key");
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
  });

  it("a press while the previous hold awaits its grant starts once that one resolves", () => {
    joinAs("flyer");
    pttStart("key");
    pttEnd("key"); // releasing
    pttStart("pointer");
    expect(useStore.getState().mic.transmitting).toBe(true); // shown at once
    expect(types()).toEqual(["ptt_start"]);
    grant("flyer"); // first one flushes and ends → the queued press starts
    expect(types()).toEqual(["ptt_start", "ptt_end", "ptt_start"]);
    grant(null);
    grant("flyer");
    const c = chunk();
    chunkListener?.(c);
    expect(audio.at(-1)).toBe(c);
    pttEnd("pointer");
    expect(types()).toEqual(["ptt_start", "ptt_end", "ptt_start", "ptt_end"]);
  });

  it("a queued press released before it started sends nothing more", () => {
    joinAs("flyer");
    pttStart("key");
    pttEnd("key");
    pttStart("pointer");
    pttEnd("pointer");
    expect(useStore.getState().mic.transmitting).toBe(false);
    grant("flyer");
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
  });

  it("Space still talks when the volume slider has focus", () => {
    joinAs("flyer");
    const off = installPttKeys();
    const slider = document.createElement("input");
    slider.type = "range";
    document.body.append(slider);
    slider.focus();
    const e = key("keydown", {}, slider);
    expect(e.defaultPrevented).toBe(true);
    expect(types()).toEqual(["ptt_start"]);
    off();
  });

  it("sends ptt_end after a grace when the grant never comes", () => {
    vi.useFakeTimers();
    joinAs("flyer");
    pttStart("key");
    pttEnd("key");
    vi.advanceTimersByTime(RELEASE_GRACE_MS);
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    expect(audio).toEqual([]);
  });

  it("window blur ends a transmission", () => {
    joinAs("flyer");
    const off = installPttKeys();
    key("keydown");
    grant("flyer");
    window.dispatchEvent(new Event("blur"));
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    off();
  });

  it("auto-ends at MAX_UTTERANCE_MS (12 s)", () => {
    vi.useFakeTimers();
    joinAs("flyer");
    pttStart("key");
    grant("flyer");
    vi.advanceTimersByTime(11_999);
    expect(types()).toEqual(["ptt_start"]);
    vi.advanceTimersByTime(1);
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    pttEnd("key"); // the later key release sends nothing more
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
  });

  it("discards everything on error channel_busy (and sends no ptt_end)", () => {
    joinAs("flyer");
    pttStart("key");
    chunkListener?.(chunk());
    useStore.getState().receive({ type: "error", code: "channel_busy", message: "busy" });
    expect(useStore.getState().mic.transmitting).toBe(false);
    grant("flyer"); // a late grant must not flush the discarded audio
    pttEnd("key");
    expect(audio).toEqual([]);
    expect(types()).toEqual(["ptt_start"]);
  });

  it("discards when the partner gets the channel first", () => {
    joinAs("tower");
    pttStart("pointer");
    chunkListener?.(chunk());
    grant("flyer");
    expect(useStore.getState().mic.transmitting).toBe(false);
    expect(audio).toEqual([]);
    expect(types()).toEqual(["ptt_start"]);
  });

  it("cannot start while the partner holds the channel, or while paused", () => {
    joinAs("flyer");
    grant("tower");
    pttStart("key");
    expect(types()).toEqual([]);
    grant(null);
    useStore.getState().receive({ ...roomState({ mock_speech: false }), status: "PAUSED" });
    pttStart("key");
    expect(types()).toEqual([]);
  });

  it("has no PTT at all in mock rooms", () => {
    joinAs("flyer", true);
    const off = installPttKeys();
    key("keydown");
    pttStart("pointer");
    expect(types()).toEqual([]);
    expect(useStore.getState().mic.transmitting).toBe(false);
    off();
  });

  it("only the input that started a transmission can end it", () => {
    joinAs("flyer");
    const off = installPttKeys();
    pttStart("pointer");
    grant("flyer");
    key("keyup"); // a stray Space release does not end a button hold
    expect(types()).toEqual(["ptt_start"]);
    pttEnd("pointer");
    expect(types()).toEqual(["ptt_start", "ptt_end"]);
    off();
  });
});
