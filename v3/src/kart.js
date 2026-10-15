// v3 hero: CLAUDE, a chunky clay-orange spark with a little face, driving a terracotta kart.
// The chassis builder is shared with the rival karts (rivals.js) so every kart has the same build quality:
// rounded tyres on chrome rims, a bevelled shell, layered shader boost flames, a soft contact shadow.
// Static parts are merged per material (one draw per material instead of ~120 meshes per kart).
import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { toon, glow, G, mesh, clamp, lerp, MAT, physical, textPanel } from './toolkit.js';
import { glowSprite, blobShadow, mergeStatic } from './particles.js';
import { KART_SCALE } from './scale.js';

// ---------------------------------------------------------------------------------------------------------------
// smooth shared geometries
const geoCache = new Map();
const cached = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };

/** smoother capsule than the toolkit's (no faceting on the hero shapes) */
export const capsule = (r, len) => cached(`cap${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 10, 24));
export const sphere = (r, seg = 32) => cached(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)));
export const torus = (r, tube, seg = 48, rad = 16) => cached(`tor${r},${tube},${seg},${rad}`, () => new THREE.TorusGeometry(r, tube, rad, seg));

/** a rounded tyre (lathe of a rounded-rect section), axle along x */
export function tyreGeo(r, w) {
  return cached(`tyre${r},${w}`, () => {
    const hw = w / 2, ri = r * 0.6, rr = Math.min(hw, r * 0.4) * 0.75;
    const pts = [new THREE.Vector2(ri, -hw)];
    pts.push(new THREE.Vector2(r - rr, -hw));
    for (let i = 1; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -hw + rr + Math.sin(a) * rr)); }
    for (let i = 1; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, hw - rr + Math.sin(a) * rr)); }
    pts.push(new THREE.Vector2(ri, hw));
    const g = new THREE.LatheGeometry(pts, 44);
    g.rotateZ(Math.PI / 2);
    return g;
  });
}
/** a dished rim (chrome), axle along x */
function rimGeo(r, w) {
  return cached(`rim${r},${w}`, () => {
    const hw = w / 2;
    const pts = [
      new THREE.Vector2(0.001, -hw * 0.35), new THREE.Vector2(r * 0.3, -hw * 0.4), new THREE.Vector2(r * 0.82, -hw * 0.75),
      new THREE.Vector2(r, -hw * 0.95), new THREE.Vector2(r, hw * 0.95), new THREE.Vector2(r * 0.82, hw * 0.75),
      new THREE.Vector2(r * 0.3, hw * 0.4), new THREE.Vector2(0.001, hw * 0.35),
    ];
    const g = new THREE.LatheGeometry(pts, 32);
    g.rotateZ(Math.PI / 2);
    return g;
  });
}
/** flame teardrop: base at y=0 (radius 0.4), tip at y=1; uv.y runs base → tip */
function flameGeo() {
  return cached('flame', () => {
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const y = i / 18;
      const r = 0.5 * Math.pow(1 - y, 0.7) * (0.78 + 0.22 * Math.sin(Math.PI * Math.min(1, y * 2.6)));
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    return new THREE.LatheGeometry(pts, 22);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// layered boost flame (gradient + scrolling noise, additive, HDR so it blooms). uBoost 0 = warm idle, 1 = blue-white mini-turbo
const FLAME_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = 1.0 + 0.08 * sin(uTime * 31.0 + p.y * 9.0) * p.y;
  p.xz *= w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */ `
uniform float uTime, uBoost, uCore, uAlpha, uSeed;
uniform vec3 uIdleOut, uIdleCore, uBoostOut, uBoostCore;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float v = vUv.y;
  float n = n2(vec2(vUv.x * 7.0 + uSeed, v * 3.0 - uTime * 8.0)) * 0.6 + n2(vec2(vUv.x * 15.0 - uSeed, v * 7.0 - uTime * 14.0)) * 0.4;
  float f = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(f, 1.3 + uCore * 1.2);
  float len = (1.0 - smoothstep(0.15 + 0.5 * n, 1.0, v + (n - 0.5) * 0.25 * v)) * smoothstep(0.0, 0.08, v);
  float a = body * len * uAlpha;
  vec3 outer = mix(uIdleOut, uBoostOut, uBoost), core = mix(uIdleCore, uBoostCore, uBoost);
  vec3 col = mix(outer, core, clamp((1.0 - v) * f * 1.25 + uCore * 0.55, 0.0, 1.0)) * (2.0 + uCore * 1.6) * (0.7 + 0.6 * n);
  gl_FragColor = vec4(col * a, 0.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** one shared uniform set per kart; returns {outerMat, innerMat, u} */
export function flameMaterials({ idleOut = '#ff6a12', idleCore = '#ffe7a0', boostOut = '#2f8cff', boostCore = '#e8f6ff', seed = 0 } = {}) {
  const lin = (c) => new THREE.Color(c);
  const u = {
    uTime: { value: 0 }, uBoost: { value: 0 }, uAlpha: { value: 1 }, uSeed: { value: seed },
    uIdleOut: { value: lin(idleOut) }, uIdleCore: { value: lin(idleCore) }, uBoostOut: { value: lin(boostOut) }, uBoostCore: { value: lin(boostCore) },
  };
  const make = (core) => new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { ...u, uCore: { value: core } },
  });
  return { outerMat: make(0), innerMat: make(1), u };
}

