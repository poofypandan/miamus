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

# v6 (Fable's notes, 15 Nov): Mama (M) speaks too, from her own voice folder (--mama).
#   Hook: Mama, distracted, "In a minute, sweetie…" as the first questions leave her phone. End: the ping
#   is 0.8 s earlier, so Kakak's "That one's yours. Go play." comes straight after L9 while the notification
#   is on screen; Mama answers as her hand comes up to shade her eyes, then a held moment before the crane.
# v6 (Fable's pacing): every line re-timed onto the new picture. Tell 15–26.4 s, staff 26.4–38, quiet 38–47.
# v12 (62 s): each line on its card, the cards a little quicker; the climax on its bars: Kakak 49.0 (where the score
# opens), Mama 51.4; the end line 55.3. One set of cues for both languages.
# v13: 60 s on the composed score; "Tell me once." (L4) is gone (it repeated "Just tell me what you need").
CUES["60"] = {"M1": 2.1, "L1": 5.15, "L2": 7.95, "L3": 11.2, "T1": 16.7, "L4b": 21.2, "L5": 25.6, "L6": 28.5, "L7a": 30.15,
              "L7b": 32.2, "L8": 34.45, "L9": 37.25, "L10": 47.0, "M2": 49.4, "L11": 53.3}
CUES["15"] = {"M1": 1.6, "S1": 3.15, "S2": 7.3, "S3": 11.85}
LOCALE_CUES["id"]["60"] = {}
LOCALE_CUES["id"]["15"] = {"S3": 11.5}
# The girl does not speak (Fable, 15 Nov): her "Mama, look!" is the score's bell and her handwriting.
# v14 (owner, 16 Nov): the 15-second cut's two Kakak lines become one, "Hi, I'm Kakak. Tell me once, and everyone at
# home knows what to do." / "Halo, ini Kakak. Bilang sekali, dan semua orang di rumah tahu harus apa." (one Lyly take,
# S1 in eleven-lyly-v14; her name and the AI tag are on screen instead). It is said in one breath, so it is not cut
# apart: only its caption is split at the comma's breath into two plates (S1, S2), each the size a plate holds.
CAPTION_SPLIT = {("15", "en"): {"S1": ("S2", 2.57)}, ("15", "id"): {"S1": ("S2", 2.60)}}
# In the 15-second Indonesian cut there is no room to say Mama's answer as well as the end line, so it is a caption.
DROP = {}
# v9: in the 15-second cut Mama's answer is the hand at 11.0, with her words as a caption (the end line needs the time).
CAPTION_ONLY = {("15", "en"): {"M2": (11.0, 12.4)}, ("15", "id"): {"M2": (11.0, 12.4)}}
# The 15-second end line, a touch quicker (pitch kept), so Mama's answer fits before it.
TEMPO = {("15", "id", "S3"): 1.03}
# v14 (owner, 16 Nov): no Mama voice in the 15-second cuts: neither "In a minute, sweetie…" in the hook nor her answer
# (voice or caption); her picture beats stay. Kakak's one line at 3.15 s; the end line a little earlier, into the room
# her answer's caption had (EN 11.85 → 11.5 s; ID 11.5 → 11.3 s, at its natural pace now: no tempo change needed).
CUES["15"] = {"S1": 3.15, "S3": 11.5}
LOCALE_CUES["id"]["15"] = {"S3": 11.3}
CAPTION_ONLY = {}
TEMPO = {}
# Where the finished mixes go. The film reads public/audio; the lo-fi listening page (audio/music/page_lofi.py) points
# these elsewhere so its trial mixes never replace the film's.
OUT_DIR = os.path.join(ROOT, "public", "audio")
OUT_NAME = "mix-{cut}-{locale}.wav"
SFX_NAME = "sfx-{cut}.wav"  # sfx-{cut}-C.wav for scores in C major (audio/sfx.py --key C)
# v13-lofi: under a full groove the brand name that opens the end line ("Miamus. More time…") was sometimes misheard,
# so the music dips this many dB under its first 1.3 s (0 for the lullaby, which is quiet there already).
BRAND_DIP_DB = 0.0
BRAND_LINES = {"L11": 1.3, "S3": 1.3}


def stretched(path, factor):
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        out = f.name
    subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path, "-af", f"atempo={factor}", "-c:a", "pcm_s24le", out], cwd=ROOT, check=True)
    x = read(out)
    os.unlink(out)
    return x


