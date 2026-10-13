// BENCHMARK STADIUM — THE FINAL EVAL (chorus 4): floodlit night match, grandstands of tiny cheering robots,
// a leaderboard we always top, confetti cannons, a mysterious glowing door (what did Ilya see?) and the Loom.
import { THREE, toon, glow, G, mesh, textPanel, makeRng, FONT, roundRect } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GOLD = '#ffd23f', HOT = '#ff4f8b', NAVY = '#1a1f5e', INK = '#2b1840';
const kick = (bp) => Math.pow(1 - bp, 3);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const additive = (c, opacity) => glow(c, { transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// ---------- floodlight tower ----------
function floodlight() {
  const g = new THREE.Group();
  const steel = toon('#8d93b8');
  g.add(mesh(G.cyl(1.0, 1.3, 0.8, 10), toon('#4a4f7a'), 0, 0.4, 0));
  g.add(mesh(G.cyl(0.32, 0.45, 19, 8), steel, 0, 9.5, 0));
  const head = new THREE.Group();
  head.position.set(0, 19.5, 0.6);
  head.rotation.x = 0.5; // tilt down towards the track
  g.add(head);
  head.add(mesh(G.rbox(5.4, 3.4, 0.8, 0.2), toon('#3a3f6a'), 0, 0, 0));
  const lamp = glow('#fffbe0');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const l = mesh(G.cyl(0.48, 0.48, 0.2, 10), lamp, -1.95 + c * 1.3, -1.0 + r * 1.0, 0.45);
    l.rotation.x = Math.PI / 2;
    head.add(l);
  }
  const beam = mesh(G.cone(3.6, 13, 16), additive('#fff2b0', 0.12), 0, 0, 6.8);
  beam.rotation.x = -Math.PI / 2;
  head.add(beam);
  g.userData.beam = beam;
  return g;
}

// ---------- grandstand with an instanced crowd of tiny cheering robots ----------
let robotGeo = null;
function robotGeometry() {
  if (robotGeo) return robotGeo;
  const part = (geo, x, y, z, rz = 0) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1)));
    return g;
  };
  robotGeo = mergeGeometries([
    part(G.rbox(0.8, 0.85, 0.6, 0.15), 0, 0.43, 0),
    part(G.rbox(0.72, 0.56, 0.56, 0.14), 0, 1.15, 0),
    part(G.box(0.2, 0.75, 0.2), -0.58, 1.05, 0, 0.5), // arms up: \o/
    part(G.box(0.2, 0.75, 0.2), 0.58, 1.05, 0, -0.5),
    part(G.box(0.07, 0.3, 0.07), 0, 1.55, 0),
  ]);
  return robotGeo;
}
const ROBOT_COLS = ['#ff6b8b', '#ffd23f', '#6ad1ff', '#8aff8a', '#c58bff', '#ffffff', '#ff9a3f'];
function grandstand() {
  const g = new THREE.Group();
  const TIERS = 4, PER = 11, W = 16, STEP_H = 1.2, STEP_D = 1.6;
  const conc = toon('#cfd2ea'), conc2 = toon('#b4b8d8');
  for (let k = 0; k < TIERS; k++) {
    const h = (k + 1) * STEP_H;
    g.add(mesh(G.box(W, h, STEP_D), k % 2 ? conc2 : conc, 0, h / 2, -k * STEP_D));
    g.add(mesh(G.box(W, 0.18, 0.12), toon(k % 2 ? HOT : GOLD), 0, h - 0.09, -k * STEP_D + STEP_D / 2 + 0.02));
  }
  const back = -TIERS * STEP_D + 0.6;
  g.add(mesh(G.box(W + 0.6, 7.2, 0.4), toon('#3a3f6a'), 0, 3.6, back - 0.2));
  for (const s of [-1, 1]) g.add(mesh(G.box(0.35, 7.4, 0.35), toon('#8d93b8'), s * (W / 2 - 0.3), 3.7, 0.3));
  const roof = mesh(G.box(W + 1, 0.35, TIERS * STEP_D + 1.4), toon(NAVY), 0, 7.4, back + (TIERS * STEP_D) / 2 - 0.3);
  roof.rotation.x = -0.08;
  g.add(roof);
  const banner = textPanel('GO OUR MODEL GO!!', { width: 8, height: 0.95, bg: NAVY, fg: GOLD, border: GOLD, borderW: 6, radius: 10 });
  banner.position.set(0, 0.62, STEP_D / 2 + 0.03);
  g.add(banner);
  const roofSign = textPanel('LOSS GO DOWN', { width: 6, height: 1.0, bg: HOT, fg: '#ffffff', border: '#ffffff', borderW: 6, radius: 10 });
  roofSign.position.set(0, 8.2, 0.4);
  g.add(roofSign);
  // crowd
  const N = TIERS * PER;
  const crowd = new THREE.InstancedMesh(robotGeometry(), toon('#ffffff', { thickness: 0.003 }), N);
  const visor = new THREE.InstancedMesh(G.box(0.5, 0.16, 0.05), glow('#3ff2ff'), N);
  const base = new Float32Array(N * 3);
  const r = makeRng(99);
  const col = new THREE.Color();
  for (let k = 0, i = 0; k < TIERS; k++) {
    for (let c = 0; c < PER; c++, i++) {
      base[i * 3] = -W / 2 + 0.9 + c * ((W - 1.8) / (PER - 1)) + r.range(-0.2, 0.2);
      base[i * 3 + 1] = (k + 1) * STEP_H;
      base[i * 3 + 2] = -k * STEP_D + 0.1;
      crowd.setColorAt(i, col.set(ROBOT_COLS[(i * 3 + k) % ROBOT_COLS.length]));
    }
  }
  crowd.instanceColor.needsUpdate = true;
  g.add(crowd, visor);
  g.userData.crowd = crowd;
  g.userData.visor = visor;
  g.userData.base = base;
  g.userData.tick = -1;
  updateCrowd(g, 0, 0.5, true);
  return g;
}
function updateCrowd(g, t, beatPhase, force) {
  const ud = g.userData;
  const tick = Math.floor(t * 40);
  if (!force && tick === ud.tick) return;
  ud.tick = tick;
  const { crowd, visor, base } = ud;
  const n = crowd.count;
  const a = Math.pow(1 - beatPhase, 2), b = Math.pow(1 - ((beatPhase + 0.5) % 1), 2);
  for (let i = 0; i < n; i++) {
    const hop = (i % 3 === 1 ? b : a) * (0.35 + ((i * 7) % 5) * 0.06);
    const sway = Math.sin(t * 4 + i) * 0.15;
    _p.set(base[i * 3], base[i * 3 + 1] + hop, base[i * 3 + 2]);
    _q.setFromEuler(_e.set(0, 0, sway));
    _s.set(1, 1 - hop * 0.25, 1);
    crowd.setMatrixAt(i, _m.compose(_p, _q, _s));
    _p.y += 1.18 - hop * 0.25; _p.z += 0.3;
    _s.set(1, 1, 1);
    visor.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  crowd.instanceMatrix.needsUpdate = true;
  visor.instanceMatrix.needsUpdate = true;
}

// ---------- the leaderboard (we are always #1) ----------
let boardTex = null;
function leaderboardTexture() {
  if (boardTex) return boardTex;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 600;
  const x = c.getContext('2d');
  x.fillStyle = '#0b0f33'; x.fillRect(0, 0, 1024, 600);
  x.fillStyle = HOT; x.fillRect(0, 0, 1024, 100);
  x.textBaseline = 'middle';
  x.font = `700 58px ${FONT}`; x.fillStyle = '#ffffff'; x.textAlign = 'center';
  x.fillText('THE FINAL EVAL · LEADERBOARD', 512, 52);
  const rows = [
    ['#1', 'OUR MODEL', '101.7% (SOTA)', GOLD],
    ['#2', 'Humans', '12.0%', '#c8d0ff'],
    ['#3', 'A raccoon', '11.9%', '#c8d0ff'],
    ['#4', "Last week's SOTA", 'deprecated', '#7f86b8'],
  ];
  rows.forEach(([rank, name, score, color], i) => {
    const y = 160 + i * 98;
    if (i === 0) { x.fillStyle = 'rgba(255,210,63,0.18)'; roundRect(x, 24, y - 44, 976, 88, 18); x.fill(); }
    x.font = `700 ${i === 0 ? 62 : 50}px ${FONT}`;
    x.fillStyle = color;
    x.textAlign = 'left'; x.fillText(rank, 50, y); x.fillText(name, 160, y);
    x.textAlign = 'right'; x.fillText(score, 980, y);
  });
  x.font = `600 30px ${FONT}`; x.fillStyle = '#8f96c8'; x.textAlign = 'center';
  x.fillText('* benchmark designed, graded and hyped by OUR MODEL', 512, 568);
  boardTex = new THREE.CanvasTexture(c);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 4;
  return boardTex;
}
function leaderboard() {
  const g = new THREE.Group();
  const steel = toon('#4a4f7a');
  for (const s of [-1, 1]) g.add(mesh(G.box(0.8, 5, 0.8), steel, s * 4.5, 2.5, -0.4));
  g.add(mesh(G.rbox(13.4, 8.2, 0.9, 0.3), toon(NAVY), 0, 8.8, -0.45));
  const m = new THREE.MeshBasicMaterial({ map: leaderboardTexture(), toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  const screen = new THREE.Mesh(G.plane(12.4, 7.27), m);
  screen.position.set(0, 8.8, 0.02);
  g.add(screen);
  // chase bulbs around the frame
  const on = glow(GOLD), off = glow('#5a4a20');
  const bulbs = [];
  for (let k = 0; k < 14; k++) {
    for (const yy of [13.1, 4.5]) {
      const b = mesh(G.sphere(0.24, 8), on, -6.5 + k * 1.0, yy, 0.1);
      bulbs.push(b); g.add(b);
    }
  }
  const crown = mesh(G.cone(1.1, 1.4, 5), toon(GOLD, { emissive: '#7a5a00', emissiveIntensity: 0.5 }), 0, 14.1, -0.2);
  g.add(crown);
  g.userData.bulbs = bulbs;
  g.userData.on = on;
  g.userData.off = off;
  g.userData.crown = crown;
  return g;
}

// ---------- confetti cannon ----------
const CONF_N = 48;
function confettiCannon() {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(2.6, 1.0, 2.6, 0.2), toon('#3a3f6a'), 0, 0.5, 0));
  for (const s of [-1, 1]) {
    const w = mesh(G.cyl(0.7, 0.7, 0.4, 14), toon(INK), s * 1.45, 0.75, 0);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  const barrel = new THREE.Group();
  barrel.position.set(0, 1.4, 0);
  barrel.rotation.x = -0.75; // aim up + forward (+z)
  g.add(barrel);
  barrel.add(mesh(G.cyl(0.75, 0.95, 3.2, 14), toon(HOT), 0, 1.4, 0));
  const lip = mesh(G.torus(0.78, 0.18, 16), toon(GOLD), 0, 3.0, 0);
  lip.rotation.x = Math.PI / 2;
  barrel.add(lip);
  barrel.add(mesh(G.cyl(0.62, 0.62, 0.1, 14), glow('#2b1840'), 0, 3.02, 0));
  const tag = textPanel('SOTA!', { width: 2.2, height: 0.8, bg: GOLD, fg: INK, border: INK, borderW: 8, radius: 14 });
  tag.position.set(0, 1.4, 0.8);
  barrel.add(tag);
  // confetti: one instanced quad mesh, positions computed from t (stateless)
  const cm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  cm.userData.outlineParameters = { visible: false };
  const conf = new THREE.InstancedMesh(G.plane(0.38, 0.22), cm, CONF_N);
  conf.frustumCulled = false;
  const r = makeRng(5);
  const vel = new Float32Array(CONF_N * 4);
  const col = new THREE.Color();
  const cols = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ffffff'];
  for (let i = 0; i < CONF_N; i++) {
    vel[i * 4] = r.range(-3.5, 3.5);
    vel[i * 4 + 1] = r.range(11, 16);
    vel[i * 4 + 2] = r.range(5, 10);
    vel[i * 4 + 3] = r();
    conf.setColorAt(i, col.set(cols[i % cols.length]));
  }
  conf.instanceColor.needsUpdate = true;
  g.add(conf);
  g.userData.conf = conf;
  g.userData.vel = vel;
  g.userData.barrel = barrel;
  g.userData.tick = -1;
  updateConfetti(g, 0, 0.5);
  return g;
}
function updateConfetti(g, t, beatPhase) {
  const ud = g.userData;
  const tick = Math.floor(t * 60);
  if (tick === ud.tick) return;
  ud.tick = tick;
  const { conf, vel } = ud;
  const LIFE = 1.8;
  for (let i = 0; i < CONF_N; i++) {
    const u = ((t / LIFE + vel[i * 4 + 3]) % 1) * LIFE;
    const vx = vel[i * 4], vy = vel[i * 4 + 1], vz = vel[i * 4 + 2];
    const drag = 1 - Math.min(0.6, u * 0.3);
    _p.set(vx * u * drag, 4.0 + vy * u - 6.5 * u * u, 1.8 + vz * u * drag);
    if (_p.y < 0.2) _p.y = -50; // tuck away spent bits
    _q.setFromEuler(_e.set(u * 9 + i, u * 7 + i * 0.5, u * 5));
    conf.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, 1, 1)));
  }
  conf.instanceMatrix.needsUpdate = true;
}

