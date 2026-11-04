# REAPER Audio Drama Director (MCP plugin for Claude)

A local MCP server that lets Claude drive a running REAPER instance through
[reapy](https://github.com/RomeoDespres/reapy). Claude can scaffold an audio
drama session, place dialogue and SFX stems at exact times, set volume and
fades, and write dark ambient MIDI drones and heartbeat tension pulses.

## Tools

| Tool | What it does |
| --- | --- |
| `init_drama_session(scene_title, characters)` | Creates `VO - <name>` tracks (ReaEQ + ReaComp), SFX, ambience, underscore and pulse tracks (ReaSynth), and a start marker. Re-running reuses existing tracks. |
| `insert_audio_stem(track_name, file_path, position_seconds, fade_in, fade_out, volume_db)` | Places an audio file at an exact time, sized to the file's real length. |
| `set_track_volume(track_name, volume_db, pan)` | Sets track fader and pan. |
| `generate_synth_drone(pitch_root, start_seconds, duration_seconds, intensity)` | MIDI pad on `SCORE - Synth Underscore`. Intensity 1–5 adds the 5th, minor 3rd, then flat 9th. |
| `generate_tension_pulse(pitch_root, start_seconds, duration_seconds, bpm, accelerate)` | Heartbeat-style pulse on `SCORE - Tension Pulse` that gets louder and, if `accelerate` is on, faster. |
| `add_timeline_marker(position_seconds, label)` | Adds a cue marker. |
| `list_session()` | Lists tracks, items and markers so Claude can check its work. |

Each tool call is a single undo step in REAPER (Ctrl+Z).

## Setup

1. **Install Python dependencies** (Python 3.10+):
   ```
   pip install -r requirements.txt
   ```

2. **Enable Python in REAPER**: *Options → Preferences → Plug-ins → ReaScript*,
   tick **Enable Python for use with ReaScript**, and point it at the same
   Python install you used in step 1. Restart REAPER if asked.

3. **Enable reapy's distant API. You have to do this from inside REAPER**, not
   from a terminal. Create a new ReaScript (*Actions → Show action list →
   New action → New ReaScript…*), save it as `enable_reapy.py`, with:
   ```python
   import reapy
   reapy.config.enable_dist_api()
   ```
   Run it once, then restart REAPER. From then on, REAPER listens for reapy
   connections whenever it's running.

4. **Register the server with Claude Desktop.** Edit:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

   Add the entry from `claude_desktop_config.json` in this folder, using the
   absolute path to `server.py`. If `python` doesn't resolve to the
   interpreter from step 1, use its full path (for example
   `C:/Python312/python.exe` or `/usr/local/bin/python3`).

   To use it from Claude Code instead:
   ```
   claude mcp add reaper-director -- python /absolute/path/to/server.py
   ```

5. **Restart Claude Desktop.** The tools above should show up in the tools
   (hammer) menu.

## Example prompt

With REAPER open:

> Assemble Scene 1 in REAPER:
> - Initialize the project "The Vault" for characters Kaelen and Vance.
> - Place C:/Audio/Vance_Line1.wav on "VO - Vance" at 0.0s and
>   C:/Audio/Kaelen_Response.wav on "VO - Kaelen" at 4.5s.
> - Add a gunshot from C:/Audio/sfx_blast.wav on "SFX - Spot Foley" at 7.2s, at -3 dB.
> - Underlay an eerie C2 drone at intensity 4 from 0s to 12s.
> - Add a tension pulse on C1 from 3s to 7.2s, accelerating into the gunshot.
> - Then list the session so we can check it.

## Troubleshooting

- **"Could not reach REAPER"**: REAPER isn't running, or step 3 wasn't done
  (or REAPER wasn't restarted afterwards).
- **"audio file not found"**: paths are resolved on the machine running
  REAPER and the server. Use absolute paths.
- **Silent MIDI**: check that the score tracks still have ReaSynth (or a
  synth of your choice) loaded and aren't muted.
