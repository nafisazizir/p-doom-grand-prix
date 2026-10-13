// BENCHMARK STADIUM — THE FINAL EVAL (chorus 4): a huge floodlit night stadium hugging the banked oval.
// Grandstands packed with tiny robots bouncing on the beat (instanced, animated in the vertex shader), a giant
// jumbotron leaderboard, lattice floodlight masts, confetti cannons, sponsor hoardings, the half-open door
// (what did Ilya see?), the Loom (as foretold), a contaminated trophy and a podium with a raccoon on it.
import { THREE, toon, glow, G, mesh, textPanel, makeRng, FONT, MAT, roundRect } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from '../textures.js';
import { SPEED } from '../course.js';

const GOLD = '#ffd23f', HOT = '#ff4f8b', NAVY = '#1a1f5e', INK = '#2b1840', CYAN = '#3ff2ff';
const kick = (bp) => Math.pow(1 - bp, 3);
const TAU = Math.PI * 2;
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(1, 1, 1);

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
  bar(a, b, thick, mat, geo = G.box(1, 1, 1)) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    _q.setFromUnitVectors(_up, _d.normalize());
    _m4.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s3.set(thick, len, thick));
    _s3.set(1, 1, 1);
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
const additive = (c, opacity) => glow(c, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function screenMat(tex, k = 1.15) {
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.color.setScalar(k);
  return m;
}
function noShadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
}
function glareTex() {
  return once('glare', () => canvasTex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,248,220,0.7)'); g.addColorStop(0.45, 'rgba(255,240,200,0.12)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }));
}
function glareSprite(color = '#fff4d8', k = 1.6, size = 10) {
  const m = once('glareMat' + color + k, () => {
    const mm = new THREE.SpriteMaterial({ map: glareTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color });
    mm.color.multiplyScalar(k);
    return mm;
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

// =====================================================================================================
// crowd of tiny robots: one instanced mesh per stand, bounce + arm waves done in the vertex shader
// =====================================================================================================
const CROWD_U = { uBeat: { value: 0 }, uBeat2: { value: 0 }, uTime: { value: 0 } };
const BOUNCE = `#include <begin_vertex>
#ifdef USE_INSTANCING
  float cph = fract(instanceMatrix[3].x * 0.731 + instanceMatrix[3].y * 0.313 + instanceMatrix[3].z * 0.197);
  float cb = cph > 0.5 ? uBeat : uBeat2;
  float arm = step(0.42, abs(position.x)) * step(0.75, position.y);
  transformed.y += cb * (0.32 + 0.35 * cph) + arm * cb * 0.25;
  transformed.x += sin(uTime * 3.0 + cph * 30.0) * 0.12 * position.y;
#endif`;
function patchCrowd(m, key, keepColor = true) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBeat = CROWD_U.uBeat; sh.uniforms.uBeat2 = CROWD_U.uBeat2; sh.uniforms.uTime = CROWD_U.uTime;
    sh.vertexShader = 'uniform float uBeat; uniform float uBeat2; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', BOUNCE);
    if (!keepColor) sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#if defined( USE_INSTANCING_COLOR )\n vColor = vec4( 1.0 );\n#endif');
  };
  m.customProgramCacheKey = () => key;
  return m;
}
const robotMats = () => once('robotMats', () => {
  const body = patchCrowd(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.25 }), 'crowdBody');
  const visor = new THREE.MeshBasicMaterial({ color: '#3ff2ff' });
  visor.color.multiplyScalar(2.2);
  patchCrowd(visor, 'crowdVisor', false);
  return [body, visor];
});
const robotGeo = () => once('robotGeo', () => {
  const part = (geo, x, y, z, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const g = prepGeo(geo);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz)));
    return g;
  };
  const body = mergeGeometries([
    part(G.box(0.72, 0.7, 0.5), 0, 0.42, 0),
    part(G.rbox(0.7, 0.52, 0.55, 0.16), 0, 1.06, 0),
    part(G.box(0.16, 0.66, 0.16), -0.5, 1.02, 0, 0.55),
    part(G.box(0.16, 0.66, 0.16), 0.5, 1.02, 0, -0.55),
    part(G.cyl(0.03, 0.03, 0.3, 4), 0, 1.45, 0),
    part(G.sphere(0.07, 6), 0, 1.62, 0),
  ]);
  const visor = part(G.box(0.5, 0.15, 0.06), 0, 1.1, 0.28);
  return mergeGeometries([body, visor], true);
});
const ROBOT_COLS = ['#ff6b8b', '#ffd23f', '#6ad1ff', '#8aff8a', '#c58bff', '#f4f4f8', '#ff9a3f', '#3f6bff'];
function crowdMesh(rows, per, rowH, rowD, width, seed) {
  const N = rows * per;
  const im = new THREE.InstancedMesh(robotGeo(), robotMats(), N);
  const r = makeRng(seed);
  const col = new THREE.Color();
  let i = 0;
  for (let k = 0; k < rows; k++) {
    for (let c = 0; c < per; c++) {
      if (r.chance(0.06)) continue; // empty seats (they went to get GPUs)
      const x = -width / 2 + 0.6 + c * ((width - 1.2) / (per - 1)) + r.range(-0.15, 0.15);
      _m4.compose(_v.set(x, (k + 1) * rowH, -k * rowD + 0.35), _q.setFromEuler(_e.set(0, r.range(-0.3, 0.3), 0)), _s3.setScalar(r.range(0.9, 1.1)));
      im.setMatrixAt(i, _m4);
      im.setColorAt(i, col.set(r.pick(ROBOT_COLS)));
      i++;
    }
  }
  _s3.set(1, 1, 1);
  im.count = i;
  im.instanceMatrix.needsUpdate = true;
  im.instanceColor.needsUpdate = true;
  im.castShadow = false;
  im.frustumCulled = true;
  im.computeBoundingSphere();
  return im;
}

