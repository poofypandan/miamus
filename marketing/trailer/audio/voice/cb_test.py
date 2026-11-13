"""First test of Chatterbox Multilingual (MIT): Kakak's lines in English and in Malay-as-Indonesian."""
import os, sys, time, warnings
warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.environ.setdefault("HF_HOME", os.path.join(ROOT, ".tools", "hf"))
import torch, soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

device = "mps" if torch.backends.mps.is_available() else "cpu"
t = time.time()
model = ChatterboxMultilingualTTS.from_pretrained(device=device)
print("loaded on", device, "in", round(time.time() - t, 1), "s; sr", model.sr, flush=True)
out = os.path.join(ROOT, "audio", "out", "test")
os.makedirs(out, exist_ok=True)
LINES = [
    ("cb_en_1", "en", "Hi. I'm Kakak, the AI helper inside Miamus."),
    ("cb_en_2", "en", "Tell me once, and everyone at home knows what to do."),
    ("cb_id_1", "ms", "Bilang sekali ke Kakak. Semua orang di rumah tahu harus apa."),
    ("cb_id_2", "ms", "Halo. Saya Kakak, asisten AI di Miamus."),
    ("cb_id_3", "ms", "Anda hanya dikabari kalau ada yang belum dikerjakan."),
]
for name, lang, text in LINES:
    for seed in (1, 2):
        torch.manual_seed(seed)
        t = time.time()
        wav = model.generate(text, language_id=lang, exaggeration=0.45, cfg_weight=0.5, temperature=0.7)
        a = wav.squeeze().cpu().numpy()
        sf.write(os.path.join(out, f"{name}_s{seed}.wav"), a, model.sr)
        print(name, seed, "dur", round(len(a) / model.sr, 2), "gen", round(time.time() - t, 1), flush=True)
