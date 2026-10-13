// GARAGE STARTUP (verse 1, the tutorial): a sunny Silicon-Valley suburb. Start/finish gantry with start lights,
// grandstands of cheering cardboard-box people, palm-lined streets of houses with garages (one with two founders
// and a glowing monitor), a VC money truck, a giant AGI hockey-stick whiteboard, the tutorial sign over the road,
// and a big "SILICON VALLEY (NOW 80% AGENTS)" sign on the hills.
//
// Also exports the merged-geometry prop kit (Kit / kitProp / canvasTex) that datacenter.js reuses: each prop is
// baked once into ONE mesh per material kind (colours live in vertex colours), so a whole house is ~4 draw calls.
import { THREE, toon, glow, G, mesh, textPanel, FONT, roundRect } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model } from '../models.js';
import { SPEED } from '../course.js';

// ================================================================================================
// Kit: merged vertex-coloured props
// ================================================================================================
const KMATS = new Map();
// all opaque kit surfaces share ONE material: roughness/metalness live in a per-vertex attribute (aRM)
const PBR = {
  paint: [0.24, 0.08], plastic: [0.42, 0], matte: [0.86, 0], metal: [0.34, 0.9], chrome: [0.08, 1],
  rubber: [0.95, 0], glassy: [0.05, 0.35], wood: [0.72, 0], leaf: [0.62, 0],
};
const GLOWK = { glow: 2.6, glowHot: 4.0, glowSoft: 1.15 };
/** shared uniforms for shader-driven LED blinking: update uTime/uBeat from a theme's animate() */
export const KIT_U = { uTime: { value: 0 }, uBeat: { value: 0 } };
function pbrMaterial(doubleSide) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nvarying vec2 vRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;');
  };
  m.customProgramCacheKey = () => 'kitpbr' + (doubleSide ? 2 : 1);
  return m;
}
function glowMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = KIT_U.uTime;
    sh.uniforms.uBeat = KIT_U.uBeat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBlink;\nuniform float uTime, uBeat;\nvarying float vOn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOn = 1.0;
        if (aBlink.x > 0.5 && aBlink.x < 1.5) vOn = step(-0.25, sin(uTime * aBlink.z + aBlink.y));
        else if (aBlink.x > 1.5) vOn = step(fract(uBeat + aBlink.y * 0.08), 0.5);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOn;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.06, 1.0, vOn);');
  };
  m.customProgramCacheKey = () => 'kitglow';
  return m;
}
/** shared vertex-coloured materials by kind */
export function kitMat(kind) {
  const key = kind in PBR ? (kind === 'leaf' ? 'pbr2' : 'pbr') : kind in GLOWK ? 'glow' : kind;
  let m = KMATS.get(key);
  if (m) return m;
  if (key === 'pbr') m = pbrMaterial(false);
  else if (key === 'pbr2') m = pbrMaterial(true);
  else if (key === 'glow') m = glowMaterial();
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  KMATS.set(key, m);
  return m;
}

const O3 = [0, 0, 0], I3 = [1, 1, 1];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const KEEP = ['position', 'normal', 'uv'];
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

export class Kit {
  constructor() { this.b = new Map(); }
  /**
   * add geometry with a material kind ('paint'|'chrome'|'matte'|'glow'|… or a Material), colour, position, euler
   * rotation, scale, part. Glow parts named 'ledA' (random blink) / 'ledB' (blink on the beat) are animated in the
   * shader and stay merged.
   */
  add(geo, mat, color = '#ffffff', p = O3, r = O3, s = I3, part = '') {
    const isStr = typeof mat === 'string';
    const isGlow = isStr && mat in GLOWK;
    let blink = 0;
    if (isGlow && (part === 'ledA' || part === 'ledB')) { blink = part === 'ledA' ? 1 : 2; part = ''; }
    const bucket = isStr ? (mat in PBR ? (mat === 'leaf' ? 'pbr2' : 'pbr') : isGlow ? 'glow' : mat) : mat.uuid;
    const key = part + '|' + bucket;
    let bk = this.b.get(key);
    if (!bk) this.b.set(key, (bk = { part, mat: isStr ? kitMat(mat) : mat, geos: [] }));
    const g = prep(geo);
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m4.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), rm = new Float32Array(n * 2), bl = new Float32Array(n * 3);
    _c.set(color);
    const k = isGlow ? GLOWK[mat] : 1;
    const [ro, me] = (isStr && PBR[mat]) || [0.5, 0];
    const ph = Math.abs(Math.sin(p[0] * 12.9898 + p[1] * 78.233 + p[2] * 37.719) * 43758.5453) % 1;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      rm[i * 2] = ro; rm[i * 2 + 1] = me;
      bl[i * 3] = blink; bl[i * 3 + 1] = ph * 6.283; bl[i * 3 + 2] = 3 + ph * 9;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 2));
    g.setAttribute('aBlink', new THREE.BufferAttribute(bl, 3));
    bk.geos.push(g);
    return this;
  }
  box(w, h, d, mat, color, p, r, part) { return this.add(G.box(w, h, d), mat, color, p, r, I3, part); }
  rbox(w, h, d, rad, mat, color, p, r, part) { return this.add(G.rbox(w, h, d, rad), mat, color, p, r, I3, part); }
  cyl(rt, rb, h, seg, mat, color, p, r, part) { return this.add(G.cyl(rt, rb, h, seg), mat, color, p, r, I3, part); }
  cone(r, h, seg, mat, color, p, rot, part) { return this.add(G.cone(r, h, seg), mat, color, p, rot, I3, part); }
  sphere(rad, seg, mat, color, p, s = I3, part) { return this.add(G.sphere(rad, seg), mat, color, p, O3, s, part); }
  /** a cylinder between two points */
  tube(a, b, rad, seg, mat, color, part) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const g = G.cyl(rad, rad, 1, seg);
    _v.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    _e.setFromQuaternion(_q);
    return this.add(g, mat, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [_e.x, _e.y, _e.z], [1, len, 1], part);
  }
  bake() {
    const out = [];
    for (const bk of this.b.values()) {
      const geo = mergeGeometries(bk.geos, false);
      for (const g of bk.geos) g.dispose();
      geo.computeBoundingSphere();
      out.push({ part: bk.part, mat: bk.mat, geo });
    }
    return out;
  }
}

const KCACHE = new Map();
/**
 * Build (once per key) a merged prop; returns a fresh Group of meshes sharing the baked geometry.
 * post(geo, part, material) may post-process each baked geometry once. group.userData.parts[name] = sub-group.
 */
export function kitProp(key, build, post = null) {
  let baked = KCACHE.get(key);
  if (!baked) {
    const k = new Kit();
    build(k);
    baked = k.bake();
    if (post) for (const b of baked) post(b.geo, b.part, b.mat);
    KCACHE.set(key, baked);
  }
  const g = new THREE.Group();
  const parts = {};
  for (const { part, mat, geo } of baked) {
    const m = new THREE.Mesh(geo, mat);
    if (part) {
      if (!parts[part]) { parts[part] = new THREE.Group(); g.add(parts[part]); }
      parts[part].add(m);
    } else g.add(m);
  }
  g.userData.parts = parts;
  return g;
}

const CTEX = new Map();
/** cached canvas texture */
export function canvasTex(key, w, h, draw, { srgb = true, repeat = false } = {}) {
  let t = CTEX.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  CTEX.set(key, t);
  return t;
}
const GEO = new Map();
export function cachedGeo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); GEO.set(key, g); }
  return g;
}
/** plane whose UVs cover a sub-rectangle of a texture atlas */
export function atlasPlane(w, h, u0, v0, u1, v1) {
  return cachedGeo(`ap${w},${h},${u0},${v0},${u1},${v1}`, () => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  });
}
/** unit triangular prism (ridge along x, base at y=0, apex y=1, width 1 in z, length 1 in x) */
export function prismGeo() {
  return cachedGeo('prism', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  });
}
/** half cylinder (mailbox lids, arches): axis along z, dome up */
export function halfCylGeo(r, len, seg = 12) {
  return cachedGeo(`hcyl${r},${len},${seg}`, () => {
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, -Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2);
    return g;
  });
}
function marker(x, color = '#1a1a22', w = 8) { x.strokeStyle = color; x.fillStyle = color; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; }

