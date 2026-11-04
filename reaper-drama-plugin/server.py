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
set volume and fades, and write MIDI drone beds and tension pulses.

Important: this server talks to Claude over stdio, so nothing in here may
print to stdout. Errors are returned as strings instead.
"""

import os
import functools
import re
from contextlib import contextmanager

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("REAPER Audio Drama Director")

SCORE_TRACK = "SCORE - Synth Underscore"
PULSE_TRACK = "SCORE - Tension Pulse"

NOTE_OFFSETS = {
    "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4,
    "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9,
    "A#": 10, "Bb": 10, "B": 11,
}


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


def parse_pitch(pitch_root: str) -> int:
    """Convert 'C2', 'F#1', 'Bb-1' etc. to a MIDI note number (C4 = 60)."""
    match = re.match(r"^([A-Ga-g])([b#]?)(-?\d+)$", pitch_root.strip())
    if not match:
        raise ValueError(
            f"Unrecognised pitch '{pitch_root}'. Use note+octave, e.g. 'C2', 'F#1', 'Bb2'."
        )
    letter, accidental, octave = match.groups()
    name = letter.upper() + accidental
    midi = 12 * (int(octave) + 1) + NOTE_OFFSETS[name]
    if not 0 <= midi <= 127:
        raise ValueError(f"Pitch '{pitch_root}' is outside the MIDI range.")
    return midi


def db_to_linear(db: float) -> float:
    return 10 ** (db / 20.0)


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
        if not source:
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


def _add_midi_notes(take, notes, duration_seconds: float) -> None:
    for start, end, pitch, velocity in notes:
        if 0 <= pitch <= 127:
            take.add_note(
                start, min(end, duration_seconds), pitch,
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
        track, new = get_or_create_track(RPR, project, SCORE_TRACK)
        if new:
            track.add_fx("ReaSynth")
        item = track.add_midi_item(start_seconds, start_seconds + duration_seconds)
        take = item.active_take
        _add_midi_notes(take, notes, duration_seconds)
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
        track, new = get_or_create_track(RPR, project, PULSE_TRACK)
        if new:
            track.add_fx("ReaSynth")
        item = track.add_midi_item(start_seconds, start_seconds + duration_seconds)
        _add_midi_notes(item.active_take, notes, duration_seconds)

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


if __name__ == "__main__":
    mcp.run()
