// GARAGE STARTUP (verse 1, the tutorial): a sunny Silicon-Valley suburb. v3 (MK world scale): an MK-style start
// straight (grandstands of cheering cardboard-box people on the left, a pit building of startup team garages with a
// VC lounge on the right, sponsor-banner walls, feather flags, floodlight towers, a standings tower, the start gantry
// and the tutorial sign spanning the road), then a suburb with sidewalks, picket fences, street lamps, palms and
// shade trees, houses with garages (one with two founders and a glowing monitor), a VC money truck, a giant AGI
// hockey-stick whiteboard; far away: a skyline with a tower crane, THE RING (of compute), a 5G palm, cooling towers
// and a big "SILICON VALLEY (NOW 80% AGENTS)" sign on the hills.
//
// Also exports the merged-geometry prop kit (Kit / kitProp / canvasTex) that datacenter.js reuses: each prop is
// baked once into ONE mesh per material kind (colours live in vertex colours), so a whole house is ~4 draw calls.
import { THREE, toon, glow, G, mesh, textPanel, FONT, roundRect } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model } from '../models.js';
import { SPEED } from '../course.js';
import { surface } from '../textures.js';

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
// crowd bounce: aBlink.x = 3 / 4 → hop on the beat (two groups in counter-phase)
const BOUNCE = `
  if (aBlink.x > 2.5) {
    float bb = sin(uBeat * 3.14159);
    transformed.y += (aBlink.x < 3.5 ? bb * 0.28 : (1.0 - bb) * 0.22);
  }`;
function addBounce(sh) {
  sh.uniforms.uBeat = KIT_U.uBeat;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aBlink;\nuniform float uBeat;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>' + BOUNCE);
}
function pbrMaterial(doubleSide) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = (sh) => {
    addBounce(sh);
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
  const key = kind in PBR ? 'pbr' : kind in GLOWK ? 'glow' : kind;
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
    if (part === 'crowdA' || part === 'crowdB') { blink = part === 'crowdA' ? 3 : 4; part = ''; }
    const leaf = mat === 'leaf';
    const bucket = isStr ? (mat in PBR ? 'pbr' : isGlow ? 'glow' : mat) : mat.uuid;
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
    if (leaf) {
      // thin two-sided surface: add a back face (reversed winding, flipped normals) so it shares the single-sided material
      const b = g.clone();
      for (const name of ['position', 'normal', 'uv', 'color', 'aRM', 'aBlink']) {
        const a = b.attributes[name], it = a.itemSize, arr = a.array;
        for (let t = 0; t < a.count; t += 3) for (let c = 0; c < it; c++) { const i1 = (t + 1) * it + c, i2 = (t + 2) * it + c; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
      }
      const nr = b.attributes.normal.array;
      for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
      bk.geos.push(b);
    }
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
export function kitProp(key, build, post = null, KitClass = Kit) {
  let baked = KCACHE.get(key);
  if (!baked) {
    const k = new KitClass();
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
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide, ...opts });
    m.onBeforeCompile = addBounce;
    m.customProgramCacheKey = () => 'kitlit';
    KMATS.set(key, m);
  }
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
  const sub = k.mirror ? new MirrorKit() : new Kit();
  cardboardPerson(sub, p, v, '', opts);
  const bounce = part === 'crowdA' ? 3 : part === 'crowdB' ? 4 : 0;
  if (bounce) part = '';
  for (const [key, bk] of sub.b) {
    const nk = part + '|' + key.split('|')[1];
    let dst = k.b.get(nk);
    if (!dst) k.b.set(nk, (dst = { part, mat: bk.mat, geos: [] }));
    if (bounce) for (const g of bk.geos) { const a = g.attributes.aBlink; for (let i = 0; i < a.count; i++) a.setX(i, bounce); }
    dst.geos.push(...bk.geos);
  }
}


// ================================================================================================
// props (v3 world scale: kart+driver ≈ 1.86 tall. Targets from tools/V3_BRIEF.md)
// ================================================================================================
/** a crowd of cardboard spectators on a stepped stand. Built along x, crowd faces +z. ~10.3 tall at layout scale 1.35 */
function grandstand(v = 0) {
  const g = kitProp('grandstand' + v, (k) => {
    const L = 15;
    const seatCols = v ? [TEAL, SKY, '#ffffff', SUN] : [PINK, SUN, TEAL, SKY];
    // steel frame + concrete plinth
    k.rbox(L + 0.6, 0.5, 6.6, 0.12, 'matte', '#c9c4ba', [0, 0.25, -1.6]);
    for (let i = 0; i < 4; i++) {
      const y = 0.9 + i * 0.95, z = 0.4 - i * 1.25;
      k.box(L, 0.22, 1.25, 'metal', '#9aa3b0', [0, y, z]); // step
      k.box(L, 0.95, 0.12, 'matte', '#d8d4cc', [0, y - 0.47, z + 0.62]); // riser
      for (let s = 0; s < 8; s++) k.rbox(1.6, 0.3, 0.55, 0.1, 'plastic', seatCols[(s + i) % 4], [-L / 2 + 1 + s * 1.85, y + 0.26, z - 0.3]);
    }
    for (const sx of [-L / 2, L / 2]) {
      k.rbox(0.36, 7.6, 0.36, 0.1, 'metal', '#e8ecf2', [sx, 3.8, -4.6]);
      k.rbox(0.36, 6.7, 0.36, 0.1, 'metal', '#e8ecf2', [sx, 3.35, 1.6]);
      k.rbox(0.4, 4.2, 5.8, 0.12, 'paint', '#ddd8cc', [sx, 2.1, -1.6]); // side wall
    }
    // front railing (chrome) + sponsor kick-plate
    k.box(L, 0.1, 0.1, 'chrome', '#ffffff', [0, 1.75, 1.1]);
    for (let s = 0; s <= 10; s++) k.box(0.07, 1.0, 0.07, 'chrome', '#ffffff', [-L / 2 + s * L / 10, 1.25, 1.1]);
    k.box(L, 0.7, 0.1, 'paint', v ? SKY : PINK, [0, 0.95, 1.12]);
    // back wall + striped awning roof
    k.box(L, 4.8, 0.25, 'paint', '#ddd8cc', [0, 4.4, -4.5]);
    for (let s = 0; s < 10; s++) {
      const c = s % 2 ? '#ffffff' : v ? SKY : PINK;
      k.box(L / 10, 0.16, 6.6, 'paint', c, [-L / 2 + (s + 0.5) * L / 10, 7.3, -1.4], [0.22, 0, 0]);
      k.add(halfCylGeo(0.42, L / 10, 10), 'paint', c, [-L / 2 + (s + 0.5) * L / 10, 6.62, 1.85], [0, Math.PI / 2, Math.PI], [1, 1, 1]);
    }
    // pennant string along the awning edge
    for (let s = 0; s < 14; s++) k.cone(0.22, 0.5, 3, 'plastic', [PINK, SUN, TEAL, SKY][s % 4], [-L / 2 + 0.55 + s * (L - 1.1) / 13, 6.0, 2.12], [Math.PI, 0, 0]);
    // crowd (two bounce groups)
    let n = v * 11;
    for (let i = 0; i < 4; i++) {
      const y = 1.0 + i * 0.95, z = 0.25 - i * 1.25;
      for (let s = 0; s < 7; s++) {
        n++;
        const sign = (n * 5) % 7 === 0 ? (n * 3) % CROWD_SIGNS.length : -1;
        personIn(k, [-L / 2 + 1.2 + s * 2.1 + (i % 2) * 0.6, y, z], n * 3 + i, (s + i) % 2 ? 'crowdA' : 'crowdB', { sign, scale: 0.98 });
      }
    }
  });
  const p = textPanel(v ? 'SCALING IS ALL YOU NEED (AND SNACKS)' : 'GO TEAM HUMANITY!  (OR WHOEVER WINS)', { width: 13.5, height: 1.2, bg: INK, fg: SUN, border: null, borderW: 0, radius: 10 });
  p.position.set(0, 5.9, -4.35);
  g.add(p);
  return g;
}

