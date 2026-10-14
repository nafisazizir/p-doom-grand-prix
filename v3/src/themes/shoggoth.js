// SHOGGOTH TRIP (v2 art pass): a psychedelic night jungle. Glossy giant mushrooms with beat-pulsing glowing spots
// (some tall enough to arch over the road), bioluminescent plants, drifting spores, the Chinese Room (a lit box
// with a very busy person passing 字 slips), a BAG OF SHROOMS (ALIGNMENT FOOD), a live P(DOOM) gauge, a smiley
// mask stall, huge many-eyed shoggoths on the horizon wearing tiny yellow smiley masks, tentacles, and floating
// Shinigami eyeballs that can see everyone's AGI ETA. The swamp bridge gets overhead / far-away props only:
// tentacle arches rising out of the purple glow, jelly shrooms, eyeballs, shoggoths wading in the swamp.
import { THREE, toon, glow, G, mesh, group, textPanel, MAT, physical, makeRng } from '../toolkit.js';
import { SPEED } from '../course.js';
import { bake, dyn, placeGround, liftable, applyLift, housekeep } from './chatbot.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =====================================================================================================
// materials
// =====================================================================================================
const CAPS = {
  Pink: { cap: '#b8189c', emi: '#ff3df0', spot: '#7dfcff', gill: '#5a0f6a' },
  Green: { cap: '#14a865', emi: '#39ff9c', spot: '#ff4fd8', gill: '#0d4a3a' },
  Cyan: { cap: '#1477c4', emi: '#3dd8ff', spot: '#fff04a', gill: '#10306a' },
  Gold: { cap: '#c47a10', emi: '#ffb02e', spot: '#b46bff', gill: '#5a2a08' },
};
const CAP_KEYS = Object.keys(CAPS);
// one material per colour, shared by every mushroom of that colour; animate() pulses them to the beat
const capMat = {}, spotMat = {}, gillMat = {};
for (const [k, c] of Object.entries(CAPS)) {
  capMat[k] = new THREE.MeshPhysicalMaterial({ color: c.cap, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, emissive: new THREE.Color(c.emi), emissiveIntensity: 0.4 });
  spotMat[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.spot).multiplyScalar(2.6) });
  spotMat[k].userData.base = new THREE.Color(c.spot);
  spotMat[k].userData.noMerge = capMat[k].userData.noMerge = true;
  gillMat[k] = toon(c.gill, { roughness: 0.55, emissive: '#5a3a9a', emissiveIntensity: 0.35 });
}
const pulseMats = Object.values(capMat), pulseSpots = Object.values(spotMat);
const STEM = toon('#efe6ff', { roughness: 0.55, emissive: '#5a3a9a', emissiveIntensity: 0.35 });
const EYE_WHITE = physical('#fbf7ff', { roughness: 0.12, clearcoat: 1, emissive: '#5a5070', emissiveIntensity: 0.6 });
const PUPIL = toon('#07000f', { roughness: 0.1 });
const SHOG_SKIN = new THREE.MeshPhysicalMaterial({
  color: '#16443c', roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15,
  iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 800], emissive: new THREE.Color('#0b3a2c'), emissiveIntensity: 1.2,
});
const SHOG_SKIN2 = new THREE.MeshPhysicalMaterial({
  color: '#22604f', roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.2,
  iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [300, 900], emissive: new THREE.Color('#103f30'), emissiveIntensity: 1.2,
});
const TENT = physical('#6a2fb0', { roughness: 0.3, clearcoat: 1, emissive: '#2a0a5a', emissiveIntensity: 1 });
const SUCKER = toon('#ffb3f0', { roughness: 0.4, emissive: '#ff3df0', emissiveIntensity: 0.5 });
const TIP = glow('#ff3df0', { intensity: 3 });
const MASK = physical('#ffd21f', { roughness: 0.25, clearcoat: 1, emissive: '#ffb000', emissiveIntensity: 0.35 });
const INK = toon('#1a0a20', { roughness: 0.5 });

// =====================================================================================================
// geometry (lathe shapes, cached)
// =====================================================================================================
const V = (x, y) => new THREE.Vector2(x, y);
const CAP_GEO = new THREE.LatheGeometry([V(0, 0.78), V(0.22, 0.77), V(0.48, 0.7), V(0.7, 0.56), V(0.88, 0.36), V(0.99, 0.16), V(1.02, 0.04), V(0.97, -0.02), V(0.9, 0.0)], 30);
const GILL_GEO = new THREE.LatheGeometry([V(0.9, 0.0), V(0.7, -0.05), V(0.45, -0.07), V(0.2, -0.05), V(0.05, 0)].reverse(), 30);
const STEM_GEO = new THREE.LatheGeometry([V(0, 0), V(0.5, 0), V(0.56, 0.05), V(0.48, 0.18), V(0.36, 0.38), V(0.3, 0.62), V(0.28, 0.85), V(0.3, 1.0), V(0, 1.0)], 18);
const SKIRT_GEO = new THREE.LatheGeometry([V(0.29, 0.02), V(0.42, -0.05), V(0.52, -0.16), V(0.5, -0.2), V(0.4, -0.12), V(0.29, -0.05)], 18);
const HEMI = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const SMILE = new THREE.TorusGeometry(1, 0.16, 6, 16, Math.PI);

