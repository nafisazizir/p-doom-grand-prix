// Per-theme lighting/atmosphere for the v2 renderer. Themes may also define `look` themselves; that wins.
// sky: 'day' | 'sunset' | 'dusk' | 'night' | 'space' | 'indoor'
// env: HDRI slot from assets/v2/manifest.json used for image-based lighting + reflections.
// sun: elevation/azimuth in degrees (azimuth relative to the course's start direction), colour, intensity.
// ground/road: texture slots from the manifest + a tint.
//
// v3 atmosphere fields (render.js / sky.js; every one optional, defaults come from the sky type):
//   far:       { kind: 'hills'|'peaks'|'mesa'|'dunes', color, height }  layered hazy ridges on the horizon (null = none)
//   haze:      { color, gain, k, desat, sun, height, start }  aerial perspective: colour (default fog.color),
//              brightness gain, density multiplier on fog.density, desaturation, sun in-scatter, height falloff, clear radius
//   skyColors: { zenith, mid, band, glow, disc, cirrus }  day/sunset/dusk gradient sky (horizon = haze colour)
//   clouds:    { amount 0..1, lit, shade, shadeK, haze }  cumulus bank on the horizon (amount defaults from skyParams.clouds)
//   dome:      { aurora, band }  night/space dome extras
//   grade:     { sat, contrast, warm, vignette }  final colour grade
// Themes usually define sky/sun/fog/ground/road themselves; the v3 fields below survive the merge in lookFor().
export const LOOKS = {
  garage: {
    sky: 'sunset', env: 'sunset', exposure: 0.92,
    sun: { elev: 24, azim: 150, color: '#ffd9b0', intensity: 3.0 },
    skyParams: { turbidity: 4, rayleigh: 2.2, mie: 0.006, clouds: 0.45 },
    fog: { color: '#f3c7a0', density: 0.0022 },
    ground: { tex: 'grass', tint: '#9fd36f', scale: 6 }, road: { tex: 'asphalt', tint: '#9a96a8' },
    far: { kind: 'hills', color: '#5d86a8', height: 62 }, clouds: { amount: 0.85 },
  },
  chatbot: {
    sky: 'day', env: 'day', exposure: 1.0,
    sun: { elev: 50, azim: 140, color: '#fff3e6', intensity: 3.2 },
    skyParams: { turbidity: 2, rayleigh: 1.4, mie: 0.004, clouds: 0.55 },
    fog: { color: '#cfc4ff', density: 0.0018 },
    ground: { tex: 'concrete', tint: '#c9c0f0', scale: 8 }, road: { tex: 'asphalt', tint: '#8c86b0' },
    far: { kind: 'hills', color: '#7c7cc0', height: 52 }, clouds: { amount: 0.8 }, skyColors: { zenith: '#2a6ee0', mid: '#79b8f6' },
  },
  sydney: {
    sky: 'dusk', env: 'dusk', exposure: 1.05,
    sun: { elev: 10, azim: 120, color: '#ff9ec4', intensity: 2.6 },
    skyParams: { turbidity: 8, rayleigh: 3.5, mie: 0.01, clouds: 0.5 },
    fog: { color: '#ffb3d1', density: 0.0022 },
    ground: { tex: 'sand', tint: '#ffd2e4', scale: 8 }, road: { tex: 'planks', tint: '#ff9ccc' },
    far: { kind: 'hills', color: '#8e5c90', height: 46 }, clouds: { amount: 0.75 },
  },
  shoggoth: {
    sky: 'night', env: 'night', exposure: 1.15,
    sun: { elev: 35, azim: 120, color: '#b78cff', intensity: 1.4 },
    nightColors: { top: '#12052a', horizon: '#5a1a7a', nebula: '#ff3fd0' },
    fog: { color: '#3a1458', density: 0.006 },
    ground: { tex: 'grass', tint: '#3b6a4a', scale: 6 }, road: { tex: 'paving', tint: '#7d6a9a' },
    far: { kind: 'peaks', color: '#1c0c30', height: 85 }, dome: { aurora: 0.85 },
  },
  datacenter: {
    sky: 'indoor', env: 'industrial', exposure: 1.1,
    sun: { elev: 70, azim: 0, color: '#bfe8ff', intensity: 1.6 },
    nightColors: { top: '#020a12', horizon: '#06202c' },
    fog: { color: '#0a2430', density: 0.006 },
    ground: { tex: 'concrete', tint: '#5a6a72', scale: 6 }, road: { tex: 'tiles', tint: '#7a8c96' },
    haze: { color: '#0b3644', k: 0.9 },
  },
  'datacenter-fire': {
    sky: 'indoor', env: 'industrial', exposure: 1.1,
    sun: { elev: 60, azim: 40, color: '#ffae70', intensity: 1.8 },
    nightColors: { top: '#1a0402', horizon: '#5a1406' },
    fog: { color: '#4a1608', density: 0.007 },
    ground: { tex: 'concrete', tint: '#6a4a40', scale: 6 }, road: { tex: 'tiles', tint: '#8a6a60' },
    haze: { color: '#401408', k: 0.9 },
  },
  latent: {
    sky: 'space', env: 'night', exposure: 1.1,
    sun: { elev: 40, azim: -20, color: '#c8b8ff', intensity: 1.6 },
    nightColors: { top: '#05010f', horizon: '#3a0a5a', nebula: '#ff4fd8' },
    fog: { color: '#1a0830', density: 0.0012 },
    ground: { tex: 'concrete', tint: '#1a1030', scale: 8 }, road: { tex: 'rainbow' },
  },
  badlands: {
    sky: 'sunset', env: 'sunset', exposure: 1.0,
    sun: { elev: 16, azim: 120, color: '#ffbe80', intensity: 3.2 },
    skyParams: { turbidity: 7, rayleigh: 2.6, mie: 0.008, clouds: 0.3 },
    fog: { color: '#f0b080', density: 0.0018 },
    ground: { tex: 'sand', tint: '#e8b48a', scale: 7 }, road: { tex: 'asphalt', tint: '#a08a84' },
    far: { kind: 'mesa', color: '#b46c58', height: 78 }, clouds: { amount: 0.55 }, skyColors: { zenith: '#3a5cb0', mid: '#e79a86' },
  },
  paperclip: {
    sky: 'night', env: 'night', exposure: 1.15,
    sun: { elev: 40, azim: -80, color: '#9fb4ff', intensity: 1.3 },
    nightColors: { top: '#03061a', horizon: '#1c2a5a' },
    fog: { color: '#141c3a', density: 0.005 },
    ground: { tex: 'concrete', tint: '#4a5070', scale: 7 }, road: { tex: 'metalplate', tint: '#8a90a8' },
    far: { kind: 'hills', color: '#151b3a', height: 48 }, dome: { aurora: 0.45 },
  },
  stadium: {
    sky: 'night', env: 'stadium', exposure: 1.1,
    sun: { elev: 55, azim: 10, color: '#fff4e0', intensity: 2.4 },
    nightColors: { top: '#05061a', horizon: '#2a2050' },
    fog: { color: '#1a1838', density: 0.0035 },
    ground: { tex: 'grass', tint: '#4fa04a', scale: 5 }, road: { tex: 'asphalt', tint: '#c46a4a' },
    far: { kind: 'hills', color: '#12183a', height: 26 }, dome: { aurora: 0.3 },
  },
  takeoff: {
    sky: 'dusk', env: 'dusk', exposure: 1.05,
    sun: { elev: 8, azim: 30, color: '#ff8a5a', intensity: 3.0 },
    skyParams: { turbidity: 10, rayleigh: 4, mie: 0.012, clouds: 0.35 },
    fog: { color: '#d06a6a', density: 0.0016 },
    ground: { tex: 'dirt', tint: '#7a5050', scale: 7 }, road: { tex: 'metalplate', tint: '#9a8a90' },
    far: { kind: 'peaks', color: '#4a2f4c', height: 95 }, clouds: { amount: 0.6 },
  },
};

export function lookFor(theme) {
  return { ...(LOOKS[theme.id] || LOOKS.garage), ...(theme.look || {}) };
}
