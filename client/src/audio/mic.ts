// The microphone (§F16.1): getUserMedia → 7 kHz low-pass → pcm-worklet (16 kHz Int16, 100 ms
// chunks), plus an analyser for the level meter. A module singleton (StrictMode-safe): the
// stream, the worklet and the 200 ms pre-roll ring live as long as the tab.
import { FRAME_MS, PREROLL_MS } from "../config";
import { useStore } from "../state/store";
import { getAudioContext, unlockAudio } from "./sfx";

/** Chunks kept in the pre-roll ring (200 ms / 100 ms = 2). */
export const PREROLL_CHUNKS = Math.round(PREROLL_MS / FRAME_MS);

type ChunkListener = (chunk: ArrayBuffer) => void;

let initPromise: Promise<void> | null = null;
let analyser: AnalyserNode | null = null;
let levelBuf: Float32Array<ArrayBuffer> | null = null;
let ring: ArrayBuffer[] = [];
const listeners = new Set<ChunkListener>();

/** The worklet posted a chunk: keep it in the ring and hand it to every listener. */
export function onWorkletChunk(chunk: ArrayBuffer): void {
  ring.push(chunk);
  if (ring.length > PREROLL_CHUNKS) ring = ring.slice(-PREROLL_CHUNKS);
  for (const l of listeners) l(chunk);
}

/** The last 200 ms of audio (oldest first), captured before the press. */
export function preroll(): ArrayBuffer[] {
  return [...ring];
}

/** Subscribe to every new 3,200-byte chunk. Returns the unsubscribe. */
export function onChunk(listener: ChunkListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function micReady(): boolean {
  return analyser !== null;
}

/** RMS of the analyser's time-domain data, mapped to 0..1 (x * 4, clamped). */
export function level(): number {
  if (!analyser || !levelBuf) return 0;
  analyser.getFloatTimeDomainData(levelBuf);
  let sum = 0;
  for (const v of levelBuf) sum += v * v;
  return Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
}

function isDenied(err: unknown): boolean {
  return (
    err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
  );
}

async function open(): Promise<void> {
  // Create / resume the shared context while the click's user activation is still fresh.
  // (Settled into a value so a getUserMedia failure never leaves an unhandled rejection.)
  const unlocked = unlockAudio().then(
    () => null,
    (err: unknown) => err,
  );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  try {
    const unlockErr = await unlocked;
    if (unlockErr !== null) {
      throw unlockErr instanceof Error ? unlockErr : new Error("AudioContext unlock failed");
    }
    const ctx = getAudioContext(); // shared with sfx
    await ctx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
    const src = ctx.createMediaStreamSource(stream);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000; // anti-alias before the worklet's decimation
    const node = new AudioWorkletNode(ctx, "pcm-worklet");
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(lp).connect(node); // the worklet output is not connected to the speakers
    src.connect(an);
    node.port.onmessage = (e: MessageEvent<unknown>) => {
      if (e.data instanceof ArrayBuffer) onWorkletChunk(e.data);
    };
    levelBuf = new Float32Array(an.fftSize);
    analyser = an;
  } catch (err) {
    // The graph failed after the mic opened: release it, so the recording indicator goes off
    // and a retry opens one fresh stream instead of a second one.
    for (const track of stream.getTracks()) track.stop();
    throw err;
  }
}

/**
 * Ask for the mic and start the capture graph (idempotent; call it from a user gesture).
 * Permission lands in `store.mic.permission`. A denied (or missing) mic resolves, not throws.
 */
export function initMic(): Promise<void> {
  if (initPromise) return initPromise;
  const setMic = useStore.getState().setMic;
  if (!navigator.mediaDevices?.getUserMedia) {
    // SPEC-ASSUMPTION: no getUserMedia (plain http on a LAN IP) is shown as "denied" — the
    // player sees the same "allow the mic" fix-it text and Ready stays blocked.
    setMic({ permission: "denied" });
    return Promise.resolve();
  }
  initPromise = open().then(
    () => setMic({ permission: "granted" }),
    (err: unknown) => {
      // A denied prompt may be retried after the player changes the site setting + reloads;
      // other failures (no device, worklet load) also leave the mic unusable for this tab.
      initPromise = null;
      if (!isDenied(err)) console.warn("[wingin] mic init failed", err);
      setMic({ permission: "denied" });
    },
  );
  return initPromise;
}

/** Test hook: forget the capture graph and the ring. */
export function resetMicForTests(): void {
  initPromise = null;
  analyser = null;
  levelBuf = null;
  ring = [];
  listeners.clear();
}
