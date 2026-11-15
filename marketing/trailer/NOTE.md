# The Miamus trailer: what was made, and why

## Version 7 (15 November 2026): the moment is hers

The owner's note on v6: Kakak should hand Mama the moment with her
daughter, not the dog task. v7 changes only the end of the film. Four cuts
in `docs/private/marketing/trailer-v7/`; v4 to v6 are untouched.

- **No notification, no ping.** After "All on track" the phone sleeps;
  Kakak says "And you? You'll only hear from me… when something isn't
  done." over the dark phone, and a small clock on its screen runs 4:30 →
  5:30 while nothing arrives. The silence is the promise. ("Did anyone play
  with Coco?" stays among the hook's questions.)
- **The ending, in Fable's order and cue times:** the garden opens close on
  the pair (47.0 s), Mama already beside her; the girl tugs and points, with
  her handwriting and the bell (48.0); Mama shades her eyes, "I'm looking,
  sweetie." (49.0); she takes the girl's hand (~51.2); then Kakak, softly,
  over the two of them: "That one's yours." (51.5). Kakak never speaks
  between the call and the answer. The crane at 53.0, Kakak's end line from
  53.3, "For every" at 56.6, her handwriting and the bell at 57.0.
- **Kakak's line:** EN "That one's yours.", ID "Yang ini untuk Anda."
  ("bagian" read as a share of the work). "Go play" is gone. A soft take
  (eleven_v4's "[softly]" tag, which directs delivery and is not spoken),
  set 3 dB under her usual level.
- **Timing, one set of cues sized for Indonesian:** EN Mama 49.0–50.5,
  Kakak 51.5–52.7, end line 53.3–56.0. ID Mama 49.0–51.2, Kakak
  "Yang ini untuk Anda." 51.4–53.1 (0.1 s sooner than Fable's 51.5, so she
  has a breath before her end line), end line 53.3–56.5 at normal speed.
  Neither end line touches "For every" or the bell.
- **15 s:** unchanged from v6 (it had no ping and no "That one's yours").
- **Checked:** every line word for word (Whisper); the four MP4s at
  -14.0 LUFS; frames of the quiet beat and the ending in both languages.
- **Credits:** 7,014 characters used of the key's 10,000 (v7: 165).

### To re-render v7

As v6, then place Kakak's soft L10 (take 2) into `audio/out/vo/eleven-lyly-v7/`
(a copy of `eleven-lyly-v6/` with `L10.wav` from `audio/out/eleven/v7/lyly/<lang>/L10.t2.*`,
through `jobs.to_wav48` + `jobs.tidy48`, then × 0.708 for -3 dB), and mix with
`--voice eleven-lyly-v7 --mama mama-aita`.

## Version 6 (15 November 2026): the girl's call, understood

Friends who watched v5 missed the story of "Mama, look!". v6 tells it with
Mama's voice and the girl's gestures, and follows one task end to end. Four
cuts in `docs/private/marketing/trailer-v6/`; v4 and v5 are untouched. The
full spec (Fable's notes and the owner's choices) is `V6-SPEC.md`.

- **The hook:** a close two-shot from behind. Mama stands still with her
  phone glowing by her head (the only cool light); the girl tugs her dress
  twice, then points at the kite. Her "Mama, look!" is the bell and her
  handwriting, one word group per note. The camera pulls back and up to the
  kite as Mama says "In a minute, sweetie…" and the day's questions fly out
  of her phone. "Did anyone play with Coco?" is the second question, so the
  notification later lands.
- **One task, end to end, on the score's bars:** Tell Kakak (15–26.4 s,
  only the terrace sentence), the line to Sari's phone and her two photos
  (26.4–38), "All on track" and the one notification (38–47). The
  house-through-the-day and per-person scenes are cut; the music is not.
- **The payoff:** Kakak says "That one's yours. Go play." while the
  notification is still on screen. Mama walks out, the girl gives the same
  tug and points, Mama shades her eyes ("I'm looking, sweetie.") and takes
  her hand. The last human word is Mama's. Kakak says the end line over the
  sky; the mark, name and written line arrive silent on the bell's last
  three notes at 57 s.
- **The girl does not speak.** The owners heard four synthetic child voices
  (open-source, made on the laptop; ElevenLabs does not allow child-like
  voices) and found them robotic. Her voice is the bell; her tugs are soft
  cloth sounds.
- **Captions, three looks:** the girl's handwriting, Mama on a plain sand
  plate, Kakak on her dark plate with her mark. In the 15-second Indonesian
  cut, Mama's answer is a caption only (no room to say it before the end
  line).
- **End card (owner's final):** the mark and "Miamus", then "For every" in
  plain type (56.6 s) and the girl's "Mama, look!" in her handwriting,
  written on with the bell's three notes from 57.0 s; "miamus.app" small,
  last. Indonesian: "Untuk setiap" + "Mama, lihat!". One place to change:
  `end` in `src/film/copy.ts`.
- **Checked:** every line heard word for word by Whisper, in each finished
  mix with the music in; the four MP4s at -14.0 LUFS, true peak -1.5 to
  -1.6 dBTP (after AAC); the 42.7 s ping 38 dB
  above the music in its band, after the pad has faded; frames of all four
  cuts, including close crops of the tug, point and hand-hold.
- **Credits:** 6,849 characters used of the key's 10,000 (v6: 941).

### Voices, all versions

| | Kakak | Mama | The girl |
|---|---|---|---|
| v4 | Kokoro-82M (open source) | none | none (the bell) |
| v5 | ElevenLabs, Voice Library "Lyly" | none | none (the bell) |
| v6 | Lyly, with two new lines | ElevenLabs, Voice Library "Aita" | no voice: the bell, handwriting, cloth tugs |
| v7 | Lyly, "That one's yours." softly at the end | Aita | as v6 |

### To re-render v6

From `marketing/trailer/` on branch `claude/trailer-voice-elevenlabs-77406a`
(after `npm install`, `./audio/setup.sh` and `npm run capture`):

    node audio/cues.mjs && .tools/venv-main/bin/python audio/sfx.py
    .tools/venv-main/bin/python audio/music/score.py 60 felt && .tools/venv-main/bin/python audio/music/score.py 15 felt
    .tools/venv-main/bin/python audio/eleven/jobs.py place lyly --pick audio/eleven/picks-lyly.json
    .tools/venv-main/bin/python audio/child/place_v6.py --mama aita --mama-from audio/out/eleven/v6final --mama-takes en/M1=t1,en/M2=t2,id/M1=t1,id/M2=t1
    .tools/venv-main/bin/python audio/mix.py --voice eleven-lyly-v6 --mama mama-aita --music felt
    npm run render

The ElevenLabs takes are git-ignored; copies are in `docs/private/marketing/trailer-v6/voice/`.

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
