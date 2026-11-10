# Phase 163 — "My tasks" on Today

Status: **plan for the owner's OK. Not built.**
Roadmap item 10 (`docs/roadmap-2026-11-09.md`, P1), the other half of R9 in
`docs/app-review-2026-11-07.md` (the first half, staff first in Chores
progress, is live). Mockup: `docs/mockups/phase-163-my-tasks.html` (open in a
browser, phone width).

## The problem

Since Phase 139 (migrations/106) an admin can be given a chore: every admin
has their own row on the roster, and the chore form's "Who" list includes
them. But the only place an admin can **finish** a chore is the staff view:
tap **Staff** in the header (Overview | Staff), find the chore among the pet
routines, take two photos, tap **Selesaikan**, then tap **Overview** to go
back. And the staff view is Bahasa Indonesia only, so an owner who chose
English finishes their own chores in Indonesian.

On Today, the owner's own chores look like anyone else's: a row with their
name on it, and tapping it opens the **chore editor**, not a way to finish it.
So an owner who waters the plants every morning has to leave the owner app to
tick it off, or never ticks it off at all, and the day's progress says it was
never done.

## Who it's for

- **Owners who do a few chores themselves** in a home with staff: water the
  plants, pay the bills, take the dog to grooming.
- **Family members invited as admins** (a sister, a grown-up child) who are
  given chores by the person who set up the house.
- **Homes with no staff at all** (siblings, flatmates, a couple), where the
  people setting the chores are the people doing them.

Not for staff: their phones already open on their own list. Not for owners
who never have a chore: for them Today doesn't change at all.

## What's there today (read 2026-11-10)

- **Today** (`src/components/dashboard/tabs/agenda-tab.tsx`): Day | Week
  pills, the date ribbon, then Waiting for you (approvals), medicine alerts,
  the pets question, the quiet lines (repairs, food, shopping), the day
  heading, All · Pets · Chores filter pills, From earlier (overdue), and the
  day's rows. A chore row (`chore-timeline-row.tsx`) opens the editor when
  open and the before/after photos when done. The file's own header says
  "completing a chore is staff work and lives on their phones".
- **Who a chore is for:** `household_tasks.assigned_to` →
  `staff_profiles.id`. An admin's row has `staff_profiles.user_id` set
  (migrations/106). The household context resolves the signed-in admin's row
  as `memberProfile` (`ensure_my_member_profile`), cached on the phone, and
  every write is stamped with it (`completed_by`).
- **Chores progress** (`staff-completion-strip.tsx`, Chores → Today): staff
  first, then an admin only on a day they have chores (R9, first half). A
  chore counts for `assigned_to`, or failing that `completed_by`.
- **The staff view** (`src/app/staff/page.tsx`): for an admin, the list is
  their own chores plus unclaimed ones (`occurrencesForStaff`), all pet
  routines, in Indonesian. Tapping a chore opens `FinishChoreSheet`:
  **Ambil Tugas** for an unclaimed one, then **Foto Sebelum**, **Foto
  Sesudah**, **Selesaikan**. Staff-only, hard-coded Indonesian.
- **Both photos are required by the database**, not just the button:
  `require_chore_proof_photos` (migrations/104) refuses any change to
  `completed` without `before_photo_url` and `after_photo_url`, for owners
  and staff alike. Owners otherwise pass the chore guard (migrations/128).
- **A done chore without photos** already has a look on Today: green row,
  "Done", and a tap says "No photos were saved for this chore". Old
  completions from before photos look like this.

## The idea in one line

When you have chores on the day you're looking at, Today shows a short
**My tasks** card above the day's list; tap the circle to finish one, right
there, in your own language; no switch to the staff view.

## The screens (mockup)

1. **Today with My tasks.** Under the quiet lines, above the day heading: a
   card **My tasks · 1 of 3 done**. Each row: an empty circle, the time
   ("Anytime", or 7:00 AM / 07.00 as the owner chose), the title, the
   room. Carried-over ones first, with "carried over" under the title, as on
   today's rows. Done rows sink to the bottom of the card, green, with a
   filled check. The day's list below no longer repeats
   them (D1).
