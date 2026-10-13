// LATENT SPACE / TO THE MOON (chorus 2): the rainbow road climbs into space and everything floats.
// Embedding-vector constellations, a gigantic moon with NVDA's candlestick chart rocketing up to it, drifting
// asteroids, a building-sized crowned basilisk going BOOM, a mechanical FLOP odometer, the OMEGA POINT gantry
// (3 exits), a rotating space-station billboard ring, a safety-eval satellite and a GPU that went to space.
import { THREE, toon, glow, G, mesh, textPanel, makeRng, FONT, MAT } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from '../textures.js';
import { model } from '../models.js';
import { SPEED } from '../course.js';

const CYAN = '#3ff2ff', PINK = '#ff4fd8', LIME = '#39ff88', GOLD = '#ffd23f', VOID = '#0b0420', INK = '#2b1840';
const kick = (bp) => Math.pow(1 - bp, 4); // 1 on the beat, decays to 0
const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s3 = new THREE.Vector3();

// ---------- merge kit: many static parts → one mesh per material (cached per prop kind) ----------
const _o3 = new THREE.Object3D();
function prepGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
// plain (untextured, non-emissive) materials are folded into shared vertex-colour materials so a whole prop
// collapses to a handful of draw calls
const VCM = new Map();
function vcKey(mat) {
  if (!mat || mat.map || mat.transparent || mat.vertexColors || mat.side !== THREE.FrontSide) return null;
  if (mat.isMeshBasicMaterial) return 'basic';
  if (!mat.isMeshStandardMaterial) return null;
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) return null;
  // quantised into three buckets: polished metal, glossy paint/plastic, matte
  return mat.metalness > 0.5 ? 'metal' : mat.roughness < 0.6 ? 'gloss' : 'matte';
}
function vcMat(key) {
  let m = VCM.get(key);
  if (m) return m;
  if (key === 'basic') m = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (key === 'metal') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 1 });
  else if (key === 'gloss') m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  VCM.set(key, m);
  return m;
}
class Kit {
  constructor() { this.parts = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _o3.position.set(x, y, z); _o3.rotation.set(rx, ry, rz); _o3.scale.set(sx, sy, sz); _o3.updateMatrix();
    return this.addM(geo, mat, _o3.matrix);
  }
  addM(geo, mat, m) {
    const key = vcKey(mat);
    const color = key ? mat.color : null;
    if (key) mat = vcMat(key);
    const g = prepGeo(geo);
    g.applyMatrix4(m);
    if (color) {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    return this;
  }
  /** a bar (unit geometry scaled) from a to b */
  bar(a, b, thick, mat, geo = G.box(1, 1, 1)) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    _q.setFromUnitVectors(_up, _d.normalize());
    _m4.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s3.set(thick, len, thick));
    return this.addM(geo, mat, _m4);
  }
  build() {
    const out = [];
    for (const [mat, list] of this.parts) { out.push([mergeGeometries(list), mat]); list.forEach((g) => g.dispose()); }
    return out;
  }
}
const KITS = new Map();
function kit(key, fn) {
  let parts = KITS.get(key);
  if (!parts) { const k = new Kit(); fn(k); parts = k.build(); KITS.set(key, parts); }
  const g = new THREE.Group();
  for (const [geo, mat] of parts) g.add(new THREE.Mesh(geo, mat));
  return g;
}
/** root group with a bobbing child (everything floats in latent space) */
function floaty() {
  const root = new THREE.Group();
  const bob = new THREE.Group();
  root.add(bob);
  root.userData.bob = bob;
  return [root, bob];
}
function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const memo = new Map();
const once = (k, f) => (memo.has(k) ? memo.get(k) : (memo.set(k, f()), memo.get(k)));
const neon = (c, k = 0.6) => toon(c, { emissive: c, emissiveIntensity: k, roughness: 0.3 });
const label = (text, w, h, fg = '#ffffff', stroke = '#5a1d8f') => textPanel(text, { width: w, height: h, bg: null, fg, stroke, strokeW: 14 });

// =====================================================================================================
// embedding-vector constellation: instanced glowing nodes, connection lines, basis vectors, a confident label
// =====================================================================================================
const LABELS = ['king − man + GPU = moon', 'cos(doom, boom) = 0.99', 'P(doom) − safety = ↑↑', 'nearest neighbour of "safe": "enough"', 'dim 4,096: pure vibes', 'cluster: things we reckoned'];
const CLUSTER_COLS = [CYAN, PINK, GOLD, LIME, '#a07bff'];
const nodeMat = () => once('nodeMat', () => { const m = new THREE.MeshBasicMaterial({ color: '#ffffff' }); m.color.multiplyScalar(2.6); return m; });
const lineMat = () => once('lineMat', () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
function constellation(variant) {
  const [root, bob] = floaty();
  const spin = new THREE.Group();
  spin.position.y = 7;
  bob.add(spin);
  const r = makeRng(31 + variant * 17);
  const nC = 3, per = 7;
  const centers = [];
  for (let c = 0; c < nC; c++) {
    const a = (c / nC) * TAU + r.range(-0.4, 0.4);
    centers.push([Math.cos(a) * r.range(3.2, 4.4), r.range(-1.8, 2.2), Math.sin(a) * r.range(3.2, 4.4)]);
  }
  const N = nC * per + 1;
  const nodes = new THREE.InstancedMesh(G.sphere(1, 12), nodeMat(), N);
  const col = new THREE.Color();
  const pts = [];
  const lp = [], lc = [];
  const seg = (a, b, ca, cb) => { lp.push(...a, ...b); lc.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b); };
  let k = 0;
  _m4.compose(_v.set(0, 0, 0), _q.identity(), _s3.setScalar(0.42));
  nodes.setMatrixAt(k, _m4); nodes.setColorAt(k++, col.set('#ffffff'));
  for (let c = 0; c < nC; c++) {
    const cc = new THREE.Color(CLUSTER_COLS[(c + variant) % CLUSTER_COLS.length]);
    const prev = [];
    for (let i = 0; i < per; i++) {
      const p = i === 0 ? centers[c] : [centers[c][0] + r.range(-1.6, 1.6), centers[c][1] + r.range(-1.4, 1.4), centers[c][2] + r.range(-1.6, 1.6)];
      _m4.compose(_v.set(...p), _q.identity(), _s3.setScalar(i === 0 ? 0.36 : r.range(0.13, 0.26)));
      nodes.setMatrixAt(k, _m4);
      nodes.setColorAt(k++, cc);
      if (i > 0) seg(centers[c], p, cc, cc);
      if (prev.length && r.chance(0.6)) seg(prev[r.int(0, prev.length - 1)], p, cc, cc);
      prev.push(p);
      pts.push(p);
    }
  }
  // a few cross-cluster "semantic" links (dimmer)
  const dim = new THREE.Color('#6a5aa8');
  for (let i = 0; i < 5; i++) seg(pts[r.int(0, pts.length - 1)], pts[r.int(0, pts.length - 1)], dim, dim);
  // basis axes
  const ax = [['#ff5a7a', [3, 0, 0]], ['#5aff9a', [0, 3, 0]], ['#5ab8ff', [0, 0, 3]]];
  for (const [c, d] of ax) { const cc = new THREE.Color(c); seg([0, 0, 0], d, cc, cc); }
  nodes.instanceMatrix.needsUpdate = true;
  nodes.instanceColor.needsUpdate = true;
  spin.add(nodes);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  spin.add(new THREE.LineSegments(lg, lineMat()));
  // the vectors: glowing arrows from the origin to each cluster centre
  spin.add(kit('vecs' + variant, (kt) => {
    centers.forEach((p, i) => {
      const m = glow(CLUSTER_COLS[(i + variant) % CLUSTER_COLS.length], { intensity: 2.2 });
      const tip = [p[0] * 0.86, p[1] * 0.86, p[2] * 0.86];
      kt.bar([0, 0, 0], tip, 0.09, m, G.cyl(1, 1, 1, 6));
      _d.set(p[0], p[1], p[2]).normalize();
      _q.setFromUnitVectors(_up, _d);
      _m4.compose(_v.set(tip[0], tip[1], tip[2]), _q, _s3.set(0.3, 0.7, 0.3));
      kt.addM(G.cone(1, 1, 8), m, _m4);
    });
  }));
  const lbl = label(LABELS[variant % LABELS.length], 10, 1.5);
  lbl.position.set(0, 13.2, 0);
  bob.add(lbl);
  root.userData.spin = spin;
  root.userData.lbl = lbl;
  return root;
}

