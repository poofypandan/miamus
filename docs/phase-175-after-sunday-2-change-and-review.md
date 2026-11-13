# Phase 175, after Sunday — part 2: Change and review

Build-ready specs, 13 Nov 2026. Docs only: nothing here is built yet. This
turns steps 7, 8 and 9 of `docs/phase-175-tabs-and-today-plan.md` (the
*After Sunday* table; sections 5d, 5e and 6) into work an executor can
start on. Part 1 (`docs/phase-175-after-sunday-1-trust.md`) holds steps 4 to
6 and migrations 157 to 160; this part follows it.

Migrations: **161** (away), **162** (weekly check-in), **163** (Kakak's new
tool names). The manager confirms numbers and phase names.

## 0. North star first

Less typing, no new required fields, no new module.

- **Away is one sheet with three taps**, and Kakak fills it from one
  sentence. Nothing new has to be typed.
- **The weekly check-in asks nothing.** It is one card and one push a week.
- **Every Kakak tool here replaces typing the owner does today**, and every
  one has a by-hand screen that already exists or is in this document.

## 1. Where this departs from the accepted plan, and why

| The plan said | This spec says | Why |
|---|---|---|
| Family away "pauses the menu and sends alerts to the owner who stayed" | An owner who is away has **their own tasks** handed over or paused. Nothing else changes | An owner who is away usually wants to hear *more* about the house, not less, and can already switch kinds off (part 1). The menu needs no pause: nobody plans dishes for days they are away |
| A new store for "away" | **No new table.** Staff and owners use `leave_requests`, which already hands work over and back. Pets use the "At the vet" state that already pauses their routines, with a reason and a return date added | The engine, the evening summary and the staff screens already honour both. A third mechanism would have to be taught to all of them |
| The weekly suggestion "Move it to 10.00?" with one button that changes the task | The suggestion names the task and its button **opens the task's editor** | A one-tap change from a rule can be wrong, and Undo for a schedule change is a build of its own. Opening the editor is one more tap and never wrong |
| Kakak's tools "in this order: report a problem, bills, change and pause, answers, the weekly check-in in her words" | The same order, but the check-in in her words waits for *Later*, and "change" is cut to two verbs (move, stop) | Each tool needs eval cases before it is switched on. Five tools in one go would ship five half-tested ones |

## 2. Away (migration 161)

### 2a. One sheet

**Away / Sedang pergi.** Three questions, each answered with taps:

```
Away
Who?            [ Sari ] [ Yanti ] [ Coco ] [ Bruno ] [ Me ]
From – to       [ Today ] [ Tomorrow ] [ Pick dates ]   to   [ date ]   (a person)
Until           [ date ]   or   [ Until I say ]                           (a pet)
(a person)      What happens to their chores?
                ( Give to… ) ( Anyone can do them ) ( Pause them )
(a pet)         Why?   ( At the vet ) ( Boarding ) ( Travelling with us )
                Their routines pause until they are back.
[ Save ]
```

- **Who** lists the staff, the pets and "Me" (this owner). One at a time.
- **From – to**, for a person, as leave has it. **A pet is away from the
  moment it is saved**, so it is asked only **Until**: marking a pet away
  pauses its routines at once, as *At the vet* does today, and a date set
  ahead would pause them by itself on a day when plans may have changed.
  For next week's boarding, the owner says so on the day. *Until I say*
  leaves the end open, as today.
- **The question is about chores only.** Leave hands over, opens up or
  pauses a person's **chores** (`applyLeaveTriage()` in `src/lib/leave.ts`).
  A pet routine that person usually does is not paused or given to anyone
  by leave: while they are away its card shows to everyone, as it does
  today, because a pet still has to be fed. The sheet says so in one grey
  line under the answers: *Pet routines stay on for everyone.* / *Rutinitas
  hewan tetap berjalan untuk semua.* This version does not change that.
