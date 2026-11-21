# Photo backups

Security audit S5 (20 Nov 2026), pre-launch H3. Supabase's daily database
backups (7 days on Pro) hold only the photos' rows, not the photos: Storage
objects aren't in them, and a deleted photo was gone for good. This is the
backup, and the restore we rehearsed.

## What it does

Every night at 02:17 Jakarta time, every photo in the three photo buckets
(`household-logs`, `inventory_audits`, `owner-receipts`) that is new or
changed is copied to a private bucket in **AWS S3, Singapore
(ap-southeast-1)**. Photos Miamus deleted that day are marked deleted there.

- **Same place, same name.** A photo is kept at `<bucket>/<path>`, exactly
  its Supabase bucket and path. Rows store URLs that name the bucket and
  path (`src/lib/photos.ts`), and paths are unique and never rewritten, so a
  restore that puts the bytes back at the same path brings every row's
  photo back with no database change.
- **Versioned, 30 days.** The bucket keeps old versions. "Marked deleted"
  hides a photo but keeps it; a lifecycle rule erases it 30 days later. So
  a photo deleted by mistake can be brought back for 30 days, and a deleted
  photo usually leaves the backup about a month after it leaves Miamus. No
  fixed total is promised: AWS sets no deadline on when lifecycle deletion
  runs, and a night that holds removals back waits for a person (see
  Guards), so the month starts once they've checked. The privacy policy
  says so (`LEGAL.photoBackup` in `src/config/legal.ts`).
- **Encrypted at rest** (SSE-S3, the bucket default, and asked for on every
  upload), private (Block Public Access on), TLS in transit.
- **Stays in Singapore.** The copy runs in the `photo-backup` Supabase Edge
  Function in Singapore, beside the photos and the bucket. GitHub Actions
  only starts it each night (`.github/workflows/photo-backup.yml`), pinned to
  Singapore with `x-region`, and sees counts, never a photo or a path.
- **A manifest** of each night (what was copied, removed, held back, failed)
  is saved in the bucket under `_manifests/`. The GitHub run shows counts
  only.

## Who can do what

| Credential | Where it lives | Can | Can't |
|---|---|---|---|
| Backup reader (a Supabase account with `app_metadata.miamus_role = photo_backup_reader`, migration 179) | Edge Function secrets | read the three photo buckets | upload, move or delete a photo; read any table row |
| Backup writer (AWS IAM user, one per project) | Edge Function secrets | list the backup, add to it, mark files deleted | read it back, erase a version, change the bucket |
| Trigger secret | Edge Function secrets and the GitHub environment | start a backup run | anything else |
| Restore key (AWS IAM user) | the password manager only | list and read the backup, versions included | write anything |

Supabase has no read-only storage key (its secret key and Storage's S3 keys
can delete every photo), which is why the reader is an account limited by a
storage policy. A leaked writer key can't destroy the backup: anything it
overwrites or marks deleted stays recoverable for 30 days. Erasing a version
needs the AWS account itself (two-factor sign-in).

Nothing is in code. Nothing prints a secret or a photo path.

## Guards

The job fails the GitHub run (GitHub emails the repository's owner), and
removes nothing, when:

- a bucket reads as empty while the backup has photos from it. A reader that
  lost its permission sees an empty bucket, not an error;
- a night would remove more than 10% of the backup (above 50 photos). A
  deleted household can do that legitimately; then a person checks and runs
  the workflow by hand with **allow_mass_delete**.

Copies still go ahead in both cases. A photo that fails to copy is counted,
the run fails, and it is retried the next night.

## Running it by hand

GitHub → Actions → **Photo backup** → Run workflow: pick production or
staging; **dry_run** reports what it would do and changes nothing.

From a laptop (the local drill, or if the function is down):
`npx tsx scripts/photo-backup/backup.ts --dry-run` with the variables listed
at the top of that file. This moves photos through the laptop.

## When the backup fails

Open the failed run's summary.

- **"held back: … read as empty"**: the reader lost its permission. Check the
  account still exists and still has `miamus_role` (migration 179, owner
  steps below), and that its password in Edge Function secrets is current.
- **"held back: … would be removed (more than 10%)"**: find out why. A
  household deleted in the app? Then run the workflow by hand with
  allow_mass_delete. If you don't know why, don't; restore first.
- **"Backup reader could not sign in"**: the password changed, or Email
  sign-in is off in Supabase Authentication.
- **"Unauthorized"**: the trigger secret differs between GitHub and Supabase.
- **"Not set up: …"**: an Edge Function secret is missing.
- **photos failed to copy**: usually passing. If it repeats, run the
  workflow by hand and read the function's logs (Supabase → Edge Functions →
  photo-backup → Logs; errors there name no paths).

## Restore

