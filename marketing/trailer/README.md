# Miamus trailer

A 60-second and a 15-second vertical trailer (1080 × 1920, 30 fps), in
English (the primary version, owner 13 Nov) and Bahasa Indonesia, made from
real app screens. Staff screens stay Indonesian in both. The storyboard is
the design lead's (private: `docs/private/marketing/trailer-storyboard-2026-11-14.md`).

It lives apart from the app: its own `package.json` and lockfile, nothing
added to the app's dependencies, no app code changed.

## How it works

1. **Capture** (`capture/`): the app, built against the repo's pretend
   Supabase (`tests/e2e/stub-backend.ts`, used read-only), is driven by
   Playwright through a made-up demo household: staff Sari, Yanti, Budi and
   Joko, the dogs Coco and Bruno, everything pinned to Monday 16 Nov 2026,
   16.30 WIB. Stills are saved at 390 × 844 CSS px, 3× density, into
   `public/shots/` (git-ignored; about 60 MB), plus `taps.json` (where each
   tap lands). Owner screens in both languages; staff screens in Indonesian.
   - Kakak's replies are scripted in `capture/script.ts` and answered in
     place of `/api/kakak`, in the route's own reply shape, as
     `tests/e2e/kakak-demo.spec.ts` does. Nothing is sent to the AI. (Practice
     mode is not used: it reads one intent per sentence, and sentence 3 is two
     cards, and it labels its bubbles "(Latihan)".)
   - Photos are drawn in `capture/photos.ts` (soft illustrations of a terrace,
     rooms, a bowl, a tap), not photographed and not stock.
   - Nothing real is reached: the stub aborts any supabase.co request.
2. **Compose** (`src/`, Remotion; every timing in `src/timeline.ts`, on an
   86 BPM grid so music drops in on the beat; all words in `src/copy.ts`, the
   end-card lines at the top as `END_LINES`): the app's screen full-bleed
   (as wide as the frame, so its text is as large as on a phone in the hand),
   pushed in on what matters, with typing, cards, tap circles, a shutter
   flash, two notification cards drawn in the app's own style (not a phone
   maker's lock screen), one caption per shot low in the platforms' safe
   area, and the end card. A device outline appears once: the owner's phone
   beside the staff phone, at the start of the staff shot.

## Commands

From `marketing/trailer/`:

    npm install                        # once
    npm run capture                    # needs the stub build, below
    npm run render                     # all four MP4s into out/, key frames into review/
    npm run render -- --only=trailer-60-id
    npm run render -- --music=music/track.mp3
    npm run studio                     # preview and scrub in the browser
    npm run cues                       # rewrite public/music/cue-sheet.md from the timeline

`npm run capture` needs the app built against the stub host first (from the
repo root):

    NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npx next build

It then starts `next start` on port 3288 (`TRAILER_PORT` to change) with the
same server stub and settings as the e2e tests. After a build like this, run
a normal build again before using the app for anything else.

Rendering reuses the headless Chromium that the repo's Playwright installed
(`remotion.config.ts`), so it downloads nothing.

## Outputs

- `out/miamus-60-en-nomusic.mp4` (primary), `out/miamus-60-id-nomusic.mp4`,
  `out/miamus-15-en-nomusic.mp4`, `out/miamus-15-id-nomusic.mp4`
- `review/*.png`: key frames for review.

Both folders are git-ignored.

## What is not here yet

- **Music:** none licensed. See `public/music/README.md` (the slot and the
  brief) and `public/music/cue-sheet.md` (the arc, cuts and sound effects).
- **Real phone clips:** the storyboard's lock screens are replaced by plain
  notification cards; real recordings can be cut in later.
- **The "Tambah" button** in the storyboard is "Sudah benar" / "Simpan" /
  "Simpan 2" in the app (en: "Looks right" / "Save" / "Save 2"); the film
  shows the real labels.
- **"Segera dipakai"** (shot 9) is not a section in the app; the opor shows
  under "Minggu ini" / "This week".
- **Time order (v3):** Sari is reminded of the 17.00 walk and ticks it; the
  owner's one alert is the 21.30 lights, at night ("Lights off · Coco & Bruno
  · Not done yet (9:30 PM)"), which pays off the sentence typed in shot 3.
- **The staff photos:** the app always asks for a before and an after photo
  (Phase 127), so shot 5 shows both.

## v3 (design lead, 14 Nov)

The screen is exactly the frame's width, never wider; it fades out at y
1300 and every caption sits alone on the plain band below (1300–1500).
Shot 1 alone uses a slightly smaller screen shifted left, so the "Tell Kakak"
pill is whole and clear of the right 160 px. The two-phone beat pushes
straight into Sari's list. Finished states show the top of the list (one
more done), keeping the bottom toast and the Lapor button out of view.

## v2 (design lead's review and the owner's note, 14 Nov)

Full-bleed screens (owner: legible as if watched on a phone); captions in
the app's ink with white text, since a light panel vanishes over a white
screen; a device outline only for the two-phone moment.


Every shot pushed in at least as far as the Kakak shots; one line per caption
(the English cut's second line in shot 6 translates the Indonesian reminder);
the reminder shot ends with Sari's photo and the tick, and the owner's alert
is a different routine; Today opens with the status card out of view ("All
on track" first appears in shot 7); the AI disclosure is a small tag beside
Kakak's name for two seconds; the first card scrolls down to "Looks right";
the opor's date comes from the owner, so the card has no guess label; the
staff shot spends its time on the finished photos (09.02 and 09.24) and the
tick; the first mop is Monday the 16th; fuller Kitchen, Pets and Repairs
screens; warm white by day, dark only for the two evening notifications; no
AI line on the end card.

## Fonts

Plus Jakarta Sans (the app's typeface), from `@fontsource/plus-jakarta-sans`,
copied into `public/fonts/` under the SIL Open Font License
(`public/fonts/OFL-LICENSE.txt`).
