# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "mcp>=1.2.0,<2",
#     "python-reapy>=0.10.0",
# ]
# ///
"""
REAPER Audio Drama Director - MCP server.

Gives Claude control over a running REAPER instance via reapy so it can
scaffold audio-drama sessions, place dialogue/SFX stems at exact times,
set volume and fades, and write musical underscore: drones, tension
pulses, chord progressions, themes, stingers and dialogue ducking.

Important: this server talks to Claude over stdio, so nothing in here may
print to stdout. Errors are returned as strings instead.
"""

import functools
import os
import random
import sys
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mcp.server.fastmcp import FastMCP  # noqa: E402

import music  # noqa: E402
from music import parse_pitch  # noqa: E402

mcp = FastMCP("REAPER Audio Drama Director")

SCORE_TRACK = "SCORE - Synth Underscore"
PULSE_TRACK = "SCORE - Tension Pulse"
HARMONY_TRACK = "SCORE - Harmony Pads"
THEME_TRACK = "SCORE - Theme"
STINGER_TRACK = "SCORE - Stingers"
DIALOGUE_PREFIX = "VO - "


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

class ReaperUnavailable(RuntimeError):
    pass


def _reapy():
    """Import reapy lazily so the MCP server starts even if REAPER is closed."""
    try:
        import reapy  # noqa: WPS433
    except Exception as exc:  # pragma: no cover - environment dependent
        raise ReaperUnavailable(f"Could not import reapy: {exc}") from exc
    return reapy


@contextmanager
def reaper_session(undo_label: str):
    """Open the current project, batch calls, and wrap them in one undo step."""
    reapy = _reapy()
    try:
        project = reapy.Project()
    except Exception as exc:
        raise ReaperUnavailable(
            "Could not reach REAPER. Make sure REAPER is running and the reapy "
            f"distant API is enabled (see README). Details: {exc}"
        ) from exc

    RPR = reapy.reascript_api
    with reapy.inside_reaper():
        RPR.Undo_BeginBlock2(0)
        try:
            yield reapy, RPR, project
        finally:
            RPR.Undo_EndBlock2(0, undo_label, -1)
            RPR.UpdateArrange()


def tool_errors(fn):
    """Return failures as readable strings rather than crashing the tool call."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ReaperUnavailable as exc:
            return f"Error: {exc}"
        except Exception as exc:
            return f"Error in {fn.__name__}: {type(exc).__name__}: {exc}"

    return wrapper


def set_track_name(RPR, track, name: str) -> None:
    RPR.GetSetMediaTrackInfo_String(track.id, "P_NAME", name, True)


def find_track(project, name: str):
    target = name.strip().lower()
    for track in project.tracks:
        if track.name.strip().lower() == target:
            return track
    return None


def get_or_create_track(RPR, project, name: str):
    """Find a track by name (case-insensitive) or append a new one at the end."""
    track = find_track(project, name)
    if track is not None:
        return track, False
    track = project.add_track(index=project.n_tracks, name=name)
    set_track_name(RPR, track, name)  # older reapy versions ignore name=
    return track, True


def db_to_linear(db: float) -> float:
    return 10 ** (db / 20.0)


def is_null(ptr) -> bool:
    """reapy returns pointers as strings like '(PCM_source*)0x0000...'."""
    if not ptr:
        return True
    text = str(ptr)
    if "0x" in text:
        try:
            return int(text.split("0x")[-1].rstrip(")"), 16) == 0
        except ValueError:
            return False
    return False


def get_score_track(RPR, project, name: str, pad: bool = False):
    """Get or create a score track; new ones get ReaSynth shaped for the role."""
    track, new = get_or_create_track(RPR, project, name)
    if new:
        track.add_fx("ReaSynth")
        shape_reasynth(RPR, track, pad=pad)
    return track


def shape_reasynth(RPR, track, pad: bool) -> None:
    """Give ReaSynth a slow attack/long release for pads, snappy for hits."""
    try:
        n = RPR.TrackFX_GetNumParams(track.id, 0)
        settings = {"attack": 0.35, "release": 0.6} if pad else {"attack": 0.0, "release": 0.25}
        for i in range(int(n)):
            res = RPR.TrackFX_GetParamName(track.id, 0, i, "", 64)
            pname = str(res[-2] if isinstance(res, (tuple, list)) else res).lower()
            for key, val in settings.items():
                if key in pname:
                    RPR.TrackFX_SetParamNormalized(track.id, 0, i, val)
    except Exception:
        pass  # cosmetic only; never fail a cue because of synth tweaks


def project_bpm(RPR, bpm):
    if bpm and bpm > 0:
        return float(bpm)
    res = RPR.Master_GetTempo()
    return float(res[0] if isinstance(res, (tuple, list)) else res) or 120.0


def get_volume_envelope(RPR, track):
    """Return the track's volume envelope, creating (showing) it if needed."""
    env = RPR.GetTrackEnvelopeByName(track.id, "Volume")
    if is_null(env):
        RPR.SetOnlyTrackSelected(track.id)
        RPR.Main_OnCommand(40406, 0)  # Track: Toggle track volume envelope visible
        env = RPR.GetTrackEnvelopeByName(track.id, "Volume")
    if is_null(env):
        raise RuntimeError(f"Could not create a volume envelope on '{track.name}'.")
    return env


