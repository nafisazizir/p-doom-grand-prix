// DOM overlay: P(doom), GPUs, combo, announcer, section cards, captions, popups, splats, PiP + wheel widget, FX canvas.
import { karaoke, KARAOKE_CSS } from '../../src/karaoke.js';
import { hands } from '../../src/hands.js';

const $ = (id) => document.getElementById(id);

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export const hud = {
  el: {},
  lastPdoom: -1,
  lastCombo: -1,
  announceUntil: 0,
  lyrics: [],
  lyricIdx: -1,
  speed: 0, // 0..1 speed-line intensity
  lines: [],

  init() {
    for (const id of ['hud', 'pdoom', 'pdoom-fill', 'gpus', 'combo', 'combo-tier', 'announce', 'card', 'card-title', 'card-sub', 'caption', 'warn', 'pip', 'pip-canvas', 'wheel', 'popups', 'splats', 'stamp', 'banner', 'power', 'power-name', 'power-fill', 'redwash', 'goldframe', 'flash', 'fx', 'kbd-hint', 'stage', 'assistant', 'assistant-msg', 'place']) {
      this.el[id] = $(id);
    }
    this.fx = this.el.fx.getContext('2d');
    // one-shot animations drop their class when done, so un-hiding the HUD (H) doesn't replay them
    const once = { card: ['show'], announce: ['show'], banner: ['show'], stamp: ['show'], pdoom: ['pulse-up', 'pulse-down'], combo: ['bump'] };
    for (const [id, cls] of Object.entries(once)) this.el[id]?.addEventListener('animationend', (e) => { if (e.target === this.el[id]) this.el[id].classList.remove(...cls); });
    for (let i = 0; i < 70; i++) this.lines.push(this._newLine(true));
    window.addEventListener('resize', () => this._resize());
    this._resize();
  },
  _resize() {
    this.el.fx.width = innerWidth;
    this.el.fx.height = innerHeight;
  },

  show(on) { this.el.hud.classList.toggle('hidden', !on); },

  setPdoom(v) {
    const s = v.toFixed(2);
    if (this.lastPdoom >= 0 && s !== this.lastPdoom.toFixed(2)) {
      restartAnim(this.el.pdoom, v > this.lastPdoom ? 'pulse-up' : 'pulse-down');
    }
    this.el.pdoom.textContent = s;
    this.el['pdoom-fill'].style.width = (v * 100).toFixed(1) + '%';
    this.el.redwash.style.opacity = v > 0.8 ? String(Math.min(1, (v - 0.8) / 0.15)) : '0';
    this.lastPdoom = v;
  },
  setScore(gpus, combo) {
    this.el.gpus.textContent = gpus;
    if (combo !== this.lastCombo) {
      this.el.combo.textContent = 'x' + combo;
      if (combo > this.lastCombo) restartAnim(this.el.combo, 'bump');
      this.lastCombo = combo;
    }
  },
  assistant(text) {
    const a = this.el.assistant;
    if (!a) return;
    clearTimeout(this._assistT);
    if (!text) { a.classList.remove('show'); return; }
    this.el['assistant-msg'].textContent = text;
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    this._assistT = setTimeout(() => a.classList.remove('show'), 5200);
  },
  setPlace(n) {
    if (!this.el.place || n === this._place) return;
    this._place = n;
    const suf = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    this.el.place.innerHTML = `${n}<small>${suf}</small>`;
    this.el.place.className = 'p' + n;
    restartAnim(this.el.place, 'p' + n);
  },
  setTier(text) { this.el['combo-tier'].textContent = text || ''; },
  setGold(on) { this.el.goldframe.classList.toggle('on', on); },

  announce(text, ms = 1600) {
    const a = this.el.announce;
    a.textContent = text;
    a.style.animationDuration = ms + 'ms';
    restartAnim(a, 'show');
  },
  card(title, sub) {
    this.el['card-title'].textContent = title;
    this.el['card-sub'].textContent = sub || '';
    restartAnim(this.el.card, 'show');
  },
  banner(text) {
    this.el.banner.textContent = text;
    restartAnim(this.el.banner, 'show');
  },
  stamp(text) {
    this.el.stamp.textContent = text;
    restartAnim(this.el.stamp, 'show');
  },
  flash(alpha = 0.6, ms = 200) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.opacity = alpha;
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms`;
    f.style.opacity = 0;
  },

  /** floating text at screen coords (px) */
  popup(text, x, y, cls = '') {
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.textContent = text;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    this.el.popups.appendChild(d);
    d._t = setTimeout(() => d.remove(), 850);
    return d;
  },
  /** counting popup ("+N GPU"): pickups in quick succession bump one popup instead of stacking unreadable text */
  popupCount(n, unit, x, y, cls = '') {
    const now = performance.now(), L = this._lastCount;
    if (L && L.unit === unit && L.cls === cls && now - L.t < 300 && L.el.isConnected) {
      L.n += n;
      L.t = now;
      L.el.textContent = `+${L.n} ${unit}`;
      L.el.style.left = x + 'px';
      L.el.style.top = y + 'px';
      L.el.style.animation = 'none'; void L.el.offsetWidth; L.el.style.animation = '';
      clearTimeout(L.el._t);
      L.el._t = setTimeout(() => L.el.remove(), 850);
      return;
    }
    this._lastCount = { n, unit, cls, t: now, el: this.popup(`+${n} ${unit}`, x, y, cls) };
  },

  /** "You're absolutely right!" window splatted on the windscreen; they stack up */
  splat(text = "You're absolutely right!", ttl = 3500) {
    const d = document.createElement('div');
    d.className = 'splat';
    d.innerHTML = `<div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div class="body"></div>`;
    d.querySelector('.body').textContent = text;
    const W = innerWidth, H = innerHeight;
    d.style.left = 40 + Math.random() * (W - 420) + 'px';
    d.style.top = 120 + Math.random() * (H - 380) + 'px';
    d.style.transform = `rotate(${(Math.random() - 0.5) * 24}deg)`;
    this.el.splats.appendChild(d);
    if (ttl) setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 650); }, ttl);
    return d;
  },
  clearSplats() { this.el.splats.innerHTML = ''; },

  setPower(name, frac) {
    if (!name) { this.el.power.classList.add('hidden'); return; }
    this.el.power.classList.remove('hidden');
    this.el['power-name'].textContent = name;
    this.el['power-fill'].style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  },

  // ---------- lyrics ----------
  async loadLyrics() {
    // karaoke: word-by-word highlighted lyrics (falls back to nothing if the file is missing)
    if (!document.getElementById('karaoke-css')) {
      const st = document.createElement('style');
      st.id = 'karaoke-css';
      st.textContent = KARAOKE_CSS;
      document.head.appendChild(st);
    }
    await karaoke.init(this.el.caption);
  },
  updateCaption(t) { karaoke.update(t); },

  // ---------- webcam PiP ----------
  showPip(on) { this.el.pip.classList.toggle('hidden', !on); },
  showKbdHint(on) { this.el['kbd-hint'].classList.toggle('hidden', !on); },
  updatePip(webcamOn) {
    if (!webcamOn || !hands.ready) return;
    hands.draw(this.el['pip-canvas']);
    this.el.wheel.style.transform = `rotate(${hands.both ? hands.angleDeg : 0}deg)`;
  },
  warn(on) { this.el.warn.classList.toggle('hidden', !on); },

  // ---------- speed lines (2D overlay) ----------
  _newLine(randomR) {
    const a = Math.random() * Math.PI * 2;
    return { a, r: randomR ? 0.6 + Math.random() * 0.5 : 0.55 + Math.random() * 0.1, v: 1.2 + Math.random() * 1.6, w: 1 + Math.random() * 3 };
  },
  /** sparse, thin streaks at the frame edges only: the renderer's radial speed blur does the heavy lifting on boost */
  drawFx(dt, intensity, color = '255,255,255') {
    const g = this.fx;
    const W = this.el.fx.width, H = this.el.fx.height;
    if (this._fxDrawn) { g.clearRect(0, 0, W, H); this._fxDrawn = false; }
    if (intensity < 0.02) return;
    this._fxDrawn = true;
    const cx = W / 2, cy = H * 0.42, R = Math.hypot(W, H) * 0.6;
    g.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const L = this.lines[i];
      L.r += L.v * dt * (0.8 + intensity);
      if (L.r > 1.1) Object.assign(L, this._newLine(false));
      if (L.r < 0.6) continue;
      const r0 = L.r * R, r1 = (L.r + 0.09 * intensity) * R;
      const fade = Math.min(1, (L.r - 0.6) * 5) * Math.min(1, (1.1 - L.r) * 6);
      g.strokeStyle = `rgba(${color},${(0.3 * intensity * fade).toFixed(3)})`;
      g.lineWidth = 0.6 + L.w * 0.45;
      g.beginPath();
      g.moveTo(cx + Math.cos(L.a) * r0, cy + Math.sin(L.a) * r0);
      g.lineTo(cx + Math.cos(L.a) * r1, cy + Math.sin(L.a) * r1);
      g.stroke();
    }
  },
};
