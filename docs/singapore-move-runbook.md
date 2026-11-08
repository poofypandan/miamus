# Moving production from Tokyo to Singapore — runbook

Owner asked on 2026-11-08: "move production to Singapore now if possible."
Supabase can't change a project's region, so the move is: a new project in
Singapore, a copy of everything, then the app switches to it. This file is
the order of work, who does what, and how to undo it.

## What happened on 2026-11-08

The move was done on 2026-11-08 between 11:20 and 11:45 WIB. Differences from
the plan below, so the next move can start from here:

- **No passwords were needed.** The Supabase CLI (signed in to the owner's
  account) dumps with `--remote=<ref>` and runs SQL with
  `supabase db query --remote=<ref> -f file --yes` through a temporary login
  role. `~/.miamus-move.env` was not used. Data was dumped as `INSERT`s (not
  `--use-copy`), because `db query` cannot stream `COPY`.
- **Grants are not restored by the dump.** The new project starts with
  Supabase's default grants (everything executable by `anon` and
  `authenticated`). Tokyo's exact ACLs were generated from its catalog
  (functions, tables, sequences, columns) and replayed; then 1,974
  role/privilege checks were compared and matched. Do this on every move.
- **Storage policies** are not in the schema dump; they were recreated from
  Tokyo's `pg_policies` (5 on `storage.objects`).
- **VAPID keys:** the CLI role cannot decrypt Vault, so Singapore got new
  keys and `push_subscriptions` was emptied; owners re-enable notifications.
- **Photos:** `4-copy-photos.mjs`, with each project's secret key fetched by
  the CLI inside the same command (never printed).
- **Old address not forwarded yet** (Codex): a phone on `miamus.vercel.app`
  may still hold unsent logs; that address serves the Singapore build, so
  they still arrive.
- Making Tokyo read-only for the API was tried and blocked by a safety
  check; low risk, since everyone signed in again on the new build.

## What production holds (checked 2026-11-08, structure only)

| Piece | Size / list | How it moves |
| --- | --- | --- |
| Database | 20 MB, 24 public tables, migrations through 125 | `pg_dump` → `psql` (schema + data, auth included) |
| Sign-ins | 9 accounts (owners, staff phones) | In the data dump (`auth` schema) |
| Photos | ~1,450 objects, ~200 MB, buckets `household-logs`, `inventory_audits` (both private) | Copy script, same bucket and path |
| Vault secrets | `project_url`, `push_dispatch_secret`, `push_vapid_private_key`, `push_vapid_public_key`, `push_vapid_subject`, `task_photo_retention_secret` | Re-created (vault encryption is per project) |
| Nightly jobs | `notify-food-expiring`, `prune-finished-food`, `prune-household-access-requests`, `prune-staff-sign-in-attempts`, `prune-task-photos`, `prune-unlinked-phone-sign-ins` | Re-scheduled from the migrations |
| Server functions | `send-push`, `prune-task-photos` (no custom secrets: only `SUPABASE_URL` and the service key, which Supabase provides) | Deployed from `supabase/functions/` |
| Extensions | pg_cron, pg_net, pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp | Enabled before the schema restore |

Things that **don't** need changing:

- **Photo links in the data.** They hold the old `…supabase.co` address, but
  the app (`src/lib/photos.ts`) and the SQL (`photo_object_ref`) read only the
  bucket and path, and photos are served through `/api/photo` from the
  current project.
- **App code.** Sign-in redirects use the page's own address. Vercel holds
  only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, both
  public, so no secret key passes through Vercel.

## Who does what

Owner (about 20 minutes, spread out): approve creating the project, keep its
database password in Bitwarden, put both connection strings in a local file
(never in chat), paste the Google sign-in secret into the new project, add
the new sign-in address in Google Cloud, and re-sign-in on the phones.

Claude: everything else, with each production step announced first.

## Scripts

`scripts/singapore-move/` does the copying. Each script reads
`~/.miamus-move.env` (from `env.example`; passwords and keys stay in that
file, `chmod 600`), never prints a secret, and writes the dump to
`~/.miamus-move/`, outside the repo:

| Script | Step |
| --- | --- |
| `1-dump.sh` | 8. Dump Tokyo: roles, schema, data (not photos, Vault or sessions) |
| `2-restore.sh` | 9. Restore into Singapore in one transaction, triggers off |
| `3-vault-and-cron.sh` | 10–11. Vault secrets (VAPID copied, others new) and the nightly jobs |
| `4-copy-photos.mjs` | 12. Photos through the Storage API, same paths; `--check` compares only |
| `5-compare.sh` | 13. Row counts, sign-ins, photos, jobs, secrets: Tokyo vs Singapore |
| `9-cleanup.sh` | After the move is confirmed: delete the dump and the connection file |

