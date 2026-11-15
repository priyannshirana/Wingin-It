// Push-to-talk (§F16.3, §A5, §A16 "Talking"). A module singleton driven by Space and the
// on-screen hold button:
//
//   press   → ptt_start, radio_in, transmitting; buffer mic chunks locally
//   granted → a FRESH channel change to me: send the 2 pre-roll chunks + the buffer, then stream
//   release → ptt_end, radio_out (released before the grant: stop recording, flush what was
//             recorded on the grant, then ptt_end)
//   busy    → (error channel_busy / the partner got the channel) stop and discard, no ptt_end
//
// Every transmission the server granted ends with exactly one ptt_end. Auto-ends at
// MAX_UTTERANCE_MS. Never active in mock rooms (MockTalkBox replaces it).
//
// A leftover `channel === me` from the previous transmission (the server's `channel: null`
// can lag the release) is never a grant: the server handles our ptt_end before our next
// ptt_start, so it always sends `null` and then a new `me` — only that transition counts.
import { MAX_UTTERANCE_MS } from "../config";
import { currentSocket, send } from "../net/socket";
import { selectMock } from "../state/selectors";
import { useStore, type StoreState } from "../state/store";
import { isTypingTarget } from "../ui/isTypingTarget";
import { initMic, micReady, onChunk, preroll } from "./mic";
import { sfx } from "./sfx";

export type PttSource = "key" | "pointer";
type Phase = "idle" | "waiting" | "streaming" | "releasing";

/** Released before the server granted the channel: how long to wait for the grant. */
// SPEC-ASSUMPTION: a release before the grant sends pre-roll + what was recorded until the
// release + ptt_end when the grant lands (or ptt_end alone after 1.5 s) — §F16.3 says "always
// send ptt_end" but not what happens to audio captured before the grant; this keeps the words.
export const RELEASE_GRACE_MS = 1500;

let phase: Phase = "idle";
let source: PttSource | null = null;
let pre: ArrayBuffer[] = [];
let buffer: ArrayBuffer[] = [];
let unsubChunk: (() => void) | null = null;
let unsubStore: (() => void) | null = null;
let autoEnd: ReturnType<typeof setTimeout> | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
/** A press that arrived while the previous (released, not yet granted) one was resolving. */
let pending: PttSource | null = null;

/** Whether this player may start talking now (real room, joined, online, channel free). */
export function canTalk(s: StoreState): boolean {
  if (selectMock(s) || !s.me || s.conn !== "open") return false;
  if (s.status === "PAUSED" || s.status === "DECK") return false;
  return s.channel === null || s.channel === s.me.role;
}

export function pttActive(): boolean {
  return phase !== "idle" || pending !== null;
}

function sendAudio(chunk: ArrayBuffer): void {
  currentSocket()?.sendAudio(chunk);
}

function cleanup(): void {
  unsubChunk?.();
  unsubStore?.();
  unsubChunk = null;
  unsubStore = null;
  if (autoEnd) clearTimeout(autoEnd);
  if (releaseTimer) clearTimeout(releaseTimer);
  autoEnd = null;
  releaseTimer = null;
  pre = [];
  buffer = [];
  phase = "idle";
  source = null;
}

/** The old transmission is resolved: start the press that was waiting for it, if still held. */
function resolved(): void {
  const next = pending;
  pending = null;
  if (next) begin(next);
  else if (phase === "idle") useStore.getState().setMic({ transmitting: false });
}

function finish(): void {
  send({ type: "ptt_end" });
  cleanup();
  resolved();
}

/** The channel is ours: pre-roll first, then everything buffered, then live streaming. */
function flush(): void {
  for (const c of pre) sendAudio(c);
  for (const c of buffer) sendAudio(c);
  pre = [];
  buffer = [];
  if (phase === "releasing") finish();
  else phase = "streaming";
}

/** Refused: drop the audio, never send ptt_end for a channel we were not granted. */
// SPEC-ASSUMPTION: no ptt_end after channel_busy — the server never granted us, and B13.2's
// ptt_end handler releases the channel without checking the holder, so a stray ptt_end could
// cut off the partner mid-sentence.
function abort(): void {
  if (phase === "idle") return;
  cleanup();
  resolved();
}

