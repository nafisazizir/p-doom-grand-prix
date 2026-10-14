// v2 track: the Course swept into static geometry once (road, kerbs, terrain, bridges, tunnels, rainbow road,
// water), plus theme props spawned/recycled along the way and section gates.
import * as THREE from 'three';
import { toon, glow, G, mesh, billboard, textPanel, makeRng, hashSeed, clamp, smooth, MAT } from './toolkit.js';
import { getTheme } from './themes/index.js';
import { Course, SPEED, ROAD_HALF, LANE, V2_ROAD_HALF } from './course.js';
import { lookFor } from './looks.js';
import { surface, WATER, textureAt, cloneTex, detailMaterial, roadGainFor } from './textures.js';

export { SPEED, ROAD_HALF, LANE };
export const FAR = 330;
const BEHIND = 30;
const H = ROAD_HALF;
const TUNNEL_W = H + 10;
// MK proportions (PLAN-V3): kerbs 0.5–2 kw wide, lane dashes 0.1–0.2 kw wide, ≈10 kw long with ≈10 kw gaps
const KERB_W = 1.6, KERB_H = 0.2;
const DASH = 16, DASH_W = 0.26, EDGE_IN = H - 0.62, EDGE_OUT = H - 0.34;

// ---------- noise ----------
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; } return s; }

export class Track {
  constructor(scene, sections, renderer) {
    this.scene = scene;
    this.sections = sections;
    this.R = renderer;
    this.course = new Course(SPEED);
    this.secZ = sections.map((s) => s.start * SPEED);
    this.active = [];
    this.pools = new Map();
    this.nextPropZ = -BEHIND;
    this.nextBillboardZ = 60;
    this.billboardIdx = new Map();
    this.gates = new Map();
    this.waters = [];
    this.lookIdx = -1;
    this.lookKey = '';
    this.pal = { skyTop: new THREE.Color(), road: new THREE.Color() };
    this.static = new THREE.Group();
    scene.add(this.static);
    this._buildStatic();
  }

  // ---------- queries ----------
  sectionIndexAtZ(zf) {
    for (let i = this.secZ.length - 1; i >= 0; i--) if (zf >= this.secZ[i]) return i;
    return 0;
  }
  themeAtZ(zf) { return getTheme(this.sections[this.sectionIndexAtZ(zf)].theme); }
  /** world position of normalized lateral x at forward distance zf (follows banking + hop jumps) */
  worldPos(zf, xNorm, yOff = 0, out = new THREE.Vector3()) {
    return this.course.pos(zf, xNorm, yOff + this.course.hopAt(zf), out);
  }
  /** v1 compatibility: centre point */
  center(zf, out = { x: 0, y: 0 }) {
    const f = this.course.frame(zf, _fr);
    out.x = f.x; out.y = f.y; out.z = f.z;
    return out;
  }

  // ---------- terrain model ----------
  _mode(s) {
    const f = this.course.featuresAt(s);
    if (f.rainbow || (f.jump && f.jump.glide) || (f.space && !f.tunnel)) return { kind: 'none', f };
    if (f.bridge) return { kind: 'water', f };
    if (f.highway) return { kind: 'highway', f };
    return { kind: 'normal', f, cliff: f.cliff ? f.cliff.side : 0 };
  }
  _hills(s, lat, look) {
    const a = Math.abs(lat);
    const amp = (look?.hills ?? 1) * (a < H + 8 ? 0 : a < 40 ? (a - H - 8) / (40 - H - 8) * 6 : a < 120 ? 6 + (a - 40) * 0.35 : 34 + (a - 120) * 0.45);
    return Math.min(amp, 48 * (look?.hills ?? 1)) * (fbm(s * 0.006 + (lat > 0 ? 50 : 0), a * 0.012) - 0.25);
  }
  /** how far terrain may extend sideways before it would reach over another part of the course */
  _clearance(s, side) {
    const C = this.course;
    if (!this._pts) {
      this._pts = [];
      for (let q = C.s0; q < C.s1; q += 8) { const f = C.frame(q, {}); this._pts.push([q, f.x, f.y, f.z]); }
    }
    const f = C.frame(s, _frC);
    const rx = Math.cos(f.yaw) * side, rz = Math.sin(f.yaw) * side;
    let best = 1e9;
    for (const [q, x, y, z] of this._pts) {
      if (Math.abs(q - s) < 140 || Math.abs(y - f.y) > 70) continue;
      const dx = x - f.x, dz = z - f.z;
      const u = dx * rx + dz * rz;
      if (u <= 0) continue;
      const v = Math.abs(dx * rz - dz * rx);
      if (v < u * 0.8 + 30) best = Math.min(best, u * 0.5 - 6);
    }
    return Math.max(H + 6, best);
  }

  /** worst-case curvature (rad/unit) around s, signed (+ = turning right) */
  _curv(s) {
    const C = this.course;
    let best = 0;
    for (let d = -60; d <= 60; d += 10) {
      const k = (C.frame(s + d + 4, _frC).yaw - C.frame(s + d - 4, _frC).yaw) / 8;
      if (Math.abs(k) > Math.abs(best)) best = k;
    }
    return best;
  }
  _groundBase(s, feat) {
    // height of the land under bridges/highways: the road height where the feature began
    const f0 = feat.s[0];
    return this.course.frame(f0, _frG).y - (feat.type === 'bridge' ? 9 : 2);
  }
  /** terrain height (world y) at arc length s and lateral offset (yaw frame). null = no ground there */
  terrainY(s, lat) {
    const m = this._mode(s);
    const f = this.course.frame(s, _frT);
    const look = lookFor(this.themeAtZ(s));
    if (m.kind === 'none') return null;
    if (m.kind === 'water') {
      const base = this._groundBase(s, m.f.bridge);
      if (Math.abs(lat) < 45) return null;
      return base + 2 + this._hills(s, lat, look) + (Math.abs(lat) - 45) * 0.15;
    }
    if (m.kind === 'highway') return this._groundBase(s, m.f.highway) + this._hills(s, lat, look) * 0.6;
    if (m.cliff && Math.sign(lat) === m.cliff && Math.abs(lat) > H + 1) return f.y - 60;
    if (m.f.tunnel && Math.abs(lat) > TUNNEL_W - 2) {
      const a = Math.abs(lat), u = Math.min(1, (a - TUNNEL_W + 2) / 45);
      return f.y + 19 * (1 - u * u) + this._hills(s, lat, lookFor(this.themeAtZ(s))) * u;
    }
    const a = Math.abs(lat);
    const emb = a <= H + KERB_W + 0.1 ? -0.03 : -0.25;
    // match the banked road edge, fading back to level ground further out
    const edge = Math.sign(lat) * Math.min(a, H + KERB_W);
    const bankY = f.ry * edge * (a <= H + 4 ? 1 : Math.max(0, 1 - (a - H - 4) / 30));
    return f.y + bankY + emb + this._hills(s, lat, look);
  }

