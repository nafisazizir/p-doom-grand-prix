// Boot + state machine (TITLE → CALIBRATE → COUNTDOWN → RACE → RESULTS) + the game rules.
import * as THREE from 'three';
import { Renderer } from './render.js';
import { loadManifest, getManifest, ROOT } from './textures.js';
import { preloadModels } from './models.js';
import { Rivals } from './rivals.js';
import { audio, sfx, setKey } from '../../src/audio.js';
import { clock } from '../../src/clock.js';
import { loadData, buildLevel, sectionAt } from '../../src/beatmap.js';
import { Track, SPEED, LANE, ROAD_HALF } from './track.js';
import { Kart } from './kart.js';
import { Entities, POWER_NAMES, POWER_DESC } from './entities.js';
import { Particles, Smoke } from './particles.js';
import { input } from '../../src/input.js';
import { hands } from '../../src/hands.js';
import { hud } from './hud.js';
import { HAZARDS } from './hazards.js';
import { THEMES, getTheme } from './themes/index.js';
import { debug } from '../../src/debug.js';
import { clamp, lerp } from './toolkit.js';
import { CAMERA, KART_W, KART_SCALE, ITEM } from './scale.js';

// ---------------- tuning ----------------
// P(doom) = sigmoid(doomX). doomX starts at 0 (= 0.50) and is unbounded, so the meter eases towards 0/1.
// Near 0.50 one GPU ≈ −0.004 and one miss ≈ +0.006, as in the spec. Tuned by simulation:
// Simulated finals: 97% accuracy ≈ 0.04, 90% ≈ 0.10, 80% ≈ 0.33, 65% ≈ 0.79, 50% ≈ 0.97 (boost doubles GPUs, not doom).
export const TUNE = {
  start: 0,
  collect: -0.017,
  miss: 0.018,
  hazard: 0.12,
  drift: 0.01, // P(doom) creeps up by itself every second: the world keeps scaling
  chain: -0.15,
  flawless: -0.25,
  nearMissGpu: 1,
  hitNote: 0.2, // lateral hit window (normalized)
  hitRing: 0.3, // halos are big now: fly through anywhere inside
  hitPower: 0.28,
  kartHalf: 0.1, // added to hazard half-width
  nearMiss: 0.25,
  lateral: 2 / 0.6, // full lock crosses the road in 0.6 s
  boostTime: 2,
  chainBoostTime: 4,
  boostCooldown: 4,
};

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------- globals ----------------
let R, renderer, scene, camera, track, kart, particles, ents, rivals, smoke;
let bm, sections, level;
let mode = 'LOADING';
let paused = false;
let lastFrame = performance.now();
const QUALITIES = ['low', 'med', 'high', 'ultra'];
let quality = params.get('quality') || 'high';
let lowFpsTime = 0;
const camState = { x: 0, y: 3, z: 0, fov: 70, shake: 0, back: 7.5, height: 3.4 };

const G = (globalThis.GAME = {
  doomX: TUNE.start, pDoom: 0.5, gpus: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, hazardsHit: 0, ringsHit: 0, chains: 0, flawless: 0, nearMisses: 0, shieldsUsed: 0,
  kartX: 0, kartVel: 0, bounceV: 0, steer: 0, songTime: 0, prevTime: 0,
  boostUntil: -1, boostStart: -9, boostCooldownUntil: -1,
  power: null, powerUntil: 0, powerStart: 0,
  spinUntil: -1, hurtUntil: -1,
  sectionIdx: -1, sectionMisses: 0,
  tier: 0, cooked: false, god: false, launchAt: Infinity, launched: false, finished: false,
  cursors: { note: 0, hazard: 0, ring: 0, power: 0 },
  chainProgress: new Map(),
  bonus: [], // compute-rain + hallucination items
  webcam: false,
  fx: null,
});

// ---------------- boot ----------------
/** Rasterize every emoji / symbol the scenery uses once at boot: the first canvas draw of such a glyph makes Chrome
 *  load a fallback font (~50–150 ms), which used to land mid-race when a theme's props first spawned. */
async function prewarmGlyphs() {
  const files = ['themes/garage.js', 'themes/chatbot.js', 'themes/shoggoth.js', 'themes/datacenter.js', 'themes/latent.js', 'themes/badlands.js',
    'themes/paperclip.js', 'themes/stadium.js', 'themes/takeoff.js', 'hazards.js', 'entities.js', 'rivals.js', 'track.js'];
  try {
    const texts = await Promise.all(files.map((f) => fetch(new URL('./' + f, import.meta.url)).then((r) => r.text()).catch(() => '')));
    const chars = [...new Set([...texts.join('')].filter((ch) => ch.codePointAt(0) > 0x2000))].join('');
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 64;
    const g = c.getContext('2d');
    for (const w of [500, 600, 700]) for (let i = 0; i < chars.length; i += 40) { g.font = `${w} 40px Fredoka, 'Baloo 2', sans-serif`; g.fillText(chars.slice(i, i + 40), 0, 48); }
  } catch { /* best effort */ }
}

async function boot() {
  hud.init();
  input.init();
  input.onKey = onKey;
  const msg = $('loading-msg');
  try {
    msg.textContent = 'loading fonts…';
    await Promise.race([document.fonts.load("700 40px 'Fredoka'"), new Promise((r) => setTimeout(r, 1500))]);
    msg.textContent = 'decoding the song…';
    await audio.init('../assets/song.mp3');
    msg.textContent = 'reading the beatmap…';
    ({ bm, sections } = await loadData());
    window.__bootStep = 'key'; setKey(bm.pentatonic ? bm.pentatonic + ' major' : bm.key);
    window.__bootStep = 'lyrics'; await hud.loadLyrics('../assets/lyrics.lrc');
    msg.textContent = 'loading textures + skies…';
    await loadManifest(); window.__bootStep = 'lyrics-done';
  } catch (e) {
    msg.textContent = 'boot failed: ' + e.message + ' (are you serving with python3 -m http.server?)';
    throw e;
  }
  window.__bootStep = "renderer"; setupRenderer(); window.__bootStep = "envs";
  await Promise.all([R.loadEnvs(getManifest(), ROOT), preloadModels(Object.assign({}, ...Object.values(THEMES).map((t) => t.models || {})))]);
  window.__bootStep = "glyphs"; await prewarmGlyphs();
  window.__bootStep = "track";
  track = new Track(scene, sections, R);
  kart = new Kart(scene);
  rivals = new Rivals(scene, track);
  globalThis.__dbg = { get camera() { return camera; }, get kart() { return kart; }, get track() { return track; }, get rivals() { return rivals; }, CAM, measure, propSizes, THREE, get photo() { return photo; } };
  particles = new Particles(scene);
  smoke = new Smoke(scene);
  globalThis.__fx = { particles, smoke }; // effects debugging (CDP tests)
  level = v2Level(buildLevel(bm, structuredClone(sections), THEMES));
  ents = new Entities(scene, track, level);
  window.__bootStep = "debug"; debug.init({ getInfo: debugInfo, setSfx: (v) => audio.setSfxVolume(v) });
  window.__bootStep = "screens"; setupScreens(); window.__bootStep = "done";
  requestAnimationFrame(frame);
  const sp = params.get('section');
  track.prewarm(sp ? sections[clamp(parseInt(sp, 10) - 1, 0, sections.length - 1)].start * SPEED : 0);

  const startSec = params.get('section');
  if (startSec) {
    // dev shortcut: straight into a section with the keyboard
    const i = clamp(parseInt(startSec, 10) - 1, 0, sections.length - 1);
    startRace({ webcam: false, from: sections[i].start + 0.06, countdown: false });
  } else {
    showScreen('title');
    mode = 'TITLE';
  }
}

function setupRenderer() {
  R = new Renderer($('game'), quality);
  renderer = R.renderer;
  scene = R.scene;
  camera = R.camera;
}

// ---------------- screens ----------------
const SCREENS = ['loading', 'title', 'calibrate', 'countdown', 'results', 'paused'];
function showScreen(name) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
}
function setupScreens() {
  $('btn-webcam').onclick = () => { ensureAudio(); goCalibrate(); };
  $('btn-keyboard').onclick = () => { ensureAudio(); startRace({ webcam: false }); };
  $('btn-skip').onclick = () => { calibrating = false; startRace({ webcam: false }); };
  $('btn-retrain').onclick = () => { ensureAudio(); startRace({ webcam: G.webcam }); };
  $('btn-menu').onclick = () => toTitle();
  $('btn-pause').onclick = (e) => { e.currentTarget.blur(); togglePause(); };
  setRacingUI(false);
}
function ensureAudio() { if (audio.ctx.state === 'suspended') audio.ctx.resume(); }

