// MediaPipe HandLandmarker → invisible steering wheel.
// Runs in its own requestVideoFrameCallback loop, independent of rendering.
// Detection runs in a Web Worker (src/hands-worker.js); falls back to the main thread if the worker can't start.

const DEAD = 4, MAX = 40;
const GRACE_MS = 250; // a hand vanishing for a frame or two keeps your last steering
const LEAD_MAX_MS = 45; // between detections, extrapolate the wheel angle at most this far past the last reading
const OUT_TAU = 0.02; // seconds: tiny render-rate smoothing that hides each new reading's small correction

// One Euro filter (Casiez et al.): smooths jitter when still, gets out of the way when moving.
// Tuned for degrees: ~0.5° of landmark jitter is invisible after the dead zone, so we lean hard towards
// low latency (high beta, quick derivative) instead of heavy smoothing.
class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.015, dCutoff = 1.0) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.x = null; this.dx = 0; this.t = 0; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, tMs) {
    if (this.x === null) { this.x = x; this.t = tMs; return x; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}
const angleFilter = new OneEuro(2.5, 0.06, 2.5);

/** wheel angle (deg) → steer ∈ [-1, 1]: soft dead zone that eases in, then near-linear to full lock at MAX */
function steerFromDeg(deg) {
  const u = Math.max(0, Math.min((Math.abs(deg) - DEAD) / (MAX - DEAD), 1));
  return Math.sign(deg) * u * (0.75 + 0.25 * u);
}

export const hands = {
  ready: false,
  error: null,
  video: null,
  landmarker: null, // only set on the main-thread fallback path
  backend: '', // 'worker/GPU' | 'worker/CPU' | 'main/GPU' | 'main/CPU'
  _worker: null,
  _workerReady: false,
  _inFlight: false,
  _sentAt: 0,
  pts: [], // [{x,y}] palm centres (mirrored), sorted left→right
  lms: [], // raw mirrored landmark arrays for drawing
  angleDeg: 0, // wheel angle as shown on screen (render-rate, latency-compensated once tick() runs)
  raw: 0,
  steer: 0,
  both: false,
  lastBoth: 0,
  boostGesture: false,
  _upSince: 0,
  detectMs: 0,
  target: 0, // steering for the latest reading (steer itself is recomputed every render frame)
  _angF: 0, // filtered angle at the last reading (deg)
  _angV: 0, // its rate of change (deg/s), used to extrapolate between readings
  _angT: 0, // when that reading arrived (performance.now ms); 0 = no reading yet
  _out: 0, // render-rate output angle
  _lastTick: -1e9,
  detectHz: 0,
  _detN: 0,
  _detT0: 0,
  _lastVideoTime: -1,

  async init() {
    if (this.ready || this._initing) return this._initing;
    this._initing = (async () => {
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      this.video = video;
      // Prefer a worker so the ~10-15 ms detectForVideo() call never blocks a render frame.
      try {
        await this._initWorker();
      } catch (e) {
        console.warn('hand-tracking worker unavailable, detecting on the main thread', e);
        this._killWorker();
        await this._initMain();
      }
      this.ready = true;
      this._loop();
    })();
    try {
      await this._initing;
    } catch (e) {
      this.error = e;
      this._initing = null;
      throw e;
    }
  },

  _initWorker() {
    return new Promise((resolve, reject) => {
      if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') { reject(new Error('no Worker/createImageBitmap')); return; }
      if (new URLSearchParams(location.search).has('handsmain')) { reject(new Error('?handsmain: worker disabled')); return; } // debug: force the main-thread path
      const w = new Worker(new URL('./hands-worker.js', import.meta.url), { type: 'module' });
      this._worker = w;
      const timer = setTimeout(() => reject(new Error('worker init timed out')), 20000);
      w.onerror = (ev) => {
        ev.preventDefault?.();
        const err = new Error('worker error: ' + (ev.message || 'failed to load'));
        if (!this._workerReady) { clearTimeout(timer); reject(err); }
        else this._workerFailed(err);
      };
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'ready') {
          clearTimeout(timer);
          this._workerReady = true;
          this.backend = 'worker/' + m.delegate;
          resolve();
        } else if (m.type === 'error') {
          clearTimeout(timer);
          reject(new Error(m.message));
        } else if (m.type === 'result') {
          this._inFlight = false;
          if (m.error) { if (!this._warned) { console.warn('hand detection failed in worker', m.error); this._warned = true; } return; }
          this.detectMs = m.detectMs;
          this._apply(m.landmarks, performance.now());
        }
      };
      w.postMessage({ type: 'init' });
    });
  },

  _killWorker() {
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    this._workerReady = false;
    this._inFlight = false;
  },

  // worker died after starting: switch to the main-thread path (the rVFC loop keeps running)
  async _workerFailed(err) {
    console.warn('hand-tracking worker failed, switching to main thread', err);
    this._killWorker();
    try { await this._initMain(); } catch (e) { this.error = e; }
  },

  async _initMain() {
    const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, opts('GPU'));
      this.backend = 'main/GPU';
    } catch (e) {
      console.warn('GPU delegate failed, using CPU', e);
      this.landmarker = await HandLandmarker.createFromOptions(vision, opts('CPU'));
      this.backend = 'main/CPU';
    }
  },

  _loop() {
    const v = this.video;
    const step = () => {
      try { this._detect(); } catch (e) { console.warn(e); }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  },

  _detect() {
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this._lastVideoTime) return;
    if (this._workerReady) {
      // at most one frame in flight: drop frames while the worker is busy
      const ts = performance.now();
      if (this._inFlight && ts - this._sentAt < 1000) return; // (watchdog: a lost reply can't stall us)
      this._lastVideoTime = v.currentTime;
      this._inFlight = true;
      this._sentAt = ts;
      const vw = v.videoWidth || 640, vh = v.videoHeight || 480;
      const w = this._worker;
      createImageBitmap(v, { resizeWidth: 480, resizeHeight: Math.round((480 * vh) / vw), resizeQuality: 'low' }).then(
        (bitmap) => {
          if (w !== this._worker) { bitmap.close(); return; } // worker was replaced meanwhile
          w.postMessage({ type: 'frame', bitmap, ts }, [bitmap]);
        },
        (e) => { this._inFlight = false; if (!this._warned) { console.warn('createImageBitmap failed', e); this._warned = true; } },
      );
      return;
    }
    if (!this.landmarker) return; // fallback still loading
    this._lastVideoTime = v.currentTime;
    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(v, t0);
    this.detectMs = performance.now() - t0;
    this._apply(res.landmarks, performance.now());
  },

  /** shared by both paths: raw (un-mirrored) landmarks → pts/lms/angle/steering */
  _apply(landmarks, now) {
    this._detN++;
    if (now - this._detT0 > 1000) { this.detectHz = (this._detN * 1000) / (now - this._detT0); this._detN = 0; this._detT0 = now; }
    const lms = (landmarks || []).map((hand) => hand.map((p) => ({ x: 1 - p.x, y: p.y }))); // mirror
    // palm centre = mean of 0,5,9,13,17
    const palms = lms.map((h) => {
      let x = 0, y = 0;
      for (const i of [0, 5, 9, 13, 17]) { x += h[i].x; y += h[i].y; }
      return { x: x / 5, y: y / 5 };
    });
    // sort by mirrored x: smaller = player's left hand (don't trust handedness labels)
    const order = palms.map((p, i) => i).sort((a, b) => palms[a].x - palms[b].x);
    this.pts = order.map((i) => palms[i]);
    this.lms = order.map((i) => lms[i]);
    if (this.pts.length >= 2) {
      const L = this.pts[0], R = this.pts[this.pts.length - 1];
      const ang = Math.atan2(R.y - L.y, R.x - L.x); // image y down: right hand lower → +angle → steer right
      const deg = angleFilter.filter((ang * 180) / Math.PI, now);
      // rate of the *filtered* angle: extrapolating with it between readings also claws back the filter's lag
      const dts = (now - this._angT) / 1000;
      if (this._angT && dts > 0 && dts < 0.2) this._angV += ((deg - this._angF) / dts - this._angV) * 0.6;
      else this._angV = 0;
      this._angF = deg;
      this._angT = now;
      this.target = steerFromDeg(deg);
      if (now - this._lastTick > 100) { this.angleDeg = this._out = deg; this.raw = this.target; } // no render tick (e.g. calibration)
      this.both = true;
      this.lastBoth = now;
      // boost gesture: both palms high in the frame for 200ms
      const high = L.y < 0.3 && R.y < 0.3;
      if (high) { if (!this._upSince) this._upSince = now; }
      else this._upSince = 0;
      this.boostGesture = !!this._upSince && now - this._upSince > 200;
    } else {
      // don't flip `both` here: tick() waits out the grace period so a one-frame dropout doesn't flash the warning
      this.boostGesture = false;
      this._upSince = 0;
    }
  },

  /** called every render frame: extrapolate the wheel angle between readings; ease back to straight when hands are lost */
  tick(dt, now = performance.now()) {
    if (!this.ready) return;
    this._lastTick = now;
    const lost = now - this.lastBoth > GRACE_MS;
    let goal;
    if (lost) {
      // hands really gone: ease back to straight
      this.target = 0;
      this.both = false;
      angleFilter.reset();
      this._angV = 0;
      this._angT = 0;
      goal = 0;
    } else {
      // detection runs at ~30 Hz; predict forward so the wheel moves every render frame instead of in steps
      const lead = Math.max(0, Math.min(now - this._angT, LEAD_MAX_MS)) / 1000;
      goal = this._angF + this._angV * lead;
    }
    this._out += (goal - this._out) * (1 - Math.exp(-dt / (lost ? 0.12 : OUT_TAU)));
    if (lost && Math.abs(this._out) < 0.1) this._out = 0;
    this.angleDeg = this._out;
    this.raw = this.steer = steerFromDeg(this._out);
  },

  /** draw mirrored webcam + skeleton + palm dots into a 2D canvas */
  draw(canvas, { showVideo = true } = {}) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if (showVideo && this.video && this.video.readyState >= 2) {
      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      // cover-fit
      const vw = this.video.videoWidth, vh = this.video.videoHeight;
      const s = Math.max(W / vw, H / vh);
      g.drawImage(this.video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      g.restore();
    } else {
      g.fillStyle = '#1a1030';
      g.fillRect(0, 0, W, H);
    }
    const vw = this.video?.videoWidth || 640, vh = this.video?.videoHeight || 480;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    const P = (p) => [ox + p.x * vw * s, oy + p.y * vh * s];
    const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
    this.lms.forEach((h, hi) => {
      g.strokeStyle = hi === 0 ? '#5affd0' : '#ff5ca8';
      g.lineWidth = Math.max(2, W / 160);
      g.beginPath();
      for (const [a, b] of BONES) { const [x1, y1] = P(h[a]); const [x2, y2] = P(h[b]); g.moveTo(x1, y1); g.lineTo(x2, y2); }
      g.stroke();
      g.fillStyle = '#ffffff';
      for (const p of h) { const [x, y] = P(p); g.fillRect(x - 2, y - 2, 4, 4); }
    });
    if (this.pts.length >= 2) {
      const [x1, y1] = P(this.pts[0]);
      const [x2, y2] = P(this.pts[this.pts.length - 1]);
      g.strokeStyle = '#ffd23f';
      g.lineWidth = Math.max(3, W / 100);
      g.setLineDash([10, 8]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.setLineDash([]);
      for (const [x, y] of [[x1, y1], [x2, y2]]) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, W / 40, 0, Math.PI * 2); g.fill(); }
    }
  },
};
