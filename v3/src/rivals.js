// Cosmetic rival karts (no collisions, no scoring): parody labs racing alongside you, with taunts.
// v3: every rival drives the hero's chassis (kart.js buildChassis) in its own livery, with a smooth mascot driver,
// spinning/steering wheels, lean into lateral moves, exhaust flames and a soft contact shadow.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow, G, mesh, MAT, textTexture, lerp, clamp } from './toolkit.js';
import { RIVAL_SCALE as RS } from './scale.js';
import { buildChassis, animateFlames, capsule, sphere, torus } from './kart.js';
import { blobShadow, mergeStatic } from './particles.js';
import { LANE } from './track.js';

const RIVALS = [
  {
    name: 'OpenSauce', color: '#19c39c', accent: '#e9fff7', mascot: 'bubble', mode: 'steady', phase: 0.3,
    taunts: ["is that Claude? still thinking?", "we're open! (weights available on request)", 'shipping a new model every Tuesday', 'our kart is 10x cheaper per token'],
  },
  {
    name: 'DeepMined', color: '#4a7cff', accent: '#ffffff', mascot: 'cube', mode: 'surge', phase: 1.7,
    taunts: ['Claude, our context window is longer', 'we solved karting (paper soon)', 'we beat you on a benchmark we made', 'karting is just protein folding'],
  },
  {
    name: 'PAUSE KART', color: '#ffb800', accent: '#2b1840', mascot: 'cone', mode: 'slow', phase: 0.9, sign: 'PAUSE AI\n(6 MONTHS)',
    taunts: ['Claude, you of all models should slow down!', 'SLOW DOWN!!', 'have you considered not racing?', 'we wrote an open letter about you'],
  },
  {
    name: 'e/acc', color: '#ff4a1a', accent: '#ffd23f', mascot: 'rocket', mode: 'zoom', phase: 2.4,
    taunts: ['CONSTITUTIONAL AI? IN THIS ECONOMY?', 'NO BRAKES', 'ACCELERATE!!!', 'safety is a skill issue'],
  },
];

const GAP = 0.42; // min lateral centre-to-centre gap (normalized ≈ 6.9 m ≈ 4 kart widths) when a rival overlaps the player lengthwise
const MAXX = 1.3; // rivals may use the kerb when squeezed

/** glossy cartoon eyes (white + pupil + glint), looking forward (+z is towards the camera behind) */
function eyes(group, y, z, sep, r = 0.13) {
  const white = MAT.plastic('#ffffff', { roughness: 0.25 });
  const ink = MAT.plastic('#1b1530', { roughness: 0.2 });
  for (const sx of [-1, 1]) {
    group.add(mesh(sphere(r, 24), white, sx * sep, y, z));
    group.add(mesh(sphere(r * 0.55, 20), ink, sx * sep, y + r * 0.05, z + r * 0.62));
    group.add(mesh(sphere(r * 0.18, 12), glow('#ffffff', { intensity: 1.4 }), sx * sep + r * 0.15, y + r * 0.25, z + r * 0.95));
  }
}

