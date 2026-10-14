# v3 brief (shared by every v3 agent)

Project: /Users/nafis/Documents/personal/p-doom-grand-prix. **v3 lives in `v3/`** (`v3/index.html`, `v3/src/`); it's a fork of v2. Do NOT touch v1 (`/src`, `/index.html`) or `v2/`. The dev server is already running at http://localhost:8000/v3/index.html (don't start another one).

Read first: `PLAN-V3.md` (the measurements + decisions), `v3/src/scale.js`, the theme contract in `v3/src/themes/index.js`, and the old v2 brief `tools/V2_THEME_BRIEF.md`. That brief still describes the toolkit, textures, models and the comedy rules; v3 changes the numbers below.

## The goal

Match Mario Kart World's **scale and feel** (the user's words: "more realistic, mainly on the scale and the environment; zoom out a little; every scene, the environment, skies, obstacles, halos and all the effects need to be very smooth, kind of realistic but still cartoonish"). Stylised realism means:
- chunky, rounded, toy-like forms, with realistic light and materials;
- smooth geometry (enough segments, bevels, no faceting on curved hero shapes);
- soft gradients, soft particles, nothing that pops or flickers.

Reference stills live in `/Users/nafis/Documents/personal/mario-kart-stills/`; look at a few that match your area. Don't copy Nintendo characters, items or tracks.

## v3 scale (world units)
- **Kart and camera:** the hero kart is 1.69 wide (**kw**) and kart+driver is ≈1.86 tall (**kh**). The camera sits 3.3 above the road and ≈5.6 behind the kart, at a 58° vertical FOV and 13° pitch, so the horizon lands at ~29% from the top of the frame.
- **Road:** ±10.5 (`ROAD_HALF`), kerbs to ±11.8. Gameplay lanes span ±8.2 (`LANE`).
- **Speed:** 38 units/s.
- **Effective world scale:** 1 world unit ≈ 0.75 m of a real place, with MK's slightly oversized toy details.

**Target sizes (world units, from the MK measurements):**

| Category | Items and sizes |
| --- | --- |
| Small | cones/barrels/crates/tyres 1.2–2 · guardrails, low walls, fences 1.6–2.2 · mailboxes and bins 1.5–2 · people/robots/spectators 2.6–3 |
| Vehicles | parked cars ≈6 long × 2.6 wide × 2.2 tall · trucks 12–16 long × 5 tall |
| Signage | road signs on posts 4–5 total · billboards: board 4–6 tall on 3–5 posts (8–11 total) · street lamps / light poles 9–11 |
| Buildings | doors ≈3 (garage doors 7–9) · 1–2 storey houses/shops 9–14 · trees 10–20 (palms 12–18) |
| Big structures | arches/gates spanning the road 13–20 tall, posts outside ±13 · pillars and towers 10–40 |
| Landmarks | skyline and distant landmarks 60–300+, at \|x\| 60–400 |

Gameplay items (scale.js): GPU ≈1.6 wide, halo radius 1.75, power-ups ≈2 across, hazards scaled to road-normalized width and 0.8× height.

**Measuring:**
- `__dbg.measure()` gives the frame metrics in MK terms.
- `__dbg.propSizes()` gives every live prop's bounding box. Its `h` and `kh` are reliable; `w` and `d` are world-axis-aligned, so rotation inflates them.
- Run either through CDP `eval` steps.

**Layouts:**
- Old v2 layouts are shifted out by 1.5 automatically when |x| > 9.2. New placements should use `abs: true` with v3 numbers: ground props at |x| ≥ 12.3.
- Anything spanning the road must clear ±12.5.
- Inner sides of tight corners have little room; v3 has sharper MK-style corners and a real 175° hairpin at 80.4–83.3 s.

## What MK does that we want (from the measurement passes)
- **Skies:** saturated cyan-to-cobalt gradient with big, bright, soft-volumed cumulus near the horizon. Dusk is pink/mauve; night is deep navy with dense small stars and an aurora-like glow.
- **Aerial perspective:** strong and deliberate. Distant scenery washes to a pale, theme-tinted haze (cream in the desert, blue-grey in the hills, teal indoors) within a few hundred metres, and stays desaturated.
- **Density and scale:**
  - Trackside detail is dense: barriers, fences, flags, banners, signs, spectators and clutter.
  - Big landmarks sit in the mid and far distance: towers, mesas, cranes, stadium lights.
  - Architecture is huge relative to the karts: arches 8–10 kh, pillars 5+ kh.
- **Lighting:** a hard bright sun with crisp, narrow-penumbra shadows (dark, not black) and soft AO.
- **Materials:**
  - Roads have dense high-frequency detail: aggregate, cracks, patches, dark skid streaks, worn paint.
  - Lane dashes are 0.1–0.2 kw wide and ≈10 kw long; kerbs are bold.
- **Effects:**
  - Chunky and colourful, with bloom.
  - Drift sparks are small (0.15–0.3 kh); mini-turbo and boost flames are 0.3–0.75 kw cones.
  - Dust is ≈1 kw puffs; item-break shards are glowing.
  - Radial speed blur on boost.

## Rules
- **Only edit the files you own** (listed in your task). If you need something from another file, say so in your final report.
- **Performance:** hold 60 fps on a MacBook Pro next to webcam hand tracking.
  - Share geometries and materials (toolkit caches them).
  - Use InstancedMesh / mergeGeometries for repeats.
  - No per-frame allocations.
  - Draw calls should stay roughly where they are, at most +20%; check `calls:` in the `?debug` overlay.
- **New assets:** CC0 only (Poly Haven `https://api.polyhaven.com`, ambientCG). Put them under `assets/v3/<area>/…` and keep them small: 1k textures, low-poly glTF, under ~8 MB per agent. Credit them in `assets/v3/credits/<your-area>.md`. Themes register glTFs via `theme.models` (see the contract); render code can load its own.
- **Commits:** don't commit. The coordinator commits.

## Testing (required)
Use `node tools/cdp-shot.mjs "<url>" <outprefix> <steps.json>`. It runs headless Chrome over CDP, with its own port and profile, so parallel runs are fine.
- **Steps:** `{"wait":ms}`, `{"shot":"name"}`, `{"eval":"js"}`, `{"key":"Digit3"}`.
- **URLs:** `http://localhost:8000/v3/index.html?section=N&autopilot&debug` (N = 1..12). Boot takes ~6 s.
- **Outputs:** keep them under `/private/tmp/claude-501/-Users-nafis-Documents-personal-p-doom-grand-prix/e15328c3-b779-4e6a-9f4e-1fbeeb086cb4/scratchpad/<your-area>/`.
- **Look** at your screenshots (Read the jpg). Compare them side by side with a matching MK still and iterate several times.
- **Check** the console output for errors.
- **Contact sheets:** the Pillow venv at `…/scratchpad/imgenv/bin/python -I` can build them.

**Final report:** 15 lines or fewer. Say what changed, before→after numbers where relevant (sizes, draw calls, fps), and any requests for other owners.
