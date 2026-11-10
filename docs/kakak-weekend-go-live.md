# Kakak: switching her on for the family weekend

For Saturday 14 November 2026. Written 10 November for the owner.

Kakak is built and production is ready for her. Migration 126 is on
production; on 10 November `kakak_settings` was still empty and nothing had
been recorded yet. She stays off until you do steps A and B below. Then the
manager does C, and you do D.

The technical background is in `docs/kakak-setup.md`. This page is the short
version, plus a demo script.

---

## A. Create the API key (you, about 5 minutes)

Only you can do this: it needs your Anthropic account and a payment method.

1. Open **console.anthropic.com** and sign in.
2. **Settings → Workspaces → Create workspace.** Name it `Miamus Kakak`.
3. Open the new workspace and set its **monthly spend limit to US$20**.
   This is the money cap: when it is reached, Anthropic stops answering and
   Kakak says *"Kakak has reached this month's limit. You can still add
   everything yourself."* Nothing breaks, and nothing else in Miamus stops.
4. In that workspace, go to **API keys → Create key**. Name it
   `vercel-production`. Copy the key (it starts with `sk-ant-`). You will
   only see it once.
5. Never paste the key into chat, a document, the repo or a message. It
   goes into Vercel and nowhere else.

The API is billed per use, separately from your Claude subscription.

## B. Put the key into Vercel (you, about 3 minutes)

1. Open **vercel.com → the Miamus project → Settings → Environment
   Variables**.
2. Add `ANTHROPIC_API_KEY` with the key from step A as its value.
   - Environment: **Production** only.
   - Leave it **Sensitive** (server-only). The name must not start with
     `NEXT_PUBLIC_`.
3. Add `KAKAK_ENABLED` with the value `true`, Production only.
4. Don't add `KAKAK_MODEL` or `KAKAK_EFFORT`. The defaults (Claude Opus 5.5
   at low effort) are what we want for the weekend. See "Which model" below.
5. Don't add `KAKAK_PRACTICE`. Production ignores it anyway.
6. Don't redeploy yet. Tell the manager the variables are in. The manager
   redeploys once, together with step C, because Vercel Hobby has a daily
   deploy limit.

New environment variables only take effect after a redeploy.

## C. What the manager does next (needs your OK)

The manager will ask before each of these, because they change production:

1. **Put your household on the family list.** There is no screen for this
   yet, so it is one line in the Supabase SQL editor on "Miamus Production"
   (the editor runs as the database owner):

   ```sql
   insert into public.kakak_settings (household_id, allowed)
   values ('<your household id>', true)
   on conflict (household_id) do update set allowed = true;
   ```

   The manager looks up your household id first and shows you the row
   before running it.
2. **Redeploy production** on Vercel (Deployments → the latest → Redeploy),
   so the server reads the two new variables.
3. **Check** that `/api/kakak` no longer answers "not available".

## D. Turn Kakak on (you, 30 seconds)

On your phone, signed in as yourself: **Household → Kakak → Let Kakak
help** (*Rumah → Kakak → Izinkan Kakak membantu*). The page says what is
sent to Anthropic and links the privacy policy. The **Tell Kakak** button
then appears at the bottom right of Today.

Staff phones never see Kakak.

## E. Two-minute smoke test (Friday evening)

Do this on your phone, on mobile data rather than Wi-Fi if you can,
because that's what the weekend will be like.

1. **Today → Tell Kakak.** The sheet opens with five examples under "Try
   saying", using your own staff's and pet's names. There must be **no
   "Practice mode" note** at the top.
2. Tap **Buy rice and eggs → Send.** Within a few seconds you get a card:
   Shopping list · Beli Beras · Beli Telur. Tap **Looks right**. The toast
   says "Saved — …". Tap **Undo**. The toast says "Undone." and the two
   items are gone from the list.
3. Tap the **Rendang from Aunt Rina in the fridge** example → **Send**.
   Kakak asks when it needs eating by. Tap one of her answers. A food card
   appears. Tap **Cancel**. This checks that a two-step conversation works,
   which is the bug fixed in this PR.
