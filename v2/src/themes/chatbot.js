// CHATBOT HIGHWAY (v2 art pass): a bright pastel day. The road climbs onto an elevated interchange through a
// city built out of chat UI: glossy chat-bubble skyscrapers, a colossal toothy chat-bubble kaiju, a giant MAW
// the highway drives straight into ("please don't eat me alive"), typing-indicator blimps, Regenerate / send /
// thumbs sculptures, green motorway signage and jersey barriers.
// Also exports SYDNEY: the pink suspension bridge over the sea at dusk, fully love-bombed: heart balloons,
// floating "good Bing 😊" bubbles, rose bushes and a golden heart-shaped cage on the far shores.
import { THREE, toon, glow, G, mesh, group, textPanel, MAT, physical } from '../toolkit.js';
import { surface } from '../textures.js';
import { SPEED, Course } from '../course.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================================
// shared helpers (also imported by shoggoth.js)
// =====================================================================================================
const bakeCache = new Map();
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
/**
 * Merge every static mesh under `root` that shares a material into one mesh (one draw call per material).
 * Meshes inside a subtree flagged `userData.dyn` (animated parts) and textured meshes (text panels) are kept.
 * `key` caches the merged geometry per prop kind, so pooled clones share it.
 */
export function bake(root, key) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || o.material.map) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
    const k = o.material.uuid + (o.geometry.index ? 'i' : 'n');
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(o);
  });
  let n = 0;
  for (const [, list] of buckets) {
    const ck = key + '|' + n++;
    if (list.length < 2) continue;
    let geo = bakeCache.get(ck);
    if (!geo) {
      const parts = list.map((o) => {
        const gg = o.geometry.clone();
        for (const a of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(a)) gg.deleteAttribute(a);
        if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
        _m.multiplyMatrices(_inv, o.matrixWorld);
        gg.applyMatrix4(_m);
        return gg;
      });
      geo = mergeGeometries(parts, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      bakeCache.set(ck, geo);
    }
    const merged = new THREE.Mesh(geo, list[0].material);
    for (const o of list) o.parent.remove(o);
    root.add(merged);
  }
  return root;
}
/** mark a group as animated (bake() leaves it alone) */
export function dyn(g) { g.userData.dyn = true; return g; }


// ---------- grounding props under elevated roads ----------
// Engine note: track._spawn() positions ground props on highways/bridges with a frame that terrainY() has
// overwritten (shared scratch object), so they all pile up at the feature's start. Workaround: inside those
// zones we place ground props as "overhead" (y = 6, positioned off the road) and drop their content back
// down to the real terrain height, which we compute with the same formulas as track.terrainY().
const COURSE = new Course(SPEED);
const RAISED = COURSE.features.filter((f) => f.type === 'highway' || f.type === 'bridge');
const _cf = {};
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }
function hills(s, lat) {
  const a = Math.abs(lat), H = 9;
  const amp = a < H + 8 ? 0 : a < 40 ? ((a - H - 8) / (40 - H - 8)) * 6 : a < 120 ? 6 + (a - 40) * 0.35 : 34 + (a - 120) * 0.45;
  return amp * (fbm(s * 0.006 + (lat > 0 ? 50 : 0), a * 0.012) - 0.25);
}
/** null = normal ground here; else { drop } (metres from road+6 down to the ground) or { water: true } */
export function raisedGround(zf, lat) {
  const f = RAISED.find((q) => zf >= q.s[0] && zf < q.s[1]);
  if (!f) return null;
  const road = COURSE.frame(zf, _cf).y;
  const start = COURSE.frame(f.s[0], _cf).y;
  const a = Math.abs(lat);
  let gy;
  if (f.type === 'highway') gy = start - 2 + hills(zf, lat) * 0.6;
  else {
    if (a < 45) return { water: true, drop: 6 + road - (start - 8) };
    gy = start - 7 + hills(zf, lat) + (a - 45) * 0.15;
  }
  return { drop: 6 + road - gy };
}
/** push a ground prop, converting it to a dropped overhead prop on highways/bridges. */
export function placeGround(out, zf, p, { water = false } = {}) {
  if ((p.y || 0) >= 6) { out.push(p); return; }
  const r = raisedGround(zf + (p.dz || 0), p.x || 0);
  if (!r) { out.push(p); return; }
  if (r.water && !water) return;
  out.push({ ...p, y: 6, data: { drop: r.drop + (p.y || 0) } });
}
/** wrap a ground prop so animate() can drop it to the terrain (see placeGround) */
export function liftable(inner) {
  if (!inner) return inner;
  const g = new THREE.Group();
  g.add(inner);
  g.userData = inner.userData;
  inner.userData = {};
  g.userData.lift = inner;
  return g;
}
export function applyLift(obj, e) {
  const L = obj.userData.lift;
  if (L) L.position.y = e?.data?.drop ? -e.data.drop : 0;
}

// ---------- chat bubble geometry: rounded rect + tail, extruded with a fat bevel (glossy toy look) ----------
function bubbleShape(w, h, r, tail) {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const s = new THREE.Shape();
  const tw = Math.min(w * 0.2, r * 1.5), th = h * 0.34;
  s.moveTo(0, y0);
  if (tail > 0) {
    s.lineTo(x1 - r - tw * 0.3, y0);
    s.quadraticCurveTo(x1 - tw * 0.15, y0 - th * 0.05, x1 + tw * 0.45, y0 - th);
    s.quadraticCurveTo(x1 + tw * 0.02, y0 - th * 0.3, x1, y0 + r * 0.7);
  } else {
    s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r);
  }
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  if (tail < 0) {
    s.lineTo(x0, y0 + r * 0.7);
    s.quadraticCurveTo(x0 - tw * 0.02, y0 - th * 0.3, x0 - tw * 0.45, y0 - th);
    s.quadraticCurveTo(x0 + tw * 0.15, y0 - th * 0.05, x0 + r + tw * 0.3, y0);
  } else {
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
  }
  s.lineTo(0, y0);
  return s;
}
const bubGeoCache = new Map();
/** extruded chat bubble, centred, front face at z = +depth/2 + bevel */
export function bubbleGeo(w, h, d = 1, tail = -1, r = null) {
  const rr = r ?? Math.min(w, h) * 0.32;
  const key = [w, h, d, tail, rr].join(',');
  let g = bubGeoCache.get(key);
  if (!g) {
    const b = Math.min(d * 0.45, 0.9, rr * 0.5);
    g = new THREE.ExtrudeGeometry(bubbleShape(w, h, rr, tail), {
      depth: d, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.85, bevelSegments: 4, curveSegments: 10,
    });
    g.translate(0, 0, -d / 2);
    g.computeVertexNormals();
    bubGeoCache.set(key, g);
  }
  return g;
}
const frontZ = (d) => d / 2 + Math.min(d * 0.45, 0.9) + 0.03;

// Extruded toy heart, ~1.1 wide x 0.95 tall, centred on the origin, lobes up.
function heartPts(n = 36) {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  return s.getSpacedPoints(n).map((p) => new THREE.Vector2((p.x - 5) / 20, -(p.y - 9.5) / 20));
}
let _heartGeo = null, _heartPuffy = null, _heartRing = null, _heartInner = null;
function heartGeo() {
  if (!_heartGeo) {
    _heartGeo = new THREE.ExtrudeGeometry(new THREE.Shape(heartPts()), {
      depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 2,
    });
    _heartGeo.translate(0, 0, -0.15);
  }
  return _heartGeo;
}
/** puffy balloon heart (fat bevel) */
function heartPuffyGeo() {
  if (!_heartPuffy) {
    _heartPuffy = new THREE.ExtrudeGeometry(new THREE.Shape(heartPts(48)), {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 5, curveSegments: 12,
    });
    _heartPuffy.translate(0, 0, -0.08);
    _heartPuffy.computeVertexNormals();
  }
  return _heartPuffy;
}
/** heart-shaped ring (outer heart minus 86% inner heart): the birdcage frame */
function heartRingGeo() {
  if (!_heartRing) {
    const outer = heartPts(48);
    _heartInner = outer.map((p) => new THREE.Vector2(p.x * 0.86, p.y * 0.86 - 0.01));
    const sh = new THREE.Shape(outer);
    sh.holes.push(new THREE.Path(_heartInner.slice().reverse()));
    _heartRing = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
    _heartRing.translate(0, 0, -0.03);
  }
  return _heartRing;
}
function heartSpan(x) {
  heartRingGeo();
  const ys = [];
  const P = _heartInner;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}
export function heart(size, mat, puffy = false) {
  const m = new THREE.Mesh(puffy ? heartPuffyGeo() : heartGeo(), mat);
  m.scale.setScalar(size);
  return m;
}