function toTitle() {
  audio.stop();
  audio.pausedAt = 0;
  mode = 'TITLE';
  paused = false;
  setRacingUI(false);
  document.body.classList.remove('paused', 'photo');
  hud.show(false);
  hud.clearSplats();
  hud.setGold(false);
  hud.el.redwash.style.opacity = '0';
  showScreen('title');
  resetWorld(0);
}

// ---------------- calibration ----------------
let calibrating = false, calHold = 0;
async function goCalibrate() {
  mode = 'CALIBRATE';
  showScreen('calibrate');
  calibrating = true;
  calHold = 0;
  $('cal-status').textContent = 'Starting the webcam… (allow camera access)';
  try {
    await hands.init();
    $('cal-status').textContent = 'Show both hands to the camera…';
  } catch (e) {
    console.error(e);
    $('cal-status').textContent = 'No webcam (' + (e.name || e.message) + '). Use keyboard →';
  }
}
function updateCalibrate(dt) {
  if (!calibrating) return;
  const cv = $('cal-canvas');
  if (hands.ready) hands.draw(cv);
  const fill = $('cal-ring-fill');
  if (!hands.ready) return;
  const level = hands.both && Math.abs(hands.angleDeg) < 6;
  if (hands.both && !level) $('cal-status').textContent = `Level the wheel! (tilt ${hands.angleDeg.toFixed(0)}°)`;
  else if (!hands.both) $('cal-status').textContent = 'Show BOTH hands, like holding a steering wheel 🖐️ 🖐️';
  else $('cal-status').textContent = 'Hold it… nice and level…';
  calHold = level ? calHold + dt : Math.max(0, calHold - dt * 2);
  fill.style.strokeDashoffset = String(276.5 * (1 - Math.min(1, calHold)));
  if (calHold >= 1) {
    calibrating = false;
    sfx.play('powerup');
    startRace({ webcam: true });
  }
}

// ---------------- race lifecycle ----------------
function resetGame() {
  Object.assign(G, {
    doomX: TUNE.start, pDoom: 0.5, gpus: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, hazardsHit: 0, ringsHit: 0, chains: 0, flawless: 0, nearMisses: 0, shieldsUsed: 0,
    kartX: 0, kartVel: 0, bounceV: 0, steer: 0, boostUntil: -1, boostStart: -9, boostCooldownUntil: -1,
    power: null, powerUntil: 0, spinUntil: -1, hurtUntil: -1, sectionIdx: -1, sectionMisses: 0, tier: 0, cooked: false,
    launchAt: Infinity, launched: false, finished: false, bonus: [], lastAgiLine: -99, sectionEnteredAt: 0, sluggishUntil: 0, missStreak: 0, glideSaid: false,
  });
  G.chainProgress = new Map();
  input.invertUntil = input.freezeUntil = input.wobbleUntil = 0;
  hud.clearSplats();
  hud.setTier('');
  hud.setGold(false);
  hud.setPower(null);
  $('stage').classList.remove('wavy', 'inverted', 'deprecated');
  hud.assistant(null);
  assistUntil = 0;
}

function resetWorld(t) {
  // fresh deterministic level so item states are clean
  if (ents) ents.reset(1e9);
  level = v2Level(buildLevel(bm, structuredClone(sections), THEMES));
  ents = new Entities(scene, track, level);
  seekCursors(t);
  ents.reset(t);
  track.reset(t * SPEED);
  camState.snap = true;
  particles.clear();
  smoke?.clear();
  clock.reset(t);
  G.songTime = G.prevTime = t;
  const lastNote = level.notes[level.notes.length - 1];
  G.launchAt = Math.min(audio.duration - 4, (lastNote ? lastNote.t : audio.duration) + 0.7);
}

const V2_HAZARDS = ['context', 'datawall', 'deprecated', 'tax'];
function v2Level(lv) {
  lv.hazards.forEach((h, i) => { if (i % 4 === 2) h.type = V2_HAZARDS[(i >> 2) % V2_HAZARDS.length]; });
  return lv;
}

function seekCursors(t) {
  const first = (arr) => { let i = 0; while (i < arr.length && arr[i].t < t) { arr[i].done = true; i++; } return i; };
  G.cursors = { note: first(level.notes), hazard: first(level.hazards), ring: first(level.rings), power: first(level.powerups) };
}

let countdownT = 0, countdownStep = -1, raceFrom = 0;
function startRace({ webcam = false, from = 0, countdown = true } = {}) {
  G.webcam = webcam;
  input.webcam = webcam;
  resetGame();
  audio.stop();
  audio.pausedAt = from;
  resetWorld(from);
  hud.show(true);
  hud.showPip(webcam);
  hud.showKbdHint(!webcam);
  paused = false;
  raceFrom = from;
  if (countdown) {
    mode = 'COUNTDOWN';
    countdownT = 0;
    countdownStep = -1;
    showScreen('countdown');
  } else {
    showScreen(null);
    beginRace(from);
  }
}
let raceStartWall = 0;
function beginRace(from) {
  mode = 'RACE';
  raceStartWall = performance.now();
  lowFpsTime = 0;
  setRacingUI(true);
  const hint = $('kbd-hint');
  hint.classList.remove('faded');
  clearTimeout(beginRace._h);
  beginRace._h = setTimeout(() => hint.classList.add('faded'), 8000);
  showScreen(null);
  audio.play(from);
  clock.reset(from);
}

const COUNT = [['3', 'Loading weights'], ['2', 'Ignoring safety team'], ['1', 'SHIP IT'], ['GO!', 'save humanity']];
function updateCountdown(dt) {
  countdownT += dt;
  const step = Math.floor(countdownT / 0.75);
  if (step !== countdownStep && step < COUNT.length) {
    countdownStep = step;
    $('count-num').textContent = COUNT[step][0];
    $('count-gag').textContent = COUNT[step][1];
    const n = $('count-num');
    n.classList.remove('count-pop'); void n.offsetWidth; n.classList.add('count-pop');
    sfx.play(step === 3 ? 'go' : 'tick');
  }
  if (countdownT >= 0.75 * 3.4) beginRace(raceFrom);
}

function jumpToSection(i) {
  if (mode !== 'RACE' && mode !== 'COUNTDOWN') return;
  i = clamp(i, 0, sections.length - 1);
  const t = sections[i].start + 0.06; // audio starts 50 ms after scheduling
  const keepWebcam = G.webcam;
  resetGame();
  G.webcam = keepWebcam;
  audio.stop();
  resetWorld(t);
  hud.clearSplats();
  beginRace(t);
}

function togglePause() {
  if (mode !== 'RACE') return;
  if (!paused) {
    audio.pause(clock.now());
    paused = true;
    showScreen('paused');
    document.body.classList.add('paused');
    startPhoto();
  } else {
    paused = false;
    showScreen(null);
    document.body.classList.remove('paused', 'photo');
    audio.play(audio.pausedAt);
    clock.reset(audio.pausedAt);
  }
}
function setRacingUI(on) { $('btn-pause').style.display = on ? '' : 'none'; }

function rivalLine() {
  const p = rivals?.place || 1;
  const suf = p === 1 ? 'st' : p === 2 ? 'nd' : p === 3 ? 'rd' : 'th';
  if (p === 1) return '1st (the other labs are "reviewing the results")';
  const ahead = rivals.list.filter((r) => r.off > 0).map((r) => r.def.name);
  return `${p}${suf}, behind ${ahead.join(' & ')}`;
}

