# North star measurement (Phase 172 PR 0)

Migration 142 (`supabase/migrations/142_household_setup_measurement.sql`).
Plan: `docs/phase-172-first-ten-minutes-plan.md`, section 6 (D13 A, D14 A).
Counts only, never content.

## What is measured

| Signal | Target | Read from |
| --- | --- | --- |
| **S1** first staff finish the same day | half or more of new households (the median household) same day; owner setup time under 10 minutes | `households.created_at` → the first chore or routine a staff member finished (`household_tasks.completed_by`, `task_logs.staff_id` with `complete`, or a vet visit closed: `check_out` or `admitted`; roster rows without a Google account); setup minutes from `household_setup.active_seconds` |
| **S2** typed fields to set up | 10 or fewer | `household_setup.typed_fields` (from PR A2). **Before:** rooms, chores, staff, pets and routines added in the first 14 days beyond what setup added (each one is at least one typed field) |
| **S3** due tasks closed (done or "couldn't") | 90% or more | `north_star_day(day)`: chore-days and routine slots due, the same rules as the evening summary (139); closed = done or a `task_exceptions` row **by the end of that day** in Jakarta (a chore finished the next morning doesn't count for its due day) |
| **S4** weekly active households | 70% of new households | week 4 (days 21–27): at least 3 tasks finished by staff per staff member on the roster |
| **S5** Kakak repeat use | 50% of households that tried her | 3+ `kakak_requests` with `job = 'quick'` in week 3 (days 14–20) |
| Approval wait | (none: it should go to zero with PR A1) | `household_access_requests.requested_at` → `households.created_at` |

Cohorts are **sign-up weeks** (Monday to Sunday, Jakarta). S3 is for the
calendar week across every household. A cohort counts for S2's "before" once
it is 14 days old, S5 at 21, S4 at 28.

## Where to read it

- **App:** `/dashboard/north-star`, linked from Household requests.
  Platform admins only (`platform_north_star()`, `is_platform_admin()`).
- **SQL** (the evening and Sunday reviews, read-only, as the database owner
  through the Supabase MCP `execute_sql`):

  ```sql
  select public.north_star_report(8);
  ```

  It returns JSON: `as_of`, `targets`, `summary` (the whole window, S3 for
  the last 7 ended days) and `weeks` (newest first). No names, emails or
  household ids, so it can go into the report as it is.

## The evening-review hook

Once migration 142 is on production, add this to "How it's used" in both
review prompts (`~/.claude/scheduled-tasks/miamus-evening-review/SKILL.md`
and `miamus-sunday-review/SKILL.md`). Until then the function doesn't exist
there, and the prompt says to skip it.

> **North star (S1–S5).** Run `select public.north_star_report(8);` on
> production (read-only). If the function doesn't exist yet, skip this and
> say "North star: not live yet". Otherwise add a "North star" card to the
> batch: S1 as "same day: {same_day} of {same_day_of}" plus the median
> minutes to the first staff finish and the median approval wait
> (`signup_minutes`); S2 as the median typed fields from setup (or "waiting
> for the new setup") and the "before" (`hand_items_14d`); S3 as
> closed/due for the last 7 days with the share; S4 and S5 as "{n} of
> {of}". Mark each against `targets` (on target / below / no data). Compare
> with the previous report's card and name the biggest change. Numbers only.
> The Sunday review also shows the per-week rows for the last 4 weeks.

## Limits

- **S3 counts what was due, not what was chased.** "Without chasing" can't
  be seen in the data; done or "couldn't" by the end of the day stands in.
  Weekly routines (`frequency_type = 'weekly'`) aren't counted, as Today and
  the evening summary don't expand them either.
- **Who added something by hand** isn't recorded, so S2's "before" counts
  everything added in the first 14 days (Kakak's confirmed suggestions
  included) minus what setup added.
- **Increments, not totals.** `record_household_setup()` adds what a screen
  sends; a retried call counts twice. Fine for counts.
- **Only finished setups** (`finished_at` set by Add all, the last step or
  Skip) count in the setup medians; a setup left half-way doesn't.
- **Cost.** The report reads every household's chores for each day of the
  window (8 weeks: 56 days) on every call. Fine at today's size; past a few
  hundred households, keep ended days in a small table filled nightly.
- **Two copies of the chore-day rules.** `north_star_day` repeats 139's
  `chore_days_open` rules (written days, leave that pauses). A change to one
  must be made to the other; a later migration could fold both into one
  `chore_days(day)` function. The summary and weekly figures are also
  written out twice in `north_star_report`; keep them in step.