2. **Finishing one.** Tap the circle: the row turns green at once, and a
   toast says **Done: Water the plants · Undo** for 5 seconds. With photos
   optional (D3 A) that's the whole flow. Tap the row itself (not the circle)
   to open a small sheet: the chore's details, **Mark done**, **Add photos
   (optional)** (before and after, the same steps staff see, in the owner's
   language), and **Edit chore**.
3. **All done.** The card folds to one green line: **Your 3 tasks are done**
   with a chevron that shows them again.
4. **Nothing for you.** No card at all. Today looks exactly as it does now.

## What "mine" means (D2)

**Assigned to me**: chores whose `assigned_to` is my roster row, on the day
being viewed, plus my carried-over ones on today. Also any unassigned chore I
finished myself that day (it lands on me, as it does in Chores progress), so
finishing never makes a row disappear from my card.

Unclaimed chores ("Anyone") stay in the day's list. Taking one is already
possible: open it and pick yourself under **Who** in the chore form.

## Finishing: with or without photos (D3)

The recommended option makes photos **optional for admins finishing their
own chores**, and keeps them required for staff exactly as now:

- **Mark done** (the circle, or the button in the sheet) saves the chore as
  completed by me, with no photos.
- **Add photos** in the sheet offers the same two numbered steps as staff
  (before, after). If you add them, both are needed, as now: a chore is never
  saved with one photo.
- On Today and in Chores, a photo-less done chore shows "Done" as today; the
  toast on tap says "Done by {name}, no photos" instead of "No photos were
  saved".
- **Undo:** the toast's Undo puts it back to not done. After the toast, tap
  the done row: the sheet has **Mark not done**.
- **Which days:** today and carried-over chores can be finished. On a future
  day the card shows the rows without circles ("Tomorrow, 2 tasks"), so a
  chore isn't ticked off before it's due. On a past day, the card is
  read-only, like the rest of a past Today.
- **The staff view is unchanged.** An owner who switches to Staff still sees
  the staff experience, photos and all; it remains the way to see what a
  staff phone sees.

## How it fits the five tabs

No new tab, no new navigation, no new toggle:

- It's a **card on Today**, built like the existing ones (Waiting for you,
  From earlier): a rounded-xl bordered section with a small heading. No
  `<SegmentedControl />` is needed, because nothing switches.
- **Day view only.** The Week view stays the household summary.
- **The All · Pets · Chores filter pills** apply to the day's list below, not
  to My tasks (D1).
- **Chores tab:** unchanged. It's the household's chore desk, where
  chores are made and edited; Chores progress already shows an admin's card
  on a day they have chores.
- **Overview | Staff** in the header stays as it is.

Where it sits on Today, top to bottom: Day | Week · date ribbon · Waiting for
you · medicine alerts · pets question · quiet lines · **My tasks** · day
heading · filter pills · From earlier · the day's rows. Below the things that
need a decision from the owner, above the household's list.

## Empty states

