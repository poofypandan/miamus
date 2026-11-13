# The Miamus trailer: what was made, and why

14 November 2026. Four cuts, 1080 × 1920, H.264 with AAC sound:
`miamus-60-en.mp4` (the primary), `miamus-60-id.mp4`, `miamus-15-en.mp4`,
`miamus-15-id.mp4`.

## The idea

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

## What keeps it honest

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

## Kakak's voice and the music

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

## Checked, and not

Checked: all four mixes at -14 LUFS, peaks under -1 dBTP; every word that
must be read inside the platforms' safe area; captions never on app text;
frames of all four cuts reviewed; the story in time order.

Not checked, because it needs ears: whether Kakak sounds warm, and whether
the music moves you. That, and the final approval, are yours.

## Licences

Voice: Kokoro-82M, Apache-2.0 (commercial use allowed). Music, effects and
pictures: made for Miamus here, nothing third-party. Fonts: SIL OFL.
Remotion: free for organisations of up to 3 employees. When posting, turn on
the platform's "AI-generated" label. Full terms: `licences/LICENCES.md`.

## To re-render

From `marketing/trailer/` on branch `claude/marketing-trailer-194210`:

    npm install && ./audio/setup.sh        # once
    npm run sound                          # or: npm run sound -- --voice kakak-b --music strings
    npm run render                         # four MP4s into out/, about 15 minutes

Words are in `src/film/copy.ts` and `audio/voice/lines.py`; timings in
`src/film/timeline.ts`. `README.md` has the rest.
