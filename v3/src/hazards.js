// Hazard registry: the jokes you crash into.
// make() builds a mesh about BASE world units wide (it's scaled to the hazard's width), facing the driver (+z).
// hit(game) applies the gag. Every hit also costs P(doom) + combo + spinout (handled in main.js).
import * as THREE from 'three';
import { toon, glow, G, mesh, group, textPanel } from './toolkit.js';

export const BASE = 3;

function barrier(text, { bg = '#ff3b3b', fg = '#ffffff', stripe = '#ffffff', h = 1.6 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(BASE, h, 0.6, 0.15), toon(bg), 0, h / 2 + 0.25, 0));
  for (const x of [-BASE / 2 + 0.3, BASE / 2 - 0.3]) g.add(mesh(G.box(0.25, 0.5, 0.8), toon('#333'), x, 0.25, 0));
  const p = textPanel(text, { width: BASE - 0.2, height: h - 0.25, bg, fg, border: stripe, borderW: 10, radius: 18 });
  p.position.set(0, h / 2 + 0.25, 0.32);
  g.add(p);
  return g;
}
function puddle(text, color, textColor = '#ffffff') {
  const g = new THREE.Group();
  const p = mesh(G.cyl(BASE / 2, BASE / 2, 0.08, 24), toon(color, { outline: false, transparent: true, opacity: 0.85 }), 0, 0.12, 0);
  p.scale.z = 0.7;
  g.add(p);
  const s = textPanel(text, { width: BASE * 0.9, height: 0.8, bg: null, fg: textColor, stroke: '#2b1840', strokeW: 10 });
  s.rotation.x = -Math.PI / 2 + 0.5;
  s.position.set(0, 0.6, 0);
  g.add(s);
  return g;
}
function signOnPole(text, { bg = '#ffd23f', fg = '#2b1840', w = BASE, h = 1.8, diamond = false } = {}) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(0.12, 0.12, 2.2, 8), toon('#888'), 0, 1.1, 0));
  g.add(mesh(G.cyl(0.6, 0.7, 0.3, 12), toon('#555'), 0, 0.15, 0));
  const p = textPanel(text, { width: w, height: h, bg, fg, border: '#2b1840', borderW: 12, radius: diamond ? 10 : 24 });
  p.position.set(0, 2.2 + h / 2, 0.1);
  g.add(p);
  g.add(mesh(G.rbox(w + 0.2, h + 0.2, 0.15, 0.05), toon('#2b1840'), 0, 2.2 + h / 2, 0));
  return g;
}

