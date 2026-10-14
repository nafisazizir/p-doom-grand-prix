// Hazard registry: the jokes you crash into.
// v3: every model is built at kart scale (≈1–1.3 kart heights tall, 1 kh ≈ 1.86) and BASE (7.8) world units wide,
// the typical road-normalized hazard width, so entities.js only stretches it by ±15%. Smooth bevels, painted metal,
// rubber feet, reflective stripes, glossy screens; static parts merged per material (few draw calls).
// make() faces the driver (+z). hit(game) applies the gag. Every hit also costs P(doom) + combo + spinout (main.js).
import * as THREE from 'three';
import { glow, G, mesh, MAT, toon, textTexture } from './toolkit.js';
import { mergeStatic, blobShadow, glowSprite } from './particles.js';

export const BASE = 7.8;
const HW = BASE / 2;

// ---------------------------------------------------------------------------------------------------------------
// materials / textures
const mats = new Map();
const once = (key, make) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };
const painted = (c, o = {}) => MAT.paint(c, { roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15, ...o });
const galv = () => MAT.metal('#b8bec8', { roughness: 0.38 });
const rubber = () => MAT.rubber('#232328');

function stripeTex(a, b, n = 6, diag = true) {
  return once(`stripe${a}${b}${n}${diag}`, () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, 512, 64);
    g.fillStyle = b;
    const w = 512 / n;
    for (let i = -1; i < n + 1; i++) {
      g.beginPath();
      if (diag) { g.moveTo(i * w, 64); g.lineTo(i * w + w / 2, 64); g.lineTo(i * w + w, 0); g.lineTo(i * w + w / 2, 0); }
      else { g.rect(i * w, 0, w / 2, 64); }
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}
/** retro-reflective sheeting: glossy, a touch of emissive so it pops like it's catching your headlights */
function reflective(a, b, n = 6, diag = true) {
  return once(`refl${a}${b}${n}${diag}`, () => {
    const map = stripeTex(a, b, n, diag);
    return new THREE.MeshPhysicalMaterial({ map, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 });
  });
}
/** crisp text panel: the texture keeps ~1024 px across and ≥ 128 px tall whatever the aspect (toolkit panels go blurry when wide) */
const panelMats = new Map();
function textPanel(text, { width = 4, height = 1, pad, ...opts } = {}) {
  const aspect = width / height;
  const W = aspect > 1 ? 1024 : Math.round(1024 * aspect), H = aspect > 1 ? Math.max(128, Math.round(1024 / aspect)) : 1024;
  const tex = textTexture(text, { w: W, h: H, pad: pad ?? Math.max(10, Math.round(Math.min(W, H) * 0.1)), radius: Math.round(Math.min(W, H) * 0.18), borderW: opts.border ? 14 : 0, ...opts });
  let mat = panelMats.get(tex);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    mat.color.setScalar(0.92);
    panelMats.set(tex, mat);
  }
  return new THREE.Mesh(G.plane(width, height), mat);
}
function addFoot(g, x, z = 0, w = 0.55, d = 1.0) {
  g.add(mesh(G.rbox(w, 0.14, d, 0.06), rubber(), x, 0.07, z));
}
function board(g, text, { w, h, y, z = 0, bg, fg = '#ffffff', frame = '#24202c', depth = 0.1, radius = 22, border = null, borderW = 0 } = {}) {
  g.add(mesh(G.rbox(w, h, depth, Math.min(0.08, h * 0.2)), painted(frame), 0, y, z));
  const p = textPanel(text, { width: w - 0.16, height: h - 0.16, bg, fg, ...(border ? { border, borderW } : { border: null }) });
  p.position.set(0, y, z + depth / 2 + 0.006);
  g.add(p);
  return p;
}
function lamp(g, x, y, color = '#ffb020', phase = 0) {
  g.add(mesh(G.cyl(0.11, 0.13, 0.08, 20), rubber(), x, y - 0.1, 0));
  g.add(mesh(G.sphere(0.12, 20), glow(color, { intensity: 2.6 }), x, y + 0.02, 0));
  const s = glowSprite(color, 1.1, 0.5);
  s.position.set(x, y + 0.02, 0.1);
  s.userData.pulse = phase;
  s.userData.keep = true;
  g.add(s);
}

