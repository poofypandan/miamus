"""Writes the ElevenLabs jobs (see el.py) and turns what comes back into the mix's voice files.
Needs no key: it only reads and writes files.

  python audio/eleven/jobs.py search                    queue the Voice Library searches
  python audio/eleven/jobs.py shortlist                 rank what the searches found
  python audio/eleven/jobs.py audition slug=VOICE_ID …  queue the audition clips for each voice
  python audio/eleven/jobs.py final slug=VOICE_ID [--takes 3] [--keys L1,L3] [--tag retake1]
                                                        queue every film line, both languages
  python audio/eleven/jobs.py place slug [--pick picks.json]
                                                        48 kHz voice files for the mix:
                                                        audio/out/vo/eleven-<slug>/<locale>/<key>.wav
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "voice"))
import lines  # noqa: E402

QUEUE = os.path.join(ROOT, "audio", "eleven", "queue")
OUT = os.path.join(ROOT, "audio", "out", "eleven")

# What ElevenLabs is given to read. The words on screen come from src/film/copy.ts, so a spelling here
# only changes how a word is said. Tested with Lyly (15 Nov): plain "Miamus" is heard as "Maya Moose",
# IPA in slashes as "My Amos"; "Mee-AH-moos" is heard as "Miamus" with the stress on AH. "Kakak" as
# written gives the Indonesian final stop (heard "Kaka"), as v4 did. Indonesian needs no respelling.
SAY_EN = {"Kakak": "Kakak", "Miamus": "Mee-AH-moos", "A.I.": "AI"}
SAY_ID = {}

# The audition: three film lines (two of them two sentences long) and one of the owner's audition lines.
AUDITION = [("L3", ["L3"]), ("L7", ["L7a", "L7b"]), ("L89", ["L8", "L9"])]


def strip_markup(s):
    return re.sub(r"\[([^\]]+)\]\(/[^)]*/\)", r"\1", s)


def say(text, table):
    for k, v in table.items():
        text = text.replace(k, v)
    return text


def text_for(locale, key):
    if locale == "en":
        return say(strip_markup(lines.EN[key]), SAY_EN)
    return say(lines.ID_TEXT[key], SAY_ID)


def audition_text(locale, keys):
    return " ".join(text_for(locale, k) for k in keys)


def queue(name, job):
    os.makedirs(QUEUE, exist_ok=True)
    path = os.path.join(QUEUE, f"{name}.json")
    if os.path.exists(path):
        raise SystemExit(f"{path} exists already; pick another name")
    json.dump(job, open(path, "w"), indent=1, ensure_ascii=False)
    n = sum(len(i["text"]) for i in job.get("items", []))
    print(f"queued {os.path.relpath(path, ROOT)}" + (f": {len(job['items'])} clips, {n} characters" if n else ""))


def cmd_search():
    queue("01-my-voices", {"kind": "voices"})
    queue("02-search-id-conv", {"kind": "search", "name": "id-female-conversational", "max": 300,
                                "params": {"gender": "female", "language": "id", "use_cases": ["conversational"], "sort": "usage_character_count_1y"}})
    queue("03-search-id-all", {"kind": "search", "name": "id-female-all", "max": 400,
                               "params": {"gender": "female", "language": "id", "sort": "usage_character_count_1y"}})
    queue("04-search-en-conv", {"kind": "search", "name": "en-female-conversational", "max": 400,
                                "params": {"gender": "female", "language": "en", "use_cases": ["conversational"], "sort": "usage_character_count_1y"}})


def verified(v):
    return sorted({x.get("language") for x in v.get("verified_languages") or [] if x.get("language")})


def v4_ok(v):
    return any(str(x.get("model_id", "")).startswith("eleven_v4") for x in v.get("verified_languages") or [])


def cmd_shortlist():
    seen = {}
    for f in sorted(os.listdir(os.path.join(OUT, "library"))):
        if not f.endswith(".json") or f == "my-voices.json":
            continue
        for v in json.load(open(os.path.join(OUT, "library", f)))["voices"]:
            seen.setdefault(v["voice_id"], v)
    rows = []
    for v in seen.values():
        langs = verified(v)
        if v.get("age") not in ("young", "middle_aged"):
            continue
        if v.get("use_case") in ("advertisement", "news", "narrative_story", "characters_animation"):
            continue
        if "id" not in langs and v.get("language") != "id":
            continue
        rows.append(v)
    rows.sort(key=lambda v: -(v.get("usage_character_count_1y") or 0))
    keep = ["voice_id", "public_owner_id", "name", "language", "accent", "age", "use_case", "descriptive", "category",
            "usage_character_count_1y", "cloned_by_count", "notice_period", "free_users_allowed", "rate", "fiat_rate",
            "live_moderation_enabled", "description"]
    slim = [dict({k: v.get(k) for k in keep}, verified=verified(v), v4=v4_ok(v),
                 preview=next((x.get("preview_url") for x in v.get("verified_languages") or [] if x.get("language") == "id"), v.get("preview_url")))
            for v in rows]
    path = os.path.join(OUT, "library", "shortlist.json")
    json.dump(slim, open(path, "w"), indent=1, ensure_ascii=False)
    for v in slim[:60]:
        print(f"{v['voice_id']}  {v['name'][:44]:44}  {v['language']}/{v['accent']}  {v['age']}  {v['use_case']}  {v['descriptive']}  "
              f"use1y={v['usage_character_count_1y']}  langs={','.join(v['verified'])}  v4={v['v4']}  notice={v['notice_period']}")
    print(f"{len(slim)} candidates → {os.path.relpath(path, ROOT)}")


def pairs(args):
    out = []
    for a in args:
        if "=" in a and not a.startswith("--"):
            slug, vid = a.split("=", 1)
            out.append((slug, vid))
    return out


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def cmd_audition():
    items = []
    for slug, vid in pairs(sys.argv[2:]):
        for locale in ("en", "id"):
            for name, keys in AUDITION:
                items.append({"voice_id": vid, "language_code": locale, "seed": 7, "text": audition_text(locale, keys),
                              "out": f"audio/out/eleven/audition/{slug}/{locale}/{name}"})
            a2 = strip_markup(lines.AUDITION_EN[1]) if locale == "en" else lines.AUDITION_ID_TEXT[1]
            items.append({"voice_id": vid, "language_code": locale, "seed": 7, "text": a2,
                          "out": f"audio/out/eleven/audition/{slug}/{locale}/A2"})
    queue(opt("--name", "10-audition"), {"kind": "tts", "items": items})


def cmd_final():
    (slug, vid), = pairs(sys.argv[2:])
    takes = int(opt("--takes", "3"))
    tag = opt("--tag", "final")
    only = opt("--keys")
    settings = json.loads(opt("--settings", "{}"))
    items = []
    for locale in ("en", "id"):
        keys = list(lines.EN)
        for i, key in enumerate(keys):
            if only and key not in only.split(","):
                continue
            # The lines either side, so each sentence is said as part of the same speech.
            group = [k for k in keys if k[0] == key[0]]
            j = group.index(key)
            prev = text_for(locale, group[j - 1]) if j > 0 else None
            nxt = text_for(locale, group[j + 1]) if j + 1 < len(group) else None
            for t in range(takes):
                items.append({"voice_id": vid, "language_code": locale, "seed": 11 + 101 * t, "text": text_for(locale, key),
                              "previous_text": prev, "next_text": nxt, "settings": settings,
                              "out": f"audio/out/eleven/{tag}/{slug}/{locale}/{key}.t{t + 1}"})
    queue(opt("--name", f"20-{tag}-{slug}"), {"kind": "tts", "items": items})


def to_wav48(src, dst):
    """Decode (MP3 or WAV) to 48 kHz mono 32-bit float, with Remotion's bundled ffmpeg."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "48000",
                    "-c:a", "pcm_s24le", dst], cwd=ROOT, check=True)