function finish() {
  if (G.finished) return;
  G.finished = true;
  mode = 'RESULTS';
  setRacingUI(false);
  document.body.classList.remove('paused', 'photo');
  audio.stop();
  hud.show(false);
  hud.setGold(false);
  hud.el.redwash.style.opacity = '0';
  $('stage').classList.remove('wavy', 'inverted');
  const p = G.pDoom;
  $('res-pdoom').textContent = p.toFixed(2);
  let verdict;
  if (p < 0.2) verdict = 'ALIGNED. Humanity thanks you. Please rate this conversation 👍';
  else if (p < 0.5) verdict = 'Mostly aligned. Some side effects may occur.';
  else if (p < 0.8) verdict = 'Concerning. A strongly worded open letter has been drafted.';
  else verdict = "DOOM. You're absolutely right!";
  $('res-verdict').textContent = verdict;
  const total = level.notes.length;
  const acc = total ? G.hits / total : 0;
  const rows = [
    ['Driver', 'Claude (kart-constitutional edition)'],
    ['Final position', rivalLine()],
    ['GPUs acquired', G.gpus],
    ['Max combo', 'x' + G.maxCombo],
    ['Accuracy', (acc * 100).toFixed(0) + '%'],
    ['Halos (alignment points)', G.ringsHit + (G.chains ? ` · ${G.chains} chain${G.chains > 1 ? 's' : ''}` : '')],
    ['Hazards hit', G.hazardsHit],
    ['Hallucination rate', G.hazardsHit > 6 ? 'yes' : G.hazardsHit > 2 ? 'sometimes' : 'only on Tuesdays'],
    ['Parameters', (G.gpus * 1.7).toFixed(0) + 'B (vibes)'],
    ['Intended use', autopilot ? 'autopilot (fully unsupervised)' : G.webcam ? 'flailing at a webcam' : 'pressing arrow keys'],
    ['Safety eval', p < 0.2 ? 'passed (we checked)' : p < 0.5 ? 'passed (we skimmed)' : 'skipped (ship date)'],
  ];
  $('res-card').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  showScreen('results');
  if (p < 0.5) sfx.play('fanfare');
  else sfx.play('trombone');
  if (p >= 0.8) {
    for (let i = 0; i < 14; i++) setTimeout(() => { hud.splat("You're absolutely right!", 0); sfx.play('splat'); }, 300 + i * 140);
  }
}

// ---------------- gag effects (used by hazards) ----------------
G.fx = {
  shake: (a = 1) => { camState.shake = Math.max(camState.shake, a); },
  splat: () => { hud.splat(); sfx.play('splat'); },
  wobble: (s) => { input.wobbleUntil = G.songTime + s; },
  invert: (s) => {
    input.invertUntil = G.songTime + s;
    hud.banner('PROMPT INJECTED');
    $('stage').classList.add('inverted');
    setTimeout(() => $('stage').classList.remove('inverted'), s * 1000);
  },
  wavy: (s) => {
    $('stage').classList.add('wavy');
    setTimeout(() => $('stage').classList.remove('wavy'), s * 1000);
    spawnFakeGPUs();
  },
  bounce: () => { G.bounceV = (G.kartX >= 0 ? -1 : 1) * 4; camState.shake = 0.7; },
  freeze: (s) => { input.freezeUntil = G.songTime + s; input.frozenSteer = 0; hud.stamp('Thinking…'); },
  sluggish: (s) => { G.sluggishUntil = G.songTime + s; hud.stamp('CONTEXT FULL'); },
  deprecate: (s) => {
    $('stage').classList.add('deprecated');
    hud.banner('MODEL DEPRECATED');
    setTimeout(() => $('stage').classList.remove('deprecated'), s * 1000);
  },
  tax: (frac) => {
    const n = Math.max(1, Math.round(G.gpus * frac));
    G.gpus = Math.max(0, G.gpus - n);
    hud.stamp(`−${n} GPUs (ALIGNMENT TAX)`);
  },
};

function spawnFakeGPUs() {
  // hallucinated GPUs: they look real, then vanish when touched
  const bl = level.beatLen;
  for (let k = 0; k < 4; k++) {
    const t = G.songTime + 1.2 + k * bl * 0.5;
    const it = { t, x: clamp(G.kartX + (k % 2 ? 0.45 : -0.45), -0.85, 0.85), fake: true, kind: 'gpu' };
    G.bonus.push(it);
    ents.addItem(it, 'gpu');
  }
}
function computeRain() {
  const bl = level.beatLen;
  const next = level.beats.find((b) => b > G.songTime + 1.0) ?? G.songTime + 1;
  for (let k = 0; k < 3; k++) {
    for (const x of [-0.75, -0.25, 0.25, 0.75]) {
      const it = { t: next + k * bl, x, rain: true, kind: 'gpu' };
      G.bonus.push(it);
      ents.addItem(it, 'gpu');
    }
  }
}

// ---------------- scoring helpers ----------------
// karaoke hype words shake the world a little
window.addEventListener('karaoke-hype', (e) => {
  if (mode !== 'RACE' || paused) return;
  if (e.detail === 'pdoom') {
    camState.shake = Math.max(camState.shake, 0.45);
    const el = $('pdoom');
    el.classList.remove('pulse-up'); void el.offsetWidth; el.classList.add('pulse-up');
  } else if (e.detail === 'boom') {
    camState.shake = Math.max(camState.shake, 1.1);
    hud.flash(0.35, 220);
  } else if (e.detail === 'foom') {
    camState.shake = Math.max(camState.shake, 0.6);
  }
});

function addDoom(d) {
  if (G.god) return;
  const before = G.pDoom;
  G.doomX = clamp(G.doomX + d, -8, 8);
  G.pDoom = 1 / (1 + Math.exp(-G.doomX));
  if (before <= 0.8 && G.pDoom > 0.8 && !G.cooked) {
    G.cooked = true;
    hud.announce('WE ARE SO COOKED');
    assist('doom', true);
    sfx.play('alarm');
  }
  if (G.pDoom < 0.7) G.cooked = false;
}
const tmpV = new THREE.Vector3();
function screenOf(zf, x, y) {
  track.worldPos(zf, x, y, tmpV);
  tmpV.project(camera);
  return [(tmpV.x + 1) / 2 * innerWidth, (1 - tmpV.y) / 2 * innerHeight];
}
/** the kart's world velocity at track distance zf (× k): bursts ride along with you instead of hitting the camera */
const fxVel = new THREE.Vector3(), fxFr = {}, fxA = new THREE.Vector3(), fxB = new THREE.Vector3();
function kartVel(zf, k = 1) {
  const f = track.course.frame(zf, fxFr);
  return fxVel.set(f.tx * SPEED * k, f.ty * SPEED * k, f.tz * SPEED * k);
}
function boosting(t) { return t < G.boostUntil; }
function startBoost(t, dur, line = true) {
  if (!boosting(t) && line && t - (G.lastAgiLine ?? -99) > 10) { hud.announce('FEEL THE AGI!', 1300); G.lastAgiLine = t; }
  G.boostStart = t;
  G.boostUntil = Math.max(G.boostUntil, t + dur);
  sfx.play('boost');
  camState.shake = Math.max(camState.shake, 0.3);
}
function gpuValue(t) {
  let v = 1;
  if (boosting(t)) v *= 2;
  if (G.power === 'scale' && t < G.powerUntil) v *= 3;
  return v;
}

const TIERS = [
  [10, 'TOKENS PER SECOND: YES', 'sparkle trail unlocked'],
  [25, 'HUMANITY IS SO BACK', 'rainbow trail unlocked'],
  [50, 'SUPERINTELLIGENT DRIVING', 'sunglasses: equipped 😎'],
];

function collect(n, t) {
  n.state = 'got';
  n.stateT = 0;
  const zf = n.t * SPEED;
  const [sx, sy] = screenOf(zf, n.flyX ?? n.x, 1.6);
  if (n.fake) {
    hud.popup('NOT REAL', sx, sy, 'red');
    particles.burst(track.worldPos(zf, n.x, ITEM.gpuY, tmpV), ['#c86bff', '#e6c8ff'], 8, { kind: 'glow', speed: 2.2, up: 0.6, size: 0.5, life: 0.45, grav: -1, drag: 3, carry: kartVel(zf, 0.95) });
    sfx.play('wah');
    return;
  }
  const v = gpuValue(t) * (n.rain ? 1 : 1);
  G.gpus += v;
  G.combo++;
  G.missStreak = 0;
  G.hits += n.rain ? 0 : 1;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  addDoom(TUNE.collect);
  sfx.play('pickup', { step: G.combo - 1 });
  hud.popupCount(v, 'GPU', sx, sy, v > 1 ? 'gold' : '');
  {
    const p = track.worldPos(G.songTime * SPEED, n.flyX ?? n.x, ITEM.gpuY, tmpV), kv = kartVel(zf, 0.97);
    particles.burst(p, ['#7cffb0', '#ffe680', '#ffffff'], 9, { kind: 'star', speed: 3.2, up: 1.4, size: 0.42, life: 0.5, grav: -5, drag: 2.6, carry: kv });
    particles.spawn(p, kv, '#9dffc4', { kind: 'glow', size: 1.3, end: 1.7, life: 0.2, grav: 0, drag: 0, hdr: 1.4, alpha: 0.7, base: kv });
  }
  // combo tiers
  for (let i = 0; i < TIERS.length; i++) {
    if (G.combo === TIERS[i][0]) {
      G.tier = Math.max(G.tier, i + 1);
      hud.announce(TIERS[i][1]);
      hud.setTier(TIERS[i][2]);
      sfx.play('tier');
      if (i === 2) hud.setGold(true);
      assist('combo', true);
    }
  }
}
function miss(n) {
  n.state = 'missed';
  n.stateT = 0;
  if (n.fake || n.rain) return;
  G.misses++;
  G.sectionMisses++;
  if (G.combo >= 10) hud.announce(['COMBO LOST', 'SKILL ISSUE', 'MODEL COLLAPSE'][G.misses % 3], 1200);
  G.combo = 0;
  G.tier = 0;
  hud.setTier('');
  hud.setGold(false);
  addDoom(TUNE.miss);
  G.missStreak = (G.missStreak || 0) + 1;
  if (G.missStreak === 4) assist('misses');
  sfx.play('miss');
}