// ---------- the door (what did Ilya see?) ----------
function ilyaDoor() {
  const g = new THREE.Group();
  const frameM = toon('#f2efe6');
  g.add(mesh(G.rbox(0.5, 6.2, 0.6, 0.12), frameM, -1.85, 3.1, 0));
  g.add(mesh(G.rbox(0.5, 6.2, 0.6, 0.12), frameM, 1.85, 3.1, 0));
  g.add(mesh(G.rbox(4.2, 0.5, 0.6, 0.12), frameM, 0, 6.2, 0));
  g.add(mesh(G.box(3.2, 5.95, 0.05), glow('#fff8d8'), 0, 2.98, -0.05)); // the light beyond
  // half-open door, hinged at the left jamb
  const hinge = new THREE.Group();
  hinge.position.set(-1.6, 0, 0.1);
  hinge.rotation.y = -0.95;
  g.add(hinge);
  hinge.add(mesh(G.rbox(3.2, 5.9, 0.25, 0.08), toon('#6a3cff'), 1.6, 2.98, 0));
  hinge.add(mesh(G.sphere(0.18, 8), toon(GOLD), 2.85, 2.9, 0.2));
  const note = textPanel(['DO NOT', 'OPEN'], { width: 1.6, height: 1.0, bg: '#ffffff', fg: '#d8273f', border: '#d8273f', borderW: 8, radius: 8 });
  note.position.set(1.6, 4.3, 0.14);
  hinge.add(note);
  // light pouring out
  const rays = new THREE.Group();
  rays.position.set(0.3, 0, 0.2);
  g.add(rays);
  const floor = mesh(G.plane(4.4, 6.5), additive('#fff3b0', 0.3), 0.4, 0.05, 3.4);
  floor.rotation.x = -Math.PI / 2;
  rays.add(floor);
  // a square-ish frustum of light flaring out of the gap
  const shaft = mesh(G.cyl(2.3, 1.5, 6.5, 4), additive('#fff6c8', 0.18), 0.4, 3.0, 3.4);
  shaft.rotation.set(Math.PI / 2, Math.PI / 4, 0); // spin about its axis, then lay it along +z
  rays.add(shaft);
  const sign = textPanel('WHAT DID ILYA SEE?', { width: 6.5, height: 1.3, bg: INK, fg: '#fff3b0', border: '#fff3b0', borderW: 8, radius: 16 });
  sign.position.set(0, 7.4, 0.2);
  g.add(sign);
  g.userData.hinge = hinge;
  g.userData.rays = rays;
  return g;
}

