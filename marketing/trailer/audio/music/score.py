"""The trailer's music: "Mama, look" — an original lullaby in D, 6/8, one pulse a second.

Written for this film and played by the instruments in dsp.py. Its theme is
the child's call, three notes for "Ma-ma, look": A, A, and then C sharp,
which hangs (the hook, the dawn, the moment before the garden) or D, which
is home (Kakak's sunrise, the ending, the last bar).

Bars are two seconds long and start at 5.0 s in the 60-second cut (3.0 s in
the 15-second one), so the film's cuts sit on the pulse.

  python audio/music/score.py            every style, both cuts → audio/out/music-<cut>-<style>.wav
  python audio/music/score.py 60 felt    one of them
"""
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, Bus, bass, bell, db, fade, felt_piano, highpass, hz, pad, reverb, ride, rng, shaker, shelves, soft_limit, strings, swell, thud, tine

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EIGHTH = 1 / 3
BAR = 2.0

# Each chord: its bass note, the notes the left hand rolls through, the notes the pad holds.
CHORDS = {
    "D": ("D2", ["D3", "A3", "D4", "F#4"], ["D3", "A3", "F#4", "A4"]),
    "Dmaj7": ("D2", ["D3", "A3", "C#4", "F#4"], ["D3", "A3", "C#4", "F#4"]),
    "Bm7": ("B1", ["B2", "F#3", "A3", "D4"], ["B2", "F#3", "A3", "D4"]),
    "G": ("G1", ["G2", "D3", "G3", "B3"], ["G2", "D3", "B3", "D4"]),
    "A": ("A1", ["A2", "E3", "A3", "C#4"], ["A2", "E3", "A3", "C#4"]),
    "Asus": ("A1", ["A2", "E3", "A3", "D4"], ["A2", "E3", "A3", "D4"]),
    "D/F#": ("F#2", ["F#2", "D3", "A3", "D4"], ["F#2", "D3", "A3", "D4"]),
    "Em7": ("E2", ["E2", "B2", "D3", "G3"], ["E2", "B2", "D3", "G3"]),
}

# How loud each part plays, per style. "felt" is the film's; the others are alternates on the same bars.
STYLES = {
    "felt": {"lead_piano": 1.0, "lead_tine": 0.0, "arp": 1.0, "pad": 1.0, "strings": 1.0, "bell": 1.0, "tine": 1.0, "perc": 1.0, "bass": 1.0},
    "tines": {"lead_piano": 0.35, "lead_tine": 1.0, "arp": 0.7, "pad": 1.1, "strings": 0.55, "bell": 1.1, "tine": 1.5, "perc": 1.25, "bass": 1.0},
    "strings": {"lead_piano": 0.7, "lead_tine": 0.0, "arp": 0.8, "pad": 1.0, "strings": 1.7, "bell": 0.9, "tine": 0.6, "perc": 0.6, "bass": 1.1},
}


