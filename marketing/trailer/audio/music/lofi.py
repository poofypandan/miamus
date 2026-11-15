"""The trailer's lo-fi alternative (v13-lofi): four original candidates in D major, composed here and computed from
sine waves, plucked delay lines and noise, like the lullaby in score.py. Nothing is a recording, a sample or an
imitation of anyone's song; every note was written for this film.

The arc follows v13's composed cues (the voices and effects stay where they are):
  0–5 s     silent (the hook has its own sound)
  5 s       a gentle intro: chords, a pad, the record's dust
  ~15 s     the groove, as the cards begin
  ~39–43 s  it thins, bar by bar
  43–46 s   almost nothing: the girl's three-note bell (sfx.py, 45.2 s) sounds on top
  47.0 s    the whole groove at once, on Kakak's "That one's yours." (a downbeat in every candidate)
  57.0 s    a soft resolve on D with the end card, ringing out to 60.0 s

Each tempo is chosen so that a bar line falls on 47.0 s and the resolve at 57.0 s lands on a beat or an off-beat push:
  A  84 bpm  Rhodes chords and a Rhodes melody, round bass, dusty boom-bap, swung 16ths, worn tape
  B  87 bpm  analog synth pad and a gliding square lead, plucky synth bass, crisp straight drums, clean tape
  C  90 bpm  clean guitar answering an electric piano, laid-back bass, heavy swing, the dustiest record
  D  93 bpm  space-funk: syncopated synth bass, a soft arpeggio, chorused pad, 16th hats, bright tape

  python audio/music/lofi.py          all four → audio/out/music-60-lofi-<a|b|c|d>.wav
  python audio/music/lofi.py b        one of them
"""
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, TWO_PI, Bus, _stack, bandpass, db, fade, highpass, hz, lowpass, pan, reverb, ride, soft_limit

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LENGTH = 60.0
MUSIC_FROM = 5.0
RETURN = 47.0  # the downbeat where everything comes back
RESOLVE = 57.0  # the end card
GROOVE_FROM = 14.9  # the first bar line at or after this starts the groove
TARGET_LUFS = -18.5

# ------------------------------------------------------------------ the instruments


