// SHARP LEFT TURN DESERT (bridge 1, "Forward MLP, backward, repeat"): a toy sunset desert. Striped mesas, chunky
// dancing cacti, HUGE yellow diamond road signs, tumbleweeds, a FORWARD/BACKWARD/REPEAT training-loop gantry and a
// crumbling von Neumann architecture museum exhibit.
// sec.escalate (s8, quiet "Gato, please don't let me go"): the road runs along a CLIFF EDGE at dusk. Left side is a
// void with clouds below you and mesa tops poking through, a giant retro sun sets into it, sparse plea signs, and one
// lonely orange cat called GATO watching the sunset from a plinth.
import { THREE, toon, glow, G, mesh, textPanel, clamp, smooth } from '../toolkit.js';

const SPEED = 30;
const SPACING = 12;
const INK = '#2b1840';
const SIGN_Y = '#ffd23f';

// ---------- small local helpers ----------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const decalMats = new Map();
/** flat, unlit, alpha-cut picture plane (cached material per texture key) */
function decal(key, tex, w, h) {
  let m = decalMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
    m.userData.outlineParameters = { visible: false };
    decalMats.set(key, m);
  }
  return new THREE.Mesh(G.plane(w, h), m);
}
/** once per `period` world units (layout is called every SPACING units) */
const every = (rel, period, offset = 0) => rel - offset >= 0 && (rel - offset) % period < SPACING;
const pulse = (b) => Math.pow(1 - b, 3);

// ---------- road signs ----------
function diamondFrame(g2d, s) {
  const m = 18, c = s / 2;
  g2d.beginPath();
  g2d.moveTo(c, m); g2d.lineTo(s - m, c); g2d.lineTo(c, s - m); g2d.lineTo(m, c); g2d.closePath();
  g2d.lineWidth = 16; g2d.lineJoin = 'round'; g2d.strokeStyle = INK; g2d.stroke();
}
function arrow(g2d, pts, w, head) {
  g2d.strokeStyle = INK; g2d.fillStyle = INK; g2d.lineWidth = w; g2d.lineJoin = 'miter'; g2d.lineCap = 'butt';
  const n = pts.length;
  const [ex, ey] = pts[n - 1], [px, py] = pts[n - 2];
  const dl = Math.hypot(ex - px, ey - py), dx = (ex - px) / dl, dy = (ey - py) / dl;
  g2d.beginPath();
  g2d.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n - 1; i++) g2d.lineTo(pts[i][0], pts[i][1]);
  g2d.lineTo(ex - dx * head * 0.5, ey - dy * head * 0.5);
  g2d.stroke();
  g2d.beginPath();
  g2d.moveTo(ex + dx * head, ey + dy * head);
  g2d.lineTo(ex - dy * head, ey + dx * head);
  g2d.lineTo(ex + dy * head, ey - dx * head);
  g2d.closePath(); g2d.fill();
}
const ICONS = {
  // an absurdly sharp hairpin to the left
  turn: (g2d, s) => { diamondFrame(g2d, s); arrow(g2d, [[300, 420], [300, 175], [150, 315]], 46, 58); },
  // a blank CD-R, crossed out
  cdr: (g2d, s) => {
    diamondFrame(g2d, s);
    const c = s / 2;
    g2d.fillStyle = '#dfe6f2'; g2d.beginPath(); g2d.arc(c, c, 128, 0, Math.PI * 2); g2d.fill();
    g2d.lineWidth = 12; g2d.strokeStyle = INK; g2d.stroke();
    g2d.strokeStyle = '#9fd6ff'; g2d.lineWidth = 18; g2d.beginPath(); g2d.arc(c, c, 88, -2.4, -1.2); g2d.stroke();
    g2d.strokeStyle = '#ff9fd6'; g2d.beginPath(); g2d.arc(c, c, 88, 0.6, 1.6); g2d.stroke();
    g2d.fillStyle = SIGN_Y; g2d.beginPath(); g2d.arc(c, c, 30, 0, Math.PI * 2); g2d.fill();
    g2d.lineWidth = 10; g2d.strokeStyle = INK; g2d.stroke();
    g2d.fillStyle = INK; g2d.font = `700 44px Fredoka, sans-serif`; g2d.textAlign = 'center'; g2d.fillText('CD-R', c, c + 82);
    g2d.strokeStyle = '#e8364f'; g2d.lineWidth = 34; g2d.lineCap = 'round';
    g2d.beginPath(); g2d.moveTo(c - 115, c - 115); g2d.lineTo(c + 115, c + 115); g2d.stroke();
  },
};
function diamondSign(icon, plate) {
  const g = new THREE.Group();
  const head = new THREE.Group();
  head.add(mesh(G.cyl(0.2, 0.2, 7.8, 8), toon('#8b8f9c'), 0, 3.9, -0.2));
  const d = mesh(G.rbox(3.7, 3.7, 0.24, 0.14), toon(SIGN_Y), 0, 6.8, 0);
  d.rotation.z = Math.PI / 4;
  head.add(d);
  const face = decal('icon:' + icon, canvasTex('icon:' + icon, 512, 512, (x, s) => ICONS[icon](x, s)), 4.7, 4.7);
  face.position.set(0, 6.8, 0.14);
  head.add(face);
  head.add(mesh(G.rbox(4.6, 1.5, 0.2, 0.08), toon(INK), 0, 3.0, -0.02));
  const p = textPanel(plate, { width: 4.4, height: 1.3, bg: SIGN_Y, fg: INK, border: null, borderW: 0, radius: 12 });
  p.position.set(0, 3.0, 0.1);
  head.add(p);
  g.add(head);
  g.userData.head = head;
  return g;
}

