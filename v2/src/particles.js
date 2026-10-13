// One instanced mesh of chunky cubes for every particle effect (bursts, fireworks, trails, confetti).
import * as THREE from 'three';

const MAX = 900;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class Particles {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.6, 0), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = new Float32Array(MAX * 3);
    this.v = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.next = 0;
    for (let i = 0; i < MAX; i++) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
  }

  spawn(pos, vel, color, { life = 0.8, size = 0.25, grav = -12 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.p[i * 3] = pos.x; this.p[i * 3 + 1] = pos.y; this.p[i * 3 + 2] = pos.z;
    this.v[i * 3] = vel.x; this.v[i * 3 + 1] = vel.y; this.v[i * 3 + 2] = vel.z;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grav[i] = grav;
    this.rot[i] = Math.random() * 6;
    this.mesh.setColorAt(i, _c.set(color).multiplyScalar(2.2)); // HDR so sparks bloom
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(pos, colors, n = 18, { speed = 8, life = 0.7, size = 0.16, grav = -14, up = 4, carry = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      _p.set(Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s * 0.7 + up, Math.sin(a) * Math.cos(b) * s - carry);
      this.spawn(pos, _p, colors[k % colors.length], { life: life * (0.7 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), grav });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      if (this.life[i] <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      this.v[i * 3 + 1] += this.grav[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += dt * 6;
      const s = this.size[i] * Math.min(1, k * 2.5);
      _e.set(this.rot[i], this.rot[i] * 0.7, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < MAX; i++) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Soft billboard smoke/dust (THREE.Points with a soft round sprite, per-particle size/alpha/colour).
const SMAX = 600;
export class Smoke {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(SMAX * 3);
    this.col = new Float32Array(SMAX * 3);
    this.size = new Float32Array(SMAX);
    this.alpha = new Float32Array(SMAX);
    this.vel = new Float32Array(SMAX * 3);
    this.life = new Float32Array(SMAX);
    this.max = new Float32Array(SMAX);
    this.grow = new Float32Array(SMAX);
    this.a0 = new Float32Array(SMAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
        uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          // fade out puffs right in front of the lens so they never fill the screen
          vA = alpha * smoothstep(2.5, 7.0, -mv.z); vC = color;
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(vC, a * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
    this.mat = mat;
    window.addEventListener('resize', () => { mat.uniforms.scale.value = innerHeight / 2; });
  }
  spawn(p, v, color, { life = 1.2, size = 2, grow = 3, alpha = 0.5 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % SMAX;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    _c.set(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.a0[i] = alpha;
  }
  puff(p, color, n = 20, { speed = 4, life = 1.4, size = 2.5, grow = 4, alpha = 0.5, up = 1.5 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      _v.set(Math.cos(a) * s, up * Math.random(), Math.sin(a) * s);
      this.spawn(p, _v, color, { life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), grow, alpha });
    }
  }
  update(dt) {
    for (let i = 0; i < SMAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 1 - dt * 1.5; this.vel[i * 3 + 2] *= 1 - dt * 1.5;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - k) * 6) * k;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}
const _v = new THREE.Vector3();