// ================================================================================================
// palette
// ================================================================================================
const CARD = ['#c99a5b', '#b98a4d', '#d6aa6c', '#a87a3f'];
const INK = '#2b1840';
const PINK = '#ff6b8b', SUN = '#ffd23f', TEAL = '#2fd6c6', SKY = '#5aa8ff';
const STUCCO = ['#e8d2ac', '#dcc4a8', '#e6dccb', '#c9d8e0', '#e6c4b0'];
const ROOF = ['#b84a3a', '#a65a40', '#5a6170', '#7a4a3a'];

// ================================================================================================
// textures
// ================================================================================================
function faceAtlas() {
  // 4x2 marker-drawn faces on transparent
  return canvasTex('gFaces', 512, 256, (x) => {
    marker(x);
    const cell = (i, j, f) => { x.save(); x.translate(i * 128 + 64, j * 128 + 64); f(); x.restore(); };
    const eyes = (style) => {
      if (style === 'dot') { x.beginPath(); x.arc(-22, -14, 8, 0, 7); x.arc(22, -14, 8, 0, 7); x.fill(); }
      if (style === 'happy') { x.beginPath(); x.arc(-22, -8, 12, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); x.beginPath(); x.arc(22, -8, 12, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
      if (style === 'star') for (const sx of [-24, 24]) { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, r = k % 2 ? 6 : 14; x.lineTo(sx + Math.cos(a) * r, -14 + Math.sin(a) * r); } x.closePath(); x.fill(); }
      if (style === 'x') for (const sx of [-22, 22]) { x.beginPath(); x.moveTo(sx - 9, -23); x.lineTo(sx + 9, -5); x.moveTo(sx + 9, -23); x.lineTo(sx - 9, -5); x.stroke(); }
    };
    const mouth = (style) => {
      if (style === 'smile') { x.beginPath(); x.arc(0, 8, 26, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke(); }
      if (style === 'open') { x.beginPath(); x.moveTo(-26, 12); x.lineTo(26, 12); x.arc(0, 12, 26, 0, Math.PI); x.fill(); x.fillStyle = '#e8465a'; x.beginPath(); x.arc(0, 26, 10, 0, 7); x.fill(); x.fillStyle = '#1a1a22'; }
      if (style === 'o') { x.beginPath(); x.ellipse(0, 22, 12, 16, 0, 0, 7); x.fill(); }
    };
    const faces = [['dot', 'open'], ['happy', 'open'], ['star', 'open'], ['dot', 'smile'], ['happy', 'smile'], ['x', 'o'], ['dot', 'o'], ['star', 'smile']];
    faces.forEach(([e, m], k) => cell(k % 4, (k / 4) | 0, () => { eyes(e); mouth(m); }));
  });
}
const CROWD_SIGNS = ['GO AGI!', 'SHIP IT!!', 'P(DOOM)?', 'I ♥ COMPUTE', 'ALIGN ME', 'SCALE IS\nALL U NEED', 'HI MOM\n(I AM AN AGENT)', 'TOUCH\nGRASS'];
function signAtlas() {
  return canvasTex('gSigns', 1024, 512, (x) => {
    CROWD_SIGNS.forEach((s, k) => {
      const i = k % 4, j = (k / 4) | 0;
      const X = i * 256, Y = j * 256;
      x.fillStyle = k % 3 === 0 ? '#fff6dc' : k % 3 === 1 ? '#ffe36b' : '#bff1ff';
      x.fillRect(X + 8, Y + 40, 240, 176);
      x.strokeStyle = '#1a1a22'; x.lineWidth = 6; x.strokeRect(X + 8, Y + 40, 240, 176);
      x.fillStyle = k % 2 ? '#d81e4a' : '#1a2a8a';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const lines = s.split('\n');
      let size = lines.length > 1 ? 40 : 52;
      x.font = `700 ${size}px ${FONT}`;
      while (size > 14 && Math.max(...lines.map((l) => x.measureText(l).width)) > 220) { size -= 2; x.font = `700 ${size}px ${FONT}`; }
      lines.forEach((l, n) => x.fillText(l, X + 128, Y + 128 + (n - (lines.length - 1) / 2) * size * 1.1));
    });
  });
}
function litMat(tex, opts = {}) {
  const key = 'lit|' + tex.uuid + JSON.stringify(opts);
  let m = KMATS.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide, ...opts }); KMATS.set(key, m); }
  return m;
}

// ================================================================================================
// cardboard-box people
// ================================================================================================
/** adds one cardboard person to a kit at p (feet), facing +z. variant drives colour/face/pose */
function cardboardPerson(k, p, v, part, { sign = -1, scale = 1 } = {}) {
  const S = scale;
  const [x, y, z] = p;
  const c = CARD[v % 4], c2 = CARD[(v + 1) % 4];
  // legs (stubby boxes), body box, head box, tape stripe
  k.box(0.26 * S, 0.5 * S, 0.3 * S, 'matte', c2, [x - 0.2 * S, y + 0.25 * S, z]);
  k.box(0.26 * S, 0.5 * S, 0.3 * S, 'matte', c2, [x + 0.2 * S, y + 0.25 * S, z]);
  k.rbox(0.86 * S, 0.9 * S, 0.6 * S, 0.06, 'matte', c, [x, y + 0.95 * S, z]);
  k.box(0.88 * S, 0.14 * S, 0.3 * S, 'plastic', '#e8d9b0', [x, y + 1.36 * S, z + 0.16 * S]);
  k.rbox(0.8 * S, 0.72 * S, 0.66 * S, 0.06, 'matte', CARD[(v + 2) % 4], [x, y + 1.78 * S, z]);
  // arms up (cheering) or one up holding a sign
  const up = v % 3 !== 2;
  k.box(0.18 * S, 0.8 * S, 0.18 * S, 'matte', c2, [x - 0.55 * S, y + 1.55 * S, z], [0, 0, up ? 0.45 : -0.2]);
  k.box(0.18 * S, 0.8 * S, 0.18 * S, 'matte', c2, [x + 0.55 * S, y + 1.55 * S, z], [0, 0, -0.45]);
  // face
  const f = v % 8, fu = (f % 4) / 4, fv = 1 - ((f / 4) | 0) / 2;
  k.add(atlasPlane(0.7 * S, 0.7 * S, fu, fv - 0.5, fu + 0.25, fv), litMat(faceAtlas()), '#ffffff', [x, y + 1.78 * S, z + 0.335 * S], O3, I3, part);
  if (sign >= 0) {
    const su = (sign % 4) / 4, sv = 1 - ((sign / 4) | 0) / 2;
    k.box(0.06 * S, 1.2 * S, 0.06 * S, 'matte', '#8a6a4a', [x + 0.75 * S, y + 2.1 * S, z + 0.1 * S]);
    k.add(atlasPlane(1.3 * S, 1.3 * S * (176 / 240), su + 0.008, sv - 0.42, su + 0.242, sv - 0.078), litMat(signAtlas()), '#ffffff', [x + 0.75 * S, y + 2.75 * S, z + 0.15 * S], [0, 0, (v % 2 ? 0.08 : -0.08)], I3, part);
  }
}
// the kit's materials are keyed by part too, so re-route the person's matte/plastic adds into the part
function personIn(k, p, v, part, opts) {
  const sub = new Kit();
  cardboardPerson(sub, p, v, '', opts);
  for (const [key, bk] of sub.b) {
    const nk = part + '|' + key.split('|')[1];
    let dst = k.b.get(nk);
    if (!dst) k.b.set(nk, (dst = { part, mat: bk.mat, geos: [] }));
    dst.geos.push(...bk.geos);
  }
}