- **Give to** shows the other staff; it is the `reassign` that leave
  already has. **Anyone** is `unassign`. **Pause** is `pause`.
- Saving shows a toast with **Undo**: *Sari is away until Monday* / *Sari
  pergi sampai Senin*.

Where it opens from, all places that exist:

- Settings → People → Leave (the owner's leave screen gains **Add** and
  uses this sheet);
- a person's day (the progress card's sheet): **Away**;
- a pet's page: the **At the vet** button becomes **Away**, opening the
  sheet with that pet chosen;
- Kakak (section 4).

### 2b. What it writes

| Who | Stored as | New? |
|---|---|---|
| A staff member | A `leave_requests` row, approved in the same step by the owner who made it (`decided_by` them), with the chosen fallback | No. If today's owner path can only create `pending` and then decide, the sheet does both calls; the executor checks `createLeaveRequest` and `decideLeaveRequest` |
| Me (an owner) | The same, on the owner's own roster row (`staff_profiles.user_id` is theirs; migration 106). Their tasks follow the fallback like anyone's | No table. If a guard refuses leave for an owner's roster row, 161 relaxes it for a row whose `user_id` is the caller |
| A pet | `task_entities.status = 'admitted'` (what pauses routines today), plus two new columns | Yes: 161 |

```sql
alter table public.task_entities
  add column if not exists away_reason text,
  add column if not exists away_until date;
alter table public.task_entities drop constraint if exists task_entities_away_reason_check;
alter table public.task_entities add constraint task_entities_away_reason_check
  check (away_reason is null or away_reason in ('vet', 'boarding', 'travel'));
```

- Null reason with status `admitted` reads as *At the vet*, so every pet
  admitted before 161, and every admission from a staff phone, is unchanged.
- **Owners only** write the two columns. The staff guard of 146
  (`task_entities_staff_guard`: a staff phone may change `status` and
  nothing else) already refuses them; the migration's test proves it.
- When a pet's status goes back to `home`, a trigger clears both columns.
- **Coming back by itself.** `return_pets_due()`, nightly at 00.05 Jakarta,
  `service_role` only, not `security definer`: a pet with `away_until`
  before today goes back to `home`. No push: the routines simply show again.

Nothing else is re-created: `routine_slots_open`, the agenda engine and the
staff screens already treat `admitted` as "no routines".

### 2c. What Today says

Under **Coming up**, the day before someone's last day away and on that
day: *Sari is back tomorrow. Their tasks return to them.* / *Sari kembali
besok. Tugasnya kembali ke dia.* For a pet: *Coco is back tomorrow. Routines
start again.* / *Coco kembali besok. Rutinitasnya mulai lagi.* A tap opens
the sheet for that person or pet, where **Back early** ends it now (the
`end_leave_early` that exists; for a pet, status `home`).

A pure function `returning(leave, pets, today)` in `src/lib/away.ts`,
unit-tested.

### 2d. Staff

