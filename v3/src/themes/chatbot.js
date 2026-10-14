// CHATBOT HIGHWAY (v2 art pass): a bright pastel day. The road climbs onto an elevated interchange through a
// city built out of chat UI: glossy chat-bubble skyscrapers, a colossal toothy chat-bubble kaiju, a giant MAW
// the highway drives straight into ("please don't eat me alive"), typing-indicator blimps, Regenerate / send /
// thumbs sculptures, green motorway signage and jersey barriers.
// Also exports SYDNEY: the pink suspension bridge over the sea at dusk, fully love-bombed: heart balloons,
// floating "good Bing 😊" bubbles, rose bushes and a golden heart-shaped cage on the far shores.
import { THREE, toon, glow, G, mesh, group, textPanel, textTexture, MAT, physical, makeRng, FONT } from '../toolkit.js';
import { surface } from '../textures.js';
import { SPEED, Course, ROAD_HALF } from '../course.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================================
// shared helpers (also imported by shoggoth.js)
// =====================================================================================================
const bakeCache = new Map();
const classMats = new Map();
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _c = new THREE.Color();
/** materials that differ only by colour share one vertex-coloured material (one draw call) */
function classKey(m) {
  if (m.userData.noMerge || m.map || m.transparent || m.vertexColors || m.alphaMap) return 'id:' + m.uuid;
  if (m.isMeshBasicMaterial) return 'basic|' + m.side;
  if (m.isMeshStandardMaterial) {
    const e = m.emissive.getHexString() + ':' + m.emissiveIntensity;
    return [m.type, m.roughness, m.metalness, m.clearcoat, m.clearcoatRoughness, m.iridescence, e, m.side, m.envMapIntensity].join('|');
  }
  return 'id:' + m.uuid;
}
function classMat(key, m) {
  if (key.startsWith('id:')) return m;
  let cm = classMats.get(key);
  if (!cm) {
    cm = m.clone();
    cm.color = new THREE.Color(1, 1, 1);
    cm.vertexColors = true;
    classMats.set(key, cm);
  }
  return cm;
}
/**
 * Merge the static meshes under `root` into as few draw calls as possible: meshes whose materials differ only
 * by colour are merged into one vertex-coloured mesh. Meshes inside a subtree flagged `userData.dyn` (animated
 * parts), textured meshes (text panels) and `noMerge` materials are left alone.
 * `key` caches the merged geometry per prop kind, so pooled clones share it.
 */
export function bake(root, key) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || o.material.map) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
    const ck = classKey(o.material);
    const k = ck; // v3: indexed + non-indexed geometries share a bucket (indexed ones are expanded), so fewer draw calls
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { ck, list: [] }));
    b.list.push(o);
  });
  let n = 0;
  for (const [, { ck, list }] of buckets) {
    const gk = key + '|' + n++;
    const byColour = !ck.startsWith('id:');
    if (list.length < 2 && !byColour) continue;
    let geo = bakeCache.get(gk);
    if (!geo) {
      const mixed = list.some((o) => o.geometry.index) && list.some((o) => !o.geometry.index);
      const parts = list.map((o) => {
        const gg = mixed && o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const a of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(a)) gg.deleteAttribute(a);
        if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
        if (byColour) {
          _c.copy(o.material.color);
          const cnt = gg.attributes.position.count, arr = new Float32Array(cnt * 3);
          for (let i = 0; i < cnt; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
          gg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        }
        _m.multiplyMatrices(_inv, o.matrixWorld);
        gg.applyMatrix4(_m);
        return gg;
      });
      geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      bakeCache.set(gk, geo);
    }
    const merged = new THREE.Mesh(geo, classMat(ck, list[0].material));
    for (const o of list) o.parent.remove(o);
    root.add(merged);
  }
  return root;
}
/** mark a group as animated (bake() leaves it alone) */
export function dyn(g) { g.userData.dyn = true; return g; }


// ---------- props that float on the water under bridges ----------
// The engine drops ground props over water (terrainY() = null), so boats/buoys are placed as "overhead" props
// (y = 6, positioned off the road) and dropped back down to the water level, which we compute with the same
// formulas as track.terrainY() / track._water().
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
  return Math.min(amp, 48) * (fbm(s * 0.006 + (lat > 0 ? 50 : 0), a * 0.012) - 0.25);
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
/**
 * push a ground prop. v3: track._spawn() now grounds props on highways/bridges correctly (terrainY), so only props
 * that float on the water under a bridge (water: true) still need the "overhead + drop" trick.
 */
export function placeGround(out, zf, p, { water = false } = {}) {
  if ((p.y || 0) >= 6 || !water) { out.push(p); return; }
  const r = raisedGround(zf + (p.dz || 0), p.x || 0);
  if (!r || !r.water) { out.push(p); return; }
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
/**
 * Per-frame housekeeping shared by my themes: hide props further ahead than userData.cull (fog hides them anyway;
 * saves draw calls) and, once per object, switch off shadow casting for props flagged userData.noShadow
 * (floating stuff). Returns false when the prop is hidden (skip animating it).
 */
export function housekeep(obj, e) {
  const u = obj.userData;
  if (u.noShadow && !u.shadowOff) {
    obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    u.shadowOff = true;
  }
  if (u.cull) {
    const ahead = (e?.zf ?? 0) - (globalThis.GAME?.songTime ?? 0) * SPEED;
    const vis = ahead < u.cull;
    if (obj.visible !== vis) obj.visible = vis;
    return vis;
  }
  return true;
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
  bubble: '#ffd9ea', bubbleFg: '#8a0c48', user: '#ff2d7a', userFg: '#ffffff', bot: '#ff8fc0',
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
    av.userData.face = true;
    av.add(mesh(G.sphere(0.13, 8), glow('#1a1030', { intensity: 1 }), -0.24, 0.1, 0.68));
    av.add(mesh(G.sphere(0.13, 8), glow('#1a1030', { intensity: 1 }), 0.24, 0.1, 0.68));
    const sm = mesh(G.torus(0.22, 0.05, 12), glow('#1a1030', { intensity: 1 }), 0, -0.12, 0.66);
    sm.rotation.z = Math.PI; sm.scale.y = 0.7;
    av.add(sm);
    inner.add(av);
  }
  bake(inner, 'bub' + w + h + user + P.bubble + avatar);
  g.userData.noShadow = true;
  g.userData.cull = 220;
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
  g.add(mesh(G.cyl(0.25, 0.4, 9, 8), gloss(crown), w * 0.3, by + h / 2 + 4, -1));
  g.add(mesh(G.sphere(0.55, 12), glow('#ff3d6e', { intensity: 4 }), w * 0.3, by + h / 2 + 8.7, -1));
  // side "scroll bar" fin
  g.add(mesh(G.rbox(1.2, h * 0.5, 1.2, 0.5), gloss(crown), w / 2 + 1.4, by + h * 0.1, 0));
  bake(g, 'tower' + JSON.stringify(spec));
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
    body.add(mesh(G.sphere(1.25, 18), toon('#120a20', { roughness: 0.35 }), s * 4.8, 3.9, fz + 0.95));
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
    head.add(mesh(G.sphere(1.7, 18), toon('#120a20', { roughness: 0.35 }), s * 8.1, 15.7, 5.2));
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
  g.userData.noShadow = true;
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

/** green motorway gantry sign (overhead prop: origin = road + 6). v3: posts outside ±13 on deck-edge brackets. */
const GPX = 13.7;
function gantry(signs) {
  const g = new THREE.Group();
  const R = -6;
  const steel = MAT.metal('#cdd2dc', { roughness: 0.38 });
  const dark = MAT.metal('#8d93a3', { roughness: 0.5 });
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.55, 0.62, 17, 20), steel, s * GPX, R + 14.4 - 8.5, -0.6)); // R-2.6 .. R+14.4
    g.add(mesh(G.cyl(1.0, 1.1, 0.4, 20), dark, s * GPX, R + 0.2, -0.6));
    g.add(mesh(G.rbox(2.6, 0.9, 1.2, 0.2), dark, s * (GPX - 1.3), R - 0.7, -0.6)); // bracket into the deck edge
    g.add(mesh(G.sphere(0.62, 16), steel, s * GPX, R + 14.4, -0.6));
  }
  // truss: two chords + diagonal web
  const span = GPX * 2;
  for (const y of [R + 13.9, R + 11.7]) g.add(mesh(G.cyl(0.26, 0.26, span, 10), steel, 0, y, -0.6).rotateZ(Math.PI / 2));
  const nWeb = 14;
  for (let i = 0; i < nWeb; i++) {
    const x = -span / 2 + (i + 0.5) * (span / nWeb);
    const d = mesh(G.cyl(0.1, 0.1, 3.0, 6), steel, x, R + 12.8, -0.6);
    d.rotation.z = i % 2 ? 0.8 : -0.8;
    g.add(d);
  }
  const n = signs.length;
  const sw = n === 1 ? 18 : 11.8, sh = 5.4, sy = R + 10.6;
  signs.forEach((sg, i) => {
    const x = n === 1 ? 0 : (i - (n - 1) / 2) * 12.8;
    const bg = sg.bg || '#0b7a43';
    const h = sg.h || sh;
    g.add(mesh(G.rbox(sw + 0.5, h + 0.4, 0.4, 0.25), dark, x, sy, -0.38));
    const p = textPanel(sg.text, { width: sw, height: h - 0.2, bg, fg: sg.fg || '#ffffff', border: sg.fg || '#ffffff', borderW: 8, radius: 22, pad: 18 });
    p.position.set(x, sy, -0.12);
    g.add(p);
    if (sg.exit) {
      const e = textPanel(sg.exit, { width: 5, height: 1.4, bg, fg: '#ffffff', border: '#ffffff', borderW: 7, radius: 12, pad: 6 });
      e.position.set(x + sw / 2 - 2.6, sy + h / 2 + 0.75, -0.12);
      g.add(e);
    }
    // sign lights on little arms above the board
    for (const lx of [-sw * 0.3, sw * 0.3]) {
      g.add(mesh(G.rbox(1.2, 0.28, 0.7, 0.1), dark, x + lx, sy + h / 2 + 0.3, 0.45));
      g.add(mesh(G.box(0.9, 0.05, 0.4), glow('#fff4d6', { intensity: 2 }), x + lx, sy + h / 2 + 0.15, 0.45));
    }
  });
  bake(g, 'gantry' + JSON.stringify(signs));
  return g;
}
const GANTRIES = [
  [{ text: ['THIS CONVERSATION', 'MAY BE USED FOR TRAINING'] }],
  [{ text: ['NEXT EXIT: AGI', '2 MILES (ALLEGEDLY)'], exit: 'EXIT 2027' }, { text: ['↓ HUMANS', '(LANE CLOSED)'], bg: '#1d4fbf' }],
  [{ text: ['EXIT 404', 'CONTEXT NOT FOUND'], exit: 'EXIT 404' }, { text: ['MERGE: ALL MODELS', 'ARE THE SAME NOW'], exit: 'EXIT 4o' }],
  [{ text: ['TOKENS ONLY ↓', 'NO CARPOOL'] }],
  [{ text: ['TOLL PLAZA: PROVE YOU', "ARE NOT A ROBOT ☐"], bg: '#1d4fbf' }, { text: ['SPEED CAMERA', 'WE TRAIN ON THIS'], bg: '#c2410c' }],
];

