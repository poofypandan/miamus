"""Fits the owner's four Eleven Music tracks (made in the ElevenLabs app, 60 s each) to v13's arc, for the listening
page only: they must not go into any ad until ElevenLabs confirms the plan's music licence covers company ads.

The tracks share one shape: a keys-only intro, the groove entering on a bar line (bar 5 or 9), the groove to the end,
then a short fade. None has a quiet section, so each is re-edited on its own bar lines (the notes are not changed):
  film 0:05      the intro's last 3 bars, flowing into the groove's own entrance (about 0:15.5)
  to 0:43.5      8 bars of groove; over its last bar (39–43.5 s) it fades and closes down (a low-pass sweep)
  0:43.5–0:47    the intro's last bar (its chords dying away), 10 dB down: almost nothing, with the bell on top
  0:47.0         the groove's entrance, exactly as it follows that intro bar in the track (no edit at the return)
  then           2 bars of groove, then the track's own ending (its 16th bar onward), cut at 1:00
Seams are short equal-power crossfades on bar lines. Each result is set to lofi.TARGET_LUFS.

  .tools/venv-main/bin/python audio/music/eleven_owner.py [folder with owner-eleven-<n>.mp3]
Writes audio/out/music-60-eleven-owner-<n>.wav and audio/out/eleven-owner-edits.json (what was done to each).
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, db, lowpass
from lofi import LENGTH, MUSIC_FROM, RETURN, TARGET_LUFS
from measure_lofi import lufs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DIR = "/Users/moshe/Miamus/docs/private/marketing/audio/eleven-music"


def decode(path):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, "x.wav")
        subprocess.run(["npx", "remotion", "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", wav], cwd=ROOT, check=True)
        x, _ = sf.read(wav)
    return x


def bar_and_entry(x):
    """The bar length (from the kick and bass's own repetition) and the bar where the groove comes in."""
    m = x.mean(axis=1)
    low = lowpass(m, 150, 4)
    hop = 240
    fr = SR / hop
    e = np.sqrt(np.convolve(low**2, np.ones(480) / 480, "same"))[::hop]
    a, b = int(30 * fr), int(55 * fr)  # every track is in its groove here
    s = e[a:b] - e[a:b].mean()
    ac = np.correlate(s, s, "full")[len(s) - 1 :]
    lags = np.arange(len(ac)) / fr
    sel = np.where((lags > 3.0) & (lags < 4.3))[0]
    k = sel[np.argmax(ac[sel])]
    y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
    bar = (k + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)) / fr
    # The groove comes in on the first bar whose bass is within 6 dB of the groove's typical level.
    per_bar = [20 * np.log10(np.sqrt(np.mean(low[int(k * bar * SR) : int((k + 1) * bar * SR)] ** 2)) + 1e-9) for k in range(int(55 / bar))]
    groove = np.median([v for k, v in enumerate(per_bar) if k * bar >= 30])
    entry_bar = next(k for k, v in enumerate(per_bar) if k > 1 and v > groove - 6)
    return bar, entry_bar


def piece(x, t0, t1):
    return x[int(round(t0 * SR)) : int(round(t1 * SR))].copy()


def splice(parts, xf=0.04):
    """Joins (film start, audio) parts: each laid at its film time, with an equal-power crossfade where two meet."""
    out = np.zeros((int((LENGTH + 6) * SR), 2))
    n = int(xf * SR)
    up = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
    for i, (at, a) in enumerate(parts):
        a = a.copy()
        if i > 0:
            a[:n] *= up
        if i < len(parts) - 1:
            a[-n:] *= up[::-1]
            a = np.vstack([a, np.zeros((0, 2))])
        j = int(round(at * SR))
        out[j : j + len(a)] += a
    return out[: int(LENGTH * SR)]


def fit(x, bar, entry_bar):
    G = entry_bar * bar  # the groove's entrance, in the track
    groove_start = RETURN - bar - 8 * bar  # film time the first groove bar lands
    intro = piece(x, G - 3 * bar, G + 8 * bar)  # intro's last 3 bars + 8 bars of groove, continuous in the track
    intro_at = groove_start - 3 * bar
    quiet = piece(x, G - bar, G + 2 * bar)  # the intro's last bar, then the entrance and 2 bars (continuous)
    quiet_at = RETURN - bar
    ending_from = 15 * bar  # the track's own last bars
    ending = piece(x, ending_from, len(x) / SR)
    ending_at = RETURN + 2 * bar
    # The thinning: over the groove block's last bar, down 14 dB and closing to a low-pass at 400 Hz.
    t = (np.arange(len(intro)) / SR) + intro_at
    w = np.clip((t - (RETURN - 2 * bar)) / bar, 0, 1)[:, None] ** 1.5
    intro = intro * (1 - w) + lowpass(intro, 400, 2) * w
    intro = intro * db(np.interp(t, [0, RETURN - 2 * bar, RETURN - bar - 0.05], [0, 0, -14]))[:, None]
    # The quiet bar 10 dB down, back to full on the entrance at 47.0 (a 40 ms ramp just before the downbeat).
    tq = np.arange(len(quiet)) / SR + quiet_at
    quiet = quiet * db(np.interp(tq, [0, RETURN - 0.04, RETURN, 100], [-10, -10, 0, 0]))[:, None]
    film = splice([(intro_at, intro), (quiet_at, quiet), (ending_at, ending)])
    film[: int(MUSIC_FROM * SR)] = 0
    n_in = int(0.4 * SR)
    a = int(MUSIC_FROM * SR)
    film[a : a + n_in] *= np.linspace(0, 1, n_in)[:, None]
    n_out = int(0.9 * SR)
    film[-n_out:] *= np.cos(np.linspace(0, np.pi / 2, n_out))[:, None]
    return film, {
        "bar_s": round(bar, 4), "bpm": round(240 / bar, 2), "groove_enters_track_s": round(G, 3), "groove_enters_bar": entry_bar + 1,
        "film_from_track": [
            {"film": [round(max(intro_at, MUSIC_FROM), 2), round(RETURN - bar, 2)], "track": [round(G - 3 * bar + max(0, MUSIC_FROM - intro_at), 2), round(G + 8 * bar, 2)], "note": "intro's last bars into 8 bars of groove; the last bar fades 14 dB and closes to 400 Hz"},
            {"film": [round(RETURN - bar, 2), round(RETURN + 2 * bar, 2)], "track": [round(G - bar, 2), round(G + 2 * bar, 2)], "note": "the intro's last bar 10 dB down, then the groove's entrance at 47.0 and 2 bars"},
            {"film": [round(ending_at, 2), LENGTH], "track": [round(ending_from, 2), round(ending_from + LENGTH - ending_at, 2)], "note": "the track's own ending, cut at 60 s with a 0.9 s fade"},
        ],
    }


