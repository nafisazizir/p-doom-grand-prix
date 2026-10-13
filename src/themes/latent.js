// LATENT SPACE / TO THE MOON (chorus 2): the road floats through a neon embedding space.
// Glowing vector clusters, a giant moon with NVDA's chart-rocket stuck in its eye, green candles,
// a crowned basilisk going BOOM, a FLOP/s odometer and the Omega Point off-ramp. Everything pulses on the beat.
import { THREE, toon, glow, G, mesh, textPanel, makeRng, FONT } from '../toolkit.js';

const CYAN = '#3ff2ff', PINK = '#ff4fd8', LIME = '#39ff88', GOLD = '#ffd23f', VOID = '#0b0420';
const neon = (c, k = 0.55) => toon(c, { emissive: c, emissiveIntensity: k });
const kick = (bp) => Math.pow(1 - bp, 4); // 1 on the beat, decays to 0
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

/** A bar (unit box/cylinder scaled) from a to b. */
function bar(a, b, thick, mat, geo = G.box(1, 1, 1)) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  const m = mesh(geo, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(_up, _d.normalize());
  m.scale.set(thick, len, thick);
  return m;
}
function canvasPlane(tex, w, h) {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
  m.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(G.plane(w, h), m);
}

// ---------- embedding cluster: dots + vectors + a very confident cosine similarity ----------
const LABELS = ['doom ≈ boom ≈ moon', 'king − man + GPU = moon', 'cos(doom, vibes) = 0.99', 'P(doom) − safety = ↑'];
function embedCluster(variant) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 4.6;
  g.add(inner);
  const r = makeRng(31 + variant * 7);
  const cols = [CYAN, PINK, GOLD, LIME];
  inner.add(mesh(G.sphere(0.42, 10), glow('#ffffff')));
  const dots = [];
  for (let i = 0; i < 10; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1), rad = r.range(1.4, 2.7);
    const p = [rad * Math.sin(ph) * Math.cos(th), rad * Math.cos(ph) * 0.8, rad * Math.sin(ph) * Math.sin(th)];
    inner.add(mesh(G.sphere(r.range(0.22, 0.38), 8), glow(cols[(i + variant) % 4]), ...p));
    dots.push(p);
  }
  // vectors from the origin: glowing arrows
  const shaftGeo = G.cyl(1, 1, 1, 6);
  for (let i = 0; i < 3; i++) {
    const p = dots[i * 3];
    const tip = [p[0] * 1.25, p[1] * 1.25, p[2] * 1.25];
    const c = i === 0 ? PINK : i === 1 ? CYAN : GOLD;
    inner.add(bar([0, 0, 0], tip, 0.09, glow(c), shaftGeo));
    const head = bar(tip, [tip[0] * 1.18, tip[1] * 1.18, tip[2] * 1.18], 1, glow(c), G.cone(0.28, 1, 8));
    head.scale.set(1, 0.7, 1);
    head.position.set(tip[0] * 1.09, tip[1] * 1.09, tip[2] * 1.09);
    inner.add(head);
  }
  const lbl = textPanel(LABELS[variant % LABELS.length], { width: 8, height: 1.4, bg: null, fg: '#ffffff', stroke: '#7a1d8f', strokeW: 14 });
  lbl.position.set(0, 8.3, 0);
  g.add(lbl);
  g.userData.inner = inner;
  g.userData.lbl = lbl;
  return g;
}