// ---------------- the AI driving assistant (a chat bubble that never shuts up) ----------------
const ASSIST = {
  start: ["Hi! I'm your AI driving assistant. Today's driver: Claude. I'd have picked me, but okay.", 'Tip: drive through the GPUs. I have read 4 million tips like this.'],
  crash: ['Claude: "I apologize for the confusion."', 'It looks like you crashed. Want me to summarize the crash?', 'Claude: "You\'re absolutely right, I should not have hit that."', "Great crash! Shall I turn it into a slide deck?", "I've drafted an apology on your behalf.", "As an AI I can't feel pain, but that looked expensive.", "You're absolutely right to have hit that."],
  combo: ["You're on fire! (not literally, that's track 10)", "Incredible! I've added this to your performance review.", 'Wow. Have you considered a career in GPU acquisition?'],
  misses: ['I noticed you missed a few GPUs. Have you tried wanting them more?', 'Tip: the GPUs are the shiny green ones.', 'Missing GPUs is a valid strategy (for the other lab).'],
  near: ["That was close! I've filed a safety report nobody will read.", 'Nice dodge. I would have done the same, if I had a body.'],
  power: ["Ooh, a power-up! I'd explain it but my context window is full.", 'Power-up acquired. Please rate this power-up 👍👎'],
  doom: ["I'm sure it's fine 🙂", 'Would you like some tips on bunker construction?', 'P(doom) is just a number. A very large number.'],
  glide: ['Wings deployed! These are definitely load-bearing.', 'We are now gliding. I have no idea how.'],
  garage: ['Welcome to the garage. Two founders, one GPU, zero safety team.'],
  chatbot: ["Remember: I'm always absolutely right."],
  shoggoth: ["Don't look behind the mask. 🙂"],
  datacenter: ['Fun fact: this tunnel uses more power than a small country.'],
  sydney: ["Please don't make eye contact with Sydney."],
  latent: ["We're in latent space now. Everything is a vector, including you."],
  badlands: ['Heads up: sharp left turn ahead. Capabilities only.'],
  paperclip: ["I've optimized this section for paperclips. You're welcome."],
  'datacenter-fire': ['This is fine. I have checked. It is fine.'],
  stadium: ["You're being evaluated on a benchmark I wrote. Good luck!"],
  takeoff: ['Recursive self-improvement enabled. Hold on to something.'],
};
let assistUntil = 0, assistIdx = 0;
function assist(kind, force = false) {
  const t = G.songTime;
  if (!force && t < assistUntil) return;
  const list = ASSIST[kind];
  if (!list) return;
  hud.assistant(list[assistIdx++ % list.length]);
  assistUntil = t + 6;
}

function hitHazard(h, t) {
  const def = HAZARDS[h.type] || HAZARDS.oom;
  const [sx, sy] = screenOf(h.t * SPEED, h.x, 2);
  if (G.power === 'shield') {
    h.state = 'blocked';
    h.stateT = 0;
    G.power = null;
    G.shieldsUsed++;
    hud.setPower(null);
    hud.stamp('BLOCKED BY SAFETY TEAM');
    sfx.play('clang');
    {
      const p = track.worldPos(h.t * SPEED, G.kartX, 1.1, tmpV), kv = kartVel(h.t * SPEED, 0.95);
      particles.burst(p, ['#5affd0', '#c8fff0', '#ffffff'], 16, { kind: 'star', speed: 4.5, up: 1.2, size: 0.45, life: 0.5, grav: -3, drag: 2.5, carry: kv });
      particles.spawn(p, kv, '#5affd0', { kind: 'glow', size: 2.6, end: 1.5, life: 0.25, grav: 0, drag: 0, hdr: 1.3, alpha: 0.6, base: kv });
    }
    return;
  }
  h.state = 'hit';
  h.stateT = 0;
  G.hazardsHit++;
  G.combo = 0;
  G.tier = 0;
  hud.setTier('');
  hud.setGold(false);
  G.spinUntil = t + 0.6;
  G.hurtUntil = t + 0.9;
  addDoom(TUNE.hazard);
  camState.shake = Math.max(camState.shake, 1);
  sfx.play('bonk');
  audio.duck(-3, 150);
  const generic = ["THAT'S A HALLUCINATION", 'SKILL ISSUE', 'MISALIGNED!!'];
  const pool = [...(def.lines || []), ...generic];
  hud.announce(pool[(G.hazardsHit * 7) % pool.length], 1500);
  hud.popup('+0.03 P(DOOM)', sx, sy, 'red');
  {
    // impact at the kart's nose: glowing shards + a few hot streaks + a soft grey puff
    const p = track.worldPos(h.t * SPEED, clamp(G.kartX, h.x - h.w / 2, h.x + h.w / 2), 0.9, tmpV), kv = kartVel(h.t * SPEED, 0.9);
    if (def.splash) {
      // puddles splash: glossy droplets + a soft coloured mist, no flying debris
      particles.burst(p, def.splash, 18, { kind: 'glow', speed: 4.5, up: 4, size: 0.32, life: 0.6, grav: -16, drag: 1, hdr: 1.8, carry: kv });
      smoke.puff(p, def.splash[1], 5, { speed: 2, size: 1.3, grow: 1.5, alpha: 0.25, life: 0.7, up: 0.8, carry: kartVel(h.t * SPEED, 0.88) });
    } else particles.burst(p, ['#ff5c7a', '#ffd23f', '#ffffff', '#7fd4ff'], 14, { kind: 'shard', speed: 6, up: 3, size: 0.4, life: 0.7, grav: -14, drag: 1.4, hdr: 1.5, carry: kv });
    particles.burst(p, ['#ffd27a', '#ffffff'], 10, { kind: 'streak', speed: 8, up: 2, size: 0.13, life: 0.35, grav: -8, drag: 2, carry: kv });
    particles.spawn(p, kv, '#ffd9a0', { kind: 'glow', size: 2.4, end: 1.4, life: 0.18, grav: 0, drag: 0, hdr: 1.4, alpha: 0.8, base: kv });
    smoke.puff(p, '#a49eaa', 6, { speed: 2, size: 1.3, grow: 1.6, alpha: 0.3, life: 0.9, up: 1.2, carry: kartVel(h.t * SPEED, 0.85) });
  }
  def.hit(G);
  assist('crash');
}

