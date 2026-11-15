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
from scipy.signal import resample_poly

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "music"))
from dsp import SR, bandpass, db, highpass, lowpass, pan, reverb, soft_limit

FPS = 30
# When each line starts, in seconds. One plan for both languages: every slot is long enough for the longer one.
CUES = {
    "60": {"L1": 5.15, "L2": 7.95, "L3": 11.2, "L4": 15.25, "L4b": 19.55, "L5": 25.05, "L6": 28.15, "L7a": 31.7, "L7b": 35.3, "L8": 39.4, "L9": 44.05, "L10": 48.3, "L11": 55.75},
    "15": {"S1": 3.15, "S2": 7.3, "S3": 11.85},
}
# v5 (ElevenLabs voice): L2 and S2 start 0.25 s and 0.2 s later than in v4, as the new L1 and S1 run a
# little longer. One line differs by language: the Indonesian "Miamus. Lebih banyak waktu untuk keluarga."
# runs 3.2 s, so in the 15-second cut it starts 0.4 s earlier, still before Kakak's mark appears.
LOCALE_CUES = {"id": {"15": {"S3": 11.45}}}

# v6 (Fable's notes, 15 Nov): the girl (G) and Mama (M) speak too, each from her own voice folder.
#   Hook: the girl's "Mama, look!" at 0.2 s; Mama, distracted, after the first questions land; the
#   girl's small "Mama…?" just before the slam. End: the ping is 0.8 s earlier, so Kakak's "That one's
#   yours. Go play." comes straight after L9 while the notification is on screen; the girl calls again as
#   the phone falls away; Mama answers with her hand up to her eyes, then a held moment before the crane.
CUES["60"].update({"G1": 0.2, "M1": 1.75, "G3": 3.75, "L9": 43.0, "L10": 44.85, "G2": 46.95, "M2": 50.7})
CUES["15"].update({"G1": 0.1, "M1": 1.1, "G2": 10.1})
LOCALE_CUES["id"]["60"] = {"L10": 45.3, "G2": 48.27}
LOCALE_CUES["id"]["15"]["G2"] = 9.8
# Words shown but not spoken: in the 15-second cut Mama's answer is a caption only (there is no room to say it).
CAPTION_ONLY = {"15": {"M2": (11.0, 12.4)}}


def speaker(key):
    return "girl" if key.startswith("G") else "mama" if key.startswith("M") else "kakak"


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


