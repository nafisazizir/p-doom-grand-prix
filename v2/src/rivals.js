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

function bubbleSprite(text, color) {
  const tex = textTexture(text, { w: 512, h: 128, bg: '#ffffff', fg: '#2b1840', border: color, borderW: 10, radius: 40, pad: 22 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(4.6, 1.15, 1);
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
  plate.scale.set(2.6, 0.65, 1);
  plate.position.set(0, 3.7, 0);
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
      return { def, obj, i, x: 0, bubble: null, bubbleUntil: 0, nextTaunt: 4 + i * 3.3, off: 0 };
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
    for (const r of this.list) {
      let off = this.offsetFor(r, t);
      if (r.def.mode === 'slow' || r.def.mode === 'zoom') { /* wraps */ }
      r.off = off;
      const s = kartZ + off;
      const feats = this.track.course.featuresAt(s);
      // never between the camera and the player: rivals only exist from just behind your rear wheels forwards
      const show = visible && t > 1 && !feats.jump && off > -1.5 && off < 260 && !(playerFeatures.jump);
      r.obj.visible = show;
      if (!show) { if (r.bubble) r.bubble.visible = false; continue; }
      if (off > 0) ahead++;
      // lane: wander, but keep clear of the player when alongside
      let target = Math.sin(t * 0.37 + r.def.phase * 3) * 0.75;
      // alongside or just ahead: take the far side of the road so you can see them (and they don't block GPUs)
      if (off < 14) target = kartX > 0 ? Math.min(target, kartX - 0.95, -0.55) : Math.max(target, kartX + 0.95, 0.55);
      target = Math.max(-0.9, Math.min(0.9, target));
      r.x += (target - r.x) * (1 - Math.exp(-dt * 2.5));
      const pos = this.track.worldPos(s, r.x, 0, r.obj.position);
      const f = this.track.course.frame(s, this._fr);
      this._R.set(f.rx, f.ry, f.rz); this._U.set(f.ux, f.uy, f.uz); this._B.set(-f.tx, -f.ty, -f.tz);
      this._m.makeBasis(this._R, this._U, this._B);
      r.obj.quaternion.setFromRotationMatrix(this._m);
      const body = r.obj.userData.body;
      body.position.y = Math.abs(Math.sin(t * 9 + r.i)) * 0.06;
      body.rotation.z = Math.sin(t * 1.3 + r.i) * 0.05;
      body.traverse((o) => { if (o.userData.flame) o.scale.y = 0.7 + Math.random() * 0.6; });
      // taunts when near
      if (t > r.nextTaunt && Math.abs(off) < 30) {
        r.nextTaunt = t + 7 + Math.random() * 6;
        const text = r.def.taunts[Math.floor(Math.random() * r.def.taunts.length)];
        if (r.bubble) r.obj.remove(r.bubble);
        r.bubble = bubbleSprite(text, r.def.color);
        r.bubble.position.set(0, 5.6, 0);
        r.obj.add(r.bubble);
        r.bubbleUntil = t + 3;
      }
      if (r.bubble) r.bubble.visible = t < r.bubbleUntil;
      void pos;
    }
    this.place = 1 + ahead;
    return this.place;
  }
}