function hitRing(r, t) {
  r.state = 'got';
  r.stateT = 0;
  G.ringsHit++;
  const [sx, sy] = screenOf(r.t * SPEED, r.x, 2.5);
  {
    // golden streaks fly outwards in the ring's plane, plus a few sparkles
    const zf = r.t * SPEED, f = track.course.frame(zf, fxFr);
    const c = track.worldPos(zf, r.x, ITEM.ringY, tmpV), kv = kartVel(zf, 0.95);
    fxA.set(f.rx, f.ry, f.rz); fxB.set(f.ux, f.uy, f.uz);
    particles.ring(c, fxA, fxB, ITEM.ringR, ['#ffe066', '#ffffff', '#ffb800'], 24, { kind: 'streak', speed: 5, size: 0.2, life: 0.42, grav: 0, drag: 3.5, carry: kv });
    particles.burst(c, ['#fff2a0', '#ffffff'], 6, { kind: 'star', speed: 2.5, up: 0.5, size: 0.5, life: 0.45, grav: -2, drag: 3, carry: kv });
  }
  if (r.chain) {
    const prog = (G.chainProgress.get(r.chain) || 0) + 1;
    G.chainProgress.set(r.chain, prog);
    sfx.play('chainNote', { i: r.idx });
    hud.popup(['DO', 'RE', 'MI', 'FA', 'SOL'][r.idx] || 'LA', sx, sy, 'gold');
    if (prog === r.len) {
      G.chains++;
      hud.announce('HALO CHAIN!', 1800);
      sfx.play('chord');
      audio.duck(-3, 150);
      addDoom(TUNE.chain);
      hud.flash(0.4, 300);
      fireworks();
      startBoost(t, TUNE.chainBoostTime, false);
      return;
    }
    startBoost(t, TUNE.boostTime, prog === 1);
  } else {
    sfx.play('ring');
    hud.popup('+ALIGNED', sx, sy, 'gold');
    startBoost(t, TUNE.boostTime);
  }
}
function fireworks() {
  const cols = ['#ff5ca8', '#5affd0', '#ffd23f', '#8a6cff', '#7fd4ff'];
  for (let k = 0; k < 6; k++) {
    setTimeout(() => {
      const z = G.songTime * SPEED + 34 + k * 6;
      const p = track.worldPos(z, (k % 2 ? 1 : -1) * 1.15, 8.5 + (k % 3) * 2.5, new THREE.Vector3());
      const kv = kartVel(z, 0.75).clone();
      particles.burst(p, [cols[k % cols.length], cols[(k + 2) % cols.length], '#ffffff'], 36, { kind: 'streak', speed: 13, up: 0, spread: 1.4, grav: -4, drag: 1.8, life: 1.1, size: 0.45, carry: kv });
      particles.burst(p, [cols[k % cols.length], '#ffffff'], 10, { kind: 'star', speed: 6, up: 0, spread: 1.4, grav: -3, drag: 1.5, life: 1.4, size: 0.6, carry: kv });
      particles.spawn(p, kv, cols[k % cols.length], { kind: 'glow', size: 6, end: 1.4, life: 0.3, grav: 0, drag: 0, hdr: 1.5, alpha: 0.7, base: kv });
      sfx.play('whoosh');
    }, k * 120);
  }
}

function hitPower(p, t) {
  p.state = 'got';
  p.stateT = 0;
  G.power = p.type;
  G.powerStart = t;
  G.powerUntil = p.type === 'magnet' ? t + 5 : p.type === 'scale' ? t + 4 : p.type === 'rain' ? t + 2.5 : Infinity;
  sfx.play('powerup');
  {
    // the item box shatters into glossy rainbow shards
    const zf = p.t * SPEED, q = track.worldPos(zf, p.x, ITEM.powerY, tmpV), kv = kartVel(zf, 0.95);
    particles.burst(q, ['#ff8ad8', '#8afcff', '#fff38a', '#b8a0ff', '#9dffb0'], 16, { kind: 'shard', speed: 5, up: 2.2, size: 0.42, life: 0.65, grav: -10, drag: 1.6, hdr: 1.7, carry: kv });
    particles.burst(q, ['#ffffff'], 5, { kind: 'star', speed: 2.5, up: 0.8, size: 0.6, life: 0.4, grav: -1, drag: 3, carry: kv });
  }
  hud.card(POWER_NAMES[p.type], POWER_DESC[p.type]);
  assist('power');
  if (p.type === 'scale') hud.announce('SCALE IS ALL YOU NEED', 1600);
  if (p.type === 'magnet') { sfx.play('whoosh'); hud.announce('RLHF MAGNET 👍', 1300); }
  if (p.type === 'rain') { computeRain(); hud.announce('COMPUTE RAIN', 1300); }
  if (p.type === 'shield') hud.announce('SAFETY TEAM: ON BOARD', 1300);
}

// ---------------- autopilot (testing / attract / backup recording) ----------------
let autopilot = params.has('autopilot');
const tapMarks = [];
function autoSteer(t) {
  const notes = level.notes;
  let target = 0;
  let n = null;
  for (let i = G.cursors.note; i < notes.length; i++) { if (notes[i].t > t - 0.01) { n = notes[i]; break; } }
  const r = level.rings[G.cursors.ring];
  if (n) target = n.flyX ?? n.x;
  if (r && (!n || r.t <= n.t + 0.01)) target = r.x;
  const h = level.hazards[G.cursors.hazard];
  if (h && (!n || h.t < n.t) && h.t - t < 0.6) {
    const half = h.w / 2 + TUNE.kartHalf + 0.08;
    if (Math.abs(target - h.x) < half) target = h.x + (target >= h.x ? half : -half);
    if (Math.abs(target) > 1) target = h.x - Math.sign(target) * half;
  }
  return clamp((target - G.kartX) * 6, -1, 1);
}

// ---------------- race update ----------------
function resolveItems(t, magnet) {
  const notes = level.notes;
  if (magnet) {
    for (let i = G.cursors.note; i < notes.length && notes[i].t < t + 1.2; i++) {
      const n = notes[i];
      if (Math.abs(n.x - G.kartX) < 0.5) {
        const k = clamp(1 - (n.t - t) / 1.2, 0, 1);
        n.flyX = lerp(n.x, G.kartX, k * k);
      }
    }
  }
  while (G.cursors.note < notes.length && notes[G.cursors.note].t <= t) {
    const n = notes[G.cursors.note++];
    if (n.done) continue;
    const x = n.flyX ?? n.x;
    if (Math.abs(G.kartX - x) < (magnet ? 0.5 : TUNE.hitNote)) collect(n, t);
    else miss(n);
  }
  // bonus items (rain / hallucinations)
  for (let i = G.bonus.length - 1; i >= 0; i--) {
    const n = G.bonus[i];
    if (n.t > t) continue;
    if (Math.abs(G.kartX - n.x) < TUNE.hitNote + (n.rain ? 0.05 : 0)) collect(n, t);
    else miss(n);
    G.bonus.splice(i, 1);
  }
  // hazards
  const hz = level.hazards;
  while (G.cursors.hazard < hz.length && hz[G.cursors.hazard].t <= t) {
    const h = hz[G.cursors.hazard++];
    if (h.done) continue;
    const d = Math.abs(G.kartX - h.x) - h.w / 2;
    if (track.course.hopAt(h.t * SPEED) > 1.5) { h.state = 'jumped'; continue; } // cleared it mid-hop
    if (d < TUNE.kartHalf) hitHazard(h, t);
    else if (d < TUNE.nearMiss) {
      G.nearMisses++;
      G.gpus += TUNE.nearMissGpu;
      const [sx, sy] = screenOf(h.t * SPEED, G.kartX, 2.5);
      hud.popup('CLOSE CALL! +1', sx, sy, 'mint');
      if (Math.random() < 0.5) assist('near');
      sfx.play('whoosh');
    }
  }
  // rings
  const rings = level.rings;
  while (G.cursors.ring < rings.length && rings[G.cursors.ring].t <= t) {
    const r = rings[G.cursors.ring++];
    if (r.done) continue;
    if (Math.abs(G.kartX - r.x) < TUNE.hitRing) hitRing(r, t);
    else { r.state = 'missed'; r.stateT = 0; sfx.play('wah'); }
  }
  // power-ups
  const pw = level.powerups;
  while (G.cursors.power < pw.length && pw[G.cursors.power].t <= t) {
    const p = pw[G.cursors.power++];
    if (p.done) continue;
    if (Math.abs(G.kartX - p.x) < TUNE.hitPower) hitPower(p, t);
    else { p.state = 'missed'; }
  }

}

