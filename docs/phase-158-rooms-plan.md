# Phase 158 — Rooms and floors for chores

Status: **plan, waiting for the owner's decisions** (D1–D5 below). Nothing is
built yet. Mockups: `docs/mockups/phase-158-rooms.html` (open in a browser,
phone width).

## The problem

The owner's wife can't see **which rooms get vacuumed (or mopped, or dusted),
on which days, and which don't**. The Chores tab only answers "what's due on
this day?", and the room is a small tag on each card.

What production holds today (one household, read 2026-11-09, counts only):

- **21 rooms, all named floor-first**: "LT1 …" (1), "LT2 …" (15), "LT3 …" (5).
  Two of them are a whole floor ("LT2", "LT3"). Some are parts of one room
  ("GB2 Bathroom Toilet", "GB2 Bathroom Wastafel").
- **206 chores**: 42 weekly, 1 monthly, 163 one-off. 120 have a room.
- **78 older chores carry the room in the title instead** ("LT2 Playroom -
  Vacuum & pel, dusting plafon"), from before rooms existed (Phase 135).
- **Most chores bundle several jobs** ("Vacuum & pel, dusting plafon"),
  so "which rooms are vacuumed" can't be answered by matching whole titles.
- There's no screen to rename, sort or delete a room; rooms are only created
  from the chore form (`location-combobox.tsx`).
- Staff cards already show the room tag (`src/app/staff/page.tsx`).

## The idea in one line

Keep Chores as it is, and add a second way to look at the same chores:
**by floor and room**, with one-tap job filters (Vacuum, Mop, Dust…) that
show at a glance which rooms have that job and which don't.

## What changes for people

| Where | Before | After |
| --- | --- | --- |
| Chores tab (owners) | the day's list | pill switch **Today · Rooms** (Indonesian **Hari ini · Ruangan**); opens on Today, which is unchanged |
| Rooms view | — | floors as sections, rooms inside; job chips on top; "Vacuum: 9 of 19 rooms" |
| A room | a tag on cards | tap it: everything set up there, grouped by job, and **Add chore here** |
| Chore form | "Location (optional)", one place, free text | "Room (optional)", picked by floor ("LT2 · Lounge"), or a **whole floor**; when adding, **several rooms at once** |
| Chore form, after a room | — | **Spot (optional)**: the part of the room, e.g. Sink in GB2 Bathroom (see "Spots inside a room") |
| Household tab | — | **Rooms / Ruangan** page: floors and rooms, rename, move, reorder, delete |
| Staff phones | room tag on each card | the tag shows the floor too ("LT2 · Lounge"); otherwise unchanged (D3) |
| Kakak (after PR #26) | knows room names | knows floors too: "vacuum all the LT2 bedrooms every Monday" |

Still five tabs. Manual-first: nothing here needs AI.

## The screens (mockups 1–5)

1. **Rooms view.** Job chips across the top, built from the household's own
   chores (only jobs that appear at least once): **All · Vacuum · Mop · Sweep
   · Dust · Toilet · Sheets · Towels · Trash · Tidy…**. Below, one section per
   floor in floor order, then **No floor yet**, then a quiet line "12 chores
   have no room" that opens them. In each floor section, first the
   **whole-floor** chores, then each room:
   - **All selected:** the room's name, then its jobs as small chips with
     their days ("Vacuum · Mon Thu", "Towels · daily").
   - **A job selected (say Vacuum):** each room shows a tick and the days,
     who does it ("✓ Mon, Thu · Ari"), or a quiet **No vacuum yet** with an
     **Add** button. The section header counts it: "LT2 · Vacuum in 9 of 13".
     Rooms without it are not red: an empty room may not need vacuuming
     (a shower, a store room).
2. **Tap a room.** A sheet with the room's chores grouped by job: repeating
   ones first ("Every Monday · Ari"), then upcoming one-offs ("Sat 14 Nov").
   Tap a chore to open the usual editor. **Add chore here** opens the editor
   with the room filled in.
3. **Chore form.** The room picker lists rooms under their floor and offers
   "Whole floor" per floor. When adding (not editing), **+ More rooms** lets
   you tick several rooms: one chore is made per room, so staff tick each room
   off, with its own photo, and the Rooms view stays exact. Up to 12 rooms in
   one go.
4. **Sort your rooms into floors** (one-time card in the Rooms view, owners
   only). Shown when room names start with a floor ("LT2 …", "Lantai 2 …",
   "Lt.2 …"). It previews the split: "LT2 Lounge → floor **LT2**, room
   **Lounge**"; rooms already named just "LT2" become that floor, so their
   chores become whole-floor chores. Optional tick (D4): also link the older
   chores whose title starts with a room's name. One button, **Sort rooms**,
   then **Undo** for a few seconds. Skippable; the Rooms page can do the same
   by hand.
5. **Rooms page** (Household tab). Floors in order, each with its rooms.
   Add a floor, add a room, rename, move a room to another floor, reorder with
   up/down, delete (says how many chores lose their room; the chores stay).

## Spots inside a room (PR B)

Some chores are for one thing in a room, not the whole room: wipe the
**sink** in the bathroom, descale the **shower**, clean the **AC filter**.
Today the household works around it by making each thing a room
("GB2 Bathroom Toilet", "GB2 Bathroom Wastafel").

- **Two place levels, plus an optional spot on the chore.** A spot is a
  short name inside the room (Sink / Wastafel, Toilet, Shower, Mirror /
  Cermin, AC, Wall / Dinding). It's a field on the chore (and later on a
  repair, Phase 159), not a third level of places: a third level would make
  every picker deeper, for something only some rooms need.
- **Picking one:** once a room is chosen, the form shows **Spot (optional)**
  as chips: the spots already used in that room, plus "+ New spot". Matched
  case-insensitively, so "wastafel" and "Wastafel" are one spot. Up to 40
  characters.
- **Showing it:** the room tag reads "LT2 · GB2 Bathroom · Sink" (owners and
  staff); the room sheet groups chores by spot ("Sink: wipe · daily").
  Without a spot, a chore is for the whole room, as today.
- **Merging the workaround rooms (D6):** "Sort rooms" also spots rooms on the
  same floor that share a name start ("GB2 Bathroom Toilet", "GB2 Bathroom
  Wastafel") and offers to make them one room, **GB2 Bathroom**, with spots
  **Toilet** and **Wastafel**. Their chores move to the one room with the
  spot set. Previewed first, optional, with Undo; one transaction through
  `organise_rooms`.
- **Recognised from the words, as a fallback:** a chore with no spot whose
  title names one ("lap keran tempat cuci tangan" → Sink) is shown under that
  spot in the room sheet, using the same word-list approach as jobs. It's
  only for display; nothing is written.

## How jobs are recognised (D2)

No new field on chores. A small, tested word list in both languages and common
spellings, `src/lib/chore-jobs.ts`, finds the jobs in a title (and notes):

| Job (EN / ID) | Words it matches (examples) |
| --- | --- |
| Vacuum / Vakum | vacuum, vacum, vakum, vaccum, sedot debu |
| Mop / Pel | pel, ngepel, mop |
| Sweep / Sapu | sapu, nyapu, sweep |
| Dust / Lap debu | dusting, debu, lap debu, lap ambalan, lap meja |
| Toilet / Toilet | toilet, wc, kloset |
| Sheets / Seprai | seprai, seprei, sprei, sheets |
| Towels / Handuk | handuk, towel |
| Trash / Sampah | sampah, trash, garbage |
| Tidy / Rapikan | rapihkan, rapikan, tidy, beresin |
| Ironing / Setrika | setrika, ironing |
| Windows / Kaca | kaca, jendela, window |
| Plants / Tanaman | siram, tanaman, plants |

One chore can have several jobs ("Vacuum & pel, dusting plafon" = Vacuum,
Mop, Dust). **Longest phrase first, and a matched phrase is used up**:
"sedot debu" is read as Vacuum before the single word "debu" is looked at,
so "sedot debu karpet" is Vacuum only, never Vacuum and Dust. Words match
whole words, not parts of words. A chore with none of these words still shows
in its room under "Other". The list grows as households use new words; unit
tests run it over the real title patterns above, including "sedot debu
karpet" (Vacuum only) and "Vacuum & pel, dusting plafon" (Vacuum, Mop, Dust).

## Which chores count as "set up in a room"

- Repeating chores (weekly, monthly, daily) whose repeat hasn't ended.
- One-off chores that aren't done yet and are due today or later.
- Not counted: finished one-offs and overdue ones (those stay in Today).
- "Last done 9 days ago" per room: **later**, not in this phase (it needs the
  completion history the app doesn't load for the Rooms view yet).

## The database — migration 128 (PR B only)

Additive. `household_locations` (migration 105) gains:

| Column | |
| --- | --- |
| `kind` | `'room'` (default) or `'floor'` |
| `parent_id` | nullable; the floor a room is on. Composite FK `(parent_id, household_id)` → `(id, household_id)`, `on delete set null (parent_id)`: deleting a floor moves its rooms to "No floor yet", never deletes them |
| `sort_order` | `int not null default 0`; then natural name order |

- **Two levels only**, enforced by a trigger (`security invoker`,
  `search_path = ''`): a floor has no parent; a room's parent must be a
  floor; a floor that has rooms can't become a room.
- **Floors are places too**: a chore can point at a floor (whole floor);
  `location_id` stays as it is.
- **`household_tasks.spot`**: nullable text, 1–40 characters after trimming
  (CHECK), the part of the room. Additive; every existing chore keeps
  `null` (the whole room). Same rules as the rest of the chore: owners set it,
  staff phones only read it.
- **Names unique per floor**, not per household: "LT1 Service Area" and
  "LT2 Service Area" both become "Service Area". The 105 index is replaced by
  `unique nulls not distinct (household_id, parent_id, lower(btrim(name)))`.
  So everywhere a room is shown alone, it's shown with its floor.
- **Deleting a floor never fails on a name clash.** Its rooms move to "No
  floor yet", where a room of the same name may already exist (or arrive from
  another deleted floor). A `before delete` trigger on floors detaches the
  rooms itself first; a room whose name is already taken among rooms with no
  floor gets its floor back in front ("Service Area" → "LT2 Service Area"),
  then a number if even that is taken ("LT2 Service Area 2"). **Within the
  60-character limit** (105's check): the prefix and the number are kept and
  the room's own name is shortened to fit (`left(name, 60 - prefix - suffix)`,
  trimmed), so a 60-character name still renames cleanly. The FK's `set null`
  stays as a backstop. The delete screen lists any room that will be renamed.
- **Moving or renaming a room onto a taken name** is refused by the index;
  the app says "There's already a room called Lounge on LT2" and saves
  nothing.
- **Sorting rooms into floors in one step**: `organise_rooms(p_plan jsonb)`,
  `security invoker` (RLS still applies), owner-only through
  `caller_admin_household()`, one transaction: create floors, set
  `parent_id`/`name`, and for D4 set `location_id` (and the trimmed title) on
  the listed chores, and for D6 merge rooms (move their chores to the kept
  room with `spot` set, then delete the emptied rooms). Revoked from
  `public, anon`, granted to `authenticated`. Undo calls it with the reverse
  plan (re-creating merged rooms under their old ids).
- RLS unchanged: everyone in the household reads rooms; only owners
  (`household_members`) write them (105's policies cover the new columns).
- Tests: `supabase/tests/128_rooms_floors.sql` (rolled back): two levels
  enforced; cross-household parents refused; deleting a floor keeps its rooms
  and their chores; deleting a floor whose room clashes with a room with no
  floor renames it and succeeds; deleting two floors in turn that both have
  "Service Area" succeeds with two distinct names; a clashing room with a
  60-character name renames within 60 characters; `spot` length and blank
  checks; merging two rooms moves their chores and sets the spot; staff phones and other households can't write;
  logged-out callers get nothing; `organise_rooms` refuses non-admins and
  other households' ids; grants checked.
- Applied: local first, then staging, then production with the owner's OK,
  before PR B merges.

**Privacy**: no new kind of personal data, no new service, no change in where
data lives or how long. The privacy policy doesn't change. (Checked against
AGENTS.md; reviewers please confirm.)

## Two PRs

**PR A: the Rooms view, no database change** (small; helps her straight away)

- `?chores=rooms` in the URL drives the pill (State Persistence rule); the
  shared `SegmentedControl`.
- Floors **read from the room names** for now (`LT2 …` → section LT2), using
  the same parser PR B's "Sort rooms" uses. Households with other names see
  one list of rooms.
- Job chips, room rows, the room sheet, **Add chore here**.
- Unit tests (`chore-jobs`, the name parser, "set up" rules); a Playwright
  test on the stub: open Rooms, tap Vacuum, see a room with and without it,
  add one from **Add**.

**PR B: floors for real** (migration 128)

- Migration 128 and its SQL tests; `organise_rooms`.
- "Sort your rooms into floors" card, the Rooms page, the grouped room picker,
  whole-floor chores, several rooms at once.
- The room tag shows "Floor · Room" everywhere (owner and staff).
- Kakak's household context (`src/lib/kakak/context.ts`, after #26 merges)
  labels rooms with their floor, and a new room can name its floor.
- Glossary rows; both languages for every owner string; staff text
  Indonesian only.

## Decisions for the owner

- **D1 — How floors are kept.** **A (recommended):** a floor is a place too,
  rooms sit under it, and a chore can be for a whole floor; your existing
  "LT2"/"LT3" rooms become those floors. B: a plain floor label on each room
  (no whole-floor chores).
- **D2 — How jobs are found.** **A (recommended):** recognised from the
  chore's words (the table above); nothing new to fill in. B: pick the
  job(s) on every chore (exact, but one more field each time).
- **D3 — Staff phones.** **A (recommended):** just "Floor · Room" on the tag;
  their list keeps its time order. B: group their list by floor and room
  (walking order), a bigger change to how they work.
- **D4 — The 78 older chores with the room in the title.** **A
  (recommended):** when sorting rooms, offer to link the repeating and
  upcoming ones to their room and trim the room from the title (finished
  history untouched; previewed first; Undo). B: leave them as they are.
- **D5 — Floor names.** **A (recommended):** keep what you typed ("LT2");
  rename any time on the Rooms page. B: rename to "Lantai 2" while sorting.
- **D6 — Rooms that are really one room's parts** ("GB2 Bathroom Toilet",
  "GB2 Bathroom Wastafel"). **A (recommended):** offer to merge them into one
  room with spots (Toilet, Wastafel) while sorting; previewed, Undo. B: keep
  them as separate rooms; spots are still there for new chores.

## Glossary rows to add (before any Indonesian text)

| English | Bahasa Indonesia |
| --- | --- |
| Rooms (pill, page) | **Ruangan** |
| Room (optional) | **Ruangan (opsional)** (replaces "Lokasi (opsional)") |
| Floor | **Lantai** |
| Whole floor | **Seluruh lantai** |
| No floor yet | **Belum ada lantai** |
| Sort your rooms into floors | **Kelompokkan ruangan per lantai** |
| Add chore here | **Tambah tugas di sini** |
| No vacuum yet | **Belum ada vakum** (pattern: "Belum ada {job}") |
| Job names | as in the jobs table |
| Spot (optional) | **Bagian (opsional)** |
| New spot | **Bagian baru** |
| Sink / Mirror / Wall | **Wastafel / Cermin / Dinding** |

## Tutorial (shown once, per role)

A small **What's new** card, the first time each person opens the app after
the update. Dismissible; re-openable later from the Household tab. PR A builds
the card once so later features reuse it.

**Owners** (English or Bahasa Indonesia, their choice), PR A:

1. "Chores now has **Rooms**: tap it to see every room and what's set up
   there." / "Tugas sekarang punya **Ruangan**: ketuk untuk melihat setiap
   ruangan dan tugasnya."
2. "Tap **Vacuum** (or Mop, Dust…) to see which rooms have it and which
   don't." / "Ketuk **Vakum** (atau Pel, Lap debu…) untuk melihat ruangan
   mana yang sudah dan belum."
3. "Tap **Add** next to a room to set it up there." / "Ketuk **Tambah** di
   samping ruangan untuk menambahkannya."

PR B adds: "Sort your rooms into floors once, pick several rooms when you
add a chore, and pick a spot (like the sink) when a chore is for one thing in
a room."

**Staff** (Bahasa Indonesia only): nothing in PR A changes their screens, so
no card. PR B, one line: "Nama ruangan sekarang ada lantai dan bagiannya,
misalnya **LT2 · GB2 Bathroom · Wastafel**: kerjakan bagian itu saja."

## Next: repairs (Phase 159, its own plan)

Floors and rooms are household places, not only for chores: the next phase
uses them for repairs. Not built here, but migration 128 must not get in its
way. In short:

- Anyone can **report a problem** in a room ("LT3 · Music Room: wall
  cracked"), with a photo. Owners' reports go straight in; staff reports wait
  for an owner to accept, like staff routine proposals today.
- A repair is a chore in the existing **Maintenance / Perbaikan** category,
  with who fixes it (a staff member or an outside repair person) and when.
- Staff take **before and after photos** while the repair person works,
  using the photo steps chores already have.
- Each room keeps its **repair history**, with photos, in the room sheet.
- Repair photos are evidence, so they need longer retention than chore
  photos: that's a privacy policy change, in Phase 159.

## When

1. Merge what's open (#20–#26). Migrations 126/127 are already on staging and
   production (2026-11-09).
2. **PR A** next: the first new feature after the merges.
3. **PR B** after the owner uses PR A for a few days, so the floors, the
   jobs list and the picker follow what she actually needs.
4. Kakak's go-live (key, eval) runs in parallel; it doesn't depend on this.

## Not in this phase

- "Last done" per room, and cleaning gaps ("not vacuumed for 10 days").
- A third level (floor → room → area).
- Rooms for food or supplies (the Kitchen keeps Fridge, Freezer, Cupboard,
  Counter).
- Staff list grouped by room (D3 B), unless chosen.
- Repairs (Phase 159, above).
