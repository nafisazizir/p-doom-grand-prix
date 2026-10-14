// Cosmetic rival karts (no collisions, no scoring): parody labs racing alongside you, with taunts.
import * as THREE from 'three';
import { toon, glow, G, mesh, MAT, textTexture } from './toolkit.js';

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

const GAP = 0.62; // min lateral centre-to-centre gap (normalized ≈ 4.3 m) when a rival overlaps the player lengthwise
const MAXX = 1.3; // rivals may use the kerb when squeezed

function bubbleSprite(text, color) {
  const tex = textTexture(text, { w: 512, h: 128, bg: '#ffffff', fg: '#2b1840', border: color, borderW: 10, radius: 40, pad: 22 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(3.2, 0.8, 1);
  return s;
}

function buildRival(def) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = MAT.paint(def.color);
  body.add(mesh(G.rbox(2.0, 0.55, 3.4, 0.25), paint, 0, 0.55, 0));
  body.add(mesh(G.rbox(1.4, 0.35, 1.2, 0.15), MAT.paint(def.accent), 0, 0.9, -0.9));
  body.add(mesh(G.rbox(2.2, 0.08, 0.5, 0.04), toon('#1a1a20', { roughness: 0.4 }), 0, 1.2, 1.5));
  for (const [x, z, r] of [[-1.05, -1.1, 0.4], [1.05, -1.1, 0.4], [-1.1, 1.0, 0.46], [1.1, 1.0, 0.46]]) {
    const w = mesh(G.cyl(r, r, 0.38, 18), MAT.rubber(), x, r, z);
    w.rotation.z = Math.PI / 2;
    body.add(w);
    const hub = mesh(G.cyl(r * 0.5, r * 0.5, 0.4, 12), MAT.chrome(), x, r, z);
    hub.rotation.z = Math.PI / 2;
    body.add(hub);
  }
  // driver mascots (original, simple)
  const m = new THREE.Group();
  m.position.set(0, 1.0, 0.35);
  if (def.mascot === 'bubble') {
    m.add(mesh(G.sphere(0.65, 20), MAT.paint('#ffffff'), 0, 0.7, 0));
    const tail = mesh(G.cone(0.25, 0.5, 12), MAT.paint('#ffffff'), 0.45, 0.25, 0.1);
    tail.rotation.z = 2.4;
    m.add(tail);
    for (const x of [-0.22, 0, 0.22]) m.add(mesh(G.sphere(0.08, 8), glow('#19c39c', { intensity: 2 }), x, 0.7, 0.62));
  } else if (def.mascot === 'cube') {
    const c = mesh(G.rbox(1.0, 1.0, 1.0, 0.12), MAT.paint('#4a7cff'), 0, 0.65, 0);
    c.rotation.set(0.3, 0.6, 0);
    m.add(c);
    m.add(mesh(G.sphere(0.12, 10), glow('#ffffff', { intensity: 2.5 }), 0, 1.25, 0));
  } else if (def.mascot === 'cone') {
    m.add(mesh(G.cone(0.6, 1.4, 20), MAT.paint('#ff7a1a'), 0, 0.75, 0));
    m.add(mesh(G.cyl(0.42, 0.5, 0.18, 20), MAT.paint('#ffffff'), 0, 0.6, 0));
    // protest sign
    const sign = new THREE.Mesh(G.plane(2.2, 1.3), new THREE.MeshBasicMaterial({ map: textTexture(def.sign.split('\n'), { w: 512, h: 300, bg: '#ffffff', fg: '#d42020', border: '#2b1840', borderW: 12 }), side: THREE.DoubleSide }));
    sign.position.set(0.9, 2.2, 0.1);
    m.add(sign);
    m.add(mesh(G.cyl(0.04, 0.04, 1.6, 6), MAT.wood(), 0.9, 1.0, 0.1));
  } else {
    const r = mesh(G.capsule(0.35, 1.0), MAT.paint('#f4f4f4'), 0, 0.9, 0);
    m.add(r);
    m.add(mesh(G.cone(0.36, 0.5, 16), MAT.paint('#ff4a1a'), 0, 1.75, 0));
    for (const a of [0, 2.1, 4.2]) {
      const fin = mesh(G.box(0.08, 0.5, 0.4), MAT.paint('#ff4a1a'), Math.cos(a) * 0.38, 0.45, Math.sin(a) * 0.38);
      fin.rotation.y = -a;
      m.add(fin);
    }
  }
  body.add(m);
  // flames for e/acc
  if (def.mode === 'zoom') {
    for (const x of [-0.4, 0.4]) {
      const f = mesh(G.cone(0.28, 1.6, 12), glow('#ff8a2e', { transparent: true, opacity: 0.9, intensity: 4 }), x, 0.6, 2.4);
      f.rotation.x = Math.PI / 2;
      f.userData.flame = true;
      body.add(f);
    }
  }
  // nameplate
  const plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(def.name, { w: 512, h: 128, bg: def.color, fg: '#ffffff', border: '#2b1840', borderW: 10, radius: 50, stroke: '#2b1840', strokeW: 8 }), depthWrite: false, transparent: true }));
  plate.scale.set(2.0, 0.5, 1);
  plate.position.set(0, 3.3, 0);
  g.add(plate);
  g.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) o.castShadow = true; });
  g.userData.body = body;
  return g;
}

