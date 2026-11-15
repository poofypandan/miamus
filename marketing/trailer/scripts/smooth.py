"""Looks for stutter in a finished MP4, frame by frame (v8).

  .tools/venv-main/bin/python scripts/smooth.py out/miamus-60-en.mp4 [cut seconds …]

Decodes the video small and grey, measures how much each frame differs from the one before, and reports:
  - holds: a frame that does not change while the frames around it are moving (a freeze in a move);
  - jumps: a change much larger than its neighbours that is not at a known cut (a pop or a layout jump).
The film's own cuts (scene changes) are passed in and are not reported.
"""
import subprocess
import sys

import numpy as np

W, H, FPS = 108, 192, 30


def frames(path):
    """Every frame, small and grey. Remotion's ffmpeg has no raw muxer, so frames come as a stream of PNGs."""
    import io

    from PIL import Image

    cmd = ["npx", "remotion", "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", path, "-vf", f"scale={W}:{H},format=gray", "-c:v", "png", "-f", "image2pipe", "pipe:1"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    end = b"IEND\xaeB`\x82"
    out, i = [], 0
    while True:
        j = raw.find(end, i)
        if j < 0:
            break
        out.append(np.asarray(Image.open(io.BytesIO(raw[i : j + len(end)])).convert("L"), np.float32))
        i = j + len(end)
    return np.stack(out)


def main():
    path = sys.argv[1]
    cuts = [float(x) for x in sys.argv[2:]]
    f = frames(path)
    d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))  # d[i]: change from frame i to i+1
    holds, jumps = [], []
    for i in range(2, len(d) - 2):
        t = (i + 1) / FPS
        near_cut = any(abs(t - c) < 0.1 for c in cuts)
        around = np.r_[d[i - 2 : i], d[i + 1 : i + 3]]
        if d[i] < 0.02 and around.min() > 0.25:
            holds.append(round(t, 2))
        med = np.median(d[max(0, i - 6) : i + 7])
        if not near_cut and d[i] > 2.5 and d[i] > 6 * max(med, 0.15):
            jumps.append((round(t, 2), round(float(d[i]), 2)))
    print(f"{path}: {len(f)} frames; holds in motion: {holds or 'none'}; jumps not at cuts: {jumps or 'none'}")


if __name__ == "__main__":
    main()