function begin(from: PttSource): void {
  const s = useStore.getState();
  const me = s.me;
  if (!me || !canTalk(s)) {
    useStore.getState().setMic({ transmitting: false });
    return;
  }
  if (!micReady()) void initMic(); // the press is a user gesture; chunks follow once it runs

  phase = "waiting";
  source = from;
  pre = preroll();
  buffer = [];
  unsubChunk = onChunk((chunk) => {
    if (phase === "streaming") sendAudio(chunk);
    else if (phase === "waiting") buffer.push(chunk); // nothing recorded after a release
  });
  // Baselines taken now, not the subscriber's `prev`: a press started from inside another store
  // callback must not see that same change (e.g. the old hold's grant) as its own.
  let seenChannel = s.channel;
  let seenToasts = s.toasts;
  unsubStore = useStore.subscribe((st) => {
    if (st.toasts !== seenToasts) {
      const fresh = st.toasts.filter((t) => !seenToasts.includes(t));
      seenToasts = st.toasts;
      if (fresh.some((t) => t.key === "toast.channel_busy") && phase !== "streaming") {
        abort();
        return;
      }
    }
    if (st.conn !== "open") {
      abort(); // the socket dropped: the server releases a disconnected holder itself
      return;
    }
    if (st.channel === seenChannel) return;
    seenChannel = st.channel;
    if (st.channel === me.role) {
      if (phase === "waiting" || phase === "releasing") flush(); // a fresh grant
    } else if (st.channel !== null) {
      if (phase !== "streaming") abort(); // the partner got the channel: we were refused
    } else if (phase === "streaming") {
      // The server released us (its own 12.5 s cap): stop streaming, close our side once.
      finish();
    }
    // `null` while waiting / releasing = the release of our previous transmission: keep waiting.
  });
  autoEnd = setTimeout(() => pttEnd(), MAX_UTTERANCE_MS);

  send({ type: "ptt_start" });
  sfx.play("radio_in");
  useStore.getState().setMic({ transmitting: true });
}

export function pttStart(from: PttSource): void {
  if (pending !== null) return;
  if (phase === "releasing") {
    // The previous hold is still waiting for its grant: start as soon as it resolves.
    pending = from;
    useStore.getState().setMic({ transmitting: true });
    return;
  }
  if (phase !== "idle") return;
  begin(from);
}

/** Release. With `from`, only the input that started the transmission can end it. */
export function pttEnd(from?: PttSource): void {
  if (pending !== null && (!from || from === pending)) {
    pending = null; // a queued press released before it started
    useStore.getState().setMic({ transmitting: false });
    if (!from) pttEnd(); // a blur also ends the resolving one
    return;
  }
  if (phase === "idle" || phase === "releasing") return;
  if (from && from !== source) return;
  sfx.play("radio_out");
  useStore.getState().setMic({ transmitting: false });
  if (autoEnd) clearTimeout(autoEnd);
  autoEnd = null;
  if (phase === "streaming") {
    finish();
    return;
  }
  // Not granted yet: stop recording; flush + ptt_end on the grant, or ptt_end after a grace.
  phase = "releasing";
  releaseTimer = setTimeout(finish, RELEASE_GRACE_MS);
}

const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button", "submit", "reset"]);

/** Space is typing only in text fields (the volume slider keeps focus after a drag). */
function typesText(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement && NON_TEXT_INPUTS.has(target.type)) return false;
  return isTypingTarget(target);
}

/** Space = hold to talk (window-level); window blur ends a transmission. Returns the cleanup. */
export function installPttKeys(): () => void {
  const isSpace = (e: KeyboardEvent) => e.code === "Space" || e.key === " ";
  const down = (e: KeyboardEvent) => {
    if (!isSpace(e) || typesText(e.target)) return;
    e.preventDefault(); // no page scroll, no "click" on a focused button
    if (e.repeat) return;
    pttStart("key");
  };
  const up = (e: KeyboardEvent) => {
    if (!isSpace(e)) return;
    if (source === "key" || pending === "key") e.preventDefault();
    pttEnd("key");
  };
  const blur = () => pttEnd();
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    pttEnd();
  };
}

/** Test hook: back to idle without sending anything. */
export function resetPttForTests(): void {
  pending = null;
  cleanup();
}