/** the start/finish gantry: towers at ±15 (clear of the ±11.8 kerbs), beam 13.4–17.6 high */
function startGantry() {
  const W = 30, BY = 15.4;
  const g = kitProp('startGantry', (k) => {
    for (const sx of [-W / 2, W / 2]) {
      k.cyl(1.7, 1.9, 0.7, 32, 'metal', '#a9b0bc', [sx, 0.35, 0]);
      k.rbox(2.3, BY + 1, 2.3, 0.45, 'paint', '#e6e9f0', [sx, (BY + 1) / 2, 0]);
      // checker band on the towers
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) for (const f of [-1, 1]) {
        k.box(0.55, 0.55, 0.04, 'paint', (r + c) % 2 ? '#111111' : '#ffffff', [sx - 0.825 + c * 0.55, 11.2 + r * 0.55, f * 1.17]);
      }
      for (const y of [3.4, 9.6]) k.rbox(2.5, 0.35, 2.5, 0.1, 'chrome', '#ffffff', [sx, y, 0]);
      // balloon cluster
      const bc = [PINK, SUN, TEAL, SKY, '#ff8a3a', '#b98aff'];
      for (let b = 0; b < 9; b++) {
        const a = b * 2.4, r = 1.1 + (b % 3) * 0.4;
        const bx = sx + Math.cos(a) * r * (sx < 0 ? 1 : -1) * 0.8, bz = Math.sin(a) * r + 0.8, by = 3.2 + (b % 4) * 0.85;
        k.sphere(0.72, 20, 'paint', bc[b % bc.length], [bx, by, bz], [1, 1.18, 1]);
        k.tube([bx, by - 0.85, bz], [sx, 0.8, 1.2], 0.025, 4, 'matte', '#ffffff');
      }
    }
    // the beam: rounded panel + chrome rails
    k.rbox(W + 2.6, 4.2, 1.8, 0.5, 'paint', INK, [0, BY, 0]);
    k.box(W + 2.8, 0.3, 1.9, 'chrome', '#ffffff', [0, BY - 2.2, 0]);
    k.box(W + 2.8, 0.3, 1.9, 'chrome', '#ffffff', [0, BY + 2.2, 0]);
    // start light pods hanging under the beam
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.8;
      k.rbox(1.8, 3.0, 1.0, 0.3, 'paint', '#16161c', [x, BY - 4.1, 0.5]);
      k.box(0.22, 0.8, 0.22, 'metal', '#888', [x, BY - 2.3, 0.5]);
    }
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.8;
      k.sphere(0.5, 18, 'glow', '#ff2a2a', [x, BY - 3.4, 0.98], [1, 1, 0.5], 'red');
      k.sphere(0.5, 18, 'glow', '#3aff6a', [x, BY - 4.8, 0.98], [1, 1, 0.5], 'green');
      k.sphere(0.5, 18, 'rubber', '#2a1012', [x, BY - 3.4, 0.96], [1, 1, 0.45], 'redOff');
      k.sphere(0.5, 18, 'rubber', '#0f2a14', [x, BY - 4.8, 0.96], [1, 1, 0.45], 'greenOff');
    }
    // marquee bulbs around the beam
    for (let i = 0; i < 36; i++) {
      const x = -W / 2 - 0.8 + i * ((W + 1.6) / 35);
      k.sphere(0.15, 8, 'glow', '#fff2c0', [x, BY + 1.9, 0.94], I3, i % 2 ? 'bulbA' : 'bulbB');
      k.sphere(0.15, 8, 'glow', '#fff2c0', [x, BY - 1.9, 0.94], I3, i % 2 ? 'bulbB' : 'bulbA');
    }
    // checkered flags flying from the tower tops
    for (const sx of [-W / 2, W / 2]) {
      k.cyl(0.07, 0.07, 4.2, 8, 'chrome', '#fff', [sx, BY + 3.1, 0]);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) k.box(0.5, 0.5, 0.04, 'plastic', (i + j) % 2 ? '#111' : '#fafafa', [sx + (sx < 0 ? -1 : 1) * (0.3 + i * 0.5), BY + 4.9 - j * 0.5, 0]);
    }
  });
  const t = textPanel('P(DOOM) GRAND PRIX — START', { width: W - 3, height: 2.8, w: 2048, h: 212, pad: 18, bg: INK, fg: '#ffffff', border: SUN, borderW: 12, radius: 22, stroke: null });
  t.position.set(0, BY, 0.92);
  g.add(t);
  for (const sx of [-1, 1]) {
    const s = textPanel(['SPONSORED', 'BY YOUR', 'TRAINING', 'DATA'], { width: 2.0, height: 3.0, bg: SUN, fg: INK, border: null, borderW: 0, radius: 8, pad: 8 });
    s.position.set(sx * W / 2, 6.6, 1.18);
    g.add(s);
  }
  g.userData.startLights = g.userData.parts;
  return g;
}

/** tutorial sign spanning the road (posts at ±14.6) */
function tutorialSign() {
  const PX = 14.6, PW = 25, PH = 6.8, Y = 13.2;
  const g = kitProp('tutorial', (k) => {
    for (const sx of [-PX, PX]) {
      k.cyl(1.0, 1.2, 0.5, 24, 'metal', '#a9b0bc', [sx, 0.25, 0]);
      k.cyl(0.38, 0.38, Y - 3, 20, 'paint', '#3a2c55', [sx, (Y - 3) / 2 + 0.5, 0]);
      k.rbox(1.0, 0.36, 1.0, 0.1, 'chrome', '#fff', [sx, Y - 2.6, 0]);
      k.tube([sx, Y - 2.6, 0], [sx * 0.86, Y - PH / 2 + 0.2, -0.1], 0.18, 10, 'paint', '#3a2c55');
    }
    k.rbox(PW + 1.8, PH + 1.6, 0.7, 0.35, 'paint', '#3a2c55', [0, Y, -0.1]);
    for (let i = 0; i < 40; i++) {
      const x = -PW / 2 - 0.4 + i * ((PW + 0.8) / 39);
      k.sphere(0.18, 8, 'glow', '#fff4c8', [x, Y + PH / 2 + 0.45, 0.3], I3, i % 2 ? 'a' : 'b');
      k.sphere(0.18, 8, 'glow', '#fff4c8', [x, Y - PH / 2 - 0.45, 0.3], I3, i % 2 ? 'b' : 'a');
    }
    for (let i = 0; i < 11; i++) {
      const y = Y - PH / 2 - 0.2 + i * ((PH + 0.4) / 10);
      k.sphere(0.18, 8, 'glow', '#fff4c8', [-PW / 2 - 0.45, y, 0.3], I3, i % 2 ? 'a' : 'b');
      k.sphere(0.18, 8, 'glow', '#fff4c8', [PW / 2 + 0.45, y, 0.3], I3, i % 2 ? 'b' : 'a');
    }
  });
  const tex = canvasTex('gTut', 1024, 280, (x, W, H) => {
    x.fillStyle = '#ffe066'; roundRect(x, 6, 6, W - 12, H - 12, 30); x.fill();
    x.lineWidth = 12; x.strokeStyle = INK; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK;
    const L = [['HOLD THE WHEEL.', 70], ['DRIVE THROUGH THE GPUS.', 74], ['SAVE HUMANITY.', 70]];
    L.forEach(([l, sz], i) => { x.font = `700 ${sz}px ${FONT}`; x.fillStyle = i === 2 ? '#d81e4a' : INK; x.fillText(l, W / 2, 58 + i * 82); });
  });
  const pm = new THREE.MeshBasicMaterial({ map: tex });
  pm.color.setScalar(0.95);
  g.add(mesh(G.plane(PW, PH), pm, 0, Y, 0.27));
  const tag = textPanel('(tutorial, sponsored by the alignment team, budget: $12)', { width: 14, height: 0.8, bg: INK, fg: '#ffe066', border: null, borderW: 0, radius: 8 });
  tag.position.set(0, Y - PH / 2 - 1.3, 0.1);
  g.add(tag);
  g.userData.bulbs = g.userData.parts;
  return g;
}