Staff see what they see today: their chores move, pause and return through
leave as now, and a pet that is away shows no routine cards. The pet's row
on a staff phone reads *Dirawat di klinik* (the glossary's words, unchanged), *Dititipkan* or
*Ikut bepergian*.
Staff can still admit a pet to the vet and bring it home; they cannot set a
reason or a date. Staff asking for their own leave is unchanged.

### 2e. Privacy

No new kind of personal data: leave already holds who is away and when,
for staff; an owner's own absence is the same kind of row about
themselves. A pet's reason and return date are not personal data. My
reading is no policy change; the manager decides.

## 3. The weekly check-in (migration 162)

### 3a. The card

On Today, from Sunday 17.00 until the owner taps **Got it** (remembered on
that phone) or Monday ends. Above "The day", below "Coming up".

```
This week
312 of 330 done without chasing (95%)

Slipped most
  Pel teras          not done 3 of 4 days
  Sikat gigi Coco    not done 2 of 7 days
Pel teras keeps slipping. Change its time or who does it?   [ Open it ]

Sari's phone has notifications off.

[ Got it ]
```

- **The number** is the week's tasks finished on their day, of those due
  (Monday to Sunday so far). A task marked "couldn't be done" is due and
  not finished. It is the plan's signal S3, shown to the owner.
- **Slipped most:** up to three repeating tasks with the most days not
  done this week, at least two each. None: the block is absent and the card
  says *Nothing slipped twice.* / *Tidak ada yang terlewat dua kali.*
- **One suggestion at most:** the first slipped task, if it was not done on
  half its days or more. Its button opens that task's editor.
- **Staff notifications off** (the row part 1 chose not to put on Today):
  one line per person, from `staff_push_overview()`. A tap opens Settings →
  Staff.
- Everything is worked out on the phone by a pure function
  `weeklyCheckin(days, staffPush)` in `src/lib/weekly-checkin.ts`, with the
  rules of `lib/week-summary.ts`. No AI, and nothing new is stored.
- **The window is the card's own: Monday to Sunday**, ending on the most
  recent Sunday whose 17.00 has passed (`checkinWeek(now)`, in the same
  file). The Week view's own week starts on Sunday (`weekStartOf()` in
  `src/lib/unified-agenda.ts`), so its rows are **not** reused as they are:
  the card loads its seven days through the same day loader the Week view
  uses, for those seven dates. On Monday the card still shows the week that
  ended yesterday, the same seven days the push counted.

### 3b. The push

`notify_weekly_checkin(p_now)`, Sundays 17.00 Jakarta (`0 10 * * 0`),
`service_role` only, not `security definer`. For each household with at
least one task due that week, to every owner who has not switched it off:

*Your week in Miamus* · *See how the week went. Open Today.* / *Kabar
mingguan Miamus* · *Lihat bagaimana minggu ini berjalan. Buka Hari Ini.*

- **The push carries no number.** The card's numbers are counted on the
  phone with the Week view's rules, where only a finished task is done. The
  server's stored daily counts (`north_star_days`, 142) also count a task
  marked "couldn't be done" as closed, so a number worked out there could
  disagree with the card (a week of couldn't-do would read 100% in the push
  and 0% on the card). One place counts: the card.
- "At least one task due that week" is read from `north_star_days` (any
  `due` above 0, Monday to Saturday), or, for the Sunday itself, from the
  `due` count of `north_star_day()` (144), which counts every task due that
  day, finished or not. Not from `chore_days_open` or `routine_slots_open`:
  those list only what is still open, so a home that finished its Sunday by
  17.00 would look as if it had no tasks.
- Claimed in `owner_push_sent` (part 1; `weekly_checkin`, key the Monday's
  date), tag `weekly-<monday>`.
- **A switch.** 162 adds `'weekly'` to the allowed values of
  `user_preferences.push_kinds_off` (part 1, migration 159) and to
  `push_kind_of_tag` (`weekly-` → weekly, not urgent). Settings →
  Notifications gains **Weekly check-in** / **Kabar mingguan** in the *What
  reaches you* group, on by default.

162 needs 158 and 159 applied first.

### 3c. Staff

Nothing. Staff never see the card or the numbers.

## 4. Kakak's next tools (migration 163)

### 4a. Rules for every tool here

- **Not strict.** Strict tools are at 3 tools and 15 of 16 union-typed
  parameters (`tests/unit/kakak-tool-limits.test.ts`). Every new tool is
  non-strict and checked in full by `validateToolCall`, as `add_food` and
  `put_away_ingredient` are. The one change to a strict tool (4c) adds
  required, non-null fields, which count as neither a union nor optional.
  That test's totals must not move.
- **Nothing is saved without yes.** Each tool only suggests; the card shows
  what will change; the toast has Undo.
- **By hand first.** Each tool saves through the same action as a screen
  that exists.
