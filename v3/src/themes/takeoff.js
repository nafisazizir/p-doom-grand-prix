// TAKEOFF (final outro): a launch complex at dusk, then space. The road ramps exponentially (~320 m) and the
// kart launches into the sky as the song ends. v3: red steel deck rails with chevrons line the whole ramp and tilt
// with it into space, acceleration gates span the road, floodlight masts, fuel tanks, a radar dish, container stacks,
// an investor viewing deck; in space the ramp rides on lattice pylons past satellites and a ringed planet. Red/white lattice gantries with rockets that lift off as you pass,
// billowing smoke at the ramp base, alarm beacons, a colossal live P(DOOM) scoreboard, bouncing FOOM letters,
// RECURSIVE SELF-IMPROVEMENT: ENABLED, ALIGNMENT: WE'LL FIGURE IT OUT LATER, a Vehicle Assembly Building next to
// a tiny alignment shed, glowing launch hoops, and a Dyson sphere under construction (phase 1 of ∞).
import { THREE, glow, G, mesh, textPanel, makeRng, FONT, MAT } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surface } from '../textures.js';
import { SPEED, Course } from '../course.js';
import { cardboardStand, KIT_U } from './garage.js';

const RED = '#ff2a4a', YEL = '#ffd23f', INK = '#2b1840', ORANGE = '#ff7a1f';
const TAU = Math.PI * 2;
const kick = (bp) => Math.pow(1 - bp, 3);
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s3 = new THREE.Vector3(1, 1, 1);
const SPACE_REL = (150 - 141.224) * SPEED; // past this the course is in space (no terrain, props float)

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
  return mat.metalness > 0.5 ? 'metal' : mat.roughness < 0.6 ? 'gloss' : 'matte';
}
function vcMat(key) {
  let m = VCM.get(key);
  if (m) return m;
  if (key === 'basic') m = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (key === 'metal') m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 1 });
  else if (key === 'gloss') m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  VCM.set(key, m);
  return m;
}
class Kit {
  constructor() { this.parts = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _o3.position.set(x, y, z); _o3.rotation.set(rx, ry, rz); _o3.scale.set(sx, sy, sz); _o3.updateMatrix();
    return this.addM(geo, mat, _o3.matrix);
  }
  addM(geo, mat, m, tint = null) {
    const key = tint ? null : vcKey(mat);
    const color = tint || (key ? mat.color : null);
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
function glareTex() {
  return once('glare', () => canvasTex(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,240,210,0.7)'); g.addColorStop(0.45, 'rgba(255,220,180,0.12)'); g.addColorStop(1, 'rgba(255,220,180,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }));
}
function glareSprite(color, k, size) {
  const m = once('glare' + color + k, () => {
    const mm = new THREE.SpriteMaterial({ map: glareTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color });
    mm.color.multiplyScalar(k);
    return mm;
  });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}
function noShadow(obj) { obj.traverse((o) => { if (o.isMesh) o.castShadow = false; }); }

// =====================================================================================================
// red/white lattice (shared by gantries and towers)
// =====================================================================================================
function lattice(kt, H, R, step, red, white, ox = 0, oy = 0, oz = 0) {
  for (const sx of [-R, R]) for (const sz of [-R, R]) kt.add(G.box(0.42, H, 0.42), red, ox + sx, oy + H / 2, oz + sz);
  let k = 0;
  for (let y = step * 0.5; y < H; y += step, k++) {
    const c = k % 2 ? red : white, Y = oy + y;
    kt.add(G.box(2 * R + 0.4, 0.28, 0.28), c, ox, Y, oz + R); kt.add(G.box(2 * R + 0.4, 0.28, 0.28), c, ox, Y, oz - R);
    kt.add(G.box(0.28, 0.28, 2 * R + 0.4), c, ox + R, Y, oz); kt.add(G.box(0.28, 0.28, 2 * R + 0.4), c, ox - R, Y, oz);
    if (y + step < H) {
      const s = k % 2 ? 1 : -1;
      kt.bar([ox - R, Y, oz + R + 0.05], [ox + R, Y + step, oz + R + 0.05], 0.18, white);
      kt.bar([ox + R, Y, oz - R - 0.05], [ox - R, Y + step, oz - R - 0.05], 0.18, white);
      kt.bar([ox + R + 0.05, Y, oz + s * R], [ox + R + 0.05, Y + step, oz - s * R], 0.18, white);
      kt.bar([ox - R - 0.05, Y, oz - s * R], [ox - R - 0.05, Y + step, oz + s * R], 0.18, white);
    }
  }
}

// =====================================================================================================
// alarm beacon (spinning)
// =====================================================================================================
function beacon() {
  const g = new THREE.Group();
  g.add(kit('beacon', (kt) => {
    kt.add(G.cyl(0.55, 0.7, 0.35, 14), MAT.plastic('#2a2a34'), 0, 0.17, 0);
    kt.add(G.cyl(0.12, 0.12, 4.2, 8), MAT.metal('#9a9aa8'), 0, 2.3, 0);
    for (let k = 0; k < 6; k++) kt.add(G.box(0.26, 0.5, 0.26), k % 2 ? MAT.plastic(YEL) : MAT.plastic('#18181e'), 0, 1 + k * 0.5, 0);
    kt.add(G.cyl(0.5, 0.55, 0.3, 16), MAT.plastic('#18181e'), 0, 4.45, 0);
  }));
  const dome = mesh(G.sphere(0.45, 14), glow(RED, { intensity: 3.2 }), 0, 4.75, 0);
  g.add(dome);
  const spin = new THREE.Group();
  spin.position.set(0, 4.75, 0);
  const bm = additive('#ff4a3a', 0.07);
  for (const s of [1, -1]) {
    const b = mesh(G.cone(0.55, 2.4, 14, 1), bm, s * 1.2, 0, 0);
    b.rotation.z = s * Math.PI / 2;
    spin.add(b);
  }
  g.add(spin);
  g.userData.spin = spin;
  g.userData.dome = dome;
  return g;
}

// =====================================================================================================
// big gantry + rocket that lifts off as you pass (smoke + flame)
// =====================================================================================================
function rocketBody(kt, color) {
  const white = MAT.paint('#f2f0ea'), black = MAT.paint('#1a1a22'), col = MAT.paint(color), chrome = MAT.metal('#c8ccd8', { roughness: 0.2 });
  const R = 2.2;
  kt.add(G.cyl(R, R, 12, 28), white, 0, 7, 0);
  kt.add(G.cyl(R + 0.03, R + 0.03, 1.4, 28), black, 0, 3.0, 0);
  kt.add(G.cyl(R + 0.03, R + 0.03, 0.6, 28), col, 0, 12.6, 0);
  kt.add(G.cyl(R * 0.85, R, 1.2, 28), black, 0, 13.6, 0);
  kt.add(G.cyl(R * 0.85, R * 0.85, 6, 28), white, 0, 17.2, 0);
  kt.add(G.cyl(R * 0.87, R * 0.87, 0.5, 28), black, 0, 15.4, 0);
  kt.add(G.cone(R * 0.85, 5, 28), col, 0, 22.7, 0);
  kt.add(G.cyl(0.12, 0.12, 2.4, 6), chrome, 0, 26.2, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    kt.add(G.rbox(0.35, 4.2, 2.4, 0.12), col, Math.sin(a) * (R + 1.0), 2.4, Math.cos(a) * (R + 1.0), 0, a, 0);
    kt.add(G.cyl(0.75, 1.0, 1.6, 16), chrome, Math.sin(a) * 1.1, 0.2, Math.cos(a) * 1.1);
  }
  kt.add(G.cyl(0.5, 0.5, 0.1, 16), glow('#7af7ff', { intensity: 2 }), 0, 17.6, R * 0.85, Math.PI / 2);
}
const smokeMat = () => once('smokeMat', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: new THREE.Color('#6a4646'), emissiveIntensity: 0.55 }));
function smokeKit(kt, seed, scale, warm) {
  const r = makeRng(seed);
  const top = new THREE.Color('#fbf4f0'), mid = new THREE.Color('#ddd0ce'), lit = new THREE.Color(warm ? '#ffc0a0' : '#e8e0e0');
  for (let i = 0; i < 18; i++) {
    const a = r.range(0, TAU), d = Math.sqrt(r()) * 4.2 * scale;
    const s = r.range(1.3, 2.8) * scale * (1.15 - d / (6 * scale));
    const y = s * 0.55 + r.range(0, 2.4) * scale * (1 - d / (5 * scale));
    _o3.position.set(Math.cos(a) * d, y, Math.sin(a) * d); _o3.rotation.set(0, r() * 3, 0); _o3.scale.set(s, s * 0.8, s); _o3.updateMatrix();
    kt.addM(G.sphere(1, 14), smokeMat(), _o3.matrix, y > 2.6 * scale ? top : i % 3 ? mid : lit);
  }
}
function gantry(color) {
  const g = new THREE.Group();
  const H = 34, R = 2.4, RX = 7.4; // rocket sits at x = RX
  g.add(kit('gantry', (kt) => {
    const red = MAT.paint('#d8283a'), white = MAT.paint('#f2efe6'), grey = MAT.plastic('#4a4a56'), steel = MAT.metal('#9a9aa8');
    lattice(kt, H, R, 2.8, red, white);
    kt.add(G.rbox(26, 1.2, 14, 0.3), surface('concrete', { tint: '#8a8090', scale: 0.25 }), RX / 2, 0.6, 0);
    kt.add(G.cyl(4, 4.4, 1.0, 28), MAT.matte('#3a363e'), RX, 1.5, 0);
    // flame trench
    kt.add(G.box(5.2, 0.3, 9), MAT.matte('#141418'), RX, 1.25, 5);
    // swing arms + platforms
    for (const y of [10, 17.5, 25]) {
      kt.add(G.box(RX - 2.4, 0.5, 1.4), white, R + (RX - 2.4) / 2 - 0.2, y, 0);
      kt.add(G.box(RX - 2.4, 0.08, 1.4), steel, R + (RX - 2.4) / 2 - 0.2, y + 1.1, 0.7);
      kt.add(G.box(2 * R + 1.4, 0.3, 2 * R + 1.4), grey, 0, y - 0.2, 0);
    }
    kt.add(G.box(1.6, 3.0, 1.6), grey, -R - 0.9, 6, 0);
    kt.add(G.cyl(0.18, 0.18, 8, 8), steel, 0, H + 4, 0);
    kt.add(G.box(2 * R + 0.8, 0.5, 2 * R + 0.8), grey, 0, H + 0.25, 0);
    kt.add(G.sphere(0.5, 12), glow(RED, { intensity: 3 }), 0, H + 8.2, 0);
  }));
  const lights = kit('gantryLights', (kt) => {
    for (const y of [10.6, 18.1, 25.6]) for (let i = 0; i < 4; i++) kt.add(G.sphere(0.2, 8), glow('#fff2c0', { intensity: 4 }), R + 0.6 + i * 1.3, y, 0.75);
    for (let y = 4; y < H; y += 6) kt.add(G.sphere(0.28, 8), glow(RED, { intensity: 3.5 }), R + 0.25, y, R + 0.25);
  });
  g.add(lights);
  const rocket = new THREE.Group();
  rocket.position.set(RX, 2.6, 0);
  rocket.add(kit('rocket' + color, (kt) => rocketBody(kt, color)));
  const tag = textPanel('AGI-1', { width: 3.4, height: 1.1, bg: null, fg: INK, stroke: null });
  tag.position.set(0, 8.5, 2.25);
  rocket.add(tag);
  const flame = new THREE.Group();
  flame.add(mesh(G.cone(1.8, 9, 16), glow('#ff8a3a', { intensity: 3 }), 0, -4.4, 0));
  flame.add(mesh(G.cone(1.0, 6, 14), glow('#fff2c0', { intensity: 4 }), 0, -3.0, 0));
  flame.children.forEach((c) => (c.rotation.x = Math.PI));
  flame.add(glareSprite('#ffb070', 2.2, 16));
  flame.children[2].position.y = -2;
  rocket.add(flame);
  g.add(rocket);
  const smoke = kit('padSmoke', (kt) => smokeKit(kt, 11, 2.0, true));
  smoke.position.set(RX, 1.2, 6);
  g.add(smoke);
  const sign = textPanel(['LAUNCH PAD 39-∞', 'T-MINUS: ALREADY'], { width: 9, height: 3, bg: YEL, fg: INK, border: INK, borderW: 12, radius: 16 });
  sign.position.set(-R - 0.5, 3.6, R + 0.6);
  g.add(sign);
  g.userData.rocket = rocket;
  g.userData.flame = flame;
  g.userData.smoke = smoke;
  g.userData.lights = lights;
  return g;
}
function animateGantry(obj, t, entry) {
  const ud = obj.userData;
  const d = (entry?.zf ?? 0) - t * SPEED; // distance ahead of the kart
  const k = Math.max(0, (110 - d) / 60);
  const lift = k * k * 9;
  ud.rocket.position.y = 2.6 + lift + (lift > 0 ? Math.sin(t * 40) * 0.05 : 0);
  ud.rocket.rotation.z = lift > 0 ? Math.sin(t * 2 + (entry?.seed || 0) * 9) * 0.03 * Math.min(1, k) : 0;
  const f = (lift > 0 ? 1.4 + Math.min(1.2, k) : 0.35) * (1 + 0.2 * Math.sin(t * 33 + (entry?.seed || 0) * 40));
  ud.flame.scale.set(lift > 0 ? 1.2 : 0.6, f, lift > 0 ? 1.2 : 0.6);
  const sm = 0.55 + Math.min(1.8, k * 1.2);
  ud.smoke.scale.set(sm, 0.5 + Math.min(1.4, k), sm);
  ud.smoke.rotation.y = t * 0.08;
  ud.lights.visible = Math.floor(t * 3) % 2 === 0;
}

