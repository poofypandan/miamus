# Phase 175, after Sunday — part 1: Trust

Build-ready specs, 13 Nov 2026. Docs only: nothing here is built yet. This
turns three steps of `docs/phase-175-tabs-and-today-plan.md` (section 5 and
the *After Sunday* table, steps 4, 5 and 6) into work an executor can start
on. The owner accepted that plan on 12 November ("yes to everything").

Part 2 (the Away sheet, the weekly check-in, Kakak's tools) is its own
document. Steps 1 to 3 of the table need no migration and are specified
enough where they stand.

Migrations: **157** (watching the jobs), **158** (silence), **159**
(notification policy), **160** (watches). 156 is Phase 177. The manager
confirms numbers and phase names.

## 0. North star first

Less typing, no new required fields, no new module, no new reading for
staff beyond one icon and one tip.

- **Nothing here asks the owner to type.** Every new control is a switch
  that already has a sensible default.
- **Defaults keep today's behaviour.** Every owner still gets every alert.
  A chore tells nobody until its switch is on. Quiet hours are fixed, not a
  setting.
- **One promise:** a quiet day means a finished day, never a broken phone.

What a home notices when all three are live:

1. Under "All on track", a grey line: *All 3 staff opened Miamus today*.
2. If a staff phone is dead or stuck, the owner hears once, and Today says
   who.
3. A chore can tell the owners when it isn't done, as a pet routine can.
4. Each owner can switch off Pets, Home or Kitchen alerts; nothing rings at
   night except an urgent repair or a sick pet.

## 1. Where this departs from the accepted plan, and why

| The plan said | This spec says | Why |
|---|---|---|
| A row when a **staff member's notifications are off** | No row. It stays where it is (Settings → Staff) and is named in the weekly check-in (part 2) | It does not break the promise: staff notifications tell staff about *changes*. The owner cannot fix it from their phone, so an amber row would sit there for weeks and teach them to ignore amber |
| "All 4 staff **phones** opened today" | "All 3 **staff** opened Miamus today" | Two people can share a phone, and one person can have two. The question is about people |
| A **video** tip for staff | A staff tip card (two lines of Indonesian, the mechanism that exists). A video stays the owner's to record if they want one | Nobody on the build can produce a video; the card can ship |
| **Quiet hours** as the owner's choice | Fixed, 22.30 to 06.00, no setting | The owner's choice was question 5 (which two things may ring), and it is answered. A setting nobody asked for is a setting to maintain |
| Kinds per owner: Pets, Home, Kitchen, Repairs, Staff requests | Three new switches (Pets, Home, Kitchen). Repairs and Staff requests keep the switches they have | No second switch for the same thing |
| The evening summary follows the kinds | Not in this version: the summary stays whole | It is one push a day, and splitting it means rewriting the longest function in the database. Listed under *Later* |

## 1b. First: know when a job fails (migration 157)

Everything below promises that silence means "done". That promise rests on
scheduled jobs (the five-minute alerts, the evening summary, the morning
pushes). Today, if one stops, nobody is told (the audit's H2). So this goes
first. Nothing in it is visible to a household.

**No new log table.** `pg_cron` already keeps one row per run in
`cron.job_run_details` (status and message). The check reads that, so no job
function is re-created and no schedule is changed. The executor confirms the
view's columns on the local stack before writing the function.

```sql
create table if not exists public.job_alerts_sent (
  job text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (job, day)
);
alter table public.job_alerts_sent enable row level security;
revoke all on public.job_alerts_sent from public, anon, authenticated;
grant select, insert, delete on public.job_alerts_sent to service_role;
```

`check_scheduled_jobs(p_now timestamptz default null) returns integer`, not
`security definer`, `revoke … from public, anon, authenticated`, `grant … to
service_role`, on the hour from 06.00 to 22.00 Jakarta (`0 23,0-15 * * *`).
For each active job in `cron.job`:

- **failed:** its latest finished run has status `failed`;
- **missing:** no `succeeded` run within its longest allowed gap, read from
  the job's own schedule in `cron.job` so a job added later needs no change
  here:
  - a schedule that runs every five minutes around the clock (`*/5 * * * *`:
    `notify-routines-due` today, and `notify-chores-late` from section 4):
    30 minutes;
  - a schedule limited to some days of the week (its last field is not
    `*`: part 2's weekly check-in): 8 days;
  - every other schedule, which runs at least once a day, including one
    that only runs in a window of hours (the evening summary; the hourly
    10.00 to 17.00 job of section 2d, silent overnight by design): 26
    hours.

For each such job not yet in `job_alerts_sent` today: one push to the
platform admins (`platform_admins`, as 113's request push reaches them),
*Miamus: a job needs a look* with the job's name and the first 200
characters of its message, then the row. It also deletes
`cron.job_run_details` rows older than 14 days and its own rows older than
30.

Limits, stated in the migration's header: a job that catches its own errors
per household (most do, with `raise warning`) still counts as succeeded, and
a push that the push service refused is not seen here. Both are in *Later*.
Nothing watches the watcher; an outside uptime check is the operator's to
add.

## 2. Silence you can trust (migration 158)

### 2a. The owner's own notifications (no migration; can ship first)

The dashboard already asks an owner to turn notifications on, per phone,
and remembers "Not now" for a week (`src/lib/push-prompt.ts`). That prompt
becomes a row in **Waiting for you** instead of a card of its own:

- Shown when this phone's status is `off` or `denied`, the Set up card is
  gone, and the prompt is not snoozed (the rules that exist; unchanged).
- *Notifications are off on this phone* / *Notifikasi mati di HP ini*, with
  **Turn on** / **Nyalakan** (`off`) or **How to turn on** / **Cara
  menyalakan** (`denied`: opens Settings → Notifications, which already
  explains). **Not now** / **Nanti saja** snoozes as today.
- It counts as one row in the status line ("1 waiting for you"). Add
  `notificationsOff: boolean` to `WaitingInput` in `src/lib/today-status.ts`.

### 2b. Did each person open Miamus today?

**What is stored** (new table, the only new personal data in this
document):

```sql
create table if not exists public.staff_app_days (
  household_id uuid not null references public.households (id) on delete cascade,
  staff_id uuid not null references public.staff_profiles (id) on delete cascade,
  -- The phone that said so: one person may use two phones.
  device_user_id uuid not null references public.device_sessions (user_id) on delete cascade,
  day date not null,                         -- the Jakarta calendar day
  updated_at timestamptz not null default now(),
  primary key (staff_id, day, device_user_id)
);

-- What is waiting to send belongs to the phone, not to a person: two people
-- may share one phone and its one outbox.
alter table public.device_sessions
  add column if not exists waiting_to_send smallint not null default 0,
  add column if not exists waiting_on date;
alter table public.device_sessions drop constraint if exists device_sessions_waiting_check;
alter table public.device_sessions add constraint device_sessions_waiting_check
  check (waiting_to_send between 0 and 999);
create index if not exists staff_app_days_household_idx on public.staff_app_days (household_id, day);
create index if not exists staff_app_days_device_idx on public.staff_app_days (device_user_id);
alter table public.staff_app_days enable row level security;
revoke all on public.staff_app_days from public, anon, authenticated;
grant select, insert, update, delete on public.staff_app_days to service_role;
```

Two facts, kept apart on purpose:

- **Who opened Miamus today**: one row per person, per phone, per day. A
  person is "opened" when they have a row on any phone.
- **What a phone still has to send**: one number on the phone's own row
  (`device_sessions`), with the day it was reported. The outbox is the
  phone's, whoever is signed in. So a second phone with an empty outbox
  never clears the first phone's count, and on a shared phone the count
  clears when the outbox empties, whoever is using it then.

**No time is ever shown to an owner** (`updated_at` is for the server only):
the plan's promise to staff was "opened today, yes or no", never when, never
for how long, never where. Kept **14 days**, pruned nightly.

**Two functions**, both `security definer`, `set search_path = ''`, with
`revoke all … from public, anon;` and `grant execute … to authenticated;` in
the migration:

- `mark_staff_app_open(p_staff_id uuid, p_waiting integer) returns void`.
  For staff phones. The household comes from `staff_push_phone_household()`
  (141): a linked phone's session, never an owner's account (an owner's
  session is refused, as that helper already does). The person must be in
  that household, not archived, and not an owner's roster row
  (`user_id is null`); otherwise nothing is written. It upserts today's
  row for this person on this phone (`auth.uid()` is the phone's session),
  and sets this phone's `waiting_to_send = least(greatest(p_waiting, 0),
  999)` and `waiting_on` to today.
- `staff_app_today() returns jsonb`. For owners, for today:
  `{ "opened": [staff ids], "phones": [{ "staff_ids": […], "waiting": 3 }] }`.
  `opened` is everyone with a row on any phone. `phones` lists each phone of
  the household whose `waiting_on` is today and whose count is above 0, with
  the people who opened Miamus on it today. Guarded by
  `caller_admin_household()`, never `get_user_household_ids()` (staff phones
  pass that). No timestamps and no phone identifiers in the answer.

**The staff phone** calls `mark_staff_app_open` with the signed-in person
(`readActiveStaffId()`) and the count of its outbox (what the weak-signal
queue holds):

- when the staff app opens and when it comes back to the front, at most
  once in 15 minutes while the person and the count are the same;
- **whenever the signed-in person changes** (a shared phone: Yanti picks
  her name while the app stays open; `StaffLoginGate` changes the identity
  without reloading the page), at once, whatever was sent before, so the
  new person gets their mark;
- **whenever the outbox count changes** while the app is open
  (`subscribeOutbox()` in `src/lib/offline-queue.ts`), so photos that get
  stuck during a session are reported without the app being closed first:
  one call a minute at most, carrying the latest count, and always one more
  when the count reaches zero.

A report is the pair (person, count). The phone keeps only **the latest**
one. If the call fails, it tries again while the app is in front, after 30
seconds, then 1, 2 and 5 minutes, then every 5 minutes, until it succeeds
or a newer report replaces it; a failure shows nothing to the person. So a
final "0" that failed on a weak signal still arrives, and so does a "3".
An owner in staff view sends nothing.

A phone with no signal at all cannot report anything, so it reads as "has
not opened today". A phone whose signal is too weak for photos can still
make this small call, so it reads as "3 waiting to send". Both tell the
owner the same true thing: something is wrong with that phone.

### 2c. What the owner sees

A pure function `silence(people, today, now)` (`today` is what
`staff_app_today()` returns) in a new
`src/lib/silence.ts`, unit-tested, fed by Today's progress card
(`lib/staff-progress`) and `staff_app_today()` (read with the household's
other data, refreshed on the silent sync).

A person is **quiet** when all of these are true:

- it is 10.00 or later on this phone;
- they are not on approved leave today;
- at least one task of **theirs** (not Anyone's) is open and its time
  passed 30 minutes ago or more;
- they are not in `opened`.

A phone is **stuck** when it is in `phones` (it reported something waiting
today).

| On Today | When | Words |
|---|---|---|
| A row in *Waiting for you*, one per person | quiet | *Sari hasn't opened Miamus today* / *Sari belum membuka Miamus hari ini*. A tap opens Sari's day |
| A row in *Waiting for you*, **one per phone** | stuck, and it is 10.00 or later | *3 on Sari's phone are waiting to send* / *3 di HP Sari menunggu dikirim*; a shared phone names both, *Sari and Yanti's phone* / *HP Sari dan Yanti*. A tap opens the first person's day |
| A grey line under the status line | nobody is quiet, no phone is stuck, and every person with a task today is in `opened` | *All 3 staff opened Miamus today* / *Semua 3 staf sudah membuka Miamus hari ini* |
| Nothing | otherwise (before 10.00, a day off, a home with no staff) | |

Both rows count in the status line. Add `quiet: number` (people) and
`stuck: number` (phones) to `WaitingInput`.

### 2d. The one push

A new job, `notify_staff_quiet(p_now timestamptz default null)`, on the hour
from 10.00 to 17.00 Jakarta (`0 3-10 * * *`), not `security definer`,
`service_role` only, as the other jobs:

- for each household, the people who are quiet by the same rule, read from
  `chore_days_open(today)` and `routine_slots_open(today)` (139) for "a task
  of theirs is open and 30 minutes late" and from `staff_on_leave_on` (152);
- one push per household per day, to every owner (through
  `queue_owner_push`, so the policy of section 3 applies; tag
  `phone-quiet-<day>`):
  *Sari hasn't opened Miamus today* · *2 tasks are late* / *Sari belum
  membuka Miamus hari ini* · *2 tugas terlambat*; two people: *Sari and
  Yanti …* (`push_names_label`, 150);
- claimed first in `owner_push_sent` (below), so it never repeats that day.

**One shared "already sent" table**, used here, by section 4 and by the
weekly check-in in part 2:

```sql
create table if not exists public.owner_push_sent (
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null,          -- 'staff_quiet', 'chore_alert', 'weekly_checkin', 'all_done'
  key text not null,           -- what it was about (a chore id, a week)
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (household_id, kind, key, day)
);
```

Internal like `routine_push_sent` (150): RLS on, no client role reads or
writes it, pruned after 35 days by the nightly job this migration adds
(`prune_staff_app_days()`, which prunes both tables).

### 2e. Fair to staff, and the law

- Never flagged on leave, never before 10.00, never without a late task of
  their own, never a time, never a place.
- **Staff are told.** A staff tip card (`STAFF_WHATS_NEW`, Indonesian):
  *Yang dilihat pemilik rumah* — *Pemilik rumah bisa melihat apakah Anda
  sudah membuka Miamus hari ini, dan berapa foto yang belum terkirim. Jam
  dan lokasi tidak dicatat.*
- **Privacy policy and `legal.ts` change in the same PR** (the manager's
  files, both languages): owners can see whether each staff member opened
  Miamus that day and how many items were waiting to send; why; kept 14
  days. A new policy version.
- **Export:** `export_household_data` is re-created from its newest
  definition with `'staff_app_days'` (person's name and day; no
  times), so a staff member's data can be handed over (UU PDP).

## 3. Notification policy (migration 159)

### 3a. The rules

| When | What | Who |
|---|---|---|
| At once, any hour | Urgent repair. A pet reported sick | Every owner, always |
| At once, 06.00 to 22.30 | Everything else that is sent at once today, plus the two new ones here (a chore not done, section 4; a quiet phone, 2d) | Every owner who has not switched that kind off |
| 22.30 to 06.00 | Held, then one push at 06.00 | The same owners |
| Evening summary hour | As today. New: *All done today*, only for owners who asked | Each owner |

### 3b. Kinds, per owner

```sql
alter table public.user_preferences
  add column if not exists push_kinds_off text[] not null default '{}',
  add column if not exists all_done_push boolean not null default false;
alter table public.user_preferences drop constraint if exists user_preferences_push_kinds_off_check;
alter table public.user_preferences add constraint user_preferences_push_kinds_off_check
  check (push_kinds_off <@ array['pets', 'home', 'kitchen']::text[]);
```

Read and written by a new pair, as 139 and 152 did it (separate functions,
so the older pairs keep their return types and old app versions keep
working): `my_push_policy()` and `set_my_push_policy(p_kinds_off text[],
p_all_done boolean)`. `security definer`, only `auth.uid()`'s own row,
refuse a staff phone's anonymous session, `revoke … from public, anon`,
`grant … to authenticated`. An internal `push_policy_of(p_user uuid)`,
`service_role` only.

### 3c. One place applies the policy

Today a dozen triggers and jobs call `queue_owner_push` (114), and each has
its own idea of quiet hours. Re-creating them all would copy a dozen
functions forward. Instead **the policy lives in one function**:

- `push_kind_of_tag(p_tag text) returns table (kind text, urgent boolean)`,
  immutable, internal. It reads the tag every sender already sets:

  | Tag starts with | Kind | Urgent |
  |---|---|---|
  | `sick-` | pets | yes |
  | the urgent-repair tag | repairs | yes |
  | `routine-open-`, the medicine-refused tag | pets | no |
  | `chore-open-` (section 4) | home | no |
  | the food tags (staff added food; food to eat soon) | kitchen | no |
  | `phone-quiet-`, `pin-lock-`, anything else, or no tag | other | no |

  The executor fills in the exact prefixes by listing every call of
  `queue_owner_push`, `queue_staff_request_push` and
  `queue_repair_visit_push` in the migrations, and writes that list into the
  migration's header. `other` can never be switched off.

- `queue_owner_push` is **re-created from its newest definition, same
  signature**. For each owner with a device it now:
  1. if the tag is **urgent**, sends it as today, whatever the owner
     switched off and whatever the hour (a sick pet reaches an owner who
     turned Pets off);
  2. otherwise skips the owner if the tag's kind is in their
     `push_kinds_off`;
  3. otherwise, if it is 22.30 to 06.00 in Jakarta, writes the push to
     `owner_push_held` instead of sending it;
  4. otherwise sends it as today.
- `queue_staff_request_push` (139) and `queue_repair_visit_push` (152) get
  step 3 only (they have their own switches, and neither sends anything
  urgent).
- A sender that already stays silent at night by its own rule (the repair
  pushes from 21.00, routine alerts after 22.30) keeps that rule: it never
  reaches these functions at those hours, and this version does not change
  it.

Senders that go to one named owner (a bill's reminder at 07.00) do not pass
through here and do not change: they are already personal.

### 3d. Held overnight

```sql
create table if not exists public.owner_push_held (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now()
);
create index if not exists owner_push_held_user_idx on public.owner_push_held (user_id);
create index if not exists owner_push_held_household_idx on public.owner_push_held (household_id);
```

Internal (RLS on, no client role). `deliver_held_pushes()`, at 06.00 Jakarta
(`0 23 * * *`), `service_role` only: for each owner with rows, **one** push
and the rows are deleted in the same transaction.

- One held: that push as it was.
- More: *Overnight: 3 things* / *Semalam: 3 hal*, the body listing the
  first three titles, opening Today.

Rows older than 24 hours are deleted without sending (a job that failed
must not deliver yesterday's news tomorrow).

### 3e. All done

`notify_all_done(p_now)`, on the evening summary's cron (18.00 to 21.00
Jakarta), a small function of its own so the summary is not re-created: for
each owner whose summary hour it is and who switched it on, when the day had
at least one task, nothing is open (`chore_days_open`, `routine_slots_open`)
and nothing was marked couldn't-do: *All done today* · *39 of 39 done* /
*Semua selesai hari ini* · *39 dari 39 selesai*. Claimed in
`owner_push_sent` (`all_done`, key the owner's id).

### 3f. The screen

Settings → Notifications (`push-notification-settings.tsx`), one new group
above the switches that exist, in the owner's language:

```
What reaches you
  Pets                                   (on)
  Home                                   (on)
  Kitchen                                (on)
  Tell me when everything is done        (off)
An urgent repair and a sick pet always reach you. From 22.30 to 06.00
everything else waits until morning.
```

Saved on each tap, with the same toast and failure handling as the switches
beside it. No Save button, nothing to type.

### 3g. Privacy

No new kind of personal data: two settings on the owner's own row. A held
push is the text of a notification, kept at most until 06.00 (24 hours if
the job fails). My reading is one sentence in the policy's notifications
paragraph; the manager decides, and owns the file.

## 4. Watches (migration 160)

A watch is a task that tells the owners when it slips. Pet routines have
the switch (150). Chores get the same one.

### 4a. The switch

```sql
alter table public.household_tasks
  add column if not exists alert_owners boolean not null default false;
```

- Owners only. `household_tasks_owner_guard` is re-created from its newest
  definition with `alert_owners` in its owner-only list, so a staff phone
  cannot turn an alert on or off.
- In the chore editor (`chore-editor-dialog.tsx`), under the time: **Tell us
  if it's not done** / **Kabari kami jika belum dikerjakan** (the routine's
  words). Off by default.
- Available only when the chore has a time from 05.30 to 22.00 and is not a
  bill and is not for an owner. Otherwise the switch is greyed, with *Set a
  time to use this* / *Isi jamnya dulu untuk memakai ini* when the time is
  what is missing. Clearing the time turns it off.

### 4b. The alert

`notify_chores_late(p_now timestamptz default null)`, a new small function
on the routines' five-minute cron, `service_role` only, not `security
definer`. `notify_routines_due` is not touched.

- Reads `chore_days_open(today)` (139: it already follows leave, written
  days and who the chore is for), keeps chores whose template has
  `alert_owners`, a time from 05.30 to 22.00, and no `task_exceptions` row
  today.
- Sends when it is 30 to 50 minutes after the chore's time (and never after
  22.35), once: claimed in `owner_push_sent` (`chore_alert`, key the chore's
  id, today).
- The push, to every owner through `queue_owner_push`, tag
  `chore-open-<day>-<chore id>`:
  *Pel teras* · *Not done yet (10:00 AM)* / *Pel teras* · *Belum dikerjakan
  (10.00)* (`push_time_label`, 139). The title is the household's own words.

### 4c. The count on Today

Under the status line, grey, one line:

- with Kakak on: *Kakak is watching 12 things* / *Kakak memantau 12 hal*;
- without: *You'll hear if any of 12 things isn't done* / *Anda dikabari
  jika ada dari 12 hal yang belum dikerjakan*.

`watchCount()` in `src/lib/silence.ts` counts, and nothing else:

1. pet routines with the switch on, one per card (the same title, time and
   person is one);
2. chores with the switch on (repeating, or one-off and not done);
3. bills and upkeep with a reminder set.

Zero: no line. A tap opens a sheet, **What Miamus tells you about** / **Yang
dikabarkan Miamus ke Anda**, listing them under Pets, Home and Bills; each
row opens the routine or chore it is. No new tab and no new noun for owners.

### 4d. Staff

A task whose owner hears when it is missed shows a small `Bell` beside the
camera icon on its card, for routines and chores alike. An icon with a
screen-reader label (*Pemilik dikabari jika belum dikerjakan*), no visible
sentence. The tip card of 2e gains one line: *Tugas dengan ikon lonceng:
pemilik dikabari kalau belum dikerjakan.*

### 4e. Kakak

`create_chore` gaining the switch is in part 2, with her other tools.

## 5. Words

For `docs/indonesian-glossary.md` (the manager's file), in the first PR of
each section. Reused as they are: *Kabari kami jika belum dikerjakan*,
*Belum dikerjakan*, *Menunggu Anda*, *menunggu dikirim*, the tab names.

| English | Bahasa Indonesia | Where |
|---|---|---|
| Notifications are off on this phone | Notifikasi mati di HP ini | Waiting for you |
| Turn on / How to turn on / Not now | Nyalakan / Cara menyalakan / Nanti saja | Its buttons |
| {name} hasn't opened Miamus today | {name} belum membuka Miamus hari ini | Row and push |
| {n} on {name}'s phone are waiting to send | {n} di HP {name} menunggu dikirim | Row |
| {n} tasks are late | {n} tugas terlambat | The push's second line |
| All {n} staff opened Miamus today | Semua {n} staf sudah membuka Miamus hari ini | The grey line. Replaces the earlier "Semua N HP staf dibuka hari ini" |
| What reaches you | Yang sampai ke Anda | Settings → Notifications |
| Tell me when everything is done | Kabari saya kalau semua sudah selesai | The switch |
| An urgent repair and a sick pet always reach you. From 22.30 to 06.00 everything else waits until morning. | Perbaikan darurat dan hewan sakit selalu sampai ke Anda. Dari 22.30 sampai 06.00, yang lain menunggu sampai pagi. | Under the group |
| Overnight: {n} things | Semalam: {n} hal | The 06.00 push |
| All done today · {a} of {b} done | Semua selesai hari ini · {a} dari {b} selesai | The push |
| Set a time to use this | Isi jamnya dulu untuk memakai ini | Chore editor |
| What Miamus tells you about | Yang dikabarkan Miamus ke Anda | The sheet |
| What the owner sees (staff tip) | Yang dilihat pemilik rumah | Staff, Indonesian only |

No emoji. Icons: `BellOff` (notifications off), `Smartphone` (quiet or
stuck), `Bell` (the staff card and the sheet).

## 6. Known limits

- **Jakarta time.** Every job here reads the clock in Asia/Jakarta, as all
  the others do. A home in WITA gets its 10.00 push at 11.00. One fix for
  all jobs (a time zone per household) is its own piece of work.
- **Who opened** is what the phone says (the signed-in person). It is a
  sign of life, not proof.
- **The evening summary** ignores the three kinds (section 1).

## 7. Later

1. The evening summary split by kind.
2. Quiet hours as a per-owner setting, if someone asks.
3. A per-household time zone.
4. Staff notifications off, named in the weekly check-in (part 2 covers the
   check-in).
5. Jobs writing their own per-household warnings where the check can see
   them, and the push service reporting a refused push.
6. From the audit of 13 Nov: checking that the staff id a phone sends is the
   person whose PIN last opened it (`device_sessions.staff_id`), function by
   function as each is next re-created. It belongs with the database work of
   whichever phase next touches those functions, not with these screens.

## 8. Build: PRs, and what runs side by side

| PR | What | Files | Runs |
|---|---|---|---|
| **J1** | 1b: migration 157 and its test | `supabase/migrations/157_*.sql`, `supabase/tests/157_*.sql` | **First.** Nothing visible. Side by side with T1 |
| **T1** | 2a: the notifications row | `agenda-tab.tsx`, `src/lib/today-status.ts` and its test, the dashboard prompt's component, the `push-prompt` spec | Any time. No migration |
| **T2** | Migration 158 and its test; `mark_staff_app_open` from the staff app; data providers and the stub; privacy policy, `legal.ts`, glossary rows | `supabase/migrations/158_*.sql`, `supabase/tests/158_*.sql`, `src/app/staff/page.tsx`, `src/lib/data/*`, `tests/e2e/stub-backend.ts`, the manager's three files | First of this section. Nothing visible to owners |
| **T3** | 2c: `silence.ts`, the rows, the grey line; the staff tip | new `src/lib/silence.ts` and its test, `agenda-tab.tsx`, `today-status.ts`, `today-status.tsx`, `src/lib/whats-new.ts` (shared) | After T1 and T2 (`agenda-tab.tsx`) |
| **P1** | Migration 159 and its test | `supabase/migrations/159_*.sql`, `supabase/tests/159_*.sql` | **Side by side with T1 to T3**: no shared file |
| **P2** | 3f: the settings group | `push-notification-settings.tsx`, `src/lib/data/*`, a spec for two owners | After P1 |
| **W1** | Migration 160 and its test; the chore editor's switch | `supabase/migrations/160_*.sql`, `supabase/tests/160_*.sql`, `chore-editor-dialog.tsx`, types | After P1 (its tag is in 159's table). Side by side with T3 and P2 |
| **W2** | 4c and 4d: the count, its sheet, the staff bell | `silence.ts`, `agenda-tab.tsx`, `today-status.tsx`, the staff task card | After T3 and W1 |

Three executors can work at once: one on T1 → T2 → T3 → W2, one on
P1 → P2, one on W1 once P1 is merged. `agenda-tab.tsx` has one writer at a
time (T1, T3, W2 in that order).

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK: local, staging, production, each migration before the PR that
needs it.

## 9. Tests

- **SQL 157:** a failed run alerts once and not again that day; a
  five-minute job with no good run for 31 minutes alerts, and a daily job
  with none for 25 hours does not; a job that runs only from 10.00 to 17.00
  is not reported at 06.00 the next morning; a weekly job is not reported
  six days after its run; a job that ran well alerts nobody; no
  client role can read `job_alerts_sent` or execute the check; old history
  rows are deleted.
- **SQL 158:** a staff phone marks its own person; a second phone of the
  same person reporting 0 does not clear the first phone's 3, and the first
  reporting 0 then clears it; on a shared phone, Sari reports 3, Yanti
  signs in and the outbox empties: the phone reads 0 and is no longer
  listed; it cannot mark a person
  of another household, an archived person or an owner's roster row; an
  owner's session cannot mark anyone; `staff_app_today` refuses a staff
  phone and returns no timestamp; `anon` can execute neither; the job
  pushes once for a quiet person with a late task and not again that day,
  never for someone on leave, never before 10.00, never without a late task;
  rows older than 14 days go; the export holds `staff_app_days`.
- **SQL 159:** every tag in the header's list maps to its kind; an owner
  with `pets` off gets no routine alert while the other owner does; a sick
  report reaches both whatever is off and at 02.00; a staff request at 23.00
  is held and arrives at 06.00 as itself; three held arrive as one;
  a held row 25 hours old is deleted unsent; `set_my_push_policy` refuses a
  staff phone and an unknown kind; *All done* goes only to an owner who
  asked, only when nothing is open, once.
- **SQL 160:** a staff phone cannot change `alert_owners`; a chore 30
  minutes late alerts once; done, couldn't-do, on a paused leave, without a
  time, or after 22.35: nothing; a written day's own time is the one used.
- **Unit:** `silence` (each condition of "quiet" on and off, stuck, the grey
  line, before 10.00); `watchCount` (one per card, a done one-off, a bill
  without a reminder); `waitingRows` with the three new inputs.
- **Browser, owner (EN and ID):** the notifications row and its snooze; a
  quiet person's row and the grey line; the count and its sheet; the chore
  switch greyed without a time; two owners with different kinds see the same
  Today.
- **Browser, staff (ID):** the bell on a watched task; the tip card; no
  English; the ping is sent on open, when a save gets stuck while the app
  stays open (the count goes from 0 to 1), after the outbox empties, when
  a second person signs in on the same phone without closing the app, and
  again after a report that failed.
- **Must still pass:** `push-prompt`, `calm-start`, `first-run`,
  `weak-signal`, the evening-summary and routine-alert SQL tests.

## 10. Open questions for the owner

None block the build; the defaults stand unless the owner says otherwise.

1. No row for a staff member's notifications being off (recommended).
2. A tip card for staff now; a video only if you want to record one.
3. One push a day about quiet phones, on the hour between 10.00 and 17.00,
   only when that person also has a late task (recommended).
