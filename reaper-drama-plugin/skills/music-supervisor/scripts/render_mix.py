#!/usr/bin/env python3
"""Stitch dialogue and music cues into a finished audio drama mix.

usage:
  render_mix.py cues_resolved.json --dialogue voice.wav [--dialogue other.wav@12.5]
                --library DIR --out mix.mp3
                [--words words.json] [--stems DIR] [--tail 4] [--report cue_report.md]

Each cue (after match_cues.py) has:
  id, track (file in --library), type ("bed" | "stinger"), in_time, out_time,
  transition_in  : "fade" | "hard" | "crossfade"     (default "fade")
  fade_in        : seconds (default 2.0 for fade/crossfade, 0 for hard)
  transition_out : "fade" | "hard"                    (default "fade")
  fade_out       : seconds (default 2.0, stingers 0.3; 0.01 for hard)
  level_db       : music level relative to the dialogue (default -10 bed, -4 stinger)
  duck_db        : extra dip while someone speaks (default -8 bed, 0 stinger)
  track_offset   : seconds into the music file to start from (default 0)
  loop           : loop the file if the cue is longer (default true for beds)

A bed with no out_time runs until the next bed starts (crossfading if that cue
asks for it) or until the end of the dialogue plus --tail seconds.
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audio_io  # noqa: E402

SR = audio_io.SR
DIALOGUE_TARGET_DB = -20.0  # active-speech RMS; leaves headroom for music and peaks


def db(x):
    return 10 ** (x / 20.0)


def ramp(n, start, end):
    return np.linspace(start, end, max(0, n), dtype=np.float32)


def speech_mask_from_words(words, length, merge_gap=0.35):
    spans = sorted((w["start"], w["end"]) for w in words)
    merged = []
    for s, e in spans:
        if merged and s <= merged[-1][1] + merge_gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    mask = np.zeros(length, dtype=bool)
    for s, e in merged:
        mask[int(s * SR):int(e * SR)] = True
    return mask


def speech_mask_from_audio(dialogue, frame=0.02, hold=0.3):
    hop = int(SR * frame)
    n = len(dialogue) // hop
    mono = dialogue[: n * hop].mean(axis=1).reshape(n, hop)
    rms = np.sqrt(np.mean(mono.astype(np.float64) ** 2, axis=1)) + 1e-9
    d = 20 * np.log10(rms)
    noise, loud = np.percentile(d, 10), np.percentile(d, 95)
    on = d > max(noise + 0.35 * (loud - noise), noise + 6)
    # hold the gate open across short pauses
    h = int(hold / frame)
    held = on.copy()
    last = -10 ** 9
    for i in range(n):
        if on[i]:
            last = i
        elif i - last <= h:
            held[i] = True
    mask = np.repeat(held, hop)
    return np.pad(mask, (0, len(dialogue) - len(mask)))


def duck_envelope(mask, duck_db, attack=0.15, release=0.6, ctrl_hz=100):
    """Smoothed gain (linear) that dips by duck_db wherever mask is True."""
    if duck_db == 0:
        return None
    hop = SR // ctrl_hz
    n = int(np.ceil(len(mask) / hop))
    padded = np.pad(mask, (0, n * hop - len(mask)))
    target = np.where(padded.reshape(n, hop).any(axis=1), duck_db, 0.0)
    # Look ahead by the attack time so the dip is in place when the line starts.
    la = int(attack * ctrl_hz)
    if la:
        ahead = np.copy(target)
        for k in range(1, la + 1):
            ahead[:-k] = np.minimum(ahead[:-k], target[k:])
        target = ahead
    a_coef = np.exp(-1.0 / max(1, attack * ctrl_hz))
    r_coef = np.exp(-1.0 / max(1, release * ctrl_hz))
    out = np.empty(n)
    cur = 0.0
    for i in range(n):
        c = a_coef if target[i] < cur else r_coef
        cur = c * cur + (1 - c) * target[i]
        out[i] = cur
    gain_db = np.interp(np.arange(len(mask)) / hop, np.arange(n), out)
    return db(gain_db).astype(np.float32)


def place_dialogue(specs):
    parts = []
    for spec in specs:
        path, _, off = spec.partition("@")
        a = audio_io.load(path)
        parts.append((float(off) if off else 0.0, a, path))
    length = max(int(o * SR) + len(a) for o, a, _ in parts)
    mix = np.zeros((length, 2), dtype=np.float32)
    for o, a, path in parts:
        lvl = audio_io.active_rms_db(a)
        g = db(DIALOGUE_TARGET_DB - lvl) if lvl > -90 else 1.0
        start = int(o * SR)
        mix[start:start + len(a)] += a * g
        print(f"Dialogue: {os.path.basename(path)} at {o:.2f}s, {len(a) / SR:.2f}s, gain {20 * np.log10(g):+.1f} dB")
    return mix


def plan_cues(cues, dialogue_end, tail):
    """Fill in defaults, open-ended outs and crossfades. Returns sorted cues."""
    cues = sorted([dict(c) for c in cues if c.get("in_time") is not None], key=lambda c: c["in_time"])
    for c in cues:
        kind = c.get("type", "bed")
        c["type"] = kind
        tin = c.get("transition_in", "fade")
        c["transition_in"] = tin
        c.setdefault("fade_in", 0.0 if tin == "hard" else (0.01 if kind == "stinger" else 2.0))
        if tin == "hard":
            c["fade_in"] = 0.005
        c.setdefault("transition_out", "fade")
        c.setdefault("fade_out", 0.01 if c["transition_out"] == "hard" else (0.3 if kind == "stinger" else 2.0))
        c.setdefault("level_db", -4.0 if kind == "stinger" else -10.0)
        c.setdefault("duck_db", 0.0 if kind == "stinger" else -8.0)
        c.setdefault("track_offset", 0.0)
        c.setdefault("loop", kind == "bed")

    beds = [c for c in cues if c["type"] == "bed"]
    for k, c in enumerate(beds):
        nxt = beds[k + 1] if k + 1 < len(beds) else None
        if c.get("out_time") is None:
            if nxt is None:
                c["out_time"] = dialogue_end + tail
                c["fade_out"] = max(c["fade_out"], min(3.0, tail))
            elif nxt["transition_in"] == "crossfade":
                c["out_time"] = nxt["in_time"] + nxt["fade_in"]
                c["fade_out"] = nxt["fade_in"]
            elif nxt["transition_in"] == "hard":
                c["out_time"] = nxt["in_time"]
                c["fade_out"] = 0.01
            else:
                c["out_time"] = nxt["in_time"]
        elif nxt is not None and nxt["transition_in"] == "crossfade" and c["out_time"] > nxt["in_time"]:
            c["fade_out"] = max(c["fade_out"], c["out_time"] - nxt["in_time"])
    return cues


def render_cue(c, library, ref_db, cache):
    path = c["track"] if os.path.isabs(c["track"]) else os.path.join(library, c["track"])
    if path not in cache:
        cache[path] = audio_io.load(path)
    src = cache[path]
    src = src[int(c["track_offset"] * SR):]
    if len(src) == 0:
        raise RuntimeError(f"{c.get('id')}: track_offset is past the end of {c['track']}")

    if c["type"] == "stinger" and c.get("out_time") is None:
        n = len(src)
    else:
        out = c.get("out_time")
        n = int((out - c["in_time"]) * SR) if out is not None else len(src)
        if n <= 0:
            raise RuntimeError(f"{c.get('id')}: out-point is before the in-point")
    if n > len(src):
        if c["loop"]:
            reps = int(np.ceil(n / len(src)))
            # 50 ms crossfade at loop seams to avoid clicks
            xf = min(int(0.05 * SR), len(src) // 4)
            seg = src.copy()
            body = [seg.copy()]
            for _ in range(reps - 1):
                prev = body[-1]
                fade = ramp(xf, 0, 1)[:, None]
                prev[-xf:] = prev[-xf:] * (1 - fade) + seg[:xf] * fade
                body.append(seg[xf:].copy())
            src = np.concatenate(body)
        else:
            n = len(src)
    a = src[:n].copy()

    lvl = audio_io.active_rms_db(cache[path])
    a *= db(ref_db + c["level_db"] - lvl) if lvl > -90 else 1.0

    fi = min(int(c["fade_in"] * SR), n // 2)
    fo = min(int(c["fade_out"] * SR), n - fi)
    if fi > 0:
        a[:fi] *= ramp(fi, 0, 1)[:, None] ** 2
    if fo > 0:
        a[-fo:] *= ramp(fo, 1, 0)[:, None] ** 2
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cues")
    ap.add_argument("--dialogue", action="append", default=[], help="file[@start_seconds]")
    ap.add_argument("--library", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--words", help="words.json for precise ducking (otherwise detected from audio)")
    ap.add_argument("--stems", help="also write dialogue/music stems into this folder")
    ap.add_argument("--tail", type=float, default=4.0, help="music after the last line (s)")
    ap.add_argument("--attack", type=float, default=0.15)
    ap.add_argument("--release", type=float, default=0.6)
    ap.add_argument("--report", help="write a markdown cue report here")
    args = ap.parse_args()

    sheet = json.load(open(args.cues, encoding="utf-8"))
    cues = sheet["cues"] if isinstance(sheet, dict) else sheet

    if args.dialogue:
        dialogue = place_dialogue(args.dialogue)
    else:
        dialogue = np.zeros((SR, 2), dtype=np.float32)
    ref_db = DIALOGUE_TARGET_DB

    if args.words:
        wd = json.load(open(args.words, encoding="utf-8"))["words"]
        dialogue_end = max((w["end"] for w in wd), default=len(dialogue) / SR)
    else:
        wd = None
        dialogue_end = len(dialogue) / SR

    plan = plan_cues(cues, dialogue_end, args.tail)
    cache, rendered = {}, []
    for c in plan:
        a = render_cue(c, args.library, ref_db, cache)
        rendered.append((c, a))
    total = max([len(dialogue)] + [int(c["in_time"] * SR) + len(a) for c, a in rendered])

    dlg = np.zeros((total, 2), dtype=np.float32)
    dlg[:len(dialogue)] = dialogue
    mask = speech_mask_from_words(wd, total) if wd else speech_mask_from_audio(dlg)

    music = np.zeros((total, 2), dtype=np.float32)
    env_cache = {}
    for c, a in rendered:
        s = int(c["in_time"] * SR)
        seg = a
        if c["duck_db"]:
            key = c["duck_db"]
            if key not in env_cache:
                env_cache[key] = duck_envelope(mask, key, args.attack, args.release)
            seg = a * env_cache[key][s:s + len(a), None]
        music[s:s + len(a)] += seg

    mix = dlg + music
    peak = float(np.max(np.abs(mix))) if total else 0.0
    ceiling = db(-1.0)
    if peak > ceiling:
        # gentle soft-clip above the ceiling instead of scaling the whole mix down
        over = np.abs(mix) > ceiling * 0.8
        knee = ceiling * 0.8
        mix[over] = np.sign(mix[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(mix[over]) - knee) / (ceiling - knee)))
    audio_io.save(args.out, mix)
    if args.stems:
        os.makedirs(args.stems, exist_ok=True)
        audio_io.save(os.path.join(args.stems, "dialogue.wav"), dlg)
        audio_io.save(os.path.join(args.stems, "music.wav"), music)

    lines = ["| Cue | In | Out | Track | Type | Level | Duck | Transition |", "|---|---|---|---|---|---|---|---|"]
    for c, a in rendered:
        end = c["in_time"] + len(a) / SR
        lines.append(
            f"| {c.get('id', '')} | {c['in_time']:.2f}s | {end:.2f}s | {c['track']} | {c['type']} | "
            f"{c['level_db']:+.0f} dB | {c['duck_db']:+.0f} dB | {c['transition_in']} {c['fade_in']:.1f}s in, "
            f"{c['transition_out']} {c['fade_out']:.1f}s out |")
    report = "\n".join(lines)
    print(report)
    print(f"\nMix: {args.out} ({total / SR:.1f}s, peak {audio_io.peak_db(mix):.1f} dBFS)")
    if args.report:
        open(args.report, "w", encoding="utf-8").write(f"# Cue report\n\n{report}\n")


if __name__ == "__main__":
    main()