// =====================================================================================================
// small launch tower (lattice + T-MINUS sign)
// =====================================================================================================
function tower() {
  const g = new THREE.Group();
  const H = 18, R = 1.4;
  g.add(kit('tower', (kt) => {
    lattice(kt, H, R, 2.4, MAT.paint('#d8283a'), MAT.paint('#f2efe6'));
    kt.add(G.rbox(5.4, 0.8, 5.4, 0.2), MAT.matte('#5a5462'), 0, 0.4, 0);
    kt.add(G.box(3.8, 0.4, 3.8), MAT.plastic('#4a4a56'), 0, H + 0.2, 0);
    kt.add(G.box(6.5, 0.6, 0.9), MAT.paint('#f2efe6'), -4.2, 13.5, 0);
    kt.add(G.cyl(0.08, 0.08, 3, 6), MAT.metal('#9a9aa8'), 0.8, H + 1.8, 0.8);
  }));
  const top = mesh(G.sphere(0.45, 10), glow(RED, { intensity: 3.5 }), 0, H + 0.8, 0);
  g.add(top);
  const sign = textPanel(['T-MINUS:', 'ALREADY'], { width: 2.8, height: 1.6, bg: YEL, fg: INK, border: INK, borderW: 10, radius: 12 });
  sign.position.set(0, 6, R + 0.3);
  g.add(sign);
  g.userData.top = top;
  return g;
}

// =====================================================================================================
// smoke clouds at the ramp base
// =====================================================================================================
function smokeCloud(v) {
  const g = new THREE.Group();
  const inner = kit('smoke' + v, (kt) => smokeKit(kt, 20 + v * 7, 1.6 + v * 0.5, v !== 1));
  g.add(inner);
  g.userData.puff = inner;
  return g;
}

