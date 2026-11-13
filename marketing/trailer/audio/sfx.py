"""The film's sound effects and the garden's air, all computed (audio/music/dsp.py): nothing recorded, nothing sampled.

The hook's questions pop faster and faster over a rising unease, and stop
dead. Taps, a camera shutter and soft chimes follow the phones. The child's
call is three notes on a small bell. The one notification is the only
alert in the film, and it is heard in near silence.

Reads audio/out/cues.json (written by audio/cues.mjs from the film's own
timings) and writes audio/out/sfx-<cut>.wav and audio/out/air-<cut>.wav.
  python audio/sfx.py
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "audio", "music"))
from dsp import SR, TWO_PI, Bus, bandpass, bell, db, fade, highpass, hz, lowpass, pan, reverb, rng, thud, tine


def pop(pitch, vel=0.6):
    """A question landing: a small, round knock."""
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    f = pitch * (1 + 0.7 * np.exp(-t / 0.011))
    body = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.032)
    click = highpass(rng.standard_normal(n), 2500) * np.exp(-t / 0.0035) * 0.22
    return (body + click) * vel * 0.5


def unease(dur):
    """Under the pile: air and three rising tones, trembling faster as they climb."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    noise = rng.standard_normal((n, 2))
    out = np.zeros((n, 2))
    steps = 30
    for i in range(steps):
        a, b = int(n * i / steps), int(n * (i + 1) / steps)
        centre = 260 * (3600 / 260) ** ((i + 1) / steps)
        seg = bandpass(noise[max(0, a - 3000) : b], centre * 0.6, centre * 1.5)
        out[a:b] = seg[-(b - a) :]
    out *= (u**2.2)[:, None] * 0.55
    tones = np.zeros(n)
    for f0 in (164.8, 220.0, 311.1):
        f = f0 * 2 ** (u * 1.25)
        tones += np.sin(TWO_PI * np.cumsum(f) / SR)
    tremble = 0.6 + 0.4 * np.sin(TWO_PI * np.cumsum(7 + 13 * u) / SR)
    tones = lowpass(tones * tremble, 2400) * u**1.8 * 0.2
    rumble = np.sin(TWO_PI * 58 * t) * u**2 * 0.14
    return out + pan(tones + rumble, 0.0)


def impact():
    """The last one lands on everything."""
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    low = np.pad(thud(1.0, 130, 34, 0.34), (0, max(0, n - int(0.59 * SR))))[:n]
    crack = lowpass(rng.standard_normal(n), 1400) * np.exp(-t / 0.05) * 0.55
    return (low * 1.3 + crack) * 0.9


def exhale(dur=0.6):
    """Everything letting go."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    out = np.zeros((n, 2))
    steps = 20
    for i in range(steps):
        a, b = int(n * i / steps), int(n * (i + 1) / steps)
        seg = lowpass(noise[max(0, a - 2000) : b], 2800 * (260 / 2800) ** ((i + 1) / steps))
        out[a:b] = seg[-(b - a) :]
    env = (1 - t / dur) ** 1.6 * (1 - np.exp(-t / 0.04))
    return out * env[:, None] * 0.24


def tick(vel=0.5):
    """A finger on glass."""
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    x = np.sin(TWO_PI * 1900 * t) * np.exp(-t / 0.005) * 0.5 + bandpass(rng.standard_normal(n), 900, 3200) * np.exp(-t / 0.004) * 0.5
    return x * vel * 0.5


def whoosh(dur=0.5, vel=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    steps = 16
    for i in range(steps):
        a, b = int(n * i / steps), int(n * (i + 1) / steps)
        centre = 500 + 2200 * np.sin(np.pi * (i + 0.5) / steps)
        seg = bandpass(noise[max(0, a - 2000) : b], centre * 0.6, centre * 1.6)
        out[a:b] = seg[-(b - a) :]
    out *= np.sin(np.pi * u) ** 2 * vel * 0.3
    angle = (u * 1.4 - 0.7 + 1) * np.pi / 4
    return np.stack([out * np.cos(angle), out * np.sin(angle)], axis=1)


def shutter():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for at, g in ((0.0, 1.0), (0.068, 0.7)):
        i = int(at * SR)
        m = n - i
        tt = np.arange(m) / SR
        x[i:] += bandpass(rng.standard_normal(m), 1800, 7000) * np.exp(-tt / 0.007) * g
        x[i:] += np.sin(TWO_PI * 190 * tt) * np.exp(-tt / 0.012) * 0.5 * g
    return x * 0.3


def notes(names, gap, vel=0.5, kind=bell, ring=2.2):
    """A few notes in a row."""
    n = int((gap * len(names) + ring + 0.2) * SR)
    x = np.zeros(n)
    for i, name in enumerate(names):
        s = kind(hz(name), ring, vel)
        a = int(i * gap * SR)
        x[a : a + len(s)] += s[: n - a]
    return x


def typing(dur):
    n = int(dur * SR) + SR // 10
    x = np.zeros(n)
    at = 0.0
    while at < dur:
        s = tick(rng.uniform(0.1, 0.24))
        a = int(at * SR)
        x[a : a + len(s)] += s[: n - a]
        at += rng.uniform(0.05, 0.11)
    return x


def power_down():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 330 * 2 ** (-t / 0.45)
    return np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.01)) * 0.25


def garden(dur, dusk_from=None):
    """The garden's air: a little wind in the palms, a few birds, crickets as the light goes."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    wind = lowpass(rng.standard_normal((n, 2)), 420)
    gust = 0.6 + 0.4 * np.sin(TWO_PI * 0.11 * t + 1.0) * np.sin(TWO_PI * 0.047 * t)
    leaves = bandpass(rng.standard_normal((n, 2)), 2200, 5200) * (0.35 + 0.65 * np.clip(np.sin(TWO_PI * 0.17 * t + 2.0), 0, 1))[:, None]
    out = wind * gust[:, None] * 0.5 + leaves * 0.05
    at = rng.uniform(0.3, 1.2)
    while at < dur - 0.6:
        f0 = rng.uniform(2600, 3900)
        p = rng.uniform(-0.8, 0.8)
        g = rng.uniform(0.25, 0.6)
        for k in range(rng.integers(1, 4)):
            m = int(rng.uniform(0.07, 0.13) * SR)
            tt = np.arange(m) / SR
            f = f0 * (1 + 0.22 * np.sin(np.pi * tt / (m / SR))) * (1 + 0.05 * k)
            chirp = np.sin(TWO_PI * np.cumsum(f) / SR) * np.sin(np.pi * tt / (m / SR)) ** 2 * (0.6 + 0.4 * np.sin(TWO_PI * 34 * tt))
            a = int((at + k * 0.16) * SR)
            if a + m < n:
                out[a : a + m] += pan(chirp * g * 0.5, p)
        at += rng.uniform(1.3, 3.6)
    if dusk_from is not None and dusk_from < dur:
        crickets = np.sin(TWO_PI * 4350 * t) * (np.sin(TWO_PI * 15.5 * t) > 0.2) * (np.sin(TWO_PI * 0.9 * t) > -0.3)
        rise = np.clip((t - dusk_from) / 3.0, 0, 1)
        out += pan(lowpass(crickets, 6000) * rise * 0.045, 0.3)
    return out * fade(int(0.25 * SR), int(0.6 * SR), n)[:, None]


