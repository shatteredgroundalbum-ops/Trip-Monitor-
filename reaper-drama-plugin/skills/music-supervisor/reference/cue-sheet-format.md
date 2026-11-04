# Cue sheet format

## Table for the user

| Cue ID | Trigger in script | Assigned track | Emotional intent | In / out mechanics |
|---|---|---|---|---|
| CUE-01 | Stage: "The floorboard creaks outside the bedroom door." (anchored to end of "Did you hear that?" +0.5 s) | tension_dark_drone_01.mp3 | Unsettled, creeping paranoia | 3 s slow swell; duck under whispered line |
| CUE-02 | Dialogue: "Wait... did you leave the back latch undone?" | suspense_clock_tick_02.mp3 | Building urgency | Crossfade from CUE-01 over 2 s; duck −14 dB under dialogue |
| CUE-03 | Dialogue: "Relax, it's just the cat." (cat knocks over vase) | playful_pizzicato_03.mp3 | Comedic release | Hard stop on the clock tick; quick upbeat entry |
| CUE-04 | Stage: "A shadow passes across the frosted glass." | action_chase_loop_05.mp3 | Sudden shock / threat | Hard hit on the crash; 0 s fade; high energy |

Always include an **Out** column or note: where each cue stops or hands over.

## `cues.json`

```json
{
  "title": "Scene 1 - The Latch",
  "cues": [
    {
      "id": "CUE-01",
      "track": "tension_dark_drone_01.mp3",
      "mood": "tension",
      "intent": "Unsettled, creeping paranoia",
      "type": "bed",
      "in":  {"line": "Did you hear that", "anchor": "end", "offset": 0.5},
      "transition_in": "fade", "fade_in": 3.0,
      "level_db": -12, "duck_db": -10
    },
    {
      "id": "CUE-02",
      "track": "suspense_clock_tick_02.mp3",
      "mood": "suspense",
      "in":  {"line": "did you leave the back latch undone", "anchor": "start"},
      "transition_in": "crossfade", "fade_in": 2.0,
      "duck_db": -14
    },
    {
      "id": "CUE-03",
      "track": "playful_pizzicato_03.mp3",
      "mood": "witty",
      "in":  {"line": "Relax, it's just the cat", "anchor": "end", "offset": 0.2},
      "transition_in": "hard",
      "out": {"line": "what was that shadow", "anchor": "start", "offset": -0.3},
      "transition_out": "fade", "fade_out": 1.0
    },
    {
      "id": "CUE-04",
      "track": "action_chase_loop_05.mp3",
      "mood": "action",
      "in":  {"line": "what was that shadow", "anchor": "end", "offset": 0.3},
      "transition_in": "hard",
      "level_db": -8
    }
  ]
}
```

### Fields

| Field | Values | Default |
|---|---|---|
| `id` | any label | — |
| `track` | filename in the library folder, or an absolute path | required |
| `type` | `bed` (sustained, loops if needed, ducked) or `stinger` (plays once, not ducked) | `bed` |
| `in` | `{"line": "...", "anchor": "start"/"end", "offset": s}` or `{"time": s}` | required |
| `out` | same shape, or omit | omitted: runs to next bed / end of episode |
| `transition_in` | `fade`, `hard`, `crossfade` (overlaps the previous bed by `fade_in`) | `fade` |
| `fade_in` | seconds | 2.0 (hard: 0) |
| `transition_out` | `fade`, `hard` | `fade` |
| `fade_out` | seconds | 2.0, stingers 0.3 (hard: 0.01) |
| `level_db` | music level relative to the dialogue | −10 bed, −4 stinger |
| `duck_db` | extra dip while anyone speaks | −8 bed, 0 stinger |
| `track_offset` | seconds into the music file to start from (skip an intro) | 0 |
| `loop` | loop the file if the cue is longer than it | true for beds |

`anchor` defaults to `start` for in-points and `end` for out-points.
`mood` and `intent` are notes for the report and aren't used by the mixer.

### Mapping the user's table words to fields

- "Hard cut" / "hard stop" / "hard hit": `transition_in: "hard"` (or `transition_out: "hard"`).
- "2s fade in": `transition_in: "fade", fade_in: 2`.
- "Crossfade from CUE-xx": `transition_in: "crossfade"` on the new cue.
- "Duck −14 dB under dialogue": `duck_db: -14`.
- "Stinger" / "hit" / "sting": `type: "stinger"`.
