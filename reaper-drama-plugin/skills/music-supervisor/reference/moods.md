# Mood guide for spotting

## Core moods

| Mood | Sounds like | Use it for | Typical mechanics |
|---|---|---|---|
| **Tension / Suspense** | Low drones, rising pitch, sparse percussion, ticking | Something is wrong, someone is listening, a secret is close | Slow fade in (2–4 s), `level_db` −12, `duck_db` −10 to −14 |
| **Witty / Playful** | Staccato, pizzicato, light swing, plucks | Banter, comic relief, a reveal that defuses tension | Hard or quick (0.5–1 s) entry right after the punchline, short beds |
| **Action / Climax** | Driving bass and drums, orchestral hits, fast pulse | Chases, fights, escapes, the scene's peak | Hard hit on the action, `level_db` −8, ducking still on |
| **Emotional / Resolution** | Warm pads, acoustic piano, sustained strings | Confessions, loss, reunions, endings | Long fades (3–5 s), low under speech, let it rise after the last line |

Also common: **Mystery** (unresolved, sparse, odd intervals), **Dread**
(sub-bass, dissonance, silence), **Wonder** (bright pads, arpeggios),
**Romance** (soft piano and strings), **Aftermath** (one held note or nothing).

## Spotting rules

- **Enter on change, not on topic.** Bring music in when the emotion turns:
  a realisation, a sound, a lie, an entrance. Don't start it just because a
  scene starts.
- **Exit with purpose.** Cut hard on a shock or a punchline. Fade out under
  a long line so it isn't noticed. Hold silence before the scene's biggest
  line.
- **One bed at a time.** Hand over with a crossfade (mood drifts) or a hard
  cut (mood snaps). Stingers can punctuate on top.
- **Tie entries to the end of lines.** Music that starts mid-sentence
  distracts from the words. Prefer `anchor: "end"` of the line just before
  the beat, or the start of the next line with a fade that's already rising.
- **Comedy needs space.** Start playful music *after* the laugh line, not
  under it.
- **Action covers the action.** Hit on the event (crash, gunshot, door),
  using the end of the line before plus an offset, and keep it under
  following dialogue with ducking.
- **Resolve at the end.** Let the last cue run 3–5 s past the final line
  (`--tail`) and fade, unless the scene ends on a cliffhanger. Then cut hard.

## Choosing tracks from a library

- Match on the user's description first, then the filename. Ask if a track's
  character is unclear and it matters for a key cue.
- Use `library_info.py` durations: for a bed longer than the file, make sure
  it loops cleanly (ambient drones do; songs with endings don't). Prefer a
  longer track, or set `track_offset` to skip an intro.
- Reuse a track for recurring situations (a theme for a character or
  location) so the audience learns it.
- Don't use a track with vocals under dialogue.
