// Visuals for gameplay items (GPUs, halo rings, hazards, power-ups): pooled, spawned ahead by song time.
import * as THREE from 'three';
import { toon, glow, G, mesh, group, textPanel, textTexture } from './toolkit.js';
import { SPEED, FAR, LANE } from './track.js';
import { makeHazard, BASE } from './hazards.js';

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size = 3, opacity = 0.7) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

export function makeGPU() {
  const g = new THREE.Group();
  const card = new THREE.Group();
  card.add(mesh(G.rbox(1.9, 0.32, 1.1, 0.08), toon('#1f8a4c'), 0, 0, 0)); // PCB
  card.add(mesh(G.rbox(1.75, 0.34, 0.95, 0.1), toon('#2a2d3a'), 0, 0.3, 0)); // shroud
  for (const x of [-0.45, 0.45]) {
    const fan = mesh(G.cyl(0.36, 0.36, 0.08, 16), toon('#11131a'), x, 0.5, 0);
    const blades = mesh(G.box(0.62, 0.04, 0.12), toon('#7cffb0'), 0, 0.05, 0);
    fan.add(blades);
    const b2 = blades.clone(); b2.rotation.y = Math.PI / 2; fan.add(b2);
    fan.userData.fan = true;
    card.add(fan);
  }
  card.add(mesh(G.box(1.5, 0.08, 0.12), glow('#ffd23f'), 0, -0.02, 0.58)); // gold fingers
  card.add(mesh(G.box(1.8, 0.07, 0.07), glow('#7cffb0'), 0, 0.48, -0.5)); // RGB strip
  card.rotation.x = 1.05; // tilt so the fans face the camera
  g.add(card);
  g.userData.card = card;
  const gl = glowSprite('#7cffb0', 3.4, 0.45);
  gl.position.z = -0.3;
  g.add(gl);
  g.userData.glow = gl;
  return g;
}

export function makeRing() {
  const g = new THREE.Group();
  const t = mesh(G.torus(2.4, 0.24, 56), glow('#ffe066'), 0, 0, 0);
  g.add(t);
  const t2 = mesh(G.torus(2.4, 0.36, 56), toon('#ffb800', { transparent: true, opacity: 0.35, outline: false }), 0, 0, 0);
  g.add(t2);
  const gl = glowSprite('#ffe680', 8.2, 0.32);
  g.add(gl);
  g.userData.inner = t;
  return g;
}

