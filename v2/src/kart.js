// v2 hero: CLAUDE — a chunky clay-orange spark with a little face, driving a terracotta kart.
import * as THREE from 'three';
import { toon, glow, G, mesh, roundRect, clamp, lerp, MAT, physical, textPanel } from './toolkit.js';
import { glowSprite } from './entities.js';
import { surface } from './textures.js';

// a smooth tapered kart body from an extruded, bevelled side profile
function kartShell() {
  const shape = new THREE.Shape();
  // side profile in (z, y): nose at -1.9, tail at +1.5 (forward is -z)
  shape.moveTo(-1.95, 0.25);
  shape.bezierCurveTo(-2.05, 0.45, -1.7, 0.62, -1.2, 0.66);
  shape.lineTo(-0.55, 0.78);
  shape.bezierCurveTo(-0.2, 0.86, 0.6, 0.86, 0.95, 0.8);
  shape.bezierCurveTo(1.35, 0.74, 1.55, 0.62, 1.6, 0.42);
  shape.lineTo(1.55, 0.22);
  shape.lineTo(-1.95, 0.25);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 4, curveSegments: 18 });
  geo.translate(0, 0, -0.75);
  geo.rotateY(-Math.PI / 2); // profile x → world z (nose at −z), extrusion → across the kart
  geo.computeVertexNormals();
  return geo;
}

