# MUSIC SLOT

No track is licensed yet, so every render so far is silent, captions only.

To add one: put a track whose licence covers advertising on social platforms
here (for example `track.mp3`), keep its licence document beside it, then:

    npm run render -- --music=music/track.mp3

## The brief

- Calm, Japanese-style ambient (owner, 13 Nov), warm and unhurried; no
  vocals. 80–92 BPM; the cut is built on an **86 BPM** grid, so a track at 86
  lands every cut on a beat (the 60-second cut is exactly 86 beats).
- The arc, with exact times, is in `cue-sheet.md` (generated from
  `src/timeline.ts` by `npm run cues`): near silence under the hook, one
  motif, a pulse building with each Kakak sentence, a lift for the staff
  phone, the high point on "All on track", near silence under the "not done"
  notification, the pulse back, and a real ending on the last beat, not a fade.
- The composition only adds a safety net on the level (quiet under the hook,
  almost nothing under shot 8, no fade-out); the arc itself is the track's.

Sound effects (taps, shutter, chimes) are not placed yet; their times are in
`cue-sheet.md`.