def env_value(RPR, env, db: float) -> float:
    mode = RPR.GetEnvelopeScalingMode(env)
    if isinstance(mode, (tuple, list)):
        mode = mode[0]
    val = RPR.ScaleToEnvelopeMode(int(mode), db_to_linear(db))
    return float(val[0] if isinstance(val, (tuple, list)) else val)


def write_envelope(RPR, env, points, clear_range=None) -> None:
    """points: list of (time, db). Linear shape between points."""
    if clear_range:
        RPR.DeleteEnvelopePointRange(env, clear_range[0], clear_range[1])
    for t, db in points:
        RPR.InsertEnvelopePoint(env, max(0.0, t), env_value(RPR, env, db), 0, 0.0, False, True)
    RPR.Envelope_SortPoints(env)


def dialogue_intervals(project, track_names=None):
    """(start, end) of every item on dialogue tracks (default: 'VO - ' tracks)."""
    wanted = [n.strip().lower() for n in track_names] if track_names else None
    spans = []
    for track in project.tracks:
        name = track.name.strip()
        is_vo = name.lower() in wanted if wanted else name.startswith(DIALOGUE_PREFIX)
        if not is_vo:
            continue
        for item in track.items:
            spans.append((item.position, item.position + item.length))
    return spans


# --------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------

@mcp.tool()
@tool_errors
def init_drama_session(scene_title: str, characters: list[str]) -> str:
    """
    Initialize a structured audio drama session in the current REAPER project.
    Creates one dialogue track per character (with ReaEQ + ReaComp), Foley/SFX
    tracks, an ambience bed track, a synth underscore track (ReaSynth) and a
    tension pulse track, plus a scene start marker at 0s. Safe to re-run:
    existing tracks with the same names are reused, not duplicated.
    """
    created = []
    with reaper_session(f"Init drama session: {scene_title}") as (_, RPR, project):
        for char in characters:
            track, new = get_or_create_track(RPR, project, f"VO - {char}")
            if new:
                track.add_fx("ReaEQ")
                track.add_fx("ReaComp")
                created.append(track.name)

        for name in ("SFX - Spot Foley", "SFX - Environment", "AMB - Background Drones"):
            track, new = get_or_create_track(RPR, project, name)
            if new:
                created.append(name)

        for name in (SCORE_TRACK, PULSE_TRACK):
            track, new = get_or_create_track(RPR, project, name)
            if new:
                track.add_fx("ReaSynth")
                shape_reasynth(RPR, track, pad=(name == SCORE_TRACK))
                created.append(name)

        project.add_marker(0.0, f"START: {scene_title}")

    return (
        f"Session '{scene_title}' ready: {len(characters)} dialogue track(s), SFX, "
        f"ambience, underscore and pulse tracks. Newly created: "
        f"{', '.join(created) if created else 'none (all tracks already existed)'}."
    )


