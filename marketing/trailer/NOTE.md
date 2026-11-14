# The Miamus trailer: what was made, and why

## Version 5 (15 November 2026): Kakak's new voice

Only Kakak's voice changed. Picture, music, effects and every timing are
v4's, apart from three lines that start a fraction of a second earlier or
later (below). Four cuts, as before: `miamus-60-en.mp4` (the primary),
`miamus-60-id.mp4`, `miamus-15-en.mp4`, `miamus-15-id.mp4`, in
`docs/private/marketing/trailer-v5/`. v4 is untouched in `trailer-v4/`.

- **The voice:** ElevenLabs, model `eleven_v4` (its newest; speaks English
  and Bahasa Indonesia), Voice Library voice "Lyly - Calm, Witty and Clear",
  an Indonesian speaker. The owners chose her blind as "Voice E" from four
  Voice Library voices and the v4 Kokoro voice (unlabelled control):
  https://claude.ai/artifact/JdBsKXEm5CTCb7SaeZD6aA
- **Settings:** stability 0.55, similarity 0.75, speaker boost on (the
  "warm older sister" settings; `eleven_v4` takes no style or speed). Each
  line was spoken with the lines either side as context, three takes each;
  the take used is the one a speech-recognition check heard word for word.
- **Names:** "Kakak" as written gives the Indonesian final stop, as in v4.
  In English, "Miamus" is sent as "Mee-AH-moos" (and "Meeahmoos" for the
  last line, said on its own), because the plain spelling came out as
  "Maya Moose". The check now hears "Miamus" or "Miahmoos". This is the one
  thing to listen for: if the stress still sounds wrong, a retake of the
  four English lines with the name costs about 200 characters.
- **Timing:** the new L1 and S1 run a little longer, so L2 starts 0.25 s
  later (7.95 s) and S2 0.2 s later (7.3 s). In the 15-second Indonesian
  cut, "Miamus. Lebih banyak waktu untuk keluarga." starts 0.4 s earlier
  (11.45 s), still before Kakak's mark appears. Captions follow the voice.
- **Mix:** unchanged from v4: the music steps back about 10 dB under her,
  all four cuts at -14.0 LUFS, true peaks -1.6 to -1.7 dBTP (v4: -1.55 to
  -1.75), loudness range 4.0 to 5.5 LU (v4: 3.5 to 5.7). Measured again in
  the finished MP4s (after AAC): -14.0 LUFS, true peaks -1.5 to -1.6 dBTP.
  Whisper, run on each full mix with the music in, writes down every line.
  Frames checked in all four cuts around every moved line: captions on
  their plates and in step with her voice.
- **Credits:** 5,908 characters in all (auditions 1,956, a name test 444,
  the final 3,204, a retake of the last line 304), on a key limited to text
  to speech and reading voices, capped at 10,000 credits, expiring after 7
  days. The key was pasted by the owner into a hidden prompt and never
  written down.
- **Licence:** Creator plan, commercial use included, ads not excluded;
  every line's request id is in `licences/elevenlabs-provenance.json`.
  Two checks for the owner are in `licences/LICENCES.md` (no beta tag on
  Eleven v4; keep the November invoice).

### To re-render v5

From `marketing/trailer/` on branch `claude/trailer-voice-elevenlabs-77406a`
(after `npm install`, `./audio/setup.sh` and `npm run capture`, as below):

    node audio/cues.mjs && .tools/venv-main/bin/python audio/sfx.py   # once, if audio/out/ is empty
    .tools/venv-main/bin/python audio/music/score.py 60 felt
    .tools/venv-main/bin/python audio/music/score.py 15 felt
    .tools/venv-main/bin/python audio/eleven/jobs.py place lyly --pick audio/eleven/picks-lyly.json
    .tools/venv-main/bin/python audio/mix.py --voice eleven-lyly --music felt
    npm run render

