// Boot + state machine (TITLE → CALIBRATE → COUNTDOWN → RACE → RESULTS) + the game rules.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { audio, sfx, setKey } from './audio.js';
import { clock } from './clock.js';
import { loadData, buildLevel, sectionAt } from './beatmap.js';
import { Track, SPEED, LANE } from './track.js';
import { Kart } from './kart.js';
import { Entities, POWER_NAMES, POWER_DESC } from './entities.js';
import { Particles } from './particles.js';
import { input } from './input.js';
import { hands } from './hands.js';
import { hud } from './hud.js';
import { HAZARDS } from './hazards.js';
import { THEMES, getTheme } from './themes/index.js';
import { debug } from './debug.js';
import { clamp, lerp } from './toolkit.js';

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
let renderer, scene, camera, effect, track, kart, particles, ents;
let bm, sections, level;
let hemi, sun;
let mode = 'LOADING';
let paused = false;
let lastFrame = performance.now();
let outlines = true;
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
async function boot() {
  hud.init();
  input.init();
  input.onKey = onKey;
  const msg = $('loading-msg');
  try {
    msg.textContent = 'loading fonts…';
    await Promise.race([document.fonts.load("700 40px 'Fredoka'"), new Promise((r) => setTimeout(r, 1500))]);
    msg.textContent = 'decoding the song…';
    await audio.init('assets/song.mp3');
    msg.textContent = 'reading the beatmap…';
    ({ bm, sections } = await loadData());
    window.__bootStep = 'key'; setKey(bm.pentatonic ? bm.pentatonic + ' major' : bm.key);
    window.__bootStep = 'lyrics'; await hud.loadLyrics('assets/lyrics.lrc'); window.__bootStep = 'lyrics-done';
  } catch (e) {
    msg.textContent = 'boot failed: ' + e.message + ' (are you serving with python3 -m http.server?)';
    throw e;
  }
  window.__bootStep = "renderer"; setupRenderer(); window.__bootStep = "track";
  track = new Track(scene, sections);
  kart = new Kart(scene);
  particles = new Particles(scene);
  level = buildLevel(bm, structuredClone(sections), THEMES);
  ents = new Entities(scene, track, level);
  window.__bootStep = "debug"; debug.init({ getInfo: debugInfo, setSfx: (v) => audio.setSfxVolume(v) });
  window.__bootStep = "screens"; setupScreens(); window.__bootStep = "done";
  requestAnimationFrame(frame);

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
  const canvas = $('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight, false);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
  hemi = new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 1.6);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-20, 40, 20);
  scene.add(sun, sun.target);
  effect = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0.08, 0.05, 0.12] });
  window.addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
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
    launchAt: Infinity, launched: false, finished: false, bonus: [], lastAgiLine: -99, sectionEnteredAt: 0,
  });
  G.chainProgress = new Map();
  input.invertUntil = input.freezeUntil = input.wobbleUntil = 0;
  hud.clearSplats();
  hud.setTier('');
  hud.setGold(false);
  hud.setPower(null);
  $('stage').classList.remove('wavy', 'inverted');
}