/** Kit that mirrors everything across x (right-side houses keep their garage on the road side) */
class MirrorKit extends Kit {
  constructor() { super(); this.mirror = true; }
  add(geo, mat, color, p = O3, r = O3, s = I3, part = '') { return super.add(geo, mat, color, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], s, part); }
}
function house(variant, mirror = false) {
  const founders = variant === 'founders';
  const v = founders ? 0 : variant;
  const M = mirror ? -1 : 1;
  const two = !founders && v % 2 === 1; // two-storey variants
  const RH = two ? 8.2 : 4.8; // roof base
  const g = kitProp('house' + variant + (mirror ? 'M' : ''), (k) => {
    const wall = STUCCO[(v * 2 + 1) % STUCCO.length], roof = ROOF[v % ROOF.length];
    const trim = '#ffffff';
    const shut = ['#3a6a8a', '#6a8a4a', '#8a3a4a'][v % 3];
    // main house (left) + garage wing (right). front faces +z
    k.box(8.4, 0.5, 6.4, 'matte', '#cfc8bc', [-2.2, 0.25, -3.4]); // foundation
    k.box(8, RH - 0.4, 6, 'matte', wall, [-2.2, (RH + 0.4) / 2, -3.4]);
    k.add(prismGeo(), 'paint', roof, [-2.2, RH, -3.4], O3, [8.9, 2.8, 7.0]);
    k.box(8.9, 0.25, 0.3, 'paint', trim, [-2.2, RH, 0.05]); // fascia
    k.rbox(1.1, 2.4, 1.1, 0.08, 'matte', '#b8a99a', [-4.6, RH + 1.6, -4.4]); // chimney
    k.box(1.3, 0.2, 1.3, 'metal', '#666', [-4.6, RH + 2.8, -4.4]);
    // solar panels on the roof (front slope)
    for (let i = 0; i < 3; i++) k.box(1.9, 0.08, 1.5, 'glassy', '#1a2a5a', [-4.2 + i * 2.05, RH + 0.95, -1.6], [0.67, 0, 0]);
    // windows (+ an upper row on two-storey houses)
    const rows = two ? [2.9, 6.4] : [2.9];
    for (const wy of rows) for (const wx of wy > 4 ? [-4.8, -2.4, 0.0] : [-4.8, -2.4]) {
      k.box(1.7, 1.6, 0.12, 'glassy', '#2a4a6a', [wx, wy, -0.36]);
      k.box(1.95, 0.16, 0.25, 'paint', trim, [wx, wy - 0.85, -0.32]);
      k.box(1.95, 0.16, 0.25, 'paint', trim, [wx, wy + 0.85, -0.32]);
      k.box(0.12, 1.6, 0.2, 'paint', trim, [wx, wy, -0.32]);
      k.box(0.45, 1.75, 0.08, 'paint', shut, [wx - 1.15, wy, -0.36]);
      k.box(0.45, 1.75, 0.08, 'paint', shut, [wx + 1.15, wy, -0.36]);
    }
    if (two) k.box(8.2, 0.22, 0.4, 'paint', trim, [-2.2, 4.8, -0.3]); // floor band
    // front door + porch + porch light
    k.box(1.2, 2.3, 0.12, 'paint', ['#d8452b', '#2b6ad8', '#2a8a5a', SUN][v % 4], [-0.4, 1.65, -0.36]);
    k.sphere(0.08, 8, 'chrome', '#fff', [-0.0, 1.6, -0.27]);
    k.box(2.4, 0.3, 1.6, 'matte', '#cfc8bc', [-0.4, 0.15, 0.2]);
    k.sphere(0.13, 10, 'glowSoft', '#ffe2a0', [0.45, 2.55, -0.25]);
    // garage wing
    if (founders) {
      // hollow garage: side walls, back wall, ceiling (so you can see inside)
      k.box(0.5, 3.6, 6.4, 'matte', wall, [1.95, 2.2, -3.2]);
      k.box(0.5, 3.6, 6.4, 'matte', wall, [7.45, 2.2, -3.2]);
      k.box(6, 3.6, 0.4, 'matte', wall, [4.7, 2.2, -6.2]);
      k.box(6, 0.4, 6.4, 'matte', wall, [4.7, 3.8, -3.2]);
      k.box(6, 0.7, 0.4, 'matte', wall, [4.7, 3.45, -0.2]);
    } else k.box(6, 3.6, 6.4, 'matte', wall, [4.7, 2.2, -3.2]);
    k.add(prismGeo(), 'paint', roof, [4.7, 4.0, -3.2], [0, Math.PI / 2, 0], [7.0, 1.8, 6.6]);
    k.box(6.3, 0.25, 0.3, 'paint', trim, [4.7, 4.0, 0.05]);
    k.box(5.0, 0.2, 0.3, 'paint', trim, [4.7, 3.3, 0.06]);
    k.box(0.25, 3.2, 0.3, 'paint', trim, [2.1, 1.7, 0.06]);
    k.box(0.25, 3.2, 0.3, 'paint', trim, [7.3, 1.7, 0.06]);
    if (founders) {
      // door rolled up: dark interior, desk, monitors, rack, founders, pizza
      k.box(5.0, 3.0, 0.1, 'matte', '#1a1620', [4.7, 1.9, -5.95]);
      k.box(0.1, 3.0, 5.6, 'matte', '#2a2430', [2.25, 1.9, -3.1]);
      k.box(0.1, 3.0, 5.6, 'matte', '#2a2430', [7.15, 1.9, -3.1]);
      k.box(4.8, 0.1, 5.8, 'matte', '#2a2430', [4.7, 3.55, -3.1]);
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
      for (let i = 0; i < 10; i++) k.sphere(0.1, 8, 'glow', '#ffcf7a', [2.6 + i * 0.47, 2.95 - Math.sin(i / 9 * Math.PI) * 0.35, -0.6]);
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
    for (const [bx, bz, br] of [[-6.9, -0.4, 0.9], [-7.2, 1.1, 0.7], [1.3, 0.9, 0.6]]) k.sphere(br, 14, 'matte', '#4f9444', [bx, br * 0.8, bz], [1, 0.85, 1]);
    if (!founders && v % 2 === 0) k.box(0.07, 1.2, 0.07, 'paint', '#ffffff', [-3.2, 0.5, 2.15]);
    if (!founders) {
      const cc = ['#d8452b', '#2b6ad8', '#f2f2f2', '#2a2a30'][v % 4];
      k.rbox(2.2, 1.0, 4.4, 0.4, 'paint', cc, [4.7, 0.95, 3.6]);
      k.rbox(1.9, 0.8, 2.4, 0.35, 'paint', cc, [4.7, 1.7, 3.3]);
      k.box(1.95, 0.55, 2.0, 'glassy', '#1a2230', [4.7, 1.75, 3.3]);
      for (const [wx, wz] of [[-1.05, 2.2], [1.05, 2.2], [-1.05, 5.0], [1.05, 5.0]]) k.cyl(0.42, 0.42, 0.3, 16, 'rubber', '#1a1a1e', [4.7 + wx, 0.45, wz], [0, 0, Math.PI / 2]);
    } else {
      for (let i = 0; i < 6; i++) k.rbox(1.1, 0.8, 1.1, 0.05, 'matte', i % 2 ? '#3fa84a' : '#2a8a3a', [8.6 + ((i / 3) | 0) * 0.3, 0.45 + ((i / 3) | 0) * 0.82, 1.2 + (i % 3) * 1.15]);
    }
  }, null, mirror ? MirrorKit : Kit);
  if (founders) {
    const s = textPanel(['HQ', '(do not tell mom)'], { width: 3.4, height: 1.3, bg: '#ffe066', fg: INK, border: INK, borderW: 10, radius: 14 });
    s.position.set(4.7 * M, 3.65, 0.25);
    g.add(s);
    const n = textPanel('AGI: 2 WEEKS', { width: 1.0, height: 0.36, bg: '#ffffff', fg: '#d81e4a', border: null, borderW: 0, radius: 4 });
    n.position.set(3.0 * M, 2.15, -5.75);
    g.add(n);
    g.userData.screens = g.userData.parts.screens;
  } else if (variant % 2 === 0) {
    const yard = ['THIS HOUSE BELIEVES\nIN SCALING', 'NO SOLICITING\n(except agents)', 'BEWARE OF DOG\n(it is a robot)', 'PROUD PARENT OF\nA 7B MODEL'][variant % 4];
    const s = textPanel(yard.split('\n'), { width: 2.2, height: 1.2, bg: '#ffffff', fg: INK, border: '#2b6ad8', borderW: 10, radius: 10 });
    s.position.set(-3.2 * M, 1.25, 2.2);
    s.rotation.y = 0.25 * M;
    g.add(s);
  }
  return g;
}

// ---- palm tree ----
function frondGeo() {
  return cachedGeo('frond', () => {
    const g = new THREE.PlaneGeometry(1, 1, 2, 10);
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
/** palms: S ≈ 12, T ≈ 16, G (giant, far layer) ≈ 20 */
function palm(size) {
  return kitProp('palm' + size, (k) => {
    const H = size === 'G' ? 18.5 : size === 'T' ? 14.6 : 10.8;
    const fs = size === 'G' ? 1.45 : size === 'T' ? 1.25 : 1.08;
    const N = 11;
    let x = 0, prev = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const u = (i + 1) / N;
      x = Math.sin(u * 1.4) * H * 0.1;
      const cur = [x, u * H, 0];
      const r = (0.46 - u * 0.15) * (H / 13);
      k.tube(prev, cur, r, 12, 'matte', i % 2 ? '#8a6a4a' : '#7a5a3e');
      k.cyl(r + 0.06, r + 0.06, 0.18, 12, 'matte', '#5e4430', cur);
      prev = cur;
    }
    const top = prev;
    k.cone(0.9 * fs, 1.6 * fs, 12, 'matte', '#6a5032', [top[0], top[1] - 0.5 * fs, 0], [Math.PI, 0, 0]);
    k.sphere(0.5 * fs, 12, 'matte', '#5a7a32', [top[0], top[1] + 0.1, 0]);
    const n = 13;
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + (f % 2) * 0.2;
      const pitch = f % 2 ? 0.25 : -0.05;
      k.add(frondGeo(), 'leaf', f % 3 ? '#4f8f36' : '#3f7a2e', [top[0], top[1] + 0.1, 0], [0, a, pitch], [fs, fs, fs]);
    }
    for (let c = 0; c < 3; c++) k.sphere(0.26 * fs, 12, 'paint', '#5a3a1a', [top[0] + Math.cos(c * 2.1) * 0.45 * fs, top[1] - 0.3 * fs, Math.sin(c * 2.1) * 0.45 * fs]);
    // planter ring at the base
    k.cyl(1.1 * fs, 1.2 * fs, 0.4, 20, 'matte', '#cfc8bc', [0, 0.1, 0]);
  });
}

/** round suburban shade tree ≈ 11–13 tall (chunky clustered canopy) */
function shadeTree(v) {
  return kitProp('tree' + v, (k) => {
    const r = makeRngLocal(71 + v * 13);
    const H = v ? 6.2 : 5.2;
    k.cyl(0.42, 0.62, H, 14, 'wood', '#6e5038', [0, H / 2, 0]);
    k.tube([0, H * 0.6, 0], [1.6, H + 1.2, 0.4], 0.24, 10, 'wood', '#6e5038');
    k.tube([0, H * 0.7, 0], [-1.4, H + 1.4, -0.5], 0.22, 10, 'wood', '#6e5038');
    const greens = v ? ['#5a9a3a', '#4a8a32', '#6aa848'] : ['#3f8a46', '#4f9a4e', '#2f7a3c'];
    const blobs = [[0, H + 3.4, 0, 3.6], [2.3, H + 2.4, 0.6, 2.7], [-2.2, H + 2.6, -0.4, 2.8], [0.4, H + 2.0, 2.2, 2.5], [-0.3, H + 2.2, -2.2, 2.6], [0.6, H + 5.4, -0.2, 2.4]];
    blobs.forEach(([x, y, z, rr], i) => k.sphere(rr * (0.92 + r() * 0.16), 20, 'matte', greens[i % 3], [x, y, z], [1, 0.88, 1]));
    k.cyl(1.2, 1.3, 0.25, 18, 'matte', '#5a4030', [0, 0.1, 0]);
  });
}

function mailbox(v) {
  const g = kitProp('mailbox' + (v % 3), (k) => {
    k.box(0.22, 1.3, 0.22, 'wood', '#8a6a4a', [0, 0.65, 0]);
    const c = ['#2a3a8a', '#d8452b', '#2a2a30'][v % 3];
    k.box(0.62, 0.45, 1.1, 'paint', c, [0, 1.5, 0]);
    k.add(halfCylGeo(0.31, 1.1, 14), 'paint', c, [0, 1.72, 0]);
    k.box(0.06, 0.6, 0.12, 'paint', '#ff2a2a', [0.34, 1.75, -0.25], [0, 0, 0], 'flag');
    k.box(0.06, 0.24, 0.4, 'paint', '#ff2a2a', [0.34, 2.0, -0.05], [0, 0, 0], 'flag');
  });
  if (v % 3 === 0) {
    const lbl = textPanel(['INBOX: 4,000,000', '(ALL AGENTS)'], { width: 1.15, height: 0.45, bg: '#ffffff', fg: INK, border: null, borderW: 0, radius: 6 });
    lbl.position.set(0, 1.5, 0.57);
    g.add(lbl);
  }
  return g;
}

function streetTex() {
  return canvasTex('gStreet', 512, 256, (x) => {
    const blade = (y, t) => {
      x.fillStyle = '#1f7a3a'; roundRect(x, 6, y, 500, 84, 10); x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 6; roundRect(x, 14, y + 8, 484, 68, 8); x.stroke();
      x.fillStyle = '#ffffff'; x.font = `700 54px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 256, y + 44);
    };
    blade(4, 'PIVOT AVE');
    blade(96, 'HYPE ST');
    x.fillStyle = '#2b1840'; x.font = `700 30px ${FONT}`; x.textAlign = 'center';
    x.fillText('DEAD', 128, 206); x.fillText('END?', 128, 238);
  });
}
function streetSign() {
  return kitProp('streetSign', (k) => {
    const m = litMat(streetTex());
    k.cyl(0.1, 0.1, 4.8, 12, 'metal', '#9aa0aa', [0, 2.4, 0]);
    k.box(3.0, 0.62, 0.06, 'paint', '#1f7a3a', [0, 4.5, 0]);
    k.box(3.0, 0.62, 0.06, 'paint', '#1f7a3a', [0, 3.8, 0], [0, Math.PI / 2, 0]);
    k.add(atlasPlane(2.9, 0.52, 0, 0.64, 1, 0.98), m, '#ffffff', [0, 4.5, 0.04]);
    k.add(atlasPlane(2.9, 0.52, 0, 0.29, 1, 0.63), m, '#ffffff', [0.04, 3.8, 0], [0, Math.PI / 2, 0]);
    k.box(0.85, 0.85, 0.06, 'paint', '#ffffff', [0, 2.7, 0.06], [0, 0, Math.PI / 4]);
    k.box(0.78, 0.78, 0.07, 'paint', '#e8b020', [0, 2.7, 0.07], [0, 0, Math.PI / 4]);
    k.add(atlasPlane(0.7, 0.56, 0.12, 0.02, 0.38, 0.26), m, '#ffffff', [0, 2.7, 0.12]);
  });
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
      k.cyl(0.75, 0.75, 0.55, 24, 'rubber', '#1a1a1e', [wx, 0.75, wz], [Math.PI / 2, 0, 0]);
      k.cyl(0.42, 0.42, 0.58, 16, 'chrome', '#ffffff', [wx, 0.75, wz], [Math.PI / 2, 0, 0]);
    }
    k.box(0.12, 3.0, 1.4, 'paint', body, [-4.3, 2.6, 2.1], [0, -1.2, 0]);
    k.box(0.12, 3.0, 1.4, 'paint', body, [-4.3, 2.6, -2.1], [0, 1.2, 0]);
    for (let i = 0; i < 9; i++) k.box(0.9, 0.3, 0.5, 'matte', '#7fc86a', [-4.6 - (i % 3) * 0.5, 0.15 + ((i / 3) | 0) * 0.3, -0.7 + (i % 3) * 0.6], [0, i * 0.4, 0]);
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
      k.rbox(0.3, 6.6, 0.3, 0.08, 'metal', '#a9b0bc', [sx, 3.3, -0.2]);
      k.box(1.6, 0.18, 0.25, 'metal', '#a9b0bc', [sx, 0.35, -0.2], [0, Math.PI / 2, 0]);
      for (const dz of [-0.7, 0.7]) k.cyl(0.18, 0.18, 0.14, 14, 'rubber', '#222', [sx, 0.18, -0.2 + dz], [0, 0, Math.PI / 2]);
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
  const g = kitProp('computeStand', (k) => {
    k.box(3.2, 1.2, 1.3, 'wood', '#d8b88a', [0, 0.6, 0]);
    k.box(3.4, 0.12, 1.5, 'wood', '#b8946a', [0, 1.25, 0]);
    for (const sx of [-1.5, 1.5]) k.box(0.14, 2.4, 0.14, 'wood', '#b8946a', [sx, 2.3, -0.5]);
    k.box(3.5, 0.12, 1.8, 'paint', '#ffd23f', [0, 3.5, -0.2], [0.25, 0, 0]);
    for (let s = 0; s < 7; s++) k.box(0.5, 0.13, 1.82, 'paint', s % 2 ? '#ffffff' : PINK, [-1.5 + s * 0.5, 3.52, -0.2], [0.25, 0, 0]);
    for (let i = 0; i < 3; i++) k.rbox(0.6, 0.35, 0.45, 0.04, 'paint', '#2a2a30', [-1 + i * 0.7, 1.5, 0.1]);
    for (let i = 0; i < 3; i++) k.box(0.4, 0.05, 0.3, 'glow', '#5dffb0', [-1 + i * 0.7, 1.69, 0.1]);
    k.cyl(0.25, 0.25, 0.6, 14, 'glassy', '#ffe060', [1.2, 1.6, 0.1]);
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
    for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) k.tube([lx, 0, lz], [lx * 0.6, 22, lz * 0.6], 0.45, 10, 'metal', '#a9b0bc');
    for (const y of [8, 15]) {
      const s = 1 - y / 22 * 0.4;
      k.box(8 * s, 0.4, 0.4, 'metal', '#a9b0bc', [0, y, 4 * s]);
      k.box(8 * s, 0.4, 0.4, 'metal', '#a9b0bc', [0, y, -4 * s]);
      k.box(0.4, 0.4, 8 * s, 'metal', '#a9b0bc', [4 * s, y, 0]);
      k.box(0.4, 0.4, 8 * s, 'metal', '#a9b0bc', [-4 * s, y, 0]);
    }
    k.cyl(5.5, 5.5, 0.5, 40, 'metal', '#c8ccd4', [0, 22.2, 0]);
    k.sphere(5.5, 40, 'paint', '#7ac8e8', [0, 22.5, 0], [1, 0.35, 1]);
    k.add(G.cone(5.9, 3.0, 40), 'paint', '#5a6a8a', [0, 31.6, 0]);
    k.sphere(0.5, 10, 'glow', '#ff3a3a', [0, 33.4, 0], I3, 'ledA');
  });
  const m = new THREE.MeshPhysicalMaterial({
    map: canvasTex('gTower', 1024, 256, (x, W, H) => {
      x.fillStyle = '#7ac8e8'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#ffffff'; x.font = `700 120px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('HYPE', W * 0.25, H / 2); x.fillText('HYPE', W * 0.75, H / 2);
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 16, W, 8); x.fillRect(0, H - 24, W, 8);
    }), roughness: 0.3, clearcoat: 1,
  });
  const t = mesh(cachedGeo('towerTank', () => new THREE.CylinderGeometry(5.5, 5.5, 8, 40)), m, 0, 26.5, 0);
  t.rotation.y = -Math.PI / 2;
  g.add(t);
  return g;
}