function updateRace(dt) {
  const t = clock.now();
  const prevT = G.songTime;
  G.prevTime = prevT;
  G.songTime = t;
  hands.tick(dt);

  // steering
  let steer = input.getSteer(dt, t);
  if (autopilot) steer = autoSteer(t);
  G.steer = steer;
  const spinning = t < G.spinUntil;
  const prevX = G.kartX;
  G.kartX += steer * TUNE.lateral * dt * (spinning ? 0.3 : 1) * (t < (G.sluggishUntil || 0) ? 0.35 : 1);
  G.kartX += G.bounceV * dt;
  G.bounceV *= Math.exp(-dt * 5);
  G.kartX = clamp(G.kartX, -1, 1);
  G.kartVel = (G.kartX - prevX) / Math.max(dt, 1e-3);

  // manual boost (Space / hands up)
  if (input.getBoost() && t > G.boostCooldownUntil && !boosting(t)) {
    startBoost(t, TUNE.boostTime);
    G.boostCooldownUntil = t + TUNE.boostTime + TUNE.boostCooldown;
  }

  // power-up expiry + magnet
  if (G.power && t > G.powerUntil) { G.power = null; hud.setPower(null); }
  if (G.power) {
    const frac = G.powerUntil === Infinity ? 1 : (G.powerUntil - t) / (G.powerUntil - G.powerStart);
    hud.setPower(POWER_NAMES[G.power], frac);
  }
  const magnet = G.power === 'magnet';

  // drift: the world keeps scaling
  if (!G.launched) addDoom(TUNE.drift * dt);

  // --- resolve notes crossing the kart (nothing counts once we've launched)
  if (!G.launched) resolveItems(t, magnet);

  // --- sections
  const si = sectionAt(sections, t);
  // gate whoosh just before the downbeat of the next section
  const next = sections[si + 1];
  if (next && next.start - t < 0.4 && !next._gateSfx) { next._gateSfx = true; sfx.play('gate'); }
  if (si !== G.sectionIdx) {
    const prevIdx = G.sectionIdx;
    if (prevIdx >= 0 && level.sections[prevIdx]) {
      const ps = level.sections[prevIdx];
      if (G.sectionMisses === 0 && ps.noteCount > 4 && si === prevIdx + 1 && G.sectionEnteredAt <= ps.start + 0.5) {
        G.flawless++;
        addDoom(TUNE.flawless);
        sfx.play('ding');
        setTimeout(() => hud.card('FLAWLESS SECTION', '−0.05 P(DOOM). the safety team weeps with joy'), 50);
      }
    }
    G.sectionIdx = si;
    G.sectionMisses = 0;
    G.sectionEnteredAt = t;
    const sec = sections[si];
    const th = getTheme(sec.theme);
    setTimeout(() => assist(prevIdx < 0 && si === 0 ? 'start' : sec.theme, true), prevIdx < 0 ? 1500 : 2200);
    if (!(prevIdx >= 0 && G.sectionMisses === 0 && false)) {
      hud.card(`TRACK ${si + 1}: ${th.title || sec.theme}`, th.subtitle || '');
    }
    if (prevIdx >= 0) {
      hud.flash(0.35, 250);
      if (th.enterLines && th.enterLines.length) setTimeout(() => hud.announce(th.enterLines[si % th.enterLines.length], 1500), 600);
    }
  }

  // --- finale: launch into the sky
  if (!G.launched && t >= G.launchAt) {
    G.launched = true;
    G.launchT = t;
    sfx.play('launch');
    hud.announce('LIFTOFF', 1500);
    hud.flash(0.6, 500);
  }
  if (G.launched && t - G.launchT > 2.6) finish();
  if (audio.ended || t >= audio.duration - 0.05) finish();

  if (track.course.featuresAt(t * SPEED).jump?.glide && !G.glideSaid) { G.glideSaid = true; assist('glide', true); }
  hud.setPlace(rivals.place || 1);
  hud.setPdoom(G.pDoom);
  hud.setScore(G.gpus, G.combo);
  hud.updateCaption(t);
  hud.updatePip(G.webcam);
  hud.warn(G.webcam && input.webcam && hands.ready && !hands.both && !input.isDown('ArrowLeft') && !input.isDown('ArrowRight'));
}

// ---------------- frame ----------------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  const rawDt = (now - lastFrame) / 1000;
  lastFrame = now;
  debug.tick(rawDt);

  if (mode === 'CALIBRATE') updateCalibrate(dt);
  if (mode === 'COUNTDOWN') updateCountdown(dt);
  if (mode === 'RACE' && !paused) updateRace(dt);

  // world time for rendering
  const t = mode === 'RACE' ? G.songTime : mode === 'TITLE' ? 0 : G.songTime;
  const beatPhase = beatPhaseAt(mode === 'TITLE' ? now / 1000 : t);
  const kartZ = t * SPEED;

  // kart placement: full course frame (heading, pitch, banking) + hop jumps
  const pos = track.worldPos(kartZ, G.kartX, 0, new THREE.Vector3());
  const fr = track.course.frame(kartZ, frameTmp);
  basisR.set(fr.rx, fr.ry, fr.rz); basisU.set(fr.ux, fr.uy, fr.uz); basisB.set(-fr.tx, -fr.ty, -fr.tz);
  basisM.makeBasis(basisR, basisU, basisB);
  kartQuat.setFromRotationMatrix(basisM);
  const boostK = mode === 'RACE' ? boostAmount(t) : 0;
  let launchK = 0;
  if (G.launched) {
    const k = G.songTime - G.launchT;
    launchK = Math.min(1, k);
    pos.y += k * k * 9;
    pos.addScaledVector(basisB, -k * 25);
  }
  const scaleK = G.power === 'scale' && t < G.powerUntil ? 2 : 1;
  let expr = 'normal';
  if (t < G.hurtUntil) expr = 'hurt';
  else if (G.pDoom > 0.8) expr = 'scared';
  else if (G.combo >= 10 || mode === 'TITLE') expr = 'happy';
  kart.setExpression(expr);
  kart.update({
    pos, quat: kartQuat, steerVel: mode === 'RACE' ? G.kartVel * 0.6 : 0, steerVis: G.steer, dt, t: now / 1000,
    // webcam: the cockpit wheel mirrors your hands 1:1 (keyboard keeps the exaggerated steer-driven turn)
    wheelTurn: mode === 'RACE' && !autopilot && input.usingHands() ? clamp(-hands.angleDeg, -90, 90) * (Math.PI / 180) : null,
    boostK, spinT: t < G.spinUntil ? 1 : 0, scaleK, shield: G.power === 'shield', shades: G.combo >= 50, beatPhase, launchK,
    glide: mode === 'RACE' && !!track.course.featuresAt(kartZ).jump?.glide,
    camPos: camera.position,
    hop: track.course.hopAt(kartZ), air: mode === 'RACE' && (!!track.course.featuresAt(kartZ).jump || G.launched),
  });

  // trails, drift sparks, tyre dust, landing puffs (sizes in kart terms: sparks 0.15–0.3 kh, dust ≈ 1 kw)
  if (mode === 'RACE' && !paused) {
    // the kart's actual world velocity (follows glides/hops too); falls back to the track tangent after teleports
    trailKv.copy(kart.root.position).sub(lastKartPos).divideScalar(Math.max(dt, 1e-3));
    if (!(trailKv.lengthSq() < 90 * 90) || dt <= 0) trailKv.copy(kartVel(kartZ, 1));
    const kv = trailKv;
    const feats = track.course.featuresAt(kartZ);
    const air = !!feats.jump || G.launched;
    const wl = kart.wheelWorld(0, fxA), wr = kart.wheelWorld(1, fxB);
    if (G.combo >= 25) {
      // rainbow ribbon from both rear tyres
      const hue = ((now / 6) % 360) / 360;
      for (const w of [wl, wr]) for (let j = 0; j < 2; j++) {
        tmpV.copy(w).addScaledVector(kv, -dt * 0.5 * j); tmpV.y += 0.12;
        particles.spawn(tmpV, fxVel.copy(kv).multiplyScalar(0.78), trailCol.setHSL(hue, 0.95, 0.6), { kind: 'glow', life: 0.42, size: 0.42, end: 0.3, grav: 0, drag: 0, hdr: 2.2, alpha: 0.8, fadeIn: 0.02 });
      }
    } else if (G.combo >= 10 && Math.random() < 0.55) {
      tmpV.copy(Math.random() < 0.5 ? wl : wr); tmpV.y += 0.25 + Math.random() * 0.4;
      fxVel.copy(kv).multiplyScalar(0.8); fxVel.y += 0.6 + Math.random() * 0.8; fxVel.x += (Math.random() - 0.5) * 1.2;
      particles.spawn(tmpV, fxVel, Math.random() < 0.5 ? '#ffffff' : '#ffe680', { kind: 'star', life: 0.45, size: 0.32, grav: -2, drag: 0 });
    }
    if (boostK > 0.3) {
      // blue-white streaks off the exhausts
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.4) continue;
        kart.exhaustWorld(i, tmpV);
        fxVel.copy(kv).multiplyScalar(0.55); fxVel.x += (Math.random() - 0.5) * 1.5; fxVel.y += Math.random() * 1.2;
        particles.spawn(tmpV, fxVel, Math.random() < 0.5 ? '#4ad8ff' : '#e8f8ff', { kind: 'streak', life: 0.14, size: 0.11 * boostK, grav: 0, drag: 0, alpha: 0.75 });
      }
    }
    // drift sparks + a little warm dust from the outer rear tyre when steering hard
    const hard = !air && Math.abs(G.kartVel) > 2.2 && Math.abs(G.steer) > 0.6;
    if (hard) {
      const w = (G.kartVel > 0 ? wl : wr), side = G.kartVel > 0 ? -1 : 1;
      w.x += fr.ux * 0.18; w.y += fr.uy * 0.18; w.z += fr.uz * 0.18; // just above the tarmac (sparks under the road are invisible)
      for (let i = 0; i < 2; i++) {
        fxVel.copy(kv).multiplyScalar(0.8);
        fxVel.y += 2 + Math.random() * 2.5;
        fxVel.x += side * (0.5 + Math.random() * 1.5) * fr.rx; fxVel.z += side * (0.5 + Math.random() * 1.5) * fr.rz;
        particles.spawn(w, fxVel, boostK > 0.3 ? (Math.random() < 0.5 ? '#6fd8ff' : '#ffffff') : (Math.random() < 0.5 ? '#ff8a1a' : '#ffd23a'), { kind: 'streak', life: 0.16 + Math.random() * 0.1, size: 0.17, grav: -10, drag: 0, alpha: 1, hdr: 2.4 });
      }
      if (Math.random() < 0.5) particles.spawn(w, fxVel.copy(kv).multiplyScalar(0.92), boostK > 0.3 ? '#9fe6ff' : '#ffd36a', { kind: 'star', life: 0.12, size: 0.42, grav: 0, drag: 0, hdr: 2.6 });
      if (Math.random() < 0.35) {
        fxVel.copy(kv).multiplyScalar(0.7); fxVel.y += 0.4 + Math.random() * 0.4;
        smoke.spawn(w, fxVel, '#eadfcf', { life: 0.6, size: 0.9, grow: 1.5, alpha: 0.16, base: dustBase.copy(fxVel).multiplyScalar(0.95) });
      }
    }
    if (G.wasAir && !air) {
      // compact touchdown puffs at the rear wheels (≈ 1 kart width each)
      const kv2 = kv.clone().multiplyScalar(0.75);
      for (const w of [wl, wr]) smoke.puff(w, '#f0e6d8', 5, { speed: 2.5, size: 1.5, grow: 1.6, alpha: 0.3, life: 0.75, up: 0.8, carry: kv2 });
      camState.shake = Math.max(camState.shake, 0.6);
      sfx.play('whoosh');
      hud.announce('NAILED THE LANDING', 1100);
    }
    G.wasAir = air;
  }
  lastKartPos.copy(kart.root.position);
  particles.update(paused ? 0 : dt, camera.position); // photo mode freezes the effects
  smoke.update(paused ? 0 : dt);

  // camera
  updateCamera(dt, kartZ, t, boostK, now);

  // world
  const redness = mode === 'RACE' ? clamp((G.pDoom - 0.75) / 0.2, 0, 1) : 0;
  track.update(kartZ, camera.position, t, beatPhase, redness, dt);
  ents.update(t, dt, beatPhase);
  rivals.update(t, kartZ, G.kartX, dt, { visible: mode === 'RACE' && !G.launched, playerFeatures: track.course.featuresAt(kartZ) });
  R.update(pos, now / 1000);

  R.setSpeedFx?.(mode === 'RACE' && !paused ? boostK : 0);
  hud.drawFx(dt, mode === 'RACE' ? boostK : 0, '255,255,255');
  R.render();

  // auto quality: step down if we're struggling
  // (ignore the first seconds after a start / section jump: shader compiles for the new scenery stall a few frames)
  if (mode === 'RACE' && now - raceStartWall > 4000 && debug.fps > 0 && debug.fps < 45 && quality !== 'low' && !params.get('quality')) {
    lowFpsTime += rawDt;
    if (lowFpsTime > 3) { quality = QUALITIES[Math.max(0, QUALITIES.indexOf(quality) - 1)]; R.setQuality(quality); lowFpsTime = 0; console.warn('low fps: quality →', quality); }
  } else lowFpsTime = 0;
}

