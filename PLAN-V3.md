# P(DOOM) GRAND PRIX v3: world scale

v3 (`/v3/`) is a fork of v2's renderer and course, rebuilt around **Mario Kart World's proportions**: the camera, kart, road, corners, props and effects are sized from measurements of 33 MKW stills (`../mario-kart-stills`). v2 is untouched.

## Measurements (refs/mk-measure/batch_{a,b,c}.json)

Three passes measured every still on a 1456×819 frame. Bikes, drifts, glides and wall rides were excluded from the camera fit. The normal-driving consensus:

| Metric | MK World | v2 | v3 |
| --- | --- | --- | --- |
| Kart width on screen | 218 px (15% of width) | 214 px | 222 px |
| Rear-wheel contact y | 675 (82%) | 675 | 683 |
| Horizon y | 240 (29% from top) | 381 (47%) | 241 |
| Kart+driver height / kart width | 1.13–1.3 | 1.05 | 1.03 |
| Road width (kart widths) | 10–11 normal roads, ~20 circuits | 4.4 | 10.4 |
| Camera height | 1.95 kw | 1.37 kw | 1.95 kw |
| Camera → rear wheels | ≈3.0 kw at 58° vFOV | ≈3.3 kw at 60° (with lag) | 3.0 kw, no lag |
| Pitch | ≈13° down | ≈2° | 13° |
| Hairpin radius | 10–15 kw inner kerb | ≈24 kw | ≈21 kw centre line |

Camera solve (`scratchpad camsolve.py`): pinhole with horizon, contact y and kart width px, for an assumed vFOV. The FOV estimates from converging verticals ranged 42–65°, so v3 uses 58°.

**Object scale in MK** (kh = kart+driver height ≈ 1.86 world units in v3, kw = kart width = 1.69):

| Object | Size |
| --- | --- |
| Arches/gates spanning the road | 6.5–11 kh |
| Street lamps | 5–6 kh |
| Garage doors | 4–5 kh |
| Sign towers | 4–5 kh |
| Billboards | 2–2.5 kh |
| Spectators | 1.5 kh |
| Warp pipes | 1.2–1.5 kh |
| Guardrails and median walls | 1–1.1 kh |
| Item boxes | 0.45–1.3 kh (accounts differ) |
| Coins | ≈0.5 kh |
| Drift sparks | 0.15–0.3 kh |
| Boost flames | 0.3–0.75 kw |
| Dust puffs | 0.7–1 kw |
| Lane dashes | 0.1–0.2 kw wide, ≈10 kw long, ≈10 kw gaps |
| Kerbs | 0.5–2 kw |

**Style:**
- Saturated cyan skies with big soft cumulus.
- Strong aerial perspective: distant scenery washes towards a pale, theme-tinted haze within a few hundred metres.
- Hard sun with narrow-penumbra shadows (dark, not black) and soft AO.
- Dense high-frequency road detail: aggregate, cracks, patches, skid streaks, worn paint.
- High-key, saturated grading with complementary warm/teal palettes.
- Bloom on emissives and pickups; radial speed blur on boost.

## Core decisions (done in the core pass)

- **The karts shrink; the world doesn't** (`v3/src/scale.js`). `KART_SCALE = 0.5`, so the hero is 1.69 wide and props are relatively 2× bigger, just like MK's toy karts in a full-size world. 38 world units/s is then ≈ 11 camera heights per second, close to MK 150cc.
- **Road 18 → 21 wide** (`ROAD_HALF = 10.5`, `LANE = 8.2`). Theme layouts written for v2 shift side props out automatically (`p.abs` opts out).
- **Chase camera** = the MK solve. There is no positional lag along the track (v2's lerp added 2.7 m). Hops and glides ease vertically. Boost adds +8° FOV and pulls back 0.6 kw.
- **Items:** GPU ≈ 0.95 kw, halo ≈ 2 kw across, power-ups ≈ 1.1 kw, hazard height ×0.8.
- **Corners:** MK-style medium corners. The hairpin is a real 175° hairpin on "sharp left turn", plus S-bends in the badlands and paperclip sections. Banking tops out at 0.2 rad except the stadium (0.42).
- `__dbg.measure()` reports the frame in the same units as the stills, so changes can be checked numerically.

## Passes (parallel agents, one owner per file)

| Owner | Files | Goal |
| --- | --- | --- |
| Atmosphere / world | render.js, looks.js, textures.js, track.js | MK skies (volumetric-looking cumulus), aerial perspective, grading, shadows tuned to the small kart, road detail and lines at MK proportions, kerbs, terrain, water |
| Effects / items | entities.js, hazards.js, particles.js, kart.js, rivals.js, main.js (effects code only) | Smooth soft particles, MK-sized boost flames, sparks, dust, glossy halos and GPUs, obstacles at kart scale, rival kart models at hero quality |
| Theme agents (×5) | themes/*.js | Re-scale every prop to the MK object table, widen spanning props to the v3 road, denser trackside detail, bigger skylines, smoother geometry |

The brief for all agents is `tools/V3_BRIEF.md`.

## Outcome (2026-10-14)

- **Frame matches MK.** In section 1 v3 measures a kart 220 px wide, the wheels at y=679 and the horizon at y=239. Road width is 10.4 kart widths across every section, and boost widens the FOV the way MK does.
- **Every theme was re-scaled against the MK object table** with `__dbg.propSizes()`:
  - Lamps 10–11.
  - Houses 10–15, palms 12–20.
  - Arches and gantries 14–18, with posts outside ±13.
  - Skylines and landmarks 60–320.
  - Stands 30, floodlights 50.
- **Atmosphere:**
  - Gradient skies with lit cumulus.
  - Haze that washes distance to the theme colour.
  - Far ridges.
  - The MK grade, plus a radial speed blur on boost.
  - Crisp shadows sized to the small kart.
  - Road wear detail.
- **Effects:**
  - Soft instanced sprite particles (glow, sparkle, streak, shard).
  - Shader flames and drift sparks.
  - Contact shadows.
  - Rivals on the hero chassis.
  - Glossy halos and GPUs, iridescent item-box power-ups, and the 15 hazards rebuilt at kart height.
- **Smoothness:**
  - Props are prewarmed in idle time, with shaders compiled async.
  - Emoji glyphs are rasterized at boot.
  - Worst frame over a full autopilot run went from 183 ms to 67 ms (that one is the glide start).
  - Headless runs hold 60 fps.
  - Draw calls are 1000–2300 including shadow and AO passes, about v2 ±10%.
- **QA fixes:**
  - The desert is hidden while still on the rainbow road.
  - The clifftop sea reads blue, with the sea side kept clear past the cliff.
  - The Sydney crossing is an open bay (shore 45 → 100).
  - `model()` keeps its size when spawned.
