"""Step 2 of 2: an adult synthetic voice raised to a little girl's register, the ordinary animation technique.

Praat's "Change gender" (praat-parselmouth, GPL-3.0; a tool, its licence does not reach the audio)
raises the formants (the size of the voice: a child's vocal tract is shorter) and moves the pitch to a
child's median, with a wider range for a delighted call. Only Kokoro and Chatterbox output goes in:
never ElevenLabs output.
  .tools/venv-praat/bin/python audio/child/shift.py
Output: audio/out/child/shift/<base>-<strength>.wav (48 kHz) and shift-report.json (pitch before/after).
"""
import json
import os

import numpy as np
import parselmouth
from parselmouth.praat import call
import soundfile as sf
from scipy.signal import resample_poly

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = os.path.join(ROOT, "audio", "out", "child", "base")
OUT = os.path.join(ROOT, "audio", "out", "child", "shift")
# strength → (formant ratio, pitch median in Hz for "look", for "unanswered", pitch range factor for "look")
STRENGTH = {"m": (1.17, 290, 270, 1.35), "s": (1.24, 320, 295, 1.5)}


def median_f0(snd):
    return call(snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=700), "Get quantile", 0, 0, 0.5, "Hertz")


def tidy(a, sr):
    env = np.abs(a)
    loud = np.where(env > 0.02 * env.max())[0]
    a = a[max(0, loud[0] - int(0.02 * sr)): loud[-1] + int(0.12 * sr)]
    n = int(0.006 * sr)
    a[:n] *= np.linspace(0, 1, n)
    a[-n:] *= np.linspace(1, 0, n)
    if sr != 48000:
        from math import gcd
        g = gcd(sr, 48000)
        a = resample_poly(a, 48000 // g, sr // g)
    return (a * (0.1 / np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2)))).astype("float32")


def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    for f in sorted(os.listdir(BASE)):
        if not f.endswith(".wav"):
            continue
        snd = parselmouth.Sound(os.path.join(BASE, f))
        before = median_f0(snd)
        unanswered = "-unanswered-" in f
        for name, (formant, f0_look, f0_small, rng) in STRENGTH.items():
            new = call(snd, "Change gender", 75, 600, formant, f0_small if unanswered else f0_look, 1.0 if unanswered else rng, 1.0)
            a = tidy(new.values[0].astype("float64"), int(new.sampling_frequency))
            out = f.replace(".wav", f"-{name}.wav")
            sf.write(os.path.join(OUT, out), a, 48000)
            report[out] = {"f0_before": round(before, 1), "f0_after": round(median_f0(parselmouth.Sound(os.path.join(OUT, out))), 1), "seconds": round(len(a) / 48000, 2)}
    json.dump(report, open(os.path.join(OUT, "shift-report.json"), "w"), indent=1)
    print(len(report), "clips")


if __name__ == "__main__":
    main()
