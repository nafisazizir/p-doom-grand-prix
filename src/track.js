// The road (procedural ribbon), sky dome, fog, scenery spawning/recycling per section theme, and section gates.
import * as THREE from 'three';
import { toon, glow, G, mesh, billboard, textPanel, makeRng, hashSeed, lerp, clamp, smooth } from './toolkit.js';
import { getTheme } from './themes/index.js';

export const SPEED = 30; // world units per second of song time (forward)
export const ROAD_HALF = 7;
export const LANE = 5.6; // normalized x ∈ [-1,1] → ±LANE world units
export const FAR = 230; // spawn distance ahead
const BEHIND = 25;

const ROW_STEP = 2.5;
const ROWS = Math.ceil((FAR + BEHIND + 20) / ROW_STEP);

export class Track {
  constructor(scene, sections) {
    this.scene = scene;
    this.sections = sections;
    this.secZ = sections.map((s) => s.start * SPEED);
    const last = sections[sections.length - 1];
    this.rampZ = (last.theme === 'takeoff' ? last.start : last.end) * SPEED;
    this.rampLen = Math.max(1, (last.end - last.start) * SPEED);
    this.active = []; // {obj, key, zf, theme, kind}
    this.pools = new Map();
    this.nextPropZ = -BEHIND;
    this.nextBillboardZ = 40;
    this.billboardIdx = new Map();
    this.gates = new Map();
    this.time = 0;
    this._buildRoad();
    this._buildSky();
    this.scene.fog = new THREE.Fog(0xffffff, 70, FAR);
    this.pal = this._palette(0);
  }

  // ---------- geometry of the centre line ----------
  center(zf, out = { x: 0, y: 0 }) {
    // gentle sway; straightened in the intro so the tutorial is calm
    const sway = smooth(clamp(zf / 400, 0, 1));
    out.x = sway * (10 * Math.sin(zf * 0.0045) + 4 * Math.sin(zf * 0.0123 + 1.3));
    let y = 0;
    if (zf > this.rampZ) {
      const u = (zf - this.rampZ) / this.rampLen;
      y = 140 * u * u * u + 10 * u; // exponential-ish takeoff ramp
    }
    out.y = y;
    return out;
  }
  sectionIndexAtZ(zf) {
    for (let i = this.secZ.length - 1; i >= 0; i--) if (zf >= this.secZ[i]) return i;
    return 0;
  }
  themeAtZ(zf) {
    return getTheme(this.sections[this.sectionIndexAtZ(zf)].theme);
  }
  /** world position of normalized lateral x at forward distance zf */
  worldPos(zf, xNorm, yOff = 0, out = new THREE.Vector3()) {
    const c = this.center(zf, _c);
    return out.set(c.x + xNorm * LANE, c.y + yOff, -zf);
  }

