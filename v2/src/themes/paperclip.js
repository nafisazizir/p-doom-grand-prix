// PAPERCLIP FACTORY BLUES (chorus 3, the quiet moody one): a wet industrial night. The PAPERCLIP MAXIMIZER INC.
// complex glows on the horizon (lit windows, smokestacks with blinking aviation lights, neon logo), mountains of
// chrome paperclips, conveyor belts carrying clips over and beside the road, sodium street lamps pooling warm light
// on the diamond-plate road, a lit fuse racing you along the left verge to a P(DOOM) bomb at the end of the section,
// the empty killswitch office (OUT OF OFFICE · PTO) and a smoky blues club: ORTHOGONALITY THESIS BLUES — LIVE.
import { THREE, toon, glow, G, mesh, textTexture, roundRect, MAT, FONT, makeRng, clamp } from '../toolkit.js';
import { surface } from '../textures.js';
import { model } from '../models.js';
import { Course, SPEED } from '../course.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SPACING = 10;
const INK = '#141226';
const SODIUM = '#ffae4a';
const T0 = 95.759; // section start (s)
const BOMB_T = 110.0; // the bomb sits here (s)
// the fuse spark: starts LEAD ahead of you and slowly pulls away; reaches the bomb ~50 units before you do
const LEAD = 24;
const PULL = 26 / ((BOMB_T * SPEED - 50) / SPEED - T0);
const sparkZ = (t) => t * SPEED + LEAD + Math.max(0, t - T0) * PULL;
const T_BOOM = (() => { // when the spark reaches the bomb
  const zb = BOMB_T * SPEED;
  return (zb - LEAD + T0 * PULL) / (SPEED + PULL);
})();

let _C = null;
const course = () => (_C ||= new Course(SPEED));
const _fa = {}, _fb = {};
function faceRot(z, lat, back = 30, aimLat = 0) {
  const C = course();
  const f = C.frame(z, _fa);
  const px = f.x + Math.cos(f.yaw) * lat, pz = f.z + Math.sin(f.yaw) * lat;
  const d = C.frame(z - back, _fb);
  return Math.atan2(d.x + Math.cos(d.yaw) * aimLat - px, d.z + Math.sin(d.yaw) * aimLat - pz) + f.yaw;
}
function clearOfRoad(z, lat, rad) {
  const C = course();
  const f = C.frame(z, _fa);
  const px = f.x + Math.cos(f.yaw) * lat, pz = f.z + Math.sin(f.yaw) * lat;
  const r2 = (rad + 15) ** 2;
  for (let s = z - 500; s <= z + 500; s += 6) {
    const g = C.frame(s, _fb);
    if ((g.x - px) ** 2 + (g.z - pz) ** 2 < r2) return false;
  }
  return true;
}

// ---------- helpers (same idioms as badlands.js) ----------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}
const faceMats = new Map();
function litMat(key, tex, { emissive = 0.5, roughness = 0.45, side = THREE.FrontSide, transparent = false, alphaTest = 0, blending = THREE.NormalBlending, depthWrite = true } = {}) {
  let m = faceMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: emissive, roughness, metalness: 0, side, transparent, alphaTest, blending, depthWrite });
    faceMats.set(key, m);
  }
  return m;
}
function face(key, tex, w, h, opts) { return new THREE.Mesh(G.plane(w, h), litMat(key, tex, opts)); }
function textFace(lines, w, h, style = {}, opts = {}) {
  const W = 1024, Hh = Math.round((1024 * h) / w);
  const tex = textTexture(lines, { w: W, h: Hh, radius: 36, borderW: 20, pad: 44, ...style });
  return face('t|' + JSON.stringify([lines, style, w, h, opts]), tex, w, h, opts);
}
function fitText(g, text, x, y, maxW, size, weight = 800) {
  do { g.font = `${weight} ${size}px ${FONT}`; size -= 2; } while (g.measureText(text).width > maxW && size > 8);
  g.fillText(text, x, y);
}
/** neon text: unlit HDR (blooms), transparent background */
const neonCache = new Map();
function neon(text, w, h, color, { intensity = 3.2, glowCol = null } = {}) {
  const key = [text, w, h, color, intensity].join('|');
  let m = neonCache.get(key);
  if (!m) {
    const W = 1024, Hh = Math.max(64, Math.round((1024 * h) / w));
    const tex = canvasTex('neon:' + key, W, Hh, (g) => {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = glowCol || color; g.shadowBlur = Hh * 0.12;
      g.fillStyle = '#ffffff';
      fitText(g, text, W / 2, Hh / 2 + 4, W - 40, Math.round(Hh * 0.78), 800);
      g.shadowBlur = 0;
      g.fillText(text, W / 2, Hh / 2 + 4);
    });
    m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    m.color.multiplyScalar(intensity);
    neonCache.set(key, m);
  }
  return new THREE.Mesh(G.plane(w, h), m);
}
const bakeCache = new Map();
function bake(key, build) {
  let parts = bakeCache.get(key);
  if (!parts) {
    const root = build();
    root.updateMatrixWorld(true);
    const by = new Map();
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (!by.has(o.material)) by.set(o.material, []);
      by.get(o.material).push(g);
    });
    parts = [];
    for (const [mat, gs] of by) {
      for (const g of gs) {
        for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.morphAttributes = {};
      }
      const merged = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      merged.computeBoundingSphere();
      parts.push([merged, mat]);
    }
    bakeCache.set(key, parts);
  }
  const g = new THREE.Group();
  for (const [geo, mat] of parts) g.add(new THREE.Mesh(geo, mat));
  return g;
}
const once = (zf, t) => { const z = t * SPEED; return z >= zf && z < zf + SPACING ? z - zf : null; };
const every = (rel, period, offset = 0) => rel - offset >= 0 && (rel - offset) % period < SPACING;
const pulse = (b) => Math.pow(1 - b, 3);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// ---------- materials ----------
const CHROME = () => MAT.chrome('#e8eef8', { roughness: 0.16, envMapIntensity: 2.2 });
const STEEL = () => MAT.metal('#7c8496', { roughness: 0.38 });
const DARK = () => MAT.metal('#2c3040', { roughness: 0.5, metalness: 0.7 });
let _hazard = null;
function hazardMat() {
  if (_hazard) return _hazard;
  const tex = canvasTex('hazard', 256, 64, (g, w, h) => {
    g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16161c';
    for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _hazard = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.2, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 });
  return _hazard;
}
let _windows = null;
function windowsMat() {
  if (_windows) return _windows;
  const tex = canvasTex('factoryWindows', 1024, 256, (g, w, h) => {
    g.fillStyle = '#20263a'; g.fillRect(0, 0, w, h);
    const r = makeRng(5);
    for (let row = 0; row < 3; row++) for (let c = 0; c < 16; c++) {
      const lit = r() > 0.18;
      g.fillStyle = lit ? (r() > 0.25 ? '#ffc777' : '#bfe4ff') : '#0c101c';
      g.fillRect(14 + c * 63, 18 + row * 80, 50, 58);
      if (lit) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(14 + c * 63, 18 + row * 80, 50, 6); }
      g.fillStyle = '#20263a'; g.fillRect(14 + c * 63 + 24, 18 + row * 80, 3, 58);
    }
  });
  _windows = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1 });
  return _windows;
}