// ---------- the moon, with the NVDA chart rocket stuck in its eye ----------
function moon(dir) {
  const g = new THREE.Group();
  const X = (x) => x * dir;
  const C = [0, 34, 0];
  const body = mesh(G.sphere(10, 28), toon('#fff4c9', { emissive: '#ffe9a8', emissiveIntensity: 0.25, thickness: 0.003 }), ...C);
  g.add(body);
  const crater = toon('#e8d79a', { outline: false });
  for (const [x, y, s] of [[4.5, 4, 1.6], [6.2, -2.5, 1.1], [-1.5, -5.2, 1.3], [2, 7, 0.8], [-6.5, 5.5, 0.9]]) {
    const c = mesh(G.sphere(s, 12), crater, X(x), C[1] + y, Math.sqrt(Math.max(1, 100 - x * x - y * y)) - 0.35);
    c.scale.z = 0.35;
    g.add(c);
  }
  // face: one happy eye, one eye with a rocket in it, a big grin
  const ink = toon('#2b1840', { outline: false });
  const onFace = (x, y, lift = 0.1) => Math.sqrt(Math.max(0, 100 - x * x - y * y)) + lift;
  const eye = mesh(G.sphere(0.9, 12), ink, X(3.4), C[1] + 2.6, onFace(3.4, 2.6, 0));
  eye.scale.set(1, 1.3, 0.4);
  g.add(eye);
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7;
    const sx = Math.cos(a) * 4.6, sy = 1.2 + Math.sin(a) * 4.6;
    g.add(mesh(G.sphere(0.5, 8), ink, X(sx), C[1] + sy, onFace(sx, sy, -0.1)));
  }
  g.add(mesh(G.sphere(1.1, 10), toon('#ff9fb4', { outline: false }), X(6), C[1] - 1.2, onFace(6, -1.2, -0.7)));
  // the chart: up and to the moon
  const pts = [[-30, 0.4, 6], [-27.5, 4.2, 6.4], [-25.5, 2.6, 6.8], [-22.5, 9, 7.2], [-20.5, 7, 7.6], [-17.5, 15, 8], [-15.5, 13, 8.4], [-12.5, 22, 8.8], [-10.5, 20.4, 9.2], [-7.4, 30, 10.4]];
  const line = glow(LIME);
  for (let i = 0; i < pts.length; i++) {
    const p = [X(pts[i][0]), pts[i][1], pts[i][2]];
    g.add(mesh(G.sphere(0.55, 8), glow('#d6ffe6'), ...p));
    if (i) g.add(bar([X(pts[i - 1][0]), pts[i - 1][1], pts[i - 1][2]], p, 0.55, line));
  }
  // rocket: from the end of the chart into the moon's other eye
  const rocket = new THREE.Group();
  rocket.add(mesh(G.cyl(0.85, 0.85, 3.2, 12), toon('#f5f5ff'), 0, 0, 0));
  rocket.add(mesh(G.cone(0.85, 1.6, 12), toon('#ff3b5c'), 0, 2.4, 0));
  rocket.add(mesh(G.cyl(0.42, 0.42, 0.15, 10), glow(CYAN), 0, 0.6, 0.82));
  for (let k = 0; k < 3; k++) {
    const f = mesh(G.box(0.15, 1.2, 1.0), toon('#ff3b5c'), Math.sin(k * 2.09) * 0.9, -1.3, Math.cos(k * 2.09) * 0.9);
    f.rotation.y = k * 2.09;
    rocket.add(f);
  }
  const flame = mesh(G.cone(0.65, 2.2, 10), glow('#ffb84a'), 0, -2.7, 0);
  flame.rotation.x = Math.PI;
  rocket.add(flame);
  const a = [X(-7.4), 30, 10.4], b = [X(-3.4), C[1] + 2.4, 9.0];
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  rocket.quaternion.setFromUnitVectors(_up, _d);
  rocket.position.set(a[0] + _d.x * 1.8, a[1] + _d.y * 1.8, a[2] + _d.z * 1.8);
  g.add(rocket);
  const tag = textPanel(['NVDA ▲ +∞%', 'TO THE MOON 🚀'], { width: 9, height: 3.4, bg: VOID, fg: LIME, border: LIME, borderW: 12 });
  tag.position.set(X(-2), 19.4, 9);
  g.add(tag);
  g.userData.flame = flame;
  g.userData.body = body;
  return g;
}

// ---------- giant green candlestick chart ----------
function candles() {
  const g = new THREE.Group();
  g.add(mesh(G.rbox(13, 0.7, 2.4, 0.2), toon('#2a1650'), 0, 0.35, 0));
  const bodies = [[0.8, 2.2], [1.8, 3.4], [2.9, 3.4], [2.6, 5], [4.4, 7], [6.4, 9.6], [9, 13.2], [12.4, 17]];
  const green = neon(LIME, 0.45), red = neon('#ff3b5c', 0.45), wick = toon('#d6ffe6');
  let last = null;
  bodies.forEach(([lo, hi], i) => {
    const x = -5.4 + i * 1.55;
    const isRed = i === 2;
    const sub = new THREE.Group();
    sub.position.set(x, lo, 0);
    sub.add(mesh(G.box(0.16, hi - lo + 1.2, 0.16), wick, 0, (hi - lo) / 2, 0));
    sub.add(mesh(G.rbox(1.1, hi - lo, 1.1, 0.1), isRed ? red : green, 0, (hi - lo) / 2, 0));
    g.add(sub);
    if (i === bodies.length - 1) last = sub;
  });
  const dip = textPanel('dip (bought)', { width: 3.2, height: 0.8, bg: null, fg: '#ff9fb4', stroke: VOID, strokeW: 10 });
  dip.position.set(-2.3, 2.1, 0.8);
  g.add(dip);
  const hdr = textPanel(['NVDA · 1D', 'number go up'], { width: 5, height: 2, bg: VOID, fg: LIME, border: LIME, borderW: 10 });
  hdr.position.set(-3.8, 8.5, 0.2);
  g.add(hdr);
  const arrow = mesh(G.cone(1.1, 1.8, 4), glow(LIME), last.position.x, 18.8, 0);
  g.add(arrow);
  g.userData.last = last;
  g.userData.arrow = arrow;
  return g;
}

