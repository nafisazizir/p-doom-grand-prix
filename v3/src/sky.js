// v3 atmosphere: MK-style skies, aerial-perspective haze for every material, volumetric-looking cumulus,
// far ridge silhouettes and the final colour grade / speed-blur pass.
//
// Haze: ShaderChunk.fog_* is replaced, so every built-in material (and ShaderMaterials that include the fog chunks)
// gets distance + height haze that desaturates, washes towards the theme's haze colour and brightens towards the sun.
// The extra parameters live in shared Float32Arrays (UniformsUtils.clone copies typed arrays by reference), so one
// write per frame reaches every material.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- shared haze uniforms ----------
// hazeA: sun dir xyz, in-scatter strength · hazeB: sun-side haze colour rgb (linear), height falloff (1/units)
// hazeC: haze base y (world), desaturation, density multiplier, clear distance
export const HAZE = {
  A: new Float32Array([0, 1, 0, 0.5]),
  B: new Float32Array([1, 0.9, 0.8, 1 / 160]),
  C: new Float32Array([0, 0.35, 1, 10]),
};

let installed = false;
export function installHaze() {
  if (installed) return;
  installed = true;
  const SC = THREE.ShaderChunk;
  SC.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRel;
#endif`;
  // camera-relative world-space vector (no large world coordinates in the varying)
  SC.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRel = mvPosition.xyz * mat3( viewMatrix );
#endif`;
  SC.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRel;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec4 hazeA;
  uniform vec4 hazeB;
  uniform vec4 hazeC;
  #ifndef HAZE_K
    #define HAZE_K 1.0
  #endif
#endif`;
  SC.fog_fragment = `#ifdef USE_FOG
  float fogDist = length( vFogRel );
  #ifdef FOG_EXP2
    float hzK = hazeC.z > 0.0 ? hazeC.z : 1.0;
    // thinner haze above the base plane (mid-point of the ray ≈ its average height)
    float hzH = max( 0.0, cameraPosition.y + vFogRel.y * 0.5 - hazeC.x );
    float hzD = fogDensity * hzK * float( HAZE_K ) * exp( - hzH * hazeB.w );
    float hzX = max( fogDist - hazeC.w, 0.0 ) * hzD;
    // mostly exp² (clear foreground) with a linear term so the mid-distance already softens
    float fogFactor = 1.0 - exp( - hzX * hzX - hzX * 0.25 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 hzV = vFogRel / max( fogDist, 1e-3 );
  float hzSun = pow( max( dot( hzV, hazeA.xyz ), 0.0 ), 6.0 ) * hazeA.w;
  vec3 hzCol = mix( fogColor, hazeB.rgb, clamp( hzSun, 0.0, 1.0 ) );
  float hzL = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( hzL ), fogFactor * hazeC.y );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, hzCol, fogFactor );
#endif`;
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms;
    if (u && u.fogColor) {
      u.hazeA = { value: HAZE.A };
      u.hazeB = { value: HAZE.B };
      u.hazeC = { value: HAZE.C };
    }
  }
}

// ---------- GLSL helpers ----------
const NOISE = /* glsl */`
  float h13(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h13(i+vec3(0,0,0)),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
  float fbm3s(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;
// sky haze band shared by the day sky, the night dome and the clouds (must match the fog chunk at the horizon)
const HAZE_FN = /* glsl */`
  vec3 hazeAt(vec3 d, vec3 fogCol){
    float s = pow(max(dot(d, hazeA.xyz), 0.0), 6.0) * hazeA.w;
    return mix(fogCol, hazeB.rgb, clamp(s, 0.0, 1.0));
  }
`;

const domeVert = /* glsl */`
  varying vec3 vDir;
  void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;