@mcp.tool()
@tool_errors
def insert_audio_stem(
    track_name: str,
    file_path: str,
    position_seconds: float,
    fade_in: float = 0.05,
    fade_out: float = 0.05,
    volume_db: float = 0.0,
) -> str:
    """
    Insert a dialogue or SFX audio file (WAV/MP3/FLAC/OGG...) onto a track at an
    exact timeline position. The track is created if it doesn't exist.
    fade_in / fade_out are in seconds; volume_db sets the item gain (0 = unity).
    file_path must be a path on the machine running REAPER.
    """
    file_path = os.path.abspath(os.path.expanduser(file_path))
    if not os.path.isfile(file_path):
        return f"Error: audio file not found at '{file_path}'."
    if position_seconds < 0:
        return "Error: position_seconds must be >= 0."

    with reaper_session(f"Insert stem {os.path.basename(file_path)}") as (_, RPR, project):
        track, _ = get_or_create_track(RPR, project, track_name)

        source = RPR.PCM_Source_CreateFromFile(file_path)
        if is_null(source):
            return f"Error: REAPER could not open '{file_path}' as audio."
        length = RPR.GetMediaSourceLength(source, False)
        if isinstance(length, (tuple, list)):  # reapy may return out-params too
            length = length[0]
        length = float(length)
        if length <= 0:
            return f"Error: '{file_path}' has zero length or is unsupported."

        item = track.add_item(start=position_seconds, length=length)
        take = item.add_take()
        RPR.SetMediaItemTake_Source(take.id, source)
        RPR.GetSetMediaItemTakeInfo_String(take.id, "P_NAME", os.path.basename(file_path), True)

        half = length / 2.0
        RPR.SetMediaItemInfo_Value(item.id, "D_FADEINLEN", max(0.0, min(fade_in, half)))
        RPR.SetMediaItemInfo_Value(item.id, "D_FADEOUTLEN", max(0.0, min(fade_out, half)))
        RPR.SetMediaItemInfo_Value(item.id, "D_VOL", db_to_linear(volume_db))

        RPR.Main_OnCommand(40047, 0)  # Peaks: build any missing peak files

    return (
        f"Inserted '{os.path.basename(file_path)}' on '{track_name}' at "
        f"{position_seconds:.2f}s (duration {length:.2f}s, ends {position_seconds + length:.2f}s, "
        f"gain {volume_db:+.1f} dB)."
    )


@mcp.tool()
@tool_errors
def set_track_volume(track_name: str, volume_db: float, pan: float = 0.0) -> str:
    """
    Set a track's fader volume in dB (0 = unity, -inf not allowed; use e.g. -60)
    and pan (-1.0 hard left .. 0 centre .. 1.0 hard right).
    """
    pan = max(-1.0, min(1.0, pan))
    with reaper_session(f"Set volume {track_name}") as (_, RPR, project):
        track = find_track(project, track_name)
        if track is None:
            return f"Error: no track named '{track_name}'."
        RPR.SetMediaTrackInfo_Value(track.id, "D_VOL", db_to_linear(volume_db))
        RPR.SetMediaTrackInfo_Value(track.id, "D_PAN", pan)
    return f"'{track_name}' set to {volume_db:+.1f} dB, pan {pan:+.2f}."


def _add_midi_notes(take, notes, duration_seconds: float, item_start: float) -> None:
    """notes: (start, end, pitch, velocity) relative to the item start.
    reapy's add_note takes *project* time in seconds, so offset by item_start."""
    for start, end, pitch, velocity in notes:
        if 0 <= pitch <= 127 and start < duration_seconds:
            take.add_note(
                item_start + start, item_start + min(end, duration_seconds), pitch,
                velocity=max(1, min(127, int(velocity))),
                unit="seconds", sort=False,
            )
    take.sort_events()


