#!/usr/bin/env python3
"""Build word-timed karaoke lyrics: assets/lyrics_words.json.

Takes the line timings in assets/lyrics.lrc (the real lyrics) and the Whisper word timestamps in
tools/.cache/whisper_small.json, aligns the real words to the transcribed words inside each line's
time window (difflib on normalised tokens), and interpolates any word Whisper missed.
Output: [{ "t": lineStart, "e": lineEnd, "text": "...", "words": [{ "w": "word", "t": start, "e": end }] }]
"""
import json, re, difflib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
lrc = (ROOT / 'assets/lyrics.lrc').read_text().splitlines()
whisper = json.loads((ROOT / 'tools/.cache/whisper_small.json').read_text())

lines = []
for l in lrc:
    m = re.match(r'^\[(\d+):(\d+(?:\.\d+)?)\](.*)$', l)
    if m:
        lines.append({'t': int(m[1]) * 60 + float(m[2]), 'text': m[3].strip()})

norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower().replace('p(doom)', 'pdoom'))
out = []
for i, L in enumerate(lines):
    t0 = L['t']
    t1 = lines[i + 1]['t'] if i + 1 < len(lines) else t0 + 6
    words = L['text'].split()
    ws = [w for w in whisper if w['start'] >= t0 - 0.35 and w['start'] < t1 - 0.05]
    a = [norm(w) for w in words]
    b = [norm(w['w']) for w in ws]
    times = [None] * len(words)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            ww = ws[blk.b + k]
            times[blk.a + k] = [ww['start'], ww['end']]
    # fuzzy fill: unmatched words that sit between matched neighbours take the unmatched whisper words in order
    # (handles "Pidoon" vs "P(doom)" etc.), else interpolate.
    last_end = max(t0, ws[0]['start'] if ws else t0)
    if times and times[0] is None:
        times[0] = [last_end, None]
    # interpolate remaining gaps
    end_of_line = min(t1 - 0.05, (ws[-1]['end'] if ws else t0 + 0.4 * len(words)) + 0.3)
    k = 0
    while k < len(words):
        if times[k] is not None and times[k][1] is not None:
            k += 1
            continue
        j = k
        while j < len(words) and (times[j] is None or times[j][1] is None):
            j += 1
        start = times[k][0] if times[k] is not None else (times[k - 1][1] if k > 0 else t0)
        stop = times[j][0] if j < len(words) else end_of_line
        n = j - k
        span = max(0.12 * n, stop - start)
        for q in range(n):
            times[k + q] = [start + span * q / n, start + span * (q + 1) / n]
        k = j
    # keep monotonic + sane lengths
    for q in range(1, len(times)):
        if times[q][0] < times[q - 1][0]:
            times[q][0] = times[q - 1][0] + 0.05
        times[q][1] = max(times[q][1], times[q][0] + 0.08)
    out.append({'t': round(times[0][0] if times else t0, 3), 'e': round(min(t1, times[-1][1] + 0.6), 3), 'text': L['text'],
                'words': [{'w': w, 't': round(tt[0], 3), 'e': round(tt[1], 3)} for w, tt in zip(words, times)]})

(ROOT / 'assets/lyrics_words.json').write_text(json.dumps(out, indent=1))
print(f'{len(out)} lines →', ROOT / 'assets/lyrics_words.json')
for L in out[:3] + out[5:6]:
    print(' '.join(f"{w['w']}@{w['t']:.2f}" for w in L['words']))