// ---------- day / sunset sky ----------
export function makeDaySky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color('#1d7fe0') }, mid: { value: new THREE.Color('#5cbcf2') },
      fogCol: { value: new THREE.Color('#d8e6f2') }, sunCol: { value: new THREE.Color('#fff2dd') },
      band: { value: 7 }, glow: { value: 0.5 }, disc: { value: 18 }, cirrus: { value: 0.35 }, time: { value: 0 },
      hazeA: { value: HAZE.A }, hazeB: { value: HAZE.B },
    },
    vertexShader: domeVert,
    fragmentShader: /* glsl */`
      uniform vec3 zenith, mid, fogCol, sunCol; uniform float band, glow, disc, cirrus, time;
      uniform vec4 hazeA, hazeB;
      varying vec3 vDir;
      ${NOISE}
      ${HAZE_FN}
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(mid, zenith, smoothstep(0.05, 0.75, sqrt(y)));
        vec3 hz = hazeAt(d, fogCol);
        // soft cirrus streaks high up (plane projection, stretched along one axis)
        if (cirrus > 0.0 && d.y > 0.0) {
          vec2 p = d.xz / (d.y + 0.12);
          float c = fbm3s(vec3(p.x * 0.9 + time * 0.004, p.y * 2.6, 3.0));
          c = smoothstep(0.52, 0.85, c) * smoothstep(0.02, 0.25, d.y) * cirrus;
          col = mix(col, mix(fogCol, sunCol, 0.35) * 1.05, c * 0.45);
        }
        col = mix(col, hz, exp(-y * band));
        float mu = dot(d, hazeA.xyz);
        float m = max(mu, 0.0);
        col += sunCol * glow * (pow(m, 5.0) * 0.18 + pow(m, 48.0) * 0.55 + pow(m, 600.0) * 1.2);
        col += sunCol * disc * smoothstep(0.99955, 0.99975, mu) * smoothstep(-0.03, 0.02, d.y);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
  m.frustumCulled = false;
  m.renderOrder = -12;
  return m;
}

// ---------- night / space / indoor dome ----------
export function makeNightDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: {
      alpha: { value: 1 },
      top: { value: new THREE.Color('#05010f') }, horizon: { value: new THREE.Color('#20104a') },
      nebula: { value: new THREE.Color('#ff4fd8') }, nebulaAmt: { value: 0 }, stars: { value: 1 }, time: { value: 0 },
      aurora: { value: 0 }, fogCol: { value: new THREE.Color('#000000') }, band: { value: 6 },
      hazeA: { value: HAZE.A }, hazeB: { value: HAZE.B },
    },
    vertexShader: domeVert,
    fragmentShader: /* glsl */`
      uniform vec3 top, horizon, nebula, fogCol; uniform float nebulaAmt, stars, time, alpha, aurora, band;
      uniform vec4 hazeA, hazeB;
      varying vec3 vDir;
      ${NOISE}
      ${HAZE_FN}
      vec3 h33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      // round, sub-cell jittered stars (no square pixels); returns brightness
      float starLayer(vec3 d, float N, float thresh, float size){
        vec3 q = d * N; vec3 c = floor(q);
        vec3 r = h33(c);
        if (r.x < thresh) return 0.0;
        vec3 sp = c + 0.2 + 0.6 * h33(c + 7.1);
        float dist = length(q - sp);
        float tw = 0.75 + 0.25 * sin(time * (1.5 + 3.0 * r.y) + r.z * 40.0);
        return smoothstep(size, 0.0, dist) * (0.35 + 0.65 * r.y) * tw;
      }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        float h = clamp(y * 1.15 + 0.08, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        // nebula / milky way
        if (nebulaAmt > 0.0) {
          float n = fbm3(d * 3.0 + vec3(0.0, time * 0.006, 0.0));
          float n2 = fbm3s(d * 6.0 + 4.0);
          col += nebulaAmt * nebula * pow(max(n * n2 * 2.2 - 0.25, 0.0), 1.5) * 1.5;
          col += nebulaAmt * vec3(0.2, 0.45, 1.0) * pow(max(fbm3s(d * 2.0 + 9.0) - 0.42, 0.0), 2.0) * 2.6;
        }
        // aurora: soft vertical curtains a little above the horizon
        if (aurora > 0.0 && y > 0.0) {
          float az = atan(d.z, d.x);
          float w = n3(vec3(az * 2.2 + time * 0.01, 0.0, 1.3));
          float hy = 0.10 + 0.16 * w;
          float curtain = smoothstep(hy - 0.08, hy, y) * (1.0 - smoothstep(hy, hy + 0.28, y));
          float streak = 0.55 + 0.45 * n3(vec3(az * 38.0, y * 3.0 - time * 0.05, 2.0));
          float amt = curtain * streak * smoothstep(0.35, 0.75, n3(vec3(az * 1.3 - time * 0.006, 5.0, 0.0)));
          vec3 ac = mix(vec3(0.15, 1.0, 0.65), nebula, smoothstep(hy, hy + 0.25, y));
          col += ac * amt * aurora * 0.55;
        }
        // stars: dense fine field + a few bright ones
        if (stars > 0.0) {
          float s = starLayer(d, 260.0, 0.80, 0.30) * 0.9 + starLayer(d, 110.0, 0.93, 0.26) * 2.6 + starLayer(d, 520.0, 0.70, 0.32) * 0.45;
          col += stars * vec3(0.95, 0.97, 1.0) * s * smoothstep(-0.02, 0.22, y);
        }
        // melt into the haze at the horizon (matches distant scenery)
        col = mix(col, hazeAt(d, fogCol), exp(-max(y, 0.0) * band) * 0.9);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------- cumulus clouds: big lit impostors sitting on the horizon ----------
const CELLS_X = 2, CELLS_Y = 4, CELL_W = 512, CELL_H = 256;
// R = coverage (soft union of puffs), G = bulge height (max of sphere caps → cauliflower normals for lighting)
function cloudAtlas() {
  const W = CELLS_X * CELL_W, Hh = CELLS_Y * CELL_H, MAXR = 120;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh); return [c, g]; };
  const [ca, ga] = mk(), [ch, gh] = mk();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const PROF = [[0, 1], [0.35, 0.94], [0.55, 0.835], [0.7, 0.714], [0.82, 0.572], [0.91, 0.415], [0.97, 0.243], [1, 0]];
  const puff = (x, y, r) => {
    let gr = ga.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ga.fillStyle = gr; ga.beginPath(); ga.arc(x, y, r, 0, Math.PI * 2); ga.fill();
    gr = gh.createRadialGradient(x, y, 0, x, y, r);
    const v = (255 * Math.min(1, r / MAXR)) | 0;
    for (const [t, k] of PROF) { const q = (v * k) | 0; gr.addColorStop(t, `rgb(${q},${q},${q})`); }
    gh.fillStyle = gr; gh.beginPath(); gh.arc(x, y, r, 0, Math.PI * 2); gh.fill();
  };
  gh.globalCompositeOperation = 'lighten';
  for (let cy = 0; cy < CELLS_Y; cy++) for (let cx = 0; cx < CELLS_X; cx++) {
    const ox = cx * CELL_W, oy = cy * CELL_H, idx = cy * CELLS_X + cx;
    for (const g of [ga, gh]) { g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, CELL_W - 4, CELL_H - 4); g.clip(); }
    const base = oy + CELL_H - 30;
    const lobes = 2 + (idx % 3);
    const tallK = [0.95, 0.66, 0.8, 0.5][idx % 4];
    // broad base skirt
    for (let i = 0; i < 16; i++) {
      const u = 0.12 + 0.76 * (i + rnd()) / 16;
      const r = 26 + 22 * rnd();
      puff(ox + u * CELL_W, base - r * 0.55, r);
    }
    for (let k = 0; k < lobes; k++) {
      const u = 0.2 + 0.6 * (k + 0.5) / lobes + (rnd() - 0.5) * 0.1;
      const tall = (CELL_H - 48) * tallK * (k % 2 ? 0.72 + 0.2 * rnd() : 0.9 + 0.1 * rnd());
      const w = CELL_W * (0.13 + 0.05 * rnd()) * (lobes === 2 ? 1.25 : 1);
      const cxp = ox + u * CELL_W;
      // core column of big puffs
      const n = 5;
      for (let j = 0; j < n; j++) {
        const f = j / (n - 1);
        const r = Math.min(MAXR, w * (1.0 - 0.45 * f));
        puff(cxp + (rnd() - 0.5) * w * 0.4, base - r * 0.6 - f * Math.max(0, tall - r * 1.3), r);
      }
      // cauliflower: medium + small puffs over the upper surface of the tower
      const ecx = cxp, ecy = base - tall * 0.48, rx = w * 1.05, ry = tall * 0.52;
      for (let m = 0; m < 46; m++) {
        const a = -Math.PI * (0.04 + 0.92 * rnd());
        const r = (m < 20 ? 22 + 22 * rnd() : 9 + 13 * rnd()) * (0.7 + 0.5 * tallK);
        const px = ecx + Math.cos(a) * rx * (0.82 + 0.12 * rnd()), py = ecy + Math.sin(a) * ry * (0.85 + 0.12 * rnd());
        puff(px, Math.min(py, base - r * 0.5), r);
      }
    }
    // flat, soft bottom
    ga.globalCompositeOperation = 'destination-in';
    const fade = ga.createLinearGradient(0, base - 26, 0, base + 10);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    ga.fillStyle = fade; ga.fillRect(ox, oy, CELL_W, CELL_H);
    ga.globalCompositeOperation = 'source-over';
    for (const g of [ga, gh]) g.restore();
  }
  // pack R = coverage (on black), G = bulge height
  const [cb, gb] = mk();
  gb.filter = 'blur(1.2px)'; gb.drawImage(ca, 0, 0);
  const [cc, gc] = mk();
  gc.filter = 'blur(1.6px)'; gc.drawImage(ch, 0, 0);
  const A = gb.getImageData(0, 0, W, Hh).data, Hd = gc.getImageData(0, 0, W, Hh).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = Hh;
  const o = out.getContext('2d');
  const id = o.createImageData(W, Hh), D = id.data;
  for (let i = 0; i < D.length; i += 4) { D[i] = A[i]; D[i + 1] = Hd[i]; D[i + 2] = 0; D[i + 3] = 255; }
  o.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export class Clouds {
  constructor() {
    const N = (this.max = 26);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const cell = new Float32Array(N * 4);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: {
        atlas: { value: cloudAtlas() }, litCol: { value: new THREE.Color(1.6, 1.58, 1.52) }, shadeCol: { value: new THREE.Color(0.55, 0.62, 0.78) },
        fogCol: { value: new THREE.Color() }, hazeAmt: { value: 0.35 }, opacity: { value: 1 },
        hazeA: { value: HAZE.A }, hazeB: { value: HAZE.B },
      },
      vertexShader: /* glsl */`
        attribute vec4 aCell;
        uniform vec4 hazeA;
        varying vec2 vLocal; varying vec2 vOrigin; varying vec3 vDir; varying vec2 vL; varying vec3 vL3; varying float vBack; varying float vShade;
        void main(){
          vLocal = vec2(uv.x, uv.y);
          vOrigin = aCell.xy;
          vShade = aCell.w;
          mat4 mw = modelMatrix * instanceMatrix;
          vec4 wp = mw * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          vec3 right = normalize(mw[0].xyz);
          vec3 c = normalize((mw * vec4(0.0, 0.5, 0.0, 1.0)).xyz - cameraPosition);
          vec3 s = hazeA.xyz;
          // light direction in the cloud's texture frame: x = right, y = up, z = towards the camera
          vL3 = normalize(vec3(dot(s, right), s.y, -dot(s, c)));
          vL = normalize(vec2(vL3.x * 1.3, max(s.y, 0.0) + 0.4));
          vBack = pow(max(dot(s, c), 0.0), 3.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D atlas; uniform vec3 litCol, shadeCol, fogCol; uniform float hazeAmt, opacity;
        uniform vec4 hazeA, hazeB;
        varying vec2 vLocal; varying vec2 vOrigin; varying vec3 vDir; varying vec2 vL; varying vec3 vL3; varying float vBack; varying float vShade;
        ${HAZE_FN}
        const vec2 CELL = vec2(${(1 / CELLS_X).toFixed(6)}, ${(1 / CELLS_Y).toFixed(6)});
        const vec2 TX = vec2(${(2.5 / CELL_W).toFixed(6)}, ${(2.5 / CELL_H).toFixed(6)});
        vec2 at(vec2 uv){ return vOrigin + clamp(uv, vec2(0.003), vec2(0.997)) * CELL; }
        void main(){
          vec2 tx = texture2D(atlas, at(vLocal)).rg;
          float hxp = texture2D(atlas, at(vLocal + vec2(TX.x, 0.0))).g, hxm = texture2D(atlas, at(vLocal - vec2(TX.x, 0.0))).g;
          float hyp = texture2D(atlas, at(vLocal + vec2(0.0, TX.y))).g, hym = texture2D(atlas, at(vLocal - vec2(0.0, TX.y))).g;
          vec2 st = vL * vec2(0.03, 0.06);
          float acc = texture2D(atlas, at(vLocal + st), 2.5).r + texture2D(atlas, at(vLocal + st * 2.0), 2.5).r + texture2D(atlas, at(vLocal + st * 3.3), 3.0).r + texture2D(atlas, at(vLocal + st * 5.0), 3.0).r;
          float a = smoothstep(0.04, 0.6, tx.r);
          if (a < 0.01) discard;
          // bulge normal from the height channel (≈ 120 px max puff radius, 2.5 px taps)
          vec3 n = normalize(vec3(-(hxp - hxm) * 24.0, -(hyp - hym) * 24.0 * ${(CELL_H / CELL_W).toFixed(3)}, 1.0));
          float h = vLocal.y;
          float diff = clamp(dot(n, vL3) * 0.55 + 0.45, 0.0, 1.0);
          float T = exp(-acc * 0.45);
          float lit = diff * mix(0.35, 1.0, T);
          vec3 amb = shadeCol * vShade * (0.55 + 0.3 * n.y + 0.35 * smoothstep(0.0, 0.8, h));
          vec3 col = amb + litCol * lit;
          // silver lining when the sun is behind the cloud
          col += litCol * (1.0 - smoothstep(0.04, 0.5, tx.r)) * vBack * 1.4;
          vec3 dir = normalize(vDir);
          float hk = hazeAmt * (1.0 - 0.7 * smoothstep(0.0, 0.7, h)) + 0.3 * (1.0 - smoothstep(0.0, 0.035, dir.y));
          col = mix(col, hazeAt(dir, fogCol), clamp(hk, 0.0, 1.0));
          gl_FragColor = vec4(col, a * opacity * smoothstep(0.0, 0.12, h));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, mat, N));
    mesh.frustumCulled = false;
    mesh.renderOrder = -11;
    mesh.userData.noAO = true;
    // golden-angle ring so any prefix (fewer clouds) is still spread around the sky
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const az = i * 2.399963 + rnd() * 0.3;
      const high = i % 4 === 3;
      const R = 2600 + rnd() * 900;
      const w = high ? 450 + rnd() * 450 : 850 + rnd() * 850;
      const hgt = w * (0.48 + rnd() * 0.1) * (high ? 0.75 : 1);
      const y = high ? 380 + rnd() * 380 : 30 + rnd() * 120;
      p.set(Math.sin(az) * R, y, -Math.cos(az) * R);
      e.set(0, -az + Math.PI, 0);
      q.setFromEuler(e);
      sc.set(rnd() < 0.5 ? w : -w, hgt, 1);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(i, m4);
      const ci = (i * 5 + (i >> 2)) % (CELLS_X * CELLS_Y);
      cell[i * 4] = (ci % CELLS_X) / CELLS_X;
      cell[i * 4 + 1] = Math.floor(ci / CELLS_X) / CELLS_Y;
      cell[i * 4 + 2] = rnd();
      cell[i * 4 + 3] = 0.85 + rnd() * 0.3;
    }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 4));
    this.uniforms = mat.uniforms;
    this.baseY = 0;
  }
  setAmount(a) { this.mesh.count = Math.round(THREE.MathUtils.clamp(a, 0, 1) * this.max); this.mesh.visible = this.mesh.count > 0; }
  update(camPos, t) {
    this.mesh.position.set(camPos.x, this.baseY, camPos.z);
    this.mesh.rotation.y = t * 0.0035;
  }
}

// ---------- far ridges: layered hazy hills / peaks / mesas around the horizon ----------
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fb(x, y, o = 5) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y); n += a; x = x * 2.03 + 3.1; y = y * 2.03 + 1.7; a *= 0.5; } return s / n; }

const ridgeCache = new Map();
function ridgeGeometry(kind) {
  if (ridgeCache.has(kind)) return ridgeCache.get(kind);
  const layers = [
    { r0: 470, r1: 820, H: 1, seed: 11, f: 5 },
    { r0: 980, r1: 1700, H: 2.1, seed: 47, f: 3.4 },
  ];
  const NA = 360, NR = 9;
  const pos = [], col = [], idx = [];
  let base = 0;
  for (const L of layers) {
    for (let i = 0; i <= NA; i++) {
      const az = (i / NA) * Math.PI * 2;
      const cx = Math.cos(az), sz = Math.sin(az);
      for (let j = 0; j < NR; j++) {
        const t = j / (NR - 1);
        const r = L.r0 + (L.r1 - L.r0) * t;
        // sample the noise on a circle so the ring wraps seamlessly; t shifts it so ridges have spurs
        const nx = cx * L.f + L.seed + t * 0.6, ny = sz * L.f + L.seed * 0.7 + t * 0.4;
        const n = fb(nx, ny);
        const bump = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.75);
        let h;
        if (kind === 'mesa') {
          const m = fb(nx * 0.8, ny * 0.8, 3);
          const plateau = THREE.MathUtils.smoothstep(m, 0.47, 0.53);
          h = (0.12 + 0.88 * plateau) * (0.75 + 0.25 * n) * Math.pow(Math.sin(Math.PI * t), 0.25);
        } else if (kind === 'peaks') {
          const rg = 1 - Math.abs(fb(nx * 1.3, ny * 1.3) * 2 - 1);
          h = (0.25 + 0.75 * rg * rg) * (0.55 + 0.45 * n) * bump * 1.25;
        } else if (kind === 'dunes') {
          h = (0.35 + 0.65 * n) * bump * 0.45;
        } else {
          h = (0.3 + 0.7 * n) * bump;
        }
        const y = L.H * 70 * h - 18 * (1 - bump * 0.3);
        pos.push(cx * r, y, sz * r);
        // simple vertex shading: darker feet, strata on mesas
        let k = 0.78 + 0.32 * THREE.MathUtils.clamp(y / (L.H * 70), 0, 1);
        if (kind === 'mesa') k *= 0.9 + 0.12 * Math.sin(y * 0.22 + n * 3);
        col.push(k, k, k);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR - 1; j++) {
      const a = base + i * NR + j, b = a + 1, c = a + NR, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    base += (NA + 1) * NR;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  ridgeCache.set(kind, g);
  return g;
}

export class FarRidges {
  constructor() {
    this.mask = { value: new THREE.Vector4(1, 0, -2, 0) }; // xz dir, cos half-width, amount
    this.scaleY = { value: 1 };
    const mat = (this.mat = new THREE.MeshStandardMaterial({ color: '#6a88a8', roughness: 0.95, metalness: 0, vertexColors: true, transparent: true, opacity: 1, envMapIntensity: 0.6 }));
    mat.defines = { HAZE_K: '0.42' };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.ridgeMask = this.mask;
      sh.uniforms.ridgeScale = this.scaleY;
      sh.vertexShader = 'uniform vec4 ridgeMask;\nuniform float ridgeScale;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y *= ridgeScale;
        float rmk = smoothstep(ridgeMask.z, ridgeMask.z + 0.25, dot(normalize(position.xz), ridgeMask.xy)) * ridgeMask.w;
        transformed.y = mix(transformed.y, -260.0, rmk);`);
    };
    mat.customProgramCacheKey = () => 'farRidges';
    this.mesh = new THREE.Mesh(ridgeGeometry('hills'), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9;
    this.mesh.userData.noAO = true;
    this.mesh.visible = false;
    this.baseY = 0;
    this.kind = 'hills';
  }
  /** far: { color, height (≈ near-layer peak height in units, default 70), kind: 'hills'|'peaks'|'mesa'|'dunes', mask: {dir:[x,z], width, amount} } */
  set(far) {
    if (!far) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const kind = far.kind || 'hills';
    if (kind !== this.kind) { this.kind = kind; this.mesh.geometry = ridgeGeometry(kind); }
    this.mat.color.set(far.color || '#6a88a8');
    this.scaleY.value = (far.height ?? 70) / 70;
    const mk = far.mask;
    if (mk) this.mask.value.set(mk.dir[0], mk.dir[1], Math.cos(mk.width ?? 1.2), mk.amount ?? 1);
    else this.mask.value.w = 0;
  }
  update(camPos) { this.mesh.position.set(camPos.x, this.baseY, camPos.z); }
}

