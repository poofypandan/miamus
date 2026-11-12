# Phase 175 — Tabs, the one page, and Kakak first

Status: **a plan for the owner to say yes to. Nothing is built.** Written
12 November 2026 from the code on `main` at `49e4e0d`. Design only: this PR
changes this one file.

Mockups (phone size, English and Bahasa Indonesia side by side):
<https://claude.ai/artifact/H6LqUpcWaujYAzPQwyyefd> (private to the owner's account until shared)

The owner asked three things on 12 November:

1. Are the five tabs (Today, Pets, Chores, Kitchen, Household) the best
   grouping and the best names?
2. For Sunday's preview, what is the **one page** that tells a new household
   everything it needs to know?
3. The ideal: owners talk to Kakak, Kakak sets everything up, staff do the
   work, and the owner looks at one page and is told only when needed.

Short answers:

1. **Keep five tabs. Rename two.** Chores becomes **Home / Rumah**.
   Household becomes **Settings / Pengaturan**. Nothing moves to a new URL,
   so every old link still works.
2. **Today is the one page.** It opens with one line ("All on track" or
   "3 waiting for you"), then what needs the owner, then how staff are
   doing, then what's coming. The long list of the day goes below all that.
3. **Most of the loop already exists.** What's missing is small and
   listed honestly in section 6. The biggest gap is not Kakak; it is
   **trust in silence** (section 5c).

---

## 1. The model, in one sentence

> **Today shows whether your home is running and what needs you. Home, Pets
> and Kitchen hold what you set up. You change any of it by telling Kakak,
> or by hand.**

Three kinds of screen, and only three:

| Kind | Tabs | What it answers |
| --- | --- | --- |
| **The day** | Today | Is everything fine? What needs me? What's coming? |
| **The areas** | Home, Pets, Kitchen | What did I set up here, and how do I change it? |
| **The setup** | Settings | Who is in this home, and how does Miamus behave? |

Kakak is not a place. She is the way in to all three, like a person you
ask. That is why she gets no tab (section 2, structure C explains when that
could change).

---

## 2. Tab structures

### What the code says today (checked)

| Tab (EN / ID) | URL key | What's inside |
| --- | --- | --- |
| Today / Hari ini | `agenda` (the default, no key in the URL) | The day, staff progress, the quiet lines, My tasks, the timeline |
| Pets / Hewan | `pets` (hidden when a home has no pets) | Each pet's day, routines, photos |
| Chores / Tugas | `chores` | A pill: Today · Rooms · Repairs. Also Starter list, Bills and upkeep, Add chore |
| Kitchen / Dapur | `inventory` | A pill: Food · Shopping · Menu |
| Household / Rumah | `access` | A list of 17 rows: Family, Staff, Rooms, Features, Leave, Invite, Staff sign-in, Notifications, Language, App lock, Kakak, Activity, Your data, What's new, About, Feedback, Sign out |

Problems, each one checked in the code:

- **"Rumah" means three things in Indonesian.** The Household tab is
  "Rumah". The progress card says "Rumah 6/8" for house chores. The
  Features page heads Repairs and Bills with "Rumah". English has the same
  muddle with Household, House and Home.
- **Chores is really the house.** It holds rooms, repairs and bills, which
  aren't chores.
- **Two screens called Today.** Chores → Today is a second list of the
  same day that the Today tab already shows.
- **Rooms live in two places.** You look at rooms under Chores and edit
  them under Household.
- **Kakak is on Today only** (`src/app/dashboard/page.tsx`), though she can
  already add things that belong to Home, Pets and Kitchen.

One correction to the manager's map: `inventory` is not an old link. It is
the Kitchen tab's live key. The old keys are `household` (opens Chores) and
`staff` (opens Household). All of them keep working in every structure
below, because **no URL key changes; only labels, icons and order do.**

### Structure A — Rename only

| # | EN | ID | Icon (lucide) | Key |
| --- | --- | --- | --- | --- |
| 1 | Today | Hari ini | `CalendarDays` | `agenda` |
| 2 | Pets | Hewan | `PawPrint` | `pets` |
| 3 | Home | Rumah | `House` | `chores` |
| 4 | Kitchen | Dapur | `CookingPot` | `inventory` |
| 5 | Settings | Pengaturan | `Settings` | `access` |

- **Moves:** nothing. Every screen stays where it is.
- **Removes or merges:** nothing.
- **Judged:** fixes the three meanings of "Rumah" and the wrong name on
  Chores. Leaves the two Todays and the two Rooms. Smallest change, about
  three hours of work.

### Structure B — Rename, reorder, and merge the doubles (recommended)

| # | EN | ID | Icon (lucide) | Key |
| --- | --- | --- | --- | --- |
| 1 | Today | Hari ini | `CalendarDays` | `agenda` |
| 2 | Home | Rumah | `House` | `chores` |
| 3 | Pets | Hewan | `PawPrint` | `pets` |
| 4 | Kitchen | Dapur | `CookingPot` | `inventory` |
| 5 | Settings | Pengaturan | `Settings` | `access` |