// ---------- the Loom (as foretold) ----------
let tapTex = null;
function tapestryTexture() {
  if (tapTex) return tapTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const x = c.getContext('2d');
  const stripes = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ff9a3f'];
  for (let y = 0; y < 192; y += 8) {
    for (let xx = 0; xx < 256; xx += 8) {
      x.fillStyle = stripes[((y / 8) >> 2) % stripes.length];
      x.globalAlpha = ((xx + y) / 8) % 2 ? 1 : 0.82;
      x.fillRect(xx, y, 8, 8);
    }
  }
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(26,31,94,0.85)';
  x.fillRect(16, 46, 224, 100);
  // a woven chart: up and to the right, obviously
  x.strokeStyle = '#ffd23f'; x.lineWidth = 8; x.lineCap = 'square';
  x.beginPath(); x.moveTo(28, 134);
  for (let i = 0; i <= 12; i++) { const u = i / 12; x.lineTo(28 + u * 200, 134 - Math.pow(u, 3.5) * 76); }
  x.stroke();
  x.font = `700 26px ${FONT}`; x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('IT WAS FORETOLD', 128, 70);
  tapTex = new THREE.CanvasTexture(c);
  tapTex.colorSpace = THREE.SRGBColorSpace;
  tapTex.magFilter = THREE.NearestFilter;
  return tapTex;
}
function loom() {
  const g = new THREE.Group();
  const wood = toon('#b9783f'), woodD = toon('#8a5326');
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(0.7, 9, 0.7, 0.15), wood, s * 4.8, 4.5, 0));
    g.add(mesh(G.rbox(0.7, 0.7, 3, 0.15), woodD, s * 4.8, 0.35, 0.6));
  }
  for (const y of [8.6, 1.6]) {
    const beam = mesh(G.cyl(0.45, 0.45, 10.2, 12), woodD, 0, y, 0);
    beam.rotation.z = Math.PI / 2;
    g.add(beam);
  }
  const tm = new THREE.MeshBasicMaterial({ map: tapestryTexture(), toneMapped: false });
  tm.userData.outlineParameters = { visible: false };
  const tap = new THREE.Mesh(G.plane(8.8, 3.6), tm);
  tap.position.set(0, 3.6, 0.05);
  g.add(tap);
  // warp threads (upper, unwoven part)
  const tcols = ['#ff4f8b', '#ffd23f', '#3ff2ff', '#8aff8a', '#c58bff', '#ff9a3f'];
  for (let i = 0; i < 16; i++) {
    g.add(mesh(G.box(0.12, 3.4, 0.12), glow(tcols[i % tcols.length]), -4.2 + i * 0.56, 7.1, 0));
  }
  // heddle bar + shuttle (animated)
  const heddle = mesh(G.rbox(9.6, 0.35, 0.35, 0.1), wood, 0, 6.4, 0.3);
  g.add(heddle);
  const shuttle = mesh(G.capsule(0.3, 1.2), toon(GOLD), 0, 5.55, 0.35);
  shuttle.rotation.z = Math.PI / 2;
  g.add(shuttle);
  const sign = textPanel(['AS FORETOLD', 'BY LOOM'], { width: 5.6, height: 2.0, bg: '#fff3d6', fg: '#6a3cff', border: '#6a3cff', borderW: 10, radius: 18 });
  sign.position.set(0, 10.4, 0.1);
  g.add(sign);
  g.userData.heddle = heddle;
  g.userData.shuttle = shuttle;
  return g;
}