4. Turn on **airplane mode**, type anything, **Send**. Kakak says she needs
   the internet and offers **Try again**. Turn airplane mode off, tap
   **Try again**: it carries on with the same words.
5. In the Claude Console, open **Usage** for the `Miamus Kakak` workspace.
   You should see a few cents at most.

If step 2 says "Kakak isn't available right now", the key or
`KAKAK_ENABLED` isn't in effect yet (redeploy, or check the spelling). If
the Kakak row isn't in Household at all, step C.1 hasn't been done.

## F. Turning her off fast

Pick the one you need. None of them lose any data.

| How fast | What | Effect |
| --- | --- | --- |
| Instant | **Household → Kakak → switch off** | Off for your household. The button disappears from Today. |
| Instant | **Console → API keys → Disable** the `vercel-production` key | Off for everyone. Kakak says "isn't available right now". No redeploy needed. |
| A few minutes | Vercel → `KAKAK_ENABLED` to `false`, then redeploy | Off for everyone, cleanly. |
| Automatic | The US$20 monthly limit | Anthropic stops answering for the rest of the month. |

Everything Kakak does can always be done by hand, as before.

---

## Which model (manager's recommendation)

**Keep the default: Claude Opus 5.5 at low effort** (`claude-opus-5-5`,
`KAKAK_EFFORT` unset, which means `low`). Checked against Anthropic's
current docs on 10 November 2026:

- **Quality.** Opus 5.5 is Anthropic's current default model and the
  strongest at the hard parts of Kakak: mixed Indonesian and English,
  telling "Yanti" from "Yati", never inventing a person, and asking rather
  than guessing a food's date. For a first impression, that matters more
  than anything else.
- **Speed.** Thinking is always on with Opus 5.5. Effort is what controls
  how long it thinks, and its default is `medium`, so Kakak sets `low`
  explicitly. At `low` it keeps its thinking short, which suits short,
  well-defined requests like Kakak's. Expect about 2–6 seconds a sentence.
  The sheet now changes its waiting line as the seconds pass, so it never
  looks stuck.
