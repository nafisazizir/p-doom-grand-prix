// Karaoke lyrics: the current line big at the bottom, each word filling with colour exactly as it's sung,
// the next line previewed underneath. Word timings come from tools/karaoke.py (assets/lyrics_words.json).
// hype words: special styles + a one-shot animation when sung. fly = big text that flies up off the line.
const HYPE = {
  pdoom: { cls: 'pdoom', fly: 'P(DOOM)!', ev: 'pdoom' },
  foom: { cls: 'rhyme', fly: 'FOOM!', ev: 'foom' },
  room: { cls: 'rhyme' }, shrooms: { cls: 'rhyme' }, moon: { cls: 'rhyme' }, soon: { cls: 'rhyme' }, loom: { cls: 'rhyme' },
  boom: { cls: 'boom', fly: 'BOOM!', ev: 'boom' },
  agi: { cls: 'agi' }, singularitys: { cls: 'agi' }, singularity: { cls: 'agi' }, transformers: { cls: 'agi' },
  shoggoths: { cls: 'eerie' }, shinigami: { cls: 'eerie' }, basilisk: { cls: 'eerie' }, ilya: { cls: 'eerie' },
  sydney: { cls: 'love', fly: '💕' }, gato: { cls: 'love', fly: '🐈' },
  nvda: { cls: 'money', fly: '📈' }, flops: { cls: 'money' }, gpu: { cls: 'money' }, '1e30': { cls: 'money' },
  accelerating: { cls: 'speed' }, optimizing: { cls: 'speed' },
  paperclips: { cls: 'steel' }, fuse: { cls: 'fire', fly: '🔥' },
};
const norm = (w) => w.toLowerCase().replace('p(doom)', 'pdoom').replace(/[^a-z0-9]/g, '');

export const karaoke = {
  lines: [],
  el: null,
  cur: -2,
  spans: [],
  active: -1,

  async init(el) {
    this.el = el;
    el.innerHTML = '<div class="k-line"></div><div class="k-next"></div>';
    this.lineEl = el.querySelector('.k-line');
    this.nextEl = el.querySelector('.k-next');
    try {
      const [r, rs] = await Promise.all([
        fetch(new URL('../assets/lyrics_words.json', import.meta.url)),
        fetch(new URL('../assets/sections.json', import.meta.url)),
      ]);
      this.lines = r.ok ? await r.json() : [];
      const secs = rs.ok ? await rs.json() : [];
      // chorus lines get the big treatment
      for (const l of this.lines) l.chorus = secs.some((s) => s.part === 'chorus' && l.t >= s.start - 0.6 && l.t < s.end);
    } catch (e) { this.lines = []; }
    this.cur = -2;
  },

  update(t) {
    if (!this.lineEl) return;
    const L = this.lines;
    // current line: shown slightly before its first word, until the next line takes over (or it ends)
    let idx = -1;
    for (let i = 0; i < L.length; i++) if (t >= L[i].t - 0.45) idx = i;
    if (idx >= 0 && t > L[idx].e + 1.2 && (!L[idx + 1] || t < L[idx + 1].t - 0.45)) idx = -1;
    if (idx !== this.cur) {
      this.cur = idx;
      this.active = -1;
      if (idx < 0) {
        this.lineEl.innerHTML = '';
        this.spans = [];
      } else {
        this.lineEl.innerHTML = '';
        this.lineEl.classList.toggle('k-chorus', !!L[idx].chorus);
        this.spans = L[idx].words.map((w) => {
          const s = document.createElement('span');
          const h = HYPE[norm(w.w)];
          s.className = 'k-w' + (h ? ' k-hype k-' + h.cls : '');
          if (h) s._hype = h;
          s.textContent = w.w;
          this.lineEl.appendChild(s);
          this.lineEl.appendChild(document.createTextNode(' '));
          return s;
        });
        this.lineEl.classList.remove('k-in'); void this.lineEl.offsetWidth; this.lineEl.classList.add('k-in');
      }
      const nx = idx >= 0 ? L[idx + 1] : L.find((l) => l.t > t);
      this.nextEl.textContent = nx && nx.t - t < 8 ? nx.text : '';
    }
    if (idx < 0) return;
    const words = L[idx].words;
    for (let i = 0; i < words.length; i++) {
      const w = words[i], s = this.spans[i];
      const p = t <= w.t ? 0 : t >= w.e ? 1 : (t - w.t) / (w.e - w.t);
      if (p >= 1) { if (s.dataset.st !== 'done') { s.dataset.st = 'done'; s.style.setProperty('--p', '100%'); s.classList.remove('k-now'); s.classList.add('k-done'); } }
      else if (p > 0) {
        s.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        if (s.dataset.st !== 'now') {
          s.dataset.st = 'now';
          s.classList.add('k-now');
          if (s._hype && !s._popped) this._pop(s);
        }
      } else if (s.dataset.st) { s.dataset.st = ''; s.style.setProperty('--p', '0%'); s.classList.remove('k-now', 'k-done'); }
    }
  },

  _pop(s) {
    s._popped = true;
    s.classList.add('k-pop');
    const h = s._hype;
    if (h.fly) {
      const f = document.createElement('div');
      f.className = 'k-fly k-fly-' + h.cls;
      f.textContent = h.fly;
      const r = s.getBoundingClientRect(), pr = this.el.getBoundingClientRect();
      f.style.left = r.left - pr.left + r.width / 2 + 'px';
      this.el.appendChild(f);
      setTimeout(() => f.remove(), 1300);
    }
    if (h.ev) window.dispatchEvent(new CustomEvent('karaoke-hype', { detail: h.ev }));
  },
};

