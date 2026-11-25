"use strict";

const ImpactSound = (() => {
  const rate = 44100;
  const cues = {
    shield: { label: "命中护盾", detail: "金属短鸣", seconds: 0.15, peak: 0.61, color: "#76edce" },
    break:  { label: "破盾", detail: "脆响与碎片尾音", seconds: 0.34, peak: 0.83, color: "#c0a8ff" },
    body:   { label: "命中本体", detail: "短促的闷击", seconds: 0.12, peak: 0.67, color: "#ffa789" },
    down:   { label: "击倒", detail: "两段下行收束音", seconds: 0.46, peak: 0.82, color: "#f5ce83" },
    shot:   { seconds: 0.105, peak: 0.44 }
  };

  // A damped resonator. The pitch falls exponentially from startHz to endHz.
  function tone(out, start, duration, startHz, endHz, sweep, decay, level) {
    const offset = Math.round(start * rate);
    const length = Math.min(Math.round(duration * rate), out.length - offset);
    const pitchFall = Math.exp(-1 / (rate * sweep));
    const ampFall = Math.exp(-1 / (rate * decay));
    let delta = startHz - endHz;
    let amplitude = level;
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const edge = Math.min(1, i / (rate * 0.0012), (length - 1 - i) / (rate * 0.004));
      out[offset + i] += Math.sin(phase) * amplitude * edge;
      phase += Math.PI * 2 * (endHz + delta) / rate;
      delta *= pitchFall;
      amplitude *= ampFall;
    }
  }

  // Band-pass filtered noise gives the contact a surface texture.
  function noise(out, random, start, duration, hz, q, decay, level) {
    const offset = Math.round(start * rate);
    const length = Math.min(Math.round(duration * rate), out.length - offset);
    const w = 2 * Math.PI * hz / rate;
    const alpha = Math.sin(w) / (2 * q);
    const b = alpha / (1 + alpha);
    const a1 = -2 * Math.cos(w) / (1 + alpha);
    const a2 = (1 - alpha) / (1 + alpha);
    const fall = Math.exp(-1 / (rate * decay));
    let amp = level;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < length; i++) {
      const x = 2 * random() - 1;
      const y = b * (x - x2) - a1 * y1 - a2 * y2;
      const edge = Math.min(1, i / (rate * 0.0008), (length - 1 - i) / (rate * 0.003));
      out[offset + i] += amp * y * edge;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      amp *= fall;
    }
  }

  function render(kind, variation = 0) {
    const cue = cues[kind];
    const out = new Float32Array(Math.round(cue.seconds * rate));
    let seed = (0x45c3f7 + 104729 * variation) >>> 0;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const pitch = [1, 0.976, 1.028][variation % 3];
    switch (kind) {
      case "shot":
        noise(out, random, 0, 0.083, 680, 0.62, 0.014, 1.4);
        noise(out, random, 0.002, 0.042, 2850, 0.85, 0.007, 0.5);
        tone(out, 0, 0.10, 185 * pitch, 70, 0.012, 0.026, 0.6);
        break;
      case "shield":
        noise(out, random, 0, 0.031, 3100, 1.0, 0.006, 0.85);
        tone(out, 0, 0.082, 1140 * pitch, 830 * pitch, 0.013, 0.018, 0.64);
        tone(out, 0.002, 0.15, 1960 * pitch, 1580 * pitch, 0.025, 0.033, 0.48);
        tone(out, 0.004, 0.084, 2890 * pitch, 2700, 0.024, 0.016, 0.20);
        break;
      case "break":
        noise(out, random, 0, 0.104, 2280, 0.56, 0.019, 2.0);
        tone(out, 0, 0.12, 390 * pitch, 119, 0.019, 0.03, 0.54);
        for (const [start, hz, level] of [[0.004, 2690, 0.65], [0.019, 3980, 0.43],
               [0.047, 2060, 0.47], [0.083, 3260, 0.33], [0.129, 1620, 0.27]]) {
          tone(out, start, 0.195, hz * pitch, hz * pitch * 0.79, 0.027, 0.036, level);
          noise(out, random, start, 0.039, hz, 1.3, 0.010, level);
        }
        break;
      case "body":
        noise(out, random, 0, 0.075, 900, 0.65, 0.012, 1.25);
        tone(out, 0, 0.12, 246 * pitch, 101 * pitch, 0.013, 0.025, 0.94);
        tone(out, 0.002, 0.072, 620 * pitch, 329, 0.018, 0.016, 0.37);
        break;
      case "down":
        noise(out, random, 0, 0.075, 1420, 0.66, 0.012, 1.0);
        tone(out, 0, 0.20, 176, 68, 0.020, 0.049, 0.83);
        for (const [start, hz, level, tail] of [[0, 624, 0.59, 0.040], [0.087, 386, 0.68, 0.065]]) {
          tone(out, start, 0.37, hz * 1.12 * pitch, hz * pitch, 0.018, tail, level);
          tone(out, start + 0.002, 0.23, hz * 2.09 * pitch, hz * 2 * pitch, 0.026, tail * 0.55, level * 0.28);
        }
        break;
    }
    let peak = 0;
    for (const sample of out) peak = Math.max(peak, Math.abs(sample));
    const scale = cue.peak / peak;
    for (let i = 0; i < out.length; i++) out[i] *= scale;
    return out;
  }

  return { rate, cues, render };
})();