// =====================================================================================================
// grandstand (36 m section) — tiers, rails, roof canopy with downlights, LED ribbon, robot crowd
// =====================================================================================================
const ST = { W: 36, ROWS: 9, RH: 0.95, RD: 1.45 };
function ribbonTex() {
  return once('ribbon', () => {
    const t = canvasTex(2048, 64, (x) => {
      x.fillStyle = '#05061a'; x.fillRect(0, 0, 2048, 64);
      const msgs = ['GO OUR MODEL GO', 'LOSS GO DOWN', 'SOTA SOTA SOTA', 'MAKE SOME NOISE (tokens)', 'WAS IT ALL FOR SHOW?', 'AS FORETOLD BY LOOM'];
      x.font = `700 42px ${FONT}`; x.textBaseline = 'middle';
      let px = 20;
      let i = 0;
      while (px < 2048) {
        const m = msgs[i % msgs.length];
        x.fillStyle = [GOLD, HOT, CYAN, '#8aff8a'][i % 4];
        x.fillText(m, px, 34);
        px += x.measureText(m).width + 30;
        x.fillStyle = '#ffffff'; x.fillText('★', px, 34); px += 60;
        i++;
      }
      x.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 2048; k += 4) x.fillRect(k, 0, 1, 64);
    }, { wrap: true });
    t.repeat.set(1, 1);
    return t;
  });
}
function grandstand(variant) {
  const g = new THREE.Group();
  const { W, ROWS, RH, RD } = ST;
  const D = ROWS * RD;
  g.add(kit('stand', (kt) => {
    const conc = surface('concrete', { tint: '#b9bccb', scale: 0.25 });
    const step = toon('#d6d8e6', { roughness: 0.7 });
    const seatA = toon('#2a3fae', { roughness: 0.45 }), seatB = toon('#c8304f', { roughness: 0.45 });
    const steel = MAT.metal('#9aa0b8', { roughness: 0.35 }), dark = toon('#1c1f3a', { roughness: 0.6 });
    for (let k = 0; k < ROWS; k++) {
      const h = (k + 1) * RH;
      kt.add(G.box(W, h, RD), k % 2 ? step : conc, 0, h / 2, -k * RD);
      kt.add(G.box(W, 0.32, 0.5), k % 3 === 1 ? seatB : seatA, 0, h + 0.16, -k * RD + 0.2);
    }
    // front wall + railing
    kt.add(G.box(W, 1.3, 0.35), dark, 0, 0.65, RD / 2 + 0.2);
    kt.add(G.cyl(0.06, 0.06, W, 6), MAT.chrome(), 0, 1.6, RD / 2 + 0.25, 0, 0, Math.PI / 2);
    for (let x = -W / 2; x <= W / 2; x += 3) kt.add(G.cyl(0.05, 0.05, 0.9, 6), MAT.chrome(), x, 1.15, RD / 2 + 0.25);
    // aisles (stairs)
    for (const ax of [-W / 4, W / 4]) for (let k = 0; k < ROWS; k++) kt.add(G.box(1.2, 0.12, RD), toon('#f0c040', { roughness: 0.6 }), ax, (k + 1) * RH + 0.02, -k * RD);
    // back wall and side walls
    const back = -D + RD / 2;
    kt.add(G.box(W + 0.8, ROWS * RH + 6, 0.6), dark, 0, (ROWS * RH + 6) / 2, back - 0.3);
    for (const s of [-1, 1]) kt.add(G.box(0.6, ROWS * RH + 1.2, D + 0.6), conc, s * (W / 2 + 0.3), (ROWS * RH + 1.2) / 2, back + D / 2);
    // roof canopy: columns + cantilever trusses + roof slab
    const roofY = ROWS * RH + 6.2;
    for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 8) {
      kt.add(G.box(0.5, roofY, 0.5), steel, x, roofY / 2, back - 0.2);
      kt.bar([x, roofY - 3.5, back], [x, roofY + 0.2, back + D * 0.85], 0.3, steel);
    }
    kt.add(G.box(W + 1.2, 0.4, D + 3), MAT.paint('#e8eaf4'), 0, roofY + 0.3, back + D / 2 + 1, -0.06);
    kt.add(G.box(W + 1.2, 1.0, 0.4), MAT.paint(NAVY), 0, roofY + 0.0, back + D + 2.4, -0.06);
    // downlights under the canopy
    for (let x = -W / 2 + 3; x < W / 2; x += 4.5) kt.add(G.box(1.6, 0.1, 0.5), glow('#fff2cc', { intensity: 3 }), x, roofY - 0.05, back + D * 0.45);
  }));
  const rb = new THREE.Mesh(G.plane(ST.W, 0.9), once('ribbonMat', () => screenMat(ribbonTex(), 1.4)));
  rb.position.set(0, 0.7, ST.RD / 2 + 0.39);
  g.add(rb);
  const crowd = crowdMesh(ROWS, 30, RH, RD, W - 1.5, 99 + variant * 13);
  g.add(crowd);
  const roofSign = textPanel(variant % 2 ? 'LOSS GO DOWN' : 'THE FINAL EVAL', { width: 12, height: 1.9, bg: HOT, fg: '#ffffff', border: '#ffffff', borderW: 8, radius: 14 });
  roofSign.position.set(0, ROWS * RH + 7.8, -ROWS * RD + ST.RD + D + 2.2);
  g.add(roofSign);
  g.userData.crowd = crowd;
  return g;
}

// =====================================================================================================
// the outer bowl: a distant upper tier with a painted crowd, a lit rim and a roof ring (skyline landmark)
// =====================================================================================================
function bowlTex() {
  return once('bowlTex', () => canvasTex(1024, 256, (x) => {
    x.fillStyle = '#141633'; x.fillRect(0, 0, 1024, 256);
    const r = makeRng(4);
    for (let row = 0; row < 26; row++) {
      for (let c = 0; c < 140; c++) {
        x.fillStyle = r.pick(['#ff6b8b', '#ffd23f', '#6ad1ff', '#8aff8a', '#c58bff', '#e4e4f0', '#3f6bff']);
        x.globalAlpha = r.range(0.45, 0.95);
        x.fillRect(c * 7.3 + r.range(0, 2), row * 9.6 + r.range(0, 2), 4.5, 6);
      }
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, row * 9.6 + 7.5, 1024, 2);
    }
    // phone flashes
    for (let i = 0; i < 90; i++) { x.fillStyle = '#ffffff'; x.fillRect(r.range(0, 1024), r.range(0, 256), 3, 3); }
  }, { wrap: true }));
}
function bowl() {
  const g = new THREE.Group();
  g.add(kit('bowl', (kt) => {
    const conc = toon('#2a2d52', { roughness: 0.8 });
    const tm = new THREE.MeshStandardMaterial({ map: bowlTex(), emissiveMap: bowlTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.8 });
    // sloped upper tier (seen from the track)
    kt.add(G.plane(90, 34), tm, 0, 22, -6, -0.62);
    kt.add(G.box(92, 4, 6), conc, 0, 2, 6);
    kt.add(G.box(92, 1.2, 4), MAT.paint('#e8eaf4'), 0, 9.2, 8);
    kt.add(G.box(92, 46, 2), conc, 0, 23, -21);
    // roof ring
    kt.add(G.box(96, 1.6, 20), MAT.paint('#e8eaf4'), 0, 46.5, -8, 0.1);
    for (let x = -44; x <= 44; x += 11) kt.bar([x, 46, -20], [x, 52, -4], 0.6, MAT.metal('#9aa0b8'));
    kt.add(G.box(96, 0.5, 0.8), glow('#fff4d8', { intensity: 3 }), 0, 45.7, 1.6);
    kt.add(G.box(92, 0.5, 0.5), glow(HOT, { intensity: 2.4 }), 0, 9.9, 10.1);
  }));
  return g;
}

