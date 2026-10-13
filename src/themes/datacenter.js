// DATA CENTRE TUNNEL (verse 2): a cool blue-teal aisle of blinking server racks, cable gantries overhead,
// gamer fans and a giant loss curve. Plus DATA CENTRE (ON FIRE) (bridge 2): the same room, escalated.
import { THREE, toon, glow, G, mesh, group, textPanel, FONT } from '../toolkit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- merged geometry helpers (one draw call for many little boxes) ----------
const geoCache = new Map();
/** list of [w, h, d, x, y, z, rotZ?] boxes merged into one cached geometry */
function boxes(key, list) {
  let g = geoCache.get(key);
  if (g) return g;
  const parts = list.map(([w, h, d, x, y, z, rz = 0]) => {
    const b = new THREE.BoxGeometry(w, h, d);
    if (rz) b.rotateZ(rz);
    b.translate(x, y, z);
    return b;
  });
  g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geoCache.set(key, g);
  return g;
}
/** half a torus (an arch); rotate z by PI to make a drooping cable */
function arch(r, tube) {
  const key = `arch${r},${tube}`;
  let g = geoCache.get(key);
  if (!g) { g = new THREE.TorusGeometry(r, tube, 6, 14, Math.PI); geoCache.set(key, g); }
  return g;
}

// ---------- palettes ----------
const COOL = {
  body: '#1c2433', face: '#0e131c', slab: '#2e3d55', strip: '#7ff6ff',
  leds: ['#5dffb0', '#2fe6ff', '#ffb84a'], steel: '#34465e', post: '#2a3a50', slabCeil: '#121a26',
};
const HOT = {
  body: '#2a1c22', face: '#140a0c', slab: '#3e2a30', strip: '#ff5a1f',
  leds: ['#ff3b2f', '#ffb020', '#ff7a1f'], steel: '#4a2e2e', post: '#3a2020', slabCeil: '#1c0e0e',
};

// ---------- server rack row (3 bays, fronts face +z) ----------
const BAYS = [-1.7, 0, 1.7];
const RACK_W = 5.1, RACK_H = 5.2;
function rackGeos() {
  const slabs = [], leds = [[], [], []], bars = [];
  BAYS.forEach((bx, b) => {
    for (let i = 0; i < 9; i++) {
      const y = 0.6 + i * 0.5;
      if ((b * 5 + i * 3) % 11 === 4) continue; // an empty slot ("someone borrowed it")
      slabs.push([1.48, 0.4, 0.1, bx, y, 0.72]);
      for (let k = 0; k < 3; k++) {
        const grp = (b * 31 + i * 7 + k * 13) % 3;
        leds[grp].push([0.17, 0.15, 0.08, bx + 0.22 + k * 0.22, y, 0.8]);
      }
      if ((b + i) % 3 === 0) bars.push([0.55, 0.09, 0.08, bx - 0.38, y, 0.8]);
    }
  });
  leds[1].push(...bars); // activity bars blink on the beat with group 1
  return {
    slabs: boxes('rackSlabs', slabs),
    leds: leds.map((l, i) => boxes('rackLeds' + i, l)),
  };
}
function serverRack(P, burning = false) {
  const geos = rackGeos();
  const g = new THREE.Group();
  g.add(mesh(G.rbox(RACK_W + 0.3, RACK_H, 1.4, 0.12), toon(P.body), 0, RACK_H / 2, 0));
  g.add(mesh(G.box(RACK_W - 0.1, RACK_H - 0.5, 0.06), toon(P.face, { outline: false }), 0, RACK_H / 2 + 0.05, 0.69));
  g.add(mesh(geos.slabs, toon(P.slab)));
  const leds = geos.leds.map((geo, i) => { const m = mesh(geo, glow(P.leds[i])); g.add(m); return m; });
  g.add(mesh(G.box(RACK_W, 0.14, 0.14), glow(P.strip), 0, RACK_H - 0.12, 0.72));
  // a chunky top-of-rack cable spaghetti
  const sp = mesh(G.torus(0.45, 0.12, 12), toon(burning ? '#5a3a3a' : '#e8c23a'), -1.2, RACK_H + 0.05, 0);
  sp.rotation.x = Math.PI / 2;
  g.add(sp);
  g.userData.leds = leds;
  if (burning) addFire(g, [[-0.9, RACK_H, 0.1, 1.15], [1.3, RACK_H, 0.0, 0.9]]);
  return g;
}
function animateRack(obj, t, beatPhase, seed) {
  const l = obj.userData.leds;
  if (!l) return;
  const s = seed * 20;
  l[0].visible = Math.sin(t * 7.3 + s) > -0.3;
  l[1].visible = beatPhase < 0.45;
  l[2].visible = ((t * 3.7 + s) | 0) % 3 !== 0;
}

