# Plan — "Download my household's data" and "Delete my household" (R7)

Recommendation R7 in `docs/app-review-2026-11-07.md`. Owner asked on
2026-11-08 for the plan first, then the build if the plan holds.

Today both are an email to support@poofylabs.dev, which the privacy policy
states. That satisfies UU PDP, but it depends on us answering, and it asks a
household to trust a person instead of a button. Self-serve is better for
both sides.

## 1. What the owner sees

One new row in the Household tab, in the last group above *About Miamus*
and *Sign out*:

**Your data / Data Anda** → a page with two parts.

1. **Download a copy / Unduh salinan** — one button. It saves
   `miamus-<household>-<date>.json`: everything the household has recorded
   (section 3). On a phone that supports it, the share sheet opens (save to
   Files, send to yourself); otherwise the file downloads. A short line says
   what is and isn't inside (photos are listed by name, not included —
   section 6).
2. **Delete this household / Hapus rumah tangga ini** — red text, below a
   divider, with one sentence of what it means. Tapping opens a sheet:
   - what will be deleted (everything: pets, chores, kitchen, staff, logs,
     photos) and what won't (your Google sign-in; you can start a new
     household later);
   - "Download a copy first" as a link back to part 1;
   - **type the household's name** to confirm;
   - the red button: **Delete in 7 days / Hapus dalam 7 hari**.

   After that, every admin sees an amber row at the top of the Household tab
   ("This household will be deleted on 15 Nov · Cancel") and the other admins
   get a push. Any admin can cancel during the 7 days; the household works
   normally until then, so a copy can still be downloaded. After 7 days it is
   deleted for good.

Staff never see any of this (the Household tab is owners only, and staff
screens have no account controls).

### Who can do what

| | Founder | Other admins | Staff phones | Logged out |
| --- | --- | --- | --- | --- |
| Download a copy | Yes | Yes | No | No |
| Schedule deletion | **Yes** | Only if the household has no founder on record any more | No | No |
| Cancel a scheduled deletion | Yes | Yes | No | No |

*Founder* = `households.owner_auth_id`, the person who created the
household. This matches `remove_household_member`, which already refuses to
remove the founder: a co-admin can't take the household away from the person
who made it, and the person who made it can't be locked out of saving it.

### Why 7 days, not immediately

- Apple-like and expected (Apple and Google both delay account deletion).
- One unlocked phone or one mis-tap can't erase years of records.
- Co-admins (a spouse) hear about it and can stop it.
- Our database backups keep 7 days, so the gap until data is really gone
  is about the same either way; the delay just puts the undo in the
  owner's hands instead of a restore of the whole database.

## 2. What happens at deletion

`delete from households where id = …` and Postgres does the rest. Every
table that belongs to a household is `ON DELETE CASCADE` from `households`,
directly or through pets/items (checked 2026-11-08, migration 125):

- direct: `task_entities` (pets), `staff_profiles`, `household_members`,
  `household_tasks`, `household_locations`, `inventory_items`,
  `inventory_alerts`, `food_items`, `leave_requests`, `device_sessions`,
  `push_subscriptions`, `staff_invites`, `owner_invites`,
  `household_join_codes`, `staff_sign_in_attempts`;
- through pets: `master_schedules`, `task_logs`, `medical_records`,
  `routine_proposals`; through items: `inventory_audit_logs`.

A SQL test fails if a future table gets a `household_id` without a cascade,
so new features (Tell Kakak, Rooms) can't silently leave data behind.

**People:**

- **Admins' Google sign-ins stay.** Next time they open Miamus they land on
  "set up a household" (the middleware sends members with no household to
  onboarding). Deleting their *account* is a separate request (email today;
  see section 8).
- **Staff phones** lose their link (`device_sessions` cascade). The nightly
  `prune_unlinked_phone_sign_ins` (migration 121) then removes their
  anonymous sign-ins after 7 days unused, as it does for any unlinked phone.
- Push subscriptions go with the household.

**Photos.** Postgres can't delete files: a SQL delete on `storage.objects`
drops the catalogue row and orphans the bytes. Files must go through the
Storage API, which the nightly `prune-task-photos` Edge Function already
does for old chore photos. It gets a second, separate pass:

- `orphaned_household_photos(secret, limit)` (new SQL, secret-guarded like
  `task_photos_due_for_pruning`) lists objects in **both** buckets
  (`household-logs`, `inventory_audits`) whose folder is a household that no
  longer exists — and, as insurance, that no remaining row anywhere refers
  to. Objects with no household folder (the oldest uploads, which the
  storage policies give to household `975f0914…`) count only once that
  household is gone.
- The function removes them through the Storage API, up to 2,000 a night.

So photos are gone within about a day of the deletion (the nightly run at
03:00 WIB).

**Nothing is kept about the deleted household.** The scheduling row
cascades with the household. (Option for the owner: keep a one-line log —
household id, who asked, when — for disputes. Not built; it would need a
retention line in the policy.)

## 3. What the download contains

One JSON object, versioned (`"format": "miamus-household-export/1"`), built
by one database function so it is complete and testable:

