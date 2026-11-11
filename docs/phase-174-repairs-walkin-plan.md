# Phase 174 — Repairs from the staff side: "Ada tukang datang"

Status: **plan, waiting for the owner's decisions (D1–D10).** Docs only: no
app code, no migration created or applied. Migration numbers are given in
build order when each PR is built ("number at build"; rule of 10 Nov).
Mockup: `docs/mockups/phase-174-repairs-walkin.html` (open in a browser,
phone width; staff screens in Bahasa Indonesia only; owner screens English
left, Bahasa Indonesia right). Roadmap row 36.

Builds on **Phase 159, Repairs** (`docs/phase-159-repairs-plan.md`,
migrations 130–131, live) and on **Phase 171's Repairs switch** (PR #87,
being built). It is not a new module: a walk-in is one more kind of visit on
an existing repair.

## The owner's situation (11 Nov)

> "Our house is new and we still have a lot of repairs. Every day there's a
> repair or maintenance guy. Our maids are the ones telling us there's this
> person, there's that person, fixing this and that. Make it so in the app
> they can easily put in 'fixing this', picture before, picture after. Staff
> view has Tugas Hari Ini and Dapur; make sure they also have a repair view."

Ari (house chores) and Syam (pets) are the ones who open the gate. Today
they tell the owners by voice; the owners remember, or don't.

## What exists (read 2026-11-11)

- **Staff can report** a problem: **Lapor → Lapor kerusakan**
  (`src/components/staff/staff-repairs.tsx`): room, spot, what's broken, a
  photo, urgent or not. It's saved as a repair with status `reported` and
  waits in the owners' **To review** (`repairs_guard`, migration 130/131:
  a staff phone can insert only `reported`, with no decision fields and no
  `fixed_by_name`).
