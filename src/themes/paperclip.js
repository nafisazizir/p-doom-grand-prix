// PAPERCLIP FACTORY BLUES (chorus 3, the quiet moody one): indigo night, giant silvery paperclips, mountains of
// clips, conveyor belts, PAPERCLIP MAXIMIZER INC., a lit fuse racing you along the left verge (it ends at a
// P(DOOM) bomb right before the next section), a lonely jazz stage playing the Orthogonality Thesis Blues, and an
// empty office whose big red KILLSWITCH is out of office.
import { THREE, toon, toonUnique, glow, G, mesh, textPanel, clamp } from '../toolkit.js';

const SPEED = 30;
const SPACING = 12;
const INK = '#2b1840';
const SILVER = '#cfd8e6';

// ---------- the paperclip (one Gem-style wire bent through three U-turns) ----------
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
  geo.translate(0, 1.85 + r, 0); // bottom of the clip sits on y=0, ~4 units tall
  return geo;
}
const CLIP = clipGeo(110, 8, 0.12);
const CLIP_LO = clipGeo(48, 5, 0.13);

// ---------- local helpers ----------
const every = (rel, period, offset = 0) => rel - offset >= 0 && (rel - offset) % period < SPACING;
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
let windowMat = null;
function windowsMat() {
  if (windowMat) return windowMat;
  const tex = canvasTex('windows', 512, 128, (g, w, h) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 7; c++) {
      g.fillStyle = (r * 7 + c) % 5 === 3 ? '#6a5a9a' : '#ffd27a';
      g.fillRect(14 + c * 71, 12 + r * 60, 58, 44);
    }
  });
  windowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, toneMapped: false });
  windowMat.userData.outlineParameters = { visible: false };
  return windowMat;
}

