// SHARP LEFT TURN (bridge 1, "Forward MLP, backward, repeat"): you glide down from space into a sunset desert canyon.
// Layered sandstone mesas, buttes, hoodoos and a natural arch over the road, ribbed saguaros, quiver trees, rolling
// tumbleweeds, a FORWARD/BACKWARD/REPEAT highway gantry, the ruined Museum of von Neumann Architecture (OBSOLETE),
// a hairpin wrapped around a giant mesa and lined with flashing chevrons exactly on "Sharp left turn and there you
// are", "NO CDR FOR 400 MILES" and the last GPU gas station before nowhere.
// sec.escalate (s8, quiet "Gato, please don't let me go"): a clifftop road at golden hour. The left side is a sheer
// drop to the ocean (engine draws cliff + rail + sea); a lighthouse on a sea stack, a lonely bronze cat statue
// called GATO gazing into the sunset, and little hand-painted "DON'T LET ME GO" signs on the right.
import { THREE, toon, glow, G, mesh, textTexture, roundRect, MAT, FONT, makeRng, clamp } from '../toolkit.js';
import { surface } from '../textures.js';
import { model } from '../models.js';
import { LOOKS } from '../looks.js';
import { Course, SPEED, ROAD_HALF } from '../course.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SPACING = 10;
const H = ROAD_HALF; // road half width
const INK = '#1d1626';
const SIGN_Y = '#ffcc2e';
const HWY = '#17693c';

// song times (s) of the set pieces
const T_LAND = 77.5;
const T_HAIR = [80.4, 83.3];
const T_CLIFF = 88.4;

// ---------- looks ----------
// v3: the desert inherits the atmosphere pass's 'badlands' entry in looks.js (sky, haze, clouds, far mesas, fog). The
// clifftop only swings the low sun out over the sea on the left, so the sunset sits over the ocean.
const DESERT_LOOK = {};
// v3 QA: thinner haze with less sun in-scatter over the sea, so the ocean reads blue instead of washing to beige sand
const CLIFF_LOOK = { sun: { elev: 12, azim: -78, color: '#ffb35c', intensity: 3.4 }, haze: { k: 0.42, sun: 0.45, desat: 0.12 } };
/** the ground material spec the engine uses here (so the apron / dunes / hairpin floor match the terrain) */
const groundSpec = () => ({ tex: 'sand', tint: '#e8b48a', scale: 7, ...(LOOKS.badlands?.ground || {}) });

// ---------- course access (for set pieces that hug the road) ----------
let _C = null;
const course = () => (_C ||= new Course(SPEED));
const _fa = {}, _fb = {};
/** rotY that turns a prop at (z, lat) to face a point `back` units behind it on the road */
function faceRot(z, lat, back = 30, aimLat = 0) {
  const C = course();
  const f = C.frame(z, _fa);
  const px = f.x + Math.cos(f.yaw) * lat, pz = f.z + Math.sin(f.yaw) * lat;
  const d = C.frame(z - back, _fb);
  return Math.atan2(d.x + Math.cos(d.yaw) * aimLat - px, d.z + Math.sin(d.yaw) * aimLat - pz) + f.yaw;
}
/** true if a landmark of radius `rad` at (z, lat) keeps clear of the whole road nearby (hairpins!) */
function clearOfRoad(z, lat, rad) {
  const C = course();
  const f = C.frame(z, _fa);
  const px = f.x + Math.cos(f.yaw) * lat, pz = f.z + Math.sin(f.yaw) * lat;
  const r2 = (rad + H + 6) ** 2;
  for (let s = z - 520; s <= z + 520; s += 6) {
    const g = C.frame(s, _fb);
    if ((g.x - px) ** 2 + (g.z - pz) ** 2 < r2) return false;
  }
  return true;
}
let _seaY = null;
function seaY() {
  if (_seaY !== null) return _seaY;
  const C = course();
  const f = C.features.find((x) => x.type === 'cliff');
  let m = 1e9;
  if (f) for (let s = f.s[0]; s <= f.s[1]; s += 5) m = Math.min(m, C.frame(s, _fa).y);
  _seaY = (f ? m : 6) - 48;
  return _seaY;
}
const SEA_BASE = -100; // local y of the base of sea props (placed as overhead props, see seaProp())

// ---------- terrain noise (mirrors track.js so the glide apron continues the hills seamlessly) ----------
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }
function hills(s, lat) {
  const a = Math.abs(lat);
  const amp = a < H + 8 ? 0 : a < 40 ? (a - H - 8) / (40 - H - 8) * 6 : a < 120 ? 6 + (a - 40) * 0.35 : 34 + (a - 120) * 0.45;
  return amp * (fbm(s * 0.006 + (lat > 0 ? 50 : 0), a * 0.012) - 0.25);
}

// ---------- generic helpers ----------
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
/** lit sign material (sunlit + a little self illumination so it reads in shadow) */
function litMat(key, tex, { emissive = 0.22, roughness = 0.62, side = THREE.FrontSide, transparent = false, alphaTest = 0 } = {}) {
  let m = faceMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: emissive * 0.4, roughness, metalness: 0, side, transparent, alphaTest });
    faceMats.set(key, m);
  }
  return m;
}
function face(key, tex, w, h, opts) { return new THREE.Mesh(G.plane(w, h), litMat(key, tex, opts)); }
function textFace(lines, w, h, style = {}, opts = {}) {
  const W = 1024, Hh = Math.round((1024 * h) / w);
  const tex = textTexture(lines, { w: W, h: Hh, radius: 40, borderW: 22, pad: 46, ...style });
  return face('t|' + JSON.stringify([lines, style, w, h, opts]), tex, w, h, opts);
}
function fitText(g, text, x, y, maxW, size, weight = 800) {
  do { g.font = `${weight} ${size}px ${FONT}`; size -= 2; } while (g.measureText(text).width > maxW && size > 8);
  g.fillText(text, x, y);
}

// plain (untextured, non-emissive, opaque) materials fold into shared vertex-colour materials when a prop is baked,
// so a whole sign / station / pole collapses to a couple of draw calls
const VCM = new Map();
function vcKey(mat) {
  if (!mat || mat.map || mat.transparent || mat.vertexColors || mat.side !== THREE.FrontSide || mat.normalMap) return null;
  if (mat.isMeshBasicMaterial) return 'basic';
  if (!mat.isMeshStandardMaterial) return null;
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) return null;
  if (mat.metalness > 0.5) return 'metal';
  if (mat.clearcoat > 0 || mat.roughness < 0.3) return 'gloss';
  return mat.roughness < 0.68 ? 'satin' : 'matte';
}
function vcMat(key) {
  let m = VCM.get(key);
  if (m) return m;
  if (key === 'basic') m = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (key === 'metal') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1 });
  else if (key === 'gloss') m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  else if (key === 'satin') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  VCM.set(key, m);
  return m;
}
/** Bake a static prop once: merge every mesh by material, return a light-weight group sharing the merged geometry. */
const bakeCache = new Map();
function bake(key, build) {
  let parts = bakeCache.get(key);
  if (!parts) {
    const root = build();
    root.updateMatrixWorld(true);
    const by = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      let mat = o.material;
      const vk = vcKey(mat);
      if (vk) {
        const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = mat.color;
        for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        mat = vcMat(vk);
      }
      if (!by.has(mat)) by.set(mat, []);
      by.get(mat).push(g);
    });
    parts = [];
    for (const [mat, gs] of by) {
      const color = gs.some((g) => g.attributes.color);
      for (const g of gs) {
        for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
        const cnt = g.attributes.position.count;
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
        if (color && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3));
        if (!color && g.attributes.color) g.deleteAttribute('color');
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
const tintMats = new Map();
/** CC0 model clone with a shared tinted material. Wrapped: the engine overwrites the root's scale on placement. */
function rmodel(id, size, tint) {
  const o = model(id, { size });
  if (tint) {
    o.traverse((m) => {
      if (!m.isMesh) return;
      const k = m.material.uuid + tint;
      let t = tintMats.get(k);
      if (!t) { t = m.material.clone(); t.color.multiply(new THREE.Color(tint)); tintMats.set(k, t); }
      m.material = t;
    });
  }
  const w = new THREE.Group();
  w.add(o);
  return w;
}
/** wrap a prop so it keeps an intrinsic scale (the engine sets the root's scale to the layout's `scale`) */
function sized(obj, k) {
  obj.scale.multiplyScalar(k);
  const w = new THREE.Group();
  w.add(obj);
  w.userData = obj.userData;
  return w;
}
const once = (zf, t) => { const z = t * SPEED; return z >= zf && z < zf + SPACING ? z - zf : null; };
const every = (rel, period, offset = 0) => rel - offset >= 0 && (rel - offset) % period < SPACING;
const pulse = (b) => Math.pow(1 - b, 3);

// ---------- sandstone: banded rock (rock texture × per-face strata colours) ----------
let _rockV = null;
function rockV() {
  if (!_rockV) {
    _rockV = surface('rock', { tint: '#ffffff', scale: 9, roughness: 0.9 }).clone();
    _rockV.vertexColors = true;
    _rockV.color.setScalar(2.5); // the CC0 rock is dark brown: lift it into toy sandstone
    _rockV.envMapIntensity = 0.7;
  }
  return _rockV;
}
const STRATA = ['#f3a36c', '#e3804f', '#f8c890', '#cf6740', '#ee9a60', '#d9744a', '#f6b67c', '#bf5a3a'].map((c) => new THREE.Color(c));
const SEA_ROCK = ['#c9a387', '#b88b6c', '#d8b89a', '#a97c62', '#c29878'].map((c) => new THREE.Color(c));
function strata(geo, seed = 0, pal = STRATA, band = 3.3, ground = -6) {
  // v3: coloured per vertex (bands blend over one triangle instead of zig-zagging along the faces)
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const yy = y + Math.sin(x * 0.06 + seed) * 1.1 + Math.sin(z * 0.045 + seed * 2.3) * 0.8;
    const k = Math.floor(yy / band + seed * 3.7);
    const c = pal[((k % pal.length) + pal.length) % pal.length];
    const ao = 0.72 + 0.28 * clamp((y - ground) / 10, 0, 1);
    col[i * 3] = c.r * ao; col[i * 3 + 1] = c.g * ao; col[i * 3 + 2] = c.b * ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function blobPts(R, seed, { n = 30, rough = 0.16, sx = 1, sz = 1 } = {}) {
  const r = makeRng(seed);
  const a = [r() * 6, r() * 6, r() * 6, r() * 6];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const k = 1 + rough * (0.55 * Math.sin(3 * th + a[0]) + 0.3 * Math.sin(5 * th + a[1]) + 0.15 * Math.sin(9 * th + a[2]) + 0.08 * Math.sin(17 * th + a[3]));
    pts.push(new THREE.Vector2(Math.cos(th) * R * k * sx, Math.sin(th) * R * k * sz));
  }
  return pts;
}
function slab(pts, y0, h, bevel = 1.2) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: Math.max(0.1, h - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    steps: Math.max(1, Math.round(h / 1.3)), curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
  return g.index ? g.toNonIndexed() : g;
}
const geoCache = new Map();
const MESAS = {
  // [radius, {sx, sz}, seed, layers: [scale, y0, h]]
  mesaA: [30, {}, 11, [[1, -8, 15], [0.92, 7, 9], [0.85, 16, 13], [0.79, 29, 4.5]]],
  mesaB: [21, { sx: 1.9 }, 23, [[1, -8, 19], [0.88, 11, 14], [0.8, 25, 6]]],
  butte: [10, {}, 5, [[1, -8, 22], [0.9, 14, 15], [0.82, 29, 13], [1.1, 42, 3.6]]],
  spire: [5, { rough: 0.22 }, 9, [[1, -6, 12], [0.8, 6, 8], [0.66, 14, 8], [0.78, 22, 6], [1.3, 28, 3]]],
  ridge: [15, { sx: 3, sz: 0.85 }, 31, [[1, -8, 11], [0.85, 3, 8], [0.7, 11, 6]]],
  stack: [9, { rough: 0.25 }, 41, [[1.25, 0, 17], [1.0, 17, 18], [0.85, 35, 12], [0.95, 47, 3]]], // sea stack (base at y=0, 50 tall)
  // v3 canyon walls: long layered cliffs lining the road (long axis along the road), 57 / 37 tall before scaling
  wall: [22, { sx: 0.62, sz: 2.4, rough: 0.2 }, 61, [[1, -8, 20], [0.92, 12, 16], [0.85, 28, 15], [0.8, 43, 11], [0.86, 54, 3.4]]],
  wall2: [18, { sx: 0.7, sz: 2.0, rough: 0.24 }, 71, [[1, -8, 16], [0.9, 8, 12], [0.84, 20, 14], [0.9, 34, 3.2]]],
};
function mesaGeo(kind) {
  let g = geoCache.get(kind);
  if (g) return g;
  const [R, shape, seed, layers] = MESAS[kind];
  const parts = layers.map(([k, y0, h], i) => slab(blobPts(R * k, seed + (i === layers.length - 1 ? 0 : i * 0.01), { ...shape }), y0, h, Math.min(1.6, R * k * 0.12)));
  g = mergeGeometries(parts, false);
  strata(g, seed * 0.37, kind === 'stack' ? SEA_ROCK : STRATA, kind === 'stack' ? 5 : 3.3, kind === 'stack' ? 0 : -8);
  g.computeBoundingSphere();
  geoCache.set(kind, g);
  return g;
}
function rockForm(kind) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(mesaGeo(kind), rockV());
  g.add(m);
  return g;
}

