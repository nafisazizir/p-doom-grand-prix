// v3 effects toolkit: soft camera-facing sprite particles (one instanced-quad draw per system), soft smoke/dust,
// contact-shadow blobs, glow sprites and a static-mesh merger (fewer draw calls for karts, items and hazards).
//
// Particle kinds (all procedural, no textures): glow orb, 4-point sparkle star, velocity-stretched streak,
// glossy shard, smoke puff. Colours are HDR so the sparkly kinds bloom. Sizes are world units (full quad width).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KIND = { glow: 0, star: 1, streak: 2, shard: 3, puff: 4 };

const NOISE = /* glsl */ `
// falloff from 1 (x <= b) to 0 (x >= a), with a > b (reversed smoothstep is undefined on Metal)
float fall(float a, float b, float x) { return 1.0 - smoothstep(b, a, x); }
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec3 iCol;
attribute vec4 iPar; // size, alpha, kind, rotation
uniform vec3 uFrameVel;
uniform float uStretch;
uniform vec2 uNear;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
varying float vSeed;
void main() {
  vUv = uv;
  vCol = iCol;
  vKind = iPar.z;
  vSeed = iPar.w;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float size = iPar.x;
  vec2 c = position.xy;
  vec2 off;
  if (abs(iPar.z - 2.0) < 0.5) {
    // streak: stretch along the on-screen velocity relative to the moving camera
    vec3 rv = (modelViewMatrix * vec4(iVel - uFrameVel, 0.0)).xyz;
    vec2 d = rv.xy + mv.xy * rv.z / max(-mv.z, 0.2);
    float L = length(d);
    vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
    vec2 nrm = vec2(dir.y, -dir.x); // keeps the quad's winding (front-facing)
    float len = size + min(L * uStretch, size * 7.0);
    off = dir * c.y * len + nrm * c.x * size * 0.42;
  } else {
    float r = iPar.w, cs = cos(r), sn = sin(r);
    off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  mv.xy += off;
  // never let a particle fill the lens
  vA = iPar.y * smoothstep(uNear.x, uNear.y, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
varying float vSeed;
${NOISE}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float a = 0.0, opq = 0.0;
  vec3 col = vCol;
  int k = int(vKind + 0.5);
  if (k == 0) {
    // soft glow orb with a hot core
    a = max(0.0, exp(-r2 * 4.5) - 0.012);
    col = vCol + vec3(exp(-r2 * 26.0)) * 0.9 * dot(vCol, vec3(0.33));
  } else if (k == 1) {
    // 4-point sparkle
    float ax = abs(p.x), ay = abs(p.y);
    float rays = max(0.0, 1.0 - ax * 9.0) * (1.0 - ay) + max(0.0, 1.0 - ay * 9.0) * (1.0 - ax);
    float core = exp(-r2 * 18.0);
    a = clamp(rays * rays * 1.3 + core + exp(-r2 * 5.0) * 0.28, 0.0, 1.6) * fall(1.0, 0.75, sqrt(r2));
    col = vCol + vec3(core) * 1.2 * dot(vCol, vec3(0.33));
  } else if (k == 2) {
    // velocity streak: soft capsule, hot centre line, long fading tail
    float across = max(0.0, 1.0 - p.x * p.x);
    a = across * across * fall(1.0, 0.55, p.y) * smoothstep(-1.0, 0.1, p.y);
    col = vCol + vec3(pow(across, 8.0)) * 0.8 * dot(vCol, vec3(0.33));
  } else if (k == 3) {
    // glossy crystal shard: faceted diamond with a bright edge + a soft glow around it
    float d = abs(p.x) * 1.05 + abs(p.y) * 0.62;
    float body = fall(0.62, 0.56, d);
    float facet = p.x > 0.0 ? 1.15 : 0.7;
    float spec = fall(0.1, 0.0, abs(p.x + p.y * 0.35 - 0.12)) * body;
    float rim = fall(0.62, 0.5, d) - fall(0.5, 0.4, d);
    a = body + exp(-d * d * 7.0) * 0.35 * (1.0 - body);
    col = vCol * facet * body + vec3(spec * 1.6 + rim * 0.6) + vCol * (1.0 - body) * 0.8;
    opq = 0.75 * body;
  } else {
    // smoke / dust puff: noisy soft blob, lit from above (reads as a volume)
    float r = sqrt(r2);
    float n = fxNoise(p * 2.3 + vSeed * 7.0) * 0.6 + fxNoise(p * 5.1 - vSeed * 3.0) * 0.4;
    a = fall(1.0, 0.15, r + (n - 0.45) * 0.55);
    a *= a;
    col = vCol * mix(0.78, 1.1, clamp(0.55 + p.y * 0.55 + (n - 0.5) * 0.3, 0.0, 1.0));
    opq = 1.0;
  }
  a *= vA;
  gl_FragColor = vec4(col * a, a * opq);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _c = new THREE.Color();
const _v = new THREE.Vector3();

/** Pool of camera-facing particles. spawn() takes world positions/velocities (gravity, drag, size and alpha curves per particle). */
export class Particles {
  constructor(scene, { max = 1600, near = [1.6, 4.2], renderOrder = 12 } = {}) {
    this.maxN = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(3); this.aVel = attr(3); this.aCol = attr(3); this.aPar = attr(4);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uFrameVel: { value: new THREE.Vector3() }, uStretch: { value: 0.035 }, uNear: { value: new THREE.Vector2(near[0], near[1]) } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
    const F = (n) => new Float32Array(max * n);
    this.p = F(3); this.v = F(3); this.col = F(3);
    this.life = F(1); this.max = F(1); this.s0 = F(1); this.s1 = F(1); this.a0 = F(1);
    this.base = F(3); // drag pulls velocity towards this (e.g. the kart's velocity, so bursts ride along)
    this.grav = F(1); this.drag = F(1); this.rot = F(1); this.rotV = F(1); this.kind = F(1); this.grow = F(1); this.fadeIn = F(1);
    this.next = 0;
    this.alive = 0;
    this.lastCam = new THREE.Vector3();
    this.hasCam = false;
  }

  /**
   * pos/vel: {x,y,z}. opts: life (s), size (world, full quad), end (size multiplier at death), grav, drag (1/s),
   * kind ('glow'|'star'|'streak'|'shard'|'puff' or KIND number), hdr (colour multiplier), alpha, spin (rad/s), grow (size/s), fadeIn (fraction)
   */
  spawn(pos, vel, color, { life = 0.6, size = 0.3, end = 0.35, grav = -10, drag = 1.5, kind = 'star', hdr = 2.4, alpha = 1, spin, grow = 0, fadeIn = 0.06, base = null } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.maxN;
    const i3 = i * 3;
    this.p[i3] = pos.x; this.p[i3 + 1] = pos.y; this.p[i3 + 2] = pos.z;
    this.v[i3] = vel.x; this.v[i3 + 1] = vel.y; this.v[i3 + 2] = vel.z;
    this.base[i3] = base ? base.x : 0; this.base[i3 + 1] = base ? base.y : 0; this.base[i3 + 2] = base ? base.z : 0;
    _c.set(color).multiplyScalar(hdr);
    this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    this.life[i] = life; this.max[i] = life; this.s0[i] = size; this.s1[i] = size * end; this.a0[i] = alpha;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.fadeIn[i] = fadeIn;
    const k = typeof kind === 'number' ? kind : KIND[kind] ?? 1;
    this.kind[i] = k;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.rotV[i] = spin ?? (k === KIND.shard ? (Math.random() - 0.5) * 14 : k === KIND.star ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 0.8);
  }

  /**
   * Radial burst. carry = a world velocity {x,y,z} added to every particle (e.g. the kart's, so bursts travel with you);
   * a number is kept for old calls (forward speed along -z). opts also take any spawn() option.
   */
  burst(pos, colors, n = 14, { speed = 5, up = 2, spread = 1, carry = null, life = 0.6, size = 0.35, ...rest } = {}) {
    const cx = carry && typeof carry === 'object' ? carry.x : 0, cy = carry && typeof carry === 'object' ? carry.y : 0;
    const cz = carry && typeof carry === 'object' ? carry.z : typeof carry === 'number' ? -carry : 0;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() * 2 - 1) * Math.PI * 0.5 * spread;
      const s = speed * (0.45 + Math.random() * 0.55);
      _v.set(Math.cos(a) * Math.cos(b) * s + cx, Math.sin(b) * s * 0.8 + up + cy, Math.sin(a) * Math.cos(b) * s + cz);
      this.spawn(pos, _v, colors[k % colors.length], { life: life * (0.7 + Math.random() * 0.6), size: size * (0.65 + Math.random() * 0.7), base: carry && typeof carry === 'object' ? carry : null, ...rest });
    }
  }

  /** a ring of particles in the plane spanned by unit vectors ax/ay (halo bursts) */
  ring(center, ax, ay, radius, colors, n = 20, { speed = 4, carry = null, ...rest } = {}) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.2;
      const c = Math.cos(a), s = Math.sin(a);
      const px = center.x + (ax.x * c + ay.x * s) * radius, py = center.y + (ax.y * c + ay.y * s) * radius, pz = center.z + (ax.z * c + ay.z * s) * radius;
      const sp = speed * (0.75 + Math.random() * 0.5);
      _v.set((ax.x * c + ay.x * s) * sp + (carry?.x || 0), (ax.y * c + ay.y * s) * sp + (carry?.y || 0), (ax.z * c + ay.z * s) * sp + (carry?.z || 0));
      this.spawn({ x: px, y: py, z: pz }, _v, colors[k % colors.length], { base: carry, ...rest });
    }
  }

  /** dt; camPos (optional) lets streaks stretch along their motion relative to the moving camera */
  update(dt, camPos) {
    if (camPos) {
      if (this.hasCam && dt > 0) {
        _v.copy(camPos).sub(this.lastCam).divideScalar(Math.max(dt, 1e-3));
        if (!(_v.lengthSq() < 120 * 120)) _v.set(0, 0, 0); // teleports (section jumps), NaN while booting
        const fv = this.mat.uniforms.uFrameVel.value;
        fv.lerp(_v, 0.5);
        if (!(fv.lengthSq() < 1e6)) fv.set(0, 0, 0);
      }
      this.lastCam.copy(camPos);
      this.hasCam = true;
    }
    const P = this.aPos.array, V = this.aVel.array, C = this.aCol.array, Q = this.aPar.array;
    let j = 0;
    for (let i = 0; i < this.maxN; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      const bx = this.base[i3], by = this.base[i3 + 1], bz = this.base[i3 + 2];
      this.v[i3] = bx + (this.v[i3] - bx) * dr; this.v[i3 + 2] = bz + (this.v[i3 + 2] - bz) * dr;
      this.v[i3 + 1] = by + (this.v[i3 + 1] - by) * dr + this.grav[i] * dt;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      this.s0[i] += this.grow[i] * dt; this.s1[i] += this.grow[i] * dt;
      const u = 1 - this.life[i] / this.max[i]; // 0 → 1 over the life
      const fi = this.fadeIn[i];
      const inK = fi > 0 ? Math.min(1, u / fi) : 1;
      const e = inK * inK * (3 - 2 * inK); // smooth fade/scale in
      const out = 1 - u;
      const alpha = this.a0[i] * e * out * (2 - out) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 * 0.3 : 1);
      const size = (this.s0[i] + (this.s1[i] - this.s0[i]) * u * u) * (0.55 + 0.45 * e);
      const j3 = j * 3, j4 = j * 4;
      P[j3] = this.p[i3]; P[j3 + 1] = this.p[i3 + 1]; P[j3 + 2] = this.p[i3 + 2];
      V[j3] = this.v[i3]; V[j3 + 1] = this.v[i3 + 1]; V[j3 + 2] = this.v[i3 + 2];
      C[j3] = this.col[i3]; C[j3 + 1] = this.col[i3 + 1]; C[j3 + 2] = this.col[i3 + 2];
      Q[j4] = size; Q[j4 + 1] = alpha; Q[j4 + 2] = this.kind[i]; Q[j4 + 3] = this.rot[i];
      j++;
    }
    this.alive = j;
    this.geo.instanceCount = j;
    for (const [a, n] of [[this.aPos, 3], [this.aVel, 3], [this.aCol, 3], [this.aPar, 4]]) {
      a.clearUpdateRanges();
      if (j) { a.addUpdateRange(0, j * n); a.needsUpdate = true; }
    }
  }

  clear() {
    this.life.fill(0);
    this.geo.instanceCount = 0;
    this.alive = 0;
  }
}

/** Soft smoke and dust: the same sprite engine with alpha-blended, noisy, top-lit puffs. Old API: spawn() and puff(). */
export class Smoke extends Particles {
  constructor(scene) {
    super(scene, { max: 500, near: [1.2, 3.6], renderOrder: 11 });
  }
  spawn(p, v, color, { life = 1.2, size = 1.5, grow = 2, alpha = 0.4, drag = 1.6, grav = 0.6, end = 1, base = null } = {}) {
    super.spawn(p, v, color, { life, size, end, grow, alpha, drag, grav, base, kind: KIND.puff, hdr: 1, fadeIn: 0.12, spin: (Math.random() - 0.5) * 0.8 });
  }
  puff(p, color, n = 10, { speed = 3, life = 1.0, size = 1.4, grow = 2, alpha = 0.4, up = 1.2, carry = null } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      _v.set(Math.cos(a) * s + (carry?.x || 0), up * (0.3 + Math.random() * 0.7) + (carry?.y || 0), Math.sin(a) * s + (carry?.z || 0));
      this.spawn(p, _v, color, { life: life * (0.65 + Math.random() * 0.6), size: size * (0.7 + Math.random() * 0.6), grow, alpha, base: carry });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers for kart / rivals / items / hazards

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.62)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.04)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** additive soft glow billboard (size = world units) */
export function glowSprite(color, size = 3, opacity = 0.7) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.userData.noAO = true;
  return s;
}

let shadowTex = null;
const shadowMats = new Map();
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.35, 'rgba(0,0,0,0.8)');
  gr.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
/** soft contact-shadow blob lying on the ground (local XZ plane), w × d world units of the parent's space */
export function blobShadow(w, d, opacity = 0.5, { unique = false } = {}) {
  const key = opacity.toFixed(2);
  let m = unique ? null : shadowMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
    if (!unique) shadowMats.set(key, m);
  }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  s.rotation.x = -Math.PI / 2;
  s.scale.set(w, d, 1);
  s.renderOrder = 1;
  s.userData.noAO = true;
  s.userData.keep = true;
  return s;
}

const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
/**
 * Merge every static mesh under `root` into one mesh per material (transforms baked relative to root).
 * Objects with userData.keep (and their subtrees), sprites, points and instanced meshes are left alone.
 * Returns the merged meshes.
 */
export function mergeStatic(root, { shadows = false } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  const walk = (o) => {
    if (o !== root && o.userData.keep) return;
    if (o !== root && o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.geometry?.attributes?.position && !o.children.length) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.morphAttributes = {};
      g.clearGroups();
      _rel.multiplyMatrices(_inv, o.matrixWorld);
      g.applyMatrix4(_rel);
      const key = o.material.uuid + '|' + o.renderOrder;
      if (!byMat.has(key)) byMat.set(key, { mat: o.material, ro: o.renderOrder, geos: [] });
      byMat.get(key).geos.push(g);
      victims.push(o);
      return;
    }
    for (const c of o.children.slice()) walk(c);
  };
  walk(root);
  for (const v of victims) v.parent.remove(v);
  const out = [];
  for (const { mat, ro, geos } of byMat.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.renderOrder = ro;
    if (shadows && !mat.transparent && !mat.isMeshBasicMaterial && !mat.isShaderMaterial) { m.castShadow = true; m.receiveShadow = true; }
    root.add(m);
    out.push(m);
  }
  return out;
}