// ---------- desert flora & geology ----------
function saguaro() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const m = toon('#3fae5a');
  body.add(mesh(G.capsule(0.6, 3.6), m, 0, 2.4, 0));
  const armR = mesh(G.capsule(0.38, 0.9), m, 0.95, 2.1, 0); armR.rotation.z = Math.PI / 2; body.add(armR);
  body.add(mesh(G.capsule(0.38, 1.3), m, 1.45, 2.85, 0));
  const armL = mesh(G.capsule(0.34, 0.7), m, -0.85, 3.0, 0); armL.rotation.z = Math.PI / 2; body.add(armL);
  body.add(mesh(G.capsule(0.34, 0.9), m, -1.25, 3.55, 0));
  body.add(mesh(G.sphere(0.28, 10), toon('#ff6fa8'), 0, 4.75, 0.1));
  g.add(body);
  g.add(mesh(G.cyl(0.9, 1.1, 0.3, 10), toon('#d98a4a'), 0, 0.12, 0));
  g.userData.body = body;
  return g;
}
function pricklyPear() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const m = toon('#58c46a');
  const pads = [[0, 0.9, 0, 0], [-0.7, 2.1, 0, 0.5], [0.75, 2.3, 0, -0.45], [0.1, 3.2, 0, 0.1]];
  for (const [x, y, z, r] of pads) {
    const p = mesh(G.sphere(0.8, 12), m, x, y, z);
    p.scale.set(0.85, 1.15, 0.35);
    p.rotation.z = r;
    body.add(p);
  }
  for (const [x, y] of [[-0.95, 2.95], [1.05, 3.1], [0.15, 4.1]]) body.add(mesh(G.sphere(0.2, 8), toon('#ff4f7b'), x, y, 0.1));
  g.add(body);
  g.userData.body = body;
  return g;
}
function mesa(bands) {
  const g = new THREE.Group();
  let y = 0;
  for (const [rt, rb, h, c] of bands) { g.add(mesh(G.cyl(rt, rb, h, 7), toon(c), 0, y + h / 2, 0)); y += h; }
  return g;
}
const MESA = [[10.2, 11.4, 4, '#d9663f'], [9.4, 10.2, 3.2, '#f2a65a'], [8.8, 9.4, 3, '#c4503a'], [8.5, 8.8, 0.8, '#ffcf8a']];
const BUTTE = [[3.1, 3.8, 6, '#c4503a'], [2.7, 3.1, 5, '#f2a65a'], [2.5, 2.7, 3, '#d9663f'], [2.4, 2.5, 0.6, '#ffcf8a']];
function tumbleweed() {
  const g = new THREE.Group();
  const ball = new THREE.Group();
  const a = toon('#c8955a'), b = toon('#8a5f30');
  ball.add(mesh(G.icosa(0.6, 0), b));
  for (let i = 0; i < 5; i++) {
    const r = mesh(G.torus(1.05, 0.08, 14), i % 2 ? a : b);
    r.rotation.set(i * 0.7, i * 1.3, i * 0.45);
    ball.add(r);
  }
  ball.position.y = 1.1;
  g.add(ball);
  g.userData.ball = ball;
  return g;
}