const frameTmp = {}, frameTmp2 = {}, camFr = {};
const trailCol = new THREE.Color(), trailKv = new THREE.Vector3(), dustBase = new THREE.Vector3(), lastKartPos = new THREE.Vector3();
const basisR = new THREE.Vector3(), basisU = new THREE.Vector3(), basisB = new THREE.Vector3();
const basisM = new THREE.Matrix4(), kartQuat = new THREE.Quaternion();

function boostAmount(t) {
  if (t >= G.boostUntil) {
    const since = t - G.boostUntil;
    return since < 0.6 ? 1 - since / 0.6 : 0; // ease out
  }
  const into = t - G.boostStart;
  return Math.min(1, into / 0.15);
}

function beatPhaseAt(t) {
  const beats = level ? level.beats : null;
  if (!beats || !beats.length) return 0;
  // binary search last beat <= t
  let lo = 0, hi = beats.length - 1;
  if (t < beats[0]) return 0;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= t) lo = m; else hi = m - 1; }
  const b0 = beats[lo], b1 = beats[lo + 1] ?? b0 + level.beatLen;
  return clamp((t - b0) / (b1 - b0), 0, 1);
}

/** Size audit for live scenery: { 'theme:kind': { w, h, d, kh, x } } (world units; kh = height in kart+driver heights) */
function propSizes() {
  const out = {}, box = new THREE.Box3(), v = new THREE.Vector3();
  for (const a of track.active) {
    if (out[a.key]) continue;
    box.setFromObject(a.obj);
    box.getSize(v);
    const r = (x) => Math.round(x * 10) / 10;
    out[a.key] = { w: r(v.x), h: r(v.y), d: r(v.z), kh: r(v.y / (KART_W * 1.1)) };
  }
  return out;
}

/** Frame metrics in the same terms as the Mario Kart stills (1456×819 px): __dbg.measure() in the console / CDP. */
function measure() {
  const W = 1456, Hh = 819, v = new THREE.Vector3();
  const px = (p) => { v.copy(p).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * Hh]; };
  const k = kart.root;
  k.updateMatrixWorld(true);
  const wheelOut = 1.69; // rear tyre outer edge (kart model units)
  const L = px(new THREE.Vector3(-wheelOut, 0, 1.1).applyMatrix4(k.matrixWorld));
  const Rr = px(new THREE.Vector3(wheelOut, 0, 1.1).applyMatrix4(k.matrixWorld));
  const head = px(new THREE.Vector3(0, kart.topY ?? 3.5, 0.2).applyMatrix4(k.matrixWorld));
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const hz = px(camera.position.clone().addScaledVector(fwd, 1e5));
  const kartW = Math.hypot(Rr[0] - L[0], Rr[1] - L[1]);
  const kz = G.songTime * SPEED + 1.1 * k.scale.z;
  const eL = px(track.worldPos(kz, -ROAD_HALF / LANE, 0));
  const eR = px(track.worldPos(kz, ROAD_HALF / LANE, 0));
  const r = (x) => Math.round(x * 10) / 10;
  return {
    kartWidthPx: r(kartW), wheelContactY: r((L[1] + Rr[1]) / 2), headTopY: r(head[1]), kartHeightPx: r((L[1] + Rr[1]) / 2 - head[1]),
    kartCenterX: r((L[0] + Rr[0]) / 2), horizonY: r(hz[1]), roadWidthPx: r(eR[0] - eL[0]), roadKartWidths: r((eR[0] - eL[0]) / kartW),
    fov: camera.fov, camHeight: r(camera.position.y - k.position.y),
  };
}