function blimp() {
  const g = kitProp('blimp', (k) => {
    k.sphere(4, 40, 'paint', '#f2f2f6', [0, 0, 0], [3.4, 1, 1]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      k.rbox(3.2, 0.2, 2.6, 0.08, 'paint', PINK, [11.8, Math.sin(a) * 2.0, Math.cos(a) * 2.0], [a, 0, 0]);
    }
    k.rbox(4.2, 1.3, 1.6, 0.5, 'paint', '#3a2c55', [0, -4.3, 0]);
    k.box(3.2, 0.5, 1.62, 'glassy', '#1a2230', [0, -4.2, 0]);
    k.cyl(0.35, 0.35, 0.8, 12, 'metal', '#888', [-2.6, -4.3, 0], [0, 0, Math.PI / 2]);
  });
  for (const side of [1, -1]) {
    const s = textPanel(['P(DOOM) AIRSHIP', 'AGI ARRIVING SOON (PROBABLY)'], { width: 18, height: 4.0, bg: '#3a2c55', fg: '#ffffff', border: SUN, borderW: 10, radius: 30 });
    s.position.set(0, 0.6, 4.05 * side);
    if (side < 0) s.rotation.y = Math.PI;
    g.add(s);
  }
  g.userData.blimp = true;
  return g;
}

function shrub() {
  const g = new THREE.Group();
  g.add(model('shrub_04', { size: 4.2 }));
  return g;
}

function flagPole(c) {
  const g = kitProp('flag' + c, (k) => {
    k.cyl(0.1, 0.13, 11, 12, 'chrome', '#fff', [0, 5.5, 0]);
    k.sphere(0.22, 12, 'chrome', '#fff', [0, 11.1, 0]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) k.box(0.6, 0.6, 0.04, 'plastic', (i + j) % 2 ? '#111' : '#fafafa', [0.3 + i * 0.6, -0.3 - j * 0.6, 0], O3, 'flag');
  });
  g.userData.flag = g.userData.parts.flag;
  g.userData.flag.position.set(0.05, 10.8, 0);
  return g;
}