def speaker(key):
    # T: what Mama says to Kakak (v10), in her voice; shown as the words in the typing box, not as a caption.
    return "girl" if key.startswith("G") else "mama" if key.startswith(("M", "T")) else "kakak"


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
    # v11: the long film runs 68 s (its cue is still "60"); the length comes from the film's own timings.
    length = int(json.load(open(os.path.join(ROOT, "audio", "out", "cues.json")))[cut]["length"])
    n = length * SR
    music = read(os.path.join(ROOT, "audio", "out", f"music-{cut}-{music_style}.wav"))[:n]
    sfx = read(os.path.join(ROOT, "audio", "out", SFX_NAME.format(cut=cut)))[:n]
    air = read(os.path.join(ROOT, "audio", "out", f"air-{cut}.wav"))[:n]

    tracks = {who: np.zeros(n) for who in ("kakak", "girl", "mama")}
    cues = []
    plan = dict(CUES[cut], **LOCALE_CUES.get(locale, {}).get(cut, {}))
    plan = {k: t for k, t in plan.items() if voices.get(speaker(k)) and k not in DROP.get((cut, locale), [])}
    order = sorted(plan.items(), key=lambda kv: kv[1])
    for i, (key, start) in enumerate(order):
        who = speaker(key)
        src = os.path.join(ROOT, "audio", "out", "vo", voices[who], locale, f"{key}.wav")
        tempo = TEMPO.get((cut, locale, key)) if voices.get("mama") else None
        line = (stretched(src, tempo) if tempo else read(src))[:, 0]
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
        split = CAPTION_SPLIT.get((cut, locale), {}).get(key) if voices["kakak"].endswith("v14") else None
        if split:
            second, off = split
            cues.append({"id": key, "from": round(start, 3), "to": round(start + off, 3)})
            cues.append({"id": second, "from": round(start + off, 3), "to": round(end, 3)})
        else:
            cues.append({"id": key, "from": round(start, 3), "to": round(end, 3)})
    for key, (start, end) in CAPTION_ONLY.get((cut, locale), {}).items() if voices.get("mama") else []:
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
    if voices.get("mama") or voices.get("girl"):
        g = chain(tracks["girl"])
        m = chain(tracks["mama"])
        far = np.zeros(n)
        far[: int(6 * SR)] = 1
        m = m * (1 - far) + 0.75 * lowpass(m, 5200) * far
        people = g + m
        # v11: Mama a little further away and more natural (a touch more room); Kakak stays close and clean.
        v2 = v2 + reverb(pan(g, -0.08), 0.75, 0.12) + reverb(pan(m * db(-0.8), 0.06), 0.9, 0.17)
    presence = follow(v + people)

    # The music steps back under her (about 10 dB, so she stays clear on a phone's speaker), the effects a little.
    duck = 1 - 0.7 * presence
    if BRAND_DIP_DB:
        t = np.arange(n) / SR
        dip = np.zeros(n)
        for c in cues:
            if c["id"] in BRAND_LINES and not c.get("silent"):
                a, b = c["from"] - 0.1, c["from"] + BRAND_LINES[c["id"]]
                dip = np.maximum(dip, np.clip(np.minimum((t - a) / 0.12, (b - t) / 0.25), 0, 1))
        duck = duck * db(-BRAND_DIP_DB * dip)
    bed = music * duck[:, None] * db(-3.5) + sfx * (1 - 0.25 * presence)[:, None] * db(-3.0) + air
    out = soft_limit(v2 * db(4.0) + bed, 0.97, 0.75)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, OUT_NAME.format(cut=cut, locale=locale, music=music_style))
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
    # v13-lofi: `--sfx C` uses the effects with the bell in C (audio/sfx.py --key C); `--brand-dip 5` (see BRAND_DIP_DB).
    if arg("--sfx", None) == "C":
        SFX_NAME = "sfx-{cut}-C.wav"
    BRAND_DIP_DB = float(arg("--brand-dip", "0"))
    data, report = {}, {}
    for cut in ("60", "15"):
        for locale in ("en", "id"):
            data[f"{cut}-{locale}"], report[f"{cut}-{locale}"] = mix(cut, locale, voices, style)
    with open(os.path.join(ROOT, "src", "film", "vo-data.json"), "w") as f:
        f.write("{\n" + ",\n".join(f'  "{k}": {json.dumps(v, separators=(",", ":"))}' for k, v in data.items()) + "\n}\n")
    json.dump({"voice": voice, "girl": voices["girl"], "mama": voices["mama"], "music": style, "loudness": {k: {"lufs": v[0], "true_peak_dbtp": v[1], "range_lu": v[2]} for k, v in report.items()}}, open(os.path.join(ROOT, "audio", "out", "mix-report.json"), "w"), indent=1)
    print("wrote src/film/vo-data.json")
