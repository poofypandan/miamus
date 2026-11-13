"""Kokoro helpers for the trailer's voice work (Kokoro-82M, Apache-2.0).

English lines go through Kokoro's own English reader. Indonesian lines are
given as hand-written phonemes (Kokoro has no Indonesian reader), so every
vowel is the one an Indonesian speaker says: "teras" with é, "sekali" with
the soft e, final k as a glottal stop.
"""
import os
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))

import numpy as np
import torch
from phonemizer.backend.espeak.wrapper import EspeakWrapper
import misaki.espeak  # noqa: F401  (sets the bundled espeak paths, which are too long for espeak's 160-char buffer)

# Homebrew's espeak-ng: a short data path (see audio/setup.sh).
EspeakWrapper.set_library("/opt/homebrew/lib/libespeak-ng.dylib")
EspeakWrapper.set_data_path("/opt/homebrew/share/espeak-ng-data")

from kokoro import KPipeline  # noqa: E402

SR = 24000
_pipes = {}


def pipe(lang="a"):
    if lang not in _pipes:
        _pipes[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    return _pipes[lang]


def voice_tensor(spec):
    """A voice name ("af_heart") or a blend ("af_heart:0.6,af_bella:0.4")."""
    p = pipe("a")
    if ":" not in spec:
        return p.load_voice(spec)
    parts = [s.split(":") for s in spec.split(",")]
    total = sum(float(w) for _, w in parts)
    return sum(p.load_voice(n) * (float(w) / total) for n, w in parts)


def say_text(text, voice, speed=1.0, lang="a"):
    """English text → (audio, phonemes)."""
    p = pipe(lang)
    v = voice_tensor(voice)
    chunks, phon = [], []
    for r in p(text, voice=v, speed=speed, split_pattern=None):
        chunks.append(r.audio.cpu().numpy())
        phon.append(r.phonemes)
    return np.concatenate(chunks), " ".join(phon)


def say_phonemes(phonemes, voice, speed=1.0):
    """A phoneme string (Kokoro's alphabet) → audio."""
    p = pipe("a")
    v = voice_tensor(voice)
    chunks = [r.audio.cpu().numpy() for r in p.generate_from_tokens(tokens=phonemes, voice=v, speed=speed)]
    return np.concatenate(chunks)
