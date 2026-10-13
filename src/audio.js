// Song playback (Web Audio) + fully synthesized SFX.
// The song clock lives in clock.js and reads from here.

export const audio = {
  ctx: null,
  buffer: null,
  src: null,
  master: null,
  music: null,
  sfxBus: null,
  startAt: 0, // ctx time at which songTime == 0
  pausedAt: 0,
  playing: false,
  ended: false,
  rootMidi: 57, // A3; overridden from beatmap key
  scale: [0, 2, 4, 7, 9], // major pentatonic
  _noise: null,

  async init(url) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.45;
    // gentle compressor on SFX so stacks never clip
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    this.sfxBus.connect(comp).connect(this.master);
    const len = this.ctx.sampleRate * 1.5;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arr);
  },

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  },

  play(from = 0) {
    this.stop();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.music);
    const when = this.ctx.currentTime + 0.05;
    from = Math.max(0, from);
    if (from >= this.buffer.duration) from = this.buffer.duration - 0.01;
    src.start(when, from);
    this.startAt = when - from;
    this.src = src;
    this.playing = true;
    this.ended = false;
    src.onended = () => {
      if (this.src === src && this.playing) { this.ended = true; }
    };
  },
  stop() {
    if (this.src) {
      try { this.src.onended = null; this.src.stop(); } catch (e) { /* already stopped */ }
      this.src.disconnect();
      this.src = null;
    }
    this.playing = false;
  },
  pause(atTime) {
    this.pausedAt = atTime;
    this.stop();
  },

  setSfxVolume(v) { this.sfxBus.gain.value = v; },

  duck(db = -3, ms = 150) {
    const g = this.music.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Math.pow(10, db / 20), t + 0.02);
    g.linearRampToValueAtTime(1, t + 0.02 + ms / 1000 + 0.15);
  },
};

// ---------- SFX synth helpers ----------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** n-th note of the pentatonic scale above root (n can exceed scale length; wraps octaves) */
export function pent(n) {
  const s = audio.scale;
  const oct = Math.floor(n / s.length);
  const idx = ((n % s.length) + s.length) % s.length;
  return audio.rootMidi + oct * 12 + s[idx];
}

function env(gainNode, t, a, peak, d, sustain = 0) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
}
function tone(type, freq, t, { a = 0.005, d = 0.2, peak = 0.3, dest, detune = 0, slideTo = null, slideTime = null } = {}) {
  const ctx = audio.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.min(freq, 20000), t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.min(slideTo, 20000), t + (slideTime ?? a + d));
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, a, peak, d);
  o.connect(g).connect(dest || audio.sfxBus);
  o.start(t);
  o.stop(t + a + d + 0.05);
  return o;
}
function noise(t, { a = 0.005, d = 0.3, peak = 0.3, type = 'bandpass', f0 = 1000, f1 = null, q = 1, dest } = {}) {
  const ctx = audio.ctx;
  const s = ctx.createBufferSource();
  s.buffer = audio._noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  const g = ctx.createGain();
  env(g, t, a, peak, d);
  s.connect(f).connect(g).connect(dest || audio.sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + a + d + 0.05);
}