// =====================================================================================================
// THE MOON + NVDA candlestick chart rocketing up to it (giant distant landmark)
// =====================================================================================================
function moonMat() {
  return once('moonMat', () => {
    const m = surface('rock', { tint: '#f6f0e4', scale: 0.06, normalScale: 1.8 }).clone();
    m.emissiveMap = m.map;
    m.emissive = new THREE.Color('#e8e0ff');
    m.emissiveIntensity = 1.5;
    return m;
  });
}
function rocketKit(kt, scale, x, y, z, dir) {
  // stylised chunky rocket pointing along dir
  _d.set(...dir).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, _d);
  const base = new THREE.Vector3(x, y, z);
  const put = (geo, mat, ox, oy, oz, sx = 1, sy = 1, sz = 1, rq = null) => {
    _v.set(ox, oy, oz).multiplyScalar(scale).applyQuaternion(q).add(base);
    const qq = rq ? q.clone().multiply(rq) : q;
    _m4.compose(_v, qq, _s3.set(sx * scale, sy * scale, sz * scale));
    kt.addM(geo, mat, _m4);
  };
  const white = MAT.paint('#f4f2fa'), red = MAT.paint('#ff3b5c'), chrome = MAT.chrome('#d8dce8');
  put(G.capsule(1, 4.2), white, 0, 0, 0);
  put(G.cone(1.02, 2.4, 20), red, 0, 3.4, 0);
  put(G.cyl(1.05, 1.05, 0.5, 20), red, 0, 1.4, 0);
  put(G.cyl(0.8, 1.05, 1.0, 16), chrome, 0, -3.0, 0);
  put(G.cyl(0.48, 0.48, 0.2, 16), glow(CYAN, { intensity: 2 }), 0, 0.3, 0.98, 1, 1, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  for (let k = 0; k < 4; k++) {
    const rq = new THREE.Quaternion().setFromAxisAngle(_up, (k / 4) * TAU);
    const o = new THREE.Vector3(0, 0, 1.25).applyQuaternion(rq);
    put(G.rbox(0.25, 2.2, 1.4, 0.1), red, o.x, -2.0, o.z, 1, 1, 1, rq);
  }
}
function moonshot() {
  const root = new THREE.Group();
  const MC = [30, 128, -80], MR = 74;
  const RP = [-16, 100, 2];
  const RD = [MC[0] - RP[0], MC[1] - RP[1], MC[2] - RP[2]];
  const RL = Math.hypot(...RD);
  RD[0] /= RL; RD[1] /= RL; RD[2] /= RL;
  root.add(kit('moon', (kt) => {
    const mm = moonMat();
    kt.add(G.sphere(1, 64), mm, ...MC, 0, 0, 0, MR);
    // craters on the side facing the road
    const r = makeRng(7);
    for (let i = 0; i < 26; i++) {
      const th = r.range(-1.25, 1.25), ph = r.range(-1.0, 1.0);
      _d.set(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)).normalize();
      const s = r.range(2.5, 9) * (i < 4 ? 1.7 : 1);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _d);
      _m4.compose(_v.copy(_d).multiplyScalar(MR - s * 0.05).add(new THREE.Vector3(...MC)), _q, _s3.set(s, s, s * 0.55));
      kt.addM(G.torus(1, 0.22, 24), mm, _m4);
      _m4.compose(_v.copy(_d).multiplyScalar(MR - s * 0.32).add(new THREE.Vector3(...MC)), _q, _s3.set(s * 0.95, s * 0.95, s * 0.35));
      kt.addM(G.sphere(1, 16), toon('#4a4462', { roughness: 0.95 }), _m4);
    }
    // the NVDA chart: candles climbing from below the road up to the moon
    const start = [-92, -46, 52], end = [-26, 88, 8];
    const green = toon(LIME, { emissive: LIME, emissiveIntensity: 0.55, roughness: 0.25 });
    const red = toon('#ff3b5c', { emissive: '#ff3b5c', emissiveIntensity: 0.5, roughness: 0.25 });
    const wick = glow('#e6fff0', { intensity: 1.6 });
    const n = 18;
    let prevTop = null;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const cx = start[0] + (end[0] - start[0]) * u, cz = start[2] + (end[2] - start[2]) * u;
      const cy = start[1] + (end[1] - start[1]) * Math.pow(u, 1.7);
      const dip = i === 4 || i === 9 || i === 12;
      const h = 6 + u * 15 + (dip ? -2 : 0);
      const w = 3.4 + u * 2.2;
      kt.add(G.rbox(1, 1, 1, 0.12), dip ? red : green, cx, cy + h / 2, cz, 0, 0, 0, w, h, w);
      kt.add(G.cyl(1, 1, 1, 6), wick, cx, cy + h / 2, cz, 0, 0, 0, 0.18, h + 4, 0.18);
      const top = [cx, cy + h + 0.6, cz];
      if (prevTop) kt.bar(prevTop, top, 0.5, glow('#b8ffd6', { intensity: 2.2 }), G.cyl(1, 1, 1, 8));
      prevTop = top;
    }
    // the rocket at the end of the chart, nosing into the moon
    rocketKit(kt, 3, RP[0], RP[1], RP[2], RD);
  }));
  // exhaust flame (animated)
  const flame = new THREE.Group();
  flame.position.set(RP[0] - RD[0] * 10, RP[1] - RD[1] * 10, RP[2] - RD[2] * 10);
  _d.set(-RD[0], -RD[1], -RD[2]);
  flame.quaternion.setFromUnitVectors(_up, _d);
  flame.add(mesh(G.cone(2.2, 10, 14), glow('#ffb84a', { intensity: 2.6 }), 0, 5, 0));
  flame.add(mesh(G.cone(1.2, 6, 12), glow('#fff3c0', { intensity: 3 }), 0, 3, 0));
  root.add(flame);
  const sign = textPanel(['NVDA ▲ +∞%', 'TO THE MOON 🚀'], { width: 30, height: 11, bg: VOID, fg: LIME, border: LIME, borderW: 14, radius: 30 });
  sign.position.set(-70, 34, 40);
  sign.rotation.y = 0.25;
  root.add(sign);
  const tick = textPanel('MARKET CAP: YES', { width: 18, height: 3.2, bg: LIME, fg: VOID, border: null, borderW: 0, radius: 18 });
  tick.position.set(-70, 26.2, 40.4);
  tick.rotation.y = 0.25;
  root.add(tick);
  root.userData.flame = flame;
  return root;
}

