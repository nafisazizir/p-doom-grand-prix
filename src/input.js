// Unified steering input: webcam wheel OR keyboard → steer ∈ [-1, 1]. Keyboard always works.
import { hands } from './hands.js';

const keys = new Set();
export const input = {
  webcam: false, // webcam steering enabled
  invertUntil: 0,
  freezeUntil: 0,
  frozenSteer: 0,
  wobbleUntil: 0,
  kbSteer: 0,
  onKey: null, // (code, event) => void, for game shortcuts

  init() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.onKey && this.onKey(e.code, e);
      keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
  },

  /** raw steer before gag effects */
  rawSteer(dt) {
    const l = keys.has('ArrowLeft') || keys.has('KeyA');
    const r = keys.has('ArrowRight') || keys.has('KeyD');
    const target = (r ? 1 : 0) - (l ? 1 : 0);
    // quick ramp so taps are gentle but holds are full lock
    const k = 1 - Math.exp(-dt * 14);
    this.kbSteer += (target - this.kbSteer) * k;
    if (!this.usingHands()) return this.kbSteer;
    return hands.steer;
  },

  /** true while the webcam wheel (not the keyboard) is steering */
  usingHands() {
    const kbActive = keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('ArrowRight') || keys.has('KeyD');
    return this.webcam && hands.ready && !kbActive;
  },

  /** steer with hazard effects applied. now = song time */
  getSteer(dt, now) {
    let s = this.rawSteer(dt);
    if (now < this.freezeUntil) return this.frozenSteer;
    if (now < this.invertUntil) s = -s;
    if (now < this.wobbleUntil) s += Math.sin(now * 23) * 0.8;
    return Math.max(-1, Math.min(1, s));
  },

  getBoost() {
    return keys.has('Space') || (this.webcam && hands.boostGesture);
  },

  isDown(code) { return keys.has(code); },
};
