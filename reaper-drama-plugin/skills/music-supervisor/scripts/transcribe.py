#!/usr/bin/env python3
"""Produce word-level timestamps (words.json) for a voice recording.

Either transcribe the audio with Whisper:
    transcribe.py voice.wav --out words.json [--model small] [--language en]

or convert a transcript made elsewhere (Whisper, Descript, Riverside,
ElevenLabs, Premiere, YouTube...):
    transcribe.py --from transcript.srt --out words.json
    transcribe.py --from transcript.vtt --out words.json
    transcribe.py --from transcript.json --out words.json

Output format:
    {"source": "...", "approximate": false,
     "words": [{"w": "Wait", "start": 1.23, "end": 1.51}, ...]}

or, with no transcript and no Whisper, align the script's dialogue to the
speech detected in the recording (approximate, works best with clean
recordings that have natural pauses):
    transcribe.py voice.wav --align-script dialogue.txt --out words.json

`approximate` is true when only line-level timings were available (SRT/VTT)
or the script was aligned to detected speech; word times are then estimates.
"""
import os

import argparse
import json
import re
import sys


def _ts(text):
    text = text.strip().replace(",", ".")
    parts = text.split(":")
    secs = float(parts[-1])
    if len(parts) >= 2:
        secs += int(parts[-2]) * 60
    if len(parts) >= 3:
        secs += int(parts[-3]) * 3600
    return secs


def _spread(text, start, end):
    toks = text.split()
    if not toks:
        return []
    step = (end - start) / len(toks)
    return [{"w": t, "start": round(start + i * step, 3), "end": round(start + (i + 1) * step, 3)}
            for i, t in enumerate(toks)]


def from_subtitles(path):
    words = []
    content = open(path, encoding="utf-8-sig").read()
    pat = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})[^\n]*\n(.*?)(?:\n\s*\n|\Z)", re.S)
    for m in pat.finditer(content):
        text = re.sub(r"<[^>]+>", "", m.group(3)).replace("\n", " ").strip()
        words += _spread(text, _ts(m.group(1)), _ts(m.group(2)))
    return words