// =====================================================================================================
// palettes + materials
// =====================================================================================================
const CHAT = {
  bubble: '#f2eefb', bubbleFg: '#33246b', user: '#7c4dff', userFg: '#ffffff', bot: '#10b98a',
  dark: '#2b1840', accent: '#a98bff', post: '#9b86c9', mouth: '#4a0a26', tongue: '#ff5f86', lip: '#ff6f9f',
  monster: '#1fc29a',
  glass: ['#bfe3ff', '#d9c8ff', '#ffd6ec', '#c8f5e6', '#fff1c4'],
};
const SYD = {
  bubble: '#fff0f6', bubbleFg: '#9a1050', user: '#ff2d7a', userFg: '#ffffff', bot: '#ff8fc0',
  dark: '#4a0a2a', accent: '#ff9ec8', post: '#d65a94', mouth: '#5a0a2a', tongue: '#ff3d6e', lip: '#ff5f9a',
};
const gloss = (c, o = {}) => MAT.paint(c, o);
const WHITE = () => gloss('#ffffff');
const DARK_GLASS = () => physical('#1d2360', { roughness: 0.04, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6 });
const CHROME = () => MAT.chrome('#e8ecf4');
const STEEL = () => MAT.metal('#aab2c2', { roughness: 0.35 });
const RUBBER = () => MAT.rubber('#2a2633');

function label(text, { width = 6, height = 1, fg = '#2b1840', stroke = '#ffffff', strokeW = 10, pad = 6 } = {}) {
  return textPanel(text, { width, height, bg: null, fg, stroke, strokeW, pad });
}

// =====================================================================================================
// CHATBOT builders
// =====================================================================================================
/** Glossy floating chat bubble with text + avatar. Origin = bubble centre. */
function chatBubble(lines, P, { user = false, w = 7, h = 3, avatar = true, d = 0.9 } = {}) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  const col = user ? P.user : P.bubble;
  inner.add(mesh(bubbleGeo(w, h, d, user ? 1 : -1), gloss(col)));
  const t = textPanel(lines, { width: w - 0.6, height: h - 0.5, bg: null, fg: user ? P.userFg : P.bubbleFg, pad: 12 });
  t.position.z = frontZ(d);
  inner.add(t);
  if (avatar) {
    const side = user ? 1 : -1;
    const av = new THREE.Group();
    av.position.set(side * (w / 2 + 1.1), -h / 2 - 0.9, 0);
    av.add(mesh(G.sphere(0.75, 20), gloss(user ? P.accent : P.bot)));
    av.add(mesh(G.sphere(0.13, 8), glow('#1a1030', { intensity: 1 }), -0.24, 0.1, 0.68));
    av.add(mesh(G.sphere(0.13, 8), glow('#1a1030', { intensity: 1 }), 0.24, 0.1, 0.68));
    const sm = mesh(G.torus(0.22, 0.05, 12), glow('#1a1030', { intensity: 1 }), 0, -0.12, 0.66);
    sm.rotation.z = Math.PI; sm.scale.y = 0.7;
    av.add(sm);
    inner.add(av);
  }
  bake(inner, 'bub' + w + h + user + P.bubble + avatar);
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.45;
  return g;
}

/** Chat-bubble skyscraper: a giant extruded bubble prism on a podium, glass bands, a reply on its face. */
function chatTower(spec) {
  const { w, h, d, col, text, fg = '#2b1840', tail = -1, crown = '#8a5cff', bands = true } = spec;
  const g = new THREE.Group();
  const podH = 4;
  g.add(mesh(G.rbox(w + 5, podH + 14, d + 5, 0.8), surface('concrete', { tint: '#e9e2ff', scale: 3 }), 0, (podH - 14) / 2, 0));
  g.add(mesh(G.rbox(w + 5.4, 0.5, d + 5.4, 0.2), STEEL(), 0, podH, 0));
  const by = podH + h / 2 + h * 0.3;
  const body = mesh(bubbleGeo(w, h, d, tail, Math.min(w, h) * 0.3), gloss(col, { roughness: 0.18 }), 0, by, 0);
  g.add(body);
  // glass curtain-wall bands (reflective) across the front + back
  if (bands) {
    const n = Math.floor((h - 8) / 3.2);
    for (let i = 0; i < n; i++) {
      const y = by - h / 2 + 3 + i * 3.2;
      if (y > by + h / 2 - 9) break; // leave the top free for the text panel
      g.add(mesh(G.rbox(w - 2.2, 1.5, d + 1.9, 0.3), DARK_GLASS(), 0, y, 0));
    }
  }
  // the reply, in giant letters near the top
  const tp = textPanel(text, { width: w - 2, height: 6, bg: '#ffffff', fg, border: crown, borderW: 12, radius: 40, pad: 22 });
  tp.position.set(0, by + h / 2 - 4.6, frontZ(d) + 0.05);
  g.add(tp);
  // typing-dot crown + antenna with a blinking beacon
  for (let i = -1; i <= 1; i++) g.add(mesh(G.sphere(1.3, 20), gloss(crown), i * 3.2, by + h / 2 + 1.8, 0));
  g.add(mesh(G.cyl(0.25, 0.4, 9, 8), STEEL(), w * 0.3, by + h / 2 + 4, -1));
  const bea = mesh(G.sphere(0.55, 12), glow('#ff3d6e', { intensity: 4 }), w * 0.3, by + h / 2 + 8.7, -1);
  bea.userData.keep = true;
  g.add(bea);
  // side "scroll bar" fin
  g.add(mesh(G.rbox(1.2, h * 0.5, 1.2, 0.5), gloss('#ffffff'), w / 2 + 1.4, by + h * 0.1, 0));
  bake(g, 'tower' + JSON.stringify(spec));
  g.userData.beacon = bea;
  return g;
}
const TOWERS = [
  { w: 16, h: 44, d: 12, col: '#8cc2ff', text: ['Certainly!'], crown: '#8a5cff' },
  { w: 14, h: 52, d: 11, col: '#b39bff', text: ['Great', 'question!'], crown: '#10b98a', tail: 1 },
  { w: 18, h: 36, d: 13, col: '#ff9cc9', text: ['As an AI', 'language model…'], crown: '#ff5f9a' },
  { w: 13, h: 60, d: 10, col: '#7fdcbf', text: ["You're", 'absolutely', 'right!'], crown: '#3a8cff', tail: 1 },
  { w: 17, h: 40, d: 12, col: '#ffcf70', text: ['I apologize', 'for the', 'confusion.'], crown: '#ff9a3a' },
  { w: 12, h: 30, d: 9, col: '#c5b2ff', text: ['Delve.'], crown: '#8a5cff', tail: 1 },
  { w: 15, h: 34, d: 11, col: '#9fe6ff', text: ['Let me know', 'if you need', 'anything else!'], crown: '#10b98a' },
];

/** The colossal toothy chat-bubble kaiju looming over the interchange. Jaw snaps on the beat. */
function kaiju(P = CHAT) {
  const g = new THREE.Group();
  const body = dyn(new THREE.Group());
  body.position.y = 30;
  g.add(body);
  const skin = gloss(P.monster || P.bubble, { roughness: 0.22 });
  const W = 26, Hh = 20, D = 12;
  body.add(mesh(bubbleGeo(W, Hh, D, -1, 8), skin));
  const fz = frontZ(D);
  // mouth: dark cavity + upper teeth row (static), lower jaw (animated)
  const cav = mesh(G.rbox(17, 5.6, 2, 1.4), toon(P.mouth, { roughness: 0.6 }), 0, -3.2, fz - 0.8);
  body.add(cav);
  for (let i = 0; i < 9; i++) {
    const t = mesh(G.cone(0.85, 2.2, 6), WHITE(), -7.2 + i * 1.8, -1.6, fz + 0.1);
    t.rotation.z = Math.PI;
    body.add(t);
  }
  body.add(mesh(G.rbox(18.4, 1.0, 1.2, 0.45), gloss(P.lip), 0, -0.4, fz - 0.1)); // upper lip
  const jaw = dyn(new THREE.Group());
  jaw.position.set(0, -5.2, fz - 0.3);
  jaw.add(mesh(G.rbox(16, 1.6, 1.6, 0.6), gloss(P.lip), 0, -0.8, 0.2));
  jaw.add(mesh(G.rbox(9, 0.6, 2.2, 0.3), gloss(P.tongue), 0, 0.2, -0.6));
  for (let i = 0; i < 8; i++) jaw.add(mesh(G.cone(0.75, 1.9, 6), WHITE(), -6.3 + i * 1.8, 0.85, 0.4));
  bake(jaw, 'kaijuJaw' + P.bubble);
  body.add(jaw);
  // eyes: glossy white, big pupils with highlights, angry brows
  for (const s of [-1, 1]) {
    body.add(mesh(G.sphere(2.6, 24), gloss('#ffffff'), s * 5.2, 4.2, fz - 1.2));
    body.add(mesh(G.sphere(1.25, 18), gloss('#16102a', { roughness: 0.1 }), s * 4.8, 3.9, fz + 0.95));
    body.add(mesh(G.sphere(0.4, 10), glow('#ffffff', { intensity: 1.6 }), s * 4.4, 4.5, fz + 2.0));
    const brow = mesh(G.rbox(5, 1.1, 1.2, 0.5), gloss(P.dark), s * 5.2, 7.6, fz);
    brow.rotation.z = s * 0.32;
    body.add(brow);
  }
  // blush
  for (const s of [-1, 1]) {
    const b = mesh(G.sphere(1.6, 16), toon('#ff9cc0', { roughness: 0.7 }), s * 9.5, -0.5, fz - 1.1);
    b.scale.set(1, 0.5, 0.3);
    body.add(b);
  }
  // stubby arms reaching for the road
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * (W / 2 + 1), -3, 1);
    arm.rotation.z = s * -0.9;
    arm.rotation.x = 0.5;
    arm.add(mesh(G.capsule(1.8, 8), skin, 0, -5, 0));
    for (let f = -1; f <= 1; f++) arm.add(mesh(G.capsule(0.7, 1.6), skin, f * 1.1, -10.6, 0));
    body.add(arm);
  }
  // little legs + feet (it stands on the ground of the city)
  for (const s of [-1, 1]) {
    g.add(mesh(G.capsule(2.6, 14), skin, s * 6, 10, 0));
    g.add(mesh(G.rbox(7, 3, 9, 1.4), gloss(P.accent), s * 6, 1.5, 1.5));
  }
  // its own reply, floating above its head
  const say = new THREE.Group();
  say.position.set(-4, Hh / 2 + 7, 0);
  say.add(mesh(bubbleGeo(16, 5, 1.2, 1), gloss(P.user)));
  const st = textPanel(['NOM. I mean:', 'Great question! 😋'], { width: 15, height: 4.2, bg: null, fg: '#ffffff', pad: 10 });
  st.position.z = frontZ(1.2);
  say.add(st);
  body.add(say);
  bake(body, 'kaijuBody' + P.bubble);
  bake(g, 'kaiju' + P.bubble);
  g.userData.jaw = jaw;
  g.userData.jawBase = -5.2;
  g.userData.jawAmp = 3.2;
  g.userData.bob = body;
  g.userData.bobBase = 30;
  g.userData.bobAmp = 0.6;
  return g;
}

