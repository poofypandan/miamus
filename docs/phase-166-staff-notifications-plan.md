# Phase 166: Notifications on staff phones

Status: **plan for the owner's decision. Nothing is built.**
Audit item **4** (`docs/product-audit-2026-11-09.md`, "Notifications on staff
phones"). Decision **B3** says this comes before any WhatsApp work.
Mockup: `docs/mockups/phase-166-staff-notifications.html` (open it in a browser at phone width).
Migration **140** is reserved for it. 139 is the couldn't-do and evening
summary work (Phase 165, PR #64). Nothing here exists yet.

## The problem

Paz's loop is: the owner asks, staff receive it, staff respond, the owner
sees the outcome. In Miamus, the "staff receive it" step only happens when
staff next open the app. If an owner adds a task at 10.00 for this
afternoon, moves Sari's chore to Wati, or approves a leave request, staff
find out whenever they happen to look. Usually the owner sends a WhatsApp as
well, which is the message this phase should make unnecessary.

Owners already get pushes. Staff phones get none: every trigger calls
`queue_owner_push`, and the only place to subscribe is the owner's
Household tab.

## What's there today (read 2026-11-10)

| Area | Today | Where |
| --- | --- | --- |
| Subscriptions | `push_subscriptions`: one row per browser endpoint, owned by the session's `user_id`, with the `household_id`. RLS lets a session see, add and delete only its own rows. Upserts go through `save_push_subscription` (definer, granted to `authenticated`, so staff phones can call it already). Endpoints are allow-listed (FCM, Mozilla, Apple, WNS). | migration 103 |
| Who gets a push | `push_dispatch_plan` picks targets **when it sends**: `owner` = a `household_members` account, `staff` = a session with a `device_sessions` row, `all` = either. So a phone that is unlinked stops getting pushes straight away. `p_user_id` narrows it to one session. | migration 103 |
| Queue | `queue_push(household, role, title, body, url, tag, user_id, exclude_user_id)` → pg_net → `send-push` Edge Function (web-push, TTL 12 h, drops endpoints that return 404/410). Returns false, without raising, if push isn't configured. | 103, `supabase/functions/send-push` |
| Owner fan-out | `queue_owner_push`: one push per admin who has a device, in that admin's language. `locale_of()` already returns `id` for anonymous sessions (staff phones). | migration 114 |
| Owner triggers | Sick report, PIN locked (115/132), food from staff and the 07.00 food list (123/124), urgent repair (130), the 07.05 bill and chore reminder (137). All of them go to owners only. 137 says it outright: "staff phones get no pushes". | |
| Browser half | `src/lib/push.ts`: `pushAvailability()` (iPhone outside the Home Screen → `ios-install-first`), `enablePush()`, `disablePush()`, `resyncPush()` (silently subscribes again, only for the session that turned push on here). `sw.js` shows `{title, body, url, tag}`, replaces a notification with the same tag and buzzes again (`renotify`). | |
| Owner prompt | `PushPrompt` on the dashboard: Turn on / Not now (7 days), Blocked (30 days), iPhone steps. `use-push-status.ts` gives On / Off / Blocked / Needs Home Screen. | PR #50 |
| Staff phones | An anonymous Supabase session, linked to one household in `device_sessions` (one row per phone, `user_id` unique). The person on duty is **only in the phone's localStorage** (`banyuwangi11:staffId`), picked with a PIN. A shared kitchen phone serves several people. `staff_sign_in_attempts` (115) records each PIN sign-in: which phone session, which person, whether it worked. It is kept for 30 days. | 089, 115, `staff-login-gate.tsx` |
| Removing someone | Archiving a person unlinks the phones they last signed in on (119). Owners can remove any phone under Household → Staff → Linked staff phones. Unlinked anonymous sessions are deleted after 7 days (121), and their push rows go with them (cascade). | 109, 119, 121 |
| Staff Today | One tip card at a time, newest first (#62). The leave banner sits above it. The Lapor button opens the staff's sheet of actions. | `app/staff/page.tsx` |
| Phase 165 (plan, decided) | Pushes **to owners**: medicine refused (straight away), leave request and schedule suggestion (on arrival), and a 19.00 evening summary. Its "Not in this phase" list says: "Notifications on staff phones (audit item 4, next)". | PR #64 |

Production has 0 push subscriptions (no owner has turned them on since the
Singapore move and the new domain). PR #50 now prompts owners. Staff pushes
will start from zero as well, so the turn-on prompt matters as much as the
triggers.

## The idea in one line

Staff tap **Aktifkan notifikasi** once on their Today. After that, their
phone tells them about four things only: a new task for them today, a task
moved to them, the admin's answer to their request, and a repair they
reported being dealt with. Nothing at night, no reminders, no nagging.

## Which events push to staff (D1–D3)

Only what an **admin** does. Staff actions never push other staff, and
neither do the morning jobs. The trigger checks that the change was made by
an account in `household_members` for that household, so cron, migrations
and staff phones (which are never `household_members`) don't push.

| Event | Who gets it | Personal phone (title / body) | Tag |
| --- | --- | --- | --- |
| **New task for you, today.** An admin adds a chore (one-off, or a repeat whose first day is today) that is due today and assigned to you | That person | **Tugas baru** / "Siram tanaman · 15.00" or, for several, "Siram tanaman, Pel teras, dan 1 lagi" | `tugas-{staff}-{date}` |
| **New task for anyone, today** (assignee "Semua Petugas") (D3) | Everyone in the household with notifications on | **Tugas baru untuk semua** / "Siram tanaman · 15.00" | `tugas-semua-{date}` |
| **A task moved to you.** An admin changes `assigned_to` to you on today's chore, or moves a chore of yours onto today | The new person | **Tugas untuk Anda** / "Pel teras · hari ini 14.00" | `tugas-{staff}-{date}` |
| **Time changed** on a task of yours today | That person | **Jam tugas diubah** / "Pel teras: sekarang 16.00" | `tugas-{staff}-{date}` |
| **Cover for leave.** An admin approves leave with "reassign" to you | The person covering | **Tugas tambahan** / "Sari cuti 12–14 Nov. Tugasnya untuk Anda." | `cuti-ganti-{leave_id}` |
| **Leave answered.** Pending → approved or rejected | The person who asked | **Cuti disetujui** / "12–14 Nov." · **Cuti tidak disetujui** / "12–14 Nov. Buka Miamus untuk melihat." | `cuti-{leave_id}` |
| **Schedule suggestion answered.** Pending → approved or rejected, one push per suggestion (`batch_id`) | The person who suggested it | **Usulan jadwal disetujui** / "3 usulan untuk Mochi." · **Usulan jadwal ditolak** · mixed: **Usulan jadwal dijawab** / "2 disetujui, 1 ditolak." | `usulan-{batch_id}` |
| **Repair you reported was dealt with.** `reported` → `fixed` or `dismissed` (also `open` → `fixed`) | `reported_by_staff` | **Sudah diperbaiki** / "Keran bocor" · **Laporan sudah dicek** / "Keran bocor: tidak perlu diperbaiki." | `perbaikan-{repair_id}` |

What does **not** push to staff:

- A task for another day, a task taken back from you, a cancelled task, or
  an edit to a title or note. Today shows these when the app is next opened (D1, D2).
- Anything a staff member does: "Saya kerjakan", finishing, reporting.
- Reminders of any kind. That includes 137's 07.05 bill reminder, which stays owner-only.
- Shopping and stock changes.
- A repair report the admin accepts (`reported` → `open`) but hasn't fixed
  yet. The staff's report list already says **Dijadwalkan** (D1).
- The dismiss reason, staff notes, and anything about another person's leave
  beyond the cover push above.

### How this fits Phase 165 (no duplicate pushes)

The two phases push **different people about different steps**, so no event
pushes the same phone twice:

| Step | Phase 165 (owners) | Phase 166 (staff) |
| --- | --- | --- |
| Staff file leave | Admins: **Permintaan cuti** | None |
| Admin answers leave | None | The person: **Cuti disetujui / tidak disetujui** (and the person covering, if reassigned) |
| Staff suggest a schedule | Admins: **Usulan jadwal** | None |
| Admin answers it | None | The person: **Usulan jadwal disetujui / ditolak** |
| Staff mark "Tidak bisa dikerjakan" | Medicine refused: straight away. Other reasons: in the evening summary | None (165 has no owner reply yet) |
| Urgent repair report | Admins (130, unchanged) | None |
| Repair fixed or not needed | None | The reporter |
| Evening, 19.00 | Admins: evening summary | **No staff summary** (no reminders) |

165's staff WhatsApp panel ("Admin sudah diberi tahu lewat notifikasi")
is unchanged. If both phases ship, the loop runs on push in both directions
and WhatsApp becomes the extra option it should be.

## Spam guard (the rules in one place)

1. Only the events above, only when an admin acts, and only about **today**
   (or about the person's own request).
2. **One push per person per save.** The insert and update triggers run once
   per statement (`referencing new table`), so adding a chore to three rooms
   at once ("Pilih ruangan lain") gives Sari one push listing all three, not three.
3. Task pushes **replace each other** for the day (tag `tugas-{staff}-{date}`).
   The body lists every task an admin gave this person for today in the last
   30 minutes that is still open, so the newest push on the lock screen covers
   what came just before it.
4. **At most one buzz per person per phone every 5 minutes** for task pushes.
   An owner who saves five chores one after another buzzes Sari once. A task
   push skipped by this rule is covered by the next one's list, or by Today.
   Stored as `last_task_push_at` on the phone's person row (below).
5. **Quiet hours 21.00–06.00 WIB** (D4). In that window nothing is queued, and
   the app shows the change when it is next opened. There is no night
   queue, so nothing piles up for the morning.
6. Never to a phone that isn't linked any more (`push_dispatch_plan` already
   checks `device_sessions` when it sends), and never for an archived person.
7. Owners can switch staff pushes off for the whole household (D8).

## Shared phones (D5, D6)

A `device_sessions` row is a **phone**, not a person. So the server needs
to know which people each phone gives notifications for. A new table holds
that: **one row per (phone, person)** who turned notifications on there.

- It's keyed on the phone's session (`device_sessions.user_id`), **not** on
  the push endpoint. Browsers rotate endpoints and `resyncPush` makes new
  ones, so a list tied to the endpoint would be lost each time. Tied to the
  phone, it survives renewals and is deleted with the phone (unlinking,
  119's archive, 121's prune).
- **A phone counts as shared** when two or more people have notifications
  on there, **or** when two or more people signed in on it with a PIN in
  the last 30 days (`staff_sign_in_attempts`). The second rule covers a phone
  where only Sari turned notifications on but Wati uses it too, so the lock
  screen never shows Sari's details to Wati.
- **On a shared phone, a push only says whose it is** (D5):
  - title **Untuk Sari**;
  - body without details: "Ada tugas baru hari ini." · "Admin sudah
    menjawab permintaan Anda." · "Ada kabar tentang laporan Anda.";
  - a task for everyone: title **Tugas baru untuk semua**, body "Buka
    Miamus untuk melihat." (no name, because it isn't anyone's).
- **On a personal phone**, it shows the details from the table above.
- **Tapping it** opens `/staff?untuk={staff_id}`. If someone else is on duty
  on the phone, Today shows a strip: **Notifikasi ini untuk Sari.**
  **[Ganti ke Sari]**, which opens the usual name and PIN screen. Nothing is
  shown in Sari's name until her PIN is entered.
- **Who may add a person to a phone** (D6): only the person on duty, and the
  server checks it. `set_my_push_person` accepts a person when **this
  phone's latest successful PIN sign-in is that person**
  (`staff_sign_in_attempts`, 30 days). Otherwise, for a name remembered for
  longer than that, the sheet asks for the PIN once and checks it through
  `verify_staff_pin`, with its usual limit of 5 tries. Without this, anyone on
  a shared phone could pick Sari's name and receive her leave answers.

## How a staff phone subscribes

Staff have no account, but they don't need one. The phone's anonymous
session is an `authenticated` session with a `device_sessions` row, and the
existing pieces already accept it:

1. The staff Today shows the card (below). **Aktifkan** calls
   `enablePush(householdId, publicKey)` from `push.ts` exactly as the owner
   prompt does: the key is fetched first, the permission prompt opens
   straight from the tap (Safari needs a user gesture), and the subscription
   is saved through `save_push_subscription` under the phone's session.
2. Then `set_my_push_person(staff_id, true)` adds the person on duty to the
   phone's list.
3. `resyncPush` runs on staff Today as it does on the dashboard, so a
   renewed or rotated subscription is saved again silently.
4. **Turning it off for me** removes only my row. When the last person on a
   phone turns off, the phone also unsubscribes (`disablePush`).
5. **On iPhone**, Safari only allows push for a site added to the Home Screen
   and opened from there (iOS 16.4+). In a Safari tab, the card shows the
   steps instead: **Ketuk Bagikan, lalu Tambahkan ke Layar Utama. Buka
   Miamus dari Layar Utama, lalu aktifkan notifikasi di sana.** The Home
   Screen app has its own storage, so the first time it opens, staff sign in
   again with the house code and PIN (115's flow, unchanged). The card says
   so in one line: **Di Layar Utama, masuk lagi dengan kode rumah dan PIN.**
   Most staff phones in Indonesia are Android, where none of this applies.
6. **Browsers that can't** (no PushManager, or an endpoint outside the
   allow-list, such as some HeyTap/Realme browsers): **Notifikasi tidak bisa
   diaktifkan di browser ini. Buka Miamus di Chrome.**
7. **Admins in staff view** never see the card. They are themselves (Phase
   139), and their own pushes are the owner ones.

## The turn-on prompt (staff, Indonesian only) (D9)

One card on staff Today. It takes **the one tip slot** from #62 (it goes first in
the `StaffTipCard` list), so the screen never gets busier than it is now.

- **Card** (bell icon):
  - **Aktifkan notifikasi**
  - "Dapat kabar di HP ini kalau ada tugas baru untuk Anda, atau admin
    menjawab permintaan Anda. Tidak ada notifikasi pukul 21.00–06.00."
  - on a shared phone, one more line: "HP ini dipakai bersama. Notifikasi
    hanya menyebut nama Anda."
  - buttons **Aktifkan** · **Nanti saja**.
- **Nanti saja** hides it on this phone for that person for 14 days. After
  the third "Nanti saja" it no longer appears, and the switch stays in
  settings.
- **Blocked** (the phone said no): **Notifikasi diblokir**. "Izinkan
  notifikasi untuk Miamus di pengaturan HP atau browser." · **Mengerti**.
  It shows again after 30 days, as the owner prompt does.
- **iPhone in a Safari tab**: **Notifikasi di iPhone**, with the steps above
  and the Share and Add to Home Screen icons, as `staff-splash.tsx` draws them, plus **Mengerti**.
- **After the tap**: the phone's own permission dialog, then a toast
  **Notifikasi aktif di HP ini.** On failure: **Notifikasi gagal diaktifkan.
  Coba lagi.**
- **The tutorial is the card itself**, with a short "Yang baru" line
  underneath: "Sekarang Miamus bisa memberi kabar lewat notifikasi." Staff
  get no separate tutorial card, so they don't get two cards about one thing (D10).

## Staff notification settings (Indonesian only) (D7)

A row at the bottom of the **Lapor** sheet, **Notifikasi di HP ini** (bell
icon, with the status on the right: **Aktif** / **Mati** / **Diblokir**).
It opens a sheet:

- **Untuk saya (Sari)**: a switch. This is the per-person on/off.
- "HP ini juga memberi kabar untuk: Wati". Shown only if others are on the
  list. Each person turns their own off.
- **Yang dikabarkan**:
  - Tugas baru untuk Anda hari ini
  - Tugas yang dipindah ke Anda
  - Jawaban cuti dan usulan jadwal
  - Laporan kerusakan yang sudah dicek
- **Jam tenang**: "Tidak ada notifikasi pukul 21.00–06.00."
- **Kirim tes**: the existing `send_test_push` (its Indonesian text comes from
  114/132 for anonymous sessions). Toast: **Tes terkirim**.
- **Matikan di HP ini (untuk semua)**: a quiet secondary button that removes
  the subscription for everyone on the phone. Its confirm step: "Semua orang di HP
  ini tidak akan dapat notifikasi lagi." **Matikan** / **Batal**.

No setting for which events or for quiet hours (D4, D7): four events and one
switch are easier for staff to understand than a list of options.

## Owner side (EN / ID)

Owners get one switch and see who is reachable. They can't turn on
notifications for staff, since only the phone can say yes.

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Household → Notifications, new row (D8) | **Staff phones**: switch "Send notifications to staff phones". Sub: "New tasks for them today, and your answers to their requests. Never between 9:00 PM and 6:00 AM." | **HP staf**: switch "Kirim notifikasi ke HP staf". Sub: "Tugas baru untuk mereka hari ini, dan jawaban Anda atas permintaan mereka. Tidak pernah pukul 21.00–06.00." |
| Household → Staff, each person's row | "Notifications on" / "Notifications off" | "Notifikasi aktif" / "Notifikasi mati" |
| Linked staff phones, each phone | "Phone 1 · Last sign-in … · Notifications for Sari, Wati" | "HP 1 · Terakhir masuk … · Notifikasi untuk Sari, Wati" |
| After saving a chore for today, for someone with notifications on | Toast: "Saved. Sari will get a notification." | "Tersimpan. Sari akan mendapat notifikasi." |
| The same, while the household switch is off or it's 9 PM–6 AM | Plain "Saved." | "Tersimpan." |
| After approving or rejecting leave | "Sari will get a notification." under the usual toast | "Sari akan mendapat notifikasi." |
| What's new card (admins of households with staff) | **Staff get notifications**. "Staff can now turn on notifications on their phone. They hear about new tasks for them today and your answers to their requests, never at night. See who has them on under Staff." | **Staf dapat notifikasi**. "Staf sekarang bisa mengaktifkan notifikasi di HP mereka. Mereka diberi tahu tentang tugas baru untuk mereka hari ini dan jawaban Anda atas permintaan mereka, tidak pernah malam hari. Lihat siapa yang sudah mengaktifkannya di Staf." |

The toast closes the loop for the owner: it says the message went through
Miamus, so they don't send a WhatsApp as well.

## Glossary rows to add (before any Indonesian text ships)

| English | Bahasa Indonesia | Note |
| --- | --- | --- |
| Turn on notifications (owners and staff) | **Aktifkan notifikasi** | Already the owner prompt's wording. Not "Nyalakan", the audit's sketch, so there's one verb everywhere. |
| On · Off · Blocked (notification status) | **Aktif · Mati · Diblokir** | As in #50's settings card. |
| Notifications on this phone | **Notifikasi di HP ini** | Staff settings row. |
| For (whose push, shared phone) | **Untuk Sari** | Push title on a shared phone. |
| Quiet hours | **Jam tenang** | "Tidak ada notifikasi pukul 21.00–06.00." |
| New task / New task for everyone | **Tugas baru** / **Tugas baru untuk semua** | Push titles. |
| A task for you (moved to you) | **Tugas untuk Anda** | |
| Extra task (covering leave) | **Tugas tambahan** | |
| Leave approved / not approved | **Cuti disetujui** / **Cuti tidak disetujui** | "Ditolak" reads harsh for a person's leave. Schedule suggestions keep **ditolak**, the staff's report list's word. |
| Switch to Sari | **Ganti ke Sari** | The strip after tapping a push meant for someone else. |
| Staff phones (owner switch) | **HP staf** | |

## Database: migration 140 (described, not created)

Additive only. Old app builds keep working: they never call the new
functions, and the triggers only add pushes.

### 1. `staff_push_people`

One row per (phone, person) with notifications on.

| Column | Type | Note |
| --- | --- | --- |
| `device_user_id` | uuid → `device_sessions(user_id)` on delete cascade | The phone. Unlinking deletes the rows. |
| `staff_id` | uuid → `staff_profiles(id)` on delete cascade | The person. Archived people are skipped when sending (`is_archived_staff`), and 119 unlinks their phones anyway. |
| `household_id` | uuid → `households(id)` on delete cascade | Copied from `device_sessions` and checked against the person's household. |
| `created_at` | timestamptz default now() | |
| `last_task_push_at` | timestamptz | For the 5-minute buzz rule. |

Primary key `(device_user_id, staff_id)`, plus an index on `staff_id`. RLS
on, `revoke all … from public, anon, authenticated`, no policies: it is
read and written only by the definer functions below (like
`user_preferences`, 114). The phone never stores an endpoint here; the
endpoint stays in `push_subscriptions`.

### 2. `households.staff_push boolean not null default true` (D8)

### 3. Functions a client calls

All `security definer`, `set search_path = ''`, `revoke all … from public,
anon;` then `grant execute … to authenticated` in the same migration
(AGENTS.md).

- `my_phone_push_people()` → `(staff_id, name)`: for a staff phone only.
  The caller must have a `device_sessions` row and must not be a
  `household_members` account. Archived people are left out.
- `set_my_push_person(p_staff_id uuid, p_on boolean, p_pin text default null)`:
  - Caller as above.
  - The person belongs to the phone's household, is not archived, and is not
    a member profile (an admin's roster row, 106).
  - **On**: this phone's latest successful PIN sign-in is that person
    (`staff_sign_in_attempts.user_id = auth.uid()`), or `p_pin` passes
    `verify_staff_pin` with its lockout. Otherwise it raises `42501`, and the
    sheet asks for the PIN.
  - **Off**: no PIN check (it can only make the phone quieter).
- `staff_push_overview()` → per person `(staff_id, phones_on int)` and per
  linked phone `(device_session_id, names text[])`. **Admin only**:
  `caller_admin_household()`, never `get_user_household_ids()`, which staff
  phones pass (AGENTS.md).
- `set_household_staff_push(p_on boolean)`: admin only,
  `caller_admin_household()`.
- `staff_will_be_notified(p_staff_ids uuid[])` → `uuid[]`: admin only. It
  backs the owner's "Sari will get a notification" toast, and is false
  during quiet hours or with the switch off.

`list_linked_phones` (115) isn't changed. Changing its return type would break
old builds, so the overview is a new function.

### 4. Internal

`revoke all … from public, anon, authenticated` on each of these.

- `staff_push_quiet(p_now timestamptz default now())`: true from 21.00 to
  06.00 in Asia/Jakarta, like 124 and 137. Per-household time zones are out
  of scope.
- `phone_is_shared(p_device_user_id uuid)`: 2+ people on the list, or 2+
  people with a successful PIN sign-in on this session in 30 days.
- `queue_staff_push(p_household_id, p_staff_ids uuid[], p_title, p_body,
  p_shared_body, p_url, p_tag, p_is_task boolean)` → integer:
  - It returns 0 when the household switch is off or it's quiet hours.
  - For each phone with a subscription and one of those people on its list
    (`p_staff_ids` null = anyone on any list), it applies the 5-minute rule
    for task pushes.
  - It picks the personal or shared text per phone, then calls
    `queue_push(household, 'staff', …, p_user_id := device_user_id)`, once
    per phone.
  - It returns how many phones were queued.

  `send-push`, `push_dispatch_plan` and `sw.js` are **unchanged**, because
  targeting one phone by `p_user_id` already exists.

### 5. Triggers

All `security definer`, empty `search_path`, EXECUTE revoked from `public,
anon, authenticated`. Failures are swallowed with a warning, because a push must
never cost the record. Each one does nothing unless `auth.uid()` is a
`household_members` account of that household.

- `notify_staff_tasks_added()`: after insert on `household_tasks`, **for
  each statement**, `referencing new table as added`.
  - Rows count when they're pending, for today in Jakarta, and are a one-off or
    a template with `chore_occurs_on(row, today)`. They're grouped by
    `assigned_to`; null means everyone.
  - The body is the open tasks an admin gave that person today in the last 30
    minutes, through `chore_due_titles(…, 'id')` (137), with the time when
    there is just one.
- `notify_staff_tasks_changed()`: after update on `household_tasks`, for each
  statement, `referencing old table as before new table as after`. It covers
  `assigned_to` changed to a staff person on today's chore, `due_date` moved
  onto today, or `due_time` changed on today's chore. A staff phone's own
  "Saya kerjakan" never counts (not an admin).
- `notify_staff_leave_answered()`: after update on `leave_requests` when
  `status` goes from `pending` to `approved` or `rejected`. It pushes the person, and
  the `fallback_assignee_id` when `fallback_action = 'reassign'`.
- `notify_staff_proposals_answered()`: after update on `routine_proposals`,
  for each statement. It finds rows whose `status` left `pending`, grouped by
  (`staff_id`, `batch_id`), so there's one push per suggestion. Rows with no
  `staff_id` (older than 071) are skipped.
- `notify_staff_repair_closed()`: after update on `repairs` when `status`
  becomes `fixed` or `dismissed` and `reported_by_staff` is set.

### 6. Keeping, exporting and deleting

- The rows live as long as the phone is linked and the person keeps them on.
  They go with the phone (unlink, archive, 121's 7-day prune) or the household
  (cascade).
- Staff phones' push endpoints live in `push_subscriptions` as owners' do.
  They go when turned off, when the push service answers 404/410, or with
  the phone's session.
- `export_household_data()` (127) gains `staff_notifications`: phone number
  as the list shows it (HP 1, HP 2), names, since when. No endpoints.

### SQL tests (`supabase/tests/140_…`)

- **Admin adds today's chore for Sari**: queues one push to her phone. Three
  rooms in one insert: still one. A chore for tomorrow: none. An unassigned one:
  every listed phone.
- **Staff phone takes a chore**: none. **Cron or migration change**: none.
  **Quiet hours** (p_now 22.00): none. **Household switch off**: none.
- **Shared phone** (two PIN sign-ins in 30 days): the body is the shared one.
- **Sari's leave approved with reassign to Wati**: one push each. **Rejected**:
  Sari only. **A suggestion of 3 rows approved**: one push.
- **Repair dismissed**: the reporter only, without the reason.
- **Second task push within 5 minutes**: skipped.
- **Unlinked phone**: none (dispatch plan).
- **`set_my_push_person` from a phone whose last PIN sign-in was Wati, for
  Sari, without a PIN**: refused. With Sari's PIN: accepted. From a Google
  account: refused.
- **`staff_push_overview` from a staff phone**: refused.

## Privacy policy (both languages, owner approves the text first)

New personal data: **push-notification details from staff phones**, and
**which staff get notifications on which linked phone**. There is no new
service: the same Apple, Google and Mozilla push services deliver them. Bump
`policyVersion` and `effectiveDate` in `src/config/legal.ts`, with a dated
comment.

**Staff**, a new line after "Which phones are linked…":

- EN: "If you turn notifications on for your name on a phone: that the
  phone gives you notifications, and the phone's push-notification details.
  They tell you about a new task for you today, a task moved to you, the
  answer to your leave request or schedule suggestion, and a repair you
  reported being fixed or not needed. On a phone several people use, a
  notification shows only whose it is (for example “Untuk Sari”), not the
  details. None are sent between 9 PM and 6 AM. Admins can see whose
  notifications are on, and on which linked phone."
- ID: "Jika Anda mengaktifkan notifikasi untuk nama Anda di sebuah HP: bahwa
  HP itu memberi Anda notifikasi, dan data notifikasi HP itu. Notifikasi
  memberi tahu tentang tugas baru untuk Anda hari ini, tugas yang dipindah
  ke Anda, jawaban atas permintaan cuti atau usulan jadwal Anda, dan laporan
  kerusakan Anda yang sudah diperbaiki atau tidak perlu diperbaiki. Di HP
  yang dipakai beberapa orang, notifikasi hanya menyebut untuk siapa
  (misalnya “Untuk Sari”), tanpa rinciannya. Tidak ada notifikasi pukul
  21.00–06.00. Admin bisa melihat notifikasi siapa yang aktif, dan di HP
  terhubung yang mana."

**Admins' own data**, beside the language choice:

- EN: "Whether your household sends notifications to staff phones."
- ID: "Apakah rumah tangga Anda mengirim notifikasi ke HP staf."

**Technical**, the existing line gains staff phones:

- EN: "Your browser's push-notification details, if you turn notifications
  on (on an admin's browser or a staff phone)."
- ID: "Data notifikasi browser Anda, jika Anda mengaktifkan notifikasi (di
  browser admin atau HP staf)."

**Section 7, How long we keep it**, a new line:

- EN: "A staff phone's notification details are deleted when notifications
  are turned off on it, when the push service says the phone no longer
  accepts them, or when the phone is removed from the household (its ID is
  then deleted after 7 days without use)."
- ID: "Data notifikasi HP staf dihapus saat notifikasi dimatikan di HP itu,
  saat layanan notifikasi menyatakan HP itu tidak lagi menerimanya, atau
  saat HP itu dihapus dari rumah tangga (ID-nya lalu dihapus setelah 7 hari
  tidak dipakai)."

**Purposes**: "Sending notifications you've turned on … consent" already
covers staff. It's unchanged.

**Service providers, noticed while reading:** the endpoint allow-list (103)
includes Microsoft's push service (WNS, Edge on Windows), but the policy
names only Apple, Google and Mozilla. The gap already exists for owners'
browsers. Fix it in this phase's privacy PR at the latest: add "or
Microsoft" in both languages, or drop WNS from the allow-list.

## Tutorials

- **Staff**: the turn-on card is the tutorial (D10). One card, then gone,
  with the "Yang baru" line.
- **Owner, What's new** (admins of households with staff): the card in the
  owner table above, EN/ID.

## How it's built (after the owner's OK)

It's built **after Phase 165 PR A** (139), so 140 follows it in order. They
touch no shared functions: 165 adds owner pushes, and this adds staff ones.

**PR A: database and staff turn-on.** Migration 140, the SQL tests,
`src/components/staff/staff-push-card.tsx` and `staff-push-sheet.tsx` (ID
only). It also adds the `push.ts` helpers `setMyPushPerson` and `myPhonePushPeople`,
`usePushResync` on staff Today, the strip for a push meant for someone else, the glossary rows, the privacy
lines, and `legal.ts`.

**PR B: owner side.** The switch in `push-notification-settings.tsx`, the
status in the staff list and the linked phones card, the "will get a
notification" toasts, and the What's new card (EN/ID).

Staging first, with two phones (one personal, one shared by two people), an
Android and an iPhone on the Home Screen. Then production after the owner's
OK, migration before the merge (main deploys to production).

## Validate

From audit item 4: 3 households, 2 weeks.

- Time from an owner adding a same-day task to staff starting it, before and after.
- How many staff turn notifications on, and how many still have them on
  after 2 weeks (a push service's 410 removes the row, so that shows
  in the data).
- Ask each owner: did you still send a WhatsApp after adding a task?

If staff with notifications on still start late, the channel isn't the
problem, and the WhatsApp experiment (B4) has less to prove.

## Decisions for the owner

- **D1: Which events push to staff.**
  **A (recommended):** the four in the brief.
  - A new task for you today.
  - A task moved to you (or its time changed today, or a leave cover).
  - The admin's answer to your leave request or schedule suggestion.
  - A repair you reported, once it's fixed or not needed.

  B: A, plus "taken from you" and "cancelled" (more complete, but more
  buzzing about things that need no action). C: tasks only.
- **D2: Which tasks count as "new".**
  **A (recommended):** only tasks for **today** that an admin added or moved.
  A task for another day shows on its day. B: today and tomorrow (adds a push
  for planning ahead, at the cost of more pushes). C: any new task.
- **D3: Tasks for anyone ("Semua Petugas").**
  **A (recommended):** one push to every staff phone with notifications on,
  **Tugas baru untuk semua**. B: no push for unassigned tasks (quieter, but
  the task most likely to be missed gets no push).
- **D4: Quiet hours.**
  **A (recommended):** fixed 21.00–06.00 WIB for every staff phone. Nothing is
  sent then, and the app shows it when opened. B: each phone picks its own
  hours (one more setting for staff). C: hold night pushes and send them at
  06.00 (needs a queue table and a job, and the morning starts with a buzz).
- **D5: What a shared phone shows.**
  **A (recommended):** title **Untuk Sari**, body without details ("Ada tugas
  baru hari ini."). A personal phone shows the details. "Shared" means 2+
  people have notifications on there, or 2+ people signed in with a PIN in 30
  days. B: always details, prefixed "Untuk Sari:" (the audit's sketch;
  coworkers see each other's leave answers). C: never details, even on a
  personal phone.
- **D6: Who may add a name to a phone.**
  **A (recommended):** the person on duty. The server accepts it when this
  phone's latest PIN sign-in was that person, and otherwise asks for the PIN
  once. B: always ask for the PIN (safest, one more step for everyone). C:
  trust the phone (anyone on a shared phone could get Sari's pushes).
- **D7: Where staff settings live.**
  **A (recommended):** a **Notifikasi di HP ini** row at the bottom of the
  Lapor sheet, with one switch per person and no per-event options. B: a bell
  in the staff header (easier to find, but a new element on a screen #62
  just made calmer).
- **D8: Owner control.**
  **A (recommended):** one household switch, **Send notifications to staff
  phones** (on by default), plus who has them on in the Staff list and on each
  linked phone. B: no switch, only the status. C: a switch per person.
- **D9: How often the card asks.**
  **A (recommended):** it takes the one tip slot on staff Today. "Nanti saja"
  hides it for 14 days, and after three times only settings offer it. Blocked
  phones are reminded every 30 days. B: ask once, ever. C: every day until on.
- **D10: Tutorials.**
  **A (recommended):** the staff card is the tutorial (with a "Yang baru"
  line), plus one owner What's new card (EN/ID). B: an extra staff Yang baru
  card as well (two cards about one thing).
- **D11: Order against Phase 165.**
  **A (recommended):** build after 165 PR A, as migration 140, in two PRs
  (database and staff first, then the owner side). B: build it before 165
  (165 would then move to 140, and its plan and mockup would need renumbering).

## Not in this phase

- Morning reminders or an evening summary for staff (no nagging).
- Owner replies to a couldn't-do (165's list), and a "seen" mark on pushes.
- Per-household time zones (WITA, WIT) for quiet hours.
- Kakak sending a push to staff ("tell Sari to…") by voice: later, through
  the same `queue_staff_push`.
- WhatsApp delivery of anything (B4).
- Pushes for owners who are also on the roster: they already get owner pushes.
