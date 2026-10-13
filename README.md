# P(DOOM) GRAND PRIX

A webcam-steered kart rhythm game set to "I'm Upping My P(Doom)". Hold an invisible steering wheel, drive through the GPUs on the beat, fly through halos, and save humanity.

## Run it (offline)

```bash
python3 -m http.server 8000
# open http://localhost:8000 in Chrome (webcam only works on localhost / https)
```

Everything is vendored in `vendor/` (three.js r186, MediaPipe Tasks Vision 0.10.35 plus the hand model, and the Fredoka and Baloo 2 fonts). No network is needed at runtime.

## Two versions

- **v1 (classic):** `http://localhost:8000/`. Toon-shaded, a straight-ish road, the original build.
- **v2 (realistic):** `http://localhost:8000/v2/`. A Mario-Kart-World-style overhaul:
  - **Rendering:** realistic (PBR) materials, sky-based (HDRI) lighting, soft sun shadows, ambient occlusion, bloom and physical skies.
  - **Course:** a real 3D track with turns, hills, banking, an elevated highway, bridges over water, data-centre tunnels, a rainbow road into space, an "AGI WINGS" glide back down, the hairpin on "sharp left turn", a cliff over the ocean, a banked stadium and a launch ramp.
  - **Rival karts:** OpenSauce, DeepMined, PAUSE KART and e/acc.
  - **Jokes:** an AI driving assistant that comments on your driving, live billboards that roast your actual stats, and four extra hazards.
  - **Shared code:** v2 uses the same song, beatmap, hand tracking and input as v1 (`src/`); its own renderer, course and art live in `v2/src/`.
  - **Quality:** `?quality=low|med|high|ultra` (default high; it steps down automatically if FPS drops), or press **O** to cycle.

## Controls

| Input                  | What                                                    |
| ---------------------- | ------------------------------------------------------- |
| Both hands (webcam)    | Tilt an invisible steering wheel to steer               |
| Both hands up high     | Boost (FEEL THE AGI)                                    |
| ← → / A D, Space       | Keyboard steer / boost (always works, even in webcam mode) |
| W                      | Toggle webcam steering mid-race                         |
| Enter                  | Play (keyboard) from the title; retrain from results    |

**Dev keys:** `D` debug overlay · `1–9 0 - =` jump to sections 1–12 · `[ ]` latency ±10 ms · `P` pause · `G` god mode · `B` autopilot · `O` outlines on/off · `R` restart · `Esc` menu.
**URL params:** `?section=N` (start in section N, keyboard) · `?autopilot` (bot drives; good for a backup recording) · `?debug` · `?tap=1` (press **S** to log section starts by ear).

## Files

- `tools/analyze.py` re-runs the audio and lyric analysis: `.venv/bin/python tools/analyze.py`. It writes `assets/beatmap.json`, `assets/sections.json` and `assets/lyrics.lrc`.
- `PLAN.md` holds the creative plan: the sections, themes, gags and the reasons behind them.
- `assets/sections.json` sets each section's theme, density and hazard rate. Edit these to re-theme or re-balance (the theme ids are in `src/themes/index.js`).
- `src/main.js` holds the game rules and the `TUNE` constants for P(doom) balance. v2's copy is `v2/src/main.js`.
- `v2/src/course.js` defines the v2 track: pieces (turns and rises, timed to the song) and features (bridge, tunnel, rainbow, jump…).
- `v2/src/looks.js` sets the per-theme lighting, sky and fog. The CC0 asset credits are in `assets/v2/CREDITS.md`.

## Demo-day checklist

- [ ] Wifi off, reload, play a full run (everything is local).
- [ ] Grant webcam permission in Chrome ahead of time.
- [ ] Light: face the player towards a light source if tracking is flaky.
- [ ] Laptop plugged in, notifications off, browser fullscreen (Cmd+Ctrl+F), volume checked through the venue speakers.
- [ ] Press W mid-race to make sure the keyboard fallback works.
- [ ] Backup video of a full run: `refs/backup-run.mp4`.
- [ ] One-sentence pitch for volunteers: "Hold an invisible steering wheel, drive through the GPUs, save humanity."
