# Trailer v4: where it stands

Kept current so the work can be picked up after a pause (usage limit, sleep).
Branch `claude/marketing-trailer-194210`, folder `marketing/trailer/`.

## The film ("Mama, look!")

One image carries it: a child flying a kite at golden hour calls "Mama, look!",
and the day's questions pile over the scene until it is gone. Kakak clears
them. At the end the same call comes again, and this time Mama is there.

A full day, in time order: evening (hook) → dawn (Kakak) → 07.45 (tell her
once) → the day (staff, in Indonesian, with photos) → 16.30 (all on track) →
17.30 (the one alert: "Play · Coco & Bruno · Not done yet") → sunset (that
one is hers) → dusk sky (end card).

The demo household, all invented: Mama, Papa, Maya and Leo; staff Sari,
Yanti, Budi, Joko; the dogs Coco and Bruno; Aunt Rina's opor.

| s | Scene | Kakak says (EN) |
|---|---|---|
| 0–5 | Hook: garden, "Mama, look!", questions bury it | |
| 5–11 | The turn, at dawn | Running a home takes a lot of asking. / What if you only had to say it once? |
| 11–15 | Kakak's mark draws itself at sunrise, tagged as the AI helper | Hi. I'm Kakak, the AI helper inside Miamus. |
| 15–25 | Owner's phone: two sentences, two cards | Tell me once. / I'll take it from there. |
| 25–31 | The line travels to Sari's phone, in Indonesian | And everyone at home knows what to do. / In their own language. On their own phone. |
| 31–39 | Sari's photos and tick; the house through the day | They run the home. / I just keep track. |
| 39–47 | All on track; the phone sleeps; one notification | And you? You'll only hear from me… / …when something isn't done. |
| 47–55 | Payoff: the garden again, Mama beside the child | That one's yours. |
| 55–60 | End card in the dusk sky | Miamus. More time for your family. |

Music: 6/8 lullaby in D, one pulse a second, bars from 5.0 s. The child's
three-note call ("Ma-ma, look") is the theme: unresolved in the hook, home
on the tonic at the end.

## Decisions taken (owner, 14 Nov: "you are in charge")

- Voice, music, pictures all made here, on this laptop, from open tools.
- I choose the voice and the music and say why; alternates stay easy to swap.
- Still fixed: demo household only, real app screens, Kakak named as an AI
  helper early, no price or date, staff shown with respect, no emoji,
  licences kept in `licences/`, app code and databases untouched.

## Tools (all local)

- `audio/setup.sh`: Python environments under `.tools/` (git-ignored).
- Voice: Kokoro-82M (Apache-2.0), voice `kakak-a` in `audio/voice/speak.py`.
  Chatterbox (MIT) was tried and set aside (its Indonesian is heard as Malay).
  Whisper and an accent classifier only check; nothing of theirs is in the film.
- Music and effects: written and synthesised in `audio/music/`, `audio/sfx.py`.
- Homebrew added: `uv`, `espeak-ng`.

## Progress

- [x] Read v1–v3, storyboard, app screens; concept and script
- [x] Sound tools installed; voices measured (88 candidates); `kakak-a` chosen
- [x] Capture: sentence one is the Play routine (en, id); all screens re-shot
- [x] World art (sky, land, house, garden, family, kite) and all scenes
- [x] Music ("Mama, look", three arrangements), effects, mixes at -14 LUFS
- [x] Four cuts rendered into `out/`; frames reviewed in all four
- [x] Listening page: https://claude.ai/artifact/FU8ATHKNxF5dYg2ZzxVyCA
- [x] `NOTE.md`, `licences/LICENCES.md`, `README.md`
- [ ] The owners listen (voice, music) and give the final approval

## If picking this up again

`npm run sound` then `npm run render` rebuilds everything from the branch
(after `npm install`, `./audio/setup.sh`, and `npm run capture` on a stub
build: see `README.md`). The finished cuts are copied to
`docs/private/marketing/trailer-v4/` in the main checkout (git-ignored).
