// The v2 course: a real 3D track built from pieces (straights, turns, climbs, jumps), timed to the song.
// Forward position is still locked to song time: s = songTime * SPEED is the arc length along the centre line.
import * as THREE from 'three';

export const SPEED = 38; // world units per song second
export const ROAD_HALF = 9;
export const LANE = 7; // normalized x ∈ [-1,1] → ±LANE world units

// Pieces cover song time contiguously. turn: degrees over the piece (+ right, − left). rise: metres over the piece.
// ease: 'smooth' (default) or 'exp' for the final takeoff.
export const PIECES = [
  { t: [-4, 5] },
  { t: [5, 9], turn: 35 },
  { t: [9, 12], rise: -3 },
  { t: [12, 17.14], turn: -40 },
  // chatbot: climb onto an elevated highway
  { t: [17.14, 22.71], turn: -25, rise: 16 },
  // shoggoth: dive into the mushroom jungle, S-bends, swamp bridge
  { t: [22.71, 26], rise: -9 },
  { t: [26, 29.4], turn: 60 },
  { t: [29.4, 32.6] },
  { t: [32.6, 37.57], turn: -70, rise: -7 },
  // data centre tunnel
  { t: [37.57, 46], turn: -90 },
  { t: [46, 52], turn: 60 },
  { t: [52, 55.77] },
  // sydney: pink bridge over the water
  { t: [55.77, 59.4], turn: 15, rise: 4 },
  // latent space: rainbow road climbing into space
  { t: [59.4, 65], rise: 75 },
  { t: [65, 70], turn: -120, rise: 10 },
  { t: [70, 73.7], turn: 80 },
  // glide jump from space down to the desert
  { t: [73.7, 77.5], rise: -86, ease: 'glide' },
  // badlands: the SHARP LEFT TURN lands on the lyric (80.98 s)
  { t: [77.5, 80.4] },
  { t: [80.4, 83.3], turn: -155 },
  { t: [83.3, 88.49], turn: 20, rise: 6 },
  // gato: cliff edge over the ocean at sunset
  { t: [88.49, 95.76], turn: 45 },
  // paperclip factory
  { t: [95.76, 103], turn: -45 },
  { t: [103, 110.32], turn: 45 },
  // data centre on fire: descending helix
  { t: [110.32, 124.85], turn: 200, rise: -18 },
  // stadium: banked oval + a hop over the leak pool
  { t: [124.85, 129] },
  { t: [129, 133.5], turn: -100 },
  { t: [133.5, 135.5] },
  { t: [135.5, 141.22], turn: -100 },
  // takeoff
  { t: [141.22, 162], rise: 320, ease: 'exp' },
];

// Feature ranges (song seconds). These drive what the track renders around the road.
export const FEATURES = [
  { type: 'grid', t: [-4, 1.5] },
  { type: 'highway', t: [18.2, 22.4] },
  { type: 'bridge', t: [28.6, 33.2], water: 'swamp' },
  { type: 'tunnel', t: [37.9, 55.5] },
  { type: 'bridge', t: [55.4, 59.6], water: 'sea' },
  { type: 'rainbow', t: [59.4, 73.7] },
  { type: 'space', t: [61.5, 74.5] },
  { type: 'jump', t: [73.7, 77.5], glide: true },
  { type: 'cliff', t: [88.49, 95.76], side: -1, water: 'sea' },
  { type: 'tunnel', t: [110.6, 124.6], fire: true },
  { type: 'jump', t: [133.9, 135.1], hop: 7 },
  { type: 'stadium', t: [124.85, 141.22] },
  { type: 'space', t: [150, 170] },
];

const DS = 1; // sample spacing (world units)
const BANK_K = 9; // bank per unit curvature

function ease(u, kind) {
  if (kind === 'exp') return u * u * u;
  if (kind === 'glide') return u < 0.15 ? 0 : (u - 0.15) / 0.85 * ((u - 0.15) / 0.85); // hold height, then accelerate down
  return u * u * (3 - 2 * u);
}

export class Course {
  constructor(speed = SPEED) {
    this.speed = speed;
    const s0 = PIECES[0].t[0] * speed;
    const s1 = PIECES[PIECES.length - 1].t[1] * speed;
    this.s0 = s0;
    this.s1 = s1;
    const n = Math.ceil((s1 - s0) / DS) + 2;
    this.n = n;
    const A = () => new Float32Array(n);
    this.px = A(); this.py = A(); this.pz = A();
    this.yaw = A(); this.bank = A();
    this.tx = A(); this.ty = A(); this.tz = A();
    this.rx = A(); this.ry = A(); this.rz = A();
    this.ux = A(); this.uy = A(); this.uz = A();
    this.features = FEATURES.map((f) => ({ ...f, s: [f.t[0] * speed, f.t[1] * speed] }));
    this._build();
  }

  _pieceAt(s) {
    const t = s / this.speed;
    for (const p of PIECES) if (t >= p.t[0] && t < p.t[1]) return p;
    return PIECES[PIECES.length - 1];
  }