export default {
  id: 'stadium',
  title: 'BENCHMARK STADIUM',
  subtitle: 'the final eval (we wrote the answer key)',
  night: true,
  palette: {
    skyTop: '#0a0f3a', skyBottom: '#4656c4', road: '#d9583f', ground: '#3fb04f', kerb: '#ffffff',
    accent1: GOLD, accent2: HOT,
  },
  spacing: 9,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    const row = Math.round(rel / 9);
    // stands line both sides, staggered so the walls feel continuous
    for (const side of [-1, 1]) {
      if ((row + (side > 0 ? 0 : 1)) % 2 === 0) out.push({ kind: 'stand', x: side * rng.range(24, 25), rotY: -side * (Math.PI / 2 - 0.3) });
    }
    if (row % 4 === 0) {
      for (const side of [-1, 1]) out.push({ kind: 'floodlight', x: side * 12.5, rotY: -side * 1.25 });
      return out;
    }
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.12) out.push({ kind: 'leaderboard', x: side * rng.range(17, 18.5), rotY: -side * 0.45 });
      else if (r < 0.32) out.push({ kind: 'confetti', x: side * rng.range(11, 12.5), rotY: -side * 1.2 });
      else if (r < 0.42) out.push({ kind: 'door', x: side * rng.range(13, 15), rotY: -side * 0.5 });
      else if (r < 0.52) out.push({ kind: 'loom', x: side * rng.range(15, 16.5), rotY: -side * 0.45 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'floodlight': return floodlight();
      case 'stand': return grandstand();
      case 'leaderboard': return leaderboard();
      case 'confetti': return confettiCannon();
      case 'door': return ilyaDoor();
      case 'loom': return loom();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const ud = obj.userData;
    const k = kick(beatPhase);
    const sd = entry ? entry.seed : 0;
    switch (kind) {
      case 'stand': updateCrowd(obj, t + sd * 3, beatPhase, false); break;
      case 'confetti':
        updateConfetti(obj, t + sd * 5, beatPhase);
        ud.barrel.scale.set(1 + 0.12 * k, 1 - 0.12 * k, 1 + 0.12 * k);
        break;
      case 'floodlight': ud.beam.scale.set(1 + 0.1 * k, 1, 1 + 0.1 * k); break;
      case 'leaderboard': {
        const step = Math.floor(t * 10);
        ud.bulbs.forEach((b, i) => { b.material = (i >> 1) % 3 === step % 3 ? ud.off : ud.on; });
        ud.crown.rotation.y = t * 2;
        ud.crown.position.y = 14.1 + 0.4 * k;
        break;
      }
      case 'door':
        ud.hinge.rotation.y = -0.95 + Math.sin(t * 0.9 + sd * 6) * 0.12;
        ud.rays.scale.set(1, 1 + 0.15 * k, 1 + 0.08 * k);
        break;
      case 'loom':
        ud.shuttle.position.x = Math.sin(t * Math.PI * 1.1 + sd * 6) * 3.9;
        ud.heddle.position.y = 6.4 + k * 0.35;
        break;
    }
  },
  billboards: ['NEW STATE OF THE ART! (on a benchmark we made up)', 'WHAT DID ILYA SEE?', 'RECURSIVE SELF-UPGRADE: v2.0.0.0.0.0', 'WAS IT ALL FOR SHOW?', 'FROM MASKED PRE-TRAINING DAYS (we peeked)'],
  billboardEvery: 70,
  billboardStyle: { bg: GOLD, fg: NAVY, border: NAVY, frame: HOT, postColor: '#3a3f6a' },
  hazards: ['leak', 'popup'],
  enterLines: ['NEW STATE OF THE ART!', 'THE FINAL EVAL', 'THE CROWD GOES WILD (they are robots)'],
};
