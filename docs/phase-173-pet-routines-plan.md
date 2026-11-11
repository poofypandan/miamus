# Phase 173 — Any routine, for any pets, in one easy sheet

Status: **decided: owner chose all A except D6 = photo by default; D14 added
(three photos for walks; owner to confirm A)** (2026-11-11, through the manager). Docs only: no app
code, no migration applied. "147" below is a placeholder for PR A's
migration: numbers are given in build order when the PR is built (rule of
10 Nov).
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
works one pet at a time, makes staff pick each pet after every photo, and
has no place for a note to staff.

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
  missing is making them in one go, and finishing them quickly.
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
no end date, a photo, for anyone, unless you say otherwise.** Saved as one row
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
| Staff each time | 7 taps and a photo | **3 taps and one photo** (both pets) | 6 taps and a photo, no length, gallery photos possible on some phones | **9 taps and three live-camera photos** (gate, park, gate) over the walk; "Jalan-jalan · 32 menit" from server times |
| If the owner sets 1 photo / Tick | — | — / 1 tap | — | 3 taps / 1 tap |

How the "after" numbers add up:

- **Lights off:** Pets → **Add routine** (For: all pets) → **Lights off**
  (suggests 21:30, every day) → **Add for 2 pets**. 4 taps. A household with
  more pets unticks the others (one tap each); another time is about 2 more.
- **Walk:** Pets → **Matcha** → **Add routine** (For: Matcha) → **Walk**
  (suggests 06:30) → time to 07:00 (2) → **Add for Matcha**. 7 taps. A second
  walk in the evening: **Add time** and pick it, about 3 more.
- **Staff, lights off:** the card shows "21.30 · Matikan lampu" with Mocha
  and Matcha badges, the note, and a round camera button. Tap it (1), the
  camera opens straight away; shutter (1) and use photo (1). The photo is
  saved for both dogs, with **Batalkan** (Undo) for 5 minutes. 3 taps, down
  from 7, because there's no pet-picking step.
- **Staff, walk:** the same 3 taps three times: **Mulai** at the gate
  ("Sedang jalan · mulai 07.02" on the card), **Sudah sampai** at the park,
  **Sudah pulang** back at the gate. Miamus records "Jalan-jalan · 32 menit"
  from the server times of the first and last photos (D14). That's 3 more
  taps than today's single photo, spread over the walk, in exchange for
  proof the owner asked for.

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
| **Proof** | **Photo**; for **Walk**, **3 photos** (D14) | **Photo · Tick** (pill control); for Walk and Other, **3 photos · 1 photo · Tick**. Tick is for routines the owner trusts without proof. |
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
| One photo (or tick), every pet | `logTasksBatch` already writes one log per pet in one batch, sharing one photo. |
| Pet history, photo stream, staff completion strip | Logs are per pet, as now. |
| Evening summary, "couldn't do" (139) | Per schedule and pet, as now. Mocha's lights can be "couldn't do" while Matcha's are done. |
| Offline queue (161) | Same job; photo null is already valid. |
| Export | `to_jsonb(ms)`, new columns included. |

The other shape (B: one routine row linked to several pets) would need a link
table and a change in every path above. Rejected.

The group id is used only by the owner's editor (edit or remove together) and
by Kakak's confirm card. The staff card keeps grouping by time and title, so
two routines the owner made separately with the same title and time still
show as one card, as today, **unless their note or person differ**:
`buildAgenda`'s key becomes time, title, note and `staff_id` for rows with a
`kind`, so "Jalan-jalan 07:00" for Matcha with Sari and a note, and for Mocha
with Yanti, stay two cards, each showing its own note and name. Old rows
(no `kind`, no note, no person) group exactly as now.

**Copy schedule to…** (`CopyScheduleDrawer`) lists the columns it copies.
PR A adds `kind`, `days_of_week`, `note`, `staff_id` and `proof`, and
gives the copies a new `routine_group_id` per copied group (copies don't
join the source's group). Without this, a copied walk would become a meal.
The same goes for `CreateScheduleInput`, the mock provider and
`approval-queue.tsx` (approved staff suggestions keep no `kind`, as now).

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

## One photo (or one tap) for all (D4)

Applies to cards whose rows have a `kind` (made in the new sheet). Meals,
potty, medicines, vet and grooming keep today's flow exactly (camera, then
pick pets; the pick starts empty on purpose, because there the photo shows
which dogs ate).