// ---- trackside: sidewalk + white picket fence (suburb), concrete wall with sponsor banners (start straight) ----
const BANNERS = [
  ['P(DOOM) GRAND PRIX', '#ffffff', INK], ['POWERED BY VIBES', SUN, INK], ['GPU MART · 0% IN STOCK', '#ffffff', '#d81e4a'],
  ['ATTENTION IS ALL YOU NEED', TEAL, INK], ['ALIGNMENT? NEVER HEARD OF HER', PINK, '#ffffff'], ['TOKENS · TOKENS · TOKENS', INK, SUN],
  ['SERIES A ✓  SERIES B ✓  SAFETY ✗', '#ffffff', INK], ['FASTER THAN YOUR BENCHMARKS', SKY, '#ffffff'],
];
function bannerAtlas() {
  return canvasTex('gBanners', 2048, 1024, (x, W) => {
    BANNERS.forEach(([t, bg, fg], i) => {
      const y = i * 128;
      x.fillStyle = bg; x.fillRect(0, y, W, 128);
      x.fillStyle = fg; x.fillRect(0, y, W, 8); x.fillRect(0, y + 120, W, 8);
      x.font = `700 84px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(t, W / 2, y + 66);
    });
  });
}
const SEG = 14.6; // segment length (layout spacing 14 + a little overlap)
function walkFence(mirror) {
  // built for the LEFT side of the road (road towards +x); right side = mirrored. local x=0 sits at |x| = 12.4
  return kitProp('walk' + (mirror ? 'R' : 'L'), (k) => {
    k.add(tiledBox(3.3, 0.6, SEG, 11), surface('tiles', { tint: '#f6f2ea', scale: 1 }), '#ffffff', [-1.15, 0.0, 0]); // sidewalk slab (top at +0.3)
    k.box(0.35, 0.65, SEG, 'matte', '#bdb6ab', [0.42, 0.02, 0]); // kerb stone
    // picket fence at x = -3.1
    const fx = -3.05;
    for (let i = 0; i < 5; i++) {
      const z = -SEG / 2 + 0.2 + i * ((SEG - 0.4) / 4);
      k.rbox(0.26, 2.1, 0.26, 0.05, 'paint', '#ffffff', [fx, 0.75, z]);
      k.cone(0.2, 0.3, 4, 'paint', '#ffffff', [fx, 1.95, z], [0, Math.PI / 4, 0]);
    }
    for (const y of [0.75, 1.4]) k.box(0.08, 0.16, SEG, 'paint', '#f4f2ec', [fx - 0.08, y, 0]);
    const n = 28;
    for (let i = 0; i < n; i++) {
      const z = -SEG / 2 + (i + 0.5) * (SEG / n);
      k.box(0.06, 1.45, 0.3, 'paint', '#ffffff', [fx + 0.02, 0.98, z]);
      k.add(prismGeo(), 'paint', '#ffffff', [fx + 0.02, 1.7, z], [0, Math.PI / 2, 0], [0.3, 0.2, 0.06]);
    }
    // a strip of lawn edging + flowers along the fence
    for (let i = 0; i < 6; i++) {
      const z = -SEG / 2 + 1.2 + i * 2.4;
      k.sphere(0.42, 10, 'matte', '#4a8a42', [fx - 0.6, 0.35, z], [1.2, 0.8, 1.4]);
      k.sphere(0.12, 8, 'plastic', [PINK, SUN, '#ffffff'][i % 3], [fx - 0.5, 0.7, z + 0.2]);
    }
  }, null, mirror ? MirrorKit : Kit);
}
function trackWall(mirror) {
  // concrete wall with a sponsor banner (start straight). road towards +x for the left version.
  const g = kitProp('wall' + (mirror ? 'R' : 'L'), (k) => {
    k.rbox(0.9, 1.2, SEG, 0.12, 'matte', '#e6e2da', [0, 0.45, 0]);
    for (let i = 0; i < 8; i++) k.box(0.06, 0.32, SEG / 8, 'paint', i % 2 ? '#d81e3a' : '#ffffff', [0.47, 0.2, -SEG / 2 + (i + 0.5) * SEG / 8]);
    // banner frame on posts
    for (let i = 0; i < 4; i++) k.box(0.12, 1.3, 0.12, 'metal', '#9aa3b0', [0.1, 1.6, -SEG / 2 + 0.6 + i * ((SEG - 1.2) / 3)]);
    k.box(0.08, 1.08, SEG - 0.4, 'paint', INK, [0.04, 1.75, 0]);
    // catch fence above (thin posts + top rail)
    for (let i = 0; i < 4; i++) k.box(0.1, 2.4, 0.1, 'metal', '#b8c0cc', [-0.25, 3.3, -SEG / 2 + 0.6 + i * ((SEG - 1.2) / 3)]);
    k.box(0.08, 0.08, SEG, 'metal', '#b8c0cc', [-0.25, 4.5, 0]);
  }, null, mirror ? MirrorKit : Kit);
  return g;
}
const _bannerMats = new Map();
function wallBanner(g, idx, mirror) {
  let m = _bannerMats.get(idx);
  const v1 = 1 - idx / 8, v0 = v1 - 1 / 8;
  const geo = atlasPlane(SEG - 0.6, (SEG - 0.6) / 16, 0, v0, 1, v1);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: bannerAtlas(), roughness: 0.6 }); _bannerMats.set(idx, m); }
  const p = new THREE.Mesh(geo, m);
  p.position.set(mirror ? -0.1 : 0.1, 1.75, 0);
  p.rotation.y = mirror ? -Math.PI / 2 : Math.PI / 2;
  g.add(p);
}
function wallProp(mirror, idx) {
  const g = trackWall(mirror);
  wallBanner(g, idx, mirror);
  return g;
}

/** suburban street lamp ≈ 11 tall, arm reaching over the road (+x for the left side version) */
function streetLamp(mirror) {
  return kitProp('lamp' + (mirror ? 'R' : 'L'), (k) => {
    const pc = '#2f4a5a';
    k.cyl(0.42, 0.52, 0.9, 20, 'paint', pc, [0, 0.45, 0]);
    k.cyl(0.2, 0.26, 9.6, 16, 'paint', pc, [0, 5.4, 0]);
    for (const y of [1.0, 3.2, 9.2]) k.cyl(0.3, 0.3, 0.18, 16, 'chrome', '#ffffff', [0, y, 0]);
    let prev = [0, 10.1, 0];
    for (let i = 1; i <= 6; i++) {
      const a = (i / 6) * Math.PI / 2;
      const cur = [Math.sin(a) * 1.4 + (i / 6) * 1.8, 10.1 + (1 - Math.cos(a)) * 0.0 + Math.sin(a * 2) * 0.55, 0];
      k.tube(prev, cur, 0.13, 10, 'paint', pc);
      prev = cur;
    }
    k.rbox(1.7, 0.42, 0.85, 0.18, 'paint', pc, [prev[0] + 0.5, prev[1] - 0.1, 0]);
    k.box(1.3, 0.08, 0.6, 'glowSoft', '#fff1c8', [prev[0] + 0.5, prev[1] - 0.33, 0]);
    // festive pole banners
    k.box(0.06, 2.6, 1.1, 'paint', PINK, [0.26, 7.0, 0.55]);
    k.box(0.06, 2.6, 1.1, 'paint', SUN, [0.26, 7.0, -0.55]);
    k.box(0.08, 0.08, 2.3, 'metal', '#c8ccd4', [0.26, 8.3, 0]);
  }, null, mirror ? MirrorKit : Kit);
}

/** red/white tyre stack barrier (outside of the first corner) */
function tyreWall(mirror) {
  return kitProp('tyres' + (mirror ? 'R' : 'L'), (k) => {
    const n = 13;
    for (let r = 0; r < 3; r++) for (let i = 0; i < n; i++) {
      const z = -SEG / 2 + (i + 0.5) * (SEG / n) + (r % 2) * 0.28;
      if (z > SEG / 2) continue;
      k.add(G.torus(0.42, 0.2, 18), 'rubber', '#1d1d22', [0, 0.22 + r * 0.42, z], [Math.PI / 2, 0, 0]);
      k.cyl(0.6, 0.6, 0.06, 18, 'paint', (i + r) % 2 ? '#d81e3a' : '#ffffff', [0, 0.42 + r * 0.42, z]);
    }
    k.box(0.9, 0.05, SEG, 'matte', '#2a2a30', [0, 0.02, 0]);
    // sidewalk behind (keeps the street feel)
    k.box(3.0, 0.6, SEG, 'matte', '#d9d3c9', [-2.3, 0.0, 0]);
  }, null, mirror ? MirrorKit : Kit);
}

/** a row of cardboard spectators on a little riser with a rail (outside of corners) */
function crowdLine(v) {
  return kitProp('crowd' + v, (k) => {
    k.rbox(12.5, 0.6, 3.2, 0.12, 'matte', '#c9c4ba', [0, 0.3, -0.6]);
    k.rbox(12.5, 0.5, 1.6, 0.12, 'matte', '#d8d4cc', [0, 0.85, -1.4]);
    k.box(12.5, 0.1, 0.1, 'chrome', '#fff', [0, 1.75, 0.9]);
    for (let s = 0; s <= 8; s++) k.box(0.08, 1.2, 0.08, 'chrome', '#fff', [-6.2 + s * 1.55, 1.15, 0.9]);
    for (let i = 0; i < 6; i++) personIn(k, [-5.4 + i * 2.15, 0.6, 0.1], v * 7 + i, i % 2 ? 'crowdA' : 'crowdB', { sign: (i + v) % 3 === 0 ? (i + v * 3) % CROWD_SIGNS.length : -1, scale: 1.3 });
    for (let i = 0; i < 5; i++) personIn(k, [-4.4 + i * 2.2, 1.1, -1.4], v * 5 + i + 3, i % 2 ? 'crowdB' : 'crowdA', { sign: (i + v) % 4 === 1 ? (i * 5 + v) % CROWD_SIGNS.length : -1, scale: 1.3 });
  });
}

/** feather flag ≈ 7.5 tall */
function featherFlag(c) {
  const g = kitProp('feather' + c, (k) => {
    k.cyl(0.6, 0.7, 0.3, 16, 'matte', '#3a3a44', [0, 0.15, 0]);
    k.cyl(0.07, 0.07, 7.4, 8, 'metal', '#c8ccd4', [0, 3.8, 0]);
    const col = [PINK, SUN, TEAL, SKY][c];
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(1.5, 0); sh.quadraticCurveTo(1.7, 4.8, 0.6, 5.6); sh.quadraticCurveTo(0.2, 5.7, 0, 5.5); sh.closePath();
    const geo = cachedGeo('featherGeo', () => new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 10 }));
    k.add(geo, 'plastic', col, [0.08, -5.6, 0], O3, I3, 'flag');
    k.add(cachedGeo('featherStripe', () => new THREE.BoxGeometry(0.25, 5.2, 0.06)), 'plastic', '#ffffff', [0.3, -2.9, 0.0], O3, I3, 'flag');
  });
  g.userData.flag = g.userData.parts.flag;
  g.userData.flag.position.set(0, 7.4, 0);
  return g;
}

/** stadium floodlight tower ≈ 28 tall */
function lightTower() {
  return kitProp('lightTower', (k) => {
    k.cyl(1.4, 1.7, 1.2, 20, 'matte', '#c9c4ba', [0, 0.6, 0]);
    k.cyl(0.42, 0.62, 24, 20, 'metal', '#d8dce4', [0, 12.6, 0]);
    for (let y = 3; y < 24; y += 1.4) k.box(0.36, 0.06, 0.06, 'metal', '#9aa3b0', [0, y, 0.55]); // ladder rungs
    k.rbox(9.2, 4.4, 0.6, 0.15, 'metal', '#9aa3b0', [0, 25.8, 0.2]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const x = -3.3 + c * 2.2, y = 24.8 + r * 2.0;
      k.cyl(0.88, 0.95, 0.5, 20, 'paint', '#e8ecf2', [x, y, 0.65], [Math.PI / 2, 0, 0]);
      k.cyl(0.72, 0.72, 0.06, 20, 'glowHot', '#fff6e0', [x, y, 0.92], [Math.PI / 2, 0, 0]);
    }
    k.box(9.6, 0.25, 1.4, 'metal', '#9aa3b0', [0, 23.4, 0.4]);
  });
}

/** timing tower with the live standings (spoiler: humanity is last) ≈ 27 tall */
function leaderTex() {
  return canvasTex('gLeader', 512, 1536, (x, W, H) => {
    x.fillStyle = '#10142a'; x.fillRect(0, 0, W, H);
    x.fillStyle = SUN; x.font = `700 72px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('STANDINGS', W / 2, 74);
    const rows = [['1', 'AGI-9000', '#ffffff'], ['2', 'AGI-9000 (2)', '#ffffff'], ['3', 'YOU', SUN], ['4', 'THE INTERN', '#ffffff'], ['5', 'VIBES', '#ffffff'],
      ['6', 'BENCHMARKS', '#ffffff'], ['7', 'SAFETY TEAM', '#ff8a9a'], ['8', 'HUMANITY', '#ff8a9a']];
    rows.forEach(([n, t, c], i) => {
      const y = 190 + i * 150;
      x.fillStyle = i % 2 ? '#1a2040' : '#222a52'; x.fillRect(20, y - 64, W - 40, 128);
      x.fillStyle = i === 2 ? SUN : PINK; x.fillRect(20, y - 64, 92, 128);
      x.fillStyle = INK; x.font = `700 74px ${FONT}`; x.fillText(n, 66, y + 4);
      x.fillStyle = c; x.font = `700 ${t.length > 9 ? 46 : 58}px ${FONT}`; x.textAlign = 'left'; x.fillText(t, 132, y + 4); x.textAlign = 'center';
    });
    x.fillStyle = '#ff8a9a'; x.font = `600 40px ${FONT}`; x.fillText('(DNF)', W - 90, 190 + 6 * 150 + 46); x.fillText('(DNS)', W - 90, 190 + 7 * 150 + 46);
  });
}
function leaderTower() {
  const g = kitProp('leader', (k) => {
    k.rbox(7.4, 1.0, 4.4, 0.3, 'matte', '#c9c4ba', [0, 0.5, 0]);
    k.rbox(6.0, 25, 3.0, 0.6, 'paint', '#f2f2f6', [0, 13, 0]);
    k.rbox(5.2, 0.6, 3.2, 0.2, 'paint', PINK, [0, 25.7, 0]);
    k.rbox(6.6, 3.0, 3.4, 0.6, 'paint', SKY, [0, 27.6, 0]);
    k.box(5.0, 20.4, 0.1, 'matte', '#0a0c18', [0, 13.2, 1.5]);
    for (let i = 0; i < 10; i++) k.sphere(0.16, 8, 'glow', '#fff2c0', [-2.6 + (i % 2) * 5.2, 3.2 + ((i / 2) | 0) * 5, 1.55], I3, 'ledB');
    k.sphere(0.45, 12, 'glow', '#ff3a3a', [0, 29.4, 0], I3, 'ledA');
  });
  const scr = new THREE.MeshBasicMaterial({ map: leaderTex() });
  scr.color.setScalar(1.05);
  g.add(mesh(G.plane(4.8, 14.4), scr, 0, 13.6, 1.56));
  const t = textPanel('P(DOOM) GP', { width: 6.2, height: 2.2, bg: SKY, fg: '#ffffff', border: null, borderW: 0, radius: 16, stroke: INK, strokeW: 10 });
  t.position.set(0, 27.6, 1.72);
  g.add(t);
  return g;
}

/** pit building: four huge team garages (doors ≈ 7.6 tall) + a glass VC lounge upstairs. 30 long, ≈ 17 tall */
const TEAMS = [['SCALING GP', '#2a6ad8'], ['VIBES RACING', '#d8452b'], ['STEALTH MODE', '#3a3a48'], ['PIVOT MOTORSPORT', '#2a8a5a'],
  ['SEED ROUND', '#ff6b8b'], ['AGI BY FRIDAY', '#7a3ad8'], ['OPEN-ISH', '#2fb6a6'], ['TEAM P(DOOM)', '#e8a020']];
function doorAtlas() {
  return canvasTex('gDoors', 1024, 640, (x) => {
    TEAMS.forEach(([name, col], i) => {
      const X = (i % 4) * 256, Y = ((i / 4) | 0) * 320;
      x.fillStyle = col; x.fillRect(X, Y, 256, 320);
      for (let r = 0; r < 320; r += 14) { x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(X, Y + r, 256, 3); x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(X, Y + r + 3, 256, 2); }
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(X, Y, 6, 320); x.fillRect(X + 250, Y, 6, 320);
      // team badge
      x.fillStyle = '#ffffff'; roundRect(x, X + 28, Y + 70, 200, 120, 24); x.fill();
      x.fillStyle = col; x.font = `700 ${name.length > 11 ? 26 : 32}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const w = name.split(' ');
      if (w.length > 1) { x.fillText(w[0], X + 128, Y + 110); x.fillText(w.slice(1).join(' '), X + 128, Y + 150); } else x.fillText(name, X + 128, Y + 130);
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = `700 54px ${FONT}`; x.fillText(String(i + 1).padStart(2, '0'), X + 128, Y + 250);
    });
  });
}
let _doorMat = null;
function doorMat() { return _doorMat || (_doorMat = new THREE.MeshStandardMaterial({ map: doorAtlas(), roughness: 0.45, metalness: 0.2 })); }
function pitGarages(v) {
  const L = 30, BAY = 7;
  const g = kitProp('pits' + v, (k) => {
    const wall = '#eef0f4', dark = '#2a2e3a';
    // apron (concrete plinth reaching to the road edge) with painted pit-lane line
    k.add(tiledBox(L + 0.2, 2.4, 9.0, 4), surface('concrete', { tint: '#d8d4cc', scale: 1 }), '#ffffff', [0, -1.0, 4.5]);
    k.box(L + 0.2, 0.03, 0.3, 'paint', '#ffffff', [0, 0.21, 5.6]);
    for (let i = 0; i < 8; i++) k.box(1.6, 0.03, 0.3, 'paint', SUN, [-L / 2 + 2 + i * 3.8, 0.21, 2.2]);
    // building shell
    k.box(L, 9.2, 12, 'matte', wall, [0, 4.6, -6.2]);
    k.box(L + 0.4, 5.0, 12.4, 'matte', '#dfe3ea', [0, 11.7, -6.6]);
    // pillars between bays
    for (let i = 0; i <= 4; i++) k.rbox(1.2, 9.6, 1.2, 0.18, 'paint', '#ffffff', [-L / 2 + 1 + i * BAY, 4.8, 0.1]);
    k.rbox(L + 0.6, 1.1, 1.0, 0.2, 'paint', dark, [0, 9.4, 0.2]); // lintel band
    // door recesses
    for (let i = 0; i < 4; i++) k.box(BAY - 1.2, 8.0, 0.3, 'matte', '#1a1c24', [-L / 2 + 1 + BAY / 2 + i * BAY, 4.2, -0.15]);
    // upstairs: glass lounge with mullions + balcony
    k.box(L - 0.6, 3.6, 0.15, 'glassy', '#244a6a', [0, 12.0, 0.0]);
    for (let i = 0; i <= 10; i++) k.box(0.18, 3.8, 0.3, 'metal', '#c8ccd4', [-L / 2 + 0.3 + i * (L - 0.6) / 10, 12.0, 0.1]);
    k.box(L + 0.6, 0.3, 2.4, 'paint', '#ffffff', [0, 10.1, 1.0]);
    k.box(L + 0.4, 0.08, 0.08, 'chrome', '#ffffff', [0, 11.2, 2.1]);
    for (let i = 0; i <= 15; i++) k.box(0.06, 1.0, 0.06, 'chrome', '#ffffff', [-L / 2 + i * L / 15, 10.7, 2.1]);
    // roof slab + overhang + fascia
    k.rbox(L + 1.6, 0.7, 15.6, 0.2, 'paint', '#ffffff', [0, 14.6, -5.2]);
    k.box(L + 1.6, 1.6, 0.5, 'paint', v ? SKY : PINK, [0, 15.5, 2.6]);
    // rooftop: AC units, antenna, flags
    for (let i = 0; i < 3; i++) k.rbox(2.2, 1.2, 2.2, 0.2, 'metal', '#b8bec8', [-9 + i * 8, 15.6, -7]);
    k.cyl(0.08, 0.08, 5, 8, 'metal', '#888', [12, 17.4, -9]);
    k.sphere(0.25, 10, 'glow', '#ff3a3a', [12, 20, -9], I3, 'ledA');
    // VC lounge spectators on the balcony
    for (let i = 0; i < 7; i++) personIn(k, [-12 + i * 4, 10.25, 1.2], i * 3 + v * 7, i % 2 ? 'crowdA' : 'crowdB', { sign: i === 3 ? (v ? 1 : 3) : -1, scale: 1.25 });
    // one open bay: workshop with a kart on a stand, monitors, a GPU rack
    const ox = -L / 2 + 1 + BAY / 2 + (v ? 2 : 1) * BAY;
    k.box(BAY - 1.4, 0.05, 6, 'matte', '#3a3e48', [ox, 0.25, -3]);
    k.rbox(2.0, 0.5, 3.0, 0.2, 'paint', v ? '#2a6ad8' : '#d8452b', [ox, 1.2, -3]); // kart body
    for (const [wx, wz] of [[-1, -4], [1, -4], [-1, -2], [1, -2]]) k.cyl(0.4, 0.4, 0.3, 16, 'rubber', '#1a1a1e', [ox + wx, 0.9, wz], [0, 0, Math.PI / 2]);
    k.box(2.2, 0.4, 3.2, 'metal', '#888', [ox, 0.45, -3]);
    k.rbox(1.2, 3.2, 1.0, 0.08, 'paint', '#1a1e28', [ox + 2.2, 1.85, -5]);
    for (let i = 0; i < 7; i++) k.box(0.6, 0.08, 0.05, 'glow', i % 2 ? '#5dffb0' : '#ffb84a', [ox + 2.2, 0.7 + i * 0.4, -4.47], O3, i % 2 ? 'ledB' : 'ledA');
    k.box(2.0, 1.2, 0.1, 'glow', '#7af7ff', [ox - 1.6, 3.6, -5.6], O3, 'ledB');
    personIn(k, [ox - 1.6, 0.25, -1.8], 5 + v, '', { scale: 1.3 });
  });
  // doors (team atlas) on every bay except the open one
  const dm = doorMat();
  for (let i = 0; i < 4; i++) {
    if (i === (v ? 2 : 1)) continue;
    const t = v * 4 + i, u0 = (t % 4) / 4, v1 = 1 - ((t / 4) | 0) / 2;
    const d = new THREE.Mesh(atlasPlane(BAY - 1.3, 7.8, u0, v1 - 0.5, u0 + 0.25, v1), dm);
    d.position.set(-L / 2 + 1 + BAY / 2 + i * BAY, 4.1, 0.05);
    g.add(d);
  }
  const s = textPanel(v ? 'PIT LANE · SERIES A SUITES (VCs ONLY)' : 'PIT LANE · NO SAFETY CAR', { width: L - 2, height: 1.3, w: 2048, h: 95, pad: 8, bg: v ? SKY : PINK, fg: '#ffffff', border: null, borderW: 0, radius: 6, stroke: INK, strokeW: 8 });
  s.position.set(0, 15.5, 2.87);
  g.add(s);
  return g;
}

// ---- far landmarks ----
function windowTex() {
  return canvasTex('gWin', 256, 256, (x) => {
    x.fillStyle = '#e8eef4'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const lit = ((i * 7 + j * 3) % 5) === 0;
      x.fillStyle = lit ? '#ffe8b0' : (i + j) % 2 ? '#5a7c9c' : '#6a8cac';
      x.fillRect(i * 64 + 8, j * 64 + 10, 48, 40);
    }
  }, { repeat: true });
}
let _winMat = null;
function winMat() {
  if (!_winMat) {
    _winMat = new THREE.MeshStandardMaterial({ map: windowTex(), vertexColors: true, roughness: 0.35, metalness: 0.25, emissiveMap: windowTex(), emissive: new THREE.Color('#ffd890'), emissiveIntensity: 0.12 });
  }
  return _winMat;
}
/** box whose UVs tile every `cell` world units (for window textures) */
function tiledBox(w, h, d, cell) {
  return cachedGeo(`tb${w},${h},${d},${cell}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / cell, uv.getY(k) * dims[f][1] / cell); }
    return g;
  });
}
/** a distant cluster of towers (60–160 tall), one wearing a tower crane: "AGI TOWER (UNDER CONSTRUCTION)" */
function skyline(v) {
  const g = kitProp('skyline' + v, (k) => {
    const r = makeRngLocal(31 + v * 17);
    const tints = ['#ffffff', '#dfe8f4', '#f4e8dc', '#e4f0ec', '#e8e4f4'];
    let tallest = null;
    for (let i = 0; i < 7; i++) {
      const w = 14 + r() * 12, d = 14 + r() * 10, h = 55 + r() * 95 * (i === 2 ? 1.3 : 1);
      const x = -60 + i * 20 + r() * 6, z = -r() * 40;
      k.add(tiledBox(Math.round(w), Math.round(h), Math.round(d), 8), winMat(), tints[i % 5], [x, h / 2, z]);
      k.rbox(w + 1, 2.0, d + 1, 0.4, 'paint', '#cfd6e0', [x, h + 1, z]);
      k.sphere(0.9, 10, 'glow', '#ff3a3a', [x, h + 3, z], I3, 'ledA');
      if (!tallest || h > tallest.h) tallest = { x, z, h, w, d };
    }
    // tower crane on the tallest
    const { x, z, h } = tallest;
    const mh = 30;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.35, mh, 0.35, 'paint', SUN, [x + dx * 1.2, h + 2 + mh / 2, z + dz * 1.2]);
    for (let y = 0; y < mh; y += 3) {
      k.box(2.7, 0.25, 0.25, 'paint', SUN, [x, h + 2 + y, z + 1.2]);
      k.box(2.7, 0.25, 0.25, 'paint', SUN, [x, h + 2 + y, z - 1.2]);
    }
    k.box(46, 1.2, 1.2, 'paint', SUN, [x + 12, h + 2 + mh, z]);
    k.box(10, 2.4, 2.4, 'matte', '#6a6e78', [x - 8, h + 1 + mh, z]);
    k.box(2.8, 2.6, 2.8, 'glassy', '#2a4a6a', [x + 2.2, h + mh - 0.5, z]);
    k.tube([x + 24, h + 2 + mh, z], [x + 24, h + mh - 16, z], 0.1, 4, 'metal', '#333');
    k.box(1.6, 1.0, 1.6, 'paint', '#d8452b', [x + 24, h + mh - 16.5, z]);
    k.sphere(0.8, 10, 'glow', '#ff3a3a', [x + 34, h + 3 + mh, z], I3, 'ledA');
    g_tallest.set('skyline' + v, tallest);
  });
  const t = g_tallest.get('skyline' + v);
  const s = textPanel(v ? ['HYPE HQ', '(floors 40–90: vibes)'] : ['AGI TOWER', '(UNDER CONSTRUCTION)'], { width: 26, height: 10, bg: INK, fg: SUN, border: SUN, borderW: 14, radius: 20 });
  s.position.set(t.x, t.h * 0.78, t.z + t.d / 2 + 0.3);
  g.add(s);
  return g;
}
const g_tallest = new Map();
function makeRngLocal(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** "THE RING (OF COMPUTE)": a giant ring-shaped campus on the hills (R 60, 18 tall) */
function ringCampus() {
  const g = kitProp('ring', (k) => {
    const lathe = (pts, seg) => cachedGeo('ringL' + pts.join(), () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
    k.add(lathe([[46, 0], [62, 0], [62, 0.01], [62, 4], [46, 4], [46, 0]], 96), 'matte', '#e8e4dc', [0, 0, 0]);
    k.add(lathe([[61.6, 4], [61.6, 15]], 96), 'glassy', '#5a8aac', [0, 0, 0]);
    k.add(lathe([[46.4, 15], [46.4, 4]], 96), 'glassy', '#5a8aac', [0, 0, 0]);
    k.add(lathe([[45.5, 15], [63, 15], [63, 17], [45.5, 17], [45.5, 15]], 96), 'paint', '#f4f4f6', [0, 0, 0]);
    // solar panels on the roof
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      k.box(9, 0.2, 3.4, 'glassy', '#1a2a5a', [Math.cos(a) * 54, 17.3, Math.sin(a) * 54], [0, -a, 0.12]);
    }
    // trees in the courtyard
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, rr = 12 + (i * 7) % 26;
      k.sphere(4 + (i % 3), 12, 'matte', '#4f8f36', [Math.cos(a) * rr, 5, Math.sin(a) * rr]);
      k.cyl(0.6, 0.8, 4, 8, 'wood', '#7a5a3e', [Math.cos(a) * rr, 2, Math.sin(a) * rr]);
    }
  });
  const s = textPanel(['THE RING', '(of compute)'], { width: 34, height: 11, bg: '#ffffff', fg: INK, border: PINK, borderW: 16, radius: 26 });
  s.position.set(-41.3, 9.5, 47.6);
  s.rotation.y = -0.715;
  g.add(s);
  return g;
}

/** cell tower disguised as a palm tree (≈ 36 tall) */
function palmTower() {
  const g = kitProp('palm5g', (k) => {
    const H = 34;
    k.cyl(0.9, 1.3, H, 20, 'matte', '#8a6a4a', [0, H / 2, 0]);
    for (let y = 1.5; y < H; y += 1.6) k.cyl(1.25 - y / H * 0.4, 1.3 - y / H * 0.4, 0.3, 20, 'matte', '#6e5238', [0, y, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.rbox(0.5, 3.4, 1.1, 0.15, 'paint', '#e8ecf2', [Math.cos(a) * 1.6, H - 3, Math.sin(a) * 1.6], [0, -a, 0]);
    }
    k.rbox(4.6, 0.4, 4.6, 0.1, 'metal', '#9aa3b0', [0, H - 5.2, 0]);
    for (let f = 0; f < 11; f++) {
      const a = (f / 11) * Math.PI * 2;
      k.add(frondGeo(), 'leaf', f % 2 ? '#3f8a3a' : '#2f7a2e', [0, H, 0], [0, a, f % 2 ? 0.3 : 0], [2.3, 2.0, 2.3]);
    }
    k.sphere(0.5, 10, 'glow', '#ff3a3a', [0, H + 1.5, 0], I3, 'ledA');
    k.rbox(4.2, 2.6, 4.2, 0.2, 'matte', '#c8c4bc', [0, 1.3, 0]);
  });
  const s = textPanel(['5G PALM', '(definitely a tree)'], { width: 6, height: 2.4, bg: '#ffffff', fg: INK, border: '#2a8a5a', borderW: 10, radius: 12 });
  s.position.set(0, 4.2, 2.3);
  g.add(s);
  return g;
}

/** cooling towers steaming on the horizon: the training run next door */
function coolingTowers() {
  const g = kitProp('cooling', (k) => {
    const prof = cachedGeo('coolProf', () => {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const y = (i / 16) * 70; const r = 15 * Math.sqrt(1 + Math.pow((y - 50) / 26, 2)) * 0.72 + 2; pts.push(new THREE.Vector2(r, y)); }
      return new THREE.LatheGeometry(pts, 48);
    });
    for (const [x, z, s] of [[-24, 0, 1], [26, -18, 0.85]]) {
      k.add(prof, 'matte', '#e4e0da', [x, 0, z], O3, [s, s, s]);
      k.add(cachedGeo('coolBand', () => new THREE.CylinderGeometry(14.3, 14.3, 3, 48, 1, true)), 'paint', '#d8452b', [x, 62 * s, z], O3, [s * 0.97, s, s * 0.97]);
      const r = makeRngLocal(x | 0);
      for (let i = 0; i < 9; i++) k.sphere(9 + r() * 7, 16, 'matte', '#fbf8f4', [x + (r() - 0.5) * 14, 76 * s + i * 7, z + (r() - 0.5) * 10 - i * 2], [1, 0.8, 1]);
    }
    k.rbox(70, 14, 30, 1, 'matte', '#d6dae2', [0, 7, 30]);
    for (let i = 0; i < 10; i++) k.box(5, 1.2, 0.2, 'glow', '#7af7ff', [-28 + i * 6.2, 9, 45.2], O3, i % 2 ? 'ledA' : 'ledB');
  });
  const s = textPanel(['TRAINING RUN #47', '(DO NOT UNPLUG)'], { width: 40, height: 10, bg: INK, fg: '#ffffff', border: TEAL, borderW: 14, radius: 20 });
  s.position.set(0, 20, 45.4);
  g.add(s);
  return g;
}

/** sawhorse + cones: road work, pivoting */
function coneSet() {
  const g = kitProp('cones', (k) => {
    for (const [x, z] of [[-1.6, 0.6], [1.7, 0.4], [0.1, 1.6]]) {
      k.box(0.95, 0.1, 0.95, 'rubber', '#1d1d22', [x, 0.05, z]);
      k.cone(0.42, 1.25, 18, 'plastic', '#ff7a1f', [x, 0.7, z]);
      k.cyl(0.3, 0.36, 0.2, 18, 'paint', '#ffffff', [x, 0.75, z]);
    }
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.5, 0.5]) k.box(0.12, 1.5, 0.12, 'wood', '#b8946a', [sx, 0.7, -0.6 + sz * 0.4], [sz * 0.5, 0, 0]);
    for (let i = 0; i < 6; i++) k.box(0.55, 0.5, 0.1, 'paint', i % 2 ? '#ffffff' : '#ff7a1f', [-1.4 + i * 0.56, 1.35, -0.6]);
  });
  const s = textPanel(['ROAD WORK', '(PIVOTING)'], { width: 2.4, height: 1.0, bg: '#ff7a1f', fg: INK, border: INK, borderW: 8, radius: 8 });
  s.position.set(0, 2.4, -0.55);
  g.add(s);
  return g;
}

