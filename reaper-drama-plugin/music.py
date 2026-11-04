"""
Pure music-theory helpers for the underscoring tools (no REAPER needed).

Pitches are MIDI note numbers (C4 = 60). Times are in seconds unless noted.
"""

import re

NOTE_OFFSETS = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "Fb": 4,
    "E#": 5, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
    "A#": 10, "Bb": 10, "B": 11, "Cb": 11, "B#": 0,
}

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "ionian": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic_minor": [0, 2, 3, 5, 7, 9, 11],
}

ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7}
MAJOR = SCALES["major"]


def degree_offset(degree: int, acc: str, scale: list[int]) -> int:
    """Semitones above the tonic for a 1-based degree.
    Plain degrees follow the mode; a b/# prefix is absolute against the major
    scale, so 'b3' is always a minor third and 'bII' always a semitone up."""
    if acc:
        return MAJOR[degree - 1] + (-1 if acc == "b" else 1)
    return scale[degree - 1]


def parse_pitch(pitch: str) -> int:
    """'C2', 'F#1', 'Bb-1' -> MIDI number."""
    m = re.match(r"^([A-Ga-g])([b#]?)(-?\d+)$", pitch.strip())
    if not m:
        raise ValueError(
            f"Unrecognised pitch '{pitch}'. Use note+octave, e.g. 'C2', 'F#1', 'Bb2'."
        )
    letter, acc, octave = m.groups()
    midi = 12 * (int(octave) + 1) + NOTE_OFFSETS[letter.upper() + acc]
    if not 0 <= midi <= 127:
        raise ValueError(f"Pitch '{pitch}' is outside the MIDI range.")
    return midi


def parse_key(key: str) -> int:
    """'A', 'F#', 'Bb' -> pitch class 0-11."""
    k = key.strip()
    k = k[:1].upper() + k[1:]
    if k not in NOTE_OFFSETS:
        raise ValueError(f"Unrecognised key '{key}'. Use a note name such as 'D', 'F#', 'Bb'.")
    return NOTE_OFFSETS[k]


def get_scale(mode: str) -> list[int]:
    m = mode.strip().lower().replace(" ", "_")
    if m not in SCALES:
        raise ValueError(f"Unknown mode '{mode}'. Choose from: {', '.join(sorted(SCALES))}.")
    return SCALES[m]


def parse_chord(symbol: str, key_pc: int, scale: list[int]) -> tuple[int, list[int]]:
    """
    Roman-numeral chord -> (root pitch class, intervals above root).

    Plain degrees follow the chosen mode, so in A minor 'VI' is F major and 'v'
    is E minor. Case sets quality (upper = major, lower = minor). A b/# prefix
    is absolute (bII = a semitone above the tonic, bVI = 8, bVII = 10). Suffixes: dim/o, +/aug, 7, maj7, sus2, sus4, add9, 9.
    Examples: i, iv, VI, bII, V7, viio7, ivadd9, Isus4, III+.
    """
    m = re.match(r"^([b#]?)(vii|vi|iv|v|iii|ii|i)(.*)$", symbol.strip(), re.IGNORECASE)
    if not m:
        raise ValueError(f"Unrecognised chord '{symbol}'. Use roman numerals like i, iv, VI, V7, bII.")
    acc, numeral, suffix = m.groups()
    degree = ROMAN[numeral.lower()]
    root = (key_pc + degree_offset(degree, acc, scale)) % 12
    upper = numeral.isupper()
    s = suffix.lower()

    if s.startswith(("dim", "o", "°")):
        intervals = [0, 3, 6]
        if "7" in s:
            intervals.append(9)
    elif s.startswith(("ø", "m7b5")):
        intervals = [0, 3, 6, 10]
    elif s.startswith(("+", "aug")):
        intervals = [0, 4, 8]
    else:
        intervals = [0, 4, 7] if upper else [0, 3, 7]
        if "maj7" in s:
            intervals.append(11)
        elif "7" in s or s == "9":
            intervals.append(10)
    if "sus2" in s:
        intervals[1] = 2
    elif "sus4" in s or s == "sus":
        intervals[1] = 5
    if "add9" in s or s == "9":
        intervals.append(14)
    return root, intervals


def voice_progression(
    chords: list[tuple[int, list[int]]],
    bass_octave: int = 2,
    voice_center: int = 57,
) -> list[list[int]]:
    """
    Voice each chord as bass root + close upper voices, moving each upper voice
    as little as possible from the previous chord (smooth voice leading).
    """
    voiced = []
    prev_upper = None
    for root_pc, intervals in chords:
        bass = 12 * (bass_octave + 1) + root_pc
        pcs = [(root_pc + i) % 12 for i in intervals]
        targets = prev_upper or [voice_center - 4, voice_center, voice_center + 4, voice_center + 7]
        upper = []
        for idx, pc in enumerate(pcs):
            target = targets[min(idx, len(targets) - 1)]
            cands = [pc + 12 * o for o in range(11)]
            upper.append(min(cands, key=lambda n: (abs(n - target), n)))
        upper = sorted(set(upper))
        # Keep the upper voices clear of the bass.
        upper = [n + 12 if n <= bass + 7 else n for n in upper]
        voiced.append([bass] + sorted(upper))
        prev_upper = sorted(upper)
    return voiced


def parse_degree(token: str, key_pc: int, scale: list[int], octave: int):
    """
    Melody token -> MIDI pitch, or None for a rest ('r' or '-').
    '1'..'7' are scale degrees; 8, 9... continue upward, 0 / -1 go below.
    Plain degrees follow the mode; b/# prefixes are absolute (b3 = minor
    third, #4 = tritone in any mode). Suffix ' raises or , lowers an octave.
    """
    t = str(token).strip()
    if t.lower() in ("r", "-", "rest"):
        return None
    m = re.match(r"^([b#]?)(-?\d+)(['’,]*)$", t)
    if not m:
        raise ValueError(f"Unrecognised melody note '{token}'. Use degrees like 1, b3, 5, 8, 5', r.")
    acc, num, marks = m.groups()
    d = int(num)
    if d == 0:
        d = -1  # treat 0 as "the degree below 1"
    idx = d - 1 if d > 0 else d
    octave_shift, step = divmod(idx, 7)
    pitch = 12 * (octave + 1) + key_pc + degree_offset(step + 1, acc, scale) + 12 * octave_shift
    pitch += 12 * (marks.count("'") + marks.count("’")) - 12 * marks.count(",")
    if not 0 <= pitch <= 127:
        raise ValueError(f"Melody note '{token}' falls outside the MIDI range.")
    return pitch


def merge_intervals(intervals, gap: float = 0.0):
    """Merge (start, end) ranges that overlap or sit closer than `gap` seconds."""
    merged = []
    for s, e in sorted(intervals):
        if merged and s <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [tuple(x) for x in merged]
