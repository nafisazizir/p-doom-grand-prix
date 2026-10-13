// Shared art toolkit for themes, entities and the kart.
// Everything chunky, toon-shaded and cached: never allocate geometry/materials per frame.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE };

export const FONT = "'Fredoka', 'Baloo 2', 'Arial Rounded MT Bold', system-ui, sans-serif";

// 3-step toon ramp
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
/** Toon material (outlined). opts: {emissive, emissiveIntensity, transparent, opacity, side, outline:false, thickness} */
export function toon(color, opts = {}) {
  const key = 'toon|' + color + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (m) return m;
  const { outline = true, thickness = 0.004, ...rest } = opts;
  m = new THREE.MeshToonMaterial({ color, gradientMap, ...rest });
  m.userData.outlineParameters = { thickness, color: [0.08, 0.05, 0.12], alpha: 1, visible: outline };
  matCache.set(key, m);
  return m;
}
/** Unlit glowing material, no outline. */
export function glow(color, opts = {}) {
  const key = 'glow|' + color + '|' + JSON.stringify(opts);
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.userData.outlineParameters = { visible: false };
  matCache.set(key, m);
  return m;
}
/** Fresh (uncached) material when a prop needs its own animated color. */
export function toonUnique(color, opts = {}) {
  const { outline = true, thickness = 0.004, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...rest });
  m.userData.outlineParameters = { thickness, color: [0.08, 0.05, 0.12], alpha: 1, visible: outline };
  return m;
}

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
/** Cached geometry factories. */
export const G = {
  box: (w = 1, h = 1, d = 1) => cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  rbox: (w = 1, h = 1, d = 1, r = 0.15) => cached(`rbox${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999)),
  cyl: (rt = 0.5, rb = 0.5, h = 1, seg = 16) => cached(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  sphere: (r = 0.5, seg = 16) => cached(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0))),
  capsule: (r = 0.3, len = 1) => cached(`cap${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)),
  cone: (r = 0.5, h = 1, seg = 16) => cached(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r = 1, tube = 0.15, seg = 32) => cached(`tor${r},${tube},${seg}`, () => new THREE.TorusGeometry(r, tube, 10, seg)),
  plane: (w = 1, h = 1) => cached(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
  icosa: (r = 1, d = 0) => cached(`ico${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
};

/** mesh(geo, mat, x, y, z) helper */
export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

// ---------- Text ----------
const texCache = new Map();
/**
 * Canvas text texture. lines: string or array. opts: {w, h, bg, fg, border, borderW, radius, font, weight, pad, align, stroke}
 * Text auto-shrinks to fit.
 */
export function textTexture(lines, opts = {}) {
  const key = JSON.stringify([lines, opts]);
  let tex = texCache.get(key);
  if (tex) return tex;
  const {
    w = 512, h = 256, bg = '#fff7e6', fg = '#2b1840', border = '#2b1840', borderW = 14,
    radius = 36, weight = 700, pad = 30, stroke = null, strokeW = 8, emoji = true,
  } = opts;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    roundRect(g, borderW / 2, borderW / 2, w - borderW, h - borderW, radius);
    g.fill();
    if (border && borderW) { g.lineWidth = borderW; g.strokeStyle = border; g.stroke(); }
  }
  const arr = Array.isArray(lines) ? lines : String(lines).split('\n');
  const n = arr.length;
  let size = Math.floor((h - pad * 2) / n / 1.12);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fit = () => {
    g.font = `${weight} ${size}px ${FONT}`;
    return Math.max(...arr.map((l) => g.measureText(l).width));
  };
  while (size > 10 && fit() > w - pad * 2) size -= 2;
  const lh = size * 1.12;
  const y0 = h / 2 - (lh * (n - 1)) / 2;
  arr.forEach((l, i) => {
    if (stroke) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(l, w / 2, y0 + i * lh + size * 0.04); }
    g.fillStyle = fg;
    g.fillText(l, w / 2, y0 + i * lh + size * 0.04);
  });
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}
export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A flat panel with text on it (both sides readable from the front). size in world units. */
export function textPanel(text, { width = 6, height = 3, ...opts } = {}) {
  const aspect = width / height;
  const W = 512, H = Math.round(512 / aspect);
  const tex = textTexture(text, { w: W, h: H, ...opts });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
  mat.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(G.plane(width, height), mat);
}

/**
 * Roadside billboard on two posts. Faces the oncoming driver (+z after placement, i.e. towards the camera).
 * opts: {width, height, postColor, frame, bg, fg, border, posts}
 */
export function billboard(text, opts = {}) {
  const { width = 7, height = 3.5, postH = 3, postColor = '#5a4a6a', frame = '#2b1840', ...tex } = opts;
  const g = new THREE.Group();
  const pm = toon(postColor);
  g.add(mesh(G.box(0.35, postH, 0.35), pm, -width * 0.35, postH / 2, 0));
  g.add(mesh(G.box(0.35, postH, 0.35), pm, width * 0.35, postH / 2, 0));
  g.add(mesh(G.rbox(width + 0.5, height + 0.5, 0.3, 0.12), toon(frame), 0, postH + height / 2, -0.2));
  const p = textPanel(text, { width, height, ...tex });
  p.position.set(0, postH + height / 2, 0);
  g.add(p);
  return g;
}

/** Camera-facing sprite with text (for popups in world). */
export function textSprite(text, { scale = 4, ...opts } = {}) {
  const tex = textTexture(text, { w: 512, h: 160, ...opts });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale * (160 / 512), 1);
  return s;
}

// ---------- RNG ----------
/** Deterministic mulberry32 RNG. */
export function makeRng(seed = 42) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}
export function hashSeed(...parts) {
  let h = 2166136261;
  for (const s of parts.join('|')) { h ^= s.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