def from_json(path):
    data = json.load(open(path, encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("words"), list):
        items = data["words"]
    elif isinstance(data, list):
        items = data
    else:
        items = []
        for seg in data.get("segments", []):
            if seg.get("words"):
                items += seg["words"]
            else:
                items.append({"text": seg.get("text", ""), "start": seg["start"], "end": seg["end"], "_seg": True})
    words, approx = [], False
    for it in items:
        if it.get("type") in ("spacing", "audio_event"):  # ElevenLabs
            continue
        text = (it.get("word") or it.get("text") or it.get("w") or "").strip()
        start = it.get("start", it.get("start_time"))
        end = it.get("end", it.get("end_time"))
        if not text or start is None or end is None:
            continue
        if it.get("_seg") or len(text.split()) > 1:
            approx = True
            words += _spread(text, float(start), float(end))
        else:
            words.append({"w": text, "start": round(float(start), 3), "end": round(float(end), 3)})
    return words, approx


def speech_regions(path, frame=0.02, min_pause=0.25):
    """Detect speech by energy: returns [(start, end)] in seconds."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import numpy as np
    import audio_io
    a = audio_io.load(path).mean(axis=1)
    hop = int(audio_io.SR * frame)
    n = len(a) // hop
    rms = np.sqrt(np.mean(a[: n * hop].reshape(n, hop).astype(np.float64) ** 2, axis=1)) + 1e-9
    db = 20 * np.log10(rms)
    noise = np.percentile(db, 10)
    loud = np.percentile(db, 95)
    thresh = max(noise + 0.35 * (loud - noise), noise + 6)
    active = db > thresh
    regions, start, quiet = [], None, 0
    gap = int(min_pause / frame)
    for i, on in enumerate(active):
        if on:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet > gap:
                regions.append((start * frame, (i - quiet + 1) * frame))
                start, quiet = None, 0
    if start is not None:
        regions.append((start * frame, (n - quiet) * frame))
    return [(s, e) for s, e in regions if e - s >= 0.12]


def align_script(audio, script_path):
    """Spread the script's lines over detected speech, in order.

    Each line gets a share of the total speaking time proportional to its
    length in characters; line boundaries are then snapped to the nearest real
    pause in the recording. Words within a line are spread by character count.
    """
    lines = [ln.strip() for ln in open(script_path, encoding="utf-8").read().splitlines() if ln.strip()]
    regions = speech_regions(audio)
    if not lines or not regions:
        sys.exit("Couldn't align: no lines in the script file or no speech detected in the audio.")

    # Speech-time axis: concatenated speech regions.
    cum = [0.0]
    for s, e in regions:
        cum.append(cum[-1] + (e - s))
    total = cum[-1]

    def to_real(x, is_start=False):
        # A start exactly on a pause belongs to the next region, an end to the previous.
        for k, (s, e) in enumerate(regions):
            edge = cum[k + 1]
            if (x < edge - 1e-6) if is_start else (x <= edge + 1e-6):
                return s + (x - cum[k])
        return regions[-1][1]

    weights = [max(1, len(ln)) for ln in lines]
    wsum = float(sum(weights))
    bounds, acc = [0.0], 0.0
    pauses = cum[1:-1]  # speech-time positions of real pauses
    for k, w in enumerate(weights[:-1]):
        acc += w / wsum * total
        tol = 0.5 * min(weights[k], weights[k + 1]) / wsum * total
        cands = [p for p in pauses if p > bounds[-1] + 1e-6 and abs(p - acc) <= tol]
        bounds.append(min(cands, key=lambda p: abs(p - acc)) if cands else max(acc, bounds[-1]))
    bounds.append(total)

    words = []
    for ln, a, b in zip(lines, bounds, bounds[1:]):
        toks = ln.split()
        chars = [len(t) + 1 for t in toks]
        csum = float(sum(chars))
        pos = a
        for t, c in zip(toks, chars):
            nxt = pos + (b - a) * c / csum
            words.append({"w": t, "start": round(to_real(pos, True), 3), "end": round(to_real(nxt - 1e-6), 3)})
            pos = nxt
    return words


def transcribe(path, model_name, language):
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(model_name, device="auto", compute_type="int8")
        segments, _ = model.transcribe(path, word_timestamps=True, language=language, vad_filter=True)
        return [{"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
                for seg in segments for w in (seg.words or [])], "faster-whisper"
    except ImportError:
        pass
    try:
        import whisper
        model = whisper.load_model(model_name)
        res = model.transcribe(path, word_timestamps=True, language=language)
        return [{"w": w["word"].strip(), "start": round(w["start"], 3), "end": round(w["end"], 3)}
                for seg in res["segments"] for w in seg.get("words", [])], "openai-whisper"
    except ImportError:
        sys.exit(
            "No Whisper engine installed. Try `pip install faster-whisper` (needs internet access "
            "to download the model the first time), or make a transcript elsewhere and run "
            "this script with --from transcript.srt|.vtt|.json"
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="?")
    ap.add_argument("--from", dest="src")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--align-script", help="dialogue-only text file, one spoken line per row, in order")
    ap.add_argument("--offset", type=float, default=0.0,
                    help="seconds to add to every timestamp (if this recording starts later in the mix)")
    args = ap.parse_args()

    approx = False
    if args.src:
        if args.src.lower().endswith((".srt", ".vtt")):
            words, approx, source = from_subtitles(args.src), True, args.src
        else:
            (words, approx), source = from_json(args.src), args.src
    elif args.audio and args.align_script:
        words, approx = align_script(args.audio, args.align_script), True
        source = f"{args.audio} (script aligned to detected speech)"
    elif args.audio:
        words, engine = transcribe(args.audio, args.model, args.language)
        source = f"{args.audio} ({engine} {args.model})"
    else:
        ap.error("give an audio file or --from transcript")

    if args.offset:
        for w in words:
            w["start"] = round(w["start"] + args.offset, 3)
            w["end"] = round(w["end"] + args.offset, 3)
    words.sort(key=lambda w: w["start"])
    json.dump({"source": source, "approximate": approx, "words": words},
              open(args.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    span = f"{words[0]['start']:.2f}s to {words[-1]['end']:.2f}s" if words else "no words"
    print(f"Wrote {len(words)} words ({span}){' [approximate word timing]' if approx else ''} -> {args.out}")


if __name__ == "__main__":
    main()
