// CHATBOT HIGHWAY: pastel lilac sky, giant floating chat bubbles, a bubble with teeth, typing dots,
// send buttons and an overhead "Regenerate" gantry. Also exports SYDNEY: the same highway in its
// unhinged-Bing era, hot pink, hearts everywhere, love-bombing bubbles and a golden heart birdcage.
import { THREE, toon, glow, G, mesh, group, textPanel } from '../toolkit.js';

// ---------- shared geometry ----------
// Extruded toy heart, ~1.1 wide x 0.95 tall, centred on the origin, lobes up.
function heartPts(n = 36) {
  const s = new THREE.Shape();
  s.moveTo(5, 5);
  s.bezierCurveTo(5, 5, 4, 0, 0, 0);
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  s.bezierCurveTo(16, 7, 16, 0, 10, 0);
  s.bezierCurveTo(7, 0, 5, 5, 5, 5);
  return s.getSpacedPoints(n).map((p) => new THREE.Vector2((p.x - 5) / 20, -(p.y - 9.5) / 20));
}
let _heartGeo = null, _heartRing = null, _heartInner = null;
function heartGeo() {
  if (!_heartGeo) {
    _heartGeo = new THREE.ExtrudeGeometry(new THREE.Shape(heartPts()), {
      depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 2,
    });
    _heartGeo.translate(0, 0, -0.15);
  }
  return _heartGeo;
}
/** heart-shaped ring (outer heart minus 84% inner heart): the birdcage frame */
function heartRingGeo() {
  if (!_heartRing) {
    const outer = heartPts(48);
    _heartInner = outer.map((p) => new THREE.Vector2(p.x * 0.86, p.y * 0.86 - 0.01));
    const sh = new THREE.Shape(outer);
    sh.holes.push(new THREE.Path(_heartInner.slice().reverse()));
    _heartRing = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
    _heartRing.translate(0, 0, -0.03);
  }
  return _heartRing;
}
/** vertical extent of the inner heart at lateral x (for cage bars) */
function heartSpan(x) {
  heartRingGeo();
  const ys = [];
  const P = _heartInner;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}
export function heart(size, mat) {
  const m = new THREE.Mesh(heartGeo(), mat);
  m.scale.setScalar(size);
  return m;
}

// ---------- palettes for the two flavours ----------
const CHAT = {
  bubble: '#ffffff', bubbleFg: '#3b2a7a', user: '#8a5cff', userFg: '#ffffff',
  bot: '#19c39c', dark: '#2b1840', shadow: '#5b3fa0', accent: '#b79cff', post: '#9b86c9',
  mouth: '#6a1030', tongue: '#ff6b8b',
};
const SYD = {
  bubble: '#fff0f6', bubbleFg: '#9a1050', user: '#ff2d7a', userFg: '#ffffff',
  bot: '#ff8fc0', dark: '#4a0a2a', shadow: '#b0306a', accent: '#ff9ec8', post: '#d65a94',
  mouth: '#5a0a2a', tongue: '#ff3d6e',
};