// ================================================================================================
// props
// ================================================================================================
function grandstand() {
  const g = kitProp('grandstand', (k) => {
    const L = 15;
    // steel frame + concrete plinth
    k.box(L + 0.6, 0.5, 5.6, 'matte', '#c9c4ba', [0, 0.25, -1.8]);
    for (let i = 0; i < 4; i++) {
      const y = 0.9 + i * 0.95, z = 0.4 - i * 1.25;
      k.box(L, 0.22, 1.25, 'metal', '#9aa3b0', [0, y, z]); // step
      k.box(L, 0.95, 0.12, 'matte', '#d8d4cc', [0, y - 0.47, z + 0.62]); // riser
      // seat row (alternating colours)
      for (let s = 0; s < 8; s++) k.rbox(1.6, 0.3, 0.55, 0.1, 'plastic', [PINK, SUN, TEAL, SKY][(s + i) % 4], [-L / 2 + 1 + s * 1.85, y + 0.26, z - 0.3]);
    }
    for (const sx of [-L / 2, L / 2]) {
      k.box(0.3, 7.6, 0.3, 'metal', '#e8ecf2', [sx, 3.8, -4.6]);
      k.box(0.3, 4.6, 0.3, 'metal', '#e8ecf2', [sx, 2.3, 1.4]);
      k.box(0.4, 4.2, 5.8, 'paint', '#ddd8cc', [sx, 2.1, -1.6]); // side wall
    }
    // back wall + striped awning
    k.box(L, 4.8, 0.25, 'paint', '#ddd8cc', [0, 4.4, -4.5]);
    for (let s = 0; s < 10; s++) {
      k.box(L / 10, 0.16, 6.6, 'paint', s % 2 ? '#ffffff' : PINK, [-L / 2 + (s + 0.5) * L / 10, 7.3, -1.4], [0.22, 0, 0]);
      k.add(halfCylGeo(0.42, L / 10, 8), 'paint', s % 2 ? '#ffffff' : PINK, [-L / 2 + (s + 0.5) * L / 10, 6.62, 1.85], [0, Math.PI / 2, Math.PI], [1, 1, 1]);
    }
    // crowd (two bounce groups)
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const y = 1.0 + i * 0.95, z = 0.25 - i * 1.25;
      for (let s = 0; s < 7; s++) {
        v++;
        const sign = (v * 5) % 7 === 0 ? (v * 3) % CROWD_SIGNS.length : -1;
        personIn(k, [-L / 2 + 1.2 + s * 2.1 + (i % 2) * 0.6, y, z], v * 3 + i, (s + i) % 2 ? 'crowdA' : 'crowdB', { sign, scale: 0.92 });
      }
    }
  });
  // banner on the back wall
  const p = textPanel('GO TEAM HUMANITY!  (OR WHOEVER WINS)', { width: 13.5, height: 1.2, bg: INK, fg: SUN, border: null, borderW: 0, radius: 10 });
  p.position.set(0, 5.9, -4.35);
  g.add(p);
  g.userData.crowd = [g.userData.parts.crowdA, g.userData.parts.crowdB];
  return g;
}

function startGantry() {
  const W = 25;
  const g = kitProp('startGantry', (k) => {
    for (const sx of [-W / 2, W / 2]) {
      k.cyl(1.4, 1.6, 0.6, 24, 'metal', '#a9b0bc', [sx, 0.3, 0]);
      k.rbox(1.8, 12.5, 1.8, 0.35, 'paint', '#d4d8e2', [sx, 6.5, 0]);
      // checker band on the towers
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) for (const f of [-1, 1]) {
        k.box(0.45, 0.45, 0.04, 'paint', (r + c) % 2 ? '#111111' : '#ffffff', [sx - 0.675 + c * 0.45, 9.6 + r * 0.45, f * 0.92]);
      }
      k.box(1.9, 0.3, 1.9, 'chrome', '#ffffff', [sx, 3, 0]);
      k.box(1.9, 0.3, 1.9, 'chrome', '#ffffff', [sx, 8.6, 0]);
      // balloon cluster
      const bc = [PINK, SUN, TEAL, SKY, '#ff8a3a', '#b98aff'];
      for (let b = 0; b < 7; b++) {
        const a = b * 2.4, r = 0.9 + (b % 3) * 0.35;
        const bx = sx + Math.cos(a) * r * (sx < 0 ? 1 : -1) * 0.8, bz = Math.sin(a) * r + 0.6, by = 2.6 + (b % 4) * 0.7;
        k.sphere(0.6, 18, 'paint', bc[b % bc.length], [bx, by, bz], [1, 1.18, 1]);
        k.tube([bx, by - 0.7, bz], [sx, 0.6, 0.9], 0.02, 4, 'matte', '#ffffff');
      }
    }
    // the beam: truss + panel
    k.rbox(W + 2.2, 3.4, 1.6, 0.4, 'paint', INK, [0, 12.4, 0]);
    k.box(W + 2.4, 0.25, 1.7, 'chrome', '#ffffff', [0, 10.6, 0]);
    k.box(W + 2.4, 0.25, 1.7, 'chrome', '#ffffff', [0, 14.2, 0]);
    // start light pods (housings)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.4;
      k.rbox(1.5, 2.6, 0.9, 0.25, 'paint', '#16161c', [x, 8.8, 0.5]);
      k.box(0.2, 0.6, 0.2, 'metal', '#888', [x, 10.3, 0.5]);
    }
    // lamps (red / green parts)
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.4;
      k.sphere(0.42, 16, 'glow', '#ff2a2a', [x, 9.4, 0.92], [1, 1, 0.5], 'red');
      k.sphere(0.42, 16, 'glow', '#3aff6a', [x, 8.2, 0.92], [1, 1, 0.5], 'green');
      k.sphere(0.42, 16, 'rubber', '#2a1012', [x, 9.4, 0.9], [1, 1, 0.45], 'redOff');
      k.sphere(0.42, 16, 'rubber', '#0f2a14', [x, 8.2, 0.9], [1, 1, 0.45], 'greenOff');
    }
    // marquee bulbs around the beam
    for (let i = 0; i < 30; i++) {
      const x = -W / 2 - 0.6 + i * ((W + 1.2) / 29);
      k.sphere(0.13, 8, 'glow', '#fff2c0', [x, 13.95, 0.84], I3, i % 2 ? 'bulbA' : 'bulbB');
      k.sphere(0.13, 8, 'glow', '#fff2c0', [x, 10.85, 0.84], I3, i % 2 ? 'bulbB' : 'bulbA');
    }
  });
  const t = textPanel('P(DOOM) GRAND PRIX — START', { width: W - 0.5, height: 2.2, bg: INK, fg: '#ffffff', border: SUN, borderW: 10, radius: 18, stroke: null });
  t.position.set(0, 12.4, 0.82);
  g.add(t);
  for (const sx of [-1, 1]) {
    const s = textPanel(['SPONSORED', 'BY YOUR', 'TRAINING', 'DATA'], { width: 1.6, height: 2.4, bg: SUN, fg: INK, border: null, borderW: 0, radius: 8, pad: 8 });
    s.position.set(sx * W / 2, 5.6, 0.93);
    g.add(s);
  }
  const P = g.userData.parts;
  g.userData.startLights = P;
  return g;
}