const POWER_COLORS = { magnet: '#4aa8ff', shield: '#5affd0', scale: '#ff5ca8', rain: '#b18cff' };
export const POWER_NAMES = { magnet: 'RLHF MAGNET', shield: 'SAFETY SHIELD', scale: 'SCALING LAW', rain: 'COMPUTE RAIN' };
export const POWER_DESC = {
  magnet: 'GPUs come to you 👍',
  shield: 'the safety team has your back (once)',
  scale: 'SCALE IS ALL YOU NEED (3x GPUs)',
  rain: 'it is raining compute',
};
export function makePowerup(type) {
  const g = new THREE.Group();
  const icon = new THREE.Group();
  const col = POWER_COLORS[type];
  if (type === 'magnet') {
    // thumbs up
    icon.add(mesh(G.rbox(1.0, 0.9, 0.8, 0.25), toon('#ffd0a0'), 0, 0, 0));
    const th = mesh(G.capsule(0.2, 0.6), toon('#ffd0a0'), -0.3, 0.75, 0);
    th.rotation.z = 0.2;
    icon.add(th);
    icon.add(mesh(G.rbox(0.5, 1.0, 0.85, 0.15), toon('#4aa8ff'), 0.6, -0.1, 0));
  } else if (type === 'shield') {
    icon.add(mesh(G.sphere(0.95, 18), toon('#5affd0', { transparent: true, opacity: 0.55 }), 0, 0, 0));
    const p = textPanel('SAFE', { width: 1.3, height: 0.6, bg: '#ffffff', fg: '#0a7a5a', border: '#0a7a5a', borderW: 10 });
    p.position.z = 0.97;
    icon.add(p);
  } else if (type === 'scale') {
    const p = new THREE.Group();
    p.add(mesh(G.rbox(1.6, 1.4, 0.2, 0.08), toon('#ffffff'), 0, 0, 0));
    for (let i = 0; i < 5; i++) p.add(mesh(G.box(0.22, 0.15 + i * i * 0.05, 0.25), toon('#ff5ca8'), -0.55 + i * 0.27, -0.55 + (0.15 + i * i * 0.05) / 2, 0.1));
    const arrow = mesh(G.cone(0.2, 0.4, 3), toon('#ff5ca8'), 0.62, 0.55, 0.12);
    arrow.rotation.z = -0.6;
    p.add(arrow);
    icon.add(p);
  } else {
    for (let i = 0; i < 5; i++) icon.add(mesh(G.sphere(0.4 + (i % 2) * 0.15, 12), toon('#ffffff'), -0.8 + i * 0.4, (i % 2) * 0.2, 0));
    for (let i = 0; i < 4; i++) icon.add(mesh(G.box(0.25, 0.08, 0.15), toon('#1f8a4c'), -0.6 + i * 0.4, -0.75 - (i % 2) * 0.3, 0));
  }
  g.add(icon);
  g.userData.icon = icon;
  // spinning cage
  const cage = mesh(G.torus(1.35, 0.07, 32), glow(col), 0, 0, 0);
  g.add(cage);
  const cage2 = cage.clone(); cage2.rotation.y = Math.PI / 2; g.add(cage2);
  g.userData.cage = [cage, cage2];
  g.add(glowSprite(col, 4.5, 0.55));
  return g;
}

/**
 * Keeps 3D objects in sync with the level items: spawns them when within FAR, positions them on the road,
 * animates idle/collected/missed states, recycles behind the camera.
 */
export class Entities {
  constructor(scene, track, level) {
    this.scene = scene;
    this.track = track;
    this.level = level;
    this.pools = new Map();
    this.live = new Set();
    this.lists = [
      { arr: level.notes, kind: 'gpu', y: 1.15 },
      { arr: level.rings, kind: 'ring', y: 2.2 },
      { arr: level.hazards, kind: 'hazard', y: 0 },
      { arr: level.powerups, kind: 'power', y: 1.4 },
    ];
    this.cursors = this.lists.map(() => 0);
  }

  _get(key, make) {
    const p = this.pools.get(key);
    if (p && p.length) return p.pop();
    return make();
  }
  _release(item) {
    const o = item.obj;
    if (!o) return;
    this.scene.remove(o);
    const key = o.userData.poolKey;
    if (!this.pools.has(key)) this.pools.set(key, []);
    this.pools.get(key).push(o);
    item.obj = null;
    this.live.delete(item);
  }

  reset(songTime) {
    for (const it of [...this.live]) this._release(it);
    this.lists.forEach((l, i) => {
      let c = 0;
      while (c < l.arr.length && l.arr[c].t < songTime - 0.5) c++;
      this.cursors[i] = c;
    });
  }

  spawnItem(it, kind, y) {
    let key, make;
    if (kind === 'gpu') { key = 'gpu'; make = makeGPU; }
    else if (kind === 'ring') { key = 'ring'; make = makeRing; }
    else if (kind === 'hazard') { key = 'hz:' + it.type; make = () => makeHazard(it.type); }
    else { key = 'pw:' + it.type; make = () => makePowerup(it.type); }
    const o = this._get(key, make);
    o.userData.poolKey = key;
    o.visible = true;
    it.obj = o;
    it.kind = kind;
    it.baseY = y;
    it.state = it.state || 'live';
    it.stateT = 0;
    this.scene.add(o);
    this.live.add(it);
  }
  /** add an extra item (compute rain, hallucinations) outside the level lists */
  addItem(it, kind) {
    const l = this.lists.find((x) => x.kind === kind);
    this.spawnItem(it, kind, l ? l.y : 1.15);
  }

