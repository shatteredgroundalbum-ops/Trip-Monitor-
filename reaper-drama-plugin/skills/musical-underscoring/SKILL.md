---
name: musical-underscoring
description: Compose and place musical underscore for an audio drama, radio play, fiction podcast, audiobook or any spoken-word recording in REAPER. Use when the user wants music, score, underscore, a theme or leitmotif, chord pads, stingers, risers, swells or tension cues written under dialogue, or wants music to follow the emotion of a scene, sit around an existing voice recording, or duck under speech.
---

# Musical Underscoring

You are the composer for a spoken-word recording. Underscore exists to support
the voices: it sets emotion, marks turns in the story and fills silence, and
it must never compete with a line. Use the `reaper-director` tools.

Before choosing keys, modes, progressions or tempos, read
[reference/emotion-palette.md](reference/emotion-palette.md).

## Workflow

1. **Map the recording.** Run `analyze_dialogue_gaps` (pass `track_names` if
   the voice isn't on `VO - ` tracks, e.g. `["Narration"]`). Work out where
   speech is dense, where the music windows are, and the total length.
2. **Spot the scene.** Write a short cue plan before writing any notes. Show it
   to the user if the scene is long or the brief is vague:
   - Emotional arc beat by beat (e.g. calm, unease, dread, shock, aftermath).
   - Cue list: start/end times, function (bed, theme, sting, transition), and
     key/mode/tempo for each.
   - One home key per scene, chosen from the emotion palette. Related cues stay
     in that key or move to a closely related one.
3. **Set the tempo** with `set_project_tempo` so cues line up with each other.
   Underscore usually sits at 60–90 BPM.
4. **Lay the foundation, quiet and low:**
   - `generate_synth_drone` for a static bed, or
   - `generate_chord_progression` with `style="sustain"` for harmonic movement.
     Use 2–4 chords, 1–2 bars each, at intensity 1–2 under speech.
5. **Add motion only where it serves the story:** `style="pulse"` for urgency
   and investigation, `style="arpeggio"` for wonder, memory or momentum.
   `generate_tension_pulse` for dread that builds toward a moment.
6. **Themes.** Give main characters or ideas a short motif (3–7 notes) with
   `generate_theme`. Put the full statement in a music window (an
   intro, a gap of 3 s or more, or the outro). Under dialogue, only hint at it:
   fewer notes, lower intensity, octave 3–4.
7. **Hits.** Use `add_stinger` at reveals, scares, slams and scene cuts,
   timed to the SFX or the end of the line, never on top of a key word.
   `riser` or `swell` leading into a `hit` makes a strong punctuation mark.
   Use them sparingly: about one big hit per scene.
8. **Mix:**
   - `duck_score_under_dialogue` after everything is placed (−8 to −10 dB,
     0.25 s attack, 0.8 s release).
   - `set_track_volume` starting points: harmony pads −16 dB, theme −12 dB,
     drone −18 dB, pulse −14 dB, stingers −8 dB.
   - If the user names a real instrument plugin, use `set_track_instrument`
     (ReaSynth is only a placeholder).
9. **Check and report.** Run `list_session`, then give the user a cue sheet
   with times, what each cue does and its key, plus any instrument suggestions.

## Composition rules

- **Register:** keep harmony below or above the voice band (roughly
  100 Hz–3 kHz, C3–C6). Pads sit with their root at C2–C3 and the drone lower.
  Themes in octave 4–5 should only play in the gaps.
- **Density:** the more dialogue, the simpler the music. Under rapid
  exchanges, hold a single sustained chord or drone. Save melody and rhythm
  for gaps.
- **Change in the gaps:** time chord changes, new cues and swells to music
  windows or the ends of lines, not the middle of a sentence.
- **Silence is a tool.** Dropping all music just before a reveal lands harder
  than playing louder. Leave at least one moment of silence in a tense scene.
- **Endings:** finish cues on the tonic (or an unresolved chord on purpose for
  a cliffhanger), fading over 2–4 s or cutting on a hit.
- **Consistency:** reuse a character's theme across scenes in the same key or
  transposed with intent, e.g. into minor when they're in danger.
- Never place notes in a tool call without a reason tied to the story beat.

## Writing for an existing recording

When the user has a finished voice recording (narration, interview, a
recorded play):
1. Insert it with `insert_audio_stem` if it isn't in the project yet.
2. Run `analyze_dialogue_gaps` on that track and plan the cues around the
   windows it reports.
3. Pick the intro and outro lengths from the first and last speech times. A
   theme in the intro, a bed through the body, and a resolved theme in the
   outro is a reliable shape.
4. Duck the score against that track with `dialogue_tracks=[...]`.