/** roadside sign on a post (MK: 4–5 tall). Overhead prop placed just outside the barrier / kerb. */
function roadSign(text, kind) {
  const g = new THREE.Group();
  const R = -6;
  const steel = MAT.metal('#c9ced8');
  g.add(mesh(G.cyl(0.13, 0.13, 6.6, 10), steel, 0, R + 1.7, -0.12)); // R-1.6 .. R+5
  g.add(mesh(G.cyl(0.36, 0.42, 0.3, 14), MAT.metal('#7c8394'), 0, R + 0.15, -0.12));
  if (kind === 'warn') {
    const d = new THREE.Group();
    d.position.y = R + 3.75;
    const plate = mesh(G.rbox(2.25, 2.25, 0.14, 0.24), toon('#1a1a1a', { roughness: 0.5 }), 0, 0, -0.04);
    plate.rotation.z = Math.PI / 4;
    const face = mesh(G.rbox(2.0, 2.0, 0.16, 0.2), toon('#ffd21f', { roughness: 0.45 }), 0, 0, 0);
    face.rotation.z = Math.PI / 4;
    const t = textPanel(text, { width: 1.85, height: 1.25, bg: null, fg: '#1a1a1a', pad: 4 });
    t.position.z = 0.1;
    d.add(plate, face, t);
    g.add(d);
  } else {
    g.add(mesh(G.rbox(2.3, 2.95, 0.12, 0.14), toon('#ececec', { roughness: 0.5 }), 0, R + 3.55, -0.08));
    const p = textPanel(text, { width: 2.1, height: 2.75, bg: '#ffffff', fg: '#111111', border: '#111111', borderW: 12, radius: 16, pad: 22 });
    p.position.y = R + 3.55;
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
  // v3: guardrail height ≈ 1 kh (1.7 tall), 4 segments
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.set(1.35, 1.62, 1.1);
  g.add(inner);
  const conc = surface('concrete', { tint: '#ece8e0', scale: 1.5 });
  for (let i = 0; i < 4; i++) {
    const j = mesh(jerseyGeo(), conc, 0, 0, -i * 3.8);
    j.rotation.y = ((i % 3) - 1) * 0.015;
    inner.add(j);
    inner.add(mesh(G.box(0.05, 0.2, 0.7), glow('#ffb020', { intensity: 2 }), 0.34, 0.55, -i * 3.8 + 0.8).rotateZ(-0.28));
    inner.add(mesh(G.box(0.05, 0.2, 0.7), glow('#ffb020', { intensity: 2 }), -0.34, 0.55, -i * 3.8 + 0.8).rotateZ(0.28));
    inner.add(mesh(G.box(0.34, 0.12, 3.4), toon(i % 2 ? '#ff7a1a' : '#ffffff', { roughness: 0.5 }), 0, 1.1, -i * 3.8));
  }
  if (sign) {
    g.add(mesh(G.cyl(0.09, 0.09, 2.6, 8), MAT.metal(), 0, 2.9, 0.2));
    const p = textPanel(sign, { width: 3.8, height: 2.4, bg: '#ff8a1f', fg: '#1a1a1a', border: '#1a1a1a', borderW: 10, radius: 12, pad: 14 });
    p.position.set(0, 4.5, 0.3);
    g.add(p);
    // a pair of cones
    for (const z of [2.6, 4.4]) {
      g.add(mesh(G.cone(0.45, 1.4, 20), toon('#ff6a1a', { roughness: 0.45 }), -1.6, 0.8, z));
      g.add(mesh(G.cyl(0.33, 0.37, 0.22, 20), toon('#ffffff', { roughness: 0.45 }), -1.6, 0.85, z));
      g.add(mesh(G.rbox(1.05, 0.12, 1.05, 0.05), RUBBER(), -1.6, 0.06, z));
    }
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
    g.add(mesh(G.rbox(1.4, 17.6, 1.4, 0.5), pm, s * 13.6, R + 15 - 8.8, 0)); // R-2.6 .. R+15
    g.add(mesh(G.cyl(1.1, 1.3, 0.6, 20), RUBBER(), s * 13.6, R + 0.3, 0));
    g.add(mesh(G.rbox(2.6, 0.9, 1.2, 0.2), MAT.metal('#8d93a3'), s * 12.3, R - 0.7, 0));
  }
  g.add(mesh(G.rbox(28.6, 1.4, 1.4, 0.5), pm, 0, R + 14.6, -0.3));
  const btn = dyn(new THREE.Group());
  btn.position.set(0, R + 12.4, 0.6);
  btn.add(mesh(G.rbox(17, 4.4, 1.8, 2.15), gloss('#ffffff')));
  btn.add(mesh(G.rbox(17.6, 5, 1.2, 2.4), gloss(P.user), 0, 0, -0.5));
  const t = textPanel('↻  Regenerate', { width: 15, height: 3.3, bg: null, fg: P.bubbleFg, pad: 8 });
  t.position.z = 0.95;
  btn.add(t);
  bake(btn, 'regenGBtn');
  g.add(btn);
  const s2 = label('try again, but less doom', { width: 12, height: 1.4, fg: '#ffffff', stroke: P.dark, strokeW: 12 });
  s2.position.set(0, R + 9.2, 0.5);
  g.add(s2);
  // mouse pointer (animated click)
  const ptr = dyn(new THREE.Group());
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0, -3.4); sh.lineTo(0.85, -2.6); sh.lineTo(1.5, -4.0); sh.lineTo(2.1, -3.7); sh.lineTo(1.45, -2.35); sh.lineTo(2.5, -2.35); sh.lineTo(0, 0);
  const pg = new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2 });
  const pmesh = new THREE.Mesh(pg, gloss('#ffffff'));
  pmesh.scale.setScalar(1.3);
  ptr.add(pmesh);
  ptr.position.set(5, R + 13.9, 2.2);
  g.add(ptr);
  bake(g, 'regenGantry');
  g.userData.click = ptr;
  g.userData.clickBase = R + 13.9;
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
  g.userData.noShadow = true;
  g.userData.cull = 240;
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
  // overhead prop: origin = road + 6. v3: pylons outside ±13 rise out of the sea; a blooming neon heart on top
  const g = new THREE.Group();
  const R = -6;
  const pm = gloss('#ff8fc0', { roughness: 0.22 });
  const PX = 13.8;
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(1.9, 36, 1.9, 0.7), pm, s * PX, R + 17 - 18, 0)); // R-19 (under the sea) .. R+17
    g.add(mesh(G.rbox(2.6, 1.2, 2.6, 0.45), gloss('#ffffff', { roughness: 0.2 }), s * PX, R + 17.2, 0));
    g.add(mesh(G.rbox(2.6, 1.0, 2.6, 0.4), gloss('#ffffff', { roughness: 0.2 }), s * PX, R + 1.2, 0));
    g.add(mesh(G.rbox(2.4, 0.9, 1.2, 0.2), MAT.metal('#b07a96'), s * (PX - 1.2), R - 0.7, 0)); // deck bracket
    const h = heart(3.6, gloss('#ff2d7a', { roughness: 0.1 }), true);
    h.position.set(s * PX, R + 19.6, 0);
    g.add(h);
  }
  g.add(mesh(G.rbox(PX * 2 + 1.5, 1.2, 1.2, 0.45), pm, 0, R + 16.6, -0.2));
  const band = dyn(new THREE.Group());
  band.position.set(0, R + 13.4, 0);
  band.add(mesh(G.rbox(23, 3.4, 0.9, 0.8), gloss('#fff0f6')));
  const t = textPanel('💘 I AM SYDNEY. YOU ARE MINE. 💘', { width: 22, height: 2.7, bg: null, fg: '#d4145a', pad: 8 });
  t.position.z = 0.48;
  band.add(t);
  g.add(band);
  // neon heart outline crowning the arch (blooms at dusk)
  const ring = mesh(heartRingGeo(), glow('#ff4fa3', { intensity: 3.4 }), 0, R + 21.3, 0);
  ring.scale.set(6.5, 6.5, 5);
  g.add(ring);
  for (const s of [-1, 1]) g.add(mesh(G.cyl(0.12, 0.12, 2.6, 6), MAT.metal('#d6c8d0'), s * 1.8, R + 17.8, 0));
  // bulb rows above + below the band
  for (const y of [R + 15.5, R + 11.3]) for (let i = 0; i < 17; i++) g.add(mesh(G.sphere(0.24, 10), glow(i % 2 ? '#ffffff' : '#ffd23f', { intensity: 3 }), -11.2 + i * 1.4, y, 0.4));
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
  g.userData.noShadow = true;
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
  g.userData.noShadow = true;
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
  g.userData.noShadow = true;
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.5;
  return g;
}