class Piece:
    def __init__(self, length, t0, style):
        self.length = length
        self.t0 = t0
        self.s = STYLES[style]
        self.buses = {k: Bus(length + 4) for k in ("piano", "pad", "strings", "bell", "tine", "bass", "perc", "air")}

    def at(self, bar, eighth=1.0):
        return self.t0 + (bar - 1) * BAR + (eighth - 1) * EIGHTH

    def note(self, bus, sound, bar, eighth, gain=1.0, p=0.0, late=0.0):
        self.buses[bus].add(sound, self.at(bar, eighth) + late + rng.uniform(-0.004, 0.006), gain, p)

    # --- parts -------------------------------------------------------------

    def lead(self, bar, notes, octave_below=False, with_strings=0.0, with_bell=0.0):
        """The tune: (eighth, length in eighths, note, how hard)."""
        for e, n, name, vel in notes:
            held = n * EIGHTH
            if self.s["lead_piano"]:
                self.note("piano", felt_piano(hz(name), held, vel, held + 0.5), bar, e, self.s["lead_piano"], 0.12)
                if octave_below:
                    self.note("piano", felt_piano(hz(name) / 2, held, vel * 0.86, held + 0.5), bar, e, self.s["lead_piano"] * 0.8, -0.1)
            if self.s["lead_tine"]:
                self.note("tine", tine(hz(name), 1.2 + held * 0.3, vel), bar, e, self.s["lead_tine"] * 1.5, 0.15)
            if with_strings:
                self.note("strings", strings(hz(name), held + 0.15, vel * with_strings, attack=0.16, release=0.7), bar, e, self.s["strings"], 0.2)
            if with_bell:
                self.note("bell", bell(hz(name), 2.0, vel * with_bell), bar, e, self.s["bell"], -0.15)

    def roll(self, bar, chord, vel=0.42, first=1, last=6):
        """The left hand: the chord's notes rolled across the bar, leaning on beats one and four."""
        _, notes, _ = CHORDS[chord]
        order = [0, 1, 2, 1, 3, 2]
        for e in range(first, last + 1):
            v = vel * (1.0 if e in (1, 4) else 0.8) + rng.uniform(-0.03, 0.03)
            self.note("piano", felt_piano(hz(notes[order[e - 1]]), EIGHTH * 2.4, v, EIGHTH * 3.2), bar, e, self.s["arp"], -0.18 + 0.07 * order[e - 1])

    def hold(self, bar, chord, vel=0.4, bars=1.0, bright=1.0, first=1):
        """The pad under everything."""
        _, _, notes = CHORDS[chord]
        dur = bars * BAR - (first - 1) * EIGHTH
        for i, name in enumerate(notes):
            self.note("pad", pad(hz(name), dur, vel, attack=0.9, release=1.6, bright=bright), bar, first, self.s["pad"] * (1.0 if i < 3 else 0.7))

    def sustain(self, bar, names, vel=0.4, bars=1.0, first=1, attack=0.6):
        """Strings holding a few notes."""
        dur = bars * BAR - (first - 1) * EIGHTH
        for i, name in enumerate(names):
            self.note("strings", strings(hz(name), dur, vel, attack=attack, release=1.3), bar, first, self.s["strings"], -0.35 + 0.7 * i / max(1, len(names) - 1))

    def low(self, bar, chord, vel=0.5, both=True, first=1):
        root = hz(CHORDS[chord][0]) * (2 if CHORDS[chord][0][-1] == "1" else 1)
        self.note("bass", bass(root, EIGHTH * 2.6, vel), bar, first, self.s["bass"])
        if both and first == 1:
            self.note("bass", bass(root, EIGHTH * 1.8, vel * 0.72), bar, 4, self.s["bass"])

    def pulse(self, bar, vel=0.5, heart=True):
        """A shaker in six, a soft heartbeat on one and four."""
        for e in range(1, 7):
            v = vel * (1.0 if e in (1, 4) else 0.55 if e in (3, 6) else 0.4)
            self.note("perc", shaker(v), bar, e, self.s["perc"], 0.3 if e % 2 else -0.3)
        if heart:
            self.note("perc", thud(vel * 0.55), bar, 1, self.s["perc"])
            self.note("perc", thud(vel * 0.3), bar, 4, self.s["perc"])

    def sparkle(self, bar, notes, vel=0.4):
        for e, name in notes:
            self.note("tine", tine(hz(name), 1.2, vel), bar, e, self.s["tine"], rng.uniform(-0.5, 0.5))

    def gather(self, until, dur=1.1, vel=0.45):
        self.buses["air"].add(swell(dur, vel), until - dur)

    # --- the finished tape ---------------------------------------------------

    def render(self):
        b = self.buses
        n = int(self.length * SR)
        mix = (
            reverb(b["piano"].x, 2.3, 0.2) * db(-1.0)
            + reverb(b["pad"].x, 2.8, 0.3) * db(-9.5)
            + reverb(b["strings"].x, 2.8, 0.34) * db(-5.5)
            + reverb(b["bell"].x, 2.6, 0.42) * db(-5.0)
            + reverb(b["tine"].x, 2.2, 0.3) * db(-8.5)
            + b["bass"].x * db(-10.0)
            + reverb(b["perc"].x, 1.2, 0.07) * db(-10.5)
            + reverb(b["air"].x, 2.2, 0.2) * db(-15.0)
        )[:n]
        mix = shelves(highpass(mix, 34))
        mix[-int(0.25 * SR) :] *= fade(0, int(0.25 * SR), int(0.25 * SR))[:, None]
        return mix