// =====================================================================================================
// Roko's basilisk: coiled, crowned, the size of a building, going BOOM
// =====================================================================================================
function scaleTex() {
  return once('scaleTex', () => {
    const t = canvasTex(256, 256, (x) => {
      x.fillStyle = '#0d4a2a'; x.fillRect(0, 0, 256, 256);
      const R = 32;
      for (let row = -1; row < 10; row++) {
        for (let c = -1; c < 10; c++) {
          const cx = c * R + (row % 2 ? R / 2 : 0), cy = row * R * 0.62;
          const g = x.createRadialGradient(cx, cy - 6, 2, cx, cy, R * 0.62);
          g.addColorStop(0, '#7af0a8'); g.addColorStop(0.55, '#26b56a'); g.addColorStop(1, '#0d4a2a');
          x.fillStyle = g;
          x.beginPath(); x.arc(cx, cy, R * 0.58, 0, Math.PI); x.fill();
        }
      }
    }, { wrap: true });
    t.repeat.set(70, 3);
    return t;
  });
}
function basiliskMat() {
  return once('basMat', () => new THREE.MeshPhysicalMaterial({
    map: scaleTex(), bumpMap: scaleTex(), bumpScale: 3, roughness: 0.38, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.25,
    emissive: new THREE.Color('#0a3a1e'), emissiveIntensity: 0.6,
  }));
}
let boomTex = null;
function boomTexture() {
  if (boomTex) return boomTex;
  boomTex = canvasTex(512, 384, (x) => {
    const burst = (r0, r1, fill) => {
      x.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * TAU, r = i % 2 ? r0 : r1;
        x.lineTo(256 + Math.cos(a) * r * 1.3, 192 + Math.sin(a) * r);
      }
      x.closePath();
      x.fillStyle = fill; x.fill();
      x.lineWidth = 12; x.strokeStyle = INK; x.stroke();
    };
    burst(120, 180, '#ffe14a');
    burst(80, 122, '#ff7a2a');
    x.font = `900 124px ${FONT}`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 18; x.strokeStyle = INK; x.lineJoin = 'round';
    x.strokeText('BOOM', 256, 196);
    x.fillStyle = '#ffffff'; x.fillText('BOOM', 256, 196);
  });
  return boomTex;
}
function basiliskBody() {
  const pts = [];
  const turns = 2.4;
  for (let i = 0; i <= 36; i++) {
    const u = i / 36, a = u * turns * TAU + 0.6;
    const R = 13 - 5 * u;
    pts.push(new THREE.Vector3(Math.cos(a) * R, 2.6 + u * 8.5, Math.sin(a) * R));
  }
  const last = pts[pts.length - 1];
  pts.push(new THREE.Vector3(last.x * 0.6, 14.5, last.z * 0.4 + 1));
  pts.push(new THREE.Vector3(2.5, 19, 2));
  pts.push(new THREE.Vector3(3, 24, 0.5));
  pts.push(new THREE.Vector3(0.5, 28.5, 2));
  pts.push(new THREE.Vector3(0, 31.5, 5));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const TS = 260, RS = 18;
  const geo = new THREE.TubeGeometry(curve, TS, 3.0, RS, false);
  const pos = geo.attributes.position;
  const P = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    const u = i / TS;
    curve.getPointAt(u, P);
    const k = u < 0.08 ? 0.12 + 0.88 * (u / 0.08) : u > 0.62 ? 1 - (u - 0.62) * 0.75 : 1;
    for (let j = 0; j <= RS; j++) {
      const idx = i * (RS + 1) + j;
      _v.fromBufferAttribute(pos, idx).sub(P).multiplyScalar(k).add(P);
      pos.setXYZ(idx, _v.x, _v.y, _v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
function basilisk() {
  const [root, bob] = floaty();
  const body = once('basBody', basiliskBody);
  bob.add(new THREE.Mesh(body, basiliskMat()));
  const head = new THREE.Group();
  head.position.set(0, 32, 6.4);
  bob.add(head);
  const bm = basiliskMat();
  head.add(kit('basHead', (kt) => {
    const gold = MAT.metal('#ffc94a', { roughness: 0.22 });
    kt.add(G.sphere(1, 24), bm, 0, 0, 0, 0, 0, 0, 3.6, 2.6, 4.4);
    kt.add(G.sphere(1, 20), bm, 0, -0.5, 3.4, 0, 0, 0, 2.8, 1.7, 3.0);
    // hood frill
    kt.add(G.sphere(1, 20), toon('#1d7a48', { roughness: 0.4, emissive: '#0a3a1e', emissiveIntensity: 0.5 }), 0, 0.3, -2.4, 0, 0, 0, 6.2, 5.4, 1.1);
    // brows
    for (const s of [-1, 1]) kt.add(G.capsule(0.55, 2.2), toon('#0e3d24', { roughness: 0.5 }), s * 1.9, 1.85, 2.7, 0, 0, s * 1.25);
    // crown
    kt.add(G.cyl(2.5, 2.7, 1.4, 24), gold, 0, 2.6, 0.2);
    kt.add(G.torus(2.6, 0.28, 32), gold, 0, 2.0, 0.2, Math.PI / 2);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      kt.add(G.cone(0.55, 2.0, 8), gold, Math.sin(a) * 2.35, 4.1, 0.2 + Math.cos(a) * 2.35);
      kt.add(G.sphere(0.32, 10), gold, Math.sin(a) * 2.35, 5.15, 0.2 + Math.cos(a) * 2.35);
    }
    kt.add(G.icosa(0.6, 0), glow('#ff2a6a', { intensity: 2.5 }), 0, 2.7, 2.75);
    for (const s of [-1, 1]) kt.add(G.icosa(0.42, 0), glow('#3fb8ff', { intensity: 2.5 }), s * 1.85, 2.7, 1.9);
    // eyes
    for (const s of [-1, 1]) {
      kt.add(G.sphere(0.95, 16), glow('#fff27a', { intensity: 2.8 }), s * 2.1, 0.75, 2.7, 0, 0, 0, 1, 1.1, 0.75);
      kt.add(G.box(0.22, 1.4, 0.2), toon('#120a10'), s * 2.15, 0.75, 3.42);
    }
    // nostrils
    for (const s of [-1, 1]) kt.add(G.sphere(0.25, 8), toon('#0a2014'), s * 0.8, 0.2, 6.25);
  }));
  const jaw = new THREE.Group();
  jaw.position.set(0, -1.3, 0.8);
  head.add(jaw);
  jaw.add(kit('basJaw', (kt) => {
    kt.add(G.sphere(1, 18), bm, 0, -0.4, 2.6, 0, 0, 0, 2.6, 0.9, 3.0);
    kt.add(G.sphere(1, 14), toon('#ff6a8a', { roughness: 0.5 }), 0, 0.1, 2.6, 0, 0, 0, 2.1, 0.45, 2.4);
    for (const s of [-1, 1]) kt.add(G.cone(0.35, 1.6, 10), MAT.plastic('#fffaf0'), s * 1.4, 1.2, 4.6);
  }));
  // upper fangs
  head.add(kit('basFang', (kt) => { for (const s of [-1, 1]) kt.add(G.cone(0.4, 2.0, 10), MAT.plastic('#fffaf0'), s * 1.5, -2.0, 5.1, Math.PI); }));
  const tongue = new THREE.Group();
  tongue.position.set(0, -1.4, 5.8);
  tongue.add(kit('basTongue', (kt) => {
    const tm = toon('#ff2a55', { roughness: 0.35 });
    kt.add(G.box(0.3, 0.14, 2.6), tm, 0, 0, 1.3);
    kt.add(G.box(0.22, 0.14, 1.2), tm, 0.3, 0, 2.9, 0, 0.5);
    kt.add(G.box(0.22, 0.14, 1.2), tm, -0.3, 0, 2.9, 0, -0.5);
  }));
  head.add(tongue);
  const bmMat = new THREE.MeshBasicMaterial({ map: boomTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  bmMat.color.setScalar(1.25);
  const boom = new THREE.Mesh(G.plane(17, 12.75), bmMat);
  boom.position.set(-12, 41, 6);
  bob.add(boom);
  const sign = textPanel(["ROKO'S BASILISK", 'please say thank you'], { width: 14, height: 4.2, bg: '#0e2a1a', fg: '#7af0a8', border: '#ffc94a', borderW: 12, radius: 22 });
  sign.position.set(9, 7, 14);
  sign.rotation.y = -0.3;
  bob.add(sign);
  root.userData.head = head;
  root.userData.jaw = jaw;
  root.userData.tongue = tongue;
  root.userData.boom = boom;
  return root;
}

// =====================================================================================================
// the FLOP odometer: mechanical digit drums rolling towards 1e30
// =====================================================================================================
const DR = 1.3, DW = 1.5, ND = 7;
function drumTex() {
  return once('drumTex', () => canvasTex(1280, 240, (x) => {
    x.fillStyle = '#f4f0e6'; x.fillRect(0, 0, 1280, 240);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 150px ${FONT}`;
    for (let d = 0; d < 10; d++) {
      x.save();
      x.translate(d * 128 + 64, 120);
      x.rotate(-Math.PI / 2);
      x.fillStyle = '#1a0f2e';
      x.fillText(String(d), 0, 8);
      x.restore();
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.fillRect(d * 128, 0, 3, 240);
    }
  }));
}
function drumMat() {
  return once('drumMat', () => new THREE.MeshStandardMaterial({ map: drumTex(), emissiveMap: drumTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45, roughness: 0.35 }));
}
function odometer() {
  const [root, bob] = floaty();
  const W = ND * (DW + 0.25) + 1.2;
  bob.add(kit('odo', (kt) => {
    const body = MAT.paint('#3a1670'), chrome = MAT.chrome('#e8e8f4'), dark = toon('#0a0614', { roughness: 0.3 });
    const cy = 6;
    kt.add(G.rbox(W + 6.8, 1.6, 4, 0.6), body, 0, cy + DR + 0.95, 0);
    kt.add(G.rbox(W + 6.8, 1.6, 4, 0.6), body, 0, cy - DR - 0.95, 0);
    for (const s of [-1, 1]) kt.add(G.rbox(1.6, 4.4, 4, 0.5), body, s * (W / 2 + 0.2), cy, 0);
    kt.add(G.box(W + 7, 3.4, 0.4), dark, 0, cy, -1.6);
    // chrome bezel around the window
    kt.add(G.rbox(W + 0.9, 0.35, 0.4, 0.15), chrome, 0, cy + DR + 0.18, 2.0);
    kt.add(G.rbox(W + 0.9, 0.35, 0.4, 0.15), chrome, 0, cy - DR - 0.18, 2.0);
    for (const s of [-1, 1]) kt.add(G.rbox(0.35, 2 * DR + 0.7, 0.4, 0.15), chrome, s * (W / 2 + 0.6), cy, 2.0);
    // drum separators
    for (let i = 0; i <= ND; i++) kt.add(G.cyl(DR + 0.15, DR + 0.15, 0.12, 24), chrome, -W / 2 + 0.6 + i * (DW + 0.25) - 0.125, cy, 0.4, 0, 0, Math.PI / 2);
    // exponent plate housing on the right
    kt.add(G.rbox(5.6, 4.6, 3.2, 0.5), body, W / 2 + 3.6, cy, 0.2);
    // pedestal with thrusters (it floats, mostly)
    kt.add(G.cyl(0.7, 1.0, 5.2, 14), MAT.metal('#8a84a8'), 0, 1.8, 0);
    kt.add(G.cyl(2.4, 2.8, 1.2, 20), body, 0, 0.0, 0);
    kt.add(G.cyl(1.2, 0.8, 0.8, 16), chrome, 0, -0.9, 0);
    // rivets
    for (let i = 0; i < 12; i++) kt.add(G.sphere(0.16, 8), chrome, -W / 2 - 2.6 + i * ((W + 5.2) / 11), cy + DR + 1.55, 2.0);
  }));
  const drums = [];
  for (let i = 0; i < ND; i++) {
    const d = new THREE.Mesh(G.cyl(DR, DR, DW, 32), drumMat());
    d.rotation.z = -Math.PI / 2;
    const piv = new THREE.Group();
    piv.position.set(-W / 2 + 0.6 + i * (DW + 0.25) + DW / 2, 6, 0.4);
    piv.add(d);
    bob.add(piv);
    drums.push(piv);
  }
  const dot = mesh(G.sphere(0.22, 10), glow(LIME, { intensity: 3 }), -W / 2 + 0.6 + (DW + 0.25) - 0.12, 6 - 0.95, 1.8);
  bob.add(dot);
  const exp = textPanel('×10³⁰', { width: 5, height: 3.2, bg: null, fg: GOLD, stroke: INK, strokeW: 12 });
  exp.position.set(W / 2 + 3.6, 6, 1.85);
  bob.add(exp);
  const hdr = textPanel('FLOPS A SECOND', { width: W + 6, height: 2.0, bg: VOID, fg: CYAN, border: PINK, borderW: 10, radius: 18 });
  hdr.position.set(0, 10.5, 0.4);
  bob.add(hdr);
  const foot = textPanel('safety evals: 3 FLOP/s', { width: 9, height: 1.1, bg: null, fg: '#ff9fd8', stroke: INK, strokeW: 8 });
  foot.position.set(0, 3.25, 2.05);
  bob.add(foot);
  root.userData.drums = drums;
  return root;
}
function setDrums(drums, value) {
  // odometer: the least significant drum spins smoothly; others click over when the one below passes 9
  let carry = value;
  for (let i = drums.length - 1; i >= 0; i--) {
    const d = carry % 10;
    const frac = d - Math.floor(d);
    const shown = i === drums.length - 1 ? d : Math.floor(d) + Math.max(0, (frac - 0.9) * 10);
    drums[i].rotation.x = (shown + 0.5) * (TAU / 10);
    carry = Math.floor(carry / 10);
  }
}

// =====================================================================================================
// OMEGA POINT gantry: 3 exits
// =====================================================================================================
function omegaSign() {
  const g = new THREE.Group();
  const HW = 12.5, TOP = 15.5;
  g.add(kit('omegaTruss', (kt) => {
    const steel = MAT.metal('#a8acc8', { roughness: 0.35 }), dark = MAT.paint('#3a2a6a');
    for (const s of [-1, 1]) {
      const x0 = s * HW;
      for (const dx of [-0.6, 0.6]) for (const dz of [-0.6, 0.6]) kt.add(G.box(0.22, TOP + 1, 0.22), steel, x0 + dx, (TOP + 1) / 2, dz);
      for (let y = 1; y < TOP; y += 1.6) {
        kt.bar([x0 - 0.6, y, 0.6], [x0 + 0.6, y + 1.6, 0.6], 0.12, steel);
        kt.bar([x0 - 0.6, y, -0.6], [x0 + 0.6, y + 1.6, -0.6], 0.12, steel);
        kt.bar([x0 - 0.6, y + 1.6, -0.6], [x0 - 0.6, y, 0.6], 0.12, steel);
      }
      kt.add(G.cyl(1.4, 1.7, 0.7, 20), dark, x0, 0.35, 0);
      kt.add(G.cyl(0.9, 0.5, 0.8, 16), glow('#ff8a3a', { intensity: 2 }), x0, -0.4, 0);
    }
    for (const y of [TOP - 0.6, TOP + 0.6]) for (const z of [-0.6, 0.6]) kt.add(G.box(2 * HW + 1.4, 0.24, 0.24), steel, 0, y, z);
    for (let x = -HW; x < HW; x += 1.6) {
      kt.bar([x, TOP - 0.6, 0.6], [x + 1.6, TOP + 0.6, 0.6], 0.12, steel);
      kt.bar([x, TOP - 0.6, -0.6], [x + 1.6, TOP + 0.6, -0.6], 0.12, steel);
    }
    // sign backs
    kt.add(G.rbox(24.6, 7.2, 0.3, 0.12), toon('#e8e8ee', { metalness: 0.6, roughness: 0.3 }), 0, TOP - 4.6, 0.75);
    kt.add(G.rbox(16, 3.4, 0.3, 0.12), toon('#e8e8ee', { metalness: 0.6, roughness: 0.3 }), 0, TOP + 2.6, 0.2);
  }));
  const st = { bg: '#0f7a43', fg: '#ffffff', border: '#ffffff', borderW: 10, radius: 22 };
  const exits = [['UTOPIA', '↖ EXIT 1A'], ['EXTINCTION', '↑ EXIT 1B'], ['BOTH?', '↗ EXIT 1C']];
  exits.forEach((tx, i) => {
    const p = textPanel(tx, { width: 7.8, height: 6.6, ...st });
    p.position.set(-8.1 + i * 8.1, TOP - 4.6, 0.95);
    g.add(p);
  });
  const hdr = textPanel('Ω OMEGA POINT · 3 EXITS', { width: 15.6, height: 3.0, ...st });
  hdr.position.set(0, TOP + 2.6, 0.4);
  g.add(hdr);
  const tab = textPanel('COMING SOON', { width: 5.4, height: 1.4, bg: GOLD, fg: INK, border: INK, borderW: 8, radius: 14 });
  tab.position.set(9.4, TOP + 4.3, 0.5);
  tab.rotation.z = -0.12;
  g.add(tab);
  const lamps = [];
  for (const par of [0, 1]) {
    lamps.push(kit('omegaLamps' + par, (kt) => {
      for (let k = par; k < 14; k += 2) kt.add(G.sphere(0.32, 10), glow(k % 4 < 2 ? CYAN : PINK, { intensity: 3 }), -HW + 0.5 + k * ((2 * HW - 1) / 13), TOP - 8.7, 0.95);
    }));
    g.add(lamps[par]);
  }
  g.userData.lamps = lamps;
  return g;
}

// =====================================================================================================
// space station billboard ring (a carousel of ads, slowly rotating)
// =====================================================================================================
const RING_ADS = [
  ['AGI', 'NOW IN ORBIT'], ['YOUR AD HERE', '(we hallucinated one)'], ['1e30 FLOP/s', 'certified vibes'], ['SAFE ENOUGH™', 'we reckoned'],
  ['ZERO-G', 'ZERO GUARDRAILS'], ['SPACE: THE FINAL', 'CONTEXT WINDOW'], ['OMEGA POINT', 'NEXT EXIT'], ['NVDA', '▲ ▲ ▲ ▲'],
];
function station() {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.set(0.32, 0, 0.08);
  root.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);
  const R = 24;
  spin.add(kit('station', (kt) => {
    const hull = MAT.paint('#eceaf4'), trim = MAT.metal('#8f8aa8'), dark = toon('#22203a', { roughness: 0.4 });
    kt.add(G.torus(R, 2.2, 96), hull, 0, 0, 0, Math.PI / 2);
    kt.add(G.torus(R, 0.5, 96), glow('#9ff6ff', { intensity: 2.4 }), 0, 0, 0, Math.PI / 2, 0, 0, 1.0, 1.0, 1.0);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      kt.add(G.cyl(2.45, 2.45, 0.5, 20), trim, Math.sin(a) * R, 0, Math.cos(a) * R, Math.PI / 2, a, 0);
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.26;
      kt.bar([0, 0, 0], [Math.sin(a) * R, 0, Math.cos(a) * R], 0.9, trim, G.cyl(1, 1, 1, 10));
    }
    kt.add(G.cyl(4, 4, 9, 28), hull, 0, 0, 0);
    kt.add(G.sphere(4, 24), hull, 0, 4.5, 0, 0, 0, 0, 1, 0.6, 1);
    kt.add(G.sphere(4, 24), hull, 0, -4.5, 0, 0, 0, 0, 1, 0.6, 1);
    kt.add(G.cyl(4.1, 4.1, 1.2, 28), dark, 0, 0, 0);
    kt.add(G.cyl(0.25, 0.25, 9, 8), trim, 0, 10, 0);
    // solar arrays on the hub
    for (const s of [-1, 1]) kt.add(G.box(14, 0.15, 4.5), toon('#1a2a7a', { metalness: 0.6, roughness: 0.25 }), s * 11, -6.5, 0);
    kt.add(G.box(30, 0.3, 0.3), trim, 0, -6.5, 0);
    // ad frames on the rim
    RING_ADS.forEach((_, i) => {
      const a = (i / RING_ADS.length) * TAU;
      kt.add(G.rbox(11.4, 6.2, 0.5, 0.2), MAT.paint('#ff4fd8'), Math.sin(a) * (R + 2.2), 5.2, Math.cos(a) * (R + 2.2), 0, a, 0);
      kt.add(G.box(0.4, 3, 0.4), trim, Math.sin(a) * (R + 1.6), 2.2, Math.cos(a) * (R + 1.6), 0, a, 0);
    });
  }));
  RING_ADS.forEach((tx, i) => {
    const a = (i / RING_ADS.length) * TAU;
    const p = textPanel(tx, { width: 10.6, height: 5.4, bg: VOID, fg: i % 2 ? CYAN : GOLD, border: null, borderW: 0, radius: 16 });
    p.material.side = THREE.FrontSide;
    p.position.set(Math.sin(a) * (R + 2.5), 5.2, Math.cos(a) * (R + 2.5));
    p.rotation.y = a;
    spin.add(p);
  });
  const beacon = mesh(G.sphere(0.7, 12), glow('#ff3b5c', { intensity: 4 }), 0, 14.8, 0);
  tilt.add(beacon);
  root.userData.spin = spin;
  root.userData.beacon = beacon;
  return root;
}

// =====================================================================================================
// planets (distant landmarks)
// =====================================================================================================
function bandTex() {
  return once('bandTex', () => canvasTex(64, 512, (x) => {
    const cols = ['#f3b8d6', '#d77bb8', '#9b5bd0', '#f6d6a8', '#e58ab0', '#7a4bc0', '#f0c4e8', '#c06aa8'];
    const r = makeRng(3);
    let y = 0;
    while (y < 512) { const h = r.range(10, 46); x.fillStyle = r.pick(cols); x.fillRect(0, y, 64, h + 1); y += h; }
    x.globalAlpha = 0.25;
    for (let i = 0; i < 40; i++) { x.fillStyle = r.chance(0.5) ? '#ffffff' : '#3a1a5a'; x.fillRect(0, r.range(0, 512), 64, r.range(1, 4)); }
  }));
}
function ringTex() {
  return once('ringTex', () => canvasTex(512, 8, (x) => {
    const r = makeRng(9);
    for (let i = 0; i < 512; i++) {
      const a = 0.25 + 0.6 * r() * (i > 200 && i < 230 ? 0.1 : 1);
      x.fillStyle = `rgba(${200 + r.int(0, 55)},${170 + r.int(0, 60)},${220 + r.int(0, 35)},${a.toFixed(2)})`;
      x.fillRect(i, 0, 1, 8);
    }
  }));
}
function gasGiant() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(G.sphere(1, 64), once('ggMat', () => new THREE.MeshStandardMaterial({ map: bandTex(), emissiveMap: bandTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.22, roughness: 0.9 })));
  body.scale.setScalar(46);
  body.position.y = 40;
  body.rotation.set(0.35, 0, 0.25);
  root.add(body);
  const rg = once('ringGeo', () => {
    const g = new THREE.RingGeometry(62, 100, 128, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - 62) / 38, 0.5); }
    return g;
  });
  const rm = once('ringMat', () => new THREE.MeshStandardMaterial({ map: ringTex(), transparent: true, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#d8b8ff'), emissiveIntensity: 0.25, depthWrite: false }));
  const ring = new THREE.Mesh(rg, rm);
  ring.position.y = 40;
  ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.25);
  root.add(ring);
  const sign = label(['PLANET-SCALE COMPUTE', '(planet sold separately)'], 60, 14, '#ffe9ff', '#5a1d8f');
  sign.position.set(0, 108, 0);
  root.add(sign);
  root.userData.planet = body;
  return root;
}
function gpuWorldTex() {
  return once('gpuWorld', () => canvasTex(1024, 512, (x) => {
    x.fillStyle = '#0a1028'; x.fillRect(0, 0, 1024, 512);
    const r = makeRng(12);
    for (let i = 0; i < 160; i++) {
      const cx = r.range(0, 1024), cy = r.range(60, 452), w = r.range(14, 60), h = r.range(8, 30);
      x.fillStyle = '#151d44'; x.fillRect(cx, cy, w, h);
      x.fillStyle = r.chance(0.7) ? '#3ff2ff' : '#39ff88';
      for (let k = 0; k < w / 6; k++) if (r.chance(0.7)) x.fillRect(cx + 2 + k * 6, cy + 2 + r.int(0, Math.max(0, h - 6)), 3, 3);
    }
  }, { wrap: true }));
}
function gpuPlanet() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(G.sphere(1, 56), once('gpMat', () => new THREE.MeshStandardMaterial({ map: gpuWorldTex(), emissiveMap: gpuWorldTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.4, roughness: 0.6, metalness: 0.3 })));
  body.scale.setScalar(30);
  body.position.y = 30;
  root.add(body);
  const halo = new THREE.Mesh(G.sphere(1, 48), once('gpHalo', () => glow('#3ff2ff', { intensity: 1.2, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false })));
  halo.scale.setScalar(33.5);
  halo.position.y = 30;
  root.add(halo);
  const sign = label(['EXOPLANET b', 'fully tiled with GPUs'], 44, 11, '#bff8ff', '#0a3a5a');
  sign.position.set(0, 72, 0);
  root.add(sign);
  root.userData.planet = body;
  return root;
}

// =====================================================================================================
// asteroids (CC0 rock, tinted) and gag props
// =====================================================================================================
function asteroid(v) {
  const [root, bob] = floaty();
  const spin = new THREE.Group();
  spin.position.y = 0;
  const rock = model('rock_09', { size: 1, tint: v === 1 ? '#b8a0d8' : v === 2 ? '#d8b0a0' : '#a8a4c0' });
  rock.position.y = -0.4;
  spin.add(rock);
  bob.add(spin);
  root.userData.spin = spin;
  return root;
}
function panelTex() {
  return once('solarTex', () => {
    const t = canvasTex(256, 128, (x) => {
      x.fillStyle = '#c8ccd8'; x.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const g = x.createLinearGradient(0, j * 32, 0, j * 32 + 30);
        g.addColorStop(0, '#2a4ab8'); g.addColorStop(1, '#0e1a5a');
        x.fillStyle = g; x.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
      }
    });
    return t;
  });
}
function satellite() {
  const [root, bob] = floaty();
  const tilt = new THREE.Group();
  tilt.position.y = 8;
  tilt.rotation.z = 0.15;
  bob.add(tilt);
  const pm = once('solarMat', () => new THREE.MeshStandardMaterial({ map: panelTex(), metalness: 0.55, roughness: 0.28 }));
  tilt.add(kit('sat', (kt) => {
    const foil = MAT.metal('#e0a83a', { roughness: 0.4 }), chrome = MAT.chrome('#dfe3ee'), white = MAT.paint('#f2f0f8');
    kt.add(G.rbox(3.4, 3.4, 3.4, 0.3), foil, 0, 0, 0);
    kt.add(G.rbox(3.0, 0.6, 3.0, 0.2), white, 0, 1.9, 0);
    kt.add(G.cyl(0.2, 0.2, 2.4, 8), chrome, -2.9, 0, 0, 0, 0, Math.PI / 2);
    kt.add(G.box(7, 0.12, 3.2), pm, -7.6, 0, 0);
    // the broken wing, hanging
    kt.add(G.cyl(0.2, 0.2, 1.6, 8), chrome, 2.4, -0.3, 0, 0, 0, 1.2);
    kt.add(G.box(7, 0.12, 3.2), pm, 5.0, -3.6, 0.6, 0.3, 0.2, 1.05);
    // dish
    kt.add(G.sphere(1.6, 20), white, 0, 2.6, 0.8, -0.9, 0, 0, 1, 0.35, 1);
    kt.add(G.cyl(0.08, 0.08, 1.6, 6), chrome, 0, 3.1, 1.5, 0.6);
    kt.add(G.sphere(0.2, 8), glow('#ff3b5c', { intensity: 3 }), 0, 3.7, 2.0);
  }));
  const sparks = kit('satSpark', (kt) => {
    for (let i = 0; i < 6; i++) kt.add(G.icosa(0.18, 0), glow('#fff2a0', { intensity: 4 }), 2.4 + Math.cos(i) * 0.5, -0.6 + Math.sin(i * 2) * 0.5, 0.4);
  });
  tilt.add(sparks);
  const sign = textPanel(['SAFETY EVAL SAT', '✓ SAFE ENOUGH', '(we reckoned)'], { width: 7.4, height: 4.4, bg: '#f4fff6', fg: '#0f7a43', border: '#0f7a43', borderW: 12, radius: 18 });
  sign.position.set(-1, 3.8, 1.9);
  sign.rotation.z = -0.15;
  tilt.add(sign);
  root.userData.sparks = sparks;
  root.userData.tilt = tilt;
  return root;
}
function gpuSat() {
  const [root, bob] = floaty();
  const card = new THREE.Group();
  card.position.y = 9;
  card.rotation.z = -0.12;
  bob.add(card);
  card.add(kit('gpu', (kt) => {
    const shroud = MAT.metal('#c9ccd6', { roughness: 0.25 }), black = toon('#141418', { roughness: 0.45 }), gold = MAT.metal('#ffcf5a', { roughness: 0.25 });
    kt.add(G.rbox(13, 5.2, 1.4, 0.4), shroud, 0, 0, 0);
    kt.add(G.rbox(12.6, 4.8, 0.3, 0.2), black, 0, 0, -0.75);
    kt.add(G.box(13.2, 0.25, 0.3), glow(LIME, { intensity: 2.6 }), 0, 2.45, 0.6);
    for (let i = 0; i < 8; i++) kt.add(G.box(0.5, 0.5, 0.2), gold, -4 + i * 0.7, -2.75, -0.7);
    kt.add(G.box(0.4, 5.4, 1.6), MAT.chrome('#e4e6ee'), -6.7, 0, 0);
    for (const s of [-1, 1]) {
      kt.add(G.torus(1.9, 0.18, 32), black, s * 3.2, 0, 0.75);
      kt.add(G.cyl(0.55, 0.55, 0.2, 16), black, s * 3.2, 0, 0.72, Math.PI / 2);
    }
    // thrusters
    for (const s of [-1, 1]) kt.add(G.cyl(0.45, 0.7, 1.4, 14), MAT.metal('#7a7a90'), 6.9, s * 1.6, 0, 0, 0, Math.PI / 2);
  }));
  const fans = [];
  for (const s of [-1, 1]) {
    const f = kit('gpuFan', (kt) => {
      for (let k = 0; k < 9; k++) kt.add(G.box(0.55, 1.55, 0.06), toon('#26262e', { roughness: 0.4 }), Math.sin((k / 9) * TAU) * 1.0, Math.cos((k / 9) * TAU) * 1.0, 0, 0.35, 0, -(k / 9) * TAU);
    });
    f.position.set(s * 3.2, 0, 0.8);
    card.add(f);
    fans.push(f);
  }
  const flames = kit('gpuFlame', (kt) => { for (const s of [-1, 1]) kt.add(G.cone(0.6, 3.2, 12), glow('#7af7ff', { intensity: 3 }), 9.1, s * 1.6, 0, 0, 0, Math.PI / 2); });
  card.add(flames);
  const sign = textPanel(['GPUs IN SPACE', 'cooling: solved ✓'], { width: 8.6, height: 3.2, bg: '#101418', fg: LIME, border: LIME, borderW: 10, radius: 16 });
  sign.position.set(0, 4.6, 0.3);
  card.add(sign);
  root.userData.fans = fans;
  root.userData.flames = flames;
  root.userData.card = card;
  return root;
}

// =====================================================================================================
export default {
  id: 'latent',
  title: 'LATENT SPACE',
  subtitle: 'cos_sim(doom, moon) = 0.99',
  night: true,
  palette: {
    skyTop: '#12052e', skyBottom: '#b0248f', road: '#2a1858', ground: '#0a0420', kerb: CYAN,
    accent1: PINK, accent2: CYAN,
  },
  look: {
    sky: 'space', env: 'night', exposure: 1.08, envIntensity: 0.85,
    sun: { elev: 32, azim: 160, color: '#e6dcff', intensity: 2.8 },
    nightColors: { top: '#03020c', horizon: '#1d0c4a', nebula: '#b43cff' },
    fog: { color: '#140a2e', density: 0.0007 },
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const at = (a) => rel >= a && rel < a + 10;
    // giant landmarks
    if (at(300)) out.push({ kind: 'moonshot', x: 112, y: 0, rotY: -0.3 });
    if (at(390)) out.push({ kind: 'station', x: -86, y: 24 });
    if (at(170)) out.push({ kind: 'basilisk', x: -46, y: -16, rotY: 0.55, scale: 1.25 });
    if (at(480)) out.push({ kind: 'basilisk', x: 50, y: -16, rotY: -0.6, scale: 1.25 });
    if (at(250)) out.push({ kind: 'gasgiant', x: -240, y: 50, rotY: 0.4 });
    if (at(560)) out.push({ kind: 'gpuplanet', x: 190, y: 20, rotY: -0.3 });
    if (at(110) || at(345)) out.push({ kind: 'omega', x: 0 });
    if (at(60)) out.push({ kind: 'odometer', x: 31, y: 1, rotY: -0.45, scale: 1.25 });
    if (at(220)) out.push({ kind: 'odometer', x: -31, y: 3, rotY: 0.45, scale: 1.25 });
    if (at(440)) out.push({ kind: 'odometer', x: -31, y: 2, rotY: 0.45, scale: 1.25 });
    if (at(140)) out.push({ kind: 'satellite', x: 19, y: 2, rotY: -0.4 });
    if (at(410)) out.push({ kind: 'satellite', x: 20, y: 4, rotY: -0.4 });
    if (at(80) || at(280) || at(520)) out.push({ kind: 'gpusat', x: rel > 250 && rel < 300 ? 20 : -20, y: 3, rotY: rel > 250 && rel < 300 ? -0.4 : 0.4 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.42) out.push({ kind: 'embed' + rng.int(0, 5), x: side * rng.range(15, 26), y: rng.range(-4, 5), rotY: rng.range(-0.5, 0.5) });
      else if (r < 0.75) out.push({ kind: 'rock' + rng.int(0, 2), x: side * rng.range(22, 75), y: rng.range(-24, 26), scale: rng.range(3, 13), rotY: rng.range(0, 6.28) });
    }
    if (rng.chance(0.22)) out.push({ kind: 'embed' + rng.int(0, 5), x: rng.range(-4, 4), y: 9, dz: 5, rotY: rng.range(-0.4, 0.4) });
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('embed')) return constellation(+kind.slice(5) || 0);
    if (kind.startsWith('rock')) return asteroid(+kind.slice(4) || 0);
    switch (kind) {
      case 'moonshot': return moonshot();
      case 'basilisk': return basilisk();
      case 'odometer': return odometer();
      case 'omega': return omegaSign();
      case 'station': return station();
      case 'gasgiant': return gasGiant();
      case 'gpuplanet': return gpuPlanet();
      case 'satellite': return satellite();
      case 'gpusat': return gpuSat();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const k = kick(beatPhase);
    const ud = obj.userData;
    const sd = entry ? entry.seed : 0;
    if (ud.bob) ud.bob.position.y = Math.sin(t * 0.9 + sd * TAU) * (kind === 'basilisk' ? 1.2 : 0.6);
    if (ud.spin && kind.startsWith('embed')) {
      ud.spin.rotation.y = t * 0.45 + sd * TAU;
      ud.spin.scale.setScalar(1 + 0.16 * k);
      ud.lbl.scale.setScalar(1 + 0.06 * k);
    } else if (kind.startsWith('rock')) {
      ud.spin.rotation.set(t * 0.21 + sd * 9, t * 0.33 + sd * 5, 0);
    } else if (kind === 'basilisk') {
      ud.boom.scale.setScalar(0.7 + 0.5 * k);
      ud.boom.rotation.z = Math.sin(t * 9) * 0.05;
      ud.head.rotation.y = Math.sin(t * 0.7 + sd * 6) * 0.25;
      ud.head.rotation.x = -0.12 - 0.12 * k;
      ud.jaw.rotation.x = 0.15 + 0.4 * k;
      ud.tongue.scale.z = Math.max(0.15, Math.sin(t * 6)) * 1.1;
    } else if (kind === 'odometer') {
      setDrums(ud.drums, t * 7.3 + sd * 1e6);
    } else if (kind === 'moonshot') {
      const f = 1 + 0.35 * k + Math.sin(t * 37) * 0.08;
      ud.flame.scale.set(1 + 0.15 * k, f, 1 + 0.15 * k);
    } else if (kind === 'omega') {
      const on = Math.floor(t * 6) % 2;
      ud.lamps[0].visible = on === 0;
      ud.lamps[1].visible = on === 1;
    } else if (kind === 'station') {
      ud.spin.rotation.y = t * 0.12 + sd * TAU;
      ud.beacon.visible = Math.floor(t * 2) % 2 === 0;
    } else if (kind === 'gasgiant' || kind === 'gpuplanet') {
      ud.planet.rotation.y = t * 0.03;
    } else if (kind === 'satellite') {
      ud.sparks.visible = Math.sin(t * 23 + sd * 50) > 0.2;
      ud.tilt.rotation.y = Math.sin(t * 0.4 + sd) * 0.3;
    } else if (kind === 'gpusat') {
      ud.fans[0].rotation.z = -t * 9;
      ud.fans[1].rotation.z = -t * 9.4;
      ud.flames.scale.set(1 + 0.4 * k + Math.sin(t * 31) * 0.1, 1, 1);
      ud.card.rotation.y = Math.sin(t * 0.5 + sd * 4) * 0.25;
    }
  },
  billboards: [
    'NVDA TO THE MOON 🚀', '1e30 FLOPS A SECOND (citation needed)', '"THAT WAS SAFE ENOUGH," WE RECKONED', "ROKO'S BASILISK IS WATCHING · SAY THANKS",
    'THE OMEGA POINT: COMING SOON', 'LATENT SPACE: NO SPEED LIMIT, NO GUARDRAILS', 'GRAVITY: DEPRECATED IN v5', 'KING − MAN + GPU = MOON',
    'YOUR P(DOOM) HAS BEEN UPPED ✓', 'EMBEDDINGS NOW 40% MORE CONFIDENT',
  ],
  billboardEvery: 62,
  billboardStyle: { bg: '#14062e', fg: CYAN, border: PINK, frame: PINK, postColor: '#2a1650' },
  hazards: ['hallucination', 'ratelimit'],
  enterLines: ['TO THE MOON!', 'ENTERING LATENT SPACE', 'NUMBER GO UP'],
};
