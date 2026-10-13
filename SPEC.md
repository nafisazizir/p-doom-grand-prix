# P(DOOM) GRAND PRIX — Build Spec

> A webcam-steered kart racing rhythm game set to the song "P(doom)".
> Hold an invisible steering wheel in front of your laptop, drive through GPUs on the beat, dodge AI-culture hazards, and try to finish the song with humanity's P(doom) as low as possible.

**Build window:** 2 hours, live, at a community build event. **Demo:** on a laptop, with audience members playing.
**Goals, in priority order:** (1) it works on stage, (2) it gets laughs, (3) it looks great.

---

## 0. Instructions for Claude Code (read first)

- **Work in milestones (section 9) and commit to git after each one**, so there's always a demo-able version to roll back to.
- **Never break the game.** After every milestone, the game must load and play start to finish with keyboard controls.
- **You own the creative decisions.** The user provides raw material only (audio, lyrics, reference videos). You work out the song structure, section timings, themes, gags and difficulty yourself, using your own taste (section 1). Write your decisions to `PLAN.md`, print a short summary, and **keep building without waiting for approval**. The user will interrupt if they want changes.
- **Prefer simple and juicy over complex and correct.** If a feature takes more than 10 minutes to debug, cut it (see the cut list in section 10).
- **No build step.** Plain ES modules plus an import map, served locally. Everything must work offline (venue wifi is unreliable).
- **Reference media in `refs/`** (screenshots and video of @RhysSullivan's Beat Saber map for this song) is for _game feel and the formula only_: song section → themed scene → AI-culture visual gag. **Do not copy his characters, scenes, HUD layout or art.** Our game must look clearly different.
- **Do not imitate any existing kart game's characters, items or tracks.** Keep everything original: our own mascot, our own pickups, our own tracks. "Arcade kart racer" is the genre, not a specific game.

---

## 1. Inputs, and how Claude Code turns them into a plan

### 1.1 What the user drops in (raw, unprocessed, any filenames)

```
assets/
  song.mp3 (or .wav/.m4a)   # the P(doom) track — the only required file
  lyrics.txt                # OPTIONAL — plain lyrics, no timestamps
  ...any other assets       # images, logos, fonts the user wants used
refs/
  rhys-*.mp4 / *.png        # @RhysSullivan's Beat Saber map clips + screenshots
  mv-*.mp4                  # OPTIONAL — music video(s) for the song
```

Discover what's there yourself (`ls -R assets refs`). Don't ask the user to rename or format anything.

### 1.2 Analysis pipeline (Milestone 0, timebox: 15 min total)

Run as `tools/analyze.py`. Each step has a fallback, so nothing blocks the build.

**Step A — Audio structure (librosa, ~3 min to write)**

- Beats + BPM (`beat_track`), onsets + strength (`onset_detect`, `onset_strength`), RMS energy curve.
- **Section boundaries:** beat-synchronous chroma + MFCC features → `librosa.segment.agglomerative` (try k = 6–8) → snap each boundary to the nearest bar (4 beats) → merge any section shorter than ~8 s.
- **Label each section** by mean energy (low = intro/verse/bridge, high = chorus/drop) and by repetition (segments whose features are similar to an earlier one = repeat of that chorus/verse).
- **Fallback:** if segmentation looks wrong (one giant section, or many tiny ones), split the song into 6–8 equal sections snapped to 8-bar boundaries and rank them by energy.

**Step B — Lyrics timing (optional, only if `lyrics.txt` exists)**

- Try `faster-whisper` (small/base model) on the song with word timestamps, then fuzzy-match transcript words to `lyrics.txt` lines to get a start time per line → `assets/lyrics.lrc`. Sung vocals transcribe imperfectly; that's fine, the fuzzy match only needs to be roughly right.
- **Fallback:** if whisper won't install or alignment is poor, skip captions. Still use the lyrics text to understand what the song is about, and assign lyric chunks to sections in order, proportionally by section length, for theming only.

**Step C — Visual references (~3 min)**

- Use `ffmpeg` to extract frames from each reference video (1 frame every 3–5 s, scaled to 640 px wide), tile them into 1–2 contact sheets per video (`ffmpeg tile` filter), and **look at them**.
- From Rhys's clips: note the game feel (note speed, spawn distance, density) and the formula (each lyric → a themed room with an AI-culture visual gag). **Do not copy** his characters, scenes or HUD.
- From the music video (if provided): note its imagery, jokes and colour moods per part of the song, and use them as inspiration for matching section themes.

**Step D — Write `PLAN.md` and `assets/sections.json`**

`PLAN.md` holds a table, one row per section:

| #   | Start–end (s) | Energy | Song part | What the lyrics/MV are about here | Theme (from 5.3, or a new one) | Signature gag | Density | Hazard rate |
| --- | ------------- | ------ | --------- | --------------------------------- | ------------------------------ | ------------- | ------- | ----------- |

Rules of taste:

- **Difficulty follows energy.** Quiet parts = sparse, wide patterns, no hazards. Choruses = dense, fast patterns, halo chains. The final chorus is the hardest and most chaotic.
- **Repeated choruses get the same base theme with an escalation** (e.g. the second time through the data centre is on fire).
- **The theme should match the lyric content** of that part where possible; that's where most of the laughs come from.
- **The first section is a tutorial in disguise:** easy GPUs, one ring, a sign saying "HOLD THE WHEEL. DRIVE THROUGH THE GPUS. SAVE HUMANITY."

`assets/sections.json` is the machine-readable version the game loads:

```json
[
  {
    "id": "s1",
    "start": 0.0,
    "end": 18.4,
    "energy": 0.3,
    "part": "intro",
    "theme": "garage",
    "density": 0.5,
    "hazardRate": 0.0
  },
  {
    "id": "s2",
    "start": 18.4,
    "end": 41.0,
    "energy": 0.6,
    "part": "verse",
    "theme": "datacenter",
    "density": 0.7,
    "hazardRate": 0.1
  }
]
```

Print a 5–10 line summary of the plan to the user, then continue straight into Milestone 1.

**Manual override (optional, only build if time allows):** `?tap=1` plays the song and logs `currentTime` on each **S** keypress, so the user can re-mark section starts by ear if the automatic ones feel off.

---

## 2. Tech stack

| Concern       | Choice                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Rendering     | **Three.js** (ES module), `MeshToonMaterial` + `OutlineEffect`                                           |
| Post FX       | Optional `UnrealBloomPass` (cut first if FPS drops)                                                      |
| Hand tracking | **MediaPipe Tasks Vision — HandLandmarker** (GPU delegate, `numHands: 2`, VIDEO mode)                    |
| Audio         | **Web Audio API**: decode `song.mp3` into an `AudioBuffer`, play via `AudioBufferSourceNode`             |
| Beatmap       | Offline Python script with **librosa** → `assets/beatmap.json` (JS fallback if librosa fails to install) |
| Text on signs | `CanvasTexture` with a chunky rounded font (e.g. Fredoka / Baloo 2, vendored locally)                    |
| Serving       | `python3 -m http.server 8000` (webcam works on `localhost`)                                              |

**Vendor everything locally** into `vendor/`: three.js + needed addons, `@mediapipe/tasks-vision` (JS + wasm), the `hand_landmarker.task` model file and fonts. No CDN calls at runtime.

### File structure

```
index.html
src/
  main.js          # boot, state machine (TITLE → CALIBRATE → COUNTDOWN → RACE → RESULTS)
  clock.js         # song-synced clock (single source of truth for time)
  audio.js         # load/play song, SFX
  beatmap.js       # load beatmap.json + sections.json, generate note/hazard layout
  track.js         # road, section themes, prop spawning/recycling
  kart.js          # player kart, lateral movement, spinout, boost visuals
  input.js         # unified steering input: webcam OR keyboard → steer value in [-1, 1]
  hands.js         # MediaPipe setup + steering-wheel math
  hud.js           # DOM overlay: P(doom), GPUs, combo, captions, webcam PiP, wheel widget
  gags.js          # popups, billboards, hazard effects, announcer lines
  themes/*.js      # one file per section theme (props, palette, sky, gag)
  debug.js         # debug overlay + dev shortcuts
tools/
  analyze.py       # audio structure, beats, sections, lyric timing, reference contact sheets
PLAN.md            # Claude Code's creative plan (sections, themes, gags)
assets/  refs/  vendor/
```

---

## 3. Core game design

### 3.1 The one rule that matters: everything is driven by song time

- `songTime = audioCtx.currentTime - startTime + latencyOffset`. **Never** use accumulated frame deltas for gameplay.
- The kart's forward position is `z = songTime * SPEED`. Each note sits at `z = note.time * SPEED`. Notes therefore reach the kart exactly on the beat, regardless of FPS.
- `latencyOffset` is adjustable in the debug menu (default 0, step ±10 ms).

### 3.2 The road

- One continuous road with a gentle procedural sway/curve for feel. Lateral position is normalized `x ∈ [-1, 1]` across the road width.
- The kart moves laterally only. Forward motion is fixed to song time.
- Lateral speed: `kartX += steer * LATERAL_SPEED * dt`, clamped to [-1, 1]. Tune so full lock crosses the road in ~0.6 s.
- The kart visually yaws/leans into turns (max ~15°), with a bit of squash-and-stretch.

### 3.3 Collectibles (the "notes")

- **GPU chips:** the main collectible, one per selected beat. Chunky, glowing, spinning, bobbing.
- Collected if `|kartX - note.x| < 0.18` when the note crosses the kart's z.
- On collect: pop + particle burst + "+1 GPU" floating text + pickup SFX + combo++ + `pDoom -= 0.004`.
- Missed (passed without collecting): combo resets, `pDoom += 0.006`, the note sadly deflates.
- **Lateral placement** is pattern-based so steering feels like dancing to the music, not random:
  - `sweep`: sine across the road, period 4 or 8 beats
  - `zigzag`: alternate left/right each beat
  - `stairs`: step across in 3 positions
  - `center`: hold the middle (breather)
  - Pick a pattern per 8-beat phrase, seeded RNG so every run is identical (people can learn it).
- Choruses use `density: 1.0` and faster patterns; verses are calmer.

### 3.4 Hazards (the jokes)

Placed on off-beats according to `hazardRate`, **never blocking every path**: always leave a gap at least 0.5 wide. Hitting one: kart spinout (0.6 s wobble, camera shake), `pDoom += 0.03`, combo reset and the hazard's gag effect.

### 3.5 P(doom)

- Starts at **0.50**. Range 0.00–1.00, shown with 2 decimals, big and orange on the HUD.
- Collecting pulls it down, misses and hazards push it up (numbers above; tune so a good run ends ~0.10 and a bad run ends ~0.90).
- When it crosses 0.80, the whole scene gets slightly redder and the announcer panics.

### 3.6 Boost (gesture bonus)

- **Webcam:** both hands raised high (palm centers in the top 30% of the frame) for 200 ms. **Keyboard:** Space.
- Boost is **visual and scoring only** (it must not change forward speed, or sync breaks): FOV punch 70 → 82, speed lines, exhaust flames, 2× GPU value for 2 seconds, then a 4-second cooldown.
- Announcer line on boost: "FEEL THE AGI!"

### 3.7 Halo rings (the main "go fast" reward)

Glowing golden **halo rings** float above the road (the alignment angel halo: driving through one makes you "more aligned").

- **Placement:** on strong downbeats (start of a bar / big onsets), roughly 1 every 2–4 bars, more in choruses. Lateral position follows the current note pattern, so lining up for a ring feels like part of the dance.
- **Hit:** the kart passes within `|kartX - ring.x| < 0.15` → **BOOST** triggers automatically (no button needed).
- **"Speed" without breaking sync:** forward position stays locked to song time (3.1). The _feeling_ of speed comes from the camera and effects: FOV punch 70 → 85, the camera pulls back and drops lower, speed lines streak in from the screen edges, side props motion-blur/stretch, exhaust turns into blue flames, and the kart does a little wheelie. It lasts 2 seconds and eases back out.
- **Ring chains:** rings spaced exactly 1 beat apart in a row (3–5 rings) = a **chain**. Each ring in the chain plays a rising note of a scale (do-re-mi-fa-SOL), and completing the chain fires a big "HALO CHAIN!" announcer line, fireworks, `pDoom -= 0.03` and a longer 4-second boost. Put one chain in every chorus.
- **Miss:** the ring dims and drifts away with a sad "wah" sound. No penalty — rings are pure reward.

### 3.8 Auto power-ups (no extra controls)

With only two hands on the wheel, every power-up **activates the moment you drive through it**. They're spinning, glowing chunky icons, about 1 every 20–30 seconds, never more than one on screen. Each one shows a big name card and has its own sound plus a timer bar under the P(doom) meter.

| Power-up                     | Looks like                        | Effect (duration)                                                                                 |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **RLHF Magnet**              | Giant thumbs-up 👍                | Auto-collects GPUs within 0.5 of the kart; they fly in with a whoosh (5 s)                        |
| **Safety Shield**            | Bubble with a "SAFE" sticker      | Absorbs the next hazard with a big "BLOCKED BY SAFETY TEAM" stamp (until used)                    |
| **Scaling Law**              | A graph going up-and-to-the-right | The kart grows 2× bigger and GPUs are worth 3× (4 s); the announcer yells "SCALE IS ALL YOU NEED" |
| **Compute Rain** _(stretch)_ | A cloud                           | It rains bonus GPUs across the whole road for 3 beats                                             |

Rules: power-ups never stack (a new one replaces the old), and none appear in the first section.

### 3.9 The reward loop (make every second feel good)

The goal: something satisfying happens every 1–2 seconds.

- **Rising pickup pitch:** each consecutive GPU in a combo plays its pickup blip **one semitone higher**, resetting on a miss. This is the single most satisfying cheap trick; do it first.
- **Combo tiers** with escalating visuals and sound:
  - ×10 "TOKENS PER SECOND: YES" — the kart gets a sparkle trail
  - ×25 "HUMANITY IS SO BACK" — the trail turns into a rainbow, the crowd/props cheer
  - ×50 "SUPERINTELLIGENT DRIVING" — the screen border glows gold, the mascot puts on sunglasses
- **Flawless section:** collect every GPU in a section → "FLAWLESS SECTION" card, a ding-ding-ding fanfare, `pDoom -= 0.05`.
- **Near miss:** passing within 0.25 of a hazard without hitting it → "CLOSE CALL" popup + a whoosh, +1 bonus GPU. This rewards brave driving.
- **Section transition:** driving into a new section goes through a big gate/arch with a whoosh, a flash and the section title card, so every section change feels like an event.

---

## 4. Webcam steering wheel (`hands.js`)

### 4.1 Setup

- Webcam at 640×480, `HandLandmarker` with GPU delegate, `numHands: 2`, `runningMode: "VIDEO"`.
- Run detection in a `requestVideoFrameCallback` loop, separate from the render loop.
- **Mirror the x-coordinates** (`x = 1 - x`) so screen-left is the player's left. **Test this explicitly: turning the wheel right must steer right.**
- Do **not** trust MediaPipe's handedness labels. Sort the two detected hands by mirrored x: smaller x = left hand.

### 4.2 Steering math

```
palm(h) = average of landmarks 0, 5, 9, 13, 17     // more stable than wrist alone
L = palm(leftHand), R = palm(rightHand)
angle = atan2(R.y - L.y, R.x - L.x)                // image y points down
// Right hand lower than left (clockwise wheel) → angle > 0 → steer right
deg = angle in degrees
if |deg| < 6        → raw = 0                       // dead zone
else                → raw = sign(deg) * min((|deg| - 6) / (40 - 6), 1)
steer = lerp(steer, raw, 0.25)                      // EMA smoothing per detection
```

- **Only one hand or none visible:** decay `steer` to 0 over 300 ms and show a "HANDS ON THE WHEEL!" warning on the HUD.
- **Calibration screen:** "Hold your invisible steering wheel." Starts once both hands are detected and level (|deg| < 6) for 1 second. Show a ring that fills up as the hold progresses.

### 4.3 Input abstraction

`input.js` exposes `getSteer() → [-1, 1]` and `getBoost() → bool`. Keyboard (←/→ or A/D, Space) always works, even while the webcam is active. **W** toggles webcam steering on/off mid-demo.

---

## 5. Art direction — "Toy box apocalypse"

The look: **a bright, chunky, toy-like kart racer that slowly realises it's in an AI doom song.** Cheerful plastic surfaces, saturated colours, cartoon outlines, while the signage and gags get increasingly unhinged.

### 5.1 Global rules

- **Toon shading:** `MeshToonMaterial` with a 3-step gradient map + `OutlineEffect` (thick-ish dark outlines). This one choice does most of the "good art" work.
- **Chunky primitives:** boxes, cylinders, capsules, slightly oversized, rounded where cheap. No realism attempts.
- **Per-theme palette:** each section defines `{ sky top, sky bottom, fog, road, accent1, accent2 }`. Fog color = sky bottom, to hide pop-in.
- **Sky:** gradient shader dome + a sparse star field for night themes.
- **Juice everywhere:** squash-and-stretch on pickups, bobbing props, camera shake on hits, particle bursts, screen-edge speed lines.
- **Text is the comedy engine.** Billboards, road signs, popups and the announcer carry most jokes. Make lots of them with `CanvasTexture`, cheap and readable.
- **Camera:** third-person chase cam, low and slightly behind, FOV 70, lags gently on turns.
- **Performance:** use `InstancedMesh` for repeated props (server racks, crowd, cones). Recycle props in a pool, never allocate per frame. Target 60 fps on a laptop with the webcam running.

### 5.2 The mascot (player kart)

**"Lil' H-1000"**: a smiling graphics card with stubby arms, wearing a too-big racing helmet, driving a tiny go-kart. Blinking dot eyes on the card's face. Its expression reacts: :) normal, :D on combo ≥ 10, x_x for a moment on a hazard hit, terrified when P(doom) > 0.8.

### 5.3 Section themes

Default set below. Map them to the detected sections (1.2) using your own judgment about what fits each part's lyrics, energy and music-video imagery. Feel free to drop, repeat, escalate or invent themes when something fits the song better. Each theme = palette + 3–5 prop types + 1 signature gag + 2–4 billboard jokes.

1. **Garage Startup** (intro): warm sunset. Cardboard boxes, pizza boxes, beanbags, a whiteboard with a hand-drawn line going up-and-to-the-right. Billboards: "SERIES A ✓", "WE'RE BASICALLY AGI (BETA)". Calm, no hazards.
2. **Data Centre Tunnel:** cool blue-teal, blinking server racks lining the walls (instanced), cable bundles overhead, fans spinning. Hazard: **"OUT OF MEMORY" barrier** blocks. Billboard: "GPU RICH ONLY BEYOND THIS POINT".
3. **Chatbot Highway:** pastel purple. Giant chat bubbles floating by. Signature gag: **"You're absolutely right!" popup windows** fly at the screen and splat onto the windscreen as HUD overlays if you hit them (stack them up — comedy of escalation).
4. **Benchmark Stadium:** stadium lights, a crowd of tiny cheering robots (instanced), a giant leaderboard where our score is always "#1 (SOTA)". Hazard: **"Test set leak" puddle**, slippery wobble. Announcer: "NEW STATE OF THE ART! (on a benchmark we made up)".
5. **Latent Space** (big chorus): neon gradient road floating in space, glowing floating dots/vectors, a constellation that spells out a vibe. Highest density, max juice, boost encouraged.
6. **Takeoff** (final section): the road becomes an exponential ramp curving upward into space, the P(doom) number on a giant board above, alarms, everything slightly red. Hazard: **"Ignore all previous instructions" road sign**: hitting it **inverts steering for 2 seconds** with a big "PROMPT INJECTED" banner. The final note launches the kart into the sky → results screen.

### 5.4 Gag bank (use for extra hazards, billboards, announcer lines)

Hazards / effects:

- **Hallucination puddle:** screen goes wavy for 1.5 s and fake GPUs appear that vanish when touched.
- **Rate limit wall:** "429: Try again in 4 hours", bounces you back.
- **Context window full:** the road narrows for a few beats.
- **"Thinking…" pit stop:** a spinner sign; hitting it freezes your steering for half a second.
- **"As an AI language model" speed bump.**

Billboards & signs:

- "Strawberry: how many R's? (3) (we checked)"
- "SCALE IS ALL YOU NEED → NEXT EXIT"
- "VIBE CODING ZONE: NO TESTS BEYOND THIS POINT"
- "ALIGNMENT DEPARTMENT: CLOSED FOR LUNCH"
- "Have you tried turning humanity off and on again?"

Announcer lines (big text popping in at the top center, ~1.5 s each, with a punchy SFX):

- On combo 10: "TOKENS PER SECOND: YES"
- On combo 25: "HUMANITY IS SO BACK"
- On a hazard: "THAT'S A HALLUCINATION" / "SKILL ISSUE" / "MISALIGNED!!"
- On P(doom) > 0.8: "WE ARE SO COOKED"
- On boost: "FEEL THE AGI!"

---

## 6. HUD & screens (DOM overlay over the canvas)

### 6.1 Race HUD

- **Top-left:** P(DOOM) big number (orange, chunky font, pulses on change) with a horizontal meter.
- **Top-right:** GPUs collected + combo counter ("x14").
- **Bottom-center:** lyric caption (if `lyrics.lrc` is provided), short lines with a soft drop shadow.
- **Bottom-right:** **webcam picture-in-picture** (mirrored, rounded corners, ~240 px wide) labelled **"HUMAN OPERATOR (unsupervised)"**. Draw the hand skeleton dots on it, plus a little **steering-wheel widget** that rotates with the detected angle. The audience watching the player flail is half the show.
- **Top-center:** announcer lines + current section name card when a new section starts (e.g. "TRACK 3 — CHATBOT HIGHWAY", slides in and out).

### 6.2 Screens

1. **TITLE:** "P(DOOM) GRAND PRIX" in chunky letters, the mascot idling on its kart, subtitle "Drive humanity to safety, one GPU at a time." Buttons: "PLAY (webcam)" and "PLAY (keyboard)". Small credits: song credit + "Inspired by @RhysSullivan's P(doom) Beat Saber map".
2. **CALIBRATE:** webcam big in the center, "Hold your invisible steering wheel", hold-ring fills when both hands are level for 1 s. Skip button for keyboard mode.
3. **COUNTDOWN:** 3… 2… 1… with gags: "3 — Loading weights" / "2 — Ignoring safety team" / "1 — SHIP IT".
4. **RACE.**
5. **RESULTS** by final P(doom):
   - **< 0.20:** "ALIGNED. Humanity thanks you. Please rate this conversation 👍"
   - **0.20–0.50:** "Mostly aligned. Some side effects may occur."
   - **0.50–0.80:** "Concerning. A strongly worded open letter has been drafted."
   - **> 0.80:** "DOOM. You're absolutely right!" (with the popup splat effect over the whole screen)
   - Also show: GPUs collected, max combo, a fake "Model Card" with silly stats ("Hallucination rate: yes"). Button: "RETRAIN (play again)".

---

## 7. Audio

- Song via Web Audio. All SFX are **synthesized with Web Audio** (oscillators + noise + envelopes), so there's no asset hunting. Build a tiny `sfx.play(name, { pitch })` helper first.
- **Quantize reward sounds to the beat grid** where possible (pickups land on beats anyway), so SFX feel like part of the music, not noise on top of it.
- **Keep SFX tuned to the song's key** (estimate it from the beatmap tool, or just pick a pentatonic scale that sounds OK — pentatonic notes are hard to get wrong).

| Event           | Sound                                                      |
| --------------- | ---------------------------------------------------------- |
| GPU pickup      | Short bright blip, +1 semitone per combo step (pentatonic) |
| Miss            | Quiet low "thup" (don't punish the ears)                   |
| Halo ring       | Shimmering chime (two detuned sines + sparkle noise)       |
| Halo chain      | Rising scale per ring, then a big major-chord stab         |
| Boost           | "VROOM": noise burst + upward pitch sweep + sub thump      |
| Power-up pickup | Arcade "power-up" arpeggio (4 fast rising notes)           |
| Shield block    | Big metallic "CLANG"                                       |
| Hazard hit      | Cartoon "BONK" + descending slide whistle                  |
| Near miss       | Fast whoosh (filtered noise sweep)                         |
| Combo tier      | Ascending "ding-ding-DING"                                 |
| Section gate    | Whoosh + reverse-cymbal swell into the downbeat            |
| Results         | Good: fanfare. Bad: sad trombone "wah-wah-wahhh"           |

- Duck the song slightly (−3 dB for 150 ms) on hazard hits and halo chains for impact.
- Master SFX volume slider in the debug overlay; SFX should sit _under_ the music.

---

## 8. Beatmap generation

### 8.1 Beat data (part of `tools/analyze.py`, step A in 1.2)

```
pip install librosa --break-system-packages   (or in a venv)
python tools/analyze.py      # writes assets/beatmap.json, assets/sections.json, maybe assets/lyrics.lrc
```

Outputs:

```json
{ "bpm": 128.0, "beats": [0.47, 0.94, ...], "onsets": [{ "t": 0.48, "s": 0.82 }, ...], "duration": 183.2 }
```

- `librosa.beat.beat_track` for beats; `librosa.onset.onset_detect` + `onset_strength` for onsets (normalized 0–1).
- **Fallback if librosa won't install:** compute it in JS at load time (energy-based onset detection on the decoded buffer + autocorrelation BPM). Lower quality but acceptable.

### 8.2 Building the note layout (`beatmap.js`)

- For each section: take the beats inside it, keep `density` fraction (prefer beats with strong onsets), assign lateral x via the phrase pattern (3.3).
- Hazards: on off-beats (midpoint between beats), with probability `hazardRate`, placed so a ≥ 0.5-wide gap remains, and never within 0.3 s of a section start.
- Seeded RNG (seed = 42) → deterministic.

---

## 9. Milestones & timeline (2 hours)

| Time                              | Milestone                  | Done when                                                                                                                                                                                              |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Before the clock** (if allowed) | Prep (user)                | Drop the song, optional lyrics, Rhys clips and MV into `assets/` and `refs/`. If allowed: vendor the libraries + hand model, and `pip install librosa faster-whisper` so nothing needs wifi on the day |
| **0:00–0:15**                     | **M0 — Analyze & plan**    | `tools/analyze.py` run, `assets/beatmap.json` + `assets/sections.json` (+ `lyrics.lrc` if possible) written, contact sheets reviewed, `PLAN.md` written and summarized                                 |
| **0:15–0:30**                     | **M1 — Skeleton**          | Song plays, song-synced clock, road scrolling, placeholder kart steers with keyboard, debug overlay (D), section-jump shortcuts                                                                        |
| **0:30–0:45**                     | **M2 — Rhythm core**       | Beatmap generated, GPUs spawn on beat at pattern positions, collect/miss works, combo + P(doom) + basic HUD, results screen with tiers                                                                 |
| **0:45–1:00**                     | **M3 — Webcam wheel**      | Two-hand steering per section 4, mirror verified, dead zone + smoothing, calibration screen, webcam PiP with skeleton + wheel widget, W toggle                                                         |
| **1:00–1:30**                     | **M4 — Themes & gags**     | _(Follow `PLAN.md`.)_ Toon shading + outlines, mascot, each section's palette/props/billboards, signature hazards, section title cards, announcer lines                                                |
| **1:30–1:45**                     | **M5 — Rewards & juice**   | Halo rings + boost FX, rising-pitch pickups, combo tiers, the SFX table (7), 2–3 auto power-ups, title + countdown, particles, camera shake, "You're absolutely right!" splat, final launch into space |
| **1:45–2:00**                     | **M6 — Freeze & rehearse** | No new features. Full playthrough with webcam and keyboard, fix crashes only, tune P(doom) numbers, record a backup screen capture of a full run                                                       |

### Dev shortcuts (build in M1, they save the whole M4)

- `?section=N` URL param and number keys **1–9** jump straight to that section (seek song + rebuild the track at that time), so art can be iterated without replaying the song.
- **D:** debug overlay (FPS, songTime, current section, steer value, hand angle, latency offset).
- **[ / ]:** latency offset ±10 ms.
- **P:** pause/resume.
- **G:** god mode (no P(doom) changes) for recording.

---

## 10. Scope control

### Must have (the demo fails without these)

Song-synced driving, GPUs on beat, keyboard steering, webcam steering, P(doom) + results screen, at least 3 visually distinct themed sections, webcam PiP, **rising-pitch pickup sounds, halo rings with boost FX**.

### Should have

All 6 themes, 3+ hazard types with gags, announcer lines, title + countdown screens, toon outlines, mascot expressions, halo chains, combo tiers, RLHF Magnet + Safety Shield power-ups, the full SFX table.

### Nice to have

Hands-up boost gesture, Scaling Law + Compute Rain power-ups, near-miss bonus, flawless-section bonus, lyric captions, bloom, hallucination fake-notes, inverted-steering prompt injection, model card on results.

### Cut list: cut in this order if behind schedule

1. Bloom / post-processing
2. Lyric captions
3. Compute Rain + Scaling Law power-ups
4. Hallucination fake-notes effect
5. Near-miss and flawless-section bonuses
6. Mascot facial expressions (keep one face)
7. Hands-up boost gesture (halo rings and Space still boost)
8. Reduce to 4 themes (repeat themes across sections)
9. Hazards become simple barriers with funny text only

**Never cut** the rising-pitch pickups or the halo rings — they're cheap and they're what make it feel like a game.

### Explicitly out of scope

Multiplayer, rival AI karts, leaderboards/backends, mobile support, real track curves with physics, menus beyond what's listed, any image/video generation.

---

## 11. Demo-day checklist

- [ ] Runs fully offline (wifi off test).
- [ ] Webcam permission granted ahead of time in the browser.
- [ ] Tested under the venue's lighting; if tracking is flaky, sit the player facing a light source.
- [ ] Laptop plugged in, notifications off, browser fullscreen, volume checked through the venue speakers.
- [ ] Keyboard fallback works mid-race (W toggle).
- [ ] Backup screen recording of a full run, ready to play if anything breaks.
- [ ] One rehearsed audience-volunteer run: explain in one sentence: "Hold an invisible steering wheel, drive through the GPUs, save humanity."
