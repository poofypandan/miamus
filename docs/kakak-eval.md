# The Kakak eval

This tests Kakak before she is built into the app. It answers three questions
with numbers instead of guesses:

1. **Which model, at which effort** (decision K10 in
   `docs/phase-156-step2-kakak-plan.md`): Opus 5.5, Sonnet 5.5 or Haiku 5.5.
2. **Which speech-to-text service** for the mic (decision K9): ElevenLabs
   Scribe v2, Soniox or Deepgram Nova-3.
3. **What a right answer costs**, for pricing: the cost per passed case.

Nothing here runs on its own, in the everyday checks or in the app, and
nothing reaches the database. Each run costs money and needs keys, so it is
started by hand: at the laptop, or with GitHub's Run workflow button (see
"From GitHub" below).

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
| `tests/kakak/select.ts` | Which sentences a run may play: the dev split unless the holdout is asked for by name; a held-out sentence picked by id is refused; never the holdout on GitHub. |
| `tests/kakak/budget.ts` | The run's spending limit, held where every request passes: nothing is sent unless its worst case still fits, retries included (see "The budget"). |
| `tests/kakak/play-run.ts` | One setup over the chosen sentences: the first one alone, then side by side; ends early on a refused key, on the budget, or when the API stops answering. |
| `tests/kakak/run-check.sh` | One run after a change to her instructions, at the laptop: the dev split on the setup production uses. Reads the key hidden. |
| `tests/kakak/run-from-github.sh`, `.github/workflows/kakak-eval.yml` | The same run started from GitHub, for when nobody is at the laptop (see "From GitHub"). Their rules are held by `tests/unit/kakak-eval-workflow.test.ts`, `kakak-eval-run.test.ts` and `kakak-eval-budget.test.ts`. |
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
- **A run started from GitHub is public**, because this repository is: its
  log and its saved conversations can be read by anyone. That run plays only
  the made-up sentences and household, so it shows nothing that a stranger
  with a key of their own couldn't produce. Photos and voice clips are never
  run from GitHub.
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
low/medium, Sonnet with thinking off, and Haiku low/medium. It sends no
request that could take it past the budget (see "The budget" below). Expect
roughly $5–8 in total; Opus is most of it.

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

Each run prints a line per sentence, a summary by category, a `RESULT` line
and a row for the table below. It saves every conversation in
`tests/kakak/results/`.

**The result, in one line.** `RESULT` starts with one of three words, so a
part can't be read as the whole:

- `PASSED: the whole dev split, 106 of 109 sentences, no must-never.` Every
  sentence was answered, 90% or more passed, and there was no must-never.
  Only this means a full evaluation passed.
- `PASSED for the 2 chosen sentences only. This is not a full evaluation.`
  Sentences picked with `--cases`.
- `NOT PASSED: …` Under 90%, or a must-never.
- `INCOMPLETE, so not passed: …` The run stopped early (the budget, a
  refused key, an API that stopped answering), or a sentence got no answer.
  Whatever it did play, it is not a result for the split: run it again.

`--bar` makes the run end with exit code 2 unless every setup says `PASSED`.

**The budget.** `--budget` is a bound, not a point at which the run notices
it has already overspent (`tests/kakak/budget.ts`):

- Before a request is sent, its worst case is set aside: every byte of the
  request counted as one input token, plus a whole reply's worth for each
  earlier reply of hers it carries, at the dearest input rate it can be
  charged, plus all the output it is allowed (`max_tokens`). Real text is
  about three bytes a token, so this is about three times too high on
  purpose. For today's requests that is about US$0.29 each, against about
  US$0.01 really spent.
- A request is sent only if that fits beside the requests still in flight.
  One that will fit later waits. One that can never fit ends the run, and
  the sentences not played are not results.
- Every attempt passes this gate: the runner's own second tries, and the
  SDK's retries after a 429, a 529, a 5xx or a dropped connection.
- An answer is counted at what it cost. An answer that is an error is not
  billed. A request with no answer at all is counted at its worst case,
  because the work may still have been done.

So a run cannot be billed more than its budget **by the prices in
`src/lib/kakak/cost.ts`**. Those prices are ours to keep right. Anthropic's
invoice is the truth, and the workspace's monthly limit in the Claude Console
is the limit Anthropic itself enforces. If a request ever costs more than its
worst case, the run says so, stops and ends with exit code 2. A budget under
one request's worst case (about US$0.30) sends nothing.

**Stopping early.** A key that is refused (wrong, deleted, expired, or not
allowed the model) ends the run after one request: the first sentence is
played alone. Five sentences in a row with no answer end it too.