THEME = {
    1: [(1, 1, "A4", 0.5), (2, 1, "A4", 0.46), (3, 4, "C#5", 0.56)],
    2: [(1, 1, "B4", 0.48), (2, 1, "B4", 0.44), (3, 4, "D5", 0.54)],
    3: [(1, 1, "D5", 0.5), (2, 1, "E5", 0.5), (3, 1, "F#5", 0.56), (4, 3, "E5", 0.52)],
    4: [(1, 1, "A4", 0.58), (2, 1, "A4", 0.54), (3, 1.5, "D5", 0.66), (4.5, 1, "F#5", 0.5), (5.5, 1.5, "A5", 0.56)],
    5: [(1, 1, "B4", 0.46), (2, 1, "D5", 0.48), (3, 1, "F#5", 0.52), (4, 3, "E5", 0.5)],
    11: [(1, 1, "B4", 0.5), (2, 1, "D5", 0.5), (3, 4, "G5", 0.58)],
    12: [(1, 1, "A4", 0.5), (2, 1, "D5", 0.5), (3, 4, "F#5", 0.56)],
    13: [(1, 1, "G5", 0.54), (2, 1, "F#5", 0.5), (3, 1, "E5", 0.5), (4, 1, "C#5", 0.5), (5, 1, "E5", 0.52), (6, 1, "A5", 0.58)],
    14: [(1, 3, "B5", 0.56), (4, 1, "A5", 0.5), (5, 2, "G5", 0.5)],
    15: [(1, 3, "F#5", 0.54), (4, 3, "D5", 0.5)],
    16: [(1, 1, "E5", 0.52), (2, 1, "G5", 0.52), (3, 1, "B5", 0.58), (4, 1, "A5", 0.54), (5, 1, "G5", 0.5), (6, 1, "E5", 0.5)],
    17: [(1, 1, "E5", 0.54), (2, 1, "A5", 0.56), (3, 1, "C#6", 0.62), (4, 1, "B5", 0.56), (5, 1, "A5", 0.54), (6, 1, "E5", 0.5)],
    18: [(1, 6, "F#5", 0.44)],
    19: [(1, 6, "D5", 0.36)],
    22: [(1, 1, "A5", 0.74), (2, 1, "A5", 0.7), (3, 4, "D6", 0.84)],
    23: [(1, 1, "B5", 0.7), (2, 1, "B5", 0.66), (3, 2, "F#6", 0.8), (5, 1, "E6", 0.7), (6, 1, "D6", 0.7)],
    24: [(1, 2, "G6", 0.8), (3, 1, "F#6", 0.72), (4, 2, "E6", 0.74), (6, 1, "D6", 0.7)],
    25: [(1, 3, "E6", 0.76), (4, 1, "A5", 0.66), (5, 1, "C#6", 0.7), (6, 1, "E6", 0.76)],
    26: [(1, 3, "D6", 0.74), (4, 3, "C#6", 0.7)],
    27: [(1, 1, "A5", 0.72), (2, 1, "A5", 0.68), (3, 4, "D6", 0.82)],
}


