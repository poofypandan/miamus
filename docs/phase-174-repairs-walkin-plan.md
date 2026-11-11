# Phase 174 — Repairs from the staff side: "Ada tukang datang"

Status: **decided: owner chose all recommendations (D1–D12 A), 2026-11-11;
PR A first.** Docs only: no
app code, no migration created or applied. Migration numbers are given in
build order when each PR is built ("number at build"; rule of 10 Nov).
Mockup: `docs/mockups/phase-174-repairs-walkin.html` (open in a browser,
phone width; staff screens in Bahasa Indonesia only; owner screens English
left, Bahasa Indonesia right). Roadmap row 36.

**Decided** (2026-11-11, through the manager): "Yes, all recommended": D1–D12
all A. Still open: question 1, the developer's warranty (masa
pemeliharaan) and when it ends.

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
| Why a task wasn't done | "I was watching the tukang", said later, if at all | **Shown on its own**: tasks due while Ari was supervising read "Ari was supervising the AC repair 10:00 AM–1:30 PM" on Today and in the evening summary, with **0 extra taps** (D10 A) |

## What changes for people

| Who | What's new |
| --- | --- |
| Staff | A third pill, **Perbaikan**, shown only when Repairs is on: **Tugas Hari Ini · Dapur · Perbaikan**. |
| Staff | One big button, **Ada tukang datang**: what, who (optional), before photo, **Simpan**. Later, **Selesai** on the card: after photo, an optional chip and note, **Simpan**. |
| Staff | Whoever taps **Ada tukang datang** is **Mengawasi perbaikan** (supervising) until **Selesai**: a strip on top of Tugas Hari Ini with the start and running time, and their tasks due meanwhile marked **Mengawasi perbaikan**, with nothing to fill in. **Ganti yang mengawasi** hands over to someone else. |
| Staff | The pill also lists today's scheduled visits, what's still broken, and what was fixed in the last 7 days. **Lapor kerusakan** (no tukang yet) is there too, and stays in the Lapor sheet. |
| Owners | A push when someone arrives ("Pak Budi datang · keran LT2 · Kamar Tamu 1") and one when they finish, with before and after side by side on the repair. Each can be switched off in **Household → Notifications**; nothing between 21.00 and 06.00. |
| Owners | On **Today**, a quiet line while someone is working: "Pak Budi is here · Leaking tap, LT2". |
| Owners | Missed tasks explain themselves: "Not done: Mop the terrace (Ari was supervising the AC repair 10:00 AM–1:30 PM)" in the evening summary and its sheet; and the queued **staff progress on Today** can show "Ari · Supervising a repair since 10:00 AM". |
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
   "Walk-in · Pak Budi · Tue 9:10–11:40 AM · logged by Ari", before and after
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

## Supervising a repair: "Mengawasi perbaikan" (core)

The owner, 11 Nov: "For repairs we usually have our maids monitor them, so
we can also see why they can't do certain tasks because they're occupied
doing this and that."

**Who supervises.** Whoever taps **Ada tukang datang** supervises that visit
from the save until **Selesai**. On the Selesai sheet and on the open card,
**Ganti yang mengawasi** hands over to another staff member (or to an
owner): Ari starts cooking, Syam takes over. Each person's stretch is kept
with its own start and end, so each one's tasks are explained for their own
time only (D11 A).

**What staff see** (mockup 7):

- On **Tugas Hari Ini**, a strip at the top for the supervising person
  only: **Sedang mengawasi perbaikan** · AC menetes · sejak 10.00 · 1 jam 20 menit,
  with **Selesai**. It's the same open visit as in the Perbaikan pill, so
  Selesai works from either.
- Their tasks due while they supervise carry a quiet label **Mengawasi
  perbaikan** instead of turning late. Nothing to tap, nothing to type.
  If they get to a task anyway, it's done as usual (**done wins**, Phase
  165).
- The **Tidak bisa dikerjakan** sheet (139) gains the reason **Mengawasi
  perbaikan**, offered only on a day the person supervised, and chosen
  already when the task's time falls in their stretch. It's for the edge
  cases auto-explain doesn't cover (a task just after the tukang left, a
  task with no time). Choosing it needs no note and links the visit.

**Auto-explain (D10 A, recommended).** Miamus explains a missed task itself,
at the moment it shows it; nothing is written for the staff member.

- **Which tasks:** not done, not marked couldn't-do, due today with a time,
  and that time inside the person's supervising stretch (from 15 minutes
  before it started to when it ended, or now while it's open).
