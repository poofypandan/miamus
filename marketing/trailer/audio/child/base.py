"""The girl's lines, spoken first by an adult synthetic voice (step 1 of 2; shift.py makes her a child).

Two open engines, both run on this laptop, both licensed for commercial use:
  Kokoro-82M (Apache-2.0): calm, clean, little drama.      .tools/venv-main/bin/python audio/child/base.py kokoro
  Chatterbox Multilingual (MIT): livelier, has an          .tools/venv-chatterbox/bin/python audio/child/base.py chatterbox
  "exaggeration" control for a delighted call.
Neither is ElevenLabs output, and no real child's voice is used or imitated: both start from the
engines' own built-in adult voices. Output: audio/out/child/base/<engine>-<voice>-<line>-<take>.wav
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))
OUT = os.path.join(ROOT, "audio", "out", "child", "base")

# line → (English text, Indonesian text, Kokoro's Indonesian phonemes)
LINES = {
    "look": ("Mama, look!", "Mama, lihat!", "mˈama, lˈihat!"),
    "unanswered": ("Mama...?", "Mama...?", "mˈama…?"),
}


def kokoro():
    sys.path.insert(0, os.path.join(ROOT, "audio", "voice"))
    import kk
    import soundfile as sf
    for voice in ("af_sky", "af_bella", "af_heart", "af_nicole"):
        for line, (en, _, ph) in LINES.items():
            for take, speed in (("t1", 1.0), ("t2", 1.12)):
                sf.write(os.path.join(OUT, f"kokoro-{voice}-{line}-en-{take}.wav"), kk.say_text(en, voice, speed)[0], kk.SR)
                sf.write(os.path.join(OUT, f"kokoro-{voice}-{line}-id-{take}.wav"), kk.say_phonemes(ph, voice, speed), kk.SR)
            print(voice, line, flush=True)


def chatterbox():
    import soundfile as sf
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    model = ChatterboxMultilingualTTS.from_pretrained(device="mps" if torch.backends.mps.is_available() else "cpu")
    # Indonesian: Chatterbox's nearest language is Malay, where "Mama, lihat!" is the same two words.
    for line, (en, idn, _) in LINES.items():
        for loc, lang, text in (("en", "en", en), ("id", "ms", idn)):
            for take, (exag, seed) in enumerate(((0.55, 3), (0.75, 5), (0.9, 8)), 1):
                torch.manual_seed(seed)
                a = model.generate(text, language_id=lang, exaggeration=exag, cfg_weight=0.4, temperature=0.75).squeeze().cpu().numpy()
                sf.write(os.path.join(OUT, f"chatterbox-default-{line}-{loc}-t{take}.wav"), a, model.sr)
            print("chatterbox", line, loc, flush=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    {"kokoro": kokoro, "chatterbox": chatterbox}[sys.argv[1]]()
