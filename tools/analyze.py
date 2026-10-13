#!/usr/bin/env python3
"""Offline song analysis for P(DOOM) Grand Prix.

Writes:
  assets/beatmap.json     beats, downbeats, onsets, per-beat energy, bpm, key
  assets/lyrics.lrc       per-line timestamps (faster-whisper + fuzzy alignment)
  assets/sections.json    song structure (lyric headers, snapped to bars)
  assets/analysis_report.md

Run:  .venv/bin/python tools/analyze.py [--model small] [--no-cache]
Whisper transcripts are cached in tools/.cache/ so re-runs are fast.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
CACHE = Path(__file__).resolve().parent / ".cache"
SONG = ASSETS / "song.mp3"
LYRICS = ASSETS / "lyrics.txt"

NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
HEADER_RE = re.compile(r"^\[(.+?)\]\s*$")
PART_MAP = {
    "verse": "verse",
    "pre-chorus": "prechorus",
    "prechorus": "prechorus",
    "chorus": "chorus",
    "bridge": "bridge",
    "intro": "intro",
    "outro": "outro",
    "hook": "chorus",
}

report_notes: list[str] = []


def note(msg: str) -> None:
    print("  ! " + msg)
    report_notes.append(msg)


def r3(x: float) -> float:
    return round(float(x), 3)


# --------------------------------------------------------------------------
# Step A: audio structure
# --------------------------------------------------------------------------

def estimate_key(chroma_mean: np.ndarray) -> tuple[str, str, int, float]:
    """Krumhansl-Schmuckler key estimate. Returns (key name, mode, tonic pc, corr)."""
    major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    best = (-2.0, 0, "major")
    for tonic in range(12):
        for mode, prof in (("major", major), ("minor", minor)):
            c = np.corrcoef(chroma_mean, np.roll(prof, tonic))[0, 1]
            if c > best[0]:
                best = (c, tonic, mode)
    corr, tonic, mode = best
    return f"{NOTE_NAMES[tonic]} {mode}", mode, tonic, float(corr)


def analyze_audio(y: np.ndarray, sr: int) -> dict:
    import librosa

    hop = 512
    duration = len(y) / sr
    print(f"[A] duration {duration:.2f}s, sr {sr}")

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop)
    tempo = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    # BPM from median inter-beat interval is usually more precise than tempo
    ibi = np.diff(beat_times)
    bpm_ibi = 60.0 / float(np.median(ibi)) if len(ibi) else tempo
    print(f"[A] beat_track tempo {tempo:.2f}, median-IBI bpm {bpm_ibi:.2f}, {len(beat_times)} beats")

    # Onsets
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)
    omax = float(onset_env.max()) or 1.0
    onsets = [{"t": r3(t), "s": round(float(onset_env[f]) / omax, 3)}
              for t, f in zip(onset_times, onset_frames)]

    # RMS energy, beat-synchronous (mean between consecutive beats)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    bounds = np.concatenate([beat_frames, [len(rms)]])
    beat_rms = np.array([rms[a:max(b, a + 1)].mean() for a, b in zip(bounds[:-1], bounds[1:])])
    lo, hi = np.percentile(beat_rms, 2), np.percentile(beat_rms, 98)
    beat_energy = np.clip((beat_rms - lo) / max(hi - lo, 1e-9), 0, 1)

    # Downbeat phase: low-frequency onset strength (kick) + broadband onset at beat frames
    S = np.abs(librosa.stft(y, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr)
    low = S[freqs < 150].sum(axis=0)
    low_flux = np.maximum(0, np.diff(low, prepend=low[0]))
    low_flux /= low_flux.max() or 1.0
    on_n = onset_env / omax
    n = min(len(low_flux), len(on_n))
    strength = 0.6 * low_flux[:n] + 0.4 * on_n[:n]
    bf = np.clip(beat_frames, 0, n - 1)
    # take max in a small window around each beat to absorb jitter
    beat_str = np.array([strength[max(0, f - 2): f + 3].max() for f in bf])
    phase_scores = [float(beat_str[p::4].mean()) for p in range(4)]
    phase = int(np.argmax(phase_scores))
    print(f"[A] downbeat phase scores (kick/onset) {['%.3f' % s for s in phase_scores]} -> phase {phase}")

    # Key
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    key, mode, tonic, kcorr = estimate_key(chroma.mean(axis=1))
    print(f"[A] key {key} (corr {kcorr:.2f})")

    # Segmentation features (beat-synchronous chroma + MFCC)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13)
    csync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
    msync = librosa.util.sync(mfcc, beat_frames)
    z = lambda a: (a - a.mean(axis=1, keepdims=True)) / (a.std(axis=1, keepdims=True) + 1e-9)
    feats = np.vstack([z(csync), z(msync)])
    beat_times_seg = np.concatenate([[0.0], beat_times])  # sync() prepends segment from 0

    return {
        "sr": sr, "hop": hop, "duration": duration,
        "tempo": tempo, "bpm": bpm_ibi,
        "beat_frames": beat_frames, "beat_times": beat_times,
        "beat_energy": beat_energy, "rms": rms,
        "onsets": onsets, "downbeats": beat_times[phase::4], "downbeat_phase": phase,
        "phase_scores": phase_scores,
        "key": key, "mode": mode, "tonic": tonic, "key_corr": kcorr,
        "feats": feats, "beat_times_seg": beat_times_seg,
    }


def choose_downbeat_phase(A: dict, line_starts: list[float]) -> None:
    """Pick bar phase. Audio (kick) scores usually leave a half-bar ambiguity
    (kick on 1 and 3); break it with lyric line starts, which in pop land on the
    downbeat or one beat before it (pickup)."""
    sc = A["phase_scores"]
    top = max(sc)
    cands = [p for p in range(4) if sc[p] >= 0.85 * top]
    bt = A["beat_times"]
    lyr_sc = [0.0] * 4
    if line_starts:
        for p in range(4):
            tot = 0.0
            for t in line_starts:
                rel = (int(np.argmin(np.abs(bt - t))) - p) % 4
                tot += {0: 1.0, 3: 0.8}.get(rel, 0.0)
            lyr_sc[p] = tot / len(line_starts)
    A["lyric_phase_scores"] = lyr_sc
    if len(cands) > 1 and line_starts:
        phase = max(cands, key=lambda p: (lyr_sc[p], sc[p]))
        note(f"Downbeat phase from kick/onset alone was ambiguous between beats {cands} "
             f"(scores {', '.join('%.3f' % s for s in sc)}); broke the tie with lyric line starts "
             f"(on-downbeat/pickup fit {', '.join('%.2f' % s for s in lyr_sc)}) -> phase {phase}.")
    else:
        phase = int(np.argmax(sc))
        if len(cands) > 1:
            note(f"Downbeat phase ambiguous (scores {sc}); picked {phase} without lyric help.")
    print(f"[A] downbeat phase -> {phase} (lyric fit {['%.2f' % s for s in lyr_sc]})")
    A["downbeat_phase"] = phase
    A["downbeats"] = bt[phase::4]


def energy_between(A: dict, t0: float, t1: float) -> float:
    bt, be = A["beat_times"], A["beat_energy"]
    m = (bt >= t0) & (bt < t1)
    if not m.any():
        i = int(np.argmin(np.abs(bt - (t0 + t1) / 2)))
        return float(be[i])
    return float(be[m].mean())


def snap_to(t: float, grid: np.ndarray) -> float:
    return float(grid[int(np.argmin(np.abs(grid - t)))])


def librosa_segments(A: dict) -> tuple[list[dict], int, bool]:
    """Agglomerative segmentation, snapped to bars, short ones merged."""
    import librosa

    feats, bts = A["feats"], A["beat_times_seg"]
    dur, dbs = A["duration"], A["downbeats"]
    grid = np.concatenate([[0.0], dbs, [dur]])
    best = None
    for k in range(6, 11):
        try:
            bnd = librosa.segment.agglomerative(feats, k)
        except Exception as e:  # pragma: no cover
            note(f"agglomerative k={k} failed: {e}")
            continue
        times = sorted({snap_to(bts[min(b, len(bts) - 1)], grid) for b in bnd} | {0.0})
        times = [t for t in times if t < dur - 1] + [dur]
        # merge sections < 8 s into neighbour (drop the boundary)
        changed = True
        while changed and len(times) > 2:
            changed = False
            lens = np.diff(times)
            i = int(np.argmin(lens))
            if lens[i] < 8.0:
                # drop the boundary that makes the merged piece shorter
                if i == 0:
                    times.pop(1)
                elif i == len(lens) - 1:
                    times.pop(-2)
                else:
                    times.pop(i if lens[i - 1] < lens[i + 1] else i + 1)
                changed = True
        nsec = len(times) - 1
        score = abs(nsec - 9)
        if best is None or score < best[0]:
            best = (score, k, times)
    fallback = False
    if best is None or len(best[2]) - 1 < 4:
        fallback = True
        note("librosa segmentation degenerate; using equal 8-bar sections fallback")
        bar = 4 * 60.0 / A["bpm"]
        step = 8 * bar
        times = [0.0]
        t = step * round((dur / 8) / step) or step
        while times[-1] + t < dur - 4:
            times.append(snap_to(times[-1] + t, grid))
        times.append(dur)
        k = 0
    else:
        _, k, times = best

    # Repetition labels: cluster section mean features by cosine similarity
    segs = []
    means = []
    for t0, t1 in zip(times[:-1], times[1:]):
        m = (bts >= t0) & (bts < t1)
        v = feats[:, m].mean(axis=1) if m.any() else np.zeros(feats.shape[0])
        means.append(v / (np.linalg.norm(v) + 1e-9))
        segs.append({"start": r3(t0), "end": r3(t1), "energy": round(energy_between(A, t0, t1), 3)})
    labels: list[str] = []
    for i, v in enumerate(means):
        lab = None
        for j in range(i):
            if float(v @ means[j]) > 0.8:
                lab = labels[j]
                break
        labels.append(lab or chr(ord("A") + len(set(labels))))
    for s, lab in zip(segs, labels):
        s["label"] = lab
    return segs, k, fallback


# --------------------------------------------------------------------------
# Step B: lyrics
# --------------------------------------------------------------------------

def parse_lyrics(path: Path) -> list[dict]:
    """Return lyric lines [{text, header, header_idx}], skipping scraped junk."""
    lines = []
    header, hidx = None, -1
    skip = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s:
            continue
        m = HEADER_RE.match(s)
        if m:
            header, skip = m.group(1), False
            hidx += 1
            continue
        if s.lower().startswith("you might also like"):
            skip = True  # scraped site noise until next header
            continue
        if skip:
            continue
        # normalize odd unicode (Cyrillic e in scraped text etc.)
        s = s.replace("е", "e").replace("а", "a").replace("о", "o")
        lines.append({"text": s, "header": header or "Verse", "header_idx": hidx})
    return lines


def norm_word(w: str) -> str:
    w = w.lower().replace("’", "'")
    w = re.sub(r"[^a-z0-9']", "", w)
    return w.strip("'")


def tokenize(text: str) -> list[str]:
    return [t for t in (norm_word(w) for w in re.split(r"[\s\-]+", text)) if t]


def transcribe(model_name: str, use_cache: bool) -> list[dict] | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cpath = CACHE / f"whisper_{model_name}.json"
    if use_cache and cpath.exists() and cpath.stat().st_mtime > SONG.stat().st_mtime:
        print(f"[B] using cached transcript {cpath.relative_to(ROOT)}")
        return json.loads(cpath.read_text())
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        note(f"faster-whisper import failed ({e}); falling back to proportional lyrics")
        return None
    try:
        print(f"[B] transcribing with faster-whisper '{model_name}' (cpu, int8)...")
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        # Prime with lyric vocabulary so jargon (shoggoth, Shinigami, RLHF...) is recognised
        prompt = "Song lyrics: AGI, P(doom), foom, shoggoth, Shinigami, basilisk, NVDA, RLHF, Chinchilla, Gato, Sydney."
        segments, info = model.transcribe(
            str(SONG), language="en", word_timestamps=True, vad_filter=False,
            beam_size=5, initial_prompt=prompt, condition_on_previous_text=False,
        )
        words = []
        for seg in segments:
            for w in seg.words or []:
                words.append({"w": w.word.strip(), "start": r3(w.start), "end": r3(w.end),
                              "p": round(float(w.probability), 3)})
            print(f"    [{seg.start:6.1f}-{seg.end:6.1f}] {seg.text.strip()}")
        cpath.write_text(json.dumps(words, indent=0))
        return words
    except Exception as e:
        note(f"faster-whisper transcription failed ({e}); falling back to proportional lyrics")
        return None


def align_lyrics(lines: list[dict], words: list[dict]) -> dict:
    """Global (Needleman-Wunsch style) alignment of lyric words to transcript words."""
    try:
        from rapidfuzz.fuzz import ratio
    except Exception:
        from difflib import SequenceMatcher
        ratio = lambda a, b: 100.0 * SequenceMatcher(None, a, b).ratio()

    lw, lline = [], []
    for li, ln in enumerate(lines):
        for t in tokenize(ln["text"]):
            lw.append(t)
            lline.append(li)
    tw = []
    for w in words:
        for t in tokenize(w["w"]):
            tw.append((t, w["start"], w["end"]))
    n, m = len(lw), len(tw)
    print(f"[B] aligning {n} lyric words to {m} transcript words")
    GAP = -0.4
    sim = np.zeros((n, m))
    for i in range(n):
        for j in range(m):
            sim[i, j] = ratio(lw[i], tw[j][0]) / 100.0
    sc = np.where(sim >= 0.6, 2.0 * sim - 0.8, -0.6)
    D = np.zeros((n + 1, m + 1))
    D[1:, 0] = GAP * np.arange(1, n + 1)
    D[0, 1:] = 0.0  # free leading transcript (intro chatter/hallucination)
    P = np.zeros((n + 1, m + 1), dtype=np.int8)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            a = D[i - 1, j - 1] + sc[i - 1, j - 1]
            b = D[i - 1, j] + GAP
            c = D[i, j - 1] + (GAP if i < n else 0.0)
            if a >= b and a >= c:
                D[i, j], P[i, j] = a, 0
            elif b >= c:
                D[i, j], P[i, j] = b, 1
            else:
                D[i, j], P[i, j] = c, 2
    # traceback (free trailing transcript)
    i, j = n, int(np.argmax(D[n]))
    match = [-1] * n
    while i > 0 and j > 0:
        if P[i, j] == 0:
            if sim[i - 1, j - 1] >= 0.6:
                match[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif P[i, j] == 1:
            i -= 1
        else:
            j -= 1

    # per-line start/end + confidence
    out = []
    for li, ln in enumerate(lines):
        idx = [k for k in range(n) if lline[k] == li]
        matched = [(k, match[k]) for k in idx if match[k] >= 0]
        conf = len(matched) / max(1, len(idx))
        start = end = None
        if matched:
            k0, j0 = matched[0]
            lead = k0 - idx[0]  # unmatched leading lyric words
            used = set(match)
            # back up over unmatched transcript words sung just before (mis-heard
            # first words, e.g. "Shaggy PT" for "ChatGPT")
            j = j0
            while lead > 0 and j - 1 >= 0 and (j - 1) not in used and j0 - (j - 1) <= lead + 2 \
                    and tw[j][1] - tw[j - 1][2] < 0.6:
                j -= 1
            # back up over stutters of the first matched word ("just, just, just")
            while j - 1 >= 0 and (j - 1) not in used and ratio(tw[j - 1][0], tw[j][0]) >= 80 \
                    and tw[j][1] - tw[j - 1][2] < 0.8:
                j -= 1
            start = tw[j][1]
            if j == j0 and lead > 0:
                start -= 0.3 * lead
            end = tw[matched[-1][1]][2]
        out.append({**ln, "start": start, "end": end, "conf": round(conf, 2), "nwords": len(idx)})

    # lines with low confidence: treat as unknown if <25% matched
    for o in out:
        if o["conf"] < 0.25:
            o["start"] = None
    # enforce monotonic + interpolate missing
    known = [i for i, o in enumerate(out) if o["start"] is not None]
    last = -1.0
    for i in known:
        if out[i]["start"] <= last:
            out[i]["start"] = None
        else:
            last = out[i]["start"]
    known = [i for i, o in enumerate(out) if o["start"] is not None]
    for i, o in enumerate(out):
        if o["start"] is not None:
            o["interp"] = False
            continue
        o["interp"] = True
        prev = max([k for k in known if k < i], default=None)
        nxt = min([k for k in known if k > i], default=None)
        if prev is not None and nxt is not None:
            f = (i - prev) / (nxt - prev)
            o["start"] = out[prev]["start"] + f * (out[nxt]["start"] - out[prev]["start"])
        elif prev is not None:
            o["start"] = (out[prev]["end"] or out[prev]["start"] + 3) + 1.0 * (i - prev)
        elif nxt is not None:
            o["start"] = max(0.0, out[nxt]["start"] - 3.0 * (nxt - i))
        else:
            o["start"] = None
    return {"lines": out, "matched_frac": sum(1 for k in match if k >= 0) / max(1, n),
            "transcript_words": m, "lyric_words": n}


def proportional_lyrics(lines: list[dict], t0: float, t1: float) -> list[dict]:
    w = np.array([max(1, len(tokenize(l["text"]))) for l in lines], dtype=float)
    starts = t0 + (t1 - t0) * np.concatenate([[0], np.cumsum(w)[:-1]]) / w.sum()
    return [{**l, "start": float(s), "end": None, "conf": 0.0, "interp": True} for l, s in zip(lines, starts)]


def fmt_lrc(t: float) -> str:
    m = int(t // 60)
    return f"{m:02d}:{t - 60 * m:05.2f}"


def fmt_mmss(t: float) -> str:
    m = int(t // 60)
    return f"{m}:{t - 60 * m:04.1f}"


# --------------------------------------------------------------------------
# Step D: combine
# --------------------------------------------------------------------------

def build_sections(A: dict, lyr: list[dict], last_vocal_end: float | None, lsegs: list[dict]) -> list[dict]:
    dur = A["duration"]
    grid = np.concatenate([[0.0], A["downbeats"]])
    ibi = 60.0 / A["bpm"]
    # header blocks
    blocks = []
    for ln in lyr:
        if not blocks or blocks[-1]["header_idx"] != ln["header_idx"]:
            blocks.append({"header_idx": ln["header_idx"], "header": ln["header"],
                           "t": ln["start"], "lyrics": ln["text"]})
    bounds = []
    for b in blocks:
        # vocals often start with a one-beat pickup before the bar: bias the
        # snap a quarter beat later so a pickup lands on the following downbeat
        bounds.append(snap_to(b["t"] + 0.25 * ibi, grid))
    # Cross-check with audio: if an unsupervised librosa boundary sits within
    # ~1 bar of a lyric boundary and the energy jump there is clearly bigger,
    # move the boundary onto it (e.g. vocal pickup sung before a breakdown).
    bar = 4 * ibi
    lb_times = [x["start"] for x in lsegs[1:]]

    def contrast(t: float) -> float:
        return abs(energy_between(A, t, t + bar) - energy_between(A, t - bar, t))

    for i, t in enumerate(bounds):
        if i == 0:
            continue
        for lt in lb_times:
            if 0 < abs(lt - t) <= 1.1 * bar and contrast(lt) > contrast(t) + 0.1:
                note(f"[{blocks[i]['header']}] boundary moved {t:.2f} -> {lt:.2f} s onto librosa boundary "
                     f"(energy jump {contrast(lt):.2f} vs {contrast(t):.2f}); vocal starts at {blocks[i]['t']:.2f} s.")
                bounds[i] = lt
                break
    sections = []
    first = bounds[0]
    if first > 4.0:
        sections.append({"start": 0.0, "part": "intro", "lyrics": "", "header": "(instrumental)"})
    else:
        bounds[0] = 0.0
    for b, t in zip(blocks, bounds):
        if sections and abs(t - sections[-1]["start"]) < 1e-6:
            note(f"Header [{b['header']}] snapped onto the previous section's start; merged.")
            continue
        key = b["header"].lower()
        key = re.sub(r"\s*\d+$", "", key).strip()
        part = PART_MAP.get(key, "verse")
        sections.append({"start": t, "part": part, "lyrics": b["lyrics"], "header": b["header"]})
    outro_start = None
    if last_vocal_end is not None and dur - last_vocal_end > 4.0:
        # next downbeat after last vocal
        after = grid[grid >= last_vocal_end - 0.25]
        outro_start = float(after[0]) if len(after) else last_vocal_end
        if dur - outro_start > 3.0 and outro_start > sections[-1]["start"] + 4.0:
            sections.append({"start": outro_start, "part": "outro", "lyrics": "", "header": "(instrumental)"})
    for i, s in enumerate(sections):
        s["end"] = sections[i + 1]["start"] if i + 1 < len(sections) else dur
    out = []
    for i, s in enumerate(sections):
        e = energy_between(A, s["start"], s["end"])
        # cross-check: nearest librosa boundary
        lb = [x["start"] for x in lsegs] + [dur]
        nearest = min(lb, key=lambda x: abs(x - s["start"]))
        out.append({
            "id": f"s{i + 1}",
            "start": r3(s["start"]),
            "end": r3(s["end"]),
            "energy": round(e, 3),
            "part": s["part"],
            "header": s["header"],
            "lyrics": s["lyrics"],
            "librosaBoundaryDelta": r3(nearest - s["start"]),
            "theme": None,
            "density": None,
            "hazardRate": None,
        })
    return out


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="small")
    ap.add_argument("--no-cache", action="store_true")
    args = ap.parse_args()

    import librosa

    print(f"[A] loading {SONG.relative_to(ROOT)}")
    y, sr = librosa.load(str(SONG), sr=22050, mono=True)
    A = analyze_audio(y, sr)
    # ---- Step B
    lines = parse_lyrics(LYRICS) if LYRICS.exists() else []
    align = None
    words = transcribe(args.model, not args.no_cache) if lines else None
    if words:
        align = align_lyrics(lines, words)
        lyr = align["lines"]
        print(f"[B] matched {align['matched_frac']:.0%} of lyric words")
        if align["matched_frac"] < 0.3:
            note(f"Whisper alignment poor ({align['matched_frac']:.0%} words matched); using proportional timing")
            align = None
    if lines and align is None:
        # proportional over the louder middle of the song
        lyr = proportional_lyrics(lines, 0.08 * A["duration"], 0.92 * A["duration"])
        note("Lyric times are PROPORTIONAL estimates, not aligned.")
    anchored = [l["start"] for l in lyr if not l.get("interp", True)] if lines and align else []
    choose_downbeat_phase(A, anchored)
    lsegs, k_used, seg_fallback = librosa_segments(A)
    print(f"[A] librosa segmentation (k={k_used}, fallback={seg_fallback}):")
    for s in lsegs:
        print(f"    {s['start']:7.2f}-{s['end']:7.2f}  E={s['energy']:.2f}  {s['label']}")

    tonic_name = NOTE_NAMES[A["tonic"]]
    beatmap = {
        "bpm": round(A["bpm"], 2),
        "beats": [r3(t) for t in A["beat_times"]],
        "downbeats": [r3(t) for t in A["downbeats"]],
        "onsets": A["onsets"],
        "energy": [round(float(e), 3) for e in A["beat_energy"]],
        "duration": r3(A["duration"]),
        "key": A["key"],
        "pentatonic": tonic_name,
        "pentatonicScale": f"{tonic_name} {A['mode']} pentatonic",
    }
    (ASSETS / "beatmap.json").write_text(json.dumps(beatmap))
    print(f"[A] wrote assets/beatmap.json ({len(beatmap['beats'])} beats, {len(beatmap['onsets'])} onsets)")

    last_vocal_end = None
    if align:
        ends = [l["end"] for l in lyr if l.get("end") and not l["interp"]]
        last_vocal_end = max(ends) if ends else None
    if lines:
        with open(ASSETS / "lyrics.lrc", "w", encoding="utf-8") as f:
            f.write("[ti:I'm Upping My P(Doom)]\n[ar:Claude Pop]\n")
            for l in lyr:
                f.write(f"[{fmt_lrc(l['start'])}]{l['text']}\n")
        print("[B] wrote assets/lyrics.lrc")
        for l in lyr:
            flag = "~" if l["interp"] else " "
            print(f"    {fmt_mmss(l['start']):>7}{flag} c={l['conf']:.2f} [{l['header']}] {l['text']}")

    # ---- Step D
    if lines:
        sections = build_sections(A, lyr, last_vocal_end, lsegs)
    else:
        sections = [{"id": f"s{i+1}", **{k: v for k, v in s.items() if k != "label"},
                     "part": "chorus" if s["energy"] > 0.6 else "verse", "lyrics": ""}
                    for i, s in enumerate(lsegs)]
    observe(A, sections)
    (ASSETS / "sections.json").write_text(json.dumps(sections, indent=2))
    print("[D] wrote assets/sections.json")
    for s in sections:
        print(f"    {s['id']:>4} {s['start']:7.2f}-{s['end']:7.2f} E={s['energy']:.2f} {s['part']:<9} {s['lyrics'][:50]}")

    write_report(A, beatmap, lsegs, k_used, seg_fallback, lyr if lines else [], align, sections)
    print("[D] wrote assets/analysis_report.md")
    return 0


def observe(A: dict, sections: list[dict]) -> None:
    """Automatic 'anything weird' observations for the report."""
    ch = [s for s in sections if s["part"] == "chorus"]
    if ch:
        med = float(np.median([s["energy"] for s in sections]))
        for n, s in enumerate(ch, 1):
            if s["energy"] < med - 0.15:
                note(f"Chorus {n} ({s['start']:.1f}-{s['end']:.1f} s) is a quiet BREAKDOWN "
                     f"(energy {s['energy']:.2f} vs song median {med:.2f}), not a peak.")
    top = max(sections, key=lambda s: s["energy"])
    note(f"Highest-energy section is {top['id']} ({top['part']}, {top['start']:.1f}-{top['end']:.1f} s, "
         f"energy {top['energy']:.2f}).")
    bt, be = A["beat_times"], A["beat_energy"]
    gaps, run = [], []
    for t, e in zip(bt, be):
        if e < 0.05:
            run.append(t)
        else:
            if len(run) >= 2 and run[0] > 4.0:
                gaps.append((run[0], t))
            run = []
    if run and len(run) >= 2:
        gaps.append((run[0], A["duration"]))
    if gaps:
        note("Near-silent gaps (good for a dramatic pause / section gate): "
             + ", ".join(f"{a:.1f}-{b:.1f} s" for a, b in gaps))


def write_report(A, beatmap, lsegs, k_used, seg_fallback, lyr, align, sections) -> None:
    L = []
    L.append("# Song analysis: \"I'm Upping My P(Doom)\" (Claude Pop)\n")
    L.append("Generated by `tools/analyze.py`. Re-run with `.venv/bin/python tools/analyze.py`.\n")
    L.append("## Global\n")
    L.append(f"- Duration: **{beatmap['duration']:.2f} s**")
    L.append(f"- BPM: **{beatmap['bpm']}** (librosa beat_track tempo {A['tempo']:.2f}; "
             f"bar = {4 * 60 / beatmap['bpm']:.3f} s)")
    L.append(f"- Beats: {len(beatmap['beats'])}, first beat {beatmap['beats'][0]:.3f} s; "
             f"downbeat phase {A['downbeat_phase']} (kick/onset scores {', '.join('%.3f' % s for s in A['phase_scores'])}; "
             f"lyric fit {', '.join('%.2f' % s for s in A.get('lyric_phase_scores', [0]*4))}), "
             f"first downbeat {beatmap['downbeats'][0]:.3f} s")
    L.append(f"- Key: **{beatmap['key']}** (Krumhansl correlation {A['key_corr']:.2f}); "
             f"SFX scale suggestion: **{beatmap['pentatonicScale']}**")
    L.append(f"- Onsets: {len(beatmap['onsets'])}\n")

    L.append("## Song structure (assets/sections.json)\n")
    L.append("Boundaries come from the lyric headers (first line time, snapped to the nearest bar downbeat). "
             "`Δlibrosa` = distance to the nearest unsupervised librosa boundary (small = audio agrees).\n")
    L.append("| id | start | end | len | energy | part | header | first lyric line | Δlibrosa |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for s in sections:
        L.append(f"| {s['id']} | {s['start']:.2f} ({fmt_mmss(s['start'])}) | {s['end']:.2f} | "
                 f"{s['end'] - s['start']:.1f} | {s['energy']:.2f} | {s['part']} | {s.get('header', '')} | "
                 f"{s['lyrics'] or '—'} | {s.get('librosaBoundaryDelta', 0):+.1f} |")
    L.append("")

    L.append("## Lyric alignment\n")
    if align:
        conf_lines = sum(1 for l in lyr if not l["interp"])
        mean_conf = np.mean([l["conf"] for l in lyr])
        L.append(f"- faster-whisper word timestamps + global fuzzy word alignment. "
                 f"{align['matched_frac']:.0%} of {align['lyric_words']} lyric words matched to "
                 f"{align['transcript_words']} transcript words; {conf_lines}/{len(lyr)} lines anchored directly to transcript words "
                 f"(any others, marked ~, are interpolated). Mean per-line word match {mean_conf:.2f}.")
    else:
        L.append("- **Fallback:** proportional assignment (whisper unavailable or poor). Times are rough.")
    L.append("")
    L.append("| time | conf | header | line |")
    L.append("|---|---|---|---|")
    for l in lyr:
        L.append(f"| {fmt_mmss(l['start'])}{'~' if l['interp'] else ''} | {l['conf']:.2f} | {l['header']} | {l['text']} |")
    L.append("")

    L.append(f"## librosa segmentation (cross-check, k={k_used}{', FALLBACK' if seg_fallback else ''})\n")
    L.append("| start | end | energy | repeat label |")
    L.append("|---|---|---|---|")
    for s in lsegs:
        L.append(f"| {s['start']:.2f} | {s['end']:.2f} | {s['energy']:.2f} | {s['label']} |")
    L.append("")

    L.append("## Notes / weirdness\n")
    L.append("- The scraped lyrics block \"You might also like ... LISA\" was ignored; Cyrillic look-alike "
             "letters in the scrape (\"thе\", \"1е30\") were normalised.")
    for n in report_notes:
        L.append(f"- {n}")
    (ASSETS / "analysis_report.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    sys.exit(main())
