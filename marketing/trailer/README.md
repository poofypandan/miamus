# Miamus trailer ("Mama, look!")

Four cuts of one film, vertical 1080 × 1920 at 30 fps, for Reels, TikTok and
Shorts: 60 seconds and 15 seconds, English (the primary) and Bahasa
Indonesia. Start with `NOTE.md` (what was made and why) and
`licences/LICENCES.md` (the right to use every part in paid ads).

It lives apart from the app: its own `package.json`, nothing added to the
app's dependencies, no app code changed, no database or deployment touched.

## How it is made

1. **The app's real screens** (`capture/`). The app, built against the
   repo's pretend Supabase (`tests/e2e/stub-backend.ts`, read-only), is
   driven by Playwright through a made-up household: staff Sari, Yanti, Budi
   and Joko, the dogs Coco and Bruno, pinned to Monday 16 Nov 2026. Stills at
   390 × 844 CSS px, 3×, go to `public/shots/` (git-ignored). Kakak's replies
   are scripted in `capture/script.ts`; nothing is sent to the AI. Owner
   screens in both languages; staff screens in Indonesian, as in the app.
2. **The world** (`src/world/`). A garden behind a house, hills and a volcano,
   a wide sky, a child with a kite, her mother, two dogs: drawn in code, lit
   by the hour (`tod.ts`), moved by a camera with parallax. No photographs,
   no stock, no image model.
3. **The film** (`src/film/`, `src/ui/`). Scenes in `scenes.tsx`, every word
   in `copy.ts`, every timing in `timeline.ts`. Words that must be read stay
   inside the platforms' safe area (`src/theme.ts`); the family is framed
   above the caption band; captions sit on their own plate and the phone's
   picture melts away above them, so they are never on app text.
4. **The sound** (`audio/`), all made locally:
   - `voice/`: Kakak, spoken by Kokoro-82M. `lines.py` holds her lines (the
     Indonesian as hand-written phonemes), `speak.py` the candidate voices,
     `explore.py` and `accent.py` how they were measured.
   - `music/`: the score (`score.py`) and its instruments (`dsp.py`).
   - `sfx.py`: effects and the garden's air. `mix.py`: the final mix of each
     cut at -14 LUFS, and the timings the captions follow
     (`src/film/vo-data.json`).

## Commands

From `marketing/trailer/`:

    npm install                    # once
    ./audio/setup.sh               # once: the sound tools, under .tools/ (add --chatterbox for the second voice engine)
    npm run capture                # the app's screens; needs the stub build, below
    npm run sound                  # cues, effects, music, voice, mix → public/audio/
    npm run render                 # the four MP4s into out/
    npm run render -- --only=film-60-en
    npm run studio                 # preview and scrub in the browser
    npm run frames                 # review frames into review/ (see scripts/stills.mjs)

`npm run capture` needs the app built against the stub host first, from the
repo root:

    NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npx next build

After a build like this, run a normal build again before using the app for
anything else.

## Changing things

- **A word on screen or a caption:** `src/film/copy.ts`. If Kakak says it,
  change `audio/voice/lines.py` too (Indonesian lines are phonemes: check a
  new one with `audio/voice/asr.py`), then `npm run sound`.
- **Kakak's voice:** `npm run sound -- --voice kakak-b` (the candidates are
  in `audio/voice/speak.py`), then `npm run render`.
- **The music:** `npm run sound -- --music strings` (or `tines`, `felt`).
- **A timing:** `src/film/timeline.ts`; the sound follows it on the next
  `npm run sound`.
- **How "Miamus" or "Kakak" is said:** the two lines at the top of
  `audio/voice/lines.py`.

## Outputs

- `out/miamus-60-en.mp4` (primary), `out/miamus-60-id.mp4`,
  `out/miamus-15-en.mp4`, `out/miamus-15-id.mp4`: H.264, AAC 48 kHz stereo.
- `public/audio/mix-*.wav`: the four soundtracks. `audio/out/mix-report.json`:
  their measured loudness.

`out/`, `public/audio/`, `public/shots/`, `audio/out/` and `.tools/` are
git-ignored: everything in them is rebuilt by the commands above.

## Fonts

Plus Jakarta Sans (the app's typeface), Mali (the child's handwriting) and
Fraunces (one italic word), from `@fontsource`, in `public/fonts/` under the
SIL Open Font License.
