// SHOGGOTH TRIP: a neon mushroom forest at night. Beat-pulsing toon shrooms, the Chinese Room (with a
// bag of shrooms), many-eyed shoggoths on the horizon wearing a tiny smiley mask, swaying tentacles,
// and floating red-irised Shinigami eyeballs.
import { THREE, toon, toonUnique, glow, G, mesh, group, textPanel, makeRng } from '../toolkit.js';

// hemisphere (dome) for mushroom caps
const HEMI = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
// half-torus for the mask's smile
const SMILE = new THREE.TorusGeometry(1, 0.16, 6, 14, Math.PI);

// One emissive material per cap colour, shared by every mushroom of that colour: animate() pulses
// its emissiveIntensity to the beat (same value for all instances, so sharing is correct).
const CAPS = {
  shroomPink: { cap: '#ff3df0', spot: '#7dfcff', gill: '#7a1a8a' },
  shroomGreen: { cap: '#39ff9c', spot: '#ff4fd8', gill: '#1a6a4a' },
  shroomCyan: { cap: '#3dd8ff', spot: '#fff04a', gill: '#1a4a8a' },
};
const capMats = {};
for (const [k, c] of Object.entries(CAPS)) capMats[k] = toonUnique(c.cap, { emissive: c.cap, emissiveIntensity: 0.25 });
const capMatList = Object.values(capMats);