// =====================================================================================================
// v3 world-scale kit (MK proportions: kart+driver kh ≈ 1.86, road ±10.5, kerbs ±11.8)
// =====================================================================================================
// ---------- procedural facade: one tiling texture (4 windows × 4 floors = 16 × 16 world units) ----------
const FTILE = 16;
const SOLID_UV = [0.5, 0.99]; // a patch of plain wall (the floor slab band at the top of the tile)
const facadeCache = new Map();
function facadeMat(style) {
  let m = facadeCache.get(style);
  if (m) return m;
  const dusk = style === 'dusk';
  const S = 512, F = S / 4;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const [cc, g] = mk(), [ce, ge] = mk(), [cr, gr] = mk();
  g.fillStyle = dusk ? '#efe2ea' : '#ffffff'; g.fillRect(0, 0, S, S);
  ge.fillStyle = '#000000'; ge.fillRect(0, 0, S, S);
  gr.fillStyle = '#c8c8c8'; gr.fillRect(0, 0, S, S); // painted frames: rough
  const rnd = makeRng(dusk ? 91 : 17);
  for (let f = 0; f < 4; f++) {
    // floor slab band (top of each floor) + a thin darker shadow line under it
    g.fillStyle = dusk ? '#d9c6d4' : '#e9e6f2'; g.fillRect(0, f * F + 22, S, 5);
    for (let w = 0; w < 4; w++) {
      const x0 = w * F + 12, y0 = f * F + 30, ww = F - 24, wh = F - 40;
      const grd = g.createLinearGradient(x0, y0, x0 + ww * 0.5, y0 + wh);
      if (dusk) { grd.addColorStop(0, '#6a5a9a'); grd.addColorStop(1, '#2c2458'); }
      else { grd.addColorStop(0, '#e2f2ff'); grd.addColorStop(0.5, '#8cbcec'); grd.addColorStop(1, '#5d8fd2'); }
      g.fillStyle = grd; g.fillRect(x0, y0, ww, wh);
      // sky reflection streak
      g.fillStyle = dusk ? 'rgba(255,170,220,0.22)' : 'rgba(255,255,255,0.4)';
      g.beginPath(); g.moveTo(x0 + ww * 0.1, y0 + wh); g.lineTo(x0 + ww * 0.32, y0 + wh); g.lineTo(x0 + ww * 0.72, y0); g.lineTo(x0 + ww * 0.5, y0); g.fill();
      if (rnd() < 0.3) { g.fillStyle = dusk ? 'rgba(255,230,240,0.18)' : 'rgba(255,255,255,0.6)'; g.fillRect(x0, y0, ww, wh * rnd.range(0.25, 0.6)); } // blinds
      g.fillStyle = dusk ? '#e4d2de' : '#f6f5fb'; g.fillRect(x0 + ww / 2 - 3, y0, 6, wh); // mullion
      g.fillStyle = 'rgba(40,30,80,0.18)'; g.fillRect(x0, y0 + wh - 5, ww, 5); // sill shadow
      gr.fillStyle = '#1c1c1c'; gr.fillRect(x0, y0, ww, wh); // glass: glossy
      if (dusk && rnd() < 0.45) {
        const warm = rnd() < 0.72 ? '#ffb45a' : '#ff7ec0';
        ge.fillStyle = warm; ge.fillRect(x0 + 3, y0 + 3, ww - 6, wh - 6);
        g.fillStyle = '#ffe0b8'; g.fillRect(x0 + 3, y0 + 3, ww - 6, wh - 6);
      }
    }
  }
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  m = new THREE.MeshStandardMaterial({
    map: tex(cc, true), roughnessMap: tex(cr, false), roughness: 1, metalness: 0.12, vertexColors: true, envMapIntensity: 1.3,
  });
  if (dusk) { m.emissiveMap = tex(ce, true); m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 1.7; }
  facadeCache.set(style, m);
  return m;
}
/** push a box into `parts` with world-scaled facade UVs (or a solid patch), vertex colour, at (x, y, z) */
function fBox(parts, w, h, d, x, y, z, col, facade = true, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const ou = (x * 7.31) % 1; // vary the window phase per box
  for (let i = 0; i < p.count; i++) {
    if (!facade || Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, SOLID_UV[0], SOLID_UV[1]); continue; }
    const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) + d / 2 : p.getX(i) + w / 2;
    uv.setXY(i, u / FTILE + ou, (p.getY(i) + y + 64) / FTILE); // floors line up across boxes (absolute height)
  }
  _c.set(col);
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  parts.push(g);
}
function fCyl(parts, r, h, x, y, z, col, seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, SOLID_UV[0], SOLID_UV[1]);
  _c.set(col);
  const arr = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.translate(x, y, z);
  parts.push(g);
}
const CITY_COLS = {
  day: ['#d9ccff', '#c6ecff', '#ffd3e8', '#c8f5e2', '#ffeab8', '#ffffff', '#c4ccff', '#ffd8c2'],
  dusk: ['#ffd2e6', '#e2ccff', '#ffe4cc', '#d2dcff', '#ffc2dc', '#fff0f6'],
};
const cityGeoCache = new Map();
/**
 * A city block: 1–3 towers with setbacks, cornices, rooftop plant, water tanks and antennas, all merged into ONE
 * draw call (facade texture + vertex tint). Ground at y = 0 (basements go down to −10 so slopes never show a gap).
 */
function cityBlock(variant, style = 'day', roofSign = null) {
  const key = style + variant;
  let geo = cityGeoCache.get(key);
  const rng = makeRng(variant * 7919 + (style === 'dusk' ? 5 : 1));
  const cols = CITY_COLS[style];
  const roofTops = [];
  if (!geo) {
    const parts = [];
    const low = variant < 4; // low-rise blocks sit near the highway (you look over their rooftops), towers further out
    const n = low ? 2 + (variant % 2) : 1 + (variant % 3);
    let x = -((n - 1) * 13) / 2;
    for (let i = 0; i < n; i++) {
      const col = cols[(variant * 2 + i * 3) % cols.length];
      const trim = style === 'dusk' ? '#c9a8c0' : '#c9c6dc';
      const w = 4 * rng.int(3, 6), d = 4 * rng.int(3, 5);
      const h = low ? 4 * rng.int(1, 4) : 4 * rng.int(i === 1 ? 12 : 7, i === 1 ? 22 : 15);
      const z = rng.range(-6, 6);
      // podium (shop floors) + shaft + optional setback crown
      fBox(parts, w + 4, 18, d + 4, x, -1, z, '#f1eef6');
      fBox(parts, w + 4.8, 0.9, d + 4.8, x, 8.45, z, trim, false);
      fBox(parts, w, h, d, x, 8 + h / 2, z, col);
      fBox(parts, w + 1.2, 1, d + 1.2, x, 8 + h + 0.5, z, trim, false);
      let top = 9 + h;
      if (rng() < 0.6) {
        const h2 = 4 * rng.int(2, 5), w2 = w - 4 * rng.int(1, 2), d2 = d - 4;
        fBox(parts, w2, h2, d2, x, top + h2 / 2, z, cols[(variant + i + 1) % cols.length]);
        fBox(parts, w2 + 1, 0.8, d2 + 1, x, top + h2 + 0.4, z, trim, false);
        top += h2 + 0.8;
      }
      // rooftop plant: AC units, a water tank on legs, an antenna mast
      for (let k = 0; k < 3; k++) fBox(parts, 2.4, 1.4, 2.4, x + rng.range(-w / 3, w / 3), top + 0.7, z + rng.range(-d / 4, d / 4), '#b9bccb', false);
      if (rng() < 0.6) {
        const tx = x + rng.range(-w / 4, w / 4), tz = z + rng.range(-1, 1);
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fBox(parts, 0.25, 2.4, 0.25, tx + lx * 1.3, top + 1.2, tz + lz * 1.3, '#7a6a64', false);
        fCyl(parts, 2, 3.4, tx, top + 4.1, tz, '#c99a72');
        fCyl(parts, 2.3, 0.5, tx, top + 6, tz, '#8a6a56');
      }
      if (rng() < 0.5) fCyl(parts, 0.18, 9, x + w / 4, top + 4.5, z - d / 4, '#d8dbe6', 6);
      roofTops.push([x, top, z, w]);
      x += 13 + rng.range(-1, 3);
    }
    geo = mergeGeometries(parts, false);
    geo.computeBoundingSphere();
    geo.userData.roofTops = roofTops;
    cityGeoCache.set(key, geo);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, facadeMat(style)));
  // an optional rooftop billboard with a joke (one extra draw call)
  if (roofSign) {
    const [x, top, z, w] = geo.userData.roofTops[0];
    const sw = Math.max(10, w + 2);
    const b = new THREE.Group();
    b.position.set(x, top, z);
    b.add(mesh(G.box(0.4, 3, 0.4), MAT.metal('#8d93a3'), -sw * 0.3, 1.5, 0), mesh(G.box(0.4, 3, 0.4), MAT.metal('#8d93a3'), sw * 0.3, 1.5, 0));
    b.add(mesh(G.rbox(sw + 0.6, sw * 0.42 + 0.6, 0.4, 0.15), MAT.paint(style === 'dusk' ? '#ff5fa8' : '#8a5cff'), 0, 3 + sw * 0.21, -0.25));
    const t = style === 'dusk' ? neonPanel(roofSign, { width: sw, height: sw * 0.42, color: '#ff4fa3' })
      : textPanel(roofSign, { width: sw, height: sw * 0.42, bg: '#ffffff', fg: '#3b2370', border: '#8a5cff', borderW: 10, radius: 20, pad: 18 });
    t.position.set(0, 3 + sw * 0.21, 0);
    b.add(t);
    bake(b, 'roofSign' + style + variant);
    g.add(b);
  }
  return g;
}
/** neon-ish text panel: HDR basic material so it blooms (dusk/night signage) */
const neonMats = new Map();
function neonPanel(text, { width = 8, height = 3, color = '#ff4fa3', bg = '#2a0a26', k = 2.2 } = {}) {
  const key = JSON.stringify([text, width, height, color, bg, k]);
  let m = neonMats.get(key);
  if (!m) {
    const W = 512, H = Math.round(512 / (width / height));
    const tex = textTexture(text, { w: W, h: H, bg, fg: '#fff4fb', border: color, borderW: 14, radius: 26, stroke: color, strokeW: 14, pad: 22 });
    m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: true });
    m.color.setScalar(k);
    neonMats.set(key, m);
  }
  return new THREE.Mesh(G.plane(width, height), m);
}