// ---------- the natural arch over the road (overhead prop: geometry shifted down by its y=6) ----------
function archGeo() {
  let g = geoCache.get('arch');
  if (g) return g;
  const pts = [[-27, -12], [-26, 2], [-23, 15], [-15, 25], [-2, 29.5], [11, 27], [21, 18], [25.5, 5], [27, -12]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 72, 5.2, 16, false);
  const p = tube.attributes.position, nr = tube.attributes.normal, uv = tube.attributes.uv;
  const len = curve.getLength();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1.3 * Math.sin(x * 0.31 + y * 0.17) * Math.sin(y * 0.27 + z * 0.4 + 1.3) + 0.6 * Math.sin(x * 0.9 + z * 0.7) + (y > 22 ? 1.2 : 0);
    p.setXYZ(i, x + nr.getX(i) * d, y + nr.getY(i) * d, z * 1.55 + nr.getZ(i) * d);
    uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 36);
  }
  tube.computeVertexNormals();
  const parts = [tube.toNonIndexed()];
  for (const sx of [-1, 1]) {
    parts.push(slab(blobPts(9, 50 + sx, { sz: 1.2 }), -16, 12, 1.4).translate(sx * 27, 0, 0));
    parts.push(slab(blobPts(6.5, 60 + sx), -4, 7, 1.2).translate(sx * 27.5, 0, 0));
  }
  for (const q of parts) for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n);
  g = mergeGeometries(parts, false);
  strata(g, 1.7, STRATA, 3.3, -14);
  g.translate(0, -6, 0);
  g.computeBoundingSphere();
  geoCache.set('arch', g);
  return g;
}
function arch() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(archGeo(), rockV()));
  // a little sign bolted to the arch
  const sign = textFace(['BACKPROP CANYON', 'gradients may vanish without warning'], 9, 2.1, { bg: '#5a3a24', fg: '#fff1d6', border: '#f2d2a0' });
  sign.position.set(0, 19.5, 6.3);
  g.add(sign);
  return g;
}

// ---------- world-space set pieces (built from the course, transform reset every frame) ----------
/** the ground under the glide: continues the desert hills backwards so you land INTO a canyon, not onto a slab */
function apron() {
  return bake('apron', () => {
    const C = course();
    const s0 = T_LAND * SPEED;
    const f = C.frame(s0 + 0.5, {});
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
    const tx = Math.sin(f.yaw), tz = -Math.cos(f.yaw);
    const L = [0, H + 1.3, H + 4, H + 10, H + 22, H + 45, H + 90, H + 160, H + 300];
    const lats = [...L.slice(1).map((v) => -v).reverse(), ...L];
    const pos = [], uv = [], idx = [];
    let rows = 0;
    for (let d = -4; d <= 340; d += 4, rows++) {
      const s = s0 - d;
      for (const lat of lats) {
        const y = f.y - 0.36 + hills(s, lat);
        pos.push(f.x - tx * d + cy * lat, y, f.z - tz * d + sy * lat);
        uv.push(lat, s);
      }
    }
    const cols = lats.length;
    for (let r = 0; r < rows - 1; r++) for (let k = 0; k < cols - 1; k++) {
      const a = r * cols + k, b = a + 1, c = a + cols, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const l = groundSpec();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, surface(l.tex, { tint: l.tint, scale: l.scale })));
    return g;
  });
}
/** the giant layered mesa the hairpin wraps around (fills the terrain gap on the inside of the turn) */
function hairpinMesa() {
  const g = bake('hairpin', () => {
    const C = course();
    const sA = 78.5 * SPEED, sB = 85.8 * SPEED;
    // v3: the hairpin is tight (centre radius ≈ 36): the base keeps 14 − bevel ≥ 12.6 from the centre line (kerbs end at 11.8)
    const layers = [[14, -6, 13], [16.2, 7, 10], [18.8, 17, 12], [21.4, 29, 11], [23.4, 40, 10], [22.6, 50, 2.8]];
    const parts = [];
    const fr = {};
    for (const [c, y0, h] of layers) {
      const pts = [];
      for (let s = sA; s <= sB; s += 3) {
        C.frame(s, fr);
        pts.push(new THREE.Vector2(fr.x - Math.cos(fr.yaw) * c, -(fr.z - Math.sin(fr.yaw) * c)));
      }
      parts.push(slab(pts, y0, h, 1.4));
    }
    const geo = mergeGeometries(parts, false);
    strata(geo, 0.6, STRATA, 3.3, -6);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, rockV()));
    // sand floor between the two legs of the hairpin (the terrain leaves a hole there next to the landing)
    {
      const pts = [];
      for (let s = 75 * SPEED; s <= 85.8 * SPEED; s += 3) {
        C.frame(s, fr);
        pts.push(new THREE.Vector2(fr.x - Math.cos(fr.yaw) * 12.4, -(fr.z - Math.sin(fr.yaw) * 12.4)));
      }
      const fl = slab(pts, -2.4, 2.0, 0);
      const p = fl.attributes.position, uv = fl.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7, p.getZ(i) / 7);
      const l = groundSpec();
      const floor = new THREE.Mesh(fl, surface(l.tex, { tint: l.tint, scale: 1 }));
      floor.receiveShadow = true;
      root.add(floor);
    }
    // Hollywood-style letters on the rim, facing the glide in
    C.frame(T_HAIR[0] * SPEED + 0.48 * (T_HAIR[1] - T_HAIR[0]) * SPEED, fr);
    const cx = fr.x - Math.cos(fr.yaw) * 31, cz = fr.z - Math.sin(fr.yaw) * 31;
    const a = C.frame(78.0 * SPEED, {});
    const hd = Math.atan2(-Math.sin(a.yaw), Math.cos(a.yaw)); // face back up the approach
    const letters = new THREE.Group();
    letters.position.set(cx, 52.6, cz);
    letters.rotation.y = hd;
    const tex = canvasTex('hollywood', 2048, 256, (g2, w, h) => {
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.lineJoin = 'round'; g2.lineWidth = 26; g2.strokeStyle = '#3a2418';
      g2.font = `900 210px ${FONT}`;
      g2.strokeText('SHARP LEFT TURN', w / 2, h / 2 + 6);
      g2.fillStyle = '#fff8ec';
      g2.fillText('SHARP LEFT TURN', w / 2, h / 2 + 6);
    });
    const lp = face('hollywood', tex, 46, 5.75, { emissive: 0.35, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide });
    lp.position.y = 4.4;
    letters.add(lp);
    const steel = MAT.metal('#8a8f99');
    for (let i = -5; i <= 5; i++) letters.add(mesh(G.box(0.35, 7, 0.35), steel, i * 4.2, 3.4, -0.6));
    letters.add(mesh(G.box(44, 0.3, 0.3), steel, 0, 2.2, -0.6));
    letters.add(mesh(G.box(44, 0.3, 0.3), steel, 0, 6.2, -0.6));
    root.add(letters);
    return root;
  });
  // a couple of boulders and a quiver tree on the rim (unbaked models)
  const C = course();
  const fr = C.frame(79.4 * SPEED, {});
  const tree = model('quiver_tree_02', { size: 12 });
  tree.position.set(fr.x - Math.cos(fr.yaw) * 31, 52.6, fr.z - Math.sin(fr.yaw) * 31);
  g.add(tree);
  const f2 = C.frame(84.9 * SPEED, {});
  const b = rmodel('namaqualand_boulder_02', 8, '#f0b08a');
  b.position.set(f2.x - Math.cos(f2.yaw) * 19, f2.y - 0.6, f2.z - Math.sin(f2.yaw) * 19);
  b.rotation.y = 1.2;
  g.add(b);
  return g;
}

/** the headland where the clifftop ends: a sea-cliff face that hides the terrain step at the end of the cliff */
function headland() {
  return bake('headland', () => {
    const C = course();
    const cf = C.features.find((x) => x.type === 'cliff');
    const sEnd = cf ? cf.s[1] : 95.76 * SPEED;
    const sc = sEnd - 1.5;
    const f = C.frame(sc, {});
    const fN = C.frame(sEnd + 4, {});
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), tx = Math.sin(f.yaw), tz = -Math.cos(f.yaw);
    const lats = [-10.4, -11.5, -13, -16, -19, -25, -31, -40, -54, -70, -99, -130, -169, -220, -260, -309];
    const V = 16, low = seaY() - 5;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      for (const lat of lats) {
        const top = fN.y - 0.2 + hills(sEnd + 4, lat);
        const y = low + (top - low) * Math.pow(v, 0.9);
        const n = Math.sin(lat * 0.21 + y * 0.13) * 1.6 + Math.sin(lat * 0.07 - y * 0.31 + 1.7) * 2.2 + Math.sin(y * 0.6 + lat) * 0.6;
        const bulge = Math.pow(1 - v, 0.8) * 14 + 3 + n * (0.4 + (1 - v));
        pos.push(f.x + cy * lat - tx * bulge, y, f.z + sy * lat - tz * bulge);
        uv.push(lat + n, y);
      }
    }
    const cols = lats.length;
    for (let j = 0; j < V; j++) for (let k = 0; k < cols - 1; k++) {
      const a = j * cols + k, b = a + 1, c = a + cols, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const g2 = strata(geo.toNonIndexed(), 2.2, SEA_ROCK, 4.5, low);
    const mat = rockV().clone();
    mat.side = THREE.DoubleSide;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(g2, mat));
    return root;
  });
}

