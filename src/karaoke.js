// Karaoke lyrics: the current line big at the bottom, each word filling with colour exactly as it's sung,
// the next line previewed underneath. Word timings come from tools/karaoke.py (assets/lyrics_words.json).
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
      const r = await fetch(new URL('../assets/lyrics_words.json', import.meta.url));
      this.lines = r.ok ? await r.json() : [];
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
        this.spans = L[idx].words.map((w) => {
          const s = document.createElement('span');
          s.className = 'k-w';
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
        if (s.dataset.st !== 'now') { s.dataset.st = 'now'; s.classList.add('k-now'); }
      } else if (s.dataset.st) { s.dataset.st = ''; s.style.setProperty('--p', '0%'); s.classList.remove('k-now', 'k-done'); }
    }
  },
};

export const KARAOKE_CSS = `
#caption { bottom: 22px !important; max-width: 70% !important; width: max-content; font-size: 40px !important; line-height: 1.15; pointer-events: none; text-shadow: none !important; }
#caption .k-line { display: inline-block; padding: 6px 22px 10px; border-radius: 22px; background: rgba(20, 10, 35, 0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); font-weight: 700; letter-spacing: 0.2px; }
#caption .k-line:empty { display: none; }
#caption .k-line.k-in { animation: kin 0.25s ease-out; }
@keyframes kin { from { opacity: 0; transform: translateY(10px) scale(0.97); } }
#caption .k-w { --p: 0%; display: inline-block; color: transparent; background: linear-gradient(90deg, #ffd23f var(--p), #ffffff var(--p)); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 2px 0 rgba(20, 10, 35, 0.85)) drop-shadow(0 0 6px rgba(0, 0, 0, 0.35)); transition: transform 0.12s; }
#caption .k-w.k-now { transform: translateY(-3px) scale(1.06); filter: drop-shadow(0 2px 0 rgba(20, 10, 35, 0.85)) drop-shadow(0 0 10px rgba(255, 210, 63, 0.75)); }
#caption .k-w.k-done { background: #ffd23f; -webkit-background-clip: text; background-clip: text; }
#caption .k-next { margin-top: 6px; font-size: 22px; font-weight: 600; color: rgba(255, 255, 255, 0.72); text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
`;