@mcp.tool()
@tool_errors
def generate_synth_drone(
    pitch_root: str,
    start_seconds: float,
    duration_seconds: float,
    intensity: int = 3,
) -> str:
    """
    Write an atmospheric MIDI drone / tension pad on the SCORE underscore track.
    pitch_root: note + octave such as 'C2', 'D2', 'A1', 'F#2'.
    intensity: 1 (subtle sub-bass) .. 5 (dense tension cluster).
      1-2: root only, 3: + perfect 5th, 4: + minor 3rd, 5: + flat 9th.
    """
    if duration_seconds <= 0:
        return "Error: duration_seconds must be > 0."
    intensity = max(1, min(5, int(intensity)))
    root = parse_pitch(pitch_root)
    velocity = min(127, 40 + intensity * 15)

    notes = [(0.0, duration_seconds, root, velocity)]
    if intensity >= 3:
        notes.append((0.0, duration_seconds, root + 7, velocity * 0.8))
    if intensity >= 4:
        notes.append((0.0, duration_seconds, root + 3, velocity * 0.7))
    if intensity == 5:
        notes.append((0.0, duration_seconds, root + 13, velocity * 0.6))

    with reaper_session(f"Drone {pitch_root}") as (_, RPR, project):
        track = get_score_track(RPR, project, SCORE_TRACK, pad=True)
        item = track.add_midi_item(start_seconds, start_seconds + duration_seconds)
        _add_midi_notes(item.active_take, notes, duration_seconds, start_seconds)
        # Soft swell in/out so the pad doesn't click.
        fade = min(2.0, duration_seconds / 4.0)
        RPR.SetMediaItemInfo_Value(item.id, "D_FADEINLEN", fade)
        RPR.SetMediaItemInfo_Value(item.id, "D_FADEOUTLEN", fade)

    return (
        f"Created {duration_seconds:.2f}s drone rooted at {pitch_root} (MIDI {root}), "
        f"intensity {intensity}, {len(notes)} voice(s), from {start_seconds:.2f}s on '{SCORE_TRACK}'."
    )


@mcp.tool()
@tool_errors
def generate_tension_pulse(
    pitch_root: str,
    start_seconds: float,
    duration_seconds: float,
    bpm: float = 80.0,
    accelerate: bool = True,
) -> str:
    """
    Write a heartbeat-style tension pulse on the SCORE tension pulse track:
    short repeated low notes that get louder (and faster, if accelerate=True)
    over the duration - ideal for building dread before a reveal.
    pitch_root: e.g. 'C1', 'D1', 'A0'. bpm: starting pulse rate.
    """
    if duration_seconds <= 0 or bpm <= 0:
        return "Error: duration_seconds and bpm must be > 0."
    root = parse_pitch(pitch_root)

    notes = []
    t = 0.0
    while t < duration_seconds:
        progress = t / duration_seconds
        rate = bpm * (1.0 + progress) if accelerate else bpm  # up to 2x faster
        beat = 60.0 / rate
        velocity = 50 + 70 * progress
        note_len = min(beat * 0.35, 0.25)
        # Heartbeat: a strong hit followed by a softer echo.
        notes.append((t, t + note_len, root, velocity))
        echo = t + beat * 0.3
        if echo < duration_seconds:
            notes.append((echo, echo + note_len * 0.7, root, velocity * 0.6))
        t += beat

    with reaper_session(f"Tension pulse {pitch_root}") as (_, RPR, project):
        track = get_score_track(RPR, project, PULSE_TRACK, pad=False)
        item = track.add_midi_item(start_seconds, start_seconds + duration_seconds)
        _add_midi_notes(item.active_take, notes, duration_seconds, start_seconds)

    return (
        f"Created {duration_seconds:.2f}s tension pulse on {pitch_root} (MIDI {root}) "
        f"from {start_seconds:.2f}s: {len(notes)} hits starting at {bpm:.0f} BPM"
        f"{', accelerating to ~' + str(int(bpm * 2)) + ' BPM' if accelerate else ''}."
    )


@mcp.tool()
@tool_errors
def add_timeline_marker(position_seconds: float, label: str) -> str:
    """Place a narrative or sound-cue marker on the timeline."""
    with reaper_session(f"Marker: {label}") as (_, __, project):
        project.add_marker(position_seconds, label)
    return f"Marker added at {position_seconds:.2f}s: '{label}'."


