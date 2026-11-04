# REAPER Drama Director: a Claude plugin

A Claude plugin that lets Claude direct audio dramas in REAPER. Once it's
installed, you can paste a script into Claude and it will build the scene:
character dialogue tracks, dialogue and SFX placed at exact times, levels and
fades, markers, and MIDI drone beds and tension pulses.

It bundles:

- **An MCP server** (`server.py`, started automatically by Claude) that
  controls REAPER through [reapy](https://github.com/RomeoDespres/reapy).
- **The `audio-drama-director` skill**, which teaches Claude the workflow
  (cue sheet, then dialogue, SFX, score, levels and a final check) and sensible
  mix levels. It loads automatically when you ask for scene work in REAPER.
- **The `/assemble-scene` command**, a shortcut that hands Claude a script or
  stem folder to build.

> Claude runs the plugin on your own computer, next to REAPER. That means
> Claude Code or the Claude desktop app (Cowork). It can't run from a cloud
> session or claude.ai in a browser, because those can't reach the REAPER
> on your machine.

## Install

### 1. One-time REAPER setup

1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/).
   The plugin uses it to fetch its Python dependencies automatically.
2. Install reapy into the Python that REAPER will use:
   ```
   pip install python-reapy
   ```
3. In REAPER: *Options → Preferences → Plug-ins → ReaScript*, tick
   **Enable Python for use with ReaScript**, and point it at that Python.
4. In REAPER: *Actions → Show action list → New action → New ReaScript…*,
   save it as `enable_reapy.py` with the content below, then run it once:
   ```python
   import reapy
   reapy.config.enable_dist_api()
   ```
5. Restart REAPER.

### 2. Install the plugin in Claude

In Claude Code, or a Cowork session in the Claude desktop app:

```
/plugin install reaper-drama-director --marketplace shatteredgroundalbum-ops/Trip-Monitor-
```

On older Claude Code versions, add the marketplace first:

```
/plugin marketplace add shatteredgroundalbum-ops/Trip-Monitor-
/plugin install reaper-drama-director@shattered-ground-plugins
```

Restart Claude if asked. `/mcp` should then list `reaper-director` as
connected, as long as REAPER is open.

## Use it

With REAPER open, either run:

```
/assemble-scene Scene 1, "The Vault". Kaelen and Vance. Lines are in C:/Audio/Scene1/
```

or just ask:

> Assemble Scene 1 in REAPER:
> - Characters Kaelen and Vance.
> - C:/Audio/Vance_Line1.wav at 0.0s, C:/Audio/Kaelen_Response.wav at 4.5s.
> - Gunshot from C:/Audio/sfx_blast.wav at 7.2s.
> - Eerie C2 drone at intensity 4 from 0 to 12s, with a tension pulse building into the gunshot.

Every tool call is one undo step in REAPER, so Ctrl+Z backs out anything
you don't like.

## Tools

| Tool | What it does |
| --- | --- |
| `init_drama_session` | Creates `VO - <name>` tracks (ReaEQ + ReaComp), SFX, ambience, underscore and pulse tracks (ReaSynth), and a start marker. Safe to re-run. |
| `insert_audio_stem` | Places an audio file at an exact time with fades and gain, sized to the file's real length. |
| `set_track_volume` | Sets track fader (dB) and pan. |
| `generate_synth_drone` | MIDI pad, intensity 1–5 (root, then adds the 5th, minor 3rd and flat 9th). |
| `generate_tension_pulse` | Heartbeat pulse that gets louder and, optionally, faster. |
| `add_timeline_marker` | Cue or beat marker. |
| `list_session` | Lists tracks, clips and markers so Claude can check its work. |

## Troubleshooting

- **"Could not reach REAPER"**: REAPER isn't open, or setup steps 3–5 weren't
  done (REAPER needs a restart after step 4).
- **`reaper-director` fails to start in `/mcp`**: check that `uv` is installed
  and on your PATH (`uv --version`), then restart Claude.
- **"audio file not found"**: use absolute paths on the computer running REAPER.
- **Silent MIDI**: make sure the score tracks still have ReaSynth (or another
  synth) and aren't muted.

## Without uv

Run `pip install -r requirements.txt`, then change `.mcp.json` to use
`"command": "python"` and `"args": ["${CLAUDE_PLUGIN_ROOT}/server.py"]`.
