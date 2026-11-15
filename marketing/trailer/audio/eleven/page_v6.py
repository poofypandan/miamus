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
MAMA_LINES = [("M1", "In a minute, sweetie…", "Sebentar ya, sayang…"), ("M1t", "In a minute… (distracted)", "Sebentar ya… (distracted)"), ("M2", "I'm looking, sweetie.", "Iya, Mama lihat, sayang.")]
CHILD_DIR = os.path.join(ROOT, "audio", "out", "child", "candidates")
CHILD = ["kokoro-calm", "kokoro-bright", "chatterbox-lively", "chatterbox-bright"]


def find(d, stem):
    return os.path.join(d, next(f for f in os.listdir(d) if f.startswith(stem + ".")))


def row(title, buttons):
    return f'<div class="row"><span class="lang">{html.escape(title)}</span><div class="clips">{"".join(buttons)}</div></div>'


def card(title, note, rows):
    sub = f'<p class="lede small">{html.escape(note)}</p>' if note else ""
    return f'<article class="voice"><h3>{html.escape(title)}</h3>{sub}{"".join(rows)}</article>'


def main():
    import json
    import secrets
    out = sys.argv[1]
    mama_cards = []
    for label, slug, note in MAMAS:
        rows = []
        for loc, title in (("id", "Bahasa Indonesia"), ("en", "English")):
            d = os.path.join(V6, f"mama-{slug}", loc)
            rows.append(row(title, [page.clip(page.mp3(page.load(find(d, k))), t if loc == "en" else ti) for k, t, ti in MAMA_LINES]))
        mama_cards.append(card(f"{label}", note, rows))
    d = os.path.join(V6, "kakak-lyly")
    kakak = card("Kakak (Lyly, the chosen voice)", "Her new line, said while the notification is still on screen.", [
        row("English", [page.clip(page.mp3(page.load(find(os.path.join(d, "en"), "L10"))), "That one's yours. Go play.")]),
        row("Bahasa Indonesia", [page.clip(page.mp3(page.load(find(os.path.join(d, "id"), "L10"))), "Yang ini bagian Anda. Selamat bermain."),
                                 page.clip(page.mp3(page.load(find(os.path.join(d, "id"), "L10alt"))), "Yang ini bagian Anda. Nikmati, ya.")]),
    ])
    order = CHILD[:]
    for i in range(len(order) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        order[i], order[j] = order[j], order[i]
    labels = dict(zip("ABCD", order))
    json.dump(labels, open(os.path.join(CHILD_DIR, "labels.json"), "w"), indent=1)
    child_cards = []
    for letter, name in labels.items():
        cd = os.path.join(CHILD_DIR, name)
        clip = lambda f, t: page.clip(page.mp3(page.load(os.path.join(cd, f))), t)
        child_cards.append(card(f"Girl {letter}", "", [
            row("In the hook, with the music", [clip("en-hook.wav", "English"), clip("id-hook.wav", "Indonesia")]),
            row("English", [clip("en-look1.wav", "Mama, look!"), clip("en-look2.wav", "Again, brighter"), clip("unanswered.wav", "Mama…?")]),
            row("Bahasa Indonesia", [clip("id-look1.wav", "Mama, lihat!"), clip("id-look2.wav", "Lagi, lebih ceria")]),
        ]))

    tpl = open(os.path.join(os.path.dirname(__file__), "page.html")).read()
    head, rest = tpl.split("<main>", 1)
    script = rest.split("</main>", 1)[1]
    head = head.replace("<title>Kakak Voice Audition</title>", "<title>Mama, Look Voices</title>")
    head = head.replace("  footer {", "  .small { font-size: 14px; }\n  .beats { margin: 0; padding-left: 20px; display: grid; gap: 7px; color: var(--soft); font-size: 15px; }\n  .beats b { color: var(--ink); font-weight: 600; }\n  footer {")
    mark = re.search(r'<div class="mark".*?</div>', rest, re.S).group(0)
    main = f"""<main>
  <header>
    {mark}
    <h1>Mama, look</h1>
    <p class="lede">The friends who watched v5 missed the story of the girl's call. Version 6 lets you hear it: Mama answers her, too busy at the start and there for her at the end. Listen, then choose the girl, Mama, and Kakak's Indonesian line.</p>
  </header>

  <section>
    <h2>Where each line goes</h2>
    <ol class="beats">
      <li><b>0:00.2</b> The girl: "Mama, look!" The first question waits until she finishes.</li>
      <li><b>0:02</b> Mama, looking at her phone, as the questions rise out of it: "In a minute, sweetie…"</li>
      <li><b>0:04</b> The girl, smaller, unanswered: "Mama…?"</li>
      <li><b>0:46</b> Kakak, while the one notification is still on screen: "That one's yours. Go play."</li>
      <li><b>0:49</b> The girl calls again as the phone falls away: "Mama, look!"</li>
      <li><b>0:51</b> Mama, beside her, hand up to her eyes: "I'm looking, sweetie."</li>
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
    <p class="lede small">Four girls, A to D, in random order, from the least acted to the most animated. ElevenLabs does not offer child voices (its rules keep child-like voices out), so these were made on the laptop from two open-source voices, Kokoro and Chatterbox, both licensed for commercial use, raised to a little girl's pitch: the usual technique in animation. Pick the one that sounds least like acting. Mama in the hook clips is Mama 1, only so you can hear the moment.</p>
    {"".join(child_cards)}
  </section>

  <section>
    <h2>Your choice</h2>
    <p class="reply">Reply with three things, for example <code>Girl C, Mama 2, Selamat bermain</code>.</p>
  </section>

  <footer>Made for the Miamus trailer. The family is invented.</footer>
</main>
"""
    open(out, "w").write(head + main + script)
    print(f"wrote {out} ({os.path.getsize(out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