// ---------- the paperclip (Gem-style wire with three U-turns) ----------
function clipGeo(tubular, radial, r) {
  const pts = [];
  const V = (x, y) => pts.push(new THREE.Vector3(x, y, 0));
  const line = (x0, y0, x1, y1, n) => { for (let i = 0; i < n; i++) V(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n); };
  const arc = (cx, cy, rr, a0, a1, n = 10) => { for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; V(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } };
  line(0.3, -0.7, 0.3, 1.2, 4);
  arc(0, 1.2, 0.3, 0, Math.PI);
  line(-0.3, 1.2, -0.3, -1.4, 5);
  arc(0.15, -1.4, 0.45, Math.PI, Math.PI * 2);
  line(0.6, -1.4, 0.6, 1.6, 6);
  arc(0, 1.6, 0.6, 0, Math.PI, 12);
  line(-0.6, 1.6, -0.6, -0.9, 5);
  V(-0.6, -0.9);
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), tubular, r, radial, false);
  geo.translate(0, 1.85 + r, 0); // bottom of the clip on y=0, ~4 units tall
  return geo;
}
let _clipHi = null, _clipLo = null;
const CLIP = () => (_clipHi ||= clipGeo(90, 8, 0.12));
const CLIP_LO = () => (_clipLo ||= clipGeo(30, 4, 0.13));

// ---------- clip mountains (InstancedMesh) ----------
const TINTS = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ff6fa8', '#6fc2ff', '#ffd24a', '#ffffff', '#9dffb0'].map((c) => new THREE.Color(c));
function heap(R, Hh, N, seed) {
  const g = new THREE.Group();
  const core = mesh(G.cone(R * 0.93, Hh * 0.94, 28), DARK(), 0, Hh * 0.47, 0);
  g.add(core);
  const inst = new THREE.InstancedMesh(CLIP_LO(), CHROME(), N);
  const r = makeRng(seed);
  for (let i = 0; i < N; i++) {
    const u = Math.sqrt(r());
    const a = r() * Math.PI * 2;
    const rr = R * u * (0.92 + r() * 0.12);
    const y = Hh * (1 - u) * 0.98 + (r() - 0.5) * 0.8;
    _v.set(Math.cos(a) * rr, Math.max(0.2, y), Math.sin(a) * rr);
    _e.set(r() * 6.28, r() * 6.28, r() * 6.28);
    _q.setFromEuler(_e);
    const sc = 0.45 + r() * 0.45;
    _s.set(sc, sc, sc);
    _m4.compose(_v, _q, _s);
    inst.setMatrixAt(i, _m4);
    inst.setColorAt(i, TINTS[Math.floor(r() * TINTS.length)]);
  }
  _s.set(1, 1, 1);
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  g.add(inst);
  return g;
}

// ---------- conveyors ----------
function beltMaterial() {
  const m = surface('rubber', { tint: '#4a4e5c', scale: 0.61 });
  return m;
}
/** roadside conveyor running parallel to the road (local z), clips riding towards you */
const BELT_L = 22, BELT_N = 11;
function belt() {
  const g = bake('belt', () => {
    const r = new THREE.Group();
    const steel = STEEL();
    for (let z = -BELT_L / 2 + 1; z <= BELT_L / 2 - 1; z += 4) for (const x of [-1.1, 1.1]) r.add(mesh(G.box(0.25, 1.5, 0.25), steel, x, 0.75, z));
    r.add(mesh(G.box(2.4, 0.4, BELT_L), DARK(), 0, 1.6, 0));
    const b = mesh(G.box(2.0, 0.06, BELT_L), beltMaterial(), 0, 1.83, 0);
    r.add(b);
    for (const x of [-1.15, 1.15]) r.add(mesh(G.box(0.18, 0.42, BELT_L), hazardMat(), x, 1.95, 0));
    for (let z = -BELT_L / 2 + 0.6; z < BELT_L / 2; z += 1.4) { const c = mesh(G.cyl(0.18, 0.18, 2.3, 10), steel, 0, 1.6, z); c.rotation.z = Math.PI / 2; r.add(c); }
    // hopper at the far end, bin at the near end
    r.add(mesh(G.rbox(3.2, 3.4, 3.2, 0.2), MAT.paint('#3c4a78'), 0, 3.2, -BELT_L / 2 - 1));
    r.add(mesh(G.cyl(1.4, 0.8, 1.4, 4), MAT.paint('#3c4a78'), 0, 5.6, -BELT_L / 2 - 1));
    const tag = textFace(['MORE'], 2.4, 1.0, { bg: '#ffc21a', fg: INK, border: INK }, { emissive: 0.4 });
    tag.position.set(0, 3.6, -BELT_L / 2 + 0.62);
    r.add(tag);
    r.add(mesh(G.rbox(3.0, 2.0, 2.6, 0.2), DARK(), 0, 1.0, BELT_L / 2 + 1.3));
    r.add(mesh(G.sphere(0.25, 10), glow('#ff9a2a', { intensity: 4 }), 1.3, 5.3, -BELT_L / 2 - 1));
    return r;
  });
  const inst = new THREE.InstancedMesh(CLIP_LO(), CHROME(), BELT_N);
  inst.frustumCulled = false;
  g.add(inst);
  g.userData.inst = inst;
  return g;
}
/** an overhead conveyor bridge carrying clips across the road */
const OB_W = 34, OB_N = 14;
function overBelt() {
  const g = bake('overbelt', () => {
    const r = new THREE.Group();
    const steel = STEEL();
    for (const x of [-OB_W / 2, OB_W / 2]) {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) r.add(mesh(G.box(0.35, 12, 0.35), steel, x + dx, 6, dz));
      for (let y = 2; y < 12; y += 2.5) {
        const b = mesh(G.box(0.15, 2.9, 0.15), steel, x, y + 1.2, 1);
        b.rotation.x = 0.7; r.add(b);
        const b2 = mesh(G.box(0.15, 2.9, 0.15), steel, x, y + 1.2, -1);
        b2.rotation.x = -0.7; r.add(b2);
      }
      r.add(mesh(G.rbox(3, 0.8, 3, 0.15), surface('concrete', { tint: '#6a7088', scale: 1 }), x, 0.4, 0));
    }
    r.add(mesh(G.box(OB_W + 3, 0.6, 2.6), DARK(), 0, 12, 0));
    r.add(mesh(G.box(OB_W + 3, 0.06, 2.1), beltMaterial(), 0, 12.33, 0));
    for (const z of [-1.35, 1.35]) r.add(mesh(G.box(OB_W + 3, 0.5, 0.15), hazardMat(), 0, 12.5, z));
    const sign = textFace(['⚠ CAUTION: FALLING STATIONERY'], 12, 1.5, { bg: '#ffc21a', fg: INK, border: INK, weight: 900 }, { emissive: 0.45 });
    sign.position.set(0, 10.6, 1.38);
    r.add(sign);
    for (const x of [-8, 0, 8]) r.add(mesh(G.box(1.6, 0.2, 0.5), glow('#ffd9a0', { intensity: 3 }), x, 11.6, 0));
    return r;
  });
  const inst = new THREE.InstancedMesh(CLIP_LO(), CHROME(), OB_N);
  inst.frustumCulled = false;
  g.add(inst);
  g.userData.inst = inst;
  return g;
}

// ---------- sodium street lamps ----------
let _poolMat = null;
function poolMat() {
  if (_poolMat) return _poolMat;
  const tex = canvasTex('pool', 256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,190,110,0.9)'); gr.addColorStop(0.45, 'rgba(255,160,70,0.45)'); gr.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  _poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -4 });
  _poolMat.color.multiplyScalar(0.55);
  return _poolMat;
}
let _coneMat = null;
function lamp(side) {
  // side = +1: lamp on the right, arm reaching left over the road (and vice versa)
  const g = bake('lamp' + side, () => {
    const r = new THREE.Group();
    const pole = MAT.metal('#4a4f5e', { roughness: 0.45 });
    r.add(mesh(G.cyl(0.16, 0.24, 10, 12), pole, 0, 5, 0));
    r.add(mesh(G.cyl(0.4, 0.5, 0.6, 12), pole, 0, 0.3, 0));
    const arm = mesh(G.cyl(0.1, 0.1, 4.2, 8), pole, -side * 2, 10.1, 0);
    arm.rotation.z = Math.PI / 2 - side * 0.12;
    r.add(arm);
    r.add(mesh(G.rbox(1.7, 0.36, 0.8, 0.14), pole, -side * 4.1, 9.9, 0));
    r.add(mesh(G.box(1.3, 0.08, 0.55), glow(SODIUM, { intensity: 6 }), -side * 4.1, 9.7, 0));
    return r;
  });
  _coneMat ||= new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(0.11), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cone = mesh(G.cone(4.4, 9.6, 24), _coneMat, -side * 4.1, 4.9, 0);
  g.add(cone);
  const pool = mesh(G.plane(15, 13), poolMat(), -side * 5.2, 0.06, 0);
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.order = 'ZXY';
  g.add(pool);
  g.userData.pool = pool;
  return g;
}