@mcp.tool()
@tool_errors
def list_session() -> str:
    """List all tracks with their items (start/end times) and all markers."""
    lines = []
    with reaper_session("List session") as (_, RPR, project):
        for track in project.tracks:
            items = list(track.items)
            lines.append(f"- {track.name or '(unnamed)'}: {len(items)} item(s)")
            for item in items:
                pos, length = item.position, item.length
                take = item.active_take
                name = take.name if take else "(empty)"
                lines.append(f"    {pos:8.2f}s - {pos + length:8.2f}s  {name}")
        markers = []
        for i in range(project.n_markers + project.n_regions):
            # -> (retval, proj, idx, isrgn, pos, rgnend, name, number)
            res = RPR.EnumProjectMarkers2(project.id, i, 0, 0, 0, "", 0)
            if res[0] and not res[3]:
                markers.append((float(res[4]), str(res[6])))
        if markers:
            lines.append("Markers:")
            for pos, name in sorted(markers):
                lines.append(f"    {pos:8.2f}s  {name}")
    return "\n".join(lines) if lines else "Project is empty."


# --------------------------------------------------------------------------
# Musical underscoring tools
# --------------------------------------------------------------------------

def _velocity(intensity: int) -> int:
    return min(127, 35 + max(1, min(5, int(intensity))) * 16)


def _humanize(rng, vel: float, amount: int = 5) -> int:
    return max(1, min(127, int(vel + rng.randint(-amount, amount))))


@mcp.tool()
@tool_errors
def analyze_dialogue_gaps(min_gap_seconds: float = 1.0, track_names: list[str] | None = None) -> str:
    """
    Map where dialogue sits in the recording so music can be placed around it.
    Reads every item on dialogue tracks (default: tracks named 'VO - ...', or
    pass track_names, e.g. ["Narration"] for a single recorded voice track).
    Returns merged speech spans and the gaps of at least min_gap_seconds -
    the windows where underscore can swell, a theme can state itself, or a
    stinger can land without fighting a line.
    """
    with reaper_session("Analyze dialogue") as (_, RPR, project):
        spans = music.merge_intervals(dialogue_intervals(project, track_names), gap=0.25)
        project_end = float(project.length)
    if not spans:
        return ("No dialogue items found. Insert dialogue first, or pass track_names "
                "for the track(s) holding the recording.")

    lines = [f"Dialogue spans ({len(spans)}):"]
    for s, e in spans:
        lines.append(f"    {s:8.2f}s - {e:8.2f}s  ({e - s:.2f}s speech)")
    gaps = []
    if spans[0][0] >= min_gap_seconds:
        gaps.append((0.0, spans[0][0]))
    for (_, e1), (s2, _) in zip(spans, spans[1:]):
        if s2 - e1 >= min_gap_seconds:
            gaps.append((e1, s2))
    if project_end - spans[-1][1] >= min_gap_seconds:
        gaps.append((spans[-1][1], project_end))
    lines.append(f"Music windows (gaps >= {min_gap_seconds:.2f}s): {len(gaps)}")
    for s, e in gaps:
        lines.append(f"    {s:8.2f}s - {e:8.2f}s  ({e - s:.2f}s)")
    speech = sum(e - s for s, e in spans)
    lines.append(f"Dialogue runs {spans[0][0]:.2f}s to {spans[-1][1]:.2f}s; {speech:.2f}s of speech in total.")
    return "\n".join(lines)


@mcp.tool()
@tool_errors
def set_project_tempo(bpm: float) -> str:
    """Set the project tempo. Musical tools use it when their bpm is omitted."""
    if not 20 <= bpm <= 300:
        return "Error: bpm must be between 20 and 300."
    with reaper_session(f"Tempo {bpm}") as (_, RPR, project):
        RPR.SetCurrentBPM(project.id, float(bpm), True)
    return f"Project tempo set to {bpm:g} BPM."


