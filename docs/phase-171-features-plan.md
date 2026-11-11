# Phase 171 — Features you switch on, and a simple sign-up

Status: **decided: owner chose all recommendations (D1–D15 A),
2026-11-10; PR A (146) builds after Phase 172 PR A1.** The three open
questions below stay open. Nothing is built, nothing
is applied anywhere. Migration **146** is a placeholder for PR A (feature
switches and the "What kind of home?" answer). People records, elders'
routines and the Care tab are **later, behind an optional switch, after
interviews with target households**; health and workouts are **dropped for
now**. Roadmap: row 26 (build now, trimmed), rows 18, 27, 28 (later), rows
29 and 30 (dropped for now) in `docs/roadmap-2026-11-09.md`. Mockup:
`docs/mockups/phase-171-features.html` (open in a browser, phone width;
owner screens English left and Bahasa Indonesia right, staff screens Bahasa
Indonesia only).

Builds on **Phase 162** ("Who lives here?", migration 133, live:
`households.has_pets`, `useHouseholdProfile()`, `OPTIONAL_MODULES` in
`src/lib/dashboard-modules.ts`) and the **first-run checklist** (audit
batch B1, PR #62). Hands off to **Phase 172, "the first 10 minutes"**
(being planned now), which owns the starter templates that "What kind of
home?" loads.

## What changed after the 10 Nov evaluation

The owner adopted the app evaluation (PR #79,
`docs/app-evaluation-2026-11-10.md`, sections 7 and 8). For this phase:

| Was (first version of this plan) | Now |
| --- | --- |
| Second sign-up question "Where would you like to start?", which only ordered the checklist and Today | **"What kind of home?"**, which **loads a starter template** (rooms, usual chores, bills). The templates are Phase 172's; 171 stores the answer and hands off to 172's template step (evaluation recommendation 2). |
| Features list with Closet, Menu and recipes, Nutrition | **PR A switches only modules that exist**: Repairs, Bills and upkeep, Food at home, Pets. Closet, kitchen amounts, recipes and menu are "later, optional switch" in the evaluation; they join the list off when they're built. Basic nutrition is **dropped for now**. |
| PR B: people records, Elders in Care, their routines and exercises | **Later, optional switch; interview target households first.** The design below is kept as a sketch so nothing is lost. |
| Personal workouts and health later, in a private "Me" | **Dropped for now** (sensitive under UU PDP, far from the core promise). The native-app fact stays. |
| Offers at the moment of need, built in PR A | Rules written now; the component is built **with the first feature that starts off**. In PR A every switch starts on, so there is nothing to offer. |
| A staff tip when an elder's first routine arrives | None: **no new reading for staff** (a video tip, or nothing). |
| A What's new card per PR | **One owner card for PR A, existing households only**, within the "one a week" budget, never for new households. |

The adopted stop rules this plan is checked against (table near the end):
**no new required field on the default path; no new reading for staff; at
most one What's new card a week, owners only, never for new households.**

## The problem

The owner, 10 November: Miamus is growing (pets, chores, rooms, repairs,
bills; planned closet and kitchen; asked-for nutrition, health and seniors'
exercises). *"Figure out a way where it doesn't get too overloaded. Some
people might not want this or that, so make sure the questions are simple
enough and not overbearing during sign-up."*

The evaluation adds the measured part: setting up a big house by hand takes
about **65 typed fields and 400 taps**, and a new owner reads about 330
words before the first chore. So the job of sign-up isn't only to ask
little; it's to *do work* with the little it asks.

- **Every module is on for everyone.** A house without a garden or a cook
  still sees Repairs, Bills and upkeep and Food, all empty.
- **A long setup wizard would be worse.** Questions about features people
  can't picture yet.
- **One sign-up answer does nothing for the owner yet.** "Who lives here?"
  hides Pets; nothing pre-fills the house.

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
  Send feedback.
- **Tabs and pills today**: Today (Day · Week) · Pets · Chores (Today ·
  Rooms · Repairs; Bills and upkeep as a checklist on Chores → Today) ·
  Kitchen (Food · Shopping) · Household.
- **Staff phones**: *Lapor kerusakan* (Repairs) and *Makanan masuk* (Food)
  in the Lapor sheet; pet routines and Catat Ekstra (already hidden without
  pets, 162).
- **Pushes and reminders by module**: `notify_chores_due` (137) sends the
  07:00 reminder for *every* chore with a reminder, bills (`category =
  'bill'`) among them; `notify_food_expiring` and `notify_food_from_staff`
  (123–124) are Food's; `notify_urgent_repair` (130) is Repairs'.
- **Views in the URL**: `?chores=` (`use-chores-view.ts`: today · rooms ·
  repairs) and `?kitchen=` (`use-kitchen-view.ts`: Food when absent, `buy`
  for Shopping). Kakak's tools: `create_chore` (with a `bill` category),
  `add_to_shopping_list`, `add_pet_routine`, `add_food`, `ask_question`.
- **What's new** (`src/lib/whats-new.ts`): 55 entries in four days
  (evaluation); the new budget is one a week.

## The idea in one line

Sign-up asks two optional chip questions, **"Who lives here?"** (as built)
and **"What kind of home?"**, which starts Phase 172's template; everything
optional is a switch in **Household → Features**, and existing households
keep everything they use.

## Rules that keep Miamus light

| Rule | What it means on screen |
| --- | --- |
| **Two optional questions, then the house** | *Who lives here?* on the name screen (as today); *What kind of home?* on one screen after, with **Skip**. Neither is required. Nothing about nutrition, closet, health or workouts. |
| **Answers do work** | *What kind of home?* opens 172's starter template for that kind of home, so the owner ticks instead of typing. |
| **One place for every switch** | **Household → Features**, one plain line per row. |
| **Off hides, never deletes** | A switched-off feature's pill, Today lines, staff buttons, Kakak tools and reminders go; its data stays and comes back with the switch. |
| **Offer once, at the moment of need** (with later features) | One quiet card, **Turn on** or **No thanks**, never again for that owner, never to staff. Built with the first feature that starts off. |
| **Staff see only what's on and theirs** | PR A only removes things from staff phones; it adds no text. |

## What changes for people (PR A)

| Who | What's new |
| --- | --- |
| New owners | After **Create household**, one screen: **What kind of home?** (House with garden and pool · Big house with several floors · Apartment), **Skip** in the corner. Picking one opens Phase 172's template step for it. |
| All owners | **Household → Features** replaces **Who lives here**: **Repairs**, **Bills and upkeep**, **Food at home**, **Pets**, each with one line and a switch. |
| Existing households | Nothing hides on the update. Everything starts on (Pets keeps its 162 answer). |
| Staff | Nothing new to read. With Repairs off, no *Lapor kerusakan*; with Food at home off, no *Makanan masuk*. |

## The screens (mockup)

1. **Sign-up, the name screen**: unchanged from today (Pets live; Kids and
   Elders greyed "Soon").
2. **Sign-up, "What kind of home?"**: three cards, one choice, **Skip**,
   **Continue**. Continue goes to Phase 172's template step (drawn as a
   placeholder: 172 designs it).