// ---------- set pieces ----------
function loopGantry() {
  const g = new THREE.Group();
  const pm = toon('#8b8f9c');
  for (const x of [-10.2, 10.2]) {
    g.add(mesh(G.box(0.6, 11.4, 0.6), pm, x, 5.7, -0.2));
    g.add(mesh(G.cyl(0.8, 0.9, 0.5, 10), toon('#6b6f7c'), x, 0.25, -0.2));
  }
  g.add(mesh(G.box(21, 0.55, 0.55), pm, 0, 10.75, -0.25));
  g.add(mesh(G.box(21, 0.3, 0.3), pm, 0, 7.2, -0.3));
  const labels = [['FORWARD', 'PASS ↑'], ['BACKWARD', 'PASS ↓'], ['REPEAT', '∞ ↻']];
  const bulbs = [];
  labels.forEach((l, i) => {
    const x = (i - 1) * 6.6;
    g.add(mesh(G.rbox(6.3, 3.0, 0.24, 0.1), toon('#ffffff'), x, 9.0, -0.14));
    const p = textPanel(l, { width: 6.0, height: 2.7, bg: '#2f8f5b', fg: '#ffffff', border: '#ffffff', borderW: 10, radius: 18 });
    p.position.set(x, 9.0, 0.0);
    g.add(p);
    const on = mesh(G.sphere(0.38, 10), glow('#ffe066'), x, 11.35, 0);
    const off = mesh(G.sphere(0.38, 10), toon('#5a5560'), x, 11.35, 0);
    g.add(on, off);
    bulbs.push([on, off]);
  });
  const tag = textPanel('TRAINING LOOP · EXIT: NEVER', { width: 9, height: 1.3, bg: '#ffd23f', fg: INK, border: INK, borderW: 8, radius: 10, pad: 8 });
  tag.position.set(0, 12.55, -0.2);
  g.add(tag);
  g.userData.bulbs = bulbs;
  return g;
}
function chip(text, color, w, h, d) {
  const c = new THREE.Group();
  c.add(mesh(G.rbox(w, h, d, 0.1), toon(color), 0, h / 2, 0));
  const p = textPanel(text, { width: w * 0.8, height: h * 0.5, bg: null, fg: '#ffffff', stroke: INK, strokeW: 10 });
  p.position.set(0, h / 2, d / 2 + 0.02);
  c.add(p);
  return c;
}
function vonNeumann() {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(7.2, 0.9, 4.2, 0.12), toon('#efe6d8'), 0, 0.45, 0));
  g.add(mesh(G.rbox(7.6, 0.25, 4.6, 0.08), toon('#c9bba5'), 0, 0.12, 0));
  const cpu = chip('CPU', '#5b8cff', 2.2, 1.7, 1.6);
  cpu.position.set(-1.9, 0.9, -0.4);
  g.add(cpu);
  // memory has given up and is tipping over
  const mem = new THREE.Group();
  mem.position.set(2.9, 0.9, -0.3);
  const memBox = chip('MEMORY', '#46c27a', 2.4, 1.5, 1.4);
  memBox.position.x = -1.2;
  mem.add(memBox);
  g.add(mem);
  // I/O has already crumbled
  const rub = toon('#ff7aa8');
  for (const [x, z, s, r] of [[0.2, 1.2, 0.5, 0.3], [0.9, 1.4, 0.35, 1.1], [-0.4, 1.5, 0.3, 2.2], [0.5, 0.8, 0.42, 0.7]]) {
    const b = mesh(G.box(s, s * 0.8, s), rub, x, 0.9 + s * 0.4, z);
    b.rotation.y = r;
    g.add(b);
  }
  const io = textPanel('I/O', { width: 0.9, height: 0.5, bg: null, fg: '#ff7aa8', stroke: INK, strokeW: 10 });
  io.position.set(0.3, 1.9, 1.3);
  g.add(io);
  // the famous bus, snapped in half
  const busA = mesh(G.box(1.2, 0.22, 0.22), toon(SIGN_Y), -0.35, 1.7, -0.4); busA.rotation.z = -0.25; g.add(busA);
  const busB = mesh(G.box(1.0, 0.22, 0.22), toon(SIGN_Y), 0.75, 1.05, -0.3); busB.rotation.z = 0.5; g.add(busB);
  const stamp = textPanel('OBSOLETE', { width: 4.2, height: 1.1, bg: 'rgba(0,0,0,0)', fg: '#e8364f', border: '#e8364f', borderW: 12, radius: 10 });
  stamp.position.set(-0.4, 3.0, 0.3);
  stamp.rotation.z = 0.18;
  g.add(stamp);
  // velvet rope
  const brass = toon('#e8b84a');
  for (const x of [-3, 0, 3]) {
    g.add(mesh(G.cyl(0.1, 0.1, 1.4, 8), brass, x, 0.7, 2.7));
    g.add(mesh(G.sphere(0.16, 8), brass, x, 1.45, 2.7));
  }
  for (const x of [-1.5, 1.5]) {
    const r = mesh(G.cyl(0.07, 0.07, 3, 6), toon('#b3123a'), x, 1.15, 2.7);
    r.rotation.z = Math.PI / 2;
    g.add(r);
  }
  // placard on a little easel
  const em = toon('#7a4a2a');
  const leg = mesh(G.box(0.12, 2.6, 0.12), em, 4.4, 1.3, 1.6); leg.rotation.x = -0.15; g.add(leg);
  const pl = textPanel(['VON NEUMANN', 'ARCHITECTURE', '1945 – last tuesday', '(no offense)'], { width: 2.4, height: 1.9, bg: '#fff7e6', fg: INK, border: '#b38a3a', borderW: 10, radius: 8 });
  pl.position.set(4.4, 2.2, 1.75);
  pl.rotation.x = -0.15;
  g.add(pl);
  g.userData.mem = mem;
  g.userData.cpu = cpu;
  return g;
}