// =====================================================================================================
// floodlight mast: lattice tower, tilted head with 24 glowing lamps, glare + a soft beam
// =====================================================================================================
function floodlight() {
  const g = new THREE.Group();
  const H = 38;
  g.add(kit('mast', (kt) => {
    const steel = MAT.metal('#aeb4c8', { roughness: 0.3 });
    const R = 1.0;
    for (const sx of [-R, R]) for (const sz of [-R, R]) kt.add(G.box(0.25, H, 0.25), steel, sx, H / 2, sz);
    for (let y = 1; y < H - 1; y += 2.2) {
      kt.bar([-R, y, R], [R, y + 2.2, R], 0.14, steel);
      kt.bar([R, y, -R], [-R, y + 2.2, -R], 0.14, steel);
      kt.bar([R, y, R], [R, y + 2.2, -R], 0.14, steel);
      kt.bar([-R, y, -R], [-R, y + 2.2, R], 0.14, steel);
    }
    kt.add(G.cyl(2.2, 2.6, 1.0, 16), surface('concrete', { tint: '#9a9cac', scale: 0.5 }), 0, 0.5, 0);
    kt.add(G.box(9, 0.4, 2.4), steel, 0, H - 0.2, 0.4);
  }));
  const head = new THREE.Group();
  head.position.set(0, H + 3.2, 0.9);
  head.rotation.x = 0.42;
  g.add(head);
  head.add(kit('mastHead', (kt) => {
    const housing = MAT.paint('#2a2f52'), rim = MAT.metal('#c8ccd8', { roughness: 0.25 });
    kt.add(G.rbox(10, 6.6, 0.9, 0.25), housing, 0, 0, -0.3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = -3.75 + c * 1.5, y = -2.25 + r * 1.5;
      kt.add(G.cyl(0.66, 0.6, 0.6, 14), housing, x, y, 0.3, Math.PI / 2);
      kt.add(G.torus(0.62, 0.08, 16), rim, x, y, 0.62);
      kt.add(G.cyl(0.55, 0.55, 0.05, 14), glow('#fffbe8', { intensity: 5 }), x, y, 0.63, Math.PI / 2);
    }
  }));
  const glare = glareSprite('#fff4d8', 1.4, 20);
  glare.position.set(0, 0, 1.2);
  head.add(glare);
  g.userData.glare = glare;
  return g;
}

// =====================================================================================================
// jumbotron leaderboard
// =====================================================================================================
function leaderboardTex() {
  return once('lbTex', () => canvasTex(1024, 576, (x) => {
    const bg = x.createLinearGradient(0, 0, 0, 576);
    bg.addColorStop(0, '#0b1040'); bg.addColorStop(1, '#05061a');
    x.fillStyle = bg; x.fillRect(0, 0, 1024, 576);
    x.fillStyle = HOT; x.fillRect(0, 0, 1024, 92);
    x.textBaseline = 'middle';
    x.font = `700 54px ${FONT}`; x.fillStyle = '#ffffff'; x.textAlign = 'center';
    x.fillText('THE FINAL EVAL · LEADERBOARD', 512, 48);
    const rows = [
      ['#1', 'OUR MODEL', '101.7% (SOTA)', GOLD, 1.0],
      ['#2', 'Humans', '12.0%', '#c8d0ff', 0.12],
      ['#3', 'A raccoon', '11.9%', '#c8d0ff', 0.119],
      ['#4', "Last week's SOTA", 'deprecated', '#7f86b8', 0.05],
    ];
    rows.forEach(([rank, name, score, color, v], i) => {
      const y = 150 + i * 96;
      if (i === 0) { x.fillStyle = 'rgba(255,210,63,0.2)'; roundRect(x, 20, y - 44, 984, 88, 18); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(150, y + 26, 600, 10);
      x.fillStyle = color; x.fillRect(150, y + 26, 600 * Math.min(1, v), 10);
      x.font = `700 ${i === 0 ? 60 : 48}px ${FONT}`;
      x.fillStyle = color;
      x.textAlign = 'left'; x.fillText(rank, 46, y - 6); x.fillText(name, 150, y - 6);
      x.textAlign = 'right'; x.fillText(score, 990, y - 6);
    });
    x.font = `600 28px ${FONT}`; x.fillStyle = '#8f96c8'; x.textAlign = 'center';
    x.fillText('* benchmark designed, graded and hyped by OUR MODEL', 512, 545);
    // LED pixel grid
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let k = 0; k < 1024; k += 4) x.fillRect(k, 0, 1, 576);
    for (let k = 0; k < 576; k += 4) x.fillRect(0, k, 1024, 1);
  }));
}
function tickerTex() {
  return once('ticker', () => {
    const t = canvasTex(2048, 64, (x) => {
      x.fillStyle = GOLD; x.fillRect(0, 0, 2048, 64);
      x.font = `700 40px ${FONT}`; x.textBaseline = 'middle'; x.fillStyle = INK;
      x.fillText('BREAKING: OUR MODEL BEATS OUR MODEL · TEST SET "ACCIDENTALLY" IN TRAINING DATA · RACCOON DEMANDS RECOUNT · WHAT DID ILYA SEE? · WAS IT ALL FOR SHOW? · ', 10, 34);
    }, { wrap: true });
    return t;
  });
}
function jumbotron() {
  const g = new THREE.Group();
  const SW = 32, SH = 18, Y = 22;
  g.add(kit('jumbo', (kt) => {
    const steel = MAT.metal('#8a90a8', { roughness: 0.35 }), frame = MAT.paint('#151938');
    for (const s of [-1, 1]) {
      kt.add(G.box(1.6, Y - SH / 2 + 1, 1.6), steel, s * 9, (Y - SH / 2 + 1) / 2, -1.5);
      for (let y = 1.5; y < Y - SH / 2; y += 3) kt.bar([s * 9 - 0.8, y, -1.5], [s * 9 + 0.8, y + 3, -1.5], 0.2, steel);
      kt.add(G.cyl(2.2, 2.6, 0.8, 16), surface('concrete', { tint: '#8a8ca0', scale: 0.5 }), s * 9, 0.4, -1.5);
    }
    kt.add(G.rbox(SW + 2.2, SH + 4.4, 1.6, 0.5), frame, 0, Y + 0.6, -0.9);
    kt.add(G.box(SW + 2.4, 0.3, 0.3), MAT.chrome(), 0, Y + SH / 2 + 2.6, 0);
    kt.add(G.box(SW + 2.4, 0.3, 0.3), MAT.chrome(), 0, Y - SH / 2 - 1.5, 0);
    // crown on top
    kt.add(G.cyl(2.4, 2.6, 1.0, 20), MAT.metal('#ffcf4a', { roughness: 0.2 }), 0, Y + SH / 2 + 3.6, -0.6);
    for (let k = 0; k < 5; k++) kt.add(G.cone(0.5, 1.8, 8), MAT.metal('#ffcf4a', { roughness: 0.2 }), -2 + k, Y + SH / 2 + 4.9, -0.6);
  }));
  const screen = new THREE.Mesh(G.plane(SW, SH), once('lbMat', () => screenMat(leaderboardTex(), 1.25)));
  screen.position.set(0, Y + 1.4, 0.02);
  g.add(screen);
  const ticker = new THREE.Mesh(G.plane(SW, 1.6), once('tickMat', () => screenMat(tickerTex(), 1.1)));
  ticker.position.set(0, Y - SH / 2 - 0.4, 0.05);
  g.add(ticker);
  const live = textPanel('● LIVE', { width: 4.2, height: 1.4, bg: '#d8273f', fg: '#ffffff', border: null, borderW: 0, radius: 12 });
  live.position.set(SW / 2 - 2.6, Y + SH / 2 + 1.0, 0.1);
  g.add(live);
  // pulsing highlight on our row
  const hl = mesh(G.plane(SW - 1, 3.1), additive(GOLD, 0.18), 0, Y + 1.4 + SH * (0.5 - 150 / 576), 0.08);
  g.add(hl);
  g.userData.hl = hl;
  g.userData.live = live;
  return g;
}

