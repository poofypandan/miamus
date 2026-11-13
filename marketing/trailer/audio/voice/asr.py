"""Checks what a listener would hear: Whisper (large-v3-turbo, MIT, on-device) writes down each clip.

Used only to check pronunciation; nothing it produces is in the film.
  python audio/voice/asr.py id file1.wav file2.wav ...
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def load16k(path):
    a, sr = sf.read(path, dtype="float32", always_2d=True)
    a = a.mean(axis=1)
    if sr != 16000:
        from math import gcd
        g = gcd(sr, 16000)
        a = resample_poly(a, 16000 // g, sr // g).astype("float32")
    return a


def hear(path, lang=None):
    out = mlx_whisper.transcribe(load16k(path), path_or_hf_repo=MODEL, language=lang, temperature=0.0, condition_on_previous_text=False, verbose=None)
    return out["text"].strip(), out.get("language")


if __name__ == "__main__":
    lang = sys.argv[1] if sys.argv[1] != "auto" else None
    for p in sys.argv[2:]:
        text, detected = hear(p, lang)
        print(f"{os.path.basename(p):28s} [{detected}] {text}")