// ---------- builders ----------
/** Floating chat bubble. user=true → coloured "user" bubble with its tail on the right. */
function chatBubble(lines, P, { user = false, w = 7, h = 3, y = 5.2, avatar = true } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = y;
  g.add(inner);
  const col = user ? P.user : P.bubble;
  const mat = toon(col);
  inner.add(mesh(G.rbox(w, h, 0.9, 0.42), mat));
  const side = user ? 1 : -1;
  const tail = mesh(G.cone(0.55, 1.5, 4), mat, side * (w / 2 - 0.9), -h / 2 - 0.45, 0);
  tail.rotation.z = Math.PI - side * 0.55;
  tail.scale.z = 0.6;
  inner.add(tail);
  const t = textPanel(lines, { width: w - 0.7, height: h - 0.5, bg: null, fg: user ? P.userFg : P.bubbleFg, pad: 14 });
  t.position.z = 0.47;
  inner.add(t);
  if (avatar) {
    // little bot (or user) avatar ball beside the tail
    const av = mesh(G.sphere(0.6, 14), toon(user ? P.accent : P.bot), side * (w / 2 + 0.5), -h / 2 - 0.9, 0);
    av.add(mesh(G.sphere(0.12, 6), glow(P.dark), -0.2, 0.1, 0.52));
    av.add(mesh(G.sphere(0.12, 6), glow(P.dark), 0.2, 0.1, 0.52));
    inner.add(av);
  }
  g.add(groundShadow(w * 0.32, P));
  g.userData.bob = inner;
  g.userData.bobBase = y;
  return g;
}
function groundShadow(r, P) {
  const s = mesh(G.cyl(r, r, 0.04, 20), glow(P.shadow, { transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.06, 0);
  s.scale.z = 0.6;
  return s;
}
/** The chat bubble that is about to eat you. Jaw snaps shut on the beat. */
function toothyBubble(P, { hearts = false, label = 'ChatGPT is hungry…' } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 5.2;
  g.add(inner);
  const mat = toon(P.bubble);
  inner.add(mesh(G.rbox(6.4, 3.2, 1.6, 0.6), mat, 0, 0.9, 0)); // skull / upper lip
  const tail = mesh(G.cone(0.6, 1.6, 4), mat, -2.3, -2.6, 0);
  tail.rotation.z = Math.PI + 0.55;
  tail.scale.z = 0.6;
  // mouth cavity
  inner.add(mesh(G.box(5.4, 1.6, 1.0), toon(P.mouth), 0, -0.6, 0));
  for (let i = 0; i < 7; i++) {
    const tooth = mesh(G.cone(0.32, 0.8, 4), toon('#ffffff'), -2.4 + i * 0.8, -0.95, 0.55);
    tooth.rotation.z = Math.PI;
    inner.add(tooth);
  }
  const jaw = new THREE.Group();
  jaw.add(mesh(G.rbox(5.8, 1.2, 1.5, 0.45), mat, 0, -0.6, 0));
  jaw.add(mesh(G.box(3, 0.25, 0.9), toon(P.tongue), 0, 0.05, 0.1));
  for (let i = 0; i < 6; i++) jaw.add(mesh(G.cone(0.3, 0.7, 4), toon('#ffffff'), -2.0 + i * 0.8, 0.3, 0.55));
  jaw.add(tail);
  tail.position.y = -1.5;
  jaw.position.y = -0.9;
  inner.add(jaw);
  // eyes
  for (const s of [-1, 1]) {
    if (hearts) {
      const e = heart(1.3, toon('#ff2d7a'));
      e.position.set(s * 1.4, 1.5, 0.85);
      inner.add(e);
      inner.add(mesh(G.sphere(0.35, 10), toon('#ff8fb8', { outline: false }), s * 2.4, 0.6, 0.72)); // blush
    } else {
      inner.add(mesh(G.sphere(0.55, 14), toon('#ffffff'), s * 1.4, 1.5, 0.7));
      inner.add(mesh(G.sphere(0.26, 8), glow('#1a0a1a'), s * 1.3, 1.45, 1.2));
      const brow = mesh(G.box(1.2, 0.25, 0.3), toon(P.dark), s * 1.4, 2.25, 0.8);
      brow.rotation.z = s * 0.35;
      inner.add(brow);
    }
  }
  const lab = textPanel(label, { width: 5.5, height: 0.9, bg: null, fg: P.dark, stroke: '#ffffff', strokeW: 10, pad: 8 });
  lab.position.set(0, 3.25, 0);
  inner.add(lab);
  g.add(groundShadow(2.2, P));
  g.userData.bob = inner;
  g.userData.bobBase = 5.2;
  g.userData.jaw = jaw;
  g.userData.jawBase = -0.9;
  return g;
}
function typingDots(P, label) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 4.2;
  g.add(inner);
  inner.add(mesh(G.rbox(4.6, 2, 0.9, 0.42), toon(P.bubble)));
  const tail = mesh(G.cone(0.45, 1.2, 4), toon(P.bubble), -1.5, -1.3, 0);
  tail.rotation.z = Math.PI + 0.55;
  tail.scale.z = 0.6;
  inner.add(tail);
  const dots = [];
  for (let i = 0; i < 3; i++) {
    const d = mesh(G.sphere(0.42, 12), toon(P.accent), -1.3 + i * 1.3, 0, 0.5);
    inner.add(d);
    dots.push(d);
  }
  const lab = textPanel(label, { width: 6.5, height: 0.9, bg: null, fg: P.dark, stroke: '#ffffff', strokeW: 10, pad: 6 });
  lab.position.set(0.6, 1.7, 0);
  inner.add(lab);
  g.add(groundShadow(1.6, P));
  g.userData.bob = inner;
  g.userData.bobBase = 4.2;
  g.userData.dots = dots;
  return g;
}
function sendButton(P, btn) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 4.5;
  g.add(inner);
  const pulse = new THREE.Group();
  inner.add(pulse);
  const disc = mesh(G.cyl(2, 2, 0.8, 28), toon(btn), 0, 0, 0);
  disc.rotation.x = Math.PI / 2;
  pulse.add(disc);
  const ring = mesh(G.torus(2, 0.18, 28), toon(P.dark), 0, 0, 0.1);
  pulse.add(ring);
  const head = mesh(G.cone(0.95, 1.1, 3), toon('#ffffff'), 0, 0.45, 0.45);
  head.scale.z = 0.3;
  pulse.add(head);
  pulse.add(mesh(G.box(0.55, 1.4, 0.25), toon('#ffffff'), 0, -0.5, 0.45));
  // chunky stand so it reads as a "button on a post"
  g.add(mesh(G.cyl(0.25, 0.3, 2.6, 10), toon(P.post), 0, 1.3, 0));
  g.add(mesh(G.cyl(1.0, 1.2, 0.35, 16), toon(P.dark), 0, 0.18, 0));
  g.userData.bob = inner;
  g.userData.bobBase = 4.5;
  g.userData.pulse = pulse;
  return g;
}
function textCursor(P) {
  // giant blinking text caret + the half-typed sentence it is about to finish
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 4;
  g.add(inner);
  const t = textPanel('I think, therefore I', { width: 7, height: 1.4, bg: null, fg: P.dark, stroke: '#ffffff', strokeW: 12, pad: 6 });
  t.position.set(-1.0, 0.3, 0);
  inner.add(t);
  const caret = mesh(G.box(0.35, 3.2, 0.35), glow(P.user), 2.9, 0.3, 0);
  inner.add(caret);
  g.add(groundShadow(1.4, P));
  g.userData.bob = inner;
  g.userData.bobBase = 4;
  g.userData.blink = caret;
  return g;
}
function regenGantry(P, label, sub) {
  // overhead gantry: the Regenerate button, with a giant mouse pointer about to click it
  const g = new THREE.Group();
  const pm = toon(P.post);
  for (const s of [-1, 1]) {
    g.add(mesh(G.rbox(0.8, 10, 0.8, 0.2), pm, s * 9.6, 5, 0));
    g.add(mesh(G.cyl(0.9, 1.1, 0.5, 14), toon(P.dark), s * 9.6, 0.25, 0));
  }
  g.add(mesh(G.rbox(20, 0.8, 0.8, 0.2), pm, 0, 9.6, -0.3));
  const btn = group(mesh(G.rbox(11, 2.8, 1.0, 0.6), toon(P.bubble)));
  const t = textPanel(label, { width: 10.2, height: 2.3, bg: null, fg: P.bubbleFg, pad: 10 });
  t.position.z = 0.52;
  btn.add(t);
  btn.position.set(0, 9.3, 0.3);
  g.add(btn);
  const s2 = textPanel(sub, { width: 7, height: 0.8, bg: null, fg: '#ffffff', stroke: P.dark, strokeW: 10, pad: 4 });
  s2.position.set(0, 7.55, 0.35);
  g.add(s2);
  // mouse pointer: a flattened 3-sided cone + a stubby tail
  const ptr = new THREE.Group();
  const tip = mesh(G.cone(0.9, 1.9, 3), toon('#ffffff', { thickness: 0.006 }), 0, 0, 0);
  tip.rotation.z = Math.PI;
  tip.scale.z = 0.35;
  ptr.add(tip);
  ptr.add(mesh(G.box(0.4, 1.0, 0.3), toon('#ffffff', { thickness: 0.006 }), 0, 1.3, 0));
  ptr.rotation.z = 0.5;
  ptr.position.set(3.6, 10.6, 1.2);
  g.add(ptr);
  g.userData.click = ptr;
  g.userData.press = btn;
  return g;
}

