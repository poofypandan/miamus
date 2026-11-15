"""What a listener would hear in each ElevenLabs clip: the language Whisper detects, its transcript,
how close that is to the line as written, the length, the pace and any clipping.

  python audio/eleven/check.py audition velora aita …     the audition clips of these voices
  python audio/eleven/check.py final <slug> [tag]         every take of the final lines
Writes audio/out/eleven/<what>/check-<slug>.json.
"""
import difflib
import json
import os
import re
import sys
import warnings

warnings.filterwarnings("ignore")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "voice"))
sys.path.insert(0, os.path.join(ROOT, "audio", "eleven"))
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import asr  # noqa: E402
import jobs  # noqa: E402
import lines  # noqa: E402


def norm(t):
    t = t.lower().replace("a.i.", "ai").replace("hp", "h p")
    return re.sub(r"[^a-z0-9 ]+", " ", t).split()


def similarity(heard, written):
    return round(difflib.SequenceMatcher(None, norm(heard), norm(written)).ratio(), 3)


def measure(path, locale, written):
    a, sr = sf.read(path, dtype="float64", always_2d=True)
    a = a.mean(axis=1)
    detected_text, detected = asr.hear(path, None)
    forced_text, _ = asr.hear(path, locale)
    win = int(0.02 * sr)
    env = np.sqrt(np.convolve(a**2, np.ones(win) / win, "same"))
    voiced = np.where(env > 0.05 * env.max())[0]
    speech = (voiced[-1] - voiced[0]) / sr if len(voiced) else 0
    return {"file": os.path.relpath(path, ROOT), "detected_language": detected, "heard": forced_text, "heard_auto": detected_text,
            "match": similarity(forced_text, written), "seconds": round(len(a) / sr, 2), "speech_seconds": round(speech, 2),
            "chars_per_s": round(len(written) / speech, 1) if speech else None, "peak": round(float(np.abs(a).max()), 3),
            "lead_s": round(voiced[0] / sr, 2) if len(voiced) else None, "tail_s": round((len(a) - voiced[-1]) / sr, 2) if len(voiced) else None}


def audition(slugs):
    for slug in slugs:
        rows = []
        for locale in ("en", "id"):
            for name, keys in jobs.AUDITION + [("A2", None)]:
                written = jobs.audition_text(locale, keys) if keys else (jobs.strip_markup(lines.AUDITION_EN[1]) if locale == "en" else lines.AUDITION_ID_TEXT[1])
                d = os.path.join(ROOT, "audio", "out", "eleven", "audition", slug, locale)
                f = next(x for x in os.listdir(d) if x.startswith(name + "."))
                r = measure(os.path.join(d, f), locale, written)
                r.update(locale=locale, clip=name)
                rows.append(r)
                print(f"{slug:10s} {locale} {name:4s} lang={r['detected_language']} match={r['match']:.2f} {r['speech_seconds']:5.2f}s {r['chars_per_s']} c/s peak={r['peak']}  {r['heard']}", flush=True)
        json.dump(rows, open(os.path.join(ROOT, "audio", "out", "eleven", "audition", f"check-{slug}.json"), "w"), indent=1, ensure_ascii=False)


# Lines that are not Kakak's (v6: Mama).
OTHER = {("en", "M1"): "In a minute, sweetie…", ("en", "M2"): "I'm looking, sweetie.", ("id", "M1"): "Sebentar ya, sayang…", ("id", "M2"): "Iya, Mama lihat, sayang."}


def final(slug, tag="final"):
    rows = []
    for locale in ("en", "id"):
        d = os.path.join(ROOT, "audio", "out", "eleven", tag, slug, locale)
        for f in sorted(os.listdir(d)):
            key, take = f.split(".")[:2]
            r = measure(os.path.join(d, f), locale, OTHER.get((locale, key)) or jobs.text_for(locale, key))
            r.update(locale=locale, key=key, take=take)
            rows.append(r)
            print(f"{locale} {key:4s} {take} lang={r['detected_language']} match={r['match']:.2f} {r['speech_seconds']:5.2f}s peak={r['peak']}  {r['heard']}", flush=True)
    json.dump(rows, open(os.path.join(ROOT, "audio", "out", "eleven", tag, f"check-{slug}.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    if sys.argv[1] == "audition":
        audition(sys.argv[2:])
    else:
        final(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "final")