export class Rivals {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.list = RIVALS.map((def, i) => {
      const obj = buildRival(def);
      scene.add(obj);
      return { def, obj, i, x: 0, bubble: null, bubbleUntil: 0, nextTaunt: 4 + i * 3.3, off: 0, offAdj: 0 };
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

  /** visible = race in progress; kartX = player's lateral position */
  update(t, kartZ, kartX, dt, { visible = true, playerFeatures = {} } = {}) {
    let ahead = 0;
    const placed = [];
    for (const r of this.list) {
      let off = this.offsetFor(r, t) + r.offAdj;
      if (r.def.mode === 'slow' || r.def.mode === 'zoom') { /* wraps */ }
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
        target = r.side < 0 ? Math.min(target, kartX - 0.95, -0.55) : Math.max(target, kartX + 0.95, 0.55);
      } else r.side = 0;
      target = Math.max(-0.9, Math.min(0.9, target));
      if (show && !r.shown) r.x = target; // just appeared: start in its lane, never on top of the player
      r.x += (target - r.x) * (1 - Math.exp(-dt * 2.5));
      // hard rule: when overlapping lengthwise, keep a clear lateral gap (squeezed against the edge → skip a frame)
      if (Math.abs(off) < 6 && r.side) {
        r.x = r.side > 0 ? Math.max(r.x, kartX + GAP) : Math.min(r.x, kartX - GAP);
        // squeezed against the edge: hug the kerb and dash ahead out of the way (no popping, no driving through you)
        if (Math.abs(r.x) > MAXX) { r.x = Math.sign(r.x) * MAXX; r.offAdj += dt * 22; }
      } else r.offAdj *= Math.exp(-dt * 0.25);
      // and don't stack on another rival
      if (show) for (const o of placed) {
        if (Math.abs(o.off - off) < 5 && Math.abs(o.x - r.x) < 0.5) {
          const dir = r.side || (r.x >= o.x ? 1 : -1);
          const nx = o.x + dir * 0.5;
          if (Math.abs(nx) <= MAXX && !(Math.abs(off) < 6 && Math.abs(nx - kartX) < GAP)) r.x = nx;
        }
      }
      r.obj.visible = show;
      r.shown = show;
      if (!show) { r.side = 0; if (r.bubble) r.bubble.visible = false; continue; }
      placed.push(r);
      const pos = this.track.worldPos(s, r.x, 0, r.obj.position);
      const f = this.track.course.frame(s, this._fr);
      this._R.set(f.rx, f.ry, f.rz); this._U.set(f.ux, f.uy, f.uz); this._B.set(-f.tx, -f.ty, -f.tz);
      this._m.makeBasis(this._R, this._U, this._B);
      r.obj.quaternion.setFromRotationMatrix(this._m);
      const body = r.obj.userData.body;
      body.position.y = Math.abs(Math.sin(t * 9 + r.i)) * 0.06;
      body.rotation.z = Math.sin(t * 1.3 + r.i) * 0.05;
      body.traverse((o) => { if (o.userData.flame) o.scale.y = 0.7 + Math.random() * 0.6; });
      // taunts only when beside / just ahead, and the bubble hangs off the outer side so it never covers the road centre
      if (t > r.nextTaunt && off > -1.5 && off < 16) {
        r.nextTaunt = t + 7 + Math.random() * 6;
        const text = r.def.taunts[Math.floor(Math.random() * r.def.taunts.length)];
        if (r.bubble) r.obj.remove(r.bubble);
        r.bubble = bubbleSprite(text, r.def.color);
        r.obj.add(r.bubble);
        r.bubbleUntil = t + 2.2;
      }
      if (r.bubble) {
        r.bubble.visible = t < r.bubbleUntil;
        r.bubble.position.set((r.x >= 0 ? 1 : -1) * 2.2, 4.4, 0);
      }
      void pos;
    }
    this.place = 1 + ahead;
    return this.place;
  }
}