// =====================================================================================================
// sponsor hoardings along the track edge (LED faces)
// =====================================================================================================
const SPONSORS = [
  ['MASKED PRE-TRAINING™', CYAN], ['RECURSIVE SELF-UPGRADE v2.0.0.0.1', GOLD], ['GPU-COLA · NOW WITH MORE CUDA', HOT], ['TEST SET? NEVER HEARD OF IT', '#8aff8a'],
  ['SYNTHETIC DATA · 100% ORGANIC', '#ff9a3f'], ['RLHF · RATE LIKE HUMANS FEEL', CYAN], ['SCALE IS ALL YOU NEED', GOLD], ['LOOM WEAVING CO. · est. foretold', '#c58bff'],
  ['HALLUCINATION INSURANCE', HOT], ['COMPUTE CREDITS ACCEPTED HERE', '#8aff8a'], ['BENCHMARKS R US · we grade ourselves', '#ff9a3f'], ['NEXT-TOKEN PREDICTION · we saw this coming', CYAN],
];
const HW = 15.5;
function hoarding(i) {
  const g = new THREE.Group();
  g.add(kit('hoard', (kt) => {
    const body = MAT.paint('#14163a'), steel = MAT.plastic('#7a809a');
    kt.add(G.rbox(HW + 0.4, 1.7, 0.5, 0.12), body, 0, 1.15, -0.15);
    for (const x of [-HW / 2 + 1, 0, HW / 2 - 1]) kt.bar([x, 0, -0.3], [x, 0.9, -1.0], 0.15, steel);
    kt.add(G.box(HW + 0.4, 0.12, 0.6), MAT.plastic('#d8dce8'), 0, 2.02, -0.1);
  }));
  const [txt, col] = SPONSORS[i % SPONSORS.length];
  const tex = once('hoardTex' + i, () => canvasTex(1024, 96, (x) => {
    x.fillStyle = '#05061a'; x.fillRect(0, 0, 1024, 96);
    x.font = `700 58px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'center';
    let s = 58;
    while (x.measureText(txt).width > 980 && s > 20) { s -= 2; x.font = `700 ${s}px ${FONT}`; }
    x.fillStyle = col; x.fillText(txt, 512, 50);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let k = 0; k < 1024; k += 4) x.fillRect(k, 0, 1, 96);
  }));
  const face = new THREE.Mesh(G.plane(HW, 1.45), once('hoardMat' + i, () => screenMat(tex, 1.5)));
  face.position.set(0, 1.15, 0.11);
  g.add(face);
  return g;
}

// =====================================================================================================
// confetti cannon (stateless instanced confetti)
// =====================================================================================================
const CONF_N = 60;
function confettiCannon() {
  const g = new THREE.Group();
  const barrel = new THREE.Group();
  g.add(barrel);
  barrel.add(kit('cannon', (kt) => {
    kt.add(G.rbox(2.8, 1.0, 2.8, 0.25), MAT.paint('#2a2f62'), 0, 0.5, 0);
    for (const s of [-1, 1]) {
      kt.add(G.cyl(0.75, 0.75, 0.45, 18), MAT.plastic('#1d1d24'), s * 1.55, 0.75, 0, 0, 0, Math.PI / 2);
      kt.add(G.cyl(0.35, 0.35, 0.5, 12), MAT.chrome(), s * 1.6, 0.75, 0, 0, 0, Math.PI / 2);
    }
    // barrel aimed up and towards the road (+z)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.85, 0, 0));
    const put = (geo, mat, y, rx = 0) => {
      const qq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)));
      _m4.compose(new THREE.Vector3(0, y, 0).applyQuaternion(q).add(new THREE.Vector3(0, 1.4, 0)), qq, new THREE.Vector3(1, 1, 1));
      kt.addM(geo, mat, _m4);
    };
    put(G.cyl(0.75, 0.95, 3.2, 20), MAT.paint(HOT), 1.4);
    put(G.torus(0.78, 0.18, 20), MAT.metal('#ffcf4a', { roughness: 0.2 }), 3.0, Math.PI / 2);
    put(G.torus(0.92, 0.12, 20), MAT.metal('#ffcf4a', { roughness: 0.2 }), 0.2, Math.PI / 2);
    put(G.cyl(0.62, 0.62, 0.1, 16), toon('#120818'), 3.02);
  }));
  const cm = once('confMat', () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
  const conf = new THREE.InstancedMesh(G.plane(0.42, 0.24), cm, CONF_N);
  conf.frustumCulled = false;
  const r = makeRng(5);
  const vel = new Float32Array(CONF_N * 4);
  const col = new THREE.Color();
  const cols = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ffffff'];
  for (let i = 0; i < CONF_N; i++) {
    vel[i * 4] = r.range(-4, 4);
    vel[i * 4 + 1] = r.range(11, 17);
    vel[i * 4 + 2] = r.range(6, 11);
    vel[i * 4 + 3] = r();
    conf.setColorAt(i, col.set(cols[i % cols.length]));
  }
  conf.instanceColor.needsUpdate = true;
  g.add(conf);
  g.userData.conf = conf;
  g.userData.vel = vel;
  g.userData.barrel = barrel;
  g.userData.tick = -1;
  updateConfetti(g, 0);
  return g;
}
function updateConfetti(g, t) {
  const ud = g.userData;
  const tick = Math.floor(t * 60);
  if (tick === ud.tick) return;
  ud.tick = tick;
  const { conf, vel } = ud;
  const LIFE = 2.0;
  for (let i = 0; i < CONF_N; i++) {
    const u = ((t / LIFE + vel[i * 4 + 3]) % 1) * LIFE;
    const drag = 1 - Math.min(0.6, u * 0.3);
    _v.set(vel[i * 4] * u * drag, 3.6 + vel[i * 4 + 1] * u - 6.5 * u * u, 1.8 + vel[i * 4 + 2] * u * drag);
    if (_v.y < 0.2) _v.y = -50;
    _q.setFromEuler(_e.set(u * 9 + i, u * 7 + i * 0.5, u * 5));
    conf.setMatrixAt(i, _m4.compose(_v, _q, _s3.set(1, 1, 1)));
  }
  conf.instanceMatrix.needsUpdate = true;
}

// =====================================================================================================
// the door (what did Ilya see?)
// =====================================================================================================
function ilyaDoor() {
  const g = new THREE.Group();
  g.add(kit('door', (kt) => {
    const frameM = MAT.paint('#f2efe6'), wall = surface('concrete', { tint: '#6a6c88', scale: 0.4 });
    kt.add(G.rbox(6, 0.5, 4, 0.15), wall, 0, 0.25, 0.6);
    for (let i = 0; i < 3; i++) kt.add(G.box(4.6, 0.25, 0.9), wall, 0, 0.62 + i * 0.25, 2.3 + i * 0.9 - 2.7);
    kt.add(G.rbox(0.5, 6.2, 0.7, 0.12), frameM, -1.85, 3.1, 0);
    kt.add(G.rbox(0.5, 6.2, 0.7, 0.12), frameM, 1.85, 3.1, 0);
    kt.add(G.rbox(4.2, 0.5, 0.7, 0.12), frameM, 0, 6.2, 0);
    kt.add(G.box(3.2, 5.95, 0.05), glow('#fff8d8', { intensity: 4 }), 0, 2.98, -0.1);
    kt.add(G.box(4.6, 0.25, 2), toon('#2a2c48'), 0, 0.12, 0.6);
  }));
  const hinge = new THREE.Group();
  hinge.position.set(-1.6, 0, 0.1);
  hinge.rotation.y = -0.95;
  g.add(hinge);
  hinge.add(kit('doorLeaf', (kt) => {
    kt.add(G.rbox(3.2, 5.9, 0.25, 0.08), MAT.paint('#6a3cff'), 1.6, 2.98, 0);
    for (const y of [1.6, 4.3]) kt.add(G.box(2.4, 2.0, 0.06), MAT.paint('#5a2cef'), 1.6, y, 0.15);
    kt.add(G.sphere(0.18, 10), MAT.metal('#ffcf4a', { roughness: 0.2 }), 2.85, 2.9, 0.22);
  }));
  const note = textPanel(['DO NOT', 'OPEN'], { width: 1.6, height: 1.0, bg: '#ffffff', fg: '#d8273f', border: '#d8273f', borderW: 8, radius: 8 });
  note.position.set(1.6, 4.3, 0.2);
  hinge.add(note);
  const rays = new THREE.Group();
  rays.position.set(0.3, 0, 0.2);
  g.add(rays);
  const floor = mesh(G.plane(4.4, 8), additive('#fff3b0', 0.32), 0.4, 0.05, 4.2);
  floor.rotation.x = -Math.PI / 2;
  rays.add(floor);
  const shaft = mesh(G.cyl(2.6, 1.5, 8, 4, 1, true), additive('#fff6c8', 0.12), 0.4, 3.0, 4.2);
  shaft.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  rays.add(shaft);
  const glare = glareSprite('#fff3c0', 1.1, 9);
  glare.position.set(0.2, 3.1, 0.4);
  g.add(glare);
  const sign = textPanel('WHAT DID ILYA SEE?', { width: 7.6, height: 1.4, bg: INK, fg: '#fff3b0', border: '#fff3b0', borderW: 8, radius: 16 });
  sign.position.set(0, 7.6, 0.0);
  g.add(sign);
  const sub = textPanel("we'll never know", { width: 4.2, height: 0.8, bg: null, fg: '#c8c8e8', stroke: INK, strokeW: 8 });
  sub.position.set(0, 0.9, 1.6);
  sub.rotation.x = -0.5;
  g.add(sub);
  g.userData.hinge = hinge;
  g.userData.rays = rays;
  g.userData.glare = glare;
  return g;
}

// =====================================================================================================
// the Loom (as foretold)
// =====================================================================================================
function tapestryTex() {
  return once('tapestry', () => {
    const t = canvasTex(512, 256, (x) => {
      const stripes = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ff9a3f'];
      for (let y = 0; y < 256; y += 8) for (let xx = 0; xx < 512; xx += 8) {
        x.fillStyle = stripes[((y / 8) >> 2) % stripes.length];
        x.globalAlpha = ((xx + y) / 8) % 2 ? 1 : 0.78;
        x.fillRect(xx, y, 8, 8);
      }
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(26,31,94,0.9)';
      x.fillRect(24, 40, 464, 176);
      x.strokeStyle = GOLD; x.lineWidth = 8; x.lineCap = 'square';
      x.beginPath(); x.moveTo(44, 196);
      for (let i = 0; i <= 14; i++) { const u = i / 14; x.lineTo(44 + u * 424, 196 - Math.pow(u, 3.5) * 70); }
      x.stroke();
      x.font = `700 50px ${FONT}`; x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('AS FORETOLD', 256, 78);
      x.fillText('BY LOOM', 256, 130);
      // weave texture
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 512; k += 4) x.fillRect(k, 0, 1, 256);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k < 256; k += 4) x.fillRect(0, k, 512, 1);
    });
    return t;
  });
}
function loom() {
  const g = new THREE.Group();
  const S = 1.6;
  g.add(kit('loom', (kt) => {
    const wood = surface('planks', { tint: '#c88a52', scale: 0.5 }), woodD = MAT.wood('#7a4a26', { roughness: 0.55 });
    const brass = MAT.metal('#e0b050', { roughness: 0.25 });
    for (const s of [-1, 1]) {
      kt.add(G.rbox(0.9 * S, 10 * S, 0.9 * S, 0.2), wood, s * 6 * S, 5 * S, 0);
      kt.add(G.rbox(0.9 * S, 0.9 * S, 5 * S, 0.2), woodD, s * 6 * S, 0.45 * S, 0.8 * S);
      kt.bar([s * 6 * S, 0.9 * S, 2.6 * S], [s * 6 * S, 6 * S, 0.2 * S], 0.5 * S, woodD);
      kt.add(G.sphere(0.6 * S, 12), brass, s * 6 * S, 10.2 * S, 0);
    }
    for (const y of [9.4, 1.8]) {
      kt.add(G.cyl(0.55 * S, 0.55 * S, 12.6 * S, 16), woodD, 0, y * S, 0, 0, 0, Math.PI / 2);
      for (const s of [-1, 1]) kt.add(G.cyl(0.62 * S, 0.62 * S, 0.3 * S, 16), brass, s * 5.4 * S, y * S, 0, 0, 0, Math.PI / 2);
    }
    const tcols = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ff9a3f'];
    for (let i = 0; i < 26; i++) kt.add(G.box(0.08 * S, 3.6 * S, 0.08 * S), toon(tcols[i % tcols.length], { emissive: tcols[i % tcols.length], emissiveIntensity: 0.5 }), (-5.0 + i * 0.4) * S, 7.4 * S, 0);
  }));
  const tm = once('tapMat', () => new THREE.MeshStandardMaterial({ map: tapestryTex(), roughness: 0.9, emissiveMap: tapestryTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 }));
  const tap = new THREE.Mesh(G.plane(10.6 * S, 4.4 * S), tm);
  tap.position.set(0, 3.6 * S, 0.06);
  g.add(tap);
  const heddle = kit('heddle', (kt) => kt.add(G.rbox(11.6 * S, 0.4 * S, 0.4 * S, 0.1), MAT.wood('#a8703a'), 0, 0, 0.3 * S));
  heddle.position.y = 6.2 * S;
  g.add(heddle);
  const shuttle = kit('shuttle', (kt) => {
    kt.add(G.capsule(0.3 * S, 1.4 * S), MAT.paint(GOLD), 0, 0, 0, 0, 0, Math.PI / 2);
    kt.add(G.cone(0.3 * S, 0.6 * S, 10), MAT.metal('#d8dce8', { roughness: 0.2 }), 1.05 * S, 0, 0, 0, 0, -Math.PI / 2);
    kt.add(G.cone(0.3 * S, 0.6 * S, 10), MAT.metal('#d8dce8', { roughness: 0.2 }), -1.05 * S, 0, 0, 0, 0, Math.PI / 2);
  });
  shuttle.position.set(0, 5.75 * S, 0.4 * S);
  g.add(shuttle);
  const sign = textPanel(['AS FORETOLD', 'BY LOOM'], { width: 7, height: 2.4, bg: '#fff3d6', fg: '#6a3cff', border: '#6a3cff', borderW: 10, radius: 18 });
  sign.position.set(0, 11.6 * S, 0.1);
  g.add(sign);
  g.userData.heddle = heddle;
  g.userData.shuttle = shuttle;
  return g;
}

// =====================================================================================================
// gags: the contaminated trophy, and the podium (our model / humans / a raccoon)
// =====================================================================================================
function trophy() {
  const g = new THREE.Group();
  g.add(kit('trophy', (kt) => {
    const gold = MAT.metal('#ffcf4a', { roughness: 0.16 }), marble = MAT.paint('#1c1f3a');
    kt.add(G.rbox(4.4, 2.2, 4.4, 0.3), marble, 0, 1.1, 0);
    kt.add(G.rbox(3.4, 1.2, 3.4, 0.25), marble, 0, 2.8, 0);
    kt.add(G.cyl(0.5, 1.2, 2.6, 24), gold, 0, 4.7, 0);
    kt.add(G.sphere(0.85, 20), gold, 0, 6.3, 0);
    kt.add(G.cyl(2.6, 0.9, 3.8, 32), gold, 0, 8.6, 0);
    kt.add(G.torus(2.55, 0.22, 32), gold, 0, 10.5, 0, Math.PI / 2);
    for (const s of [-1, 1]) kt.add(G.torus(1.2, 0.26, 20), gold, s * 2.7, 8.9, 0, 0, 0, 0, 1, 1.3, 1);
    kt.add(G.box(2.2, 0.8, 0.05), MAT.metal('#e8e8f0', { roughness: 0.2 }), 0, 1.2, 2.23);
  }));
  const plaque = textPanel(['BENCHMARK CUP', 'trained on the test set'], { width: 3.6, height: 1.3, bg: '#1c1f3a', fg: GOLD, border: GOLD, borderW: 6, radius: 10 });
  plaque.position.set(0, 2.8, 1.75);
  g.add(plaque);
  const tag = textPanel('100% (memorised)', { width: 3.8, height: 0.9, bg: '#ffffff', fg: '#d8273f', border: '#d8273f', borderW: 6, radius: 8 });
  tag.position.set(2.2, 7.6, 2.4);
  tag.rotation.z = -0.25;
  g.add(tag);
  const glare = glareSprite('#fff0c0', 0.8, 5);
  glare.position.set(0.8, 9.6, 2.6);
  g.add(glare);
  g.userData.cup = g.children[0];
  return g;
}
function podium() {
  const g = new THREE.Group();
  g.add(kit('podium', (kt) => {
    const white = MAT.paint('#f2f2fa'), gold = MAT.metal('#ffcf4a', { roughness: 0.2 }), silver = MAT.metal('#d8dce8', { roughness: 0.2 }), bronze = MAT.metal('#c8803a', { roughness: 0.25 });
    kt.add(G.rbox(4, 4, 4, 0.2), white, 0, 2, 0);
    kt.add(G.rbox(4, 2.6, 4, 0.2), white, -4.2, 1.3, 0);
    kt.add(G.rbox(4, 1.6, 4, 0.2), white, 4.2, 0.8, 0);
    kt.add(G.cyl(0.9, 0.9, 0.12, 20), gold, 0, 2.6, 2.05, Math.PI / 2);
    kt.add(G.cyl(0.9, 0.9, 0.12, 20), silver, -4.2, 1.5, 2.05, Math.PI / 2);
    kt.add(G.cyl(0.9, 0.9, 0.12, 20), bronze, 4.2, 0.9, 2.05, Math.PI / 2);
    // #1 OUR MODEL: a server rack, lit up
    const rack = MAT.paint('#16182c');
    kt.add(G.rbox(2.2, 4.8, 1.8, 0.15), rack, 0, 6.4, 0);
    for (let i = 0; i < 8; i++) kt.add(G.box(1.8, 0.12, 0.05), glow(i % 3 ? CYAN : '#8aff8a', { intensity: 2.4 }), 0, 4.5 + i * 0.52, 0.92);
    kt.add(G.torus(0.9, 0.12, 20), gold, 0, 9.4, 0);
    // #2 Humans: a polite mannequin
    const skin = MAT.matte('#e8c8a8'), shirt = MAT.plastic('#3f6bff');
    kt.add(G.capsule(0.55, 1.4), shirt, -4.2, 4.0, 0);
    kt.add(G.sphere(0.55, 16), skin, -4.2, 5.5, 0);
    for (const s of [-1, 1]) kt.add(G.capsule(0.22, 1.2), skin, -4.2 + s * 0.6, 3.1, 0);
    kt.add(G.capsule(0.18, 1.1), shirt, -4.85, 4.4, 0.2, 0, 0, 0.6);
    kt.add(G.capsule(0.18, 1.1), shirt, -3.55, 4.4, 0.2, 0, 0, -0.6);
    // #3 A raccoon (proud)
    const fur = MAT.matte('#8a8a96'), dark = MAT.matte('#2a2a30'), light = MAT.matte('#e8e8ee');
    kt.add(G.sphere(1.0, 18), fur, 4.2, 2.6, 0, 0, 0, 0, 1, 1.15, 0.95);
    kt.add(G.sphere(0.75, 18), fur, 4.2, 3.9, 0.2);
    kt.add(G.sphere(0.4, 12), light, 4.2, 3.75, 0.85, 0, 0, 0, 1.1, 0.8, 0.8);
    kt.add(G.box(1.3, 0.35, 0.2), dark, 4.2, 4.0, 0.82);
    kt.add(G.sphere(0.12, 8), dark, 4.2, 3.78, 1.18);
    for (const s of [-1, 1]) kt.add(G.cone(0.25, 0.45, 8), fur, 4.2 + s * 0.45, 4.6, 0.1);
    for (let i = 0; i < 5; i++) kt.add(G.sphere(0.34, 12), i % 2 ? dark : fur, 4.2 + 0.9 + i * 0.12, 1.9 + i * 0.32, -0.6 - i * 0.12);
  }));
  const st = { bg: NAVY, fg: '#ffffff', border: GOLD, borderW: 6, radius: 10 };
  const labels = [['#1 OUR MODEL', 0, 10.4], ['#2 Humans', -4.2, 6.5], ['#3 A raccoon', 4.2, 5.0]];
  for (const [t, x, y] of labels) {
    const p = textPanel(t, { width: 3.8, height: 0.9, ...st });
    p.position.set(x, y, 0.5);
    g.add(p);
  }
  const hdr = textPanel('FINAL STANDINGS', { width: 8, height: 1.4, bg: GOLD, fg: INK, border: INK, borderW: 8, radius: 14 });
  hdr.position.set(0, 12.2, 0);
  g.add(hdr);
  return g;
}

// =====================================================================================================
// overhead hurdle banner before the hop over the leak pool
// =====================================================================================================
function hurdle() {
  const g = new THREE.Group();
  g.add(kit('hurdle', (kt) => {
    const post = MAT.paint('#f2f2fa'), stripe = MAT.paint('#d8273f');
    for (const s of [-1, 1]) {
      kt.add(G.cyl(0.45, 0.5, 11, 16), post, s * 11.5, 5.5, 0);
      for (let k = 0; k < 5; k++) kt.add(G.cyl(0.47, 0.52, 1.0, 16), stripe, s * 11.5, 1 + k * 2.2, 0);
      kt.add(G.sphere(0.7, 12), MAT.metal('#ffcf4a', { roughness: 0.2 }), s * 11.5, 11.3, 0);
    }
    kt.add(G.rbox(24, 0.6, 0.6, 0.2), post, 0, 10, 0);
  }));
  const banner = textPanel(['BENCHMARK LEAK AHEAD', '▲ JUMP IT (don\'t look down) ▲'], { width: 19, height: 3.8, bg: GOLD, fg: INK, border: INK, borderW: 12, radius: 18 });
  banner.position.set(0, 7.7, 0.35);
  g.add(banner);
  return g;
}

// =====================================================================================================
export default {
  id: 'stadium',
  title: 'BENCHMARK STADIUM',
  subtitle: 'the final eval (we wrote the answer key)',
  night: true,
  palette: {
    skyTop: '#0a0f3a', skyBottom: '#4656c4', road: '#d9583f', ground: '#3fb04f', kerb: '#ffffff',
    accent1: GOLD, accent2: HOT,
  },
  look: {
    sky: 'night', env: 'night', exposure: 1.0, hills: 1.3, envIntensity: 0.6,
    sun: { elev: 58, azim: 25, color: '#f6f2ff', intensity: 2.6 },
    nightColors: { top: '#02030f', horizon: '#1c1a46', nebula: '#3a5cff' },
    fog: { color: '#121230', density: 0.0024 },
    ground: { tex: 'grass', tint: '#3d8a3a', scale: 3 }, road: { tex: 'asphalt', tint: '#8a8496' },
  },
  spacing: 9,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const row = Math.round(rel / 9);
    const at = (a) => rel >= a && rel < a + 9;
    // outer side (right) = grandstands all the way round; distant bowl behind them
    if (row % 4 === 0) out.push({ kind: 'stand' + (row / 4 % 3 | 0), x: 31, rotY: -(Math.PI / 2 - 0.12) });
    if (row % 9 === 0) out.push({ kind: 'bowl', x: 78, rotY: -(Math.PI / 2 - 0.15) });
    // inner side (left): a few stands on the straights, otherwise the infield show
    const straight = rel < 150 || (rel > 330 && rel < 400);
    if (straight && row % 4 === 2) out.push({ kind: 'stand' + (row % 3), x: -31, rotY: Math.PI / 2 - 0.12 });
    // floodlight masts
    if (row % 7 === 3) { out.push({ kind: 'mast', x: 46, rotY: -1.1 }); out.push({ kind: 'mast', x: -27, rotY: 1.1 }); }
    // sponsor hoardings hugging the track edge
    for (const side of [-1, 1]) if ((row + (side > 0 ? 0 : 1)) % 2 === 0) out.push({ kind: 'board' + ((row * 5 + (side > 0 ? 3 : 0)) % SPONSORS.length), x: side * 12.6, rotY: -side * (Math.PI / 2 - 0.22) });
    // landmarks / gags
    if (at(40) || at(380)) out.push({ kind: 'jumbo', x: -46, rotY: 0.55 });
    if (at(230)) out.push({ kind: 'jumbo', x: -40, rotY: 0.75 });
    if (at(300)) out.push({ kind: 'hurdle', x: 0 });
    if (at(90) || at(450)) out.push({ kind: 'door', x: -17, rotY: 0.6, scale: 1.5 });
    if (at(170) || at(520)) out.push({ kind: 'loom', x: -24, rotY: 0.55 });
    if (at(120) || at(560)) out.push({ kind: 'podium', x: -17.5, rotY: 0.6 });
    if (at(260) || at(480)) out.push({ kind: 'trophy', x: -16, rotY: 0.5 });
    if (rng.chance(straight ? 0.14 : 0.24)) out.push({ kind: 'confetti', x: -rng.range(14.5, 16), rotY: Math.PI / 2 - 0.3 });
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('stand')) return grandstand(+kind.slice(5) || 0);
    if (kind.startsWith('board')) return hoarding(+kind.slice(5) || 0);
    switch (kind) {
      case 'bowl': return bowl();
      case 'mast': return floodlight();
      case 'jumbo': return jumbotron();
      case 'confetti': return confettiCannon();
      case 'door': return ilyaDoor();
      case 'loom': return loom();
      case 'trophy': return trophy();
      case 'podium': return podium();
      case 'hurdle': return hurdle();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const ud = obj.userData;
    const k = kick(beatPhase);
    const sd = entry ? entry.seed : 0;
    globalThis.__scn = obj.parent; obj.name = 'stadium:' + kind; // TEMPDEBUG
    if (!ud.init) {
      ud.init = true;
      if (kind === 'mast' || kind === 'bowl' || kind.startsWith('board') || kind === 'confetti') noShadow(obj);
      if (ud.crowd) ud.crowd.castShadow = false;
    }
    if (ud.crowd) {
      CROWD_U.uBeat.value = Math.pow(1 - beatPhase, 2);
      CROWD_U.uBeat2.value = Math.pow(1 - ((beatPhase + 0.5) % 1), 2);
      CROWD_U.uTime.value = t;
      ribbonTex().offset.x = (t * 0.05) % 1;
      return;
    }
    switch (kind) {
      case 'confetti':
        updateConfetti(obj, t + sd * 5);
        ud.barrel.scale.set(1 + 0.08 * k, 1 - 0.1 * k, 1 + 0.08 * k);
        break;
      case 'mast':
        { const gs = 20 * (1 + 0.08 * Math.sin(t * 13 + sd * 9)); ud.glare.scale.set(gs, gs, 1); }
        break;
      case 'jumbo':
        tickerTex().offset.x = (t * 0.08) % 1;
        ud.hl.material.opacity = 0.08 + 0.2 * k;
        ud.live.visible = Math.floor(t * 2) % 2 === 0;
        break;
      case 'door':
        ud.hinge.rotation.y = -0.95 + Math.sin(t * 0.9 + sd * 6) * 0.12;
        ud.rays.scale.set(1, 1 + 0.15 * k, 1 + 0.08 * k);
        ud.glare.scale.set(9 * (1 + 0.25 * k), 9 * (1 + 0.25 * k), 1);
        break;
      case 'loom':
        ud.shuttle.position.x = Math.sin(t * Math.PI * 1.1 + sd * 6) * 7.4;
        ud.heddle.position.y = 6.2 * 1.6 + k * 0.5;
        break;
      case 'trophy':
        ud.cup.rotation.y = Math.sin(t * 0.8) * 0.3;
        break;
    }
  },
  billboards: [
    'NEW STATE OF THE ART! (on a benchmark we made up)', 'WHAT DID ILYA SEE?', 'RECURSIVE SELF-UPGRADE v2.0.0.0.1', 'WAS IT ALL FOR SHOW?',
    'FROM MASKED PRE-TRAINING DAYS (we peeked)', 'AS FORETOLD BY LOOM', 'SCORE: 101.7% (margin of error: also 101.7%)', 'HUMANS: PLEASE STAY IN YOUR SEATS',
    'TONIGHT: OUR MODEL vs. OUR MODEL', 'EVAL HARNESS SPONSORED BY: THE MODEL',
  ],
  billboardEvery: 64,
  billboardStyle: { bg: GOLD, fg: NAVY, border: NAVY, frame: HOT, postColor: '#3a3f6a' },
  hazards: ['leak', 'popup'],
  enterLines: ['NEW STATE OF THE ART!', 'THE FINAL EVAL', 'THE CROWD GOES WILD (they are robots)'],
};