`scripts/photo-backup/restore.ts`, from a laptop, with the restore key and the
target project's secret key in `~/.miamus-photo-restore.env`
(`scripts/photo-backup/env.example`). It only reports what it would do until
given `--apply`, and it leaves photos that are already there alone, so it is
safe to run again.

| To bring back | Command (add `--apply` to write) |
|---|---|
| one photo deleted by mistake | `--object household-logs/<household>/<folder>/<file> --include-deleted` |
| one household's photos | `--household <household id> --include-deleted` |
| everything, as it stood at a time | `--all --at 2026-12-01T00:00:00Z` |

**Database first.** If rows were lost too (a household deleted, a bad
migration), restore the database first (Supabase → Database → Backups, a
whole-project restore within 7 days), then the photos with `--at` set to
before the loss. A photo whose household no longer exists is removed again
by the nightly clean-up (`orphaned_household_photos`, migration 127).

### Restore drill

**Rehearsed on local (20 Nov 2026)**, `npx tsx scripts/photo-backup/rehearse-local.ts`,
with 300 photos of 185 KB in all three buckets for two made-up households:

| Step | Result | Time |
|---|---|---|
| first full backup | 300 + 13 photos copied | 2–5 s |
| next night | nothing copied (unchanged by size and MD5) | 1 s |
| one photo deleted, restored | back, same bytes | 0.5 s |
| a household's 150 photos deleted, restored | 150/150 back, byte for byte | 1–1.3 s |
| restore run again | nothing written ("already there") | |
| a night that would remove 150 of 313 | held back, run failed | |
| reader loses its role | "read as empty", nothing removed, run failed | |
| allow_mass_delete | the 150 removed | |

The Edge Function itself was served locally (`supabase functions serve`) and
driven by `trigger.mjs`: refuses a wrong secret, dry run, copy, unchanged
second night, and a backlog finished over many calls.

Local can't rehearse S3 versioning (`--at`, `--include-deleted`): the unit
tests cover which version is picked, and the **staging drill** covers AWS.

**Staging drill (once the owner steps are done; ~45 minutes):**

1. GitHub → Actions → Photo backup → Run workflow, target **staging**. It
   should end "complete".
2. In the staging app, as an owner, note one photo (a pet photo is easy to
   see), and in Supabase staging → Storage find and delete it. The app now
   shows it broken.
3. On the laptop: `npx tsx scripts/photo-backup/restore.ts --object <bucket>/<path> --include-deleted`,
   check it says "1 photos to restore", then again with `--apply`. Reload the
   app: the photo is back. Note the time.
4. Pick a test household on staging; in Storage note its photo count in each
   bucket, delete its folder in `household-logs`, run the workflow again (it
   should hold back if that's over 10%; that's the guard working), then
   `--household <id> --include-deleted --apply`. Compare counts; open a few
   in the app.
5. Write the times in this table.

**Production (every 3 months):** a dry-run restore of everything,
`--all`, without `--apply`. The count should match the photos in the run
summary. Nothing is written.

**Time estimates** for a real restore, from a laptop in Indonesia (photos
come down from S3 and go up to Supabase, so the laptop's upload speed
decides): set-up 10–15 minutes (the env file); one photo, a minute; a
household of ~1,000 photos (~185 MB), 2–5 minutes; 10,000 photos (~1.8 GB),
15–30 minutes.

## Cost

AWS S3 Standard in Singapore is about US$0.025 per GB a month (check the
pricing page). Uploads are about US$0.005 per 1,000; deletes and data coming
in are free; a restore's download is about US$0.12 per GB after AWS's free
100 GB a month. A household keeps roughly 0.3–0.6 GB of photos, plus 30 days
of deleted ones. That's under US$0.25 a month for 10 households and about
US$2 for 100. The Edge Function runs well inside Supabase Pro's included
calls.

## Set-up (owner steps, no secrets in chat)

The owner's exact steps, with the AWS policies to paste, are in the PR
description and the manager's private plan. In short:

1. AWS: an account with two-factor sign-in and a budget alert; two buckets
   in Singapore (`…-production`, `…-staging`) with versioning, SSE-S3, Block
   Public Access and the 30-day lifecycle rule; a writer user per bucket and
   one restore user.
2. Supabase, staging then production: migration 179; the reader account and
   its `miamus_role`; the Edge Function secrets; deploy `photo-backup` with
   `--no-verify-jwt`.
3. GitHub: environments `photo-backup` and `photo-backup-staging` (main
   only), each with the secret `PHOTO_BACKUP_TRIGGER_SECRET` and the variable
   `PHOTO_BACKUP_FUNCTION_URL`; after a good first run, the repository
   variable `PHOTO_BACKUP_ENABLED = true` turns on the nightly run.