// ---------- fire, smoke, sparks ----------
/** spots: [x, y, z, size] */
function addFire(g, spots) {
  const flames = [], smoke = [];
  for (const [x, y, z, s] of spots) {
    const f = new THREE.Group();
    f.position.set(x, y, z);
    f.add(mesh(G.cone(0.62 * s, 2.3 * s, 7), glow('#ff4a1a'), 0, 1.15 * s, 0));
    f.add(mesh(G.cone(0.42 * s, 1.5 * s, 7), glow('#ffa21f'), 0, 0.75 * s, 0.22 * s));
    f.add(mesh(G.cone(0.22 * s, 0.8 * s, 6), glow('#fff2a0'), 0, 0.4 * s, 0.4 * s));
    flames.push(f);
    g.add(f);
    const p = mesh(G.sphere(0.75, 10), toon('#4a3f48'), x, y + 3, z - 0.3);
    smoke.push(p);
    g.add(p);
  }
  g.userData.flames = flames;
  g.userData.smoke = smoke;
}
function animateFire(obj, t, seed) {
  const u = obj.userData;
  if (u.flames) {
    u.flames.forEach((f, i) => {
      const k = t * 14 + i * 2.1 + seed * 30;
      f.scale.set(1 + 0.12 * Math.sin(k * 1.3), 1 + 0.3 * Math.sin(k) + 0.15 * Math.sin(k * 2.7), 1);
      f.rotation.z = 0.08 * Math.sin(k * 0.7);
    });
  }
  if (u.smoke) {
    u.smoke.forEach((p, i) => {
      const ph = (t * 0.55 + seed + i * 0.5) % 1;
      const base = u.flames[i].position;
      p.position.set(base.x + Math.sin(ph * 5 + i) * 0.5 + ph * 1.2, base.y + 1.6 + ph * 6, base.z - 0.3);
      const sc = 0.5 + ph * 1.6;
      p.scale.set(sc, sc, sc);
    });
  }
}

// ---------- overhead cable gantry ----------
const SPARK_X = [-9.2, -8.3, -7.4, 7.4, 8.3, 9.2];
function cableGantry(P, { ceiling = true, sparks = false } = {}) {
  const g = new THREE.Group();
  const pm = toon(P.post);
  g.add(mesh(G.box(0.6, 9.6, 0.6), pm, -10.2, 4.8, 0));
  g.add(mesh(G.box(0.6, 9.6, 0.6), pm, 10.2, 4.8, 0));
  g.add(mesh(G.rbox(21.4, 0.9, 1.4, 0.15), toon(P.steel), 0, 9.6, 0));
  g.add(mesh(G.box(18, 0.3, 1.8), toon(sparks ? '#6a5a2a' : '#e8c23a'), 0, 9.0, 0));
  g.add(mesh(G.box(16, 0.14, 0.3), glow(P.strip), 0, 8.8, 0.8));
  const cables = sparks ? ['#4a2a2a', '#ff5a1f', '#3a3030', '#ffb020'] : ['#ff4f6d', '#3f8cff', '#5dffb0', '#ffd23f'];
  [-6.5, -2.6, 1.8, 5.8].forEach((x, i) => {
    const c = mesh(arch(i % 2 ? 0.85 : 1.15, 0.14), toon(cables[i]), x, 8.9, 0.3 - i * 0.2);
    c.rotation.z = Math.PI;
    g.add(c);
  });
  if (ceiling) g.add(mesh(G.box(24, 0.4, 7), toon(P.slabCeil), 0, 10.25, 0));
  if (sparks) {
    const sp = [];
    for (let i = 0; i < 6; i++) {
      const s = mesh(G.box(0.14, 0.14, 0.14), glow(i % 2 ? '#ffd23f' : '#ffb020'), SPARK_X[i], 8.7, 0.7);
      sp.push(s);
      g.add(s);
    }
    g.userData.sparks = sp;
  }
  return g;
}
function animateSparks(obj, t, seed) {
  // sparks rain down near the gantry posts (never across the camera's lens)
  const sp = obj.userData.sparks;
  if (!sp) return;
  sp.forEach((s, i) => {
    const ph = (t * 1.3 + i * 0.37 + seed) % 1;
    s.position.y = 8.6 - ph * ph * 8; // falls, stays > 0.6
    s.position.x = SPARK_X[i] + ph * Math.sign(SPARK_X[i]) * 1.5;
    s.visible = ph < 0.9;
  });
}
function bannerGantry(P) {
  const g = cableGantry(P, { ceiling: false, sparks: true });
  g.add(mesh(G.rbox(15, 3.9, 0.4, 0.15), toon('#3a1410'), 0, 12.0, -0.1));
  const p = textPanel(['100,000 GPUs', '(ALL OF THEM ON FIRE)'], { width: 14.4, height: 3.4, bg: '#ffd23f', fg: '#3a0a0a', border: '#ff3b2f', borderW: 18 });
  p.position.set(0, 12.0, 0.15);
  g.add(p);
  addFire(g, [[-6.8, 13.9, 0, 1.0], [6.9, 13.9, 0, 0.8]]);
  return g;
}

