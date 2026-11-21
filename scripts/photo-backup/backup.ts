/**
 * The photo backup, run from a laptop: the same run as the nightly
 * photo-backup Edge Function (supabase/functions/_shared/photo-backup.ts),
 * for the local drill (rehearse-local.ts) and for a manual run if the
 * function is ever down. The nightly copy itself runs in Singapore, in the
 * Edge Function; this one moves photos through the machine it runs on.
 *
 *   npx tsx scripts/photo-backup/backup.ts             # back up
 *   npx tsx scripts/photo-backup/backup.ts --dry-run   # report only, change nothing
 *   npx tsx scripts/photo-backup/backup.ts --allow-mass-delete
 *
 * Reads as the backup reader (migrations/179: read the photo buckets, nothing
 * else) and writes with the backup writer key (add to the backup bucket and
 * mark files deleted, nothing else). Both from the environment; nothing here
 * prints them, or any photo path. Exits 1 when anything failed or removals
 * were held back.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  backupDeps,
  parseBackupArgs,
  requireEnv,
  runBackup,
  scrubError,
  type StorageLike,
} from "../../supabase/functions/_shared/photo-backup";
import { backupS3, s3Kit } from "./io";

async function main() {
  const args = parseBackupArgs(process.argv.slice(2));
  const env = requireEnv(process.env, [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "BACKUP_READER_EMAIL",
    "BACKUP_READER_PASSWORD",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
  ]);
  const s3 = backupS3(process.env, env.BACKUP_S3_ACCESS_KEY_ID, env.BACKUP_S3_SECRET_ACCESS_KEY);
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: env.BACKUP_READER_EMAIL,
    password: env.BACKUP_READER_PASSWORD,
  });
  if (error) throw new Error(`Backup reader could not sign in: ${error.message}`);

  try {
    const deps = backupDeps(supabase.storage as unknown as StorageLike, s3Kit(s3), env.BACKUP_S3_BUCKET, {
      encrypt: !process.env.BACKUP_S3_ENDPOINT,
      log: (m) => console.log(m),
    });
    const { summary } = await runBackup(deps, { dryRun: args.dryRun, allowMassDelete: args.allowMassDelete });
    writeFileSync("photo-backup-summary.json", JSON.stringify(summary, null, 2));
    if (!summary.ok) {
      console.error("PHOTO BACKUP NOT COMPLETE. Safe to run again; see docs/photo-backups.md.");
      process.exitCode = 1;
    }
  } finally {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    supabase.auth.stopAutoRefresh();
  }
}

main().catch((err) => {
  console.error(`PHOTO BACKUP FAILED: ${scrubError(String((err as Error).message ?? err))}`);
  process.exit(1);
});
