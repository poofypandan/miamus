# Phase 159 — Repairs

Status: **plan, waiting for the owner's decisions** (D1–D6 below). Nothing is
built yet. Mockups: `docs/mockups/phase-159-repairs.html` (open in a browser,
phone width). Builds on Phase 158 (rooms, floors and spots,
`docs/phase-158-rooms-plan.md`, PR #27).

## The problem

Things break: a cracked wall in the LT3 Music Room, a dripping tap, an AC that
leaks. Today they live in WhatsApp and memory:

- nobody can see what's broken, where, and whether someone is coming;
- staff notice problems first but have no simple way to say so;
- when a repair person comes, there's no record of what was done, no before
  and after photos, and no history per room ("this sink again?").

## What the app already has

- Chores have a **Maintenance / Perbaikan** category.
- Finishing a chore needs a **before and an after photo**, enforced by the
  database (migration 104). Staff already know these steps.
- Chore photos are deleted **30 days** after the chore is done (migrations
  101–102). Repair photos are evidence, so they need their own rule.
- Staff can send **suggestions owners accept or reject** (routine proposals,
  the Approval Queue).
- **Push notifications** to owners, sent by a database trigger (migration 103,
  the sick-report alert).
- Phase 158 adds **floors, rooms and spots** ("LT2 · GB2 Bathroom · Sink").

So a repair isn't a new world: it's **a reported problem, in a room, fixed by
one or more visits**. A visit is an ordinary Maintenance chore with the usual
before and after photos.

## What changes for people

| Who | What's new |
| --- | --- |
| Owners | **Chores → Repairs** (third pill: **Today · Rooms · Repairs**, Indonesian **Hari ini · Ruangan · Perbaikan**): what's waiting for you, what's open, what's fixed. **Report a problem** from there or from a room. |
| Owners | A quiet line on **Today**, only when there is any: "1 repair to review" / "1 repair done — check the photos". |
| Owners | **Push notification** when staff report something urgent (D6). |
| Staff | **Lapor kerusakan** in the existing Laporan & Usulan sheet: room, spot, what's wrong, a photo, urgent or not. |
| Staff | A repair visit shows up as a chore ("Awasi perbaikan: dinding retak · Pak Budi"). They take the **before photo** when the repair person starts and the **after photo** when they finish, using the same steps as chores. |
| Staff | Their reports show what happened: Menunggu dicek · Diterima · Dijadwalkan · Sudah diperbaiki · Tidak perlu (with the owner's reason). |
| Both | Each room's sheet (Phase 158) has a **Repairs** section: open ones first, then history with photos. |

Still five tabs. Manual-first: no AI needed (Kakak can file reports later).

## A repair, step by step

1. **Reported.** An owner reports it, and it's straight on the list (status
   *open*). Or staff report it: it waits in **To review** until an owner taps
   **Accept** or **Not needed** (with an optional reason staff see). (D2)
2. **Scheduled.** An owner taps **Schedule a visit**. The usual chore form
   opens, filled in:
   - title "Perbaiki: dinding retak";
   - category Maintenance, with the room and spot;
   - who watches (a staff member, or the owner);
   - the date and time;
   - the repair person's name (D5).
   The visit is linked to the repair.
3. **The visit.** The repair person comes. Staff (or the owner) open the
   visit: **before photo** at the start, **after photo** at the end. Same
   sheet, same rule as every chore.
4. **Work done → check.** When a linked visit is finished and no other visit
   is pending, the repair shows **Work done — check the photos**. The owner
   taps **Fixed** or **Needs another visit** (which opens step 2 again).
5. **Fixed.** It moves to history, in the room's sheet, with every visit's
   photos, who did it, and (owners only, D4) what it cost.

Several visits per repair are normal (the repair person comes back with a
part), so a visit finishing never closes the repair on its own.

## The screens (mockups 1–6)

1. **Staff: Lapor kerusakan.** Room (picked by floor), spot, labelled
   **Bagian (boleh dikosongkan)** as the glossary asks for staff forms (chips
   of that room's spots, or new), **Apa yang rusak?** (required), photo (camera
   first, strongly suggested), **Darurat** switch with a hint ("bocor,
   listrik, gas — pemilik langsung diberi tahu"). **Kirim**. Then: "Terkirim
   ke pemilik rumah", and Undo for 5 minutes.
2. **Owners: Repairs list.** **Report a problem** button. Then, each only
   when it has something:
   - **To review** (staff reports, with Accept / Not needed);
   - **Open**: each row reads Not scheduled, *Thu 10:00 · Pak Budi* (Indonesian: *Kam 10.00*, with the glossary's dot), or
     *Work done — check the photos*;
   - **Fixed** (the last 30 days; older ones in the rooms' history).
   Urgent ones are first and have the only coloured tint. Nothing else is red.
3. **Owners: a repair.** The problem photo, room · spot, who reported it and
   when, then a timeline: reported, accepted, each visit with its before and
   after photos side by side, fixed. Repair person. Cost and receipt (owners
   only). Buttons depend on the state: Schedule a visit · Fixed · Needs
   another visit. Quiet links: Edit, Delete.
4. **Staff: the visit.** The usual chore sheet, with the repair's problem
   photo at the top, and the photo steps worded for repairs: **Foto sebelum
   diperbaiki**, **Foto sesudah diperbaiki**.
5. **Room sheet → Repairs** (Phase 158's sheet): open repairs first, then
   history: "Dinding retak · diperbaiki 3 Okt · Pak Budi" with a before/after
   thumbnail pair. The Rooms view gets a **Repairs** chip: which rooms have
   something open.
6. **Today line** (owners), as above.

## The database — migration 129 (next free number when built)

Additive only. Assumes Phase 158's migration 128 (floors, `spot`) is applied
first.

**Table `repairs`**

| Column | |
| --- | --- |
| `id`, `household_id` | household FK, cascade on household delete; `unique (id, household_id)` for the composite keys below |
| `location_id` | nullable; composite FK `(location_id, household_id)` → `household_locations`, `on delete set null (location_id)` |
| `spot` | nullable, 1–40 characters (as `household_tasks.spot`) |
| `title` | what's wrong, 1–120 characters |
| `details` | nullable, up to 500 characters |
| `photo_url` | nullable; household-logs bucket, `<household>/repairs/…` |
| `urgent` | boolean, default false |
| `status` | `reported` (staff, waiting), `open`, `fixed`, `dismissed` |
| `reported_by_staff` | `staff_profiles` FK, nullable, `on delete set null` (self-declared, like every `staff_id`) |
| `created_by` | `auth.uid()` of the session that reported it |
| `decided_by`, `decided_at` | who accepted or dismissed a staff report |
| `dismiss_reason` | nullable, up to 200 characters, shown to staff |
| `fixed_by_name` | nullable, up to 60 characters: the repair person (D5) |
| `closed_at` | stamped by the server when it becomes `fixed` or `dismissed` |

"Scheduled" and "work done" are **derived** from the linked visits, not
stored, so they can't disagree with the chores.

**Table `repair_costs`** (D4, owners only, PR B): `repair_id` (PK),
`household_id`, `amount_idr` (bigint, ≥ 0), `receipt_photo_url`, `note`. The
key to the repair is composite, `(repair_id, household_id)` →
`repairs (id, household_id)`, `on delete cascade`, so a cost can only ever
belong to a repair of its own household, whatever ids a client sends.
Separate from `repairs` so staff phones can never read costs.

**Receipt photos live in their own owner-only bucket**, not in
`household-logs`. Migration 092's `tenant_read_household_logs` lets every
session of the household, staff phones included, read any `household-logs`
object, and `/api/photo` relies on those policies; a receipt there would show
staff the amount even though `repair_costs` is closed to them. So PR B adds a
private bucket **`owner-receipts`** (`<household>/<repair>/…`), with Storage
policies that allow select, insert and delete only to a `household_members`
row of that household (never `get_user_household_ids()`), the same type and
size limits as the photo buckets, and adds it to `isPhotoBucket`
(`src/lib/photos.ts`) so `/api/photo` serves it through those policies. No
change to 092's policies. Tests: a staff session can't list, read or upload
in `owner-receipts`; an owner of another household can't either; the nightly
clean-up removes receipts with the repair.

**`household_tasks.repair_id`**: nullable; composite FK `(repair_id,
household_id)` → `repairs (id, household_id)`, `on delete set null
(repair_id)`. A visit is a chore with this set. `repair_id` joins Phase
158's owner-only column list (`household_tasks_owner_columns`): a staff phone
can't link or unlink a visit, and a materialised day copies the template's
`repair_id`.

**Who may do what (RLS)**

- Read repairs: any session of the household (owners and staff phones,
  `get_user_household_ids()`).
- Report: owners insert as `open`. Staff phones insert only as `reported`,
  with `reported_by_staff` an active (not archived) profile of the household
  (119's rule), and no decision fields: a guard trigger refuses anything else.
- Staff may delete **their own** `reported` row within 5 minutes (Undo), as
  with routine proposals. Nothing else.
- Accept, dismiss, edit, close, delete: owners only, through a
  `household_members` check (`caller_admin_household()`), never
  `get_user_household_ids()` alone (AGENTS.md).
- `repair_costs`: owners only, read and write.
- No new `SECURITY DEFINER` function callable by clients. Every function
  created or replaced revokes `EXECUTE` from `public, anon` and grants only
  what is needed, in the same file.

**Urgent push (D6)**: an `after insert` trigger, like 103's sick report: an
urgent report from a staff phone queues a push to every owner of the
household, composed in the database in each owner's language ("Perbaikan
darurat: LT2 · GB2 Bathroom · Wastafel — bocor" / "Urgent repair: …"). No
client chooses the text.

**Photos and how long things are kept (D3)**

- A repair's photos (the problem photo, every visit's before and after
  photos, the receipt) are kept **while the repair is open, and for 2 years
  after it's closed**. Then the nightly clean-up deletes the photos and the
  repair.
- The 30-day chore rule doesn't touch a visit while its repair exists:
  `task_photos_due_for_pruning` treats a task with `repair_id` as expiring
  2 years after the repair's `closed_at`, never while it's open. If the owner
  deletes a repair, its visits fall back to the normal 30-day rule.
- Deleting a repair removes its own photos straight away through the Storage
  API (as food does); the nightly job is the safety net. Same Edge Function,
  same secret:
  - visit photos in `household-logs` go through the existing
    `task_photos_due_for_pruning` (re-created, re-revoked, `service_role`
    only);
  - everything else a repair holds (its problem photo, and in PR B its
    receipts in `owner-receipts`) goes through a new
    `repair_photos_due_for_pruning(p_secret, p_limit)` that returns
    `(bucket_id, name)`. `prune-task-photos/index.ts` gets one more pass that
    removes them per bucket, the way PR #22's deleted-household pass already
    does (`orphaned_household_photos`, also `(bucket_id, name)`). The
    existing pass hard-codes `household-logs`, so without this receipts would
    never be deleted. The updated Edge Function is deployed with the
    migration, staging then production.
  - Tests: a receipt of a repair closed 2 years ago is listed with
    `owner-receipts`; one of an open repair is not.

**Export and deletion (R7, migration 127)**: **a prerequisite.** Migration
127 is in PR #22, applied to staging and production on 2026-11-09 but not yet
merged, so it isn't in `main`'s migrations. PR #22 must merge before this
phase is built. Then `export_household_data()` is re-created (same
`security definer`, empty `search_path`, admin check through
`caller_admin_household()`, revoked from `public, anon`, granted to
`authenticated`) to include repairs and their costs (the export is
admin-only). Household deletion already cascades, and 127's orphaned-photo
sweep is extended to `owner-receipts`.

**Tests**: `supabase/tests/129_repairs.sql`, rolled back:
- owners report, accept, dismiss, close;
- staff phones report only as `reported`, can't decide, can't edit, can
  delete their own within 5 minutes and not after;
- archived staff refused;
- other households see nothing; logged-out callers get nothing;
- staff can't read `repair_costs`;
- an urgent staff report queues one push per owner, a normal one none;
- photo retention: a visit of an open repair is never due, one of a repair
  closed 2 years ago is, and one whose repair was deleted follows 30 days;
- the export includes repairs;
- every new function's grants.

Applied: local first, then staging, then production with the owner's OK,
before the merge.

## Privacy policy and `legal.ts` (same PR, both languages)

- New kind of data: **repairs**. What broke, where, photos of the problem and
  of the work before and after, who reported it, who fixed it (a name you
  type in, for example the repair person), and, for owners only, the cost and
  a receipt photo.
- Kept: while open, and 2 years after it's closed; then deleted.
- Urgent staff reports send owners a notification.
- No new outside service (Supabase only, same region).
- `policyVersion` bumped with a dated comment; `effectiveDate` updated.

## Two PRs

**PR A: report, review, visit, fix**: migration 129 (without
`repair_costs`), the staff report, the owners' Repairs pill and detail,
scheduling a visit through the chore form, "work done → check", the rooms'
Repairs section and chip, the Today line, the urgent push, the photo
retention, the export, the privacy policy, the tutorial.

**PR B: costs, receipts and notes**: `repair_costs` and the `owner-receipts` bucket (owners only), a short
**notes thread** on a repair for owners and staff ("the repair person needs a
part, back Thursday", with an optional photo), repair-person name
suggestions from earlier repairs, and an optional warranty end date.

## Decisions for the owner

- **D1 — Where repairs live.** **A (recommended):** a third pill in Chores,
  **Today · Rooms · Repairs**, next to the rooms they belong to. B: a page in
  the Household tab.
- **D2 — Staff reports.** **A (recommended):** they wait for an owner to
  accept, so the list only holds what you agreed needs doing. B: straight on
  the list.
- **D3 — How long repair photos and records are kept.** **A (recommended):**
  2 years after the repair is closed (covers most warranties and repeat
  problems). B: 1 year. C: until you delete them.
- **D4 — Cost and receipt.** **A (recommended):** optional, owners only;
  staff never see costs. B: leave out.
- **D5 — The repair person.** **A (recommended):** a name only ("Pak Budi,
  tukang AC"), no phone number. Their number stays in your phone's contacts,
  and Miamus holds less personal data. B: name and phone number (one more
  line in the privacy policy).
- **D6 — Notifications.** **A (recommended):** a push only when staff mark a
  report **urgent**; normal reports show on Today. B: a push for every staff
  report.

## Tutorial (shown once, per role)

**Owners** (English or Bahasa Indonesia):

1. "Something broken? **Chores → Repairs → Report a problem**: pick the
   room, add a photo." / "Ada yang rusak? **Tugas → Perbaikan → Lapor
   kerusakan**: pilih ruangan, tambahkan foto."
2. "Staff can report too: you accept or dismiss in **To review**." / "Staf
   juga bisa melapor: terima atau tolak di **Perlu dicek**."
3. "**Schedule a visit** and staff take before and after photos while the
   repair person works. Each room keeps its repair history." / "**Jadwalkan
   perbaikan**, staf mengambil foto sebelum dan sesudah selama tukang
   bekerja. Riwayat perbaikan tersimpan per ruangan."

**Staff** (Bahasa Indonesia only):

1. "Lihat ada yang rusak? Ketuk **Lapor → Lapor kerusakan**, pilih ruangan,
   ambil foto."
2. "Kalau bocor, listrik atau gas, nyalakan **Darurat**: pemilik rumah
   langsung diberi tahu."
3. "Saat tukang datang, buka tugas perbaikannya: **foto sebelum** saat mulai,
   **foto sesudah** saat selesai."

## Glossary rows to add (before any Indonesian text)

| English | Bahasa Indonesia |
| --- | --- |
| Repairs (pill) / Repair | **Perbaikan** (matches the existing category) |
| Report a problem | **Lapor kerusakan** |
| What's wrong? | **Apa yang rusak?** |
| Urgent | **Darurat** (as the sick-report "laporan darurat") |
| To review | **Perlu dicek** |
| Accept / Not needed | **Terima / Tidak perlu** |
| Schedule a visit | **Jadwalkan perbaikan** |
| Repair person | **Tukang** |
| Work done — check the photos | **Pekerjaan selesai — cek fotonya** |
| Fixed / Needs another visit | **Sudah diperbaiki / Perlu datang lagi** |
| Before / after the repair (photos) | **Foto sebelum diperbaiki / sesudah diperbaiki** |
| Cost / Receipt | **Biaya / Nota** |
| Spot, on the staff report form | **Bagian (boleh dikosongkan)** (staff forms never say "opsional") |

## When

1. PR #22 (migration 127, household export and deletion) merged: required.
2. Phase 158 PR A (Rooms view), then PR B (floors and spots, migration 128).
3. **Phase 159 PR A** (this plan), then PR B.
4. Kakak's go-live runs in parallel. Later, Kakak can file a report from one
   sentence ("AC kamar utama bocor").

## Not in this phase

- A list of appliances (each AC unit, the water heater) with their own
  history. Spots ("AC") cover most of it for now.
- Repeating maintenance (AC service every 3 months, water filter, pest
  control): already possible as repeating Maintenance chores with a spot,
  once Phase 158 lands; "last serviced" comes with Phase 158's "last done".
- Paying repair people through the app.
