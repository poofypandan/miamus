"""A picture of a sound file, since the one who wrote this music cannot hear it.

Draws loudness over time and a spectrogram (which notes, how bright, where the
silences are), and prints the level second by second.
  python audio/look.py audio/out/music-60-felt.wav review/audio-music-60.png [marks in seconds…]
"""
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from scipy.signal import spectrogram

path, out = sys.argv[1], sys.argv[2]
marks = [float(m) for m in sys.argv[3:]]
x, sr = sf.read(path, always_2d=True)
mono = x.mean(axis=1)
dur = len(mono) / sr
hop = sr // 10
rms = np.array([np.sqrt(np.mean(mono[i : i + hop] ** 2) + 1e-12) for i in range(0, len(mono) - hop, hop)])
t = np.arange(len(rms)) / 10
f, tt, S = spectrogram(mono, sr, nperseg=4096, noverlap=3072)
fig, ax = plt.subplots(2, 1, figsize=(16, 9), gridspec_kw={"height_ratios": [1, 2.4]})
ax[0].plot(t, 20 * np.log10(rms), color="#b65f55", lw=1.2)
ax[0].set_ylim(-60, 0)
ax[0].set_xlim(0, dur)
ax[0].set_ylabel("level (dB)")
ax[0].grid(alpha=0.3)
keep = (f > 30) & (f < 14000)
ax[1].pcolormesh(tt, f[keep], 10 * np.log10(S[keep] + 1e-14), vmin=-110, vmax=-35, cmap="magma", shading="auto")
ax[1].set_yscale("log")
ax[1].set_yticks([55, 110, 220, 440, 880, 1760, 3520, 7040])
ax[1].set_yticklabels(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"])
ax[1].set_xlim(0, dur)
ax[1].set_xlabel("seconds")
for a in ax:
    for m in marks:
        a.axvline(m, color="#fff" if a is ax[1] else "#333", lw=0.6, alpha=0.6)
plt.tight_layout()
plt.savefig(out, dpi=90)
sec = [20 * np.log10(np.sqrt(np.mean(mono[i * sr : (i + 1) * sr] ** 2) + 1e-12)) for i in range(int(dur))]
print("level by second (dB):", " ".join(f"{v:.0f}" for v in sec))
hi = np.sqrt(np.mean((mono - np.convolve(mono, np.ones(8) / 8, "same")) ** 2))
print(f"peak {20 * np.log10(np.abs(x).max()):.1f} dB · overall {20 * np.log10(np.sqrt(np.mean(mono ** 2))):.1f} dB · energy above 6 kHz {10 * np.log10(S[f > 6000].sum() / S.sum()):.1f} dB · below 120 Hz {10 * np.log10(S[f < 120].sum() / S.sum()):.1f} dB")