def sixty(style):
    """Bars from 5.0 s: 1–3 the turn · 4–5 Kakak · 6–10 tell her once · 11–13 everyone knows ·
    14–17 Sari and the day · 18–19 all on track · 20–21 quiet · 22–25 the garden · 26–28 the name."""
    P = Piece(60, 5.0, style)

    # 1–3: one piano, before dawn. The call hangs on C sharp.
    for bar, chord in ((1, "Dmaj7"), (2, "Bm7")):
        low, notes, _ = CHORDS[chord]
        P.note("piano", felt_piano(hz(low) * 2, BAR, 0.4, BAR + 1), bar, 1, P.s["arp"], -0.2)
        P.note("piano", felt_piano(hz(notes[1]), BAR * 0.8, 0.32, BAR), bar, 2, P.s["arp"], -0.1)
        P.note("piano", felt_piano(hz(notes[2]), BAR * 0.6, 0.3, BAR), bar, 4, P.s["arp"], 0.0)
        P.lead(bar, THEME[bar])
    P.note("piano", felt_piano(hz("G2"), BAR / 2, 0.4, BAR / 2 + 0.6), 3, 1, P.s["arp"], -0.2)
    P.note("piano", felt_piano(hz("D3"), BAR / 2, 0.32, BAR / 2 + 0.4), 3, 2, P.s["arp"], -0.1)
    P.note("piano", felt_piano(hz("A2"), BAR / 2, 0.42, BAR / 2 + 0.8), 3, 4, P.s["arp"], -0.2)
    P.note("piano", felt_piano(hz("D4"), BAR / 2, 0.34, BAR / 2 + 0.6), 3, 5, P.s["arp"], 0.0)
    P.lead(3, THEME[3])
    P.hold(3, "Asus", 0.2, bars=0.5, first=4)

    # 4–5: sunrise. The call comes home to D; the pad opens; a bell on the heart.
    P.gather(P.at(4), 0.9, 0.3)
    P.roll(4, "D", 0.4)
    P.hold(4, "D", 0.42)
    P.lead(4, THEME[4], with_bell=0.5)
    P.sustain(4, ["A4", "D5"], 0.22, bars=1.0, attack=1.0)
    P.roll(5, "Bm7", 0.4, 1, 3)
    P.roll(5, "A", 0.4, 4, 6)
    P.hold(5, "Bm7", 0.38, bars=0.5)
    P.hold(5, "A", 0.38, bars=0.5, first=4)
    P.lead(5, THEME[5])

    # 6–10: tell her once. A light pulse; the tune steps back for the screen.
    P.gather(P.at(6), 1.0, 0.36)
    tell = {6: "D", 7: "Bm7", 8: "G", 9: "A", 10: "D/F#"}
    lights = {6: [(3, "A5"), (6, "F#5")], 7: [(3, "B5"), (6, "F#5")], 8: [(3, "B5"), (5, "A5")], 9: [(3, "C#6"), (6, "A5")], 10: [(2, "A5"), (3, "D6")]}
    for bar, chord in tell.items():
        P.roll(bar, chord, 0.44)
        P.hold(bar, chord, 0.4)
        P.low(bar, chord, 0.5)
        P.pulse(bar, 0.42 + 0.03 * (bar - 6))
        P.sparkle(bar, lights[bar], 0.36)

    # 11–13: everyone at home knows. The tune returns with strings under it.
    know = {11: "G", 12: "D/F#"}
    for bar, chord in know.items():
        P.roll(bar, chord, 0.46)
        P.hold(bar, chord, 0.44, bright=1.15)
        P.low(bar, chord, 0.52)
        P.pulse(bar, 0.5)
        P.lead(bar, THEME[bar], with_strings=0.36)
    P.roll(13, "Em7", 0.46, 1, 3)
    P.roll(13, "A", 0.48, 4, 6)
    P.hold(13, "Em7", 0.42, bars=0.5)
    P.hold(13, "A", 0.44, bars=0.5, first=4)
    P.low(13, "Em7", 0.5, both=False)
    P.low(13, "A", 0.5, both=False, first=4)
    P.pulse(13, 0.5)
    P.lead(13, THEME[13], with_strings=0.36)
    P.sustain(11, ["B4", "D5"], 0.26, bars=1.0)
    P.sustain(12, ["A4", "D5"], 0.26, bars=1.0)
    P.sustain(13, ["B4", "E5"], 0.28, bars=1.0)

    # 14–17: Sari, then the house through the day. Warm and steady, then brighter as the sun crosses.
    day = {14: "G", 15: "D/F#", 16: "Em7", 17: "A"}
    for bar, chord in day.items():
        P.roll(bar, chord, 0.48)
        P.hold(bar, chord, 0.46, bright=1.2 if bar > 15 else 1.1)
        P.low(bar, chord, 0.54)
        P.pulse(bar, 0.52 if bar < 16 else 0.58)
        P.lead(bar, THEME[bar], with_strings=0.3 if bar < 16 else 0.4)
    P.sustain(14, ["B4", "D5", "G5"], 0.28)
    P.sustain(15, ["A4", "D5", "F#5"], 0.28)
    P.sustain(16, ["B4", "E5", "G5"], 0.32)
    P.sustain(17, ["A4", "C#5", "E5"], 0.36)
    P.sparkle(16, [(2, "B5"), (5, "E6")], 0.34)
    P.sparkle(17, [(2, "A5"), (4, "E6"), (6, "A6")], 0.36)

    # 18–19: all on track. It thins; by 42 s only the pad is left, and then not even that.
    P.roll(18, "D", 0.36)
    P.hold(18, "D", 0.36)
    P.low(18, "D", 0.4, both=False)
    P.lead(18, THEME[18])
    P.roll(19, "Bm7", 0.28, 1, 3)
    P.hold(19, "Bm7", 0.26, bars=0.8)
    P.lead(19, THEME[19])

    # 20–21: quiet. (The one notification and the child's call are sound effects: audio/sfx.py.)
    P.gather(P.at(22), 1.25, 0.5)
    P.sustain(21, ["A3", "E4", "A4"], 0.3, bars=0.5, first=4, attack=0.9)

    # 22–25: the garden. The whole band, and the call at home on D.
    garden = {22: "D", 23: "Bm7", 24: "G", 25: "A"}
    for bar, chord in garden.items():
        P.roll(bar, chord, 0.6)
        P.hold(bar, chord, 0.56, bright=1.35)
        P.low(bar, chord, 0.66)
        P.pulse(bar, 0.5)
        P.lead(bar, THEME[bar], octave_below=True, with_strings=0.62, with_bell=0.5 if bar == 22 else 0.0)
    P.sustain(22, ["D4", "A4", "D5", "F#5"], 0.5)
    P.sustain(23, ["D4", "F#4", "B4", "D5"], 0.5)
    P.sustain(24, ["D4", "G4", "B4", "D5"], 0.52)
    P.sustain(25, ["E4", "A4", "C#5", "E5"], 0.56)

    # 26–28: the name. Subdominant, dominant, home; the call once more, on the bell.
    P.roll(26, "G", 0.54, 1, 3)
    P.roll(26, "A", 0.54, 4, 6)
    P.hold(26, "G", 0.5, bars=0.5, bright=1.3)
    P.hold(26, "A", 0.5, bars=0.5, first=4, bright=1.3)
    P.low(26, "G", 0.6, both=False)
    P.low(26, "A", 0.6, both=False, first=4)
    P.lead(26, THEME[26], octave_below=True, with_strings=0.56)
    P.sustain(26, ["D4", "G4", "B4"], 0.46, bars=0.5)
    P.sustain(26, ["E4", "A4", "C#5"], 0.48, bars=0.5, first=4)
    P.hold(27, "D", 0.52, bars=1.45, bright=1.3)
    P.low(27, "D", 0.62, both=False)
    P.sustain(27, ["D4", "A4", "D5", "F#5"], 0.46, bars=1.35)
    P.lead(27, THEME[27], octave_below=True, with_bell=0.7)
    for i, name in enumerate(("D3", "A3", "D4", "F#4", "A4")):
        P.note("piano", felt_piano(hz(name), 2.6, 0.5, 3.0), 27, 1, P.s["arp"], -0.2 + 0.1 * i, late=0.018 * i)
    # The film's arc, in level: a quiet piano, a slow build, almost nothing, then everything.
    return ride(P.render(), [(0, -7), (10.8, -6.5), (11.2, -4.5), (15, -4), (25, -3), (31, -2.5), (35, -1.5), (39, -3.5), (42, -7), (46.8, -7), (47.0, 0), (55, 0), (57, -0.5), (60, -1.5)])