  // ---------- static geometry ----------
  _sweep(sA, sB, step, profile, material, { frame = 'road', name = '', skip = null, shadow = true, latAttr = false } = {}) {
    // profile(s) → [[lat, h], ...] (same length every row). Returns a Mesh, or null if empty.
    const pos = [], uv = [], idx = [], lats = [];
    let rows = 0, cols = 0;
    const fr = {};
    let prevRowOk = false;
    for (let s = sA; s <= sB + 1e-6; s += step) {
      if (skip && skip(s)) { prevRowOk = false; continue; }
      const prof = profile(s);
      if (!prof) { prevRowOk = false; continue; }
      cols = prof.length;
      this.course.frame(s, fr);
      const cy = Math.cos(fr.yaw), sy = Math.sin(fr.yaw);
      let u = 0;
      for (let k = 0; k < cols; k++) {
        const [lat, h] = prof[k];
        if (frame === 'road') {
          pos.push(fr.x + fr.rx * lat + fr.ux * h, fr.y + fr.ry * lat + fr.uy * h, fr.z + fr.rz * lat + fr.uz * h);
        } else {
          pos.push(fr.x + cy * lat, h, fr.z + sy * lat); // 'level': h is absolute world y
        }
        if (k > 0) {
          const [pl, ph] = prof[k - 1];
          u += Math.hypot(lat - pl, (frame === 'road' ? h - ph : h - ph));
        } else u = lat;
        uv.push(u, s);
        if (latAttr) lats.push(lat);
      }
      if (prevRowOk) {
        const r1 = rows - 1, r2 = rows;
        for (let k = 0; k < cols - 1; k++) {
          const a = r1 * cols + k, b = a + 1, d = r2 * cols + k, e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
      rows++;
      prevRowOk = true;
    }
    if (rows < 2 || !idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (latAttr) g.setAttribute('aLat', new THREE.Float32BufferAttribute(lats, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.castShadow = shadow;
    m.name = name;
    this.static.add(m);
    return m;
  }

  _buildStatic() {
    const C = this.course;
    const sections = this.sections;
    const jumpSkip = (s) => { const f = C.featuresAt(s); return !!f.jump?.glide; }; // hops keep their road (the kart hops over the leak)
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const th = getTheme(sec.theme);
      const look = lookFor(th);
      const sA = i === 0 ? C.s0 : sec.start * SPEED;
      const sB = i === sections.length - 1 ? C.s1 - 2 : sections[i + 1].start * SPEED + 0.01;
      // road (rainbow road where flagged)
      const isRainbow = (s) => !!C.featuresAt(s).rainbow;
      const roadMat = this._roadMat(look);
      const rainbow = surface('rainbow');
      const roadProf = () => [[-H, 0], [-H / 2, 0], [0, 0], [H / 2, 0], [H, 0]];
      this._sweep(sA, sB, 2, roadProf, roadMat, { name: 'road', skip: (s) => jumpSkip(s) || isRainbow(s), shadow: false });
      this._sweep(sA, sB, 2, roadProf, rainbow, { name: 'rainbow', skip: (s) => jumpSkip(s) || !isRainbow(s), shadow: false });
      // lane markings: MK-proportioned dashed centre line + solid edge lines, slightly worn paint
      const lineMat = this._lineMat();
      this._sweep(sA, sB, 2, () => [[-DASH_W / 2, 0.02], [DASH_W / 2, 0.02]], lineMat, { name: 'line', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) || Math.floor(s / DASH) % 2 === 1 || s >= sB - 0.5 });
      for (const side of [-1, 1]) {
        this._sweep(sA, sB, 2, () => (side < 0 ? [[-EDGE_OUT, 0.02], [-EDGE_IN, 0.02]] : [[EDGE_IN, 0.02], [EDGE_OUT, 0.02]]), lineMat, { name: 'edge', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) });
      }
      // kerbs (bold, rounded, striped) or glowing rails on rainbow road
      const kerbMat = this._kerbMat(look);
      const kerbRow = KERB_PROFILE;
      for (const side of [-1, 1]) {
        const kp = kerbRow.map(([t, h]) => [side * (H + t * KERB_W), h]);
        if (side < 0) kp.reverse();
        this._sweep(sA, sB, 2, () => kp, kerbMat, { name: 'kerb', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) || !!C.featuresAt(s).bridge || !!C.featuresAt(s).highway });
        const railProf = () => [[side * (H + 0.2), 0.0], [side * (H + 0.2), 0.9]];
        this._sweep(sA, sB, 2, railProf, glow(side < 0 ? '#3fd7ff' : '#ff4fd8', { side: THREE.DoubleSide, intensity: 3 }), { name: 'rainbowRail', shadow: false, skip: (s) => jumpSkip(s) || !isRainbow(s) });
      }
      // terrain
      const groundMat = this._groundMat(look);
      const lats = [H + KERB_W, H + 4, H + 10, H + 22, H + 45, H + 90, H + 160, H + 300];
      for (const side of [-1, 1]) {
        const prof = (s) => {
          const out = [];
          // on the inside of tight turns, stop the terrain before it folds over itself
          const kap = this._curv(s);
          const inner = kap !== 0 && Math.sign(kap) === side;
          const maxA = Math.min(inner ? Math.max(H + 4, 0.8 / Math.abs(kap)) : 1e9, this._clearance(s, side));
          for (const a0 of lats) {
            const a = Math.min(a0, maxA + (a0 - H) * 0.001);
            const lat = side * a;
            const y = this.terrainY(s, lat);
            if (y === null) return null;
            out.push([lat, y]);
          }
          return side < 0 ? out.reverse() : out;
        };
        this._sweep(sA, sB, 4, prof, groundMat, { frame: 'level', name: 'terrain', shadow: false, latAttr: true });
        // shore/ground under bridges & highways
        const prof2 = (s) => {
          const m = this._mode(s);
          if (m.kind === 'highway') {
            const out = [];
            for (const a of [0, H + KERB_W]) { const lat = side * a; out.push([lat, this.terrainY(s, lat) ?? 0]); }
            return side < 0 ? out.reverse() : out;
          }
          if (m.kind !== 'water') return null;
          const out = [[side * 36, this._groundBase(s, m.f.bridge) - 1.5]];
          for (const a of [45, 90, 160, 300]) { const lat = side * a; out.push([lat, this.terrainY(s, lat)]); }
          return side < 0 ? out.reverse() : out;
        };
        this._sweep(sA, sB, 4, prof2, groundMat, { frame: 'level', name: 'shore', shadow: false, latAttr: true });
        // cliff face
      }
    }
    this._buildFeatures();
  }

  _roadMat(look) {
    const slot = look.road?.tex || 'asphalt';
    const key = JSON.stringify([slot, look.road?.tint, look.road?.scale]);
    this._roadMats ||= {};
    if (this._roadMats[key]) return this._roadMats[key];
    const base = surface(slot, { tint: look.road?.tint || '#8a8a96', scale: look.road?.scale || 6, normalScale: 0.8 });
    const asphalt = slot === 'asphalt';
    return (this._roadMats[key] = detailMaterial(base, {
      gain: (look.road?.gain ?? 1) * roadGainFor(slot), antiTile: asphalt ? 0.85 : 0.5,
      streak: asphalt ? 1 : 0.7, crack: asphalt ? 1 : slot === 'paving' ? 0.4 : 0.15, patch: asphalt ? 1 : 0, macro: 1,
    }));
  }
  _lineMat() {
    return (this._lineMatC ||= detailMaterial(toon('#e9e5da', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { streak: 0.6, crack: 1, patch: 0.4, macro: 0.5, wear: 0.75 }));
  }
  _groundMat(look) {
    const key = JSON.stringify([look.ground?.tex, look.ground?.tint, look.ground?.scale, look.verge]);
    this._groundMats ||= {};
    if (this._groundMats[key]) return this._groundMats[key];
    const base = surface(look.ground?.tex || 'grass', { tint: look.ground?.tint || '#8fc070', scale: look.ground?.scale || 6 });
    // verge: the ground next to the kerb is worn to dirt (MK), darker version of the ground tint by default
    const vt = new THREE.Color(look.verge || look.ground?.tint || '#8fc070').multiply(_vergeMul);
    return (this._groundMats[key] = detailMaterial(base, { streak: 0, crack: 0, patch: 0, macro: 0.7, antiTile: 0.9, verge: { tint: '#' + vt.getHexString() } }));
  }

  _kerbMat(look) {
    if (!this._kerbTex) {
      // smooth-edged stripes (8 world units per red+white pair), slightly rounded colour transitions
      const c = document.createElement('canvas');
      c.width = 4; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#f6f2ea'); gr.addColorStop(0.47, '#f6f2ea'); gr.addColorStop(0.5, '#e02a40'); gr.addColorStop(0.97, '#e02a40'); gr.addColorStop(1, '#f6f2ea');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(1, 1 / 8);
      t.anisotropy = 8;
      this._kerbTex = t;
    }
    const key = look.kerb || 'std';
    this._kerbMats ||= {};
    return (this._kerbMats[key] ||= detailMaterial(new THREE.MeshStandardMaterial({ map: this._kerbTex, roughness: 0.42, color: look.kerb || '#ffffff' }), { streak: 0.5, crack: 0.3, patch: 0, macro: 0.35 }));
  }

  _buildFeatures() {
    const C = this.course;
    for (const f of C.features) {
      const [sA, sB] = f.s;
      if (f.type === 'bridge' || f.type === 'highway') this._bridge(f, sA, sB);
      if (f.type === 'tunnel') this._tunnel(f, sA, sB);
      if (f.water) this._water(f, sA, sB);
      if (f.type === 'grid') this._startGrid();
      if (f.type === 'cliff') this._cliff(f, sA, sB);
      if (f.type === 'jump' && f.glide) this._landing(f);
    }
  }

  /** AGI WINGS landing zone at the end of the glide: glowing chevron runway, edge lights, a beacon and a sign */
  _landing(f) {
    const C = this.course, s1 = f.s[1];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(14, 104); g.lineTo(64, 40); g.lineTo(114, 104); g.stroke(); // ^ = forward
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (2 * (H - 1.5)), 1 / 7);
    tex.offset.set(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffb347').multiplyScalar(1.9), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this._sweep(s1, s1 + 70, 2, () => [[-(H - 1.5), 0.05], [H - 1.5, 0.05]], mat, { name: 'landingStrip', shadow: false });
    this.landingTex = tex;
    // runway edge lights
    const pts = [];
    for (let s = s1 + 1; s < s1 + 72; s += 5) pts.push(s);
    const lights = new THREE.InstancedMesh(G.sphere(0.32, 10), glow('#ffd27a', { intensity: 4 }), pts.length * 2);
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
    let k = 0;
    for (const s of pts) for (const side of [-1, 1]) { C.pos(s, side * (H + 0.6) / LANE, 0.35, p); m4.makeTranslation(p.x, p.y, p.z); lights.setMatrixAt(k++, m4); }
    lights.count = k;
    this.static.add(lights);
    // beacon: a tall soft beam of light you can aim for from space
    const bc = document.createElement('canvas');
    bc.width = 4; bc.height = 128;
    const bg = bc.getContext('2d');
    const gr = bg.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    bg.fillStyle = gr; bg.fillRect(0, 0, 4, 128);
    const btex = new THREE.CanvasTexture(bc);
    const beamMat = new THREE.MeshBasicMaterial({ map: btex, color: '#ffbf6a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 150, 24, 1, true), beamMat);
    const fr = C.frame(s1 + 26, {});
    beam.position.set(fr.x, fr.y + 75, fr.z);
    beam.userData.noAO = true;
    this.static.add(beam);
    this.landingBeam = beam;
    this.landingZ = s1;
    // the sign, tilted up towards a kart coming down from above
    const sign = new THREE.Group();
    const panel = textPanel(['▼ LANDING ZONE ▼', 'AGI WINGS: PLEASE STOW'], { width: 17, height: 3.6, bg: '#ffd23f', fg: '#2b1840', border: '#2b1840', borderW: 12, radius: 22 });
    panel.rotation.x = -0.55;
    sign.add(panel);
    const fs = C.frame(s1 + 6, {});
    sign.position.set(fs.x, fs.y + 15, fs.z);
    sign.rotation.y = -fs.yaw;
    this.static.add(sign);
    this.landingSign = sign;
  }

  _bridge(f, sA, sB) {
    const C = this.course;
    const water = f.type === 'bridge';
    const deck = water ? MAT.wood('#a0704a') : toon('#c8c4bc', { roughness: 0.8 });
    // deck slab sides + underside
    this._sweep(sA, sB, 2, () => [[-H - 1.4, 0.3], [-H - 1.4, -1.6], [H + 1.4, -1.6], [H + 1.4, 0.3]], deck, { name: 'deck' });
    // barriers / railings
    const railMat = water ? MAT.paint('#ff6fae') : toon('#e9e6df', { roughness: 0.7 });
    for (const side of [-1, 1]) {
      if (water) {
        this._sweep(sA, sB, 2, () => [[side * (H + 1.0), 1.15], [side * (H + 1.3), 1.15], [side * (H + 1.3), 0.95], [side * (H + 1.0), 0.95]], railMat, { name: 'rail' });
      } else {
        this._sweep(sA, sB, 2, () => [[side * H, 0], [side * (H + 0.35), 0.4], [side * (H + 0.45), 1.05], [side * (H + 0.9), 1.05], [side * (H + 0.9), 0]], railMat, { name: 'barrier' });
      }
    }
    // pillars + posts (instanced)
    const pillarGeo = water ? G.cyl(0.9, 1.1, 1, 14) : G.box(2.4, 1, 2.4);
    const pillarMat = water ? MAT.paint('#ffffff') : toon('#bdb8ae', { roughness: 0.85 });
    const ps = [];
    for (let s = sA + 8; s < sB; s += water ? 34 : 28) ps.push(s);
    const inst = new THREE.InstancedMesh(pillarGeo, pillarMat, ps.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for (const s of ps) {
      const fr = C.frame(s, {});
      const base = this._groundBase(s, f) - 4;
      for (const side of water ? [-1, 1] : [0]) {
        const lat = side * (H - 1);
        const top = fr.y - 1.4;
        const hgt = Math.max(1, top - base);
        p.set(fr.x + Math.cos(fr.yaw) * lat, base + hgt / 2, fr.z + Math.sin(fr.yaw) * lat);
        q.setFromAxisAngle(_up, -fr.yaw);
        sc.set(1, hgt, 1);
        m4.compose(p, q, sc);
        inst.setMatrixAt(k++, m4);
      }
    }
    inst.count = k;
    inst.castShadow = inst.receiveShadow = true;
    this.static.add(inst);
    if (water) {
      // suspension towers + cables for the pink bridge vibe
      const towerMat = MAT.paint('#ff4f9a');
      const mid = (sA + sB) / 2;
      for (const s of [sA + 30, sB - 30]) {
        const fr = C.frame(s, {});
        for (const side of [-1, 1]) {
          const t = mesh(G.rbox(1.6, 34, 1.6, 0.3), towerMat);
          t.position.set(fr.x + Math.cos(fr.yaw) * side * (H + 2.4), fr.y + 12, fr.z + Math.sin(fr.yaw) * side * (H + 2.4));
          t.castShadow = true;
          this.static.add(t);
        }
        const beam = mesh(G.rbox(2 * (H + 2.4) + 1.6, 1.6, 1.6, 0.3), towerMat);
        beam.position.set(fr.x, fr.y + 27, fr.z);
        beam.rotation.y = -fr.yaw;
        this.static.add(beam);
      }
      const cableMat = MAT.metal('#d8d8e8');
      for (const side of [-1, 1]) {
        this._sweep(sA + 30, sB - 30, 3, (s) => {
          const u = (s - (sA + 30)) / (sB - sA - 60);
          const hgt = 28 - Math.sin(u * Math.PI) * 22;
          return [[side * (H + 2.3), hgt], [side * (H + 2.3), hgt + 0.3]];
        }, cableMat, { name: 'cable' });
      }
      void mid;
    }
  }

  _tunnel(f, sA, sB) {
    const C = this.course;
    const W = TUNNEL_W;
    const wallMat = f.fire ? toon('#3a2a28', { roughness: 0.9 }) : surface('concrete', { tint: '#6a7a86', scale: 8 });
    const prof = () => [[-W, -0.2], [-W, 10], [-W * 0.75, 14.5], [-W * 0.35, 16.5], [0, 17], [W * 0.35, 16.5], [W * 0.75, 14.5], [W, 10], [W, -0.2]].reverse();
    const m = this._sweep(sA, sB, 3, prof, wallMat, { name: 'tunnel' });
    if (m) { m.material = m.material.clone(); m.material.side = THREE.DoubleSide; }
    // outer shell: the tunnel is buried in a grassy hill, so from outside it's a mound, not a grey tube
    const look = lookFor(this.themeAtZ(sA + 1));
    const shellMat = surface(look.ground?.tex || 'grass', { tint: look.ground?.tint || '#8fc070', scale: look.ground?.scale || 6 });
    const shell = this._sweep(sA + 4, sB - 4, 4, () => [[-W - 3, 17], [-W * 0.6, 20.5], [0, 21.5], [W * 0.6, 20.5], [W + 3, 17]], shellMat, { name: 'tunnelShell', shadow: false });
    if (shell) { shell.material = shell.material.clone(); shell.material.side = THREE.DoubleSide; }
    // floor between the road and the walls
    const floor = toon(f.fire ? '#2a1a18' : '#1c2830', { roughness: 0.6, metalness: 0.3 });
    for (const side of [-1, 1]) this._sweep(sA, sB, 3, () => (side < 0 ? [[-W, -0.2], [-H - KERB_W, -0.02]] : [[H + KERB_W, -0.02], [W, -0.2]]), floor, { name: 'tfloor', shadow: false });
    // ceiling light strips
    const lights = [];
    for (let s = sA + 6; s < sB; s += 9) lights.push(s);
    const lm = new THREE.InstancedMesh(G.box(1, 0.25, 4), glow(f.fire ? '#ff7a3a' : '#bff6ff', { intensity: 3.2 }), lights.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    let k = 0;
    for (const s of lights) {
      const fr = C.frame(s, {});
      q.setFromAxisAngle(_up, -fr.yaw);
      for (const lat of [-W * 0.5, 0, W * 0.5]) {
        const h = lat === 0 ? 16.8 : 15.7;
        p.set(fr.x + Math.cos(fr.yaw) * lat, fr.y + h, fr.z + Math.sin(fr.yaw) * lat);
        sc.set(lat === 0 ? 2.4 : 1.2, 1, 1);
        m4.compose(p, q, sc);
        lm.setMatrixAt(k++, m4);
      }
    }
    lm.count = k;
    this.static.add(lm);
    // a few real point lights would be expensive; the env + emissive strips + bloom sell it
  }

  _water(f, sA, sB) {
    const C = this.course;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, miny = 1e9;
    for (let s = sA; s <= sB; s += 5) {
      const fr = C.frame(s, {});
      minx = Math.min(minx, fr.x); maxx = Math.max(maxx, fr.x); minz = Math.min(minz, fr.z); maxz = Math.max(maxz, fr.z); miny = Math.min(miny, fr.y);
    }
    const span = Math.hypot(maxx - minx, maxz - minz);
    const radius = f.type === 'cliff' ? span / 2 + 520 : span / 2 + 95;
    const y = f.type === 'cliff' ? miny - 48 : this._groundBase(sA, f) + 1;
    const nm = WATER() ? textureAt(WATER(), false) : null;
    const sea = f.water === 'sea';
    const cliffSea = f.type === 'cliff';
    const mat = new THREE.MeshStandardMaterial({
      color: sea ? '#0c6e9c' : '#6a2a9a', roughness: 0.07, metalness: 0.0, transparent: true, opacity: sea ? 0.96 : 0.9,
      emissive: sea ? '#04425e' : '#4a0a7a', emissiveIntensity: sea ? 0.55 : 1.2,
      normalMap: nm ? cloneTex(nm) : null, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: cliffSea ? 0.55 : 0.85,
    });
    // the sea sits far below / away: lighter aerial perspective so it still reads as water (sun glitter, blue body)
    mat.defines = { HAZE_K: cliffSea ? '0.3' : '0.7' };
    // two scrolling normal layers at different scales/directions: no visible tiling, smoother MK water
    const wt = { value: 0 };
    if (mat.normalMap) {
      mat.normalMap.repeat.set(1, 1);
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.wTime = wt;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float wTime;\nvarying vec2 vWPos;')
          .replace('#include <normal_fragment_maps>', `
            vec2 wq = vWPos / 38.0;
            vec3 wn1 = texture2D(normalMap, wq + vec2(wTime * 0.011, wTime * 0.007)).xyz * 2.0 - 1.0;
            vec3 wn2 = texture2D(normalMap, wq * 0.37 * mat2(0.8, -0.6, 0.6, 0.8) - vec2(wTime * 0.006, -wTime * 0.009)).xyz * 2.0 - 1.0;
            vec3 wn3 = texture2D(normalMap, wq * 2.3 + vec2(-wTime * 0.02, wTime * 0.017)).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(vec3((wn1.xy + wn2.xy * 0.8 + wn3.xy * 0.35) * normalScale, 1.0));
            normal = normalize( tbn * mapN );`);
      };
      mat.customProgramCacheKey = () => 'waterV3' + (cliffSea ? 'c' : '');
    }
    const plane = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minx + maxx) / 2, y, (minz + maxz) / 2);
    plane.receiveShadow = true;
    plane.userData.wTime = wt;
    this.static.add(plane);
    this.waters.push(plane);
    // shore foam: a soft band on the water just off the shoreline (terrain hides the half that is on land)
    if (f.type === 'cliff') this._foam(sA, sB, f.side, H + 3.5, H + 17, y, true);
    else for (const side of [-1, 1]) this._foam(sA, sB, side, 33, 47, y, false);
  }

  _foam(sA, sB, side, latA, latB, y, inward) {
    if (!this._foamTex) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 128, 512);
      let seed = 99;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) {
        const x = Math.pow(rnd(), 0.6) * 128, yy = rnd() * 512, r = 1.5 + rnd() * 5 * (x / 128);
        g.fillStyle = `rgba(255,255,255,${0.15 + 0.6 * (x / 128) * rnd()})`;
        for (const o of [-512, 0, 512]) { g.beginPath(); g.ellipse(x, yy + o, r, r * 2.2, 0, 0, Math.PI * 2); g.fill(); }
      }
      const grd = g.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.85, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0.7)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(0, 0, 128, 512);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
      this._foamTex = t;
    }
    const t = this._foamTex.clone();
    // u along the band runs from the open water (0) to the shore (1)
    const wide = latB - latA;
    if (inward) { t.repeat.set(-1 / wide, 1 / 40); t.offset.set(latB / wide, 0); } else { t.repeat.set(1 / wide, 1 / 40); t.offset.set(-latA / wide, 0); }
    const mat = new THREE.MeshBasicMaterial({ color: '#eaf8ff', alphaMap: t, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    mat.alphaMap.wrapT = THREE.RepeatWrapping;
    // uv.x = |lat| along the band: sweep with a profile from latA to latB (u starts at the first column's lat)
    const prof = () => { const pts = [[side * latA, y + 0.06], [side * (latA + latB) / 2, y + 0.06], [side * latB, y + 0.06]]; return side < 0 ? pts.reverse() : pts; };
    const m = this._sweep(sA - 30, sB + 30, 4, prof, mat, { frame: 'level', name: 'foam', shadow: false });
    if (m) {
      // u from _sweep starts at the first lat (negative on the left): remap to |lat|
      const uv = m.geometry.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, Math.abs(uv.getX(k)));
      m.receiveShadow = false;
      m.renderOrder = 1;
      m.userData.noAO = true;
      this.foams ||= [];
      this.foams.push(t);
    }
  }

