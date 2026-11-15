"""The Eleven Music candidates for the lo-fi comparison (listening only until ElevenLabs confirms company-ad use).

Writes audio/eleven/staged/music-lofi.json. It goes into audio/eleven/queue/ only once the music key's tab is running
(a TTS-only key would refuse it). Each song is 55 s, placed at 5.0 s in the film (the hook stays silent), in sections
fitted to v13's cues: intro 5–15, groove 15–39, thinning 39–43, almost nothing 43–47 (the girl's bell at 45.2 s is
added in the mix), the full groove back on the downbeat at 47.0, a resolve with the end card at 57.0, end 60.0.
No artists or songs are named; the styles describe sound only.

  .tools/venv-main/bin/python audio/eleven/music_jobs.py
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NO = ["vocals", "lyrics", "singing", "humming", "spoken word", "rap"]
QUALITY = ["great production quality", "warm analog mix", "instrumental only"]

# name: (tempo, key, the sound throughout, how bright)
CANDIDATES = {
    "e1-dark68": (68, "C major", ["lo-fi hip hop", "half-time groove", "double-time hi-hats", "very dark and warm", "heavy low-pass filter on the whole mix",
                                  "round funky electric bass, prominent", "mellow Rhodes chords", "dusty vintage drums", "tape saturation", "soft vinyl crackle", "steady, compressed"],
                  ["bright", "crisp highs", "airy", "shimmering", "EDM", "trap hi-hat rolls", "orchestral"]),
    "e2-rhodes70": (70, "C major", ["lo-fi hip hop", "half-time groove", "double-time shuffled hi-hats", "dark and warm", "Rhodes electric piano melody",
                                    "warm analog synth pad", "deep round bass", "boom-bap drums, soft", "cassette tape wobble", "vinyl texture"],
                    ["bright", "harsh", "EDM", "trap hi-hat rolls", "orchestral", "acoustic guitar"]),
    "e3-guitar76": (76, "A minor", ["lo-fi hip hop", "laid-back groove", "warm but slightly brighter", "clean electric guitar licks with gentle chorus",
                                    "Rhodes chords", "funky round bass", "crisp vintage drums", "tape and vinyl texture", "relaxed"],
                    ["harsh", "distorted guitar", "EDM", "trap hi-hat rolls", "orchestral"]),
    "e4-spacefunk88": (88, "D major", ["1980s retro-futuristic lo-fi", "gentle space-funk groove", "laid-back funky bass", "Rhodes chords",
                                       "electric piano melody", "analog synth pads", "subtle clean guitar lick", "crisp vintage drums", "tape and vinyl texture"],
                       ["harsh", "EDM", "trap", "orchestral", "aggressive"]),
}


def plan(bpm, key, sound, avoid):
    base = [f"{bpm} BPM", key] + sound + QUALITY
    neg = NO + avoid
    return {"chunks": [
        {"text": "[Intro]\n{soft Rhodes chords and vinyl crackle, no drums}", "duration_ms": 10000,
         "positive_styles": base + ["gentle intro", "sparse", "quiet"], "negative_styles": neg + ["drums", "loud"], "context_adherence": "high"},
        {"text": "[Groove]\n{drums and bass enter on the first beat}", "duration_ms": 24000,
         "positive_styles": [f"{bpm} BPM", key, "full groove", "steady", "laid-back"] + sound[:6], "negative_styles": neg, "context_adherence": "high"},
        {"text": "[Breakdown]\n{drums drop out, bass and keys fade}", "duration_ms": 4000,
         "positive_styles": [f"{bpm} BPM", key, "thinning out", "drums stop", "fading", "keys only"], "negative_styles": neg + ["drums", "build-up", "riser"], "context_adherence": "high"},
        {"text": "[Silence]\n{almost silent, only faint vinyl crackle}", "duration_ms": 4000,
         "positive_styles": ["near silence", "faint vinyl crackle", "very quiet", "empty space"], "negative_styles": neg + ["drums", "bass", "melody", "chords", "riser", "build-up"], "context_adherence": "medium"},
        {"text": "[Drop]\n{full groove returns at once on the first beat}", "duration_ms": 10000,
         "positive_styles": [f"{bpm} BPM", key, "full groove returns immediately", "warm", "satisfying"] + sound[:6], "negative_styles": neg + ["fade in", "build-up"], "context_adherence": "high"},
        {"text": "[Outro]\n{one resolving chord, ringing out}", "duration_ms": 3000,
         "positive_styles": [key, "final resolving chord on the tonic", "ringing out", "soft ending", "no drums"], "negative_styles": neg + ["drums", "abrupt cut"], "context_adherence": "high"},
    ]}


job = {"kind": "music", "items": [
    {"out": f"audio/out/eleven/music/{name}", "composition_plan": plan(*c), "model": "music_v2_5", "seed": 1115 + i}
    for i, (name, c) in enumerate(CANDIDATES.items())
]}
path = os.path.join(ROOT, "audio", "eleven", "staged", "music-lofi.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(job, open(path, "w"), indent=1)
print(f"wrote {os.path.relpath(path, ROOT)}: {len(job['items'])} songs, {sum(sum(c['duration_ms'] for c in it['composition_plan']['chunks']) for it in job['items']) / 1000:.0f} s in all")
