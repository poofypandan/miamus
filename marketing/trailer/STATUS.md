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
| 15–25 | Owner's phone: three sentences, three cards | Tell me once. |
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

- `audio/setup.sh`: two Python environments under `.tools/` (git-ignored).
- Voice: Kokoro-82M (Apache-2.0); Chatterbox Multilingual (MIT) as a second
  engine. Whisper (MIT) only checks the words.
- Music and sound effects: written and synthesised in `audio/`.
- Homebrew added: `uv`, `espeak-ng`.

## Progress

- [x] Read v1–v3, storyboard, app screens; concept and script
- [x] Sound tools installed; first voice tests pass
- [ ] Capture: sentence 2 becomes the Play routine (en, id); status re-shot
- [ ] World art (sky, land, house, garden, people, kite) and scenes
- [ ] Voice candidates, measured; pick
- [ ] Music and effects; mix
- [ ] Four cuts rendered; frames reviewed
- [ ] Listening page, note, licences; pushed

## Next step

See the last unchecked box.
