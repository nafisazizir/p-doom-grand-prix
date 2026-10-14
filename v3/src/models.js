// CC0 glTF models (Poly Haven, vendored in assets/v2/models). Preloaded once at boot, then cloned synchronously.
// Usage in a theme's makeProp: `model('rock_09', { size: 4 })` → THREE.Object3D (or a fallback box if not loaded).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getManifest, ROOT } from './textures.js';

const cache = new Map(); // id → { scene, size: Vector3 }

/** extra: { id: { file, alphaMap? } } — v3 themes contribute their own models via `theme.models` (paths from the project root) */
export async function preloadModels(extra = {}) {
  const man = getManifest();
  const all = { ...(man?.models || {}), ...extra };
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(all).map(async ([id, info]) => {
    try {
      const gltf = await loader.loadAsync(new URL(info.file, ROOT).href);
      const scene = gltf.scene;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (info.alphaMap && o.material) {
          // leaves: cut out with the separate alpha mask
          const tex = new THREE.TextureLoader().load(new URL(info.alphaMap, ROOT).href);
          tex.flipY = false;
          o.material.alphaMap = tex;
          o.material.alphaTest = 0.5;
          o.material.transparent = false;
          o.material.side = THREE.DoubleSide;
        }
      });
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // normalise: centred on x/z, resting on y = 0
      scene.position.set(-center.x, -box.min.y, -center.z);
      const wrap = new THREE.Group();
      wrap.add(scene);
      cache.set(id, { scene: wrap, size });
    } catch (e) { console.warn('model', id, e); }
  }));
}

/** ids available (after preload) */
export function modelIds() { return [...cache.keys()]; }

/**
 * Clone a model. opts.size = target largest dimension in world units (default: native).
 * opts.tint = colour multiplied into the materials (clones the materials once per call).
 */
export function model(id, { size = null, tint = null } = {}) {
  const c = cache.get(id);
  if (!c) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#888' }));
    g.position.y = 0.5;
    const w = new THREE.Group(); w.add(g);
    if (size) w.scale.setScalar(size);
    return w;
  }
  const obj = c.scene.clone(true);
  if (size) {
    const m = Math.max(c.size.x, c.size.y, c.size.z);
    obj.scale.setScalar(size / m);
  }
  if (tint) {
    obj.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); }
    });
  }
  return obj;
}
