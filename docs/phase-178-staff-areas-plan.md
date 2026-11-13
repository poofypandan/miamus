# Phase 178 — What each staff member sees

Build-ready spec, 13 Nov 2026. Docs only: nothing here is built yet. The
manager confirms the phase number and the migration numbers (165 and 166;
157 to 164 are reserved by earlier specs).

## 1. The request, in the owner's words

> "She doesn't want all the maids to be able to see dapur and perbaikan. I
> think we already set that maids can only see tasks they're assigned to.
> I'm not sure what best practice is for unassigned tasks now. Before
> unassigned tasks can be seen by everyone, but now we have more options
> that we don't feel comfortable some maids seeing. … Make it so we can
> assign which maids can see which options?"

What the app does today (checked in the code):

- Every staff phone gets the same three pills: **Tugas Hari Ini**,
  **Dapur**, and **Perbaikan** while Repairs is on
  (`src/app/staff/page.tsx`). Nothing is per person.
- A person sees the chores given to them **and every chore for Anyone**
  (`occurrencesForStaff`). Pet routines are shown to everyone.
- This is what the screen shows, not what the phone may read. The code says
  so itself: a staff phone belongs to the household, so every row still
  arrives on it.

## 2. What we build, in two steps

**Step 1 (migration 165): the owner chooses, the app hides.** Four switches
per staff member. The staff screen shows only what is on for the person
signed in. Small, and nothing changes for anyone until an owner turns a
switch off.

**Step 2 (migration 166): the server enforces.** For Kitchen and Repairs,
a phone whose signed-in person has the area off no longer receives those
rows at all.

North star: nothing to type, no required field, no new reading for staff
(things disappear; nothing new appears).

### The four areas

| Area | Owner's switch (EN / ID) | What it controls on a staff phone |
|---|---|---|
| `home` | Chores for anyone / Tugas untuk siapa saja | Chores that are for **Anyone** |
| `pets` | Pet routines / Rutinitas hewan | Pet routine cards that are for nobody in particular; the "at the vet" lines |
| `kitchen` | Kitchen / Dapur | The **Dapur** pill (food, ingredients, shopping, menu), **Menu hari ini** on the task list, kitchen tips |
| `repairs` | Repairs / Perbaikan | The **Perbaikan** pill, the "supervising" strip, repair tips |

All four are **on** for everyone, existing and new. For the household that
asked, the owner would turn Kitchen and Repairs off for the person who
looks after the pets, and probably Chores for anyone too.

## 3. The rules

1. **What you give someone by name always shows.** A chore assigned to a
   person, and a pet routine set for a person, are on that person's list
   whatever is switched off. The owner gave it to them on purpose.
2. **Work for Anyone goes to the people who do that kind of work.** A chore
   for Anyone shows to staff with *Chores for anyone* on. A pet routine for
   nobody in particular shows to staff with *Pet routines* on. This is the
   answer to "what is best practice for unassigned tasks": Anyone means
   anyone whose job it is, not everyone with a phone.
3. **Nothing is ever hidden from everybody.** If, on the day being viewed,
   no staff member who is working (not removed, not on leave that day) has
   an area on, the unassigned work of that area shows to **all** staff that
   day. A dog is fed even if the one person with *Pet routines* on is away.
   This applies to `home` and `pets`. It does not apply to `kitchen` and
   `repairs`: nothing in them is owed by a time.
