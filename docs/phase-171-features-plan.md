# Phase 171 — Features you switch on, a simple sign-up, and the people Care is for

Status: **plan, waiting for the owner's decisions (D1–D16, each with a
recommended A).** Nothing is built, nothing is applied anywhere. Migration
**145** is reserved for PR A (feature switches, the "Where to start?"
answer, dismissed offers). PR B (people records, Elders in Care, their
routines) takes the next free number when it's built, and the manager
reserves it then. Roadmap: new rows 26–30 in `docs/roadmap-2026-11-09.md`,
and item 18 (Care tab) now points here. Mockup:
`docs/mockups/phase-171-features.html` (open in a browser, phone width;
owner screens English left and Bahasa Indonesia right, staff screens Bahasa
Indonesia only).

Builds on **Phase 162** ("Who lives here?", migration 133, live:
`households.has_pets`, `useHouseholdProfile()`, `OPTIONAL_MODULES` in
`src/lib/dashboard-modules.ts`), the **first-run checklist** (audit batch
B1, PR #62, `src/lib/first-run.ts`), and fits beside the decided **closet**
(Phase 169, PR #75, migration 143) and **kitchen** (Phase 170, PR #76,
migration 144) plans. The kitchen's optional **Nutrition** switch
(calories and protein per recipe and serving) was agreed after PR #76 and
is not yet written into `docs/phase-170-kitchen-plan.md`, which still lists
nutrition under "Not in this phase"; this plan only gives it a row in
Features and an offer, and leaves its design to that addendum.

## The problem

The owner, 10 November: Miamus is growing (pets, chores, rooms, repairs,
bills, the closet, a kitchen with recipes and a menu, and now nutrition;
later full nutrition, health, personal workouts and seniors' exercises).
*"Figure out a way where it doesn't get too overloaded. Some people might
not want this or that, so make sure the questions are simple enough and not
overbearing during sign-up. If we're tracking seniors, we might need to
input their exercises."*

Three things go wrong if nothing changes:

- **Every new feature is on for everyone.** A couple in a flat with one
  helper sees Repairs, Bills, Food, soon the Closet, Menu and Nutrition, all
  empty, all asking to be set up. Empty screens are quiet, but each one is
  another pill, another Today line, another staff button.
- **The obvious fix, a long setup wizard, is worse.** Ten questions before
  anyone has seen the app, about features they can't picture yet.
- **Care has nothing to stand on.** Kids, elders, per-person allergies,
  nutrition goals and health all need *a person* to hang off. Today Miamus
  knows owner accounts (`household_members`, all admins) and staff
  (`staff_profiles`), and nobody else: not the children, not Oma.

## What exists (read 2026-11-10)

- **Sign-up** (`src/app/(auth)/onboarding/page.tsx`): language → request
  access → wait for approval → one form: **Name your household** plus
  **Who lives here?** with one live chip, **Pets**, and **Kids** and
  **Elders** greyed as "Soon" (162 D1 A). It calls
  `create_household(p_name, p_has_pets)` (migration 133, `security
  definer`, revoked from `public, anon`).
- **One switch exists**: `households.has_pets` (null = not answered = on),
  set through `set_household_has_pets` (owners only, refused while a pet
  isn't archived). Read by `useHouseholdProfile()`, cached per device so
  the bar doesn't flash. `OPTIONAL_MODULES = ["pets"]` already lets a middle
  tab drop out; `moduleFromParam()` sends a switched-off tab back to Today.
- **Household tab** (`staff-tab.tsx`): Family · Staff · Rooms · **Who lives
  here** · Leave · Invite someone · Staff sign-in · Notifications ·
  Language · App lock · Kakak · Activity · Your data · What's new · About ·
  Send feedback. "Family" lists owner accounts (every `household_members`
  row is an admin; there's no non-admin family member).
- **Tabs and pills today**: Today (Day · Week) · Pets · Chores (Today ·
  Rooms · Repairs; Bills and upkeep as a checklist on Chores → Today) ·
  Kitchen (Food · Shopping) · Household.
- **First-run checklist** (`src/lib/first-run.ts`): home → staff → their
  phone → a first task → the first finished task; ticks itself from data,
  existing households never see it.
- **What's new** (`src/lib/whats-new.ts`): one entry per feature, shown once
  where it lives, then listed in Household → What's new.
- **The pets routine engine**: `task_entities` (`entity_type in ('pet',
  'room', 'general')`), `master_schedules` (`module in ('pet', 'cleaning',
  'laundry')`, fixed times, intervals, weekly), `task_logs`,
  `medical_records`. App code finds pets through one helper, `isPet()` in
  `src/lib/pets.ts`, plus two Kakak reads (`route.ts`, `context.ts`).
- **`user_preferences`** (migration 114): one row per account (`locale`),
  no client grants; read and written through definer functions.
- **Privacy policy** section 10, "Children": *Miamus isn't designed for
  children.* Section 3 lists what's collected for admins, staff and
  everyone; it has no line for family members who don't sign in.

## The idea in one line

Sign-up asks two short, skippable chip questions and nothing else;
everything optional is a switch in **Household → Features**, off until
wanted and offered once at the moment it's useful; and **people** (family,
not staff) become records that Care routines, allergies and, much later,
health hang off, starting with **elders and their exercises**.

## Five rules that keep Miamus light

| Rule | What it means on screen |
| --- | --- |
| **Two questions, then the app** | After the language: *Who lives here?* (on the name screen, as today) and *Where would you like to start?* (one screen, skippable). No nutrition, closet, health or workout questions at sign-up. |
| **One place for every switch** | **Household → Features**, grouped Home · Kitchen · Care. Each row has one plain line saying what it adds. |
| **Off hides, never deletes** | Turning a feature off hides its pill, its Today lines, its staff buttons and its Kakak tools; reminders for it stop. Its data stays and comes back with the switch. |
| **Offer once, at the moment of need** | "Track calories and protein?" on Recipes; "Is this a closet?" on a room named *Walk-in closet*. One card, **Turn on** or **No thanks**, never shown again to that owner, never blocks. |
| **Staff see only what's on and theirs** | A staff phone shows a feature only when it's switched on *and* has something for that phone. An owner's personal feature never reaches a staff phone. |

## What changes for people

| Who | What's new |
| --- | --- |
| New owners | Sign-up: the name screen's **Who lives here?** gains a real **Elders** chip in PR B and a real **Kids** chip in PR C (greyed "Soon" until then). One more screen after the household is made: **Where would you like to start?** (Chores · Kitchen · Repairs and bills · Care), **Skip** in the corner. It orders the first-run checklist and Today's greeting; it hides nothing. |
| All owners | **Household → Features** replaces **Who lives here**: one list, grouped **Home** (Repairs, Bills and upkeep, Closet), **Kitchen** (Food at home, Menu and recipes, Nutrition), **Care** (Pets, Kids, Elders). |
| All owners | In-context offers, once each: on Recipes (Nutrition), on a room called a closet (Closet), on Today when a staff member reports something broken while Repairs is off. |
| Owners, PR B | **Household → Family** becomes everyone in the family: owners (with their account) and people without one (Oma, the kids), each with a relation and an optional birth year. |
| Owners, PR B | The **Pets** tab becomes **Care** when Kids or Elders is on: **Pets · Kids · Elders** pills, only for who lives here. An elder's page: their routines (*Jalan pagi 15 menit*, *Latihan kaki*), who does each, and a gentle week summary (*Morning walk: 5 of 7 days*). |
| Staff, PR B | An elder's routine on **Tugas Hari Ini**, under the elder's name, ticked with **Selesai**, an optional note, no photo. Only on the phones it's for. |
| Staff, any PR | Nothing new appears because an owner switched on a personal feature. Switching a household feature off removes its staff buttons (for example *Lapor kerusakan* with Repairs off). |

## The screens (mockup)

1. **Sign-up, the name screen**: unchanged except the Elders chip becomes
   real in PR B (the mockup shows it that way: Elders live with the PR B
   privacy line under the chips, Kids still "Soon" until PR C).
2. **Sign-up, "Where would you like to start?"**: four chips, nothing
   pre-selected, **Skip** top right, **Continue** at the bottom. One line:
   "Pick any. It only changes what Today shows first; nothing is hidden."
3. **Household → Features**: a Settings-style list, three groups, a switch
   per row with a one-line description. Off rows read the same as on rows,
   just with the switch off: no "upgrade" look, no badges.
4. **An in-context offer** on Kitchen → Menu → Recipes: a quiet card above
   the list, "Track calories and protein?", **Turn on** · **No thanks**.
5. **Care → Elders → Oma Lina** (owner): her routines with who does them,
   the week summary, **Add routine**.
6. **Staff Tugas Hari Ini** with Oma's morning walk: Indonesian only, the
   elder's name as the group heading, **Selesai** and **Tambah catatan**.

## How it fits the five tabs (D10)

Still five tabs, never six. A tab is hidden only when everything in it is
off (only Care can be: no pets, kids or elders). The map:

| Tab | Pills | Shown when | Feature switch |
| --- | --- | --- | --- |
| **Today** | Day · Week | always | lines from each feature appear only when it's on |
| **Care** (today's Pets) | Pets · Kids · Elders | the tab when any of the three is on; each pill when its switch is on; **no pills** when only one is on, and then the tab keeps that one's name ("Pets"), so households with only pets see no change | Care: Pets (`has_pets`), Kids, Elders |
| **Chores** | Today · Rooms · Repairs | Today and Rooms always; **Repairs** pill when Repairs is on | Home: Repairs |
| | Bills and upkeep (checklist on Chores → Today) | when on | Home: Bills and upkeep |
| | Closet (inside a room's sheet, Phase 169) | the room's Closet switch and the Out now line show only when on | Home: Closet |
| **Kitchen** | Food · Shopping · Menu | **Shopping** always; **Food** when Food at home is on; **Menu** (with Recipes inside) when Menu and recipes is on; one pill left means no pills | Kitchen: Food at home, Menu and recipes |
| | Nutrition (calories and protein on recipes and the menu; the kitchen addendum, not yet written) | only inside Menu, only when on | Kitchen: Nutrition (needs Menu and recipes) |
| **Household** | settings list | always; **Features** row replaces **Who lives here** | — |
| *(later)* **Me** | under the owner's own name, not a tab | only for an owner who switched it on for themself | Health (later, per owner, not in Features) |

Always on, no switch: Today, Chores (Today, Rooms), Shopping, staff, leave,
sign-in, notifications, Kakak's own switch (already in Household). These are
what every household with staff uses; a switch for them would only add a
way to break the app.

## Sign-up: two questions (D1, D2)

After the language (and the access request), nothing changes until the name
screen.

**Screen 1, the name screen (as today).** Name your household, then **Who
lives here?** with **Pets · Kids · Elders**, multi-select, nothing
pre-selected (162 D2: untouched = no). In PR A, Kids and Elders stay greyed
"Soon" (recording that children or elderly people live in a home is
personal data about vulnerable people; it waits for the PR B privacy
update). In PR B the Elders chip becomes real and saves to the Elders
switch; Kids follows in PR C. EN "Elders", ID "Lansia" (glossary). "Elderly parents" was
considered: longer, and it excludes a grandparent or an aunt.

**Screen 2, after "Create household".** The household now exists, so this
screen can't lose anything: **Skip** goes straight to Today.

- Heading: **Where would you like to start?** / **Mau mulai dari mana?**
- Line: "Pick any. It only changes what Today shows first; nothing is
  hidden." / "Pilih satu atau lebih. Ini hanya mengatur yang muncul dulu di
  Hari ini; tidak ada yang disembunyikan."
- Chips (multi-select, none pre-selected): **Chores** (Tugas) · **Kitchen**
  (Dapur) · **Repairs and bills** (Perbaikan dan tagihan) · **Care**, shown
  only if screen 1 picked someone and named for who: **Pets** (Hewan) if only
  pets, **Elders** (Lansia) if only elders, **Care** (Rawat, D-question 4)
  if more than one.
- **Continue** saves the answer (`households.start_with`), **Skip** saves
  nothing.

What the answer does, and nothing more:

- **The first-run checklist's step 4** ("Give them a first task") opens on
  the first picked area: the chore form, a pet routine, the Menu, or the
  Bills and upkeep quick-add. Skipped = the chore form, as today.
- **Today's greeting buttons** for a brand-new household, in the picked
  order (today: Add Pet · Add Chore).
- **Which offer may show first** (below): a household that picked Kitchen
  is offered Menu and recipes on its first visit to Kitchen; one that
  didn't is offered it only after a second visit.
- It never switches anything on or off. Repairs and bills unpicked still
  works; Kitchen unpicked still shows Kitchen.

Why a second screen and not a longer first one (D1): the name screen
already holds a field, a question, a privacy sentence and a button; four
more chips push **Create household** below the fold on a 360 px phone, and
an optional question shouldn't stand between someone and their household.

## Household → Features (D3–D6)

A new row **Features** / **Fitur** (lucide `SlidersHorizontal`) takes the
place of **Who lives here**, and its sheet holds every switch. One list,
three groups:

| Group | Row | One line (EN / ID) | Default, new household (D4) |
| --- | --- | --- | --- |
| **Home** / Rumah | **Repairs** / Perbaikan | Staff report what's broken with a photo; you plan the fix. / Staf melaporkan yang rusak dengan foto; Anda atur perbaikannya. | On |
| | **Bills and upkeep** / Tagihan dan perawatan | Reminders for electricity, water, PBB, AC service and the like. / Pengingat listrik, air, PBB, servis AC dan lainnya. | On |
| | **Closet** / Lemari pakaian | What's at the laundry, the tailor or lent out, with photos. / Pakaian yang di laundry, penjahit atau dipinjam, dengan foto. | Off |
| **Kitchen** / Dapur | **Food at home** / Makanan di rumah | Leftovers and food from others, with where it's kept and when it's best by. / Sisa masakan dan makanan dari orang, di mana disimpan dan sampai kapan. | On |
| | **Menu and recipes** / Menu dan resep | Plan the week's meals; the cook sees today's menu. / Rencanakan menu seminggu; yang memasak melihat menu hari ini. | Off |
| | **Nutrition** / Gizi | Calories and protein on recipes and the menu. / Kalori dan protein di resep dan menu. | Off (needs Menu and recipes) |
| **Care** / Rawat | **Pets** / Hewan | Routines, meals, medicine, vet visits and photos. / Rutinitas, makan, obat, dokter hewan dan foto. | From sign-up |
| | **Kids** / Anak (PR C) | Routines for the children, like school pick-up. / Rutinitas anak, seperti jemput sekolah. | From sign-up |
| | **Elders** / Lansia (PR B) | Daily routines and exercises, ticked by whoever helps. / Rutinitas dan latihan harian, dicentang oleh yang membantu. | From sign-up |

Rows appear only for features that are built. Nothing greyed, no "coming
soon" (the sign-up chips are the one exception, from 162). Closet appears
when Phase 169 ships, Menu and recipes and Nutrition when Phase 170's PRs
ship, Kids with PR C.

**Defaults (D4): on if it stays quiet until used, off if it adds daily work
or asks for personal data.** Repairs, Bills and upkeep and Food at home show
nothing until something is added, and staff already expect *Lapor
kerusakan* and *Makanan masuk*. The Closet adds photos on every trip out;
Menu and recipes adds planning; Nutrition adds numbers; Kids and Elders are
personal data. Those wait to be asked for.

**Existing households (D5): nothing they use today hides on deploy.**
Repairs, Bills and upkeep and Food at home default to on anyway. Pets keeps
162's answer. Any feature built before PR A (the closet, menu) is backfilled
**on** for households that have data in it. Nobody needs to visit Features
after the update.

**Switching off (D6).** The row's switch turns off at once (soft sync, no
reload), with a toast and **Undo**. If there's open work, one line under
the row says what stays: "3 open repairs stay saved. Staff can't report new
ones while this is off." Data is never deleted, reminders and pushes for it
stop, staff buttons go, Kakak loses its tools for it. **Pets keeps 162's
rule** (archive pets first) because its tab disappears; the same rule
applies to Kids and Elders in PR B/C (archive the people first; their
history stays). **Nutrition** needs Menu and recipes: turning Menu off also
hides Nutrition, and Nutrition's row says "Needs Menu and recipes".

## Offers at the moment of need (D7)

One rule set, used by every feature:

- **One card, in place, quiet.** Grey card with a lucide icon, one question,
  one line, **Turn on** (primary) and **No thanks**. No modal, nothing that
  blocks the screen it's on.
- **Once per owner.** **No thanks** hides that offer for that owner for
  good, on every phone (saved on the account). **Turn
  on** switches the feature for the household and hides the offer for every
  owner. Features is always there to change it.
- **One at a time.** At most one offer on screen, and at most one new offer
  per owner per day, across the whole app.
- **Never to staff.** Staff phones never see an offer.
- **Only for features that are off.** And never for Kids or Elders (personal
  data: asked at sign-up and in Features only).

The offers this phase defines:

| Offer | Where | When it shows |
| --- | --- | --- |
| **Plan meals and keep recipes?** (Menu and recipes) | Kitchen → Food or Shopping, below the pills | second visit to Kitchen (first, if *Kitchen* was picked at sign-up) |
| **Track calories and protein?** (Nutrition) | Kitchen → Menu → Recipes, above the list | once the household has 3 recipes |
| **Is this a closet?** (Closet) | Household → Rooms, the room's sheet | a room named like a closet: *closet*, *wardrobe*, *walk-in*, *lemari*, *ruang pakaian* |
| **Want staff to report repairs here?** (Repairs) | Chores → Today | Repairs is off and an owner adds a chore with the Maintenance category twice |
| **Get reminders for bills?** (Bills and upkeep) | Chores → Today | Bills is off and an owner adds a chore named like a bill (*listrik*, *PLN*, *PDAM*, *PBB*, *iuran*) |

No offer for Food at home or Pets (on by default / asked at sign-up).

## People records (D8, PR B)

**Who counts as a person:** everyone in the family who lives in or is
cared for at home, **not staff** (staff stay in `staff_profiles` with their
PIN, pay and leave). That's:

- **Owners**, listed automatically and linked to their account (name from
  their roster row). They can't be removed here; removing an owner stays in
  the existing member management.
- **People without an account**: the kids, Oma and Opa, an adult sibling who
  doesn't use the app. Added by an owner.

Each person has: **name** (as the family says it: *Oma Lina*, *Raka*), a
**relation** (Partner · Child · Parent · Grandparent · Other family /
Pasangan · Anak · Orang tua · Kakek/Nenek · Keluarga lain), an optional
**birth year** (not a date: enough for "about 78", less to hold), a
**Care group** (Elders · Kids · none: which Care pill they appear under;
suggested from the relation, Parent and Grandparent → Elders, Child → Kids,
and changeable, because "Oma" can be an owner's mother), and **archived**
(history kept, gone from lists). The relation is how the owners describe
them; Miamus never derives anything from it except that suggestion.

**Only owners read people records.** Staff phones never read the list of
family members, their relations or birth years. A staff phone learns a
person's name only when that person has a care routine meant for it,
through the routine itself (below), the way it learns a pet's name today.

Where: **Household → Family**, the row that exists. Today it lists owner
accounts and *Invite family*; it becomes the family: owners (with an
"Admin" label, as now) and then everyone else, with **Add family member**.
Inviting someone to sign in stays where it is.

What hangs off a person, now and later:

| When | What | Who sees it |
| --- | --- | --- |
| PR B | Care routines (elders), their ticks and notes | owners; the staff phones each routine is for |
| PR C | Kids' routines | same |
| later (kitchen D12 B) | allergies and diets, shown to the cook | owners; every staff phone with Menu (the cook must see them) |
| later | nutrition goals and intake | owners only (health data, below) |
| later | medicine, conditions, doctor visits, body measures, workouts | that person's owner only, with consent (below) |

**Is an owner also a person record?** Yes (D8 A): one list, and an owner's
allergy or a routine for an owner (a walk with the helper) works the same
as anyone's. But **an owner's private health never hangs off the household
person row**; it hangs off their account, in "Me" (below), where other
owners can't see it.

## Elders' routines and exercises (D9, D11, D12; PR B)

**Model them as Care routines, the way pets' routines work**: a routine
belongs to a person, has a name, days and times, and whoever helps ticks it.

- Examples: *Jalan pagi 15 menit* (every day, 07:00), *Latihan kaki*
  (Mon · Wed · Fri, 16:00), *Minum air putih* (08:00, 12:00, 16:00),
  *Berjemur* (every day, 08:00).
- **Who does it**: a staff member, a family member (owners have roster rows
  since 106), or "anyone" (every staff phone of the household, like today's
  pet routines).
- **Ticking**: **Selesai** (done), optional **note** ("Hanya 10 menit,
  lututnya pegal"), and 165's **Tidak bisa dikerjakan** with care reasons:
  *Tidak mau hari ini* · *Hujan* · *Lainnya*. **No photos** for routines of
  people (D12): a photo of Oma on her walk is not proof anyone needs.
- **The owner's summary**, gentle: on the elder's page, one week at a
  glance: "Morning walk: 5 of 7 days · Leg exercises: 3 of 3". Grey, never
  red, no streaks, no scores (roadmap: no points or streaks). Missed
  routines join 165's evening summary only if the owner has it on.
- **Nothing measured** in this version: no minutes counter, steps, blood
  pressure, weight. A note is free text. (Why: measurements are health data,
  below; and the family's question is "did Oma walk today?", not a chart.)

**Reuse the pets routine engine (D9 A).** Schedules, times, ticks, notes,
couldn't-do, staff Today, the evening summary and Kakak's routine tool
already work for pets. An elder gets one linked `task_entities` row
(`entity_type = 'person'`, `person_id` → the person), and routines are
`master_schedules` rows with `module = 'care'`. The cost, said honestly:
every place that assumes "entity = pet" must check. That's centralised in
`isPet()` plus the two Kakak reads, so it's an audit of a short list, done
in PR B with tests. Medicine for people does **not** reuse
`medical_records` in PR B (it's health data; later, with consent).

## Staff phones (D13)

- **Only what's on and theirs.** A switched-off feature's staff buttons go
  (Repairs off: no *Lapor kerusakan*; Food at home off: no *Makanan masuk*;
  Closet off: no *Pakaian keluar*). An elder's routine shows only on the
  phones it's for (its staff member's phone, or every staff phone when it's
  for anyone).
- **Never the owner's personal features.** Nutrition goals, "Me", health:
  none of it has a staff path, by design and by database policy.
- **Indonesian only**, as always. The elder's routine row: the elder's name
  as the group heading (*Oma Lina*), the routine (*Jalan pagi 15 menit*),
  the time (*07.00*), **Selesai**, **Tambah catatan**.
- **One staff tip** (B1's one-tip-a-day rule) when the first care routine
  reaches a phone: "Baru: rutinitas untuk Oma Lina. Centang Selesai setelah
  dikerjakan; tambahkan catatan kalau perlu."

## Personal workouts and health: later, not in this phase (D14, D15)

Honest about what it would take:

- **It belongs to one person, so it's private by default, even between
  owners.** A husband shouldn't see his wife's weight because they share a
  household. So it doesn't live in the household's data model at all: it
  hangs off the owner's account, in a **"Me"** area opened from their own
  name in Household, **not a sixth tab**, off until that owner switches it
  on for themself. It's not in Household → Features, because Features is
  for the household.
- **Under UU PDP it's health data** (*data kesehatan*, specific personal
  data, Pasal 4(2)): explicit consent of its own, separate from the privacy
  policy acceptance (Pasal 20–22), an impact assessment before processing
  specific data at scale (Pasal 34), owner-only, **never visible to staff**,
  never sent to Kakak unless that owner turns that on separately. Likely its
  own privacy-policy section.
- **A PWA can't read Apple Health (HealthKit) or Android Health Connect.**
  Both are native-only APIs. Reading steps or workouts needs a native
  wrapper app (Capacitor around the same Next.js app is the smallest step),
  App Store and Play listings (Apple's $99/year, Google's $25 once), health
  privacy labels, and App Review, which looks harder at health apps.
- **Recommendation (D14 A): Miamus doesn't log workouts itself.** Rebuilding
  a workout tracker turns a household app into a fitness app, and Apple
  Fitness, Strava and Google Fit do it better. Miamus keeps what the
  household coordinates: an elder's exercises (Care routines, above), meals
  and nutrition (Kitchen). Later, once a native app exists for other reasons
  (D15), "Me" could show a **read-only** summary from Apple Health / Health
  Connect next to the person's meals, if owners ask for it.
- **Full nutrition (micronutrients) and intake per person** go on the same
  timeline: per-person goals and "what Raka ate" are health data too, so
  they need people records (PR B), the consent above, and kitchen PR B/C
  (recipes, menu). Phase 170's Nutrition switch (calories and protein per
  recipe and per serving) is about food, not a person, and needs none of
  this.
- **The native-app question (D15)** is a later decision. What would trigger
  it: reliable iOS push for staff (the current PWA limitation), owners
  asking for Apple Health, or App Store presence for marketing. Not this
  phase.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Sign-up, screen 2 heading | Where would you like to start? | Mau mulai dari mana? |
| Sign-up, screen 2 line | Pick any. It only changes what Today shows first; nothing is hidden. | Pilih satu atau lebih. Ini hanya mengatur yang muncul dulu di Hari ini; tidak ada yang disembunyikan. |
| Chips | Chores · Kitchen · Repairs and bills · Care / Pets / Elders | Tugas · Dapur · Perbaikan dan tagihan · Rawat / Hewan / Lansia |
| Buttons | Continue · Skip | Lanjut · Lewati |
| Sign-up, Kids/Elders line (PR B) | Kids and elders get their own routines in Care. Only you and the staff you choose see them. | Anak dan lansia punya rutinitas sendiri di Rawat. Hanya Anda dan staf yang Anda pilih yang melihatnya. |
| Household row | Features | Fitur |
| Row detail | 5 on | 5 aktif |
| Sheet line | Turn on what your home needs. Turning something off hides it; nothing is deleted. | Nyalakan yang dibutuhkan rumah Anda. Kalau dimatikan, fitur hanya disembunyikan; tidak ada yang dihapus. |
| Groups | Home · Kitchen · Care | Rumah · Dapur · Rawat |
| Off with open work | {n} open repairs stay saved. Staff can't report new ones while this is off. | {n} perbaikan yang belum selesai tetap tersimpan. Staf tidak bisa melapor yang baru selama fitur ini mati. |
| Needs another | Needs Menu and recipes | Perlu Menu dan resep |
| Toasts | {Feature} is on · {Feature} is off · Undo · Couldn't save. Try again. | {Fitur} aktif · {Fitur} dimatikan · Batalkan · Gagal menyimpan. Coba lagi. |
| Offer buttons | Turn on · No thanks | Nyalakan · Tidak, terima kasih |
| Offer, Nutrition | Track calories and protein? Miamus can add them to your recipes and the week's menu. | Catat kalori dan protein? Miamus bisa menambahkannya di resep dan menu mingguan. |
| Offer, Menu | Plan meals and keep recipes? Your cook sees today's menu on their phone. | Rencanakan menu dan simpan resep? Yang memasak melihat menu hari ini di HP-nya. |
| Offer, Closet | Is this a closet? Keep track of clothes at the laundry or lent out. | Ini lemari pakaian? Catat pakaian yang di laundry atau dipinjam. |
| Family row (PR B) | Family | Keluarga |
| Add | Add family member | Tambah anggota keluarga |
| Relations | Partner · Child · Parent · Grandparent · Other family | Pasangan · Anak · Orang tua · Kakek/Nenek · Keluarga lain |
| Birth year | Birth year (optional) | Tahun lahir (opsional) |
| Add-person line (PR B) | Add family who agree to be in Miamus. Only owners see this list; staff see a name only on a routine that's theirs. | Tambahkan keluarga yang setuju dicatat di Miamus. Hanya pemilik rumah yang melihat daftar ini; staf hanya melihat nama di rutinitas yang menjadi tugasnya. |
| Care group (PR B) | Care: Elders · Kids · None | Rawat: Lansia · Anak · Tidak ada |
| Elder page | Routines · This week · Add routine | Rutinitas · Minggu ini · Tambah rutinitas |
| Summary | Morning walk: 5 of 7 days | Jalan pagi: 5 dari 7 hari |
| Routine form | Who does it · Anyone · Days · Time | Siapa yang mengerjakan · Siapa saja · Hari · Jam |

Wording follows `docs/indonesian-glossary.md`: **Anda**, **HP**, **tugas**,
**Rumah** for the Household tab, **Lansia**, **Hewan**.

## Staff text (Bahasa Indonesia only)

| Where | Text |
| --- | --- |
| Group heading on Tugas Hari Ini | {Nama}, e.g. **Oma Lina** |
| Routine row | Jalan pagi 15 menit · 07.00 |
| Buttons | Selesai · Tambah catatan · Tidak bisa dikerjakan |
| Care reasons | Tidak mau hari ini · Hujan · Lainnya |
| Note placeholder | Contoh: hanya 10 menit, lututnya pegal |
| Done line | Selesai 07.20 oleh Siti |
| Staff tip (once) | Baru: rutinitas untuk {Nama}. Centang Selesai setelah dikerjakan; tambahkan catatan kalau perlu. |

## Glossary rows (added to `docs/indonesian-glossary.md` in the build PRs, before any Indonesian text)

| English | Bahasa Indonesia | Note |
| --- | --- | --- |
| Features (Household row) | **Fitur** | everyday word |
| On / off (a feature) | **aktif / dimatikan** | "5 aktif" on the row |
| Where would you like to start? | **Mau mulai dari mana?** | sign-up screen 2 |
| Care (tab, group) | **Rawat** (proposed) | "Perawatan" is taken by *Perawatan rumah* (upkeep, Phase 164); owner question 4 |
| Family member | **Anggota keluarga** | |
| Relations | **Pasangan · Anak · Orang tua · Kakek/Nenek · Keluarga lain** | |
| Routine (for a person) | **Rutinitas** | as for pets |
| Morning walk / leg exercises | **Jalan pagi / latihan kaki** | examples only |
| Nutrition | **Gizi** | the kitchen addendum may add it first; one row, not two |
| No thanks (offer) | **Tidak, terima kasih** | |

## The database

All additive. Follows `AGENTS.md`: every `security definer` function
revokes `EXECUTE` from `public, anon` and grants only what's needed;
admin-only writes check `household_members` for that household (never
`get_user_household_ids()`, which staff phones pass); migrations applied
local → staging → production with the owner's OK, before the PR merges
(`main` deploys to production).

### Migration 145 (PR A): feature switches, where to start, dismissed offers

Re-check `supabase/migrations` and open PRs before building (141 staff
push, 142 staff pay, 143 closet, 144 kitchen are reserved).

**`household_features`**

| Column | |
| --- | --- |
| `household_id` | `uuid not null` → `households(id) on delete cascade` |
| `feature` | `text not null`, `check (feature in ('repairs', 'bills', 'food', 'closet', 'menu', 'nutrition'))`; PR B adds `'elders'`, PR C `'kids'` (a check change, additive) |
| `enabled` | `boolean not null` |
| `set_at` | `timestamptz not null default now()` |
| `set_by` | `uuid` → `auth.users(id) on delete set null`, nullable |
| primary key | `(household_id, feature)` |

- **No row = the default** (D4): `repairs`, `bills`, `food` on; `closet`,
  `menu`, `nutrition` off. Held in one place in SQL,
  `household_feature_defaults()` (immutable, `security invoker`), and
  mirrored in `src/lib/features.ts` with a unit test that the two agree.
- **Pets stays in `households.has_pets`** (162, live, with its guard).
  Features shows it as the first Care row and writes it through
  `set_household_has_pets`. Moving it into this table would touch a live
  column for no user gain.
- **Reads**: `select` policy for members and bound staff phones
  (`household_id in (select get_user_household_ids())`): staff phones need
  to know what's off to hide buttons, and a switch isn't personal data.
- **Writes**: no insert/update/delete grants. Only
  **`set_household_feature(p_household uuid, p_feature text, p_on
  boolean)`**: `security definer`, `search_path = ''`; refuses unless a
  `household_members` row exists for `auth.uid()` and that household
  (`not_admin`); refuses a null `p_on` (`bad_value`) and an unknown feature
  (the check); `nutrition` on with `menu` off refused (`needs_menu`); in PR
  B, `elders` off while an elder isn't archived refused (`has_live_people`).
  Upserts with `set_at`, `set_by`. `revoke all … from public, anon;`
  `grant execute … to authenticated, service_role;`.
- **Backfill**: rows `enabled = true` for any feature built before 145 that
  defaults off (`closet` if migration 143 exists and the household has a
  closet room or a bag; `menu` if 144's successor exists and the household
  has a recipe or a menu day). Written at build time against what exists.
- **Reminders respect the switch**: the Bills and upkeep reminder function
  (137) skips households with `bills` off. Listed in the PR's tests.
- **No database enforcement of "off" for normal writes.** Off hides; it
  doesn't lock. A staff phone with a stale screen that reports a repair
  while Repairs is off saves it, and the owner sees it when Repairs is back.
  Locking would turn a display setting into a source of lost work.

**`households.start_with`**: `text[]`, nullable, `check (start_with <@
array['chores', 'kitchen', 'repairs_bills', 'care']::text[])`; null = not
answered. Written by **`set_household_start_with(p_household uuid, p_items
text[])`** (same owner check, revoke/grant as above). Not added to
`create_household`: screen 2 comes after the household exists.

**Dismissed offers**: a small table of their own, **`owner_dismissed_offers`**
(`user_id` → `auth.users on delete cascade`, `offer text` with a check of
known values, `dismissed_at`; primary key `(user_id, offer)`). Not a column
on `user_preferences`: that row only exists once a language is saved and
its `locale` is `not null`, so a dismissal could fail for an owner who has
none. RLS on, no client grants; two functions:
**`my_dismissed_offers()`** returns the caller's list; **`dismiss_offer(p_offer
text)`** inserts one (`on conflict do nothing`). Both `security definer`,
`search_path = ''`, `auth.uid()` only, anonymous callers refused (staff
phones never see offers), `revoke all … from public, anon;` `grant execute
… to authenticated;`. **Turn on** needs no dismissal row: the feature is on,
so the offer has nothing to offer.

Tests: `supabase/tests/145_household_features.sql` (rolled back): defaults
with no rows; set and unset; staff phone, another household's owner and
`anon` refused; `needs_menu`; backfill; `start_with` check; dismissals per
account; grants (`anon` can execute none).

### PR B (next free number): people records and care routines

- **`household_people`**: `id`, `household_id` (cascade), `name` (`text`,
  1–40 chars), `relation` (`check in ('partner', 'child', 'parent',
  'grandparent', 'other')`), `care_group` (`check in ('elder', 'kid')`,
  nullable), `birth_year` (`smallint`, nullable, 1900 to the current year,
  checked in a trigger since `check` can't call `now()` safely), `user_id`
  (`uuid` → `auth.users on delete set null`, nullable; unique per household:
  an owner's own row), `archived_at`, `created_at`, `created_by`.
  **Owners only, for every operation**: select, insert, update policies
  check a `household_members` row for `auth.uid()` and that household
  (never `get_user_household_ids()`, which staff phones pass); no delete
  policy (archive instead; the household's deletion cascades). A trigger
  like 106's gives each new owner a linked row, and the migration backfills
  one for every existing owner.
- **What staff see of a person**: the linked `task_entities` row (below),
  which exists only once the person has a care routine, and carries only
  the name (a trigger keeps it in step when an owner renames the person,
  and archives it with them). Staff phones already read `task_entities` for
  pets; they never read `household_people`.
- **Allergies later** (kitchen D12 B), which the cook must see, get their
  own table and policy then, not a column here.
- **The routine engine**: `task_entities.entity_type` check gains
  `'person'`; `task_entities.person_id` (nullable, unique, cascade);
  `master_schedules.module` and `task_logs.module` checks gain `'care'`;
  `master_schedules.assigned_to` (nullable → `staff_profiles`, null =
  anyone). A check that `task_logs.photo_url is null` when `module =
  'care'`. Owners write care schedules; staff phones tick (insert
  `task_logs`) only for routines that are theirs or anyone's. PR B re-reads
  `master_schedules` and `task_logs` policies and the routine proposal path
  (staff suggestions stay pet-only at first).
- **`set_household_feature`** gains `'elders'` with the archive-first
  guard (refused while a person with `care_group = 'elder'` isn't
  archived).
- **The household export** (127, "Your data") includes people and care
  logs; deletion is by the existing cascade.

## Privacy policy (`src/components/legal/privacy-policy.tsx`, both languages)

- **PR A, one line** in section 3 ("Admins"): "Which features your
  household has switched on, where you chose to start, and which
  suggestions you've closed." / "Fitur yang dinyalakan di rumah Anda,
  tempat Anda memilih untuk mulai, dan saran yang sudah Anda tutup." No new
  service, no change in where data lives. Reviewers please confirm.
- **PR B, before it ships:**
  - section 3, a new group **"Family members you add"**: name, relation to
    the household, an optional birth year, whether they're cared for as an
    elder or a child, and for elders their routines, who ticked them, when,
    and any note staff or family added; notes can mention health, so owners
    should keep them practical;
  - section 5 ("Who can see it"): only the household's admins see family
    members; staff see a person's name only on a routine that's theirs to
    do, never the relation or birth year;
  - section 10, "Children": its first sentence changes in PR B, because an
    admin may now add a child's name to the family list even before Kids
    routines exist: "Miamus is for adults. Admins may add their children's
    names to the family list; only admins see them." / "Miamus untuk orang
    dewasa. Admin boleh menambahkan nama anak ke daftar keluarga; hanya
    admin yang melihatnya." The rest of section 10 stays;
  - section 7 ("How long"): kept until the person is deleted or the
    household is; archived people keep their history;
  - section 9: a line for admins: tell family members you add, and the
    elder, that their routines are recorded;
  - `src/config/legal.ts`: nothing changes unless a new processor is added
    (none is).
- **PR C (kids)**: section 10, "Children", gains kids' routines: Miamus
  stores children's names and routines only as entered by their parent or
  guardian (the admin), never asks children to sign in, and takes no
  photos of their routines (UU PDP Pasal 25: a parent's consent for
  children's data).
- **Later (health, nutrition per person)**: its own section, its own
  consent screen, an impact assessment, before anything is built.

## Rollout in PRs (D16)

| PR | What | Migration | Size |
| --- | --- | --- | --- |
| **A** | `src/lib/features.ts` (defaults, groups, which tab/pill each shows); a `useHouseholdFeatures()` hook beside `useHouseholdProfile()` (same cache-on-device pattern, no flash); Household → **Features** replaces Who lives here; switches wired for **Repairs, Bills and upkeep, Food at home** (and Closet/Menu if built); sign-up screen 2; first-run step 4 and Today greeting order; the offer component and its rules; staff hides; Kakak tool list respects switches; privacy line; glossary rows; What's new | **145** | Medium |
| **B** | People records under Family; Kids/Elders chips go live (Elders saves, Kids stays "Soon" until PR C); Pets → **Care** with pills; Elders: person page, care routines with assignment, staff Today rows, notes, couldn't-do reasons, week summary; privacy section; staff tip | next free | Large |
| **C** | Kids (after 3–5 parent conversations, roadmap item 18); privacy section 10 | next free | Medium |
| later | allergies per person (kitchen D12 B); nutrition per person; elders' medicine; "Me" and health with consent; native app | — | — |

PR A builds after Phase 169 PR A and Phase 170 PR A if they are close to
merge (fewer backfills to write); otherwise first, and those PRs add their
own switch row. Each PR: `tsc`, `next build`, unit tests (feature defaults
agree with SQL; `enabledModules` with Care; offer rules: once, one a day,
never staff), a Playwright test on the stub (sign up, skip screen 2, turn
Repairs off, the pill and the staff button go, turn it on, they're back, no
reload), Codex until clean, migrations local → staging → production with
the owner's OK, merge with the owner's OK.

## Tutorial (What's new, shown once per role)

- **Owners, PR A**: "New: choose what Miamus shows" / "Baru: pilih yang
  ditampilkan Miamus". Steps: "Household → Features lists everything Miamus
  can do. Switch off what you don't use; nothing is deleted." / "Rumah →
  Fitur berisi semua yang bisa dilakukan Miamus. Matikan yang tidak Anda
  pakai; tidak ada yang dihapus." Shown in Household, not on Today.
- **Owners, PR B**: "New: routines for Oma and Opa" / "Baru: rutinitas
  untuk lansia", shown when Elders is on or in What's new.
- **Staff**: none for PR A (things only disappear); the one tip above for
  PR B.

## Decisions for the owner

- **D1 — How many sign-up questions, and where.**
  **A (recommended):** two. *Who lives here?* stays on the name screen;
  *Where would you like to start?* is its own short screen after the
  household is made, with **Skip**. B: both on the name screen (one step,
  longer form). C: only *Who lives here?*; the checklist and offers do the
  ordering.
- **D2 — Wording of the second question and its chips.**
  **A (recommended):** "Where would you like to start?" / "Mau mulai dari
  mana?" with Chores · Kitchen · Repairs and bills · Care (named for who
  lives here, only if someone was picked). B: "What should Miamus help with
  first?" / "Apa yang ingin dibantu Miamus lebih dulu?" with the same chips.
- **D3 — Where switches live.**
  **A (recommended):** one row, **Household → Features**, replacing **Who
  lives here**; Care's switches are the who-lives-here answers. B: Features
  beside Who lives here (two rows). C: a small settings link on each tab.
- **D4 — What's on for a new household.**
  **A (recommended):** on if quiet until used (Repairs, Bills and upkeep,
  Food at home); off if it adds daily work or personal data (Closet, Menu and
  recipes, Nutrition, Kids, Elders unless picked). B: everything optional
  off; offers bring each one in. C: everything on.
- **D5 — Existing households.**
  **A (recommended):** everything they use today stays on (defaults plus
  backfill from data); nobody needs to open Features after the update. B:
  everything on, including features they've never used.
- **D6 — Turning a feature off with open work.**
  **A (recommended):** allowed, with a line saying what stays; data kept,
  reminders stop; Pets, Kids and Elders keep the archive-first rule because
  their tab or pill disappears. B: refused while there's open work, for
  every feature.
- **D7 — In-context offers.**
  **A (recommended):** one quiet card at the moment of need; **No thanks**
  hides it for that owner for good (saved on the account); at most one new
  offer per owner per day; never to staff; never for Kids or Elders. B: per
  phone only (no database). C: no offers; Features only.
- **D8 — Who is a person record.**
  **A (recommended):** family who live in or are cared for at home, not
  staff; owners listed automatically and linked to their account; under
  Household → Family; name, relation, optional birth year, a Care group; only owners read the list, staff see a name only on their routine. B:
  only people who are cared for (kids, elders); owners aren't person
  records. C: store people like pets, in `task_entities`.
- **D9 — Elders' routines: which engine.**
  **A (recommended):** reuse the pets routine engine through a linked
  `task_entities` row (`'person'`, module `'care'`), auditing the short list
  of pet-only checks. B: new care tables and screens. C: the chores engine.
- **D10 — The Care tab.**
  **A (recommended):** Pets becomes Care only when Kids or Elders is on; pills
  only for who lives there; with one kind, no pills and the tab keeps its
  name (so pet-only homes see no change). B: always called Care, even with
  only pets.
- **D11 — Seniors' exercises.**
  **A (recommended):** Care routines with a name, days, time and who does
  it; tick, optional note, couldn't-do reasons; a gentle week summary for
  owners; nothing measured. B: also record minutes or steps (health data,
  needs consent now). C: notes only, no routines.
- **D12 — Photos for people's routines.**
  **A (recommended):** none; a note is enough. B: optional photo, as for
  pets.
- **D13 — Staff phones.**
  **A (recommended):** a feature shows on a staff phone only when it's on and
  has something for that phone; owners' personal features have no staff
  path at all. B: every staff phone sees everything that's on.
- **D14 — Personal workouts and health.**
  **A (recommended):** not built now; Miamus doesn't log workouts itself;
  later a private, opt-in "Me" under the owner's own name (not a tab, not in
  Features), with its own consent, and a read-only summary from Apple Health
  / Health Connect once a native app exists. B: log workouts by hand in "Me"
  (manual-first). C: out of scope for good.
- **D15 — A native app.**
  **A (recommended):** decide later, when iOS push for staff, Apple Health,
  or App Store presence makes the case; a Capacitor wrapper of this app
  when it does. B: start the wrapper now.
- **D16 — Order of PRs.**
  **A (recommended):** PR A switches, Features and sign-up screen 2 (145);
  PR B people and Elders in Care; PR C Kids after parent research; health
  later. B: people and Elders first (the owner's seniors' exercises sooner),
  switches second.

## Open questions only the owner can answer

1. **Who is the elder you have in mind, and who helps them day to day?**
   (A staff member at your mother's household, family, or both.) It decides
   whether PR B's first version needs "who does it" per routine, or
   "anyone" is enough.
2. **Do the elders' routines need medicine soon?** If yes, elders' medicine
   moves up, with its health-data consent, right after PR B.
3. **Is the seniors' exercises need urgent enough to build PR B before PR
   A?** (D16 B.) PR A is what keeps the app from feeling heavier; PR B is
   what your family can use.
4. **The Indonesian name for the Care tab.** Proposed **Rawat** (short;
   *Perawatan* already means upkeep in *Perawatan rumah*). Alternatives:
   *Perawatan*, *Asuh*, *Keluarga*.

## Not in this phase

- Health, medicine for people, conditions, body measurements, workouts,
  nutrition goals or intake per person (later, consent first).
- A native app, Apple Health or Health Connect.
- Kids (PR C, after research).
- Per-owner feature choices for household features (one owner hiding
  Kitchen for themself only).
- Feature switches for the always-on core (Today, Chores, Shopping, staff).
- Paid tiers tied to features (item 16; Features is not a paywall, and no
  row looks locked).
- Staff suggesting care routines (pets keep "Usulkan jadwal").
- Kakak setting feature switches.