const SFX = {
  pickup({ step = 0 }) {
    const t = audio.ctx.currentTime;
    const m = pent(5 + (step % 12)); // climbs 1 pentatonic step per combo, wraps every ~2 octaves
    tone('square', mtof(m), t, { d: 0.09, peak: 0.12 });
    tone('sine', mtof(m + 12), t, { d: 0.14, peak: 0.12 });
  },
  miss() {
    const t = audio.ctx.currentTime;
    tone('sine', 110, t, { d: 0.12, peak: 0.18, slideTo: 70 });
  },
  ring() {
    const t = audio.ctx.currentTime;
    const m = pent(15);
    tone('sine', mtof(m), t, { d: 0.6, peak: 0.12, detune: -8 });
    tone('sine', mtof(m), t, { d: 0.6, peak: 0.12, detune: 8 });
    tone('sine', mtof(m + 7), t + 0.04, { d: 0.5, peak: 0.06 });
    noise(t, { d: 0.4, peak: 0.05, type: 'highpass', f0: 6000 });
  },
  chainNote({ i = 0 }) {
    const t = audio.ctx.currentTime;
    const major = [0, 2, 4, 5, 7, 9, 11, 12];
    const m = audio.rootMidi + 12 + major[Math.min(i, 7)];
    tone('triangle', mtof(m), t, { d: 0.35, peak: 0.2 });
    tone('sine', mtof(m + 12), t, { d: 0.3, peak: 0.08 });
  },
  chord() {
    const t = audio.ctx.currentTime;
    for (const iv of [0, 4, 7, 12, 16]) {
      tone('sawtooth', mtof(audio.rootMidi + 12 + iv), t, { a: 0.01, d: 0.9, peak: 0.05 });
      tone('square', mtof(audio.rootMidi + iv), t, { a: 0.01, d: 0.6, peak: 0.03 });
    }
    noise(t, { d: 0.8, peak: 0.08, type: 'highpass', f0: 4000 });
  },
  boost() {
    const t = audio.ctx.currentTime;
    noise(t, { a: 0.02, d: 0.5, peak: 0.25, type: 'bandpass', f0: 300, f1: 3000, q: 2 });
    tone('sawtooth', 80, t, { a: 0.02, d: 0.5, peak: 0.12, slideTo: 400 });
    tone('sine', 55, t, { d: 0.3, peak: 0.4, slideTo: 35 });
  },
  powerup() {
    const t = audio.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((iv, i) => tone('square', mtof(audio.rootMidi + 12 + iv), t + i * 0.06, { d: 0.12, peak: 0.1 }));
  },
  clang() {
    const t = audio.ctx.currentTime;
    for (const f of [523, 787, 1103, 1567]) tone('square', f, t, { d: 0.5, peak: 0.06 });
    noise(t, { d: 0.25, peak: 0.2, type: 'highpass', f0: 2500 });
  },
  bonk() {
    const t = audio.ctx.currentTime;
    tone('sine', 330, t, { d: 0.12, peak: 0.45, slideTo: 90 });
    noise(t, { d: 0.08, peak: 0.25, type: 'lowpass', f0: 1200 });
    tone('sine', 1400, t + 0.1, { a: 0.02, d: 0.55, peak: 0.12, slideTo: 300 }); // slide whistle down
  },
  whoosh() {
    const t = audio.ctx.currentTime;
    noise(t, { a: 0.05, d: 0.25, peak: 0.2, type: 'bandpass', f0: 600, f1: 4000, q: 3 });
  },
  tier() {
    const t = audio.ctx.currentTime;
    [pent(12), pent(14), pent(17)].forEach((m, i) => {
      tone('triangle', mtof(m), t + i * 0.11, { d: i === 2 ? 0.6 : 0.15, peak: 0.18 });
      tone('sine', mtof(m + 12), t + i * 0.11, { d: 0.2, peak: 0.06 });
    });
  },
  gate() {
    const t = audio.ctx.currentTime;
    noise(t, { a: 0.35, d: 0.2, peak: 0.18, type: 'highpass', f0: 1500, f1: 9000 });
    noise(t + 0.3, { d: 0.4, peak: 0.15, type: 'bandpass', f0: 3000, f1: 400, q: 2 });
  },
  fanfare() {
    const t = audio.ctx.currentTime;
    const r = audio.rootMidi + 12;
    [[0, 0.15], [4, 0.15], [7, 0.15], [12, 0.6]].forEach(([iv, d], i) => {
      tone('sawtooth', mtof(r + iv), t + i * 0.16, { d, peak: 0.08 });
      tone('square', mtof(r + iv - 12), t + i * 0.16, { d, peak: 0.05 });
    });
    [0, 4, 7, 12].forEach((iv) => tone('triangle', mtof(r + iv), t + 0.64, { d: 1.2, peak: 0.06 }));
  },
  trombone() {
    const t = audio.ctx.currentTime;
    const notes = [[62, 0.35], [61, 0.35], [60, 0.35], [59, 1.1]];
    let tt = t;
    notes.forEach(([m, d], i) => {
      const o = tone('sawtooth', mtof(m - 12), tt, { a: 0.04, d, peak: 0.12 });
      if (i === 3) {
        // wobble
        const lfo = audio.ctx.createOscillator();
        const lg = audio.ctx.createGain();
        lfo.frequency.value = 6;
        lg.gain.value = 3;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(tt); lfo.stop(tt + d);
      }
      tt += d + 0.05;
    });
  },
  wah() {
    const t = audio.ctx.currentTime;
    tone('triangle', mtof(pent(8)), t, { a: 0.02, d: 0.35, peak: 0.08, slideTo: mtof(pent(5)) });
  },
  ding() {
    const t = audio.ctx.currentTime;
    for (let i = 0; i < 3; i++) tone('sine', mtof(pent(15 + i * 2)), t + i * 0.12, { d: 0.4, peak: 0.12 });
  },
  tick() {
    const t = audio.ctx.currentTime;
    tone('square', mtof(pent(10)), t, { d: 0.08, peak: 0.12 });
  },
  go() {
    const t = audio.ctx.currentTime;
    tone('square', mtof(pent(15)), t, { d: 0.4, peak: 0.14 });
    tone('square', mtof(pent(10)), t, { d: 0.4, peak: 0.1 });
  },
  alarm() {
    const t = audio.ctx.currentTime;
    for (let i = 0; i < 2; i++) tone('square', 880, t + i * 0.25, { d: 0.18, peak: 0.06, slideTo: 660 });
  },
  splat() {
    const t = audio.ctx.currentTime;
    noise(t, { d: 0.15, peak: 0.3, type: 'lowpass', f0: 900 });
    tone('sine', 200, t, { d: 0.12, peak: 0.2, slideTo: 60 });
  },
  launch() {
    const t = audio.ctx.currentTime;
    noise(t, { a: 0.1, d: 1.6, peak: 0.25, type: 'bandpass', f0: 200, f1: 5000, q: 1.5 });
    tone('sawtooth', 60, t, { a: 0.1, d: 1.6, peak: 0.1, slideTo: 900 });
  },
};

export const sfx = {
  play(name, opts = {}) {
    if (!audio.ctx) return;
    const f = SFX[name];
    if (!f) return;
    try { f(opts); } catch (e) { console.warn('sfx', name, e); }
  },
};

/** Set root note from a key string like "A minor" / "C# major". Minor keys use relative-major pentatonic. */
export function setKey(key) {
  if (!key) return;
  const names = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const m = String(key).match(/^([A-G][#b]?)\s*(major|minor|maj|min|m)?/i);
  if (!m) return;
  let pc = names[m[1]];
  if (pc === undefined) return;
  const minor = m[2] && /^m(in)?/i.test(m[2]) && !/maj/i.test(m[2]);
  if (minor) pc = (pc + 3) % 12; // relative major pentatonic == minor pentatonic notes
  audio.rootMidi = 48 + pc;
  if (audio.rootMidi < 52) audio.rootMidi += 12;
}