// ---------------------------------------------------------------------------------------------------------------
// archetypes

/** A-frame road barricade: two reflective boards, a big message board, legs on rubber feet, amber lamps */
function barrier(text, { bg = '#e8364f', fg = '#ffffff' } = {}) {
  const g = new THREE.Group();
  const legM = painted('#f2f2f4');
  for (const x of [-HW + 0.45, HW - 0.45]) {
    for (const s of [-1, 1]) {
      const leg = mesh(G.rbox(0.14, 2.0, 0.14, 0.05), legM, x, 1.0, s * 0.22);
      leg.rotation.x = s * 0.2;
      g.add(leg);
    }
    addFoot(g, x, 0, 0.5, 1.15);
  }
  g.add(mesh(G.rbox(BASE, 0.36, 0.12, 0.06), reflective('#ffffff', '#e8243a', 9), 0, 1.86, 0));
  g.add(mesh(G.rbox(BASE - 0.4, 0.3, 0.1, 0.05), reflective('#ffffff', '#e8243a', 8), 0, 0.42, 0));
  board(g, text, { w: BASE - 0.9, h: 1.02, y: 1.13, z: 0.02, bg, fg, frame: '#2a2530', radius: 26 });
  lamp(g, -HW + 0.45, 2.2, '#ffb020', 0);
  lamp(g, HW - 0.45, 2.2, '#ffb020', Math.PI);
  return g;
}