def tidy48(path):
    """As speak.py does for Kokoro: trim the silence at both ends, remove rumble, one common level."""
    import numpy as np
    import soundfile as sf
    from scipy.signal import butter, sosfilt
    a, sr = sf.read(path, dtype="float64")
    a = sosfilt(butter(2, 70, "high", fs=sr, output="sos"), a)
    win = int(0.01 * sr)
    env = np.sqrt(np.convolve(a**2, np.ones(win) / win, "same"))
    loud = np.where(env > 0.01 * env.max())[0]
    if len(loud):
        a = a[max(0, loud[0] - int(0.03 * sr)): min(len(a), loud[-1] + int(0.15 * sr))]
    n = int(0.008 * sr)
    a[:n] *= np.linspace(0, 1, n)
    a[-n:] *= np.linspace(1, 0, n)
    rms = np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2))
    sf.write(path, (a * (0.1 / rms)).astype("float32"), sr)
    return len(a) / sr


def cmd_place():
    slug = sys.argv[2]
    tag = opt("--tag", "final")
    picks = json.load(open(opt("--pick"))) if opt("--pick") else {}
    durations = {}
    for locale in ("en", "id"):
        for key in lines.EN:
            take = picks.get(f"{locale}/{key}", "t1")
            src_dir = os.path.join(OUT, picks.get(f"{locale}/{key}@tag", tag), slug, locale)
            src = next((os.path.join(src_dir, f) for f in sorted(os.listdir(src_dir)) if f.startswith(f"{key}.{take}.")), None)
            if not src:
                raise SystemExit(f"missing {locale}/{key} {take}")
            dst = os.path.join(ROOT, "audio", "out", "vo", f"eleven-{slug}", locale, f"{key}.wav")
            to_wav48(src, dst)
            durations.setdefault(locale, {})[key] = round(tidy48(dst), 3)
    json.dump(durations, open(os.path.join(ROOT, "audio", "out", "vo", f"eleven-{slug}", "durations-film.json"), "w"), indent=1)
    for locale, d in durations.items():
        print(locale, " ".join(f"{k}={v:.2f}" for k, v in d.items()))


if __name__ == "__main__":
    {"search": cmd_search, "shortlist": cmd_shortlist, "audition": cmd_audition, "final": cmd_final, "place": cmd_place}[sys.argv[1]]()
