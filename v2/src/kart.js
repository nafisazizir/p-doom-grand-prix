// v2 hero: "Lil' H-1000" — a premium graphics card with an LCD face, in a glossy helmet, driving a sculpted kart.
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
  }

  _build() {
    const B = this.body;
    const paint = MAT.paint('#ff2f6d');
    const paint2 = MAT.paint('#ffd23f');
    const carbon = toon('#1a1a20', { roughness: 0.35, metalness: 0.4 });
    const chrome = MAT.chrome();
    // --- chassis
    const shell = new THREE.Mesh(kartShell(), paint);
    shell.scale.set(0.95, 0.95, 1);
    B.add(shell);
    B.add(mesh(G.rbox(2.3, 0.18, 3.3, 0.08), carbon, 0, 0.2, 0.05)); // floor pan
    // side pods
    for (const sx of [-1, 1]) {
      const pod = mesh(G.capsule(0.28, 1.5), paint, sx * 1.02, 0.42, 0.25);
      pod.rotation.x = Math.PI / 2;
      B.add(pod);
      B.add(mesh(G.box(0.05, 0.12, 1.4), paint2, sx * 1.3, 0.48, 0.25));
    }
    // nose number plate
    const plate = textPanel('H-1000', { width: 0.9, height: 0.32, bg: '#ffffff', fg: '#2b1840', border: '#2b1840', borderW: 6, radius: 10 });
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
    // rear wing
    B.add(mesh(G.rbox(2.4, 0.08, 0.55, 0.04), paint2, 0, 1.15, 1.55));
    for (const sx of [-1.2, 1.2]) B.add(mesh(G.rbox(0.06, 0.45, 0.6, 0.03), carbon, sx, 1.05, 1.55));
    for (const sx of [-0.45, 0.45]) B.add(mesh(G.box(0.07, 0.45, 0.12), carbon, sx, 0.9, 1.5));
    // seat
    B.add(mesh(G.rbox(0.9, 0.6, 0.25, 0.1), carbon, 0, 0.95, 0.75));
    // wheels: rubber tyres + chrome rims + spokes
    this.wheels = [];
    const tyre = MAT.rubber('#1b1b20');
    for (const [x, z, r] of [[-1.12, -1.25, 0.42], [1.12, -1.25, 0.42], [-1.18, 1.05, 0.5], [1.18, 1.05, 0.5]]) {
      const w = new THREE.Group();
      w.position.set(x, r, z);
      const t = mesh(G.torus(r * 0.72, r * 0.3, 28), tyre);
      t.rotation.y = Math.PI / 2;
      w.add(t);
      const rim = mesh(G.cyl(r * 0.55, r * 0.55, 0.36, 24), chrome);
      rim.rotation.z = Math.PI / 2;
      w.add(rim);
      const hub = mesh(G.cyl(r * 0.2, r * 0.2, 0.42, 12), paint2);
      hub.rotation.z = Math.PI / 2;
      w.add(hub);
      for (let k = 0; k < 5; k++) {
        const sp = mesh(G.box(0.4, r * 0.95, 0.07), MAT.metal('#9aa2b0'));
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
    for (const x of [-0.42, 0.42]) {
      const p = mesh(G.cyl(0.13, 0.17, 0.7, 16), chrome, x, 0.62, 1.75);
      p.rotation.x = Math.PI / 2;
      B.add(p);
      const f = mesh(G.cone(0.2, 0.9, 12), glow('#ff9a2e', { transparent: true, opacity: 0.9, intensity: 3 }), x, 0.62, 2.35);
      f.rotation.x = Math.PI / 2;
      B.add(f);
      const fb = mesh(G.cone(0.26, 1.5, 12), glow('#4ad8ff', { transparent: true, opacity: 0.95, intensity: 4 }), x, 0.62, 2.55);
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

    // --- the mascot: an upright premium graphics card
    const m = new THREE.Group();
    m.position.set(0, 0.8, 0.35);
    m.scale.setScalar(1.18);
    B.add(m);
    this.mascot = m;
    const shroud = MAT.paint('#2a2f3a', { metalness: 0.6, roughness: 0.28 });
    m.add(mesh(G.rbox(1.7, 1.3, 0.5, 0.16), shroud, 0, 0.9, 0));
    m.add(mesh(G.rbox(1.74, 1.34, 0.08, 0.04), MAT.metal('#c8ccd6'), 0, 0.9, -0.27)); // backplate (front side)
    m.add(mesh(G.box(1.2, 0.12, 0.42), glow('#ffd23f', { intensity: 1.6 }), 0, 0.22, 0)); // gold fingers belt
    // RGB strip on top
    this.rgb = mesh(G.box(1.5, 0.06, 0.06), glow('#5affd0', { intensity: 3 }), 0, 1.57, 0.2);
    m.add(this.rgb);
    // LCD face screen (camera side, +z) with a bezel
    m.add(mesh(G.rbox(1.42, 1.02, 0.06, 0.06), toon('#0b0d12', { roughness: 0.2 }), 0, 0.92, 0.27));
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256; this.faceCanvas.height = 192;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshBasicMaterial({ map: this.faceTex });
    fm.color.setScalar(1.6); // emissive-bright LCD
    const face = new THREE.Mesh(G.plane(1.3, 0.92), fm);
    face.position.set(0, 0.92, 0.305);
    m.add(face);
    // fans on the other side (forward)
    this.fans = [];
    for (const x of [-0.42, 0.42]) {
      const f = new THREE.Group();
      f.position.set(x, 0.92, -0.3);
      f.add(mesh(G.torus(0.3, 0.035, 20), MAT.chrome()));
      for (let k = 0; k < 7; k++) {
        const bl = mesh(G.box(0.08, 0.26, 0.02), toon('#20232c', { roughness: 0.4 }));
        bl.position.set(Math.cos((k / 7) * Math.PI * 2) * 0.14, Math.sin((k / 7) * Math.PI * 2) * 0.14, 0);
        bl.rotation.z = (k / 7) * Math.PI * 2 + 0.6;
        f.add(bl);
      }
      f.add(mesh(G.cyl(0.08, 0.08, 0.05, 12), glow('#5affd0', { intensity: 2 })).rotateX(Math.PI / 2));
      m.add(f);
      this.fans.push(f);
    }
    // arms + gloves
    for (const s of [-1, 1]) {
      const a = mesh(G.capsule(0.1, 0.55), MAT.plastic('#2a2f3a'), s * 0.62, 0.62, -0.35);
      a.rotation.set(-1.1, 0, s * 0.35);
      m.add(a);
      m.add(mesh(G.sphere(0.15, 14), MAT.plastic('#ffffff'), s * 0.36, 0.48, -0.66));
    }
    // too-big glossy helmet
    const helmet = new THREE.Group();
    helmet.position.set(0, 1.55, 0);
    const shell2 = mesh(G.sphere(0.62, 32), MAT.paint('#2fd4ff'), 0, 0.16, 0);
    shell2.scale.set(1.35, 0.95, 1.15);
    helmet.add(shell2);
    helmet.add(mesh(G.box(0.22, 0.62, 1.42), MAT.paint('#ffd23f'), 0, 0.4, 0));
    const visor = mesh(G.rbox(1.25, 0.32, 0.2, 0.1), MAT.glass('#16243a', { opacity: 0.85 }), 0, 0.12, 0.62);
    visor.rotation.x = -0.25;
    helmet.add(visor);
    helmet.add(mesh(G.rbox(0.1, 0.38, 0.65, 0.04), MAT.paint('#ff2f6d'), 0, 0.82, 0.05));
    const ring = mesh(G.torus(0.62, 0.05, 32), MAT.chrome(), 0, -0.12, 0);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.35, 1.15, 1);
    helmet.add(ring);
    m.add(helmet);
    this.helmet = helmet;
    // sunglasses (combo ≥ 50): drawn on the LCD + a physical pair
    const shades = new THREE.Group();
    shades.add(mesh(G.rbox(0.48, 0.26, 0.06, 0.06), MAT.glass('#050505', { opacity: 0.92 }), -0.28, 1.0, 0.35));
    shades.add(mesh(G.rbox(0.48, 0.26, 0.06, 0.06), MAT.glass('#050505', { opacity: 0.92 }), 0.28, 1.0, 0.35));
    shades.add(mesh(G.box(0.2, 0.05, 0.05), MAT.chrome(), 0, 1.05, 0.35));
    shades.visible = false;
    m.add(shades);
    this.shades = shades;

    // --- AGI WINGS glider (deploys on glide jumps)
    const glider = new THREE.Group();
    glider.position.set(0, 2.9, 0.2);
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 16;
    const sg = sc.getContext('2d');
    ['#ff2f6d', '#ffffff', '#ffd23f', '#ffffff', '#2fd4ff', '#ffffff', '#ff2f6d', '#ffffff'].forEach((c, i) => { sg.fillStyle = c; sg.fillRect(i * 32, 0, 32, 16); });
    const stripes = new THREE.CanvasTexture(sc);
    stripes.colorSpace = THREE.SRGBColorSpace;
    const canopyMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.55, side: THREE.DoubleSide });
    // a curved parafoil wing: a slice of a cylinder, wide and arched
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.8, 32, 1, true, -1.1, 2.2), canopyMat);
    canopy.rotation.x = -Math.PI / 2; // axis along the kart, arc arching over it
    canopy.position.y = -2.0;
    canopy.scale.set(1, 1.15, 1);
    const wl = textPanel('AGI WINGS', { width: 3.2, height: 0.7, bg: null, fg: '#ff2f6d', stroke: '#ffffff', strokeW: 10 });
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
    const W = 256, H = 192;
    const bg = this.expr === 'scared' ? '#2a0610' : this.expr === 'hurt' ? '#1a0a20' : '#03140e';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // LCD scanlines
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    const fg = this.expr === 'scared' ? '#ff5a7a' : this.expr === 'hurt' ? '#ffb02e' : '#5affb0';
    g.fillStyle = fg; g.strokeStyle = fg; g.lineCap = 'round'; g.lineWidth = 14;
    g.shadowColor = fg; g.shadowBlur = 14;
    const ex = [86, 170], ey = 78, e = this.expr;
    if (e === 'hurt') {
      for (const x of ex) { g.beginPath(); g.moveTo(x - 16, ey - 16); g.lineTo(x + 16, ey + 16); g.moveTo(x + 16, ey - 16); g.lineTo(x - 16, ey + 16); g.stroke(); }
      g.beginPath(); g.moveTo(92, 142); g.quadraticCurveTo(110, 128, 128, 142); g.quadraticCurveTo(146, 156, 164, 142); g.stroke();
    } else if (e === 'scared') {
      for (const x of ex) { g.lineWidth = 9; g.beginPath(); g.arc(x, ey, 22, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, ey, 7, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(128, 146, 26, 20, 0, 0, Math.PI * 2); g.fill();
      g.font = 'bold 30px monospace'; g.fillText('P(DOOM)!!', 60, 30);
    } else {
      if (this.blinking) {
        for (const x of ex) { g.beginPath(); g.moveTo(x - 16, ey); g.lineTo(x + 16, ey); g.stroke(); }
      } else if (e === 'happy') {
        for (const x of ex) { g.beginPath(); g.arc(x, ey + 10, 18, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      } else {
        for (const x of ex) { g.fillRect(x - 12, ey - 20, 24, 40); }
      }
      if (e === 'happy') {
        g.beginPath(); g.moveTo(78, 116); g.quadraticCurveTo(128, 186, 178, 116); g.closePath(); g.fill();
      } else {
        g.beginPath(); g.arc(128, 108, 36, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
    }
    g.shadowBlur = 0;
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
    this.mascot.position.y = 0.8 + Math.sin(s.t * 9) * 0.03;
    this.helmet.rotation.z = -this.lean * 1.2;
    this.wheel.rotation.z = -s.steerVis * 1.6;
    for (const w of this.wheels) w.rotation.x -= dt * 26;
    for (const f of this.fans) f.rotation.z += dt * (20 + s.boostK * 40);
    this.rgb.material.color.setHSL((s.t * 0.3) % 1, 0.9, 0.55).multiplyScalar(3);
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