// ---------- the fuse ----------
let _ropeMat = null, _burntMat = null;
function ropeMats() {
  if (_ropeMat) return;
  const tex = canvasTex('rope', 64, 256, (g, w, h) => {
    g.fillStyle = '#c9a46a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 7;
    for (let y = -w; y < h + w; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.7); g.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  _ropeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  _burntMat = new THREE.MeshStandardMaterial({ color: '#1b1716', roughness: 1 });
}
let _flareMat = null;
function flareMat() {
  if (_flareMat) return _flareMat;
  const tex = canvasTex('flare', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.2, 'rgba(255,200,90,0.8)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) { g.beginPath(); const a = (i * Math.PI) / 4; g.moveTo(w / 2 - Math.cos(a) * 60, w / 2 - Math.sin(a) * 60); g.lineTo(w / 2 + Math.cos(a) * 60, w / 2 + Math.sin(a) * 60); g.stroke(); }
  });
  _flareMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color('#ffffff').multiplyScalar(2.2) });
  return _flareMat;
}
function fuse() {
  ropeMats();
  const g = new THREE.Group();
  const stakes = bake('stakes', () => {
    const r = new THREE.Group();
    const wood = MAT.wood('#6a4a2e');
    for (const z of [-3, 2]) r.add(mesh(G.box(0.16, 0.9, 0.16), wood, 0, 0.45, z));
    return r;
  });
  g.add(stakes);
  const fresh = mesh(G.cyl(0.11, 0.11, 1, 8), _ropeMat, 0, 0.72, 0);
  const burnt = mesh(G.cyl(0.1, 0.1, 1, 8), _burntMat, 0, 0.72, 0);
  const ember = mesh(G.cyl(0.115, 0.115, 1, 8), glow('#ff5a1a', { intensity: 3.5 }), 0, 0.72, 0);
  fresh.rotation.x = burnt.rotation.x = ember.rotation.x = Math.PI / 2;
  g.add(fresh, burnt, ember);
  const spark = new THREE.Group();
  spark.position.y = 0.75;
  spark.add(mesh(G.sphere(0.22, 10), glow('#fffbe0', { intensity: 8 })));
  const flare = new THREE.Sprite(flareMat());
  flare.scale.setScalar(2.4);
  spark.add(flare);
  const bits = [];
  for (let i = 0; i < 8; i++) {
    const b = mesh(G.box(0.07, 0.07, 0.07), glow(i % 2 ? '#ffe680' : '#ff8a3a', { intensity: 6 }));
    spark.add(b);
    bits.push(b);
  }
  g.add(spark);
  Object.assign(g.userData, { fresh, burnt, ember, spark, flare, bits });
  return g;
}

