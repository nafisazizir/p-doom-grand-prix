// v2 track: the Course swept into static geometry once (road, kerbs, terrain, bridges, tunnels, rainbow road,
// water), plus theme props spawned/recycled along the way and section gates.
import * as THREE from 'three';
import { toon, glow, G, mesh, billboard, textPanel, makeRng, hashSeed, clamp, smooth, MAT } from './toolkit.js';
import { getTheme } from './themes/index.js';
import { Course, SPEED, ROAD_HALF, LANE } from './course.js';
import { lookFor } from './looks.js';
import { surface, WATER, textureAt, cloneTex } from './textures.js';

export { SPEED, ROAD_HALF, LANE };
export const FAR = 330;
const BEHIND = 30;
const H = ROAD_HALF;
const TUNNEL_W = H + 10;

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
    const emb = a <= H + 1.2 ? 0.05 : -0.25;
    // match the banked road edge, fading back to level ground further out
    const edge = Math.sign(lat) * Math.min(a, H + 1.3);
    const bankY = f.ry * edge * (a <= H + 4 ? 1 : Math.max(0, 1 - (a - H - 4) / 30));
    return f.y + bankY + emb + this._hills(s, lat, look);
  }

  // ---------- static geometry ----------
  _sweep(sA, sB, step, profile, material, { frame = 'road', name = '', skip = null, shadow = true } = {}) {
    // profile(s) → [[lat, h], ...] (same length every row). Returns a Mesh, or null if empty.
    const pos = [], uv = [], idx = [];
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
      const roadMat = surface(look.road?.tex || 'asphalt', { tint: look.road?.tint || '#8a8a96', scale: look.road?.scale || 6, normalScale: 0.8 });
      const rainbow = surface('rainbow');
      const roadProf = () => [[-H, 0], [-H / 2, 0], [0, 0], [H / 2, 0], [H, 0]];
      this._sweep(sA, sB, 2, roadProf, roadMat, { name: 'road', skip: (s) => jumpSkip(s) || isRainbow(s), shadow: false });
      this._sweep(sA, sB, 2, roadProf, rainbow, { name: 'rainbow', skip: (s) => jumpSkip(s) || !isRainbow(s), shadow: false });
      // lane markings (dashed centre) as a thin emissive-ish strip
      const lineMat = toon('#bfbab0', { roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
      this._sweep(sA, sB, 2, () => [[-0.18, 0.02], [0.18, 0.02]], lineMat, { name: 'line', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) || Math.floor(s / 6) % 2 === 1 });
      for (const side of [-1, 1]) {
        this._sweep(sA, sB, 2, () => [[side * (H - 0.6), 0.02], [side * (H - 0.35), 0.02]], lineMat, { name: 'edge', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) });
      }
      // kerbs (raised, striped) or glowing rails on rainbow road
      const kerbMat = this._kerbMat(look);
      for (const side of [-1, 1]) {
        const prof = () => (side < 0 ? [[-H - 1.3, 0.02], [-H - 1.1, 0.16], [-H, 0.12]] : [[H, 0.12], [H + 1.1, 0.16], [H + 1.3, 0.02]]);
        this._sweep(sA, sB, 2, prof, kerbMat, { name: 'kerb', shadow: false, skip: (s) => jumpSkip(s) || isRainbow(s) || !!C.featuresAt(s).bridge || !!C.featuresAt(s).highway });
        const railProf = () => [[side * (H + 0.2), 0.0], [side * (H + 0.2), 0.9]];
        this._sweep(sA, sB, 2, railProf, glow(side < 0 ? '#3fd7ff' : '#ff4fd8', { side: THREE.DoubleSide, intensity: 3 }), { name: 'rainbowRail', shadow: false, skip: (s) => jumpSkip(s) || !isRainbow(s) });
      }
      // terrain
      const groundMat = surface(look.ground?.tex || 'grass', { tint: look.ground?.tint || '#8fc070', scale: look.ground?.scale || 6 });
      const lats = [H + 1.3, H + 4, H + 10, H + 22, H + 45, H + 90, H + 160, H + 300];
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
        this._sweep(sA, sB, 4, prof, groundMat, { frame: 'level', name: 'terrain', shadow: false });
        // shore/ground under bridges & highways
        const prof2 = (s) => {
          const m = this._mode(s);
          if (m.kind === 'highway') {
            const out = [];
            for (const a of [0, H + 1.3]) { const lat = side * a; out.push([lat, this.terrainY(s, lat) ?? 0]); }
            return side < 0 ? out.reverse() : out;
          }
          if (m.kind !== 'water') return null;
          const out = [];
          for (const a of [45, 90, 160, 300]) { const lat = side * a; out.push([lat, this.terrainY(s, lat)]); }
          return side < 0 ? out.reverse() : out;
        };
        this._sweep(sA, sB, 4, prof2, groundMat, { frame: 'level', name: 'shore', shadow: false });
        // cliff face
      }
    }
    this._buildFeatures();
  }

  _kerbMat(look) {
    if (!this._kerbTex) {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 8, 64);
      g.fillStyle = '#e8324a'; g.fillRect(0, 0, 8, 32);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(1, 1 / 5);
      this._kerbTex = t;
    }
    const key = look.kerb || 'std';
    this._kerbMats ||= {};
    return (this._kerbMats[key] ||= new THREE.MeshStandardMaterial({ map: this._kerbTex, roughness: 0.55, color: look.kerb || '#ffffff' }));
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
    for (const side of [-1, 1]) this._sweep(sA, sB, 3, () => (side < 0 ? [[-W, -0.2], [-H - 1.3, 0.02]] : [[H + 1.3, 0.02], [W, -0.2]]), floor, { name: 'tfloor', shadow: false });
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
    const w = radius * 2, d = radius * 2;
    const y = f.type === 'cliff' ? miny - 48 : this._groundBase(sA, f) + 1;
    const nm = WATER() ? textureAt(WATER(), false) : null;
    const sea = f.water === 'sea';
    const mat = new THREE.MeshStandardMaterial({
      color: sea ? '#1f7fa8' : '#6a2a9a', roughness: 0.06, metalness: 0.1, transparent: true, opacity: sea ? 0.92 : 0.88,
      emissive: sea ? '#03202c' : '#4a0a7a', emissiveIntensity: sea ? 0.4 : 1.2,
      normalMap: nm ? cloneTex(nm) : null, normalScale: new THREE.Vector2(0.6, 0.6),
    });
    if (mat.normalMap) mat.normalMap.repeat.set(w / 40, d / 40);
    const plane = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minx + maxx) / 2, y, (minz + maxz) / 2);
    plane.receiveShadow = true;
    this.static.add(plane);
    this.waters.push(plane);
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
      this.R.applyLook(look, this.course.frame(kartZ, _fr).yaw, glide ? 1.8 : 0);
      this.look = look;
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
    for (const w of this.waters) if (w.material.normalMap) { w.material.normalMap.offset.x = t * 0.01; w.material.normalMap.offset.y = t * 0.013; }

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

  _spawn(th, p, zf) {
    const C = this.course;
    const lat = p.x || 0;
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
    for (const x of [-4.5, 4.5]) g.add(mesh(G.box(0.4, 6, 0.4), pm, x, 3, 0));
    g.add(mesh(G.rbox(13, 6.8, 0.5, 0.15), MAT.paint('#1a1030'), 0, 9, -0.3));
    const scr = new THREE.Mesh(G.plane(12.2, 6.1), new THREE.MeshBasicMaterial({ map: this.liveTex }));
    scr.material.color.setScalar(1.25);
    scr.position.set(0, 9, 0);
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
    const sec = this.sections[i];
    const th = getTheme(sec.theme);
    const p = th.palette;
    const g = new THREE.Group();
    const w = H * 2 + 5;
    const colA = p.accent1 || '#ff5ca8', colB = p.accent2 || '#ffd23f';
    for (const sx of [-1, 1]) {
      const post = mesh(G.rbox(1.6, 11, 1.6, 0.4), MAT.paint(colA), sx * w / 2, 5.5, 0);
      post.castShadow = true;
      g.add(post);
      g.add(mesh(G.cyl(1.3, 1.5, 0.6, 20), MAT.metal('#9aa0ac'), sx * w / 2, 0.3, 0));
    }
    const beam = mesh(G.rbox(w + 3, 3.6, 1.4, 0.4), MAT.paint(colB), 0, 11.5, 0);
    beam.castShadow = true;
    g.add(beam);
    const label = `TRACK ${i + 1}: ${th.title || sec.theme.toUpperCase()}`;
    // wide panel → give the canvas a matching aspect + small padding (the default 512 px canvas left ~no room for text)
    const pw = w - 1.8; // between the posts (which would otherwise cover the ends of the text)
    const panel = textPanel(label, { width: pw, height: 3.0, w: 2048, h: Math.round(2048 * 3.0 / pw), pad: 26, bg: colB, fg: '#2b1840', border: '#2b1840', borderW: 8, radius: 18 });
    panel.position.set(0, 11.5, 0.86);
    g.add(panel);
    const lights = [];
    for (let k = 0; k < 12; k++) {
      const l = mesh(G.sphere(0.3, 10), glow(k % 2 ? '#ffffff' : colA, { intensity: 4 }), -w / 2 + (k + 0.5) * (w / 12), 13.6, 0.5);
      lights.push(l); g.add(l);
    }
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
