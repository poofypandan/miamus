# Phase 173 — Any routine, for any pets, in one easy sheet

Status: **plan, not decided.** Docs only: no app code, no migration applied.
Migration **147** is reserved for PR A (described below, not written).
Mockup: `docs/mockups/phase-173-pet-routines.html` (open in a browser, phone
width; owner screens English left, Bahasa Indonesia right; staff screens in
Bahasa Indonesia only). Roadmap row 35.

This makes the most-used part of Miamus better (248 pet-routine logs by staff
in the last 7 days in production, per the 10 Nov evaluation). **It isn't a new
module:** no new tab, no new table, and the specialised cards (meals, potty,
medicines, vet, grooming) stay as they are.

## The owner's request (10 Nov)

- "The maids need to turn off the lights for Mocha and Matcha at night, every
  day at 21:30. I want to schedule daily walks just for Matcha, not Mocha."
- "Don't create the task for me; make it so I can schedule all these in
  easily in the app."
- "Evaluate how we input routines for pets. Is it already the best method?"

**Short answer to the last question: no.** Meals, potty and medicines work
well. Anything else has to go through **Others**, which forces an end date,
works one pet at a time, always asks staff for a photo, and has no place for
a note to staff.

## What exists (read 2026-11-10)

- **`ManageRoutinesSheet`** (`src/components/dashboard/schedule-editor.tsx`,
  1,549 lines), opened per pet from **Manage routines** on the pet's page.
  Cards: Meals, Potty, Vet, Medications, Grooming, **Others**, then **Copy
  schedule to…**.
- **`master_schedules`** (000): `entity_id` (one pet), `title`, `module`,
  `frequency_type` (`interval` | `fixed_time` | `weekly`), `fixed_times`,
  `start_time`/`end_time`/`interval_hours`, `is_active`, `expires_at`,
  `created_at` (also used as the first day). **No category, note,
  assignee, weekdays or photo setting.**
- **The category is guessed from the title** (`categorizeSchedule`,
  `src/lib/schedule-categories.ts`): `Pipis & Pup` is potty; `Medication: `,
  `Grooming: ` and `Vet: ` prefixes; anything with `expires_at` is "Others"
  (`temporary`); **everything else is a meal.** So a plain "Matikan lampu"
  with no end date would show as a meal, with the fork-and-knife icon. That
  is why **Others** insists on an end date (`if (!title || !expiresAt)`).
- **`weekly` isn't drawn:** `scheduleSlotMinutes` returns no slots for it
  (`src/lib/scheduleEngine.ts`), so "weekdays only" can't be made today.
- **One routine, one pet.** **Copy schedule to…** copies a pet's whole
  schedule, not one routine.
- **Staff already see one card for several pets.** `buildAgenda` groups items
  by **time and title across pets** ("one photo of four dogs settles the whole
  potty round"). The card shows a badge per pet, and one photo tagged with
  several pets writes **one log per pet** in one batch
  (`logTasksBatch`, `src/components/staff/agenda-group-card.tsx`). So two
  rows called "Matikan lampu" at 21:30 already show as one card. What's
  missing is making them in one go, and finishing them without a photo.
- **Staff always need a photo** for a pet routine: the card's only way to
  finish is the camera, then ticking pets. No plain tick exists.
- **No instructions on routines** (audit item 6): the card says so in a
  comment ("a schedule has no instructions field").
- **Kakak's `add_pet_routine`** (`src/lib/kakak/tools.ts`): one pet, meals or
  potty only, "for 'the dogs', one call per pet".
- **Chores** repeat but have **no time of day for staff**, so 21:30 doesn't
  belong there either; and lights off is about the dogs.
- **Staff push** (141): new or moved tasks, answers, repairs. **"Never
  21.00–06.00 in Jakarta, never reminders"** (header of 141; `staff_push_quiet`
  is hour ≥ 21 or < 6). The privacy policy says the same: "None are sent
  between 9 PM and 6 AM."
- **Evening summary and "couldn't do"** (139): `routine_slots_open(p_day)`
  re-reads `master_schedules` in SQL to find what wasn't done, per schedule
  and pet. A "couldn't do" record stamps the pet from its schedule.
- **Offline saves** (161): a log batch with `photo_url` null is already a
  valid queued job (`offline-queue.ts` strips photos the same way).