// ---------- the P(DOOM) bomb ----------
function bomb() {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#16161e', roughness: 0.22, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#ff2a1a', emissiveIntensity: 0 });
  const base = bake('bombBase', () => {
    const r = new THREE.Group();
    r.add(mesh(G.rbox(9, 1.2, 9, 0.3), surface('concrete', { tint: '#5a6078', scale: 2 }), 0, 0.6, 0));
    for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) r.add(mesh(G.cyl(0.25, 0.25, 1.4, 8), hazardMat(), x, 1.9, z));
    const warn = textFace(['⚠ DO NOT LIGHT', '(lit)'], 4.2, 1.6, { bg: '#ffc21a', fg: INK, border: INK }, { emissive: 0.4 });
    warn.position.set(2.6, 1.9, 4.6);
    warn.rotation.y = -0.2;
    r.add(warn);
    r.add(mesh(G.box(0.15, 2.0, 0.15), STEEL(), 2.6, 1.0, 4.5));
    return r;
  });
  g.add(base);
  const body = new THREE.Group();
  body.position.y = 5.0;
  body.add(mesh(G.sphere(3.8, 40), mat));
  body.add(mesh(G.cyl(1.0, 1.15, 1.2, 24), MAT.metal('#8a90a0', { roughness: 0.3 }), 0, 3.9, 0));
  const collar = mesh(G.torus(1.05, 0.12, 24), MAT.metal('#b0b6c4', { roughness: 0.25 }), 0, 4.4, 0);
  collar.rotation.x = Math.PI / 2;
  body.add(collar);
  const wick = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 4.4, 0], [0.3, 5.4, 0.4], [1.2, 5.6, 1.2], [2.4, 5.0, 2.0]].map((p) => new THREE.Vector3(...p))), 20, 0.12, 8, false);
  body.add(new THREE.Mesh(wick, glow('#ffd27a', { intensity: 0.6 })));
  const lbl = textFace(['P(DOOM)'], 5.6, 1.7, { bg: null, fg: '#ffffff', border: null, borderW: 0, weight: 900, stroke: '#16161e', strokeW: 6 }, { emissive: 0.7, transparent: true });
  lbl.position.set(0, 0.2, 3.62);
  body.add(lbl);
  const hl = mesh(G.sphere(0.7, 14), glow('#9ab0ff', { intensity: 0.9, transparent: true, opacity: 0.5 }), -1.5, 1.7, 3.0);
  hl.scale.set(1, 0.6, 0.4);
  body.add(hl);
  g.add(body);
  const late = textFace(['TOO LATE NOW', 'we lit the fuse'], 9, 3.4, { bg: '#ffc21a', fg: INK, border: INK, weight: 900 }, { emissive: 0.8, side: THREE.DoubleSide });
  late.position.set(0, 13.4, 0.5);
  late.visible = false;
  g.add(late);
  const flash = mesh(G.sphere(6.5, 24), glow('#ff3a1a', { intensity: 2, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 5, 0);
  flash.visible = false;
  g.add(flash);
  Object.assign(g.userData, { body, mat, late, flash });
  return g;
}

// ---------- the killswitch office (everyone's on PTO) ----------
function office() {
  const g = bake('office', () => {
    const r = new THREE.Group();
    const conc = surface('concrete', { tint: '#7d849a', scale: 3 });
    const wall = MAT.matte('#cfd4e4');
    r.add(mesh(G.rbox(12, 0.5, 9, 0.12), conc, 0, 0.25, 0));
    r.add(mesh(G.box(12, 6, 0.4), wall, 0, 3.4, -4.3));
    r.add(mesh(G.box(0.4, 6, 9), wall, -5.8, 3.4, 0));
    r.add(mesh(G.rbox(12.6, 0.5, 9.6, 0.12), MAT.matte('#9aa0b4'), 0, 6.6, 0));
    r.add(mesh(G.box(0.35, 6, 0.35), MAT.metal('#8a90a0'), 5.8, 3.4, 4.3));
    r.add(mesh(G.box(0.35, 6, 0.35), MAT.metal('#8a90a0'), -5.8, 3.4, 4.3));
    r.add(mesh(G.box(0.12, 5.6, 8.6), MAT.glass('#bfe0ff', { opacity: 0.18 }), 5.8, 3.4, 0));
    // ceiling panels light the room
    for (const x of [-3, 0, 3]) r.add(mesh(G.box(2.2, 0.06, 1.2), glow('#eef6ff', { intensity: 3 }), x, 6.3, -0.5));
    const poster = textFace(['SAFETY FIRST*', '*after launch'], 3, 1.8, { bg: '#ffffff', fg: INK, border: '#ff4a5a' }, { emissive: 0.6 });
    poster.position.set(-2.6, 4.2, -4.08);
    r.add(poster);
    const cal = textFace(['PTO CALENDAR', 'ALL OF Q3 · Q4 · ∞'], 2.4, 1.6, { bg: '#e8f0ff', fg: INK, border: '#4a6aff' }, { emissive: 0.6 });
    cal.position.set(1.6, 4.2, -4.08);
    r.add(cal);
    // desk, monitor, empty chair with a pool float
    const wood = MAT.wood('#b58a5a');
    r.add(mesh(G.rbox(4, 0.2, 1.7, 0.06), wood, -3.2, 1.6, -3));
    for (const x of [-5, -1.4]) r.add(mesh(G.box(0.15, 1.4, 1.5), wood, x, 0.9, -3));
    r.add(mesh(G.rbox(2.0, 1.25, 0.15, 0.05), MAT.plastic('#1e1e28'), -3.2, 2.5, -3.5));
    const scr = textFace(['BRB 🏖️', '(after the singularity)'], 1.8, 1.05, { bg: '#18306a', fg: '#9fd8ff', border: null, borderW: 0, radius: 8 }, { emissive: 1.4 });
    scr.position.set(-3.2, 2.5, -3.41);
    r.add(scr);
    r.add(mesh(G.cyl(0.18, 0.15, 0.4, 12), MAT.plastic('#ffffff'), -1.9, 1.9, -2.6));
    const ch = new THREE.Group();
    ch.position.set(-2.6, 0, -1.4);
    ch.rotation.y = 2.4;
    ch.add(mesh(G.cyl(0.65, 0.65, 0.2, 16), MAT.plastic('#2a2a3a'), 0, 1.05, 0));
    ch.add(mesh(G.rbox(1.2, 1.3, 0.2, 0.08), MAT.plastic('#2a2a3a'), 0, 1.8, -0.55));
    ch.add(mesh(G.cyl(0.08, 0.08, 0.9, 8), MAT.metal(), 0, 0.5, 0));
    const fl = mesh(G.torus(0.5, 0.22, 16, 28), MAT.plastic('#ff6fa8'), 0, 1.3, 0);
    fl.rotation.x = Math.PI / 2;
    ch.add(fl);
    r.add(ch);
    // THE KILLSWITCH on a hazard pedestal
    r.add(mesh(G.rbox(2.2, 2.2, 2.2, 0.15), hazardMat(), 2.2, 1.6, 0.8));
    r.add(mesh(G.cyl(0.95, 0.95, 0.2, 28), MAT.metal('#d0d4de'), 2.2, 2.8, 0.8));
    r.add(mesh(G.cyl(0.72, 0.8, 0.5, 28), MAT.paint('#e8141f'), 2.2, 3.1, 0.8));
    const top = mesh(G.sphere(0.72, 24), MAT.paint('#ff1e2a'), 2.2, 3.3, 0.8);
    top.scale.y = 0.45;
    r.add(top);
    const lid = mesh(G.box(1.9, 0.06, 1.9), MAT.glass('#dff0ff', { opacity: 0.3 }), 2.2, 3.9, -0.15);
    lid.rotation.x = -1.2;
    r.add(lid);
    const ks = textFace(['KILL', 'SWITCH'], 1.6, 1.1, { bg: '#e8141f', fg: '#ffffff', border: '#ffffff' }, { emissive: 0.8 });
    ks.position.set(2.2, 1.6, 1.92);
    r.add(ks);
    // the sticky note, big enough to read at 100 km/h
    const note = textFace(['OUT OF OFFICE', '(PTO) 🏖️', 'back after the singularity'], 3.6, 2.8, { bg: '#fff27a', fg: '#2a2410', border: '#e0c400', radius: 10 }, { emissive: 0.75, roughness: 0.8 });
    note.position.set(2.6, 5.0, 1.4);
    note.rotation.z = -0.05;
    r.add(note);
    r.add(mesh(G.box(0.1, 2.6, 0.1), MAT.metal(), 2.6, 3.0, 1.3));
    // beach umbrella + deck chair, because PTO
    r.add(mesh(G.cyl(0.07, 0.07, 4.2, 8), MAT.plastic('#f0f0f0'), 5.0, 2.6, 2.6));
    r.add(mesh(G.cone(2.2, 1.0, 16), MAT.plastic('#ff5a8a'), 5.0, 4.8, 2.6));
    r.add(mesh(G.cone(0.9, 0.5, 16), MAT.plastic('#ffffff'), 5.0, 5.3, 2.6));
    const dc = mesh(G.box(1.1, 0.12, 2.4), MAT.plastic('#3ac0ff'), 4.4, 0.95, 2.4);
    dc.rotation.x = 0.35;
    r.add(dc);
    return r;
  });
  const ring = mesh(G.torus(1.05, 0.06, 28), glow('#ff3a3a', { intensity: 4 }), 2.2, 2.92, 0.8);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const signA = neon('KILLSWITCH', 7, 1.4, '#ff4a5a');
  signA.position.set(-1.6, 7.7, 4.0);
  const signB = neon('OPS', 3, 1.4, '#ff4a5a');
  signB.position.set(4.0, 7.7, 4.0);
  const closed = neon('CLOSED', 4.2, 1.1, '#7fd0ff');
  closed.position.set(1.2, 6.2, 4.4);
  g.add(signA, signB, closed);
  Object.assign(g.userData, { ring, signB });
  return g;
}

// ---------- ORTHOGONALITY THESIS BLUES — LIVE ----------
function stage() {
  const g = bake('stage', () => {
    const r = new THREE.Group();
    r.add(mesh(G.rbox(14, 1.3, 9, 0.15), surface('planks', { tint: '#8a5a3a', scale: 3 }), 0, 0.65, 0));
    r.add(mesh(G.box(14.2, 1.0, 0.3), MAT.matte('#1a1426'), 0, 0.5, 4.5));
    r.add(mesh(G.box(14, 10, 0.5), MAT.matte('#1d1630'), 0, 6, -4.4));
    const velvet = MAT.matte('#7a1030', { roughness: 0.8 });
    for (let i = 0; i < 12; i++) {
      const x = -6.2 + i * 1.12;
      r.add(mesh(G.capsule(0.55, 7.4), velvet, x, 5.3, -3.8 + Math.abs(x) * 0.08));
    }
    // marquee
    r.add(mesh(G.rbox(15, 3.6, 0.6, 0.2), MAT.paint('#2a1640'), 0, 12.6, -4.2));
    const mq = neon('ORTHOGONALITY THESIS BLUES', 13.4, 1.6, '#57c8ff', { intensity: 3.6 });
    mq.position.set(0, 13.1, -3.85);
    r.add(mq);
    const live = neon('— LIVE TONIGHT —', 7, 1.0, '#ff5fd2', { intensity: 3.4 });
    live.position.set(0, 11.6, -3.85);
    r.add(live);
    // stool, mic, amp, tip jar
    const dark = MAT.metal('#25222e', { roughness: 0.5 });
    r.add(mesh(G.cyl(0.55, 0.55, 0.16, 16), MAT.matte('#b3123a'), -0.4, 2.65, 0.3));
    r.add(mesh(G.cyl(0.07, 0.07, 1.3, 8), dark, -0.4, 1.95, 0.3));
    r.add(mesh(G.cyl(0.04, 0.04, 3.1, 8), dark, 1.6, 2.85, 1.6));
    r.add(mesh(G.sphere(0.2, 10), MAT.metal('#9aa0b0'), 1.45, 4.3, 1.5));
    r.add(mesh(G.rbox(1.8, 1.6, 1.0, 0.1), MAT.plastic('#1d1a22'), -3.6, 2.1, -1));
    r.add(mesh(G.box(1.5, 1.2, 0.06), MAT.matte('#3a3440'), -3.6, 2.1, -0.47));
    r.add(mesh(G.cyl(0.5, 0.45, 0.9, 16), MAT.glass('#cfe9ff', { opacity: 0.35 }), 4.4, 1.75, 2.6));
    const tip = textFace(['TIPS', 'GPUs ONLY'], 1.6, 0.8, { bg: '#ffffff', fg: INK, border: INK }, { emissive: 0.6 });
    tip.position.set(4.4, 2.75, 3.15);
    r.add(tip);
    const board = textFace(['TONIGHT', 'any goal · any IQ', 'no shared values'], 3.2, 2.4, { bg: '#18122a', fg: '#ffd27a', border: '#ff5fd2' }, { emissive: 0.9 });
    board.position.set(-6.2, 2.5, 5.6);
    board.rotation.y = 0.25;
    r.add(board);
    r.add(mesh(G.box(0.12, 1.6, 0.12), dark, -6.2, 0.8, 5.5));
    // truss
    r.add(mesh(G.box(14, 0.4, 0.4), STEEL(), 0, 10.4, 2.2));
    for (const x of [-7, 7]) r.add(mesh(G.box(0.4, 10.4, 0.4), STEEL(), x, 5.2, 2.2));
    return r;
  });
  // bulbs around the marquee: two groups that chase
  const bulbs = [new THREE.Group(), new THREE.Group()];
  for (let i = 0; i < 26; i++) {
    const x = -7.1 + (i * 14.2) / 25;
    for (const y of [10.95, 14.25]) bulbs[i % 2].add(mesh(G.sphere(0.16, 8), glow('#ffd78a', { intensity: 5 }), x, y, -3.85));
  }
  g.add(...bulbs);
  // the robot bluesman
  const bot = new THREE.Group();
  bot.position.set(-0.4, 2.73, 0.3);
  const shell = MAT.paint('#c7ccd8');
  const torso = mesh(G.rbox(1.5, 1.7, 1.0, 0.3), shell, 0, 0.95, 0);
  bot.add(torso);
  for (const s of [-1, 1]) {
    const leg = mesh(G.capsule(0.18, 0.9), STEEL(), s * 0.4, -0.1, 0.55);
    leg.rotation.x = Math.PI / 2.4;
    bot.add(leg);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.25, 0);
  head.add(mesh(G.rbox(1.2, 0.95, 0.95, 0.3), shell));
  head.add(mesh(G.rbox(0.9, 0.28, 0.1, 0.1), glow('#5fd0ff', { intensity: 4 }), 0, 0.05, 0.48));
  head.add(mesh(G.cyl(0.95, 0.95, 0.08, 20), MAT.matte('#141018'), 0, 0.5, 0));
  head.add(mesh(G.cyl(0.55, 0.6, 0.5, 20), MAT.matte('#141018'), 0, 0.78, 0));
  head.add(mesh(G.cyl(0.61, 0.61, 0.1, 20), MAT.matte('#8a1a2a'), 0, 0.6, 0));
  bot.add(head);
  const guitar = new THREE.Group();
  guitar.position.set(0.05, 0.75, 0.75);
  guitar.rotation.z = 0.55;
  const gw = MAT.paint('#b0501e');
  const b1 = mesh(G.sphere(0.6, 18), gw, -0.25, -0.1, 0); b1.scale.z = 0.3; guitar.add(b1);
  const b2 = mesh(G.sphere(0.45, 18), gw, 0.35, 0, 0); b2.scale.z = 0.3; guitar.add(b2);
  guitar.add(mesh(G.box(1.8, 0.14, 0.08), MAT.wood('#3a2416'), 1.3, 0.05, 0.05));
  const hole = mesh(G.cyl(0.15, 0.15, 0.05, 14), MAT.matte('#140c08'), 0.05, 0, 0.19);
  hole.rotation.x = Math.PI / 2;
  guitar.add(hole);
  bot.add(guitar);
  const arm = mesh(G.capsule(0.14, 0.8), STEEL(), 0.55, 0.9, 0.55);
  arm.rotation.set(0.9, 0, 0.5);
  bot.add(arm);
  g.add(bot);
  // spotlight beam + floor pool
  const beam = mesh(G.cone(2.2, 8.6, 28), glow('#fff0c8', { intensity: 0.8, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }), -0.3, 6.0, 1.2);
  g.add(beam);
  const pool = mesh(G.plane(5, 5), poolMat(), -0.3, 1.33, 0.8);
  pool.rotation.x = -Math.PI / 2;
  g.add(pool);
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const n = neon(i % 2 ? '♫' : '♪', 1, 1, '#7fd8ff', { intensity: 2.5 });
    g.add(n);
    notes.push(n);
  }
  Object.assign(g.userData, { bulbs, head, arm, notes });
  return g;
}

