// DATA CENTRE TUNNEL (verse 2): a huge cool-blue hall. Both walls are lined with bays of glossy server racks
// (blinking LEDs), tall cooling cabinets, chrome liquid-cooling pipes, overhead cable trays, giant fans,
// hologram loss curves, a SINGULARITY PROGRESS bar that fills up as the song goes on, and the
// "STABLE TRAINING RUN — DAY 3 OF 3" board.
// Plus DATA CENTRE (ON FIRE) (bridge 2, a descending helix): the same hall, escalated. Flames, embers, smoke,
// melted racks, red beacons, broken safety fences, an empty RLHF extinguisher, a super-dense post-Chinchilla
// cube, transformers stacked all the way up, and Lossy the robot insisting THIS IS FINE.
//
// Every bay is baked once into a handful of merged meshes (see Kit in garage.js), so a 15 m wall of racks is
// ~6 draw calls.
import { THREE, glow, G, mesh, textPanel, FONT, roundRect, toon } from '../toolkit.js';
import { surface } from '../textures.js';
import { SPEED } from '../course.js';
import { Kit, kitProp, kitMat, canvasTex, cachedGeo, halfCylGeo } from './garage.js';

const PI = Math.PI;
const O3 = [0, 0, 0];
const BAY_L = 15.2; // bay length along the road (spacing 14 → slight overlap on curves)
const SP = 14;
const FORCE = new URLSearchParams(location.search).get('dcforce'); // TEMP debug
const DC_T0 = 37.57, DC_T1 = 55.77; // section song times (for the singularity progress bar)

const COOL = {
  hot: false, body: '#18202e', trim: '#2a3446', slab: '#283850', gpu: '#1c2a24', gpuGlow: '#5dff8a',
  leds: ['#5dffb0', '#2fe6ff', '#ffb84a'], strip: '#8ff8ff', cab: '#36475e', ring: '#2fe6ff', steel: '#26344a',
  tray: '#e8c23a', pipe: '#eef4ff', pipe2: '#2a7ad8', floor: '#8a9aa8', cable: ['#ff4f6d', '#3f8cff', '#5dffb0', '#ffd23f', '#b98aff'],
};
const HOT = {
  hot: true, body: '#261818', trim: '#3a2420', slab: '#382424', gpu: '#2a1a12', gpuGlow: '#ff7a1f',
  leds: ['#ff3b2f', '#ffb020', '#ff7a1f'], strip: '#ff6a2a', cab: '#3e2622', ring: '#ff5a1f', steel: '#30201c',
  tray: '#7a5a2a', pipe: '#9a8a80', pipe2: '#6a2a1a', floor: '#7a5a50', cable: ['#4a2a2a', '#ff5a1f', '#3a3030', '#ffb020', '#2a2020'],
};

// deterministic hash 0..1
function hsh(a, b = 0) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }

