"""The trailer's instruments, built from sine waves and noise.

Nothing here is a recording or a sample of anyone's work: every sound is
computed (a soft "felt" piano from decaying partials, a warm pad and strings
from detuned harmonics, a small bell, a plucked tine, a shaker, a room made
of decaying noise). So the music and effects are wholly ours to use in ads.
"""
import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt, sosfiltfilt

SR = 48000
TWO_PI = 2 * np.pi
rng = np.random.default_rng(20261114)

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name):
    """'A4' → 440.0, 'F#5', 'D3' …"""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + (octave - 4) * 12 - 9) / 12)


def db(x):
    return 10 ** (x / 20)


def lowpass(x, cutoff, order=2):
    return sosfilt(butter(order, min(cutoff, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def highpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "high", fs=SR, output="sos"), x, axis=0)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def smooth(x, ms):
    """Zero-phase smoothing of a control signal."""
    return sosfiltfilt(butter(1, 1000.0 / ms / TWO_PI * 1.0, "low", fs=SR, output="sos"), x)


def pan(mono, p):
    """Mono → stereo; p from -1 (left) to 1 (right), constant power."""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


def fade(n_in, n_out, n):
    """An amplitude envelope with raised-cosine ends, n samples long."""
    e = np.ones(n)
    n_in, n_out = min(n_in, n), min(n_out, n)
    if n_in > 0:
        e[:n_in] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n_in))
    if n_out > 0:
        e[-n_out:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, n_out))
    return e


class Bus:
    """A stretch of stereo tape that sounds are laid onto, by start time in seconds."""

    def __init__(self, seconds):
        self.x = np.zeros((int(seconds * SR) + SR, 2))

    def add(self, sound, at, gain=1.0, p=None):
        if sound.ndim == 1:
            sound = pan(sound, 0.0 if p is None else p)
        i = int(round(at * SR))
        if i < 0:
            sound = sound[-i:]
            i = 0
        n = min(len(sound), len(self.x) - i)
        if n > 0:
            self.x[i : i + n] += sound[:n] * gain


# ---------------------------------------------------------------- instruments