  _build() {
    const { n, speed } = this;
    // integrate yaw (heading) and height per sample
    let yaw = 0, x = 0, z = 0;
    // height: base + sum of completed rises + eased current
    const curv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = this.s0 + i * DS;
      const p = this._pieceAt(s);
      const len = (p.t[1] - p.t[0]) * speed;
      const turnRate = ((p.turn || 0) * Math.PI) / 180 / len;
      curv[i] = turnRate;
    }
    // smooth curvature a little so piece joins aren't kinks
    const sm = smoothArray(curv, 18);
    // height profile
    const hy = new Float32Array(n);
    let base = 0;
    let cur = null, curStart = 0;
    for (let i = 0; i < n; i++) {
      const s = this.s0 + i * DS;
      const p = this._pieceAt(s);
      if (p !== cur) {
        if (cur) base += cur.rise || 0;
        cur = p;
        curStart = p.t[0] * speed;
      }
      const len = (p.t[1] - p.t[0]) * speed;
      const u = Math.min(1, Math.max(0, (s - curStart) / len));
      hy[i] = base + (p.rise || 0) * ease(u, p.ease);
    }
    for (let i = 0; i < n; i++) {
      // yaw positive = turning right
      this.yaw[i] = yaw;
      this.px[i] = x; this.pz[i] = z; this.py[i] = hy[i];
      x += Math.sin(yaw) * DS;
      z += -Math.cos(yaw) * DS;
      yaw += sm[i] * DS;
      this.bank[i] = Math.max(-0.32, Math.min(0.32, sm[i] * BANK_K * 4.5));
    }
    // stadium: steeper banking
    for (const f of this.features) {
      if (f.type !== 'stadium') continue;
      for (let i = this._idx(f.s[0]); i <= this._idx(f.s[1]); i++) this.bank[i] = Math.max(-0.42, Math.min(0.42, this.bank[i] * 1.6));
    }
    // jumps/glides don't bank
    for (const f of this.features) {
      if (f.type !== 'jump') continue;
      for (let i = this._idx(f.s[0]); i <= this._idx(f.s[1]); i++) this.bank[i] *= 0.2;
    }
    const bankS = smoothArray(this.bank, 25);
    this.bank.set(bankS);
    // frames
    const T = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      T.set(this.px[b] - this.px[a], this.py[b] - this.py[a], this.pz[b] - this.pz[a]).normalize();
      R.crossVectors(T, up).normalize();
      U.crossVectors(R, T).normalize();
      const bk = this.bank[i];
      const c = Math.cos(bk), sn = Math.sin(bk);
      // rotate R,U around T by bank (positive bank lifts the right edge... we want the OUTER edge up)
      const Rx = R.x * c - U.x * sn, Ry = R.y * c - U.y * sn, Rz = R.z * c - U.z * sn;
      const Ux = U.x * c + R.x * sn, Uy = U.y * c + R.y * sn, Uz = U.z * c + R.z * sn;
      this.tx[i] = T.x; this.ty[i] = T.y; this.tz[i] = T.z;
      this.rx[i] = Rx; this.ry[i] = Ry; this.rz[i] = Rz;
      this.ux[i] = Ux; this.uy[i] = Uy; this.uz[i] = Uz;
    }
  }

  _idx(s) { return Math.max(0, Math.min(this.n - 1, Math.round((s - this.s0) / DS))); }

  /** interpolated frame at arc length s */
  frame(s, out = {}) {
    const f = (s - this.s0) / DS;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(f)));
    const k = Math.max(0, Math.min(1, f - i));
    const L = (a) => a[i] + (a[i + 1] - a[i]) * k;
    out.x = L(this.px); out.y = L(this.py); out.z = L(this.pz);
    out.tx = L(this.tx); out.ty = L(this.ty); out.tz = L(this.tz);
    out.rx = L(this.rx); out.ry = L(this.ry); out.rz = L(this.rz);
    out.ux = L(this.ux); out.uy = L(this.uy); out.uz = L(this.uz);
    out.yaw = L(this.yaw);
    out.bank = L(this.bank);
    return out;
  }

  /** world position for normalized lateral x and height h above the road (follows banking) */
  pos(s, xNorm = 0, h = 0, out = new THREE.Vector3()) {
    const f = this.frame(s, _f);
    const lat = xNorm * LANE;
    out.set(f.x + f.rx * lat + f.ux * h, f.y + f.ry * lat + f.uy * h, f.z + f.rz * lat + f.uz * h);
    return out;
  }
  /** world position for a lateral offset in world units with yaw-only frame (props stay upright) */
  propPos(s, lat, h = 0, out = new THREE.Vector3()) {
    const f = this.frame(s, _f);
    const c = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    // right vector in xz for yaw: (cos, 0, sin)
    out.set(f.x + c * lat, f.y + h, f.z + sn * lat);
    return out;
  }

  /** features active at s (object of type → feature) */
  featuresAt(s) {
    const o = {};
    for (const f of this.features) if (s >= f.s[0] && s < f.s[1]) o[f.type] = f;
    return o;
  }
  /** extra kart height for hop jumps */
  hopAt(s) {
    for (const f of this.features) {
      if (f.type === 'jump' && f.hop && s >= f.s[0] && s < f.s[1]) {
        const u = (s - f.s[0]) / (f.s[1] - f.s[0]);
        return f.hop * 4 * u * (1 - u);
      }
    }
    return 0;
  }
}

const _f = {};

function smoothArray(a, radius) {
  const n = a.length, out = new Float32Array(n);
  let acc = 0, cnt = 0;
  const w = radius;
  for (let i = 0; i < Math.min(n, w); i++) { acc += a[i]; cnt++; }
  for (let i = 0; i < n; i++) {
    if (i + w < n) { acc += a[i + w]; cnt++; }
    if (i - w - 1 >= 0) { acc -= a[i - w - 1]; cnt--; }
    out[i] = acc / cnt;
  }
  return out;
}