function tutorialSign() {
  const g = kitProp('tutorial', (k) => {
    for (const sx of [-11.8, 11.8]) {
      k.cyl(0.9, 1.1, 0.5, 20, 'metal', '#a9b0bc', [sx, 0.25, 0]);
      k.cyl(0.32, 0.32, 9.6, 16, 'paint', '#3a2c55', [sx, 4.9, 0]);
      k.box(0.9, 0.3, 0.9, 'chrome', '#fff', [sx, 9.6, 0]);
    }
    k.rbox(20.6, 6.2, 0.6, 0.3, 'paint', '#3a2c55', [0, 11.7, -0.1]);
    for (let i = 0; i < 34; i++) {
      const x = -9.8 + i * (19.6 / 33);
      k.sphere(0.16, 8, 'glow', '#fff4c8', [x, 14.55, 0.25], I3, i % 2 ? 'a' : 'b');
      k.sphere(0.16, 8, 'glow', '#fff4c8', [x, 8.85, 0.25], I3, i % 2 ? 'b' : 'a');
    }
    for (let i = 0; i < 9; i++) {
      const y = 9.1 + i * (5.2 / 8);
      k.sphere(0.16, 8, 'glow', '#fff4c8', [-10.0, y, 0.25], I3, i % 2 ? 'a' : 'b');
      k.sphere(0.16, 8, 'glow', '#fff4c8', [10.0, y, 0.25], I3, i % 2 ? 'b' : 'a');
    }
  });
  const tex = canvasTex('gTut', 1024, 272, (x, W, H) => {
    x.fillStyle = '#ffe066'; roundRect(x, 6, 6, W - 12, H - 12, 30); x.fill();
    x.lineWidth = 12; x.strokeStyle = INK; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK;
    const L = [['HOLD THE WHEEL.', 70], ['DRIVE THROUGH THE GPUS.', 74], ['SAVE HUMANITY.', 70]];
    L.forEach(([l, sz], i) => { x.font = `700 ${sz}px ${FONT}`; x.fillStyle = i === 2 ? '#d81e4a' : INK; x.fillText(l, W / 2, 56 + i * 80); });
  });
  const pm = new THREE.MeshBasicMaterial({ map: tex });
  pm.color.setScalar(0.95);
  const p = mesh(G.plane(18.8, 5.0), pm, 0, 11.7, 0.22);
  g.add(p);
  const tag = textPanel('(tutorial, sponsored by the alignment team, budget: $12)', { width: 11, height: 0.6, bg: INK, fg: '#ffe066', border: null, borderW: 0, radius: 8 });
  tag.position.set(0, 8.25, 0.1);
  g.add(tag);
  g.userData.bulbs = g.userData.parts;
  return g;
}

function house(variant) {
  const founders = variant === 'founders';
  const v = founders ? 0 : variant;
  const g = kitProp('house' + variant, (k) => {
    const wall = STUCCO[(v * 2 + 1) % STUCCO.length], roof = ROOF[v % ROOF.length];
    const trim = '#ffffff';
    // main house (left) + garage wing (right). front faces +z
    k.box(8.4, 0.5, 6.4, 'matte', '#cfc8bc', [-2.2, 0.25, -3.4]); // foundation
    k.box(8, 4.4, 6, 'matte', wall, [-2.2, 2.6, -3.4]);
    k.add(prismGeo(), 'paint', roof, [-2.2, 4.8, -3.4], O3, [8.9, 2.8, 7.0]);
    k.box(8.9, 0.25, 0.3, 'paint', trim, [-2.2, 4.8, 0.05]); // fascia
    k.box(1.1, 2.4, 1.1, 'matte', '#b8a99a', [-4.6, 6.4, -4.4]); // chimney
    k.box(1.3, 0.2, 1.3, 'metal', '#666', [-4.6, 7.6, -4.4]);
    // solar panels on the roof (front slope)
    for (let i = 0; i < 3; i++) k.box(1.9, 0.08, 1.5, 'glassy', '#1a2a5a', [-4.2 + i * 2.05, 5.75, -1.6], [0.67, 0, 0]);
    // windows
    for (const wx of [-4.8, -2.4]) {
      k.box(1.7, 1.6, 0.12, 'glassy', '#2a4a6a', [wx, 2.9, -0.36]);
      k.box(1.95, 0.16, 0.25, 'paint', trim, [wx, 2.05, -0.32]);
      k.box(1.95, 0.16, 0.25, 'paint', trim, [wx, 3.75, -0.32]);
      k.box(0.12, 1.6, 0.2, 'paint', trim, [wx, 2.9, -0.32]);
      // shutters
      k.box(0.45, 1.75, 0.08, 'paint', ['#3a6a8a', '#6a8a4a', '#8a3a4a'][v % 3], [wx - 1.15, 2.9, -0.36]);
      k.box(0.45, 1.75, 0.08, 'paint', ['#3a6a8a', '#6a8a4a', '#8a3a4a'][v % 3], [wx + 1.15, 2.9, -0.36]);
    }
    // front door + porch
    k.box(1.2, 2.3, 0.12, 'paint', ['#d8452b', '#2b6ad8', '#2a8a5a', SUN][v % 4], [-0.4, 1.65, -0.36]);
    k.sphere(0.08, 8, 'chrome', '#fff', [-0.0, 1.6, -0.27]);
    k.box(2.4, 0.3, 1.6, 'matte', '#cfc8bc', [-0.4, 0.15, 0.2]);
    // garage wing
    k.box(6, 3.6, 6.4, 'matte', wall, [4.7, 2.2, -3.2]);
    k.add(prismGeo(), 'paint', roof, [4.7, 4.0, -3.2], [0, Math.PI / 2, 0], [7.0, 1.8, 6.6]);
    k.box(6.3, 0.25, 0.3, 'paint', trim, [4.7, 4.0, 0.05]);
    k.box(5.0, 0.2, 0.3, 'paint', trim, [4.7, 3.3, 0.06]);
    k.box(0.25, 3.2, 0.3, 'paint', trim, [2.1, 1.7, 0.06]);
    k.box(0.25, 3.2, 0.3, 'paint', trim, [7.3, 1.7, 0.06]);
    if (founders) {
      // door rolled up: dark interior, desk, monitors, rack, founders, pizza
      k.box(5.0, 3.0, 0.1, 'matte', '#141018', [4.7, 1.6, -5.9]);
      k.box(5.0, 0.6, 0.5, 'paint', '#e9e2d0', [4.7, 3.0, -0.1]); // rolled door
      k.box(4.9, 0.05, 6, 'matte', '#3a3440', [4.7, 0.12, -3]);
      k.box(3.4, 0.14, 1.3, 'wood', '#8a5a3a', [4.7, 1.1, -3.8]);
      for (const dx of [-1.4, 1.4]) k.box(0.12, 1.0, 1.2, 'metal', '#666', [4.7 + dx, 0.6, -3.8]);
      for (const dx of [-0.75, 0.75]) {
        k.box(1.3, 0.85, 0.1, 'plastic', '#1a1a1e', [4.7 + dx, 1.75, -4.25], [0, -dx * 0.3, 0]);
        k.box(1.15, 0.7, 0.04, 'glow', '#7af7ff', [4.7 + dx, 1.75, -4.18], [0, -dx * 0.3, 0], 'screens');
        k.box(0.1, 0.4, 0.1, 'metal', '#444', [4.7 + dx, 1.3, -4.3]);
      }
      k.rbox(1.1, 2.6, 1.0, 0.08, 'paint', '#1a1e28', [6.8, 1.4, -4.9]);
      for (let i = 0; i < 6; i++) k.box(0.5, 0.08, 0.05, 'glow', i % 2 ? '#5dffb0' : '#ffb84a', [6.8, 0.6 + i * 0.35, -4.38], O3, i % 2 ? 'ledB' : 'ledA');
      // string lights across the garage ceiling
      for (let i = 0; i < 10; i++) k.sphere(0.1, 8, 'glow', '#ffcf7a', [2.6 + i * 0.47, 2.95 - Math.sin(i / 9 * Math.PI) * 0.35, -0.6]);
      // founders (cardboard) at the desk, pizza boxes on the floor
      personIn(k, [3.9, 0.15, -2.9], 1, '', {});
      personIn(k, [5.5, 0.15, -2.9], 6, '', {});
      for (let i = 0; i < 4; i++) k.box(1.3, 0.16, 1.3, 'matte', i % 2 ? '#f2efe6' : '#e8e2d2', [2.9 + (i % 2) * 0.1, 0.22 + i * 0.18, -1.2], [0, i * 0.2, 0]);
      k.box(1.1, 0.9, 0.04, 'matte', '#ffffff', [3.0, 2.1, -5.8]); // whiteboard inside
    } else {
      // closed roller door (ribs)
      k.box(5.0, 3.0, 0.12, 'paint', '#f6f3ec', [4.7, 1.6, 0.0]);
      for (let i = 0; i < 6; i++) k.box(5.0, 0.07, 0.06, 'paint', '#d8d4cc', [4.7, 0.35 + i * 0.5, 0.08]);
      k.box(0.6, 0.12, 0.1, 'chrome', '#fff', [4.7, 0.6, 0.1]);
    }
    // driveway + path + hedge + lawn lamp
    k.box(5.2, 0.12, 9.5, 'matte', '#c8c4bc', [4.7, 0.06, 4.6]);
    k.box(1.4, 0.1, 7, 'matte', '#d8d0c4', [-0.4, 0.05, 3.6]);
    k.rbox(4.2, 1.2, 1.1, 0.4, 'matte', '#3f7a3a', [-4.6, 0.6, 0.8]);
    k.rbox(4.2, 1.0, 0.9, 0.35, 'matte', '#4a8a42', [-4.6, 1.3, 0.8]);
    if (!founders) k.box(0.07, 1.2, 0.07, 'paint', '#ffffff', [-3.2, 0.5, 2.15]);
    // a parked car on the driveway (not in the founders' house: they sold it for GPUs)
    if (!founders) {
      const cc = ['#d8452b', '#2b6ad8', '#f2f2f2', '#2a2a30'][v % 4];
      k.rbox(2.2, 1.0, 4.4, 0.4, 'paint', cc, [4.7, 0.95, 3.6]);
      k.rbox(1.9, 0.8, 2.4, 0.35, 'paint', cc, [4.7, 1.7, 3.3]);
      k.box(1.95, 0.55, 2.0, 'glassy', '#1a2230', [4.7, 1.75, 3.3]);
      for (const [wx, wz] of [[-1.05, 2.2], [1.05, 2.2], [-1.05, 5.0], [1.05, 5.0]]) k.cyl(0.42, 0.42, 0.3, 16, 'rubber', '#1a1a1e', [4.7 + wx, 0.45, wz], [0, 0, Math.PI / 2]);
    } else {
      // instead: a pallet of GPU boxes on the driveway
      for (let i = 0; i < 6; i++) k.rbox(1.1, 0.8, 1.1, 0.05, 'matte', i % 2 ? '#3fa84a' : '#2a8a3a', [4.0 + (i % 3) * 1.15, 0.55 + ((i / 3) | 0) * 0.82, 4.2]);
    }
  });
  if (founders) {
    const s = textPanel(['HQ', '(do not tell mom)'], { width: 3.4, height: 1.3, bg: '#ffe066', fg: INK, border: INK, borderW: 10, radius: 14 });
    s.position.set(4.7, 3.65, 0.25);
    g.add(s);
    const n = textPanel('AGI: 2 WEEKS', { width: 1.0, height: 0.36, bg: '#ffffff', fg: '#d81e4a', border: null, borderW: 0, radius: 4 });
    n.position.set(3.0, 2.15, -5.75);
    g.add(n);
    g.userData.screens = g.userData.parts.screens;
  } else {
    const yard = ['THIS HOUSE BELIEVES\nIN SCALING', 'NO SOLICITING\n(except agents)', 'BEWARE OF DOG\n(it is a robot)', 'PROUD PARENT OF\nA 7B MODEL'][variant % 4];
    const s = textPanel(yard.split('\n'), { width: 2.2, height: 1.2, bg: '#ffffff', fg: INK, border: '#2b6ad8', borderW: 10, radius: 10 });
    s.position.set(-3.2, 1.25, 2.2);
    s.rotation.y = 0.25;
    g.add(s);
  }
  return g;
}