3. **Household → Features**: the four rows PR A switches, grouped Home ·
   Kitchen · Pets, a note that more rows join, off, when they're built.
4. **Later, an offer** (when the Closet ships): "Is this a closet?" on a
   room's sheet. Drawn to fix the offer's look, not built in PR A.
5. **Later, after interviews**: Care → Elders, an elder's routines (sketch).
6. **Later, after interviews**: the elder's routine on staff Tugas Hari
   Ini (sketch; no staff tip).

## How it fits the five tabs

Still five tabs. Only Pets (later Care) can disappear. One pill left means
no pills.

| Tab | Pills | Shown when | Switch |
| --- | --- | --- | --- |
| **Today** | Day · Week | always | each feature's lines only when it's on |
| **Pets** (Care later) | none now; later Pets · Kids · Elders | when Pets is on (as built) | Pets (`has_pets`); later Kids, Elders |
| **Chores** | Today · Rooms · Repairs | Today and Rooms always; **Repairs** pill when on | Home: Repairs |
| | Bills and upkeep checklist (Chores → Today) | when on | Home: Bills and upkeep |
| **Kitchen** | Food · Shopping (later Menu) | **Shopping** always; **Food** when on; with Food off, Shopping alone and no pills | Kitchen: Food at home |
| **Household** | settings list | always; **Features** replaces **Who lives here** | — |