- **Export** (141): routines go out as `to_jsonb(ms)`, so new columns are
  included with no change.
- **Who can write routines:** 090's insert, update and delete policies on
  `master_schedules` use `get_user_household_ids()`, which **staff phones
  pass** (AGENTS.md). Every screen that writes routines is an owner screen
  (schedule editor, approvals, medicine alerts, cancel button, Kakak), so a
  staff phone can rewrite or delete routines through the API today. PR A
  closes this (D13).

## The idea in one line

**One "Add routine" sheet: pick what, pick the pets, pick the time. Every day,
no end date, a tick, for anyone, unless you say otherwise.** Saved as one row
per pet with a shared group id, so everything that reads routines today keeps
working.

## Before and after: the owner's two examples

Taps counted from the Pets tab. "Typed" means fields the owner types into
(time and date pickers count as taps).

| | **Lights off, 21:30, Mocha and Matcha, every day** | | **Walk, 07:00, Matcha only, every day** | |
| --- | --- | --- | --- | --- |
| | Before | After | Before | After |
| Possible? | Only until a chosen date | Yes, no end | Only until a chosen date | Yes, no end |
| Owner taps | ~22 (Others card, twice) | **4** | ~11 | **7** |
| Typed fields | 4 (title and end date, per pet) | **0** | 2 | **0** |
| Entries made | 2, separately | **1** (two rows, one group) | 1 | **1** |
| Shows as | An "Others" row (list icon), "Expires 31 Dec" | Light-off icon, no end | Same | Footprints icon, no end |
| Note for staff | Not possible | Optional line | Not possible | Optional line |
| Staff each time | 7 taps and a photo of a dark room | **1 tap** (both pets) | 6 taps and a photo | **1 tap** |

How the "after" numbers add up:

- **Lights off:** Pets → **Add routine** (For: all pets) → **Lights off**
  (suggests 21:30, every day) → **Add for 2 pets**. 4 taps. A household with
  more pets unticks the others (one tap each); another time is about 2 more.
- **Walk:** Pets → **Matcha** → **Add routine** (For: Matcha) → **Walk**
  (suggests 06:30) → time to 07:00 (2) → **Add for Matcha**. 7 taps. A second
  walk in the evening: **Add time** and pick it, about 3 more.
- **Staff:** the card shows "21.30 · Matikan lampu" with Mocha and Matcha
  badges and the note. One tap on the circle logs both, with **Batalkan**
  (Undo) for 5 minutes, as photos have now.

## The sheet (mockup screens 1 and 2)

One bottom sheet, **Add routine** / **Tambah rutinitas**. Only **What** and
**When** matter, and both have defaults from the chip; nothing else is
required (stop rule: no new required field).

| Row | Default | Choices |
| --- | --- | --- |
| **What** | — | Chips: **Walk · Lights off · Play · Fresh water · Brush teeth · Other** (D2). A chip fills the title in Indonesian (staff read it) and suggests a time. **Other** opens a title field. |
| **For** | From the Pets tab: every active pet. From a pet's page: that pet. | Pet chips, several allowed. |
| **When** | The chip's time, **Every day**, no end | **Add time** (several times a day); **Every day · Some days · Once** (pill control; Some days shows Mon–Sun chips); **Ends** (optional, off). |
| **Who** | **Anyone** | A staff chip. Staff still all see the card; it carries the name, as chores do. |
| **Note for staff** | Empty | One line, up to 120 characters, shown as typed on the staff card. |
| **Proof** | **Tick** | **Tick · Photo** (pill control). |
| Button | **Add for 2 pets** / **Add for Matcha** | |

Owners see chip names in their language; the saved title is Indonesian
(Jalan-jalan, Matikan lampu, Ajak main, Ganti air minum, Sikat gigi). A typed
"Other" title is saved as typed, like chore titles.

**Editing:** the routine's row in the pet's **Manage routines** sheet (in the
card that replaces Others, D5) opens the same sheet filled in, for the whole
group. Changing the time, days, note, who or proof updates every row of the
group in place (logs keep pointing at them). Adding a pet adds a row.
Removing a pet, or removing the routine, **ends** a row that has logs
(`expires_at` = yesterday, so its history keeps its title) and deletes a row
that has none.

## Where it lives (D1)