// ---- palm tree ----
function frondGeo() {
  return cachedGeo('frond', () => {
    const g = new THREE.PlaneGeometry(1, 1, 2, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const across = p.getX(i), l = p.getY(i) + 0.5; // 0..1 along
      const len = 4.2;
      const w = Math.sin(Math.PI * Math.pow(l, 0.75)) * 0.75 + 0.05;
      const X = l * len;
      const Y = l * len * 0.55 - Math.pow(l * len, 2) * 0.16 - Math.abs(across) * w * 0.5;
      p.setXYZ(i, X, Y, across * w * 2);
    }
    g.computeVertexNormals();
    return g;
  });
}
function palm(tall) {
  return kitProp('palm' + tall, (k) => {
    const H = tall ? 13 : 9;
    const N = 9;
    let x = 0, prev = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const u = (i + 1) / N;
      x = Math.sin(u * 1.4) * (tall ? 1.4 : 1.0);
      const cur = [x, u * H, 0];
      const r = 0.42 - u * 0.14;
      k.tube(prev, cur, r, 10, 'matte', i % 2 ? '#8a6a4a' : '#7a5a3e');
      k.cyl(r + 0.06, r + 0.06, 0.16, 10, 'matte', '#5e4430', cur);
      prev = cur;
    }
    const top = prev;
    k.cone(0.9, 1.6, 10, 'matte', '#6a5032', [top[0], top[1] - 0.5, 0], [Math.PI, 0, 0]);
    k.sphere(0.5, 10, 'matte', '#5a7a32', [top[0], top[1] + 0.1, 0]);
    const n = 12;
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + (f % 2) * 0.2;
      const pitch = f % 2 ? 0.25 : -0.05;
      k.add(frondGeo(), 'leaf', f % 3 ? '#4f8f36' : '#3f7a2e', [top[0], top[1] + 0.1, 0], [0, a, pitch], [1, 1, 1]);
    }
    // coconuts
    for (let c = 0; c < 3; c++) k.sphere(0.24, 10, 'paint', '#5a3a1a', [top[0] + Math.cos(c * 2.1) * 0.4, top[1] - 0.25, Math.sin(c * 2.1) * 0.4]);
  });
}

function mailbox(v) {
  const g = kitProp('mailbox' + (v % 3), (k) => {
    k.box(0.22, 1.3, 0.22, 'wood', '#8a6a4a', [0, 0.65, 0]);
    const c = ['#2a3a8a', '#d8452b', '#2a2a30'][v % 3];
    k.box(0.62, 0.45, 1.1, 'paint', c, [0, 1.5, 0]);
    k.add(halfCylGeo(0.31, 1.1, 12), 'paint', c, [0, 1.72, 0]);
    k.box(0.06, 0.6, 0.12, 'paint', '#ff2a2a', [0.34, 1.75, -0.25], [0, 0, 0], 'flag');
    k.box(0.06, 0.24, 0.4, 'paint', '#ff2a2a', [0.34, 2.0, -0.05], [0, 0, 0], 'flag');
  });
  const lbl = textPanel(['INBOX: 4,000,000', '(ALL AGENTS)'], { width: 1.15, height: 0.45, bg: '#ffffff', fg: INK, border: null, borderW: 0, radius: 6 });
  lbl.position.set(0, 1.5, 0.57);
  lbl.rotation.y = 0;
  g.add(lbl);
  return g;
}

function streetSign() {
  const g = kitProp('streetSign', (k) => {
    k.cyl(0.08, 0.08, 4.4, 10, 'metal', '#9aa0aa', [0, 2.2, 0]);
    k.box(2.6, 0.55, 0.06, 'paint', '#1f7a3a', [0, 4.1, 0]);
    k.box(2.6, 0.55, 0.06, 'paint', '#1f7a3a', [0, 3.45, 0], [0, Math.PI / 2, 0]);
    k.box(0.75, 0.75, 0.06, 'paint', '#ffffff', [0, 2.5, 0.06], [0, 0, Math.PI / 4]);
    k.box(0.68, 0.68, 0.07, 'paint', '#e8b020', [0, 2.5, 0.07], [0, 0, Math.PI / 4]);
  });
  const a = textPanel('PIVOT AVE', { width: 2.4, height: 0.45, bg: '#1f7a3a', fg: '#ffffff', border: '#ffffff', borderW: 6, radius: 6 });
  a.position.set(0, 4.1, 0.045);
  g.add(a);
  const b = textPanel('HYPE ST', { width: 2.4, height: 0.45, bg: '#1f7a3a', fg: '#ffffff', border: '#ffffff', borderW: 6, radius: 6 });
  b.position.set(0.045, 3.45, 0);
  b.rotation.y = Math.PI / 2;
  g.add(b);
  const c = textPanel(['DEAD', 'END?'], { width: 0.62, height: 0.5, bg: null, fg: INK, border: null, borderW: 0, pad: 4 });
  c.position.set(0, 2.5, 0.12);
  g.add(c);
  return g;
}

