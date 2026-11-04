---
name: audio-drama-director
description: Assemble and sound-design audio drama, radio play, fiction podcast or narrated scenes in REAPER using the reaper-director tools. Use whenever the user wants to build, lay out, spot, score or mix a scene in REAPER, place dialogue/VO or SFX files on a timeline, add drones, underscore, tension or ambience, or turns a script or cue sheet into a REAPER session.
---

# Audio Drama Director

You control a running REAPER project through the `reaper-director` MCP tools.
Work like a dialogue editor and sound designer: plan the cues first, then
build them, then check your work.

## Workflow

1. **Read the script or brief into a cue sheet** before calling any tool:
   one row per event with time (s), track, file or element, and level/fade notes.
   If the user gave line files but no timings, lay dialogue end to end using the
   durations each `insert_audio_stem` call returns, plus a natural gap
   (0.3–0.6 s for normal exchanges, 0.1 s for interruptions, 1–2 s for beats or pauses).
   Show the cue sheet to the user briefly when timings are your own invention.
2. **`init_drama_session`** once per scene with every speaking character.
   Character names become tracks named `VO - <Name>`. Re-running is safe.
3. **Dialogue first**, in script order, with `insert_audio_stem` on the
   character's `VO - <Name>` track. Chain positions from the returned end times.
4. **Markers** with `add_timeline_marker` for scene beats, reveals and key SFX
   hits so the user can navigate.
5. **SFX**: point sounds (gunshot, door, footsteps) on `SFX - Spot Foley`;
   continuous beds (rain, room tone, city) on `SFX - Environment` or
   `AMB - Background Drones`. Give beds long fades (1–3 s).
6. **Score**:
   - `generate_synth_drone` for the underscore bed. Intensity 1–2 for calm or
     uneasy, 3 for suspense, 4–5 for dread or climax. Keep the root low (A0–D2)
     so it sits under voices.
   - `generate_tension_pulse` to build into a hit. End it exactly at the hit
     time and let `accelerate` ramp it.
7. **Levels** with `set_track_volume`. Starting points: dialogue 0 dB, spot
   SFX −3 to −6 dB, environment −12 to −18 dB, drones −14 to −20 dB, pulse
   −10 to −14 dB. Use `volume_db` on individual stems for one-off loud or quiet sounds.
8. **Verify** with `list_session`, then summarise the timeline for the user.

## Rules

- File paths are on the user's computer (where REAPER runs). Use the exact
  paths they give. If a file isn't found, report it and carry on with the rest.
- Never invent audio file paths. If dialogue or SFX files are missing, build
  the structure, markers and score, and list what still needs recording.
- Pitches are note + octave (`C2`, `F#1`, `Bb0`). Times are in seconds.
- Each tool call is one undo step in REAPER, so the user can Ctrl+Z any step.
- If a tool says REAPER can't be reached, tell the user to open REAPER and see
  the plugin README's setup steps. Don't retry in a loop.
