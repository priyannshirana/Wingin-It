// The bus graph and voice bookkeeping behind `sfx` (§F16.4). Works on any BaseAudioContext,
// so the tests render it through an OfflineAudioContext in a real browser.
//
//   master (volume × mute; default 0.5)
//    ├─ sfxBus      one-shots                         gain 1.0
//    ├─ ambienceBus loops (engine, rain, static, …)   gain 1.0, ducked to 0.5 while the radio is busy
//    └─ radioBus    radio_in / radio_out              gain 0.6
import type { SfxName, SfxParam } from "./names";
import { RECIPES, type BusName, type Voice } from "./recipes";

export const BUS_GAIN: Readonly<Record<BusName, number>> = { sfx: 1, ambience: 1, radio: 0.6 };
export const DUCK_GAIN = 0.5;
export const DUCK_RAMP_S = 0.15;
const MASTER_RAMP_S = 0.03;

export class AudioEngine {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly buses: Readonly<Record<BusName, GainNode>>;
  private readonly loops = new Map<SfxName, Voice>();
  private readonly params = new Map<SfxName, Map<SfxParam, number | string>>();
  private ducked = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode = ctx.destination, volume = 0.5) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(dest);
    const bus = (name: BusName) => {
      const g = ctx.createGain();
      g.gain.value = BUS_GAIN[name];
      g.connect(this.master);
      return g;
    };
    this.buses = { sfx: bus("sfx"), ambience: bus("ambience"), radio: bus("radio") };
  }

  /** Play a one-shot now (a loop recipe plays a single cycle). */
  play(name: SfxName, at = this.ctx.currentTime): void {
    const r = RECIPES[name];
    const v = r.start(this.ctx, this.buses[r.bus], at, true);
    this.applyParams(name, v);
  }

  /** Start or stop a loop (idempotent). A one-shot recipe passed here just plays once. */
  loop(name: SfxName, on: boolean): void {
    const r = RECIPES[name];
    const running = this.loops.get(name);
    if (on) {
      if (running) return;
      if (!r.loop) {
        this.play(name);
        return;
      }
      const v = r.start(this.ctx, this.buses[r.bus], this.ctx.currentTime);
      this.applyParams(name, v);
      this.loops.set(name, v);
    } else if (running) {
      running.stop();
      this.loops.delete(name);
    }
  }

  /** Remember a parameter (applied to the running voice now and to every later start). */
  setParam(name: SfxName, key: SfxParam, value: number | string): void {
    let m = this.params.get(name);
    if (!m) {
      m = new Map();
      this.params.set(name, m);
    }
    m.set(key, value);
    this.loops.get(name)?.set(key, value);
  }

  isLooping(name: SfxName): boolean {
    return this.loops.has(name);
  }

  activeLoops(): SfxName[] {
    return [...this.loops.keys()];
  }

  /** Master = volume × (muted ? 0 : 1), with a short ramp so changes never click. */
  setMaster(volume: number, muted: boolean): void {
    const v = muted ? 0 : Math.min(1, Math.max(0, volume));
    ramp(this.master.gain, v, this.ctx, MASTER_RAMP_S);
  }

  /** Ambience bus → 0.5× while anyone holds the radio channel (150 ms ramp), back to 1 after. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    ramp(this.buses.ambience.gain, on ? DUCK_GAIN : BUS_GAIN.ambience, this.ctx, DUCK_RAMP_S);
  }

  isDucked(): boolean {
    return this.ducked;
  }

  /** Stop every loop (leaving a screen). */
  stopAll(): void {
    for (const v of this.loops.values()) v.stop();
    this.loops.clear();
  }

  private applyParams(name: SfxName, v: Voice): void {
    const m = this.params.get(name);
    if (m) for (const [k, val] of m) v.set(k, val);
  }
}

function ramp(param: AudioParam, value: number, ctx: BaseAudioContext, seconds: number): void {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}
