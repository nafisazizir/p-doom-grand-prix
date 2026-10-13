// DOM overlay: P(doom), GPUs, combo, announcer, section cards, captions, popups, splats, PiP + wheel widget, FX canvas.
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
    for (const id of ['hud', 'pdoom', 'pdoom-fill', 'gpus', 'combo', 'combo-tier', 'announce', 'card', 'card-title', 'card-sub', 'caption', 'warn', 'pip', 'pip-canvas', 'wheel', 'popups', 'splats', 'stamp', 'banner', 'power', 'power-name', 'power-fill', 'redwash', 'goldframe', 'flash', 'fx', 'kbd-hint', 'stage']) {
      this.el[id] = $(id);
    }
    this.fx = this.el.fx.getContext('2d');
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
    setTimeout(() => d.remove(), 850);
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
  async loadLyrics(url) {
    try {
      const txt = await fetch(url).then((r) => (r.ok ? r.text() : ''));
      this.lyrics = [];
      for (const line of txt.split('\n')) {
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
        if (m) this.lyrics.push({ t: +m[1] * 60 + +m[2], text: m[3].trim() });
      }
    } catch (e) { this.lyrics = []; }
  },
  updateCaption(t) {
    let idx = -1;
    for (let i = 0; i < this.lyrics.length; i++) if (this.lyrics[i].t <= t + 0.05) idx = i;
    // hide a line after 6 s or when next starts
    if (idx >= 0 && t - this.lyrics[idx].t > 6) idx = -2;
    if (idx !== this.lyricIdx) {
      this.lyricIdx = idx;
      this.el.caption.textContent = idx >= 0 ? this.lyrics[idx].text : '';
    }
  },

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
    return { a, r: randomR ? Math.random() : 0.3 + Math.random() * 0.2, v: 1.5 + Math.random() * 2, w: 1 + Math.random() * 3 };
  },
  drawFx(dt, intensity, color = '255,255,255') {
    const g = this.fx;
    const W = this.el.fx.width, H = this.el.fx.height;
    g.clearRect(0, 0, W, H);
    if (intensity < 0.02) return;
    const cx = W / 2, cy = H * 0.45, R = Math.hypot(W, H) * 0.6;
    g.lineCap = 'round';
    for (const L of this.lines) {
      L.r += L.v * dt * (0.6 + intensity);
      if (L.r > 1.1) Object.assign(L, this._newLine(false));
      const r0 = L.r * R, r1 = (L.r + 0.12 * intensity) * R;
      if (L.r < 0.35) continue;
      g.strokeStyle = `rgba(${color},${(0.55 * intensity * Math.min(1, (L.r - 0.35) * 4)).toFixed(3)})`;
      g.lineWidth = L.w * (1 + intensity);
      g.beginPath();
      g.moveTo(cx + Math.cos(L.a) * r0, cy + Math.sin(L.a) * r0);
      g.lineTo(cx + Math.cos(L.a) * r1, cy + Math.sin(L.a) * r1);
      g.stroke();
    }
  },
};