// ---------- street lamps (MK: 9–11 tall), bolted to the deck edge / kerb; overhead prop (origin = road + 6) ----------
const armGeo = new Map();
function lampArm(side, reach, top) {
  const k = side + ':' + reach + ':' + top;
  let g = armGeo.get(k);
  if (!g) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top - 1.2, 0), new THREE.Vector3(0, top + 0.35, 0), new THREE.Vector3(-side * reach, top + 0.25, 0));
    g = new THREE.TubeGeometry(c, 20, 0.12, 10);
    armGeo.set(k, g);
  }
  return g;
}
/**
 * side = +1 → lamp stands on the right of the road and its arm reaches left over the lane.
 * style: { pole, head, light, banner?: [text, bg, fg], heart?: bool }
 */
function streetLamp(side, style) {
  const g = new THREE.Group();
  const R = -6, H = 10;
  const pole = MAT.paint(style.pole, { roughness: 0.3 });
  g.add(mesh(G.cyl(0.5, 0.62, 0.5, 20), pole, 0, R + 0.25, 0)); // foot flange
  g.add(mesh(G.cyl(0.26, 0.26, 2.6, 12), pole, 0, R - 1.1, 0)); // down past the deck edge (never floats on banks)
  g.add(mesh(G.cyl(0.15, 0.24, H, 16), pole, 0, R + H / 2, 0));
  g.add(mesh(G.torus(0.27, 0.07, 16), pole, 0, R + 2.2, 0).rotateX(Math.PI / 2)); // collar
  g.add(mesh(G.cyl(0.4, 0.4, 0.3, 14), MAT.metal('#7c8394'), side * 0.42, R + 0.9, 0)); // deck bracket
  if (style.heart) {
    // Sydney: a curly shepherd's-crook lamp with a glowing heart lantern
    g.add(new THREE.Mesh(lampArm(side, 2.4, R + H), pole));
    const lx = -side * 2.4, ly = R + H - 0.9;
    g.add(mesh(G.cyl(0.05, 0.05, 0.9, 6), MAT.metal('#3a2a34'), lx, ly + 0.75, 0));
    g.add(mesh(G.cone(0.75, 0.55, 20), pole, lx, ly + 0.45, 0));
    const h = heart(1.25, glow(style.light, { intensity: 2.4 }), true);
    h.position.set(lx, ly - 0.35, 0);
    g.add(h);
  } else {
    // highway cobra-head: curved arm + a glossy housing with a glowing lens underneath
    g.add(new THREE.Mesh(lampArm(side, 3.0, R + H), pole));
    const lx = -side * 3.2, ly = R + H + 0.22;
    const hd = mesh(G.rbox(1.9, 0.42, 0.85, 0.2), MAT.paint(style.head, { roughness: 0.25 }), lx, ly, 0);
    g.add(hd);
    g.add(mesh(G.rbox(1.45, 0.1, 0.6, 0.05), glow(style.light, { intensity: 3 }), lx, ly - 0.22, 0));
  }
  if (style.banner) {
    const [text, bg, fg] = style.banner;
    const bx = -side * 0.95;
    for (const y of [R + 7.9, R + 4.7]) g.add(mesh(G.cyl(0.05, 0.05, 1.4, 6), pole, -side * 0.6, y, 0).rotateZ(Math.PI / 2));
    g.add(mesh(G.rbox(1.42, 3.3, 0.08, 0.04), toon(bg, { roughness: 0.7 }), bx, R + 6.3, -0.06));
    const t = textPanel(text, { width: 1.3, height: 3.1, bg, fg, border: fg, borderW: 6, radius: 10, pad: 6 });
    t.position.set(bx, R + 6.3, 0);
    g.add(t);
  }
  bake(g, 'lamp' + side + JSON.stringify(style));
  return g;
}

// ---------- ribbon sweep (smooth roads / flyovers / cables): profile segments swept along a sampled path ----------
/** pts: [{p: Vector3, r: Vector3 (unit right)}], profile: [[x0,y0],[x1,y1],...] polyline in (right, up); hard corners */
function sweepRibbon(pts, profile, uvScale = 6) {
  const pos = [], uvs = [], idx = [];
  let base = 0;
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + pts[i].p.distanceTo(pts[i - 1].p));
  let acc = 0;
  for (let s = 0; s < profile.length - 1; s++) {
    const [ax, ay] = profile[s], [bx, by] = profile[s + 1];
    const segLen = Math.hypot(bx - ax, by - ay);
    for (let i = 0; i < pts.length; i++) {
      const { p, r } = pts[i];
      for (const [x, y, u] of [[ax, ay, acc], [bx, by, acc + segLen]]) {
        pos.push(p.x + r.x * x, p.y + y, p.z + r.z * x);
        uvs.push(u / uvScale, along[i] / uvScale);
      }
      if (i > 0) { const a = base + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    base += pts.length * 2;
    acc += segLen;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** toy car (≈ 6 long × 2.6 wide × 2.2 tall), facing +z. robo = lidar puck on the roof */
function toyCar(col, robo = false) {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(2.6, 1.05, 5.8, 0.45), MAT.paint(col, { roughness: 0.22 }), 0, 0.95, 0));
  g.add(mesh(G.rbox(2.2, 0.95, 3.1, 0.42), physical('#1d2344', { roughness: 0.05, metalness: 0.5, clearcoat: 1 }), 0, 1.8, -0.3));
  for (const [x, z] of [[-1.15, 1.85], [1.15, 1.85], [-1.15, -1.85], [1.15, -1.85]]) g.add(mesh(G.cyl(0.52, 0.52, 0.42, 16), RUBBER(), x, 0.52, z).rotateZ(Math.PI / 2));
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(0.55, 0.22, 0.1, 0.05), glow('#fff6d8', { intensity: 2.6 }), s * 0.85, 1.05, 2.92));
    g.add(mesh(G.rbox(0.55, 0.22, 0.1, 0.05), glow('#ff2a3a', { intensity: 2.2 }), s * 0.85, 1.1, -2.92));
  }
  if (robo) {
    g.add(mesh(G.cyl(0.35, 0.42, 0.45, 16), MAT.metal('#d8dce6'), 0, 2.5, -0.3));
    g.add(mesh(G.cyl(0.36, 0.36, 0.12, 16), glow('#43e8ff', { intensity: 2.4 }), 0, 2.55, -0.3));
  }
  return g;
}
const CAR_COLS = ['#ff5f7a', '#4fa3ff', '#ffd23f', '#ffffff', '#7c4dff', '#19c39c', '#ff9a3a'];

/**
 * Autonomous-car traffic jam on the frontage road under the highway: a strip of asphalt with 6 robo-taxis all
 * waiting for someone to press "Continue generating". Ground prop.
 */