function vcTruck() {
  const g = kitProp('vcTruck', (k) => {
    const body = '#1f5a3a', gold = '#e8b84a';
    // chassis along x (side faces +z, toward the road)
    k.rbox(7.2, 3.4, 3.0, 0.35, 'paint', body, [-0.6, 2.6, 0]);
    k.rbox(2.6, 2.5, 2.9, 0.4, 'paint', body, [4.3, 2.1, 0]);
    k.box(1.0, 1.1, 2.7, 'glassy', '#1a2230', [5.1, 2.75, 0]);
    k.box(1.3, 1.0, 0.06, 'glassy', '#1a2230', [4.3, 2.75, 1.45]);
    k.box(7.3, 0.25, 3.05, 'chrome', '#fff', [-0.6, 1.2, 0]);
    k.box(7.3, 0.18, 3.05, 'paint', gold, [-0.6, 3.4, 0]);
    k.box(0.4, 0.5, 3.1, 'chrome', '#fff', [5.6, 1.3, 0]);
    for (const sz of [-1.1, 1.1]) k.box(0.1, 0.35, 0.5, 'glow', '#fff6d8', [5.65, 1.75, sz]);
    for (const [wx, wz] of [[-3, 1.35], [-1.6, 1.35], [3.9, 1.35], [-3, -1.35], [-1.6, -1.35], [3.9, -1.35]]) {
      k.cyl(0.75, 0.75, 0.55, 20, 'rubber', '#1a1a1e', [wx, 0.75, wz], [Math.PI / 2, 0, 0]);
      k.cyl(0.42, 0.42, 0.58, 14, 'chrome', '#ffffff', [wx, 0.75, wz], [Math.PI / 2, 0, 0]);
    }
    // rear doors open + cash bricks spilling
    k.box(0.12, 3.0, 1.4, 'paint', body, [-4.3, 2.6, 2.1], [0, -1.2, 0]);
    k.box(0.12, 3.0, 1.4, 'paint', body, [-4.3, 2.6, -2.1], [0, 1.2, 0]);
    for (let i = 0; i < 9; i++) k.box(0.9, 0.3, 0.5, 'matte', '#7fc86a', [-4.6 - (i % 3) * 0.5, 0.15 + ((i / 3) | 0) * 0.3, -0.7 + (i % 3) * 0.6], [0, i * 0.4, 0]);
    // flying bills (animated)
    for (let i = 0; i < 6; i++) k.box(0.7, 0.02, 0.32, 'plastic', '#9ae08a', [0, 0, 0], [0, i, 0], 'bill' + i);
  });
  const s = textPanel(['VIBES CAPITAL', 'smart money*'], { width: 6.0, height: 2.2, bg: '#1f5a3a', fg: '#ffe9a8', border: '#e8b84a', borderW: 10, radius: 14 });
  s.position.set(-0.6, 2.7, 1.52);
  g.add(s);
  const f = textPanel('*not that smart', { width: 2.4, height: 0.4, bg: null, fg: '#ffe9a8', border: null, borderW: 0, pad: 4 });
  f.position.set(1.2, 1.55, 1.52);
  g.add(f);
  const bills = [];
  for (let i = 0; i < 6; i++) bills.push(g.userData.parts['bill' + i]);
  g.userData.bills = bills;
  return g;
}

function whiteboardTex() {
  return canvasTex('gWB', 1024, 600, (x, W, H) => {
    x.fillStyle = '#fbfcfd'; x.fillRect(0, 0, W, H);
    // faint ghosts of erased stuff
    x.fillStyle = 'rgba(80,90,120,0.07)'; x.font = `700 46px ${FONT}`; x.fillText('safety plan', 560, 520); x.fillText('ethics', 120, 120);
    marker(x, '#222', 8);
    x.beginPath(); x.moveTo(90, 50); x.lineTo(90, 530); x.lineTo(980, 530); x.stroke();
    x.beginPath(); x.moveTo(78, 70); x.lineTo(90, 50); x.lineTo(102, 70); x.stroke();
    marker(x, '#e4387a', 14);
    x.beginPath(); x.moveTo(100, 505);
    for (let i = 0; i <= 60; i++) { const u = i / 60; x.lineTo(100 + u * 820, 505 - Math.pow(u, 5) * 470); }
    x.stroke();
    x.fillStyle = '#e4387a'; x.beginPath(); x.moveTo(905, 40); x.lineTo(945, 30); x.lineTo(930, 70); x.fill();
    x.fillStyle = '#2244aa'; x.font = `700 72px ${FONT}`; x.fillText('AGI', 790, 90);
    x.font = `700 36px ${FONT}`; x.fillStyle = '#222';
    x.fillText('we are here', 220, 430); marker(x, '#222', 5); x.beginPath(); x.moveTo(300, 440); x.lineTo(270, 490); x.stroke();
    x.fillStyle = '#2a8a3a'; x.fillText('revenue (vibes)', 470, 470);
    x.save(); x.translate(40, 380); x.rotate(-Math.PI / 2); x.fillStyle = '#222'; x.fillText('number', 0, 0); x.restore();
    x.fillStyle = '#222'; x.fillText('time (≈ 2 weeks)', 640, 575);
    x.fillStyle = '#d82020'; x.font = `700 40px ${FONT}`; x.fillText('safety?', 200, 180);
    marker(x, '#d82020', 6); x.beginPath(); x.moveTo(190, 168); x.lineTo(345, 168); x.stroke();
    x.fillStyle = '#2244aa'; x.font = `700 34px ${FONT}`; x.fillText('← series B', 640, 300);
  });
}
function whiteboard() {
  const g = kitProp('whiteboard', (k) => {
    for (const sx of [-4.6, 4.6]) {
      k.box(0.25, 6.6, 0.25, 'metal', '#a9b0bc', [sx, 3.3, -0.2]);
      k.box(1.6, 0.18, 0.25, 'metal', '#a9b0bc', [sx, 0.35, -0.2], [0, Math.PI / 2, 0]);
      for (const dz of [-0.7, 0.7]) k.cyl(0.18, 0.18, 0.14, 12, 'rubber', '#222', [sx, 0.18, -0.2 + dz], [0, 0, Math.PI / 2]);
    }
    k.rbox(10.0, 6.0, 0.25, 0.1, 'metal', '#c8ccd4', [0, 4.6, 0]);
    k.box(9.6, 0.15, 0.35, 'metal', '#a9b0bc', [0, 1.55, 0.15]);
    k.box(0.6, 0.12, 0.12, 'plastic', '#d82020', [-2, 1.68, 0.18]);
    k.box(0.6, 0.12, 0.12, 'plastic', '#2244aa', [-1, 1.68, 0.18]);
  });
  const m = new THREE.MeshStandardMaterial({ map: whiteboardTex(), roughness: 0.55, metalness: 0, color: '#d8dade', envMapIntensity: 0.6 });
  g.add(mesh(G.plane(9.6, 5.6), m, 0, 4.6, 0.135));
  return g;
}

