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