def build(cut, c):
    length = c["length"]
    fx = Bus(length + 3)  # the hook and the phones: close and dry
    ring = Bus(length + 3)  # bells and chimes: with the room
    air = Bus(length + 3)

    # --- the hook ----------------------------------------------------------
    pops = c["pops"]
    for i, at in enumerate(pops):
        fx.add(pop(430 * 2 ** (0.045 * i) * rng.uniform(0.97, 1.03), 0.4 + 0.5 * i / len(pops)), at, p=rng.uniform(-0.7, 0.7))
    start = pops[1]
    fx.add(unease(c["slam"] - start), start, 0.9)
    fx.add(impact(), c["slam"], 1.0)
    # Everything under the pile stops with the last landing: the silence after it is the hook's point.
    fx.add(exhale(), c["fall"], 1.0)

    # --- the child's call ---------------------------------------------------
    ring.add(notes(["A5", "A5", "C#6"], 1 / 3, 0.42), c["call"][0], 0.8, p=-0.2)
    if c["call"][1] is not None:
        ring.add(notes(["A5", "A5", "C#6"], 1 / 3, 0.6, ring=2.6), c["call"][1], 1.0, p=-0.2)

    # --- the phones ---------------------------------------------------------
    for at in c["taps"]:
        fx.add(tick(0.55), at, p=0.1)
    for a, b in c["typing"]:
        fx.add(typing(b - a), a, 0.8, p=0.1)
    for at in c["cards"]:
        ring.add(notes(["F#5", "A5"], 0.05, 0.4, kind=tine, ring=1.0), at, 0.9, p=0.1)
    for at in c["saved"]:
        ring.add(notes(["D6", "A6"], 0.085, 0.36, kind=tine, ring=1.1), at, 0.9, p=0.1)
    for at in c["shutters"]:
        fx.add(shutter(), at, 0.9, p=0.1)
    for at in c["whooshes"]:
        fx.add(whoosh(0.55, 0.5), at - 0.2, 0.8)
    if c["arrive"] is not None:
        ring.add(notes(["A6", "D7", "F#7"], 0.055, 0.28, ring=1.4), c["arrive"] - 0.05, 0.8, p=0.4)
    if c["kakak"] is not None:
        fx.add(thud(0.5, 110, 60, 0.12), c["kakak"], 0.6)
    if c["sleep"] is not None:
        fx.add(power_down(), c["sleep"], 0.7)
    if c["ping"] is not None:
        # The one notification: two soft notes, a major third, left to ring.
        ring.add(notes(["F#6", "A6"], 0.13, 0.55, ring=2.6), c["ping"], 1.0, p=0.0)

    # --- the garden's air: under the hook, and again when the phone falls away ----
    hook_air = garden(c["slam"] + 0.1)
    air.add(hook_air, c["garden"][0])
    back = c["garden"][1]
    air.add(garden(length - back, dusk_from=(c["mark"] - back - 3.0)), back)

    fx_out = reverb(fx.x, 1.0, 0.06)[: int(length * SR)]
    ring_out = reverb(ring.x, 2.6, 0.4)[: int(length * SR)]
    return fx_out * db(-6.0) + ring_out * db(-4.0), air.x[: int(length * SR)] * db(-18.0)


if __name__ == "__main__":
    cues = json.load(open(os.path.join(ROOT, "audio", "out", "cues.json")))
    for cut in ("60", "15"):
        sfx, air = build(cut, cues[cut])
        sf.write(os.path.join(ROOT, "audio", "out", f"sfx-{cut}.wav"), sfx.astype("float32"), SR)
        sf.write(os.path.join(ROOT, "audio", "out", f"air-{cut}.wav"), air.astype("float32"), SR)
        print(f"wrote sfx-{cut}.wav (peak {20 * np.log10(np.abs(sfx).max() + 1e-9):.1f} dB) and air-{cut}.wav (rms {20 * np.log10(np.sqrt(np.mean(air ** 2)) + 1e-9):.1f} dB)")
