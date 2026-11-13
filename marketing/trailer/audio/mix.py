"""The final sound of each cut: Kakak's voice, the music, the effects and the garden's air, mixed and levelled.

For each cut (60, 15) and language (en, id):
  1. lays Kakak's lines at their cue times (below) and checks none overlaps the next;
  2. turns the music down a little under her voice, and back up when she stops;
  3. brings the whole to -14 LUFS with peaks under -1 dBTP, the level Reels, TikTok and Shorts play at;
  4. writes public/audio/mix-<cut>-<lang>.wav for the film, and src/film/vo-data.json: when each line
     is spoken and how loud she is in every frame (the captions and her mark follow it).

  python audio/mix.py                         every cut, the film's voice and music
  python audio/mix.py --voice kakak-b --music strings
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "music"))
from dsp import SR, bandpass, db, highpass, lowpass, pan, reverb, soft_limit

FPS = 30
# When each line starts, in seconds. One plan for both languages: every slot is long enough for the longer one.
CUES = {
    "60": {"L1": 5.15, "L2": 7.7, "L3": 11.2, "L4": 15.25, "L5": 25.05, "L6": 28.15, "L7a": 31.7, "L7b": 35.3, "L8": 39.4, "L9": 44.05, "L10": 48.3, "L11": 55.75},
    "15": {"S1": 3.15, "S2": 7.1, "S3": 11.85},
}


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def read(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    assert sr == SR, path
    return x


def compress(x, threshold_db=-24.0, ratio=2.6, attack=0.006, release=0.14, makeup_db=3.0):
    """Evens out her voice: the loud words a little lower, so every word is easy to hear on a phone."""
    env = np.zeros(len(x))
    level = 0.0
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    for i, v in enumerate(np.abs(x)):
        level = a * level + (1 - a) * v if v > level else r * level + (1 - r) * v
        env[i] = level
    over = np.maximum(0, 20 * np.log10(env + 1e-9) - threshold_db)
    return x * 10 ** ((-over * (1 - 1 / ratio) + makeup_db) / 20)


def follow(x, attack=0.07, release=0.42):
    """How present her voice is, 0–1, rising fast and letting go slowly."""
    win = int(0.03 * SR)
    level = np.sqrt(np.convolve(x**2, np.ones(win) / win, "same"))
    ref = np.percentile(level[level > 1e-4], 80) if np.any(level > 1e-4) else 1.0
    target = np.clip(level / ref, 0, 1)
    out = np.zeros(len(x))
    v = 0.0
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    for i, t in enumerate(target):
        v = a * v + (1 - a) * t if t > v else r * v + (1 - r) * t
        out[i] = v
    return out


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBTP), measured by ffmpeg's loudnorm."""
    out = subprocess.run(["npx", "remotion", "ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"], cwd=ROOT, capture_output=True, text=True).stderr
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S)
    j = json.loads(m.group(0))
    return float(j["input_i"]), float(j["input_tp"]), float(j["input_lra"])


def mix(cut, locale, voice, music_style):
    length = 60 if cut == "60" else 15
    n = length * SR
    music = read(os.path.join(ROOT, "audio", "out", f"music-{cut}-{music_style}.wav"))[:n]
    sfx = read(os.path.join(ROOT, "audio", "out", f"sfx-{cut}.wav"))[:n]
    air = read(os.path.join(ROOT, "audio", "out", f"air-{cut}.wav"))[:n]

    vo = np.zeros(n)
    cues = []
    order = sorted(CUES[cut].items(), key=lambda kv: kv[1])
    for i, (key, start) in enumerate(order):
        line = read(os.path.join(ROOT, "audio", "out", "vo", voice, locale, f"{key}.wav"))[:, 0]
        a = int(start * SR)
        end = start + len(line) / SR
        limit = order[i + 1][1] - 0.2 if i + 1 < len(order) else length - 0.35
        if end > limit:
            raise SystemExit(f"{cut}-{locale}: {key} ends at {end:.2f} s, past {limit:.2f} s. Move its cue or shorten the line.")
        vo[a : a + len(line)] += line[: n - a]
        cues.append({"id": key, "from": round(start, 3), "to": round(end, 3)})

    # Her voice: clear of rumble, a little presence, evened out, in a small warm room.
    v = highpass(vo, 85)
    v = v + 0.22 * bandpass(v, 2400, 5600)
    v = compress(v)
    presence = follow(v)
    v2 = reverb(pan(v, 0.0), 0.55, 0.05)

    # The music steps back under her (about 7 dB), the effects a little.
    duck = 1 - 0.56 * presence
    bed = music * duck[:, None] * db(-2.5) + sfx * (1 - 0.2 * presence)[:, None] * db(-3.0) + air
    out = soft_limit(v2 * db(2.5) + bed, 0.97, 0.75)

    os.makedirs(os.path.join(ROOT, "public", "audio"), exist_ok=True)
    path = os.path.join(ROOT, "public", "audio", f"mix-{cut}-{locale}.wav")
    sf.write(path, out.astype("float32"), SR, subtype="PCM_24")
    i_lufs, tp, lra = loudness(path)
    gain = -14.0 - i_lufs
    out = soft_limit(out * db(gain), 0.885, 0.7)  # 0.885 = -1.06 dBFS: room for the true peak
    sf.write(path, out.astype("float32"), SR, subtype="PCM_24")
    i2, tp2, lra2 = loudness(path)
    print(f"mix-{cut}-{locale}: {i_lufs:.1f} LUFS → {i2:.1f} LUFS, true peak {tp2:.1f} dBTP, range {lra2:.1f} LU", flush=True)

    # For the picture: how loud she is in each frame.
    per = SR // FPS
    env = [round(float(np.clip(presence[f * per : (f + 1) * per].mean() * 1.25, 0, 1)), 3) for f in range(length * FPS)]
    return {"cues": cues, "env": env}, (i2, tp2, lra2)


if __name__ == "__main__":
    voice = arg("--voice", "kakak-a")
    style = arg("--music", "felt")
    data, report = {}, {}
    for cut in ("60", "15"):
        for locale in ("en", "id"):
            data[f"{cut}-{locale}"], report[f"{cut}-{locale}"] = mix(cut, locale, voice, style)
    with open(os.path.join(ROOT, "src", "film", "vo-data.json"), "w") as f:
        f.write("{\n" + ",\n".join(f'  "{k}": {json.dumps(v, separators=(",", ":"))}' for k, v in data.items()) + "\n}\n")
    json.dump({"voice": voice, "music": style, "loudness": {k: {"lufs": v[0], "true_peak_dbtp": v[1], "range_lu": v[2]} for k, v in report.items()}}, open(os.path.join(ROOT, "audio", "out", "mix-report.json"), "w"), indent=1)
    print("wrote src/film/vo-data.json")
