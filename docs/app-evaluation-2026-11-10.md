# Miamus evaluation, 10 November 2026: are we heading the right way?

Status: **for the owner. Nothing in the app was changed.** Written on the
night of 10 November, after about 73 merged PRs since 6 November.

The owner's question: *are we progressing toward the right objective?* The
owner's own view: *"Friction is our biggest enemy. We want this app to help
people, not make them input this and that."*

How this was checked:

- **The app**, on `main` at `b6e84c5` (everything through migration 140),
  read screen by screen. The owner's first screens and the staff screens were
  also walked in the mock app at phone size (no real data).
- **The plans not yet built**: staff push (Phase 166), staff pay and THR
  (167), closet (169), kitchen (170) with its addendum (PR #77), and
  features and sign-up (171, PR #78).
- **Earlier reviews**: the whole-app review of 7 November, the Phase 153
  review, the product audit and roadmap of 9 November, the Kakak go-live
  sheet and the Kakak eval guide. The private business review was read for
  judgement only; nothing from it is copied here.
- **Production, counts only** (no names, no content): one read-only query
  per table on the production project.
- **Kakak's real prompt size**, measured from the code for a big house.

---

## 1. The verdict

**Partly, and the direction needs a correction now.** The core of Miamus is
real: in the one household using it, staff have logged about 250 routines a
week, every week, for two months, and the owner sees it without asking. The
last four days also fixed the weakest part of the loop: staff can now say
"I couldn't", the owner gets an evening summary, and a new owner gets a
checklist. But most of what was added, and almost everything planned next
(closet, amounts, recipes, a menu, nutrition, elders), is **more for the
owner to fill in**. A big house today means typing about 65 things and
tapping about 400 times before Miamus is useful, with a manual approval wait
in front of it. The easy path that should replace all of that, Kakak, is
built but switched off, and has never been tested on a real household.
**The biggest risk is that Miamus becomes a well-made database that busy,
delegating owners never finish setting up.** The fix is not more features.
It is setup that needs almost no typing (templates, Kakak, a head staff
member doing it), staff being told about their work, and measuring time to
first value with 3 to 5 real target households.

---

## 2. North star (draft for the owner's approval)

**Who Miamus is for.** Owners of big houses in Indonesia with several
live-in staff, many chores, and often several pets. They are busy, used to
delegating, and already pay for good software. Later: the same households
in Southeast Asia, then wealthy households abroad. Not: young people in a
small home with one helper.

**The one problem.** The owner carries the whole house in their head and
chases it on WhatsApp: *"sudah belum?"* Instructions get repeated, missed
work is noticed late, and nothing survives a change of staff.

**The promise, in one sentence.**
*Tell Miamus once; your staff know what to do, and you only hear about what
didn't happen.*

**Success signals (measurable):**

| # | Signal | Target | Today |
| --- | --- | --- | --- |
| S1 | **Time to first value**: sign-up to the first task a staff member finishes | Same day; under 10 minutes of the owner's own time | Hours to days (manual approval), then 15–60 minutes of setup |
| S2 | **Owner typing to set up a big house** (15+ rooms, 40+ chores, 4 staff, 3 pets) | 10 typed fields or fewer, or one voice note | About 65 typed fields and about 400 taps |
| S3 | **Closed without chasing**: due tasks that end the day done or marked "couldn't" by staff | 90% or more | Not measured. Proxy: 2 of 4 staff log every day |
| S4 | **Weekly active households**: at least 3 staff-finished tasks per staff member, in week 4 after sign-up | 70% of new households | 1 household, not a cohort |
| S5 | **Kakak repeat use**: owners who use Kakak 3+ times in their third week | 50% of households that tried her | Kakak is off |

None of these can be measured today: Miamus keeps no usage counts.
Recommendation 7 fixes that.

---

## 3. What production says (counts only)

| What | Count |
| --- | --- |
| Households | **1** (the founding household) |
| Admins · active staff · pets | 2 · 4 · 4 |
| Places (floors, rooms, spots) | 18 |
| Pet routines · chore rows | 92 · 218 (216 finished) |
| Routine logs, last 7 days · the 7 days before | **248 · 246**, all by staff |
| Staff who logged in the last 7 days | 2 of 4 |
| Chores finished, last 7 days · the 7 days before | 42 · 42 |
| Staff phones linked · seen this week | 14 · 14 |
| Push subscriptions | 2 (owners only; staff phones get none yet) |
| Kakak calls | **0** (switched off) |
| Couldn't-do · feedback · food · bills · repairs | all **0** |
| Access requests, ever | 3 |

What it means:

- **The habit is real, for one house.** The first log is from 12 September.
  The weekly numbers are flat and steady. That is the core loop working.
- **None of the last four days' features has been used yet.** Food, bills,
  repairs, feedback and couldn't-do are at zero. Some shipped today, so this
  is not a failure, but it means every decision since 6 November rests on
  judgement, not use.
- **The founding household needed 92 routines and dozens of repeating
  chores**, all typed by hand. That is the setup burden in one number.
- **The evidence base is one household**, run by the founder. Every lens
  below should be read with that in mind.

---

## 4. Scorecard

Scores are 1 (poor) to 5 (excellent). The 7 and 9 November columns are
implied by those reviews' findings (they gave no scores).

| Lens | 7 Nov | 9 Nov | **10 Nov** | Evidence |
| --- | --- | --- | --- | --- |
| (a) Core loop works end to end | 3 | 3 | **3.5** | Owner sets → staff finish with photos → owner sees: works daily in production. New: couldn't-do and the 19:00 evening summary close "the owner hears what didn't happen". Still missing: **staff are not told** about new work (no staff push). |
| (b) Friction and setup for a big house | 2 | 2 | **2** | ~65 typed fields and ~400 taps by hand (table in section 5). No templates. Kakak off. One good pattern now exists: **Bills and upkeep** is tick-and-add with no typing. |
| (c) Obvious on first use, reading load | 2 | 2 | **2.5** | Better: the checklist (household → staff → phone → task → done) and a WhatsApp send button. Worse: a new owner's first Today stacks **four cards** (Add to Home Screen with a pet tip, "Any pets?", the checklist, a "New: bills and upkeep" card); the checklist starts **below the fold**. About 330 words to read before the first chore. 55 What's-new entries were written in four days. |
| (d) Staff experience | 3 | 3 | **3.5** | Indonesian only, big buttons, one tip at a time, 5-minute undo, couldn't-do with four big reasons. Still: **two photos for every chore**, even "Buang sampah"; pet routines carry no instructions; no notifications. |
| (e) Scope and focus | 4 | 3 | **2.5** | Seven feature plans were written in one day. Closet, amounts, recipes, menu, nutrition, elders and health each add things to fill in. The Features switches (Phase 171) contain the damage but don't remove the input. |
| (f) Kakak | 1 | 2 | **2** | Built well: typed and voice, every change confirmed, spend caps, practice mode. But **off**, **0 calls**, the eval has never run, and voice can't work in an iPhone Home Screen app (Apple's limit; the panel falls back to keyboard dictation). Potential: a 5. |
| (g) Trust: privacy, bad Wi-Fi, data safety | 3 | 3.5 | **3.5** | Privacy policy kept current; access rules hardened; saves queue on weak signal; download and delete your data; daily backups on Pro. Still: **no crash reporting**, so failures on real phones are invisible. |
| (h) Ready for the first paying households | 1 | 1.5 | **1.5** | Landing page live; support address set. But sign-up is **invite-only with manual approval** and no email telling people they're in; no payment; no price shown; Vercel is on the non-commercial plan. |

---

## 5. Friction audit

Counted from the screens and the code; taps are approximate. "Reading" is the
text a person meets on the way, not counting labels.

| Job | Taps | Typed fields | Reading | How to cut it |
| --- | --- | --- | --- | --- |
| **New owner: sign up → household ready** | ~8 (Google, language, request access, later: name, pets, create) | 1 (household name) | ~120 words, plus a **wait for approval** of hours to days, with no message when approved | Approve automatically (or with an invite code) and review afterwards. Ask **"What kind of home?"** here and load a starter template. |
| **Add 4 staff and link their phones** | ~24 (per person: add + link + WhatsApp send) | 4 (names) | ~150 words (three numbered instructions on Staff, two paragraphs on Invite) | One screen: names, then **one** WhatsApp message with the house link. Cut the instructions to one line and a 15-second video. |
| **Add one chore and assign it** | 6–8 | 1 (title); 11 fields on the form | Field labels only | Pick from the template list; staff name chips instead of a dropdown. |
| **Set up a big house by hand** (20 places, 40 chores, 3 pets with routines) | ~400 | ~65 | Every form, 40 times | **Template + Kakak**: pick the house type, untick what doesn't apply, say what's different. Target: under 10 typed fields, ~20 taps, 5–10 minutes. |
| **Staff: first sign-in → first chore done with photos** | ~16 (open link, name, PIN twice, chore, two photos, done) + ~4 for Add to Home Screen | 0 | Short; the Home Screen step is left to them | Already low. Photo proof per chore (after only for small jobs) cuts 2–3 taps a chore. A video tip for Add to Home Screen. |
| **Staff: log a pet routine** | 4–5 (open, photo, tick pets, save) | 0 | None | Fine. Add owner instructions on the routine card (audit item 6). |
| **Add food** | ~5 | 1–2 (name, maybe date) | Little | Kakak reads a label photo or "Tante Rina kasih rendang". |
| **Staff: report something (Lapor)** | 5–6 | 0–1 | Little | Fine. A voice note later. |
| **Set a bill reminder** | ~4 (Bills and upkeep → tick → Add) | 0 (amount optional) | Little | **This is the pattern to copy everywhere**: a list of the usual things, tick, done. |
| **Ask Kakak to add something** | 3–4 (open, send, maybe one answer chip, confirm) | 1 sentence, typed or dictated | Little | Already the lowest-friction path. **Switched off today.** |

**Time to first value today.** Sign-up to approval: hours to days. Then,
for a minimal start (one staff member, one chore), about 10–15 minutes of
the owner's time, and the first chore is finished the same day if the staff
member opens the WhatsApp link. For a big house set up properly, 45–60
minutes of typing. Target: same day, under 10 minutes of owner time, for
the whole house.

**What a new owner must read.** Roughly 330 words before the first chore:
the Add to Home Screen card (~55 words, with a tip about pets), the pets
question (~20), the checklist (~60), a "New: bills and upkeep" card (~55,
meaningless to someone who just arrived), the Staff instructions (~70) and
the Invite page (~70). The cousin's "overbearing instructions" is first-
impression evidence only, but these counts point the same way.

---

## 6. Kakak affordability

### What one request costs

Measured from the code (`src/lib/kakak/prompt.ts`, `tools.ts`, `household.ts`,
`engine.ts`), for a big house: 5 people, 3 pets, 25 places, 40 items.

- Instructions and tools, the same for every household: 12,900 characters,
  about **3,600 tokens**, cached.
- This household's block: 2,800 characters, about **900 tokens**, cached
  for the conversation.
- What the owner says: about **150 tokens**.
- Kakak's answer including her thinking, at the `low` effort the route uses:
  about **600 tokens** (an estimate; the eval will measure it).
- A follow-up turn (after she asks one question) re-reads about **800
  tokens** of the conversation.

Cache entries last 5 minutes. With only a few households, the shared part
will usually have expired, so **the first call of most conversations pays
to write the cache** ("cold"). With many households it stays warm. Prices
from `src/lib/kakak/cost.ts` (US dollars per million tokens). All three
models cache prompts of this size.

| Per call | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- |
| First call, cold cache | $0.0009 | $0.018 | $0.035 |
| First call, warm cache | $0.0005 | $0.009 | $0.018 |
| Follow-up call | $0.0004 | $0.008 | $0.017 |
| **One "add"** (1.3 calls on average, +25% for retries), cold | **$0.0013** | **$0.025** | **$0.050** |
| One "add", warm | $0.0007 | $0.014 | $0.029 |

The manager's figures ($0.0005 Haiku, $0.017 Opus) are the warm, single-call
case. At today's traffic, plan on the cold figures: about **twice** that.

### Per household per month

| Use | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- |
| Free quick-add, capped at 30 adds | $0.04 | $0.75 | $1.50 |
| Typical paid use, 120 adds | $0.16 | $3.00 | $6.00 (warm: $3.40) |
| Heavy, 300 adds (the soft cap) | $0.39 | $7.50 | $15.00 (warm: $8.60) |
| **Whole-house setup, once** (about four large calls) | $0.01 | $0.16 | **$0.32** |

What this says:

- **A free Kakak quick-add on Haiku is affordable.** 30 adds cost about
  4 US cents (around Rp700) per household per month. A thousand free
  households would cost about $40 a month.
- **Setup is a one-off and cheap even on the best model.** Under 50 US
  cents per household on Opus. It is the single most valuable thing Kakak
  can do, because it removes the biggest friction. Give it to everyone, free.
- **Opus for every daily add is the expensive choice** for something Haiku
  or Sonnet may do as well. Today the model is one setting for everything
  (`KAKAK_MODEL`, default Opus) at effort `low` (`KAKAK_EFFORT`).
- The current $20 monthly spend cap covers about 400 Opus adds, or about
  15,000 Haiku adds.

### Recommended routing

| Job | Model | Why |
| --- | --- | --- |
| **Quick add** (one chore, a shopping item, food, a routine) | **Haiku 5.5**, if the eval passes; otherwise Sonnet 5.5 | High volume, simple, the free tier |
| **Whole-house setup** from a voice note or a paragraph | **Opus 5.5** | Once per household; quality matters most; cost is trivial |
| **Photo of a label or receipt** | Haiku or Sonnet, from the photo eval | Resize on the phone first (already done) |
| **Questions about the house, summaries** (later, paid) | Sonnet 5.5 | Needs judgement, still affordable |

Routing per job needs a small code change: today one model serves every
request. Whole-house setup also needs design work: answers are capped at
4,000 tokens and 8 calls per conversation, too small to add 40 chores in one
go, so it needs a "confirm all" card and batches.

**Free-tier allowance (recommended):** whole-house setup once, free, for
every household; then **30 Kakak adds a month** (about one a day) on Haiku.
Paid: the soft cap of about 300 a month, photos, and the harder jobs on
Sonnet or Opus.

### What the Kakak eval (PR #25) must confirm before switching to Haiku

Run the 70 dev sentences on Haiku `low` and `medium` against Opus `low`.
Switch only if Haiku:

1. has **zero "must-never" failures** (wrong person, a food date it made up,
   anything changed without a card);
2. passes within about 5 points of Opus overall;
3. gets **names right** at least as often ("Mbak Yanti", not "Mbak Yati");
4. asks **no more questions** than Opus (each question is another tap and
   another call);
5. answers in under about 5 seconds at p95;
6. costs less **per passed case**, not just per call.

Then run the held-out set once to confirm. Note that Haiku has no automatic
fallback when it declines; the app already handles that by saying "add it
yourself".

---

## 7. Scope verdict per planned feature

| Feature | Verdict | Reason |
| --- | --- | --- |
| **Staff push** (Phase 166) | **Build now** | Closes the missing "staff receive" step. No new input for anyone. |
| **Couldn't-do + evening summary** (139) | **Keep, measure** | Shipped today. It's the "you only hear what didn't happen" half of the promise. |
| **Features switches** (171 PR A) | **Build now, trimmed** | Keeps Miamus light. But make the sign-up question do work: **"What kind of home?"** should load a starter template, not only reorder Today. |
| **People records, elders' routines** (171 PR B) | **Later, optional switch** | Real need in many big houses, but no target household has asked yet. Interview first. |
| **Health** | **Drop for now** | Sensitive personal data under UU PDP, far from the core promise. |
| **Staff pay, THR, days off** (167) | **Build later (January), as planned** | Strong fit for the target market and the new law, before Lebaran. Pre-fill from the staff list; keep it optional. |
| **Closet** (169) | **Later, optional switch** | Heavy input (photographing items and sections). Only after setup is solved and a target household asks. |
| **Kitchen amounts** (170 PR A) | **Later, optional switch** | Counting is a chore; Phase 153 already learned this. |
| **Recipes** (170 PR B) | **Later, optional switch** | Pleasant, but a hobby feature. Kakak can fill it from a photo of a recipe later. |
| **Weekly menu and "Menu hari ini" for the cook** (170 PR C) | **Later, but first of the kitchen set** | The most useful kitchen piece for a house with a cook: it tells staff what to do. Best done by Kakak ("plan this week's menu"). |
| **Addendum: use-soon, ready-to-cook, pack sizes, where to buy** (PR #77) | **Use-soon: exists already. The rest: drop, or Kakak-only later** | Each is another field. Use-soon is already the 07:00 food reminder. |
| **Basic nutrition** (PR #77) | **Drop for now** | Input-heavy and off the core. Revisit only if paying households ask. |
| **WhatsApp as an input channel** | **Later, as decided** | After staff push has two weeks of data. Needs the company entity and Meta verification. |

---

## 8. Best recommendations, ranked

| # | What | Why | Effect on the signals | Size | Plan first? |
| --- | --- | --- | --- | --- | --- |
| 1 | **Switch Kakak on this week, and run the eval with Haiku in it.** Keep the Saturday go-live. Add per-job model routing (Haiku quick-add, Opus setup) once the eval answers. | The low-friction path is the whole answer to the owner's worry, and it has zero real use. | S5 measurable; the cost per add becomes a fact, not an estimate. | S | No (go-live sheet exists); routing is a short note |
| 2 | **Starter templates per house type.** "What kind of home?" at sign-up (for example: house with garden and pool · big house with several floors · apartment) loads rooms, the usual chores with sensible repeats, and bills. The owner unticks, then taps staff names to assign. | Turns 65 typed fields into ticks, like Bills and upkeep already does. Works with no AI, so the free tier stays genuinely useful. | S1 and S2 most. | M | Yes, with a mockup |
| 3 | **Kakak-led setup from one voice note, free once for everyone**, on Opus: "Rumah 3 lantai, 4 staf, 2 anjing, kolam renang..." → a list of rooms, chores and routines with **one "Add all" card**. | The demo moment, and the biggest friction removed. Under 50 US cents per household. | S1, S2; also the best sales story. | M–L | Yes (batch tool, bigger answers, confirm-all card) |
| 4 | **Remove the approval wait.** Approve automatically (or with a code from the landing page) and review afterwards. | Every other improvement is wasted while a new owner waits hours or days and is never told. | S1 from days to minutes. | S | Short decision note |
| 5 | **Build staff push (Phase 166) now.** | Staff hear about new or moved work without the owner sending a WhatsApp. | S3. | M | No (decided) |
| 6 | **Calm the first screen.** No What's-new cards for households in their first 14 days or until setup is done; the Add to Home Screen tip after setup; the checklist first, above the fold; every instruction block cut to one line plus a **15-second video tip** (owner in their language, staff in Indonesian). | ~330 words of reading before the first chore, for people who want TikTok-short. | S1; first impression (the cousin's complaint). | S | Mockup only |
| 7 | **Measure.** Counts only, no content: sign-up time, first staff finish, number of fields typed in setup, tasks closed per day, weekly active households, Kakak repeat use. Plus one privacy-policy line. | The north star can't be steered without it; today we know nothing beyond one house. | Makes S1–S5 visible. | S–M | Short plan (roadmap item 21) |
| 8 | **Delegated setup.** Let the owner hand setup to a head staff member or a family assistant, in Indonesian, with the owner approving at the end. **Concierge setup** for the paid plan: we set the house up from a voice note or a 2-minute video walk-through. | The target owner delegates everything else; setup should be no different. | S2 to near zero for delegators. | M–L | Yes |
| 9 | **Photo proof per chore**: before and after / after only / none (audit item 8). Default "after only" for small jobs. | Two photos for "Buang sampah" is friction and feels like being watched. | S3; staff goodwill. | M | Plan exists in the audit |
| 10 | **Get 3–5 target households live and a paid-pilot path ready**: Vercel Pro, crash reporting, one paid plan with a trial. Screen-record each owner's first 10 minutes. | One household can't tell us if this is a business. Real target owners will show where setup breaks. | S1–S5 measured on the right people. | M | Owner actions plus a short plan |

### What to stop doing

- **Stop opening new module plans** (closet, recipes, nutrition, elders,
  health, workouts) until recommendations 2 and 3 have shipped and 3 target
  households are live. Plans already decided can wait without harm.
- **Stop adding a What's-new card for every change.** 55 entries in four
  days. At most one a week, owners only, never for new households.
- **No new required field on the default path.** Every new field must be
  optional, defaulted, filled by a template, or filled by Kakak.
- **No new reading for staff.** A video tip, or nothing.
- **Stop treating PR count as progress.** Measure S1–S5 instead.

---

## 9. What would change my mind

| If we see this | Then |
| --- | --- |
| Target owners set up a big house by hand in under 20 minutes and are still active in week 4 | Templates and Kakak setup are less urgent; staff push and paying come first. |
| Owners love templates but rarely open Kakak | Kakak's paid value is answers and summaries, not input. Rethink what's paid. |
| Haiku fails the eval on names or dates | Sonnet for quick adds; a smaller free allowance (still affordable at ~$0.75 for 30). |
| Staff ignore push notifications | Run the WhatsApp experiment sooner. |
| Target households ask for a menu or the closet on their own, in interviews | Move the kitchen menu (170 PR C) up. |
| Target owners call the instructions overbearing, like the cousin did | Recommendation 6 becomes the top priority. |

**Evidence to gather next (two weeks):**

1. **3–5 target households** (3+ staff, a big house). Screen-record the
   owner's first 10 minutes, unaided. Count taps, typed fields and where
   they stop.
2. **The Kakak family weekend**: cost per add, how often she asks a
   question, how often a card is changed or cancelled.
3. **The Kakak eval** with Haiku, Sonnet and Opus at `low`, as above.
4. **Two head staff members**: could they set up the house if the
   owner asked them to?
5. **Week-on-week counts** for the founding household and every new one.

---

## Recommended next step

Switch Kakak on for the family weekend, as planned, and run the Kakak eval
with Haiku included before Saturday (recommendation 1). It is small, it is
ready, and it turns the low-friction promise from a plan into numbers.
