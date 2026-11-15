// AudioWorklet (§F16.2): downsamples the mic to 16 kHz mono Int16 and posts 1,600-sample
// (100 ms, 3,200-byte) chunks to the main thread. Plain JS: it runs in AudioWorkletGlobalScope.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000; // 3 at 48 kHz, 2.75625 at 44.1 kHz
    this.out = new Int16Array(1600);
    this.n = 0;
    this.acc = 0;
    this.cnt = 0;
    this.pos = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.cnt++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        // box-average decimation (after the 7 kHz biquad)
        this.pos -= this.ratio;
        let s = this.acc / this.cnt;
        this.acc = 0;
        this.cnt = 0;
        s = Math.max(-1, Math.min(1, s));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff; // Int16, little-endian on all target CPUs
        if (this.n === 1600) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(1600);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