- **Cost.** US$4 per million tokens in, US$20 out, and US$0.20 for cached
  tokens (Kakak's instructions and tools are cached). A sentence costs about
  US$0.01–0.07 (one to three calls). A busy demo weekend of 50–100
  sentences is roughly **US$1–5**. A typical month for one family (2–10
  sentences a day) is US$1–15. That's well inside the US$20 limit. If a
  month ever runs hot, the limit stops it, and Kakak says so plainly.
- **Not `medium` for now:** it's slower and uses more tokens, for no
  measured gain on requests this short. Raise it only if the smoke eval
  below shows misses.
- **Fallback:** if Opus feels slow on 4G, set `KAKAK_MODEL=claude-sonnet-5-5`
  (half the price) and redeploy. It's one variable, not a code change.
  Haiku 5.5 is far cheaper but untested on Kakak's rules: not for the demo.

## The eval: a small smoke run (once the key exists)

Not run yet, because it needs a key and costs money. It plays real test
sentences against the real API, with a made-up household, so no family data
is sent. Use a **second key** from the same `Miamus Kakak` workspace
(name it `eval-laptop`), so the production key never touches a laptop.

In a terminal, in the repository folder, for that terminal session only:

```bash
export ANTHROPIC_API_KEY=sk-ant-…
```

Free check that the test set is valid:

```bash
npx tsx tests/kakak/run-test-set.ts --check
```

**Smoke run: 10 sentences, Opus 5.5 at low effort, about US$0.20–0.70**
(stops starting new sentences at US$2):

```bash
npm run eval:kakak -- --model opus --effort low --cases K001,K004,K018,K021,K027,K032,K038,K039,K086,K091 --budget 2
```

These cover a repeating chore (Indonesian and English), "remind me",
shopping, pet meals, a food that needs a question, two things at once,
something Kakak can't do, an attempt to override her rules, and a bare
"Mbak". **Pass:** at least 9 of 10, and no "must-never" failures.

Optional, the same sentences on Sonnet 5.5 for comparison (about
US$0.10–0.35):

```bash
npm run eval:kakak -- --model sonnet --effort low --cases K001,K004,K018,K021,K027,K032,K038,K039,K086,K091 --budget 2
```

The full comparison (70 sentences, seven setups, about US$5–8) is in
`docs/kakak-eval.md`. Leave it for after the weekend.

---

## Weekend demo script

Say these to Kakak (typed, or with the phone keyboard's dictation key).
Replace the names in brackets with your own staff and pets. Each one shows
something different. Nothing is saved until you tap **Looks right**, so a
wrong card costs nothing: tap **Cancel**.

| # | Bahasa Indonesia | English | What it shows |
| --- | --- | --- | --- |
| 1 | Mbak [Sari] pel teras tiap Senin jam 9 | [Sari] mops the terrace every Monday at 9 | A repeating chore from one sentence: person, day, time, room. The card says "Every Monday". |
| 2 | Besok [Budi] cuci mobil, terus beli telur juga | Tomorrow [Budi] washes the car, and buy eggs too | Two different things in one sentence: one card, **Save 2**. |
| 3 | Tolong tambahin ke list belanja: gula 2 kg, kopi bubuk, sama baterai AA | Add 3 rolls of tissue and dish soap to the list | Shopping with amounts, in everyday language. Staff see the list in Indonesian. |
| 4 | Tante Rina bawa rantang isi opor, rantangnya harus dikembalikan | Aunt Rina brought opor in her container, we need to give it back | Kakak **asks** when it needs eating by, with one-tap answers. Pick her guess: the card marks it "Kakak's guess — check it" and remembers to return the container. |
| 5 | [Mochi] makan jam 7 pagi dan jam 6 sore | Feed [Mochi] at 7 am and 6 pm | Pet meal times. If one is already set, Kakak says so instead of adding it twice. |
| 6 | Ingatkan saya bayar listrik tiap tanggal 20 | Remind me to pay the electricity bill on the 20th every month | "Remind me" becomes your own monthly chore. |
| 7 | (after any card, tap **Ubah** / **Change**) Jam 10 saja | Make it 10 instead | You correct her in plain words; the card updates. |
| 7b | (on a chore card, tap the chips) **Sekali saja · Setiap Senin · Siapa saja** | **One time · Every Monday · Anyone** | Refine how often and who with one tap, no typing. Instant: the chips don't ask the AI. |
| 8 | Kasih obat cacing ke [Mochi] tiap 3 bulan | Give [Mochi] worm medicine every 3 months | She says honestly that she can't set up medicine yet, and where to add it by hand. |

**Good order for an audience:** 1, 7b, 2, 4, 7, then whichever they ask for.
Hand the phone to someone and let them try their own sentence: that's the
moment that sells it.

### If one fails

- **The card is wrong:** tap **Change** and say what's wrong ("bukan Senin,
  Selasa"), or **Cancel** and say it more simply. It's a good thing to
  show: Kakak never saves on her own.
- **"Kakak couldn't work that out":** say it another way, shorter, with the
  name, day and time.
- **"Something went wrong", "busy" or "took too long":** tap **Try again**.
  If it happens twice, switch to adding it by hand ("everything still
  works by hand; Kakak just makes it faster") and carry on.
- **"Needs the internet":** move to better signal or Wi-Fi, then **Try
  again**.
- **"This month's limit" or "helped a lot today":** the US$20 cap or the
  40-a-day household limit was reached. Carry on by hand. The manager can
  raise either afterwards.
- **Kakak is very slow:** she's still reading, and the waiting line changes
  as she goes. On 4G the first sentence after a quiet spell is the slowest.
  If it's always slow, see the Sonnet fallback above (it's for after the
  demo, not during it).

### Privacy, briefly

What you type, and the first names of your staff, pets, rooms and shopping
items, are sent to Anthropic (USA) to be understood. Anthropic keeps them
for up to 30 days and doesn't train on them. Miamus stores only counts and
costs, never the text. This is in the privacy policy, both languages.