`place` needs the ElevenLabs takes in `audio/out/eleven/` (git-ignored; a
copy is in `docs/private/marketing/trailer-v5/voice/`). To generate new
takes: `./audio/eleven/key.zsh` (asks for a key, hidden), then in another
shell `python audio/eleven/jobs.py final lyly=ZF5uWKM2iVvSId3tBCYt --keys L3`
and `python audio/eleven/check.py final lyly`.

## Version 4 (14 November 2026)

14 November 2026. Four cuts, 1080 × 1920, H.264 with AAC sound:
`miamus-60-en.mp4` (the primary), `miamus-60-id.mp4`, `miamus-15-en.mp4`,
`miamus-15-id.mp4`.

### The idea

One picture carries the film. A child flying a kite at golden hour calls
"Mama, look!", and the day's questions (Dogs fed? Terrace mopped? Done yet?)
land on the scene until it is gone. Kakak clears them. At the end the call
comes again, and this time Mama is standing beside her.

In between is one day, in order: dawn (Kakak introduces herself as the AI
helper), 7:45 (two sentences to Kakak, two cards), the morning (the terrace
task arrives on Sari's phone in Indonesian; she finishes it with two
photos), the day (the house, and each person's progress), 4:30 (all on
track), 5:30 (the one notification), sunset.

The earlier cuts walked through features. This one shows what the features
are for, and still spends about 27 of its 60 seconds on the app's real screens.

### What keeps it honest

- Every phone screen is the real app, captured from a made-up household
  (Sari, Yanti, Budi, Joko; the dogs Coco and Bruno; Maya; Aunt Rina). The
  family in the garden is drawn, and is nobody real.
- Kakak says she is an AI helper at 0:11, with the words on screen. In the
  15-second cut it is her first sentence and a tag beside her name.
- No price, no date, no emoji. Staff screens are Indonesian in both cuts.
- The staff are credited in Kakak's own words: "They run the home. I just
  keep track." The one notification is "Play · Coco & Bruno · Not done yet",
  for a routine set to "Anyone": nobody is blamed, and Kakak's answer is
  "That one's yours."

### Kakak's voice and the music

Both were made on this laptop. I cannot hear, so I chose by measurement and
left the alternates one command away. The listening page has all of them:
https://claude.ai/artifact/FU8ATHKNxF5dYg2ZzxVyCA

- **Voice** (Kokoro-82M): 88 candidates were scored. The one in the film is
  a single speaker with two melodies. A speech-recognition check hears her
  Indonesian as Indonesian (0.96) and writes down every line correctly; an
  accent check hears her English as American. A second engine was tried and
  set aside: the same check hears its Indonesian as Malay.
- **Music** ("Mama, look"): an original lullaby in D, 6/8. Its theme is the
  child's call, three notes that hang in the hook and come home in the last
  bar. Synthesised from scratch; no samples.
- "Miamus" is said mee-AH-moos, "Kakak" the Indonesian way. Both are one
  line each to change.

### Checked, and not

Checked: all four mixes at -14 LUFS, peaks under -1 dBTP; every word that
must be read inside the platforms' safe area; captions never on app text;
frames of all four cuts reviewed; the story in time order.

Not checked, because it needs ears: whether Kakak sounds warm, and whether
the music moves you. That, and the final approval, are yours.

### Licences

Voice: Kokoro-82M, Apache-2.0 (commercial use allowed). Music, effects and
pictures: made for Miamus here, nothing third-party. Fonts: SIL OFL.
Remotion: free for organisations of up to 3 employees. When posting, turn on
the platform's "AI-generated" label. Full terms: `licences/LICENCES.md`.

### To re-render

From `marketing/trailer/` on branch `claude/marketing-trailer-194210`:

    npm install && ./audio/setup.sh        # once
    npm run sound                          # or: npm run sound -- --voice kakak-b --music strings
    npm run render                         # four MP4s into out/, about 15 minutes

Words are in `src/film/copy.ts` and `audio/voice/lines.py`; timings in
`src/film/timeline.ts`. `README.md` has the rest.