Always on, no switch: Today, Chores (Today, Rooms), Shopping, staff, leave,
sign-in, notifications, Kakak's own switch. A switch for them would only
add a way to break the app.

## Sign-up: two optional questions (D1, D2)

Nothing changes until the name screen.

**Screen 1, the name screen (as built).** Name your household, then **Who
lives here?** with **Pets** live and **Kids** and **Elders** greyed "Soon"
(162 D1 A). The question stays; nothing is added to this screen. "Elderly
parents" was considered for the chip: longer, and it leaves out a
grandparent or an aunt; the built "Elders" / "Lansia" stays (D2). Kids and
Elders become real only if the later people records are built.

**Screen 2, after "Create household".** The household exists, so **Skip**
loses nothing.

- Heading: **What kind of home?** / **Rumah seperti apa?**
- Line: "Miamus sets up the usual rooms, chores and bills for you to tick."
  / "Miamus menyiapkan ruangan, tugas dan tagihan yang biasa; Anda tinggal
  mencentang."
- One choice, nothing pre-selected:
  - **House with garden and pool** / Rumah dengan taman dan kolam renang
  - **Big house with several floors** / Rumah besar bertingkat
  - **Apartment** / Apartemen
- **Continue** stores the answer (`households.home_type`) and opens **Phase
  172's template step** with that template. **Skip** stores nothing and
  goes where 172 says a skipped template goes (Today with the first-run
  checklist, as now, until 172 decides).