4. **Covering someone brings their areas along.** While a person covers
   someone on leave (the leave's *Give to*), they see what the absent person
   sees, for those days only. The absent person's assigned chores already
   move to them through leave; this adds the areas, so whoever covers the
   cook gets *Menu hari ini*.
5. **A shared phone follows whoever is signed in.** Everything is worked
   out from the person whose name is on the phone. When the next person
   picks their name, the pills and the list change. A phone left on a pill
   that person may not see falls back to **Tugas Hari Ini**, as it already
   does when Repairs is switched off.
6. **Owners are never limited.** An owner in staff view sees everything.
   The switches exist only on staff.
7. **Telling the owner stays open to everyone.** The **Lapor** button keeps
   all its reports for every staff member: something broken, something run
   out, food that arrived, leave. Reporting a leak is not "seeing
   Perbaikan". A person with Repairs off who reports a problem still gets
   the notification when it is fixed, because it is about their own report.

## 4. Step 1: the owner's side

Settings → Staff → a person (the sheet that has rename and PIN reset), one
new block:

```
What Sari sees
  Chores for anyone                      (on)
  Pet routines                           (on)
  Kitchen                                (on)
  Repairs                                (on)
Anything you give Sari by name always shows.
```

- Each switch saves on the tap, with the toast and failure handling the
  sheet's other controls use. No Save button.
- When a switch leaves `home` or `pets` with nobody (rule 3), one grey line
  appears under the block: *Nobody sees pet routines now, so every staff
  member sees them.* / *Sekarang tidak ada yang melihat rutinitas hewan,
  jadi semua staf melihatnya.* (and the same for chores for anyone).
- On the staff list, a person with anything off gets one muted line under
  their name: *Doesn't see: Kitchen, Repairs* / *Tidak melihat: Dapur,
  Perbaikan*. A person with everything on shows nothing new.
- Kitchen and Repairs switches are shown only while that feature is on for
  the household; Pet routines only while the home has pets.
- Owners only. An owner's own row has no block.

## 5. Step 1: the staff side

One pure file, `src/lib/staff-areas.ts`, unit-tested:

- `AREAS = ["home", "pets", "kitchen", "repairs"]`.
- `effectiveAreas(person, staff, leave, day)`: the person's own areas, plus
  those of anyone they cover that day (rule 4). An owner's roster row: all.
- `areaHasNobody(area, staff, leave, day)`: rule 3.
- `sees(area, …)`: `effectiveAreas` has it, or (for `home` and `pets`)
  `areaHasNobody`.

`src/app/staff/page.tsx` and the list it builds, for the signed-in person
and the day on the ribbon:

| Today | With the areas |
|---|---|
| The pill row: Tugas Hari Ini · Dapur · Perbaikan | **Dapur** only with `kitchen`; **Perbaikan** only with `repairs` (and Repairs on, as now). A view that is no longer allowed reads as `tugas` |
| `occurrencesForStaff(all, staffId)`: mine, plus Anyone's | Mine, plus Anyone's **only with `home`** (a third argument) |
| Pet routine groups: all | A group shows when its routine is for this person (`master_schedules.staff_id`), or with `pets` |
| The "sedang dirawat di klinik" lines and their button | Only with `pets` |
| `MenuTodayCard` | Only with `kitchen` |
| `SupervisingStrip` | Only with `repairs` |
| Staff tips | Kitchen tips only with `kitchen`, repair tips only with `repairs` |
| `MyProgressLine` | Counts the same filtered list the person sees |
| The Lapor button | Unchanged (rule 7) |

Nothing new is written on a staff screen. No English anywhere on it, as
now.

## 6. Step 1: the database (migration 165)

```sql
alter table public.staff_profiles
  add column if not exists hidden_areas text[] not null default '{}';
alter table public.staff_profiles drop constraint if exists staff_profiles_hidden_areas_check;
alter table public.staff_profiles add constraint staff_profiles_hidden_areas_check
  check (hidden_areas <@ array['home', 'pets', 'kitchen', 'repairs']::text[]);

-- staff_profiles has column grants (096): a new column is unreadable and
-- unwritable until it is granted.
grant select (hidden_areas) on public.staff_profiles to authenticated;
grant update (hidden_areas) on public.staff_profiles to authenticated;
```

- Stored as what is **hidden**, so the default (nothing hidden) changes
  nothing, and an area added later is visible until an owner hides it.
- **Who may write it:** owners only. The update policy on `staff_profiles`
  is already admin-only (`admin_update_staff_profiles`, 146,
  `is_household_admin`); the column grant only lets that policy be reached.
  A staff phone's update is refused by the policy. The migration's test
  proves it, because this is the one thing that must not be wrong: a person
  must not be able to switch their own areas back on.
- **Who may read it:** every phone of the household, as the other columns.
  The staff phone needs its own row to know what to hide.
- No new function, no SECURITY DEFINER, no new policy. Additive. An old app
  version never sends the column and ignores it: it shows everything, as
  today.

Types: `StaffProfile.hidden_areas?: string[]` (optional: a row cached by an
older build lacks it and reads as nothing hidden). Data providers: one new
method, `setStaffHiddenAreas(staffId, areas)`.

## 7. Step 1: what it does not do, said plainly

- **It hides; it does not lock.** The rows still reach the phone, as they
  do today. Someone who inspects the phone's network traffic can still read
  them. Step 2 closes that for Kitchen and Repairs. The settings screen does
  not claim more than "what Sari sees".
- **Reminders.** A staff reminder for a pet routine that is for nobody in
  particular still goes to every phone that takes notifications (migration
  150), also to someone with *Pet routines* off. Step 2 narrows it. There
  are no Kitchen or Repairs notifications to staff today other than "your
  report was fixed", which stays (rule 7).
- **Kakak** is unchanged. A chore she suggests for a person shows to that
  person (rule 1). She is not told who sees what, so nothing new is sent to
  Anthropic.
- **The export** lists a staff member's fields by name and so does not
  carry `hidden_areas` yet. Add it when the export is next re-created (the
  Phase 175 "trust" spec re-creates it in migration 158).

## 8. Step 2: the server enforces (migration 166)

The server can tell who is on a phone: `device_sessions.staff_id` is the
person whose PIN last opened it (migration 146).

**Two helpers**, both `security definer`, `stable`, `set search_path = ''`,
`revoke all … from public, anon;` `grant execute … to authenticated;`
(policies run them as the reading role):

- `phone_person() returns uuid`: `device_sessions.staff_id` for
  `auth.uid()`, or null for an owner's account or a phone nobody has
  signed in on.
- `staff_sees(p_household uuid, p_area text) returns boolean`: true for an
  owner of the household (`is_household_admin`); otherwise true when
  `phone_person()` is a non-archived person of that household whose
  effective areas (their own, or those of someone they cover today) include
  the area; false when nobody is signed in on the phone.

**Read policies re-created** (each from its newest definition; the
household check stays, the area check is added):

| Table | A staff phone reads a row when |
|---|---|
| `food_items` | `staff_sees(household, 'kitchen')`, or this phone's person added it (`added_by = phone_person()`) |
| `recipes`, `recipe_ingredients`, `menu_dishes` | `staff_sees(household, 'kitchen')` |
| `repairs` | `staff_sees(household, 'repairs')`, or this phone's person reported it (`reported_by_staff = phone_person()`) |
| `repair_visits`, `repair_supervision`, `repair_notes` | `staff_sees(household, 'repairs')` |

The "or their own" halves are needed, not a nicety: a report from the Lapor
button is saved and read back in one request, and that request fails if the
person may not read the row they just wrote.

**Also in step 2:**

- **Kitchen notes** can hold a family member's allergy. They are a column
  on `households`, which every phone reads. Staff phones get them through a
  function that checks `staff_sees(…, 'kitchen')`; if `households` allows a
  column-level revoke, the direct read is closed, otherwise that limit is
  written into the migration's header.
- **Reminders** (`queue_staff_reminder_push`, 150): a reminder for a pet
  routine that is for nobody in particular goes only to people with
  `pets` on (with rule 3's fallback).
- **The audit's D2** rides along: the same `phone_person()` is what
  `cook_menu_dish` and the other staff-open functions should compare the
  staff id they are sent against. Doing that is its own small PR on top of
  166.

**Not enforced in step 2, on purpose:**

- **Chores and pet routines stay hidden by the app only.** "Assigned to
  someone else" has always been presentation, and rule 3 (nothing hidden
  from everybody) would have to be re-computed inside row-level security on
  the busiest tables in the app. The owner's worry was Kitchen and Repairs.
- **The shopping list's items** stay readable by every staff phone: every
  staff member reports things that ran out, pet supplies included.

**The risk to settle before step 2 ships:** a phone whose
`device_sessions.staff_id` is still empty (linked before 146 and never
asked for a PIN since) would lose Kitchen and Repairs until someone signs
in. Before the migration goes to production: count such phones there, and
have the staff app ask for the PIN again when its phone has no person
recorded. Step 2 does not ship until that count is zero for a household
with any area off.

## 9. Privacy

One new fact is stored about each staff member: which parts of the app an
owner lets them see. The privacy policy's staff section gets one sentence
in both languages, and `legal.ts` a new version, in step 1's first PR (the
manager's files). No new service, nothing sent to Kakak. Staff are told
nothing new on screen; if an owner wants them told, that is a conversation,
not a feature.

## 10. Words

For `docs/indonesian-glossary.md` (the manager's file), in step 1's first
PR. Reused: **Dapur**, **Perbaikan**, **Siapa saja**, **staf**.

| English | Bahasa Indonesia | Where |
|---|---|---|
| What {name} sees | Yang dilihat {name} | The block's heading |
| Chores for anyone | Tugas untuk siapa saja | Switch. "Siapa saja" is the Anyone assignee |
| Pet routines | Rutinitas hewan | Switch |
| Kitchen / Repairs | Dapur / Perbaikan | Switches; the staff pills' own words |
| Anything you give {name} by name always shows. | Tugas yang Anda berikan langsung ke {name} selalu terlihat. | Under the switches |
| Nobody sees pet routines now, so every staff member sees them. | Sekarang tidak ada yang melihat rutinitas hewan, jadi semua staf melihatnya. | Under the block, when rule 3 applies |
| Nobody sees chores for anyone now, so every staff member sees them. | Sekarang tidak ada yang melihat tugas untuk siapa saja, jadi semua staf melihatnya. | The same, for chores |
| Doesn't see: Kitchen, Repairs | Tidak melihat: Dapur, Perbaikan | The staff list, under a name |

No emoji. Icon: `Eye` on the block's heading.

## 11. Later

1. Server enforcement for chores and pet routines.
2. Areas set from the job chosen when staff are added in setup (a driver
   starts without Kitchen).
3. Kakak knowing who sees what, so she can say "Sari doesn't see Kitchen".
4. Finer switches inside Kitchen (Menu without Shopping).

## 12. Build: PRs, and what runs side by side

**Step 1**

| PR | What | Files | Runs |
|---|---|---|---|
| **V1** | Migration 165 and its test; types; `staff-areas.ts` with unit tests; both data providers and the browser tests' stub; glossary rows; the privacy sentence and `legal.ts` | `supabase/migrations/165_*.sql`, `supabase/tests/165_*.sql`, `src/types/database.ts`, `src/lib/staff-areas.ts`, `src/lib/data/*`, `tests/e2e/stub-backend.ts`, `tests/unit/staff-areas.test.ts`, the manager's three files | First. Nothing visible |
| **V2** | The owner's block and the staff list line | `src/components/dashboard/tabs/staff-tab.tsx` (and the person sheet it opens), an owner spec | After V1. **Side by side with V3** |
| **V3** | The staff page | `src/app/staff/page.tsx`, `src/lib/chore-recurrence.ts`, a staff spec | After V1. **Side by side with V2** |

**Step 2**

| PR | What | Files | Runs |
|---|---|---|---|
| **E1** | The staff app asks for the PIN when its phone has no person recorded | `staff-login-gate.tsx`, its spec | Before E2, and released a few days ahead of it |
| **E2** | Migration 166 and its test; the kitchen notes read; the reminder | `supabase/migrations/166_*.sql`, `supabase/tests/166_*.sql`, `src/lib/data/*` | After E1 and the count in section 8 |

Every PR: `tsc`, the unit tests, the build, its own browser tests, `@codex
review` until clean. Merges and database steps are the manager's, on the
owner's OK: local, staging, production.

### Can step 1 ship before Saturday 12.00?

Yes, if all of these are true by Friday 20.00 WIB; otherwise Monday:

- V1, V2 and V3 merged, Codex clean, CI green;
- migration 165 applied on staging and its test passing there;
- the five phone checks below done on staging by one person.

Why it is not reckless: one column with a default that changes nothing, no
function, no policy change; the staff page changes only for a person an
owner has switched something off for. Why it still needs care: the staff
page is the screen staff use all day, two days before the family demo.

### Five checks on a phone

1. With nothing switched off, a staff phone looks exactly as before.
2. Turn Kitchen and Repairs off for one person: their phone shows only
   **Tugas Hari Ini**; the other person's phone is unchanged.
3. Turn *Chores for anyone* off for them: chores for Anyone leave their
   list; a chore given to them by name stays.
4. Turn *Pet routines* off for everyone: the routines still show on every
   phone, and the settings say why.
5. On a shared phone, switch to the other person's name: the pills change.

## 13. Tests

- **SQL 165:** a staff phone cannot change `hidden_areas` on its own row or
  anyone's; an owner can; an unknown area is refused; every phone of the
  household can read it and a second household cannot; existing rows read
  as nothing hidden.
- **Unit (`staff-areas`):** nothing hidden sees all four; each area off;
  an assigned chore shows with `home` off; a routine for the person shows
  with `pets` off; rule 3 for `home` and `pets` (the only person with the
  area is on leave that day; is archived; nobody has it) and not for
  `kitchen` or `repairs`; covering brings the absent person's areas for the
  leave's days only; an owner's row sees everything; a row without the
  column sees everything.
- **Browser, owner (EN and ID):** the block, a switch saving on the tap,
  the "nobody sees" line, the staff list line; no block on an owner's row;
  Kitchen's switch absent while Kitchen is off for the household.
- **Browser, staff (ID):** the pills with Kitchen off, with Repairs off,
  with both; a link straight to Dapur lands on Tugas; chores for Anyone
  gone and an assigned one present; *Menu hari ini* gone; Lapor unchanged;
  a second person signing in on the same phone sees their own pills; no
  English.
- **SQL 166 (step 2):** with Kitchen off a staff phone reads no food,
  recipes or menu, except food its own person added; with Repairs off no
  repairs except its own report, and a report from Lapor still saves; the
  covering person reads both for the leave's days; a phone with nobody
  signed in reads neither; an owner reads everything; another household
  nothing; `anon` cannot execute either helper.
- **Must still pass:** the staff, leave, kitchen and repairs specs.

## 14. Open questions for the owner

None block the build; the defaults stand unless the owner says otherwise.

1. Work for Anyone shows only to staff with that area on, and to everyone
   if nobody has it (recommended).
2. Every staff member can still report something broken, run out or
   arrived, whatever is switched off (recommended).
3. Step 2 enforces Kitchen and Repairs on the server; chores and pet
   routines stay hidden by the app only (recommended for now).
