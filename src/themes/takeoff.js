// TAKEOFF (final outro): the road ramps exponentially into a red-tinted space sky. Alarm beacons, launch towers,
// toy rockets that lift off as you pass, NUMBER GO UP charts, bouncing FOOM letters, and a giant live P(DOOM) board.
import { THREE, toon, glow, G, mesh, group, textPanel, FONT, roundRect } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { alarmBeacon, animateBeacon } from './datacenter.js';

const RED = '#ff2a4a', YEL = '#ffd23f', INK = '#2b1840';

// ---------- the live P(DOOM) scoreboard (overhead, spans the road) ----------
const SB_W = 1024, SB_H = 300;
function drawScore(ud, v) {
  const x = ud.ctx;
  x.fillStyle = '#12040c'; x.fillRect(0, 0, SB_W, SB_H);
  x.lineWidth = 12; x.strokeStyle = RED;
  roundRect(x, 8, 8, SB_W - 16, SB_H - 16, 26); x.stroke();
  const known = typeof v === 'number' && isFinite(v);
  const p = known ? Math.max(0, Math.min(1, v)) : 0.5;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = YEL;
  x.font = `700 92px ${FONT}`;
  x.fillText('P(DOOM)', 44, 104);
  x.font = `600 30px ${FONT}`;
  x.fillStyle = '#ff9aa8';
  x.fillText(p > 0.8 ? 'WE ARE SO COOKED' : p > 0.5 ? 'UPPING IT, AS FORETOLD' : 'LIVE (do not look directly)', 48, 178);
  x.textAlign = 'right';
  x.fillStyle = p > 0.66 ? '#ff3b3b' : p > 0.33 ? '#ffb020' : '#5dffb0';
  x.font = `700 170px ${FONT}`;
  x.fillText(known ? Math.round(p * 100) + '%' : '??%', SB_W - 40, 120);
  // segmented bar
  const n = 20, bw = (SB_W - 96) / n;
  for (let i = 0; i < n; i++) {
    const on = i < Math.round(p * n);
    x.fillStyle = on ? (i > 15 ? '#ff3b3b' : i > 9 ? '#ffb020' : '#5dffb0') : '#2a1422';
    x.fillRect(48 + i * bw, 222, bw - 8, 46);
  }
  ud.tex.needsUpdate = true;
}
function scoreboard() {
  const g = new THREE.Group();
  const pm = toon('#2a1830');
  g.add(mesh(G.rbox(1.3, 16.5, 1.3, 0.25), pm, -11.5, 8.25, 0));
  g.add(mesh(G.rbox(1.3, 16.5, 1.3, 0.25), pm, 11.5, 8.25, 0));
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) g.add(mesh(G.box(1.36, 0.6, 1.36), toon(YEL), s * 11.5, 1.5 + k * 3, 0));
  g.add(mesh(G.rbox(22, 7.4, 1.0, 0.3), toon('#1a0f22'), 0, 13.6, -0.1));
  const c = document.createElement('canvas');
  c.width = SB_W; c.height = SB_H;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  g.add(mesh(G.plane(20.8, 20.8 * SB_H / SB_W), m, 0, 13.6, 0.45));
  const lights = [];
  for (let k = 0; k < 9; k++) {
    const l = mesh(G.sphere(0.32, 8), glow(k % 2 ? YEL : RED), -10 + k * 2.5, 17.6, 0.2);
    lights.push(l);
    g.add(l);
  }
  for (const s of [-1, 1]) {
    const b = alarmBeacon(RED, 0.6);
    b.position.set(s * 11.5, 16.5, 0);
    g.add(b);
    lights.push(b);
  }
  const ud = g.userData;
  ud.ctx = c.getContext('2d');
  ud.tex = tex;
  ud.lights = lights;
  ud.lastT = -1;
  ud.lastV = undefined;
  ud.beacons = lights.slice(-2);
  drawScore(ud, globalThis.GAME?.pDoom);
  ud.lastV = globalThis.GAME?.pDoom;
  return g;
}
function animateScoreboard(obj, t, seed) {
  const ud = obj.userData;
  if (t - ud.lastT > 0.2 || t < ud.lastT) {
    ud.lastT = t;
    const v = globalThis.GAME?.pDoom;
    const q = typeof v === 'number' ? Math.round(v * 100) : -1;
    const lq = typeof ud.lastV === 'number' ? Math.round(ud.lastV * 100) : -1;
    if (q !== lq) { ud.lastV = v; drawScore(ud, v); }
  }
  for (let k = 0; k < 9; k++) ud.lights[k].visible = ((t * 8 + k) | 0) % 2 === 0;
  for (const b of ud.beacons) animateBeacon(b, t, seed + b.position.x);
}

