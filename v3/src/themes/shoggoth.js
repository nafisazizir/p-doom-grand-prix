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
  // v3: the gills glow in the cap's colour (you drive *under* the canopy now, so the undersides are on screen)
  gillMat[k] = toon(c.gill, { roughness: 0.55, emissive: c.emi, emissiveIntensity: 0.42 });
}
const pulseMats = Object.values(capMat), pulseSpots = Object.values(spotMat);
// stems: fibrous, darker at the foot, with a faint glowing band under the cap (canvas texture: u around, v up)
function stemTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, '#8a7aa6'); g.addColorStop(0.3, '#d2c6e6'); g.addColorStop(0.75, '#f4eefc'); g.addColorStop(1, '#fffaff');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  const rng = makeRng(99);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = rng() < 0.5 ? 'rgba(70,40,110,0.16)' : 'rgba(255,255,255,0.18)';
    x.lineWidth = 1 + rng() * 2.5;
    const x0 = rng() * 128;
    x.beginPath(); x.moveTo(x0, 256); x.bezierCurveTo(x0 + (rng() - 0.5) * 12, 170, x0 + (rng() - 0.5) * 12, 80, x0 + (rng() - 0.5) * 8, 0); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
const STEM = new THREE.MeshPhysicalMaterial({ map: stemTex(), roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3, emissive: new THREE.Color('#4a2a8a'), emissiveIntensity: 0.32, sheen: 0.6, sheenColor: new THREE.Color('#d8b8ff') });
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
const VINE = toon('#1d5a40', { roughness: 0.5, emissive: '#0d4a32', emissiveIntensity: 0.6 });
function mushroom(col, r = 2.6, h = 4, nSpots = 7, seed = 1, stat = false, noGill = false, vines = 0) {
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
    const s = mesh(G.sphere(1, 12), spotMat[col], Math.sin(az) * rho * r * 0.99, y * r, Math.cos(az) * rho * r * 0.99);
    s.scale.set(sr, sr * 0.45, sr);
    s.lookAt(Math.sin(az) * rho * 3 * r, y * r * 2.2 + r, Math.cos(az) * rho * 3 * r);
    s.rotateX(Math.PI / 2);
    cap.add(s);
  }
  // glowing vines hanging off the rim (lianas with bioluminescent beads, like a jungle canopy)
  const bead = spotMat[col]; // same material as the cap spots → merged into one draw call, pulses on the beat
  for (let i = 0; i < vines; i++) {
    const az = (i / vines) * Math.PI * 2 + rng() * 0.5, rho = r * (0.7 + rng() * 0.22);
    const L = r * (0.45 + rng() * 0.6);
    const x = Math.sin(az) * rho, z = Math.cos(az) * rho;
    const strand = mesh(G.cyl(0.07, 0.05, 1, 6), gillMat[col], x, -L / 2, z);
    strand.scale.set(r / 6, L, r / 6);
    cap.add(strand);
    const nb = Math.max(2, Math.round(L / (r * 0.26)));
    for (let k = 1; k <= nb; k++) {
      const bs = r * (k === nb ? 0.055 : 0.026);
      const b = mesh(G.sphere(1, 10), bead, x, -L * (k / nb), z);
      b.scale.set(bs, bs * (k === nb ? 1.35 : 1), bs);
      cap.add(b);
    }
  }
  g.add(cap);
  g.userData.caps = stat ? [] : [cap];
  return g;
}
/** bake() skips textured meshes: merge every mesh using `mat` under root (outside dyn groups) into one cached mesh */
const _texMerge = new Map(), _invM = new THREE.Matrix4(), _mm = new THREE.Matrix4();
function mergeMat(root, mat, key) {
  root.updateMatrixWorld(true);
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dyn) return;
    list.push(o);
  });
  if (list.length < 2) return;
  let geo = _texMerge.get(key);
  if (!geo) {
    _invM.copy(root.matrixWorld).invert();
    geo = mergeGeometries(list.map((o) => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
      return g.applyMatrix4(_mm.multiplyMatrices(_invM, o.matrixWorld));
    }));
    geo.computeBoundingSphere();
    _texMerge.set(key, geo);
  }
  for (const o of list) o.parent.remove(o);
  root.add(new THREE.Mesh(geo, mat));
}
// v3 sizes (world units, the kart+driver is 1.86 tall): understory toadstools ≈ 5, tall ≈ 17, canopy megas ≈ 33
// (caps overhang the road like a jungle roof), far ≈ 36, horizon giants ≈ 105
function shroom(col, size) {
  const sd = col.length;
  const g = size === 'mega' ? mushroom(col, 9, 25, 16, sd * 7, false, false, 9)
    : size === 'tall' ? mushroom(col, 4.6, 13, 10, sd * 3, true, false, 4)
    : size === 'far' ? mushroom(col, 8, 28, 11, sd * 5, true, true)
    : size === 'giant' ? mushroom(col, 26, 82, 14, sd * 11, true, true)
    : mushroom(col, 2.6, 3.6, 7, sd, true);
  mergeMat(g, STEM, 'stem' + col + size);
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
  // v3: a proper little road sign on a post (≈ 4.5 tall, MK sign scale)
  const sign = textPanel(['DO NOT', 'EAT ⚠'], { width: 2.4, height: 1.5, bg: '#fff04a', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 14 });
  if (!signFront) { signFront = sign.material.clone(); signFront.side = THREE.FrontSide; }
  sign.material = signFront;
  const signBack = new THREE.Mesh(sign.geometry, signFront);
  signBack.rotation.y = Math.PI;
  sign.add(signBack);
  sign.position.set(0.6, 3.7, 2.5);
  sign.rotation.z = 0.06;
  g.add(sign);
  g.add(mesh(G.cyl(0.09, 0.11, 3.2, 8), MAT.wood('#6a4428'), 0.6, 1.6, 2.45));
  mergeMat(g, STEM, 'stemCluster' + seed);
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
/** glossy tube sponges with flared glowing lips (lathe tubes: smooth, toy-like) */
const TUBE_GEO = new THREE.LatheGeometry([V(0.0, 0), V(0.95, 0), V(1.0, 0.08), V(0.86, 0.3), V(0.74, 0.62), V(0.8, 0.86), V(1.0, 0.97), V(1.12, 1.0), V(1.06, 1.02), V(0.9, 0.99), V(0.72, 0.92), V(0.6, 0.8)], 22);
const LIP_GEO = new THREE.TorusGeometry(1.09, 0.06, 8, 28);
const TUBE_IN = new THREE.CircleGeometry(0.62, 20);
function tubeCoral(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 7 + 3);
  const body = physical(seed % 2 ? '#5a1a9a' : '#a01a7a', { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, emissive: '#2a0a5a', emissiveIntensity: 0.7 });
  const rim = glow(seed % 2 ? '#39ff9c' : '#ff9ae8', { intensity: 2.6 });
  const hole = glow(seed % 2 ? '#0a3a2a' : '#3a0a3a', { intensity: 1 });
  for (let i = 0; i < 7; i++) {
    const h = 1.5 + rng() * 4.5, r = 0.32 + rng() * 0.3, a = rng() * Math.PI * 2, d = 0.3 + rng() * 1.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, lean = (rng() - 0.5) * 0.35;
    const t = mesh(TUBE_GEO, body, x, 0, z);
    t.scale.set(r, h, r);
    t.rotation.z = lean;
    g.add(t);
    const top = new THREE.Vector3(0, h * 1.0, 0).applyEuler(t.rotation).add(t.position);
    const lip = mesh(LIP_GEO, rim, top.x, top.y, top.z);
    lip.scale.set(r, r, r * 1.0);
    lip.rotation.set(Math.PI / 2, 0, 0);
    lip.rotateY(-lean);
    g.add(lip);
    const hl = mesh(TUBE_IN, hole, top.x, top.y - 0.05, top.z);
    hl.scale.setScalar(r * 1.4);
    hl.rotation.set(-Math.PI / 2, 0, 0);
    hl.rotateY(-lean);
    g.add(hl);
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
  mergeMat(g, STEM, 'stemBag');
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
// v3 jungle layers: giant glossy leaves, ground mist, joke road signs, vine arches, swamp lily pads
// =====================================================================================================
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** leaf albedo + emissive (bioluminescent veins). Painted on a 128x256 canvas: u across, v along the leaf. */
let _leafMat = null;
function leafMat() {
  if (_leafMat) return _leafMat;
  const veins = (x, w, h, col, lw) => {
    x.strokeStyle = col; x.lineCap = 'round';
    x.lineWidth = lw * 1.6;
    x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, 4); x.stroke();
    x.lineWidth = lw;
    for (let i = 1; i < 11; i++) {
      const y = h - i * (h / 11.5);
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(w / 2, y); x.quadraticCurveTo(w / 2 + s * w * 0.22, y - 10, w / 2 + s * w * 0.46, y - 30); x.stroke(); }
    }
  };
  const map = canvasTex(128, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2c9a6a'); g.addColorStop(0.5, '#0c4a34'); g.addColorStop(1, '#2c9a6a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const g2 = x.createLinearGradient(0, 0, 0, h);
    g2.addColorStop(0, 'rgba(120,255,200,0.25)'); g2.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = g2; x.fillRect(0, 0, w, h);
    veins(x, w, h, '#7ff0c0', 3);
  });
  const emi = canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    veins(x, w, h, '#3dffd0', 2.5);
    const g = x.createLinearGradient(0, 0, w, 0); // rim glow
    g.addColorStop(0, 'rgba(255,61,240,0.55)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,61,240,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  _leafMat = new THREE.MeshPhysicalMaterial({ map, emissiveMap: emi, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.1, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  return _leafMat;
}
/** one smooth leaf, unit length along +z: pointed outline, folded along the midrib, arching up then drooping */
let _leafGeo = null;
function leafGeo() {
  if (_leafGeo) return _leafGeo;
  const NU = 14, NV = 6, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, w = 0.36 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      pos.push(v * w, Math.sin(u * Math.PI * 0.75) * 0.32 - u * u * 0.42 + Math.abs(v) * w * 0.3, u);
      uv.push(v * 0.5 + 0.5, u);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  _leafGeo = g;
  return g;
}
/** giant jungle plant: a rosette of glossy leaves (one merged mesh) + glowing bud. ≈ 7 tall, 16 across at scale 1. */
const _fernGeo = new Map();
function fern(seed) {
  let geo = _fernGeo.get(seed);
  if (!geo) {
    const rng = makeRng(seed * 17 + 9), parts = [], o = new THREE.Object3D();
    const n = 9 + (seed % 3) * 2;
    for (let i = 0; i < n; i++) {
      const L = 5 + rng() * 4.5, a = (i / n) * Math.PI * 2 + rng() * 0.4, tilt = 0.25 + rng() * 0.75;
      o.position.set(0, 0.4 + rng() * 1.2, 0);
      o.rotation.set(-tilt, a, (rng() - 0.5) * 0.4, 'YXZ');
      o.scale.set(L * (0.85 + rng() * 0.4), L, L);
      o.updateMatrix();
      parts.push(leafGeo().clone().applyMatrix4(o.matrix));
    }
    geo = mergeGeometries(parts);
    geo.computeBoundingSphere();
    _fernGeo.set(seed, geo);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, leafMat()));
  const bud = group(mesh(G.cyl(0.18, 0.3, 4.2, 8), VINE, 0, 2.1, 0), mesh(G.sphere(0.65, 16), glow(seed % 2 ? '#ff4fd8' : '#7dfcff', { intensity: 2.8 }), 0, 4.4, 0));
  g.add(bud);
  bake(g, 'fern' + seed);
  return g;
}