- The three kinds are the evaluation's examples. **The final list, and what
  each template holds, are Phase 172's.** Phase 172 PR A1 builds first
  (#80, migration 145), so it builds this screen and stores the answer;
  171 PR A builds after it and reuses the screen as designed here, adding
  nothing to it.

No new required field: both questions are optional, and an owner who skips
both lands where they land today.

## Household → Features (D3–D6)

A new row **Features** / **Fitur** (lucide `SlidersHorizontal`) takes the
place of **Who lives here**. Its sheet:

| Group | Row | One line (EN / ID) | New household | Existing household |
| --- | --- | --- | --- | --- |
| **Home** / Rumah | **Repairs** / Perbaikan | Staff report what's broken with a photo; you plan the fix. / Staf melaporkan yang rusak dengan foto; Anda atur perbaikannya. | On | On |
| | **Bills and upkeep** / Tagihan dan perawatan | Reminders for electricity, water, PBB, AC service and the like. / Pengingat listrik, air, PBB, servis AC dan lainnya. | On | On |
| **Kitchen** / Dapur | **Food at home** / Makanan di rumah | Leftovers and food from others, where it's kept and until when. / Sisa masakan dan makanan dari orang, di mana disimpan dan sampai kapan. | On | On |
| **Pets** / Hewan (Care, if it's built later) | **Pets** / Hewan | Routines, meals, medicine, vet visits and photos. / Rutinitas, makan, obat, dokter hewan dan foto. | From sign-up | As answered (162) |

A line at the foot: "More features appear here, switched off, as Miamus
adds them." / "Fitur baru muncul di sini dalam keadaan mati saat Miamus
menambahkannya."

- **Only built features have rows** (D4). When the Closet, kitchen amounts,
  recipes or the menu are built (each "later, optional switch" in the
  evaluation), each joins the list **off**, with the offer rules below. No
  greyed rows, no "coming soon", nothing that looks locked.
- **Everything in PR A starts on** (D4, D5): these modules are quiet until
  used, and staff already know their buttons. Existing households see no
  change on the update and never need to open Features.
- **Switching off** (D6): at once (soft sync, no reload), with a toast and
  **Batalkan** (Undo). If there's open work, one line under the row says
  what stays: "3 open repairs stay saved. Staff can't report new ones while
  this is off." Data is never deleted. **Pets keeps 162's rule** (archive
  pets first), because its tab disappears.

**What "off" does, feature by feature** (the PR A checklist):

| Off | Owner screens | A link to the hidden view | Staff phones | Pushes | Kakak |
| --- | --- | --- | --- | --- | --- |
| **Repairs** | no Repairs pill on Chores; no repair lines on Today; the wrench count on Rooms hides | `?chores=repairs` falls back to Chores → Today (in `use-chores-view.ts`, like `moduleFromParam` for tabs) | no *Lapor kerusakan* | `notify_urgent_repair` skips the household (a repair saved from a stale screen waits for Repairs to come back) | nothing to change (no repair tool) |
| **Bills and upkeep** | no checklist; **chores with `category = 'bill'` hide** from Chores and Today (they stay saved, with their payments) | — | bill chores hide from the staff list too | `notify_chores_due` skips **only `category = 'bill'` chores**; every other chore's reminder still goes | `create_chore` no longer offers the `bill` category |
| **Food at home** | no Food pill; Kitchen opens on Shopping; no food lines on Today | no `?kitchen` (the old default) and any Food link open Shopping (in `use-kitchen-view.ts`) | no *Makanan masuk*; Dapur opens on Belanja | `notify_food_expiring` and `notify_food_from_staff` skip the household | `add_food` left out of the tool list |
| **Pets** | as 162 (tab, Today lines, supplies shelf) | as 162 (`moduleFromParam`) | as 162 | pet routine proposals: as 162 | as 162 (`add_pet_routine` left out) |

## Offers at the moment of need (D7)

Written now so every later feature uses one rule set:

- **One card, in place, quiet**: lucide icon, one question, one line,
  **Turn on** and **No thanks**. No modal, never blocks.
- **Once per owner**: **No thanks** hides that offer for that owner for
  good, on every phone (saved on the account). **Turn on** switches the
  feature for the household.
- **One at a time**, at most one new offer per owner per day; **never to
  staff**; **never for a feature an owner switched off themself** (that
  would be nagging); never for people or health data.
- **Built with the first feature that starts off** (likely the Closet or
  the kitchen menu), with its dismissal table and functions in that
  feature's migration. Example offers for later: *Is this a closet?* on a
  room named like one (*closet*, *wardrobe*, *walk-in*, *lemari*); *Plan the
  week's menu?* on Kitchen once the menu exists.

## Staff phones (D14)

- **Only what's on and theirs.** PR A only removes: Repairs off → no
  *Lapor kerusakan*; Food at home off → no *Makanan masuk*; Pets off →
  as 162.
- **No new reading.** No staff tutorial, no new label, no tip. The Lapor
  sheet's one-line description already has a short version without pets
  (162); PR A adds the same kind of shorter line when Repairs or Food is
  off, never a longer one.

## Later, optional switch: people records and elders' routines (D9–D11)

**Not built until target households are interviewed** (evaluation section
7: "real need in many big houses, but no target household has asked yet").
The interview question: *does anyone at home need a daily routine someone
else helps with (a parent's walk, exercises, water), and how is it tracked
today?* If the answer is yes in at least two of the 3–5 target households,
this becomes a plan PR of its own, with this sketch as its start:

- **People records** under **Household → Family**: family who live in or
  are cared for at home, not staff. Owners listed automatically (linked to
  their account); people without an account added by an owner. Name,
  relation, optional birth year, a Care group (Elders · Kids · none). All
  fields but the name optional.
- **Only owners read people records.** Staff learn a person's name only
  through a care routine meant for their phone (a linked `task_entities`
  row, `entity_type = 'person'`, the way they learn a pet's name).
- **Elders' routines and exercises** (*Jalan pagi 15 menit*, *Latihan
  kaki*, *Minum air putih*) reuse the pets routine engine (`master_schedules`
  with `module = 'care'`, an optional `assigned_to`); ticked **Selesai** with
  an optional note and 165's couldn't-do reasons; **no photos**; nothing
  measured; a grey week summary for owners ("Morning walk: 5 of 7 days").
- **Care tab**: the Pets tab becomes Care only when Kids or Elders is on;
  pills only for who lives there; pet-only homes see no change.
- **Staff**: the routine row only, on the phones it's for. No tip (no new
  reading); a 15-second video tip if anything.
- **Privacy, when it's built**: section 3 gains "Family members you add";
  section 5 says only admins see them and staff see a name only on their
  routine; section 7 retention; section 10, "Children", changes its first
  sentence as soon as a child's name can be stored.
- **Per-person allergies** (kitchen D12 B) would hang off the same records.

## Dropped for now: health, workouts and nutrition per person (D12, D13)

- **Dropped** (evaluation section 7): health, personal workouts, nutrition
  goals and intake per person. They're specific personal data under UU PDP
  (*data kesehatan*, Pasal 4(2)), which would need separate explicit
  consent, owner-only access and an impact assessment, and they're far from
  the core promise (*tell Miamus once; your staff know what to do*). Basic
  nutrition on recipes is dropped too (evaluation: "drop for now").
- **A fact to keep (D13):** a PWA **can't read Apple Health (HealthKit) or
  Android Health Connect**; both are native-only. Reading them would need a
  native wrapper app (Capacitor around this Next.js app is the smallest
  step), App Store and Play listings (Apple $99 a year, Google $25 once),
  health privacy labels and a stricter App Review. Other reasons may bring
  a native app first (reliable iOS push for staff, App Store presence);
  that's a separate decision.

## Owner text (EN / ID), PR A

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Sign-up, screen 2 heading | What kind of home? | Rumah seperti apa? |
| Sign-up, screen 2 line | Miamus sets up the usual rooms, chores and bills for you to tick. | Miamus menyiapkan ruangan, tugas dan tagihan yang biasa; Anda tinggal mencentang. |
| Choices (final list: Phase 172) | House with garden and pool · Big house with several floors · Apartment | Rumah dengan taman dan kolam renang · Rumah besar bertingkat · Apartemen |
| Buttons | Continue · Skip | Lanjut · Lewati |
| Household row | Features | Fitur |
| Row detail | 4 on | 4 aktif |
| Sheet line | Turn on what your home needs. Turning something off hides it; nothing is deleted. | Nyalakan yang dibutuhkan rumah Anda. Kalau dimatikan, fitur hanya disembunyikan; tidak ada yang dihapus. |
| Sheet foot | More features appear here, switched off, as Miamus adds them. | Fitur baru muncul di sini dalam keadaan mati saat Miamus menambahkannya. |
| Groups | Home · Kitchen · Pets | Rumah · Dapur · Hewan |
| Off with open work | {n} open repairs stay saved. Staff can't report new ones while this is off. | {n} perbaikan yang belum selesai tetap tersimpan. Staf tidak bisa melapor yang baru selama fitur ini mati. |
| Toasts | {Feature} is on · {Feature} is off · Undo · Couldn't save. Try again. | {Fitur} aktif · {Fitur} dimatikan · Batalkan · Gagal menyimpan. Coba lagi. |
| Offer buttons (later) | Turn on · No thanks | Nyalakan · Tidak, terima kasih |

Wording follows `docs/indonesian-glossary.md`: **Anda**, **Rumah** for the
Household tab, **Hewan**, **Batalkan** for Undo.

## Glossary rows (added to `docs/indonesian-glossary.md` in PR A, before any Indonesian text)

| English | Bahasa Indonesia | Note |
| --- | --- | --- |
| Features (Household row) | **Fitur** | everyday word |
| On / off (a feature) | **aktif / dimatikan** | "4 aktif" on the row |
| What kind of home? | **Rumah seperti apa?** | sign-up screen 2; choices follow Phase 172 |
| No thanks (offer, later) | **Tidak, terima kasih** | |

## The database: migration 146 (PR A)

**146 is a placeholder:** migration numbers are assigned at build time,
the next free number above `main` (manager rule, 10 Nov).

All additive. Follows `AGENTS.md`: every `security definer` function
revokes `EXECUTE` from `public, anon` and grants only what's needed;
admin-only writes check `household_members` for that household (never
`get_user_household_ids()`, which staff phones pass); applied local →
staging → production with the owner's OK, before the PR merges (`main`
deploys to production). Re-check `supabase/migrations` and open PRs before
building (141 staff push, 142 staff pay, 143 closet, 144 kitchen, 145
Phase 172 PR A1 are reserved; 172 builds first).