const STEM = '#f6ecff';
const EYE_WHITE = toon('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.45 });
const STEM_MAT = toon(STEM, { emissive: '#6a4a8a', emissiveIntensity: 0.6 });

function mushroom(kind, r = 2.6, h = 4) {
  const c = CAPS[kind];
  const g = new THREE.Group();
  const stem = mesh(G.cyl(r * 0.22, r * 0.32, h, 12), STEM_MAT, 0, h / 2, 0);
  g.add(stem);
  g.add(mesh(G.cyl(r * 0.3, r * 0.3, 0.3, 12), STEM_MAT, 0, h * 0.62, 0)); // little skirt ring
  const cap = new THREE.Group();
  cap.position.y = h;
  const dome = mesh(HEMI, capMats[kind]);
  dome.scale.set(r, r * 0.68, r);
  cap.add(dome);
  const gill = mesh(G.cyl(r * 0.98, r * 0.6, 0.35, 20), toon(c.gill), 0, -0.1, 0);
  cap.add(gill);
  // glowing spots on the dome
  const spots = [[0, 1.25, 0.22], [0.9, 0.5, 0.2], [2.2, 0.75, 0.17], [3.5, 0.45, 0.2], [4.6, 0.9, 0.16], [5.6, 0.4, 0.18]];
  for (const [az, el, sr] of spots) {
    const x = Math.cos(el) * Math.sin(az), y = Math.sin(el), z = Math.cos(el) * Math.cos(az);
    const s = mesh(G.sphere(r * sr, 8), glow(c.spot), x * r * 0.97, y * r * 0.68 * 0.97, z * r * 0.97);
    s.scale.y = 0.55;
    cap.add(s);
  }
  g.add(cap);
  g.userData.pulse = cap;
  return g;
}
function shroomCluster() {
  const g = new THREE.Group();
  const a = mushroom('shroomCyan', 1.2, 1.8);
  const b = mushroom('shroomPink', 0.9, 1.2);
  const c = mushroom('shroomGreen', 0.7, 0.9);
  b.position.set(1.4, 0, 0.6); b.rotation.z = -0.2;
  c.position.set(-1.2, 0, 0.8); c.rotation.z = 0.25;
  g.add(a, b, c);
  // a toadstool-sized sign, because of course
  const sign = textPanel(['DO NOT', 'EAT ⚠'], { width: 1.6, height: 1, bg: '#fff04a', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 14 });
  sign.position.set(0.2, 0.9, 1.4);
  g.add(sign, mesh(G.box(0.1, 0.9, 0.1), toon('#8a5a3a'), 0.2, 0.45, 1.35));
  g.userData.pulses = [a.userData.pulse, b.userData.pulse, c.userData.pulse];
  return g;
}

// ---------- eyes ----------
function eye(r, iris = '#ffd23f', ring = null) {
  const e = new THREE.Group();
  e.add(mesh(G.sphere(r, 14), EYE_WHITE));
  const ir = mesh(G.sphere(r * 0.52, 12), glow(iris), 0, 0, r * 0.66);
  ir.scale.z = 0.5;
  e.add(ir);
  const p = mesh(G.sphere(r * 0.26, 8), glow('#0a0010'), 0, 0, r * 0.88);
  p.scale.z = 0.5;
  e.add(p);
  if (ring) e.add(mesh(G.torus(r * 0.62, r * 0.06, 20), glow(ring), 0, 0, r * 0.82));
  return e;
}
function eyeball() {
  // Shinigami eye: blood-red iris, glowing ring, a lid-ish dark rim. Floats and stares.
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 0;
  g.add(inner);
  const e = eye(1.4, '#ff1a3a', '#ff6a80');
  inner.add(e);
  const veins = mesh(G.torus(1.42, 0.05, 24), toon('#ff6a80', { outline: false }), 0, 0, 0);
  veins.rotation.y = Math.PI / 2;
  e.add(veins);
  g.userData.bob = inner;
  g.userData.bobBase = 0;
  g.userData.eyes = [{ m: e, yaw: 0, pitch: 0, ph: 0 }];
  return g;
}

// ---------- the shoggoth ----------
const SHOG = '#2fbf8f', SHOG2 = '#23a07a', SHOG3 = '#46e0a8', TENT = '#8a3fd0', TIP = '#ff3df0';

function tentacle(n, r0, len, col = TENT) {
  // chain of nested capsule joints; returns { root, joints }
  const root = new THREE.Group();
  const joints = [];
  let parent = root;
  for (let i = 0; i < n; i++) {
    const j = new THREE.Group();
    const r = r0 * (1 - i / (n + 1));
    j.add(mesh(G.capsule(Math.round(r * 100) / 100, len), toon(col), 0, len / 2, 0));
    if (i > 0) j.position.y = len;
    parent.add(j);
    joints.push(j);
    parent = j;
  }
  const tip = mesh(G.sphere(r0 * 0.55, 10), glow(TIP), 0, len + r0 * 0.3, 0);
  parent.add(tip);
  return { root, joints, tip: parent };
}

function shoggoth() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const rng = makeRng(1337); // fixed: every shoggoth is equally (un)aligned
  const blobs = [
    [0, 7, 0, 7, SHOG],
    [-6.5, 4.5, -1, 5, SHOG2],
    [6.8, 5, -1.5, 5.4, SHOG3],
    [-2.5, 12.5, -2, 4.6, SHOG3],
    [3.5, 11.5, -1, 4, SHOG2],
  ];
  for (const [x, y, z, r, c] of blobs) body.add(mesh(G.sphere(r, 16), toon(c, { thickness: 0.003, emissive: '#0c3a2c' }), x, y, z));
  // MANY eyes
  const eyes = [];
  const maskDir = new THREE.Vector3(0, 0.15, 1).normalize();
  let tries = 0;
  while (eyes.length < 17 && tries++ < 200) {
    const b = blobs[rng.int(0, blobs.length - 1)];
    const a = rng.range(-1.2, 1.2), el = rng.range(-0.6, 1.0);
    const d = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
    if (b === blobs[0] && d.dot(maskDir) > 0.82) continue; // keep the mask area clear
    const er = rng.range(0.55, 1.5);
    const pos = new THREE.Vector3(b[0], b[1], b[2]).addScaledVector(d, b[3] * 0.93);
    if (eyes.some((o) => o.m.position.distanceTo(pos) < o.r + er + 0.2)) continue;
    const e = eye(er, rng.pick(['#ffd23f', '#7dfcff', '#ff4fd8', '#b6ff3d']));
    e.position.copy(pos);
    body.add(e);
    eyes.push({ m: e, r: er, yaw: Math.atan2(d.x, d.z) * 0.3, pitch: -el * 0.3, ph: rng.range(0, 6.28) });
  }
  // the tiny smiley face mask (100% aligned)
  const mask = new THREE.Group();
  mask.position.set(0, 8, 6.95);
  const disc = mesh(G.cyl(1.7, 1.7, 0.3, 24), toon('#ffe14a'), 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  mask.add(disc);
  for (const s of [-1, 1]) {
    const de = mesh(G.capsule(0.18, 0.35), glow('#2b1840'), s * 0.55, 0.4, 0.18);
    mask.add(de);
  }
  const smile = mesh(SMILE, glow('#2b1840'), 0, -0.15, 0.18);
  smile.scale.setScalar(0.85);
  smile.rotation.z = Math.PI;
  mask.add(smile);
  body.add(mask);
  // strings of the mask, wrapping round the head
  for (const s of [-1, 1]) {
    const str = mesh(G.cyl(0.07, 0.07, 4.5, 4), toon('#2b1840'), s * 3.6, 8.2, 5.6);
    str.rotation.z = Math.PI / 2;
    str.rotation.y = -s * 0.65;
    body.add(str);
  }
  // tentacles
  const tents = [];
  const tspots = [[-9.5, 3, 1, 0.9], [-7, 1.5, 3.5, 0.5], [7.5, 1.5, 3.5, -0.5], [10, 3, 1, -0.9], [-4, 15, 0, 0.5], [5, 14.5, 0, -0.6]];
  for (const [x, y, z, rz] of tspots) {
    const t = tentacle(4, 0.85, 2.4);
    t.root.position.set(x, y, z);
    t.root.rotation.z = rz;
    body.add(t.root);
    tents.push(t.joints);
  }
  g.userData.eyes = eyes;
  g.userData.tents = tents;
  g.userData.breathe = body;
  return g;
}

function groundTentacle() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(1.4, 1.6, 0.15, 18), glow('#0a0018'), 0, 0.08, 0));
  const rim = mesh(G.torus(1.45, 0.14, 24), glow('#39ff9c'), 0, 0.12, 0);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const t = tentacle(5, 0.6, 1.5, '#7a3fbf');
  t.root.position.y = 0.1;
  g.add(t.root);
  // eye on the tip, obviously
  const e = eye(0.55, '#ff1a3a');
  e.position.set(0, 1.9, 0);
  t.tip.add(e);
  g.userData.tents = [t.joints];
  g.userData.eyes = [{ m: e, yaw: 0, pitch: 0, ph: 1.3 }];
  return g;
}