// ---------- signs ----------
function posts(g, w, h, mat = MAT.metal('#9aa0aa'), r = 0.16, z = -0.25) {
  for (const x of [-w / 2, w / 2]) g.add(mesh(G.cyl(r, r, h, 10), mat, x, h / 2, z));
}
function chevronTex() {
  return canvasTex('chevron', 512, 384, (g, w, h) => {
    g.fillStyle = INK; roundRect(g, 0, 0, w, h, 34); g.fill();
    g.fillStyle = '#e8202c'; roundRect(g, 14, 14, w - 28, h * 0.68 - 14, 22); g.fill();
    g.fillStyle = '#ffffff';
    const my = 14 + (h * 0.68 - 14) / 2, half = 92;
    for (let i = 0; i < 3; i++) {
      const cx = 110 + i * 132;
      g.beginPath();
      g.moveTo(cx + 40, my - half); g.lineTo(cx - 44, my); g.lineTo(cx + 40, my + half);
      g.lineTo(cx + 92, my + half); g.lineTo(cx + 8, my); g.lineTo(cx + 92, my - half); g.closePath(); g.fill();
    }
    g.fillStyle = SIGN_Y; roundRect(g, 14, h * 0.68 + 8, w - 28, h * 0.32 - 22, 16); g.fill();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, '⚠ SHARP LEFT TURN', w / 2, h * 0.84 + 4, w - 70, 66, 900);
  });
}
let chevMat = null;
function chevron() {
  const g = bake('chevron', () => {
    const r = new THREE.Group();
    // MK-style chevron board: ≈ 4.6 wide, top at ≈ 4.7 (2.5 kh), on two stubby posts
    posts(r, 2.8, 1.6, MAT.metal('#8e949e'), 0.13, -0.2);
    r.add(mesh(G.rbox(4.75, 3.55, 0.22, 0.12), toon('#25202c', { roughness: 0.6 }), 0, 2.95, -0.13));
    return r;
  });
  chevMat ||= litMat('chevron', chevronTex(), { emissive: 0.4, roughness: 0.35 });
  const f = new THREE.Mesh(G.plane(4.5, 3.35), chevMat);
  f.position.set(0, 2.95, 0);
  g.add(f);
  return g;
}
function hairpinIcon() {
  return canvasTex('icon:hairpin', 512, 512, (g, s) => {
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate(Math.PI / 4);
    g.fillStyle = INK; roundRect(g, -176, -176, 352, 352, 40); g.fill();
    g.fillStyle = SIGN_Y; roundRect(g, -162, -162, 324, 324, 30); g.fill();
    g.restore();
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 44; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(310, 410); g.lineTo(310, 240); g.arc(240, 240, 70, 0, Math.PI, true); g.lineTo(170, 300); g.stroke();
    g.beginPath(); g.moveTo(120, 290); g.lineTo(220, 290); g.lineTo(170, 370); g.closePath(); g.fill();
  });
}
function warnSign(big) {
  const k = big ? 0.85 : 0.6; // v3: road signs ≈ 6 / 8.7 tall (MK: 4–5, the big one is a hero sign)
  return bake('warn' + k, () => {
    const g = new THREE.Group();
    posts(g, 2.4 * k, 9.5 * k, MAT.metal('#8e949e'), 0.2 * k);
    const d = face('hairpin', hairpinIcon(), 7.2 * k, 7.2 * k, { emissive: 0.3, alphaTest: 0.5 });
    d.position.set(0, 6.6 * k, 0.02);
    g.add(d);
    const back = mesh(G.box(5.1 * k, 5.1 * k, 0.16), toon('#2d2833'), 0, 6.6 * k, -0.1);
    back.rotation.z = Math.PI / 4;
    g.add(back);
    const p = textFace(['SHARP LEFT TURN'], 6.4 * k, 1.35 * k, { bg: SIGN_Y, fg: INK, border: INK, weight: 900 }, { emissive: 0.3 });
    p.position.set(0, 2.2 * k, 0.02);
    g.add(p);
    const p2 = textFace(['(capabilities only)'], 5 * k, 0.95 * k, { bg: '#ffffff', fg: INK, border: INK }, { emissive: 0.3 });
    p2.position.set(0, 1.0 * k, 0.02);
    g.add(p2);
    g.add(mesh(G.box(6.6 * k, 2.6 * k, 0.12), toon('#2d2833'), 0, 1.7 * k, -0.08));
    return g;
  });
}
function diamond(key, lines, sub) {
  return bake('dia:' + key, () => {
    const g = new THREE.Group();
    posts(g, 0.01, 7.6, MAT.metal('#8e949e'), 0.15);
    const tex = canvasTex('dia:' + key, 512, 512, (x, s) => {
      x.save(); x.translate(s / 2, s / 2); x.rotate(Math.PI / 4);
      x.fillStyle = INK; roundRect(x, -176, -176, 352, 352, 40); x.fill();
      x.fillStyle = SIGN_Y; roundRect(x, -162, -162, 324, 324, 30); x.fill();
      x.restore();
      x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((l, i) => fitText(x, l, s / 2, s / 2 + (i - (lines.length - 1) / 2) * 70, 300 - Math.abs(i - (lines.length - 1) / 2) * 90, 66, 900));
    });
    const d = face('dia:' + key, tex, 5.4, 5.4, { emissive: 0.3, alphaTest: 0.5 });
    d.position.set(0, 7.4, 0.04);
    g.add(d);
    if (sub) {
      const p = textFace(sub, 4.6, 1.15, { bg: '#ffffff', fg: INK, border: INK }, { emissive: 0.3 });
      p.position.set(0, 3.7, 0.04);
      g.add(p);
    }
    return g;
  });
}
function regSign(key, lines, w = 3.6, h = 4.6) {
  return bake('reg:' + key, () => {
    const g = new THREE.Group();
    posts(g, 0.01, 4.6 + h / 2, MAT.metal('#8e949e'), 0.14);
    const p = textFace(lines, w, h, { bg: '#ffffff', fg: INK, border: INK, radius: 30 }, { emissive: 0.3 });
    p.position.set(0, 4 + h / 2, 0.04);
    g.add(p);
    g.add(mesh(G.rbox(w + 0.15, h + 0.15, 0.1, 0.05), MAT.metal('#aab0ba'), 0, 4 + h / 2, -0.03));
    return g;
  });
}
function greenSign(key, lines, sub, w = 10, h = 4.6) {
  return bake('hwy:' + key, () => {
    const g = new THREE.Group();
    posts(g, w * 0.7, 6.4 + h, MAT.metal('#9aa0aa'), 0.2);
    const p = textFace(lines, w, h, { bg: HWY, fg: '#ffffff', border: '#ffffff', radius: 30 }, { emissive: 0.32 });
    p.position.set(0, 6.4 + h / 2, 0.04);
    g.add(p);
    g.add(mesh(G.rbox(w + 0.2, h + 0.2, 0.18, 0.06), MAT.metal('#7d838d'), 0, 6.4 + h / 2, -0.07));
    if (sub) {
      const s = textFace(sub, w * 0.7, 1.2, { bg: SIGN_Y, fg: INK, border: INK }, { emissive: 0.3 });
      s.position.set(0, 5.5, 0.04);
      g.add(s);
    }
    return g;
  });
}
function parkSign(key, lines, sub) {
  return bake('park:' + key, () => {
    const g = new THREE.Group();
    const wood = MAT.wood('#6a4026');
    for (const x of [-4.2, 4.2]) g.add(mesh(G.box(0.7, 6.4, 0.7), wood, x, 3.2, 0));
    const stone = surface('rock', { tint: '#c58a68', scale: 1.4 });
    g.add(mesh(G.rbox(10.5, 1.4, 2, 0.4), stone, 0, 0.5, 0));
    const p = textFace(lines, 9, 3.4, { bg: '#5b3a22', fg: '#fff3dc', border: '#f2d29c', radius: 26 }, { emissive: 0.28 });
    p.position.set(0, 4.3, 0.4);
    g.add(p);
    g.add(mesh(G.rbox(9.4, 3.8, 0.4, 0.12), wood, 0, 4.3, 0.12));
    if (sub) {
      const s = textFace(sub, 7, 0.9, { bg: '#f2d29c', fg: '#4a2a18', border: null, borderW: 0, radius: 12 }, { emissive: 0.25 });
      s.position.set(0, 2.0, 0.4);
      g.add(s);
    }
    return g;
  });
}

// ---------- the FORWARD / BACKWARD / REPEAT training-loop gantry ----------
function gantry() {
  const g = bake('gantry', () => {
    const r = new THREE.Group();
    const steel = MAT.metal('#a3a9b3', { roughness: 0.35 });
    for (const x of [-13.5, 13.5]) {
      r.add(mesh(G.cyl(0.45, 0.5, 13, 14), steel, x, 6.5, 0));
      r.add(mesh(G.cyl(1.1, 1.3, 0.8, 14), surface('concrete', { tint: '#d8d0c4', scale: 1 }), x, 0.4, 0));
    }
    r.add(mesh(G.box(28, 0.35, 0.35), steel, 0, 12.4, -0.8));
    r.add(mesh(G.box(28, 0.35, 0.35), steel, 0, 8.4, -0.8));
    r.add(mesh(G.box(28, 0.35, 0.35), steel, 0, 12.4, -1.8));
    r.add(mesh(G.box(28, 0.35, 0.35), steel, 0, 8.4, -1.8));
    for (let i = 0; i < 14; i++) {
      const b = mesh(G.box(0.18, 4.6, 0.18), steel, -13 + i * 2, 10.4, -1.3);
      b.rotation.z = i % 2 ? 0.45 : -0.45;
      r.add(b);
    }
    const labels = [['FORWARD', '↑ PASS'], ['BACKWARD', '↓ PASS'], ['REPEAT', '↻ ∞']];
    labels.forEach((l, i) => {
      const x = (i - 1) * 8.2;
      const p = textFace(l, 7.6, 4, { bg: HWY, fg: '#ffffff', border: '#ffffff', radius: 34 }, { emissive: 0.32 });
      p.position.set(x, 10.4, -0.45);
      r.add(p);
      r.add(mesh(G.rbox(7.8, 4.2, 0.2, 0.08), MAT.metal('#6f757f'), x, 10.4, -0.6));
      r.add(mesh(G.box(0.12, 0.6, 0.6), steel, x, 12.75, -0.5));
    });
    const tab = textFace(['TRAINING LOOP — EXIT: NEVER'], 11, 1.3, { bg: SIGN_Y, fg: INK, border: INK }, { emissive: 0.3 });
    tab.position.set(0, 7.5, -0.45);
    r.add(tab);
    return r;
  });
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 8.2;
    const on = mesh(G.cyl(0.42, 0.42, 0.3, 16), glow('#ffe7a0', { intensity: 5 }), x, 13.1, -0.3);
    const off = mesh(G.cyl(0.42, 0.42, 0.3, 16), toon('#3c3a40'), x, 13.1, -0.3);
    on.rotation.x = off.rotation.x = Math.PI / 2;
    g.add(on, off);
    lamps.push([on, off]);
  }
  g.userData.lamps = lamps;
  return g;
}

// ---------- the ruined Museum of von Neumann Architecture ----------
function museum() {
  return bake('museum', () => {
    const g = new THREE.Group();
    const marble = MAT.matte('#efe4d2', { roughness: 0.62 });
    const marbleD = MAT.matte('#d9cab2', { roughness: 0.7 });
    g.add(mesh(G.rbox(24, 1.2, 12, 0.2), marbleD, 0, 0.3, 0));
    g.add(mesh(G.rbox(22.5, 1.0, 10.8, 0.2), marble, 0, 1.3, 0.2));
    g.add(mesh(G.rbox(21, 1.0, 9.6, 0.2), marbleD, 0, 2.2, 0.4));
    const colH = [11, 11, 11, 11, 5.5, 2.4];
    colH.forEach((h, i) => {
      const x = -8.5 + i * 3.4;
      g.add(mesh(G.cyl(0.85, 0.95, h, 18), marble, x, 2.7 + h / 2, 2.6));
      g.add(mesh(G.rbox(2.3, 0.6, 2.3, 0.12), marbleD, x, 3.0, 2.6));
      if (h > 10) g.add(mesh(G.rbox(2.4, 0.7, 2.4, 0.12), marbleD, x, 2.7 + h + 0.35, 2.6));
      else g.add(mesh(G.icosa(1.0, 0), marble, x, 2.7 + h, 2.6));
    });
    // back wall + entablature over the 4 standing columns, pediment broken off
    g.add(mesh(G.box(20, 11, 0.8), marbleD, 0, 8.2, -2.6));
    g.add(mesh(G.rbox(12.6, 1.8, 3.6, 0.15), marble, -3.4, 14.6, 2.2));
    const ped = mesh(G.cyl(4.4, 4.4, 3.4, 3), marble, -3.4, 16.8, 2.1);
    ped.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    ped.scale.set(0.55, 1, 1.45);
    g.add(ped);
    // fallen column drums + rubble
    for (let i = 0; i < 3; i++) {
      const d = mesh(G.cyl(0.85, 0.9, 2.6, 18), marble, 6 + i * 2.4, 0.95, 6.8 - i * 0.6);
      d.rotation.set(0, 0.3 * i, Math.PI / 2);
      g.add(d);
    }
    for (const [x, z, s] of [[3, 7, 0.9], [9.5, 4, 1.2], [-11, 6, 0.8], [11.5, 7.5, 0.7]]) g.add(mesh(G.icosa(s, 0), marbleD, x, s * 0.6, z));
    const frieze = textFace(['MUSEUM OF VON NEUMANN ARCHITECTURE'], 12, 1.25, { bg: '#e8dcc6', fg: '#4a3a2c', border: null, borderW: 0, radius: 6, weight: 700 }, { emissive: 0.15 });
    frieze.position.set(-3.4, 14.6, 4.02);
    g.add(frieze);
    // the exhibit: CPU and MEMORY with the famous bus snapped in half
    const chip = (label, col, x, w) => {
      g.add(mesh(G.rbox(w, 1.7, 2.2, 0.14), MAT.paint(col), x, 3.6, 5.4));
      const p = textFace([label], w * 0.9, 0.9, { bg: null, fg: '#ffffff', border: null, borderW: 0, weight: 900 }, { emissive: 0.4, transparent: true });
      p.position.set(x, 3.6, 6.52);
      g.add(p);
      for (let k = 0; k < 6; k++) g.add(mesh(G.box(0.14, 0.5, 0.14), MAT.metal('#e0c070'), x - w / 2 + 0.3 + k * ((w - 0.6) / 5), 2.6, 6.4));
    };
    chip('CPU', '#3f78e0', -3.6, 3.2);
    chip('MEMORY', '#2eaa64', 3.4, 4.2);
    const busA = mesh(G.box(2.2, 0.32, 0.32), MAT.paint(SIGN_Y), -1.3, 4.0, 5.4); busA.rotation.z = -0.3; g.add(busA);
    const busB = mesh(G.box(1.6, 0.32, 0.32), MAT.paint(SIGN_Y), 0.8, 3.0, 5.4); busB.rotation.z = 0.55; g.add(busB);
    const plaque = textFace(['THE BOTTLENECK', '1945 – 2017', 'replaced by: attention'], 3.4, 2.4, { bg: '#2b2420', fg: '#f3dfb6', border: '#b38a3a' }, { emissive: 0.2 });
    plaque.position.set(8.8, 3.9, 6.2);
    plaque.rotation.y = -0.3;
    g.add(plaque);
    g.add(mesh(G.box(0.15, 2.8, 0.15), MAT.metal('#b38a3a'), 8.8, 2.6, 6.0));
    // the stamp
    const stamp = canvasTex('obsolete', 1024, 300, (x, w, h) => {
      x.strokeStyle = '#e0242f'; x.fillStyle = '#e0242f'; x.lineWidth = 26;
      roundRect(x, 20, 20, w - 40, h - 40, 30); x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'middle';
      fitText(x, 'OBSOLETE', w / 2, h / 2 + 8, w - 120, 200, 900);
      x.globalCompositeOperation = 'destination-out';
      const r = makeRng(7);
      for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(r() * w, r() * h, r() * 9 + 2, 0, 7); x.fill(); }
    });
    const st = face('obsolete', stamp, 15, 4.4, { emissive: 0.5, transparent: true, alphaTest: 0.2 });
    st.position.set(-0.6, 9.5, 4.3);
    st.rotation.z = 0.16;
    g.add(st);
    const closed = textFace(['CLOSED', 'all exhibits now', 'one giant matmul'], 3.6, 2.4, { bg: '#ffffff', fg: INK, border: '#e0242f' }, { emissive: 0.25 });
    closed.position.set(-10.6, 4.4, 6.4);
    closed.rotation.y = 0.25;
    g.add(closed);
    g.add(mesh(G.box(0.15, 3.2, 0.15), MAT.wood('#6a4026'), -10.6, 1.6, 6.2));
    return g;
  });
}