  // ---------- road ribbon ----------
  _buildRoad() {
    const mk = (cols) => {
      const g = new THREE.BufferGeometry();
      const n = ROWS * cols.length;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const idx = [];
      for (let r = 0; r < ROWS - 1; r++) {
        for (let c = 0; c < cols.length - 1; c++) {
          const a = r * cols.length + c, b = a + 1, d = a + cols.length, e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
      g.setIndex(idx);
      return g;
    };
    // road texture: dashed centre line + edge lines (white = tinted by vertex colour)
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
    // subtle stripes for speed feel
    g.fillStyle = '#bdbdbd';
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 10);
    g.fillStyle = '#ffffff';
    g.fillRect(8, 0, 8, 256); g.fillRect(240, 0, 8, 256);
    g.fillRect(122, 0, 12, 140);
    g.fillRect(60, 0, 4, 60); g.fillRect(192, 0, 4, 60);
    const roadTex = new THREE.CanvasTexture(c);
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.colorSpace = THREE.SRGBColorSpace;
    roadTex.anisotropy = 8;

    const kc = document.createElement('canvas');
    kc.width = 8; kc.height = 64;
    const kg = kc.getContext('2d');
    kg.fillStyle = '#ffffff'; kg.fillRect(0, 0, 8, 64);
    kg.fillStyle = '#ff3b5c'; kg.fillRect(0, 0, 8, 32);
    const kerbTex = new THREE.CanvasTexture(kc);
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.magFilter = THREE.NearestFilter;
    kerbTex.colorSpace = THREE.SRGBColorSpace;

    const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };
    this.roadCols = [-ROAD_HALF, ROAD_HALF];
    this.road = new THREE.Mesh(mk(this.roadCols), noOutline(new THREE.MeshLambertMaterial({ vertexColors: true, map: roadTex })));
    this.kerbColsL = [-ROAD_HALF - 1.1, -ROAD_HALF];
    this.kerbColsR = [ROAD_HALF, ROAD_HALF + 1.1];
    const kerbMat = noOutline(new THREE.MeshLambertMaterial({ vertexColors: true, map: kerbTex }));
    this.kerb = new THREE.Mesh(mk(this.kerbColsL), kerbMat);
    this.kerbR = new THREE.Mesh(mk(this.kerbColsR), kerbMat);
    this.groundCols = [-260, -60, -ROAD_HALF - 1.0, ROAD_HALF + 1.0, 60, 260];
    this.ground = new THREE.Mesh(mk(this.groundCols), noOutline(new THREE.MeshLambertMaterial({ vertexColors: true })));
    for (const m of [this.road, this.kerb, this.kerbR, this.ground]) { m.frustumCulled = false; this.scene.add(m); }
    this.road.renderOrder = 1;
  }

  _updateRibbon(meshObj, cols, z0, colorFn, yFn, uvScale) {
    const pos = meshObj.geometry.attributes.position.array;
    const col = meshObj.geometry.attributes.color.array;
    const uv = meshObj.geometry.attributes.uv.array;
    let p = 0, q = 0, u = 0;
    const start = Math.floor(z0 / ROW_STEP) * ROW_STEP;
    for (let r = 0; r < ROWS; r++) {
      const zf = start + r * ROW_STEP;
      const c = this.center(zf, _c);
      const color = colorFn(zf);
      for (let k = 0; k < cols.length; k++) {
        const lat = cols[k];
        pos[p++] = c.x + lat; pos[p++] = c.y + yFn(lat, zf); pos[p++] = -zf;
        col[q++] = color.r; col[q++] = color.g; col[q++] = color.b;
        uv[u++] = k / (cols.length - 1); uv[u++] = zf / uvScale;
      }
    }
    const g = meshObj.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.uv.needsUpdate = true;
    g.computeBoundingSphere();
  }

  _palette(i) {
    const th = getTheme(this.sections[i].theme);
    const p = th.palette;
    const C = (v, d) => new THREE.Color(v ?? d);
    return {
      skyTop: C(p.skyTop, '#5ab0ff'), skyBottom: C(p.skyBottom, '#ffd6a0'), fog: C(p.fog ?? p.skyBottom, '#ffd6a0'),
      road: C(p.road, '#555566'), ground: C(p.ground, '#7ac36a'), kerb: C(p.kerb ?? p.accent1, '#ffffff'),
      accent1: C(p.accent1, '#ff5ca8'), accent2: C(p.accent2, '#ffd23f'), stars: th.night ? 1 : 0,
    };
  }