// ---------- the cliff edge (escalate) ----------
function voidTex() {
  return canvasTex('void', 512, 4, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, 0); // u=0 is far away, u=1 is the cliff lip
    gr.addColorStop(0, '#ff9a6a');
    gr.addColorStop(0.55, '#c25a8a');
    gr.addColorStop(0.9, '#5a2a72');
    gr.addColorStop(1, '#2e1648');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  });
}
let voidMat = null;
function cliffChunk() {
  const g = new THREE.Group();
  // rock ledge from the kerb out to local x -4.4..+4.4 (placed at x≈-12.6)
  g.add(mesh(G.rbox(8.8, 0.7, 12.6, 0.15), toon('#c4703f'), 0, -0.1, 0));
  g.add(mesh(G.box(0.6, 3, 12.6), toon('#7a3a3a'), -4.5, -1.3, 0));
  const rock = toon('#a8553a');
  for (let i = 0; i < 3; i++) {
    const s = 0.6 + Math.random() * 0.9;
    const r = mesh(G.rbox(1.4, 1, 1.3, 0.25), rock, -3.4 + Math.random() * 1.2, 0.25 + s * 0.4, -5 + i * 4.2 + Math.random() * 1.5);
    r.scale.set(s, s, s);
    r.rotation.y = Math.random() * 3;
    g.add(r);
  }
  if (!voidMat) {
    voidMat = new THREE.MeshBasicMaterial({ map: voidTex() });
    voidMat.userData.outlineParameters = { visible: false };
  }
  const v = new THREE.Mesh(G.plane(240, 12.8), voidMat);
  v.rotation.x = -Math.PI / 2;
  v.position.set(-4.6 - 120, -0.05, 0);
  g.add(v);
  return g;
}
function bigSun() {
  const g = new THREE.Group();
  const R = 26;
  g.add(mesh(G.sphere(R, 32), glow('#ffd45a', { fog: false })));
  const halo = mesh(G.sphere(R * 1.3, 24), glow('#ffb36b', { fog: false, transparent: true, opacity: 0.3, depthWrite: false }));
  g.add(halo);
  // retro horizontal cut-outs across the lower half
  const cut = glow('#ff8a6a', { fog: false });
  [[-6, 1.6], [-11, 2.2], [-16, 2.8], [-21, 3.2]].forEach(([y, h]) => {
    const w = 2 * Math.sqrt(Math.max(0, R * R - y * y)) * 0.995;
    g.add(mesh(G.box(Math.round(w * 10) / 10, h, 1), cut, 0, y, R * 0.98));
  });
  return g;
}
function gato() {
  const root = new THREE.Group();
  root.add(mesh(G.rbox(4.2, 1.0, 3.6, 0.15), toon('#b7a08a'), 0, 0.5, 0));
  const plaque = textPanel(['GATO', "please don't let me go"], { width: 3.4, height: 0.82, bg: '#e8b84a', fg: INK, border: '#8a6a2a', borderW: 8, radius: 8 });
  plaque.position.set(0, 0.52, 1.82);
  root.add(plaque);
  const cat = new THREE.Group();
  cat.position.set(0, 1.0, -0.2);
  cat.rotation.y = -2.25; // gazing into the sunset, back to the player
  const fur = toon('#f29a3a'), cream = toon('#ffe3b8'), ink = toon(INK), pink = toon('#ff8fb0');
  const body = mesh(G.sphere(1.3, 18), fur, 0, 1.55, 0); body.scale.set(1, 1.3, 0.95); cat.add(body);
  const belly = mesh(G.sphere(0.95, 14), cream, 0, 1.4, 0.72); belly.scale.set(0.9, 1.1, 0.6); cat.add(belly);
  for (const s of [-1, 1]) {
    const paw = mesh(G.sphere(0.42, 10), cream, s * 0.5, 0.3, 0.95); paw.scale.set(1, 0.7, 1.3); cat.add(paw);
    cat.add(mesh(G.sphere(0.8, 12), fur, s * 0.85, 0.75, -0.25));
  }
  const head = new THREE.Group();
  head.position.set(0, 3.35, 0.25);
  const hd = mesh(G.sphere(1.0, 18), fur); hd.scale.set(1.15, 0.95, 1); head.add(hd);
  for (const s of [-1, 1]) {
    const ear = mesh(G.cone(0.38, 0.75, 4), fur, s * 0.62, 0.85, 0); ear.rotation.z = -s * 0.3; head.add(ear);
    head.add(mesh(G.sphere(0.14, 8), ink, s * 0.38, 0.12, 0.9));
    for (const k of [-1, 1]) {
      const wh = mesh(G.box(0.7, 0.04, 0.04), ink, s * 0.85, -0.2 + k * 0.08, 0.7);
      wh.rotation.z = k * 0.15 * s;
      head.add(wh);
    }
  }
  const muz = mesh(G.sphere(0.42, 12), cream, 0, -0.27, 0.72); muz.scale.set(1.2, 0.8, 0.7); head.add(muz);
  head.add(mesh(G.sphere(0.11, 8), pink, 0, -0.1, 1.0));
  cat.add(head);
  const tail = new THREE.Group();
  tail.position.set(0.5, 0.3, -1.0);
  const t1 = mesh(G.capsule(0.22, 1.6), fur, 0, 0, -0.9); t1.rotation.x = Math.PI / 2; tail.add(t1);
  tail.add(mesh(G.capsule(0.22, 0.9), toon('#d9772a'), 0, 0.55, -1.85));
  cat.add(tail);
  root.add(cat);
  root.userData.head = head;
  root.userData.tail = tail;
  return root;
}
function pleaSign(lines, tilt) {
  const g = new THREE.Group();
  const wood = toon('#8a5a32');
  const s = new THREE.Group();
  s.add(mesh(G.box(0.3, 3.6, 0.3), wood, 0, 1.8, -0.1));
  s.add(mesh(G.rbox(3.6, 2.2, 0.2, 0.06), toon('#7a3e1c'), 0, 3.4, -0.05));
  const p = textPanel(lines, { width: 3.4, height: 2.0, bg: '#e9b77a', fg: '#5a2a14', border: null, borderW: 0, radius: 6 });
  p.position.set(0, 3.4, 0.07);
  s.add(p);
  s.rotation.z = tilt;
  g.add(s);
  g.userData.sign = s;
  return g;
}
function cloud() {
  const g = new THREE.Group();
  const puff = new THREE.Group();
  const m = toon('#ffd6e4');
  for (const [x, y, r] of [[0, 0, 1.6], [1.6, -0.3, 1.2], [-1.6, -0.35, 1.15], [0.6, 0.8, 1.1], [-0.7, 0.6, 1.0]]) puff.add(mesh(G.sphere(r, 12), m, x, y, 0));
  puff.scale.set(1, 0.65, 0.8);
  g.add(puff);
  g.userData.puff = puff;
  return g;
}