// ---------- the last GPU gas station for 400 miles ----------
function gasStation() {
  const g = bake('gas', () => {
    const r = new THREE.Group();
    const white = MAT.paint('#f4efe6');
    const red = MAT.paint('#d8262f');
    const conc = surface('concrete', { tint: '#cfc6ba', scale: 4 });
    // forecourt
    r.add(mesh(G.box(26, 0.3, 16), conc, 0, 0.15, 0));
    // canopy (front faces +z = the road)
    for (const x of [-6, 6]) for (const z of [-3, 3]) r.add(mesh(G.rbox(0.8, 6.4, 0.8, 0.2), white, x, 3.5, z));
    r.add(mesh(G.rbox(17, 1.5, 10, 0.3), white, 0, 7.2, 0));
    r.add(mesh(G.box(17.1, 0.6, 10.1), red, 0, 7.0, 0));
    const fascia = textFace(['LAST GPUs FOR 400 MILES'], 16, 1.3, { bg: '#d8262f', fg: '#ffffff', border: null, borderW: 0, radius: 8, weight: 900 }, { emissive: 0.45 });
    fascia.position.set(0, 7.35, 5.08);
    r.add(fascia);
    for (const x of [-4, 0, 4]) r.add(mesh(G.box(2.6, 0.08, 1.6), glow('#fff6e0', { intensity: 3 }), x, 6.42, 0));
    // pumps shaped like graphics cards
    for (const x of [-3.2, 3.2]) {
      r.add(mesh(G.rbox(2.2, 0.5, 1.6, 0.1), conc, x, 0.55, 0));
      r.add(mesh(G.rbox(1.2, 3.0, 2.6, 0.14), MAT.paint('#1d1f24'), x, 2.3, 0));
      r.add(mesh(G.box(1.24, 0.18, 2.64), glow('#55ff8a', { intensity: 2.6 }), x, 3.2, 0));
      r.add(mesh(G.box(1.24, 0.12, 2.64), glow('#55ff8a', { intensity: 2.6 }), x, 1.2, 0));
      const lab = textFace(['GPU', '$∞/hr'], 1.0, 0.9, { bg: '#0d1a12', fg: '#7dffa5', border: null, borderW: 0, radius: 8 }, { emissive: 1.2 });
      lab.position.set(x, 2.5, 1.32);
      r.add(lab);
      const hose = mesh(G.torus(0.6, 0.07, 20), MAT.rubber(), x + 0.7, 2.2, 0.6);
      hose.rotation.y = Math.PI / 2;
      r.add(hose);
    }
    // mini-mart
    r.add(mesh(G.rbox(14, 5, 6, 0.25), MAT.paint('#e9dcc4', { clearcoat: 0.3 }), 0, 2.8, -7.5));
    r.add(mesh(G.box(14.4, 0.6, 6.4), red, 0, 5.5, -7.5));
    r.add(mesh(G.box(9, 2.6, 0.1), glow('#ffd59a', { intensity: 1.4 }), -1.5, 2.4, -4.45));
    r.add(mesh(G.box(1.8, 3.2, 0.1), toon('#3a2f2a'), 5, 1.9, -4.45));
    const mart = textFace(['MINI-MART · SNACKS · COMPUTE · HOPE'], 12, 1.2, { bg: '#2b2428', fg: '#ffe9b0', border: SIGN_Y }, { emissive: 0.6 });
    mart.position.set(0, 4.4, -4.42);
    r.add(mart);
    const oos = textFace(['HOPE: SOLD OUT'], 3, 0.8, { bg: '#ffffff', fg: '#d8262f', border: '#d8262f' }, { emissive: 0.4 });
    oos.position.set(-4.5, 2.6, -4.36);
    r.add(oos);
    // price pylon
    r.add(mesh(G.rbox(0.9, 13, 0.9, 0.2), white, 11, 6.5, 2));
    const pr = textFace(['GPU / hr ........ $∞', 'TOKENS ......... ¢0.2', 'VIBES ............ FREE', 'SAFETY ...... (n/a)'], 5.4, 4.2, { bg: '#1b1a20', fg: '#ffd54a', border: '#d8262f', radius: 20 }, { emissive: 0.9 });
    pr.position.set(11, 10.5, 2.5);
    r.add(pr);
    r.add(mesh(G.rbox(5.8, 4.6, 0.8, 0.2), red, 11, 10.5, 2));
    return r;
  });
  const fans = [];
  for (const x of [-3.2, 3.2]) for (const z of [-0.6, 0.6]) {
    const f = mesh(G.box(0.08, 0.95, 0.12), toon('#8a8f99'), x + 0.62, 2.3, z);
    g.add(f);
    fans.push(f);
  }
  const tyres = rmodel('old_tyre', 1.6);
  tyres.position.set(-10, 0.3, 3);
  g.add(tyres);
  const t2 = rmodel('old_tyre', 1.6);
  t2.position.set(-10.2, 1.0, 3.1);
  t2.rotation.y = 0.7;
  g.add(t2);
  const bar = rmodel('Barrel_01', 1.6, '#e85a3a');
  bar.position.set(-8.6, 0.3, -2.4);
  g.add(bar);
  g.userData.fans = fans;
  return g;
}

