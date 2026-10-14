// PBR texture sets (CC0, vendored in assets/v2) → MeshStandardMaterials for road / ground / props.
import * as THREE from 'three';

const BASE = new URL('../../', import.meta.url); // project root
let manifest = null;
const loader = new THREE.TextureLoader();
const texCache = new Map();
const matCache = new Map();
const pending = new WeakMap(); // loading texture → clones waiting for its image

export async function loadManifest() {
  try {
    const r = await fetch(new URL('assets/v2/manifest.json', BASE));
    manifest = r.ok ? await r.json() : null;
  } catch (e) { manifest = null; }
  return manifest;
}
export function getManifest() { return manifest; }
export const ROOT = BASE;

function tex(path, srgb) {
  const key = path + (srgb ? '|s' : '');
  let t = texCache.get(key);
  if (t) return t;
  const pend = [];
  t = loader.load(new URL(path, BASE).href, () => { for (const c of pend) c.needsUpdate = true; pend.length = 0; });
  pending.set(t, pend);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/**
 * Surface material from a texture slot. UVs from the track are in world metres (u across, v along),
 * so `scale` = metres per texture tile.
 */
export function surface(slot, { tint = '#ffffff', scale = 4, roughness = null, metalness = null, normalScale = 1, envMapIntensity = 1 } = {}) {
  const key = JSON.stringify([slot, tint, scale, roughness, metalness, normalScale]);
  let m = matCache.get(key);
  if (m) return m;
  if (slot === 'rainbow') { m = rainbowMaterial(); matCache.set(key, m); return m; }
  const set = manifest?.tex?.[slot];
  m = new THREE.MeshStandardMaterial({ color: tint, roughness: roughness ?? 0.85, metalness: metalness ?? 0, envMapIntensity });
  if (set) {
    const rep = 1 / scale;
    const setRep = (t) => { t = cloneTex(t); t.repeat.set(rep, rep); return t; };
    if (set.color) m.map = setRep(tex(set.color, true));
    if (set.normal) { m.normalMap = setRep(tex(set.normal, false)); m.normalScale.set(normalScale, normalScale); }
    if (set.rough && roughness === null) { m.roughnessMap = setRep(tex(set.rough, false)); m.roughness = 1; }
    if (set.ao) { m.aoMap = setRep(tex(set.ao, false)); m.aoMapIntensity = 0.8; }
    if (set.metal && metalness === null) { m.metalnessMap = setRep(tex(set.metal, false)); m.metalness = 1; }
  }
  matCache.set(key, m);
  return m;
}

let rainbowTex = null;
function rainbowMaterial() {
  if (!rainbowTex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    const cols = ['#ff3b5c', '#ff8a1f', '#ffd23f', '#5aff7a', '#3fd7ff', '#5a6cff', '#c86bff'];
    const w = 256 / cols.length;
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * w, 0, w + 1, 64); });
    // sparkly seams
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 1; i < cols.length; i++) g.fillRect(i * w - 1, 0, 2, 64);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, 0, 256, 6);
    rainbowTex = new THREE.CanvasTexture(c);
    rainbowTex.colorSpace = THREE.SRGBColorSpace;
    rainbowTex.wrapS = THREE.ClampToEdgeWrapping;
    rainbowTex.wrapT = THREE.RepeatWrapping;
    rainbowTex.repeat.set(1 / 18, 1 / 12); // u spans the 18 m wide road
    rainbowTex.offset.set(0.5, 0);
  }
  const m = new THREE.MeshStandardMaterial({
    map: rainbowTex, emissiveMap: rainbowTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4,
    roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92,
  });
  return m;
}

/** clone a (possibly still loading) texture without flagging it for upload before its image exists
 *  (Texture.copy sets needsUpdate → "Texture marked for update but no image data found" spam) */
export function cloneTex(t) {
  const c = t.clone();
  if (!t.image && pending.has(t)) { c.version = 0; pending.get(t).push(c); }
  return c;
}

export const WATER = () => manifest?.water;
export const textureAt = (path, srgb = true) => tex(path, srgb);

