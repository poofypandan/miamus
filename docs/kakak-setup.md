# Kakak: turning her on

Phase 156 step 2 (plan: `docs/phase-156-step2-kakak-plan.md`). The owner's
plain-words version, with a smoke test and a demo script, is
`docs/kakak-weekend-go-live.md`. Kakak is off everywhere until all four of
these are true, in this order:

1. **Migration 126** is applied (`supabase/migrations/126_kakak.sql`):
   local, then staging, then production, each with the owner's OK.
   Test: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -q -t -f supabase/tests/126_kakak.sql`
   (one transaction, rolled back).
2. **The server has a key and the switch** (Vercel → Settings → Environment
   Variables, server-only, never `NEXT_PUBLIC_`):
   - `ANTHROPIC_API_KEY`: from a Claude Console workspace with a
     **monthly spend limit** (US$20 suggested for the family phase). That
     limit is the money cap; Miamus has no cost-based limit of its own.
   - `KAKAK_ENABLED=true`. Anything else, or no key, and `/api/kakak`
     answers "not available" before doing anything.
   - Optional: `KAKAK_MODEL` (default `claude-opus-5-5`) and `KAKAK_EFFORT`
     (default `low`). Pick them from the eval (`docs/kakak-eval.md`).
3. **The household is on the family list.** `platform_set_kakak_allowed`
   checks `is_platform_admin()`, so it needs a signed-in platform admin;
   there is no screen for it yet. Until there is, the operator sets it from
   the Supabase SQL editor (which runs as the database owner, not as a user):

   ```sql
   insert into public.kakak_settings (household_id, allowed)
   values ('<household id>', true)
   on conflict (household_id) do update set allowed = true;
   ```

   Only then does the **Kakak** row appear in the Household tab.
4. **An owner turns it on**: Household → Kakak → **Let Kakak help**. The
   page says what is sent to Anthropic and links the privacy policy.

## Practice mode (no AI, no tokens)

For trying Kakak on staging, a Vercel preview or your own computer without
an Anthropic key: set `KAKAK_PRACTICE=true` on that server (no
`ANTHROPIC_API_KEY` or `KAKAK_ENABLED` needed).

- Kakak answers with scripted replies built from your words and your
  household's real staff, rooms, pets and shopping items: days, times, names,
  rooms, "beli/buy", food words and pet routines (meals, potty, walks, lights
  off, water, teeth, play; several pets in one sentence). She asks once
  when a chore's day or a food's date is missing.
- Everything around her runs for real: who may use Kakak (admins only, the
  household on the family list and switched on), the history checks,
  validation, the card, saving, and Undo. **Saving still saves**, so use a
  test household.
- Nothing is sent to Anthropic, nothing is counted against the daily limits,
  and nothing is written to `kakak_usage` or `kakak_requests`.
- The sheet says "Practice mode" at the top, so nobody mistakes it for the
  real thing.
- **Never on production:** the server ignores `KAKAK_PRACTICE` when
  `VERCEL_ENV` is `production` (and logs that it did).

It tests the app around Kakak, not her judgement. Whether she understands
real sentences is what the eval (`tests/kakak`) is for, against the real API.

## Talk to Kakak (voice beta)

The first, lightweight step towards roadmap item 23 ("Call Kakak"). A large
mic in the Kakak sheet: tap, talk, and the words appear live in the typing
box; tap **Stop** (or just stop talking) and they go to `/api/kakak` exactly
as if typed. **Read replies aloud** reads her question, message or card
aloud with the phone's own voice; the choice is remembered on that phone.
Code: `src/components/kakak/kakak-voice.tsx` (UI) and
`src/lib/kakak/voice.ts` (state machine, unit-tested).

- **No new service or key.** It uses the browser's Web Speech API:
  `SpeechRecognition` (prefixed `webkitSpeechRecognition`) to listen, in
  `id-ID` or `en-US` from the owner's language, and `speechSynthesis` to
  speak, choosing an Indonesian or English voice the phone has.
- **Privacy.** The browser may send the audio to its maker (Apple for
  Safari, Google for Chrome) to turn it into text, under their terms with
  the owner. Miamus never receives or stores audio, only the text, as typed
  Kakak already does. Said on the Kakak settings page and in the privacy
  policy (policy version 2026-11-10.3).
- **Where it works** (from the vendors' documentation and bug trackers,
  2026-11-10; not yet tried on a real phone):
  | Where | Listening | Reading aloud |
  | --- | --- | --- |
  | Android, Chrome (tab or installed app) | Yes. Chrome asks for the mic once. | Yes (Google voices) |
  | iPhone, Safari tab (iOS 14.5+) | Yes, if Siri and Dictation are on | Yes |
  | iPhone, Miamus on the Home Screen | No: WebKit doesn't offer it to Home Screen apps (bug 225298). The sheet shows the tip to use the keyboard's mic key. | Yes |
  | Firefox, older browsers | No: keyboard-mic tip | Usually yes |
- **New flow, opt-in per phone** (2026-11-13, PR #141): opening any Miamus
  address with `?newvoice=1` turns it on for that phone (saved in
  localStorage, `miamus.kakak.newVoice`); `?newvoice=0` turns it off. Off by
  default, and then the flow above runs unchanged. With it on: tap, talk
  (pauses to think are fine), and the words appear live under the mic; tap
  **Done** and they go into the typing box, where the owner can fix a
  misheard name, then **Send** takes them to `/api/kakak`. Listening runs
  until Done, or 60 seconds at most. Chrome on Android (and Safari on
  iPhone) end a recognizer session at a pause even in continuous mode, so
  the app starts a new one quietly and adds its words after the ones
  before; on Android, whose results each hold everything heard so far, they
  replace rather than repeat (`joinSession`). Each restart may play
  Android's short mic sound. **Cancel** drops the words. Code:
  `kakak-voice-new.tsx`, `new-voice-switch.tsx`, `listenUntilDone`.
- **Practice mode** works as usual: speech becomes text on the phone, and
  the scripted Kakak answers it.
- **Turning it off**: `NEXT_PUBLIC_KAKAK_VOICE=false` on the server, then
  redeploy (a build-time flag), hides the mic and the speaker switch. It
  only ever shows where Kakak itself does.

**Tutorial** (shown once as a card above the mic, `kakak-voice-2026-11` in
`src/lib/whats-new.ts`; owners only, since staff never see Kakak):

1. Tap the mic and say what you need. Your words appear as you speak.
2. Tap Stop when you're done. Kakak shows her card; nothing is saved until you confirm.
3. Want to hear her answers? Turn on Read replies aloud. This phone remembers it.

## Kakak's own voice (ElevenLabs, migration 172)

With **Read replies aloud** on, her replies are read in her chosen voice
("Lyly", model `eleven_v4`, picked 15 Nov) instead of the phone's. Off until
the server has both of these, so nothing changes before then:

- `ELEVENLABS_API_KEY`: an ElevenLabs API key (server-only, set in Vercel).
- `KAKAK_VOICE_ID`: Lyly's voice id. Add her to **My Voices** in the
  ElevenLabs Voice Library first, then copy the id from the voice's menu.
- Optional: `KAKAK_VOICE_MODEL` (default `eleven_v4`) and
  `KAKAK_VOICE_DAILY_CHARS` (characters per household per Jakarta day,
  default 3000, `0` turns the voice off).

How it works (`src/app/api/kakak/speak/route.ts`,
`src/lib/kakak/app-voice-server.ts`, `src/lib/kakak/app-voice.ts`):

- The phone sends only the words it would read itself (`speechPlan`: times
  in words, a short opener and two sentences, never a card's rows), at most
  600 characters.
- `kakak_voice_check` (migration 173, counts nothing) lets in the same people
  as `/api/kakak` (an admin of a household where Kakak is allowed and on) with
  characters left today; it runs alongside the sign-in check. Then ElevenLabs
  is asked, and only once its first audio arrives does `kakak_voice_spend`
  (172) count the characters in `kakak_usage.voice_chars` (numbers only, kept
  35 days). A reply ElevenLabs refused, or the phone gave up on, costs the
  household nothing. Over the budget the phone reads aloud itself for the
  rest of the visit.
- ElevenLabs serves `eleven_v3` / `eleven_v4` through Text to Dialogue
  (`/v1/text-to-dialogue/stream`) and older models through Text to Speech; the
  route asks the matching one first and the other once on a 400/404/405/422.
- Every answer carries `Server-Timing` (`auth`, `rpc`, `upstream_ttfb`,
  `spend`, in ms), and the log line `kakak voice <lang> <length> <endpoint>
  <timings>` shows the same. The phone reports which way each reply was read
  (`played`, or `timeout`, `autoplay`, `budget`, `upstream`…) to
  `/api/kakak/speak/outcome`, logged as `kakak voice outcome <word>`: one word,
  no text, nothing stored.
- The audio streams straight back and is never stored. ElevenLabs keeps each
  generation in the account's history by default (zero retention is
  Enterprise-only), so the route deletes it from the history right after
  (`forget`, or `forgetByRequest` when only a `request-id` header comes
  back). Check the History page on staging: it should stay empty.
- The phone unlocks audio on any tap in the sheet while the speaker switch is
  on (the send tap, the mic, the switch), since browsers refuse `play()` that
  doesn't follow a tap.
- Any failure (not set up, budget, offline, no first audio within 6 seconds,
  audio the phone can't play) reads the reply in the phone's voice instead.
  Without migrations 172 and 173 the route answers "off".

## Limits (migration 126)

- 40 calls per household per Jakarta day (`kakak_settings.daily_limit`).
- 400 calls a day across all households (`kakak_config.daily_call_cap`).
- Per conversation: 8 calls, 3 questions, 500 characters per typed turn.

A sentence with one question is two calls; a reply that fails the route's
checks and is retried is one more.

## What is stored

`kakak_requests`: one row per call with the model, outcome, which tools,
tokens, cost (millionths of a dollar), latency, and what the owner did
(confirmed / changed / cancelled / undone). **No text.** Kept 13 months;
`kakak_usage` 35 days. Both are pruned by the nightly food job
(`prune_finished_food`).

Totals for the operator, on staging or production:

```sql
select date_trunc('day', created_at) as day, model, count(*) as calls,
       sum(cost_micro_usd) / 1e6 as usd,
       percentile_cont(0.95) within group (order by latency_ms) as p95_ms
