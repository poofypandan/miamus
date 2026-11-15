"""Checks the lo-fi candidates: loudness, clicks, and the arc (the groove drops at 43–46 s and returns at 47.0 s).

  .tools/venv-main/bin/python audio/music/measure_lofi.py [a b c d]
Writes audio/out/lofi-measure.json and a spectrogram per candidate (audio/out/lofi-<k>-spec.png).
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def lufs(path):
    out = subprocess.run(["npx", "remotion", "ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"], cwd=ROOT, capture_output=True, text=True).stderr
    j = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S).group(0))
    return float(j["input_i"]), float(j["input_tp"])


def lra(path, start=17.0, end=39.0):
    """The loudness range of the steady groove (17–39 s: after the intro, before the planned thinning and silence)."""
    out = subprocess.run(["npx", "remotion", "ffmpeg", "-hide_banner", "-nostats", "-ss", str(start), "-to", str(end), "-i", path, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"], cwd=ROOT, capture_output=True, text=True).stderr
    return float(json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", out, re.S).group(0))["input_lra"])


def tone(x, sr, spans=((15, 41), (47, 57))):
    """The reference's measures, over the groove (frames of 2048, hop 512, as librosa does): the share of power below
    800 Hz and 150 Hz; the 85% roll-off and the spectral centroid of each frame's magnitude spectrum, as medians."""
    m = x.mean(axis=1)
    n, hop = 2048, 512
    win = np.hanning(n)
    f = np.fft.rfftfreq(n, 1 / sr)
    power = np.zeros(len(f))
    rolls, cents = [], []
    for a, b in spans:
        for i in range(int(a * sr), int(b * sr) - n, hop):
            mag = np.abs(np.fft.rfft(m[i : i + n] * win))
            power += mag**2
            s = mag.sum()
            if s > 1e-6:
                rolls.append(f[np.searchsorted(np.cumsum(mag) / s, 0.85)])
                cents.append((f * mag).sum() / s)
    c = np.cumsum(power) / power.sum()
    return {"below_800": round(float(c[f < 800][-1]) * 100, 1), "below_150": round(float(c[f < 150][-1]) * 100, 1),
            "rolloff85_hz": int(np.median(rolls)), "centroid_median_hz": int(np.median(cents))}


def band_db(x, sr, t0, t1, lo, hi):
    seg = x[int(t0 * sr) : int(t1 * sr)].mean(axis=1)
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1 / sr)
    return 10 * np.log10(spec[(f >= lo) & (f < hi)].sum() / len(seg) + 1e-12)


def clicks(x, sr):
    """Samples where the signal jumps far more than the music around it does (a discontinuity, not a drum hit)."""
    m = x.mean(axis=1)
    d2 = np.abs(np.diff(m, 2))
    win = int(0.01 * sr)
    local = np.convolve(d2, np.ones(win) / win, mode="same")
    hits = np.where((d2 > 12 * local + 1e-4) & (d2 > 0.02))[0]
    out, last = [], -sr
    for h in hits:
        if h - last > sr * 0.05:
            out.append(round(h / sr, 3))
        last = h
    return out


def spectrogram(x, sr, path, title):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    m = x.mean(axis=1)
    fig, ax = plt.subplots(figsize=(14, 4))
    ax.specgram(m, NFFT=2048, Fs=sr, noverlap=1024, cmap="magma", vmin=-130, vmax=-30)
    ax.set_ylim(0, 8000)
    for t in (15, 43, 46, 47, 57):
        ax.axvline(t, color="cyan", lw=0.6)
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)


def main():
    keys = sys.argv[1:] or ["a", "b", "c", "d"]
    report = {}
    for k in keys:
        path = os.path.join(ROOT, "audio", "out", f"music-60-lofi-{k}.wav")
        x, sr = sf.read(path)
        i, tp = lufs(path)
        groove = band_db(x, sr, 30, 38, 40, 16000)
        quiet = band_db(x, sr, 43.2, 46.0, 40, 16000)
        back = band_db(x, sr, 47.0, 50.0, 40, 16000)
        low_q = band_db(x, sr, 43.2, 46.0, 40, 250)
        low_b = band_db(x, sr, 47.0, 50.0, 40, 250)
        # The downbeat: how fast the level climbs across 47.0 s (RMS in 50 ms windows).
        w = int(0.05 * sr)
        rms = lambda t: 20 * np.log10(np.sqrt(np.mean(x[int(t * sr) : int(t * sr) + w] ** 2)) + 1e-9)
        step = rms(47.0) - rms(46.85)
        c = clicks(x, sr)
        report[k] = {**tone(x, sr), "groove_lra": round(lra(path), 1), "lufs": round(i, 1), "true_peak": round(tp, 1), "groove_30_38_db": round(groove, 1), "quiet_43_46_db": round(quiet, 1),
                     "return_47_50_db": round(back, 1), "drop_db": round(groove - quiet, 1), "return_db": round(back - quiet, 1),
                     "low_band_return_db": round(low_b - low_q, 1), "step_at_47_db": round(step, 1), "clicks": c[:20]}
        spectrogram(x, sr, os.path.join(ROOT, "audio", "out", f"lofi-{k}-spec.png"), f"lofi {k}")
        print(k, report[k], flush=True)
    json.dump(report, open(os.path.join(ROOT, "audio", "out", "lofi-measure.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