/** sidewalk delivery robot (lost) */
function deliveryBot() {
  const g = kitProp('bot', (k) => {
    k.rbox(1.2, 0.9, 1.5, 0.3, 'paint', '#f4f4f6', [0, 0.75, 0]);
    k.rbox(1.22, 0.3, 1.52, 0.12, 'paint', '#2a2a30', [0, 0.45, 0]);
    for (const [x, z] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5], [-0.6, 0], [0.6, 0]]) k.cyl(0.22, 0.22, 0.14, 14, 'rubber', '#1d1d22', [x, 0.24, z], [0, 0, Math.PI / 2]);
    k.box(0.7, 0.18, 0.04, 'glow', '#7af7ff', [0, 0.95, 0.76]);
    k.cyl(0.02, 0.02, 1.8, 6, 'metal', '#ccc', [0.45, 1.9, -0.5]);
    k.box(0.04, 0.35, 0.5, 'plastic', '#ff7a1f', [0.45, 2.6, -0.28]);
  });
  const s = textPanel(['DELIVERING:', 'your job'], { width: 1.1, height: 0.5, bg: '#ffffff', fg: INK, border: null, borderW: 0, radius: 6 });
  s.position.set(0, 0.75, 0.77);
  g.add(s);
  return g;
}

/** crowd stand shared with the takeoff theme (investor viewing deck) */
export function cardboardStand(v = 1) { return grandstand(v); }