Home comes second because every home has one; Pets is the only tab a home
can switch off, so with Home second only Kitchen ever changes place.

**Where everything goes (nothing orphaned):**

| Today's place | New place | Change |
| --- | --- | --- |
| Today tab | Today | New order on the page (section 3) |
| Kakak button, Today only | Today, Home, Pets, Kitchen | Shown on every tab where she can act; not on Settings |
| Chores → Today (day list, Add chore, Starter list, Bills and upkeep) | Home → **Chores / Tugas** | Sunday: the pill is renamed. Later: it becomes the list of what you set up, not a second day list (step 2 after Sunday) |
| Chores → Rooms | Home → Rooms | Gains an **Edit rooms / Ubah ruangan** button |
| Chores → Repairs | Home → Repairs | Unchanged |
| Household → Rooms (the editor) | Home → Rooms → Edit rooms | Sunday: a link to the same editor. Later: the editor moves and the Settings row goes |
| Pets tab | Pets | Unchanged |
| Kitchen tab | Kitchen | Unchanged |
| Household → Family, Staff, Leave, Invite, Staff sign-in | Settings, group **People / Orang di rumah** | Unchanged |
| Household → Features | Settings | Unchanged |
| Household → Notifications, Language, App lock, Kakak | Settings | Unchanged (Notifications grows later, section 5b) |
| Household → Activity, Your data, What's new, About, Feedback, Sign out | Settings | Unchanged |
| What's new cards on Today and Chores | The bottom of Today, one a week at most (already the rule), and Settings → What's new | Off the top of the page |
| Staff: Tugas Hari Ini · Dapur · Perbaikan | The same | Unchanged |

- **Removes or merges:** the second Today, the second Rooms, the three
  meanings of "Rumah".
- **Judged:**
  - *North star* ("tell Miamus once… only hear what didn't happen"): Today
    becomes the page that says so in one line.
  - *Five tabs:* still five, four for a home without pets.
  - *Stop rules:* no new module, no new required field, no new reading for
    staff.
  - *A mother's first look:* "Home, Pets, Kitchen" are things in a house.
    "Settings" is the word every phone already uses. "Chores" and
    "Household" both needed explaining.

### Structure C — Kakak in the middle of the bar (later, only on evidence)

| # | EN | ID | Icon |
| --- | --- | --- | --- |
| 1 | Today | Hari ini | `CalendarDays` |
| 2 | Home | Rumah | `House` |
| 3 | **Kakak** (a round button, not a tab) | Kakak | Her mark |
| 4 | Pets | Hewan | `PawPrint` |
| 5 | Kitchen | Dapur | `CookingPot` |

Settings moves behind a gear in the header. In a home without Kakak the
middle button is a plain **Add** (chore, routine, shopping item, food,
report a problem), so the bar never depends on AI.

- **Judged:** it is the purest form of "just tell Kakak". But it moves
  Settings, crowds the header (name, Today button, Overview | Staff, gear),
  and bets the bar on a helper that has had zero real use so far.
- **When to do it:** when signal S5 is met (half the homes that tried
  Kakak use her three or more times in their third week). Not before.

### Recommendation

**Structure B.** Do its names, order and the Kakak button now; do its two
merges after Sunday. Keep C as the next step if Kakak earns it.

**Keep exactly as it is:**

- Today as the first tab and the screen the app opens on.
- The Pets tab and the Kitchen tab, inside and out.
- The staff screens and their header pill.
- Every URL key (`agenda`, `pets`, `chores`, `inventory`, `access`) and the
  two old ones (`household`, `staff`).
- Household → Features, the confirm card, the pill control, the calm
  colours.

**Name checks against the glossary:**

- **Rumah** for Home is free once Household stops using it. It then matches
  the progress card ("Rumah 6/8") and the Features heading, which already
  mean "the house".
- **Pengaturan** is the phone's own word for Settings. Ten letters; it fits
  the bar at the size used today in the mockup at 375px. The bar's code
  allows about 70px a tab on a 360px phone and cuts a longer label with
  "…", so check it on a 360px phone when built.
- The pill **Tugas · Ruangan · Perbaikan** has no clash once the tab is no
  longer "Tugas".
- Glossary rows to change (the glossary is a shared file; the manager owns
  the edit): "Tabs: Today, Household → Hari ini, Rumah" and "Today · Rooms
  (Chores pill)". Rows to add are listed in section 10.

---

## 3. What owners need to see: the one page

Today answers three questions, in this order, and stops:

1. **Does anything need me?** (exceptions)
2. **Is the house on track?** (one line, then each person)
3. **What's coming?** (the next few days)

Everything else is detail and sits below.

### The order on screen