/** low ground cover for the kerb-side strip: little leaf rosettes, glowing moss, tiny bulbs (≈ 1.5 tall, 3 wide) */
function groundCover(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 29 + 4);
  const cols = ['#39ff9c', '#ff4fd8', '#7dfcff', '#fff04a'];
  for (let i = 0; i < 4; i++) {
    const cx = (rng() - 0.5) * 2.2, cz = -7 + i * 4.6 + (rng() - 0.5) * 2;
    for (let k = 0; k < 6; k++) {
      const L = 1.4 + rng() * 1.3, a = (k / 6) * Math.PI * 2 + rng();
      const l = new THREE.Mesh(leafGeo(), leafMat());
      l.position.set(cx, 0.1, cz);
      l.rotation.set(-0.35 - rng() * 0.5, a, 0, 'YXZ');
      l.scale.set(L * 1.1, L, L);
      g.add(l);
    }
    const m = mesh(HEMI, glow(cols[(i + seed) % 4], { intensity: 1.3 }), cx + (rng() - 0.5) * 2, 0, cz + (rng() - 0.5) * 2);
    m.scale.set(0.6 + rng() * 0.5, 0.22, 0.6 + rng() * 0.5);
    g.add(m);
    for (let k = 0; k < 3; k++) {
      const h = 0.7 + rng() * 1.1, bx = cx + (rng() - 0.5) * 1.6, bz = cz + (rng() - 0.5) * 1.6;
      g.add(mesh(G.cyl(0.04, 0.06, h, 5), VINE, bx, h / 2, bz));
      g.add(mesh(G.sphere(0.16, 10), glow(cols[(k + i) % 4], { intensity: 3 }), bx, h, bz));
    }
  }
  mergeMat(g, leafMat(), 'gcLeaf' + seed);
  bake(g, 'gc' + seed);
  return g;
}