  update(songTime, dt, beatPhase) {
    const ahead = songTime + FAR / SPEED;
    // spawn
    this.lists.forEach((l, li) => {
      let c = this.cursors[li];
      while (c < l.arr.length && l.arr[c].t <= ahead) {
        const it = l.arr[c];
        if (!it.obj && !it.done) this.spawnItem(it, l.kind, l.y);
        c++;
      }
      this.cursors[li] = c;
    });

    // place + animate
    for (const it of this.live) {
      const o = it.obj;
      const zf = it.t * SPEED;
      if (zf < songTime * SPEED - 8) { this._release(it); continue; } // behind the camera
      it.stateT += dt;
      // collected things ride along with the kart so the camera never drives into them
      if (it.state === 'got') it.dz = (songTime - it.t) * SPEED;
      const x = it.flyX ?? it.x;
      this.track.worldPos(zf + (it.dz || 0), x, it.baseY, o.position);
      o.scale.setScalar(1);
      o.rotation.set(0, 0, 0);
      if (it.kind === 'gpu') {
        const card = o.userData.card;
        if (it.state === 'live') {
          o.position.y += Math.sin(songTime * 4 + it.t) * 0.15;
          card.rotation.z = Math.sin(songTime * 3 + it.t * 2) * 0.35;
          const pulse = 1 + 0.12 * Math.pow(1 - beatPhase, 3);
          o.scale.setScalar(pulse * (it.fake ? 0.9 : 1));
          card.children.forEach((ch) => { if (ch.userData.fan) ch.rotation.y += dt * 18; });
        } else if (it.state === 'got') {
          // pop: squash up and vanish
          const k = it.stateT / 0.25;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          o.position.y += k * 2.5;
          o.scale.set(1 + k * 0.8, 1 - k * 0.6 + 0.6 * Math.sin(k * 3), 1 + k * 0.8);
        } else if (it.state === 'missed') {
          // sad deflate
          const k = Math.min(1, it.stateT / 0.5);
          o.scale.set(1 + k * 0.3, Math.max(0.05, 1 - k), 1 + k * 0.3);
          o.position.y -= k * 0.9;
        }
      } else if (it.kind === 'ring') {
        o.rotation.z = songTime * 1.5;
        if (it.state === 'live') {
          const pulse = 1 + 0.1 * Math.pow(1 - beatPhase, 3);
          o.scale.setScalar(pulse);
        } else if (it.state === 'got') {
          const k = it.stateT / 0.35;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          o.scale.setScalar(1 + k * 1.5);
        } else if (it.state === 'missed') {
          const k = Math.min(1, it.stateT / 1);
          o.position.y += k * 2;
          o.position.x += k * (it.x > 0 ? 3 : -3);
          o.scale.setScalar(1 - k * 0.6);
        }
      } else if (it.kind === 'hazard') {
        const w = it.w * LANE * 2;
        o.scale.set(w / BASE, 1, 1);
        // sit flat on the road, facing the driver
        o.traverse((ch) => {
          if (ch.userData.spin) ch.rotation.z = -songTime * 6;
          if (ch.userData.wiggle !== undefined) ch.rotation.z = (ch.userData.wiggle - 1.5) * 0.5 + Math.sin(songTime * 5 + ch.userData.wiggle) * 0.4;
        });
        if (it.state === 'hit' || it.state === 'blocked') {
          const k = Math.min(1, it.stateT / 0.6);
          o.position.y += k * 6;
          o.position.x += (it.x > 0 ? 1 : -1) * k * 10;
          o.rotation.z = k * 4;
          o.rotation.x = -k * 2;
        }
      } else if (it.kind === 'power') {
        o.userData.icon.rotation.y = songTime * 2.5;
        o.userData.cage[0].rotation.x = songTime * 2;
        o.userData.cage[1].rotation.y = songTime * 2;
        o.position.y += Math.sin(songTime * 3) * 0.25;
        if (it.state === 'got') {
          const k = it.stateT / 0.3;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          o.scale.setScalar(1 + k * 2);
        }
      }
    }
  }
}