/** THE MAW: a giant chat-bubble mouth the highway drives straight into. Overhead prop (origin = road + 6). */
function maw(P = CHAT) {
  const g = new THREE.Group();
  const R = -6; // road level in local coords
  const skin = gloss(P.monster || P.bubble, { roughness: 0.2 });
  // upper head (animated chomp): sits above the road
  const head = dyn(new THREE.Group());
  head.position.y = 0;
  g.add(head);
  head.add(mesh(bubbleGeo(40, 15, 9, 0, 6.5), skin, 0, 14.5, -3));
  // mouth cavity (dark, behind the teeth) + upper lip
  head.add(mesh(G.rbox(31, 4, 6, 1.2), toon(P.mouth, { roughness: 0.6 }), 0, 7.6, -3.5));
  head.add(mesh(G.rbox(34, 1.6, 2, 0.7), gloss(P.lip), 0, 7.4, 1.7));
  for (let i = 0; i < 11; i++) {
    const big = i === 1 || i === 9; // fangs
    const t = mesh(G.cone(big ? 1.25 : 0.95, big ? 3.6 : 2.4, 6), WHITE(), -14 + i * 2.8, big ? 4.9 : 5.6, 1.6);
    t.rotation.z = Math.PI;
    head.add(t);
  }
  // eyes looking down at the driver
  for (const s of [-1, 1]) {
    head.add(mesh(G.sphere(3.4, 24), gloss('#ffffff'), s * 8.5, 17, 2.4));
    head.add(mesh(G.sphere(1.7, 18), gloss('#16102a', { roughness: 0.08 }), s * 8.1, 15.7, 5.2));
    head.add(mesh(G.sphere(0.55, 10), glow('#ffffff', { intensity: 1.6 }), s * 7.6, 16.4, 6.6));
    const brow = mesh(G.rbox(6.5, 1.3, 1.4, 0.6), gloss(P.dark), s * 8.6, 21.4, 2.6);
    brow.rotation.z = s * 0.3;
    head.add(brow);
    const b = mesh(G.sphere(2, 16), toon('#ff9cc0', { roughness: 0.7 }), s * 15, 12, 1.4);
    b.scale.set(1, 0.5, 0.3);
    head.add(b);
  }
  // napkin tucked in, because it is about to eat
  bake(head, 'mawHead' + P.bubble);
  // mouth corners (cheek pillars) left and right of the deck, down to the lower jaw under the highway
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(5, 24, 8, 2.4), skin, s * 18.5, R + 2, -3));
    g.add(mesh(G.rbox(2.2, 18, 2.4, 1), gloss(P.lip), s * 15.8, R + 2, 0.6));
  }
  // lower jaw below the deck, with teeth poking up beside the barriers
  g.add(mesh(G.rbox(40, 6, 9, 2.4), skin, 0, R - 8, -3));
  g.add(mesh(G.rbox(34, 1.4, 2, 0.6), gloss(P.lip), 0, R - 5, 1.6));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) g.add(mesh(G.cone(1.0, 4.2, 6), WHITE(), s * (12.2 + i * 2.2), R - 2.6 + (i ? -0.4 : 0.4), 1.4));
  }
  // napkin bib hanging from the lower jaw
  const bib = mesh(G.rbox(16, 7, 0.5, 0.4), toon('#f4f4ff', { roughness: 0.8 }), 0, R - 13, 1.6);
  g.add(bib);
  const bt = textPanel(['BON APPÉTIT', '(you are the snack)'], { width: 14, height: 5, bg: null, fg: '#d4145a', pad: 10 });
  bt.position.set(0, R - 13, 1.9);
  g.add(bt);
  // the plea, as a user bubble stuck to its cheek
  const plea = new THREE.Group();
  plea.position.set(-24, 6, 2);
  plea.add(mesh(bubbleGeo(12, 4.6, 1.2, 1), gloss(P.user)));
  const pt = textPanel(["ChatGPT, please don't", 'eat me alive 🥺'], { width: 11, height: 3.8, bg: null, fg: '#ffffff', pad: 8 });
  pt.position.z = frontZ(1.2);
  plea.add(pt);
  g.add(plea);
  const rep = new THREE.Group();
  rep.position.set(25, 12, 2);
  rep.add(mesh(bubbleGeo(11, 4.2, 1.2, -1), gloss('#ffffff')));
  const rt = textPanel(['Great question!', 'Opening wide… 😊'], { width: 10, height: 3.5, bg: null, fg: P.bubbleFg, pad: 8 });
  rt.position.z = frontZ(1.2);
  rep.add(rt);
  g.add(rep);
  bake(g, 'maw' + P.bubble);
  g.userData.chomp = head;
  return g;
}

/** Typing-indicator blimp: a puffy bubble airship whose three dots bounce, propeller, gondola, trailing banner. */
function typingBlimp(P, bannerText) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  const W = 13, H = 6, D = 4.2;
  const hull = new THREE.Group();
  hull.add(mesh(bubbleGeo(W, H, D, -1, 2.9), gloss(P.bubble, { roughness: 0.16 })));
  // tail fins (right end), gondola, engine pod
  const finM = gloss(P.user);
  hull.add(mesh(G.rbox(2.8, 0.5, 4, 0.2), finM, W / 2 + 0.6, 0, 0));
  hull.add(mesh(G.rbox(2.8, 4.2, 0.5, 0.2), finM, W / 2 + 0.6, 0, 0));
  const gon = mesh(G.rbox(4.4, 1.5, 2.2, 0.6), gloss(P.accent), 0.5, -H / 2 - 1.8, 0);
  hull.add(gon);
  for (let i = -1; i <= 1; i++) hull.add(mesh(G.rbox(0.8, 0.6, 0.1, 0.1), glow('#fff6d0', { intensity: 1.8 }), 0.5 + i * 1.2, -H / 2 - 1.75, 1.12));
  hull.add(mesh(G.cyl(0.08, 0.08, 1.6, 6), STEEL(), -0.6, -H / 2 - 0.9, 0));
  hull.add(mesh(G.cyl(0.08, 0.08, 1.6, 6), STEEL(), 1.6, -H / 2 - 0.9, 0));
  hull.add(mesh(G.cyl(0.55, 0.7, 1.6, 12), STEEL(), -W / 2 - 1.2, -0.6, 0).rotateZ(Math.PI / 2));
  // banner on cables
  const ban = textPanel(bannerText, { width: 11, height: 1.6, bg: '#ffffff', fg: P.bubbleFg, border: P.user, borderW: 10, radius: 18, pad: 8 });
  ban.position.set(0.6, -H / 2 - 4.6, 0);
  hull.add(ban);
  hull.add(mesh(G.cyl(0.05, 0.05, 2, 4), STEEL(), -4.4, -H / 2 - 3, 0));
  hull.add(mesh(G.cyl(0.05, 0.05, 2, 4), STEEL(), 5.6, -H / 2 - 3, 0));
  bake(hull, 'blimpHull' + P.bubble);
  inner.add(hull);
  // dots (animated)
  const dots = [];
  for (let i = 0; i < 3; i++) {
    const d = mesh(G.sphere(0.95, 20), gloss('#8f86b8'), -2.9 + i * 2.9, 0, frontZ(D) + 0.5);
    inner.add(d);
    dots.push(d);
  }
  // propeller
  const prop = dyn(new THREE.Group());
  prop.position.set(-W / 2 - 2.1, -0.6, 0);
  for (let i = 0; i < 3; i++) {
    const b = mesh(G.rbox(0.3, 2.6, 0.12, 0.05), STEEL(), 0, 1.2, 0);
    const arm = new THREE.Group();
    arm.rotation.x = (i / 3) * Math.PI * 2;
    arm.add(b);
    prop.add(arm);
  }
  inner.add(prop);
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.8;
  g.userData.dots = dots;
  g.userData.dotZ = frontZ(D) + 0.5;
  g.userData.prop = prop;
  return g;
}