class FeedbackAudio {
  constructor(onAvailability) {
    this.onAvailability = onAvailability;
    this.level = 0.65;
    this.active = new Set();
    this.buffers = new Map();
    this.samples = new Map();
    for (const key of Object.keys(ImpactSound.cues)) {
      this.samples.set(key, [0, 1, 2].map(v => ImpactSound.render(key, v)));
    }
  }

  // Called inside the first user gesture. A source scheduled while resume() is
  // pending starts when the context runs, including the very first hit.
  arm() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: "interactive" });
        this.weapon = this.ctx.createGain();
        this.confirm = this.ctx.createGain();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -7;
        compressor.knee.value = 5;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.09;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.level;
        this.weapon.connect(compressor);
        this.confirm.connect(compressor);
        compressor.connect(this.master).connect(this.ctx.destination);
      }
      if (this.ctx.state === "running") {
        this.onAvailability(true);
      } else if (!this.resuming) {
        this.resuming = this.ctx.resume().then(() => this.onAvailability(true)).catch(() => {
          this.reset();
          this.onAvailability(false);
        }).finally(() => { this.resuming = null; });
      }
      return true;
    } catch {
      this.onAvailability(false);
      return false;
    }
  }

  setLevel(value) {
    this.level = value;
    if (this.master) this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.008);
  }

  startVoice(kind, variation, bus, at) {
    const key = kind + variation;
    if (!this.buffers.has(key)) {
      const pcm = this.samples.get(kind)[variation];
      const buffer = this.ctx.createBuffer(1, pcm.length, ImpactSound.rate);
      buffer.copyToChannel(pcm, 0);
      this.buffers.set(key, buffer);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers.get(key);
    source.connect(bus);
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      if (this.previewVoice === source) this.previewVoice = null;
    };
    source.start(at);
    return source;
  }

  fire(event, variation, mix) {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    if (event && mix.hit && (event.kind === "break" || event.kind === "down")) {
      const gain = this.weapon.gain;
      gain.cancelScheduledValues(at);
      gain.setTargetAtTime(0.32, at, 0.0015);
      gain.setTargetAtTime(1, at + (event.kind === "down" ? 0.145 : 0.10), 0.018);
    }
    if (mix.shot) this.startVoice("shot", variation, this.weapon, at);
    if (event && mix.hit) this.startVoice(event.kind, variation, this.confirm, at);
  }

  preview(kind) {
    if (!this.ctx) return;
    this.stopPreview();
    this.previewVoice = this.startVoice(kind, 0, this.confirm, this.ctx.currentTime);
  }

  stopPreview() {
    if (this.previewVoice) this.previewVoice.stop();
    this.previewVoice = null;
  }

  reset() {
    for (const source of this.active) source.stop();
    if (this.weapon) {
      const now = this.ctx.currentTime;
      this.weapon.gain.cancelScheduledValues(now);
      this.weapon.gain.setValueAtTime(1, now);
    }
  }
}