from kakak_requests group by 1, 2 order by 1 desc;
```

## When the call to Anthropic fails

The route turns each failure into one plain reason (`src/lib/kakak/api-errors.ts`),
and the sheet words it:

| Cause | Owner sees | Try again? |
| --- | --- | --- |
| Console workspace spend limit, or the tier limit | "Kakak has reached this month's limit…" | No |
| Wrong, revoked or disabled key (401/403) | "Kakak isn't available right now…" | No |
| Rate limited or overloaded (429/529) | "Kakak is busy right now…" | Yes |
| Timed out | "Kakak took too long. Nothing was saved…" | Yes |
| No internet on the phone | "Kakak needs the internet…" | Yes |
| Sheet left open for over 6 hours, or past midnight in Jakarta | "This conversation is from earlier…" | Start again |

The server logs the status and error type, never the household's words.

## One conversation, one household block

Every turn of a conversation builds the household block from the moment the
conversation started (`startedAt` in the history the phone sends back), not
from the clock. The system prompt must be byte-identical on every turn: the
thinking blocks Kakak replays are refused by the API otherwise (preserved
thinking, enforced on Opus 5.5 for Console accounts created from 31 August
2026), and it keeps the household block cached.

## Turning her off

- One household: the owner's switch, or `platform_set_kakak_allowed(id, false)`
  (also switches it off).
- Everyone, at once: `KAKAK_ENABLED` to anything but `true`, then redeploy.
- Everyone, instantly, with no redeploy: disable the API key in the Claude
  Console. Kakak then says she isn't available.