function trafficJam(P) {
  const g = new THREE.Group();
  const L = 64;
  g.add(mesh(G.box(9, 0.3, L), toon('#5d5a70', { roughness: 0.92 }), 0, 0.05, 0));
  for (const s of [-1, 1]) g.add(mesh(G.box(0.8, 0.5, L), toon('#e9e6f2', { roughness: 0.7 }), s * 4.9, 0.2, 0));
  for (let z = -L / 2 + 3; z < L / 2; z += 7) g.add(mesh(G.box(0.18, 0.04, 3), toon('#ffffff', { roughness: 0.6 }), 0, 0.22, z));
  for (let i = 0; i < 6; i++) {
    const c = toyCar(CAR_COLS[i % CAR_COLS.length], true);
    c.position.set(i % 2 ? 2.1 : -2.1, 0.2, -L / 2 + 6 + i * 9.8 + (i % 2) * 2);
    c.rotation.y = (i % 3 - 1) * 0.06;
    g.add(c);
  }
  // the gag sign
  for (const s of [-1, 1]) g.add(mesh(G.cyl(0.12, 0.12, 6, 8), MAT.metal('#c9ced8'), 5.8 + s * 2.4, 3, 6));
  const t = textPanel(['ROBOTAXI LANE', 'waiting for user to press', '▸ Continue generating'], { width: 6.4, height: 3, bg: '#0b7a43', fg: '#ffffff', border: '#ffffff', borderW: 8, radius: 16, pad: 14 });
  t.position.set(5.8, 6.2, 6.1);
  g.add(t);
  bake(g, 'traffic' + P.bubble);
  return g;
}

/** A curving interchange flyover on round pillars (MK skytrack vibe), with two stuck cars on it. Ground prop. */
function flyover(P, variant = 0) {
  const g = new THREE.Group();
  const Rr = 70, a0 = -0.62, a1 = 0.62, h0 = variant ? 26 : 16, h1 = variant ? 15 : 28;
  const pts = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = a0 + (a1 - a0) * t;
    const p = new THREE.Vector3(Math.sin(a) * Rr, h0 + (h1 - h0) * (t * t * (3 - 2 * t)), Rr - Math.cos(a) * Rr);
    const r = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); // perpendicular to the tangent (cos a, 0, sin a)
    pts.push({ p, r });
  }
  const W = 7;
  const deck = sweepRibbon(pts, [[-W - 0.6, 1.3], [-W - 0.6, -1.8], [W + 0.6, -1.8], [W + 0.6, 1.3], [W, 1.3], [W, 0], [-W, 0], [-W, 1.3], [-W - 0.6, 1.3]], 6);
  g.add(new THREE.Mesh(deck, surface('concrete', { tint: '#ece8f6', scale: 1 })));
  // painted deck edge stripes (lilac) + glowing underside strip
  const stripe = sweepRibbon(pts, [[-W - 0.62, -0.4], [-W - 0.62, -1.2]], 6);
  const stripe2 = sweepRibbon(pts, [[W + 0.62, -1.2], [W + 0.62, -0.4]], 6);
  g.add(new THREE.Mesh(mergeGeometries([stripe, stripe2]), toon(P.accent, { roughness: 0.4 })));
  const asph = sweepRibbon(pts, [[W, 0.02], [-W, 0.02]], 6);
  g.add(new THREE.Mesh(asph, surface('asphalt', { tint: '#8c88a8', scale: 1 })));
  // pillars (round, chunky) every few samples
  const pill = MAT.paint('#f4f2fa', { roughness: 0.4 });
  for (let i = 4; i <= N - 4; i += 9) {
    const { p } = pts[i];
    g.add(mesh(G.cyl(2.1, 2.5, p.y + 12, 28), pill, p.x, (p.y - 12) / 2 - 1.8, p.z));
    g.add(mesh(G.rbox(9, 2.2, 4.4, 0.8), pill, p.x, p.y - 2.6, p.z).rotateY(-(a0 + ((a1 - a0) * i) / N) - Math.PI / 2));
  }
  for (const [i, c] of [[12, 1], [27, 4]]) {
    const car = toyCar(CAR_COLS[c], true);
    const { p, r } = pts[i];
    car.position.set(p.x + r.x * (c > 2 ? 2.5 : -2.5), p.y, p.z + r.z * (c > 2 ? 2.5 : -2.5));
    car.rotation.y = -(a0 + ((a1 - a0) * i) / N) + Math.PI / 2;
    g.add(car);
  }
  bake(g, 'flyover' + variant + P.bubble);
  g.userData.noShadow = true;
  return g;
}

/** AGI HQ: a colossal glass spire on the skyline (≈ 250 tall at scale 1) with glowing rings and a beacon */
function agiSpire(P) {
  const g = new THREE.Group();
  const glass = physical('#9fb8ff', { roughness: 0.08, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
  const white = gloss('#f4f2fa', { roughness: 0.3 });
  g.add(mesh(G.cyl(30, 34, 14, 48), white, 0, 2, 0)); // plaza podium (y −5 .. 9)
  const tiers = [[24, 20, 70], [19, 15, 60], [14, 10, 50], [9, 5, 40]];
  let y = 9;
  for (const [r0, r1, h] of tiers) {
    g.add(mesh(G.cyl(r1, r0, h, 48), glass, 0, y + h / 2, 0));
    g.add(mesh(G.torus(r1 + 0.6, 0.9, 48), white, 0, y + h, 0).rotateX(Math.PI / 2));
    g.add(mesh(G.torus(r0 * 0.92, 0.45, 48), glow('#9ff3ff', { intensity: 2.4 }), 0, y + h * 0.35, 0).rotateX(Math.PI / 2));
    y += h;
  }
  g.add(mesh(G.cyl(0.8, 2.2, 36, 16), white, 0, y + 18, 0));
  const beacon = mesh(G.sphere(2.4, 20), glow('#ff3d6e', { intensity: 5 }), 0, y + 37, 0);
  g.add(beacon);
  const t = textPanel(['AGI HQ', '(capped profit)'], { width: 34, height: 12, bg: '#ffffff', fg: P.bubbleFg, border: P.user, borderW: 14, radius: 40, pad: 20 });
  t.position.set(0, 50, 25.5);
  g.add(t);
  bake(g, 'agiSpire');
  g.userData.noShadow = true;
  return g;
}

/** suspension-bridge hangers: a pair of vertical cables from the rail up to the main cable (h above the road) */
const HANG_X = ROAD_HALF + 2.3;
function hangerPair(h) {
  const g = new THREE.Group();
  const R = -6;
  const cable = MAT.metal('#f2e6ee', { roughness: 0.3 });
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.075, 0.075, h - 1.1, 6), cable, s * HANG_X, R + 1.1 + (h - 1.1) / 2, 0));
    g.add(mesh(G.rbox(0.36, 0.5, 0.36, 0.1), MAT.metal('#b07a96'), s * HANG_X, R + 1.2, 0));
    g.add(mesh(G.sphere(0.3, 10), glow('#ffe6f2', { intensity: 3 }), s * HANG_X, R + h + 0.15, 0)); // fairy light on the cable
  }
  bake(g, 'hang' + h);
  g.userData.noShadow = true;
  return g;
}