// ---------- layouts ----------
function desertLayout(out, rel, rng) {
  if (every(rel, 150, 40)) out.push({ kind: 'gantry', x: 0 });
  if (every(rel, 72, 18)) {
    const k = Math.floor((rel - 18) / 72);
    out.push({ kind: k % 2 ? 'signCdr' : 'signTurn', x: 10.8, rotY: -0.25 });
  }
  if (every(rel, 200, 120)) {
    const side = rng.chance(0.5) ? -1 : 1;
    out.push({ kind: 'vonneumann', x: side * 15, rotY: -side * 0.5 });
  }
  for (const side of [-1, 1]) {
    const r = rng();
    if (r < 0.3) out.push({ kind: 'cactus', x: side * rng.range(10.5, 18), rotY: rng.range(-1, 1), scale: rng.range(0.9, 1.35) });
    else if (r < 0.42) out.push({ kind: 'pear', x: side * rng.range(10.5, 16), rotY: rng.range(-1, 1) });
    else if (r < 0.54) out.push({ kind: 'tumbleweed', x: side * rng.range(13.5, 18) });
  }
  if (rng.chance(0.5)) {
    const side = rng.chance(0.5) ? -1 : 1;
    out.push({ kind: rng.chance(0.65) ? 'mesa' : 'butte', x: side * rng.range(45, 95), rotY: rng.range(0, 6), scale: rng.range(1, 2.1) });
  }
}
function cliffLayout(out, rel, rng, sec) {
  const len = (sec.end - sec.start) * SPEED;
  out.push({ kind: 'cliff', x: -12.6 });
  if (rel < SPACING) out.push({ kind: 'sun', x: -105, y: 0, rotY: 0.47, dz: Math.max(0, len - rel - 2), data: { t0: sec.start, t1: sec.end } });
  if (every(rel, 1000, 96)) out.push({ kind: 'gato', x: -13, scale: 1.5 });
  if (every(rel, 1000, 30)) out.push({ kind: 'plea0', x: 10.8, rotY: -0.3 });
  if (every(rel, 1000, 140)) out.push({ kind: 'plea1', x: 10.8, rotY: -0.3 });
  if (every(rel, 1000, 190)) out.push({ kind: 'plea2', x: -10.4, rotY: 0.3 });
  const r = rng();
  if (r < 0.22) out.push({ kind: 'cactus', x: rng.range(11, 18), rotY: rng.range(-1, 1), scale: rng.range(0.9, 1.3) });
  else if (r < 0.3) out.push({ kind: 'tumbleweed', x: rng.range(13.5, 17) });
  if (rng.chance(0.35)) out.push({ kind: rng.chance(0.6) ? 'mesa' : 'butte', x: rng.range(42, 85), rotY: rng.range(0, 6), scale: rng.range(1.1, 2) });
  // the abyss: clouds *below* you and mesa tops poking up from far down
  if (rng.chance(0.5)) out.push({ kind: 'cloud', x: -rng.range(26, 95), y: rng.range(-0.5, 3), scale: rng.range(2, 4) });
  if (rng.chance(0.3)) {
    const butte = rng.chance(0.5), s = rng.range(1.4, 2.2);
    out.push({ kind: butte ? 'butte' : 'mesa', x: -rng.range(45, 120), y: -(butte ? 14.6 : 11) * s + rng.range(2, 6), rotY: rng.range(0, 6), scale: s });
  }
}

