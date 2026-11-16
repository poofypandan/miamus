# The Miamus trailer: what was made, and why

## Version 17 (16 November 2026): speech bubbles; Kakak's AI note as a footnote

Owner's notes on v16. Four cuts in `docs/private/marketing/trailer-v17/`; v16 is untouched. No new takes; the sound
and the timings are v16's.

- **Speech bubbles for the people talking** (`src/ui/bubble.tsx`): soft, rounded, warm cream with a soft brown line
  and shadow, a curved tail to the speaker's head (it follows the camera: the heads are projected from the garden),
  rising a little as it appears; unlike the white notification chips and Kakak's dark plates.
  - The girl's "Mama, look!" (hook and ending, both cuts): in her handwriting, dark ink in the bubble, written on with
    the bell's three notes; in the hook it follows the camera back from the close two-shot to above her in the wide.
  - Mama's "In a minute, sweetie…" (60 s; the 15 s cut has no Mama voice): her own bubble, in the soft serif italic,
    above her head from her first word (2.1 s), beside the girl's; it replaces her caption plate there. Her end line
    "I'm here, sweetie." keeps its plate.
  - The girl's small "Mama…?" (60 s): a small bubble on top of the pile, unanswered.
  - The questions pile up over both bubbles (drawn above them): the girl's is read for about 2 s, Mama's for about
    1.3 s, before the pile reaches them. One early landing spot was swapped with a later one so nothing covers Mama's
    bubble in its first second.
- **Kakak's intro (60 s dawn):** the centre is only her mark, "Kakak*" and her spoken line, written there (words
  brightening as she says them; no caption below). The AI disclosure is a quiet footnote at the bottom of the safe
  area, a soft dark pill, from her first word to the end of the scene (about 3.8 s): EN "*Miamus's AI helper · kakak
  = big sister in Indonesian", ID "*asisten AI Miamus" (Indonesian viewers know the word; the glossary's Kakak is the
  elder-sister character, so "kakak perempuan/abang" would be wrong: "abang" is a brother).
- **15 s:** her name ("Kakak*" with her mark) sits just above her caption, near her line, with the same footnote in
  small type under it (her caption takes the bottom of the safe area), from her first word to the end of her line.
- **Her heart pulses with her voice:** wherever her mark is on screen while she talks (the intro card, the 15 s name,
  every caption plate), the heart scales 1.00–1.05 with a quick loudness envelope of her voice (35 ms up, 0.16 s
  down, eased frame to frame; `pulse` in `vo-data.json`, from `audio/mix.py`), resting when she is silent. The old
  timed double-beat is gone; the glow still follows her slower presence. It belongs to the mark, so it carries over
  to Fable's redesign.