- **Pets tab:** a quiet **Add routine** button above the pets (For: all pets).
- **Each pet's page:** **Add routine** beside **Manage routines** (For: that
  pet), and the same button at the top of the Manage routines sheet.
- No new tab, no new `<SegmentedControl />` on the page; the sheet's two pill
  controls (When, Proof) use the shared component.

## Data shape (D3): one row per pet, a shared group id

**Recommended (A):** keep one `master_schedules` row per pet and add
`routine_group_id`. Every row of a group has the same title, times, days,
note, who and proof.

Why: every reader of routines is per pet and per schedule today, and stays
untouched:

| Path | Effect of A |
| --- | --- |
| Staff Today card | Already one card per time and title, badges per pet. |
| One tick, every pet | `logTasksBatch` already writes one log per pet in one batch. |
| Pet history, photo stream, staff completion strip | Logs are per pet, as now. |
| Evening summary, "couldn't do" (139) | Per schedule and pet, as now. Mocha's lights can be "couldn't do" while Matcha's are done. |
| Offline queue (161) | Same job; photo null is already valid. |
| Export | `to_jsonb(ms)`, new columns included. |

The other shape (B: one routine row linked to several pets) would need a link
table and a change in every path above. Rejected.

The group id is used only by the owner's editor (edit or remove together) and
by Kakak's confirm card. The staff card keeps grouping by time and title, so
two routines the owner made separately with the same title and time still
show as one card, as today.

## Kinds, and what shows as what

A new column, **`kind`**, settles the meal-by-default problem for new rows:

| `kind` | Chip (EN / ID) | Saved title | Icon (lucide) | Suggested time |
| --- | --- | --- | --- | --- |
| `walk` | Walk / Jalan-jalan | Jalan-jalan | Footprints | 06:30 |
| `lights` | Lights off / Matikan lampu | Matikan lampu | LightbulbOff | 21:30 |
| `play` | Play / Ajak main | Ajak main | Bone | 16:00 |
| `water` | Fresh water / Ganti air minum | Ganti air minum | GlassWater | 08:00 |
| `teeth` | Brush teeth / Sikat gigi | Sikat gigi | Sparkles | 19:00 |
| `other` | Other / Lainnya | as typed | List | 08:00 |

- `categorizeSchedule` checks `kind` first: any non-null `kind` is a new
  category **`routine`** (neutral grey tone, as meals and potty). Null `kind`
  keeps today's rules, so no existing row changes.
- `ScheduleCategoryName` (types) gains `routine`. `routine_proposals.category`
  (staff suggestions) is unchanged: staff can't suggest the new kinds yet.

## One tick for all (D4)

- **Tick routines** (proof = tick): the card gets a round button at the
  right. **One tap logs every pet on the card that's still open**, photo
  null, staff id stamped, through the existing save queue. Toast: "Mocha,
  Matcha · Matikan lampu selesai" with **Batalkan** for 5 minutes
  (`UNDO_WINDOW_MS`). Tapping the card itself opens the sheet, where staff
  can tick pets one by one (a walk done for one dog only) or say **Tidak bisa
  dikerjakan** (139), as now.
- **Photo routines** keep today's flow exactly (camera, then pick pets; the
  pick starts empty on purpose).
- If one card mixes the two (same time and title, one row asks for a photo),
  the card asks for a photo.
- No new reading for staff (stop rule): a circle and the note, nothing else.

## What happens to "Others" (D5)

**Recommended (A):** the **Others** card becomes **Other routines** /
**Rutinitas lain**. It lists the pet's routines with a `kind` and its old
"temporary" rows, and its button opens the new sheet. A one-off is **When →
Once** (one date: `created_at` = that day and `expires_at` = that day, the
same trick vet and grooming use). Old temporary rows are untouched and keep
their "Until 12 Nov" line; editing one opens the sheet with **Ends** set. No
data migration.

## Proof (D6)

**Recommended (A):** **Tick** by default for everything made in the new
sheet; **Photo** is one tap. Lights, water and teeth don't need a photo; the
owner who wants walk photos picks Photo. Meals, potty, medicines, vet and
grooming keep their photos (`needs_photo` defaults to true, so every
existing row keeps asking for one).

## Timed reminders for staff (D7) — PR C

The owner asked for routines, not reminders; this is optional. But
"Matikan lampu" at 21:30 is the one that gets forgotten.