- **Whose tasks:** a chore for that staff member. A chore for anyone, and a
  pet routine (which has no assignee), only when **every** staff member on
  duty that day (not on leave, 137's rule) was supervising at that time;
  otherwise someone else could have done it, and it stays plainly "not
  done".
- **Tasks with no time** aren't explained; the summary shows the stretch as
  context ("Ari supervised a repair for 3 h 20 min today").
- **Still not done:** an explained task counts as not done everywhere
  (counts, the evening summary's "Not done" part), with the reason beside
  it. It never turns into done, and nothing is hidden from the owner.
- **Why not write a couldn't-do row for each task automatically:** that
  would put words in staff's mouth in a table that means "staff said so"
  (139), and a task done later would leave a stale row. Reading it from the
  stretches at display time keeps one source of truth, and a late "done"
  wins on its own.

**What owners see** (mockup 8):

- **Evening summary push** (139's `notify_evening_summary`, re-created):
  explained tasks go in "Not done" with the stretch in brackets, once per
  stretch, not per task. EN: *Not done: Mop the terrace, Iron clothes (Ari
  was supervising the AC repair 10:00 AM–1:30 PM).* ID: *Belum: Pel teras,
  Setrika baju (Ari mengawasi perbaikan AC 10.00–13.30).*
- **The summary sheet** groups them under the stretch: "Ari · supervising
  the AC repair · 10:00 AM–1:30 PM" with the two tasks, and a tap opens the
  repair with its before and after photos.
- **Staff progress on Today** (queued build): one row per staff member, e.g.
  **Ari · Supervising a repair since 10:00 AM** / **Ari · Mengawasi
  perbaikan sejak 10.00**, beside "4 of 9 done". After Selesai the row goes
  back to normal and the stretch shows in the day's detail.
- **The repair's timeline**: "Supervised by Ari 9:10–10:30 AM, then Syam
  10:30–11:40 AM".

**The data the staff progress build needs** (built in PR A as pure
functions in `src/lib/repairs.ts`, with unit tests, so that build only
reads them):

- `supervisingNow(spans, now)`: a map from staff id to `{ visitId,
  repairId, repairTitle, placeLabel, since }` for open stretches. At most one
  per person (a person who starts a second visit hands the first over or
  closes it; the sheet asks).
- `supervisionSpansOn(spans, day)`: per staff id, the day's stretches
  `{ visitId, repairTitle, start, end | null }`, clipped to the day.
- `supervisionExplains(task, spans, staffOnDuty)`: the stretch that
  explains a missed task, or null (the rules above). Used by staff Today,
  owner Today, the summary sheet and, mirrored in SQL, the summary push.
- Source: `repair_supervision` rows (below), readable by every session of
  the household, loaded with the repairs the dashboard already fetches.

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

**Table `repair_supervision`** (who supervised, from when to when; PR A)

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade |
| `visit_id` | composite FK `(visit_id, household_id)` → `repair_visits (id, household_id)`, `on delete cascade` |
| `staff_id` | `staff_profiles` FK, nullable, `on delete set null`; an active profile of the household. Null with `user_id` set for an owner. |
| `user_id` | nullable; an owner (`household_members`) who took over |
| `started_at`, `ended_at` | server times; `ended_at` null while open; `unique (visit_id) where ended_at is null`: one open stretch per visit |

- **Opened and closed by triggers**, not by the app: inserting a walk-in
  opens the logger's stretch; finishing the visit closes the open one;
  inserting a new stretch for a visit (Ganti yang mengawasi) closes the
  previous one at the same server time. So the times can't disagree with
  the visit.
- RLS: read by any session of the household (staff progress and the staff
  strip need it). Insert by staff phones (an active profile) and owners, on
  an unfinished visit of the household. **No update or delete policy for
  clients**; only the triggers change `ended_at`. Owners correct a mistake
  by editing the visit.
- One person can't hold two open stretches: the insert trigger refuses it
  (`supervision_busy`), and the sheet asks to hand over or finish the other
  visit first.
- **Kept 90 days**, like couldn't-do records (139, D4): a nightly job
  deletes stretches older than that. They exist to explain a day's work,
  not as a long record of staff time. The visit keeps who logged it for as
  long as the repair is kept.
- Trigger functions `security definer`, empty `search_path`, revoked from
  `public, anon, authenticated`.

**`task_exceptions` (139), the reason** (D10): `task_exceptions_reason_check`
re-created with one more value, `supervising_repair`, and a nullable
`repair_visit_id` with a composite FK to `repair_visits`, `on delete set
null`. Recommended over reusing `other`, because `other` requires a note of
at least 3 characters (`task_exceptions_other_has_note`), which is typing,
and a typed reason can't link the visit or be counted. The guard checks the
visit belongs to the household. `exception_reason_label` gains the label
in both languages. Old app builds never send the value, so nothing breaks.

**Evening summary** (PR B): `notify_evening_summary` re-created from its
latest definition (not `security definer`, cron only, as in 139) so that a
not-done chore or routine slot explained by a stretch is labelled with it,
once per stretch: an SQL twin of `supervisionExplains`, tested against the
same cases as the TypeScript one.

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
Supervision: a walk-in opens the logger's stretch, Selesai closes it, a
hand-over closes one and opens the next at the same time; a person can't
hold two; clients can't update or delete stretches; stretches older than
90 days go; the `supervising_repair` reason links only a visit of the same
household; the evening summary labels a chore due inside a stretch and not
one outside it, a routine only when every staff member on duty was
supervising, and nothing that was done.

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
- **Supervising (staff data):** "When a staff member supervises a repair,
  Miamus notes who supervised and from when to when, to show owners why a
  task wasn't done at that time. These times are kept 90 days." / "Saat staf
  mengawasi perbaikan, Miamus mencatat siapa yang mengawasi dan dari jam
  berapa sampai jam berapa, untuk menunjukkan kepada pemilik mengapa suatu
  tugas belum dikerjakan pada waktu itu. Catatan waktu ini disimpan 90
  hari."
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
| Timeline row | Walk-in · Pak Budi · 9:10–11:40 AM · logged by Ari | Datang langsung · Pak Budi · 09.10–11.40 · dicatat Ari |
| Timeline, supervision | Supervised by Ari 9:10–10:30 AM, then Syam 10:30–11:40 AM | Diawasi Ari 09.10–10.30, lalu Syam 10.30–11.40 |
| Evening summary, explained | Not done: Mop the terrace, Iron clothes (Ari was supervising the AC repair 10:00 AM–1:30 PM). | Belum: Pel teras, Setrika baju (Ari mengawasi perbaikan AC 10.00–13.30). |
| Summary sheet group | Ari · supervising the AC repair · 10:00 AM–1:30 PM | Ari · mengawasi perbaikan AC · 10.00–13.30 |
| No-time context | Ari supervised a repair for 3 h 20 min today | Ari mengawasi perbaikan 3 jam 20 menit hari ini |
| Staff progress row | Ari · Supervising a repair since 10:00 AM | Ari · Mengawasi perbaikan sejak 10.00 |
| Couldn't-do reason (owner label) | Supervising a repair | Mengawasi perbaikan |
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
| Tugas Hari Ini strip | Sedang mengawasi perbaikan · sejak 10.00 · 1 jam 20 menit · Selesai |
| Task label while supervising | Mengawasi perbaikan |
| Hand-over | Ganti yang mengawasi |
| Couldn't-do reason | Mengawasi perbaikan |

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
| Supervising a repair (staff strip, task label, couldn't-do reason) | **Mengawasi perbaikan** / **Sedang mengawasi perbaikan** |
| Hand over supervision | **Ganti yang mengawasi** |
| Supervised by | **Diawasi** |

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
- **D10 — Explaining missed tasks while supervising.** **A
  (recommended):** auto-explain: Miamus labels a missed task due inside the
  person's supervising stretch by itself (0 taps), and the couldn't-do sheet
  also offers a new reason **Mengawasi perbaikan** (no note, linked to the
  visit) for the edge cases. B: manual only, the new reason pre-selected
  inside the stretch (1–3 taps per task, and often skipped). C: auto only,
  no new reason. D: manual, reusing **Lainnya** with a typed note (typing,
  and no link).
- **D11 — Who supervises.** **A (recommended):** whoever logged the visit,
  with **Ganti yang mengawasi** to hand over; each stretch kept separately.
  B: fixed to whoever logged it.
- **D12 — Order of PRs.** **A (recommended):** PR A walk-ins and the
  Perbaikan pill (migration), PR B pushes and their settings (migration), PR
  C the developer list (no migration; can be built in parallel with B).
  B: the developer list first, as it needs no migration.

## Three PRs

**PR A: the Perbaikan pill, walk-ins and supervising** (migration, number
at build): the staff pill behind the Repairs switch, `?view=perbaikan` in the URL like the
other two (State Persistence), **Ada tukang datang** and **Selesai** through
the offline queue and photo queue, the live-camera rule from 173,
`repair_visits` with its RLS, guard, server times, retention, export and
tests; `repair_supervision` with its triggers and 90-day clean-up, the
**Sedang mengawasi perbaikan** strip, the task label, **Ganti yang
mengawasi**, the `supervising_repair` couldn't-do reason, the pure helpers
the staff progress build reads, and the summary sheet's grouping; the
owners' timeline rows, the Today quiet line, **Someone's here**
for owners (D9); the privacy policy and `legal.ts`; the glossary rows; the
owners' What's new card.

**PR B: owner pushes and the evening summary** (migration, number at
build): the two `user_preferences` columns, the two triggers, quiet hours,
the two rows in Household → Notifications, and `notify_evening_summary`
re-created to explain tasks missed while supervising.

**Staff progress on Today** (queued separately) reads PR A's helpers; it
needs nothing else from this phase.

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