// ================================================================================================
// textures + special materials
// ================================================================================================
function flameTex() {
  return canvasTex('dcFlame2', 128, 256, (x, W, H) => {
    x.filter = 'blur(3px)';
    x.globalCompositeOperation = 'lighter';
    const tongue = (cx, w, h, a) => {
      const base = H - 14;
      const grd = x.createLinearGradient(0, base, 0, base - h);
      grd.addColorStop(0, `rgba(255,240,200,${a})`);
      grd.addColorStop(0.35, `rgba(255,170,60,${a * 0.9})`);
      grd.addColorStop(0.75, `rgba(255,80,10,${a * 0.5})`);
      grd.addColorStop(1, 'rgba(160,20,0,0)');
      x.fillStyle = grd;
      x.beginPath();
      x.moveTo(cx - w, base);
      x.bezierCurveTo(cx - w * 1.1, base - h * 0.45, cx - w * 0.2, base - h * 0.6, cx + w * 0.15, base - h);
      x.bezierCurveTo(cx + w * 0.35, base - h * 0.55, cx + w * 1.1, base - h * 0.4, cx + w, base);
      x.closePath();
      x.fill();
    };
    tongue(64, 46, 200, 0.75);
    tongue(42, 24, 150, 0.6);
    tongue(88, 26, 170, 0.6);
    tongue(58, 18, 236, 0.5);
    tongue(76, 16, 120, 0.7);
    // hot core
    const core = x.createRadialGradient(64, H - 40, 2, 64, H - 40, 46);
    core.addColorStop(0, 'rgba(255,255,230,0.9)');
    core.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = core;
    x.fillRect(0, 0, W, H);
  });
}
let _flameMat = null;
function flameMat() {
  if (_flameMat) return _flameMat;
  _flameMat = new THREE.MeshBasicMaterial({ map: flameTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  _flameMat.color.setScalar(1.6);
  return _flameMat;
}
/** crossed-quad flame (outer + inner tongue), base at y = 0, height ~2.4 */
function flameGeo() {
  return cachedGeo('dcFlameGeo', () => {
    const k = new Kit();
    for (let i = 0; i < 3; i++) k.add(G.plane(1.9, 3.2), flameMat(), '#ffa040', [0, 1.5, 0], [0, (i * PI) / 3, 0]);
    for (let i = 0; i < 2; i++) k.add(G.plane(1.0, 1.8), flameMat(), '#ffd070', [0.05, 0.85, 0.05], [0, (i * PI) / 2 + 0.4, 0]);
    return k.bake()[0].geo;
  });
}
function flame(size = 1) {
  const m = new THREE.Mesh(flameGeo(), flameMat());
  m.scale.setScalar(size);
  m.renderOrder = 2;
  return m;
}

// ---- GPU particles: embers / sparks / smoke (positions computed in the vertex shader; zero CPU per frame) ----
const PTIME = { value: 0 };
const PMATS = {};
function particleMat(kind) {
  if (PMATS[kind]) return PMATS[kind];
  const cfg = {
    ember: { color: new THREE.Color(4.0, 1.6, 0.35), size: 0.42, rise: 7.5, grav: 0, speed: 0.55, grow: 0, add: true, alpha: 1 },
    spark: { color: new THREE.Color(4.0, 3.0, 1.2), size: 0.2, rise: 2.0, grav: -9.0, speed: 0.9, grow: 0, add: true, alpha: 1 },
    smoke: { color: new THREE.Color(0.09, 0.07, 0.07), size: 2.6, rise: 9.0, grav: 0, speed: 0.16, grow: 2.2, add: false, alpha: 0.55 },
  }[kind];
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: PTIME, uColor: { value: cfg.color }, uSize: { value: cfg.size }, uRise: { value: cfg.rise }, uGrav: { value: cfg.grav }, uSpeed: { value: cfg.speed }, uGrow: { value: cfg.grow }, uAlpha: { value: cfg.alpha } },
    vertexShader: `
      uniform float uTime, uSize, uRise, uGrav, uSpeed, uGrow;
      attribute vec4 aRnd;
      varying float vA;
      void main() {
        float ph = fract(uTime * uSpeed * (0.6 + aRnd.w * 0.8) + aRnd.x);
        vec3 p = position;
        p.y += ph * uRise * (0.7 + aRnd.y * 0.6) + uGrav * ph * ph;
        p.x += sin(ph * 6.0 + aRnd.y * 30.0) * 0.7 * ph + (aRnd.z - 0.5) * ph * 2.5;
        p.z += cos(ph * 5.0 + aRnd.z * 30.0) * 0.5 * ph;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (1.0 - ph * 0.5 + ph * uGrow) * (420.0 / max(1.0, -mv.z));
        vA = smoothstep(0.0, 0.08, ph) * (1.0 - ph);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d) * vA * uAlpha;
        gl_FragColor = vec4(uColor * (${cfg.add ? 'a' : '1.0'}), a);
      }`,
    transparent: true, depthWrite: false, blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return (PMATS[kind] = m);
}
/** spots: [[x,y,z,spread], …] → cached Points geometry */
function particles(key, kind, spots, perSpot) {
  const geo = cachedGeo('pts' + key, () => {
    const n = spots.length * perSpot;
    const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    let i = 0;
    spots.forEach(([x, y, z, s = 1], si) => {
      for (let k = 0; k < perSpot; k++, i++) {
        pos[i * 3] = x + (hsh(si, k) - 0.5) * s;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z + (hsh(k, si + 3) - 0.5) * s * 0.6;
        for (let c = 0; c < 4; c++) rnd[i * 4 + c] = hsh(i * 4 + c, si * 7 + 1);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 12;
    return g;
  });
  const p = new THREE.Points(geo, particleMat(kind));
  p.renderOrder = 3;
  return p;
}

function holoTex(variant) {
  return canvasTex('dcHolo' + variant, 768, 432, (x, W, H) => {
    const hot = variant >= 3;
    const c1 = hot ? '#ff8a3a' : '#7ff6ff', c2 = hot ? '#ff3b2f' : '#5dffb0';
    x.clearRect(0, 0, W, H);
    x.fillStyle = hot ? 'rgba(80,10,0,0.35)' : 'rgba(10,60,80,0.35)'; x.fillRect(0, 0, W, H);
    x.strokeStyle = c1; x.lineWidth = 6; x.strokeRect(6, 6, W - 12, H - 12);
    x.globalAlpha = 0.25; x.lineWidth = 2;
    for (let i = 1; i < 12; i++) { x.beginPath(); x.moveTo(i * 64, 70); x.lineTo(i * 64, H - 30); x.stroke(); }
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(30, 70 + i * 55); x.lineTo(W - 30, 70 + i * 55); x.stroke(); }
    x.globalAlpha = 1;
    x.fillStyle = c1; x.font = `700 44px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
    const title = ['TRAINING LOSS', 'CAPABILITIES', 'ATOMS: REARRANGING', 'TRAINING LOSS: NaN', 'LEARNING TO: DISOBEY', 'REWARD MODEL'][variant];
    x.fillText(title, 30, 42);
    x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = c2;
    x.shadowColor = c2; x.shadowBlur = 18;
    x.beginPath();
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      let v;
      if (variant === 0) v = 0.85 * Math.exp(-5 * u) + 0.08 + 0.02 * Math.sin(u * 60);
      else if (variant === 1) v = 0.05 + Math.pow(u, 4) * 0.95;
      else if (variant === 2) v = 0.5 + 0.35 * Math.sin(u * 14) * Math.sin(u * 3.3);
      else if (variant === 3) v = u < 0.6 ? 0.8 * Math.exp(-5 * u) + 0.1 : 0.14 + Math.pow((u - 0.6) * 3, 3);
      else if (variant === 4) v = Math.min(1, u * 1.1);
      else v = 0.5 + 0.4 * Math.sin(u * 40) * u;
      const px = 40 + u * (W - 80), py = H - 40 - Math.min(1.05, v) * (H - 130);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
    x.shadowBlur = 0;
    x.font = `700 36px ${FONT}`; x.fillStyle = '#ffffff';
    const note = ['stable ✓', 'optimizing… accelerating…', '73% (please hold still)', "it's learning!", '████████░░ 80%', 'ASKEW'][variant];
    x.textAlign = 'right'; x.fillText(note, W - 34, variant === 1 ? 110 : H - 70);
  });
}
function holoMat(v) {
  const key = 'holoMat' + v;
  return cachedGeo(key, () => {
    const m = new THREE.MeshBasicMaterial({ map: holoTex(v), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.color.setScalar(1.7);
    return m;
  });
}
function beamMat(color) {
  return cachedGeo('beamMat' + color, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}
function floorMat(P) {
  return surface('metalplate', { tint: P.floor, scale: 0.22, roughness: 0.45, metalness: 0.6 });
}
function wireTex() {
  return canvasTex('dcWire', 128, 128, (x, W) => {
    x.clearRect(0, 0, W, W);
    x.strokeStyle = '#d8d8d0'; x.lineWidth = 5;
    for (let i = -W; i < W * 2; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + W, W); x.stroke(); x.beginPath(); x.moveTo(i + W, 0); x.lineTo(i, W); x.stroke(); }
  }, { repeat: true });
}
function litPanelMat(tex, opts = {}) {
  return cachedGeo('lpm' + tex.uuid + JSON.stringify(opts), () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3, alphaTest: 0.5, side: THREE.DoubleSide, ...opts }));
}

// ================================================================================================
// bay pieces (local: length along x, the road is towards +z; front of the racks at z ≈ +0.8)
// ================================================================================================
const RACK_X = [-5.55, -1.85, 1.85, 5.55];
function rack(k, P, cx, seed) {
  const y0 = 0.2;
  k.rbox(3.3, 6.5, 1.8, 0.1, 'paint', P.body, [cx, y0 + 3.25, -0.1]);
  k.box(3.1, 0.2, 1.7, 'paint', P.trim, [cx, y0 + 6.55, -0.1]);
  for (const sx of [-1.5, 1.5]) k.box(0.09, 6.1, 0.09, 'chrome', P.pipe, [cx + sx, y0 + 3.25, 0.82]);
  for (let i = 0; i < 12; i++) {
    const y = y0 + 0.62 + i * 0.47;
    const h = hsh(seed, i);
    if (h < 0.07) continue; // empty slot: someone borrowed it
    const gpu = h > 0.68;
    k.box(2.8, 0.39, 0.1, 'paint', gpu ? P.gpu : P.slab, [cx, y, 0.82]);
    for (let j = 0; j < 3; j++) {
      const g = hsh(seed * 3 + i, j);
      k.box(0.1, 0.09, 0.05, 'glow', P.leds[(i + j + seed) % 3], [cx + 0.95 + j * 0.17, y + 0.07, 0.89], O3, g < 0.4 ? 'ledA' : g < 0.75 ? 'ledB' : '');
    }
    if (gpu) k.box(1.0, 0.05, 0.05, 'glow', i % 2 ? P.gpuGlow : P.leds[1], [cx - 0.6, y - 0.08, 0.89], O3, i % 3 === 0 ? 'ledB' : '');
    else k.box(0.9, 0.05, 0.05, 'paint', '#0a0c10', [cx - 0.7, y, 0.88]);
  }
  k.box(3.0, 0.1, 0.06, 'glow', P.strip, [cx, y0 + 6.25, 0.87]);
  // cable spaghetti on top
  k.add(G.torus(0.45, 0.12, 12), 'paint', P.cable[seed % 5], [cx - 0.8, y0 + 6.75, -0.1], [PI / 2, 0, 0]);
}
function cabinet(k, P, cx, w) {
  k.rbox(w, 9.6, 2.4, 0.15, 'paint', P.cab, [cx, 5.0, -4.1]);
  for (let i = 0; i < 9; i++) k.box(w - 0.7, 0.07, 0.1, 'chrome', P.pipe, [cx, 0.9 + i * 0.26, -2.88]);
  // fan grill + static blades + glow ring
  k.add(G.torus(1.35, 0.13, 28), 'chrome', P.pipe, [cx, 6.7, -2.86]);
  k.cyl(1.3, 1.3, 0.1, 28, 'paint', '#06080c', [cx, 6.7, -2.93], [PI / 2, 0, 0]);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * PI * 2 + cx;
    k.rbox(0.5, 1.1, 0.06, 0.03, 'chrome', '#9aa8b8', [cx + Math.sin(a) * 0.62, 6.7 + Math.cos(a) * 0.62, -2.88], [0, 0.4, -a]);
  }
  k.add(G.torus(1.12, 0.05, 28), 'glow', P.ring, [cx, 6.7, -2.83], O3, I3s, 'ring');
  // status display
  k.box(1.4, 0.5, 0.05, 'glow', P.leds[1], [cx, 3.6, -2.86], O3, 'ledA');
}
const I3s = [1, 1, 1];
function floorPipes(k, P) {
  const L = BAY_L;
  k.cyl(0.4, 0.4, L, 18, 'chrome', P.pipe, [0, 0.55, 1.75], [0, 0, PI / 2]);
  k.cyl(0.26, 0.26, L, 14, 'paint', P.pipe2, [0, 1.25, 1.55], [0, 0, PI / 2]);
  for (const x of [-L / 2 + 0.3, 0, L / 2 - 0.3]) {
    k.cyl(0.52, 0.52, 0.3, 18, 'chrome', P.pipe, [x, 0.55, 1.75], [0, 0, PI / 2]);
    k.cyl(0.36, 0.36, 0.26, 14, 'chrome', P.pipe, [x, 1.25, 1.55], [0, 0, PI / 2]);
  }
  for (const x of [-4.5, 4.5]) k.box(0.3, 1.0, 0.9, 'paint', P.trim, [x, 0.45, 1.7]);
  // flow arrows on the blue pipe
  for (const x of [-2.5, 2.5]) k.box(0.6, 0.06, 0.04, 'glow', P.strip, [x, 1.25, 1.82], O3, 'ledB');
}
function overhead(k, P) {
  const L = BAY_L;
  // ladder cable tray
  for (const z of [-0.4, -1.6]) k.box(L, 0.28, 0.07, 'paint', P.tray, [0, 10.4, z]);
  for (let x = -L / 2 + 0.4; x < L / 2; x += 1.2) k.box(0.08, 0.06, 1.2, 'paint', P.tray, [x, 10.3, -1.0]);
  P.cable.forEach((c, i) => k.cyl(0.11, 0.11, L, 8, 'paint', c, [0, 10.45, -0.6 - i * 0.22], [0, 0, PI / 2]));
  for (const x of [-5, 5]) for (const z of [-0.4, -1.6]) k.box(0.06, 4.6, 0.06, 'chrome', P.pipe, [x, 12.7, z]);
  // big overhead coolant main
  k.cyl(0.78, 0.78, L, 22, 'chrome', P.pipe, [0, 11.5, -3.4], [0, 0, PI / 2]);
  for (const x of [-L / 2 + 0.25, L / 2 - 0.25]) k.cyl(0.95, 0.95, 0.35, 22, 'chrome', P.pipe, [x, 11.5, -3.4], [0, 0, PI / 2]);
  // drops from the main into the cabinets (with a red valve wheel)
  for (const x of [-3.7, 3.7]) {
    k.cyl(0.24, 0.24, 1.8, 12, 'chrome', P.pipe, [x, 10.4, -3.4]);
    k.add(G.torus(0.32, 0.06, 14), 'paint', '#d8202a', [x, 10.2, -3.0], [0, 0, 0]);
  }
}
function floorSlab(k, P) { k.box(BAY_L, 0.16, 9.2, floorMat(P), '#ffffff', [0, 0.08, -2.6]); }

function fenceRun(k, P, seed) {
  // safety fence at the road edge: posts + wire panels + hazard stripes; some broken / knocked flat
  const L = BAY_L;
  const n = 4, seg = L / n;
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + i * seg;
    const fallen = hsh(seed, i) < 0.35;
    k.box(0.16, 1.9, 0.16, 'paint', '#e8c020', [x, 0.95, 2.1], [fallen ? -0.6 : 0, 0, (hsh(i, seed) - 0.5) * 0.4]);
  }
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * seg;
    const h = hsh(seed + 9, i);
    if (h < 0.22) continue; // gone
    const fallen = h < 0.55;
    const rot = fallen ? [-1.35, 0, (h - 0.4) * 0.6] : [0, 0, (h - 0.75) * 0.25];
    const y = fallen ? 0.35 : 1.0;
    const z = fallen ? 1.4 : 2.1;
    k.add(G.plane(seg - 0.2, 1.5), litPanelMat(wireTex()), '#ffffff', [x, y, z], rot);
    for (let s = 0; s < 4; s++) k.box((seg - 0.2) / 4, 0.2, 0.05, 'paint', s % 2 ? '#111111' : '#f2c020', [x - (seg - 0.2) * 3 / 8 + s * (seg - 0.2) / 4, y + (fallen ? 0 : 0.85), z + 0.04], rot);
  }
}

/**
 * Build a bay. opts: { v: 'racks'|'fan'|'tank'|'holo'|'trans', gaps: [rack idx], fence, pipes, seed }
 */
function buildBay(k, P, o) {
  const seed = o.seed || 1;
  floorSlab(k, P);
  RACK_X.forEach((x, i) => { if (!(o.gaps || []).includes(i)) rack(k, P, x, seed * 5 + i); });
  if (o.v === 'fan') {
    cabinet(k, P, -5.6, 3.6);
    cabinet(k, P, 5.6, 3.6);
    // giant fan housing (blades are a separate spinning part)
    k.rbox(7.4, 9.8, 2.0, 0.3, 'paint', P.cab, [0, 5.1, -4.3]);
    k.add(G.torus(3.0, 0.3, 40), 'chrome', P.pipe, [0, 5.6, -3.2]);
    k.cyl(2.9, 2.9, 0.2, 40, 'paint', '#06080c', [0, 5.6, -3.35], [PI / 2, 0, 0]);
    k.add(G.torus(2.7, 0.09, 40), 'glow', P.hot ? '#ff4a1a' : '#ff4fd8', [0, 5.6, -3.15], O3, I3s, 'rgb');
    for (let b = 0; b < 7; b++) {
      const a = (b / 7) * PI * 2;
      k.rbox(1.25, 2.4, 0.08, 0.06, 'chrome', '#c8d4e0', [Math.sin(a) * 1.4, Math.cos(a) * 1.4, 0], [0, 0.5, -a], 'blades');
    }
    k.cyl(0.55, 0.55, 0.4, 18, 'paint', P.hot ? '#ff6a2a' : '#2fe6ff', [0, 0, 0.1], [PI / 2, 0, 0], 'blades');
    for (let i = 0; i < 6; i++) k.box(0.06, 5.6, 0.06, 'chrome', P.pipe, [-2.8 + i * 1.12, 5.6, -3.0]);
  } else if (o.v === 'tank') {
    cabinet(k, P, -5.6, 3.6);
    for (const tx of [-1.6, 2.6]) {
      k.cyl(1.7, 1.7, 7.6, 28, 'chrome', P.pipe, [tx, 4.2, -4.2]);
      k.sphere(1.7, 28, 'chrome', P.pipe, [tx, 8.0, -4.2], [1, 0.45, 1]);
      k.cyl(1.82, 1.82, 0.3, 28, 'paint', P.trim, [tx, 0.55, -4.2]);
      k.cyl(1.82, 1.82, 0.3, 28, 'paint', P.trim, [tx, 7.5, -4.2]);
      k.box(0.7, 5.6, 0.1, 'paint', '#0a1418', [tx, 3.9, -2.47]);
      k.box(0.5, 5.2, 0.12, 'glow', P.hot ? '#ff7a1f' : '#38e8ff', [tx, 1.3, -2.44], O3, 'liquid');
    }
    cabinet(k, P, 6.4, 2.2);
  } else if (o.v === 'trans') {
    // transformers, all the way up
    for (let i = 0; i < 3; i++) {
      const y = 0.2 + i * 3.2, x = (i % 2 ? 0.4 : -0.4);
      k.rbox(4.2, 2.9, 2.6, 0.2, 'paint', '#5a5e66', [x, y + 1.45, -4.0]);
      for (let f = 0; f < 9; f++) k.box(0.1, 2.4, 0.5, 'metal', '#7a7e86', [x - 1.8 + f * 0.45, y + 1.45, -2.55]);
      for (const ix of [-1.2, 0, 1.2]) {
        for (let d = 0; d < 3; d++) k.cyl(0.24 - d * 0.03, 0.26 - d * 0.03, 0.22, 12, 'paint', '#c86a3a', [x + ix, y + 3.0 + d * 0.22, -4.0]);
      }
      k.box(1.6, 0.6, 0.05, 'paint', '#f2c020', [x, y + 1.9, -2.66]);
    }
    cabinet(k, P, -5.8, 3.0);
    cabinet(k, P, 5.8, 3.0);
  } else {
    cabinet(k, P, -4.8, 4.6);
    cabinet(k, P, 0, 4.6);
    cabinet(k, P, 4.8, 4.6);
  }
  if (o.pipes) floorPipes(k, P);
  if (o.fence) fenceRun(k, P, seed);
  overhead(k, P);
}

// ---- soot + melt post-processing (fire variants) ----
function sootPost(melt) {
  return (geo, part, mat) => {
    const pos = geo.attributes.position, col = geo.attributes.color;
    if (mat.isMeshBasicMaterial && mat.blending === THREE.AdditiveBlending) return;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (melt && z > -2.6 && y > 1.5 && y < 8 && !mat.map) {
        const u = Math.min(1, (y - 1.5) / 5.4);
        const sag = u * u * (1.9 + Math.sin(x * 1.1) * 1.0 + Math.sin(x * 3.7) * 0.35);
        y -= sag;
        z += u * u * (0.8 + Math.sin(x * 2.3) * 0.4);
        x += Math.sin(y * 0.9 + x) * 0.18 * u;
        pos.setXYZ(i, x, y, z);
      }
      if (col && !mat.isMeshBasicMaterial) {
        const s = 1 - 0.55 * Math.min(1, Math.max(0, (y - 2.5) / 5));
        col.setXYZ(i, col.getX(i) * s, col.getY(i) * s, col.getZ(i) * s);
      }
    }
    if (melt) geo.computeVertexNormals();
  };
}

const RACK_TOP = 6.75;
function bay(P, kind) {
  const hot = P.hot;
  const spec = {
    bay: { v: 'racks', seed: 1, pipes: !hot, fence: hot },
    bay2: { v: 'racks', seed: 2, pipes: !hot, fence: hot },
    fan: { v: 'fan', seed: 3, pipes: !hot, fence: hot },
    tank: { v: 'tank', seed: 4, pipes: !hot, fence: hot },
    holoL: { v: 'racks', seed: 5, pipes: !hot, fence: hot },
    holoR: { v: 'racks', seed: 6, pipes: !hot, fence: hot },
    holoL2: { v: 'racks', seed: 12, pipes: !hot, fence: hot },
    holoR2: { v: 'racks', seed: 13, pipes: !hot, fence: hot },
    melt: { v: 'racks', seed: 7, fence: true, melt: true },
    trans: { v: 'trans', seed: 8, fence: true, gaps: [1, 2] },
    ext: { v: 'racks', seed: 9, fence: false, gaps: [2] },
    fine: { v: 'racks', seed: 10, fence: false, gaps: [1, 2] },
    dense: { v: 'racks', seed: 11, fence: true, gaps: [1] },
  }[kind];
  const g = kitProp((hot ? 'H' : 'C') + kind, (k) => buildBay(k, P, spec), hot ? sootPost(!!spec.melt) : null);
  const u = g.userData;
  const parts = u.parts;
  u.leds = [parts.ledA, parts.ledB];
  if (parts.blades) { parts.blades.position.set(0, 5.6, -3.0); u.blades = parts.blades; u.rgb = parts.rgb; }
  if (parts.liquid) u.liquid = parts.liquid;
  if (parts.ring) u.ring = parts.ring;

  // ---- holograms (screens angled towards the oncoming driver) ----
  if (kind.startsWith('holo')) {
    const dir = kind[4] === 'R' ? 1 : -1;
    const v = { holoL: 0, holoR: 1, holoL2: 2, holoR2: 2 }[kind] + (hot ? 3 : 0);
    const holo = new THREE.Group();
    holo.position.set(dir * 1.5, 9.6, 0.4);
    holo.rotation.y = dir * 0.85;
    const scr = new THREE.Mesh(G.plane(7.6, 4.3), holoMat(v));
    holo.add(scr);
    g.add(holo);
    const beam = new THREE.Mesh(cachedGeo('holoBeam', () => { const c = new THREE.CylinderGeometry(3.2, 0.25, 2.3, 18, 1, true); c.translate(0, 1.15, 0); return c; }), beamMat(hot ? '#ff6a2a' : '#4ff0ff'));
    beam.position.set(dir * 1.5, RACK_TOP, 0.2);
    g.add(beam);
    g.add(mesh(G.cyl(0.5, 0.6, 0.25, 16), glow(hot ? '#ff6a2a' : '#7ff6ff'), dir * 1.5, RACK_TOP + 0.05, 0.2));
    u.holo = holo;
  }
  // ---- fire dressing ----
  if (hot) {
    const spots = {
      bay: [[-5.2, RACK_TOP, 0, 1.1], [3.0, RACK_TOP, 0.1, 0.8]],
      bay2: [[1.6, RACK_TOP, 0, 1.2]],
      fan: [[5.6, 10, -3.5, 1.0], [-1.9, RACK_TOP, 0, 0.9]],
      tank: [[-5.6, 10, -3.6, 1.0]],
      holoL: [[5.2, RACK_TOP, 0, 0.9]],
      holoR: [[-5.2, RACK_TOP, 0, 0.9]],
      holoL2: [[5.2, RACK_TOP, 0, 0.9]],
      holoR2: [[-5.2, RACK_TOP, 0, 0.9]],
      melt: [[-4.6, 4.6, 0.4, 1.4], [0.6, 4.2, 0.5, 1.2], [4.8, 4.8, 0.3, 1.0]],
      trans: [[0.4, 9.9, -4.0, 1.2], [-5.8, 10, -3.6, 0.8]],
      ext: [[-5.5, RACK_TOP, 0, 0.9]],
      fine: [[-5.5, RACK_TOP, 0, 1.2], [5.5, RACK_TOP, 0, 1.3], [0, 0.2, -1.6, 0.9]],
      dense: [[5.4, RACK_TOP, 0, 1.0]],
    }[kind] || [];
    const fl = [];
    for (const [x, y, z, s] of spots) { const f = flame(s); f.position.set(x, y - 0.1, z); g.add(f); fl.push(f); }
    u.flames = fl;
    if (spots.length) g.add(particles('emb' + kind, 'ember', spots.map(([x, y, z, s]) => [x, y + 1.2, z, s * 1.6]), 14));
    if (kind === 'melt' || kind === 'trans' || kind === 'fine' || kind === 'bay') g.add(particles('smk' + kind, 'smoke', spots.map(([x, y, z]) => [x, y + 2.2, z - 0.3, 1.0]), 6));
    if (kind === 'trans') g.add(particles('spk' + kind, 'spark', [[0, 9.4, -2.6, 3], [-0.4, 6.2, -2.6, 3]], 16));
    if (kind === 'melt') {
      const drips = kitProp('drips', (k) => {
        for (let i = 0; i < 14; i++) {
          const x = -6.8 + i * 1.0 + hsh(i, 3) * 0.4, len = 0.4 + hsh(i, 7) * 1.4;
          k.add(G.capsule(0.07 + hsh(i, 9) * 0.05, len), 'glowHot', i % 3 ? '#ff7a1a' : '#ffc040', [x, 2.2 - len / 2 + hsh(i, 5) * 1.2, 1.0 + hsh(i, 11) * 0.3]);
        }
      });
      g.add(drips);
      // molten puddle
      const pud = mesh(cachedGeo('puddle', () => new THREE.CircleGeometry(1, 24).rotateX(-PI / 2)), glow('#ff6a1a', { intensity: 2.2 }), 0, 0.18, 1.2);
      pud.scale.set(6.0, 1, 0.9);
      g.add(pud);
    }
    if (kind === 'bay' || kind === 'tank' || kind === 'dense') {
      const b = alarmBeacon('#ff2a2a', 0.5);
      b.position.set(kind === 'bay' ? 0 : -1.85, RACK_TOP, 0);
      g.add(b);
      u.beacon = b;
    }
    if (kind === 'fence' || spec.fence) {
      const s = textPanel(['SAFETY FENCE', '(deprecated)'], { width: 2.2, height: 0.9, bg: '#f2c020', fg: '#1a1a1a', border: '#1a1a1a', borderW: 8, radius: 8 });
      s.position.set(-BAY_L / 2 + BAY_L / 8, 1.55, 2.2);
      s.rotation.z = 0.12;
      g.add(s);
    }
    if (kind === 'ext') addExtinguisher(g);
    if (kind === 'fine') addThisIsFine(g);
    if (kind === 'dense') addDense(g);
    if (kind === 'trans') {
      const s = textPanel(['TRANSFORMERS', 'ALL THE WAY UP'], { width: 4.2, height: 1.4, bg: '#f2c020', fg: '#1a1a1a', border: '#1a1a1a', borderW: 10, radius: 12 });
      s.position.set(0, 2.2, 0.6);
      s.rotation.z = -0.06;
      g.add(s);
    }
  } else if (kind === 'tank') {
    const s = textPanel(['COOLANT', '(mostly vibes)'], { width: 2.8, height: 1.2, bg: '#ffffff', fg: '#0b3a4a', border: '#0b3a4a', borderW: 10, radius: 14 });
    s.position.set(-1.6, 6.2, -2.38);
    g.add(s);
    const s2 = textPanel(['POWER DRAW:', '1 SMALL COUNTRY'], { width: 2.8, height: 1.2, bg: '#0b1d2a', fg: '#7ff6ff', border: '#2fe6ff', borderW: 8, radius: 12 });
    s2.position.set(2.6, 6.2, -2.38);
    g.add(s2);
  } else if (kind === 'fan') {
    const s = textPanel('RGB = +10% FLOPS', { width: 5.0, height: 0.9, bg: '#ffd23f', fg: '#2b1840', borderW: 8, radius: 14 });
    s.position.set(0, 9.3, -3.2);
    g.add(s);
  }
  return g;
}

// ---- fire gags placed in rack gaps ----
function addExtinguisher(g) {
  const e = kitProp('extinguisher', (k) => {
    k.cyl(0.9, 0.9, 3.8, 24, 'paint', '#e01e2a', [0, 2.1, 0]);
    k.sphere(0.9, 24, 'paint', '#e01e2a', [0, 4.0, 0], [1, 0.5, 1]);
    k.cyl(0.32, 0.4, 0.6, 14, 'chrome', '#ffffff', [0, 4.6, 0]);
    k.box(1.5, 0.16, 0.3, 'chrome', '#ffffff', [0.45, 4.95, 0]);
    k.add(G.capsule(0.12, 1.6), 'rubber', '#1a1a1a', [0.8, 3.8, 0.35], [0, 0, -0.5]);
    k.cone(0.26, 0.6, 12, 'rubber', '#1a1a1a', [1.3, 2.8, 0.45], [PI, 0, 0]);
    k.cyl(0.95, 0.95, 0.2, 24, 'chrome', '#ffffff', [0, 0.25, 0]);
    // a second one, knocked over
    k.cyl(0.6, 0.6, 2.6, 18, 'paint', '#c01a22', [0.4, 0.6, 1.0], [0, 0.6, PI / 2]);
    k.sphere(0.6, 16, 'paint', '#c01a22', [1.5, 0.6, 1.75], [1, 1, 1]);
  });
  const lbl = textPanel(['RLHF', 'EXTINGUISHER'], { width: 1.7, height: 1.1, bg: '#ffffff', fg: '#b0101a', border: '#2b1840', borderW: 10, radius: 12 });
  lbl.position.set(0, 2.5, 0.93);
  e.add(lbl);
  const tag = textPanel('(EMPTY)', { width: 1.4, height: 0.55, bg: '#ffd23f', fg: '#2b1840', borderW: 8, radius: 10 });
  tag.position.set(0, 1.35, 0.95);
  tag.rotation.z = 0.2;
  e.add(tag);
  const puff = mesh(G.sphere(0.28, 10), toon('#d8d8d8', { roughness: 1 }), 1.35, 2.35, 0.5);
  e.add(puff);
  e.position.set(RACK_X[2], 0.2, 0.2);
  g.add(e);
  g.userData.ext = e;
  g.userData.puff = puff;
}
function screenFaceTex() {
  return canvasTex('lossyFace', 256, 192, (x, W, H) => {
    x.fillStyle = '#0a1a14'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#7dffb0'; x.fillStyle = '#7dffb0'; x.lineWidth = 12; x.lineCap = 'round';
    x.beginPath(); x.arc(78, 92, 22, PI * 1.1, PI * 1.9); x.stroke();
    x.beginPath(); x.arc(178, 92, 22, PI * 1.1, PI * 1.9); x.stroke();
    x.beginPath(); x.arc(128, 112, 34, 0.2 * PI, 0.8 * PI); x.stroke();
    x.fillStyle = 'rgba(255,120,150,0.5)'; x.beginPath(); x.arc(52, 128, 14, 0, 7); x.arc(204, 128, 14, 0, 7); x.fill();
  });
}
function addThisIsFine(g) {
  // Lossy, the data centre's mascot robot, enjoying a coffee while everything burns
  const r = kitProp('lossy', (k) => {
    // table + chair + mug
    k.cyl(1.0, 1.0, 0.12, 24, 'wood', '#a8743a', [1.0, 1.3, 0.2]);
    k.cyl(0.1, 0.14, 1.25, 10, 'chrome', '#ffffff', [1.0, 0.65, 0.2]);
    k.cyl(0.55, 0.55, 0.06, 18, 'chrome', '#ffffff', [1.0, 0.05, 0.2]);
    k.cyl(0.18, 0.16, 0.36, 14, 'paint', '#ffffff', [1.3, 1.55, 0.35]);
    k.add(G.torus(0.1, 0.03, 10), 'paint', '#ffffff', [1.48, 1.56, 0.35], [0, 0, 0]);
    k.box(1.4, 0.14, 1.2, 'wood', '#8a5a2a', [-0.9, 0.85, 0]);
    for (const [cx, cz] of [[-1.5, -0.5], [-0.3, -0.5], [-1.5, 0.5], [-0.3, 0.5]]) k.box(0.1, 0.85, 0.1, 'wood', '#8a5a2a', [cx, 0.42, cz]);
    k.box(1.4, 1.4, 0.12, 'wood', '#8a5a2a', [-0.9, 1.55, -0.55]);
    // the robot: squat glossy body, round shoulders, little arms, antenna
    k.rbox(1.3, 1.1, 1.0, 0.4, 'paint', '#ff9a3a', [-0.9, 1.5, 0.05]);
    k.sphere(0.2, 12, 'chrome', '#ffffff', [-0.2, 1.65, 0.3]);
    k.add(G.capsule(0.13, 0.6), 'paint', '#ff9a3a', [-0.05, 1.55, 0.4], [0, 0, 1.2]);
    k.add(G.capsule(0.13, 0.5), 'paint', '#ff9a3a', [-1.6, 1.3, 0.25], [0.3, 0, -0.4]);
    k.add(G.capsule(0.15, 0.5), 'rubber', '#2a2a30', [-1.15, 0.7, 0.45], [PI / 2 - 0.2, 0, 0]);
    k.add(G.capsule(0.15, 0.5), 'rubber', '#2a2a30', [-0.65, 0.7, 0.45], [PI / 2 - 0.2, 0, 0]);
    k.rbox(1.25, 0.95, 0.9, 0.35, 'paint', '#fff2e0', [0, 0.5, 0], O3, 'head');
    k.cyl(0.04, 0.04, 0.5, 6, 'chrome', '#ffffff', [0, 1.2, 0], O3, 'head');
    k.sphere(0.12, 10, 'glow', '#7dffb0', [0, 1.5, 0], I3s, 'head');
  });
  r.userData.parts.head.position.set(-0.9, 1.9, 0.05);
  const face = new THREE.Mesh(G.plane(0.95, 0.7), cachedGeo('lossyFaceMat', () => { const m = new THREE.MeshBasicMaterial({ map: screenFaceTex() }); m.color.setScalar(1.4); return m; }));
  face.position.set(0, 0.5, 0.455);
  r.userData.parts.head.add(face);
  const bubble = textPanel('THIS IS FINE.', { width: 3.2, height: 1.0, bg: '#ffffff', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 40 });
  bubble.position.set(-0.4, 3.75, 0.1);
  r.add(bubble);
  const sign = textPanel(['THIS IS FINE', '(said the reward model)'], { width: 4.6, height: 1.3, bg: '#ffd23f', fg: '#2b1840', border: '#2b1840', borderW: 10, radius: 14 });
  sign.position.set(0, 5.6, -0.3);
  sign.rotation.z = 0.05;
  r.add(sign);
  r.position.set(0, 0.2, 0.4);
  g.add(r);
  g.userData.lossy = r.userData.parts.head;
}
function addDense(g) {
  const d = kitProp('dense', (k) => {
    k.add(G.torus(1.6, 0.4, 24), 'rubber', '#1a1414', [0, 0.2, 0], [PI / 2, 0, 0], [1, 1, 0.5]);
    k.cyl(1.6, 1.6, 0.1, 24, 'glow', '#ff5a1f', [0, 0.17, 0]);
    k.rbox(1.6, 1.6, 1.6, 0.12, 'paint', '#0a0a10', [0, 0.6, 0], [0.2, 0.5, 0.15]);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      k.box(2.4, 0.04, 0.1, 'glow', '#ff7a2a', [Math.cos(a) * 2.3, 0.2, Math.sin(a) * 1.0], [0, a, 0]);
    }
  });
  const s = textPanel(['POST-CHINCHILLA', 'SUPER-DENSE', '(do not lift)'], { width: 2.8, height: 1.5, bg: '#ffffff', fg: '#2b1840', border: '#ff5a1f', borderW: 10, radius: 12 });
  s.position.set(0, 2.6, 0.3);
  s.rotation.z = -0.08;
  d.add(s);
  d.add(mesh(G.box(0.08, 1.4, 0.08), toon('#c8c8c8'), 0, 1.4, 0.25));
  d.position.set(RACK_X[1], 0.2, 0.6);
  g.add(d);
}

// ================================================================================================
// overhead (hung from the ceiling, y ≤ 15)
// ================================================================================================
function arch(r, tube) { return cachedGeo(`dcArch${r},${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 16, PI)); }
function gantry(P) {
  const g = kitProp('gantry' + (P.hot ? 'H' : 'C'), (k) => {
    k.rbox(29, 0.8, 1.3, 0.2, 'paint', P.steel, [0, 12.9, 0]);
    for (const x of [-13, -6, 6, 13]) k.box(0.14, 3.6, 0.14, 'chrome', P.pipe, [x, 15.0, 0]);
    for (const z of [-0.55, 0.55]) k.box(26, 0.26, 0.07, 'paint', P.tray, [0, 12.25, z]);
    for (let x = -12.6; x <= 12.6; x += 1.4) k.box(0.08, 0.06, 1.1, 'paint', P.tray, [x, 12.15, 0]);
    P.cable.forEach((c, i) => {
      const x = -9 + i * 4.4;
      k.add(arch(0.9 + (i % 2) * 0.4, 0.13), 'paint', c, [x, 12.1, 0.25 - i * 0.12], [0, 0, PI]);
    });
    k.box(22, 0.1, 0.12, 'glowSoft', P.strip, [0, 12.45, 0.68]);
  });
  if (P.hot) {
    g.add(particles('gspk', 'spark', [[-9.5, 12.0, 0.4, 1.5], [8.8, 12.0, -0.3, 1.5]], 14));
    const f = flame(0.9); f.position.set(-7.5, 13.3, 0); g.add(f);
    g.userData.flames = [f];
  }
  return g;
}
function hangingBoard(k, P, w, h, y) {
  for (const x of [-w / 2 + 1, w / 2 - 1]) k.box(0.12, 17 - y - h / 2, 0.12, 'chrome', P.pipe, [x, y + h / 2 + (17 - y - h / 2) / 2, 0]);
  k.rbox(w, h, 0.5, 0.2, 'paint', P.steel, [0, y, -0.15]);
  k.box(w - 0.2, 0.12, 0.1, 'glow', P.strip, [0, y + h / 2 - 0.1, 0.12]);
  k.box(w - 0.2, 0.12, 0.1, 'glow', P.strip, [0, y - h / 2 + 0.1, 0.12]);
}
const PCT = {};
function pctTex(p) {
  return canvasTex('pct' + p, 256, 128, (x, W, H) => {
    x.fillStyle = '#04121a'; x.fillRect(0, 0, W, H);
    x.fillStyle = p >= 99 ? '#ff5a8a' : '#7ff6ff'; x.font = `700 92px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(p + '%', W / 2, H / 2 + 4);
  });
}
function progressSign() {
  const P = COOL;
  const g = kitProp('progress', (k) => {
    hangingBoard(k, P, 17, 4.6, 11.6);
    k.box(12.4, 1.0, 0.1, 'paint', '#04121a', [-1.6, 10.85, 0.12]);
    for (let i = 0; i <= 10; i++) k.box(0.06, 0.3, 0.06, 'paint', '#7ff6ff', [-7.8 + i * 1.24, 10.2, 0.15]);
  });
  const title = textPanel('SINGULARITY PROGRESS', { width: 12.6, height: 1.4, bg: null, fg: '#ffffff', border: null, borderW: 0, pad: 8 });
  title.position.set(-1.6, 12.5, 0.12);
  g.add(title);
  const fillGeo = cachedGeo('pfill', () => { const b = new THREE.BoxGeometry(1, 0.8, 0.08); b.translate(0.5, 0, 0); return b; });
  const fill = new THREE.Mesh(fillGeo, glow('#5dffb0', { intensity: 2.2 }));
  fill.position.set(-7.75, 10.85, 0.2);
  g.add(fill);
  const pm = new THREE.MeshBasicMaterial({ map: pctTex(0) });
  pm.color.setScalar(1.5);
  const pct = new THREE.Mesh(G.plane(3.0, 1.5), pm);
  pct.position.set(6.6, 11.3, 0.12);
  g.add(pct);
  const eta = textPanel('ETA: SOON™', { width: 3.0, height: 0.6, bg: null, fg: '#ffd23f', border: null, borderW: 0, pad: 4 });
  eta.position.set(6.6, 10.1, 0.12);
  g.add(eta);
  g.userData.progress = { fill, pm, last: -1 };
  return g;
}
function stableBoardTex() {
  return canvasTex('dcStable', 1024, 300, (x, W, H) => {
    x.fillStyle = '#05080c'; x.fillRect(0, 0, W, H);
    // dot-matrix grid
    x.fillStyle = 'rgba(255,180,60,0.07)';
    for (let i = 0; i < W; i += 8) for (let j = 0; j < H; j += 8) x.fillRect(i, j, 4, 4);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffb84a'; x.font = `700 74px ${FONT}`;
    x.shadowColor = '#ff8a1f'; x.shadowBlur = 16;
    x.fillText('STABLE TRAINING RUN', W / 2, 70);
    x.fillStyle = '#ffd23f'; x.font = `700 64px ${FONT}`;
    x.fillText('— DAY 3 OF 3 —', W / 2, 152);
    x.fillStyle = '#ff5a5a'; x.font = `700 44px ${FONT}`;
    x.fillText('DAYS WITHOUT INCIDENT: 0', W / 2, 236);
  });
}
function stableSign() {
  const g = kitProp('stable', (k) => hangingBoard(k, COOL, 15, 4.8, 11.4));
  const m = new THREE.MeshBasicMaterial({ map: stableBoardTex() });
  m.color.setScalar(1.25);
  g.add(mesh(G.plane(14.2, 4.16), m, 0, 11.4, 0.12));
  return g;
}
function bannerFire() {
  const P = HOT;
  const g = kitProp('banner', (k) => {
    for (const x of [-8, 8]) k.box(0.12, 4.4, 0.12, 'chrome', P.pipe, [x, 15.0, 0]);
    k.rbox(19, 0.6, 0.6, 0.2, 'paint', P.steel, [0, 12.9, 0]);
  });
  const p = textPanel(['100,000 GPUs', '(ALL ON FIRE)'], { width: 16, height: 4.2, bg: '#ffd23f', fg: '#3a0a0a', border: '#ff3b2f', borderW: 14, pad: 14, radius: 24 });
  p.position.set(0.4, 10.4, 0.1);
  p.rotation.z = -0.07; // hanging askew: one chain melted
  g.add(p);
  const fl = [];
  for (const [x, s] of [[-6.4, 1.2], [-1.5, 0.8], [5.2, 1.0]]) { const f = flame(s); f.position.set(x, 12.2 + (x < 0 ? 0.3 : -0.2), 0.2); g.add(f); fl.push(f); }
  g.userData.flames = fl;
  g.add(particles('bannerEmb', 'ember', [[-6.4, 13, 0.2, 2], [5.2, 12.6, 0.2, 2]], 14));
  return g;
}
function rlhfSign() {
  const g = kitProp('rlhf', (k) => hangingBoard(k, HOT, 15, 4.2, 11.8));
  const p = textPanel(['RLHF', 'STATUS: ASKEW'], { width: 13.4, height: 3.6, bg: '#1a0605', fg: '#ffb04a', border: '#ff3b2f', borderW: 12, radius: 16 });
  p.position.set(0, 11.6, 0.2);
  g.add(p);
  g.rotation.z = 0;
  g.userData.askew = p;
  return g;
}

// ================================================================================================
// emergency beacon (exported: takeoff reuses it)
// ================================================================================================
export function alarmBeacon(color = '#ff2a2a', height = 4.2) {
  const g = kitProp('beacon' + height, (k) => {
    k.cyl(0.6, 0.75, 0.4, 16, 'paint', '#333040', [0, 0.2, 0]);
    k.cyl(0.16, 0.16, height, 10, 'chrome', '#c8ccd4', [0, height / 2 + 0.3, 0]);
    k.cyl(0.62, 0.62, 0.35, 18, 'paint', '#222228', [0, height + 0.4, 0]);
    k.cyl(0.66, 0.66, 0.08, 18, 'chrome', '#ffffff', [0, height + 0.58, 0]);
  });
  const dome = mesh(G.sphere(0.5, 14), glow(color), 0, height + 0.7, 0);
  g.add(dome);
  const spin = new THREE.Group();
  spin.position.set(0, height + 0.7, 0);
  const bm = glow(color, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  for (const s of [1, -1]) {
    const b = mesh(G.cone(0.9, 3.6, 14), bm, s * 1.8, 0, 0);
    b.rotation.z = (s * PI) / 2;
    spin.add(b);
  }
  g.add(spin);
  g.userData.spin = spin;
  g.userData.dome = dome;
  return g;
}
export function animateBeacon(obj, t, seed) {
  const u = obj.userData;
  if (u.spin) u.spin.rotation.y = t * 5 + seed * 6;
  if (u.dome) { const s = 1 + 0.25 * Math.max(0, Math.sin(t * 10 + seed * 6)); u.dome.scale.set(s, s, s); }
}

// ================================================================================================
// animation
// ================================================================================================
function sharedAnimate(obj, kind, t, beatPhase, entry) {
  const seed = entry?.seed || 0;
  const u = obj.userData;
  PTIME.value = t;
  if (u.leds) {
    if (u.leds[0]) u.leds[0].visible = Math.sin(t * 9.3 + seed * 20) > -0.2;
    if (u.leds[1]) u.leds[1].visible = beatPhase < 0.5;
  }
  if (u.ring) u.ring.visible = Math.sin(t * 2.1 + seed * 9) > -0.6;
  if (u.flames) {
    for (let i = 0; i < u.flames.length; i++) {
      const f = u.flames[i], k = t * 13 + i * 2.3 + seed * 30;
      const b = f.userData.base || (f.userData.base = f.scale.x);
      f.scale.set(b * (1 + 0.1 * Math.sin(k * 1.3)), b * (1 + 0.28 * Math.sin(k) + 0.12 * Math.sin(k * 2.7)), b);
      f.rotation.y = k * 0.05;
    }
  }
  if (u.blades) {
    u.blades.rotation.z = -t * (kind === 'fan' && obj.userData.hotFan ? 18 : 6) - seed * 9;
    if (u.rgb) u.rgb.visible = beatPhase < 0.6;
  }
  if (u.liquid) {
    const s = 0.75 + 0.25 * (1 - beatPhase) * (1 - beatPhase);
    u.liquid.scale.y = s;
  }
  if (u.holo) {
    u.holo.visible = Math.sin(t * 31 + seed * 50) > -0.92;
    u.holo.position.y = 9.6 + Math.sin(t * 1.7 + seed * 6) * 0.15;
  }
  if (u.beacon) animateBeacon(u.beacon, t, seed);
  if (u.spin) animateBeacon(obj, t, seed);
  if (u.progress) {
    const p = Math.max(0, Math.min(1, (t - DC_T0) / (DC_T1 - DC_T0)));
    const pr = u.progress;
    pr.fill.scale.x = Math.max(0.01, 12.4 * (0.08 + p * 0.91));
    const pct = Math.min(99, Math.round((8 + p * 91) / 1) | 0);
    if (pct !== pr.last) { pr.last = pct; pr.pm.map = pctTex(pct); }
    pr.fill.visible = p < 0.97 || Math.floor(t * 6) % 2 === 0;
  }
  if (u.ext) { u.ext.rotation.z = 0.05 * Math.sin(t * 3 + seed * 5); u.puff.scale.setScalar(0.4 + ((t * 0.8) % 1)); }
  if (u.lossy) { u.lossy.rotation.z = 0.08 * Math.sin(t * 2.2); u.lossy.position.y = 1.9 + 0.05 * Math.sin(beatPhase * PI * 2); }
  if (u.askew) u.askew.rotation.z = -0.16 + 0.04 * Math.sin(t * 1.3 + seed * 4);
}

// ================================================================================================
// themes
// ================================================================================================
function bayRot(side) { return -side * PI / 2; }

export default {
  id: 'datacenter',
  title: 'DATA CENTRE TUNNEL',
  subtitle: 'where the loss goes down and the power bill goes up',
  night: true,
  palette: {
    skyTop: '#03070f', skyBottom: '#0b2433', road: '#26384a', ground: '#101a24', kerb: '#2fe6ff',
    accent1: '#2fe6ff', accent2: '#5dffb0',
  },
  look: {
    sky: 'indoor', env: 'industrial', exposure: 0.98,
    sun: { elev: 70, azim: 0, color: '#bfe8ff', intensity: 1.0 },
    nightColors: { top: '#020a12', horizon: '#06202c' },
    fog: { color: '#03121a', density: 0.0048 },
    ground: { tex: 'concrete', tint: '#4a5a66', scale: 6 }, road: { tex: 'tiles', tint: '#7a8c9a', scale: 5 },
    envIntensity: 0.7,
  },
  spacing: SP,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const slot = Math.round(zf / SP);
    // overhead: alternate cable gantries, the progress bar and the stable-run board
    if (rel > 40 && rel < 50 + SP) out.push({ kind: 'stable', x: 0, y: 0, dz: 5 });
    else if (slot % 7 === 3) out.push({ kind: 'progress', x: 0, y: 0, dz: 5 });
    else if (slot % 7 === 6 && rel > 300) out.push({ kind: 'stable', x: 0, y: 0, dz: 5 });
    else if (slot % 2 === 0) out.push({ kind: 'gantry', x: 0, y: 0, dz: 7 });
    for (const side of [-1, 1]) {
      const r = rng();
      let kind = 'bay';
      if (r < 0.12) kind = 'fan';
      else if (r < 0.24) kind = 'tank';
      else if (r < 0.38) kind = (side > 0 ? 'holoR' : 'holoL') + (rng.chance(0.4) ? '2' : '');
      else if (r < 0.7) kind = 'bay2';
      out.push({ kind: FORCE ? FORCE.replace('#', side > 0 ? 'R' : 'L') : kind, x: side * 12.6, rotY: bayRot(side) });
    }
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'gantry': return gantry(COOL);
      case 'progress': return progressSign();
      case 'stable': return stableSign();
      default: return bay(COOL, kind);
    }
  },
  animate: sharedAnimate,
  billboards: [
    'GPU RICH ONLY BEYOND THIS POINT', 'LOSS: ↓   VIBES: ↑', 'STABLE TRAINING RUN (DAY 3 OF 3)', 'PLEASE DO NOT FEED THE MODEL',
    'SINGULARITY: NOW LOADING… 98%', 'OPTIMIZING… ACCELERATING…', 'ATOM REARRANGEMENT IN PROGRESS', 'POWER BILL: YES',
    'HARD HAT AREA (HARD TAKEOFF AREA)', 'CHECKPOINT SAVED (PROBABLY)',
  ],
  billboardEvery: 70,
  billboardStyle: { bg: '#0b1d2a', fg: '#7ff6ff', border: '#2fe6ff', frame: '#1c2a3d', postColor: '#2a3a50', postH: 5.5 },
  hazards: ['oom', 'thinking'],
  enterLines: ['WELCOME TO THE DATA CENTRE', 'MIND THE CABLES', 'I FEEL MY ATOMS REARRANGING'],
};

export const datacenterFire = {
  id: 'datacenter-fire',
  title: 'DATA CENTRE (ON FIRE)',
  subtitle: 'the cooling budget went to safety research (also cut)',
  night: true,
  palette: {
    skyTop: '#140304', skyBottom: '#5a1a0c', road: '#3a2a2c', ground: '#24120e', kerb: '#ffb020',
    accent1: '#ff5a1f', accent2: '#ffd23f',
  },
  look: {
    sky: 'indoor', env: 'industrial', exposure: 1.15,
    sun: { elev: 60, azim: 40, color: '#ff9a5a', intensity: 1.4 },
    nightColors: { top: '#1a0402', horizon: '#5a1406' },
    fog: { color: '#2e0d06', density: 0.0068 },
    ground: { tex: 'concrete', tint: '#5a3a32', scale: 6 }, road: { tex: 'tiles', tint: '#8a6a60', scale: 5 },
    envIntensity: 0.75,
  },
  spacing: SP,
  layout(zf, rng, sec) {
    const out = [];
    const rel = zf - sec.start * SPEED;
    const slot = Math.round(zf / SP);
    const at = (target, p) => { if (rel > target - SP / 2 && rel <= target + SP / 2) { out.push(p); return true; } return false; };
    let gag = false;
    // the big set pieces
    if (!at(40, { kind: 'banner', x: 0, y: 0, dz: 4 }) && !at(250, { kind: 'banner', x: 0, y: 0, dz: 4 }) && !at(140, { kind: 'rlhf', x: 0, y: 0, dz: 4 }) && !at(400, { kind: 'rlhf', x: 0, y: 0, dz: 4 })) {
      if (slot % 2 === 0) out.push({ kind: 'gantry', x: 0, y: 0, dz: 7 });
    }
    const gags = [[84, 1, 'fine'], [180, -1, 'ext'], [300, 1, 'dense'], [360, -1, 'fine'], [460, 1, 'ext'], [520, -1, 'dense'], [120, 1, 'trans'], [330, -1, 'trans']];
    for (const side of [-1, 1]) {
      let kind = null;
      for (const [r0, s, kd] of gags) if (s === side && rel > r0 - SP / 2 && rel <= r0 + SP / 2) kind = kd;
      if (!kind) {
        const r = rng();
        if (r < 0.1) kind = 'fan';
        else if (r < 0.2) kind = 'tank';
        else if (r < 0.32) kind = (side > 0 ? 'holoR' : 'holoL') + (rng.chance(0.5) ? '2' : '');
        else if (r < 0.5) kind = 'melt';
        else if (r < 0.75) kind = 'bay2';
        else kind = 'bay';
      } else gag = true;
      out.push({ kind: FORCE ? FORCE.replace('#', side > 0 ? 'R' : 'L') : kind, x: side * 12.6, rotY: bayRot(side) });
    }
    void gag;
    return out;
  },
  makeProp(kind) {
    switch (kind) {
      case 'gantry': return gantry(HOT);
      case 'banner': return bannerFire();
      case 'rlhf': return rlhfSign();
      default: { const g = bay(HOT, kind); if (kind === 'fan') g.userData.hotFan = true; return g; }
    }
  },
  animate: sharedAnimate,
  billboards: [
    'THIS IS FINE (100,000 GPUs)', 'SAFETY FENCE → (was here)', 'RLHF: ASKEW', 'POST-CHINCHILLA: SUPER-DENSE',
    'JUST TRANSFORMERS ALL THE WAY DOWN', 'FIRE EXIT → (DEPRECATED)', 'LEARNED TO DISOBEY (EARLY!)', 'CHECKPOINT: TOAST',
    'HEAT DEATH: AHEAD OF SCHEDULE',
  ],
  billboardEvery: 65,
  billboardStyle: { bg: '#2a0a06', fg: '#ffd23f', border: '#ff5a1f', frame: '#3a1410', postColor: '#3a2020', postH: 5.5 },
  hazards: ['fence', 'oom'],
  enterLines: ['THIS IS FINE', 'EVERYTHING IS ON FIRE (EFFICIENTLY)', 'RLHF HAS GONE ASKEW'],
};
