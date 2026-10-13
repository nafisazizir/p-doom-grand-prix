// v2 renderer: PBR + image-based lighting, soft sun shadows that follow the kart, physical skies,
// HDR post (GTAO ambient occlusion, bloom, neutral tone mapping). Quality presets keep 60 fps.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const QUALITY = {
  ultra: { ratio: 2, shadow: 4096, ao: true, bloom: true },
  high: { ratio: 1.5, shadow: 4096, ao: true, bloom: true },
  med: { ratio: 1.25, shadow: 2048, ao: false, bloom: true },
  low: { ratio: 1, shadow: 1024, ao: false, bloom: false },
};

const QP = new URLSearchParams(location.search);
export const GRADE = {
  tm: QP.get('tm') || 'aces',
  exp: +(QP.get('exp') || 0.86),
  bloomThr: +((QP.get('bloom') || '').split(',')[0] || 1.7),
  bloomStr: +((QP.get('bloom') || '').split(',')[1] || 0.3),
  envK: +(QP.get('envk') || 0.75),
  fogK: +(QP.get('fogk') || 0.6),
};

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

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.35);
    this.scene.add(this.hemi);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    // skies
    this.sky = new Sky();
    this.sky.scale.setScalar(8000);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    // the physical sky is in real-world radiance; scale it into our exposure range and tame the sun disc
    this.skyGain = { value: 0.32 };
    this.sky.material.onBeforeCompile = (sh) => {
      sh.uniforms.skyGain = this.skyGain;
      sh.fragmentShader = 'uniform float skyGain;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor * skyGain, vec3( 4.0 ) ), 1.0 );');
    };
    this.scene.add(this.sky);
    this.dome = makeNightDome();
    this.scene.add(this.dome);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.002);
    this.fogBase = new THREE.Color('#ffffff'); // look's fog colour (crossfaded); the track tints it red with doom

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
    this.composer.addPass(new OutputPass());
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

  /** apply a look (from looks.js). yaw0 = course heading at this point so the sun azimuth is relative to travel. */
  _lookState() {
    const u = this.dome.material.uniforms;
    return {
      exposure: this.renderer.toneMappingExposure, envI: this.scene.environmentIntensity, sunI: this.sun.intensity,
      fogD: this.scene.fog.density, sunC: this.sun.color.clone(), fogC: this.fogBase.clone(), hemiC: this.hemi.color.clone(), hemiG: this.hemi.groundColor.clone(),
      top: u.top.value.clone(), horizon: u.horizon.value.clone(), nebula: u.nebula.value.clone(), nebulaAmt: u.nebulaAmt.value, stars: u.stars.value,
    };
  }
  _setLookState(a, b, k) {
    const u = this.dome.material.uniforms, L = THREE.MathUtils.lerp;
    this.renderer.toneMappingExposure = L(a.exposure, b.exposure, k);
    this.scene.environmentIntensity = L(a.envI, b.envI, k);
    this.sun.intensity = L(a.sunI, b.sunI, k);
    this.scene.fog.density = L(a.fogD, b.fogD, k);
    this.sun.color.lerpColors(a.sunC, b.sunC, k);
    this.fogBase.lerpColors(a.fogC, b.fogC, k);
    this.hemi.color.lerpColors(a.hemiC, b.hemiC, k);
    this.hemi.groundColor.lerpColors(a.hemiG, b.hemiG, k);
    if (this.fade.domeMode === 'lerp') {
      u.top.value.lerpColors(a.top, b.top, k); u.horizon.value.lerpColors(a.horizon, b.horizon, k); u.nebula.value.lerpColors(a.nebula, b.nebula, k);
      u.nebulaAmt.value = L(a.nebulaAmt, b.nebulaAmt, k); u.stars.value = L(a.stars, b.stars, k);
    }
  }

  /** apply a look; fade > 0 crossfades sky dome / sky, fog, exposure and lights over `fade` seconds */
  applyLook(look, yaw0 = 0, fade = 0) {
    const from = fade > 0 && this.look ? this._lookState() : null;
    const wasOutdoor = this.sky.visible && !this.dome.visible;
    this.fade = null;
    this.dome.material.uniforms.alpha.value = 1;
    this.look = look;
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
    this.scene.fog.color.set(fog.color || '#ffffff');
    this.fogBase.set(fog.color || '#ffffff');
    this.scene.fog.density = (fog.density ?? 0.002) * GRADE.fogK;
    this.hemi.color.set(fog.color || '#ffffff');
    this.hemi.groundColor.set(look.ground?.tint || '#555555');

    const outdoor = look.sky === 'day' || look.sky === 'sunset' || look.sky === 'dusk';
    this.sky.visible = outdoor;
    this.dome.visible = !outdoor;
    if (outdoor) {
      const u = this.sky.material.uniforms, p = look.skyParams || {};
      u.turbidity.value = p.turbidity ?? 3;
      u.rayleigh.value = p.rayleigh ?? 1.5;
      u.mieCoefficient.value = p.mie ?? 0.005;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sunDir);
      if (u.cloudCoverage) {
        u.cloudCoverage.value = p.clouds ?? 0.4;
        u.cloudDensity.value = 0.5;
        u.cloudScale.value = 0.00025;
        u.cloudSpeed.value = 0.00004;
      }
    } else {
      const c = look.nightColors || {};
      const u = this.dome.material.uniforms;
      u.top.value.set(c.top || '#05010f');
      u.horizon.value.set(c.horizon || '#20104a');
      u.nebula.value.set(c.nebula || '#3a5cff');
      u.nebulaAmt.value = look.sky === 'space' ? 1 : look.sky === 'night' ? 0.35 : 0;
      u.stars.value = look.sky === 'indoor' ? 0 : 1;
    }
    if (from) {
      const to = this._lookState();
      let domeMode = 'lerp';
      if (!wasOutdoor && outdoor) {
        // space/night dome → physical sky: keep the old dome on top and fade it out
        domeMode = 'out';
        this.dome.visible = true;
        const u = this.dome.material.uniforms;
        u.top.value.copy(from.top); u.horizon.value.copy(from.horizon); u.nebula.value.copy(from.nebula); u.nebulaAmt.value = from.nebulaAmt; u.stars.value = from.stars;
      } else if (wasOutdoor && !outdoor) {
        domeMode = 'in';
        this.sky.visible = true;
      }
      this.fade = { from, to, t: 0, dur: fade, domeMode, outdoor };
      this._tickFade(0);
    }
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
      this.dome.visible = !f.outdoor;
      this.fade = null;
    }
  }

  /** follow the kart with the sun's shadow frustum and keep skies centred on the camera */
  update(focus, t) {
    this._tickFade(Math.min(0.1, Math.max(0, t - (this._lastT ?? t))));
    this._lastT = t;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(this.camera.position);
    this.dome.position.copy(this.camera.position);
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = t;
    this.dome.material.uniforms.time.value = t;
  }

  render() {
    // count every pass (scene, shadows, AO, post) in renderer.info
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.Q.ao || this.Q.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

function makeNightDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
    uniforms: {
      alpha: { value: 1 },
      top: { value: new THREE.Color('#05010f') }, horizon: { value: new THREE.Color('#20104a') },
      nebula: { value: new THREE.Color('#ff4fd8') }, nebulaAmt: { value: 0 }, stars: { value: 1 }, time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 nebula; uniform float nebulaAmt; uniform float stars; uniform float time; uniform float alpha;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y*1.2+0.1, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.6));
        // nebula
        float n = fbm(d*3.0 + vec3(0.0, time*0.01, 0.0));
        float n2 = fbm(d*6.0 + 4.0);
        col += nebulaAmt * nebula * pow(max(n*n2*2.2 - 0.25, 0.0), 1.6) * 1.6;
        col += nebulaAmt * vec3(0.2,0.5,1.0) * pow(max(fbm(d*2.0+9.0) - 0.45, 0.0), 2.0) * 3.0;
        // stars
        vec3 sp = d * 380.0;
        float st = hash(floor(sp));
        float tw = 0.6 + 0.4*sin(time*3.0 + st*50.0);
        col += stars * vec3(1.0) * step(0.9965, st) * tw * smoothstep(-0.1, 0.3, d.y) * 2.5;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}