  // ---------- sky ----------
  _buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#5ab0ff') }, bottom: { value: new THREE.Color('#ffd6a0') }, red: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float red; varying vec3 vP;
        void main(){ float h = clamp(vP.y*1.6+0.15, 0.0, 1.0); vec3 c = mix(bottom, top, smoothstep(0.0,1.0,h));
        c = mix(c, vec3(0.75,0.08,0.1)*(0.6+0.4*h), red*0.35); gl_FragColor = vec4(c,1.0); }`,
    });
    this.skyMat.userData.outlineParameters = { visible: false };
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    // stars
    const n = 900, arr = new Float32Array(n * 3);
    const r = makeRng(7);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      arr[i * 3] = 520 * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = 520 * Math.cos(ph) - 40;
      arr[i * 3 + 2] = 520 * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.scene.add(this.stars);
  }

  // ---------- per-frame ----------
  /** camZ: forward distance of the camera; t: song time; redness 0..1 for doom */
  update(kartZ, camPos, t, beatPhase, redness, dt) {
    this.time = t;
    const z0 = kartZ - BEHIND;
    // palette blend around section changes (blend over last ~20 units before a gate)
    const si = this.sectionIndexAtZ(kartZ);
    const cur = this._palCache(si);
    let pal = cur;
    const nextZ = this.secZ[si + 1];
    if (nextZ !== undefined && nextZ - kartZ < 30) {
      const k = smooth(1 - (nextZ - kartZ) / 30);
      pal = this._blend(cur, this._palCache(si + 1), k);
    }
    this.pal = pal;
    this.skyMat.uniforms.top.value.copy(pal.skyTop);
    this.skyMat.uniforms.bottom.value.copy(pal.skyBottom);
    this.skyMat.uniforms.red.value = redness;
    this.scene.fog.color.copy(pal.fog).lerp(_red, redness * 0.25);
    this.starMat.opacity = pal.stars;
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);

    const roadColor = (zf) => this._palCache(this.sectionIndexAtZ(zf)).road;
    const kerbColor = (zf) => this._palCache(this.sectionIndexAtZ(zf)).kerb;
    const groundColor = (zf) => this._palCache(this.sectionIndexAtZ(zf)).ground;
    this._updateRibbon(this.road, this.roadCols, z0, roadColor, () => 0.0, 24);
    this._updateRibbon(this.kerb, this.kerbColsL, z0, kerbColor, () => 0.1, 8);
    this._updateRibbon(this.kerbR, this.kerbColsR, z0, kerbColor, () => 0.1, 8);
    this._updateRibbon(this.ground, this.groundCols, z0, groundColor, (lat) => (Math.abs(lat) > 100 ? -8 : -0.15), 50);

    // --- recycle passed props
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.zf < kartZ - BEHIND) {
        a.obj.visible = false;
        this.scene.remove(a.obj);
        if (!this.pools.has(a.key)) this.pools.set(a.key, []);
        this.pools.get(a.key).push(a.obj);
        this.active.splice(i, 1);
      }
    }
    // --- spawn scenery ahead
    let guard = 0;
    while (this.nextPropZ < kartZ + FAR && guard++ < 200) {
      const zf = this.nextPropZ;
      const sIdx = this.sectionIndexAtZ(zf);
      const sec = this.sections[sIdx];
      const th = getTheme(sec.theme);
      const rng = makeRng(hashSeed(sec.id, Math.round(zf)));
      const placements = th.layout ? th.layout(zf, rng, sec) : [];
      for (const p of placements) this._spawn(th, p, zf + (p.dz || 0));
      this.nextPropZ += th.spacing || 10;
    }
    guard = 0;
    while (this.nextBillboardZ < kartZ + FAR && guard++ < 20) {
      const zf = this.nextBillboardZ;
      const sIdx = this.sectionIndexAtZ(zf);
      const th = getTheme(this.sections[sIdx].theme);
      if (th.billboards && th.billboards.length && zf - this.secZ[sIdx] > 25) {
        const k = (this.billboardIdx.get(th.id) || 0);
        this.billboardIdx.set(th.id, k + 1);
        const text = th.billboards[k % th.billboards.length];
        const side = k % 2 === 0 ? 1 : -1;
        this._spawn(th, { kind: '__bb:' + text, x: side * (ROAD_HALF + 6.5), y: 0, rotY: -side * 0.35, make: () => billboard(text, th.billboardStyle || {}) }, zf);
      }
      this.nextBillboardZ += th.billboardEvery || 75;
    }
    // --- gates
    for (let i = 1; i < this.sections.length; i++) {
      const gz = this.secZ[i];
      if (gz > kartZ - BEHIND && gz < kartZ + FAR) {
        if (!this.gates.has(i)) {
          const gate = this._makeGate(i);
          this.gates.set(i, gate);
          this.scene.add(gate);
        }
      } else if (this.gates.has(i)) {
        this.scene.remove(this.gates.get(i));
        this.gates.delete(i);
      }
    }
    // --- animate
    for (const a of this.active) {
      if (a.theme.animate) a.theme.animate(a.obj, a.kind, t, beatPhase, a);
    }
    for (const [, gate] of this.gates) {
      gate.userData.lights?.forEach((l, k) => { l.visible = Math.floor(t * 8 + k) % 2 === 0; });
    }
  }

  _palCache(i) {
    this._pals ||= [];
    i = clamp(i, 0, this.sections.length - 1);
    return (this._pals[i] ||= this._palette(i));
  }
  _blend(a, b, k) {
    const o = {};
    for (const key of Object.keys(a)) o[key] = typeof a[key] === 'number' ? lerp(a[key], b[key], k) : a[key].clone().lerp(b[key], k);
    return o;
  }

  _spawn(th, p, zf) {
    const key = th.id + ':' + p.kind;
    let obj;
    const pool = this.pools.get(key);
    if (pool && pool.length) obj = pool.pop();
    else {
      obj = p.make ? p.make() : th.makeProp(p.kind);
      if (!obj) return;
    }
    const c = this.center(zf, _c);
    obj.position.set(c.x + (p.x || 0), c.y + (p.y || 0), -zf);
    obj.rotation.set(0, p.rotY || 0, 0);
    const s = p.scale || 1;
    obj.scale.set(s, s, s);
    obj.visible = true;
    this.scene.add(obj);
    this.active.push({ obj, key, zf, theme: th, kind: p.kind, data: p.data, seed: (zf * 13.37) % 1 });
  }

  _makeGate(i) {
    const sec = this.sections[i];
    const th = getTheme(sec.theme);
    const pal = this._palCache(i);
    const g = new THREE.Group();
    const w = ROAD_HALF * 2 + 4;
    const colA = '#' + pal.accent1.getHexString(), colB = '#' + pal.accent2.getHexString();
    g.add(mesh(G.rbox(1.4, 9, 1.4, 0.3), toon(colA), -w / 2, 4.5, 0));
    g.add(mesh(G.rbox(1.4, 9, 1.4, 0.3), toon(colA), w / 2, 4.5, 0));
    g.add(mesh(G.rbox(w + 2.4, 2.6, 1.2, 0.3), toon(colB), 0, 9.5, 0));
    const label = `TRACK ${i + 1}: ${th.title || sec.theme.toUpperCase()}`;
    const p = textPanel(label, { width: w + 1.6, height: 2.1, bg: colB, fg: '#2b1840', border: null, borderW: 0, radius: 10 });
    p.position.set(0, 9.5, 0.65);
    g.add(p);
    const lights = [];
    for (let k = 0; k < 10; k++) {
      const l = mesh(G.sphere(0.28, 8), glow(k % 2 ? '#ffffff' : colA), -w / 2 + (k + 0.5) * (w / 10), 11.1, 0.4);
      lights.push(l); g.add(l);
    }
    g.userData.lights = lights;
    const c = this.center(this.secZ[i], _c);
    g.position.set(c.x, c.y, -this.secZ[i]);
    return g;
  }

  /** Clear scenery (on seek). */
  reset(kartZ) {
    for (const a of this.active) { this.scene.remove(a.obj); }
    this.active.length = 0;
    for (const [, gte] of this.gates) this.scene.remove(gte);
    this.gates.clear();
    this.nextPropZ = Math.max(-BEHIND, kartZ - BEHIND);
    this.nextBillboardZ = Math.max(40, kartZ + 30);
  }
}

const _c = { x: 0, y: 0 };
const _red = new THREE.Color('#ff2020');
