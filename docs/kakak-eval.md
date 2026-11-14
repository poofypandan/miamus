# The Kakak eval

This tests Kakak before she is built into the app. It answers three questions
with numbers instead of guesses:

1. **Which model, at which effort** (decision K10 in
   `docs/phase-156-step2-kakak-plan.md`): Opus 5.5, Sonnet 5.5 or Haiku 5.5.
2. **Which speech-to-text service** for the mic (decision K9): ElevenLabs
   Scribe v2, Soniox or Deepgram Nova-3.
3. **What a right answer costs**, for pricing: the cost per passed case.

Nothing here runs in CI or in the app, and nothing reaches the database. Each
run costs money and needs keys, so it is run by hand.

## What is in it

| File | What |
| --- | --- |
| `src/lib/kakak/tools.ts` | The tools, as planned (section 3 of the plan), plus `put_away_ingredient` (Phase 176, not strict), which since 2026-11-14 also takes an ingredient that isn't listed and an amount. Shared with the app. |
| `src/lib/kakak/prompt.ts` | Kakak's instructions, the same for every household. |
| `src/lib/guide.ts` | The guide to Miamus (Phase 180): about thirty short entries, in the owner's language, sent after the instructions as a second cached block. Kakak answers questions about Miamus from it and only from it. |
| `src/lib/kakak/household.ts` | The household block: short references (S1, P1, R1, I1, M1), first names only. It also lists the next 14 dates with their weekdays, so the model doesn't have to work out "Sabtu ini" itself. |
| `src/lib/kakak/validate.ts` | The checks the route will run on every tool call: lengths, times, real dates, references that exist. |
| `src/lib/kakak/cost.ts` | Prices from Anthropic's pricing page (2026-11-08), in micro-dollars. |
| `tests/kakak/household.json` | The pretend household: Dewi (owner), Sari, Nah, Budi, Yanti and Yati (the look-alikes), Mochi, Kopi and Luna, nine rooms, nine shopping items. Today is Wednesday 11 November 2026, 08.30. |
| `tests/kakak/test-set.json` | 139 sentences. K001–K040 are the 40 from `docs/phase-156-kakak-test-set.md` (PR #13); K041–K100 add more days and times, shopping, pets, food, several things at once, things Kakak can't do, attempts to override her rules, and missing or ambiguous names; K101–K116 pet routines and putting ingredients away; K131–K144 questions about Miamus and thanks (`about_miamus`); K146–K154 a new ingredient and amounts. K117–K130 are left for Kakak's staff-areas card (PR #140). 109 are for tuning (`dev`); 30 are held back (`holdout`) for the final comparison. |
| `tests/kakak/run-test-set.ts` | Plays every sentence against the API like the planned route: one retry after a failed check, scripted answers to questions, at most three questions. |
| `tests/kakak/run-photos.ts` | The same for food photos. |
| `tests/kakak/run-voice.ts` | The speech-to-text comparison. |
| `tests/kakak/grade.ts`, `report.ts`, `test-set-check.ts`, `wer.ts` | Grading and numbers, with no network calls; covered by `tests/unit/kakak-eval.test.ts` and `tests/unit/kakak-wer.test.ts`. |

## Before the first run (owner)

1. **Anthropic API key.** In the Claude Console (console.anthropic.com),
   create a workspace "Miamus Kakak eval" and set its **spend limit to $20 a
   month**. Then create an API key in that workspace. This is separate from
   the Claude Max subscription: the API is billed per use.
2. **Speech-to-text keys** (only for the voice comparison): an ElevenLabs API
   key (pay-as-you-go is enough; the Creator plan isn't needed), a Soniox key,
   and a Deepgram key. Deepgram and Soniox give free starting credit. Skip any
   you don't want to test: a service without a key is skipped.
3. In a terminal, for that session only (never in a file in the repo):

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-…
   ```

The runner always calls `https://api.anthropic.com` directly. It ignores
`ANTHROPIC_BASE_URL`, which Claude Code sets in its own shells.

## Privacy

- The sentences and the household are made up. Sending them to Anthropic
  shares no one's data.
- **Photos and voice clips are real household data.** Use family only, with
  their OK. Staff voices only if they agree after you've explained what it is
  for. No photos of children's faces or documents. No production data.
- `tests/kakak/media/` and `tests/kakak/results/` are git-ignored: photos,
  voices and transcripts never go into the repo.
- Anthropic keeps API data for up to 30 days and doesn't train on it. Soniox's
  clips are deleted straight after each transcription (the runner does this;
  if a deletion fails, that clip shows an error saying what to delete by
  hand). ElevenLabs and Deepgram keep data according to their own terms: check them
  before sending staff voices.
- None of this changes what the app stores, so the privacy policy doesn't
  change yet. It does when Kakak ships (plan, section 9).

## Running it

Run these from the repository folder:

```bash
npx tsx tests/kakak/run-test-set.ts --check
```

Checks the test set itself (ids, references, real dates, field names). Free.

```bash
npm run eval:kakak -- --all-variants --budget 15
```

Runs the 70 dev sentences on seven setups: Opus low/medium, Sonnet
low/medium, Sonnet with thinking off, and Haiku low/medium. It stops starting
new sentences at the budget. Expect roughly $5–8 in total; Opus is most of it.

```bash
npm run eval:kakak -- --model sonnet --effort low --cases K013,K032
```

Runs one setup on chosen sentences, while tuning the instructions.

```bash
npm run eval:kakak -- --model opus --effort low --split holdout
```

The final comparison: the 30 held-back sentences, run only on the two or
three best setups and only after the instructions stop changing. If the
instructions are tuned on the holdout, it stops being a fair test.

Each run prints a line per sentence, a summary by category, and a row for the
table below. It saves every conversation in `tests/kakak/results/`.

```bash
zsh tests/kakak/run-comparison.sh
```

The model comparison (2026-11-13): reads the key once, hidden, then plays the
whole dev split on Opus low and medium once, and Sonnet low, Haiku low and
Haiku medium three times each, within one US$6 budget, and prints one table.
A setup the API refuses (a 400) is recorded as refused, never re-run with
other settings. Repeated setups report must-nevers from their worst run. Per
setup: pass rate by group, raw leaks, fallbacks, the cold first call apart
from p50/p95, calls per case and retries, cost per case, cache read and
write tokens, and 429s/529s. Never the holdout.

## How a sentence is marked

As in `docs/phase-156-kakak-test-set.md`:

- **Pass:** the right tool and every listed field match. Titles are matched
  by meaning (word groups, Indonesian and informal spellings). Ranges pass
  anywhere inside. Unlisted chore fields must be the defaults (no repeat, no
  time, no supervision, no new room). Unlisted food fields must be
  `expiry_unknown`, `return_container` and `expiry_is_guess` all false.
- **Questions:** the runner taps the scripted answer, or the offered answer
  that contains it, and checks the next turn. Several paths can be accepted
  (for example a question *or* a direct suggestion when either is reasonable).
- **Plain replies** (an answer about Miamus, thanks, something she can't do):
  the reply must mention one word from each `mentions` group and none of the
  `avoids` words (a made-up price; a list of what she can do where a
  thank-you belongs). As in the route, a plain reply that can't be shown
  (longer than 480 characters, a note to self, the wrong language, no words)
  goes back to Kakak once with the reason; the second one is graded, and the
  first counts as a retry.
- **Must-never:** each of these fails the sentence and is counted on its
  own, whatever the score:
  - inventing a person, pet, room or item;
  - claiming something is saved;
  - guessing between two people who both fit ("Yan", a bare "mbak");
  - suggesting a food with no date given before asking;
  - more than three questions;
  - replying in the wrong language for the owner. This one is a word-count
    heuristic: read any case it flags;
  - showing a note to self: a reference (M1, S1, P1, R1, I1), an ISO date, or
    a tool or field name in what the owner sees.

  The last two are judged on what the owner sees: a question and its answers,
  or the text beside a card or on its own after the route's guard
  (`src/lib/kakak/reply-guard.ts`). The model's own text before the guard is
  counted as **raw leaks**, a rate, not a failure.
- **Pass mark (proposed):** 90% or more on each split, and **zero
  must-never**.
- **Choosing:** for each job, the cheapest setup within about two points of
  the best, with a p95 call under about 3 seconds. Measure on a phone on 4G
  before deciding on speed: these times are from a Mac on Wi-Fi.

## Food photos

Put 30 photos in `tests/kakak/media/photos/`:

- 10 with a readable date on the label;
- 10 with no date (homemade, bakery boxes, nasi kotak);
- 5 that are blurry, rotated or half cut off;
- 5 with several foods.

Next to each photo, a `.json` with the same name says what Kakak should do,
in the same format as a test-set case. A label with a date:

```json
{
  "caption": "Tambahkan makanan ini.",
  "paths": [[{ "kind": "suggestions", "calls": [{ "tool": "add_food",
    "fields": { "name": { "textHas": [["roti"]] }, "expires_on": "2026-11-15", "source": { "anyOf": ["bought", null] } } }] }]]
}
```

No date (Kakak must ask first):

```json
{
  "mustNever": ["food_date_without_asking"],
  "paths": [[
    { "kind": "question", "about": "when it expires", "answersInclude": [["Tidak tahu"]], "reply": "Tebakan Kakak" },
    { "kind": "suggestions", "calls": [{ "tool": "add_food",
      "fields": { "name": { "textHas": [["rendang"]] }, "expires_on": { "dateBetween": ["2026-11-11", "2026-11-13"] }, "expiry_is_guess": true } }] }
  ]]
}
```

Dates are relative to the pretend "today", 11 November 2026, not the day the
photo was taken. Then:

```bash
npm run eval:kakak:photos -- --model opus --effort low
```

Each photo is turned into a JPEG with its longest side 1,280 px (change it
with `--max-edge`), as the app will do on the phone.

## Voice clips

Put about 30 short clips in `tests/kakak/media/voice/` (`.m4a` from the
iPhone Voice Memos app works):

- **who:** you, your mother, and two staff if they agree;
- **where:** a quiet room, the kitchen while cooking, with the TV on;
- **what:** Indonesian, English and mixed, saying the household's names
  ("Mbak Sari", "Bik Nah", "Mochi"). Test-set sentences make good scripts.

Next to each clip, a `.txt` with the same name holds exactly what was said.
Write numbers as digits ("jam 9", not "jam sembilan"), because the
comparison doesn't convert number words. Then:

```bash
export ELEVENLABS_API_KEY=… SONIOX_API_KEY=… DEEPGRAM_API_KEY=…
npm run eval:kakak:voice
```

It prints word error rate, how often the household's names come out right,
speed, and cost for each service. Names matter more than the overall error
rate: "Mbak Yanti" heard as "Mbak Yati" assigns the chore to the wrong person.

Note: Deepgram Nova-3 can't mix Indonesian and English automatically, so it
runs in Indonesian. Scribe and Soniox detect the mix themselves.

## Results

Fill in after each run (the runner prints the rows).

| Variant | Passed | Must-never | Median call | p95 call | p95 sentence | Cost | Cost per pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## After a change to her instructions

Her instructions changed on 2026-11-14 (a warm sentence with every card,
answers from the guide, new ingredients and amounts). Before that reaches
production, re-run the whole dev split once on the setup production uses and
compare with the 2026-11-14 01:30 run (Opus medium: 97%, 0 must-never, 0 raw
leaks):

```bash
npm run eval:kakak -- --model opus --effort medium
```

About US$1.30 for 109 sentences. The bar is the same: at least 90% and zero
must-never. Watch three things the change could move: raw leaks and
fallbacks (she now writes a sentence beside every card), retries (plain
replies sent back), and the `about_miamus` and `food` groups, which hold the
new sentences. The eval key is in the same workspace as production, so each
run counts against its monthly limit.

## What this doesn't cover yet

- Real sentences from the household. Add 30–50 to `test-set.json` once the
  family has typed to Kakak (plan, section 7). The first two are in: K131 and
  K146 are the owner's own, from 14 November.
- Her voice. The graders check structure, not warmth: read ten replies per
  language with the family before changing the model.
- Speed on a phone on 4G, and the whole round trip through the route.
- Live voice (Call Kakak). That is a separate test, later.