- **Eval cases before it is on.** About eight sentences per tool in
  `tests/kakak/test-set.json`, and a practice-mode script, in the tool's own
  PR.
- **One migration for the names.** `kakak_requests.tools` and
  `kakak_record` list the tool names (126, 155). 163 re-creates
  `kakak_record` once, from 155, with all four new names
  (`report_problem`, `set_away`, `move_task`, `stop_task`), with its
  `revoke … from public, anon` and `grant … to authenticated` restated, so
  the tool PRs after it need no migration.

### 4b. `report_problem`

"The tap in the guest bathroom is leaking."

| Field | |
|---|---|
| `title` | Short, in the owner's words. Max 120 |
| `room` | A room reference or null |
| `spot` | "under the sink", or null. Max 40 |
| `urgent` | boolean. True only when the owner says so (water, electricity, a door that will not lock) |
| `details` | null, or up to 500 |

Card: **Repair / Perbaikan** with What, Where, Urgent. Saved as an open
repair through the owner's existing add-repair action. Only when Repairs is
switched on; otherwise the tool is not offered and Kakak says where to
switch it on, as for pets and food.

### 4c. `create_chore`: two more answers

The strict tool gains two required fields:

- `tell_if_not_done`: boolean. True only when the owner asks to be told
  ("…and tell me if it isn't done"). Needs a time; without one Kakak asks
  for it. Saved as `alert_owners` (part 1, migration 160).
- `kind`: `"chore"` or `"bill"`. "Remind me to pay PBB every year" is a
  bill: it is saved with the bill category the editor uses, for the owner
  who asked, with `remind_days_before`. **No amount**: Kakak never handles
  money; the amount is typed in the editor if wanted.

### 4d. `set_away`

"Sari is going home until Monday." "Coco is at the vet." "We're away from
the 24th to the 2nd."

| Field | |
|---|---|
| `who` | A staff reference, a pet reference, or the owner's own reference |
| `from`, `to` | Dates. For a pet, `from` is null (it is away from now) and `to` may be null. A pet that will be away later is not a call: Kakak says to tell her on the day |
| `work` | `give`, `anyone` or `pause` for a person; null for a pet |
| `give_to` | A staff reference with `give`, else null |
| `reason` | `vet`, `boarding` or `travel` for a pet; null for a person |

Kakak asks at most one question: what happens to the tasks, with the three
answers as taps. The card is the Away sheet's summary; saving goes through
the sheet's own save (section 2b). Several pets leaving today is one
call per pet, shown as one card. "We're away from the 24th" is a call for
the owner only; for the pets Kakak says to tell her on the day (2a).

### 4e. `move_task` and `stop_task`

"Move the walk to 5 pm." "Give the mopping to Yanti." "Stop the Monday mop."

These need what Kakak does not have today: **the tasks themselves**. The
household block gains a section listing repeating chores and pet routines,
each with a reference (`C1…` for chores; routines as they are referenced
now), its title, its days and time, and who does it. One-off chores already
done are left out; at most 80 lines, the most recently changed first.

| Tool | Fields | Saved through |
|---|---|---|
| `move_task` | `task` (reference); `time` (HH:mm or null to leave it); `assignee` (reference, `anyone`, or null to leave it). At least one of the two | The chore's or routine's own edit |
| `stop_task` | `task`; `from` (a date; today by default) | Ending the repeat (`recurrence_until`) or switching the routine off, as the editor does |

Card: the task's name with **before and after** in words (*Time: 16.00,
was 15.00*). Undo puts back exactly the fields the card changed. Kakak never
deletes anything; a stopped task keeps its history.

### 4f. Answers

"Did everything get done today?"

No tool. The household block gains four lines, worked out by the code that
draws Today (`lib/today-status`): done and total, how many are late, how
many could not be done, and the titles of up to five late tasks. Kakak
answers in one or two sentences from those lines and points to Today. She
never guesses beyond them.

### 4g. Privacy