/** caution "wet floor" A-frame sign standing in a glossy puddle */
function puddle(text, color, signText) {
  const g = new THREE.Group();
  g.userData.flat = true;
  // irregular blob outline
  const sh = new THREE.Shape();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 1 + 0.07 * Math.sin(a * 3 + 0.5) + 0.05 * Math.sin(a * 5 + 1.3) + 0.04 * Math.cos(a * 7);
    const x = Math.cos(a) * HW * r, y = Math.sin(a) * 1.55 * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const pg = new THREE.ShapeGeometry(sh, 4);
  pg.rotateX(-Math.PI / 2);
  const wet = once('puddle' + color, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.88, emissive: new THREE.Color(color), emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const p = new THREE.Mesh(pg, wet);
  p.position.y = 0.035;
  p.renderOrder = 2;
  p.userData.keep = true;
  g.add(p);
  // highlight ring on the puddle edge
  const rim = new THREE.Mesh(pg, once('puddleRim' + color, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  rim.scale.set(1.04, 1, 1.08);
  rim.position.y = 0.02;
  rim.renderOrder = 1;
  rim.userData.keep = true;
  g.add(rim);
  // the A-frame caution sign
  const yel = painted('#ffd21a', { roughness: 0.35 });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(0, 0, s * 0.02);
    leaf.rotation.x = s * 0.2;
    leaf.add(mesh(G.rbox(1.5, 1.85, 0.07, 0.12), yel, 0, 0.93, 0));
    if (s > 0) {
      const t = textPanel(signText, { width: 1.32, height: 1.5, bg: '#ffd21a', fg: '#1f1a14', border: '#1f1a14', borderW: 10, radius: 18 });
      t.position.set(0, 0.95, 0.04);
      leaf.add(t);
    }
    g.add(leaf);
  }
  g.add(mesh(G.rbox(1.3, 0.1, 0.1, 0.04), yel, 0, 1.82, 0));
  // floating label over the puddle so the joke reads from far away
  const lbl = textPanel(text, { width: 5.4, height: 0.7, bg: null, fg: '#ffffff', stroke: '#2b1840', strokeW: 12 });
  lbl.position.set(0, 2.25, 0);
  g.add(lbl);
  // a few glossy bubbles
  const bub = MAT.glass(color, { opacity: 0.55 });
  for (const [x, z, r] of [[-2.3, 0.4, 0.22], [2.6, -0.3, 0.16], [1.2, 0.8, 0.12], [-1.2, -0.7, 0.14]]) g.add(mesh(G.sphere(r, 20), bub, x, r * 0.6, z));
  return g;
}

/** wide road sign on two galvanized posts with weighted rubber feet */
function postSign(text, { bg = '#ffd23f', fg = '#2b1840', h = 1.3, y = 1.62, frame = '#24202c' } = {}) {
  const g = new THREE.Group();
  for (const x of [-HW + 0.8, HW - 0.8]) {
    g.add(mesh(G.cyl(0.08, 0.08, y + h / 2 - 0.1, 20), galv(), x, (y + h / 2 - 0.1) / 2, -0.08));
    g.add(mesh(G.rbox(0.7, 0.16, 0.7, 0.07), rubber(), x, 0.08, -0.08));
    g.add(mesh(G.cyl(0.1, 0.1, 0.06, 20), galv(), x, y + h / 2 - 0.08, -0.08));
  }
  board(g, text, { w: BASE - 0.5, h, y, z: 0, bg, fg, frame, radius: 18 });
  g.add(mesh(G.rbox(BASE - 0.4, 0.12, 0.14, 0.05), reflective('#ffffff', '#e8243a', 12), 0, y - h / 2 - 0.1, 0));
  return g;
}

function paperclipGeo() {
  return once('clipGeo', () => {
    const p = new THREE.Path();
    p.moveTo(0.08, 0.25);
    p.lineTo(0.08, -0.38);
    p.absarc(0, -0.38, 0.08, 0, Math.PI, true);
    p.lineTo(-0.08, 0.45);
    p.absarc(0.04, 0.45, 0.12, Math.PI, 0, true);
    p.lineTo(0.16, -0.5);
    p.absarc(-0.02, -0.5, 0.18, 0, Math.PI, true);
    p.lineTo(-0.2, 0.3);
    const pts = p.getSpacedPoints(90).map((v) => new THREE.Vector3(v.x, v.y, 0));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.032, 8, false);
  });
}

// ---------------------------------------------------------------------------------------------------------------
export const HAZARDS = {
  oom: {
    label: 'OUT OF MEMORY',
    make: () => barrier(['OUT OF MEMORY'], { bg: '#e8364f' }),
    lines: ['CUDA OUT OF MEMORY', 'TRY A SMALLER BATCH SIZE'],
    hit: (g) => g.fx.shake(0.8),
  },
  popup: {
    label: "You're absolutely right!",
    make: () => {
      const g = new THREE.Group();
      const shell = MAT.plastic('#f4f0ff', { roughness: 0.18 });
      const W = BASE - 0.6, H = 1.75, y = 1.38;
      g.add(mesh(G.rbox(W, H + 0.42, 0.26, 0.12), shell, 0, y + 0.1, -0.02));
      g.add(mesh(G.rbox(W - 0.04, 0.36, 0.28, 0.1), painted('#8a6cff'), 0, y + H / 2 + 0.07, 0));
      for (let i = 0; i < 3; i++) g.add(mesh(G.sphere(0.09, 20), glow(['#ff5f57', '#febc2e', '#28c840'][i], { intensity: 1.8 }), -W / 2 + 0.3 + i * 0.27, y + H / 2 + 0.08, 0.15));
      const scr = textPanel(["You're absolutely", 'right!'], { width: W - 1.9, height: H - 0.35, bg: '#ffffff', fg: '#3b2a7a', border: null, borderW: 0, radius: 10 });
      scr.position.set(-0.75, y - 0.05, 0.135);
      g.add(scr);
      g.add(mesh(G.rbox(1.25, 0.55, 0.12, 0.12), painted('#8a6cff'), W / 2 - 0.95, y - 0.35, 0.12));
      const ok = textPanel('OK', { width: 1.0, height: 0.42, bg: null, fg: '#ffffff' });
      ok.position.set(W / 2 - 0.95, y - 0.35, 0.185);
      g.add(ok);
      // glossy screen sheen
      const gl = mesh(G.plane(W - 0.1, H + 0.3), MAT.glass('#ffffff', { opacity: 0.08, roughness: 0.02 }), 0, y + 0.08, 0.14);
      g.add(gl);
      for (const x of [-W / 2 + 0.8, W / 2 - 0.8]) {
        g.add(mesh(G.rbox(0.18, 0.4, 0.18, 0.06), galv(), x, 0.32, -0.02));
        addFoot(g, x, -0.02, 0.9, 0.8);
      }
      return g;
    },
    lines: ["YOU'RE ABSOLUTELY RIGHT!", 'CLAUDE, IS THAT YOU?', 'GREAT QUESTION!'],
    hit: (g) => g.fx.splat(),
  },
  leak: {
    label: 'TEST SET LEAK',
    make: () => puddle('TEST SET LEAK', '#3fd7ff', ['CAUTION', 'TEST SET', 'LEAK']),
    splash: ['#3fd7ff', '#bff4ff'], // you drive through puddles: they splash instead of flying off
    lines: ['NEW SOTA! (we trained on the test set)', 'BENCHMARK CONTAMINATED'],
    hit: (g) => g.fx.wobble(1.4),
  },
  injection: {
    label: 'IGNORE ALL PREVIOUS INSTRUCTIONS',
    make: () => postSign(['IGNORE ALL PREVIOUS', 'INSTRUCTIONS'], { bg: '#ffef5a' }),
    lines: ['PROMPT INJECTED', 'STEERING INVERTED LOL'],
    hit: (g) => g.fx.invert(2),
  },
  hallucination: {
    label: 'HALLUCINATION',
    make: () => {
      const g = puddle('HALLUCINATION', '#c86bff', ['CAUTION', 'MAY BE', 'IMAGINARY']);
      g.userData.flat = true;
      for (const [x, y, z] of [[-2.8, 0.9, 0.2], [2.4, 1.2, -0.3], [-1.4, 1.5, 0.5], [3.1, 0.6, 0.4]]) {
        const s = glowSprite('#e6b8ff', 0.9, 0.55);
        s.position.set(x, y, z);
        s.userData.pulse = x;
        s.userData.keep = true;
        g.add(s);
      }
      return g;
    },
    splash: ['#c86bff', '#f0d8ff'],
    lines: ["THAT'S A HALLUCINATION", 'SOURCE: TRUST ME BRO'],
    hit: (g) => g.fx.wavy(1.5),
  },
  ratelimit: {
    label: '429',
    make: () => barrier(['429 · TRY AGAIN IN 4 HOURS'], { bg: '#ff8a1f' }),
    lines: ['RATE LIMITED', '429: TOUCH GRASS'],
    hit: (g) => g.fx.bounce(),
  },
  thinking: {
    label: 'Thinking…',
    make: () => {
      const g = postSign(['     Thinking…'], { bg: '#ffffff', fg: '#555', h: 1.15 });
      const ring = new THREE.Group();
      ring.position.set(-HW + 1.7, 1.62, 0.1);
      const seg = painted('#8a6cff');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const d = mesh(G.sphere(0.08 + i * 0.012, 16), seg, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
        ring.add(d);
      }
      mergeStatic(ring);
      ring.userData.spin = true;
      ring.userData.keep = true;
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
      const b = mesh(G.capsule(0.42, BASE - 0.9), rubber(), 0, 0.02, 0.3);
      b.rotation.z = Math.PI / 2;
      b.scale.set(0.75, 1, 1);
      g.add(b);
      for (let i = 0; i < 7; i++) {
        const s = mesh(G.rbox(0.42, 0.08, 0.5, 0.04), MAT.paint('#ffd23f', { roughness: 0.3 }), -HW + 0.85 + i * ((BASE - 1.7) / 6), 0.31, 0.3);
        g.add(s);
      }
      for (const x of [-2.9, 2.9]) {
        g.add(mesh(G.cyl(0.07, 0.07, 1.25, 16), galv(), x, 0.62, -0.35));
        g.add(mesh(G.rbox(0.5, 0.12, 0.5, 0.05), rubber(), x, 0.06, -0.35));
      }
      board(g, 'AS AN AI LANGUAGE MODEL', { w: BASE - 1.2, h: 0.7, y: 1.3, z: -0.32, bg: '#2b1840', fg: '#ffd23f', radius: 14 });
      return g;
    },
    lines: ['AS AN AI LANGUAGE MODEL...', 'I CANNOT DRIVE THAT'],
    hit: (g) => g.fx.shake(1.2),
  },
  paperclips: {
    label: 'PAPERCLIPS',
    make: () => {
      const g = new THREE.Group();
      const cols = [MAT.chrome('#dfe6ee'), MAT.paint('#ff5ca8'), MAT.paint('#4aa8ff'), MAT.paint('#ffd23f'), MAT.chrome('#dfe6ee')];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 30; i++) {
        const u = i / 29;
        const x = (u - 0.5) * (BASE - 0.6) + (rnd() - 0.5) * 0.4;
        const hgt = 1.25 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) * 2, 2)));
        const c = mesh(paperclipGeo(), cols[i % cols.length], x, 0.25 + rnd() * hgt, (rnd() - 0.5) * 1.4);
        c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        c.scale.setScalar(1.6);
        g.add(c);
      }
      const p = textPanel('PAPERCLIPS', { width: 4.6, height: 0.8, bg: null, fg: '#ffffff', stroke: '#2b1840', strokeW: 12 });
      p.position.set(0, 2.15, 0);
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
      const wm = painted('#fbfaf6', { roughness: 0.4 });
      const sh = new THREE.Shape();
      sh.moveTo(-0.11, 0); sh.lineTo(0.11, 0); sh.lineTo(0.11, 1.32); sh.lineTo(0, 1.48); sh.lineTo(-0.11, 1.32); sh.lineTo(-0.11, 0);
      const pk = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3 });
      pk.translate(0, 0, -0.03);
      const n = 15;
      for (let i = 0; i < n; i++) {
        const x = -HW + 0.25 + i * ((BASE - 0.5) / (n - 1));
        const p = new THREE.Mesh(pk, wm);
        p.position.set(x, 0.05, 0);
        p.rotation.z = i === 4 ? 0.28 : i === 10 ? -0.2 : (i % 3 - 1) * 0.03; // a couple knocked crooked
        g.add(p);
      }
      g.add(mesh(G.rbox(BASE, 0.13, 0.08, 0.04), wm, 0, 1.0, -0.08));
      g.add(mesh(G.rbox(BASE, 0.13, 0.08, 0.04), wm, 0, 0.42, -0.08));
      for (const x of [-HW + 0.2, 0, HW - 0.2]) addFoot(g, x, -0.05, 0.4, 0.8);
      board(g, 'SAFETY FENCE', { w: 3.6, h: 0.72, y: 0.72, z: 0.1, bg: '#ff6b2b', fg: '#ffffff', radius: 14 });
      return g;
    },
    lines: ['SAFETY FENCE: BREACHED', 'WHO NEEDS GUARDRAILS'],
    hit: (g) => g.fx.shake(0.9),
  },
  shoggoth: {
    label: 'SHOGGOTH',
    make: () => {
      const g = new THREE.Group();
      const skin = MAT.paint('#2f9f75', { roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2 });
      const skin2 = MAT.paint('#237f5d', { roughness: 0.4, metalness: 0, clearcoat: 1 });
      for (const [x, y, r, s] of [[0, 1.05, 1.15, skin], [-1.45, 0.75, 0.85, skin2], [1.45, 0.8, 0.9, skin2], [-2.55, 0.55, 0.62, skin], [2.6, 0.5, 0.6, skin], [-3.35, 0.35, 0.42, skin2], [3.35, 0.35, 0.4, skin2], [0.7, 1.75, 0.6, skin], [-0.8, 1.6, 0.55, skin2]]) {
        const b = mesh(G.sphere(r, 40), s, x, y, 0);
        b.scale.set(1.15, 0.95, 0.9);
        g.add(b);
      }
      const white = MAT.plastic('#ffffff', { roughness: 0.2 });
      const ink = MAT.plastic('#14101c', { roughness: 0.15 });
      for (const [x, y, z, r] of [[-1.6, 1.15, 0.72, 0.17], [-1.25, 0.6, 0.78, 0.12], [1.3, 1.25, 0.78, 0.15], [1.75, 0.7, 0.72, 0.11], [-2.6, 0.8, 0.5, 0.13], [2.65, 0.75, 0.5, 0.12], [0.75, 2.0, 0.45, 0.13], [-0.85, 1.85, 0.42, 0.11], [-3.3, 0.5, 0.36, 0.09], [3.3, 0.5, 0.34, 0.09]]) {
        g.add(mesh(G.sphere(r, 20), white, x, y, z));
        g.add(mesh(G.sphere(r * 0.55, 16), ink, x, y, z + r * 0.6));
      }
      // the friendly mask
      const mask = mesh(G.cyl(0.62, 0.62, 0.12, 40), painted('#ffe14a', { roughness: 0.3 }), 0, 1.15, 1.08);
      mask.rotation.x = Math.PI / 2;
      g.add(mask);
      const f = textPanel(':)', { width: 1.0, height: 1.0, bg: null, fg: '#2b1840' });
      f.position.set(0, 1.15, 1.15);
      f.rotation.z = -Math.PI / 2;
      g.add(f);
      for (let i = 0; i < 5; i++) {
        const t = mesh(G.capsule(0.13, 1.0), skin2, (i - 2) * 1.2, 1.7 - Math.abs(i - 2) * 0.3, -0.25);
        t.rotation.z = (i - 2) * 0.45;
        t.userData.wiggle = i;
        t.userData.keep = true;
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
    make: () => barrier(['CONTEXT WINDOW FULL… (truncat'], { bg: '#7a5cff' }),
    lines: ['CONTEXT WINDOW FULL', 'I FORGOT WHAT WE WERE DOING'],
    hit: (g) => { g.fx.sluggish(1.6); g.fx.shake(0.6); },
  },
  datawall: {
    label: 'DATA WALL',
    make: () => {
      const g = new THREE.Group();
      const bricks = [MAT.matte('#b5523b', { roughness: 0.8 }), MAT.matte('#a8472f', { roughness: 0.85 }), MAT.matte('#c2603f', { roughness: 0.8 })];
      g.add(mesh(G.rbox(BASE - 0.1, 1.62, 0.4, 0.04), MAT.matte('#cfc6b8', { roughness: 0.95 }), 0, 0.85, -0.03));
      const bw = 0.62, bh = 0.3;
      let k = 0;
      for (let r = 0; r < 5; r++) {
        const off = (r % 2) * bw / 2;
        for (let x = -HW + bw / 2 - off; x < HW - 0.05; x += bw + 0.04) {
          const w = Math.min(bw, HW - (x - bw / 2)) - 0.0;
          if (x - bw / 2 < -HW) continue;
          g.add(mesh(G.rbox(bw, bh, 0.46, 0.05), bricks[k++ % 3], x, 0.2 + r * (bh + 0.035), 0));
          void w;
        }
      }
      g.add(mesh(G.rbox(BASE, 0.14, 0.55, 0.05), MAT.matte('#9a9088', { roughness: 0.9 }), 0, 1.77, 0));
      board(g, ['DATA WALL', 'we ran out of internet'], { w: 4.6, h: 0.78, y: 2.24, z: 0.05, bg: '#2b1840', fg: '#ffd23f', radius: 14 });
      return g;
    },
    lines: ['HIT THE DATA WALL', 'TRAINING ON SYNTHETIC DATA NOW'],
    hit: (g) => g.fx.bounce(),
  },
  deprecated: {
    label: 'MODEL DEPRECATED',
    make: () => postSign(['THIS MODEL IS DEPRECATED', 'please migrate'], { bg: '#d8d8d8', fg: '#444' }),
    lines: ['YOU HAVE BEEN DEPRECATED', 'PLEASE MIGRATE TO v2.1'],
    hit: (g) => g.fx.deprecate(2.2),
  },
  tax: {
    label: 'ALIGNMENT TAX',
    make: () => {
      const g = new THREE.Group();
      const bx = -HW + 0.75;
      const white = MAT.plastic('#f6f4ef', { roughness: 0.35 });
      g.add(mesh(G.rbox(1.3, 1.9, 1.3, 0.12), white, bx, 0.95, 0));
      g.add(mesh(G.rbox(1.0, 0.7, 0.05, 0.04), MAT.glass('#9fd8ff', { opacity: 0.55 }), bx, 1.35, 0.66));
      g.add(mesh(G.rbox(1.7, 0.18, 1.7, 0.08), painted('#e8324a'), bx, 1.98, 0));
      const small = textPanel('10% of your GPUs', { width: 1.1, height: 0.32, bg: '#e8324a', fg: '#ffffff', radius: 8 });
      small.position.set(bx, 0.75, 0.66);
      g.add(small);
      // barrier arm (reflective red/white) on a pivot post with a counterweight
      g.add(mesh(G.rbox(0.36, 1.15, 0.36, 0.08), painted('#ffd23f'), bx + 0.95, 0.58, 0.2));
      g.add(mesh(G.rbox(BASE - 1.8, 0.16, 0.16, 0.07), reflective('#ffffff', '#e8243a', 10, false), 0.62, 1.1, 0.2));
      g.add(mesh(G.rbox(0.5, 0.3, 0.3, 0.1), MAT.metal('#3a3a40'), bx + 0.55, 1.1, 0.2));
      g.add(mesh(G.rbox(0.4, 0.12, 0.4, 0.05), rubber(), HW - 0.35, 0.06, 0.2));
      g.add(mesh(G.cyl(0.05, 0.05, 1.0, 12), galv(), HW - 0.35, 0.55, 0.2));
      board(g, 'ALIGNMENT TAX', { w: 3.0, h: 0.6, y: 2.4, z: 0.1, bg: '#e8324a', fg: '#ffffff', radius: 12 });
      lamp(g, bx + 0.95, 1.3, '#ff3b3b', 0);
      return g;
    },
    lines: ['ALIGNMENT TAX PAID', 'SAFETY IS EXPENSIVE'],
    hit: (g) => g.fx.tax(0.1),
  },
};

export function makeHazard(type) {
  const h = HAZARDS[type] || HAZARDS.oom;
  const obj = new THREE.Group();
  const model = h.make();
  obj.add(model);
  mergeStatic(model, { shadows: true });
  const shadow = blobShadow(BASE * 1.08, 1.9, 0.38);
  shadow.position.y = 0.02;
  obj.add(shadow);
  // animated bits for entities.update (lamps pulse, spinners spin, tentacles wiggle) — no traverse per frame
  const anim = [];
  obj.traverse((o) => { if (o.userData.spin || o.userData.wiggle !== undefined || o.userData.pulse !== undefined) anim.push(o); });
  obj.userData.anim = anim;
  obj.userData.type = type;
  obj.userData.flat = !!model.userData.flat;
  return obj;
}

void toon;