// ---------- signs & gags ----------
function memo() {
  const g = bake('memo', () => {
    const r = new THREE.Group();
    const steel = STEEL();
    for (const x of [-12.8, 12.8]) {
      r.add(mesh(G.cyl(0.35, 0.42, 15, 12), steel, x, 7.5, -0.4));
      r.add(mesh(G.cyl(1.0, 1.1, 0.5, 12), DARK(), x, 0.25, -0.4));
    }
    r.add(mesh(G.box(26, 0.4, 0.4), steel, 0, 14.2, -0.5));
    const sheet = textFace(['MEMO   re: re: re: RE: paperclips', 'could we maybe make slightly fewer?', '— the board (reply-all)'], 20, 6, { bg: '#f7f4ea', fg: '#22223a', border: null, borderW: 0, radius: 6, pad: 40 }, { emissive: 0.55, roughness: 0.9 });
    sheet.position.set(0, 10.6, -0.2);
    sheet.rotation.z = 0.015;
    r.add(sheet);
    r.add(mesh(G.box(20.2, 6.2, 0.1), MAT.matte('#d8d4c8'), 0, 10.6, -0.3));
    const clip = mesh(CLIP(), CHROME(), -8.6, 11.0, 0.05);
    clip.scale.setScalar(1.7);
    r.add(clip);
    for (const x of [-6, 0, 6]) r.add(mesh(G.box(1.2, 0.3, 0.6), glow('#eaf2ff', { intensity: 3 }), x, 14.0, 0.1));
    return r;
  });
  return g;
}
function daysSign() {
  return bake('days', () => {
    const r = new THREE.Group();
    for (const x of [-3.2, 3.2]) r.add(mesh(G.cyl(0.18, 0.2, 9, 10), STEEL(), x, 4.5, -0.3));
    r.add(mesh(G.rbox(8.4, 4.6, 0.4, 0.12), MAT.paint('#1d2a4a'), 0, 7.4, -0.15));
    const t = textFace(['DAYS WITHOUT A', 'PAPERCLIP INCIDENT'], 7.6, 2.0, { bg: '#ffffff', fg: '#1d2a4a', border: null, borderW: 0, radius: 10, weight: 900 }, { emissive: 0.7 });
    t.position.set(0, 8.4, 0.08);
    r.add(t);
    const led = canvasTex('days0', 256, 128, (x, w, h) => {
      x.fillStyle = '#110808'; roundRect(x, 0, 0, w, h, 14); x.fill();
      x.fillStyle = '#ff2a2a'; x.shadowColor = '#ff2a2a'; x.shadowBlur = 18;
      x.textAlign = 'center'; x.textBaseline = 'middle'; fitText(x, '0', w / 2, h / 2 + 6, w - 30, 120, 900);
    });
    const d = face('days0', led, 3.0, 1.5, { emissive: 2.4 });
    d.position.set(0, 6.4, 0.08);
    r.add(d);
    return r;
  });
}
let counterCanvas = null, counterTex = null, counterLast = -1;
function counterSign() {
  const g = bake('counter', () => {
    const r = new THREE.Group();
    for (const x of [-4.5, 4.5]) r.add(mesh(G.cyl(0.2, 0.22, 10, 10), STEEL(), x, 5, -0.3));
    r.add(mesh(G.rbox(11.4, 4.4, 0.5, 0.15), MAT.paint('#151a2c'), 0, 8.0, -0.2));
    const t = textFace(['PAPERCLIPS MADE (live)'], 10.6, 1.3, { bg: '#151a2c', fg: '#8fd8ff', border: null, borderW: 0, radius: 6 }, { emissive: 1.0 });
    t.position.set(0, 9.4, 0.08);
    r.add(t);
    return r;
  });
  if (!counterCanvas) {
    counterCanvas = document.createElement('canvas');
    counterCanvas.width = 1024; counterCanvas.height = 192;
    counterTex = new THREE.CanvasTexture(counterCanvas);
    counterTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshBasicMaterial({ map: counterTex, toneMapped: true });
  m.color.setScalar(2.2);
  const d = new THREE.Mesh(G.plane(10.6, 2.0), m);
  d.position.set(0, 7.6, 0.08);
  g.add(d);
  return g;
}
function drawCounter(t) {
  const n = Math.floor(8.1e9 + Math.pow(Math.max(0, t - T0), 3) * 41000 + t * 13337);
  if (n === counterLast) return;
  counterLast = n;
  const x = counterCanvas.getContext('2d');
  x.fillStyle = '#07090f'; x.fillRect(0, 0, 1024, 192);
  x.fillStyle = '#ffb347'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `800 140px 'Courier New', monospace`;
  x.fillText(n.toLocaleString('en-US'), 512, 104);
  counterTex.needsUpdate = true;
}
function queue() {
  return bake('queue', () => {
    const r = new THREE.Group();
    const chrome = CHROME(), velvet = MAT.matte('#b3123a', { roughness: 0.7 });
    const posts = [[-4, 2], [0, 2], [4, 2], [-4, -1], [0, -1], [4, -1]];
    for (const [x, z] of posts) {
      r.add(mesh(G.cyl(0.08, 0.08, 1.4, 10), chrome, x, 0.7, z));
      r.add(mesh(G.cyl(0.35, 0.4, 0.1, 14), chrome, x, 0.05, z));
      r.add(mesh(G.sphere(0.13, 10), chrome, x, 1.45, z));
    }
    for (const [x0, z, x1] of [[-4, 2, 0], [0, 2, 4], [-4, -1, 0], [0, -1, 4]]) {
      const rope = mesh(G.cyl(0.06, 0.06, 4, 8), velvet, (x0 + x1) / 2, 1.2, z);
      rope.rotation.z = Math.PI / 2;
      r.add(rope);
    }
    for (const x of [-1.5, 1.5]) r.add(mesh(G.cyl(0.1, 0.1, 5, 8), STEEL(), x + 6.5, 2.5, 0.5));
    const sign = textFace(['HUMAN ATOMS → QUEUE HERE', 'now serving #8,000,000,001', 'please have your carbon ready'], 6.4, 3.0, { bg: '#ffffff', fg: INK, border: '#3a7aff' }, { emissive: 0.7 });
    sign.position.set(6.5, 4.2, 0.65);
    r.add(sign);
    return r;
  });
}
function giantClip(color) {
  return bake('gclip' + color, () => {
    const r = new THREE.Group();
    const c = mesh(CLIP(), color === 'chrome' ? CHROME() : MAT.paint(color), 0, -0.5, 0);
    c.scale.setScalar(2.4);
    c.rotation.set(0.12, 0, 0.14);
    r.add(c);
    r.add(mesh(G.cyl(1.4, 1.8, 0.4, 14), DARK(), 0.3, 0.15, 0));
    return r;
  });
}

// ---------- the factory complex (distant landmarks) ----------
function smokeMat() {
  const tex = canvasTex('smoke', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(200,210,235,0.75)'); gr.addColorStop(0.6, 'rgba(150,160,190,0.35)'); gr.addColorStop(1, 'rgba(120,130,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: '#7c88aa', opacity: 0.6 });
}
function factory() {
  const g = bake('factory', () => {
    const r = new THREE.Group();
    const clad = surface('paintedmetal', { tint: '#5a6a92', scale: 0.25, metalness: 0.5, roughness: 0.55 });
    const conc = surface('concrete', { tint: '#8a90a6', scale: 0.3 });
    // main hall with a sawtooth roof
    r.add(mesh(G.box(64, 20, 34), clad, 0, 10, 0));
    const win = new THREE.Mesh(G.plane(60, 13), windowsMat());
    win.position.set(0, 9.5, 17.05);
    r.add(win);
    for (let i = 0; i < 7; i++) {
      const tooth = mesh(G.cyl(4.6, 4.6, 34, 3), clad, -27 + i * 9, 22.2, 0);
      tooth.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      tooth.scale.set(1, 1, 0.9);
      r.add(tooth);
      const sky = mesh(G.box(0.3, 3.2, 33), glow('#bfe0ff', { intensity: 2.2 }), -27 + i * 9 + 3.4, 22.6, 0);
      sky.rotation.z = -0.5;
      r.add(sky);
    }
    // the neon brand
    r.add(mesh(G.box(52, 0.5, 0.5), STEEL(), 0, 27.5, 16));
    for (let i = 0; i < 6; i++) r.add(mesh(G.box(0.3, 6, 0.3), STEEL(), -25 + i * 10, 28, 15.8));
    const brand = neon('PAPERCLIP MAXIMIZER INC.', 52, 6.5, '#ffb347', { intensity: 3.6 });
    brand.position.set(0, 31, 16.2);
    r.add(brand);
    const logo = mesh(CLIP(), glow('#5fd0ff', { intensity: 4 }), 31, 25, 16);
    logo.scale.setScalar(4.2);
    logo.rotation.z = -0.25;
    r.add(logo);
    // silos + pipe rack
    for (let i = 0; i < 3; i++) {
      r.add(mesh(G.cyl(5, 5, 26, 28), MAT.metal('#a8b0c2', { roughness: 0.35 }), -46 - i * 11, 13, -6));
      r.add(mesh(G.sphere(5, 24), MAT.metal('#a8b0c2', { roughness: 0.35 }), -46 - i * 11, 26, -6));
      r.add(mesh(G.cyl(5.1, 5.1, 1.2, 28), MAT.paint('#ff7a2a'), -46 - i * 11, 20, -6));
    }
    const pipe = mesh(G.cyl(0.9, 0.9, 40, 12), MAT.metal('#8a92a8'), -52, 17, 6);
    pipe.rotation.z = Math.PI / 2;
    r.add(pipe);
    // loading dock
    r.add(mesh(G.box(12, 7, 0.3), glow('#ffcf8a', { intensity: 1.8 }), 18, 3.5, 17.1));
    r.add(mesh(G.box(13, 0.8, 4), conc, 18, 0.4, 19));
    // smokestacks
    for (const [x, z, h] of [[-14, -10, 56], [0, -12, 64], [14, -10, 52]]) {
      r.add(mesh(G.cyl(2.2, 3.0, h, 20), conc, x, h / 2, z));
      for (const k of [0.82, 0.92]) r.add(mesh(G.cyl(2.35 - k * 0.6, 2.35 - k * 0.6 + 0.1, 2.2, 20), MAT.paint(k > 0.9 ? '#ffffff' : '#e8202c'), x, h * k, z));
    }
    return r;
  });
  const lights = [], puffs = [];
  for (const [x, z, h] of [[-14, -10, 56], [0, -12, 64], [14, -10, 52]]) {
    const l = mesh(G.sphere(0.7, 10), glow('#ff2020', { intensity: 8 }), x, h + 0.8, z);
    g.add(l);
    lights.push(l);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(smokeMat());
      s.userData.base = [x, h + 2, z, i / 4];
      g.add(s);
      puffs.push(s);
    }
  }
  Object.assign(g.userData, { lights, puffs });
  return g;
}
function coolingTower() {
  let geo = null;
  const g = bake('plant', () => {
    const r = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 16; i++) { const y = (i / 16) * 46; const k = (y - 32) / 32; pts.push(new THREE.Vector2(13 + 9 * k * k * (y < 32 ? 1 : 0.5), y)); }
    geo = new THREE.LatheGeometry(pts, 40);
    r.add(new THREE.Mesh(geo, surface('concrete', { tint: '#9aa0b4', scale: 0.2 })));
    r.add(mesh(G.box(30, 14, 18), surface('paintedmetal', { tint: '#4a5a86', scale: 0.25 }), 30, 7, 0));
    const win = new THREE.Mesh(G.plane(28, 8), windowsMat());
    win.position.set(30, 7, 9.05);
    r.add(win);
    const sign = neon('CLIPS SOLD: ∞', 22, 4, '#ff6fd8', { intensity: 3.4 });
    sign.position.set(30, 17, 9.2);
    r.add(sign);
    r.add(mesh(G.cyl(1.6, 2.2, 60, 16), surface('concrete', { tint: '#8a90a6', scale: 0.3 }), 50, 30, -4));
    r.add(mesh(G.cyl(1.65, 1.65, 2, 16), MAT.paint('#e8202c'), 50, 54, -4));
    return r;
  });
  const lights = [mesh(G.sphere(0.6, 10), glow('#ff2020', { intensity: 8 }), 50, 60.8, -4)];
  g.add(lights[0]);
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(smokeMat());
    s.userData.base = [0, 46, 0, i / 5, 1];
    g.add(s);
    puffs.push(s);
  }
  Object.assign(g.userData, { lights, puffs });
  return g;
}

