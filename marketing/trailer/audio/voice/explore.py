"""Which voice can be Kakak in both languages? Measures every candidate the same way.

For each voice (a Kokoro voice, or a blend of two), speaks four of her lines
in Indonesian and in English, then asks Whisper two things about each clip:
which language it hears (how surely Indonesian, how surely English), and
what words it hears (how many it gets wrong against the script). It cannot
judge warmth; that is for ears. It rules out voices that mispronounce.

  python audio/voice/explore.py            writes audio/out/explore/results.json and prints the table
"""
import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

import kk
import lines
from asr import MODEL

import mlx.core as mx
import mlx_whisper
from mlx_whisper.audio import N_FRAMES, N_SAMPLES, log_mel_spectrogram, pad_or_trim
from mlx_whisper.load_models import load_model

ROOT = kk.ROOT
OUT = os.path.join(ROOT, "audio", "out", "explore")
os.makedirs(OUT, exist_ok=True)

PICK = ["L3", "L5", "L9", "L11"]
EN_FEMALE = ["af_heart", "af_bella", "af_nicole", "af_sarah", "af_aoede", "af_kore", "af_sky", "af_nova", "af_jessica", "af_river", "af_alloy", "bf_emma", "bf_isabella", "bf_alice", "bf_lily"]
OTHER_FEMALE = ["ef_dora", "if_sara", "pf_dora", "jf_alpha", "jf_tebukuro", "jf_nezumi", "jf_gongitsune", "hf_alpha", "hf_beta", "ff_siwis", "zf_xiaoxiao", "zf_xiaoyi"]
BLEND_A = ["af_heart", "af_bella", "af_nicole", "af_sarah", "bf_emma"]
BLEND_B = ["ef_dora", "if_sara", "jf_alpha", "pf_dora", "hf_alpha"]


def norm(text):
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    return re.sub(r"[^a-z0-9 ]", "", text.lower().replace("a.i.", "ai").replace("-", " ")).split()


def wer(ref, hyp):
    r, h = norm(ref), norm(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), dtype=int)
    d[:, 0] = np.arange(len(r) + 1)
    d[0, :] = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[len(r), len(h)] / max(1, len(r))


def to16k(a):
    return resample_poly(a, 2, 3).astype("float32")


def main():
    model = load_model(MODEL, dtype=mx.float16)

    def hear(a24, lang):
        a = to16k(a24)
        mel = log_mel_spectrogram(a, n_mels=model.dims.n_mels, padding=N_SAMPLES)
        seg = pad_or_trim(mel, N_FRAMES, axis=-2).astype(mx.float16)
        _, probs = model.detect_language(seg)
        probs = probs[0] if isinstance(probs, list) else probs
        text = mlx_whisper.transcribe(a, path_or_hf_repo=MODEL, language=lang, temperature=0.0, condition_on_previous_text=False, verbose=None)["text"].strip()
        return probs, text

    gap = np.zeros(int(0.35 * kk.SR), dtype="float32")
    ref_id = " ".join(lines.ID_TEXT[k] for k in PICK)
    ref_en = " ".join(lines.EN[k] for k in PICK)
    cands = EN_FEMALE + OTHER_FEMALE + [f"{a}:0.5,{b}:0.5" for a in BLEND_A for b in BLEND_B]
    only = sys.argv[1:]
    if only:
        cands = only
    results = []
    for v in cands:
        try:
            clip_id = np.concatenate(sum(([kk.say_phonemes(lines.ID[k], v, 0.95), gap] for k in PICK), []))
            clip_en = np.concatenate(sum(([kk.say_text(lines.EN[k], v, 0.95)[0], gap] for k in PICK), []))
        except Exception as e:  # a voice that isn't in the model
            print(v, "skipped:", repr(e)[:120], flush=True)
            continue
        name = v.replace(":", "").replace(",", "+").replace(".", "").replace("/", "~")
        sf.write(os.path.join(OUT, f"{name}_id.wav"), clip_id, kk.SR)
        sf.write(os.path.join(OUT, f"{name}_en.wav"), clip_en, kk.SR)
        p_id, t_id = hear(clip_id, "id")
        p_en, t_en = hear(clip_en, "en")
        row = {
            "voice": v,
            "id_p_id": round(float(p_id.get("id", 0)), 3), "id_p_ms": round(float(p_id.get("ms", 0)), 3), "id_top": max(p_id, key=p_id.get),
            "id_wer": round(wer(ref_id, t_id), 3), "id_text": t_id,
            "en_p_en": round(float(p_en.get("en", 0)), 3), "en_top": max(p_en, key=p_en.get), "en_wer": round(wer(ref_en, t_en), 3), "en_text": t_en,
            "id_secs": round(len(clip_id) / kk.SR, 2), "en_secs": round(len(clip_en) / kk.SR, 2),
        }
        results.append(row)
        print(f"{v:34s} ID p(id)={row['id_p_id']:.2f} top={row['id_top']} wer={row['id_wer']:.2f} | EN p(en)={row['en_p_en']:.2f} wer={row['en_wer']:.2f}", flush=True)
        json.dump(results, open(os.path.join(OUT, "results.json" if not only else "results-extra.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