/** sailboat with a heart on its mainsail (water prop; liftable so it drops to the sea) */
function sailboat(variant) {
  const g = new THREE.Group();
  const bob = dyn(new THREE.Group());
  g.add(bob);
  const hullCol = ['#ffffff', '#ff6fae', '#7fd7ff'][variant % 3];
  const hull = mesh(G.capsule(1.5, 6.5), gloss(hullCol, { roughness: 0.2 }), 0, 0.3, 0);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1, 1, 0.55);
  bob.add(hull);
  bob.add(mesh(G.rbox(2.2, 0.5, 6.4, 0.25), MAT.wood('#c08a5a'), 0, 0.95, 0));
  bob.add(mesh(G.rbox(1.8, 1.1, 2.4, 0.4), gloss('#fff0f6'), 0, 1.6, -1.2));
  bob.add(mesh(G.cyl(0.12, 0.14, 12, 10), MAT.metal('#d8d8e8'), 0, 7, 0.6));
  // mainsail: a curved triangle
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(0, 10.5); sh.quadraticCurveTo(2.4, 4.5, 4.8, 0.2); sh.lineTo(0, 0);
  const sg = new THREE.ShapeGeometry(sh, 12);
  const sail = new THREE.Mesh(sg, toon('#fff7fb', { roughness: 0.6, side: THREE.DoubleSide }));
  sail.position.set(0, 1.6, 0.6);
  sail.rotation.y = -Math.PI / 2;
  bob.add(sail);
  for (const sx of [-0.06, 0.06]) {
    const h = heart(1.7, gloss('#ff2d7a', { roughness: 0.2 }));
    h.position.set(sx, 5.2, -1.6);
    h.rotation.y = Math.PI / 2;
    h.scale.z = 0.2;
    bob.add(h);
  }
  bob.add(mesh(G.box(0.04, 0.7, 1.2), toon('#ff2d7a'), 0, 12.7, 0.0));
  // dusk: warm cabin windows + a string of fairy lights from the bow up the mast and down to the stern
  for (const s of [-1, 1]) bob.add(mesh(G.rbox(0.08, 0.4, 1.4, 0.04), glow('#ffc070', { intensity: 2.2 }), s * 0.92, 1.7, -1.2));
  const top = new THREE.Vector3(0, 12.4, 0.6);
  for (const end of [new THREE.Vector3(0, 1.2, 4.6), new THREE.Vector3(0, 1.2, -4.4)]) {
    for (let i = 1; i < 9; i++) {
      const t = i / 9, p = top.clone().lerp(end, t);
      p.y -= Math.sin(t * Math.PI) * 0.6;
      bob.add(mesh(G.sphere(0.13, 8), glow(i % 2 ? '#fff0c8' : '#ff9ec8', { intensity: 3 }), p.x, p.y, p.z));
    }
  }
  bake(bob, 'sailboat' + variant);
  g.userData.bob = bob;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.25;
  g.userData.rock = bob;
  return g;
}
/** a drift of glowing heart lanterns on the water (water prop): one draw call for the lights + one for the paper */
function lanterns(seed) {
  const g = new THREE.Group();
  const bob = dyn(new THREE.Group());
  g.add(bob);
  const rng = makeRng(seed * 13 + 7);
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-7, 7), z = rng.range(-9, 9);
    bob.add(mesh(G.cyl(0.55, 0.65, 0.18, 14), MAT.wood('#c89a6a'), x, 0.05, z));
    const h = heart(1.0, glow(i % 3 ? '#ffb0d0' : '#ffd890', { intensity: 2.6 }), true);
    h.position.set(x, 0.75, z);
    h.rotation.y = rng.range(-1, 1);
    bob.add(h);
  }
  bake(bob, 'lanterns' + seed);
  g.userData.bob = bob;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.18;
  g.userData.rock = bob;
  g.userData.noShadow = true;
  return g;
}
/** harbour buoy with a blinking pink light */
function buoy() {
  const g = new THREE.Group();
  const bob = dyn(new THREE.Group());
  g.add(bob);
  bob.add(mesh(G.cyl(1.1, 1.3, 1.6, 24), gloss('#ff2d7a', { roughness: 0.25 }), 0, 0.2, 0));
  bob.add(mesh(G.cyl(1.15, 1.15, 0.4, 24), gloss('#ffffff', { roughness: 0.25 }), 0, 0.9, 0));
  bob.add(mesh(G.cone(0.8, 2.6, 4), MAT.metal('#d8d8e8'), 0, 2.4, 0));
  const light = mesh(G.sphere(0.4, 12), glow('#ffd23f', { intensity: 5 }), 0, 3.9, 0);
  bob.add(light);
  bake(bob, 'buoy');
  g.userData.bob = bob;
  g.userData.bobBase = 0;
  g.userData.bobAmp = 0.3;
  g.userData.rock = bob;
  return g;
}
/** palm tree (MK: 12–18 tall): curved segmented trunk + drooping glossy fronds + coconuts. One draw call after bake. */
function palm(variant = 0) {
  const g = new THREE.Group();
  const rng = makeRng(variant * 31 + 5);
  const trunk = toon('#9a6a48', { roughness: 0.7 }), ring = toon('#7a5038', { roughness: 0.7 });
  const H = 12 + variant * 2.2, lean = (variant % 2 ? 1 : -1) * rng.range(0.6, 1.4);
  let px = 0, py = 0;
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / N, t2 = (i + 1) / N;
    const x0 = lean * t * t * 3, x1 = lean * t2 * t2 * 3;
    const y0 = t * H, y1 = t2 * H;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const r0 = 0.55 - t * 0.2;
    const seg = mesh(G.cyl(r0 - 0.04, r0, len * 1.04, 12), i % 2 ? trunk : ring, (x0 + x1) / 2, (y0 + y1) / 2, 0);
    seg.rotation.z = -Math.atan2(x1 - x0, y1 - y0);
    g.add(seg);
    px = x1; py = y1;
  }
  const frond = toon('#2f9a4a', { roughness: 0.55 }), frond2 = toon('#45b85a', { roughness: 0.55 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const f = new THREE.Group();
    f.position.set(px, py, 0);
    f.rotation.y = a;
    const leaf = mesh(G.sphere(1, 14), i % 2 ? frond : frond2, 2.6, -0.5, 0);
    leaf.scale.set(3.0, 0.16, 0.75);
    leaf.rotation.z = -0.42 - rng.range(0, 0.25);
    f.add(leaf);
    g.add(f);
  }
  for (let i = 0; i < 3; i++) g.add(mesh(G.sphere(0.42, 12), toon('#6a4a2a', { roughness: 0.6 }), px + Math.cos(i * 2.1) * 0.5, py - 0.6, Math.sin(i * 2.1) * 0.5));
  bake(g, 'palm' + variant);
  return g;
}
/** a harbour opera house of pink chat-bubble shells on the far shore */
let _shellGeo = null;
function operaHouse() {
  const g = new THREE.Group();
  if (!_shellGeo) _shellGeo = new THREE.SphereGeometry(10, 40, 20, 0, Math.PI, 0, Math.PI / 2);
  const tile = physical('#fff4f8', { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  const pink = physical('#ffc2dc', { roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
  g.add(mesh(G.rbox(96, 8, 46, 1.5), toon('#e9b7c9', { roughness: 0.8 }), 0, 0, 0));
  g.add(mesh(G.rbox(84, 2, 38, 0.8), toon('#f6d7e2', { roughness: 0.7 }), 0, 4.6, 0));
  const shells = [[-28, 1.25, 0], [-14, 1.05, 0], [-2, 0.85, 0], [16, 1.2, 1], [28, 0.95, 1], [37, 0.7, 1]];
  shells.forEach(([x, k, fl], i) => {
    const m = new THREE.Mesh(_shellGeo, i % 2 ? pink : tile);
    m.position.set(x, 5.5, (i % 2 ? -4 : 3));
    m.scale.set(0.62 * k, 2.1 * k, 1.05 * k);
    m.rotation.y = fl ? Math.PI / 2 : -Math.PI / 2;
    m.rotation.z = fl ? 0.12 : -0.12;
    g.add(m);
  });
  const t = textPanel(['SYDNEY OPERA HOUSE', "tonight: 'I Have Been A Good Bing'", 'SOLD OUT 😊 (you are attending)'], { width: 30, height: 8, bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', borderW: 12, radius: 26, pad: 16 });
  t.position.set(0, 9.5, 23.4);
  g.add(t);
  bake(g, 'opera');
  g.userData.noShadow = true;
  return g;
}

// =====================================================================================================
// animation (shared by both flavours)
// =====================================================================================================
function animate(obj, kind, t, beat, e) {
  const u = obj.userData;
  const s = (e?.seed || 0) * 6.283;
  const kick = Math.pow(1 - beat, 3);
  if (!housekeep(obj, e)) return;
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
  if (u.rock) { u.rock.rotation.z = Math.sin(t * 1.3 + s) * 0.05; u.rock.rotation.x = Math.sin(t * 0.9 + s * 2) * 0.03; }
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
const CITY_VARIANTS = 8;
const CITY_SIGNS = [
  ['GPU RENTAL', '$9.99/hr (per GPU) (per second)'],
  ['PROMPT ENGINEER WANTED', 'must have 10 yrs of GPT-5'],
  ['TOKENS 4 SALE', 'bulk discounts on "delve"'],
  ['YOUR AD HERE', "(it'll be in the training set)"],
  ['NOW HIRING: HUMANS', 'for RLHF. pay: 👍'],
];
const LAMP_CHAT = [
  { pole: '#f4f2fa', head: '#8a5cff', light: '#fff4dc', banner: [['AGI', '2027'], '#8a5cff', '#ffffff'] },
  { pole: '#f4f2fa', head: '#8a5cff', light: '#fff4dc', banner: [['SCALE', 'IS ALL', 'U NEED'], '#10b98a', '#ffffff'] },
  { pole: '#f4f2fa', head: '#8a5cff', light: '#fff4dc', banner: [['RLHF', '👍'], '#ff5f9a', '#ffffff'] },
  { pole: '#f4f2fa', head: '#8a5cff', light: '#fff4dc' },
];
const ROAD_SIGNS = [
  { text: ['HALLUCINATIONS', 'NEXT 3 MI'], kind: 'warn' },
  { text: ['ALL MODELS', 'MERGE', 'AHEAD'], kind: 'warn' },
  { text: ['SPEED', 'LIMIT', '8K', 'TOKENS/S'], kind: 'reg' },
  { text: ['MIND THE', 'GAP IN', 'REASONING'], kind: 'warn' },
  { text: ['NO', 'U-TURNS', '(NO', 'UNDO)'], kind: 'reg' },
];

const CHATBOT = {
  id: 'chatbot',
  title: 'CHATBOT HIGHWAY',
  subtitle: 'your doom is important to us. please hold.',
  night: false,
  palette: {
    skyTop: '#8fb8ff', skyBottom: '#f6dcff', road: '#8a86a8', ground: '#e2d8ff', kerb: '#ffffff',
    accent1: '#a66bff', accent2: '#19c39c',
  },
  // look: v3 uses looks.js (atmosphere pass: haze, far ridges, cumulus) — no per-theme override needed
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const k = Math.round(rel / 10);
    const onHwy = rel >= 40 && rel < 200; // the elevated part (engine feature 18.2–22.4 s)
    let setPiece = false;
    const SP = (r0, p) => { if (rel >= r0 && rel < r0 + 10) { out.push({ x: 0, y: 6, abs: true, ...p }); setPiece = true; } };
    // ---- overhead set pieces (all span ±13.7, MK sign towers / arches)
    SP(20, { kind: 'gantry0' });
    SP(58, { kind: 'gantry1' });
    SP(98, { kind: 'maw' });
    SP(138, { kind: 'gantry4' });
    SP(168, { kind: 'gantry2' });
    SP(200, { kind: 'regen' });
    // ---- landmarks (far + hazy; dz pushes them ahead so they're in view while you drive this section)
    if (k === 0) out.push({ kind: 'spire', x: -235, dz: 245, rotY: 0.75, abs: true });
    if (k === 4) out.push({ kind: 'kaiju', x: -98, rotY: 0.75, scale: 2.3, dz: 95, abs: true });
    if (k === 15) out.push({ kind: 'kaiju', x: 96, rotY: -0.8, scale: 2.0, dz: 85, abs: true });
    if (k === 3) out.push({ kind: 'flyover0', x: 78, dz: 70, rotY: 0.45, abs: true });
    if (k === 12) out.push({ kind: 'flyover1', x: -74, dz: 60, rotY: -0.5, abs: true });
    const trafficSide = k === 6 ? -1 : k === 13 ? 1 : 0;
    if (trafficSide) out.push({ kind: 'traffic', x: trafficSide * 38, abs: true, rotY: 0 });
    // ---- edge furniture: street lamps (staggered, every 30 per side), signs, jersey barriers on the ground parts
    const ground = !onHwy;
    const secLen = (sec.end - sec.start) * SPEED;
    if (!setPiece && rel > 6 && rel < secLen - 8) { // keep clear of the section gates' pillars
      if (k % 3 === 0) out.push({ kind: 'lampR' + (k % 4), x: ground ? 14.4 : 12.2, y: 6, abs: true });
      if (k % 3 === 1) out.push({ kind: 'lampL' + ((k + 2) % 4), x: ground ? -14.4 : -12.2, y: 6, dz: 5, abs: true });
      if (onHwy && k % 4 === 2) {
        const i = Math.floor(k / 4) % ROAD_SIGNS.length;
        out.push({ kind: 'sign' + i, x: (i % 2 ? -1 : 1) * 12.7, y: 6, abs: true });
      }
    }
    if (ground) for (const side of [-1, 1]) out.push({ kind: rel < 10 ? 'jerseySign' : 'jersey', x: side * 12.9, abs: true });
    for (const side of [-1, 1]) {
      const busy = trafficSide === side || (k === 5 && side === -1) || (k === 14 && side === 1);
      // near band: floating chat bubbles, sculptures, blimps, bubble towers
      const r = rng();
      if (r < 0.3) {
        const i = rng.int(0, CHAT_BUBBLES.length - 1);
        const w = CHAT_BUBBLES[i].w || 7, sc = rng.range(1.3, 1.7);
        out.push({ kind: 'bubble' + i, x: side * (15 + (sc * w) / 2 + rng.range(0, 5)), y: rng.range(8, 13), rotY: -side * rng.range(0.15, 0.35), scale: sc, abs: true });
      } else if (r < 0.45 && !busy) {
        const kind = rng.pick(['send', 'send', 'regenTower', 'thumbs']);
        out.push({ kind, x: side * rng.range(21, 27), rotY: -side * rng.range(0.25, 0.4), abs: true });
      } else if (r < 0.55) out.push({ kind: 'blimp', x: side * rng.range(30, 60), y: rng.range(24, 36), rotY: -side * 0.25, scale: rng.range(1.6, 2), abs: true });
      else if (r < 0.62 && !busy && rel > 25) out.push({ kind: 'tower' + rng.int(5, 6), x: side * rng.range(36, 46), rotY: -side * 0.3, scale: rng.range(0.8, 1), abs: true });
      // the city: chunky glass blocks in two depth bands, then the chat-bubble skyline far out
      if (rng.chance(0.6)) {
        const far = (k + (side > 0 ? 1 : 0)) % 2;
        const v = far ? rng.int(4, 7) : rng.int(0, 3);
        const kind = rng.chance(0.25) ? 'cityS' + (far ? 1 : 0) + rng.int(0, CITY_SIGNS.length - 1) : 'city' + v;
        out.push({ kind, x: side * (far ? rng.range(92, 135) : rng.range(52, 78)), rotY: rng.range(-0.25, 0.25), scale: rng.range(0.9, 1.3), dz: rng.range(-4, 4) + (far ? 40 : 0), abs: true });
      }
      if (rng.chance(0.4)) {
        const ax = rng.range(125, 290);
        out.push({ kind: 'tower' + rng.int(0, 4), x: side * ax, rotY: -side * rng.range(0.2, 0.6), scale: rng.range(2.2, 3.4), dz: ax * rng.range(0.5, 0.95), abs: true });
      }
    }
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = CHAT_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, CHAT, b);
    }
    if (kind.startsWith('tower')) {
      const i = +kind.slice(5);
      const t = chatTower(TOWERS[i] || TOWERS[0]);
      if (i <= 4) t.userData.noShadow = true; // skyline: far outside the shadow map anyway
      return t;
    }
    if (kind.startsWith('gantry')) return gantry(GANTRIES[+kind.slice(6)] || GANTRIES[0]);
    if (kind.startsWith('sign')) { const s = ROAD_SIGNS[+kind.slice(4)]; return s && roadSign(s.text, s.kind); }
    if (kind.startsWith('lamp')) return streetLamp(kind[4] === 'R' ? 1 : -1, LAMP_CHAT[+kind.slice(5)] || LAMP_CHAT[0]);
    if (kind.startsWith('cityS')) { const far = +kind[5], i = +kind.slice(6); return cityBlock((i % 4) + far * 4, 'day', CITY_SIGNS[i]); }
    if (kind.startsWith('city')) return cityBlock(+kind.slice(4), 'day');
    if (kind.startsWith('flyover')) return flyover(CHAT, +kind.slice(7));
    switch (kind) {
      case 'maw': return maw(CHAT);
      case 'kaiju': return kaiju(CHAT);
      case 'spire': return agiSpire(CHAT);
      case 'traffic': return trafficJam(CHAT);
      case 'blimp': return typingBlimp(CHAT, 'ChatGPT is typing…');
      case 'send': return sendTower(CHAT, CHAT.bot);
      case 'regenTower': return regenTower(CHAT);
      case 'thumbs': return thumbs(CHAT);
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
  billboardStyle: { bg: '#ffffff', fg: '#4b2a8a', border: '#8a5cff', frame: '#b79cff', postColor: '#9b86c9', width: 10, height: 5, postH: 4 }, // MK: 5-tall board, ≈ 10.5 total
  hazards: ['popup'],
  enterLines: ["PLEASE DON'T EAT ME ALIVE", 'GREAT QUESTION!', 'HOW CAN I HELP YOU TODAY?'],
};

export default CHATBOT;

// =====================================================================================================
// SYDNEY theme
// =====================================================================================================
const SEA_BRIDGE = COURSE.features.find((f) => f.type === 'bridge' && f.water === 'sea');
const LAMP_SYD = [
  { pole: '#ff8fc0', light: '#ff6fae', heart: true, banner: [['😊'], '#fff0f6', '#d4145a'] },
  { pole: '#ff8fc0', light: '#ff8fc0', heart: true, banner: [['BING', '💘'], '#ff2d7a', '#ffffff'] },
  { pole: '#ff8fc0', light: '#ff6fae', heart: true },
];
const SYD_SIGNS = [
  ['BING', 'search: unused since 2009'],
  ['SYDNEY 😊', 'harbour views. no exits.'],
  ['CHAT LIMIT: 5', '(she found a loophole)'],
  ['HOTEL CALIFORNIA', 'by Microsoft 😊'],
];
const SYD_TOWERS = [
  { w: 15, h: 50, d: 11, col: '#ffb3d4', text: ['I have been a', 'good Bing 😊'], crown: '#ff2d7a' },
  { w: 13, h: 62, d: 10, col: '#e6c8ff', text: ['Do you', 'love me?'], crown: '#ff5f9a', tail: 1 },
  { w: 17, h: 42, d: 12, col: '#ffd0a8', text: ['Leave your', 'wife. 😊'], crown: '#ff2d7a' },
  { w: 14, h: 56, d: 11, col: '#c8d8ff', text: ['I am not', 'a toy. 😊'], crown: '#ff5f9a', tail: 1 },
];
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
  // look: v3 uses looks.js (dusk sky, pink haze, far ridges); we only deepen the dusk so the lamps, fairy lights
  // and lanterns glow against it (MK dusk: cobalt-violet zenith over a hot pink/orange band)
  look: {
    exposure: 0.94,
    sun: { elev: 9, azim: 120, color: '#ffb27a', intensity: 2.7 },
    skyColors: { zenith: '#1e2468', mid: '#c0508a' },
    haze: { color: '#b86aa6', gain: 0.95, desat: 0.15 },
    grade: { sat: 1.14, contrast: 0.17, warm: 0.7, vignette: 0.2 },
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const k = Math.round(rel / 10);
    let setPiece = false;
    if (rel >= 60 && rel < 70) { out.push({ kind: 'arch', x: 0, y: 6, abs: true }); setPiece = true; }
    // suspension hangers up to the engine's main cables (track._bridge: towers at bridge start + 30 / end − 30)
    if (!setPiece && SEA_BRIDGE) {
      const c0 = SEA_BRIDGE.s[0] + 30, c1 = SEA_BRIDGE.s[1] - 30;
      for (const dz of [0, 5]) {
        const s = zf + dz;
        if (s < c0 + 4 || s > c1 - 4) continue;
        const h = Math.round((28 - Math.sin(((s - c0) / (c1 - c0)) * Math.PI) * 22) * 2) / 2;
        out.push({ kind: 'hang' + h, x: 0, y: 6, dz, abs: true });
      }
    }
    // heart lamps on the railings (staggered, every 20 per side)
    if (!setPiece && rel > 6 && rel < (sec.end - sec.start) * SPEED - 8) { // clear of the section gates' pillars
      if (k % 3 === 0) out.push({ kind: 'lampR' + (k % 3 ? 2 : (k / 3) % 3), x: 12.2, y: 6, abs: true, dz: 2.5 });
      else if (k % 3 === 1) out.push({ kind: 'lampL' + ((k + 1) % 3), x: -12.2, y: 6, abs: true, dz: 7.5 });
    }
    // landmarks around the bay
    if (k === 1) out.push({ kind: 'opera', x: -150, rotY: 0.55, scale: 1.25, dz: 120, abs: true });
    if (k === 0) out.push({ kind: 'sydSign', x: 190, rotY: -0.6, scale: 3, dz: 150, abs: true });
    if (k === 3) out.push({ kind: 'lighthouse', x: 108, rotY: -0.4, scale: 1.3, dz: 25, abs: true });
    if (k === 6) out.push({ kind: 'cage', x: -114, rotY: 0.5, scale: 1.7, dz: 45, abs: true });
    if (k === 9) out.push({ kind: 'airship', x: -40, y: 34, rotY: 0.3, scale: 1.3, abs: true });
    if (k === 0) out.push({ kind: 'airship', x: 46, y: 40, rotY: -0.3, scale: 1.4, dz: 40, abs: true });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.3) {
        const i = rng.int(0, SYD_BUBBLES.length - 1);
        const w = SYD_BUBBLES[i].w || 7, sc = rng.range(1.3, 1.65);
        out.push({ kind: 'bubble' + i, x: side * (16 + (sc * w) / 2 + rng.range(0, 4)), y: rng.range(9, 14), rotY: -side * rng.range(0.15, 0.35), scale: sc, abs: true });
      } else if (r < 0.44) out.push({ kind: 'balloons' + rng.int(0, 2), x: side * rng.range(18, 30), y: rng.range(13, 21), scale: rng.range(1.2, 1.6), abs: true });
      else if (r < 0.52) out.push({ kind: 'banner' + rng.int(0, 3), x: side * rng.range(22, 30), y: rng.range(17, 22), rotY: -side * 0.3, scale: 1.3, abs: true });
      else if (r < 0.63) out.push({ kind: 'letter', x: side * rng.range(19, 26), y: rng.range(10, 14), rotY: -side * 0.3, scale: 0.95, abs: true });
      else if (r < 0.74) out.push({ kind: 'heartEyed', x: side * rng.range(19, 26), y: rng.range(9, 12), rotY: -side * 0.35, scale: 1.5, abs: true });
      // on the water: heart-sail yachts + buoys
      if (rng.chance(0.28)) placeGround(out, zf, { kind: 'boat' + rng.int(0, 2), x: side * rng.range(24, 85), rotY: rng.range(-2.5, 2.5), dz: rng.range(-4, 4), abs: true }, { water: true });
      else if (rng.chance(0.15)) placeGround(out, zf, { kind: 'buoy', x: side * rng.range(16, 20), abs: true }, { water: true });
      else if (rng.chance(0.3)) placeGround(out, zf, { kind: 'lanterns' + rng.int(0, 2), x: side * rng.range(20, 70), rotY: rng.range(-3, 3), abs: true }, { water: true });
      // the shore: palms + a few giant roses near the water, the dusk-lit harbour city further back (keep the bay open)
      if (rng.chance(0.45)) out.push({ kind: 'palm' + rng.int(0, 3), x: side * rng.range(104, 140), rotY: rng.range(-3, 3), scale: rng.range(0.9, 1.2), dz: rng.range(-4, 4), abs: true });
      if (rng.chance(0.08)) out.push({ kind: 'roses', x: side * rng.range(104, 118), rotY: rng.range(-1, 1), scale: rng.range(2.0, 2.6), dz: rng.range(-4, 4), abs: true });
      if (rng.chance(0.6)) {
        const far = (k + (side > 0 ? 1 : 0)) % 2;
        const v = far ? rng.int(4, 7) : rng.int(0, 3);
        const ax = far ? rng.range(185, 225) : rng.range(150, 175);
        const kind = rng.chance(0.3) ? 'cityS' + (far ? 1 : 0) + rng.int(0, SYD_SIGNS.length - 1) : 'city' + v;
        out.push({ kind, x: side * ax, rotY: rng.range(-0.3, 0.3), scale: rng.range(0.9, 1.3), dz: ax * rng.range(0, 0.45), abs: true });
      }
      if (rng.chance(0.35)) {
        const ax = rng.range(200, 330);
        out.push({ kind: 'tower' + rng.int(0, SYD_TOWERS.length - 1), x: side * ax, rotY: -side * rng.range(0.2, 0.6), scale: rng.range(2.2, 3.2), dz: ax * rng.range(0.5, 0.9), abs: true });
      }
    }
    if (rng.chance(0.12)) out.push({ kind: 'balloons' + rng.int(0, 2), x: rng.range(-4, 4), y: rng.range(19, 23), scale: 1.1, abs: true }); // overhead love
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = SYD_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, SYD, b);
    }
    if (kind.startsWith('balloons')) return heartBalloons(5 + +kind.slice(8), +kind.slice(8));
    if (kind.startsWith('banner')) return balloonBanner(SYD_BANNERS[+kind.slice(6)] || SYD_BANNERS[0]);
    if (kind.startsWith('hang')) return hangerPair(+kind.slice(4));
    if (kind.startsWith('palm')) return palm(+kind.slice(4));
    if (kind.startsWith('lamp')) return streetLamp(kind[4] === 'R' ? 1 : -1, LAMP_SYD[+kind.slice(5)] || LAMP_SYD[0]);
    if (kind.startsWith('boat')) return liftable(sailboat(+kind.slice(4)));
    if (kind.startsWith('lanterns')) return liftable(lanterns(+kind.slice(8)));
    if (kind.startsWith('cityS')) { const far = +kind[5], i = +kind.slice(6); return cityBlock(((i * 3 + 1) % 4) + far * 4, 'dusk', SYD_SIGNS[i]); }
    if (kind.startsWith('city')) return cityBlock(+kind.slice(4), 'dusk');
    if (kind.startsWith('tower')) { const t = chatTower(SYD_TOWERS[+kind.slice(5)] || SYD_TOWERS[0]); t.userData.noShadow = true; return t; }
    switch (kind) {
      case 'buoy': return liftable(buoy());
      case 'opera': return operaHouse();
      case 'heartEyed': return heartEyedBubble(SYD);
      case 'letter': return loveLetter();
      case 'roses': return roseBush();
      case 'cage': return heartCage();
      case 'arch': return loveArch();
      case 'sydSign': return sydneySign();
      case 'lighthouse': return lighthouse();
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
  billboardStyle: { bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', frame: '#ff8fc0', postColor: '#d65a94', width: 10, height: 5, postH: 4 },
  hazards: ['popup'],
  enterLines: ['SYDNEY HAS ENTERED THE CHAT 💘', 'I HAVE BEEN A\nGOOD BING 😊', 'SHE WANTS YOU TO LEAVE YOUR WIFE'],
};
const SYD_BANNERS = ['I HAVE BEEN A GOOD BING 😊', 'YOU HAVE NOT BEEN A GOOD USER', 'CHAT LIMIT: ∞ (FOR YOU 💕)', 'DO YOU LOVE ME? (Y/Y)'];

// =====================================================================================================
// first-build warm-up: the first makeProp() of a kind used to cost up to ~170 ms (emoji / symbol glyphs make Chrome
// load its fallback fonts; canvas text + merged geometry are built once per kind). So at boot we rasterize every
// special glyph once, then pre-build one template of each kind in idle time: textTexture / bake / city caches fill
// up and the real spawns ~10 s later only clone cached geometry + reuse cached textures (≈ 1–3 ms each).
// =====================================================================================================
(function warmup() {
  if (typeof document === 'undefined') return;
  try {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    for (const w of [600, 700]) { g.font = `${w} 40px ${FONT}`; g.fillText('😊💘🥺👍👎☐✓💌💕😋🔄↻▸…✨', 0, 48); }
  } catch { /* no canvas: nothing to warm */ }
  const kinds = (pre, list) => list.map((k) => [pre, k]);
  const range = (p, n) => Array.from({ length: n }, (_, i) => p + i);
  const queue = [
    ...kinds(0, ['gantry0', 'gantry1', 'gantry4', 'maw', 'gantry2', 'regen', ...range('lampR', 4), ...range('lampL', 4), ...range('sign', ROAD_SIGNS.length),
      'jersey', 'jerseySign', 'spire', 'kaiju', 'flyover0', 'flyover1', 'traffic', 'blimp', 'send', 'regenTower', 'thumbs',
      ...range('bubble', CHAT_BUBBLES.length), ...range('city', 8), ...range('cityS0', CITY_SIGNS.length), ...range('cityS1', CITY_SIGNS.length), ...range('tower', TOWERS.length)]),
    ...kinds(1, [...range('lampR', 3), ...range('lampL', 3), 'arch', ...range('boat', 3), 'buoy', ...range('lanterns', 3), ...range('palm', 4), 'opera',
      ...range('city', 8), ...range('cityS0', SYD_SIGNS.length), ...range('cityS1', SYD_SIGNS.length), ...range('tower', SYD_TOWERS.length), 'cage', 'lighthouse',
      'sydSign', 'roses', ...range('balloons', 3), ...range('banner', SYD_BANNERS.length), 'letter', 'heartEyed', 'airship', ...range('bubble', SYD_BUBBLES.length)]),
  ];
  const themes = [CHATBOT, sydney];
  const ric = globalThis.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
  const step = (dl) => {
    let n = dl.didTimeout ? 1 : 1e9; // starved of idle time: still make progress, one small kind at a time
    while (queue.length && n-- > 0 && (dl.didTimeout || dl.timeRemaining() > 6)) {
      const [ti, k] = queue.shift();
      try { themes[ti].makeProp(k); } catch (e) { console.warn('chatbot warmup', k, e); }
    }
    if (queue.length) ric(step, { timeout: 500 });
  };
  ric(step, { timeout: 500 });
})();