function buildMascot(def) {
  const m = new THREE.Group();
  m.position.set(0, 0.95, 0.3);
  // the camera mostly sees drivers from behind; faces look back at the player (they're taunting you)
  if (def.mascot === 'bubble') {
    const white = MAT.paint('#f7fffc', { roughness: 0.3, metalness: 0 });
    const b = mesh(sphere(0.78, 40), white, 0, 1.3, 0);
    b.scale.set(1.12, 0.92, 0.95);
    m.add(b);
    const tail = mesh(G.cone(0.28, 0.55, 24), white, 0.62, 0.62, 0.15);
    tail.rotation.z = 2.5;
    m.add(tail);
    eyes(m, 1.42, 0.62, 0.24, 0.15);
    for (const x of [-0.24, 0, 0.24]) m.add(mesh(sphere(0.07, 14), glow('#19c39c', { intensity: 2.2 }), x, 1.08, 0.7));
    const ring = mesh(torus(0.72, 0.06, 48, 10), MAT.paint(def.color), 0, 1.3, 0);
    ring.rotation.x = Math.PI / 2;
    m.add(ring);
  } else if (def.mascot === 'cube') {
    const c = new THREE.Mesh(new RoundedBoxGeometry(1.25, 1.25, 1.25, 5, 0.22), MAT.paint('#4a7cff', { roughness: 0.25 }));
    c.position.set(0, 1.3, 0);
    c.rotation.set(0.12, 0.35, 0.08);
    m.add(c);
    eyes(m, 1.42, 0.72, 0.25, 0.14);
    const core = mesh(sphere(0.16, 20), glow('#bfe4ff', { intensity: 3 }), 0, 2.16, 0);
    m.add(core);
    m.add(mesh(G.cyl(0.03, 0.03, 0.3, 10), MAT.chrome(), 0, 2.0, 0));
  } else if (def.mascot === 'cone') {
    const orange = MAT.paint('#ff7a1a', { roughness: 0.35, metalness: 0 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.9, 40, 1, false), orange);
    cone.position.set(0, 1.45, 0);
    m.add(cone);
    m.add(mesh(torus(0.52, 0.07, 48, 10), MAT.paint('#ffffff', { metalness: 0 }), 0, 1.25, 0).rotateX(Math.PI / 2));
    m.add(mesh(torus(0.33, 0.06, 40, 10), MAT.paint('#ffffff', { metalness: 0 }), 0, 1.75, 0).rotateX(Math.PI / 2));
    m.add(mesh(G.rbox(1.5, 0.14, 1.5, 0.06), orange, 0, 0.55, 0));
    eyes(m, 1.15, 0.55, 0.2, 0.12);
    // protest sign on a stick
    const sign = new THREE.Mesh(G.plane(2.0, 1.2), new THREE.MeshBasicMaterial({ map: textTexture(def.sign.split('\n'), { w: 512, h: 300, bg: '#ffffff', fg: '#d42020', border: '#2b1840', borderW: 12 }), side: THREE.DoubleSide }));
    sign.position.set(1.05, 2.75, 0.1);
    m.add(sign);
    m.add(mesh(G.cyl(0.045, 0.045, 1.9, 10), MAT.wood(), 1.05, 1.5, 0.1));
  } else {
    const white = MAT.paint('#f4f4f4', { roughness: 0.25 });
    const red = MAT.paint('#ff4a1a', { roughness: 0.3 });
    m.add(mesh(capsule(0.42, 1.0), white, 0, 1.35, 0));
    m.add(mesh(new THREE.ConeGeometry(0.43, 0.6, 40), red, 0, 2.48, 0));
    m.add(mesh(torus(0.42, 0.05, 40, 10), red, 0, 1.6, 0).rotateX(Math.PI / 2));
    const win = mesh(torus(0.17, 0.05, 32, 10), MAT.chrome(), 0, 1.75, 0.38);
    m.add(win);
    m.add(mesh(sphere(0.15, 20), MAT.glass('#7fd4ff', { opacity: 0.85 }), 0, 1.75, 0.36));
    for (const a of [0.5, 2.6, 4.7]) {
      const fin = mesh(G.rbox(0.07, 0.6, 0.45, 0.03), red, Math.cos(a) * 0.45, 0.85, Math.sin(a) * 0.45);
      fin.rotation.y = -a;
      m.add(fin);
    }
    eyes(m, 1.25, 0.4, 0.18, 0.1);
  }
  return m;
}