// =====================================================================================================
// the colossal live P(DOOM) scoreboard
// =====================================================================================================
const SB_W = 1024, SB_H = 340;
function drawScore(ud, v) {
  const x = ud.ctx;
  const g = x.createLinearGradient(0, 0, 0, SB_H);
  g.addColorStop(0, '#1a0410'); g.addColorStop(1, '#080206');
  x.fillStyle = g; x.fillRect(0, 0, SB_W, SB_H);
  const known = typeof v === 'number' && isFinite(v);
  const p = known ? Math.max(0, Math.min(1, v)) : 0.5;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = YEL;
  x.font = `700 84px ${FONT}`;
  x.fillText('P(DOOM)', 40, 70);
  x.font = `600 30px ${FONT}`;
  x.fillStyle = '#ff9aa8';
  x.fillText(p > 0.8 ? 'WE ARE SO COOKED' : p > 0.5 ? 'UPPING IT, AS FORETOLD' : 'LIVE · do not look directly', 44, 138);
  // history sparkline
  const h = ud.hist;
  x.strokeStyle = '#ff5a7a'; x.lineWidth = 5; x.lineJoin = 'round';
  x.beginPath();
  for (let i = 0; i < h.length; i++) { const px = 44 + (i / 39) * 380, py = 236 - h[i] * 70; i ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.stroke();
  x.font = `600 22px ${FONT}`; x.fillStyle = '#8a6070'; x.fillText('last 20 s (trend: yes)', 44, 262);
  x.textAlign = 'right';
  x.fillStyle = p > 0.66 ? '#ff3b3b' : p > 0.33 ? '#ffb020' : '#5dffb0';
  x.font = `700 190px ${FONT}`;
  x.fillText(known ? Math.round(p * 100) + '%' : '??%', SB_W - 36, 140);
  const n = 24, bw = (SB_W - 88) / n;
  for (let i = 0; i < n; i++) {
    const on = i < Math.round(p * n);
    x.fillStyle = on ? (i > 18 ? '#ff3b3b' : i > 11 ? '#ffb020' : '#5dffb0') : '#2a1422';
    x.fillRect(44 + i * bw, 286, bw - 7, 36);
  }
  // LED grid
  x.fillStyle = 'rgba(0,0,0,0.3)';
  for (let k = 0; k < SB_W; k += 4) x.fillRect(k, 0, 1, SB_H);
  for (let k = 0; k < SB_H; k += 4) x.fillRect(0, k, SB_W, 1);
  ud.tex.needsUpdate = true;
}
function scoreboard() {
  const g = new THREE.Group();
  const HW = 14.8, SW = 27, SH = SW * SB_H / SB_W, Y = 15.5;
  g.add(kit('score', (kt) => {
    const frame = MAT.paint('#1a1420'), yel = MAT.paint(YEL), blk = MAT.paint('#18181e'), steel = MAT.metal('#9a9aa8');
    for (const s of [-1, 1]) {
      for (let k = 0; k < 10; k++) kt.add(G.box(1.5, 1.2, 1.5), k % 2 ? yel : blk, s * HW, 0.6 + k * 1.2, 0);
      kt.add(G.rbox(1.5, Y - 12 + SH / 2 + 2, 1.5, 0.2), frame, s * HW, 12 + (Y - 12 + SH / 2 + 2) / 2, 0);
      kt.add(G.cyl(1.4, 1.7, 0.6, 16), MAT.matte('#3a363e'), s * HW, 0.3, 0);
      kt.bar([s * HW, 9, 0], [s * (SW / 2 - 1), Y - SH / 2 - 1, 0], 0.5, steel);
    }
    kt.add(G.rbox(SW + 2.4, SH + 3.4, 1.4, 0.4), frame, 0, Y, -0.6);
    kt.add(G.rbox(2 * HW + 1.5, 1.0, 1.6, 0.3), frame, 0, Y + SH / 2 + 2.2, 0);
    kt.add(G.box(SW + 2.6, 0.25, 0.25), MAT.metal('#e8e8f0', { roughness: 0.15 }), 0, Y - SH / 2 - 1.3, 0.2);
  }));
  const c = document.createElement('canvas');
  c.width = SB_W; c.height = SB_H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screen = new THREE.Mesh(G.plane(SW, SH), screenMat(tex, 1.2));
  screen.position.set(0, Y, 0.12);
  g.add(screen);
  const hdr = textPanel('LIVE FROM THE LAUNCH PAD', { width: 14, height: 1.4, bg: RED, fg: '#ffffff', border: null, borderW: 0, radius: 12 });
  hdr.position.set(0, Y + SH / 2 + 2.2, 0.85);
  g.add(hdr);
  const bulbs = [];
  for (const par of [0, 1]) {
    bulbs.push(kit('scoreBulbs' + par, (kt) => {
      for (let k = par; k < 30; k += 2) {
        const u = k / 29;
        kt.add(G.sphere(0.3, 8), glow(k % 4 < 2 ? YEL : RED, { intensity: 3.5 }), -SW / 2 - 0.6 + u * (SW + 1.2), Y + SH / 2 + 1.0, 0.2);
        kt.add(G.sphere(0.3, 8), glow(k % 4 < 2 ? RED : YEL, { intensity: 3.5 }), -SW / 2 - 0.6 + u * (SW + 1.2), Y - SH / 2 - 0.6, 0.2);
      }
    }));
    g.add(bulbs[par]);
  }
  const beacons = [];
  for (const s of [-1, 1]) {
    const b = beacon();
    b.position.set(s * HW, Y + SH / 2 + 2.6, 0);
    b.scale.setScalar(0.8);
    g.add(b);
    beacons.push(b);
  }
  const ud = g.userData;
  ud.ctx = c.getContext('2d');
  ud.tex = tex;
  ud.bulbs = bulbs;
  ud.beacons = beacons;
  ud.lastT = -1;
  ud.hist = new Array(40).fill(globalThis.GAME?.pDoom ?? 0.5);
  ud.histT = 0;
  drawScore(ud, globalThis.GAME?.pDoom);
  ud.lastV = globalThis.GAME?.pDoom;
  return g;
}
function animateScoreboard(obj, t, seed, beatPhase) {
  const ud = obj.userData;
  if (t - ud.lastT > 0.25 || t < ud.lastT) {
    ud.lastT = t;
    const v = globalThis.GAME?.pDoom;
    let dirty = false;
    if (t - ud.histT > 0.5 || t < ud.histT) {
      ud.histT = t;
      ud.hist.shift();
      ud.hist.push(typeof v === 'number' ? v : 0.5);
      dirty = true;
    }
    const q = typeof v === 'number' ? Math.round(v * 100) : -1;
    const lq = typeof ud.lastV === 'number' ? Math.round(ud.lastV * 100) : -1;
    if (q !== lq || dirty) { ud.lastV = v; drawScore(ud, v); }
  }
  const on = Math.floor(t * 8) % 2;
  ud.bulbs[0].visible = on === 0;
  ud.bulbs[1].visible = on === 1;
  for (const b of ud.beacons) animateBeacon(b, t, seed + b.position.x);
}
function animateBeacon(obj, t, seed) {
  const u = obj.userData;
  u.spin.rotation.y = t * 5 + seed * 6;
  const s = 1 + 0.25 * Math.max(0, Math.sin(t * 10 + seed * 6));
  u.dome.scale.set(s, s, s);
}

// =====================================================================================================
// FOOM letters (chunky 3D letters built from rounded boxes and tori)
// =====================================================================================================
function letterKit(kt, L, mat) {
  const T = 1.5, Hh = 6, D = 1.6;
  if (L === 'F') {
    kt.add(G.rbox(T, Hh, D, 0.3), mat, -1.2, Hh / 2, 0);
    kt.add(G.rbox(3.8, T, D, 0.3), mat, 0.3, Hh - T / 2, 0);
    kt.add(G.rbox(3.0, T * 0.9, D, 0.3), mat, -0.1, Hh / 2 + 0.2, 0);
  } else if (L === 'O') {
    kt.add(G.torus(1.95, 0.78, 36), mat, 0, Hh / 2, 0, 0, 0, 0, 1, 1.38, 1.15);
  } else if (L === 'M') {
    for (const s of [-1, 1]) kt.add(G.rbox(T, Hh, D, 0.3), mat, s * 1.85, Hh / 2, 0);
    kt.bar([-1.6, Hh - 0.6, 0], [0, Hh * 0.38, 0], T * 0.9, mat, G.rbox(1, 1, 1, 0.3));
    kt.bar([1.6, Hh - 0.6, 0], [0, Hh * 0.38, 0], T * 0.9, mat, G.rbox(1, 1, 1, 0.3));
  }
}
function foomLetters() {
  const g = new THREE.Group();
  g.add(kit('foomBase', (kt) => {
    kt.add(G.rbox(25, 1.0, 4.4, 0.3), MAT.paint('#2a1830'), 0, 0.5, 0);
    for (let i = 0; i < 12; i++) kt.add(G.box(1.6, 0.06, 0.4), i % 2 ? MAT.plastic(YEL) : MAT.plastic('#18181e'), -11 + i * 2, 1.03, 2.0);
  }));
  const cols = [RED, YEL, ORANGE, '#c86bff'];
  const letters = [];
  'FOOM'.split('').forEach((L, k) => {
    const b = kit('foom' + L + k, (kt) => letterKit(kt, L, MAT.paint(cols[k])));
    b.position.set(-8.4 + k * 5.6, 1.0, 0);
    letters.push(b);
    g.add(b);
  });
  const bang = textPanel('!!!', { width: 3.2, height: 4.2, bg: null, fg: YEL, stroke: INK, strokeW: 18 });
  bang.position.set(12.6, 4.2, 0.4);
  bang.rotation.z = -0.2;
  g.add(bang);
  g.userData.letters = letters;
  return g;
}
function animateFoom(obj, beatPhase) {
  obj.userData.letters.forEach((b, k) => {
    const ph = (beatPhase + 1 - k * 0.12) % 1;
    const hop = (1 - ph) * (1 - ph);
    b.position.y = 1.0 + hop * 2.0;
    const sq = ph < 0.08 ? 1 - (0.08 - ph) * 3 : 1;
    b.scale.set(2 - sq, sq, 1);
    b.rotation.z = Math.sin(ph * TAU) * 0.06;
  });
}

// =====================================================================================================
// RECURSIVE SELF-IMPROVEMENT: ENABLED — an industrial control panel with a giant toggle and a runaway dial
// =====================================================================================================
function rsiPanel() {
  const g = new THREE.Group();
  g.add(kit('rsi', (kt) => {
    const body = MAT.paint('#3a4a5a'), dark = MAT.plastic('#1a1e26'), steel = MAT.metal('#c0c4d0');
    for (const s of [-1, 1]) kt.add(G.box(0.5, 4, 0.5), steel, s * 5, 2, -0.6);
    kt.add(G.rbox(12, 7.4, 1.2, 0.4), body, 0, 7.5, -0.4);
    kt.add(G.rbox(4.2, 4.2, 0.4, 0.3), dark, -3.2, 6.6, 0.3);
    kt.add(G.cyl(1.7, 1.7, 0.3, 32), MAT.plastic('#f2efe6'), 2.8, 6.6, 0.35, Math.PI / 2);
    kt.add(G.torus(1.75, 0.14, 32), steel, 2.8, 6.6, 0.5);
    for (let i = 0; i < 9; i++) { const a = -2.2 + i * 0.55; kt.add(G.box(0.08, 0.35, 0.05), MAT.plastic('#1a1e26'), 2.8 + Math.sin(a) * 1.4, 6.6 + Math.cos(a) * 1.4, 0.52, 0, 0, -a); }
    kt.add(G.box(0.6, 0.6, 0.06), MAT.plastic('#d8273f'), 2.8 + Math.sin(2.2) * 1.3, 6.6 + Math.cos(2.2) * 1.3, 0.53);
    // toggle switch in the ON position
    kt.add(G.rbox(1.6, 2.4, 0.6, 0.2), steel, -3.2, 6.6, 0.6);
    kt.bar([-3.2, 6.6, 0.8], [-3.2, 8.4, 2.0], 0.36, steel, G.cyl(1, 1, 1, 12));
    kt.add(G.sphere(0.55, 16), MAT.paint(RED), -3.2, 8.5, 2.1);
  }));
  const needle = kit('rsiNeedle', (kt) => kt.add(G.box(0.12, 1.4, 0.06), MAT.plastic('#d8273f'), 0, 0.65, 0));
  needle.position.set(2.8, 6.6, 0.58);
  g.add(needle);
  const hdr = textPanel(['RECURSIVE SELF-IMPROVEMENT'], { width: 11.2, height: 1.4, bg: '#12161e', fg: '#ffffff', border: null, borderW: 0, radius: 10 });
  hdr.position.set(0, 10.5, 0.25);
  g.add(hdr);
  const on = textPanel('ENABLED ✓', { width: 4.6, height: 1.0, bg: '#0a2a14', fg: '#5dff8a', border: '#5dff8a', borderW: 6, radius: 10 });
  on.position.set(-3.2, 4.1, 0.25);
  g.add(on);
  const dl = textPanel('v2 → v∞', { width: 3.2, height: 0.8, bg: null, fg: '#d8dce8', stroke: INK, strokeW: 6 });
  dl.position.set(2.8, 4.2, 0.25);
  g.add(dl);
  const led = mesh(G.sphere(0.35, 12), glow('#5dff8a', { intensity: 4 }), 4.9, 10.5, 0.4);
  g.add(led);
  g.userData.needle = needle;
  g.userData.led = led;
  return g;
}

// =====================================================================================================
// ALIGNMENT: WE'LL FIGURE IT OUT LATER — roadworks sign, barricade, stuck progress bar
// =====================================================================================================
function alignSign() {
  const g = new THREE.Group();
  g.add(kit('align', (kt) => {
    const o = MAT.plastic('#ff7a1f'), w = MAT.plastic('#f4f2ea'), steel = MAT.metal('#a0a0aa');
    kt.add(G.box(0.3, 9, 0.3), steel, 0, 4.5, -0.3);
    kt.add(G.rbox(7.6, 7.6, 0.3, 0.3), MAT.plastic('#18181e'), 0, 8.4, -0.15, 0, 0, Math.PI / 4);
    // barricade
    for (const s of [-1, 1]) { kt.add(G.box(0.25, 2.6, 0.25), w, s * 3.2, 1.3, 2.0); kt.add(G.box(1.4, 0.2, 0.25), w, s * 3.2, 0.1, 2.0); }
    for (let i = 0; i < 8; i++) kt.add(G.box(0.8, 0.7, 0.18), i % 2 ? o : w, -2.8 + i * 0.8, 2.1, 2.1);
    for (let i = 0; i < 8; i++) kt.add(G.box(0.8, 0.5, 0.18), i % 2 ? w : o, -2.8 + i * 0.8, 1.1, 2.1);
    kt.add(G.rbox(6.8, 1.6, 0.3, 0.15), MAT.plastic('#1a1e26'), 0, 3.6, -0.2);
  }));
  const diamond = textPanel(['ALIGNMENT:', "WE'LL FIGURE", 'IT OUT LATER'], { width: 6.4, height: 6.4, bg: '#ff8a1f', fg: '#18181e', border: '#18181e', borderW: 14, radius: 20 });
  diamond.position.set(0, 8.4, 0.05);
  diamond.rotation.z = 0;
  g.add(diamond);
  const bar = textPanel('alignment.exe ▓░░░░░░░░ 3% · eta: later', { width: 6.6, height: 1.4, bg: '#0a0a12', fg: '#ffb020', border: null, borderW: 0, radius: 8 });
  bar.position.set(0, 3.6, 0);
  g.add(bar);
  const lamps = kit('alignLamps', (kt) => { for (const s of [-1, 1]) kt.add(G.sphere(0.32, 10), glow('#ffb020', { intensity: 4 }), s * 3.2, 2.85, 2.0); });
  g.add(lamps);
  g.userData.lamps = lamps;
  return g;
}

// =====================================================================================================
// NUMBER GO UP chart billboard
// =====================================================================================================
function chartTexture() {
  return once('chart', () => canvasTex(512, 384, (x) => {
    x.fillStyle = '#fff7e6'; x.fillRect(0, 0, 512, 384);
    x.strokeStyle = INK; x.lineWidth = 6;
    x.beginPath(); x.moveTo(60, 50); x.lineTo(60, 330); x.lineTo(490, 330); x.stroke();
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillStyle = INK; x.font = `700 34px ${FONT}`;
    x.fillText('NUMBER GO UP', 80, 32);
    x.font = `600 22px ${FONT}`;
    x.fillText('time →', 400, 356);
    x.save(); x.translate(32, 300); x.rotate(-Math.PI / 2); x.fillText('capabilities →', 0, 0); x.restore();
    x.strokeStyle = '#3f8cff'; x.lineWidth = 8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(70, 310); x.lineTo(480, 300); x.stroke();
    x.fillStyle = '#3f8cff'; x.fillText('alignment', 360, 280);
    x.strokeStyle = '#e8263f'; x.lineWidth = 11; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(70, 318);
    for (let i = 1; i <= 60; i++) {
      const u = i / 60, px = 70 + u * 330, py = 318 - (Math.exp(u * 5.6) - 1) * 1.0;
      if (py < 60) { x.lineTo(px, 60); break; }
      x.lineTo(px, py);
    }
    x.stroke();
    x.fillStyle = '#e8263f'; x.font = `700 26px ${FONT}`;
    x.textAlign = 'right';
    x.fillText('YOU ARE HERE →', 372, 74);
  }));
}
function chartPanel() {
  const g = new THREE.Group();
  g.add(kit('chart', (kt) => {
    const pm = MAT.plastic('#3a1a2a');
    for (const s of [-1, 1]) kt.add(G.box(0.4, 5, 0.4), pm, s * 3.6, 2.5, -0.25);
    kt.add(G.rbox(9.6, 7.4, 0.5, 0.22), MAT.paint(RED), 0, 8.4, -0.15);
  }));
  const m = once('chartMat', () => new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.6, emissiveMap: chartTexture(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 }));
  g.add(mesh(G.plane(8.8, 6.6), m, 0, 8.4, 0.12));
  const dot = mesh(G.sphere(0.32, 10), glow('#ff2a4a', { intensity: 4 }), (395 / 512 - 0.5) * 8.8, 8.4 + (0.5 - 74 / 384) * 6.6, 0.25);
  g.add(dot);
  g.userData.dot = dot;
  return g;
}

