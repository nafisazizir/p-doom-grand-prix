// "Lil' H-1000": a smiling graphics card in a too-big racing helmet, driving a tiny go-kart.
import * as THREE from 'three';
import { toon, glow, G, mesh, roundRect, clamp, lerp } from './toolkit.js';
import { glowSprite } from './entities.js';

export class Kart {
  constructor(scene) {
    this.root = new THREE.Group(); // positioned on the road
    this.body = new THREE.Group(); // leans / spins / wheelies
    this.root.add(this.body);
    scene.add(this.root);
    this.expr = 'normal';
    this.blinkT = 2;
    this.blinking = false;
    this._build();
    this.yaw = 0;
    this.lean = 0;
    this.spin = 0;
    this.squash = 0;
    this.scaleK = 1;
    this.flameK = 0;
  }

  _build() {
    const B = this.body;
    // --- go-kart chassis
    const chassis = mesh(G.rbox(1.9, 0.35, 2.8, 0.15), toon('#ff4f7b'), 0, 0.45, 0);
    B.add(chassis);
    B.add(mesh(G.rbox(1.5, 0.3, 0.6, 0.12), toon('#ffd23f'), 0, 0.55, -1.45)); // front bumper (forward is -z)
    B.add(mesh(G.rbox(2.2, 0.15, 0.5, 0.06), toon('#2b1840'), 0, 0.95, 1.35)); // rear spoiler
    B.add(mesh(G.box(0.12, 0.4, 0.12), toon('#2b1840'), -0.7, 0.75, 1.35));
    B.add(mesh(G.box(0.12, 0.4, 0.12), toon('#2b1840'), 0.7, 0.75, 1.35));
    this.wheels = [];
    for (const [x, z] of [[-1.05, -0.95], [1.05, -0.95], [-1.05, 1.0], [1.05, 1.0]]) {
      const w = mesh(G.cyl(0.42, 0.42, 0.38, 16), toon('#26232e'), x, 0.42, z);
      w.rotation.z = Math.PI / 2;
      w.add(mesh(G.cyl(0.2, 0.2, 0.4, 10), toon('#ffd23f'), 0, 0, 0));
      B.add(w);
      this.wheels.push(w);
    }
    // exhaust pipes + flames
    this.flames = [];
    for (const x of [-0.45, 0.45]) {
      const p = mesh(G.cyl(0.14, 0.17, 0.5, 10), toon('#9aa0b0'), x, 0.55, 1.55);
      p.rotation.x = Math.PI / 2;
      B.add(p);
      const f = mesh(G.cone(0.2, 0.9, 10), glow('#ffb02e', { transparent: true, opacity: 0.9 }), x, 0.55, 2.1);
      f.rotation.x = Math.PI / 2;
      B.add(f);
      const fb = mesh(G.cone(0.24, 1.4, 10), glow('#4ad8ff', { transparent: true, opacity: 0.9 }), x, 0.55, 2.3);
      fb.rotation.x = Math.PI / 2;
      fb.visible = false;
      B.add(fb);
      this.flames.push({ f, fb });
    }
    // steering column + wheel
    const col = mesh(G.cyl(0.06, 0.06, 0.8, 8), toon('#2b1840'), 0, 1.0, -0.65);
    col.rotation.x = -0.9;
    B.add(col);
    this.wheel = mesh(G.torus(0.32, 0.07, 16), toon('#2b1840'), 0, 1.3, -0.4);
    this.wheel.rotation.x = -0.6;
    B.add(this.wheel);

    // --- the mascot: an upright graphics card
    const m = new THREE.Group();
    m.position.set(0, 0.75, 0.25);
    B.add(m);
    this.mascot = m;
    const card = mesh(G.rbox(1.6, 1.25, 0.45, 0.14), toon('#33c27a'), 0, 0.85, 0);
    m.add(card);
    m.add(mesh(G.box(1.2, 0.12, 0.48), glow('#ffd23f'), 0, 0.2, 0)); // gold fingers as a "belt"
    // fans on the back
    for (const x of [-0.38, 0.38]) {
      const f = mesh(G.cyl(0.28, 0.28, 0.06, 14), toon('#1b1d26'), x, 0.85, 0.24);
      f.rotation.x = Math.PI / 2;
      m.add(f);
    }
    // face (canvas)
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256; this.faceCanvas.height = 192;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true });
    fm.userData.outlineParameters = { visible: false };
    const face = new THREE.Mesh(G.plane(1.35, 1.0), fm);
    face.position.set(0, 0.8, -0.235);
    face.rotation.y = Math.PI; // faces -z (forward)... the camera is behind, so we show the face on the back too:
    m.add(face);
    const face2 = new THREE.Mesh(G.plane(1.35, 1.0), fm);
    face2.position.set(0, 0.8, 0.28);
    m.add(face2); // the face the camera sees (cartoon logic)
    // stubby arms reaching to the wheel
    for (const s of [-1, 1]) {
      const a = mesh(G.capsule(0.11, 0.55), toon('#33c27a'), s * 0.6, 0.6, -0.35);
      a.rotation.set(-1.1, 0, s * 0.35);
      m.add(a);
      m.add(mesh(G.sphere(0.14, 10), toon('#ffffff'), s * 0.38, 0.45, -0.68));
    }
    // too-big racing helmet (full-face, open visor so you can see the card's face)
    const helmet = new THREE.Group();
    helmet.position.set(0, 1.5, 0);
    const shell = mesh(G.sphere(0.88, 20), toon('#2fd4ff'), 0, 0.12, 0);
    shell.scale.set(1.12, 0.92, 1.05);
    helmet.add(shell);
    helmet.add(mesh(G.box(0.34, 0.95, 1.95), toon('#ffd23f'), 0, 0.28, 0)); // centre stripe
    helmet.add(mesh(G.box(1.98, 0.14, 0.5), toon('#2b1840'), 0, -0.3, -0.1)); // chin trim
    const visor = mesh(G.rbox(1.5, 0.32, 0.25, 0.1), glow('#2b1840'), 0, 0.02, 0.86); // tinted visor flipped up on the back side
    visor.rotation.x = -0.35;
    helmet.add(visor);
    const fin = mesh(G.rbox(0.12, 0.45, 0.8, 0.05), toon('#ff4f7b'), 0, 0.9, 0.2); // little aero fin
    helmet.add(fin);
    m.add(helmet);
    this.helmet = helmet;
    // sunglasses (combo ≥ 50)
    const shades = new THREE.Group();
    shades.add(mesh(G.rbox(0.45, 0.28, 0.08, 0.06), toon('#111'), -0.27, 0.95, 0.33));
    shades.add(mesh(G.rbox(0.45, 0.28, 0.08, 0.06), toon('#111'), 0.27, 0.95, 0.33));
    shades.add(mesh(G.box(0.2, 0.06, 0.06), toon('#111'), 0, 1.0, 0.33));
    shades.visible = false;
    m.add(shades);
    this.shades = shades;
    // shield bubble
    this.shield = mesh(G.sphere(2.3, 20), toon('#5affd0', { transparent: true, opacity: 0.25, outline: false, depthWrite: false }), 0, 1.3, 0);
    this.shield.visible = false;
    this.root.add(this.shield);
    // boost glow under the kart
    this.underGlow = glowSprite('#4ad8ff', 5, 0);
    this.underGlow.position.set(0, 0.3, 0.5);
    this.root.add(this.underGlow);
    this.drawFace();
  }

  setExpression(e) {
    if (e !== this.expr) { this.expr = e; this.drawFace(); }
  }

  drawFace() {
    const g = this.faceCanvas.getContext('2d');
    const W = 256, H = 192;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#e9fff1';
    roundRect(g, 10, 10, W - 20, H - 20, 40);
    g.fill();
    g.lineWidth = 10; g.strokeStyle = '#1e3a2a'; g.stroke();
    g.fillStyle = '#1e3a2a'; g.strokeStyle = '#1e3a2a'; g.lineCap = 'round'; g.lineWidth = 12;
    const ex = [88, 168], ey = 78;
    const e = this.expr;
    if (e === 'hurt') {
      for (const x of ex) { g.beginPath(); g.moveTo(x - 16, ey - 16); g.lineTo(x + 16, ey + 16); g.moveTo(x + 16, ey - 16); g.lineTo(x - 16, ey + 16); g.stroke(); }
      g.beginPath(); g.moveTo(96, 140); g.quadraticCurveTo(112, 128, 128, 140); g.quadraticCurveTo(144, 152, 160, 140); g.stroke();
    } else if (e === 'scared') {
      for (const x of ex) { g.beginPath(); g.arc(x, ey, 20, 0, Math.PI * 2); g.lineWidth = 8; g.stroke(); g.beginPath(); g.arc(x, ey, 7, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.ellipse(128, 145, 26, 20, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7ad0ff'; g.beginPath(); g.ellipse(210, 50, 9, 14, 0, 0, Math.PI * 2); g.fill();
    } else {
      if (this.blinking) {
        for (const x of ex) { g.beginPath(); g.moveTo(x - 14, ey); g.lineTo(x + 14, ey); g.stroke(); }
      } else if (e === 'happy') {
        for (const x of ex) { g.beginPath(); g.arc(x, ey + 8, 16, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      } else {
        for (const x of ex) { g.beginPath(); g.arc(x, ey, 13, 0, Math.PI * 2); g.fill(); }
      }
      if (e === 'happy') {
        g.beginPath(); g.moveTo(80, 118); g.quadraticCurveTo(128, 185, 176, 118); g.closePath(); g.fill();
        g.fillStyle = '#ff7a9a'; g.beginPath(); g.ellipse(128, 150, 20, 10, 0, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.arc(128, 112, 34, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      g.fillStyle = 'rgba(255,120,150,0.5)';
      g.beginPath(); g.ellipse(50, 120, 16, 10, 0, 0, Math.PI * 2); g.ellipse(206, 120, 16, 10, 0, 0, Math.PI * 2); g.fill();
    }
    this.faceTex.needsUpdate = true;
  }

  /**
   * @param s {pos: Vector3, heading, steerVel, dt, t, boostK 0..1, spinT, scaleK, shield, shades, beatPhase, launchK}
   */
  update(s) {
    const { dt } = s;
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.heading;
    // lean + yaw into turns
    const targetYaw = clamp(-s.steerVel * 0.18, -0.3, 0.3);
    const targetLean = clamp(s.steerVel * 0.12, -0.26, 0.26);
    this.yaw = lerp(this.yaw, targetYaw, 1 - Math.exp(-dt * 10));
    this.lean = lerp(this.lean, targetLean, 1 - Math.exp(-dt * 10));
    // spinout
    if (s.spinT > 0) this.spin += dt * 22 * s.spinT;
    else this.spin = lerp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 1 - Math.exp(-dt * 12));
    this.body.rotation.set(-s.boostK * 0.18 - (s.launchK || 0) * 0.5, this.yaw + this.spin, this.lean);
    this.body.position.y = s.boostK * 0.15 + (s.spinT > 0 ? Math.abs(Math.sin(s.t * 20)) * 0.3 : 0);
    // squash on the beat
    const sq = Math.pow(1 - s.beatPhase, 4) * 0.06;
    this.scaleK = lerp(this.scaleK, s.scaleK, 1 - Math.exp(-dt * 6));
    const k = this.scaleK;
    this.root.scale.set(k * (1 + sq), k * (1 - sq), k * (1 + sq));
    this.mascot.position.y = 0.75 + Math.sin(s.t * 9) * 0.03;
    this.helmet.rotation.z = -this.lean * 1.2;
    this.wheel.rotation.z = -s.steerVis * 1.6;
    for (const w of this.wheels) w.rotation.x += dt * 30;
    // flames
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
    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinking = !this.blinking;
      this.blinkT = this.blinking ? 0.12 : 2 + Math.random() * 3;
      if (this.expr === 'normal' || this.expr === 'happy') this.drawFace();
    }
  }
}