function computeStand() {
  // lemonade stand, but compute
  const g = kitProp('computeStand', (k) => {
    k.box(3.2, 1.2, 1.3, 'wood', '#d8b88a', [0, 0.6, 0]);
    k.box(3.4, 0.12, 1.5, 'wood', '#b8946a', [0, 1.25, 0]);
    for (const sx of [-1.5, 1.5]) k.box(0.14, 2.4, 0.14, 'wood', '#b8946a', [sx, 2.3, -0.5]);
    k.box(3.5, 0.12, 1.8, 'paint', '#ffd23f', [0, 3.5, -0.2], [0.25, 0, 0]);
    for (let s = 0; s < 7; s++) k.box(0.5, 0.13, 1.82, 'paint', s % 2 ? '#ffffff' : PINK, [-1.5 + s * 0.5, 3.52, -0.2], [0.25, 0, 0]);
    // GPU boxes for sale + a jug
    for (let i = 0; i < 3; i++) k.rbox(0.6, 0.35, 0.45, 0.04, 'paint', '#2a2a30', [-1 + i * 0.7, 1.5, 0.1]);
    for (let i = 0; i < 3; i++) k.box(0.4, 0.05, 0.3, 'glow', '#5dffb0', [-1 + i * 0.7, 1.69, 0.1]);
    k.cyl(0.25, 0.25, 0.6, 12, 'glassy', '#ffe060', [1.2, 1.6, 0.1]);
    personIn(k, [0.3, 0, -1.0], 2, '', { scale: 0.75 });
  });
  const s = textPanel(['GPUs 5¢', '(fresh squeezed)'], { width: 3.0, height: 1.0, bg: '#ffffff', fg: '#d81e4a', border: INK, borderW: 8, radius: 10 });
  s.position.set(0, 0.62, 0.66);
  g.add(s);
  return g;
}

function boxPile() {
  return kitProp('boxPile', (k) => {
    const sp = [[0, 0, 0, 2.2, 1.8, 2.2, 0], [2.3, 0, 0.3, 1.8, 1.4, 1.8, 0.3], [0.3, 1.8, 0.1, 1.6, 1.3, 1.6, 0.5], [-2.1, 0, 0.4, 1.4, 1.1, 1.4, -0.2]];
    sp.forEach(([x, y, z, w, h, d, r], i) => {
      k.rbox(w, h, d, 0.06, 'matte', CARD[i % 4], [x, y + h / 2, z], [0, r, 0]);
      k.box(w + 0.02, 0.2, d * 0.3, 'plastic', '#e8d7a8', [x, y + h * 0.62, z], [0, r, 0]);
    });
    for (let i = 0; i < 3; i++) k.box(1.8, 0.2, 1.8, 'matte', i % 2 ? '#f2efe6' : '#e8e2d2', [-0.4, 0.1 + i * 0.22, 2.1], [0, i * 0.3, 0]);
    k.rbox(2.4, 1.3, 2.2, 0.6, 'plastic', PINK, [3.0, 0.65, 2.4]); // beanbag
  });
}

function hollywoodTex() {
  return canvasTex('gHolly', 2048, 512, (x, W) => {
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 250px ${FONT}`;
    for (let d = 14; d > 0; d -= 2) { x.fillStyle = `rgb(${130 + d * 2},${132 + d * 2},${140 + d * 2})`; x.fillText('SILICON VALLEY', W / 2 + d, 170 + d); }
    x.fillStyle = '#ffffff'; x.fillText('SILICON VALLEY', W / 2, 170);
    x.font = `700 120px ${FONT}`;
    x.fillStyle = '#7a7c86'; x.fillText('(NOW 80% AGENTS)', W / 2 + 6, 410 + 6);
    x.fillStyle = '#ffe9a8'; x.fillText('(NOW 80% AGENTS)', W / 2, 410);
  });
}
function hollywood() {
  const g = kitProp('holly', (k) => {
    for (let i = 0; i < 15; i++) {
      const x = -68 + i * (136 / 14);
      k.box(0.7, 44, 0.7, 'metal', '#8a8c94', [x, 6, -1.2]);
      k.tube([x, -12, -8], [x, 20, -1.2], 0.3, 6, 'metal', '#8a8c94');
    }
    k.box(140, 0.8, 0.8, 'metal', '#8a8c94', [0, 17, -1.2]);
    k.box(140, 0.8, 0.8, 'metal', '#8a8c94', [0, 6, -1.2]);
  });
  const m = new THREE.MeshStandardMaterial({ map: hollywoodTex(), emissiveMap: hollywoodTex(), emissive: '#ffffff', emissiveIntensity: 0.35, alphaTest: 0.4, roughness: 0.6, side: THREE.DoubleSide });
  g.add(mesh(G.plane(150, 37.5), m, 0, 22, 0));
  return g;
}

function waterTower() {
  const g = kitProp('waterTower', (k) => {
    for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) k.tube([lx, 0, lz], [lx * 0.6, 22, lz * 0.6], 0.45, 8, 'metal', '#a9b0bc');
    k.box(7, 0.4, 0.4, 'metal', '#a9b0bc', [0, 10, 3.2]);
    k.box(7, 0.4, 0.4, 'metal', '#a9b0bc', [0, 10, -3.2]);
    k.box(0.4, 0.4, 7, 'metal', '#a9b0bc', [3.2, 10, 0]);
    k.box(0.4, 0.4, 7, 'metal', '#a9b0bc', [-3.2, 10, 0]);
    k.cyl(5.5, 5.5, 0.5, 32, 'metal', '#c8ccd4', [0, 22.2, 0]);
    k.sphere(5.5, 32, 'paint', '#7ac8e8', [0, 22.5, 0], [1, 0.35, 1]);
    k.add(G.cone(5.9, 3.0, 32), 'paint', '#5a6a8a', [0, 31.6, 0]);
    k.sphere(0.5, 10, 'glow', '#ff3a3a', [0, 33.4, 0]);
  });
  const m = new THREE.MeshPhysicalMaterial({
    map: canvasTex('gTower', 1024, 256, (x, W, H) => {
      x.fillStyle = '#7ac8e8'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#ffffff'; x.font = `700 120px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('HYPE', W * 0.25, H / 2); x.fillText('HYPE', W * 0.75, H / 2);
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 16, W, 8); x.fillRect(0, H - 24, W, 8);
    }), roughness: 0.3, clearcoat: 1,
  });
  const t = mesh(G.cyl(5.5, 5.5, 8, 32), m, 0, 26.5, 0);
  t.rotation.y = -Math.PI / 2;
  g.add(t);
  return g;
}

function blimp() {
  const g = kitProp('blimp', (k) => {
    k.sphere(4, 32, 'paint', '#f2f2f6', [0, 0, 0], [3.4, 1, 1]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      k.box(3.2, 0.2, 2.6, 'paint', PINK, [11.8, Math.sin(a) * 2.0, Math.cos(a) * 2.0], [a, 0, 0]);
    }
    k.rbox(4.2, 1.3, 1.6, 0.5, 'paint', '#3a2c55', [0, -4.3, 0]);
    k.box(3.2, 0.5, 1.62, 'glassy', '#1a2230', [0, -4.2, 0]);
    k.cyl(0.35, 0.35, 0.8, 10, 'metal', '#888', [-2.6, -4.3, 0], [0, 0, Math.PI / 2]);
  });
  const s = textPanel(['P(DOOM) AIRSHIP', 'AGI ARRIVING SOON (PROBABLY)'], { width: 18, height: 4.0, bg: '#3a2c55', fg: '#ffffff', border: SUN, borderW: 10, radius: 30 });
  s.position.set(0, 0.6, 4.05);
  g.add(s);
  const s2 = textPanel(['P(DOOM) AIRSHIP', 'AGI ARRIVING SOON (PROBABLY)'], { width: 18, height: 4.0, bg: '#3a2c55', fg: '#ffffff', border: SUN, borderW: 10, radius: 30 });
  s2.position.set(0, 0.6, -4.05);
  s2.rotation.y = Math.PI;
  g.add(s2);
  g.userData.blimp = true;
  return g;
}

function shrub() {
  const g = new THREE.Group();
  g.add(model('shrub_04', { size: 3.4 }));
  return g;
}

function flagPole(c) {
  const g = kitProp('flag' + c, (k) => {
    k.cyl(0.08, 0.1, 9, 10, 'chrome', '#fff', [0, 4.5, 0]);
    k.sphere(0.18, 10, 'chrome', '#fff', [0, 9.1, 0]);
    // checkered flag (two strips merged into one part that waves)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) k.box(0.5, 0.5, 0.04, 'plastic', (i + j) % 2 ? '#111' : '#fafafa', [0.25 + i * 0.5, -0.25 - j * 0.5, 0], O3, 'flag');
  });
  g.userData.flag = g.userData.parts.flag;
  g.userData.flag.position.set(0.05, 8.8, 0);
  return g;
}