def fit15(x, bar, entry_bar):
    """The 15 s cut (music from 3.0 s; the garden, tug and bell at 10.0; Mama's hand at 11.0; the mark 12.3; end 15):
      3.0          the groove's own entrance, then 8 beats of groove; the last half beat fades and closes down
      ~10.1–11.0   the intro's last beat, 10 dB down, the bell on top
      11.0         the track's bar 16 in full, its own ending (in track 3 a last hit about 13.7 s), cut at 15.0
    Every edit falls on the track's own beat or bar lines."""
    length = 15.0
    beat = bar / 4
    G = entry_bar * bar
    ret = 11.0
    groove_at = 3.0
    groove = piece(x, G, G + 8 * beat)
    quiet_at = groove_at + 8 * beat
    quiet = piece(x, G - (ret - quiet_at), G)
    ending = piece(x, 15 * bar, len(x) / SR)
    t = np.arange(len(groove)) / SR + groove_at
    w = np.clip((t - (quiet_at - beat / 2)) / (beat / 2), 0, 1)[:, None] ** 1.5
    groove = groove * (1 - w) + lowpass(groove, 400, 2) * w
    groove = groove * db(np.interp(t, [0, quiet_at - beat / 2, quiet_at - 0.03], [0, 0, -12]))[:, None]
    quiet = quiet * db(-10)
    out = np.zeros((int((length + 6) * SR), 2))
    n = int(0.04 * SR)
    up = np.sin(np.linspace(0, np.pi / 2, n))[:, None]
    for i, (at, a) in enumerate(((groove_at, groove), (quiet_at, quiet), (ret, ending))):
        a = a.copy()
        if i:
            a[:n] *= up
        if i < 2:
            a[-n:] *= up[::-1]
        j = int(round(at * SR))
        out[j : j + len(a)] += a
    out = out[: int(length * SR)]
    out[: int(groove_at * SR)] = 0
    n_out = int(0.6 * SR)
    out[-n_out:] *= np.cos(np.linspace(0, np.pi / 2, n_out))[:, None]
    return out


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR
    report = {}
    for src in sorted(glob.glob(os.path.join(folder, "owner-eleven-*.mp3"))):
        n = os.path.splitext(os.path.basename(src))[0].split("-")[-1]
        x = decode(src)
        bar, entry = bar_and_entry(x)
        film, info = fit(x, bar, entry)
        path = os.path.join(ROOT, "audio", "out", f"music-60-eleven-owner-{n}.wav")
        sf.write(path, film.astype("float32"), SR)
        now, _ = lufs(path)
        film = film * db(TARGET_LUFS - now)
        peak = np.abs(film).max()
        if peak > 0.89:
            film *= 0.89 / peak
        sf.write(path, film.astype("float32"), SR)
        short = fit15(x, bar, entry)
        p15 = os.path.join(ROOT, "audio", "out", f"music-15-eleven-owner-{n}.wav")
        sf.write(p15, short.astype("float32"), SR)
        now15, _ = lufs(p15)
        short = short * db(TARGET_LUFS - now15)
        if np.abs(short).max() > 0.89:
            short *= 0.89 / np.abs(short).max()
        sf.write(p15, short.astype("float32"), SR)
        info["cut_15"] = {"groove_from_track": [round(entry * bar, 2), round(entry * bar + 8 * bar / 4, 2)], "film": "3.0 groove entrance; quiet beat to 11.0; track bar 16 from 11.0 to 15.0"}
        info["source"] = os.path.basename(src)
        info["lufs"] = lufs(path)[0]
        report[f"eleven-owner-{n}"] = info
        print(f"owner-eleven-{n}: bar {bar:.4f} s ({240 / bar:.1f} bpm), groove enters at bar {entry + 1} ({entry * bar:.2f} s) → {os.path.relpath(path, ROOT)} ({info['lufs']:.1f} LUFS)", flush=True)
    json.dump(report, open(os.path.join(ROOT, "audio", "out", "eleven-owner-edits.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
