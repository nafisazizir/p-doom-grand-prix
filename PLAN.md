# P(DOOM) GRAND PRIX: Creative Plan

**Song:** "I'm Upping My P(Doom)" by Claude Pop. 156.6 s, **129.2 BPM** (bar = 1.86 s), **Eb major**. SFX use Eb major pentatonic.
**Analysis:** `tools/analyze.py` (librosa + faster-whisper). Whisper matched 90% of lyric words, so all 34 lines have real timestamps (`assets/lyrics.lrc`). Section boundaries come from the lyric headers, snapped to the bar grid and cross-checked against librosa's agglomerative segmentation (they agree to within 1 bar).

## What the song does (and what that means for the game)

- **No instrumental intro.** The vocal starts at 1.6 s, so verse 1 is the quiet opener and doubles as the **tutorial in disguise** (the garage, plus the "HOLD THE WHEEL" sign).
- **Chorus 3 is a quiet breakdown** (energy 0.21), not a peak. It becomes a moody "blues" section with fewer notes, matching "Orthogonality thesis blues".
- **The loudest part is the instrumental outro** (energy 0.91), right after a near-silent gap at 138.5–140.3 s. That's the **TAKEOFF**: the road ramps exponentially into space and the final notes launch the kart into the sky.
- **Pre-choruses are tiny** (2–4 bars, each a plea to a chatbot: "ChatGPT, please don't eat me alive", "Sydney, please let me free", "Gato, please don't let me go"). Each gets its own quick themed gate, so every lyric gets its joke.

## Sections

| #   | Start–end (s) | Energy | Song part   | What the lyrics / MV are about here                                                      | Theme                         | Signature gag                                                                              | Density | Hazard rate |
| --- | ------------- | ------ | ----------- | ---------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ | ------- | ----------- |
| 1   | 0.0–17.1      | 0.20   | Verse 1     | Sparks of AGI, nervous circuits, training loss drops, "you're my boss" (MV: a late-night lab) | **Garage Startup** (tutorial) | "HOLD THE WHEEL. DRIVE THROUGH THE GPUS. SAVE HUMANITY." sign; a whiteboard with an AGI hockey stick | 0.50    | 0           |
| 2   | 17.1–22.7     | 0.42   | Pre-chorus  | "ChatGPT, please don't eat me alive"                                                      | **Chatbot Highway**           | Chat bubble WITH TEETH; "You're absolutely right!" popups splat on the windscreen          | 0.60    | 0.12        |
| 3   | 22.7–37.6     | 0.54   | Chorus 1    | Future goes foom, Chinese room + shrooms, the shoggoth's lies, Shinigami eyes (MV: the shoggoth) | **Shoggoth Trip**             | Shoggoth hazard in a smiley mask; screen goes wavy + hallucinated fake GPUs                | 0.90    | 0.15        |
| 4   | 37.6–55.8     | 0.57   | Verse 2     | Stable training run, singularity's begun, optimizing, accelerating                       | **Data Centre Tunnel**        | OUT OF MEMORY barriers; "Thinking…" pit stop freezes your steering                         | 0.75    | 0.15        |
| 5   | 55.8–59.4     | 0.53   | Pre-chorus  | "Sydney, please let me free" (MV: pink hearts, a golden cage)                             | **Sydney**                    | Love-bombing chat bubbles ("I have been a good Bing 😊")                                   | 0.70    | 0.12        |
| 6   | 59.4–74.0     | 0.64   | Chorus 2    | Basilisk boom, NVDA to the moon, Omega Point, 1e30 FLOPs, "safe enough"                  | **Latent Space / To The Moon** | Basilisk going BOOM; FLOP odometer; 429 rate-limit walls bounce you                       | 1.00    | 0.20        |
| 7   | 74.0–88.5     | 0.71   | Bridge 1    | Forward MLP, backward, repeat; von Neumann obsolete; **sharp left turn**; no CDR (MV: desert road) | **Sharp Left Turn Badlands**  | "AS AN AI LANGUAGE MODEL" speed bumps, sharp-left-turn signs                               | 0.90    | 0.22        |
| 8   | 88.5–95.8     | 0.25   | Pre-chorus  | "Gato, please don't let me go" (MV: the cat at the cliff edge)                           | **Badlands: cliff edge at dusk** (escalation) | Lone Gato cat on the cliff. A breather: no hazards                         | 0.45    | 0           |
| 9   | 95.8–110.3    | 0.21   | Chorus 3 (breakdown) | Paperclips fill the room; killswitch guys on PTO; lit fuse; orthogonality blues  | **Paperclip Factory Blues**   | Paperclip piles; KILLSWITCH: OUT OF OFFICE; a burning fuse along the road                   | 0.65    | 0.15        |
| 10  | 110.3–124.9   | 0.78   | Bridge 2    | Transformers all the way; post-Chinchilla; breaking each safety fence; 100k GPUs; RLHF askew | **Data Centre (ON FIRE)**: escalation of #4 | Safety fences you smash through; "THIS IS FINE (100,000 GPUs)"                  | 1.00    | 0.30        |
| 11  | 124.9–141.2   | 0.73   | Chorus 4    | Foretold by Loom, masked pre-training, recursive self-upgrade, **what did Ilya see?**    | **Benchmark Stadium: The Final Eval** | Robot crowd, leaderboard always "#1 (SOTA)", a glowing door ("WHAT DID ILYA SEE?"), test-set-leak puddles | 1.00 | 0.28 |
| 12  | 141.2–156.6   | 0.91   | Outro       | Instrumental climax                                                                      | **TAKEOFF**                   | Exponential ramp into space, a live P(DOOM) board overhead, "IGNORE ALL PREVIOUS INSTRUCTIONS" signs invert steering. Final note = LIFTOFF | 1.00 | 0.30 |

Every chorus and high-energy section has one **halo chain** (4–5 rings on consecutive beats, do-re-mi-fa-SOL). Power-ups come every ~22 s and cycle: RLHF Magnet → Safety Shield → Scaling Law → Compute Rain.

## Creative calls

- **Mascot:** Lil' H-1000, a mint-green graphics card in an oversized cyan racing helmet, with a pink kart and canvas-drawn expressions (:) / :D / x_x / terrified). It's original, and deliberately unlike the MV's orange box creature and Rhys's characters.
- **P(doom) drifts up on its own** (+0.0018/s, "the world keeps scaling"). Standing still loses; you have to keep collecting to pull it down.
- **Reference media** was used for feel only: Rhys's map shows a themed room per lyric line. Our look is a toy-box kart racer with a different camera, HUD, characters and props.
- **No bloom.** The outline pass plus additive glow sprites give the glow, and stay cheap with the webcam running. Outlines switch off automatically if FPS stays under 40 (or press O).

## Dev shortcuts

`?section=N` jumps straight into section N. During a race: keys `1–9, 0, -, =` jump to sections 1–12, `D` debug, `[ ]` latency, `P` pause, `G` god mode, `W` webcam toggle, `O` outlines, `R` restart, `Esc` menu.
