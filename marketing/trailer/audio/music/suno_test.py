"""The owner's Suno track (free plan, Suno v6-mini, 3:23), trimmed to 60 s for the listening page: a SOUND TEST ONLY.
Suno's free plan gives no commercial rights, so this can never be in the ad or any film; it helps the owner judge
whether Suno Pro is worth paying for.

The track is a steady groove at about 89 bpm (bar 2.693 s, downbeats at 0.21 s + n bars), in C, with one natural
break near the end (bar 72, 3:14.1: the bass drops out, the keys go on) and the return on bar 73 (3:16.8), then two
bars fading out. Cut on its own bar lines, 40 ms equal-power crossfades, levels left as the track has them:
  film 0:05–0:44.3   the 39 s of groove before the break (eased in at 0:05)
  0:44.3–0:47        the break bar
  0:47.0             the return (bar 73)
  0:49.7–0:55.1      two full groove bars from earlier (bars 67–68), so the ending reaches the card
  0:55.1–1:00        the track's own two-bar fade (bars 74–75), cut at 1:00

  .tools/venv-main/bin/python audio/music/suno_test.py [path to owner-suno-1-freeplan.m4a]
Writes audio/out/music-60-suno-test.wav.
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, db
from lofi import LENGTH, MUSIC_FROM, RETURN, TARGET_LUFS
from measure_lofi import lufs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT = "/Users/moshe/Miamus/docs/private/marketing/audio/suno/owner-suno-1-freeplan.m4a"
BAR, PHASE = 2.6928, 0.21


def downbeat(k):
    return PHASE + k * BAR


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "x.wav")
        subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", wav], cwd=ROOT, check=True)
        x, _ = sf.read(wav)
    cut = lambda a, b: x[int(round(a * SR)) : int(round(b * SR))].copy()
    brk = RETURN - BAR
    parts = [
        (MUSIC_FROM, cut(downbeat(72) - (brk - MUSIC_FROM), downbeat(73))),  # groove into the break, then the break bar
        (RETURN, cut(downbeat(73), downbeat(74))),  # the return
        (RETURN + BAR, cut(downbeat(67), downbeat(69))),  # two full bars from earlier
        (RETURN + 3 * BAR, cut(downbeat(74), len(x) / SR)),  # the track's own fade
    ]
    out = np.zeros((int((LENGTH + 10) * SR), 2))
    n = int(0.04 * SR)
    up = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
    for i, (at, a) in enumerate(parts):
        if i:
            a[:n] *= up
        if i < len(parts) - 1:
            a[-n:] *= up[::-1]
        j = int(round(at * SR))
        out[j : j + len(a)] += a
    out = out[: int(LENGTH * SR)]
    a = int(MUSIC_FROM * SR)
    out[a : a + int(0.4 * SR)] *= np.linspace(0, 1, int(0.4 * SR))[:, None]
    out[-int(0.9 * SR) :] *= np.cos(np.linspace(0, np.pi / 2, int(0.9 * SR)))[:, None]
    path = os.path.join(ROOT, "audio", "out", "music-60-suno-test.wav")
    sf.write(path, out.astype("float32"), SR)
    now, _ = lufs(path)
    out = out * db(TARGET_LUFS - now)
    if np.abs(out).max() > 0.89:
        out *= 0.89 / np.abs(out).max()
    sf.write(path, out.astype("float32"), SR)
    print(f"wrote {os.path.relpath(path, ROOT)} ({lufs(path)[0]:.1f} LUFS)")


if __name__ == "__main__":
    main()