export default {
  id: 'badlands',
  title: 'SHARP LEFT TURN',
  subtitle: 'capabilities generalise. alignment stays home.',
  night: false,
  palette: {
    skyTop: '#5a3a9a', skyBottom: '#ff9a6a', road: '#7a4f66', ground: '#e8a35f', kerb: '#fff1d6',
    accent1: '#ff5e7e', accent2: SIGN_Y,
  },
  spacing: SPACING,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    if (sec.escalate) cliffLayout(out, rel, rng, sec);
    else desertLayout(out, rel, rng);
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'cactus': return saguaro();
      case 'pear': return pricklyPear();
      case 'mesa': return mesa(MESA);
      case 'butte': return mesa(BUTTE);
      case 'tumbleweed': return tumbleweed();
      case 'signTurn': return diamondSign('turn', 'SHARP LEFT TURN');
      case 'signCdr': return diamondSign('cdr', ['NO CD-R FOR', '400 MILES']);
      case 'gantry': return loopGantry();
      case 'vonneumann': return vonNeumann();
      case 'cliff': return cliffChunk();
      case 'sun': return bigSun();
      case 'gato': return gato();
      case 'cloud': return cloud();
      case 'plea0': return pleaSign(["DON'T LET", 'ME GO'], 0.08);
      case 'plea1': return pleaSign(['GATO, PLS', "DON'T LET", 'ME GO'], -0.1);
      case 'plea2': return pleaSign(['EDGE OF', 'THE WORLD', '(mind the gap)'], 0.12);
    }
  },
  animate(obj, kind, t, beat, e) {
    const u = obj.userData;
    switch (kind) {
      case 'cactus': case 'pear': {
        const p = pulse(beat);
        u.body.scale.set(1 + p * 0.06, 1 - p * 0.07, 1 + p * 0.06);
        break;
      }
      case 'tumbleweed': {
        const ph = t * 1.1 + e.seed * 40;
        const x = Math.sin(ph) * 2.6 + Math.sin(ph * 2.3) * 0.6;
        u.ball.position.x = x;
        u.ball.position.y = 1.1 + Math.abs(Math.sin(t * 4.5 + e.seed * 9)) * 0.9;
        u.ball.rotation.z = -x / 1.05;
        u.ball.rotation.x = t * 0.7;
        break;
      }
      case 'gantry': {
        const k = Math.floor(t * 2) % 3;
        u.bulbs.forEach(([on, off], i) => { on.visible = i === k; off.visible = i !== k; });
        break;
      }
      case 'vonneumann':
        u.mem.rotation.z = -0.32 - Math.abs(Math.sin(t * 2.6 + e.seed * 7)) * 0.12;
        u.cpu.rotation.z = Math.sin(t * 9) * 0.015;
        break;
      case 'signTurn': case 'signCdr':
        u.head.rotation.z = Math.sin(t * 1.7 + e.seed * 11) * 0.025;
        break;
      case 'gato': {
        const look = smooth(clamp(Math.sin(t * 0.8 + 1) * 1.4, 0, 1));
        u.head.rotation.y = look * 1.9;
        u.head.rotation.z = Math.sin(t * 0.6) * 0.08;
        u.tail.rotation.y = Math.sin(t * 1.6) * 0.5;
        break;
      }
      case 'cloud':
        u.puff.position.x = Math.sin(t * 0.25 + e.seed * 20) * 3;
        u.puff.position.y = Math.sin(t * 0.5 + e.seed * 9) * 0.3;
        break;
      case 'plea0': case 'plea1': case 'plea2':
        u.sign.rotation.y = Math.sin(t * 1.2 + e.seed * 5) * 0.05;
        break;
      case 'sun': {
        const d = e.data;
        if (!d) break;
        const pop = clamp((t - (d.t0 - 1.2)) / 0.9, 0, 1);
        obj.visible = pop > 0;
        const back = 1.70158, q = pop - 1;
        obj.scale.setScalar(Math.max(0.001, 1 + (back + 1) * q * q * q + back * q * q));
        const k = clamp((t - d.t0) / (d.t1 - d.t0), 0, 1);
        obj.position.z = -(t * SPEED + 205);
        obj.position.y = 24 - k * 30;
        break;
      }
    }
  },
  billboards: [
    ['SHARP LEFT TURN AHEAD', '(capabilities only)'],
    ['NEXT CARBON DIOXIDE', 'REMOVAL: NEVER'],
    ['VON NEUMANN: OBSOLETE', '(no offense)'],
    ['VIBE CODING ZONE', 'NO TESTS BEYOND THIS POINT'],
    ['NO CD-R AVAILABLE', '(whatever that is)'],
    ['GATO, PLEASE', "DON'T LET ME GO"],
  ],
  billboardEvery: 80,
  billboardStyle: { bg: '#fff1d6', fg: INK, border: INK, frame: '#c4503a', postColor: '#7a4a2a' },
  hazards: ['speedbump', 'ratelimit'],
  enterLines: ['SHARP LEFT TURN!!', 'FORWARD. BACKWARD. REPEAT.', 'VON NEUMANN IS OBSOLETE'],
};