Kakak's requests would newly carry: the household's repeating task titles
with their times and who does them (4e), today's counts and up to five
late task titles (4f), and whether someone is away (4d). The policy's Kakak
paragraphs list what each request carries, so **4d, 4e and 4f each need a
policy line in both languages and a new version** in the PR that switches
them on. `report_problem` and the `create_chore` fields send nothing new.

## 5. Words

For `docs/indonesian-glossary.md` (the manager's file). Reused as they are:
*Sedang pergi* (Away), *Kabar mingguan* (Weekly check-in), the leave and vet
words on screen today.

| English | Bahasa Indonesia | Where |
|---|---|---|
| Who? / From – to / What happens to their chores? | Siapa? / Dari – sampai / Tugasnya bagaimana? | The Away sheet. "Tugas" is the word for chores |
| Pet routines stay on for everyone. | Rutinitas hewan tetap berjalan untuk semua. | Under the three answers, for a person |
| Give to… / Anyone can do them / Pause them | Berikan ke… / Siapa saja boleh / Jeda dulu | Its three answers |
| Why? · At the vet · Boarding · Travelling with us | Kenapa? · Dirawat di klinik · Dititipkan · Ikut bepergian | A pet. *Dirawat di klinik* is the glossary's existing row for "At the vet"; the other two are new |
| Their routines pause until they are back. | Rutinitasnya dijeda sampai kembali. | A pet |
| Me | Saya | The owner in "Who?" |
| {name} is away until {day} | {name} pergi sampai {day} | Toast |
| {name} is back tomorrow. Their tasks return to them. | {name} kembali besok. Tugasnya kembali ke dia. | Coming up. The app stores no gender, so the English says "their" |
| {pet} is back tomorrow. Routines start again. | {pet} kembali besok. Rutinitasnya mulai lagi. | Coming up |
| Back early | Kembali lebih awal | The sheet |
| This week | Minggu ini | The card's title |
| {a} of {b} done without chasing ({p}%) | {a} dari {b} selesai tanpa ditagih ({p}%) | The card only. Done means finished; a task marked "couldn't be done" is not done |
| Your week in Miamus · See how the week went. Open Today. | Kabar mingguan Miamus · Lihat bagaimana minggu ini berjalan. Buka Hari Ini. | The push |
| Slipped most | Paling sering terlewat | The card |
| not done {a} of {b} days | terlewat {a} dari {b} hari | A slipped row |
| Nothing slipped twice. | Tidak ada yang terlewat dua kali. | The card |
| {task} keeps slipping. Change its time or who does it? | {task} sering terlewat. Ubah jamnya atau siapa yang mengerjakan? | The suggestion |
| Open it / Got it | Buka / Mengerti | Buttons (both exist) |
| {name}'s phone has notifications off. | Notifikasi di HP {name} mati. | The card |
| Time: 16.00, was 15.00 | Jam: 16.00, sebelumnya 15.00 | Kakak's change card |

No emoji. Icons: `Plane` (Away),
`CalendarCheck` (the weekly card).

## 6. Later

1. The weekly check-in in Kakak's words, and acting on a reply.
2. A one-tap schedule change from the suggestion, with Undo.
3. An owner's pushes paused while they are away, if anyone asks.
4. Kakak adding a staff member, planning the menu, reading a recipe from a
   photo (the plan's section 6).
5. From the audit of 13 Nov: a time zone per household. Both jobs here read
   Jakarta's clock, like every other.

## 7. Build: PRs, and what runs side by side

| PR | What | Files | Runs |
|---|---|---|---|
| **A1** | Migration 161 and its test; types; `src/lib/away.ts` with tests; data providers | `supabase/migrations/161_*.sql`, `supabase/tests/161_*.sql`, `src/types/database.ts`, `src/lib/away.ts`, `src/lib/data/*` | First of Away. Nothing visible |
| **A2** | The sheet and its four entry points; the Coming up lines; the staff pet label | new `away-sheet.tsx`, the leave panel, the pet page, `staff-workload-sheet.tsx`, `agenda-tab.tsx`, the staff pet row | After A1. `agenda-tab.tsx`: one writer at a time with part 1's T3 and W2 |
| **C1** | Migration 162 and its test | `supabase/migrations/162_*.sql`, `supabase/tests/162_*.sql` | After part 1's P1 (159). **Side by side with A1 and A2** |
| **C2** | The card and the settings switch | new `src/lib/weekly-checkin.ts` with tests, new `weekly-checkin-card.tsx`, `agenda-tab.tsx`, `push-notification-settings.tsx` | After C1; after A2 for `agenda-tab.tsx` |
| **K0** | Migration 163 and its test | `supabase/migrations/163_*.sql`, `supabase/tests/163_*.sql` | Any time. **Side by side with everything** |
| **K1** | `report_problem` | `src/lib/kakak/*`, `tests/kakak/*`, the suggestion card | After K0 |
| **K2** | `create_chore`'s two fields | the same files | After K1 and part 1's W1 (160) |
| **K3** | `set_away` | the same files | After K2 and A2 |
| **K4** | The task list in the block; `move_task`, `stop_task`; answers (4f); the policy lines | the same files, the manager's privacy files | After K3 |

Kakak's files have one writer at a time (K1 to K4 in order). Away and the
check-in can be built side by side by two executors while a third does
Kakak.

Every PR: `tsc`, the unit tests, the build, its own browser tests, the
Kakak eval for a Kakak PR, `@codex review` until clean. Merges and database
steps are the manager's, on the owner's OK.

## 8. Tests

- **SQL 161:** a staff phone cannot set `away_reason` or `away_until`; an
  owner can; going home clears both; `return_pets_due` brings back a pet
  whose date has passed and leaves one with no date; an owner's leave on
  their own roster row hands their tasks over in `chore_days_open`; a second
  household sees none of it.
- **SQL 162:** one push per household per week, not again on a second run;
  none for a household with no tasks; a household whose only tasks were on
  Sunday and were all finished before 17.00 still gets it; an owner with `weekly` off gets none
  while the other owner does; an unknown kind is still refused.
- **SQL 163:** the four names are accepted by the column check and by
  `kakak_record`; an unknown name is still refused; `anon` cannot execute
  it; every name 155 accepted still is.
- **Unit:** `returning` (the day before, the day, a pet without a date);
  `checkinWeek` (Sunday 16.59 is still last week; Sunday 17.00 and all of Monday are the week just ended); `weeklyCheckin` (the percentage, the three most slipped, fewer than two is
  not slipped, the suggestion's threshold, no suggestion, the notifications
  line); `validateToolCall` for each new tool (a good call, an unknown
  field, a bad reference, `give` without `give_to`, a person with a reason,
  `move_task` with nothing to change); the limits test unchanged.
- **Kakak eval:** the cases in each tool's PR, including one that must
  *not* use the tool (a leave question that is only a question; "the tap is
  fine now").
- **Browser, owner (EN and ID):** Away for a staff member, a pet and Me,
  with Undo; Back early; the Coming up line; the weekly card with and
  without slips, Got it; the switch.
- **Browser, staff (ID):** chores move and return through an owner-made
  leave, and that person's pet routines show to everyone whichever answer
  was chosen; a pet away shows its label and no routines; no English.
- **Must still pass:** the leave, vet and evening-summary tests, and
  `kakak.spec.ts`.

## 9. Open questions for the owner

None block the build; the defaults stand unless the owner says otherwise.

1. An owner being away changes only their own tasks, not their
   notifications (recommended).
2. The weekly suggestion opens the task's editor rather than changing the
   task itself (recommended).
3. Kakak may list your repeating tasks and today's late ones in her
   requests to Anthropic, so she can move, stop and answer (needed for 4e
   and 4f; say no and those two wait).