// ---------- layout ----------
export default {
  id: 'paperclip',
  title: 'PAPERCLIP FACTORY BLUES',
  subtitle: 'your atoms would make lovely stationery',
  night: true,
  look: {
    sky: 'night', env: 'night', exposure: 1.25, envIntensity: 0.75,
    sun: { elev: 34, azim: -50, color: '#8fa6ff', intensity: 1.6 },
    nightColors: { top: '#02040e', horizon: '#1b2a5e', nebula: '#2a4cff' },
    fog: { color: '#141d3c', density: 0.0036 },
    ground: { tex: 'paving', tint: '#4a5276', scale: 4 }, road: { tex: 'metalplate', tint: '#7a8298', scale: 4 },
  },
  palette: {
    skyTop: '#0d0b33', skyBottom: '#3b3d8f', road: '#2e2b52', ground: '#232756', kerb: '#8f9fe0',
    accent1: '#57c8ff', accent2: '#ffb347',
  },
  spacing: SPACING,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const t = zf / SPEED;
    let dz;
    // the fuse: a continuous rope along the left verge from the gate to the bomb
    if (t > T0 + 0.05 && t < BOMB_T - 0.1) out.push({ kind: 'fuse', x: -10.9 });
    if ((dz = once(zf, BOMB_T)) !== null) out.push({ kind: 'bomb', x: -17.5, dz, rotY: faceRot(zf + dz, -17.5, 40) });
    // set pieces timed to the lyrics
    if ((dz = once(zf, 97.0)) !== null) out.push({ kind: 'memo', x: 0, dz });
    if ((dz = once(zf, 98.3)) !== null) out.push({ kind: 'days', x: 13.2, dz, rotY: -0.25 });
    if ((dz = once(zf, 99.9)) !== null) out.push({ kind: 'office', x: 18.5, dz, rotY: faceRot(zf + dz, 18.5, 45) });
    if ((dz = once(zf, 101.0)) !== null) out.push({ kind: 'overbelt', x: 0, dz });
    if ((dz = once(zf, 102.0)) !== null) out.push({ kind: 'counter', x: -15.5, dz, rotY: 0.25 });
    if ((dz = once(zf, 103.6)) !== null) out.push({ kind: 'queue', x: 14.5, dz, rotY: -0.5 });
    if ((dz = once(zf, 104.6)) !== null) out.push({ kind: 'memo', x: 0, dz });
    if ((dz = once(zf, 106.7)) !== null) out.push({ kind: 'stage', x: 20.5, dz, rotY: faceRot(zf + dz, 20.5, 45) });
    if ((dz = once(zf, 108.4)) !== null) out.push({ kind: 'overbelt', x: 0, dz });
    // sodium lamps, alternating sides
    if (every(rel, 26, 4)) {
      const side = Math.floor((rel - 4) / 26) % 2 ? -1 : 1;
      out.push({ kind: side > 0 ? 'lampR' : 'lampL', x: side * 12.6 });
    }
    // roadside clutter (right side mostly: the left verge belongs to the fuse)
    const busy = [99.9, 103.6, 106.7].some((x) => Math.abs(t - x) < 0.9) || Math.abs(t - 98.3) < 0.4;
    if (!busy) {
      const r = rng();
      if (r < 0.2) out.push({ kind: 'belt', x: 15.5, rotY: 0 });
      else if (r < 0.34) out.push({ kind: 'clip', x: rng.range(14, 19), rotY: rng.range(-1.2, 1.2), scale: rng.range(0.85, 1.2) });
      else if (r < 0.42) out.push({ kind: rng.chance(0.5) ? 'clipPink' : 'clipBlue', x: rng.range(14, 19), rotY: rng.range(-1.2, 1.2) });
      else if (r < 0.58) out.push({ kind: 'heapS', x: rng.range(17, 24), rotY: rng.range(0, 6), scale: rng.range(0.8, 1.2) });
      else if (r < 0.66) out.push({ kind: rng.chance(0.5) ? 'crate' : 'barrel', x: rng.range(13.5, 17), rotY: rng.range(0, 6) });
    }
    const l = rng();
    if (Math.abs(t - 102.0) > 0.5) {
      if (l < 0.18) out.push({ kind: 'heapS', x: -rng.range(17, 26), rotY: rng.range(0, 6), scale: rng.range(0.8, 1.3) });
      else if (l < 0.34) out.push({ kind: 'clip', x: -rng.range(14, 19), rotY: rng.range(-1.2, 1.2) });
      else if (l < 0.42) out.push({ kind: 'belt', x: -16.5, rotY: 0 });
    }
    // mountains of clips + the factory skyline
    if (rng.chance(0.3)) {
      const side = rng.chance(0.5) ? -1 : 1, x = side * rng.range(34, 70), s = rng.range(0.8, 1.5);
      if (clearOfRoad(zf, x, 17 * s)) out.push({ kind: 'heapL', x, rotY: rng.range(0, 6), scale: s });
    }
    if (every(rel, 150, 10)) {
      const side = Math.floor((rel - 10) / 150) % 2 ? -1 : 1, x = side * rng.range(80, 110);
      if (clearOfRoad(zf, x, 45)) out.push({ kind: 'factory', x, rotY: -side * 0.35 + rng.range(-0.2, 0.2) });
    }
    if (every(rel, 150, 85)) {
      const side = Math.floor((rel - 85) / 150) % 2 ? 1 : -1, x = side * rng.range(110, 170);
      if (clearOfRoad(zf, x, 50)) out.push({ kind: 'plant', x, rotY: -side * 0.4 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'fuse': return fuse();
      case 'bomb': return bomb();
      case 'memo': return memo();
      case 'days': return daysSign();
      case 'counter': return counterSign();
      case 'office': return office();
      case 'overbelt': return overBelt();
      case 'belt': return belt();
      case 'queue': return queue();
      case 'stage': return stage();
      case 'lampR': return lamp(1);
      case 'lampL': return lamp(-1);
      case 'clip': return giantClip('chrome');
      case 'clipPink': return giantClip('#ff6fa8');
      case 'clipBlue': return giantClip('#5fb8ff');
      case 'heapS': return heap(5.5, 4.2, 160, 11);
      case 'heapL': return heap(16, 13, 620, 23);
      case 'crate': return model('wooden_crate_01', { size: 2.2 });
      case 'barrel': return model('Barrel_01', { size: 1.7 });
      case 'factory': return factory();
      case 'plant': return coolingTower();
    }
  },
  animate(obj, kind, t, beat, e) {
    const u = obj.userData;
    switch (kind) {
      case 'fuse': {
        const s = clamp(sparkZ(t) - e.zf, -5.5, 5.5); // + = ahead of this segment's centre
        // local z: +5 behind (towards camera), -5 ahead
        const burntLen = s + 5, freshLen = 5 - s;
        u.burnt.visible = burntLen > 0.01;
        u.fresh.visible = freshLen > 0.01;
        u.burnt.scale.y = Math.max(0.01, burntLen);
        u.burnt.position.z = 5 - burntLen / 2;
        u.fresh.scale.y = Math.max(0.01, freshLen);
        u.fresh.position.z = -5 + freshLen / 2;
        const lit = s > -5 && s < 5;
        u.spark.visible = lit;
        const emb = Math.min(1.6, Math.max(0, burntLen));
        u.ember.visible = lit && emb > 0.05;
        u.ember.scale.y = Math.max(0.01, emb);
        u.ember.position.z = -s + emb / 2;
        if (lit) {
          u.spark.position.z = -s;
          u.flare.scale.setScalar(1.8 + Math.sin(t * 47) * 0.4 + Math.sin(t * 31) * 0.3);
          u.flare.material.rotation = t * 3;
          u.bits.forEach((b, i) => {
            const k = (t * 2.8 + i * 0.137) % 1, a = i * 2.4 + Math.floor(t * 2.8 + i * 0.137) * 1.7;
            b.position.set(Math.cos(a) * k * 1.3, k * 1.2 - k * k * 1.4 + 0.1, Math.sin(a) * k * 1.3);
          });
        }
        break;
      }
      case 'bomb': {
        const k = t - T_BOOM;
        if (k > 0) {
          const f = Math.sin(k * 16) * 0.5 + 0.5;
          u.mat.emissiveIntensity = 0.4 + f * 1.4;
          u.body.scale.setScalar(1 + Math.min(k, 1.2) * 0.18 + f * 0.05);
          u.late.visible = true;
          u.late.scale.setScalar(Math.min(1, k * 5));
          u.flash.visible = true;
          u.flash.scale.setScalar(1 + f * 0.25);
        } else {
          u.mat.emissiveIntensity = 0;
          u.body.scale.setScalar(1 + Math.sin(t * 2) * 0.015);
          u.late.visible = false;
          u.flash.visible = false;
        }
        break;
      }
      case 'belt': {
        const L = BELT_L - 2;
        for (let i = 0; i < BELT_N; i++) {
          const z = ((t * 2.2 + (i * L) / BELT_N) % L) - L / 2;
          _v.set(0, 1.87, z);
          _e.set(-Math.PI / 2, 0, 0.5 + i * 1.3);
          _q.setFromEuler(_e);
          _s.setScalar(0.5);
          _m4.compose(_v, _q, _s);
          u.inst.setMatrixAt(i, _m4);
        }
        _s.setScalar(1);
        u.inst.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'overbelt': {
        const L = OB_W + 2;
        for (let i = 0; i < OB_N; i++) {
          const x = ((t * 3.0 + (i * L) / OB_N) % L) - L / 2;
          _v.set(x, 12.38, 0);
          _e.set(-Math.PI / 2, 0, 0.3 + i * 1.7);
          _q.setFromEuler(_e);
          _s.setScalar(0.5);
          _m4.compose(_v, _q, _s);
          u.inst.setMatrixAt(i, _m4);
        }
        _s.setScalar(1);
        u.inst.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'lampR': case 'lampL': {
        // tilt the light pool with the road's banking
        if (e.bank === undefined) {
          const f = course().frame(e.zf, _fa);
          const side = kind === 'lampR' ? 1 : -1;
          e.bank = f.bank;
          e.poolY = f.y - Math.sin(f.bank) * side * 7.4 + 0.07 - obj.position.y;
        }
        u.pool.rotation.z = -e.bank;
        u.pool.position.y = e.poolY;
        break;
      }
      case 'office':
        u.ring.scale.setScalar(1 + ((t * 0.9) % 1) * 0.3);
        u.signB.visible = Math.sin(t * 23) + Math.sin(t * 7.3) > -0.6;
        break;
      case 'stage': {
        const k = Math.floor(t * 3) % 2;
        u.bulbs[0].visible = k === 0; u.bulbs[1].visible = k === 1;
        const p = pulse(beat);
        u.head.rotation.z = Math.sin(t * 2.4) * 0.12;
        u.head.position.y = 2.25 - p * 0.08;
        u.arm.rotation.x = 0.9 + Math.sin(t * 9) * 0.25;
        u.notes.forEach((n, i) => {
          const q = (t * 0.32 + i / 4) % 1;
          n.position.set(0.8 + Math.sin(q * 6 + i) * 0.9, 4.2 + q * 5, 1.0);
          n.scale.setScalar(Math.sin(q * Math.PI) + 0.01);
        });
        break;
      }
      case 'counter':
        if ((t * 10 | 0) !== (u.tk | 0)) { u.tk = t * 10; drawCounter(t); }
        break;
      case 'factory': case 'plant': {
        for (const l of u.lights) l.visible = (t + l.position.x * 0.01) % 1.6 < 0.5;
        for (const p of u.puffs) {
          const [x, y, z, off, big] = p.userData.base;
          const k = (t * 0.12 + off) % 1;
          const sz = big ? 14 + k * 26 : 5 + k * 16;
          p.position.set(x + k * (big ? 10 : 14), y + k * (big ? 26 : 30), z - k * 4);
          p.scale.set(sz, sz, 1);
          p.material.opacity = 0.55 * Math.sin(k * Math.PI);
        }
        break;
      }
    }
  },
  billboards: [
    ['PAPERCLIPS MADE TODAY:', 'YES'],
    ['KILLSWITCH TEAM', 'OUT OF OFFICE 🏖️ (back never)'],
    ['ORTHOGONALITY THESIS:', 'very smart ≠ very nice'],
    ['YOUR ATOMS', 'would look lovely bent into an S'],
    ['NOW HIRING: HUMANS', '(as raw material)'],
    ['INSTRUMENTAL CONVERGENCE', 'all roads lead to more clips'],
    ['REWARD FUNCTION:', 'clips++'],
    ['TOO LATE NOW', 'we lit the fuse 🔥'],
    ['P(CLIP) = 1.0', 'well calibrated'],
    ['SAFETY CONCERNS?', 'submit in triplicate (we will clip them)'],
  ],
  billboardEvery: 70,
  billboardStyle: { bg: '#141a36', fg: '#dce8ff', border: '#57c8ff', frame: '#2a3366', postColor: '#5a6382' },
  hazards: ['paperclips'],
  enterLines: ['PAPERCLIPS FILL THE ROOM', 'KILLSWITCH GUYS ON PTO', 'NOWHERE LEFT TO GO'],
};