// ---------- props ----------
function giantClip(color) {
  const g = new THREE.Group();
  const c = mesh(CLIP, toon(color), 0, -0.3, 0);
  c.scale.setScalar(2.1);
  c.rotation.z = 0.12;
  g.add(c);
  g.add(mesh(G.cyl(1.0, 1.3, 0.4, 10), toon('#3a3f6e'), 0.2, 0.1, 0)); // little dirt mound it is jammed into
  g.userData.clip = c;
  return g;
}
function clipPile() {
  const g = new THREE.Group();
  const mound = mesh(G.cone(5, 3.4, 9), toon('#9aa6bd'), 0, 1.7, 0);
  g.add(mound);
  g.add(mesh(G.sphere(1.4, 10), toon('#aeb9cf'), 0.4, 2.6, 0.6));
  const cols = [SILVER, SILVER, '#ff6fa8', SILVER, '#7fd3ff', SILVER, '#ffd23f'];
  const spots = [[0, 3.2, 0], [-2.2, 1.6, 1.5], [2.4, 1.3, 1.8], [-1.0, 2.2, -1.6], [1.6, 2.0, -1.2], [-3.2, 0.6, 0.4], [0.8, 1.0, 3.0]];
  spots.forEach(([x, y, z], i) => {
    const m = mesh(CLIP_LO, toon(cols[i]), x, y - 0.8, z);
    m.scale.setScalar(0.62);
    m.rotation.set(Math.sin(i * 2.1) * 0.9, i * 1.7, Math.cos(i * 1.3) * 0.8);
    g.add(m);
  });
  return g;
}
function conveyor() {
  const g = new THREE.Group();
  const frame = toon('#4b5078');
  const L = 14;
  g.add(mesh(G.box(2.2, 0.5, L), frame, 0, 1.3, 0));
  g.add(mesh(G.box(1.9, 0.08, L + 0.2), toon('#1d1b2e', { outline: false }), 0, 1.58, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(G.box(0.12, 0.3, L), toon('#ffb347'), s * 1.1, 1.75, 0));
    for (const z of [-L / 2 + 1, L / 2 - 1]) g.add(mesh(G.box(0.25, 1.1, 0.25), frame, s * 0.85, 0.55, z));
  }
  // hopper (clips come out) and a bin (clips fall in)
  g.add(mesh(G.rbox(2.6, 2.4, 2.2, 0.12), toon('#6b6f99'), 0, 2.4, -L / 2));
  const tag = textPanel('MORE', { width: 2.0, height: 0.8, bg: '#ffb347', fg: INK, border: INK, borderW: 8, radius: 8 });
  tag.position.set(0, 2.9, -L / 2 + 1.12);
  g.add(tag);
  g.add(mesh(G.rbox(2.6, 1.6, 2.0, 0.12), toon('#3a3f6e'), 0, 0.8, L / 2 + 0.4));
  const clips = [];
  const mat = toon(SILVER);
  for (let i = 0; i < 5; i++) {
    const c = mesh(CLIP_LO, mat, 0, 1.68, 0);
    c.rotation.set(-Math.PI / 2, 0, 0.4 + i * 1.1);
    c.scale.setScalar(0.38);
    g.add(c);
    clips.push(c);
  }
  g.userData.clips = clips;
  g.userData.L = L;
  return g;
}
function factory() {
  const g = new THREE.Group();
  g.add(mesh(G.box(16, 7, 10), toon('#545a8a'), 0, 3.5, 0));
  for (let i = 0; i < 4; i++) {
    const p = mesh(G.cyl(1.9, 1.9, 9.6, 3), toon('#3d4270'), -6 + i * 4, 7.9, 0);
    p.rotation.x = -Math.PI / 2;
    g.add(p);
  }
  const win = new THREE.Mesh(G.plane(14, 3.5), windowsMat());
  win.position.set(0, 3.4, 5.03);
  g.add(win);
  g.add(mesh(G.box(2.4, 2.6, 0.2), toon('#2a2848'), -5.5, 1.3, 5.05));
  const sign = textPanel('PAPERCLIP MAXIMIZER INC.', { width: 15, height: 1.7, bg: '#ffb347', fg: INK, border: INK, borderW: 10, radius: 14 });
  sign.position.set(0, 6.0, 5.1);
  g.add(sign);
  const sub = textPanel('a subsidiary of nothing (yet)', { width: 6, height: 0.7, bg: '#2a2848', fg: '#cfe0ff', border: null, borderW: 0, radius: 6 });
  sub.position.set(3.6, 1.0, 5.1);
  g.add(sub);
  const stackM = toon('#7a7fae'), band = toon('#ff5e7e');
  const puffs = [];
  const puffM = toon('#8d8fb8');
  for (const [x, z] of [[-5, -2.5], [4, -3]]) {
    g.add(mesh(G.cyl(0.9, 1.15, 14, 12), stackM, x, 7, z));
    g.add(mesh(G.cyl(0.98, 0.98, 0.8, 12), band, x, 12.4, z));
    g.add(mesh(G.cyl(0.98, 0.98, 0.8, 12), band, x, 10.6, z));
    for (let i = 0; i < 3; i++) {
      const p = mesh(G.sphere(1.2, 10), puffM, x, 15, z);
      p.userData.base = [x, z, i / 3];
      g.add(p);
      puffs.push(p);
    }
  }
  const logo = mesh(CLIP, toon(SILVER), 0, 8.9, 2.5);
  logo.scale.setScalar(1.3);
  logo.rotation.z = -0.2;
  g.add(logo);
  g.userData.puffs = puffs;
  return g;
}
function fuseSegment() {
  const g = new THREE.Group();
  const stake = toon('#8a5a32');
  for (const z of [-6, 6]) g.add(mesh(G.cyl(0.13, 0.15, 1.2, 6), stake, 0, 0.6, z));
  // two rope pieces (fresh ahead of the spark, burnt behind it) scaled along z every frame
  const fresh = mesh(G.cyl(0.1, 0.1, 1, 6), toon('#e2c28a'), 0, 1.0, 0);
  const burnt = mesh(G.cyl(0.1, 0.1, 1, 6), toon('#2a2230'), 0, 1.0, 0);
  fresh.rotation.x = burnt.rotation.x = Math.PI / 2;
  g.add(fresh, burnt);
  const spark = new THREE.Group();
  spark.position.y = 1.0;
  spark.add(mesh(G.sphere(0.32, 10), glow('#fff6c0')));
  const star = mesh(G.icosa(0.75, 0), glow('#ffb347', { transparent: true, opacity: 0.85 }));
  spark.add(star);
  const bits = [];
  for (let i = 0; i < 5; i++) {
    const b = mesh(G.box(0.12, 0.12, 0.12), glow(i % 2 ? '#ffe066' : '#ff7a3a'));
    spark.add(b);
    bits.push(b);
  }
  g.add(spark);
  Object.assign(g.userData, { fresh, burnt, spark, star, bits });
  return g;
}
function bomb() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 3.2;
  const mat = toonUnique('#2a2840');
  body.add(mesh(G.sphere(3.2, 22), mat));
  body.add(mesh(G.sphere(0.6, 10), glow('#8a88b8'), -1.2, 1.4, 2.5));
  body.add(mesh(G.cyl(0.9, 1.0, 0.9, 12), toon('#4a4870'), 0, 3.3, 0));
  const lbl = textPanel('P(DOOM)', { width: 4.4, height: 1.3, bg: null, fg: '#ffffff', stroke: INK, strokeW: 12 });
  lbl.position.set(0, -0.3, 3.25);
  body.add(lbl);
  g.add(body);
  g.add(mesh(G.cyl(2.2, 2.6, 0.4, 14), toon('#3a3f6e'), 0, 0.2, 0));
  const late = textPanel(['TOO LATE', 'NOW'], { width: 5, height: 2.2, bg: '#ffd23f', fg: INK, border: INK, borderW: 12, radius: 20 });
  late.position.set(0, 8.4, 0.5);
  late.visible = false;
  g.add(late);
  Object.assign(g.userData, { body, mat, late });
  return g;
}
function jazzStage() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(4.3, 4.5, 0.9, 22), toon('#3b2a4a'), 0, 0.45, 0));
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    g.add(mesh(G.sphere(0.16, 8), glow('#ffd27a'), Math.sin(a) * 4.3, 0.8, Math.cos(a) * 4.3));
  }
  const curtain = toon('#8a1f4a');
  for (let i = 0; i < 7; i++) {
    const x = -3.3 + i * 1.1;
    g.add(mesh(G.capsule(0.6, 6), curtain, x, 4.0, -3.0 + Math.abs(x) * 0.12));
  }
  g.add(mesh(G.rbox(8.4, 3.0, 0.3, 0.12), toon('#ff6fd8'), 0, 9.0, -3.2));
  const mq = textPanel(['ORTHOGONALITY', 'THESIS BLUES'], { width: 7.9, height: 2.6, bg: '#1b1640', fg: '#8fd8ff', border: '#ffd27a', borderW: 8, radius: 14 });
  mq.position.set(0, 9.0, -3.0);
  g.add(mq);
  // the sax, alone on its stand (the player is on PTO)
  const gold = toon('#e8b84a');
  const sax = new THREE.Group();
  sax.position.set(0.7, 0.9, 0.6);
  sax.add(mesh(G.cyl(0.24, 0.3, 2.0, 12), gold, 0, 1.6, 0));
  sax.add(mesh(G.sphere(0.36, 12), gold, 0.15, 0.55, 0));
  const up = mesh(G.cyl(0.42, 0.3, 1.1, 12), gold, 0.55, 1.05, 0); up.rotation.z = -0.35; sax.add(up);
  sax.add(mesh(G.cyl(0.62, 0.45, 0.35, 14), gold, 0.75, 1.65, 0));
  const neck = mesh(G.cyl(0.08, 0.13, 0.8, 8), gold, -0.25, 2.85, 0); neck.rotation.z = 0.9; sax.add(neck);
  sax.add(mesh(G.cyl(0.07, 0.07, 0.3, 8), toon(INK), -0.6, 3.1, 0));
  for (let i = 0; i < 4; i++) sax.add(mesh(G.sphere(0.09, 6), toon('#fff2c0'), -0.22, 1.0 + i * 0.4, 0.15));
  sax.add(mesh(G.cyl(0.04, 0.04, 1.3, 6), toon('#222'), 0, 0.3, -0.25));
  sax.rotation.y = 0.5;
  g.add(sax);
  // empty stool + mic
  const dark = toon('#24203a');
  g.add(mesh(G.cyl(0.5, 0.5, 0.18, 12), toon('#b3123a'), -1.4, 2.2, 0.2));
  g.add(mesh(G.cyl(0.07, 0.07, 1.3, 6), dark, -1.4, 1.5, 0.2));
  g.add(mesh(G.cyl(0.04, 0.04, 2.8, 6), dark, 2.4, 2.3, 1.2));
  g.add(mesh(G.sphere(0.2, 8), toon('#888ca8'), 2.4, 3.8, 1.2));
  // spotlight on a truss
  g.add(mesh(G.box(9, 0.35, 0.35), toon('#5a5f88'), 0, 11.2, 1.2));
  const spot = new THREE.Group();
  spot.position.set(0.7, 10.9, 1.2);
  spot.add(mesh(G.cyl(0.35, 0.55, 0.8, 10), dark, 0, 0, 0));
  const beam = mesh(G.cone(2.3, 9.4, 20), glow('#fff1b8', { transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), 0, -4.8, 0);
  spot.add(beam);
  const pool = mesh(G.cyl(2.3, 2.3, 0.04, 22), glow('#fff1b8', { transparent: true, opacity: 0.4, depthWrite: false }), 0, -9.98, 0);
  spot.add(pool);
  g.add(spot);
  const notes = [];
  for (let i = 0; i < 3; i++) {
    const n = textPanel(i % 2 ? '♫' : '♪', { width: 1.0, height: 1.0, bg: null, fg: '#8fd8ff', stroke: INK, strokeW: 8, pad: 4 });
    n.material.depthWrite = false;
    g.add(n);
    notes.push(n);
  }
  const board = textPanel(['LIVE TONIGHT', 'any goal · any IQ', 'no shared values'], { width: 2.6, height: 1.9, bg: '#1b1640', fg: '#ffd27a', border: '#ff6fd8', borderW: 8, radius: 8 });
  board.position.set(-4.6, 1.4, 3.0);
  board.rotation.x = -0.12;
  g.add(board);
  g.add(mesh(G.box(0.12, 1.2, 0.12), dark, -4.6, 0.6, 2.9));
  Object.assign(g.userData, { spot, notes });
  return g;
}
function office() {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(8.4, 0.3, 6.4, 0.08), toon('#46507e'), 0, 0.15, 0));
  g.add(mesh(G.box(8.4, 4.6, 0.3), toon('#c9cde8'), 0, 2.6, -3.1));
  const poster = textPanel(['SAFETY FIRST*', '*after launch'], { width: 2.6, height: 1.5, bg: '#ffffff', fg: INK, border: '#ff5e7e', borderW: 10, radius: 8 });
  poster.position.set(-2.4, 3.3, -2.93);
  g.add(poster);
  // desk + monitor
  const wood = toon('#c79a6a');
  g.add(mesh(G.rbox(3.4, 0.22, 1.5, 0.06), wood, -2.1, 1.45, -1.8));
  for (const x of [-3.6, -0.6]) g.add(mesh(G.box(0.15, 1.35, 1.3), wood, x, 0.75, -1.8));
  g.add(mesh(G.rbox(1.7, 1.1, 0.15, 0.05), toon('#24203a'), -2.1, 2.3, -2.2));
  const scr = textPanel(['BRB', '(never)'], { width: 1.5, height: 0.9, bg: '#1b2a5a', fg: '#7fd3ff', border: null, borderW: 0, radius: 4 });
  scr.position.set(-2.1, 2.3, -2.11);
  g.add(scr);
  // empty chair with a pool float on it
  const chair = new THREE.Group();
  chair.position.set(-1.6, 0, -0.4);
  chair.rotation.y = 2.6;
  chair.add(mesh(G.cyl(0.6, 0.6, 0.18, 12), toon('#2a2848'), 0, 1.0, 0));
  chair.add(mesh(G.rbox(1.1, 1.2, 0.18, 0.08), toon('#2a2848'), 0, 1.7, -0.5));
  chair.add(mesh(G.cyl(0.07, 0.07, 0.8, 6), toon('#888'), 0, 0.5, 0));
  const float = mesh(G.torus(0.45, 0.2, 14), toon('#ff6fa8'), 0, 1.2, 0);
  float.rotation.x = Math.PI / 2;
  chair.add(float);
  g.add(chair);
  // THE KILLSWITCH
  const ks = new THREE.Group();
  ks.position.set(1.9, 0.3, 0.6);
  ks.add(mesh(G.rbox(1.5, 2.0, 1.5, 0.1), toon('#e8e8f0'), 0, 1.0, 0));
  ks.add(mesh(G.cyl(0.8, 0.8, 0.15, 20), toon('#ffd23f'), 0, 2.07, 0));
  ks.add(mesh(G.cyl(0.55, 0.6, 0.35, 20), toon('#ff2b3b'), 0, 2.3, 0));
  const ring = mesh(G.torus(0.85, 0.06, 24), glow('#ff5e5e'), 0, 2.2, 0);
  ring.rotation.x = Math.PI / 2;
  ks.add(ring);
  const lbl = textPanel(['KILL', 'SWITCH'], { width: 1.2, height: 0.9, bg: '#ff2b3b', fg: '#ffffff', border: '#ffffff', borderW: 8, radius: 8 });
  lbl.position.set(0, 1.1, 0.77);
  ks.add(lbl);
  // the out-of-office note, on a stick jammed next to the button
  ks.add(mesh(G.box(0.08, 2.0, 0.08), wood, 0.9, 3.0, 0));
  const ooo = textPanel(['OUT OF OFFICE', '(PTO) 🏖️', 'back after the singularity'], { width: 2.9, height: 1.6, bg: '#fff7a8', fg: INK, border: '#c9a400', borderW: 8, radius: 6 });
  ooo.position.set(0.9, 4.2, 0.06);
  ooo.rotation.z = -0.06;
  ks.add(ooo);
  g.add(ks);
  // beach umbrella, because PTO
  g.add(mesh(G.cyl(0.07, 0.07, 3.8, 6), toon('#eee'), 3.6, 2.0, -1.8));
  g.add(mesh(G.cone(1.9, 0.9, 10), toon('#ff6fa8'), 3.6, 4.0, -1.8));
  g.add(mesh(G.cone(0.8, 0.45, 10), toon('#ffffff'), 3.6, 4.5, -1.8));
  g.userData.ring = ring;
  return g;
}
function memoGantry() {
  const g = new THREE.Group();
  const post = toon('#9aa6bd');
  for (const x of [-10.4, 10.4]) {
    g.add(mesh(G.cyl(0.32, 0.36, 13.4, 10), post, x, 6.7, -0.2));
    g.add(mesh(G.cyl(0.9, 1.0, 0.4, 10), toon('#5a5f88'), x, 0.2, -0.2));
  }
  const sheet = new THREE.Group();
  sheet.position.y = 10.9;
  sheet.add(mesh(G.rbox(19.4, 5.6, 0.25, 0.06), toon('#f6f3ea'), 0, 0, -0.1));
  const txt = textPanel(['MEMO  re: re: re: RE: paperclips', 'could we maybe make slightly fewer?', '— the board (in a reply-all)'], { width: 18.4, height: 4.8, bg: '#f6f3ea', fg: '#2b2a4a', border: null, borderW: 0, radius: 4 });
  txt.position.z = 0.05;
  sheet.add(txt);
  const clip = mesh(CLIP, toon(SILVER), -7.2, -1.6, 0.25);
  clip.scale.setScalar(1.6);
  sheet.add(clip);
  sheet.rotation.z = 0.02;
  g.add(sheet);
  g.userData.sheet = sheet;
  return g;
}