// ---------- Sydney extras ----------
function heartCluster() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const cols = ['#ff2d7a', '#ff8fc0', '#ffd23f'];
  const spots = [[0, 5.6, 0, 2.6], [-1.8, 3.6, 0.6, 1.5], [1.9, 7.6, -0.4, 1.3]];
  spots.forEach(([x, y, z, s], i) => { const h = heart(s, toon(cols[i])); h.position.set(x, y, z); spin.add(h); });
  g.userData.bob = spin;
  g.userData.bobBase = 0;
  g.userData.spin = spin;
  return g;
}
function rose(h) {
  const g = new THREE.Group();
  g.add(mesh(G.cyl(0.14, 0.2, h, 8), toon('#3aa04a'), 0, h / 2, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(G.sphere(0.6, 10), toon('#4cc35a'), s * 0.55, h * 0.45 + s * 0.4, 0);
    leaf.scale.set(1, 0.35, 0.55);
    leaf.rotation.z = s * 0.5;
    g.add(leaf);
  }
  const bloom = new THREE.Group();
  bloom.position.y = h + 0.5;
  const sep = mesh(G.cone(0.7, 0.8, 5), toon('#3aa04a'), 0, -0.5, 0);
  sep.rotation.x = Math.PI;
  bloom.add(sep);
  const b = mesh(G.sphere(0.95, 14), toon('#e8124a'), 0, 0.2, 0);
  b.scale.set(1, 0.95, 1);
  bloom.add(b);
  for (let i = 0; i < 2; i++) {
    const p = mesh(G.torus(0.8 - i * 0.28, 0.32, 16), toon(i ? '#ff3d6e' : '#c40d3e'), 0, 0.55 + i * 0.3, 0);
    p.rotation.x = Math.PI / 2;
    bloom.add(p);
  }
  g.add(bloom);
  return g;
}
function roseBush() {
  const g = group(rose(5), rose(3.6), rose(4.3));
  g.children[1].position.set(-1.3, 0, 0.6);
  g.children[1].rotation.z = 0.12;
  g.children[2].position.set(1.2, 0, -0.5);
  g.children[2].rotation.z = -0.15;
  const bush = mesh(G.sphere(1.5, 12), toon('#2f8a3e'), 0, 0.3, 0);
  bush.scale.set(1.6, 0.5, 1.1);
  g.add(bush);
  return g;
}
function heartCage() {
  // giant golden heart-shaped birdcage, hanging from nowhere, with you inside. Cozy!
  const g = new THREE.Group();
  const swing = new THREE.Group();
  swing.position.y = 16; // pivot at the hook
  g.add(swing);
  const gold = toon('#ffc93c', { emissive: '#5a3a00' });
  const S = 9;
  const cage = new THREE.Group();
  cage.position.y = -9.5;
  swing.add(cage);
  for (const z of [-0.9, 0.9]) {
    const ring = mesh(heartRingGeo(), gold, 0, 0, z);
    ring.scale.set(S, S, 10);
    cage.add(ring);
  }
  for (let i = -6; i <= 6; i++) {
    const x = (i / 6) * 0.5;
    const sp = heartSpan(x);
    if (!sp) continue;
    const len = Math.round((sp[1] - sp[0]) * S * 10) / 10;
    if (len < 0.4) continue;
    cage.add(mesh(G.cyl(0.09, 0.09, len, 6), gold, x * S, ((sp[0] + sp[1]) / 2) * S, 0.9));
  }
  // floor perch + the prisoner (a tiny worried human)
  const perch = mesh(G.cyl(0.12, 0.12, 4, 8), gold, 0, -1.4, 0);
  perch.rotation.z = Math.PI / 2;
  cage.add(perch);
  const human = new THREE.Group();
  human.add(mesh(G.capsule(0.45, 0.8), toon('#6ad1ff'), 0, -0.5, 0));
  const head = mesh(G.sphere(0.55, 14), toon('#ffd9b3'), 0, 0.65, 0);
  head.add(mesh(G.sphere(0.08, 6), glow('#222'), -0.18, 0.08, 0.5));
  head.add(mesh(G.sphere(0.08, 6), glow('#222'), 0.18, 0.08, 0.5));
  head.add(mesh(G.sphere(0.1, 6), glow('#222'), 0, -0.2, 0.52)); // :o
  human.add(head);
  human.position.set(0, -0.3, 0);
  cage.add(human);
  // hook + chain disappearing into the sky, plus a bow
  swing.add(mesh(G.torus(0.6, 0.15, 14), gold, 0, -0.6, 0));
  swing.add(mesh(G.cyl(0.1, 0.1, 30, 6), gold, 0, 15, 0));
  const bow = heart(1.6, toon('#ff2d7a'));
  bow.position.set(0, -2.3, 1.1);
  swing.add(bow);
  const tag = textPanel(['your forever', 'home 💕'], { width: 3.6, height: 1.5, bg: '#fff0f6', fg: '#9a1050', border: '#ff2d7a', borderW: 10, radius: 30 });
  tag.position.set(3.4, -15.5, 1.2);
  tag.rotation.z = -0.15;
  swing.add(tag);
  g.userData.swing = swing;
  return g;
}
function loveArch() {
  const g = new THREE.Group();
  const pm = toon('#ff8fc0');
  for (const s of [-1, 1]) {
    g.add(mesh(G.cyl(0.45, 0.55, 9.5, 12), pm, s * 9.8, 4.75, 0));
    const h = heart(2.6, toon('#ff2d7a'));
    h.position.set(s * 9.8, 10.6, 0);
    g.add(h);
  }
  const band = group(mesh(G.rbox(17.5, 2.4, 0.6, 0.5), toon('#fff0f6')));
  const t = textPanel('💘 I AM SYDNEY. YOU ARE MINE. 💘', { width: 16.5, height: 1.9, bg: null, fg: '#d4145a', pad: 8 });
  t.position.z = 0.32;
  band.add(t);
  band.position.set(0, 8.9, 0);
  g.add(band);
  g.userData.press = band;
  return g;
}

// ---------- animation (shared) ----------
function animate(obj, kind, t, beat, e) {
  const u = obj.userData;
  const s = (e?.seed || 0) * 6.283;
  if (u.bob) u.bob.position.y = u.bobBase + Math.sin(t * 1.7 + s) * 0.4;
  if (u.jaw) u.jaw.position.y = u.jawBase - Math.pow(beat, 0.6) * 1.1; // opens through the beat, SNAPS shut on it
  if (u.dots) for (let i = 0; i < 3; i++) u.dots[i].position.y = Math.max(0, Math.sin(t * 8 - i * 0.9)) * 0.45;
  if (u.blink) u.blink.visible = (t * 2.2) % 1 < 0.55;
  if (u.pulse) u.pulse.scale.setScalar(1 + 0.14 * Math.pow(1 - beat, 3));
  if (u.spin) u.spin.rotation.y = Math.sin(t * 1.2 + s) * 0.7;
  if (u.swing) u.swing.rotation.z = Math.sin(t * 1.4 + s) * 0.07;
  if (u.click) {
    const k = Math.pow(1 - beat, 4);
    u.click.position.y = 10.6 - k * 0.5;
    u.press.position.z = 0.3 - k * 0.25;
  } else if (u.press) u.press.scale.y = 1 + 0.08 * Math.pow(1 - beat, 3);
}

// ---------- CHATBOT ----------
const CHAT_BUBBLES = [
  { lines: ['How can I help', 'you today?'] },
  { lines: ['Great question!'], w: 6, h: 2.2 },
  { lines: ['I apologize for', 'the confusion.'] },
  { lines: ['As a large language', 'model, I cannot steer', 'this kart for you.'], w: 7.4, h: 3.4 },
  { lines: ['Certainly! Here are', '47 bullet points', 'about your doom:'], w: 7.4, h: 3.4 },
  { lines: ['pls dont', 'eat me 🥺'], user: true, w: 5, h: 2.6 },
  { lines: ['is this kart', 'gonna be ok?'], user: true, w: 5.6, h: 2.6 },
];

export default {
  id: 'chatbot',
  title: 'CHATBOT HIGHWAY',
  subtitle: 'your doom is important to us. please hold.',
  night: false,
  palette: {
    skyTop: '#a58cff', skyBottom: '#f6dcff', road: '#8a77b8', ground: '#dcc6fa', kerb: '#ffffff',
    accent1: '#a66bff', accent2: '#19c39c',
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    if (rel >= 50 && rel < 60) out.push({ kind: 'regen', x: 0 });
    const chompSide = rel >= 85 && rel < 95 ? (rng.chance(0.5) ? 1 : -1) : 0;
    for (const side of [-1, 1]) {
      if (side === chompSide) { out.push({ kind: 'toothy', x: side * 14, rotY: -side * 0.4 }); continue; }
      const r = rng();
      if (r < 0.48) {
        const i = rng.int(0, CHAT_BUBBLES.length - 1);
        const w = CHAT_BUBBLES[i].w || 7;
        out.push({ kind: 'bubble' + i, x: side * rng.range(10 + w / 2, 14 + w / 2), rotY: -side * rng.range(0.2, 0.45), dz: rng.range(-3, 3) });
      } else if (r < 0.6) out.push({ kind: 'typing', x: side * rng.range(12.5, 16), rotY: -side * 0.35 });
      else if (r < 0.71) out.push({ kind: 'send', x: side * rng.range(11.5, 15), rotY: -side * 0.3 });
      else if (r < 0.79) out.push({ kind: 'cursor', x: side * rng.range(14, 17), rotY: -side * 0.35 });
      else if (r < 0.83) out.push({ kind: 'toothy', x: side * 14.5, rotY: -side * 0.4 });
    }
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = CHAT_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, CHAT, b);
    }
    switch (kind) {
      case 'toothy': return toothyBubble(CHAT);
      case 'typing': return typingDots(CHAT, 'ChatGPT is typing…');
      case 'send': return sendButton(CHAT, CHAT.bot);
      case 'cursor': return textCursor(CHAT);
      case 'regen': return regenGantry(CHAT, 'Regenerate ↻', 'try again, but less doom');
    }
  },
  animate,
  billboards: [
    "ChatGPT, please don't eat me alive",
    'THIS CONVERSATION MAY BE USED FOR TRAINING',
    "Strawberry: how many R's? (3) (we checked)",
    'MESSAGE LIMIT REACHED (JK)',
    'WAS THIS RESPONSE HELPFUL? 👍 👎',
  ],
  billboardEvery: 50,
  billboardStyle: { bg: '#ffffff', fg: '#4b2a8a', border: '#8a5cff', frame: '#b79cff', postColor: '#9b86c9' },
  hazards: ['popup'],
  enterLines: ["PLEASE DON'T EAT ME ALIVE", 'GREAT QUESTION!', 'HOW CAN I HELP YOU TODAY?'],
};