// ---------- v3 road detail: procedural, non-tiling-looking overlay (MK roads are dense with wear) ----------
// One RGBA DataTexture, u across the road (−H..H), v along it. R = tyre streaks + skids, G = cracks + sealant,
// B = patches, A = low-frequency macro variation (0.5 = neutral). The shader samples it twice at different periods.
export const DETAIL = { W: 512, H: 2048, PERIOD_A: 180, PERIOD_B: 131 };
let detailTex = null;
export function roadDetailTexture(roadHalf = 10.5) {
  if (detailTex) return detailTex;
  const { W, H: Hh, PERIOD_A } = DETAIL;
  const pxU = W / (2 * roadHalf), pxV = Hh / PERIOD_A; // pixels per world unit across / along
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const canvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh); return [c, g]; };
  const X = (lat) => (lat + roadHalf) * pxU, Y = (s) => s * pxV;
  // draw a path in world units, wrapping along v so the texture tiles seamlessly
  const wrapDraw = (g, fn) => { for (const off of [-PERIOD_A, 0, PERIOD_A]) { g.save(); g.translate(0, Y(off)); fn(); g.restore(); } };

  // R: tyre streaks
  const [cR, gR] = canvas();
  gR.lineCap = 'round';
  for (const lane of [-4.4, 4.4, -1.2, 1.2]) {
    // broad soft wear band along the racing line
    const gr = gR.createLinearGradient(X(lane - 2.2), 0, X(lane + 2.2), 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${Math.abs(lane) > 3 ? 0.22 : 0.12})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    gR.fillStyle = gr; gR.fillRect(X(lane - 2.2), 0, X(lane + 2.2) - X(lane - 2.2), Hh);
  }
  for (let i = 0; i < 70; i++) {
    const lat = (rnd() - 0.5) * 2 * (roadHalf - 1.2), s = rnd() * PERIOD_A, len = 15 + rnd() * 90, w = 0.08 + rnd() * 0.22, curve = (rnd() - 0.5) * 1.6;
    const a = 0.12 + rnd() * 0.35;
    wrapDraw(gR, () => {
      gR.strokeStyle = `rgba(255,255,255,${a})`; gR.lineWidth = w * pxU;
      gR.beginPath(); gR.moveTo(X(lat), Y(s)); gR.quadraticCurveTo(X(lat + curve), Y(s + len / 2), X(lat + curve * 0.3), Y(s + len)); gR.stroke();
    });
  }
  // skid marks: pairs of dark arcs a kart track apart
  for (let i = 0; i < 9; i++) {
    const lat = (rnd() - 0.5) * 2 * (roadHalf - 3), s = rnd() * PERIOD_A, len = 5 + rnd() * 12, bend = (rnd() - 0.5) * 3;
    wrapDraw(gR, () => {
      for (const o of [-0.7, 0.7]) {
        gR.strokeStyle = 'rgba(255,255,255,0.75)'; gR.lineWidth = 0.22 * pxU;
        gR.beginPath(); gR.moveTo(X(lat + o), Y(s)); gR.quadraticCurveTo(X(lat + o + bend * 0.2), Y(s + len * 0.5), X(lat + o + bend), Y(s + len)); gR.stroke();
      }
    });
  }
  // oil drips
  for (let i = 0; i < 40; i++) {
    const lat = (rnd() - 0.5) * 6, s = rnd() * PERIOD_A, r = 0.15 + rnd() * 0.35;
    wrapDraw(gR, () => { gR.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.3})`; gR.beginPath(); gR.ellipse(X(lat), Y(s), r * pxU, r * pxV * 1.6, 0, 0, Math.PI * 2); gR.fill(); });
  }

  // G: cracks (random walks with branches) + tar sealant snakes
  const [cG, gG] = canvas();
  gG.lineCap = 'round'; gG.lineJoin = 'round';
  const crack = (lat, s, dirA, steps, width, a) => {
    const pts = [[lat, s]];
    let ang = dirA;
    for (let k = 0; k < steps; k++) {
      ang += (rnd() - 0.5) * 0.9;
      const st = 0.25 + rnd() * 0.45;
      lat += Math.cos(ang) * st; s += Math.sin(ang) * st;
      if (Math.abs(lat) > roadHalf - 0.3) break;
      pts.push([lat, s]);
      if (rnd() < 0.06 && steps > 8) crack(lat, s, ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.8), (steps * 0.4) | 0, width * 0.7, a * 0.8);
    }
    wrapDraw(gG, () => {
      gG.strokeStyle = `rgba(255,255,255,${a})`; gG.lineWidth = Math.max(1, width * pxU);
      gG.beginPath(); pts.forEach(([x, y], k) => (k ? gG.lineTo(X(x), Y(y)) : gG.moveTo(X(x), Y(y)))); gG.stroke();
    });
  };
  for (let i = 0; i < 26; i++) crack((rnd() - 0.5) * 2 * (roadHalf - 1), rnd() * PERIOD_A, rnd() < 0.5 ? Math.PI / 2 : rnd() * Math.PI, 12 + (rnd() * 30) | 0, 0.05 + rnd() * 0.04, 0.6 + rnd() * 0.4);
  for (let i = 0; i < 8; i++) crack(-roadHalf + 0.5, rnd() * PERIOD_A, (rnd() - 0.5) * 0.6, 20 + (rnd() * 20) | 0, 0.06, 0.8); // transverse
  // alligator cracking: a few dense clusters
  for (let i = 0; i < 4; i++) {
    const cl = (rnd() - 0.5) * 2 * (roadHalf - 3), cs = rnd() * PERIOD_A;
    for (let k = 0; k < 14; k++) crack(cl + (rnd() - 0.5) * 2.5, cs + (rnd() - 0.5) * 4, rnd() * Math.PI * 2, 5 + (rnd() * 5) | 0, 0.04, 0.7);
  }
  // sealant: wide smooth dark snakes
  for (let i = 0; i < 7; i++) {
    let lat = (rnd() - 0.5) * 2 * (roadHalf - 2), s = rnd() * PERIOD_A, ang = Math.PI / 2 + (rnd() - 0.5) * 1.2;
    const pts = [[lat, s]];
    for (let k = 0; k < 30; k++) { ang += (rnd() - 0.5) * 0.35; lat += Math.cos(ang) * 0.5; s += Math.sin(ang) * 0.5; if (Math.abs(lat) > roadHalf - 0.5) break; pts.push([lat, s]); }
    wrapDraw(gG, () => {
      gG.strokeStyle = 'rgba(255,255,255,0.45)'; gG.lineWidth = 0.18 * pxU;
      gG.beginPath(); pts.forEach(([x, y], k) => (k ? gG.lineTo(X(x), Y(y)) : gG.moveTo(X(x), Y(y)))); gG.stroke();
    });
  }

  // B: patches (newer, darker asphalt rectangles, softened)
  const [cB, gB] = canvas();
  for (let i = 0; i < 16; i++) {
    const w = 1.5 + rnd() * 5, l = 2.5 + rnd() * 12, lat = (rnd() - 0.5) * 2 * (roadHalf - w / 2 - 0.4), s = rnd() * PERIOD_A, a = 0.5 + rnd() * 0.5;
    wrapDraw(gB, () => { gB.fillStyle = `rgba(255,255,255,${a})`; gB.beginPath(); gB.roundRect(X(lat - w / 2), Y(s), w * pxU, l * pxV, 0.25 * pxU); gB.fill(); });
  }
  // full-width resurfacing strips now and then
  for (let i = 0; i < 2; i++) { const s = rnd() * PERIOD_A, l = 3 + rnd() * 5; wrapDraw(gB, () => { gB.fillStyle = 'rgba(255,255,255,0.35)'; gB.fillRect(0, Y(s), W, l * pxV); }); }

  // A: macro variation (big soft blotches around neutral grey)
  const [cA, gA] = canvas();
  gA.fillStyle = '#808080'; gA.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 160; i++) {
    const lat = (rnd() - 0.5) * 2 * roadHalf, s = rnd() * PERIOD_A, r = 1.5 + rnd() * 6, v = rnd() < 0.5 ? 255 : 0;
    wrapDraw(gA, () => {
      for (const ox of [-2 * roadHalf, 0, 2 * roadHalf]) {
        const gr = gA.createRadialGradient(X(lat + ox), Y(s), 0, X(lat + ox), Y(s), r * pxU);
        gr.addColorStop(0, `rgba(${v},${v},${v},0.28)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        gA.fillStyle = gr; gA.save(); gA.translate(X(lat + ox), Y(s)); gA.scale(1, pxV / pxU); gA.translate(-X(lat + ox), -Y(s));
        gA.beginPath(); gA.arc(X(lat + ox), Y(s), r * pxU, 0, Math.PI * 2); gA.fill(); gA.restore();
      }
    });
  }
  const read = (c, blur) => {
    if (blur) { const [c2, g2] = canvas(); g2.filter = `blur(${blur}px)`; g2.drawImage(c, 0, 0); c = c2; }
    return c.getContext('2d').getImageData(0, 0, W, Hh).data;
  };
  const R = read(cR, 1.2), Gc = read(cG, 0), B = read(cB, 2.5), A = read(cA, 4);
  const data = new Uint8Array(W * Hh * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = R[i]; data[i + 1] = Gc[i]; data[i + 2] = B[i]; data[i + 3] = A[i]; }
  const t = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
  t.wrapS = THREE.MirroredRepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