def felt_piano(f0, dur, vel=0.6, held=None):
    """A soft upright with felt on the strings: dark, close, a little wooden.

    Each note is a stack of partials that are slightly sharp of true harmonics
    (as stiff strings are), each dying at its own pace, the high ones first;
    two "strings" a hair apart give the slow shimmer; a low thump and a breath
    of noise stand in for the hammer.
    """
    held = dur if held is None else held
    n = int((held + 1.2) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    stiff = 0.00035 * (f0 / 261.6) ** 0.9
    ring = 3.4 * (220.0 / f0) ** 0.5
    count = int(min(26, max(6, 7000 / f0)))
    tilt = 0.52 - 0.24 * vel
    for k in range(1, count + 1):
        fk = k * f0 * np.sqrt(1 + stiff * k * k)
        if fk > SR * 0.45:
            break
        amp = k**-1.15 * np.exp(-(k - 1) * tilt)
        tk = ring / (1 + 0.16 * (k - 1) ** 1.25)
        env = 0.7 * np.exp(-t / (0.26 * tk)) + 0.3 * np.exp(-t / tk)
        for cents, w in ((-0.7, 0.55), (0.9, 0.45)):
            f = fk * 2 ** (cents / 1200)
            out += w * amp * env * np.sin(TWO_PI * f * t + rng.uniform(0, TWO_PI))
    # The felt: a slow, rounded start.
    out *= 1 - np.exp(-t / 0.009)
    thump = np.sin(TWO_PI * (74 + 0.06 * f0) * t) * np.exp(-t / 0.03) * 0.16 * (0.5 + vel)
    breath = lowpass(rng.standard_normal(n), 900) * np.exp(-t / 0.018) * 0.05 * (0.5 + vel)
    out += thump + breath
    # The damper comes down after the note is let go.
    r = int(held * SR)
    if r < n:
        out[r:] *= np.exp(-(t[r:] - held) / 0.22)
    return lowpass(out, 5200 + 3400 * vel) * (0.32 + 0.68 * vel)


def _stack(f0, n, voices, spread_cents, harmonics, rolloff, vibrato=None):
    """Several slightly detuned copies of one harmonic-rich tone, left and right."""
    t = np.arange(n) / SR
    left = np.zeros(n)
    right = np.zeros(n)
    for v in range(voices):
        cents = spread_cents * (v / max(1, voices - 1) - 0.5) * 2 + rng.uniform(-1.5, 1.5)
        drift = 1 + 0.0009 * np.sin(TWO_PI * rng.uniform(0.07, 0.19) * t + rng.uniform(0, TWO_PI))
        f = f0 * 2 ** (cents / 1200) * drift
        if vibrato is not None:
            f = f * (1 + vibrato)
        phase = TWO_PI * np.cumsum(f) / SR + rng.uniform(0, TWO_PI)
        tone = np.zeros(n)
        for h in range(1, harmonics + 1):
            if f0 * h > SR * 0.4:
                break
            tone += np.sin(h * phase) / h**rolloff
        if v % 2 == 0:
            left += tone
        else:
            right += tone
    return np.stack([left, right], axis=1) / voices


def pad(f0, dur, vel=0.5, attack=1.1, release=1.8, bright=1.0):
    """A warm, slow pad: the room holding its breath."""
    n = int((dur + release) * SR)
    x = _stack(f0, n, 6, 9, 10, 1.55)
    x = highpass(lowpass(x, (800 + 1700 * vel) * bright), 150)
    env = fade(int(attack * SR), int(release * SR), n)
    return x * env[:, None] * vel * 0.5


def strings(f0, dur, vel=0.6, attack=0.5, release=1.2):
    """A small string section: brighter than the pad, with a late, gentle vibrato."""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    depth = 0.0032 * np.clip((t - 0.35) / 0.8, 0, 1)
    vib = depth * np.sin(TWO_PI * 5.3 * t + rng.uniform(0, TWO_PI))
    x = _stack(f0, n, 7, 12, 14, 1.25, vibrato=vib)
    x = highpass(lowpass(x, 2200 + 3600 * vel), 170)
    env = fade(int(attack * SR), int(release * SR), n)
    return x * env[:, None] * vel * 0.42


def bell(f0, dur=2.2, vel=0.6):
    """A small glockenspiel: the child's voice in the music."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, decay in ((1.0, 1.0, 1.5), (2.756, 0.42, 0.7), (5.404, 0.2, 0.36), (8.933, 0.08, 0.18)):
        if f0 * ratio < SR * 0.45:
            out += amp * np.sin(TWO_PI * f0 * ratio * t) * np.exp(-t / (decay * dur / 2.2))
    out += 0.25 * np.sin(TWO_PI * f0 * 0.5 * t) * np.exp(-t / 0.5)
    out *= 1 - np.exp(-t / 0.0015)
    return out * vel * 0.34


def tine(f0, dur=1.3, vel=0.6):
    """A plucked metal tine (a thumb piano): light, a little woody."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, decay in ((1.0, 1.0, 0.7), (2.0, 0.1, 0.4), (5.32, 0.2, 0.14), (7.4, 0.05, 0.08)):
        if f0 * ratio < SR * 0.45:
            out += amp * np.sin(TWO_PI * f0 * ratio * t) * np.exp(-t / decay)
    pluck = bandpass(rng.standard_normal(n), 1500, 5000) * np.exp(-t / 0.006) * 0.12
    out = (out + pluck) * (1 - np.exp(-t / 0.002))
    return out * vel * 0.4


def bass(f0, dur, vel=0.6):
    """A round, soft bass: felt more than heard."""
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    x = np.sin(TWO_PI * f0 * t) + 0.22 * np.sin(TWO_PI * 2 * f0 * t) + 0.06 * np.sin(TWO_PI * 3 * f0 * t)
    env = (1 - np.exp(-t / 0.018)) * (0.55 + 0.45 * np.exp(-t / 0.5))
    x = np.tanh(x * env * 1.2)
    r = int(dur * SR)
    x[r:] *= np.exp(-(t[r:] - dur) / 0.09)
    return lowpass(x, 420) * vel * 0.5


def shaker(vel=0.5, length=0.05):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n), 5200, 11000) * np.exp(-t / (length * 0.45))
    return x * (1 - np.exp(-t / 0.002)) * vel * 0.16