/** soft ground mist: a few camera-facing soft quads in one mesh (glowing violet, never over the road) */
let _mistGeo = null, _mistMat = null;
function mist() {
  if (!_mistGeo) {
    const tex = canvasTex(128, 64, (x, w, h) => {
      // elliptical soft blob filling the quad (drawn in a 2:1 squashed space)
      x.setTransform(2, 0, 0, 1, 0, 0);
      const g = x.createRadialGradient(w / 4, h / 2, 1, w / 4, h / 2, h / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w / 2, h);
    });
    tex.colorSpace = THREE.NoColorSpace;
    const parts = [];
    const rng = makeRng(5);
    for (let i = 0; i < 5; i++) {
      const w = 14 + rng() * 8, h = 4 + rng() * 3.5;
      const p = new THREE.PlaneGeometry(w, h);
      p.translate((rng() - 0.5) * 8, h * 0.3, (rng() - 0.5) * 22);
      parts.push(p);
    }
    _mistGeo = mergeGeometries(parts);
    _mistMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#b27cff').multiplyScalar(0.55), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(_mistGeo, _mistMat));
  return g;
}

/** joke road signs on posts (≈ 4.8 tall, MK road-sign scale) */
const SIGNS = [
  [['⚠ SHOGGOTH', 'CROSSING'], '#ffd23f', '#2b1840'],
  [['NOW LEAVING THE', 'TRAINING', 'DISTRIBUTION'], '#14002b', '#7dffb0'],
  [['SPEED LIMIT', '10²⁶ FLOP'], '#fbf7ff', '#2b1840'],
  [['DO NOT FEED', 'THE MASK 😊'], '#ffd23f', '#2b1840'],
  [['⚠ MESA-OPTIMIZERS', 'NEXT 2 KM'], '#ff9a2e', '#2b1840'],
  [['TRIP REPORT:', 'saw god. it was', 'a lookup table'], '#14002b', '#ff9fe8'],
  [['EMERGENT', 'BEHAVIOUR ZONE'], '#39ff9c', '#14002b'],
  [['NO RLHF BEYOND', 'THIS POINT'], '#ff3b5c', '#ffffff'],
];
function roadSign(i) {
  const [text, bg, fg] = SIGNS[i % SIGNS.length];
  const g = new THREE.Group();
  const post = MAT.metal('#8a86a0', { roughness: 0.4 });
  g.add(mesh(G.cyl(0.12, 0.14, 4.2, 10), post, 0, 2.1, 0));
  g.add(mesh(G.cyl(0.3, 0.36, 0.25, 12), post, 0, 0.12, 0));
  g.add(mesh(G.rbox(3.6, 2.3, 0.14, 0.1), MAT.paint('#3a2a50'), 0, 3.6, -0.1));
  const p = textPanel(text, { width: 3.4, height: 2.1, bg, fg, border: fg, borderW: 9, radius: 14, pad: 10 });
  p.material = p.material.clone();
  p.material.side = THREE.FrontSide;
  p.position.set(0, 3.6, -0.02);
  g.add(p);
  bake(g, 'sign' + (i % SIGNS.length));
  return g;
}

/** root arch spanning the road (feet at x = ±16, top ≈ 19 above the road) with glowing lianas + a hanging sign */
const ARCH_SIGNS = [['⚠ YOU ARE NOW LEAVING', 'THE TRAINING DISTRIBUTION'], ['SHOGGOTH TRIP', 'keep hands inside the mask'], ['WELCOME TO THE', 'LATENT JUNGLE 🍄']];
let _rootGeo = null;
const BARK = new THREE.MeshPhysicalMaterial({ color: '#3b2f4a', roughness: 0.6, clearcoat: 0.4, clearcoatRoughness: 0.4, emissive: new THREE.Color('#1a0a2a'), emissiveIntensity: 0.6 });
const MOSS = toon('#1f7a52', { roughness: 0.8, emissive: '#0c4030', emissiveIntensity: 0.5 });
function vineArch(i) {
  if (!_rootGeo) {
    const pts = [[-17, -3, 1], [-15.5, 6, 0.5], [-12, 14, 0], [-6, 18.4, -0.6], [0, 19.4, -0.8], [6, 18.6, -0.4], [12, 14.5, 0.3], [15.2, 7, 0.6], [16.6, -3, 1.2]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const geo = new THREE.TubeGeometry(curve, 90, 1, 14, false);
    const p = geo.attributes.position, seg = 15;
    for (let k = 0; k < p.count; k++) {
      const u = Math.floor(k / seg) / 90, c = curve.getPointAt(Math.min(1, u));
      const r = 1.15 + 1.1 * Math.pow(Math.abs(u - 0.5) * 2, 3) + 0.12 * Math.sin(u * 60);
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
    geo.computeVertexNormals();
    _rootGeo = { geo, curve };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(_rootGeo.geo, BARK));
  const rng = makeRng(40 + i);
  const curve = _rootGeo.curve, P = new THREE.Vector3();
  const lights = ['#7dfcff', '#ff4fd8', '#fff04a', '#39ff9c'];
  // moss tufts + fairy lights along the root
  for (let k = 0; k < 26; k++) {
    curve.getPointAt(0.04 + (k / 26) * 0.92, P);
    const m = mesh(G.sphere(1, 12), MOSS, P.x, P.y + 1.0, P.z);
    m.scale.set(1.3 + rng(), 0.55, 1.3);
    g.add(m);
    g.add(mesh(G.sphere(0.24, 10), glow(lights[k % 4], { intensity: 3 }), P.x, P.y - 1.2, P.z + 0.9));
  }
  // lianas hanging from the top span (bottoms stay ≥ 9 above the road)
  for (let k = 0; k < 9; k++) {
    const u = 0.22 + (k / 8) * 0.56;
    curve.getPointAt(u, P);
    const L = Math.min(P.y - 9.5, 2.5 + rng() * 5.5);
    if (L < 1) continue;
    g.add(mesh(G.cyl(0.08, 0.06, L, 6), VINE, P.x, P.y - 0.8 - L / 2, P.z + (rng() - 0.5)));
    g.add(mesh(G.sphere(0.36, 12), glow(lights[(k + 1) % 4], { intensity: 3 }), P.x, P.y - 0.9 - L, P.z));
    for (let b = 1; b < 4; b++) g.add(mesh(G.sphere(0.13, 8), glow(lights[(k + 2) % 4], { intensity: 2.5 }), P.x, P.y - 0.8 - (L * b) / 4, P.z));
  }
  // giant leaves sprouting from the shoulders
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(fern(7).children[0].geometry, leafMat());
    f.position.set(s * 13.5, 13, 0);
    f.scale.setScalar(0.65);
    f.rotation.z = s * 0.3;
    g.add(f);
  }
  // the hanging sign: plank on two ropes, bottom ≈ 11.5 above the road
  const text = ARCH_SIGNS[i % ARCH_SIGNS.length];
  const plank = mesh(G.rbox(13, 3.3, 0.35, 0.15), MAT.wood('#8a5a32'), 0, 13.6, 0.2);
  g.add(plank);
  for (const s of [-1, 1]) g.add(mesh(G.cyl(0.06, 0.06, 4.2, 4), INK, s * 5.2, 17.2, 0.2));
  const p = textPanel(text, { width: 12.4, height: 2.8, bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', borderW: 10, radius: 16, pad: 10 });
  p.position.set(0, 13.6, 0.4);
  g.add(p);
  const pb = textPanel(text, { width: 12.4, height: 2.8, bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', borderW: 10, radius: 16, pad: 10 });
  pb.material = pb.material.clone(); pb.material.side = THREE.FrontSide;
  pb.position.set(0, 13.6, 0.0);
  pb.rotation.y = Math.PI;
  g.add(pb);
  bake(g, 'vinearch' + i);
  return g;
}

/** glowing lily pads + flowers floating on the swamp */
function lilyPads(seed) {
  const g = new THREE.Group();
  const rng = makeRng(seed * 3 + 11);
  const pad = physical('#1a7a5a', { roughness: 0.3, clearcoat: 1, emissive: '#0a3a2a', emissiveIntensity: 0.8 });
  const rimC = ['#39ff9c', '#ff3df0', '#7dfcff'];
  for (let i = 0; i < 7; i++) {
    const r = 1.6 + rng() * 2.6, a = rng() * Math.PI * 2, d = rng() * 9;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const pd = mesh(G.cyl(1, 1, 0.18, 28), pad, x, 0.05, z);
    pd.scale.set(r, 1, r);
    g.add(pd);
    const rim = mesh(G.torus(1, 0.05, 32), glow(rimC[i % 3], { intensity: 2.2 }), x, 0.14, z);
    rim.scale.set(r, r, r);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    if (i % 2 === 0) {
      for (let k = 0; k < 6; k++) {
        const pe = mesh(G.sphere(0.45, 10), glow(k % 2 ? '#ffd0f8' : rimC[i % 3], { intensity: 2.6 }), x + Math.cos(k) * 0.4, 0.55, z + Math.sin(k) * 0.4);
        pe.scale.set(0.7, 1.4, 0.7);
        pe.rotation.set(Math.sin(k) * 0.5, 0, Math.cos(k) * 0.5);
        g.add(pe);
      }
    }
  }
  bake(g, 'pads' + seed);
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
    const m = kind.match(/^shroom(Pink|Green|Cyan|Gold)(mega|tall|std|far|giant)$/);
    return m && liftable(shroom(m[1], m[2]));
  }
  if (kind.startsWith('cluster')) return liftable(shroomCluster(+kind.slice(7)));
  if (kind.startsWith('plant')) return liftable(glowPlant(+kind.slice(5)));
  if (kind.startsWith('coral')) return liftable(tubeCoral(+kind.slice(5)));
  if (kind.startsWith('eyeball')) return eyeball(+kind.slice(7));
  if (kind.startsWith('jelly')) return jellyShroom(kind.slice(5));
  if (kind.startsWith('fern')) return liftable(fern(+kind.slice(4)));
  if (kind.startsWith('sign')) return liftable(roadSign(+kind.slice(4)));
  if (kind.startsWith('vinearch')) return vineArch(+kind.slice(8));
  if (kind.startsWith('pads')) return liftable(lilyPads(+kind.slice(4)));
  if (kind === 'mist') return liftable(mist());
  if (kind.startsWith('cover')) return liftable(groundCover(+kind.slice(5)));
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
const CULL = { spores: 130, eyeball: 190, jelly: 230, cluster: 170, plant: 190, coral: 190, tentacle: 200, shogA: 420, shogB: 420, arch: 330, room: 260, fern: 220, sign: 170, vinearch: 330, pads: 220, mist: 170, cover: 140 };
const SHROOM_CULL = { std: 190, tall: 270, mega: 330, far: 330, giant: 420 };
const pickCol = (rng) => CAP_KEYS[rng.int(0, CAP_KEYS.length - 1)];
// v3 section map (metres from the section start): descent 0–125, 80° right 125–254, swamp bridge 224–399,
// straight 254–376, 95° left 376–565. Inner side of a turn: +x in the right-hander, −x in the left-hander.
const innerSide = (rel) => (rel >= 105 && rel < 260 ? 1 : rel >= 360 ? -1 : 0);
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
    ground: { tex: 'grass', tint: '#4a8a6c', scale: 5 },
    road: { tex: 'paving', tint: '#8670b0' },
    envIntensity: 0.6,
  },
  spacing: 12,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    // every placement is exact (v3 numbers): ground props keep their footprint outside the kerbs (±11.8)
    const G0 = (p) => placeGround(out, zf, { abs: true, ...p });
    const W0 = (p) => placeGround(out, zf, { abs: true, ...p }, { water: true });
    const at = (a) => rel >= a && rel < a + 12;
    const onBridge = rel >= 226 && rel < 397; // the swamp bridge (28.6–33.2 s)
    const inner = innerSide(rel);
    // ---- set pieces ----
    if (at(60)) G0({ kind: 'room', x: -21, rotY: 0.5 });
    if (at(470)) G0({ kind: 'room', x: 23.5, rotY: -0.5 });
    if (at(100)) G0({ kind: 'bag', x: 20.5, rotY: -0.35, scale: 1.8 });
    if (at(440)) G0({ kind: 'bag', x: -20.5, rotY: 0.35, scale: 1.8 });
    if (at(30)) G0({ kind: 'gauge', x: 18, rotY: -0.3, scale: 1.3 });
    if (at(520)) G0({ kind: 'gauge', x: -18, rotY: 0.3, scale: 1.3 });
    if (at(160)) G0({ kind: 'stall', x: -18, rotY: 0.4, scale: 1.4 });
    if (at(410)) G0({ kind: 'stall', x: 18.5, rotY: -0.4, scale: 1.4 });
    // joke road signs right at the kerb
    for (const [r0, i, sd] of [[12, 1, 1], [84, 0, -1], [132, 2, 1], [192, 4, -1], [420, 3, -1], [456, 7, 1], [500, 5, -1], [548, 6, 1]]) {
      if (at(r0)) G0({ kind: 'sign' + i, x: sd * 14, rotY: -sd * 0.35, dz: 3 });
    }
    // root arches over the road (feet at ±16.5, sign bottom ≈ 11.9 up)
    if (at(36)) out.push({ kind: 'vinearch0', x: 0, abs: true });
    if (at(168)) out.push({ kind: 'vinearch1', x: 0, abs: true });
    if (at(486)) out.push({ kind: 'vinearch2', x: 0, abs: true });
    // the swamp bridge: tentacle arches + shoggoths wading in the glow
    if (at(250)) out.push({ kind: 'arch', x: 0, y: 6, abs: true, scale: 1.12 });
    if (at(340)) out.push({ kind: 'arch', x: 0, y: 6, rotY: 0.2, abs: true, scale: 1.12 });
    if (at(290)) W0({ kind: 'shogB', x: -42, rotY: 0.5, scale: 1.5 });
    if (at(370)) W0({ kind: 'shogA', x: 44, rotY: -0.5, scale: 1.45 });
    for (const side of [-1, 1]) {
      if (onBridge) {
        // swamp: glowing pads, mist, and giant mushrooms growing straight out of the purple water
        if (rng.chance(0.55)) W0({ kind: 'pads' + rng.int(0, 2), x: side * rng.range(16, 34), rotY: rng.range(0, 6) });
        if (rng.chance(0.4)) W0({ kind: 'shroom' + pickCol(rng) + (rng.chance(0.4) ? 'mega' : 'tall'), x: side * rng.range(27, 42), rotY: rng.range(-3, 3), scale: rng.range(0.85, 1.2), dz: rng.range(-3, 3) });
        if (rng.chance(0.3)) W0({ kind: 'mist', x: side * rng.range(26, 42) });
        if (rng.chance(0.25)) G0({ kind: 'shroom' + pickCol(rng) + 'far', x: side * rng.range(48, 80), rotY: rng.range(-3, 3), scale: rng.range(0.9, 1.4) });
      } else {
        // edge band (just past the kerb): small toadstools, glow plants, tentacles, coral
        const r = rng();
        if (r < 0.2) G0({ kind: 'cluster' + rng.int(0, 2), x: side * rng.range(15, 17), rotY: rng.range(-3, 3), scale: rng.range(1, 1.3) });
        else if (r < 0.38) G0({ kind: 'shroom' + pickCol(rng) + 'std', x: side * rng.range(16, 19), rotY: rng.range(-3, 3), scale: rng.range(0.9, 1.3), dz: rng.range(-3, 3) });
        else if (r < 0.54) G0({ kind: 'plant' + rng.int(0, 2), x: side * rng.range(15, 18), rotY: rng.range(-3, 3), scale: rng.range(1.3, 1.8) });
        else if (r < 0.66) G0({ kind: 'tentacle', x: side * rng.range(16, 19), rotY: rng.range(-1, 1), scale: rng.range(1.4, 2) });
        else if (r < 0.78) G0({ kind: 'coral' + rng.int(0, 1), x: side * rng.range(17, 20), rotY: rng.range(-3, 3), scale: rng.range(1.5, 2.2) });
        else if (r < 0.92) G0({ kind: 'fern' + rng.int(0, 2), x: side * rng.range(18, 21), rotY: rng.range(-3, 3), scale: rng.range(0.5, 0.65) });
        if (rng.chance(0.5)) G0({ kind: 'cover' + rng.int(0, 3), x: side * rng.range(15.4, 16.5), rotY: rng.range(-0.2, 0.2) });
        // canopy band: tall + mega mushrooms whose caps roof over the road, big leaves
        const c = rng();
        if (c < 0.3) G0({ kind: 'shroom' + pickCol(rng) + 'mega', x: side * rng.range(17.5, 23), rotY: rng.range(-3, 3), scale: rng.range(0.85, 1.2), dz: rng.range(-3, 3) });
        else if (c < 0.62) G0({ kind: 'shroom' + pickCol(rng) + 'tall', x: side * rng.range(16, 26), rotY: rng.range(-3, 3), scale: rng.range(0.8, 1.3), dz: rng.range(-3, 3) });
        else if (c < 0.85) G0({ kind: 'fern' + rng.int(0, 2), x: side * rng.range(26, 32), rotY: rng.range(-3, 3), scale: rng.range(1.1, 1.6) });
        // back layers: far caps, mist, more leaves
        if (rng.chance(0.55)) G0({ kind: 'shroom' + pickCol(rng) + 'far', x: side * rng.range(34, 70), rotY: rng.range(-3, 3), scale: rng.range(0.8, 1.4), dz: rng.range(-4, 4) });
        if (rng.chance(0.28)) G0({ kind: 'mist', x: side * rng.range(26, 40) });
        if (rng.chance(0.3)) G0({ kind: 'fern' + rng.int(0, 2), x: side * rng.range(36, 55), rotY: rng.range(-3, 3), scale: rng.range(1.6, 2.4) });
      }
      // horizon silhouettes (not on the inside of the S-bends, where they'd land on the road further round)
      if (side !== inner) {
        if (rng.chance(0.2)) G0({ kind: 'shroom' + pickCol(rng) + 'giant', x: side * rng.range(95, 220), rotY: rng.range(-3, 3), scale: rng.range(0.8, 1.3), dz: rng.range(0, 10) });
        if (rng.chance(0.05)) G0({ kind: rng.chance(0.5) ? 'shogA' : 'shogB', x: side * rng.range(130, 220), rotY: -side * rng.range(0.4, 0.8), scale: rng.range(3, 4.4), dz: rng.range(0, 10) });
      }
    }
    // overhead / airborne (works on the bridge too)
    if (rng.chance(0.16)) out.push({ kind: 'eyeball' + rng.int(0, 3), x: rng.range(-16, 16), y: rng.range(12, 19), rotY: 0, scale: rng.range(1.6, 2.2), abs: true });
    if (rng.chance(0.35)) out.push({ kind: 'spores', x: rng.range(-20, 20), y: 6, abs: true });
    if (rng.chance(onBridge ? 0.4 : 0.12)) {
      const side = rng.chance(0.5) ? 1 : -1;
      out.push({ kind: 'jelly' + pickCol(rng), x: side * rng.range(19, 34), y: rng.range(18, 28), scale: rng.range(1.6, 2.4), abs: true });
    }
    return out;
  },
  makeProp(kind) {
    const o = makeShog(kind);
    if (o) {
      const u = o.userData;
      const k = kind.replace(/\d+$/, '');
      u.cull = CULL[k] ?? (kind.startsWith('shroom') ? SHROOM_CULL[kind.replace(/^shroom(Pink|Green|Cyan|Gold)/, '')] ?? 230 : 230);
      if (['spores', 'eyeball', 'jelly', 'arch', 'mist', 'pads'].some((q) => kind.startsWith(q)) || /far|giant/.test(kind)) u.noShadow = true;
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