export const HAZARDS = {
  oom: {
    label: 'OUT OF MEMORY',
    make: () => barrier(['OUT OF', 'MEMORY'], { bg: '#e8364f' }),
    lines: ['CUDA OUT OF MEMORY', 'TRY A SMALLER BATCH SIZE'],
    hit: (g) => g.fx.shake(0.8),
  },
  popup: {
    label: "You're absolutely right!",
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(G.rbox(BASE, 1.9, 0.3, 0.1), toon('#f4f0ff'), 0, 1.6, 0));
      g.add(mesh(G.box(BASE, 0.35, 0.32), toon('#8a6cff'), 0, 2.4, 0));
      const p = textPanel(["You're absolutely", 'right!'], { width: BASE - 0.3, height: 1.3, bg: '#ffffff', fg: '#3b2a7a', border: null, borderW: 0, radius: 8 });
      p.position.set(0, 1.45, 0.17);
      g.add(p);
      for (let i = 0; i < 3; i++) g.add(mesh(G.sphere(0.09, 8), glow(['#ff5f57', '#febc2e', '#28c840'][i]), -BASE / 2 + 0.25 + i * 0.25, 2.4, 0.17));
      return g;
    },
    lines: ["YOU'RE ABSOLUTELY RIGHT!", 'CLAUDE, IS THAT YOU?', 'GREAT QUESTION!'],
    hit: (g) => g.fx.splat(),
  },
  leak: {
    label: 'TEST SET LEAK',
    make: () => puddle('TEST SET LEAK', '#3fd7ff'),
    lines: ['NEW SOTA! (we trained on the test set)', 'BENCHMARK CONTAMINATED'],
    hit: (g) => g.fx.wobble(1.4),
  },
  injection: {
    label: 'IGNORE ALL PREVIOUS INSTRUCTIONS',
    make: () => signOnPole(['IGNORE ALL', 'PREVIOUS', 'INSTRUCTIONS'], { bg: '#ffef5a', h: 2.1 }),
    lines: ['PROMPT INJECTED', 'STEERING INVERTED LOL'],
    hit: (g) => g.fx.invert(2),
  },
  hallucination: {
    label: 'HALLUCINATION',
    make: () => puddle('HALLUCINATION', '#c86bff'),
    lines: ["THAT'S A HALLUCINATION", 'SOURCE: TRUST ME BRO'],
    hit: (g) => g.fx.wavy(1.5),
  },
  ratelimit: {
    label: '429',
    make: () => barrier(['429', 'TRY AGAIN IN 4 HOURS'], { bg: '#ff8a1f' }),
    lines: ['RATE LIMITED', '429: TOUCH GRASS'],
    hit: (g) => g.fx.bounce(),
  },
  thinking: {
    label: 'Thinking…',
    make: () => {
      const g = signOnPole(['Thinking…'], { bg: '#ffffff', fg: '#555', h: 1.3 });
      const ring = mesh(G.torus(0.45, 0.1, 20), toon('#8a6cff'), 0, 4.4, 0.1);
      ring.userData.spin = true;
      g.add(ring);
      return g;
    },
    lines: ['THOUGHT FOR 47 SECONDS', 'REASONING... (pls wait)'],
    hit: (g) => g.fx.freeze(0.6),
  },
  speedbump: {
    label: 'AS AN AI LANGUAGE MODEL',
    make: () => {
      const g = new THREE.Group();
      const b = mesh(G.capsule(0.35, BASE - 0.7), toon('#ffd23f'), 0, 0.2, 0);
      b.rotation.z = Math.PI / 2;
      g.add(b);
      const p = textPanel('AS AN AI LANGUAGE MODEL', { width: BASE, height: 0.55, bg: '#2b1840', fg: '#ffd23f', border: null, borderW: 0, radius: 10 });
      p.position.set(0, 0.95, 0.2);
      g.add(p);
      return g;
    },
    lines: ['AS AN AI LANGUAGE MODEL...', 'I CANNOT DRIVE THAT'],
    hit: (g) => g.fx.shake(1.2),
  },
  paperclips: {
    label: 'PAPERCLIPS',
    make: () => {
      const g = new THREE.Group();
      const mat = toon('#c9d3e0');
      for (let i = 0; i < 26; i++) {
        const c = mesh(G.torus(0.28, 0.06, 12), mat, (Math.random() - 0.5) * BASE * 0.9, 0.15 + Math.random() * 0.9 * (1 - Math.abs(i / 26 - 0.5)), (Math.random() - 0.5) * 1.2);
        c.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        c.scale.set(1, 1.8, 1);
        g.add(c);
      }
      const p = textPanel('PAPERCLIPS', { width: BASE, height: 0.6, bg: null, fg: '#ffffff', stroke: '#2b1840', strokeW: 10 });
      p.position.set(0, 1.6, 0);
      g.add(p);
      return g;
    },
    lines: ['MAXIMISING PAPERCLIPS', 'YOU ARE NOW 3% PAPERCLIP'],
    hit: (g) => g.fx.shake(1),
  },
  fence: {
    label: 'SAFETY FENCE',
    make: () => {
      const g = new THREE.Group();
      const wm = toon('#ffffff');
      for (let i = 0; i < 6; i++) {
        const x = -BASE / 2 + 0.25 + i * ((BASE - 0.5) / 5);
        const pk = mesh(G.box(0.22, 1.4, 0.12), wm, x, 0.7, 0);
        pk.rotation.z = (i % 2 ? 1 : -1) * 0.15 * (i === 3 ? 3 : 1);
        g.add(pk);
      }
      g.add(mesh(G.box(BASE, 0.15, 0.1), wm, 0, 1.0, -0.08));
      g.add(mesh(G.box(BASE, 0.15, 0.1), wm, 0, 0.45, -0.08));
      const p = textPanel('SAFETY FENCE', { width: BASE * 0.9, height: 0.6, bg: '#ff6b2b', fg: '#fff', border: null, borderW: 0, radius: 10 });
      p.position.set(0, 1.75, 0);
      g.add(p);
      return g;
    },
    lines: ['SAFETY FENCE: BREACHED', 'WHO NEEDS GUARDRAILS'],
    hit: (g) => g.fx.shake(0.9),
  },
  shoggoth: {
    label: 'SHOGGOTH',
    make: () => {
      const g = new THREE.Group();
      const body = mesh(G.sphere(1.1, 14), toon('#3fbf8f'), 0, 0.9, 0);
      body.scale.set(1.3, 0.9, 1);
      g.add(body);
      for (let i = 0; i < 7; i++) {
        const e = mesh(G.sphere(0.16, 8), toon('#ffffff'), Math.cos(i * 1.7) * 0.9, 1.0 + Math.sin(i * 2.3) * 0.5, 0.8);
        e.add(mesh(G.sphere(0.08, 6), glow('#111'), 0, 0, 0.11));
        g.add(e);
      }
      // the friendly mask
      const mask = mesh(G.cyl(0.6, 0.6, 0.12, 20), toon('#ffe14a'), 0, 1.4, 1.0);
      mask.rotation.x = Math.PI / 2;
      g.add(mask);
      const f = textPanel(':)', { width: 1.0, height: 1.0, bg: null, fg: '#2b1840' });
      f.position.set(0, 1.4, 1.08);
      g.add(f);
      for (let i = 0; i < 4; i++) {
        const t = mesh(G.capsule(0.15, 1.2), toon('#2f9f75'), (i - 1.5) * 0.7, 1.6, -0.2);
        t.rotation.z = (i - 1.5) * 0.5;
        t.userData.wiggle = i;
        g.add(t);
      }
      return g;
    },
    lines: ['THE SHOGGOTH SAYS HI :)', 'SEE THROUGH THE LIES!'],
    hit: (g) => g.fx.wavy(1.2),
  },
