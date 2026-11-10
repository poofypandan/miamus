# Phase 165: "Tidak bisa dikerjakan" and the evening summary

Status: **plan and mockup for the owner's decisions. Nothing built.**
Audit batch **B2** (`docs/product-audit-2026-11-09.md`, items 1 and 2, "one
plan with mockups, they share the evening summary"). Mockup:
`docs/mockups/phase-165-couldnt-do.html` (open in a browser, phone width).
Migration **139** is reserved for it (137 is bills reminders, PR #60; 138 is
bill payments). Nothing here is created yet.

## The problem

Paz's loop is: the owner asks, staff receive it, staff respond, the owner
sees the outcome. Miamus has the first and last steps for the happy path.
This plan fills two gaps in the middle:

1. **Staff can't say "I couldn't".** A chore can only be finished with two
   photos (`finish-chore-sheet.tsx`, migration 104); a pet routine can only
   be logged with a photo (`agenda-group-card.tsx`). If the detergent has
   run out, the room is locked, or the dog won't eat, the task just turns
   red ("Belum selesai dari …"). The owner can't tell whether the job was
   forgotten or couldn't be done, so they ask on WhatsApp.
2. **The owner isn't told what didn't happen.** Owner pushes today cover a
   sick pet, a locked PIN, food from staff, food expiring, urgent repairs and
   household deletion. Nothing reports a missed task, a leave request or a
   schedule suggestion. Staff are told to send a WhatsApp instead
   (`whatsapp-notify-panel.tsx`, whose comment still says the app "has no
   push channel to the owner").

So the owner still opens Today to check, or sends "sudah belum?". That
message is what this phase should remove: staff give the reason in two taps,
and the owner hears **only about exceptions**, once, in the evening.

## What's there today (read 2026-11-10)

| Area | Today | Where |
| --- | --- | --- |
| Finishing a chore | Claim ("Saya kerjakan"), before photo, after photo, **Selesaikan**. A repeat's day is written on first touch (materialised). No undo. | `finish-chore-sheet.tsx`, `chore-recurrence.ts` (occurrence key `templateId\|date`) |
| Staff chore guard | A staff phone may change only `assigned_to`, `status` (pending/completed), `completed_by/at` and the photos; may insert only a day copy of a repeat; may delete nothing. | migration 128 (137 re-creates it for intervals) |
| Photo rule | Completed needs both photos, except an admin finishing their own chore with none. | migrations 104, 136 |
| Logging a routine | One photo, tick the pets, one `task_logs` row per pet, `sub_type` 'complete' (vet: check_in/check_out/admitted). 5-minute undo. `task_logs` has select/insert/delete policies and **no update**. | `agenda-group-card.tsx`, `undo-window.ts`, migrations 079, 090 |
| When a routine counts as done | `buildAgenda` matches same-day logs to slots; for a single-slot schedule (every one the app creates) **any** same-day log completes it. | `src/lib/scheduleEngine.ts` |
| Lapor sheet | Makanan masuk, Lapor kerusakan, Stok menipis, Usulan jadwal, Catatan ekstra. Not tied to a task. | `staff-actions-fab.tsx` |
| Shopping list | Each item is ok / low / out; staff can set it with one tap (`stock_status`, stamped server-side). `inventory_alerts` is the free-text "something else we need". | migration 122 |
| Leave | Staff file a pending request; admins approve with a fallback (reassign / unassign / pause). No push. | `src/lib/leave.ts`, migration 108 |
| Schedule suggestions | `routine_proposals`, several rows per suggestion tied by `batch_id`, inserted in one statement. No push. | migrations 046, 052; `supabase-provider.ts` |
| Owner pushes | `queue_owner_push` (114): one push per admin with a device, in their language. Titles without emoji (132). `sw.js` replaces by tag but sets `renotify`, so a replacement still buzzes. | migrations 103, 114, 123, 124, 130, 132 |
| Morning jobs | 07:00 food (124), 07:05 chore reminders (`notify_chores_due`, 137, PR #60, not merged): works out each chore's open days in SQL, applies leave as Today does, routes an admin's own chore to that admin and anyone else's to every admin, one push per admin, tag per date. | migrations 124, 137 |
| My tasks | The admin's own chores in a card on Today, "1 of 3 done", tick to finish. | Phase 163, `my-tasks-card.tsx` |
| First-run checklist, calmer staff Today | Built, PR #62 (no files shared with this plan). | B1 |

**Push isn't reaching anyone yet.** Production has no push subscriptions
(see the push root-cause note, 2026-11-10): nothing asked owners to turn
notifications on, and the Singapore move and the move to miamus.app reset
them. The evening summary only helps once that fix ships. This plan doesn't
depend on its code, but it is the order to ship in.

## The idea in one line

Staff tap **Tidak bisa dikerjakan** and pick a reason; the owner sees the
task in amber with the reason instead of red, and at 19.00 gets **one** push
listing what is still open, and nothing at all on a day when everything got
done.

## For staff: "Tidak bisa dikerjakan"

### Where the button is

- **Chore sheet** (`FinishChoreSheet`): a quiet outline button under
  **Selesaikan**, full width, 48 px, with a `CircleSlash` icon: **Tidak bisa
  dikerjakan**. Shown while the chore isn't done, whether or not someone has
  taken it ("Sudah dikerjakan orang lain" matters most for an untaken one).
- **Routine sheet** (the capture step in `agenda-group-card.tsx`): the same
  button under the photo step.
- Not in the Lapor sheet: that's for things noticed, not tied to a task.

### The reason sheet (Indonesian only)

Title **Kenapa tidak bisa?**, the task's name underneath. Big rows (52 px),
one tap each:

| Reason (stored as) | Shown for | Next step |
| --- | --- | --- |
| **Barang habis** (`out_of_stock`) | chores and routines | **Apa yang habis?** Chips from the shopping list's items (Stok di rumah), or **Barang lain** with a short text box. **Masukkan ke daftar belanja** is on by default: it marks the item out (the existing `stock_status` write, migration 122) or files the text as a "something else we need" note (`inventory_alerts`). |
| **Hewan tidak mau makan** (`pet_refused`) | meal routines | **Hewan mana?** Tick the pets (pre-ticked if the card has one). |
| **Hewan tidak mau minum obat** (`pet_refused`) | medicine routines | The same, plus one line: **Admin langsung diberi tahu.** |
| **Sudah dikerjakan orang lain** (`done_by_other`) | chores and routines | None. |
| **Lainnya** (`other`) | chores and routines | **Tulis alasannya** (required, a few words). |

Then, for every reason: **Catatan (boleh dikosongkan)** (280 characters),
**Tambah foto (boleh dikosongkan)** (D4), and **Kirim**.

Sending goes through the offline queue like logs and photos do: with no
signal the card says "Tersimpan di HP · terkirim otomatis saat ada sinyal".
The person is the one picked on the phone (`staff_id`), as for every staff
action.

### After sending

- Toast: **Terkirim. Admin bisa melihatnya.** with **Batalkan** for 5
  minutes (`UNDO_WINDOW_MS`), which withdraws it (D3).
- The card turns amber: **Tidak bisa · Barang habis · 09.10**. It stays in
  the list, below open tasks and above done ones.
- **It can still be done later.** The sheet keeps **Selesaikan** with one
  line above it: **Ternyata sudah bisa? Selesaikan seperti biasa.** Done
  wins everywhere: once finished (or logged), the amber state disappears and
  the task counts as done. Nothing is rewritten; the record just stops
  showing (D3).
- After 5 minutes it can't be changed or removed by staff. That keeps the
  owner's record honest without punishing a quick mistake.

### What it records

One row per task-day (per pet for routines): the task, the day, the reason,
the optional note, photo and the shopping item that ran out, who said so,
and when (the server's clock). Nothing about the chore or the log itself
changes (D1).

## For owners: what they see

All in the owner's language (`useT()`); times as `useFormatTime()` writes
them (9:10 AM / 09.10).

### On Today

- A couldn't-do task is an **amber row** instead of a red one: the amber tint
  and left border the app already uses for warnings, a `CircleSlash` icon,
  and the subtitle **Couldn't: out of stock · Sari · 9:10 AM** /
  **Tidak bisa: barang habis · Sari · 09.10**.
- Tapping it opens the usual sheet with a short block on top: the reason,
  Sari's note in quotes, the photo, and for Barang habis **Detergent is on
  the shopping list** / **Deterjen sudah masuk daftar belanja**. The owner's
  existing actions are unchanged (the chore editor: change it, skip a day,
  give it to someone else). No new owner action in this phase.
- On later days it sits in "From earlier" like any missed chore, still amber
  with its reason.
- Routines: the slot shows amber for the pets named; the others stay as
  they are.

### In My tasks

- An admin's own chore can only be amber if someone else said it couldn't be
  done (D9 keeps the button staff-only for now). The header counts it:
  **1 of 3 done · 1 couldn't** / **1 dari 3 selesai · 1 tidak bisa**.
- The all-done line ("Your 3 tasks are done") doesn't appear while one is
  amber.

### The evening summary

**One push, once an evening, only when something is open** (D6, D7).

- **When:** 19.00 Jakarta time by default. Each admin can pick 18.00, 19.00,
  20.00 or 21.00, or turn it off, in **Household → Notifications** /
  **Rumah → Notifikasi**.
- **What it lists**, in this order, each part only if it has something:
  1. **Couldn't**: tasks staff marked, with the reason.
  2. **Not done**: chores due today (no time, or a time before the summary)
     and routine slots up to the summary time, still open. Leave applies as
     on Today: a paused day isn't listed; a reassigned one is.
  3. **Waiting for you**: pending leave requests and schedule suggestions.
- **Who gets what:** routines and staff or unassigned chores go to every
  admin; an admin's own chore only to that admin (137's rule).
- **Nothing open, no push.** Silence means the day is done. Shopping alone
  never triggers it (D7).
- **Text** (up to three titles per part, then "and 2 more"; the same helper
  as 137):
  - EN, title **Not done today**: *Couldn't: Laundry (out of stock). Not
    done: Mop the terrace, Mochi's dinner 6:00 PM. Waiting for you: Sari's
    leave.*
  - ID, title **Belum selesai hari ini**: *Tidak bisa: Cuci baju (barang
    habis). Belum: Pel teras, Makan malam Mochi 18.00. Menunggu Anda: cuti
    Sari.*
- Staff notes are **never** in the push, only the reason's label: lock
  screens are seen by others, and the note is one tap away.
- **Tapping it** opens Today with the **summary sheet** on top
  (`/dashboard?module=agenda&summary=YYYY-MM-DD`):
  - **Couldn't be done** / **Tidak bisa dikerjakan**: amber cards with
    reason, who, time, note and photo;
  - **Not done yet** / **Belum dikerjakan**: rows with time and who;
  - **Waiting for you** / **Menunggu Anda**: leave and suggestions, each
    opening its existing screen;
  - **To buy** / **Perlu dibeli**: one line with the count, opening Kitchen;
  - footer: **12 done today** / **12 selesai hari ini**.

  The sheet is read-only and built from what Today already loads, plus the
  day's couldn't-do rows. Each row opens the task's normal sheet. After the
  summary time, Today shows one quiet line (like "2 things to buy") that
  opens the same sheet: **3 not done today** / **3 belum selesai hari ini**.

### Pushes when staff requests wait

| Event | Push? | Text (EN / ID) | Spam guard |
| --- | --- | --- | --- |
| Leave request filed (pending) | **Yes, on arrival** | **Leave request**: "Sari asked for 12–14 Nov off." / **Permintaan cuti**: "Sari minta cuti 12–14 Nov." Opens `/dashboard/leave/{id}`. | One per request; never to the phone that filed it. |
| Schedule suggestion | **Yes, on arrival** | **Schedule suggestion**: "Sari suggested 3 schedule changes." / **Usulan jadwal**: "Sari mengusulkan 3 perubahan jadwal." Opens Today's Waiting for you. | One per suggestion, however many rows: a statement-level trigger sees the whole insert at once. |
| Pet wouldn't take medicine | **Yes, on arrival** | **Medicine not taken**: "Mochi wouldn't take Amoxicillin (6:00 PM). Reported by Sari." / **Obat tidak diminum**: "Mochi tidak mau minum obat Amoxicillin (18.00). Dilaporkan Sari." | Like the sick report: skipped if older than a day (offline queue), not to the reporter's own phone. |
| Any other couldn't-do | No | In the evening summary. | |
| Item marked low or out, "something else we need" note | No | "To buy" line in the summary sheet. | Each tap is its own write; pushing them would mean a buzz per item. |
| Non-urgent repair report | No (urgent already pushes) | Unchanged. | |

One switch per admin for the on-arrival pushes: **Staff requests** /
**Permintaan staf** (on by default). The medicine push has no switch, like
the sick report: it's about a pet's health.
Sick-pet, urgent-repair and PIN-locked pushes stay as they are, with no
switch.

**The staff's WhatsApp nudge.** After filing leave or a suggestion, when at
least one admin will get the push, `WhatsAppNotifyPanel` says **Admin sudah
diberi tahu lewat notifikasi.** and keeps WhatsApp as a smaller second
button, **Kirim WA juga**. When no admin has notifications on, it stays as
today. The panel's out-of-date comment is fixed in the same change.

### How push spam is avoided (the rules in one place)

1. Exceptions only: no push for things that went well.
2. Couldn't-do items wait for the evening, except medicine.
3. One evening push per admin per day, tag `evening-YYYY-MM-DD`, and only if
   something is open.
4. One push per leave request and per suggestion, never per row.
5. Shopping changes never push.
6. Never to the phone that caused it.
7. Two switches, both in Household → Notifications: Evening summary (with
   the time) and Staff requests.

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Row subtitle | Couldn't: out of stock · Sari · 9:10 AM | Tidak bisa: barang habis · Sari · 09.10 |
| Reasons | Out of stock · Pet wouldn't eat · Pet wouldn't take medicine · Already done by someone else · Other | Barang habis · Hewan tidak mau makan · Hewan tidak mau minum obat · Sudah dikerjakan orang lain · Lainnya |
| Sheet block | Couldn't be done · Sari's note · Detergent is on the shopping list | Tidak bisa dikerjakan · Catatan Sari · Deterjen sudah masuk daftar belanja |
| My tasks | 1 of 3 done · 1 couldn't | 1 dari 3 selesai · 1 tidak bisa |
| Evening push title | Not done today | Belum selesai hari ini |
| Push parts | Couldn't: · Not done: · Waiting for you: | Tidak bisa: · Belum: · Menunggu Anda: |
| Summary sheet | Couldn't be done · Not done yet · Waiting for you · To buy · 12 done today | Tidak bisa dikerjakan · Belum dikerjakan · Menunggu Anda · Perlu dibeli · 12 selesai hari ini |
| Quiet line on Today | 3 not done today | 3 belum selesai hari ini |
| Settings | Evening summary: "What wasn't done today, only when something is open." · At 7:00 PM · Staff requests: "Leave and schedule suggestions, when they arrive." | Ringkasan malam: "Yang belum selesai hari ini, hanya kalau ada." · Pukul 19.00 · Permintaan staf: "Cuti dan usulan jadwal, saat masuk." |
| Request pushes | Leave request · Schedule suggestion · Medicine not taken | Permintaan cuti · Usulan jadwal · Obat tidak diminum |

## Staff text (Indonesian only)

Tidak bisa dikerjakan · Kenapa tidak bisa? · Barang habis · Apa yang habis? ·
Barang lain · Masukkan ke daftar belanja · Hewan tidak mau makan · Hewan
tidak mau minum obat · Hewan mana? · Admin langsung diberi tahu. · Sudah
dikerjakan orang lain · Lainnya · Tulis alasannya · Catatan (boleh
dikosongkan) · Tambah foto (boleh dikosongkan) · Kirim · Terkirim. Admin bisa
melihatnya. · Batalkan · Tidak bisa · Barang habis · 09.10 · Ternyata sudah
bisa? Selesaikan seperti biasa. · Admin sudah diberi tahu lewat notifikasi. ·
Kirim WA juga.

*Anda* where a pronoun is needed, none otherwise; "staf" and "admin", never
"pembantu"; "HP", not "ponsel"; "(boleh dikosongkan)", not "opsional".

## Glossary rows to add (before any Indonesian text ships)

| English | Bahasa Indonesia | Why |
| --- | --- | --- |
| Couldn't be done (button, status) | **Tidak bisa dikerjakan** / short **Tidak bisa** | The audit's wording; plain. |
| Out of stock (reason) | **Barang habis** | What staff say. |
| Pet wouldn't eat / take medicine | **Hewan tidak mau makan** / **Hewan tidak mau minum obat** | "Hewan", never "anjing" (Phase 157). |
| Already done by someone else | **Sudah dikerjakan orang lain** | |
| Evening summary | **Ringkasan malam** | |
| Not done today | **Belum selesai hari ini** | Push title and quiet line. |
| Not done yet (section) | **Belum dikerjakan** | |
| To buy (section) | **Perlu dibeli** | |
| Staff requests (switch) | **Permintaan staf** | |
| Leave request (push) | **Permintaan cuti** | Matches "Cuti". |
| Medicine not taken (push) | **Obat tidak diminum** | |

## Database: migration 139 (described, not created)

`139_couldnt_do_and_evening_summary.sql`. Additive only. Written after 137
and 138 have merged, because it reuses 137's helpers and re-creates
functions that 138 may also re-create (the household export and the photo
clean-up): 139 starts from whichever version is newest on `main`.

### 1. `task_exceptions` (D1)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `household_id` | uuid not null → households, on delete cascade | |
| `chore_id` | uuid → household_tasks, on delete cascade | The repeat or the one-off, **never a day copy**: with `occurs_on` it's the occurrence key (`templateId\|date`), so it doesn't matter whether the day was materialised. |
| `schedule_id` | uuid → master_schedules, on delete cascade | Routines. |
| `entity_id` | uuid → task_entities, on delete cascade | The pet, for routines. |
| `occurs_on` | date not null | The task's day. |
| `slot_time` | time | The routine slot (e.g. 18:00); required for routines, null for chores (a null would slip past the unique index). |
| `reason` | text not null | `out_of_stock`, `pet_refused`, `done_by_other`, `other`. |
| `note` | text | ≤ 280 characters; required (3+ characters) for `other`. |
| `photo_url` | text | Optional (D4); a storage path under the household's prefix. |
| `inventory_item_id` | uuid → inventory_items, on delete set null | What ran out, if picked from the list. |
| `staff_id` | uuid → staff_profiles, on delete set null | Who said so (self-declared on the phone, like every `staff_id`). |
| `created_at` | timestamptz not null default now() | Overwritten with `now()` by the guard. |

Checks: exactly one of `chore_id` / `schedule_id`; `entity_id` with
`schedule_id`; `pet_refused` only on routines. Unique indexes: one row per
(`chore_id`, `occurs_on`) and per (`schedule_id`, `entity_id`, `occurs_on`,
`slot_time`); a resend from the offline queue hits the index and is treated
as already saved. Index on (`household_id`, `occurs_on`) for Today and the
evening job.

**RLS and grants** (explicit, as 107 requires): `select, insert, delete` to
`authenticated`; nothing to `anon`.

- Select: `household_id = any (get_user_household_ids())`. Staff phones may
  read it on purpose: another staff member needs to see why a task is amber.
- Insert: the same household check, plus the guard below.
- Delete: same household and `created_at > now() - interval '5 minutes'`
  (the staff's Batalkan, as `routine_proposals` and `inventory_alerts` do).
- No update policy: nobody edits staff's words.

**Guard** `task_exceptions_guard()`, before insert, `security definer`,
`search_path = ''`, EXECUTE revoked from `public, anon, authenticated`
(triggers fire without it):

- the chore (or the schedule's pet) belongs to `household_id`; the chore is a
  repeat or one-off (`parent_task_id is null`), not cancelled, and falls on
  `occurs_on` (`chore_occurs_on`, 128/137) or has a written day there;
- `occurs_on` is between 7 days ago and today, Jakarta time (staff can
  explain "From earlier", never the future);
- `staff_id` belongs to the household and isn't archived (119's
  `is_archived_staff`); `inventory_item_id` belongs to the household;
- `photo_url`, when set, starts with the household's storage prefix;
- `created_at := now()`.

No change to `household_tasks`, `task_logs`, the staff chore guard (128) or
the photo rule (104/136).

### 2. Notification choices on `user_preferences` (D6, D8)

- `evening_summary_hour smallint default 19`, null = off, check
  `in (18, 19, 20, 21)`.
- `staff_request_pushes boolean not null default true`.
- `my_notification_prefs()` and `set_my_notification_prefs(p_hour,
  p_requests)`: `security definer`, empty `search_path`, refuse anonymous
  sessions (staff phones) like `set_my_locale`; upsert keeps the existing
  `locale` (or `locale_of`). `revoke all … from public, anon;` then `grant
  execute … to authenticated`.

### 3. On-arrival pushes (D5, D8)

All `security definer`, empty `search_path`, EXECUTE revoked from `public,
anon, authenticated`, failures swallowed with a warning (a push must never
cost the record), and the caller's own devices excluded. The two request
pushes loop the household's admins with a device and `staff_request_pushes`
on, and call `queue_push` once per admin in that admin's language (the shape
of 137's `notify_chores_due`; `queue_owner_push` has no per-admin filter).
The medicine push goes to every admin through `queue_owner_push`, like the
sick report.

- `notify_task_exception()`, after insert on `task_exceptions`: only
  `pet_refused` on a schedule whose title starts with `Medication: `
  (`schedule-categories.ts`), and not older than a day. Tag
  `refused-{id}`. URL `/dashboard?module=agenda`.
- `notify_leave_request()`, after insert on `leave_requests` with status
  `pending`. Tag `leave-{id}`. URL `/dashboard/leave/{id}`.
- `notify_routine_proposals()`, **after insert for each statement**,
  `referencing new table as added`: one push per (household, staff, batch)
  in the statement. Tag `proposal-{batch_id}`.

`household_requests_push_on()`: true when any admin of the caller's
household has a device and `staff_request_pushes` on. For the staff panel's
wording, so it's checked with `get_user_household_ids()` on purpose: it
answers a staff phone and reveals only a yes/no. `revoke … from public,
anon; grant … to authenticated`.

### 4. The evening summary (D6, D7)

- `chore_days_open(p_day date, p_until time)`: the open chore-days for that
  day, with title, time and who it's for after leave. Taken from 137's
  `due` / `open_days` / `covered` CTEs, without the reminder filter, plus
  chores with no reminder. `notify_chores_due` is left as it is (sharing the
  helper there can follow later, on its own).
- `routine_slots_open_on(p_day date, p_until time)`: active schedules
  (`is_active`, created on or before the day, not expired) of pets at home
  (not `admitted`), slots up to `p_until` (fixed times; interval rows from
  start to end), minus that day's logs other than `check_in`. For single-slot
  schedules, every one the app creates, this matches `buildAgenda`
  exactly; for interval rows it counts open slots (the summary says "3
  potty breaks", not which).
- `notify_evening_summary(p_now timestamptz default null)`: for each admin
  whose `evening_summary_hour` is this Jakarta hour and who has a device:
  couldn't-do rows for today (not since finished), open chores and routine
  slots (minus those with a couldn't-do row, which are listed once, under
  Couldn't), pending leave and suggestions. Routed by 137's rule. Push only if
  one of the three parts has something. Title and body as above,
  `chore_due_titles` for the lists, tag `evening-{date}`, URL
  `/dashboard?module=agenda&summary={date}`. Not `security definer`; EXECUTE
  to `service_role` only.
- Cron `notify-evening-summary`, `0 11-14 * * *` (18.00–21.00 in Jakarta).

Jakarta time for every household, as 124 and 137 do; an owner in Bali gets
19.00 WIB at 20.00 local. Per-household time zones are out of scope.

### 5. Keeping, exporting and deleting

- **Rows:** kept 90 days, then deleted by `prune_old_task_exceptions()`, a
  nightly SQL cron like `prune_old_feedback` (135) (D4).
- **Photos:** the same 30-day rule as proof photos. Re-create
  `task_photos_due_for_pruning` and `forget_missing_task_photos` to include
  `task_exceptions.photo_url`.
- **`orphaned_household_photos` must learn the new column too**, or the
  nightly clean-up would treat a couldn't-do photo as orphaned and delete it
  on day one.
- **`export_household_data()`** gains a `task_exceptions` section (reason,
  note, day, task title, who, when; photo paths as the other sections give
  them).
- **Household deletion:** rows go by cascade; photos by the existing nightly
  clean-up once the functions above know them.

### SQL tests (`supabase/tests/139_…`)

A staff phone: files a reason for a chore day of its household (yes),
another household's chore (no), a future day (no), 8 days ago (no), a
cancelled chore (no), as an archived person (no), `pet_refused` on a chore
(no); withdraws within 5 minutes (yes) and after (no); updates (no). A
resend of the same task-day doesn't duplicate. A suggestion of 3 rows
queues one push. A leave request filed by an admin queues none. The evening
job: nothing open, no push; a couldn't-do task appears under Couldn't and
not under Not done; a paused leave day isn't listed; an admin with the
summary off gets none; an admin's own chore reaches only them.

## Privacy policy (both languages, owner approves the text first)

New personal data: **staff-written reasons, notes and photos about a task**;
new notification types and **notification choices**. No new service, no new
place of storage. Bump `policyVersion` and `effectiveDate` in
`src/config/legal.ts`, with a dated comment.

**"Everyone in a household"**, a new line:

- EN: "When a task can't be done: the reason picked (for example out of
  stock, or the pet wouldn't eat), an optional note and photo, which
  shopping-list item ran out, who said so and when. The household's admins
  and staff can see it."
- ID: "Kalau tugas tidak bisa dikerjakan: alasan yang dipilih (misalnya
  barang habis, atau hewan tidak mau makan), catatan dan foto (boleh tidak
  ada), barang di daftar belanja yang habis, siapa yang memberi tahu, dan
  kapan. Admin dan staf rumah tangga bisa melihatnya."

**Admins' own data**, beside the language choice:

- EN: "Your notification choices: whether you get the evening summary and
  at what time, and whether you're told about staff requests."
- ID: "Pilihan notifikasi Anda: apakah Anda menerima ringkasan malam dan
  pukul berapa, dan apakah Anda diberi tahu tentang permintaan staf."

**Notifications** (the purposes line, or a new line after the food line):

- EN: "If an admin turns notifications on, Miamus sends them an evening
  summary of what wasn't done that day (at the time they choose, or never),
  a notification when staff ask for leave or suggest a schedule change, and
  one when a pet wouldn't take its medicine. Staff notes aren't included in
  notifications."
- ID: "Kalau admin menyalakan notifikasi, Miamus mengirim ringkasan malam
  berisi yang belum selesai hari itu (pada jam yang dipilih, atau tidak
  sama sekali), notifikasi saat staf minta cuti atau mengusulkan perubahan
  jadwal, dan notifikasi saat hewan tidak mau minum obat. Catatan staf tidak
  dimasukkan ke notifikasi."

**Section 7, How long we keep it**, a new line:

- EN: "The reason and note for a task that couldn't be done are kept 90
  days, then deleted automatically. Its photo follows the 30-day rule for
  proof photos."
- ID: "Alasan dan catatan untuk tugas yang tidak bisa dikerjakan disimpan 90
  hari, lalu dihapus otomatis. Fotonya mengikuti aturan 30 hari untuk foto
  bukti."

## Tutorials

- **Owner, What's new** (shown to admins of households with staff):
  - EN: **When staff can't do a task**. "Staff can now tell you why a task
    couldn't be done. You'll see it in amber on Today. Each evening at 7:00
    PM, one notification lists what's still open, only if something is.
    Change the time or turn it off in Household → Notifications."
  - ID: **Kalau staf tidak bisa mengerjakan tugas**. "Staf sekarang bisa
    memberi tahu kenapa tugas tidak bisa dikerjakan. Tugasnya ditandai kuning
    di Hari ini. Setiap malam pukul 19.00, satu notifikasi berisi yang belum
    selesai, hanya kalau ada. Ubah jamnya atau matikan di Rumah →
    Notifikasi."
- **Staff, Yang baru** (one card, then gone):
  - **Tidak bisa mengerjakan tugas?** "Buka tugasnya, ketuk Tidak bisa
    dikerjakan, lalu pilih alasannya. Admin bisa melihatnya. Salah pilih?
    Ketuk Batalkan dalam 5 menit."

## How it's built (after the owner's OK)

Two PRs, so the staff half can ship first if the owner wants.

**PR A: "Tidak bisa dikerjakan"** (migration 139 parts 1 and 5, the
medicine push from part 3, the privacy lines about reasons).

1. Migration + SQL tests; types in `src/types/database.ts`; provider
   methods (list, create, withdraw) and the offline queue.
2. `src/components/staff/couldnt-do-sheet.tsx` (staff, ID only), opened from
   `FinishChoreSheet` and the routine capture step.
3. Amber state: `chore-card.tsx`, the routine card, the owner's agenda rows,
   My tasks' count; `scheduleEngine.ts` and `chore-recurrence.ts` learn a
   `couldnt` overlay (pure functions, unit-tested).
4. Glossary rows, staff Yang baru card; Playwright on the stub: file a
   reason, see amber, undo, file again, finish anyway, see done.

**PR B: evening summary and request pushes** (migration 139 parts 2–4; it
may be its own migration number if PR A has already shipped).

1. Notification switches in `push-notification-settings.tsx`.
2. Summary sheet and the quiet line on Today (`?summary=` in the URL, so the
   sheet's state lives in the URL, per CLAUDE.md).
3. `WhatsAppNotifyPanel` wording.
4. Privacy lines about notifications, owner What's new.

Each: `tsc`, `next build`, CI, Codex until clean; migration local → staging →
production with the owner's OK; merge with the owner's OK.

## Validate

- 3 households, 2 weeks before and after: red tasks with no explanation, and
  the owner's "kenapa belum?" / "sudah belum?" messages.
- 3 staff aged 40+ on a test household: can they find **Tidak bisa
  dikerjakan** and send a reason in under 10 seconds, unaided?
- After 2 weeks, ask each owner whether the evening push felt useful or like
  nagging; keep it on by default only if 2 of 3 keep it on.

## Decisions for the owner

- **D1: Where a "couldn't" is stored.**
  **A (recommended):** its own table (`task_exceptions`). Chores, routine
  logs, the staff chore guard and the photo rule don't change, and an app
  still on the old version keeps showing the task as not done (red) rather
  than done. B: a new status and reason on chores, and a new `sub_type` on
  routine logs (the audit's first sketch). Smaller to query, but it widens
  the staff chore guard, and an old app build would read a couldn't-do log
  as **done** (any same-day log completes a routine).
- **D2: The reasons.**
  **A (recommended):** the audit's four, shown where they make sense: Barang
  habis, Hewan tidak mau makan / minum obat (routines), Sudah dikerjakan
  orang lain, Lainnya. B: add **Alat rusak** (offers Lapor kerusakan) and
  **Tidak bisa masuk ruangan**. More precise, but six rows instead of four
  for slow readers. C: free text only.
- **D3: Undo, and finishing later.**
  **A (recommended):** **Batalkan** for 5 minutes, like routines; after that
  it stays. The task can still be finished later and done wins. B: staff can
  withdraw it any time that day. C: no undo.
- **D4: Photo, and how long it's kept.**
  **A (recommended):** an optional photo on every reason; the photo is
  deleted after 30 days like proof photos, and the reason and note after 90
  days. B: photo only with Lainnya. C: no photo. D: keep reasons and notes
  as long as tasks (while the household uses Miamus).
- **D5: Which couldn't-do items push straight away.**
  **A (recommended):** only "Hewan tidak mau minum obat" on a medicine
  routine; everything else waits for the evening summary. B: every one
  pushes (more buzzing). C: none.
- **D6: The evening summary's default and time.**
  **A (recommended):** on by default at 19.00 for admins who have
  notifications on; they can pick 18.00–21.00 or turn it off. It only sends
  when something is open. B: off until an admin turns it on (calmer, but
  most never will). C: fixed at 19.00, on/off only.
- **D7: What triggers and fills it.**
  **A (recommended):** it sends only when something couldn't be done, is
  not done, or waits for an admin; shopping is a line in the sheet, never a
  reason to push. B: only couldn't-do and not done. C: A, plus a short "All
  done today" push on good days (reassuring, but a push every day).
- **D8: Pushes for staff requests.**
  **A (recommended):** leave requests and schedule suggestions push when
  they arrive (one per request or suggestion), under one **Staff requests**
  switch; stock notes wait for the summary; the staff's WhatsApp panel says
  "Admin sudah diberi tahu" when an admin will get it. B: also stock notes,
  grouped into one push per few minutes (the audit's sketch; needs a queue
  and a job). C: no request pushes, the evening summary only.
- **D9: Can admins mark their own chore "couldn't"?**
  **A (recommended):** not in this phase: the button is on staff screens
  only. An admin can already skip or move their own chore. B: yes, in the My
  tasks sheet, in the owner's language (useful in homes where family admins
  share chores and no staff).
- **D10: Tutorials.**
  **A (recommended):** an owner What's new card (EN/ID) for admins of
  households with staff, and one staff Yang baru card. B: owners only.

## Not in this phase

- An owner reply to a couldn't-do ("OK, tomorrow") or a "seen" mark.
- Per-household time zones (WITA, WIT).
- Notifications on staff phones (audit item 4, next).
- Kakak reading the summary ("what's left today?").
- WhatsApp delivery of anything.
- Changing `notify_chores_due` (137) to share the new helper.