- **Only owners can create a visit.** A visit is a chore with `repair_id`
  set (130), and `repair_id` is an owner-only column in
  `household_tasks_owner_guard`: a staff phone can't link a chore to a
  repair. The owner taps **Schedule a visit**, fills the chore form (who
  watches, date, time, the repair person's name), and the visit appears on
  the staff's list as "Awasi perbaikan: …" with **Foto sebelum diperbaiki**
  and **Foto sesudah diperbaiki**.
- **The gap:** a repair person who turns up unscheduled (most days, in a new
  house) can't be logged by staff at all. By the time an owner has created
  the repair and the visit, the work has started and the "before" is gone.
- **Repair photos are kept** while the repair is open and 2 years after it
  closes (130's `repair_keep_cutoff`, `task_photos_due_for_pruning`,
  `prune_closed_repairs`). Costs, receipts and warranty dates are owners
  only (131: `repair_costs`, the `owner-receipts` bucket, `warranty_until`).
- **Staff nav** (`src/app/staff/page.tsx`): one `<SegmentedControl />`,
  **Tugas Hari Ini · Dapur**, the view in `?view=` (`tugas`, `stok`).
- **Rooms** (`src/lib/room-picker.ts`, Phase 168): floors, rooms, rooms
  inside rooms, spots ("LT2 · Kamar Tamu 1 · Kamar Mandi · Keran").
- **Offline queue** (`src/lib/offline-queue.ts`, Phase 161): staff saves go
  to IndexedDB first, with the row id made on the phone, photos uploaded
  first (`photo-queue.ts`); a save survives a killed app and is never sent
  twice.
- **Live camera** (Phase 173 PR A, `docs/phase-173-pet-routines-plan.md`):
  `capture="environment"`, files more than 2 minutes old refused ("Ambil
  foto langsung dari kamera"), times the owner sees taken from the server.
- **Owner push preferences**: `user_preferences.staff_request_pushes`
  (139) is the model for a per-owner on/off; pushes are composed in the
  database in each owner's language (`queue_owner_push`, 114/132). Quiet
  hours 21.00–06.00 Jakarta exist for staff pushes (`staff_push_quiet`,
  141).
- **Phase 171** adds the **Repairs** switch: off hides the owners' Repairs
  pill and the staff's *Lapor kerusakan*.

## The idea in one line

**Staff log a repair person the moment the gate opens: what, who, a before
photo; then "Selesai" with an after photo.** Owners hear about it and see
before and after side by side, without creating anything first.

## Before and after

| | Today (walk-in) | After |
| --- | --- | --- |
| Who does it | Staff tell the owner by voice; an owner creates the repair, then the visit; then staff photograph | **Staff alone** |
| Owner taps | About 12, plus typing the problem and the name, usually after the work has started | **0** (1 to mark it Fixed, if they want) |
| Staff taps | About 7 (open the visit, before photo, after photo), only once the owner has made it | **About 11 for the whole visit**: 7 when the tukang arrives (6 with no name), 4–5 at Selesai. A new problem adds a few words. |
| The before photo | Usually missed: the work started while the visit was being made | Taken at the gate, before the tools come out |
| Who was in the house | In someone's memory | Name, time in, time out, per visit |
| Owners hear | When staff remember to say | A push on arrival and one at the end (each can be off) |

## What changes for people

| Who | What's new |
| --- | --- |
| Staff | A third pill, **Perbaikan**, shown only when Repairs is on: **Tugas Hari Ini · Dapur · Perbaikan**. |
| Staff | One big button, **Ada tukang datang**: what, who (optional), before photo, **Simpan**. Later, **Selesai** on the card: after photo, an optional chip and note, **Simpan**. |
| Staff | The pill also lists today's scheduled visits, what's still broken, and what was fixed in the last 7 days. **Lapor kerusakan** (no tukang yet) is there too, and stays in the Lapor sheet. |
| Owners | A push when someone arrives ("Pak Budi datang · keran LT2 · Kamar Tamu 1") and one when they finish, with before and after side by side on the repair. Each can be switched off in **Household → Notifications**; nothing between 21.00 and 06.00. |
| Owners | On **Today**, a quiet line while someone is working: "Pak Budi is here · Tap, LT2". |
| Owners | On a repair, each walk-in visit in the timeline: who, time in and out, before and after, the staff's chip and note. |
| Owners | **Send to the developer** in Chores → Repairs: the open problems with their photos, as a WhatsApp message or a page to save as PDF (owners only). |
| Owners | Optional: the same **Someone's here** sheet from Chores → Repairs, for days an owner opens the gate. |

Still five owner tabs. Costs stay owners only: nothing in this phase shows
staff any money.

## The staff screens (mockup 1–4)

1. **Perbaikan pill.** Top: the big **Ada tukang datang** button (wrench
   icon). Then, each only when it has something:
   - **Sedang dikerjakan**: open walk-ins, with the tint for things in
     progress. "Pak Budi · Keran bocor · LT2 · Kamar Tamu 1 · sejak 09.10"
     and a **Selesai** button.
   - **Hari ini**: scheduled visits for today (the existing "Awasi
     perbaikan" chores). Tapping one opens the chore sheet as now.
   - **Masih rusak**: open repairs and staff reports still **Menunggu
     dicek**, newest first.
   - **Sudah diperbaiki**: the last 7 days, with a before/after pair.
   - At the foot, a quiet **Lapor kerusakan** button (the existing sheet).
2. **Ada tukang datang** (one sheet, no wizard):
   - **Apa yang diperbaiki?** Open repairs as rows, those of the room picked
     last first; the last row is **Baru**, which opens one line, **Apa yang
     rusak?**, and the room chips (recent rooms first, then **Pilih
     ruangan**, the rooms list with rooms inside rooms; **Bagian (boleh
     dikosongkan)**). Required: a repair or the words for a new one. The
     room is optional, as for a report.
   - **Siapa? (boleh dikosongkan)**: name chips remembered from earlier
     visits ("Pak Budi · AC", "Tim developer"), and **Nama lain**. When a
     picked repair had a visit before, its last name is already chosen.
   - **Foto sebelum diperbaiki**: the live camera. The tile shows the photo
     once taken.
   - **Simpan**. Toast: "Tersimpan · Pemilik rumah diberi tahu" with
     **Batalkan** for 5 minutes.
3. **Selesai** (from the card): the before photo small at the top, **Foto
   sesudah diperbaiki** (live camera, required), three optional chips
   **Sudah beres** · **Belum selesai, datang lagi** · **Perlu dicek pemilik
   rumah**, an optional **Catatan (boleh dikosongkan)**, **Simpan**.
4. **The finished card** in Sudah diperbaiki (or Masih rusak, for "datang
   lagi"): before and after side by side, "Pak Budi · 09.10–11.40".

If a picked repair already has a visit scheduled **today**, the sheet opens
that visit's chore instead (its before photo), so nothing is logged twice.

**Forgotten Selesai.** A walk-in still open the next morning shows at the
top of Perbaikan as "Belum ditutup sejak kemarin" with the same **Selesai**
(the after photo is then a photo of how it looks now). Nothing closes on its
own, so the owner never sees a made-up time out.

**No new reading.** The button and the photo tiles say what to do; there's
no tutorial card for staff (stop rule). A 15-second video tip in the
existing tips list is optional.

## The owner screens (mockup 5–7)

5. **Pushes.** Arrival: title **Tukang datang** / **Repair person here**,
   body "Pak Budi · Keran bocor · LT2 · Kamar Tamu 1 (Ari)". Finished:
   **Perbaikan selesai** / **Repair finished**, body "Keran bocor · Pak
   Budi · Sudah beres". Tapping opens the repair. The finish push may carry
   the after photo where the browser shows images (Android Chrome); iPhone
   shows text only.
6. **The repair, before and after.** The timeline gains walk-in visits:
   "Walk-in · Pak Budi · Tue 09:10–11:40 · logged by Ari", before and after
   side by side, the chip ("Done" / "Coming back" / "Please check") and the
   note. A finished walk-in puts the repair in **Work done — check the
   photos** (the existing stage), unless the chip was "Coming back". Owner
   buttons are the existing **Fixed** / **Needs another visit**.
7. **Send to the developer.** From Chores → Repairs, a quiet button under
   the list. A sheet lists the open repairs, all ticked; untick what isn't
   the developer's. Each: number, what, where, reported on, the problem
   photo. Two buttons: **Share on WhatsApp** (the phone's share sheet with
   the text and the photos, where the phone allows files; otherwise the
   text) and **Save as PDF** (a print-ready page; the phone's print or save
   as PDF). Nothing is uploaded anywhere new and no public link is made.

A staff report made with **Baru** while the tukang is there skips **To
review** (someone is already fixing it): it shows in Open with its walk-in.

## Who was in the house, and privacy

- **What's kept per walk-in:** the repair person's name or company if staff
  typed one, the arrival and leaving times, the before and after photos,
  the chip and note, and which staff member logged it.
- **No photo of the worker's face** (D5 A). A photo of the work is enough
  for the owners; a face photo of a third party who never agreed is more
  personal data with no gain. The camera tile says **Foto bagian yang
  diperbaiki**, which steers away from people.
- **No phone number**, as in Phase 159's D5: the owners keep numbers in
  their own contacts.
- **Kept** with the repair: while it's open and 2 years after it closes
  (D8 A), then deleted with it by the nightly clean-up. An owner can delete
  a single visit sooner.
- **Times** are the server's: the time in is when the save reached the
  server, the time out when Selesai reached it. A save made without signal
  shows the phone's time with "sent later" (Phase 173's rule).

## The database (proposal; number at build)

Additive only. Follows `AGENTS.md`: new security-definer functions revoke
`EXECUTE` from `public, anon` (and `authenticated` where clients never call
them) and grant only what's needed, in the same file; admin-only actions go
through `caller_admin_household()` / `household_members`, never
`get_user_household_ids()` alone.

**Table `repair_visits`** (walk-ins; scheduled visits stay chores)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade; `unique (id, household_id)`. `id` made on the phone (offline queue). |
| `repair_id` | composite FK `(repair_id, household_id)` → `repairs (id, household_id)`, `on delete cascade` |
| `worker_name` | nullable, 1–60 characters after trimming (as `fixed_by_name`) |
| `logged_by_staff` | `staff_profiles` FK, nullable, `on delete set null`; an active profile of the household (119's rule) |
| `created_by` | `auth.uid()`, stamped |
| `arrived_at` | server time, stamped on insert (a trigger overwrites what the phone sends) |
| `arrived_phone_at` | the phone's time, for saves sent later; refused if more than 48 hours old or in the future |
| `before_photo_url` | not null; `household-logs`, `<household>/repairs/<repair>/…` |
| `left_at`, `left_phone_at` | null until Selesai; `left_at` server-stamped |
| `after_photo_url` | null until Selesai; check: `left_at` and `after_photo_url` both null or both set |
| `outcome` | nullable: `fixed`, `come_back`, `check` (the three chips) |
| `note` | nullable, up to 300 characters |

**RLS**

- Read: any session of the household (`get_user_household_ids()`), as
  `repairs`.
- Insert: owners, and staff phones with `logged_by_staff` active, on a
  repair of the same household that isn't `fixed` or `dismissed`.
- Update by a staff phone: **only** the finish (`left_phone_at`,
  `after_photo_url`, `outcome`, `note`), once, on a visit that isn't
  finished; a guard trigger refuses any other change. Owners may edit any
  column but the stamped ones.
- Delete: owners; a staff phone its own visit within 5 minutes (Undo), as
  with reports.
- No client-callable security-definer function.

**`repairs` with Baru:** unchanged. A staff phone still inserts `reported`;
the app shows a `reported` repair that has a walk-in under Open instead of
To review (`repairStage` in `src/lib/repairs.ts`), and the owner's Fixed
closes it as today.

**Names remembered:** no new table. The chips are the household's distinct
`worker_name`s from the last 90 days, most used first, up to 6, plus the
fixed chip **Tim developer**. Names go when their visits go (D3 A).

**Pushes (PR B):** two `boolean not null default true` columns on
`user_preferences`, `repair_arrival_pushes` and `repair_done_pushes`, read
and written like 139's `staff_request_pushes`. An `after insert` trigger
(arrival) and an `after update` trigger (finish) on `repair_visits` queue a
push to each owner who has it on, composed in the database in each owner's
language, skipped between 21.00 and 06.00 Jakarta (a twin of
`staff_push_quiet`), and skipped when the Repairs switch is off (171). Tag
`repair-visit-<id>`, so the finish push replaces the arrival push. Both
trigger functions are `security definer`, empty `search_path`, revoked from
`public, anon, authenticated`.

**Photos and retention:** `task_photos_due_for_pruning` (re-created in
131) is re-created again, same signature, definer and grants
(`service_role` only), so the Edge Function doesn't change:

- its `refs` gain the walk-in photos, kept while the repair is open and
  listed 2 years after it closes (`repair_keep_cutoff()`), like a scheduled
  visit's;
- its **`repairs_due` pass must skip any file a `repair_visits` row points
  at.** Today that pass lists every file under `<household>/repairs/` that
  no `repairs.photo_url` points at, once it's a day old. **Without this
  change, every walk-in photo would be deleted the night after it was
  taken.** A test covers it.

`orphaned_household_photos` (131) adds `repair_visits` to its `live_refs`.
`prune_closed_repairs` needs no change: deleting a repair cascades to its
walk-ins, and their now unreferenced files are removed by `repairs_due` the
next night. Deleting a visit or a repair from the app also removes its
photos through the Storage API at once.

**Export (127):** `export_household_data()` re-created (same definer,
admin check, grants) to include `repair_visits`.

**Tests** (rolled back): staff log and finish, can't edit after finishing,
can't change times or the repair, can delete their own within 5 minutes and
not after; archived staff refused; a visit on a fixed repair refused; other
households see nothing; logged-out callers get nothing; server times
overwrite the phone's; arrival and finish pushes go only to owners with the
setting on, none in quiet hours, none with Repairs off; retention keeps
visit photos of an open repair (including a walk-in photo two days old,
which `repairs_due` must not list) and lists those of a repair closed 2
years ago; the export includes visits; every new function's grants.

Applied: local first, then staging, then production with the owner's OK,
before the merge.

## Privacy policy and `legal.ts` (same PR as the table, both languages)

Add to the repairs section of `src/components/legal/privacy-policy.tsx`:

- **EN:** "When a repair person visits, staff can note their name or company
  (optional), when they arrived and left, and photos of the work before and
  after. We don't ask for their phone number and the app asks for photos of
  the work, not of people. Owners are notified when someone arrives and
  when the work is finished. These records are kept with the repair: while
  it's open and for 2 years after it's closed."
- **ID:** "Saat tukang datang, staf dapat mencatat nama atau perusahaannya
  (opsional), jam datang dan pulang, serta foto pekerjaan sebelum dan
  sesudah. Kami tidak meminta nomor HP mereka, dan aplikasi meminta foto
  pekerjaan, bukan foto orang. Pemilik diberi tahu saat tukang datang dan
  saat pekerjaan selesai. Catatan ini disimpan bersama perbaikannya: selama
  masih terbuka dan 2 tahun setelah ditutup."
- **Developer list (PR C):** "An owner can share a list of open repairs
  with photos, for example with the developer. Miamus doesn't send it: you
  choose who receives it through your own WhatsApp or file." / "Pemilik
  dapat membagikan daftar perbaikan yang masih terbuka beserta fotonya,
  misalnya ke developer. Miamus tidak mengirimkannya: Anda yang memilih
  penerimanya lewat WhatsApp atau berkas Anda sendiri."
- No new outside service. `policyVersion` bumped with a dated comment and
  `effectiveDate` updated in `src/config/legal.ts`.

## Stop rules, checked

- **No new required fields** beyond "what" and the two photos: the name,
  room, chip and note are all optional.
- **No new reading for staff**: one button, photo tiles that say what they
  are, chips. No tutorial card; a video tip at most.
- **One What's new card** this week, for owners: "Staff can now log a
  repair person as they arrive."
- Staff text Indonesian per the glossary; owner text EN/ID through `useT()`.
- No emoji or symbol characters: lucide `Wrench`, `HardHat`, `Camera`,
  `CircleCheck`, `Clock`, `Share2`, `FileText`.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Push title, arrival | Repair person here | Tukang datang |
| Push title, finished | Repair finished | Perbaikan selesai |
| Today quiet line | Pak Budi is here · Leaking tap, LT2 | Pak Budi sedang bekerja · Keran bocor, LT2 |
| Timeline row | Walk-in · Pak Budi · 09:10–11:40 · logged by Ari | Datang langsung · Pak Budi · 09.10–11.40 · dicatat Ari |
| Chips as owners read them | Done · Coming back · Please check | Sudah beres · Akan datang lagi · Mohon dicek |
| Owner button | Someone's here | Ada tukang datang |
| Notifications rows | When a repair person arrives · When a repair is finished | Saat tukang datang · Saat perbaikan selesai |
| Repairs button | Send to the developer | Kirim ke developer |
| Sheet lead | Open problems with photos. Untick what isn't the developer's. | Masalah yang masih terbuka beserta fotonya. Hapus centang yang bukan urusan developer. |
| Buttons | Share on WhatsApp · Save as PDF | Bagikan lewat WhatsApp · Simpan sebagai PDF |
| WhatsApp text head | Repair list, [house name], 11 Nov 2026: 6 items | Daftar perbaikan, [nama rumah], 11 Nov 2026: 6 item |

## Staff text (Bahasa Indonesia only)

| Where | Text |
| --- | --- |
| Pill | Perbaikan |
| Big button | Ada tukang datang |
| Sections | Sedang dikerjakan · Hari ini · Masih rusak · Sudah diperbaiki |
| Sheet fields | Apa yang diperbaiki? · Baru · Apa yang rusak? · Siapa? (boleh dikosongkan) · Nama lain · Foto sebelum diperbaiki |
| Camera tile hint | Foto bagian yang diperbaiki |
| Card | sejak 09.10 · Selesai |
| Finish chips | Sudah beres · Belum selesai, datang lagi · Perlu dicek pemilik rumah |
| Note | Catatan (boleh dikosongkan) |
| Toast | Tersimpan · Pemilik rumah diberi tahu · Batalkan |
| Forgotten | Belum ditutup sejak kemarin |

"Perlu dicek pemilik rumah" instead of the brief's "Bapak/Ibu": the glossary
calls owners **pemilik rumah** on staff screens ("Tunggu pemilik rumah"),
and a household-level Bapak/Ibu setting is planned for Kakak's go-live. When
that setting exists, the chip can follow it.

## Glossary rows to add (in PR A, before any Indonesian text)

| English | Bahasa Indonesia |
| --- | --- |
| A repair person is here (staff button) / Someone's here (owner) | **Ada tukang datang** |
| In progress / Still broken | **Sedang dikerjakan** / **Masih rusak** |
| Who? (optional, staff) / Other name | **Siapa? (boleh dikosongkan)** / **Nama lain** |
| Done / Not finished, coming back / Owner should check | **Sudah beres** / **Belum selesai, datang lagi** / **Perlu dicek pemilik rumah** |
| Walk-in (owner timeline) | **Datang langsung** |
| Repair person here / Repair finished (pushes) | **Tukang datang** / **Perbaikan selesai** |
| Send to the developer | **Kirim ke developer** |
| Not closed since yesterday | **Belum ditutup sejak kemarin** |

## Decisions for the owner

- **D1 — Where it lives for staff.** **A (recommended):** a third pill,
  **Perbaikan**, shown only with Repairs on; the visit is something staff
  come back to (Selesai), so it needs a place, not a one-off sheet. B: a
  button inside the Lapor sheet only.
- **D2 — Walk-ins and repairs.** **A (recommended):** every walk-in belongs
  to a repair; **Baru** makes one in the same step. Room history, "this sink
  again?" and the developer list all keep working. B: standalone visits with
  no repair.
- **D3 — The person's name.** **A (recommended):** one optional field with
  chips of recent names (90 days, up to 6) plus **Tim developer**; no phone
  number, no address book. B: a saved list of repair people the owners
  manage. C: no name.
- **D4 — Owner pushes.** **A (recommended):** both arrival and finish, each
  on by default and switchable per owner, none 21.00–06.00. B: finish only.
  C: arrival only. D: none, Today only.
- **D5 — A photo of the worker.** **A (recommended):** no; the work, not the
  person. B: optional face photo (needs consent wording and a policy line).
- **D6 — Visits over several days.** **A (recommended):** one visit per stay;
  "Belum selesai, datang lagi" closes today's, the repair stays at the top
  with the name ready for tomorrow (6 taps). A visit nobody closed asks
  again the next morning, never closes itself. B: one visit open across
  days until Selesai.
- **D7 — The developer list.** **A (recommended):** in-app list, shared
  through the phone's share sheet (WhatsApp text with photos) or saved as a
  PDF; no public link. B: a link the developer opens, valid 30 days (a new
  public page and a token table, plus a policy line). C: WhatsApp text only.
- **D8 — How long walk-in records are kept.** **A (recommended):** same as
  repairs: while open and 2 years after closing, names included. B: photos 2
  years, names and times 1 year.
- **D9 — Owners logging a walk-in.** **A (recommended):** the same sheet
  from Chores → Repairs (**Someone's here**), no extra screen. B: staff only.
- **D10 — Order of PRs.** **A (recommended):** PR A walk-ins and the
  Perbaikan pill (migration), PR B pushes and their settings (migration), PR
  C the developer list (no migration; can be built in parallel with B).
  B: the developer list first, as it needs no migration.

## Three PRs

**PR A: the Perbaikan pill and walk-ins** (migration, number at build): the
staff pill behind the Repairs switch, `?view=perbaikan` in the URL like the
other two (State Persistence), **Ada tukang datang** and **Selesai** through
the offline queue and photo queue, the live-camera rule from 173,
`repair_visits` with its RLS, guard, server times, retention, export and
tests; the owners' timeline rows, the Today quiet line, **Someone's here**
for owners (D9); the privacy policy and `legal.ts`; the glossary rows; the
owners' What's new card.

**PR B: owner pushes** (migration, number at build): the two
`user_preferences` columns, the two triggers, quiet hours, the two rows in
Household → Notifications.

**PR C: send to the developer** (no migration): the sheet, the share text,
the print page, the policy line.

## Questions only the owner can answer

1. Does the developer have a **retention or maintenance period** (masa
   pemeliharaan), and when does it end? If so, an owner task "Developer
   warranty ends" with **Remind me 1 week before** (Phase 164) is two taps
   today; worth adding before the list is sent.
2. Is the house's **developer contact** a WhatsApp group or a person? (It
   decides whether "Share on WhatsApp" is enough, or a PDF is needed for a
   formal complaint letter.)
3. Should **both owners** get the arrival push, or only one?
4. Is it fine that staff note a repair person's **name without telling
   them**? (Recommend yes for a name only; a question for the lawyer list
   if in doubt.)

## Not in this phase

- Guests, couriers and packages at the gate (roadmap row 19): the same
  visitor line could serve them later.
- Paying repair people, or showing staff any cost.
- A list of appliances with their own history.
- Kakak filing a walk-in from a voice note (later: "Pak Budi datang benerin
  keran").