def thud(vel=0.6, f_from=92, f_to=44, length=0.16):
    """A soft, low heartbeat."""
    n = int((length + 0.25) * SR)
    t = np.arange(n) / SR
    f = f_to + (f_from - f_to) * np.exp(-t / (length * 0.35))
    x = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / length)
    return x * vel * 0.7


def swell(dur, vel=0.5, lo=400, hi=9000):
    """Air gathering before a downbeat: noise that opens and rises."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    out = np.zeros((n, 2))
    steps = 24
    for i in range(steps):
        a, b = int(n * i / steps), int(n * (i + 1) / steps)
        cut = lo * (hi / lo) ** ((i + 1) / steps)
        seg = lowpass(noise[max(0, a - 2000) : b], cut)
        out[a:b] = seg[-(b - a) :]
    env = (t / dur) ** 2.6
    return lowpass(highpass(out, 250), 6500) * env[:, None] * vel * 0.3


# ------------------------------------------------------------------- the room


def room(rt=2.4, seed=7):
    """A hall made of decaying noise: bright at first, darker as it rings."""
    r = np.random.default_rng(seed)
    n = int(rt * 1.25 * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for lo, hi, decay, gain in ((90, 500, rt * 1.1, 0.9), (500, 2200, rt, 1.0), (2200, 6000, rt * 0.6, 0.7), (6000, 12000, rt * 0.32, 0.4)):
        band = bandpass(r.standard_normal((n, 2)), lo, hi)
        ir += band * np.exp(-6.9 * t / decay)[:, None] * gain
    # A few early reflections, then the tail swells in.
    ir *= (1 - np.exp(-t / 0.012))[:, None]
    for ms, g, p in ((11, 0.5, -0.6), (17, 0.42, 0.5), (23, 0.36, -0.3), (31, 0.3, 0.7), (43, 0.22, -0.1)):
        i = int(ms * SR / 1000)
        ir[i] += np.array([np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)]) * g * 6
    ir /= np.sqrt((ir**2).sum(axis=0)).mean()
    return ir


_ROOMS = {}


def reverb(x, rt=2.4, wet=0.25, pre_ms=18):
    key = round(rt, 2)
    if key not in _ROOMS:
        _ROOMS[key] = room(rt)
    ir = _ROOMS[key]
    tail = np.stack([fftconvolve(x[:, 0], ir[:, 0])[: len(x)], fftconvolve(x[:, 1], ir[:, 1])[: len(x)]], axis=1)
    d = int(pre_ms * SR / 1000)
    tail = np.vstack([np.zeros((d, 2)), tail[: len(x) - d]])
    return x + tail * wet


def soft_limit(x, ceiling=0.94, knee=0.7):
    """Rounds off peaks instead of clipping them."""
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    y[over] = np.sign(x[over]) * (knee + (ceiling - knee) * np.tanh((a[over] - knee) / (ceiling - knee)))
    return y


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-12)


def shelves(x, low_cut=0.26, high_lift=0.55):
    """A last, gentle tone control: a little less weight below 200 Hz, a little more air above 4.5 kHz."""
    return x - low_cut * lowpass(x, 200) + high_lift * highpass(x, 4500)


def ride(x, points):
    """Turns the level up and down over time: (seconds, dB) points, joined by straight lines."""
    t = np.arange(len(x)) / SR
    gain = 10 ** (np.interp(t, [p[0] for p in points], [p[1] for p in points]) / 20)
    return x * gain[:, None]
