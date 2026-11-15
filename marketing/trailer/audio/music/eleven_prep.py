"""Readies the Eleven Music candidates (audio/out/eleven/music/<name>.mp3, from el.py's music job) for the
listening page: each 55 s song placed at 5.0 s in a 60 s track (the hook stays silent), eased in and out, and set to
the same loudness as the scores composed here (lofi.TARGET_LUFS). Writes audio/out/music-60-eleven-<name>.wav.

Listening and comparison only: these must not go into any ad until ElevenLabs confirms the plan's music licence
covers company ads (owner, 15 Nov 2026).

  .tools/venv-main/bin/python audio/music/eleven_prep.py
"""
import glob
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, db, fade
from lofi import LENGTH, MUSIC_FROM, TARGET_LUFS
from measure_lofi import lufs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

for src in sorted(glob.glob(os.path.join(ROOT, "audio", "out", "eleven", "music", "*.mp3"))):
    name = os.path.splitext(os.path.basename(src))[0]
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "x.wav")
        subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", wav], cwd=ROOT, check=True)
        song, _ = sf.read(wav)
    room = int((LENGTH - MUSIC_FROM) * SR)
    song = song[:room]
    song = song * fade(int(0.05 * SR), int(0.6 * SR), len(song))[:, None]
    out = np.zeros((int(LENGTH * SR), 2))
    a = int(MUSIC_FROM * SR)
    out[a : a + len(song)] = song
    path = os.path.join(ROOT, "audio", "out", f"music-60-eleven-{name}.wav")
    sf.write(path, out.astype("float32"), SR)
    now, _ = lufs(path)
    out = out * db(min(6.0, TARGET_LUFS - now))
    peak = np.abs(out).max()
    if peak > 0.89:
        out *= 0.89 / peak
    sf.write(path, out.astype("float32"), SR)
    print(f"wrote {os.path.relpath(path, ROOT)} ({len(song) / SR:.1f} s of music, {now:.1f} → {lufs(path)[0]:.1f} LUFS)", flush=True)
