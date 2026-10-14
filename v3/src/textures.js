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