export class Kart {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    this.expr = 'normal';
    this.blinkT = 2;
    this.blinking = false;
    this.yaw = 0; this.lean = 0; this.spin = 0; this.scaleK = 1; this.flameK = 0; this.gliderK = 0;
    this._build();
    this.root.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.material.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
    this._rimLight();
  }

  /** the hero must always read, even backlit by a low sun: private copies of the kart's lit materials get a
   *  warm view-facing rim + a little fill (shader emissive), and a touch more env reflection */
  _rimLight() {
    const copies = new Map();
    const rimU = { rimColor: { value: new THREE.Color('#ffe2c4') } };
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || m.transparent) return;
      let c = copies.get(m);
      if (!c) {
        c = m.clone();
        c.envMapIntensity = (m.envMapIntensity ?? 1) * 1.35;
        c.onBeforeCompile = (sh) => {
          sh.uniforms.rimColor = rimU.rimColor;
          sh.fragmentShader = 'uniform vec3 rimColor;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            totalEmissiveRadiance += rimColor * pow(rimF, 2.6) * 0.32 + diffuseColor.rgb * 0.07;`);
        };
        c.customProgramCacheKey = () => 'kartRim';
        copies.set(m, c);
      }
      o.material = c;
    });
  }

  _build() {
    const B = this.body;
    const paint = MAT.paint('#d97757'); // Claude terracotta
    const paint2 = MAT.paint('#f3eee3'); // cream
    const carbon = toon('#1a1a20', { roughness: 0.35, metalness: 0.4 });
    const chrome = MAT.chrome();
    // --- chassis
    const shell = new THREE.Mesh(kartShell(), paint);
    shell.scale.set(1.12, 0.95, 1.05);
    B.add(shell);
    B.add(mesh(G.rbox(2.3, 0.18, 3.3, 0.08), carbon, 0, 0.2, 0.05)); // floor pan
    // side pods
    for (const sx of [-1, 1]) {
      const pod = mesh(G.capsule(0.3, 1.5), paint, sx * 1.15, 0.42, 0.2);
      pod.rotation.x = Math.PI / 2;
      B.add(pod);
      B.add(mesh(G.box(0.05, 0.12, 1.4), paint2, sx * 1.46, 0.48, 0.2));
    }
    // nose number plate
    const plate = textPanel('CLAUDE', { width: 0.9, height: 0.32, bg: '#f3eee3', fg: '#c15f3c', border: '#2a2725', borderW: 6, radius: 10 });
    plate.position.set(0, 0.55, -1.98);
    plate.rotation.y = Math.PI;
    plate.rotation.x = 0.35;
    B.add(plate);
    // headlights
    for (const sx of [-0.55, 0.55]) {
      const hl = mesh(G.sphere(0.11, 12), glow('#fff6d0', { intensity: 3 }), sx, 0.45, -1.92);
      B.add(hl);
    }
    // bumper
    const bump = mesh(G.capsule(0.12, 1.6), carbon, 0, 0.28, -2.05);
    bump.rotation.z = Math.PI / 2;
    B.add(bump);
    // rear end: engine cover with intake, taillights, diffuser
    B.add(mesh(G.rbox(1.7, 0.55, 1.0, 0.22), paint, 0, 0.62, 1.35));
    B.add(mesh(G.rbox(1.0, 0.3, 0.6, 0.12), carbon, 0, 0.95, 1.25));
    for (const sx of [-0.62, 0.62]) B.add(mesh(G.rbox(0.42, 0.14, 0.06, 0.05), glow('#ff2a3a', { intensity: 3 }), sx, 0.62, 1.87));
    for (let k = -2; k <= 2; k++) B.add(mesh(G.box(0.05, 0.2, 0.5), carbon, k * 0.3, 0.27, 1.75));
    // rear wing with the H-1000 decal (what the camera sees all race)
    B.add(mesh(G.rbox(2.6, 0.1, 0.62, 0.04), paint, 0, 1.32, 1.62));
    const wingDecal = textPanel('CLAUDE', { width: 1.7, height: 0.4, bg: null, fg: '#f3eee3', stroke: '#2a2725', strokeW: 10 });
    wingDecal.position.set(0, 1.42, 1.94);
    B.add(wingDecal);
    B.add(mesh(G.box(2.62, 0.12, 0.04), paint2, 0, 1.27, 1.94));
    for (const sx of [-1.3, 1.3]) B.add(mesh(G.rbox(0.07, 0.55, 0.7, 0.03), carbon, sx, 1.2, 1.62));
    for (const sx of [-0.45, 0.45]) B.add(mesh(G.box(0.08, 0.5, 0.14), carbon, sx, 1.05, 1.6));
    // seat
    B.add(mesh(G.rbox(0.9, 0.6, 0.25, 0.1), carbon, 0, 0.95, 0.75));
    // wheels: rubber tyres + chrome rims + spokes
    this.wheels = [];
    const tyre = MAT.rubber('#1b1b20');
    for (const [x, z, r, wd] of [[-1.2, -1.3, 0.44, 0.42], [1.2, -1.3, 0.44, 0.42], [-1.38, 1.1, 0.6, 0.62], [1.38, 1.1, 0.6, 0.62]]) {
      const w = new THREE.Group();
      w.position.set(x, r, z);
      const t = mesh(G.cyl(r, r, wd, 28), tyre);
      t.rotation.z = Math.PI / 2;
      w.add(t);
      // tread blocks
      for (let k = 0; k < 14; k++) {
        const tb = mesh(G.box(wd * 0.92, 0.05, 0.12), tyre);
        const a = (k / 14) * Math.PI * 2;
        tb.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
        tb.rotation.x = -a;
        w.add(tb);
      }
      const rim = mesh(G.cyl(r * 0.6, r * 0.6, wd + 0.04, 24), chrome);
      rim.rotation.z = Math.PI / 2;
      w.add(rim);
      const hub = mesh(G.cyl(r * 0.22, r * 0.22, wd + 0.1, 12), paint2);
      hub.rotation.z = Math.PI / 2;
      w.add(hub);
      for (let k = 0; k < 5; k++) {
        const sp = mesh(G.box(wd + 0.06, r * 1.05, 0.07), MAT.metal('#9aa2b0'));
        sp.rotation.x = (k / 5) * Math.PI;
        w.add(sp);
      }
      B.add(w);
      this.wheels.push(w);
      // suspension arm
      const arm = mesh(G.box(Math.abs(x) - 0.6, 0.08, 0.1), chrome, x / 2 + Math.sign(x) * 0.25, r, z);
      B.add(arm);
    }
    // exhausts + flames
    this.flames = [];
    for (const x of [-0.95, 0.95]) {
      const p = mesh(G.cyl(0.13, 0.17, 0.7, 16), chrome, x, 0.55, 1.75);
      p.rotation.x = Math.PI / 2;
      B.add(p);
      const f = mesh(G.cone(0.2, 0.9, 12), glow('#ff9a2e', { transparent: true, opacity: 0.9, intensity: 3 }), x, 0.55, 2.35);
      f.rotation.x = Math.PI / 2;
      B.add(f);
      const fb = mesh(G.cone(0.26, 1.5, 12), glow('#4ad8ff', { transparent: true, opacity: 0.95, intensity: 4 }), x, 0.55, 2.55);
      fb.rotation.x = Math.PI / 2;
      fb.visible = false;
      B.add(fb);
      this.flames.push({ f, fb });
    }
    // steering column + wheel
    const col = mesh(G.cyl(0.05, 0.05, 0.9, 8), chrome, 0, 0.95, -0.55);
    col.rotation.x = -0.9;
    B.add(col);
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 1.28, -0.3);
    this.wheel.rotation.x = -0.6;
    this.wheel.add(mesh(G.torus(0.3, 0.06, 20), MAT.rubber('#222')));
    this.wheel.add(mesh(G.box(0.55, 0.06, 0.05), chrome));
    B.add(this.wheel);

    // --- the driver: Claude, a chunky clay spark sitting in the cockpit
    const m = new THREE.Group();
    m.position.set(0, 0.62, 0.2);
    B.add(m);
    this.mascot = m;
    const clay = MAT.paint('#d97757', { roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5, metalness: 0 });
    const spark = new THREE.Group();
    spark.position.set(0, 1.55, 0);
    m.add(spark);
    this.spark = spark;
    spark.add(mesh(G.sphere(0.5, 28), clay)); // hub
    // rounded rays of slightly different lengths, like a hand-drawn spark
    const lens = [1.0, 0.78, 0.92, 0.7, 0.98, 0.74, 0.9, 0.8, 0.96, 0.72, 0.88, 0.76];
    this.rays = [];
    lens.forEach((L, i) => {
      const a = (i / lens.length) * Math.PI * 2 + 0.13;
      const ray = new THREE.Group();
      ray.rotation.z = a;
      const cap = mesh(G.capsule(0.15, L * 0.75), clay, 0, 0.45 + L * 0.38, 0);
      cap.scale.z = 1.35;
      ray.add(cap);
      spark.add(ray);
      this.rays.push({ g: ray, cap, L, base: 0.45 + L * 0.38 });
    });
    // face (camera side) — canvas with transparent background
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256; this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(G.plane(0.92, 0.92), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false }));
    face.position.set(0, 0, 0.53);
    face.renderOrder = 2;
    spark.add(face);
    // cream racing gloves gripping the wheel
    for (const sx of [-1, 1]) {
      const arm = mesh(G.capsule(0.09, 0.6), clay, sx * 0.42, 0.85, -0.3);
      arm.rotation.set(-1.0, 0, sx * 0.5);
      m.add(arm);
      m.add(mesh(G.sphere(0.15, 14), MAT.plastic('#f3eee3'), sx * 0.32, 0.6, -0.62));
    }
    // a tiny racing headband with goggles pushed up (Claude takes safety seriously)
    const band = mesh(G.torus(0.52, 0.06, 28), MAT.plastic('#2a2725'), 0, 0.22, 0);
    band.rotation.x = Math.PI / 2;
    spark.add(band);
    for (const sx of [-0.2, 0.2]) {
      const gog = mesh(G.torus(0.13, 0.05, 16), MAT.chrome(), sx, 0.42, 0.42);
      gog.add(mesh(G.cyl(0.11, 0.11, 0.03, 16), MAT.glass('#7fd4ff', { opacity: 0.6 })).rotateX(Math.PI / 2));
      spark.add(gog);
    }
    this.helmet = null;
    this.fans = [];
    this.rgb = null;
    // sunglasses (combo ≥ 50)
    const shades = new THREE.Group();
    shades.add(mesh(G.rbox(0.3, 0.17, 0.05, 0.05), MAT.glass('#050505', { opacity: 0.94 }), -0.17, 0.08, 0.58));
    shades.add(mesh(G.rbox(0.3, 0.17, 0.05, 0.05), MAT.glass('#050505', { opacity: 0.94 }), 0.17, 0.08, 0.58));
    shades.add(mesh(G.box(0.12, 0.04, 0.04), MAT.chrome(), 0, 0.12, 0.58));
    shades.visible = false;
    spark.add(shades);
    this.shades = shades;

    // --- AGI WINGS glider (deploys on glide jumps)
    const glider = new THREE.Group();
    glider.position.set(0, 2.9, 0.2);
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 16;
    const sg = sc.getContext('2d');
    ['#d97757', '#f3eee3', '#c15f3c', '#f3eee3', '#d97757', '#f3eee3', '#c15f3c', '#f3eee3'].forEach((c, i) => { sg.fillStyle = c; sg.fillRect(i * 32, 0, 32, 16); });
    const stripes = new THREE.CanvasTexture(sc);
    stripes.colorSpace = THREE.SRGBColorSpace;
    const canopyMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.55, side: THREE.DoubleSide });
    // a curved parafoil wing: a slice of a cylinder, wide and arched
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.8, 32, 1, true, -1.1, 2.2), canopyMat);
    canopy.rotation.x = -Math.PI / 2; // axis along the kart, arc arching over it
    canopy.position.y = -2.0;
    canopy.scale.set(1, 1.15, 1);
    const wl = textPanel('AGI WINGS', { width: 3.2, height: 0.7, bg: null, fg: '#c15f3c', stroke: '#ffffff', strokeW: 10 });
    wl.position.set(0, 1.1, 0.95);
    wl.rotation.x = -0.35;
    glider.add(wl);
    for (const sx of [-2.2, -1.1, 1.1, 2.2]) {
      const strut = mesh(G.cyl(0.02, 0.02, 2.6, 4), MAT.metal('#ffffff'), sx * 0.5, -1.2, 0);
      strut.rotation.z = -sx * 0.2;
      glider.add(strut);
    }
    glider.scale.setScalar(0.01);
    glider.visible = false;
    B.add(glider);
    this.glider = glider;

    // shield bubble
    this.shield = mesh(G.sphere(2.5, 32), physical('#5affd0', { transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false, iridescence: 1 }), 0, 1.3, 0);
    this.shield.visible = false;
    this.root.add(this.shield);
    this.underGlow = glowSprite('#4ad8ff', 5, 0);
    this.underGlow.position.set(0, 0.3, 0.5);
    this.root.add(this.underGlow);
    this.drawFace();
  }

  setExpression(e) { if (e !== this.expr) { this.expr = e; this.drawFace(); } }

  drawFace() {
    const g = this.faceCanvas.getContext('2d');
    const W = 256, H = 256;
    g.clearRect(0, 0, W, H);
    const ink = '#2a2725';
    g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 13;
    const ex = [92, 164], ey = 112, e = this.expr;
    if (e === 'hurt') {
      for (const x of ex) { g.beginPath(); g.moveTo(x - 15, ey - 15); g.lineTo(x + 15, ey + 15); g.moveTo(x + 15, ey - 15); g.lineTo(x - 15, ey + 15); g.stroke(); }
      g.beginPath(); g.moveTo(100, 176); g.quadraticCurveTo(114, 164, 128, 176); g.quadraticCurveTo(142, 188, 156, 176); g.stroke();
    } else if (e === 'scared') {
      for (const x of ex) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, ey, 22, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(x, ey + 3, 8, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(128, 182, 20, 16, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7fd4ff'; g.beginPath(); g.ellipse(206, 70, 10, 16, 0, 0, Math.PI * 2); g.fill();
    } else {
      if (this.blinking) {
        for (const x of ex) { g.beginPath(); g.moveTo(x - 14, ey); g.lineTo(x + 14, ey); g.stroke(); }
      } else if (e === 'happy') {
        for (const x of ex) { g.beginPath(); g.arc(x, ey + 10, 16, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      } else {
        for (const x of ex) { g.beginPath(); g.ellipse(x, ey, 11, 17, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#fff';
        for (const x of ex) { g.beginPath(); g.arc(x + 4, ey - 6, 4, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = ink;
      }
      if (e === 'happy') {
        g.beginPath(); g.moveTo(96, 160); g.quadraticCurveTo(128, 214, 160, 160); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.arc(128, 150, 26, 0.18 * Math.PI, 0.82 * Math.PI); g.stroke();
      }
      g.fillStyle = 'rgba(255,140,140,0.55)';
      g.beginPath(); g.ellipse(58, 160, 16, 10, 0, 0, Math.PI * 2); g.ellipse(198, 160, 16, 10, 0, 0, Math.PI * 2); g.fill();
    }
    this.faceTex.needsUpdate = true;
  }

  update(s) {
    const { dt } = s;
    this.root.position.copy(s.pos);
    if (s.quat) this.root.quaternion.copy(s.quat); else this.root.rotation.y = s.heading || 0;
    const targetYaw = clamp(-s.steerVel * 0.18, -0.3, 0.3);
    const targetLean = clamp(s.steerVel * 0.12, -0.26, 0.26);
    this.yaw = lerp(this.yaw, targetYaw, 1 - Math.exp(-dt * 10));
    this.lean = lerp(this.lean, targetLean, 1 - Math.exp(-dt * 10));
    if (s.spinT > 0) this.spin += dt * 22 * s.spinT;
    else this.spin = lerp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 1 - Math.exp(-dt * 12));
    this.body.rotation.set(s.boostK * 0.14 + (s.launchK || 0) * 0.5 + (s.airK || 0) * 0.08, this.yaw + this.spin, this.lean);
    this.body.position.y = s.boostK * 0.12 + (s.spinT > 0 ? Math.abs(Math.sin(s.t * 20)) * 0.3 : 0);
    const sq = Math.pow(1 - s.beatPhase, 4) * 0.05;
    this.scaleK = lerp(this.scaleK, s.scaleK, 1 - Math.exp(-dt * 6));
    const k = this.scaleK;
    this.root.scale.set(k * (1 + sq), k * (1 - sq), k * (1 + sq));
    this.mascot.position.y = 0.62 + Math.sin(s.t * 9) * 0.03;
    // Claude always turns to look at you (the spark reads best face-on), with a little lean
    if (s.camPos) {
      this.spark.lookAt(s.camPos);
      this.spark.rotateZ(-this.lean * 1.2);
    }
    // rays bop on the beat; spin up when boosting
    const bop = Math.pow(1 - s.beatPhase, 3);
    for (const r of this.rays) r.cap.position.y = r.base + bop * 0.08 * r.L;
    this.spinRays = (this.spinRays || 0) + dt * s.boostK * 9;
    for (let i = 0; i < this.rays.length; i++) this.rays[i].g.rotation.z = (i / this.rays.length) * Math.PI * 2 + 0.13 + this.spinRays;
    this.wheel.rotation.z = -s.steerVis * 1.6;
    for (const w of this.wheels) w.rotation.x -= dt * 26;
    for (const f of this.fans) f.rotation.z += dt * (20 + s.boostK * 40);
    this.flameK = lerp(this.flameK, s.boostK, 1 - Math.exp(-dt * 8));
    const flick = 0.85 + Math.random() * 0.3;
    for (const { f, fb } of this.flames) {
      f.scale.set(1, (0.6 + this.flameK * 0.6) * flick, 1);
      f.visible = this.flameK < 0.4;
      fb.visible = this.flameK >= 0.4;
      fb.scale.set(1, (0.6 + this.flameK) * flick, 1);
    }
    this.underGlow.material.opacity = this.flameK * 0.7;
    this.shield.visible = s.shield;
    if (s.shield) this.shield.scale.setScalar(1 + Math.sin(s.t * 6) * 0.03);
    this.shades.visible = s.shades;
    // glider
    this.gliderK = lerp(this.gliderK, s.glide ? 1 : 0, 1 - Math.exp(-dt * (s.glide ? 5 : 8)));
    this.glider.visible = this.gliderK > 0.02;
    this.glider.scale.setScalar(Math.max(0.01, this.gliderK));
    this.glider.rotation.z = -this.lean * 1.5;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = !this.blinking;
      this.blinkT = this.blinking ? 0.12 : 2 + Math.random() * 3;
      if (this.expr === 'normal' || this.expr === 'happy') this.drawFace();
    }
  }
}