**Recommended (A):**

- A switch per routine in the sheet: **Remind staff at this time** /
  **Ingatkan staf di jam ini**. **Off by default.** Thirty routines a day
  buzzing staff phones would be noise, and the owner already hears about
  misses in the evening summary.
- **Only if it isn't done yet**: at the routine's time, if any pet on it is
  still open. One push per phone: "Pengingat · 21.30 · Matikan lampu · Mocha &
  Matcha". To the chosen person, or to everyone with notifications on when
  it's Anyone. A shared phone gets the same text (it's not personal). The
  household switch and each person's switch from 166 apply.
- **Quiet hours:** 166 says nothing between 21:00 and 06:00, which would
  silence the very example. Recommended: **a reminder the owner turned on may
  ring until 22:00** (mornings unchanged: from 06:00). For a time from 22:00
  to 05:59 the switch is greyed with "Too late for a reminder". This changes a decision the owner made in 166,
  so it's an owner question (Q2), and the privacy policy changes with it.
- Built as a 5-minute cron job, `notify_routines_due()`, using 141's
  `queue_staff_push`. Because that function returns early in quiet hours, PR
  C re-creates it with one more argument, the quiet start hour (default 21),
  **dropping the 8-argument version in the same migration** so there are no
  two overloads; 141's triggers keep calling it with 8 arguments. Same
  revoke and grant as 141.

## Kakak (D8) — PR B

**Recommended (A): extend `add_pet_routine`, same name.** Keeping the name
means `kakak_requests.tools`' CHECK (126) doesn't change, so no migration.

New input (strict schema, nullable fields as today):

| Field | |
| --- | --- |
| `pets` | 1–8 pet references (was `pet`, one). "Both dogs" is one call. |
| `kind` | `meal`, `potty`, `walk`, `lights`, `play`, `water`, `teeth`, `other` |
| `times` | 1–12 times, HH:mm |
| `days` | null for every day, or `mon`…`sun` |
| `until` | null, or the last day |
| `title` | Indonesian; required for `other`, else null (the kind's title). For meals, the label as now. |
| `title_en` | English gloss for an English-speaking owner, or null |
| `staff` | S1… or null for anyone |
| `note` | up to 120 characters, or null |

- "Matikan lampu untuk Mocha dan Matcha setiap hari jam 21.30" → one confirm
  card: **Matikan lampu · 21.30 · Setiap hari · Mocha & Matcha**. "Jalan-jalan
  Matcha tiap pagi jam 7" → **Jalan-jalan · 07.00 · Setiap hari · Matcha**.
- Still never saves without the card. Meals and potty behave as now
  (per-pet new-time check, `newPetTimes`); other kinds skip a time the pet
  already has with the same title.
- Proof from Kakak is the kind's default: a photo for meals and potty (as
  now), a tick for the new kinds. The owner changes it in the sheet.
- Updated with it: the prompt's pet line, `validate.ts`, `suggestions.ts`,
  `describe.ts` (the card), `practice.ts`, and eval cases for both of the
  owner's sentences, "Matcha only", weekdays and "until Friday". The schema
  grows by about 150 cached tokens.

## Starter routines when adding a pet (D9) — PR B

After **Add pet** saves a dog or a cat, a short list appears, ticked, for that
pet: the same untick pattern as Phase 172's templates.

- **Dog:** Jalan pagi 06:30, Jalan sore 16:30, Ganti air minum 08:00 (ticked);
  meals and potty stay in their own cards.
- **Cat:** Ganti air minum 08:00, Bersihkan pasir kucing 08:00 (ticked).
- If the household already has a group with a `kind` (say Matikan lampu
  21:30 for Mocha and Matcha), it's offered unticked as **Add Coco to
  Matikan lampu 21:30**, which adds a row to that group.
- **Skip** leaves nothing behind. One catalogue,
  `src/lib/pet-routine-kinds.ts`, used by this list, the sheet's chips and
  Phase 172's A3 setup list.