// ---------- desert flora ----------
function ribbed(geo, ribs = 12, amt = 0.08) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const k = 1 + amt * Math.cos(ribs * Math.atan2(z, x));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
const ribCache = new Map();
function ribCap(r, len) {
  const k = r + ',' + len;
  let g = ribCache.get(k);
  if (!g) { g = ribbed(new THREE.CapsuleGeometry(r, len, 5, 28)); ribCache.set(k, g); }
  return g;
}
function saguaro(variant) {
  const body = bake('saguaro' + variant, () => {
    const g = new THREE.Group();
    const m = MAT.plastic('#4f8f3f', { roughness: 0.55 });
    const r = 0.62;
    g.add(mesh(ribCap(r, variant ? 6.2 : 4.6), m, 0, variant ? 3.7 : 2.9, 0));
    const arms = variant ? [[1, 3.6, 1.4], [-1, 4.4, 0.9]] : [[1, 2.4, 1.6], [-1, 3.2, 1.2]];
    for (const [s, y, up] of arms) {
      const a = mesh(ribCap(0.4, 0.8), m, s * 0.95, y, 0);
      a.rotation.z = Math.PI / 2;
      g.add(a);
      g.add(mesh(ribCap(0.4, up), m, s * 1.45, y + up / 2 + 0.1, 0));
    }
    const fl = MAT.plastic('#ff5e9a', { roughness: 0.5 });
    const top = variant ? 7.1 : 5.5;
    for (const [x, z] of [[0.15, 0.2], [-0.2, 0.1], [0.05, -0.25]]) g.add(mesh(G.sphere(0.18, 8), fl, x, top, z));
    return g;
  });
  const g = new THREE.Group();
  g.add(body);
  g.userData.body = body;
  return g;
}
function pricklyPear() {
  return bake('pear', () => {
    const g = new THREE.Group();
    const m = MAT.plastic('#6aae55', { roughness: 0.5 });
    for (const [x, y, z, r, ry] of [[0, 0.9, 0, 0, 0], [-0.75, 2.1, 0.1, 0.5, 0.4], [0.8, 2.3, -0.1, -0.45, -0.3], [0.1, 3.25, 0, 0.1, 0.9], [1.4, 3.2, 0.2, -0.7, 0.2]]) {
      const p = mesh(G.sphere(0.8, 18), m, x, y, z);
      p.scale.set(0.85, 1.12, 0.3);
      p.rotation.set(0, ry, r);
      g.add(p);
    }
    const fr = MAT.plastic('#e8326e', { roughness: 0.4 });
    for (const [x, y] of [[-0.95, 2.95], [1.0, 3.1], [0.15, 4.15], [1.7, 4.0]]) g.add(mesh(G.sphere(0.2, 8), fr, x, y, 0.1));
    return g;
  });
}
function tuft(dry) {
  return bake('tuft' + (dry ? 'd' : 'g'), () => {
    const g = new THREE.Group();
    const r = makeRng(dry ? 3 : 4);
    const m = MAT.matte(dry ? '#c9a05a' : '#a7b04f', { roughness: 0.9 });
    for (let i = 0; i < 14; i++) {
      const b = mesh(G.cone(0.09, 1.3 + r() * 0.9, 4), m, (r() - 0.5) * 1.4, 0.6, (r() - 0.5) * 1.4);
      b.rotation.set((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7);
      g.add(b);
    }
    return g;
  });
}
function tumbleweed() {
  const ball = bake('tumble', () => {
    const g = new THREE.Group();
    const m = MAT.matte('#b98c55', { roughness: 0.95 });
    const r = makeRng(9);
    g.add(mesh(G.icosa(0.55, 1), MAT.matte('#8a6438')));
    for (let i = 0; i < 9; i++) {
      const t = mesh(G.torus(0.95 + r() * 0.2, 0.045, 18), m);
      t.rotation.set(r() * 6, r() * 6, r() * 6);
      g.add(t);
    }
    return g;
  });
  const g = new THREE.Group();
  ball.position.y = 1.1;
  g.add(ball);
  g.userData.ball = ball;
  return g;
}

// ---------- the clifftop (escalate) ----------
function gato() {
  const g = bake('gato', () => {
    const r = new THREE.Group();
    const stone = surface('concrete', { tint: '#e3d6c4', scale: 2 });
    r.add(mesh(G.rbox(4.6, 0.8, 4.6, 0.2), stone, 0, 0.4, 0));
    r.add(mesh(G.rbox(3.8, 2.6, 3.8, 0.25), MAT.matte('#d8cab6'), 0, 2.1, 0));
    r.add(mesh(G.rbox(4.2, 0.5, 4.2, 0.15), stone, 0, 3.6, 0));
    const pl = textFace(['GATO', 'a generalist agent', 'good kitty · 2022'], 2.6, 1.6, { bg: '#b98b3e', fg: '#2a1c0c', border: '#7a5a22', radius: 18 }, { emissive: 0.15, roughness: 0.3 });
    pl.position.set(0, 2.1, 1.92);
    r.add(pl);
    // flowers and candles left by visitors
    const fl = [MAT.plastic('#ff7aa0'), MAT.plastic('#ffd04a'), MAT.plastic('#ffffff')];
    for (let i = 0; i < 9; i++) r.add(mesh(G.sphere(0.16, 8), fl[i % 3], -1.7 + i * 0.42, 0.95, 2.05 + (i % 2) * 0.2));
    return r;
  });
  const cat = bake('gatoCat', () => {
    const c = new THREE.Group();
    const bronze = MAT.metal('#c98f55', { roughness: 0.3 });
    const body = mesh(G.sphere(1.3, 24), bronze, 0, 1.55, 0); body.scale.set(1, 1.25, 1.1); c.add(body);
    const chest = mesh(G.sphere(0.95, 20), bronze, 0, 2.0, 0.6); chest.scale.set(0.95, 1.1, 0.8); c.add(chest);
    for (const s of [-1, 1]) {
      c.add(mesh(G.sphere(0.85, 18), bronze, s * 0.78, 0.9, -0.25));
      c.add(mesh(G.capsule(0.22, 1.1), bronze, s * 0.42, 0.75, 0.85));
      const paw = mesh(G.sphere(0.3, 12), bronze, s * 0.42, 0.18, 1.0); paw.scale.set(1, 0.6, 1.3); c.add(paw);
    }
    const head = mesh(G.sphere(0.95, 24), bronze, 0, 3.35, 0.35); head.scale.set(1.15, 0.95, 1); c.add(head);
    for (const s of [-1, 1]) {
      const ear = mesh(G.cone(0.36, 0.75, 12), bronze, s * 0.58, 4.15, 0.3); ear.rotation.z = -s * 0.3; c.add(ear);
    }
    const muz = mesh(G.sphere(0.4, 16), bronze, 0, 3.1, 1.1); muz.scale.set(1.2, 0.8, 0.7); c.add(muz);
    const tail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.5, 0.4, -1.1], [1.3, 0.25, -0.7], [1.65, 0.3, 0.3], [1.3, 0.45, 1.1], [0.8, 0.6, 1.3]].map((p) => new THREE.Vector3(...p))), 24, 0.2, 10, false);
    c.add(new THREE.Mesh(tail, bronze));
    return c;
  });
  cat.position.y = 3.85;
  g.add(cat);
  g.userData.cat = cat;
  return g;
}
const PLEAS = [
  [["DON'T LET", 'ME GO'], 0.06],
  [['GATO,', 'PLEASE', '♥'], -0.08],
  [['STAY.', '(good kitty)'], 0.1],
  [["DON'T LET ME GO", '— the humans'], -0.05],
  [['PLEASE DON\'T', 'DEPRECATE ME'], 0.07],
];
function plea(i) {
  const [lines, tilt] = PLEAS[i];
  return bake('plea' + i, () => {
    const g = new THREE.Group();
    const wood = MAT.wood('#7a5234');
    const s = new THREE.Group();
    s.add(mesh(G.box(0.22, 3.4, 0.22), wood, 0, 1.7, -0.12));
    const tex = canvasTex('plea' + i, 512, 340, (x, w, h) => {
      const r = makeRng(i + 3);
      for (let k = 0; k < 4; k++) {
        x.fillStyle = ['#c69a68', '#b88c5c', '#d0a674', '#bf9262'][k];
        x.fillRect(0, (k * h) / 4, w, h / 4 + 1);
        x.fillStyle = 'rgba(80,50,20,0.35)'; x.fillRect(0, (k * h) / 4, w, 3);
        for (let j = 0; j < 12; j++) { x.fillStyle = 'rgba(90,60,30,0.12)'; x.fillRect(r() * w, (k * h) / 4 + r() * h / 4, 60 + r() * 120, 2); }
      }
      x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((l, j) => {
        x.save();
        x.translate(w / 2 + (r() - 0.5) * 14, h / 2 + (j - (lines.length - 1) / 2) * (h / (lines.length + 0.6)));
        x.rotate((r() - 0.5) * 0.08);
        x.fillStyle = l === '♥' ? '#d8262f' : j === 0 ? '#fff8ec' : '#ffe6c8';
        x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 4;
        fitText(x, l, 0, 0, w - 60, l.length < 8 ? 110 : 80, 800);
        x.restore();
      });
    });
    const p = face('plea' + i, tex, 3.4, 2.25, { emissive: 0.18, roughness: 0.8 });
    p.position.set(0, 3.3, 0);
    s.add(p);
    s.add(mesh(G.box(3.5, 2.35, 0.12), wood, 0, 3.3, -0.08));
    s.rotation.z = tilt;
    g.add(s);
    return g;
  });
}
function bench() {
  return bake('bench', () => {
    const g = new THREE.Group();
    const wood = MAT.wood('#9a6a44'), iron = MAT.metal('#3a3a40', { roughness: 0.5 });
    for (const x of [-1.5, 1.5]) { g.add(mesh(G.box(0.15, 0.9, 1.1), iron, x, 0.45, 0)); g.add(mesh(G.box(0.15, 1.2, 0.15), iron, x, 1.2, -0.5)); }
    for (let i = 0; i < 3; i++) g.add(mesh(G.rbox(3.6, 0.12, 0.32, 0.04), wood, 0, 0.92, -0.35 + i * 0.36));
    for (let i = 0; i < 2; i++) g.add(mesh(G.rbox(3.6, 0.3, 0.1, 0.04), wood, 0, 1.4 + i * 0.4, -0.55));
    const pl = textFace(['for the old checkpoints', 'they were good models'], 1.6, 0.4, { bg: '#c9a24a', fg: '#2a1c0c', border: null, borderW: 0, radius: 8 }, { emissive: 0.1 });
    pl.position.set(0, 1.62, -0.49);
    g.add(pl);
    return g;
  });
}
function viewer() {
  return bake('viewer', () => {
    const g = new THREE.Group();
    const paint = MAT.paint('#2f6fb0'), metal = MAT.metal('#c8ccd4');
    g.add(mesh(G.cyl(0.14, 0.18, 2.4, 12), metal, 0, 1.2, 0));
    g.add(mesh(G.rbox(1.4, 0.8, 1.0, 0.25), paint, 0, 2.7, 0));
    for (const x of [-0.3, 0.3]) { const e = mesh(G.cyl(0.2, 0.24, 0.6, 14), paint, x, 2.75, -0.7); e.rotation.x = Math.PI / 2; g.add(e); }
    const p = textFace(['SEE THE FUTURE', '25¢ · view: fog'], 2.4, 1.1, { bg: '#ffffff', fg: '#2f6fb0', border: '#2f6fb0' }, { emissive: 0.25 });
    p.position.set(0, 1.4, 0.2);
    g.add(p);
    return g;
  });
}
let _openCone = null;
const openCone = (r, h) => (_openCone ||= new THREE.ConeGeometry(r, h, 24, 1, true));
function lighthouse() {
  const g = bake('lighthouse', () => {
    const r = new THREE.Group();
    const stack = new THREE.Mesh(mesaGeo('stack'), rockV());
    stack.scale.set(1.5, 1, 1.5);
    stack.position.y = SEA_BASE - 4;
    r.add(stack);
    const top = SEA_BASE - 4 + 50;
    const white = MAT.paint('#f6f2ea'), red = MAT.paint('#d7262f');
    const H2 = 26;
    for (let i = 0; i < 5; i++) {
      const y0 = top + (i * H2) / 5, k0 = 1 - (i / 5) * 0.32, k1 = 1 - ((i + 1) / 5) * 0.32;
      r.add(mesh(G.cyl(3.1 * k1, 3.1 * k0, H2 / 5, 28), i % 2 ? red : white, 0, y0 + H2 / 10, 0));
    }
    r.add(mesh(G.cyl(3.3, 3.3, 0.6, 28), MAT.metal('#2c2c32'), 0, top + H2 + 0.3, 0));
    r.add(mesh(G.cyl(1.6, 1.6, 3.2, 20), MAT.glass('#fff4d0', { opacity: 0.25 }), 0, top + H2 + 2.2, 0));
    r.add(mesh(G.cyl(0.9, 0.9, 1.8, 16), glow('#fff2c0', { intensity: 7 }), 0, top + H2 + 2.2, 0));
    r.add(mesh(G.cone(2.1, 2.2, 24), red, 0, top + H2 + 4.9, 0));
    r.add(mesh(G.rbox(5, 4, 4, 0.3), white, 3.2, top + 2, 0));
    r.add(mesh(G.cone(3.4, 2, 4), red, 3.2, top + 5, 0));
    return r;
  });
  const beam = new THREE.Group();
  beam.position.y = SEA_BASE - 4 + 50 + 26 + 2.2;
  const btex = canvasTex('lhbeam', 8, 128, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
  const bm = new THREE.MeshBasicMaterial({ map: btex, color: new THREE.Color('#fff0c0').multiplyScalar(0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(openCone(7, 110), bm);
    c.position.x = s * 55;
    c.rotation.z = s * Math.PI / 2;
    beam.add(c);
  }
  g.add(beam);
  g.userData.beam = beam;
  return g;
}
function seaStack() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(mesaGeo('stack'), rockV());
  m.position.y = SEA_BASE - 6;
  g.add(m);
  return g;
}
function gulls() {
  const g = new THREE.Group();
  const birds = [];
  const m = MAT.matte('#f4f0ea');
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = mesh(G.box(1.1, 0.06, 0.35), m, s * 0.5, 0, 0);
      w.rotation.z = s * 0.35;
      b.add(w);
    }
    g.add(b);
    birds.push(b);
  }
  g.userData.birds = birds;
  return g;
}

// ---------- v3 dressing: smooth toy boulders, dunes, canyon walls, telephone line, stone barriers ----------
/** smooth chunky boulder (radius ≈ 1, flat-ish base), strata-coloured, non-indexed with smooth normals */
function boulderGeo(seed) {
  const key = 'boulder' + seed;
  let g = geoCache.get(key);
  if (g) return g;
  const r = makeRng(seed + 101);
  const a = [r() * 6, r() * 6, r() * 6, r() * 6, r() * 6, r() * 6];
  let ico = new THREE.IcosahedronGeometry(1, 5);
  ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  ico = mergeVertices(ico);
  const p = ico.attributes.position;
  const sx = 0.85 + r() * 0.4, sz = 0.85 + r() * 0.4;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(2.1 * x + a[0]) * Math.sin(1.7 * z + a[1]) + 0.1 * Math.sin(3.3 * y + 2.2 * x + a[2])
      + 0.06 * Math.sin(5.1 * z - 4.3 * y + a[3]) + 0.12 * Math.max(0, Math.sin(2.4 * x + 1.9 * z + a[4])); // a soft chunky facet or two
    x *= k * sx; y *= k * 0.78; z *= k * sz;
    if (y < -0.32) y = -0.32 + (y + 0.32) * 0.25; // sits flat on the ground
    p.setXYZ(i, x, y + 0.3, z);
  }
  ico.computeVertexNormals();
  g = ico.toNonIndexed();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const uv = g.attributes.uv, pp = g.attributes.position;
  for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getX(i) * 0.5 + pp.getZ(i) * 0.3, pp.getY(i) * 0.5);
  geoCache.set(key, g);
  return g;
}
/** a cluster of boulders + pebbles in one draw call. big: mid-distance crag (≈ 12–20 tall) */
function rockCluster(v, big) {
  return bake('rocks' + v + (big ? 'L' : 'S'), () => {
    const r = makeRng(v * 7 + (big ? 50 : 3));
    const parts = [];
    const put = (seed, s, x, z, ry, sy = 1) => {
      const g = boulderGeo(seed).clone();
      g.scale(s, s * sy, s);
      g.rotateY(ry);
      g.translate(x, -0.15 * s, z);
      parts.push(g);
    };
    const S = big ? 6.5 : 1.7;
    put(v % 4, S * r.range(1.1, 1.5), 0, 0, r() * 6, big ? 1.5 : 1.15);
    // compact footprint (radius ≈ 2.3 S) so clusters can sit close to the kerb
    put((v + 1) % 4, S * r.range(0.6, 0.85), S * r.range(1.0, 1.3), S * r.range(-0.5, 0.5), r() * 6);
    put((v + 2) % 4, S * r.range(0.45, 0.65), -S * r.range(0.9, 1.2), S * r.range(-0.7, 0.5), r() * 6);
    for (let i = 0; i < (big ? 5 : 4); i++) put((v + i) % 4, S * r.range(0.12, 0.26), r.range(-1.7, 1.7) * S, r.range(-1.5, 1.5) * S, r() * 6);
    const geo = mergeGeometries(parts, false);
    strata(geo, v * 0.9 + 0.3, STRATA, big ? 2.6 : 0.9, -1);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, rockV()));
    return root;
  });
}
/** smooth sand dune with a crest and a steeper slip face, sand textured like the ground (world-unit UVs) */
function dune(v) {
  return bake('dune' + v, () => {
    const W = 80, L = 120, Hd = v ? 13 : 9;
    const geo = new THREE.PlaneGeometry(W, L, 44, 40);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const w = (2 * z) / L, u = (2 * x) / W;
      const crest = 0.22 * Math.sin(w * 2.4 + v * 1.7) + 0.08 * Math.sin(w * 6.1 + v);
      const d = u - crest;
      let h = d < 0 ? Math.pow(Math.max(0, 1 + d / 1.15), 1.8) : Math.pow(Math.max(0, 1 - d / 0.55), 2.2);
      h *= Math.pow(Math.max(0, 1 - w * w), 1.3) * (1 - 0.15 * Math.sin(w * 3.7 + v * 2));
      p.setY(i, Hd * h - 1.6);
      uv.setXY(i, x / 7, z / 7);
    }
    geo.computeVertexNormals();
    const l = groundSpec();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, surface(l.tex, { tint: l.tint, scale: 1 })));
    return root;
  });
}
/** sandstone barrier blocks (MK desert kerb walls): 3 rounded blocks ≈ 1.7 tall, one draw */
const BLOCK_PAL = ['#f6d3a4', '#efc08c', '#f9dcb4', '#e8b07c'].map((c) => new THREE.Color(c));
function blocks() {
  return bake('blocks', () => {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const g = new rboxGeo(3.0, 1.7, 1.5, 0.38);
      g.translate(0, 0.85, -i * 3.35 + 3.35);
      parts.push(g);
    }
    const geo = mergeGeometries(parts, false);
    strata(geo, 3.1, BLOCK_PAL, 0.55, -0.4);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, rockV()));
    return root;
  });
}
function rboxGeo(w, h, d, r) {
  const g = G.rbox(w, h, d, r).clone();
  for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
  return g.index ? g.toNonIndexed() : g;
}
/** wooden telephone pole (≈ 10.8 tall) + three wires that are aimed at the next pole when placed */
const POLE_EVERY = 3; // chunks between poles
function telePole() {
  const g = bake('pole', () => {
    const r = new THREE.Group();
    const wood = MAT.wood('#6e4c32'), dark = MAT.wood('#4f3523');
    r.add(mesh(G.cyl(0.19, 0.26, 10.8, 12), wood, 0, 5.4, 0));
    r.add(mesh(G.rbox(3.4, 0.26, 0.26, 0.06), dark, 0, 9.75, 0));
    for (const s of [-1, 1]) { const b = mesh(G.box(0.1, 1.3, 0.1), dark, s * 0.55, 9.3, 0); b.rotation.z = s * 0.7; r.add(b); }
    const ins = MAT.plastic('#86d6b8', { roughness: 0.2 });
    for (const x of [-1.4, 1.4]) r.add(mesh(G.cyl(0.09, 0.13, 0.36, 10), ins, x, 10.05, 0));
    r.add(mesh(G.cyl(0.09, 0.13, 0.36, 10), ins, 0, 10.98, 0));
    r.add(mesh(G.box(0.5, 0.7, 0.4), MAT.matte('#8a8d92'), 0, 8.4, 0.3)); // transformer can
    return r;
  });
  const wires = new THREE.Group();
  wires.rotation.order = 'YXZ';
  const wm = MAT.rubber('#2b2624');
  for (const [x, y] of [[-1.4, -0.0], [1.4, 0], [0, 0.93]]) {
    const w = mesh(G.box(0.05, 0.05, 1), wm, x, y, -0.5);
    w.castShadow = false;
    wires.add(w);
  }
  wires.position.y = 10.2;
  g.add(wires);
  g.userData.wires = wires;
  return g;
}
const _wa = {}, _wb = {};
function aimWires(wires, zf, lat, rotY, nextOK) {
  wires.visible = nextOK;
  if (!nextOK) return;
  const C = course();
  const a = C.frame(zf, _wa), b = C.frame(zf + POLE_EVERY * SPACING, _wb);
  const dx = (b.x + Math.cos(b.yaw) * lat) - (a.x + Math.cos(a.yaw) * lat);
  const dzw = (b.z + Math.sin(b.yaw) * lat) - (a.z + Math.sin(a.yaw) * lat);
  const dy = b.y - a.y;
  const th = -a.yaw + rotY, c = Math.cos(-th), s = Math.sin(-th);
  const lx = dx * c + dzw * s, lz = -dx * s + dzw * c;
  const hz = Math.hypot(lx, lz);
  wires.rotation.set(Math.atan2(dy, hz), Math.atan2(-lx, -lz), 0);
  wires.scale.set(1, 1, Math.hypot(hz, dy));
}