**The holdout.** `--cases` picks sentences of the chosen split only. A
held-out sentence picked by id is refused, before anything is spent, unless
`--split holdout` (or `all`) is given with it. An id that doesn't exist is
refused too, instead of quietly playing fewer sentences.

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
zsh tests/kakak/run-check.sh
```

With nobody at the laptop, the same run starts from GitHub (next section).

It reads the key once, hidden, as the comparison does. About US$1.30 for 109
sentences (`zsh tests/kakak/run-check.sh K131,K146` plays only those). The bar is the same: at least 90% and zero
must-never. Watch three things the change could move: raw leaks and
fallbacks (she now writes a sentence beside every card), retries (plain
replies sent back), and the `about_miamus` and `food` groups, which hold the
new sentences. The eval key is in the same workspace as production, so each
run counts against its monthly limit.

## From GitHub, when nobody is at the laptop

The same run as `run-check.sh`, started from GitHub instead of a terminal:
the workflow **Kakak test run** (`.github/workflows/kakak-eval.yml`), which
runs `tests/kakak/run-from-github.sh`. It plays the dev split on the setup
production uses. It never plays the holdout, photos or voice. It can be
started once the workflow is on `main`.

**Once (the owner; a phone is enough):**

1. In the Claude Console (console.anthropic.com, API keys), create a key in
   the workspace the eval key lives in, named `eval-github`, with an expiry
   (7 days covers a round of tuning).
2. On GitHub, open this repository's **Settings → Environments → New
   environment** and name it `kakak-eval`. Under **Environment secrets**, add
   a secret named `ANTHROPIC_EVAL_KEY` and paste the key as its value.
   GitHub never shows it again, to anyone, and hides it in logs. Stored
   there, only this workflow's job can ever be given it.
3. Recommended, on the same page: tick **Required reviewers** and add
   yourself. Each run then waits until you approve it on GitHub, so no run
   can spend without you.
4. A key never goes into a chat, a file, an issue or a screenshot. One that
   was pasted anywhere it can be read back is deleted in the Console and
   replaced.

The simpler place, **Settings → Secrets and variables → Actions → New
repository secret**, works too, without the approval step.

**Each run:**

- On GitHub: **Actions → Kakak test run → Run workflow**. Leave both boxes
  as they are for the whole dev split, or type sentences like `K131,K146`.
- From a terminal: `gh workflow run kakak-eval.yml`, with `-f
  cases=K131,K146` for chosen sentences and `--ref <branch>` to test a
  branch before it merges.
- A Claude session asks the owner before each run, because it spends money.
  With Required reviewers on, GitHub asks as well.

**What it costs, and what stops it:** about US$1.30 for the 109 dev
sentences. The budget is US$2.50 unless changed, and US$5 at most. It is a
bound, as "The budget" above describes: no request is sent unless its worst
case still fits, retries included. A refused key ends the run after one
request. Only one run goes at a time. The key is in the same workspace as
production, so each run counts against that workspace's monthly limit, which
is the limit Anthropic itself enforces.

**Reading the result:** the first line of the run's front page is the
`RESULT` line, and the run's name says whether it was the whole dev split or
chosen sentences only. A green run said `PASSED`. A red run said `NOT PASSED`
or `INCOMPLETE`, or nothing was run (the key is missing, or what was typed
was refused). Below it are the totals and each sentence that missed.

**What is uploaded:** this run's conversations, in the run's
`kakak-test-run-conversations` download for 7 days, and only after the
script has searched them and the run's output for the key. GitHub hides a
secret in logs but not in a file it uploads. If the key is found anywhere,
nothing is kept and the run says to replace the key.

**The holdout stays out.** The script always asks for the dev split. A
held-out sentence typed by id is refused before anything is spent. The
runner refuses the holdout on GitHub outright, because it would be public.

**Who can start it, and who can read it:** only people who can push to this
repository can start a run, and a pull request from outside is never given
the key. The log and the download are public (see Privacy).

**To switch it off:** delete the secret on the same Settings page, or delete
the key in the Console. Without the secret the run refuses and spends
nothing.

## What this doesn't cover yet

- Real sentences from the household. Add 30–50 to `test-set.json` once the
  family has typed to Kakak (plan, section 7). The first two are in: K131 and
  K146 are the owner's own, from 14 November.
- Her voice. The graders check structure, not warmth: read ten replies per
  language with the family before changing the model.
- Speed on a phone on 4G, and the whole round trip through the route.
- Live voice (Call Kakak). That is a separate test, later.