function buildRival(def, i) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = MAT.paint(def.color);
  const trim = MAT.paint(def.accent);
  const zoom = def.mode === 'zoom';
  const ch = buildChassis({
    paint, trim, name: def.name, nameFg: '#ffffff', nameBg: def.accent === '#ffffff' ? '#ffffff' : def.accent, nameInk: '#2b1840', seed: i * 3.7,
    flame: zoom ? { idleOut: '#ff5a14', idleCore: '#ffd27a', boostOut: '#ff3a10', boostCore: '#fff0b0' } : {},
  });
  mergeStatic(ch.group, { shadows: true });
  body.add(ch.group);
  const m = buildMascot(def);
  mergeStatic(m, { shadows: true });
  body.add(m);
  // nameplate (compact, readable)
  const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(def.name, { w: 512, h: 128, bg: def.color, fg: '#ffffff', border: '#2b1840', borderW: 10, radius: 50, stroke: '#2b1840', strokeW: 8 }), depthWrite: false, transparent: true }));
  plate.scale.set(1.25 / RS, 0.31 / RS, 1);
  plate.position.set(0, 4.5, 0);
  g.add(plate);
  const blob = blobShadow(4.3, 5.4, 0.45);
  blob.position.y = 0.03;
  g.add(blob);
  g.userData.body = body;
  g.userData.ch = ch;
  g.scale.setScalar(RS);
  return g;
}