@mcp.tool()
@tool_errors
def generate_chord_progression(
    key: str,
    mode: str,
    progression: list[str],
    start_seconds: float,
    bars_per_chord: float = 1.0,
    bpm: float | None = None,
    beats_per_bar: int = 4,
    style: str = "sustain",
    intensity: int = 2,
    repeat: int = 1,
    track_name: str = HARMONY_TRACK,
) -> str:
    """
    Write a voice-led chord progression for underscore (pads, pulses or arps).
    key: tonic such as 'D', 'F#', 'Bb'. mode: minor, major, dorian, phrygian,
    lydian, mixolydian, locrian, harmonic_minor, melodic_minor.
    progression: roman numerals relative to the mode, e.g. ["i", "VI", "III", "VII"],
      ["i", "bII", "i"], ["I", "V", "vi", "IV"], ["i", "iv", "V7"]. Suffixes:
      7, maj7, dim, o7, +, sus2, sus4, add9.
    bars_per_chord: length of each chord in bars (fractions allowed).
    bpm: omit to use the project tempo.
    style: 'sustain' (held pads), 'pulse' (repeated 8ths over held bass) or
      'arpeggio' (rolling 8ths over held bass).
    intensity: 1 (barely there) .. 5 (full).
    repeat: play the progression this many times.
    """
    if not progression:
        return "Error: progression is empty."
    style = style.strip().lower()
    if style not in ("sustain", "pulse", "arpeggio"):
        return "Error: style must be 'sustain', 'pulse' or 'arpeggio'."
    key_pc, scale = music.parse_key(key), music.get_scale(mode)
    chords = [music.parse_chord(c, key_pc, scale) for c in progression] * max(1, int(repeat))
    voicings = music.voice_progression(chords)
    rng = random.Random(1234)

    with reaper_session(f"Chords {key} {mode}") as (_, RPR, project):
        tempo = project_bpm(RPR, bpm)
        chord_len = bars_per_chord * beats_per_bar * 60.0 / tempo
        eighth = 30.0 / tempo
        total = chord_len * len(voicings)
        vel = _velocity(intensity)

        notes = []
        for n, voicing in enumerate(voicings):
            t0 = n * chord_len
            bass, upper = voicing[0], voicing[1:]
            notes.append((t0, t0 + chord_len, bass, vel * 0.9))
            if style == "sustain":
                for p in upper:
                    notes.append((t0, t0 + chord_len, p, _humanize(rng, vel * 0.8)))
            else:
                steps = max(1, int(round(chord_len / eighth)))
                cycle = upper + upper[-2:0:-1] if len(upper) > 2 else upper
                for k in range(steps):
                    s = t0 + k * eighth
                    accent = 1.0 if k % 2 == 0 else 0.8
                    if style == "pulse":
                        for p in upper:
                            notes.append((s, s + eighth * 0.6, p, _humanize(rng, vel * 0.75 * accent)))
                    else:
                        p = cycle[k % len(cycle)]
                        notes.append((s, s + eighth * 0.9, p, _humanize(rng, vel * 0.8 * accent)))

        track = get_score_track(RPR, project, track_name, pad=(style == "sustain"))
        item = track.add_midi_item(start_seconds, start_seconds + total)
        _add_midi_notes(item.active_take, notes, total, start_seconds)
        RPR.GetSetMediaItemTakeInfo_String(
            item.active_take.id, "P_NAME", f"{key} {mode}: {' '.join(progression)}", True)

    return (
        f"Wrote {' - '.join(progression)} in {key} {mode} ({style}, x{max(1, int(repeat))}) on "
        f"'{track_name}': {start_seconds:.2f}s to {start_seconds + total:.2f}s, "
        f"{chord_len:.2f}s per chord at {tempo:g} BPM."
    )