**Hand-off to Phase 172 (PR #80):** 172 A3 saves "Jalan pagi" and "Jalan
sore" as plain rows with no end date, which today's `categorizeSchedule`
files as meals. If 173 PR A lands first, 172 sets `kind: 'walk'` on them; if
172 lands first, PR A's migration sets `kind = 'walk'` on rows titled exactly
"Jalan pagi" or "Jalan sore" with no `kind` and no `expires_at`.

## Who (D10) and repeats (D11)

- **Who:** Anyone by default; one staff chip. The card shows the name ("Sari")
  like chores. Nobody's view is filtered by it.
- **Repeats:** **Every day · Some days · Once.** Some days are stored as
  ISO weekdays (1 = Monday … 7 = Sunday), read in Jakarta time. Not "every N
  days": brushing teeth every other day is Mon, Wed, Fri, and grooming
  already has its own interval card.

## Database (proposals only; migration 147 reserved)

**147 — any routine, for any pets (PR A):**

- `master_schedules` gains, all nullable or with defaults (no breaking
  change, old app builds keep working):
  - `kind text` with a CHECK of the six kinds (null = old rules);
  - `routine_group_id uuid` (null for every old row);
  - `days_of_week smallint[]` with a CHECK that every value is 1–7 and the
    array isn't empty (null = every day);
  - `note text` with a CHECK of up to 120 characters;
  - `staff_id uuid references staff_profiles(id) on delete set null`;
  - `needs_photo boolean not null default true`.
- Index on `routine_group_id`.
- **Write guard (D13):** replace 090's insert, update and delete policies on
  `master_schedules` with ones that check the pet's household equals
  `caller_admin_household()`. Select stays on `get_user_household_ids()`
  (staff phones read routines). A staff phone can still write `task_logs`.
  A SQL test: a staff (anonymous) session can't insert, update or delete a
  routine; an admin can.
- A trigger checks that `staff_id`, if set, is staff of the pet's household
  and not archived (as 139 does for "couldn't do").
- **`routine_slots_open`** (139, the only version) is re-created to skip a
  day not in `days_of_week`, so the evening summary doesn't count Matcha's
  weekday walk on a Sunday. TypeScript's `isScheduleActiveOn` gets the same
  rule, with unit tests (Jakarta weekday at midnight, null days, Once).
- The Phase 172 walk fix-up above, if 172's rows already exist.
- No new `SECURITY DEFINER` function in 147.

**PR B:** no migration (Kakak and starters are app code).

**PR C — timed reminders (next free number at build time):**
`master_schedules.remind_staff boolean not null default false`;
`notify_routines_due()` (`security definer`, `set search_path = ''`,
`revoke all … from public, anon, authenticated`, `grant execute … to
service_role`); `queue_staff_push` re-created as above; `cron.schedule('notify-
routines-due', '*/5 * * * *', …)`. Tag `routine-<group or row>-<date>-<time>`,
so a rerun replaces rather than repeats.

**Old app builds** (until the PWA updates on next open): ignore `kind` (a new
routine shows with the meal icon), `days_of_week` (shows every day) and
`needs_photo` (asks for a photo). Wrong for a few hours, harmless; noted in
the release.

## Privacy

- **PR A and PR B: no new kind of personal data, no new service, no change
  in where data lives or how long.** A note for staff and a chosen staff
  person on a routine are covered by "Tasks, chores, routines, schedules and
  notes" (policy, both languages). No policy change.
- **PR C changes the policy** (both languages): the staff-notifications line
  (privacy-policy.tsx, "They tell you about…") adds "a reminder at a
  routine's time, if the household turned it on for that routine", and "None
  are sent between 9 PM and 6 AM" becomes "Reminders an admin turned on may
  come until 10 PM; nothing else is sent between 9 PM and 6 AM" if Q2 is A.
  `src/config/legal.ts` (the policy's date) changes with it.

## Tutorials

Per `feature-tutorials`: owners (EN/ID) a 20-second "Add routine" video tip in
the Pets tab; staff, nothing to read (stop rule): the circle explains itself;
at most one What's new card that week.

## Glossary rows (go in with PR A)

| English (owner UI) | Bahasa Indonesia | Why |
| --- | --- | --- |
| Add routine | **Tambah rutinitas** | The sheet and its buttons. "Rutinitas" as in Kelola Rutinitas. |
| Walk · Lights off · Play · Fresh water · Brush teeth · Other | **Jalan-jalan · Matikan lampu · Ajak main · Ganti air minum · Sikat gigi · Lainnya** | Routine chips; also the saved titles staff read. "Ajak main", not "Main" alone, which reads as "play" for the staff themselves. |
| What · For · When · Who | **Apa · Untuk · Kapan · Siapa** | Sheet row labels. |
| Every day · Some days · Once | **Setiap hari · Hari tertentu · Sekali saja** | Repeat choices. |
| Add time · Ends (optional) | **Tambah jam · Berakhir (opsional)** | Owner form, so "opsional". |
| Note for staff | **Catatan untuk staf** | The label; staff see it under **Catatan**. |
| Proof: Tick · Photo | **Bukti: Centang · Foto** | |
| Add for 2 pets / Add for Matcha | **Tambah untuk 2 hewan / Tambah untuk Matcha** | Button. |
| Other routines | **Rutinitas lain** | Replaces Others / Lainnya in Manage routines. |
| Usual routines for Coco | **Rutinitas biasa untuk Coco** | Starter list after adding a pet. |
| Remind staff at this time | **Ingatkan staf di jam ini** | PR C. Push title **Pengingat**, as Phase 164. |

## PRs (D12)

1. **PR A (migration 147):** the sheet, kinds, several pets, no forced end
   date, weekdays, once, note, who, tick proof and one tap for all on staff
   cards, Others becomes Other routines, the write guard, the summary's
   weekdays. Tests: unit (`categorizeSchedule`, `isScheduleActiveOn`), SQL
   (guard, weekdays in `routine_slots_open`), Playwright (both examples
   end to end, staff tick and undo, offline tick).
2. **PR B (no migration):** Kakak's tool and its eval cases; starter routines
   after adding a pet.
3. **PR C (next free migration):** timed reminders, after the owner answers
   Q2; privacy policy update.

Each PR: `tsc`, `next build`, staging first, the owner's OK before
production; the migration on production before the merge.

## Decisions (each with a recommended A)

| # | Decision | A (recommended) | Other options |
| --- | --- | --- | --- |
| D1 | Entry points | Pets tab (all pets) and each pet's page and Manage sheet (that pet) | B: only inside Manage routines. C: Kakak only. |
| D2 | Quick chips | Walk, Lights off, Play, Fresh water, Brush teeth, Other, each with a suggested time | B: a longer list (bath, clean the bed, brush coat). C: no chips, a title field. |
| D3 | Multi-pet data | One row per pet plus `routine_group_id` | B: one row linked to several pets (every log and summary path changes). |
| D4 | One tick for all | Circle logs every open pet on the card; open the card to choose; 5-minute undo | B: always choose pets first. |
| D5 | "Others" | Becomes Other routines using the new sheet; Once for one-offs; old rows untouched | B: keep Others beside the new sheet (two ways to do one thing). |
| D6 | Default proof | Tick for new-sheet routines; Photo one tap away; old rows keep photos | B: photo by default. C: per kind (walk photo). |
| D7 | Timed reminders | Per routine, off by default, only if not done, may ring until 22:00 | B: keep 166's 21:00 quiet start (the 21:30 example never rings). C: on by default. |
| D8 | Kakak | Extend `add_pet_routine` (several pets, any kind, days, until, staff, note) | B: a new tool (needs a migration for 126's CHECK). |
| D9 | Starter routines | Ticked list after adding a dog or cat; offer joining existing groups | B: none. |
| D10 | Who | Anyone by default, optional staff chip, a name on the card | B: no assignee. |
| D11 | Repeats | Every day, Some days, Once | B: also every N days. |
| D12 | PR order | A (sheet and model, 147), B (Kakak and starters), C (reminders) | B: two PRs, Kakak and reminders together (reminders then wait on Q2 and hold Kakak back). |
| D13 | Routine write guard | Close it in 147: only admins write `master_schedules` | B: leave it for a later security pass. |

## Questions only the owner can answer

1. **Who should "Lights off" be for at your house:** both dogs only, or every
   pet? (It decides whether the Pets tab's default of "every pet" is right,
   since production has 4 pets.)
2. **Reminders at 21:30:** may a reminder you switch on ring until 22:00, when
   166 agreed nothing after 21:00? (D7.)
3. **Walk proof:** a tick, or a photo of Matcha out walking?
4. **Starter list for dogs:** are Jalan pagi 06:30, Jalan sore 16:30 and
   Ganti air minum 08:00 the right usual ones?