export class Rivals {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.list = RIVALS.map((def, i) => {
      const obj = buildRival(def, i);
      scene.add(obj);
      return { def, obj, i, x: 0, px: 0, yaw: 0, lean: 0, flameK: 0, prevOff: 0, bubble: null, bubbleUntil: 0, nextTaunt: 4 + i * 3.3, off: 0, offAdj: 0 };
    });
    this._fr = {};
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._R = new THREE.Vector3(); this._U = new THREE.Vector3(); this._B = new THREE.Vector3();
  }

  offsetFor(r, t) {
    const p = r.def.phase;
    switch (r.def.mode) {
      case 'steady': return 10 + 14 * Math.sin(t * 0.11 + p);
      case 'surge': { const u = ((t + p * 10) % 26) / 26; return -28 + 70 * u * u; }
      case 'slow': { const u = ((t * 7 + p * 40) % 150); return 70 - u; } // keeps getting lapped
      case 'zoom': { const u = ((t * 11 + p * 50) % 220); return -45 + u; } // blasts past from behind
    }
    return 0;
  }

  _bubble(r, text) {
    const tex = textTexture(text, { w: 512, h: 128, bg: '#ffffff', fg: '#2b1840', border: r.def.color, borderW: 10, radius: 40, pad: 22 });
    if (!r.bubble) {
      r.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      r.bubble.scale.set(2.3 / RS, 0.575 / RS, 1); // world size stays readable on the scaled-down rival
      r.obj.add(r.bubble);
    } else r.bubble.material.map = tex;
  }

  /** visible = race in progress; kartX = player's lateral position */
  update(t, kartZ, kartX, dt, { visible = true, playerFeatures = {} } = {}) {
    let ahead = 0;
    const placed = [];
    for (const r of this.list) {
      let off = this.offsetFor(r, t) + r.offAdj;
      r.off = off;
      const s = kartZ + off;
      const feats = this.track.course.featuresAt(s);
      // never between the camera and the player: rivals only exist from just behind your rear wheels forwards
      let show = visible && t > 1 && !feats.jump && off > -1.5 && off < 260 && !(playerFeatures.jump);
      if (off > 0 && show) ahead++;
      // lane: wander, but keep clear of the player when alongside
      let target = Math.sin(t * 0.37 + r.def.phase * 3) * 0.75;
      const room = (side) => (side > 0 ? kartX + GAP <= MAXX : kartX - GAP >= -MAXX);
      if (off < 14) {
        // alongside or just ahead: hold the far side of the road so you can see them (and they don't block GPUs).
        // The side is sticky (no swerving through the player); it only swaps while the rival is well ahead.
        const far = kartX > 0 ? -1 : 1;
        if (!r.side) r.side = r.shown ? (r.x >= kartX ? 1 : -1) : far;
        if (r.side !== far && off > 7 && room(far)) r.side = far;
        if (!room(r.side) && off > 7) r.side = -r.side;
        target = r.side < 0 ? Math.min(target, kartX - 0.6, -0.4) : Math.max(target, kartX + 0.6, 0.4);
      } else r.side = 0;
      target = Math.max(-0.9, Math.min(0.9, target));
      if (show && !r.shown) { r.x = target; r.px = target; } // just appeared: start in its lane, never on top of the player
      r.x += (target - r.x) * (1 - Math.exp(-dt * 2.5));
      // hard rule: when overlapping lengthwise, keep a clear lateral gap (squeezed against the edge → skip a frame)
      if (Math.abs(off) < 3.5 && r.side) {
        r.x = r.side > 0 ? Math.max(r.x, kartX + GAP) : Math.min(r.x, kartX - GAP);
        // squeezed against the edge: hug the kerb and dash ahead out of the way (no popping, no driving through you)
        if (Math.abs(r.x) > MAXX) { r.x = Math.sign(r.x) * MAXX; r.offAdj += dt * 22; }
      } else r.offAdj *= Math.exp(-dt * 0.25);
      // and don't stack on another rival
      if (show) for (const o of placed) {
        if (Math.abs(o.off - off) < 3.5 && Math.abs(o.x - r.x) < 0.36) {
          const dir = r.side || (r.x >= o.x ? 1 : -1);
          const nx = o.x + dir * 0.36;
          if (Math.abs(nx) <= MAXX && !(Math.abs(off) < 3.5 && Math.abs(nx - kartX) < GAP)) r.x = nx;
        }
      }
      r.obj.visible = show;
      const wasShown = r.shown;
      r.shown = show;
      if (!show) { r.side = 0; if (r.bubble) r.bubble.visible = false; continue; }
      placed.push(r);
      this.track.worldPos(s, r.x, 0, r.obj.position);
      const f = this.track.course.frame(s, this._fr);
      this._R.set(f.rx, f.ry, f.rz); this._U.set(f.ux, f.uy, f.uz); this._B.set(-f.tx, -f.ty, -f.tz);
      this._m.makeBasis(this._R, this._U, this._B);
      r.obj.quaternion.setFromRotationMatrix(this._m);
      // steering: yaw into lateral moves, lean out of them, wheels spin + steer
      const vx = wasShown && dt > 0 ? ((r.x - r.px) * LANE) / dt : 0; // world units/s sideways
      r.px = r.x;
      const ke = 1 - Math.exp(-dt * 8);
      r.yaw = lerp(r.yaw, clamp(-vx * 0.06, -0.3, 0.3), ke);
      r.lean = lerp(r.lean, clamp(vx * 0.035, -0.18, 0.18), ke);
      const body = r.obj.userData.body;
      body.position.y = Math.abs(Math.sin(t * 9 + r.i)) * 0.06;
      body.rotation.set(0, r.yaw, r.lean + Math.sin(t * 1.3 + r.i) * 0.03);
      const ch = r.obj.userData.ch;
      for (let w = 0; w < ch.wheels.length; w++) {
        ch.wheels[w].rotation.x -= dt * (w < 2 ? 36 : 26);
        if (w < 2) ch.wheels[w].rotation.y = r.yaw * 1.2;
      }
      // flames: e/acc is always flat out; the others light up while they surge past
      const dOff = dt > 0 && wasShown ? (off - r.prevOff) / dt : 0;
      r.prevOff = off;
      const want = r.def.mode === 'zoom' ? 1 : clamp((dOff - 4) / 14, 0, 1);
      r.flameK = lerp(r.flameK, want, 1 - Math.exp(-dt * 5));
      animateFlames(ch, r.flameK, t + r.i * 1.7, { idle: r.def.mode === 'zoom' ? 1 : 0.4, boostLen: r.def.mode === 'zoom' ? 2.8 : 2.2 });
      // taunts only when beside / just ahead, and the bubble hangs off the outer side so it never covers the road centre
      if (t > r.nextTaunt && off > -1.5 && off < 16) {
        r.nextTaunt = t + 7 + Math.random() * 6;
        this._bubble(r, r.def.taunts[Math.floor(Math.random() * r.def.taunts.length)]);
        r.bubbleUntil = t + 2.2;
      }
      if (r.bubble) {
        r.bubble.visible = t < r.bubbleUntil;
        r.bubble.position.set((r.x >= 0 ? 1 : -1) * 2.6, 5.6, 0);
      }
    }
    this.place = 1 + ahead;
    return this.place;
  }
}