**`household_features`**

| Column | |
| --- | --- |
| `household_id` | `uuid not null` → `households(id) on delete cascade` |
| `feature` | `text not null`, `check (feature in ('repairs', 'bills', 'food'))`; each later feature adds its value (a check change, additive) |
| `enabled` | `boolean not null` |
| `set_at` | `timestamptz not null default now()` |
| `set_by` | `uuid` → `auth.users(id) on delete set null`, nullable |
| primary key | `(household_id, feature)` |

- **No row = on** for the three PR A features: existing and new households
  need no backfill and lose nothing. Later features default off; the
  defaults live in one SQL function, `household_feature_defaults()`
  (immutable, `security invoker`), mirrored in `src/lib/features.ts` with a
  unit test that the two agree.
- **Pets stays in `households.has_pets`** (162, live, with its guard).
  Features shows it and writes it through `set_household_has_pets`.
- **Reads**: `select` policy for members and bound staff phones
  (`household_id in (select get_user_household_ids())`): staff phones need
  to know what's off to hide buttons; a switch isn't personal data.
- **Writes**: no insert/update/delete grants. Only
  **`set_household_feature(p_household uuid, p_feature text, p_on
  boolean)`**: `security definer`, `search_path = ''`; refuses unless a
  `household_members` row exists for `auth.uid()` and that household
  (`not_admin`); refuses a null `p_on` (`bad_value`) and unknown features
  (the check). Upserts with `set_at`, `set_by`. `revoke all … from public,
  anon;` `grant execute … to authenticated, service_role;`.