// ================================================================================================
// theme
// ================================================================================================
const HOUSES = ['h0', 'h1', 'h2', 'h3'];
const HOUSES_M = ['hm0', 'hm1', 'hm2', 'hm3'];
const ST_LEN = 175; // start straight (grandstands + pits) until the first corner (rel ≈ 190)

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
  spacing: 14,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const at = (target, p) => { if (rel > target - 7 && rel <= target + 7) out.push({ abs: true, ...p, dz: target - rel }); };
    const cell = Math.round(rel / 14);
    // ---- hero set pieces ----
    at(56, { kind: 'gantry', x: 0 });
    at(166, { kind: 'tutorial', x: 0 });
    at(232, { kind: 'founders', x: 28, rotY: -0.42, scale: 1.35 });
    at(300, { kind: 'truck', x: -18.5, rotY: Math.PI / 2 - 0.2, scale: 1.15 });
    at(560, { kind: 'truck', x: 19, rotY: -Math.PI / 2 + 0.2, scale: 1.15 });
    at(258, { kind: 'whiteboard', x: -19, rotY: 0.5, scale: 1.25 });
    at(410, { kind: 'whiteboard', x: 19.5, rotY: -0.5, scale: 1.25 });
    at(345, { kind: 'stand', x: -17.5, rotY: 0.45, scale: 1.35 });
    // ---- landmarks (mid + far) ----
    at(70, { kind: 'leader', x: -40, rotY: 0.3 });
    at(12, { kind: 'lightTower', x: -36, rotY: 1.0 });
    at(118, { kind: 'lightTower', x: -36, rotY: 1.0 });
    at(64, { kind: 'lightTower', x: 44, rotY: -1.0 });
    at(170, { kind: 'blimp', x: -52, y: 40, rotY: 0.5 });
    at(150, { kind: 'skyline0', x: 250, rotY: -0.5 });
    at(380, { kind: 'skyline1', x: -270, rotY: 0.45 });
    at(330, { kind: 'ring', x: 210, rotY: 0.2 });
    at(250, { kind: 'palm5g', x: 72, rotY: -0.3 });
    at(500, { kind: 'palm5g', x: -68, rotY: 0.3 });
    at(470, { kind: 'holly', x: -300, rotY: 0.5, scale: 1.6 });
    at(430, { kind: 'tower', x: -84, rotY: 0.3, scale: 1.4 });
    at(600, { kind: 'cooling', x: 190, rotY: -0.6 });
    if (rel < ST_LEN) {
      // ---- start straight: grandstands on the left, team pit garages on the right, walls + banners + flags ----
      for (const t of [-21, 0, 21, 42, 63, 84, 105, 150]) at(t, { kind: 'grandstand' + (Math.abs(t / 21) % 2), x: -21, rotY: Math.PI / 2, scale: 1.35 });
      // (the stands leave a gap at ≈115–138: the engine puts a billboard at z 130, x -18.5)
      for (const [i, t] of [-15, 15, 45, 75, 105, 135, 165].entries()) at(t, { kind: 'pits' + (i % 2), x: 21.9, rotY: -Math.PI / 2 });
      const bi = ((cell % 8) + 8) % 8;
      out.push({ abs: true, kind: 'wallL' + bi, x: -12.9 });
      out.push({ abs: true, kind: 'wallR' + ((bi + 3) % 8), x: 12.9 });
      out.push({ abs: true, kind: 'feather' + (((cell % 4) + 4) % 4), x: cell % 2 ? -14.6 : 14.6, dz: 3 });
      if (rel > 120 && rel < 180) out.push({ abs: true, kind: 'flagpole' + (cell % 2 ? 'A' : 'B'), x: (cell % 2 ? -1 : 1) * 15.5, dz: -4 });
      return out;
    }
    // ---- the suburb ----
    const corner = rel > 182 && rel < 290; // first (right-hand) corner: tyre wall + spectators on the outside
    for (const side of [-1, 1]) {
      const R = side > 0;
      if (corner && !R) out.push({ abs: true, kind: 'tyresL', x: -12.5 });
      else out.push({ abs: true, kind: R ? 'walkR' : 'walkL', x: side * 12.4 });
      if (corner && !R && cell % 2 === 0) { out.push({ abs: true, kind: 'crowd' + (cell % 4 ? 1 : 0), x: -19.5, rotY: Math.PI / 2 }); continue; }
      // street lamps: every third cell, alternating sides
      if ((cell + (R ? 0 : 1)) % 3 === 0) out.push({ abs: true, kind: R ? 'lampR' : 'lampL', x: side * 13.3, dz: 2 });
      else if (rng.chance(0.3)) out.push({ abs: true, kind: 'mailbox' + rng.int(0, 2), x: side * 14.3, rotY: -side * 0.5 });
      else if (rng.chance(0.22)) out.push({ abs: true, kind: rng.chance(0.5) ? 'street' : 'bot', x: side * 14.0, rotY: -side * 0.6 });
      // mid layer: houses every other cell (staggered by side), front-yard palms / clutter between
      const housed = (cell + (R ? 1 : 0)) % 2 === 0 && !(R && rel > 212 && rel < 254);
      if (housed) {
        out.push({ abs: true, kind: rng.pick(R ? HOUSES_M : HOUSES), x: side * rng.range(32, 36), rotY: -side * rng.range(0.25, 0.45), scale: 1.35 });
        if (rng.chance(0.35)) out.push({ abs: true, kind: 'tree' + rng.int(0, 1), x: side * rng.range(20, 23), dz: -4 });
      }
      else {
        if (rng.chance(0.8)) { const q = rng(); out.push({ abs: true, kind: q < 0.4 ? 'palmT' : q < 0.6 ? 'palmS' : 'tree' + (q < 0.8 ? 0 : 1), x: side * rng.range(19, 24) }); }
        if (rng.chance(0.5)) out.push({ abs: true, kind: 'palmG', x: side * rng.range(42, 52), dz: 5 });
      }
      const r = rng();
      if (r < 0.22) out.push({ abs: true, kind: 'shrub', x: side * rng.range(17.5, 20), rotY: rng.range(0, 6) });
      else if (r < 0.32) out.push({ abs: true, kind: 'boxes', x: side * rng.range(18, 20), rotY: rng.range(-0.6, 0.6) });
      else if (r < 0.4) out.push({ abs: true, kind: 'cones', x: side * 17.6, rotY: -side * 0.4 });
    }
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('wallL')) return wallProp(false, +kind.slice(5));
    if (kind.startsWith('wallR')) return wallProp(true, +kind.slice(5));
    if (kind.startsWith('feather')) return featherFlag(+kind.slice(7));
    if (kind.startsWith('skyline')) return skyline(+kind.slice(7));
    switch (kind) {
      case 'gantry': return startGantry();
      case 'tutorial': return tutorialSign();
      case 'grandstand0': return grandstand(0);
      case 'grandstand1': return grandstand(1);
      case 'pits0': return pitGarages(0);
      case 'pits1': return pitGarages(1);
      case 'flagpoleA': return flagPole('A');
      case 'flagpoleB': return flagPole('B');
      case 'h0': case 'h1': case 'h2': case 'h3': return house(+kind[1]);
      case 'founders': return house('founders', true);
      case 'hm0': case 'hm1': case 'hm2': case 'hm3': return house(+kind[2], true);
      case 'palmT': return palm('T');
      case 'palmS': return palm('S');
      case 'palmG': return palm('G');
      case 'tree0': return shadeTree(0);
      case 'tree1': return shadeTree(1);
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
      case 'walkL': return walkFence(false);
      case 'walkR': return walkFence(true);
      case 'tyresL': return tyreWall(false);
      case 'lampL': return streetLamp(false);
      case 'lampR': return streetLamp(true);
      case 'crowd0': return crowdLine(0);
      case 'crowd1': return crowdLine(1);
      case 'lightTower': return lightTower();
      case 'leader': return leaderTower();
      case 'ring': return ringCampus();
      case 'palm5g': return palmTower();
      case 'cooling': return coolingTowers();
      case 'cones': return coneSet();
      case 'bot': return deliveryBot();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    KIT_U.uTime.value = t;
    KIT_U.uBeat.value = beatPhase;
    const u = obj.userData;
    const seed = entry?.seed || 0;
    if (u.startLights) {
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
    'OPEN HOUSE: 3 BED, 2 BATH, 8 GPU', 'HOA NOTICE: NO UNALIGNED MODELS ON THE LAWN',
  ],
  billboardEvery: 70,
  billboardStyle: { bg: '#fff3d6', fg: '#3a1f4d', border: '#ff6b8b', frame: '#ff6b8b', postColor: '#e8ecf2', postH: 4.2, width: 9.5, height: 4.6 },
  hazards: [],
  enterLines: ['WELCOME TO THE GARAGE', 'TWO FOUNDERS. ONE GPU. LET\'S GO.'],
};