// =====================================================================================================
// distant landmarks: the Vehicle Assembly Building (+ tiny alignment shed) and launching rockets
// =====================================================================================================
function vabTex() {
  return once('vab', () => canvasTex(512, 512, (x) => {
    x.fillStyle = '#e4e0dc'; x.fillRect(0, 0, 512, 512);
    const r = makeRng(3);
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { x.fillStyle = `rgba(0,0,0,${(r() * 0.06).toFixed(3)})`; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = 'rgba(40,30,40,0.25)';
    for (let i = 0; i < 512; i += 32) x.fillRect(i, 0, 2, 512);
    for (let j = 0; j < 512; j += 16) x.fillRect(0, j, 512, 1);
  }));
}
function vab() {
  const g = new THREE.Group();
  const W = 70, H = 92, D = 50;
  g.add(kit('vab', (kt) => {
    const wall = new THREE.MeshStandardMaterial({ map: vabTex(), roughness: 0.8 });
    kt.add(G.box(W, H, D), wall, 0, H / 2, 0);
    kt.add(G.box(W * 0.6, H * 0.55, D * 0.9), wall, W * 0.75, H * 0.275, 0);
    kt.add(G.box(16, H * 0.82, 0.6), MAT.plastic('#3a3a48'), -8, H * 0.41, D / 2 + 0.2);
    kt.add(G.box(13, H * 0.78, 0.4), glow('#ffd8a0', { intensity: 1.6 }), -8, H * 0.39, D / 2 + 0.3);
    kt.add(G.box(W + 1, 2, D + 1), MAT.plastic('#6a6474'), 0, H + 1, 0);
    // blue/white corner bands + vertical light strips (reads at 200 m)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kt.add(G.box(4, H, 4), MAT.paint('#2a4a9a'), sx * (W / 2 - 1.9), H / 2, sz * (D / 2 - 1.9), 0, 0, 0, 1.02, 1, 1.02);
    for (let i = 0; i < 6; i++) kt.add(G.box(0.5, H * 0.2, 0.8), glow('#ffe0b0', { intensity: 1.4 }), W / 2 + 0.3, H * 0.9 - 1, -D / 2 + 6 + i * 7.6);
    for (let x = -W / 2 + 4; x < W / 2; x += 8) kt.add(G.sphere(0.6, 8), glow(RED, { intensity: 4 }), x, H + 2.4, D / 2);
    // the alignment department: a portable shed
    kt.add(G.rbox(5, 3, 3.4, 0.2), MAT.plastic('#e8e4d8'), W / 2 + 26, 1.5, D / 2 - 2);
    kt.add(G.box(5.4, 0.25, 3.8), MAT.plastic('#8a8478'), W / 2 + 26, 3.1, D / 2 - 2);
    kt.add(G.box(0.9, 0.7, 0.1), glow('#fff2c0', { intensity: 2 }), W / 2 + 27, 1.9, D / 2 - 0.25);
  }));
  const side = textPanel(['VEHICLE ASSEMBLY BUILDING', '(the vehicles assemble themselves now)'], { width: 44, height: 12, bg: '#1a2a6a', fg: '#ffffff', border: '#ffffff', borderW: 12, radius: 18 });
  side.position.set(W / 2 + 0.4, H * 0.7, 0);
  side.rotation.y = Math.PI / 2;
  g.add(side);
  const flag = textPanel(['FRONTIER LAB', 'CAPABILITIES DEPT.'], { width: 34, height: 14, bg: '#1a1a3a', fg: '#ffffff', border: YEL, borderW: 14, radius: 20 });
  flag.position.set(14, H * 0.72, D / 2 + 0.4);
  g.add(flag);
  const shed = textPanel(['ALIGNMENT', 'DEPT.'], { width: 4.6, height: 1.6, bg: '#ffffff', fg: '#2a5aff', border: '#2a5aff', borderW: 8, radius: 10 });
  shed.position.set(W / 2 + 26, 4.4, D / 2 - 0.2);
  g.add(shed);
  const note = textPanel('back in 5 min', { width: 3.2, height: 0.8, bg: YEL, fg: INK, border: null, borderW: 0, radius: 8 });
  note.position.set(W / 2 + 25, 1.4, D / 2 - 0.25);
  note.rotation.z = 0.1;
  g.add(note);
  return g;
}
function trailTex() {
  return once('trail', () => canvasTex(16, 256, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,240,210,0.95)'); g.addColorStop(0.15, 'rgba(255,190,140,0.6)'); g.addColorStop(1, 'rgba(255,160,140,0)');
    x.fillStyle = g; x.fillRect(0, 0, 16, 256);
  }));
}
function distantLaunch() {
  const g = new THREE.Group();
  const ship = new THREE.Group();
  ship.add(kit('miniRocket', (kt) => rocketBody(kt, RED)));
  ship.scale.setScalar(0.8);
  ship.add(mesh(G.cone(1.6, 8, 12), glow('#ffd0a0', { intensity: 4 }), 0, -4, 0));
  ship.children[1].rotation.x = Math.PI;
  ship.add(glareSprite('#ffb070', 2.5, 34));
  g.add(ship);
  const tm = once('trailMat', () => new THREE.MeshBasicMaterial({ map: trailTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const trail = new THREE.Mesh(G.cyl(1.6, 4.5, 1, 16, 1, true), tm);
  g.add(trail);
  g.userData.ship = ship;
  g.userData.trail = trail;
  return g;
}
function animateLaunch(obj, t, seed) {
  const ud = obj.userData;
  const u = ((t * 0.09 + seed) % 1);
  const y = 6 + u * u * 320;
  ud.ship.position.set(u * u * 30, y, 0);
  ud.ship.rotation.z = -u * 0.25;
  const len = Math.max(1, Math.min(y - 4, 140));
  ud.trail.scale.set(1, len, 1);
  ud.trail.position.set(u * u * 30 - Math.sin(u * 0.25) * len * 0.5, y - len / 2 - 2, 0);
  ud.trail.rotation.z = -u * 0.25;
}

// =====================================================================================================
// space: launch hoops, Dyson sphere, alignment team escape pod
// =====================================================================================================
function hoop(v) {
  const g = new THREE.Group();
  g.add(kit('hoop', (kt) => {
    kt.add(G.torus(16, 0.6, 96), glow(v ? '#ff4fd8' : '#3ff2ff', { intensity: 2.6 }), 0, 7, 0);
    kt.add(G.torus(16.9, 0.28, 96), MAT.metal('#c8ccd8'), 0, 7, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      kt.add(G.cone(0.7, 1.6, 4), glow(YEL, { intensity: 3 }), Math.cos(a) * 16, 7 + Math.sin(a) * 16, 0.4, 0, 0, a - Math.PI / 2);
    }
  }));
  if (v === 0) {
    const t = textPanel('ESCAPE VELOCITY ▲', { width: 12, height: 1.8, bg: null, fg: '#ffffff', stroke: '#2a0a3a', strokeW: 12 });
    t.position.set(0, 25.6, 0);
    g.add(t);
  }
  return g;
}
function dysonGeo() {
  return once('dysonGeo', () => {
    const ico = new THREE.IcosahedronGeometry(1, 3);
    const pos = ico.attributes.position;
    const r = makeRng(77);
    const edges = new Map();
    const tris = [];
    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      const cen = a.clone().add(b).add(c).divideScalar(3);
      // phase 1: the frame is mostly up on one hemisphere, panels on part of it
      const built = cen.y + cen.x * 0.4 > -0.25 + r.range(-0.2, 0.2);
      if (!built) continue;
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = [p, q].map((v) => v.toArray().map((n) => n.toFixed(3)).join(',')).sort().join('|');
        if (!edges.has(k)) edges.set(k, [p, q]);
      }
      if (cen.y > 0.05 && r.chance(0.62)) tris.push(a, b, c);
    }
    return { edges: [...edges.values()], tris };
  });
}
function dyson() {
  const g = new THREE.Group();
  const R = 58;
  const spin = new THREE.Group();
  g.add(spin);
  const { edges, tris } = dysonGeo();
  spin.add(kit('dysonFrame', (kt) => {
    const steel = MAT.metal('#c8a878', { roughness: 0.3 });
    for (const [p, q] of edges) kt.bar(p.clone().multiplyScalar(R).toArray(), q.clone().multiplyScalar(R).toArray(), 0.55, steel, G.cyl(1, 1, 1, 5));
    for (const [p] of edges) kt.add(G.sphere(0.9, 6), steel, p.x * R, p.y * R, p.z * R);
  }));
  const pg = once('dysonPanels', () => {
    const arr = new Float32Array(tris.length * 3);
    tris.forEach((v, i) => { const w = v.clone().multiplyScalar(R * 0.985); arr[i * 3] = w.x; arr[i * 3 + 1] = w.y; arr[i * 3 + 2] = w.z; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    return geo;
  });
  const pm = once('dysonPanelMat', () => new THREE.MeshStandardMaterial({ color: '#1a2050', metalness: 0.7, roughness: 0.25, emissive: new THREE.Color('#2a3a9a'), emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  spin.add(new THREE.Mesh(pg, pm));
  const star = mesh(G.sphere(20, 32), glow('#fff0c8', { intensity: 5 }), 0, 0, 0);
  g.add(star);
  g.add(glareSprite('#ffc890', 2.4, 150));
  const sign = textPanel(['DYSON SPHERE', 'PHASE 1 OF ∞'], { width: 46, height: 15, bg: '#0a0a1a', fg: YEL, border: YEL, borderW: 16, radius: 26 });
  sign.position.set(0, -R - 14, 20);
  g.add(sign);
  const sub = textPanel('est. completion: next quarter (every quarter)', { width: 46, height: 3.6, bg: null, fg: '#ffd8a0', stroke: '#0a0a1a', strokeW: 10 });
  sub.position.set(0, -R - 25, 20);
  g.add(sub);
  // construction drones orbiting
  const drones = kit('drones', (kt) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      kt.add(G.rbox(2.4, 1.2, 1.6, 0.3), MAT.plastic('#f2efe6'), Math.cos(a) * (R + 9), Math.sin(a * 2) * 12, Math.sin(a) * (R + 9));
      kt.add(G.sphere(0.5, 8), glow(i % 2 ? RED : '#3ff2ff', { intensity: 4 }), Math.cos(a) * (R + 9), Math.sin(a * 2) * 12 + 0.9, Math.sin(a) * (R + 9));
    }
  });
  g.add(drones);
  g.userData.spin = spin;
  g.userData.drones = drones;
  g.userData.star = star;
  return g;
}
function escapePod() {
  const g = new THREE.Group();
  const pod = new THREE.Group();
  pod.position.y = 6;
  g.add(pod);
  pod.add(kit('pod', (kt) => {
    kt.add(G.capsule(1.6, 2.4), MAT.paint('#f2efe6'), 0, 0, 0, 0, 0, Math.PI / 2);
    kt.add(G.cyl(1.65, 1.65, 0.5, 24), MAT.paint(ORANGE), 0, 0, 0, 0, 0, Math.PI / 2);
    kt.add(G.cyl(0.8, 0.8, 0.2, 20), glow('#9ff6ff', { intensity: 1.8 }), 0.9, 0.3, 1.5, Math.PI / 2);
    kt.add(G.torus(0.8, 0.12, 20), MAT.metal('#c8ccd8'), 0.9, 0.3, 1.6);
    kt.add(G.cyl(0.6, 0.9, 1.0, 16), MAT.metal('#8a8a98'), -3.0, 0, 0, 0, 0, Math.PI / 2);
  }));
  const lbl = textPanel(['ALIGNMENT TEAM', 'ESCAPE POD'], { width: 5.6, height: 2.0, bg: '#ffffff', fg: '#2a5aff', border: '#2a5aff', borderW: 8, radius: 12 });
  lbl.position.set(0, 2.8, 0.4);
  pod.add(lbl);
  const flame = mesh(G.cone(0.55, 2.2, 10), glow('#7af7ff', { intensity: 3 }), -4.4, 0, 0);
  flame.rotation.z = Math.PI / 2;
  pod.add(flame);
  g.userData.pod = pod;
  return g;
}

// =====================================================================================================
// gag: the big red PAUSE button (not connected)
// =====================================================================================================
function pauseButton() {
  const g = new THREE.Group();
  g.add(kit('pause', (kt) => {
    kt.add(G.rbox(3, 3.4, 3, 0.3), MAT.paint('#2a2a34'), 0, 1.7, 0);
    kt.add(G.cyl(1.3, 1.4, 0.4, 28), MAT.metal('#c8ccd8'), 0, 3.6, 0);
    kt.add(G.cyl(1.0, 1.1, 0.6, 28), MAT.paint('#e8142a'), 0, 4.0, 0);
    // the cable: runs out and ends, unplugged
    const pts = [[1.5, 0.3, 0], [3, 0.15, 0.5], [4.5, 0.15, 1.6], [5.6, 0.15, 1.2]];
    for (let i = 1; i < pts.length; i++) kt.bar(pts[i - 1], pts[i], 0.22, MAT.plastic('#18181e'), G.cyl(1, 1, 1, 8));
    kt.add(G.box(0.7, 0.45, 0.5), MAT.plastic('#f2efe6'), 5.9, 0.25, 1.2);
    kt.add(G.box(0.08, 0.08, 0.3), MAT.metal('#ffcf4a'), 6.3, 0.3, 1.1);
    kt.add(G.box(0.08, 0.08, 0.3), MAT.metal('#ffcf4a'), 6.3, 0.3, 1.3);
  }));
  const t = textPanel(['PAUSE AI', '(not connected)'], { width: 3.2, height: 1.4, bg: '#ffffff', fg: '#d8273f', border: '#d8273f', borderW: 8, radius: 10 });
  t.position.set(0, 2.0, 1.55);
  g.add(t);
  return g;
}

// =====================================================================================================
// v3: trackside launch-complex kit (sizes for the v3 world: kart+driver ≈ 1.86 tall)
// =====================================================================================================
let _course = null;
const _cf = {};
/** pitch (rad) of the road at arc length s: deck rails / arches / hoops tilt with the exponential ramp */
function rampPitch(s) {
  if (!_course) _course = new Course();
  _course.frame(s, _cf);
  return Math.asin(Math.max(-1, Math.min(1, _cf.ty)));
}
const RAIL = 20.4; // deck rail segment (two layout cells + overlap)
/** steel deck barrier: red wall, white cap, yellow/black chevrons facing the road, amber marker lights. left side (road at +x) */
function deckRail(mirror) {
  const g = kit('rail' + (mirror ? 'R' : 'L'), (kt) => {
    const m = mirror ? -1 : 1;
    const red = MAT.paint('#d8283a'), white = MAT.paint('#f2efe6'), yel = MAT.paint(YEL), blk = MAT.paint('#18181e'), steel = MAT.paint('#5a5a68');
    kt.add(G.box(1.6, 0.35, RAIL), steel, -0.2 * m, 0.17, 0);
    kt.add(G.rbox(0.6, 1.5, RAIL, 0.18), red, 0, 1.05, 0);
    kt.add(G.rbox(0.7, 0.28, RAIL, 0.1), white, 0, 1.86, 0);
    for (let i = 0; i < 6; i++) {
      const z = -RAIL / 2 + 1.7 + i * ((RAIL - 3.4) / 5);
      kt.add(G.box(0.06, 0.8, 2.2), yel, 0.31 * m, 1.0, z);
      for (const d of [-0.55, 0.15]) kt.add(G.box(0.07, 0.95, 0.24), blk, 0.33 * m, 1.0, z + d, 0.55, 0, 0);
      kt.add(G.sphere(0.13, 10), glow('#ffb020', { intensity: 3.2 }), 0.33 * m, 1.86, z + 1.1);
    }
    // outer catwalk + posts
    for (let i = 0; i < 4; i++) kt.add(G.box(0.16, 1.4, 0.16), steel, -1.1 * m, 0.9, -RAIL / 2 + 1 + i * ((RAIL - 2) / 3));
    kt.add(G.box(0.1, 0.1, RAIL), MAT.paint('#c8ccd8'), -1.1 * m, 1.6, 0);
  });
  return g;
}

/** floodlight mast ≈ 15 tall, four lamps */
function floodlight() {
  const g = new THREE.Group();
  g.add(kit('flood', (kt) => {
    const grey = MAT.paint('#3a3a48'), steel = MAT.paint('#a8acb8');
    kt.add(G.cyl(0.9, 1.1, 0.8, 18), grey, 0, 0.4, 0);
    kt.add(G.cyl(0.24, 0.36, 14, 14), steel, 0, 7.6, 0);
    kt.add(G.rbox(4.6, 2.4, 0.4, 0.12), grey, 0, 14.6, 0.1);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const x = -1.1 + c * 2.2, y = 14.0 + r * 1.2;
      kt.add(G.cyl(0.52, 0.56, 0.4, 16), steel, x, y, 0.4, Math.PI / 2);
      kt.add(G.cyl(0.44, 0.44, 0.05, 16), glow('#fff4dc', { intensity: 5 }), x, y, 0.62, Math.PI / 2);
    }
    kt.add(G.sphere(0.25, 10), glow(RED, { intensity: 3 }), 0, 16.1, 0.1);
  }));
  return g;
}

/** acceleration gate spanning the road (posts at ±15), sequenced chevron lights */
function launchArch() {
  const g = new THREE.Group();
  const W = 15, Y = 17;
  g.add(kit('arch', (kt) => {
    const red = MAT.paint('#d8283a'), white = MAT.paint('#f2efe6'), dark = MAT.paint('#22202a'), steel = MAT.metal('#a8acb8');
    for (const s of [-1, 1]) {
      kt.add(G.cyl(1.9, 2.2, 0.8, 24), steel, s * W, 0.4, 0);
      for (let k = 0; k < 8; k++) kt.add(G.rbox(2.6, 2.0, 2.6, 0.3), k % 2 ? white : red, s * W, 1.8 + k * 2.0, 0);
      kt.bar([s * W, Y - 4, 0], [s * (W - 4), Y + 1.2, 0], 0.9, dark);
    }
    kt.add(G.rbox(2 * W + 3, 3.2, 2.4, 0.5), dark, 0, Y + 1.6, 0);
    kt.add(G.box(2 * W + 3.2, 0.3, 2.5), white, 0, Y + 0.05, 0);
    kt.add(G.box(2 * W + 3.2, 0.3, 2.5), white, 0, Y + 3.15, 0);
  }));
  const seq = [];
  for (let i = 0; i < 5; i++) {
    const c = kit('archChev' + i, (kt) => {
      const x = (i - 2) * 4.2;
      kt.add(G.cone(1.0, 1.3, 3), glow(i % 2 ? '#3ff2ff' : YEL, { intensity: 3.6 }), x, Y + 1.6, 1.25, 0, 0, 0, 1, 1, 0.25);
    });
    g.add(c);
    seq.push(c);
  }
  const strip = kit('archStrip', (kt) => {
    for (const s of [-1, 1]) kt.add(G.box(0.3, Y - 1.5, 0.3), glow('#3ff2ff', { intensity: 3 }), s * (W - 1.35), (Y - 1.5) / 2 + 0.8, 1.35);
  });
  g.add(strip);
  const t = textPanel('LAUNCH RAIL · NO BRAKES BEYOND THIS POINT', { width: 22, height: 1.3, w: 2048, h: 121, pad: 10, bg: null, fg: '#ffffff', border: null, borderW: 0, stroke: INK, strokeW: 10 });
  t.position.set(0, Y - 0.9, 1.3);
  g.add(t);
  g.userData.seq = seq;
  g.userData.strip = strip;
  return g;
}

/** red/white lattice pylons that carry the launch ramp over the void (hang down from the road) */
function rampPylon() {
  const g = new THREE.Group();
  g.add(kit('pylon', (kt) => {
    const red = MAT.paint('#d8283a'), white = MAT.paint('#f2efe6'), dark = MAT.paint('#2a2830');
    for (const s of [-1, 1]) lattice(kt, 64, 1.5, 3.2, red, white, s * 9.5, -66, 0);
    kt.add(G.rbox(23, 1.6, 3.2, 0.3), dark, 0, -1.4, 0);
    for (let k = 0; k < 4; k++) kt.add(G.box(19, 0.4, 0.4), k % 2 ? red : white, 0, -12 - k * 14, 0);
    for (const s of [-1, 1]) kt.add(G.sphere(0.4, 10), glow(RED, { intensity: 4 }), s * 9.5, -2.6, 1.7);
  }));
  return g;
}

/** fuel tank farm: two spheres on legs + a horizontal tank */
function fuelTanks() {
  const g = new THREE.Group();
  g.add(kit('tanks', (kt) => {
    const white = MAT.paint('#f2efe6'), red = MAT.paint('#d8283a'), steel = MAT.metal('#a8acb8'), grey = MAT.paint('#5a5a68');
    for (const [x, z, r] of [[-12, 0, 7], [6, -6, 6]]) {
      kt.add(G.sphere(r, 40), white, x, r + 5, z);
      kt.add(G.cyl(r + 0.05, r + 0.05, 1.2, 40), red, x, r + 5, z);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; kt.add(G.cyl(0.35, 0.35, r + 5, 8), steel, x + Math.cos(a) * r * 0.75, (r + 5) / 2, z + Math.sin(a) * r * 0.75); }
      kt.add(G.cyl(0.2, 0.2, 3, 8), steel, x, 2 * r + 6.4, z);
    }
    kt.add(G.cyl(4, 4, 26, 32), white, 2, 6, 12, 0, 0, Math.PI / 2);
    for (const e of [-1, 1]) kt.add(G.sphere(4, 32), white, 2 + e * 13, 6, 12, 0, 0, 0, 0.45, 1, 1);
    for (const x of [-8, 2, 12]) kt.add(G.rbox(1.2, 3, 7, 0.3), grey, x, 1.5, 12);
    for (let k = 0; k < 5; k++) kt.add(G.cyl(0.5, 0.5, 30, 10), steel, -2 + k * 0.1, 1.2 + k * 1.1, 4 + k * 0.6, 0, 0, Math.PI / 2);
  }));
  const a = textPanel(['COMPUTE FUEL', 'highly flammable · extremely fundable'], { width: 13, height: 3.2, bg: '#ffffff', fg: '#d8283a', border: '#d8283a', borderW: 10, radius: 14 });
  a.position.set(2, 6.4, 16.1);
  g.add(a);
  const b = textPanel(['TOKENS', '(HIGH OCTANE)'], { width: 8, height: 3, bg: null, fg: INK, border: null, borderW: 0, stroke: '#ffffff', strokeW: 8 });
  b.position.set(-12, 15, 7.1);
  g.add(b);
  return g;
}

/** radar dish listening for AGI (it's listening back) */
function radarDish() {
  const g = new THREE.Group();
  g.add(kit('radarBase', (kt) => {
    const grey = MAT.paint('#e8e6e0'), red = MAT.paint('#d8283a');
    kt.add(G.rbox(7, 1.2, 7, 0.3), MAT.matte('#5a5462'), 0, 0.6, 0);
    kt.add(G.cyl(1.6, 2.4, 10, 20), grey, 0, 6, 0);
    kt.add(G.cyl(2.5, 2.5, 1.0, 20), red, 0, 11.2, 0);
  }));
  const head = new THREE.Group();
  head.position.set(0, 12, 0);
  head.add(kit('radarDish', (kt) => {
    const steel = MAT.metal('#a8acb8');
    const dish = once('dishGeo', () => new THREE.SphereGeometry(7, 40, 14, 0, TAU, 0, 0.95));
    kt.add(dish, once('dishMat', () => new THREE.MeshPhysicalMaterial({ color: '#f4f2ee', roughness: 0.35, clearcoat: 0.6, side: THREE.DoubleSide })), 0, 7.6, 0, Math.PI, 0, 0);
    kt.add(G.cyl(0.6, 0.9, 2.4, 14), steel, 0, 1.2, 0);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; kt.bar([Math.cos(a) * 4.8, 3.4, Math.sin(a) * 4.8], [0, 7.4, 0], 0.2, steel); }
    kt.add(G.sphere(0.5, 12), glow('#3ff2ff', { intensity: 3 }), 0, 7.6, 0);
  }));
  head.rotation.x = -0.6;
  const tilt = new THREE.Group();
  tilt.position.copy(head.position);
  head.position.set(0, 0, 0);
  tilt.add(head);
  g.add(tilt);
  const sign = textPanel(['LISTENING FOR AGI', "(it's listening back)"], { width: 7.6, height: 2.2, bg: INK, fg: '#3ff2ff', border: '#3ff2ff', borderW: 8, radius: 12 });
  sign.position.set(0, 4.4, 2.1);
  g.add(sign);
  g.userData.dish = tilt;
  return g;
}

/** satellite: an orbital datacenter (latency: yes) */
function satellite() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(kit('sat', (kt) => {
    const white = MAT.paint('#f2efe6'), gold = MAT.metal('#e0b050', { roughness: 0.3 }), panel = MAT.paint('#1a2a6a'), steel = MAT.metal('#a8acb8');
    kt.add(G.rbox(4, 3, 3, 0.4), gold, 0, 0, 0);
    kt.add(G.rbox(3.2, 3.4, 2.4, 0.3), white, 0, 0, 0);
    for (const s of [-1, 1]) {
      kt.add(G.cyl(0.12, 0.12, 4, 6), steel, s * 4, 0, 0, 0, 0, Math.PI / 2);
      for (let k = 0; k < 3; k++) kt.add(G.box(3, 0.1, 4), panel, s * (6.5 + k * 3.1), 0, 0);
    }
    kt.add(G.cyl(0.1, 1.6, 1.0, 20), white, 0, 2.2, 0);
    for (let k = 0; k < 6; k++) kt.add(G.box(0.4, 0.08, 0.05), glow(k % 2 ? '#5dffb0' : '#ffb84a', { intensity: 3 }), -1 + k * 0.4, 0.5, 1.22);
  }));
  g.add(body);
  const t = textPanel(['ORBITAL DATACENTER', '(latency: yes)'], { width: 7, height: 1.9, bg: '#ffffff', fg: INK, border: YEL, borderW: 8, radius: 10 });
  t.position.set(0, -2.8, 1.6);
  body.add(t);
  g.userData.body = body;
  return g;
}

