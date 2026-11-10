# Phase 169 — The closet: what's where and what's out

Status: **plan, waiting for the owner (D1–D12, each with a recommended A).**
Nothing is built. Building starts **after Phase 168 (suites, migration 142)
has merged**, because a walk-in closet usually sits inside a bedroom
("LT2 · Master Bedroom · Walk-in closet"). Migration **143** is reserved for
this phase. Roadmap item 17 (`docs/roadmap-2026-11-09.md`, P3): "Closet:
what's where and what's out: laundry, dry cleaner, lent, repair; staff
photograph what leaves and returns, with a count; photos of each section."
Mockup: `docs/mockups/phase-169-closet.html` (open in a browser, phone
width; owner screens English left and Bahasa Indonesia right, staff screens
in Bahasa Indonesia only).

Builds on **Phase 158** (rooms, floors and spots, migration 129), **Phase
168** (rooms inside rooms, migration 142, PR #72 plan, PR #74 build),
**Phase 156** (food: a thing, its photo, its place, its status) and **Phase
159** (repairs: staff report with a photo, owners decide). It reuses their
photo field, compression (`compressPhoto`, with PR #66's fix), bottom
sheets, rows, the Lapor sheet and the What's new card.

## The problem

The owner's words (9 November): it's hard to know which clothes are where,
and which are out being cleaned. They suggested photos of the clothes and of
each section, and asked whether it's like the fridge and supplies features.

In an Indonesian home with live-in staff, clothes leave the house all the
time, and nobody writes it down:

- **Laundry kiloan**: a staff member hands a bag to the laundry's
  pickup man (or walks it to the shop), paid by the kilo. The note says
  "12 pcs" if anyone counts. Two or three days later the bag comes back,
  folded, and nobody checks it against anything. A shirt that doesn't come
  back is noticed a week later, when it's too late to ask.
- **Dry cleaner**: suits, kebaya, batik tulis, a wedding dress. Fewer pieces,
  each worth more, and they can stay out for a week.
- **Tailor (penjahit)**: hemming, a broken zip, taking in a waist. Easy to
  forget for a month.
- **Lent out**: a dress lent to a cousin for a wedding, a jacket lent to a
  neighbour's son. "Who has my blue kebaya?"
- **Moved inside the house**: the staff member who does the ironing knows
  where everything goes; a new one, or a family member, doesn't. "Which
  drawer are the kids' uniforms in?"
- **Things go missing**: a sock here, a shirt there; with no count, nobody
  can say whether it went at the laundry or in the house, and trust between
  family and staff suffers for something nobody can prove.

Today this lives in WhatsApp photos of the laundry bag, a paper note from the
laundry, and memory.

## What exists (read 2026-11-10)

| Piece | Where | What it gives the closet |
| --- | --- | --- |
| Places | `household_locations` (105, 129): `kind` floor/room, `parent_id`, `sort_order` | the closet is a room, on a floor |
| Rooms inside rooms | Phase 168, migration 142 (PR #74, building) | a walk-in closet inside the Master Bedroom; one shared `placePath()` gives "LT2 · Master Bedroom · Walk-in closet" |
| Spots | `household_tasks.spot`, `repairs` spot (129, 130): **free text** on a chore or repair, 1–40 characters, matched case-insensitively; chips in `spot-field.tsx` | the closet's sections ("Rack A", "Drawer 3") are spots of the closet room; today they have no photo because they aren't stored anywhere |
| Rooms view and room sheet | `src/components/chores/rooms-view.tsx`, `src/lib/rooms-view.ts` | the closet is shown where rooms are shown, no new tab |
| Food | `food_items` (123): name, photo, where kept, status (eaten, given away, thrown away), finished rows kept 90 days | the "thing, photo, place, status" pattern; the 90-day keep |
| Staff Lapor sheet | `src/components/staff/staff-actions-fab.tsx`: Makanan masuk, Lapor kerusakan, Kirim masukan | where staff log something that just happened at the door |
| Photos | `compressPhoto` (`src/lib/image.ts`, fixed in PR #66 to return a real `File`), `FoodPhotoField`, `src/lib/photos.ts`, bucket `household-logs` under `<household>/…` | the same path for every closet photo |
| Photo clean-up | `task_photos_due_for_pruning` and `orphaned_household_photos` (131, 138): reference rules plus per-folder rules ("a file under `<household>/repairs/` that no repair points at, over a day old") | the closet adds its own folder rule, `<household>/closet/` |
| Morning reminder | `notify_chores_due` (137), 07:05 Jakarta, one push per owner | not used in this phase (D5); production has no push subscriptions yet (side-session note `push-notifications-root-cause-2026-11-10.md`) |
| Owner check | `caller_admin_household()` (109) and `household_members` | owner-only actions; never `get_user_household_ids()` alone, which every staff phone passes (AGENTS.md) |

## The idea in one line

**One pattern across Miamus: a thing, its photo, its place and its status.**
Food expires, supplies run out, and clothes are **in place, at the laundry,
at the dry cleaner, at the tailor or lent out**. Miamus **tracks what goes
out, not every garment**: staff photograph each bag that leaves and what
comes back, **with a count**, so nothing goes missing quietly. Each section
of a closet has **a photo** instead of a drawn plan. Valuable pieces can
have their own photo, optionally.

## What changes for people

| Who | What's new |
| --- | --- |
| Staff | **Lapor → Pakaian keluar**: where it's going (Laundry, Dry clean, Penjahit, Dipinjam, Lainnya), how many pieces, at least one photo. Twenty seconds at the door. |
| Staff | **Lapor → Pakaian di luar**: what's out now. **Terima kembali** on a bag: how many came back, one photo. If fewer came back, the app says "Kurang 1" and keeps the rest open. |
| Staff | A closet's spots have photos ("Rak A", "Laci 3"), so anyone can see where things go. Staff can retake a spot's photo after tidying. |
| Owners | **Chores → Rooms**: a closet room shows a hanger icon and "3 out". Its sheet shows **Spots** (photos), **Out now** and, from PR B, **Valuable pieces**. |
| Owners | **Chores → Rooms**, top: a quiet line **Out now: 2 · 15 pcs**, opening the household-wide list. |
| Owners | **Today**: an amber line only when something needs a look: "Dry clean: 6 days, usually 3" or "1 piece missing from Laundry Bu Ani". |
| Owners | On a bag that came back short, owners decide: **Still waiting**, **1 missing** (closes it) or **Miscounted**. Staff can't close a bag as missing. |
| Owners | **Household → Rooms**: a **Closet** switch on any room (a walk-in closet, a kids' room with a wardrobe, the laundry room). Phase 168's quick name "Walk-in closet" turns it on. |
| Owners (PR B) | **Valuable pieces**: optional photo, name, whose it is, spot. When it goes out with a bag, its row says "At the dry cleaner since Tue 17 Nov". |

Still five tabs. Nothing needs AI. (Kakak could later read the laundry's
paper note or count the pieces in a photo, as a paid extra; not in this
phase.)

## The screens (mockup)

1. **Chores → Rooms** (owner). The Out now line on top. LT2 with Master
   Bedroom and, indented under it (Phase 168), **Walk-in closet** with a
   hanger icon and "3 out". Other rooms as today.
2. **The closet's sheet** (owner). Title "Master Bedroom · Walk-in closet",
   "LT2" under it. **Spots**: a two-column grid of photos with names ("Rack
   A", "Rack B", "Drawer 1", "Shoes"), and **Add spot**. **Out now**: one row
   per bag ("Laundry Bu Ani · 12 pcs · 2 days", "Dry clean · 3 pcs · 6 days,
   usually 3" in amber, "Lent to Tante Rina · 1 pc"). Then the room's chores,
   as today.
3. **Lapor sheet** (staff). **Pakaian keluar** second, after Makanan masuk.
   Below it, only when something is out, **Pakaian di luar** with each bag
   and **Terima kembali**.
4. **Pakaian keluar** (staff). Where (five chips), the place's name (the
   laundry's or tailor's name, or who borrowed it; required for Dipinjam),
   **Jumlah** (a stepper, in pcs), **Foto** (at least one, up to three),
   **Dari** (which closet; optional, the only closet preselected), and from
   PR B a tick list of valuable pieces going too. **Simpan**.
5. **Terima kembali** (staff). The bag as it left (photo, "12 pcs · Sel 17
   Nov"), **Jumlah kembali** (stepper, starts at what's still out), one
   photo. If fewer: amber "Kurang 1. Sisanya dicatat belum kembali."
   **Simpan**. If more: "Lebih 1. Pemilik rumah akan melihatnya."
6. **A bag that came back short** (owner). Photos out and back side by side,
   "12 out · 11 back · 1 still out", and three answers: **Still waiting**,
   **1 missing**, **Miscounted (it was 11)**. Today's amber line above.
7. **A valuable piece** (owner, PR B). Photo, name, whose, spot, and its
   status: "At the dry cleaner since Tue 17 Nov".
8. **What's new** cards: owners (EN/ID) and staff (ID).

## How it fits the five tabs (D4)

No new tab, no new `<SegmentedControl />`, no new pill:

- **Chores → Rooms**: a closet is a room, so it's where rooms are. A closet
  room's row gets a hanger icon (Lucide `Shirt`) and an "N out" count. Its
  sheet gains **Spots** (with photos), **Out now** and (PR B) **Valuable
  pieces**, above the room's chores. The **Out now** quiet line sits at the
  top of the Rooms view, only when something is out, and opens a sheet
  listing every open bag in the house (bags don't have to come from a
  closet: towels and sheets go to the laundry too).
- **Today**: one amber quiet line, only when a bag is overdue or came back
  short. Tapping it opens that bag. Nothing when all is well.
- **Staff**: everything is in the existing **Lapor** sheet (the "+" button).
  No new staff tab or header pill. Staff reach the closet's spot photos from
  a chore in that room (the room tag opens its sheet) and from **Pakaian di
  luar**.
- **Household → Rooms**: the **Closet** switch on a room.
- **Kitchen, Pets**: unchanged.

## Out and back: one record per bag (D1, D2)

**A bag is one record**, whatever is in it: the kind (Laundry, Dry clean,
Tailor, Lent, Other), the place's name ("Laundry Bu Ani", "Penjahit Pak
Udin", "Tante Rina"), **how many pieces**, the photos of what left, when, and
who logged it. Pieces aren't listed one by one; the count and the photo are
the record. A valuable piece can be ticked into the bag (PR B).

**Coming back**, the count is the check:

| Came back | What happens |
| --- | --- |
| All of it (11 of 11) | The bag closes. Row turns green, "Back · 11 pcs", for the rest of the day; then it leaves Out now. |
| Fewer (11 of 12) | The return is saved; the bag stays open with **1 still out**. Staff see "Kurang 1. Sisanya dicatat belum kembali." Owners see the amber line on Today and decide (below). The rest can come back later as another return ("Sisanya menyusul" is simply the bag staying open). |
| More (13 of 12) | Saved and the bag closes; marked "1 extra" for owners (someone else's shirt, or a miscount when it left). No question asked of staff. |
| Nothing yet | Stays in Out now with how long it's been out. |

**Owners settle a short bag** with one of three answers:

- **Still waiting**: leaves it open (the laundry will bring it tomorrow).
  The Today line goes quiet for 3 days, then returns if still short.
- **N missing**: closes the bag, recording N missing and an optional note
  ("Laundry will pay Rp 50.000"). It stays in the bag's history; nothing is
  deleted.
- **Miscounted**: closes the bag as complete (the count was wrong when it
  left). Recorded as such, so it doesn't look like a loss.

Staff can't close a bag as missing or miscounted: a count is a fact staff
record; what it means is the owner's call. If a missing piece turns up,
an owner taps **Found 1** on the closed bag, which adds a return; the bag
stays closed and its missing count drops by one (to none: it reads "Back").

**Mistakes**: whoever logged a bag or a return can delete it for 10 minutes
(the toast's **Batalkan / Undo**, and a "Hapus" link on their own row in
that window), as long as the bag has no returns yet. After that, owners can
fix the count or delete it; staff ask an owner.

## Statuses and who can set them (D3)

| Status (EN / ID) | Set by | Needs |
| --- | --- | --- |
| In place / Di tempat | nobody: it's the default (not out) | — |
| At the laundry / Di laundry | staff and owners | count, photo (staff) |
| At the dry cleaner / Di dry clean | staff and owners | count, photo (staff) |
| At the tailor / Di penjahit | staff and owners | count, photo (staff); covers hemming and repairs |
| Lent to … / Dipinjam … | staff and owners | count, **who** (free text, up to 60 characters), photo (staff) |
| Other / Lainnya | staff and owners | count, a short name ("Cuci sepatu", "Spa tas"), photo (staff) |
| Back / Sudah kembali | staff and owners | count back, photo (staff) |
| N missing / Hilang N | **owners only** | optional note |
| Miscounted / Salah hitung | **owners only** | — |

Staff forms require **at least one photo** for a bag going out and for a
return: that's the whole point ("foto yang keluar, foto yang kembali").
Owners' forms make the photo optional (owners often hand a dress to a cousin
themselves). "Lent to whom" is free text, as "From whom" is for food and
"Repair person" for repairs; it's household data that staff phones can read
(see Privacy).

## Usually N days: the overdue nudge (D5)

- Each kind has a usual time: **the median of this household's last 5
  closed bags of that kind and place** ("Laundry Bu Ani: usually 3 days"),
  computed on the phone from history Miamus already keeps (90 days, D12).
  Before there's history: Laundry 3 days, Dry clean 5, Tailor 7, Lent 14,
  Other none.
- An owner can set **Back by** on a bag (a lent dress due back after the
  wedding); that date wins.
- **Overdue** once a bag has been out longer than its usual time plus one
  day (or past its Back by date). Shown as amber in Out now, on the closet
  row ("1 overdue"), and as one line on Today: "Dry clean: 6 days, usually
  3". Several: "2 bags overdue · 1 piece missing".
- **On screen only in this phase, no push.** Clothes coming back a day late
  isn't worth waking a phone for, the morning push already carries bills and
  chores, and production has no push subscriptions yet. If households ask
  for it, a later phase can add one line to the 07:05 reminder (137) rather
  than a new push.
- Staff see the same "Sudah 6 hari, biasanya 3" on the bag in Pakaian di
  luar, so they can call the laundry without being told.

## Spots with photos: the closet's sections (D6)

The owner asked for **photos of each section** ("Rack A", "Drawer 3")
instead of a drawn plan (drawn plans are in the roadmap's "Not adding"). A
section is exactly what Phase 158 called a **spot**: a part of a room
("Wastafel" in a bathroom, "Rak A" in a closet). So the closet uses spots,
not a new concept.

The catch: spots today are **free text on a chore or a repair**; they
aren't stored anywhere, so they can't hold a photo or exist before a chore
uses them. The smallest change that keeps one concept:

- **A spot can be saved on its room, with a photo**: a small table,
  `location_spots` (room, name, photo, order). Any room can have saved
  spots, not only closets: a bathroom's "Wastafel" can have a photo too,
  which helps a new staff member. The closet is simply the first screen
  that shows them.
- **Chores and repairs keep their text spot**, unchanged. The spot chips in
  the chore form and the repair form list the room's saved spots first,
  then the spots already used in that room (as today), matched by name,
  case-insensitively. Nothing is migrated.
- **Renaming a saved spot** also renames that spot on the room's chores and
  repairs, in one call, so the tag on staff cards follows.
- **Deleting a saved spot** deletes its photo; chores and repairs keep their
  text (the spot just has no photo any more).
- **Staff can retake a spot's photo** (after tidying a rack) but can't add,
  rename or delete spots. Owners can do all of it.
- Quick names when adding a spot in a closet: Rack, Drawer, Hanging rail,
  Shelf, Shoes, Box (ID: Rak, Laci, Gantungan, Ambalan, Rak sepatu, Kotak);
  households type their own ("Rak A", "Laci Raka").
- Shown as a two-column photo grid in a closet's sheet, and as a list with
  thumbnails in other rooms' sheets (only when the room has saved spots).

## Which rooms are closets (D7, D9)

- **Any room can be a closet**: a **Closet** switch on the room in
  Household → Rooms. A walk-in closet, a kids' room with a wardrobe, a
  guest room's lemari, the laundry room where ironed clothes wait. A house
  can have several.
- **Phase 168's quick name "Walk-in closet" / "Ruang ganti"** (Add a room
  inside) turns the switch on, so the owner's LT2 gets it without thinking.
- **Rooms inside rooms**: a closet can be a top-level room or a room inside
  one (the usual case: "LT2 · Master Bedroom · Walk-in closet"). The closet
  shows everywhere with 168's `placePath()`, and a spot adds one more step:
  "LT2 · Master Bedroom · Walk-in closet · Rack A". No closet-specific
  nesting; 142's one-level cap is unchanged.
- **Bags are household-wide**: a bag may name the closet it came from
  ("Dari", optional), but towels, sheets and the kids' uniforms go in the
  same laundry bag, so Out now is one list for the house. A closet's sheet
  shows the bags that name it; the Rooms view's Out now line shows them all.
- A closet room is still a room: its chores (vacuum, tidy) and repairs work
  as today.

## Valuable pieces, optional (D8; PR B)

Not a garment catalogue. Only what's worth a photo: a batik tulis, a
kebaya, a suit, a handbag.

- **Owners add**: photo (required: it's the point), name ("Batik tulis
  biru"), whose it is (free text: "Ibu", "Raka"; there's no family list to
  pick from until the Care tab), the closet and spot, notes.
- **Staff see them** (in the closet's sheet and when sending a bag), and
  **tick them into a bag** going out; on return they tick them back.
  Staff can't add, edit or delete them.
- **Status** comes from the bags: "In place · Rack B", "At the dry cleaner
  since Tue 17 Nov", "Lent to Tante Rina since 2 Nov". A piece that was in a
  bag closed as missing shows "Missing since 20 Nov" until an owner marks it
  found or deletes it. That state is stored on the piece (`missing_since`),
  not read from the bag, so it stays after the bag is deleted 90 days later.
- Kept until an owner deletes it.

## Staff flow (Bahasa Indonesia only)

1. The laundry man is at the gate. Staff tap **+ Lapor → Pakaian keluar**.
2. Tap **Laundry**, type or pick "Laundry Bu Ani" (the last three names
   used for that kind are chips), set **Jumlah 12**, take a photo of the
   pile or the open bag, tap **Simpan**. Toast: "Tercatat: 12 pcs ke Laundry
   Bu Ani · Batalkan".
3. Two days later the bag comes back. **+ Lapor → Pakaian di luar →
   Terima kembali** on that bag. The stepper starts at 12; they count 11,
   take a photo, **Simpan**. The sheet says "Kurang 1. Sisanya dicatat belum
   kembali." The bag stays in Pakaian di luar as "1 pcs belum kembali".
4. The laundry brings the last shirt the next day: **Terima kembali**, 1,
   photo, Simpan. The bag closes.
5. Retaking a spot's photo: from a chore in the closet, tap the room tag,
   tap a spot, **Foto ulang**.

Offline: a bag or a return saved with no signal goes into the existing
outbox (R10) with its photos, like a finished chore, and is sent when the
signal comes back. (The outbox learns two new kinds of save in PR A.)

## Owner flow (English or Bahasa Indonesia)

1. **Set up, once** (or never: bags work without a closet): Household →
   Rooms → Walk-in closet → **Closet** on (already on if made from 168's
   quick name). Open it from Chores → Rooms, **Add spot**, take a photo of
   each rack and drawer.
2. **Day to day**: nothing to do. The Out now line shows what's out.
3. **When something's off**: Today shows one amber line. Tap: the bag's
   sheet with photos out and back; answer Still waiting, N missing or
   Miscounted.
4. **Lending a dress**: Chores → Rooms → Out now (or the closet) → **Log
   something going out** → Lent → "Tante Rina" → 1 → Back by Sat 28 Nov.
5. **PR B**: add a few valuable pieces; see where each one is.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Room switch | Closet · Clothes are kept here | Lemari pakaian · Tempat menyimpan pakaian |
| Rooms view line | Out now: 2 · 15 pcs | Di luar: 2 · 15 pcs |
| Closet row | 3 out · 1 overdue | 3 di luar · 1 terlambat |
| Sheet groups | Spots · Out now · Valuable pieces | Bagian · Di luar · Pakaian berharga |
| Add spot / Retake photo | Add spot · Retake photo | Tambah bagian · Foto ulang |
| Spot quick names | Rack · Drawer · Hanging rail · Shelf · Shoes · Box | Rak · Laci · Gantungan · Ambalan · Rak sepatu · Kotak |
| Kinds | Laundry · Dry clean · Tailor · Lent · Other | Laundry · Dry clean · Penjahit · Dipinjam · Lainnya |
| Bag row | Laundry Bu Ani · 12 pcs · 2 days | Laundry Bu Ani · 12 pcs · 2 hari |
| Overdue | 6 days, usually 3 | Sudah 6 hari, biasanya 3 |
| Lent row | Lent to Tante Rina · 1 pc · back by Sat 28 Nov | Dipinjam Tante Rina · 1 pcs · kembali Sab 28 Nov |
| Button | Log something going out | Catat pakaian keluar |
| Field | Back by (optional) | Kembali paling lambat (opsional) |
| Short bag | 12 out · 11 back · 1 still out | 12 keluar · 11 kembali · 1 belum kembali |
| Answers | Still waiting · 1 missing · Miscounted (it was 11) | Masih ditunggu · Hilang 1 · Salah hitung (memang 11) |
| Note field | Note (optional) | Catatan (opsional) |
| Extra | 1 extra | Lebih 1 |
| Found | Found 1 | Ketemu 1 |
| Today line | Dry clean: 6 days, usually 3 · 1 piece missing from Laundry Bu Ani · 2 bags overdue | Dry clean: sudah 6 hari, biasanya 3 · 1 pcs hilang dari Laundry Bu Ani · 2 kantong terlambat |
| Back row | Back · 11 pcs | Sudah kembali · 11 pcs |
| Valuable piece | Whose (optional) · At the dry cleaner since Tue 17 Nov · In place · Rack B | Milik (opsional) · Di dry clean sejak Sel 17 Nov · Di tempat · Rak B |

## Staff text (Bahasa Indonesia only)

| Where | Text |
| --- | --- |
| Lapor row | **Pakaian keluar** · "Laundry, dry clean, penjahit, dipinjam" |
| Lapor group | **Pakaian di luar** (2) |
| Form title | Pakaian keluar |
| Where to | Ke mana? · Laundry · Dry clean · Penjahit · Dipinjam · Lainnya |
| Place name | Nama laundry (boleh dikosongkan) · Nama penjahit (boleh dikosongkan) · Dipinjam siapa? · Apa? (Lainnya: "Cuci sepatu") |
| Count | Jumlah · 12 pcs |
| Photo | Foto pakaian yang keluar · "Foto tumpukan atau isi kantong." |
| From | Dari lemari mana? (boleh dikosongkan) |
| Valuable (PR B) | Pakaian berharga yang ikut (boleh dikosongkan) |
| Save, toast | Simpan · "Tercatat: 12 pcs ke Laundry Bu Ani" · Batalkan |
| Out row | Laundry Bu Ani · 12 pcs · sudah 2 hari · **Terima kembali** |
| Return form | Terima kembali · Dikirim 12 pcs · Sel 17 Nov · Jumlah kembali · Foto pakaian yang kembali |
| Short | Kurang 1. Sisanya dicatat belum kembali. |
| Extra | Lebih 1. Pemilik rumah akan melihatnya. |
| Still out | 1 pcs belum kembali |
| Overdue | Sudah 6 hari, biasanya 3 |
| Spot photo | Foto ulang · "Foto bagian ini setelah dirapikan." |

Wording follows `docs/indonesian-glossary.md`: **staf**, never "pembantu";
**HP**, not "ponsel"; **Anda** or no pronoun; staff forms say **(boleh
dikosongkan)**, owner forms **(opsional)**; **Batalkan** for Undo; **pcs**
(the glossary's unit, and what laundry notes say); dates `id-ID`; **pemilik
rumah** as in "Tunggu pemilik rumah". "Laundry" and "dry clean" are the
everyday words (a laundry kiloan shop's sign says LAUNDRY); "binatu" reads
old-fashioned and isn't used. "Lemari" alone stays **Cupboard** (Kitchen);
clothes' is always **Lemari pakaian**. "Bagian" is already Spot.

## Glossary rows (added to `docs/indonesian-glossary.md` in this PR)

The brief asked for the new terms to be proposed in this PR, so they're in
the glossary's Terms table, marked "Phase 169 (planned)". If the owner
changes a word, the glossary row changes with it before any build.

| English | Bahasa Indonesia |
| --- | --- |
| Closet (a room where clothes are kept) | **Lemari pakaian** ("Lemari" alone stays Cupboard, Kitchen) |
| Out now / out (clothes) | **Di luar** |
| Clothes going out (staff button) / Log something going out | **Pakaian keluar** / **Catat pakaian keluar** |
| Receive back / Back | **Terima kembali** / **Sudah kembali** |
| Laundry · Dry clean · Tailor · Lent · Other | **Laundry · Dry clean · Penjahit · Dipinjam · Lainnya** (not "binatu") |
| Lent to … / Who borrowed it? | **Dipinjam …** / **Dipinjam siapa?** |
| Still out / N short / N extra | **Belum kembali** / **Kurang N** / **Lebih N** |
| Still waiting · N missing · Miscounted · Found N | **Masih ditunggu · Hilang N · Salah hitung · Ketemu N** |
| Usually N days / Overdue | **Biasanya N hari** / **Terlambat** |
| Back by | **Kembali paling lambat** |
| Retake photo | **Foto ulang** |
| Rack · Drawer · Hanging rail · Shelf · Shoes · Box (spot quick names) | **Rak · Laci · Gantungan · Ambalan · Rak sepatu · Kotak** |
| Valuable pieces / Whose | **Pakaian berharga** / **Milik** |

## Data model: migration 143 (described, not written)

Everything below is one design in **migration 143** (reserved). Additive:
four new tables and one new column. Not created in this PR. Re-check
`supabase/migrations` and open PRs before building (139 couldn't-do, 140
staff push, 141 staff pay, 142 suites are taken).

**`household_locations`, one column**

| Column | |
| --- | --- |
| `is_closet` | `boolean not null default false`. Rooms only (a check: a floor can't be a closet). Owners set it; 105's policies already limit writes to `household_members`. |

**Table `location_spots`** (saved spots, D6)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade on household delete |
| `location_id` | the room; composite FK `(location_id, household_id)` → `household_locations (id, household_id)`, `on delete cascade` (deleting a room deletes its saved spots; their photos go with the folder rule below) |
| `name` | 1–40 characters after trimming (129's spot rule); unique per room on `lower(btrim(name))` |
| `photo_url` | nullable; `household-logs`, `<household>/spots/<id>/…` (any room's spot, so not under `closet/`) |
| `photo_taken_at`, `photo_by` | when and by whom (staff FK, nullable, `on delete set null`) the photo was last taken |
| `sort_order` | `int not null default 0`, then name |
| `created_at`, `updated_at` | |

- RLS: read by any session of the household (`get_user_household_ids()`);
  insert and delete by `household_members` only; update by any session of
  the household, **but** a guard trigger (`location_spots_staff_guard`,
  `security definer`, `search_path = ''`, as 128's guard) lets a non-member
  session change only `photo_url`, `photo_taken_at` and `photo_by`. Revoked
  from `public, anon, authenticated`; it runs as a trigger only.
- **`rename_location_spot(p_spot uuid, p_name text)`**: `security invoker`
  (RLS still applies), owner-only through `caller_admin_household()`; one
  transaction: renames the saved spot and sets `spot` on that room's
  `household_tasks` and `repairs` rows whose spot matches the old name
  case-insensitively. Revoked from `public, anon`, granted to
  `authenticated`. (128's guard already lets owners change `spot`.)

**Table `closet_trips`** (one bag out, D1)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade |
| `kind` | `laundry`, `dry_clean`, `tailor`, `lent`, `other` |
| `place_name` | nullable, 1–60 characters: the laundry's or tailor's name, who borrowed it, or what "other" is. **Required** (check) for `lent` and `other` |
| `from_location_id` | nullable; the closet; composite FK, `on delete set null (from_location_id)` |
| `count_out` | `smallint`, 1–200 |
| `count_back` | `smallint not null default 0`; **kept by a trigger** from `closet_returns`, never written by clients |
| `photos_out` | `text[] not null default '{}'`, at most 3; `<household>/closet/trips/<id>/…` |
| `back_by` | `date`, nullable (owners) |
| `quiet_until` | `date`, nullable: set by an owner's **Still waiting** (today + 3), hides the bag from Today's line until then |
| `note` | nullable, up to 200 characters |
| `status` | `out` (open, includes part returned), `back` (count_back ≥ count_out), `closed` (settled by an owner) |
| `closed_reason`, `missing_count` | `missing` (with `missing_count` ≥ 1) or `miscounted`; null unless `closed` |
| `closed_at`, `closed_by` | stamped by the server when an owner settles it |
| `sent_at` | `timestamptz default now()` |
| `sent_by` | staff FK, nullable, `on delete set null` (self-declared, like every `staff_id`) |
| `created_by` | `auth.uid()` of the session, stamped by a server-fields trigger |
| `updated_at` | |

**Table `closet_returns`** (what came back, D2)

| Column | |
| --- | --- |
| `id`, `household_id` | |
| `trip_id` | composite FK `(trip_id, household_id)` → `closet_trips (id, household_id)`, `on delete cascade` |
| `count` | `smallint`, 1–200 |
| `photos` | `text[]`, at most 3; `<household>/closet/trips/<trip>/…` |
| `item_ids` | `uuid[] not null default '{}'`: valuable pieces ticked back (PR B); checked by the trigger against the bag's pieces |
| `received_at` | `timestamptz default now()` |
| `received_by` | staff FK, nullable, `on delete set null` |
| `created_by` | `auth.uid()`, stamped |

**Table `closet_items`** (valuable pieces, D8; used from PR B)

| Column | |
| --- | --- |
| `id`, `household_id` | |
| `name` | 1–60 characters |
| `photo_url` | required; `<household>/closet/items/<id>/…` |
| `belongs_to` | nullable, up to 40 characters (free text: "Ibu", "Raka") |
| `location_id`, `spot_id` | nullable; composite FKs, `on delete set null` |
| `notes` | nullable, up to 200 characters |
| `missing_since` | `timestamptz`, nullable: set when an owner settles a bag as missing while this piece hadn't been ticked back; cleared when the piece is found (ticked back by a return, or **Mark found** by an owner). Stored on the piece so it outlives the bag, which is pruned after 90 days |
| `created_at`, `updated_at` | |

**Table `closet_trip_items`** (pieces in a bag, PR B)

| Column | |
| --- | --- |
| `trip_id`, `item_id`, `household_id` | composite FKs to both, `on delete cascade`; primary key `(trip_id, item_id)`. A non-member session may add a piece only to an open bag it created in the last 10 minutes (the send form); owners any time |
| `back_at` | set by the returns trigger when a return ticks the piece |

**Who may do what (RLS)**

- `closet_trips`, `closet_returns`, `closet_trip_items`: **read** and
  **insert** by any session of the household (`get_user_household_ids()`),
  staff phones included. Insert checks: `status = 'out'`, `count_back = 0`,
  no `closed_*`, `back_by` or `quiet_until` from a non-member session (a guard trigger),
  and 119's rule (nothing new recorded in a removed staff member's name).
- **Update** of `closet_trips` (fix a count, set Back by, settle a short
  bag): `household_members` only. Never `get_user_household_ids()` alone
  (AGENTS.md: every staff phone passes it).
- **Delete**: `household_members`; or the session that created the row
  (`created_by = auth.uid()`) within 10 minutes, and for a bag only while
  it has no returns (the Undo window).
- **Returns to a closed bag** ("Found 1"): owners only (the trigger refuses
  a non-member session).
- `closet_items`: read by the household; insert, update, delete by
  `household_members`.
- `location_spots`: above.
- Composite keys: `closet_trips`, `closet_items` and `location_spots` each
  get `unique (id, household_id)` (as 105 and 130), so every reference above
  stays inside one household.
- `revoke all … from anon` on every new table.

**Triggers and functions** (every one: `search_path = ''`; revoked from
`public, anon` in the same file, with explicit grants)

- `closet_returns_apply()`: `security definer`, revoked from `public, anon,
  authenticated` (trigger only). After insert or delete on
  `closet_returns`: recomputes the bag's `count_back` as the sum of its
  returns, sets `status` to `back` when `count_back ≥ count_out` (and back to
  `out` if a return is deleted), refuses a return to a `closed` bag from a
  non-member session (an owner's return to a closed bag lowers
  `missing_count`, and a bag whose missing count reaches 0 reads as back),
  and sets `back_at` on the ticked pieces and clears their `missing_since`. Definer
  because staff sessions can't update `closet_trips`; it writes only those
  columns.
- `closet_trips_guard()`: `security definer`, trigger only, same revokes:
  stamps `created_by`, `closed_at`, `closed_by`; when an owner settles a bag
  as missing, sets `missing_since` (if empty) on the bag's pieces that have
  no `back_at`; refuses client writes to `count_back`; refuses `closed_*`, `back_by` and `quiet_until` from non-members.
- `location_spots_staff_guard()`: above.
- `rename_location_spot(uuid, text)`: `security invoker`, granted to
  `authenticated`, owner check inside.
- **No new client-callable `SECURITY DEFINER` function.**

**Photos and clean-up** (same Edge Function, same secret; re-created with
the same names and signatures, still `security definer`, empty
`search_path`, revoked from `public, anon, authenticated`, `service_role`
only):

- `task_photos_due_for_pruning(p_secret, p_limit)` (131): a **`closet_due`
  folder rule** (as `repairs_due`): a file under `<household>/closet/` or `<household>/spots/` that
  no `location_spots`, `closet_items`, open-or-recent `closet_trips` or
  their `closet_returns` points at, once over a day old. Saved-spot and
  piece photos join `permanent` (kept while the row exists); bag and return
  photos are kept while the bag is open and for 90 days after it closes.
- `orphaned_household_photos(p_secret, p_limit)` (138): its `live_refs`
  include the four photo columns, so nothing a row points at is listed.
- When a spot's or piece's photo is replaced or deleted, the app deletes
  the old file through the Storage API; the folder rule is the safety net.

**How long things are kept (D12)**

- A bag and its returns: while open, then **90 days after it's back or
  closed**, then deleted by a nightly job (`prune_old_closet_trips()`, not
  `security definer`, cron only, `service_role` only, as
  `prune_old_feedback`), with their photos following by the folder rule.
  90 days matches finished food and gives "usually N days" its history.
- Saved spots and valuable pieces: until an owner deletes them (or the
  room). Their photos with them.
- A bag closed as **missing** follows the same 90 days; the piece's
  "Missing since" (PR B) is its own column on `closet_items`, so it stays
  until the piece is found or deleted, whatever happens to the bag.

**Export** (`export_household_data()`, as the latest migration before 143 left it; 138 today): re-created to
include the four tables (owners-only export, `caller_admin_household()`,
revoked from `public, anon`, granted to `authenticated`). Household
deletion cascades through `household_id`.

**Tests**: `supabase/tests/143_closet.sql`, one transaction, rolled back:

- a staff session adds a bag and a return; `count_back` and `status` follow;
  a short return keeps it `out`; an extra closes it; deleting a return
  reopens it;
- a staff session can't settle a bag, set `back_by`, write `count_back`,
  return to a closed bag, or delete a bag after 10 minutes or once it has
  returns; an owner can do all of these;
- `lent` without `place_name` is refused; counts outside 1–200 refused;
  more than 3 photos refused;
- `location_spots`: staff retake a photo (allowed) and rename or delete
  (refused); names unique per room, case-insensitively; a cross-household
  room refused; `rename_location_spot` renames the chores' and repairs'
  spots and refuses non-owners and other households;
- `closet_items`: staff read, can't write; a bag's pieces ticked back set
  `back_at`; settling a bag as missing sets `missing_since` on its unticked
  pieces, and it survives `prune_old_closet_trips` deleting that bag; a
  later return or Mark found clears it; a piece from another household or not in the bag refused;
- other households see nothing; logged-out callers get nothing; a removed
  staff member's id refused;
- the clean-up keeps an open bag's photos, keeps a closed bag's for 90 days
  and lists them after, keeps spot photos, lists an unreferenced
  `closet/` or `spots/` file after a day; `prune_old_closet_trips` deletes only closed
  bags older than 90 days;
- the export includes the four tables; every function's grants.

Applied local first, then staging, then production with the owner's OK,
before PR A merges (`main` deploys to production).

## Privacy (D10)

**Yes, this changes what Miamus stores.** New kinds of household data:

- photos of clothes going out and coming back, with counts, where they went
  (a laundry's or tailor's name), and **who borrowed what** (a name the
  household types);
- photos of the parts of a closet (or any room's saved spots);
- from PR B, photos of valuable pieces with a name and whose they are.

All of it is household data: **every session of the household can see it,
staff phones included** (staff do the laundry, so they must). The policy
says so, and the borrower field's hint says "a name only". No new service
(Supabase only, same region), no new place (the existing `household-logs`
bucket, under the household's folder). No push.

**The build PR (PR A) updates, in both languages:**

- `src/components/legal/privacy-policy.tsx`, **"What we store"**: a new
  item after Repairs and Bills: "Clothes going out and coming back: where
  they went (for example a laundry, a tailor, or who borrowed them: a name
  you type in), how many pieces, photos of what left and what came back, who
  logged it, and whether anything was missing. Photos of the parts of a
  closet or a room. Optional photos of valuable clothes, with a name and
  whose they are. Everyone in the household can see these, staff included."
- **"How long we keep it"**: "Clothes that went out, with their photos, are
  kept while they're out and for 90 days after they're back, then deleted
  automatically. Photos of closet parts and valuable clothes are kept until
  you delete them."
- The comment block at the top that lists retention rules by migration
  (add migrations/143).
- `src/config/legal.ts`: `policyVersion` bumped with a dated comment;
  `effectiveDate` updated. No change to contact details.

This docs PR changes neither file: nothing is stored differently until the
build.

## Rollout in PRs (D11)

**After Phase 168 PR A has merged** (migration 142, `placePath()`).

**PR A: what's out, and spots with photos** (migration 143, all tables)

- Migration 143 and its SQL tests.
- `src/lib/closet.ts` (pure, unit-tested): grouping bags, "usually N days"
  (median of the last 5, defaults), overdue, short/extra, labels in both
  languages.
- `HouseholdProvider`: `closetTrips`, `closetReturns`, `locationSpots`
  fetched with the rest, silent background refresh, optimistic add and
  Undo; bags and returns through the offline outbox (R10) with photos.
- Staff: **Pakaian keluar** and **Pakaian di luar** in the Lapor sheet;
  the two forms (`FoodPhotoField`, `compressPhoto`), `locale="id"`.
- Owners: Closet switch (Household → Rooms; 168's "Walk-in closet" quick
  name sets it), the closet part of the room sheet (spots grid, Out now),
  the Out now line and sheet in Chores → Rooms, the bag sheet with Still
  waiting / N missing / Miscounted / Found, the Today amber line.
- Spot chips in the chore and repair forms list saved spots first.
- Privacy policy and `legal.ts` (both languages); What's new cards (owners
  EN/ID, staff ID).

**PR B: valuable pieces** (no migration; 143 already has the tables)

- Add, edit, delete pieces (owners); the Valuable pieces group in the
  closet's sheet; ticking pieces into a bag and back (staff and owners);
  "At the dry cleaner since …" and "Missing since …".
- The tutorial's line for pieces.

Each PR: unit tests, Playwright on the stub (staff: send 12, receive 11, see
"Kurang 1"; owner: see the Today line, close as 1 missing, Undo; retake a
spot photo as staff), `tsc`, `next build`, CI, Codex until clean, migration
local → staging → production with the owner's OK, merge with the owner's
OK.

## Tutorial (What's new, shown once per role)

**Owners** (English or Bahasa Indonesia), PR A:

1. "Know what's out: when staff send clothes to the laundry, dry cleaner or
   tailor, they log the bag with a photo and a count." / "Tahu pakaian yang
   di luar: saat staf mengirim pakaian ke laundry, dry clean atau penjahit,
   mereka mencatatnya dengan foto dan jumlahnya."
2. "If fewer come back, you'll see it on Today and decide what happened." /
   "Kalau yang kembali kurang, Anda akan melihatnya di Hari ini dan
   memutuskan apa yang terjadi."
3. "Turn on **Closet** for a room and add a photo of each rack and drawer,
   so anyone knows where things go." / "Nyalakan **Lemari pakaian** untuk
   sebuah ruangan dan tambahkan foto setiap rak dan laci, supaya semua tahu
   tempatnya."

PR B adds: "Add your **valuable pieces** with a photo to see where each one
is." / "Tambahkan **pakaian berharga** dengan foto untuk melihat di mana
masing-masing berada."

**Staff** (Bahasa Indonesia only), PR A:

1. "Pakaian ke laundry atau dry clean? Ketuk **+ Lapor → Pakaian keluar**,
   isi jumlahnya, lalu foto."
2. "Saat pakaian kembali, ketuk **Terima kembali**, hitung, lalu foto."
3. "Lihat foto setiap rak di lemari pakaian supaya tahu tempatnya."

## Decisions for the owner

- **D1 — How a trip out is recorded.**
  **A (recommended):** one record per bag: kind, place, **count**, 1–3
  photos; pieces aren't listed (valuable ones can be ticked in, PR B). B:
  one record per piece, each with a photo (exact, but nobody photographs 12
  shirts at the gate). C: count only, no photo (quick, but nothing to check
  against when it comes back).
- **D2 — When fewer come back.**
  **A (recommended):** the bag stays open with "1 still out"; staff see
  "Kurang 1"; owners see it on Today and choose Still waiting, N missing
  or Miscounted; only owners close a short bag. B: staff choose "lost" on
  the spot. C: the bag closes at any count and the difference is only noted.
- **D3 — Statuses and who sets them.**
  **A (recommended):** Laundry, Dry clean, Tailor, Lent (with who, free
  text), Other; staff and owners send and receive all of them; staff need a
  photo, owners don't; only owners settle a short bag. B: staff can't log
  Lent (owners only). C: only Laundry and Dry clean.
- **D4 — Where it lives.**
  **A (recommended):** inside Chores → Rooms (closet rooms, their sheet, an
  Out now line), one amber line on Today only when something's overdue or
  missing, and staff use the Lapor sheet. No new tab or pill. B: a Closet
  page in Household. C: a fourth Chores pill, "Closet".
- **D5 — Overdue nudge.**
  **A (recommended):** "6 days, usually 3", learned from the household's
  last 5 bags (defaults before that), on screen only (Out now, the closet
  row, Today's line); no push in this phase. B: also one line in the 07:05
  morning reminder (137). C: no overdue at all.
- **D6 — Sections.**
  **A (recommended):** sections are **spots**, saved on their room with a
  photo (`location_spots`), usable in any room; chores and repairs keep
  their text spot, matched by name; staff can retake a photo. B: a
  closet-only "sections" table (a second word for the same thing). C: one
  photo of the whole closet, no sections.
- **D7 — Which rooms are closets.**
  **A (recommended):** a **Closet** switch on any room, several per house;
  bags are household-wide and may name their closet. B: one closet per
  household. C: closets only as rooms inside a bedroom.
- **D8 — Valuable pieces.**
  **A (recommended):** optional, in PR B: owners add a photo, name, whose
  it is and its spot; staff see them and tick them into bags. B: no
  catalogue. C: a catalogue of every garment.
- **D9 — Rooms inside rooms (suites).**
  **A (recommended):** build after Phase 168; a closet can be any room,
  top-level or inside a bedroom, shown with 168's path ("LT2 · Master
  Bedroom · Walk-in closet · Rack A"); 168's "Walk-in closet" quick name
  turns Closet on. B: build before 168 and move closets later (two
  migrations of the same data).
- **D10 — Who sees closet data.**
  **A (recommended):** everyone in the household, staff included (they do
  the laundry); the borrower is a name only; the privacy policy says so. B:
  owners only for Lent (staff can't log lending; less useful when a cousin
  collects a dress from staff).
- **D11 — Rollout.**
  **A (recommended):** PR A (migration 143 with all tables; bags, returns,
  spots with photos, privacy policy), then PR B (valuable pieces, no
  migration). B: one PR. C: spots with photos first, bags second.
- **D12 — How long bags are kept.**
  **A (recommended):** while out, then 90 days after they're back or
  closed, photos included (as finished food). B: 30 days (as chore photos;
  "usually N days" has less history). C: 1 year.

## Open questions only the owner can answer

1. **Lending**: should staff be able to log a dress lent out (D3 A), or is
   lending always the family's call (D3 B)?
2. **A shirt that never comes back**: is "N missing" enough, or do you want
   to record what the laundry paid back (an amount)? Amounts would make it
   owners-only data, like bill payments, and need their own table.
3. **Who it belongs to**: free text ("Ibu", "Raka") for now, or wait for the
   Care tab's family list before building PR B?

## Not in this phase

- A catalogue of every garment, outfits, or "what to wear".
- Drawn plans of a closet (photos do the job; roadmap "Not adding").
- Pushes about overdue or missing clothes (D5); a later phase can add a
  line to the 07:05 reminder.
- Paying the laundry, laundry prices, or what the laundry paid back for a
  lost piece (open question 2).
- Kakak reading the laundry's note or counting pieces in a photo (later,
  the paid extra).
- Linking laundry to chores ("Setrika" chores that tick off a bag).
- Moving pieces between spots with history ("moved from Rack A to B").