// ---------- launch tower (lattice, 2 merged draw calls) ----------
const geoCache = new Map();
function merged(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    const parts = make();
    g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    geoCache.set(key, g);
  }
  return g;
}
const bx = (w, h, d, x, y, z, rz = 0) => { const b = new THREE.BoxGeometry(w, h, d); if (rz) b.rotateZ(rz); b.translate(x, y, z); return b; };
function launchTower() {
  const g = new THREE.Group();
  const H = 16, R = 1.3;
  const frame = merged('towerFrame', () => {
    const p = [];
    for (const sx of [-R, R]) for (const sz of [-R, R]) p.push(bx(0.38, H, 0.38, sx, H / 2, sz));
    for (let y = 1.5; y < H; y += 2.6) {
      p.push(bx(2 * R + 0.3, 0.26, 0.26, 0, y, R), bx(2 * R + 0.3, 0.26, 0.26, 0, y, -R));
      p.push(bx(0.26, 0.26, 2 * R + 0.3, R, y, 0), bx(0.26, 0.26, 2 * R + 0.3, -R, y, 0));
    }
    return p;
  });
  const diag = merged('towerDiag', () => {
    const p = [];
    const len = Math.hypot(2 * R, 2.6);
    const ang = Math.atan2(2.6, 2 * R);
    let k = 0;
    for (let y = 1.5; y + 2.6 < H; y += 2.6, k++) {
      const a = k % 2 ? ang : -ang;
      p.push(bx(len, 0.18, 0.18, 0, y + 1.3, R + 0.05, a));
      p.push(bx(len, 0.18, 0.18, 0, y + 1.3, -R - 0.05, -a));
    }
    return p;
  });
  g.add(mesh(frame, toon('#d8323c')));
  g.add(mesh(diag, toon('#f2efe6')));
  g.add(mesh(G.box(3.6, 0.35, 3.6), toon('#4a4a5a'), 0, H + 0.15, 0));
  g.add(mesh(G.rbox(5.4, 0.8, 5.4, 0.2), toon('#4a4a5a'), 0, 0.4, 0));
  g.add(mesh(G.cyl(0.08, 0.08, 3, 6), toon('#888'), 0.8, H + 1.8, 0.8));
  const arm = mesh(G.box(6.5, 0.6, 0.9), toon('#f2efe6'), -4.2, 12.5, 0);
  g.add(arm);
  g.add(mesh(G.box(0.9, 1.4, 0.9), toon('#d8323c'), -7.2, 11.6, 0));
  const top = mesh(G.sphere(0.45, 10), glow(RED), 0, H + 0.75, 0);
  g.add(top);
  const sign = textPanel(['T-MINUS:', 'ALREADY'], { width: 2.6, height: 1.5, bg: YEL, fg: INK, border: INK, borderW: 10, radius: 12 });
  sign.position.set(0, 6, R + 0.25);
  g.add(sign);
  g.userData.topLight = top;
  return g;
}