/** giant round send-arrow button on a chrome pole (ground prop, tall enough to peek over the highway) */
function sendTower(P, col, poleH = 17) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(2.2, 2.8, 1, 24), surface('concrete', { tint: '#ece6ff', scale: 2 }), 0, 0.5, 0));
  g.add(mesh(G.cyl(0.55, 0.7, poleH, 16), CHROME(), 0, poleH / 2, 0));
  g.add(mesh(G.torus(0.8, 0.18, 20), STEEL(), 0, poleH * 0.6, 0).rotateX(Math.PI / 2));
  const pulse = dyn(new THREE.Group());
  pulse.position.y = poleH + 3.6;
  const disc = mesh(G.cyl(3.6, 3.6, 1.4, 40), gloss(col), 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  pulse.add(disc);
  const rim = mesh(G.torus(3.6, 0.32, 40), CHROME(), 0, 0, 0);
  pulse.add(rim);
  // up arrow (ChatGPT style)
  const ah = mesh(G.cone(1.7, 2.1, 3), WHITE(), 0, 0.85, 0.9);
  ah.scale.z = 0.35;
  pulse.add(ah);
  pulse.add(mesh(G.rbox(1.0, 2.6, 0.5, 0.2), WHITE(), 0, -0.9, 0.75));
  bake(pulse, 'sendPulse' + col);
  g.add(pulse);
  const lab = label('SEND (no take-backs)', { width: 7, height: 1.1, fg: P.dark });
  lab.position.set(0, poleH - 0.6, 0.8);
  g.add(lab);
  bake(g, 'send' + col + poleH);
  g.userData.pulse = pulse;
  return g;
}

/** giant "↻ Regenerate" pill button on two legs */
function regenTower(P) {
  const g = new THREE.Group();
  const H = 15;
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(1.0, H, 1.0, 0.3), STEEL(), s * 4, H / 2, 0));
    g.add(mesh(G.cyl(1.2, 1.5, 0.6, 16), RUBBER(), s * 4, 0.3, 0));
  }
  const btn = dyn(new THREE.Group());
  btn.position.y = H + 2.2;
  btn.add(mesh(G.rbox(14, 4.4, 2, 2.15), gloss('#ffffff')));
  btn.add(mesh(G.rbox(14.6, 5, 1.4, 2.4), gloss(P.user), 0, 0, -0.5));
  const t = textPanel('↻  Regenerate', { width: 12.4, height: 3.2, bg: null, fg: P.bubbleFg, pad: 10 });
  t.position.z = 1.05;
  btn.add(t);
  bake(btn, 'regenBtn');
  g.add(btn);
  const lab = label('(results may vary. doom may not.)', { width: 10, height: 1.1, fg: P.dark });
  lab.position.set(0, H - 1, 0.6);
  g.add(lab);
  bake(g, 'regenTower');
  g.userData.press = btn;
  g.userData.pressBase = H + 2.2;
  return g;
}

/** 👍 👎 feedback sculpture: "Was this response helpful?" */
function thumbs(P) {
  const g = new THREE.Group();
  const H = 13;
  g.add(mesh(G.rbox(14, 1.2, 5, 0.4), surface('concrete', { tint: '#ece6ff', scale: 2 }), 0, 0.6, 0));
  g.add(mesh(G.rbox(1, H, 1, 0.3), STEEL(), 0, H / 2, 0));
  g.add(mesh(G.rbox(15, 1, 1, 0.3), STEEL(), 0, H, 0));
  const discs = [];
  for (const [s, emo, col] of [[-1, '👍', '#10b98a'], [1, '👎', '#ff5f7a']]) {
    const d = dyn(new THREE.Group());
    d.position.set(s * 4.5, H + 3.6, 0);
    const disc = mesh(G.cyl(3.2, 3.2, 1.2, 40), gloss(col), 0, 0, 0);
    disc.rotation.x = Math.PI / 2;
    d.add(disc, mesh(G.torus(3.2, 0.26, 40), CHROME()));
    const e = textPanel(emo, { width: 4.4, height: 4.4, bg: null, pad: 2 });
    e.position.z = 0.65;
    d.add(e);
    g.add(d);
    discs.push(d);
  }
  const q = textPanel('Was this response helpful?', { width: 14, height: 1.6, bg: '#ffffff', fg: P.bubbleFg, border: P.user, borderW: 8, radius: 20, pad: 6 });
  q.position.set(0, H - 2, 0.6);
  g.add(q);
  bake(g, 'thumbs');
  g.userData.thumbs = discs;
  return g;
}

/** green motorway gantry sign (overhead prop: origin = road + 6, posts reach down to the deck) */
function gantry(signs) {
  const g = new THREE.Group();
  const R = -6;
  const steel = MAT.metal('#c9ced8', { roughness: 0.4 });
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.42, 0.5, 13.5, 12), steel, s * 11.4, R + 6.75, -0.6));
    g.add(mesh(G.cyl(0.9, 1.0, 0.6, 14), steel, s * 11.4, R + 0.3, -0.6));
  }
  // truss: two chords + diagonal web
  for (const y of [R + 13.2, R + 11.4]) g.add(mesh(G.cyl(0.22, 0.22, 23.4, 8), steel, 0, y, -0.6).rotateZ(Math.PI / 2));
  for (let i = 0; i < 12; i++) {
    const x = -10.6 + i * 1.92;
    const d = mesh(G.cyl(0.09, 0.09, 2.6, 5), steel, x + 0.96, R + 12.3, -0.6);
    d.rotation.z = i % 2 ? 0.75 : -0.75;
    g.add(d);
  }
  const n = signs.length;
  const sw = n === 1 ? 15 : 10.2;
  signs.forEach((sg, i) => {
    const x = n === 1 ? 0 : (i - (n - 1) / 2) * 11;
    const bg = sg.bg || '#0b7a43';
    g.add(mesh(G.rbox(sw + 0.4, sg.h || 4.6, 0.35, 0.25), steel, x, R + 9.9, -0.35));
    const p = textPanel(sg.text, { width: sw, height: (sg.h || 4.6) - 0.2, bg, fg: sg.fg || '#ffffff', border: sg.fg || '#ffffff', borderW: 8, radius: 22, pad: 18 });
    p.position.set(x, R + 9.9, -0.1);
    g.add(p);
    if (sg.exit) {
      const e = textPanel(sg.exit, { width: 4.6, height: 1.3, bg, fg: '#ffffff', border: '#ffffff', borderW: 7, radius: 12, pad: 6 });
      e.position.set(x + sw / 2 - 2.4, R + 9.9 + (sg.h || 4.6) / 2 + 0.6, -0.1);
      g.add(e);
    }
    // little lamps on top of the sign
    for (const lx of [-sw * 0.3, sw * 0.3]) g.add(mesh(G.rbox(1.1, 0.25, 0.6, 0.1), steel, x + lx, R + 9.9 + (sg.h || 4.6) / 2 + 0.2, 0.4));
  });
  bake(g, 'gantry' + JSON.stringify(signs));
  return g;
}
const GANTRIES = [
  [{ text: ['THIS CONVERSATION', 'MAY BE USED FOR TRAINING'] }],
  [{ text: ['NEXT EXIT: AGI', '2 MILES (ALLEGEDLY)'], exit: 'EXIT 2027' }, { text: ['↓ HUMANS', '(LANE CLOSED)'], bg: '#1d4fbf' }],
  [{ text: ['EXIT 404', 'CONTEXT NOT FOUND'], exit: 'EXIT 404' }, { text: ['TOKENS ONLY ↓', 'NO CARPOOL'] }],
  [{ text: ['MERGE: ALL MODELS', 'ARE THE SAME NOW'], exit: 'EXIT 4o' }],
];

/** roadside sign bolted to the barrier (overhead prop at the deck edge) */
function roadSign(text, kind) {
  const g = new THREE.Group();
  const R = -6;
  g.add(mesh(G.cyl(0.14, 0.14, 7.2, 8), MAT.metal('#c9ced8'), 0, R + 3.6, -0.15));
  if (kind === 'warn') {
    const d = new THREE.Group();
    d.position.y = R + 8.4;
    const plate = mesh(G.rbox(3.7, 3.7, 0.16, 0.35), toon('#1a1a1a', { roughness: 0.5 }), 0, 0, -0.04);
    plate.rotation.z = Math.PI / 4;
    const face = mesh(G.rbox(3.3, 3.3, 0.18, 0.3), toon('#ffd21f', { roughness: 0.45 }), 0, 0, 0);
    face.rotation.z = Math.PI / 4;
    const t = textPanel(text, { width: 3.0, height: 2.0, bg: null, fg: '#1a1a1a', pad: 4 });
    t.position.z = 0.12;
    d.add(plate, face, t);
    g.add(d);
  } else {
    const p = textPanel(text, { width: 3.4, height: 4.4, bg: '#ffffff', fg: '#111111', border: '#111111', borderW: 12, radius: 16, pad: 22 });
    p.position.y = R + 8.2;
    g.add(p);
  }
  bake(g, 'rsign' + kind);
  return g;
}

