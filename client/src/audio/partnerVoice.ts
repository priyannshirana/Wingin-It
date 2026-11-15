// The partner's live voice in voice rooms. The server forwards the speaker's mic chunks as binary
// WS frames (16 kHz mono PCM16 little-endian, the exact bytes ptt.ts sent) only while the partner
// holds the channel. Each chunk becomes a 16 kHz AudioBuffer (the context resamples it) scheduled
// back to back behind a small jitter buffer:
//
//   source → high-pass 300 Hz → low-pass 3.4 kHz (walkie-talkie band) → partner gain → radio bus
//
// The jitter buffer re-primes on every new transmission (channel grant / release) and after an
// underrun, and drops the oldest unplayed audio when the queue would pass MAX_BUFFER_S.
import { otherRole, selectMock, selectVoice } from "../state/selectors";
import { useStore, type StoreState } from "../state/store";
import { runningRadioBus, sfx } from "./sfx";

export const VOICE_RATE = 16000;
/** Delay before the first chunk of a transmission plays (absorbs network jitter). */
export const JITTER_TARGET_S = 0.12;
/** Never queue more than this: the oldest unplayed audio is dropped to make room. */
export const MAX_BUFFER_S = 0.5;
export const BAND_LOW_HZ = 300;
export const BAND_HIGH_HZ = 3400;
/** Make-up gain for the band-pass and the radio bus (0.6), so the voice sits above the engine. */
const VOICE_MAKEUP = 1.6;
const GAIN_RAMP_S = 0.05;

/** PCM16 little-endian → floats in [-1, 1). Returns the number of samples written. */
export function decodePcm16(chunk: ArrayBuffer, out: Float32Array): number {
  const n = Math.min(out.length, chunk.byteLength >> 1);
  const view = new DataView(chunk);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i << 1, true) / 32768;
  return n;
}

export type VoiceContext = Pick<
  BaseAudioContext,
  "currentTime" | "createBuffer" | "createBufferSource"
>;

export type PushResult = "queued" | "trimmed" | "empty";

interface Scheduled {
  buf: AudioBuffer;
  src: AudioBufferSourceNode;
  at: number;
  dur: number;
}

/**
 * Gapless scheduler for incoming chunks (works on any context; tests pass a fake one). Over the
 * latency cap it drops the OLDEST audio that hasn't started yet (a push-to-talk burst is mostly
 * pre-roll at its head) and reschedules the rest, so the newest words always play.
 */
export class PartnerVoicePlayer {
  private readonly ctx: VoiceContext;
  private readonly out: AudioNode;
  /** Scheduled and not yet ended, in play order. */
  private queue: Scheduled[] = [];
  private nextAt = 0;
  private fresh = true;
  /** Chunks discarded by the latency cap (test / debug counter). */
  dropped = 0;