- **Checked:** stutter clean on all four (jumps only at the film's own cuts); -14.0 LUFS, true peak -1.47 to -1.77
  dBTP; 60.011 / 15.019 s; hook, intro, 15 s name row and ending frames against the safe-area overlay in both
  languages; the sound is v16's (no mix changed).

## Version 16 (16 November 2026): the end line hands straight to the card

Owner's verdict on v15: the 15 s cuts are right, so v16's 15 s files are v15's, byte for byte; in the 60 s cuts there
was a pause between Kakak's "…family." and the written line on the bell. Four cuts in
`docs/private/marketing/trailer-v16/`; v15 is untouched. No new takes.

- **60 s: the end line moves later** so her last word ends 0.15 s before the bell at 57.0 (measured from the line's
  own end: EN 2.543 s in, ID 3.116 s in): EN starts 54.31 s (was 53.3; "Miamus" 54.345, frame 1630; "More time…"
  caption 55.36; last word ends 56.85), ID starts 53.73 s (was 53.3; "Miamus" 53.749, frame 1612; caption 54.66;
  last word ends 56.85). The name still arrives on her spoken "Miamus" (it follows the measured onset), now later in
  the crane, over the sky; the girl's handwriting has left by 53.6. The bell (57.0), the address (57.6), the crane
  and the music are unchanged; there is a longer breath after Mama's "I'm here, sweetie."
- **Checked:** stutter clean on both 60 s cuts (jumps only at the film's own cuts); -14.0 LUFS, true peak -1.50 / -1.51 dBTP; 60.011 s; the name first visible the frame after her "Miamus" begins; end frames inside the safe area; the 15 s files are v15's, byte for byte.

## Version 15 (16 November 2026): the brand lock

Owner's note on v14. Four cuts in `docs/private/marketing/trailer-v15/`; v14 is untouched. No new voice takes; the
sound is v14's, unchanged.

- **The name on the word.** The Miamus mark and name arrive together on the onset of Kakak's spoken "Miamus",
  frame-accurate in each language: 60 s EN 53.335 s, ID 53.319 s (both frame 1600); 15 s EN 11.534 s (frame 346), ID
  11.328 s (frame 340). The onset is measured from her line itself (`audio/mix.py` writes it to `vo-data.json` as the
  cue's "onset"; `brandFrame` in `src/film/scenes.tsx` reads it), so it follows any future take. They stay to the end.
  The line writes on with the bell as before (57.0 / 13.0), the address last (57.6 / 13.4).
- **The caption.** The spoken "Miamus" is no longer captioned (the name itself is on screen); "More time for your
  family." / "Lebih banyak waktu untuk keluarga." keeps a caption, from the pause after the name (EN about 1.05 s, ID
  about 0.93 s into the line), so it still reads with the sound off, as most feeds play.
- **The girl's handwriting** ("Mama, look!") now leaves just before the name arrives; they shared the same place on
  screen. It still writes on with the bell (45.2 / 10.0) and is read in full.
- **60 s:** the crane and music are unchanged; the name appears 0.33 s into the crane, over the roofline, and rises
  into the sky with it, inside the safe area.
- **15 s:** the crane now starts as she says "Miamus" (11.33 s, the Indonesian onset; was 11.93), the same length, so
  the name rises into the sky instead of sitting over Mama's head; Mama's hold before it ends there. Line and address
  unchanged.

## Version 14 (16 November 2026): Kakak alone in the 15 s cuts; Mama's "Kak," with a glottal stop

Owner's notes on v13. Four cuts in `docs/private/marketing/trailer-v14/`: 60 s ID is v13's file, byte for byte
(copied); 60 s EN and both 15 s cuts are new. v13 is untouched.

- **15 s: one line for Kakak** instead of "I'm Kakak, Miamus's AI helper." then "Tell me once,":
  EN "Hi, I'm Kakak. Tell me once, and everyone at home knows what to do."
  ID "Halo, ini Kakak. Bilang sekali, dan semua orang di rumah tahu harus apa." ("Halo, ini Kakak" as in her 60 s
  introduction; the rest is the 15 s line already approved; no glossary terms touched.) Lyly, three takes per
  language; take 1 used in both, the clearest by speech check (English take 2's name was heard as "Kaka"). English
  sent as "Hi! I'm Kakak." for a clear K, as in v12.
- **15 s: her name and the AI tag on screen** from her first word: the 15 s cut had no name on screen (the spoken
  line was the disclosure), so a compact row at the top of the safe area (her mark, "Kakak", the "Miamus's AI
  helper" / "asisten AI Miamus" pill) springs in at 3.15 s and leaves after her line (8.7–9.1 s), clear of the cards
  (`KakakBadge` in `src/film/scenes.tsx`, 15 s only; `CARDS15.badge`).
- **15 s: no Mama voice.** "In a minute, sweetie…" in the hook and her answer at the end are gone, voice and
  captions; her picture beats (phone up and distracted, then phone down and looking up), the girl's handwriting with
  the bell and Kakak's line stay.
- **15 s timing:** Kakak's line is said in one breath, so nothing was sped up: 3.15–7.63 s (EN), 3.15–8.43 s (ID);
  its caption changes plate at the comma's breath (5.72 / 5.75 s), each plate two lines (`CAPTION_SPLIT` in
  `audio/mix.py`). The garden, tug and bell 10.0, Mama looking up 10.5–11.0. The end line moves a little earlier,
  into the room her answer's caption had: EN 11.85 → 11.5 s (to 14.2), ID 11.5 → 11.3 s (to 14.5), now at its
  natural pace (the 3% speed-up was only there to fit Mama's answer).
- **60 s EN: Mama's "Kak," with a glottal stop.** Indonesians end "Kak" with the vowel stopping, no k released; the
  English take released a hard k. Aita, three spellings × three takes ("Ka',", "Kah,", "Kaa',"), compared by
  spectrogram against her Indonesian "Kak,": "Ka'," take 2 stops the vowel to silence with no burst before "have"
  ("Kah," breathes and clicks; "Kaa'," draws the vowel out to 0.3–0.4 s). The screen still shows "Kak," as typed; the
  typed words are re-timed to the new take (within 0.07 s of v13). An English speech model writes it as "K".
- **Checked:** see below; every line word for word (the 15 s English end line shows Whisper's usual trouble with the
  brand name, as on v13).
- **Credits:** 861 characters (Kakak 417, Mama 444); project 9,495.

## Version 13-lofi-H (15 November 2026): v13 on the owner's Eleven Music track 4 (Score H)

**Eleven Music, Creator plan, owner-generated 15 Nov; not for publication until ElevenLabs confirms company-ad use.**
Four cuts in `docs/private/marketing/trailer-v13-lofi-H/`, for the owner to hear Score H in the film; v13-lofi (K) and
v13 are untouched. The same treatment as K (below): v13's picture byte for byte, the same bar-line fit
(`owner-eleven-4`: bar 3.555 s, groove entering at bar 5), the music ducked under the voices, the bell and chimes in
C, the 5 dB dip under "Miamus".

- **Its ending:** track 4 does not fade; it stops on beat 3 of its bar 16 (film 55.9 s) and its chord dies away by
  about 57, before the card. On bar lines the stop can only fall at 55.9 or 59.5 (too late, its tail cut), and a
  one-beat shift would leave a five-beat bar, which is heard. So the stop stays at 55.9, and on the next bar line
  (57.7 s, as the address appears) the track's own opening chord (its first intro bar) comes back, 5 dB down, and
  rings out to 60 (`eleven_owner.py --coda 4`: `music-60-eleven-owner-4c.wav`). The 15 s cut ends on the stop itself
  (12.8 s, under the mark), with no room for the chord.
- **Checked:** stutter clean on all four (jumps only at the film's own cuts); -14.0 LUFS, true peak -1.6 to -2.5
  dBTP; 60.0 s and 15.0 s; every line word for word; the picture identical to v13.
- **To re-make:** `eleven_owner.py --coda 4`; copy `music-15-eleven-owner-4.wav` to `music-15-eleven-owner-4c.wav`;
  `audio/mix.py --voice eleven-lyly-v12 --mama mama-aita-v11 --music eleven-owner-4c --sfx C --brand-dip 5`; mux as
  for K; `git checkout -- public/audio src/film/vo-data.json`.

## Version 13-lofi (15 November 2026): v13 on the owner's Eleven Music track

**Eleven Music, Creator plan, owner-generated 15 Nov; not for publication until ElevenLabs confirms company-ad use.**
Four cuts in `docs/private/marketing/trailer-v13-lofi/`; v13 stays the lullaby version and is untouched.

- **The picture is v13's, byte for byte.** Only the sound changed: the new mixes were put onto v13's video streams
  without re-encoding (the captions and Kakak's level for the picture depend only on the voices, which are v13's).
- **The track:** `owner-eleven-3` of the four the owner made in the ElevenLabs app (Eleven Music v2.5, 60 s each).
  All four are about 68 bpm, in C, dark, with a keys-only intro and the groove entering on a bar line, and none has a
  quiet section. Track 3 fits best by measurement: the deepest quiet once fitted (-39.8 dB at 43–46 s, 21 dB under
  its groove), the strongest return on 47.0 (a 36 dB step), and an ending of its own (a last hit at 56.8 s, on the
  end card, decayed to almost nothing by 60). Tracks 1 and 2 would have their own fades cut at 60 s; track 4 goes
  quiet before the card. The other three stay on the listening page as alternatives.
- **The edit, on the track's own bar lines** (bar 3.555 s; `audio/music/eleven_owner.py`, map in
  `audio/out/eleven-owner-edits.json`; no notes changed): from 5.0 s the intro's last 3 bars into the groove's own
  entrance (15.4 s); 8 bars of groove, the last fading 14 dB and closing to 400 Hz; 43.4–47 s the intro's last bar,
  10 dB down, with the bell on top; 47.0 the groove's own entrance (continuous with that bar in the track: no edit at
  the return); 2 bars; the track's ending from its bar 16. 40 ms equal-power crossfades. 15 s cut: the groove's
  entrance at 3.0, 8 beats, one quiet beat (10.1–11.0) under the bell, the track's last bar from 11.0, its last hit
  13.7 s. The seams measure like the track's own downbeats (spectral change within the range of unedited ones).
- **The girl's bell and the chimes in C** (`audio/sfx.py --key C`: A A C# becomes G G B, the same call), so they sit
  in the track's key.
- **"Miamus" at the end line:** under the full groove it was sometimes misheard, so the music dips 5 dB more under the
  first 1.3 s of the end line (`--brand-dip 5`); it is now heard as "Miamus" in the long cut.
- **Checked:** stutter check clean on all four (no holds; the only jumps are the film's own cuts, 15.0 s and 3.0 /
  10.0 s, as in v13); -14.0 LUFS, true peak -2.0 to -2.4 dBTP; 60.0 s and 15.0 s; every line word for word in the
  finished mixes (Whisper's usual "Mia Moose" in the quick 15 s English read is the same on v13's lullaby mix).
- **To re-make:** `audio/sfx.py --key C`; `audio/music/eleven_owner.py`; `audio/mix.py --voice eleven-lyly-v12
  --mama mama-aita-v11 --music eleven-owner-3 --sfx C --brand-dip 5`; then mux each `public/audio/mix-*.wav` onto
  `trailer-v13/miamus-*.mp4` (`-c:v copy`, AAC 320k, after a 4× oversampled limit at -2.4 dB); then
  `git checkout -- public/audio src/film/vo-data.json` to put v13's mix back.
- **Also on the listening page:** seven scores composed here (`audio/music/lofi.py`; rounds 1 and 2, the second on
  measurements of a lo-fi mix the owner likes), which are ours to use in ads if the licence answer is no.

## Version 13 (15 November 2026): 60 s, on the score as composed

Owner's notes on v12. Four cuts in `docs/private/marketing/trailer-v13/`;
v12 is untouched.

- **Exactly 60 s, no spliced bars.** The owner heard the cut in v12's
  repeated bar, so the score is played as composed (`REPEAT_BARS = ()` in
  `audio/music/score.py`) and the picture fits the music: the cards run
  15.0–41.0 s; the garden comes into focus wide with Mama beside the girl
  (41.0–42.0), one eased push-in (43.4–44.8), then the composed cues: tug,
  call and bell 45.0; Kakak "That one's yours." 47.0, where the score opens;
  Mama turns ~48.4 and answers 49.4; the hand 51.0; crane 53.0; end line
  53.3; card 57.0; address 57.6.
- **"Tell me once." is gone** (it repeated "Just tell me what you need"). In
  its place, a soft voice-note chime as the mic starts listening (16.3 s):
  two short round notes a fourth apart, synthesised like the other effects,
  ducking nothing. "I'll take it from there." stays, with Kakak's card.
  (The 15 s cut keeps its "Tell me once,": it has no "Just tell me what you
  need" to repeat.)
- **Shorter tails:** the listening card leaves about 0.5 s after Mama's last
  word; each card leaves once it is read (about 2 s), the 0.4 s overlap kept;
  "All on track" holds through L8–L9, then about 2 s of quiet before the garden.
- **End card:** "For the little moments" / "Untuk momen-momen kecil", no
  full stop, "little" / "kecil" in the soft italic.
- **Music checked:** the score has no sudden drops anywhere; its only sharp
  entries are the composed ones on bar lines (5.0 s, the first bar; 47.0 s,
  the full band). Its own level changes start on bars (39, 47, 55, 57 s).
  Both finished mixes were checked for clicks (none) and for spectral jolts
  in 38–47 s and the climax: the only jolts are the consonants of L9 over the
  quiet bed (38.0–38.9), the call's bell notes and the cloth tug on bar 45
  (45.1–45.9), and Kakak's "That one's yours." at 47.5. No cut in the music.
- **Checked:** the stutter check clean on all four cuts, with no exceptions;
  MP4s at -14.0 LUFS, true peak -1.5 to -1.6 dBTP, the long cut 60.0 s;
  every line word for word in the finished mixes; MP4 frames against the
  safe-area overlay.
- **Credits:** 8,634 characters used of the key's 10,000 (v13: none).

## Version 12 (15 November 2026): clear but moving

Owner's notes on v11. Four cuts in `docs/private/marketing/trailer-v12/`
(the long cut is `miamus-62-*`); v11 is untouched.

- **Kakak's intro, the why:** "Hi, I'm Kakak. Just tell me what you need." /
  "Halo, ini Kakak. Bilang saja apa yang Anda perlukan." (the way she
  introduces herself elsewhere, "ini Kakak", and the owner as Anda, per the
  glossary). The "Miamus's AI helper" tag stays on screen while she speaks:
  that is the AI disclosure. New Lyly takes (ID take 3; EN take 4, sent as
  "Hi! I'm Kakak." for a little more lift on the name: the first English
  take was right on its own but its soft K was heard as "Taka" under the
  music). Her name and the tag spring in as she starts (11.2–11.5 s).
  "Tell me once." later stays.
- **The mic press lands on the mic.** v11 used the tap point recorded on the
  listening screen's layout, so the ripple sat on "Nothing is saved until
  you confirm"; it now uses the mic's position on the idle sheet itself.
- **No press on any card.** Kakak's card rings only what / who / when; Sari's
  card rings only the "Pel teras" task line, then her photos pop on. The
  checks and the arrivals ("Saved", "selesai") stay.
- **Pacing:** each card holds about 2 s, and the next begins entering as the
  last settles (0.4 s overlap). With that the cards need less time, so the
  score repeats one bar instead of four (bar 18, the held F#, under "All on
  track"): **62 s**. Two repeated bars (64 s) would have left about 8 s with
  nothing new to show. The composed ending is intact, on its bars: tug, call
  and bell 47.0; "That one's yours." 49.0, where the score opens; Mama 51.4;
  the hand 53.0; crane 55.0; end line 55.3; card 59.0; address 59.6; end
  62.0.
- **Ending continuity:** the last card leaves; the garden comes into focus,
  wide, with Mama already standing beside the girl (44.0–45.0); then one
  eased push-in to the close two-shot (45.4–46.8), with no cut, before the tug.
- **Checked:** the stutter check clean on all four cuts, with no exceptions;
  MP4s at -14.0 LUFS, true peak -1.4 to -1.7 dBTP; every line in the
  finished mixes (Kakak's name heard as "Kaka", the Indonesian final stop,
  as since v5); frames from the MP4s against the safe-area overlay,
  including the dawn shot with the AI tag on screen from her first word.
- **Credits:** 8,634 characters used of the key's 10,000 (v12: 408).

## Version 11 (15 November 2026): cards, so anyone can follow it

The owner's mother-in-law watched v10 and did not understand what the app is
for. v11 shows the phone once, then one key element at a time as a card. The
long film is now 68 s; the 15 s cut stays 15 s. Four cuts in
`docs/private/marketing/trailer-v11/` (the long cut is named `miamus-68-*`);
v10 is untouched. Spec: `V11-SPEC.md`.

- **The phone once:** a short real shot of Kakak's sheet (15.0 s). Mama
  presses the mic (a slight dip and a soft terracotta ripple; no finger).
- **Then cards:** each element is cut from the real captures (never redrawn),
  enlarged to the full safe width (about 2.4x the phone), centred over the
  softly blurred garden as the day passes behind it, one at a time; each
  lands, holds about 2.5 s, and leaves. The terracotta ring marks the key line.
  A small tag says who it is for ("You" / "Anda", "Sari").
  1. Kakak listening (16.6 s): the app's real listening screen, its halo
     breathing as the app animates it, Mama's words appearing as she says
     them.
  2. Kakak's suggestion card (22.6): the ring on what / who / when; a press,
     then a check settles on; "Saved — Mop the terrace, Sari" arrives under
     it (26.6) with its own check.
  3. Sari's task list with the "Pel teras" card ringed (30.2), her two photos
     popping onto it (cut from her real photo screen); "Pel teras" selesai
     arrives under it (36.2) with a check.
  4. "All on track" with the day's progress under it (40.0), under "I just
     keep track." and "And you? You'll only hear from me… when something
     isn't done."
  Then about 2 s of quiet; the garden comes into focus at 50.6–52.2 s.
- **Mama talks to Kakak by name:** "Kak, have Sari mop the terrace every
  Monday at 9." / "Kak, minta Sari pel teras setiap Senin jam 9." "Kak,"
  shows in the words, as the app would. Aita, unhurried; the Indonesian was
  sent with a breath after "teras" so it is heard clearly (the words on
  screen are unchanged). Mama sits a little further back in the mix, with a
  touch more room; Kakak stays close and clean. Mama's own lines keep her
  sand plate.
- **No clock** and no dark-phone wait.
- **Composed for the whole safe area** (owner): everything stays clear of the
  top 10%, the bottom 25% and the right 15% (the platforms' captions,
  usernames and buttons). Cards are centred between their tag and Kakak's
  caption at about 88% of that width; the caption plate now sits just above
  the bottom zone, under the card (it ended at 1282 px; now 1440), and is
  centred in the clear area. Short elements ("Saved", "selesai", "All on
  track") come with real context from the same captures (they arrive under
  the card they follow; the day's progress under "All on track") rather
  than decoration. Every card beat was checked against a safe-area overlay.
- **68 s, and why:** at 60 s the last card cannot hold "I just keep track.",
  L8, L9 and a real 2 s pause before the garden opens on its bar. The score
  plays four middle bars twice (7 and 9, the tell pulse; 15, Sari's F#–D;
  18, the held F#), spliced on their bar lines, so the composed ending and
  its level rise arrive exactly 8 s later (`lengthen` in
  `audio/music/score.py`): tug, call and bell 53.0; Kakak "That one's
  yours." 55.0, where the score opens; Mama 57.4; the hand 59.0 and a 2 s
  hold; crane 61.0; end line 61.3; card 65.0 ("For the little moments.");
  address 65.6; end 68.0. Reels, TikTok and Shorts all take 68 s.
- **15 s:** cards too: Kakak's suggestion card with its check, "Saved", and
  Sari's card with her photos. Unchanged otherwise.
- **Smooth:** caption plates now enter with an ease-in-out over 12 frames
  (an ease-out read as a pop over the calm blurred garden); presses dip on a
  smooth curve and their rings fade in. The stutter check is clean on all
  four cuts, with no exceptions.
- **Checked:** MP4s at -14.0 LUFS, true peak -1.4 to -1.6 dBTP; every line
  word for word in the finished mixes (Mama's "Kak," request included);
  frames from the MP4s of every card beat, the climax and the end card,
  against a safe-area overlay.
- **Credits:** 8,226 characters used of the key's 10,000 (v11: 555).

## Version 10 (15 November 2026): Mama says it

The owner's note on v9: in the "tell Kakak" beat, Mama should say the
sentence, to show the voice feature. Everything else is v9's. Four cuts in
`docs/private/marketing/trailer-v10/`; v9 is untouched.

- **The real voice screen.** The app's listening state (the default voice
  flow in `src/components/kakak/kakak-voice.tsx`: the black Stop button
  with its halo, "Listening… tap Stop when you're done" / "Kakak
  mendengarkan… ketuk Berhenti kalau sudah", the words live in the typing
  box) was captured from the demo build against the read-only stub
  (`capture/listen.capture.ts`), with no app code changed. The phone's
  speech recogniser is replaced in the page only by a fake of the same
  shape the app's own tests use; the capture hands it the sentence.
- **The beat (60 s):** the phone opens on Kakak's sheet (the mic, "Tap and
  talk"); 16.3 s Mama taps the mic; the app listens; from 16.6 s she says
  "Have Sari mop the terrace every Monday at 9." / "Minta Sari pel teras
  setiap Senin jam 9." and each word appears in the box 0.12 s after she
  says it (onsets measured on her take with Whisper), with no cursor; the
  box is two lines tall from the start and the suggestions are hidden (the
  base is the real listening screen with its words painted out,
  `scripts/clean_sheet.py`); 19.8 s she taps Stop (which sends it, in the
  app); the card at 21.0 s as before. Kakak says "Tell me once." just
  before. Sound off, the words on screen carry it.
- **Mama's take:** Aita. EN "[slightly hurried]", take 1. ID retaken
  unhurried (the hurried takes ran "pel teras" together, heard as
  "Peltera"), take 1: every syllable is there, including the final s
  (Whisper spells it "Pelteras", as one word). Her words appear on screen
  in step with each take.
- **Checked:** the stutter check clean on all four cuts (the mic tap is a
  planned 4-frame change, under the tap ring); MP4s at -14.0 LUFS, true peak
  -1.4 to -1.6 dBTP; Mama's sentence and Kakak's lines around it heard in
  the finished mixes; frames from the MP4s through the spoken beat.
- **15 s:** unchanged from v9 (typed): three seconds cannot hold a spoken
  sentence and the card.
- **Credits:** 7,671 characters used of the key's 10,000 (v10: 486).

## Version 9 (15 November 2026): room to breathe, and the why

Owner's notes on v8, with Fable's cues. Four cuts in
`docs/private/marketing/trailer-v9/`; v4 to v8 are untouched. No new voice
takes; the music is not re-cut.

- **The climax, spaced on the score's bars** (bar lines fall on the odd
  seconds): 45.0 the tug, her handwriting and the bell (the call rings in
  the last quiet bar); 47.0 Kakak, softly, "That one's yours." (the score's
  level rises exactly here: `sixty()` in `audio/music/score.py` holds at
  -7 dB until 46.8 s and reaches 0 dB at 47.0 s); Mama turns from ~48.4 and
  answers at 49.4, "I'm here, sweetie." / "Mama di sini, sayang."; 51.0 the
  hand, then a 2 s hold; 53.0 the crane; 53.3 Kakak's end line.
- **The quiet beat gives up 2.8 s:** "All on track" 38.0–41.0 (L8 from
  38.6), the phone dark at 41.0, L9 while the clock runs (ends 43.0 EN /
  43.5 ID), the garden on the pair at 44.2.
- **End card, the why:** "For the little moments." / "Untuk momen-momen
  kecil." (the owner's final; it avoids repeating "here" after Mama's
  "I'm here, sweetie.") in the plain type, smaller than the name, with
  "little" / "kecil" in the soft italic of "once?" at dawn; it fades up at
  57.0 with the bell, and "miamus.app" at 57.6. No handwriting on the card.
  One line in `src/film/copy.ts` (`end`; `em` is the italic word, optional).
- **15 s:** no "That one's yours."; the garden cut at 10.0 with the tug and
  bell together; the hand at 11.0 is Mama's answer, her words a caption (a
  spoken line would run into the end line, which must end by 14.8); the end
  line from 11.85 (EN; ID 11.5, 3% quicker), ending 14.55 / 14.6; the
  card's line on the bell at 13.0, the address at 13.4.
- **Checked:** the stutter check clean on all four cuts (only the planned
  dip to black at 5.0 s); MP4s at -14.0 LUFS, true peak -1.5 to -1.6 dBTP;
  every changed line word for word; frames from the MP4s of the quiet beat,
  the climax and the card in both languages.

## Version 8 (15 November 2026): the hand-over, and no stutter

Owner's notes on v7. Four cuts in `docs/private/marketing/trailer-v8/`;
v4 to v7 are untouched.

- **The ending, in the owner's order:** the girl tugs and points, with her
  handwriting and the bell (48.0 s); Kakak says softly "That one's yours." /
  "Yang ini untuk Anda." over the tug itself, starting on it, so the child
  is never seen waiting on an AI; Mama answers at once, "I'm here, sweetie."
  / "Mama di sini, sayang." (EN 49.3, ID 49.85), her hand coming up as she
  speaks; then she takes the girl's hand. 53.0 onward is unchanged (crane,
  end line, "For every" + "Mama, look!"). In Indonesian, Mama's gestures
  follow her longer line. The 15 s cut uses the new answer too (voiced EN,
  caption ID).
- **Mama's new line:** Aita, "[warmly]" (an eleven_v4 audio tag that directs
  delivery and is not spoken), 3 takes per language; EN take 1, ID take 3
  (take 1 was heard as "Mau di sini"; take 2 lost its soft "M" in the
  trim). The Indonesian take is trimmed more gently so the "Ma-" stays; a
  copy of the placed file is in `trailer-v8/voice/`.
- **Smooth typing:** the sentence in Kakak's sheet is drawn over the app's
  own screenshot at a steady 15 characters a second (one every 2 frames),
  with a blinking cursor. The input is two lines tall from the start, so
  nothing jumps when the text wraps, and the "Try saying" suggestions are
  hidden for this shot. In 60 s it types 16.9–19.8 s; the 15 s cut opens
  with the first words typed and types the last 22 characters at the same
  rate. Before, 14 screenshots were held ~5.6 frames each, and the input
  grew when the sentence wrapped (the stutter at 0:19).
- **Soft screen changes:** every screen swap cross-fades over 12 frames
  (photos 8, under the shutter flash). Camera moves already ease in and out.
  The sheet opens onto a clean base made from the app's own screenshot
  (`scripts/clean_sheet.py`: input empty and two lines tall, send button
  grey, no suggestions), so nothing ghosts through the fade. The app's
  "thinking" screen (a half-height sheet) is dropped: cross-fading between
  sheet heights made a double exposure; the typed sheet now fades straight
  to Kakak's card, still at 21.0 s.
- **Captions cross-fade:** where two of Kakak's lines come close (Indonesian
  L5→L6, both 15 s S1→S2), the plates now cross-fade instead of snapping.
- **Stutter check:** `scripts/smooth.py` decodes each finished MP4 and
  flags frames that freeze in the middle of a move or jump more than their
  neighbours away from a planned cut. On v7 it found the 0:19 wrap jump and
  three short screen swaps. On v8: no jumps and no freezes in any of the
  four cuts, apart from the planned dip to black between the hook and dawn
  (5.0 s).
- **Checked:** every changed line word for word in the finished mixes;
  the four MP4s at -14.0 LUFS, true peak -1.5 to -1.6 dBTP; frames from the
  MP4s around the typing, the screen changes and the ending.
- **Frame rate:** kept at 30 fps. All three platforms accept 30 and 60; the
  film's motion is slow, eased camera work that is smooth at 30; the stutter
  came from held screenshots, not the frame rate; and 60 fps would mean
  re-timing every frame-based cue and doubling render time and file size.
- **Credits:** 7,185 characters used of the key's 10,000 (v8: 171).

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
| v8 | Lyly, "That one's yours." on the tug | Aita, "I'm here, sweetie." | as v6 |
| v9 | as v8, spaced: Kakak at 47.0 | as v8, at 49.4 | as v6 |

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