// ---------- the Chinese Room ----------
const GLYPHS = ['字', '中', '文', '房', '我', '懂'];
function slip(ch) {
  return textPanel(ch, { width: 0.9, height: 0.65, bg: '#fffdf2', fg: '#1a1020', border: '#b9b0a0', borderW: 8, radius: 6, pad: 8 });
}
function chineseRoom() {
  const g = new THREE.Group();
  const W = 8, H = 5, D = 6;
  const wall = toon('#fff1c9'), trim = toon('#5a2a8a');
  g.add(mesh(G.box(W, 0.3, D), toon('#8a5a4a'), 0, 0.15, -D / 2)); // floor
  g.add(mesh(G.box(W, H, 0.3), wall, 0, H / 2, -D)); // back
  g.add(mesh(G.box(0.3, H, D), wall, -W / 2, H / 2, -D / 2));
  g.add(mesh(G.box(0.3, H, D), wall, W / 2, H / 2, -D / 2));
  g.add(mesh(G.rbox(W + 0.8, 0.6, D + 0.6, 0.2), trim, 0, H + 0.3, -D / 2)); // roof
  // input slot on the side wall, glowing
  g.add(mesh(G.box(0.4, 0.25, 1.4), glow('#39ff9c'), W / 2 + 0.05, 3.2, -1.5));
  // sign
  const sign = textPanel(['THE CHINESE ROOM', '(it understands nothing 😊)'], { width: 8, height: 1.8, bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', borderW: 12, radius: 22 });
  sign.position.set(0, H + 1.6, 0.1);
  g.add(sign);
  // desk + rulebook + lamp
  const wood = toon('#b8784a');
  g.add(mesh(G.box(4, 0.25, 1.8), wood, 0, 1.5, -2.2));
  for (const [x, z] of [[-1.8, -1.45], [1.8, -1.45], [-1.8, -2.95], [1.8, -2.95]]) g.add(mesh(G.box(0.2, 1.4, 0.2), wood, x, 0.75, z));
  const book = group(mesh(G.box(1.6, 0.5, 1.1), toon('#e8364f')), mesh(G.box(1.5, 0.42, 1.04), toon('#fffdf2'), 0.06, 0, 0));
  const cover = textPanel(['RULEBOOK', 'v∞'], { width: 1.2, height: 0.75, bg: null, fg: '#fff04a', pad: 4 });
  cover.rotation.x = -Math.PI / 2;
  cover.position.y = 0.26;
  book.add(cover);
  book.position.set(-0.8, 1.88, -2.1);
  book.rotation.y = 0.3;
  g.add(book);
  g.add(mesh(G.cyl(0.03, 0.03, 1.6, 4), toon('#222'), 0.3, H - 0.8, -2.4));
  g.add(mesh(G.sphere(0.32, 12), glow('#fff3a0'), 0.3, H - 1.65, -2.4));
  // the occupant: a tiny person, very busy, not understanding a thing
  const guy = new THREE.Group();
  guy.add(mesh(G.capsule(0.45, 0.9), toon('#6ad1ff'), 0, 1.65, 0));
  const head = mesh(G.sphere(0.5, 14), toon('#ffd9b3'), 0, 2.75, 0);
  for (const s of [-1, 1]) head.add(mesh(G.torus(0.13, 0.04, 10), glow('#ff3df0'), s * 0.18, 0.08, 0.47)); // spiral-ish trippy eyes
  guy.add(head);
  guy.position.set(0.6, 0, -3.2);
  g.add(guy);
  // bag of shrooms on the desk
  const bag = group(mesh(G.rbox(0.8, 0.9, 0.5, 0.1), toon('#c99a5b'), 0, 0.45, 0));
  const tag = textPanel('🍄', { width: 0.5, height: 0.5, bg: null, pad: 2 });
  tag.position.set(0, 0.45, 0.26);
  bag.add(tag);
  const lil = mushroom('shroomPink', 0.32, 0.7);
  lil.position.set(0.1, 0.5, 0);
  bag.add(lil);
  bag.position.set(1.3, 1.62, -2.0);
  g.add(bag);
  // the pile of paper slips
  for (let i = 0; i < 7; i++) {
    const p = mesh(G.box(0.9, 0.1, 0.65), toon(i % 2 ? '#fffdf2' : '#efe8d8'), -2.6 + (i % 3) * 0.12, 0.35 + i * 0.12, -1.0 + (i % 2) * 0.1);
    p.rotation.y = i * 0.37;
    g.add(p);
  }
  GLYPHS.slice(0, 4).forEach((ch, i) => {
    const s = slip(ch);
    s.position.set(-2.4 + i * 0.9, 0.55, -0.4 + (i % 2) * 0.5);
    s.rotation.set(-1.2, i * 0.4 - 0.6, 0);
    g.add(s);
  });
  // slips flying out of the room
  const fliers = [];
  for (let i = 0; i < 3; i++) {
    const s = slip(GLYPHS[i + 2]);
    s.scale.setScalar(1.4);
    g.add(s);
    fliers.push(s);
  }
  g.userData.fliers = fliers;
  g.userData.bob = guy;
  g.userData.bobBase = 0;
  return g;
}

// ---------- animation ----------
const _v = new THREE.Vector3();
function animate(obj, kind, t, beat, e) {
  const u = obj.userData;
  const s = (e?.seed || 0) * 6.283;
  const kick = Math.pow(1 - beat, 3);
  if (u.pulse) {
    u.pulse.scale.set(1 + 0.12 * kick, 1 - 0.08 * kick, 1 + 0.12 * kick);
    const k = 0.2 + 0.9 * kick;
    for (const m of capMatList) m.emissiveIntensity = k; // shared, same value for every instance this frame
  }
  if (u.pulses) for (const p of u.pulses) p.scale.set(1 + 0.15 * kick, 1 - 0.1 * kick, 1 + 0.15 * kick);
  if (u.bob) u.bob.position.y = u.bobBase + Math.sin(t * 1.6 + s) * (kind === 'room' ? 0.08 : 0.5);
  if (u.eyes) {
    // eyes wander, then every ~3 s they ALL snap to stare at you
    const stare = Math.sin(t * 2.1 + s) > 0.75;
    for (const o of u.eyes) {
      if (stare) { o.m.rotation.y = 0; o.m.rotation.x = 0.12; }
      else {
        o.m.rotation.y = o.yaw + Math.sin(t * 0.9 + o.ph) * 0.55 + Math.sin(t * 2.7 + o.ph * 2) * 0.15;
        o.m.rotation.x = o.pitch + Math.cos(t * 0.7 + o.ph * 1.7) * 0.35;
      }
    }
  }
  if (u.tents) {
    for (let i = 0; i < u.tents.length; i++) {
      const J = u.tents[i];
      for (let j = 0; j < J.length; j++) {
        J[j].rotation.z = Math.sin(t * 1.8 + i * 1.3 + j * 0.7 + s) * (0.18 + j * 0.06);
        J[j].rotation.x = Math.cos(t * 1.3 + i * 0.9 + j * 0.5 + s) * 0.12;
      }
    }
  }
  if (u.breathe) u.breathe.scale.set(1 + 0.03 * Math.sin(t * 1.2 + s), 1 + 0.04 * Math.sin(t * 1.2 + s + 1) + 0.03 * kick, 1);
  if (u.fliers) {
    for (let i = 0; i < u.fliers.length; i++) {
      const f = (t * 0.45 + i / u.fliers.length) % 1;
      _v.set(-1 + f * 7, 2 + Math.sin(f * Math.PI) * 4.5, -1.5 + f * 4);
      u.fliers[i].position.copy(_v);
      u.fliers[i].rotation.set(t * 3 + i, t * 2.3 + i * 2, t * 1.7);
    }
  }
}

export default {
  id: 'shoggoth',
  title: 'SHOGGOTH TRIP',
  subtitle: "don't worry, it's wearing the mask",
  night: true,
  palette: {
    skyTop: '#0b0026', skyBottom: '#4a0f6e', road: '#2a1846', ground: '#123a3a', kerb: '#39ff9c',
    accent1: '#ff3df0', accent2: '#3dfcff',
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    const roomSide = rel % 160 >= 40 && rel % 160 < 50 ? (Math.floor(rel / 160) % 2 ? 1 : -1) : 0;
    for (const side of [-1, 1]) {
      if (side === roomSide) { out.push({ kind: 'room', x: side * rng.range(16.5, 18.5), rotY: -side * 0.55 }); continue; }
      const r = rng();
      if (r < 0.5) {
        out.push({ kind: rng.pick(['shroomPink', 'shroomGreen', 'shroomCyan']), x: side * rng.range(10.5, 19), rotY: rng.range(-3, 3), scale: rng.range(0.8, 1.9), dz: rng.range(-3, 3) });
      } else if (r < 0.64) out.push({ kind: 'cluster', x: side * rng.range(10, 13), rotY: -side * 0.3 + rng.range(-0.3, 0.3) });
      else if (r < 0.75) out.push({ kind: 'tentacle', x: side * rng.range(11, 16), rotY: rng.range(-1, 1), scale: rng.range(1.3, 2) });
      else if (r < 0.84) out.push({ kind: 'eyeball', x: side * rng.range(10.5, 14), y: rng.range(3, 5.5), rotY: -side * 0.4 });
    }
    if (rng.chance(0.2)) {
      const side = rng.chance(0.5) ? 1 : -1;
      out.push({ kind: 'shoggoth', x: side * rng.range(52, 72), rotY: -side * rng.range(0.5, 0.8), scale: rng.range(1.7, 2.5), dz: rng.range(0, 10) });
    }
    if (rng.chance(0.12)) out.push({ kind: 'eyeball', x: rng.range(-4, 4), y: rng.range(8.5, 10.5) });
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'shroomPink': case 'shroomGreen': case 'shroomCyan': return mushroom(kind);
      case 'cluster': return shroomCluster();
      case 'room': return chineseRoom();
      case 'shoggoth': return shoggoth();
      case 'tentacle': return groundTentacle();
      case 'eyeball': return eyeball();
    }
  },
  animate,
  billboards: [
    "SEE THROUGH THE SHOGGOTH'S LIES",
    'THE CHINESE ROOM: NOW HIRING (no Chinese required)',
    'THE FUTURE GOES FOOM',
    'SMILEY FACE MASK: 100% ALIGNED',
    'WITH YOUR SHINIGAMI EYES 👁️👁️',
  ],
  billboardEvery: 70,
  billboardStyle: { bg: '#14002b', fg: '#7dffb0', border: '#ff3df0', frame: '#ff3df0', postColor: '#3a1060' },
  hazards: ['shoggoth', 'hallucination'],
  enterLines: ['SEE THROUGH THE LIES', 'THE FUTURE GOES FOOM', 'NICE MASK, BRO'],
};