export const KARAOKE_CSS = `
#caption { position: absolute; }
#caption .k-line.k-chorus { font-size: 1.06em; background: linear-gradient(90deg, rgba(60,14,60,0.7), rgba(20,10,35,0.6), rgba(60,14,60,0.7)); box-shadow: 0 0 0 2px rgba(255,140,60,0.55), 0 0 28px rgba(255,90,60,0.35); animation: kchorus 0.93s ease-in-out infinite alternate; }
@keyframes kchorus { to { box-shadow: 0 0 0 2px rgba(255,200,80,0.8), 0 0 40px rgba(255,90,60,0.55); } }
#caption .k-hype { font-size: 1.14em; margin: 0 0.05em; }
#caption .k-hype.k-now, #caption .k-hype.k-done { background: var(--hc) !important; -webkit-background-clip: text !important; background-clip: text !important; background-size: 200% 100% !important; }
#caption .k-pdoom { --hc: linear-gradient(180deg, #ffe08a, #ff7a1f 55%, #ff2d3d); font-size: 1.32em; }
#caption .k-pdoom.k-pop { animation: kpdoom 0.75s cubic-bezier(.2,1.6,.4,1); }
@keyframes kpdoom { 0% { transform: scale(1); } 30% { transform: scale(1.7) rotate(-7deg); filter: drop-shadow(0 0 22px rgba(255,60,40,0.95)); } 60% { transform: scale(1.25) rotate(3deg); } 100% { transform: scale(1.12) rotate(0); } }
#caption .k-rhyme { --hc: linear-gradient(180deg, #fff3a0, #ffd23f); }
#caption .k-rhyme.k-pop { animation: kboing 0.55s cubic-bezier(.3,1.8,.5,1); }
@keyframes kboing { 0% { transform: scale(1); } 25% { transform: scale(1.45, 0.65) translateY(6px); } 55% { transform: scale(0.85, 1.35) translateY(-10px); } 100% { transform: scale(1.06) translateY(-3px); } }
#caption .k-boom { --hc: linear-gradient(180deg, #fff, #ffb02e 40%, #ff3b1f); font-size: 1.3em; }
#caption .k-boom.k-pop { animation: kboom 0.6s ease-out; }
@keyframes kboom { 0% { transform: scale(0.6); filter: blur(4px) brightness(3); } 30% { transform: scale(1.8) rotate(-4deg); filter: blur(0) brightness(2); } 45%, 65% { transform: scale(1.3) translateX(-4px); } 55%, 75% { transform: scale(1.3) translateX(4px); } 100% { transform: scale(1.12); } }
#caption .k-agi { --hc: linear-gradient(90deg, #ff5ca8, #ffd23f, #5affd0, #5a8cff, #c86bff, #ff5ca8); }
#caption .k-agi.k-now, #caption .k-agi.k-done { animation: krainbow 1.2s linear infinite; }
@keyframes krainbow { to { background-position: 200% 0; } }
#caption .k-eerie { --hc: linear-gradient(180deg, #d6ffe8, #5aff9e); }
#caption .k-eerie.k-now, #caption .k-eerie.k-done { animation: kglitch 0.35s steps(2) infinite; }
@keyframes kglitch { 0% { filter: drop-shadow(3px 0 0 rgba(255,0,80,0.8)) drop-shadow(-3px 0 0 rgba(0,220,255,0.8)); transform: translateX(0); } 50% { filter: drop-shadow(-3px 1px 0 rgba(255,0,80,0.8)) drop-shadow(3px -1px 0 rgba(0,220,255,0.8)); transform: translateX(1px) skewX(-6deg); } }
#caption .k-love { --hc: linear-gradient(180deg, #ffd0e6, #ff5ca8); }
#caption .k-love.k-pop { animation: kboing 0.55s cubic-bezier(.3,1.8,.5,1); }
#caption .k-money { --hc: linear-gradient(180deg, #d8ffd0, #3dff7a); }
#caption .k-money.k-now, #caption .k-money.k-done { filter: drop-shadow(0 2px 0 rgba(20,10,35,0.85)) drop-shadow(0 0 12px rgba(60,255,120,0.75)); }
#caption .k-speed { --hc: linear-gradient(90deg, #8ff4ff, #ffffff 60%, #8ff4ff); }
#caption .k-speed.k-pop { animation: kspeed 0.7s ease-out; }
@keyframes kspeed { 0% { transform: translateX(-40px) skewX(-30deg) scaleX(1.6); opacity: 0.4; } 60% { transform: translateX(6px) skewX(-12deg) scaleX(1.1); opacity: 1; } 100% { transform: skewX(-8deg); } }
#caption .k-steel { --hc: linear-gradient(100deg, #8a94a8 20%, #ffffff 45%, #8a94a8 70%); }
#caption .k-steel.k-now, #caption .k-steel.k-done { animation: krainbow 1.4s linear infinite; }
#caption .k-fire { --hc: linear-gradient(180deg, #fff3a0, #ff8a1f 50%, #ff2d1f); }
#caption .k-fire.k-now, #caption .k-fire.k-done { animation: kflicker 0.18s steps(2) infinite; }
@keyframes kflicker { 50% { filter: drop-shadow(0 0 14px rgba(255,120,30,0.95)) brightness(1.25); } }
#caption .k-fly { position: absolute; bottom: 70%; transform: translateX(-50%); font-weight: 800; font-size: 72px; font-style: italic; color: #ffd23f; pointer-events: none; white-space: nowrap; filter: drop-shadow(0 4px 0 #2b1840) drop-shadow(0 0 20px rgba(255,90,40,0.8)); animation: kfly 1.25s ease-out forwards; }
#caption .k-fly-pdoom { color: #ff6a2a; font-size: 96px; }
#caption .k-fly-boom { color: #ffb02e; font-size: 104px; }
@keyframes kfly { 0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.4) rotate(-8deg); } 18% { opacity: 1; transform: translateX(-50%) translateY(-30px) scale(1.15) rotate(4deg); } 70% { opacity: 1; transform: translateX(-50%) translateY(-90px) scale(1) rotate(0); } 100% { opacity: 0; transform: translateX(-50%) translateY(-140px) scale(0.9); } }
#caption { bottom: 18px !important; max-width: 88% !important; width: max-content; font-size: 36px !important; line-height: 1.15; pointer-events: none; text-shadow: none !important; }
#caption .k-line { display: inline-block; padding: 6px 22px 10px; border-radius: 22px; background: rgba(20, 10, 35, 0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); font-weight: 700; letter-spacing: 0.2px; }
#caption .k-line:empty { display: none; }
#caption .k-line.k-in { animation: kin 0.25s ease-out; }
@keyframes kin { from { opacity: 0; transform: translateY(10px) scale(0.97); } }
#caption .k-w { --p: 0%; display: inline-block; color: transparent; background: linear-gradient(90deg, #ffd23f var(--p), #ffffff var(--p)); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 2px 0 rgba(20, 10, 35, 0.85)) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35)); transition: transform 0.12s; }
#caption .k-w.k-now { transform: translateY(-3px) scale(1.06); filter: drop-shadow(0 2px 0 rgba(20, 10, 35, 0.85)) drop-shadow(0 0 10px rgba(255, 210, 63, 0.75)); }
#caption .k-w.k-done { background: #ffd23f; -webkit-background-clip: text; background-clip: text; }
#caption .k-next { margin-top: 6px; font-size: 22px; font-weight: 600; color: rgba(255, 255, 255, 0.72); text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
`;