def mix(cut, locale, voices, music_style):
    length = 60 if cut == "60" else 15
    n = length * SR
    music = read(os.path.join(ROOT, "audio", "out", f"music-{cut}-{music_style}.wav"))[:n]
    sfx = read(os.path.join(ROOT, "audio", "out", f"sfx-{cut}.wav"))[:n]
    air = read(os.path.join(ROOT, "audio", "out", f"air-{cut}.wav"))[:n]

    tracks = {who: np.zeros(n) for who in ("kakak", "girl", "mama")}
    cues = []
    plan = dict(CUES[cut], **LOCALE_CUES.get(locale, {}).get(cut, {}))
    if not voices.get("girl"):
        plan = {k: t for k, t in plan.items() if speaker(k) == "kakak"}
    order = sorted(plan.items(), key=lambda kv: kv[1])
    for i, (key, start) in enumerate(order):
        who = speaker(key)
        line = read(os.path.join(ROOT, "audio", "out", "vo", voices[who], locale, f"{key}.wav"))[:, 0]
        a = int(start * SR)
        end = start + len(line) / SR
        # Each voice keeps clear of her own next line; different people may overlap a little, as people do.
        nxt = [t for k, t in order[i + 1 :] if speaker(k) == who]
        limit = nxt[0] - 0.2 if nxt else length - 0.35
        if end > limit:
            raise SystemExit(f"{cut}-{locale}: {key} ends at {end:.2f} s, past {limit:.2f} s. Move its cue or shorten the line.")
        other = [t for k, t in order[i + 1 :] if speaker(k) != who]
        if other and end - other[0] > 0.45:
            raise SystemExit(f"{cut}-{locale}: {key} runs {end - other[0]:.2f} s into the next speaker.")
        tracks[who][a : a + len(line)] += line[: n - a]
        cues.append({"id": key, "from": round(start, 3), "to": round(end, 3)})
    for key, (start, end) in CAPTION_ONLY.get(cut, {}).items() if voices.get("girl") else []:
        cues.append({"id": key, "from": start, "to": end, "silent": True})
    cues.sort(key=lambda c: c["from"])

    def chain(x):
        x = highpass(x, 85)
        x = x + 0.22 * bandpass(x, 2400, 5600)
        return compress(x)

    # Kakak: clear of rumble, a little presence, evened out, in a small warm room.
    v = chain(tracks["kakak"])
    presence_kakak = follow(v)
    v2 = reverb(pan(v, 0.0), 0.55, 0.05)
    # The girl and Mama are in the garden: a little more air around them. Mama in the hook is off screen
    # (we are behind her phone), so she is a touch softer and further away until she walks out at the end.
    people = np.zeros(n)
    if voices.get("girl"):
        g = chain(tracks["girl"])
        m = chain(tracks["mama"])
        far = np.zeros(n)
        far[: int(6 * SR)] = 1
        m = m * (1 - far) + 0.75 * lowpass(m, 5200) * far
        people = g + m
        v2 = v2 + reverb(pan(g, -0.08), 0.75, 0.12) + reverb(pan(m, 0.06), 0.7, 0.1)
    presence = follow(v + people)

    # The music steps back under her (about 10 dB, so she stays clear on a phone's speaker), the effects a little.
    duck = 1 - 0.7 * presence
    bed = music * duck[:, None] * db(-3.5) + sfx * (1 - 0.25 * presence)[:, None] * db(-3.0) + air
    out = soft_limit(v2 * db(4.0) + bed, 0.97, 0.75)

    os.makedirs(os.path.join(ROOT, "public", "audio"), exist_ok=True)
    path = os.path.join(ROOT, "public", "audio", f"mix-{cut}-{locale}.wav")
    sf.write(path, out.astype("float32"), SR, subtype="PCM_24")
    i_lufs, tp, lra = loudness(path)
    gain = -14.0 - i_lufs
    # Limit on a 4× finer grid, where the peaks between samples show, then trim if any is still over -1 dBTP.
    # (The ceiling is -1.8 dB here because AAC encoding lifts peaks by a few tenths; the MP4s then stay under -1 dBTP.)
    fine = soft_limit(resample_poly(out * db(gain), 4, 1, axis=0), db(-1.8), db(-1.8) * 0.8)
    out = resample_poly(fine, 1, 4, axis=0)
    sf.write(path, out.astype("float32"), SR, subtype="PCM_24")
    i2, tp2, lra2 = loudness(path)
    if tp2 > -1.5:
        out = out * db(-1.5 - tp2 - 0.05)
        sf.write(path, out.astype("float32"), SR, subtype="PCM_24")
        i2, tp2, lra2 = loudness(path)
    print(f"mix-{cut}-{locale}: {i_lufs:.1f} LUFS → {i2:.1f} LUFS, true peak {tp2:.1f} dBTP, range {lra2:.1f} LU", flush=True)

    # For the picture: how loud she is in each frame.
    per = SR // FPS
    env = [round(float(np.clip(presence_kakak[f * per : (f + 1) * per].mean() * 1.25, 0, 1)), 3) for f in range(length * FPS)]
    return {"cues": cues, "env": env}, (i2, tp2, lra2)


if __name__ == "__main__":
    voice = arg("--voice", "kakak-a")
    voices = {"kakak": voice, "girl": arg("--girl", None), "mama": arg("--mama", None)}
    style = arg("--music", "felt")
    data, report = {}, {}
    for cut in ("60", "15"):
        for locale in ("en", "id"):
            data[f"{cut}-{locale}"], report[f"{cut}-{locale}"] = mix(cut, locale, voices, style)
    with open(os.path.join(ROOT, "src", "film", "vo-data.json"), "w") as f:
        f.write("{\n" + ",\n".join(f'  "{k}": {json.dumps(v, separators=(",", ":"))}' for k, v in data.items()) + "\n}\n")
    json.dump({"voice": voice, "girl": voices["girl"], "mama": voices["mama"], "music": style, "loudness": {k: {"lufs": v[0], "true_peak_dbtp": v[1], "range_lu": v[2]} for k, v in report.items()}}, open(os.path.join(ROOT, "audio", "out", "mix-report.json"), "w"), indent=1)
    print("wrote src/film/vo-data.json")
