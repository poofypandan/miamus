# Kakak: turning her on

Phase 156 step 2 (plan: `docs/phase-156-step2-kakak-plan.md`). Kakak is off
everywhere until all four of these are true, in this order:

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
  rooms, "beli/buy", food words and pet meal or potty times. She asks once
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

## Turning her off

- One household: the owner's switch, or `platform_set_kakak_allowed(id, false)`
  (also switches it off).
- Everyone, at once: `KAKAK_ENABLED` to anything but `true`, then redeploy.