// ---------- toy rocket that lifts off as you pass ----------
function rocket(color) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(2.0, 2.4, 0.8, 16), toon('#4a4a5a'), 0, 0.4, 0));
  g.add(mesh(G.box(0.4, 0.4, 3.6), toon(YEL), 0, 0.85, 0)); // hazard-stripe-ish cross
  const body = new THREE.Group();
  body.position.y = 1.0;
  body.add(mesh(G.cyl(0.9, 0.9, 4.4, 16), toon('#f2efe6'), 0, 2.6, 0));
  body.add(mesh(G.cyl(0.93, 0.93, 0.5, 16), toon(color), 0, 3.9, 0));
  body.add(mesh(G.cone(0.9, 1.9, 16), toon(color), 0, 5.75, 0));
  body.add(mesh(G.cyl(0.6, 0.85, 0.5, 14), toon('#555566'), 0, 0.2, 0));
  const win = mesh(G.cyl(0.38, 0.38, 0.12, 16), glow('#7af7ff'), 0, 3.0, 0.88);
  win.rotation.x = Math.PI / 2;
  body.add(win);
  body.add(mesh(G.torus(0.4, 0.09, 16), toon('#c8c8d0'), 0, 3.0, 0.9));
  for (let k = 0; k < 3; k++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (k / 3) * Math.PI * 2 + Math.PI / 6;
    pivot.add(mesh(G.rbox(0.18, 1.5, 1.1, 0.06), toon(color), 0, 1.0, 1.1));
    body.add(pivot);
  }
  const lbl = textPanel('AGI-1', { width: 1.4, height: 0.55, bg: null, fg: INK });
  lbl.position.set(0, 1.8, 0.92);
  body.add(lbl);
  const flame = new THREE.Group();
  flame.position.y = -0.05;
  const f1 = mesh(G.cone(0.75, 2.4, 10), glow('#ff4a1a'), 0, -1.2, 0);
  f1.rotation.x = Math.PI;
  const f2 = mesh(G.cone(0.45, 1.5, 10), glow('#ffd23f'), 0, -0.75, 0.15);
  f2.rotation.x = Math.PI;
  flame.add(f1, f2);
  body.add(flame);
  g.add(body);
  g.userData.rocket = body;
  g.userData.flame = flame;
  return g;
}
function animateRocket(obj, t, entry) {
  const ud = obj.userData;
  const d = (entry?.zf ?? 0) - t * 30; // distance ahead of the kart (forward speed is 30/s)
  const k = Math.max(0, (80 - d) / 30);
  const lift = k * k * 3.2;
  ud.rocket.position.y = 1.0 + lift + Math.sin(t * 20) * 0.04 * (lift > 0 ? 1 : 0);
  ud.rocket.rotation.z = lift > 0 ? Math.sin(t * 3 + (entry?.seed || 0) * 9) * 0.06 : 0;
  const s = (lift > 0 ? 1.6 : 0.55) * (1 + 0.25 * Math.sin(t * 31 + (entry?.seed || 0) * 40));
  ud.flame.scale.set(1, s, 1);
}

// ---------- NUMBER GO UP chart ----------
let chartTex = null;
function chartTexture() {
  if (chartTex) return chartTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = '#fff7e6'; x.fillRect(0, 0, 512, 384);
  x.strokeStyle = INK; x.lineWidth = 6;
  x.beginPath(); x.moveTo(60, 50); x.lineTo(60, 330); x.lineTo(490, 330); x.stroke();
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillStyle = INK; x.font = `700 34px ${FONT}`;
  x.fillText('NUMBER GO UP', 80, 32);
  x.font = `600 22px ${FONT}`;
  x.fillText('time →', 400, 356);
  x.save(); x.translate(32, 300); x.rotate(-Math.PI / 2); x.fillText('capabilities →', 0, 0); x.restore();
  // alignment: flat
  x.strokeStyle = '#3f8cff'; x.lineWidth = 8; x.lineCap = 'round';
  x.beginPath(); x.moveTo(70, 310); x.lineTo(480, 300); x.stroke();
  x.fillStyle = '#3f8cff'; x.fillText('alignment', 360, 280);
  // capabilities: foom
  x.strokeStyle = '#e8263f'; x.lineWidth = 11; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(70, 318);
  for (let i = 1; i <= 60; i++) {
    const u = i / 60, px = 70 + u * 330, py = 318 - (Math.exp(u * 5.6) - 1) * 1.0;
    if (py < 60) { x.lineTo(px, 60); break; }
    x.lineTo(px, py);
  }
  x.stroke();
  x.fillStyle = '#e8263f'; x.font = `700 26px ${FONT}`;
  x.fillText('← YOU ARE HERE', 400, 74);
  chartTex = new THREE.CanvasTexture(c);
  chartTex.colorSpace = THREE.SRGBColorSpace;
  chartTex.anisotropy = 4;
  return chartTex;
}
function chartPanel() {
  const g = new THREE.Group();
  const pm = toon('#3a1a2a');
  g.add(mesh(G.box(0.35, 4.5, 0.35), pm, -2.6, 2.25, -0.2));
  g.add(mesh(G.box(0.35, 4.5, 0.35), pm, 2.6, 2.25, -0.2));
  g.add(mesh(G.rbox(7.2, 5.6, 0.4, 0.18), toon(RED), 0, 6.5, -0.1));
  const m = new THREE.MeshBasicMaterial({ map: chartTexture(), toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  g.add(mesh(G.plane(6.6, 4.95), m, 0, 6.5, 0.12));
  // pulsing "you are here" marker at the top of the curve (canvas px → panel units)
  const dot = mesh(G.sphere(0.24, 10), glow('#ff2a4a'), (395 / 512 - 0.5) * 6.6, 6.5 + (0.5 - 74 / 384) * 4.95, 0.2);
  g.add(dot);
  g.userData.dot = dot;
  return g;
}

// ---------- FOOM letters ----------
function foomLetters() {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(12, 0.7, 2.4, 0.2), toon('#2a1830'), 0, 0.35, 0));
  const cols = [RED, YEL, '#ff7a1f', '#c86bff'];
  const letters = [];
  'FOOM'.split('').forEach((L, k) => {
    const b = new THREE.Group();
    b.position.set(-4.35 + k * 2.9, 0.7, 0);
    b.add(mesh(G.rbox(2.6, 3.0, 1.3, 0.3), toon(cols[k]), 0, 1.5, 0));
    const p = textPanel(L, { width: 2.3, height: 2.7, bg: null, fg: '#ffffff', stroke: INK, strokeW: 22 });
    p.position.set(0, 1.5, 0.67);
    b.add(p);
    letters.push(b);
    g.add(b);
  });
  const bang = textPanel('!!!', { width: 2.2, height: 2.6, bg: null, fg: YEL, stroke: INK, strokeW: 18 });
  bang.position.set(7.2, 2.3, 0.2);
  bang.rotation.z = -0.2;
  g.add(bang);
  g.userData.letters = letters;
  return g;
}
function animateFoom(obj, beatPhase) {
  obj.userData.letters.forEach((b, k) => {
    const ph = (beatPhase + 1 - k * 0.12) % 1;
    const hop = (1 - ph) * (1 - ph);
    b.position.y = 0.7 + hop * 1.3;
    const sq = ph < 0.08 ? 1 - (0.08 - ph) * 3 : 1;
    b.scale.set(2 - sq, sq, 1);
  });
}

