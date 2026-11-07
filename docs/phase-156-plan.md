# Phase 156 plan — Tell Kakak, and Food at home

Status: **accepted by the owner, 2026-11-07** (decisions V1–O1, plus the
owner's notes folded into sections 0 and 3b). Nothing is built yet.

The owner's aim: *if my mum can use it, anyone can.* Two ideas, one shared
piece of technology:

1. **Tell Kakak** — say (or type) what you want — "have Sari mop the terrace
   every Monday" — and Miamus asks what's missing, then sets it up after you
   confirm. A reason to pay for Miamus later.
2. **Food at home** — Indonesian homes receive a lot of food and gifts
   (hantaran, parcel, oleh-oleh, nasi kotak, kue Lebaran/Natal/Imlek). Snap a
   photo, Miamus reads or estimates when it expires and says where to keep it,
   so the family knows what to eat soon, give away or throw out.

Both use the same thing underneath: an AI step that turns words or a photo
into a suggestion the person confirms.

## 0. Two rules for everything

**Everything works by hand; AI only makes it faster.** Food, gifts,
groceries, chores, repairs, routines — all can be added and managed without
AI on the basic plan. The AI parts (talking to Miamus, reading a photo,
estimating how long food keeps) are the premium extras. No screen depends on
AI to be usable. (Owner, 2026-11-07.)

**Premium means less, placed with intent.** Apple's way: clear, calm,
straight to the point.

- **Five tabs, never more:** Today · Pets · Chores · Kitchen · Household.
  New things go inside the tab they belong to.
- **One main action per screen**, and it is obvious (one primary button).
- **Show what matters now; put the rest one tap away** (progressive
  disclosure). Lists before forms; summaries before detail.
- **The same few building blocks everywhere** — rows, rounded groups, the
  pill switch, bottom sheets with big choices, the confirm card — so every
  screen feels familiar.
- **Calm colour** (Phase 153): neutral; red only for late, sick or expired;
  amber only for "waiting for you".
- **Nothing is added without asking what it replaces.** Every feature passes
  "would my mother understand this on first sight?".
- **Each screen is checked at phone size, in both languages, with the owner,
  before it is merged.**

## 0b. Kakak — the face of the AI help

All of Miamus's AI help is one character: **Kakak**, Poofy Labs' caring,
loving elder-sister character across its products. Owner decision
2026-11-07: "Kakak" for now; a proper name ("Kak …") only if it causes
confusion or a trademark need (the name lives in one place, so renaming is
cheap).

- **The simple story:** *free — you do it by hand; Plus — Kakak helps you.*
  Talking to set things up, reading food photos, estimating expiry dates and
  the weekly summary are all "Kakak".
- **Name plus purpose:** the button says **"Bilang ke Kakak" / "Tell
  Kakak"** with her small avatar; the first time, one line explains it —
  "Kakak can set things up for you — just tell her." / "Kakak bisa
  mengaturnya untuk Anda — cukup bilang saja."
- **Only where she acts:** the mic button, her questions, the confirmation
  card. No mascot elsewhere, so her face always means "help that does
  things for you".
- **Tone:** warm, short, calm; never cutesy, no strings of emoji. She
  addresses people as the glossary says (owners and staff as *Anda*, or by
  name) and never talks down to anyone.
- **Honest:** she always asks before saving, and says plainly when she is
  unsure or got something wrong.
- **One look everywhere:** avatar, colour (and a voice, if she ever speaks)
  defined once by Poofy Labs and reused across products.

## 1. The rule both AI features follow: suggest, then confirm

- **Nothing is saved until a person taps "Looks right".** The AI only fills in
  a card in plain words; the app saves it, through the same permission checks
  (RLS) as a manual entry. Undo afterwards.
- **One question at a time, with tappable answers.** "Which day?" →
  *Monday · Every Monday · Pick a date* — not more typing or talking.
- **It never deletes or changes something on its own.** First version: add
  only.
- **Typing always works too** (noisy kitchen, shy about talking).

## 2. Tell Kakak

**Where:** one round mic button on Today (owners), labelled "Tell Kakak" /
"Bilang ke Kakak". Hold to talk, or tap to type.

**First things it can do** (the most common, the least risky):

| Say | Miamus sets up |
| --- | --- |
| "Mbak Sari pel teras tiap Senin jam 9" | A repeating chore, assigned to Sari |
| "Besok Budi bersihkan kamar mandi atas" | A one-off chore for tomorrow |
| "Beli telur sama sabun cuci" | Two things on the shopping list |
| "Mochi makan jam 7 pagi dan 6 sore" | Mochi's meal routine |
| "Kami dapat lapis legit dari Tante Rina" | A food item (section 3) |

**It understands:** Indonesian, English and a mix; honorifics ("Mbak Sari",
"Bik Nah" → Sari, Nah); relative days ("besok", "lusa", "tiap Senin") in
Jakarta time; the household's own staff, pets and rooms.

**It asks when unsure:** two people with similar names, no day given, a room
it doesn't know ("Add *Gudang* as a new room?").

**Later, not first:** questions ("what did Sari do today?"); a spoken reply;
**staff talking instead of typing** ("Mochi muntah tadi pagi") — possibly the
bigger win, since many staff read slowly; WhatsApp voice notes to Miamus.

## 3. Food at home

### Adding food (owner or staff)

1. **+ Makanan / Food** → take a photo (or skip the photo and type).
2. Miamus suggests, from the photo:
   - **what it is** ("Lapis legit");
   - **the date on the label**, if there is one;
   - if there is none (homemade, bakery box): **a cautious estimate** by type
     of food — "about 7 days at room temperature, 2 weeks in the fridge";
   - **where to keep it** — counter, fridge, freezer — and why in a few words
     ("santan spoils fast — fridge").
3. The person checks it, can change anything, and adds (optional):
   **from whom** ("Tante Rina") and **where it is** (fridge, freezer, pantry,
   counter). Saved.

### Seeing it

- **Today:** one quiet line, like the shopping one — "3 foods to eat soon".
- **The food list:** soonest first — *Eat today · This week · Later* — each
  with a small photo, where it is, and days left. Expired in red.
- **A morning notification** to owners (and optionally staff) when something
  runs out tomorrow.

### When it's gone

One tap: **Eaten · Given away · Thrown away**. That keeps the list honest, and
over time shows how much is wasted.

### Two Indonesian touches

- **Containers to return.** Food often arrives in someone's rantang or
  container, and it goes back (often with something in it). A "Return
  container to Tante Rina" reminder when the food is finished.
- **Who gave what**, so thank-yous and returning the favour aren't forgotten
  (Lebaran, Natal, Imlek).

### Safety

- Estimates are labelled **"estimate"**, always on the cautious side, and say
  "if it smells or looks off, throw it away". Risky foods (santan, rice
  dishes, seafood, sambal, anything with egg or mayo) get the shortest
  estimates. The label's date always wins over an estimate.
- Not medical or food-safety advice: the terms and the screen say so.

### Where it lives

The Shopping tab becomes **Kitchen / Dapur**, with a pill switch:
**Food · To buy** (staff: **Makanan · Belanja**). Food first, because it is
the time-sensitive one. No sixth tab.

## 3b. The house: rooms, floors, chores and repairs

The owner asked for a place to see the house, with chores and repairs
attached to floors and rooms. Planned (backlog item since 2026-11-06), not
built yet.

**Where:** inside **Chores**, a pill switch **Today · Rooms** (staff:
**Hari ini · Ruangan**). No new tab.

**Rooms view:** the house by floor — *Lantai 1 · Lantai 2 · Luar* — each
room one row: its chores (how often, next, who) and anything to fix. Tap a
room for its page. Rooms nobody has cleaned in two weeks, or with no chores
at all, say so quietly.

**Floors:** an optional floor on each room ("Lantai 2" + "Kamar utama"),
filled in by splitting today's names that start with "LT2" and the like.

**Repairs (by hand on the basic plan):**
- **+ Repair** from a room or from Today: a photo, a few words, the room.
- Status: **Open → Waiting on someone → Fixed** (with an "after" photo).
- **Share on WhatsApp** to whoever fixes it (photo and text through the
  phone's share sheet). Repair people stay outside the app: at most a
  free-text "who's fixing it".
- Today shows one quiet line when something is open ("1 thing to fix").
- Repair photos are kept until fixed (not deleted at 30 days): the privacy
  policy changes with it.
- Premium later: say "the tap in the upstairs bathroom is leaking" and Miamus
  fills in the repair.

## 4. The technology

- **Voice → text → suggestion.** A speech-to-text service turns the recording
  into text first (shown to the person, so they see what Miamus heard); then
  Claude turns the text into a suggestion. The phone's built-in dictation is
  free but unreliable in iPhone home-screen apps, so a dedicated service is
  the safer default. Candidates to test with real Indonesian recordings
  before choosing (accuracy, price, data location).
- **Photo → suggestion.** Claude reads images directly (label dates, what the
  food is). No separate service.
- **Claude, with tools the app defines** (create_chore, add_to_shopping_list,
  add_pet_routine, add_food, ask_question), each with a strict schema, so the
  answer is always a valid suggestion. A server route holds the API key,
  checks that the caller belongs to the household, and limits how many
  requests a household can make per day.
- **The household's context** goes with each request: staff names, pets,
  rooms, today's date in Jakarta. No other household's data, ever.
- **Model and cost.** Default: **Claude Opus 5.5** (best with mixed Indonesian
  and English). Rough estimates, to be measured:

  | | Per request (1–3 back-and-forths, or one photo) | Heavy user, 10 a day |
  | --- | --- | --- |
  | Opus 5.5 | ~$0.03–0.10 | ~$10–30 / month |
  | Sonnet 5.5 | ~$0.02–0.05 | ~$5–15 / month |
  | Haiku 5.5 | well under $0.01 | under $1 / month |

  Plus speech-to-text (typically around a cent per short voice note). Whether
  a cheaper model is good enough is the owner's call, decided by testing 30–50
  real sentences and 20 real food photos from this household.
- **Built test-first:** those sentences and photos become an automatic check,
  so later changes can't quietly make it worse.

## 5. Privacy and legal

- **New: two outside services** see household text and photos — the
  speech-to-text provider and Anthropic (Claude). The privacy policy (both
  languages) and `legal.ts` must name them, what they receive, and that it may
  be processed outside Indonesia (UU PDP's cross-border rules).
- **No voice recordings are kept** — sent for transcription, then discarded.
  Transcripts are not stored beyond the suggestion.
- **Food photos** are kept while the food is on the list, then deleted (like
  chore photos, which go after 30 days).
- **Owner turns it on** for the household (opt-in), and can turn it off.
- **Before charging money** (section 6): a registered business for Poofy
  Labs, PSE registration with Komdigi (required for electronic services
  offered in Indonesia), terms of service, VAT on digital services.

## 6. Miamus Plus (later)

- **Free:** everything Miamus does today, plus Food at home with typing.
- **Plus (subscription):** Tell Kakak (voice and typing), photo reading for
  food, a weekly "what happened at home" summary, later WhatsApp voice notes
  and staff voice reports.
- **Fair use:** AI costs grow with use, so Plus has a daily limit (generous
  for a family) or a price that covers heavy users.
- **Payments:** Indonesian methods (QRIS, e-wallets, bank transfer) through a
  provider such as Midtrans or Xendit. As a web app, no app-store cut.
- **Price:** decided after family and friends have used it, not before.

## 7. Order of work

| # | What | Why this order |
| --- | --- | --- |
| 0 | **Backups on**, short guide | Before family data goes in |
| 1 | **Food at home**, typing first, then photo reading | Self-contained; sets up the AI route, privacy update and cost tracking on one feature |
| 2 | **Tell Kakak, typed**, owner-only, family-only | Reuses step 1's pipeline; tests understanding cheaply |
| 3 | **The mic** (speech-to-text) | Once typing works for the owner's mother |
| 4 | **Rooms view, floors, repairs** (by hand) | The house at a glance; repairs then gain voice/photo later |
| 5 | Staff voice reports | The low-literacy win |
| 6 | Plus: pricing, payments, legal | Once people actually use it |

Each step: a plan of its own, tests, Codex review, staging, then production
with the owner's OK — as now.

## Decisions for the owner

| # | Question | Recommended |
| --- | --- | --- |
| V1 | Suggest-then-confirm, never saving or deleting on its own | Yes |
| V2 | Tell Kakak starts with: chores, shopping list, pet routines, food | Yes |
| V3 | Typed first, mic second | Yes |
| V4 | Speech-to-text: test 2–3 services with real Indonesian recordings, then choose | Yes |
| V5 | Model: start on Opus 5.5; try cheaper ones on the household's own test set | Yes (owner decides after the test) |
| F1 | Food at home: photo → what it is, label date or cautious estimate, where to keep it | Yes |
| F2 | Eaten / Given away / Thrown away, and container-return reminders | Yes |
| F3 | Shopping tab becomes Kitchen / Dapur with Food · To buy | Yes |
| F4 | Morning notification for food running out tomorrow | Yes, owners; staff optional |
| P1 | Owner opt-in; no recordings kept; privacy policy names both services | Yes |
| P2 | Free = today's app + typed Food; Plus = voice, photo reading, weekly summary | Yes, price later |
| O1 | Order of work as in section 7 (Food first) | Yes |
| M1 | Everything works by hand on the basic plan; AI parts are premium | Yes (owner, 2026-11-07) |
| D1 | The design rules in section 0 (five tabs, one main action, progressive disclosure) | Yes |
| H1 | Chores gets Today · Rooms; rooms grouped by floor | Yes |
| H2 | Repairs: photo, status, share on WhatsApp; kept until fixed | Yes |
| K1 | The AI help is "Kakak" ("Bilang ke Kakak" / "Tell Kakak"); rename only if needed | Yes (owner, 2026-11-07) |
