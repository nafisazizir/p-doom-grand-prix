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
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
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
    this.mesh.setColorAt(i, _c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  burst(pos, colors, n = 18, { speed = 8, life = 0.7, size = 0.28, grav = -14, up = 4, carry = 0 } = {}) {
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
