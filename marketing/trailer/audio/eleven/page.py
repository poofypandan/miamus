"""Builds the blind audition page: four ElevenLabs voices and the v4 Kokoro voice, under random letters.

  python audio/eleven/page.py <output.html> slug1 slug2 slug3 slug4

Each slug is a folder in audio/out/eleven/audition/ (from `jobs.py audition`). The fifth voice is
v4's Kokoro voice (kakak-a), saying the same lines, as an unlabelled control. Every clip is brought
to the same loudness so no voice wins by being louder. The letters are drawn at random; which letter
is which voice is written only to audio/out/eleven/audition/labels.json (git-ignored), never to the page.
"""
import base64
import html
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "eleven"))
sys.path.insert(0, os.path.join(ROOT, "audio", "voice"))
import jobs  # noqa: E402
import lines  # noqa: E402

AUD = os.path.join(ROOT, "audio", "out", "eleven", "audition")
CLIPS = [name for name, _ in jobs.AUDITION] + ["A2"]
GAP = 0.35  # between two sentences, in the control's joined clips


def ffmpeg(*args):
    subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], cwd=ROOT, check=True)


def load(path):
    """Any clip as 48 kHz mono float."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp = f.name
    ffmpeg("-i", path, "-ac", "1", "-ar", "48000", "-c:a", "pcm_s24le", tmp)
    a, _ = sf.read(tmp, dtype="float64")
    os.unlink(tmp)
    return a


def control(locale, name):
    """The Kokoro voice's version of an audition clip: its film lines joined, or its own A2."""
    base = os.path.join(ROOT, "audio", "out", "vo", "kakak-a", locale)
    if name == "A2":
        return load(os.path.join(base, "A2.wav"))
    keys = dict(jobs.AUDITION)[name]
    parts = []
    for k in keys:
        parts += [load(os.path.join(base, f"{k}.wav")), np.zeros(int(GAP * 48000))]
    return np.concatenate(parts[:-1])


def eleven(slug, locale, name):
    d = os.path.join(AUD, slug, locale)
    f = next(x for x in os.listdir(d) if x.startswith(name + "."))
    return load(os.path.join(d, f))


def level(a):
    """Speech loudness: RMS over the voiced part, the same measure for every clip."""
    win = int(0.02 * 48000)
    env = np.sqrt(np.convolve(a**2, np.ones(win) / win, "same"))
    voiced = env > 0.1 * env.max()
    return np.sqrt(np.mean(a[voiced] ** 2))


def mp3(a):
    a = a * (0.08 / level(a))
    peak = np.max(np.abs(a))
    if peak > 0.89:
        a *= 0.89 / peak
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav = f.name
    out = wav[:-4] + ".mp3"
    sf.write(wav, a.astype("float32"), 48000)
    ffmpeg("-i", wav, "-codec:a", "libmp3lame", "-b:a", "80k", out)
    data = open(out, "rb").read()
    os.unlink(wav)
    os.unlink(out)
    return "data:audio/mpeg;base64," + base64.b64encode(data).decode()


def clip(src, label):
    return (f'<button class="clip" type="button" data-src="{src}" aria-label="{html.escape(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">'
            f'<path class="i-play" d="M8 5.5v13l10.5-6.5z"/><path class="i-pause" d="M8 5v14M16 5v14"/></svg><span>{html.escape(label)}</span></button>')


def main():
    out, slugs = sys.argv[1], sys.argv[2:]
    assert len(slugs) == 4, "four ElevenLabs voices"
    voices = slugs + ["kokoro-kakak-a"]
    order = voices[:]
    for i in range(len(order) - 1, 0, -1):  # Fisher-Yates with a secure draw: no one can guess the order
        j = secrets.randbelow(i + 1)
        order[i], order[j] = order[j], order[i]
    labels = dict(zip("ABCDE", order))
    cards = []
    for letter, voice in labels.items():
        rows = []
        for locale, title in (("id", "Bahasa Indonesia"), ("en", "English")):
            buttons = []
            for n, name in enumerate(CLIPS, 1):
                a = control(locale, name) if voice.startswith("kokoro") else eleven(voice, locale, name)
                buttons.append(clip(mp3(a), f"Line {n}"))
            rows.append(f'<div class="row"><span class="lang">{title}</span><div class="clips">{"".join(buttons)}</div></div>')
        cards.append(f'<article class="voice"><h3>Voice {letter}</h3>{"".join(rows)}</article>')

    def listed(locale):
        items = [jobs.audition_text(locale, keys) for _, keys in jobs.AUDITION]
        items.append(jobs.strip_markup(lines.AUDITION_EN[1]) if locale == "en" else lines.AUDITION_ID_TEXT[1])
        return "".join(f"<li>{html.escape(t)}</li>" for t in items)

    page = open(os.path.join(os.path.dirname(__file__), "page.html")).read()
    page = page.replace("{{VOICES}}", "\n".join(cards)).replace("{{LINES_EN}}", listed("en")).replace("{{LINES_ID}}", listed("id"))
    open(out, "w").write(page)
    json.dump(labels, open(os.path.join(AUD, "labels.json"), "w"), indent=1)
    print(f"wrote {out} ({len(page) / 1e6:.1f} MB); answer key in {os.path.relpath(os.path.join(AUD, 'labels.json'), ROOT)}")


if __name__ == "__main__":
    main()
