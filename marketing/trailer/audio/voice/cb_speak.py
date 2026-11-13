"""The audition lines in a second engine, Chatterbox Multilingual (MIT), for comparison on the listening page.

Chatterbox has no Indonesian; its nearest language is Malay, and Whisper
hears its Indonesian as Malay (see audio/README.md). It is here so the
owners can hear a different kind of voice, not as the film's choice.
  .tools/venv-chatterbox/bin/python audio/voice/cb_speak.py
"""
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

import importlib.util

spec = importlib.util.spec_from_file_location("lines", os.path.join(os.path.dirname(__file__), "lines.py"))
lines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lines)

plain = lambda t: re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
model = ChatterboxMultilingualTTS.from_pretrained(device="mps" if torch.backends.mps.is_available() else "cpu")
out = os.path.join(ROOT, "audio", "out", "vo", "kakak-e")
for locale, lang, texts in (("en", "en", [plain(t) for t in lines.AUDITION_EN]), ("id", "ms", lines.AUDITION_ID_TEXT)):
    os.makedirs(os.path.join(out, locale), exist_ok=True)
    for i, text in enumerate(texts):
        torch.manual_seed(7 + i)
        a = model.generate(text, language_id=lang, exaggeration=0.42, cfg_weight=0.5, temperature=0.7).squeeze().cpu().numpy()
        loud = np.where(np.abs(a) > 0.012)[0]
        a = a[max(0, loud[0] - 500) : loud[-1] + 3000]
        a = resample_poly(a, 2, 1)
        a = a * (0.1 / np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2)))
        sf.write(os.path.join(out, locale, f"A{i + 1}.wav"), a.astype("float32"), 48000)
        print(locale, f"A{i + 1}", round(len(a) / 48000, 2), flush=True)
