/// <reference types="node" />
// §F22 worklet.test: the decimation produces 1,600-sample chunks at 48 kHz and 44.1 kHz, and
// values clamp to Int16. The plain-JS worklet runs in a VM with AudioWorkletGlobalScope stubs.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/audio/pcm-worklet.js"),
  "utf8",
);
const QUANTUM = 128;

interface Processor {
  process(inputs: Float32Array[][]): boolean;
}

function load(sampleRate: number) {
  const posted: ArrayBuffer[] = [];
  let Ctor: (new () => Processor) | null = null;
  let registeredName = "";
  class AudioWorkletProcessor {
    port = { postMessage: (buf: ArrayBuffer) => posted.push(buf) };
  }
  vm.runInNewContext(SOURCE, {
    AudioWorkletProcessor,
    sampleRate,
    Int16Array,
    Math,
    registerProcessor: (name: string, cls: new () => Processor) => {
      registeredName = name;
      Ctor = cls;
    },
  });
  if (!Ctor) throw new Error("registerProcessor was not called");
  const C: new () => Processor = Ctor;
  return { proc: new C(), posted, registeredName };
}

/** Feed `seconds` of `signal(t)` in 128-frame render quanta. */
function feed(p: Processor, sampleRate: number, seconds: number, signal: (t: number) => number) {
  const total = Math.round(sampleRate * seconds);
  for (let off = 0; off < total; off += QUANTUM) {
    const n = Math.min(QUANTUM, total - off);
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = signal((off + i) / sampleRate);
    expect(p.process([[ch]])).toBe(true);
  }
}

describe("pcm-worklet", () => {
  it("registers as pcm-worklet and survives an empty input", () => {
    const { proc, registeredName } = load(48000);
    expect(registeredName).toBe("pcm-worklet");
    expect(proc.process([[]])).toBe(true);
    expect(proc.process([])).toBe(true);
  });

  it.each([48000, 44100])("posts 1,600-sample (3,200-byte) chunks at %i Hz", (rate) => {
    const { proc, posted } = load(rate);
    feed(proc, rate, 1, (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t));
    // 1 s at 16 kHz = 16,000 samples = 10 chunks (the float ratio at 44.1 kHz may leave the
    // 10th chunk a sample short of complete).
    expect(posted.length).toBeGreaterThanOrEqual(9);
    expect(posted.length).toBeLessThanOrEqual(10);
    for (const buf of posted) {
      expect(buf.byteLength).toBe(3200);
      expect(new Int16Array(buf).length).toBe(1600);
    }
    feed(proc, rate, 0.2, () => 0);
    expect(posted.length).toBeGreaterThanOrEqual(11);
  });

  it("emits 16 kHz: a 400 Hz tone keeps its period after decimation", () => {
    const { proc, posted } = load(48000);
    feed(proc, 48000, 0.1, (t) => 0.5 * Math.sin(2 * Math.PI * 400 * t));
    const s = new Int16Array(posted[0] ?? new ArrayBuffer(0));
    expect(s.length).toBe(1600);
    // Count rising zero crossings: 400 Hz over 100 ms = 40 cycles.
    let crossings = 0;
    for (let i = 1; i < s.length; i++) if ((s[i - 1] ?? 0) < 0 && (s[i] ?? 0) >= 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(39);
    expect(crossings).toBeLessThanOrEqual(41);
  });

  it("clamps to the Int16 range", () => {
    const loud = load(48000);
    feed(loud.proc, 48000, 0.1, () => 3);
    const hi = new Int16Array(loud.posted[0] ?? new ArrayBuffer(0));
    expect(Math.max(...hi)).toBe(32767);
    expect(Math.min(...hi)).toBe(32767);

    const neg = load(48000);
    feed(neg.proc, 48000, 0.1, () => -3);
    const lo = new Int16Array(neg.posted[0] ?? new ArrayBuffer(0));
    expect(Math.min(...lo)).toBe(-32768);
    expect(Math.max(...lo)).toBe(-32768);
  });

  it("transfers each chunk and starts a fresh buffer", () => {
    const { proc, posted } = load(48000);
    feed(proc, 48000, 0.2, (t) => (t < 0.1 ? 0.25 : -0.25));
    expect(posted.length).toBe(2);
    expect(posted[0]).not.toBe(posted[1]);
    expect(new Int16Array(posted[0] ?? new ArrayBuffer(0))[10]).toBe(Math.trunc(0.25 * 0x7fff));
    expect(new Int16Array(posted[1] ?? new ArrayBuffer(0))[10]).toBe(Math.trunc(-0.25 * 0x8000));
  });
});
