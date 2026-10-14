// Theme registry.
//
// THEME CONTRACT (each file in src/themes/ default-exports one of these; may also export named variants):
// {
//   id: 'garage',                    // must match the key used in sections.json "theme"
//   title: 'GARAGE STARTUP',         // shown on the gate + title card
//   subtitle: 'est. last tuesday',   // small line under the title card
//   night: false,                    // true → star field visible
//   palette: { skyTop, skyBottom, fog?, road, ground, kerb?, accent1, accent2 },  // CSS hex strings
//   spacing: 10,                     // world units between layout() calls
//   layout(zf, rng, sec) → [{ kind, x, y?, dz?, rotY?, scale? }]
//       x = lateral world offset from the road centre (road surface is ±7, kerbs to ±8.1).
//       Keep ground props at |x| ≥ 9.5. Overhead props (spanning the road) need y ≥ 7.
//       Objects face +z (towards the oncoming camera) by default.
//   makeProp(kind) → THREE.Object3D  // built with ../toolkit.js; pooled + reused per kind, so no per-instance state
//   animate?(obj, kind, t, beatPhase, entry)   // optional per-frame animation (t = song seconds, beatPhase 0..1)
//   billboards: ['SERIES A ✓', ...], billboardEvery: 75, billboardStyle?: { bg, fg, border, frame, postColor }
//   hazards: ['oom', ...]            // ids from ../hazards.js
//   enterLines?: ['...']             // announcer lines on entering the section (one is picked)
// }
import garage from './garage.js';
import datacenter, { datacenterFire } from './datacenter.js';
import chatbot, { sydney } from './chatbot.js';
import shoggoth from './shoggoth.js';
import stadium from './stadium.js';
import latent from './latent.js';
import badlands from './badlands.js';
import paperclip from './paperclip.js';
import takeoff from './takeoff.js';

const list = [garage, datacenter, datacenterFire, chatbot, sydney, shoggoth, stadium, latent, badlands, paperclip, takeoff].filter(Boolean);
export const THEMES = Object.fromEntries(list.map((t) => [t.id, t]));

export function getTheme(id) {
  return THEMES[id] || garage;
}