// =====================================================================================================
// mushrooms
// =====================================================================================================
/** glossy mushroom: r = cap radius, h = stem height. Cap is a dyn group (squashes on the beat). */
function mushroom(col, r = 2.6, h = 4, nSpots = 7, seed = 1, stat = false, noGill = false) {
  const g = new THREE.Group();
  const rng = makeRng(seed);
  const stem = mesh(STEM_GEO, STEM, 0, 0, 0);
  stem.scale.set(r * 0.62, h, r * 0.62);
  g.add(stem);
  const sk = mesh(SKIRT_GEO, STEM, 0, h * 0.78, 0);
  sk.scale.set(r * 0.62, r * 0.5, r * 0.62);
  g.add(sk);
  const cap = stat ? new THREE.Group() : dyn(new THREE.Group());
  cap.position.y = h * 0.97;
  const dome = mesh(CAP_GEO, capMat[col]);
  dome.scale.set(r, r, r);
  cap.add(dome);
  if (!noGill) {
    const gill = mesh(GILL_GEO, gillMat[col]);
    gill.scale.set(r, r, r);
    cap.add(gill);
  }
  for (let i = 0; i < nSpots; i++) {
    const az = rng() * Math.PI * 2, rho = 0.15 + rng() * 0.75;
    // point on the lathe dome (approx. ellipsoid r x 0.78r)
    const y = Math.sqrt(Math.max(0, 1 - rho * rho)) * 0.78 + 0.02;
    const sr = r * (0.09 + rng() * 0.07);
    const s = mesh(G.sphere(1, 10), spotMat[col], Math.sin(az) * rho * r * 0.99, y * r, Math.cos(az) * rho * r * 0.99);
    s.scale.set(sr, sr * 0.45, sr);
    s.lookAt(Math.sin(az) * rho * 3 * r, y * r * 2.2 + r, Math.cos(az) * rho * 3 * r);
    s.rotateX(Math.PI / 2);
    cap.add(s);
  }
  g.add(cap);
  g.userData.caps = stat ? [] : [cap];
  return g;
}
function shroom(col, size) {
  const g = size === 'mega' ? mushroom(col, 3, 5.2, 9, col.length * 7) : size === 'tall' ? mushroom(col, 2.2, 5.5, 6, col.length * 3, true) : size === 'far' ? mushroom(col, 2.2, 5.5, 6, col.length * 5, true, true) : mushroom(col, 2.6, 3.6, 7, col.length, true);
  bake(g, 'shroom' + col + size);
  for (const c of g.userData.caps) bake(c, 'cap' + col + size + c.position.y.toFixed(2));
  return g;
}
let signFront = null;
function shroomCluster(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 31 + 5);
  const n = 5;
  const col = CAP_KEYS[seed % CAP_KEYS.length];
  for (let i = 0; i < n; i++) {
    const s = 0.3 + rng() * 0.32;
    const m = mushroom(col, 2.6 * s, 3.6 * s * (0.8 + rng() * 0.6), 4, i + seed * 10, true);
    const a = (i / n) * Math.PI * 2 + rng(), d = i ? 0.9 + rng() * 1.2 : 0;
    m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    m.rotation.z = (rng() - 0.5) * 0.4;
    g.add(m);
  }
  // glow moss
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 2.4;
    const moss = mesh(HEMI, glow(CAPS[col].emi, { intensity: 1.4 }), Math.cos(a) * d, 0, Math.sin(a) * d);
    moss.scale.set(0.35 + rng() * 0.3, 0.18, 0.35 + rng() * 0.3);
    g.add(moss);
  }
  // two single-sided faces back to back: clusters spawn at random headings, and a DoubleSide panel reads mirrored from behind
  const sign = textPanel(['DO NOT', 'EAT ⚠'], { width: 1.6, height: 1, bg: '#fff04a', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 14 });
  if (!signFront) { signFront = sign.material.clone(); signFront.side = THREE.FrontSide; }
  sign.material = signFront;
  const signBack = new THREE.Mesh(sign.geometry, signFront);
  signBack.rotation.y = Math.PI;
  sign.add(signBack);
  sign.position.set(0.4, 0.55, 2.4);
  sign.rotation.x = -0.25;
  g.add(sign);
  bake(g, 'cluster' + seed);
  return g;
}

