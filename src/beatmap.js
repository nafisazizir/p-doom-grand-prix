// Load beatmap.json + sections.json and generate a deterministic level layout:
// GPUs (notes) on beats with phrase patterns, hazards on off-beats, halo rings (+ chains), power-ups.
import { makeRng, clamp } from './toolkit.js';

export async function loadData() {
  const [bm, sections] = await Promise.all([
    fetch('assets/beatmap.json').then((r) => r.json()),
    fetch('assets/sections.json').then((r) => r.json()),
  ]);
  return { bm, sections };
}

const AMP = 0.78; // max |x| for GPUs

// pattern(i, n, rng-state) → x for beat i within an 8-beat phrase
const PATTERNS = {
  center: (i, p) => p.base,
  sweep8: (i, p) => AMP * Math.sin((i / 8) * Math.PI * 2 + p.phase),
  sweep4: (i, p) => AMP * Math.sin((i / 4) * Math.PI * 2 + p.phase),
  zigzag: (i, p) => (i % 2 === 0 ? -1 : 1) * p.dir * 0.55 + p.base * 0.3,
  stairs: (i, p) => p.dir * [-0.6, 0, 0.6, 0, -0.6, 0, 0.6, 0][i % 8],
  stairs3: (i, p) => p.dir * [-0.65, 0, 0.65][Math.floor(i / 2) % 3],
  wide: (i, p) => p.dir * (Math.floor(i / 4) % 2 === 0 ? -0.65 : 0.65),
  hold: (i, p) => p.base,
};
const PATTERNS_BY_ENERGY = {
  low: ['sweep8', 'wide', 'hold', 'stairs3'],
  mid: ['sweep8', 'sweep4', 'stairs3', 'wide', 'stairs'],
  high: ['sweep4', 'zigzag', 'stairs', 'sweep4', 'zigzag', 'stairs3'],
};

export const POWERUPS = ['magnet', 'shield', 'scale', 'rain'];

/**
 * @param bm beatmap.json
 * @param sections sections with theme/density/hazardRate
 * @param themes registry id→theme (for hazard type lists)
 */
