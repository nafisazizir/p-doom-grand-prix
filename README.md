# P(DOOM) Grand Prix

A webcam-steered kart rhythm game set to "I'm Upping My P(Doom)". Hold an invisible steering wheel, drive through the GPUs on the beat, save humanity.

Built with three.js and MediaPipe hand tracking. Runs entirely in the browser, offline.

## Getting Started

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome. Webcam access requires `localhost` or HTTPS.

All dependencies are vendored in `vendor/` (three.js r186, MediaPipe Tasks Vision 0.10.35, Fredoka and Baloo 2 fonts). No build step, no network at runtime.

## Versions

| Path   | Description                                                                         |
| ------ | ----------------------------------------------------------------------------------- |
| `/`    | v1. Toon-shaded, original build.                                                    |
| `/v2/` | v2. PBR materials, HDRI lighting, 3D course with turns, hills and jumps, rival karts. |
| `/v3/` | v3. v2 rebuilt at Mario Kart World proportions: camera, kart, road and prop scale.  |

v2 and v3 accept `?quality=low|med|high|ultra` (auto-steps down on low FPS). Press `O` to cycle.

## Controls

| Input               | Action                                |
| ------------------- | ------------------------------------- |
| Both hands (webcam) | Tilt to steer                         |
| Both hands raised   | Boost                                 |
| `←` `→` / `A` `D`   | Steer                                 |
| `Space`             | Boost                                 |
| `W`                 | Toggle webcam steering                |
| `Enter`             | Play (keyboard) / retrain             |
| `P`                 | Pause (v2/v3: drag to orbit, scroll to zoom) |
| `H`                 | Hide HUD                              |
| `Esc`               | Menu                                  |

Dev keys: `D` debug overlay, `1`–`9` `0` `-` `=` jump to section 1–12, `[` `]` latency ±10 ms, `G` god mode, `B` autopilot, `R` restart.

URL params: `?section=N`, `?autopilot`, `?debug`.

## Project Structure

```
assets/          song, beatmap, lyrics, sections; v2/v3 textures, HDRIs, models
src/             v1 game + shared audio, beatmap, hand tracking, input
v2/src/          v2 renderer, course, themes
v3/src/          v3 renderer, course, themes (scale constants in scale.js)
tools/           offline audio + lyric analysis
vendor/          three.js, MediaPipe, fonts
```

`assets/sections.json` sets each section's theme, density and hazard rate. Game balance lives in the `TUNE` constants in `src/main.js` (and `v2/src/main.js`, `v3/src/main.js`).

## Regenerating the Beatmap

```bash
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
.venv/bin/python tools/analyze.py   # beatmap.json, sections.json, lyrics.lrc
.venv/bin/python tools/karaoke.py   # lyrics_words.json
```

## Credits

- Song: "I'm Upping My P(Doom)" by Claude Pop.
- Inspired by @RhysSullivan's P(doom) Beat Saber map.
- v2/v3 textures, HDRIs and models: CC0 from ambientCG and Poly Haven. See [`assets/v2/CREDITS.md`](assets/v2/CREDITS.md).
