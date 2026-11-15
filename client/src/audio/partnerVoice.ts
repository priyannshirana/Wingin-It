// The partner's live voice in voice rooms. The server forwards the speaker's mic chunks as binary
// WS frames (16 kHz mono PCM16 little-endian, the exact bytes ptt.ts sent) only while the partner
// holds the channel. Each chunk becomes a 16 kHz AudioBuffer (the context resamples it) scheduled
// back to back behind a small jitter buffer:
//
//   source → high-pass 300 Hz → low-pass 3.4 kHz (walkie-talkie band) → partner gain → radio bus
//
// The jitter buffer re-primes on every new transmission (channel grant / release) and after an
// underrun, and drops chunks that would push the queue past MAX_BUFFER_S, so latency stays capped.
import { otherRole, selectVoice } from "../state/selectors";
import { useStore, type StoreState } from "../state/store";
import { runningRadioBus, sfx } from "./sfx";

export const VOICE_RATE = 16000;
/** Delay before the first chunk of a transmission plays (absorbs network jitter). */
export const JITTER_TARGET_S = 0.12;
/** Never queue more than this: later chunks are dropped until the queue drains. */
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

export type PushResult = "queued" | "dropped" | "empty";

/** Gapless scheduler for incoming chunks (works on any context; tests pass a fake one). */
export class PartnerVoicePlayer {
  private readonly ctx: VoiceContext;
  private readonly out: AudioNode;
  private readonly live = new Set<AudioBufferSourceNode>();
  private nextAt = 0;
  private primed = false;

  constructor(ctx: VoiceContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  push(chunk: ArrayBuffer): PushResult {
    const samples = chunk.byteLength >> 1;
    if (samples === 0) return "empty";
    const dur = samples / VOICE_RATE;
    const now = this.ctx.currentTime;
    if (!this.primed || this.nextAt < now) {
      // a new transmission, or an underrun: start again behind the jitter target
      this.nextAt = now + JITTER_TARGET_S;
      this.primed = true;
    } else if (this.nextAt + dur - now > MAX_BUFFER_S) {
      return "dropped";
    }
    const buf = this.ctx.createBuffer(1, samples, VOICE_RATE);
    decodePcm16(chunk, buf.getChannelData(0));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.onended = () => {
      this.live.delete(src);
      src.disconnect();
    };
    src.start(this.nextAt);
    this.live.add(src);
    this.nextAt += dur;
    return "queued";
  }

  /** Seconds of audio scheduled but not yet played. */
  bufferedSeconds(): number {
    return this.primed ? Math.max(0, this.nextAt - this.ctx.currentTime) : 0;
  }

  /** The next chunk starts a fresh transmission (what's already queued still plays out). */
  reset(): void {
    this.primed = false;
  }

  /** Silence everything now (leaving the room). */
  stop(): void {
    for (const src of this.live) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // never started
      }
      src.disconnect();
    }
    this.live.clear();
    this.primed = false;
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

const voiceOn = (s: StoreState): boolean => selectVoice(s) && s.me !== null;

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
      if (s.channel === partner) sfx.play("radio_in");
      else if (p.channel === partner) sfx.play("radio_out");
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