export function buildLevel(bm, sections, themes) {
  const rng = makeRng(42);
  const beats = bm.beats;
  const beatLen = 60 / (bm.bpm || 120);
  const onsetStrengthAt = makeOnsetLookup(bm.onsets || [], beatLen * 0.25);
  const downSet = new Set((bm.downbeats || beats.filter((_, i) => i % 4 === 0)).map((t) => t.toFixed(3)));

  const notes = [], hazards = [], rings = [], powerups = [];
  let lastPowerT = -999;
  let powerIdx = 0;
  let chainId = 0;

  sections.forEach((sec, si) => {
    const theme = themes[sec.theme] || {};
    const sb = beats.filter((t) => t >= sec.start && t < sec.end);
    if (!sb.length) return;
    const isFirst = si === 0;
    const tier = sec.energy >= 0.66 ? 'high' : sec.energy >= 0.4 ? 'mid' : 'low';
    const density = clamp(sec.density ?? 0.7, 0.1, 1);
    const tutorialDelay = isFirst ? sec.start + Math.min(4, (sec.end - sec.start) * 0.25) : sec.start + 0.2;

    // --- choose which beats get GPUs: keep `density` fraction, prefer strong onsets, keep regular-ish spacing
    const scored = sb.map((t, i) => ({ t, i, s: onsetStrengthAt(t) + (i % 2 === 0 ? 0.35 : 0) + (downSet.has(t.toFixed(3)) ? 0.4 : 0) }));
    const keepN = Math.round(sb.length * density);
    const keep = new Set(
      [...scored].sort((a, b) => b.s - a.s).slice(0, keepN).map((o) => o.i),
    );

    // --- patterns per 8-beat phrase
    let pat = null, params = null;
    const xs = [];
    sb.forEach((t, i) => {
      if (i % 8 === 0) {
        pat = rng.pick(PATTERNS_BY_ENERGY[tier]);
        params = { phase: rng.pick([0, Math.PI]), dir: rng.pick([-1, 1]), base: rng.pick([-0.45, 0, 0.45]) };
      }
      let x = PATTERNS[pat](i % 8, params);
      if (isFirst) x *= 0.6; // tutorial: gentle
      xs.push(clamp(x, -AMP, AMP));
    });

    const secNotes = [];
    sb.forEach((t, i) => {
      if (t < tutorialDelay) return;
      if (!keep.has(i)) return;
      const n = { t, x: xs[i], section: si, kind: 'gpu' };
      notes.push(n);
      secNotes.push(n);
    });
    // sometimes add off-beat 8th notes in high-energy sections (on strong onsets)
    if (tier === 'high' && density >= 0.95) {
      for (let i = 0; i < sb.length - 1; i++) {
        const tm = (sb[i] + sb[i + 1]) / 2;
        if (tm < tutorialDelay) continue;
        if (onsetStrengthAt(tm) > 0.55 && rng.chance(0.5)) {
          const n = { t: tm, x: clamp((xs[i] + xs[i + 1]) / 2, -AMP, AMP), section: si, kind: 'gpu' };
          notes.push(n); secNotes.push(n);
        }
      }
    }
    sec.noteCount = secNotes.length;

    // --- halo rings on downbeats
    const ringEveryBars = isFirst ? 99 : tier === 'high' ? 2 : tier === 'mid' ? 3 : 4;
    const downs = sb.map((t, i) => ({ t, i })).filter((o) => downSet.has(o.t.toFixed(3)) && o.t > tutorialDelay + 0.5);
    downs.forEach((d, k) => {
      if (k % ringEveryBars === 1) rings.push({ t: d.t, x: xs[d.i], section: si });
    });
    if (isFirst) {
      // tutorial: exactly one ring, near the end of the intro
      const d = downs[Math.max(0, downs.length - 2)];
      if (d) rings.push({ t: d.t, x: xs[d.i] * 0.5, section: si, tutorial: true });
    }
    // one chain per chorus: 4-5 consecutive beats, a third of the way in
    if (sec.part === 'chorus' || (tier === 'high' && !isFirst)) {
      const len = sec.energy > 0.8 ? 5 : 4;
      const startIdx = Math.max(0, Math.floor(sb.length * 0.4) - (Math.floor(sb.length * 0.4) % 4));
      const cid = ++chainId;
      for (let k = 0; k < len && startIdx + k < sb.length; k++) {
        const t = sb[startIdx + k];
        // remove stray single rings that collide
        for (let r = rings.length - 1; r >= 0; r--) if (Math.abs(rings[r].t - t) < 0.01 && !rings[r].chain) rings.splice(r, 1);
        rings.push({ t, x: xs[startIdx + k], section: si, chain: cid, idx: k, len });
      }
    }

    // --- hazards on off-beats
    const hz = sec.hazardRate ?? 0;
    const types = theme.hazards && theme.hazards.length ? theme.hazards : ['oom'];
    let hzCount = 0;
    if (hz > 0 && !isFirst) {
      for (let i = 0; i < sb.length - 1; i++) {
        const tm = (sb[i] + sb[i + 1]) / 2;
        if (tm < sec.start + 0.3 + beatLen * 2) continue;
        if (!rng.chance(hz)) continue;
        // keep away from ring chains so they stay pure fun
        if (rings.some((r) => r.chain && Math.abs(r.t - tm) < beatLen * 1.1)) continue;
        // the path the player naturally takes between the two beats
        const path = (xs[i] + xs[i + 1]) / 2;
        const w = rng.range(0.4, 0.55);
        // anywhere that keeps clear of the path the music wants you on (centre included, so camping doesn't work)
        let x = null;
        for (let k = 0; k < 12 && x === null; k++) {
          const c = rng.range(-0.78, 0.78);
          if (Math.abs(c - path) >= w / 2 + 0.28 && Math.abs(c - xs[i + 1]) >= w / 2 + 0.15) x = c;
        }
        if (x === null) continue;
        const lo = x - w / 2, hi = x + w / 2;
        const gap = Math.max(lo - -1, 1 - hi);
        if (gap < 0.5) continue;
        hazards.push({ t: tm, x, w, type: types[hzCount++ % types.length], section: si }); // round-robin so every gag shows up
        i += tier === 'high' ? 1 : 2; // no back-to-back spam
      }
    }

    // --- power-ups: one every ~22 s, never in first section
    if (!isFirst) {
      for (let i = 4; i < sb.length - 1; i++) {
        const tm = (sb[i] + sb[i + 1]) / 2;
        if (tm - lastPowerT < 22) continue;
        if (hazards.some((h) => Math.abs(h.t - tm) < beatLen * 1.5)) continue;
        if (rings.some((r) => r.chain && Math.abs(r.t - tm) < beatLen * 2)) continue;
        powerups.push({ t: tm, x: clamp((xs[i] + xs[i + 1]) / 2, -0.7, 0.7), type: POWERUPS[powerIdx++ % POWERUPS.length], section: si });
        lastPowerT = tm;
      }
    }
  });

  const byT = (a, b) => a.t - b.t;
  notes.sort(byT); hazards.sort(byT); rings.sort(byT); powerups.sort(byT);
  return { notes, hazards, rings, powerups, beats, beatLen, sections };
}

function makeOnsetLookup(onsets, win) {
  const ts = onsets.map((o) => o.t);
  return (t) => {
    // binary search nearest
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ts[m] < t) lo = m + 1; else hi = m; }
    let best = 0;
    for (let k = Math.max(0, lo - 2); k <= Math.min(ts.length - 1, lo + 2); k++) {
      if (Math.abs(ts[k] - t) <= win) best = Math.max(best, onsets[k].s);
    }
    return best;
  };
}

export function sectionAt(sections, t) {
  for (let i = sections.length - 1; i >= 0; i--) if (t >= sections[i].start) return i;
  return 0;
}