def fifteen(style):
    """Bars from 3.0 s: 1–3 the sentence and the staff · 4 the lift · 5 the garden · 6 home."""
    P = Piece(15, 3.0, style)
    P.gather(P.at(1), 0.5, 0.3)
    first = {1: "D", 2: "Bm7", 3: "G"}
    tune = {
        1: [(1, 1, "A4", 0.58), (2, 1, "A4", 0.54), (3, 4, "D5", 0.66)],
        2: [(1, 1, "B4", 0.52), (2, 1, "B4", 0.5), (3, 2, "F#5", 0.6), (5, 2, "D5", 0.5)],
        3: [(1, 3, "B5", 0.58), (4, 1, "A5", 0.52), (5, 2, "G5", 0.52)],
    }
    for bar, chord in first.items():
        P.roll(bar, chord, 0.46)
        P.hold(bar, chord, 0.44, bright=1.1)
        P.low(bar, chord, 0.52)
        P.pulse(bar, 0.46 + 0.03 * bar)
        P.lead(bar, tune[bar], with_strings=0.26, with_bell=0.4 if bar == 1 else 0.0)
    P.roll(4, "A", 0.5)
    P.hold(4, "A", 0.48, bright=1.2)
    P.low(4, "A", 0.56)
    P.pulse(4, 0.54)
    P.lead(4, [(1, 1, "E5", 0.56), (2, 1, "A5", 0.58), (3, 1, "C#6", 0.64), (4, 3, "E6", 0.68)], with_strings=0.44)
    P.sustain(4, ["A4", "C#5", "E5"], 0.4)
    P.gather(P.at(5), 0.9, 0.5)
    P.roll(5, "G", 0.58, 1, 3)
    P.roll(5, "A", 0.58, 4, 6)
    P.hold(5, "G", 0.54, bars=0.5, bright=1.3)
    P.hold(5, "A", 0.54, bars=0.5, first=4, bright=1.3)
    P.low(5, "G", 0.62, both=False)
    P.low(5, "A", 0.62, both=False, first=4)
    P.pulse(5, 0.48)
    P.lead(5, [(1, 3, "D6", 0.78), (4, 3, "C#6", 0.74)], octave_below=True, with_strings=0.6)
    P.sustain(5, ["D4", "G4", "B4"], 0.5, bars=0.5)
    P.sustain(5, ["E4", "A4", "C#5"], 0.52, bars=0.5, first=4)
    P.hold(6, "D", 0.52, bars=0.95, bright=1.3)
    P.low(6, "D", 0.62, both=False)
    P.sustain(6, ["D4", "A4", "D5", "F#5"], 0.46, bars=0.9)
    P.lead(6, [(1, 1, "A5", 0.72), (2, 1, "A5", 0.68), (3, 4, "D6", 0.82)], octave_below=True, with_bell=0.7)
    for i, name in enumerate(("D3", "A3", "D4", "F#4", "A4")):
        P.note("piano", felt_piano(hz(name), 2.0, 0.5, 2.2), 6, 1, P.s["arp"], -0.2 + 0.1 * i, late=0.018 * i)
    return ride(P.render(), [(0, -3.5), (9.9, -2.5), (10.2, -1), (11, 0), (15, -1)])


if __name__ == "__main__":
    cuts = [sys.argv[1]] if len(sys.argv) > 1 else ["60", "15"]
    styles = [sys.argv[2]] if len(sys.argv) > 2 else list(STYLES)
    os.makedirs(os.path.join(ROOT, "audio", "out"), exist_ok=True)
    for cut in cuts:
        for style in styles:
            x = sixty(style) if cut == "60" else fifteen(style)
            peak = np.abs(x).max()
            x = soft_limit(x / peak * 0.8)
            path = os.path.join(ROOT, "audio", "out", f"music-{cut}-{style}.wav")
            sf.write(path, x.astype("float32"), SR)
            print(f"wrote {os.path.relpath(path, ROOT)}  peak before {20 * np.log10(peak):.1f} dB  rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):.1f} dB", flush=True)