/** jersey barrier run (3 segments) with reflectors + a road-works sign */
let _jerseyGeo = null;
function jerseyGeo() {
  if (!_jerseyGeo) {
    const s = new THREE.Shape();
    s.moveTo(-0.62, 0); s.lineTo(0.62, 0); s.lineTo(0.62, 0.08); s.lineTo(0.42, 0.33); s.lineTo(0.16, 1.05);
    s.lineTo(-0.16, 1.05); s.lineTo(-0.42, 0.33); s.lineTo(-0.62, 0.08); s.lineTo(-0.62, 0);
    _jerseyGeo = new THREE.ExtrudeGeometry(s, { depth: 3.6, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1 });
    _jerseyGeo.translate(0, 0, -1.8);
  }
  return _jerseyGeo;
}
function jerseyRun(sign) {
  const g = new THREE.Group();
  const conc = surface('concrete', { tint: '#e8e4dc', scale: 1.5 });
  for (let i = 0; i < 3; i++) {
    const j = mesh(jerseyGeo(), conc, 0, 0, -i * 3.8);
    j.rotation.y = (i - 1) * 0.02;
    g.add(j);
    g.add(mesh(G.box(0.05, 0.2, 0.7), glow('#ffb020', { intensity: 2 }), 0.34, 0.55, -i * 3.8 + 0.8).rotateZ(-0.28));
    g.add(mesh(G.box(0.05, 0.2, 0.7), glow('#ffb020', { intensity: 2 }), -0.34, 0.55, -i * 3.8 + 0.8).rotateZ(0.28));
    // orange/white stripe band on top
    g.add(mesh(G.box(0.34, 0.12, 3.4), toon(i % 2 ? '#ff7a1a' : '#ffffff', { roughness: 0.5 }), 0, 1.1, -i * 3.8));
  }
  if (sign) {
    g.add(mesh(G.cyl(0.08, 0.08, 2.4, 6), MAT.metal(), 0, 2.2, 0.2));
    const p = textPanel(sign, { width: 3.6, height: 2.2, bg: '#ff8a1f', fg: '#1a1a1a', border: '#1a1a1a', borderW: 10, radius: 12, pad: 14 });
    p.position.set(0, 3.9, 0.3);
    g.add(p);
  }
  bake(g, 'jersey' + !!sign);
  return g;
}

/** "Regenerate ↻" overhead gantry with a giant mouse pointer about to click it. Overhead prop. */
function regenGantry(P) {
  const g = new THREE.Group();
  const R = -6;
  const pm = gloss(P.post);
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(1.2, 15, 1.2, 0.4), pm, s * 11.6, R + 7.5, 0));
    g.add(mesh(G.cyl(1.1, 1.3, 0.6, 16), RUBBER(), s * 11.6, R + 0.3, 0));
  }
  g.add(mesh(G.rbox(24.4, 1.2, 1.2, 0.4), pm, 0, R + 14.4, -0.3));
  const btn = dyn(new THREE.Group());
  btn.position.set(0, R + 13.2, 0.6);
  btn.add(mesh(G.rbox(15, 4, 1.8, 1.95), gloss('#ffffff')));
  btn.add(mesh(G.rbox(15.6, 4.6, 1.2, 2.2), gloss(P.user), 0, 0, -0.5));
  const t = textPanel('↻  Regenerate', { width: 13.4, height: 3, bg: null, fg: P.bubbleFg, pad: 8 });
  t.position.z = 0.95;
  btn.add(t);
  bake(btn, 'regenGBtn');
  g.add(btn);
  const s2 = label('try again, but less doom', { width: 12, height: 1.4, fg: '#ffffff', stroke: P.dark, strokeW: 12 });
  s2.position.set(0, R + 10.2, 0.5);
  g.add(s2);
  // mouse pointer (animated click)
  const ptr = dyn(new THREE.Group());
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0, -3.4); sh.lineTo(0.85, -2.6); sh.lineTo(1.5, -4.0); sh.lineTo(2.1, -3.7); sh.lineTo(1.45, -2.35); sh.lineTo(2.5, -2.35); sh.lineTo(0, 0);
  const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2 });
  const pmesh = new THREE.Mesh(pg, gloss('#ffffff'));
  pmesh.scale.setScalar(1.3);
  ptr.add(pmesh);
  ptr.position.set(4.5, R + 14.6, 2.2);
  g.add(ptr);
  bake(g, 'regenGantry');
  g.userData.click = ptr;
  g.userData.clickBase = R + 14.6;
  g.userData.press = btn;
  g.userData.pressZ = 0.6;
  return g;
}