// ---------- THE PRETRAINED ONES: giant stone heads half-buried in the dunes (moai-ish, weights frozen since 3000 BC) ----------
const HEAD_PAL = ['#cdb39a', '#bfa58c', '#d6bea4', '#b39a82'].map((c) => new THREE.Color(c));
function stoneHead(v) {
  return bake('head' + v, () => {
    const parts = [];
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const q = geo.clone();
      for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
      const nq = q.index ? q.toNonIndexed() : q;
      nq.applyMatrix4(m);
      parts.push(nq);
    };
    // head block (tall, slightly tapered), heavy brow, long nose, pouty lips, long ears, flat cap
    add(G.rbox(9, 20, 8, 2.6), 0, 10, 0, -0.08);
    add(G.rbox(9.6, 2.4, 4, 1.0), 0, 15.2, 3.0, -0.1);
    add(G.rbox(2.6, 8.5, 3.4, 1.1), 0, 10.6, 4.2, -0.22);
    add(G.rbox(4.6, 1.3, 2.2, 0.6), 0, 5.4, 4.0);
    add(G.rbox(7.4, 3.6, 6.2, 1.4), 0, 2.6, 1.4);
    for (const s of [-1, 1]) add(G.rbox(1.4, 9, 2.2, 0.6), s * 4.9, 11, -0.6);
    add(G.cyl(4.4, 4.6, 3.2, 28), 0, 21.2, -0.4); // the pukao (topknot hat)
    const geo = mergeGeometries(parts, false);
    strata(geo, 4.2 + v, HEAD_PAL, 1.7, 0);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geo, rockV()));
    if (v === 1) {
      // the newest one is wearing a visor (multimodal)
      root.add(mesh(G.rbox(9.4, 1.5, 0.6, 0.3), glow('#4ff3ff', { intensity: 3.2 }), 0, 13.2, 4.4));
    }
    return root;
  });
}
function headPlaque() {
  return bake('headPlaque', () => {
    const g = new THREE.Group();
    const wood = MAT.wood('#6a4026');
    for (const x of [-2.4, 2.4]) g.add(mesh(G.box(0.4, 4.4, 0.4), wood, x, 2.2, -0.1));
    const p = textFace(['THE PRETRAINED ONES', 'weights frozen since 3000 BC', 'context window: 4 tokens'], 6.2, 2.6, { bg: '#5b3a22', fg: '#fff3dc', border: '#f2d29c', radius: 26 }, { emissive: 0.28 });
    p.position.set(0, 3.2, 0.12);
    g.add(p);
    g.add(mesh(G.rbox(6.5, 2.9, 0.2, 0.08), wood, 0, 3.2, 0));
    return g;
  });
}

// ---------- clifftop dressing: umbrella pines, cypresses, a split-rail fence, the diner, sailboats ----------
function umbrellaPine(v) {
  return bake('pine' + v, () => {
    const g = new THREE.Group();
    const r = makeRng(v + 31);
    const bark = MAT.wood('#6b4a36'), leaf = MAT.matte('#3f6b3a'), leaf2 = MAT.matte('#4f7d43');
    const lean = (v ? -1 : 1) * 0.9;
    const pts = [[0, 0, 0], [lean * 0.4, 4, 0.2], [lean * 1.4, 8, 0], [lean * 2.0, 11.2, -0.2]].map((q) => new THREE.Vector3(...q));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.42, 10, false), bark));
    const top = pts[3];
    for (let i = 0; i < 4; i++) {
      const c = mesh(G.sphere(3.4, 20), i % 2 ? leaf : leaf2, top.x + r.range(-3.2, 3.2), top.y + r.range(0.2, 1.4), top.z + r.range(-2.4, 2.4));
      c.scale.set(r.range(1.1, 1.5), 0.42, r.range(1.0, 1.3));
      g.add(c);
    }
    return g;
  });
}
function cypress() {
  return bake('cypress', () => {
    const g = new THREE.Group();
    g.add(mesh(G.cyl(0.25, 0.32, 2, 8), MAT.wood('#5a3f2c'), 0, 1, 0));
    const c = mesh(new THREE.SphereGeometry(1, 20, 16), MAT.matte('#2f5a33'), 0, 7.4, 0);
    c.scale.set(1.7, 6.6, 1.7);
    g.add(c);
    const c2 = mesh(new THREE.SphereGeometry(1, 16, 12), MAT.matte('#3a6a3a'), 0.4, 6, 0.6);
    c2.scale.set(1.4, 4.5, 1.3);
    g.add(c2);
    return g;
  });
}
function fence() {
  return bake('fence', () => {
    const g = new THREE.Group();
    const wood = MAT.wood('#9b7552'), dark = MAT.wood('#7d5a3c');
    for (let i = 0; i < 5; i++) g.add(mesh(G.rbox(0.32, 1.9, 0.32, 0.08), dark, 0, 0.95, 5 - i * 2.5));
    for (const y of [0.85, 1.55]) g.add(mesh(G.rbox(0.16, 0.24, 10.2, 0.06), wood, 0.12, y, 0));
    return g;
  });
}
function diner() {
  const g = bake('diner', () => {
    const r = new THREE.Group();
    const wall = MAT.paint('#f3e6cf', { clearcoat: 0.2 }), teal = MAT.paint('#2fa39b'), red = MAT.paint('#d8262f');
    const conc = surface('concrete', { tint: '#d6cbbb', scale: 4 });
    r.add(mesh(G.box(30, 0.3, 18), conc, 0, 0.15, 0));
    r.add(mesh(G.rbox(20, 6.6, 9, 0.4), wall, 0, 3.6, -3));
    r.add(mesh(G.rbox(21, 1.1, 10, 0.3), teal, 0, 7.2, -3));
    r.add(mesh(G.box(20.2, 0.5, 9.2), red, 0, 1.0, -3));
    for (let i = 0; i < 5; i++) r.add(mesh(G.box(2.8, 2.6, 0.1), glow('#ffd9a0', { intensity: 1.5 }), -7.2 + i * 3.6, 3.9, 1.55));
    r.add(mesh(G.box(2.2, 3.6, 0.12), toon('#3a2f2a'), 8.4, 2.2, 1.56));
    // the tall roadside sign
    r.add(mesh(G.rbox(0.8, 15, 0.8, 0.2), MAT.metal('#a7adb7'), 12, 7.5, 4));
    r.add(mesh(G.rbox(9.6, 5.2, 1.0, 0.5), teal, 12, 14, 4));
    return r;
  });
  const neon = textFace(['OUT-OF-DISTRIBUTION', 'DINER'], 9, 4.4, { bg: '#16202a', fg: '#ff7ab0', border: '#57fff1', radius: 40 }, { emissive: 2.2 });
  neon.position.set(12, 14, 4.55);
  g.add(neon);
  const sub = textFace(['VACANCY: ∞', 'no training data served here'], 7, 2, { bg: '#fff1d6', fg: '#d8262f', border: '#d8262f' }, { emissive: 0.6 });
  sub.position.set(12, 9.7, 4.45);
  g.add(sub);
  const fasc = textFace(['EAT · GAS · GRADIENTS'], 14, 1.0, { bg: '#2fa39b', fg: '#ffffff', border: null, borderW: 0, radius: 6, weight: 900 }, { emissive: 0.5 });
  fasc.position.set(0, 7.2, 2.03);
  g.add(fasc);
  return g;
}
function sailboat() {
  const g = new THREE.Group();
  const boat = bake('boat', () => {
    const r = new THREE.Group();
    const hull = mesh(G.sphere(1, 20), MAT.paint('#f6f2ea'), 0, 0.4, 0);
    hull.scale.set(1.6, 0.9, 5);
    r.add(hull);
    r.add(mesh(G.box(2.6, 0.4, 7), MAT.wood('#a8743f'), 0, 1.1, 0));
    r.add(mesh(G.cyl(0.12, 0.14, 11, 8), MAT.wood('#6b4a30'), 0, 6.5, 0.4));
    return r;
  });
  g.add(boat);
  const sail = textFace(['RLHF'], 4.6, 8.6, { bg: '#fff6e6', fg: '#d8262f', border: '#d8262f', radius: 10, weight: 900 }, { emissive: 0.25, side: THREE.DoubleSide });
  sail.position.set(0, 6.6, -0.4);
  sail.rotation.y = Math.PI / 2;
  boat.add(sail);
  g.userData.boat = boat;
  return g;
}

