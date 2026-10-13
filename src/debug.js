// Debug overlay (D): FPS, song time, section, steer, hand angle, latency + SFX volume slider.
export const debug = {
  on: false,
  fps: 60,
  _acc: 0,
  _n: 0,
  _el: null,
  _txt: null,
  getInfo: () => ({}),

  init({ getInfo, setSfx }) {
    this.getInfo = getInfo;
    this._el = document.getElementById('debug');
    this._el.innerHTML = `<div id="dbg-txt"></div>SFX vol <input id="dbg-sfx" type="range" min="0" max="1" step="0.05" value="0.45">
keys: 1-9,0,-,= jump section · [ ] latency · P pause · G god · W webcam · O outlines · R restart · Esc menu`;
    this._txt = this._el.querySelector('#dbg-txt');
    this._el.querySelector('#dbg-sfx').addEventListener('input', (e) => setSfx(+e.target.value));
    if (new URLSearchParams(location.search).has('debug')) this.toggle();
  },
  toggle() {
    this.on = !this.on;
    this._el.classList.toggle('hidden', !this.on);
  },
  tick(dt) {
    this._acc += dt;
    this._n++;
    if (this._acc >= 0.5) {
      this.fps = this._n / this._acc;
      this._acc = 0;
      this._n = 0;
      if (this.on) {
        const info = this.getInfo();
        this._txt.textContent = `FPS ${this.fps.toFixed(0)}\n` + Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n');
      }
    }
  },
};