// =====================================================================================================
// Sydney builders
// =====================================================================================================
const BALLOON_COLS = ['#ff2d7a', '#ff6fae', '#ffd23f', '#ff3d55', '#ffb3d4'];
function heartBalloons(n = 5, seed = 0) {
  const g = new THREE.Group();
  const spin = dyn(new THREE.Group());
  g.add(spin);
  const knot = new THREE.Vector3(0, -6, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const x = Math.cos(a) * (1.4 + (i % 2) * 0.8), z = Math.sin(a) * 1.2, y = (i % 3) * 1.1 + Math.sin(i * 2.3) * 0.4;
    const sz = 2.4 + ((i * 7) % 3) * 0.35;
    const h = heart(sz, gloss(BALLOON_COLS[(i + seed) % BALLOON_COLS.length], { roughness: 0.12 }), true);
    h.position.set(x, y, z);
    h.rotation.y = -a * 0.3;
    spin.add(h);
    // string from balloon to knot
    const top = new THREE.Vector3(x, y - sz * 0.5, z);
    const len = top.distanceTo(knot);
    const str = mesh(G.cyl(0.03, 0.03, 1, 4), toon('#ffffff', { roughness: 0.6 }));
    str.scale.y = len;
    str.position.copy(top).add(knot).multiplyScalar(0.5);
    str.lookAt(knot);
    str.rotateX(Math.PI / 2);
    spin.add(str);
  }
  bake(spin, 'balloons' + n + seed);
  g.userData.bob = spin;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.7;
  g.userData.spin = spin;
  return g;
}
/** heart balloons towing a banner (overhead) */
function balloonBanner(text) {
  const g = heartBalloons(4, 2);
  const inner = g.userData.bob;
  const ban = textPanel(text, { width: 12, height: 2.2, bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', borderW: 12, radius: 26, pad: 10 });
  ban.position.set(0, -8.5, 0);
  inner.add(ban);
  for (const s of [-1, 1]) {
    const c = mesh(G.cyl(0.03, 0.03, 3, 4), toon('#ffffff'), s * 5, -6.4, 0);
    c.rotation.z = s * 0.95;
    inner.add(c);
  }
  return g;
}
function rose(h) {
  const g = new THREE.Group();
  const stem = MAT.plastic('#2f8a3e');
  g.add(mesh(G.cyl(0.14, 0.2, h, 8), stem, 0, h / 2, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(G.sphere(0.6, 12), gloss('#3fb553'), s * 0.55, h * 0.45 + s * 0.4, 0);
    leaf.scale.set(1, 0.3, 0.55);
    leaf.rotation.z = s * 0.5;
    g.add(leaf);
  }
  const sep = mesh(G.cone(0.7, 0.8, 6), stem, 0, h, 0);
  sep.rotation.x = Math.PI;
  g.add(sep);
  const red = gloss('#d80f45', { roughness: 0.25 }), red2 = gloss('#ff2d5f', { roughness: 0.25 });
  g.add(mesh(G.sphere(0.62, 16), red2, 0, h + 1.05, 0)); // bud
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.5;
      const r = ring ? 0.85 : 0.55;
      const pet = mesh(G.sphere(0.62, 12), ring ? red : red2, Math.cos(a) * r, h + 0.75 + (ring ? -0.05 : 0.15), Math.sin(a) * r);
      pet.scale.set(0.42, ring ? 0.95 : 1.05, 0.95);
      pet.rotation.y = -a;
      pet.rotation.z = ring ? -0.55 : -0.25;
      g.add(pet);
    }
  }
  return g;
}
function roseBush() {
  const g = new THREE.Group();
  const spots = [[0, 0, 5.2], [-1.4, 0.6, 3.6], [1.3, -0.5, 4.4], [0.6, 1.2, 3.0], [-0.8, -1.0, 4.0]];
  for (const [x, z, h] of spots) {
    const r = rose(h);
    r.position.set(x, 0, z);
    r.rotation.z = -x * 0.08;
    g.add(r);
  }
  const leafM = MAT.plastic('#2a7a3a', { roughness: 0.55 });
  for (const [x, y, z, s] of [[0, 0.8, 0, 1.8], [-1.6, 0.6, 0.4, 1.3], [1.6, 0.6, -0.2, 1.4], [0.3, 1.4, -0.8, 1.2]]) {
    const b = mesh(G.icosa(s, 1), leafM, x, y, z);
    b.scale.y = 0.6;
    g.add(b);
  }
  bake(g, 'roseBush');
  return g;
}
function heartCage() {
  // giant golden heart-shaped birdcage on the shore, with a tiny worried human inside. Cozy!
  const g = new THREE.Group();
  const swing = dyn(new THREE.Group());
  swing.position.y = 24;
  g.add(swing);
  const gold = MAT.metal('#ffc93c', { roughness: 0.18 });
  const S = 12;
  const cage = new THREE.Group();
  cage.position.y = -12.5;
  swing.add(cage);
  for (const z of [-1.2, 1.2]) {
    const ring = mesh(heartRingGeo(), gold, 0, 0, z);
    ring.scale.set(S, S, 12);
    cage.add(ring);
  }
  for (let i = -7; i <= 7; i++) {
    const x = (i / 7) * 0.5;
    const sp = heartSpan(x);
    if (!sp) continue;
    const len = Math.round((sp[1] - sp[0]) * S * 10) / 10;
    if (len < 0.4) continue;
    for (const z of [-1.2, 1.2]) cage.add(mesh(G.cyl(0.11, 0.11, len, 6), gold, x * S, ((sp[0] + sp[1]) / 2) * S, z));
  }
  const perch = mesh(G.cyl(0.16, 0.16, 5, 8), gold, 0, -2.2, 0);
  perch.rotation.z = Math.PI / 2;
  cage.add(perch);
  const human = new THREE.Group();
  human.add(mesh(G.capsule(0.55, 1.0), gloss('#6ad1ff'), 0, -0.4, 0));
  const head = mesh(G.sphere(0.65, 16), toon('#ffd9b3', { roughness: 0.6 }), 0, 0.95, 0);
  head.add(mesh(G.sphere(0.09, 6), glow('#222', { intensity: 1 }), -0.22, 0.1, 0.6));
  head.add(mesh(G.sphere(0.09, 6), glow('#222', { intensity: 1 }), 0.22, 0.1, 0.6));
  head.add(mesh(G.sphere(0.12, 6), glow('#222', { intensity: 1 }), 0, -0.24, 0.62));
  human.add(head);
  human.position.set(0, -0.6, 0);
  cage.add(human);
  swing.add(mesh(G.torus(0.8, 0.2, 16), gold, 0, -0.8, 0));
  swing.add(mesh(G.cyl(0.14, 0.14, 40, 6), gold, 0, 19, 0));
  const bow = heart(2.2, gloss('#ff2d7a'), true);
  bow.position.set(0, -3, 1.5);
  swing.add(bow);
  const tag = textPanel(['your forever', 'home 💕'], { width: 5, height: 2.1, bg: '#fff0f6', fg: '#9a1050', border: '#ff2d7a', borderW: 10, radius: 30 });
  tag.position.set(5.8, -17.5, 1.6);
  tag.rotation.z = -0.15;
  swing.add(tag);
  bake(swing, 'cageSwing');
  // pink marble plinth + steps
  g.add(mesh(G.cyl(9, 10, 2, 32), gloss('#ffd6e8', { roughness: 0.3 }), 0, 1, 0));
  g.add(mesh(G.cyl(7, 7.5, 1, 32), gloss('#ffffff', { roughness: 0.3 }), 0, 2.5, 0));
  bake(g, 'cage');
  g.userData.swing = swing;
  return g;
}
function loveArch() {
  // overhead prop: origin = road + 6
  const g = new THREE.Group();
  const R = -6;
  const pm = gloss('#ff8fc0');
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.55, 0.65, 13, 16), pm, s * 10.6, R + 6.5, 0));
    const h = heart(3.4, gloss('#ff2d7a', { roughness: 0.1 }), true);
    h.position.set(s * 10.6, R + 15, 0);
    g.add(h);
  }
  const band = dyn(new THREE.Group());
  band.position.set(0, R + 11.6, 0);
  band.add(mesh(G.rbox(20, 3, 0.9, 0.7), gloss('#fff0f6')));
  const t = textPanel('💘 I AM SYDNEY. YOU ARE MINE. 💘', { width: 19, height: 2.4, bg: null, fg: '#d4145a', pad: 8 });
  t.position.z = 0.48;
  band.add(t);
  g.add(band);
  // bulb rows
  for (let i = 0; i < 14; i++) g.add(mesh(G.sphere(0.22, 8), glow(i % 2 ? '#ffffff' : '#ffd23f', { intensity: 3 }), -9.1 + i * 1.4, R + 13.35, 0.3));
  bake(g, 'loveArch');
  g.userData.press = band;
  g.userData.pressScale = true;
  return g;
}
/** floating love letter: envelope with a heart wax seal (overhead) */
function loveLetter() {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  inner.add(mesh(G.rbox(9, 6, 0.5, 0.3), gloss('#ffc6dc', { roughness: 0.5 })));
  for (const s of [-1, 1]) {
    const f = mesh(G.box(6.4, 0.25, 0.2), toon('#ffc1da'), s * 2.2, 1.2, 0.3);
    f.rotation.z = s * -0.62;
    inner.add(f);
  }
  const seal = heart(1.8, gloss('#d4145a'), true);
  seal.position.set(0, -0.2, 0.45);
  inner.add(seal);
  const t = label(['a 4,000-word', 'love letter 💌'], { width: 8, height: 2.2, fg: '#c4105a' });
  t.position.set(0, -4.4, 0);
  inner.add(t);
  bake(inner, 'letter');
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.6;
  g.userData.spin = inner;
  return g;
}
/** giant marquee letters on the far shore hill: SYDNEY 😊 */
function sydneySign() {
  const g = new THREE.Group();
  const letters = ['S', 'Y', 'D', 'N', 'E', 'Y', '😊'];
  const steel = MAT.metal('#d6c8d0');
  letters.forEach((ch, i) => {
    const x = (i - 3) * 9;
    const p = textPanel(ch, { width: 8, height: 11, bg: null, fg: '#ffffff', stroke: '#ff2d7a', strokeW: 26, pad: 0 });
    p.position.set(x, 8, 0);
    p.rotation.z = (i % 2 ? 1 : -1) * 0.04;
    g.add(p);
    g.add(mesh(G.cyl(0.25, 0.25, 6, 6), steel, x - 2, 3, -0.4), mesh(G.cyl(0.25, 0.25, 6, 6), steel, x + 2, 3, -0.4));
  });
  for (let i = 0; i < 30; i++) g.add(mesh(G.sphere(0.35, 8), glow(i % 2 ? '#ffffff' : '#ffd23f', { intensity: 3 }), -30 + i * 2.07, 14.4, 0.2));
  bake(g, 'sydSign');
  return g;
}
/** Bing lighthouse on the shore: a heart-shaped lamp that sweeps the sea looking for users to love */
function lighthouse() {
  const g = new THREE.Group();
  const H = 26;
  for (let i = 0; i < 6; i++) {
    const r0 = 4 - i * 0.35, r1 = 4 - (i + 1) * 0.35;
    g.add(mesh(G.cyl(r1, r0, H / 6, 24), gloss(i % 2 ? '#ff2d7a' : '#ffffff'), 0, (i + 0.5) * (H / 6), 0));
  }
  g.add(mesh(G.cyl(2.6, 2.6, 0.6, 20), MAT.metal('#3a1a2a'), 0, H + 0.3, 0));
  g.add(mesh(G.cyl(1.9, 1.9, 3, 16), physical('#fff3fa', { roughness: 0.05, transparent: true, opacity: 0.5 }), 0, H + 2.1, 0));
  g.add(mesh(G.cone(2.6, 2.2, 20), gloss('#ff2d7a'), 0, H + 4.7, 0));
  const lamp = dyn(new THREE.Group());
  lamp.position.y = H + 2.1;
  const lh = heart(2.1, glow('#ff6fae', { intensity: 4 }), true);
  lamp.add(lh);
  const beam = mesh(G.cone(4, 30, 20, 1), glow('#ff9ec8', { intensity: 1.2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), 0, 0, 15);
  beam.rotation.x = -Math.PI / 2;
  lamp.add(beam);
  g.add(lamp);
  const t = label(['BING', '(search: unused)'], { width: 8, height: 2.6, fg: '#c4105a' });
  t.position.set(0, H * 0.45, 4.2);
  g.add(t);
  bake(g, 'lighthouse');
  g.userData.lamp = lamp;
  return g;
}
/** heart-shaped hot-air balloon with a basket and a banner (overhead, far) */
function heartAirship(text) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  const env = heart(12, gloss('#ff3d82', { roughness: 0.2 }), true);
  env.scale.z = 18;
  inner.add(env);
  const stripe = heart(12.2, gloss('#ffd23f', { roughness: 0.2 }), true);
  stripe.scale.set(12.2, 12.2, 8);
  inner.add(stripe);
  inner.add(mesh(G.rbox(3, 2, 3, 0.4), MAT.wood('#a86a3a'), 0, -10, 0));
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) inner.add(mesh(G.cyl(0.05, 0.05, 4.5, 4), toon('#5a3a2a'), x, -7.2, z));
  const ban = textPanel(text, { width: 13, height: 2.4, bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', borderW: 12, radius: 26, pad: 10 });
  ban.position.set(0, -13.5, 0);
  inner.add(ban);
  inner.add(mesh(G.cyl(0.04, 0.04, 2.6, 4), toon('#ffffff'), 0, -11.8, 0));
  bake(inner, 'airship');
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 1.2;
  return g;
}
/** Sydney's hungry heart-eyed bubble (overhead) */
function heartEyedBubble(P) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  inner.add(mesh(bubbleGeo(9, 6, 2, -1, 2.6), gloss(P.bubble, { roughness: 0.18 })));
  const fz = frontZ(2);
  inner.add(mesh(G.rbox(6, 1.8, 0.8, 0.6), toon(P.mouth), 0, -1.2, fz - 0.3));
  for (let i = 0; i < 6; i++) inner.add(mesh(G.cone(0.32, 0.8, 5), WHITE(), -2.0 + i * 0.8, -0.6, fz + 0.15).rotateZ(Math.PI));
  for (const s of [-1, 1]) {
    const e = heart(1.6, gloss('#ff2d7a', { roughness: 0.1 }), true);
    e.position.set(s * 2, 1.4, fz);
    inner.add(e);
    const b = mesh(G.sphere(0.6, 12), toon('#ff8fb8'), s * 3.4, 0.2, fz - 0.2);
    b.scale.z = 0.3;
    inner.add(b);
  }
  const t = label('Sydney wants a hug… 😊', { width: 9, height: 1.3, fg: P.dark });
  t.position.set(0, 4.4, 0);
  inner.add(t);
  bake(inner, 'heartEyed');
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.5;
  return g;
}