| # | Block | Shows when | Calm state | Its one action |
| --- | --- | --- | --- | --- |
| 0 | Date ribbon | Always | — | Pick a day |
| 1 | **Status line** | On today's date, once the Set up card is gone | "All on track" with a green tick, and under it "31 of 39 done · nothing late" | Tap opens Who did what |
| 2 | **Set up your home** | A new home, until the first task is finished | Gone | The open step's one button (section 4) |
| 3 | **Waiting for you** | Any item below exists | The whole block is absent | Each row has one action |
| 3a | Urgent repair, sick pet, medicine not taken | As reported | — | Open it |
| 3b | Leave and schedule requests (today's approval queue) | Pending | — | Approve / Not approved |
| 3c | Couldn't be done, and late | Staff said "couldn't", or a task is past its time | — | Open the task |
| 3d | Repairs to review; work done to check | Staff reported; a visit finished | — | Open Repairs |
| 3e | Food with no date | Staff answered "don't know" | — | Open the food |
| 3f | Medicine course ending or not started | As today | — | Open the pet |
| 3g | Something is not working (section 5c) | A staff phone silent, notifications off | — | Fix it |
| 4 | **My tasks** | This owner has tasks on this day | Absent | Tick it done |
| 5 | **Today's progress** (the staff card, as built) | The home has staff | Each person reads "All done" or "On leave" | Tap a person for their day |
| 6 | **Coming up** | Any line exists | Absent | Each line opens its place |
| 6a | Someone working in the house now | A repair person is here | — | Open the repair |
| 6b | Bills and upkeep due in 7 days | As today | — | Jump to that day |
| 6c | Today's menu | Kitchen menu on, a plan exists | — | Open Menu |
| 6d | To buy · Food to eat soon | Counts above zero | — | Open Shopping / Food |
| 7 | **The day** | Always | "Nothing scheduled" | Day · Week pill, filters, the full list |
| 8 | One What's new card | At most one a week, never for a new home (already the rule) | Absent | Got it |

Rules that make it calm:

- **One amber block.** Only "Waiting for you" uses amber. Red stays for
  late, sick and expired, as decided in Phase 153.
- **The status line counts only block 3.** "3 waiting for you" is the
  number of rows in block 3. When block 3 is empty the line says "All on
  track", even at 7 in the morning with nothing done yet: on track means
  nothing is late and nothing waits, not that the day is finished.
- **A past or future day** shows no status line and no "Waiting for you";
  it shows that day's progress and list, as now.

### It works without Kakak

Every block reads data the app already has. None needs AI. In a home with
Kakak the status line adds one sentence ("Kakak is watching 12 things");
without her the same count reads "You'll hear if any of 12 things isn't
done". Section 5a says what is counted.

### Two owners

- **Shared rows** (3a to 3g): both owners see them. When one acts, the row
  goes for both, and Activity says who did it.
- **My tasks** (block 4): each owner sees only their own.
- **Later** (section 5b): each owner picks which kinds of alert reach
  them. The page stays the same for both; only the pushes differ.

### What leaves the top of Today

| Leaves | Goes to |
| --- | --- |
| What's new cards (up to four places on Today now) | One at the bottom of Today; all of them in Settings → What's new |
| The Day · Week pill at the very top | The head of "The day" (block 7) |
| All · Pets · Chores filter pills | Stay with the list, in block 7 |
| "Sari's phone is linked" lines | Inside the Set up card while it shows; afterwards Settings → Staff |
| "Any pets at home?" card | Inside the Set up card for a new home |
| The full list of the day as the main thing | Below everything. After Sunday (step 1): folded to "Next up" and "The whole day" |

Nothing is deleted. Everything is still one tap away.

---

## 4. The first page a new household sees

A new owner today passes: sign-up → "What kind of home?" → `/setup` (rooms
and chores from a template, then staff names) → Today with the **Set up
your home** card (`src/components/agenda/first-run-card.tsx`). This plan
keeps that path and makes the card the one page. No parallel flow.

### The five things a new owner must know or do

| # | Know or do | Why it's on the page |
| --- | --- | --- |
| 1 | **How Miamus works**, in three short lines: Tell it once. Staff do it, with a photo. You only hear about what didn't happen. | The whole promise in 17 words |
| 2 | **Set up your home** | Rooms and chores from the starter list, or one sentence to Kakak |
| 3 | **Send your staff the link** | Nothing works until one staff phone is linked. One WhatsApp message |
| 4 | **Turn on notifications** | "Only told when needed" depends on it. On an iPhone it needs Add to Home Screen first, which nobody guesses |
| 5 | **See the first task done** | The moment Miamus proves itself |

### The card

At the top, the three lines of row 1 with three small icons
(`MessageCircle`, `Camera`, `BellOff`). Under it, the steps. Only the next
step is open, with one button, as now.

| Step | Without Kakak | With Kakak |
| --- | --- | --- |
| Set up your home | **Use the starter list** opens `/setup` (ticks, no typing). Already done for anyone who came through sign-up | The same button, and under it **Or tell Kakak** opens her sheet. Sunday: she adds chores, routines, shopping and food one sentence at a time. December (Phase 172 PR B): one voice note sets up the whole home |
| Send your staff the link | **Send one WhatsApp message** (the button from `/setup`, `SendStaffMessageButton`, with its label as it is). Shows "2 of 4 phones linked" | The same |
| Turn on notifications | **Turn on**. On an iPhone not yet on the Home Screen: the 15-second video tip | The same |
| See the first task done | Waits. Says "Waiting for the first photo" | The same |

"Name your home" stays as the first tick, already done, as now. So the
card has five rows.

How this maps onto the card that exists (`src/lib/first-run.ts` has the
steps home, staff, phone, task, done):

- **Set up your home** is today's "staff" and "task" steps shown as one
  row. It is ticked when both are done. While it is open it shows whichever
  is missing, with that step's own button, and the starter-list button.
- **Send your staff the link** is today's "phone" step with the WhatsApp
  button on the card itself, instead of a trip to the Invite page.
- **Turn on notifications** is new. It sits before "See the first task
  done" on purpose: the owner does it while waiting for staff, and the card
  still ends the moment the first task is finished, as now. If
  notifications are still off then, the existing prompt takes over.

**Within S1 and S2.** Typed fields: the home's name (1) and staff names
(usually 2 to 4). With Kakak: one sentence. Under ten either way. Reading:
about 40 words on the card.

**Rules kept from Phase 172:** no What's new for a new home; the checklist
sits directly under the date; Not now hides it for good.

---

## 5. Kakak first, end to end

The loop, as the manager wrote it, with one refinement each:

| Step | What happens | Refinement |
| --- | --- | --- |
| 1. Tell | The owner tells Kakak a problem or something to watch | From any tab, not only Today |
| 2. Clarify | One or two questions with tap answers | Already built (three questions at most) |
| 3. Set up | One card; nothing saved without yes; Undo | Already built for adds. Changes and pauses are the gap |
| 4. Staff do and check | Staff do the work with photo proof | Staff do **not** get a new "confirm Kakak's guess" screen (see "Where I departed") |
| 5. One glance | Today, section 3 | — |
| 6. Told only when needed | The policy in 5b | And told when Miamus itself isn't working (5c) |

### 5a. Watches

The brief asks for a *watch* as a first-class idea: the thing, its proof,
who does it, when it's late, who hears.

**A watch is not a new thing to build. It is what a task already is, plus
one switch.** Checked in the code:

| Part of a watch | Already stored as |
| --- | --- |
| The thing | A chore or a pet routine |
| Its proof | Photo, three photos, or a tick |
| Who does it | The assignee, or Anyone |
| When it's late | Its time; the evening summary's hour |
| Who hears | Pet routines: **Tell us if it's not done** (`alert_owners`, migration 150). Chores: only the evening summary |

So:

- **"Watching 12 things"** counts what is on a schedule **and** tells an
  owner when it slips: routines with the switch on, bills with a reminder,
  open repairs, medicine courses.
- **The one gap:** chores have no "Tell us if it's not done" switch. Step 6
  after Sunday adds it (one column; a migration).
- **No new tab, no new screen, no new word for owners.** The count on
  Today opens a plain list ("What Miamus tells you about"), each row
  opening the chore or routine it is.
- For owners the word is the verb, not a noun: "Kakak is watching…" /
  "Kakak memantau…". No "Pantauan" to learn.

### 5b. Notification policy

| When | What | Who | Today |
| --- | --- | --- | --- |
| **At once**, 06.00–22.30 | Urgent repair (Darurat). Pet reported sick. Medicine not taken. A pet routine with "Tell us if it's not done" missed | Every owner | Built |
| **At once**, 06.00–22.30 | A chore with the same switch missed (step 6). Something not working (5c, step 4) | Every owner, unless they turned that kind off | New |
| **At once, opt-in** | Leave and schedule requests. A repair person arrived; a repair finished | Each owner's own switch | Built |
| **07.00** | Bills and upkeep due. Food to eat soon | The owner the bill belongs to; food to all | Built |
| **Evening summary** (each owner's hour, 19.00 by default) | Not done, couldn't be done, to buy, repairs to check. **Only when something is open** | Each owner | Built |
| **Weekly, Sunday 17.00** | The check-in (5e) | Each owner | New (step 7) |
| **Never** | A task finished. A phone linked. What's new. Anything promotional | — | As now |
| **Quiet hours**, 22.30–06.00 | Everything waits for 06.00, except urgent repair and a sick pet | Owner's choice (question 5) | Part built: routine alerts already stop at 22.30. The setting and the two exceptions are new (step 5) |

- **Per owner.** The evening summary's hour, the staff-requests switch and
  the two repair switches are already per owner
  (`notification_prefs`, migrations 139 and 152). Step 5 after Sunday adds
  kinds (Pets, Home, Kitchen, Repairs, Staff requests) so two owners can
  split the house. Default: both get everything, so nothing is missed.
- **An all-clear day sends nothing.** That is the promise. An owner who
  wants a good-night line can switch on **Tell me when everything is
  done** (off by default).

### 5c. Silence you can trust

A quiet day must mean a finished day, never a broken one. Today, Miamus
cannot tell the difference in three cases. Each becomes a row in "Waiting
for you" and one push:

| Broken thing | Known today? | What's needed |
| --- | --- | --- |
| **The owner's own notifications are off or blocked** | Yes, on that phone | A row on Today until fixed. No migration. Can ship early |
| **A staff member's notifications are off** | Yes (shown in Settings → Staff) | The same row. No migration |
| **A staff phone hasn't opened Miamus today** though that person has tasks and isn't on leave | Roughly. `last_seen_at` is refreshed by a nightly job, so it is a day behind | A light "opened today" mark written when the staff app opens. Migration, and a privacy line |
| **Photos stuck on a staff phone** (no signal) | No. The queue lives on that phone only | The same mark carries "N waiting to send". Same migration |

The calm state is one grey line under the status: **"All 4 staff phones
opened today"**. It is the proof that silence means done.

Fair to staff: never flagged on a day off or on leave, never before 10.00,
never location, never screen time. Only "opened today, yes or no".

### 5d. Temporary changes

| Change | Today | Gap |
| --- | --- | --- |
| Staff on leave | Built: request, approve, cover, tasks return | Kakak can't start it |
| Pet at the vet | Built: "At the vet" pauses that pet's routines | Boarding or travelling with the family isn't covered |
| The family away | Nothing | New: **Away / Sedang pergi**, from–to. Pauses "wait for an owner" chores and the menu, and sends alerts to the owner who stayed |

All three become one sheet with the same three questions: **Who or what ·
From–to · What happens to the work** (give to a person, Anyone, or pause).
On the last evening Today says "Sari is back tomorrow. Her tasks return to
her." Kakak fills the same sheet from a sentence ("Sari pulang kampung
sampai Senin").

### 5e. The weekly check-in

Sunday 17.00, one card on Today and one push:

- **What ran:** "This week 312 of 330 done without chasing (95%)". This is
  signal S3, shown to the owner.
- **What slipped:** the three tasks most often late or not done.
- **One suggestion at most**, with one button: "Pel teras was late 3 of 4
  times. Move it to 10.00?"

Without Kakak it is the same numbers and a rule-based suggestion (late
three times → offer a later time). With Kakak she words it and can act on
a reply. It is built from rows that already exist, mostly the Week view.

### 5f. Staff transparency

- **Staff see what is checked.** A task that tells the owner when it's
  missed shows a small bell on its card, as photo tasks show a camera. An
  icon, not a sentence.
- **Why,** once: a 15-second video tip in Indonesian, "Yang dilihat
  pemilik rumah", reachable from the Lapor sheet. No new text to read.
- **UU PDP.** Staff are data subjects. Before step 4 (the "opened today"
  mark) ships, the privacy policy needs a line in both languages saying
  that owners can see whether a staff phone opened Miamus that day, why,
  and for how long it is kept; `src/config/legal.ts` gets a new version.
  No location, no covert checks, nothing staff can't see for themselves.
- **UU PPRT.** Rest hours are respected: staff pushes already stop at
  22.00, and the "silent phone" check skips days off and leave.

---

## 6. What Kakak needs: the honest gap list

Kakak today has five tools: `create_chore`, `add_to_shopping_list`,
`add_pet_routine`, `add_food`, `ask_question`. She only adds. She is not
live on production yet.

| The owner says | Works on Sunday? | What's needed | Size |
| --- | --- | --- | --- |
| "Have Sari mop the terrace every Monday" | Yes | — | — |
| "Lights off for the dogs at 21.30, tell me if it isn't done" | Yes | — | — |
| "Buy dish soap" · "Tante Rina brought rendang" | Yes | — | — |
| The same, from the Home, Pets or Kitchen tab | No (Today only) | Show her button on those tabs | Small |
| "Tell me if the terrace isn't mopped" (a chore) | No | The chore switch (step 6) and the tool field | Medium |
| "The tap in the guest bathroom is leaking" | No | A `report_problem` tool on the built Repairs | Small |
| "Remind me to pay PBB every year" | Partly (as a chore) | A bill preset on `create_chore` | Small |
| "Sari is away until Monday" · "Coco is at the vet" | No | Tools that change, not add: pause, reassign, with the card and Undo | Medium–large |
| "Move the walk to 5 pm" · "Stop the Monday mop" | No | The same change tools | Medium–large |
| "Did everything get done today?" | No | Read-only answers from Today's own numbers | Medium |
| The weekly check-in in her words | No | Section 5e first, then her wording | Medium |
| "Add Yanti, she cooks" | No | A staff tool. Leave for later: it creates a person | Medium |
| "Plan this week's menu" · a recipe from a photo | No | Kitchen tools; only for homes with the menu on | Medium |
| One voice note sets up the whole home | No | Phase 172 PR B, already planned for December | Medium–large |
| A recorded voice note (audio kept) | No, **and not recommended** | The phone's own dictation already turns speech into text, and Miamus never receives audio. Keeping audio would be a new kind of personal data for no gain the owner would notice |

---

## 7. Staff screens

Reviewed: the header pill (Tugas Hari Ini · Dapur · Perbaikan), the Lapor
button, the task cards, Progres Anda.

**Change nothing for Sunday.** The tab rename is owner-side only. Staff
see tasks, not areas, so "Tugas Hari Ini" is still the right first word.

Later, and only these:

1. The small bell on tasks that tell the owner when missed (5f). With
   step 6.
2. The video tip "Yang dilihat pemilik rumah" in the Lapor sheet. With
   step 4.
3. Nothing else. No new pill, no new sentence.

---

## 8. Mockups

One page, phone frames 375px wide, English beside Bahasa Indonesia:
<https://claude.ai/artifact/H6LqUpcWaujYAzPQwyyefd> (private to the owner's account until shared)

1. The recommended tab bar, with structures A and C beside it for
   comparison.
2. Today on a busy day.
3. Today on an all-clear day.
4. Today for a brand-new household, without Kakak and with her.
5. The Home tab (Chores · Rooms · Repairs).
6. The Settings tab.

Names in the mockups are made up (Sari, Yanti, Budi, Joko; Coco and
Bruno).

---

## 9. The build, cut in two

### The Sunday slice

Rules: no migration, no staff-screen change, every old link works, merged
and Codex-clean before the freeze on **Saturday 14 November, 12:00 WIB**.

| Step | What | Hours | Files | Risk |
| --- | --- | --- | --- | --- |
| **S1** | **Names, icons, order.** Home / Rumah (`House`), Settings / Pengaturan (`Settings`); order Today · Home · Pets · Kitchen · Settings; the pill's first label Today → Chores / Tugas; **Edit rooms** on Home → Rooms, linking to the editor that exists | 3–4 | `src/components/navigation/bottom-tab-bar.tsx`, `src/lib/dashboard-modules.ts` (order only), `src/components/dashboard/tabs/chores-tab.tsx`, `src/components/chores/rooms-view.tsx`, `src/components/dashboard/tabs/staff-tab.tsx` (the back label), `src/components/dashboard/staff-workload-sheet.tsx`, `src/components/auth/sign-out-sheet.tsx`, `src/lib/kakak/household.ts`, `src/lib/kakak/prompt.ts`, tests (`features`, `push-prompt`, `security-headers`, `who-lives-here` specs name the tabs) | Low in code. **Not only names:** see the note below |
| **S2** | **The first page.** The three lines on the Set up card; "staff" and "task" shown as one Set up row with a starter-list button; the phone step sends the WhatsApp message itself; Turn on notifications as a step; the hide toast says "Settings" | 4–5 | `src/components/agenda/first-run-card.tsx`, `src/lib/first-run.ts` and `src/hooks/use-first-run.ts` (the new step), `tests/unit/first-run.test.ts`, the `first-run` and `calm-start` specs | Low to medium. Built on top of PR #102 (open) and #103 (merged), which touch the starter list and `/setup` but not this card. If it runs long, ship **S2a**: the three lines and the WhatsApp button only (2 hours) |
| **S3** | **Today's order.** The status line; "Waiting for you" and "Coming up" as two headed groups made from the lines that exist; What's new cards to the bottom; the Day · Week pill down to the list | 5–6 | `src/components/dashboard/tabs/agenda-tab.tsx`, new `src/components/agenda/today-status.tsx`, new `src/lib/today-status.ts` with unit tests, specs that read Today | Medium. It is the screen everyone opens. If it isn't Codex-clean by Friday night, ship **S3a** only: the status line, nothing moved (2 hours) |
| **S4** | **Kakak on every area tab** (stretch) | 1–2 | `src/app/dashboard/page.tsx`, a check on each tab that her button covers nothing | Low. Only after S1 to S3 are merged |

About 13 to 17 hours. S1, S2 and S3 touch different files and can be built
side by side on Friday. S1 starts after PR #102 merges: that PR also edits
`staff-tab.tsx`, the privacy policy and the glossary. One string overlaps: the Set up card's hide toast
names the Household tab; S2 owns that file, so S2 changes it.

**Note on S1.** The tab names are written into more places than the bar:

- `src/lib/whats-new.ts`: about 40 tutorial lines, across both languages,
  say "Chores → …", "Household → …", "Tugas → …" or "Rumah → …".
- `src/components/legal/privacy-policy.tsx`: four sentences say "Household
  → Your data" / "Rumah → Data Anda". A path, not a change to what is
  stored, so no new policy version is needed; the manager decides.
- `docs/indonesian-glossary.md`: two rows.

All three are shared files that this plan may not edit. **The manager
assigns them inside S1** (about one hour of the estimate). In Indonesian
the replacement order matters: "Rumah →" becomes "Pengaturan →" first,
then "Tugas →" becomes "Rumah →".

**What a family member notices on Sunday:**

- The bar reads Today · Home · Pets · Kitchen · Settings, and each word is
  what it holds.
- The first screen says how Miamus works in three lines and has one button
  to press next.
- Today opens with "All on track" or "2 waiting for you" before anything
  else.
- (If S4 lands) Kakak is there on whichever tab they're on.

**If Friday runs short,** ship in this order: S1, S2a, S3a. The rest of
S2 and S3, and S4, wait.

**What to watch on Sunday** (it decides the order of the steps below):

1. Does a new owner get a staff phone linked without help? If not, the
   first page still isn't one page.
2. Did notifications get turned on, on iPhones especially?
3. Where does the eye go on Today: the status line, or the long list?
   That answers question 3.
4. Do they tell Kakak something a second time, unprompted?

### After Sunday

| # | Step | Files | Migration | Risks | Tests |
| --- | --- | --- | --- | --- | --- |
| 1 | **Fold the day.** "Next up" (three rows) and "The whole day · 46" in place of the full list on Today | `agenda-tab.tsx` | No | A habit change for the one live home; ask first (question 3) | Spec: fold, unfold, a past day still lists fully |
| 2 | **Home → Chores is what you set up,** grouped Every day · Every week · Less often · Bills and upkeep (with next due) · One-off. No date ribbon | `chores-tab.tsx`, `src/hooks/use-set-up-chores.ts` | No | Proof photos of finished chores stay reachable from Today's rows and Who did what; check before removing the day list | Unit: grouping. Spec: edit from the list, bill shows next due |
| 3 | **Rooms in one place.** The editor opens from Home → Rooms; the Settings row goes; `?module=access&page=rooms` still opens it | `rooms-view.tsx`, `rooms-manager.tsx`, `staff-tab.tsx` | No | Old What's new lines point to the old path | Spec: the old link lands on the editor |
| 4 | **Silence you can trust.** Rows for notifications off (owner, staff); the "opened today" mark and "N waiting to send"; the grey calm line | New hook, `agenda-tab.tsx`, staff app start, privacy policy (both languages), `legal.ts` | **Yes** | Worker monitoring: policy first, staff tip, never on days off | SQL test; unit: who is flagged when; spec |
| 5 | **Notification policy.** Kinds per owner, quiet hours, urgent rings anyway, "Tell me when everything is done" | `push-notification-settings.tsx`, `send-push`, prefs functions | **Yes** | Missed alerts if defaults are wrong: default everything on | SQL test per kind; spec for two owners |
| 6 | **Watches.** "Tell us if it's not done" on chores; the count on Today and its list; the bell on staff cards | `chore-editor-dialog.tsx`, `agenda-tab.tsx`, staff card, `send-push` | **Yes** | Alert noise: off by default, as for routines | SQL test; unit: what is counted; spec |
| 7 | **Weekly check-in.** The Sunday card and push; one rule-based suggestion | New card, `week-summary-view.tsx` reuse, `send-push` | **Yes** (a "sent" record) | A wrong suggestion: one button, Undo | Unit: the numbers and the rule |
| 8 | **Away.** One sheet for staff, pet and family; hands work over and back | Leave panel reuse, new sheet, `agenda-tab.tsx` | **Yes** | Work left paused by mistake: Today says so the evening before it ends | SQL test; spec: pause, return |
| 9 | **Kakak's next tools,** in this order: report a problem, bills, change and pause, answers, the weekly check-in in her words | `src/lib/kakak/*` | Per tool | Each tool needs eval cases before it's on | Kakak eval; practice-mode scripts |
| 10 | **Structure C,** only if S5 is met | Bar, header, Settings | No | Section 2 | — |

Phase 172 PR B (whole-home setup by voice, December) stays as planned and
slots in at step 9.

---

## 10. Words to add (English / Bahasa Indonesia)

For the glossary, which the manager edits before any of this is built:

| English | Bahasa Indonesia | Note |
| --- | --- | --- |
| Home (tab) | **Rumah** | Was Household's label |
| Settings (tab) | **Pengaturan** | The phone's own word |
| Chores · Rooms · Repairs (Home pill) | **Tugas · Ruangan · Perbaikan** | Was Today · Rooms · Repairs |
| All on track | **Semua lancar** | The status line. Not "Semua selesai", which means all done |
| N waiting for you | **N menunggu Anda** | Reuses "Menunggu Anda" |
| Nothing late | **Tidak ada yang terlambat** | Under the status line |
| Coming up (heading) | **Segera** | Already the word on Today's line |
| The day / The whole day | **Hari ini** / **Semua hari ini** | The list's heading; step 1 |
| Kakak is watching N things | **Kakak memantau N hal** | Homes with Kakak |
| You'll hear if any of N things isn't done | **Anda dikabari jika ada dari N hal yang belum dikerjakan** | Homes without Kakak; matches "Kabari kami jika belum dikerjakan" |
| Tell it once. Staff do it, with a photo. You only hear about what didn't happen. | **Bilang sekali. Staf mengerjakan, dengan foto. Anda hanya dikabari kalau ada yang belum.** | The Set up card |
| Use the starter list / Or tell Kakak | **Pakai daftar awal** / **Atau bilang ke Kakak** | The Set up card |
| Set up your home (the step) | **Siapkan rumah** | The card's title stays "Siapkan rumah Anda" |
| Send your staff the link | **Kirim link ke staf Anda** | The step. Its button keeps "Kirim satu pesan WhatsApp" |
| N of M phones linked | **N dari M HP terhubung** | Under the button |
| See the first task done | **Lihat tugas pertama selesai** | Was "See it done / Lihat hasilnya" |
| Ready for your staff today | **Siap untuk staf hari ini** | A new home, above the progress rows |
| Phone not linked yet | **HP belum terhubung** | On a person's row |
| Next up | **Berikutnya** | Step 1, the folded day |
| How Miamus works here (Settings group) | **Cara Miamus bekerja di sini** | Features, Notifications, Kakak, Language, App lock |
| Activity and data (Settings group) | **Aktivitas dan data** | Not "Catatan", which already means Notes |
| Edit rooms | **Ubah ruangan** | Home → Rooms |
| People (Settings group) | **Orang di rumah** | Family, Staff, Leave, Invite |
| All N staff phones opened today | **Semua N HP staf dibuka hari ini** | Step 4. "HP", never "ponsel" |
| Away | **Sedang pergi** | Step 8 |
| Weekly check-in | **Kabar mingguan** | Step 7 |

---

## 11. Where I departed from the brief, and why

1. **A watch is not a new object.** The brief asks for it as a first-class
   idea. In the code, a chore or routine already has four of a watch's five
   parts. Building "watches" as their own thing would be a new module and a
   new word, against two stop rules. One switch on chores finishes it.
2. **Staff don't confirm Kakak's guesses on a new screen.** The brief's
   loop has staff confirming what Kakak guessed. That is new reading for
   staff. The owner already confirms every guess on Kakak's card, and staff
   already have "couldn't be done" and "Usulan jadwal" to say when
   something is wrong. Those are enough.
3. **The tab rename is not "names only".** The brief lists tab names as a
   likely low-risk Sunday item. They are, in code. But the names are also
   in about 40 tutorial lines, four privacy-policy sentences and the
   glossary, all shared files. Still worth doing before Sunday, since the
   family forms habits that day; it needs the manager to assign those
   files.
4. **`inventory` is not an old link.** It is Kitchen's live key. No key
   changes in this plan, which is what keeps every old link working.
5. **No recorded voice notes.** The brief leaves the door open. The phone's
   dictation already does the job with no audio reaching Miamus.
6. **An all-clear day stays silent,** and trust comes from the "phones
   opened today" line and the weekly check-in, not from a nightly "all
   done" push. A nightly push would break "only told when needed" for
   everyone to reassure a few; it is an opt-in switch instead.
7. **A third structure (Kakak in the bar) is designed but parked** behind
   signal S5, rather than offered as a choice for now. Kakak has had zero
   real use; the bar shouldn't be built around her until she has.
8. **Notifications are part of the first page.** The brief doesn't list
   it. On an iPhone, pushes don't arrive until Miamus is on the Home
   Screen, and without pushes the whole promise fails quietly.
9. **Folding the day's list is held until after Sunday,** though it is the
   biggest step toward "one glance", because it changes the screen the one
   live household opens every day.

---

## 12. Open questions for the owner

| # | Question | Recommended answer |
| --- | --- | --- |
| 1 | Rename Chores to **Home / Rumah** and Household to **Settings / Pengaturan**? | Yes |
| 2 | Order **Today · Home · Pets · Kitchen · Settings** (Home before Pets)? | Yes. Say no if Pets is the tab your thumb goes to most; the order is one line of code |
| 3 | After Sunday, fold the day's full list on Today into "Next up" and "The whole day"? | Yes, after watching the family use Today on Sunday |
| 4 | On a day when everything is done, should Miamus stay silent? | Yes. An optional "Tell me when everything is done" switch for owners who want it |
| 5 | May an urgent repair or a sick pet ring during quiet hours? | Yes, those two only |
| 6 | Show Kakak's button on Home, Pets and Kitchen as well as Today? | Yes |
| 7 | With two owners, does each get every alert by default? | Yes; each can switch kinds off later (step 5) |
| 8 | May Miamus tell you when a staff phone hasn't opened the app that day? It needs a privacy-policy line and a short video for staff | Yes, with both, and never on a day off |
| 9 | "All on track" / "Semua lancar" as the calm line? | Yes |
| 10 | If Today's new order (S3) isn't clean by Friday night, ship only the status line? | Yes |