// ---------------------------------------------------------------------------------------------------------------
/** a smooth tapered kart body from an extruded, bevelled side profile */
function kartShell() {
  return cached('shell', () => {
    const shape = new THREE.Shape();
    // side profile in (z, y): nose at -1.9, tail at +1.5 (forward is -z)
    shape.moveTo(-1.95, 0.25);
    shape.bezierCurveTo(-2.05, 0.45, -1.7, 0.62, -1.2, 0.66);
    shape.lineTo(-0.55, 0.78);
    shape.bezierCurveTo(-0.2, 0.86, 0.6, 0.86, 0.95, 0.8);
    shape.bezierCurveTo(1.35, 0.74, 1.55, 0.62, 1.6, 0.42);
    shape.lineTo(1.55, 0.22);
    shape.lineTo(-1.95, 0.25);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 6, curveSegments: 28 });
    geo.translate(0, 0, -0.75);
    geo.rotateY(-Math.PI / 2); // profile x → world z (nose at −z), extrusion → across the kart
    geo.computeVertexNormals();
    return geo;
  });
}

/** a rubber tyre + chrome rim + spokes + hub as one spinning group (merged inside) */
function buildWheel(r, wd, hubMat, { spokes = 5 } = {}) {
  const w = new THREE.Group();
  const tyre = MAT.rubber('#1b1b20', { roughness: 0.82 });
  w.add(new THREE.Mesh(tyreGeo(r, wd), tyre));
  // tread blocks on the crown
  const tb = G.rbox(wd * 0.78, 0.06, 0.13, 0.025);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const b = mesh(tb, tyre, 0, Math.cos(a) * (r - 0.01), Math.sin(a) * (r - 0.01));
    b.rotation.x = -a;
    w.add(b);
  }
  const chrome = MAT.chrome('#e8ecf2');
  w.add(new THREE.Mesh(rimGeo(r * 0.6, wd + 0.04), chrome));
  for (let k = 0; k < spokes; k++) {
    const sp = mesh(G.rbox(wd * 0.5, r * 1.02, 0.09, 0.03), chrome, 0, 0, 0);
    sp.rotation.x = (k / spokes) * Math.PI;
    w.add(sp);
  }
  const hub = mesh(G.cyl(r * 0.2, r * 0.2, wd + 0.12, 24), hubMat);
  hub.rotation.z = Math.PI / 2;
  w.add(hub);
  mergeStatic(w, { shadows: true });
  w.userData.keep = true;
  w.rotation.order = 'YXZ'; // steer (y) then spin (x)
  return w;
}

/**
 * The shared kart chassis (model units: rear tyres 3.38 wide, nose at z −2.05, tail +2.1; forward is −z).
 * opts: paint, trim (second paint), carbon, name (wing + nose decal), nameFg, nameBg, rim (hub colour), flame colours.
 * Returns { group, wheels, flames: [{outer, inner, anchor}], flameU, rearAnchors }
 */
