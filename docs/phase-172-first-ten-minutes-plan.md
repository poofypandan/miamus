# Phase 172 — The first 10 minutes

Status: **decided: all A except D1 = manual approval kept and D2 = tell
them by WhatsApp or email, 2026-11-11** (D1–D15 A on 2026-11-10; on
2026-11-11 the owner changed D1: "make sure I still need to approve new
households", and D2: WhatsApp first, email second). **Build order PR 0 (145) → A1 →
171 PR A (146) → A2 → B.** Nothing is built
and nothing is applied anywhere. The owner questions below stay open; until
they're answered the build uses the defaults (cap 25, keep the $20 limit,
Indonesian room names with English beside them, captions only, 4 home
types). This
plan turns the recommendations the owner adopted on 10 November ("Yes, adopt
it") into one experience. It covers recommendations **2** (starter
templates), **3** (Kakak setup from one voice note), **4** (the approval
wait; the owner keeps manual approval, and people are told right away),
**6** (calm first screen, video tips) and **7** (usage counts),
with **8** (delegated setup) designed now and built later. Source:
`docs/app-evaluation-2026-11-10.md` (PR #79). Migration **145** is
this phase's, for its first PR (PR 0, measurement): decided by the manager
on 10 November. Phase 171's PR A takes **146**. Mockup:
`docs/mockups/phase-172-first-ten-minutes.html` (open in a browser, phone
width; owner screens English left and Bahasa Indonesia right, staff screens
Bahasa Indonesia only). Roadmap: item 21 points here, new rows 31–34 (PR #78 uses 26–30).

Works with **Phase 171** (PR #78, being revised): 171 owns the sign-up
questions and Household → Features; 172 owns what happens after the answer.
The exact hand-off is under "Where 171 stops and 172 starts".

## The goal (north star S1, S2)

A new owner of a big house (15+ rooms, 40+ chores, 4 staff, 3 pets) goes
from sign-up to **staff finishing their first task the same day**, with
**under 10 minutes and at most 10 typed fields** of the owner's own time,
or **one voice note**.

## The problem

From the evaluation's friction audit (section 5), counted on `main` at
`b6e84c5`:

- **A wait nobody hears about.** Sign-up is invite-only. A new owner taps
  "Request access" and waits hours to days for the operator to approve them
  by hand. No message tells them when it's done; they have to come back and
  tap "Check again".
- **Setting up a big house means about 65 typed fields and about 400
  taps.** Every room, chore and routine is its own form. The founding
  household typed 92 routines and dozens of repeating chores by hand.
- **Staff take four separate sends.** For each person: add, make a link,
  send on WhatsApp. About 24 taps and 150 words of instructions.
- **The first screen is loud.** A new owner's first Today stacks four
  cards (Add to Home Screen with a pet tip, "Any pets?", the checklist, "New:
  bills and upkeep"). The checklist starts below the fold. About **330
  words** to read before the first chore.
- **Kakak, the easy path, is off,** and her limits (4,000-token answers,
  8 calls a conversation, 500 typed characters) are too small to set up a
  house in one go.
- **Nothing is measured.** No usage counts exist, so none of S1–S5 can be
  seen.

## What exists (read 2026-11-10)

- **Sign-up** (`src/app/(auth)/onboarding/page.tsx`): language →
  `my_household_access()` → **Request access** (`request_household_access()`,
  which files a `household_access_requests` row and pushes "New household
  request" to the platform admins) → **Request sent** with **Check again**
  (re-checks when the tab is shown again) → after approval, **Name your
  household** plus **Who lives here?** (Pets chip; Kids and Elders greyed
  "Soon") → `create_household(p_name, p_has_pets)` → Today.
- **Approval** (migration 113, Phase 148): `platform_admins` (seeded by hand,
  never an email in code), `household_access_requests` (pending, approved or
  rejected; one row per account), `is_platform_admin()`,
  `list_household_access_requests()` and `decide_household_access()` behind
  the approvals page (`src/app/dashboard/approvals`,
  `src/components/dashboard/household-requests-banner.tsx`).
  `create_household` (re-created in 133 with `p_has_pets`) refuses an account
  without an approved request, and any account that already has a household
  (one household per approval). Rejected requests are deleted after 30 days
  with their Google account (privacy policy section 7). Anonymous sessions
  (staff phones) can never request or create. **Miamus sends no email**: no
  mail service exists in the code.
- **Rooms** (105, 129, 140): `household_locations` with `kind` `room` or
  `floor`, `parent_id` (a room on a floor, or a room inside a top-level
  room), names unique per parent (`lower(btrim(name))`). Chores point at a
  room (`location_id`) and an optional **spot** (`household_tasks.spot`,
  text up to 40).
- **Chores** (`household_tasks`, 097, 128, 137): `recurrence` daily, weekly
  or monthly, `recurrence_interval` 1–12 (every 2 weeks, 3 months, 6 months,
  a year), the template's `due_date` sets the weekday or day of the month,
  `remind_days_before`, categories cleaning, maintenance, errand, groceries,
  bill. Owners write them; staff phones can only claim, photograph, finish
  and say couldn't (128's guard).
- **Bills and upkeep** (Phase 164, `src/lib/bills-upkeep.ts`): `QUICK_ITEMS`,
  a list of the usual things with cadence, day, who and reminder defaults;
  `alreadyAdded()` marks what a household already has; `savedTitle()` saves
  the Indonesian name when staff may do it. **This is the pattern this plan
  copies everywhere: a list of the usual things, tick, done.**
- **Staff**: `staff_profiles` (owners add them); a per-person invite link
  (`redeem_staff_invite`, single use, expires) and the **house code**
  (115: `/join/code`, `house_code_roster()` lists staff with `has_pin`,
  `sign_in_with_house_code()` answers `no_pin` for someone without a PIN, so
  today a new person can't use the code until they have a PIN). Messages in
  `src/lib/share-text.ts` (`inviteMessage`, `houseCodeMessage`), sent with
  `wa.me`.
- **First Today** (`src/components/dashboard/tabs/agenda-tab.tsx`): date
  ribbon → approval queue → medicine alerts → **PetsQuestionCard** → quiet
  lines → **FirstRunCard** (`src/lib/first-run.ts`: home → staff → phone →
  task → done, ticked from data) → four **WhatsNewCard**s → My tasks → the
  day. The Add to Home Screen tip is `push-prompt.tsx` (owners) and
  `staff-onboarding-banner.tsx` (staff). `src/lib/whats-new.ts` has 55
  owner entries and a staff list; each shows once where it lives.
- **Kakak** (`src/lib/kakak/*`, `src/app/api/kakak/route.ts`, migration
  126): one model for everything (`KAKAK_MODEL`, default Opus;
  `KAKAK_EFFORT` default `low`); `MAX_TOKENS 4000`,
  `MAX_CALLS_PER_CONVERSATION 8`, `MAX_QUESTIONS 3`, `MAX_TYPED 500`; five
  tools, each one suggestion card; `kakak_settings` per household
  (`allowed` by the platform admin, `enabled` by an owner, 40 calls a day);
  `kakak_config` (400 calls a day across all households, **at most 150,000
  micro-USD, $0.15, a call**); `kakak_requests` statistics with a CHECK on
  the tool names. Voice uses the browser's own speech recognition
  (`voice.ts`); it can't run in an iPhone Home Screen app (WebKit bug
  225298), so the panel falls back to the keyboard's mic.

## The idea in one line

**One short path from Google to a working house: one tap to ask, an
approval you hear about right away, one chip for the kind of home, a ready list you untick, staff names and one WhatsApp
message, then a calm Today with the checklist on top.** Kakak can replace
the ticking with one voice note, free once. Every step is counted, never
read.

## The flow, step by step

| # | Screen | Owner's typing | Owner's taps | Owner | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | **Continue with Google** → language | 0 | 2 | — | as today |
| 1b | **Request access** (one tap) → **Request sent**: "We'll let you know by WhatsApp or email as soon as you're approved." The operator approves and tells them right away (WhatsApp first, email second); the screen moves on by itself | 0 | 1 | — | 172 PR A1 (D1, D2) |
| 2 | **Name your household** + **Who lives here?** (Pets, Kids, Elders) | 1 | 2 | 171 | 171 |
| 3 | **What kind of home?** (4 cards) | 0 | 1 | 171 asks, 172 acts | hand-off |
| 4 | **Your home** (the template review): shape row, rooms and chores, bills; untick | 0 | ~12 | 172 | 172 PR A2 |
| 4b | or **Tell Kakak about your home** (one voice note) → the same review with an **Add all** card | 1 voice note | ~6 | 172 | 172 PR B |
| 5 | **Your staff**: names, an optional job chip each, **Send one WhatsApp message** | 4 | ~8 | 172 | 172 PR A2 |
| 6 | **Your pets** (only if Pets was picked): names and Dog · Cat; routines ticked | 3 | ~5 | 172 | 172 PR A2 |
| 7 | **Today**, calm: the checklist first, nothing else above the day | 0 | — | 172 | 172 PR A1 |
| 8 | Staff open the WhatsApp link → pick their name → make a PIN → first chore | (staff) | (staff) | 172 | 172 PR A2 |

Template path: **8 typed fields** (household name, 4 staff names, 3 pet
names), about **35 taps**, 6–8 minutes. Kakak path: **1 typed field and one
voice note** (Kakak hears the staff and pet names), about **20 taps**, 4–6
minutes. Steps 4–6 each have **Skip**: nothing on the default path is
required beyond the household's name (the stop rule). All of this comes
after the operator's approval (step 1b, D1): the minutes are the owner's own
time, not the wait.

## Before and after

Against the evaluation's friction audit (section 5). "Reading" is the text
a person meets on the way, not counting labels and the names of things.

| Job | Before: taps | Before: typed | Before: reading | Before: minutes | **After: taps** | **After: typed** | **After: reading** | **After: minutes** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sign-up → household ready | ~8 | 1 | ~120 words, **plus a wait of hours to days, and nobody tells you** | 2 + the wait | **~6** | **1** | **~60 words; the wait lasts until you approve, and they're told right away** | **1 + until approved** |
| Set up a big house (20 places, 40+ chores, bills) | ~400 | ~65 | every form, 40 times | 45–60 | **~13** (template) / **~6** (Kakak) | **0** / **one voice note** | **~60 words** | **3–4** / **2–3** |
| Add 4 staff and link their phones | ~24 | 4 | ~150 words | 5–8 | **~8** | **4** (0 with Kakak) | **~15 words** + an optional 15-second video | **1–2** |
| Add 3 pets with routines | ~60 | ~15 | form labels | 10 | **~8** | **3** (0 with Kakak) | ~10 words | **1** |
| Reading before the first chore (owner) | — | — | **~330 words** | — | — | — | **~110 words** | — |
| **Whole first session, big house** (S1, S2) | **~490** | **~85** | ~330 words | **60–80 + the wait** | **~35** / **~20** | **8** / **1 + one voice note** | ~110 words | **6–8** / **4–6**, + until approved |
| Staff: first sign-in → first chore done with photos | ~16 (+4 Home Screen) | 0 | short | 3 | **~14** (+4) | 0 | **one line** + a 15-second video | 2–3 |

**S1 before:** hours to days (approval, with no message when it's done),
then 15–60 minutes of setup.
**S1 after:** same day **when the operator approves the same day** (the
owner keeps manual approval, D1; the person is told by WhatsApp or email
the moment they're approved and the waiting screen moves on by itself); then 6–8 minutes of
owner time (template), 4–6 (Kakak);
the first staff finish as soon as a staff member opens the WhatsApp link
(and with staff push, Phase 166, they're told about new work).
**S2 before:** about 65 typed fields and 400 taps (85 and 490 with staff and
pets). **S2 after:** 8 typed fields and about 35 taps, or one voice note,
one typed field and about 20 taps.

These "after" numbers are targets counted from the mockup. PR 0 measures
the real ones (D13).

## 1. Approval kept, and nobody waits in silence (recommendation 4, D1, D2)

**Owner decision, 2026-11-11 (D1):** "make sure I still need to approve new
households." Manual approval stays the default. Automatic approval is built
as a **switch, off by default**, for later. What changes is that nobody
waits without hearing back, and the wait is as short as the operator makes
it.

### What a new owner sees (switch off, the default)

1. **Request access**, one tap, after the language: today's screen, with
   the body cut to one line ("Miamus approves each new household. Ask once;
   we'll let you know.") and the privacy sentence kept under the button.
2. **Request sent**: "**We'll let you know by WhatsApp or email as soon as
   you're approved.**" The screen checks
   again by itself every 60 seconds while it's on screen (it already checks
   when the tab is shown again), so someone who keeps it open moves on to
   the name screen without tapping anything. **Check again** stays.
3. **Approved**: the next time the screen checks, or when they open the
   link in the WhatsApp message or email, they're on **Name your household**, and the rest of the
   flow runs as above.

### What the operator does

- **Told right away**: the existing push "New household request · X is
  waiting for your approval" (`request_household_access`, 113) is
  unchanged. The evening review also lists pending requests.
- **Approve, then tell them by WhatsApp or email (D2):** on the approvals
  page, tapping **Approve** leaves the row open with two buttons:
  1. **Send on WhatsApp** (first, primary): a `wa.me/?text=` share (the
     same `whatsAppShareUrl()` the app already uses) with a ready message in
     their language and the link: "You're in. Open https://miamus.app to set
     up your household." / "Anda sudah bisa masuk. Buka https://miamus.app
     untuk menyiapkan rumah Anda." **The operator picks the chat**: sign-up
     collects no phone number, and this plan doesn't add one (no new
     personal data, no new field). It suits a beta where the operator
     usually knows who asked.
  2. **Email them** (second): a `mailto:` link to their Google email (already
     on the request) with the same text, sent by hand from the support
     Google Group.

  Pending rows have the same two buttons ("We've got your request…") for
  anyone who waits longer than a day. "Their language" is the language they
  picked at sign-up: `list_household_access_requests()` is re-created to also
  return it (from `user_preferences`, 114; English when none). No mail or
  messaging service, no new processor, nothing new stored.
- Reject and the 30-day deletion of rejected requests are unchanged.

### The automatic-approval switch (built, off by default)

So the owner can turn it on later without a new release, PR A1 builds it
and leaves it off:

- **`signup_config`** (one row, like `kakak_config`; platform admin with
  SQL): `auto_approve boolean not null default false`, `daily_auto_cap int
  not null default 25`.
- **When it is on**, `my_household_access()` answers **`open`** for an
  account with no request yet, and `canCreateHousehold()` accepts it.
  `create_household(p_name, p_has_pets)` (re-created, same signature, same
  per-account lock) writes the request as **approved, automatically**
  (`decided_by` null, a new `auto boolean` column true) in the same
  transaction, if fewer than `daily_auto_cap` accounts were approved
  automatically today (Jakarta day; counted under a **global**
  transaction-scoped advisory lock, `pg_advisory_xact_lock(hashtext(
  'auto_approve'))`, taken before the count, as `kakak_begin` does, so a
  burst of sign-ups can't all read "24"), and queues **"New household · X
  just joined"** to the platform admins (best effort, in its own exception
  block, like 113's push). `request_household_access()` is re-created to do
  the same for old app builds, which map `open` to `none` and show Request
  access; it returns `approved`, which they understand.
- **Over the cap**, `create_household` raises `household_not_approved`
  **without writing anything** (a raise would roll back any row it wrote);
  the screen then calls `request_household_access()`, which commits a
  **pending** request and its push: today's manual path.
- **When it is off** (the default), every function behaves exactly as
  today; the only differences anyone sees are the wording, the 60-second
  check and the **Send on WhatsApp** and **Email them** buttons.

**Safeguards, if the switch is ever turned on:** Google sign-in only (staff
phones are already refused; owner action: switch email sign-in off in
Supabase, roadmap item 5); one household per account (as today); the daily
cap; the switch itself; Kakak's free setup capped separately (section 3);
**Reject** still works on an approved account that hasn't made a household,
and a spam household is deleted by hand (SQL, 127's deletion path).

**Landing page:** "invite-only beta" can stay true with manual approval
(owner question 1).

## 2. "What kind of home?" → a starter template (recommendation 2, D3–D7)

### Where 171 stops and 172 starts

**The hand-off is the moment `create_household` returns.** Everything
before it, and the home-type question right after it, is Phase 171's
sign-up; everything from the template review on is 172's.

| | Owned by | Contract |
| --- | --- | --- |
| Language, name, **Who lives here?** | 171 (and 162) | unchanged; `create_household(p_name, p_has_pets)` |
| The automatic-approval switch inside `create_household` (off by default) | **172** (PR A1) | re-creates `create_household` with the same signature; if 171 PR B re-creates it too, the later PR keeps both changes |
| **What kind of home?** chip screen | **171** draws it | four keys, defined in 172's `src/lib/setup-templates.ts`: `garden` · `multi_floor` · `apartment` · `other`; **Skip** allowed |
| What the answer does | **172** | 171's screen navigates to **`/setup?home=<key>`** (Skip → `/setup` with no key, which opens on the shape row with "house" defaults). 172 stores the key in `household_setup.home_type` (PR 0's table) |
| "Where would you like to start?" | 171 | if 171 keeps it, it comes **after** setup (or is dropped: owner's call in 171's D1/D2). 172 recommends one question at sign-up, the home type, because it is the one that removes typing |
| Who lives here → setup | 172 reads `households.has_pets` (and 171's Elders/Kids switches later) | Pets on → the Pets step and pet routines appear in the review |
| Household → Features | 171 | 172's templates never switch a feature on or off; bills in a template are added only when Bills and upkeep is on (171's default: on) |

**Until 172 PR A2 is built, 171 should not show "What kind of home?"**: a
question that changes nothing is reading for nothing. If 171 PR A merges
first, it ships without that screen and 172 PR A2 turns it on (one line in
171's onboarding: the screen exists behind `SETUP_TEMPLATES_READY`).

### The home types (D3)

Four cards, each with a line icon (Lucide) and one line. The answer only
sets the starting **shape**; every shape can be adjusted with taps on the
next screen.

| Key | EN | ID | Icon | Starting shape |
| --- | --- | --- | --- | --- |
| `garden` | **House with a garden** · "A pool, a carport, one or two floors" | **Rumah dengan taman** · "Ada kolam, carport, satu atau dua lantai" | `Trees` | 2 floors · 4 bedrooms · 3 bathrooms · garden · pool · carport · staff room |
| `multi_floor` | **Big house, several floors** · "Three floors or more, a rooftop" | **Rumah besar bertingkat** · "Tiga lantai atau lebih, ada rooftop" | `Building` | 3 floors + rooftop · 5 bedrooms · 5 bathrooms · garden · carport · staff rooms · laundry room |
| `apartment` | **Apartment** · "One floor, a balcony" | **Apartemen** · "Satu lantai, ada balkon" | `Building2` | 1 floor · 3 bedrooms · 2 bathrooms · balcony · staff room |
| `other` | **Something else** · "Start small, or tell Kakak" | **Lainnya** · "Mulai dari yang sedikit, atau bilang ke Kakak" | `House` | 1 floor · 2 bedrooms · 1 bathroom · nothing outside |

### The review screen: "Your home" (D5)

One scrolling screen, the Phase 164 checklist made bigger:

1. **The shape row**, steppers and chips, all taps: **Floors** − 3 + ·
   **Bedrooms** − 5 + · **Bathrooms** − 5 + · chips **Garden · Pool ·
   Carport · Rooftop · Staff room · Laundry room**. Changing one rebuilds
   the list below instantly (pure function, no network).
2. **Rooms and chores, grouped by floor**, then **Outside**. Each room is a
   row with a checkbox and its chores under it: **title in Indonesian** (what
   staff will read), cadence ("Every day", "Every week · Sat"), and on the
   English side the meaning in grey ("Sweep and mop"). **Everything starts
   ticked.** Unticking a room unticks its chores. Unticking a chore removes
   only it.
3. **Bills and upkeep**: the Phase 164 list with its defaults (bills to
   "me", upkeep to anyone), the same rows and the same "Added" marks.
4. **A footer that stays put**: "18 rooms · 46 chores · 6 bills" and the
   button **Add 70**. Below it, quietly: **Tell Kakak instead** (if Kakak
   setup is available) and **Skip for now**.

Nothing has a required field. Times, rooms and repeats are the template's
sensible defaults; the chore form changes any of them later.

### Assigning staff (D6)

The template review is about *what*; the staff screen right after it is
about *who*, with the fewest taps:

- **Names**: one field per person, **Add another**. (4 typed fields.)
- **One job chip each, optional**: **Cleaning · Kitchen · Laundry · Garden
  · Driver · Pool** (ID: **Bersih-bersih · Dapur · Cuci dan setrika ·
  Kebun · Sopir · Kolam**). Each template chore has a job; chores go to the
  person with that job, and to **Anyone** (Siapa saja) when nobody has it.
  Two people with the same job share it as Anyone-between-them (each chore
  goes to Anyone; the chips are a hint, not a lock).
- **No chip, no problem**: every chore stays **Anyone**, which already
  works (staff take a chore with **Saya kerjakan**).
- **Changing one chore**: back on the review (or later in Chores), each
  chore row shows the assignee as a small chip; tapping it cycles through
  the staff names and Anyone. No dropdown.

So the typical big house costs **4 typed names and 4 taps** to assign 46
chores.

### Where the templates live and how they're localised (D4)

- **Code constants**, `src/lib/setup-templates.ts`, beside
  `bills-upkeep.ts`: the four shapes, the room catalogue, the chore
  catalogue (each chore: key, Indonesian title, English meaning, room kind
  it belongs to, "per room" or "per floor" or "once", cadence, interval,
  weekday or day, category, job). A pure **`buildSetupDraft(shape, locale,
  existing)`** turns a shape into a draft, unit-tested (counts per shape,
  every title within 80 characters, every cadence one the chore engine
  supports, nothing duplicated against `existing`).
- **Why not a table:** the content changes with the app (new chore engine
  features, glossary changes) and needs review like code; a table adds a
  migration, an editor and a cache for something only Poofy Labs edits.
- **Localisation:** owner text (headings, cadences, the English meanings)
  goes through `useT()`. **Chore titles are saved in Indonesian** for every
  household, because staff read them (Phase 164's rule). **Room names are
  saved in Indonesian too** ("Kamar Utama", "Dapur"), since staff see them
  on every chore; English owners see the English meaning beside each room
  in the review, and can rename any room later. Floors are saved as
  households write them ("LT1", "LT2", "LT3", "Rooftop").
- **The draft** is one plain object (`SetupDraft`, versioned:
  `{ v: 1, homeType, floors[], rooms[], chores[], bills[], staff[], pets[],
  routines[] }`), the same shape whether it came from a template, from
  Kakak, or later from a head staff member (section 7).

### Applying it: one call, all or nothing

**`apply_household_setup(p_household uuid, p_draft jsonb)`** (proposed; PR
A2's migration): `security invoker`, so every insert still passes the
existing row-level security for owners; it also checks
`caller_admin_household()` first and refuses otherwise (staff phones pass
`get_user_household_ids()`, AGENTS.md). One transaction: floors, rooms
(with parents), staff profiles, chores (with `location_id`, `assigned_to`,
`recurrence`, `recurrence_interval`, first `due_date` = today or the next
matching weekday), bills and upkeep (Phase 164's columns), pets and pet
routines. Validates counts (at most 8 floors, 60 rooms, 150 chores, 12
staff, 10 pets, 60 routines per call), lengths and enums the same way the
tables do, and returns how many of each it added. `revoke all … from
public, anon;` `grant execute … to authenticated;`. A failure adds nothing,
so a weak connection can't leave half a house; the button retries.

### Not duplicating what a household has (D7)

- **Rooms**: the unique index (household, parent, name) already prevents a
  second "Dapur" on LT1; the function uses `on conflict do nothing` and
  maps chores to the existing room.
- **Chores**: a template chore is skipped when the household already has a
  chore with the same title (case and spaces ignored) in the same room and
  the same repeat. In the review it shows **Added**, with no checkbox, as
  Phase 164 does with `alreadyAdded()`.
- **Bills**: `alreadyAdded()` as today.
- **Existing households** get the same screen as **Starter list** on
  Chores → Today, beside **Bills and upkeep**, with their own rooms and
  chores already marked Added (D7 A). The founding household would see
  almost everything as Added, and nothing changes unless they tick.

## 3. Kakak setup from one voice note, free once (recommendation 3, D8, D9)

### What the owner sees

On the review screen (and as a card on the home-type screen):
**Tell Kakak about your home** · "One voice note, and Kakak makes the list.
Free, once." Tapping it opens a sheet:

- A large **mic** button (the phone's own speech recognition, as in
  `voice.ts`) and the text box under it. **Example in grey:** "Rumah 3
  lantai, 5 kamar tidur, kolam renang dan taman. Staf: Mbak Yanti masak,
  Mbak Sari bersih-bersih, Pak Budi kebun dan kolam, Pak Joko sopir. Dua
  anjing, Coco dan Bruno, dan satu kucing, Mimi."
- **Where voice works:** at sign-up the owner is almost always in the
  browser (Safari or Chrome), not yet in the Home Screen app, so the mic
  button usually works. In an iPhone Home Screen app it can't (Apple's
  limit); the sheet then shows the one line it already uses: "Tap the mic
  on your keyboard and speak." Either way, typing works too.
- **Consent, one line, above the button** (D9): "Kakak sends what you say
  to Anthropic to make your list. Nothing is saved there for long. Privacy."
  The button is **Make my list**. This consents to this one job; it doesn't
  switch Kakak on for the household.
- **While she works** (about 10–20 seconds): "Kakak is making your list…"
  with the template's list dimmed behind, so the wait has a shape.
- **The result is the same review screen**, already filled in, with one
  card on top: **Kakak's list · 18 rooms · 46 chores · 4 staff · 3 pets ·
  6 bills** and **Add all 77**. Anything Kakak guessed (a bedroom count she
  wasn't told) carries the existing **Kakak's guess — check it** mark.
  Untick to skip, as with a template. **Change something** reopens the
  sheet with the text kept, for one more try.
- **If Kakak fails or is off** (no key, the daily cap reached, a refusal,
  a timeout): "Kakak couldn't make the list. Pick from the list below
  instead." The template list is already there; the text is kept. Nothing
  is lost and nothing is required.

### How it works: Kakak describes, code expands

Asking Opus to write out 46 chores one by one is slow, expensive and easy
to get subtly wrong (titles, cadences). Instead, Kakak fills in **the same
shape the template uses, plus what's different**, and
`buildSetupDraft()` expands it into rooms and chores with the catalogue's
own Indonesian titles:

- **One new tool, `propose_home_setup`**, used only by this job:
  `{ home_type, floors, bedrooms, bathrooms, has: [garden, pool, carport,
  rooftop, staff_room, laundry_room, fish_pond, prayer_room],
  extra_rooms: [{ name, floor, inside }], skip: [catalogue keys],
  extra_chores: [{ title_id, room, cadence, weekday, job }], staff: [{
  name, job }], pets: [{ name, kind: dog | cat | other }], bills: [Phase 164
  keys], guessed: [field names] }`. Validated server-side
  (`src/lib/kakak/validate.ts`): known keys only, lengths, at most 20 extra
  rooms and 30 extra chores, staff and pet names as the existing tools check
  names.
- **The catalogue is in her instructions** (cached), so she picks existing
  chore keys rather than inventing titles; `extra_chores` is for what's
  truly particular ("Kasih makan ikan koi", "Siram anggrek").
- **Output is small** (about 1,000–2,500 tokens including her thinking), so
  one call usually does it.

### What changes in Kakak (`src/lib/kakak/*`)

| Today | For setup |
| --- | --- |
| One model for everything: `KAKAK_MODEL` (default Opus), `KAKAK_EFFORT` (`low`) | **Per-job routing**: `KAKAK_MODEL_QUICK` (falls back to `KAKAK_MODEL`; Haiku once the eval passes, recommendation 1) and **`KAKAK_MODEL_SETUP`**, default **`claude-opus-5-5`**, with `KAKAK_EFFORT_SETUP` default `medium`. `cost.ts` already prices all three models |
| `MAX_TOKENS 4000`, `MAX_CALLS_PER_CONVERSATION 8`, `MAX_QUESTIONS 3`, `MAX_TYPED 500` | A **job profile** in `engine.ts`: setup gets `max_tokens 8000`, **2 calls** (the answer, plus one retry on a validation error), **0 questions** (she guesses and marks the guess), **1,500 typed characters** (a long voice note). `checkHistory()` and `nextUserTurn()` take the job, since they enforce the typed limit on every user message today |
| Five tools, one card each | `propose_home_setup` only, for this job; the quick tools aren't offered |
| `/api/kakak` checks `kakak_status` (allowed and enabled, 40 a day) | A sibling route **`/api/kakak/setup`** (same engine, same practice mode, same recording) that calls **`kakak_begin_setup(p_household)`** instead |
| `kakak_config.max_call_cost_micro_usd` = $0.15 for every call | A separate **`setup_max_call_cost_micro_usd`**, default **500,000 ($0.50)**, so one big setup call isn't cut off |
| `kakak_requests.tools` CHECK lists five tools | The CHECK gains `propose_home_setup`; a new **`job`** column (`quick` · `setup`, default `quick`) so S5 counts only quick use |

**The free allowance** (`kakak_begin_setup`, proposed for PR B's
migration): allowed when the caller is an admin of the household
(`household_members`, never `get_user_household_ids()`), the household has
used fewer than **2 setup calls** ever (`kakak_settings.setup_calls`,
a new counter, so one retry is free too), `kakak_config.setup_enabled` is
on, and fewer than **`kakak_config.daily_free_setups`** (default **25**)
setup calls were made today across Miamus (counted under the same global
lock as `kakak_begin`). It **doesn't need**
`kakak_settings.allowed` or `enabled`: that's what "free once, for everyone"
means. It shares the global daily call cap (400). **`kakak_record` and
`kakak_set_result` are re-created** so a request started by
`kakak_begin_setup` (its `job = 'setup'`) is recorded for any admin of the
household whether or not Kakak is allowed or enabled; quick requests keep
126's checks. `security definer`,
`search_path = ''`, `revoke all … from public, anon;` `grant execute … to
authenticated, service_role;`. Paid plans don't exist yet; when they do, the
quick-add allowance moves with them and setup stays free.

**The cost cap.** Expected cost per setup on Opus 5.5: about 6,000 input
tokens (instructions, catalogue and tools cached; the household block is
nearly empty at sign-up) and up to 2,500 output tokens: **about $0.05–0.08**,
under the evaluation's $0.32 ceiling, which this plan keeps as the budget
(two attempts with a cold cache stay under it). The global cap of 25 free
setups a day bounds the worst day at about $8. **The Anthropic monthly
limit is $20** (go-live sheet): that covers about 250 setups, or 60 at the
ceiling; owner question 3.

**Practice mode** (`KAKAK_PRACTICE`, staging and previews only) gets a
scripted setup answer, so the whole flow is testable without a key.

## 4. Staff in one go (D10)

**What the owner does:** on **Your staff**, types the names (and picks a job
chip if they like), then taps **Send one WhatsApp message**. WhatsApp opens
with one message they can send to the staff group, or to each person:

> Halo! Ini Miamus, aplikasi rumah kita. Buka link ini, pilih nama Anda,
> lalu buat PIN: https://miamus.app/join/code#c=K7P-M2Q
> Video 15 detik: https://miamus.app/tips/staf-mulai

**One line of instruction** and a video link. The owner's screen says one
line too: "Send this to your staff. Each person picks their name." plus
**Watch · 15 s**.

**What staff do:** open the link → the house code is already filled in →
**Pilih nama Anda** (big name buttons) → **Buat PIN** (twice) → their Today.
Then the usual first chore, with photos.

**What has to change** (D10 A, PR A2's migration):

- **`house_code_roster(p_code)`** already lists staff with `has_pin`.
- **New: `claim_staff_with_house_code(p_code, p_staff_id, p_new_pin)`**:
  links this phone to the household (`device_sessions`, as the house code
  does today) and sets the PIN, **only** for a staff profile that has no PIN
  yet (`has_pin` false), isn't archived, and was created less than **7
  days** ago (the claim window). Phones are linked to the household, not to
  a person, so "not claimed yet" means "no PIN yet". Once claimed, or after
  the window, the profile signs in with its PIN only (115 as today). This is
  the rule 110 already applies to a linked phone ("staff may claim an empty
  name, never take one"), now reachable from the house code, and narrowed
  to 7 days. Same limits as the
  house code (10 wrong codes a phone session an hour, 200 overall), anonymous
  sessions only, `security definer`, `search_path = ''`, `revoke all … from
  public, anon;` `grant execute … to authenticated;` (anonymous staff phones
  hold `authenticated`).
- **The owner is told** who claimed a name: the claim writes a
  `staff_sign_in_attempts` row with the person (`kind` gains `claim`; kept
  30 days like every attempt), and the owner gets a quiet Today line "{name}'s
  phone is linked" ("Sari's phone is linked") for that day. If it wasn't Sari, the owner's existing
  **let them choose again** (clears the PIN, 110) and **remove the phone**
  (Household → Staff sign-in, 115) put the name back.
- **Prefilled code:** `/join/code#c=K7P-M2Q` fills the code box. It goes in
  the **fragment** (`#`), not a query string, so it never reaches server or
  Vercel request logs; the page reads it on the phone and clears it from the
  address bar. It isn't secret beyond the household's staff (the owner
  already shares it), but it shouldn't sit in logs.
- Per-person invite links keep working for anyone who prefers them.

**Why it's safe enough:** the code reaches only the household's own
WhatsApp; the claim window is short; a profile can be claimed once; the
owner sees every link and can undo it. The alternative with no database
change, one message holding each person's own link (D10 B), has the same
exposure (anyone in the group can tap anyone's link) and more to read.

## 5. Calm first screen (recommendation 6, D11, D12)

**Rules, as code:**

1. **No What's new cards for a new household**: none while the household
   is under **14 days** old (`households.created_at`) **or** the first-run
   checklist isn't past (`isPastFirstRun`), whichever ends later.
2. **Never the backlog**: an entry **published before the household
   existed** is never shown to it (each `WHATS_NEW` entry gets a
   `publishedOn` date). So day 15 doesn't bring 55 cards.
3. **At most one card a week** for any owner: the newest unseen entry only,
   and a per-device "last shown" date. (The stop rule.) Staff tips already
   rest a day between tips; unchanged.
4. **The checklist first, above the fold**: while the first-run checklist
   shows, it sits directly under the date ribbon, above the approval queue
   and quiet lines (which are empty for a new house anyway), and its card
   shrinks to the step names and one button, about 25 words.
5. **Add to Home Screen after setup**: the owner's tip (`push-prompt.tsx`)
   waits until the checklist's "first task" step is done; its pet tip goes.
   The staff banner shows from the first sign-in, as one line.
6. **`PetsQuestionCard`** never shows to a household made after 162 (they
   answered at sign-up); unchanged for older ones.
7. **Every instruction block becomes one line plus an optional video
   tip.** Today's blocks and their replacements:

| Where | Today | After (EN / ID) | Video tip |
| --- | --- | --- | --- |
| Owner: Add to Home Screen | ~55 words, with a pet tip | "Add Miamus to your Home Screen for notifications." / "Tambahkan Miamus ke Layar Utama agar dapat notifikasi." | Add to Home Screen (iPhone · Android) |
| Owner: first-run checklist | ~60 words | step names only | — |
| Owner: Household → Staff | three numbered instructions, ~70 words | "Add your staff, then send one WhatsApp message." / "Tambah staf, lalu kirim satu pesan WhatsApp." | Linking staff phones |
| Owner: Invite page | two paragraphs, ~70 words | "Send this link to family. It works for 7 days." / "Kirim link ini ke keluarga. Berlaku 7 hari." | — |
| Owner: Kakak sheet | the tip paragraph | "Say what you want added." / "Ucapkan yang ingin ditambahkan." | Talking to Kakak (keyboard mic) |
| Staff: Add to Home Screen banner | ~40 words | "Tambahkan Miamus ke Layar Utama." | Tambahkan ke Layar Utama |
| Staff: first chore | — | (no text added) | Menyelesaikan tugas dengan foto |
| Staff: house-code screen | short | "Pilih nama Anda, lalu buat PIN." | Masuk dengan kode rumah |

**The video tip component** `<VideoTip id="…" />`: a small outline button
(`rounded-lg`, Lucide `PlayCircle`) reading **Watch · 15 s** / **Tonton ·
15 detik**. Tapping opens a bottom sheet with the video (`playsinline`,
`muted` autoplay, `preload="none"` until tapped, a poster frame, captions).
Owners get their language; staff screens always Indonesian. A tip is never
required and never pops up by itself.

### How the videos are made and hosted (D12)

- **Made from the mock app**, not real households: Miamus's mock mode (no
  Supabase, local only) at 390 × 844, driven by **Playwright scripts that
  record video** (`e2e/tips/*.spec.ts`, run by hand, not in CI). A script
  per tip, 10–15 seconds, so a tip is re-recorded in a minute when a screen
  changes.
- **Captioned, no faces, no voice**: one short caption at a time, burned in
  with `ffmpeg` (a WebVTT file too, for screen readers). EN and ID owner
  versions; staff versions in Indonesian only. About **8 owner videos (4 ×
  2 languages) and 4 staff videos**.
- **Small**: H.264, 720 × 1560, about 1 MB each, about 12 MB in all.
- **Hosted with the app** in `public/tips/` (served by Vercel, which already
  serves Miamus; versioned with the screens they show; previews and staging
  get them automatically). The service worker doesn't pre-cache them.
  The public page `/tips/<id>` plays one tip for the WhatsApp link.
- **Privacy: no change.** The videos hold no user data (mock data only) and
  no new service or tracker is involved. Not YouTube (cookies, ads,
  another processor).

## 6. Measure (recommendation 7, D13, D14)

**Counts only, never content.** Most of S1–S5 can be **derived from what
Miamus already stores**, so the "before" numbers exist the day this ships,
including for the founding household:

| Signal | Derived from (no new data) |
| --- | --- |
| Sign-up time | `household_access_requests.requested_at` (or the account's creation) → `households.created_at` |
| First staff finish (S1) | the first `household_tasks.completed_at` by a staff profile, or the first `task_logs` row by staff, after `households.created_at` |
| Tasks closed per day; closed without chasing (S3) | due chores and routines per day vs. finished or marked couldn't-do by staff (139) |
| Weekly active households (S4) | households with ≥ 3 staff-finished tasks per active staff member in week 4 |
| Kakak repeat use (S5) | `kakak_requests` with `job = 'quick'`, owners with 3+ in their third week |

**The one thing that can't be derived is the setup itself** (how long it
took, how much was typed, which path). For that, one row per household:

**Table `household_setup`** (PR 0, migration 145):

| Column | |
| --- | --- |
| `household_id` | primary key → `households(id) on delete cascade` |
| `home_type` | `text`, check in (`garden`, `multi_floor`, `apartment`, `other`), nullable |
| `path` | `text`, check in (`template`, `kakak`, `manual`, `mixed`), nullable |
| `run_by` | `text not null default 'owner'`, check in (`owner`, `staff`, `concierge`) (section 7's hook) |
| `started_at`, `finished_at` | `timestamptz`; started = the first setup screen, finished = **Add all** / the last step or **Skip** |
| `active_seconds` | `int`, ≥ 0: time with the setup screens in front, measured on the phone |
| `typed_fields` | `int`, ≥ 0: text fields the owner submitted with something in them during setup (name, staff names, pet names, any edit) |
| `voice_notes` | `int`, ≥ 0 |
| `unticked` | `int`, ≥ 0: template or Kakak items unticked |
| `rooms_added`, `chores_added`, `routines_added`, `bills_added`, `staff_added`, `pets_added` | `int`, ≥ 0, from `apply_household_setup`'s return |

RLS on, no client grants. Written only by **`record_household_setup(p_household
uuid, p_fields jsonb)`**: `security definer`, `search_path = ''`, refuses
unless `household_members` has the caller for that household, accepts only
the column names above with integer or enum values, clamps numbers (0 to
100,000), upserts. `revoke all … from public, anon;` `grant execute … to
authenticated;`. In PR 0 nothing writes it yet (the setup screens come in
PR A2); it exists so the privacy line and the read side ship once.

**Typed fields after setup** (the owner's first 14 days) are estimated from
data: rows owners created by hand in those days (chores, rooms, staff, pets,
routines), minus what setup added. No per-field tracking anywhere else.

**Reading the numbers (D14):**

- **`platform_north_star(p_weeks int default 8)`**: `security definer`,
  `is_platform_admin()` only, returns per sign-up week: households, median
  minutes to first staff finish, median setup minutes and typed fields,
  share on each path, S3, S4, S5. **No names, emails or household ids**;
  for fewer than 3 households in a week it still shows counts (the operator
  already sees names on the approvals page). `revoke all … from public,
  anon;` `grant execute … to authenticated;`.
- **A small admin-only page**, `/dashboard/north-star`, linked from the
  approvals page: five numbers with their targets (S1–S5) and a per-week
  table. Platform admins only (it calls the function; everyone else gets the
  usual "not found").
- **The evening and Sunday reviews** read the same function (read-only SQL)
  and add the numbers to the report artifact.

**Retention:** `household_setup` is one row of numbers kept while the
household exists and deleted with it. The derived numbers read data that
already has its own retention. Nothing new about staff.

**Privacy policy (same PR as migration 145, both languages, `policyVersion`
bumped, `effectiveDate` updated):** a new line in section 3 under "Everyone":

- EN: "**Usage counts.** How long setting up your household took, how many
  things were added, how many fields were typed, and when tasks are first
  finished. Numbers only, never what you typed or said. We use them to make
  Miamus easier to start, and keep them while your household exists."
- ID: "**Hitungan pemakaian.** Berapa lama rumah Anda disiapkan, berapa
  banyak yang ditambahkan, berapa kolom yang diketik, dan kapan tugas
  pertama selesai. Hanya angka, tidak pernah isi yang Anda ketik atau
  ucapkan. Kami memakainya agar Miamus lebih mudah dimulai, dan
  menyimpannya selama rumah Anda ada."

## 7. Delegated setup (recommendation 8, later, D15)

**Later phase, hooks now.** The target owner delegates everything else;
setup should be no different.

- **Head staff or a family assistant runs setup, in Indonesian.** From
  Household → Staff, the owner taps **Ask {name} to set up the house**. On
  that staff phone, a **Siapkan rumah** screen shows the same review
  (`SetupReview` with `locale="id"`), the same home types, the same Kakak
  voice note (free once, counted against the same household allowance).
  The staff member's **Kirim ke pemilik** saves the draft as a proposal; the
  owner sees it in **Waiting for you** (`ApprovalQueue`, which already
  holds staff proposals) as **"Sari prepared the house: 18 rooms, 46
  chores. Review"**, and **Add all** applies it.
- **Concierge setup on the paid plan.** The owner sends a 2-minute video
  walk-through or a voice note to support; Poofy Labs builds the draft with
  an operator tool (the same Kakak setup, more calls allowed) and sends it
  to the household as a proposal. `household_setup.run_by = 'concierge'`.

**Hooks built in this phase**, so the later phase is small:

1. **`SetupDraft` is plain, versioned JSON**, not UI state: storable as a
   proposal and appliable later.
2. **`apply_household_setup` takes a draft**, not screen state; the later
   phase adds a `setup_proposals` table and an owner-only "apply this
   proposal" wrapper (staff phones can propose, never apply).
3. **`SetupReview` takes a `locale` prop** and has no owner-only
   assumptions in its rendering.
4. **`household_setup.run_by`** exists from PR 0.

## How it fits the five tabs and the stop rules

- **Five tabs, unchanged.** Setup lives at `/setup`, a full-screen flow
  before the dashboard, like `/onboarding`. Afterwards the **Starter list**
  is a quiet button on Chores → Today beside **Bills and upkeep**, and
  setup can be reopened from the first-run checklist's "Give them a first
  task" step until it's done.
- **`<SegmentedControl />`**: no new pills. The shape row uses steppers and
  chips, not navigation.
- **No new required field.** Only the household's name is required, as
  today; every setup step has **Skip**.
- **No new reading for staff.** Staff get a one-line message and a video
  tip; the claim screen has one line.
- **What's new**: this phase adds **one** owner entry for existing
  households ("Starter list on Chores", shown once, not to new
  households) and none for staff.
- **No emoji or symbol characters**: Lucide icons only (`Trees`,
  `Building`, `Building2`, `House`, `Mic`, `PlayCircle`, `Users`,
  `MessageCircle`, `Check`, `Minus`, `Plus`). WhatsApp text is plain.
- **Language**: owner text EN/ID via `useT()`; staff screens and every
  saved chore title Indonesian.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Request screen, one line | Miamus approves each new household. Ask once; we'll let you know. | Miamus menyetujui setiap rumah baru. Cukup minta sekali; kami akan memberi tahu Anda. |
| Request screen, under the button (as today) | Your request shares your Google name and email with Poofy Labs, who runs Miamus. Privacy | Permintaan ini membagikan nama dan email Google Anda kepada Poofy Labs, pengelola Miamus. Privasi |
| Request sent | We'll let you know by WhatsApp or email as soon as you're approved. | Kami akan memberi tahu Anda lewat WhatsApp atau email begitu permintaan Anda disetujui. |
| Approvals page buttons | Send on WhatsApp · Email them | Kirim lewat WhatsApp · Kirim email |
| Message text, approved (WhatsApp and email) | You're in. Open https://miamus.app to set up your household. | Anda sudah bisa masuk. Buka https://miamus.app untuk menyiapkan rumah Anda. |
| Message text, still pending | We've got your request and will let you know soon. | Permintaan Anda sudah kami terima. Kami akan segera memberi tahu Anda. |
| Home type heading | What kind of home? | Seperti apa rumah Anda? |
| Home type line | We'll start you with the usual rooms and chores. You change anything next. | Kami siapkan ruangan dan tugas yang biasa. Semua bisa diubah setelah ini. |
| Review heading | Your home | Rumah Anda |
| Review line | Untick what you don't have. | Hapus centang yang tidak ada. |
| Shape row | Floors · Bedrooms · Bathrooms · Garden · Pool · Carport · Rooftop · Staff room · Laundry room | Lantai · Kamar tidur · Kamar mandi · Taman · Kolam · Carport · Rooftop · Kamar staf · Ruang cuci |
| Cadences | Every day · Every week · Sat · Every 2 weeks · Every month | Setiap hari · Setiap minggu · Sab · Setiap 2 minggu · Setiap bulan |
| Footer | 18 rooms · 46 chores · 6 bills · Add 70 | 18 ruangan · 46 tugas · 6 tagihan · Tambah 70 |
| Links | Tell Kakak instead · Skip for now | Bilang ke Kakak saja · Lewati dulu |
| Added row | Added | Sudah ditambahkan |
| Staff heading | Your staff | Staf Anda |
| Staff line | Add their names. A job is optional: we'll give them the right chores. | Tulis nama mereka. Tugas utama boleh dipilih: kami bagikan tugas yang sesuai. |
| Job chips | Cleaning · Kitchen · Laundry · Garden · Driver · Pool | Bersih-bersih · Dapur · Cuci dan setrika · Kebun · Sopir · Kolam |
| Staff button | Send one WhatsApp message | Kirim satu pesan WhatsApp |
| Staff hint | Send this to your staff. Each person picks their name. | Kirim ke staf Anda. Masing-masing memilih namanya. |
| Video tip button | Watch · 15 s | Tonton · 15 detik |
| Pets heading | Your pets | Hewan Anda |
| Pets kinds | Dog · Cat · Other | Anjing · Kucing · Lainnya |
| Kakak card | Tell Kakak about your home · One voice note, and Kakak makes the list. Free, once. | Ceritakan rumah Anda ke Kakak · Satu pesan suara, Kakak buatkan daftarnya. Gratis, sekali. |
| Kakak consent | Kakak sends what you say to Anthropic to make your list. Nothing is saved there for long. Privacy | Kakak mengirim yang Anda ucapkan ke Anthropic untuk membuat daftar. Tidak disimpan lama di sana. Privasi |
| Kakak keyboard tip | Tap the mic on your keyboard and speak. | Ketuk mic di keyboard, lalu bicara. |
| Kakak button / wait | Make my list · Kakak is making your list… | Buatkan daftar · Kakak sedang membuat daftar… |
| Kakak result | Kakak's list · 18 rooms · 46 chores · 4 staff · 3 pets · 6 bills · Add all 77 · Change something | Daftar dari Kakak · 18 ruangan · 46 tugas · 4 staf · 3 hewan · 6 tagihan · Tambah semua 77 · Ubah sesuatu |
| Kakak failed | Kakak couldn't make the list. Pick from the list below instead. | Kakak belum bisa membuat daftar. Pilih dari daftar di bawah saja. |
| Today line, first day | Sari's phone is linked | HP Sari sudah terhubung |
| Chores button (existing households) | Starter list | Daftar awal |
| Push to platform admins (only with the switch on) | New household · {name} just joined | Rumah baru · {name} baru bergabung |

**Staff text (Indonesian only):** the WhatsApp message above; claim screen
"Pilih nama Anda, lalu buat PIN."; buttons **Buat PIN**, **Ulangi PIN**;
video tip **Tonton · 15 detik**.

Wording follows `docs/indonesian-glossary.md`: **Anda**; **HP**;
**staf** (never "pembantu" or "ART"); **Siapa saja** for Anyone; **Ruangan**
for rooms; **Lantai** for floors; **Kakak's guess — check it** stays
**Tebakan Kakak — cek lagi**; "Kamar staf", not "Kamar ART" or "Kamar
pembantu".

## Glossary rows to add (before any Indonesian text, when built)

| English | Bahasa Indonesia |
| --- | --- |
| What kind of home? | **Seperti apa rumah Anda?** |
| House with a garden · Big house, several floors · Apartment · Something else | **Rumah dengan taman · Rumah besar bertingkat · Apartemen · Lainnya** |
| Your home (setup review) | **Rumah Anda** |
| Starter list | **Daftar awal** |
| Staff room · Laundry room · Rooftop · Carport | **Kamar staf · Ruang cuci · Rooftop · Carport** |
| Job chips: Cleaning · Kitchen · Laundry · Garden · Driver · Pool | **Bersih-bersih · Dapur · Cuci dan setrika · Kebun · Sopir · Kolam** |
| Anyone (assignee) | **Siapa saja** (already used by Phase 164) |
| Add all (N) | **Tambah semua (N)** |
| Watch · 15 s (video tip) | **Tonton · 15 detik** |
| Pick your name · Make a PIN | **Pilih nama Anda · Buat PIN** |
| Usage counts (privacy) | **Hitungan pemakaian** |

## The database: proposals only

Additive. Re-check `supabase/migrations` and open PRs before building.
Nothing below is created in this PR.

### Migration numbers

- **145 is Phase 172's**, for **PR 0 (measurement)** (manager, 10 November:
  172 builds first). **Phase 171's PR A (PR #78) takes 146.** 141 (staff
  push), 142 (staff pay), 143 (closet) and 144 (kitchen) stay reserved.
- PR A1, PR A2 and PR B each take their **own number when built**, reserved
  by the manager then. A1 builds before 171 PR A but needs a number other
  than 146, which stays held for 171.

### PR 0 (migration 145): measurement

- `household_setup` and `record_household_setup()` as in section 6.
- `platform_north_star(p_weeks)` as in section 6.
- `kakak_requests.job` (`text not null default 'quick'`, check in
  `quick`, `setup`): added here so S5 can be read correctly from day one.
- Tests (`supabase/tests/145_household_setup.sql`, rolled back): an owner
  records their own household; a staff phone, another household's owner and
  `anon` are refused; unknown keys and negative numbers refused; the
  function reads nothing for a non-platform-admin; it returns no names or
  ids; grants (`anon` executes none).

### PR A1 (its own number when built; not 146, which is 171's): the approval switch, off

- `signup_config` (one row: `auto_approve boolean not null default false`,
  `daily_auto_cap int not null default 25 check (>= 0)`), RLS on, no client
  grants (as `kakak_config`).
- `household_access_requests.auto boolean not null default false`.
- `my_household_access()` re-created: returns `open` when there's no row,
  the switch is on and today's automatic count is under the cap.
- `create_household(text, boolean)` re-created as in section 1, same
  signature, same revoke/grant (`revoke all … from public, anon;` `grant
  execute … to authenticated, service_role;`).
- `request_household_access()` re-created: approves automatically under the
  same switch, cap and lock (for old builds); otherwise files pending and
  pushes as today. Same revoke/grant.
- `list_household_access_requests()` re-created to also return `auto` and
  the requester's language (`user_preferences.locale`, 114; `en` when
  none), for the ready WhatsApp and email text. Same platform-admin check,
  same revoke/grant.
- Tests: **by default (switch off) every function behaves as today**
  (request → pending → approve → create); with the switch on, open →
  create works and writes an automatic approval, and the 26th account that
  day gets pending and `household_not_approved`; rejected stays refused; second household refused;
  anonymous refused; platform admin unaffected; grants.

### PR A2 (next free): templates, staff in one go

- `apply_household_setup(p_household, p_draft)` as in section 2.
- `claim_staff_with_house_code(p_code, p_staff_id, p_new_pin)` as in
  section 4.
- `staff_profiles` gains nothing: "created less than 7 days ago" reads the
  existing `created_at`; "not claimed" is `has_pin` false.
- `staff_sign_in_attempts.kind` check gains `claim` (a check change,
  additive).
- Tests: a draft applies all or nothing; a staff phone and another
  household's owner are refused; duplicates are skipped (room by unique
  index, chore by title, room and repeat); counts are capped; a claim works
  once, inside the window, for a profile with no PIN; refused
  after 7 days, for an archived profile, a profile with a PIN, or a Google
  account; the code limits still apply; grants.

### PR B (next free): Kakak setup

- `kakak_settings.setup_calls int not null default 0 check (>= 0)`.
- `kakak_config.setup_enabled boolean not null default true`,
  `daily_free_setups int not null default 25`,
  `setup_max_call_cost_micro_usd bigint not null default 500000`.
- `kakak_requests.tools` CHECK gains `propose_home_setup`.
- `kakak_begin_setup(p_household)` as in section 3; `kakak_record` and
  `kakak_set_result` re-created to accept setup requests from households
  where Kakak is off (same signatures, same revoke/grant).
- Tests: free once (two calls) without `allowed`/`enabled`; the third
  refused; the daily free cap; a staff phone refused; the global cap still
  applies; grants.

## Privacy policy and `legal.ts`

| PR | Change |
| --- | --- |
| **PR 0** | **Yes.** New kind of data: usage counts (section 6's line, EN and ID). No new service; Supabase, same region. |
| **PR A1** | **No**, while the switch is off (approval works as the policy describes today). If the owner ever turns automatic approval on, section 7 is updated first: accounts may be approved automatically; the operator still sees each creator's Google name and email; the 30-day deletion of rejected requests is unchanged. |
| **PR A2** | **No.** Templates add ordinary rooms, chores, staff names and pets, which the policy already covers. The claim window changes how a phone links, not what is stored. |
| **PR B** | **Yes, small.** The Kakak section: an owner can use Kakak **once for setup without switching Kakak on**; what's sent to Anthropic is what they say plus the household block, as for any Kakak request; kept by Anthropic up to 30 days, as today. |
| Video tips | **No.** Mock data only, served by Vercel, no tracker. |

`policyVersion` bumped with a dated comment and `effectiveDate` updated in
each PR that changes the text.

## Rollout PRs, in order (D14)

| PR | What | Migration | Size |
| --- | --- | --- | --- |
| **0** | **Measurement first**, so the before numbers exist: `household_setup` (empty until A2), `platform_north_star()`, `/dashboard/north-star` (platform admins), `kakak_requests.job`, the privacy line, the evening review reads it | **145** | Small |
| **A1** | **Approval you hear about + calm first screen**: the one-line Request screen, the waiting screen's "WhatsApp or email" promise and 60-second check, **Send on WhatsApp** then **Email them** after **Approve** (and the requester's language in the list); the automatic-approval switch (`open` access, cap, push) built **off**; What's new rules (14 days, never the backlog, one a week), checklist first, Add to Home Screen after setup, one-line instructions, `<VideoTip>` and the first videos (Playwright recordings in `public/tips/`), the `/tips/<id>` page | own number (not 146) | Small–medium |
| **A2** | **Templates + staff in one go**: `setup-templates.ts` and `buildSetupDraft()`, `/setup` (review, staff, pets), `apply_household_setup`, the house-code claim and prefilled link, the one WhatsApp message, **Starter list** on Chores for existing households, `household_setup` written, 171's home-type screen switched on, the What's new entry for existing households | next free | Medium–large |
| **B** | **Kakak setup**: per-job routing, the job profile, `propose_home_setup`, `/api/kakak/setup`, `kakak_begin_setup`, the free allowance and caps, the voice sheet and the **Add all** card, practice-mode script, the eval cases for setup (10 voice notes, scored on rooms, chores and names), privacy line | next free | Medium |
| **later** | **Delegated setup** (section 7): `setup_proposals`, the staff screen, the owner's review in Waiting for you; concierge on the paid plan | next free | Medium |

**Build order (decided by the manager, 10 November):**

1. **172 PR 0**: measurement, migration **145**.
2. **172 PR A1**: the approval you hear about (manual approval kept, the
   switch built off) and the calm first screen (its own number
   when built).
3. **171 PR A** (PR #78): feature switches and the sign-up screens, migration
   **146**.
4. **172 PR A2**: templates and staff in one go. It needs 164 (built) and 171
   PR A (the home-type screen), so it comes after step 3.
5. **172 PR B**: Kakak setup (its own number when built). It needs A2 (it
   fills the same review) and Kakak's go-live (recommendation 1); it doesn't
   need the eval, since setup uses Opus.

Delegated setup comes later.

Each PR: `tsc`, `next build`, unit tests (`buildSetupDraft` counts and
titles per shape, dedupe against an existing household, the What's new
rules, the claim window, cost estimates), Playwright on the stub (sign up
request access, approve it from the approvals page, pick a home type, untick a room, add two staff with job chips,
Add, see the calm Today with the checklist first; B: practice-mode voice
note → Add all), Codex until clean, migrations local → staging → production
with the owner's OK, merge with the owner's OK.

## Decisions for the owner

**Decided 2026-11-10: the owner chose all recommendations ("Yes, all of
it"), so D1–D15 are all A. Changed 2026-11-11: D1 is manual approval kept**
("make sure I still need to approve new households"); automatic approval
is built as a switch, off by default. **D2 is "tell them by WhatsApp or
email"** (WhatsApp first). Build order: PR 0 (145) → A1 → 171 PR A (146)
→ A2 → B.

- **D1 — The approval wait. Decided 2026-11-11: manual approval kept.**
  The owner approves every new household; the waiting screen promises a
  WhatsApp message or an email and checks again by itself; automatic approval (daily cap 25) is
  built as a switch, **off by default**. The options were: A (recommended
  on 10 Nov, chosen then, changed on 11 Nov): approve automatically, review
  afterwards. B: a code on the landing page that skips the wait. C: keep
  manual approval and only add the email.
- **D2 — Telling people they're in. Decided 2026-11-11: by WhatsApp or
  email.** After **Approve**, **Send on WhatsApp** first (a `wa.me` share
  with a ready message and the miamus.app link; the operator picks the
  chat, since sign-up collects no phone number and none is added), **Email
  them** second (`mailto:`); the waiting screen says "by WhatsApp or email".
  Sent by hand, no new service. Other options were: email only (A on 10 Nov);
  B: an email service (a new processor and a privacy change); C: no message
  (today).
- **D3 — The home types.**
  **A (recommended):** four: House with a garden · Big house, several
  floors · Apartment · Something else. B: three, without Something else
  (Skip covers it). C: no question; one generic list for everyone.
- **D4 — Where templates live.**
  **A (recommended):** code constants with a pure builder and tests. B: a
  database table edited by Poofy Labs.
- **D5 — The review's starting state.**
  **A (recommended):** everything ticked; the owner unticks what doesn't
  apply, with a shape row of steppers and chips on top. B: nothing ticked;
  the owner ticks what applies (more taps for a big house).
- **D6 — Assigning chores to staff.**
  **A (recommended):** an optional job chip per person assigns matching
  chores; everything else is Anyone; a tap on a chore's chip changes it. B:
  a name chip on every chore, no job chips. C: leave everything Anyone.
- **D7 — Existing households.**
  **A (recommended):** the same list as **Starter list** on Chores →
  Today, with what they have marked Added. B: new households only.
- **D8 — Kakak setup.**
  **A (recommended):** free once (two calls) for every household, on Opus
  5.5, Kakak describes the house and code expands it, one **Add all** card;
  25 free setups a day across Miamus. B: the same on Sonnet 5.5. C: only for
  households with Kakak switched on.
- **D9 — Consent for the free setup.**
  **A (recommended):** one line above **Make my list**, for this job only.
  B: the owner must switch Kakak on in Household first (two more screens).
- **D10 — Staff in one go.**
  **A (recommended):** one WhatsApp message with the house link; each
  person picks their name and makes a PIN, within 7 days of being added;
  the owner sees who linked and can unlink. B: one message holding each
  person's own invite link (no database change, more to read). C: as today,
  one send per person.
- **D11 — The calm first screen.**
  **A (recommended):** all seven rules (no What's new for 14 days or until
  set up, never the backlog, one a week, checklist first, Add to Home
  Screen after setup, no pets question for new households, one-line
  instructions). B: only the What's new rules.
- **D12 — Video tips.**
  **A (recommended):** recorded from the mock app with Playwright,
  captions, no faces or voice, about 1 MB each in `public/tips/`. B: the
  same files in a public Supabase Storage bucket (replace without a deploy).
  C: YouTube, unlisted (not recommended: cookies, ads, another processor).
- **D13 — What to count.**
  **A (recommended):** one `household_setup` row per household plus
  numbers derived from existing data; counts only. B: a general event table
  (every screen and tap; more to store and explain). C: nothing.
- **D14 — Order and where the owner sees it.**
  **A (recommended):** measurement first (PR 0), then A1, A2, B; numbers on
  a small admin-only page and in the evening review. B: measurement last,
  numbers only in the evening review.
- **D15 — Delegated setup.**
  **A (recommended):** a later phase; this phase builds the four hooks. B:
  build it now with A2.

## Tutorial

- **New owners: none.** The flow is the tutorial; video tips are there
  when wanted.
- **Existing owners (A2):** one What's new entry, shown once on Chores:
  "New: a starter list of the usual rooms and chores. Tick what's missing."
  / "Baru: daftar awal ruangan dan tugas yang biasa. Centang yang belum
  ada." with **Show me** opening it.
- **Staff: none.** The claim screen has one line and a video tip.

## Questions only the owner can answer

Still open. Until the owner answers, the build uses the defaults: landing
page wording unchanged, a cap of 25, the $20 limit kept, Indonesian room
names with English beside them, captions only.

1. **Landing page wording**: keep "invite-only beta" (still true with
   manual approval), or say "free while in beta; we approve each household"?
2. **The daily cap of 25** automatic sign-ups, if the switch is ever turned
   on: right, or lower until 3–5 target households are live?
3. **Anthropic's monthly limit ($20)**: raise it when free Kakak setup
   ships, or keep it and accept that setup stops for the month if it's
   reached (the template path still works)?
4. **Room names in Indonesian** for every household (staff read them), with
   English shown beside them in the review: acceptable for expatriate
   owners?
5. **Videos**: captions only, no voice. Would you rather record a voice-over
   yourself for the owner versions?

## Not in this phase

- A button to delete a spam household (SQL until it's needed).
- An email service of any kind.
- Kakak editing an existing household from a voice note (setup only).
- Room photos or a video walk-through read by Kakak (concierge later).
- Templates for kids' and elders' routines (171 PR B and C).
- Per-tap analytics, funnels or third-party analytics.

---

## Appendix A: template content (drafts)

Chore titles are what staff read, **in Indonesian**; the English meaning is
shown only to English-speaking owners in the review. Job words match the
Phase 158 job chips (Vakum, Pel, Sapu, Lap debu, Toilet, Seprai, Handuk,
Sampah, Rapikan, Setrika, Kaca, Tanaman), so Rooms → job chips work at
once. Cadences use only what the chore engine supports (daily; weekly on
one weekday; monthly on a day; every 2 weeks, 3 months, 6 months, a year).
"Per floor" chores point at the floor ("Seluruh lantai"). Reviewed against
`docs/indonesian-glossary.md`; re-check with two Indonesian owners and two
staff before building (glossary open question 1).

### A1. Rooms (names saved in Indonesian)

| Room | Kind | In shapes | Notes |
| --- | --- | --- | --- |
| Ruang Tamu | room | all but apartment (apartment: in Ruang Keluarga) | living room |
| Ruang Keluarga | room | all | family room; `multi_floor` adds one upstairs (Ruang Keluarga Atas) |
| Ruang Makan | room | all | dining |
| Dapur | room | all | kitchen |
| Dapur Kotor | room | `garden`, `multi_floor` | the wet kitchen, common in big houses |
| Kamar Utama | room | all | master bedroom, with **Kamar Mandi** inside (Phase 168) |
| Kamar Tidur 2…n | room | per the Bedrooms stepper | owners rename ("Kamar Anak", "Kamar Tamu") |
| Kamar Mandi 2…n | room | per the Bathrooms stepper | the first sits inside Kamar Utama |
| Kamar Staf | room | when **Staff room** is on | with its own **Kamar Mandi Staf** inside |
| Ruang Cuci | room | when **Laundry room** is on | washing and ironing |
| Gudang | room | `garden`, `multi_floor` | store room |
| Mushola | room | off by default; Kakak adds it when said | prayer room |
| Balkon | room | `apartment`; `multi_floor` upstairs | |
| Rooftop | floor + room | when **Rooftop** is on | drying area |
| Teras | room, Outside | all houses | |
| Carport | room, Outside | when **Carport** is on | |
| Taman | room, Outside | when **Garden** is on | |
| Kolam Renang | room, Outside | when **Pool** is on | |
| Kolam Ikan | room, Outside | off by default; Kakak adds it when said | fish pond |

Floors: **LT1**, **LT2**, **LT3**… per the Floors stepper; bedrooms go
upstairs first, the kitchen, family and living rooms on LT1. Outside rooms
have no floor.

### A2. Chores

| Title (staff read) | Meaning (EN owners) | Where | Cadence | Category | Job |
| --- | --- | --- | --- | --- | --- |
| Sapu dan pel lantai | Sweep and mop the floor | per floor | Every day | cleaning | Cleaning |
| Lap debu meja dan rak | Dust tables and shelves | per floor | Every week · Mon | cleaning | Cleaning |
| Vakum sofa dan karpet | Vacuum the sofa and rugs | Ruang Keluarga | Every week · Wed | cleaning | Cleaning |
| Lap kaca jendela | Clean the windows | per floor | Every week · Fri | cleaning | Cleaning |
| Rapikan kamar dan tempat tidur | Tidy the room and make the bed | per bedroom | Every day | cleaning | Cleaning |
| Ganti seprai dan sarung bantal | Change the sheets and pillowcases | per bedroom | Every week · Sat | cleaning | Laundry |
| Ganti handuk | Change the towels | per bathroom | Every week · Wed | cleaning | Laundry |
| Sikat kamar mandi dan toilet | Scrub the bathroom and toilet | per bathroom | Every week · Tue | cleaning | Cleaning |
| Kuras bak mandi | Drain and scrub the bath tub (bak) | per bathroom, houses only | Every week · Thu | cleaning | Cleaning |
| Buang sampah | Take out the trash | once (whole house) | Every day | cleaning | Cleaning |
| Cuci piring | Wash the dishes | Dapur | Every day | cleaning | Kitchen |
| Bersihkan dapur dan kompor | Clean the kitchen and stove | Dapur | Every day | cleaning | Kitchen |
| Bersihkan kulkas | Clean out the fridge | Dapur | Every month · 1st | cleaning | Kitchen |
| Bersihkan dapur kotor | Clean the wet kitchen | Dapur Kotor | Every day | cleaning | Kitchen |
| Cuci dan jemur baju | Wash and hang the laundry | Ruang Cuci (or the house) | Every day | cleaning | Laundry |
| Setrika dan lipat baju | Iron and fold clothes | Ruang Cuci (or the house) | Every day | cleaning | Laundry |
| Rapikan gudang | Tidy the store room | Gudang | Every month · 15th | cleaning | Cleaning |
| Bersihkan kamar staf | Clean the staff room | Kamar Staf | Every week · Sun | cleaning | Cleaning |
| Sapu teras dan halaman | Sweep the terrace and yard | Teras | Every day | cleaning | Garden |
| Siram tanaman | Water the plants | Taman (or Balkon) | Every day | cleaning | Garden |
| Potong rumput | Mow the lawn | Taman | Every 2 weeks · Sat | maintenance | Garden |
| Pangkas tanaman | Trim the plants | Taman | Every month · 1st | maintenance | Garden |
| Jaring daun dan sikat kolam | Skim leaves and brush the pool | Kolam Renang | Every week · Mon | cleaning | Pool |
| Cek kaporit kolam | Check the pool chlorine | Kolam Renang | Every week · Thu | maintenance | Pool |
| Kuras kolam ikan | Drain and clean the fish pond | Kolam Ikan | Every month · 1st | cleaning | Garden |
| Cuci mobil | Wash the car | Carport | Every week · Sat | cleaning | Driver |
| Bersihkan carport | Clean the carport | Carport | Every week · Sun | cleaning | Driver |
| Bersihkan talang air | Clear the gutters | once (Outside) | Every 6 months | maintenance | Garden |
| Lap kipas angin | Wipe the fans | once (whole house) | Every month · 15th | cleaning | Cleaning |

**Upkeep and bills** come from Phase 164's `QUICK_ITEMS`, unchanged:
electricity (postpaid for houses, token for apartments, both editable),
water (PDAM), internet, iuran RT/RW (houses), BPJS, PBB (houses), vehicle
tax (when Carport is on), AC service, toren (houses), pest control; gas and
drinking water to Stok di rumah. **One addition** for apartments: **Iuran
pengelola (IPL)** / **Service charge (IPL)**, monthly on the 10th, to "me",
3 days before (a new `QUICK_ITEMS` row in PR A2; glossary row then).

**Counts for the `multi_floor` default** (3 floors + rooftop, 5 bedrooms, 5
bathrooms, garden, carport, staff room, laundry room): **25 rooms**
(counting the bathrooms inside Kamar Utama and Kamar Staf, the rooftop and
the three outside) and **52 chores** (3 floors × 3 per-floor chores = 9; 5
bedrooms × 2 = 10; 5 bathrooms × 3 = 15; plus 18 others), and 9 bills and
upkeep. Unticking a few things (the bak, two bedrooms, the upstairs family
room, the store room) leaves about 20 rooms and 42 chores: the evaluation's
"big house" (15+ rooms, 40+ chores). The mockup shows a review with 18 rooms
and 46 chores.

### A3. Pet routines (only when Pets was picked)

Saved as ordinary pet routines (`master_schedules`, module `pet`), one set
per pet by kind. Titles as the founding household and the staff screens
already say them.

| Kind | Routines (time) |
| --- | --- |
| Dog | Makan pagi (07.00) · Makan malam (17.00) · Jalan pagi (06.30) · Jalan sore (16.30) · Pipis & Pup (07.00, 12.00, 18.00, 21.00) |
| Cat | Makan pagi (07.00) · Makan malam (17.00) · Bersihkan pasir kucing (08.00) |
| Other | Makan (08.00) |

Times are suggestions, editable in the review (a tap opens the time
picker) and later.

## Appendix B: Kakak setup prompt outline (for PR B)

- Role: "You turn an owner's description of their home into a setup for
  Miamus. You never ask questions; when you don't know a number, use the
  home type's default and list it in `guessed`."
- The catalogue (Appendix A's keys and titles), the shapes, the job list,
  Phase 164's keys: cached with the instructions.
- Names exactly as said ("Mbak Yanti", not "Yanti" or "Mbak Yati"); staff
  without a job get none; pets without a kind get `other`.
- Only `propose_home_setup`; one call; Indonesian `title_id` for extra
  chores, 80 characters at most, starting with the verb.
- Eval cases (10, Indonesian and English, short and rambling): scored on
  floors, bedroom and bathroom counts, has-flags, staff names and jobs,
  pet names and kinds, no invented rooms, cost and latency.
