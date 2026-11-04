# Emotion palette for underscore

Starting points, not rules. Roman numerals follow the mode (in minor, `VI` is
the major chord on the 6th degree). A `b` prefix is absolute: `bII` is always
the major chord a semitone above the tonic.

| Emotion / scene | Mode | Progression ideas | BPM | Style and tools | Intensity |
| --- | --- | --- | --- | --- | --- |
| Dread, horror | phrygian or minor | `i - bII - i`, `i - bII`, drone + `dissonant_hit` | 50–70 | sustain, tension pulse, drone intensity 4–5 | 2 under, 5 on the hit |
| Suspense, investigation | minor or dorian | `i - VI - i - VII`, `i - iv` | 80–100 | pulse | 2–3 |
| Unease, something's wrong | locrian or minor | `i - bII - bVII - i`, single `io` | 55–70 | sustain, sparse theme in low octave | 1–2 |
| Melancholy, loss | minor (aeolian) | `i - VI - III - VII`, `i - iv - VI - V` | 60–72 | sustain, slow theme | 2 |
| Bittersweet, memory | dorian or major | `I - V - vi - IV`, `i - IV` (dorian) | 65–80 | arpeggio | 2 |
| Hope, resolve | major or lydian | `I - IV - I - V`, `I - II` (lydian) | 70–90 | sustain into arpeggio | 2–3 |
| Wonder, discovery | lydian | `I - II - I`, `Imaj7 - IIadd9` | 60–80 | arpeggio, theme octave 5 | 2 |
| Heroic, triumph | major or mixolydian | `I - bVII - IV - I`, `I - V - IV` | 90–120 | pulse, theme octave 4 | 3–4 |
| Romance, tenderness | major | `Imaj7 - vi7 - IVmaj7 - V` | 60–75 | sustain or gentle arpeggio | 1–2 |
| Menace, villain | harmonic_minor | `i - V7 - i`, `i - bVI - V` | 60–80 | pulse in low octave, theme with `b2`/`#4` | 3 |
| Action, chase | minor | `i - bVII - bVI - bVII` | 120–150 | pulse + riser into hits | 4 |
| Aftermath, numbness | minor or none | single `i` or drone only, or silence | free | drone intensity 1–2 | 1 |
| Comedy, light | major or mixolydian | `I - IV - V - I` | 100–130 | pulse, short theme | 2–3 |

## Keys

- Darker and heavier: C, D, Eb or F minor, with roots low (C2–F2).
- Brighter and more open: D, E, G or A major.
- Pick one home key per scene. For a lift, move the final section up a
  semitone or a whole tone. For a darker return, keep the tonic and switch the
  mode (major to minor, or minor to phrygian).

## Leitmotif recipes (scale degrees for `generate_theme`)

| Character type | Notes | Durations (beats) |
| --- | --- | --- |
| Hero, rising | `1 5 8 7 5` | `1 1 2 1 3` |
| Mystery | `1 b2 1 5,` | `2 1 1 4` |
| Villain | `1 b3 #4 5 b3 1` | `1 1 1 2 1 2` |
| Lament | `5 4 b3 2 1` | `2 1 1 1 3` |
| Innocence | `3 5 6 5 3 2 1` | `1 0.5 0.5 1 1 1 3` |
| Unresolved, cliffhanger | `1 3 5 7` | `1 1 1 4` (ends off the tonic) |

To state a theme in a darker light, keep the degrees and change the mode, or
drop it an octave and lower the intensity.

## Instrument suggestions

ReaSynth is a placeholder. If the user owns any of these, suggest
`set_track_instrument`:
- **Pads:** Spitfire LABS (Strings, Soft Piano), Vital, Surge XT (all free)
- **Theme:** LABS Solo Cello, Piano, Felt Piano
- **Pulse:** LABS Pulse or Ostinato patches, or a muted synth pluck
- **Stingers:** orchestral hits, low brass, taiko