/** the next construction project, far away: a ringed gas giant wearing scaffolding */
function planetTex() {
  return once('planetTex', () => canvasTex(512, 256, (x) => {
    const cols = ['#ff9a6a', '#ffcf8a', '#e86a6a', '#ffb07a', '#c85a7a', '#ffd8a0', '#e8806a'];
    const r = makeRng(9);
    let y = 0;
    while (y < 256) { const h = 8 + r() * 26; x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(0, y, 512, h + 1); y += h; }
    x.globalAlpha = 0.25; x.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) x.fillRect(r() * 512, r() * 256, 40 + r() * 120, 2);
    x.globalAlpha = 1; x.fillStyle = '#ffc89a'; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14); // calm poles (no pinched stripes)
  }));
}
function planet() {
  const g = new THREE.Group();
  const m = once('planetMat', () => new THREE.MeshStandardMaterial({ map: planetTex(), emissiveMap: planetTex(), emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.9 }));
  const p = new THREE.Mesh(once('planetGeo', () => new THREE.SphereGeometry(70, 48, 32)), m);
  p.rotation.z = 0.35;
  g.add(p);
  const rm = once('ringMat', () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd8b0').multiplyScalar(1.3), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  const ring = new THREE.Mesh(once('ringGeo', () => new THREE.RingGeometry(92, 132, 96, 1)), rm);
  ring.rotation.set(-Math.PI / 2 + 0.25, 0, 0.35);
  g.add(ring);
  const lbl = textPanel(['PLANET-SCALE COMPUTE', 'phase 2 (permits pending)'], { width: 60, height: 15, bg: '#0a0a1a', fg: YEL, border: YEL, borderW: 14, radius: 24 });
  lbl.position.set(0, -92, 30);
  g.add(lbl);
  g.userData.planet = p;
  return g;
}

/** shipping containers: model weights and GPUs, stacked */
function cargoStack(v) {
  const g = new THREE.Group();
  g.add(kit('cargo' + v, (kt) => {
    const cols = ['#d8283a', '#2a6ad8', '#2fb6a6', '#ff7a1f', '#f2efe6'];
    const stack = v ? [[0, 0, 0, 0], [12.6, 0, 0.4, 1], [6.2, 1, 0.2, 2], [0, 0, -5.4, 3], [12.6, 0, -5.2, 4]] : [[0, 0, 0, 2], [0, 1, 0.3, 0], [0, 2, -0.2, 3], [13, 0, -1, 4], [13, 1, -0.6, 1]];
    for (const [x, lvl, z, c] of stack) {
      const y = 2.6 + lvl * 5.25;
      const m = MAT.paint(cols[c]);
      kt.add(G.rbox(12.2, 5.2, 5.0, 0.15), m, x, y, z);
      for (let i = 0; i < 14; i++) kt.add(G.box(0.18, 4.6, 5.1), m, x - 5.6 + i * 0.86, y, z);
      kt.add(G.box(12.3, 0.3, 5.1), MAT.paint('#3a3a44'), x, y - 2.45, z);
    }
  }));
  const a = textPanel(v ? ['GPUs', 'THIS SIDE UP ↑'] : ['MODEL WEIGHTS', '(DO NOT LEAK)'], { width: 8, height: 3, bg: '#ffffff', fg: INK, border: INK, borderW: 8, radius: 10 });
  a.position.set(0, v ? 2.8 : 13.3, 2.62);
  g.add(a);
  return g;
}

/** investor viewing deck: a cardboard crowd stand (from the garage) + sign */
function viewingDeck() {
  const g = new THREE.Group();
  g.add(cardboardStand(1));
  const s = textPanel(['INVESTOR VIEWING DECK', 'safe distance: 0 m (we checked)'], { width: 13, height: 2.6, bg: YEL, fg: INK, border: INK, borderW: 10, radius: 14 });
  s.position.set(0, 9.4, 2.4);
  g.add(s);
  return g;
}

// =====================================================================================================
export default {
  id: 'takeoff',
  title: 'TAKEOFF',
  subtitle: 'please keep your atoms inside the vehicle',
  night: true,
  palette: {
    skyTop: '#080210', skyBottom: '#4a0f22', road: '#3b2440', ground: '#1a0a18', kerb: RED,
    accent1: RED, accent2: YEL,
  },
  look: {
    sky: 'dusk', env: 'dusk', exposure: 0.8, hills: 1.5,
    // sun swung further right (was 42°) so its disc + mie halo no longer glares at the right edge of the frame
    sun: { elev: 7, azim: 64, color: '#ff8a50', intensity: 3.4 },
    skyParams: { turbidity: 4.5, rayleigh: 3.0, mie: 0.0035, clouds: 0.45 },
    fog: { color: '#7a4050', density: 0.0012 },
    ground: { tex: 'dirt', tint: '#6a4a46', scale: 7 }, road: { tex: 'metalplate', tint: '#8a8a98' },
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const at = (a) => rel >= a && rel < a + 10;
    const A = (p) => out.push({ abs: true, ...p });
    const cell = Math.round(rel / 10);
    const ground = rel < SPACE_REL - 8;
    // steel deck rails both sides, all the way up the ramp and on into space (one 20 m segment every other cell)
    if (cell % 2 === 0) { A({ kind: 'railL', x: -12 }); A({ kind: 'railR', x: 12 }); }
    if (ground) {
      // far landmarks
      if (at(300)) A({ kind: 'vab', x: -200, rotY: 0.35 });
      if (at(320)) A({ kind: 'launchFar', x: 190 });
      if (at(120)) A({ kind: 'launchFar', x: -230 });
      if (at(90)) A({ kind: 'tanks', x: 56, rotY: -0.4 });
      if (at(240)) A({ kind: 'tanks', x: -60, rotY: 0.5 });
      // launch pads + gantries (rockets lift off as you pass)
      if (at(30)) A({ kind: 'gantryR', x: 31, rotY: -0.5 });
      if (at(150)) A({ kind: 'gantryB', x: -46, rotY: 0.5 }); // its pad + smoke face the road: at -30 the smoke engulfed the chase camera
      if (at(260)) A({ kind: 'gantryR', x: 33, rotY: -0.5 });
      if (at(160)) A({ kind: 'radar', x: 34, rotY: -0.5 });
      // spanning the road: the live scoreboard and the acceleration gates up the ramp
      if (at(70) || at(290)) A({ kind: 'scoreboard', x: 0, y: 0 });
      if (at(220) || at(250) || at(320)) A({ kind: 'arch', x: 0 });
      // gags at the roadside
      if (at(10) || at(31)) A({ kind: 'deck', x: -23.5, rotY: Math.PI / 2, scale: 1.35 });
      if (at(100)) A({ kind: 'foom', x: -28, rotY: 0.55, scale: 1.45 });
      if (at(230)) A({ kind: 'foom', x: 28, rotY: -0.55, scale: 1.45 });
      if (at(180)) A({ kind: 'rsi', x: 19, rotY: -0.45 });
      if (at(200)) A({ kind: 'align', x: -19, rotY: 0.45 });
      if (at(130)) A({ kind: 'chart', x: 19.5, rotY: -0.45, scale: 1.1 });
      if (at(120)) A({ kind: 'pause', x: -16.5, rotY: 0.6, scale: 1.3 });
      // floodlight masts + spinning alarm beacons behind the rails
      if (cell % 4 === 1) A({ kind: 'flood', x: (cell % 8 === 1 ? -1 : 1) * 14.8, rotY: cell % 8 === 1 ? 0.9 : -0.9 });
      else if (cell % 4 === 3) A({ kind: 'beacon', x: (cell % 8 === 3 ? 1 : -1) * 14.6, scale: 1.4 });
      // ramp base: smoke everywhere
      if (rel < 150 && rng.chance(0.4)) A({ kind: 'smoke' + rng.int(0, 2), x: (rng.chance(0.5) ? 1 : -1) * rng.range(28, 52), rotY: rng.range(0, 6) });
      else if (rng.chance(0.16)) A({ kind: 'smoke' + rng.int(0, 2), x: (rng.chance(0.5) ? 1 : -1) * rng.range(40, 80), rotY: rng.range(0, 6), scale: 1.6 });
      if (rng.chance(0.3)) { const s = rng.chance(0.5) ? 1 : -1; A({ kind: 'tower', x: s * rng.range(21, 27), rotY: s > 0 ? 0 : Math.PI }); }
      else if (cell % 5 === 2 && rng.chance(0.7)) { const s = cell % 10 === 2 ? 1 : -1; A({ kind: 'cargo' + rng.int(0, 1), x: s * rng.range(30, 40), rotY: -s * rng.range(0.3, 0.9) }); }
    } else {
      // space: the ramp rides on lattice pylons, hoops along it, the Dyson sphere ahead
      if (cell % 4 === 0) A({ kind: 'hoop' + (Math.round(rel / 40) % 2), x: 0 });
      if (cell % 3 === 1) A({ kind: 'pylon', x: 0 });
      if (at(470)) A({ kind: 'scoreboard', x: 0, y: 0 });
      if (at(700)) A({ kind: 'dyson', x: 10, y: 70, scale: 1.4 });
      if (at(400)) A({ kind: 'pod', x: -22, y: 6, rotY: 0.4 });
      if (at(520)) A({ kind: 'launchFar', x: 60, y: -120 });
      if (at(760)) A({ kind: 'planet', x: -250, y: 105, rotY: 0.6 });
      if (at(380)) A({ kind: 'sat', x: 30, y: 14, rotY: -0.5 });
      if (at(490)) A({ kind: 'sat', x: -34, y: 18, rotY: 0.6 });
    }
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('smoke')) return smokeCloud(+kind.slice(5) || 0);
    if (kind.startsWith('hoop')) return hoop(+kind.slice(4) || 0);
    switch (kind) {
      case 'scoreboard': return scoreboard();
      case 'beacon': return beacon();
      case 'tower': return tower();
      case 'gantryR': return gantry(RED);
      case 'gantryB': return gantry('#2a6aff');
      case 'chart': return chartPanel();
      case 'foom': return foomLetters();
      case 'rsi': return rsiPanel();
      case 'align': return alignSign();
      case 'vab': return vab();
      case 'launchFar': return distantLaunch();
      case 'dyson': return dyson();
      case 'pod': return escapePod();
      case 'pause': return pauseButton();
      case 'railL': return deckRail(false);
      case 'railR': return deckRail(true);
      case 'flood': return floodlight();
      case 'arch': return launchArch();
      case 'pylon': return rampPylon();
      case 'tanks': return fuelTanks();
      case 'radar': return radarDish();
      case 'sat': return satellite();
      case 'planet': return planet();
      case 'deck': return viewingDeck();
      case 'cargo0': return cargoStack(0);
      case 'cargo1': return cargoStack(1);
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const seed = entry?.seed || 0;
    const ud = obj.userData;
    if (!ud.init) {
      ud.init = true;
      if (kind.startsWith('smoke') || kind.startsWith('hoop') || kind === 'dyson' || kind === 'launchFar' || kind === 'vab' || kind === 'planet' || kind === 'pylon') noShadow(obj);
    }
    // things that sit on the ramp tilt with it (pooled props get re-spawned: re-apply every frame, it's cheap)
    if (kind === 'railL' || kind === 'railR' || kind === 'arch' || kind.startsWith('hoop')) {
      if (ud.zf !== entry?.zf) { ud.zf = entry?.zf; ud.pitch = rampPitch(entry?.zf ?? 0); }
      obj.rotation.order = 'YXZ';
      obj.rotation.x = ud.pitch;
      if (kind[0] === 'r') return;
    }
    if (kind.startsWith('smoke')) {
      const b = 1 + Math.sin(t * 0.6 + seed * 9) * 0.06;
      ud.puff.scale.set(b, 1 + Math.sin(t * 0.5 + seed * 5) * 0.08, b);
      ud.puff.rotation.y = t * 0.05 + seed * 6;
      return;
    }
    if (kind.startsWith('hoop')) { obj.children[0].rotation.z = t * 0.6 + seed * 3; return; }
    switch (kind) {
      case 'scoreboard': return animateScoreboard(obj, t, seed, beatPhase);
      case 'beacon': return animateBeacon(obj, t, seed);
      case 'tower': ud.top.visible = ((t * 4 + seed * 4) | 0) % 2 === 0; return;
      case 'gantryR': case 'gantryB': return animateGantry(obj, t, entry);
      case 'chart': { const s = 1 + 0.6 * (1 - beatPhase); ud.dot.scale.set(s, s, s); return; }
      case 'foom': return animateFoom(obj, beatPhase);
      case 'rsi':
        ud.needle.rotation.z = -1.2 - ((t * 0.7) % 1) * 2.6 - Math.sin(t * 40) * 0.03;
        ud.led.scale.setScalar(1 + 0.4 * kick(beatPhase));
        return;
      case 'align': ud.lamps.visible = Math.floor(t * 2.5 + seed * 3) % 2 === 0; return;
      case 'launchFar': return animateLaunch(obj, t, seed);
      case 'dyson':
        ud.spin.rotation.y = t * 0.05;
        ud.drones.rotation.y = -t * 0.12;
        ud.star.scale.setScalar(1 + 0.04 * kick(beatPhase));
        return;
      case 'arch': {
        const st = Math.floor(t * 9 + (entry?.seed || 0) * 5);
        ud.seq.forEach((c, i) => (c.visible = (st - i + 50) % 5 < 2));
        ud.strip.visible = beatPhase < 0.55;
        return;
      }
      case 'deck': KIT_U.uBeat.value = beatPhase; KIT_U.uTime.value = t; return;
      case 'radar': ud.dish.rotation.y = t * 0.5 + seed * 6; return;
      case 'sat':
        ud.body.rotation.set(Math.sin(t * 0.4 + seed) * 0.2, t * 0.25 + seed * 6, Math.sin(t * 0.3) * 0.15);
        ud.body.position.y = Math.sin(t * 0.8 + seed * 5) * 0.8;
        return;
      case 'planet': ud.planet.rotation.y = t * 0.03; return;
      case 'pod':
        ud.pod.rotation.set(Math.sin(t * 0.7) * 0.4, t * 0.3, Math.sin(t * 0.5) * 0.3);
        ud.pod.position.y = 6 + Math.sin(t * 0.9 + seed * 6) * 0.8;
        return;
    }
  },
  billboards: [
    'RECURSIVE SELF-IMPROVEMENT: ENABLED', "ALIGNMENT: WE'LL FIGURE IT OUT LATER", 'NEXT EXIT: THE SINGULARITY', 'P(DOOM) UPDATE: YES',
    'LAUNCH SAFETY REVIEW: SKIPPED (vibes were good)', 'PLEASE KEEP YOUR ATOMS INSIDE THE VEHICLE', 'NO SPEED LIMIT BEYOND THIS POINT', 'T-MINUS: ALREADY',
    'LAST CHANCE TO PAUSE (button not connected)', 'MISSION CONTROL: ALSO AN AI', 'ESCAPE VELOCITY: 11.2 km/s · ESCAPE ALIGNMENT: n/a',
  ],
  billboardEvery: 58,
  billboardStyle: { bg: '#1a0814', fg: YEL, border: RED, frame: RED, postColor: '#3a1a2a', postH: 4.2, width: 9.5, height: 4.6 },
  hazards: ['injection'],
  enterLines: ['FOOM!!!', 'HOLD ON TO YOUR ATOMS', 'RECURSIVE SELF-IMPROVEMENT: ENGAGED'],
};