function resetWorld(t) {
  // fresh deterministic level so item states are clean
  if (ents) ents.reset(1e9);
  level = buildLevel(bm, structuredClone(sections), THEMES);
  ents = new Entities(scene, track, level);
  seekCursors(t);
  ents.reset(t);
  track.reset(t * SPEED);
  particles.clear();
  clock.reset(t);
  G.songTime = G.prevTime = t;
  const lastNote = level.notes[level.notes.length - 1];
  G.launchAt = Math.min(audio.duration - 4, (lastNote ? lastNote.t : audio.duration) + 0.7);
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
function beginRace(from) {
  mode = 'RACE';
  setRacingUI(true);
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
    n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
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
    
  } else {
    paused = false;
    showScreen(null);
    document.body.classList.remove('paused', 'photo');
    audio.play(audio.pausedAt);
    clock.reset(audio.pausedAt);
  }
}
function setRacingUI(on) { $('btn-pause').style.display = on ? '' : 'none'; }

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
    particles.burst(track.worldPos(zf, n.x, 1.2, tmpV), ['#c86bff', '#ffffff'], 10, { speed: 4 });
    sfx.play('wah');
    return;
  }
  const v = gpuValue(t) * (n.rain ? 1 : 1);
  G.gpus += v;
  G.combo++;
  G.hits += n.rain ? 0 : 1;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  addDoom(TUNE.collect);
  sfx.play('pickup', { step: G.combo - 1 });
  hud.popup(`+${v} GPU`, sx, sy, v > 1 ? 'gold' : '');
  particles.burst(track.worldPos(zf, n.flyX ?? n.x, 1.2, tmpV), ['#7cffb0', '#ffd23f', '#ffffff'], 14, { speed: 7, carry: 24 });
  // combo tiers
  for (let i = 0; i < TIERS.length; i++) {
    if (G.combo === TIERS[i][0]) {
      G.tier = Math.max(G.tier, i + 1);
      hud.announce(TIERS[i][1]);
      hud.setTier(TIERS[i][2]);
      sfx.play('tier');
      if (i === 2) hud.setGold(true);
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
  sfx.play('miss');
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
    particles.burst(track.worldPos(h.t * SPEED, h.x, 1, tmpV), ['#5affd0', '#ffffff'], 24, { speed: 10 });
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
  particles.burst(track.worldPos(h.t * SPEED, h.x, 1, tmpV), ['#ff3b5c', '#ffd23f', '#2b1840'], 20, { speed: 9 });
  def.hit(G);
}

function hitRing(r, t) {
  r.state = 'got';
  r.stateT = 0;
  G.ringsHit++;
  const [sx, sy] = screenOf(r.t * SPEED, r.x, 2.5);
  particles.burst(track.worldPos(r.t * SPEED, r.x, 1.6, tmpV), ['#ffe066', '#ffffff', '#ffb800'], 22, { speed: 9, carry: 24 });
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
  const kz = G.songTime * SPEED;
  const cols = ['#ff5ca8', '#5affd0', '#ffd23f', '#8a6cff', '#ffffff'];
  for (let k = 0; k < 6; k++) {
    setTimeout(() => {
      const p = track.worldPos(kz + 40 + k * 8, (k % 2 ? 1 : -1) * 1.4, 10 + (k % 3) * 3, new THREE.Vector3());
      particles.burst(p, [cols[k % cols.length], '#ffffff'], 40, { speed: 14, grav: -6, life: 1.1, size: 0.5, up: 0 });
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
  hud.card(POWER_NAMES[p.type], POWER_DESC[p.type]);
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
    if (d < TUNE.kartHalf) hitHazard(h, t);
    else if (d < TUNE.nearMiss) {
      G.nearMisses++;
      G.gpus += TUNE.nearMissGpu;
      const [sx, sy] = screenOf(h.t * SPEED, G.kartX, 2.5);
      hud.popup('CLOSE CALL! +1', sx, sy, 'mint');
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
  G.kartX += steer * TUNE.lateral * dt * (spinning ? 0.3 : 1);
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

  // kart placement
  const pos = track.worldPos(kartZ, G.kartX, 0, new THREE.Vector3());
  const c0 = track.center(kartZ - 1), c1 = track.center(kartZ + 1);
  const heading = -Math.atan2(c1.x - c0.x, 2);
  const pitch = Math.atan2(c1.y - c0.y, 2);
  const boostK = mode === 'RACE' ? boostAmount(t) : 0;
  let launchK = 0;
  if (G.launched) {
    const k = G.songTime - G.launchT;
    launchK = Math.min(1, k);
    pos.y += k * k * 9;
    pos.z -= k * 25;
  }
  const scaleK = G.power === 'scale' && t < G.powerUntil ? 2 : 1;
  let expr = 'normal';
  if (t < G.hurtUntil) expr = 'hurt';
  else if (G.pDoom > 0.8) expr = 'scared';
  else if (G.combo >= 10 || mode === 'TITLE') expr = 'happy';
  kart.setExpression(expr);
  kart.update({
    pos, heading, steerVel: mode === 'RACE' ? G.kartVel * 0.6 : 0, steerVis: G.steer, dt, t: now / 1000,
    boostK, spinT: t < G.spinUntil ? 1 : 0, scaleK, shield: G.power === 'shield', shades: G.combo >= 50, beatPhase, launchK,
  });
  kart.body.rotation.x += pitch;

  // trails
  if (mode === 'RACE' && !paused) {
    const back = track.worldPos(kartZ - 1.5, G.kartX, 0.7, tmpV);
    if (G.combo >= 25) {
      const hue = (now / 6) % 360;
      particles.spawn(back, { x: (Math.random() - 0.5) * 1.5, y: 0.6, z: -22 }, new THREE.Color().setHSL(hue / 360, 0.9, 0.6), { life: 0.4, size: 0.22, grav: 0 });
    } else if (G.combo >= 10 && Math.random() < 0.6) {
      particles.spawn(back, { x: (Math.random() - 0.5) * 3, y: 1.5, z: -22 }, Math.random() < 0.5 ? '#ffffff' : '#ffe680', { life: 0.4, size: 0.16, grav: -2 });
    }
    if (boostK > 0.3) {
      particles.spawn(back, { x: (Math.random() - 0.5) * 2, y: 0.5, z: -18 }, Math.random() < 0.5 ? '#4ad8ff' : '#ffffff', { life: 0.3, size: 0.22, grav: 0 });
    }
  }
  particles.update(dt);

  // camera
  updateCamera(dt, kartZ, t, boostK, now);

  // world
  const redness = mode === 'RACE' ? clamp((G.pDoom - 0.75) / 0.2, 0, 1) : 0;
  track.update(kartZ, camera.position, t, beatPhase, redness, dt);
  ents.update(t, dt, beatPhase);
  sun.position.set(pos.x - 20, pos.y + 40, pos.z + 20);
  sun.target.position.copy(pos);
  hemi.color.copy(track.pal.skyTop).lerp(new THREE.Color(0xffffff), 0.6);

  hud.drawFx(dt, mode === 'RACE' ? boostK : 0, '255,255,255');

  if (outlines) effect.render(scene, camera);
  else renderer.render(scene, camera);

  // auto quality: drop outlines if we're struggling
  if (mode === 'RACE' && outlines && debug.fps > 0 && debug.fps < 40) {
    lowFpsTime += rawDt;
    if (lowFpsTime > 3) { outlines = false; console.warn('low fps: outlines off'); }
  } else lowFpsTime = 0;
}

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

const camTarget = new THREE.Vector3();
function updateCamera(dt, kartZ, t, boostK, now) {
  if (mode === 'TITLE' || mode === 'LOADING') {
    const a = now / 4000;
    const p = track.worldPos(0, 0, 0, new THREE.Vector3());
    camera.position.set(p.x + Math.sin(a) * 7, 3.2, p.z - 1 + Math.cos(a) * 7);
    camera.lookAt(p.x, 1.3, p.z);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    return;
  }
  const back = lerp(7.5, 9.5, boostK);
  const height = lerp(3.4, 2.7, boostK);
  const camZf = kartZ - back;
  const c = track.center(camZf);
  const kartWorldX = track.center(kartZ).x + G.kartX * LANE;
  // lag gently on turns
  const targetX = lerp(c.x, kartWorldX, 0.75);
  camState.x = lerp(camState.x, targetX, 1 - Math.exp(-dt * 6));
  if (!isFinite(camState.x) || Math.abs(camState.x - targetX) > 30) camState.x = targetX;
  let y = c.y + height;
  if (G.launched) y = Math.max(y, track.center(kartZ).y + 2);
  camState.shake *= Math.exp(-dt * 6);
  const sh = camState.shake;
  camera.position.set(camState.x + (Math.random() - 0.5) * sh * 0.6, y + (Math.random() - 0.5) * sh * 0.4, -camZf);
  const look = track.center(kartZ + 14);
  camTarget.set(lerp(look.x, kartWorldX, 0.5), look.y + 1.2, -(kartZ + 14));
  if (G.launched) {
    const k = Math.min(1, (t - G.launchT) / 1.5);
    const kp = kart.root.position;
    camTarget.lerp(kp, k);
  }
  camera.lookAt(camTarget);
  const fov = 70 + 15 * boostK;
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
  if (code === 'KeyO') { outlines = !outlines; return; }
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
    steer: G.steer.toFixed(2), kartX: G.kartX.toFixed(2), hands: hands.ready ? `${hands.both ? 'both' : hands.pts.length} ${hands.angleDeg.toFixed(1)}° det ${hands.detectMs.toFixed(1)}ms` : 'off',
    latency: (clock.latency * 1000).toFixed(0) + ' ms', god: G.god, pDoom: G.pDoom.toFixed(3), outlines,
    notes: `${G.hits}/${level.notes.length}`, calls: renderer.info.render.calls,
  };
}

boot();