// ---------- Roko's basilisk, coiled, crowned, going BOOM ----------
let boomTex = null;
function boomTexture() {
  if (boomTex) return boomTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const x = c.getContext('2d');
  const burst = (r0, r1, fill) => {
    x.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = i % 2 ? r0 : r1;
      x.lineTo(256 + Math.cos(a) * r * 1.3, 192 + Math.sin(a) * r);
    }
    x.closePath();
    x.fillStyle = fill; x.fill();
    x.lineWidth = 12; x.strokeStyle = '#2b1840'; x.stroke();
  };
  burst(120, 180, '#ffe14a');
  burst(80, 120, '#ff7a2a');
  x.font = `900 120px ${FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 16; x.strokeStyle = '#2b1840'; x.lineJoin = 'round';
  x.strokeText('BOOM', 256, 196);
  x.fillStyle = '#ffffff'; x.fillText('BOOM', 256, 196);
  boomTex = new THREE.CanvasTexture(c);
  boomTex.colorSpace = THREE.SRGBColorSpace;
  return boomTex;
}
function basilisk() {
  const g = new THREE.Group();
  const scaleA = toon('#3ddc84', { emissive: '#1b6b3f', emissiveIntensity: 0.4 });
  const scaleB = toon('#2aa866', { emissive: '#14502f', emissiveIntensity: 0.4 });
  const belly = toon('#d4ff7a');
  [[3.6, 1.1, 1.15], [3.0, 3.1, 1.05], [2.3, 4.9, 0.95]].forEach(([R, y, tube], i) => {
    const t = mesh(G.torus(R, tube, 22), i % 2 ? scaleB : scaleA, 0, y, 0);
    t.rotation.x = Math.PI / 2;
    g.add(t);
  });
  // neck rising in an S
  const neckPts = [[0.4, 5.8, 1.4], [1.0, 6.9, 1.6], [1.1, 8.0, 1.3], [0.6, 9.0, 1.2], [0.2, 9.9, 1.5]];
  neckPts.forEach((p, i) => g.add(mesh(G.sphere(1.05 - i * 0.05, 14), i % 2 ? scaleB : scaleA, ...p)));
  g.add(mesh(G.sphere(0.75, 10), belly, 0.5, 8.2, 2.1));
  const head = new THREE.Group();
  head.position.set(0.2, 11.1, 2.0);
  g.add(head);
  const hood = mesh(G.sphere(1.6, 16), scaleB, 0, -0.4, -0.9);
  hood.scale.set(1.5, 1.4, 0.35);
  head.add(hood);
  const skull = mesh(G.sphere(1.5, 18), scaleA, 0, 0, 0.2);
  skull.scale.set(1.15, 0.8, 1.35);
  head.add(skull);
  for (const s of [-1, 1]) {
    head.add(mesh(G.sphere(0.42, 12), glow('#fff27a'), s * 0.75, 0.5, 1.45));
    head.add(mesh(G.box(0.1, 0.5, 0.1), glow('#2b1840'), s * 0.75, 0.5, 1.84));
  }
  // forked tongue
  const tongue = new THREE.Group();
  tongue.position.set(0, -0.35, 2.15);
  const tm = toon('#ff3b5c');
  const t0 = mesh(G.box(0.14, 0.08, 1.0), tm, 0, 0, 0.5);
  const t1 = mesh(G.box(0.1, 0.08, 0.5), tm, 0.14, 0, 1.15); t1.rotation.y = 0.5;
  const t2 = mesh(G.box(0.1, 0.08, 0.5), tm, -0.14, 0, 1.15); t2.rotation.y = -0.5;
  tongue.add(t0, t1, t2);
  head.add(tongue);
  // crown
  const goldM = toon(GOLD, { emissive: '#7a5a00', emissiveIntensity: 0.4 });
  head.add(mesh(G.cyl(0.85, 0.95, 0.55, 12), goldM, 0, 1.35, 0.1));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    head.add(mesh(G.cone(0.22, 0.7, 6), goldM, Math.sin(a) * 0.8, 1.95, 0.1 + Math.cos(a) * 0.8));
  }
  head.add(mesh(G.sphere(0.2, 8), glow('#ff2a6a'), 0, 1.4, 1.0));
  const boom = canvasPlane(boomTexture(), 6.4, 4.8);
  boom.position.set(-3.4, 14.2, 1.6);
  g.add(boom);
  g.userData.head = head;
  g.userData.tongue = tongue;
  g.userData.boom = boom;
  return g;
}

// ---------- FLOP/s odometer ----------
let stripTex = null;
function digitStrip() {
  if (stripTex) return stripTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 640;
  const x = c.getContext('2d');
  x.fillStyle = '#05010f'; x.fillRect(0, 0, 64, 640);
  x.font = `700 54px ${FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = LIME;
  for (let d = 0; d < 10; d++) x.fillText(String(d), 32, d * 64 + 34);
  stripTex = new THREE.CanvasTexture(c);
  stripTex.colorSpace = THREE.SRGBColorSpace;
  stripTex.wrapT = THREE.RepeatWrapping;
  return stripTex;
}
function flopsMeter() {
  const g = new THREE.Group();
  const post = toon('#2a1650');
  g.add(mesh(G.box(0.4, 3.2, 0.4), post, -2.8, 1.6, -0.3));
  g.add(mesh(G.box(0.4, 3.2, 0.4), post, 2.8, 1.6, -0.3));
  g.add(mesh(G.rbox(8.2, 5.4, 0.5, 0.2), neon(PINK, 0.5), 0, 5.6, -0.3));
  g.add(mesh(G.box(7.6, 4.8, 0.1), glow(VOID), 0, 5.6, 0));
  const hdr = textPanel('1e30 FLOP/s', { width: 7.2, height: 1.6, bg: null, fg: CYAN, stroke: '#2b1840', strokeW: 8 });
  hdr.position.set(0, 7.15, 0.08);
  g.add(hdr);
  const strip = digitStrip();
  const digits = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const tex = strip.clone();
    tex.repeat.set(1, 0.1);
    tex.needsUpdate = true;
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    m.userData.outlineParameters = { visible: false };
    const d = new THREE.Mesh(G.plane(0.74, 1.15), m);
    d.position.set(-3.15 + i * 0.9, 5.7, 0.1);
    g.add(d);
    digits.push(tex);
  }
  digits.reverse(); // digits[0] = least significant
  const foot = textPanel('SAFETY EVALS: 3 FLOP/s', { width: 7.2, height: 0.9, bg: null, fg: '#ff9fd8' });
  foot.position.set(0, 4.3, 0.08);
  g.add(foot);
  g.userData.digits = digits;
  return g;
}