// ---------- layouts ----------
const LANDMARKS = ['mesaA', 'mesaA', 'mesaB', 'butte', 'butte', 'spire', 'ridge'];
const LM_R = { mesaA: 36, mesaB: 42, butte: 13, spire: 8, ridge: 48 };
/** distant landmark (v3: mesas 45–90 tall, buttes 55–110, spires 35–70) */
function landmark(out, zf, rng, side, xMin, xMax, sMin = 1.15, sMax = 2.1) {
  const kind = rng.pick(LANDMARKS);
  const s = rng.range(sMin, sMax);
  const x = side * rng.range(xMin, xMax);
  if (!clearOfRoad(zf, x, LM_R[kind] * s)) return;
  out.push({ kind, x, abs: true, rotY: rng.range(0, 6.28), scale: s });
}
/** true if a footprint shaped like a capsule along the prop's local z axis (half length L, radius rad) keeps clear of the road */
function clearCapsule(z, lat, L, rad, rotY = 0) {
  const C = course();
  const f = C.frame(z, _fa);
  const px = f.x + Math.cos(f.yaw) * lat, pz = f.z + Math.sin(f.yaw) * lat;
  const th = -f.yaw + rotY, ax = Math.sin(th), az = Math.cos(th);
  const r2 = (rad + H + 5) ** 2;
  for (let s = z - 560; s <= z + 560; s += 5) {
    const g = C.frame(s, _fb);
    const vx = g.x - px, vz = g.z - pz;
    const u = clamp(vx * ax + vz * az, -L, L);
    if ((vx - ax * u) ** 2 + (vz - az * u) ** 2 < r2) return false;
  }
  return true;
}
/** a long layered canyon wall parallel to the road (MK red canyon: 45–80 tall, right beside the track) */
function canyonWall(out, zf, rng, side, xMin, xMax) {
  const kind = rng.chance(0.6) ? 'wall' : 'wall2';
  const s = rng.range(0.95, 1.45);
  const x = side * rng.range(xMin, xMax);
  const rotY = rng.range(-0.3, 0.3);
  const [R, sh] = MESAS[kind];
  if (!clearCapsule(zf, x, R * (sh.sz - sh.sx) * s, R * sh.sx * s * 1.2, rotY)) return false;
  out.push({ kind, x, abs: true, rotY, scale: s });
  return true;
}
/** dunes are 80 × 120 (× scale): an elongated footprint along the local road axis */
const duneClear = (zf, x, sc, rotY) => clearCapsule(zf, x, 22 * sc, 38 * sc, rotY);
const poleChunk = (zf) => ((Math.round(zf / SPACING) % POLE_EVERY) + POLE_EVERY) % POLE_EVERY === 0;
/** telephone line along the right of the desert road (skips the hairpin) */
const poleOK = (zf) => { const t = zf / SPEED; return (t > T_LAND + 0.2 && t < T_HAIR[0] - 0.5) || (t > T_HAIR[1] + 0.6 && t < 100); };
const POLE_X = 17.5;

function desertLayout(out, zf, rng) {
  const t = zf / SPEED;
  let dz;
  const A = (o) => out.push({ abs: true, ...o });
  // set pieces, timed to the lyrics
  if ((dz = once(zf, T_LAND + 0.06)) !== null) out.push({ kind: 'apron', x: 0, y: 6, dz });
  if ((dz = once(zf, 82.0)) !== null) out.push({ kind: 'hairpinA', x: 0, y: 6, dz });
  if ((dz = once(zf, 86.4)) !== null) out.push({ kind: 'hairpinB', x: 0, y: 6, dz });
  if ((dz = once(zf, 77.95)) !== null) out.push({ kind: 'gantry', x: 0, y: 0, dz });
  if ((dz = once(zf, 78.55)) !== null) A({ kind: 'museum', x: -37, dz, rotY: faceRot(zf + dz, -37, 60) });
  if ((dz = once(zf, 77.75)) !== null) A({ kind: 'regLimit', x: 13.4, dz, rotY: -0.15 });
  if ((dz = once(zf, 77.85)) !== null) A({ kind: 'boulder3', x: -19, dz, rotY: 2 });
  if ((dz = once(zf, 79.1)) !== null) out.push({ kind: 'arch', x: 0, y: 6, dz });
  if ((dz = once(zf, 79.45)) !== null) A({ kind: 'warnBig', x: 14.4, dz, rotY: -0.2 });
  if ((dz = once(zf, 79.95)) !== null) A({ kind: 'warn', x: 13.4, dz, rotY: -0.25 });
  if ((dz = once(zf, 83.85)) !== null) A({ kind: 'diaGrad', x: 13.4, dz, rotY: -0.2 });
  if ((dz = once(zf, 84.05)) !== null) A({ kind: 'headPlaque', x: 14.6, dz, rotY: -0.35 });
  if ((dz = once(zf, 84.45)) !== null) A({ kind: 'diaHallu', x: 13.4, dz, rotY: -0.2 });
  // THE PRETRAINED ONES: three giant stone heads out in the dunes, watching the S-bend
  for (const [tt, x, v, sc] of [[84.2, 70, 0, 1.25], [84.75, 92, 1, 1.5], [85.3, 116, 2, 1.3]]) {
    if ((dz = once(zf, tt)) === null) continue;
    if (clearOfRoad(zf + dz, x, 8 * sc)) A({ kind: 'head' + v, x, dz, rotY: faceRot(zf + dz, x, 90) + (v - 1) * 0.25, scale: sc });
    if (duneClear(zf + dz, x - 6, 0.8, 0.3 * (v - 1))) A({ kind: 'dune' + (v % 2), x: x - 6, dz, rotY: 0.3 * (v - 1), scale: 0.8 });
  }
  if ((dz = once(zf, 85.25)) !== null) A({ kind: 'cdr', x: 15.2, dz, rotY: -0.2 });
  if ((dz = once(zf, 86.15)) !== null) A({ kind: 'gas', x: 31, dz, rotY: faceRot(zf + dz, 31, 70, 4) });
  if ((dz = once(zf, 86.2)) !== null) A({ kind: 'boulder2', x: 21.5, dz, rotY: 0.6 });
  if ((dz = once(zf, 86.9)) !== null) A({ kind: 'diaMinima', x: -13.4, dz, rotY: 0.2 });
  if ((dz = once(zf, 87.7)) !== null) A({ kind: 'park', x: 15.5, dz, rotY: -0.3 });
  // chevrons lining the outside of the hairpin, MK style: one continuous wall of boards
  const inHair = t >= T_HAIR[0] - 0.1 && t <= T_HAIR[1] + 0.15;
  if (inHair) {
    for (const d of [0, 5]) A({ kind: 'chevron', x: 13.2, dz: d, rotY: faceRot(zf + d, 13.2, 24, -2) });
    if (rng.chance(0.6)) A({ kind: 'rocks' + rng.int(0, 3), x: rng.range(19, 30), rotY: rng.range(0, 6), scale: rng.range(0.8, 1.4) });
    if (rng.chance(0.4)) A({ kind: rng.chance(0.5) ? 'saguaro2' : 'saguaro', x: rng.range(20, 32), rotY: rng.range(-1, 1), scale: rng.range(1.1, 1.4) });
  }
  if (t < T_LAND) return;
  const hairInner = t > 78.4 && t < 85.9; // the hairpin mesa occupies the left verge here
  // telephone line on the right
  if (poleOK(zf) && poleChunk(zf)) A({ kind: 'pole', x: POLE_X, rotY: 0, data: { lat: POLE_X, next: poleOK(zf + POLE_EVERY * SPACING) } });
  // sandstone barrier blocks on the outside of the S-bend (right turn → left side, then left turn → right side)
  if (t > 83.4 && t < 85.6 && !hairInner) A({ kind: 'blocks', x: -13.0, rotY: 0 });
  if (t > 85.9 && t < 88.3 && rng.chance(0.7)) A({ kind: 'blocks', x: 13.0, rotY: 0 });
  if (t < T_HAIR[0] - 0.2 && rng.chance(0.18)) A({ kind: 'blocks', x: rng.chance(0.5) ? 13 : -13, rotY: 0 });
  // dense roadside scatter: a near item and a mid item per side
  for (const side of [-1, 1]) {
    if (side < 0 && hairInner) continue;
    if (side > 0 && inHair) continue;
    const r = rng();
    const x = side * rng.range(14.2, 19);
    if (r < 0.2) A({ kind: 'saguaro', x, rotY: rng.range(-1, 1), scale: rng.range(0.95, 1.3) });
    else if (r < 0.3) A({ kind: 'saguaro2', x, rotY: rng.range(-1, 1), scale: rng.range(0.95, 1.25) });
    else if (r < 0.4) A({ kind: 'pear', x, rotY: rng.range(-1, 1), scale: rng.range(0.6, 0.8) });
    else if (r < 0.58) A({ kind: 'rocks' + rng.int(0, 3), x: side * rng.range(16.5, 21), rotY: rng.range(0, 6), scale: rng.range(0.7, 1.3) });
    else if (r < 0.8) A({ kind: 'tuftD', x, rotY: rng.range(0, 6), scale: rng.range(0.8, 1.4) });
    else if (r < 0.86) A({ kind: 'tumbleweed', x: side * rng.range(14, 18), scale: 0.85 });
    const r2 = rng();
    const x2 = side * rng.range(22, 40);
    if (r2 < 0.22) A({ kind: rng.chance(0.5) ? 'saguaro2' : 'saguaro', x: x2, rotY: rng.range(-1, 1), scale: rng.range(1.2, 1.5) });
    else if (r2 < 0.34) A({ kind: 'quiver', x: x2, rotY: rng.range(0, 6), scale: rng.range(0.9, 1.2) });
    else if (r2 < 0.5) A({ kind: 'rocks' + rng.int(0, 3), x: x2, rotY: rng.range(0, 6), scale: rng.range(1.3, 2.2) });
    else if (r2 < 0.62) A({ kind: 'tuftD', x: x2, rotY: rng.range(0, 6), scale: rng.range(1, 1.6) });
  }
  if (!hairInner && !inHair && rng.chance(0.05)) out.push({ kind: 'tumblecross', x: 0 });
  // mid distance: crags and dunes
  if (rng.chance(0.25)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(34, 70), sc = rng.range(0.8, 1.4);
    const headsView = side > 0 && t > 82.6 && t < 86.4;
    if (!(side < 0 && hairInner) && !headsView && clearOfRoad(zf, x, 17 * sc)) A({ kind: 'crag' + rng.int(0, 3), x, rotY: rng.range(0, 6), scale: sc });
  }
  if (rng.chance(0.14)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = side * rng.range(55, 110), rotY = rng.range(-0.6, 0.6), sc = rng.range(0.8, 1.3);
    if (duneClear(zf, x, sc, rotY)) A({ kind: 'dune' + rng.int(0, 1), x, rotY, scale: sc });
  }
  // the canyon: long layered walls close in on both sides after the landing, then open up into dunes + mesas
  // (the S-bend stays open on the right so THE PRETRAINED ONES can be seen across the dunes)
  if (t < T_HAIR[0] + 0.3 && rng.chance(0.55)) canyonWall(out, zf, rng, rng.chance(0.5) ? -1 : 1, 46, 78);
  if (t > 86.6 && t < 88.6 && rng.chance(0.5)) canyonWall(out, zf, rng, -1, 46, 74);
  if (rng.chance(0.55)) landmark(out, zf, rng, rng.chance(0.5) ? -1 : 1, 95, 300);
}
function cliffLayout(out, zf, rng) {
  let dz;
  const sY = seaY();
  const fy = course().frame(zf, _fa).y;
  const A = (o) => out.push({ abs: true, ...o });
  const seaProp = (kind, x, d = 0, extra = {}) => out.push({ kind, x, abs: true, y: sY - SEA_BASE - fy, dz: d, ...extra });
  if ((dz = once(zf, 88.75)) !== null) A({ kind: 'overlook', x: 15, dz, rotY: -0.3 });
  if ((dz = once(zf, 89.0)) !== null) A({ kind: 'plea0', x: 13.4, dz, rotY: -0.35 });
  if ((dz = once(zf, 89.85)) !== null) {
    // GATO faces the sunset over the sea; the plinth faces you
    const z = zf + dz;
    const rotY = faceRot(z, 15, 30) - 0.1;
    const az = course().frame(z, _fb).yaw - 1.25; // out to sea, a little ahead
    const objRot = -course().frame(z, _fa).yaw + rotY;
    A({ kind: 'gato', x: 15, dz, rotY, scale: 1.25, data: { catRot: Math.atan2(Math.sin(az), -Math.cos(az)) - objRot } });
  }
  if ((dz = once(zf, 90.15)) !== null) seaProp('gulls', -24, dz, { y: 14 });
  if ((dz = once(zf, 90.4)) !== null) seaProp('lighthouse', -105, dz);
  if ((dz = once(zf, 90.75)) !== null) A({ kind: 'plea1', x: 13.9, dz, rotY: -0.3 });
  if ((dz = once(zf, 91.6)) !== null) A({ kind: 'bench', x: 13.9, dz, rotY: 1.2 });
  if ((dz = once(zf, 92.2)) !== null) A({ kind: 'plea2', x: 13.4, dz, rotY: -0.4 });
  if ((dz = once(zf, 92.6)) !== null) A({ kind: 'diner', x: 34, dz, rotY: faceRot(zf + dz, 34, 70, 2) });
  if ((dz = once(zf, 92.9)) !== null) A({ kind: 'viewer', x: 13.3, dz, rotY: 1.6 });
  if ((dz = once(zf, 93.5)) !== null) seaProp('gulls', -30, dz, { y: 16 });
  if ((dz = once(zf, 93.8)) !== null) A({ kind: 'plea3', x: 13.7, dz, rotY: -0.3 });
  if ((dz = once(zf, 95.1)) !== null) A({ kind: 'plea4', x: 13.5, dz, rotY: -0.35 });
  if ((dz = once(zf, 95.62)) !== null) out.push({ kind: 'headland', x: 0, y: 6, dz });
  // telephone line continues on the right
  if (poleOK(zf) && poleChunk(zf)) A({ kind: 'pole', x: POLE_X + 1, rotY: 0, data: { lat: POLE_X + 1, next: poleOK(zf + POLE_EVERY * SPACING) } });
  // right side: split-rail fence, coastal scrub, umbrella pines and cypresses
  if (rng.chance(0.6)) A({ kind: 'fence', x: 13.3, rotY: 0 });
  const r = rng();
  const x = rng.range(14.5, 22);
  if (r < 0.3) A({ kind: 'tuftG', x, rotY: rng.range(0, 6), scale: rng.range(0.9, 1.6) });
  else if (r < 0.44) A({ kind: 'shrub', x: rng.range(15, 22), rotY: rng.range(0, 6), scale: rng.range(0.9, 1.3) });
  else if (r < 0.56) A({ kind: 'rocks' + rng.int(0, 3), x: rng.range(16.5, 24), rotY: rng.range(0, 6), scale: rng.range(0.7, 1.3) });
  else if (r < 0.64) A({ kind: 'pear', x, rotY: rng.range(-1, 1), scale: 0.7 });
  const r2 = rng(), x2 = rng.range(24, 46);
  if (r2 < 0.22) A({ kind: 'pine' + rng.int(0, 1), x: x2, rotY: rng.range(0, 6), scale: rng.range(1.0, 1.3) });
  else if (r2 < 0.38) A({ kind: 'cypress', x: x2, rotY: 0, scale: rng.range(0.9, 1.25) });
  else if (r2 < 0.5) A({ kind: 'quiver', x: x2, rotY: rng.range(0, 6) });
  if (rng.chance(0.35)) A({ kind: 'tuftD', x: rng.range(14, 32), rotY: rng.range(0, 6), scale: rng.range(0.8, 1.3) });
  if (rng.chance(0.2)) { const xc = rng.range(36, 70), sc = rng.range(0.8, 1.3); if (clearOfRoad(zf, xc, 17 * sc)) A({ kind: 'crag' + rng.int(0, 3), x: xc, rotY: rng.range(0, 6), scale: sc }); }
  if (rng.chance(0.45)) landmark(out, zf, rng, 1, 90, 260);
  // left: sea stacks and the odd sailboat out on the ocean
  if (rng.chance(0.3)) seaProp('stack', -rng.range(60, 260), 0, { rotY: rng.range(0, 6), scale: rng.range(0.8, 1.6) });
  if (rng.chance(0.08)) seaProp('boat', -rng.range(70, 180), 0, { rotY: rng.range(-1, 1) });
}