@mcp.tool()
@tool_errors
def generate_theme(
    key: str,
    mode: str,
    notes: list[str],
    durations_beats: list[float],
    start_seconds: float,
    bpm: float | None = None,
    octave: int = 4,
    intensity: int = 3,
    repeat: int = 1,
    track_name: str = THEME_TRACK,
) -> str:
    """
    Write a melodic theme / leitmotif from scale degrees.
    notes: scale degrees in the key/mode: "1".."7"; "8"+ continue upward;
      "0", "-1" go below the tonic; prefix b/# to alter ("b3", "#4");
      suffix ' for an octave up or , for down; "r" is a rest.
      Example (rising minor motif): ["1", "b3", "5", "4", "r", "b3", "2", "1"].
    durations_beats: length of each note in beats; reused cyclically if shorter
      than notes, e.g. [1, 1, 2] or [0.5].
    octave: octave of degree 1 (4 = middle C octave).
    repeat: state the theme this many times back to back.
    """
    if not notes or not durations_beats:
        return "Error: notes and durations_beats must not be empty."
    if any(d <= 0 for d in durations_beats):
        return "Error: durations_beats must all be > 0."
    key_pc, scale = music.parse_key(key), music.get_scale(mode)
    pitches = [music.parse_degree(n, key_pc, scale, octave) for n in notes]
    rng = random.Random(99)

    with reaper_session(f"Theme {key} {mode}") as (_, RPR, project):
        tempo = project_bpm(RPR, bpm)
        beat = 60.0 / tempo
        vel = _velocity(intensity)
        out, t = [], 0.0
        count = len(pitches)
        for _ in range(max(1, int(repeat))):
            for i, p in enumerate(pitches):
                dur = durations_beats[i % len(durations_beats)] * beat
                if p is not None:
                    arch = 0.85 + 0.15 * (1 - abs((i / max(1, count - 1)) * 2 - 1))  # phrase swell
                    out.append((t, t + dur * 0.95, p, _humanize(rng, vel * arch, 3)))
                t += dur
        total = t
        track = get_score_track(RPR, project, track_name, pad=False)
        item = track.add_midi_item(start_seconds, start_seconds + total)
        _add_midi_notes(item.active_take, out, total, start_seconds)
        RPR.GetSetMediaItemTakeInfo_String(item.active_take.id, "P_NAME", f"Theme {key} {mode}", True)

    return (
        f"Wrote a {len(notes)}-note theme in {key} {mode} (x{max(1, int(repeat))}) on '{track_name}': "
        f"{start_seconds:.2f}s to {start_seconds + total:.2f}s at {tempo:g} BPM."
    )


