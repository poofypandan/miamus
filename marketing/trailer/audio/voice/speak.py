"""Speaks Kakak's lines with one of the candidate voices and saves them, ready for the mix.

A candidate is one speaker with two melodies: the same 128 numbers for the
sound of her voice in both languages, an American melody for English and an
Indonesian-friendly one for Bahasa Indonesia (see explore.py for how each
was measured). Kokoro-82M, Apache-2.0: its output may be used commercially.

  python audio/voice/speak.py kakak-a            the trailer's lines, both languages
  python audio/voice/speak.py kakak-a audition   the three audition lines, both languages
"""
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

import kk
import lines

# name → (the sound of the voice, English melody, Indonesian melody)
VOICES = {
    "kakak-a": ("af_heart:0.7,hf_beta:0.3", "af_heart", "hf_beta"),
    "kakak-b": ("af_bella:0.7,hf_beta:0.3", "af_bella", "hf_beta"),
    "kakak-c": ("af_sarah:0.7,hf_beta:0.3", "af_sarah", "hf_beta"),
    "kakak-d": ("af_nicole:0.6,hf_beta:0.4", "af_nicole", "hf_beta"),
}
# Unhurried: a little under Kokoro's natural pace. The 15-second cut's lines (S…) are a touch quicker.
SPEED = {"en": 0.84, "id": 0.9, "en-short": 0.88, "id-short": 0.95}
# One candidate speaks slowly by nature: bring it up to the others' pace.
FASTER = {"kakak-d": {"en": 1.3}}
OUT_SR = 48000


def tidy(a):
    """Trim the silence at both ends, remove rumble, bring to a common level, 48 kHz."""
    a = sosfilt(butter(2, 70, "high", fs=kk.SR, output="sos"), a)
    env = np.abs(a)
    loud = np.where(env > 0.012)[0]
    if len(loud):
        a = a[max(0, loud[0] - int(0.02 * kk.SR)) : min(len(a), loud[-1] + int(0.12 * kk.SR))]
    n = int(0.008 * kk.SR)
    a[:n] *= np.linspace(0, 1, n)
    a[-n:] *= np.linspace(1, 0, n)
    a = resample_poly(a, 2, 1)
    rms = np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2))
    return (a * (0.1 / rms)).astype("float32")


def speak(name, what="film"):
    sound, mel_en, mel_id = VOICES[name]
    out = os.path.join(kk.ROOT, "audio", "out", "vo", name)
    table = {}
    if what == "film":
        jobs = [("en", k, ("text", v)) for k, v in lines.EN.items()] + [("id", k, ("phon", v)) for k, v in lines.ID.items()]
    else:
        jobs = [("en", f"A{i + 1}", ("text", v)) for i, v in enumerate(lines.AUDITION_EN)] + [("id", f"A{i + 1}", ("phon", v)) for i, v in enumerate(lines.AUDITION_ID)]
    for locale, key, (kind, content) in jobs:
        spec = f"{sound}/{mel_en if locale == 'en' else mel_id}"
        speed = SPEED[f"{locale}-short" if key.startswith("S") else locale] * FASTER.get(name, {}).get(locale, 1.0)
        a = kk.say_text(content, spec, speed)[0] if kind == "text" else kk.say_phonemes(content, spec, speed)
        a = tidy(a)
        os.makedirs(os.path.join(out, locale), exist_ok=True)
        sf.write(os.path.join(out, locale, f"{key}.wav"), a, OUT_SR)
        table.setdefault(locale, {})[key] = round(len(a) / OUT_SR, 3)
    json.dump(table, open(os.path.join(out, f"durations-{what}.json"), "w"), indent=1)
    return table


if __name__ == "__main__":
    name = sys.argv[1]
    what = sys.argv[2] if len(sys.argv) > 2 else "film"
    t = speak(name, what)
    for locale, rows in t.items():
        print(locale, " ".join(f"{k}={v:.2f}" for k, v in rows.items()))