| Situation | What Today shows |
| --- | --- |
| No chores for me on this day (most owners, most days) | Nothing: no card, no line |
| All of mine done | One green line: "Your 3 tasks are done" › (tap to show them) |
| Only carried-over ones left | The card, with the carried-over rows first |
| A future day | "Tomorrow, 2 tasks" heading, rows without circles |
| `memberProfile` still loading on first launch | Nothing until it lands (no flash of the household's chores as "mine") |
| An admin with no roster row (offline first launch, before 106) | Nothing: Today as now |

## Owner text (EN / ID)

| Where | English | Bahasa Indonesia |
| --- | --- | --- |
| Card heading | My tasks | Tugas saya |
| Card count | 1 of 3 done | 1 dari 3 selesai |
| Future day heading | Tomorrow, 2 tasks · 12 Nov, 2 tasks | Besok, 2 tugas · 12 Nov, 2 tugas |
| Row, no time | Anytime | Kapan saja |
| Row, carried over | carried over | terbawa dari kemarin |
| Circle (aria) | Mark done: {title} | Tandai selesai: {title} |
| Toast after finishing | Done: {title} | Selesai: {title} |
| Toast action | Undo | Urungkan |
| All done line | Your {n} tasks are done · Your task is done | {n} tugas Anda sudah selesai · Tugas Anda sudah selesai |
| Sheet button | Mark done | Tandai selesai |
| Sheet, photos | Add photos (optional) | Tambah foto (opsional) |
| Sheet, photo steps | Before photo · After photo | Foto sebelum · Foto sesudah |
| Sheet, photo hint | Both photos, or none. | Dua foto, atau tidak sama sekali. |
| Sheet link | Edit chore | Ubah tugas |
| Sheet, done chore | Mark not done | Tandai belum selesai |
| Done row toast (no photos) | Done by {name}, no photos | Diselesaikan {name}, tanpa foto |
| Save failed | Couldn't save. Try again. | Gagal menyimpan. Coba lagi. |
| What's new title (D5) | New: finish your own chores on Today | Baru: selesaikan tugas Anda di Hari ini |
| What's new line | Chores given to you show under My tasks. Tap the circle when it's done; photos are optional. | Tugas untuk Anda muncul di Tugas saya. Ketuk lingkarannya kalau sudah selesai; foto boleh tidak. |

Wording follows `docs/indonesian-glossary.md`: **tugas** for chores, **Hari
ini** for the Today tab, **Anda**, **Ubah** for change/edit, "terbawa dari
kemarin" and "Kapan saja" as on today's rows, **(opsional)** because this is
an owner-only form (staff forms say "boleh dikosongkan"), and owner times as
the owner chose them (7:00 AM in English, 07.00 in Indonesian).

## Glossary rows to add (before any Indonesian text)

The glossary is a shared file, so these are added when the phase is built,
not in this plan's PR:

| English | Bahasa Indonesia |
| --- | --- |
| My tasks (owner's card on Today) | **Tugas saya** |
| Mark done / Mark not done | **Tandai selesai** / **Tandai belum selesai** |
| Undo (toast action) | **Urungkan** |
| Add photos (optional), owner sheet | **Tambah foto (opsional)** |

## Staff text

None. Nothing changes on staff phones, so no staff tutorial card.

## Database

**With D3 A (recommended): one small migration, 136.** 135 is taken by the
feedback button (PR #53). Re-check `supabase/migrations` and the open PRs
before building. Not created in this PR.

`require_chore_proof_photos()` (migrations/104) is replaced so that becoming
`completed` without both photos is allowed **only** when all of these hold:

1. the caller is signed in (`auth.uid()` not null) and has a
   `household_members` row for the chore's household (an admin: never
   `get_user_household_ids()`, which staff phones pass);
2. `new.completed_by` is the caller's **own** roster row
   (`staff_profiles.user_id = auth.uid()`, same household);
3. the chore is the caller's or nobody's, matching D2: `new.assigned_to` is
   null or that same row, and on an update `old.assigned_to` is too. Who
   records the completion alone doesn't say whose chore it is (Codex, PR
   #56): without this, an admin could finish a staff member's chore with
   `completed_by` set to themselves and skip the photos. Checking the old
   value as well means a staff chore can't be reassigned and finished
   photo-free in one write; taking it over is a separate edit in the chore
   form first, which is the owner's call and shows on the chore;
4. both photos are null (one photo alone is still refused: "both, or none").

Everything else is unchanged: staff phones, the service role, and an admin
marking **someone else's** chore done still need both photos. Notes for the
migration:

- The function reads `household_members` and `staff_profiles`, so it becomes
  `security definer` with `set search_path = ''`, and the migration does
  `revoke all on function … from public, anon, authenticated;` and grants
  nothing else (a trigger fires without EXECUTE, as in migrations/128). Same
  trigger, same name; only the function body changes.
- Additive and safe for old app builds: it only allows more, and only for
  admins.
- Tests in `supabase/tests/136_admin_finish_without_photos.sql` (rolled
  back): an admin finishes their own chore with no photos (allowed); with one
  photo (refused); with both (allowed); an unassigned chore with no photos
  (allowed); an admin finishes a staff member's chore with no photos and
  `completed_by` set to themselves (refused); reassigns a staff chore to
  themselves and finishes it photo-free in the same update (refused), then
  in two separate updates (allowed); a staff phone with no photos (refused);
  a logged-out caller (refused); grants checked.
- Applied local first, then staging, then production with the owner's OK,
  before the PR merges (`main` deploys to production).

**With D3 B: no database change at all.**

## Privacy policy

**No change.** No new kind of data, no new service, nothing stored somewhere
new and no change in how long anything is kept. A chore finished without
photos stores less than today (no photos), not more. Reviewers please confirm
against AGENTS.md.

## How it's built (after the owner's OK)

One PR, small.

1. Migration 136 + SQL tests (D3 A only); no type changes.
2. `myOccurrences(occurrences, memberId)` in `src/lib/chore-recurrence.ts`
   beside `occurrencesForStaff`: assigned to me, or unassigned and finished
   by me; unit tests.
3. `src/components/agenda/my-tasks-card.tsx`: the card, the all-done line, the
   future-day read-only rows; owner text through `useT()`.
4. `src/components/chores/owner-finish-sheet.tsx`: Mark done, optional photos
   (reusing `PhotoPicker`, `ChoreProofPhotos` and the chore draft from
   `FinishChoreSheet`, but in the owner's language), Edit chore, Mark not
   done. `FinishChoreSheet` itself stays staff-only and unchanged.
5. `agenda-tab.tsx`: place the card; leave my chores out of the day's list
   (D1 A); update the header comment ("completing a chore is staff work").
6. Toast with Undo; the "Done by {name}, no photos" toast on a done row.
7. Glossary rows; a What's new entry (D5), in `src/lib/whats-new.ts` after
   any open PR that touches it has merged.
8. Playwright on the stub: an admin with two chores ticks one off on Today,
   sees "1 of 2 done", undoes it, finishes both, sees "Your 2 tasks are
   done"; an owner with no chores sees no card.
9. `tsc`, `next build`, CI; Codex until clean; migration local → staging →
   production with the owner's OK; merge with the owner's OK.

## Decisions for the owner

- **D1 — Where my chores show on Today.**
  **A (recommended):** a **My tasks** card above the day's list, shown only
  on days I have chores; my chores move into it and aren't repeated below.
  B: the same card, and my chores also stay in the day's list (everything in
  one place, but each of my chores shows twice). C: no card; a **Mine** pill
  added to All · Pets · Chores (no new card, but I have to tap to see them,
  and the circle to finish would have to live on the normal rows).
- **D2 — What counts as "mine".**
  **A (recommended):** chores assigned to me, plus unassigned ones I finished
  myself; unclaimed chores stay in the day's list (take one with **Who** in
  the chore form, as now). B: also every unclaimed chore, as staff phones
  show them (in a home with staff, this fills my card with the staff's
  work). C: A, plus unclaimed chores only in homes with no staff on the
  roster.
- **D3 — Photos when an admin finishes their own chore.**
  **A (recommended):** optional. One tap on the circle finishes it; photos
  can be added in the sheet (both or none). Staff still need both, always.
  Needs migration 136 (above). B: required, as for staff: the circle opens
  the sheet with the two photo steps. No database change, but every owner
  chore costs two photos. C: the owner decides per chore in the chore form
  ("Needs photos"); needs a new column and more work.
- **D4 — Finishing ahead of time.**
  **A (recommended):** only today's chores and carried-over ones can be
  finished from My tasks; future days show the rows without circles. B: any
  day, as on staff phones.
- **D5 — Tutorial.**
  **A (recommended):** one What's new card on Today, shown only to admins who
  have at least one chore assigned to them; no staff card (nothing changes
  for staff). B: shown to every owner.

## Not in this phase

- Unclaimed chores in My tasks (D2 B/C) beyond what's chosen.
- My tasks in the Week view, or reminders/push for an admin's own chores.
- Changing the staff view, `FinishChoreSheet` or Chores progress.
- Letting an admin finish someone else's chore without photos.