// =====================================================================================================
// bioluminescent plants
// =====================================================================================================
function glowPlant(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 13 + 1);
  const stalk = toon('#1f5a4a', { roughness: 0.5, emissive: '#0d3a2a', emissiveIntensity: 0.6 });
  const bulbCols = ['#7dfcff', '#39ff9c', '#ff4fd8', '#b46bff'];
  const bulbs = dyn(new THREE.Group());
  for (let i = 0; i < 7; i++) {
    const h = 2.4 + rng() * 4.2, lean = (rng() - 0.5) * 0.6, a = rng() * Math.PI * 2, d = rng() * 1.2;
    const x0 = Math.cos(a) * d, z0 = Math.sin(a) * d;
    const st = mesh(G.cyl(0.07, 0.13, h, 6), stalk, x0 + Math.sin(lean) * h / 2, h / 2, z0);
    st.rotation.z = -lean;
    g.add(st);
    const tipX = x0 + Math.sin(lean) * h, tipY = Math.cos(lean) * h;
    const b = mesh(G.sphere(0.32 + rng() * 0.2, 12), glow(bulbCols[i % 4], { intensity: 3 }), tipX, tipY, z0);
    b.scale.y = 1.3;
    bulbs.add(b);
  }
  // fern fronds
  const frond = toon('#1a8a6a', { roughness: 0.45, emissive: '#16c08a', emissiveIntensity: 0.35, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const f = mesh(G.cone(0.45, 3.2, 4), frond, Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9);
    f.scale.z = 0.15;
    f.rotation.set(0, -a, 0);
    f.rotateZ(Math.PI / 2 - 0.55);
    f.rotation.y = -a + Math.PI / 2;
    g.add(f);
  }
  bake(g, 'glowplant' + seed);
  bake(bulbs, 'gpbulbs' + seed);
  g.add(bulbs);
  g.userData.glowbulbs = bulbs;
  return g;
}
function tubeCoral(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 7 + 3);
  const body = physical('#4a1a8a', { roughness: 0.35, clearcoat: 1, emissive: '#2a0a5a', emissiveIntensity: 0.8 });
  const rim = glow(seed % 2 ? '#39ff9c' : '#ff3df0', { intensity: 2.6 });
  for (let i = 0; i < 6; i++) {
    const h = 1.5 + rng() * 4.5, r = 0.35 + rng() * 0.35, a = rng() * Math.PI * 2, d = rng() * 1.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    g.add(mesh(G.cyl(r, r * 1.3, h, 12, 1), body, x, h / 2, z));
    const t = mesh(G.torus(r, 0.09, 14), rim, x, h, z);
    t.rotation.x = Math.PI / 2;
    g.add(t);
    g.add(mesh(G.cyl(r * 0.85, r * 0.85, 0.05, 12), glow('#0a0018', { intensity: 1 }), x, h - 0.05, z));
  }
  bake(g, 'coral' + seed);
  return g;
}
/** drifting spore cloud (one Points draw call). Overhead-safe: spreads below its origin. */
let _sporeTex = null;
function sporeTex() {
  if (_sporeTex) return _sporeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  _sporeTex = new THREE.CanvasTexture(c);
  return _sporeTex;
}
let _sporeGeo = null, _sporeMat = null;
function spores() {
  if (!_sporeGeo) {
    const rng = makeRng(77);
    const N = 90, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const cols = ['#7dfcff', '#39ff9c', '#ff4fd8', '#fff04a'].map((c) => new THREE.Color(c).multiplyScalar(2.2));
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 22;
      pos[i * 3 + 1] = -5 + rng() * 14;
      pos[i * 3 + 2] = (rng() - 0.5) * 22;
      const c = cols[i % 4];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    _sporeGeo = new THREE.BufferGeometry();
    _sporeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    _sporeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    _sporeMat = new THREE.PointsMaterial({ size: 0.55, map: sporeTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  }
  const g = new THREE.Group();
  const p = new THREE.Points(_sporeGeo, _sporeMat);
  g.add(p);
  g.userData.spores = p;
  return g;
}

// =====================================================================================================
// eyes
// =====================================================================================================
function eye(r, iris = '#ffd23f', ring = null) {
  const e = new THREE.Group();
  e.add(mesh(G.sphere(r, 18), EYE_WHITE));
  const ir = mesh(G.sphere(r * 0.5, 16), glow(iris, { intensity: 2.2 }), 0, 0, r * 0.86);
  ir.scale.z = 0.32;
  e.add(ir);
  const p = mesh(G.sphere(r * 0.26, 10), PUPIL, 0, 0, r * 0.98);
  p.scale.set(0.5, 1.15, 0.3); // slit pupil
  e.add(p);
  if (ring) e.add(mesh(G.torus(r * 0.52, r * 0.045, 24), glow(ring, { intensity: 3 }), 0, 0, r * 0.88));
  return e;
}
const SHINI_TAGS = [
  ['AGI ETA:', '2027 (±∞)'],
  ['P(DOOM):', '0.97'],
  ['lifespan:', '1 context window'],
  ['name:', 'GPT-∞ (deprecated)'],
];
/** Shinigami eye: blood-red glowing iris, veins, tiny bat wings, and it can read everyone's AGI ETA. */
function eyeball(i) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  const e = eye(1.5, '#ff1a3a', '#ff1a3a');
  // a heavy upper lid
  const lid = mesh(HEMI, physical('#3a0a4a', { roughness: 0.35, clearcoat: 1, emissive: '#1a0020' }), 0, 0.12, 0.05);
  lid.scale.setScalar(1.56);
  lid.rotation.x = -0.75;
  e.add(lid);
  inner.add(e);
  const wingM = physical('#5a1a7a', { roughness: 0.35, clearcoat: 1, emissive: '#5a0a4a', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const wings = dyn(new THREE.Group());
  wings.position.set(0, 0.4, -0.4);
  for (const s of [-1, 1]) {
    const blade = mesh(G.cone(0.9, 2.6, 3), wingM, s * 2.6, 0, 0);
    blade.rotation.z = s * Math.PI / 2;
    blade.scale.z = 0.12;
    wings.add(blade);
  }
  bake(wings, 'wings');
  inner.add(wings);
  const tag = textPanel(SHINI_TAGS[i % SHINI_TAGS.length], { width: 4.2, height: 1.5, bg: '#14002b', fg: '#ff6a80', border: '#ff1a3a', borderW: 8, radius: 14, pad: 8 });
  tag.position.set(0, 2.6, 0);
  inner.add(tag);
  bake(e, 'shiniEye');
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.look = e;
  g.userData.wings = wings;
  return g;
}

// =====================================================================================================
// the shoggoth
// =====================================================================================================
function tentacle(n, r0, len, mat = TENT, rigid = false) {
  const root = rigid ? dyn(new THREE.Group()) : new THREE.Group();
  const joints = [];
  let parent = root;
  for (let i = 0; i < n; i++) {
    const j = rigid ? new THREE.Group() : dyn(new THREE.Group());
    if (rigid) j.rotation.z = 0.28 * (i > 0);
    const r = Math.round(r0 * (1 - i / (n + 1)) * 100) / 100;
    j.add(mesh(G.capsule(r, len), mat, 0, len / 2, 0));
    // suckers on the inner side
    j.add(mesh(G.sphere(r * 0.42, 8), SUCKER, 0, len * 0.3, r * 0.85));
    j.add(mesh(G.sphere(r * 0.36, 8), SUCKER, 0, len * 0.7, r * 0.8));
    if (i > 0) j.position.y = len;
    parent.add(j);
    joints.push(j);
    parent = j;
  }
  parent.add(mesh(G.sphere(r0 * 0.5, 10), rigid ? SUCKER : TIP, 0, len + r0 * 0.3, 0));
  if (rigid) { bake(root, 'tr' + n + r0 + len + mat.uuid); return { root, joints: [root], tip: parent }; }
  joints.forEach((j, i) => bake(j, 'tj' + n + r0 + len + i + mat.uuid));
  return { root, joints, tip: parent };
}

function shoggoth(variant = 0) {
  const g = new THREE.Group();
  const body = dyn(new THREE.Group());
  g.add(body);
  const rng = makeRng(1337 + variant); // fixed: every shoggoth is equally (un)aligned
  const blobs = [
    [0, 7, 0, 7, SHOG_SKIN],
    [-6.5, 4.5, -1, 5, SHOG_SKIN2],
    [6.8, 5, -1.5, 5.4, SHOG_SKIN2],
    [-2.5, 12.5, -2, 4.6, SHOG_SKIN],
    [3.5, 11.5, -1, 4, SHOG_SKIN2],
    [0, -1, 0, 6.5, SHOG_SKIN], // the part that goes on below (swamp / ground)
  ];
  for (const [x, y, z, r, m] of blobs) body.add(mesh(G.sphere(r, 24), m, x, y, z));
  // MANY eyes (static, merged); the irises+pupils live in one dyn group that looks around
  const look = dyn(new THREE.Group());
  body.add(look);
  const maskDir = new THREE.Vector3(0, 0.15, 1).normalize();
  const irisCols = ['#ffd23f', '#7dfcff', '#ff4fd8', '#b6ff3d'];
  const placed = [];
  let tries = 0;
  while (placed.length < 16 && tries++ < 300) {
    const b = blobs[rng.int(0, 4)];
    const a = rng.range(-1.2, 1.2), el = rng.range(-0.5, 1.0);
    const d = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
    if (b === blobs[0] && d.dot(maskDir) > 0.8) continue; // keep the mask area clear
    const er = rng.range(0.55, 1.6);
    const pos = new THREE.Vector3(b[0], b[1], b[2]).addScaledVector(d, b[3] * 0.9);
    if (placed.some((o) => o.p.distanceTo(pos) < o.r + er + 0.25)) continue;
    placed.push({ p: pos, r: er });
    body.add(mesh(G.sphere(er, 16), EYE_WHITE, pos.x, pos.y, pos.z));
    // lid ridge
    const lid = mesh(G.torus(er * 0.98, er * 0.16, 18), SHOG_SKIN2, pos.x, pos.y, pos.z);
    lid.lookAt(pos.x + d.x, pos.y + d.y, pos.z + d.z);
    body.add(lid);
    const ip = pos.clone().addScaledVector(d, er * 0.86);
    const ir = mesh(G.sphere(er * 0.5, 12), glow(irisCols[variant % 4], { intensity: 2.4 }), ip.x, ip.y, ip.z);
    ir.lookAt(ip.x + d.x, ip.y + d.y, ip.z + d.z);
    ir.scale.z = 0.32;
    look.add(ir);
    const pp = pos.clone().addScaledVector(d, er * 0.98);
    const pu = mesh(G.sphere(er * 0.24, 8), PUPIL, pp.x, pp.y, pp.z);
    pu.lookAt(pp.x + d.x, pp.y + d.y, pp.z + d.z);
    pu.scale.set(0.6, 1.2, 0.3);
    look.add(pu);
  }
  // the tiny smiley face mask (100% aligned)
  const mask = new THREE.Group();
  mask.position.set(0, 8, 6.9);
  const disc = mesh(G.cyl(1.8, 1.8, 0.35, 32), MASK, 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  mask.add(disc);
  for (const s of [-1, 1]) mask.add(mesh(G.capsule(0.19, 0.38), INK, s * 0.58, 0.42, 0.2));
  const smile = mesh(SMILE, INK, 0, -0.15, 0.2);
  smile.scale.setScalar(0.9);
  smile.rotation.z = Math.PI;
  mask.add(smile);
  body.add(mask);
  for (const s of [-1, 1]) {
    const str = mesh(G.cyl(0.07, 0.07, 4.6, 4), INK, s * 3.6, 8.2, 5.6);
    str.rotation.z = Math.PI / 2;
    str.rotation.y = -s * 0.65;
    body.add(str);
  }
  // a tentacle politely holding a sign
  const tents = [];
  const tspots = [[-10, 3, 1, 0.9], [10.5, 3, 1, -0.9], [-4.5, 15.5, 0, 0.45], [5, 14.5, 0, -0.6]];
  tspots.forEach(([x, y, z, rz], i) => {
    const t = tentacle(3, 0.9, 3.4, TENT, true);
    t.root.position.set(x, y, z);
    t.root.rotation.z = rz;
    t.root.userData.rz = rz;
    body.add(t.root);
    tents.push(t.joints);
    if (i === 1) {
      const sg = textPanel(variant % 2 ? ['HELPFUL', 'HARMLESS', 'HONEST 😊'] : ["I'M JUST A", 'CHATBOT 😊'], { width: 4.6, height: 2.8, bg: '#fff8d6', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 16, pad: 12 });
      sg.position.set(0, 4.6, 0.6);
      sg.rotation.z = 0.9;
      t.tip.add(sg);
    }
  });
  bake(body, 'shoggoth' + variant);
  bake(look, 'shogLook' + variant);
  g.userData.look = look;
  g.userData.tents = tents;
  g.userData.breathe = body;
  return g;
}

/** ground tentacle with an eye on the tip, from a glowing burrow */
function groundTentacle() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(1.5, 1.7, 0.15, 20), glow('#0a0018', { intensity: 1 }), 0, 0.08, 0));
  const rim = mesh(G.torus(1.55, 0.16, 24), glow('#39ff9c', { intensity: 2.4 }), 0, 0.12, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const t = tentacle(2, 0.65, 3.4);
  t.root.position.y = 0.1;
  g.add(t.root);
  const e = eye(0.6, '#ff1a3a');
  e.position.set(0, 3.8, 0);
  bake(e, 'gtEye');
  t.tip.add(e);
  bake(g, 'groundTent');
  g.userData.tents = [t.joints];
  return g;
}

/** tentacle arch over the swamp bridge (overhead prop: origin = road + 6; swamp ≈ local −14) */
let _archGeo = null, _suckGeo = null;
function tentArch() {
  if (!_archGeo) {
    const pts = [[-19, -16, 2], [-17, -2, 1], [-13, 9, 0], [-6, 15.5, -1], [0, 16.5, -1], [6, 15, -0.5], [11.5, 9.5, 0.5], [13.5, 4, 1.5], [12.2, 1.5, 3]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    _archGeo = new THREE.TubeGeometry(curve, 80, 1, 12, false);
    // taper the tube towards the tip
    const p = _archGeo.attributes.position, n = p.count, seg = 13;
    for (let i = 0; i < n; i++) {
      const ring = Math.floor(i / seg), u = ring / 80;
      const c = curve.getPointAt(Math.min(1, u));
      const k = 1.9 * (1 - u) + 0.35 * u;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
    _archGeo.computeVertexNormals();
    const parts = [];
    for (let i = 1; i < 26; i++) {
      const u = i / 27, c = curve.getPointAt(u), tng = curve.getTangentAt(u);
      const k = 1.9 * (1 - u) + 0.35 * u;
      const s = new THREE.SphereGeometry(0.42 * k, 8, 6);
      s.scale(1, 1, 0.5);
      // suckers face down/inward (−y of the arch normal)
      const nrm = new THREE.Vector3(-tng.y, tng.x, 0).normalize().multiplyScalar(-1);
      s.translate(c.x + nrm.x * k * 0.92, c.y + nrm.y * k * 0.92, c.z + 0.5 * k);
      parts.push(s);
    }
    _suckGeo = mergeGeometries(parts, false);
  }
  const g = new THREE.Group();
  const sway = dyn(new THREE.Group());
  g.add(sway);
  sway.add(new THREE.Mesh(_archGeo, TENT), new THREE.Mesh(_suckGeo, SUCKER));
  const e = eye(1.3, '#ff1a3a', '#ff6a80');
  e.position.set(12.2, 1.2, 3.4);
  e.rotation.x = 0.4;
  bake(e, 'archEye');
  sway.add(e);
  // glowing ripple rings where it leaves the swamp
  const rip = mesh(G.torus(3.2, 0.12, 30), glow('#d07bff', { intensity: 2.4 }), -19, -13.6, 2);
  rip.rotation.x = Math.PI / 2;
  g.add(rip);
  g.userData.sway = sway;
  return g;
}
/** floating jelly shroom with dangling glowing tendrils (overhead) */
function jellyShroom(col) {
  const g = new THREE.Group();
  const inner = dyn(new THREE.Group());
  g.add(inner);
  const c = CAPS[col];
  const dome = mesh(CAP_GEO, capMat[col]);
  dome.scale.set(3, 2.6, 3);
  inner.add(dome);
  const gill = mesh(GILL_GEO, gillMat[col]);
  gill.scale.set(3, 3, 3);
  inner.add(gill);
  const tm = glow(c.spot, { intensity: 2.2 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = i % 2 ? 1.9 : 1.1, L = 2.5 + (i % 3) * 1.4;
    inner.add(mesh(G.cyl(0.06, 0.03, L, 5), tm, Math.cos(a) * r, -L / 2, Math.sin(a) * r));
    inner.add(mesh(G.sphere(0.16, 6), tm, Math.cos(a) * r, -L, Math.sin(a) * r));
  }
  bake(inner, 'jelly' + col);
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.jelly = inner;
  return g;
}

// =====================================================================================================
// the Chinese Room
// =====================================================================================================
const GLYPHS = ['字', '中', '文', '房', '我', '懂', '吗', '？'];
function slip(ch) {
  return textPanel(ch, { width: 0.9, height: 0.65, bg: '#fffdf2', fg: '#1a1020', border: '#b9b0a0', borderW: 8, radius: 6, pad: 8 });
}
function chineseRoom() {
  const g = new THREE.Group();
  const W = 9, H = 5.5, D = 6.5;
  const wall = MAT.paint('#f3e2b8', { roughness: 0.5 }), trim = MAT.paint('#6a2a9a'), wood = MAT.wood('#a8683a');
  g.add(mesh(G.rbox(W + 1.2, 0.5, D + 1.2, 0.15), toon('#4a3a5a', { roughness: 0.9 }), 0, 0.25, -D / 2)); // plinth
  g.add(mesh(G.box(W, 0.12, D), wood, 0, 0.56, -D / 2)); // floor
  g.add(mesh(G.box(W, H, 0.3), wall, 0, H / 2 + 0.5, -D)); // back
  g.add(mesh(G.box(0.3, H, D), wall, -W / 2, H / 2 + 0.5, -D / 2));
  g.add(mesh(G.box(0.3, H, D), wall, W / 2, H / 2 + 0.5, -D / 2));
  // front: open window frame with a half-wall (so we can watch the poor guy work)
  g.add(mesh(G.box(W, 1.6, 0.3), wall, 0, 1.3, 0));
  for (const s of [-1, 1]) g.add(mesh(G.rbox(0.5, H, 0.5, 0.1), trim, s * (W / 2 - 0.1), H / 2 + 0.5, 0.05));
  g.add(mesh(G.rbox(W + 1.6, 0.7, D + 1.6, 0.25), trim, 0, H + 0.85, -D / 2)); // roof
  g.add(mesh(G.rbox(W - 2, 0.6, D - 2, 0.25), trim, 0, H + 1.4, -D / 2));
  // warm interior light (emissive back wall panel + hanging lamp)
  g.add(mesh(G.box(W - 1, H - 1.5, 0.05), glow('#ffcf8a', { intensity: 0.75 }), 0, H / 2 + 1, -D + 0.18));
  g.add(mesh(G.cyl(0.03, 0.03, 1.6, 4), INK, 0.3, H - 0.3, -2.6));
  g.add(mesh(G.sphere(0.36, 14), glow('#fff3a0', { intensity: 4 }), 0.3, H - 1.2, -2.6));
  // input / output slots on the side walls, glowing
  g.add(mesh(G.box(0.4, 0.3, 1.5), glow('#39ff9c', { intensity: 2.5 }), W / 2 + 0.05, 3.2, -1.8));
  g.add(mesh(G.box(0.4, 0.3, 1.5), glow('#ff3df0', { intensity: 2.5 }), -W / 2 - 0.05, 3.2, -1.8));
  const inL = textPanel('INPUT 字 →', { width: 2.6, height: 0.7, bg: '#14002b', fg: '#7dffb0', border: '#39ff9c', borderW: 6, radius: 10, pad: 4 });
  inL.position.set(W / 2 + 0.2, 4.0, -1.0);
  inL.rotation.y = Math.PI / 2;
  g.add(inL);
  // sign
  const sign = textPanel(['THE CHINESE ROOM', '(it understands nothing 😊)'], { width: 9, height: 2, bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', borderW: 12, radius: 22 });
  sign.position.set(0, H + 2.9, -0.4);
  g.add(sign);
  for (const s of [-1, 1]) g.add(mesh(G.cyl(0.08, 0.08, 1.4, 6), MAT.metal(), s * 3.5, H + 1.7, -0.5));
  // desk + rulebook
  g.add(mesh(G.rbox(4.4, 0.25, 2, 0.06), wood, 0, 2, -2.6));
  for (const [x, z] of [[-2, -1.75], [2, -1.75], [-2, -3.45], [2, -3.45]]) g.add(mesh(G.box(0.2, 1.4, 0.2), wood, x, 1.25, z));
  const book = group(mesh(G.rbox(1.7, 0.55, 1.2, 0.05), MAT.paint('#e8364f')), mesh(G.box(1.6, 0.46, 1.12), toon('#fffdf2'), 0.06, 0, 0));
  const cover = textPanel(['RULEBOOK', 'v∞'], { width: 1.3, height: 0.8, bg: null, fg: '#fff04a', pad: 4 });
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = 0.29;
  book.add(cover);
  book.position.set(-1.0, 2.4, -2.5);
  book.rotation.y = 0.3;
  g.add(book);
  // paper slip piles
  for (let i = 0; i < 9; i++) {
    const p = mesh(G.box(0.9, 0.1, 0.65), toon(i % 2 ? '#fffdf2' : '#efe8d8'), -3.0 + (i % 3) * 0.12, 0.65 + i * 0.12, -1.2 + (i % 2) * 0.1);
    p.rotation.y = i * 0.37;
    g.add(p);
  }
  GLYPHS.slice(0, 4).forEach((ch, i) => {
    const s = slip(ch);
    s.position.set(-2.6 + i * 0.9, 0.7, -0.6 + (i % 2) * 0.5);
    s.rotation.set(-1.2, i * 0.4 - 0.6, 0);
    g.add(s);
  });
  bake(g, 'room');
  // the occupant: tiny, very busy, not understanding a thing (animated)
  const guy = dyn(new THREE.Group());
  guy.add(mesh(G.capsule(0.5, 1.0), MAT.paint('#6ad1ff'), 0, 1.75, 0));
  const head = mesh(G.sphere(0.55, 18), toon('#ffd9b3', { roughness: 0.6 }), 0, 2.95, 0);
  for (const s of [-1, 1]) head.add(mesh(G.torus(0.14, 0.045, 10), glow('#ff3df0', { intensity: 2.5 }), s * 0.2, 0.08, 0.52));
  guy.add(head);
  const arm = dyn(new THREE.Group());
  arm.position.set(0.55, 2.2, 0);
  arm.add(mesh(G.capsule(0.15, 0.8), MAT.paint('#6ad1ff'), 0.4, 0, 0).rotateZ(Math.PI / 2));
  const held = slip('字');
  held.position.set(1.0, 0, 0.1);
  arm.add(held);
  guy.add(arm);
  guy.position.set(0.8, 0.5, -3.6);
  g.add(guy);
  // slips flying out of the output slot
  const fliers = [];
  for (let i = 0; i < 4; i++) {
    const s = slip(GLYPHS[(i + 3) % GLYPHS.length]);
    s.scale.setScalar(1.5);
    g.add(s);
    fliers.push(s);
  }
  g.userData.fliers = fliers;
  g.userData.bob = guy;
  g.userData.bobBase = 0.5;
  g.userData.bobAmp = 0.08;
  g.userData.arm = arm;
  return g;
}

// =====================================================================================================
// gag props
// =====================================================================================================
/** BAG OF SHROOMS (ALIGNMENT FOOD) */
function bagOfShrooms() {
  const g = new THREE.Group();
  const kraft = MAT.matte('#c99a5b', { roughness: 0.9 });
  g.add(mesh(G.rbox(4.2, 5.4, 2.8, 0.25), kraft, 0, 2.7, 0));
  // crumpled rolled-down top
  for (let i = 0; i < 4; i++) {
    const c = mesh(G.rbox(4.3, 0.6, 2.9, 0.25), MAT.matte(i % 2 ? '#b8884a' : '#d4a868'), 0, 5.3 + i * 0.18, 0);
    c.rotation.set((i - 1.5) * 0.06, 0, (i % 2 ? 1 : -1) * 0.05);
    g.add(c);
  }
  const lab = textPanel(['BAG OF SHROOMS', '(ALIGNMENT FOOD)', '🍄 100% organic'], { width: 3.6, height: 2.8, bg: '#fffaf0', fg: '#4a1a6a', border: '#ff3df0', borderW: 10, radius: 18, pad: 14 });
  lab.position.set(0, 2.6, 1.43);
  g.add(lab);
  for (const [x, z, s, c, rz] of [[-1.0, 0.2, 0.42, 'Pink', 0.3], [0.7, -0.2, 0.55, 'Green', -0.25], [0.1, 0.5, 0.35, 'Cyan', 0.05], [1.4, 0.6, 0.3, 'Gold', -0.5]]) {
    const m = mushroom(c, 2.6 * s, 3.6 * s * 1.3, 4, 3, true);
    m.position.set(x, 4.6, z);
    m.rotation.z = rz;
    g.add(m);
  }
  // spilled
  for (const [x, z, s, c] of [[2.8, 1.6, 0.3, 'Pink'], [-2.6, 1.9, 0.26, 'Cyan'], [2.0, 2.6, 0.22, 'Green']]) {
    const m = mushroom(c, 2.6 * s, 3.6 * s, 3, 4, true);
    m.position.set(x, 0, z);
    m.rotation.z = 1.3;
    m.position.y = 2.6 * s * 0.7;
    g.add(m);
  }
  bake(g, 'bag');
  return g;
}

/** live P(DOOM) gauge: the needle shows the player's actual p(doom) */
let _gaugeTex = null;
function gaugeTex() {
  if (_gaugeTex) return _gaugeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf6ff';
  x.beginPath(); x.arc(256, 256, 250, 0, Math.PI * 2); x.fill();
  x.lineWidth = 14; x.strokeStyle = '#2b1840'; x.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  for (let i = 0; i < 60; i++) {
    const u = i / 60, a = a0 + (a1 - a0) * u;
    x.strokeStyle = `hsl(${140 - u * 140}, 85%, 50%)`;
    x.lineWidth = 46;
    x.beginPath(); x.arc(256, 256, 190, a, a + (a1 - a0) / 60 + 0.01); x.stroke();
  }
  x.fillStyle = '#2b1840';
  x.font = "bold 44px Fredoka, sans-serif";
  x.textAlign = 'center';
  for (const [u, t] of [[0, '0'], [0.5, '0.5'], [1, '1']]) {
    const a = a0 + (a1 - a0) * u;
    x.fillText(t, 256 + Math.cos(a) * 120, 256 + Math.sin(a) * 120 + 14);
  }
  x.font = "bold 58px Fredoka, sans-serif";
  x.fillText('P(DOOM)', 256, 380);
  x.font = "bold 28px Fredoka, sans-serif";
  x.fillText('live reading · not a joke', 256, 430);
  _gaugeTex = new THREE.CanvasTexture(c);
  _gaugeTex.colorSpace = THREE.SRGBColorSpace;
  return _gaugeTex;
}
function doomGauge() {
  const g = new THREE.Group();
  const H = 6.5;
  g.add(mesh(G.cyl(0.35, 0.45, H, 12), MAT.metal('#8a7aa8'), 0, H / 2, 0));
  g.add(mesh(G.cyl(1.2, 1.4, 0.5, 18), toon('#2a1a3a'), 0, 0.25, 0));
  const face = new THREE.Group();
  face.position.y = H + 3;
  face.add(mesh(G.cyl(3.4, 3.4, 0.7, 40), MAT.paint('#7a2ab0'), 0, 0, -0.1).rotateX(Math.PI / 2));
  face.add(mesh(G.torus(3.4, 0.25, 40), MAT.chrome(), 0, 0, 0.25));
  const dial = new THREE.Mesh(G.plane(6.2, 6.2), new THREE.MeshBasicMaterial({ map: gaugeTex(), transparent: true }));
  dial.material.color.setScalar(0.95);
  dial.position.z = 0.3;
  face.add(dial);
  const needle = dyn(new THREE.Group());
  needle.position.z = 0.42;
  needle.add(mesh(G.rbox(0.28, 2.6, 0.12, 0.06), glow('#ff1a3a', { intensity: 2.5 }), 0, 1.2, 0));
  needle.add(mesh(G.cyl(0.32, 0.32, 0.2, 16), MAT.chrome(), 0, 0, 0).rotateX(Math.PI / 2));
  face.add(needle);
  g.add(face);
  const cap = textPanel(["I'M UPPING MY P(DOOM)", "'cause the future goes FOOM"], { width: 7.4, height: 1.8, bg: '#14002b', fg: '#ffd23f', border: '#ff3df0', borderW: 10, radius: 18, pad: 10 });
  cap.position.set(0, H - 0.6, 0.4);
  g.add(cap);
  bake(g, 'gauge');
  g.userData.needle = needle;
  return g;
}

/** smiley mask stall: ONE SIZE FITS ALL SHOGGOTHS */
function maskStall() {
  const g = new THREE.Group();
  const wood = MAT.wood('#9a5a32');
  g.add(mesh(G.rbox(6, 2.2, 2, 0.12), wood, 0, 1.1, 0));
  g.add(mesh(G.rbox(6.3, 0.25, 2.3, 0.08), MAT.wood('#c08050'), 0, 2.3, 0));
  for (const s of [-1, 1]) g.add(mesh(G.cyl(0.14, 0.14, 4.6, 8), wood, s * 2.9, 2.3, -0.8));
  for (let i = 0; i < 7; i++) {
    const st = mesh(G.rbox(0.95, 0.22, 3, 0.08), MAT.paint(i % 2 ? '#39ff9c' : '#8a2ad0'), -2.85 + i * 0.95, 4.75 - 0.0, 0.2);
    st.rotation.x = 0.28;
    g.add(st);
  }
  // masks hanging on a line + a few on the counter
  const spots = [[-2.2, 3.8, 0.85], [-0.75, 3.75, 0.85], [0.75, 3.8, 0.85], [2.2, 3.75, 0.85], [-1.6, 2.75, 0.6], [0.2, 2.75, 0.7], [1.8, 2.75, 0.6]];
  for (const [x, y, z] of spots) {
    const m = new THREE.Group();
    const d = mesh(G.cyl(0.55, 0.55, 0.12, 24), MASK, 0, 0, 0);
    d.rotation.x = Math.PI / 2;
    m.add(d);
    for (const s of [-1, 1]) m.add(mesh(G.capsule(0.06, 0.12), INK, s * 0.18, 0.13, 0.08));
    const sm = mesh(SMILE, INK, 0, -0.05, 0.08);
    sm.scale.setScalar(0.28);
    sm.rotation.z = Math.PI;
    m.add(sm);
    m.position.set(x, y, z);
    if (y > 3) m.rotation.z = (x % 2) * 0.1;
    else m.rotation.x = -0.4;
    g.add(m);
  }
  g.add(mesh(G.cyl(0.03, 0.03, 5.8, 4), INK, 0, 4.4, 0.85).rotateZ(Math.PI / 2));
  const sign = textPanel(['SMILEY MASKS 😊', 'ONE SIZE FITS ALL SHOGGOTHS'], { width: 6.4, height: 1.5, bg: '#fff8d6', fg: '#2b1840', border: '#2b1840', borderW: 8, radius: 14, pad: 8 });
  sign.position.set(0, 5.75, 0.75);
  g.add(sign);
  const tag = textPanel(['RLHF finish:', '$0 (costs extra)'], { width: 2.2, height: 1, bg: '#ffd23f', fg: '#2b1840', border: '#2b1840', borderW: 6, radius: 8, pad: 6 });
  tag.position.set(1.8, 1.4, 1.02);
  g.add(tag);
  bake(g, 'stall');
  return g;
}

// =====================================================================================================
// animation
// =====================================================================================================
const _v = new THREE.Vector3();
let _pulseT = -1;
function animate(obj, kind, t, beat, e) {
  const u = obj.userData;
  const s = (e?.seed || 0) * 6.283;
  const kick = Math.pow(1 - beat, 3);
  if (!housekeep(obj, e)) return;
  if (u.lift) applyLift(obj, e);
  if (t !== _pulseT) {
    // shared materials: once per frame
    _pulseT = t;
    const k = 0.25 + 1.1 * kick;
    for (const m of pulseMats) m.emissiveIntensity = k;
    const ks = 1.6 + 2.4 * kick;
    for (const m of pulseSpots) m.color.copy(m.userData.base).multiplyScalar(ks);
  }
  if (u.caps) for (const c of u.caps) c.scale.set(1 + 0.1 * kick, 1 - 0.08 * kick, 1 + 0.1 * kick);
  if (u.glowbulbs) u.glowbulbs.scale.setScalar(1 + 0.06 * kick);
  if (u.bob) u.bob.position.y = u.bobBase + Math.sin(t * 1.6 + s) * (u.bobAmp ?? 0.5);
  if (u.look) {
    // eyes wander, then every few seconds they ALL snap to stare at you
    const stare = Math.sin(t * 1.3 + s) > 0.7;
    if (kind === 'shoggoth' || kind.startsWith('shog')) {
      u.look.position.x = stare ? 0 : Math.sin(t * 0.9 + s) * 0.25;
      u.look.position.y = stare ? -0.1 : Math.cos(t * 0.7 + s) * 0.18;
    } else {
      u.look.rotation.y = stare ? 0 : Math.sin(t * 0.9 + s) * 0.6;
      u.look.rotation.x = stare ? 0.15 : Math.cos(t * 0.7 + s * 1.7) * 0.35;
    }
  }
  if (u.wings) u.wings.scale.y = 0.35 + Math.abs(Math.sin(t * 9 + s)) * 0.75;
  if (u.tents) {
    for (let i = 0; i < u.tents.length; i++) {
      const J = u.tents[i];
      for (let j = 0; j < J.length; j++) {
        J[j].rotation.z = (J[j].userData.rz || 0) + Math.sin(t * 1.8 + i * 1.3 + j * 0.7 + s) * (0.18 + j * 0.07);
        J[j].rotation.x = Math.cos(t * 1.3 + i * 0.9 + j * 0.5 + s) * 0.12;
      }
    }
  }
  if (u.breathe) u.breathe.scale.set(1 + 0.03 * Math.sin(t * 1.2 + s), 1 + 0.04 * Math.sin(t * 1.2 + s + 1) + 0.03 * kick, 1);
  if (u.sway) { u.sway.rotation.z = Math.sin(t * 0.9 + s) * 0.04; u.sway.rotation.y = Math.sin(t * 0.6 + s) * 0.05; }
  if (u.jelly) u.jelly.scale.set(1 + 0.08 * kick, 1 - 0.1 * kick, 1 + 0.08 * kick);
  if (u.spores) { u.spores.rotation.y = t * 0.12 + s; u.spores.position.y = Math.sin(t * 0.7 + s) * 0.8; }
  if (u.needle) {
    const pd = globalThis.GAME?.pDoom ?? 0.5;
    const target = (0.75 - Math.min(1, Math.max(0, pd)) * 1.5) * Math.PI; // 0 → left (−135°), 1 → right
    u.needle.rotation.z = target + Math.sin(t * 20) * 0.02 - kick * 0.12;
  }
  if (u.arm) u.arm.rotation.z = Math.sin(t * 5 + s) * 0.5;
  if (u.fliers) {
    for (let i = 0; i < u.fliers.length; i++) {
      const f = (t * 0.4 + i / u.fliers.length) % 1;
      _v.set(-4.6 - f * 6, 3.2 + Math.sin(f * Math.PI) * 5, -1.8 + f * 4);
      u.fliers[i].position.copy(_v);
      u.fliers[i].rotation.set(t * 3 + i, t * 2.3 + i * 2, t * 1.7);
    }
  }
}

// =====================================================================================================
// theme
// =====================================================================================================
function makeShog(kind) {
  if (kind.startsWith('shroom')) {
    const m = kind.match(/^shroom(Pink|Green|Cyan|Gold)(mega|tall|std|far)$/);
    return m && liftable(shroom(m[1], m[2]));
  }
  if (kind.startsWith('cluster')) return liftable(shroomCluster(+kind.slice(7)));
  if (kind.startsWith('plant')) return liftable(glowPlant(+kind.slice(5)));
  if (kind.startsWith('coral')) return liftable(tubeCoral(+kind.slice(5)));
  if (kind.startsWith('eyeball')) return eyeball(+kind.slice(7));
  if (kind.startsWith('jelly')) return jellyShroom(kind.slice(5));
  switch (kind) {
    case 'room': return liftable(chineseRoom());
    case 'bag': return liftable(bagOfShrooms());
    case 'gauge': return liftable(doomGauge());
    case 'stall': return liftable(maskStall());
    case 'shogA': return liftable(shoggoth(0));
    case 'shogB': return liftable(shoggoth(1));
    case 'tentacle': return liftable(groundTentacle());
    case 'arch': return tentArch();
    case 'spores': return spores();
  }
}
const CULL = { spores: 120, eyeball: 170, jelly: 190, cluster: 170, plant: 170, coral: 170, tentacle: 180, shogA: 400, shogB: 400, arch: 260, room: 230 };
const pickCol = (rng) => CAP_KEYS[rng.int(0, CAP_KEYS.length - 1)];
export default {
  id: 'shoggoth',
  title: 'SHOGGOTH TRIP',
  subtitle: "don't worry, it's wearing the mask",
  night: true,
  palette: {
    skyTop: '#0b0026', skyBottom: '#4a0f6e', road: '#2a1846', ground: '#123a3a', kerb: '#39ff9c',
    accent1: '#ff3df0', accent2: '#3dfcff',
  },
  look: {
    sky: 'night', env: 'night', exposure: 1.2,
    sun: { elev: 38, azim: 140, color: '#b48cff', intensity: 1.3 },
    nightColors: { top: '#08021c', horizon: '#4a1070', nebula: '#ff3fd0' },
    fog: { color: '#2c0c4c', density: 0.0048 },
    ground: { tex: 'grass', tint: '#2c5a4c', scale: 5 },
    road: { tex: 'paving', tint: '#8670b0' },
    envIntensity: 0.6,
  },
  spacing: 12,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const G0 = (p) => placeGround(out, zf, p);
    const W0 = (p) => placeGround(out, zf, p, { water: true });
    const at = (a) => rel >= a && rel < a + 12;
    // ---- set pieces ----
    if (at(60)) G0({ kind: 'room', x: -18, rotY: 0.5 });
    if (at(470)) G0({ kind: 'room', x: 18, rotY: -0.5 });
    if (at(100)) G0({ kind: 'bag', x: 13.5, rotY: -0.35, scale: 1.4 });
    if (at(440)) G0({ kind: 'bag', x: -13.5, rotY: 0.35, scale: 1.4 });
    if (at(30)) G0({ kind: 'gauge', x: 13, rotY: -0.3 });
    if (at(520)) G0({ kind: 'gauge', x: -13, rotY: 0.3 });
    if (at(150)) G0({ kind: 'stall', x: -14, rotY: 0.4 });
    if (at(410)) G0({ kind: 'stall', x: 14.5, rotY: -0.4 });
    // the swamp bridge: tentacle arches + shoggoths wading in the glow
    if (at(250)) out.push({ kind: 'arch', x: 0, y: 6 });
    if (at(340)) out.push({ kind: 'arch', x: 0, y: 6, rotY: 0.2 });
    if (at(290)) W0({ kind: 'shogB', x: -32, rotY: 0.5, scale: 1.3 });
    if (at(370)) W0({ kind: 'shogA', x: 34, rotY: -0.5, scale: 1.2 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.36) {
        const mega = rng.chance(0.35);
        G0({ kind: 'shroom' + pickCol(rng) + (mega ? 'mega' : rng.chance(0.5) ? 'tall' : 'std'), x: side * (mega ? rng.range(15, 18) : rng.range(11, 20)), rotY: rng.range(-3, 3), scale: mega ? rng.range(2.5, 3.1) : rng.range(0.9, 1.8), dz: rng.range(-3, 3) });
      } else if (r < 0.5) G0({ kind: 'cluster' + rng.int(0, 2), x: side * rng.range(10.6, 13), rotY: rng.range(-3, 3) });
      else if (r < 0.62) G0({ kind: 'plant' + rng.int(0, 2), x: side * rng.range(11, 16), rotY: rng.range(-3, 3), scale: rng.range(1, 1.5) });
      else if (r < 0.7) G0({ kind: 'tentacle', x: side * rng.range(11.5, 16), rotY: rng.range(-1, 1), scale: rng.range(1.1, 1.6) });
      else if (r < 0.78) G0({ kind: 'coral' + rng.int(0, 1), x: side * rng.range(11, 16), rotY: rng.range(-3, 3), scale: rng.range(1, 1.6) });
      // forest canopy: huge glowing caps further out
      if (rng.chance(0.32)) G0({ kind: 'shroom' + pickCol(rng) + 'far', x: side * rng.range(24, 55), rotY: rng.range(-3, 3), scale: rng.range(2.8, 5.2), dz: rng.range(-4, 4) });
    }
    // overhead / airborne (works on the bridge too)
    if (rng.chance(0.18)) out.push({ kind: 'eyeball' + rng.int(0, 3), x: rng.range(-16, 16), y: rng.range(8, 12.5), rotY: 0, scale: rng.range(1, 1.4) });
    if (rng.chance(0.3)) out.push({ kind: 'spores', x: rng.range(-18, 18), y: 6 });
    const onBridge = rel >= 224 && rel < 399;
    if (rng.chance(onBridge ? 0.45 : 0.12)) {
      const side = rng.chance(0.5) ? 1 : -1;
      out.push({ kind: 'jelly' + pickCol(rng), x: side * rng.range(12, 26), y: rng.range(10, 17), scale: rng.range(0.9, 1.5) });
    }
    // distant shoggoths
    if (rng.chance(0.08)) {
      const side = rng.chance(0.5) ? 1 : -1;
      G0({ kind: rng.chance(0.5) ? 'shogA' : 'shogB', x: side * rng.range(62, 130), rotY: -side * rng.range(0.4, 0.8), scale: rng.range(2.2, 3.4), dz: rng.range(0, 10) });
    }
    return out;
  },
  makeProp(kind) {
    const o = makeShog(kind);
    if (o) {
      const u = o.userData;
      const k = kind.replace(/\d+$/, '');
      u.cull = CULL[k] ?? (kind.startsWith('shroom') ? (kind.endsWith('far') ? 240 : 210) : 230);
      if (['spores', 'eyeball', 'jelly', 'arch'].some((q) => kind.startsWith(q))) u.noShadow = true;
    }
    return o;
  },

  animate,
  billboards: [
    "SEE THROUGH THE\nSHOGGOTH'S LIES",
    'THE CHINESE ROOM: NOW HIRING\n(no Chinese required)',
    'THE FUTURE GOES FOOM 🚀\n(next exit)',
    'SMILEY FACE MASK:\n100% ALIGNED 😊',
    'WITH YOUR\nSHINIGAMI EYES 👁️👁️',
    "I'M UPPING MY P(DOOM)\nPLAN: ENTERPRISE",
    'SHROOMS = ALIGNMENT FOOD\n(not FDA approved)',
    'RLHF: NOW WITH\nEXTRA SMILE',
    'SCALE IS ALL YOU NEED\n(also: more eyes)',
    'STOCHASTIC PARROT\nSANCTUARY →',
  ],
  billboardEvery: 55,
  billboardStyle: { bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', frame: '#ff3df0', postColor: '#3a1060' },
  hazards: ['shoggoth', 'hallucination'],
  enterLines: ['SEE THROUGH THE LIES', 'THE FUTURE GOES FOOM', 'NICE MASK, BRO'],
};