@mcp.tool()
@tool_errors
def add_stinger(
    hit_seconds: float,
    key: str,
    mode: str = "minor",
    kind: str = "hit",
    lead_seconds: float = 2.0,
    intensity: int = 4,
    track_name: str = STINGER_TRACK,
) -> str:
    """
    Add a musical stinger that lands exactly on a story moment (reveal, scare,
    door slam, scene cut).
    kind:
      'hit'            - short, loud low chord stab exactly at hit_seconds.
      'dissonant_hit'  - stab with a clashing minor 2nd / tritone for shocks.
      'swell'          - chord that fades up over lead_seconds and cuts off at the
                         hit (pair it with a 'hit' at the same time for a big impact).
      'riser'          - accelerating rising notes over lead_seconds into the hit.
    """
    kind = kind.strip().lower()
    if kind not in ("hit", "dissonant_hit", "swell", "riser"):
        return "Error: kind must be 'hit', 'dissonant_hit', 'swell' or 'riser'."
    key_pc, scale = music.parse_key(key), music.get_scale(mode)
    root = 12 * 3 + key_pc  # octave 2
    third = root + scale[2]
    fifth = root + 7
    vel = _velocity(intensity)

    with reaper_session(f"Stinger {kind}") as (_, RPR, project):
        track = get_score_track(RPR, project, track_name, pad=(kind == "swell"))
        notes = []
        if kind in ("hit", "dissonant_hit"):
            start, length = hit_seconds, 1.5
            chord = [root - 12, root, fifth, root + 12, third + 12]
            if kind == "dissonant_hit":
                chord += [root + 13, root + 6 + 12]
            for p in chord:
                notes.append((0.0, 0.4, p, min(127, vel + 10)))
        else:
            lead = max(0.25, lead_seconds)
            start, length = max(0.0, hit_seconds - lead), hit_seconds - max(0.0, hit_seconds - lead)
            if kind == "swell":
                for p in (root, fifth, root + 12, third + 12):
                    notes.append((0.0, length, p, vel))
            else:
                t, step, i = 0.0, length / 6.0, 0
                while t < length:
                    p = root + 12 + scale[i % 7] + 12 * (i // 7)
                    notes.append((t, min(length, t + step * 0.9), p, vel * (0.5 + 0.5 * t / length)))
                    t += step
                    step = max(0.04, step * 0.82)
                    i += 1

        item = track.add_midi_item(start, start + length)
        _add_midi_notes(item.active_take, notes, length, start)
        RPR.GetSetMediaItemTakeInfo_String(item.active_take.id, "P_NAME", f"Stinger: {kind}", True)
        if kind == "swell":
            env = get_volume_envelope(RPR, track)
            write_envelope(RPR, env,
                           [(start - 0.01, 0.0), (start, -40.0), (hit_seconds, 0.0)],
                           clear_range=(start - 0.02, hit_seconds + 0.001))

    return f"Added '{kind}' stinger in {key} {mode} on '{track_name}', landing at {hit_seconds:.2f}s."


@mcp.tool()
@tool_errors
def duck_score_under_dialogue(
    duck_db: float = -9.0,
    attack_seconds: float = 0.25,
    release_seconds: float = 0.8,
    score_tracks: list[str] | None = None,
    dialogue_tracks: list[str] | None = None,
) -> str:
    """
    Automatically lower music under speech and let it breathe back up in the
    gaps, by writing volume automation on the score/ambience tracks.
    duck_db: how far to dip under lines (-6 gentle .. -15 strong).
    attack_seconds: how early the dip starts before each line.
    release_seconds: how long the music takes to come back after a line.
    score_tracks: defaults to every track whose name starts with 'SCORE' or 'AMB'.
    dialogue_tracks: defaults to every 'VO - ' track (pass e.g. ["Narration"]
      for a single recorded voice track).
    Run this after all dialogue and music are placed; re-running replaces the
    ducking automation in the affected ranges.
    """
    if duck_db >= 0:
        return "Error: duck_db must be negative (e.g. -9)."
    with reaper_session("Duck score under dialogue") as (_, RPR, project):
        spans = music.merge_intervals(
            dialogue_intervals(project, dialogue_tracks), gap=attack_seconds + release_seconds)
        if not spans:
            return "No dialogue found to duck under."
        if score_tracks:
            targets = [find_track(project, n) for n in score_tracks]
            missing = [n for n, t in zip(score_tracks, targets) if t is None]
            if missing:
                return f"Error: no track(s) named {', '.join(missing)}."
        else:
            targets = [t for t in project.tracks
                       if t.name.strip().upper().startswith(("SCORE", "AMB"))]
        if not targets:
            return "No score or ambience tracks found to duck."

        for track in targets:
            env = get_volume_envelope(RPR, track)
            for s, e in spans:
                a = max(0.0, s - attack_seconds)
                write_envelope(RPR, env,
                               [(a, 0.0), (s, duck_db), (e, duck_db), (e + release_seconds, 0.0)],
                               clear_range=(a - 0.001, e + release_seconds + 0.001))

    return (
        f"Ducked {len(targets)} track(s) ({', '.join(t.name for t in targets)}) by {duck_db:g} dB "
        f"under {len(spans)} dialogue span(s), {attack_seconds:g}s attack, {release_seconds:g}s release."
    )


@mcp.tool()
@tool_errors
def set_track_instrument(track_name: str, fx_name: str, replace_reasynth: bool = True) -> str:
    """
    Swap a score track's synth for a better instrument the user has installed,
    e.g. 'VSTi: Spitfire LABS', 'VST3i: Vital', 'VSTi: Surge XT', 'ReaSamplOmatic5000'.
    replace_reasynth removes the placeholder ReaSynth first.
    """
    with reaper_session(f"Instrument {fx_name}") as (_, RPR, project):
        track = find_track(project, track_name)
        if track is None:
            return f"Error: no track named '{track_name}'."
        if replace_reasynth:
            idx = RPR.TrackFX_GetByName(track.id, "ReaSynth", False)
            idx = idx[0] if isinstance(idx, (tuple, list)) else idx
            if int(idx) >= 0:
                RPR.TrackFX_Delete(track.id, int(idx))
        added = RPR.TrackFX_AddByName(track.id, fx_name, False, -1)
        added = added[0] if isinstance(added, (tuple, list)) else added
        if int(added) < 0:
            return (f"Error: REAPER couldn't find an FX called '{fx_name}'. Use the name exactly "
                    "as shown in REAPER's FX browser.")
        if int(added) != 0:
            RPR.TrackFX_CopyToTrack(track.id, int(added), track.id, 0, True)  # instrument first
    return f"'{track_name}' now plays through '{fx_name}'."


if __name__ == "__main__":
    mcp.run()
