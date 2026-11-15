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
# (heading, note, music styles (audio/out/music-60-<style>.wav), letters, the effects file: the girl's bell in the score's key)
# (heading, note, music styles (audio/out/music-60-<style>.wav), letters, the effects file (the girl's bell in the
# score's key), tags shown beside a score's letter). After the owner's choice (15 Nov) the page names its sources.
ROUNDS = [
    ("Composed here, round 1", "Four scores in D at 84 to 93 beats a minute; they differ in what plays the tune and how worn the record sounds. Ours to use in ads.",
     ["lofi-a", "lofi-b", "lofi-c", "lofi-d"], "ABCD", "sfx-{cut}.wav", {}),
    ("Composed here, round 2", "Three scores on the measurements from the mix you like: slower (69 to 75 beats a minute, hi-hats at double time), in C major, dark and warm, with a deep round bass. Ours to use in ads.",
     ["lofi-e", "lofi-f", "lofi-g"], "EFG", "sfx-{cut}-C.wav", {}),
    # The owner's four tracks from the ElevenLabs app, fitted on their own bar lines (audio/music/eleven_owner.py).
    ("ElevenLabs, licence pending", "Your four Eleven Music tracks, each cut on its own bar lines so its groove comes back on 0:47. Not for publication until ElevenLabs confirms the Creator plan covers company ads. The one in v13-lofi is marked; any of the others can take its place.",
     ["eleven-owner-1", "eleven-owner-2", "eleven-owner-3", "eleven-owner-4"], "HIJK", "sfx-{cut}-C.wav", {"eleven-owner-3": "in v13-lofi"}),
    # The owner's Suno free-plan track (audio/music/suno_test.py): never usable, a sound comparison only. Not blind.
    ("Suno (free plan): sound test only, not usable", "Made on Suno's free plan, which gives no commercial rights, so it can never be in the ad. Here only to judge the sound, to decide whether Suno Pro is worth paying for. Trimmed on its own bar lines around its one break; its levels are left as they are, so its quiet moment is not as quiet as the others.",
     ["suno-test"], "L", "sfx-{cut}-C.wav", {"suno-test": "Suno free plan, not usable"}),
]
FROM_FILM, FROM_MUSIC = 35.0, 5.0


def mp3(x, sr):
    with tempfile.TemporaryDirectory() as d:
        wav, out = os.path.join(d, "x.wav"), os.path.join(d, "x.mp3")
        sf.write(wav, x.astype("float32"), sr)
        subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", out], cwd=ROOT, check=True)
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
    # Each round keeps its letters once drawn (the key is audio/out/lofi-labels.json), so a page rebuilt with a new
    # round still plays round 1 under the same letters the owner may already have listened to.
    key_path = os.path.join(ROOT, "audio", "out", "lofi-labels.json")
    labels = json.load(open(key_path)) if os.path.exists(key_path) else {}
    sections = []
    mix.BRAND_DIP_DB = 5.0  # as in v13-lofi: the music dips under the brand name that opens the end line
    for title, note, styles, letters, sfx, tags in ROUNDS:
        styles = [st for st in styles if os.path.exists(os.path.join(ROOT, "audio", "out", f"music-60-{st}.wav"))]
        if not styles:
            continue
        mine = {L: labels[L] for L in letters if labels.get(L) in styles}
        if sorted(mine.values()) != sorted(styles):
            order = styles[:]
            for i in range(len(order) - 1, 0, -1):  # Fisher-Yates with a secure draw
                j = secrets.randbelow(i + 1)
                order[i], order[j] = order[j], order[i]
            mine = dict(zip(letters, order))
            labels.update(mine)
            json.dump(labels, open(key_path, "w"), indent=1)
        cards = []
        for letter in sorted(mine):
            style = mine[letter]
            mix.SFX_NAME = sfx[style] if isinstance(sfx, dict) else sfx
            mix.mix("60", "en", VOICES, style)
            film, sr = sf.read(os.path.join(work, f"mix-60-en-{style}.wav"))
            music, _ = sf.read(os.path.join(ROOT, "audio", "out", f"music-60-{style}.wav"))
            # The music alone a little louder than it sits in the film (every candidate by the same amount).
            alone = excerpt(music, sr, FROM_MUSIC) * mix.db(2.5)
            alone = mix.soft_limit(alone, 0.97, 0.85)
            tag = f' <span class="tag">{html.escape(tags[style])}</span>' if style in tags else ""
            cards.append(f"""<article class="voice"><h3>Score {letter}{tag}</h3>
  <div class="row"><span class="lang">The ending, with the voices (0:35–1:00)</span><div class="clips">{page.clip(mp3(excerpt(film, sr, FROM_FILM), sr), "Film")}</div></div>
  <div class="row"><span class="lang">The music alone (0:05–1:00)</span><div class="clips">{page.clip(mp3(alone, sr), "Music")}</div></div>
</article>""")
            print("candidate", letter, "done", flush=True)
        sections.append(f"""  <section>
    <h2>{html.escape(title)}</h2>
    <p class="lede small">{html.escape(note)}</p>
    {"".join(cards)}
  </section>
""")
    tpl = open(os.path.join(ROOT, "audio", "eleven", "page.html")).read()
    head, rest = tpl.split("<main>", 1)
    script = rest.split("</main>", 1)[1]
    head = head.replace("<title>Kakak Voice Audition</title>", "<title>Lo-fi Score Audition</title>")
    head = head.replace("  footer {", "  .beats { margin: 0; padding-left: 20px; display: grid; gap: 7px; color: var(--soft); font-size: 15px; }\n  .beats b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }\n  .small { font-size: 14px; }\n  .tag { font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--kakak); background: var(--kakak-tint); border: 1px solid var(--kakak-line); border-radius: 999px; padding: 2px 9px; margin-left: 6px; vertical-align: 3px; white-space: nowrap; }\n  footer {")
    mark = re.search(r'<div class="mark".*?</div>', rest, re.S).group(0)
    main_html = f"""<main>
  <header>
    {mark}
    <h1>Lo-fi scores</h1>
    <p class="lede">The same 60-second film (v13), with a lo-fi score instead of the lullaby. v13-lofi uses your ElevenLabs track marked below; the rest are here so you can swap. Each plays under the film's last 25 seconds with the voices, then on its own.</p>
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

{"".join(sections)}
  <section>
    <h2>Your choice</h2>
    <p class="reply">To swap the score in v13-lofi, reply with a letter, for example <code>Score I</code>. A note on what to change is welcome too.</p>
  </section>

  <footer>Rounds 1 and 2 are original music composed and played on the laptop for the Miamus trailer: no samples, no loops, nothing licensed from anyone. The family is invented.</footer>
</main>
"""
    open(out, "w").write(head + main_html + script)
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