- **Pushes respect the switch** (table above): `notify_chores_due` gains a
  condition that drops `category = 'bill'` chores for households with
  `bills` off (never the whole household: other chores' reminders still
  go); `notify_food_expiring`, `notify_food_from_staff` and
  `notify_urgent_repair` skip households with `food` / `repairs` off. Each
  is re-created from its latest definition, keeping its grants, with a test
  that it skips and that the others still send.
- **"Off" isn't enforced on normal writes.** Off hides; it doesn't lock. A
  stale staff screen that reports a repair while Repairs is off saves it,
  and the owner sees it when Repairs is back.

**`households.home_type`**: `text`, nullable (null = skipped), with a check
of the values Phase 172 settles. Written by **`set_household_home_type(p_household
uuid, p_type text)`** (same owner check, revoke/grant as above); not added
to `create_household`, because screen 2 comes after the household exists.
Phase 172 PR A1 builds first (migration 145) and owns screen 2; if its 145
adds this column, 146 leaves it out and only reads it.

No dismissed-offers table in 146: it comes with the first feature that has
an offer (D7).

Tests: `supabase/tests/146_household_features.sql` (rolled back): no rows
= on; set and unset; staff phone, another household's owner and `anon`
refused; unknown feature refused; `home_type` check; grants (`anon` can
execute neither function).

## Privacy policy (`src/components/legal/privacy-policy.tsx`, both languages)