export function buildChassis({ paint, trim, carbon, name = 'CLAUDE', nameFg = '#f3eee3', nameBg = '#f3eee3', nameInk = '#c15f3c', hub, flame = {}, plate = true, seed = 0 } = {}) {
  const B = new THREE.Group();
  carbon = carbon || toon('#1a1a20', { roughness: 0.35, metalness: 0.4 });
  const chrome = MAT.chrome();
  // --- chassis
  const shell = new THREE.Mesh(kartShell(), paint);
  shell.scale.set(1.12, 0.95, 1.05);
  B.add(shell);
  B.add(mesh(G.rbox(2.3, 0.18, 3.3, 0.08), carbon, 0, 0.2, 0.05)); // floor pan
  for (const sx of [-1, 1]) {
    const pod = mesh(capsule(0.3, 1.5), paint, sx * 1.15, 0.42, 0.2);
    pod.rotation.x = Math.PI / 2;
    B.add(pod);
    B.add(mesh(G.rbox(0.06, 0.12, 1.4, 0.03), trim, sx * 1.46, 0.48, 0.2));
  }
  if (plate) {
    const p = textPanel(name, { width: 0.9, height: 0.32, bg: nameBg, fg: nameInk, border: '#2a2725', borderW: 6, radius: 10 });
    p.position.set(0, 0.55, -1.98);
    p.rotation.y = Math.PI;
    p.rotation.x = 0.35;
    B.add(p);
  }
  for (const sx of [-0.55, 0.55]) B.add(mesh(sphere(0.11, 20), glow('#fff6d0', { intensity: 3 }), sx, 0.45, -1.92)); // headlights
  const bump = mesh(capsule(0.12, 1.6), carbon, 0, 0.28, -2.05);
  bump.rotation.z = Math.PI / 2;
  B.add(bump);
  // rear end: engine cover with intake, taillights, diffuser
  B.add(mesh(G.rbox(1.7, 0.55, 1.0, 0.22), paint, 0, 0.62, 1.35));
  B.add(mesh(G.rbox(1.0, 0.3, 0.6, 0.12), carbon, 0, 0.95, 1.25));
  for (const sx of [-0.62, 0.62]) B.add(mesh(G.rbox(0.42, 0.14, 0.06, 0.05), glow('#ff2a3a', { intensity: 3 }), sx, 0.62, 1.87));
  for (let k = -2; k <= 2; k++) B.add(mesh(G.rbox(0.05, 0.2, 0.5, 0.02), carbon, k * 0.3, 0.27, 1.75));
  // rear wing with the decal (what the camera sees all race)
  B.add(mesh(G.rbox(2.6, 0.1, 0.62, 0.04), paint, 0, 1.32, 1.62));
  const wingDecal = textPanel(name, { width: 1.7, height: 0.4, bg: null, fg: nameFg, stroke: '#2a2725', strokeW: 10 });
  wingDecal.position.set(0, 1.42, 1.94);
  B.add(wingDecal);
  B.add(mesh(G.rbox(2.62, 0.12, 0.04, 0.015), trim, 0, 1.27, 1.94));
  for (const sx of [-1.3, 1.3]) B.add(mesh(G.rbox(0.07, 0.55, 0.7, 0.03), carbon, sx, 1.2, 1.62));
  for (const sx of [-0.45, 0.45]) B.add(mesh(G.rbox(0.08, 0.5, 0.14, 0.03), carbon, sx, 1.05, 1.6));
  B.add(mesh(G.rbox(0.9, 0.6, 0.25, 0.1), carbon, 0, 0.95, 0.75)); // seat
  // wheels
  const wheels = [];
  const hubMat = hub || trim;
  for (const [x, z, r, wd] of [[-1.2, -1.3, 0.44, 0.42], [1.2, -1.3, 0.44, 0.42], [-1.38, 1.1, 0.6, 0.62], [1.38, 1.1, 0.6, 0.62]]) {
    const w = buildWheel(r, wd, hubMat);
    w.position.set(x, r, z);
    B.add(w);
    wheels.push(w);
    const arm = mesh(G.cyl(0.05, 0.05, Math.abs(x) - 0.55, 12), chrome, x / 2 + Math.sign(x) * 0.25, r, z);
    arm.rotation.z = Math.PI / 2;
    B.add(arm);
  }
  // exhausts + layered flames
  const { outerMat, innerMat, u: flameU } = flameMaterials({ ...flame, seed });
  const flames = [];
  for (const x of [-0.95, 0.95]) {
    const p = mesh(G.cyl(0.13, 0.17, 0.7, 24), chrome, x, 0.55, 1.75);
    p.rotation.x = Math.PI / 2;
    B.add(p);
    const lip = mesh(torus(0.13, 0.035, 24, 8), chrome, x, 0.55, 2.1);
    B.add(lip);
    const soot = mesh(G.cyl(0.11, 0.11, 0.02, 20), toon('#0b0b0d', { roughness: 0.9 }), x, 0.55, 2.09);
    soot.rotation.x = Math.PI / 2;
    B.add(soot);
    const anchor = new THREE.Group();
    anchor.position.set(x, 0.55, 2.1);
    anchor.userData.keep = true;
    const outer = new THREE.Mesh(flameGeo(), outerMat);
    outer.rotation.x = Math.PI / 2; // +y (tip) → +z (behind the kart)
    outer.renderOrder = 6;
    const inner = new THREE.Mesh(flameGeo(), innerMat);
    inner.rotation.x = Math.PI / 2;
    inner.renderOrder = 7;
    anchor.add(outer, inner);
    B.add(anchor);
    flames.push({ outer, inner, anchor });
  }
  // rear-wheel contact points (drift sparks / dust spawn here)
  const rearAnchors = [-1.45, 1.45].map((x) => { const a = new THREE.Group(); a.position.set(x, 0.05, 1.2); a.userData.keep = true; B.add(a); return a; });
  return { group: B, wheels, flames, flameU, rearAnchors };
}

