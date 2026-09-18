# PRD 01 — Household Chore Delegation

**Phase:** 82
**Status:** Implemented
**Migration:** `supabase/migrations/082_household_tasks.sql`

## Problem

Everything the app tracks today hangs off a dog. `master_schedules` rows need an
`entity_id`, and the agenda engine turns them into a per-pet feed — which is the
right shape for meals, potty breaks and medication, and the wrong shape for
"mop the terrace" or "buy a new gas canister". Those jobs exist, they get asked
for over WhatsApp, and the app has no record that they were asked for or done.

## Scope

Introduce a `household_tasks` table and build the two views that sit on it:

- An interactive **chore delegation panel** in the Owner Dashboard's Household
  module, alongside the existing Master Inventory.
- A streamlined **task checklist** ("Tugas Rumah") in the Staff View, under the
  pet agenda.

Out of scope: recurrence. A chore is one row for one day. If a chore repeats,
the owner files it again — the same call the app already makes for ad-hoc pet
routines, and cheaper than a second scheduling engine.

## Data model

One row per chore, per day. See the migration for column-level notes.

| Column | Meaning |
| --- | --- |
| `title` | What to do, free text. |
| `notes` | Optional detail the owner wants carried across. |
| `category` | `cleaning` \| `maintenance` \| `errand` \| `groceries` |
| `assigned_to` | `staff_profiles.id`, or `null` for "anyone". |
| `due_date` | The day the chore belongs to. Drives both views' filters. |
| `due_time` | Optional `HH:mm`. Null means "sometime today". |
| `status` | `pending` \| `completed` \| `cancelled` |
| `completed_by` | Who actually did it — not necessarily `assigned_to`. |
| `completed_at` | When. |
| `photo_url` | Proof photo in the `household-logs` bucket. |

`assigned_to` and `completed_by` are both nullable and both
`on delete set null`, so removing a staff member keeps the history readable
rather than deleting a month of chores with them.

## Owner scope (English)

- View the selected date's chores, split into **Pending** and **Completed**.
- Create a chore with a title, a category, an optional assignee (a specific
  staff member or Unassigned) and an optional time.
- Category badges carry an icon so the list is scannable without reading:
  `Sparkles` cleaning, `Wrench` maintenance, `ClipboardList` errand,
  `ShoppingBag` groceries.
- Assignee badge shows the staff name, or "Unassigned".
- A completed chore shows who completed it and a thumbnail of the proof photo,
  tappable into the shared lightbox.

## Staff scope (Indonesian)

- The feed shows only what is this person's business: chores where
  `assigned_to` is their own `staff_id`, plus every unassigned chore
  ("Semua Petugas").
- **Unassigned →** "Ambil Tugas" claims it, writing `assigned_to` to the
  device's active `staff_id`. It then behaves as an assigned chore.
- **Assigned to me →** "Selesaikan" opens a photo-capture sheet. The photo
  uploads to Supabase Storage first; only then does the row flip to
  `status = 'completed'` with `completed_by` and `completed_at` stamped.
  A chore cannot be closed without the photo — the proof *is* the completion.
- Completed chores stay visible for the rest of the day, greyed, so the person
  can see what they have already cleared.

## Behaviour notes

- Chores are fetched for the browsed date only, not in bulk: the table grows
  without bound over months and no view ever wants more than one day of it.
  `refresh()` refetches them for whatever day is on screen, so pull-to-refresh
  and the reconnect sync both pick up chores the owner added from their phone.
- A missing table degrades to an empty list rather than taking the dashboard
  down with it, matching how `routine_proposals` (Phase 46) and
  `inventory_items` (Phase 60) handle a migration that has not been run yet.
- `cancelled` exists in the status vocabulary and is written by nothing yet.
  It is here so retiring a chore later does not need a migration.
