// The single source of truth for gameplay time: the audio clock.
// songTime = audioCtx time - startAt + latencyOffset, smoothed with getOutputTimestamp.
import { audio } from './audio.js';

export const clock = {
  latency: 0, // seconds, adjustable with [ / ]
  _last: 0,

  now() {
    if (!audio.ctx) return 0;
    if (!audio.playing) return audio.pausedAt;
    let ctxTime = audio.ctx.currentTime;
    if (audio.ctx.getOutputTimestamp) {
      const ts = audio.ctx.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) {
        ctxTime = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
      }
    }
    let t = ctxTime - audio.startAt + this.latency;
    // never run backwards between frames (timestamp jitter)
    if (t < this._last && this._last - t < 0.05) t = this._last;
    this._last = t;
    return t;
  },
  reset(t = 0) { this._last = t; },
};