// ---------- overhead: OMEGA POINT, 3 EXITS ----------
function omegaSign() {
  const g = new THREE.Group();
  const pm = neon('#6a3cff', 0.35);
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(0.7, 13, 0.7, 0.15), pm, s * 10, 6.5, 0));
    g.add(mesh(G.cyl(0.9, 1.1, 0.5, 10), pm, s * 10, 0.25, 0));
  }
  g.add(mesh(G.rbox(21, 0.6, 0.6, 0.15), pm, 0, 13.2, -0.4));
  g.add(mesh(G.rbox(18.6, 5.4, 0.4, 0.2), toon('#ffffff'), 0, 10.5, -0.25));
  const p = textPanel(['Ω OMEGA POINT', '3 EXITS', '↖ UTOPIA   ↑ EXTINCTION   ↗ BOTH?'], { width: 18, height: 4.8, bg: '#14804a', fg: '#ffffff', border: '#ffffff', borderW: 10, radius: 24 });
  p.position.set(0, 10.5, 0);
  g.add(p);
  const tab = textPanel('EXIT 1e30', { width: 4.2, height: 1.2, bg: GOLD, fg: '#2b1840', border: '#2b1840', borderW: 8, radius: 16 });
  tab.position.set(6.2, 13.9, 0.05);
  g.add(tab);
  const bulbs = [];
  for (let k = 0; k < 12; k++) {
    const b = mesh(G.sphere(0.26, 8), glow(k % 2 ? CYAN : PINK), -8.8 + k * 1.6, 7.6, 0.1);
    bulbs.push(b); g.add(b);
  }
  g.userData.bulbs = bulbs;
  return g;
}

