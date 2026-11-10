# Phase 168 — Rooms inside rooms (suites)

Status: **plan for the owner's decision.** Plan and mockup only; no app code.
Mockups: `docs/mockups/phase-168-suites.html` (open in a browser, phone
width). Builds on Phase 158 (`docs/phase-158-rooms-plan.md`, migration 129)
and Phase 159 (repairs, migration 130). Migration **142** would be next
(139 couldn't-do, 140 staff push, 141 staff pay are reserved).

## The problem

The owner's words: "in LT2, there are 3 bedrooms: 1 master bedroom, 2 guest
bedrooms (GB1, GB2), and these rooms have their own bathrooms, etc. How to
best segment these up?"

Today a place is **floor → room**, and a chore can name a **spot** inside the
room (free text: "Wastafel"). A bedroom's bathroom has nowhere to sit except
next to the bedroom, so households type it out:

- "GB2 Bathroom" as its own room on LT2, beside "GB2";
- before floors were sorted, "LT2 GB2 Bathroom Toilet" (floor, bedroom,
  bathroom and spot in one name). Phase 158's "Sort rooms" turns that into
  floor **LT2**, room **GB2 Bathroom**, spot **Toilet**.

That works, but the LT2 list is long and flat (Master Bedroom, Master
Bathroom, Walk-in closet, GB1, GB1 Bathroom, GB2, GB2 Bathroom, Lounge…),
the bedroom's name is typed into every room that belongs to it, and nothing
tells the app that GB2 Bathroom belongs to GB2.

## The idea in one line

**A room can have rooms inside it, one level deep**: Master Bedroom holds
its Bathroom and Walk-in closet; GB1 holds its Bathroom. So a place is
**floor → room → room inside → spot**, never deeper. Optional: a house with
no suites sees no change.

## What exists today (studied for this plan)

| Piece | Where | What it assumes |
| --- | --- | --- |
| Places | `household_locations` (105, 129): `kind` room/floor, `parent_id`, `sort_order` | a room's parent is a floor or nothing |
| Two-levels trigger | `household_locations_two_levels()` (129) | refuses any parent that isn't a floor |
| Names | unique index `(household_id, parent_id, lower(btrim(name))) nulls not distinct` (129) | unique per parent, so per floor today |
| Deleting a floor | `household_locations_release_floor()` (129) | moves rooms to "No floor yet", renames clashes ("LT2 Service Area") |
| Index | `household_locations_parent_household_idx (parent_id, household_id)` (134) | serves "places under this place" |
| Sort into floors | `organise_rooms(jsonb)` (129), `src/lib/organise-rooms.ts` | parses "LT2 …", merges "GB2 Bathroom Toilet" into "GB2 Bathroom" + spot (D6), one transaction with Undo |
| Rooms view | `src/lib/rooms-view.ts`, `src/components/chores/rooms-view.tsx` | rooms are `parent_id === floor.id`; anything else is "No floor yet" |
| Job chips | `placesWithJob`, `allRoomRows` | every room row counts once, plus whole floors with the job |
| Room picker | `src/lib/room-picker.ts` `placeGroups`, `location-combobox.tsx` | floor, "Whole floor", its rooms; label "LT2 · Lounge" |
| Repairs | `repairs.location_id` (130), `room-select.tsx`, `room-repairs.tsx`, `repair_place_label()` | label is "Floor · Room · Spot", one parent up |
| Room names on cards | `useLocationName()` (`src/hooks/use-household-locations.ts`), `location-tag.tsx` | "LT2 · GB2 Bathroom · Wastafel", one parent up; wraps on cards |
| Rooms page | `src/components/dashboard/rooms-manager.tsx` | floors, their rooms, "No floor yet"; a room's only parent field is Floor |
| Kakak | `src/lib/kakak/context.ts`, `household.ts` | rooms listed as "LT2 · Lounge"; a new room may sit on a floor |
| Staff tip | `src/app/staff/page.tsx` `showFloorsTip` | shows once a chore has a floor or a spot |

Everything above walks **one** parent up. That's the work: every label and
grouping learns one more step, and the database allows exactly one more.

## Three ways to do it (D1)

| | **A. A room can sit inside a room (recommended)** | B. A "suite" label on rooms | C. Stay flat, name better |
| --- | --- | --- | --- |
| What it is | `parent_id` may point at a room on the same floor; capped at one level | a text group ("Master suite") on each room; rooms stay on the floor | keep "GB1 Bathroom"; the Rooms view indents rooms whose name starts with another room's name |
| Database | no new column; the trigger allows one more level | one new column | none |
| Names | "Bathroom" inside each bedroom (names are unique per parent already) | still "GB1 Bathroom" (unique per floor) | still "GB1 Bathroom" |
| Moving a suite to another floor | its rooms come with it | each room moved one by one | each room moved one by one |
| Repairs, picker, tags | the same places everywhere; labels gain one step | the label has to be read from a second field everywhere | unchanged; grouping is a guess |
| "Master Bathroom" next to "Master Bedroom" | grouped once, by hand or by the card | grouped by typing the label on each | never grouped: the names don't share "Master Bedroom" |
| Risk | one more case in every label; a capped trigger | two ways to say "where" (parent and label) that can disagree | wrong guesses; nothing to rename or move as a unit |

**A** is the cleanest: it reuses the one place model the app already has
(Phase 158 made floors places for the same reason), names stop repeating
the bedroom, and a suite moves, deletes and reads as a unit. B adds a second
"where" that drifts from the first. C costs nothing but can't group
"Master Bedroom" with "Master Bathroom", which is exactly the owner's house.

The cap matters: one level inside a room covers bathrooms, closets,
balconies and dressing rooms. Anything smaller is a **spot** (a thing in a
room: sink, toilet, shower, mirror, AC). The rule people see: **a room
inside is a space with its own door; a spot is a thing in a room.**

## How it behaves (with A)

Example used throughout (the owner's LT2):

```
LT2
├─ Master Bedroom
│   ├─ Bathroom        spots: Shower, Toilet, Wastafel
│   └─ Walk-in closet
├─ GB1
│   └─ Bathroom        spots: Toilet, Wastafel
├─ GB2
│   └─ Bathroom        spots: Toilet, Wastafel
└─ Lounge
```

### The outer room is the bedroom itself (D2)

"Master Bedroom" is still the bedroom: its chores are the bedroom's ("Vacuum
· Tue"). Its rooms inside are listed under it. There's no separate "suite"
place to create, and no word "suite" on any screen: owners say "the
bathroom in GB1", and the app says it the same way.

### Names (D3)

A room inside is named **on its own** ("Bathroom", "Kamar Mandi") and
always **shown with the room it's in**: "GB1 · Bathroom". Three bedrooms can
each have a "Bathroom", because names are unique per parent (129's index,
unchanged). Everywhere a room is shown alone, it carries its path:

| Where | Shows |
| --- | --- |
| Rooms view, Rooms page, picker | indented under its room: **Bathroom** |
| Chore card tag (owner and staff), repair rows, push text | **LT2 · GB1 · Bathroom · Wastafel** (wraps, never cut; D6) |
| Picker search and chosen chip | **LT2 · GB1 · Bathroom** |
| Room sheet title | **GB1 · Bathroom** with LT2 under it |

Indonesian households type their own names, as with floors ("LT2" stays
"LT2"). The app never renames GB1 to "Kamar Tamu 1". Examples in the
mockup: **Kamar Utama** (Master Bedroom), **Kamar Tamu 1 / 2** (GB1, GB2),
**Kamar Mandi** (Bathroom), **Ruang Ganti** (Walk-in closet), **Balkon**.

### Rooms view and job chips (D4)

- Rooms inside are shown **indented under their room**, always open (no
  extra tap), with a thin rule on the left so the group reads as one.
- **Every room counts as one room, rooms inside included.** "Vacuum in 5 of
  9" on LT2 counts Master Bedroom, its Bathroom and Walk-in closet as three.
  The chip asks "which rooms are vacuumed", and the closet is a room you
  might forget; folding it into the bedroom would hide exactly that.
  Bathrooms show a quiet "No vacuum yet", not red (158's rule: an empty row
  may not need the job).
- `placesWithJob` and `allRoomRows` include rooms inside; whole floors count
  as today.
- **Tap a room** (the sheet): its own chores by job, as today; then, for an
  outer room, **Rooms inside** as rows ("Bathroom · 4 chores · 1 open
  repair"), each opening that room's sheet. Repairs stay in their own
  room's sheet; the outer room only shows the count.

### Room picker (D5)

- Under each floor: **Whole floor**, then each room, with its rooms inside
  indented beneath it (a small corner arrow).
- Typing "gb1 bath" finds **LT2 · GB1 · Bathroom** (the search label
  carries the path; `filterGroups` already matches every word).
- When **adding** a chore (the form can make several), an outer room offers
  **Whole Master Bedroom** with "3 rooms, one chore each": it ticks the
  bedroom and each room inside, using 158's "several rooms at once" (one
  chore per room, so staff tick each off with its own photo, and the job
  chips stay exact). Not offered when editing one chore.
- "Create '…'" from the picker still makes a room on no floor, as today;
  putting it inside a room is done on the Rooms page.

### Repairs

- A repair can be in a room inside ("LT2 · GB1 · Bathroom: shower leaking").
  `repairs.location_id` is unchanged.
- The staff report form (`room-select.tsx`, native list): options under the
  floor heading read "GB1", "GB1 · Bathroom", in that order.
- Pushes about urgent repairs say the full path:
  `repair_place_label()` walks up two parents (migration 142).

### Staff phones (D6)

- The tag shows the full path: **LT2 · Kamar Tamu 2 · Kamar Mandi ·
  Wastafel**, wrapping onto a second line when needed (audit B1 already
  wraps). Their list keeps its time order (158's D3).
- Staff never see "Di dalam" or any editing: picking and the report form
  only.
- The one-time staff tip (below) shows once a chore is in a room inside.

### Kakak (D8)

- The household context lists a room inside with its path and parent:
  "R7: LT2 · GB1 · Bathroom (inside GB1)". "Clean all the bathrooms on LT2
  every Monday" finds the three Bathrooms; "vacuum GB1 and its closet"
  finds both.
- A new room Kakak suggests may be put inside a room, checked like a new
  room's floor today (the parent must be a room that isn't itself inside
  one); the preview reads "Balcony (new room in GB1)".

### Household → Rooms (editing)

- Floors in order; each room with its rooms inside indented under it.
- Editing a room: **Name**, **Floor**, and a new **Inside (optional)**: a
  list of that floor's rooms that aren't inside another room. Helper: "A
  room inside has its own door, like a bathroom. A sink or a shower is a
  spot."
- An outer room's sheet lists **Rooms inside** and **Add a room inside**,
  with quick names: Bathroom, Walk-in closet, Balcony (Indonesian: Kamar
  mandi, Ruang ganti, Balkon). Tapping one makes it straight away; it can
  be renamed after.
- Moving an outer room to another floor moves its rooms inside with it.
- A room that has rooms inside can't itself go inside another room (the
  cap); the Inside list leaves those out, and the database refuses it too.
- **Deleting an outer room** moves its rooms inside out onto its floor,
  never deletes them; a clash gets the old room's name in front
  ("Bathroom" → "GB1 Bathroom", then a number), as deleting a floor does.
  The confirm line says so: "Delete GB1? Its Bathroom moves onto LT2 as GB1
  Bathroom. Chores stay."
- Taking a room out ("Inside: none") onto a floor that already has that
  name is refused with the 158 message: "There's already a room called
  Bathroom on LT2."

### The one-time card for existing names (D7)

**Group bathrooms and closets with their bedroom** (Indonesian:
**Kelompokkan kamar mandi dan ruang ganti dengan kamarnya**), owners only,
shown once in the Rooms view and on the Rooms page when it finds something.
It comes after "Sort your rooms into floors" (only one card at a time) and
also works for rooms on no floor. Previewed, one button **Group**, then
**Undo** for a few seconds; skippable. One transaction through
`organise_rooms` (no signature change).

What it finds, on the same floor (or among rooms on no floor):

| Today | Becomes | Rule |
| --- | --- | --- |
| "GB2" and "GB2 Bathroom" | GB2 → **Bathroom** | a room's name is another room's whole name plus more words |
| "Master Bedroom" and "Master Bathroom" / "Master Closet" | Master Bedroom → **Bathroom** / **Closet** | the bedroom's name minus "Bedroom" / "Kamar Tidur", followed by a known room word |
| "GB2 Bathroom Toilet", "GB2 Bathroom Wastafel" (158's merge not taken) | GB2 → **Bathroom**, spots **Toilet**, **Wastafel** | 158's merge runs first, then the nesting |
| "LT2 GB2 Bathroom Toilet" in a house with no floors yet | the floors card first (LT2 → GB2 Bathroom, spot Toilet), then this card | one card at a time |
| "GB2 Bathroom" with no room "GB2" | unchanged | nothing to put it in; by hand |
| "Master Lounge" next to "Master Bedroom" | unchanged | "Lounge" isn't a room word for this card |

Known room words (both languages, tested like the job words): bathroom,
bath, toilet, wc, closet, walk-in closet, wardrobe, dressing room, balcony,
kamar mandi, km, ruang ganti, balkon. "Closet" is a room after a bedroom
("Master Closet") and stays a spot after a bathroom ("GB2 Bathroom Closet"),
which is how 158's spot words already read it.

Renaming drops the outer room's name in front ("GB2 Bathroom" → "Bathroom"),
keeping the full name only if that would clash inside it. Chores don't move:
they keep the same room id, so nothing in history changes; only the label
does ("LT2 · GB2 Bathroom" → "LT2 · GB2 · Bathroom"). Undo restores the old
names and parents exactly.

## The database — migration 142 (described, not written)

Additive, no new column and no new table.

- **Allow one level inside a room.** Replace `household_locations_two_levels()`
  (same trigger, `security invoker`, `search_path = ''`, revoked from
  `public, anon, authenticated`, granted to `service_role`, as 129) with
  these rules:
  - a floor has no parent (unchanged);
  - a room's parent is nothing, a floor, or a **room whose own parent is
    nothing or a floor** (a top-level room), in the same household;
  - a room that has rooms inside can't move inside a room (the cap), and
    can't become a floor; a floor with rooms can't become a room (unchanged);
  - a room inside must be on its outer room's floor by construction (its
    parent is the outer room, so it has no floor of its own).
  - **Two phones at once:** the trigger takes `for share` on the new parent
    row, and the "has rooms inside" check runs after the row lock, so two
    owners can't build a third level by nesting A in B while nesting B in C.
- **Deleting an outer room** never deletes or orphans its rooms inside.
  Extend the before-delete trigger (`household_locations_release_floor()`,
  renamed in spirit to "release children"): a deleted room's rooms inside
  move to its parent (its floor, or no floor), renamed on a clash with the
  outer room's name in front, then a number, within 105's 60 characters, as
  129 does for floors. The FK's `set null` stays the backstop. Deleting a
  floor is unchanged: its top-level rooms go to "No floor yet" and keep
  their rooms inside.
- **Names:** no change. 129's index is already unique per parent, so each
  bedroom can have a "Bathroom".
- **`repair_place_label()`** (130): walks up two parents, so a push reads
  "LT2 · GB1 · Bathroom · Shower". Same grants as 130 (`service_role` only).
  Any place label added by 139–141 gets the same change in 142.
- **`organise_rooms(jsonb)`**: unchanged; the trigger enforces the cap on
  every row it writes. The card orders `places` outer rooms before rooms
  inside, and Undo takes rooms out before their outer room changes.
- **Indexes:** 134's `(parent_id, household_id)` serves "rooms inside this
  room"; nothing new.
- **RLS:** unchanged (everyone in the household reads; only
  `household_members` write). No new `SECURITY DEFINER` function.
- **Older app versions:** nothing nests until an owner nests, which only
  the new app offers, so 142 can go to staging and production before the
  app ships (as every migration does).
- **Tests** (`supabase/tests/142_rooms_inside_rooms.sql`, rolled back): a
  room inside a room is accepted; a third level is refused; a room with
  rooms inside can't go inside another; a cross-household parent is
  refused; three bedrooms can each hold "Bathroom"; deleting an outer room
  moves its rooms onto its floor, renaming a clash ("GB1 Bathroom", then a
  number, within 60 characters); deleting a floor keeps rooms inside their
  room; `repair_place_label` gives the full path; `organise_rooms` nests and
  its Undo restores; staff phones and logged-out callers can't write;
  grants checked.
- **Privacy:** no new kind of personal data, no new service, no change in
  where data is stored or for how long. The privacy policy doesn't change.
  (Checked against AGENTS.md; reviewers please confirm.)
- Applied local, then staging, then production with the owner's OK, before
  the PR that uses it merges.

## Two PRs

**PR A — rooms inside rooms, by hand** (migration 142)

- Migration 142 and its SQL tests.
- One shared helper for a place's path (`placePath(locations, id)` →
  "LT2 · GB1 · Bathroom"), used by `useLocationName`, the picker,
  `room-select.tsx`, the Rooms view and Kakak's context, so the path is
  built in one place.
