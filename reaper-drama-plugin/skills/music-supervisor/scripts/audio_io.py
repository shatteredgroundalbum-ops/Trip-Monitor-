"""Audio loading/saving for the music-supervisor scripts.

Uses ffmpeg when available (any format: mp3, wav, m4a, flac, ogg...). Falls
back to the `imageio-ffmpeg` package's bundled ffmpeg, then to plain WAV via
the standard library. All audio is handled as float32 stereo at 48 kHz.
"""

import os
import shutil
import subprocess
import wave

import numpy as np

SR = 48000


def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # pip install imageio-ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _to_stereo(a):
    if a.ndim == 1:
        a = a[:, None]
    if a.shape[1] == 1:
        a = np.repeat(a, 2, axis=1)
    return a[:, :2]


def _resample(a, src_sr, dst_sr):
    if src_sr == dst_sr or len(a) == 0:
        return a
    n = int(round(len(a) * dst_sr / src_sr))
    x_old = np.linspace(0.0, 1.0, len(a), endpoint=False)
    x_new = np.linspace(0.0, 1.0, n, endpoint=False)
    return np.stack([np.interp(x_new, x_old, a[:, c]) for c in range(a.shape[1])], axis=1).astype(np.float32)


def load(path, sr=SR):
    """Return float32 array of shape (samples, 2) at `sr`."""
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Audio file not found: {path}")
    exe = ffmpeg_exe()
    if exe:
        proc = subprocess.run(
            [exe, "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le",
             "-ac", "2", "-ar", str(sr), "-"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg could not read {path}: {proc.stderr.decode(errors='ignore')[:300]}")
        return np.frombuffer(proc.stdout, dtype=np.float32).reshape(-1, 2).copy()
    if not path.lower().endswith(".wav"):
        raise RuntimeError(
            f"Can't read {os.path.basename(path)} without ffmpeg. Run `pip install imageio-ffmpeg`, "
            "or convert the file to WAV."
        )
    with wave.open(path, "rb") as w:
        ch, width, src_sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if width == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        ints = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        ints = np.where(ints >= 1 << 23, ints - (1 << 24), ints)
        a = ints.astype(np.float32) / float(1 << 23)
    elif width == 4:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float32) / float(1 << 31)
    elif width == 1:
        a = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128) / 128.0
    else:
        raise RuntimeError(f"Unsupported WAV sample width {width} in {path}")
    a = _to_stereo(a.reshape(-1, ch))
    return _resample(a, src_sr, sr)


def save(path, audio, sr=SR, bitrate="192k"):
    """Write WAV (16-bit) or, with ffmpeg, MP3/M4A/FLAC/OGG based on extension."""
    audio = np.clip(_to_stereo(np.asarray(audio, dtype=np.float32)), -1.0, 1.0)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    if path.lower().endswith(".wav"):
        pcm = (audio * 32767.0).astype("<i2")
        with wave.open(path, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(pcm.tobytes())
        return path
    exe = ffmpeg_exe()
    if not exe:
        raise RuntimeError("Saving anything but .wav needs ffmpeg (`pip install imageio-ffmpeg`).")
    proc = subprocess.run(
        [exe, "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(sr), "-i", "-",
         "-b:a", bitrate, path],
        input=audio.astype(np.float32).tobytes(), stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg could not write {path}: {proc.stderr.decode(errors='ignore')[:300]}")
    return path


def rms_db(audio, floor_db=-120.0):
    if len(audio) == 0:
        return floor_db
    r = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
    return max(floor_db, 20 * np.log10(r)) if r > 0 else floor_db


def active_rms_db(audio, sr=SR, frame=0.05, gate_db=-50.0):
    """RMS over frames louder than gate_db: the level of the audible material
    (speech without the pauses, music without silent tails)."""
    hop = max(1, int(sr * frame))
    n = len(audio) // hop
    if n == 0:
        return rms_db(audio)
    mono = audio[: n * hop].mean(axis=1).reshape(n, hop)
    frames = np.sqrt(np.mean(mono.astype(np.float64) ** 2, axis=1)) + 1e-12
    db = 20 * np.log10(frames)
    loud = frames[db > gate_db]
    if len(loud) == 0:
        return rms_db(audio)
    return float(20 * np.log10(np.sqrt(np.mean(loud ** 2))))


def peak_db(audio):
    p = float(np.max(np.abs(audio))) if len(audio) else 0.0
    return 20 * np.log10(p) if p > 0 else -120.0