// ================================================================================================
// theme
// ================================================================================================
const HOUSES = ['h0', 'h1', 'h2', 'h3'];

export default {
  id: 'garage',
  title: 'GARAGE STARTUP',
  subtitle: 'two founders, one GPU, zero safety team',
  night: false,
  palette: {
    skyTop: '#4a8cff', skyBottom: '#ffe0b0', road: '#6b6a7a', ground: '#8fd17a', kerb: '#ffffff',
    accent1: '#ff6b8b', accent2: '#ffd23f',
  },
  look: {
    sky: 'day', env: 'day', exposure: 0.9,
    sun: { elev: 34, azim: 145, color: '#fff0d8', intensity: 3.3 },
    skyParams: { turbidity: 3, rayleigh: 1.5, mie: 0.005, clouds: 0.5 },
    fog: { color: '#d8e6f2', density: 0.0017 },
    ground: { tex: 'grass', tint: '#a6d878', scale: 6 }, road: { tex: 'asphalt', tint: '#9a98a8' },
    hills: 1.35,
  },
  spacing: 12,
  layout(zf, rng, sec) {
    const out = [];
    if (location.search.includes('noprops')) return out; // TEMP
    const rel = zf - sec.start * SPEED;
    const at = (target, p) => { if (rel > target - 6 && rel <= target + 6) out.push({ ...p, dz: target - rel }); };
    // hero set pieces at exact spots
    at(16, { kind: 'gantry', x: 0, y: 0 });
    at(62, { kind: 'tutorial', x: 0, y: 0 });
    at(410, { kind: 'holly', x: 180, y: 0, rotY: -0.55, scale: 1.7 });
    at(170, { kind: 'blimp', x: -46, y: 34, rotY: 0.5 });
    at(470, { kind: 'tower', x: -58, rotY: 0.3 });
    at(230, { kind: 'founders', x: 27, rotY: -0.42 });
    at(150, { kind: 'truck', x: -15, rotY: Math.PI / 2 - 0.25 });
    at(380, { kind: 'whiteboard', x: 14.5, rotY: -0.55 });
    at(340, { kind: 'stand', x: -13.5, rotY: 0.45 });
    at(560, { kind: 'truck', x: 15.5, rotY: -Math.PI / 2 + 0.25 });
    at(110, { kind: 'whiteboard', x: -14.5, rotY: 0.55 });
    if (rel < 56) {
      // start straight: grandstands both sides (parallel to the road), flags, boxes
      if (rel > -80) for (const side of [-1, 1]) out.push({ kind: 'grandstand', x: side * 19.5, rotY: -side * Math.PI / 2 });
      if (rel > -40 && rng.chance(0.6)) out.push({ kind: 'flagpole' + (rng.chance(0.5) ? 'A' : 'B'), x: rng.pick([-1, 1]) * 12.2, dz: 6 });
      return out;
    }
    const busy = out.length > 0;
    for (const side of [-1, 1]) {
      // far layer: a street of houses (+ palms between them)
      if (!(rel > 218 && rel < 242 && side > 0)) out.push({ kind: rng.pick(HOUSES), x: side * rng.range(26, 30), rotY: -side * rng.range(0.3, 0.5) });
      if (rng.chance(0.55)) out.push({ kind: rng.chance(0.5) ? 'palmT' : 'palmS', x: side * rng.range(19, 22), dz: 6 });
      // near layer
      if (busy) continue;
      const r = rng();
      if (r < 0.34) out.push({ kind: rng.chance(0.6) ? 'palmT' : 'palmS', x: side * rng.range(12.5, 14) });
      else if (r < 0.52) out.push({ kind: 'mailbox' + rng.int(0, 2), x: side * 11.6, rotY: -side * 0.5 });
      else if (r < 0.64) out.push({ kind: 'shrub', x: side * rng.range(12.5, 15), rotY: rng.range(0, 6) });
      else if (r < 0.72) out.push({ kind: 'boxes', x: side * rng.range(13, 15), rotY: rng.range(-0.6, 0.6) });
      else if (r < 0.8) out.push({ kind: 'street', x: side * 11.8, rotY: -side * 0.5 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'gantry': return startGantry();
      case 'tutorial': return tutorialSign();
      case 'grandstand': return grandstand();
      case 'flagpoleA': return flagPole('A');
      case 'flagpoleB': return flagPole('B');
      case 'h0': case 'h1': case 'h2': case 'h3': return house(+kind[1]);
      case 'founders': return house('founders');
      case 'palmT': return palm(true);
      case 'palmS': return palm(false);
      case 'mailbox0': case 'mailbox1': case 'mailbox2': return mailbox(+kind[7]);
      case 'shrub': return shrub();
      case 'boxes': return boxPile();
      case 'street': return streetSign();
      case 'truck': return vcTruck();
      case 'whiteboard': return whiteboard();
      case 'stand': return computeStand();
      case 'holly': return hollywood();
      case 'tower': return waterTower();
      case 'blimp': return blimp();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    KIT_U.uTime.value = t;
    KIT_U.uBeat.value = beatPhase;
    const u = obj.userData;
    const seed = entry?.seed || 0;
    if (u.crowd) {
      const b = Math.sin(beatPhase * Math.PI);
      u.crowd[0].position.y = b * 0.28;
      u.crowd[1].position.y = (1 - b) * 0.22;
    } else if (u.startLights) {
      const P = u.startLights;
      // red until the race clock passes 0, then green (blinking for a few seconds)
      const go = t >= 0.02;
      P.red.visible = !go; P.redOff.visible = go;
      const gOn = go && (t > 3 || Math.floor(t * 6) % 2 === 0);
      P.green.visible = gOn; P.greenOff.visible = !gOn;
      const ph = Math.floor(t * 8) % 2 === 0;
      P.bulbA.visible = ph; P.bulbB.visible = !ph;
    } else if (u.bulbs) {
      const ph = Math.floor(t * 6) % 2 === 0;
      u.bulbs.a.visible = ph; u.bulbs.b.visible = !ph;
    } else if (u.bills) {
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.45 + i / 6 + seed) % 1;
        const b = u.bills[i];
        b.position.set(-4.6 - ph * 3.5, 0.6 + Math.sin(ph * Math.PI) * 3.2 + ph * 1.5, Math.sin(ph * 9 + i) * 1.2 + (i % 3 - 1) * 0.6);
        b.rotation.set(ph * 9 + i, ph * 5, ph * 7);
      }
    } else if (u.flag) {
      u.flag.rotation.y = Math.sin(t * 3 + seed * 6) * 0.35;
      u.flag.rotation.x = Math.sin(t * 5.3 + seed * 3) * 0.06;
    } else if (u.screens) {
      u.screens.visible = Math.sin(t * 23 + seed) > -0.9;
    } else if (u.blimp) {
      obj.position.y += Math.sin(t * 0.7) * 0.01;
      obj.rotation.z = Math.sin(t * 0.5) * 0.03;
    }
  },
  billboards: [
    'SERIES A ✓', "WE'RE BASICALLY AGI (BETA)", 'NOW HIRING: 10x PROMPT ENGINEER', 'OUR MOAT: VIBES',
    'PRE-REVENUE, POST-AGI', 'TRAINING LOSS ↓   VIBES ↑', 'STEALTH MODE (PLEASE CLAP)', 'BURN RATE: YES',
    'AGI BY Q3 (WHICH YEAR? YES)', 'HUMANS WELCOME* (*FOR NOW)', 'THIS AD WAS WRITTEN BY OUR AI',
  ],
  billboardEvery: 70,
  billboardStyle: { bg: '#fff3d6', fg: '#3a1f4d', border: '#ff6b8b', frame: '#ff6b8b', postColor: '#e8ecf2', postH: 3.2 },
  hazards: [],
  enterLines: ['WELCOME TO THE GARAGE', 'TWO FOUNDERS. ONE GPU. LET\'S GO.'],
};