## A. Before the switch (no downtime; can be done any day)

1. **Create the project:** poofypandan org (Pro), name `Miamus`, region
   **Southeast Asia (Singapore)**, smallest compute. Pro's included credit
   covers one project; the week both run costs a few dollars.
2. **Connection strings:** the owner creates `~/.miamus-move.env`
   (`chmod 600`) with `OLD_DB_URL=…` and `NEW_DB_URL=…` (session pooler or
   direct, with passwords) and `OLD_SERVICE_KEY` / `NEW_SERVICE_KEY` for the
   photo copy. Scripts read the file; nothing is printed.
3. **Sign-in settings on the new project**
   (Authentication → URL Configuration / Providers / Sign In):
   - Site URL `https://miamus.app`; redirect URLs
     `https://miamus.app/auth/callback` (and the vercel.app one until the old
     address is retired).
   - Anonymous sign-ins **on** (staff phones).
   - Google provider: the same client ID; the owner pastes the client secret.
   - Google Cloud Console → the OAuth client → add
     `https://<new-ref>.supabase.co/auth/v1/callback`.
   - Compare the remaining Auth settings with production (session length,
     rate limits, attack protection) and copy any that differ.
4. **Extensions** enabled to match the list above.
5. **Server functions** deployed: `send-push`, `prune-task-photos`
   (`verify_jwt` off on both, as on production).
6. **Dry run:** restore a copy of production into the new project, run the
   SQL test files there (read-only checks plus rolled-back transactions),
   then wipe it again (`drop schema public cascade` + auth/storage rows) so
   the real switch starts clean. Optional; recommended.

## B. The switch (about 30–45 minutes; nobody uses Miamus)

7. **Tell the household:** "Miamus is updating for half an hour; please don't
   log anything."
8. **Dump** from Tokyo (Supabase CLI 3.x):
   `supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only`,
   `-f schema.sql`, and `-f data.sql --use-copy --data-only`.
9. **Restore** into Singapore in one transaction:
   `psql "$NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f roles.sql -f schema.sql -c "set session_replication_role = replica" -f data.sql`.
10. **Vault:** delete the restored (undecryptable) rows, then re-create:
    `project_url` = the new project's URL; the three `push_vapid_*` values
    copied from Tokyo by a script that pipes them without printing, so
    existing push subscriptions keep working; `push_dispatch_secret` and
    `task_photo_retention_secret` = new random values.
11. **Nightly jobs:** check `cron.job`; re-run the six `cron.schedule` calls
    from migrations 102, 113, 115, 121, 123, 124 if any are missing.
12. **Photos:** copy every object in both buckets, same paths; compare
    counts and total size with Tokyo.
13. **Checks on the new project:** row counts per table equal to Tokyo; the
    security and performance advisors show nothing new; migrations list
    ends at 125; `get_push_public_key()` returns the same key as Tokyo.
14. **Point the app at Singapore:** in Vercel, set
    `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production)
    to the new project's values.
15. **Merge the Singapore PR** (privacy policy: data in Singapore). The
    deploy picks up the new variables. Set the policy's effective date to the
    day of the move first.
16. **Retire the old address:** Vercel → Domains → `miamus.vercel.app` →
    redirect (308) to `miamus.app`.

## C. Right after

17. **Sign in again:** everyone, once. Owners: Continue with Google on
    miamus.app. Staff: open miamus.app → **Saya staf** → house code + their
    PIN (both copied over). On iPhone, add miamus.app to the Home Screen
    again and delete the old icon.
18. **Verify:** owner sign-in, a staff log with a photo, an old photo
    showing, Food at home, a test push (Access → notifications), and the
    next morning the 07:00 food reminder and the 03:00 clean-ups ran
    (`cron.job_run_details`).
19. **Records:** update `docs/handoff-2026-11-07.md` (project ref and
    region), the memory files, and the Supabase project id used by tools.

## Undo

- **Within the first hour:** set the two Vercel variables back to Tokyo and
  redeploy. Anything logged in Singapore since the switch is lost (so keep
  the window short and quiet).
- **Tokyo stays untouched for 7 days** as a fallback, then is deleted with
  the owner's OK. Its daily backups stay restorable until then.