  _cliff(f, sA, sB) {
    // rock face from the road edge down to the sea on the cliff side
    const rock = surface('rock', { tint: '#c99a7a', scale: 10 });
    const side = f.side;
    this._sweep(sA, sB, 4, (s) => {
      const fr = this.course.frame(s, {});
      const base = fr.y;
      const pts = [[side * (H + 1.3), base], [side * (H + 2.5), base - 4], [side * (H + 4), base - 20], [side * (H + 7), base - 38], [side * (H + 12), base - 62]];
      return side < 0 ? pts.reverse() : pts;
    }, rock, { frame: 'level', name: 'cliff', shadow: false });
    // guard rail on the cliff edge
    const rail = MAT.metal('#c8ccd4');
    this._sweep(sA, sB, 2, () => [[side * (H + 0.9), 0.55], [side * (H + 0.9), 1.05]], rail, { name: 'guard' });
  }

  _startGrid() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const g = c.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#b8b8b8'; g.fillRect(x * 16, y * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / (2 * H), 1 / 2.25);
    t.offset.set(0.5, 0);
    t.magFilter = THREE.NearestFilter;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    this._sweep(-2, 2, 2, () => [[-H, 0.03], [H, 0.03]], m, { name: 'startline', shadow: false });
  }

  // ---------- per-frame ----------
  update(kartZ, camPos, t, beatPhase, redness, dt) {
    this.time = t;
    // section look (lighting/sky)
    const feats = this.course.featuresAt(kartZ);
    // gliding down from space: take on the look of where we'll land (crossfaded over the first part of the glide)
    const glide = feats.jump?.glide ? feats.jump : null;
    const si = glide ? this.sectionIndexAtZ(glide.s[1] + 1) : this.sectionIndexAtZ(kartZ + 6);
    const th = getTheme(this.sections[si].theme);
    let look = lookFor(th);
    if (feats.space && look.sky !== 'space' && th.spaceLook) look = { ...look, ...th.spaceLook, sky: 'space' };
    else if (feats.space && look.sky !== 'space') look = { ...look, sky: 'space', env: 'night', nightColors: { top: '#05010f', horizon: '#2a0a3a', nebula: '#ff4fd8' }, fog: { color: '#1a0830', density: 0.0008 }, sun: { ...look.sun, elev: 30, intensity: 2 } };
    const key = si + (feats.space ? 's' : '');
    if (key !== this.lookKey) {
      this.lookKey = key;
      // far ridges: keep them off the open sea beside the clifftop (mask out the cliff side's half of the horizon)
      const sec = this.sections[si];
      const s0 = this.secZ[si], s1 = si + 1 < this.secZ.length ? this.secZ[si + 1] : this.course.s1;
      let cliff = null;
      for (const f of this.course.features) if (f.type === 'cliff' && f.s[0] < s1 && f.s[1] > s0) cliff = f;
      if (cliff && look.far) {
        const fm = this.course.frame((cliff.s[0] + cliff.s[1]) / 2, _fr);
        look = { ...look, far: { ...look.far, mask: { dir: [Math.cos(fm.yaw) * cliff.side, Math.sin(fm.yaw) * cliff.side], width: 1.35 } } };
      }
      this.R.applyLook(look, this.course.frame(kartZ, _fr).yaw, glide ? 1.8 : 0);
      this.R.setFarBase?.(this._sectionBaseY(si));
      this.look = look;
      void sec;
    }
    // redness for doom
    this.R.scene.fog.color.copy(this.R.fogBase).lerp(_red, redness * 0.35);

    // landing zone: chevrons crawl towards the touchdown, the beacon fades once we're down
    if (this.landingTex) {
      this.landingTex.offset.y = -(t * 1.6) % 1;
      const d = kartZ - this.landingZ;
      this.landingBeam.material.opacity = 0.55 * clamp(-d / 60, 0, 1);
      this.landingBeam.visible = d < 0;
      this.landingSign.visible = d < 12;
    }
    // water ripples
    for (const w of this.waters) w.userData.wTime.value = t;
    if (this.foams) for (const ft of this.foams) ft.offset.y = Math.sin(t * 0.5) * 0.02 + t * 0.004;

    // recycle passed props
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
    // spawn scenery
    let guard = 0;
    while (this.nextPropZ < kartZ + FAR && guard++ < 300) {
      const zf = this.nextPropZ;
      const sIdx = this.sectionIndexAtZ(zf);
      const sec = this.sections[sIdx];
      const th2 = getTheme(sec.theme);
      const rng = makeRng(hashSeed(sec.id, Math.round(zf)));
      const placements = th2.layout ? th2.layout(zf, rng, sec) : [];
      for (const p of placements) this._spawn(th2, p, zf + (p.dz || 0));
      this.nextPropZ += th2.spacing || 10;
    }
    guard = 0;
    while (this.nextBillboardZ < kartZ + FAR && guard++ < 20) {
      const zf = this.nextBillboardZ;
      const sIdx = this.sectionIndexAtZ(zf);
      const th2 = getTheme(this.sections[sIdx].theme);
      if (th2.billboards && th2.billboards.length && zf - this.secZ[sIdx] > 25) {
        const k = this.billboardIdx.get(th2.id) || 0;
        this.billboardIdx.set(th2.id, k + 1);
        const text = th2.billboards[k % th2.billboards.length];
        const side = k % 2 === 0 ? 1 : -1;
        this._spawn(th2, { kind: '__bb:' + text, x: side * (H + 8), y: 0, rotY: -side * 0.35, make: () => billboard(text, { ...(th2.billboardStyle || {}), postH: (th2.billboardStyle?.postH || 3) + 1 }) }, zf);
      }
      this.nextBillboardZ += th2.billboardEvery || 75;
    }
    // gates
    for (let i = 1; i < this.sections.length; i++) {
      const gz = this.secZ[i];
      if (gz > kartZ - BEHIND && gz < kartZ + FAR) {
        if (!this.gates.has(i)) { const gate = this._makeGate(i); this.gates.set(i, gate); this.scene.add(gate); }
      } else if (this.gates.has(i)) { this.scene.remove(this.gates.get(i)); this.gates.delete(i); }
    }
    // live-stat billboard: one reusable board that roasts the player's actual run
    if (!this.liveBB) this._makeLiveBB();
    if (this.liveBBz < kartZ - BEHIND || this.liveBBz === undefined) {
      let z = kartZ + FAR - 10;
      const f = this.course.featuresAt(z);
      if (!f.jump && !f.bridge && !f.tunnel && !f.rainbow && !f.space && !f.cliff && !f.highway) {
        this.liveBBz = z;
        this._placeLiveBB(z);
      } else this.liveBBz = kartZ + 40; // try again shortly
    }
    for (const a of this.active) if (a.theme.animate) a.theme.animate(a.obj, a.kind, t, beatPhase, a);
    for (const [, gate] of this.gates) gate.userData.lights?.forEach((l, k) => { l.visible = Math.floor(t * 8 + k) % 2 === 0; });
    this.pal.skyTop.set(look.fog?.color || '#ffffff');
  }

  /** lowest road height in a section (far ridges + cloud bank sit relative to it) */
  _sectionBaseY(si) {
    this._baseY ||= new Map();
    if (this._baseY.has(si)) return this._baseY.get(si);
    const C = this.course;
    const s0 = Math.max(C.s0, this.secZ[si]), s1 = Math.min(C.s1, si + 1 < this.secZ.length ? this.secZ[si + 1] : C.s1);
    let y = 1e9;
    for (let s = s0; s <= s1; s += 10) y = Math.min(y, C.frame(s, _frS).y);
    this._baseY.set(si, y);
    return y;
  }

  _spawn(th, p, zf) {
    const C = this.course;
    let lat = p.x || 0;
    // v2 layouts assumed a ±9 road: props beside the road move out with the wider v3 road (p.abs opts out)
    if (!p.abs && Math.abs(lat) > V2_ROAD_HALF + 0.2) lat += Math.sign(lat) * (H - V2_ROAD_HALF);
    const feats = C.featuresAt(zf);
    const overhead = (p.y || 0) >= 6;
    const isBB = p.kind.startsWith('__bb:');
    // features decide what can exist here
    if (feats.jump) return;
    if (feats.tunnel && Math.abs(lat) > TUNNEL_W - 1.5 && !overhead) return;
    if (feats.tunnel && overhead && (p.y || 0) > 15) return;
    let baseY = null;
    const fr = C.frame(zf, _frS);
    if (feats.rainbow || feats.space) baseY = fr.y; // floats in space: fine
    else if (overhead || Math.abs(lat) <= H + 1.5) baseY = fr.y;
    else {
      const ty = this.terrainY(zf, lat);
      if (ty === null) return; // over water / void
      if (feats.cliff && Math.sign(lat) === feats.cliff.side) return;
      baseY = (feats.bridge || feats.highway) && !isBB ? ty : ty;
      if (isBB && (feats.bridge || feats.highway)) return;
    }
    const key = th.id + ':' + p.kind;
    let obj;
    const pool = this.pools.get(key);
    if (pool && pool.length) obj = pool.pop();
    else {
      obj = p.make ? p.make() : th.makeProp(p.kind);
      if (!obj) return;
      obj.traverse((o) => { if (o.isMesh) { const m = o.material; o.castShadow = !!m && !m.transparent && !m.isMeshBasicMaterial && !m.isShaderMaterial; o.receiveShadow = true; } });
    }
    const cy = Math.cos(fr.yaw), sy = Math.sin(fr.yaw);
    obj.position.set(fr.x + cy * lat, baseY + (p.y || 0), fr.z + sy * lat);
    obj.rotation.set(0, -fr.yaw + (p.rotY || 0), 0);
    const s = p.scale || 1;
    obj.scale.set(s, s, s);
    obj.visible = true;
    this.scene.add(obj);
    this.active.push({ obj, key, zf, theme: th, kind: p.kind, data: p.data, seed: (zf * 13.37) % 1 });
  }

  _makeLiveBB() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    this.liveCanvas = c;
    this.liveTex = new THREE.CanvasTexture(c);
    this.liveTex.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const pm = MAT.metal('#8a90a0');
    for (const x of [-3.6, 3.6]) { g.add(mesh(G.cyl(0.24, 0.28, 5.4, 14), pm, x, 2.7, -0.3)); g.add(mesh(G.rbox(0.9, 0.5, 0.9, 0.15), pm, x, 0.25, -0.3)); }
    g.add(mesh(G.rbox(11.2, 5.9, 0.5, 0.2), MAT.paint('#1a1030'), 0, 7.75, -0.3));
    const scr = new THREE.Mesh(G.plane(10.5, 5.25), new THREE.MeshBasicMaterial({ map: this.liveTex }));
    scr.material.color.setScalar(1.25);
    scr.position.set(0, 7.75, 0);
    g.add(scr);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.liveBB = g;
    this.liveIdx = 0;
    this.scene.add(g);
  }
  _placeLiveBB(z) {
    const G2 = globalThis.GAME || {};
    const acc = G2.hits + G2.misses > 0 ? Math.round((G2.hits / (G2.hits + G2.misses)) * 100) : 100;
    const msgs = [
      ['LIVE: THIS DRIVER', `${G2.gpus || 0} GPUs ACQUIRED`, 'investors: cautiously thrilled'],
      ['CURRENT P(DOOM)', (G2.pDoom ?? 0.5).toFixed(2), (G2.pDoom ?? 0.5) > 0.5 ? 'please drive better' : 'humanity is cautiously optimistic'],
      ['DRIVER EVAL', `ACCURACY: ${acc}%`, acc > 90 ? 'suspiciously good. benchmark leak?' : 'needs more RLHF'],
      ['HALLUCINATIONS', `${G2.hazardsHit || 0} THIS RUN`, 'industry average: yes'],
      ['MAX COMBO', `x${G2.maxCombo || 0}`, 'tokens per second: ' + (G2.maxCombo > 20 ? 'YES' : 'some')],
    ];
    const [a, b, c] = msgs[this.liveIdx++ % msgs.length];
    const g = this.liveCanvas.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#2a1458'); grd.addColorStop(1, '#0e0620');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < 512; y += 6) g.fillRect(0, y, 1024, 2);
    g.textAlign = 'center';
    g.fillStyle = '#ff5ca8'; g.font = "700 64px Fredoka, sans-serif"; g.fillText('● ' + a, 512, 110);
    g.fillStyle = '#ffd23f'; g.font = "700 150px Fredoka, sans-serif"; g.fillText(b, 512, 290, 980);
    g.fillStyle = '#c8b8ff'; g.font = "600 52px Fredoka, sans-serif"; g.fillText(c, 512, 410, 980);
    this.liveTex.needsUpdate = true;
    const fr = this.course.frame(z, _frS);
    const side = this.liveIdx % 2 ? 1 : -1;
    const lat = side * (H + 9);
    const ty = this.terrainY(z, lat) ?? fr.y;
    this.liveBB.position.set(fr.x + Math.cos(fr.yaw) * lat, ty, fr.z + Math.sin(fr.yaw) * lat);
    this.liveBB.rotation.y = -fr.yaw - side * 0.35;
  }

  _makeGate(i) {
    // MK-scale start arch: chunky rounded pillars outside ±13 (clear of the kerbs), banner ≈ 15.5 up (≈ 8 kh)
    const sec = this.sections[i];
    const th = getTheme(sec.theme);
    const p = th.palette;
    const g = new THREE.Group();
    const fz = this.course.featuresAt(this.secZ[i]);
    const deck = !!(fz.bridge || fz.highway);
    const px = deck ? H + 2.3 : H + 3.9; // pillar centre ±14.4 (on a bridge deck: hug the deck edge)
    const ph = 14; // pillar height
    const colA = p.accent1 || '#ff5ca8', colB = p.accent2 || '#ffd23f';
    const paintA = MAT.paint(colA), metal = MAT.metal('#9aa0ac');
    for (const sx of [-1, 1]) {
      const post = mesh(G.rbox(2.3, ph + (deck ? 3 : 0), 2.3, 0.55), paintA, sx * px, (ph - (deck ? 3 : 0)) / 2, 0);
      post.castShadow = true;
      g.add(post);
      if (!deck) g.add(mesh(G.rbox(3.2, 1.0, 3.2, 0.35), metal, sx * px, 0.5, 0)); // plinth
      g.add(mesh(G.rbox(2.9, 0.7, 2.9, 0.3), metal, sx * px, ph + 0.1, 0)); // cap under the banner
      g.add(mesh(G.rbox(2.5, 0.45, 2.5, 0.18), MAT.paint(colB), sx * px, 9.5, 0)); // band
    }
    const bw = px * 2 + 3.2;
    const beam = mesh(G.rbox(bw, 3.8, 1.6, 0.6), MAT.paint(colB), 0, ph + 2.2, 0);
    beam.castShadow = true;
    g.add(beam);
    g.add(mesh(G.rbox(bw - 1.2, 0.5, 1.9, 0.2), paintA, 0, ph + 0.2, 0)); // trim strip
    const label = `TRACK ${i + 1}: ${th.title || sec.theme.toUpperCase()}`;
    const pw = px * 2 - 2.6; // between the pillars
    const panel = textPanel(label, { width: pw, height: 3.0, w: 2048, h: Math.round(2048 * 3.0 / pw), pad: 26, bg: colB, fg: '#2b1840', border: '#2b1840', borderW: 8, radius: 18 });
    panel.position.set(0, ph + 2.2, 0.82);
    g.add(panel);
    const back = panel.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.82;
    g.add(back);
    // chaser bulbs: two instanced sets (even / odd) that blink alternately
    const bulb = G.sphere(0.32, 12), n = 14, m4 = new THREE.Matrix4();
    const lights = [0, 1].map((par) => {
      const im = new THREE.InstancedMesh(bulb, glow(par ? '#ffffff' : colA, { intensity: 4 }), n / 2);
      for (let k = par, j = 0; k < n; k += 2, j++) im.setMatrixAt(j, m4.makeTranslation(-bw / 2 + 0.8 + (k + 0.5) * ((bw - 1.6) / n), ph + 4.35, 0.5));
      g.add(im);
      return im;
    });
    g.userData.lights = lights;
    const fr = this.course.frame(this.secZ[i], {});
    g.position.set(fr.x, fr.y, fr.z);
    g.rotation.y = -fr.yaw;
    return g;
  }

  reset(kartZ) {
    for (const a of this.active) this.scene.remove(a.obj);
    this.active.length = 0;
    for (const [, gte] of this.gates) this.scene.remove(gte);
    this.gates.clear();
    this.nextPropZ = Math.max(this.course.s0, kartZ - BEHIND);
    this.nextBillboardZ = Math.max(60, kartZ + 40);
    this.lookKey = '';
    this.liveBBz = undefined;
  }
}

const _fr = {}, _frT = {}, _frG = {}, _frC = {}, _frS = {};
const _up = new THREE.Vector3(0, 1, 0);
const _red = new THREE.Color('#ff2020');
const _vergeMul = new THREE.Color(0.62, 0.52, 0.4);
// rounded kerb cross-section: [t across 0..1 of KERB_W, height]; the last point tucks under the verge (no gap)
const KERB_PROFILE = (() => {
  const out = [];
  for (const t of [0, 0.04, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.96, 1]) out.push([t, KERB_H * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 6))) + 0.005]);
  out.push([1.04, -0.32]);
  return out;
})();