- **PR A, one line** in section 3 ("Admins"): "Which features your
  household has switched on, and the kind of home you picked when you set
  it up." / "Fitur yang dinyalakan di rumah Anda, dan jenis rumah yang Anda
  pilih saat menyiapkannya." No new service and no change in where data
  lives, but it is a change in what's stored, so PR A also bumps
  `policyVersion` (next after the version on `main` at build time, today
  `2026-11-10.5`) and `effectiveDate` in `src/config/legal.ts`, with a dated
  comment like the others ("feature switches and the kind of home picked at
  sign-up; no new service"). If Phase 172 PR A1 already adds the kind-of-home
  line, PR A adds only the feature-switch half and still bumps the
  version.
- **People records (later)**: the lines in the sketch above, before that
  PR ships.
- **Health (dropped)**: nothing.

## Rollout (D15)

| PR | What | Migration | Size |
| --- | --- | --- | --- |
| **A, build now** | `src/lib/features.ts` (rows, defaults, which pill and staff button each hides); a `useHouseholdFeatures()` hook beside `useHouseholdProfile()` (cache on device, no flash); Household → **Features** replaces Who lives here; switches wired for Repairs, Bills and upkeep, Food at home and Pets; staff hides; Kakak's tool list respects the switches; the four push functions respect them; the Chores and Kitchen view fallbacks; privacy-policy line (EN and ID) and the `policyVersion` / `effectiveDate` bump in `src/config/legal.ts`; glossary rows; one What's new entry (screen 2 is built by Phase 172 PR A1) | **146** (placeholder) | Small–medium |
| later | each optional feature (closet, kitchen amounts, recipes, menu) joins Features off, with the offer component built by the first | its own | — |
| later, after interviews | people records, Elders in Care, their routines; Kids after parent interviews | its own | Large |
| dropped for now | health, workouts, nutrition per person, basic nutrition | — | — |

PR A builds after Phase 172 PR A1 (#80, migration 145), which builds
screen 2 as designed here; 171 PR A reuses it. Each PR: `tsc`, `next build`, unit tests (defaults agree with SQL;
which pills and staff buttons hide), a Playwright test on the stub (sign up,
skip screen 2, turn Repairs off: the pill and the staff button go; turn it
on: they're back; no reload), Codex until clean, migration local → staging
→ production with the owner's OK, merge with the owner's OK.

## Tutorial (What's new)

- **Owners of existing households, PR A, one entry** (it counts as that
  week's card): "New: choose what Miamus shows" / "Baru: pilih yang
  ditampilkan Miamus". One step: "Household → Features: switch off what you
  don't use. Nothing is deleted." / "Rumah → Fitur: matikan yang tidak Anda
  pakai. Tidak ada yang dihapus." Shown in Household, not on Today.
- **New households**: no card (the stop rule; Features is in their
  Household list from the start). "New" is the evaluation's test: created
  less than 14 days ago **or** first-run setup not done (the B1 checklist
  still showing). The card shows only to owners of households past both,
  so a household that signs up after the deploy never sees it.
- **Staff**: none.

## Stop-rules check

| D | No new required field on the default path | No new reading for staff | One What's new a week, never new households |
| --- | --- | --- | --- |
| D1, D2 sign-up | both questions optional; Skip | — | — |
| D3–D6 Features | switches only; nothing to fill | staff lose buttons, gain no text | one owner card, existing households only (D8) |
| D7 offers | a card, never a field | never shown to staff | not a What's new card |
| D8 What's new | — | none for staff | one card, existing households |
| D9–D11 people, elders (later) | every field but the name optional; off by default | routine rows only, no tip | none until built |
| D12, D13 health (dropped) | — | — | — |
| D14 staff | — | removes only | — |
| D15 order | — | — | — |

## Decisions for the owner

**Decided 2026-11-10: the owner chose all recommendations, so D1–D15 are
all A.**

- **D1 — Sign-up questions.**
  **A (recommended):** two, both optional: *Who lives here?* on the name
  screen (as built) and *What kind of home?* on its own screen after the
  household is created, with **Skip**; the answer is stored and opens Phase
  172's template step. B: *What kind of home?* on the name screen too (one
  step, longer form). C: no second question; 172's template step asks it
  itself.
- **D2 — Wording.**
  **A (recommended):** "What kind of home?" / "Rumah seperti apa?" with the
  evaluation's three kinds (final list in 172); *Who lives here?* keeps its
  built chips, Pets live and Kids and Elders greyed "Soon". B: rename the
  chip "Elderly parents". C: hide the greyed Kids and Elders chips until
  people records are built.
- **D3 — Where switches live.**
  **A (recommended):** one row, **Household → Features**, replacing **Who
  lives here**. B: Features beside Who lives here. C: a settings link on
  each tab.
- **D4 — Which switches in PR A, and their defaults.**
  **A (recommended):** only modules that exist: Repairs, Bills and upkeep,
  Food at home (on), Pets (from sign-up); later features join off when
  built; no greyed rows. B: also list later features greyed "Soon". C:
  start Repairs, Bills and Food off for new households.
- **D5 — Existing households.**
  **A (recommended):** everything they use stays on; nobody needs to open
  Features. B: a one-time "choose your features" card for them.
- **D6 — Turning off with open work.**
  **A (recommended):** allowed, with a line saying what stays; data kept,
  reminders stop; Pets keeps the archive-first rule. B: refused while
  there's open work.
- **D7 — Offers.**
  **A (recommended):** rules written now (once per owner, one a day, never
  staff, never for something an owner switched off); built with the first
  feature that starts off. B: build the component in PR A anyway, with
  offers for Repairs and Bills to households that switched them off.
- **D8 — What's new.**
  **A (recommended):** one owner card for PR A, existing households only,
  counted as that week's card; none for new households or staff. B: no
  card; Features is self-explanatory.
- **D9 — People records.**
  **A (recommended):** later, behind an optional switch; interview 3–5
  target households first, and plan it only if two or more need it. B:
  plan it now from the sketch.
- **D10 — Elders' routines and exercises.**
  **A (recommended):** later, with D9: the pets routine engine, a tick and
  an optional note, no photos, nothing measured, a grey week summary, no
  staff tip. B: build elders' routines without people records (an elder as
  a pet-like entry).
- **D11 — The Care tab.**
  **A (recommended):** Pets stays Pets until D9/D10 ship; then Care with
  pills only for who lives there. B: rename to Care now.
- **D12 — Health, workouts, nutrition per person, basic nutrition.**
  **A (recommended):** dropped for now. B: keep a later sketch in the
  roadmap.
- **D13 — A native app.**
  **A (recommended):** a later, separate decision; recorded fact: a PWA
  can't read Apple Health or Health Connect. B: start a wrapper now.
- **D14 — Staff phones.**
  **A (recommended):** a feature shows only when it's on and has something
  for that phone; PR A only removes, adds no text. B: every staff phone sees
  everything that's on.
- **D15 — Order.**
  **A (recommended):** PR A (146) right after Phase 172 PR A1 (145), which
  builds the shared screen 2; optional features join off as they're built;
  people and elders after interviews; health dropped. B: build 171 PR A
  and 172 PR A1 together in one PR.

## Open questions only the owner can answer

1. **Are three kinds of home enough** for your target households (house
   with garden and pool, big house with several floors, apartment), or is
   there a fourth you'd pick (a villa, a house plus a separate staff
   house)? Phase 172 settles the list; your answer goes there.
2. **Which 3–5 target households can we interview**, and does one have an
   elderly parent at home? That decides D9 and D10.
3. **Is PR A's What's new card this week's one**, or does another feature
   have the week?

## Not in this phase

- The starter templates themselves (Phase 172).
- People records, kids, elders and the Care tab (later, after interviews).
- Health, workouts, nutrition per person, basic nutrition (dropped for now).
- A native app, Apple Health, Health Connect.
- Switches for the always-on core (Today, Chores, Shopping, staff).
- Per-owner choices for household features.
- Paid tiers tied to features; no row ever looks locked.
- Kakak setting feature switches.