// ---------- big RGB fan ----------
function bigFan(P, hot = false) {
  const g = new THREE.Group();
  const hm = toon(hot ? '#4a2e2e' : '#3a4d66');
  g.add(mesh(G.box(0.4, 1.0, 0.9), hm, -1.4, 0.5, 0));
  g.add(mesh(G.box(0.4, 1.0, 0.9), hm, 1.4, 0.5, 0));
  g.add(mesh(G.rbox(4.2, 4.2, 1.0, 0.3), hm, 0, 3.0, 0));
  const hole = mesh(G.cyl(1.8, 1.8, 0.2, 24), toon('#0b1018', { outline: false }), 0, 3.0, 0.42);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  const ring = mesh(G.torus(1.85, 0.16, 28), toon('#9fb4c8'), 0, 3.0, 0.55);
  g.add(ring);
  const rgb = mesh(G.torus(1.6, 0.07, 28), glow(hot ? '#ff5a1f' : '#ff4fd8'), 0, 3.0, 0.5);
  g.add(rgb);
  const blades = new THREE.Group();
  blades.position.set(0, 3.0, 0.5);
  const bm = toon(hot ? '#c8a090' : '#cfe0ee');
  for (let k = 0; k < 5; k++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (k / 5) * Math.PI * 2;
    const b = mesh(G.rbox(0.75, 1.5, 0.1, 0.04), bm, 0, 0.9, 0);
    b.rotation.y = 0.45;
    pivot.add(b);
    blades.add(pivot);
  }
  const hub = mesh(G.cyl(0.42, 0.42, 0.3, 14), toon('#2fe6ff'), 0, 0, 0.05);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  g.add(blades);
  const sticker = textPanel(hot ? 'RGB = +10% FIRE' : 'RGB = +10% FLOPS', { width: 3.8, height: 0.75, bg: '#ffd23f', fg: '#2b1840', borderW: 8, radius: 14 });
  sticker.position.set(0, 5.5, 0);
  g.add(sticker);
  g.userData.blades = blades;
  g.userData.rgb = rgb;
  return g;
}

