// MediaPipe HandLandmarker → invisible steering wheel.
// Runs in its own requestVideoFrameCallback loop, independent of rendering.
import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const DEAD = 6, MAX = 40;

export const hands = {
  ready: false,
  error: null,
  video: null,
  landmarker: null,
  pts: [], // [{x,y}] palm centres (mirrored), sorted left→right
  lms: [], // raw mirrored landmark arrays for drawing
  angleDeg: 0,
  raw: 0,
  steer: 0,
  both: false,
  lastBoth: 0,
  boostGesture: false,
  _upSince: 0,
  detectMs: 0,
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
      const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: './vendor/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, opts('GPU'));
      } catch (e) {
        console.warn('GPU delegate failed, using CPU', e);
        this.landmarker = await HandLandmarker.createFromOptions(vision, opts('CPU'));
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
    this._lastVideoTime = v.currentTime;
    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(v, t0);
    this.detectMs = performance.now() - t0;
    const now = performance.now();
    const lms = (res.landmarks || []).map((hand) => hand.map((p) => ({ x: 1 - p.x, y: p.y }))); // mirror
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
      const deg = (ang * 180) / Math.PI;
      this.angleDeg = deg;
      const a = Math.abs(deg);
      this.raw = a < DEAD ? 0 : Math.sign(deg) * Math.min((a - DEAD) / (MAX - DEAD), 1);
      this.steer += (this.raw - this.steer) * 0.25;
      this.both = true;
      this.lastBoth = now;
      // boost gesture: both palms high in the frame for 200ms
      const high = L.y < 0.3 && R.y < 0.3;
      if (high) { if (!this._upSince) this._upSince = now; }
      else this._upSince = 0;
      this.boostGesture = !!this._upSince && now - this._upSince > 200;
    } else {
      this.both = false;
      this.boostGesture = false;
      this._upSince = 0;
    }
  },

  /** called every render frame: decay steer to 0 over ~300ms when hands are lost */
  tick(dt) {
    if (!this.ready) return;
    if (performance.now() - this.lastBoth > 120) {
      this.steer *= Math.exp(-dt / 0.1);
      if (Math.abs(this.steer) < 0.01) this.steer = 0;
      this.both = false;
    }
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