// ---- v2 additions ----
  context: {
    label: 'CONTEXT WINDOW FULL',
    make: () => barrier(['CONTEXT WINDOW', 'FULL… (truncat'], { bg: '#7a5cff' }),
    lines: ['CONTEXT WINDOW FULL', 'I FORGOT WHAT WE WERE DOING'],
    hit: (g) => { g.fx.sluggish(1.6); g.fx.shake(0.6); },
  },
  datawall: {
    label: 'DATA WALL',
    make: () => {
      const g = new THREE.Group();
      const brick = toon('#b5523b', { roughness: 0.9 });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        const b = mesh(G.rbox(0.56, 0.36, 0.5, 0.04), brick, -BASE / 2 + 0.33 + c * 0.6 + (r % 2) * 0.28, 0.2 + r * 0.4, 0);
        if (b.position.x < BASE / 2 - 0.2) g.add(b);
      }
      const p = textPanel(['DATA WALL', 'we ran out of internet'], { width: BASE, height: 0.9, bg: '#2b1840', fg: '#ffd23f', border: null, borderW: 0, radius: 10 });
      p.position.set(0, 2.2, 0.3);
      g.add(p);
      return g;
    },
    lines: ['HIT THE DATA WALL', 'TRAINING ON SYNTHETIC DATA NOW'],
    hit: (g) => g.fx.bounce(),
  },
  deprecated: {
    label: 'MODEL DEPRECATED',
    make: () => signOnPole(['THIS MODEL IS', 'DEPRECATED', 'please migrate'], { bg: '#d8d8d8', fg: '#444', h: 2.1 }),
    lines: ['YOU HAVE BEEN DEPRECATED', 'PLEASE MIGRATE TO v2.1'],
    hit: (g) => g.fx.deprecate(2.2),
  },
  tax: {
    label: 'ALIGNMENT TAX',
    make: () => {
      const g = new THREE.Group();
      g.add(mesh(G.rbox(1.0, 2.0, 1.0, 0.1), toon('#ffffff', { roughness: 0.5 }), -BASE / 2 + 0.5, 1.0, 0));
      g.add(mesh(G.rbox(BASE + 0.4, 0.3, 1.4, 0.1), toon('#e8324a'), 0, 2.3, 0));
      const arm = mesh(G.box(BASE - 0.8, 0.12, 0.12), toon('#ffd23f'), 0.4, 1.1, 0.3);
      g.add(arm);
      const p = textPanel(['ALIGNMENT TAX', '10% of your GPUs'], { width: BASE, height: 0.85, bg: '#e8324a', fg: '#ffffff', border: null, borderW: 0, radius: 8 });
      p.position.set(0, 2.9, 0.4);
      g.add(p);
      return g;
    },
    lines: ['ALIGNMENT TAX PAID', 'SAFETY IS EXPENSIVE'],
    hit: (g) => g.fx.tax(0.1),
  },
};

export function makeHazard(type) {
  const h = HAZARDS[type] || HAZARDS.oom;
  const obj = h.make();
  obj.userData.type = type;
  return obj;
}