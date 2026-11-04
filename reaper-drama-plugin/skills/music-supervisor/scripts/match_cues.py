#!/usr/bin/env python3
"""Find each cue's trigger line in the transcript and give it an exact time.

usage: match_cues.py cues.json words.json --out cues_resolved.json [--min-score 0.75]

Cue points in cues.json look like:
    {"line": "did you leave the back latch undone", "anchor": "end", "offset": 0.5}
    {"time": 12.0}
anchor: "start" (default for in-points) or "end" (default for out-points) of
the matched words. offset: seconds added after anchoring (negative = earlier).

Cues are matched in sheet order: each search starts where the previous cue's
in-point matched, so repeated phrases resolve to the right occurrence.
"""

import argparse
import json
import re
import sys
from difflib import SequenceMatcher


def norm_tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower().replace("'", "").replace("’", ""))


def find_phrase(phrase, tokens, start_idx=0):
    """Return (score, i, j) for the best match of phrase in tokens[start_idx:]."""
    target = norm_tokens(phrase)
    if not target:
        return 0.0, None, None
    joined = " ".join(target)
    L = len(target)
    best = (0.0, None, None)
    tset = set(target)
    for size in sorted({max(1, L + d) for d in (-2, -1, 0, 1, 2)}):
        for i in range(start_idx, max(start_idx, len(tokens) - size) + 1):
            chunk = tokens[i:i + size]
            # cheap pre-filter: skip windows sharing too few words with the phrase
            if len(tset.intersection(chunk)) < 0.4 * len(tset):
                continue
            window = " ".join(chunk)
            score = SequenceMatcher(None, joined, window, autojunk=False).ratio()
            if score > best[0] + 0.02:  # prefer earliest among near-equal matches
                best = (score, i, i + size - 1)
                if score >= 0.999:
                    return best
    return best


def resolve_point(point, words, tokens, cursor, default_anchor):
    if point is None:
        return None, None, cursor
    if "time" in point:
        return float(point["time"]) + float(point.get("offset", 0.0)), {"exact_time": True}, cursor
    score, i, j = find_phrase(point["line"], tokens, cursor)
    if i is None:
        return None, {"line": point["line"], "score": 0.0, "found": None}, cursor
    anchor = point.get("anchor", default_anchor)
    t = words[i]["start"] if anchor == "start" else words[j]["end"]
    t += float(point.get("offset", 0.0))
    found = " ".join(w["w"] for w in words[i:j + 1])
    return max(0.0, t), {"line": point["line"], "found": found, "score": round(score, 3)}, i


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cues")
    ap.add_argument("words")
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-score", type=float, default=0.75)
    args = ap.parse_args()

    sheet = json.load(open(args.cues, encoding="utf-8"))
    cues = sheet["cues"] if isinstance(sheet, dict) else sheet
    wdata = json.load(open(args.words, encoding="utf-8"))
    words = wdata["words"]
    tokens = []
    word_of_token = []
    for k, w in enumerate(words):
        for t in norm_tokens(w["w"]) or [""]:
            tokens.append(t)
            word_of_token.append(k)
    # Map token-level matches back to word entries.
    tok_words = [words[k] for k in word_of_token]

    cursor = 0
    weak = []
    for cue in cues:
        cue["in_time"], cue["in_match"], cursor = resolve_point(cue.get("in"), tok_words, tokens, cursor, "start")
        cue["out_time"], cue["out_match"], _ = resolve_point(cue.get("out"), tok_words, tokens, cursor, "end")
        for key in ("in_match", "out_match"):
            m = cue.get(key)
            if m and not m.get("exact_time") and m.get("score", 0) < args.min_score:
                weak.append((cue.get("id"), key[:-6], m))

    if isinstance(sheet, dict):
        sheet["cues"] = cues
        sheet["transcript_approximate"] = wdata.get("approximate", False)
    json.dump(sheet, open(args.out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    print(f"{'cue':10} {'in':>9} {'out':>9}  track")
    for c in cues:
        fmt = lambda t: f"{t:8.2f}s" if isinstance(t, (int, float)) else "     auto"
        print(f"{str(c.get('id')):10} {fmt(c['in_time'])} {fmt(c['out_time'])}  {c.get('track')}")
    if weak:
        print("\nCheck these matches (low confidence):")
        for cid, which, m in weak:
            print(f"  {cid} {which}: wanted \"{m.get('line')}\", heard \"{m.get('found')}\" (score {m.get('score')})")
    missing = [c.get("id") for c in cues if c.get("in_time") is None]
    if missing:
        print(f"\nNo in-point found for: {', '.join(map(str, missing))}")
        sys.exit(1)


if __name__ == "__main__":
    main()
