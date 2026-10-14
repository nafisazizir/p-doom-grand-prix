// Visuals for gameplay items (GPUs, halo rings, hazards, power-ups): pooled, spawned ahead by song time.
// v3: glossy MK-scaled pickups. GPU = glossy graphics card with spinning fans + soft glow + lane disc; halo = smooth
// polished-gold torus with a soft volumetric glow (chains show DO/RE/MI); power-up = iridescent item box with the icon inside.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glow, G, mesh, MAT, physical, textTexture } from './toolkit.js';
import { SPEED, FAR, LANE } from './track.js';
import { makeHazard, BASE } from './hazards.js';
import { ITEM } from './scale.js';
import { glowSprite, mergeStatic } from './particles.js';
export { glowSprite } from './particles.js';
const GS = ITEM.gpuScale, RK = ITEM.ringR / 3.0, PS = ITEM.powerScale;

const _fy = {};
const cache = new Map();
const once = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const smooth = (k) => k * k * (3 - 2 * k);

/** soft annulus texture for lane discs */
function ringTexture() {
  return once('ringTex', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    gr.addColorStop(0.72, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.82, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// GPU
function fanGeo() {
  return once('fanBlades', () => {
    // 9 swept blades as one geometry
    const geos = [];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.BoxGeometry(0.11, 0.03, 0.27, 1, 1, 1);
      b.translate(0, 0, 0.16);
      b.rotateZ(0.35); // blade pitch
      b.rotateY((i / 9) * Math.PI * 2 + 0.3);
      geos.push(b.toNonIndexed());
    }
    const g = new THREE.BufferGeometry();
    const pos = [], nor = [];
    for (const b of geos) { pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  });
}
export function makeGPU() {
  const g = new THREE.Group();
  const card = new THREE.Group();
  const pcb = MAT.paint('#1f8a4c', { roughness: 0.35, metalness: 0.1, clearcoat: 1 });
  const shroud = MAT.paint('#262a36', { roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12 });
  const silver = MAT.chrome('#d8dee8');
  const gold = MAT.metal('#ffc83a', { roughness: 0.22 });
  card.add(mesh(G.rbox(1.9, 0.1, 1.1, 0.04), pcb, 0, -0.12, 0)); // PCB
  card.add(mesh(G.rbox(1.82, 0.34, 1.0, 0.13), shroud, 0, 0.1, 0)); // shroud
  card.add(mesh(G.rbox(1.84, 0.05, 0.06, 0.02), silver, 0, 0.26, 0.47)); // edge trim
  card.add(mesh(G.rbox(1.84, 0.05, 0.06, 0.02), silver, 0, 0.26, -0.47));
  card.add(mesh(G.rbox(0.08, 0.5, 1.12, 0.03), silver, -0.95, 0.02, 0)); // IO bracket
  card.add(mesh(G.rbox(1.4, 0.06, 0.12, 0.02), gold, 0.1, -0.13, 0.58)); // gold fingers
  card.add(mesh(G.rbox(1.76, 0.05, 0.05, 0.02), glow('#7cffb0', { intensity: 3 }), 0, 0.2, 0.51)); // RGB strip (faces the camera)
  const fans = [];
  for (const x of [-0.45, 0.45]) {
    const fan = new THREE.Group();
    fan.position.set(x, 0.28, 0);
    fan.add(mesh(G.torus(0.37, 0.035, 40), silver, 0, 0, 0).rotateX(Math.PI / 2));
    fan.add(mesh(G.cyl(0.36, 0.36, 0.02, 40), MAT.matte('#0c0d12'), 0, -0.03, 0));
    const blades = new THREE.Group();
    blades.add(new THREE.Mesh(fanGeo(), MAT.plastic('#1b1e26', { roughness: 0.3 })));
    blades.add(mesh(G.cyl(0.11, 0.11, 0.05, 28), glow('#7cffb0', { intensity: 2.2 }), 0, 0.02, 0));
    blades.userData.keep = true;
    fan.add(blades);
    fans.push(blades);
    card.add(fan);
  }
  mergeStatic(card);
  card.rotation.x = 1.05; // tilt so the fans face the camera
  g.add(card);
  g.userData.card = card;
  g.userData.fans = fans;
  const gl = glowSprite('#7cffb0', 2.6, 0.32);
  gl.position.z = -0.3;
  g.add(gl);
  g.userData.glow = gl;
  // soft lane marker on the road under the chip, so you can read where it is
  const disc = new THREE.Mesh(G.plane(2.0, 2.0), once('gpuDisc', () => new THREE.MeshBasicMaterial({ map: ringTexture(), color: new THREE.Color('#7cffb0').multiplyScalar(1.3), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -ITEM.gpuY / GS + 0.05; // just above the road
  disc.userData.noAO = true;
  g.add(disc);
  g.userData.disc = disc;
  g.scale.setScalar(GS);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// HALO
const HALO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const HALO_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uA;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(f, 2.2) * uA * smoothstep(2.5, 9.0, length(vV)); // never wash over the lens
  gl_FragColor = vec4(uCol * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const NOTE = ['DO', 'RE', 'MI', 'FA', 'SOL', 'LA'];
const NOTE_COL = ['#ff6b8a', '#ffa64d', '#ffe14a', '#6dff9e', '#5ad8ff', '#b18cff'];
function noteTex(i) {
  return textTexture(NOTE[i] || 'LA', { w: 256, h: 128, bg: null, fg: '#ffffff', stroke: NOTE_COL[i] || '#ffb800', strokeW: 18, pad: 14 });
}
export function makeRing() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const goldMat = physical('#ffd04a', { metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#ff9d00', emissiveIntensity: 0.35 }).clone();
  goldMat.transparent = true;
  const tor = new THREE.Mesh(once('haloTorus', () => new THREE.TorusGeometry(3.0, 0.2, 28, 160)), goldMat);
  spin.add(tor);
  // hot inner rim line + soft volumetric glow shell
  spin.add(new THREE.Mesh(once('haloInner', () => new THREE.TorusGeometry(2.8, 0.045, 10, 160)), glow('#fff2b0', { intensity: 2.6 })));
  const glowU = { uCol: { value: new THREE.Color('#ffc640').multiplyScalar(1.1) }, uA: { value: 0.55 } };
  const shell = new THREE.Mesh(once('haloShell', () => new THREE.TorusGeometry(3.0, 0.5, 24, 128)), new THREE.ShaderMaterial({
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, uniforms: glowU, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  }));
  shell.renderOrder = 5;
  spin.add(shell);
  const gl = glowSprite('#ffe680', 7.6, 0.16);
  g.add(gl);
  // chain label (DO RE MI …) above the ring
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(0), transparent: true, depthWrite: false }));
  label.scale.set(2.2, 1.1, 1);
  label.position.y = 4.15;
  label.visible = false;
  g.add(label);
  g.userData = { spin, goldMat, glowU, glow: gl, label };
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// POWER-UP item box: iridescent translucent rounded cube with the icon inside
const BOX_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BOX_FRAG = /* glsl */ `
uniform float uTime, uA, uBack; uniform vec3 uTint;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  vec3 irid = 0.55 + 0.45 * cos(6.2831 * (f * 0.9 + (vP.x + vP.y * 0.6) * 0.18 + uTime * 0.25 + vec3(0.0, 0.33, 0.67)));
  // bright bevelled edges: where the normal leaves the face axes
  vec3 an = abs(normalize(vP));
  float edge = smoothstep(0.62, 0.8, 1.0 - max(an.x, max(an.y, an.z)) + 0.42);
  float a = (0.07 + pow(f, 2.0) * 0.55 + edge * 0.5) * uA * (1.0 - uBack * 0.55);
  vec3 col = mix(irid, uTint, 0.25) * (1.2 + edge * 1.4 + pow(f, 3.0));
  gl_FragColor = vec4(col * a, a * 0.35);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
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
  const P = (c) => MAT.plastic(c, { roughness: 0.25 });
  if (type === 'magnet') {
    // thumbs up
    icon.add(mesh(G.rbox(0.9, 0.8, 0.7, 0.25), P('#ffd0a0'), 0, 0, 0));
    const th = mesh(G.capsule(0.18, 0.5), P('#ffd0a0'), -0.27, 0.66, 0);
    th.rotation.z = 0.2;
    icon.add(th);
    icon.add(mesh(G.rbox(0.45, 0.9, 0.75, 0.14), P('#4aa8ff'), 0.55, -0.08, 0));
  } else if (type === 'shield') {
    icon.add(mesh(G.sphere(0.8, 32), MAT.glass('#5affd0', { opacity: 0.6 }), 0, 0, 0));
    const p = new THREE.Mesh(G.plane(1.1, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('SAFE', { w: 256, h: 116, bg: '#ffffff', fg: '#0a7a5a', border: '#0a7a5a', borderW: 10 }), transparent: true, side: THREE.DoubleSide }));
    p.position.z = 0.82;
    icon.add(p);
  } else if (type === 'scale') {
    const p = new THREE.Group();
    p.add(mesh(G.rbox(1.4, 1.2, 0.18, 0.08), P('#ffffff'), 0, 0, 0));
    for (let i = 0; i < 5; i++) { const h = 0.13 + i * i * 0.045; p.add(mesh(G.rbox(0.19, h, 0.22, 0.04), P('#ff5ca8'), -0.48 + i * 0.24, -0.48 + h / 2, 0.1)); }
    const arrow = mesh(G.cone(0.18, 0.36, 24), P('#ff5ca8'), 0.55, 0.48, 0.12);
    arrow.rotation.z = -0.6;
    p.add(arrow);
    icon.add(p);
  } else {
    for (let i = 0; i < 5; i++) icon.add(mesh(G.sphere(0.34 + (i % 2) * 0.13, 24), P('#ffffff'), -0.7 + i * 0.35, (i % 2) * 0.18 + 0.1, 0));
    for (let i = 0; i < 4; i++) icon.add(mesh(G.rbox(0.22, 0.08, 0.14, 0.03), MAT.paint('#1f8a4c'), -0.52 + i * 0.35, -0.55 - (i % 2) * 0.25, 0));
  }
  mergeStatic(icon);
  g.add(icon);
  g.userData.icon = icon;
  const boxGeo = once('itemBox', () => new RoundedBoxGeometry(2.6, 2.6, 2.6, 6, 0.5));
  const u = { uTime: { value: 0 }, uA: { value: 1 }, uBack: { value: 0 }, uTint: { value: new THREE.Color(col) } };
  const mk = (side, back) => new THREE.ShaderMaterial({
    vertexShader: BOX_VERT, fragmentShader: BOX_FRAG, side, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...u, uBack: { value: back } },
  });
  const cube = new THREE.Group();
  const backM = new THREE.Mesh(boxGeo, mk(THREE.BackSide, 1));
  backM.renderOrder = 4;
  const frontM = new THREE.Mesh(boxGeo, mk(THREE.FrontSide, 0));
  frontM.renderOrder = 6;
  cube.add(backM, frontM);
  cube.rotation.set(0.5, 0.6, 0.2);
  g.add(cube);
  g.userData.cube = cube;
  g.userData.boxU = u;
  g.userData.boxMats = [backM.material, frontM.material];
  const gs = glowSprite(col, 3.6, 0.3);
  g.add(gs);
  g.userData.glow = gs;
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
      { arr: level.notes, kind: 'gpu', y: ITEM.gpuY },
      { arr: level.rings, kind: 'ring', y: ITEM.ringY },
      { arr: level.hazards, kind: 'hazard', y: 0 },
      { arr: level.powerups, kind: 'power', y: ITEM.powerY },
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
    o.rotation.set(0, 0, 0);
    o.rotation.order = 'YXZ'; // yaw first, so hit tilts happen in the road's frame
    it.obj = o;
    it.kind = kind;
    it.baseY = y;
    it.state = it.state || 'live';
    it.stateT = 0;
    if (kind === 'ring') {
      const L = o.userData.label;
      L.visible = !!it.chain;
      if (it.chain) L.material.map = noteTex(it.idx || 0);
    }
    this.scene.add(o);
    this.live.add(it);
  }
  /** add an extra item (compute rain, hallucinations) outside the level lists */
  addItem(it, kind) {
    const l = this.lists.find((x) => x.kind === kind);
    this.spawnItem(it, kind, l ? l.y : ITEM.gpuY);
  }

  update(songTime, dt, beatPhase) {
    const ahead = songTime + FAR / SPEED;
    const kartZ = songTime * SPEED;
    const beat = easeOut(Math.pow(1 - beatPhase, 2)) * Math.pow(1 - beatPhase, 1.5); // soft attack, eased decay
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
      it.stateT += dt;
      // collected things ride along with the kart so the camera never drives into them; knocked hazards are carried a little
      if (it.state === 'got') it.dz = (songTime - it.t) * SPEED;
      else if ((it.state === 'hit' || it.state === 'blocked') && !o.userData.flat) it.dz = Math.max(0, songTime - it.t) * SPEED + easeOut(Math.min(1, it.stateT / 0.6)) * (it.state === 'blocked' ? 8 : 3.5); // shoved ahead of the kart, never back into the lens
      if (zf + (it.dz || 0) < kartZ - 2.5) { this._release(it); continue; } // passed the kart (the v3 camera is only ~5.6 m behind)
      const x = it.flyX ?? it.x;
      // hazards sit on the road even under a hop (you jump OVER them); pickups float at hop height
      if (it.kind === 'hazard') this.track.course.pos(zf + (it.dz || 0), x, it.baseY, o.position);
      else this.track.worldPos(zf + (it.dz || 0), x, it.baseY, o.position);
      o.scale.setScalar(1);
      o.rotation.set(0, -this.track.course.frame(zf + (it.dz || 0), _fy).yaw, 0);
      if (it.kind === 'gpu') {
        const card = o.userData.card, ud = o.userData;
        for (const f of ud.fans) f.rotation.y += dt * 16;
        if (it.state === 'live') {
          o.position.y += Math.sin(songTime * 3.2 + it.t) * 0.08;
          card.rotation.z = Math.sin(songTime * 2.4 + it.t * 2) * 0.25;
          o.scale.setScalar(GS * (1 + 0.1 * beat) * (it.fake ? 0.9 : 1));
          ud.disc.visible = true;
          ud.glow.material.opacity = 0.28 + 0.14 * beat;
        } else if (it.state === 'got') {
          // pop: spin up and shrink away fast (sparkles + flash come from main.js), never a slab over the kart
          const k = it.stateT / 0.2;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          ud.disc.visible = false;
          o.position.y += easeOut(k) * 0.7;
          o.rotation.y += k * 7;
          o.scale.setScalar(GS * Math.max(0.001, (1 - k * k) * (1 - 0.3 * k)));
          ud.glow.material.opacity = 0.55 * (1 - k);
        } else if (it.state === 'missed') {
          // sad deflate
          const k = Math.min(1, it.stateT / 0.5), e = smooth(k);
          ud.disc.visible = false;
          o.scale.set(GS * (1 + e * 0.25), GS * Math.max(0.05, 1 - e), GS * (1 + e * 0.25));
          o.position.y -= e * 0.5;
          ud.glow.material.opacity = 0.28 * (1 - e);
        }
      } else if (it.kind === 'ring') {
        const ud = o.userData;
        ud.spin.rotation.z = songTime * 1.2;
        const near = Math.min(1, Math.max(0, (zf + (it.dz || 0) - kartZ + 3) / 10)); // glow sprite fades as it reaches the camera
        if (it.state === 'live') {
          o.scale.setScalar(RK * (1 + 0.06 * beat));
          ud.goldMat.opacity = 1;
          ud.glowU.uA.value = 0.42 + 0.3 * beat;
          ud.glow.material.opacity = (0.14 + 0.1 * beat) * near;
          ud.label.material.opacity = 1;
        } else if (it.state === 'got') {
          // ring flares outwards a little and dissolves around you (streaks come from main.js)
          const k = it.stateT / 0.32;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          const e = easeOut(k);
          o.scale.setScalar(RK * (1 + e * 0.3));
          ud.goldMat.opacity = 1 - smooth(Math.min(1, k * 1.4));
          ud.glowU.uA.value = 0.7 * (1 - k);
          ud.glow.material.opacity = 0;
          ud.label.material.opacity = 1 - k;
        } else if (it.state === 'missed') {
          // drifts up and fades out
          const k = Math.min(1, it.stateT / 0.8), e = smooth(k);
          o.position.y += e * 0.8;
          o.scale.setScalar(RK * (1 - e * 0.2));
          ud.goldMat.opacity = 1 - e;
          ud.glowU.uA.value = 0.5 * (1 - e);
          ud.glow.material.opacity = 0.14 * (1 - e) * near;
          ud.label.material.opacity = 1 - e;
        }
      } else if (it.kind === 'hazard') {
        const w = it.w * LANE * 2;
        o.scale.set(w / BASE, ITEM.hazardH, 1);
        for (const ch of o.userData.anim) {
          if (ch.userData.spin) ch.rotation.z = -songTime * 5;
          else if (ch.userData.wiggle !== undefined) ch.rotation.z = (ch.userData.wiggle - 2) * 0.45 + Math.sin(songTime * 4 + ch.userData.wiggle) * 0.3;
          else if (ch.userData.pulse !== undefined) { const p = 0.5 + 0.5 * Math.sin(songTime * 5 + ch.userData.pulse); ch.material.opacity = 0.15 + 0.5 * p * p; }
        }
        if ((it.state === 'hit' || it.state === 'blocked') && !o.userData.flat) {
          // shoved ahead and aside, tips over away from the kart and pops (wide props never tumble up into the lens)
          const k = Math.min(1, it.stateT / 0.6);
          if (it.stateT >= 0.6) { this._release(it); it.done = true; continue; }
          const side = it.x > 0 ? 1 : -1;
          const e = easeOut(k);
          o.position.y += 0.7 * Math.sin(Math.PI * Math.min(1, k * 1.3));
          o.position.x += side * e * 2.6 * Math.cos(o.rotation.y);
          o.position.z -= side * e * 2.6 * Math.sin(o.rotation.y);
          o.rotation.x = -e * 1.25;
          o.rotation.z = -side * e * 0.35;
          const sh = 1 - smooth(Math.max(0, (k - 0.45) / 0.55));
          o.scale.set((w / BASE) * (sh * 0.85 + 0.15 * sh * sh), ITEM.hazardH * sh, sh);
        }
      } else if (it.kind === 'power') {
        const ud = o.userData;
        ud.icon.rotation.y = songTime * 2.2;
        ud.cube.rotation.y = songTime * 0.9;
        ud.cube.rotation.x = 0.5 + Math.sin(songTime * 0.7) * 0.2;
        ud.boxU.uTime.value = songTime;
        o.position.y += Math.sin(songTime * 2.6 + it.t) * 0.12;
        o.scale.setScalar(PS * (1 + 0.05 * beat));
        ud.boxU.uA.value = 1;
        ud.glow.material.opacity = 0.3;
        if (it.state === 'got') {
          // the box bursts (shards come from main.js); the icon pops up briefly
          const k = it.stateT / 0.22;
          if (k >= 1) { this._release(it); it.done = true; continue; }
          o.scale.setScalar(PS * (1 + 0.25 * easeOut(k)));
          ud.boxU.uA.value = 1 - k;
          ud.glow.material.opacity = 0.5 * (1 - k);
          ud.icon.scale.setScalar(1 - smooth(k));
          o.position.y += k * 0.8;
        } else ud.icon.scale.setScalar(1);
        if (it.state === 'missed') {
          const k = Math.min(1, it.stateT / 0.6);
          ud.boxU.uA.value = 1 - smooth(k);
          ud.glow.material.opacity = 0.3 * (1 - k);
        }
      }
    }
  }
}