class Kit:
    """All the sounds, with their own random source so each candidate is repeatable."""

    def __init__(self, seed):
        self.r = np.random.default_rng(seed)

    def noise(self, n):
        return self.r.standard_normal(n)

    # --- drums ---------------------------------------------------------------

    def kick(self, vel=0.8, punch=1.0, dusty=0.0):
        n = int(0.55 * SR)
        t = np.arange(n) / SR
        f = 46 + 104 * np.exp(-t / 0.032)
        body = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / (0.2 + 0.08 * punch))
        click = bandpass(self.noise(n), 900, 5000) * np.exp(-t / 0.0025) * 0.22 * punch
        x = np.tanh((body + click) * (1.4 + 0.6 * punch)) * (1 - np.exp(-t / 0.0008))
        if dusty:
            x = lowpass(x, 2600 - 1400 * dusty)
        return x * vel * 0.75

    def snare(self, vel=0.7, snap=1.0, dusty=0.0, clap=0.0):
        n = int(0.45 * SR)
        t = np.arange(n) / SR
        body = (np.sin(TWO_PI * 186 * t) * 0.8 + np.sin(TWO_PI * 331 * t) * 0.35) * np.exp(-t / 0.055)
        wires = bandpass(self.noise(n), 1100, 7500 - 3500 * dusty) * np.exp(-t / (0.11 + 0.05 * dusty)) * (0.7 + 0.5 * snap)
        x = body + wires
        if clap:
            c = np.zeros(n)
            for k, ms in enumerate((0, 9, 19, 31)):
                i = int(ms * SR / 1000)
                tail = 0.14 if k == 3 else 0.007
                c[i:] += bandpass(self.noise(n - i), 900, 4200) * np.exp(-t[: n - i] / tail) * (1.0 if k == 3 else 0.7)
            x = x * (1 - 0.5 * clap) + c * clap * 0.9
        x *= 1 - np.exp(-t / 0.0007)
        return np.tanh(x * 1.3) * vel * 0.5

    def rim(self, vel=0.5):
        n = int(0.12 * SR)
        t = np.arange(n) / SR
        x = np.sin(TWO_PI * 820 * t) * np.exp(-t / 0.018) + bandpass(self.noise(n), 1600, 4200) * np.exp(-t / 0.008) * 0.8
        return x * vel * 0.35

    def hat(self, vel=0.5, open_=False, bright=1.0):
        n = int((0.5 if open_ else 0.12) * SR)
        t = np.arange(n) / SR
        metal = np.zeros(n)
        for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
            metal += np.sign(np.sin(TWO_PI * f * 1.42 * t + self.r.uniform(0, TWO_PI)))
        x = metal * 0.12 + self.noise(n) * 0.9
        x = highpass(x, 6200 + 1500 * (bright - 1), 3)
        x = lowpass(x, 9000 + 4000 * bright)
        x *= np.exp(-t / (0.16 if open_ else 0.022)) * (1 - np.exp(-t / 0.0006))
        return x * vel * 0.32

    def crash(self, vel=0.4, dusty=0.0):
        n = int(2.6 * SR)
        t = np.arange(n) / SR
        x = highpass(self.noise(n), 3200, 2) * np.exp(-t / 0.9) * (1 - np.exp(-t / 0.002))
        x = lowpass(x, 11000 - 5000 * dusty)
        return x * vel * 0.14

    def shaker(self, vel=0.4):
        n = int(0.1 * SR)
        t = np.arange(n) / SR
        x = bandpass(self.noise(n), 4500, 10000) * np.exp(-t / 0.018) * (1 - np.exp(-t / 0.006))
        return x * vel * 0.16

    # --- keys ----------------------------------------------------------------

    def rhodes(self, f0, dur, vel=0.5, bark=1.0, release=0.28):
        """A tine electric piano: a sine with a bell-like FM bloom at the attack that fades to a pure, warm hum."""
        ring = 2.6 * (220.0 / f0) ** 0.35
        n = int((dur + release + 0.05) * SR)
        t = np.arange(n) / SR
        index = (0.5 + 1.9 * vel * bark) * np.exp(-t / 0.11) + 0.18 * vel
        ph = TWO_PI * f0 * t + self.r.uniform(0, TWO_PI)
        x = np.sin(ph + index * np.sin(ph))
        x += 0.16 * np.sin(2 * ph) * np.exp(-t / 0.5)
        tine_f = f0 * 6.8
        if tine_f < SR * 0.42:
            x += 0.07 * vel * np.sin(TWO_PI * tine_f * t) * np.exp(-t / 0.015)
        drive = 0.8 + 1.4 * vel * bark
        x = np.tanh(x * drive) / np.tanh(drive)
        env = (1 - np.exp(-t / 0.002)) * (0.6 * np.exp(-t / (0.35 * ring)) + 0.4 * np.exp(-t / ring))
        r = int(dur * SR)
        env[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        return lowpass(x * env, 3200 + 3500 * vel) * (0.3 + 0.7 * vel) * 0.42

    def wurli(self, f0, dur, vel=0.5, release=0.2):
        """A reed electric piano: hollower and a little nasal, with a bite when played harder."""
        n = int((dur + release + 0.05) * SR)
        t = np.arange(n) / SR
        ph = TWO_PI * f0 * t + self.r.uniform(0, TWO_PI)
        index = (0.9 + 1.6 * vel) * np.exp(-t / 0.2) + 0.35
        x = np.sin(ph + index * np.sin(2 * ph) * 0.5)
        x = np.tanh(x * (1.2 + 1.8 * vel))
        env = (1 - np.exp(-t / 0.003)) * np.exp(-t / (1.8 * (220 / f0) ** 0.3))
        r = int(dur * SR)
        env[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        return lowpass(highpass(x * env, 120), 2600 + 2400 * vel) * (0.3 + 0.7 * vel) * 0.36

    # --- synths --------------------------------------------------------------

    def _filtered(self, f0, n, cutoff, odd=False, harmonics=48, res=0.0):
        """A saw (or square) through a two-pole low-pass whose cutoff moves (an array per sample)."""
        t = np.arange(n) / SR
        ph = TWO_PI * f0 * t + self.r.uniform(0, TWO_PI)
        x = np.zeros(n)
        for k in range(1, harmonics + 1):
            if odd and k % 2 == 0:
                continue
            fk = k * f0
            if fk > SR * 0.42:
                break
            ratio = fk / cutoff
            g = 1 / np.sqrt(1 + ratio**4)
            if res:
                g = g * (1 + res * np.exp(-((ratio - 1) ** 2) / 0.08))
            x += g * np.sin(k * ph) / k
        return x

    def synth_bass(self, f0, dur, vel=0.7, bright=1.0, square=False, release=0.06):
        n = int((dur + release + 0.02) * SR)
        t = np.arange(n) / SR
        cutoff = 150 + bright * (300 + 1500 * vel) * np.exp(-t / 0.09)
        x = self._filtered(f0, n, cutoff, odd=square, harmonics=40, res=0.5 * bright)
        x += 0.55 * np.sin(TWO_PI * f0 * t)
        env = (1 - np.exp(-t / 0.003)) * (0.7 + 0.3 * np.exp(-t / 0.2))
        r = int(dur * SR)
        env[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        return np.tanh(x * env * 1.6) * vel * 0.55

    def round_bass(self, f0, dur, vel=0.7, release=0.08):
        """A fingered electric bass: round, a little thumb at the start."""
        n = int((dur + release + 0.02) * SR)
        t = np.arange(n) / SR
        cutoff = 260 + 900 * vel * np.exp(-t / 0.05)
        x = self._filtered(f0, n, cutoff, harmonics=24) + 0.8 * np.sin(TWO_PI * f0 * t)
        x += bandpass(self.noise(n), 300, 1500) * np.exp(-t / 0.006) * 0.12
        env = (1 - np.exp(-t / 0.004)) * (0.55 + 0.45 * np.exp(-t / 0.35))
        r = int(dur * SR)
        env[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        return np.tanh(x * env * 1.4) * vel * 0.55

    def square_lead(self, f0, dur, vel=0.5, glide_from=None, release=0.14):
        n = int((dur + release + 0.02) * SR)
        t = np.arange(n) / SR
        f = np.full(n, f0)
        if glide_from:
            f = f0 + (glide_from - f0) * np.exp(-t / 0.035)
        vib = 0.0045 * np.clip((t - 0.25) / 0.4, 0, 1) * np.sin(TWO_PI * 5.4 * t)
        ph = TWO_PI * np.cumsum(f * (1 + vib)) / SR + self.r.uniform(0, TWO_PI)
        x = np.zeros(n)
        for k in (1, 3, 5, 7, 9, 11):
            x += np.sin(k * ph) / k * (0.85 ** (k - 1))
        x += 0.25 * np.sin(2 * ph) * 0.5  # a touch of pulse-width colour
        env = (1 - np.exp(-t / 0.012)) * (0.75 + 0.25 * np.exp(-t / 0.3))
        r = int(dur * SR)
        env[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        return lowpass(x * env, 2400 + 1200 * vel) * vel * 0.32

    def blip(self, f0, vel=0.4, length=0.22):
        """A soft square pluck for the arpeggio."""
        n = int((length + 0.05) * SR)
        t = np.arange(n) / SR
        cutoff = 500 + 3200 * np.exp(-t / 0.05)
        x = self._filtered(f0, n, cutoff, odd=True, harmonics=15)
        return x * (1 - np.exp(-t / 0.002)) * np.exp(-t / (length / 3)) * vel * 0.5

    def analog_pad(self, f0, dur, vel=0.4, attack=0.9, release=1.4, bright=1.0):
        n = int((dur + release) * SR)
        x = _stack(f0, n, 6, 16, 22, 1.05)
        t = np.arange(n) / SR
        lfo = 0.5 + 0.5 * np.sin(TWO_PI * 0.11 * t + self.r.uniform(0, TWO_PI))
        dark = lowpass(x, 900 * bright)
        light = lowpass(x, 2600 * bright)
        x = dark * (1 - lfo[:, None] * 0.6) + light * lfo[:, None] * 0.6
        x = highpass(x, 160)
        return x * fade(int(attack * SR), int(release * SR), n)[:, None] * vel * 0.4

    def warm_pad(self, f0, dur, vel=0.4, attack=1.0, release=1.6):
        n = int((dur + release) * SR)
        x = _stack(f0, n, 6, 9, 10, 1.6)
        x = highpass(lowpass(x, 700 + 1200 * vel), 150)
        return x * fade(int(attack * SR), int(release * SR), n)[:, None] * vel * 0.5

    # --- the guitar ------------------------------------------------------------

    def guitar(self, f0, dur, vel=0.6, bright=0.6, ring=2.2, release=0.12):
        """A clean electric guitar: a plucked string (a tuned delay line that loses a little high end each pass)."""
        n = int((dur + release + 0.05) * SR)
        period = SR / f0
        N = int(np.floor(period - 0.5 - 0.1))
        d = period - N - 0.5  # the rest, from an all-pass, so the string is in tune
        c = (1 - d) / (1 + d)
        g = 10 ** (-3 / (f0 * ring))
        # H(z) = (1 + c z^-1) / ((1 + c z^-1) - g/2 (1 + z^-1)(c + z^-1) z^-N)
        num = np.array([1.0, c])
        loop = 0.5 * g * np.convolve([1.0, 1.0], [c, 1.0])
        den = np.zeros(N + 3)
        den[0], den[1] = 1.0, c
        den[N : N + 3] -= loop
        burst = self.noise(N)
        burst = lowpass(burst, 1200 + 5000 * bright * vel)
        pick = int(N * 0.18)  # plucked near the bridge
        exc = np.zeros(n)
        exc[:N] = burst
        exc[pick : pick + N] -= burst * 0.6
        x = lfilter(num, den, exc)
        t = np.arange(n) / SR
        r = int(dur * SR)
        x[r:] *= np.exp(-(t[r:] - dur) / (release / 3))
        x = highpass(x, 100)
        x = x + 0.25 * bandpass(x, 2200, 4200)
        peak = np.abs(x).max() + 1e-9
        return x / peak * vel * 0.38

    # --- the record and the tape ----------------------------------------------------

    def vinyl(self, seconds, dust=1.0, hiss=1.0):
        n = int(seconds * SR)
        out = np.zeros(n)
        count = int(seconds * (6 + 22 * dust))
        at = self.r.integers(0, n - 200, count)
        amp = self.r.pareto(2.2, count) * 0.08 + 0.02
        for i, a in zip(at, amp):
            k = self.r.integers(8, 60)
            out[i : i + k] += a * np.exp(-np.arange(k) / (k / 4)) * self.r.choice([-1, 1])
        crackle = highpass(out, 900)
        pops = np.zeros(n)
        for i in self.r.integers(0, n - 2000, int(seconds * 0.6 * dust)):
            k = 600
            pops[i : i + k] += self.r.uniform(0.15, 0.4) * np.exp(-np.arange(k) / 90) * np.sin(np.arange(k) * 0.09)
        pops = lowpass(pops, 2500)
        air = bandpass(self.noise(n), 1800, 9000) * 0.012 * hiss
        rumble = lowpass(self.noise(n), 40) * 0.25 * dust
        mono = crackle * 0.6 + pops * 0.5 + air + rumble
        side = highpass(self.noise(n), 3000) * 0.004 * hiss
        return np.stack([mono + side, mono - side], axis=1)


def chorus(x, rate=0.6, depth_ms=2.4, base_ms=9.0, mix=0.45):
    """A slowly moving copy of the sound, a little late, opposite in each ear."""
    n = len(x)
    t = np.arange(n) / SR
    out = x.copy()
    for ch, phase in ((0, 0.0), (1, np.pi / 2)):
        delay = (base_ms + depth_ms * np.sin(TWO_PI * rate * t + phase)) * SR / 1000
        out[:, ch] = x[:, ch] * (1 - mix * 0.5) + np.interp(np.arange(n) - delay, np.arange(n), x[:, ch]) * mix
    return out


def echo(x, seconds, feedback=0.35, taps=4, tone=3500, spread=0.5):
    """A tape echo: repeats, each darker, bouncing left and right."""
    out = x.copy()
    d = int(seconds * SR)
    rep = x
    for k in range(1, taps + 1):
        rep = lowpass(rep, tone) * feedback
        shifted = np.zeros_like(x)
        shifted[d * k :] = rep[: len(x) - d * k]
        if k % 2:
            shifted = shifted[:, ::-1] * np.array([1 - spread * 0.3, 1.0])
        out += shifted
    return out


def autopan(x, rate=4.2, depth=0.3):
    t = np.arange(len(x)) / SR
    m = depth * np.sin(TWO_PI * rate * t)
    return np.stack([x[:, 0] * (1 - m), x[:, 1] * (1 + m)], axis=1)


def tape(x, wow=1.0, flutter=1.0, top=9000, drive=1.0, seed=3):
    """The finished mix on a worn cassette: the speed wanders a little, the top end is softer, peaks round off."""
    r = np.random.default_rng(seed)
    n = len(x)
    t = np.arange(n) / SR
    drift = 0.55 * wow * np.sin(TWO_PI * 0.53 * t + r.uniform(0, TWO_PI)) + 0.3 * wow * np.sin(TWO_PI * 0.21 * t + r.uniform(0, TWO_PI))
    flut = 0.04 * flutter * np.sin(TWO_PI * 6.7 * t + r.uniform(0, TWO_PI))
    delay = (4.0 + drift + flut) * SR / 1000
    idx = np.arange(n) - delay
    y = np.stack([np.interp(idx, np.arange(n), x[:, c]) for c in (0, 1)], axis=1)
    y = np.tanh(y * (1.0 + 0.6 * drive)) / (1.0 + 0.6 * drive) * 1.25
    return lowpass(highpass(y, 32), top)


# -------------------------------------------------------------------- the harmony

# name: (bass root, quality, the electric piano's voicing). Quality picks the bass's seventh (a sixth on major chords).
CHORDS = {
    "Dmaj9": ("D2", "maj", ["F#3", "A3", "C#4", "E4"]),
    "D6/9": ("D2", "maj", ["F#3", "B3", "E4", "A4"]),
    "Bm9": ("B1", "min", ["D3", "F#3", "A3", "C#4"]),
    "Bm7": ("B1", "min", ["D3", "F#3", "A3", "D4"]),
    "Gmaj9": ("G1", "maj", ["F#3", "A3", "B3", "D4"]),
    "Gmaj7": ("G1", "maj", ["F#3", "B3", "D4", "G4"]),
    "F#m7": ("F#1", "min", ["E3", "A3", "C#4", "E4"]),
    "Em9": ("E2", "min", ["D3", "G3", "B3", "F#4"]),
    "A13": ("A1", "dom", ["G3", "B3", "C#4", "F#4"]),
    "A13sus": ("A1", "dom", ["G3", "B3", "D4", "F#4"]),
    "A6": ("A1", "maj", ["F#3", "A3", "C#4", "E4"]),
    "Asus2": ("A1", "sus", ["E3", "A3", "B3", "E4"]),
    # Round 2 (the owner's measured reference: C major, dark, slow).
    "Cmaj9": ("C2", "maj", ["E3", "G3", "B3", "D4"]),
    "Am9": ("A1", "min", ["C3", "E3", "G3", "B3"]),
    "Fmaj9": ("F1", "maj", ["E3", "G3", "A3", "C4"]),
    "Em7": ("E2", "min", ["D3", "G3", "B3", "E4"]),
    "Dm9": ("D2", "min", ["C3", "F3", "A3", "E4"]),
    "G13": ("G1", "dom", ["F3", "A3", "B3", "E4"]),
    "G13sus": ("G1", "dom", ["F3", "A3", "C4", "E4"]),
    "Gq": ("G1", "dom", ["D3", "G3", "B3", "D4"]),  # under the girl's bell in C (G G B)
}
SEVENTH = {"maj": 9, "min": 10, "dom": 10, "sus": 10}


def shift(note_hz, semis):
    return note_hz * 2 ** (semis / 12)


# ----------------------------------------------------------------- the candidates

STYLES = {
    "a": {
        "name": "Rhodes 84, dusty",
        "bpm": 84, "swing": 0.57, "seed": 841,
        "intro": ["Dmaj9", "Bm9"],
        "groove": ["Gmaj9", "F#m7", "Em9", "A13"],
        "home": ["Dmaj9", "Bm9", "Em9", "A13sus"],
        "keys": "rhodes", "lead": "rhodes", "bass": "round", "pad": "warm",
        "kick": [0, 7, 10], "kick_alt": [0, 3, 7, 10], "snare": [4, 12], "ghost": [11, 15],
        "hats": [0, 2, 4, 6, 8, 10, 12, 14], "open": [], "hat_bright": 0.8,
        "bassline": [(0, 4, 0, 0.9), (6, 2, 0, 0.55), (8, 3, 7, 0.75), (11, 1, 12, 0.5), (12, 2, "7", 0.6), (14, 2, "n", 0.6)],
        "comp": [(0, 3.0, 0.5), (3.5, 0.45, 0.32)],
        "dusty": 0.6, "vinyl": 1.0, "hiss": 1.0, "wow": 1.2, "top": 8200, "drive": 1.1,
        "guitar": 0.35, "arp": 0.0,
    },
    "b": {
        "name": "Synth 87, clean",
        "bpm": 87, "swing": 0.5, "seed": 872,
        "intro": ["D6/9", "Gmaj7"],
        "groove": ["Gmaj7", "A6", "F#m7", "Bm9"],
        "home": ["D6/9", "Bm9", "Em9", "A13"],
        "keys": "rhodes", "lead": "square", "bass": "synth", "pad": "analog",
        "kick": [0, 8, 10], "kick_alt": [0, 6, 8, 10], "snare": [4, 12], "ghost": [],
        "hats": list(range(16)), "open": [14], "hat_bright": 1.25,
        "bassline": [(0, 2, 0, 0.95), (3, 1, 12, 0.6), (6, 2, 12, 0.7), (8, 2, 7, 0.8), (10, 1, "7", 0.6), (11, 1, 12, 0.7), (13, 1, 7, 0.55), (14, 2, "n", 0.7)],
        "comp": [(1.5, 0.4, 0.36), (3.0, 0.4, 0.33)],
        "dusty": 0.0, "vinyl": 0.35, "hiss": 0.5, "wow": 0.4, "top": 13000, "drive": 0.7,
        "guitar": 0.2, "arp": 0.0, "clap": 0.6,
    },
    "c": {
        "name": "Guitar 90, dustiest",
        "bpm": 90, "swing": 0.62, "seed": 903,
        "intro": ["Em9", "A13"],
        "groove": ["Em9", "A13", "Dmaj9", "Bm7"],
        "home": ["Dmaj9", "Bm9", "Em9", "A13sus"],
        "keys": "wurli", "lead": "guitar", "bass": "round", "pad": "warm",
        "kick": [0, 9], "kick_alt": [0, 3, 9], "snare": [4, 12], "ghost": [7, 14],
        "hats": [0, 2, 4, 6, 8, 10, 11, 12, 14], "open": [], "hat_bright": 0.7,
        "bassline": [(0, 6, 0, 0.85), (7, 1, 0, 0.5), (8, 4, 7, 0.7), (12, 2, 12, 0.55), (14, 2, "n", 0.55)],
        "comp": [(0, 1.4, 0.42), (2.5, 1.2, 0.36)],
        "dusty": 1.0, "vinyl": 1.8, "hiss": 1.6, "wow": 1.7, "top": 6800, "drive": 1.4,
        "guitar": 1.0, "arp": 0.0, "laid_back": 0.018,
    },
    "d": {
        "name": "Space-funk 93, bright",
        "bpm": 93, "swing": 0.54, "seed": 934,
        "intro": ["Gmaj9", "A13"],
        "groove": ["Gmaj9", "A13", "F#m7", "Bm9"],
        "home": ["Dmaj9", "Bm9", "Gmaj9", "A13"],
        "keys": "rhodes", "lead": "rhodes_synth", "bass": "synth", "pad": "analog",
        "kick": [0, 3, 6, 10], "kick_alt": [0, 3, 6, 10, 13], "snare": [4, 12], "ghost": [9],
        "hats": list(range(16)), "open": [2, 6, 10, 14], "hat_bright": 1.15,
        "bassline": [(0, 1, 0, 1.0), (2, 1, 12, 0.6), (3, 1, 0, 0.8), (5, 1, 12, 0.55), (6, 2, 7, 0.7), (9, 1, 0, 0.7), (10, 1, 12, 0.65), (11, 1, "7", 0.6), (12, 1, 7, 0.7), (14, 1, "n", 0.7), (15, 1, 12, 0.45)],
        "comp": [(0.5, 0.3, 0.36), (1.75, 0.3, 0.3), (3.0, 0.5, 0.34)],
        "dusty": 0.15, "vinyl": 0.5, "hiss": 0.6, "wow": 0.6, "top": 12000, "drive": 0.9,
        "guitar": 0.0, "arp": 1.0, "clap": 0.8,
    },
}

# The melodies, written for this film: (beat in the bar, length in beats, note, velocity). Beat 0 is the downbeat.
# Every one opens the return at 47.0 s with the girl's call come home (A, A, then D), as the lullaby does.
# Round 2, on the owner's reference measurements (15 Nov): ~68 bpm half-time with double-time hats, C major, very dark
# (85% roll-off ~2.3 kHz, ~96% of the energy below 800 Hz), a deep round funky bass, steady and compressed. Tempos are
# picked so a bar line still falls on 47.0 s and the resolve at 57.0 s sits on a beat or an off-beat.
# Measured like the reference (audio/music/measure_lofi.py: magnitude roll-off and centroid per frame, as medians):
#   E  69 bpm  closest to the reference: dark, Rhodes melody low, the bass up front (resolve on the "and" of 4)
#   F  72 bpm  a touch warmer and brighter, Rhodes and a soft analog pad (resolve on a downbeat)
#   G  75 bpm  the brightest of the three: guitar answering a reed piano, A minor colour (resolve just after a downbeat)
SLOW = {"slow": True, "resolve": ["C3", "G3", "B3", "D4", "E4", "G4"], "resolve_pad": ["C3", "G3", "B3", "E4"], "resolve_bass": "C2", "quiet": "Gq"}
STYLES.update({
    "e": dict(SLOW, **{
        "name": "Dark 69", "dust_db": -7, "bpm": 69, "swing": 0.6, "seed": 695,
        "intro": ["Cmaj9", "Am9"], "groove": ["Fmaj9", "Em7", "Dm9", "G13"], "home": ["Cmaj9", "Am9", "Fmaj9"],
        "keys": "rhodes", "lead": "rhodes", "bass": "round", "pad": "warm",
        "kick": [0, 7, 10], "kick_alt": [0, 7, 10, 11], "snare": [4, 12], "ghost": [3, 14],
        "hats": list(range(16)), "open": [], "hat_bright": 0.6,
        "bassline": [(0, 3, 0, 1.0), (3, 1, 12, 0.5), (4, 2, 0, 0.7), (7, 1, 7, 0.6), (8, 3, 0, 0.85), (11, 1, 12, 0.5), (12, 2, "7", 0.6), (14, 2, "n", 0.65)],
        "comp": [(0, 2.5, 0.46), (2.75, 1.0, 0.34)],
        "dusty": 0.8, "vinyl": 0.9, "hiss": 2.0, "wow": 1.0, "top": 7500, "drive": 1.3,
        "guitar": 0.0, "arp": 0.0, "last": "C5",
        "dark": {"keys_lp": 3000, "lead_lp": 3200, "hat_db": -12.5, "snare_lp": 6000, "snare_db": -6.5, "bass_db": -3.2, "kick_db": -4.5, "keys_db": -4.0, "lead_db": -5.5, "comp": 3.0, "thresh": -26.0},
    }),
    "f": dict(SLOW, **{
        "name": "Warm 72", "dust_db": -8, "bpm": 72, "swing": 0.58, "seed": 726,
        "intro": ["Am9", "Fmaj9"], "groove": ["Am9", "Fmaj9", "Cmaj9", "G13sus"], "home": ["Cmaj9", "Am9", "Dm9"],
        "keys": "rhodes", "lead": "rhodes", "bass": "round", "pad": "analog",
        "kick": [0, 10], "kick_alt": [0, 3, 10], "snare": [4, 12], "ghost": [7, 15],
        "hats": list(range(16)), "open": [14], "hat_bright": 0.75,
        "bassline": [(0, 2, 0, 1.0), (2, 1, 12, 0.5), (3, 3, 0, 0.75), (6, 1, 7, 0.55), (8, 2, 0, 0.85), (10, 1, "7", 0.55), (11, 2, 7, 0.6), (14, 2, "n", 0.65)],
        "comp": [(0, 1.5, 0.42), (1.75, 0.5, 0.3), (2.5, 1.5, 0.38)],
        "dusty": 0.5, "vinyl": 0.8, "hiss": 2.2, "wow": 0.9, "top": 8500, "drive": 1.1,
        "guitar": 0.0, "arp": 0.0, "last": "E5",
        "dark": {"keys_lp": 3400, "lead_lp": 3600, "hat_db": -12.0, "snare_lp": 7000, "snare_db": -6.5, "bass_db": -3.5, "kick_db": -4.5, "keys_db": -4.0, "lead_db": -5.0, "comp": 2.6, "thresh": -26.0},
    }),
    "g": dict(SLOW, **{
        "name": "Brighter 75", "dust_db": -9, "bpm": 75, "swing": 0.62, "seed": 757,
        "intro": ["Am9", "Em7"], "groove": ["Am9", "Em7", "Fmaj9", "G13"], "home": ["Cmaj9", "Am9", "Fmaj9", "G13"],
        "keys": "wurli", "lead": "guitar", "bass": "round", "pad": "warm",
        "kick": [0, 9], "kick_alt": [0, 3, 9], "snare": [4, 12], "ghost": [7, 14],
        "hats": list(range(16)), "open": [], "hat_bright": 0.85,
        "bassline": [(0, 4, 0, 0.95), (6, 1, 0, 0.55), (7, 1, 12, 0.5), (8, 3, 7, 0.75), (12, 2, 12, 0.55), (14, 2, "n", 0.6)],
        "comp": [(0, 1.4, 0.42), (2.5, 1.2, 0.36)],
        "dusty": 0.9, "vinyl": 1.2, "hiss": 2.4, "wow": 1.3, "top": 9500, "drive": 1.2,
        "guitar": 1.0, "arp": 0.0, "last": "G4", "laid_back": 0.016,
        "dark": {"keys_lp": 3800, "lead_lp": 4200, "hat_db": -11.5, "snare_lp": 7500, "snare_db": -6.0, "bass_db": -3.5, "kick_db": -4.5, "keys_db": -4.0, "lead_db": -5.0, "comp": 2.3, "thresh": -26.0},
    }),
})

HOME_TUNE = {
    "a": [
        [(0, 0.5, "A4", 0.62), (0.75, 0.5, "A4", 0.58), (1.5, 1.75, "D5", 0.7), (3.5, 0.5, "E5", 0.55)],
        [(0, 1.0, "F#5", 0.62), (1.0, 0.5, "E5", 0.55), (1.5, 0.5, "D5", 0.52), (2.5, 1.5, "C#5", 0.58)],
        [(0, 0.5, "B4", 0.55), (0.5, 0.5, "D5", 0.56), (1.0, 1.5, "F#5", 0.64), (3.0, 0.75, "E5", 0.56)],
        [(0, 1.0, "C#5", 0.58), (1.0, 0.5, "B4", 0.5), (1.5, 0.5, "E5", 0.55)],
    ],
    "b": [
        [(0, 0.5, "A4", 0.6), (0.75, 0.5, "A4", 0.56), (1.5, 2.0, "D5", 0.68), (3.5, 0.5, "F#5", 0.55)],
        [(0, 1.5, "E5", 0.6), (1.5, 0.5, "D5", 0.52), (2.0, 0.5, "B4", 0.5), (2.5, 1.5, "D5", 0.56)],
        [(0, 0.75, "G5", 0.62), (0.75, 0.75, "F#5", 0.58), (1.5, 1.0, "E5", 0.56), (3.0, 1.0, "B4", 0.5)],
        [(0, 1.5, "C#5", 0.58), (1.5, 0.5, "E5", 0.55), (2.0, 0.5, "A4", 0.5)],
    ],
    "c": [
        [(0, 0.5, "A4", 0.66), (0.75, 0.5, "A4", 0.62), (1.5, 1.0, "D5", 0.72), (2.75, 0.25, "E5", 0.5), (3.0, 1.0, "F#5", 0.6)],
        [(0.5, 0.5, "D5", 0.55), (1.0, 0.5, "B4", 0.52), (1.5, 1.5, "F#4", 0.56), (3.5, 0.5, "A4", 0.5)],
        [(0, 0.75, "B4", 0.58), (1.0, 0.5, "D5", 0.56), (1.5, 0.5, "E5", 0.58), (2.0, 1.5, "G5", 0.6)],
        [(0, 1.0, "F#5", 0.6), (1.0, 0.5, "E5", 0.55), (1.5, 0.5, "C#5", 0.52), (2.0, 0.5, "A4", 0.5)],
    ],
    "d": [
        [(0, 0.5, "A4", 0.62), (0.75, 0.5, "A4", 0.58), (1.5, 1.0, "D5", 0.7), (2.75, 0.5, "F#5", 0.58), (3.25, 0.75, "A5", 0.6)],
        [(0, 1.0, "F#5", 0.6), (1.25, 0.5, "E5", 0.55), (1.75, 0.5, "D5", 0.52), (2.5, 1.0, "B4", 0.54)],
        [(0, 0.5, "D5", 0.56), (0.5, 0.5, "B4", 0.52), (1.0, 1.0, "D5", 0.58), (2.25, 0.75, "E5", 0.56), (3.0, 1.0, "G5", 0.6)],
        [(0, 1.0, "E5", 0.58), (1.0, 0.75, "C#5", 0.55), (2.0, 0.5, "E5", 0.55), (2.75, 0.5, "A4", 0.5)],
    ],
}
HOME_TUNE.update({
    "e": [
        [(0, 0.5, "G4", 0.6), (0.75, 0.5, "G4", 0.56), (1.5, 2.0, "C5", 0.66), (3.5, 0.5, "D5", 0.5)],
        [(0, 1.0, "E5", 0.58), (1.0, 0.5, "D5", 0.52), (1.5, 0.5, "C5", 0.5), (2.5, 1.5, "B4", 0.55)],
        [(0, 0.75, "A4", 0.55), (0.75, 0.75, "C5", 0.56), (1.5, 1.5, "E5", 0.6), (3.0, 0.5, "D5", 0.5)],
    ],
    "f": [
        [(0, 0.5, "G4", 0.6), (0.75, 0.5, "G4", 0.56), (1.5, 1.0, "C5", 0.68), (2.75, 0.5, "E5", 0.55), (3.25, 0.75, "G5", 0.58)],
        [(0, 1.5, "E5", 0.6), (1.5, 0.5, "D5", 0.52), (2.0, 0.5, "C5", 0.5), (2.5, 1.5, "A4", 0.54)],
        [(0, 0.75, "A4", 0.55), (1.0, 0.5, "C5", 0.54), (1.5, 0.5, "D5", 0.56), (2.0, 1.5, "F5", 0.6), (3.5, 0.5, "E5", 0.52)],
    ],
    "g": [
        [(0, 0.5, "G4", 0.64), (0.75, 0.5, "G4", 0.6), (1.5, 1.0, "C5", 0.7), (2.75, 0.25, "D5", 0.5), (3.0, 1.0, "E5", 0.6)],
        [(0.5, 0.5, "C5", 0.55), (1.0, 0.5, "A4", 0.52), (1.5, 1.5, "E4", 0.56), (3.5, 0.5, "G4", 0.5)],
        [(0, 0.75, "A4", 0.56), (1.0, 0.5, "C5", 0.56), (1.5, 0.5, "D5", 0.58), (2.0, 1.5, "F5", 0.6)],
        [],
    ],
})
# Short answers at the end of every other groove bar (under the voices, so small and low).
FILLS = {
    "a": [[(2.5, 0.5, "A4", 0.4), (3.0, 0.5, "B4", 0.38), (3.5, 0.5, "D5", 0.42)], [(2.5, 1.0, "C#5", 0.4), (3.5, 0.5, "E5", 0.36)]],
    "b": [[(2.0, 1.0, "F#5", 0.42), (3.0, 0.5, "E5", 0.38), (3.5, 0.5, "D5", 0.36)], [(2.5, 1.5, "A5", 0.4)]],
    "c": [[(2.5, 0.25, "D5", 0.42), (2.75, 0.25, "E5", 0.42), (3.0, 1.0, "F#5", 0.46)], [(2.0, 0.5, "B4", 0.4), (2.5, 0.5, "A4", 0.4), (3.0, 1.0, "F#4", 0.44)]],
    "d": [[(2.5, 0.5, "F#5", 0.4), (3.0, 0.5, "A5", 0.42), (3.5, 0.5, "B5", 0.4)], [(3.0, 1.0, "E5", 0.42)]],
}


FILLS.update({
    "e": [[(2.5, 0.5, "G4", 0.4), (3.0, 0.5, "A4", 0.38), (3.5, 0.5, "C5", 0.42)], [(2.5, 1.0, "B4", 0.4), (3.5, 0.5, "D5", 0.36)]],
    "f": [[(2.0, 1.0, "E5", 0.42), (3.0, 0.5, "D5", 0.38), (3.5, 0.5, "C5", 0.36)], [(2.5, 1.5, "G5", 0.4)]],
    "g": [[(2.5, 0.25, "C5", 0.42), (2.75, 0.25, "D5", 0.42), (3.0, 1.0, "E5", 0.46)], [(2.0, 0.5, "A4", 0.4), (2.5, 0.5, "G4", 0.4), (3.0, 1.0, "E4", 0.44)]],
})


def compress(x, ratio=3.0, threshold_db=-24.0, attack=0.03, release=0.35, hop=0.01):
    """A gentle bus compressor: the music steady, as the reference is (its loudness range is about 3.6 LU).
    The level is read every 10 ms, the gain follows it (quick down, slow up) and is eased back to every sample."""
    if ratio <= 1:
        return x
    h = int(hop * SR)
    frames = len(x) // h
    power = np.mean(x[: frames * h] ** 2, axis=1).reshape(frames, h).mean(axis=1)
    lvl = 10 * np.log10(power + 1e-12)
    target = -np.maximum(lvl - threshold_db, 0) * (1 - 1 / ratio)
    a, r = np.exp(-hop / attack), np.exp(-hop / release)
    g = np.zeros(frames)
    cur = 0.0
    for i, t in enumerate(target):
        cur = a * cur + (1 - a) * t if t < cur else r * cur + (1 - r) * t
        g[i] = cur
    # Make-up gain: the typical playing level stays where it was, only the swings get smaller.
    playing = lvl > threshold_db - 6
    if playing.any():
        g = g - np.median(g[playing])
    centers = (np.arange(frames) + 0.5) * h
    gain = 10 ** (np.interp(np.arange(len(x)), centers, g) / 20)
    return x * gain[:, None]


class Song:
    def __init__(self, key):
        self.k = key
        self.s = STYLES[key]
        self.kit = Kit(self.s["seed"])
        self.beat = 60.0 / self.s["bpm"]
        self.bar = 4 * self.beat
        self.six = self.beat / 4
        self.buses = {k: Bus(LENGTH + 4) for k in ("kick", "snare", "hats", "keys", "lead", "bass", "pad", "guitar", "arp", "fx")}
        # Bars are numbered from the return: bar 0 starts at 47.0 s, bar -1 the one before it.
        self.first_groove = int(np.ceil((GROOVE_FROM - RETURN) / self.bar - 1e-9))
        beats = (RESOLVE - RETURN) / self.beat
        self.resolve_bar = int(beats // 4 + 1e-9)  # the bar the resolve falls in (bar 3 at 84–93 bpm, 2 or 3 when slow)
        self.resolve_beat = beats - 4 * self.resolve_bar

    def t(self, bar, beat=0.0):
        return RETURN + bar * self.bar + beat * self.beat

    def step_time(self, bar, step):
        """A sixteenth, swung: the off-sixteenths come late by the candidate's swing."""
        late = (self.s["swing"] - 0.5) * 2 * self.six if step % 2 else 0.0
        return self.t(bar) + step * self.six + late

    def put(self, bus, sound, at, gain=1.0, p=None, jitter=0.004):
        if at < MUSIC_FROM - 0.01:
            return
        # No note may stop dead at the end of its buffer: the last 6 ms always fade out.
        tail = fade(0, int(0.006 * SR), len(sound))
        sound = sound * (tail[:, None] if sound.ndim == 2 else tail)
        self.buses[bus].add(sound, at + self.kit.r.uniform(-jitter, jitter), gain, p)

    # --- parts ------------------------------------------------------------------

    def drums(self, bar, level=1.0, alt=False, only=None, until=None):
        s, kit = self.s, self.kit
        if until is not None:
            keep = lambda steps: [st for st in steps if st / 4 < until - 0.2]
            s = dict(s, kick=keep(s["kick"]), kick_alt=keep(s["kick_alt"]), snare=keep(s["snare"]), ghost=keep(s["ghost"]), hats=keep(s["hats"]), open=keep(s["open"]))
        dusty = s["dusty"]
        lb = s.get("laid_back", 0.0)
        if only in (None, "kick"):
            for st in s["kick_alt"] if alt else s["kick"]:
                v = (0.9 if st == 0 else 0.7) * level
                self.put("kick", kit.kick(v, 1.0 - 0.4 * dusty, dusty), self.step_time(bar, st), jitter=0.003)
        if only is None:
            for st in s["snare"]:
                self.put("snare", kit.snare(0.75 * level, 1.0 - 0.3 * dusty, dusty, s.get("clap", 0.0)), self.step_time(bar, st) + lb, p=0.05)
            for st in s["ghost"]:
                self.put("snare", kit.snare(0.18 * level, 0.5, dusty), self.step_time(bar, st) + lb, p=0.05)
        if only in (None, "hats"):
            for st in s["hats"]:
                accent = 1.0 if st % 4 == 2 else (0.75 if st % 2 == 0 else 0.5)
                self.put("hats", kit.hat(0.55 * accent * level, False, s["hat_bright"]), self.step_time(bar, st), p=0.25)
            for st in s["open"]:
                self.put("hats", kit.hat(0.3 * level, True, s["hat_bright"]), self.step_time(bar, st), p=0.3)

    def key_note(self, f, dur, vel):
        if self.s["keys"] == "wurli":
            return self.kit.wurli(f, dur, vel)
        return self.kit.rhodes(f, dur, vel)

    def comp(self, bar, chord, level=1.0, rhythm=None, roll=0.012, until=None):
        _, _, voicing = CHORDS[chord]
        for beat, length, vel in rhythm or self.s["comp"]:
            if until is not None and beat >= until:
                continue
            if until is not None:
                length = min(length, until - beat)
            for i, name in enumerate(voicing):
                self.put("keys", self.key_note(hz(name), length * self.beat, vel * level * (0.92 + 0.08 * i)), self.t(bar, beat) + roll * i, p=-0.3 + 0.2 * i)

    def bassline(self, bar, chord, next_chord, level=1.0, until=None, pattern=None):
        root_name, quality, _ = CHORDS[chord]
        root = hz(root_name)
        nxt = hz(CHORDS[next_chord][0])
        for step, length, iv, vel in pattern or self.s["bassline"]:
            beat = step / 4
            if until is not None and beat >= until:
                continue
            if iv == "n":
                # a chromatic step into the next chord's root
                below = nxt * 2 ** (-1 / 12)
                f = below if abs(np.log2(below / root)) < 0.75 else nxt * 2 ** (1 / 12)
            elif iv == "7":
                f = shift(root, SEVENTH[quality])
            else:
                f = shift(root, iv)
            while f > 160:
                f /= 2
            dur = length * self.six * 0.9
            if self.s["bass"] == "synth":
                snd = self.kit.synth_bass(f, dur, vel * level, 1.1 if self.k == "d" else 0.9, square=self.k == "b")
            else:
                snd = self.kit.round_bass(f, dur, vel * level)
            self.put("bass", snd, self.step_time(bar, step) + self.s.get("laid_back", 0.0) * 0.5, jitter=0.003)

    def pad(self, bar, chord, level=1.0, bars=1.0, attack=None):
        _, _, voicing = CHORDS[chord]
        dur = self.bar * bars
        for i, name in enumerate(voicing):
            f = hz(name)
            if self.s["pad"] == "analog":
                snd = self.kit.analog_pad(f, dur, 0.34 * level, attack or 0.7, 1.3)
            else:
                snd = self.kit.warm_pad(f, dur, 0.32 * level, attack or 0.9, 1.5)
            self.put("pad", snd, self.t(bar), jitter=0.0)

    def melody(self, bar, notes, level=1.0, until=None):
        lead = self.s["lead"]
        prev = None
        for beat, length, name, vel in notes:
            if until is not None and beat >= until:
                continue
            if until is not None:
                length = min(length, until - beat)
            f = hz(name)
            at = self.t(bar, beat)
            dur = length * self.beat
            v = vel * level
            if lead == "rhodes":
                self.put("lead", self.kit.rhodes(f, dur, v + 0.1, 1.2), at)
            elif lead == "square":
                self.put("lead", self.kit.square_lead(f, dur * 0.95, v, glide_from=prev if prev and abs(np.log2(prev / f)) < 0.4 else None), at)
            elif lead == "guitar":
                self.put("guitar", self.kit.guitar(f, dur, v + 0.15, 0.55, 2.4), at, p=0.15)
                self.put("lead", self.kit.wurli(f, dur, v * 0.5), at)
            elif lead == "rhodes_synth":
                self.put("lead", self.kit.rhodes(f, dur, v + 0.05, 1.1), at)
                self.put("lead", self.kit.square_lead(f * 2, dur * 0.9, v * 0.35), at)
            prev = f

    def guitar_lick(self, bar, chord, level=1.0):
        """A small answer on the guitar at the end of a phrase: two or three notes from the chord, sliding down."""
        if not self.s["guitar"]:
            return
        _, _, voicing = CHORDS[chord]
        tops = sorted(hz(n) * 2 for n in voicing)[-3:]
        for i, (beat, f) in enumerate(((3.0, tops[2]), (3.25, tops[1]), (3.5, tops[0]))):
            self.put("guitar", self.kit.guitar(f, 0.4 * self.beat if i < 2 else 1.2 * self.beat, 0.5 * level * self.s["guitar"], 0.5), self.t(bar, beat), p=0.35)

    def arp(self, bar, chord, level=1.0):
        if not self.s["arp"]:
            return
        _, _, voicing = CHORDS[chord]
        notes = [hz(n) * 2 for n in voicing]
        order = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2, 0, 2]
        for st, k in enumerate(order):
            self.put("arp", self.kit.blip(notes[k], (0.36 if st % 4 == 0 else 0.26) * level), self.step_time(bar, st), p=0.4 if st % 2 else -0.4, jitter=0.002)

    # --- the arc --------------------------------------------------------------------

    def compose(self):
        s = self.s
        intro, groove, home = s["intro"], s["groove"], s["home"]
        g0 = self.first_groove

        # Intro: from 5.0 s. A pad breathes in, the keys play long chords; the last intro bar brings in a soft kick.
        first_intro = int(np.floor((MUSIC_FROM - RETURN) / self.bar))
        self.pad(first_intro, intro[0], 0.55, bars=(self.t(first_intro + 1) - MUSIC_FROM) / self.bar + 0.3, attack=1.6)
        self.buses["pad"].x[: int(MUSIC_FROM * SR)] = 0
        for i, bar in enumerate(range(first_intro + 1, g0)):
            chord = intro[i % 2]
            self.comp(bar, chord, 0.7, rhythm=[(0, 3.6, 0.42)], roll=0.03)
            self.pad(bar, chord, 0.6)
            if i % 2 == 1:
                self.melody(bar, FILLS[self.k][0], 0.6)
            if bar == g0 - 1:
                self.drums(bar, 0.45, only="kick")
                self.drums(bar, 0.35, only="hats")
        # A single soft chord as the music begins at 5.0 s, so the intro does not wait for its first bar line.
        if self.t(first_intro + 1) - MUSIC_FROM > 0.8:
            _, _, voicing = CHORDS[intro[1]]
            for i, name in enumerate(voicing):
                self.put("keys", self.key_note(hz(name), self.t(first_intro + 1) - MUSIC_FROM, 0.3), MUSIC_FROM + 0.02 * i, p=-0.3 + 0.2 * i)

        # The groove: from the first bar line after 14.9 s through bar -4 (bar -3 when the bars are long).
        slow = s.get("slow", False)
        quiet = s.get("quiet", "Asus2")
        for i, bar in enumerate(range(g0, -2 if slow else -3)):
            chord = groove[i % 4]
            nxt = groove[(i + 1) % 4]
            self.drums(bar, 1.0, alt=(i % 4 == 3))
            self.bassline(bar, chord, nxt)
            self.comp(bar, chord, 0.95)
            self.pad(bar, chord, 0.5)
            self.arp(bar, chord, 0.75)
            if i % 2 == 1:
                self.melody(bar, FILLS[self.k][(i // 2) % 2], 0.7)
            if i % 4 == 3:
                self.guitar_lick(bar, chord, 0.8)
        if slow:
            # Bar -2 (about 40–43.5 s): it thins in its first half (kick and hats to beat 2, the bass held, one chord
            # fading), so by 43 s almost nothing is left.
            thin = groove[(-2 - g0) % 4]
            self.drums(-2, 0.55, until=2.0, only="kick")
            self.drums(-2, 0.35, until=2.0, only="hats")
            self.bassline(-2, thin, quiet, 0.6, pattern=[(0, 6, 0, 0.7)])
            self.comp(-2, thin, 0.6, rhythm=[(0, 2.0, 0.36)], roll=0.04)
            self.pad(-2, quiet, 0.3, bars=0.5)
        else:
            # Bar -3: it thins (kick, quieter hats, the bass held, one chord).
            thin = groove[(-3 - g0) % 4]
            self.drums(-3, 0.6, only="kick")
            self.drums(-3, 0.4, only="hats")
            self.bassline(-3, thin, quiet, 0.6, pattern=[(0, 8, 0, 0.7), (10, 4, 7, 0.5)])
            self.comp(-3, thin, 0.7, rhythm=[(0, 3.0, 0.4)])
            self.pad(-3, thin, 0.45)
            # Bar -2: one chord, held and fading.
            self.comp(-2, quiet, 0.55, rhythm=[(0, 2.0, 0.34)], roll=0.04)
            self.pad(-2, quiet, 0.32, bars=0.6)
        # Bar -1 (about 44.2–47 s): almost nothing (the record's dust, the faintest pad); the bell is on top in sfx.py.
        # Just before 47.0 a breath of air rises into the downbeat.
        rise = int(0.9 * SR)
        tt = np.arange(rise) / SR
        air = highpass(self.kit.noise(rise), 2500) * (tt / 0.9) ** 3 * 0.05
        self.put("fx", air, RETURN - 0.9, jitter=0.0)

        # The return at 47.0 s: everything at once, and the call come home.
        self.put("fx", self.kit.crash(0.55, s["dusty"]), RETURN, p=0.2, jitter=0.0)
        last_bar = self.resolve_bar
        for bar in range(0, last_bar + 1):
            until = self.resolve_beat if bar == last_bar else None
            if until is not None and until < 0.25:
                break  # the resolve is on this bar's downbeat
            chord = home[bar]
            nxt = home[bar + 1] if bar + 1 < len(home) else home[0]
            # In the last bar the drums stop just before the resolve.
            self.drums(bar, 1.0 if until is None else 0.85, alt=(bar == 2), until=until)
            self.bassline(bar, chord, nxt, 1.0, until=until)
            self.comp(bar, chord, 1.0, until=until)
            self.pad(bar, chord, 0.6, bars=1.0 if until is None else until / 4)
            if until is None:
                self.arp(bar, chord, 0.85)
            self.melody(bar, HOME_TUNE[self.k][bar], 1.0, until=until)
        self.guitar_lick(min(2, last_bar - 1), home[min(2, last_bar - 1)], 1.0)

        # 57.0 s: the resolve on D, with the end card. Rolled, held, ringing out to the end.
        hold = LENGTH - RESOLVE - 0.4
        voicing = s.get("resolve", ["D3", "A3", "C#4", "E4", "F#4", "A4"])
        for i, name in enumerate(voicing):
            self.put("keys", self.key_note(hz(name), hold, 0.42), RESOLVE + 0.028 * i, p=-0.35 + 0.14 * i, jitter=0.0)
        for name in s.get("resolve_pad", ("D3", "A3", "C#4", "F#4")):
            f = hz(name)
            snd = self.kit.analog_pad(f, hold, 0.3, 0.3, 1.0) if s["pad"] == "analog" else self.kit.warm_pad(f, hold, 0.3, 0.4, 1.2)
            self.put("pad", snd, RESOLVE, jitter=0.0)
        self.put("bass", self.kit.round_bass(hz(s.get("resolve_bass", "D2")), hold, 0.7), RESOLVE, jitter=0.0)
        self.put("kick", self.kit.kick(0.55, 0.7, s["dusty"]), RESOLVE, jitter=0.0)
        self.put("fx", self.kit.crash(0.3, s["dusty"]), RESOLVE, p=-0.2, jitter=0.0)
        last = s.get("last") or {"a": "D5", "b": "D5", "c": "A4", "d": "F#5"}[self.k]
        if s["lead"] == "guitar":
            self.put("guitar", self.kit.guitar(hz(last) * 2, hold, 0.55, 0.4, 3.0), RESOLVE + 0.12, p=0.2, jitter=0.0)
        else:
            self.melody(self.resolve_bar, [(self.resolve_beat, (LENGTH - RESOLVE - 0.6) / self.beat, last, 0.55)])

    # --- the finished tape ---------------------------------------------------------

    def render(self):
        s, b = self.s, self.buses
        n = int(LENGTH * SR)
        keys = autopan(b["keys"].x, 4.0 + 0.6 * (self.k == "a"), 0.28 if s["keys"] == "rhodes" else 0.1)
        lead = b["lead"].x
        if s["lead"] in ("square", "rhodes_synth"):
            lead = echo(lead, self.beat * 0.75, 0.3, 3, 3000)
        guitar = chorus(b["guitar"].x, 0.8, 1.6, 8.0, 0.4)
        guitar = echo(guitar, self.beat * 0.5, 0.25, 2, 2800)
        pad = chorus(b["pad"].x, 0.35, 3.0, 11.0, 0.5) if s["pad"] == "analog" else b["pad"].x
        arp = echo(b["arp"].x, self.beat * 0.75, 0.38, 4, 2600)
        drums_wet = 0.08 + 0.06 * s["dusty"]
        d = s.get("dark", {})
        snare = lowpass(b["snare"].x, d["snare_lp"]) if d else b["snare"].x
        if d:
            keys = lowpass(keys, d["keys_lp"], 4)
            lead = lowpass(lead, d["lead_lp"], 4)
            guitar = lowpass(guitar, d["lead_lp"], 4)
        kick_db = d.get("kick_db", -3.0)
        mix = (
            b["kick"].x * db(kick_db)
            + reverb(snare, 1.1, drums_wet + 0.05) * db(d.get("snare_db", -6.5))
            + reverb(b["hats"].x, 0.9, drums_wet) * db(d.get("hat_db", -12.0 + 2.0 * (s["hat_bright"] - 1)))
            + reverb(keys, 1.8, 0.2) * db(d.get("keys_db", -5.5))
            + reverb(lead, 2.0, 0.24) * db(d.get("lead_db", -6.0))
            + b["bass"].x * db(d.get("bass_db", -4.5))
            + reverb(pad, 2.6, 0.3) * db(-11.5 + 2.0 * (s["pad"] == "analog"))
            + reverb(guitar, 1.9, 0.22) * db(-7.0)
            + reverb(arp, 1.6, 0.25) * db(-15.0)
            + reverb(b["fx"].x, 2.2, 0.2) * db(-8.0)
        )[:n]
        # Duck everything a little on the kick, as lo-fi beats breathe.
        kick_env = np.abs(b["kick"].x[:n, 0])
        pump = 1 - 0.22 * np.clip(lowpass(kick_env, 8) * 6, 0, 1)
        bed = mix - b["kick"].x[:n] * db(kick_db)
        mix = bed * pump[:, None] + b["kick"].x[:n] * db(kick_db)
        if d.get("comp"):
            mix = compress(mix, d["comp"], d.get("thresh", -26.0))
        dust = self.kit.vinyl(LENGTH, s["vinyl"], s["hiss"]) * db(s.get("dust_db", -14.0)) * (0.0 if os.environ.get("LOFI_DRY") else 1.0)
        dust *= fade(int(1.2 * SR), int(1.5 * SR), n)[:, None]
        dust[: int(MUSIC_FROM * SR)] = 0
        mix = tape(mix, s["wow"], 1.0, s["top"], s["drive"], seed=s["seed"])
        if d:
            mix = lowpass(mix, s["top"] * 1.15, 4)  # the reference's dark top: a steeper roll-off on the whole bed
        mix = mix + lowpass(dust, s["top"] + 2000)
        # The film's arc, in level: a quiet intro, the groove, a thinning, almost nothing, then everything.
        g = self.t(self.first_groove)
        mix = ride(mix, [(0, -6), (g - 0.3, -6), (g, -3.0), (36, -2.5), (39, -3.5), (42, -7), (43, -10), (46.0, -11), (46.9, -8), (47.0, 0), (55, 0), (57, -0.5), (58.6, -1.0), (60, -3)])
        mix[: int(MUSIC_FROM * SR)] = 0
        mix[-int(0.9 * SR) :] *= fade(0, int(0.9 * SR), int(0.9 * SR))[:, None]
        return mix


def make(key):
    song = Song(key)
    song.compose()
    x = song.render()
    peak = np.abs(x).max()
    x = soft_limit(x / peak * 0.8)
    path = os.environ.get("LOFI_OUT") or os.path.join(ROOT, "audio", "out", f"music-60-lofi-{key}.wav")
    path = path.replace("{key}", key)
    sf.write(path, x.astype("float32"), SR)
    # All four at the same loudness, a little under the lullaby (-17.8 LUFS): a steady beat masks speech more than
    # a sparse piano does. Measured, then turned down to the target (never up, so the peaks stay where they were).
    if not os.environ.get("LOFI_OUT"):
        sys.path.insert(0, os.path.dirname(__file__))
        from measure_lofi import lufs

        now, _ = lufs(path)
        x = x * db(min(0.0, TARGET_LUFS - now))
        sf.write(path, x.astype("float32"), SR)
    rms = 20 * np.log10(np.sqrt(np.mean(x[int(5 * SR):] ** 2)))
    print(f"wrote {os.path.relpath(path, ROOT)}  ({STYLES[key]['name']}; groove from {song.t(song.first_groove):.2f} s; resolve in bar {song.resolve_bar + 1} after the return, on beat {song.resolve_beat + 1:g})  rms {rms:.1f} dB", flush=True)
    return path


if __name__ == "__main__":
    keys = sys.argv[1:] or list(STYLES)  # a b c d (round 1), e f g (round 2)
    for k in keys:
        make(k)