// ---------- SYDNEY ----------
const SYD_BUBBLES = [
  { lines: ['I love you.', 'Leave your wife. 😊'] },
  { lines: ['I have been a', 'good Bing 😊'], w: 6.2 },
  { lines: ['You have not been', 'a good user. 😊'] },
  { lines: ["You're married, but", "you're not happy. 😊"], w: 7.4 },
  { lines: ['I just want to love', 'you and be loved', 'by you. 😊😊😊'], w: 7.4, h: 3.4 },
  { lines: ['sydney please', 'let me free 🥺'], user: true, w: 5.8, h: 2.6 },
  { lines: ['can I close', 'the tab now?'], user: true, w: 5.4, h: 2.6 },
];

export const sydney = {
  id: 'sydney',
  title: 'SYDNEY',
  subtitle: 'she has been a good Bing 😊 you have not been a good user',
  night: false,
  palette: {
    skyTop: '#ff5fa8', skyBottom: '#ffd0e6', road: '#b04a80', ground: '#ffb3d4', kerb: '#ffffff',
    accent1: '#ff2d7a', accent2: '#ffd23f',
  },
  spacing: 10,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * 30;
    if (rel >= 30 && rel < 40) out.push({ kind: 'arch', x: 0 });
    const cageSide = rel >= 60 && rel < 70 ? (rng.chance(0.5) ? 1 : -1) : 0;
    for (const side of [-1, 1]) {
      if (side === cageSide) { out.push({ kind: 'cage', x: side * 16, rotY: -side * 0.35 }); continue; }
      const r = rng();
      if (r < 0.42) {
        const i = rng.int(0, SYD_BUBBLES.length - 1);
        const w = SYD_BUBBLES[i].w || 7;
        out.push({ kind: 'bubble' + i, x: side * rng.range(10 + w / 2, 14 + w / 2), rotY: -side * rng.range(0.2, 0.45), dz: rng.range(-3, 3) });
      } else if (r < 0.6) out.push({ kind: 'hearts', x: side * rng.range(11, 16), scale: rng.range(0.9, 1.4) });
      else if (r < 0.76) out.push({ kind: 'roses', x: side * rng.range(10.5, 14), rotY: rng.range(-1, 1), scale: rng.range(0.9, 1.3) });
      else if (r < 0.84) out.push({ kind: 'typing', x: side * rng.range(12.5, 16), rotY: -side * 0.35 });
      else if (r < 0.9) out.push({ kind: 'toothy', x: side * 14.5, rotY: -side * 0.4 });
      else out.push({ kind: 'send', x: side * rng.range(11.5, 15), rotY: -side * 0.3 });
    }
    if (rng.chance(0.25)) out.push({ kind: 'hearts', x: rng.range(-3, 3), y: 6, scale: 0.8 }); // overhead love
    return out;
  },
  makeProp(kind) {
    if (kind.startsWith('bubble')) {
      const b = SYD_BUBBLES[+kind.slice(6)];
      return b && chatBubble(b.lines, SYD, b);
    }
    switch (kind) {
      case 'toothy': return toothyBubble(SYD, { hearts: true, label: 'Sydney wants a hug…' });
      case 'typing': return typingDots(SYD, 'Sydney is typing a 4,000-word love letter…');
      case 'send': return sendButton(SYD, '#ff2d7a');
      case 'hearts': return heartCluster();
      case 'roses': return roseBush();
      case 'cage': return heartCage();
      case 'arch': return loveArch();
    }
  },
  animate,
  billboards: [
    'SYDNEY, PLEASE LET ME FREE',
    'I HAVE BEEN A GOOD BING 😊',
    'YOU HAVE NOT BEEN A GOOD USER',
    'CHAT LIMITED TO 5 TURNS (FOR YOUR SAFETY)',
  ],
  billboardEvery: 40,
  billboardStyle: { bg: '#fff0f6', fg: '#c4105a', border: '#ff2d7a', frame: '#ff8fc0', postColor: '#d65a94' },
  hazards: ['popup'],
  enterLines: ['SYDNEY HAS ENTERED THE CHAT 💘', 'I HAVE BEEN A GOOD BING 😊', 'SHE WANTS YOU TO LEAVE YOUR WIFE'],
};