- **Which pets:** every pet on the card that's still open: not done yet, not
  admitted (suspended, as the card already skips), and without an open
  "couldn't do" record for that day (139).
- **Photo routines (the default):** the card has a round **camera** button
  at the right. One tap opens the camera straight away (the existing
  `<label>` file input, as the card's sheet uses today), one photo,
  `compressPhoto`, `enqueuePhoto`, then **saved for every open pet** with no
  pet-picking step. A photo of the switched-off lamp proves the routine, not
  which dog was in frame. Toast: "Mocha, Matcha · Matikan lampu selesai"
  with **Batalkan** for 5 minutes (`UNDO_WINDOW_MS`). Offline, it waits in
  the save queue (161) like any photo.
- **Three-photo walks** (D14): the same button, three times in a row over the
  walk (Mulai, Sudah sampai, Sudah pulang), each saved for every open pet.
- **Tick routines** (when the owner chose Tick): the same button is a
  circle; one tap logs every open pet with photo null.
- **One pet only** (a walk done for one dog): tap the card itself. The
  card's sheet lets staff photograph or tick pets one by one, or say **Tidak
  bisa dikerjakan** (139), as now.
- If one card mixes the two (same time and title, one row asks for a photo),
  the card asks for a photo.
- No new reading for staff (stop rule): a camera button and the note,
  nothing else.

## What happens to "Others" (D5)

**Recommended (A):** the **Others** card becomes **Other routines** /
**Rutinitas lain**. It lists the pet's routines with a `kind` and its old
"temporary" rows, and its button opens the new sheet. A one-off is **When →
Once** (one date: `created_at` = that day and `expires_at` = that day, the
same trick vet and grooming use). Old temporary rows are untouched and keep
their "Until 12 Nov" line; editing one opens the sheet with **Ends** set. No
data migration.

## Proof (D6): decided, photo by default

**Owner's choice (11 Nov): a photo by default for every routine,** lights off
and walks included, "otherwise I wouldn't know they actually did it". The
owner can switch any routine to **Tick** in the sheet. `proof` defaults to
`photo`, so the database default, the sheet's default and every existing row
agree; walks go further, with three photos (D14). To keep it fast, the camera opens straight from the card's button and
one photo covers every pet on the card (D4): 3 taps for lights off, against
7 today.

## Walk proof (D14): three photos, owner to confirm A

The owner asked whether GPS could prove walks while keeping location
private, and then, of a start and end photo only: "they can still fake
this". The answer is three photos from the live camera, with server times,
and no location.

**What a web app (PWA) can and can't do with location:**

- It can read location **only while the page is open in the foreground**.
- An iPhone Home Screen app, and Chrome on Android, **stop when the screen
  locks** (the phone in a pocket on a walk).
- **There's no background tracking without a native app.**
- The **Wake Lock API** can keep the screen on during a walk, at the cost of
  battery and taps from the pocket.
- **Staff location is the staff member's personal data** (UU PDP). Collecting
  it needs a clear purpose, the person's consent, a retention limit and a
  line in the privacy policy, and a route shows where a person was, which is
  more than "did the dog get walked".

| Option | What it is | Location stored | Privacy policy |
| --- | --- | --- | --- |
| **A (recommended)** | **Three photos**: at the gate when leaving, at the place they walked to, at the gate when back. Miamus shows "Jalan-jalan · 32 menit" from the first to the last, and the owner sees all three with their times. | **None** | One added clause (below). |
| B (later) | A, plus an optional distance worked out **on the phone** while the screen is kept on (Wake Lock). Coordinates never leave the phone; only "1,2 km" and the minutes are saved. | None (distance only) | A new line and a consent screen on the staff phone, before first use. |
| C | A stored GPS route. | The route | Not recommended: tracking a worker's movements for a dog walk is out of proportion. |

Later, with a native app (not planned): background distance with the screen
locked.

### The staff flow (A)

One card that stays open between the steps. Each step is the card's camera
button: tap (1), shutter (1), use photo (1).

| Step | Card before the tap | Saved as (`task_logs.sub_type`) | Card after |
| --- | --- | --- | --- |
| 1 | **07.00 · Jalan-jalan** · button **Mulai** | `check_in` | **Sedang jalan · mulai 07.02** · button **Sudah sampai** |
| 2 | button **Sudah sampai** | `arrived` (new value) | **Sudah sampai 07.15** · button **Sudah pulang** |
| 3 | button **Sudah pulang** | `check_out` | Done: **07.02 sampai 07.34 · 32 menit** |

- Each step saves one photo for every open pet on the card (D4), in one
  batch. The steps go in order: **Sudah pulang** appears only after **Sudah
  sampai**.
- **Survives the app closing:** the card's step is worked out from that day's
  logs (`threePhotoState`, beside `vetVisitState` in `staff-agenda.ts`), including
  saves still waiting in the offline queue (161). Close the app at the park,
  open it later, and the card still says **Sudah sampai**. Nothing is kept
  apart from the logs.
- **Cancel:** the card's sheet has **Batalkan jalan-jalan** (with a confirm)
  while a walk is in progress. It deletes that walk's logs and photos for
  those pets (staff phones may already delete logs, 090), and the card goes
  back to **Mulai**. After the end photo there is the usual 5-minute
  **Batalkan**, then the walk is final. **Tidak bisa dikerjakan** (139) stays
  in the sheet for a walk that can't happen.
- **Done means the end photo**, as for a vet visit, for every routine whose
  `proof` is `three` (not every walk: see below). A three-photo routine not
  finished by midnight shows "Mulai 07.02, tanpa foto akhir" to the owner and counts as
  not done in the evening summary.
- **Per routine:** the sheet's **Proof** for a walk is **3 photos · 1 photo ·
  Tick**, with **3 photos** preset. Every other kind is **Photo · Tick**,
  with **Photo** preset (D6). The owner can choose 3 photos for an **Other**
  routine too (say, a trip to the vet shop). **What decides the flow is
  `proof`, never `kind`:** `three` gets the three steps and is done at its
  end photo; `photo` and `tick` are one step and done on their one log, as
  today, so a walk set to 1 photo or Tick finishes normally and an Other
  routine set to 3 photos gets the three steps.

### Multi-pet walks: a follow-up (decided while building PR A, 2026-11-11)

PR A offers **3 photos for one pet only**. A walk for several pets is proven
by **one photo** of them all (the sheet says so: "3 photos is for one pet at
a time. For several pets, one photo covers them all."), and a three-photo
routine is always **one card per pet**, so every walk is its own sequence.
Shared three-photo walks for several pets (one sequence, three photos
covering every dog on the lead) kept producing edge cases in review (a pet
left out of the first walk, per-sequence owner rows, undo across sequences);
they move to a follow-up PR with their own design. The owner's real walk
(Matcha only) is single-pet.

### Anti-faking rules (A)

What Miamus does, and what a browser can and can't promise:

1. **Live camera only, never the gallery.** The button is the card's
   existing `<input type="file" accept="image/*" capture="environment">`.
   On iPhone (Safari and Home Screen apps) and Chrome on Android, `capture`
   opens the camera directly, with no gallery choice. **What browsers don't
   guarantee:** `capture` is a hint. Some Android browsers and file-picker
   apps still offer the gallery, and desktop browsers ignore it.
2. **Reject old files.** Before compressing, the app reads the file's
   `lastModified`. A photo just taken has a time within seconds of now; if
   it's more than **2 minutes** away from the phone's clock, the step is
   refused: "Ambil foto langsung dari kamera." **What this can't guarantee:**
   `lastModified` comes from the phone. iOS may give a gallery photo the
   current time, and a phone with its clock moved can pass. It stops the
   easy case (an old photo from the gallery), not a determined one.
3. **Server time, not phone time.** The minutes and the times the owner
   sees come from a new `task_logs.received_at`, set by the **database**
   when the save arrives (a trigger overwrites whatever the phone sends;
   `task_logs` has no update policy, so it can't be changed later). The
   phone's `completed_at` stays as it is for everything else.
   - **Offline saves:** a step saved without signal reaches the server
     later, so its `received_at` is late. When `received_at` is more than 5
     minutes after `completed_at`, the owner sees the phone time with
     "terkirim 07.50" / "sent 7:50 AM" beside it, and the minutes are marked
     "phone time". The walk isn't refused: weak signal at the park is
     normal.
4. **The owner sees all three photos in one row**, each with its server
   time, on the walk's row in the pet's history and on Today: "Jalan-jalan ·
   32 menit · Yanti" above **07.02 · 07.15 · 07.34**. The middle photo is
   the proof they got somewhere; the times show how long it took. Three
   photos inside a few minutes stand out on their own.

Stronger options, not recommended now: an **in-app camera** (`getUserMedia`,
the camera view drawn inside Miamus) makes the gallery impossible on every
browser, at the cost of a camera permission prompt and more code. Worth it
only if faked walks actually happen. A photo of a photo is still possible
with any method; the owner's row of three is the check.

The camera's own GPS tag never leaves the phone: `compressPhoto`
(`browser-image-compression`, EXIF not preserved) redraws the image before
upload, so EXIF, location included, is dropped.

### "Usually 30 minutes" nudge

Optional, not recommended now. It would need a field in the sheet and a line
for staff to read (two stop rules). The owner's row already shows the
minutes; revisit if walks come back short.

### What else changes for three-photo routines (PR A)

Every rule below keys on `proof = 'three'`, not on `kind = 'walk'`.

- `LogSubType` gains `arrived`. `sub_type` has no CHECK (079), so the
  database needs no constraint change.
- `routine_slots_open` (139) treats a `proof = 'three'` row as done only at
  `check_out`, as it does for `Vet: ` rows. Rows with `photo` or `tick` keep
  the ordinary rule (any log that day).
- **Staff workload** (`staff_workload`, 100, security invoker) counts pet
  logs whose `sub_type` isn't `check_in`. It's re-created to skip `arrived`
  too, so a three-photo routine counts once. Same `grant` as 100.
- `buildAgenda` marks an item done on any log, so cards whose rows have
  `proof = 'three'` use `threePhotoState` (as vet cards use
  `vetVisitState`), and the staff list's "Selesai" rule (`staff-agenda.ts`)
  keeps them in the day until the end photo. Other cards, walks set to 1
  photo or Tick included, are unchanged.
- If one card mixes `three` with another proof (same time and title), the
  card follows `three`, as a mixed tick and photo card asks for a photo
  (D4).
- The photo stream and the 30-day photo clean-up already handle several
  photos per log day; a walk adds two more per pet.

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

**As built (PR C, migration 150, 2026-11-11):** as above, with three
changes found while building. (1) `queue_staff_push` is **not** re-created:
a reminder must show the same text on a shared phone, where 141 shows only
"Untuk Sari", so it has its own small sender (`queue_staff_reminder_push`,
141's phone choice, no 5-minute rule) and 141 stays untouched. (2) The
reminder is per pet: a pet already done, or with a "couldn't do", isn't
named, and the push goes only while one is still open. (3) A person on
leave today: the reminder goes to whoever covers ("reassign"), otherwise to
everyone, as 141 reads leave for chores. A reminder may still go up to 20
minutes after its time if the cron run is late; the cut-off is the routine's
time (before 22:00), not the moment it is sent. The staff card's quiet-hours
line now reads "Tidak ada notifikasi pukul 22.00–06.00", true either way.

## "Tell us if it's not done" for owners (D15) — PR C

The owner asked on 11 Nov: "tell us if it's not done", for lights off at
21:30, medicines, locking up.

**Decided (owner, 11 Nov):**

- A second switch per routine in the sheet: **Tell us if it's not done** /
  **Kabari kami jika belum dikerjakan**. **Off by default.**
- If a pet on the routine is still open **30 minutes after its time** (not
  done, no "couldn't do" for that pet), **every owner with notifications
  on** gets one push, in their own language:
  "Lights off · Mocha & Matcha" / "Not done yet (9:30 PM)";
  "Matikan lampu · Mocha & Matcha" / "Belum dikerjakan (21.30)". (Owner
  pushes write English times as 9:30 PM, as every other owner push does.)
- **Once per occurrence**, never repeated; nothing if it was done or a
  "couldn't do" landed first. Pets already done aren't named.
- **Quiet hours:** owners have no quiet hours of their own yet, so 166's
  apply (21:00–06:00), stretched to **22:30** for an alert about a routine at
  22:00 or earlier. So the routine's time must be 05:30 to 22:00; otherwise
  the switch is greyed ("Too late for an alert"). If owners get their own
  quiet hours later, the job should read them instead.
- Built in the same 5-minute job as D7 (`notify_routines_due`), with the same
  sent-log (`routine_push_sent`), so nothing doubles across retries or an
  overlapping run. Routines only for now; a chore with a time could use the
  same job later (its slots would come from `chore_days_open` instead of
  `routine_slots_open`).
- Privacy: the admins' notifications line adds it (both languages).

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
- Proof from Kakak is the kind's default: 3 photos for a walk, a photo for
  everything else (D6, D14). The owner can change it in the sheet afterwards.
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
  - `days_of_week smallint[]` with `check (days_of_week is null or
    (days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[] and
    cardinality(days_of_week) > 0))` (null = every day; a CHECK can't hold
    a subquery, so no `unnest`);
  - `note text` with a CHECK of up to 120 characters;
  - `staff_id uuid references staff_profiles(id) on delete set null`;
  - `proof text not null default 'photo'` with `check (proof in ('photo',
    'tick', 'three'))`: every existing row stays `photo`; the sheet saves
    `three` for a walk unless the owner changes it (D6, D14).
- `task_logs` gains **`received_at timestamptz`**, added with no default so
  old rows stay null, then `set default now()`, plus a `before insert`
  trigger that sets `new.received_at := now()` whatever the phone sends
  (D14 rule 3). `task_logs` has no update policy (090), so it can't be
  changed afterwards. The trigger function is `security invoker` and
  `set search_path = ''`; `revoke all … from public, anon, authenticated`
  (only the trigger calls it).
- Index on `routine_group_id`.
- **Write guard (D13):** replace 090's insert, update and delete policies on
  `master_schedules` with ones that check the pet's household equals
  `caller_admin_household()`. Select stays on `get_user_household_ids()`
  (staff phones read routines). A staff phone can still write `task_logs`.
  A SQL test: a staff (anonymous) session can't insert, update or delete a
  routine; an admin can.
- A trigger checks that `staff_id`, if set, is staff of the pet's household
  and not archived (as 139 does for "couldn't do").
- **Archiving a person releases their routines**, as 118 does for repeating
  chores: staff are archived, not deleted, so `on delete set null` never
  fires. `archive_staff_profile`, re-created from its latest version (119),
  also sets
  `master_schedules.staff_id = null` for that person, plus a one-time
  backfill for anyone already archived (none can hold a routine yet, so it
  is a no-op today). Otherwise the card would keep an archived name and PR
  C's reminder would go to nobody.
- **`routine_slots_open`** (139, the only version) is re-created to skip a
  day not in `days_of_week`, so the evening summary doesn't count Matcha's
  weekday walk on a Sunday, and to count a `proof = 'three'` row as done
  only at its end photo (`check_out`, D14), as it already does for vet
  visits; `photo` and `tick` rows keep the ordinary rule.
  TypeScript's `isScheduleActiveOn` gets the weekday rule, with unit tests
  (Jakarta weekday at midnight, null days, Once).
- **`staff_workload`** (100, the only version, `security invoker`) is
  re-created to skip `arrived` as well as `check_in`, so a three-photo walk
  counts once. Same `grant execute … to authenticated` as 100.
- The Phase 172 walk fix-up above, if 172's rows already exist.
- No new `SECURITY DEFINER` function in 147. The one replaced,
  `archive_staff_profile`, repeats 119's `revoke all … from public, anon` and
  its `grant execute … to authenticated` in the same migration (AGENTS.md);
  it keeps its own admin check.

**PR B:** no migration (Kakak and starters are app code).

**PR C — timed reminders (built as migration 150; see D7 "As built" and D15):**
`master_schedules.remind_staff boolean not null default false`;
`notify_routines_due()` (`security definer`, `set search_path = ''`,
`revoke all … from public, anon, authenticated`, `grant execute … to
service_role`); `queue_staff_push` re-created as above; `cron.schedule('notify-
routines-due', '*/5 * * * *', …)`. Tag `routine-<group or row>-<date>-<time>`,
so a rerun replaces rather than repeats.

**Old app builds** (until the PWA updates on next open): ignore `kind` (a new
routine shows with the meal icon), `days_of_week` (shows every day),
`proof` (a Tick routine asks for a photo) and walk steps (the first photo
finishes the card; an `arrived` or `check_out` log reads as an extra photo). Wrong for a few hours, harmless; noted in
the release.

## Privacy

- **PR A and PR B: no new service, no change in how long data is kept.** A
  note for staff and a chosen staff person on a routine are covered by
  "Tasks, chores, routines, schedules and notes" (policy, both languages).
- **Walk photos (D14 A) are taken outside the home.** They may show the
  street or park, passers-by and the staff member. They're "chore and
  routine proof photos", deleted after 30 days like the others, and only the
  household sees them. **No location is read or stored**: no GPS, and
  `compressPhoto` drops the photo's EXIF (location included) before upload.
  `received_at` is a save time, as `completed_at` already is. **PR A adds
  one clause to the policy** (both languages), in the routines and photos
  lines: "Walk photos are taken where the walk goes, so they may show a
  public place and the staff member; Miamus doesn't record location." It
  also updates the policy date in `src/config/legal.ts`.
- **D14 B, if ever chosen, changes the policy** (both languages): that a
  staff phone may measure a walk's distance while the screen is on, that the
  location stays on the phone and only the distance and minutes are saved,
  and that it's off until the staff member agrees on their phone.
- **PR C changes the policy** (both languages): the staff-notifications line
  (privacy-policy.tsx, "They tell you about…") adds "a reminder at a
  routine's time, if the household turned it on for that routine", and "None
  are sent between 9 PM and 6 AM" becomes "Reminders an admin turned on may
  come until 10 PM; nothing else is sent between 9 PM and 6 AM" (D7 A, chosen).
  `src/config/legal.ts` (the policy's date) changes with it.

## Tutorials

Per `feature-tutorials`: owners (EN/ID) a 20-second "Add routine" video tip in
the Pets tab; staff, nothing to read (stop rule): the camera button explains
itself, and the walk card's button names the next step (Mulai, Sudah
sampai, Sudah pulang);
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
| Proof: Photo · Tick / 3 photos · 1 photo · Tick | **Bukti: Foto · Centang / 3 foto · 1 foto · Centang** | Photo first: the default (D6). 3 photos for walks (D14). |
| Start · Got there · Back home (walk steps, staff buttons) | **Mulai · Sudah sampai · Sudah pulang** | D14. Short verbs, no reading. |
| Cancel the walk | **Batalkan jalan-jalan** | D14, while a walk is in progress. Glossary: Undo is Batalkan. |
| Take the photo straight from the camera. | **Ambil foto langsung dari kamera.** | D14: a gallery or old photo was refused. |
| sent 7:50 AM | **terkirim 07.50** | D14: a step saved offline reached the server later. |
| Walking · started 07.02 / Got there 07.15 (staff card) | **Sedang jalan · mulai 07.02** / **Sudah sampai 07.15** | D14: between the walk's steps. |
| Walk · 32 min (owner) | **Jalan-jalan · 32 menit** | D14: from the first and last photos' server times. |
| Started 07.02, no end photo | **Mulai 07.02, tanpa foto akhir** | D14: a walk not finished by midnight. |
| Add for 2 pets / Add for Matcha | **Tambah untuk 2 hewan / Tambah untuk Matcha** | Button. |
| Other routines | **Rutinitas lain** | Replaces Others / Lainnya in Manage routines. |
| Usual routines for Coco | **Rutinitas biasa untuk Coco** | Starter list after adding a pet. |
| Remind staff at this time | **Ingatkan staf di jam ini** | PR C. Push title **Pengingat**, as Phase 164. |

## PRs (D12)

1. **PR A (migration 147):** the sheet, kinds, several pets, no forced end
   date, weekdays, once, note, who, photo proof by default (Tick
   optional), one photo or tap for every pet on a staff card, the
   three-photo walk with live-camera checks, server times and minutes
   (D14 A), Others becomes Other routines, the write guard, the summary's
   weekdays and walks, the privacy clause. Tests: unit
   (`categorizeSchedule`, `isScheduleActiveOn`, `threePhotoState`, walk minutes
   from `received_at`, the 2-minute file check), SQL (guard, weekdays and
   `proof` in `routine_slots_open` (a three-photo row done only at
   `check_out`; a walk set to 1 photo done on its one log; an Other set to
   3 photos needs all three), `received_at` can't be set by the phone,
   `staff_workload` counts a walk once), Playwright (both examples end to
   end, staff photo and undo, the three walk steps, closing the app mid-walk,
   cancel, an offline step, Tick).
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
| D4 | One photo (or tick) for all | The card's button: one photo (or one tap, for Tick) saved for every open pet; open the card to do one pet; 5-minute undo | B: always choose pets first, as for meals. |
| D5 | "Others" | Becomes Other routines using the new sheet; Once for one-offs; old rows untouched | B: keep Others beside the new sheet (two ways to do one thing). |
| D6 | Default proof | **Decided (owner): photo by default for every routine**; Tick one tap away in the sheet | (Was A: tick by default. Not chosen.) |
| D7 | Timed reminders | Per routine, off by default, only if not done, may ring until 22:00 | B: keep 166's 21:00 quiet start (the 21:30 example never rings). C: on by default. |
| D8 | Kakak | Extend `add_pet_routine` (several pets, any kind, days, until, staff, note) | B: a new tool (needs a migration for 126's CHECK). |
| D9 | Starter routines | Ticked list after adding a dog or cat; offer joining existing groups | B: none. |
| D10 | Who | Anyone by default, optional staff chip, a name on the card | B: no assignee. |
| D11 | Repeats | Every day, Some days, Once | B: also every N days. |
| D12 | PR order | A (sheet and model, 147), B (Kakak and starters), C (reminders) | B: two PRs, Kakak and reminders together (reminders then wait on Q2 and hold Kakak back). |
| D13 | Routine write guard | Close it in 147: only admins write `master_schedules` | B: leave it for a later security pass. |
| D14 | Walk proof | Three live-camera photos (gate, park, gate), server times, minutes, the owner's row of three; no location; per routine (walks preset to 3, others 1) | B (later): A plus an on-phone distance with Wake Lock (consent, policy line). C: stored GPS route (not recommended). Later: background distance with a native app; an in-app camera if faking persists. |
| D15 | Owner alert if not done | **Decided (owner, 11 Nov):** per routine, off by default, every owner, 30 minutes after its time, once, cancelled by done or couldn't-do; until 22:30 for a routine at 22:00 or earlier | B: also chores with a time (later, same job). C: repeat until done (not chosen: noise). |

## Questions only the owner can answer

1. **Who should "Lights off" be for at your house:** both dogs only, or every
   pet? (It decides whether the Pets tab's default of "every pet" is right,
   since production has 4 pets.)
2. **Walk proof (D14):** three photos (gate, park, gate) with the minutes,
   and no location (A)? (Reminders until 22:00 were settled by choosing D7 A; D6 is
   photo.)
3. **Starter list for dogs:** are Jalan pagi 06:30, Jalan sore 16:30 and
   Ganti air minum 08:00 the right usual ones?