/** animate a chassis' flames: k = 0 idle .. 1 boost. len/rad in model units */
export function animateFlames(ch, k, t, { idle = 1, idleLen = 0.9, boostLen = 2.1 } = {}) {
  ch.flameU.uTime.value = t;
  ch.flameU.uBoost.value = clamp((k - 0.15) * 1.6, 0, 1);
  ch.flameU.uAlpha.value = Math.min(1, idle + k);
  for (let i = 0; i < ch.flames.length; i++) {
    const f = ch.flames[i];
    const wob = 1 + 0.07 * Math.sin(t * 41 + i * 2.1) + 0.05 * Math.sin(t * 27.3 + i);
    const L = lerp(idleLen, boostLen, k) * wob;
    const R = lerp(0.3, 0.58, k) * (1 + 0.05 * Math.sin(t * 53 + i));
    f.outer.scale.set(R, L, R);
    f.inner.scale.set(R * 0.5, L * 0.55, R * 0.5);
    f.anchor.visible = idle + k > 0.01;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// AGI WINGS: a parafoil wing ≈ 2.3 kart widths across (7.8 model units)
function wingGeo() {
  return cached('wing', () => new ParametricGeometry((u, v, t) => {
    const span = 7.8, chord = 2.0;
    const s = u * 2 - 1;
    const ch = chord * (0.18 + 0.82 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(s), 5))));
    const w = v < 0.5 ? v * 2 : (1 - v) * 2; // 0 leading edge → 1 trailing edge
    const thick = 0.3 * Math.sin(Math.PI * Math.pow(w, 0.6)) * (1 - Math.pow(Math.abs(s), 8)) * (1 - 0.35 * s * s);
    const y = -1.15 * s * s + (v < 0.5 ? thick : -thick * 0.3);
    t.set(s * span / 2, y, -ch * 0.35 + w * ch);
  }, 72, 24));
}
function cord(a, b, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(G.cyl(0.018, 0.018, 1, 6), mat);
  m.scale.y = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// shield bubble: iridescent fresnel shell
const SHIELD_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const SHIELD_FRAG = /* glsl */ `
uniform float uTime, uK;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.3 + uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
  float bands = 0.5 + 0.5 * sin(vP.y * 9.0 - uTime * 2.5);
  float a = (0.035 + pow(f, 2.4) * 0.9 + bands * 0.025 * f) * uK;
  vec3 col = mix(vec3(0.35, 1.0, 0.85), irid, 0.5) * (0.9 + pow(f, 4.0) * 1.6);
  gl_FragColor = vec4(col * a, a * 0.25);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------------------------
const _v = new THREE.Vector3();

export class Kart {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    this.expr = 'normal';
    this.blinkT = 2;
    this.blinking = false;
    this.topY = 3.38; // top of the spark driver (kart local), for frame measurements
    this.yaw = 0; this.lean = 0; this.spin = 0; this.scaleK = 1; this.flameK = 0; this.gliderK = 0; this.shieldK = 0;
    this._build();
    this.root.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial && !o.material.isShaderMaterial) { o.castShadow = true; o.receiveShadow = true; } });
    this._rimLight();
  }

  /** the hero must always read, even backlit by a low sun: private copies of the kart's lit materials get a
   *  warm view-facing rim + a little fill (shader emissive), and a touch more env reflection */
  _rimLight() {
    const copies = new Map();
    const rimU = { rimColor: { value: new THREE.Color('#ffe2c4') } };
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent) return;
      let c = copies.get(m);
      if (!c) {
        c = m.clone();
        c.envMapIntensity = (m.envMapIntensity ?? 1) * 1.35;
        c.onBeforeCompile = (sh) => {
          sh.uniforms.rimColor = rimU.rimColor;
          sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += rimColor * pow(rimF, 2.6) * 0.32 + diffuseColor.rgb * 0.07;`);
        };
        c.customProgramCacheKey = () => 'kartRim';
        copies.set(m, c);
      }
      o.material = c;
    });
  }

  _build() {
    const B = this.body;
    const paint = MAT.paint('#d97757'); // Claude terracotta
    const paint2 = MAT.paint('#f3eee3'); // cream
    const carbon = toon('#1a1a20', { roughness: 0.35, metalness: 0.4 });
    const chrome = MAT.chrome();
    const ch = buildChassis({ paint, trim: paint2, carbon, name: 'CLAUDE' });
    this.chassis = ch;
    B.add(ch.group);
    this.wheels = ch.wheels;
    this.flames = ch.flames;
    this.rear = ch.rearAnchors;
    // steering column + wheel
    const col = mesh(G.cyl(0.05, 0.05, 0.9, 12), chrome, 0, 0.95, -0.55);
    col.rotation.x = -0.9;
    ch.group.add(col);
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 1.28, -0.3);
    this.wheel.rotation.x = -0.6;
    this.wheel.add(mesh(torus(0.3, 0.06, 40, 12), MAT.rubber('#222')));
    this.wheel.add(mesh(G.rbox(0.55, 0.06, 0.05, 0.02), chrome));
    this.wheel.userData.keep = true;
    ch.group.add(this.wheel);

    // --- the driver: Claude, a chunky clay spark sitting in the cockpit
    const m = new THREE.Group();
    m.position.set(0, 0.62, 0.2);
    B.add(m);
    this.mascot = m;
    const clay = MAT.paint('#d97757', { roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5, metalness: 0 });
    const spark = new THREE.Group();
    spark.position.set(0, 1.62, 0);
    spark.scale.setScalar(0.84); // v3: MK drivers are about half a kart wide; keep the height (kart+driver ≈ 1.1 kart widths)
    spark.userData.keep = true;
    m.add(spark);
    this.spark = spark;
    spark.add(mesh(sphere(0.5, 40), clay)); // hub
    // rounded rays of slightly different lengths, like a hand-drawn spark (merged: they bop + spin as one)
    const rays = new THREE.Group();
    const lens = [1.0, 0.78, 0.92, 0.7, 0.98, 0.74, 0.9, 0.8, 0.96, 0.72, 0.88, 0.76];
    lens.forEach((L, i) => {
      const a = (i / lens.length) * Math.PI * 2 + 0.13;
      const ray = new THREE.Group();
      ray.rotation.z = a;
      const cap = mesh(capsule(0.15, L * 0.75), clay, 0, 0.45 + L * 0.38, 0);
      cap.scale.z = 1.35;
      ray.add(cap);
      rays.add(ray);
    });
    mergeStatic(rays);
    rays.userData.keep = true;
    spark.add(rays);
    this.raysG = rays;
    // face (camera side): canvas with transparent background
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256; this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    const face = new THREE.Mesh(G.plane(0.92, 0.92), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false }));
    face.position.set(0, 0, 0.53);
    face.renderOrder = 2;
    face.userData.keep = true;
    spark.add(face);
    // a tiny racing headband with goggles pushed up (Claude takes safety seriously)
    const band = mesh(torus(0.52, 0.06, 56, 12), MAT.plastic('#2a2725'), 0, 0.22, 0);
    band.rotation.x = Math.PI / 2;
    spark.add(band);
    for (const sx of [-0.2, 0.2]) {
      spark.add(mesh(torus(0.13, 0.05, 28, 10), MAT.chrome(), sx, 0.42, 0.42));
      const lens = mesh(G.cyl(0.11, 0.11, 0.03, 24), MAT.glass('#7fd4ff', { opacity: 0.6 }), sx, 0.42, 0.42);
      lens.rotation.x = Math.PI / 2;
      spark.add(lens);
    }
    // sunglasses (combo ≥ 50)
    const shades = new THREE.Group();
    shades.add(mesh(G.rbox(0.3, 0.17, 0.05, 0.05), MAT.glass('#050505', { opacity: 0.94 }), -0.17, 0.08, 0.58));
    shades.add(mesh(G.rbox(0.3, 0.17, 0.05, 0.05), MAT.glass('#050505', { opacity: 0.94 }), 0.17, 0.08, 0.58));
    shades.add(mesh(G.rbox(0.12, 0.04, 0.04, 0.015), MAT.chrome(), 0, 0.12, 0.58));
    shades.visible = false;
    shades.userData.keep = true;
    spark.add(shades);
    this.shades = shades;
    mergeStatic(spark);
    // cream racing gloves gripping the wheel
    for (const sx of [-1, 1]) {
      const arm = mesh(capsule(0.09, 0.6), clay, sx * 0.42, 0.85, -0.3);
      arm.rotation.set(-1.0, 0, sx * 0.5);
      m.add(arm);
      m.add(mesh(sphere(0.15, 20), MAT.plastic('#f3eee3'), sx * 0.32, 0.6, -0.62));
    }
    mergeStatic(m);
    this.helmet = null;
    this.fans = [];
    this.rgb = null;
    mergeStatic(ch.group);

    // --- AGI WINGS glider (deploys on glide jumps)
    const glider = new THREE.Group();
    glider.position.set(0, 5.1, 0.35);
    const sc = document.createElement('canvas');
    sc.width = 512; sc.height = 32;
    const sg = sc.getContext('2d');
    ['#d97757', '#f3eee3', '#c15f3c', '#f3eee3', '#d97757', '#f3eee3', '#c15f3c', '#f3eee3', '#d97757'].forEach((c, i, arr) => { sg.fillStyle = c; sg.fillRect(i * 512 / arr.length, 0, 512 / arr.length + 1, 32); });
    sg.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 1; i < 18; i++) sg.fillRect(i * 512 / 18 - 1, 0, 2, 32); // cell seams
    const stripes = new THREE.CanvasTexture(sc);
    stripes.colorSpace = THREE.SRGBColorSpace;
    stripes.anisotropy = 4;
    const canopyMat = new THREE.MeshPhysicalMaterial({ map: stripes, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
    const wing = new THREE.Mesh(wingGeo(), canopyMat);
    wing.castShadow = true;
    glider.add(wing);
    const wl = textPanel('AGI WINGS', { width: 3.0, height: 0.62, bg: null, fg: '#c15f3c', stroke: '#ffffff', strokeW: 12 });
    wl.position.set(0, 0.36, 0.5);
    wl.rotation.x = -Math.PI / 2 + 0.12;
    glider.add(wl);
    const cordMat = MAT.plastic('#f6f2ea');
    for (const sx of [-1, 1]) {
      const hand = new THREE.Vector3(sx * 0.55, -3.4, 0.05);
      for (const [px, pz] of [[0.9, -0.2], [0.9, 0.9], [2.2, -0.1], [2.2, 0.7], [3.2, 0.2]]) {
        const s = (px / 3.9);
        glider.add(cord(new THREE.Vector3(sx * px, -1.15 * s * s - 0.05, pz), hand, cordMat));
      }
    }
    glider.scale.setScalar(0.01);
    glider.visible = false;
    B.add(glider);
    this.glider = glider;

    // shield bubble
    this.shieldU = { uTime: { value: 0 }, uK: { value: 0 } };
    this.shield = new THREE.Mesh(sphere(2.7, 48), new THREE.ShaderMaterial({
      vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, uniforms: this.shieldU, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.shield.position.set(0, 1.5, 0.1);
    this.shield.scale.set(1, 0.86, 1.05);
    this.shield.renderOrder = 8;
    this.shield.visible = false;
    this.root.add(this.shield);
    this.underGlow = glowSprite('#4ad8ff', 4.2, 0);
    this.underGlow.position.set(0, 0.35, 2.4);
    this.root.add(this.underGlow);
    // soft contact shadow (grounds the small kart; real sun shadows are crisp and offset)
    this.blob = blobShadow(4.3, 5.4, 0.5, { unique: true });
    this.blob.position.set(0, 0.03, 0.05);
    this.root.add(this.blob);
    this.drawFace();
  }

  setExpression(e) { if (e !== this.expr) { this.expr = e; this.drawFace(); } }

  drawFace() {
    const g = this.faceCanvas.getContext('2d');
    const W = 256, H = 256;
    g.clearRect(0, 0, W, H);
    const ink = '#2a2725';
    g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 13;
    const ex = [92, 164], ey = 112, e = this.expr;
    if (e === 'hurt') {
      for (const x of ex) { g.beginPath(); g.moveTo(x - 15, ey - 15); g.lineTo(x + 15, ey + 15); g.moveTo(x + 15, ey - 15); g.lineTo(x - 15, ey + 15); g.stroke(); }
      g.beginPath(); g.moveTo(100, 176); g.quadraticCurveTo(114, 164, 128, 176); g.quadraticCurveTo(142, 188, 156, 176); g.stroke();
    } else if (e === 'scared') {
      for (const x of ex) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, ey, 22, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x, ey + 3, 8, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(128, 182, 20, 16, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7fd4ff'; g.beginPath(); g.ellipse(206, 70, 10, 16, 0, 0, Math.PI * 2); g.fill();
    } else {
      if (this.blinking) {
        for (const x of ex) { g.beginPath(); g.moveTo(x - 14, ey); g.lineTo(x + 14, ey); g.stroke(); }
      } else if (e === 'happy') {
        for (const x of ex) { g.beginPath(); g.arc(x, ey + 10, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      } else {
        for (const x of ex) { g.beginPath(); g.ellipse(x, ey, 11, 17, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#fff';
        for (const x of ex) { g.beginPath(); g.arc(x + 4, ey - 6, 4, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = ink;
      }
      if (e === 'happy') {
        g.beginPath(); g.moveTo(96, 160); g.quadraticCurveTo(128, 214, 160, 160); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.arc(128, 150, 26, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
      }
      g.fillStyle = 'rgba(255,140,140,0.55)';
      g.beginPath(); g.ellipse(58, 160, 16, 10, 0, 0, Math.PI * 2); g.ellipse(198, 160, 16, 10, 0, 0, Math.PI * 2); g.fill();
    }
    this.faceTex.needsUpdate = true;
  }

  /** world position of exhaust i's nozzle (0 left, 1 right) */
  exhaustWorld(i, out) { return this.flames[i].anchor.getWorldPosition(out); }
  /** world position of rear tyre i's contact patch (0 left, 1 right) */
  wheelWorld(i, out) { return this.rear[i].getWorldPosition(out); }

  update(s) {
    const { dt } = s;
    this.root.position.copy(s.pos);
    if (s.quat) this.root.quaternion.copy(s.quat); else this.root.rotation.y = s.heading || 0;
    const targetYaw = clamp(-s.steerVel * 0.18, -0.3, 0.3);
    const targetLean = clamp(s.steerVel * 0.12, -0.26, 0.26);
    this.yaw = lerp(this.yaw, targetYaw, 1 - Math.exp(-dt * 10));
    this.lean = lerp(this.lean, targetLean, 1 - Math.exp(-dt * 10));
    if (s.spinT > 0) this.spin += dt * 22 * s.spinT;
    else this.spin = lerp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 1 - Math.exp(-dt * 12));
    this.body.rotation.set(s.boostK * 0.14 + (s.launchK || 0) * 0.5 + (s.airK || 0) * 0.08, this.yaw + this.spin, this.lean);
    this.body.position.y = s.boostK * 0.12 + (s.spinT > 0 ? Math.abs(Math.sin(s.t * 20)) * 0.3 : 0);
    const sq = Math.pow(1 - s.beatPhase, 4) * 0.05;
    this.scaleK = lerp(this.scaleK, s.scaleK, 1 - Math.exp(-dt * 6));
    const k = this.scaleK * KART_SCALE;
    this.root.scale.set(k * (1 + sq), k * (1 - sq), k * (1 + sq));
    this.mascot.position.y = 0.62 + Math.sin(s.t * 9) * 0.03;
    // Claude always turns to look at you (the spark reads best face-on), with a little lean
    if (s.camPos) {
      this.spark.lookAt(s.camPos);
      this.spark.rotateZ(-this.lean * 1.2);
    }
    // rays bop on the beat; spin up when boosting
    const bop = Math.pow(1 - s.beatPhase, 3);
    this.raysG.scale.set(1 + bop * 0.06, 1 + bop * 0.06, 1);
    this.spinRays = (this.spinRays || 0) + dt * s.boostK * 9;
    this.raysG.rotation.z = this.spinRays;
    this.wheel.rotation.z = s.wheelTurn ?? -s.steerVis * 1.6;
    const steerA = clamp(s.steerVis || 0, -1, 1) * -0.32;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.rotation.x -= dt * (i < 2 ? 36 : 26); // front tyres are smaller → spin faster
      if (i < 2) w.rotation.y = lerp(w.rotation.y, steerA, 1 - Math.exp(-dt * 12));
    }
    // boost flames: a small warm idle flicker, layered blue-white mini-turbo cones on boost
    this.flameK = lerp(this.flameK, s.boostK, 1 - Math.exp(-dt * 9));
    animateFlames(this.chassis, this.flameK, s.t, { idle: 0.55 });
    this.underGlow.material.opacity = this.flameK * 0.55;
    // shield: eases in/out, gentle breathing
    this.shieldK = lerp(this.shieldK, s.shield ? 1 : 0, 1 - Math.exp(-dt * (s.shield ? 7 : 10)));
    this.shield.visible = this.shieldK > 0.01;
    this.shieldU.uK.value = this.shieldK;
    this.shieldU.uTime.value = s.t;
    if (this.shield.visible) { const b = (0.85 + 0.15 * this.shieldK) * (1 + Math.sin(s.t * 5) * 0.02); this.shield.scale.set(b, b * 0.86, b * 1.05); }
    this.shades.visible = s.shades;
    // glider: unfolds sideways with a little overshoot
    this.gliderK = lerp(this.gliderK, s.glide ? 1 : 0, 1 - Math.exp(-dt * (s.glide ? 5 : 8)));
    const gk = this.gliderK;
    this.glider.visible = gk > 0.02;
    if (this.glider.visible) {
      const sx = Math.max(0.01, gk * (1 + 0.12 * Math.sin(gk * Math.PI)));
      this.glider.scale.set(sx, Math.max(0.01, 0.4 + 0.6 * gk), Math.max(0.01, gk));
      this.glider.rotation.z = -this.lean * 1.5;
      this.glider.rotation.x = Math.sin(s.t * 2.2) * 0.03;
    }
    // contact shadow sits on the road under hops and fades in the air
    const hop = s.hop || 0;
    this.blob.position.y = 0.03 - hop / Math.max(0.01, this.root.scale.y);
    this.blob.material.opacity = s.air && !hop ? 0 : 0.5 / (1 + hop * 1.2);
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = !this.blinking;
      this.blinkT = this.blinking ? 0.12 : 2 + Math.random() * 3;
      if (this.expr === 'normal' || this.expr === 'happy') this.drawFace();
    }
    this.root.updateMatrixWorld(true);
  }
}
