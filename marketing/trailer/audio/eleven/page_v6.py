"""The v6 listening page: Mama's candidate voices, Kakak's new last line, and the girl's call
(local samples only: ElevenLabs does not offer child-like voices). Uses page.html's look.

  python audio/eleven/page_v6.py <output.html> <child-samples-dir>
"""
import html
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "eleven"))
import page  # noqa: E402  (its mp3(), load() and clip())

V6 = os.path.join(ROOT, "audio", "out", "eleven", "v6")
MAMAS = [("Mama 1", "aita", "Aita: calm, gentle, friendly"), ("Mama 2", "devi", "Devi: warm, expressive"), ("Mama 3", "lani", "Lani Eleonora: warm, conversational")]
MAMA_LINES = [("M1", "In a minute, sweetie…", "Sebentar ya, sayang…"), ("M1t", "In a minute, sweetie… (distracted)", "Sebentar ya, sayang… (distracted)"), ("M2", "I see you.", "Mama lihat kok.")]
CHILD = [("Sample A", "af_sky-{loc}-a"), ("Sample B", "af_sky-{loc}-b"), ("Sample C", "af_bella-{loc}-a"), ("Sample D", "af_bella-{loc}-b")]


def find(d, stem):
    return os.path.join(d, next(f for f in os.listdir(d) if f.startswith(stem + ".")))


def row(title, buttons):
    return f'<div class="row"><span class="lang">{html.escape(title)}</span><div class="clips">{"".join(buttons)}</div></div>'


def card(title, note, rows):
    sub = f'<p class="lede small">{html.escape(note)}</p>' if note else ""
    return f'<article class="voice"><h3>{html.escape(title)}</h3>{sub}{"".join(rows)}</article>'


def main():
    out, child_dir = sys.argv[1], sys.argv[2]
    mama_cards = []
    for label, slug, note in MAMAS:
        rows = []
        for loc, title in (("id", "Bahasa Indonesia"), ("en", "English")):
            d = os.path.join(V6, f"mama-{slug}", loc)
            rows.append(row(title, [page.clip(page.mp3(page.load(find(d, k))), t if loc == "en" else ti) for k, t, ti in MAMA_LINES]))
        mama_cards.append(card(f"{label}", note, rows))
    d = os.path.join(V6, "kakak-lyly")
    kakak = card("Kakak (Lyly, the chosen voice)", "Her new last line, after the one notification.", [
        row("English", [page.clip(page.mp3(page.load(find(os.path.join(d, "en"), "L10"))), "That one's yours. Enjoy it.")]),
        row("Bahasa Indonesia", [page.clip(page.mp3(page.load(find(os.path.join(d, "id"), "L10"))), "Yang ini bagian Anda. Nikmati, ya."),
                                 page.clip(page.mp3(page.load(find(os.path.join(d, "id"), "L10alt"))), "Yang itu untuk Anda. Selamat menikmati.")]),
    ])
    child_cards = [card(label, "", [row(title, [page.clip(page.mp3(page.load(os.path.join(child_dir, stem.format(loc=loc) + ".wav"))), text)])
                                     for loc, title, text in (("en", "English", "Mama, look!"), ("id", "Bahasa Indonesia", "Mama, lihat!"))])
                   for label, stem in CHILD]

    tpl = open(os.path.join(os.path.dirname(__file__), "page.html")).read()
    head, rest = tpl.split("<main>", 1)
    script = rest.split("</main>", 1)[1]
    head = head.replace("<title>Kakak Voice Audition</title>", "<title>Mama, Look Voices</title>")
    head = head.replace("  footer {", "  .small { font-size: 14px; }\n  .beats { margin: 0; padding-left: 20px; display: grid; gap: 7px; color: var(--soft); font-size: 15px; }\n  .beats b { color: var(--ink); font-weight: 600; }\n  footer {")
    mark = re.search(r'<div class="mark".*?</div>', rest, re.S).group(0)
    main = f"""<main>
  <header>
    {mark}
    <h1>Mama, look: the voices for v6</h1>
    <p class="lede">The friends who watched v5 missed the story of the girl's call. Version 6 lets you hear it: Mama answers her, too busy at the start and there for her at the end. Listen, then tell Kakak's team which Mama, which Indonesian line for Kakak, and how the girl should sound.</p>
  </header>

  <section>
    <h2>Where each line goes</h2>
    <ol class="beats">
      <li><b>0:00</b> The girl: "Mama, look!" Her handwriting beside her, as now.</li>
      <li><b>0:01.5</b> Mama, off screen, as the day's questions pile up: "In a minute, sweetie…"</li>
      <li><b>0:48</b> Kakak, after the one notification: "That one's yours. Enjoy it."</li>
      <li><b>0:51</b> The girl calls again: "Mama, look!"</li>
      <li><b>0:52</b> Mama, beside her now, looking up: "I see you."</li>
    </ol>
  </section>

  <section>
    <h2>Mama</h2>
    {"".join(mama_cards)}
  </section>

  <section>
    <h2>Kakak's new last line</h2>
    {kakak}
  </section>

  <section>
    <h2>The girl</h2>
    <p class="lede small">ElevenLabs does not offer child voices: its rules keep child-like voices out of its library, and its voice designer refuses them. These four were made on the laptop instead, from an open-source voice raised toward a child's pitch. They may sound processed. The other choices are an adult voice actor who does children's voices, or her words on screen only.</p>
    {"".join(child_cards)}
  </section>

  <section>
    <h2>Your choice</h2>
    <p class="reply">Reply with three things, for example <code>Mama 2, Nikmati ya, girl on screen only</code>.</p>
  </section>

  <footer>Made for the Miamus trailer. The family is invented.</footer>
</main>
"""
    open(out, "w").write(head + main + script)
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
