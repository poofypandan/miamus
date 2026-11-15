"""The blind A–D listening page for the lo-fi score (v13-lofi). Uses page.html's look.

Each candidate (audio/out/music-60-lofi-<k>.wav, from lofi.py) is mixed under v13's voices exactly as the film is
(audio/mix.py: ducked under speech, the effects and the girl's bell on top, -14 LUFS), and the page plays the film's
last 25 seconds (0:35–1:00, the thinning, the quiet beat, the return and the end card) and the music alone (0:05–1:00).
The letters are drawn at random; the key is kept in audio/out/lofi-labels.json (not published).

  .tools/venv-main/bin/python audio/music/page_lofi.py <output.html>
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
sys.path.insert(0, os.path.join(ROOT, "audio"))
sys.path.insert(0, os.path.join(ROOT, "audio", "eleven"))
import mix  # noqa: E402
import page  # noqa: E402  (its clip() button)

VOICES = {"kakak": "eleven-lyly-v12", "girl": None, "mama": "mama-aita-v11"}
CANDIDATES = ["a", "b", "c", "d"]
FROM_FILM, FROM_MUSIC = 35.0, 5.0


def mp3(x, sr):
    with tempfile.TemporaryDirectory() as d:
        wav, out = os.path.join(d, "x.wav"), os.path.join(d, "x.mp3")
        sf.write(wav, x.astype("float32"), sr)
        subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", out], cwd=ROOT, check=True)
        return "data:audio/mpeg;base64," + base64.b64encode(open(out, "rb").read()).decode()


def excerpt(x, sr, start, fade_s=0.3):
    y = x[int(start * sr) :].copy()
    n = int(fade_s * sr)
    y[:n] *= np.linspace(0, 1, n)[:, None]
    return y


def main():
    out = sys.argv[1]
    work = os.environ.get("LOFI_WORK") or tempfile.mkdtemp()
    mix.OUT_DIR = work
    mix.OUT_NAME = "mix-{cut}-{locale}-{music}.wav"
    order = CANDIDATES[:]
    for i in range(len(order) - 1, 0, -1):  # Fisher-Yates with a secure draw
        j = secrets.randbelow(i + 1)
        order[i], order[j] = order[j], order[i]
    labels = dict(zip("ABCD", order))
    json.dump(labels, open(os.path.join(ROOT, "audio", "out", "lofi-labels.json"), "w"), indent=1)

    cards = []
    for letter, k in labels.items():
        mix.mix("60", "en", VOICES, f"lofi-{k}")
        film, sr = sf.read(os.path.join(work, f"mix-60-en-lofi-{k}.wav"))
        music, _ = sf.read(os.path.join(ROOT, "audio", "out", f"music-60-lofi-{k}.wav"))
        # The music alone a little louder than it sits in the film (all four by the same amount).
        alone = excerpt(music, sr, FROM_MUSIC) * mix.db(2.5)
        alone = mix.soft_limit(alone, 0.97, 0.85)
        cards.append(f"""<article class="voice"><h3>Score {letter}</h3>
  <div class="row"><span class="lang">The ending, with the voices (0:35–1:00)</span><div class="clips">{page.clip(mp3(excerpt(film, sr, FROM_FILM), sr), "Film")}</div></div>
  <div class="row"><span class="lang">The music alone (0:05–1:00)</span><div class="clips">{page.clip(mp3(alone, sr), "Music")}</div></div>
</article>""")
        print("candidate", letter, "done", flush=True)

    tpl = open(os.path.join(ROOT, "audio", "eleven", "page.html")).read()
    head, rest = tpl.split("<main>", 1)
    script = rest.split("</main>", 1)[1]
    head = head.replace("<title>Kakak Voice Audition</title>", "<title>Lo-fi Score Audition</title>")
    head = head.replace("  footer {", "  .beats { margin: 0; padding-left: 20px; display: grid; gap: 7px; color: var(--soft); font-size: 15px; }\n  .beats b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }\n  footer {")
    mark = re.search(r'<div class="mark".*?</div>', rest, re.S).group(0)
    main_html = f"""<main>
  <header>
    {mark}
    <h1>Four lo-fi scores</h1>
    <p class="lede">The same 60-second film (v13), with a lo-fi score instead of the lullaby. Four originals, composed for this film, in random order. They differ in tempo (84 to 93 beats a minute), in what plays the tune, and in how worn the record sounds. Each plays under the film's last 25 seconds with the voices, then on its own.</p>
  </header>

  <section>
    <h2>What to listen for</h2>
    <ol class="beats">
      <li><b>0:39</b> The groove thins as Kakak says the day is on track.</li>
      <li><b>0:43–0:46</b> Almost nothing, so the girl's three-note bell can be heard.</li>
      <li><b>0:47</b> Everything comes back on Kakak's "That one's yours."</li>
      <li><b>0:57</b> A soft resolve with the end card, ringing out to the end.</li>
    </ol>
  </section>

  <section>
    <h2>The scores</h2>
    {"".join(cards)}
  </section>

  <section>
    <h2>Your choice</h2>
    <p class="reply">Reply with one letter, for example <code>Score B</code>. A note on what to change is welcome too.</p>
  </section>

  <footer>Original music, composed and played on the laptop for the Miamus trailer: no samples, no loops, nothing licensed from anyone. The family is invented.</footer>
</main>
"""
    open(out, "w").write(head + main_html + script)
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