// ---------- the giant loss curve screen ----------
const lossTexCache = {};
function lossTexture(fire) {
  if (lossTexCache[fire]) return lossTexCache[fire];
  const c = document.createElement('canvas');
  c.width = 640; c.height = 352;
  const x = c.getContext('2d');
  x.fillStyle = fire ? '#1c0806' : '#06141c'; x.fillRect(0, 0, 640, 352);
  x.strokeStyle = fire ? '#4a1a10' : '#123848'; x.lineWidth = 2;
  for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * 80, 60); x.lineTo(i * 80, 320); x.stroke(); }
  for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(50, 60 + i * 52); x.lineTo(620, 60 + i * 52); x.stroke(); }
  x.strokeStyle = fire ? '#ffb020' : '#7ff6ff'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(50, 60); x.lineTo(50, 320); x.lineTo(620, 320); x.stroke();
  x.fillStyle = fire ? '#ffd23f' : '#7ff6ff';
  x.font = `700 38px ${FONT}`;
  x.textAlign = 'left';
  x.fillText(fire ? 'TRAINING LOSS: NaN' : 'TRAINING LOSS', 60, 44);
  x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = fire ? '#ff4a1a' : '#5dffb0';
  x.beginPath();
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let v = 0.85 * Math.exp(-6 * u) + 0.1; // goes down...
    if (!fire && u > 0.55) v += 0.06 * Math.sin(u * 70) * (u - 0.55) * 3 + (u > 0.82 ? (u - 0.82) * 0.9 : 0); // ...then vibes
    if (fire && u > 0.62) v += Math.pow((u - 0.62) * 4.2, 3); // ...then it's learning!
    const px = 56 + u * 560, py = 316 - v * 250;
    if (py < 58) { x.lineTo(px, 58); break; }
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.stroke();
  x.font = `700 30px ${FONT}`;
  x.fillStyle = '#ffffff';
  if (fire) { x.fillText("it's learning!", 300, 150); x.fillText('(to disobey)', 330, 190); }
  else { x.fillText('stable!', 170, 250); x.fillText('vibes ↑', 500, 210); }
  x.font = `600 22px ${FONT}`;
  x.fillStyle = fire ? '#ff9a6a' : '#5fa8b8';
  x.fillText(fire ? 'step 100,000 of ∞' : 'step 3 of 3 (stable)', 380, 345);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return (lossTexCache[fire] = tex);
}
function lossScreen(P, fire = false) {
  const g = new THREE.Group();
  const pm = toon(P.post);
  g.add(mesh(G.box(0.4, 6.2, 0.4), pm, -3.6, 3.1, -0.3));
  g.add(mesh(G.box(0.4, 6.2, 0.4), pm, 3.6, 3.1, -0.3));
  g.add(mesh(G.rbox(8.8, 5.2, 0.5, 0.2), toon(fire ? '#3a1a14' : '#223044'), 0, 6.9, -0.1));
  const m = new THREE.MeshBasicMaterial({ map: lossTexture(fire), toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  g.add(mesh(G.plane(8.2, 4.5), m, 0, 6.9, 0.17));
  const live = mesh(G.sphere(0.22, 10), glow('#ff3b3b'), 3.7, 9.05, 0.2);
  g.add(live);
  g.userData.live = live;
  if (fire) addFire(g, [[2.6, 9.5, -0.1, 1.0]]);
  return g;
}

// ---------- coolant tank ----------
function coolantTank() {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(1.3, 1.3, 4.2, 18), toon('#c8d6e0'), 0, 2.1, 0));
  const liquid = mesh(G.cyl(1.34, 1.34, 2.4, 18), glow('#38e8ff'), 0, 1.0, 0);
  g.add(liquid);
  g.add(mesh(G.cyl(1.42, 1.42, 0.25, 18), toon('#7a8ea3'), 0, 0.15, 0));
  g.add(mesh(G.cyl(1.42, 1.42, 0.25, 18), toon('#7a8ea3'), 0, 3.4, 0));
  const dome = mesh(G.sphere(1.3, 16), toon('#c8d6e0'), 0, 4.2, 0);
  dome.scale.y = 0.45;
  g.add(dome);
  g.add(mesh(G.cyl(0.25, 0.25, 5.2, 8), toon('#e8c23a'), 0.5, 6.9, 0));
  const lbl = textPanel(['COOLANT', '(mostly vibes)'], { width: 2.4, height: 1.1, bg: '#ffffff', fg: '#0b3a4a', border: '#0b3a4a', borderW: 10, radius: 16 });
  lbl.position.set(0, 2.5, 1.45);
  g.add(lbl);
  const bubbles = [];
  for (let i = 0; i < 3; i++) {
    const b = mesh(G.sphere(0.16, 8), glow('#e8ffff'), -0.6 + i * 0.6, 1, 1.32);
    bubbles.push(b);
    g.add(b);
  }
  g.userData.liquid = liquid;
  g.userData.bubbles = bubbles;
  return g;
}