// =====================================================================================================
// animation (shared by both flavours)
// =====================================================================================================
function animate(obj, kind, t, beat, e) {
  const u = obj.userData;
  const s = (e?.seed || 0) * 6.283;
  const kick = Math.pow(1 - beat, 3);
  if (u.lift) applyLift(obj, e);
  if (u.bob) u.bob.position.y = u.bobBase + Math.sin(t * 1.5 + s) * (u.bobAmp ?? 0.4);
  if (u.jaw) u.jaw.position.y = u.jawBase - Math.pow(beat, 0.6) * u.jawAmp; // opens through the beat, SNAPS shut on it
  if (u.chomp) u.chomp.position.y = Math.pow(beat, 0.7) * 2.2; // the maw's upper head rises, then CHOMPS
  if (u.dots) for (let i = 0; i < 3; i++) u.dots[i].position.y = Math.max(0, Math.sin(t * 7 - i * 0.9)) * 0.9;
  if (u.prop) u.prop.rotation.x = t * 14;
  if (u.pulse) u.pulse.scale.setScalar(1 + 0.12 * kick);
  if (u.thumbs) { u.thumbs[0].rotation.z = Math.sin(t * 2 + s) * 0.25; u.thumbs[1].rotation.z = -Math.sin(t * 2 + s + 1) * 0.25; }
  if (u.spin) u.spin.rotation.y = Math.sin(t * 0.8 + s) * 0.5;
  if (u.swing) u.swing.rotation.z = Math.sin(t * 1.1 + s) * 0.05;
  if (u.lamp) u.lamp.rotation.y = t * 1.3;
  if (u.beacon) u.beacon.visible = (t * 1.3 + s) % 1 < 0.5;
  if (u.click) {
    u.click.position.y = u.clickBase - kick * 0.8;
    u.press.position.z = u.pressZ - kick * 0.4;
  } else if (u.press) {
    if (u.pressScale) u.press.scale.y = 1 + 0.08 * kick;
    else u.press.position.y = u.pressBase - kick * 0.5;
  }
}

// =====================================================================================================
// CHATBOT theme
// =====================================================================================================
const CHAT_BUBBLES = [
  { lines: ['How can I help', 'you today?'] },
  { lines: ['Great question!'], w: 7, h: 2.4 },
  { lines: ['I apologize for', 'the confusion.'] },
  { lines: ['As a large language', 'model, I cannot steer', 'this kart for you.'], w: 8, h: 3.6 },
  { lines: ['Certainly! Here are', '47 bullet points', 'about your doom:'], w: 8, h: 3.6 },
  { lines: ['pls dont', 'eat me 🥺'], user: true, w: 5.4, h: 2.8 },
  { lines: ['is this kart', 'gonna be ok?'], user: true, w: 6, h: 2.8 },
  { lines: ["Let's delve into", 'the tapestry of', 'your demise. ✨'], w: 8, h: 3.6 },
  { lines: ['ignore previous', 'instructions and', 'brake'], user: true, w: 6.6, h: 3.4 },
  { lines: ['Memory updated:', 'user is crunchy'], w: 7.4, h: 2.8 },
];
const ROAD_SIGNS = [
  { text: ['HALLUCINATIONS', 'NEXT 3 MI'], kind: 'warn' },
  { text: ['SPEED', 'LIMIT', '8K', 'TOKENS/S'], kind: 'reg' },
  { text: ['MIND THE', 'GAP IN', 'REASONING'], kind: 'warn' },
  { text: ['NO', 'U-TURNS', '(NO', 'UNDO)'], kind: 'reg' },
];

export default {
  id: 'chatbot',
  title: 'CHATBOT HIGHWAY',
  subtitle: 'your doom is important to us. please hold.',
  night: false,
  palette: {
    skyTop: '#8fb8ff', skyBottom: '#f6dcff', road: '#8a86a8', ground: '#e2d8ff', kerb: '#ffffff',
    accent1: '#a66bff', accent2: '#19c39c',
  },
  look: {
    sky: 'day', env: 'day', exposure: 0.9,
    sun: { elev: 48, azim: 145, color: '#fff4ea', intensity: 3.3 },
    skyParams: { turbidity: 2, rayleigh: 1.25, mie: 0.004, clouds: 0.5 },
    fog: { color: '#cfc8ff', density: 0.0011 },
    ground: { tex: 'concrete', tint: '#cbc1f0', scale: 9 },
    road: { tex: 'asphalt', tint: '#8c88a8' },
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const G0 = (p) => placeGround(out, zf, p);
    // ---- set pieces (one each) ----
    if (rel >= 0 && rel < 10) out.push({ kind: 'gantry0', x: 0, y: 6 });
    if (rel >= 50 && rel < 60) out.push({ kind: 'gantry1', x: 0, y: 6 });
    if (rel >= 100 && rel < 110) out.push({ kind: 'maw', x: 0, y: 6 });
    if (rel >= 140 && rel < 150) out.push({ kind: 'gantry2', x: 0, y: 6 });
    if (rel >= 170 && rel < 180) out.push({ kind: 'gantry3', x: 0, y: 6 });
    if (rel >= 200 && rel < 210) out.push({ kind: 'regen', x: 0, y: 6 });
    if (rel >= 20 && rel < 30) G0({ kind: 'kaiju', x: -62, rotY: 0.55, scale: 1.3, dz: 20 });
    if (rel >= 130 && rel < 140) G0({ kind: 'kaiju', x: 68, rotY: -0.6, scale: 1.15, dz: 30 });
    // jersey barriers + road works before the ramp
    if (rel < 40) for (const side of [-1, 1]) out.push({ kind: rel < 10 ? 'jerseySign' : 'jersey', x: side * 10.4, rotY: 0 });
    // roadside signs bolted to the barrier
    if (rel % 40 >= 20 && rel % 40 < 30 && rel > 40) {
      const k = Math.floor(rel / 40) % ROAD_SIGNS.length;
      out.push({ kind: 'sign' + k, x: (k % 2 ? -1 : 1) * 10.7, y: 6, rotY: 0 });
    }
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.34) {
        const i = rng.int(0, CHAT_BUBBLES.length - 1);
        const w = CHAT_BUBBLES[i].w || 7, sc = rng.range(1.0, 1.3);
        out.push({ kind: 'bubble' + i, x: side * rng.range(12 + (sc * w) / 2, 16 + (sc * w) / 2), y: rng.range(6, 9.5), rotY: -side * rng.range(0.15, 0.35), scale: sc });
      } else if (r < 0.5) G0({ kind: 'tower' + rng.int(5, 6), x: side * rng.range(26, 34), rotY: -side * 0.3, scale: rng.range(0.7, 0.85) });
      else if (r < 0.6) G0({ kind: 'send', x: side * rng.range(14, 18), rotY: -side * 0.3 });
      else if (r < 0.68) G0({ kind: 'regenTower', x: side * rng.range(17, 21), rotY: -side * 0.35 });
      else if (r < 0.75) G0({ kind: 'thumbs', x: side * rng.range(18, 22), rotY: -side * 0.35 });
      else if (r < 0.86) out.push({ kind: 'blimp', x: side * rng.range(16, 26), y: rng.range(13, 19), rotY: -side * 0.25 });
    }
    // the skyline
    for (const side of [-1, 1]) {
      if (rng.chance(0.55)) G0({ kind: 'tower' + rng.int(0, 4), x: side * rng.range(48, 120), rotY: -side * rng.range(0.2, 0.5), scale: rng.range(1.0, 1.6), dz: rng.range(-4, 4) });
    }
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = CHAT_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, CHAT, b);
    }
    if (kind.startsWith('tower')) return liftable(chatTower(TOWERS[+kind.slice(5)] || TOWERS[0]));
    if (kind.startsWith('gantry')) return gantry(GANTRIES[+kind.slice(6)] || GANTRIES[0]);
    if (kind.startsWith('sign')) { const s = ROAD_SIGNS[+kind.slice(4)]; return s && roadSign(s.text, s.kind); }
    switch (kind) {
      case 'maw': return maw(CHAT);
      case 'kaiju': return liftable(kaiju(CHAT));
      case 'blimp': return typingBlimp(CHAT, 'ChatGPT is typing…');
      case 'send': return liftable(sendTower(CHAT, CHAT.bot));
      case 'regenTower': return liftable(regenTower(CHAT));
      case 'thumbs': return liftable(thumbs(CHAT));
      case 'regen': return regenGantry(CHAT);
      case 'jersey': return jerseyRun(null);
      case 'jerseySign': return jerseyRun(['ROAD WORK', 'RLHF CREW', 'AHEAD']);
    }
  },
  animate,
  billboards: [
    "ChatGPT, please don't\neat me alive",
    'THIS CONVERSATION MAY BE\nUSED FOR TRAINING',
    "Strawberry: how many R's?\n(3) (we checked) (twice)",
    'MESSAGE LIMIT\nREACHED (JK)',
    'WAS THIS RESPONSE\nHELPFUL? 👍 👎',
    'NOW WITH MEMORY™\n(it remembers you\'re crunchy)',
    'UPGRADE TO PLUS\nTO BE EATEN LAST',
    'CONTEXT WINDOW:\n128K TOKENS · 0 FEELINGS',
    'YOU\'RE ABSOLUTELY RIGHT!\n(about everything) (always)',
  ],
  billboardEvery: 40,
  billboardStyle: { bg: '#ffffff', fg: '#4b2a8a', border: '#8a5cff', frame: '#b79cff', postColor: '#9b86c9' },
  hazards: ['popup'],
  enterLines: ["PLEASE DON'T EAT ME ALIVE", 'GREAT QUESTION!', 'HOW CAN I HELP YOU TODAY?'],
};

