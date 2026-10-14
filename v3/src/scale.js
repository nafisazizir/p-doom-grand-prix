// v3 world scale, measured from 33 Mario Kart World stills (see PLAN-V3.md, "Measurements").
// Everything here is in world units. The road and the props keep v2's size; the karts shrink, so the
// road reads ~11 kart widths wide (MK: 10–11 on normal roads) and buildings tower over you like in MK.
//
// MK consensus (normal driving, 1456×819 frame): kart 218 px wide (15% of frame width), rear-wheel contact
// at y≈675 (82%), horizon at y≈240 (29%), kart+driver ≈ 1.15–1.3 kart widths tall. Solving the pinhole
// camera for a 58° vertical FOV: height ≈ 1.95 kart widths, rear wheels ≈ 3.0 kart widths ahead, pitch ≈ 13° down.

export const KART_SCALE = 0.5; // hero kart model is 3.38 wide → 1.69 world units
export const KART_W = 3.38 * KART_SCALE; // rear wheel-to-wheel width (the "kw" unit)
export const RIVAL_SCALE = 0.62; // rival models are smaller (2.6 wide) → about the same width as the hero

export const CAMERA = {
  fov: 58,
  height: 1.95 * KART_W, // above the road at the kart
  back: 3.0 * KART_W + 1.1 * KART_SCALE, // camera → kart centre along the track (rear wheels sit 1.1 model units behind centre)
  pitch: 13, // degrees down from the road plane
  ahead: 22, // aim point distance ahead of the kart (curves are anticipated)
  lat: 0.8, // how much the camera follows the kart sideways
  boostFov: 8, boostBack: 0.6 * KART_W, // MK pulls back + widens a little on boost
};

// gameplay item sizes relative to the kart (MK: coins ≈ 0.4–0.6 kh, item boxes ≈ 1–1.3 kh, glide rings ≈ 2 kw)
export const ITEM = {
  gpuScale: 0.82, // GPU card ≈ 1.6 world wide ≈ 0.95 kw (it's the "coin" you collect on the beat: big enough to read)
  gpuY: 0.95, // hover height of the card centre
  ringR: 1.75, // halo radius: ≈ 2 kw across, you drive through it
  ringY: 1.85,
  powerScale: 0.72,
  powerY: 1.15,
  hazardH: 0.8, // hazards keep their road-normalized width; heights tone down to ≈ 1 kart height
};