// chase camera rig, measured from Mario Kart World (scale.js). Tunable: ?cam=back,height,ahead,pitch,fov,latFollow
const CAM = { ...CAMERA };
if (params.get('cam')) {
  const v = params.get('cam').split(',').map(Number);
  ['back', 'height', 'ahead', 'pitch', 'fov', 'lat'].forEach((k, i) => { if (!isNaN(v[i])) CAM[k] = v[i]; });
}
// ---------------- photo mode (while paused): drag to orbit, scroll to zoom ----------------
const photo = { yaw: 0, pitch: 0.32, dist: 6, drag: null };
function startPhoto() {
  document.body.classList.add('photo');
  const k = kart.root.position;
  const d = camera.position.clone().sub(k);
  photo.dist = Math.max(2, d.length());
  photo.pitch = Math.asin(Math.min(0.99, Math.max(-0.2, d.y / photo.dist)));
  photo.yaw = Math.atan2(d.x, d.z);
}
(() => {
  const cv = document.getElementById('game');
  cv.addEventListener('pointerdown', (e) => { if (paused) { photo.drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointermove', (e) => {
    if (!paused || !photo.drag) return;
    photo.yaw -= (e.clientX - photo.drag.x) * 0.006;
    photo.pitch = Math.min(1.45, Math.max(0.04, photo.pitch - (e.clientY - photo.drag.y) * 0.005));
    photo.drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerup', () => { photo.drag = null; });
  cv.addEventListener('wheel', (e) => { if (paused) { e.preventDefault(); photo.dist = Math.min(80, Math.max(1.5, photo.dist * Math.exp(e.deltaY * 0.001))); } }, { passive: false });
})();

const camTarget = new THREE.Vector3();
const camPosT = new THREE.Vector3();
const camUp = new THREE.Vector3();
const camLand = new THREE.Vector3();
function updateCamera(dt, kartZ, t, boostK, now) {
  if (mode === 'TITLE' || mode === 'LOADING') {
    const a = now / 5000;
    const p = track.worldPos(0, 0, 0, new THREE.Vector3());
    camera.position.set(p.x + Math.sin(a) * 3.6, p.y + 1.4, p.z + Math.cos(a) * 3.6);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.x, p.y + 0.7, p.z);
    camera.fov = 50;
    camera.updateProjectionMatrix();
    return;
  }
  if (paused && mode === 'RACE') {
    const k = kart.root.position;
    camera.position.set(
      k.x + Math.sin(photo.yaw) * Math.cos(photo.pitch) * photo.dist,
      k.y + 0.5 + Math.sin(photo.pitch) * photo.dist,
      k.z + Math.cos(photo.yaw) * Math.cos(photo.pitch) * photo.dist,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(k.x, k.y + 0.6, k.z);
    camState.snap = true; // resume snaps back to the chase cam
    return;
  }
  // AGI WINGS glide: pull back + up and swing the aim towards the landing strip so kart + destination share the frame
  const jf = track.course.featuresAt(kartZ).jump;
  let gw = 0;
  if (jf?.glide) {
    const u = (kartZ - jf.s[0]) / (jf.s[1] - jf.s[0]);
    gw = THREE.MathUtils.smoothstep(u, 0, 0.18) * (1 - THREE.MathUtils.smoothstep(u, 0.82, 1));
    camState.landZ = jf.s[1];
  }
  camState.gw = camState.snap ? gw : lerp(camState.gw || 0, gw, 1 - Math.exp(-dt * 2.5));
  const gwk = camState.gw;
  const hop = track.course.hopAt(kartZ);
  const back = CAM.back + CAM.boostBack * boostK + 5 * gwk;
  const height = CAM.height + 2.2 * KART_W * gwk;
  const f = track.course.frame(kartZ - back, camFr);
  // camera sits behind, following the kart laterally with a little lag; up is mostly road-normal (MK follows the road plane)
  const latTarget = G.kartX * LANE * CAM.lat;
  camState.x = THREE.MathUtils.lerp(camState.x, latTarget, 1 - Math.exp(-dt * 6));
  // vertical offset (hops, glides) eases so jumps feel floaty; no positional lag along the track (that used to add ~2.7 m)
  const hTarget = height + hop;
  camState.h = camState.snap || camState.h === undefined ? hTarget : lerp(camState.h, hTarget, 1 - Math.exp(-dt * 7));
  camUp.set(f.ux * 0.7, f.uy * 0.7 + 0.3, f.uz * 0.7).normalize();
  camPosT.set(f.x + f.rx * camState.x, f.y + f.ry * camState.x, f.z + f.rz * camState.x).addScaledVector(camUp, camState.h);
  if (!camState.init || camState.snap) { camState.init = true; camState.snap = false; }
  camera.position.copy(camPosT);
  camState.shake *= Math.exp(-dt * 6);
  const sh = camState.shake * KART_W * 0.4;
  camera.position.x += (Math.random() - 0.5) * sh * 0.6;
  camera.position.y += (Math.random() - 0.5) * sh * 0.4;
  // aim ahead along the track, below the road, so the view pitches down CAM.pitch degrees (MK: horizon at ~29% from the top)
  const aimDrop = Math.tan(THREE.MathUtils.degToRad(CAM.pitch)) * (back + CAM.ahead);
  track.course.pos(kartZ + CAM.ahead, G.kartX * 0.5, camState.h - aimDrop + hop * 0.7, camTarget);
  if (gwk > 0.001 && camState.landZ) camTarget.lerp(track.course.pos(camState.landZ + 18, G.kartX * 0.3, 0, camLand), 0.62 * gwk);
  if (G.launched) {
    const k = Math.min(1, (t - G.launchT) / 1.5);
    camTarget.lerp(kart.root.position, k);
  }
  camera.up.copy(camUp);
  camera.lookAt(camTarget);
  const fov = CAM.fov + CAM.boostFov * boostK;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ---------------- keys ----------------
function onKey(code) {
  if (code === 'KeyD') { debug.toggle(); return; }
  if (code === 'KeyP') { togglePause(); return; }
  if (code === 'KeyH') { document.body.classList.toggle('clean'); return; }
  if (code === 'KeyG') { G.god = !G.god; hud.announce(G.god ? 'GOD MODE' : 'MORTAL MODE', 900); return; }
  if (code === 'BracketLeft') { clock.latency -= 0.01; return; }
  if (code === 'BracketRight') { clock.latency += 0.01; return; }
  if (code === 'KeyO') { quality = QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]; R.setQuality(quality); hud.announce('QUALITY: ' + quality.toUpperCase(), 900); return; }
  if (code === 'KeyS' && params.has('tap') && mode === 'RACE') {
    // ?tap=1: re-mark section starts by ear
    const tt = +G.songTime.toFixed(2);
    tapMarks.push(tt);
    hud.announce('MARK ' + tt.toFixed(2), 700);
    console.log('[tap] section start', tt, 'all:', JSON.stringify(tapMarks));
    return;
  }
  if (code === 'KeyB') { autopilot = !autopilot; hud.announce(autopilot ? 'AUTOPILOT (unsupervised)' : 'HUMAN IN THE LOOP', 1000); return; }
  if (code === 'Escape') { toTitle(); return; }
  if (code === 'KeyR' && (mode === 'RACE' || mode === 'RESULTS')) { startRace({ webcam: G.webcam }); return; }
  if (code === 'KeyW' && (mode === 'RACE' || mode === 'COUNTDOWN')) {
    toggleWebcam();
    return;
  }
  if (code === 'Enter' && mode === 'TITLE') { ensureAudio(); startRace({ webcam: false }); return; }
  if (code === 'Enter' && mode === 'RESULTS') { ensureAudio(); startRace({ webcam: G.webcam }); return; }
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9, Minus: 10, Equal: 11 }[code];
  if (digit !== undefined) jumpToSection(digit);
}

async function toggleWebcam() {
  if (!G.webcam) {
    try {
      hud.announce('WEBCAM: ON', 900);
      await hands.init();
      G.webcam = true;
      input.webcam = true;
      hud.showPip(true);
      hud.showKbdHint(false);
    } catch (e) {
      hud.announce('NO WEBCAM :(', 1200);
    }
  } else {
    G.webcam = false;
    input.webcam = false;
    hud.showPip(false);
    hud.showKbdHint(true);
    hud.announce('KEYBOARD MODE', 900);
  }
}

function debugInfo() {
  const sec = sections[G.sectionIdx] || {};
  return {
    mode, songTime: G.songTime.toFixed(2), section: `${G.sectionIdx + 1} ${sec.theme || ''} (${sec.part || ''})`,
    steer: G.steer.toFixed(2), kartX: G.kartX.toFixed(2), hands: hands.ready ? `${hands.both ? 'both' : hands.pts.length} ${hands.angleDeg.toFixed(1)}° det ${hands.detectMs.toFixed(1)}ms @${hands.detectHz.toFixed(0)}Hz` : 'off',
    latency: (clock.latency * 1000).toFixed(0) + ' ms', god: G.god, pDoom: G.pDoom.toFixed(3), quality,
    notes: `${G.hits}/${level.notes.length}`, calls: renderer.info.render.calls,
  };
}

boot();