export default {
  id: 'latent',
  title: 'LATENT SPACE',
  subtitle: 'cos_sim(doom, moon) = 0.99',
  night: true,
  palette: {
    skyTop: '#12052e', skyBottom: '#b0248f', road: '#2a1858', ground: '#0a0420', kerb: CYAN,
    accent1: PINK, accent2: CYAN,
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    if (rel >= 110 && rel < 120) out.push({ kind: 'moonR', x: 48, rotY: -0.5, scale: 1.25 });
    if (rel >= 330 && rel < 340) out.push({ kind: 'moonL', x: -48, rotY: 0.5, scale: 1.25 });
    if ((rel >= 60 && rel < 70) || (rel >= 260 && rel < 270)) out.push({ kind: 'omega', x: 0 });
    for (const side of [-1, 1]) {
      const r = rng();
      if (r < 0.36) out.push({ kind: 'embed' + rng.int(0, 3), x: side * rng.range(12.5, 16), y: rng.range(-0.5, 1.5), rotY: rng.range(-0.5, 0.5) });
      else if (r < 0.5) out.push({ kind: 'candles', x: side * rng.range(17.5, 21), rotY: -side * 0.35 });
      else if (r < 0.56) out.push({ kind: 'basilisk', x: side * rng.range(17, 20), rotY: -side * 0.5 });
      else if (r < 0.66) out.push({ kind: 'flops', x: side * rng.range(11.5, 13), rotY: -side * 0.3 });
    }
    if (rng.chance(0.3)) out.push({ kind: 'embed' + rng.int(0, 3), x: rng.range(-3, 3), y: 7, dz: 5, rotY: rng.range(-0.4, 0.4) });
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('embed')) return embedCluster(+kind.slice(5) || 0);
    switch (kind) {
      case 'moonR': return moon(1);
      case 'moonL': return moon(-1);
      case 'candles': return candles();
      case 'basilisk': return basilisk();
      case 'flops': return flopsMeter();
      case 'omega': return omegaSign();
    }
  },
  animate(obj, kind, t, beatPhase, entry) {
    const k = kick(beatPhase);
    const ud = obj.userData;
    const sd = entry ? entry.seed : 0;
    if (ud.inner) {
      ud.inner.rotation.y = t * 0.7 + sd * 6.28;
      ud.inner.position.y = 4.6 + Math.sin(t * 2 + sd * 6.28) * 0.35;
      ud.inner.scale.setScalar(1 + 0.22 * k);
      ud.lbl.scale.setScalar(1 + 0.08 * k);
    } else if (ud.boom) {
      ud.boom.scale.setScalar(0.75 + 0.45 * k);
      ud.boom.rotation.z = Math.sin(t * 9) * 0.06;
      ud.head.rotation.z = Math.sin(t * 1.7 + sd * 6) * 0.18;
      ud.head.rotation.x = -0.25 * k;
      ud.tongue.scale.z = Math.max(0.2, Math.sin(t * 7)) * 1.2;
    } else if (ud.digits) {
      const V = t * 123457 + sd * 1e6;
      for (let i = 0; i < ud.digits.length; i++) {
        const v = (V / Math.pow(10, i)) % 10;
        ud.digits[i].offset.y = 0.9 - v * 0.1;
      }
    } else if (ud.last) {
      ud.last.scale.y = 1 + 0.18 * k;
      ud.arrow.position.y = 18.8 + 0.18 * k * 4.6 + Math.sin(t * 3) * 0.3;
      ud.arrow.rotation.y = t * 2;
    } else if (ud.flame) {
      ud.flame.scale.set(1 + 0.3 * k, 1 + 0.8 * k + Math.random() * 0.2, 1 + 0.3 * k);
      ud.body.scale.setScalar(1 + 0.025 * k);
    } else if (ud.bulbs) {
      const step = Math.floor(t * 8);
      ud.bulbs.forEach((b, i) => { b.visible = (i + step) % 3 !== 0; b.scale.setScalar(1 + 0.6 * k); });
    }
  },
  billboards: ['NVDA TO THE MOON 🚀', '1e30 FLOPS A SECOND', 'THAT WAS SAFE ENOUGH, WE RECKONED', "ROKO'S BASILISK IS WATCHING (say thanks)", 'ATTENTION IS ALL YOU NEED (and 1e30 FLOPS)'],
  billboardEvery: 70,
  billboardStyle: { bg: '#14062e', fg: CYAN, border: PINK, frame: PINK, postColor: '#2a1650' },
  hazards: ['hallucination', 'ratelimit'],
  enterLines: ['TO THE MOON!', 'ENTERING LATENT SPACE', 'NUMBER GO UP'],
};
