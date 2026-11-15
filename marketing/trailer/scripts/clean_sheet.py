"""v8: a clean base for the typing shot, made from the app's own screenshots (run after `npm run capture`).

  .tools/venv-main/bin/python scripts/clean_sheet.py

For each language: Kakak's sheet with the finished sentence (k0-type-13, so the input is already two lines
tall), its text and the "Try saying" suggestions painted out, and the send button grey (from k0-open).
Writes public/shots/<lang>/k0-sheet-empty.png and k0-send-dark.png (the black send button, for when there
is text). The film's TypedInput draws the sentence over it, so the screen never jumps or ghosts.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# In the 3x screenshots: the input's inside, the send button, and where the suggestions start.
INPUT = (61, 1228, 941, 1419)
BUTTON = (976, 1276, 1124, 1424)
SUGGEST_TOP = 1431

for loc in ("en", "id"):
    d = os.path.join(ROOT, "public", "shots", loc)
    full = Image.open(os.path.join(d, "k0-type-13.jpg")).convert("RGB")
    empty = Image.open(os.path.join(d, "k0-open.png")).convert("RGB")
    a = np.asarray(full).copy()
    x0, y0, x1, y1 = INPUT
    a[y0:y1, x0:x1] = 255
    a[SUGGEST_TOP:, :] = 255
    out = Image.fromarray(a)
    out.paste(empty.crop(BUTTON), BUTTON[:2])
    out.save(os.path.join(d, "k0-sheet-empty.png"))
    full.crop(BUTTON).save(os.path.join(d, "k0-send-dark.png"))
    print("wrote", os.path.relpath(os.path.join(d, "k0-sheet-empty.png"), ROOT))

# v10: the same for the real listening screen (capture/listen.capture.ts): k0-listen-full with the words and the
# suggestions painted out. The send button is grey before the first word (the dark one recoloured to the app's grey,
# sampled from k0-open), dark after. Positions differ by language (the Indonesian status line wraps to two lines).
LISTEN = {
    "en": {"input": (58, 1117, 946, 1307), "button": (976, 1165, 1124, 1313), "suggest": 1326},
    "id": {"input": (58, 1177, 946, 1367), "button": (976, 1225, 1124, 1373), "suggest": 1386},
}
for loc, g in LISTEN.items():
    d = os.path.join(ROOT, "public", "shots", loc)
    full = Image.open(os.path.join(d, "k0-listen-full.png")).convert("RGB")
    grey = np.asarray(Image.open(os.path.join(d, "k0-open.png")).convert("RGB"))[1300, 1000]
    dark = full.crop(g["button"])
    a = np.asarray(full).copy()
    x0, y0, x1, y1 = g["input"]
    a[y0:y1, x0:x1] = 255
    a[g["suggest"]:, :] = 255
    b = np.asarray(dark).copy()
    lum = b.mean(axis=2)
    b[lum < 110] = grey
    out = Image.fromarray(a)
    out.paste(Image.fromarray(b), g["button"][:2])
    out.save(os.path.join(d, "k0-listen-base.png"))
    dark.save(os.path.join(d, "k0-listen-send.png"))
    print("wrote", os.path.relpath(os.path.join(d, "k0-listen-base.png"), ROOT), "grey", grey)