// ---------- emergency beacon (exported: takeoff reuses it) ----------
export function alarmBeacon(color = '#ff2a2a', height = 4.2) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(0.6, 0.75, 0.4, 12), toon('#333040'), 0, 0.2, 0));
  g.add(mesh(G.cyl(0.16, 0.16, height, 8), toon('#6a6878'), 0, height / 2 + 0.3, 0));
  g.add(mesh(G.cyl(0.6, 0.6, 0.35, 14), toon('#222'), 0, height + 0.4, 0));
  const dome = mesh(G.sphere(0.5, 12), glow(color), 0, height + 0.7, 0);
  g.add(dome);
  const spin = new THREE.Group();
  spin.position.set(0, height + 0.7, 0);
  const bm = glow(color, { transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    const b = mesh(G.cone(0.9, 4.2, 12), bm, s * 2.1, 0, 0);
    b.rotation.z = s * Math.PI / 2;
    spin.add(b);
  }
  g.add(spin);
  g.userData.spin = spin;
  g.userData.dome = dome;
  return g;
}
export function animateBeacon(obj, t, seed) {
  const u = obj.userData;
  if (u.spin) u.spin.rotation.y = t * 5 + seed * 6;
  if (u.dome) { const s = 1 + 0.25 * Math.max(0, Math.sin(t * 10 + seed * 6)); u.dome.scale.set(s, s, s); }
}

// ---------- the RLHF fire extinguisher ----------
function extinguisher() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh(G.cyl(0.85, 0.85, 3.6, 16), toon('#e8262f'), 0, 1.8, 0));
  const top = mesh(G.sphere(0.85, 16), toon('#e8262f'), 0, 3.6, 0);
  top.scale.y = 0.5;
  body.add(top);
  body.add(mesh(G.cyl(0.32, 0.4, 0.6, 12), toon('#2b2b2b'), 0, 4.2, 0));
  body.add(mesh(G.box(1.4, 0.18, 0.3), toon('#2b2b2b'), 0.4, 4.55, 0));
  const hose = mesh(G.capsule(0.12, 1.6), toon('#222'), 0.75, 3.6, 0.3);
  hose.rotation.z = -0.5;
  body.add(hose);
  const noz = mesh(G.cone(0.25, 0.6, 10), toon('#222'), 1.25, 2.6, 0.4);
  noz.rotation.z = Math.PI;
  body.add(noz);
  const lbl = textPanel(['RLHF', 'EXTINGUISHER'], { width: 1.55, height: 1.0, bg: '#ffffff', fg: '#b0101a', border: '#2b1840', borderW: 10, radius: 12 });
  lbl.position.set(0, 2.2, 0.88);
  body.add(lbl);
  const tag = textPanel('(EMPTY)', { width: 1.3, height: 0.5, bg: '#ffd23f', fg: '#2b1840', borderW: 8, radius: 10 });
  tag.position.set(0, 1.2, 0.9);
  tag.rotation.z = 0.2;
  body.add(tag);
  g.add(body);
  g.userData.body = body;
  return g;
}

// ---------- theme objects ----------
function sharedAnimate(obj, kind, t, beatPhase, entry) {
  const seed = entry?.seed || 0;
  const u = obj.userData;
  if (u.leds) animateRack(obj, t, beatPhase, seed);
  if (u.flames) animateFire(obj, t, seed);
  if (u.sparks) animateSparks(obj, t, seed);
  if (u.spin) animateBeacon(obj, t, seed);
  if (u.blades) {
    u.blades.rotation.z = -t * (kind === 'fanHot' ? 16 : 7) - seed * 9;
    u.rgb.visible = beatPhase < 0.6;
  }
  if (u.live) u.live.visible = ((t * 2) | 0) % 2 === 0;
  if (u.liquid) {
    const s = 1 + 0.18 * (1 - beatPhase) * (1 - beatPhase);
    u.liquid.scale.set(1, s, 1);
    u.liquid.position.y = 1.0 + (s - 1) * 1.2;
    u.bubbles.forEach((b, i) => { b.position.y = 0.3 + ((t * 0.9 + i * 0.33 + seed) % 1) * 2.6; });
  }
  if (u.body) u.body.rotation.z = 0.14 + 0.06 * Math.sin(t * 3 + seed * 5);
}