- `placeGroups`, `buildRoomsModel`, `rooms-manager.tsx`: rooms inside
  indented under their room (today they would fall into "No floor yet").
- Rooms page: the Inside field, Rooms inside, Add a room inside.
- Room sheet: Rooms inside rows.
- Kakak context lines; staff tip line.
- Unit tests (paths, grouping, counts); a Playwright test on the stub: put
  Bathroom inside GB1, see "LT2 · GB1 · Bathroom" on a chore card.

**PR B — the helpers**

- The "Group bathrooms and closets with their bedroom" card
  (`src/lib/organise-rooms.ts` gains the nesting plan; tests over the
  owner's real name patterns).
- **Whole Master Bedroom** in the picker when adding.
- Kakak may create a room inside a room.

## Decisions for the owner

- **D1 — How to segment.** **A (recommended):** a room can have rooms inside
  it, one level deep (floor → room → room inside → spot). B: a "suite" label
  on each room. C: stay flat and name rooms "GB1 Bathroom".
- **D2 — What the outer room is.** **A (recommended):** the bedroom itself;
  its chores are the bedroom's, its rooms inside are listed under it. B: an
  empty "Master suite" holding Bedroom, Bathroom and Closet (one more room
  to make, and "Bedroom" three times on LT2).
- **D3 — Names of rooms inside.** **A (recommended):** short ("Bathroom"),
  always shown with their room ("GB1 · Bathroom"). B: keep full names
  ("GB1 Bathroom"), shown as "GB1 · GB1 Bathroom" or with the repeat hidden.
- **D4 — Job chips.** **A (recommended):** every room counts once, rooms
  inside included ("Vacuum in 5 of 9" on the owner's LT2). B: a bedroom and
  its rooms count as one ("Vacuum in 5 of 5"), which hides the unvacuumed
  walk-in closet.
- **D5 — Picking a whole bedroom.** **A (recommended):** when adding,
  **Whole Master Bedroom** ticks the bedroom and each room inside, one chore
  each. B: one chore for the whole suite (staff tick it once, and the chips
  can't tell which room was done). C: no shortcut.
- **D6 — Staff tag.** **A (recommended):** the full path, wrapping:
  "LT2 · Kamar Tamu 2 · Kamar Mandi · Wastafel". B: leave the floor out when
  the outer room's name is used on only one floor ("Kamar Tamu 2 · Kamar
  Mandi · Wastafel"): shorter, but the tag changes when a room is added
  elsewhere.
- **D7 — Existing names.** **A (recommended):** the one-time **Group
  bathrooms and closets with their bedroom** card: previewed, optional, with
  Undo; chores keep their room. B: by hand on the Rooms page only.
- **D8 — Kakak.** **A (recommended):** reads rooms inside and can put a new
  room inside a room (checked like floors). B: reads them; new rooms only on
  a floor, moved by hand.

## Glossary rows to add (before any Indonesian text)

| English | Bahasa Indonesia | Note |
| --- | --- | --- |
| Inside (optional) — the Rooms page field | **Di dalam (opsional)** | Owners only. |
| Not inside a room | **Tidak di dalam ruangan** | The field's first option. |
| Rooms inside | **Ruangan di dalamnya** | Room sheet and Rooms page. |
| Add a room inside | **Tambah ruangan di dalamnya** | |
| Whole {room} (picker, adding) | **Seluruh {ruangan}** — "Seluruh Kamar Utama" | Mirrors "Seluruh lantai"; sub-line "3 ruangan, satu tugas per ruangan". |
| Group bathrooms and closets with their bedroom / Group | **Kelompokkan kamar mandi dan ruang ganti dengan kamarnya** / **Kelompokkan** | The one-time card; button as 158's card. |
| Bathroom / Walk-in closet / Balcony (quick names) | **Kamar mandi / Ruang ganti / Balkon** | Quick names only; households keep what they type. "Lemari" stays Cupboard (Kitchen). |
| Master bedroom / Guest bedroom (examples) | **Kamar Utama / Kamar Tamu** | Examples in mockups and help text. |
| A room inside has its own door, like a bathroom. A sink or a shower is a spot. | **Ruangan di dalam punya pintu sendiri, seperti kamar mandi. Wastafel atau shower adalah bagian.** | Helper under the field. |

## Tutorial (shown once, per role)

Using the What's new card from Phase 158.

**Owners** (English or Bahasa Indonesia), PR A:

1. "A room can now have rooms inside it. Put each bathroom inside its
   bedroom in Household → Rooms." / "Ruangan sekarang bisa punya ruangan di
   dalamnya. Masukkan kamar mandi ke kamarnya di Rumah → Ruangan."
2. "They show under their room everywhere, like **GB1 · Bathroom**." /
   "Ruangan itu tampil di bawah kamarnya, misalnya **Kamar Tamu 1 · Kamar
   Mandi**."
3. "A spot is still a thing in a room, like the sink." / "Bagian tetap
   untuk benda di ruangan, seperti wastafel."

PR B adds: "Tap **Group** once to put your bathrooms and closets with their
bedroom, and pick **Whole Master Bedroom** to add a chore to every room in
it." / "Ketuk **Kelompokkan** sekali untuk menyatukan kamar mandi dan ruang
ganti dengan kamarnya, dan pilih **Seluruh Kamar Utama** untuk menambah
tugas di setiap ruangannya."

**Staff** (Bahasa Indonesia only), PR A, one line: "Kamar mandi sekarang
ditulis bersama kamarnya, misalnya **LT2 · Kamar Tamu 2 · Kamar Mandi ·
Wastafel**."

## Not in this phase

- More than one level inside a room (a room inside a room inside a room).
- Spots as stored places (they stay text on chores and repairs).
- Staff lists grouped by room (158's D3 B).
- Renaming households' rooms into Indonesian (names stay as typed).
