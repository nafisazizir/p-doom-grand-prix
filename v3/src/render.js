// v3 renderer: PBR + image-based lighting, crisp sun shadows that follow the view, MK-style skies (gradient + lit
// cumulus + far ridges, see sky.js), aerial-perspective haze on every material, HDR post (GTAO, bloom) and a final
// grade pass (MK high-key grade, vignette, dither, radial speed blur). Quality presets keep 60 fps.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HAZE, installHaze, makeDaySky, makeNightDome, Clouds, FarRidges, GradePass } from './sky.js';

installHaze(); // must run before any material compiles

const QUALITY = {
  ultra: { ratio: 2, shadow: 4096, ao: true, bloom: true },
  high: { ratio: 1.5, shadow: 4096, ao: true, bloom: true },
  med: { ratio: 1.25, shadow: 2048, ao: false, bloom: true },
  low: { ratio: 1, shadow: 2048, ao: false, bloom: false },
};

const QP = new URLSearchParams(location.search);
export const GRADE = {
  tm: QP.get('tm') || 'aces',
  exp: +(QP.get('exp') || 0.86),
  bloomThr: +((QP.get('bloom') || '').split(',')[0] || 1.7),
  bloomStr: +((QP.get('bloom') || '').split(',')[1] || 0.3),
  envK: +(QP.get('envk') || 0.75),
  fogK: +(QP.get('fogk') || 1),
  grade: QP.get('nograde') === null,
};

// per sky-type defaults for the v3 atmosphere fields (looks can override any of them)
const SKY_DEFAULTS = {
  day: {
    sky: { zenith: '#0e66d2', mid: '#39a4ec', band: 9, glow: 0.45, disc: 14, cirrus: 0.3 },
    haze: { gain: 1.18, k: 1.35, desat: 0.32, sun: 0.4, height: 170, start: 14 },
    cloud: { lit: 1.7, shade: '#93aed6', shadeK: 0.95, haze: 0.28 },
    grade: { sat: 1.13, contrast: 0.14, warm: 0.5, vignette: 0.16 },
  },
  sunset: {
    sky: { zenith: '#3550a8', mid: '#d58aa6', band: 4.2, glow: 1.0, disc: 10, cirrus: 0.35 },
    haze: { gain: 1.08, k: 1.25, desat: 0.25, sun: 0.85, height: 170, start: 14 },
    cloud: { lit: 1.75, shade: '#b48aa6', shadeK: 0.85, haze: 0.2 },
    grade: { sat: 1.1, contrast: 0.12, warm: 0.7, vignette: 0.18 },
  },
  dusk: {
    sky: { zenith: '#25306e', mid: '#b56290', band: 4.0, glow: 0.9, disc: 8, cirrus: 0.3 },
    haze: { gain: 1.05, k: 1.2, desat: 0.25, sun: 0.8, height: 170, start: 14 },
    cloud: { lit: 1.6, shade: '#90709e', shadeK: 0.8, haze: 0.24 },
    grade: { sat: 1.08, contrast: 0.12, warm: 0.6, vignette: 0.2 },
  },
  night: {
    dome: { aurora: 0.7, band: 7 },
    haze: { gain: 1.0, k: 0.95, desat: 0.2, sun: 0.15, height: 140, start: 10 },
    grade: { sat: 1.1, contrast: 0.12, warm: 0.15, vignette: 0.22 },
  },
  space: {
    dome: { aurora: 0, band: 9 },
    haze: { gain: 1.0, k: 0.8, desat: 0.1, sun: 0.1, height: 400, start: 20 },
    grade: { sat: 1.1, contrast: 0.12, warm: 0.15, vignette: 0.2 },
  },
  indoor: {
    dome: { aurora: 0, band: 6 },
    haze: { gain: 1.0, k: 0.9, desat: 0.2, sun: 0.1, height: 200, start: 6 },
    grade: { sat: 1.08, contrast: 0.12, warm: 0.2, vignette: 0.22 },
  },
};