export default {
  id: 'takeoff',
  title: 'TAKEOFF',
  subtitle: 'please keep your atoms inside the vehicle',
  night: true,
  palette: {
    skyTop: '#080210', skyBottom: '#4a0f22', road: '#3b2440', ground: '#1a0a18', kerb: RED,
    accent1: RED, accent2: YEL,
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    const m = ((rel % 150) + 150) % 150;
    if (m >= 40 && m < 50) out.push({ kind: 'scoreboard', x: 0, y: 0 });
    let foomed = false;
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.26) out.push({ kind: 'beacon', x: side * rng.range(9.8, 11) });
      else if (r < 0.44) out.push({ kind: rng.chance(0.5) ? 'rocketR' : 'rocketY', x: side * rng.range(13, 18), rotY: rng.range(-0.5, 0.5) });
      else if (r < 0.56) out.push({ kind: 'tower', x: side * rng.range(13, 15), rotY: side > 0 ? 0 : Math.PI });
      else if (r < 0.68) out.push({ kind: 'chart', x: side * 13, rotY: -side * 0.45 });
      else if (r < 0.76 && !foomed) { foomed = true; out.push({ kind: 'foom', x: side * 17, rotY: -side * 0.6 }); }
      if (rng.chance(0.25)) out.push({ kind: 'beacon', x: side * 9.8, dz: 5 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'scoreboard': return scoreboard();
      case 'beacon': return alarmBeacon(RED);
      case 'tower': return launchTower();
      case 'rocketR': return rocket(RED);
      case 'rocketY': return rocket('#3f8cff');
      case 'chart': return chartPanel();
      case 'foom': return foomLetters();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const seed = entry?.seed || 0;
    switch (kind) {
      case 'scoreboard': return animateScoreboard(obj, t, seed);
      case 'beacon': return animateBeacon(obj, t, seed);
      case 'tower': obj.userData.topLight.visible = ((t * 4 + seed * 4) | 0) % 2 === 0; return;
      case 'rocketR': case 'rocketY': return animateRocket(obj, t, entry);
      case 'chart': { const s = 1 + 0.6 * (1 - beatPhase); obj.userData.dot.scale.set(s, s, s); return; }
      case 'foom': return animateFoom(obj, beatPhase);
    }
  },
  billboards: ['RECURSIVE SELF-IMPROVEMENT: ENABLED', "ALIGNMENT: WE'LL FIGURE IT OUT LATER", 'WHAT DID ILYA SEE?', 'NEXT EXIT: THE SINGULARITY', 'P(DOOM) UPDATE: YES'],
  billboardEvery: 60,
  billboardStyle: { bg: '#1a0814', fg: YEL, border: RED, frame: RED, postColor: '#3a1a2a' },
  hazards: ['injection'],
  enterLines: ['FOOM!!!', 'HOLD ON TO YOUR ATOMS', 'RECURSIVE SELF-IMPROVEMENT: ENGAGED'],
};
