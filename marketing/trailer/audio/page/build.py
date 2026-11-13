"""Builds the listening page: Kakak's candidate voices and the music's three arrangements, as one HTML file.

The clips are embedded in the page (MP3, as data), so it works as a private Artifact with no other files.
  python audio/page/build.py <output.html>
"""
import base64
import html
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "voice"))
import importlib.util

spec = importlib.util.spec_from_file_location("lines", os.path.join(ROOT, "audio", "voice", "lines.py"))
lines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lines)

# The order on the page: not the order they were made in, so the page is a blind listen.
VOICES = [("1", "kakak-c"), ("2", "kakak-a"), ("3", "kakak-e"), ("4", "kakak-b"), ("5", "kakak-d")]
MUSIC = [("A", "felt"), ("B", "strings"), ("C", "tines")]
plain = lambda t: re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)


def mp3(path, kbps, channels):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        out = f.name
    subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path, "-codec:a", "libmp3lame", "-b:a", f"{kbps}k", "-ac", str(channels), out], cwd=ROOT, check=True)
    data = open(out, "rb").read()
    os.unlink(out)
    return "data:audio/mpeg;base64," + base64.b64encode(data).decode()


def clip(src, label):
    return f'<button class="clip" type="button" data-src="{src}" aria-label="{html.escape(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M8 5.5v13l10.5-6.5z"/><path class="i-pause" d="M8 5v14M16 5v14"/></svg><span>{html.escape(label)}</span></button>'


voices_html = []
for number, name in VOICES:
    rows = []
    for locale, title in (("id", "Bahasa Indonesia"), ("en", "English")):
        buttons = "".join(clip(mp3(os.path.join(ROOT, "audio", "out", "vo", name, locale, f"A{i}.wav"), 72, 1), f"Line {i}") for i in (1, 2, 3))
        rows.append(f'<div class="row"><span class="lang">{title}</span><div class="clips">{buttons}</div></div>')
    voices_html.append(f'<article class="voice"><h3>Voice {number}</h3>{"".join(rows)}</article>')

music_html = []
for letter, style in MUSIC:
    src = mp3(os.path.join(ROOT, "audio", "out", f"music-60-{style}.wav"), 128, 2)
    music_html.append(f'<article class="voice"><h3>Music {letter}</h3><div class="row"><span class="lang">The 60-second score, from the first note</span><div class="clips">{clip(src, "Play")}</div></div></article>')

en = "".join(f"<li>{html.escape(plain(t))}</li>" for t in lines.AUDITION_EN)
idn = "".join(f"<li>{html.escape(t)}</li>" for t in lines.AUDITION_ID_TEXT)

page = open(os.path.join(os.path.dirname(__file__), "template.html")).read()
page = page.replace("{{VOICES}}", "\n".join(voices_html)).replace("{{MUSIC}}", "\n".join(music_html)).replace("{{LINES_EN}}", en).replace("{{LINES_ID}}", idn)
out = sys.argv[1]
open(out, "w").write(page)
print(f"wrote {out} ({len(page) / 1e6:.1f} MB)")