const _c = new THREE.Color(), _c2 = new THREE.Color();
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3(), _lr = new THREE.Vector3(), _lu = new THREE.Vector3();

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = { neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping }[GRADE.tm] || THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 9000);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envs = {};
    this.fallbackEnv = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.fallbackEnv;
    this.scene.environmentIntensity = 1;

    // lights. The shadow box is tight around what the chase camera sees (kart is half size in v3), texel-snapped.
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    this.shadowHalf = 46;
    sc.left = -this.shadowHalf; sc.right = this.shadowHalf; sc.top = this.shadowHalf; sc.bottom = -this.shadowHalf; sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 1.6; // narrow MK penumbra
    this.sun.shadow.intensity = 0.9; // dark, not black
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.35);
    this.scene.add(this.hemi);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    // skies
    this.sky = makeDaySky();
    this.scene.add(this.sky);
    this.dome = makeNightDome();
    this.scene.add(this.dome);
    this.clouds = new Clouds();
    this.scene.add(this.clouds.mesh);
    this.ridges = new FarRidges();
    this.scene.add(this.ridges.mesh);
    this.ridgeOpacity = 0;
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.002);
    this.fogBase = new THREE.Color('#ffffff'); // look's haze colour (crossfaded); the track tints it red with doom
    this.hazeBaseY = 0;
    this.speedFx = 0;

    this._buildComposer();
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
  }

  _buildComposer() {
    const r = this.renderer;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.gtao = new GTAOPass(this.scene, this.camera, 4, 4);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.6, thickness: 2, scale: 1, samples: 12 });
    // run AO at half resolution
    const gsz = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => gsz(Math.max(1, w >> 1), Math.max(1, h >> 1));
    // AO should ignore sprites, transparent/additive glow and particles (otherwise they cast dark squares)
    this.gtao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (!o.visible) return;
        const m = o.material;
        if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && !Array.isArray(m) && (m.transparent || m.isMeshBasicMaterial))) {
          o.visible = false;
          cache.push(o);
        }
      });
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), GRADE.bloomStr, 0.45, GRADE.bloomThr);
    this.composer.addPass(this.bloom);
    this.gradePass = new GradePass();
    this.composer.addPass(this.gradePass);
  }

  setQuality(q) {
    this.qualityName = q;
    const Q = (this.Q = QUALITY[q] || QUALITY.high);
    this.gtao.enabled = Q.ao;
    this.bloom.enabled = Q.bloom;
    if (this.sun.shadow.mapSize.x !== Q.shadow) {
      this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }

  resize() {
    const ratio = Math.min(devicePixelRatio, this.Q.ratio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.gradePass.uniforms.aspect.value = this.camera.aspect;
  }

  async loadEnvs(manifest, base) {
    const loader = new HDRLoader();
    const jobs = Object.entries(manifest?.hdri || {}).map(async ([slot, info]) => {
      try {
        const tex = await loader.loadAsync(new URL(info.file, base).href);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.envs[slot] = this.pmrem.fromEquirectangular(tex).texture;
        if (info.keyLightDirThree) (this.envKeys ||= {})[slot] = info.keyLightDirThree;
        tex.dispose();
      } catch (e) { console.warn('hdri', slot, e); }
    });
    await Promise.all(jobs);
  }

  /** boost / speed feel: 0..1 radial blur towards the vanishing point (cheap: one branch when 0) */
  setSpeedFx(k) { this.speedFx = THREE.MathUtils.clamp(k || 0, 0, 1); }

  /** world y the far ridges and the cloud bank sit on (track sets it per section) */
  setFarBase(y) { this.ridges.baseY = y - 6; this.clouds.baseY = y; }

  // ---------- looks ----------
  _lookState() {
    const u = this.dome.material.uniforms, s = this.sky.material.uniforms;
    return {
      exposure: this.renderer.toneMappingExposure, envI: this.scene.environmentIntensity, sunI: this.sun.intensity,
      fogD: this.scene.fog.density, sunC: this.sun.color.clone(), fogC: this.fogBase.clone(), hemiC: this.hemi.color.clone(), hemiG: this.hemi.groundColor.clone(),
      top: u.top.value.clone(), horizon: u.horizon.value.clone(), nebula: u.nebula.value.clone(), nebulaAmt: u.nebulaAmt.value, stars: u.stars.value, aurora: u.aurora.value,
      zen: s.zenith.value.clone(), mid: s.mid.value.clone(), hzSun: new THREE.Color(HAZE.B[0], HAZE.B[1], HAZE.B[2]),
      hz: [HAZE.A[3], HAZE.C[1], HAZE.C[2], HAZE.C[3], HAZE.B[3]], grade: this.gradePass.uniforms.grade.value.clone(),
      ridge: this.ridgeOpacity,
    };
  }
  _setLookState(a, b, k) {
    const u = this.dome.material.uniforms, s = this.sky.material.uniforms, L = THREE.MathUtils.lerp;
    this.renderer.toneMappingExposure = L(a.exposure, b.exposure, k);
    this.scene.environmentIntensity = L(a.envI, b.envI, k);
    this.sun.intensity = L(a.sunI, b.sunI, k);
    this.scene.fog.density = L(a.fogD, b.fogD, k);
    this.sun.color.lerpColors(a.sunC, b.sunC, k);
    this.fogBase.lerpColors(a.fogC, b.fogC, k);
    this.hemi.color.lerpColors(a.hemiC, b.hemiC, k);
    this.hemi.groundColor.lerpColors(a.hemiG, b.hemiG, k);
    _c.lerpColors(a.hzSun, b.hzSun, k);
    HAZE.B[0] = _c.r; HAZE.B[1] = _c.g; HAZE.B[2] = _c.b;
    HAZE.A[3] = L(a.hz[0], b.hz[0], k); HAZE.C[1] = L(a.hz[1], b.hz[1], k); HAZE.C[2] = L(a.hz[2], b.hz[2], k); HAZE.C[3] = L(a.hz[3], b.hz[3], k); HAZE.B[3] = L(a.hz[4], b.hz[4], k);
    this.gradePass.uniforms.grade.value.lerpVectors(a.grade, b.grade, k);
    this._setRidgeOpacity(L(a.ridge, b.ridge, k));
    if (this.fade.skyLerp) { s.zenith.value.lerpColors(a.zen, b.zen, k); s.mid.value.lerpColors(a.mid, b.mid, k); }
    if (this.fade.domeMode === 'lerp') {
      u.top.value.lerpColors(a.top, b.top, k); u.horizon.value.lerpColors(a.horizon, b.horizon, k); u.nebula.value.lerpColors(a.nebula, b.nebula, k);
      u.nebulaAmt.value = L(a.nebulaAmt, b.nebulaAmt, k); u.stars.value = L(a.stars, b.stars, k); u.aurora.value = L(a.aurora, b.aurora, k);
    }
  }
  _setRidgeOpacity(o) {
    this.ridgeOpacity = o;
    this.ridges.mat.opacity = o;
    this.ridges.mesh.visible = o > 0.01 && !!this.ridgeFar;
  }

  /** apply a look (from looks.js). yaw0 = course heading here so the sun azimuth is relative to travel.
   *  fade > 0 crossfades sky / dome, haze, exposure, lights and grade over `fade` seconds. */
  applyLook(look, yaw0 = 0, fade = 0) {
    const from = fade > 0 && this.look ? this._lookState() : null;
    const wasOutdoor = this.sky.visible && !this.dome.visible;
    const wasSkyLook = this.look && ['day', 'sunset', 'dusk'].includes(this.look.sky);
    this.fade = null;
    this.dome.material.uniforms.alpha.value = 1;
    this.look = look;
    const D = SKY_DEFAULTS[look.sky] || SKY_DEFAULTS.day;
    const hz = { ...D.haze, ...(look.haze || {}) };
    const env = this.envs[look.env] || this.fallbackEnv;
    this.scene.environment = env;
    this.scene.environmentIntensity = GRADE.envK * (look.envIntensity ?? (look.sky === 'indoor' ? 0.8 : look.sky === 'night' || look.sky === 'space' ? 0.65 : 1));
    this.renderer.toneMappingExposure = GRADE.exp * (look.exposure ?? 1);
    const s = look.sun || {};
    const el = THREE.MathUtils.degToRad(s.elev ?? 40), az = THREE.MathUtils.degToRad((s.azim ?? 0)) + yaw0;
    // azimuth 0 = straight ahead of the driver (−z rotated by yaw0), so the sun is in front: gorgeous backlight
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    // rotate the HDRI so its baked-in sun lines up with our sun (no stray reflection blob)
    const key = this.envKeys?.[look.env];
    if (key && this.scene.environmentRotation) {
      const hdriAz = Math.atan2(key[0], key[2]);
      const ourAz = Math.atan2(this.sunDir.x, this.sunDir.z);
      this.scene.environmentRotation.set(0, ourAz - hdriAz, 0);
    }
    this.sun.color.set(s.color || '#ffffff');
    this.sun.intensity = s.intensity ?? 3;
    const fog = look.fog || {};
    const hazeHex = hz.color || fog.color || '#ffffff';
    this.fogBase.set(hazeHex).multiplyScalar(hz.gain);
    this.scene.fog.color.copy(this.fogBase);
    this.scene.fog.density = (fog.density ?? 0.002) * GRADE.fogK;
    this.hemi.color.set(fog.color || '#ffffff');
    this.hemi.groundColor.set(look.ground?.tint || '#555555');

    // haze (shared uniforms)
    HAZE.A[0] = this.sunDir.x; HAZE.A[1] = this.sunDir.y; HAZE.A[2] = this.sunDir.z; HAZE.A[3] = hz.sun;
    _c.set(hazeHex).multiplyScalar(hz.gain);
    _c2.set(s.color || '#ffffff').multiplyScalar(hz.gain * 1.35);
    _c.lerp(_c2, 0.65);
    HAZE.B[0] = _c.r; HAZE.B[1] = _c.g; HAZE.B[2] = _c.b; HAZE.B[3] = 1 / hz.height;
    HAZE.C[1] = hz.desat; HAZE.C[2] = hz.k; HAZE.C[3] = hz.start;

    // grade
    const gr = { ...D.grade, ...(look.grade || {}) };
    this.gradePass.uniforms.grade.value.set(gr.sat, gr.contrast, gr.warm, gr.vignette);

    const outdoor = look.sky === 'day' || look.sky === 'sunset' || look.sky === 'dusk';
    this.sky.visible = outdoor;
    this.dome.visible = !outdoor;
    this.clouds.mesh.visible = outdoor;
    if (outdoor) {
      const sk = { ...D.sky, ...(look.skyColors || {}) };
      const u = this.sky.material.uniforms;
      u.zenith.value.set(sk.zenith); u.mid.value.set(sk.mid);
      u.band.value = sk.band; u.glow.value = sk.glow; u.disc.value = sk.disc; u.cirrus.value = sk.cirrus;
      u.sunCol.value.set(s.color || '#ffffff');
      // clouds: lit by the sun colour, shaded with a sky-tinted grey
      const cl = { ...D.cloud, ...(look.clouds || {}) };
      const cu = this.clouds.uniforms;
      cu.litCol.value.set(s.color || '#ffffff').lerp(_c2.setRGB(1, 1, 1), look.sky === 'day' ? 0.55 : 0.15).multiplyScalar(cl.lit);
      cu.shadeCol.value.set(cl.shade).multiplyScalar(cl.shadeK);
      cu.hazeAmt.value = cl.haze;
      this.clouds.setAmount(cl.amount ?? Math.min(1, 0.2 + (look.skyParams?.clouds ?? 0.4) * 1.3));
    } else {
      const c = look.nightColors || {};
      const u = this.dome.material.uniforms;
      const dm = { ...D.dome, ...(look.dome || {}) };
      u.top.value.set(c.top || '#05010f');
      u.horizon.value.set(c.horizon || '#20104a');
      u.nebula.value.set(c.nebula || '#3a5cff');
      u.nebulaAmt.value = look.sky === 'space' ? 1 : look.sky === 'night' ? 0.3 : 0;
      u.stars.value = look.sky === 'indoor' ? 0 : 1;
      u.aurora.value = dm.aurora;
      u.band.value = dm.band;
    }
    // far ridges
    this.ridgeFar = look.far || null;
    this.ridges.set(this.ridgeFar);
    this._setRidgeOpacity(this.ridgeFar ? 1 : 0);

    if (from) {
      const to = this._lookState();
      let domeMode = 'lerp';
      if (!wasOutdoor && outdoor) {
        // space/night dome → day sky: keep the old dome on top and fade it out
        domeMode = 'out';
        this.dome.visible = true;
        const u = this.dome.material.uniforms;
        u.top.value.copy(from.top); u.horizon.value.copy(from.horizon); u.nebula.value.copy(from.nebula); u.nebulaAmt.value = from.nebulaAmt; u.stars.value = from.stars; u.aurora.value = from.aurora;
      } else if (wasOutdoor && !outdoor) {
        domeMode = 'in';
        this.sky.visible = true;
        this.clouds.mesh.visible = true;
      }
      if (from.ridge > 0 && !this.ridgeFar) { this.ridgeFar = this._prevFar; }
      this.fade = { from, to, t: 0, dur: fade, domeMode, outdoor, skyLerp: wasSkyLook && outdoor, far: look.far || null };
      this._tickFade(0);
    }
    this._prevFar = look.far || null;
  }

  _tickFade(dt) {
    const f = this.fade;
    if (!f) return;
    f.t += dt;
    const k = THREE.MathUtils.smoothstep(f.t / f.dur, 0, 1);
    this._setLookState(f.from, f.to, k);
    const a = this.dome.material.uniforms.alpha;
    if (f.domeMode === 'out') a.value = 1 - k;
    else if (f.domeMode === 'in') a.value = k;
    if (f.t >= f.dur) {
      a.value = 1;
      this.sky.visible = f.outdoor;
      this.clouds.mesh.visible = f.outdoor && this.clouds.mesh.count > 0;
      this.dome.visible = !f.outdoor;
      this.ridgeFar = f.far;
      this._setRidgeOpacity(f.far ? 1 : 0);
      this.fade = null;
    }
  }

  /** follow the view with the sun's shadow box and keep skies centred on the camera */
  update(focus, t) {
    this._tickFade(Math.min(0.1, Math.max(0, t - (this._lastT ?? t))));
    this._lastT = t;
    // shadow box centred a little ahead of the kart along the view, snapped to whole shadow texels (no shimmer)
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _v.copy(focus).addScaledVector(_fwd, this.shadowHalf * 0.55);
    const L = this.sunDir;
    _lr.set(0, 1, 0).cross(L);
    if (_lr.lengthSq() < 1e-6) _lr.set(1, 0, 0);
    _lr.normalize();
    _lu.copy(L).cross(_lr).normalize();
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    const a = Math.round(_v.dot(_lr) / texel) * texel, b = Math.round(_v.dot(_lu) / texel) * texel, c = _v.dot(L);
    _v.copy(_lr).multiplyScalar(a).addScaledVector(_lu, b).addScaledVector(L, c);
    this.sun.target.position.copy(_v);
    this.sun.position.copy(_v).addScaledVector(L, 180);
    // skies + far layers
    const cp = this.camera.position;
    this.sky.position.copy(cp);
    this.dome.position.copy(cp);
    this.clouds.update(cp, t);
    this.ridges.update(cp);
    this.sky.material.uniforms.time.value = t;
    this.dome.material.uniforms.time.value = t;
    this.hazeBaseY = focus.y;
  }

  render() {
    // haze base + horizon colour (the track tints scene.fog.color with doom redness every frame)
    HAZE.C[0] = this.hazeBaseY;
    const fc = this.scene.fog.color;
    this.sky.material.uniforms.fogCol.value.copy(fc);
    this.dome.material.uniforms.fogCol.value.copy(fc);
    this.clouds.uniforms.fogCol.value.copy(fc);
    const gp = this.gradePass.uniforms;
    gp.speed.value = this.speedFx;
    gp.time.value = this._lastT || 0;
    if (!GRADE.grade) gp.grade.value.set(1, 0, 0, 0);
    // shader warm-up: after the first frames, compile every material already in the scene (the whole static track,
    // both skies, clouds, ridges) in parallel so the first look at a new section doesn't stall on program links
    if (!this._warm && (this._frames = (this._frames || 0) + 1) > 20) {
      this._warm = true;
      const vis = [this.sky, this.dome, this.clouds.mesh, this.ridges.mesh].map((o) => [o, o.visible]);
      for (const [o] of vis) o.visible = true;
      const p = this.renderer.compileAsync(this.scene, this.camera);
      for (const [o, v] of vis) o.visible = v;
      p.catch(() => {});
    }
    // count every pass (scene, shadows, AO, post) in renderer.info
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.Q.ao || this.Q.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