| Key | From | Notes |
| --- | --- | --- |
| `household` | households | name, created |
| `admins` | household_members + auth.users | email, role, joined, founder? |
| `staff` | staff_profiles | name, created, archived; **never** the PIN hash or lock counters |
| `pets` | task_entities | name, type, status, details |
| `routines` | master_schedules | |
| `logs` | task_logs | with the staff name and photo file name |
| `health_records` | medical_records | |
| `routine_suggestions` | routine_proposals | |
| `chores` | household_tasks | |
| `rooms` | household_locations | |
| `supplies` | inventory_items | |
| `stock_counts` | inventory_audit_logs | |
| `shopping_list` | inventory_alerts | |
| `food` | food_items | |
| `leave` | leave_requests | |
| `linked_phones` | device_sessions | linked, last seen; no ids |
| `staff_sign_in_attempts` | staff_sign_in_attempts | 30 days' worth, as kept |
| `my_language` | user_preferences | the caller's own only |

Left out on purpose: invite links and the house code (they are keys, not
records), push subscription endpoints (device secrets), internal ids that
mean nothing outside Miamus are kept only where rows refer to each other.

## 4. Database — migration 127 (local first)

`supabase/migrations/127_household_data_rights.sql`:

- **Table `household_deletions`** — `household_id` (PK, FK households
  `ON DELETE CASCADE`), `requested_by` (FK auth.users `ON DELETE SET NULL`,
  nullable), `requested_at`, `delete_after`. RLS on, no policies; `revoke
  all … from public, anon, authenticated`. Only the functions below touch it.
- **Functions** — all `SECURITY DEFINER`, `set search_path = ''`, and per
  AGENTS.md: `revoke all on function … from public, anon;` then an explicit
  `grant execute … to authenticated` (or nothing, for the job):
  - `export_household_data() → jsonb` — admins only (a `household_members`
    row; **not** `get_user_household_ids()`, which lets staff phones in).
  - `household_deletion_status() → table(scheduled, delete_after,
    requested_by_me, can_schedule)` — admins only.
  - `schedule_household_deletion(p_confirm_name text) → timestamptz` —
    founder rule above; the typed name must match (trimmed, case-
    insensitive); calling it twice keeps the first date; queues a push to the
    other admins (`queue_owner_push`, both languages).
  - `cancel_household_deletion() → boolean` — any admin; push to the others.
  - `delete_scheduled_households() → integer` — the job. No client grant
    (only `postgres` via pg_cron).
  - `orphaned_household_photos(p_secret text, p_limit int)` — secret-guarded
    (`assert_task_photo_retention_secret`); `grant` to `service_role` only.
- **pg_cron**: `delete-scheduled-households`, hourly at :05. (Hourly so the
  date shown is the date it happens; the photos follow at the nightly run.)

**SQL tests** — `supabase/tests/127_household_data_rights.sql`, one
rolled-back transaction like `123_food_at_home.sql`:

- export: admin gets every key and their own household only; staff phone,
  other household's admin and logged-out callers are refused; no PIN hash,
  invite token or join code anywhere in the output;
- schedule: refused for staff phones, co-admins (when a founder exists),
  wrong name, other households; founder succeeds; twice keeps the date;
  co-admin succeeds when the founder is gone;
- cancel: any admin; refused for staff;
- job: deletes only households past their date; children of every kind are
  gone; the other household is untouched; the deleted household's staff
  phone loses its device session;
- photos: orphan finder lists the deleted household's objects in both
  buckets, never a live household's, never a still-referenced object, and
  refuses a wrong secret;
- grants: `anon` can execute none of the new functions; `authenticated`
  can't execute the job or the photo finder; the table is closed to clients;
- cascade guard: every FK to `households` is `ON DELETE CASCADE`.

## 5. App

- `src/components/dashboard/household-data-panel.tsx` — the page (both
  languages via `useT()`).
- `src/components/dashboard/delete-household-sheet.tsx` — the confirm sheet.
- Household tab: the *Your data* row, and the amber "will be deleted on …"
  row at the top while scheduled.
- `src/lib/household-export.ts` — call the RPC, name the file, share or
  download it.
- Edge Function `prune-task-photos`: the orphan pass (section 2).

## 6. Photos in the download — decision

Not in v1. A household can hold hundreds of MB of photos (production: ~200
MB for one household); zipping that on a phone is slow and can crash the
tab. The JSON lists every photo's file name, and the page says "Photos
aren't in this file. To get a copy, email support@poofylabs.dev." A later
version can build the archive on the server (an Edge Function writing a zip
to a short-lived private link) — that's a new moving part worth its own PR.

## 7. Privacy policy (both languages) and legal.ts

- **7. How long we keep it:** replace "If an admin asks us to delete their
  household…" with: an admin can delete the household in the app; it is
  deleted 7 days later unless an admin cancels; photos within a day after
  that; database backups up to 7 days more. Requests by email still work,
  within 30 days.
- **8. Your rights:** add that admins can download a copy and delete the
  household themselves in Household → Your data; everything else by email.
- `policyVersion` → `2026-11-08.3`, with a comment in `legal.ts`.

No new kind of data, no new provider, no new place: only how deletion and
copies are delivered.

## 8. Not in this plan

- **Deleting your own account** (the Google sign-in). Still by email; a
  local Codex branch (`codex/separate-account-deletion`) separates that
  request from Sign out. Self-serve account deletion needs the Auth admin API
  (a server route with the service key, which Vercel deliberately doesn't
  hold), so it's a separate decision.
- **Billing.** When Miamus charges, deleting a household must also cancel its
  subscription; add it then.
- Photos in the download (section 6).

## 9. Rollout (needs the owner's OK at each step)

1. Merge nothing yet. Review the screens in both languages.
2. Staging: apply 127, deploy the updated `prune-task-photos`, try a
   throwaway household end to end (schedule, cancel, schedule, run the job
   by hand, check photos the next night).
3. Production: apply 127 and deploy the Edge Function, then merge.
