#!/usr/bin/env python3
"""Summarise a music library so cues can be matched to real files.

usage: library_info.py DIR_OR_FILES... [--json out.json]

Prints each file's duration, loudness, peak, and how long its silent head
and tail are (useful for choosing track_offset and fades).
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io  # noqa: E402

EXTS = (".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff", ".opus")


def silent_edges(a, sr, thresh_db=-50.0):
    mono = np.abs(a).max(axis=1) if len(a) else a
    loud = np.nonzero(mono > 10 ** (thresh_db / 20))[0]
    if len(loud) == 0:
        return len(a) / sr, 0.0
    return loud[0] / sr, (len(a) - loud[-1]) / sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--json")
    args = ap.parse_args()

    files = []
    for p in args.paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                files += [os.path.join(root, n) for n in sorted(names) if n.lower().endswith(EXTS)]
        else:
            files.append(p)

    rows = []
    for f in files:
        try:
            a = audio_io.load(f)
        except Exception as exc:
            print(f"!! {os.path.basename(f)}: {exc}")
            continue
        head, tail = silent_edges(a, audio_io.SR)
        rows.append({
            "file": os.path.basename(f), "path": os.path.abspath(f),
            "duration": round(len(a) / audio_io.SR, 2),
            "loudness_db": round(audio_io.active_rms_db(a), 1),
            "peak_db": round(audio_io.peak_db(a), 1),
            "silent_head": round(head, 2), "silent_tail": round(tail, 2),
        })

    print(f"{'file':40} {'dur(s)':>8} {'loud dB':>8} {'peak dB':>8} {'head':>6} {'tail':>6}")
    for r in rows:
        print(f"{r['file'][:40]:40} {r['duration']:8.2f} {r['loudness_db']:8.1f} {r['peak_db']:8.1f} "
              f"{r['silent_head']:6.2f} {r['silent_tail']:6.2f}")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(rows, fh, indent=2)


if __name__ == "__main__":
    main()
