"use strict";

const ImpactSound = (() => {
  const rate = 44100;
  const cues = {
    shot:   { label: "枪械开火", detail: "爆响、低频冲击与短回声", seconds: 0.205, peak: 0.72, color: "#d2d9d2" },
    shield: { label: "命中护盾", detail: "低沉敲击，带一点金属余振", seconds: 0.145, peak: 0.65, color: "#76edce" },
    break:  { label: "破盾", detail: "裂开、崩碎、碎片弹落", seconds: 0.685, peak: 0.88, color: "#c0a8ff" },
    body:   { label: "命中本体", detail: "短而干的闷击", seconds: 0.115, peak: 0.66, color: "#ffa789" },
    down:   { label: "击倒", detail: "重击后两段下沉", seconds: 0.42, peak: 0.80, color: "#f5ce83" }
  };

  const clipRate = 24000;
  function decodeClip(encoded) {
    return Float32Array.from(atob(encoded), char => {
      const byte = char.charCodeAt(0);
      const value = byte < 128 ? byte : byte - 256;
      return Math.sign(value) * (256 ** (Math.abs(value) / 127) - 1) / 255;
    });
  }
  const glass = decodeClip(foleyClips.glass);
  const blast = decodeClip(foleyClips.shot);

  // Mix a full recording or a short slice at an independently chosen playback speed.
  function clip(out, pcm, start, speed, level, from = 0, seconds = pcm.length / clipRate - from) {
    const offset = Math.round(start * rate);
    const step = speed * clipRate / rate;
    const first = from * clipRate;
    const frames = Math.min(out.length - offset, Math.floor(
      Math.min(seconds * clipRate, pcm.length - 1 - first) / step));
    for (let i = 0; i < frames; i++) {
      const position = first + i * step;
      const index = Math.floor(position);
      const sample = pcm[index] + (pcm[index + 1] - pcm[index]) * (position - index);
      const edge = Math.min(1, i / (rate * 0.0006), (frames - 1 - i) / (rate * 0.006));
      out[offset + i] += level * edge * sample;
    }
  }

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
        clip(out, blast, 0, 0.98 * pitch, 1.08);
        noise(out, random, 0, 0.040, 920, 0.65, 0.006, 1.05);
        tone(out, 0.002, 0.120, 154 * pitch, 62, 0.014, 0.033, 0.59);
        noise(out, random, 0.041, 0.085, 510, 0.7, 0.021, 0.62);
        noise(out, random, 0.085, 0.035, 1510, 0.95, 0.007, 0.29);
        break;
      case "shield":
        noise(out, random, 0, 0.038, 1280, 0.9, 0.007, 1.24);
        tone(out, 0, 0.10, 282 * pitch, 174 * pitch, 0.008, 0.024, 0.83);
        tone(out, 0.003, 0.145, 517 * pitch, 443 * pitch, 0.010, 0.036, 0.44);
        tone(out, 0.007, 0.095, 883 * pitch, 786 * pitch, 0.010, 0.020, 0.18);
        break;
      case "break":
        // Stress crack, the whole breaking bottle, then two overlapping clusters of debris.
        tone(out, 0, 0.135, 248 * pitch, 79, 0.012, 0.036, 0.83);
        noise(out, random, 0, 0.05, 760, 0.64, 0.009, 2.35);
        clip(out, glass, 0.017, 0.87 * pitch, 1.25);
        noise(out, random, 0.030, 0.094, 448, 0.77, 0.023, 1.45);
        clip(out, glass, 0.072, 0.67 * pitch, 0.86, 0.286, 0.090);
        clip(out, glass, 0.162, 1.04 * pitch, 0.70, 0.299, 0.075);
        break;
      case "body":
        noise(out, random, 0, 0.068, 560, 0.60, 0.013, 2.0);
        tone(out, 0, 0.115, 175 * pitch, 77 * pitch, 0.009, 0.023, 0.87);
        tone(out, 0.003, 0.059, 365 * pitch, 198, 0.010, 0.012, 0.35);
        noise(out, random, 0.012, 0.044, 850, 0.72, 0.009, 0.55);
        break;
      case "down":
        noise(out, random, 0, 0.070, 830, 0.66, 0.012, 1.65);
        tone(out, 0, 0.155, 152 * pitch, 66, 0.014, 0.034, 0.72);
        tone(out, 0.009, 0.19, 364 * pitch, 281 * pitch, 0.020, 0.044, 0.62);
        tone(out, 0.105, 0.315, 211 * pitch, 144 * pitch, 0.029, 0.064, 0.71);
        tone(out, 0.110, 0.182, 408 * pitch, 293, 0.022, 0.031, 0.20);
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
    this.fragmentsUntil = 0;
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

  startVoice(kind, variation, bus, at, level = 1) {
    const key = kind + variation;
    if (!this.buffers.has(key)) {
      const pcm = this.samples.get(kind)[variation];
      const buffer = this.ctx.createBuffer(1, pcm.length, ImpactSound.rate);
      buffer.copyToChannel(pcm, 0);
      this.buffers.set(key, buffer);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers.get(key);
    const trim = level === 1 ? null : this.ctx.createGain();
    if (trim) {
      trim.gain.value = level;
      source.connect(trim).connect(bus);
    } else source.connect(bus);
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      if (trim) trim.disconnect();
      if (this.previewVoice === source) this.previewVoice = null;
    };
    source.start(at);
    return source;
  }

  fire(event, variation, mix) {
    if (!this.ctx) return;
    const at = this.ctx.currentTime;
    if (mix.shot) this.startVoice("shot", variation, this.weapon, at);
    if (!event || !mix.hit) return;
    const impactAt = at + 0.022;
    const transition = event.kind === "break" || event.kind === "down";
    if (transition) {
      const gain = this.weapon.gain;
      const duckAt = at + 0.012;
      gain.cancelScheduledValues(duckAt);
      gain.setTargetAtTime(0.43, duckAt, 0.004);
      if (event.kind === "break") this.fragmentsUntil = impactAt + 0.32;
      const recoverAt = Math.max(this.fragmentsUntil, impactAt + 0.16);
      gain.setTargetAtTime(1, recoverAt, 0.026);
    }
    const level = !transition && impactAt < this.fragmentsUntil ? 0.52 : 1;
    this.startVoice(event.kind, variation, this.confirm, impactAt, level);
  }

  preview(kind) {
    if (!this.ctx) return;
    this.stopPreview();
    const bus = kind === "shot" ? this.weapon : this.confirm;
    this.previewVoice = this.startVoice(kind, 0, bus, this.ctx.currentTime);
  }

  stopPreview() {
    if (this.previewVoice) this.previewVoice.stop();
    this.previewVoice = null;
  }

  reset() {
    this.fragmentsUntil = 0;
    for (const source of this.active) source.stop();
    if (this.weapon) {
      const now = this.ctx.currentTime;
      this.weapon.gain.cancelScheduledValues(now);
      this.weapon.gain.setValueAtTime(1, now);
    }
  }
}
