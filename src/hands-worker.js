// Hand detection worker: runs MediaPipe HandLandmarker off the main thread.
// Protocol (main → worker):  {type:'init'}  |  {type:'frame', bitmap: ImageBitmap (transferred), ts: ms}
//           (worker → main):  {type:'ready', delegate}  |  {type:'error', message}
//                             {type:'result', landmarks: [[{x,y},…21], …], detectMs}  (raw, un-mirrored)
// Loading notes (tasks-vision 0.10.35): in a module worker `importScripts` throws a TypeError, so the
// bundle falls back to `import(loaderUrl)`. Only the *_module_internal.js loader (ESM, sets
// globalThis.ModuleFactory) works that way, hence forVisionTasks(..., useModule = true).
// GPU delegate uses an OffscreenCanvas WebGL2 context, which workers support.
import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

let landmarker = null;
let lastTs = -1;

async function init() {
  const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href, true);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    landmarker = await HandLandmarker.createFromOptions(vision, opts('GPU'));
    return 'GPU';
  } catch (e) {
    console.warn('[hands-worker] GPU delegate failed, using CPU', e);
    landmarker = await HandLandmarker.createFromOptions(vision, opts('CPU'));
    return 'CPU';
  }
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const delegate = await init();
      self.postMessage({ type: 'ready', delegate });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err?.message || err) });
    }
  } else if (m.type === 'frame') {
    const bitmap = m.bitmap;
    try {
      // VIDEO mode needs strictly increasing timestamps
      const ts = Math.max(m.ts, lastTs + 1);
      lastTs = ts;
      const t0 = performance.now();
      const res = landmarker.detectForVideo(bitmap, ts);
      const detectMs = performance.now() - t0;
      const landmarks = (res.landmarks || []).map((hand) => hand.map((p) => ({ x: p.x, y: p.y })));
      self.postMessage({ type: 'result', landmarks, detectMs });
    } catch (err) {
      self.postMessage({ type: 'result', landmarks: null, detectMs: 0, error: String(err?.message || err) });
    } finally {
      bitmap.close();
    }
  }
};