// mean linear albedo of each road texture (measured) → gain so dark scans (asphalt ≈ 0.024) read MK mid-grey
const TEX_MEAN = { asphalt: 0.024, planks: 0.09, paving: 0.25, metalplate: 0.2, tiles: 0.7, concrete: 0.48 };

/**
 * Road/line/terrain material with the procedural wear overlay (clone of a surface() material, uv = (lat, s)).
 * opts: { gain, streak, crack, patch, macro, antiTile, wear (paint wear for lines), verge: {half, tint} (terrain) }
 */
export function detailMaterial(base, opts = {}) {
  const m = base.clone();
  const tex = roadDetailTexture();
  const o = { gain: 1, streak: 1, crack: 1, patch: 1, macro: 1, antiTile: 0, wear: 0, ...opts };
  const U = {
    roadDetail: { value: tex }, roadAmt: { value: new THREE.Vector4(o.streak, o.crack, o.patch, o.macro) },
    roadGain: { value: o.gain }, roadHalf: { value: opts.half ?? 10.5 }, roadWear: { value: o.wear },
    vergeTint: { value: new THREE.Color(o.verge?.tint || '#6b5a3a') }, vergeK: { value: o.verge ? 1 : 0 },
  };
  m.userData.detail = U;
  const terrain = !!o.verge;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vRoadUv;${terrain ? '\nattribute float aLat;\nvarying float vLat;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRoadUv = uv;${terrain ? '\nvLat = aLat;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D roadDetail; uniform vec4 roadAmt; uniform float roadGain, roadHalf, roadWear, vergeK; uniform vec3 vergeTint;
        varying vec2 vRoadUv;${terrain ? '\nvarying float vLat;' : ''}`)
      .replace('#include <map_fragment>', `
        ${terrain
          ? `vec2 rdA = vec2(vRoadUv.x / 61.0, vRoadUv.y / 97.0); vec2 rdB = vec2(vRoadUv.x / 43.0 + 0.3, vRoadUv.y / 71.0 + 0.37);`
          : `vec2 rdA = vec2(vRoadUv.x / (2.0 * roadHalf) + 0.5, vRoadUv.y / ${DETAIL.PERIOD_A.toFixed(1)});
             vec2 rdB = vec2(0.5 - vRoadUv.x / (2.0 * roadHalf), vRoadUv.y / ${DETAIL.PERIOD_B.toFixed(1)} + 0.37);`}
        vec4 dA = texture2D(roadDetail, rdA);
        vec4 dB = texture2D(roadDetail, rdB);
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          ${o.antiTile ? `vec4 sd2 = texture2D(map, vMapUv * 0.583 + vec2(0.37, 0.21));
          sampledDiffuseColor = mix(sampledDiffuseColor, sd2, smoothstep(0.38, 0.62, dA.a) * ${o.antiTile.toFixed(2)});` : ''}
          diffuseColor *= sampledDiffuseColor;
        #endif
        diffuseColor.rgb *= roadGain;
        float rStreak = dA.r * roadAmt.x, rCrack = dB.g * roadAmt.y, rPatch = dA.b * roadAmt.z;
        diffuseColor.rgb *= (1.0 + (dB.a - 0.5) * 0.9 * roadAmt.w) * (1.0 - 0.5 * rStreak) * (1.0 - 0.5 * rCrack) * (1.0 - 0.3 * rPatch);
        ${o.wear ? `float pw = smoothstep(0.5, 0.75, dA.a * 0.7 + dB.r * 0.6 + dA.g * 0.5) * roadWear;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.05, 0.055), pw);` : ''}
        ${terrain ? `float vg = (1.0 - smoothstep(roadHalf + 1.7, roadHalf + 4.8 + 2.5 * dB.a, abs(vLat))) * vergeK;
        diffuseColor.rgb = mix(diffuseColor.rgb, vergeTint, vg * 0.55);` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 - 0.3 * rStreak) * (1.0 - 0.12 * rPatch), 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => 'detail|' + (terrain ? 't' : '') + (o.antiTile ? 'a' : '') + (o.wear ? 'w' : '');
  return m;
}
export function roadGainFor(slot) { return Math.max(1, 0.21 / (TEX_MEAN[slot] ?? 0.3)); }