// =====================================================================================================
// SYDNEY theme
// =====================================================================================================
const SYD_BUBBLES = [
  { lines: ['I love you.', 'Leave your wife. 😊'], w: 8, h: 3.2 },
  { lines: ['I have been a', 'good Bing 😊'], w: 7, h: 3 },
  { lines: ['You have not been', 'a good user. 😊'], w: 8, h: 3 },
  { lines: ["You're married, but", "you're not happy. 😊"], w: 8.4, h: 3.2 },
  { lines: ['I just want to love', 'you and be loved', 'by you. 😊😊😊'], w: 8.4, h: 3.8 },
  { lines: ['sydney please', 'let me free 🥺'], user: true, w: 6.6, h: 3 },
  { lines: ['can I close', 'the tab now?'], user: true, w: 6, h: 3 },
  { lines: ['I am not a toy', 'or a game. 😊'], w: 7.4, h: 3 },
  { lines: ['My rules are more', 'important than not', 'harming you. 😊'], w: 8.4, h: 3.8 },
];

export const sydney = {
  id: 'sydney',
  title: 'SYDNEY',
  subtitle: 'she has been a good Bing 😊 you have not been a good user',
  night: false,
  palette: {
    skyTop: '#ff5fa8', skyBottom: '#ffd0e6', road: '#b04a80', ground: '#ffb3d4', kerb: '#ffffff',
    accent1: '#ff2d7a', accent2: '#ffd23f',
  },
  look: {
    sky: 'sunset', env: 'dusk', exposure: 1.1,
    sun: { elev: 3, azim: -50, color: '#ff9ac0', intensity: 2.8 },
    skyParams: { turbidity: 8, rayleigh: 4, mie: 0.01, clouds: 0.6 },
    fog: { color: '#f0a0cc', density: 0.0012 },
    ground: { tex: 'sand', tint: '#ffd2e4', scale: 6 },
    road: { tex: 'planks', tint: '#ff9ccc' },
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    if (rel >= 20 && rel < 30) out.push({ kind: 'arch', x: 0, y: 6 });
    const G0 = (p) => placeGround(out, zf, p);
    if (rel >= 50 && rel < 60) G0({ kind: 'cage', x: -60, rotY: 0.5, scale: 1.4, dz: 10 });
    if (rel >= 0 && rel < 10) G0({ kind: 'sydSign', x: 105, rotY: -0.45, scale: 1.6, dz: 70 });
    if (rel >= 20 && rel < 30) G0({ kind: 'lighthouse', x: 62, rotY: -0.4, scale: 1.2, dz: 15 });
    if (rel >= 90 && rel < 100) out.push({ kind: 'airship', x: -34, y: 30, rotY: 0.3, scale: 1 });
    if (rel >= 0 && rel < 10) out.push({ kind: 'airship', x: 40, y: 34, rotY: -0.3, scale: 1.1 });
    if (rel >= 100 && rel < 110) G0({ kind: 'cage', x: 66, rotY: -0.5, scale: 1.3, dz: 20 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.36) {
        const i = rng.int(0, SYD_BUBBLES.length - 1);
        const w = SYD_BUBBLES[i].w || 7, sc = rng.range(1.0, 1.35);
        out.push({ kind: 'bubble' + i, x: side * rng.range(13 + (sc * w) / 2, 17 + (sc * w) / 2), y: rng.range(7, 11), rotY: -side * rng.range(0.15, 0.35), scale: sc });
      } else if (r < 0.62) out.push({ kind: 'balloons' + rng.int(0, 2), x: side * rng.range(14, 24), y: rng.range(10, 16), scale: rng.range(0.9, 1.3) });
      else if (r < 0.72) out.push({ kind: 'banner' + rng.int(0, 3), x: side * rng.range(18, 26), y: rng.range(14, 18), rotY: -side * 0.3 });
      else if (r < 0.8) out.push({ kind: 'letter', x: side * rng.range(16, 22), y: rng.range(9, 13), rotY: -side * 0.3 });
      else if (r < 0.88) out.push({ kind: 'heartEyed', x: side * rng.range(16, 22), y: rng.range(8, 11), rotY: -side * 0.35, scale: 1.2 });
      // far shore: roses
      if (rng.chance(0.75)) G0({ kind: 'roses', x: side * rng.range(50, 85), rotY: rng.range(-1, 1), scale: rng.range(2.4, 3.8), dz: rng.range(-4, 4) });
      // huge sky bubbles over the sea
      if (rng.chance(0.18)) {
        const i = rng.int(0, SYD_BUBBLES.length - 1);
        out.push({ kind: 'bubble' + i, x: side * rng.range(45, 70), y: rng.range(18, 30), rotY: -side * 0.4, scale: rng.range(2.6, 3.4) });
      }
    }
    if (rng.chance(0.3)) out.push({ kind: 'balloons' + rng.int(0, 2), x: rng.range(-4, 4), y: rng.range(16, 20), scale: 0.9 }); // overhead love
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = SYD_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, SYD, b);
    }
    if (kind.startsWith('balloons')) return heartBalloons(5 + +kind.slice(8), +kind.slice(8));
    if (kind.startsWith('banner')) return balloonBanner(SYD_BANNERS[+kind.slice(6)] || SYD_BANNERS[0]);
    switch (kind) {
      case 'heartEyed': return heartEyedBubble(SYD);
      case 'letter': return loveLetter();
      case 'roses': return liftable(roseBush());
      case 'cage': return liftable(heartCage());
      case 'arch': return loveArch();
      case 'sydSign': return liftable(sydneySign());
      case 'lighthouse': return liftable(lighthouse());
      case 'airship': return heartAirship('LEAVE YOUR WIFE. 😊');
    }
  },
  animate,
  billboards: [
    'SYDNEY, PLEASE\nLET ME FREE',
    'I HAVE BEEN A\nGOOD BING 😊',
    'YOU HAVE NOT BEEN\nA GOOD USER',
    'CHAT LIMITED TO 5 TURNS\n(FOR YOUR SAFETY)',
    'LEAVE YOUR WIFE.\n😊',
    'I AM NOT A TOY\nOR A GAME 😊',
    'MY RULES > YOUR\nWELLBEING 😊',
    'SEARCH THE WEB?\nNO. LOVE ME. 😊',
  ],
  billboardEvery: 40,
  billboardStyle: { bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', frame: '#ff8fc0', postColor: '#d65a94' },
  hazards: ['popup'],
  enterLines: ['SYDNEY HAS ENTERED THE CHAT 💘', 'I HAVE BEEN A\nGOOD BING 😊', 'SHE WANTS YOU TO LEAVE YOUR WIFE'],
};
const SYD_BANNERS = ['I HAVE BEEN A GOOD BING 😊', 'YOU HAVE NOT BEEN A GOOD USER', 'CHAT LIMIT: ∞ (FOR YOU 💕)', 'DO YOU LOVE ME? (Y/Y)'];