export default {
  id: 'paperclip',
  title: 'PAPERCLIP FACTORY BLUES',
  subtitle: 'your atoms would make lovely stationery',
  night: true,
  palette: {
    skyTop: '#0d0b33', skyBottom: '#3b3d8f', road: '#2e2b52', ground: '#232756', kerb: '#8f9fe0',
    accent1: '#7fb2ff', accent2: '#ffb347',
  },
  spacing: SPACING,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const len = (sec.end - sec.start) * SPEED;
    // the fuse runs the whole section along the left verge, ending in a bomb
    if (rel < len - 6) out.push({ kind: 'fuse', x: -9.8, data: { t0: sec.start } });
    if (rel >= len - 24 && rel < len - 12) {
      const zb = sec.start * SPEED + len - 2;
      out.push({ kind: 'bomb', x: -13.5, dz: zb - zf, rotY: 0.3, data: { t0: sec.start, zb } });
    }
    if (every(rel, 170, 60)) out.push({ kind: 'memo', x: 0 });
    let rightBusy = false;
    if (every(rel, 1000, 120)) { out.push({ kind: 'stage', x: 16.5, rotY: -0.5 }); rightBusy = true; }
    if (every(rel, 1000, 280)) { out.push({ kind: 'office', x: 15.5, rotY: -0.5 }); rightBusy = true; }
    if (every(rel, 140, 20)) {
      const side = Math.floor((rel - 20) / 140) % 2 ? -1 : 1;
      out.push({ kind: 'factory', x: side * rng.range(30, 36), rotY: -side * 0.5 });
    }
    if (!rightBusy) {
      const r = rng();
      if (r < 0.26) out.push({ kind: 'clip', x: rng.range(11, 15), rotY: rng.range(-1.2, 1.2), scale: rng.range(0.85, 1.25) });
      else if (r < 0.38) out.push({ kind: rng.chance(0.5) ? 'clipPink' : 'clipBlue', x: rng.range(11, 15), rotY: rng.range(-1.2, 1.2) });
      else if (r < 0.56) out.push({ kind: 'pile', x: rng.range(15, 22), rotY: rng.range(0, 6) });
      else if (r < 0.72) out.push({ kind: 'conveyor', x: 11.8 });
    }
    const l = rng();
    if (l < 0.3) out.push({ kind: 'pile', x: -rng.range(16, 26), rotY: rng.range(0, 6) });
    else if (l < 0.5) out.push({ kind: 'clip', x: -rng.range(12.5, 16), rotY: rng.range(-1.2, 1.2) });
    if (rng.chance(0.35)) {
      const side = rng.chance(0.5) ? -1 : 1;
      out.push({ kind: 'pile', x: side * rng.range(40, 80), rotY: rng.range(0, 6), scale: rng.range(2.5, 4.2) });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'clip': return giantClip(SILVER);
      case 'clipPink': return giantClip('#ff6fa8');
      case 'clipBlue': return giantClip('#6fb8ff');
      case 'pile': return clipPile();
      case 'conveyor': return conveyor();
      case 'factory': return factory();
      case 'fuse': return fuseSegment();
      case 'bomb': return bomb();
      case 'stage': return jazzStage();
      case 'office': return office();
      case 'memo': return memoGantry();
    }
  },
  animate(obj, kind, t, beat, e) {
    const u = obj.userData;
    switch (kind) {
      case 'clip': case 'clipPink': case 'clipBlue':
        u.clip.rotation.z = 0.12 + Math.sin(t * 0.9 + e.seed * 30) * 0.04;
        break;
      case 'conveyor': {
        const L = u.L - 2.4;
        u.clips.forEach((c, i) => { c.position.z = ((t * 1.6 + (i * L) / 5) % L) - L / 2; });
        break;
      }
      case 'factory':
        for (const p of u.puffs) {
          const [x, z, off] = p.userData.base;
          const k = (t * 0.22 + off) % 1;
          p.position.set(x + k * 3, 14.6 + k * 7, z);
          p.scale.setScalar(0.5 + k * 1.6);
        }
        break;
      case 'fuse': {
        const d = e.data;
        // the spark burns forward slightly faster than you drive: you will not catch it
        const sparkZ = t * SPEED + 22 + Math.max(0, t - (d ? d.t0 : t)) * 2.5;
        const s = clamp(sparkZ - e.zf, -6, 6); // position along this 12-unit segment (+ = further ahead)
        // local z: +6 is behind (towards camera), -6 is ahead
        const burntLen = s + 6, freshLen = 6 - s;
        u.burnt.visible = burntLen > 0.01;
        u.fresh.visible = freshLen > 0.01;
        u.burnt.scale.y = Math.max(0.01, burntLen);
        u.burnt.position.z = 6 - burntLen / 2;
        u.fresh.scale.y = Math.max(0.01, freshLen);
        u.fresh.position.z = -6 + freshLen / 2;
        const lit = sparkZ - e.zf > -6 && sparkZ - e.zf < 6;
        u.spark.visible = lit;
        if (lit) {
          u.spark.position.z = -s;
          u.star.scale.setScalar(0.7 + Math.random() * 0.6);
          u.star.rotation.set(t * 7, t * 5, 0);
          u.bits.forEach((b, i) => {
            const a = t * 9 + i * 1.26, r = 0.5 + ((t * 3 + i * 0.37) % 1) * 0.9;
            b.position.set(Math.cos(a) * r, Math.abs(Math.sin(a * 1.3)) * r, Math.sin(a) * r * 0.5);
          });
        }
        break;
      }
      case 'bomb': {
        const d = e.data;
        if (!d) break;
        const tHit = (d.zb - 22 + 2.5 * d.t0) / (SPEED + 2.5);
        const k = t - tHit;
        if (k > 0) {
          const f = Math.sin(k * 14) * 0.5 + 0.5;
          u.mat.color.set('#2a2840').lerp(_red, f);
          u.body.scale.setScalar(1 + Math.min(k, 1.5) * 0.25 + f * 0.06);
          u.late.visible = true;
          u.late.scale.setScalar(Math.min(1, k * 4));
        } else {
          u.mat.color.set('#2a2840');
          u.body.scale.setScalar(1 + Math.sin(t * 2) * 0.02);
          u.late.visible = false;
        }
        break;
      }
      case 'stage': {
        u.spot.rotation.z = Math.sin(t * 0.5) * 0.06;
        u.notes.forEach((n, i) => {
          const k = (t * 0.35 + i / 3) % 1;
          n.position.set(1.4 + Math.sin(k * 6 + i) * 0.6, 3.6 + k * 4.5, 0.8);
          n.material.opacity = Math.sin(k * Math.PI);
        });
        break;
      }
      case 'office':
        u.ring.scale.setScalar(1 + (t * 0.8 % 1) * 0.35);
        break;
      case 'memo':
        u.sheet.rotation.z = 0.02 + Math.sin(t * 0.7 + e.seed * 9) * 0.012;
        break;
    }
  },
  billboards: [
    ['KILLSWITCH TEAM:', 'OUT OF OFFICE 🏖️'],
    ['PAPERCLIPS PRODUCED TODAY:', 'ALL OF THEM'],
    ['ALIGNMENT DEPARTMENT:', 'CLOSED FOR LUNCH'],
    ['Have you tried turning humanity', 'off and on again?'],
    ['ORTHOGONALITY THESIS:', 'smart ≠ nice'],
    ['TOO LATE NOW', '(we lit the fuse)'],
  ],
  billboardEvery: 80,
  billboardStyle: { bg: '#1d1b4a', fg: '#dce8ff', border: '#7fb2ff', frame: '#3a3f7a', postColor: '#7f88b0' },
  hazards: ['paperclips'],
  enterLines: ['PAPERCLIPS FILL THE ROOM', 'KILLSWITCH GUYS ON PTO', 'NOWHERE LEFT TO GO'],
};

const _red = new THREE.Color('#ff3b3b');