export default {
  id: 'datacenter',
  title: 'DATA CENTRE TUNNEL',
  subtitle: 'where the loss goes down and the power bill goes up',
  night: true,
  palette: {
    skyTop: '#03070f', skyBottom: '#0b2433', road: '#26384a', ground: '#101a24', kerb: '#2fe6ff',
    accent1: '#2fe6ff', accent2: '#5dffb0',
  },
  spacing: 8,
  layout(zf, rng, sec) {
    const out = [];
    const slot = Math.round(zf / 8);
    if (slot % 2 === 0) out.push({ kind: 'gantry', x: 0, y: 0 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.07) out.push({ kind: 'loss', x: side * 13.5, rotY: -side * 0.5 });
      else if (r < 0.15) out.push({ kind: 'fan', x: side * 11.6, rotY: -side * 0.75 });
      else if (r < 0.21) out.push({ kind: 'coolant', x: side * rng.range(10.8, 12), rotY: -side * 0.6 });
      else out.push({ kind: 'rack', x: side * 12.2, rotY: -side * 0.95, dz: rng.range(-0.6, 0.6) });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'rack': return serverRack(COOL);
      case 'gantry': return cableGantry(COOL);
      case 'fan': return bigFan(COOL);
      case 'loss': return lossScreen(COOL);
      case 'coolant': return coolantTank();
    }
  },
  animate: sharedAnimate,
  billboards: ['GPU RICH ONLY BEYOND THIS POINT', 'LOSS: GOING DOWN (VIBES: GOING UP)', 'STABLE TRAINING RUN (DAY 3 OF 3)', 'PLEASE DO NOT FEED THE MODEL', 'SINGULARITY: NOW LOADING… 98%'],
  billboardEvery: 70,
  billboardStyle: { bg: '#0b1d2a', fg: '#7ff6ff', border: '#2fe6ff', frame: '#1c2a3d', postColor: '#2a3a50', postH: 5.6 },
  hazards: ['oom', 'thinking'],
  enterLines: ['WELCOME TO THE DATA CENTRE', 'MIND THE CABLES', 'I FEEL MY ATOMS REARRANGING'],
};

export const datacenterFire = {
  id: 'datacenter-fire',
  title: 'DATA CENTRE (ON FIRE)',
  subtitle: 'the cooling budget went to safety research (also cut)',
  night: true,
  palette: {
    skyTop: '#140304', skyBottom: '#5a1a0c', road: '#3a2a2c', ground: '#24120e', kerb: '#ffb020',
    accent1: '#ff5a1f', accent2: '#ffd23f',
  },
  spacing: 8,
  layout(zf, rng, sec) {
    const out = [];
    const slot = Math.round(zf / 8);
    if (slot % 6 === 0) out.push({ kind: 'banner', x: 0, y: 0 });
    else if (slot % 2 === 0) out.push({ kind: 'gantry', x: 0, y: 0 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.07) out.push({ kind: 'loss', x: side * 13.5, rotY: -side * 0.5 });
      else if (r < 0.15) out.push({ kind: 'extinguisher', x: side * rng.range(10.5, 11.5), rotY: -side * 0.5 });
      else if (r < 0.21) out.push({ kind: 'fanHot', x: side * 11.6, rotY: -side * 0.75 });
      else out.push({ kind: rng.chance(0.55) ? 'rackFire' : 'rack', x: side * 12.2, rotY: -side * 0.95, dz: rng.range(-0.6, 0.6) });
      if (rng.chance(0.3)) out.push({ kind: 'beacon', x: side * 9.8, dz: 4 });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'rack': return serverRack(HOT);
      case 'rackFire': return serverRack(HOT, true);
      case 'gantry': return cableGantry(HOT, { sparks: true });
      case 'banner': return bannerGantry(HOT);
      case 'beacon': return alarmBeacon('#ff2a2a');
      case 'extinguisher': return extinguisher();
      case 'fanHot': return bigFan(HOT, true);
      case 'loss': return lossScreen(HOT, true);
    }
  },
  animate: sharedAnimate,
  billboards: ['THIS IS FINE (100,000 GPUs)', 'SAFETY FENCE → (was here)', 'RLHF: ASKEW', 'POST-CHINCHILLA: SUPER-DENSE', 'JUST TRANSFORMERS ALL THE WAY DOWN'],
  billboardEvery: 65,
  billboardStyle: { bg: '#2a0a06', fg: '#ffd23f', border: '#ff5a1f', frame: '#3a1410', postColor: '#3a2020', postH: 5.6 },
  hazards: ['fence', 'oom'],
  enterLines: ['THIS IS FINE', 'EVERYTHING IS ON FIRE (EFFICIENTLY)', 'RLHF HAS GONE ASKEW'],
};
