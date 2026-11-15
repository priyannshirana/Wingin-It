// The procedural recipes of §F16.4: `RECIPES[name] = { bus, loop, gain, durationS, start }`.
// Every voice ends in its own output GainNode set to the spec gain, and every source inside is
// normalized to peak ≤ 1, so the spec gain is the voice's peak level. To swap a recipe for a
// recorded file later, replace its `start` with one that plays a decoded AudioBuffer through
// the same output gain: nothing outside this file changes.
//
// Pure Web Audio (no DOM, no store): the offline render tests load this file in a real browser.
import type { SfxName, SfxParam } from "./names";

export type BusName = "sfx" | "ambience" | "radio";

/** A playing sound. One-shots stop by themselves; loops run until `stop`. */
export interface Voice {
  /** Fade out quickly and stop (idempotent). */
  stop(at?: number): void;
  /** Change a parameter while playing (`gain`, `pitch`, `wobble`, `mode`). */
  set(key: SfxParam, value: number | string): void;
}

export interface Recipe {
  bus: BusName;
  /** Loops run until stopped; `play()` of a loop plays one `durationS` cycle. */
  loop: boolean;
  /** Peak output level from the §F16.4 table (before the bus and master gains). */
  gain: number;
  /** One-shot length (or one loop cycle), in seconds. */
  durationS: number;
  /** `once`: a loop recipe plays a single `durationS` cycle (what `sfx.play(loopName)` does). */
  start(ctx: BaseAudioContext, dest: AudioNode, at: number, once?: boolean): Voice;
}

// Band-limited square / sawtooth oscillators overshoot ~9 % (Gibbs): scale them so peak ≤ 1.
const BL = 0.9;
const FADE_S = 0.03;

// ---------------------------------------------------------------- noise buffers (cached per ctx)

type NoiseKind = "white" | "pink" | "brown";
const noiseCache = new WeakMap<BaseAudioContext, Partial<Record<NoiseKind, AudioBuffer>>>();

/** A deterministic PRNG, so renders (and tests) are repeatable. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(data: Float32Array): void {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) / peak;
}

function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  const cached = noiseCache.get(ctx) ?? {};
  const hit = cached[kind];
  if (hit) return hit;
  const length = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rand = rng(kind === "white" ? 1 : kind === "pink" ? 2 : 3);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0,
    last = 0;
  for (let i = 0; i < length; i++) {
    const w = rand() * 2 - 1;
    if (kind === "white") d[i] = w;
    else if (kind === "pink") {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
  }
  normalize(d);
  cached[kind] = buf;
  noiseCache.set(ctx, cached);
  return buf;
}

/** A sample-generated buffer (gated patterns: beeps, crackle, envelopes). */
function synthBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  fill: (t: number) => number,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < length; i++) d[i] = fill(i / ctx.sampleRate);
  return buf;
}

const bufferCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
function cachedBuffer(ctx: BaseAudioContext, key: string, make: () => AudioBuffer): AudioBuffer {
  let m = bufferCache.get(ctx);
  if (!m) {
    m = new Map();
    bufferCache.set(ctx, m);
  }
  let b = m.get(key);
  if (!b) {
    b = make();
    m.set(key, b);
  }
  return b;
}

/** A gate of `on` seconds with 5 ms raised-cosine edges, 0 elsewhere. */
function gate(t: number, from: number, len: number): number {
  if (t < from || t > from + len) return 0;
  const e = 0.005;
  const x = t - from;
  if (x < e) return 0.5 - 0.5 * Math.cos((Math.PI * x) / e);
  if (x > len - e) return 0.5 - 0.5 * Math.cos((Math.PI * (len - x)) / e);
  return 1;
}

// ---------------------------------------------------------------- node helpers

function gainNode(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}

function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  freq: number,
  q?: number,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (q !== undefined) f.Q.value = q;
  return f;
}

function noise(ctx: BaseAudioContext, kind: NoiseKind, loop: boolean): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, kind);
  s.loop = loop;
  return s;
}

function bufferSource(buf: AudioBuffer, ctx: BaseAudioContext, loop: boolean) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = loop;
  return s;
}

/** Linear attack to `peak`, then an exponential decay to silence over `decay` seconds. */
function percEnv(param: AudioParam, at: number, attack: number, decay: number, peak = 1): void {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.setTargetAtTime(0, at + attack, decay / 5);
}

