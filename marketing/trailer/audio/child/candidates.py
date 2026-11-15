"""The four candidate girls for the listening page, and each one heard in the hook with the music.

  .tools/venv-main/bin/python audio/child/candidates.py
Picks takes from audio/out/child/shift/ (Whisper heard each word for word), lays the hook beats over
the first 4.5 s of the 60-second music and effects, and writes audio/out/child/candidates/<name>/.
"""
import os
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "music"))
from dsp import db, highpass, pan, reverb  # noqa: E402

SHIFT = os.path.join(ROOT, "audio", "out", "child", "shift")
OUT = os.path.join(ROOT, "audio", "out", "child", "candidates")
# name → the takes for: first call, second (brighter) call, "Mama…?" (one clip serves both languages)
CANDIDATES = {
    "kokoro-calm": {"en": ("kokoro-af_bella-look-en-t1-m", "kokoro-af_bella-look-en-t2-m"), "id": ("kokoro-af_bella-look-id-t2-m", "kokoro-af_bella-look-id-t1-m"), "unanswered": "kokoro-af_bella-unanswered-id-t2-m"},
    "kokoro-bright": {"en": ("kokoro-af_bella-look-en-t1-s", "kokoro-af_heart-look-en-t2-s"), "id": ("kokoro-af_bella-look-id-t2-s", "kokoro-af_bella-look-id-t1-m"), "unanswered": "kokoro-af_bella-unanswered-id-t2-s"},
    "chatterbox-lively": {"en": ("chatterbox-default-look-en-t1-m", "chatterbox-default-look-en-t3-m"), "id": ("chatterbox-default-look-id-t3-m", "chatterbox-default-look-id-t2-m"), "unanswered": "chatterbox-default-unanswered-id-t3-m"},
    "chatterbox-bright": {"en": ("chatterbox-default-look-en-t1-s", "chatterbox-default-look-en-t3-s"), "id": ("chatterbox-default-look-id-t3-s", "chatterbox-default-look-id-t2-s"), "unanswered": "chatterbox-default-unanswered-id-t1-s"},
}
SR = 48000
# The hook, as Fable set it: her call at 0.2 s, Mama at ~2.0 s, "Mama…?" just before the slam (4.07 s).
CALL_AT, MAMA_AT, SMALL_AT = 0.2, 1.9, 3.75


def mono(path):
    a, sr = sf.read(path, dtype="float64", always_2d=True)
    assert sr == SR, path
    return a[:, 0]


def place(bed, clip, at, gain_db):
    a = int(at * SR)
    end = min(len(bed), a + len(clip))
    v = reverb(pan(highpass(clip, 120), 0.0), 0.35, 0.04)[: end - a]
    bed[a:end] += v * db(gain_db)


def context(locale, first, small, mama_path):
    n = int(4.5 * SR)
    music = sf.read(os.path.join(ROOT, "audio", "out", "music-60-felt.wav"), dtype="float64", always_2d=True)[0][:n]
    sfx = sf.read(os.path.join(ROOT, "audio", "out", "sfx-60.wav"), dtype="float64", always_2d=True)[0][:n]
    air = sf.read(os.path.join(ROOT, "audio", "out", "air-60.wav"), dtype="float64", always_2d=True)[0][:n]
    bed = music * db(-6) + sfx * db(-4) + air
    place(bed, first, CALL_AT, 2)
    if mama_path:
        place(bed, mono(mama_path), MAMA_AT, 1)
    place(bed, small, SMALL_AT, -3)
    fade = np.ones(n)
    fade[-int(0.4 * SR):] = np.linspace(1, 0, int(0.4 * SR))
    out = bed * fade[:, None]
    return out / max(1.0, np.abs(out).max() / 0.89)


def main():
    for name, c in CANDIDATES.items():
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        small = mono(os.path.join(SHIFT, c["unanswered"] + ".wav"))
        sf.write(os.path.join(d, "unanswered.wav"), small.astype("float32"), SR)
        for locale in ("en", "id"):
            first, second = (mono(os.path.join(SHIFT, t + ".wav")) for t in c[locale])
            sf.write(os.path.join(d, f"{locale}-look1.wav"), first.astype("float32"), SR)
            sf.write(os.path.join(d, f"{locale}-look2.wav"), second.astype("float32"), SR)
            mama_dir = os.path.join(ROOT, "audio", "out", "eleven", "v6", "mama-aita", locale)
            mama = next((os.path.join(mama_dir, f) for f in sorted(os.listdir(mama_dir)) if f.startswith("M1.")), None) if os.path.isdir(mama_dir) else None
            if mama and not mama.endswith(".wav"):
                mama = None
            sf.write(os.path.join(d, f"{locale}-hook.wav"), context(locale, first, small, mama).astype("float32"), SR)
        print(name)


if __name__ == "__main__":
    main()