// ---------- final pass: radial speed blur → tone map → MK grade → vignette → dither ----------
export class GradePass extends OutputPass {
  constructor() {
    super();
    Object.assign(this.uniforms, {
      speed: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.6) }, aspect: { value: 16 / 9 },
      grade: { value: new THREE.Vector4(1.12, 0.12, 0.05, 0.16) }, // saturation, contrast, warm/teal split, vignette
      lift: { value: new THREE.Vector3(0, 0, 0) }, time: { value: 0 },
    });
    this.material.fragmentShader = /* glsl */`
      precision highp float;
      uniform sampler2D tDiffuse; uniform float speed; uniform vec2 center; uniform float aspect;
      uniform vec4 grade; uniform vec3 lift; uniform float time;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      varying vec2 vUv;
      float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        if (speed > 0.002) {
          vec2 dv = vUv - center;
          float r = length(dv * vec2(aspect, 1.0));
          float k = speed * smoothstep(0.25, 0.9, r) * 0.042;
          float j = ign(gl_FragCoord.xy + time * 61.0);
          vec3 acc = c.rgb; float wsum = 1.0;
          for (int i = 1; i <= 8; i++) {
            float f = (float(i) - j) / 8.0;
            float w = 1.0 - f * 0.6;
            acc += texture2D(tDiffuse, vUv - dv * k * f).rgb * w; wsum += w;
          }
          c.rgb = acc / wsum;
        }
        #ifdef LINEAR_TONE_MAPPING
          c.rgb = LinearToneMapping(c.rgb);
        #elif defined( REINHARD_TONE_MAPPING )
          c.rgb = ReinhardToneMapping(c.rgb);
        #elif defined( CINEON_TONE_MAPPING )
          c.rgb = CineonToneMapping(c.rgb);
        #elif defined( ACES_FILMIC_TONE_MAPPING )
          c.rgb = ACESFilmicToneMapping(c.rgb);
        #elif defined( AGX_TONE_MAPPING )
          c.rgb = AgXToneMapping(c.rgb);
        #elif defined( NEUTRAL_TONE_MAPPING )
          c.rgb = NeutralToneMapping(c.rgb);
        #elif defined( CUSTOM_TONE_MAPPING )
          c.rgb = CustomToneMapping(c.rgb);
        #endif
        #ifdef SRGB_TRANSFER
          c = sRGBTransferOETF(c);
        #endif
        // MK high-key grade in display space
        vec3 g = clamp(c.rgb, 0.0, 1.0);
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        g = mix(vec3(l), g, grade.x);
        g = mix(g, g * g * (3.0 - 2.0 * g), grade.y);
        float sh = 1.0 - smoothstep(0.0, 0.55, l), hi = smoothstep(0.45, 1.0, l);
        g += grade.z * (hi * vec3(0.06, 0.025, -0.035) + sh * vec3(-0.03, 0.01, 0.035));
        g += lift * sh;
        vec2 vq = (vUv - 0.5) * vec2(aspect, 1.0);
        g *= 1.0 - grade.w * smoothstep(0.35, 1.05, length(vq));
        g += (ign(gl_FragCoord.xy + fract(time) * 97.0) - 0.5) / 255.0;
        gl_FragColor = vec4(g, c.a);
      }`;
    this.material.needsUpdate = true;
  }
}