/** Attack, hold, release (linear), for gated tones. */
function arEnv(param: AudioParam, at: number, attack: number, hold: number, release: number) {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(1, at + attack);
  param.setValueAtTime(1, at + attack + hold);
  param.linearRampToValueAtTime(0, at + attack + hold + release);
}

function rampTo(param: AudioParam, value: number, ctx: BaseAudioContext, seconds: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

/**
 * Wraps sources + an output gain into a Voice. One-shots stop at `end`; loops keep running.
 * The output disconnects when the last source ends, so finished voices leave no graph behind.
 */
function voice(
  ctx: BaseAudioContext,
  output: GainNode,
  sources: AudioScheduledSourceNode[],
  at: number,
  end: number | null,
  set: (key: SfxParam, value: number | string) => void = (key, value) => {
    if (key === "gain" && typeof value === "number") rampTo(output.gain, value, ctx, 0.05);
  },
): Voice {
  let stopped = false;
  for (const s of sources) s.start(at);
  const last = sources[sources.length - 1];
  if (last) last.onended = () => output.disconnect();
  if (end !== null) for (const s of sources) s.stop(end);
  return {
    stop(when) {
      if (stopped) return;
      stopped = true;
      const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
      output.gain.cancelScheduledValues(t);
      output.gain.setValueAtTime(output.gain.value, t);
      output.gain.linearRampToValueAtTime(0, t + FADE_S);
      for (const s of sources) {
        try {
          s.stop(t + FADE_S + 0.01);
        } catch {
          // already stopped
        }
      }
    },
    set,
  };
}

function out(ctx: BaseAudioContext, dest: AudioNode, gain: number): GainNode {
  const g = gainNode(ctx, gain);
  g.connect(dest);
  return g;
}

// ---------------------------------------------------------------- the recipes (§F16.4)

function def(
  bus: BusName,
  loop: boolean,
  gain: number,
  durationS: number,
  start: (ctx: BaseAudioContext, o: GainNode, at: number, end: number | null) => Voice,
): Recipe {
  return {
    bus,
    loop,
    gain,
    durationS,
    start: (ctx, dest, at, once = false) =>
      start(ctx, out(ctx, dest, gain), at, loop && !once ? null : at + durationS),
  };
}

/** A loop made of a generated buffer (beep patterns) played on repeat. */
function patternLoop(
  bus: BusName,
  gain: number,
  period: number,
  key: string,
  fill: (t: number) => number,
): Recipe {
  return def(bus, true, gain, period, (ctx, o, at, end) => {
    const buf = cachedBuffer(ctx, key, () => synthBuffer(ctx, period, fill));
    const src = bufferSource(buf, ctx, true);
    src.connect(o);
    return voice(ctx, o, [src], at, end);
  });
}

const sine = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

export const RECIPES: Readonly<Record<SfxName, Recipe>> = {
  // Square wave alternating 880/660 Hz every 250 ms (a 2 Hz square LFO on the frequency).
  alarm_master: def("ambience", true, 0.12, 0.5, (ctx, o, at, end) => {
    const tone = osc(ctx, "square", 770);
    const lfo = osc(ctx, "square", 2);
    const depth = gainNode(ctx, 110);
    lfo.connect(depth).connect(tone.frequency);
    tone.connect(gainNode(ctx, BL)).connect(o);
    return voice(ctx, o, [lfo, tone], at, end);
  }),

  // Triangle 1200 Hz, amplitude-modulated at 12 Hz (0..1).
  fire_bell: def("ambience", true, 0.08, 1, (ctx, o, at, end) => {
    const tone = osc(ctx, "triangle", 1200);
    const am = gainNode(ctx, 0.5);
    const lfo = osc(ctx, "sine", 12);
    lfo.connect(gainNode(ctx, 0.5)).connect(am.gain);
    tone.connect(am).connect(o);
    return voice(ctx, o, [lfo, tone], at, end);
  }),

  // Sine 1000 Hz, 120 ms, once per second.
  warning_beep: patternLoop("ambience", 0.08, 1, "warning_beep", (t) =>
    t < 0.12 ? gate(t, 0, 0.12) * sine(1000, t) : 0,
  ),

  // 5 ms white-noise burst, high-pass 2 kHz.
  click: def("sfx", false, 0.3, 0.02, (ctx, o, at) => {
    const n = noise(ctx, "white", false);
    const env = gainNode(ctx, 0);
    percEnv(env.gain, at, 0.0005, 0.005, 0.6);
    n.connect(filter(ctx, "highpass", 2000, 0.5))
      .connect(env)
      .connect(o);
    return voice(ctx, o, [n], at, at + 0.02);
  }),

  // Sine 90 Hz with a 150 ms decay + a little noise.
  clunk: def("sfx", false, 0.4, 0.25, (ctx, o, at) => {
    const tone = osc(ctx, "sine", 120);
    tone.frequency.setValueAtTime(120, at);
    tone.frequency.exponentialRampToValueAtTime(90, at + 0.04);
    const tEnv = gainNode(ctx, 0);
    percEnv(tEnv.gain, at, 0.003, 0.15, 0.8);
    const n = noise(ctx, "white", false);
    const nEnv = gainNode(ctx, 0);
    percEnv(nEnv.gain, at, 0.001, 0.04, 0.2);
    tone.connect(tEnv).connect(o);
    n.connect(filter(ctx, "lowpass", 1500, 0))
      .connect(nEnv)
      .connect(o);
    return voice(ctx, o, [n, tone], at, at + 0.25);
  }),

  // Sines 880 + 1320 Hz, 400 ms decay.
  chime: def("sfx", false, 0.2, 0.5, (ctx, o, at) => chimeVoice(ctx, o, at, 880)),
  // `chime` one octave lower (the gain halves in the table).
  chime_soft: def("sfx", false, 0.1, 0.5, (ctx, o, at) => chimeVoice(ctx, o, at, 440)),

  // Sawtooth 110 Hz, 350 ms, low-pass 800 Hz.
  buzzer: def("sfx", false, 0.25, 0.36, (ctx, o, at) => {
    const tone = osc(ctx, "sawtooth", 110);
    const env = gainNode(ctx, 0);
    arEnv(env.gain, at, 0.01, 0.31, 0.03);
    tone
      .connect(gainNode(ctx, BL))
      .connect(filter(ctx, "lowpass", 800, 0))
      .connect(env)
      .connect(o);
    return voice(ctx, o, [tone], at, at + 0.36);
  }),

  // 1.2 s brown noise, low-pass sweeping 1200 → 100 Hz, plus sine 50 Hz.
  boom: def("sfx", false, 0.5, 1.2, (ctx, o, at) => {
    const n = noise(ctx, "brown", false);
    const lp = filter(ctx, "lowpass", 1200, 0);
    lp.frequency.setValueAtTime(1200, at);
    lp.frequency.exponentialRampToValueAtTime(100, at + 1.2);
    const sub = osc(ctx, "sine", 50);
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, at + 1.19);
    n.connect(gainNode(ctx, 0.6)).connect(lp).connect(env);
    sub.connect(gainNode(ctx, 0.4)).connect(env);
    env.connect(o);
    return voice(ctx, o, [n, sub], at, at + 1.2);
  }),

  // White noise, band-pass sweeping 400 → 3000 Hz over 0.8 s.
  whoosh: def("sfx", false, 0.3, 0.8, (ctx, o, at) => {
    const n = noise(ctx, "white", false);
    const bp = filter(ctx, "bandpass", 400, 0.8);
    bp.frequency.setValueAtTime(400, at);
    bp.frequency.exponentialRampToValueAtTime(3000, at + 0.8);
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.35);
    env.gain.linearRampToValueAtTime(0, at + 0.8);
    n.connect(gainNode(ctx, 1.6)).connect(bp).connect(env).connect(o);
    return voice(ctx, o, [n], at, at + 0.8);
  }),

  // Two detuned sawtooths 70/72 Hz, low-pass 300 Hz; modes normal / one_engine / steady / off.
  engine_hum: def("ambience", true, 0.06, 2, (ctx, o, at, end) => {
    const a = osc(ctx, "sawtooth", 70);
    const b = osc(ctx, "sawtooth", 72);
    const lp = filter(ctx, "lowpass", 300, 0);
    const level = gainNode(ctx, 1);
    const wob = osc(ctx, "sine", 0.15);
    const wobDepth = gainNode(ctx, 17); // ≈ ±1 % in cents
    wob.connect(wobDepth);
    wobDepth.connect(a.detune);
    wobDepth.connect(b.detune);
    a.connect(gainNode(ctx, 0.5 * BL)).connect(lp);
    b.connect(gainNode(ctx, 0.5 * BL)).connect(lp);
    lp.connect(level).connect(o);
    const setPitch = (ratio: number) => {
      rampTo(a.frequency, 70 * ratio, ctx, 1.2);
      rampTo(b.frequency, 72 * ratio, ctx, 1.2);
    };
    return voice(ctx, o, [wob, a, b], at, end, (key, value) => {
      if (key === "gain" && typeof value === "number") rampTo(o.gain, value, ctx, 0.05);
      else if (key === "pitch" && typeof value === "number") setPitch(value);
      else if (key === "wobble" && typeof value === "number")
        rampTo(wobDepth.gain, value, ctx, 0.5);
      else if (key === "mode" && typeof value === "string") {
        // normal: base pitch + wobble; one_engine: −15 %; steady: no wobble; off: fade out 3 s.
        setPitch(value === "one_engine" ? 0.85 : 1);
        rampTo(wobDepth.gain, value === "steady" || value === "off" ? 0 : 17, ctx, 0.5);
        rampTo(level.gain, value === "off" ? 0 : 1, ctx, value === "off" ? 3 : 0.5);
      }
    });
  }),

  // White noise, band-pass 1.5 kHz. The gain is the static level (set with setParam "gain").
  static: def("ambience", true, 0.04, 1, (ctx, o, at, end) => {
    const n = noise(ctx, "white", true);
    n.connect(filter(ctx, "bandpass", 1500, 0.7)).connect(o);
    return voice(ctx, o, [n], at, end);
  }),

  // Pink noise, low-pass 6 kHz, gain 0.08 (0.04 for rain_light via setParam "gain").
  rain: def("ambience", true, 0.08, 2, (ctx, o, at, end) => {
    const n = noise(ctx, "pink", true);
    n.connect(gainNode(ctx, 0.9))
      .connect(filter(ctx, "lowpass", 6000, 0))
      .connect(o);
    return voice(ctx, o, [n], at, end);
  }),

  // 2.5 s brown noise with a slow attack and a rumbling 4 Hz LFO.
  thunder: def("sfx", false, 0.4, 2.5, (ctx, o, at) => {
    const n = noise(ctx, "brown", false);
    const lp = filter(ctx, "lowpass", 600, 0);
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.6);
    env.gain.setValueAtTime(1, at + 0.9);
    env.gain.linearRampToValueAtTime(0, at + 2.5);
    const rumble = gainNode(ctx, 0.6);
    const lfo = osc(ctx, "sine", 4);
    lfo.connect(gainNode(ctx, 0.4)).connect(rumble.gain);
    n.connect(lp).connect(rumble).connect(env).connect(o);
    return voice(ctx, o, [lfo, n], at, at + 2.5);
  }),

  // Sawtooth 1800 Hz with fast vibrato + noise, 0.6 s.
  screech: def("sfx", false, 0.2, 0.6, (ctx, o, at) => {
    const tone = osc(ctx, "sawtooth", 1800);
    const vib = osc(ctx, "sine", 28);
    vib.connect(gainNode(ctx, 70)).connect(tone.frequency);
    const n = noise(ctx, "white", false);
    const env = gainNode(ctx, 0);
    arEnv(env.gain, at, 0.02, 0.4, 0.18);
    tone.connect(gainNode(ctx, 0.65 * BL)).connect(env);
    n.connect(filter(ctx, "highpass", 1200, 0))
      .connect(gainNode(ctx, 0.25))
      .connect(env);
    env.connect(o);
    return voice(ctx, o, [vib, n, tone], at, at + 0.6);
  }),

  // Sine 2400 Hz with slow vibrato, 1.5 s fade.
  squeal: def("sfx", false, 0.1, 1.5, (ctx, o, at) => {
    const tone = osc(ctx, "sine", 2400);
    const vib = osc(ctx, "sine", 5);
    vib.connect(gainNode(ctx, 25)).connect(tone.frequency);
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.04);
    env.gain.linearRampToValueAtTime(0, at + 1.5);
    tone.connect(env).connect(o);
    return voice(ctx, o, [vib, tone], at, at + 1.5);
  }),

  // Filtered noise with a 0.4 Hz swell (2.5 s), then a breath of silence: one snore per 3.5 s.
  snore: def("ambience", true, 0.05, 3.5, (ctx, o, at, end) => {
    const n = noise(ctx, "pink", true);
    const swell = gainNode(ctx, 0);
    const shape = bufferSource(
      cachedBuffer(ctx, "snore_env", () =>
        synthBuffer(ctx, 3.5, (t) => (t < 2.5 ? Math.sin((Math.PI * t) / 2.5) ** 2 : 0)),
      ),
      ctx,
      true,
    );
    shape.connect(swell.gain);
    n.connect(filter(ctx, "lowpass", 380, 0))
      .connect(gainNode(ctx, 0.9))
      .connect(swell)
      .connect(o);
    return voice(ctx, o, [shape, n], at, end);
  }),

  // A quick arpeggio 1046, 1318, 1568 Hz (60 ms each).
  sparkle: def("sfx", false, 0.15, 0.4, (ctx, o, at) => {
    const notes = [1046, 1318, 1568];
    const srcs: OscillatorNode[] = [];
    notes.forEach((f, i) => {
      const t = at + i * 0.06;
      const tone = osc(ctx, "sine", f);
      const env = gainNode(ctx, 0);
      percEnv(env.gain, t, 0.004, i === notes.length - 1 ? 0.22 : 0.06, 0.7);
      tone.connect(env).connect(o);
      srcs.push(tone);
    });
    for (const s of srcs) s.start(at);
    return voiceStarted(ctx, o, srcs, at + 0.4);
  }),

  // Two short 600 Hz beeps every 2 s.
  // SPEC-ASSUMPTION: low_fuel and radio_crackle ride the sfx bus — §F16.4 lists the ambience
  // bus contents without them, and a fuel warning must not be halved while the radio is busy.
  low_fuel: patternLoop(
    "sfx",
    0.12,
    2,
    "low_fuel",
    (t) => (gate(t, 0, 0.08) + gate(t, 0.16, 0.08)) * sine(600, t),
  ),

  // A short band-passed noise click (push-to-talk key-up of the radio).
  radio_in: def("radio", false, 0.15, 0.06, (ctx, o, at) => {
    const n = noise(ctx, "white", false);
    const env = gainNode(ctx, 0);
    percEnv(env.gain, at, 0.001, 0.035);
    const blip = osc(ctx, "square", 1400);
    const bEnv = gainNode(ctx, 0);
    percEnv(bEnv.gain, at, 0.001, 0.025, 0.3);
    n.connect(gainNode(ctx, 1.4))
      .connect(filter(ctx, "bandpass", 2500, 1.2))
      .connect(env);
    blip.connect(bEnv).connect(env);
    env.connect(o);
    return voice(ctx, o, [n, blip], at, at + 0.06);
  }),

  // A band-passed noise squelch tail (release of the radio).
  radio_out: def("radio", false, 0.15, 0.22, (ctx, o, at) => {
    const n = noise(ctx, "white", false);
    const env = gainNode(ctx, 0);
    arEnv(env.gain, at, 0.004, 0.14, 0.07);
    n.connect(gainNode(ctx, 1.35))
      .connect(filter(ctx, "bandpass", 1800, 0.9))
      .connect(env);
    env.connect(o);
    return voice(ctx, o, [n], at, at + 0.22);
  }),

  // White noise, high-pass 3 kHz.
  fuel_hiss: def("ambience", true, 0.03, 1, (ctx, o, at, end) => {
    const n = noise(ctx, "white", true);
    n.connect(gainNode(ctx, 0.52))
      .connect(filter(ctx, "highpass", 3000, 0))
      .connect(o);
    return voice(ctx, o, [n], at, end);
  }),

  // Sawtooth 220 → 330 Hz glide over 0.8 s through a low-pass 900 Hz.
  motor_whirr: def("sfx", false, 0.1, 0.85, (ctx, o, at) => {
    const tone = osc(ctx, "sawtooth", 220);
    tone.frequency.setValueAtTime(220, at);
    tone.frequency.linearRampToValueAtTime(330, at + 0.8);
    const env = gainNode(ctx, 0);
    arEnv(env.gain, at, 0.03, 0.75, 0.05);
    tone
      .connect(gainNode(ctx, BL))
      .connect(filter(ctx, "lowpass", 900, 0))
      .connect(env)
      .connect(o);
    return voice(ctx, o, [tone], at, at + 0.85);
  }),

  // 0.6 s of noise bursts gated randomly, band-pass 2 kHz.
  radio_crackle: def("sfx", false, 0.12, 0.6, (ctx, o, at) => {
    const buf = cachedBuffer(ctx, "crackle", () => {
      const rand = rng(7);
      let open = false;
      let next = 0;
      return synthBuffer(ctx, 0.6, (t) => {
        if (t >= next) {
          open = rand() < 0.55;
          next = t + 0.005 + rand() * 0.035;
        }
        return open ? (rand() * 2 - 1) * (0.5 + 0.5 * rand()) : 0;
      });
    });
    const src = bufferSource(buf, ctx, false);
    src
      .connect(gainNode(ctx, 1.5))
      .connect(filter(ctx, "bandpass", 2000, 0.9))
      .connect(o);
    return voice(ctx, o, [src], at, at + 0.6);
  }),

  // Triangle arpeggio C5–E5–G5–C6 (120 ms each) with a 1 s tail.
  music_sting: def("sfx", false, 0.12, 1.4, (ctx, o, at) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const srcs: OscillatorNode[] = [];
    notes.forEach((f, i) => {
      const t = at + i * 0.12;
      const last = i === notes.length - 1;
      const tone = osc(ctx, "triangle", f);
      const env = gainNode(ctx, 0);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.6, t + 0.006);
      env.gain.setTargetAtTime(0, t + 0.006, last ? 0.25 : 0.05);
      tone.connect(env).connect(o);
      srcs.push(tone);
    });
    for (const s of srcs) s.start(at);
    return voiceStarted(ctx, o, srcs, at + 1.4);
  }),

  // Sine 70 Hz thump, 120 ms + a noise slap.
  stamp: def("sfx", false, 0.3, 0.16, (ctx, o, at) => {
    const tone = osc(ctx, "sine", 70);
    const tEnv = gainNode(ctx, 0);
    percEnv(tEnv.gain, at, 0.002, 0.12, 0.72);
    const n = noise(ctx, "white", false);
    const nEnv = gainNode(ctx, 0);
    percEnv(nEnv.gain, at, 0.001, 0.035, 0.28);
    tone.connect(tEnv).connect(o);
    n.connect(filter(ctx, "bandpass", 1500, 0.7))
      .connect(gainNode(ctx, 1.4))
      .connect(nEnv);
    nEnv.connect(o);
    return voice(ctx, o, [n, tone], at, at + 0.16);
  }),

  // Band-passed noise sweep 2 → 6 kHz, 250 ms.
  page_turn: def("sfx", false, 0.08, 0.25, (ctx, o, at) => {
    const n = noise(ctx, "white", false);
    const bp = filter(ctx, "bandpass", 2000, 0.9);
    bp.frequency.setValueAtTime(2000, at);
    bp.frequency.exponentialRampToValueAtTime(6000, at + 0.25);
    const env = gainNode(ctx, 0);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 0.06);
    env.gain.linearRampToValueAtTime(0, at + 0.25);
    n.connect(gainNode(ctx, 1.3)).connect(bp).connect(env).connect(o);
    return voice(ctx, o, [n], at, at + 0.25);
  }),
};

function chimeVoice(ctx: BaseAudioContext, o: GainNode, at: number, base: number): Voice {
  const a = osc(ctx, "sine", base);
  const b = osc(ctx, "sine", base * 1.5);
  const env = gainNode(ctx, 0);
  percEnv(env.gain, at, 0.005, 0.4);
  a.connect(gainNode(ctx, 0.5)).connect(env);
  b.connect(gainNode(ctx, 0.5)).connect(env);
  env.connect(o);
  return voice(ctx, o, [a, b], at, at + 0.5);
}

/** A voice whose sources were started by the recipe itself (staggered notes). */
function voiceStarted(
  ctx: BaseAudioContext,
  o: GainNode,
  srcs: AudioScheduledSourceNode[],
  end: number,
): Voice {
  let stopped = false;
  const last = srcs[srcs.length - 1];
  if (last) last.onended = () => o.disconnect();
  for (const s of srcs) s.stop(end);
  return {
    stop(when) {
      if (stopped) return;
      stopped = true;
      const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
      o.gain.cancelScheduledValues(t);
      o.gain.setValueAtTime(o.gain.value, t);
      o.gain.linearRampToValueAtTime(0, t + FADE_S);
    },
    set: () => {},
  };
}