  constructor(ctx: VoiceContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  push(chunk: ArrayBuffer): PushResult {
    const samples = chunk.byteLength >> 1;
    if (samples === 0) return "empty";
    const dur = samples / VOICE_RATE;
    const now = this.ctx.currentTime;
    if (this.fresh || this.nextAt < now) {
      // a new transmission or an underrun: start behind the jitter target, after any old tail
      this.nextAt = Math.max(this.nextAt, now + JITTER_TARGET_S);
      this.fresh = false;
    }
    const buf = this.ctx.createBuffer(1, samples, VOICE_RATE);
    decodePcm16(chunk, buf.getChannelData(0));
    if (this.nextAt + dur - now <= MAX_BUFFER_S) {
      this.schedule(buf, dur);
      return "queued";
    }
    this.trim(buf, dur, now);
    return "trimmed";
  }

  /** Seconds of audio scheduled but not yet played. */
  bufferedSeconds(): number {
    return Math.max(0, this.nextAt - this.ctx.currentTime);
  }

  /** The next chunk starts a fresh transmission (what's already queued still plays out first). */
  reset(): void {
    this.fresh = true;
  }

  /** Silence everything now (leaving the room). */
  stop(): void {
    for (const e of this.queue) this.kill(e.src);
    this.queue = [];
    this.nextAt = 0;
    this.fresh = true;
  }

  private schedule(buf: AudioBuffer, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    const entry: Scheduled = { buf, src, at: this.nextAt, dur };
    src.onended = () => {
      const i = this.queue.indexOf(entry);
      if (i >= 0) this.queue.splice(i, 1);
      src.disconnect();
    };
    src.start(this.nextAt);
    this.queue.push(entry);
    this.nextAt += dur;
  }

  /** Over the cap: unschedule what hasn't started, drop from its head, reschedule the rest. */
  private trim(buf: AudioBuffer, dur: number, now: number): void {
    const startedEnd = this.queue.reduce((end, e) => (e.at <= now ? e.at + e.dur : end), 0);
    const pending = this.queue.filter((e) => e.at > now);
    for (const e of pending) this.kill(e.src);
    this.queue = this.queue.filter((e) => e.at <= now);
    const kept = [...pending.map((e) => ({ buf: e.buf, dur: e.dur })), { buf, dur }];
    const base = startedEnd > now ? startedEnd : now + JITTER_TARGET_S;
    let total = kept.reduce((t, k) => t + k.dur, 0);
    while (kept.length > 1 && base + total - now > MAX_BUFFER_S) {
      total -= kept.shift()?.dur ?? 0;
      this.dropped++;
    }
    this.nextAt = base;
    for (const k of kept) this.schedule(k.buf, k.dur);
  }

  private kill(src: AudioBufferSourceNode): void {
    src.onended = null;
    try {
      src.stop();
    } catch {
      // never started
    }
    src.disconnect();
  }
}

interface Chain {
  ctx: BaseAudioContext;
  player: PartnerVoicePlayer;
  nodes: AudioNode[];
  gain: GainNode;
}

let chain: Chain | null = null;
let enabled = false;
let squelchTimer: ReturnType<typeof setTimeout> | null = null;

function clearSquelch(): void {
  if (squelchTimer) clearTimeout(squelchTimer);
  squelchTimer = null;
}

function partnerGain(): number {
  return useStore.getState().settings.partnerVolume * VOICE_MAKEUP;
}

/** Build the filter chain on the running context's radio bus (null while audio is locked). */
function ensureChain(): Chain | null {
  const radio = runningRadioBus();
  if (!radio) return null;
  if (chain?.ctx === radio.ctx) return chain;
  const { ctx, bus } = radio;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = BAND_LOW_HZ;
  hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = BAND_HIGH_HZ;
  lp.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.value = partnerGain();
  hp.connect(lp).connect(gain).connect(bus);
  chain = { ctx, player: new PartnerVoicePlayer(ctx, hp), nodes: [hp, lp, gain], gain };
  return chain;
}

function teardown(): void {
  clearSquelch();
  if (!chain) return;
  chain.player.stop();
  for (const n of chain.nodes) n.disconnect();
  chain = null;
}

/** A binary frame from the socket. Dropped outside voice rooms and before the sound is unlocked. */
export function receivePartnerAudio(chunk: ArrayBuffer): void {
  if (!enabled) return;
  ensureChain()?.player.push(chunk);
}

const voiceOn = (s: StoreState): boolean => selectVoice(s) && !selectMock(s) && s.me !== null;

/**
 * Follow the store while in a room: enable playback in voice rooms, re-prime the jitter buffer on
 * every channel change (with the radio squelch for the partner's key-up / release) and apply the
 * partner volume. Returns the cleanup (leaving the room).
 */
export function installPartnerVoice(): () => void {
  enabled = voiceOn(useStore.getState());
  const unsub = useStore.subscribe((s, p) => {
    enabled = voiceOn(s);
    if (!enabled) {
      teardown();
      return;
    }
    if (s.channel !== p.channel) {
      chain?.player.reset();
      const partner = s.me ? otherRole(s.me.role) : null;
      if (s.channel === partner) {
        clearSquelch();
        sfx.play("radio_in");
      } else if (p.channel === partner) {
        // the release squelch waits for the last scheduled word to play out
        const tail = chain?.player.bufferedSeconds() ?? 0;
        clearSquelch();
        squelchTimer = setTimeout(() => {
          squelchTimer = null;
          sfx.play("radio_out");
        }, tail * 1000);
      }
    }
    if (s.settings.partnerVolume !== p.settings.partnerVolume && chain) {
      const g = chain.gain.gain;
      const now = chain.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(partnerGain(), now + GAIN_RAMP_S);
    }
  });
  return () => {
    unsub();
    enabled = false;
    teardown();
  };
}

/** Test hook: the live player (null until the first chunk on a running context). */
export function partnerVoicePlayer(): PartnerVoicePlayer | null {
  return chain?.player ?? null;
}
