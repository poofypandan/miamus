"""A second opinion on the English: which English accent does a classifier hear in each clip?

Uses the open CommonAccent classifier (ECAPA-TDNN, SpeechBrain; trained on
Mozilla Common Voice). It is only a rough guide, and only a check: nothing
it produces is in the film.
  .tools/venv-accent/bin/python audio/voice/accent.py audio/out/explore/*_en.wav
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))

import torch
import torchaudio
from speechbrain.inference.classifiers import EncoderClassifier

clf = EncoderClassifier.from_hparams(source="Jzuluaga/accent-id-commonaccent_ecapa", savedir=os.path.join(ROOT, ".tools", "accent-ecapa"))
labels = clf.hparams.label_encoder.ind2lab
for path in sys.argv[1:]:
    wav, sr = torchaudio.load(path)
    wav = torchaudio.functional.resample(wav.mean(0, keepdim=True), sr, 16000)
    probs = clf.classify_batch(wav)[0].exp().squeeze()
    probs = probs / probs.sum()
    top = torch.topk(probs, 3)
    print(f"{os.path.basename(path):44s} " + "  ".join(f"{labels[int(i)]} {float(p):.2f}" for p, i in zip(top.values, top.indices)), flush=True)