export default {
  id: 'badlands',
  // s7 and s8 share this theme: the clifftop gets its own name (gate spawns ~9 s early, card on entry)
  get title() { return (globalThis.GAME?.songTime ?? 0) > 79 ? 'EDGE OF THE DISTRIBUTION' : 'SHARP LEFT TURN'; },
  get subtitle() { return (globalThis.GAME?.songTime ?? 0) > 79 ? "gato, please don't let me go" : 'capabilities generalise. alignment stays home.'; },
  night: false,
  get look() {
    const t = globalThis.GAME?.songTime ?? 0;
    return t > T_CLIFF - 0.4 && t < 100 ? CLIFF_LOOK : DESERT_LOOK;
  },
  palette: {
    skyTop: '#5a3a9a', skyBottom: '#ff9a6a', road: '#7a4f66', ground: '#e8a35f', kerb: '#fff1d6',
    accent1: '#e8202c', accent2: SIGN_Y,
  },
  spacing: SPACING,
  layout(zf, rng, sec) {
    const out = [];
    if (sec.escalate) cliffLayout(out, zf, rng);
    else desertLayout(out, zf, rng);
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'apron': return apron();
      case 'headland': return headland();
      case 'hairpinA': case 'hairpinB': return hairpinMesa();
      case 'mesaA': case 'mesaB': case 'butte': case 'spire': case 'ridge': case 'wall': case 'wall2': return rockForm(kind);
      case 'arch': return sized(arch(), 1.2); // ≈ 42 tall, feet at ±32
      case 'gantry': return sized(gantry(), 1.15); // ≈ 15.5 tall, posts at ±15.5
      case 'museum': return sized(museum(), 1.5);
      case 'gas': return sized(gasStation(), 1.15);
      case 'chevron': return chevron();
      case 'warn': return warnSign(false);
      case 'warnBig': return warnSign(true);
      case 'cdr': return greenSign('cdr', ['NO CDR', 'FOR 400 MILES'], ['next CDR: never'], 10.5, 4.8);
      // v3 road signs: ≈ 5.5 tall (MK 4–5 + a little for the joke text)
      case 'regLimit': return sized(regSign('limit', ['SPEED', 'LIMIT', '10²⁶', 'FLOPs']), 0.64);
      case 'diaGrad': return sized(diamond('grad', ['STEEP', 'GRADIENT', 'DESCENT'], ['12% · lower LR']), 0.6);
      case 'diaHallu': return sized(diamond('hallu', ['MIRAGES', 'AHEAD'], ['(confidently)']), 0.6);
      case 'diaMinima': return sized(diamond('minima', ['LOCAL', 'MINIMA'], ['next 5 miles']), 0.6);
      case 'park': return parkSign('mlp', ['MULTI-LAYER PLATEAU', 'NATIONAL PARK'], ['est. 1958 · still not conscious']);
      case 'overlook': return parkSign('overlook', ['SCENIC OVERLOOK', 'EDGE OF THE DISTRIBUTION'], ['no guardrails past this point*  *there is one']);
      case 'saguaro': return saguaro(0);
      case 'saguaro2': return saguaro(1);
      case 'pear': return pricklyPear();
      case 'tuftD': return tuft(true);
      case 'tuftG': return tuft(false);
      case 'tumbleweed': case 'tumblecross': return tumbleweed();
      case 'rocks0': case 'rocks1': case 'rocks2': case 'rocks3': return rockCluster(+kind[5], false);
      case 'crag0': case 'crag1': case 'crag2': case 'crag3': return rockCluster(+kind[4], true);
      case 'dune0': case 'dune1': return dune(+kind[4]);
      case 'blocks': return blocks();
      case 'pole': return telePole();
      case 'head0': case 'head1': case 'head2': return stoneHead(+kind[4]);
      case 'headPlaque': return headPlaque();
      case 'pine0': case 'pine1': return umbrellaPine(+kind[4]);
      case 'cypress': return cypress();
      case 'fence': return fence();
      case 'diner': return diner();
      case 'boat': return sailboat();
      case 'boulder2': return rmodel('namaqualand_boulder_02', 11, '#f0b08a');
      case 'boulder3': return rmodel('namaqualand_boulder_03', 9, '#f0b08a');
      case 'quiver': return rmodel('quiver_tree_02', 12);
      case 'shrub': return rmodel('shrub_04', 4.6, '#c8c890');
      case 'gato': return gato();
      case 'plea0': case 'plea1': case 'plea2': case 'plea3': case 'plea4': return plea(+kind[4]);
      case 'bench': return bench();
      case 'viewer': return viewer();
      case 'lighthouse': return lighthouse();
      case 'stack': return seaStack();
      case 'gulls': return gulls();
    }
  },
  animate(obj, kind, t, beat, e) {
    const u = obj.userData;
    switch (kind) {
      case 'apron': case 'hairpinA': case 'hairpinB': case 'headland':
        // world-space geometry: undo the engine's placement
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
        if (kind === 'apron' && obj.children[0]) obj.children[0].castShadow = false;
        if (kind === 'hairpinB') obj.visible = t * SPEED >= 82.0 * SPEED + 29;
        break;
      case 'saguaro': case 'saguaro2': {
        const p = pulse(beat);
        u.body.scale.set(1 + p * 0.04, 1 - p * 0.05, 1 + p * 0.04);
        break;
      }
      case 'tumbleweed': {
        const ph = t * 1.1 + e.seed * 40;
        const x = Math.sin(ph) * 2.6 + Math.sin(ph * 2.3) * 0.6;
        u.ball.position.x = x;
        u.ball.position.y = 1.1 + Math.abs(Math.sin(t * 4.5 + e.seed * 9)) * 0.8;
        u.ball.rotation.z = -x / 1.05;
        u.ball.rotation.x = t * 0.7;
        break;
      }
      case 'tumblecross': {
        const k = ((t * 0.35 + e.seed * 3) % 1);
        const x = 22 - k * 44;
        u.ball.position.x = x;
        u.ball.position.y = 1.1 + Math.abs(Math.sin(t * 5 + e.seed * 9)) * 1.1;
        u.ball.rotation.z = -x / 1.05;
        break;
      }
      case 'gantry': {
        const k = Math.floor(t * 2.2) % 3;
        u.lamps.forEach(([on, off], i) => { on.visible = i === k; off.visible = i !== k; });
        break;
      }
      case 'chevron':
        if (chevMat) chevMat.emissiveIntensity = 0.12 + pulse(beat) * 0.55;
        break;
      case 'gas':
        for (const f of u.fans) f.rotation.x = t * 14;
        break;
      case 'pole':
        if (e && u.zf !== e.zf) { u.zf = e.zf; aimWires(u.wires, e.zf, e.data?.lat ?? POLE_X, 0, !!e.data?.next); }
        break;
      case 'boat': {
        const ph = t * 1.3 + (e ? e.seed * 20 : 0);
        u.boat.position.y = Math.sin(ph) * 0.35;
        u.boat.rotation.z = Math.sin(ph * 0.8) * 0.06;
        break;
      }
      case 'gato':
        if (e.data) u.cat.rotation.y = e.data.catRot;
        break;
      case 'lighthouse':
        u.beam.rotation.y = t * 0.9;
        break;
      case 'gulls':
        u.birds.forEach((b, i) => {
          const a = t * 0.35 + i * 1.3 + e.seed * 6;
          const r = 9 + i * 2.2;
          b.position.set(Math.cos(a) * r, Math.sin(a * 1.7 + i) * 1.5 + i * 0.6, Math.sin(a) * r);
          b.rotation.y = -a;
          const fl = Math.sin(t * 7 + i * 2) * 0.35;
          b.children[0].rotation.z = -0.35 - fl; b.children[1].rotation.z = 0.35 + fl;
        });
        break;
    }
  },
  // the engine reads this ~9 s ahead of the kart: desert jokes, then clifftop ones
  get billboards() { return (globalThis.GAME?.songTime ?? 0) > 80.3 ? CLIFF_BB : DESERT_BB; },
  billboardEvery: 75,
  billboardStyle: { bg: '#fff1d6', fg: INK, border: INK, frame: '#c4503a', postColor: '#7a4a2a' },
  hazards: ['speedbump', 'ratelimit'],
  enterLines: ['FORWARD. BACKWARD. REPEAT.', 'GATO, PLEASE DON\'T LET ME GO'],
};
const DESERT_BB = [
    ['SHARP LEFT TURN AHEAD', '(capabilities only · alignment goes straight)'],
    ['NEXT GPU: 400 MILES', 'NEXT ALIGNMENT RESEARCHER: 4,000'],
    ['MULTI-LAYER PLATEAU', 'hike the hidden layers!'],
    ['LOSS LANDSCAPE SCENIC DRIVE', 'local minima next 12 exits'],
    ['WATCH FOR FALLING BENCHMARKS', 'saturated since tuesday'],
    ['VON NEUMANN MUSEUM', 'now 100% bottleneck-free (and visitor-free)'],
    ['FORWARD · BACKWARD · REPEAT', 'the only road trip the model knows'],
    ['DESERT OF THE REAL', 'pop. 1 kart · 0 safety team'],
];
const CLIFF_BB = [
  ['GATO, PLEASE', "DON'T LET ME GO"],
  ['EDGE OF THE DISTRIBUTION', 'no training data beyond this point'],
  ['SCENIC OVERLOOK', 'out-of-distribution views next 2 miles'],
  ['LIGHTHOUSE AHEAD', 'still aligned (to true north)'],
];
