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
   - `eleven/`: Kakak's voice since v5, from ElevenLabs (`eleven_v4`, the
     Voice Library voice Lyly). `key.zsh` asks for the API key (hidden) and
     runs `el.py`, which takes jobs from `jobs.py`; `check.py` hears each
     take; `page.py` builds the blind audition page. See `NOTE.md`.
   - `voice/`: Kakak as she was in v4, spoken by Kokoro-82M. `lines.py` holds her lines (the
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
    .tools/venv-main/bin/python scripts/clean_sheet.py   # v8: the clean base for the typing shot (after capture)
    npm run sound                  # cues, effects, music, voice, mix → public/audio/
    npm run render                 # the four MP4s into out/
    npm run render -- --only=film-60-en
    npm run studio                 # preview and scrub in the browser
    npm run frames                 # review frames into review/ (see scripts/stills.mjs)
    npm run c15 -- <out-dir>       # C1.5 stills on the score (src/stills/): a PNG per shot, the 38 px readability check, half-res slideshows on the v17 mix
    npm run a2 -- <out-dir>        # A2 (src/a2/): Acts 1, 2, 4 moving, Act 3 as stills; half-res MP4s on public/audio/a2-*.wav and a frame sheet each
                                   # the A2 sound: node audio/cues.mjs; .tools/venv-main/bin/python audio/sfx.py;
                                   #   .tools/venv-main/bin/python audio/mix.py --voice eleven-lyly-v14 --mama mama-aita-v14 --music felt --out-name "a2-{cut}-{locale}.wav"
                                   #   (stems in audio/out/: vo/eleven-lyly-v14, vo/mama-aita-v14, music-*-felt.wav, copied from the v17 sound build)
    npm run a3 -- <out-dir>        # A3 (src/a3/): the whole 60 moving, and the 15; half-res MP4s on public/audio/a3-*.wav, sheets, and
                                   #   framecheck-<cut>.json (the 38 px floor and no bubble over a person, on every frame; --strict fails the render)
                                   # the A3 sound: as A2's, with --out-name "a3-{cut}-{locale}.wav"

`npm run capture` needs the app built against the stub host first, from the
repo root:

    NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npx next build

After a build like this, run a normal build again before using the app for
anything else.

## Motion: the kit and the check

- **The kit** (`src/motion/kit.ts`, trailer-reset 28): the film's moves by
  name (`arrive`, `leave`, `handOver`, `word`, `plate`, `footnote`, `draw`,
  `travel`, `drift`, three springs, and `path` / `cameraPath` for one camera
  and one light on one clock). Soft by default; there is no easing argument
  and no straight line. A shot hangs every time from a voice cue or from the
  beat before it (`after`, `each`). `src/motion/turn.tsx` is 5.0–15.0 s of the
  60 built on it (composition `m1-60-en`); `src/motion/onsets.ts` holds
  measured word times. `src/motion/turn-b.tsx` (`m2-60-en`) is the second pass
  after the owner's pick: the same motion in v17's composition (sky frame,
  line 1 in the plate, the thread and pulse that lead the eye to the plate).
  `src/motion/turn-c.tsx` (`m3-60-en`) is the third, after the owner's notes
  on the second: night to morning in one direction, both lines in the sky,
  Kakak's lock-up on the centre line, one firefly from her mark to her plate.
  `src/motion/turn-d.tsx` (`m4-60-en`) is the fourth: Mama walks out of the
  house, and one light travels from her phone to Kakak's mark and down to her
  plate. `src/motion/turn-e.tsx` (`m5-60-en`) is the fifth, calmer: slower
  lights, no light to the plate, the footnote "Kakak is an AI helper". One of
  the five stays at the rebuild.
- **The check** (`scripts/motion-check.mjs`): after a render, lists (a)
  one-frame jumps of the whole picture that are not intended cuts, (b) moves
  that start or stop inside one frame, (c) anything on screen for under 8
  frames. `npm run motion-check -- <film.mp4> --from=5 --to=15 --cuts=15`, or
  `--motion-check` on `npm run render` and `npm run a3`. It measures; it does
  not judge taste. Flying birds and fast small lights show up in (b) and (c).

## Changing things

- **A word on screen or a caption:** `src/film/copy.ts`. If Kakak says it,
  change `audio/voice/lines.py` too (Indonesian lines are phonemes: check a
  new one with `audio/voice/asr.py`), then `npm run sound`.
- **Kakak's voice (v5, ElevenLabs):** `audio/eleven/jobs.py place lyly --pick
  audio/eleven/picks-lyly.json`, then `audio/mix.py --voice eleven-lyly`, then
  `npm run render` (`NOTE.md` has the steps). `npm run sound` alone still
  rebuilds v4's Kokoro voice.
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
